export type ThemePreference = 'light' | 'stealth' | 'system';
export type ResolvedTheme = 'light' | 'stealth';

const KEY = 'plinths-theme';

export function getSystemResolved(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'stealth' : 'light';
}

export function getThemePref(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(KEY) as ThemePreference | null;
  if (stored === 'light' || stored === 'stealth' || stored === 'system') return stored;
  if (stored === 'dark') {
    localStorage.setItem(KEY, 'stealth');
    return 'stealth';
  }
  return 'system';
}

export function getResolved(pref: ThemePreference = getThemePref()): ResolvedTheme {
  if (pref === 'system') return getSystemResolved();
  return pref;
}

export function setThemePref(pref: ThemePreference): void {
  if (pref === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  document.documentElement.setAttribute('data-theme', getResolved(pref));
}

export function initTheme(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', getResolved());
}
