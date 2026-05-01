import { Fragment, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, X, PanelLeftClose, Zap, Palette, User, Settings2, HelpCircle, LogOut } from 'lucide-react';
import type { ApiReport } from '../api';
import { listReports } from '../api';
import { MOCK_HISTORY } from '../mockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

function scoreColor(score: number): string {
  if (score <= 40) return 'var(--success)';
  if (score <= 65) return 'var(--warning)';
  return 'var(--danger)';
}

function relativeDate(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  <  1) return 'Just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  <  7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface Props {
  isOpen:   boolean;
  onClose:  () => void;
  activeId: string | null;
  onSelect: (reportId: string) => void;
}

const PROFILE_MENU_ITEMS = [
  { id: 'upgrade',         label: 'Upgrade Plan',    Icon: Zap,        danger: false },
  { id: 'personalization', label: 'Personalization', Icon: Palette,    danger: false },
  { id: 'profile',         label: 'Profile',         Icon: User,       danger: false },
  { id: 'settings',        label: 'Settings',        Icon: Settings2,  danger: false },
  { id: 'help',            label: 'Help & Support',  Icon: HelpCircle, danger: false },
  { id: 'logout',          label: 'Log Out',         Icon: LogOut,     danger: true  },
];

export default function RecentThreads({ isOpen, onClose, activeId, onSelect }: Props) {
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileGroupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (profileGroupRef.current && !profileGroupRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [profileOpen]);

  useEffect(() => {
    const shouldLoad = typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 681px)').matches || isOpen
      : isOpen;
    if (!shouldLoad) return;

    setLoading(true);
    if (USE_MOCK) {
      const t = setTimeout(() => { setReports(MOCK_HISTORY); setLoading(false); }, 350);
      return () => clearTimeout(t);
    }
    listReports()
      .then(r => setReports(r.slice().reverse()))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="threads-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside className={`ws-sidebar${isOpen ? ' ws-sidebar--open' : ' ws-sidebar--closed'}`}>
        {/* Sidebar header */}
        <div className="threads-header">
          <div className="threads-header-left">
            <Clock size={11} strokeWidth={2.5} />
            <span className="threads-title">Briefings</span>
            {reports.length > 0 && (
              <span className="threads-count">{reports.length}</span>
            )}
          </div>
          <div className="threads-header-actions">
            {/* Desktop: collapse button */}
            <button className="sidebar-collapse-btn" onClick={onClose} aria-label="Collapse sidebar">
              <PanelLeftClose size={14} strokeWidth={1.8} />
            </button>
            {/* Mobile: close (X) button */}
            <button className="threads-close" onClick={onClose} aria-label="Close sidebar">
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Thread list */}
        <div className="threads-list" role="listbox" aria-label="Recent analyses">
          {loading ? (
            <div className="threads-loading">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="threads-skeleton" style={{ animationDelay: `${i * 0.09}s` }} />
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="threads-empty">
              <p className="threads-empty-text">No briefings yet.</p>
              <p className="threads-empty-sub">Your analyses will appear here once complete.</p>
            </div>
          ) : (
            reports.map((r, i) => {
              const score  = r.result_json ? Number(r.result_json.saturation_score) : null;
              const active = r.report_id === activeId;
              const done   = r.status === 'complete';

              return (
                <motion.button
                  key={r.report_id}
                  role="option"
                  aria-selected={active}
                  className={`thread-item${active ? ' thread-item--active' : ''}${!done ? ' thread-item--pending' : ''}`}
                  onClick={() => { if (done) onSelect(r.report_id); }}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.26, ease: 'easeOut' as const }}
                >
                  <div className="thread-item-meta">
                    <span className="thread-item-date">{relativeDate(r.created_at)}</span>
                    {r.status === 'running' && <span className="thread-status-dot thread-status-dot--running" />}
                    {r.status === 'failed'  && <span className="thread-status-dot thread-status-dot--failed"  />}
                  </div>
                  <p className="thread-item-query">{r.idea_text}</p>
                  {score !== null && (
                    <div className="thread-item-score" style={{ color: scoreColor(score) }}>
                      <span className="thread-score-num">{score}</span>
                      <span className="thread-score-label">saturation</span>
                    </div>
                  )}
                </motion.button>
              );
            })
          )}
        </div>

        <div className="sidebar-profile-group" ref={profileGroupRef}>
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                className="profile-menu"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15, ease: 'easeOut' as const }}
              >
                {PROFILE_MENU_ITEMS.map((item) => {
                  const Icon = item.Icon;
                  return (
                    <Fragment key={item.id}>
                      {item.danger && <div className="profile-menu-sep" />}
                      <button
                        type="button"
                        className={`profile-menu-item${item.danger ? ' profile-menu-item--danger' : ''}`}
                        onClick={() => setProfileOpen(false)}
                      >
                        <Icon size={13} strokeWidth={2} />
                        {item.label}
                      </button>
                    </Fragment>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            className={`sidebar-profile${profileOpen ? ' sidebar-profile--active' : ''}`}
            onClick={() => setProfileOpen(o => !o)}
            aria-label="Open profile menu"
            aria-expanded={profileOpen}
          >
            <div className="sidebar-profile-avatar">JP</div>
            <div className="sidebar-profile-info">
              <span className="sidebar-profile-name">Joaquin Porter</span>
              <span className="sidebar-profile-plan">
                <Zap size={9} strokeWidth={2.5} />
                Free plan
              </span>
            </div>
            <div className="sidebar-profile-dots">···</div>
          </button>
        </div>
      </aside>
    </>
  );
}
