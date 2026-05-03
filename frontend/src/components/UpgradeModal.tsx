import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap } from 'lucide-react';

interface Props {
  isOpen:       boolean;
  onClose:      () => void;
  onViewPlans:  () => void;
  /** "rate-limit" — fired automatically when the daily quota is exhausted (default).
   *  "proactive" — fired by the user clicking "Upgrade Plan" themselves. */
  variant?:     'rate-limit' | 'proactive';
}

const FREE_PLAN_LIMIT = 3;

function timeUntilReset(): string {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  const diff = reset.getTime() - now.getTime();
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function UpgradeModal({ isOpen, onClose, onViewPlans, variant = 'rate-limit' }: Props) {
  const isRateLimit = variant === 'rate-limit';
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [resetIn, setResetIn] = useState<string>(() => timeUntilReset());

  // Tick the countdown while the modal is open so it doesn't go stale.
  useEffect(() => {
    if (!isOpen || !isRateLimit) return;
    setResetIn(timeUntilReset());
    const id = setInterval(() => setResetIn(timeUntilReset()), 60_000);
    return () => clearInterval(id);
  }, [isOpen, isRateLimit]);

  // Trap focus + restore on close
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [isOpen]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="upgrade-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' as const }}
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            className="upgrade-modal-card"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: 'easeOut' as const }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-modal-title"
            aria-describedby="upgrade-modal-desc"
            onClick={e => e.stopPropagation()}
          >
            <button
              ref={closeBtnRef}
              type="button"
              className="upgrade-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={14} strokeWidth={2.5} />
            </button>

            {isRateLimit ? (
              <div className="upgrade-modal-meter" aria-hidden>
                <span className="upgrade-modal-meter-num">{FREE_PLAN_LIMIT}</span>
                <span className="upgrade-modal-meter-denom">/ {FREE_PLAN_LIMIT}</span>
                <span className="upgrade-modal-meter-label">today</span>
              </div>
            ) : (
              <div className="upgrade-modal-eyebrow" aria-hidden>
                <Zap size={11} strokeWidth={2.5} />
                Upgrade
              </div>
            )}

            <h2 id="upgrade-modal-title" className="upgrade-modal-title">
              {isRateLimit ? "You've used today's free reports" : 'Run more reports a day'}
            </h2>
            <p id="upgrade-modal-desc" className="upgrade-modal-desc">
              {isRateLimit ? (
                <>
                  The free plan resets in <span className="upgrade-modal-reset">{resetIn}</span>.
                  Upgrade to keep researching now, with higher limits and full export.
                </>
              ) : (
                <>
                  The free plan caps at three reports a day. Paid plans lift the cap, add saved
                  briefs, and open full CSV export.
                </>
              )}
            </p>

            <div className="upgrade-modal-actions">
              <button
                type="button"
                className="upgrade-modal-btn upgrade-modal-btn--ghost"
                onClick={onClose}
              >
                {isRateLimit ? 'Wait it out' : 'Not now'}
              </button>
              <button
                type="button"
                className="upgrade-modal-btn upgrade-modal-btn--primary"
                onClick={onViewPlans}
              >
                <Zap size={12} strokeWidth={2.5} />
                View plans
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
