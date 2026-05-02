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
from datetime import datetime, timezone

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
ANONYMOUS_LIMIT = 1

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["REPORTS_TABLE"])
lambda_client = boto3.client("lambda")
AI_FUNCTION_NAME = os.environ.get("AI_FUNCTION_NAME", "")


def _get_auth_context(event=None) -> dict:
    """Extract auth context injected by the Lambda Authorizer."""
    raw_event = app.current_event._data if event is None else event
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


def _check_rate_limit(auth: dict) -> str | None:
    """Check daily report creation limit. Returns error message or None."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if not auth["is_authenticated"]:
        # Anonymous: check how many reports exist under ORG#anonymous
        result = table.query(
            IndexName="gsi1",
            KeyConditionExpression="gsi1pk = :pk",
            ExpressionAttributeValues={":pk": "ORG#anonymous#REPORTS"},
            Select="COUNT",
        )
        if result.get("Count", 0) >= ANONYMOUS_LIMIT:
            return "Sign up for a free account to run more analyses."
        return None

    # Authenticated: check daily count from user record
    user_pk = f"USER#{auth['user_id']}"
    try:
        result = table.get_item(Key={"pk": user_pk, "sk": user_pk})
        user = result.get("Item", {})
        count_date = user.get("report_count_date", "")
        count = int(user.get("report_count_today", 0))

        if count_date != today:
            # New day — reset counter
            count = 0

        if count >= FREE_TIER_DAILY_LIMIT:
            return f"Daily limit reached ({FREE_TIER_DAILY_LIMIT} reports/day on free tier)."
    except Exception as e:
        logger.warning("Rate limit check failed", extra={"error": str(e)})
        # Fail open — allow the request
    return None


def _increment_report_count(auth: dict):
    """Increment the daily report counter for authenticated users."""
    if not auth["is_authenticated"]:
        return
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    user_pk = f"USER#{auth['user_id']}"
    try:
        table.update_item(
            Key={"pk": user_pk, "sk": user_pk},
            UpdateExpression="SET report_count_today = if_not_exists(report_count_today, :zero) + :one, report_count_date = :today",
            ExpressionAttributeValues={
                ":zero": 0,
                ":one": 1,
                ":today": today,
            },
        )
    except Exception as e:
        logger.warning("Failed to increment report count", extra={"error": str(e)})


@app.get("/reports")
@tracer.capture_method
def list_reports():
    """List reports scoped to the user's org."""
    auth = _get_auth_context()
    org_id = auth["org_id"]

    if not auth["is_authenticated"]:
        return {"reports": []}

    result = table.query(
        IndexName="gsi1",
        KeyConditionExpression="gsi1pk = :pk",
        ExpressionAttributeValues={":pk": f"ORG#{org_id}#REPORTS"},
        ScanIndexForward=False,
    )
    reports = result.get("Items", [])
    return {"reports": reports}


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

    # Rate limit check
    rate_error = _check_rate_limit(auth)
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

    # Increment daily counter
    _increment_report_count(auth)

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

    if not item:
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
