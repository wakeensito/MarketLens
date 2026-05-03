import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { PlinthsMark } from './BrandWordmark';
import type { AuthState } from '../hooks/useAuth';

const SHOW_DEV_MOCK = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true';

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
}

export default function SignInModal({ isOpen, onClose, auth, onShowPricing }: SignInModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const emailFieldId = useId();
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  const closeModal = useCallback(() => {
    setEmailErr(null);
    setEmailBusy(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeModal]);

  useEffect(() => {
    if (!auth.isAuthenticated || !isOpen) return;
    const t = window.setTimeout(() => closeModal(), 0);
    return () => clearTimeout(t);
  }, [auth.isAuthenticated, isOpen, closeModal]);

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
      await auth.continueWithEmail(raw);
      closeModal();
    } catch (err) {
      setEmailErr(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setEmailBusy(false);
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
            className="signin-modal-card"
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
            role="dialog"
            aria-modal="true"
            aria-label="Sign in to plinths"
            onClick={e => e.stopPropagation()}
          >
            <button className="signin-modal-close" type="button" onClick={closeModal} aria-label="Close">
              <X size={14} strokeWidth={2.5} />
            </button>

            <div className="signin-modal-header">
              <PlinthsMark className="signin-modal-mark" />
              <span className="signin-modal-badge">
                <span className="signin-modal-badge-dot" />
                3 analyses/day · Roadmaps · Exports
              </span>
            </div>

            <h2 className="signin-modal-title">Welcome to plinths</h2>
            <p className="signin-modal-desc">Sign in to unlock your full intelligence suite</p>

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

            <form className="signin-modal-email-form" onSubmit={handleEmailContinue} noValidate>
              <label className="signin-modal-label" htmlFor={emailFieldId}>Email</label>
              <input
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
                {emailBusy ? 'Please wait…' : 'Continue'}
              </button>
            </form>

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
              <a href="#" onClick={e => e.preventDefault()}>Terms</a>
              {' '}and{' '}
              <a href="#" onClick={e => e.preventDefault()}>Privacy Policy</a>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
