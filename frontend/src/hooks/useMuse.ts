import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';
import type { MuseFeedback, MuseTurn, MuseView } from '../components/muse/museTypes';
import {
  asMuseChatError,
  deleteMuseConversation,
  getMuseConversation,
  setMuseFeedback,
  streamMuseMessage,
  type MuseChatError,
  type MuseDonePayload,
  type MuseSyncMessage,
} from '../museApi';

/** Pause inserted after the server emits `event: sentence_boundary`. Keeps the
 *  visual rhythm Muse had during the local-simulation era now that the backend
 *  controls when boundaries fire. */
const SENTENCE_BOUNDARY_PAUSE_MS = 220;

function syncMessagesToTurns(messages: MuseSyncMessage[]): MuseTurn[] {
  return messages.map((m): MuseTurn => {
    if (m.role === 'user') {
      return { speaker: 'user', content: m.content };
    }
    return {
      speaker: 'muse',
      content: m.content,
      sources: m.sources,
      followUps: m.follow_ups,
      feedback: m.feedback ?? null,
      messageId: m.message_id,
    };
  });
}

function museErrorToString(err: MuseChatError): string {
  if (
    err.code === 'limit_reached' &&
    typeof err.used === 'number' &&
    typeof err.limit === 'number'
  ) {
    return `You've used ${err.used} of ${err.limit} messages.`;
  }
  return err.message || 'Something went wrong.';
}

/** Map any thrown error from a chat send into something a user can read.
 *  Order matters: structured chat-error code first, then any ApiError message
 *  (e.g. API Gateway's `{"message":"Unauthorized"}` when the authorizer
 *  denies — no `code` field, but the message itself is informative), then
 *  a true network-failure fallback. */
function describeSendError(e: unknown): { message: string; chatErr: MuseChatError | null } {
  const chatErr = asMuseChatError(e);
  if (chatErr) return { message: museErrorToString(chatErr), chatErr };
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 403) {
      return { message: 'Your session expired. Sign in again to keep chatting.', chatErr: null };
    }
    return { message: e.message || `Muse request failed (${e.status}).`, chatErr: null };
  }
  return { message: "Muse couldn't reach the server.", chatErr: null };
}

export interface UseMuseResult {
  enabled: boolean;
  view: MuseView;
  thread: MuseTurn[];
  /** Partial assistant text during the local streaming simulation; null when
   *  no chat is in flight. */
  streamingText: string | null;
  highlightTarget: string | null;
  /** Last user-facing error (chat errors, hydration failure, feedback save fail). */
  lastError: string | null;
  hydrating: boolean;
  /** Free-tier daily counter snapshot. Both fields are null for Pro/Max
   *  (no daily cap). `dailyLimit` is the cap; `dailyUsed` is today's count. */
  dailyUsed: number | null;
  dailyLimit: number | null;
  sendMessage: (text: string) => void;
  openReport: () => void;
  closeReport: () => void;
  toggleReport: () => void;
  cite: (target: string) => void;
  /** Re-run a muse turn — drops it + replays the prior user message. */
  regenerate: (turnIndex: number) => void;
  /** Set up/down feedback on an assistant turn. Toggles off when the same value
   *  is clicked again. Persists via POST; rolls back optimistic UI on failure. */
  setFeedback: (turnIndex: number, value: MuseFeedback) => void;
  clearThread: () => Promise<void>;
  dismissError: () => void;
}

/**
 * Owns Muse view + per-report thread state, backed by the SSE Muse Lambda.
 *
 * `enabled` is auth-gated by the caller. When disabled, the hook still runs (so
 * React's hook order stays stable) but it never touches the network and
 * `sendMessage` is a no-op.
 *
 * Chat lifecycle for a single turn:
 *  1. Append a user turn + empty placeholder muse turn, tagged with a
 *     `pendingId` so we can finalize / roll back precisely.
 *  2. POST /api/muse/stream and consume the Server-Sent Events. Each
 *     `event: token` appends to `streamingText`; `event: sentence_boundary`
 *     pauses 220ms; `event: done` finalizes the placeholder with
 *     sources/follow_ups/messageId.
 *  3. Cancellation (abort, regenerate, reportId change) closes the reader
 *     immediately via AbortController.
 *  4. On error: roll back both optimistic turns by pendingId and surface
 *     `lastError`. On `limit_reached`, snap the daily counter to the cap.
 */
export function useMuse({
  reportId,
  enabled,
}: {
  reportId: string | null;
  enabled: boolean;
}): UseMuseResult {
  const [thread, setThread] = useState<MuseTurn[]>([]);
  const [view, setView] = useState<MuseView>('idle');
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [dailyUsed, setDailyUsed] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);

  const conversationIdRef = useRef<string | null>(null);
  const inflightAbortRef = useRef<AbortController | null>(null);
  /** Bumps on every cancel; in-flight stream handlers check this and bail
   *  so a late-arriving event from an aborted fetch can't write into state. */
  const streamGenerationRef = useRef(0);

  const cancelInflight = useCallback(() => {
    if (inflightAbortRef.current) {
      inflightAbortRef.current.abort();
      inflightAbortRef.current = null;
    }
    streamGenerationRef.current += 1;
  }, []);

  // Hydrate thread on reportId / enabled change.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    cancelInflight();
    setStreamingText(null);
    setHighlightTarget(null);
    setLastError(null);

    if (!enabled || !reportId) {
      setThread([]);
      setView('idle');
      conversationIdRef.current = null;
      setHydrating(false);
      setDailyUsed(null);
      setDailyLimit(null);
      return;
    }

    let cancelled = false;
    setThread([]);
    setView('idle');
    conversationIdRef.current = null;
    setHydrating(true);

    (async () => {
      try {
        const res = await getMuseConversation(reportId);
        if (cancelled) return;
        const turns = syncMessagesToTurns(res.messages);
        conversationIdRef.current = res.conversation_id;
        setThread(turns);
        setView(turns.length > 0 ? 'chat' : 'idle');
        // Free users get muse_daily_used + muse_daily_limit; Pro/Max omit them.
        setDailyUsed(res.muse_daily_used ?? null);
        setDailyLimit(res.muse_daily_limit ?? null);
      } catch {
        if (cancelled) return;
        setLastError("Couldn't load your conversation.");
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reportId, enabled, cancelInflight]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const sendInternal = useCallback(
    async (userText: string) => {
      if (!reportId || !enabled) return;
      cancelInflight();
      setLastError(null);

      const pendingId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const userTurn: MuseTurn = { speaker: 'user', content: userText, pendingId };
      const placeholder: MuseTurn = { speaker: 'muse', content: '', pendingId };
      setThread(prev => [...prev, userTurn, placeholder]);
      setView('chat');
      setStreamingText('');

      const controller = new AbortController();
      inflightAbortRef.current = controller;
      const gen = streamGenerationRef.current;
      const isStale = () => streamGenerationRef.current !== gen;

      // Accumulator outside React state — avoids a stale-closure read when a
      // burst of `onToken` events fires before React flushes the previous setter.
      let accumulated = '';
      let doneEvent: MuseDonePayload | null = null;

      try {
        await streamMuseMessage(
          {
            reportId,
            message: userText,
            conversationId: conversationIdRef.current,
          },
          {
            onToken: delta => {
              if (isStale()) return;
              accumulated += delta;
              setStreamingText(accumulated);
            },
            onSentenceBoundary: async () => {
              if (isStale()) return;
              await new Promise(resolve =>
                window.setTimeout(resolve, SENTENCE_BOUNDARY_PAUSE_MS),
              );
              // Re-check after the pause — cancelInflight could have landed
              // during the 220ms window. Without this, the next read() loop
              // iteration would still fire onToken on a generation we no
              // longer own; the inner guard catches that, but bailing here
              // keeps the boundaries between turns crisp.
              if (isStale()) return;
            },
            onDone: payload => {
              doneEvent = payload;
            },
          },
          { signal: controller.signal },
        );

        // If a cancel landed mid-stream, don't finalize — the cancel path
        // (hydrate / regenerate / unmount) already handles the thread.
        if (controller.signal.aborted || isStale()) return;
        if (!doneEvent) {
          throw new ApiError(502, 'Muse stream ended without a done event.', null);
        }

        const finalText = accumulated;
        const done: MuseDonePayload = doneEvent;
        setStreamingText(null);
        setThread(prev => {
          const placeholderIdx = prev.findIndex(
            t => t.speaker === 'muse' && t.pendingId === pendingId,
          );
          if (placeholderIdx === -1) return prev;
          const copy = [...prev];
          copy[placeholderIdx] = {
            speaker: 'muse',
            content: finalText,
            sources: done.sources,
            followUps: done.follow_ups,
            messageId: done.message_id,
            feedback: null,
          };
          const userIdx = copy.findIndex(
            t => t.speaker === 'user' && t.pendingId === pendingId,
          );
          if (userIdx !== -1) {
            const cleaned: MuseTurn = { ...copy[userIdx] };
            delete cleaned.pendingId;
            copy[userIdx] = cleaned;
          }
          return copy;
        });
        if (done.conversation_id) {
          conversationIdRef.current = done.conversation_id;
        }
        // Free users: bump the local counter so the cap reflects immediately.
        if (dailyLimit != null) {
          setDailyUsed(prev => (prev ?? 0) + 1);
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          // Caller cancelled (reportId change, regenerate, unmount); their
          // code already cleaned up the thread, so just bail silently.
          return;
        }
        const { message, chatErr } = describeSendError(e);
        // Roll back: drop both optimistic turns by their pendingId tag.
        setStreamingText(null);
        setThread(prev => prev.filter(t => t.pendingId !== pendingId));
        setLastError(message);
        if (chatErr?.code === 'limit_reached' && dailyLimit != null) {
          setDailyUsed(dailyLimit);
        }
      } finally {
        if (inflightAbortRef.current === controller) {
          inflightAbortRef.current = null;
        }
      }
    },
    [reportId, enabled, cancelInflight, dailyLimit],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      void sendInternal(trimmed);
    },
    [sendInternal],
  );

  const regenerate = useCallback(
    (turnIndex: number) => {
      if (!reportId || !enabled) return;
      const target = thread[turnIndex];
      if (!target || target.speaker !== 'muse') return;
      const prevUser = thread[turnIndex - 1];
      if (!prevUser || prevUser.speaker !== 'user') return;
      cancelInflight();
      // Trim back to before the user turn; sendInternal re-appends both.
      // Note: the original assistant turn stays in DynamoDB; the backend
      // writes a brand-new pair. Acceptable for v1 — a dedicated regenerate
      // endpoint can supersede later.
      setThread(prev => prev.slice(0, turnIndex - 1));
      void sendInternal(prevUser.content);
    },
    [reportId, enabled, thread, cancelInflight, sendInternal],
  );

  const openReport = useCallback(() => {
    setHighlightTarget(null);
    setView('report-open');
  }, []);
  const closeReport = useCallback(() => {
    setView('chat');
    setHighlightTarget(null);
  }, []);
  const toggleReport = useCallback(() => {
    setView(v => {
      if (v === 'report-open') {
        setHighlightTarget(null);
        return 'chat';
      }
      if (v === 'chat') {
        setHighlightTarget(null);
        return 'report-open';
      }
      return v;
    });
  }, []);

  const cite = useCallback((target: string) => {
    setHighlightTarget(target);
    setView('report-open');
  }, []);

  const setFeedbackCb = useCallback(
    (turnIndex: number, value: MuseFeedback) => {
      if (!reportId || !enabled) return;
      const target = thread[turnIndex];
      if (!target || target.speaker !== 'muse') return;
      const messageId = target.messageId;
      if (!messageId) return; // Stream not finalized yet — no id to target.

      const current = target.feedback ?? null;
      const next: MuseFeedback = current === value ? null : value;

      // Keyed by messageId so a concurrent thread mutation between click and
      // server response doesn't roll back the wrong turn.
      setThread(prev =>
        prev.map(t =>
          t.speaker === 'muse' && t.messageId === messageId
            ? { ...t, feedback: next }
            : t,
        ),
      );

      void setMuseFeedback(reportId, messageId, next).catch(() => {
        setThread(prev =>
          prev.map(t =>
            t.speaker === 'muse' && t.messageId === messageId
              ? { ...t, feedback: current }
              : t,
          ),
        );
        setLastError("Couldn't save your feedback.");
      });
    },
    [reportId, enabled, thread],
  );

  const clearThread = useCallback(async () => {
    cancelInflight();
    setThread([]);
    setView('idle');
    setStreamingText(null);
    setHighlightTarget(null);
    setLastError(null);
    conversationIdRef.current = null;
    if (reportId && enabled) {
      try {
        await deleteMuseConversation(reportId);
      } catch {
        // Local state is already cleared; surface the failure so the user
        // knows the server copy may still exist.
        setLastError("Couldn't clear your conversation on the server.");
      }
    }
  }, [reportId, enabled, cancelInflight]);

  const dismissError = useCallback(() => setLastError(null), []);

  // Cleanup on unmount: abort any in-flight request + bump paint generation.
  useEffect(() => () => cancelInflight(), [cancelInflight]);

  return {
    enabled,
    view,
    thread,
    streamingText,
    highlightTarget,
    lastError,
    hydrating,
    dailyUsed,
    dailyLimit,
    sendMessage,
    openReport,
    closeReport,
    toggleReport,
    cite,
    regenerate,
    setFeedback: setFeedbackCb,
    clearThread,
    dismissError,
  };
}
