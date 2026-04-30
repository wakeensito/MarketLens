import { useState, useCallback, useRef, useEffect } from 'react';
import type { AppState, PipelineStage, MarketReport } from '../types';
import { PIPELINE_STAGE_DEFS, TOTAL_PIPELINE_MS, MOCK_REPORT } from '../mockData';
import { createReport, getReport } from '../api';
import { adaptReport } from '../adapter';

const USE_MOCK = !import.meta.env.VITE_API_BASE_URL?.trim();

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS  = 120_000;
const FINALIZING_MS    = 700;

// Maps each completed backend stage → the set of frontend stage IDs that are done
const BACKEND_DONE_MAP: Record<string, string[]> = {
  sanitize:  ['sanitize'],
  parse:     ['sanitize', 'parse'],
  search:    ['sanitize', 'parse', 'search-competitors', 'search-market', 'search-trends'],
  analyse:   ['sanitize', 'parse', 'search-competitors', 'search-market', 'search-trends', 'analyse'],
  score:     ['sanitize', 'parse', 'search-competitors', 'search-market', 'search-trends', 'analyse', 'score'],
  summarise: ['sanitize', 'parse', 'search-competitors', 'search-market', 'search-trends', 'analyse', 'score', 'summarise'],
  assemble:  ['sanitize', 'parse', 'search-competitors', 'search-market', 'search-trends', 'analyse', 'score', 'summarise', 'assemble'],
};

// The frontend stage IDs that become running after each backend stage completes
const BACKEND_RUNNING_MAP: Record<string, string[]> = {
  sanitize:  ['parse'],
  parse:     ['search-competitors', 'search-market', 'search-trends'],
  search:    ['analyse'],
  analyse:   ['score'],
  score:     ['summarise'],
  summarise: ['assemble'],
  assemble:  [],
};

function freshStages(): PipelineStage[] {
  return PIPELINE_STAGE_DEFS.map(def => ({ ...def, status: 'pending' as const, elapsedMs: 0 }));
}

function deriveStages(prev: PipelineStage[], currentStage: string | undefined, allDone: boolean): PipelineStage[] {
  if (allDone) {
    return prev.map(s => ({ ...s, status: 'done' as const, elapsedMs: 0 }));
  }
  if (!currentStage) {
    // Pipeline is running but no stage has completed yet — sanitize is in progress
    return prev.map((s, i) => ({ ...s, status: i === 0 ? ('running' as const) : ('pending' as const), elapsedMs: 0 }));
  }
  const done    = new Set(BACKEND_DONE_MAP[currentStage]    ?? []);
  const running = new Set(BACKEND_RUNNING_MAP[currentStage] ?? []);
  return prev.map(s => {
    const status: PipelineStage['status'] = done.has(s.id) ? 'done' : running.has(s.id) ? 'running' : 'pending';
    return { ...s, status, elapsedMs: 0 };
  });
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

  const pollRef            = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef       = useRef<number>(0);
  // Incremented on every stopAll — async callbacks compare their captured value
  // against the current value to bail out if the analysis was cancelled mid-flight.
  const generationRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const stopAll = useCallback(() => {
    generationRef.current += 1;
    stopPolling();
    if (transitionTimerRef.current !== null) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, [stopPolling]);

  const showReport = useCallback((adapted: MarketReport, id: string) => {
    stopAll();
    const nextGen = generationRef.current;
    setFinalizing(true);
    transitionTimerRef.current = setTimeout(() => {
      if (generationRef.current !== nextGen) return;
      transitionTimerRef.current = null;
      setFinalizing(false);
      setReportId(id);
      setReport(adapted);
      setScreen('report');
    }, FINALIZING_MS);
  }, [stopAll]);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    const gen = generationRef.current;
    pollStartRef.current = Date.now();

    const pollOnce = async () => {
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
          setStages(prev => deriveStages(prev, data.current_stage, true));
          showReport(adaptReport(data.result_json, data.idea_text), id);
        } else if (data.status === 'failed') {
          stopAll();
          setFinalizing(false);
          setError('Analysis failed. Please try again.');
        } else {
          setStages(prev => deriveStages(prev, data.current_stage, false));
          pollRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
        }
      } catch {
        // transient network error — keep polling
        pollRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
      }
    };

    pollRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
  }, [stopPolling, stopAll, showReport]);

  const startAnalysis = useCallback((q: string) => {
    stopAll();
    const gen = generationRef.current;
    setQuery(q);
    setStages(deriveStages(freshStages(), undefined, false));
    setReport(null);
    setError(null);
    setReportId(null);
    setFinalizing(false);
    setScreen('analysis');

    if (USE_MOCK) {
      const mockId = `mock-${Date.now()}`;
      transitionTimerRef.current = setTimeout(() => {
        if (generationRef.current !== gen) return;
        transitionTimerRef.current = null;
        showReport(adaptReport(MOCK_REPORT, q), mockId);
      }, TOTAL_PIPELINE_MS + 1200);
    } else {
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
    }
  }, [stopAll, startPolling, showReport]);

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
