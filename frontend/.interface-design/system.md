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
32px  — ghost button, icon label button, nav actions
30px  — landing pill (chip / example suggestion)
28px  — icon-only button (sidebar collapse, icon btn)
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

---

## File Notes

- Landing screen is rendered inline in `App.tsx`. Do not create `LandingScreen.tsx`.
- All landing CSS lives in `index.css` under `.lnd-*`, `.orb-*`, `.cursor-glow`.
- `AppState` = `'landing' | 'analysis' | 'report' | 'workspace-empty'`
- `'workspace-empty'` = signed-in blank chat (no return to landing for authenticated users).
- `BrandWordmarkVariant` includes `'sidebar'` for the expanded sidebar header.
