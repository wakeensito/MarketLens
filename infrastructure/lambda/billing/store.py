"""DynamoDB access for billing. One transaction per webhook event.

The processed-event marker and the user-row update commit together. Marking
first and updating second would turn a crash between the two into a
permanently stale plan: Stripe's retry would look like a duplicate.
"""

from __future__ import annotations

import os
import time
from enum import Enum

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

MARKER_TTL_SECONDS = 72 * 3600

_client = None
_table = None
_serializer = TypeSerializer()


def _table_name() -> str:
    return os.environ["REPORTS_TABLE"]


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client("dynamodb")
    return _client


def _get_table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb").Table(_table_name())
    return _table


def serialize(value) -> dict:
    return _serializer.serialize(value)


def marker_ttl(now: int) -> int:
    return now + MARKER_TTL_SECONDS


def user_key(user_id: str) -> dict:
    pk = f"USER#{user_id}"
    return {"pk": pk, "sk": pk}


class Outcome(str, Enum):
    APPLIED = "applied"
    DUPLICATE = "duplicate"
    STALE = "stale"
    NOOP = "noop"


def get_user(user_id: str) -> dict | None:
    result = _get_table().get_item(Key=user_key(user_id), ConsistentRead=True)
    return result.get("Item") or None


def set_pending_intent(user_id: str, intent_id: str) -> None:
    _get_table().update_item(
        Key=user_key(user_id),
        UpdateExpression="SET pending_intent_id = :i",
        ExpressionAttributeValues={":i": intent_id},
    )


def apply_event(event_id: str, user_id: str | None, update: dict | None) -> Outcome:
    """Commit the processed marker and (optionally) the row update atomically.

    Returns DUPLICATE when the marker already exists, STALE when the row
    condition fails (the marker is *not* written, so a legitimately later
    redelivery can still apply), APPLIED / NOOP otherwise. Any other
    DynamoDB failure raises so the caller returns 5xx and Stripe retries.
    """
    marker_pk = f"BILLING_EVENT#{event_id}"
    items: list[dict] = [
        {
            "Put": {
                "TableName": _table_name(),
                "Item": {
                    "pk": {"S": marker_pk},
                    "sk": {"S": marker_pk},
                    "ttl": {"N": str(marker_ttl(int(time.time())))},
                },
                "ConditionExpression": "attribute_not_exists(pk)",
            }
        }
    ]
    if update is not None and user_id is not None:
        items.append(
            {
                "Update": {
                    "TableName": _table_name(),
                    "Key": {k: {"S": v} for k, v in user_key(user_id).items()},
                    **update,
                }
            }
        )
    try:
        _get_client().transact_write_items(TransactItems=items)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") != "TransactionCanceledException":
            raise
        reasons = e.response.get("CancellationReasons") or []
        codes = [r.get("Code") for r in reasons]
        if codes and codes[0] == "ConditionalCheckFailed":
            return Outcome.DUPLICATE
        if len(codes) > 1 and codes[1] == "ConditionalCheckFailed":
            return Outcome.STALE
        raise
    return Outcome.APPLIED if update is not None else Outcome.NOOP
