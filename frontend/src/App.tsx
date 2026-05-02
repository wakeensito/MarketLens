import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { History, PanelLeft } from 'lucide-react';
import PipelineTracker from './components/PipelineTracker';
import ReportView from './components/ReportView';
import AnimatedAiInput from './components/AnimatedAiInput';
import RecentThreads from './components/RecentThreads';
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

  const [sidebarOpen,  setSidebarOpen]  = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 680 : true
  );
  const [inputValue, setInputValue] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  const [showAuthGate, setShowAuthGate] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const isLanding = screen === 'landing';
  const [isTouchDevice] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches
  );

  // Track whether anonymous user has used their free report
  const [anonUsed, setAnonUsed] = useState(false);

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

  // Check for auth_error in URL (from failed OAuth callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (authError) {
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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
    setShowAuthGate(false);
  }, [handleReset]);

  const onSubmit = useCallback((val: string) => {
    if (val.trim().length <= 4) return;

    // Anonymous user who already used their free report → show auth gate
    if (!auth.isAuthenticated && anonUsed) {
      setShowAuthGate(true);
      return;
    }

    startAnalysis(val.trim());
    setInputValue('');

    // Mark anonymous usage
    if (!auth.isAuthenticated) {
      setAnonUsed(true);
    }
  }, [startAnalysis, auth.isAuthenticated, anonUsed]);

  // Loading state while checking auth
  if (auth.loading) {
    return (
      <div className="shell shell--landing">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <motion.div
          className="lnd-wordmark"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <span className="lnd-wm-inner">
            <span className="lnd-wm-primary">Market</span>
            <span className="lnd-wm-accent">Lens</span>
          </span>
        </motion.div>
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
      {/* Atmospheric orbs — always present */}
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

      {/* ── AUTH GATE MODAL ─────────────────────────────────── */}
      <AnimatePresence>
        {showAuthGate && (
          <motion.div
            className="auth-gate-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAuthGate(false)}
          >
            <motion.div
              className="auth-gate"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={e => e.stopPropagation()}
            >
              <h2 className="auth-gate-title">Create a free account to continue</h2>
              <p className="auth-gate-sub">
                You've used your free analysis. Sign up to get 3 analyses per day — no credit card required.
              </p>
              <div className="auth-gate-buttons">
                <button className="auth-gate-btn auth-gate-btn--google" onClick={auth.login}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Continue with Google
                </button>
                <button className="auth-gate-btn auth-gate-btn--github" onClick={auth.login}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  Continue with GitHub
                </button>
              </div>
              <button className="auth-gate-dismiss" onClick={() => setShowAuthGate(false)}>
                Maybe later
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LANDING ──────────────────────────────────────────── */}
      {isLanding && (
        <>
          {/* Wordmark — large, centered in flex column */}
          <motion.div
            layoutId="ml-wordmark"
            className="lnd-wordmark"
            transition={SPRING}
          >
            <motion.span
              style={isTouchDevice ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' as const }}
              className="lnd-wm-inner"
            >
              <span className="lnd-wm-primary">Market</span>
              <span className="lnd-wm-accent">Lens</span>
            </motion.span>
          </motion.div>

          <motion.p
            className="lnd-sub"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' as const } }}
          >
            Drop in a business idea. Get a competitive landscape,
            saturation score, and entry roadmap — in minutes.
          </motion.p>

          {/* Input — full size */}
          <motion.div
            layoutId="ml-input"
            className="lnd-input-wrap"
            transition={SPRING}
          >
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
            animate={{ opacity: 1, transition: { delay: 0.15, duration: 0.35 } }}
          >
            <span className="landing-examples-label">Try:</span>
            {EXAMPLE_QUERIES.map(ex => (
              <button key={ex} className="landing-pill" onClick={() => setInputValue(ex)}>
                {ex}
              </button>
            ))}
          </motion.div>

          {/* Landing auth prompt — subtle, below examples */}
          {!auth.isAuthenticated && (
            <motion.div
              className="landing-auth-prompt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.3, duration: 0.35 } }}
            >
              <span className="landing-auth-text">
                Try one analysis free.
              </span>
              <button className="landing-auth-link" onClick={auth.login}>
                Sign in
              </button>
              <span className="landing-auth-text">
                for 3/day.
              </span>
            </motion.div>
          )}
        </>
      )}

      {/* ── WORKSPACE ────────────────────────────────────────── */}
      {!isLanding && (
        <>
          {/* Persistent sidebar on desktop / overlay on mobile */}
          <RecentThreads
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            activeId={reportId}
            onSelect={id => { loadHistoricalReport(id); if (window.innerWidth <= 680) setSidebarOpen(false); setInputValue(''); }}
          />

          {/* Main workspace column */}
          <div className={`workspace-body${sidebarOpen ? '' : ' workspace-body--sidebar-closed'}`}>
            <header className="ws-header">
              {/* Sidebar toggle — mobile always, desktop when sidebar is closed */}
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

              {/* Wordmark — small (shared layoutId with landing) */}
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

              {/* Header meta fades in separately */}
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

            {/* Scrollable main */}
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
