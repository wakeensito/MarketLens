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

import json
import re

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


_ASSISTANT_FIELDS = (
    # message_id is needed by the client to target feedback POST calls.
    "message_id",
    "sources",
    "follow_ups",
    "tokens_in",
    "tokens_out",
    "feedback",
)

# Tokens emitted by an earlier prompt revision. The DOM uses `roadmap-{N}`
# now; without this rewrite, any historical citation pill silently fails to
# scroll because no `[data-muse-cell]` matches `roadmap-phase-N`.
_LEGACY_ROADMAP_RE = re.compile(r"\[\[roadmap-phase-(\d+)\|")


def _migrate_legacy_citations(content: str) -> str:
    return _LEGACY_ROADMAP_RE.sub(r"[[roadmap-\1|", content)


def _serialize_message(row: dict) -> dict:
    """Strip DDB-internal keys; expose only the contract fields."""
    out: dict = {
        "role": row.get("role", "user"),
        "content": _migrate_legacy_citations(row.get("content", "")),
        "created_at": row.get("created_at", ""),
    }
    if row.get("role") == "assistant":
        for field in _ASSISTANT_FIELDS:
            val = row.get(field)
            if val is not None:
                if field == "sources" and isinstance(val, list):
                    val = [
                        {**s, "target": s["target"].replace("roadmap-phase-", "roadmap-")}
                        if isinstance(s, dict) and isinstance(s.get("target"), str)
                        else s
                        for s in val
                    ]
                out[field] = val
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


@app.post("/muse/conversations/<report_id>/messages/<message_id>/feedback")
@tracer.capture_method
def set_feedback(report_id: str, message_id: str):
    auth = _auth()
    if not auth["is_authenticated"]:
        return {"error": "Authentication required"}, 401

    try:
        body = app.current_event.json_body or {}
    except (json.JSONDecodeError, ValueError):
        return {"error": "Invalid JSON body", "code": "validation"}, 400
    raw = body.get("feedback", "missing")
    if raw not in ("up", "down", None):
        return {
            "error": "feedback must be 'up', 'down', or null",
            "code": "validation",
        }, 400

    # Ownership check — without it a caller could write feedback against a
    # message id they don't own (low blast radius, but it would still pollute
    # the analytics stream with attributable rows).
    report = persistence.get_report_for_user(report_id, auth["user_id"], auth["org_id"])
    if report is None:
        return {"error": "not_found", "code": "report_not_found"}, 404

    updated = persistence.set_message_feedback(report_id, message_id, raw)
    if updated is None:
        return {"error": "not_found", "code": "message_not_found"}, 404

    metrics.add_metric(
        name="MuseFeedbackRecorded", unit=MetricUnit.Count, value=1
    )
    return {"ok": True, "feedback": raw}


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
