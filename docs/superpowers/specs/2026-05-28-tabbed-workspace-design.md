# Tabbed Workspace — Design

**Status:** Design — pending review
**Date:** 2026-05-28
**Scope:** Restructure the report workspace into three tabs — **Report · Build Brief · Muse** — replacing the current ad-hoc report↔chat toggle and the inline Build Brief section. Frontend only. No backend changes.

---

## Goal

Separate the three things a founder works with — the **report** (the deliverable), the **Build Brief** (the build read), and **Muse** (the conversation) — into legible, one-tap surfaces. Most LLM UIs cram deliverable, sources, and chat into one scroll; the result is clutter. plinths splits them while preserving its single-attention register: one surface visible at a time, no split-screen.

This also resolves a problem from the Build Brief work: as an inline section at the bottom of the report it was easy to overlook. As a peer tab it is always one tap away and can never be scrolled past.

**Success criterion:** a user can move between the report, its build read, and the conversation without scrolling-hunting or losing their place, and the workspace never feels cluttered.

---

## Decisions (locked with the user)

- **Composer = always Muse.** The persistent bottom input is the Muse composer on every tab. Submitting from any tab sends to Muse and switches to the Muse tab to show the answer. Starting a **new analysis** moves entirely to the sidebar `+ new` and the workspace empty state — the bottom bar no longer starts analyses.
- **All three tabs always visible.** Gated tabs open to a calm upsell pane, never an empty or blurred state. Build Brief → Pro upsell (tab carries a small `Pro` marker for free/anon). Muse → "Sign in to chat" (anon) or the daily-cap lock (free, capped). The composer is shown whenever the user is signed in (disabled when free-capped) and hidden for anonymous users.
- **Header is the tab bar.** The `ws-header` row holds the mobile sidebar toggle, the `tablist`, and the `Beta` badge. The idea/query string drops to a small sub-row above the tab content.
- **No detaching / no split-screen.** Explicitly rejected: pop-out windows or side-by-side panes contradict the locked single-attention rule and would sever the citation interaction (which needs report + chat to share one DOM and intent).
- **Approach: lift tab state to App; collapse Muse's view machine.** `useMuse` stops owning the `report-open` concept; "open the report" becomes a tab. One nav concept, not two.

---

## Architecture

### Tab state

- New type: `type WorkspaceTab = 'report' | 'build-brief' | 'muse'`.
- `activeTab` lives in `App.tsx` as `useState`, scoped to the current report (resets on report switch).
- **Default tab:**
  - A freshly completed analysis → `report`.
  - Opening an existing report from the sidebar → `muse` if its Muse thread has turns, otherwise `report`. (This is the already-locked "default to chat-view if a thread exists" rule, re-expressed as a tab.) The default is applied once, when the report's Muse thread finishes hydrating (`useMuse` exposes `thread` + `hydrating`); App sets `activeTab` on that settle, keyed to `reportId`.
  - **Build Brief is never the auto-default** — it is always an explicit choice.

### `useMuse` changes (`frontend/src/hooks/useMuse.ts`)

- **Remove** `view`, `openReport`, `closeReport`, `toggleReport`, and all `'report-open'` semantics.
- **Keep** `thread`, `streamingText`, `hydrating`, `lastError`, `dailyUsed`/`dailyLimit`, `sendMessage`, `regenerate`, `setFeedback`, `clearThread`, `dismissError`.
- `cite(target)` keeps `highlightTarget` but no longer sets a view; it now signals App to switch to the Report tab (App owns the tab, so either `cite` sets `highlightTarget` and App reacts, or App's citation handler wraps `cite` + `setActiveTab('report')`). Chosen: App passes a citation handler that sets `activeTab='report'` and calls `muse.cite(target)`; `MuseThread`'s `onCite` is wired to that handler.
- Hydration no longer sets a view; it only loads the thread. The default-tab decision moves to App.

### `museTypes.ts`

- **Remove** `MuseView` (or reduce to whatever the thread still needs — it no longer needs a view union).

---

## Layout

### Header-as-tabs (`ws-header`)

```
┌─ ☰   REPORT · BUILD BRIEF · MUSE                 Beta ─┐
│        ▔▔▔▔▔▔                                          │
├────────────────────────────────────────────────────────┤
│   "vegan meal-kit for athletes"                         │  ← query sub-row, small
│                                                          │
│   [ active tab pane ]                                    │
│                                                          │
├────────────────────────────────────────────────────────┤
│   Ask Muse about this report…                      [→]   │  ← persistent composer
└────────────────────────────────────────────────────────┘
```

- **Tablist:** mono uppercase labels (Plex Mono, the existing nav/label treatment), quiet, with an **animated underline indicator** that slides between tabs using a framer `layoutId` with a **tween** (ease-out-quart, ≤180ms — not a spring; the only spring in the system remains the input morph).
- Tabs carry a small inline marker when gated: `Build Brief` shows `Pro` for free/anon; `Muse` shows `Sign in` for anon. (Mono, muted, like the existing `nav-badge`.) No marker for plan-eligible users.
- **Query sub-row:** the idea string in a small muted line above the tab content (it leaves the header row to make room for the tablist). Hidden in the workspace-empty state.
- **One tab pane at a time.** Pane swaps are a plain opacity fade (≤200ms), consistent with the locked "plain mount/unmount on view swap, no morph" decision. No horizontal slide.

### Composer (`AnimatedAiInput`, compact)

- Stays fixed at the bottom across all tabs; `layoutId="ml-input"` preserved (landing↔compact morph unaffected — it does not remount per tab).
- Always the Muse composer. Placeholder: `Reply…` on the Muse tab, `Ask Muse about this report…` on Report and Build Brief tabs.
- Submit → `muse.sendMessage(text)` + `setActiveTab('muse')`.
- **Visibility:** shown whenever `museEligible` (signed in). Disabled (greyed, locked textarea) when the free daily cap is reached, with placeholder `Free Muse chats used for today`. Hidden for anonymous users.
- **Retired:** the `museMode` prop, `onMuseToggle`, and the in-toolbar toggle button (the `▬▬` / `MessageSquare` glyphs). `SaturationToggleMark` becomes unused and is removed along with its CSS.

---

## Tab panes

### Report tab
- Renders `ReportView` (now pure of Build Brief — see below).
- **Citation back-banner:** when the user arrived on this tab via a Muse citation (`highlightTarget` set), a sticky `FROM YOUR CONVERSATION · ← BACK TO CHAT` banner shows at the top of the pane; tapping it sets `activeTab='muse'` and clears `highlightTarget`. The banner does **not** show when the user opened the Report tab by clicking the tab (selecting the Report tab clears `highlightTarget`). The existing scroll-into-view + cell pulse effect re-keys on `activeTab === 'report' && highlightTarget`.

### Build Brief tab
- Renders the Build Brief states directly in the pane (no collapsible/peek wrapper — the tab is the container). `locked` → Pro upsell; `idle` → Generate CTA; `loading`/`generating` → skeleton; `ready` → the full brief; `error` → retry. Driven by the existing `useBuildBrief` hook.

### Muse tab
- `museEligible` + thread present or streaming → `MuseThread` + composer.
- `museEligible` + empty thread → the `MUSE · ready · grounded in this report` empty line.
- Free, capped → the daily-cap lock pane.
- Anonymous → a "Sign in to chat" pane that triggers the sign-in flow.

---

## Build Brief extraction (`ReportView.tsx`, `BuildBrief.tsx`)

- `ReportView` **drops** the `buildBrief` prop and the section-05 render — it returns to being purely the report (sections 01–04 + verdict cluster + feedback/footer). The `divider` and conclusion-cluster placement added for the inline brief are reverted.
- `BuildBrief.tsx` refactors from a collapsible section into a **tab pane**: the inner pieces (`Invite`, `SkeletonState`, `ErrorState`, `BriefBody`, the markdown builder, `FOUNDATION_PRINCIPLES`, `LIMIT_STATEMENT`) are kept; the outer collapsible `<section>` + header + `ReadyPeek` + expand/collapse state are removed. `ready` shows `BriefBody` directly; the action row (copy-as-markdown / regenerate) stays.
- `useBuildBrief` is unchanged. It continues to be instantiated in App (`{ reportId, plan }`) and is passed into the Build Brief pane.

---

## What gets retired

- `useMuse` view machine (`view` / `openReport` / `closeReport` / `toggleReport` / `'report-open'`).
- `MuseView` type.
- `AnimatedAiInput` `museMode` + `onMuseToggle` + the toggle button UI.
- `SaturationToggleMark` component + its CSS in `muse.css`.
- `muse-report-surface` wrapper + `muse-report-surface--open` styling and the report-as-overlay branch in App.
- The bottom bar's "start a new analysis" role (moves to sidebar `+ new` / empty state); App's `onSubmit` simplifies to: if signed-in and on a report → Muse; otherwise the existing new-analysis / sign-in-gate paths (which now only fire from the empty-state hero input).

---

## Files touched

- `frontend/src/App.tsx` — `activeTab` state + default-tab effect; header-as-tabs; one-pane-at-a-time rendering; composer always-Muse + submit→muse; citation handler (`setActiveTab('report')` + `cite`); remove `muse-report-surface` branch; move back-banner into the Report pane; simplify `onSubmit`.
- `frontend/src/components/WorkspaceTabs.tsx` — **new** small presentational tablist (labels, gated markers, animated underline, a11y roles, keyboard nav).
- `frontend/src/hooks/useMuse.ts` — remove view machine; keep `cite` as a target-setter.
- `frontend/src/components/muse/museTypes.ts` — remove `MuseView`.
- `frontend/src/components/AnimatedAiInput.tsx` — remove `museMode` / `onMuseToggle` + toggle UI.
- `frontend/src/components/muse/SaturationToggleMark.tsx` — remove (+ its `muse.css` rules).
- `frontend/src/components/ReportView.tsx` — remove `buildBrief` prop + section 05.
- `frontend/src/components/BuildBrief.tsx` — refactor from collapsible section to tab pane.
- `frontend/src/index.css` / `frontend/src/components/muse/muse.css` — header/tablist styles; remove toggle + `muse-report-surface` styles; back-banner stays.

---

## Edge cases

- **Switching reports** resets `activeTab` per the default rule; in-flight Muse stream is already cancelled by `useMuse` on `reportId` change.
- **Free user, Build Brief tab:** the Muse composer still shows (it follows) — asking flips to the Muse tab. Build Brief content stays locked behind its upsell pane.
- **Anonymous user:** no composer; Build Brief tab → upgrade pane; Muse tab → sign-in pane; Report tab → the report. New analysis via the landing input (existing sign-in gate).
- **Citation while already on Report tab:** still scrolls + pulses the cell and shows the back-banner (highlightTarget set), so the affordance is consistent.
- **Generate Build Brief, then switch tabs mid-generation:** generation continues (it is in the hook, not the pane); returning to the Build Brief tab shows the result or skeleton as appropriate.
- **Reduced motion:** underline indicator and pane fades settle instantly; cell pulse already respects this.

## Accessibility

- `role="tablist"` on the bar, `role="tab"` + `aria-selected` on each tab, `role="tabpanel"` on the active pane, `aria-controls`/`aria-labelledby` wiring.
- Left/Right arrow keys move between tabs; `Home`/`End` jump to first/last; visible focus rings (never `outline: none` without replacement).
- Gated tabs are still focusable and announce their state ("Build Brief, Pro"); activating opens the upsell pane.

---

## Out of scope / future seams

- **Detachable / split panes** — explicitly rejected.
- **URL-deep-linkable tabs** (`?tab=muse`) — the app is state-machine driven with no router; deferred. Clean seam if shareable workspace links are wanted later.
- **Max model picker** in the composer — unchanged; the model dropdown stays as-is.
- **Per-tab unread/ready indicators** beyond the gated markers (e.g., a dot on Muse when a thread exists) — optional polish, not required for v1.

---

## Open implementation questions

1. **Default-tab timing.** The "default to Muse if a thread exists" decision depends on Muse hydration completing. Resolve in the plan whether App keys this off `muse.hydrating` settling or `useMuse` exposes a one-shot `suggestedTab`. Default: App reacts to `hydrating` going false, once per `reportId`.
2. **Build Brief auto-fetch on tab open vs. report load.** Today `useBuildBrief` fetches a stored brief on report load. Confirm whether to keep that eager fetch or defer it until the Build Brief tab is first opened (lazier, fewer calls). Default: keep eager — it is one GET and lets the tab marker reflect "ready" if desired later.
