/**
 * Muse backend client.
 *
 * - Streaming chat (`POST /api/muse/stream`) → Lambda Function URL with
 *   InvokeMode=RESPONSE_STREAM, fronted by CloudFront. Native SSE.
 * - Sync routes (`GET`/`DELETE /api/muse/conversations/...`, feedback) → the
 *   shared API Gateway behind the cookie authorizer. Plain JSON.
 */
import { ApiError } from './api';
import type { MuseCitation } from './components/muse/museTypes';

const ENV_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const BASE = ENV_BASE ? ENV_BASE.replace(/\/$/, '') : '';

/* ─── Conversation hydration / delete / feedback ─── */

export interface MuseSyncMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  message_id?: string;
  sources?: MuseCitation[];
  follow_ups?: string[];
  tokens_in?: number;
  tokens_out?: number;
  feedback?: 'up' | 'down' | null;
}

export interface MuseConversationResponse {
  conversation_id: string | null;
  messages: MuseSyncMessage[];
  /** Free-tier daily counter — present only when the caller is on Free.
   *  Pro/Max omit these fields entirely (they're not subject to a daily cap). */
  muse_daily_used?: number;
  muse_daily_limit?: number;
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const upstream = init?.signal;
  if (upstream) {
    if (upstream.aborted) controller.abort();
    else upstream.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) {
      let body: unknown = null;
      try { body = await res.json(); } catch { /* response wasn't JSON */ }
      const message =
        body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'string'
          ? (body as { message: string }).message
          : body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `API ${res.status}`;
      throw new ApiError(res.status, message, body);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export function getMuseConversation(reportId: string): Promise<MuseConversationResponse> {
  return jsonRequest(`/api/muse/conversations/${encodeURIComponent(reportId)}`);
}

export function deleteMuseConversation(reportId: string): Promise<{ deleted: boolean }> {
  return jsonRequest(`/api/muse/conversations/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
  });
}

export function setMuseFeedback(
  reportId: string,
  messageId: string,
  feedback: 'up' | 'down' | null,
): Promise<{ ok: boolean; feedback: 'up' | 'down' | null }> {
  return jsonRequest(
    `/api/muse/conversations/${encodeURIComponent(reportId)}/messages/${encodeURIComponent(messageId)}/feedback`,
    {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    },
  );
}

/* ─── Streaming chat ─── */

export type MuseChatErrorCode =
  | 'plan_locked'
  | 'limit_reached'
  | 'report_not_found'
  | 'auth_failed'
  | 'model_error'
  | 'validation'
  | 'timeout';

/** Error payload shape returned by the chat route in an `event: error` frame
 *  or in a non-2xx response body. Mirrored on the `body` field of the thrown
 *  `ApiError`. */
export interface MuseChatError {
  code: MuseChatErrorCode;
  message: string;
  limit?: number;
  used?: number;
}

export interface MuseDonePayload {
  conversation_id: string;
  message_id: string;
  sources: MuseCitation[];
  follow_ups: string[];
  tokens_in: number;
  tokens_out: number;
}

export interface MuseChatRequest {
  reportId: string;
  message: string;
  conversationId: string | null;
}

export interface MuseStreamHandlers {
  onToken: (delta: string) => void | Promise<void>;
  onSentenceBoundary: () => void | Promise<void>;
  onDone: (payload: MuseDonePayload) => void;
}

/** Lowercase hex SHA-256 of a string, for the `x-amz-content-sha256` header.
 *  `crypto.subtle` is available in secure contexts (https + localhost). */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Stream a chat turn over SSE.
 *
 * Resolves after `onDone` returns; rejects with `ApiError` on `event: error`,
 * non-2xx HTTP, or network failure. Aborting the signal throws `AbortError`,
 * which `useMuse` swallows (cancellation paths already clean up the thread).
 */
export async function streamMuseMessage(
  req: MuseChatRequest,
  handlers: MuseStreamHandlers,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const body = JSON.stringify({
    report_id: req.reportId,
    message: req.message,
    conversation_id: req.conversationId,
  });

  // The stream endpoint is a Lambda function URL behind CloudFront OAC. For
  // POST, the function URL's AWS_IAM auth requires the viewer to supply the
  // SHA256 of the body in `x-amz-content-sha256` — CloudFront folds it into
  // the SigV4 signature it adds (Lambda doesn't accept unsigned payloads).
  // Without it the function URL returns 403 before the Lambda runs. The hash
  // must cover the exact bytes we send, so compute it over `body` above.
  const bodyHash = await sha256Hex(body);

  const res = await fetch(`${BASE}/api/muse/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'x-amz-content-sha256': bodyHash,
    },
    credentials: 'include',
    body,
    signal: options?.signal,
  });

  if (!res.body) {
    throw new ApiError(res.status || 500, 'Stream response had no body.', null);
  }

  // Non-2xx responses without a true SSE body (e.g. API Gateway returning a
  // plain JSON error from an authorizer timeout, or CloudFront returning HTML
  // on a 5xx) won't carry `event: error` frames — surface the structured
  // status so `describeSendError` can show something useful instead of the
  // generic "stream ended unexpectedly" fallback.
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok && !contentType.includes('text/event-stream')) {
    let body: unknown = null;
    let message: string;
    try {
      const text = await res.text();
      try {
        body = JSON.parse(text);
        message = (body as { message?: string })?.message ?? `HTTP ${res.status}`;
      } catch {
        body = text || null;
        message = text || `HTTP ${res.status}`;
      }
    } catch {
      message = `HTTP ${res.status}`;
    }
    throw new ApiError(res.status, message, body);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let sawDone = false;
  let readerCancelled = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // Normalize CRLF and bare CR to LF immediately. Proxies (CloudFront,
      // ALB) sometimes rewrite line endings; a mixed buffer breaks the
      // separator scan.
      buffer += decoder
        .decode(value, { stream: true })
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

      // Process complete events separated by blank lines (`\n\n`).
      while (true) {
        const sepIdx = buffer.indexOf('\n\n');
        if (sepIdx === -1) break;
        const rawEvent = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const parsed = parseSseEvent(rawEvent);
        if (!parsed) continue;
        if (parsed.event === 'token') {
          const delta = parsed.json?.delta;
          if (typeof delta === 'string') await handlers.onToken(delta);
        } else if (parsed.event === 'sentence_boundary') {
          await handlers.onSentenceBoundary();
        } else if (parsed.event === 'done') {
          if (parsed.json) {
            handlers.onDone(parsed.json as unknown as MuseDonePayload);
            sawDone = true;
          }
          // Server closes after `done`; stop reading. `cancel()` releases the
          // reader lock per the Streams spec — calling releaseLock() in the
          // finally would then throw, so we skip it.
          await reader.cancel();
          readerCancelled = true;
          return;
        } else if (parsed.event === 'error') {
          const code = parsed.json?.code as MuseChatErrorCode | undefined;
          const message = parsed.json?.message as string | undefined;
          throw new ApiError(
            mapErrorCodeToStatus(code),
            message ?? 'Muse encountered an error.',
            parsed.json ?? null,
          );
        }
        // Unknown event types: silently ignored (forward-compat with new
        // event kinds the server might add later).
      }
    }

    // Stream ended without an explicit `done` event. If we never saw one,
    // surface as an error so the caller doesn't show a half-finished turn.
    if (!sawDone) {
      throw new ApiError(502, 'Muse stream ended unexpectedly.', null);
    }
  } finally {
    if (!readerCancelled) {
      try { reader.releaseLock(); } catch { /* already released */ }
    }
  }
}

/* ─── SSE parser internals ─── */

type SseParsed = {
  event: string;
  data: string;
  json: Record<string, unknown> | null;
};

function parseSseEvent(raw: string): SseParsed | null {
  if (!raw) return null;
  let event = 'message';
  const dataLines: string[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    if (!rawLine) continue;
    if (rawLine.startsWith(':')) continue; // comment / keep-alive
    const colon = rawLine.indexOf(':');
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
    let value = colon === -1 ? '' : rawLine.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  const data = dataLines.join('\n');
  let json: Record<string, unknown> | null = null;
  if (data) {
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        json = parsed as Record<string, unknown>;
      }
    } catch {
      // Non-JSON data is allowed by SSE but our protocol always sends JSON.
      // Leave json=null and let the caller decide what to do.
    }
  }
  return { event, data, json };
}

function mapErrorCodeToStatus(code: MuseChatErrorCode | undefined): number {
  switch (code) {
    case 'auth_failed': return 401;
    case 'plan_locked': return 403;
    case 'limit_reached': return 429;
    case 'report_not_found': return 404;
    case 'validation': return 400;
    case 'timeout': return 504;
    case 'model_error':
    default:
      return 502;
  }
}

/** Pull the structured error payload off a chat-route ApiError, when present. */
export function asMuseChatError(err: unknown): MuseChatError | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body;
  if (!body || typeof body !== 'object') return null;
  const code = (body as { code?: unknown }).code;
  const message = (body as { message?: unknown }).message;
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  return body as MuseChatError;
}
