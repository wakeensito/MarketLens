import type { PipelineStage, MarketReport } from './types';

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

export const MOCK_REPORT: MarketReport = {
  idea: 'AI fitness coaching app',
  vertical: 'Health & Wellness Technology',
  oneliner:
    'The AI fitness coaching market is large, well-funded, and rapidly consolidating — new entrants need a defensible niche to compete effectively.',
  saturationScore: 74,
  saturationLabel: 'Competitive',
  keyStats: [
    { label: 'TAM (2024)',        value: '$13.4B',  change: '+19.2% YoY',       direction: 'up'   },
    { label: 'SAM (Mobile Apps)', value: '$4.7B',   change: '+24.1% YoY',       direction: 'up'   },
    { label: 'Active Players',    value: '47',      change: '+8 since 2023',     direction: 'up'   },
    { label: 'Total Funding',     value: '$2.1B',   change: 'Last 3 years',      direction: 'flat' },
    { label: 'Avg. ARPU',         value: '$18/mo',  change: '+$3 vs 2022',       direction: 'up'   },
    { label: 'Avg. Churn',        value: '8.3%/mo', change: 'Industry baseline', direction: 'flat' },
  ],
  competitors: [
    {
      name: 'MyFitnessPal',
      tagline: 'Nutrition & activity tracking leader with 200M+ users',
      funding: 'Acquired ($475M)',
      founded: 2005,
      userBase: '200M+ users',
      strength: 'dominant',
      category: 'Tracking & Logging',
    },
    {
      name: 'Noom',
      tagline: 'Psychology-based weight management at scale',
      funding: '$540M Series F',
      founded: 2008,
      userBase: '45M+ users',
      strength: 'dominant',
      category: 'Behavior Change',
    },
    {
      name: 'Future',
      tagline: 'Human coaches paired with tech-powered delivery',
      funding: '$75M Series B',
      founded: 2017,
      userBase: '100K+ subscribers',
      strength: 'strong',
      category: '1:1 Coaching',
    },
    {
      name: 'Whoop',
      tagline: 'Wearable-first performance optimization platform',
      funding: '$200M Series F',
      founded: 2012,
      userBase: '3M+ members',
      strength: 'strong',
      category: 'Wearable + AI',
    },
    {
      name: 'Caliber',
      tagline: 'Premium personal training at scale',
      funding: '$22M Series A',
      founded: 2018,
      userBase: '50K+ subscribers',
      strength: 'moderate',
      category: '1:1 Coaching',
    },
    {
      name: 'Ladder',
      tagline: 'Expert-designed group workout programs',
      funding: '$14M Series A',
      founded: 2016,
      userBase: '200K+ subscribers',
      strength: 'niche',
      category: 'Group Coaching',
    },
  ],
  gaps: [
    {
      title: 'Senior & Medicare-eligible segment',
      description:
        'No major AI player targets the 65+ demographic despite representing 17% of the US population and having Medicare Advantage coverage for fitness. Injury prevention & mobility-first AI coaching is wide open.',
      opportunityScore: 88,
      tags: ['Underserved', 'High LTV', 'B2B2C potential'],
    },
    {
      title: 'Sport-specific AI coaching',
      description:
        'Existing apps focus on general fitness. No dominant player owns sport-specific training (tennis, golf, swimming, cycling) at the amateur level — high enthusiasm, low churn, clear differentiation.',
      opportunityScore: 82,
      tags: ['Niche', 'High retention', 'Community flywheel'],
    },
    {
      title: 'Workplace & group accountability',
      description:
        'Enterprise wellness programs ($52B market) have poor AI adoption. A B2B product offering group AI coaching cohorts for employers represents large, recurring-revenue opportunity outside the crowded D2C channel.',
      opportunityScore: 79,
      tags: ['B2B', 'High ACV', 'Low CAC'],
    },
    {
      title: 'Recovery & sleep optimization',
      description:
        'Most apps focus on output (workouts) not input (sleep, stress, recovery). An AI that optimizes training around biometric recovery data — without requiring expensive hardware — occupies unclaimed territory.',
      opportunityScore: 71,
      tags: ['Emerging', 'Data moat potential', 'API-first'],
    },
  ],
  roadmap: [
    {
      phase: 1,
      title: 'Validate & Niche Down',
      timeline: 'Month 1–3',
      investment: '$5K–$20K',
      milestones: [
        'Pick one underserved segment (e.g. senior mobility or sport-specific)',
        'Interview 50 target users — validate willingness to pay',
        'Ship MVP: basic AI plan generation + one feedback loop',
        'Achieve 20 paying beta users at $15–$25/mo',
      ],
    },
    {
      phase: 2,
      title: 'Build the Retention Engine',
      timeline: 'Month 4–9',
      investment: '$50K–$150K',
      milestones: [
        'Reduce monthly churn below 5% before scaling acquisition',
        'Ship adaptive plans that update based on real performance data',
        'Build community feature (group challenges, accountability)',
        'Reach $5K MRR with strong NPS (>50)',
      ],
    },
    {
      phase: 3,
      title: 'Scale Acquisition',
      timeline: 'Month 10–18',
      investment: '$200K–$500K',
      milestones: [
        'Validate CAC payback period under 6 months before spending',
        'Partner with 2–3 wearable platforms or gym chains',
        'Launch referral program — target 30% referred new growth',
        'Hit $50K MRR; begin Series A conversations',
      ],
    },
  ],
  trendSignal:
    'GLP-1 drug adoption (Ozempic / Wegovy) is reshaping fitness behavior — users on GLP-1s want complementary fitness + muscle-preservation guidance. This creates a new, high-intent acquisition channel in 2025–2026.',
  recommendation:
    'Do not enter the general AI fitness market. It is well-funded, commoditized at the base tier, and dominated by players with massive data moats. Instead, pick a defensible vertical — seniors, a specific sport, or enterprise — and own it completely before expanding.',
};

export const INDUSTRIES = [
  'SaaS / B2B Software', 'Consumer Tech', 'Fintech', 'Healthtech',
  'E-commerce', 'Creator Economy', 'Climate / Greentech', 'EdTech',
  'Real Estate', 'Other',
];

export const STAGES = [
  'Just an idea',
  'Early validation',
  'Building MVP',
  'Launched, seeking growth',
];

export const EXAMPLE_QUERIES = [
  'AI fitness coaching app',
  'D2C supplement brand',
  'SaaS for dental offices',
  'EV charging network',
  'Creator economy platform',
  'Pet telehealth service',
];
