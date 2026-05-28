import { useRef, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export type WorkspaceTab = 'report' | 'build-brief' | 'muse';

interface TabDef {
  id: WorkspaceTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'report', label: 'Report' },
  { id: 'build-brief', label: 'Build Brief' },
  { id: 'muse', label: 'Muse' },
];

interface Props {
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  /** Non-paid users get a "Pro" marker on Build Brief. */
  isPaid: boolean;
  /** Anonymous users get a "Sign in" marker on Muse. */
  isAuthenticated: boolean;
}

export function WorkspaceTabs({ active, onChange, isPaid, isAuthenticated }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const reduceMotion = useReducedMotion();

  const markerFor = (id: WorkspaceTab): string | null => {
    if (id === 'build-brief' && !isPaid) return 'Pro';
    if (id === 'muse' && !isAuthenticated) return 'Sign in';
    return null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const next =
      e.key === 'ArrowRight'
        ? (idx + 1) % TABS.length
        : e.key === 'ArrowLeft'
          ? (idx - 1 + TABS.length) % TABS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? TABS.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    const id = TABS[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };

  return (
    <div className="ws-tabs" role="tablist" aria-label="Workspace views">
      {TABS.map((t, idx) => {
        const selected = t.id === active;
        const marker = markerFor(t.id);
        return (
          <button
            key={t.id}
            ref={el => {
              refs.current[t.id] = el;
            }}
            role="tab"
            id={`ws-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`ws-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={`ws-tab${selected ? ' is-active' : ''}`}
            onClick={() => onChange(t.id)}
            onKeyDown={e => onKeyDown(e, idx)}
          >
            <span className="ws-tab-label">{t.label}</span>
            {marker && <span className="ws-tab-marker">{marker}</span>}
            {selected && (
              <motion.span
                className="ws-tab-underline"
                layoutId="ws-tab-underline"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 0.18, ease: [0.25, 1, 0.5, 1] }
                }
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
