"""
MarketLens Export Lambda — Generate PDF/CSV exports from reports.
"""
import os
import json
import csv
import io
import re
import boto3
from datetime import datetime

from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()
tracer = Tracer()
metrics = Metrics()
app = APIGatewayRestResolver(strip_prefixes=["/api"])

_REPORT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,80}$")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["REPORTS_TABLE"])
s3 = boto3.client("s3")
EXPORTS_BUCKET = os.environ["EXPORTS_BUCKET"]


_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _safe_cell(value: object) -> object:
    """Prefix formula-injection characters so spreadsheets don't execute them."""
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def generate_csv(report: dict) -> str:
    """Generate a CSV string from report data."""
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow(["MarketLens Report Export"])
    writer.writerow(["Report ID", report.get("report_id", "")])
    writer.writerow(["Idea", _safe_cell(report.get("idea_text", ""))])
    writer.writerow(["Created", report.get("created_at", "")])
    writer.writerow([])

    # Scores
    result = report.get("result_json", {})
    writer.writerow(["Scores"])
    writer.writerow(["Saturation Score", result.get("saturation_score", "")])
    writer.writerow(["Difficulty Score", result.get("difficulty_score", "")])
    writer.writerow(["Opportunity Score", result.get("opportunity_score", "")])
    writer.writerow([])

    # Competitors
    competitors = result.get("competitors", [])
    if competitors:
        writer.writerow(["Competitors"])
        writer.writerow(["Name", "Description", "URL"])
        for comp in competitors:
            writer.writerow([
                _safe_cell(comp.get("name", "")),
                _safe_cell(comp.get("description", "")),
                _safe_cell(comp.get("url", "")),
            ])

    return output.getvalue()


@app.post("/reports/<report_id>/export")
@tracer.capture_method
def export_report(report_id: str):
    """Export a report as CSV and return a presigned download URL."""
    if not _REPORT_ID_RE.match(report_id):
        return {"error": "Invalid report_id"}, 400
    body = app.current_event.json_body
    if not isinstance(body, dict):
        body = {}
    export_format = body.get("format", "csv")

    # Fetch report
    result = table.get_item(Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"})
    item = result.get("Item")

    if not item:
        return {"error": "Report not found"}, 404

    if item.get("status") != "complete":
        return {"error": "Report is not complete yet"}, 400

    # Generate export
    if export_format == "csv":
        content = generate_csv(item)
        content_type = "text/csv"
        extension = "csv"
    else:
        return {"error": f"Unsupported format: {export_format}. Supported: csv"}, 400

    # Upload to S3
    now = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    s3_key = f"exports/{report_id}/{now}.{extension}"

    s3.put_object(
        Bucket=EXPORTS_BUCKET,
        Key=s3_key,
        Body=content.encode("utf-8"),
        ContentType=content_type,
    )

    # Generate presigned URL (24h expiry)
    download_url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": EXPORTS_BUCKET, "Key": s3_key},
        ExpiresIn=86400,
    )

    logger.info("Export generated", extra={"report_id": report_id, "format": export_format})

    return {
        "report_id": report_id,
        "format": export_format,
        "download_url": download_url,
    }


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
