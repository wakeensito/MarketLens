import { useCallback, useEffect, useRef, useState } from 'react';
import type { MuseFeedback, MuseTurn, MuseView } from '../components/muse/museTypes';
import {
  asMuseChatError,
  deleteMuseConversation,
  getMuseConversation,
  sendMuseMessage,
  setMuseFeedback,
  type MuseChatError,
  type MuseSyncMessage,
} from '../museApi';

/** Char-pacing constants for the local streaming simulation. The server is
 *  buffered, so we already have the full text — we just paint it gradually
 *  so the cursor + per-char rhythm still feel right. Numbers picked to land
 *  a typical 200-char answer at ~3s of paint time. */
const LOCAL_STREAM_CHAR_MS = 12;
const LOCAL_STREAM_JITTER_MS = 14;
const LOCAL_STREAM_SENTENCE_PAUSE_MS = 220;

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
 * Owns Muse view + per-report thread state, backed by the (buffered) Muse Lambda.
 *
 * `enabled` is auth-gated by the caller. When disabled, the hook still runs (so
 * React's hook order stays stable) but it never touches the network and
 * `sendMessage` is a no-op.
 *
 * Chat lifecycle for a single turn:
 *  1. Append a user turn + empty placeholder muse turn, tagged with a
 *     `pendingId` so we can finalize / roll back precisely.
 *  2. POST /api/muse/chat and await the JSON response (the server does Bedrock
 *     synchronously and returns the full answer).
 *  3. Paint the answer char-by-char into `streamingText` so the cursor + rhythm
 *     match the original streaming craft. Sentence boundaries get a brief
 *     settle. Cancellation (abort, regenerate, reportId change) drops the
 *     paint loop immediately.
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
  /** Bumps on every cancel; the local paint loop checks this and bails. */
  const paintGenerationRef = useRef(0);

  const cancelInflight = useCallback(() => {
    if (inflightAbortRef.current) {
      inflightAbortRef.current.abort();
      inflightAbortRef.current = null;
    }
    paintGenerationRef.current += 1;
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

  /** Paint `fullText` into `streamingText` over time. Bails immediately if
   *  `cancelInflight` (or anything else that bumps the generation) is called. */
  const paintLocally = useCallback((fullText: string): Promise<void> => {
    const gen = ++paintGenerationRef.current;
    setStreamingText('');
    return new Promise<void>(resolve => {
      let i = 0;
      const tick = () => {
        // Cancelled — drop the paint silently. Caller decides what to render.
        if (paintGenerationRef.current !== gen) {
          resolve();
          return;
        }
        if (i >= fullText.length) {
          resolve();
          return;
        }
        const ch = fullText[i];
        i += 1;
        setStreamingText(fullText.slice(0, i));
        const insideToken =
          fullText.lastIndexOf('[[', i - 1) > fullText.lastIndexOf(']]', i - 1);
        const isBoundary = (ch === '.' || ch === '?' || ch === '!') && !insideToken;
        const delay = isBoundary
          ? LOCAL_STREAM_SENTENCE_PAUSE_MS
          : LOCAL_STREAM_CHAR_MS + Math.random() * LOCAL_STREAM_JITTER_MS;
        window.setTimeout(tick, delay);
      };
      tick();
    });
  }, []);

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

      try {
        const res = await sendMuseMessage(
          {
            reportId,
            message: userText,
            conversationId: conversationIdRef.current,
          },
          { signal: controller.signal },
        );

        // Paint locally for the streaming craft, then finalize.
        await paintLocally(res.content);
        // If a cancel landed during the paint, don't finalize — the cancel
        // path (hydrate / regenerate / unmount) already handles the thread.
        if (controller.signal.aborted) return;

        setStreamingText(null);
        setThread(prev => {
          const placeholderIdx = prev.findIndex(
            t => t.speaker === 'muse' && t.pendingId === pendingId,
          );
          if (placeholderIdx === -1) return prev;
          const copy = [...prev];
          copy[placeholderIdx] = {
            speaker: 'muse',
            content: res.content,
            sources: res.sources,
            followUps: res.follow_ups,
            messageId: res.message_id,
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
        if (res.conversation_id) {
          conversationIdRef.current = res.conversation_id;
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
        const chatErr = asMuseChatError(e);
        const message = chatErr ? museErrorToString(chatErr) : "Muse couldn't reach the server.";
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
    [reportId, enabled, cancelInflight, dailyLimit, paintLocally],
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
