# Tabbed Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the report workspace into three tabs — Report · Build Brief · Muse — retiring the report↔chat toggle and the inline Build Brief section.

**Architecture:** Lift a `WorkspaceTab` state into `App.tsx`; collapse `useMuse`'s view machine (the "open report" concept becomes a tab, not a Muse state). The header row becomes the tab bar; one pane renders at a time; the persistent bottom input is always the Muse composer. Build Brief moves out of `ReportView` into its own tab pane.

**Tech Stack:** React + Vite + TypeScript, framer-motion, lucide-react, plain CSS (OKLCH tokens in `index.css`). Package manager: `bun` (run from `frontend/`).

**Spec:** `docs/superpowers/specs/2026-05-28-tabbed-workspace-design.md`

---

## Verification approach (read first)

This repo has **no frontend test framework** (no vitest/jest; `package.json` exposes `dev`/`build`/`lint`/`preview`). Per `CLAUDE.md`, the verification step is `bun run build` (which runs `tsc -b && vite build`, catching all type errors) plus `bun run lint`, plus manual browser checks. This plan therefore replaces the usual "write a failing test → make it pass" loop with:

- **Type/compile gate:** `cd frontend && bun run build`
- **Lint gate:** `cd frontend && bun run lint`
- **Behavior gate:** manual checks in the browser. The repo is already in mock mode (`frontend/.env` has `VITE_USE_MOCK=true`) and the mock user is **Pro**, so the full Pro flow is exercisable. Dev server: `cd frontend && bun run dev` (serves on 5173 or next free port).

Do not introduce a test framework — that is out of scope and not how this project verifies.

---

## File structure (what changes and why)

**New**
- `frontend/src/components/WorkspaceTabs.tsx` — presentational tablist (labels, gated markers, animated underline, a11y + keyboard nav). Owns no business logic.

**Modified**
- `frontend/src/App.tsx` — `activeTab` state + default-tab effects; header-as-tabs; one-pane-at-a-time render; composer always-Muse + submit→muse; citation handler; remove the `muse-report-surface` overlay; query sub-row; simplified `onSubmit`.
- `frontend/src/hooks/useMuse.ts` — remove view machine (`view`/`openReport`/`closeReport`/`toggleReport`/`report-open`); keep `highlightTarget` + `cite`; add `clearHighlight`.
- `frontend/src/components/muse/museTypes.ts` — remove `MuseView`.
- `frontend/src/components/AnimatedAiInput.tsx` — remove `museMode`/`onMuseToggle` + the toggle button UI.
- `frontend/src/components/ReportView.tsx` — remove the `buildBrief` prop + section-05 render (revert the inline integration).
- `frontend/src/components/BuildBrief.tsx` — refactor from a collapsible section into a tab pane (`BuildBriefPane`).
- `frontend/src/components/muse/MuseEmptyLine.tsx` — add an optional `actionLabel` prop so the anon Muse pane can say "sign in" instead of "see plans".
- `frontend/src/index.css` — tab bar + query sub-row + pane styles; remove toggle styles.
- `frontend/src/components/muse/muse.css` — remove `muse-report-surface*` styles; keep `muse-back-banner*`.
- `frontend/src/components/build-brief.css` — drop section/header/peek styles; keep invite/card/brief/skeleton/error.

**Deleted**
- `frontend/src/components/muse/SaturationToggleMark.tsx` — only consumer was the retired toggle.

---

## Task 1: WorkspaceTabs component + type + styles

**Files:**
- Create: `frontend/src/components/WorkspaceTabs.tsx`
- Modify: `frontend/src/index.css` (append tab styles)

- [ ] **Step 1: Create the WorkspaceTabs component**

Create `frontend/src/components/WorkspaceTabs.tsx`:

```tsx
import { useRef, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export type WorkspaceTab = 'report' | 'build-brief' | 'muse';

interface TabDef {
  id: WorkspaceTab;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'report', label: 'Report' },
  { id: 'build-brief', label: 'Build Brief' },
  { id: 'muse', label: 'Muse' },
];

interface Props {
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  /** Non-paid users get a "Pro" marker on Build Brief. */
  isPaid: boolean;
  /** Anonymous users get a "Sign in" marker on Muse. */
  isAuthenticated: boolean;
}

export function WorkspaceTabs({ active, onChange, isPaid, isAuthenticated }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const reduceMotion = useReducedMotion();

  const markerFor = (id: WorkspaceTab): string | null => {
    if (id === 'build-brief' && !isPaid) return 'Pro';
    if (id === 'muse' && !isAuthenticated) return 'Sign in';
    return null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    const id = TABS[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };

  return (
    <div className="ws-tabs" role="tablist" aria-label="Workspace views">
      {TABS.map((t, idx) => {
        const selected = t.id === active;
        const marker = markerFor(t.id);
        return (
          <button
            key={t.id}
            ref={el => {
              refs.current[t.id] = el;
            }}
            role="tab"
            id={`ws-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`ws-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={`ws-tab${selected ? ' is-active' : ''}`}
            onClick={() => onChange(t.id)}
            onKeyDown={e => onKeyDown(e, idx)}
          >
            <span className="ws-tab-label">{t.label}</span>
            {marker && <span className="ws-tab-marker">{marker}</span>}
            {selected && (
              <motion.span
                className="ws-tab-underline"
                layoutId="ws-tab-underline"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 0.18, ease: [0.25, 1, 0.5, 1] }
                }
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Append tab styles to `index.css`**

Append to the end of `frontend/src/index.css`:

```css
/* ── Workspace tabs (header-as-tabs) ─────────────────────── */
.ws-tabs {
  display: flex;
  align-items: stretch;
  height: 52px;
  flex: 1;
  min-width: 0;
  padding-left: 8px;
}
.ws-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 52px;
  padding: 0 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  transition: color 0.15s ease;
}
.ws-tab:hover { color: var(--text-secondary); }
.ws-tab.is-active { color: var(--text); }
.ws-tab:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--border-focus);
  border-radius: var(--radius-sm);
}
.ws-tab-marker {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--signal);
  border: 1px solid var(--signal-border);
  border-radius: var(--radius-full);
  padding: 1px 6px;
}
.ws-tab-underline {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 0;
  height: 2px;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
}
@media (max-width: 680px) {
  .ws-tab { padding: 0 10px; font-size: 10px; }
  .ws-tab-marker { display: none; }
}

/* ── Query sub-row + tab pane (under the header) ─────────── */
.ws-query-subrow {
  font-size: 13px;
  font-style: italic;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 20px;
}
.ws-pane {
  display: block;
}
```

- [ ] **Step 3: Verify build + lint**

Run: `cd frontend && bun run build && bun run lint`
Expected: build succeeds, no lint errors. (`WorkspaceTabs` is unused so far — that is fine; an unused *file* does not error, only unused *imports/vars* do.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/WorkspaceTabs.tsx frontend/src/index.css
git commit -m "Add WorkspaceTabs tablist component + styles"
```

---

## Task 2: Add `actionLabel` to MuseEmptyLine

**Files:**
- Modify: `frontend/src/components/muse/MuseEmptyLine.tsx`

- [ ] **Step 1: Add the prop**

Replace the whole contents of `frontend/src/components/muse/MuseEmptyLine.tsx` with:

```tsx
interface MuseEmptyLineProps {
  /** When the plan blocks chat (or the daily Free cap is reached), show the
   *  upgrade variant instead. */
  locked?: boolean;
  onUpgrade?: () => void;
  /** Optional override for the locked-variant copy. Default is the plan
   *  upgrade line; the Free daily-cap path passes its own. Lowercase only —
   *  the CSS uppercases the whole line. */
  lockedReason?: string;
  /** Optional override for the locked-variant button label (default "see plans").
   *  The anonymous Muse pane passes "sign in". */
  actionLabel?: string;
}

/** The single Plex Mono line where the thread will live before the first message.
 *  Per CLAUDE.md: no greeting bubble, no "How can I help you" copy. */
export function MuseEmptyLine({
  locked = false,
  onUpgrade,
  lockedReason,
  actionLabel = 'see plans',
}: MuseEmptyLineProps) {
  if (locked) {
    return (
      <div className="muse-empty-line muse-empty-line--locked">
        <span>MUSE · {lockedReason ?? 'upgrade to chat with this report'}</span>
        {onUpgrade && (
          <button type="button" className="muse-empty-line__upgrade" onClick={onUpgrade}>
            {actionLabel}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="muse-empty-line">
      MUSE · ready · grounded in this report
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `cd frontend && bun run build && bun run lint`
Expected: succeeds (the prop is optional; existing call sites unaffected).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/muse/MuseEmptyLine.tsx
git commit -m "Add actionLabel prop to MuseEmptyLine for the anon Muse pane"
```

---

## Task 3: Tabbed workspace integration (the coupled change)

These edits are interdependent (removing `useMuse.view` breaks `App`; removing `MuseView` breaks `AnimatedAiInput`), so they land together. Make all edits, then run the gates once, then commit.

**Files:**
- Modify: `frontend/src/components/muse/museTypes.ts`
- Modify: `frontend/src/hooks/useMuse.ts`
- Modify: `frontend/src/components/AnimatedAiInput.tsx`
- Modify: `frontend/src/components/ReportView.tsx`
- Modify: `frontend/src/components/BuildBrief.tsx`
- Modify: `frontend/src/components/build-brief.css`
- Modify: `frontend/src/components/muse/muse.css`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Remove `MuseView` from `museTypes.ts`**

In `frontend/src/components/muse/museTypes.ts`, delete this line (line ~3):

```ts
export type MuseView = 'idle' | 'chat' | 'report-open';
```

Leave the rest of the file unchanged.

- [ ] **Step 2: Collapse the view machine in `useMuse.ts`**

In `frontend/src/hooks/useMuse.ts`:

(a) Remove the `MuseView` import. Change:
```ts
import type { MuseFeedback, MuseTurn, MuseView } from '../components/muse/museTypes';
```
to:
```ts
import type { MuseFeedback, MuseTurn } from '../components/muse/museTypes';
```

(b) In the `UseMuseResult` interface, **remove** `view`, `openReport`, `closeReport`, `toggleReport` and **add** `clearHighlight`. The relevant lines become:
```ts
  enabled: boolean;
  thread: MuseTurn[];
  streamingText: string | null;
  highlightTarget: string | null;
  lastError: string | null;
  hydrating: boolean;
  dailyUsed: number | null;
  dailyLimit: number | null;
  sendMessage: (text: string) => void;
  /** Set the cited cell target. The caller (App) switches to the Report tab. */
  cite: (target: string) => void;
  /** Clear the cited target (e.g. when leaving the Report tab by tab click). */
  clearHighlight: () => void;
  regenerate: (turnIndex: number) => void;
  setFeedback: (turnIndex: number, value: MuseFeedback) => void;
  clearThread: () => Promise<void>;
  dismissError: () => void;
```
(Delete the `view: MuseView;` line and the `openReport`/`closeReport`/`toggleReport` lines.)

(c) Remove the view state declaration. Delete:
```ts
  const [view, setView] = useState<MuseView>('idle');
```

(d) In the hydration `useEffect`, remove every `setView(...)` call. Specifically delete `setView('idle');` in the disabled branch, `setView('idle');` in the reset, and replace:
```ts
        setThread(turns);
        setView(turns.length > 0 ? 'chat' : 'idle');
```
with:
```ts
        setThread(turns);
```

(e) In `sendInternal`, delete the line:
```ts
      setView('chat');
```

(f) Replace the `openReport`/`closeReport`/`toggleReport`/`cite` block with `cite` + `clearHighlight`:
```ts
  const cite = useCallback((target: string) => {
    setHighlightTarget(target);
  }, []);

  const clearHighlight = useCallback(() => {
    setHighlightTarget(null);
  }, []);
```
(Delete the `openReport`, `closeReport`, `toggleReport` `useCallback`s entirely.)

(g) In `clearThread`, delete the line:
```ts
    setView('idle');
```

(h) In the returned object, remove `view`, `openReport`, `closeReport`, `toggleReport`; add `clearHighlight`. The return becomes:
```ts
  return {
    enabled,
    thread,
    streamingText,
    highlightTarget,
    lastError,
    hydrating,
    dailyUsed,
    dailyLimit,
    sendMessage,
    cite,
    clearHighlight,
    regenerate,
    setFeedback,
    clearThread,
    dismissError,
  };
```

- [ ] **Step 3: Remove the toggle from `AnimatedAiInput.tsx`**

In `frontend/src/components/AnimatedAiInput.tsx`:

(a) Change the lucide import (drop `MessageSquare`):
```ts
import { ArrowRight, Check, ChevronDown } from 'lucide-react';
```

(b) Delete these imports:
```ts
import { SaturationToggleMark } from './muse/SaturationToggleMark';
import type { MuseView } from './muse/museTypes';
```

(c) In `AnimatedAiInputProps`, delete the `museMode` and `onMuseToggle` fields (the whole JSDoc block + the two lines):
```ts
  museMode?: MuseView | null;
  onMuseToggle?: () => void;
```

(d) In the destructured props, delete `museMode = null,` and `onMuseToggle,`.

(e) Delete the entire toggle JSX block inside `.ai-input__toolbar-left` (the fragment that starts with `{(museMode === 'chat' || museMode === 'report-open') && (` and ends with its closing `)}` — the `<span className="ai-input__sep" ...>` plus the `<button className="ai-input__muse-toggle" ...>`).

- [ ] **Step 4: Remove Build Brief from `ReportView.tsx`**

In `frontend/src/components/ReportView.tsx`:

(a) Delete the imports:
```ts
import BuildBriefSection from './BuildBrief';
import type { UseBuildBriefResult } from '../hooks/useBuildBrief';
```

(b) In `Props`, delete the `buildBrief?: UseBuildBriefResult;` field (and its comment).

(c) In the `ReportViewInner` signature, remove `buildBrief` from the destructured params:
```ts
function ReportViewInner({ report, reportId, onRequestUpgrade, onUpgradeToPro, onFeedback }: Props) {
```

(d) Delete the Build Brief block that was inserted in the conclusion cluster:
```tsx
        {/* ── Build Brief — the next beat after the verdict ── */}
        {buildBrief && (
          <motion.div variants={fadeUp}>
            <BuildBriefSection
              buildBrief={buildBrief}
              idea={report.idea}
              onUpgrade={onUpgradeToPro ?? onRequestUpgrade ?? (() => {})}
            />
          </motion.div>
        )}

```
So the first-move block's parent `</motion.div>` is immediately followed by `<div className="divider" />` and the `01` evidence section, as it was originally.

- [ ] **Step 5: Refactor `BuildBrief.tsx` into a pane**

In `frontend/src/components/BuildBrief.tsx`, replace the default-export `BuildBriefSection` function (the collapsible section at the bottom of the file) with a flat pane. Also delete the now-unused `Kicker` and `ReadyPeek` components and the `Blocks`, `ChevronDown` lucide imports if they become unused (Blocks is still used by `Invite`; ChevronDown is only used by the old section — remove it).

(a) Change the lucide import to drop `ChevronDown`:
```ts
import { Blocks, Check, Copy, Lock, RefreshCw } from 'lucide-react';
```
(Remove `ChevronDown`. Keep `Blocks` — used in `Invite`. `AnimatePresence`/`motion` from framer-motion are no longer needed; change the framer import line to remove them — verify nothing else in the file uses them, then delete `import { AnimatePresence, motion } from 'framer-motion';`.)

(b) Delete the `Kicker` function and the `ReadyPeek` function entirely.

(c) Replace the entire `export default function BuildBriefSection(...) { ... }` at the bottom with:
```tsx
export default function BuildBriefPane({ buildBrief, idea, onUpgrade }: Props) {
  const { status, brief, generatedAt, error, capReached, generate, dismissError } = buildBrief;

  if (status === 'locked') {
    return (
      <div className="bb-pane">
        <Invite locked onUpgrade={onUpgrade} />
      </div>
    );
  }

  if (status === 'idle') {
    return (
      <div className="bb-pane">
        <Invite onGenerate={generate} />
      </div>
    );
  }

  if (status === 'loading' || status === 'generating') {
    return (
      <div className="bb-pane">
        <SkeletonState />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="bb-pane">
        <ErrorState message={error ?? "Couldn't generate the brief."} onRetry={generate} />
      </div>
    );
  }

  return (
    <div className="bb-pane">
      {brief && (
        <BriefBody
          brief={brief}
          idea={idea}
          generatedAt={generatedAt}
          capReached={capReached}
          onRegenerate={generate}
        />
      )}
      {error && (
        <div className="bb-cap-msg" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="bb-cap-msg-dismiss"
            onClick={dismissError}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
```
(The `Invite` component's `onGenerate` is called directly now — no `runGenerate`/expand wrapper. `Invite`, `SkeletonState`, `ErrorState`, `BriefBody`, `buildBriefMarkdown`, `complexityColor`, `formatGeneratedAt`, `FOUNDATION_PRINCIPLES`, `LIMIT_STATEMENT`, and the `Props` interface are all kept unchanged.)

- [ ] **Step 6: Trim Build Brief CSS for the pane**

In `frontend/src/components/build-brief.css`:

(a) Delete the now-unused rules: `.bb-section`, `.bb-chip`, `.bb-kicker`, `.bb-invite-head` stays (used by Invite), `.bb-block-head`, `.bb-toggle`, `.bb-toggle-chev`, `.bb-toggle-chev.is-open`, `.bb-block-body`, `.bb-peek`, `.bb-peek-item`, `.bb-peek-item--muted`, `.bb-peek-dot`, `.bb-peek-sep`. (Grep each before deleting to confirm no other consumer.)

(b) Add a pane wrapper rule near the top:
```css
.bb-pane {
  display: block;
}
```

(c) The skeleton/error previously sat under a header, so remove their top margins. Change `.bb-skeleton { ... margin-top: 18px; ... }` to `margin-top: 0;` and `.bb-error { ... margin-top: 18px; ... }` to `margin-top: 0;`.

- [ ] **Step 7: Remove `muse-report-surface` styles**

In `frontend/src/components/muse/muse.css`, delete the `.muse-report-surface` and `.muse-report-surface--open` rules (the "Workspace integration — wrapper around ReportView" block). Keep `.muse-back-banner*`, `.muse-cell-pulsing`, and everything else.

- [ ] **Step 8: Wire tabs into `App.tsx`**

In `frontend/src/App.tsx`:

(a) Add imports near the other component imports:
```tsx
import { WorkspaceTabs, type WorkspaceTab } from './components/WorkspaceTabs';
import BuildBriefPane from './components/BuildBrief';
```

(b) Add tab state + derived flags after the `buildBrief` hook call:
```tsx
const [activeTab, setActiveTab] = useState<WorkspaceTab>('report');
const isPaid = userPlan !== '' && userPlan !== 'free';
const showTabs = screen === 'report' && !!report && !!reportId;
```

(c) Add the default-tab effects (place near the other effects):
```tsx
// Reset to the Report tab whenever the active report changes.
const lastReportTabRef = useRef<string | null>(null);
const museHydratedTabRef = useRef<string | null>(null);
useEffect(() => {
  if (reportId !== lastReportTabRef.current) {
    lastReportTabRef.current = reportId;
    museHydratedTabRef.current = null;
    setActiveTab('report');
  }
}, [reportId]);
// After Muse hydration settles, default to Muse if the report already has a thread.
useEffect(() => {
  if (!reportId || muse.hydrating || museHydratedTabRef.current === reportId) return;
  museHydratedTabRef.current = reportId;
  if (muse.thread.length > 0) setActiveTab('muse');
}, [reportId, muse.hydrating, muse.thread.length]);
```

(d) Add two shared callbacks (place near `onNewChat`):
```tsx
const upgradeToPro = useCallback(() => {
  if (!auth.isAuthenticated) {
    pendingCheckoutPlanRef.current = 'pro';
    setShowSignIn(true);
    return;
  }
  void billing.startCheckout('pro');
}, [auth.isAuthenticated, billing]);

const handleCite = useCallback((target: string) => {
  setActiveTab('report');
  muse.cite(target);
}, [muse]);
```

(e) Update the citation scroll/pulse effect: change its guard from `muse.view !== 'report-open'` to the tab + replace the dep array. Find the effect that does `document.querySelector('[data-muse-cell=...]')` and change its head and deps:
```tsx
useEffect(() => {
  if (!muse.enabled) return;
  if (activeTab !== 'report' || !muse.highlightTarget) return;
  const target = muse.highlightTarget;
  // ... body unchanged ...
}, [muse.enabled, activeTab, muse.highlightTarget]);
```

(f) Replace the `<header className="ws-header">` contents to host the tabs:
```tsx
<header className="ws-header">
  <button
    type="button"
    className="ws-sidebar-toggle"
    onClick={() => setSidebarOpen(o => !o)}
    aria-label="Toggle sidebar"
  >
    <PanelLeft size={15} strokeWidth={2} />
  </button>

  {showTabs ? (
    <WorkspaceTabs
      active={activeTab}
      onChange={tab => {
        if (tab === 'report') muse.clearHighlight();
        setActiveTab(tab);
      }}
      isPaid={isPaid}
      isAuthenticated={auth.isAuthenticated}
    />
  ) : (
    <div className="ws-header-spacer" />
  )}

  <span className="nav-badge">Beta</span>
</header>
```

(g) Replace the entire report-branch (the `else` arm of the `screen === 'analysis' ? ... : (...)` ternary — the `<motion.div key="report">` and its IIFE) with the tabbed render:
```tsx
                ) : (
                  <motion.div
                    key="report"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: 0.4 } }}
                  >
                    {report && reportId && (
                      <>
                        {query && <div className="ws-query-subrow">"{query}"</div>}

                        {activeTab === 'report' && (
                          <div
                            id="ws-panel-report"
                            role="tabpanel"
                            aria-labelledby="ws-tab-report"
                            className="ws-pane"
                          >
                            {museEligible && muse.highlightTarget && (
                              <div className="muse-back-banner">
                                <span className="muse-back-banner__label">
                                  From your conversation
                                </span>
                                <button
                                  type="button"
                                  className="muse-back-banner__btn"
                                  onClick={() => {
                                    setActiveTab('muse');
                                    muse.clearHighlight();
                                  }}
                                >
                                  <span aria-hidden>←</span>
                                  <span>Back to chat</span>
                                </button>
                              </div>
                            )}
                            <ReportView
                              report={report}
                              reportId={reportId}
                              onRequestUpgrade={() => setProactiveUpgrade(true)}
                              onUpgradeToPro={upgradeToPro}
                              onFeedback={async (rating, comment) => {
                                await submitFeedback(reportId, rating, comment);
                              }}
                            />
                          </div>
                        )}

                        {activeTab === 'build-brief' && (
                          <div
                            id="ws-panel-build-brief"
                            role="tabpanel"
                            aria-labelledby="ws-tab-build-brief"
                            className="ws-pane"
                          >
                            <BuildBriefPane
                              buildBrief={buildBrief}
                              idea={report.idea}
                              onUpgrade={upgradeToPro}
                            />
                          </div>
                        )}

                        {activeTab === 'muse' && (
                          <div
                            id="ws-panel-muse"
                            role="tabpanel"
                            aria-labelledby="ws-tab-muse"
                            className="ws-pane"
                          >
                            {!museEligible ? (
                              <MuseEmptyLine
                                locked
                                actionLabel="sign in"
                                lockedReason="sign in to chat with this report"
                                onUpgrade={() => setShowSignIn(true)}
                              />
                            ) : museCapped ? (
                              <MuseEmptyLine
                                locked
                                lockedReason="you've used today's free chats"
                                onUpgrade={() => setShowPricing(true)}
                              />
                            ) : muse.thread.length > 0 || muse.streamingText !== null ? (
                              <MuseThread
                                thread={muse.thread}
                                streamingText={muse.streamingText}
                                onCite={handleCite}
                                onAsk={muse.sendMessage}
                                onRegenerate={muse.regenerate}
                                onFeedback={muse.setFeedback}
                              />
                            ) : (
                              <MuseEmptyLine />
                            )}
                            {muse.lastError && (
                              <div className="muse-error" role="alert">
                                <span>{muse.lastError}</span>
                                <button
                                  type="button"
                                  className="muse-error__dismiss"
                                  onClick={muse.dismissError}
                                  aria-label="Dismiss error"
                                >
                                  ×
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
```

(h) Replace the bottom-input block (the `{!isWorkspaceEmpty && (<motion.div layoutId="ml-input" className="ws-input-wrap" ...>)}`) with a Muse-only composer shown on a report:
```tsx
{screen === 'report' && report && museEligible && (
  <motion.div
    layoutId="ml-input"
    className="ws-input-wrap"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1, transition: { duration: 0.2 } }}
    transition={SPRING}
  >
    <AnimatedAiInput
      value={inputValue}
      onChange={setInputValue}
      onSubmit={onSubmit}
      placeholder={
        museCapped
          ? 'Free Muse chats used for today'
          : activeTab === 'muse'
            ? 'Reply…'
            : 'Ask Muse about this report…'
      }
      compact
      disabled={museCapped}
    />
  </motion.div>
)}
```

(i) Simplify `onSubmit` — the bottom bar is now always Muse on a report; new analysis only comes from the empty-state hero input:
```tsx
const onSubmit = useCallback((val: string) => {
  const text = val.trim();
  if (text.length <= 4) return;

  // On a report, the bottom bar is the Muse composer.
  if (screen === 'report' && report && reportId && museEligible) {
    if (museCapped) return;
    setActiveTab('muse');
    muse.sendMessage(text);
    setInputValue('');
    return;
  }

  // Empty-state hero input: start a new analysis (or gate to sign-in).
  if (!auth.isAuthenticated) {
    pendingQueryRef.current = text;
    try { sessionStorage.setItem(PENDING_QUERY_KEY, text); } catch { /* private mode */ }
    setShowSignIn(true);
    return;
  }

  startAnalysis(text);
  setInputValue('');
  setShowSavePrompt(false);
}, [screen, report, reportId, museEligible, museCapped, muse, auth.isAuthenticated, startAnalysis]);
```

(j) Remove the now-unused `buildBrief` import wiring into ReportView (already handled — `buildBrief` is now passed to `BuildBriefPane`, the `useBuildBrief` call stays). Confirm `useBuildBrief` is still called and `buildBrief` is referenced (it is, in the build-brief pane).

- [ ] **Step 9: Verify build + lint**

Run: `cd frontend && bun run build && bun run lint`
Expected: build succeeds (no TS errors), lint clean. If lint flags an unused import (e.g. a leftover `MuseEmptyLine` import that is in fact still used, or `fadeUp`), resolve by removing genuinely-unused symbols only.

- [ ] **Step 10: Manual browser check (mock = Pro)**

Run: `cd frontend && bun run dev` and open the served URL. Then:
- Run any idea → land on the report. Confirm the header shows `REPORT · BUILD BRIEF · MUSE` with the underline under Report, and the idea string sits in a small italic sub-row above the report.
- Click **Build Brief** → the pane shows the Generate CTA; Generate → skeleton → full brief; copy-as-markdown + regenerate work.
- Click **Muse** → empty line; type in the bottom composer → it switches to the Muse tab and streams a reply.
- In a Muse answer, click a citation pill → switches to the **Report** tab, scrolls + pulses the cell, and shows the `FROM YOUR CONVERSATION / ← BACK TO CHAT` banner. Click "Back to chat" → returns to Muse; the banner is gone.
- Click the **Report** tab directly (not via citation) → no banner.
- Confirm there is no toggle glyph in the bottom input toolbar anymore.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/muse/museTypes.ts frontend/src/hooks/useMuse.ts frontend/src/components/AnimatedAiInput.tsx frontend/src/components/ReportView.tsx frontend/src/components/BuildBrief.tsx frontend/src/components/build-brief.css frontend/src/components/muse/muse.css frontend/src/App.tsx
git commit -m "Restructure workspace into Report / Build Brief / Muse tabs"
```

---

## Task 4: Cleanup — remove the retired toggle component + dead CSS

**Files:**
- Delete: `frontend/src/components/muse/SaturationToggleMark.tsx`
- Modify: `frontend/src/components/muse/muse.css`

- [ ] **Step 1: Confirm SaturationToggleMark has no remaining consumers**

Run: `cd frontend && grep -rn "SaturationToggleMark" src/`
Expected: no matches (Task 3 removed the only import from `AnimatedAiInput.tsx`). If any remain, resolve them before deleting.

- [ ] **Step 2: Delete the component**

```bash
git rm frontend/src/components/muse/SaturationToggleMark.tsx
```

- [ ] **Step 3: Remove its CSS + the dead toggle CSS**

In `frontend/src/components/muse/muse.css`, delete the rules: `.muse-toggle-mark`, `.muse-toggle-mark__bar`, `.muse-toggle-mark__bar--low`, `.muse-toggle-mark__bar--high`, `.ai-input__muse-toggle`, `.ai-input__muse-toggle:hover` (media block), `.ai-input__muse-toggle:focus-visible`, `.ai-input__muse-toggle-inner`, `.ai-input__muse-glyph`.

Then `grep -rn "ai-input__sep" src/` — if no consumer remains, also remove the `.ai-input__sep` rule (wherever it lives, likely `index.css`).

- [ ] **Step 4: Verify build + lint**

Run: `cd frontend && bun run build && bun run lint`
Expected: succeeds, no unused-import or missing-module errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/muse/muse.css frontend/src/index.css
git commit -m "Remove retired Muse toggle component + dead toggle styles"
```

---

## Self-review (completed during planning)

- **Spec coverage:** tab state + default rules (Task 3 Step 8c) ✓; header-as-tabs (Task 1 + Task 3 Step 8f) ✓; composer always-Muse + submit→muse (Task 3 Steps 8h/8i) ✓; gated panes + markers (Task 1 markerFor + Task 3 Step 8g + Task 2) ✓; citation routing + back-banner (Task 3 Steps 8d/8e/8g) ✓; Build Brief extraction (Task 3 Steps 4/5/6) ✓; retirements: view machine (Step 2), MuseView (Step 1), toggle (Step 3), SaturationToggleMark + muse-report-surface (Steps 7 + Task 4) ✓; a11y roles/keyboard (Task 1) ✓.
- **Type consistency:** `WorkspaceTab` defined in Task 1 and imported in Task 3; `clearHighlight` added to `UseMuseResult` (Step 2b) and used in App (Steps 8f/8g); `BuildBriefPane` default export (Step 5) matches App import (Step 8a); `actionLabel` added (Task 2) matches the anon pane call (Step 8g).
- **Open spec questions:** default-tab timing resolved to the `muse.hydrating`-settle approach (Step 8c); Build Brief fetch stays eager (`useBuildBrief` unchanged) per the spec default.

---

## Notes / known intermediate states

- Anonymous users on a report get no composer (Muse is sign-in-gated) — unchanged from today; new analysis for them is the landing input. Not in scope to redesign.
- During the analysis (pipeline) screen there is no bottom composer now (there is no report to chat about yet); the pipeline tracker already shows the query. This is intended.
