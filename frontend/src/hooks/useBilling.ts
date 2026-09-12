import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  getBillingMe,
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
  | { kind: 'unknown' }
  | { kind: 'error'; message: string };

const POLL_INTERVAL_MS = 800;
const LAG_THRESHOLD_MS = 10_000;
const MAX_TOTAL_MS = 60_000;
const ENTITLED = new Set(['active', 'trialing']);

const CHECKOUT_KEY = 'plinths.checkout';
const PORTAL_KEY = 'plinths.portal';

interface CheckoutRecord {
  intentId: string;
  plan: BillingPlan;
  startedAt: number;
}

function readCheckout(): CheckoutRecord | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutRecord>;
    if (typeof parsed.intentId !== 'string' || typeof parsed.plan !== 'string') return null;
    return parsed as CheckoutRecord;
  } catch {
    return null;
  }
}

function writeCheckout(rec: CheckoutRecord | null) {
  try {
    if (rec) sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(rec));
    else sessionStorage.removeItem(CHECKOUT_KEY);
  } catch { /* private mode */ }
}

function readPortalRevision(): number | null {
  try {
    const raw = sessionStorage.getItem(PORTAL_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function writePortalRevision(rev: number | null) {
  try {
    if (rev === null) sessionStorage.removeItem(PORTAL_KEY);
    else sessionStorage.setItem(PORTAL_KEY, String(rev));
  } catch { /* private mode */ }
}

function mintIntent(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for very old WebViews: RFC 4122 v4 from Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface CheckoutCallbacks {
  setCheckout: (state: CheckoutState) => void;
  openPortal: () => Promise<void>;
}

/**
 * One intent per checkout attempt. The same intent is resent on the
 * retry-after-error path (same plan), so Stripe collapses it to one Session.
 * A 409 `subscription_exists` means an upgrade, not a new subscription:
 * hand off to the portal. A 409 `intent_reused` means the intent was bound
 * to different parameters: mint a fresh one and retry once.
 *
 * Plain (non-hook) recursive helper — recursing through a `useCallback`
 * binding trips the react-hooks self-reference lint rule, so the retry
 * loop lives outside the hook.
 */
async function attemptCheckout(
  plan: BillingPlan,
  intentId: string,
  isRetry: boolean,
  callbacks: CheckoutCallbacks,
): Promise<void> {
  writeCheckout({ intentId, plan, startedAt: Date.now() });
  try {
    const { checkout_url } = await startBillingCheckout(plan, intentId);
    window.location.href = checkout_url;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      if (err.message === 'subscription_exists') {
        writeCheckout(null);
        callbacks.setCheckout({ kind: 'idle' });
        await callbacks.openPortal();
        return;
      }
      if (err.message === 'intent_reused' && !isRetry) {
        await attemptCheckout(plan, mintIntent(), true, callbacks);
        return;
      }
    }
    const message = err instanceof Error ? err.message : 'Could not reach Stripe.';
    callbacks.setCheckout({ kind: 'error', message, lastPlan: plan });
  }
}

export function useBilling() {
  const [checkout, setCheckout] = useState<CheckoutState>({ kind: 'idle' });
  const [portal, setPortal] = useState<PortalState>({ kind: 'idle' });
  const [activation, setActivation] = useState<ActivationState>({ kind: 'idle' });

  const pollHandleRef = useRef<{ cancelled: boolean } | null>(null);

  useEffect(() => () => {
    if (pollHandleRef.current) pollHandleRef.current.cancelled = true;
  }, []);

  const openPortal = useCallback(async () => {
    setPortal({ kind: 'redirecting' });
    try {
      // Remember the revision so the return path can tell whether anything changed.
      try {
        const me = await getBillingMe();
        writePortalRevision(me.billing_revision);
      } catch {
        writePortalRevision(null);
      }
      const { portal_url } = await openBillingPortal();
      window.location.href = portal_url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reach Stripe.';
      setPortal({ kind: 'error', message });
    }
  }, []);

  const startCheckout = useCallback(async (plan: BillingPlan) => {
    setCheckout({ kind: 'redirecting', plan });
    const existing = readCheckout();
    // The stored intent is reused only when the plan matches (retry-after-error
    // path); a cancelled return clears the record, so a fresh checkout for a
    // different plan always mints a new intent.
    const intentId = existing && existing.plan === plan ? existing.intentId : mintIntent();
    await attemptCheckout(plan, intentId, false, { setCheckout, openPortal });
  }, [openPortal]);

  const dismissCheckoutError = useCallback(() => {
    writeCheckout(null);
    setCheckout({ kind: 'idle' });
  }, []);

  /** Clears the stored checkout record — used on a `?billing=cancelled` return. */
  const clearCheckoutRecord = useCallback(() => {
    writeCheckout(null);
  }, []);

  const dismissPortalError = useCallback(() => {
    setPortal({ kind: 'idle' });
  }, []);

  /**
   * Poll GET /api/billing/me until the row reports *this* checkout's intent
   * AND an entitled status. The intent keeps an unrelated portal change in
   * another tab from being mistaken for this checkout; the status keeps
   * checkout.session.completed from reporting success while the
   * subscription is still `incomplete`.
   */
  const beginActivationPoll = useCallback(() => {
    if (pollHandleRef.current) pollHandleRef.current.cancelled = true;
    const record = readCheckout();
    if (!record) {
      // No intent to correlate (different browser, cleared storage). One look, then stop.
      const handle = { cancelled: false };
      pollHandleRef.current = handle;
      setActivation({ kind: 'polling', startedAt: Date.now() });
      void getBillingMe()
        .then(me => {
          if (handle.cancelled) return;
          setActivation(me.effective_plan !== 'free' ? { kind: 'done', plan: me.effective_plan } : { kind: 'unknown' });
        })
        .catch(() => {
          if (handle.cancelled) return;
          setActivation({ kind: 'unknown' });
        });
      return;
    }

    const handle = { cancelled: false };
    pollHandleRef.current = handle;
    const startedAt = Date.now();
    setActivation({ kind: 'polling', startedAt });

    const tick = async () => {
      if (handle.cancelled) return;
      const elapsed = Date.now() - startedAt;
      try {
        const me = await getBillingMe();
        if (handle.cancelled) return;
        if (
          me.last_checkout_intent_id === record.intentId &&
          me.subscription_status !== null &&
          ENTITLED.has(me.subscription_status)
        ) {
          writeCheckout(null);
          setActivation({ kind: 'done', plan: me.effective_plan });
          return;
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
      if (elapsed >= LAG_THRESHOLD_MS) setActivation({ kind: 'lagged', startedAt });
      window.setTimeout(tick, POLL_INTERVAL_MS);
    };
    void tick();
  }, []);

  const cancelActivationPoll = useCallback(() => {
    if (pollHandleRef.current) pollHandleRef.current.cancelled = true;
    pollHandleRef.current = null;
    setActivation({ kind: 'idle' });
  }, []);

  /** Returning from the Customer Portal: did anything change while we were away? */
  const checkPortalReturn = useCallback(async (): Promise<boolean> => {
    const before = readPortalRevision();
    writePortalRevision(null);
    try {
      const me = await getBillingMe();
      return before === null || me.billing_revision !== before;
    } catch {
      return true; // can't tell — refresh anyway
    }
  }, []);

  return {
    checkout,
    portal,
    activation,
    startCheckout,
    openPortal,
    beginActivationPoll,
    cancelActivationPoll,
    checkPortalReturn,
    dismissCheckoutError,
    dismissPortalError,
    clearCheckoutRecord,
  };
}

export type UseBillingResult = ReturnType<typeof useBilling>;
