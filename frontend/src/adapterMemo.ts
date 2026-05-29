import type {
  MarketMemo, ScoreBand, BandTone, EvidenceTier, Source,
  MemoCompetitor, CompetitorTier, MemoGap, GapSeverity,
  EntryCostFactor, MemoRead,
} from './types';
import type { ResultJson, BackendCompetitor, BackendGap, SourceJson } from './api';

const TONES: BandTone[] = ['good', 'mixed', 'bad'];
const TIERS: EvidenceTier[] = ['fact', 'estimate', 'analysis'];
const SEVERITIES: GapSeverity[] = ['high', 'medium', 'low'];

function clampScore(raw: number | string | undefined, fallback = 0): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  return isNaN(n) ? fallback : Math.min(100, Math.max(0, n));
}
function asTone(v: unknown): BandTone {
  return TONES.includes(v as BandTone) ? (v as BandTone) : 'mixed';
}
function asTier(v: unknown): EvidenceTier {
  return TIERS.includes(v as EvidenceTier) ? (v as EvidenceTier) : 'estimate';
}
function asSeverity(v: unknown): GapSeverity {
  return SEVERITIES.includes(v as GapSeverity) ? (v as GapSeverity) : 'medium';
}
function asSources(arr: SourceJson[] | undefined): Source[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(s => ({ label: String(s?.label ?? ''), url: String(s?.url ?? '') }))
    .filter(s => s.url);
}

// Derive threat tier from a market-position phrase (mirrors adapter.ts competitorStrength).
function competitorTier(position: string): CompetitorTier {
  const p = position.toLowerCase();
  if (p.includes('leader') || p.includes('leading') || p.includes('dominant')) return 'dominant';
  if (p.includes('major') || p.includes('prominent') || p.includes('strong')) return 'strong';
  if (p.includes('growing') || p.includes('emerging') || p.includes('niche')) return 'niche';
  return 'moderate';
}

const AXES: ScoreBand['axis'][] = ['saturation', 'difficulty', 'opportunity'];
function fallbackLabel(axis: ScoreBand['axis'], s: number): string {
  if (axis === 'saturation') return s <= 24 ? 'Wide open' : s <= 49 ? 'Some players' : s <= 74 ? 'Competitive' : 'Crowded';
  if (axis === 'difficulty') return s <= 24 ? 'Easy start' : s <= 49 ? 'Manageable' : s <= 74 ? 'Challenging' : 'Very hard';
  return s <= 24 ? 'Limited' : s <= 49 ? 'Modest' : s <= 74 ? 'Strong' : 'Excellent';
}
function fallbackTone(axis: ScoreBand['axis'], s: number): BandTone {
  if (axis === 'opportunity') return s > 65 ? 'good' : s > 40 ? 'mixed' : 'bad';
  return s <= 40 ? 'good' : s <= 65 ? 'mixed' : 'bad';
}
function fallbackBands(json: ResultJson): ScoreBand[] {
  const scores: Record<ScoreBand['axis'], number> = {
    saturation: clampScore(json.saturation_score),
    difficulty: clampScore(json.difficulty_score),
    opportunity: clampScore(json.opportunity_score),
  };
  return AXES.map(axis => ({
    axis,
    label: axis === 'saturation' && json.saturation_label
      ? json.saturation_label : fallbackLabel(axis, scores[axis]),
    receipt: '',
    score: scores[axis],
    tone: fallbackTone(axis, scores[axis]),
  }));
}

export function adaptMemo(json: ResultJson, ideaText: string): MarketMemo {
  const bands: ScoreBand[] = Array.isArray(json.bands) && json.bands.length
    ? json.bands.map(b => ({
        axis: b.axis,
        label: String(b.label ?? ''),
        receipt: String(b.receipt ?? ''),
        score: clampScore(b.score),
        tone: asTone(b.tone),
      }))
    : fallbackBands(json);

  const m = json.market;
  const marketSize = {
    tam: String(m?.tam ?? (json.market_size || 'Unknown')),
    growth: String(m?.growth ?? ''),
    note: m?.note ? String(m.note) : undefined,
    tier: asTier(m?.tier),
    sources: asSources(m?.sources),
  };

  const competitors: MemoCompetitor[] = (json.competitors ?? []).map((c: BackendCompetitor) => {
    const position = c.market_position ?? '';
    return {
      name: c.name,
      tier: competitorTier(position),
      strength: c.strength ?? '',
      weakness: c.weakness ?? '',
      position,
      fundingStage: c.funding_stage ?? 'unknown',
      url: c.url ?? '',
    };
  });

  const whyNow = {
    shift: String(json.why_now?.shift ?? json.trend_signal ?? ''),
    tier: asTier(json.why_now?.tier),
    sources: asSources(json.why_now?.sources),
  };

  const gaps: MemoGap[] = (json.gaps ?? []).map((g: BackendGap) => ({
    title: g.title ?? '',
    description: g.description ?? '',
    severity: asSeverity(g.severity),
    underserved: g.underserved ?? '',
    opportunityScore: clampScore(g.opportunity_score, 50),
    tags: Array.isArray(g.tags) ? g.tags.map(String) : [],
    quotes: Array.isArray(g.quotes)
      ? g.quotes
          .filter(q => q && q.quote)
          .map(q => ({
            quote: String(q.quote),
            source: { label: String(q.source?.label ?? ''), url: String(q.source?.url ?? '') },
          }))
      : [],
  }));

  const entryCost: EntryCostFactor[] = (json.entry_cost ?? []).map(f => ({
    label: f.label ?? '',
    value: f.value ?? '',
    tier: asTier(f.tier),
    sources: asSources(f.sources),
  }));

  const read: MemoRead = json.read
    ? {
        synthesis: String(json.read.synthesis ?? ''),
        recommendation: String(json.read.recommendation ?? ''),
        limit: String(json.read.limit ?? ''),
      }
    : {
        synthesis: json.oneliner ?? '',
        recommendation: json.recommendation ?? '',
        limit: 'This is an AI-generated read of public information, not advice. Figures are estimates.',
      };

  const verticalParts = [json.vertical, json.geography, json.business_model].filter(Boolean);

  return {
    idea: ideaText,
    vertical: verticalParts.join(' · ') || (json.vertical ?? ''),
    oneliner: json.oneliner ?? '',
    bands,
    marketSize,
    competitors,
    whyNow,
    gaps,
    entryCost,
    read,
  };
}
