"""Muse analytics forwarder — DynamoDB Stream → Firehose → Parquet on S3.

Triggered by INSERTs on `MuseConversationsTable`. Each new chat row is unwrapped
from DynamoDB AttributeValue format, projected to the analytics schema (the one
the Glue Data Catalog table declares), and sent to a Firehose delivery stream
that handles JSON → Parquet conversion using that same Glue schema as the
source of truth. Athena queries the resulting Parquet directly.

Why a Lambda instead of EventBridge Pipes: DDB Stream records are wrapped in
AttributeValue format ({"S": "..."}, {"N": "..."}) and `sources`/`follow_ups`
are nested arrays-of-structs. Pipes' input transformer can't unwrap nested
attributes cleanly — you'd end up adding an enrichment Lambda anyway, so this
forwarder is the smaller surface area.

Failure handling:
  - INSERT records are converted in-place; bad records (parse failure, missing
    attributes) are skipped with a logged warning, not raised. Re-raising would
    block the entire batch and eventually drop it to the DLQ for human review,
    which is more friction than a single malformed row warrants.
  - Firehose `PutRecordBatch` partial failures: we map FailedPutCount entries
    back to their source DDB sequence numbers and return them via
    `batchItemFailures` so the ESM only retries the failed items. The Lambda
    must be wired with `FunctionResponseTypes: ReportBatchItemFailures` for
    this to take effect.
"""

from __future__ import annotations

import json
import os

import boto3
from boto3.dynamodb.types import TypeDeserializer

from aws_lambda_powertools import Logger, Metrics
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()
metrics = Metrics()

_FIREHOSE_STREAM_NAME = os.environ["FIREHOSE_STREAM_NAME"]
_firehose = boto3.client("firehose")
_deserialize = TypeDeserializer().deserialize


def _strip_prefix(value: str, prefix: str) -> str:
    return value[len(prefix) :] if value.startswith(prefix) else value


def _project_row(image: dict) -> dict | None:
    """Map a deserialized DDB row to the analytics schema.

    Returns None for rows we deliberately don't analyze (e.g., a row missing
    role/content). Skips silently rather than raising so one bad row doesn't
    poison the batch.
    """
    role = image.get("role")
    if role not in ("user", "assistant"):
        return None
    pk = image.get("pk", "")
    gsi1pk = image.get("gsi1pk", "")

    return {
        "report_id": _strip_prefix(pk, "REPORT#"),
        "org_id": _strip_prefix(gsi1pk, "ORG#"),
        "conversation_id": image.get("conversation_id", ""),
        "message_id": image.get("message_id", ""),
        "role": role,
        "content": image.get("content", ""),
        "created_at": image.get("created_at", ""),
        "sources": image.get("sources") or [],
        "follow_ups": image.get("follow_ups") or [],
        # Assistant-only fields default to 0/"" for user rows so the Parquet
        # schema stays uniform — Athena prefers nullable scalars over absent
        # columns when scanning across a partition.
        "tokens_in": int(image.get("tokens_in") or 0),
        "tokens_out": int(image.get("tokens_out") or 0),
        "model_id": image.get("model_id") or "",
    }


def _unwrap_new_image(record: dict) -> dict | None:
    """Pull `dynamodb.NewImage` out and convert AttributeValue → plain Python."""
    new_image = record.get("dynamodb", {}).get("NewImage")
    if not new_image:
        return None
    try:
        return {k: _deserialize(v) for k, v in new_image.items()}
    except Exception:
        logger.exception(
            "Failed to deserialize DDB NewImage",
            extra={"sequence_number": record.get("dynamodb", {}).get("SequenceNumber")},
        )
        return None


def _to_firehose_record(row: dict) -> dict:
    # Newline-delimited JSON keeps the raw delivery (the ErrorOutputPrefix path
    # below) human-readable if Parquet conversion fails on a record.
    payload = (json.dumps(row, ensure_ascii=False) + "\n").encode("utf-8")
    return {"Data": payload}


def lambda_handler(event: dict, context: LambdaContext) -> dict:
    records = event.get("Records") or []
    if not records:
        return {"batchItemFailures": []}

    # Build (sequence_number, firehose_record) pairs in input order. We need the
    # mapping to translate Firehose's positional FailedPutCount back to the DDB
    # sequence numbers the ESM expects in batchItemFailures.
    pairs: list[tuple[str, dict]] = []
    skipped_count = 0
    for record in records:
        if record.get("eventName") != "INSERT":
            # MODIFY/REMOVE are not analytics-meaningful — chat rows are immutable
            # post-write (TTL-driven REMOVEs aren't user actions). Drop silently.
            continue
        sequence_number = record.get("dynamodb", {}).get("SequenceNumber") or ""
        image = _unwrap_new_image(record)
        if image is None:
            skipped_count += 1
            continue
        row = _project_row(image)
        if row is None:
            skipped_count += 1
            continue
        pairs.append((sequence_number, _to_firehose_record(row)))

    if skipped_count:
        metrics.add_metric(
            name="MuseForwarderRowsSkipped",
            unit=MetricUnit.Count,
            value=skipped_count,
        )

    if not pairs:
        return {"batchItemFailures": []}

    sequence_numbers = [seq for seq, _ in pairs]
    firehose_records = [rec for _, rec in pairs]

    failed_sequence_numbers = _put_to_firehose(sequence_numbers, firehose_records)

    metrics.add_metric(
        name="MuseForwarderRowsForwarded",
        unit=MetricUnit.Count,
        value=len(pairs) - len(failed_sequence_numbers),
    )
    if failed_sequence_numbers:
        metrics.add_metric(
            name="MuseForwarderRowsFailed",
            unit=MetricUnit.Count,
            value=len(failed_sequence_numbers),
        )

    return {
        "batchItemFailures": [
            {"itemIdentifier": seq} for seq in failed_sequence_numbers
        ]
    }


def _put_to_firehose(
    sequence_numbers: list[str], firehose_records: list[dict]
) -> list[str]:
    """Send to Firehose; return DDB sequence numbers that failed to deliver.

    Firehose `PutRecordBatch` accepts up to 500 records / 4MB per call. ESM
    BatchSize is 100, so a single call always suffices in normal operation.
    A whole-call ClientError (throttling, transient) marks every sequence as
    failed so the ESM retries the entire batch.
    """
    try:
        response = _firehose.put_record_batch(
            DeliveryStreamName=_FIREHOSE_STREAM_NAME,
            Records=firehose_records,
        )
    except Exception:
        logger.exception(
            "Firehose PutRecordBatch failed entirely",
            extra={"record_count": len(firehose_records)},
        )
        return list(sequence_numbers)

    failed_count = response.get("FailedPutCount", 0)
    if not failed_count:
        return []

    failed: list[str] = []
    for seq, result in zip(sequence_numbers, response.get("RequestResponses", [])):
        if result.get("ErrorCode"):
            failed.append(seq)
            logger.warning(
                "Firehose record rejected",
                extra={
                    "sequence_number": seq,
                    "error_code": result.get("ErrorCode"),
                    "error_message": result.get("ErrorMessage"),
                },
            )
    return failed
