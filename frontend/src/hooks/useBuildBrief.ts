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
  /** True when the user is free and has not yet spent their one lifetime sample. */
  freeTaste: boolean;
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
  const [freeTaste, setFreeTaste] = useState(false);

  /** Bumps on every reset/regenerate so a late async result can't write stale state. */
  const generationRef = useRef(0);

  // Hydrate on report / plan change.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    generationRef.current += 1;
    const gen = generationRef.current;
    setError(null);
    setBrief(null);
    setGeneratedAt(null);
    setFreeTaste(false);

    if (!reportId) {
      setStatus('idle');
      return;
    }

    if (USE_MOCK) {
      // Paid → idle; free → idle + freeTaste so the free CTA is demoable.
      setStatus('idle');
      if (!paid) setFreeTaste(true);
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
        } else if (paid) {
          setStatus('idle');
        } else {
          // Free user, no brief yet: check whether they have their sample left.
          // Explicit === true: absent/undefined means "not yet spent" (sample available).
          if (res.free_brief_used === true) {
            setStatus('locked');
          } else {
            setStatus('idle');
            setFreeTaste(true);
          }
        }
      } catch (e) {
        if (generationRef.current !== gen) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setStatus('locked');
          return;
        }
        // 404 (not generated) or any transient error → let them try generating if paid,
        // otherwise fail closed to the upsell (can't confirm taste availability).
        setStatus(paid ? 'idle' : 'locked');
      }
    })();
  }, [reportId, paid]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const generate = useCallback(() => {
    if (!reportId || (!paid && !freeTaste)) return;
    generationRef.current += 1;
    const gen = generationRef.current;
    setError(null);
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
        if (e instanceof ApiError && e.status === 403) {
          // Free sample already spent (race or concurrent tab).
          setStatus('locked');
          setFreeTaste(false);
          return;
        }
        // Clear the free-sample flag on failure so the invariant "freeTaste is
        // only true on an unused idle CTA" can't drift if an error→idle path is
        // added later. A re-hydrate restores it from the server.
        setFreeTaste(false);
        setStatus('error');
        const msg =
          e instanceof ApiError && e.message
            ? e.message
            : "Couldn't generate the brief. Try again.";
        setError(msg);
      }
    })();
  }, [reportId, paid, freeTaste]);

  const dismissError = useCallback(() => setError(null), []);

  return { status, brief, generatedAt, error, freeTaste, generate, dismissError };
}
