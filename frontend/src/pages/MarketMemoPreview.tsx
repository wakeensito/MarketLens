import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandWordmarkInner } from '../components/BrandWordmark';
import { ThemePicker } from '../components/ThemePicker';
import MarketMemo from '../components/MarketMemo';
import { MOCK_MEMO } from '../mockData';
import { adaptMemo } from '../adapterMemo';
import { getReport } from '../api';
import type { MarketMemo as MarketMemoType } from '../types';

/** Isolated prototype route (/memo). Three data sources, in priority order:
 *  1. sessionStorage "memoPreviewJson" — paste a result_json in devtools for
 *     auth-free local testing (set it, then reload /memo).
 *  2. ?report=<id> — fetch a real report (requires the auth cookie, so run on
 *     the deployed/authenticated origin).
 *  3. MOCK_MEMO — default mock data.
 *  Dev-only; not linked from the app. */
type State =
  | { kind: 'mock' }
  | { kind: 'loading'; id: string }
  | { kind: 'ready'; memo: MarketMemoType; label: string }
  | { kind: 'error'; message: string };

/** Decide the initial source synchronously (sessionStorage / ?report / mock) so
 *  we never call setState inside an effect for the non-async paths. Only the
 *  `?report=<id>` path defers to the async fetch in the effect below. */
function initialState(): State {
  const blob = sessionStorage.getItem('memoPreviewJson');
  if (blob) {
    try {
      const json = JSON.parse(blob);
      return {
        kind: 'ready',
        memo: adaptMemo(json, json.idea_text ?? 'Pasted report'),
        label: 'sessionStorage',
      };
    } catch {
      return { kind: 'error', message: 'sessionStorage "memoPreviewJson" is not valid JSON.' };
    }
  }
  const id = new URLSearchParams(window.location.search).get('report');
  return id ? { kind: 'loading', id } : { kind: 'mock' };
}

export default function MarketMemoPreview() {
  const [state, setState] = useState<State>(initialState);

  // Async path only: fetch the real report when we started in `loading`.
  useEffect(() => {
    if (state.kind !== 'loading') return;
    const id = state.id;
    let cancelled = false;
    getReport(id)
      .then(r => {
        if (cancelled) return;
        if (r.status !== 'complete' || !r.result_json) {
          setState({ kind: 'error', message: `Report ${id} is "${r.status}" — not complete yet.` });
          return;
        }
        setState({ kind: 'ready', memo: adaptMemo(r.result_json, r.idea_text), label: `report ${id}` });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setState({ kind: 'error', message: `Could not load report ${id}: ${msg}. (Real reports need the auth cookie — run on the deployed origin, or use the sessionStorage override.)` });
      });
    return () => { cancelled = true; };
    // Runs once: the initial state already decided loading-vs-not; state only
    // transitions loading → ready/error (never back to loading).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flag =
    state.kind === 'ready' ? `prototype · ${state.label}`
    : state.kind === 'loading' ? 'prototype · loading…'
    : state.kind === 'error' ? 'prototype · error'
    : 'prototype · mock data';

  return (
    <div className="memo-preview-shell">
      <header className="memo-preview-nav">
        <Link to="/" className="memo-preview-home" aria-label="Back to plinths">
          <BrandWordmarkInner variant="header" />
        </Link>
        <div className="memo-preview-nav-right">
          <span className="memo-preview-flag">{flag}</span>
          <ThemePicker />
        </div>
      </header>
      <main className="memo-preview-main">
        {state.kind === 'mock' && <MarketMemo memo={MOCK_MEMO} />}
        {state.kind === 'ready' && <MarketMemo memo={state.memo} />}
        {state.kind === 'loading' && <p className="memo-preview-status">Loading report {state.id}…</p>}
        {state.kind === 'error' && <p className="memo-preview-status memo-preview-status--error">{state.message}</p>}
      </main>
    </div>
  );
}
