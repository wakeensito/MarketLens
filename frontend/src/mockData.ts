import type { PipelineStage } from './types';

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

export const EXAMPLE_QUERIES = [
  'AI fitness coaching app',
  'D2C supplement brand',
  'SaaS for dental offices',
  'EV charging network',
  'Creator economy platform',
  'Pet telehealth service',
];
