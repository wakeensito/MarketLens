import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  score: number;
  label: string;
  animate?: boolean;
}

function scoreColor(score: number): string {
  if (score <= 40) return 'var(--success)';
  if (score <= 65) return 'var(--warning)';
  return 'var(--danger)';
}

export default function SaturationGauge({ score, label, animate = true }: Props) {
  const [displayed, setDisplayed] = useState(animate ? 0 : score);
  const [barWidth, setBarWidth] = useState(animate ? 0 : score);
  const color = scoreColor(score);

  useEffect(() => {
    if (!animate) { setDisplayed(score); setBarWidth(score); return; }

    let start: number | null = null;
    const duration = 1200;

    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(eased * score));
      setBarWidth(eased * score);
      if (progress < 1) requestAnimationFrame(step);
    };

    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score, animate]);

  const scoreClass = score <= 40 ? 'score-card--low' : score <= 65 ? 'score-card--mid' : 'score-card--high';

  return (
    <div className={`score-card ${scoreClass}`}>
      <div className="score-card-label">Saturation Index</div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' as const }}
      >
        <div className="score-number">
          {displayed}
          <span className="score-denom">/100</span>
        </div>
        <div className="score-status-label" style={{ color }}>
          {label}
        </div>
        <div className="score-bar-track">
          <div
            className="score-bar-fill"
            style={{ width: `${barWidth}%`, background: color }}
          />
        </div>
      </motion.div>
    </div>
  );
}
