"""
MarketLens API Lambda — REST endpoints for reports.

Auth context is injected by the Lambda Authorizer via requestContext.
All DynamoDB queries are scoped to ORG#{org_id}.

Mixed mode:
  - Anonymous users: can create 1 report (stored under ORG#anonymous)
  - Authenticated users: 3 reports/day (free tier)
"""
import os
import json
import re
import boto3
from botocore.exceptions import ClientError
from uuid import uuid4
from datetime import datetime, timedelta, timezone

from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()
tracer = Tracer()
metrics = Metrics()
app = APIGatewayRestResolver(strip_prefixes=["/api"])

_REPORT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,80}$")
_MAX_IDEA_LEN = 2000
FREE_TIER_DAILY_LIMIT = 3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["REPORTS_TABLE"])
lambda_client = boto3.client("lambda")
AI_FUNCTION_NAME = os.environ.get("AI_FUNCTION_NAME", "")


def _get_auth_context(event=None) -> dict:
    """Extract auth context injected by the Lambda Authorizer."""
    raw_event = app.current_event.raw_event if event is None else event
    authorizer = (
        raw_event.get("requestContext", {})
        .get("authorizer", {})
    )
    return {
        "user_id": authorizer.get("user_id", "anonymous"),
        "org_id": authorizer.get("org_id", "anonymous"),
        "is_authenticated": authorizer.get("is_authenticated", "false") == "true",
        "plan": authorizer.get("plan", "free"),
        "email": authorizer.get("email", ""),
    }


def _atomic_check_and_increment(auth: dict) -> str | None:
    """Atomically check rate limit and increment counter.

    Uses a conditional UpdateItem so two concurrent requests cannot both pass.
    Returns error message if rate limited, None if allowed.
    Sign-in is required — anonymous requests are blocked by the authorizer.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if not auth["is_authenticated"]:
        return "Sign in to run analyses."

    # Plan-based daily limits
    plan = auth.get("plan", "free")
    plan_limits = {
        "free": FREE_TIER_DAILY_LIMIT,
        "pro": 15,
        "team": 50,
        "admin": 9999,
    }
    daily_limit = plan_limits.get(plan, FREE_TIER_DAILY_LIMIT)

    # Atomic check-and-increment on user record
    user_pk = f"USER#{auth['user_id']}"
    try:
        # Attempt to increment, but only if under the daily limit.
        # If report_count_date != today, reset to 1 (new day).
        # If report_count_date == today, increment only if < limit.
        try:
            # Case 1: Same day — increment if under limit
            table.update_item(
                Key={"pk": user_pk, "sk": user_pk},
                UpdateExpression="SET report_count_today = report_count_today + :one",
                ConditionExpression="report_count_date = :today AND report_count_today < :limit",
                ExpressionAttributeValues={
                    ":one": 1,
                    ":today": today,
                    ":limit": daily_limit,
                },
            )
            return None
        except ClientError as e:
            if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise

            # Condition failed — either new day or limit reached.
            # Try resetting for new day.
            try:
                table.update_item(
                    Key={"pk": user_pk, "sk": user_pk},
                    UpdateExpression="SET report_count_today = :one, report_count_date = :today",
                    ConditionExpression="report_count_date <> :today",
                    ExpressionAttributeValues={
                        ":one": 1,
                        ":today": today,
                    },
                )
                return None
            except ClientError as e2:
                if e2.response["Error"]["Code"] == "ConditionalCheckFailedException":
                    # Same day AND limit reached
                    return f"Daily limit reached ({daily_limit} reports/day on your plan)."
                raise
    except Exception as e:
        logger.warning("Rate limit check failed", extra={"error": str(e)})
        # Fail open
        return None


@app.get("/reports")
@tracer.capture_method
def list_reports():
    """List reports scoped to the user's org. Free tier sees last 7 days only."""
    auth = _get_auth_context()
    org_id = auth["org_id"]

    if not auth["is_authenticated"]:
        return {"reports": []}

    plan = auth.get("plan", "free")

    query_params = {
        "IndexName": "gsi1",
        "KeyConditionExpression": "gsi1pk = :pk",
        "FilterExpression": "#s <> :deleted",
        "ExpressionAttributeNames": {"#s": "status"},
        "ExpressionAttributeValues": {
            ":pk": f"ORG#{org_id}#REPORTS",
            ":deleted": "deleted",
        },
        "ScanIndexForward": False,
    }

    # Free tier: limit to last 7 days via sort key range on gsi1sk (ISO timestamp)
    if plan == "free":
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        query_params["KeyConditionExpression"] = "gsi1pk = :pk AND gsi1sk >= :cutoff"
        query_params["ExpressionAttributeValues"][":cutoff"] = cutoff

    # Paginate until all results are fetched
    reports = []
    while True:
        result = table.query(**query_params)
        reports.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break
        query_params["ExclusiveStartKey"] = last_key

    # Add metadata so frontend knows if history is truncated
    return {
        "reports": reports,
        "history_limited": plan == "free",
    }


@app.post("/reports")
@tracer.capture_method
def create_report():
    """Create a new report from a business idea."""
    auth = _get_auth_context()
    org_id = auth["org_id"]

    body = app.current_event.json_body
    if not isinstance(body, dict):
        return {"error": "Request body must be a JSON object"}, 400
    idea_text = (body.get("idea_text") or "").strip()

    if not idea_text or len(idea_text) < 5:
        return {"error": "idea_text must be at least 5 characters"}, 400
    if len(idea_text) > _MAX_IDEA_LEN:
        idea_text = idea_text[:_MAX_IDEA_LEN]

    # Atomic rate limit check + increment
    rate_error = _atomic_check_and_increment(auth)
    if rate_error:
        return {"error": rate_error, "code": "RATE_LIMITED"}, 429

    report_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    item = {
        "pk": f"ORG#{org_id}#REPORT#{report_id}",
        "sk": f"REPORT#{report_id}",
        "gsi1pk": f"ORG#{org_id}#REPORTS",
        "gsi1sk": now,
        "report_id": report_id,
        "org_id": org_id,
        "user_id": auth["user_id"],
        "idea_text": idea_text,
        "status": "pending",
        "created_at": now,
    }
    table.put_item(Item=item)

    logger.info("Report created", extra={"report_id": report_id, "org_id": org_id, "user_id": auth["user_id"]})

    # Invoke AI Orchestration Lambda asynchronously (durable execution)
    if AI_FUNCTION_NAME:
        try:
            lambda_client.invoke(
                FunctionName=AI_FUNCTION_NAME,
                InvocationType="Event",
                Payload=json.dumps({
                    "report_id": report_id,
                    "idea_text": idea_text,
                    "org_id": org_id,
                }),
            )
            table.update_item(
                Key={"pk": f"ORG#{org_id}#REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
                UpdateExpression="SET invoke_status = :s",
                ExpressionAttributeValues={":s": "invoked"},
            )
            logger.info("AI pipeline triggered", extra={"report_id": report_id})
        except Exception as e:
            logger.error("AI invoke failed", extra={"report_id": report_id, "error": str(e)})
            table.update_item(
                Key={"pk": f"ORG#{org_id}#REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
                UpdateExpression="SET invoke_status = :s, invocation_failure = :m",
                ExpressionAttributeValues={
                    ":s": "failed",
                    ":m": str(e),
                },
            )

    return {"report_id": report_id, "status": "pending"}, 201


@app.get("/reports/<report_id>")
@tracer.capture_method
def get_report(report_id: str):
    """Get a single report by ID, scoped to the user's org."""
    if not _REPORT_ID_RE.match(report_id):
        return {"error": "Invalid report_id"}, 400

    auth = _get_auth_context()
    org_id = auth["org_id"]

    result = table.get_item(
        Key={"pk": f"ORG#{org_id}#REPORT#{report_id}", "sk": f"REPORT#{report_id}"}
    )
    item = result.get("Item")

    if not item or item.get("status") == "deleted":
        return {"error": "Report not found"}, 404

    return item


@app.delete("/reports/<report_id>")
@tracer.capture_method
def delete_report(report_id: str):
    """Soft-delete a report, scoped to the user's org."""
    if not _REPORT_ID_RE.match(report_id):
        return {"error": "Invalid report_id"}, 400

    auth = _get_auth_context()
    org_id = auth["org_id"]

    try:
        table.update_item(
            Key={"pk": f"ORG#{org_id}#REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
            UpdateExpression="SET #s = :status, deleted_at = :now",
            ConditionExpression="attribute_exists(pk)",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":status": "deleted",
                ":now": datetime.now(timezone.utc).isoformat(),
            },
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return {"error": "Report not found"}, 404
        raise
    return {"message": "Report deleted"}, 200


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok"}


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
