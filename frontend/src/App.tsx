import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { History, PanelLeft, ArrowRight } from 'lucide-react';
import PipelineTracker from './components/PipelineTracker';
import ReportView from './components/ReportView';
import AnimatedAiInput from './components/AnimatedAiInput';
import RecentThreads from './components/RecentThreads';
import SignInModal from './components/SignInModal';
import PricingSection from './components/PricingSection';
import { useAnalysis } from './hooks/useAnalysis';
import { useAuthContext } from './hooks/useAuth';
import { EXAMPLE_QUERIES } from './mockData';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 36 };

export default function App() {
  const auth = useAuthContext();
  const {
    screen, query, stages, report, error, reportId, finalizing,
    startAnalysis, loadHistoricalReport, handleReset, handleRetry,
  } = useAnalysis();

  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 680 : true
  );
  const [inputValue, setInputValue] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const isLanding = screen === 'landing';
  const [isTouchDevice] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
  );

  const [anonUsed, setAnonUsed] = useState(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('ml_anon_used') === '1'
  );

  const [authError, setAuthError] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    if (err) window.history.replaceState({}, '', window.location.pathname);
    return err;
  });

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

  // Close sign-in when user becomes authenticated (mock or real)
  useEffect(() => {
    if (auth.isAuthenticated) setShowSignIn(false);
  }, [auth.isAuthenticated]);

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [8, -8]), { stiffness: 80, damping: 18 });
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-8, 8]), { stiffness: 80, damping: 18 });
  const glowX   = useSpring(useTransform(mouseX, [0, 1], [-30, 30]), { stiffness: 60, damping: 20 });
  const glowY   = useSpring(useTransform(mouseY, [0, 1], [-30, 30]), { stiffness: 60, damping: 20 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isLanding) return;
    const rect = shellRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  }, [isLanding, mouseX, mouseY]);

  const onReset = useCallback(() => {
    handleReset();
    setInputValue('');
    setShowSignIn(false);
    setShowPricing(false);
  }, [handleReset]);

  const onSubmit = useCallback((val: string) => {
    if (val.trim().length <= 4) return;

    if (!auth.isAuthenticated && anonUsed) {
      setShowSignIn(true);
      return;
    }

    startAnalysis(val.trim());
    setInputValue('');

    if (!auth.isAuthenticated) {
      setAnonUsed(true);
      sessionStorage.setItem('ml_anon_used', '1');
    }
  }, [startAnalysis, auth.isAuthenticated, anonUsed]);

  // ── Loading ─────────────────────────────────────────────
  if (auth.loading) {
    return (
      <div className="shell shell--landing">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <motion.div className="lnd-wordmark" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <span className="lnd-wm-inner">
            <span className="lnd-wm-primary">Market</span>
            <span className="lnd-wm-accent">Lens</span>
          </span>
        </motion.div>
      </div>
    );
  }

  // ── Pricing overlay ─────────────────────────────────────
  if (showPricing) {
    return (
      <div className="shell shell--pricing">
        <div className="orb orb-1" style={{ position: 'fixed' }} />
        <div className="orb orb-2" style={{ position: 'fixed' }} />
        <div className="orb orb-3" style={{ position: 'fixed' }} />
        <PricingSection
          onBack={() => setShowPricing(false)}
          onSignIn={() => { setShowPricing(false); setShowSignIn(true); }}
        />
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={`shell${isLanding ? ' shell--landing' : ' shell--workspace'}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { mouseX.set(0.5); mouseY.set(0.5); }}
    >
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Cursor glow — landing only, non-touch only */}
      <AnimatePresence>
        {isLanding && !isTouchDevice && (
          <motion.div
            className="cursor-glow"
            style={{ x: glowX, y: glowY }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
          />
        )}
      </AnimatePresence>

      {/* ── Sign-in modal ──────────────────────────────────── */}
      <SignInModal
        open={showSignIn}
        onClose={() => setShowSignIn(false)}
        auth={auth}
        onViewPricing={() => setShowPricing(true)}
      />

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
          {/* Wordmark */}
          <motion.div layoutId="ml-wordmark" className="lnd-wordmark" transition={SPRING}>
            <motion.span
              style={isTouchDevice ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' as const }}
              className="lnd-wm-inner"
            >
              <span className="lnd-wm-primary">Market</span>
              <span className="lnd-wm-accent">Lens</span>
            </motion.span>
          </motion.div>

          {/* Free tier badge — only for anonymous users */}
          {!auth.isAuthenticated && (
            <motion.div
              className="lnd-free-badge"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.08, duration: 0.32, ease: 'easeOut' as const } }}
            >
              <span className="lnd-free-badge-dot" />
              1 free analysis · No account needed
            </motion.div>
          )}

          <motion.p
            className="lnd-sub"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.14, duration: 0.38, ease: 'easeOut' as const } }}
          >
            Drop in a business idea. Get a competitive landscape,
            saturation score, and entry roadmap — in minutes.
          </motion.p>

          {/* Input */}
          <motion.div layoutId="ml-input" className="lnd-input-wrap" transition={SPRING}>
            <AnimatedAiInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={onSubmit}
              placeholder={EXAMPLE_QUERIES[phIdx]}
              autoFocus={!isTouchDevice}
            />
          </motion.div>

          <motion.div
            className="landing-examples"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.18, duration: 0.35 } }}
          >
            <span className="landing-examples-label">Try:</span>
            {EXAMPLE_QUERIES.map(ex => (
              <button key={ex} className="landing-pill" onClick={() => setInputValue(ex)}>
                {ex}
              </button>
            ))}
          </motion.div>

          {/* CTA row — sign in + pricing, only for anonymous users */}
          {!auth.isAuthenticated && (
            <motion.div
              className="lnd-cta-row"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.28, duration: 0.35 } }}
            >
              <button className="lnd-cta-signin" onClick={() => setShowSignIn(true)}>
                Sign in for 3/day
                <ArrowRight size={13} aria-hidden="true" />
              </button>
              <button className="lnd-cta-pricing" onClick={() => setShowPricing(true)}>
                View pricing
              </button>
            </motion.div>
          )}
        </>
      )}

      {/* ── Workspace ──────────────────────────────────────── */}
      {!isLanding && (
        <>
          <RecentThreads
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            activeId={reportId}
            onSelect={id => {
              loadHistoricalReport(id);
              if (window.innerWidth <= 680) setSidebarOpen(false);
              setInputValue('');
            }}
          />

          <div className={`workspace-body${sidebarOpen ? '' : ' workspace-body--sidebar-closed'}`}>
            <header className="ws-header">
              <button
                type="button"
                className="ws-sidebar-toggle"
                onClick={() => setSidebarOpen(o => !o)}
                aria-label="Toggle sidebar"
              >
                {sidebarOpen
                  ? <History size={15} strokeWidth={2} />
                  : <PanelLeft size={15} strokeWidth={2} />}
              </button>

              <motion.button
                type="button"
                layoutId="ml-wordmark"
                className="ws-logo"
                onClick={onReset}
                transition={SPRING}
              >
                <span className="ws-logo-primary">Market</span>
                <span className="ws-logo-accent">Lens</span>
              </motion.button>

              <motion.div
                className="ws-header-meta"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { delay: 0.28, duration: 0.3 } }}
              >
                {query && <div className="ws-query-label">"{query}"</div>}
                <div className="ws-header-spacer" />
                <span className="nav-badge">Beta</span>
                <button type="button" className="header-btn-ghost" onClick={onReset}>
                  + New analysis
                </button>
              </motion.div>
            </header>

            <main className="ws-main">
              <AnimatePresence mode="wait">
                {screen === 'analysis' ? (
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
                    {report && reportId && <ReportView report={report} reportId={reportId} />}
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

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
                placeholder="Ask a follow-up or start a new analysis…"
                compact
              />
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}
