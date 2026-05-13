import type { MuseCitation, MuseTurn } from './museTypes';

const COMPETITOR_3: MuseCitation = { kind: 'inline', label: 'Competitor 3', target: 'competitor-3' };
const GAP_2:        MuseCitation = { kind: 'inline', label: 'Gap 2',        target: 'gap-2' };
const ROADMAP_1:    MuseCitation = { kind: 'inline', label: 'Roadmap · Phase 1', target: 'roadmap-1' };

/** Canned muse replies, cycled through for each user message. */
export const MOCK_MUSE_REPLIES: MuseTurn[] = [
  {
    speaker: 'muse',
    content:
      'The opportunity is real but narrow. [[competitor-3|Competitor 3]] already does this well — what they miss is the cross-team handoff. [[gap-2|Gap 2]] points exactly there, and the recommended [[roadmap-1|Roadmap · Phase 1]] assumes you can win on that handoff within 90 days.',
    sources: [GAP_2, COMPETITOR_3, ROADMAP_1],
    followUps: [
      'what about retention?',
      'compare to Future',
      'how big is the Phase 1 risk?',
    ],
  },
  {
    speaker: 'muse',
    content:
      'Mostly a sequencing problem. The tooling exists — calendar, ticketing, doc storage — but no current player owns the choreography across the relevant teams. The wedge is being the layer that knows **what should happen next**, not the layer that stores the artifacts. Pricing pressure from [[competitor-3|Competitor 3]] is the main risk.',
    sources: [COMPETITOR_3],
    followUps: [
      'what would make this defensible?',
      'who owns the budget for this?',
      'price point sensitivity?',
    ],
  },
  {
    speaker: 'muse',
    content:
      'On retention specifically: the 60-day mark in [[roadmap-1|Roadmap · Phase 1]] is load-bearing. If churn stays above 30% at day 60, the unit economics never close. Worth instrumenting that explicitly before paid acquisition turns on.',
    sources: [ROADMAP_1, GAP_2],
    followUps: [
      'what causes churn at day 60?',
      'CAC targets to make this work',
      'show me Competitor 3’s retention',
    ],
  },
];

/** Demo thread used when ?muse=demo is set — drops the user into a populated chat. */
export const DEMO_THREAD: MuseTurn[] = [
  {
    speaker: 'user',
    content:
      'how does the gap around onboarding compare to what mid-market HR tools already offer?',
  },
  MOCK_MUSE_REPLIES[0],
  {
    speaker: 'user',
    content: 'is the handoff a sequencing problem or a tooling problem?',
  },
  MOCK_MUSE_REPLIES[1],
];
