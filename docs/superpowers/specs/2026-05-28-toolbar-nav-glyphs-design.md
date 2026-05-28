# Toolbar Navigation Glyphs — Design

**Status:** Design — pending review
**Date:** 2026-05-28
**Scope:** Add destination-toggle glyphs to the AI input toolbar so users can switch among the three workspace surfaces (Report · Build Brief · Muse) from where their hands already are. Coexists with the header tabs. Frontend only. Builds directly on the tabbed-workspace work (`docs/superpowers/specs/2026-05-28-tabbed-workspace-design.md`).

---

## Goal

Give the workspace a second, lighter way to move between Report, Build Brief, and Muse: small destination glyphs in the AI input toolbar (next to the model dropdown), restoring and extending the pre-tabs toggle pattern. The toolbar **always shows a glyph for each of the other two surfaces**, mirroring the always-present header tabs, so any surface is one tap away from the composer where the user is already working.

This keeps the locked **single-attention** identity (one surface at a time, no split-screen). The header tabs remain the primary, labeled navigation; the glyphs are a quiet, in-context shortcut.

**Success criterion:** while typing in the composer, the user can reach any other surface with one tap, without moving to the header — and the two glyphs read as a stable, learnable pair.

---

## Counsel (CLAUDE.md)

- **CLAUDE.md:245** — *"the icon shows where the tap will take you... The slot is **empty** when there's no destination — no disabled placeholder, no ghost paperclip."*
- **CLAUDE.md:221** — in the old two-surface model, *"the toolbar has no toggle when chat is idle"* — because before chat existed there was nowhere else to go.

With the header tabs now always present, **every surface is always a real, reachable destination**: the Build Brief tab leads to a real generate-CTA pane, and the Muse tab leads to a real ready-to-type pane. So "no destination" never occurs anymore, and the old "no toggle until it exists" precedent (which was really "no toggle when there's nowhere to go") no longer applies. Always-on glyphs therefore satisfy the rule — none are ghosts or dead controls.

---

## Decisions (locked with the user)

- **Coexist, don't replace.** The header tabs stay exactly as built; the glyphs are added alongside. ("For now" — may consolidate later.)
- **Single source of truth.** Both the tabs and the glyphs drive the same `activeTab` state in `App.tsx`, so they're always in sync (a glyph tap moves the tab underline and vice-versa).
- **Always-on, mirroring the tabs.** The toolbar always shows a glyph for each surface that isn't the active one. Since all three surfaces always exist (the tabs are always present), that is **always exactly two glyphs**. (Reconsidered from an earlier "appear-as-generated" idea — the tabs already expose all three surfaces from the start, so progressively revealing glyphs would hide nothing while adding complexity and a regenerate-flicker edge case.)
- **Single-attention preserved.** No split-screen. (An earlier split-pane reading of the idea was rejected.)

---

## Behavior

### What shows
On whatever surface is active, the toolbar renders a destination glyph for the **other two** surfaces, in the fixed order **report → build-brief → muse** (minus the active one, so positions stay stable). Examples:

- On **Report** → Build Brief glyph, Muse glyph.
- On **Build Brief** → Report glyph, Muse glyph.
- On **Muse** → Report glyph, Build Brief glyph.

The active surface never shows its own glyph (you're already there).

### What a tap does
Tapping a glyph runs the **same handler the tabs use** (`handleTabChange`): mark that the user chose a tab (so the post-hydration auto-default can't override it), clear the citation highlight if navigating to Report, then `setActiveTab(target)`. Identical to clicking the corresponding header tab.

### Glyphs (destination semantics — the icon shows where the tap lands)
- **Report** → the `▬▬` mini-saturation mark (`SaturationToggleMark`, restored).
- **Build Brief** → lucide `Blocks` (matches the Build Brief CTA icon).
- **Muse** → lucide `MessageSquare` (chat bubble).

Each is an icon-only button with `title` + `aria-label` ("Open report" / "Open build brief" / "Open chat").

### Where they live
In `AnimatedAiInput`'s toolbar **left group**, after the model dropdown, separated by a restored hairline `ai-input__sep`. The composer (and therefore these glyphs) only renders on a report for signed-in users; anonymous users navigate via the header tabs only. Consistent with the current composer gating. (Free users see all glyphs — Build Brief → its Pro upsell pane, a real destination.)

---

## Architecture

### `AnimatedAiInput` (`frontend/src/components/AnimatedAiInput.tsx`)
The removed `museMode` / `onMuseToggle` toggle is replaced by a general, surface-agnostic nav group:

```ts
import { type WorkspaceTab } from './WorkspaceTabs';

// new optional props
activeTab?: WorkspaceTab;
onNavigate?: (tab: WorkspaceTab) => void;
```

When `onNavigate` and `activeTab` are provided, the toolbar renders — after the model dropdown and an `ai-input__sep` separator — one glyph button for each surface in the fixed order `['report', 'build-brief', 'muse']` that is not `activeTab` (always two). A small internal map resolves `tab → glyph + label`. When `onNavigate` is absent (e.g. the landing/hero input), nothing renders.

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
- Pass `activeTab={activeTab}` and `onNavigate={handleTabChange}` to the bottom-rail `AnimatedAiInput`. (No `availableTabs` — the glyph set is always the two non-active surfaces.)

### Restore `SaturationToggleMark`
Reintroduce `frontend/src/components/muse/SaturationToggleMark.tsx` (deleted in the tab cleanup) — the two-bar `▬▬` mark — and its small CSS (`.muse-toggle-mark*`). Re-add the toolbar separator (`.ai-input__sep`) and a generalized glyph-button rule (`.ai-input__nav-glyph`, replacing the old `.ai-input__muse-toggle*`).

---

## Motion

The glyph pair is static once a report is open (it only changes which two glyphs show when the active surface changes — a swap, not an appear/disappear). No special animation is required; a glyph that changes identity on tab switch may cross-fade (≤180ms, ease-out) but plain swap is fine. `prefers-reduced-motion` → instant. No idle/looping animation.

---

## Edge cases

- **Report open (any state)** → always two glyphs for the other two surfaces; on a brand-new report that's Build Brief + Muse.
- **Switching the active surface** → the glyph pair updates to "the other two" (the active surface's glyph drops, the previously-active surface's glyph returns).
- **Switching reports** → `activeTab` resets to Report; the glyph pair becomes Build Brief + Muse for the new report. State is per the new report.
- **Free user** → all glyphs present; Build Brief glyph → the Pro upsell pane (a real destination), Muse glyph → chat (capped state if applicable).
- **Anonymous / no composer** → no glyphs; header tabs remain.
- **Active surface** never shows its own glyph.

---

## Accessibility

- Each glyph is an icon-only `<button>` with `title` and `aria-label` naming the destination.
- The glyphs are *supplementary* navigation; the header tabs remain the primary `role="tablist"` nav, so screen-reader users keep a fully-labeled path. The glyphs do not need tab/tablist semantics — they are shortcut buttons.
- Visible focus rings (never `outline: none` without replacement).

---

## Out of scope

- No change to the header tabs, the panes, the composer's Muse-only behavior, or the citation routing.
- No split-screen / side-by-side panes (explicitly rejected).
- Mobile layout is unchanged — the two glyphs are small icon buttons that fit the compact composer toolbar as-is.
- Consolidating tabs vs. glyphs into one system later is a possible future decision, not this change.

---

## Files touched

- `frontend/src/components/AnimatedAiInput.tsx` — add `activeTab` / `onNavigate` props + the two-glyph nav group.
- `frontend/src/App.tsx` — extract `handleTabChange`, pass `activeTab` + `onNavigate` to the composer, rewire `WorkspaceTabs.onChange`.
- `frontend/src/components/muse/SaturationToggleMark.tsx` — **restore** (the `▬▬` mark).
- `frontend/src/components/muse/muse.css` — restore `.muse-toggle-mark*` + the generalized `.ai-input__nav-glyph` toolbar-button styles (replacing the old `.ai-input__muse-toggle*`).
- `frontend/src/index.css` — restore the `.ai-input__sep` separator rule.
