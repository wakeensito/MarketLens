import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, SlidersHorizontal, Sparkles, User, CreditCard, ShieldCheck, HelpCircle, Zap,
  ArrowUpRight, Mail,
} from 'lucide-react';
import { useAuthContext } from '../hooks/useAuth';
import { ThemePicker } from './ThemePicker';
import { SoonPill } from './SoonPill';
import { getPersonalization, setPersonalization, type Personalization } from '../personalization';
import { CONTACT_EMAIL } from '../pages/legalConstants';

export type SettingsSection = 'general' | 'personalization' | 'account' | 'billing' | 'privacy' | 'help';

interface Props {
  isOpen:               boolean;
  onClose:              () => void;
  initialSection?:      SettingsSection;
  /** Free-plan user clicks "Upgrade" inside the Billing tab. */
  onUpgrade:            () => void;
  /** Paid-plan user clicks "Manage subscription" inside the Billing tab. */
  onManageSubscription: () => void;
  /** Fires after a personalization field is saved, so the parent can refresh
   *  any live consumers (e.g. the workspace greeting). */
  onPersonalizationSaved?: (next: Personalization) => void;
}

const NAV: { id: SettingsSection; label: string; Icon: typeof User }[] = [
  { id: 'general',         label: 'General',         Icon: SlidersHorizontal },
  { id: 'personalization', label: 'Personalization', Icon: Sparkles },
  { id: 'account',         label: 'Account',         Icon: User },
  { id: 'billing',         label: 'Billing',         Icon: CreditCard },
  { id: 'privacy',         label: 'Privacy',         Icon: ShieldCheck },
  { id: 'help',            label: 'Help',            Icon: HelpCircle },
];

/** Daily report limits per plan — mirrors api/app.py `plan_limits`. */
const DAILY_REPORTS: Record<string, string> = {
  free: '3 / day',
  pro:  '15 / day',
  max:  'Unlimited',
  admin: 'Unlimited',
};

const PLAN_PRICE: Record<string, string> = {
  free: '$0',
  pro:  '$20 / mo',
  max:  '$100 / mo',
  admin: '—',
};

export default function SettingsModal({
  isOpen, onClose, initialSection = 'general', onUpgrade, onManageSubscription,
  onPersonalizationSaved,
}: Props) {
  const auth = useAuthContext();
  const userId = auth.user?.user_id;
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [fields, setFields] = useState<Personalization>(() => getPersonalization(userId));
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Re-read persisted personalization whenever the modal opens, so external
  // edits (or a fresh session) are reflected. Adjusting state during render
  // keyed on the open transition — no effect, no cascading render.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setFields(getPersonalization(userId));
  }

  // Persist on every change (not on blur), so closing via Escape — which never
  // fires a blur — can't drop an in-flight edit. localStorage writes are cheap
  // for four short fields.
  const updateField = (key: keyof Personalization, value: string) => {
    setFields(f => ({ ...f, [key]: value }));
    const next = setPersonalization({ [key]: value }, userId);
    onPersonalizationSaved?.(next);
  };

  // Sync to the requested section when the parent changes it (e.g. opening via
  // "Profile" lands on Account). Adjusting state during render — no effect, so
  // no cascading re-render. The parent's fallback flips to 'general' on close,
  // so every open with a non-general target re-syncs cleanly.
  const [prevInitial, setPrevInitial] = useState(initialSection);
  if (initialSection !== prevInitial) {
    setPrevInitial(initialSection);
    setSection(initialSection);
  }

  // Focus the close button on open, restore focus on close.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, [isOpen]);

  // Escape closes.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const user = auth.user;
  const planRaw = (user?.plan ?? 'free').trim().toLowerCase() || 'free';
  const isPaid = planRaw !== '' && planRaw !== 'free';
  const planLabel = planRaw.charAt(0).toUpperCase() + planRaw.slice(1);
  const avatarLabel = (user?.name || user?.email || '?').slice(0, 2).toUpperCase();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' as const }}
          onClick={onClose}
        >
          <motion.div
            className="settings-card"
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.26, ease: 'easeOut' as const }}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={e => e.stopPropagation()}
          >
            {/* ── Left nav ── */}
            <nav className="settings-nav" aria-label="Settings sections">
              <div className="settings-nav-head">Settings</div>
              <div className="settings-nav-list" role="tablist" aria-orientation="vertical">
                {NAV.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={section === id}
                    className={`settings-nav-item${section === id ? ' settings-nav-item--active' : ''}`}
                    onClick={() => setSection(id)}
                  >
                    <Icon size={14} strokeWidth={1.8} />
                    {label}
                  </button>
                ))}
              </div>
            </nav>

            {/* ── Right detail ── */}
            <div className="settings-detail" role="tabpanel">
              <button
                ref={closeBtnRef}
                type="button"
                className="settings-close"
                onClick={onClose}
                aria-label="Close settings"
              >
                <X size={15} strokeWidth={2.25} />
              </button>

              <div className="settings-detail-scroll">
                {section === 'general' && (
                  <Group title="General">
                    <Row
                      label="Appearance"
                      hint="Light parchment, Stealth near-black, or match your system."
                    >
                      <ThemePicker />
                    </Row>
                  </Group>
                )}

                {section === 'personalization' && (
                  <Group title="Personalization">
                    <p className="settings-intro">
                      Cosmetic touches apply now; report and Muse tuning roll out as those land.
                    </p>
                    <Field
                      label="Preferred name"
                      hint="What we call you in the workspace."
                      value={fields.preferredName}
                      placeholder="e.g. Sito"
                      onChange={v => updateField('preferredName', v)}
                      maxLength={40}
                    />
                    <Field
                      label="What you're building"
                      hint="Frames how your reports read."
                      value={fields.building}
                      placeholder="e.g. Solo founder, B2B SaaS"
                      onChange={v => updateField('building', v)}
                      maxLength={120}
                    />
                    <Field
                      label="Market focus"
                      hint="The space you most often research."
                      value={fields.marketFocus}
                      placeholder="e.g. US fintech, climate hardware"
                      onChange={v => updateField('marketFocus', v)}
                      maxLength={120}
                    />
                    <Field
                      label="Instructions for Muse"
                      hint="Saved now — Muse will use it soon."
                      soon
                      multiline
                      value={fields.museInstructions}
                      placeholder="e.g. Be concise. Lead with the verdict, then the reasoning."
                      onChange={v => updateField('museInstructions', v)}
                      maxLength={600}
                    />
                  </Group>
                )}

                {section === 'account' && (
                  <Group title="Account">
                    <Row label="Avatar" hint="Generated from your name.">
                      <div className="settings-avatar" aria-hidden>{avatarLabel}</div>
                    </Row>
                    <Row label="Name">
                      <span className="settings-value">{user?.name || '—'}</span>
                    </Row>
                    <Row label="Email">
                      <span className="settings-value settings-value--mono">{user?.email || '—'}</span>
                    </Row>
                    <Row label="Plan">
                      <span className={`settings-plan-badge${isPaid ? ' settings-plan-badge--paid' : ''}`}>
                        <Zap size={10} strokeWidth={2.5} />
                        {planLabel}
                      </span>
                    </Row>
                  </Group>
                )}

                {section === 'billing' && (
                  <Group title="Billing">
                    <Row label="Current plan">
                      <span className={`settings-plan-badge${isPaid ? ' settings-plan-badge--paid' : ''}`}>
                        <Zap size={10} strokeWidth={2.5} />
                        {planLabel}
                      </span>
                    </Row>
                    <Row label="Price">
                      <span className="settings-value settings-value--mono">{PLAN_PRICE[planRaw] ?? '—'}</span>
                    </Row>
                    <Row label="Daily reports" hint="Resets at 00:00 UTC.">
                      <span className="settings-value settings-value--mono">{DAILY_REPORTS[planRaw] ?? '—'}</span>
                    </Row>
                    <Row label={isPaid ? 'Subscription' : 'Unlock more'}>
                      <button
                        type="button"
                        className={`settings-action-btn${isPaid ? '' : ' settings-action-btn--primary'}`}
                        onClick={() => {
                          onClose();
                          if (isPaid) onManageSubscription();
                          else onUpgrade();
                        }}
                      >
                        {isPaid ? 'Manage subscription' : <><Zap size={12} strokeWidth={2.5} />Upgrade plan</>}
                      </button>
                    </Row>
                  </Group>
                )}

                {section === 'privacy' && (
                  <Group title="Privacy">
                    <Row
                      label="Your data"
                      hint="Reports are private to your account and never used to train models."
                    >
                      <span className="settings-value settings-value--muted">Private</span>
                    </Row>
                    <Row label="Privacy policy">
                      <a className="settings-action-btn" href="/privacy" target="_blank" rel="noreferrer">
                        Read policy
                        <ArrowUpRight size={13} strokeWidth={2} />
                      </a>
                    </Row>
                    <Row label="Delete account" hint="Permanently removes your account and reports.">
                      <span className="settings-soon-slot">
                        <SoonPill />
                      </span>
                    </Row>
                  </Group>
                )}

                {section === 'help' && (
                  <Group title="Help & Support">
                    <Row label="Contact" hint="Questions, bugs, or feedback.">
                      <a
                        className="settings-action-btn"
                        href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Plinths support')}`}
                      >
                        <Mail size={13} strokeWidth={2} />
                        Email us
                      </a>
                    </Row>
                    <Row label="Terms of service">
                      <a className="settings-action-btn" href="/terms" target="_blank" rel="noreferrer">
                        Read
                        <ArrowUpRight size={13} strokeWidth={2} />
                      </a>
                    </Row>
                    <Row label="Version">
                      <span className="settings-value settings-value--mono">Plinths · Beta</span>
                    </Row>
                  </Group>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-group">
      <h2 className="settings-group-title">{title}</h2>
      <div className="settings-rows">{children}</div>
    </section>
  );
}

interface FieldProps {
  label:        string;
  hint?:        string;
  value:        string;
  placeholder?: string;
  onChange:     (value: string) => void;
  maxLength?:   number;
  multiline?:   boolean;
  /** Captured-but-not-yet-consumed — shows a "Soon" tag next to the label. */
  soon?:        boolean;
}

function Field({ label, hint, value, placeholder, onChange, maxLength, multiline, soon }: FieldProps) {
  return (
    <div className="settings-field">
      <div className="settings-field-text">
        <div className="settings-field-head">
          <span className="settings-field-label">{label}</span>
          {soon && <SoonPill inline />}
        </div>
        {hint && <span className="settings-field-hint">{hint}</span>}
      </div>
      {multiline ? (
        <textarea
          className="settings-textarea"
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <input
          type="text"
          className="settings-input"
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {hint && <span className="settings-row-hint">{hint}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}
