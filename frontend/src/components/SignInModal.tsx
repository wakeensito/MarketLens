import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { PlinthsMark } from './BrandWordmark';
import type { AuthState } from '../hooks/useAuth';
import { LANDING_ENTRY_Y } from '../motion';

const TABBABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getTabbableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    el => el.getAttribute('aria-hidden') !== 'true',
  );
}

const SHOW_DEV_MOCK = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true';

const TERMS_URL = (import.meta.env.VITE_LEGAL_TERMS_URL as string | undefined)?.trim();
const PRIVACY_URL = (import.meta.env.VITE_LEGAL_PRIVACY_URL as string | undefined)?.trim();

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden className="signin-modal-btn-icon">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="signin-modal-btn-icon">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.221 0 4.605-2.805 5.624-5.475 5.921.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  auth: AuthState;
  onShowPricing?: () => void;
  variant?: 'default' | 'save-report';
}

export default function SignInModal({ isOpen, onClose, auth, onShowPricing, variant = 'default' }: SignInModalProps) {
  const isSaveReport = variant === 'save-report';
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const emailFieldId = useId();
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [otpStep, setOtpStep] = useState(false);
  const [otpSession, setOtpSession] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [otpEmailHint, setOtpEmailHint] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpErr, setOtpErr] = useState<string | null>(null);

  const closeModal = useCallback(() => {
    setEmailErr(null);
    setEmailBusy(false);
    setOtpStep(false);
    setOtpSession('');
    setOtpEmail('');
    setOtpCode('');
    setOtpErr(null);
    setOtpBusy(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeModal]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const t = window.setTimeout(() => closeModal(), 0);
    return () => clearTimeout(t);
  }, [auth.isAuthenticated, closeModal]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = requestAnimationFrame(() => {
      if (otpStep) {
        codeInputRef.current?.focus();
      } else {
        emailInputRef.current?.focus();
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      previous?.focus({ preventScroll: true });
    };
  }, [isOpen, otpStep]);

  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const list = getTabbableIn(dialogRef.current);
    if (list.length === 0) return;
    const first = list[0]!;
    const last = list[list.length - 1]!;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) closeModal();
  };

  async function handleEmailContinue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailErr(null);
    const fd = new FormData(e.currentTarget);
    const raw = String(fd.get('email') ?? '').trim();
    if (!raw) {
      setEmailErr('Enter your email.');
      return;
    }
    setEmailBusy(true);
    try {
      const { session, emailHint } = await auth.continueWithEmail(raw);
      setOtpEmail(raw);
      setOtpEmailHint(emailHint);
      setOtpSession(session);
      setOtpStep(true);
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleCodeVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOtpErr(null);
    const trimmed = otpCode.trim();
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      setOtpErr('Enter the 6-digit code from your email.');
      return;
    }
    setOtpBusy(true);
    try {
      await auth.verifyCode(otpEmail, trimmed, otpSession);
      // Modal is closed by the useEffect on auth.isAuthenticated (line 85).
      // If verifyCode resolves without throwing, auth state is true and that
      // effect fires. Do NOT call closeModal() here — it would fire before
      // React commits the state change, dropping the user back unsigned in.
    } catch (err) {
      if (err instanceof Error) {
        // Update session if a new one was provided
        const newSession = (err as Error & { session?: string }).session;
        if (newSession) setOtpSession(newSession);
        setOtpErr(err.message);
      } else {
        setOtpErr('Verification failed. Try again.');
      }
      setOtpCode('');
    } finally {
      setOtpBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={backdropRef}
          className="signin-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' as const }}
            onClick={handleBackdropClick}
        >
          <motion.div
            ref={dialogRef}
            className="signin-modal-card"
            initial={{ opacity: 0, y: LANDING_ENTRY_Y, scale: 1 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: LANDING_ENTRY_Y, scale: 1 }}
            transition={{ duration: 0.38, ease: 'easeOut' as const }}
            role="dialog"
            aria-modal="true"
            aria-label="Sign in to plinths"
            onClick={e => e.stopPropagation()}
            onKeyDown={handleDialogKeyDown}
          >
            <button className="signin-modal-close" type="button" onClick={closeModal} aria-label="Close">
              <X size={14} strokeWidth={2.5} />
            </button>

            <div className="signin-modal-header">
              <PlinthsMark className="signin-modal-mark" />
              <span className="signin-modal-badge">
                <span className="signin-modal-badge-dot" />
                {isSaveReport ? 'Save report · Unlock 3/day' : '3 analyses/day · Roadmaps · Exports'}
              </span>
            </div>

            <h2 className="signin-modal-title">
              {isSaveReport ? 'Save your free report' : 'Welcome to plinths'}
            </h2>
            <p className="signin-modal-desc">
              {isSaveReport
                ? 'Sign in to keep this analysis and unlock 3 more per day.'
                : 'Sign in to unlock your full intelligence suite'}
            </p>

            <div className="signin-modal-actions signin-modal-actions--top">
              <button
                type="button"
                className="signin-modal-btn signin-modal-btn--google"
                onClick={() => auth.login()}
              >
                <GoogleIcon />
                Continue with Google
              </button>
              <button
                type="button"
                className="signin-modal-btn signin-modal-btn--github"
                onClick={() => auth.login()}
              >
                <GitHubIcon />
                Continue with GitHub
              </button>
            </div>

            {SHOW_DEV_MOCK && auth.mockLogin ? (
              <button type="button" className="signin-modal-devmock" onClick={() => auth.mockLogin?.()}>
                Dev mock sign in
              </button>
            ) : null}

            <div className="signin-modal-divider" aria-hidden>
              <span className="signin-modal-divider-line" />
              <span className="signin-modal-divider-text">Or continue with email</span>
              <span className="signin-modal-divider-line" />
            </div>

            <AnimatePresence mode="wait">
              {!otpStep ? (
                <motion.form
                  key="email-step"
                  className="signin-modal-email-form"
                  onSubmit={handleEmailContinue}
                  noValidate
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <label className="signin-modal-label" htmlFor={emailFieldId}>Email</label>
                  <input
                    ref={emailInputRef}
                    id={emailFieldId}
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@company.com"
                    className="signin-modal-input"
                    disabled={emailBusy}
                    aria-invalid={emailErr ? true : undefined}
                    aria-describedby={emailErr ? `${emailFieldId}-err` : undefined}
                  />
                  {emailErr ? (
                    <p id={`${emailFieldId}-err`} className="signin-modal-field-error" role="alert">
                      {emailErr}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    className="signin-modal-btn signin-modal-btn--continue"
                    disabled={emailBusy}
                  >
                    {emailBusy ? 'Sending code…' : 'Continue'}
                  </button>
                </motion.form>
              ) : (
                <motion.form
                  key="code-step"
                  className="signin-modal-email-form"
                  onSubmit={handleCodeVerify}
                  noValidate
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <p className="signin-modal-otp-hint">
                    We sent a 6-digit code to <strong>{otpEmailHint}</strong>
                  </p>
                  <input
                    ref={codeInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    className="signin-modal-input signin-modal-input--code"
                    maxLength={6}
                    value={otpCode}
                    onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpErr(null); }}
                    disabled={otpBusy}
                    aria-invalid={otpErr ? true : undefined}
                  />
                  {otpErr ? (
                    <p className="signin-modal-field-error" role="alert">{otpErr}</p>
                  ) : null}
                  <button
                    type="submit"
                    className="signin-modal-btn signin-modal-btn--continue"
                    disabled={otpBusy || otpCode.length !== 6}
                  >
                    {otpBusy ? 'Verifying…' : 'Sign in'}
                  </button>
                  <button
                    type="button"
                    className="signin-modal-back-link"
                    onClick={() => { setOtpStep(false); setOtpCode(''); setOtpErr(null); }}
                  >
                    ← Use a different email
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            {onShowPricing ? (
              <button
                className="signin-modal-pricing-link"
                type="button"
                onClick={() => { closeModal(); onShowPricing(); }}
              >
                View plans &amp; pricing →
              </button>
            ) : null}

            <p className="signin-modal-legal">
              By continuing you agree to our{' '}
              {TERMS_URL ? (
                <a href={TERMS_URL} target="_blank" rel="noopener noreferrer">
                  Terms
                </a>
              ) : (
                <span className="signin-modal-legal-plain">Terms</span>
              )}
              {' '}and{' '}
              {PRIVACY_URL ? (
                <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </a>
              ) : (
                <span className="signin-modal-legal-plain">Privacy Policy</span>
              )}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
