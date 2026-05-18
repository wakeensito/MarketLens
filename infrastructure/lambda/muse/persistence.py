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


def set_message_feedback(
    report_id: str, message_id: str, feedback: str | None
) -> dict | None:
    """Set thumbs feedback on a single assistant message row.

    Returns the updated row, or None if no matching assistant message exists.
    Pass feedback=None to clear (REMOVE the attribute).
    """
    # We don't know the row's sk timestamp prefix from (report_id, message_id) alone,
    # so query the partition with a filter on message_id. Threads are small (≤ ~60 rows
    # for Pro), so the cost is bounded.
    table = _conversations()
    result = table.query(
        KeyConditionExpression=Key("pk").eq(f"REPORT#{report_id}")
        & Key("sk").begins_with("MSG#"),
        FilterExpression="message_id = :mid AND #r = :role",
        ExpressionAttributeNames={"#r": "role"},
        ExpressionAttributeValues={":mid": message_id, ":role": "assistant"},
        ConsistentRead=True,
    )
    items = result.get("Items") or []
    if not items:
        return None
    row = items[0]
    # Guard against the row being deleted between the query and the update
    # (e.g. the user cleared their thread). Without this, UpdateItem would
    # happily create a sparse item containing only pk, sk, and feedback —
    # leaving an orphaned row that breaks list_messages assumptions.
    common = {
        "Key": {"pk": row["pk"], "sk": row["sk"]},
        "ConditionExpression": "attribute_exists(pk) AND attribute_exists(sk)",
        "ReturnValues": "ALL_NEW",
    }
    try:
        if feedback is None:
            update = table.update_item(
                **common,
                UpdateExpression="REMOVE feedback",
            )
        else:
            update = table.update_item(
                **common,
                UpdateExpression="SET feedback = :f",
                ExpressionAttributeValues={":f": feedback},
            )
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return None
        raise
    return _strip_decimals(update.get("Attributes") or {})


# ─── Report context (read-only) ───


def get_report_for_user(report_id: str, user_id: str, org_id: str) -> dict | None:
    """Fetch the report row and confirm it belongs to the caller.

    Reports table schema (matches `api/app.py`):
        pk = "ORG#{org_id}#REPORT#{report_id}"
        sk = "REPORT#{report_id}"

    Authorization is implicit in the partition key — the only way to read a
    row is to already know the org_id, which the authorizer provides from the
    Users table. We still cross-check `user_id` on the row as defense-in-depth
    in case someone in the same org is impersonated.

    A pre-org-namespacing schema (`pk = REPORT#{report_id}`) existed earlier;
    those rows are no longer reachable from this lookup and won't be Muse-able.
    Acceptable — they're legacy rows the user can still view via the report
    endpoints (which read the same org-namespaced path).
    """
    try:
        result = _reports().get_item(
            Key={
                "pk": f"ORG#{org_id}#REPORT#{report_id}",
                "sk": f"REPORT#{report_id}",
            },
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
    # Defense in depth: even though the org-namespaced pk already scopes the
    # read to this org, verify the row's user_id matches if present. Legacy
    # rows under the org pk but with no user_id field still pass — they were
    # created by this org and the partition is the trust boundary.
    item_user_id = item.get("user_id")
    if item_user_id and item_user_id != user_id:
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


# ─── Free-tier daily counter (writes to the Reports table USER# row) ───
#
# Mirrors the report-counter pattern in `api/app.py` but uses separate columns
# (`muse_count_today` / `muse_count_date`) so the two limits don't collide.
# The increment is deferred — only successful turns burn quota — so we don't
# need check-and-increment atomicity here; we just need a correct counter that
# rolls over at the UTC date boundary.


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def get_muse_daily_used(user_id: str) -> int:
    """Return today's Muse chat count for a user, or 0 on a new day / no record."""
    if not user_id or user_id == "anonymous":
        return 0
    try:
        result = _reports().get_item(
            Key={"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"},
            ConsistentRead=True,
            ProjectionExpression="muse_count_today, muse_count_date",
        )
    except ClientError:
        # Fail open — better to allow a chat than to block on a transient
        # DDB blip. The post-done increment will still try to write through.
        logger.exception("Muse daily count read failed", extra={"user_id": user_id})
        return 0
    item = result.get("Item") or {}
    if item.get("muse_count_date") != _today_utc():
        return 0
    raw = item.get("muse_count_today", 0)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def increment_muse_daily_count(user_id: str) -> None:
    """Bump today's Muse chat count by 1.

    Two cases handled in order: (a) same day → increment; (b) new day (or
    field missing) → reset to 1 and stamp today's date. Best-effort only:
    a failure logs but does not raise, because the turn has already been
    streamed to the user and we should not crash the response.
    """
    if not user_id or user_id == "anonymous":
        return
    today = _today_utc()
    key = {"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"}
    table = _reports()
    try:
        # Same-day fast path.
        table.update_item(
            Key=key,
            UpdateExpression="SET muse_count_today = muse_count_today + :one",
            ConditionExpression="muse_count_date = :today",
            ExpressionAttributeValues={":one": 1, ":today": today},
        )
        return
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            logger.exception(
                "Muse daily count increment failed (same-day path)",
                extra={"user_id": user_id},
            )
            return
    try:
        # New-day path (or first-ever Muse chat for this user).
        table.update_item(
            Key=key,
            UpdateExpression="SET muse_count_today = :one, muse_count_date = :today",
            ConditionExpression="attribute_not_exists(muse_count_date) OR muse_count_date <> :today",
            ExpressionAttributeValues={":one": 1, ":today": today},
        )
    except ClientError as e:
        # Concurrent same-day increment from another tab landed between our
        # two attempts. Re-try the same-day path once; if it fails again, give
        # up and log (under-counting favors the user).
        if e.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            logger.exception(
                "Muse daily count increment failed (new-day path)",
                extra={"user_id": user_id},
            )
            return
        try:
            table.update_item(
                Key=key,
                UpdateExpression="SET muse_count_today = muse_count_today + :one",
                ConditionExpression="muse_count_date = :today",
                ExpressionAttributeValues={":one": 1, ":today": today},
            )
        except ClientError:
            logger.exception(
                "Muse daily count increment failed (retry path)",
                extra={"user_id": user_id},
            )
