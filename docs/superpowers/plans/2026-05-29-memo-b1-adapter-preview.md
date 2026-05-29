# Plan B1 — Memo adapter + real-data preview

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Let us *see* real pipeline output rendered in the memo, without touching the live report tab — build `adaptMemo(result_json → MarketMemo)` and point the isolated `/memo` preview at real reports.

**Architecture:** A pure `adaptMemo` adapter (mirrors the existing `adapter.ts` pattern) maps the additive v2 `result_json` to the `MarketMemo` frontend type, with graceful fallbacks so it also renders *legacy* reports (synthesizes bands from legacy scores, etc.). The `/memo` preview gains a real-data mode: `?report=<id>` fetches via the existing `getReport`, and a `sessionStorage` escape hatch allows auth-free local testing by pasting a `result_json`. Verification is `bun run build` (project norm per CLAUDE.md) plus visual inspection after deploy.

**Tech Stack:** React + Vite + TypeScript (verbatimModuleSyntax ON — use `import type`), bun.

**Verification note:** No frontend test runner exists; CLAUDE.md names `bun run build` as the verification step. Each task ends with `bun run build` (from `frontend/`). The adapter's *shape* correctness is enforced by `tsc` (it must return `MarketMemo`); *value* correctness is verified visually once real data renders.

---

### Task 1: v2 result_json types + `adaptMemo`

**Files:**
- Modify: `frontend/src/api.ts` (add optional v2 fields/types — additive, matches the additive backend)
- Create: `frontend/src/adapterMemo.ts`

- [ ] **Step 1: Add optional v2 types to `api.ts`.** Add these interfaces near the other backend types, and extend the existing ones. Keep everything OPTIONAL so legacy reports still satisfy the type.

```typescript
export interface SourceJson { label: string; url: string }
export interface BandJson {
  axis: 'saturation' | 'difficulty' | 'opportunity';
  label: string; receipt: string; score: number | string; tone: string;
}
export interface MarketJson { tam: string; growth: string; note?: string; tier: string; sources: SourceJson[] }
export interface WhyNowJson { shift: string; tier: string; sources: SourceJson[] }
export interface EntryCostJson { label: string; value: string; tier: string; sources?: SourceJson[] }
export interface ReadJson { synthesis: string; recommendation: string; limit: string }
export interface GapQuoteJson { quote: string; source: SourceJson }
```

Extend `BackendCompetitor` (add optional v2 fields):
```typescript
export interface BackendCompetitor {
  name: string;
  strength: string;
  weakness: string;
  market_position: string;
  funding_stage?: string;   // v2
  url?: string;             // v2
}
```

Extend `BackendGap`:
```typescript
export interface BackendGap {
  title: string;
  description: string;
  severity?: string;            // v2
  underserved?: string;         // v2
  opportunity_score?: number | string; // v2
  tags?: string[];              // v2
  quotes?: GapQuoteJson[];      // v2
}
```

Extend `ResultJson` (add optional v2 keys — leave all existing keys):
```typescript
  // --- v2 (Market Memo) additive keys ---
  bands?: BandJson[];
  market?: MarketJson;
  why_now?: WhyNowJson;
  entry_cost?: EntryCostJson[];
  read?: ReadJson;
```

- [ ] **Step 2: Create `frontend/src/adapterMemo.ts`** with this exact content:

```typescript
import type {
  MarketMemo, ScoreBand, BandTone, EvidenceTier, Source,
  MemoCompetitor, CompetitorTier, MemoGap, GapSeverity,
  EntryCostFactor, MemoRead,
} from './types';
import type { ResultJson, BackendCompetitor, BackendGap, SourceJson } from './api';

const TONES: BandTone[] = ['good', 'mixed', 'bad'];
const TIERS: EvidenceTier[] = ['fact', 'estimate', 'analysis'];
const SEVERITIES: GapSeverity[] = ['high', 'medium', 'low'];

function clampScore(raw: number | string | undefined, fallback = 0): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  return isNaN(n) ? fallback : Math.min(100, Math.max(0, n));
}
function asTone(v: unknown): BandTone {
  return TONES.includes(v as BandTone) ? (v as BandTone) : 'mixed';
}
function asTier(v: unknown): EvidenceTier {
  return TIERS.includes(v as EvidenceTier) ? (v as EvidenceTier) : 'estimate';
}
function asSeverity(v: unknown): GapSeverity {
  return SEVERITIES.includes(v as GapSeverity) ? (v as GapSeverity) : 'medium';
}
function asSources(arr: SourceJson[] | undefined): Source[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(s => ({ label: String(s?.label ?? ''), url: String(s?.url ?? '') }))
    .filter(s => s.url);
}

// Derive threat tier from a market-position phrase (mirrors adapter.ts competitorStrength).
function competitorTier(position: string): CompetitorTier {
  const p = position.toLowerCase();
  if (p.includes('leader') || p.includes('leading') || p.includes('dominant')) return 'dominant';
  if (p.includes('major') || p.includes('prominent') || p.includes('strong')) return 'strong';
  if (p.includes('growing') || p.includes('emerging') || p.includes('niche')) return 'niche';
  return 'moderate';
}

const AXES: ScoreBand['axis'][] = ['saturation', 'difficulty', 'opportunity'];
function fallbackLabel(axis: ScoreBand['axis'], s: number): string {
  if (axis === 'saturation') return s <= 24 ? 'Wide open' : s <= 49 ? 'Some players' : s <= 74 ? 'Competitive' : 'Crowded';
  if (axis === 'difficulty') return s <= 24 ? 'Easy start' : s <= 49 ? 'Manageable' : s <= 74 ? 'Challenging' : 'Very hard';
  return s <= 24 ? 'Limited' : s <= 49 ? 'Modest' : s <= 74 ? 'Strong' : 'Excellent';
}
function fallbackTone(axis: ScoreBand['axis'], s: number): BandTone {
  if (axis === 'opportunity') return s > 65 ? 'good' : s > 40 ? 'mixed' : 'bad';
  return s <= 40 ? 'good' : s <= 65 ? 'mixed' : 'bad';
}
function fallbackBands(json: ResultJson): ScoreBand[] {
  const scores: Record<ScoreBand['axis'], number> = {
    saturation: clampScore(json.saturation_score),
    difficulty: clampScore(json.difficulty_score),
    opportunity: clampScore(json.opportunity_score),
  };
  return AXES.map(axis => ({
    axis,
    label: axis === 'saturation' && json.saturation_label
      ? json.saturation_label : fallbackLabel(axis, scores[axis]),
    receipt: '',
    score: scores[axis],
    tone: fallbackTone(axis, scores[axis]),
  }));
}

export function adaptMemo(json: ResultJson, ideaText: string): MarketMemo {
  const bands: ScoreBand[] = Array.isArray(json.bands) && json.bands.length
    ? json.bands.map(b => ({
        axis: b.axis,
        label: String(b.label ?? ''),
        receipt: String(b.receipt ?? ''),
        score: clampScore(b.score),
        tone: asTone(b.tone),
      }))
    : fallbackBands(json);

  const m = json.market;
  const marketSize = {
    tam: String(m?.tam ?? (json.market_size || 'Unknown')),
    growth: String(m?.growth ?? ''),
    note: m?.note ? String(m.note) : undefined,
    tier: asTier(m?.tier),
    sources: asSources(m?.sources),
  };

  const competitors: MemoCompetitor[] = (json.competitors ?? []).map((c: BackendCompetitor) => {
    const position = c.market_position ?? '';
    return {
      name: c.name,
      tier: competitorTier(position),
      strength: c.strength ?? '',
      weakness: c.weakness ?? '',
      position,
      fundingStage: c.funding_stage ?? 'unknown',
      url: c.url ?? '',
    };
  });

  const whyNow = {
    shift: String(json.why_now?.shift ?? json.trend_signal ?? ''),
    tier: asTier(json.why_now?.tier),
    sources: asSources(json.why_now?.sources),
  };

  const gaps: MemoGap[] = (json.gaps ?? []).map((g: BackendGap) => ({
    title: g.title ?? '',
    description: g.description ?? '',
    severity: asSeverity(g.severity),
    underserved: g.underserved ?? '',
    opportunityScore: clampScore(g.opportunity_score, 50),
    tags: Array.isArray(g.tags) ? g.tags.map(String) : [],
    quotes: Array.isArray(g.quotes)
      ? g.quotes
          .filter(q => q && q.quote)
          .map(q => ({
            quote: String(q.quote),
            source: { label: String(q.source?.label ?? ''), url: String(q.source?.url ?? '') },
          }))
      : [],
  }));

  const entryCost: EntryCostFactor[] = (json.entry_cost ?? []).map(f => ({
    label: f.label ?? '',
    value: f.value ?? '',
    tier: asTier(f.tier),
    sources: asSources(f.sources),
  }));

  const read: MemoRead = json.read
    ? {
        synthesis: String(json.read.synthesis ?? ''),
        recommendation: String(json.read.recommendation ?? ''),
        limit: String(json.read.limit ?? ''),
      }
    : {
        synthesis: json.oneliner ?? '',
        recommendation: json.recommendation ?? '',
        limit: 'This is an AI-generated read of public information, not advice. Figures are estimates.',
      };

  const verticalParts = [json.vertical, json.geography, json.business_model].filter(Boolean);

  return {
    idea: ideaText,
    vertical: verticalParts.join(' · ') || (json.vertical ?? ''),
    oneliner: json.oneliner ?? '',
    bands,
    marketSize,
    competitors,
    whyNow,
    gaps,
    entryCost,
    read,
  };
}
```

- [ ] **Step 3: Verify build.** From `frontend/`: `bun run build`. Expect type-check + build success (no errors). If `MemoGap.tags` quote/source types mismatch, fix the mapping to match `frontend/src/types.ts` exactly (read it — the `MarketMemo`, `MemoGap`, `MemoCompetitor`, `EntryCostFactor`, `MemoRead`, `Source`, `ScoreBand`, `GapSeverity`, `CompetitorTier`, `BandTone`, `EvidenceTier` types are the contract; do not change them, adapt `adaptMemo` to them).

- [ ] **Step 4: Commit.**
```bash
git add frontend/src/api.ts frontend/src/adapterMemo.ts
git commit -m "feat: adaptMemo — result_json v2 -> MarketMemo (with legacy fallbacks)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Real-data mode for the `/memo` preview

**Files:**
- Modify: `frontend/src/pages/MarketMemoPreview.tsx`

Current `MarketMemoPreview` renders `MOCK_MEMO`. Add three sources, in priority order: (1) a `sessionStorage` JSON blob (auth-free local testing), (2) `?report=<id>` (fetch a real report), (3) `MOCK_MEMO` (default).

- [ ] **Step 1: Rewrite `MarketMemoPreview.tsx`** to this:

```tsx
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

export default function MarketMemoPreview() {
  const [state, setState] = useState<State>({ kind: 'mock' });

  useEffect(() => {
    // 1. sessionStorage override (auth-free)
    const blob = sessionStorage.getItem('memoPreviewJson');
    if (blob) {
      try {
        const json = JSON.parse(blob);
        setState({ kind: 'ready', memo: adaptMemo(json, json.idea_text ?? 'Pasted report'), label: 'sessionStorage' });
        return;
      } catch {
        setState({ kind: 'error', message: 'sessionStorage "memoPreviewJson" is not valid JSON.' });
        return;
      }
    }
    // 2. ?report=<id>
    const id = new URLSearchParams(window.location.search).get('report');
    if (!id) {
      setState({ kind: 'mock' });
      return;
    }
    setState({ kind: 'loading', id });
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
```

- [ ] **Step 2: Add minimal status styles.** Append to `frontend/src/index.css`:
```css
.memo-preview-status {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--text-muted);
  padding: 24px 0;
}
.memo-preview-status--error { color: var(--danger); }
```

- [ ] **Step 3: Verify build.** From `frontend/`: `bun run build`. Expect success.

- [ ] **Step 4: Commit.**
```bash
git add frontend/src/pages/MarketMemoPreview.tsx frontend/src/index.css
git commit -m "feat: /memo real-data mode (?report=<id> + sessionStorage override)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## How to verify visually (after both tasks + deploy)
1. Deploy Plan A backend (`sam build && sam deploy`) and this frontend.
2. Generate a real report through the normal app; copy its `report_id`.
3. On the authenticated origin, open `/memo?report=<report_id>` → see real v2 data in the memo.
   - **Auth-free local alternative:** in devtools console run `sessionStorage.setItem('memoPreviewJson', '<paste a result_json>')`, then open `/memo`.

## Out of scope (these are Plan B2)
- Swapping `MarketMemo` onto the live report tab.
- Re-homing export / feedback / upgrade CTAs.
- Roadmap → Muse `roadmap-N` citation-cell resolution.
