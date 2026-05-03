export type ThemePreference = 'light' | 'dark' | 'system';

const KEY = 'plinths-theme';

export function getSystemResolved(): 'light' | 'dark' {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light';
}

export function getThemePref(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem(KEY) as ThemePreference | null) ?? 'system';
}

export function getResolved(pref: ThemePreference = getThemePref()): 'light' | 'dark' {
  return pref === 'system' ? getSystemResolved() : pref;
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
