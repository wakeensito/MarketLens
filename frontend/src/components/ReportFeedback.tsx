import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, ThumbsDown, X, Loader2 } from 'lucide-react';

export type FeedbackRating = 'up' | 'down';

interface Props {
  reportId: string;
  /** Fires once on rating click (comment = null), and again on send if a comment is added. */
  onFeedback?: (rating: FeedbackRating, comment: string | null) => void | Promise<void>;
}

type Phase = 'prompt' | 'rated' | 'sent';

interface StoredFeedback {
  rating: FeedbackRating;
  comment: string | null;
  at: string;
}

const STORAGE_PREFIX = 'plinths-feedback-';
const COMMENT_MAX = 500;

const STAMP_EASE = 'easeOut' as const;

function storageKey(id: string) {
  return `${STORAGE_PREFIX}${id}`;
}

function readStored(id: string): StoredFeedback | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFeedback;
    if (parsed?.rating !== 'up' && parsed?.rating !== 'down') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(id: string, rating: FeedbackRating, comment: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredFeedback = { rating, comment, at: new Date().toISOString() };
    window.localStorage.setItem(storageKey(id), JSON.stringify(payload));
  } catch {
    /* quota or disabled storage — UX still works for the session */
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function ReportFeedback({ reportId, onFeedback }: Props) {
  // Lazy initializers read localStorage synchronously — no flash of 'prompt' for already-rated reports.
  // Parent passes key={reportId} so the component remounts on report change; no sync effect needed.
  const [phase, setPhase] = useState<Phase>(() => (readStored(reportId) ? 'sent' : 'prompt'));
  const [rating, setRating] = useState<FeedbackRating | null>(() => readStored(reportId)?.rating ?? null);
  const [comment, setComment] = useState<string>(() => readStored(reportId)?.comment ?? '');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reduceMotion] = useState<boolean>(() => prefersReducedMotion());

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea — CSS max-height media queries handle the per-viewport cap.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [comment, phase]);

  // Focus textarea when entering rated state (gives keyboard users an immediate compose path)
  useEffect(() => {
    if (phase === 'rated') {
      const id = window.setTimeout(() => textareaRef.current?.focus(), 80);
      return () => window.clearTimeout(id);
    }
  }, [phase]);

  async function handleRate(next: FeedbackRating) {
    setSendError(null);
    // Flip path: if already rated and clicking the OTHER thumb, swap.
    if (rating === next && phase === 'rated') return;
    setRating(next);
    setPhase('rated');
    // Persist the rating immediately — losing it on tab-close would re-prompt the user.
    writeStored(reportId, next, null);
    try {
      await onFeedback?.(next, null);
    } catch {
      /* the rating is already captured locally; the comment send path surfaces errors */
    }
  }

  async function handleSend() {
    if (!rating || sending) return;
    const trimmed = comment.trim();
    setSending(true);
    setSendError(null);
    try {
      if (trimmed.length > 0) {
        await onFeedback?.(rating, trimmed);
      }
      writeStored(reportId, rating, trimmed.length > 0 ? trimmed : null);
      setPhase('sent');
    } catch {
      setSendError("Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  function handleSkip() {
    if (!rating) return;
    writeStored(reportId, rating, null);
    setPhase('sent');
  }

  function onTextareaKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleSkip();
    }
  }

  const ratedLabel = rating === 'up' ? 'What helped most?' : 'What was off?';

  return (
    <div className="report-feedback" data-phase={phase}>
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'prompt' && (
          <motion.div
            key="prompt"
            className="report-feedback-row"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: STAMP_EASE }}
          >
            <span className="report-feedback-label">Was this useful?</span>
            <div className="report-feedback-buttons" role="group" aria-label="Rate this report">
              <button
                type="button"
                className="report-feedback-btn"
                onClick={() => handleRate('up')}
                aria-label="Useful"
              >
                <ThumbsUp size={14} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="report-feedback-btn"
                onClick={() => handleRate('down')}
                aria-label="Not useful"
              >
                <ThumbsDown size={14} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </motion.div>
        )}

        {phase === 'rated' && rating && (
          <motion.div
            key="rated"
            className="report-feedback-rated"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: STAMP_EASE }}
          >
            <div className="report-feedback-row">
              <span className="report-feedback-label">{ratedLabel}</span>
              <div className="report-feedback-buttons" role="group" aria-label="Change rating">
                {/* Stamp animation on the filled thumb — only on first mount of this rating */}
                <motion.button
                  type="button"
                  key={`up-${rating}`}
                  className={`report-feedback-btn ${rating === 'up' ? 'report-feedback-btn--filled' : 'report-feedback-btn--ghost'}`}
                  onClick={() => handleRate('up')}
                  aria-label={rating === 'up' ? 'Useful (selected)' : 'Switch to useful'}
                  aria-pressed={rating === 'up'}
                  initial={
                    rating === 'up' && !reduceMotion
                      ? { scale: 1.18, rotate: -3 }
                      : false
                  }
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.36, ease: STAMP_EASE }}
                >
                  <ThumbsUp size={14} strokeWidth={rating === 'up' ? 2.25 : 2} aria-hidden />
                </motion.button>
                <motion.button
                  type="button"
                  key={`down-${rating}`}
                  className={`report-feedback-btn ${rating === 'down' ? 'report-feedback-btn--filled' : 'report-feedback-btn--ghost'}`}
                  onClick={() => handleRate('down')}
                  aria-label={rating === 'down' ? 'Not useful (selected)' : 'Switch to not useful'}
                  aria-pressed={rating === 'down'}
                  initial={
                    rating === 'down' && !reduceMotion
                      ? { scale: 1.18, rotate: 3 }
                      : false
                  }
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.36, ease: STAMP_EASE }}
                >
                  <ThumbsDown size={14} strokeWidth={rating === 'down' ? 2.25 : 2} aria-hidden />
                </motion.button>
              </div>
              <button
                type="button"
                className="report-feedback-skip"
                onClick={handleSkip}
                aria-label="Skip optional comment"
              >
                <X size={14} strokeWidth={2} aria-hidden />
              </button>
            </div>

            <div className="report-feedback-compose">
              <textarea
                ref={textareaRef}
                className="report-feedback-textarea"
                placeholder="Optional comment"
                aria-label={`Optional comment about ${rating === 'up' ? 'what helped' : 'what was off'}`}
                value={comment}
                onChange={e => setComment(e.target.value)}
                onKeyDown={onTextareaKey}
                rows={1}
                maxLength={COMMENT_MAX}
              />
              <button
                type="button"
                className="report-feedback-send"
                onClick={handleSend}
                disabled={sending || comment.trim().length === 0}
              >
                {sending ? (
                  <>
                    <Loader2 size={12} strokeWidth={2.25} className="spin" aria-hidden />
                    Sending
                  </>
                ) : (
                  'Send'
                )}
              </button>
            </div>

            {sendError && (
              <div className="report-feedback-error" role="alert">
                <span>{sendError}</span>
                <button
                  type="button"
                  className="report-feedback-retry"
                  onClick={handleSend}
                  disabled={sending}
                >
                  Retry
                </button>
              </div>
            )}
          </motion.div>
        )}

        {phase === 'sent' && rating && (
          <motion.div
            key="sent"
            className="report-feedback-row report-feedback-row--sent"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.24, ease: STAMP_EASE }}
            role="status"
            aria-live="polite"
          >
            <span className={`report-feedback-mark report-feedback-mark--${rating}`} aria-hidden>
              {rating === 'up' ? (
                <ThumbsUp size={12} strokeWidth={2.25} />
              ) : (
                <ThumbsDown size={12} strokeWidth={2.25} />
              )}
            </span>
            <span className="report-feedback-thanks">Noted</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
