import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import { BrandWordmarkInner } from './BrandWordmark';
import { LANDING_ENTRY_Y, landingFadeUpTransition } from '../motion';
import type { BillingPlan } from '../api';

type PlanId = 'free' | 'pro' | 'team';
type Cadence = 'monthly' | 'annual';

interface PlanRow {
  id: PlanId;
  name: string;
  tagline: string;
  monthly: number;
  annual: number;
  /** Annual savings (monthly equivalent), shown as a quiet inline note. */
  annualMonthlyEquivalent: number;
  /** What this plan offers, written as descriptions, not feature lists. */
  attributes: { label: string; free: string; pro: string; team: string }[];
}

const PLAN_DATA: PlanRow[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'A taste of the brief.',
    monthly: 0,
    annual: 0,
    annualMonthlyEquivalent: 0,
    attributes: [],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For solo founders running idea triage.',
    monthly: 20,
    annual: 192,
    annualMonthlyEquivalent: 16,
    attributes: [],
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'For small teams sharing intelligence.',
    monthly: 100,
    annual: 960,
    annualMonthlyEquivalent: 80,
    attributes: [],
  },
];

const COMPARISON_ROWS: { label: string; free: string; pro: string; team: string }[] = [
  { label: 'Reports per day', free: '3', pro: '15', team: '50 per seat' },
  { label: 'History',         free: '7 days', pro: 'Unlimited', team: 'Unlimited' },
  { label: 'Exports',         free: 'Markdown', pro: 'CSV, PDF, Markdown', team: 'CSV, PDF, Markdown' },
  { label: 'Chat',            free: 'Not included', pro: 'Included', team: 'Unlimited' },
  { label: 'Model selection', free: 'Default', pro: 'All models', team: 'All models' },
  { label: 'Live web search', free: 'Not included', pro: 'Not included', team: 'Included' },
  { label: 'Sharing',         free: 'Not included', pro: 'Included', team: 'Included' },
  { label: 'Seats',           free: '1', pro: '1', team: '5 included' },
];

interface Props {
  onBack: () => void;
  /** Called when a plan CTA is clicked. Routes to Stripe Checkout. */
  onCheckout: (plan: BillingPlan) => void;
  /** Called when an authenticated user wants to manage an existing subscription. */
  onManage: () => void;
  /** Called when an anonymous user picks a paid plan — prompts sign-in first. */
  onRequestSignIn: (intentPlan: BillingPlan) => void;
  /** Current user's plan: 'free' for unauthenticated. */
  currentPlan: string;
  /** Whether the viewer is signed in. */
  isAuthenticated: boolean;
}

export default function PricingSection({
  onBack,
  onCheckout,
  onManage,
  onRequestSignIn,
  currentPlan,
  isAuthenticated,
}: Props) {
  const [cadence, setCadence] = useState<Cadence>('monthly');

  const planFor = (id: PlanId, c: Cadence): BillingPlan | null => {
    if (id === 'free') return null;
    if (id === 'pro')  return c === 'annual' ? 'pro_annual'  : 'pro';
    if (id === 'team') return c === 'annual' ? 'team_annual' : 'team';
    return null;
  };

  const handleCta = (id: PlanId) => {
    const billingPlan = planFor(id, cadence);

    if (id === 'free') {
      onBack();
      return;
    }

    // Already subscribed → portal.
    const userIsOnThisPlan =
      (id === 'pro'  && (currentPlan === 'pro'  || currentPlan === 'pro_annual')) ||
      (id === 'team' && (currentPlan === 'team' || currentPlan === 'team_annual'));
    if (isAuthenticated && userIsOnThisPlan) {
      onManage();
      return;
    }

    // Anonymous user picking a paid plan → sign-in first.
    if (!isAuthenticated && billingPlan) {
      onRequestSignIn(billingPlan);
      return;
    }

    if (billingPlan) onCheckout(billingPlan);
  };

  const ctaLabel = (id: PlanId): string => {
    if (id === 'free') return isAuthenticated ? 'Back to workspace' : 'Continue free';
    const userIsOnThisPlan =
      (id === 'pro'  && (currentPlan === 'pro'  || currentPlan === 'pro_annual')) ||
      (id === 'team' && (currentPlan === 'team' || currentPlan === 'team_annual'));
    if (userIsOnThisPlan) return 'Manage subscription';
    if (id === 'pro')  return 'Start Pro';
    if (id === 'team') return 'Start Team';
    return '';
  };

  const isCurrentPlan = (id: PlanId): boolean => {
    if (id === 'free' && (currentPlan === 'free' || !isAuthenticated)) return true;
    if (id === 'pro'  && (currentPlan === 'pro'  || currentPlan === 'pro_annual')) return true;
    if (id === 'team' && (currentPlan === 'team' || currentPlan === 'team_annual')) return true;
    return false;
  };

  const proPriceShown = cadence === 'annual'
    ? PLAN_DATA[1].annualMonthlyEquivalent
    : PLAN_DATA[1].monthly;
  const teamPriceShown = cadence === 'annual'
    ? PLAN_DATA[2].annualMonthlyEquivalent
    : PLAN_DATA[2].monthly;

  return (
    <AnimatePresence>
      <motion.div
        className="pricing-wrap"
        initial={{ opacity: 0, y: LANDING_ENTRY_Y }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: LANDING_ENTRY_Y }}
        transition={landingFadeUpTransition}
      >
        {/* Nav */}
        <nav className="pricing-nav">
          <button className="pricing-back-btn" onClick={onBack}>
            <ArrowLeft size={14} strokeWidth={2} />
            Back
          </button>
          <span className="pricing-nav-brand">
            <BrandWordmarkInner variant="pricing-nav" />
          </span>
        </nav>

        {/* Lede + recommendation paragraph */}
        <header className="pricing-editorial-header">
          <motion.div
            className="pricing-eyebrow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.04, duration: 0.32, ease: 'easeOut' as const }}
          >
            Plans
          </motion.div>

          <motion.h1
            className="pricing-lede"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.42, ease: 'easeOut' as const }}
          >
            When the free cap stops being enough.
          </motion.h1>

          <motion.p
            className="pricing-recommendation"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.42, ease: 'easeOut' as const }}
          >
            For one founder triaging ideas, <strong className="pricing-rec-strong">Pro at $20 a month</strong> is the
            answer. It lifts the daily cap to fifteen reports, opens chat, unlocks every export
            format, and keeps history forever. Annual billing brings it to{' '}
            <span className="pricing-rec-annual">$16 a month</span>, billed yearly. Team is for
            shops bringing more than one operator into the workspace.
          </motion.p>
        </header>

        {/* Global cadence toggle — one source of truth for all paid columns */}
        <motion.div
          className="pricing-global-toggle"
          role="radiogroup"
          aria-label="Billing cadence"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.4, ease: 'easeOut' as const }}
        >
          {(['monthly','annual'] as Cadence[]).map(c => {
            const active = cadence === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                className={`pricing-cadence-opt${active ? ' is-active' : ''}`}
                onClick={() => setCadence(c)}
                onKeyDown={e => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    setCadence(prev => (prev === 'monthly' ? 'annual' : 'monthly'));
                  }
                }}
              >
                {active && (
                  <motion.span
                    layoutId="pricing-cadence-pill"
                    className="pricing-cadence-pill"
                    transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                  />
                )}
                <span className="pricing-cadence-label">
                  {c === 'monthly' ? 'Monthly' : 'Annual'}
                  {c === 'annual' && <span className="pricing-cadence-save">save 20%</span>}
                </span>
              </button>
            );
          })}
        </motion.div>

        {/* Comparison table */}
        <motion.div
          className="pricing-table"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.24, duration: 0.4 }}
          role="table"
          aria-label="Plan comparison"
        >
          {/* Column headers */}
          <div className="pricing-table-head" role="row">
            <div className="pricing-col-meta" aria-hidden />

            {(['free','pro','team'] as PlanId[]).map(id => {
              const plan = PLAN_DATA.find(p => p.id === id)!;
              const priceShown = id === 'free' ? 0 :
                                  id === 'pro'  ? proPriceShown :
                                  teamPriceShown;
              const isPaid = plan.monthly > 0;
              const current = isCurrentPlan(id);
              return (
                <div
                  key={id}
                  className={`pricing-col-head${current ? ' is-current' : ''}${id === 'pro' && !current ? ' is-emphasis' : ''}`}
                  role="columnheader"
                >
                  <div className="pricing-col-name-row">
                    <span className="pricing-col-name">{plan.name}</span>
                    {current && (
                      <span className="pricing-col-current">Current plan</span>
                    )}
                    {id === 'pro' && !current && (
                      <span className="pricing-col-recommended">Recommended</span>
                    )}
                  </div>

                  <div className="pricing-col-tagline">{plan.tagline}</div>

                  <div className="pricing-col-price-row">
                    <span className="pricing-col-price-currency">$</span>
                    <span className="pricing-col-price-num">
                      {isPaid ? <NumberFlow value={priceShown} /> : 0}
                    </span>
                    <span className="pricing-col-price-period">/mo</span>
                  </div>

                  <div className="pricing-col-billing-note">
                    {!isPaid
                      ? 'No card required, ever'
                      : cadence === 'annual'
                      ? `$${plan.annual} a year`
                      : `Billed monthly`}
                  </div>

                  <button
                    type="button"
                    className={`pricing-col-cta${id === 'pro' && !current ? ' pricing-col-cta--primary' : ' pricing-col-cta--ghost'}${current ? ' is-current' : ''}`}
                    onClick={() => handleCta(id)}
                  >
                    {ctaLabel(id)}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Body rows */}
          <div className="pricing-table-body" role="rowgroup">
            {COMPARISON_ROWS.map(row => (
              <div key={row.label} className="pricing-table-row" role="row">
                <div className="pricing-col-meta" role="rowheader">
                  {row.label}
                </div>
                <div className="pricing-cell" role="cell">{row.free}</div>
                <div className="pricing-cell pricing-cell--emphasis" role="cell">{row.pro}</div>
                <div className="pricing-cell" role="cell">{row.team}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <footer className="pricing-footer">
          <p className="pricing-footer-text">
            All plans run the same pipeline · AWS Bedrock · Brave Search · Anthropic
          </p>
          <p className="pricing-footer-sub">
            Questions?{' '}
            <a href="mailto:hello@plinths.ai" className="pricing-footer-link">
              hello@plinths.ai
            </a>
          </p>
        </footer>
      </motion.div>
    </AnimatePresence>
  );
}
