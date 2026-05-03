import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import { AuthContext } from '../authContext';

export type EmailAuthIntent = 'signin' | 'signup';

export interface AuthUser {
  user_id: string;
  email: string;
  name: string;
  org_id: string;
  plan: string;
}

export interface AuthState {
  /** Whether the initial auth check has completed */
  loading: boolean;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** User info (null if not authenticated) */
  user: AuthUser | null;
  /** Redirect to Cognito Hosted UI for login */
  login: () => void;
  /** Clear cookies and log out */
  logout: () => Promise<void>;
  /** Silently refresh the access token */
  refresh: () => Promise<boolean>;
  /** Instant mock login — only present when VITE_USE_MOCK=true */
  mockLogin?: () => void;
  /** Email + password — mock signs in locally; production POSTs to BFF for Cognito */
  loginWithEmail: (
    credentials: { email: string; password: string },
    intent: EmailAuthIntent,
  ) => Promise<void>;
  /** Email-only step (magic link / Cognito custom auth) — mock signs in locally */
  continueWithEmail: (email: string) => Promise<void>;
}

const ENV_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const BASE = ENV_BASE ? ENV_BASE.replace(/\/$/, '') : '';

const IS_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const MOCK_USER: AuthUser = {
  user_id: 'mock-user-001',
  email: 'demo@marketlens.ai',
  name: 'Demo User',
  org_id: 'mock-org',
  plan: 'analyst',
};

// Check the non-HttpOnly cookie to avoid unnecessary /auth/me calls
function hasLoginCookie(): boolean {
  return document.cookie.split(';').some(c => c.trim().startsWith('ml_logged_in='));
}

export function useAuth(): AuthState {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAuth = useCallback(async () => {
    // Mock mode: skip backend, start unauthenticated so sign-in flow can be tested
    if (IS_MOCK) {
      setIsAuthenticated(false);
      setUser(null);
      setLoading(false);
      return;
    }

    if (!hasLoginCookie()) {
      setIsAuthenticated(false);
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${BASE}/auth/me`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Auth check failed: ${res.status}`);
      const data = await res.json();

      if (data.authenticated && data.user) {
        setIsAuthenticated(true);
        setUser(data.user);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch {
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(() => {
    if (IS_MOCK) return; // no-op in mock mode; use mockLogin instead
    window.location.href = `${BASE}/auth/login`;
  }, []);

  const mockLogin = IS_MOCK
    ? () => { setIsAuthenticated(true); setUser(MOCK_USER); }
    : undefined;

  const loginWithEmail = useCallback(
    async ({ email, password }: { email: string; password: string }, intent: EmailAuthIntent) => {
      const trimmed = email.trim();
      if (!trimmed || !password) return;

      if (IS_MOCK) {
        const localPart = trimmed.split('@')[0] ?? '';
        const displayName = localPart.replace(/[.+_-]/g, ' ').trim() || MOCK_USER.name;
        setIsAuthenticated(true);
        setUser({
          ...MOCK_USER,
          email: trimmed,
          name: displayName,
        });
        return;
      }

      const res = await fetch(`${BASE}/auth/email-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: trimmed, password, intent }),
      });
      if (!res.ok) {
        throw new Error(
          intent === 'signup'
            ? `Could not create account (${res.status})`
            : `Sign-in failed (${res.status})`,
        );
      }
      await checkAuth();
    },
    [checkAuth],
  );

  const continueWithEmail = useCallback(
    async (email: string) => {
      const trimmed = email.trim();
      if (!trimmed) throw new Error('Enter your email.');

      if (IS_MOCK) {
        const localPart = trimmed.split('@')[0] ?? '';
        const displayName = localPart.replace(/[.+_-]/g, ' ').trim() || MOCK_USER.name;
        setIsAuthenticated(true);
        setUser({
          ...MOCK_USER,
          email: trimmed,
          name: displayName,
        });
        return;
      }

      const res = await fetch(`${BASE}/auth/email/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) throw new Error(`Could not continue (${res.status})`);

      const ct = res.headers.get('content-type');
      let authChecked = false;
      if (ct?.includes('application/json')) {
        try {
          const data = (await res.json()) as { authenticated?: boolean };
          if (data?.authenticated) {
            await checkAuth();
            authChecked = true;
          }
        } catch {
          /* ignore malformed JSON */
        }
      }
      if (!authChecked) await checkAuth();
    },
    [checkAuth],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best-effort — cookies will be cleared by the response
    }
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setIsAuthenticated(false);
        setUser(null);
        return false;
      }
      return true;
    } catch {
      setIsAuthenticated(false);
      setUser(null);
      return false;
    }
  }, []);

  // Schedule silent refresh every 50 minutes (access token is 1 hour)
  useEffect(() => {
    if (!isAuthenticated) return;

    const scheduleRefresh = () => {
      refreshTimerRef.current = setTimeout(async () => {
        const ok = await refresh();
        if (ok) scheduleRefresh();
      }, 50 * 60 * 1000);
    };

    scheduleRefresh();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [isAuthenticated, refresh]);

  // checkAuth is async — all setState calls happen after await, not synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void checkAuth(); }, [checkAuth]);

  return {
    loading,
    isAuthenticated,
    user,
    login,
    logout,
    refresh,
    mockLogin,
    loginWithEmail,
    continueWithEmail,
  };
}

export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
