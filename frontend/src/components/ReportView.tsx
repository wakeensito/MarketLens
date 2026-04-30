import { useRef, useEffect, useState } from 'react';
import { motion, useInView, type Variants } from 'framer-motion';
import { TrendingUp, AlertTriangle, Download, Loader2 } from 'lucide-react';
import type { MarketReport, Competitor, MarketGap, RoadmapPhase, MarketStat } from '../types';
import SaturationGauge from './SaturationGauge';
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
  show:   { transition: { staggerChildren: 0.07 } },
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

function StatCard({ stat, delay }: { stat: MarketStat; delay: number }) {
  return (
    <motion.div
      className="stat-card"
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.35, ease: 'easeOut' as const, delay }}
    >
      <div className="stat-label">{stat.label}</div>
      <div className="stat-value">{stat.value}</div>
      <div className={`stat-change stat-change--${stat.direction}`}>
        {stat.direction === 'up' && '↑ '}
        {stat.direction === 'down' && '↓ '}
        {stat.change}
      </div>
    </motion.div>
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
          <th>Category</th>
          <th>Funding</th>
          <th>User Base</th>
          <th>Presence</th>
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
                <div>
                  <span className="comp-name">{c.name}</span>
                  <span className="comp-tagline">{c.tagline}</span>
                </div>
              </div>
            </td>
            <td><span className="comp-category-tag">{c.category}</span></td>
            <td><span className="comp-mono">{c.funding}</span></td>
            <td><span className="comp-mono">{c.userBase}</span></td>
            <td><StrengthIndicator strength={c.strength} /></td>
          </motion.tr>
        ))}
      </tbody>
    </table>
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
        <div className="gap-tags">
          {gap.tags.map(t => <span key={t} className="gap-tag">{t}</span>)}
        </div>
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
        <div className="roadmap-phase-badges">
          <span className="roadmap-badge">{phase.timeline}</span>
          <span className="roadmap-badge">{phase.investment}</span>
        </div>
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

function VerdictDeclaration({ score }: { score: number }) {
  const variant  = score > 65 ? 'crowded' : score > 40 ? 'moderate' : 'open';
  const statement =
    variant === 'open'     ? 'This market has meaningful whitespace.' :
    variant === 'moderate' ? 'This space is contested — not closed.' :
                             'This market is densely occupied.';
  const body =
    variant === 'open'     ? 'Early movers with a focused differentiation strategy can establish defensible territory before the space consolidates.' :
    variant === 'moderate' ? 'A niche wedge or execution advantage can carve out a sustainable position. Timing and distribution matter most.' :
                             'Entering requires a genuine wedge — a distribution channel, regulatory angle, or underserved segment that incumbents have missed.';

  return (
    <div className="verdict-declaration">
      <div className="verdict-finding-label">Primary Finding</div>
      <div className={`verdict-statement verdict-statement--${variant}`}>{statement}</div>
      <p className="verdict-body-text">{body}</p>
    </div>
  );
}

export default function ReportView({ report, reportId }: Props) {
  const [briefId]    = useState(() => `MS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`);
  const [dateStr]    = useState(() => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  const [exporting,    setExporting]    = useState(false);
  const [exportError,  setExportError]  = useState<string | null>(null);

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

  return (
    <div className="report">
      <motion.div variants={stagger} initial="hidden" animate="show">
        <motion.div variants={fadeUp}>
          {/* Briefing metadata */}
          <div className="brief-meta">
            <span className="brief-meta-item brief-meta-item--ref">{briefId}</span>
            <div className="brief-meta-sep" />
            <span className="brief-meta-item">{dateStr}</span>
            <div className="brief-meta-sep" />
            <span className="brief-meta-item">Full Spectrum Analysis</span>
          </div>

          <div className="report-overline">{report.vertical}</div>
          <h1 className="report-title">{report.idea}</h1>
          <p className="report-oneliner">{report.oneliner}</p>
        </motion.div>

        {/* Typographic verdict — the signature element */}
        <motion.div variants={fadeUp}>
          <VerdictDeclaration score={report.saturationScore} />
        </motion.div>

        <motion.div className="report-hero" variants={fadeUp}>
          <SaturationGauge score={report.saturationScore} label={report.saturationLabel} />
          <div className="stats-grid">
            {report.keyStats.map((stat, i) => (
              <StatCard key={stat.label} stat={stat} delay={i * 0.05} />
            ))}
          </div>
        </motion.div>
      </motion.div>

      <div className="divider" />

      <Reveal>
        <div className="section">
          <BriefSectionHeader
            num="01"
            name="Competitive Landscape"
            count={`${report.competitors.length} companies identified`}
          />
          <CompetitorTable competitors={report.competitors} />
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
          <BriefSectionHeader num="04" name="Signals & Recommendation" />
          <div className="bottom-cards">
            <div className="bottom-card bottom-card--trend">
              <div className="bottom-card-eyebrow">
                <TrendingUp size={11} strokeWidth={2.5} />
                Trend Signal
              </div>
              <p className="bottom-card-text">{report.trendSignal}</p>
            </div>
            <div className="bottom-card bottom-card--reco">
              <div className="bottom-card-eyebrow">
                <AlertTriangle size={11} strokeWidth={2.5} />
                Our Recommendation
              </div>
              <p className="bottom-card-text">{report.recommendation}</p>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="report-footer">
          <span className="report-footer-text">
            {briefId} · Generated {dateStr} · MarketLens Intelligence Engine
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
