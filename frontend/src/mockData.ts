import type { BuildBrief, MarketMemo, PipelineStage } from './types';
import type { ApiReport, ResultJson } from './api';

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

export const MOCK_HISTORY: ApiReport[] = [
  {
    report_id: 'mock-h1',
    idea_text: 'Creator economy monetization platform',
    status:    'complete',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    pk: 'REPORT#mock-h1', sk: 'REPORT#mock-h1',
    gsi1pk: 'REPORTS', gsi1sk: new Date(Date.now() - 3600000 * 2).toISOString(),
    result_json: { ...MOCK_REPORT, saturation_score: '73', saturation_label: 'Highly Saturated' },
  },
  {
    report_id: 'mock-h2',
    idea_text: 'Sustainable food delivery platform',
    status:    'complete',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    pk: 'REPORT#mock-h2', sk: 'REPORT#mock-h2',
    gsi1pk: 'REPORTS', gsi1sk: new Date(Date.now() - 86400000).toISOString(),
    result_json: { ...MOCK_REPORT, saturation_score: '81', saturation_label: 'Highly Saturated' },
  },
  {
    report_id: 'mock-h3',
    idea_text: 'B2B SaaS for construction project management',
    status:    'complete',
    created_at: new Date(Date.now() - 172800000).toISOString(),
    pk: 'REPORT#mock-h3', sk: 'REPORT#mock-h3',
    gsi1pk: 'REPORTS', gsi1sk: new Date(Date.now() - 172800000).toISOString(),
    result_json: { ...MOCK_REPORT, saturation_score: '34', saturation_label: 'Low Saturation' },
  },
  {
    report_id: 'mock-h4',
    idea_text: 'Pet telehealth and vet booking service',
    status:    'complete',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    pk: 'REPORT#mock-h4', sk: 'REPORT#mock-h4',
    gsi1pk: 'REPORTS', gsi1sk: new Date(Date.now() - 86400000 * 5).toISOString(),
    result_json: { ...MOCK_REPORT, saturation_score: '47', saturation_label: 'Moderately Saturated' },
  },
];

/** Mock Build Brief used when VITE_USE_MOCK=true — matches the fitness MOCK_REPORT. */
export const MOCK_BUILD_BRIEF: BuildBrief = {
  isTechDominant: true,
  complexityScore: 58,
  complexityLabel: 'Moderate',
  complexityDrivers: [
    'real-time adaptive logic',
    'wearable & biometric integrations',
    'a model that improves per user',
  ],
  capabilities: [
    {
      name: 'Accounts & sign-in',
      description: 'Let people create an account and sign back in securely.',
      buildOrBuy: 'buy',
      recommendation: 'Use a managed identity provider (Auth0, Cognito, or Clerk). Do not roll your own.',
    },
    {
      name: 'Payments & subscriptions',
      description: 'Charge for the plan and manage upgrades, renewals, and cancellations.',
      buildOrBuy: 'buy',
      recommendation: 'Stripe handles checkout, billing, and subscription state out of the box.',
    },
    {
      name: 'Wearable & health-data sync',
      description: 'Pull sleep, heart rate, and activity from the devices people already wear.',
      buildOrBuy: 'build',
      recommendation: 'Use each vendor SDK (Apple Health, Whoop, Oura); the sync orchestration is yours to build.',
    },
    {
      name: 'Adaptive coaching engine',
      description: 'Replan each workout from past sessions, recovery, and schedule.',
      buildOrBuy: 'build',
      recommendation: 'This is your differentiator. Build it in-house — it is the reason the product exists.',
    },
    {
      name: 'Notifications',
      description: 'Nudge people back with reminders and session summaries.',
      buildOrBuy: 'buy',
      recommendation: 'Use a managed push and email service rather than maintaining your own senders.',
    },
    {
      name: 'Outcome & retention analytics',
      description: 'See who keeps coming back and whether they are getting results.',
      buildOrBuy: 'buy',
      recommendation: 'Start with an off-the-shelf product-analytics tool; instrument retention from day one.',
    },
  ],
  foundation: [
    {
      primitive: 'Object storage',
      why: 'Hold workout media, exported briefs, and anything users upload.',
      cloudExamples: 'S3 (AWS) / Blob Storage (Azure) / Cloud Storage (GCP)',
    },
    {
      primitive: 'Managed database',
      why: 'Keep accounts, programs, and session history in one durable place.',
      cloudExamples: 'RDS or DynamoDB (AWS) / Azure SQL or Cosmos DB / Cloud SQL or Firestore (GCP)',
    },
    {
      primitive: 'Serverless compute',
      why: 'Run the adaptive logic on demand without managing servers.',
      cloudExamples: 'Lambda (AWS) / Functions (Azure) / Cloud Functions (GCP)',
    },
    {
      primitive: 'CDN',
      why: 'Deliver the app and its media fast, everywhere.',
      cloudExamples: 'CloudFront (AWS) / Front Door (Azure) / Cloud CDN (GCP)',
    },
    {
      primitive: 'Lightweight data pipeline',
      why: 'Move session data somewhere you can learn from it later.',
      cloudExamples: 'Kinesis Firehose (AWS) / Event Hubs (Azure) / Pub/Sub + Dataflow (GCP)',
    },
  ],
  mvpScope:
    'To stand up a localhost MVP: a sign-in screen, a profile, a workout that adapts from one manual input (how hard the last session felt), and a way to log a completed session. Skip wearables, payments, and the learning model until you have proven people come back.',
  effort: {
    timeframe: '8 to 14 weeks to a usable MVP',
    teamShape: '1 to 2 engineers, plus a part-time designer',
  },
  technicalRisks: [
    {
      title: 'Retention is the real product',
      description:
        'Most fitness apps lose people around the 60-day mark. The adaptive engine only matters if people keep opening it, so instrument retention before you spend on growth.',
    },
    {
      title: 'Health data is sensitive',
      description:
        'Biometric and health data carry real privacy obligations. Keep the scope tight and get professional guidance before you store it.',
    },
    {
      title: 'Wearable integrations drift',
      description:
        'Third-party health APIs change and rate-limit. Treat each integration as something you will maintain, not set and forget.',
    },
  ],
};

/** Mock Market Memo (v2) — drives the /memo prototype. Same fitness idea as
 *  MOCK_REPORT, re-expressed as a citation-grounded investment memo so the
 *  bands-as-hero + tiered-receipts treatment can be felt on realistic data. */
export const MOCK_MEMO: MarketMemo = {
  idea:     'An AI fitness coaching app that adjusts every workout in real time based on your watch data, sleep, and schedule.',
  vertical: 'Fitness app · United States & Western Europe',
  oneliner: 'Lots of people want this and the market is growing fast. The catch: the big players either lock you into their hardware or charge a lot for a human coach. The opening is a smart app that adapts to you, at a price normal people can afford.',

  bands: [
    {
      axis: 'saturation',
      label: 'Competitive',
      receipt: 'A handful of well-funded apps already exist, but the big names all chase the expensive end.',
      score: 62,
      tone: 'mixed',
    },
    {
      axis: 'difficulty',
      label: 'Challenging',
      receipt: 'Health data comes with privacy rules, and the real challenge is keeping people coming back after the first couple of months.',
      score: 58,
      tone: 'mixed',
    },
    {
      axis: 'opportunity',
      label: 'Strong',
      receipt: 'A big, fast-growing market — and no one yet owns the affordable, adapts-to-you spot.',
      score: 71,
      tone: 'good',
    },
  ],

  marketSize: {
    tam: '$14.8B',
    growth: 'growing 24% a year',
    note: 'There wasn\'t much hard data for this exact niche, so this number is an estimate built from reports on fitness trackers and the wider digital-fitness market.',
    tier: 'estimate',
    sources: [
      { label: "Grand View '25", url: 'https://www.grandviewresearch.com/' },
      { label: 'Statista', url: 'https://www.statista.com/' },
    ],
  },

  competitors: [
    {
      name: 'Future',
      tier: 'dominant',
      strength: 'Real human coaches — people stay engaged and stick around.',
      weakness: 'At $149 a month it\'s out of reach for most people, and there\'s no AI personalization.',
      position: 'Big player (premium)',
      fundingStage: 'Well funded',
      url: 'https://www.future.co/',
    },
    {
      name: 'Whoop',
      tier: 'dominant',
      strength: 'Strong brand and rich data from its wearable device.',
      weakness: 'You have to buy and wear its hardware, and it barely guides your actual workouts.',
      position: 'Big player (hardware)',
      fundingStage: 'Heavily funded',
      url: 'https://www.whoop.com/',
    },
    {
      name: 'Freeletics',
      tier: 'strong',
      strength: 'Huge user base, has an AI coach, and needs no equipment.',
      weakness: 'Dated design, shallow personalization, and lots of people quit after two months.',
      position: 'Major',
      fundingStage: 'Funded, growing',
      url: 'https://www.freeletics.com/',
    },
    {
      name: 'Ladder',
      tier: 'niche',
      strength: 'Well-designed programs, affordable, strong community.',
      weakness: 'No AI personalization and little brand awareness outside its niche.',
      position: 'Smaller, growing',
      fundingStage: 'Early stage',
      url: 'https://www.joinladder.com/',
    },
  ],

  whyNow: {
    shift: 'Smartwatches and fitness trackers are everywhere now, and AI has gotten cheap enough to personalize a workout on the fly. A few years ago, building this would have been much harder and far more expensive.',
    tier: 'estimate',
    sources: [
      { label: 'TechCrunch', url: 'https://techcrunch.com/' },
    ],
  },

  gaps: [
    {
      title: 'A plan that adjusts to you',
      description: 'None of the big apps change your plan based on your sleep, food, schedule, and past workouts. Their plan stays the same even when your week doesn\'t.',
      severity: 'high',
      underserved: 'People who take fitness seriously and have outgrown one-size-fits-all plans, but can\'t afford a $149-a-month human coach.',
      opportunityScore: 90, // high (70) + 2 quotes (16) + the big apps clearly miss it (10) → capped at 100
      tags: ['adapts to you', 'keeps people coming back'],
      quotes: [
        { quote: '“the program never changes even when I tell it the last week wrecked me”', source: { label: 'r/fitness', url: 'https://www.reddit.com/r/fitness/' } },
        { quote: '“great coach, but $149 a month is brutal”', source: { label: 'Trustpilot', url: 'https://www.trustpilot.com/' } },
      ],
    },
    {
      title: 'Expert coaching that\'s affordable',
      description: 'Good coaching is locked behind $100-plus a month. A smart, AI-first app could give people expert-level plans at a price the average person can actually pay.',
      severity: 'high',
      underserved: 'Everyday people priced out of the premium apps.',
      opportunityScore: 81, // high (70) + 1 quote (8) + the big apps partly miss it
      tags: ['affordable', 'for everyone'],
      quotes: [
        { quote: '“I want Future-quality plans without the Future price”', source: { label: 'G2', url: 'https://www.g2.com/' } },
      ],
    },
    {
      title: 'Everything in one place',
      description: 'Fitness, sleep, stress, and food live in separate apps that don\'t talk to each other. No one ties them together into a single, simple picture of how you\'re doing.',
      severity: 'medium',
      underserved: 'People juggling three or four different wellness apps with no single view.',
      opportunityScore: 58, // medium (50) + no quotes + the big apps partly miss it
      tags: ['all-in-one', 'wellness'],
      quotes: [],
    },
  ],

  entryCost: [
    {
      label: 'Rules & privacy',
      value: 'Health data like heart rate and sleep comes with privacy rules you have to follow. You won\'t need medical approval to start, but you do need to handle that data carefully.',
      tier: 'fact',
    },
    {
      label: 'Getting customers',
      value: 'Paying for ads in fitness is expensive, and interest spikes every January. The cheaper, smarter route is growing through word of mouth and real results.',
      tier: 'estimate',
      sources: [{ label: 'TechCrunch', url: 'https://techcrunch.com/' }],
    },
    {
      label: 'Money to start',
      value: 'The software-only path is light — roughly $500K to $1.5M to reach a version people actually stick with. No hardware needed to get going.',
      tier: 'estimate',
    },
    {
      label: 'Keeping people',
      value: 'People hop between fitness apps easily. That makes them easy to sign up — and just as easy to lose. You keep them by genuinely getting better the more they use you.',
      tier: 'estimate',
    },
  ],

  read: {
    synthesis: 'The market is big and growing, and the leaders have left a clear opening: a coaching app that\'s affordable and gets smarter the more you use it. The crowded part is the expensive, hardware-heavy end — not the affordable, AI-first space. The hardest part isn\'t beating competitors; it\'s getting people to keep coming back. Whoever proves people stick around, and actually get results, wins this opening.',
    recommendation: 'Start with affordable coaching that adapts to each person in real time. Treat "keeping people coming back" as the real product: measure it from day one, share real results to build trust, and let those results — not ad spending — be what sets you apart.',
    limit: 'This is an AI-generated read of public information, not financial advice. The market-size and cost figures are estimates — double-check the sources we linked, and get professional advice before putting in real money.',
  },
};

export const EXAMPLE_QUERIES = [
  'AI fitness coaching app',
  'D2C supplement brand',
  'SaaS for dental offices',
  'EV charging network',
  'Creator economy platform',
  'Pet telehealth service',
];
