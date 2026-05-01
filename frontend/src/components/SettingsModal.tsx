import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Zap, Palette, User, Settings2, HelpCircle, LogOut,
  Check, ExternalLink,
} from 'lucide-react';

type Section = 'upgrade' | 'personalization' | 'profile' | 'settings' | 'help' | 'logout';

interface Props {
  isOpen:  boolean;
  onClose: () => void;
}

const NAV: { id: Section; label: string; Icon: typeof X; danger?: boolean }[] = [
  { id: 'upgrade',         label: 'Upgrade Plan',    Icon: Zap         },
  { id: 'personalization', label: 'Personalization', Icon: Palette     },
  { id: 'profile',         label: 'Profile',         Icon: User        },
  { id: 'settings',        label: 'Settings',        Icon: Settings2   },
  { id: 'help',            label: 'Help & Support',  Icon: HelpCircle  },
  { id: 'logout',          label: 'Log Out',         Icon: LogOut, danger: true },
];

function UpgradeContent() {
  return (
    <div className="settings-content-body">
      <div className="settings-overline">Current Plan</div>
      <h2 className="settings-section-title">MarketLens Free</h2>
      <p className="settings-section-sub">5 analyses / month · Standard report depth · CSV export</p>

      <div className="upgrade-cards">
        <div className="upgrade-card upgrade-card--current">
          <div className="upgrade-card-badge">Current</div>
          <div className="upgrade-card-name">Free</div>
          <div className="upgrade-card-price">$0<span>/mo</span></div>
          <ul className="upgrade-feature-list">
            <li><Check size={11} strokeWidth={2.5} /> 5 analyses per month</li>
            <li><Check size={11} strokeWidth={2.5} /> Standard report depth</li>
            <li><Check size={11} strokeWidth={2.5} /> CSV export</li>
            <li className="upgrade-feature--off">Full competitive data</li>
            <li className="upgrade-feature--off">Priority processing</li>
          </ul>
        </div>

        <div className="upgrade-card upgrade-card--pro">
          <div className="upgrade-card-badge upgrade-card-badge--pro">Pro</div>
          <div className="upgrade-card-name">MarketLens Pro</div>
          <div className="upgrade-card-price">$29<span>/mo</span></div>
          <ul className="upgrade-feature-list">
            <li><Check size={11} strokeWidth={2.5} /> Unlimited analyses</li>
            <li><Check size={11} strokeWidth={2.5} /> Deep competitive intelligence</li>
            <li><Check size={11} strokeWidth={2.5} /> Priority processing</li>
            <li><Check size={11} strokeWidth={2.5} /> Full CSV + PDF export</li>
            <li><Check size={11} strokeWidth={2.5} /> Early access to new features</li>
          </ul>
          <button className="upgrade-cta">Upgrade to Pro</button>
        </div>
      </div>
    </div>
  );
}

function PersonalizationContent() {
  const [compact, setCompact]   = useState(false);
  const [animate, setAnimate]   = useState(true);
  const [autorun, setAutorun]   = useState(false);

  return (
    <div className="settings-content-body">
      <div className="settings-overline">Preferences</div>
      <h2 className="settings-section-title">Personalization</h2>
      <p className="settings-section-sub">Control how MarketLens looks and behaves for you.</p>

      <div className="pref-list">
        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-label">Compact mode</div>
            <div className="pref-desc">Tighter report layout with reduced spacing</div>
          </div>
          <button
            className={`toggle${compact ? ' toggle--on' : ''}`}
            onClick={() => setCompact(v => !v)}
            aria-pressed={compact}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-label">Motion &amp; animations</div>
            <div className="pref-desc">Pipeline stage transitions and entry effects</div>
          </div>
          <button
            className={`toggle${animate ? ' toggle--on' : ''}`}
            onClick={() => setAnimate(v => !v)}
            aria-pressed={animate}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-label">Auto-run example on load</div>
            <div className="pref-desc">Run a demo analysis when the app first opens</div>
          </div>
          <button
            className={`toggle${autorun ? ' toggle--on' : ''}`}
            onClick={() => setAutorun(v => !v)}
            aria-pressed={autorun}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileContent() {
  return (
    <div className="settings-content-body">
      <div className="settings-overline">Account</div>
      <h2 className="settings-section-title">Profile</h2>
      <p className="settings-section-sub">Your identity and account details.</p>

      <div className="profile-avatar-row">
        <div className="profile-avatar-lg">JP</div>
        <div className="profile-avatar-meta">
          <div className="profile-avatar-name">Joaquin Porter</div>
          <div className="profile-avatar-email">wakeenproduction@gmail.com</div>
          <button className="settings-link-btn">Change avatar</button>
        </div>
      </div>

      <div className="settings-fields">
        <div className="settings-field">
          <label className="settings-field-label">Full name</label>
          <input className="settings-input" defaultValue="Joaquin Porter" />
        </div>
        <div className="settings-field">
          <label className="settings-field-label">Email</label>
          <input className="settings-input" defaultValue="wakeenproduction@gmail.com" type="email" />
        </div>
        <div className="settings-field">
          <label className="settings-field-label">Company (optional)</label>
          <input className="settings-input" placeholder="Your company or project" />
        </div>
      </div>

      <button className="settings-save-btn">Save changes</button>
    </div>
  );
}

function SettingsContent() {
  return (
    <div className="settings-content-body">
      <div className="settings-overline">Configuration</div>
      <h2 className="settings-section-title">Settings</h2>
      <p className="settings-section-sub">API and notification preferences.</p>

      <div className="settings-fields">
        <div className="settings-field">
          <label className="settings-field-label">Default analysis model</label>
          <div className="settings-select-display">Claude Sonnet 4.6</div>
        </div>
        <div className="settings-field">
          <label className="settings-field-label">Report language</label>
          <div className="settings-select-display">English (US)</div>
        </div>
        <div className="settings-field">
          <label className="settings-field-label">Geography default</label>
          <input className="settings-input" defaultValue="United States" />
        </div>
      </div>
    </div>
  );
}

function HelpContent() {
  const items = [
    { q: 'How does the saturation score work?',   a: 'The score (0–100) reflects competitive density based on number of players, funding activity, and search trend velocity. Below 40 is open, 40–65 is contested, above 65 is crowded.' },
    { q: 'How accurate is the competitive data?',  a: 'MarketLens pulls from public web signals and funding databases. Results reflect patterns at time of query — always verify with primary research before investing.' },
    { q: 'Can I run the same idea twice?',         a: 'Yes. Multiple analyses on the same idea will reflect different market snapshots. Compare results over time to track competitive drift.' },
    { q: 'How do I export a report?',              a: 'Scroll to the report footer and click "Export CSV". A download link is generated within a few seconds.' },
  ];

  return (
    <div className="settings-content-body">
      <div className="settings-overline">Documentation</div>
      <h2 className="settings-section-title">Help &amp; Support</h2>
      <p className="settings-section-sub">Common questions and resources.</p>

      <div className="faq-list">
        {items.map(item => (
          <div key={item.q} className="faq-item">
            <div className="faq-q">{item.q}</div>
            <div className="faq-a">{item.a}</div>
          </div>
        ))}
      </div>

      <div className="help-links">
        <a className="help-link" href="#" onClick={e => e.preventDefault()}>
          <ExternalLink size={11} strokeWidth={2} />
          View full documentation
        </a>
        <a className="help-link" href="#" onClick={e => e.preventDefault()}>
          <ExternalLink size={11} strokeWidth={2} />
          Contact support
        </a>
      </div>
    </div>
  );
}

function LogOutContent({ onClose }: { onClose: () => void }) {
  return (
    <div className="settings-content-body settings-content-body--center">
      <div className="logout-icon">
        <LogOut size={22} strokeWidth={1.5} />
      </div>
      <h2 className="settings-section-title">Log out?</h2>
      <p className="settings-section-sub">You'll need to sign back in to access your briefings.</p>
      <div className="logout-actions">
        <button className="settings-cancel-btn" onClick={onClose}>Cancel</button>
        <button className="settings-logout-btn">Log out</button>
      </div>
    </div>
  );
}

const CONTENT: Record<Section, (props: { onClose: () => void }) => React.ReactNode> = {
  upgrade:         () => <UpgradeContent />,
  personalization: () => <PersonalizationContent />,
  profile:         () => <ProfileContent />,
  settings:        () => <SettingsContent />,
  help:            () => <HelpContent />,
  logout:          ({ onClose }) => <LogOutContent onClose={onClose} />,
};

export default function SettingsModal({ isOpen, onClose }: Props) {
  const [active, setActive] = useState<Section>('profile');

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          <motion.div
            className="settings-modal"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.2, ease: 'easeOut' as const }}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            {/* Left nav */}
            <nav className="settings-nav">
              <div className="settings-nav-header">
                <span className="settings-nav-title">MarketLens</span>
              </div>

              <div className="settings-nav-items">
                {NAV.map(item => {
                  const Icon = item.Icon;
                  return (
                    <button
                      key={item.id}
                      className={`settings-nav-item${active === item.id ? ' settings-nav-item--active' : ''}${item.danger ? ' settings-nav-item--danger' : ''}`}
                      onClick={() => setActive(item.id)}
                    >
                      <Icon size={14} strokeWidth={2} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Content area */}
            <div className="settings-content">
              <button className="settings-modal-close" onClick={onClose} aria-label="Close settings">
                <X size={14} strokeWidth={2} />
              </button>

              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' as const }}
                >
                  {CONTENT[active]({ onClose })}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
