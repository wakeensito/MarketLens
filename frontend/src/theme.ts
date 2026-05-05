export type ThemePreference = 'light' | 'stealth' | 'system';
export type ResolvedTheme = 'light' | 'stealth';

const KEY = 'plinths-theme';

export function getSystemResolved(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'stealth' : 'light';
}

export function getThemePref(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(KEY);
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

const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f0ede7',
  stealth: '#1a1814',
};

function syncThemeColorMeta(resolved: ResolvedTheme): void {
  const meta = document.getElementById('theme-color') as HTMLMetaElement | null;
  if (meta) meta.content = THEME_COLORS[resolved];
}

export function setThemePref(pref: ThemePreference): void {
  if (pref === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, pref);
  const resolved = getResolved(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  syncThemeColorMeta(resolved);
}

export function initTheme(): void {
  if (typeof document === 'undefined') return;
  const resolved = getResolved();
  document.documentElement.setAttribute('data-theme', resolved);
  syncThemeColorMeta(resolved);
}
