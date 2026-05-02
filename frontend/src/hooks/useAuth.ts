import { useState, useEffect, useCallback, useRef } from 'react';

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
}

const ENV_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
const BASE = ENV_BASE ? ENV_BASE.replace(/\/$/, '') : '';

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
    window.location.href = `${BASE}/auth/login`;
  }, []);

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

  // Initial auth check on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return { loading, isAuthenticated, user, login, logout, refresh };
}
