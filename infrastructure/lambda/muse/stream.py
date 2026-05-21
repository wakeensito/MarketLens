"""Muse Chat Lambda — Server-Sent Events via Lambda Function URL.

Wiring:
  Browser → CloudFront /api/muse/stream* (OAC SigV4)
         → Lambda Function URL (AuthType: AWS_IAM, InvokeMode: RESPONSE_STREAM)
         → AWS Lambda Web Adapter (extension)
         → uvicorn (localhost:8080) → Starlette ASGI app (this module)

LWA bridges the Function URL's response-streaming protocol to ordinary HTTP on a
local port, so we can use sse-starlette's EventSourceResponse without owning
the streaming wire format ourselves.

SSE contract (see docs/muse/MUSE-BACKEND-HANDOFF.md for the authoritative spec):
  event: token            → data: {"delta": "..."}     per visible chunk
  event: sentence_boundary→ data: {}                    after . ! ? outside [[…]]
  event: done             → data: {conversation_id, message_id, sources,
                                    follow_ups, tokens_in, tokens_out}
  event: error            → data: {code, message, ...} then close
  : keep-alive            → emitted by sse-starlette every 15s

Codes: validation, auth_failed, report_not_found, plan_locked, limit_reached,
model_error.
"""

from __future__ import annotations

import asyncio
import json
import os
import queue
import threading
from typing import Any, AsyncIterator

import boto3
from aws_lambda_powertools import Logger, Metrics
from aws_lambda_powertools.metrics import MetricUnit
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError
from sse_starlette.sse import EventSourceResponse, ServerSentEvent
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

import citations
import persistence
import prompts
from plinths_auth import AuthContext, verify_session_cookie


# ─── Configuration ───

_CHAT_MODEL_ID = os.environ.get("CHAT_MODEL_ID", "amazon.nova-2-lite-v1:0")
_MAX_USER_MESSAGES_PRO = int(os.environ.get("MUSE_PRO_MESSAGE_CAP", "30"))
_MAX_FREE_DAILY = int(os.environ.get("MUSE_FREE_DAILY_LIMIT", "3"))
_HISTORY_TURN_LIMIT = int(os.environ.get("MUSE_HISTORY_TURN_LIMIT", "12"))
_MAX_OUTPUT_TOKENS = int(os.environ.get("MUSE_MAX_OUTPUT_TOKENS", "1024"))
_TEMPERATURE = float(os.environ.get("MUSE_TEMPERATURE", "0.4"))

logger = Logger()
metrics = Metrics()

_bedrock = None


def _bedrock_client():
    global _bedrock
    if _bedrock is None:
        # read_timeout caps how long an orphaned worker thread can sit blocked
        # inside boto3's socket read when a client disconnects mid-stream.
        # boto3's EventStream iteration can't be interrupted from another
        # thread — `stop.is_set()` only checks *between* events — so this
        # timeout is the only thing that bounds the leak. 60s comfortably
        # covers slow first-token latencies and keeps the blast radius small.
        _bedrock = boto3.client(
            "bedrock-runtime",
            config=BotoConfig(
                read_timeout=60, connect_timeout=10, retries={"max_attempts": 2}
            ),
        )
    return _bedrock


# ─── Auth ───


def _auth_from_request(request: Request) -> AuthContext | None:
    """Verify the ml_access cookie. None means deny."""
    return verify_session_cookie(request.headers.get("cookie"))


# ─── Plan gate ───


def _check_plan_gate(plan: str, user_id: str, user_message_count: int) -> dict | None:
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


# ─── Bedrock payload ───


def _build_nova_payload(
    system_prompt: str, history: list[dict], user_message: str
) -> str:
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


# ─── Bedrock async streaming bridge ───
#
# boto3's EventStream is a synchronous iterator. We pump it on a worker thread
# and forward parsed events into an asyncio.Queue so the SSE generator can
# `await` them without blocking the event loop.


_STREAM_SENTINEL = object()


def _drain_bedrock_to_queue(
    response_body: Any, q: queue.Queue, stop: threading.Event
) -> None:
    """Worker thread: iterate Bedrock's sync EventStream, push parsed deltas
    onto a thread-safe queue. Terminates with a sentinel or an exception
    wrapper so the consumer can finish cleanly.
    """
    try:
        for event in response_body:
            if stop.is_set():
                return
            chunk = event.get("chunk", {}) if isinstance(event, dict) else {}
            payload_bytes = chunk.get("bytes")
            if not payload_bytes:
                continue
            try:
                data = json.loads(payload_bytes)
            except (json.JSONDecodeError, ValueError):
                continue
            q.put(("chunk", data))
        q.put(("done", None))
    except Exception as exc:  # noqa: BLE001 — propagate to consumer
        q.put(("error", exc))
    finally:
        q.put((_STREAM_SENTINEL, None))


async def _aiter_bedrock(response_body: Any) -> AsyncIterator[tuple[str, Any]]:
    """Convert Bedrock's sync EventStream into an async iterator. Each item is
    a ('chunk' | 'done' | 'error', payload) tuple. Cancellation is propagated
    to the worker thread via a stop event.
    """
    q: queue.Queue = queue.Queue()
    stop = threading.Event()
    worker = threading.Thread(
        target=_drain_bedrock_to_queue,
        args=(response_body, q, stop),
        daemon=True,
    )
    worker.start()
    loop = asyncio.get_running_loop()
    try:
        while True:
            item = await loop.run_in_executor(None, q.get)
            kind, payload = item
            if kind is _STREAM_SENTINEL:
                return
            yield kind, payload
            if kind in ("done", "error"):
                # Drain to the sentinel so the worker isn't left blocking on put().
                while True:
                    tail = await loop.run_in_executor(None, q.get)
                    if tail[0] is _STREAM_SENTINEL:
                        return
    finally:
        stop.set()


def _extract_delta_text(chunk: dict) -> str:
    """Pull `delta.text` from a Nova / Converse-style stream chunk.

    Nova's `invoke_model_with_response_stream` emits Converse-shaped events:
      {"messageStart": {...}}
      {"contentBlockDelta": {"delta": {"text": "..."}, "contentBlockIndex": 0}}
      {"contentBlockStop": {...}}
      {"messageStop": {"stopReason": "..."}}
      {"metadata": {"usage": {"inputTokens": N, "outputTokens": N, ...}}}

    Returns "" for non-delta event kinds (the caller separately checks for
    metadata via `_extract_usage`).
    """
    delta = chunk.get("contentBlockDelta")
    if not isinstance(delta, dict):
        return ""
    inner = delta.get("delta")
    if not isinstance(inner, dict):
        return ""
    text = inner.get("text")
    return text if isinstance(text, str) else ""


def _extract_usage(chunk: dict) -> tuple[int, int] | None:
    """Pull (input_tokens, output_tokens) from a metadata chunk; None otherwise."""
    meta = chunk.get("metadata")
    if not isinstance(meta, dict):
        return None
    usage = meta.get("usage")
    if not isinstance(usage, dict):
        return None
    try:
        return int(usage.get("inputTokens", 0)), int(usage.get("outputTokens", 0))
    except (TypeError, ValueError):
        return None


# ─── SSE event helpers ───


def _sse_error(code: str, message: str, **extra: Any) -> ServerSentEvent:
    return ServerSentEvent(
        data=json.dumps({"code": code, "message": message, **extra}), event="error"
    )


def _sse_token(delta: str) -> ServerSentEvent:
    return ServerSentEvent(data=json.dumps({"delta": delta}), event="token")


def _sse_sentence_boundary() -> ServerSentEvent:
    return ServerSentEvent(data="{}", event="sentence_boundary")


def _sse_done(payload: dict) -> ServerSentEvent:
    return ServerSentEvent(data=json.dumps(payload), event="done")


# ─── Validation ───


def _validate_request_body(body: Any) -> tuple[dict, dict | None]:
    """Returns (parsed, error_event). error_event is None when valid."""
    if not isinstance(body, dict):
        return {}, {
            "code": "validation",
            "message": "Request body must be a JSON object.",
        }
    report_id = (body.get("report_id") or "").strip()
    message = (body.get("message") or "").strip()
    conversation_id_in = body.get("conversation_id") or None
    if not report_id or not message:
        return {}, {
            "code": "validation",
            "message": "Both `report_id` and `message` are required.",
        }
    return (
        {
            "report_id": report_id,
            "message": message,
            "conversation_id_in": conversation_id_in,
        },
        None,
    )


# ─── The streaming route ───


async def chat(request: Request):
    auth = _auth_from_request(request)
    if auth is None:
        # Pre-stream auth failure: return 401 + a single SSE error frame so the
        # browser's fetch consumer sees the structured code regardless of how it
        # interprets the status. 401 also short-circuits stream rendering.
        async def fail():
            yield _sse_error("auth_failed", "Sign in to chat with Muse.")

        return EventSourceResponse(fail(), status_code=401)

    try:
        body = await request.json()
    except (json.JSONDecodeError, ValueError):
        body = None

    parsed, validation_err = _validate_request_body(body)
    if validation_err is not None:

        async def fail():
            yield _sse_error(**validation_err)

        return EventSourceResponse(fail(), status_code=400)

    return EventSourceResponse(
        _chat_stream(auth, parsed),
        # sse-starlette emits `: ping` comment frames at this cadence, which
        # keeps the CloudFront → Function URL connection alive while we wait
        # on slow first tokens from Bedrock.
        ping=15,
    )


async def _chat_stream(auth: AuthContext, parsed: dict):
    """The actual SSE producer. Yields ServerSentEvent objects in order."""
    report_id = parsed["report_id"]
    user_message = parsed["message"]
    conversation_id_in = parsed["conversation_id_in"]

    # 1. Ownership check.
    report = persistence.get_report_for_user(report_id, auth.user_id, auth.org_id)
    if report is None:
        yield _sse_error(
            "report_not_found", "That report doesn't exist or isn't yours."
        )
        return

    # 2. Load history.
    history_rows = persistence.list_messages(report_id)
    user_message_count = sum(1 for r in history_rows if r.get("role") == "user")

    # 3. Plan gate (early reject — no Bedrock spend).
    gate_error = _check_plan_gate(auth.plan, auth.user_id, user_message_count)
    if gate_error is not None:
        yield _sse_error(**gate_error)
        return

    # 4. Resolve conversation_id.
    if history_rows:
        stored_conversation_id = history_rows[0].get("conversation_id")
        if (
            conversation_id_in is not None
            and conversation_id_in != stored_conversation_id
        ):
            yield _sse_error(
                "validation", "conversation_id does not match the existing thread."
            )
            return
        conversation_id = stored_conversation_id
    else:
        conversation_id = conversation_id_in or persistence.new_id()
    history = persistence.messages_to_history(history_rows, limit=_HISTORY_TURN_LIMIT)

    # 5. Build prompt + invoke Bedrock streaming.
    result_json = report.get("result_json") if isinstance(report, dict) else None
    system_prompt = prompts.build_system_prompt(result_json)
    payload = _build_nova_payload(system_prompt, history, user_message)

    user_message_id = persistence.new_id()
    user_created_at = persistence.now_iso()
    assistant_message_id = persistence.new_id()

    try:
        response = _bedrock_client().invoke_model_with_response_stream(
            modelId=_CHAT_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=payload,
        )
    except (ClientError, BotoCoreError):
        logger.exception("Bedrock invoke_model_with_response_stream failed")
        yield _sse_error(
            "model_error", "The model is unavailable. Try again in a moment."
        )
        return

    response_body = response.get("body")
    if response_body is None:
        logger.error("Bedrock returned no body")
        yield _sse_error("model_error", "The model returned no body.")
        return

    # 6. Drain the Bedrock stream, peel off MetaStripper sentinel, emit token
    # and sentence_boundary events.
    stripper = citations.MetaStripper()
    # Rolling tail used by sentence-boundary detection. Only the last ~64 chars
    # matter (just enough to see whether an unclosed `[[` precedes the current
    # punctuation). Tracking the full visible output would make boundary
    # detection O(n²) over the response length.
    _TAIL_KEEP = 64
    visible_tail = ""
    full_chunks: list[str] = []  # only joined at end-of-stream for persistence
    tokens_in = 0
    tokens_out = 0

    try:
        async for kind, data in _aiter_bedrock(response_body):
            if kind == "error":
                # `data` is the exception the worker thread caught while
                # iterating Bedrock's EventStream. We're outside any except
                # block here, so logger.exception()'s implicit sys.exc_info()
                # would log "NoneType: None" — pass the exception explicitly
                # via exc_info so the worker-thread traceback reaches CW.
                exc_info = data if isinstance(data, BaseException) else None
                logger.error(
                    "Bedrock stream error",
                    extra={"error_type": type(data).__name__},
                    exc_info=exc_info,
                )
                yield _sse_error("model_error", "The model stream failed mid-response.")
                return
            if kind == "done":
                continue
            # kind == "chunk"
            usage = _extract_usage(data)
            if usage is not None:
                tokens_in, tokens_out = usage
                continue
            delta_text = _extract_delta_text(data)
            if not delta_text:
                continue
            visible = stripper.feed(delta_text)
            if not visible:
                continue
            yield _sse_token(visible)
            if citations.detect_sentence_boundary(visible_tail, visible):
                yield _sse_sentence_boundary()
            full_chunks.append(visible)
            visible_tail = (visible_tail + visible)[-_TAIL_KEEP:]
    except asyncio.CancelledError:
        # Client disconnected — sse-starlette signals via cancellation. Don't
        # write a partial row; the user will retry.
        logger.info("Muse stream cancelled by client", extra={"report_id": report_id})
        raise

    # Flush any held tail (in case the model output ended mid-buffer with no sentinel).
    tail = stripper.finish()
    if tail:
        yield _sse_token(tail)
        full_chunks.append(tail)

    full_text = "".join(full_chunks).strip()

    # 7. Sources + follow-ups.
    sources = [c.as_dict() for c in citations.extract_citations(full_text)]
    meta = stripper.meta()
    follow_ups_raw = meta.get("follow_ups") if isinstance(meta, dict) else None
    follow_ups: list[str] = []
    if isinstance(follow_ups_raw, list):
        for item in follow_ups_raw[:3]:
            if isinstance(item, str) and item.strip():
                follow_ups.append(item.strip())

    # 8. Persist (best-effort — the user already saw the response).
    try:
        persistence.write_pair(
            report_id=report_id,
            org_id=auth.org_id,
            conversation_id=conversation_id,
            user_message_id=user_message_id,
            user_content=user_message,
            user_created_at=user_created_at,
            assistant_message_id=assistant_message_id,
            assistant_content=full_text,
            assistant_created_at=persistence.now_iso(),
            sources=sources,
            follow_ups=follow_ups,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            model_id=_CHAT_MODEL_ID,
            plan=auth.plan,
        )
    except Exception:
        logger.exception(
            "Muse persistence failed (response already streamed)",
            extra={"report_id": report_id, "user_id": auth.user_id},
        )

    # 9. Free-tier counter (after a successful turn). Wrap broadly: any
    # transient DDB issue here would otherwise propagate through the generator
    # tear-down and we'd never emit `done` (or flush metrics).
    if auth.plan == "free":
        try:
            persistence.increment_muse_daily_count(auth.user_id)
        except Exception:
            logger.exception(
                "Muse daily counter bump failed (response already streamed)",
                extra={"user_id": auth.user_id},
            )

    try:
        metrics.add_metric(name="MuseChatTurn", unit=MetricUnit.Count, value=1)
        if tokens_in:
            metrics.add_metric(
                name="MuseTokensIn", unit=MetricUnit.Count, value=tokens_in
            )
        if tokens_out:
            metrics.add_metric(
                name="MuseTokensOut", unit=MetricUnit.Count, value=tokens_out
            )
    finally:
        # flush_metrics emits the EMF log line that CloudWatch parses; if we
        # skip this, accumulated dimensions stay in memory and never reach
        # the metrics backend.
        metrics.flush_metrics()

    yield _sse_done(
        {
            "conversation_id": conversation_id,
            "message_id": assistant_message_id,
            "sources": sources,
            "follow_ups": follow_ups,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
        }
    )


# ─── Healthcheck ───
# LWA does a TCP connection check against the listening port by default. We
# expose /health anyway so an operator can curl it during incident response.


async def health(_: Request):
    return JSONResponse({"status": "ok"})


# ─── ASGI app ───

app = Starlette(
    debug=False,
    routes=[
        Route("/muse/stream", chat, methods=["POST"]),
        Route(
            "/api/muse/stream", chat, methods=["POST"]
        ),  # CloudFront forwards full path
        Route("/health", health, methods=["GET"]),
    ],
)
