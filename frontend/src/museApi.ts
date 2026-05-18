/**
 * Muse backend client — all routes are plain JSON via API Gateway behind the
 * shared CookieAuthorizer.
 *
 * Previously the chat endpoint was an SSE stream through a dedicated Lambda
 * Function URL. That path was rolled back because native Python Lambda
 * response streaming via Function URLs isn't supported the way the original
 * PR assumed (the runtime crashes with `MarshalError` trying to serialize the
 * generator return). The chat handler is now buffered; the frontend simulates
 * char-by-char streaming locally in `useMuse` so the craft is preserved.
 * See `docs/planning/BACKLOG.md` for the proper-streaming follow-up.
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

/* ─── Chat (buffered) ─── */

export type MuseChatErrorCode =
  | 'plan_locked'
  | 'limit_reached'
  | 'report_not_found'
  | 'auth_failed'
  | 'model_error'
  | 'validation';

/** Error payload shape returned by the chat route on non-2xx responses.
 *  Mirrored on the `body` field of the thrown `ApiError`. */
export interface MuseChatError {
  code: MuseChatErrorCode;
  message: string;
  limit?: number;
  used?: number;
}

export interface MuseChatResponse {
  conversation_id: string;
  message_id: string;
  content: string;
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

/** Send a chat message and await the full assistant response. */
export function sendMuseMessage(
  req: MuseChatRequest,
  options?: { signal?: AbortSignal },
): Promise<MuseChatResponse> {
  return jsonRequest<MuseChatResponse>('/api/muse/chat', {
    method: 'POST',
    body: JSON.stringify({
      report_id: req.reportId,
      message: req.message,
      conversation_id: req.conversationId,
    }),
    signal: options?.signal,
  });
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
