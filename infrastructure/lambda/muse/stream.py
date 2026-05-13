"""Muse Stream Lambda — SSE response streaming via Function URL.

Wiring:
  Browser → CloudFront /api/muse/stream* (OAC, AllViewerExceptHostHeader)
         → Lambda Function URL (AuthType: NONE, InvokeMode: RESPONSE_STREAM)
         → this handler

Auth is verified inside this Lambda using the shared `plinths_auth` layer —
Function URLs only support `AuthType: NONE` or `AWS_IAM`, neither of which
composes with the existing HttpOnly cookie session.

Output: `text/event-stream`. Event types emitted, in order:
  - `token` (multiple): {"delta": "..."}
  - `sentence_boundary` (multiple): {}
  - `done` (exactly one): {conversation_id, message_id, tokens_in, tokens_out,
                           sources, follow_ups}
  - `error` (at most one — terminates the stream): {code, message, ...}

A `: keep-alive` SSE comment is emitted every ~15s while waiting on the first
Bedrock chunk so CloudFront doesn't idle-disconnect.

Per the handoff: response streaming for Python Lambda on Function URLs uses
the generator-yielding handler — the runtime stitches yielded bytes into the
chunked HTTP body. No `awslambda.streamifyResponse` shim required.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from queue import Empty, Queue
from typing import Any, Generator, Iterable

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from plinths_auth import AuthContext, verify_session_cookie

import citations
import persistence
import prompts


# ─── Configuration ───

_CHAT_MODEL_ID = os.environ.get("CHAT_MODEL_ID", "amazon.nova-2-lite-v1:0")
_MAX_USER_MESSAGES_PRO = int(os.environ.get("MUSE_PRO_MESSAGE_CAP", "30"))
_HISTORY_TURN_LIMIT = int(os.environ.get("MUSE_HISTORY_TURN_LIMIT", "12"))
_MAX_OUTPUT_TOKENS = int(os.environ.get("MUSE_MAX_OUTPUT_TOKENS", "1024"))
_TEMPERATURE = float(os.environ.get("MUSE_TEMPERATURE", "0.4"))
_HEARTBEAT_INTERVAL_SEC = 15.0

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

_bedrock = None


def _bedrock_client():
    global _bedrock
    if _bedrock is None:
        _bedrock = boto3.client("bedrock-runtime")
    return _bedrock


# ─── SSE framing ───


def _sse_event(event: str, data: dict | None = None) -> bytes:
    payload = json.dumps(data or {}, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n".encode("utf-8")


def _sse_keepalive() -> bytes:
    return b": keep-alive\n\n"


def _sse_error(code: str, message: str, **extra: Any) -> bytes:
    return _sse_event("error", {"code": code, "message": message, **extra})


# ─── Cookie extraction from a Function URL event ───


def _cookie_header_from_function_url_event(event: dict) -> str:
    """Function URL events expose cookies in two places: `headers.cookie` and
    `cookies: ["k=v", ...]`. Try both."""
    headers = event.get("headers") or {}
    header_cookie = headers.get("cookie") or headers.get("Cookie") or ""
    if header_cookie:
        return header_cookie
    cookie_list = event.get("cookies") or []
    return "; ".join(cookie_list) if cookie_list else ""


# ─── Plan gates ───


def _check_plan_gate(plan: str, report_id: str) -> tuple[bool, bytes | None]:
    """Returns (allowed, error_event_or_None)."""
    if plan == "free":
        return False, _sse_error(
            "plan_locked",
            "Upgrade to Pro to chat with Muse.",
        )
    if plan == "pro":
        used = persistence.count_user_messages(report_id)
        if used >= _MAX_USER_MESSAGES_PRO:
            return False, _sse_error(
                "limit_reached",
                "You've reached the Pro chat limit for this report.",
                limit=_MAX_USER_MESSAGES_PRO,
                used=used,
            )
    # `max` and `admin`: no cap.
    return True, None


# ─── Bedrock streaming ───


def _build_nova_payload(
    system_prompt: str, history: list[dict], user_message: str
) -> str:
    """Amazon Nova / Bedrock Converse-compatible payload.

    System prompt goes in the dedicated `system` field; conversation turns go
    in `messages` (each message wraps content blocks).
    """
    messages = [
        {"role": h["role"], "content": [{"text": h["content"]}]}
        for h in history
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


def _iter_bedrock_deltas(
    response_body: Iterable[dict],
) -> Generator[tuple[str | None, int | None, int | None], None, None]:
    """Yield (text_delta, input_tokens, output_tokens) tuples.

    For Nova:
      - `contentBlockDelta`: payload `{delta: {text: "..."}}` → yield text
      - `metadata`: payload `{usage: {inputTokens, outputTokens}}` → yield usage
      - other events (messageStart/Stop, contentBlockStart/Stop) → skipped
    """
    for raw_event in response_body:
        chunk = raw_event.get("chunk")
        if not chunk or "bytes" not in chunk:
            continue
        try:
            payload = json.loads(chunk["bytes"])
        except (json.JSONDecodeError, ValueError):
            continue
        if "contentBlockDelta" in payload:
            delta = payload["contentBlockDelta"].get("delta") or {}
            text = delta.get("text")
            if text:
                yield (text, None, None)
        elif "metadata" in payload:
            usage = payload["metadata"].get("usage") or {}
            yield (
                None,
                int(usage.get("inputTokens", 0)),
                int(usage.get("outputTokens", 0)),
            )


def _stream_bedrock_async(
    payload: str, out: Queue
) -> None:
    """Run Bedrock streaming in a worker thread; push events onto `out`.

    Events:
      ("delta", str)
      ("usage", (int, int))
      ("error", (code, message))
      ("end", None)
    """
    try:
        response = _bedrock_client().invoke_model_with_response_stream(
            modelId=_CHAT_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=payload,
        )
    except (ClientError, BotoCoreError) as e:
        out.put(("error", ("model_error", f"Bedrock invocation failed: {e}")))
        out.put(("end", None))
        return

    body = response.get("body")
    if body is None:
        out.put(("error", ("model_error", "Bedrock returned no body")))
        out.put(("end", None))
        return

    try:
        for text, in_tok, out_tok in _iter_bedrock_deltas(body):
            if text is not None:
                out.put(("delta", text))
            elif in_tok is not None or out_tok is not None:
                out.put(("usage", (in_tok or 0, out_tok or 0)))
    except Exception as e:  # defensive — Bedrock streams sometimes raise mid-iter
        out.put(("error", ("model_error", f"Bedrock stream interrupted: {e}")))
    finally:
        out.put(("end", None))


# ─── Main streaming loop ───


def _stream_response(
    auth: AuthContext, body: dict
) -> Generator[bytes, None, None]:
    """Yield SSE-framed bytes for the entire turn lifecycle."""
    report_id = (body.get("report_id") or "").strip()
    message = (body.get("message") or "").strip()
    conversation_id = body.get("conversation_id") or None

    if not report_id or not message:
        yield _sse_error(
            "validation",
            "Both `report_id` and `message` are required.",
        )
        return

    # 1. Plan gate (early reject — no Bedrock call billed).
    allowed, gate_event = _check_plan_gate(auth.plan, report_id)
    if not allowed:
        assert gate_event is not None
        yield gate_event
        return

    # 2. Confirm the report exists and is owned by the caller.
    report = persistence.get_report_for_user(report_id, auth.user_id, auth.org_id)
    if report is None:
        yield _sse_error(
            "report_not_found",
            "That report doesn't exist or isn't yours.",
        )
        return

    # 3. Load history and resolve conversation_id.
    history_rows = persistence.list_messages(report_id)
    if conversation_id is None:
        conversation_id = (
            history_rows[0].get("conversation_id")
            if history_rows
            else persistence.new_id()
        )
    history = persistence.messages_to_history(history_rows, limit=_HISTORY_TURN_LIMIT)

    # 4. Build prompt + invoke Bedrock in a worker thread so we can interleave
    # keep-alives while waiting for the first delta.
    result_json = report.get("result_json") if isinstance(report, dict) else None
    system_prompt = prompts.build_system_prompt(result_json)
    payload = _build_nova_payload(system_prompt, history, message)

    queue: Queue = Queue()
    worker = threading.Thread(
        target=_stream_bedrock_async, args=(payload, queue), daemon=True
    )
    worker.start()

    user_message_id = persistence.new_id()
    user_created_at = persistence.now_iso()
    assistant_message_id = persistence.new_id()

    stripper = citations.MetaStripper()
    visible_text_buffer = ""
    tokens_in = 0
    tokens_out = 0
    last_activity = time.time()
    error_emitted: tuple[str, str] | None = None

    while True:
        try:
            event = queue.get(timeout=1.0)
        except Empty:
            if time.time() - last_activity >= _HEARTBEAT_INTERVAL_SEC:
                yield _sse_keepalive()
                last_activity = time.time()
            continue

        kind, payload_val = event
        if kind == "delta":
            last_activity = time.time()
            visible = stripper.feed(payload_val)
            if visible:
                # Emit sentence-boundary BEFORE we extend the buffer so the
                # boundary marker arrives in lockstep with the punctuation.
                if citations.detect_sentence_boundary(visible_text_buffer, visible):
                    yield _sse_event("token", {"delta": visible})
                    visible_text_buffer += visible
                    yield _sse_event("sentence_boundary", {})
                else:
                    yield _sse_event("token", {"delta": visible})
                    visible_text_buffer += visible
        elif kind == "usage":
            tokens_in, tokens_out = payload_val
        elif kind == "error":
            error_emitted = payload_val
            # Continue draining the queue until "end" — the worker thread will
            # always push "end" after "error".
        elif kind == "end":
            break

    # Flush any held tail (handles a stream that ended without ever reaching
    # the META_START sentinel — unlikely but possible if the model misbehaved).
    tail = stripper.finish()
    if tail:
        yield _sse_event("token", {"delta": tail})
        visible_text_buffer += tail

    if error_emitted is not None:
        code, msg = error_emitted
        yield _sse_error(code, msg)
        return

    # 5. Build the final assembled prose and meta payload.
    full_text = visible_text_buffer.strip()
    sources = [c.as_dict() for c in citations.extract_citations(full_text)]
    meta = stripper.meta()
    follow_ups_raw = meta.get("follow_ups") if isinstance(meta, dict) else None
    follow_ups: list[str] = []
    if isinstance(follow_ups_raw, list):
        for item in follow_ups_raw[:3]:
            if isinstance(item, str) and item.strip():
                follow_ups.append(item.strip())

    # 6. Persist the turn (best-effort — even on persistence failure we still
    # send `done` so the user sees the response). Done after `done` would mean
    # the assistant text is wasted if Lambda is killed mid-shutdown.
    try:
        persistence.write_pair(
            report_id=report_id,
            org_id=auth.org_id,
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
            plan=auth.plan,
        )
    except Exception:
        logger.exception("Muse persistence failed (turn already streamed)")

    # 7. Emit `done`.
    yield _sse_event(
        "done",
        {
            "conversation_id": conversation_id,
            "message_id": assistant_message_id,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "sources": sources,
            "follow_ups": follow_ups,
        },
    )


# ─── Lambda entry point ───


def _parse_body(event: dict) -> dict | None:
    """Parse JSON body from a Function URL event (base64 or plain)."""
    raw = event.get("body")
    if raw is None:
        return None
    if event.get("isBase64Encoded"):
        import base64

        try:
            raw = base64.b64decode(raw).decode("utf-8")
        except Exception:
            return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def handler(event: dict, context) -> Generator[bytes, None, None]:
    """Function URL streaming handler. The runtime stitches yielded bytes into
    the chunked HTTP response body."""
    # Reject non-POST early. Function URL's CORS preflight (OPTIONS) is
    # handled by AWS automatically when CORS is configured on the URL.
    method = (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", "POST")
    )
    if method != "POST":
        yield _sse_error("validation", f"Method {method} not allowed.")
        return

    cookie_header = _cookie_header_from_function_url_event(event)
    auth = verify_session_cookie(cookie_header)
    if auth is None:
        yield _sse_error("auth_failed", "Sign in to chat with Muse.")
        return

    body = _parse_body(event)
    if body is None:
        yield _sse_error("validation", "Request body must be valid JSON.")
        return

    try:
        yield from _stream_response(auth, body)
    except Exception:
        logger.exception("Muse stream crashed")
        yield _sse_error("model_error", "Muse hit an unexpected error.")
