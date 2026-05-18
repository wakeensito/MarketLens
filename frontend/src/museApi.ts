/**
 * Muse backend client — sync routes via API Gateway + SSE stream via the
 * dedicated CloudFront → Lambda Function URL behavior.
 *
 * Why this file is separate from `api.ts`:
 *  - The stream endpoint is *not* a normal REST call. EventSource can't POST,
 *    and the response is consumed with `ReadableStream` + manual SSE framing.
 *  - The path lives at `/api/muse/stream*` (CloudFront-routed) rather than
 *    going through API Gateway, so the request still works under the existing
 *    cookie-credentialed origin policy without any new wiring.
 */
import { ApiError } from './api';
import type { MuseCitation } from './components/muse/museTypes';

const ENV_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const BASE = ENV_BASE ? ENV_BASE.replace(/\/$/, '') : '';

/* ─── Sync responses ─── */

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
  const timer = setTimeout(() => controller.abort(), 20_000);
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
        body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
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

/* ─── Streaming ─── */

export interface MuseStreamDone {
  conversation_id: string;
  message_id: string;
  tokens_in: number;
  tokens_out: number;
  sources: MuseCitation[];
  follow_ups: string[];
}

export type MuseStreamErrorCode =
  | 'plan_locked'
  | 'limit_reached'
  | 'report_not_found'
  | 'auth_failed'
  | 'model_error'
  | 'validation';

export interface MuseStreamError {
  code: MuseStreamErrorCode;
  message: string;
  limit?: number;
  used?: number;
}

export type MuseStreamEvent =
  | { type: 'token'; delta: string }
  | { type: 'sentence_boundary' }
  | { type: 'done'; data: MuseStreamDone }
  | { type: 'error'; data: MuseStreamError };

interface ParsedSseEvent {
  event: string;
  data: string;
}

function parseSseBlock(block: string): ParsedSseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(':')) continue; // blank or comment (keep-alive)
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0 && event === 'message') return null;
  return { event, data: dataLines.join('\n') };
}

function toMuseEvent(parsed: ParsedSseEvent): MuseStreamEvent | null {
  let payload: unknown = {};
  if (parsed.data) {
    try { payload = JSON.parse(parsed.data); } catch { return null; }
  }
  const obj = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  switch (parsed.event) {
    case 'token': {
      const delta = typeof obj.delta === 'string' ? obj.delta : '';
      return { type: 'token', delta };
    }
    case 'sentence_boundary':
      return { type: 'sentence_boundary' };
    case 'done':
      return { type: 'done', data: obj as unknown as MuseStreamDone };
    case 'error':
      return { type: 'error', data: obj as unknown as MuseStreamError };
    default:
      return null;
  }
}

export interface MuseStreamRequest {
  reportId: string;
  message: string;
  conversationId: string | null;
}

/** Lambda Function URL RESPONSE_STREAM prelude: JSON metadata + 8 NUL bytes. */
const LAMBDA_STREAM_PRELUDE_SEP = '\0\0\0\0\0\0\0\0';

/**
 * Strip the Function URL streaming prelude when present. CloudFront proxies the
 * raw stream, so the browser sees prelude bytes before the SSE body — unlike
 * API Gateway, which does not apply here.
 */
function stripLambdaStreamPrelude(buffer: string): { rest: string; ready: boolean } {
  const sepIdx = buffer.indexOf(LAMBDA_STREAM_PRELUDE_SEP);
  if (sepIdx !== -1) {
    return { rest: buffer.slice(sepIdx + LAMBDA_STREAM_PRELUDE_SEP.length), ready: true };
  }
  const trimmed = buffer.trimStart();
  if (trimmed.startsWith('event:') || trimmed.startsWith(':')) {
    return { rest: buffer, ready: true };
  }
  return { rest: buffer, ready: false };
}

function* parseSseBuffer(buffer: string): Generator<MuseStreamEvent, string> {
  let rest = buffer;
  let sep = rest.indexOf('\n\n');
  while (sep !== -1) {
    const block = rest.slice(0, sep);
    rest = rest.slice(sep + 2);
    const parsed = parseSseBlock(block);
    if (parsed) {
      const ev = toMuseEvent(parsed);
      if (ev) yield ev;
    }
    sep = rest.indexOf('\n\n');
  }
  return rest;
}

/**
 * Open the SSE stream and yield typed events as they arrive.
 *
 * Events are separated by `\n\n`; we hold a trailing buffer across reads so
 * partial frames at chunk boundaries don't get parsed as broken events.
 */
export async function* streamMuseMessage(
  req: MuseStreamRequest,
  options?: { signal?: AbortSignal },
): AsyncGenerator<MuseStreamEvent, void, void> {
  const res = await fetch(`${BASE}/api/muse/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      report_id: req.reportId,
      message: req.message,
      conversation_id: req.conversationId,
    }),
    signal: options?.signal,
  });
  if (!res.ok || !res.body) {
    throw new ApiError(res.status, `Muse stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let preludeStripped = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (!preludeStripped) {
        const { rest, ready } = stripLambdaStreamPrelude(buffer);
        buffer = rest;
        if (!ready) continue;
        preludeStripped = true;
      }
      buffer = yield* parseSseBuffer(buffer);
    }
    buffer += decoder.decode();
    if (!preludeStripped) {
      const { rest, ready } = stripLambdaStreamPrelude(buffer);
      buffer = rest;
      if (ready) preludeStripped = true;
    }
    const tail = buffer.trim();
    if (tail) {
      for (const ev of parseSseBuffer(tail)) yield ev;
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
