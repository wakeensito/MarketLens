import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PanelLeft } from 'lucide-react';
import { initTheme } from './theme';
import PipelineTracker from './components/PipelineTracker';
import MarketMemo from './components/MarketMemo';
import ReportActions from './components/ReportActions';
import { buildMemoMarkdown } from './memoMarkdown';
import AnimatedAiInput from './components/AnimatedAiInput';
import RecentThreads from './components/RecentThreads';
import SignInModal from './components/SignInModal';
import PricingSection from './components/PricingSection';
import UpgradeModal from './components/UpgradeModal';
import SettingsModal, { type SettingsSection } from './components/SettingsModal';
import { getPersonalization } from './personalization';
import ActivatingPlan from './components/ActivatingPlan';
import { BrandWordmarkInner } from './components/BrandWordmark';
import { ThemePicker } from './components/ThemePicker';
import { useAnalysis } from './hooks/useAnalysis';
import { useAuthContext } from './hooks/useAuth';
import { useBilling } from './hooks/useBilling';
import { useMuse } from './hooks/useMuse';
import { useBuildBrief } from './hooks/useBuildBrief';
import { MuseThread } from './components/muse/MuseThread';
import { MuseEmptyLine } from './components/muse/MuseEmptyLine';
import { WorkspaceTabs, type WorkspaceTab } from './components/WorkspaceTabs';
import BuildBriefPane from './components/BuildBrief';
import './components/muse/muse.css';
import { EXAMPLE_QUERIES } from './mockData';
import { landingEntryAnimate, landingEntryInitial } from './motion';
import { submitFeedback } from './api';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 36 };

const PENDING_QUERY_KEY = 'plinths-pending-query';

export default function App() {
  const auth = useAuthContext();
  const {
    screen, query, stages, report, memo, error, reportId, finalizing, rateLimited,
    startAnalysis, loadHistoricalReport, handleReset, handleRetry, startNewChat,
    dismissRateLimit,
  } = useAnalysis();

  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 680 : true
  );
  const [inputValue, setInputValue] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  /** True when the user clicked "Upgrade Plan" in the profile menu (vs. hitting the rate limit). */
  const [proactiveUpgrade, setProactiveUpgrade] = useState(false);
  /** Settings modal: null = closed, otherwise the section to open on. */
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  /** Preferred name from personalization — drives the workspace greeting. */
  const [preferredName, setPreferredName] = useState<string>(() => getPersonalization().preferredName);
  const shellRef = useRef<HTMLDivElement>(null);

  const pendingQueryRef = useRef<string | null>(null);

  const [authError, setAuthError] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    if (err) window.history.replaceState({}, '', window.location.pathname);
    return err;
  });

  const billing = useBilling();

  // Muse is gated on auth, not on plan. Free users get 3 chats/day (counter
  // enforced server-side); Pro/Max are uncapped within their per-report limit.
  // The locked banner appears when the Free counter is exhausted (cap reached).
  const museEligible = auth.isAuthenticated;
  const muse = useMuse({ reportId, enabled: museEligible });
  // Plan-aware cap check — without the `userPlan === 'free'` guard, a stale
  // free-tier counter left over from before an upgrade could lock a Pro user
  // until the next hydration cycle. The backend only sends dailyLimit for
  // Free, so this is belt-and-suspenders against in-session plan changes.
  const userPlan = (auth.user?.plan ?? 'free').trim().toLowerCase();
  const museCapped =
    userPlan === 'free' &&
    muse.dailyLimit != null &&
    muse.dailyUsed != null &&
    muse.dailyUsed >= muse.dailyLimit;

  // Build Brief is plan-gated (free/anon → locked upsell) and lives inside the
  // report. The hook is lifted here so ReportView stays a pure presentational
  // component, mirroring the Muse integration discipline.
  const buildBrief = useBuildBrief({ reportId, plan: userPlan });

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('report');
  // Anything non-free (pro / max / admin) unlocks the Build Brief tab; mirrors
  // useBuildBrief's PAID_PLANS gate so the tab marker and the pane agree.
  const isPaid = userPlan !== '' && userPlan !== 'free';
  const showTabs = screen === 'report' && !!report && !!reportId;

  // Default-tab selection syncs tab state to external changes (active report /
  // Muse hydration settling), so setState-in-effect is the intended pattern.
  /* eslint-disable react-hooks/set-state-in-effect */
  // Reset to the Report tab whenever the active report changes.
  const lastReportTabRef = useRef<string | null>(null);
  const museHydratedTabRef = useRef<string | null>(null);
  // Set once the user picks a tab themselves, so the post-hydration auto-default
  // below never overrides an explicit choice made during hydration.
  const userChangedTabRef = useRef(false);
  useEffect(() => {
    if (reportId !== lastReportTabRef.current) {
      lastReportTabRef.current = reportId;
      museHydratedTabRef.current = null;
      userChangedTabRef.current = false;
      setActiveTab('report');
    }
  }, [reportId]);
  // After Muse hydration settles, default to Muse if the report already has a
  // thread — unless the user already chose a tab during hydration.
  useEffect(() => {
    if (!reportId || muse.hydrating || museHydratedTabRef.current === reportId) return;
    museHydratedTabRef.current = reportId;
    if (userChangedTabRef.current) return;
    if (muse.thread.length > 0) setActiveTab('muse');
  }, [reportId, muse.hydrating, muse.thread.length]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // When a citation routes the user to the Report tab with a target cell, scroll
  // smoothly to the matching `[data-muse-cell]` element and pulse it once.
  // Lives at the App boundary so ReportView stays pure — it just emits stable
  // data attributes; the routing logic is owned by the Muse integration layer.
  useEffect(() => {
    if (!muse.enabled) return;
    if (activeTab !== 'report' || !muse.highlightTarget) return;
    const target = muse.highlightTarget;
    type WithMuseClear = HTMLElement & { _museClear?: number };
    let pulsed: WithMuseClear | null = null;
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-muse-cell="${target}"]`,
      ) as WithMuseClear | null;
      if (!el) return;
      // Clear any prior pulse timer on this element before starting a new one.
      if (el._museClear !== undefined) {
        window.clearTimeout(el._museClear);
      }
      pulsed = el;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('muse-cell-pulsing');
      el._museClear = window.setTimeout(() => {
        el.classList.remove('muse-cell-pulsing');
        el._museClear = undefined;
      }, 1600);
    }, 120);
    return () => {
      window.clearTimeout(t);
      if (pulsed?._museClear !== undefined) {
        window.clearTimeout(pulsed._museClear);
        pulsed._museClear = undefined;
        pulsed.classList.remove('muse-cell-pulsing');
      }
    };
  }, [muse.enabled, activeTab, muse.highlightTarget]);
  const [billingCancelToast, setBillingCancelToast] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('billing') === 'cancelled';
  });
  const pendingCheckoutPlanRef = useRef<import('./api').BillingPlan | null>(null);

  // Read ?billing=success|cancelled once on boot, strip the query, dispatch.
  const billingFlagHandledRef = useRef(false);
  useEffect(() => {
    if (billingFlagHandledRef.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('billing');
    if (flag !== 'success' && flag !== 'cancelled') return;
    billingFlagHandledRef.current = true;
    params.delete('billing');
    params.delete('session_id');
    const remaining = params.toString();
    const url = window.location.pathname + (remaining ? `?${remaining}` : '');
    window.history.replaceState({}, '', url);
    if (flag === 'success') {
      billing.beginActivationPoll(auth.user?.plan ?? 'free');
    }
  }, [billing, auth.user?.plan]);

  // Auto-dismiss cancel toast after 4 seconds.
  useEffect(() => {
    if (!billingCancelToast) return;
    const id = window.setTimeout(() => setBillingCancelToast(false), 4_000);
    return () => window.clearTimeout(id);
  }, [billingCancelToast]);

  // When activation completes, pull a fresh auth snapshot so plan-gated UI updates.
  useEffect(() => {
    if (billing.activation.kind !== 'done') return;
    void auth.refresh();
    // auth.refresh is stable; depending on the whole auth object would refire on every login/logout state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing.activation.kind, auth.refresh]);

  const onActivationComplete = useCallback(() => {
    billing.cancelActivationPoll();
    // billing.cancelActivationPoll is stable; depending on the whole billing object would invalidate this callback on every billing tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing.cancelActivationPoll]);

  const onActivationRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  // Landing = unauthenticated on 'landing' screen only
  const isLanding = screen === 'landing' && !auth.isAuthenticated;
  // Workspace shows whenever we're not on the landing page
  const inWorkspace = !isLanding;
  // Empty workspace state (signed-in new chat, or signed-in on initial load)
  const isWorkspaceEmpty = screen === 'workspace-empty' || (screen === 'landing' && auth.isAuthenticated);

  useEffect(() => { initTheme(); }, []);

  useEffect(() => {
    const id = setInterval(() => setPhIdx(i => (i + 1) % EXAMPLE_QUERIES.length), 3200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 681px)');
    const sync = () => setSidebarOpen(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** Sign-in modal visibility: intent flag + must be signed out (no duplicate close effect). */
  const signInModalOpen = showSignIn && !auth.isAuthenticated;

  // Post-login: dismiss pre-login overlays and resume any pending intent
  // (queued query or pending paid-plan checkout). Must only fire on the
  // false→true auth transition — re-running on every render would squash
  // user-driven setShowPricing(true) clicks (e.g. "View plans" in the
  // upgrade modal).
  const prevAuthForLoginEffectRef = useRef(auth.isAuthenticated);
  useEffect(() => {
    const wasAuth = prevAuthForLoginEffectRef.current;
    prevAuthForLoginEffectRef.current = auth.isAuthenticated;
    if (wasAuth || !auth.isAuthenticated) return;
    const id = requestAnimationFrame(() => {
      setShowSavePrompt(false);
      if (pendingCheckoutPlanRef.current) {
        const plan = pendingCheckoutPlanRef.current;
        pendingCheckoutPlanRef.current = null;
        pendingQueryRef.current = null;
        try { sessionStorage.removeItem(PENDING_QUERY_KEY); } catch { /* private mode */ }
        setShowPricing(false);
        void billing.startCheckout(plan);
        return;
      }
      setShowPricing(false);
      let q = pendingQueryRef.current;
      pendingQueryRef.current = null;
      if (!q) {
        try { q = sessionStorage.getItem(PENDING_QUERY_KEY); } catch { /* private mode */ }
      }
      try { sessionStorage.removeItem(PENDING_QUERY_KEY); } catch { /* private mode */ }
      if (q) {
        startAnalysis(q);
        setInputValue('');
      }
    });
    return () => cancelAnimationFrame(id);
  }, [auth.isAuthenticated, startAnalysis, billing]);

  // On logout, reset the analysis screen so the landing page is shown.
  // Track previous value to only fire on true→false transitions, not on initial load.
  const prevIsAuthRef = useRef(auth.isAuthenticated);
  useEffect(() => {
    if (prevIsAuthRef.current && !auth.isAuthenticated) {
      handleReset();
    }
    prevIsAuthRef.current = auth.isAuthenticated;
  }, [auth.isAuthenticated, handleReset]);

  // Show "save report" prompt after free analysis completes (anonymous users only)
  useEffect(() => {
    if (screen !== 'report' || auth.isAuthenticated) return;
    const t = setTimeout(() => setShowSavePrompt(true), 900);
    return () => clearTimeout(t);
  }, [screen, auth.isAuthenticated]);

  // New analysis: signed-in → workspace-empty, anon → back to landing
  const onNewChat = useCallback(() => {
    if (auth.isAuthenticated) {
      startNewChat();
    } else {
      setShowSignIn(true);
    }
    // Muse state is per-report and auto-clears when reportId becomes null.
    setInputValue('');
    setShowSavePrompt(false);
  }, [auth.isAuthenticated, startNewChat]);

  const upgradeToPro = useCallback(() => {
    if (!auth.isAuthenticated) {
      pendingCheckoutPlanRef.current = 'pro';
      setShowSignIn(true);
      return;
    }
    void billing.startCheckout('pro');
  }, [auth.isAuthenticated, billing]);

  const handleCite = useCallback((target: string) => {
    setActiveTab('report');
    muse.cite(target);
  }, [muse]);

  const handleTabChange = useCallback((tab: WorkspaceTab) => {
    userChangedTabRef.current = true;
    if (tab === 'report') muse.clearHighlight();
    setActiveTab(tab);
  }, [muse]);

  const onSubmit = useCallback((val: string) => {
    const text = val.trim();
    if (text.length <= 4) return;

    // On a report, the bottom bar is the Muse composer.
    if (screen === 'report' && report && reportId && museEligible) {
      if (museCapped) return;
      setActiveTab('muse');
      muse.sendMessage(text);
      setInputValue('');
      return;
    }

    // Empty-state hero input: start a new analysis (or gate to sign-in).
    if (!auth.isAuthenticated) {
      pendingQueryRef.current = text;
      try { sessionStorage.setItem(PENDING_QUERY_KEY, text); } catch { /* private mode */ }
      setShowSignIn(true);
      return;
    }

    startAnalysis(text);
    setInputValue('');
    setShowSavePrompt(false);
  }, [screen, report, reportId, museEligible, museCapped, muse, auth.isAuthenticated, startAnalysis]);

  // Open the sign-in modal, first stashing any idea the user has typed but not
  // submitted. Google SSO is a full-page redirect that wipes React state, so
  // without this the typed idea is lost and must be retyped after login. The
  // post-login effect restores it (sessionStorage survives the SSO round-trip).
  const requestSignIn = useCallback(() => {
    const text = inputValue.trim();
    if (!pendingCheckoutPlanRef.current) {
      if (text.length > 4) {
        pendingQueryRef.current = text;
        try { sessionStorage.setItem(PENDING_QUERY_KEY, text); } catch { /* private mode */ }
      } else {
        // Signing in with no idea in the box — drop any stale stash from an
        // earlier abandoned attempt so we don't auto-run a forgotten idea.
        pendingQueryRef.current = null;
        try { sessionStorage.removeItem(PENDING_QUERY_KEY); } catch { /* private mode */ }
      }
    }
    setShowSignIn(true);
  }, [inputValue]);

  // ── Loading ─────────────────────────────────────────────
  if (auth.loading) {
    return (
      <div className="shell shell--landing">
        <motion.div className="lnd-wordmark" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <span className="lnd-wm-inner">
            <BrandWordmarkInner variant="landing" />
          </span>
        </motion.div>
      </div>
    );
  }

  // ── Pricing overlay ──────────────────────────────────
  if (showPricing) {
    return (
      <div className="shell shell--pricing">
        <PricingSection
          onBack={() => {
            setShowSignIn(false);
            setShowPricing(false);
          }}
          onCheckout={plan => { void billing.startCheckout(plan); }}
          onManage={() => { void billing.openPortal(); }}
          onRequestSignIn={plan => {
            pendingCheckoutPlanRef.current = plan;
            setShowSignIn(true);
          }}
          currentPlan={(auth.user?.plan ?? 'free').trim().toLowerCase()}
          isAuthenticated={auth.isAuthenticated}
        />
        <SignInModal
          isOpen={signInModalOpen}
          onClose={() => setShowSignIn(false)}
          auth={auth}
        />
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={`shell${isLanding ? ' shell--landing' : ' shell--workspace'}`}
    >
      {/* ── Auth error banner ──────────────────────────────── */}
      <AnimatePresence>
        {authError && (
          <motion.div
            className="auth-error-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' as const }}
          >
            <span className="auth-error-text">{authError}</span>
            <button className="auth-error-dismiss" onClick={() => setAuthError(null)} aria-label="Dismiss">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Billing return states ──────────────────────────── */}
      <ActivatingPlan
        activation={billing.activation}
        onComplete={onActivationComplete}
        onRefresh={onActivationRefresh}
      />
      <AnimatePresence>
        {billingCancelToast && (
          <motion.div
            className="billing-cancel-toast"
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.22, ease: 'easeOut' as const }}
          >
            Checkout cancelled. You can come back anytime.
          </motion.div>
        )}
        {billing.checkout.kind === 'error' && (
          <motion.div
            className="billing-cancel-toast billing-cancel-toast--error"
            role="alert"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.22, ease: 'easeOut' as const }}
          >
            <span className="billing-toast-text">Couldn't reach Stripe.</span>
            <div className="billing-toast-actions">
              <button
                type="button"
                className="billing-toast-action"
                onClick={() => {
                  if (billing.checkout.kind === 'error') {
                    void billing.startCheckout(billing.checkout.lastPlan);
                  }
                }}
              >
                Try again
              </button>
              <button
                type="button"
                className="billing-toast-dismiss"
                onClick={() => billing.dismissCheckoutError()}
                aria-label="Dismiss error"
              >×</button>
            </div>
          </motion.div>
        )}
        {billing.portal.kind === 'error' && (
          <motion.div
            className="billing-cancel-toast billing-cancel-toast--error"
            role="alert"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.22, ease: 'easeOut' as const }}
          >
            <span className="billing-toast-text">Couldn't open the billing portal.</span>
            <div className="billing-toast-actions">
              <button
                type="button"
                className="billing-toast-action"
                onClick={() => { void billing.openPortal(); }}
              >
                Try again
              </button>
              <button
                type="button"
                className="billing-toast-dismiss"
                onClick={() => billing.dismissPortalError()}
                aria-label="Dismiss error"
              >×</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Landing ────────────────────────────────────────── */}
      {isLanding && (
        <>
          {/* Top nav — pricing + theme + sign-in, right-aligned */}
          {!auth.isAuthenticated && (
            <motion.nav
              className="lnd-nav"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.28, duration: 0.35, ease: 'easeOut' as const }}
            >
              <div className="lnd-nav-right">
                <button className="lnd-nav-pricing" onClick={() => setShowPricing(true)}>
                  Pricing
                </button>
                <ThemePicker />
                <button className="lnd-nav-signin" onClick={requestSignIn}>
                  Sign in
                </button>
              </div>
            </motion.nav>
          )}

          <motion.div layoutId="ml-wordmark" className="lnd-wordmark" transition={SPRING}>
            <span className="lnd-wm-inner">
              <BrandWordmarkInner variant="landing" />
            </span>
          </motion.div>

          {!auth.isAuthenticated && (
            <motion.div
              className="lnd-free-badge"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.08, duration: 0.32, ease: 'easeOut' as const } }}
            >
              <span className="lnd-free-badge-dot" />
              Three reports a day, free
            </motion.div>
          )}

          <motion.h1
            className="lnd-headline"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.12, duration: 0.38, ease: 'easeOut' as const } }}
          >
            Validate before you build.
          </motion.h1>
          <motion.p
            className="lnd-sub"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.18, duration: 0.38, ease: 'easeOut' as const } }}
          >
            Type an idea. Get the brief.
          </motion.p>

          <motion.div layoutId="ml-input" className="lnd-input-wrap" transition={SPRING}>
            <AnimatedAiInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={onSubmit}
              placeholder={EXAMPLE_QUERIES[phIdx]}
              autoFocus={false}
            />
          </motion.div>

          <motion.div
            className="landing-examples"
            initial={landingEntryInitial}
            animate={landingEntryAnimate(0.18)}
          >
            <span className="landing-examples-label">Try:</span>
            {EXAMPLE_QUERIES.map(ex => (
              <button key={ex} className="landing-pill" onClick={() => setInputValue(ex)}>
                {ex}
              </button>
            ))}
          </motion.div>

        </>
      )}

      {/* ── Floating sign-in modal (landing / anon gate) ──── */}
      <SignInModal
        isOpen={signInModalOpen && !showSavePrompt}
        onClose={() => setShowSignIn(false)}
        auth={auth}
        onShowPricing={() => setShowPricing(true)}
      />

      {/* ── Save-report sign-in prompt ─────────────────────── */}
      <SignInModal
        isOpen={showSavePrompt && !auth.isAuthenticated}
        onClose={() => setShowSavePrompt(false)}
        auth={auth}
        variant="save-report"
      />

      {/* ── Upgrade modal ───────────────────────────────────
           Two triggers, two variants:
           • Rate-limit hit during analysis (auto)
           • User clicks "Upgrade Plan" in the profile menu */}
      <UpgradeModal
        isOpen={rateLimited || proactiveUpgrade}
        variant={rateLimited ? 'rate-limit' : 'proactive'}
        onClose={() => {
          if (rateLimited) dismissRateLimit();
          if (proactiveUpgrade) setProactiveUpgrade(false);
        }}
        onViewPlans={() => {
          if (rateLimited) dismissRateLimit();
          if (proactiveUpgrade) setProactiveUpgrade(false);
          setShowPricing(true);
        }}
      />

      {/* ── Settings modal ─────────────────────────────────── */}
      <SettingsModal
        isOpen={settingsSection !== null}
        initialSection={settingsSection ?? 'general'}
        onClose={() => setSettingsSection(null)}
        onUpgrade={() => { setSettingsSection(null); setProactiveUpgrade(true); }}
        onManageSubscription={() => { setSettingsSection(null); void billing.openPortal(); }}
        onPersonalizationSaved={p => setPreferredName(p.preferredName)}
      />

      {/* ── Workspace ──────────────────────────────────────── */}
      {inWorkspace && (
        <>
          <RecentThreads
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onOpen={() => setSidebarOpen(true)}
            onNewChat={onNewChat}
            activeId={reportId}
            screen={screen}
            onSelect={id => {
              loadHistoricalReport(id);
              if (window.innerWidth <= 680) setSidebarOpen(false);
              setInputValue('');
              setShowSavePrompt(false);
            }}
            onUpgradeClick={() => setProactiveUpgrade(true)}
            onManageSubscription={() => { void billing.openPortal(); }}
            onOpenSettings={(section = 'general') => setSettingsSection(section)}
            onActiveDeleted={() => {
              setShowSavePrompt(false);
              setInputValue('');
              if (auth.isAuthenticated) startNewChat();
              else handleReset();
            }}
          />

          <div className={`workspace-body${sidebarOpen ? '' : ' workspace-body--sidebar-closed'}`}>
            <header className="ws-header">
              {/* Mobile hamburger */}
              <button
                type="button"
                className="ws-sidebar-toggle"
                onClick={() => setSidebarOpen(o => !o)}
                aria-label="Toggle sidebar"
              >
                <PanelLeft size={15} strokeWidth={2} />
              </button>

              {showTabs ? (
                <WorkspaceTabs
                  active={activeTab}
                  onChange={handleTabChange}
                  isPaid={isPaid}
                  isAuthenticated={auth.isAuthenticated}
                />
              ) : (
                <div className="ws-header-spacer" />
              )}

              <span className="nav-badge">Beta</span>
            </header>

            <main className="ws-main">
              <AnimatePresence mode="wait">

                {isWorkspaceEmpty ? (
                  /* ── Workspace empty state ── */
                  <motion.div
                    key="empty"
                    className="ws-empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: 0.3 } }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  >
                    <div className="ws-empty-inner">
                      {preferredName.trim() && (
                        <motion.p
                          className="ws-empty-greeting"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0, transition: { delay: 0.08, duration: 0.34, ease: 'easeOut' as const } }}
                        >
                          Welcome back, {preferredName.trim()}.
                        </motion.p>
                      )}
                      <motion.h1
                        className="ws-empty-headline"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: 0.14, duration: 0.38, ease: 'easeOut' as const } }}
                      >
                        Type your next idea.
                      </motion.h1>

                      <motion.div
                        layoutId="ml-input"
                        className="ws-empty-input-wrap"
                        transition={SPRING}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: 0.2, duration: 0.38, ease: 'easeOut' as const } }}
                      >
                        <AnimatedAiInput
                          value={inputValue}
                          onChange={setInputValue}
                          onSubmit={onSubmit}
                          placeholder={EXAMPLE_QUERIES[phIdx]}
                          autoFocus
                        />
                      </motion.div>

                      <motion.div
                        className="ws-empty-chips"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { delay: 0.28, duration: 0.3 } }}
                      >
                        {EXAMPLE_QUERIES.map(ex => (
                          <button key={ex} className="landing-pill" onClick={() => setInputValue(ex)}>
                            {ex}
                          </button>
                        ))}
                      </motion.div>
                    </div>
                  </motion.div>

                ) : screen === 'analysis' ? (
                  <motion.div
                    key="pipeline"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.22, duration: 0.38, ease: 'easeOut' as const } }}
                    exit={{ opacity: 0, transition: { duration: 0.18 } }}
                  >
                    <PipelineTracker
                      stages={stages}
                      query={query}
                      finalizing={finalizing}
                      error={error}
                      onRetry={handleRetry}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="report"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: 0.4 } }}
                  >
                    {report && reportId && (
                      <>
                        {activeTab !== 'report' && (report.oneliner.trim() || query) && (
                          <div className="ws-query-subrow">{report.oneliner.trim() || query}</div>
                        )}

                        {activeTab === 'report' && (
                          <div
                            id="ws-panel-report"
                            role="tabpanel"
                            aria-labelledby="ws-tab-report"
                            className="ws-pane"
                          >
                            {museEligible && muse.highlightTarget && (
                              <div className="muse-back-banner">
                                <span className="muse-back-banner__label">
                                  From your conversation
                                </span>
                                <button
                                  type="button"
                                  className="muse-back-banner__btn"
                                  onClick={() => {
                                    setActiveTab('muse');
                                    muse.clearHighlight();
                                  }}
                                >
                                  <span aria-hidden>←</span>
                                  <span>Back to chat</span>
                                </button>
                              </div>
                            )}
                            {memo && (
                              <>
                                <MarketMemo memo={memo} />
                                <ReportActions
                                  key={reportId}
                                  reportId={reportId}
                                  buildMarkdown={(briefId, dateStr) => buildMemoMarkdown(memo, briefId, dateStr)}
                                  onRequestUpgrade={() => setProactiveUpgrade(true)}
                                  onUpgradeToPro={upgradeToPro}
                                  onFeedback={async (rating, comment) => {
                                    await submitFeedback(reportId, rating, comment);
                                  }}
                                />
                              </>
                            )}
                          </div>
                        )}

                        {activeTab === 'build-brief' && (
                          <div
                            id="ws-panel-build-brief"
                            role="tabpanel"
                            aria-labelledby="ws-tab-build-brief"
                            className="ws-pane"
                          >
                            <BuildBriefPane
                              buildBrief={buildBrief}
                              idea={report.idea}
                              onUpgrade={upgradeToPro}
                            />
                          </div>
                        )}

                        {activeTab === 'muse' && (
                          <div
                            id="ws-panel-muse"
                            role="tabpanel"
                            aria-labelledby="ws-tab-muse"
                            className="ws-pane"
                          >
                            {!museEligible ? (
                              <MuseEmptyLine
                                locked
                                actionLabel="sign in"
                                lockedReason="sign in to chat with this report"
                                onUpgrade={() => setShowSignIn(true)}
                              />
                            ) : museCapped ? (
                              <MuseEmptyLine
                                locked
                                lockedReason="you've used today's free chats"
                                onUpgrade={() => setShowPricing(true)}
                              />
                            ) : muse.thread.length > 0 || muse.streamingText !== null ? (
                              <MuseThread
                                thread={muse.thread}
                                streamingText={muse.streamingText}
                                onCite={handleCite}
                                onAsk={muse.sendMessage}
                                onRegenerate={muse.regenerate}
                                onFeedback={muse.setFeedback}
                              />
                            ) : (
                              <MuseEmptyLine />
                            )}
                            {muse.lastError && (
                              <div className="muse-error" role="alert">
                                <span>{muse.lastError}</span>
                                <button
                                  type="button"
                                  className="muse-error__dismiss"
                                  onClick={muse.dismissError}
                                  aria-label="Dismiss error"
                                >
                                  ×
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            {/* Fixed bottom input — Muse composer on a report */}
            {screen === 'report' && report && museEligible && (
              <motion.div
                layoutId="ml-input"
                className="ws-input-wrap"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.2 } }}
                transition={SPRING}
              >
                <AnimatedAiInput
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={onSubmit}
                  placeholder={
                    museCapped
                      ? 'Free Muse chats used for today'
                      : activeTab === 'muse'
                        ? 'Reply…'
                        : 'Ask Muse about this report…'
                  }
                  compact
                  disabled={museCapped}
                  activeTab={activeTab}
                  onNavigate={handleTabChange}
                />
              </motion.div>
            )}

          </div>
        </>
      )}
    </div>
  );
}
