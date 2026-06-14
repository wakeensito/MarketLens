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

/* ── Market Memo (v2 — defensible, citation-grounded) ─────────
   Reframes the report as a one-page investment memo. Every claim
   carries a tier; T2 claims carry sources (the "receipts"). The
   scores are demoted to bands with one-clause receipts — the raw
   0–100 lives under the hood, not as the headline. This interface
   is the proposed result_json v2 contract: lock the shape here on
   mock data, then have the backend produce it. */

/** T1 = verifiable fact · T2 = sourced estimate · T3 = analyst read. */
export type EvidenceTier = 'fact' | 'estimate' | 'analysis';

/** A citation receipt. Cites a source, not a vibe. */
export interface Source {
  label: string;   // "Statista '25", "Crunchbase", "r/fitness"
  url:   string;
}

/** Drives band color: good = low saturation / low difficulty / high opportunity. */
export type BandTone = 'good' | 'mixed' | 'bad';

/** A score axis shown as a band word + one-clause receipt — not a naked integer.
 *  `score` is retained under the hood (expand/hover, exports) but is not the hero. */
export interface ScoreBand {
  axis:    'saturation' | 'difficulty' | 'opportunity';
  label:   string;   // "Competitive", "Challenging", "Strong"
  receipt: string;   // "8 funded players, top-3 hold ~70%"
  score:   number;   // 0–100, demoted
  tone:    BandTone;
}

/** Section 1 — Market Size & Growth (T2, sourced). */
export interface MarketSizeEvidence {
  tam:     string;        // "$2.4B"
  growth:  string;        // "+14%/yr"
  note?:   string;        // bottoms-up caveat when hard data is thin
  sources: Source[];
  tier:    EvidenceTier;  // 'estimate'
}

/** Threat tier — drives sort order, card accent, and the strength indicator dot. */
export type CompetitorTier = 'dominant' | 'strong' | 'moderate' | 'niche';

/** Section 2 — Competitive Landscape (T1, every line verifiable).
 *  Strength AND weakness are both kept — the weakness is the investor's
 *  "why can't they crush you" answer. */
export interface MemoCompetitor {
  name:         string;
  tier:         CompetitorTier; // threat level
  strength:     string;         // their competitive advantage
  weakness:     string;         // their vulnerability — the opening
  position:     string;         // market-position phrase ("Leader (premium)")
  fundingStage: string;         // "Public", "Series C+", "Seed", "Bootstrapped"
  url:          string;         // the receipt — links the claim to a real company
}

/** Section 3 — Why Now (T2, sourced). The structural shift opening the window. */
export interface WhyNow {
  shift:   string;
  sources: Source[];
  tier:    EvidenceTier;
}

export type GapSeverity = 'high' | 'medium' | 'low';

/** A quoted pain point backing a gap — the gap's receipt. */
export interface GapQuote {
  quote:  string;
  source: Source;
}

/** Section 4 — The Opening (T2). Gaps are quality-weighted (severity + who's
 *  underserved + quotes), NOT a flat count.
 *
 *  `opportunityScore` is GROUNDED, not positional. Backend should derive it from
 *  real signals — proposed: severity base (high 70 / medium 50 / low 35)
 *  + min(20, quotes×8) + 10 if incumbents explicitly miss it — then clamp 0–100.
 *  (The old report computed `max(40, overall − index×8)`, i.e. row position
 *  dressed as a score; that is exactly the precision-theater being retired.) */
export interface MemoGap {
  title:            string;
  description:      string;
  severity:         GapSeverity;
  underserved:      string;       // who this gap leaves behind
  opportunityScore: number;       // grounded 0–100 (see note above)
  tags:             string[];     // short descriptors
  quotes:           GapQuote[];   // real complaints; empty → no receipts row
}

/** Section 5 — Cost to Enter (T1 for regime facts, T2 for norms). */
export interface EntryCostFactor {
  label:    string;        // "Regulatory", "Customer acquisition", "Capital", "Switching cost"
  value:    string;        // "HIPAA applies", "Paid channels saturated; CAC runs high"
  tier:     EvidenceTier;  // regulatory regime = 'fact'; CAC norm = 'estimate'
  sources?: Source[];
}

/** The Read — T3, explicitly labeled analysis. Echoes Build Brief's
 *  FOUNDATIONS & LIMITS honesty (the "AI isn't always right" limit). */
export interface MemoRead {
  synthesis:      string;
  recommendation: string;
  limit:          string;  // honest disclaimer
}

export interface MemoRoadmapPhase {
  phase:       string;  // e.g. "Phase 1" or a timeline label from the pipeline
  title:       string;
  description: string;
}

export interface MarketMemo {
  idea:        string;
  vertical:    string;
  oneliner:    string;
  bands:       ScoreBand[];          // the 3 axes, the hero
  marketSize:  MarketSizeEvidence;
  competitors: MemoCompetitor[];
  whyNow:      WhyNow;
  gaps:        MemoGap[];
  entryCost:   EntryCostFactor[];
  roadmap:     MemoRoadmapPhase[];   // entry plan — carries roadmap-N citation anchors
  read:        MemoRead;
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
