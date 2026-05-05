import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import { BrandWordmarkInner } from './BrandWordmark';
import { LANDING_ENTRY_Y, landingFadeUpTransition } from '../motion';
import type { BillingPlan } from '../api';

type PlanId = 'free' | 'pro' | 'max';
type Cadence = 'monthly' | 'annual';

interface PlanRow {
  id: PlanId;
  name: string;
  tagline: string;
  monthly: number;
  annual: number;
  /** Annual savings (monthly equivalent), shown as a quiet inline note. */
  annualMonthlyEquivalent: number;
  /** What this plan delivers, written from the user's perspective. */
  features: string[];
}

const PLAN_DATA: PlanRow[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'A taste of the brief.',
    monthly: 0,
    annual: 0,
    annualMonthlyEquivalent: 0,
    features: [
      '3 reports per day',
      '7-day history',
      'Markdown export',
      'Live web search',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For founders running idea triage.',
    monthly: 20,
    annual: 192,
    annualMonthlyEquivalent: 16,
    features: [
      '15 reports per day',
      'Unlimited history',
      'CSV, PDF, Markdown exports',
      'Chat included',
      'Live web search',
    ],
  },
  {
    id: 'max',
    name: 'Max',
    tagline: 'For heavy researchers and indie operators.',
    monthly: 100,
    annual: 960,
    annualMonthlyEquivalent: 80,
    features: [
      'Unlimited reports',
      'Unlimited history',
      'CSV, PDF, Markdown exports',
      'Unlimited chat, with cross-report memory',
      'Choose your chat model: Claude, GPT, Gemini, Perplexity',
      'Live web search',
    ],
  },
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
    if (id === 'pro')  return c === 'annual' ? 'pro_annual' : 'pro';
    if (id === 'max')  return c === 'annual' ? 'max_annual' : 'max';
    return null;
  };

  const isUserOnPlan = (id: PlanId, plan: string): boolean => {
    if (id === 'pro') return plan === 'pro' || plan === 'pro_annual';
    if (id === 'max') return plan === 'max' || plan === 'max_annual';
    return false;
  };

  const isCurrentPlan = (id: PlanId): boolean => {
    if (id === 'free' && (currentPlan === 'free' || !isAuthenticated)) return true;
    return isUserOnPlan(id, currentPlan);
  };

  const handleCta = (id: PlanId) => {
    const billingPlan = planFor(id, cadence);

    if (id === 'free') {
      onBack();
      return;
    }
    if (isAuthenticated && isUserOnPlan(id, currentPlan)) {
      onManage();
      return;
    }
    if (!isAuthenticated && billingPlan) {
      onRequestSignIn(billingPlan);
      return;
    }
    if (billingPlan) onCheckout(billingPlan);
  };

  const ctaLabel = (id: PlanId): string => {
    if (id === 'free') return isAuthenticated ? 'Back to workspace' : 'Continue free';
    if (isUserOnPlan(id, currentPlan)) return 'Manage subscription';
    if (id === 'pro') return 'Start Pro';
    if (id === 'max') return 'Start Max';
    return '';
  };

  const priceFor = (plan: PlanRow): number => {
    if (plan.monthly === 0) return 0;
    return cadence === 'annual' ? plan.annualMonthlyEquivalent : plan.monthly;
  };

  const billingNoteFor = (plan: PlanRow): string => {
    if (plan.monthly === 0) return 'No card required, ever';
    return cadence === 'annual'
      ? `$${plan.annual} a year`
      : 'Billed monthly';
  };

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

        {/* Lede */}
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
            Plans that expand with ambition.
          </motion.h1>
        </header>

        {/* Global cadence toggle — single source of truth for paid columns */}
        <motion.div
          className="pricing-global-toggle"
          role="radiogroup"
          aria-label="Billing cadence"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.4, ease: 'easeOut' as const }}
        >
          {(['monthly', 'annual'] as Cadence[]).map(c => {
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

        {/* Floating cards */}
        <motion.div
          className="pricing-cards"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.24, duration: 0.4 }}
        >
          {PLAN_DATA.map((plan, i) => {
            const current = isCurrentPlan(plan.id);
            const isPaid = plan.id !== 'free';
            const isMax = plan.id === 'max' && !current;
            return (
              <motion.article
                key={plan.id}
                className={`pricing-card${isMax ? ' is-max' : ''}${current ? ' is-current' : ''}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 + i * 0.06, duration: 0.4, ease: 'easeOut' as const }}
              >
                <header className="pricing-card-header">
                  <div className="pricing-card-name-row">
                    <h2 className="pricing-card-name">{plan.name}</h2>
                    {current && (
                      <span className="pricing-card-pill pricing-card-pill--current">Current plan</span>
                    )}
                  </div>
                  <p className="pricing-card-tagline">{plan.tagline}</p>

                  <div className="pricing-card-price-row">
                    {plan.monthly === 0 ? (
                      <span className="pricing-card-price-num">$0</span>
                    ) : (
                      <>
                        <span className="pricing-card-price-currency">$</span>
                        <span className="pricing-card-price-num">
                          <NumberFlow value={priceFor(plan)} />
                        </span>
                        <span className="pricing-card-price-period">/mo</span>
                      </>
                    )}
                  </div>
                  <p className="pricing-card-billing-note">{billingNoteFor(plan)}</p>
                </header>

                <button
                  type="button"
                  className={`pricing-card-cta${isPaid && !current ? ' pricing-card-cta--primary' : ' pricing-card-cta--ghost'}${current ? ' is-current' : ''}`}
                  onClick={() => handleCta(plan.id)}
                >
                  {ctaLabel(plan.id)}
                </button>

                <ul className="pricing-card-features" aria-label={`${plan.name} includes`}>
                  {plan.features.map(feature => (
                    <li key={feature} className="pricing-card-feature">
                      <span className="pricing-card-feature-check" aria-hidden>
                        <Check size={11} strokeWidth={2.5} />
                      </span>
                      <span className="pricing-card-feature-text">{feature}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            );
          })}
        </motion.div>

        {/* Footer */}
        <footer className="pricing-footer">
          <p className="pricing-footer-text">
            All plans run the same intelligence pipeline · AWS Bedrock · Brave Search · Anthropic
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
