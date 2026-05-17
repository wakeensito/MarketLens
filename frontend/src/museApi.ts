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

/**
 * Open the SSE stream and yield typed events as they arrive.
 *
 * The backend's prelude is consumed by the Lambda runtime — what we read here
 * is plain `text/event-stream`. Events are separated by `\n\n`; we hold a
 * trailing buffer across reads so partial frames at chunk boundaries don't
 * get parsed as broken events.
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
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseSseBlock(block);
        if (parsed) {
          const ev = toMuseEvent(parsed);
          if (ev) yield ev;
        }
        sep = buffer.indexOf('\n\n');
      }
    }
    // Flush decoder + any trailing event without a final \n\n.
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) {
      const parsed = parseSseBlock(tail);
      if (parsed) {
        const ev = toMuseEvent(parsed);
        if (ev) yield ev;
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
