import { Fragment, useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, PanelLeftClose, Zap, Palette, User, Settings2, HelpCircle, LogOut,
  SquarePen, Sun, Moon, MoreHorizontal, Trash2, Pencil, Archive, Search,
} from 'lucide-react';
import type { ApiReport } from '../api';
import { listReports, deleteReport } from '../api';
import { useAuthContext } from '../hooks/useAuth';
import { BrandWordmarkInner, PlinthsMark } from './BrandWordmark';
import { MOCK_HISTORY } from '../mockData';
import { getThemePref, getResolved, setThemePref, type ThemePreference } from '../theme';
import { SoonPill } from './SoonPill';

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

type GroupKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'older';

const GROUP_LABELS: Record<GroupKey, string> = {
  today:     'Today',
  yesterday: 'Yesterday',
  last7:     'Last 7 days',
  last30:    'Last 30 days',
  older:     'Older',
};

const GROUP_ORDER: GroupKey[] = ['today', 'yesterday', 'last7', 'last30', 'older'];

function bucketReport(iso: string): GroupKey {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = diffMs / 86_400_000;
  if (days < 1)  return 'today';
  if (days < 2)  return 'yesterday';
  if (days < 7)  return 'last7';
  if (days < 30) return 'last30';
  return 'older';
}

function groupReports(reports: ApiReport[]): { key: GroupKey; items: ApiReport[] }[] {
  const buckets = new Map<GroupKey, ApiReport[]>();
  for (const r of reports) {
    const key = bucketReport(r.created_at);
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }
  return GROUP_ORDER
    .filter(k => (buckets.get(k)?.length ?? 0) > 0)
    .map(key => ({ key, items: buckets.get(key)! }));
}

interface Props {
  isOpen:         boolean;
  onClose:        () => void;
  onOpen:         () => void;
  onNewChat:      () => void;
  activeId:       string | null;
  onSelect:       (reportId: string) => void;
  /** Fires when the user clicks "Upgrade Plan" in the profile menu. */
  onUpgradeClick: () => void;
}

const PROFILE_MENU_ITEMS = [
  { id: 'upgrade',         label: 'Upgrade Plan',    Icon: Zap,        danger: false, soon: false },
  { id: 'personalization', label: 'Personalization', Icon: Palette,    danger: false, soon: true  },
  { id: 'profile',         label: 'Profile',         Icon: User,       danger: false, soon: true  },
  { id: 'settings',        label: 'Settings',        Icon: Settings2,  danger: false, soon: true  },
  { id: 'help',            label: 'Help & Support',  Icon: HelpCircle, danger: false, soon: true  },
  { id: 'logout',          label: 'Log Out',         Icon: LogOut,     danger: true,  soon: false },
];

interface ThreadItemProps {
  report:           ApiReport;
  index:            number;
  active:           boolean;
  menuOpen:         boolean;
  confirming:       boolean;
  deleting:         boolean;
  onSelect:         () => void;
  onOpenMenu:       () => void;
  onCloseMenu:      () => void;
  onConfirmDelete:  () => void;
  onCancelConfirm:  () => void;
  onDelete:         () => void;
}

function ThreadItem({
  report, index, active, menuOpen, confirming, deleting,
  onSelect, onOpenMenu, onCloseMenu, onConfirmDelete, onCancelConfirm, onDelete,
}: ThreadItemProps) {
  const score = report.result_json ? Number(report.result_json.saturation_score) : null;
  const done  = report.status === 'complete';

  if (confirming) {
    return (
      <motion.div
        className="thread-confirm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
      >
        <p className="thread-confirm-text">Delete this report?</p>
        <div className="thread-confirm-actions">
          <button type="button" className="thread-confirm-btn" onClick={onCancelConfirm}>Cancel</button>
          <button
            type="button"
            className="thread-confirm-btn thread-confirm-btn--danger"
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`thread-row${menuOpen ? ' thread-row--menu-open' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.32, ease: 'easeOut' as const }}
    >
      <button
        type="button"
        className={`thread-item${active ? ' thread-item--active' : ''}${!done ? ' thread-item--pending' : ''}`}
        onClick={() => { if (done) onSelect(); }}
      >
        <div className="thread-item-meta">
          <span className="thread-item-date">{relativeDate(report.created_at)}</span>
          {report.status === 'running' && <span className="thread-status-dot thread-status-dot--running" />}
          {report.status === 'failed'  && <span className="thread-status-dot thread-status-dot--failed"  />}
        </div>
        <p className="thread-item-query">{report.idea_text}</p>
        {score !== null && (
          <div className="thread-item-score" style={{ color: scoreColor(score) }}>
            <span className="thread-score-num">{score}</span>
            <span className="thread-score-label">saturation</span>
          </div>
        )}
      </button>

      <button
        type="button"
        className="thread-menu-trigger"
        onClick={(e) => { e.stopPropagation(); if (menuOpen) onCloseMenu(); else onOpenMenu(); }}
        aria-label="Report actions"
        aria-expanded={menuOpen}
      >
        <MoreHorizontal size={14} strokeWidth={2} />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="thread-menu"
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' as const }}
          >
            <button
              type="button"
              className="thread-menu-item"
              onClick={() => { onCloseMenu(); if (done) onSelect(); }}
              disabled={!done}
            >
              <SquarePen size={12} strokeWidth={2} />
              Open
            </button>
            <button type="button" className="thread-menu-item is-soon" onClick={onCloseMenu}>
              <Pencil size={12} strokeWidth={2} />
              Rename
              <SoonPill inline />
            </button>
            <button type="button" className="thread-menu-item is-soon" onClick={onCloseMenu}>
              <Archive size={12} strokeWidth={2} />
              Archive
              <SoonPill inline />
            </button>
            <div className="thread-menu-sep" />
            <button
              type="button"
              className="thread-menu-item thread-menu-item--danger"
              onClick={() => { onCloseMenu(); onConfirmDelete(); }}
            >
              <Trash2 size={12} strokeWidth={2} />
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function RecentThreads({ isOpen, onClose, onOpen, onNewChat, activeId, onSelect, onUpgradeClick }: Props) {
  const auth = useAuthContext();
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const profileGroupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [themePref, setLocalPref] = useState<ThemePreference>(getThemePref);
  const resolvedTheme = getResolved(themePref);

  const toggleTheme = () => {
    const next: ThemePreference = resolvedTheme === 'light' ? 'stealth' : 'light';
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

  // Close thread action menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    function onOutsideClick(e: MouseEvent) {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [menuOpenId]);

  // Close menus on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (menuOpenId) setMenuOpenId(null);
      if (confirmingId) setConfirmingId(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpenId, confirmingId]);

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

  const handleDelete = useCallback(async (reportId: string) => {
    setDeletingId(reportId);
    setDeleteError(null);
    // Optimistic removal
    const previous = reports;
    setReports(prev => prev.filter(r => r.report_id !== reportId));
    setConfirmingId(null);
    try {
      if (!USE_MOCK) await deleteReport(reportId);
    } catch {
      // Rollback
      setReports(previous);
      setDeleteError('Couldn\'t delete the report. Try again.');
    } finally {
      setDeletingId(null);
    }
  }, [reports]);

  const avatarLabel = auth.isAuthenticated && auth.user
    ? (auth.user.name || auth.user.email || '?').slice(0, 2).toUpperCase()
    : '?';

  const grouped = groupReports(reports);

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
              aria-label="plinths, new analysis"
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
                title={resolvedTheme === 'light' ? 'Switch to stealth' : 'Switch to light'}
                aria-label={resolvedTheme === 'light' ? 'Switch to stealth mode' : 'Switch to light mode'}
              >
                {resolvedTheme === 'light' ? <Moon size={14} strokeWidth={1.8} /> : <Sun size={14} strokeWidth={1.8} />}
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

          {/* Search (Soon) */}
          <div className="thread-search soon-affordance is-soon" title="Search coming soon">
            <Search size={11} strokeWidth={2} className="thread-search-icon" />
            <input
              type="text"
              className="thread-search-input"
              placeholder="Search reports"
              disabled
              aria-label="Search reports (coming soon)"
            />
            <SoonPill />
          </div>

          {/* Reports sub-header */}
          <div className="threads-subheader">
            <span className="threads-title">Reports</span>
            {reports.length > 0 && (
              <span className="threads-count">{reports.length}</span>
            )}
          </div>

          {/* Delete error toast */}
          <AnimatePresence>
            {deleteError && (
              <motion.div
                className="thread-delete-error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                {deleteError}
                <button
                  type="button"
                  className="thread-delete-error-dismiss"
                  onClick={() => setDeleteError(null)}
                  aria-label="Dismiss"
                >×</button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Thread list */}
          <div className="threads-list" ref={listRef} aria-label="Recent reports">
            {loading ? (
              <div className="threads-loading">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="threads-skeleton" style={{ animationDelay: `${i * 0.09}s` }} />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <div className="threads-empty">
                <p className="threads-empty-text">No reports yet.</p>
                <p className="threads-empty-sub">Your analyses will appear here once complete.</p>
              </div>
            ) : (
              <div role="list">
                {grouped.map(({ key, items }) => (
                  <Fragment key={key}>
                    <div className="thread-group-header">{GROUP_LABELS[key]}</div>
                    {items.map((r, i) => (
                      <ThreadItem
                        key={r.report_id}
                        report={r}
                        index={i}
                        active={r.report_id === activeId}
                        menuOpen={menuOpenId === r.report_id}
                        confirming={confirmingId === r.report_id}
                        deleting={deletingId === r.report_id}
                        onSelect={() => onSelect(r.report_id)}
                        onOpenMenu={() => setMenuOpenId(r.report_id)}
                        onCloseMenu={() => setMenuOpenId(null)}
                        onConfirmDelete={() => setConfirmingId(r.report_id)}
                        onCancelConfirm={() => setConfirmingId(null)}
                        onDelete={() => handleDelete(r.report_id)}
                      />
                    ))}
                  </Fragment>
                ))}
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
                          className={`profile-menu-item${item.danger ? ' profile-menu-item--danger' : ''}${item.soon ? ' is-soon' : ''}${item.id === 'upgrade' ? ' profile-menu-item--upgrade' : ''}`}
                          onClick={() => {
                            setProfileOpen(false);
                            if (item.id === 'logout') auth.logout();
                            else if (item.id === 'upgrade') onUpgradeClick();
                          }}
                        >
                          <Icon size={13} strokeWidth={2} />
                          {item.label}
                          {item.soon && <SoonPill inline />}
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
