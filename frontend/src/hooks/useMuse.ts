import { useCallback, useEffect, useRef, useState } from 'react';
import type { MuseFeedback, MuseTurn, MuseView } from '../components/muse/museTypes';
import { DEMO_THREAD, MOCK_MUSE_REPLIES } from '../components/muse/mockThread';

/** Read enablement from URL (?muse=1 / ?muse=demo) and env (VITE_MUSE_PREVIEW). */
function readMuseFlag(): { enabled: boolean; demo: boolean } {
  if (typeof window === 'undefined') return { enabled: false, demo: false };
  const params = new URLSearchParams(window.location.search);
  const urlValue = params.get('muse');
  if (urlValue === 'demo') return { enabled: true, demo: true };
  if (urlValue === '1' || urlValue === 'true') return { enabled: true, demo: false };
  if (import.meta.env.VITE_MUSE_PREVIEW === 'true') return { enabled: true, demo: false };
  return { enabled: false, demo: false };
}

const THREAD_KEY_PREFIX = 'plinths-muse-thread-v2:';
const threadKey = (id: string) => `${THREAD_KEY_PREFIX}${id}`;

function isValidTurn(t: unknown): t is MuseTurn {
  if (!t || typeof t !== 'object') return false;
  const turn = t as Record<string, unknown>;
  return (
    (turn.speaker === 'user' || turn.speaker === 'muse') &&
    typeof turn.content === 'string'
  );
}

function readThread(id: string): MuseTurn[] {
  try {
    const raw = localStorage.getItem(threadKey(id));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTurn);
  } catch {
    return [];
  }
}

function writeThread(id: string, thread: MuseTurn[]) {
  try {
    if (thread.length === 0) {
      localStorage.removeItem(threadKey(id));
    } else {
      localStorage.setItem(threadKey(id), JSON.stringify(thread));
    }
  } catch {
    /* private mode / quota */
  }
}

export interface UseMuseResult {
  enabled: boolean;
  view: MuseView;
  thread: MuseTurn[];
  streamingText: string | null;
  highlightTarget: string | null;
  sendMessage: (text: string) => void;
  openReport: () => void;
  closeReport: () => void;
  toggleReport: () => void;
  cite: (target: string) => void;
  /** Re-stream a specific muse turn (replaces it with the next mock reply). */
  regenerate: (turnIndex: number) => void;
  /** Set up/down feedback on a muse turn. Toggle off by passing the same value. */
  setFeedback: (turnIndex: number, value: MuseFeedback) => void;
  clearThread: () => void;
  replayStream: () => void;
}

/** Owns Muse view + per-report thread state. No backend — all replies are canned.
 *  Threads persist in localStorage keyed by reportId so switching reports in the
 *  sidebar surfaces each report's own conversation. */
export function useMuse(reportId: string | null): UseMuseResult {
  const flagRef = useRef(readMuseFlag());
  const enabled = flagRef.current.enabled;
  const demo = flagRef.current.demo;
  const demoSeededRef = useRef(false);

  const [thread, setThread] = useState<MuseTurn[]>([]);
  const [view, setView] = useState<MuseView>('idle');
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null);
  const replyIndexRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(id => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const queueTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter(t => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  // Swap thread + view when reportId changes — per-report scoping.
  useEffect(() => {
    clearTimers();
    setStreamingText(null);
    setHighlightTarget(null);

    if (!reportId) {
      setThread([]);
      setView('idle');
      replyIndexRef.current = 0;
      return;
    }

    let initial = readThread(reportId);

    if (demo && !demoSeededRef.current && initial.length === 0) {
      initial = DEMO_THREAD;
      writeThread(reportId, initial);
      demoSeededRef.current = true;
    }

    setThread(initial);
    setView(initial.length > 0 ? 'chat' : 'idle');
    replyIndexRef.current = initial.filter(t => t.speaker === 'muse').length;
  }, [reportId, demo, clearTimers]);

  // Persist thread on change.
  useEffect(() => {
    if (!reportId) return;
    writeThread(reportId, thread);
  }, [reportId, thread]);

  /** Stream a muse turn's content character-by-character with sentence-settle pauses. */
  const startStreaming = useCallback(
    (fullText: string) => {
      let i = 0;
      setStreamingText('');
      const tick = () => {
        if (i >= fullText.length) {
          setStreamingText(null);
          return;
        }
        const ch = fullText[i];
        i += 1;
        setStreamingText(fullText.slice(0, i));
        const boundary = ch === '.' || ch === '?' || ch === '!';
        // Skip the boundary settle if inside a citation token
        const insideToken =
          fullText.lastIndexOf('[[', i - 1) > fullText.lastIndexOf(']]', i - 1);
        const delay = boundary && !insideToken
          ? 240
          : 14 + Math.random() * 18;
        queueTimer(tick, delay);
      };
      queueTimer(tick, 200);
    },
    [queueTimer],
  );

  /** Kick off a fresh stream on the just-appended turn. streamingText is set to ''
   *  immediately so the full content never flashes; startStreaming has its own
   *  small initial delay before the first token. */
  const beginStream = useCallback(
    (replyContent: string) => {
      setStreamingText('');
      startStreaming(replyContent);
    },
    [startStreaming],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !reportId) return;
      clearTimers();
      const userTurn: MuseTurn = { speaker: 'user', content: trimmed };
      const reply = MOCK_MUSE_REPLIES[replyIndexRef.current % MOCK_MUSE_REPLIES.length];
      replyIndexRef.current += 1;
      setThread(prev => [...prev, userTurn, reply]);
      setView('chat');
      beginStream(reply.content);
    },
    [reportId, clearTimers, beginStream],
  );

  const regenerate = useCallback(
    (turnIndex: number) => {
      if (!reportId) return;
      const target = thread[turnIndex];
      if (!target || target.speaker !== 'muse') return;
      clearTimers();
      const nextReply =
        MOCK_MUSE_REPLIES[replyIndexRef.current % MOCK_MUSE_REPLIES.length];
      replyIndexRef.current += 1;
      // Replace the target turn with a fresh reply (rotated through mock pool)
      setThread(prev => {
        const copy = [...prev];
        copy[turnIndex] = nextReply;
        return copy.slice(0, turnIndex + 1); // also drop anything after for honesty
      });
      beginStream(nextReply.content);
    },
    [reportId, thread, clearTimers, beginStream],
  );

  const openReport = useCallback(() => setView('report-open'), []);
  const closeReport = useCallback(() => {
    setView('chat');
    queueTimer(() => setHighlightTarget(null), 1200);
  }, [queueTimer]);
  const toggleReport = useCallback(() => {
    setView(v => (v === 'report-open' ? 'chat' : v === 'chat' ? 'report-open' : v));
  }, []);

  const cite = useCallback((target: string) => {
    setHighlightTarget(target);
    setView('report-open');
  }, []);

  const setFeedback = useCallback(
    (turnIndex: number, value: MuseFeedback) => {
      setThread(prev => {
        const target = prev[turnIndex];
        if (!target || target.speaker !== 'muse') return prev;
        const next = [...prev];
        const current = target.feedback ?? null;
        // Toggle off if the same value is clicked again
        next[turnIndex] = {
          ...target,
          feedback: current === value ? null : value,
        };
        return next;
      });
    },
    [],
  );

  const clearThread = useCallback(() => {
    clearTimers();
    setThread([]);
    setView('idle');
    setStreamingText(null);
    setHighlightTarget(null);
    replyIndexRef.current = 0;
    if (reportId) writeThread(reportId, []);
  }, [reportId, clearTimers]);

  const replayStream = useCallback(() => {
    const last = thread[thread.length - 1];
    if (!last || last.speaker !== 'muse') return;
    clearTimers();
    beginStream(last.content);
  }, [thread, clearTimers, beginStream]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    enabled,
    view,
    thread,
    streamingText,
    highlightTarget,
    sendMessage,
    openReport,
    closeReport,
    toggleReport,
    cite,
    regenerate,
    setFeedback,
    clearThread,
    replayStream,
  };
}
