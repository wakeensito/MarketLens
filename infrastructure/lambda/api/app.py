"""
MarketLens API Lambda — REST endpoints for reports.
"""
import os
import json
import boto3
from uuid import uuid4
from datetime import datetime

from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()
tracer = Tracer()
metrics = Metrics()
app = APIGatewayRestResolver(strip_prefixes=["/api"])

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["REPORTS_TABLE"])


@app.get("/reports")
@tracer.capture_method
def list_reports():
    """List all reports."""
    result = table.scan(
        FilterExpression="begins_with(sk, :prefix)",
        ExpressionAttributeValues={":prefix": "REPORT#"},
    )
    reports = result.get("Items", [])
    return {"reports": reports}


@app.post("/reports")
@tracer.capture_method
def create_report():
    """Create a new report from a business idea."""
    body = app.current_event.json_body
    idea_text = body.get("idea_text", "").strip()

    if not idea_text or len(idea_text) < 5:
        return {"error": "idea_text must be at least 5 characters"}, 400

    report_id = str(uuid4())
    now = datetime.utcnow().isoformat()

    item = {
        "pk": f"REPORT#{report_id}",
        "sk": f"REPORT#{report_id}",
        "gsi1pk": "REPORTS",
        "gsi1sk": now,
        "report_id": report_id,
        "idea_text": idea_text,
        "status": "pending",
        "created_at": now,
    }
    table.put_item(Item=item)

    logger.info("Report created", extra={"report_id": report_id})

    # TODO: Invoke AI Orchestration Lambda here
    return {"report_id": report_id, "status": "pending"}, 201


@app.get("/reports/<report_id>")
@tracer.capture_method
def get_report(report_id: str):
    """Get a single report by ID."""
    result = table.get_item(Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"})
    item = result.get("Item")

    if not item:
        return {"error": "Report not found"}, 404

    return item


@app.delete("/reports/<report_id>")
@tracer.capture_method
def delete_report(report_id: str):
    """Soft-delete a report."""
    table.update_item(
        Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
        UpdateExpression="SET #s = :status, deleted_at = :now",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":status": "deleted",
            ":now": datetime.utcnow().isoformat(),
        },
    )
    return {"message": "Report deleted"}, 200


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "ok"}


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
