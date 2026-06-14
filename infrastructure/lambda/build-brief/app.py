"""Build Brief routes — generate + fetch the Pro Build Brief for a report.

Behind the existing API Gateway + authorizer:
  GET  /api/reports/{report_id}/build-brief  -> stored brief or nulls
  POST /api/reports/{report_id}/build-brief  -> generate-once, store, return

Pro feature; **free users get a small daily allowance** (env
`FREE_BUILD_BRIEF_DAILY_LIMIT`, default 3) tracked by `free_brief_count_today`
+ `free_brief_count_date` on the USER# row, reset daily (UTC). This is a
temporary beta setting — the long-term product spec is one lifetime sample;
see CLAUDE.md. Report must be complete (result_json present).
POST is idempotent: a stored brief is returned instead of re-generating."""

from __future__ import annotations

import os
import re
import time
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

# Temporary beta setting: free users get this many Build Briefs per day (UTC),
# instead of the long-term one-lifetime-sample. Revert by lowering this env /
# reverting this commit. Mirrors Muse's MUSE_FREE_DAILY_LIMIT (code default).
_FREE_DAILY_LIMIT = int(os.environ.get("FREE_BUILD_BRIEF_DAILY_LIMIT", "3"))

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["REPORTS_TABLE"])
MODEL_ID = os.environ["BEDROCK_MODEL_ID_BUILD_BRIEF"]


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


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


def _free_brief_used(user_id: str) -> bool:
    """Has this free user spent today's full allowance (_FREE_DAILY_LIMIT)?
    The counter resets daily (UTC): a date that isn't today reads as 0 used."""
    try:
        row = (
            table.get_item(
                Key={"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"},
                ConsistentRead=True,
                ProjectionExpression="free_brief_count_today, free_brief_count_date",
            ).get("Item")
            or {}
        )
    except ClientError:
        # On read failure, fail CLOSED (treat as exhausted) so we never over-grant.
        return True
    if row.get("free_brief_count_date") != _today_utc():
        return False
    try:
        return int(row.get("free_brief_count_today", 0)) >= _FREE_DAILY_LIMIT
    except (TypeError, ValueError):
        return False


def _reserve_free_brief(user_id: str) -> bool:
    """Atomically consume one of today's free briefs. Returns True if a slot was
    reserved, False if today's limit (_FREE_DAILY_LIMIT) is already reached.
    Conditional writes prevent a free user racing multiple reports past the cap;
    the counter resets daily (UTC). Mirrors Muse's increment_muse_daily_count:
    same-day fast path, then new-day reset, then a single retry for the race."""
    today = _today_utc()
    key = {"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"}
    vals = {":one": 1, ":today": today, ":limit": _FREE_DAILY_LIMIT}
    same_day = (
        "SET free_brief_count_today = free_brief_count_today + :one",
        "free_brief_count_date = :today AND free_brief_count_today < :limit",
    )
    # (a) Same-day path: increment only while still under today's limit.
    try:
        table.update_item(
            Key=key,
            UpdateExpression=same_day[0],
            ConditionExpression=same_day[1],
            ExpressionAttributeValues=vals,
        )
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise  # fail-closed on unexpected errors: never over-grant
    # (b) New-day path (or first-ever): reset to 1 and stamp today.
    try:
        table.update_item(
            Key=key,
            UpdateExpression="SET free_brief_count_today = :one, free_brief_count_date = :today",
            ConditionExpression=(
                "attribute_not_exists(free_brief_count_date) "
                "OR free_brief_count_date <> :today"
            ),
            ExpressionAttributeValues={":one": 1, ":today": today},
        )
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
    # (c) A concurrent new-day reset landed between (a) and (b). Retry same-day
    #     once; a ConditionalCheckFailed now means today's limit is truly reached.
    try:
        table.update_item(
            Key=key,
            UpdateExpression=same_day[0],
            ConditionExpression=same_day[1],
            ExpressionAttributeValues=vals,
        )
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def _release_free_brief(user_id: str) -> None:
    """Give a slot back (generation failed after we reserved it). Only decrements
    if the counter still belongs to today and is above zero — a rollover to a new
    day or a zeroed count is a no-op, not an error.

    Bounded retry (botocore already retries transient throttles beneath this);
    on persistent failure emit a metric + error log so the lost slot is alarmable
    and can be reconciled. A dedicated reconciliation queue/table is out of scope
    here — disproportionate for a daily free-allowance counter."""
    today = _today_utc()
    for attempt in range(3):
        try:
            table.update_item(
                Key={"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"},
                UpdateExpression="SET free_brief_count_today = free_brief_count_today - :one",
                ConditionExpression=(
                    "free_brief_count_date = :today AND free_brief_count_today > :zero"
                ),
                ExpressionAttributeValues={":one": 1, ":today": today, ":zero": 0},
            )
            return
        except ClientError as e:
            # Nothing to release (new day, or already 0) — expected, not a failure.
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return
            if attempt < 2:
                time.sleep(0.1 * (2**attempt))
                continue
            logger.error(
                "Failed to release free build-brief slot after retries",
                extra={"user_id": user_id},
            )
            metrics.add_metric(
                name="BuildBriefSampleReleaseFailed",
                unit=MetricUnit.Count,
                value=1,
            )


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
    """Auth + report-id precondition. Resolves the accurate plan onto auth.
    Does NOT block free users — the paid/taste decision happens per-route."""
    if not _REPORT_ID_RE.match(report_id):
        return None, ({"error": "Invalid report_id"}, 400)
    auth = _auth()
    if not auth["is_authenticated"]:
        return auth, ({"error": "Authentication required"}, 401)
    auth["plan"] = _fresh_plan(auth["user_id"], auth["plan"])
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
    free_used = auth["plan"] not in _PAID_PLANS and _free_brief_used(auth["user_id"])
    return {
        "build_brief_json": report.get("build_brief_json"),
        "build_brief_generated_at": report.get("build_brief_generated_at"),
        "free_brief_used": free_used,
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

    # --- Generation gate: paid proceeds; free reserves one of today's allowance ---
    is_paid = auth["plan"] in _PAID_PLANS
    reserved_free = False
    if not is_paid:
        reserved_free = _reserve_free_brief(auth["user_id"])
        if not reserved_free:
            return (
                {"error": "Build Brief is a Pro feature", "code": "upgrade_required"},
                403,
            )

    try:
        raw = llm.call_llm(
            prompt_mod.build_prompt(report.get("idea_text", ""), result_json),
            model_id=MODEL_ID,
        )
        brief_json = prompt_mod.parse_and_validate(raw)
    except Exception as e:
        if reserved_free:
            _release_free_brief(auth["user_id"])
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
            ConditionExpression="attribute_exists(pk) AND attribute_not_exists(build_brief_json)",
            ExpressionAttributeValues={":b": brief_json, ":t": generated_at},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            existing = table.get_item(
                Key={
                    "pk": f"ORG#{auth['org_id']}#REPORT#{report_id}",
                    "sk": f"REPORT#{report_id}",
                },
                ConsistentRead=True,
                ProjectionExpression="build_brief_json, build_brief_generated_at",
            ).get("Item")
            if existing and existing.get("build_brief_json"):
                # A concurrent request already stored a brief for this report.
                # The sample we reserved produced nothing of our own — give it back.
                if reserved_free:
                    _release_free_brief(auth["user_id"])
                return {
                    "build_brief_json": existing["build_brief_json"],
                    "build_brief_generated_at": existing.get(
                        "build_brief_generated_at"
                    ),
                }
            if reserved_free:
                _release_free_brief(auth["user_id"])
            return {"error": "Report not found"}, 404
        # Non-conditional store failure (e.g. throttling) after the sample was
        # already spent and the brief generated: give the sample back before
        # bubbling up, so a transient DynamoDB error doesn't burn the free taste.
        if reserved_free:
            _release_free_brief(auth["user_id"])
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
