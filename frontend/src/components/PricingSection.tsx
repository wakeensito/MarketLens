import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowLeft } from 'lucide-react';
import NumberFlow from '@number-flow/react';
import { BrandWordmarkInner } from './BrandWordmark';
import { LANDING_ENTRY_Y, landingFadeUpTransition } from '../motion';

interface Plan {
  id: string;
  name: string;
  tagline: string;
  price: number;
  yearlyPrice: number;
  cta: string;
  ctaStyle: 'primary' | 'ghost';
  highlight: boolean;
  badge?: string;
  includesLabel: string;
  features: string[];
  limit: string;
}

const PLANS: Plan[] = [
  {
    id: 'scout',
    name: 'Scout',
    tagline: 'Explore the landscape',
    price: 0,
    yearlyPrice: 0,
    cta: 'Start free',
    ctaStyle: 'ghost',
    highlight: false,
    includesLabel: 'Free includes:',
    features: [
      '1 analysis per session',
      'Competitive landscape mapping',
      'Saturation score (0–100)',
      '3-phase entry roadmap',
      'Key market statistics',
      'PDF export',
    ],
    limit: 'No account required',
  },
  {
    id: 'analyst',
    name: 'Analyst',
    tagline: 'For serious operators',
    price: 29,
    yearlyPrice: 279,
    cta: 'Get started',
    ctaStyle: 'primary',
    highlight: true,
    badge: 'Most popular',
    includesLabel: 'Everything in Scout, plus:',
    features: [
      '5 analyses per day',
      'Real-time Brave Search data',
      'Full competitor deep-dive',
      'Gap opportunity scoring',
      'Trend signal alerts',
      'CSV export + full history',
    ],
    limit: 'Cancel anytime',
  },
  {
    id: 'intelligence',
    name: 'Intelligence',
    tagline: 'For enterprise teams',
    price: 99,
    yearlyPrice: 899,
    cta: 'Contact sales',
    ctaStyle: 'ghost',
    highlight: false,
    badge: 'Enterprise',
    includesLabel: 'Everything in Analyst, plus:',
    features: [
      'Unlimited analyses',
      'Team workspace & sharing',
      'API access',
      'Custom data source integrations',
      'SSO / SAML',
      'Dedicated support + SLA',
      'White-label report exports',
    ],
    limit: 'Custom pricing available',
  },
];

interface Props {
  onBack: () => void;
  onSignIn: () => void;
}

export default function PricingSection({ onBack, onSignIn }: Props) {
  const [annual, setAnnual] = useState(false);

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

        {/* Header */}
        <header className="pricing-header">
          <motion.h1
            className="pricing-headline"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.4, ease: 'easeOut' as const }}
          >
            Plans for every stage
          </motion.h1>
          <motion.p
            className="pricing-subhead"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.38, ease: 'easeOut' as const }}
          >
            From first idea to enterprise intelligence. Start free, scale when you're ready.
          </motion.p>

          {/* Billing toggle */}
          <motion.div
            className="pricing-toggle-row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.35 }}
          >
            <div className="pricing-toggle">
              <button
                className={`pricing-toggle-opt${!annual ? ' pricing-toggle-opt--active' : ''}`}
                onClick={() => setAnnual(false)}
              >
                {!annual && (
                  <motion.span
                    layoutId="pricing-toggle-pill"
                    className="pricing-toggle-pill"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="pricing-toggle-label">Monthly</span>
              </button>
              <button
                className={`pricing-toggle-opt${annual ? ' pricing-toggle-opt--active' : ''}`}
                onClick={() => setAnnual(true)}
              >
                {annual && (
                  <motion.span
                    layoutId="pricing-toggle-pill"
                    className="pricing-toggle-pill"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="pricing-toggle-label">
                  Annual
                  <span className="pricing-save-badge">Save 20%</span>
                </span>
              </button>
            </div>
          </motion.div>
        </header>

        {/* Cards grid */}
        <div className="pricing-grid" id="pricing-plans">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              className={`pricing-card${plan.highlight ? ' pricing-card--highlight' : ''}`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.07, duration: 0.38, ease: 'easeOut' as const }}
            >
              {plan.badge && (
                <div className={`pricing-card-badge${plan.highlight ? ' pricing-card-badge--accent' : ''}`}>
                  {plan.badge}
                </div>
              )}

              {/* Card header */}
              <div className="pricing-card-header">
                <div className="pricing-plan-name">{plan.name}</div>
                <div className="pricing-plan-tagline">{plan.tagline}</div>

                <div className="pricing-price-row">
                  {plan.price === 0 ? (
                    <span className="pricing-price-free">Free</span>
                  ) : (
                    <>
                      <span className="pricing-price-currency">$</span>
                      <span className="pricing-price-num">
                        <NumberFlow
                          value={annual ? plan.yearlyPrice / 12 : plan.price}
                        />
                      </span>
                      <span className="pricing-price-period">/mo</span>
                    </>
                  )}
                </div>

                <div className="pricing-billing-note">
                  {plan.price > 0 && annual
                    ? `Billed $${plan.yearlyPrice}/year`
                    : plan.price > 0
                    ? 'Billed monthly'
                    : ' '}
                </div>
              </div>

              {/* CTA */}
              <div className="pricing-card-cta">
                <button
                  className={`pricing-cta-btn${plan.highlight ? ' pricing-cta-btn--primary' : ' pricing-cta-btn--ghost'}`}
                  onClick={plan.price === 0 ? onBack : onSignIn}
                >
                  {plan.cta}
                </button>
                <span className="pricing-limit-note">{plan.limit}</span>
              </div>

              {/* Feature list */}
              <div className="pricing-features">
                <div className="pricing-includes-label">{plan.includesLabel}</div>
                <ul className="pricing-feature-list">
                  {plan.features.map(feat => (
                    <li key={feat} className="pricing-feature-item">
                      <span className="pricing-check-icon">
                        <Check size={10} strokeWidth={3} />
                      </span>
                      {feat}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        <footer className="pricing-footer">
          <p className="pricing-footer-text">
            All plans include our AI pipeline: AWS Bedrock · Brave Search · Claude AI · DynamoDB
          </p>
          <p className="pricing-footer-sub">
            Questions?{' '}
            <a href="mailto:hello@marketlens.ai" className="pricing-footer-link">
              Contact us
            </a>
          </p>
        </footer>
      </motion.div>
    </AnimatePresence>
  );
}
