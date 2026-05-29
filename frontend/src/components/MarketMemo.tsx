import { useMemo, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import type {
  MarketMemo as MarketMemoType,
  ScoreBand,
  Source,
  EvidenceTier,
  MemoGap,
  MemoCompetitor,
  CompetitorTier,
} from '../types';
import './muse/muse.css';

interface Props {
  memo: MarketMemoType;
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' as const } },
};

const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
};

const VIEWPORT = { once: true, margin: '-60px' } as const;

const TIER_LABEL: Record<EvidenceTier, string> = {
  fact:     'Fact',
  estimate: 'Estimate',
  analysis: 'Our take',
};

const BAND_AXIS_LABEL: Record<ScoreBand['axis'], string> = {
  saturation:  'How crowded',
  difficulty:  'How hard to start',
  opportunity: 'Your opportunity',
};

const TOP_CONTENDERS = 3;
const STRENGTH_RANK: Record<CompetitorTier, number> = {
  dominant: 0,
  strong:   1,
  moderate: 2,
  niche:    3,
};

const AVATAR_COLORS = [
  'oklch(68% 0.24 268)',
  'oklch(72% 0.18 60)',
  'oklch(68% 0.20 155)',
  'oklch(68% 0.22 22)',
  'oklch(70% 0.22 305)',
  'oklch(70% 0.20 215)',
];

function toneColor(tone: ScoreBand['tone']): string {
  if (tone === 'good') return 'var(--success)';
  if (tone === 'bad')  return 'var(--danger)';
  return 'var(--warning)';
}

/** A citation receipt — mirrors the Muse pill exactly (mono, --signal, square). */
function CitePill({ source }: { source: Source }) {
  return (
    <a className="muse-cite" href={source.url} target="_blank" rel="noopener noreferrer">
      {source.label}
      <ArrowUpRight size={11} strokeWidth={2.25} style={{ marginLeft: 3, opacity: 0.7 }} aria-hidden />
    </a>
  );
}

function SourcesRow({ label = 'grounded in', sources }: { label?: string; sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="muse-sources memo-sources">
      <span className="muse-sources__label">{label}</span>
      <div className="muse-sources__pills">
        {sources.map((s, i) => <CitePill key={`${s.label}-${i}`} source={s} />)}
      </div>
    </div>
  );
}

/** Tier provenance tag — makes the fact/estimate/analysis split visible on the page. */
function TierTag({ tier }: { tier: EvidenceTier }) {
  return <span className={`memo-tier memo-tier--${tier}`}>{TIER_LABEL[tier]}</span>;
}

function SectionHead({ num, name, question }: { num: string; name: string; question: string }) {
  return (
    <div className="memo-section-head">
      <div className="brief-section-header">
        <span className="brief-section-num">{num}</span>
        <span className="brief-section-sep" aria-hidden>·</span>
        <span className="brief-section-name">{name}</span>
      </div>
      <span className="memo-section-q">{question}</span>
    </div>
  );
}

function BandCard({ band }: { band: ScoreBand }) {
  const color = toneColor(band.tone);
  return (
    <motion.div className="memo-band" variants={fadeUp} style={{ '--band-color': color } as React.CSSProperties}>
      <div className="memo-band-axis">{BAND_AXIS_LABEL[band.axis]}</div>
      <div className="memo-band-label" style={{ color }}>{band.label}</div>
      <div className="memo-band-receipt">{band.receipt}</div>
      <div className="memo-band-score">{band.score}<span className="memo-band-denom">/100</span></div>
    </motion.div>
  );
}

/* ── Competitive landscape (restored treatment) ── */

function StrengthIndicator({ tier }: { tier: CompetitorTier }) {
  return (
    <div className={`strength-indicator strength--${tier}`}>
      <div className="strength-dot" />
      <span className="strength-label">{tier}</span>
    </div>
  );
}

function CompName({ c }: { c: MemoCompetitor }) {
  return (
    <a className="memo-comp-link" href={c.url} target="_blank" rel="noopener noreferrer">
      {c.name}
      <ArrowUpRight size={12} strokeWidth={2.25} aria-hidden />
    </a>
  );
}

function CompetitorTable({ competitors }: { competitors: MemoCompetitor[] }) {
  return (
    <table className="competitor-table">
      <thead>
        <tr>
          <th>Company</th>
          <th>What they&apos;re good at</th>
          <th>Where they&apos;re weak</th>
          <th>Where they stand</th>
        </tr>
      </thead>
      <tbody>
        {competitors.map((c, i) => (
          <motion.tr
            key={c.name}
            data-muse-cell={`competitor-${i + 1}`}
            initial={{ opacity: 0, x: -4 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.3, ease: 'easeOut' as const, delay: i * 0.05 }}
          >
            <td>
              <div className="comp-cell">
                <div className="comp-avatar" style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <span>
                  <CompName c={c} />
                  <span className="memo-comp-funding">{c.fundingStage}</span>
                </span>
              </div>
            </td>
            <td><span className="comp-text">{c.strength}</span></td>
            <td><span className="comp-text comp-text--muted">{c.weakness}</span></td>
            <td><StrengthIndicator tier={c.tier} /></td>
          </motion.tr>
        ))}
      </tbody>
    </table>
  );
}

function CompetitorCard({ c, index }: { c: MemoCompetitor; index: number }) {
  return (
    <motion.div
      className={`comp-card comp-card--${c.tier}`}
      data-muse-cell={`competitor-${index + 1}`}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.35, ease: 'easeOut' as const, delay: index * 0.06 }}
    >
      <div className="comp-card-header">
        <div className="comp-avatar comp-avatar--sm" style={{ background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}>
          {c.name.slice(0, 2).toUpperCase()}
        </div>
        <span className="comp-card-name"><CompName c={c} /></span>
        <StrengthIndicator tier={c.tier} />
      </div>
      <div className="comp-card-body">
        <div className="comp-card-field comp-card-field--strength">
          <span className="comp-card-field-label">Good at</span>
          <span className="comp-card-field-value">{c.strength}</span>
        </div>
        <div className="comp-card-field comp-card-field--weakness">
          <span className="comp-card-field-label">Weak spot</span>
          <span className="comp-card-field-value comp-card-field-value--muted">{c.weakness}</span>
        </div>
        <div className="memo-comp-footer">
          <span className="memo-comp-funding">{c.fundingStage}</span>
          <span className="memo-comp-position">{c.position}</span>
        </div>
      </div>
    </motion.div>
  );
}

function CompetitiveLandscape({ competitors }: { competitors: MemoCompetitor[] }) {
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => {
    return competitors
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const r = (STRENGTH_RANK[a.c.tier] ?? 99) - (STRENGTH_RANK[b.c.tier] ?? 99);
        return r !== 0 ? r : a.i - b.i;
      })
      .map(({ c }) => c);
  }, [competitors]);

  const total = sorted.length;
  const visibleCount = showAll ? total : Math.min(TOP_CONTENDERS, total);
  const visible = sorted.slice(0, visibleCount);
  const hiddenCount = total - Math.min(TOP_CONTENDERS, total);
  const hasOverflow = hiddenCount > 0;

  return (
    <>
      <div className="comp-table-desktop table-scroll-wrap">
        <CompetitorTable competitors={visible} />
      </div>
      <div className="comp-cards">
        {visible.map((c, i) => <CompetitorCard key={c.name} c={c} index={i} />)}
      </div>
      {hasOverflow && (
        <div className="comp-disclosure">
          <button
            type="button"
            className="comp-show-more"
            onClick={() => setShowAll(s => !s)}
            aria-expanded={showAll}
          >
            <span className="comp-show-more-label">
              {showAll ? 'Show fewer' : `Show ${hiddenCount} more`}
            </span>
            <ChevronDown
              size={12}
              strokeWidth={2}
              className={`comp-show-more-chev${showAll ? ' is-open' : ''}`}
              aria-hidden
            />
          </button>
        </div>
      )}
    </>
  );
}

/* ── The opening / gaps (restored score + tags) ── */

const SEVERITY_LABEL: Record<MemoGap['severity'], string> = {
  high:   'High',
  medium: 'Medium',
  low:    'Low',
};

/** The gap's opportunity rating — High / Medium / Low. Replaces the precise
 *  count-up score (redundant with this, and a precise integer fought the
 *  bands-not-numbers decision the rest of the memo follows). High opportunity
 *  reads green (good), not red. */
function GapRating({ severity }: { severity: MemoGap['severity'] }) {
  return (
    <div className={`gap-rating gap-rating--${severity}`}>
      <span className="gap-rating-word">{SEVERITY_LABEL[severity]}</span>
      <span className="gap-rating-sub">Opportunity</span>
    </div>
  );
}

function GapBlock({ gap, index }: { gap: MemoGap; index: number }) {
  return (
    <motion.div
      className="gap-row memo-gap-row"
      data-muse-cell={`gap-${index + 1}`}
      variants={fadeUp}
    >
      <div className="memo-gap-body">
        <div className="memo-gap-head">
          <span className="gap-index">Gap {String(index + 1).padStart(2, '0')}</span>
        </div>
        <div className="gap-title">{gap.title}</div>
        <div className="gap-desc">{gap.description}</div>
        <div className="memo-gap-underserved">
          <span className="memo-gap-underserved-label">Who&apos;s left out</span>
          {gap.underserved}
        </div>
        {gap.tags.length > 0 && (
          <div className="gap-tags">
            {gap.tags.map(t => <span key={t} className="gap-tag">{t}</span>)}
          </div>
        )}
        {gap.quotes.length > 0 && (
          <div className="memo-quotes">
            {gap.quotes.map((q, i) => (
              <div className="memo-quote" key={i}>
                <p className="memo-quote-text">{q.quote}</p>
                <CitePill source={q.source} />
              </div>
            ))}
          </div>
        )}
      </div>
      <GapRating severity={gap.severity} />
    </motion.div>
  );
}

export default function MarketMemo({ memo }: Props) {
  return (
    <div className="memo">
      {/* ── Identity ── */}
      <motion.div variants={stagger} initial="hidden" animate="show">
        <motion.div variants={fadeUp}>
          <div className="brief-meta">
            <span className="brief-meta-item brief-meta-item--ref">MARKET MEMO</span>
            <div className="brief-meta-sep" />
            <span className="brief-meta-item">{memo.vertical}</span>
          </div>
          <h1 className="report-title memo-headline">{memo.oneliner}</h1>
          <div className="report-asked">
            <span className="report-asked__label">The idea</span>
            <p className="report-asked__text is-expanded">{memo.idea}</p>
          </div>
        </motion.div>

        {/* ── Bands as hero — the read, with receipts ── */}
        <motion.div className="memo-bands" variants={fadeUp}>
          {memo.bands.map(b => <BandCard key={b.axis} band={b} />)}
        </motion.div>
      </motion.div>

      <div className="divider" />

      {/* ── 01 · Market Size & Growth ── */}
      <motion.section className="section" variants={fadeUp} initial="hidden" whileInView="show" viewport={VIEWPORT}>
        <SectionHead num="01" name="Market Size" question="How big is this market — and is it growing?" />
        <div className="memo-prize">
          <span className="memo-prize-label">Total market size</span>
          <div className="memo-prize-figure">
            <span className="memo-prize-tam">{memo.marketSize.tam}</span>
            <span className="memo-prize-growth">{memo.marketSize.growth}</span>
            <TierTag tier={memo.marketSize.tier} />
          </div>
          <p className="memo-jargon">
            This is the whole pie — all the money spent on this kind of product each year if you reached every possible customer. Investors call it the <strong>TAM</strong> (total addressable market).
          </p>
          {memo.marketSize.note && <p className="memo-note">{memo.marketSize.note}</p>}
          <SourcesRow sources={memo.marketSize.sources} />
        </div>
      </motion.section>

      <div className="divider" />

      {/* ── 02 · Competitive Landscape ── */}
      <motion.section className="section" variants={fadeUp} initial="hidden" whileInView="show" viewport={VIEWPORT}>
        <SectionHead num="02" name="Who Else Is Doing This" question="Who's already out there, and where are they weak?" />
        <CompetitiveLandscape competitors={memo.competitors} />
      </motion.section>

      <div className="divider" />

      {/* ── 03 · Why Now ── */}
      <motion.section className="section" variants={fadeUp} initial="hidden" whileInView="show" viewport={VIEWPORT}>
        <SectionHead num="03" name="Why Now" question="Why is this a good time to start?" />
        <p className="memo-prose">{memo.whyNow.shift}</p>
        <div className="memo-prose-foot">
          <TierTag tier={memo.whyNow.tier} />
          <SourcesRow sources={memo.whyNow.sources} />
        </div>
      </motion.section>

      <div className="divider" />

      {/* ── 04 · The Opening ── */}
      <motion.section className="section" variants={fadeUp} initial="hidden" whileInView="show" viewport={VIEWPORT}>
        <SectionHead num="04" name="Market Gaps" question="What are people missing that you could offer?" />
        <motion.div className="memo-gaps" variants={stagger} initial="hidden" whileInView="show" viewport={VIEWPORT}>
          {memo.gaps.map((g, i) => <GapBlock key={g.title} gap={g} index={i} />)}
        </motion.div>
      </motion.section>

      <div className="divider" />

      {/* ── 05 · Cost to Enter ── */}
      <motion.section className="section" variants={fadeUp} initial="hidden" whileInView="show" viewport={VIEWPORT}>
        <SectionHead num="05" name="What It Takes to Start" question="What will you need to get going?" />
        <div className="memo-cost-list">
          {memo.entryCost.map(f => (
            <div className="memo-cost" key={f.label}>
              <div className="memo-cost-head">
                <span className="memo-cost-label">{f.label}</span>
                <TierTag tier={f.tier} />
              </div>
              <p className="memo-cost-value">{f.value}</p>
              {f.sources && <SourcesRow sources={f.sources} />}
            </div>
          ))}
        </div>
      </motion.section>

      <div className="divider" />

      {/* ── The Read (T3) ── */}
      <motion.section className="section" variants={fadeUp} initial="hidden" whileInView="show" viewport={VIEWPORT}>
        <div className="memo-read-head">
          <span className="memo-read-eyebrow">The Bottom Line</span>
          <TierTag tier="analysis" />
        </div>
        <p className="memo-read-synthesis">{memo.read.synthesis}</p>

        <div className="reco-block memo-reco">
          <div className="reco-eyebrow">
            <ArrowUpRight size={11} strokeWidth={2.5} aria-hidden /> What we&apos;d do
          </div>
          <p className="reco-text">{memo.read.recommendation}</p>
        </div>

        <div className="memo-limit">
          <span className="memo-limit-label">Keep in mind</span>
          <p className="memo-limit-text">{memo.read.limit}</p>
        </div>
      </motion.section>
    </div>
  );
}
