"""
MarketLens AI Orchestration — Durable Function pipeline.

Stages: sanitize → parse → search → analyse → score → summarise → assemble
Each stage is a durable step with automatic checkpointing and retry.
"""
import os
import json
import re
import boto3
from datetime import datetime

from aws_lambda_powertools import Logger, Tracer
from aws_durable_execution_sdk_python import durable_execution, DurableContext

logger = Logger()
tracer = Tracer()

_REPORT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,80}$")


def _get_table():
    dynamodb = boto3.resource("dynamodb")
    table_name = os.environ["REPORTS_TABLE"]
    return dynamodb.Table(table_name)


def get_llm_client():
    """Retrieve LLM API key from Secrets Manager and return a client placeholder."""
    # For the current MVP (LLM calls are TODO), treat missing secret config as "no keys".
    # Important: do NOT checkpoint secrets inside durable steps.
    secret_name = os.environ.get("LLM_SECRET_NAME")
    if not secret_name:
        return {}

    sm = boto3.client("secretsmanager")
    secret = sm.get_secret_value(SecretId=secret_name)
    keys = json.loads(secret["SecretString"])
    return keys


def sanitize(idea_text: str) -> dict:
    """Stage 1: Validate and clean input."""
    if not isinstance(idea_text, str):
        raise ValueError("Idea text must be a string")
    cleaned = idea_text.strip()
    if len(cleaned) < 5:
        raise ValueError("Idea text too short")
    if len(cleaned) > 2000:
        cleaned = cleaned[:2000]
    return {"cleaned_idea": cleaned}


def parse(cleaned_idea: str, llm_keys: dict) -> dict:
    """Stage 2: Extract industry, geography, business model via LLM."""
    # TODO: Call Anthropic/OpenAI API to parse the idea
    return {
        "industry": "Technology",
        "geography": "Global",
        "business_model": "SaaS",
        "keywords": [cleaned_idea],
    }


def search(parsed: dict) -> dict:
    """Stage 3: Search for competitors, market size, trends."""
    # TODO: Call search API (Brave/Serper) for competitor data
    return {
        "competitors": [],
        "market_size": "Unknown",
        "trends": [],
    }


def analyse(parsed: dict, search_results: dict, llm_keys: dict) -> dict:
    """Stage 4: Synthesize competitor list with positioning via LLM."""
    # TODO: Call LLM to analyze competitors
    return {
        "competitor_analysis": [],
        "positioning": "Differentiated",
    }


def score(analysis: dict) -> dict:
    """Stage 5: Compute saturation, difficulty, opportunity scores."""
    # Deterministic scoring algorithm — no LLM needed
    return {
        "saturation_score": 45,
        "saturation_label": "Moderate",
        "difficulty_score": 60,
        "opportunity_score": 70,
    }


def summarise(analysis: dict, scores: dict, llm_keys: dict) -> dict:
    """Stage 6: Generate beginner-friendly explanation and gap analysis via LLM."""
    # TODO: Call LLM for summary
    return {
        "oneliner": "A moderately competitive space with room for differentiation.",
        "gaps": [],
        "trend_signal": "Growing interest in AI-powered solutions.",
        "recommendation": "Proceed with a focused niche strategy.",
    }


def assemble(parsed: dict, search_results: dict, analysis: dict, scores: dict, summary: dict) -> dict:
    """Stage 7: Combine all results into the final report JSON."""
    return {
        "vertical": parsed.get("industry", ""),
        "geography": parsed.get("geography", ""),
        "business_model": parsed.get("business_model", ""),
        **scores,
        **summary,
        "competitors": analysis.get("competitor_analysis", []),
        "market_size": search_results.get("market_size", ""),
        "key_stats": [],
        "roadmap": [],
    }


def _validate_event(event: dict) -> tuple[str, str]:
    if not isinstance(event, dict):
        raise ValueError("Event must be an object")

    report_id = event.get("report_id")
    if not isinstance(report_id, str) or not _REPORT_ID_RE.match(report_id):
        raise ValueError("Invalid report_id")

    idea_text = event.get("idea_text")
    if not isinstance(idea_text, str):
        raise ValueError("idea_text must be a string")

    return report_id, idea_text


def _now_iso_utc() -> str:
    return datetime.utcnow().isoformat()


@durable_execution
def handler(event: dict, context: DurableContext) -> dict:
    """
    Main durable function handler.
    Each context.step() is checkpointed — if the function is interrupted,
    it resumes from the last completed step.
    """
    table = _get_table()

    try:
        report_id, idea_text = _validate_event(event)
        logger.info("Pipeline started", extra={"report_id": report_id})

        # Update status to running
        table.update_item(
            Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
            UpdateExpression="SET #s = :status, started_at = :now",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": "running", ":now": _now_iso_utc()},
        )

        # IMPORTANT: do NOT checkpoint secrets in durable steps; fetch outside step.
        llm_keys = get_llm_client()

        # Stage 1: Sanitize
        sanitized = context.step(lambda _: sanitize(idea_text), name="sanitize")

        # Stage 2: Parse
        parsed = context.step(lambda _: parse(sanitized["cleaned_idea"], llm_keys), name="parse")

        # Stage 3: Search
        search_results = context.step(lambda _: search(parsed), name="search")

        # Stage 4: Analyse
        analysis = context.step(lambda _: analyse(parsed, search_results, llm_keys), name="analyse")

        # Stage 5: Score
        scores = context.step(lambda _: score(analysis), name="score")

        # Stage 6: Summarise
        summary = context.step(lambda _: summarise(analysis, scores, llm_keys), name="summarise")

        # Stage 7: Assemble
        result = context.step(
            lambda _: assemble(parsed, search_results, analysis, scores, summary),
            name="assemble",
        )

        # Write final result to DynamoDB
        table.update_item(
            Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
            UpdateExpression="SET #s = :status, result_json = :result, completed_at = :now",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":status": "complete",
                ":result": result,
                ":now": _now_iso_utc(),
            },
        )

        logger.info("Pipeline completed", extra={"report_id": report_id})
        return {"report_id": report_id, "status": "complete"}
    except Exception as e:
        # Best-effort failure marking; never leak secrets in logs or DB.
        safe_error = f"{type(e).__name__}: {str(e)[:300]}"
        logger.exception("Pipeline failed", extra={"error": safe_error})
        report_id = None
        if isinstance(event, dict):
            report_id = event.get("report_id")
        if isinstance(report_id, str) and _REPORT_ID_RE.match(report_id):
            table.update_item(
                Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
                UpdateExpression="SET #s = :status, failed_at = :now, error = :err",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":status": "failed",
                    ":now": _now_iso_utc(),
                    ":err": safe_error,
                },
            )
        raise
