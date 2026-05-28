# Toolbar Navigation Glyphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add always-on destination glyphs to the AI input toolbar so the user can jump to the two non-active workspace surfaces (Report / Build Brief / Muse) without leaving the composer.

**Architecture:** Restore the `SaturationToggleMark` + toolbar CSS removed during the tab cleanup; give `AnimatedAiInput` a surface-agnostic nav group driven by `activeTab` + `onNavigate`; in `App.tsx` extract one shared `handleTabChange` used by both the header tabs and the glyphs, so the two navigations can never diverge.

**Tech Stack:** React + Vite + TypeScript, framer-motion, lucide-react, plain CSS (OKLCH tokens). Package manager: `bun` (run from `frontend/`).

**Spec:** `docs/superpowers/specs/2026-05-28-toolbar-nav-glyphs-design.md`

---

## Verification approach (read first)

This repo has **no frontend test framework**. Per `CLAUDE.md`, verification is `bun run build` (`tsc -b && vite build`, catches all type errors) + `bun run lint`, plus manual browser checks. Each task ends with build + lint + commit. Do NOT add a test framework. Do NOT start a dev server / drive a browser (the browser-check notes are for the human). The pre-existing Vite ">500 kB chunk" warning is expected and is NOT an error.

`CLAUDE.md` shows as modified in the working tree from an unrelated edit — do NOT stage it. Stage only the files each task names. Never `git add -A` / `git add .`.

---

## File structure (what changes and why)

**Restore (deleted/removed during the tab cleanup):**
- `frontend/src/components/muse/SaturationToggleMark.tsx` — the `▬▬` two-bar mark; the Report destination glyph.
- CSS for `.muse-toggle-mark*` (in `muse.css`) and `.ai-input__sep` (in `index.css`).

**Modify:**
- `frontend/src/components/AnimatedAiInput.tsx` — add the nav-glyph group (props `activeTab` + `onNavigate`).
- `frontend/src/App.tsx` — extract `handleTabChange`; wire it to both the tabs and the composer's `onNavigate`.
- `frontend/src/components/muse/muse.css` — add `.muse-toggle-mark*` + a generalized `.ai-input__nav-glyph` button rule.
- `frontend/src/index.css` — add `.ai-input__sep`.

---

## Task 1: Restore the mark + toolbar CSS

**Files:**
- Create: `frontend/src/components/muse/SaturationToggleMark.tsx`
- Modify: `frontend/src/components/muse/muse.css` (append)
- Modify: `frontend/src/index.css` (append)

- [ ] **Step 1: Recreate `SaturationToggleMark.tsx`**

Create `frontend/src/components/muse/SaturationToggleMark.tsx` with exactly:

```tsx
/** Two-bar mini-saturation mark used as the Report destination glyph in the
 *  AI input toolbar. Echoes the report's saturation gauge — see CLAUDE.md Muse > Craft. */
export function SaturationToggleMark() {
  return (
    <span className="muse-toggle-mark" aria-hidden>
      <span className="muse-toggle-mark__bar muse-toggle-mark__bar--low" />
      <span className="muse-toggle-mark__bar muse-toggle-mark__bar--high" />
    </span>
  );
}
```

- [ ] **Step 2: Append the mark + nav-glyph styles to `muse.css`**

Append to the END of `frontend/src/components/muse/muse.css`:

```css
/* ────────────────────────────────────────────────────────────
   Saturation toggle mark — the ▬▬ glyph (Report destination glyph)
   ──────────────────────────────────────────────────────────── */

.muse-toggle-mark {
  display: inline-flex;
  flex-direction: column;
  gap: 3px;
  width: 14px;
}

.muse-toggle-mark__bar {
  height: 3px;
  border-radius: 1px;
  background: currentcolor;
}

.muse-toggle-mark__bar--low  { width: 100%; }
.muse-toggle-mark__bar--high { width: 60%;  }

/* ────────────────────────────────────────────────────────────
   AnimatedAiInput nav glyphs — jump to another workspace surface
   ──────────────────────────────────────────────────────────── */

.ai-input__nav-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

@media (hover: hover) {
  .ai-input__nav-glyph:hover {
    background: var(--accent-light);
    border-color: var(--accent-border);
    color: var(--text);
  }
}

.ai-input__nav-glyph:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Append `.ai-input__sep` to `index.css`**

Append to the END of `frontend/src/index.css`:

```css
/* Vertical hairline separating the model dropdown from the nav glyphs */
.ai-input__sep {
  width: 1px;
  height: 18px;
  background: var(--border-mid);
  flex-shrink: 0;
}
```

- [ ] **Step 4: Verify build + lint**

Run: `cd frontend && bun run build && bun run lint`
Expected: build succeeds, lint clean. (`SaturationToggleMark` is unused so far — that's fine; an unused *file* does not error.)

- [ ] **Step 5: Commit**

```bash
git -C /Users/wakeensito/Plinths add frontend/src/components/muse/SaturationToggleMark.tsx frontend/src/components/muse/muse.css frontend/src/index.css
git -C /Users/wakeensito/Plinths commit -m "Restore SaturationToggleMark + toolbar nav-glyph/separator CSS"
```

---

## Task 2: Add the nav-glyph group to AnimatedAiInput

**Files:**
- Modify: `frontend/src/components/AnimatedAiInput.tsx`

- [ ] **Step 1: Update imports**

In `frontend/src/components/AnimatedAiInput.tsx`, change the lucide import (line 11) to add `Blocks` and `MessageSquare`:

```ts
import { ArrowRight, Blocks, Check, ChevronDown, MessageSquare } from 'lucide-react';
```

Then add these two imports immediately after the `SoonPill` import (after line 14):

```ts
import { SaturationToggleMark } from './muse/SaturationToggleMark';
import type { WorkspaceTab } from './WorkspaceTabs';
```

- [ ] **Step 2: Add module-level nav config + glyph component**

In `frontend/src/components/AnimatedAiInput.tsx`, immediately after the `type ModelId = ...` line (line 37), add:

```tsx
const NAV_ORDER: WorkspaceTab[] = ['report', 'build-brief', 'muse'];
const NAV_LABEL: Record<WorkspaceTab, string> = {
  report: 'Open report',
  'build-brief': 'Open build brief',
  muse: 'Open chat',
};

function NavGlyph({ tab }: { tab: WorkspaceTab }) {
  if (tab === 'report') return <SaturationToggleMark />;
  if (tab === 'build-brief') return <Blocks size={16} strokeWidth={1.8} aria-hidden />;
  return <MessageSquare size={16} strokeWidth={1.7} aria-hidden />;
}
```

- [ ] **Step 3: Add the props**

In the `AnimatedAiInputProps` interface, add these two optional props (after the `disabled?` field, before the closing `}`):

```ts
  /** Active workspace surface. When provided with `onNavigate`, the toolbar
   *  renders destination glyphs for the other two surfaces. */
  activeTab?: WorkspaceTab;
  /** Navigate to another surface from the toolbar glyphs. */
  onNavigate?: (tab: WorkspaceTab) => void;
```

Then add `activeTab,` and `onNavigate,` to the destructured params (after `disabled = false,`):

```ts
      autoFocus: autoFocusProp,
      disabled = false,
      activeTab,
      onNavigate,
```

- [ ] **Step 4: Render the glyph group in the toolbar**

In the JSX, inside `<div className="ai-input__toolbar-left">`, immediately after the closing `</details>` (line 216) and before the closing `</div>` of `toolbar-left`, add:

```tsx
            {onNavigate && activeTab && (
              <>
                <span className="ai-input__sep" aria-hidden />
                {NAV_ORDER.filter(t => t !== activeTab).map(t => (
                  <button
                    key={t}
                    type="button"
                    className="ai-input__nav-glyph"
                    onClick={() => onNavigate(t)}
                    aria-label={NAV_LABEL[t]}
                    title={NAV_LABEL[t]}
                  >
                    <NavGlyph tab={t} />
                  </button>
                ))}
              </>
            )}
```

- [ ] **Step 5: Verify build + lint**

Run: `cd frontend && bun run build && bun run lint`
Expected: build succeeds (the new props are optional; existing call sites — the landing and empty-state inputs — pass neither, so no glyphs render there), lint clean.

- [ ] **Step 6: Commit**

```bash
git -C /Users/wakeensito/Plinths add frontend/src/components/AnimatedAiInput.tsx
git -C /Users/wakeensito/Plinths commit -m "Add toolbar nav-glyph group to AnimatedAiInput"
```

---

## Task 3: Wire the glyphs + tabs to one shared handler in App

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add the shared `handleTabChange` callback**

In `frontend/src/App.tsx`, find the `handleCite` callback (around line 298):

```tsx
  const handleCite = useCallback((target: string) => {
    setActiveTab('report');
    muse.cite(target);
  }, [muse]);
```

Immediately after it, add:

```tsx
  const handleTabChange = useCallback((tab: WorkspaceTab) => {
    userChangedTabRef.current = true;
    if (tab === 'report') muse.clearHighlight();
    setActiveTab(tab);
  }, [muse]);
```

- [ ] **Step 2: Rewire the header tabs to the shared handler**

Find the `WorkspaceTabs` usage (around line 622) with its inline `onChange`:

```tsx
                <WorkspaceTabs
                  active={activeTab}
                  onChange={tab => {
                    userChangedTabRef.current = true;
                    if (tab === 'report') muse.clearHighlight();
                    setActiveTab(tab);
                  }}
                  isPaid={isPaid}
                  isAuthenticated={auth.isAuthenticated}
                />
```

Replace the `onChange` prop with the shared handler:

```tsx
                <WorkspaceTabs
                  active={activeTab}
                  onChange={handleTabChange}
                  isPaid={isPaid}
                  isAuthenticated={auth.isAuthenticated}
                />
```

- [ ] **Step 3: Pass nav props to the composer**

Find the bottom-rail `AnimatedAiInput` (around line 839, inside the `screen === 'report' && report && museEligible` block):

```tsx
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
```

Add `activeTab` and `onNavigate` props:

```tsx
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
                  activeTab={activeTab}
                  onNavigate={handleTabChange}
                />
```

- [ ] **Step 4: Verify build + lint**

Run: `cd frontend && bun run build && bun run lint`
Expected: build succeeds, lint clean (0 errors, 0 warnings). `WorkspaceTab` is already imported in `App.tsx` (`import { WorkspaceTabs, type WorkspaceTab } from './components/WorkspaceTabs';`), so the `handleTabChange` annotation resolves.

- [ ] **Step 5: Manual browser check (mock = Pro)**

Run `cd frontend && bun run dev`, open the served URL, then:
- Run any idea → land on the report. In the bottom composer toolbar, next to the `plinths` model dropdown, confirm **two glyphs**: the `Blocks` (Build Brief) and the chat-bubble (Muse). No Report glyph (you're on Report).
- Tap the Build Brief glyph → the **Build Brief tab** activates (header underline moves), and the composer glyphs become the `▬▬` Report mark + the chat bubble.
- Tap the chat-bubble → the **Muse tab** activates; glyphs become `▬▬` Report + `Blocks` Build Brief.
- Tap the `▬▬` Report glyph → back to Report; if you had arrived at the report via a Muse citation earlier, confirm the "Back to chat" banner does NOT linger (highlight cleared).
- Confirm the header tabs and the glyphs always agree (same active surface).
- Hover/focus a glyph → subtle background + visible focus ring; the title tooltip names the destination.

- [ ] **Step 6: Commit**

```bash
git -C /Users/wakeensito/Plinths add frontend/src/App.tsx
git -C /Users/wakeensito/Plinths commit -m "Wire toolbar nav glyphs + tabs to one shared handleTabChange"
```

---

## Self-review (completed during planning)

- **Spec coverage:** always-on two glyphs (Task 2 Step 4 — `NAV_ORDER.filter(t => t !== activeTab)`) ✓; glyph icons report=`▬▬`/build-brief=`Blocks`/muse=`MessageSquare` (Task 2 Steps 1–2) ✓; placement after the dropdown with `ai-input__sep` (Task 2 Step 4 + Task 1 Step 3) ✓; shared handler with tabs incl. `userChangedTabRef` + `clearHighlight` on report (Task 3 Steps 1–2) ✓; composer-only/ gating unchanged (props passed only to the bottom-rail input that already gates on `screen === 'report' && report && museEligible`) ✓; restore `SaturationToggleMark` + CSS (Task 1) ✓; aria-label/title per glyph (Task 2 Step 4) ✓.
- **Placeholder scan:** none — all steps contain exact code/commands.
- **Type consistency:** `WorkspaceTab` imported in both `AnimatedAiInput` (type-only) and `App`; `onNavigate: (tab: WorkspaceTab) => void` matches `handleTabChange`'s signature; `NAV_LABEL` is a total `Record<WorkspaceTab, string>` covering all three union members.

## Notes

- The glyphs render only when both `activeTab` and `onNavigate` are passed — i.e. only on the bottom-rail composer. The landing and workspace-empty `AnimatedAiInput` instances pass neither, so they show no glyphs (correct — there's no report to navigate yet).
- No circular import: `AnimatedAiInput` does a type-only import of `WorkspaceTab` from `WorkspaceTabs`, which imports only framer-motion.
