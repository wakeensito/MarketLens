import type { MarketReport, MarketStat, Competitor, MarketGap, RoadmapPhase } from './types';
import type { ResultJson, BackendCompetitor } from './api';

function parseScore(raw: number | string | undefined): number {
  const n = typeof raw === 'number' ? raw : parseInt(raw ?? '0', 10);
  return isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
}

function competitorStrength(c: BackendCompetitor): Competitor['strength'] {
  const pos = (c.market_position ?? '').toLowerCase();
  if (pos.includes('leader') || pos.includes('leading') || pos.includes('dominant')) return 'dominant';
  if (pos.includes('major') || pos.includes('prominent') || pos.includes('strong'))  return 'strong';
  if (pos.includes('growing') || pos.includes('emerging') || pos.includes('niche'))  return 'niche';
  return 'moderate';
}

export function adaptReport(json: ResultJson, idea_text: string): MarketReport {
  const saturationScore  = parseScore(json.saturation_score);
  const difficultyScore  = parseScore(json.difficulty_score);
  const opportunityScore = parseScore(json.opportunity_score);

  const keyStats: MarketStat[] = [
    {
      label: 'Saturation',
      value: `${saturationScore}/100`,
      change: json.saturation_label ?? '',
      direction: saturationScore > 65 ? 'down' : saturationScore > 40 ? 'flat' : 'up',
    },
    {
      label: 'Opportunity',
      value: `${opportunityScore}/100`,
      change: opportunityScore > 60 ? 'Strong opportunity' : 'Moderate opportunity',
      direction: opportunityScore > 50 ? 'up' : 'flat',
    },
    {
      label: 'Entry Difficulty',
      value: `${difficultyScore}/100`,
      change: difficultyScore > 65 ? 'High barrier' : 'Moderate barrier',
      direction: difficultyScore > 65 ? 'down' : 'flat',
    },
    {
      label: 'Competitors Found',
      value: String((json.competitors ?? []).length),
      change: 'direct players',
      direction: 'flat',
    },
  ];

  const competitors: Competitor[] = (json.competitors ?? []).map(c => ({
    name:           c.name,
    strength:       competitorStrength(c),
    strengthText:   c.strength,
    weaknessText:   c.weakness,
    marketPosition: c.market_position,
  }));

  const gaps: MarketGap[] = (json.gaps ?? []).map((g, i) => ({
    title:            g.title,
    description:      g.description,
    opportunityScore: Math.max(40, opportunityScore - i * 8),
    tags:             [],
  }));

  const roadmap: RoadmapPhase[] = (json.roadmap ?? []).map((r, i) => ({
    phase:      i + 1,
    title:      r.title,
    timeline:   r.phase,
    investment: 'TBD',
    milestones: [r.description],
  }));

  return {
    idea:            idea_text,
    vertical:        json.vertical ?? 'Unknown',
    oneliner:        json.oneliner ?? '',
    saturationScore,
    saturationLabel: json.saturation_label ?? '',
    difficultyScore,
    opportunityScore,
    keyStats,
    competitors,
    gaps,
    roadmap,
    trendSignal:     json.trend_signal ?? '',
    recommendation:  json.recommendation ?? '',
  };
}
