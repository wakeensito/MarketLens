import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { UseBillingResult } from '../hooks/useBilling';
import AnimatedMark from './AnimatedMark';

interface Props {
  activation: UseBillingResult['activation'];
  /** Called when user requests a hard refresh during the lagged/error state. */
  onRefresh: () => void;
  /** Called once the activation completes — parent can dismiss the overlay. */
  onComplete: () => void;
}

export default function ActivatingPlan({ activation, onRefresh, onComplete }: Props) {
  const isVisible = activation.kind !== 'idle';
  const [elapsed, setElapsed] = useState('0s');
  const cardRef = useRef<HTMLDivElement>(null);
  const refreshBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Elapsed timer. Re-derives only on transitions that actually move the
  // startedAt anchor, not on every poll tick.
  const startedAt =
    activation.kind === 'polling' || activation.kind === 'lagged' ? activation.startedAt : null;
  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(`${seconds}s`);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [startedAt]);

  // Fire onComplete when activation transitions to done.
  useEffect(() => {
    if (activation.kind !== 'done') return;
    const id = window.setTimeout(onComplete, 480);
    return () => window.clearTimeout(id);
  }, [activation, onComplete]);

  // Focus management: capture the previously-focused element when the overlay
  // opens, move focus into the card, restore on close.
  useEffect(() => {
    if (!isVisible) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Focus the refresh button if it's available, else the card itself.
    const target = refreshBtnRef.current ?? cardRef.current;
    target?.focus();
    return () => {
      previouslyFocused.current?.focus();
    };
  }, [isVisible]);

  // Trap focus inside the card while visible. Tab and Shift+Tab cycle within.
  useEffect(() => {
    if (!isVisible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = cardRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) {
        e.preventDefault();
        cardRef.current?.focus();
        return;
      }
      const list = Array.from(focusables);
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="activating-scrim"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            ref={cardRef}
            tabIndex={-1}
            className="activating-card"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="activating-mark" aria-hidden>
              <AnimatedMark
                size={48}
                variant="loop"
                paused={activation.kind === 'done' || activation.kind === 'error'}
              />
            </div>

            <h2 className="activating-title">
              {activation.kind === 'done' ? 'Pro is live.' :
               activation.kind === 'error' ? 'Activation is taking longer than usual.' :
               'Building your plan.'}
            </h2>

            <p className="activating-desc">
              {activation.kind === 'done'
                ? 'Workspace ready.'
                : activation.kind === 'error'
                ? 'Your charge succeeded. Stripe is still confirming with us.'
                : activation.kind === 'lagged'
                ? 'Your charge succeeded. Final confirmation incoming.'
                : 'Your charge succeeded. Stacking your workspace.'}
            </p>

            <div className="activating-meta">
              {(activation.kind === 'polling' || activation.kind === 'lagged') && (
                <span className="activating-elapsed">{elapsed}</span>
              )}
              {activation.kind === 'lagged' || activation.kind === 'error' ? (
                <button
                  ref={refreshBtnRef}
                  type="button"
                  className="activating-refresh"
                  onClick={onRefresh}
                >
                  Refresh
                </button>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
