import type { MarketReport, MarketStat, Competitor, MarketGap, RoadmapPhase } from './types';
import type { ResultJson, BackendCompetitor } from './api';

function formatUsd(value: number | null): string {
  if (value === null) return 'N/A';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000)     return `$${(value / 1_000_000).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

function stageToStrength(stage: BackendCompetitor['stage']): Competitor['strength'] {
  if (stage === 'public' || stage === 'acquired' || stage === 'series_c_plus') return 'dominant';
  if (stage === 'series_a_b') return 'strong';
  if (stage === 'seed') return 'moderate';
  return 'niche';
}

function stageToFunding(stage: BackendCompetitor['stage']): string {
  const map: Record<BackendCompetitor['stage'], string> = {
    bootstrapped: 'Bootstrapped',
    seed:         'Seed Stage',
    series_a_b:   'Series A/B',
    series_c_plus: 'Series C+',
    public:       'Public',
    acquired:     'Acquired',
    unknown:      'Unknown',
  };
  return map[stage];
}

function segmentToUserBase(segment: BackendCompetitor['target_segment']): string {
  const map: Record<BackendCompetitor['target_segment'], string> = {
    enterprise:  'Enterprise',
    mid_market:  'Mid-Market',
    smb:         'Small Business',
    prosumer:    'Prosumer',
    consumer:    'Consumer',
    unknown:     'Various',
  };
  return map[segment];
}

function pricingToCategory(pricing: BackendCompetitor['pricing_tier']): string {
  const map: Record<BackendCompetitor['pricing_tier'], string> = {
    free:       'Free Tier',
    low:        'Budget',
    mid:        'Mid-Market',
    high:       'Premium',
    enterprise: 'Enterprise',
    unknown:    'Various',
  };
  return map[pricing];
}

function buildKeyStats(json: ResultJson): MarketStat[] {
  const { tam_usd, growth_rate_pct, data_quality } = json.market_size;
  const { saturation, difficulty, opportunity } = json.scores;
  const directCount = json.competitors.direct.length;

  return [
    {
      label: 'Total Addressable Market',
      value: formatUsd(tam_usd),
      change: data_quality === 'unavailable' ? 'Data unavailable' : `${data_quality} confidence`,
      direction: 'flat',
    },
    {
      label: 'Market Growth Rate',
      value: growth_rate_pct !== null ? `${growth_rate_pct}% YoY` : 'N/A',
      change: growth_rate_pct !== null
        ? (growth_rate_pct > 20 ? 'High growth' : growth_rate_pct > 10 ? 'Moderate growth' : 'Slow growth')
        : 'Data unavailable',
      direction: growth_rate_pct !== null && growth_rate_pct > 10 ? 'up' : 'flat',
    },
    {
      label: 'Active Competitors',
      value: String(directCount),
      change: 'Direct players identified',
      direction: 'flat',
    },
    {
      label: 'Saturation Score',
      value: `${saturation.value}/100`,
      change: saturation.band,
      direction: saturation.value > 65 ? 'down' : saturation.value > 40 ? 'flat' : 'up',
    },
    {
      label: 'Opportunity Score',
      value: `${opportunity.value}/100`,
      change: opportunity.band,
      direction: opportunity.value > 50 ? 'up' : 'flat',
    },
    {
      label: 'Entry Difficulty',
      value: `${difficulty.value}/100`,
      change: difficulty.band,
      direction: difficulty.value > 65 ? 'down' : 'flat',
    },
  ] satisfies MarketStat[];
}

function buildCompetitors(direct: BackendCompetitor[]): Competitor[] {
  return direct.map(c => ({
    name:     c.name,
    tagline:  c.one_line_description,
    funding:  stageToFunding(c.stage),
    founded:  0,
    userBase: segmentToUserBase(c.target_segment),
    strength: stageToStrength(c.stage),
    category: pricingToCategory(c.pricing_tier),
  }));
}

function buildGaps(json: ResultJson): MarketGap[] {
  return [
    {
      title:            'Market Gap',
      description:      json.summary.where_is_the_gap,
      opportunityScore: json.scores.opportunity.value,
      tags:             json.parsed.keywords.slice(0, 3),
    },
  ] satisfies MarketGap[];
}

function buildRoadmap(json: ResultJson): RoadmapPhase[] {
  const w = json.summary.what_would_it_take;
  return [
    {
      phase:      1,
      title:      'Validate & Build',
      timeline:   w.timeline_to_first_revenue,
      investment: w.capital_estimate,
      milestones: [w.key_differentiator_required],
    },
    {
      phase:      2,
      title:      'Manage Risk',
      timeline:   'Ongoing',
      investment: 'Monitor closely',
      milestones: [w.biggest_risk],
    },
  ] satisfies RoadmapPhase[];
}

export function adaptReport(json: ResultJson, idea_text: string): MarketReport {
  const paragraphs = json.summary.executive_summary
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  const oneliner     = paragraphs[0] ?? json.summary.executive_summary;
  const trendSignal  = paragraphs[1] ??
    `${json.scores.opportunity.band} opportunity in a ${json.scores.saturation.band.toLowerCase()} market` +
    (json.market_size.growth_rate_pct !== null
      ? `. Growth rate: ${json.market_size.growth_rate_pct}% YoY.`
      : '.');

  const w = json.summary.what_would_it_take;
  const recommendation = `${w.key_differentiator_required} ${w.biggest_risk}`;

  return {
    idea:             idea_text,
    vertical:         json.parsed.sub_industry || json.parsed.industry,
    oneliner,
    saturationScore:  json.scores.saturation.value,
    saturationLabel:  json.scores.saturation.band,
    keyStats:         buildKeyStats(json),
    competitors:      buildCompetitors(json.competitors.direct),
    gaps:             buildGaps(json),
    roadmap:          buildRoadmap(json),
    trendSignal,
    recommendation,
  };
}
