import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PanelLeft } from 'lucide-react';
import { initTheme } from './theme';
import PipelineTracker from './components/PipelineTracker';
import ReportView from './components/ReportView';
import AnimatedAiInput from './components/AnimatedAiInput';
import RecentThreads from './components/RecentThreads';
import SignInModal from './components/SignInModal';
import PricingSection from './components/PricingSection';
import UpgradeModal from './components/UpgradeModal';
import { BrandWordmarkInner } from './components/BrandWordmark';
import { ThemePicker } from './components/ThemePicker';
import { useAnalysis } from './hooks/useAnalysis';
import { useAuthContext } from './hooks/useAuth';
import { EXAMPLE_QUERIES } from './mockData';
import { landingEntryAnimate, landingEntryInitial } from './motion';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 36 };

export default function App() {
  const auth = useAuthContext();
  const {
    screen, query, stages, report, error, reportId, finalizing, rateLimited,
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
  const shellRef = useRef<HTMLDivElement>(null);

  const pendingQueryRef = useRef<string | null>(null);

  const [authError, setAuthError] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    if (err) window.history.replaceState({}, '', window.location.pathname);
    return err;
  });

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

  // After login, leave pricing / save-report overlays (sign-in hides via `signInModalOpen`)
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const id = requestAnimationFrame(() => {
      setShowPricing(false);
      setShowSavePrompt(false);
      // Auto-submit pending query after sign-in
      if (pendingQueryRef.current) {
        const q = pendingQueryRef.current;
        pendingQueryRef.current = null;
        startAnalysis(q);
        setInputValue('');
      }
    });
    return () => cancelAnimationFrame(id);
  }, [auth.isAuthenticated, startAnalysis]);

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
    setInputValue('');
    setShowSavePrompt(false);
  }, [auth.isAuthenticated, startNewChat]);


  const onSubmit = useCallback((val: string) => {
    if (val.trim().length <= 4) return;

    if (!auth.isAuthenticated) {
      // Store the query so we can auto-submit after sign-in
      pendingQueryRef.current = val.trim();
      setShowSignIn(true);
      return;
    }

    startAnalysis(val.trim());
    setInputValue('');
    setShowSavePrompt(false);
  }, [startAnalysis, auth.isAuthenticated]);

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
          onSignIn={() => setShowSignIn(true)}
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
                <button className="lnd-nav-signin" onClick={() => setShowSignIn(true)}>
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

              <motion.div
                className="ws-header-meta"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.18, duration: 0.3 } }}
              >
                {query && !isWorkspaceEmpty && <div className="ws-query-label">"{query}"</div>}
                <div className="ws-header-spacer" />
                <span className="nav-badge">Beta</span>
              </motion.div>
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
                      <ReportView
                        report={report}
                        reportId={reportId}
                        onRequestUpgrade={() => setProactiveUpgrade(true)}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            {/* Fixed bottom input — only during analysis / report */}
            {!isWorkspaceEmpty && (
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
                  placeholder="Type a new idea to analyse"
                  compact
                />
              </motion.div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
