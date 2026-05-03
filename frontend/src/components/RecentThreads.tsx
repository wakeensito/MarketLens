import { Fragment, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, X, PanelLeftClose, Zap, Palette, User, Settings2, HelpCircle, LogOut, SquarePen, Sun, Moon, Circle } from 'lucide-react';
import type { ApiReport } from '../api';
import { listReports } from '../api';
import { useAuthContext } from '../hooks/useAuth';
import { BrandWordmarkInner, PlinthsMark } from './BrandWordmark';
import { MOCK_HISTORY } from '../mockData';
import { getThemePref, getResolved, setThemePref, type ThemePreference } from '../theme';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 36 };

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
  isOpen:     boolean;
  onClose:    () => void;
  onOpen:     () => void;
  onNewChat:  () => void;
  activeId:   string | null;
  onSelect:   (reportId: string) => void;
}

const PROFILE_MENU_ITEMS = [
  { id: 'upgrade',         label: 'Upgrade Plan',    Icon: Zap,        danger: false },
  { id: 'personalization', label: 'Personalization', Icon: Palette,    danger: false },
  { id: 'profile',         label: 'Profile',         Icon: User,       danger: false },
  { id: 'settings',        label: 'Settings',        Icon: Settings2,  danger: false },
  { id: 'help',            label: 'Help & Support',  Icon: HelpCircle, danger: false },
  { id: 'logout',          label: 'Log Out',         Icon: LogOut,     danger: true  },
];

export default function RecentThreads({ isOpen, onClose, onOpen, onNewChat, activeId, onSelect }: Props) {
  const auth = useAuthContext();
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileGroupRef = useRef<HTMLDivElement>(null);
  const [themePref, setLocalPref] = useState<ThemePreference>(getThemePref);
  const resolvedTheme = getResolved(themePref);

  const toggleTheme = () => {
    const next: ThemePreference =
      resolvedTheme === 'light' ? 'dark' :
      resolvedTheme === 'dark'  ? 'stealth' : 'light';
    setThemePref(next);
    setLocalPref(next);
  };

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

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void (async () => {
        setLoading(true);
        try {
          if (USE_MOCK) {
            await new Promise<void>(resolve => { setTimeout(resolve, 350); });
            if (cancelled) return;
            setReports(MOCK_HISTORY);
          } else {
            const r = await listReports();
            if (cancelled) return;
            setReports(r.slice().reverse());
          }
        } catch {
          if (!cancelled) setReports([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    });

    return () => { cancelled = true; };
  }, [isOpen]);

  const avatarLabel = auth.isAuthenticated && auth.user
    ? (auth.user.name || auth.user.email || '?').slice(0, 2).toUpperCase()
    : '?';

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

        {/* ── RAIL MODE (desktop, shown when collapsed) ── */}
        <div className="sidebar-rail-content">
          <button
            type="button"
            className="sidebar-rail-logo-btn"
            onClick={onOpen}
            aria-label="Expand sidebar"
            title="plinths"
          >
            <PlinthsMark className="sidebar-rail-mark" />
          </button>

          <button
            type="button"
            className="sidebar-rail-new-btn"
            onClick={onNewChat}
            aria-label="New analysis"
            title="New analysis"
          >
            <SquarePen size={15} strokeWidth={1.8} />
          </button>

          <div className="sidebar-rail-threads">
            {reports.slice(0, 10).map(r => {
              const score = r.result_json ? Number(r.result_json.saturation_score) : null;
              const isActive = r.report_id === activeId;
              return (
                <button
                  key={r.report_id}
                  type="button"
                  className={`sidebar-rail-dot${isActive ? ' sidebar-rail-dot--active' : ''}`}
                  onClick={() => { if (r.status === 'complete') onSelect(r.report_id); }}
                  title={r.idea_text}
                  style={{ background: score !== null ? scoreColor(score) : undefined }}
                />
              );
            })}
          </div>

          <div className="sidebar-rail-footer">
            <button
              type="button"
              className="sidebar-rail-avatar-btn"
              onClick={() => { if (auth.isAuthenticated) { onOpen(); } else { auth.login(); } }}
              aria-label={auth.isAuthenticated ? 'Expand sidebar' : 'Sign in'}
            >
              <div className="sidebar-profile-avatar">{avatarLabel}</div>
            </button>
          </div>
        </div>

        {/* ── EXPANDED MODE ── */}
        <div className="sidebar-full-content">

          {/* Brand header */}
          <div className="sidebar-brand-header">
            <motion.button
              layoutId="ml-wordmark"
              type="button"
              className="sidebar-brand-logo-btn"
              onClick={onNewChat}
              transition={SPRING}
              aria-label="plinths — new analysis"
            >
              <BrandWordmarkInner variant="sidebar" />
            </motion.button>

            <div className="sidebar-brand-actions">
              <button
                type="button"
                className="sidebar-icon-btn"
                onClick={onNewChat}
                title="New analysis"
                aria-label="New analysis"
              >
                <SquarePen size={14} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="sidebar-icon-btn"
                onClick={toggleTheme}
                title={resolvedTheme === 'light' ? 'Switch to dark' : resolvedTheme === 'dark' ? 'Switch to stealth' : 'Switch to light'}
                aria-label={resolvedTheme === 'light' ? 'Switch to dark mode' : resolvedTheme === 'dark' ? 'Switch to stealth mode' : 'Switch to light mode'}
              >
                {resolvedTheme === 'light'   ? <Moon size={14} strokeWidth={1.8} /> :
                 resolvedTheme === 'dark'    ? <Circle size={14} strokeWidth={1.8} /> :
                                              <Sun size={14} strokeWidth={1.8} />}
              </button>
              <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={onClose}
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose size={14} strokeWidth={1.8} />
              </button>
              {/* Mobile close */}
              <button type="button" className="threads-close" onClick={onClose} aria-label="Close sidebar">
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Threads sub-header */}
          <div className="threads-subheader">
            <div className="threads-header-left">
              <Clock size={11} strokeWidth={2.5} />
              <span className="threads-title">Briefings</span>
              {reports.length > 0 && (
                <span className="threads-count">{reports.length}</span>
              )}
            </div>
          </div>

          {/* Thread list */}
          <div className="threads-list" aria-label="Recent analyses">
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
              <div role="list">
                {reports.map((r, i) => {
                  const score  = r.result_json ? Number(r.result_json.saturation_score) : null;
                  const active = r.report_id === activeId;
                  const done   = r.status === 'complete';

                  return (
                    <motion.button
                      key={r.report_id}
                      type="button"
                      role="listitem"
                      className={`thread-item${active ? ' thread-item--active' : ''}${!done ? ' thread-item--pending' : ''}`}
                      onClick={() => { if (done) onSelect(r.report_id); }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.38, ease: 'easeOut' as const }}
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
                })}
              </div>
            )}
          </div>

          {/* Profile footer */}
          <div className="sidebar-profile-group" ref={profileGroupRef}>
            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  className="profile-menu"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.36, ease: 'easeOut' as const }}
                >
                  {PROFILE_MENU_ITEMS.map((item) => {
                    const Icon = item.Icon;
                    return (
                      <Fragment key={item.id}>
                        {item.danger && <div className="profile-menu-sep" />}
                        <button
                          type="button"
                          className={`profile-menu-item${item.danger ? ' profile-menu-item--danger' : ''}`}
                          onClick={() => {
                            setProfileOpen(false);
                            if (item.id === 'logout') auth.logout();
                          }}
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
              onClick={() => {
                if (auth.isAuthenticated) {
                  setProfileOpen(o => !o);
                } else {
                  auth.login();
                }
              }}
              aria-label={auth.isAuthenticated ? 'Open profile menu' : 'Sign in'}
              aria-expanded={profileOpen}
            >
              <div className="sidebar-profile-avatar">{avatarLabel}</div>
              <div className="sidebar-profile-info">
                <span className="sidebar-profile-name">
                  {auth.isAuthenticated && auth.user
                    ? auth.user.name || auth.user.email
                    : 'Sign in'}
                </span>
                <span className="sidebar-profile-plan">
                  <Zap size={9} strokeWidth={2.5} />
                  {auth.isAuthenticated && auth.user
                    ? `${auth.user.plan || 'Free'} plan`
                    : 'Get started'}
                </span>
              </div>
              <div className="sidebar-profile-dots">···</div>
            </button>
          </div>

        </div>
      </aside>
    </>
  );
}
