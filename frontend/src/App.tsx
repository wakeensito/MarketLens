import { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import LandingScreen from './components/LandingScreen';
import Header from './components/Header';
import PipelineTracker from './components/PipelineTracker';
import ReportView from './components/ReportView';
import type { AppState, PipelineStage } from './types';
import { PIPELINE_STAGE_DEFS, TOTAL_PIPELINE_MS, MOCK_REPORT } from './mockData';

function freshStages(): PipelineStage[] {
  return PIPELINE_STAGE_DEFS.map(def => ({ ...def, status: 'pending', elapsedMs: 0 }));
}

export default function App() {
  const [screen, setScreen] = useState<AppState>('landing');
  const [query, setQuery]   = useState('');
  const [stages, setStages] = useState<PipelineStage[]>(freshStages);
  const rafRef  = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const stopPipeline = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const runPipeline = useCallback((onDone: () => void) => {
    stopPipeline();
    startRef.current = performance.now();

    const tick = () => {
      const elapsed = performance.now() - startRef.current;

      setStages(prev =>
        prev.map(stg => {
          const { startMs, durationMs } = stg;
          if (elapsed < startMs)              return { ...stg, status: 'pending', elapsedMs: 0 };
          if (elapsed < startMs + durationMs) return { ...stg, status: 'running', elapsedMs: Math.round(elapsed - startMs) };
          return { ...stg, status: 'done', elapsedMs: durationMs };
        })
      );

      if (elapsed < TOTAL_PIPELINE_MS) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onDone();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startAnalysis = useCallback((q: string) => {
    setQuery(q);
    setStages(freshStages());
    setScreen('analysis');
    runPipeline(() => setScreen('report'));
  }, [runPipeline]);

  const handleReset = useCallback(() => {
    stopPipeline();
    setScreen('landing');
    setQuery('');
    setStages(freshStages());
  }, []);

  useEffect(() => stopPipeline, []);

  const isWorkspace = screen === 'analysis' || screen === 'report';

  return (
    <div className="app">
      <AnimatePresence mode="wait">
        {screen === 'landing' && (
          <LandingScreen key="landing" onSearch={startAnalysis} />
        )}

        {isWorkspace && (
          <motion.div
            key="workspace"
            className="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.35 }}
          >
            <Header query={query} onReset={handleReset} />

            <div className="workspace-main">
              <AnimatePresence mode="wait">
                {screen === 'analysis' ? (
                  <motion.div
                    key="pipeline"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  >
                    <PipelineTracker stages={stages} query={query} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="report"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    <ReportView
                      report={{ ...MOCK_REPORT, idea: query || MOCK_REPORT.idea }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
