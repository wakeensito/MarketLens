export type AppState = 'landing' | 'analysis' | 'report' | 'workspace-empty';
export type StageStatus = 'pending' | 'running' | 'done';

export interface PipelineStage {
  id: string;
  label: string;
  description: string;
  startMs: number;
  durationMs: number;
  status: StageStatus;
  elapsedMs: number;
  parallelGroup?: string;
  parallelGroupLabel?: string;
}

export interface MarketStat {
  label: string;
  value: string;
  change: string;
  direction: 'up' | 'down' | 'flat';
}

export interface Competitor {
  name: string;
  strength: 'dominant' | 'strong' | 'moderate' | 'niche';
  strengthText: string;
  weaknessText: string;
  marketPosition: string;
}

export interface MarketGap {
  title: string;
  description: string;
  opportunityScore: number;
  tags: string[];
}

export interface RoadmapPhase {
  phase: number;
  title: string;
  timeline: string;
  investment: string;
  milestones: string[];
}

export interface MarketReport {
  idea: string;
  vertical: string;
  oneliner: string;
  saturationScore: number;
  saturationLabel: string;
  difficultyScore:  number;
  opportunityScore: number;
  keyStats: MarketStat[];
  competitors: Competitor[];
  gaps: MarketGap[];
  roadmap: RoadmapPhase[];
  trendSignal: string;
  recommendation: string;
}

/* ── Build Brief (Pro) ───────────────────────────────────────
   A plain-English, founder-altitude build deliverable derived
   from a completed report. Vendor-neutral by design. */

export type BuildOrBuy = 'build' | 'buy';

export interface BuildBriefCapability {
  name: string;
  description: string;
  /** "build" = your work / differentiator; "buy" = an off-the-shelf vendor solves it. */
  buildOrBuy: BuildOrBuy;
  recommendation: string;
}

export interface BuildBriefPrimitive {
  primitive: string;
  why: string;
  /** Example cross-cloud mapping, e.g. "S3 (AWS) / Blob Storage (Azure) / Cloud Storage (GCP)". */
  cloudExamples: string;
}

export interface BuildBriefRisk {
  title: string;
  description: string;
}

export interface BuildBriefEffort {
  timeframe: string;
  teamShape: string;
}

export interface BuildBrief {
  /** false → low-tech idea; the brief degrades to website + payments rather than inventing a stack. */
  isTechDominant: boolean;
  complexityScore: number;
  complexityLabel: string;
  complexityDrivers: string[];
  capabilities: BuildBriefCapability[];
  foundation: BuildBriefPrimitive[];
  mvpScope: string;
  effort: BuildBriefEffort;
  technicalRisks: BuildBriefRisk[];
}
