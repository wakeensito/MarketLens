import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthContext } from '../hooks/useAuth';

const ENV_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const BASE = ENV_BASE ? ENV_BASE.replace(/\/$/, '') : '';

type Step = 'email' | 'code';

export default function LoginPage() {
  const auth = useAuthContext();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [session, setSession] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailHint, setEmailHint] = useState('');
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'code' && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [step]);

  const handleEmailSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${BASE}/auth/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send code. Please try again.');
        return;
      }

      setSession(data.session);
      setEmailHint(data.email_hint || trimmed);
      setStep('code');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email]);

  const handleCodeSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: trimmed, session }),
      });
      const data = await res.json();

      if (!res.ok) {
        // If we get a new session back, update it (for retry)
        if (data.session) setSession(data.session);
        setError(data.error || 'Verification failed. Please try again.');
        setCode('');
        return;
      }

      // Success — reload to pick up the new cookies
      window.location.reload();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [email, code, session]);

  const handleCodeChange = useCallback((val: string) => {
    // Only allow digits, max 6
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
  }, []);

  return (
    <div className="login-page">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="login-card">
        <div className="login-wordmark">
          <span className="lnd-wm-primary" style={{ fontSize: 28 }}>Market</span>
          <span className="lnd-wm-accent" style={{ fontSize: 28 }}>Lens</span>
        </div>

        <AnimatePresence mode="wait">
          {step === 'email' ? (
            <motion.form
              key="email-step"
              className="login-form"
              onSubmit={handleEmailSubmit}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <p className="login-heading">Sign in to MarketLens</p>
              <p className="login-sub">Enter your email — we'll send you a sign-in code.</p>

              <input
                type="email"
                className="login-input"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                autoFocus
                autoComplete="email"
                disabled={loading}
              />

              {error && <p className="login-error">{error}</p>}

              <button
                type="submit"
                className="login-submit"
                disabled={loading || !email.trim()}
              >
                {loading ? 'Sending…' : 'Continue'}
              </button>

              <div className="login-divider">
                <span className="login-divider-line" />
                <span className="login-divider-text">or</span>
                <span className="login-divider-line" />
              </div>

              <button
                type="button"
                className="login-sso-btn"
                onClick={auth.login}
              >
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continue with Google
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="code-step"
              className="login-form"
              onSubmit={handleCodeSubmit}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <p className="login-heading">Check your email</p>
              <p className="login-sub">
                We sent a 6-digit code to <strong>{emailHint}</strong>
              </p>

              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                className="login-input login-input--code"
                placeholder="000000"
                value={code}
                onChange={e => { handleCodeChange(e.target.value); setError(''); }}
                autoComplete="one-time-code"
                maxLength={6}
                disabled={loading}
              />

              {error && <p className="login-error">{error}</p>}

              <button
                type="submit"
                className="login-submit"
                disabled={loading || code.length !== 6}
              >
                {loading ? 'Verifying…' : 'Sign in'}
              </button>

              <button
                type="button"
                className="login-back"
                onClick={() => { setStep('email'); setCode(''); setError(''); }}
              >
                ← Use a different email
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
