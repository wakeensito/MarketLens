# Toolbar Navigation Glyphs — Design

**Status:** Design — pending review
**Date:** 2026-05-28
**Scope:** Add destination-toggle glyphs to the AI input toolbar so users can switch among the three workspace surfaces (Report · Build Brief · Muse) from where their hands already are. Coexists with the header tabs. Frontend only. Builds directly on the tabbed-workspace work (`docs/superpowers/specs/2026-05-28-tabbed-workspace-design.md`).

---

## Goal

Give the workspace a second, lighter way to move between Report, Build Brief, and Muse: small destination glyphs in the AI input toolbar (next to the model dropdown), restoring and extending the pre-tabs toggle pattern. The glyphs **appear as each surface is generated**, so they double as a learnability cue — the user discovers each surface's glyph the moment that surface comes into being.

This keeps the locked **single-attention** identity (one surface at a time, no split-screen). The header tabs remain the primary, labeled navigation; the glyphs are a quiet, in-context shortcut.

**Success criterion:** while typing in the composer, the user can jump to any other surface they've created with one tap, without reaching for the header — and a new builder learns the glyph vocabulary naturally as they generate each surface.

---

## Decisions (locked with the user)

- **Coexist, don't replace.** The header tabs stay exactly as built; the glyphs are added alongside. ("For now" — may consolidate later.)
- **Single source of truth.** Both the tabs and the glyphs drive the same `activeTab` state in `App.tsx`, so they're always in sync (a glyph tap moves the tab underline and vice-versa).
- **Two at a time.** On any surface, the toolbar shows a glyph for each *other surface that currently exists* — so at most two.
- **Appear-as-generated.** A surface's glyph only appears once that surface exists (see triggers below). This progressive disclosure is intentional — it teaches the glyph vocabulary as the user builds.
- **Single-attention preserved.** No split-screen. (An earlier split-pane reading of the idea was rejected.)

---

## Behavior

### What shows
For the current report, compute the set of **existing surfaces**:

- **Report** — always (you are on a report).
- **Build Brief** — once a brief has been generated for this report (`useBuildBrief` status is `ready`).
- **Muse** — once a thread exists for this report (`muse.thread.length > 0`, or a stream is in flight).

The toolbar renders a destination glyph for every existing surface **except the one currently active**. So:

- Fresh report, nothing generated → no glyphs (just the model dropdown).
- After generating a brief → a Build Brief glyph appears.
- After the first chat message → a Muse glyph appears.
- All three exist, viewing Report → Build Brief + Muse glyphs (two).

Glyphs render in a fixed order — **report, build-brief, muse** — minus the active one, so positions stay stable as the user learns them.

### What a tap does
Tapping a glyph runs the **same handler the tabs use**: mark that the user chose a tab (so the post-hydration auto-default can't override it), clear the citation highlight if navigating to Report, then `setActiveTab(target)`. Identical to clicking the corresponding header tab.

### Glyphs (destination semantics — the icon shows where the tap lands)
- **Report** → the `▬▬` mini-saturation mark (`SaturationToggleMark`, restored).
- **Build Brief** → lucide `Blocks` (matches the Build Brief CTA icon).
- **Muse** → lucide `MessageSquare` (chat bubble).

Each is an icon-only button with `title` + `aria-label` ("Open report" / "Open build brief" / "Open chat").

### Where they live
In `AnimatedAiInput`'s toolbar **left group**, after the model dropdown, separated by a restored hairline `ai-input__sep`. The composer (and therefore these glyphs) only renders on a report for signed-in users; anonymous users navigate via the header tabs only. Consistent with the current composer gating.

---

## Architecture

### `AnimatedAiInput` (`frontend/src/components/AnimatedAiInput.tsx`)
The removed `museMode` / `onMuseToggle` toggle is replaced by a general, surface-agnostic nav group:

```ts
import { type WorkspaceTab } from './WorkspaceTabs';

// new optional props
activeTab?: WorkspaceTab;
availableTabs?: WorkspaceTab[];   // surfaces that exist for this report
onNavigate?: (tab: WorkspaceTab) => void;
```

When `onNavigate` is provided, the toolbar renders — after the model dropdown and an `ai-input__sep` separator — one glyph button for each entry in `availableTabs` that is not `activeTab`, in the fixed order `['report', 'build-brief', 'muse']`. A small internal map resolves `tab → glyph + label`. If the filtered set is empty, nothing renders (no separator, no buttons).

### `App.tsx`
- **Extract a shared tab-change handler** so the tabs and the glyphs are provably identical:
  ```ts
  const handleTabChange = useCallback((tab: WorkspaceTab) => {
    userChangedTabRef.current = true;
    if (tab === 'report') muse.clearHighlight();
    setActiveTab(tab);
  }, [muse]);
  ```
  Wire `WorkspaceTabs`'s `onChange` to `handleTabChange` (replacing the current inline arrow), and pass `handleTabChange` as the composer's `onNavigate`.
- **Compute `availableTabs`:**
  ```ts
  const availableTabs = useMemo<WorkspaceTab[]>(() => {
    const tabs: WorkspaceTab[] = ['report'];
    if (buildBrief.status === 'ready') tabs.push('build-brief');
    if (muse.thread.length > 0 || muse.streamingText !== null) tabs.push('muse');
    return tabs;
  }, [buildBrief.status, muse.thread.length, muse.streamingText]);
  ```
- Pass `activeTab={activeTab}`, `availableTabs={availableTabs}`, `onNavigate={handleTabChange}` to the bottom-rail `AnimatedAiInput`.

### Restore `SaturationToggleMark`
Reintroduce `frontend/src/components/muse/SaturationToggleMark.tsx` (deleted in the tab cleanup) — the two-bar `▬▬` mark — and its small CSS (`.muse-toggle-mark*`). Re-add the toolbar separator + glyph-button styles (`.ai-input__sep`, a generalized `.ai-input__nav-glyph` button rule replacing the old `.ai-input__muse-toggle*`).

---

## Motion

Glyphs mount/unmount as surfaces come into existence. A quiet opacity fade-in (≤180ms, ease-out) on appearance is acceptable and on-budget; no scale/spring. `prefers-reduced-motion` → appear instantly. No idle/looping animation.

---

## Edge cases

- **Fresh report** → zero glyphs; toolbar is just the model dropdown (matches landing).
- **Switching reports** → `activeTab` resets to Report and `availableTabs` recomputes for the new report (its Build Brief / Muse glyphs reappear only if that report has them). The brief glyph reflects the *new* report's `useBuildBrief` state; the Muse glyph reflects the new report's hydrated thread.
- **Regenerating a brief** → status passes through `generating` (glyph hidden) back to `ready` (glyph returns). This brief flicker is acceptable; if it reads badly in practice, gate the glyph on "has ever been ready for this report" instead — defer that refinement unless observed.
- **Anonymous / no composer** → no glyphs; header tabs remain.
- **Active surface** never shows its own glyph (you're already there).

---

## Accessibility

- Each glyph is an icon-only `<button>` with `title` and `aria-label` naming the destination.
- The glyphs are *supplementary* navigation; the header tabs remain the primary `role="tablist"` nav, so screen-reader users keep a fully-labeled path. The glyphs do not need tab/tablist semantics — they are shortcut buttons.
- Visible focus rings (never `outline: none` without replacement).

---

## Out of scope

- No change to the header tabs, the panes, the composer's Muse-only behavior, or the citation routing.
- No split-screen / side-by-side panes (explicitly rejected).
- Mobile layout is unchanged — the glyphs are small icon buttons that fit the compact composer toolbar as-is.
- Consolidating tabs vs. glyphs into one system later is a possible future decision, not this change.

---

## Files touched

- `frontend/src/components/AnimatedAiInput.tsx` — add `activeTab` / `availableTabs` / `onNavigate` props + the nav-glyph group.
- `frontend/src/App.tsx` — extract `handleTabChange`, compute `availableTabs`, pass nav props to the composer, rewire `WorkspaceTabs.onChange`.
- `frontend/src/components/muse/SaturationToggleMark.tsx` — **restore** (the `▬▬` mark).
- `frontend/src/components/muse/muse.css` — restore `.muse-toggle-mark*` + the generalized `.ai-input__nav-glyph` toolbar-button styles (replacing the old `.ai-input__muse-toggle*`).
- `frontend/src/index.css` — restore the `.ai-input__sep` separator rule.

## Open implementation questions

1. **Brief-glyph flicker on regenerate.** Default: gate on live `status === 'ready'` (glyph briefly hides during regeneration). Alternative: track "has been ready for this report" so the glyph persists through a regenerate. Resolve in the plan only if the simple version reads as flicker.
