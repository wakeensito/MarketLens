import { motion } from 'framer-motion';
import { Check, Loader2, Minus } from 'lucide-react';
import type { PipelineStage, StageStatus } from '../types';

interface Props {
  stages: PipelineStage[];
  query: string;
}

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === 'done')    return <Check    size={12} strokeWidth={2.5} color="var(--success)" />;
  if (status === 'running') return <Loader2  size={12} strokeWidth={2}   color="var(--accent)"  className="spin" />;
  return <Minus size={10} strokeWidth={2} color="var(--text-muted)" />;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StageRow({ stage }: { stage: PipelineStage }) {
  const isRunning = stage.status === 'running';
  const isDone    = stage.status === 'done';
  const progress  = isRunning ? Math.min((stage.elapsedMs / stage.durationMs) * 100, 97) : (isDone ? 100 : 0);

  return (
    <div className={`pipeline-stage stage--${stage.status}`}>
      <div className={`stage-indicator stage-indicator--${stage.status}`}>
        <StatusIcon status={stage.status} />
      </div>
      <div className="stage-body">
        <div className="stage-row">
          <span className={`stage-label stage-label--${stage.status}`}>{stage.label}</span>
          {isDone    && <span className="stage-elapsed stage-elapsed--done">{formatMs(stage.durationMs)}</span>}
          {isRunning && <span className="stage-elapsed stage-elapsed--running">{formatMs(stage.elapsedMs)}</span>}
        </div>
        <div className="stage-desc">{stage.description}</div>
        {isRunning && (
          <div className="stage-progress">
            <div className="stage-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function ParallelBlock({ stages }: { stages: PipelineStage[] }) {
  const groupStatus: StageStatus =
    stages.every(s => s.status === 'done')   ? 'done'    :
    stages.some(s  => s.status === 'running') ? 'running' : 'pending';

  const isRunning = groupStatus === 'running';
  const isDone    = groupStatus === 'done';

  return (
    <div className={`pipeline-parallel-block block--${groupStatus}`}>
      <div className="parallel-label-row">
        <div className={`parallel-label-indicator parallel-label-indicator--${groupStatus}`}>
          <StatusIcon status={groupStatus} />
        </div>
        <span className={`parallel-stage-label parallel-stage-label--${isRunning || isDone ? 'running' : 'pending'}`}>
          {stages[0]?.parallelGroupLabel ?? 'Parallel Research'}
        </span>
        {isDone    && <span className="stage-elapsed stage-elapsed--done">{formatMs(Math.max(...stages.map(s => s.durationMs)))}</span>}
        {isRunning && <span className="stage-elapsed stage-elapsed--running">{formatMs(Math.max(...stages.map(s => s.elapsedMs)))}</span>}
      </div>

      <div className="parallel-cards-row">
        {stages.map(stage => {
          const sr = stage.status === 'running';
          const sd = stage.status === 'done';
          const progress = sr ? Math.min((stage.elapsedMs / stage.durationMs) * 100, 97) : (sd ? 100 : 0);

          return (
            <div key={stage.id} className={`parallel-mini-card parallel-mini-card--${stage.status}`}>
              <div className="mini-card-top">
                <div className={`mini-card-icon mini-card-icon--${stage.status}`}>
                  <StatusIcon status={stage.status} />
                </div>
                <span className={`mini-card-name mini-card-name--${stage.status}`}>{stage.label}</span>
                {(sr || sd) && (
                  <span className={`mini-card-elapsed mini-card-elapsed--${stage.status}`}>
                    {sd ? formatMs(stage.durationMs) : formatMs(stage.elapsedMs)}
                  </span>
                )}
              </div>
              <div className="mini-card-desc">{stage.description}</div>
              {sr && (
                <div className="stage-progress" style={{ marginTop: 7 }}>
                  <div className="stage-progress-fill" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PipelineTracker({ stages, query }: Props) {
  const rendered: React.ReactNode[] = [];
  const seenGroups = new Set<string>();

  stages.forEach(stage => {
    if (stage.parallelGroup) {
      if (!seenGroups.has(stage.parallelGroup)) {
        seenGroups.add(stage.parallelGroup);
        const groupStages = stages.filter(s => s.parallelGroup === stage.parallelGroup);
        rendered.push(<ParallelBlock key={stage.parallelGroup} stages={groupStages} />);
      }
    } else {
      rendered.push(<StageRow key={stage.id} stage={stage} />);
    }
  });

  return (
    <motion.div
      className="pipeline"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' as const }}
    >
      <div className="pipeline-header">
        <h2 className="pipeline-title">Generating intelligence report…</h2>
        <div className="pipeline-query-row">
          Analysing <span className="pipeline-query-text" style={{ marginLeft: 4 }}>"{query}"</span>
        </div>
      </div>
      <div className="pipeline-stages">{rendered}</div>
    </motion.div>
  );
}
