"""Muse sync routes — list and delete a per-report conversation.

Behind the existing API Gateway + CookieAuthorizer:
  GET    /api/muse/conversations/{report_id}   → list thread oldest-first
  DELETE /api/muse/conversations/{report_id}   → wipe thread

Per the handoff:
  - Empty thread → 200 with `{"conversation_id": null, "messages": []}`.
    Never 404.
  - Delete always returns 200 with `{"deleted": true}` regardless of whether
    a thread existed.
"""

from __future__ import annotations

from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.typing import LambdaContext

import persistence

logger = Logger()
tracer = Tracer()
metrics = Metrics()
app = APIGatewayRestResolver(strip_prefixes=["/api"])


def _auth() -> dict:
    """Extract auth context injected by the API Gateway Authorizer."""
    raw = app.current_event.raw_event
    authorizer = raw.get("requestContext", {}).get("authorizer", {}) or {}
    return {
        "user_id": authorizer.get("user_id", "anonymous"),
        "org_id": authorizer.get("org_id", "anonymous"),
        "is_authenticated": authorizer.get("is_authenticated", "false") == "true",
        "plan": authorizer.get("plan", "free"),
    }


def _serialize_message(row: dict) -> dict:
    """Strip DDB-internal keys; expose only the contract fields."""
    out: dict = {
        "role": row.get("role", "user"),
        "content": row.get("content", ""),
        "created_at": row.get("created_at", ""),
    }
    if row.get("role") == "assistant":
        if row.get("sources") is not None:
            out["sources"] = row.get("sources")
        if row.get("follow_ups") is not None:
            out["follow_ups"] = row.get("follow_ups")
        if row.get("tokens_in") is not None:
            out["tokens_in"] = row.get("tokens_in")
        if row.get("tokens_out") is not None:
            out["tokens_out"] = row.get("tokens_out")
    return out


@app.get("/muse/conversations/<report_id>")
@tracer.capture_method
def get_conversation(report_id: str):
    auth = _auth()
    if not auth["is_authenticated"]:
        return {"error": "Authentication required"}, 401

    # Confirm the caller owns the report. We do this even on GET because the
    # conversations table key is per-report; without the ownership check, a
    # user could attempt to read someone else's thread by guessing report ids.
    report = persistence.get_report_for_user(report_id, auth["user_id"], auth["org_id"])
    if report is None:
        return {"conversation_id": None, "messages": []}

    rows = persistence.list_messages(report_id)
    if not rows:
        return {"conversation_id": None, "messages": []}

    conversation_id = rows[0].get("conversation_id")
    messages = [_serialize_message(r) for r in rows]
    return {"conversation_id": conversation_id, "messages": messages}


@app.delete("/muse/conversations/<report_id>")
@tracer.capture_method
def delete_conversation(report_id: str):
    auth = _auth()
    if not auth["is_authenticated"]:
        return {"error": "Authentication required"}, 401

    report = persistence.get_report_for_user(report_id, auth["user_id"], auth["org_id"])
    if report is None:
        # Per the contract: always return deleted: true. Don't leak whether
        # the report exists.
        return {"deleted": True}

    count = persistence.delete_thread(report_id)
    if count:
        metrics.add_metric(name="MuseThreadDeleted", unit=MetricUnit.Count, value=1)
        logger.info(
            "Muse thread deleted",
            extra={
                "report_id": report_id,
                "user_id": auth["user_id"],
                "rows_deleted": count,
            },
        )
    return {"deleted": True}


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
