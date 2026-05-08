"""
export-reports-to-s3.py

Scans DynamoDB for completed reports and uploads each result_json
as a JSON file to an S3 bucket for Glue DataBrew processing.

Usage:
  # Dry run — shows what would be exported
  python scripts/export-reports-to-s3.py --table marketlens-reports-dev --bucket my-raw-bucket

  # Actually export
  python scripts/export-reports-to-s3.py --table marketlens-reports-dev --bucket my-raw-bucket --execute

  # Export only reports from a specific org
  python scripts/export-reports-to-s3.py --table marketlens-reports-dev --bucket my-raw-bucket --org-id abc123 --execute

Output S3 key pattern:
  reports/raw/{org_id}/{report_id}.json
"""

import argparse
import json
import sys
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr


# ── Helpers ──────────────────────────────────────────────────────────────────


class DecimalEncoder(json.JSONEncoder):
    """DynamoDB returns Decimal for numbers — convert back to float/int for JSON."""

    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)


def scan_completed_reports(table, org_id: str | None) -> list[dict]:
    """Scan DynamoDB for all completed reports. Paginates automatically."""
    filter_expr = Attr("status").eq("complete") & Attr("sk").begins_with("REPORT#")

    if org_id:
        filter_expr = filter_expr & Attr("org_id").eq(org_id)

    items = []
    kwargs = {"FilterExpression": filter_expr}

    while True:
        response = table.scan(**kwargs)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key

    return items


def upload_report(s3_client, bucket: str, item: dict, dry_run: bool) -> str:
    """Upload a single report's result_json to S3. Returns the S3 key."""
    report_id = item.get("report_id", item.get("sk", "unknown").replace("REPORT#", ""))
    org_id = item.get("org_id", "unknown")
    result_json = item.get("result_json", {})

    # Enrich with metadata fields for DataBrew
    payload = {
        "report_id": report_id,
        "org_id": org_id,
        "idea_text": item.get("idea_text", ""),
        "status": item.get("status", ""),
        "created_at": item.get("created_at", ""),
        "completed_at": item.get("completed_at", ""),
        "total_tokens_input": item.get("total_tokens_input"),
        "total_tokens_output": item.get("total_tokens_output"),
        "total_cost_usd": item.get("total_cost_usd"),
        "result": result_json,
    }

    s3_key = f"reports/raw/{org_id}/{report_id}.json"
    body = json.dumps(payload, cls=DecimalEncoder, ensure_ascii=False, indent=2)

    if dry_run:
        print(f"  [DRY RUN] Would upload → s3://{bucket}/{s3_key} ({len(body)} bytes)")
    else:
        s3_client.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=body.encode("utf-8"),
            ContentType="application/json",
        )
        print(f"  ✓ Uploaded → s3://{bucket}/{s3_key}")

    return s3_key


# ── Main ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Export completed reports from DynamoDB to S3"
    )
    parser.add_argument(
        "--table",
        required=True,
        help="DynamoDB table name (e.g. marketlens-reports-dev)",
    )
    parser.add_argument(
        "--bucket", required=True, help="S3 bucket name for raw JSON output"
    )
    parser.add_argument(
        "--org-id", default=None, help="Filter to a specific org_id (optional)"
    )
    parser.add_argument(
        "--region", default="us-east-1", help="AWS region (default: us-east-1)"
    )
    parser.add_argument(
        "--execute", action="store_true", help="Actually upload (default is dry run)"
    )
    args = parser.parse_args()

    dry_run = not args.execute

    if dry_run:
        print("=== DRY RUN — pass --execute to actually upload ===\n")

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    s3 = boto3.client("s3", region_name=args.region)
    table = dynamodb.Table(args.table)

    print(f"Scanning {args.table} for completed reports...")
    if args.org_id:
        print(f"  Filtering to org_id: {args.org_id}")

    items = scan_completed_reports(table, args.org_id)
    print(f"Found {len(items)} completed report(s)\n")

    if not items:
        print("Nothing to export.")
        sys.exit(0)

    uploaded = 0
    skipped = 0

    for item in items:
        if not item.get("result_json"):
            report_id = item.get("report_id", "?")
            print(f"  SKIP {report_id} — no result_json")
            skipped += 1
            continue

        try:
            upload_report(s3, args.bucket, item, dry_run)
            uploaded += 1
        except Exception as e:
            report_id = item.get("report_id", "?")
            print(f"  ERROR {report_id}: {e}")

    print(f"\nDone. {uploaded} uploaded, {skipped} skipped.")
    if dry_run:
        print("\nRun with --execute to perform the actual upload.")


if __name__ == "__main__":
    main()
