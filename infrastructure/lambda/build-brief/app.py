"""Build Brief routes — generate + fetch the Pro Build Brief for a report.

Behind the existing API Gateway + authorizer:
  GET  /api/reports/{report_id}/build-brief  -> stored brief or nulls
  POST /api/reports/{report_id}/build-brief  -> generate-once, store, return

Paid-gated (pro/max/admin). Report must be complete (result_json present).
POST is idempotent: a stored brief is returned instead of re-generating."""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.utilities.typing import LambdaContext

import llm
import prompt as prompt_mod

logger = Logger()
tracer = Tracer()
metrics = Metrics()
app = APIGatewayRestResolver(strip_prefixes=["/api"])

_REPORT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,80}$")
_PAID_PLANS = {"pro", "max", "admin"}

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["REPORTS_TABLE"])
MODEL_ID = os.environ["BEDROCK_MODEL_ID_BUILD_BRIEF"]


def _auth() -> dict:
    raw = app.current_event.raw_event
    authorizer = raw.get("requestContext", {}).get("authorizer", {}) or {}
    return {
        "user_id": authorizer.get("user_id", "anonymous"),
        "org_id": authorizer.get("org_id", "anonymous"),
        "is_authenticated": authorizer.get("is_authenticated", "false") == "true",
        "plan": authorizer.get("plan", "free"),
    }


def _fresh_plan(user_id: str, fallback: str) -> str:
    """Resolve plan from the USER# row; the authorizer plan can be ~5min stale."""
    try:
        row = (
            table.get_item(
                Key={"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"},
                ConsistentRead=True,
                ProjectionExpression="#p",
                ExpressionAttributeNames={"#p": "plan"},
            ).get("Item")
            or {}
        )
        return row.get("plan") or fallback
    except ClientError:
        return fallback


def _get_report(
    org_id: str, report_id: str, consistent_read: bool = False
) -> dict | None:
    item = table.get_item(
        Key={"pk": f"ORG#{org_id}#REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
        ConsistentRead=consistent_read,
    ).get("Item")
    if not item or item.get("status") == "deleted":
        return None
    return item


def _gate(report_id: str):
    """Shared precondition checks. Returns (auth, error_tuple). error_tuple is
    None when the caller is an authenticated paid user."""
    if not _REPORT_ID_RE.match(report_id):
        return None, ({"error": "Invalid report_id"}, 400)
    auth = _auth()
    if not auth["is_authenticated"]:
        return auth, ({"error": "Authentication required"}, 401)
    # Resolve the accurate plan once and stash it so metric dimensions downstream
    # reflect the real tier (not the stale authorizer snapshot).
    auth["plan"] = _fresh_plan(auth["user_id"], auth["plan"])
    if auth["plan"] not in _PAID_PLANS:
        return auth, (
            {"error": "Build Brief is a Pro feature", "code": "upgrade_required"},
            403,
        )
    return auth, None


@app.get("/reports/<report_id>/build-brief")
@tracer.capture_method
def get_brief(report_id: str):
    auth, err = _gate(report_id)
    if err:
        return err
    report = _get_report(auth["org_id"], report_id)
    if report is None:
        return {"error": "Report not found"}, 404
    return {
        "build_brief_json": report.get("build_brief_json"),
        "build_brief_generated_at": report.get("build_brief_generated_at"),
    }


@app.post("/reports/<report_id>/build-brief")
@tracer.capture_method
def generate_brief(report_id: str):
    auth, err = _gate(report_id)
    if err:
        return err
    # Strongly-consistent read so the idempotency check reflects a brief stored
    # moments ago by a concurrent request — avoids a redundant model call.
    report = _get_report(auth["org_id"], report_id, consistent_read=True)
    if report is None:
        return {"error": "Report not found"}, 404

    # Idempotent — never re-spend on a brief we already have.
    if report.get("build_brief_json"):
        return {
            "build_brief_json": report["build_brief_json"],
            "build_brief_generated_at": report.get("build_brief_generated_at"),
        }

    result_json = report.get("result_json")
    if report.get("status") != "complete" or not result_json:
        return {"error": "Report is not complete yet", "code": "not_ready"}, 409

    try:
        raw = llm.call_llm(
            prompt_mod.build_prompt(report.get("idea_text", ""), result_json),
            model_id=MODEL_ID,
        )
        brief_json = prompt_mod.parse_and_validate(raw)
    except Exception as e:
        logger.exception(
            "Build Brief generation failed",
            extra={"report_id": report_id, "error": str(e)},
        )
        metrics.add_dimension(name="plan", value=auth["plan"])
        metrics.add_metric(name="BuildBriefFailed", unit=MetricUnit.Count, value=1)
        return {"error": "Could not generate the brief. Try again."}, 502

    generated_at = datetime.now(timezone.utc).isoformat()
    try:
        table.update_item(
            Key={
                "pk": f"ORG#{auth['org_id']}#REPORT#{report_id}",
                "sk": f"REPORT#{report_id}",
            },
            UpdateExpression="SET build_brief_json = :b, build_brief_generated_at = :t",
            # attribute_not_exists(build_brief_json) makes generation idempotent
            # under concurrent POSTs: the first write wins; a racing second write
            # fails the condition and returns the winner's brief below.
            ConditionExpression="attribute_exists(pk) AND attribute_not_exists(build_brief_json)",
            ExpressionAttributeValues={":b": brief_json, ":t": generated_at},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            # Either the report vanished, or a concurrent request already stored a
            # brief. Read fresh (ConsistentRead) to tell them apart: if a brief is
            # present, return that winner; otherwise the report is gone (404).
            existing = table.get_item(
                Key={
                    "pk": f"ORG#{auth['org_id']}#REPORT#{report_id}",
                    "sk": f"REPORT#{report_id}",
                },
                ConsistentRead=True,
                ProjectionExpression="build_brief_json, build_brief_generated_at",
            ).get("Item")
            if existing and existing.get("build_brief_json"):
                return {
                    "build_brief_json": existing["build_brief_json"],
                    "build_brief_generated_at": existing.get(
                        "build_brief_generated_at"
                    ),
                }
            return {"error": "Report not found"}, 404
        raise

    logger.info("Build Brief generated", extra={"report_id": report_id})
    metrics.add_dimension(name="plan", value=auth["plan"])
    metrics.add_metadata(key="tech_dominant", value=str(brief_json["is_tech_dominant"]))
    metrics.add_metric(name="BuildBriefGenerated", unit=MetricUnit.Count, value=1)
    return {"build_brief_json": brief_json, "build_brief_generated_at": generated_at}


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
