export type AppState = 'landing' | 'analysis' | 'report';
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
  keyStats: MarketStat[];
  competitors: Competitor[];
  gaps: MarketGap[];
  roadmap: RoadmapPhase[];
  trendSignal: string;
  recommendation: string;
}
