import { useCallback, useEffect, useRef, useState } from 'react';
import type { MuseFeedback, MuseTurn, MuseView } from '../components/muse/museTypes';
import {
  deleteMuseConversation,
  getMuseConversation,
  setMuseFeedback,
  streamMuseMessage,
  type MuseStreamDone,
  type MuseStreamError,
  type MuseSyncMessage,
} from '../museApi';

const SENTENCE_PAUSE_MS = 240;

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

function errorMessage(err: MuseStreamError): string {
  if (
    err.code === 'limit_reached' &&
    typeof err.used === 'number' &&
    typeof err.limit === 'number'
  ) {
    return `You've used ${err.used} of ${err.limit} messages on this report.`;
  }
  return err.message || 'Something went wrong.';
}

export interface UseMuseResult {
  enabled: boolean;
  view: MuseView;
  thread: MuseTurn[];
  /** Partial assistant text during streaming; null when no stream is active. */
  streamingText: string | null;
  highlightTarget: string | null;
  /** Last user-facing error (stream errors, hydration failure, feedback save fail). */
  lastError: string | null;
  hydrating: boolean;
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
 * Owns Muse view + per-report thread state, backed by the real Muse Lambda.
 *
 * `enabled` is plan-gated by the caller (Pro/Max → true, Free → false). When
 * disabled, the hook still runs (so React's hook order stays stable), but it
 * never touches the network and `sendMessage` is a no-op.
 *
 * The streaming model:
 *  - `token` deltas append to `streamingText` (the last muse turn renders it).
 *  - `sentence_boundary` events insert a small visual pause for cadence.
 *  - `done` finalizes the placeholder turn with sources, follow-ups, message_id.
 *  - `error` rolls back both the user and placeholder turns and surfaces a
 *    `lastError`, so the user can re-try without their question hanging unanswered.
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

  const conversationIdRef = useRef<string | null>(null);
  const streamingAbortRef = useRef<AbortController | null>(null);

  const cancelStream = useCallback(() => {
    if (streamingAbortRef.current) {
      streamingAbortRef.current.abort();
      streamingAbortRef.current = null;
    }
  }, []);

  // Hydrate thread on reportId / enabled change. Disabling clears state so a
  // Free-plan user toggling to a report that previously had a thread (eg. their
  // plan downgraded) doesn't see stale messages.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    cancelStream();
    setStreamingText(null);
    setHighlightTarget(null);
    setLastError(null);

    if (!enabled || !reportId) {
      setThread([]);
      setView('idle');
      conversationIdRef.current = null;
      setHydrating(false);
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
  }, [reportId, enabled, cancelStream]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const sendInternal = useCallback(
    async (userText: string) => {
      if (!reportId || !enabled) return;
      cancelStream();
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
      streamingAbortRef.current = controller;
      let assembledText = '';
      let doneData: MuseStreamDone | null = null;
      let streamError: string | null = null;

      try {
        for await (const event of streamMuseMessage(
          {
            reportId,
            message: userText,
            conversationId: conversationIdRef.current,
          },
          { signal: controller.signal },
        )) {
          if (event.type === 'token') {
            assembledText += event.delta;
            setStreamingText(assembledText);
          } else if (event.type === 'sentence_boundary') {
            await new Promise(r => setTimeout(r, SENTENCE_PAUSE_MS));
          } else if (event.type === 'done') {
            doneData = event.data;
          } else if (event.type === 'error') {
            streamError = errorMessage(event.data);
            break;
          }
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          // Hook unmounted or reportId changed; caller initiated cancellation.
          return;
        }
        streamError = "Muse couldn't reach the server.";
      } finally {
        if (streamingAbortRef.current === controller) {
          streamingAbortRef.current = null;
        }
      }

      if (streamError) {
        // Roll back: drop both optimistic turns by their pendingId tag so the
        // user can retry without their question hanging unanswered. Filtering
        // by tag (not by trailing index) survives concurrent regenerate /
        // hydration that may have already changed the thread shape.
        setStreamingText(null);
        setThread(prev => prev.filter(t => t.pendingId !== pendingId));
        setLastError(streamError);
        return;
      }

      setStreamingText(null);
      setThread(prev => {
        const placeholderIdx = prev.findIndex(
          t => t.speaker === 'muse' && t.pendingId === pendingId,
        );
        if (placeholderIdx === -1) return prev;
        const copy = [...prev];
        copy[placeholderIdx] = {
          speaker: 'muse',
          content: assembledText,
          sources: doneData?.sources,
          followUps: doneData?.follow_ups,
          messageId: doneData?.message_id,
          feedback: null,
        };
        // Strip the pendingId off the paired user turn so it's not still
        // marked as "in flight" once we've finalized.
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
      if (doneData?.conversation_id) {
        conversationIdRef.current = doneData.conversation_id;
      }
    },
    [reportId, enabled, cancelStream],
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
      cancelStream();
      // Trim back to before the user turn; sendInternal re-appends both.
      // Note: the original (target) assistant turn stays in DynamoDB; the
      // backend writes a brand-new pair. Acceptable for v1 — a dedicated
      // regenerate endpoint can supersede later.
      setThread(prev => prev.slice(0, turnIndex - 1));
      void sendInternal(prevUser.content);
    },
    [reportId, enabled, thread, cancelStream, sendInternal],
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
    cancelStream();
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
  }, [reportId, enabled, cancelStream]);

  const dismissError = useCallback(() => setLastError(null), []);

  // Cleanup on unmount: abort any in-flight stream.
  useEffect(() => () => cancelStream(), [cancelStream]);

  return {
    enabled,
    view,
    thread,
    streamingText,
    highlightTarget,
    lastError,
    hydrating,
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
