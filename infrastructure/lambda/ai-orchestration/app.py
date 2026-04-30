"""
MarketLens AI Orchestration — Durable Function pipeline.

Stages: sanitize → parse → search → analyse → score → summarise → assemble
Each stage is a durable step with automatic checkpointing and retry.
"""
import os
import json
import boto3
import random
import time
from datetime import datetime

from aws_lambda_powertools import Logger, Tracer
from aws_durable_execution_sdk_python import durable_execution, DurableContext
from botocore.exceptions import BotoCoreError, ClientError

logger = Logger()
tracer = Tracer()

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["REPORTS_TABLE"])
bedrock = boto3.client("bedrock-runtime")
MODEL_ID = os.environ["BEDROCK_MODEL_ID"]


def _set_stage(report_id: str, stage: str) -> None:
    table.update_item(
        Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
        UpdateExpression="SET current_stage = :stage",
        ExpressionAttributeValues={":stage": stage},
    )


def call_llm(prompt: str, max_tokens: int = 1024) -> str:
    """Call Bedrock Claude and return the text response."""
    max_attempts = int(os.environ.get("LLM_MAX_ATTEMPTS", "3"))
    backoff_base_ms = int(os.environ.get("LLM_BACKOFF_BASE_MS", "400"))
    backoff_cap_ms = int(os.environ.get("LLM_BACKOFF_CAP_MS", "4000"))

    transient_codes = {
        "ThrottlingException",
        "TooManyRequestsException",
        "ServiceUnavailableException",
        "InternalServerException",
        "ModelNotReadyException",
        "ModelTimeoutException",
    }

    payload = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    })

    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = bedrock.invoke_model(
                modelId=MODEL_ID,
                contentType="application/json",
                accept="application/json",
                body=payload,
            )

            raw = response["body"].read()
            try:
                parsed = json.loads(raw)
            except Exception as e:
                raise ValueError(f"Bedrock response JSON parse failed: {e}") from e

            try:
                return parsed["content"][0]["text"]
            except Exception as e:
                raise ValueError("Bedrock response missing expected content text") from e
        except (ClientError, BotoCoreError, ValueError) as e:
            last_err = e
            code = None
            if isinstance(e, ClientError):
                code = e.response.get("Error", {}).get("Code")

            retryable = isinstance(e, ValueError) or (code in transient_codes if code else True)
            if (not retryable) or attempt >= max_attempts:
                logger.exception(
                    "Bedrock invoke failed",
                    extra={"attempt": attempt, "max_attempts": max_attempts, "error_code": code},
                )
                raise

            backoff_ms = min(backoff_cap_ms, backoff_base_ms * (2 ** (attempt - 1)))
            jitter_ms = random.randint(0, 250)
            sleep_s = (backoff_ms + jitter_ms) / 1000.0
            logger.warning(
                "Bedrock invoke transient failure; retrying",
                extra={"attempt": attempt, "sleep_s": sleep_s, "error_code": code},
            )
            time.sleep(sleep_s)

    raise RuntimeError(f"Bedrock invoke failed after {max_attempts} attempts: {last_err}")


def sanitize(idea_text: str) -> dict:
    """Stage 1: Validate and clean input."""
    cleaned = idea_text.strip()
    if len(cleaned) < 5:
        raise ValueError("Idea text too short")
    if len(cleaned) > 2000:
        cleaned = cleaned[:2000]
    return {"cleaned_idea": cleaned}


def parse(cleaned_idea: str) -> dict:
    """Stage 2: Extract industry, geography, business model via LLM."""
    prompt = f"""Analyze this business idea and extract structured information.
Return ONLY valid JSON with these fields:
- industry: the primary industry/vertical
- geography: target market geography
- business_model: type of business model (SaaS, marketplace, etc.)
- keywords: list of 3-5 search keywords for competitor research

Business idea: {cleaned_idea}"""

    response = call_llm(prompt, max_tokens=512)
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        return {
            "industry": "Technology",
            "geography": "Global",
            "business_model": "Unknown",
            "keywords": [cleaned_idea],
        }


def search(parsed: dict) -> dict:
    """Stage 3: Search for competitors, market size, trends."""
    keywords = parsed.get("keywords", [])
    industry = parsed.get("industry", "")

    prompt = f"""Based on the industry "{industry}" and keywords {keywords},
list 5 real competitors with their name, one-line description, and approximate founding year.
Return ONLY valid JSON as a list of objects with fields: name, description, founded_year, url"""

    response = call_llm(prompt, max_tokens=1024)
    try:
        competitors = json.loads(response)
    except json.JSONDecodeError:
        competitors = []

    return {
        "competitors": competitors if isinstance(competitors, list) else [],
        "market_size": "Estimated via AI",
        "trends": [],
    }


def analyse(parsed: dict, search_results: dict) -> dict:
    """Stage 4: Synthesize competitor list with positioning via LLM."""
    competitors = search_results.get("competitors", [])
    industry = parsed.get("industry", "")

    prompt = f"""You are a market analyst. Given these competitors in the {industry} space:
{json.dumps(competitors, indent=2)}

Analyze the competitive landscape. Return ONLY valid JSON with:
- competitor_analysis: list of objects with name, strength, weakness, market_position
- positioning: one sentence on how a new entrant could differentiate
- market_gaps: list of 2-3 underserved areas"""

    response = call_llm(prompt, max_tokens=1024)
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        return {
            "competitor_analysis": [],
            "positioning": "Differentiation opportunity exists.",
            "market_gaps": [],
        }


def score(analysis: dict, search_results: dict) -> dict:
    """Stage 5: Compute saturation, difficulty, opportunity scores."""
    num_competitors = len(search_results.get("competitors", []))
    num_gaps = len(analysis.get("market_gaps", []))

    saturation = min(95, max(10, num_competitors * 15))
    difficulty = min(95, max(15, saturation + 10 - num_gaps * 5))
    opportunity = min(95, max(10, 100 - saturation + num_gaps * 10))

    if saturation <= 40:
        label = "Low Saturation"
    elif saturation <= 65:
        label = "Moderate Saturation"
    else:
        label = "High Saturation"

    return {
        "saturation_score": saturation,
        "saturation_label": label,
        "difficulty_score": difficulty,
        "opportunity_score": opportunity,
        "key_stats": [
            {"label": "Saturation", "value": f"{saturation}/100"},
            {"label": "Difficulty", "value": f"{difficulty}/100"},
            {"label": "Opportunity", "value": f"{opportunity}/100"},
            {"label": "Competitors Found", "value": str(num_competitors)},
        ],
    }


def summarise(analysis: dict, scores: dict, parsed: dict) -> dict:
    """Stage 6: Generate beginner-friendly explanation and gap analysis via LLM."""
    prompt = f"""You are writing a market intelligence brief for a non-technical founder.

Industry: {parsed.get('industry', '')}
Business model: {parsed.get('business_model', '')}
Saturation score: {scores['saturation_score']}/100 ({scores['saturation_label']})
Difficulty score: {scores['difficulty_score']}/100
Opportunity score: {scores['opportunity_score']}/100
Market gaps: {json.dumps(analysis.get('market_gaps', []))}

Write a brief with these sections. Return ONLY valid JSON with:
- oneliner: one sentence summary of the market opportunity
- gaps: list of objects with title and description (2-3 gaps)
- trend_signal: one sentence on market trends
- recommendation: 2-3 sentence actionable recommendation
- roadmap: list of 3-4 objects with phase, title, description for market entry"""

    response = call_llm(prompt, max_tokens=1500)
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        return {
            "oneliner": "Analysis complete. Review the scores above for market positioning.",
            "gaps": [],
            "trend_signal": "Market data analyzed.",
            "recommendation": "Review the competitor analysis for entry opportunities.",
            "roadmap": [],
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
    }


@durable_execution
def handler(event: dict, context: DurableContext) -> dict:
    """
    Main durable function handler.
    Each context.step() is checkpointed — if the function is interrupted,
    it resumes from the last completed step.
    """
    report_id = event.get("report_id")
    idea_text = event.get("idea_text")

    logger.info("Pipeline started", extra={"report_id": report_id})

    try:
        # Update status to running
        table.update_item(
            Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
            UpdateExpression="SET #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": "running"},
        )

        # Stage 1: Sanitize
        sanitized = context.step(lambda _: sanitize(idea_text), name="sanitize")
        _set_stage(report_id, "sanitize")

        # Stage 2: Parse
        parsed = context.step(lambda _: parse(sanitized["cleaned_idea"]), name="parse")
        _set_stage(report_id, "parse")

        # Stage 3: Search
        search_results = context.step(lambda _: search(parsed), name="search")
        _set_stage(report_id, "search")

        # Stage 4: Analyse
        analysis = context.step(lambda _: analyse(parsed, search_results), name="analyse")
        _set_stage(report_id, "analyse")

        # Stage 5: Score
        scores = context.step(lambda _: score(analysis, search_results), name="score")
        _set_stage(report_id, "score")

        # Stage 6: Summarise
        summary = context.step(lambda _: summarise(analysis, scores, parsed), name="summarise")
        _set_stage(report_id, "summarise")

        # Stage 7: Assemble
        result = context.step(
            lambda _: assemble(parsed, search_results, analysis, scores, summary),
            name="assemble",
        )
        _set_stage(report_id, "assemble")

        # Write final result to DynamoDB
        now = datetime.utcnow().isoformat()
        table.update_item(
            Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
            UpdateExpression="SET #s = :status, result_json = :result, completed_at = :now",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":status": "complete",
                ":result": result,
                ":now": now,
            },
        )

        logger.info("Pipeline completed", extra={"report_id": report_id})
        return {"report_id": report_id, "status": "complete"}
    except Exception as e:
        logger.exception("Pipeline failed", extra={"report_id": report_id})
        if report_id:
            now = datetime.utcnow().isoformat()
            table.update_item(
                Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
                UpdateExpression="SET #s = :status, error_message = :error_message, completed_at = :now",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":status": "failed",
                    ":error_message": str(e),
                    ":now": now,
                },
            )
        raise
