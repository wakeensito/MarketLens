"""DynamoDB access for Muse — conversation rows + report context reads.

Schema (per the handoff):
  pk      = "REPORT#{report_id}"
  sk      = "MSG#{iso_timestamp}#{message_id}"
  gsi1pk  = "ORG#{org_id}"               # reserved for Max cross-report memory
  gsi1sk  = "{iso_timestamp}#{report_id}"

Reports table is read-only from this Lambda.
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Iterable

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


CONVERSATIONS_TABLE_NAME = os.environ.get("MUSE_CONVERSATIONS_TABLE", "")
REPORTS_TABLE_NAME = os.environ.get("REPORTS_TABLE", "")

_dynamodb = None
_conversations_table = None
_reports_table = None


def _conversations():
    global _dynamodb, _conversations_table
    if _conversations_table is None:
        _dynamodb = _dynamodb or boto3.resource("dynamodb")
        _conversations_table = _dynamodb.Table(CONVERSATIONS_TABLE_NAME)
    return _conversations_table


def _reports():
    global _dynamodb, _reports_table
    if _reports_table is None:
        _dynamodb = _dynamodb or boto3.resource("dynamodb")
        _reports_table = _dynamodb.Table(REPORTS_TABLE_NAME)
    return _reports_table


# ─── Public types ───


@dataclass(frozen=True)
class MuseMessage:
    """One row in the conversation thread (user or assistant)."""

    message_id: str
    conversation_id: str
    role: str  # "user" | "assistant"
    content: str
    created_at: str
    sources: list[dict] | None = None
    follow_ups: list[str] | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None
    model_id: str | None = None


# ─── Helpers ───


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def _ttl_for_plan(plan: str) -> int | None:
    """Free users: 30-day retention. Pro and Max: kept indefinitely."""
    if plan == "free":
        return int(time.time()) + 30 * 24 * 60 * 60
    return None


def _strip_decimals(value: Any) -> Any:
    """DynamoDB returns Decimal; convert to int/float for clean JSON output."""
    if isinstance(value, list):
        return [_strip_decimals(v) for v in value]
    if isinstance(value, dict):
        return {k: _strip_decimals(v) for k, v in value.items()}
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    return value


# ─── Conversation reads ───


def list_messages(report_id: str) -> list[dict]:
    """Return all rows for a report, oldest first. Empty list if no thread.

    The sk is "MSG#{iso_timestamp}#{message_id}" which sorts lexicographically
    by timestamp — no extra sort step needed.
    """
    items: list[dict] = []
    last_key = None
    while True:
        query_kwargs: dict[str, Any] = {
            "KeyConditionExpression": Key("pk").eq(f"REPORT#{report_id}")
            & Key("sk").begins_with("MSG#"),
            "ScanIndexForward": True,
            "ConsistentRead": True,
        }
        if last_key:
            query_kwargs["ExclusiveStartKey"] = last_key
        result = _conversations().query(**query_kwargs)
        items.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break
    return [_strip_decimals(it) for it in items]


def count_user_messages(report_id: str) -> int:
    """Count `role: "user"` rows for a report. Used for the Pro 30-message cap."""
    rows = list_messages(report_id)
    return sum(1 for r in rows if r.get("role") == "user")


# ─── Conversation writes ───


def write_pair(
    *,
    report_id: str,
    org_id: str,
    conversation_id: str,
    user_message_id: str,
    user_content: str,
    user_created_at: str,
    assistant_message_id: str,
    assistant_content: str,
    assistant_created_at: str,
    sources: list[dict],
    follow_ups: list[str],
    tokens_in: int,
    tokens_out: int,
    model_id: str,
    plan: str,
) -> None:
    """Write the user turn + assistant turn as two rows at end-of-stream.

    Atomicity isn't strictly needed (a half-write would just leave a user row
    with no answer, which the frontend renders harmlessly), so we use BatchWriteItem.
    """
    ttl = _ttl_for_plan(plan)

    base_user: dict[str, Any] = {
        "pk": f"REPORT#{report_id}",
        "sk": f"MSG#{user_created_at}#{user_message_id}",
        "gsi1pk": f"ORG#{org_id}",
        "gsi1sk": f"{user_created_at}#{report_id}",
        "conversation_id": conversation_id,
        "message_id": user_message_id,
        "role": "user",
        "content": user_content,
        "created_at": user_created_at,
    }
    base_assistant: dict[str, Any] = {
        "pk": f"REPORT#{report_id}",
        "sk": f"MSG#{assistant_created_at}#{assistant_message_id}",
        "gsi1pk": f"ORG#{org_id}",
        "gsi1sk": f"{assistant_created_at}#{report_id}",
        "conversation_id": conversation_id,
        "message_id": assistant_message_id,
        "role": "assistant",
        "content": assistant_content,
        "created_at": assistant_created_at,
        "sources": sources,
        "follow_ups": follow_ups,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "model_id": model_id,
    }
    if ttl is not None:
        base_user["ttl"] = ttl
        base_assistant["ttl"] = ttl

    table = _conversations()
    with table.batch_writer() as batch:
        batch.put_item(Item=base_user)
        batch.put_item(Item=base_assistant)


def delete_thread(report_id: str) -> int:
    """Delete every row in a report's thread. Returns the number deleted."""
    rows = list_messages(report_id)
    if not rows:
        return 0
    table = _conversations()
    with table.batch_writer() as batch:
        for row in rows:
            batch.delete_item(Key={"pk": row["pk"], "sk": row["sk"]})
    return len(rows)


# ─── Report context (read-only) ───


def get_report_for_user(report_id: str, user_id: str, org_id: str) -> dict | None:
    """Fetch the report row and confirm it belongs to the caller.

    Reports are stored with pk = "REPORT#{report_id}", sk = "REPORT#{report_id}".
    Authorization model: the report's `user_id` (or `org_id`) field must match
    the caller. Anything else → return None so the caller emits `report_not_found`.
    """
    try:
        result = _reports().get_item(
            Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
            ConsistentRead=True,
        )
    except ClientError as e:
        # Treat "resource not found" as a missing report so the caller emits
        # `report_not_found`. Surface anything else (throttling, credentials,
        # network) so the stream/sync handler returns 5xx and ops sees it.
        code = e.response.get("Error", {}).get("Code", "")
        if code == "ResourceNotFoundException":
            return None
        logger.exception(
            "Reports table get_item failed",
            extra={"report_id": report_id, "error_code": code},
        )
        raise
    item = result.get("Item")
    if not item:
        return None
    # Authorization is fail-closed: a row missing BOTH ownership attributes is
    # treated as unknown, not as public. Prefer org_id (matches the rest of the
    # codebase); fall back to user_id only for legacy rows that predate org_id.
    item_org_id = item.get("org_id")
    item_user_id = item.get("user_id")
    if not item_org_id and not item_user_id:
        return None
    if item_org_id:
        if item_org_id != org_id:
            return None
    elif item_user_id != user_id:
        return None
    return _strip_decimals(item)


def messages_to_history(rows: Iterable[dict], limit: int = 12) -> list[dict]:
    """Turn raw DDB rows into a [{role, content}] list for the model.

    Trims to the most recent `limit` rows so the context window stays bounded.
    """
    trimmed = list(rows)[-limit:]
    return [
        {"role": r["role"], "content": r["content"]}
        for r in trimmed
        if r.get("role") in {"user", "assistant"} and r.get("content")
    ]
