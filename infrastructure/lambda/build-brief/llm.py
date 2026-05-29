"""Bedrock invoke helper for the Build Brief — provider-aware, with retry/backoff.

Adapted from infrastructure/lambda/ai-orchestration/app.py (token tracking
dropped — the brief is a single one-shot call, not a metered pipeline)."""

from __future__ import annotations

import json
import os
import random
import time

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from aws_lambda_powertools import Logger

logger = Logger(child=True)
bedrock = boto3.client("bedrock-runtime")

_TRANSIENT = {
    "ThrottlingException",
    "TooManyRequestsException",
    "ServiceUnavailableException",
    "InternalServerException",
    "ModelNotReadyException",
    "ModelTimeoutException",
}


def _build_payload(
    model_id: str, prompt: str, max_tokens: int, temperature: float
) -> str:
    if "anthropic" in model_id:
        return json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
            }
        )
    if "deepseek" in model_id:
        return json.dumps(
            {
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
            }
        )
    # Amazon Nova — Converse-style payload.
    return json.dumps(
        {
            "inferenceConfig": {
                "max_new_tokens": max_tokens,
                "temperature": temperature,
            },
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
        }
    )


def _extract_text(model_id: str, body: dict) -> str:
    if "anthropic" in model_id:
        return body["content"][0]["text"]
    if "deepseek" in model_id:
        return body["choices"][0]["message"]["content"]
    return body["output"]["message"]["content"][0]["text"]


def call_llm(
    prompt: str, model_id: str, max_tokens: int = 2048, temperature: float = 0.3
) -> str:
    """Invoke a Bedrock model and return its text. Retries transient errors with
    exponential backoff + jitter. Raises on exhaustion / non-retryable errors."""
    max_attempts = int(os.environ.get("LLM_MAX_ATTEMPTS", "3"))
    base_ms = int(os.environ.get("LLM_BACKOFF_BASE_MS", "400"))
    cap_ms = int(os.environ.get("LLM_BACKOFF_CAP_MS", "4000"))
    payload = _build_payload(model_id, prompt, max_tokens, temperature)

    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            resp = bedrock.invoke_model(
                modelId=model_id,
                contentType="application/json",
                accept="application/json",
                body=payload,
            )
            parsed = json.loads(resp["body"].read())
            return _extract_text(model_id, parsed)
        except (ClientError, BotoCoreError, ValueError) as e:
            last_err = e
            code = (
                e.response.get("Error", {}).get("Code")
                if isinstance(e, ClientError)
                else None
            )
            # Retry transient Bedrock errors (by code) and network failures
            # (BotoCoreError). A JSON parse failure (ValueError) won't fix itself
            # on retry, so fail fast to a 502 rather than re-spending.
            retryable = (code in _TRANSIENT) if code else isinstance(e, BotoCoreError)
            if (not retryable) or attempt >= max_attempts:
                logger.exception("Bedrock invoke failed", extra={"model_id": model_id})
                raise
            sleep_ms = min(cap_ms, base_ms * (2 ** (attempt - 1)))
            time.sleep((sleep_ms + random.uniform(0, base_ms)) / 1000.0)
    raise last_err if last_err else RuntimeError("call_llm exhausted")
