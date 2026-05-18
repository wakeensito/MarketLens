"""Muse Chat Lambda — buffered request/response via API Gateway.

Wiring:
  Browser → CloudFront /api/muse/chat → API Gateway → CookieAuthorizer → here

Previously this was a Function URL response-streaming handler. Native Python
response streaming via Function URL isn't supported the way the original PR
assumed (the runtime tries to JSON-serialize the generator return and crashes
with `MarshalError`). So this is now a regular buffered handler: it collects
the entire Bedrock response, persists the turn, and returns JSON. The frontend
simulates char-by-char streaming locally so the craft is preserved.

See `docs/planning/BACKLOG.md` for the proper-streaming follow-up (AWS Lambda
Web Adapter or Node.js port).

Response shape on success (HTTP 200):
  {
    "conversation_id": "...",
    "message_id": "...",
    "content": "...",
    "sources": [{kind, target, label}, ...],
    "follow_ups": ["...", "...", "..."],
    "tokens_in": N,
    "tokens_out": N
  }

Errors (HTTP 4xx/5xx) — body shape: {"code": "...", "message": "...", ...}
Codes: validation, report_not_found, limit_reached, plan_locked, model_error.

The file name is `stream.py` for historical reasons; the handler is now plain
buffered. Renaming the file would force a CloudFormation rename of the function
logical id without functional gain. Worth tidying in a separate cleanup PR.
"""

from __future__ import annotations

import json
import os
from typing import Any, Iterable

import boto3
from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.event_handler.exceptions import ServiceError
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.typing import LambdaContext
from botocore.exceptions import BotoCoreError, ClientError

import citations
import persistence
import prompts


# ─── Configuration ───

_CHAT_MODEL_ID = os.environ.get("CHAT_MODEL_ID", "amazon.nova-2-lite-v1:0")
_MAX_USER_MESSAGES_PRO = int(os.environ.get("MUSE_PRO_MESSAGE_CAP", "30"))
_MAX_FREE_DAILY = int(os.environ.get("MUSE_FREE_DAILY_LIMIT", "3"))
_HISTORY_TURN_LIMIT = int(os.environ.get("MUSE_HISTORY_TURN_LIMIT", "12"))
_MAX_OUTPUT_TOKENS = int(os.environ.get("MUSE_MAX_OUTPUT_TOKENS", "1024"))
_TEMPERATURE = float(os.environ.get("MUSE_TEMPERATURE", "0.4"))

logger = Logger()
tracer = Tracer()
metrics = Metrics()
app = APIGatewayRestResolver(strip_prefixes=["/api"])

_bedrock = None


def _bedrock_client():
    global _bedrock
    if _bedrock is None:
        _bedrock = boto3.client("bedrock-runtime")
    return _bedrock


# ─── Auth context (from API Gateway authorizer) ───


def _auth() -> dict:
    """Extract the auth context that CookieAuthorizer injects."""
    raw = app.current_event.raw_event
    authorizer = raw.get("requestContext", {}).get("authorizer", {}) or {}
    return {
        "user_id": authorizer.get("user_id", "anonymous"),
        "org_id": authorizer.get("org_id", "anonymous"),
        "is_authenticated": authorizer.get("is_authenticated", "false") == "true",
        "plan": authorizer.get("plan", "free"),
    }


# ─── Plan gates ───


def _check_plan_gate(plan: str, user_id: str, user_message_count: int) -> dict | None:
    """Return an error payload dict if the gate denies; None if allowed.

    Mirrors the same Free/Pro/Max semantics as before; only the response shape
    changes (dict for JSON response instead of SSE-framed bytes).
    """
    if plan == "free":
        used = persistence.get_muse_daily_used(user_id)
        if used >= _MAX_FREE_DAILY:
            return {
                "code": "limit_reached",
                "message": "You've used today's free Muse chats.",
                "limit": _MAX_FREE_DAILY,
                "used": used,
            }
        return None
    if plan == "pro":
        if user_message_count >= _MAX_USER_MESSAGES_PRO:
            return {
                "code": "limit_reached",
                "message": "You've reached the Pro chat limit for this report.",
                "limit": _MAX_USER_MESSAGES_PRO,
                "used": user_message_count,
            }
        return None
    if plan in ("max", "admin"):
        return None
    # Fail closed: any unrecognized plan value is treated as not allowed.
    return {
        "code": "plan_locked",
        "message": "Your account plan is not recognized. Contact support.",
    }


# ─── Bedrock invocation ───


def _build_nova_payload(
    system_prompt: str, history: list[dict], user_message: str
) -> str:
    """Amazon Nova / Bedrock Converse-compatible payload."""
    messages = [
        {"role": h["role"], "content": [{"text": h["content"]}]} for h in history
    ]
    messages.append({"role": "user", "content": [{"text": user_message}]})
    payload = {
        "system": [{"text": system_prompt}],
        "inferenceConfig": {
            "max_new_tokens": _MAX_OUTPUT_TOKENS,
            "temperature": _TEMPERATURE,
        },
        "messages": messages,
    }
    return json.dumps(payload)


def _extract_nova_response(raw_body: bytes) -> tuple[str, int, int]:
    """Pull (text, input_tokens, output_tokens) out of a Nova InvokeModel response.

    Shape: {output: {message: {content: [{text: "..."}]}}, usage: {inputTokens, outputTokens}}
    """
    payload = json.loads(raw_body)
    output = payload.get("output") or {}
    message = output.get("message") or {}
    content_blocks: Iterable[dict] = message.get("content") or []
    text_parts = [
        block.get("text", "") for block in content_blocks if isinstance(block, dict)
    ]
    text = "".join(text_parts)
    usage = payload.get("usage") or {}
    return (
        text,
        int(usage.get("inputTokens", 0)),
        int(usage.get("outputTokens", 0)),
    )


def _invoke_bedrock(payload: str) -> tuple[str, int, int]:
    """Synchronous Bedrock invocation. Returns (full_text, tokens_in, tokens_out).

    Raises `ServiceError` on Bedrock failures so the route handler maps it to a
    clean 502 with our `model_error` code.
    """
    try:
        response = _bedrock_client().invoke_model(
            modelId=_CHAT_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=payload,
        )
    except (ClientError, BotoCoreError):
        logger.exception("Bedrock invocation failed")
        raise ServiceError(502, "Bedrock invocation failed")

    body = response.get("body")
    if body is None:
        logger.error("Bedrock returned no body")
        raise ServiceError(502, "Bedrock returned no body")

    try:
        return _extract_nova_response(body.read())
    except Exception:
        logger.exception("Failed to parse Bedrock response")
        raise ServiceError(502, "Bedrock response malformed")


# ─── Chat route ───


@app.post("/muse/chat")
@tracer.capture_method
def chat():
    auth = _auth()
    if not auth["is_authenticated"]:
        return {"code": "auth_failed", "message": "Sign in to chat with Muse."}, 401

    body = app.current_event.json_body
    if not isinstance(body, dict):
        return {
            "code": "validation",
            "message": "Request body must be a JSON object.",
        }, 400

    report_id = (body.get("report_id") or "").strip()
    message = (body.get("message") or "").strip()
    conversation_id_in = body.get("conversation_id") or None

    if not report_id or not message:
        return {
            "code": "validation",
            "message": "Both `report_id` and `message` are required.",
        }, 400

    # 1. Ownership check first — a Free user POSTing an arbitrary report_id
    # gets `report_not_found` (truthful) rather than `plan_locked`.
    report = persistence.get_report_for_user(report_id, auth["user_id"], auth["org_id"])
    if report is None:
        return {
            "code": "report_not_found",
            "message": "That report doesn't exist or isn't yours.",
        }, 404

    # 2. Load history once — used by plan gate, conversation_id resolution, and
    # the model context window.
    history_rows = persistence.list_messages(report_id)
    user_message_count = sum(1 for r in history_rows if r.get("role") == "user")

    # 3. Plan gate (early reject — no Bedrock spend).
    gate_error = _check_plan_gate(auth["plan"], auth["user_id"], user_message_count)
    if gate_error is not None:
        status = 429 if gate_error["code"] == "limit_reached" else 403
        return gate_error, status

    # 4. Resolve conversation_id.
    if history_rows:
        stored_conversation_id = history_rows[0].get("conversation_id")
        if (
            conversation_id_in is not None
            and conversation_id_in != stored_conversation_id
        ):
            return {
                "code": "validation",
                "message": "conversation_id does not match the existing thread.",
            }, 400
        conversation_id = stored_conversation_id
    else:
        conversation_id = conversation_id_in or persistence.new_id()
    history = persistence.messages_to_history(history_rows, limit=_HISTORY_TURN_LIMIT)

    # 5. Build prompt + call Bedrock (synchronous, buffered).
    result_json = report.get("result_json") if isinstance(report, dict) else None
    system_prompt = prompts.build_system_prompt(result_json)
    payload = _build_nova_payload(system_prompt, history, message)

    user_message_id = persistence.new_id()
    user_created_at = persistence.now_iso()
    assistant_message_id = persistence.new_id()

    raw_text, tokens_in, tokens_out = _invoke_bedrock(payload)

    # 6. Strip the `<<MUSE_META>>{...}<<END>>` envelope from the model output
    # and extract follow-ups + the visible prose.
    stripper = citations.MetaStripper()
    visible = stripper.feed(raw_text)
    visible += stripper.finish()
    full_text = visible.strip()

    sources = [c.as_dict() for c in citations.extract_citations(full_text)]
    meta = stripper.meta()
    follow_ups_raw = meta.get("follow_ups") if isinstance(meta, dict) else None
    follow_ups: list[str] = []
    if isinstance(follow_ups_raw, list):
        for item in follow_ups_raw[:3]:
            if isinstance(item, str) and item.strip():
                follow_ups.append(item.strip())

    # 7. Persist the turn (best-effort — return 200 even if write fails so the
    # user still sees their answer; we log loudly so ops notices).
    try:
        persistence.write_pair(
            report_id=report_id,
            org_id=auth["org_id"],
            conversation_id=conversation_id,
            user_message_id=user_message_id,
            user_content=message,
            user_created_at=user_created_at,
            assistant_message_id=assistant_message_id,
            assistant_content=full_text,
            assistant_created_at=persistence.now_iso(),
            sources=sources,
            follow_ups=follow_ups,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            model_id=_CHAT_MODEL_ID,
            plan=auth["plan"],
        )
    except Exception:
        logger.exception(
            "Muse persistence failed (response already produced)",
            extra={"report_id": report_id, "user_id": auth["user_id"]},
        )

    # 8. Free tier: bump the daily counter only after a successful turn so
    # model errors don't burn quota.
    if auth["plan"] == "free":
        persistence.increment_muse_daily_count(auth["user_id"])

    metrics.add_metric(name="MuseChatTurn", unit=MetricUnit.Count, value=1)

    return {
        "conversation_id": conversation_id,
        "message_id": assistant_message_id,
        "content": full_text,
        "sources": sources,
        "follow_ups": follow_ups,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
    }


# ─── Lambda entry point ───


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def handler(event: dict, context: LambdaContext) -> Any:
    return app.resolve(event, context)
