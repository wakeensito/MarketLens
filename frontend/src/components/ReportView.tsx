import { useRef, useEffect, useState } from 'react';
import { motion, useInView, type Variants } from 'framer-motion';
import { TrendingUp, Download, Loader2 } from 'lucide-react';
import type { MarketReport, Competitor, MarketGap, RoadmapPhase } from '../types';
import { exportReport } from '../api';

interface Props {
  report:   MarketReport;
  reportId: string;
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' as const } },
};

const stagger: Variants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.06 } },
};

const VIEWPORT = { once: true, margin: '-60px' } as const;

const AVATAR_COLORS = [
  'oklch(68% 0.24 268)',
  'oklch(72% 0.18 60)',
  'oklch(68% 0.20 155)',
  'oklch(68% 0.22 22)',
  'oklch(70% 0.22 305)',
  'oklch(70% 0.20 215)',
];

function scoreColor(score: number, invert = false): string {
  if (invert) {
    if (score > 65) return 'var(--success)';
    if (score > 40) return 'var(--warning)';
    return 'var(--danger)';
  }
  if (score <= 40) return 'var(--success)';
  if (score <= 65) return 'var(--warning)';
  return 'var(--danger)';
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.4, ease: 'easeOut' as const, delay }}
    >
      {children}
    </motion.div>
  );
}

function BriefSectionHeader({ num, name, count }: { num: string; name: string; count?: string }) {
  return (
    <div className="brief-section-header">
      <span className="brief-section-num">{num}</span>
      <span className="brief-section-dash">—</span>
      <span className="brief-section-name">{name}</span>
      {count && <span className="brief-section-count">{count}</span>}
    </div>
  );
}

function MetricCol({ colLabel, score, statusLabel, invert = false }: {
  colLabel: string;
  score: number;
  statusLabel: string;
  invert?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [displayed, setDisplayed] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const color = scoreColor(score, invert);

  useEffect(() => {
    if (!inView) return;
    let rafId: number;
    let start: number | null = null;
    const duration = 1000;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * score));
      setBarWidth(eased * score);
      if (progress < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [inView, score]);

  return (
    <div className="metric-col" ref={ref}>
      <div className="metric-col-label">{colLabel}</div>
      <div className="metric-number">
        {displayed}<span className="metric-denom">/100</span>
      </div>
      <div className="metric-bar-track">
        <div className="metric-bar-fill" style={{ width: `${barWidth}%`, background: color }} />
      </div>
      <div className="metric-status" style={{ color }}>{statusLabel}</div>
    </div>
  );
}

function StrengthIndicator({ strength }: { strength: Competitor['strength'] }) {
  return (
    <div className={`strength-indicator strength--${strength}`}>
      <div className="strength-dot" />
      <span className="strength-label">{strength}</span>
    </div>
  );
}

function CompetitorTable({ competitors }: { competitors: Competitor[] }) {
  return (
    <table className="competitor-table">
      <thead>
        <tr>
          <th>Company</th>
          <th>Strength</th>
          <th>Weakness</th>
          <th>Market Position</th>
        </tr>
      </thead>
      <tbody>
        {competitors.map((c, i) => (
          <motion.tr
            key={c.name}
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
                <span className="comp-name">{c.name}</span>
              </div>
            </td>
            <td><span className="comp-text">{c.strengthText}</span></td>
            <td><span className="comp-text comp-text--muted">{c.weaknessText}</span></td>
            <td><StrengthIndicator strength={c.strength} /></td>
          </motion.tr>
        ))}
      </tbody>
    </table>
  );
}

function CompetitorCard({ c, index }: { c: Competitor; index: number }) {
  return (
    <motion.div
      className={`comp-card comp-card--${c.strength}`}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.35, ease: 'easeOut' as const, delay: index * 0.06 }}
    >
      <div className="comp-card-header">
        <div className="comp-avatar comp-avatar--sm" style={{ background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}>
          {c.name.slice(0, 2).toUpperCase()}
        </div>
        <span className="comp-card-name">{c.name}</span>
        <StrengthIndicator strength={c.strength} />
      </div>
      <div className="comp-card-body">
        <div className="comp-card-field comp-card-field--strength">
          <span className="comp-card-field-label">Strength</span>
          <span className="comp-card-field-value">{c.strengthText}</span>
        </div>
        <div className="comp-card-field comp-card-field--weakness">
          <span className="comp-card-field-label">Weakness</span>
          <span className="comp-card-field-value comp-card-field-value--muted">{c.weaknessText}</span>
        </div>
      </div>
    </motion.div>
  );
}

function GapScore({ score }: { score: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let rafId: number;
    let start: number | null = null;
    const duration = 700;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * score));
      if (progress < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [inView, score]);

  return (
    <div className="gap-score" ref={ref}>
      <div className="gap-score-num">{displayed}</div>
      <div className="gap-score-sub">Score</div>
    </div>
  );
}

function GapRow({ gap, index }: { gap: MarketGap; index: number }) {
  return (
    <motion.div
      className="gap-row"
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.35, ease: 'easeOut' as const, delay: index * 0.06 }}
    >
      <div>
        <div className="gap-index">Gap {String(index + 1).padStart(2, '0')}</div>
        <div className="gap-title">{gap.title}</div>
        <div className="gap-desc">{gap.description}</div>
        {gap.tags.length > 0 && (
          <div className="gap-tags">
            {gap.tags.map(t => <span key={t} className="gap-tag">{t}</span>)}
          </div>
        )}
      </div>
      <GapScore score={gap.opportunityScore} />
    </motion.div>
  );
}

function RoadmapRow({ phase, index }: { phase: RoadmapPhase; index: number }) {
  return (
    <motion.div
      className="roadmap-phase"
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.35, ease: 'easeOut' as const, delay: index * 0.07 }}
    >
      <div className="roadmap-phase-meta">
        <div className="roadmap-phase-num">Phase {phase.phase}</div>
        <div className="roadmap-phase-title">{phase.title}</div>
      </div>
      <div className="roadmap-milestones">
        {phase.milestones.map((m, i) => (
          <div key={i} className="roadmap-milestone">
            <div className="roadmap-milestone-dot" />
            <span>{m}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function ReportView({ report, reportId }: Props) {
  const [briefId] = useState(() => `MS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`);
  const [dateStr] = useState(() => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  const [exporting,   setExporting]   = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const { download_url } = await exportReport(reportId);
      window.open(download_url, '_blank', 'noopener,noreferrer');
    } catch {
      setExportError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  const variant    = report.saturationScore > 65 ? 'crowded' : report.saturationScore > 40 ? 'moderate' : 'open';
  const badgeText  = variant === 'open' ? 'Open Market' : variant === 'moderate' ? 'Contested Space' : 'Crowded Market';
  const topGap     = report.gaps[0] ?? null;
  const firstPhase = report.roadmap[0] ?? null;

  const difficultyLabel  = report.difficultyScore  > 65 ? 'High Barrier'         : report.difficultyScore  > 40 ? 'Moderate Barrier'    : 'Low Barrier';
  const opportunityLabel = report.opportunityScore > 65 ? 'Strong Opportunity'   : report.opportunityScore > 40 ? 'Moderate Opportunity' : 'Limited';

  return (
    <div className="report">
      <motion.div variants={stagger} initial="hidden" animate="show">

        {/* ── Identity + above-the-fold verdict ── */}
        <motion.div variants={fadeUp}>
          <div className="brief-meta">
            <span className="brief-meta-item brief-meta-item--ref">{briefId}</span>
            <div className="brief-meta-sep" />
            <span className="brief-meta-item">{dateStr}</span>
            <div className="brief-meta-sep" />
            <span className="brief-meta-item">{report.vertical}</span>
          </div>

          <h1 className="report-title">{report.idea}</h1>
          <p className="report-oneliner">{report.oneliner}</p>

          <div className="verdict-row">
            <span className={`verdict-badge verdict-badge--${variant}`}>{badgeText}</span>
          </div>

          {/* Recommendation first — the close */}
          <div className="reco-block">
            <div className="reco-eyebrow">Recommendation</div>
            <p className="reco-text">{report.recommendation}</p>
          </div>
        </motion.div>

        {/* ── 3 signal numbers ── */}
        <motion.div className="hero-metrics" variants={fadeUp}>
          <MetricCol
            colLabel="Market Saturation"
            score={report.saturationScore}
            statusLabel={report.saturationLabel}
          />
          <MetricCol
            colLabel="Entry Difficulty"
            score={report.difficultyScore}
            statusLabel={difficultyLabel}
          />
          <MetricCol
            colLabel="Opportunity"
            score={report.opportunityScore}
            statusLabel={opportunityLabel}
            invert
          />
        </motion.div>

        {/* ── Quick-scan action blocks ── */}
        {topGap && (
          <motion.div className="entry-angle-callout" variants={fadeUp}>
            <div className="entry-angle-eyebrow">↗ Best Entry Angle</div>
            <div className="entry-angle-title">{topGap.title}</div>
            <p className="entry-angle-desc">{topGap.description}</p>
          </motion.div>
        )}

        {firstPhase && (
          <motion.div className="first-move-block" variants={fadeUp}>
            <div className="first-move-eyebrow">First Move — {firstPhase.title}</div>
            <ul className="first-move-list">
              {firstPhase.milestones.map((m, i) => (
                <li key={i} className="first-move-item">{m}</li>
              ))}
            </ul>
          </motion.div>
        )}

      </motion.div>

      <div className="divider" />

      {/* ── Evidence sections ── */}
      <Reveal>
        <div className="section">
          <BriefSectionHeader
            num="01"
            name="Competitive Landscape"
            count={`${report.competitors.length} companies identified`}
          />
          <div className="comp-table-desktop table-scroll-wrap">
            <CompetitorTable competitors={report.competitors} />
          </div>
          <div className="comp-cards">
            {report.competitors.map((c, i) => <CompetitorCard key={c.name} c={c} index={i} />)}
          </div>
        </div>
      </Reveal>

      <div className="divider" />

      <Reveal>
        <div className="section">
          <BriefSectionHeader
            num="02"
            name="Market Gaps & Opportunities"
            count={`${report.gaps.length} gaps identified`}
          />
          <div className="gaps-list">
            {report.gaps.map((g, i) => <GapRow key={g.title} gap={g} index={i} />)}
          </div>
        </div>
      </Reveal>

      <div className="divider" />

      <Reveal>
        <div className="section">
          <BriefSectionHeader num="03" name="Entry Roadmap" />
          <div className="roadmap-list">
            {report.roadmap.map((p, i) => <RoadmapRow key={p.phase} phase={p} index={i} />)}
          </div>
        </div>
      </Reveal>

      <div className="divider" />

      <Reveal>
        <div className="section">
          <BriefSectionHeader num="04" name="Trend Signal" />
          <div className="trend-block">
            <TrendingUp size={13} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
            <p className="trend-text">{report.trendSignal}</p>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="report-footer">
          <span className="report-footer-text">
            {briefId} · Generated {dateStr}
          </span>
          <div className="report-export-group">
            {exportError && <span className="report-export-error">{exportError}</span>}
            <button className="report-export-btn" onClick={handleExport} disabled={exporting}>
              {exporting
                ? <Loader2 size={12} strokeWidth={2} className="spin" />
                : <Download size={12} strokeWidth={2} />}
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
