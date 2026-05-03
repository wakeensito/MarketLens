import { useEffect, useState } from 'react';
import { getThemePref, setThemePref, type ThemePreference } from '../theme';

const THEMES: { id: ThemePreference; label: string }[] = [
  { id: 'light',   label: 'Light'   },
  { id: 'stealth', label: 'Stealth' },
  { id: 'system',  label: 'System'  },
];

export function ThemePicker() {
  const [pref, setPref] = useState<ThemePreference>(() => getThemePref());

  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setThemePref('system');
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [pref]);

  const handleSelect = (next: ThemePreference) => {
    setThemePref(next);
    setPref(next);
  };

  return (
    <div className="theme-picker" role="group" aria-label="Choose theme">
      {THEMES.map(({ id, label }) => (
        <button
          key={id}
          className={`theme-picker-btn${pref === id ? ' theme-picker-btn--active' : ''}`}
          onClick={() => handleSelect(id)}
          aria-label={`${label} theme`}
          aria-pressed={pref === id}
          title={label}
        >
          {id === 'light'   && <SunIcon />}
          {id === 'stealth' && <StealthIcon />}
          {id === 'system'  && <SystemIcon />}
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

function StealthIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <circle cx="6.5" cy="6.5" r="2.2" fill="currentColor" />
      <circle cx="6.5" cy="6.5" r="5"   stroke="currentColor" strokeWidth="0.9" opacity="0.35" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <line x1="4" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
