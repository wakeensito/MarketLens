import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getMe,
  openBillingPortal,
  startBillingCheckout,
  type BillingPlan,
} from '../api';

type CheckoutState =
  | { kind: 'idle' }
  | { kind: 'redirecting'; plan: BillingPlan }
  | { kind: 'error'; message: string; lastPlan: BillingPlan };

type PortalState =
  | { kind: 'idle' }
  | { kind: 'redirecting' }
  | { kind: 'error'; message: string };

type ActivationState =
  | { kind: 'idle' }
  | { kind: 'polling'; startedAt: number }
  | { kind: 'lagged'; startedAt: number }
  | { kind: 'done'; plan: string }
  | { kind: 'error'; message: string };

const POLL_INTERVAL_MS = 800;
const LAG_THRESHOLD_MS = 10_000;
const MAX_TOTAL_MS = 60_000;

export function useBilling() {
  const [checkout, setCheckout] = useState<CheckoutState>({ kind: 'idle' });
  const [portal, setPortal] = useState<PortalState>({ kind: 'idle' });
  const [activation, setActivation] = useState<ActivationState>({ kind: 'idle' });

  const pollHandleRef = useRef<{ cancelled: boolean } | null>(null);

  useEffect(() => () => {
    if (pollHandleRef.current) pollHandleRef.current.cancelled = true;
  }, []);

  const startCheckout = useCallback(async (plan: BillingPlan) => {
    setCheckout({ kind: 'redirecting', plan });
    try {
      const { checkout_url } = await startBillingCheckout(plan);
      window.location.href = checkout_url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reach Stripe.';
      setCheckout({ kind: 'error', message, lastPlan: plan });
    }
  }, []);

  const openPortal = useCallback(async () => {
    setPortal({ kind: 'redirecting' });
    try {
      const { portal_url } = await openBillingPortal();
      window.location.href = portal_url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reach Stripe.';
      setPortal({ kind: 'error', message });
    }
  }, []);

  const dismissCheckoutError = useCallback(() => {
    setCheckout({ kind: 'idle' });
  }, []);

  const dismissPortalError = useCallback(() => {
    setPortal({ kind: 'idle' });
  }, []);

  /**
   * Poll /api/me until the user's plan CHANGES from a baseline, or until
   * MAX_TOTAL_MS. Crosses the LAG_THRESHOLD_MS mark to surface a "taking
   * longer than usual" affordance without giving up.
   *
   * Polling-on-change (not polling-for-not-free) is the correct primitive
   * because tier upgrades via the Customer Portal go pro → max without ever
   * touching free; a checkout from anonymous goes free → pro. Both look like
   * "the plan changed."
   *
   * Callers should pass the plan known *before* checkout as `baselinePlan` so
   * the poll can resolve immediately if the Stripe webhook landed first.
   * Without it, the first /api/me read sets the baseline and a webhook that
   * arrived earlier would never look like a change.
   */
  const beginActivationPoll = useCallback((baselinePlan?: string) => {
    if (pollHandleRef.current) pollHandleRef.current.cancelled = true;
    const handle = { cancelled: false };
    pollHandleRef.current = handle;
    const startedAt = Date.now();
    setActivation({ kind: 'polling', startedAt });

    let baseline: string | null = baselinePlan ?? null;

    const tick = async () => {
      if (handle.cancelled) return;
      const elapsed = Date.now() - startedAt;
      try {
        const me = await getMe();
        if (handle.cancelled) return;
        if (me.is_authenticated && me.plan) {
          if (baseline === null) {
            // No baseline supplied — accept any non-free plan as success
            // (covers a webhook that landed before the user returned).
            if (me.plan !== 'free') {
              setActivation({ kind: 'done', plan: me.plan });
              return;
            }
            baseline = me.plan;
          } else if (me.plan !== baseline) {
            setActivation({ kind: 'done', plan: me.plan });
            return;
          }
        }
      } catch {
        // Transient network error — keep polling. Don't surface unless we time out.
      }

      if (handle.cancelled) return;

      if (elapsed >= MAX_TOTAL_MS) {
        setActivation({
          kind: 'error',
          message: 'Your plan is taking longer than usual to activate. Refresh to try again.',
        });
        return;
      }
      if (elapsed >= LAG_THRESHOLD_MS) {
        setActivation({ kind: 'lagged', startedAt });
      }
      window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    void tick();
  }, []);

  const cancelActivationPoll = useCallback(() => {
    if (pollHandleRef.current) pollHandleRef.current.cancelled = true;
    pollHandleRef.current = null;
    setActivation({ kind: 'idle' });
  }, []);

  return {
    checkout,
    portal,
    activation,
    startCheckout,
    openPortal,
    beginActivationPoll,
    cancelActivationPoll,
    dismissCheckoutError,
    dismissPortalError,
  };
}

export type UseBillingResult = ReturnType<typeof useBilling>;
