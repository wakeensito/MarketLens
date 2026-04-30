import { useState, useCallback, useRef, useEffect } from 'react';
import type { AppState, PipelineStage, MarketReport } from '../types';
import { PIPELINE_STAGE_DEFS, TOTAL_PIPELINE_MS } from '../mockData';
import { createReport, getReport } from '../api';
import { adaptReport } from '../adapter';

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS  = 120_000;

function freshStages(): PipelineStage[] {
  return PIPELINE_STAGE_DEFS.map(def => ({ ...def, status: 'pending' as const, elapsedMs: 0 }));
}

export interface AnalysisState {
  screen:        AppState;
  query:         string;
  stages:        PipelineStage[];
  report:        MarketReport | null;
  error:         string | null;
  reportId:      string | null;
  finalizing:    boolean;
  startAnalysis: (q: string) => void;
  handleReset:   () => void;
  handleRetry:   () => void;
}

export function useAnalysis(): AnalysisState {
  const [screen,     setScreen]     = useState<AppState>('landing');
  const [query,      setQuery]      = useState('');
  const [stages,     setStages]     = useState<PipelineStage[]>(freshStages);
  const [report,     setReport]     = useState<MarketReport | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [reportId,   setReportId]   = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const rafRef        = useRef<number | null>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef  = useRef<number>(0);
  const startRef      = useRef<number>(0);
  // Incremented on every stopAll — async callbacks compare their captured value
  // against the current value to bail out if the analysis was cancelled mid-flight.
  const generationRef = useRef(0);

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const stopAll = useCallback(() => {
    generationRef.current += 1;
    stopAnimation();
    stopPolling();
  }, [stopAnimation, stopPolling]);

  const runAnimation = useCallback(() => {
    stopAnimation();
    startRef.current = performance.now();

    const tick = () => {
      const elapsed = performance.now() - startRef.current;

      setStages(prev =>
        prev.map(stg => {
          const { startMs, durationMs } = stg;
          if (elapsed < startMs)              return { ...stg, status: 'pending' as const, elapsedMs: 0 };
          if (elapsed < startMs + durationMs) return { ...stg, status: 'running' as const, elapsedMs: Math.round(elapsed - startMs) };
          return { ...stg, status: 'done' as const, elapsedMs: durationMs };
        })
      );

      if (elapsed < TOTAL_PIPELINE_MS) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setFinalizing(true);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [stopAnimation]);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    const gen = generationRef.current;
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      if (generationRef.current !== gen) return;

      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        stopAll();
        setFinalizing(false);
        setError('Analysis timed out. Please try again.');
        return;
      }

      try {
        const data = await getReport(id);
        if (generationRef.current !== gen) return;

        if (data.status === 'complete' && data.result_json) {
          stopAll();
          setFinalizing(false);
          setReport(adaptReport(data.result_json, data.idea_text));
          setScreen('report');
        } else if (data.status === 'failed') {
          stopAll();
          setFinalizing(false);
          setError('Analysis failed. Please try again.');
        }
      } catch {
        // transient network error — keep polling
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, stopAll]);

  const startAnalysis = useCallback((q: string) => {
    stopAll();
    const gen = generationRef.current;
    setQuery(q);
    setStages(freshStages());
    setReport(null);
    setError(null);
    setReportId(null);
    setFinalizing(false);
    setScreen('analysis');
    runAnimation();

    createReport(q)
      .then(data => {
        if (generationRef.current !== gen) return;
        setReportId(data.report_id);
        startPolling(data.report_id);
      })
      .catch(() => {
        if (generationRef.current !== gen) return;
        stopAll();
        setFinalizing(false);
        setError('Failed to start analysis. Please try again.');
      });
  }, [stopAll, runAnimation, startPolling]);

  const handleReset = useCallback(() => {
    stopAll();
    setScreen('landing');
    setQuery('');
    setStages(freshStages());
    setReport(null);
    setError(null);
    setReportId(null);
    setFinalizing(false);
  }, [stopAll]);

  const handleRetry = useCallback(() => {
    if (query) startAnalysis(query);
  }, [query, startAnalysis]);

  useEffect(() => () => stopAll(), [stopAll]);

  return {
    screen, query, stages, report, error, reportId, finalizing,
    startAnalysis, handleReset, handleRetry,
  };
}
