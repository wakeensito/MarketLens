#!/usr/bin/env python3
"""
One-time migration: re-key old reports from REPORT#{id} to ORG#{org_id}#REPORT#{id}.

Usage:
  # Dry run (default) — shows what would change
  python scripts/migrate-reports.py --table marketlens-reports-prod

  # Actually migrate — assigns to a specific org
  python scripts/migrate-reports.py --table marketlens-reports-prod --org-id YOUR_ORG_ID --execute

  # Assign to the first user found in the table
  python scripts/migrate-reports.py --table marketlens-reports-prod --first-user --execute
"""
import argparse
import sys

import boto3
from botocore.exceptions import ClientError
from datetime import datetime, timezone


def find_first_user(table) -> dict | None:
    """Scan for the first USER# record in the table (paginated)."""
    params = {
        "FilterExpression": "begins_with(pk, :prefix)",
        "ExpressionAttributeValues": {":prefix": "USER#"},
    }
    while True:
        result = table.scan(**params)
        items = result.get("Items", [])
        if items:
            return items[0]
        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            return None
        params["ExclusiveStartKey"] = last_key


def find_old_reports(table) -> list[dict]:
    """Scan for reports using the old key schema (pk starts with REPORT#)."""
    old_reports = []
    params = {
        "FilterExpression": "begins_with(pk, :prefix)",
        "ExpressionAttributeValues": {":prefix": "REPORT#"},
    }
    while True:
        result = table.scan(**params)
        old_reports.extend(result.get("Items", []))
        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break
        params["ExclusiveStartKey"] = last_key
    return old_reports


def migrate_report(table, item: dict, org_id: str, execute: bool) -> None:
    """Re-key a single report from old schema to org-scoped schema."""
    report_id = (item.get("report_id") or "").strip()
    old_pk = item["pk"]
    old_sk = item["sk"]

    if not report_id:
        print(
            f"  ERROR: missing report_id, skipping. old_pk={old_pk!r} old_sk={old_sk!r}",
            file=sys.stderr,
        )
        return

    new_pk = f"ORG#{org_id}#REPORT#{report_id}"
    new_sk = f"REPORT#{report_id}"
    new_gsi1pk = f"ORG#{org_id}#REPORTS"
    new_gsi1sk = item.get("gsi1sk", item.get("created_at", datetime.now(timezone.utc).isoformat()))

    print(f"  {old_pk} → {new_pk}")

    if not execute:
        return

    # Create new item with updated keys
    new_item = {**item}
    new_item["pk"] = new_pk
    new_item["sk"] = new_sk
    new_item["gsi1pk"] = new_gsi1pk
    new_item["gsi1sk"] = new_gsi1sk
    new_item["org_id"] = org_id
    new_item["migrated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        table.put_item(Item=new_item)
        table.delete_item(Key={"pk": old_pk, "sk": old_sk})
    except ClientError as e:
        print(
            f"  ERROR: DynamoDB write failed for report_id={report_id!r} old_pk={old_pk!r}: {e}",
            file=sys.stderr,
        )


def main():
    parser = argparse.ArgumentParser(description="Migrate old reports to org-scoped keys")
    parser.add_argument("--table", required=True, help="DynamoDB table name")
    org_group = parser.add_mutually_exclusive_group()
    org_group.add_argument("--org-id", help="Target org_id to assign reports to")
    org_group.add_argument(
        "--first-user",
        action="store_true",
        help="Assign to the first user's org found in the table",
    )
    parser.add_argument("--execute", action="store_true", help="Actually perform the migration (default is dry run)")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    args = parser.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(args.table)

    # Determine target org_id
    org_id = args.org_id
    if args.first_user:
        user = find_first_user(table)
        if not user:
            print("ERROR: No USER# records found in table. Sign in first to create your account.")
            sys.exit(1)
        org_id = user.get("org_id", "")
        uid = user.get("user_id") or user.get("pk", "unknown")
        print(f"Found user: id={uid} (org_id: {org_id})")

    if not org_id:
        print("ERROR: Provide --org-id or --first-user")
        sys.exit(1)

    # Find old reports
    old_reports = find_old_reports(table)
    print(f"\nFound {len(old_reports)} reports with old key schema")

    if not old_reports:
        print("Nothing to migrate.")
        return

    mode = "EXECUTING" if args.execute else "DRY RUN"
    print(f"\n[{mode}] Migrating to ORG#{org_id}:\n")

    for item in old_reports:
        migrate_report(table, item, org_id, args.execute)

    if args.execute:
        print(f"\nDone. Migrated {len(old_reports)} reports.")
    else:
        print("\nDry run complete. Run with --execute to apply changes.")


if __name__ == "__main__":
    main()
