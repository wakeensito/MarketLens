import type { PipelineStage } from './types';
import type { ResultJson } from './api';

export const PIPELINE_STAGE_DEFS: Omit<PipelineStage, 'status' | 'elapsedMs'>[] = [
  {
    id: 'sanitize',
    label: 'Validating',
    description: 'Sanitizing input & checking rate limits',
    startMs: 0,
    durationMs: 400,
  },
  {
    id: 'parse',
    label: 'Parsing concept',
    description: 'Extracting vertical, keywords & intent with LLM',
    startMs: 400,
    durationMs: 1400,
  },
  {
    id: 'search-competitors',
    label: 'Competitors',
    description: 'Mapping active players in the space',
    startMs: 1800,
    durationMs: 3200,
    parallelGroup: 'search',
    parallelGroupLabel: 'Web Research',
  },
  {
    id: 'search-market',
    label: 'Market Size',
    description: 'Fetching TAM / SAM / SOM estimates',
    startMs: 1800,
    durationMs: 3200,
    parallelGroup: 'search',
    parallelGroupLabel: 'Web Research',
  },
  {
    id: 'search-trends',
    label: 'Trends',
    description: 'Pulling funding rounds & growth signals',
    startMs: 1800,
    durationMs: 3200,
    parallelGroup: 'search',
    parallelGroupLabel: 'Web Research',
  },
  {
    id: 'analyse',
    label: 'Analysing landscape',
    description: 'LLM deep-dive on competitive positioning & moats',
    startMs: 5000,
    durationMs: 3500,
  },
  {
    id: 'score',
    label: 'Scoring',
    description: 'Computing saturation index & opportunity score',
    startMs: 8500,
    durationMs: 500,
  },
  {
    id: 'summarise',
    label: 'Synthesising insights',
    description: 'Generating executive summary, gaps & entry roadmap',
    startMs: 9000,
    durationMs: 2500,
  },
  {
    id: 'assemble',
    label: 'Assembling report',
    description: 'Packaging your final market intelligence report',
    startMs: 11500,
    durationMs: 500,
  },
];

export const TOTAL_PIPELINE_MS = Math.max(
  ...PIPELINE_STAGE_DEFS.map(s => s.startMs + s.durationMs)
);

export const MOCK_REPORT: ResultJson = {
  vertical:        'Digital Fitness',
  oneliner:        'The AI fitness coaching market is large and growing fast, but dominated by players with hardware moats and expensive human coaches. The gap is hyper-personalized AI that adapts in real-time without proprietary hardware.',
  saturation_score:  '62',
  saturation_label:  'Moderately Saturated',
  difficulty_score:  '58',
  opportunity_score: '71',
  market_size:      '$14.8B TAM',
  geography:        'United States, Western Europe',
  business_model:   'B2C SaaS / Mobile App',
  trend_signal:     'Growing demand for integrated wellness AI with 24.3% YoY market growth. No current player offers real-time adaptive coaching that learns from every session.',
  recommendation:   'Real-time adaptive programming powered by multi-modal AI that learns from every session, biometric input, and schedule change. User retention past 60 days is the #1 failure mode — demonstrably better outcomes are the only defensible moat.',
  competitors: [
    {
      name:            'Future',
      strength:        'Real human coaches with high engagement and strong retention',
      weakness:        'High price point ($149/mo) limits TAM; no AI personalization',
      market_position: 'Leading premium personal training platform via text coaching',
    },
    {
      name:            'Whoop',
      strength:        'Hardware moat with rich biometric data and strong athlete brand',
      weakness:        'Hardware dependency; limited workout guidance beyond recovery',
      market_position: 'Dominant in wearable-driven recovery and performance optimization',
    },
    {
      name:            'Freeletics',
      strength:        'Large user base with AI coach feature and no equipment required',
      weakness:        'Dated UI, weak personalization depth, high 60-day churn',
      market_position: 'Prominent AI-powered bodyweight and gym training coach',
    },
    {
      name:            'Ladder',
      strength:        'Science-backed programming, affordable, community-first approach',
      weakness:        'No AI personalization, limited brand awareness outside niche',
      market_position: 'Growing strength training platform with progressive overload focus',
    },
  ],
  gaps: [
    {
      title:       'Real-time adaptive AI coaching',
      description: 'No current player integrates sleep, nutrition, calendar, and past performance to dynamically replan workouts. The market is ready for an AI coach that compounds its understanding the longer you use it.',
    },
    {
      title:       'Affordable personalized fitness',
      description: 'High-quality coaching is gated behind $100+/mo subscriptions. A scalable AI-first approach could democratize expert-level programming for mass-market price points.',
    },
    {
      title:       'Holistic wellness integration',
      description: 'Siloed fitness apps don\'t connect exercise, sleep quality, stress, and nutrition into a unified performance picture. Integrated signals create stickier products and better outcomes.',
    },
  ],
  roadmap: [
    {
      phase:       'Phase 1',
      title:       'Validate & Build',
      description: 'Build adaptive workout engine integrating wearable data. Target 500 beta users in 90 days. Aim for <30% 60-day churn before scaling spend. Estimated capital: $500K–$1.5M seed.',
    },
    {
      phase:       'Phase 2',
      title:       'Pilot & Iterate',
      description: 'Launch paid beta at $29/mo. Gather outcome data (strength gains, weight, adherence). Publish results publicly to build trust. Iterate AI model on real session data.',
    },
    {
      phase:       'Phase 3',
      title:       'Scale & Expand',
      description: 'Expand to B2B wellness programs (employers, gyms). Explore wearable integrations (Whoop, Oura, Apple Watch). Explore white-label for fitness brands. Target Series A at $3–5M ARR.',
    },
  ],
  key_stats: [
    { label: 'Saturation',         value: '62/100' },
    { label: 'Opportunity',        value: '71/100' },
    { label: 'Entry Difficulty',   value: '58/100' },
    { label: 'Competitors Found',  value: '4' },
  ],
};

export const EXAMPLE_QUERIES = [
  'AI fitness coaching app',
  'D2C supplement brand',
  'SaaS for dental offices',
  'EV charging network',
  'Creator economy platform',
  'Pet telehealth service',
];
