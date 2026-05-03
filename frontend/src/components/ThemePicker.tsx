import { useState } from 'react';
import { getResolved, setThemePref, type ResolvedTheme } from '../theme';

const THEMES: { id: ResolvedTheme; label: string }[] = [
  { id: 'light',   label: 'Light'   },
  { id: 'dark',    label: 'Warm dark' },
  { id: 'stealth', label: 'Stealth'  },
];

export function ThemePicker() {
  const [current, setCurrent] = useState<ResolvedTheme>(() => getResolved());

  const handleSelect = (theme: ResolvedTheme) => {
    setThemePref(theme);
    setCurrent(theme);
  };

  return (
    <div className="theme-picker" role="group" aria-label="Choose theme">
      {THEMES.map(({ id, label }) => (
        <button
          key={id}
          className={`theme-picker-btn${current === id ? ' theme-picker-btn--active' : ''}`}
          onClick={() => handleSelect(id)}
          aria-label={`${label} mode`}
          aria-pressed={current === id}
          title={label}
        >
          {id === 'light'   && <SunIcon />}
          {id === 'dark'    && <MoonIcon />}
          {id === 'stealth' && <StealthIcon />}
        </button>
      ))}
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <circle cx="6.5" cy="6.5" r="2.5" fill="currentColor" />
      <line x1="6.5" y1="0.5" x2="6.5" y2="2"   stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="6.5" y1="11" x2="6.5" y2="12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="0.5" y1="6.5" x2="2"   y2="6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="11"  y1="6.5" x2="12.5" y2="6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2.2" y1="2.2" x2="3.3"  y2="3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="9.7" y1="9.7" x2="10.8" y2="10.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="10.8" y1="2.2" x2="9.7" y2="3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="3.3"  y1="9.7" x2="2.2" y2="10.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path
        d="M10.5 8.1A4.6 4.6 0 0 1 4.9 2.5 4.6 4.6 0 1 0 10.5 8.1z"
        fill="currentColor"
      />
    </svg>
  );
}

function StealthIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <circle cx="6.5" cy="6.5" r="2.2" fill="currentColor" />
      <circle cx="6.5" cy="6.5" r="5"   stroke="currentColor" strokeWidth="0.9" opacity="0.35" />
    </svg>
  );
}
