import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, generateBuildBrief, getBuildBrief } from '../api';
import { adaptBuildBrief } from '../adapter';
import type { BuildBrief } from '../types';
import { MOCK_BUILD_BRIEF } from '../mockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
const PAID_PLANS = new Set(['pro', 'max', 'admin']);
const MOCK_LATENCY_MS = 1200;

export type BuildBriefStatus =
  | 'locked'      // free / anonymous — show the upsell, no network call
  | 'idle'        // paid, not generated yet — show the Generate CTA
  | 'loading'     // fetching a possibly-stored brief on open
  | 'generating'  // a generate/regenerate pass is in flight
  | 'ready'       // a brief is rendered
  | 'error';      // generation failed

export interface UseBuildBriefResult {
  status: BuildBriefStatus;
  brief: BuildBrief | null;
  generatedAt: string | null;
  error: string | null;
  /** True when a regenerate hit the soft daily cap (429). The prior brief, if any, stays visible. */
  capReached: boolean;
  generate: () => void;
  dismissError: () => void;
}

/**
 * Owns the per-report Build Brief: gating, the stored-brief fetch on open, and
 * on-demand generation. The hook is plan-aware (free/anon short-circuit to
 * `locked` with no network), so the generate/gate logic stays out of
 * ReportView, which renders purely from this result.
 */
export function useBuildBrief({
  reportId,
  plan,
}: {
  reportId: string | null;
  plan: string;
}): UseBuildBriefResult {
  const paid = PAID_PLANS.has((plan ?? '').trim().toLowerCase());

  const [status, setStatus] = useState<BuildBriefStatus>('idle');
  const [brief, setBrief] = useState<BuildBrief | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capReached, setCapReached] = useState(false);

  /** Bumps on every reset/regenerate so a late async result can't write stale state. */
  const generationRef = useRef(0);

  // Hydrate on report / plan change.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    generationRef.current += 1;
    const gen = generationRef.current;
    setError(null);
    setCapReached(false);
    setBrief(null);
    setGeneratedAt(null);

    if (!reportId) {
      setStatus('idle');
      return;
    }
    if (!paid) {
      setStatus('locked');
      return;
    }
    if (USE_MOCK) {
      // Start at the Generate CTA so the full flow is demoable.
      setStatus('idle');
      return;
    }

    setStatus('loading');
    (async () => {
      try {
        const res = await getBuildBrief(reportId);
        if (generationRef.current !== gen) return;
        if (res.build_brief_json) {
          setBrief(adaptBuildBrief(res.build_brief_json));
          setGeneratedAt(res.build_brief_generated_at);
          setStatus('ready');
        } else {
          setStatus('idle');
        }
      } catch (e) {
        if (generationRef.current !== gen) return;
        if (e instanceof ApiError && e.status === 403) {
          setStatus('locked'); // backend says free — stale plan in the client
          return;
        }
        // 404 (not generated) or any transient error → let them try generating.
        setStatus('idle');
      }
    })();
  }, [reportId, paid]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const generate = useCallback(() => {
    if (!reportId || !paid) return;
    generationRef.current += 1;
    const gen = generationRef.current;
    setError(null);
    setCapReached(false);
    setStatus('generating');

    (async () => {
      try {
        if (USE_MOCK) {
          await new Promise(r => setTimeout(r, MOCK_LATENCY_MS));
          if (generationRef.current !== gen) return;
          setBrief(MOCK_BUILD_BRIEF);
          setGeneratedAt(new Date().toISOString());
          setStatus('ready');
          return;
        }
        const res = await generateBuildBrief(reportId);
        if (generationRef.current !== gen) return;
        if (res.build_brief_json) {
          setBrief(adaptBuildBrief(res.build_brief_json));
          setGeneratedAt(res.build_brief_generated_at);
          setStatus('ready');
        } else {
          setStatus('error');
          setError('The brief came back empty. Try again in a moment.');
        }
      } catch (e) {
        if (generationRef.current !== gen) return;
        if (e instanceof ApiError && e.status === 429) {
          // Soft daily cap — keep any prior brief visible, surface calmly.
          setCapReached(true);
          setStatus(brief ? 'ready' : 'idle');
          return;
        }
        setStatus('error');
        const msg =
          e instanceof ApiError && e.message
            ? e.message
            : "Couldn't generate the brief. Try again.";
        setError(msg);
      }
    })();
  }, [reportId, paid, brief]);

  const dismissError = useCallback(() => setError(null), []);

  return { status, brief, generatedAt, error, capReached, generate, dismissError };
}
