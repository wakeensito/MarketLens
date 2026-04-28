# Market Scout — Interface Design System

## Intent
A founder about to make a real bet on an idea. They need a trusted verdict, not a data dashboard. The interface must feel like it came from an actual intelligence service — decisive, authoritative, precise.

## Direction: Intelligence Brief

### Who
Founders, product people, early-stage entrepreneurs. Anxious + curious. Sitting between meetings or whiteboard sessions. They want clarity, not data.

### What
Type an idea → get a verdict on whether the market is worth entering.

### Feel
Trusted analyst giving you the real answer. A classified intelligence briefing — not a corporate report.

---

## Palette

### Foundation
```
--bg:           oklch(97.5% 0.012 75)   warm parchment — distinctive, not cold white
--surface:      #FFFFFF
--surface-alt:  oklch(98% 0.008 75)     barely warm
--surface-hover oklch(96% 0.014 75)
```

### Borders (warm-neutral, no blue tint)
```
--border:       #E6E2DC
--border-mid:   #CEC9C0
--border-strong:#A8A299
```

### Text (warm dark)
```
--text:          #1A1714
--text-secondary:#57534E
--text-muted:    #9C9188
```

### Accent — deep rich indigo (interaction only)
```
--accent:       oklch(50% 0.26 278)
--accent-light: oklch(50% 0.26 278 / 0.08)
--accent-border:oklch(50% 0.26 278 / 0.22)
--accent-hover: oklch(43% 0.26 278)
```

### Signal — warm amber ("pay attention to this finding")
```
--signal:       oklch(62% 0.18 60)
--signal-light: oklch(62% 0.18 60 / 0.10)
--signal-border:oklch(62% 0.18 60 / 0.28)
```
Used on: gap opportunity scores, briefing reference numbers, key data highlights.
NOT used on: interactive elements (that's indigo).

### Semantic (perceptually balanced at equal lightness)
```
--success:      oklch(50% 0.18 155)   emerald
--warning:      oklch(64% 0.18 62)    amber
--danger:       oklch(50% 0.22 22)    coral-red
```

---

## Typography — IBM Plex Family

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| Display | IBM Plex Serif | 600, italic | Verdict statements, report titles |
| Body | IBM Plex Sans | 400–600 | All UI, labels, body |
| Mono | IBM Plex Mono | 400–700 | Metrics, brief codes, elapsed time, reference IDs |

---

## Depth Strategy: Borders-only

- No box-shadows on cards or surfaces
- Left-rail accent (2px `--accent` border-left) for active/running states
- Focus ring: `0 0 0 3px oklch(50% 0.26 278 / 0.1)`
- Elevated inputs: slightly darker bg (`oklch(95.5% 0.018 75)`) — "inset" feel

---

## Spacing Base: 4px

Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 60

---

## Signature: The Typographic Verdict

Every report opens with a `VerdictDeclaration` — IBM Plex Serif italic, large, in the semantic color. NOT a card or banner. A typographic statement:

> *"This market has meaningful whitespace."*

Preceded by a `FINDING` eyebrow label in mono uppercase, followed by a supporting sentence in `--text-secondary`.

This makes the product feel like something a serious person trusts.

---

## Component Patterns

### Command Field (landing search)
```
.command-field — warm inset bg oklch(95.5% 0.018 75), 16px radius, left 3px indigo border
.command-prompt — › symbol in mono, indigo, 0.65 opacity
.command-submit — full-height flush button, indigo, uppercase label, no radius
```

### Brief-Coded Section Headers
```
01 — COMPETITIVE LANDSCAPE        5 companies identified
```
- `brief-section-num`: indigo mono 10px
- `brief-section-dash`: border-strong color
- `brief-section-name`: text-secondary uppercase 10px tracking 0.12em
- `brief-section-count`: text-muted mono, right-aligned

### Briefing Metadata Strip
```
MS-2026-XXXX  |  April 28, 2026  |  Full Spectrum Analysis
```
Mono 10px, amber for ref ID, separator bars.

### Competitor Table
Avatar colors cycle through: indigo → amber → emerald → coral → violet → blue
28×28px circles with 2-letter initials.

### Pipeline — Active State
Running stage gets: `border-left: 2px solid --accent`, subtle indigo bg wash.
`.pipeline-stages::before`: vertical connecting line at left: 11px.

### Score Card
`score-card--low/mid/high`: 3px top border in success/warning/danger.
Number color determined by semantic color (not text), via `scoreColor()` in SaturationGauge.

---

## Background: Landing Page
Three-color gradient mesh on warm parchment:
- Indigo blob: bottom-left (8%, 88%)
- Amber blob: top-right (90%, 12%)
- Emerald blob: bottom-right (72%, 80%)
- Indigo dot grid: 28×28px, 12% opacity
- White radial fade center
