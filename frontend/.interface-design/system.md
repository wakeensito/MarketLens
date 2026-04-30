# MarketLens — Interface Design System

## Intent
A founder about to make a real bet on an idea. They need a trusted verdict fast. The interface must feel electric and premium — decisive, authoritative, and visually addictive. Gen Z professional energy, not corporate dashboard.

## Direction: Night Sky Aurora

### Who
Founders, product people, early-stage entrepreneurs. Sitting between meetings, excited about an idea. They want a verdict, not data.

### What
Type an idea → get a competitive landscape, saturation score, and entry roadmap.

### Feel
Deep space intelligence terminal. Aurora borealis meets premium SaaS. Dark, electric, alive.

---

## Palette

### Foundation — deep midnight blue
```
--bg:              oklch(7%  0.032 245)    deep space blue-black
--surface:         oklch(12% 0.030 244)    midnight navy
--surface-alt:     oklch(17% 0.028 242)
--surface-hover:   oklch(22% 0.026 240)
```

### Borders — blue-tinted
```
--border:          oklch(22% 0.028 242)
--border-mid:      oklch(32% 0.024 240)
--border-strong:   oklch(46% 0.020 238)
```

### Text — cool near-white
```
--text:            oklch(95% 0.006 220)
--text-secondary:  oklch(68% 0.012 230)
--text-muted:      oklch(48% 0.012 235)
```

### Accent — electric sky blue (all interactions)
```
--accent:          oklch(76% 0.22 215)
--accent-light:    oklch(76% 0.22 215 / 0.10)
--accent-border:   oklch(76% 0.22 215 / 0.25)
--accent-hover:    oklch(82% 0.20 215)
```

### Signal — electric violet ("pay attention to this")
```
--signal:          oklch(74% 0.28 300)
--signal-light:    oklch(74% 0.28 300 / 0.12)
--signal-border:   oklch(74% 0.28 300 / 0.30)
```
Used on: gap opportunity scores, briefing reference IDs.
NOT used on: interactive elements (that's sky blue).

### Semantic
```
--success:         oklch(72% 0.20 168)    cyan-teal
--warning:         oklch(80% 0.18 68)     amber
--danger:          oklch(68% 0.22 22)     coral-red
```

---

## Typography — IBM Plex Family

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| Display | IBM Plex Serif | 600, italic | Verdict statements, report titles |
| Body | IBM Plex Sans | 400–600 | All UI, labels, body |
| Mono | IBM Plex Mono | 400–700 | Metrics, brief codes, elapsed time, reference IDs |

### Size scale
```
10px / 700 / tracking 0.08–0.1em  — uppercase labels, section headers, eyebrows, badges
11px / 500–600                    — mono metadata, taglines, strength labels, mini-card text
12px / 400–500                    — secondary descriptors, stage descriptions, elapsed
13px / 400–600                    — primary body, table content, stage labels, pill text
14px / 400–600                    — main body paragraphs, gap descriptions, body text
20px / 600                        — stat card values, pipeline title sub
52px / 600                        — saturation score number (display)
clamp(20–28px) / 600 italic       — verdict statement (display)
clamp(72–140px) / 300 + 600       — wordmark (display)
```

### Letter-spacing scale
```
0.06em  — light label tracking (section nums, roadmap badges)
0.08em  — standard label tracking (nav badge, stat labels, comp mono)
0.10em  — heavier eyebrow tracking (score card label, report overline)
0.12em  — section name tracking (brief-section-name)
0.18em  — maximum loose (landing eyebrow only)
```

---

## Transitions

```
0.12s               — table row background hover (fastest, content-level)
0.15s               — border-color, color, background (standard interactive)
0.20s               — border-color, background, box-shadow (state changes: running→done)
0.25s               — transform + box-shadow (3D card hover)
0.08s linear        — progress bar fill (real-time data)
1.2s cubic-bezier(0.22,1,0.36,1) — score bar reveal (dramatic, one-shot)
```

Never mix speeds within a single element's transition. Slower feels heavier; faster feels instant. 0.15s is the baseline — only go slower when the state change is meaningful (score reveal, stage completion).

---

## Radius Scale

```
--radius-sm    3px      table header corners, category tags, gap/accent tags
--radius-md    4px      ghost/export/retry buttons, stat cards, mini pipeline cards
--radius-lg    6px      score card, error strip, bottom tinted cards
--radius-full  9999px   nav badge, landing pills, scrollbar thumb
```

**Input system uses intentionally larger values** — do not apply to other UI:
```
16px   main AI input container
12px   compact AI input
10px   send/submit button
8px    model selector trigger, dropdown menu items, attach button
```

---

## Button Patterns

```
Primary (send/CTA)
  height 36px  |  padding 0 16px 0 18px  |  radius 10px
  bg --accent  |  color --text-inverse  |  font-body 12px/700 uppercase 0.08em
  hover: --accent-hover + box-shadow 0 0 28px --accent/0.35
  disabled: opacity 0.32

Ghost (header actions, "New analysis")
  height 32px  |  padding 0 12px  |  radius --radius-md
  border 1px --border  |  color --text-secondary  |  font-body 12px/500
  hover: --border-mid border, --text color, --surface-alt bg

Action (export, retry, secondary)
  height 32px  |  padding 0 14px  |  radius --radius-md
  uses surface or accent-light bg depending on context  |  font 12px/500–600

Landing pill (example suggestions)
  height 30px  |  padding 0 12px  |  radius --radius-full
  border 1px --border-mid  |  bg --surface  |  color --text-secondary
  hover: accent-border + accent color + accent-light bg

Badge (nav, metadata labels)
  padding 4px 8px  |  radius --radius-full  |  font-mono 10px/500 uppercase
  uses accent color on accent-light bg
```

---

## Status Encoding

Used consistently across pipeline stages, strength indicators, score states, and semantic feedback:

```
done / success / low saturation (≤40)    --success   cyan-teal
running / active / focus                 --accent    electric blue
warning / moderate saturation (41–65)    --warning   amber
error / failed / high saturation (>65)   --danger    coral-red
pending / neutral / disabled             --text-muted + --border-mid
special signal / gap score / brief ID    --signal    violet
```

---

## Depth Strategy: Borders-only + Glow

- No box-shadows on cards or surfaces
- Left-rail accent (2px `--accent` border-left) for active/running states
- Running stage indicators: `box-shadow: 0 0 14px oklch(76% 0.22 215 / 0.40)`
- Command field focus: outer glow `0 0 50px oklch(76% 0.22 215 / 0.12)`
- Stat cards: 3D perspective hover only (no persistent shadow)

---

## Spacing Base: 4px

Scale: 4, 8, 12, 14, 16, 18, 20, 24, 28, 32, 40, 60

```
4px   micro — dots, small gaps within a component
8px   tight — icon-to-label, inline gaps
12px  compact — tag padding, small section gaps
14px  standard — stage row gaps, section gaps
18px  card — primary row/card padding (top/bottom)
20px  card wide — card side padding, section margin
24px  loose — larger padding, pipeline header
28px  page — horizontal page padding (desktop)
32px  section — between major report sections
40px  page-top — landing, report top padding
60px  hero — landing vertical padding
```

### Interactive element heights (3-tier)
```
62px  — command-submit (primary CTA, command field height)
32px  — header-btn-ghost (standard nav actions)
30px  — landing-pill (chip / example suggestion buttons)
```

---

## Signature: The Landing Aurora + 3D Wordmark

**Three animated orbs** create aurora depth behind the hero:
- Orb 1: sky blue radial, bottom-left, `orb-drift` 16s
- Orb 2: violet radial, top-right, `orb-drift` 20s reverse
- Orb 3: indigo radial, center-right, `orb-drift` 13s 5s delay

**3D mouse-tracking wordmark**: Framer Motion `useMotionValue` tracks normalized mouse position across the landing container. `useSpring` (stiffness 80, damping 18) feeds `rotateX/Y` on the `<h1>`, max ±8°. Cursor glow blob also tracks via `x/y` spring transforms.

**"Lens" aurora gradient**: sky blue → indigo → violet, with `drop-shadow` glow.

---

## Signature: The Typographic Verdict

Every report opens with a `VerdictDeclaration` — IBM Plex Serif italic, large, in the semantic color. NOT a card or banner:

> *"This market has meaningful whitespace."*

Preceded by `FINDING` eyebrow label (mono uppercase), followed by supporting sentence in `--text-secondary`.

---

## Component Patterns

### Command Field (landing search)
```
background:      oklch(12% 0.030 244 / 0.78) — glass
backdrop-filter: blur(24px) saturate(160%)
border-left:     3px solid var(--accent)
border:          1px solid oklch(76% 0.22 215 / 0.22)
.command-prompt: › symbol in mono, sky blue, 0.6 opacity
.command-submit: full-height flush button, sky blue bg, uppercase label
```

### Brief-Coded Section Headers
```
01 — COMPETITIVE LANDSCAPE        5 companies identified
```
- `brief-section-num`: sky blue mono 10px
- `brief-section-dash`: `--border-strong` color
- `brief-section-name`: `--text-secondary` uppercase 10px tracking 0.12em
- `brief-section-count`: `--text-muted` mono, right-aligned

### Briefing Metadata Strip
```
MS-2026-XXXX  |  April 28, 2026  |  Full Spectrum Analysis
```
Mono 10px, violet (`--signal`) for ref ID, separator bars.

### Competitor Table
Avatar colors cycle through 6 OKLCH presets (indigo, amber, emerald, coral, violet, blue).
30×30px circles with 2-letter initials, dark text overlay.

### Pipeline — Active State
Running stage: `border-left: 2px solid --accent`, sky blue bg wash `oklch(76% 0.22 215 / 0.05)`.
`.pipeline-stages::before`: vertical connecting line at `left: 11px`.

### Score Card
`score-card--low/mid/high`: 3px top border in success/warning/danger.
Score number color via `scoreColor()` in `SaturationGauge.tsx` — not `--text`.

### Interactive Row (left-accent-on-hover)
Used on gap rows and roadmap phases. Do not use on table rows (they use bg only).
```css
border-left: 2px solid transparent;
padding-left: 0;
transition: background 0.15s, border-color 0.15s;
:hover { background: --surface-alt; border-left-color: --accent-border; padding-left: 12px; }
```

---

## File Notes

- `LandingScreen.tsx` — deleted. The landing screen is rendered inline in `App.tsx`.
  All landing CSS lives in `index.css` under `.lnd-*`, `.orb-*`, and `.cursor-glow` classes.
  Do not recreate `LandingScreen.tsx` as a separate component.
