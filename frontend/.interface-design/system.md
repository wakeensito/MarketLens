# plinths — Interface Design System

## Intent
A founder about to make a real bet on an idea. They need a trusted verdict fast. The interface must feel authoritative, calm, and premium — decisive without noise. Professional SaaS clarity: think Perplexity, Claude, Linear.

## Direction: Pale Intelligence

### Who
Founders, product people, early-stage entrepreneurs. Sitting between meetings, excited about an idea. They want a verdict, not data.

### What
Type an idea → get a competitive landscape, saturation score, and entry roadmap.

### Feel
Warm parchment intelligence. Light mode. IBM Plex type family. Single amber accent on the logo only. Everything else is charcoal on warm white.

---

## Palette

### Foundation — pale parchment
```
--bg:              oklch(98.5% 0.004 80)   barely-warm white
--surface:         oklch(97%   0.006 80)   slightly warmer white
--surface-alt:     oklch(94%   0.009 80)   hover / grouped surfaces
--surface-hover:   oklch(91%   0.011 80)
```

### Borders — warm parchment
```
--border:          oklch(88% 0.006 80)
--border-mid:      oklch(80% 0.008 80)
--border-strong:   oklch(68% 0.010 80)
--border-focus:    oklch(13% 0.008 245 / 0.35)
```

### Text — warm charcoal
```
--text:            oklch(13% 0.008 245)    primary
--text-secondary:  oklch(44% 0.006 245)    secondary / labels
--text-muted:      oklch(62% 0.005 245)    disabled / meta
--text-inverse:    oklch(98.5% 0.004 80)   on dark surfaces
```

### Accent — charcoal (all interactive elements)
```
--accent:          oklch(13% 0.008 245)    same as --text; ink dark
--accent-light:    oklch(13% 0.008 245 / 0.06)
--accent-border:   oklch(13% 0.008 245 / 0.14)
--accent-hover:    oklch(7%  0.006 245)
```

### Signal — slate blue (data scores, distinct from body text)
```
--signal:          oklch(36% 0.10 240)
--signal-light:    oklch(36% 0.10 240 / 0.08)
--signal-border:   oklch(36% 0.10 240 / 0.18)
```
Used on: gap opportunity scores. NOT on interactive elements (that's charcoal).

### Logo accent — single warm amber
```
--logo-accent:     oklch(60% 0.17 47)
```
Applied ONLY to the PlinthsMark SVG fills. Never on interactive elements.

### Semantic
```
--success:         oklch(50% 0.15 152)    green (low saturation ≤40)
--warning:         oklch(60% 0.16 67)     amber (moderate 41–65)
--danger:          oklch(54% 0.20 23)     coral-red (high >65)
```

---

## Typography — IBM Plex Family

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| Display | IBM Plex Serif | 600 | Verdict statements, hero headlines, report section titles |
| Body | IBM Plex Sans | 400–600 | All UI, labels, body text |
| Mono | IBM Plex Mono | 500–700 | Metrics, brief codes, timestamps, reference IDs, badges |
| Brand | Syne | 700 | "plinths" wordmark only |

### Size scale
```
10px / 700 / 0.08–0.12em uppercase  — mono labels, badges, eyebrows, section headers
11px / 500–600                      — mono metadata, taglines, mini-card text
12px / 400–600                      — secondary descriptors, elapsed, stage descriptions
13px / 400–600                      — primary body, table content, pill text, nav buttons
14px / 400–600                      — main body paragraphs, gap descriptions
20px / 600                          — stat card values
22–28px / 600 (display)             — report verdict statement
clamp(22–52px) / 600 (display)      — landing headline
clamp(28–52px) / 700 (Syne)         — wordmark
```

### Letter-spacing scale (all positive — never negative)
```
0.06em  — light mono label tracking (section nums, mono meta)
0.08em  — standard label tracking (nav badge, stat labels)
0.10em  — heavier eyebrow (score card label, report overline)
0.12em  — section name tracking (brief-section-name)
0.18em  — maximum loose (landing eyebrow only)
```
**Do not use negative letter-spacing.** Never use values outside this scale on mono/label text.

---

## Transitions

```
0.13s               — icon button hover bg (fastest)
0.15s               — border-color, color, background (standard interactive)
0.20s               — state change borders, background (running→done)
0.22s cubic-bezier(0.22,1,0.36,1)   — sidebar width / layout collapse
0.28s cubic-bezier(0.22,1,0.36,1)   — mobile sidebar slide-in
0.35–0.40s easeOut  — page-level entry animations
spring stiffness 280 damping 36     — shared element (layoutId) transitions
```

---

## Radius Scale

```
--radius-sm    3px      category tags, gap tags
--radius-md    4px      buttons, stat cards, mini pipeline cards, icon buttons
--radius-lg    6px      score card, error strip, bottom tinted cards
--radius-xl    12px     large standalone surfaces (pricing cards)
--radius-full  9999px   nav badge, landing pills, free-badge pill
```

**Input system uses intentionally larger radii — do not apply elsewhere:**
```
16px   main AI input container
12px   compact AI input
10px   send/submit button
8px    model selector trigger, dropdown menu items
```

---

## Button Patterns

```
Primary CTA (ink-filled body button — "Send", "View plans", "Save report")
  height 40px  |  padding 0 16–20px  |  radius --radius-md
  border 1px --accent  |  bg --accent  |  color --text-inverse  |  font 13px/600 sentence-case
  hover: --accent-hover bg + --accent-hover border
  Use for committed, primary actions inside a form / row. Not for nav.

Ghost (nav actions — "Sign in", "New analysis", header actions)
  height 32px  |  padding 0 12–16px  |  radius --radius-md
  border 1px --border-mid  |  bg --surface  |  color --text  |  font 13px/500
  hover: --border-strong + --surface-alt

Ghost text-only (secondary nav links — "Pricing")
  height 32px  |  padding 0 12px  |  radius --radius-md  |  no border
  color --text-secondary  |  font 13px/500
  hover: --surface-alt bg + --text color

Icon button (sidebar collapse, new-chat)
  width 28px  |  height 28px  |  radius --radius-md
  color --text-muted  |  bg none
  hover: --text + --surface-alt

Landing pill (example suggestions)
  height 30px  |  padding 0 12px  |  radius --radius-full
  border 1px --border-mid  |  bg --surface  |  color --text-secondary
  hover: accent-border + accent color + accent-light bg

Badge (nav, metadata)
  padding 4px 8px  |  radius --radius-full  |  font-mono 10px/500 uppercase
```

---

## Depth Strategy: Borders-only

- No drop shadows on cards or surfaces
- Ring shadows OK: `box-shadow: 0 0 0 Npx color` — focus rings only
- No `1px 3px` or `2px 8px` offset shadows on interactive elements
- Active/running states: `border-left: 2px solid --accent`
- Sidebar separator: `border-right: 1px solid --border`

---

## Spacing Base: 4px

Scale: 4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 52, 60

```
4px   micro — icon gaps, dot sizes
8px   tight — icon-to-label, inline gaps
12px  compact — tag padding, small gaps
16px  standard — card side padding, header padding
20px  card — primary card section margin
24px  loose — header padding (desktop), larger card gaps
28px  page — horizontal page padding (desktop)
32px  section — between major sections, header heights (sidebar sub-header)
40px  page-top — content top padding
48–52px  chrome height — sidebar header, workspace header, top nav
60px  hero — landing vertical padding
```

### Interactive element heights
```
52px  — workspace header, sidebar brand header, top nav bar
40px  — Primary CTA, inline form input (textarea / send pair)
32px  — ghost button, icon label button, nav actions
30px  — landing pill (chip / example suggestion)
28px  — icon-only button (sidebar collapse, icon btn)
```

### Mobile touch-target override (overrides the 4px grid)

Below the 480px viewport breakpoint, all interactive elements bump to **44px** (WCAG AAA touch target) regardless of their documented desktop height. This override is intentional and supersedes the grid. Tablet (≤680px) uses **40px** as a grid-compliant intermediate where touch parity matters but the AAA bar isn't strictly required.

Progression:
```
> 680px        documented desktop height (28 / 30 / 32 / 40)
≤ 680px        bump to 40px
≤ 480px        bump to 44px (AAA)
```

---

## Shell Layout

```
Landing:    flex-col center  |  shell--landing  |  no sidebar
Workspace:  flex-row         |  shell--workspace  |  sidebar + workspace-body
```

**Sidebar states (desktop):**
- Expanded: 260px — brand header + threads sub-header + thread list + profile
- Rail: 52px — logo mark + new-chat icon + thread dots + profile avatar
- Transition: `width 0.22s cubic-bezier(0.22, 1, 0.36, 1)`

**Sidebar states (mobile):**
- Open: fixed overlay, `transform: translateX(0)`, backdrop
- Closed: `transform: translateX(-100%)`

**Sidebar report search (`.thread-search`):** live client-side filter over the already-loaded `reports` list — no backend call, no debounce. Real `<input>` (no longer a `soon` affordance). Case-insensitive `matchesQuery` matches `idea_text` + key result fields (vertical, geography, business_model, oneliner, saturation_label, recommendation) + competitor names + gap titles. `:focus-within` lifts the border to `--border-mid` + a 2px `--border-focus` ring; the search icon brightens to `--text-secondary` when active/focused. A 20px `.thread-search-clear` (×) appears once there's text. The `threads-count` badge and the `01 — REPORTS` sub-header reflect the **filtered** count; zero matches show a "No matches" empty state (distinct from the first-run "No reports yet"). No match-term highlighting or result snippets — deliberately chrome-free.

**`ws-input-wrap` left offset:**
- Sidebar expanded: `left: 260px`
- Sidebar rail (desktop): `left: 52px`
- Sidebar closed (mobile): `left: 0`

---

## Workspace Empty State

When signed-in user opens a new analysis (no active report), the workspace main area shows a centered empty state:
- `ws-empty-greeting`: mono 13px, `0.06em` tracking, `--text-muted`
- `ws-empty-headline`: IBM Plex Serif 600, `clamp(20–28px)`, `--text`
- Input: `layoutId="ml-input"` inline (not fixed at bottom)
- Example chips: same `.landing-pill` pattern

---

## Landing Top Nav

Fixed 52px bar, transparent (no border/bg), `pointer-events: none` container:
- Right side only: "Pricing" ghost-text + "Sign in" ghost button
- Anonymous users only — hides after sign-in
- Same height as workspace header (52px) for visual rhythm

---

## Signature: The Landing Wordmark

3D mouse-tracking wordmark in landing center. `useMotionValue` normalizes mouse position; `useSpring` (stiffness 80, damping 18) feeds `rotateX/Y`, max ±8°. Cursor glow blob tracks via x/y spring transforms (touch devices: disabled).

Wordmark uses `layoutId="ml-wordmark"` — animates to sidebar brand header on first analysis.

---

## Signature: The Typographic Verdict

Every report opens with a `VerdictDeclaration` — IBM Plex Serif, large, in the semantic saturation color:

> *"This market has meaningful whitespace."*

Preceded by `FINDING` eyebrow label (mono uppercase), followed by supporting sentence in `--text-secondary`.

---

## Component Patterns

### Brief-Coded Section Headers
```
01 — COMPETITIVE LANDSCAPE        5 companies identified
```
- `brief-section-num`: charcoal mono 10px
- `brief-section-name`: `--text-secondary` uppercase 10px tracking 0.12em
- `brief-section-count`: `--text-muted` mono, right-aligned

### Score Card
`score-card--low/mid/high`: 3px top border in success/warning/danger.
Score number color via `scoreColor()` — not `--text`.

### Interactive Row (left-accent-on-hover)
Used on gap rows and roadmap phases:
```css
border-left: 2px solid transparent; padding-left: 0;
transition: background 0.15s, border-color 0.15s;
:hover { background: --surface-alt; border-left-color: --accent-border; padding-left: 12px; }
```

### Pipeline — Active Stage
Running stage: `border-left: 2px solid --accent`.

### Settings Modal (two-pane preferences)
`SettingsModal.tsx` — opened from the profile menu's "Settings" (→General) and "Profile" (→Account) items. `App.tsx` holds `settingsSection: SettingsSection | null` (null = closed); RecentThreads fires `onOpenSettings(section)`.

- **Backdrop:** `.settings-backdrop` — `accent 22%` + `blur(6px)`, `z-index 960` (one above the upgrade modal's 950). Click-outside + Escape close; focus moves to the close button on open and restores on close (matches `UpgradeModal`).
- **Card:** `.settings-card` — flex row, `max-width 720px`, `height min(540px, 86vh)`, `border-radius 16px`, `--border-mid`, and the same soft lift as `upgrade-modal-card` (`0 14px 40px accent/14%`). The shadow is the one sanctioned exception to borders-only — floating dialogs only, never inner cards.
- **Left nav** (`.settings-nav`, `flex 0 0 196px`, `border-right`): mono `Settings` eyebrow header + vertical `role="tablist"` of 32px items (icon + 13px/500 label). Active = `--surface-alt` fill + 600 weight (same language as profile-menu hover); icons step `--text-muted`→`--text`. Tabs: General · Personalization · Account · Billing · Privacy · Help. The profile menu wires Settings→General, Profile→Account, Personalization→Personalization, Help & Support→Help; all formerly-`soon` items are now live.
- **Right detail** (`.settings-detail`): absolute close button top-right (28px, mirrors `upgrade-modal-close`); `.settings-detail-scroll` owns overflow (`28px 32px 32px` padding).
- **Groups & rows:** `.settings-group-title` is IBM Plex Serif 19/600. `.settings-row` is `space-between`, `16px 0` vertical padding, hairline `--border` bottom (last row none). Label 13/500 `--text` + optional `.settings-row-hint` 12/400 `--text-muted`. Right-aligned control slot.
- **Row controls:** `.settings-value` (`--mono` / `--muted` variants); `.settings-plan-badge` (mono pill, `--paid` variant flips to signal tokens); `.settings-action-btn` (32px ghost, `--primary` = ink-filled for the single conversion action). Unwired rows use `SoonPill` in `.settings-soon-slot`.
- **Avatar:** `.settings-avatar` 40px ink circle; gets the stealth amber override alongside `.sidebar-profile-avatar`.
- **Mobile (≤600px):** card goes fullscreen (no radius/border), nav becomes a horizontal scroll strip above the detail, items bump to 40px.
- **Tabs are honest:** every row binds real data (`auth.user`, `plan_limits`, `/privacy` route, billing flow). No decorative/fake toggles — a deliberately minimal tab beats padded chrome.

#### Personalization tab — stacked form fields
The settings-list tabs use inline `space-between` rows; the **Personalization** tab uses a *form* layout instead — `.settings-field` stacks a `.settings-field-text` group (label + optional `SoonPill` + hint, 4px gap) above a full-width control, hairline `--border` between fields.
- **Inputs:** `.settings-input` / `.settings-textarea` — inset `--surface-alt` bg, `--border-mid`, 8px radius, `8px 12px` padding, 13/400. Focus: `--accent-border` + `--surface` bg + `0 0 0 3px --border-focus` ring. Textarea `resize: vertical`, `min-height 72px`.
- **Intro line** (`.settings-intro`): one quiet `--text-muted` 12px sentence, `border-bottom` hairline — sets honest expectations for partially-wired tabs.
- **Save model:** silent persist on **blur** (`commitField`), no Save button / no toast — the retained value on reopen is the confirmation (less-chrome). Captured-but-unconsumed fields carry a `SoonPill` and a self-contained hint ("Saved now — Muse will use it soon").
- **Data layer:** `src/personalization.ts` mirrors `theme.ts` — `getPersonalization()` / `setPersonalization(patch)` over `localStorage['plinths-personalization']`, defaults-merged so partial/older blobs never yield `undefined`. The `Personalization` interface *is* the schema the backend/pipeline/Muse later consume (frontend-first). Live consumer today: `preferredName` → `.ws-empty-greeting` ("Welcome back, {name}.") via `onPersonalizationSaved` lifting to App state. `building` / `marketFocus` (report framing) and `museInstructions` (Muse prompt) are captured-only until that work lands.

---

## File Notes

- Landing screen is rendered inline in `App.tsx`. Do not create `LandingScreen.tsx`.
- All landing CSS lives in `index.css` under `.lnd-*`, `.orb-*`, `.cursor-glow`.
- `AppState` = `'landing' | 'analysis' | 'report' | 'workspace-empty'`
- `'workspace-empty'` = signed-in blank chat (no return to landing for authenticated users).
- `BrandWordmarkVariant` includes `'sidebar'` for the expanded sidebar header.
