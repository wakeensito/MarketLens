---
name: MarketScout
description: AI-powered market intelligence tool for founders validating business ideas.
colors:
  void-midnight:    "oklch(7% 0.032 245)"
  ink-surface:      "oklch(12% 0.030 244)"
  surface-raised:   "oklch(17% 0.028 242)"
  surface-hover:    "oklch(22% 0.026 240)"
  border-subtle:    "oklch(22% 0.028 242)"
  border-mid:       "oklch(32% 0.024 240)"
  border-strong:    "oklch(46% 0.020 238)"
  frost-white:      "oklch(95% 0.006 220)"
  text-secondary:   "oklch(68% 0.012 230)"
  text-muted:       "oklch(48% 0.012 235)"
  ionosphere-blue:  "oklch(76% 0.22 215)"
  ionosphere-hover: "oklch(82% 0.20 215)"
  scanner-violet:   "oklch(74% 0.28 300)"
  clearance-teal:   "oklch(72% 0.20 168)"
  caution-amber:    "oklch(80% 0.18 68)"
  risk-coral:       "oklch(68% 0.22 22)"
typography:
  display:
    fontFamily: "'IBM Plex Serif', Georgia, serif"
    fontSize: "clamp(22px, 3vw, 30px)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "'IBM Plex Serif', Georgia, serif"
    fontSize: "clamp(20px, 2.8vw, 28px)"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'IBM Plex Serif', Georgia, serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.10em"
rounded:
  sm:   "3px"
  md:   "4px"
  lg:   "6px"
  input: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ionosphere-blue}"
    textColor: "{colors.void-midnight}"
    rounded: "10px"
    padding: "0 16px 0 18px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.ionosphere-hover}"
    textColor: "{colors.void-midnight}"
    rounded: "10px"
    padding: "0 16px 0 18px"
    height: "36px"
  button-ghost:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.frost-white}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  chip-pill:
    backgroundColor: "{colors.ink-surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "30px"
  chip-pill-hover:
    backgroundColor: "oklch(76% 0.22 215 / 0.10)"
    textColor: "{colors.ionosphere-blue}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "30px"
  gap-tag:
    backgroundColor: "oklch(76% 0.22 215 / 0.10)"
    textColor: "{colors.ionosphere-blue}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---

# Design System: MarketScout

## 1. Overview

**Creative North Star: "The Intelligence Brief"**

MarketScout looks like a professional research deliverable, not a SaaS product. Every screen is structured like an analyst's output — numbered sections, dense tables, conclusions before evidence. A founder who opens a report should feel like they're reading something prepared for them by someone who did the work, not like they're using a dashboard.

The system earns trust through restraint. The deep midnight blue environment sets a focused, low-distraction canvas. The electric sky blue accent (Ionosphere Blue) marks every interactive element, focus state, and running process — its rarity signals importance. The scanner violet (Signal) is reserved for a single role: opportunity scores. No other element shares that hue. Color is communication here, not decoration.

Motion is controlled and intentional. Data cards lift and tilt on hover to acknowledge presence — not to animate for its own sake. Stage indicators glow when active. Reveals stagger as content enters view. Nothing runs longer than 400ms unless it's a data-driven count-up. The product feels fast because every transition earns its place.

**Key Characteristics:**
- Dark environment (void midnight canvas), not dark-as-aesthetic but dark-as-focus
- Monospaced section numbering and metadata strips that read like a file system
- Progressive tonal depth: void-midnight → ink-surface → surface-raised, no shadows at rest
- Two accent roles: Ionosphere Blue (interaction) and Scanner Violet (opportunity/signal), never mixed
- IBM Plex type family throughout — Serif for display and verdicts, Sans for body, Mono for metadata and counts
- State feedback that's tactile but controlled: 3D tilts, focus glows, accent left-borders on hover rows

## 2. Colors: The Night Sky Aurora Palette

A dark palette built from blue-shifted OKLCH neutrals. Two accent roles, three semantic signals — all reserved. No color appears without a specific job.

### Primary

- **Ionosphere Blue** (`oklch(76% 0.22 215)`): The primary interaction color. Every clickable element, focus state, running process indicator, active border, and accent tag uses this hue. Its chroma is high for a dark system — it reads as genuinely electric without veering violet. Interactive elements at rest are neutral; Ionosphere Blue appears on hover, active, and running states only.

- **Scanner Violet** (`oklch(74% 0.28 300)`): The signal color. Used exclusively for opportunity scores (gap scores and brief IDs). No button, link, or label uses this color. Its job is to make the number you're evaluating for market entry unmissable. When you see violet, the product is scoring something for you.

### Secondary

- **Clearance Teal** (`oklch(72% 0.20 168)`): Semantic success. Saturation score ≤40 (open market), completed pipeline stages, positive stat direction. The "go" signal.

- **Caution Amber** (`oklch(80% 0.18 68)`): Semantic warning. Saturation score 41–65 (contested market). Also used in the Recommendation card at report bottom. High lightness ensures legibility on dark surface at small sizes.

- **Risk Coral** (`oklch(68% 0.22 22)`): Semantic danger. Saturation score >65 (crowded market), error states, pipeline failures, dominant competitor labels. Never used decoratively.

### Neutral

- **Void Midnight** (`oklch(7% 0.032 245)`): The canvas. The lowest surface in the system. Blue-shifted to avoid the deadness of true black.
- **Ink Surface** (`oklch(12% 0.030 244)`): Card surfaces — the primary elevated layer above the canvas.
- **Surface Raised** (`oklch(17% 0.028 242)`): Secondary elevation. Table headers, toolbar backgrounds, mini-card containers.
- **Surface Hover** (`oklch(22% 0.026 240)`): State feedback on row hovers.
- **Border Subtle** (`oklch(22% 0.028 242)`): Dividers, section boundaries. Nearly invisible — structural, not decorative.
- **Border Mid** (`oklch(32% 0.024 240)`): Scrollbar thumbs, separators that need more visual weight.
- **Border Strong** (`oklch(46% 0.020 238)`): Milestone dots, content dividers that need to read at text size.
- **Frost White** (`oklch(95% 0.006 220)`): Primary text. Cool-tinted rather than pure white.
- **Text Secondary** (`oklch(68% 0.012 230)`): Supporting body copy, labels, non-critical metadata.
- **Text Muted** (`oklch(48% 0.012 235)`): UPPERCASE labels, timestamps, placeholders, counts. Intentionally low-contrast relative to dark surfaces.

### Named Rules

**The Two Accent Rule.** Ionosphere Blue is interaction. Scanner Violet is scoring. These two roles never share a color, and no other roles borrow from either hue. A designer who reaches for violet on a button, or blue on an opportunity score, has broken the system.

**The Dark Tint Rule.** Every neutral surface in this system is tinted toward hue 240–245. There is no true-black or pure-grey anywhere. The blue shift unifies the palette and prevents the flat deadness of neutral dark modes.

## 3. Typography

**Display Font:** IBM Plex Serif (Georgia fallback) — used for report titles, verdict statements, score numbers, stat values, and roadmap phase titles.
**Body Font:** IBM Plex Sans (system-ui fallback) — used for all running copy, UI labels, and interactive controls.
**Label / Mono Font:** IBM Plex Mono (Courier New fallback) — used for section numbers, timestamps, metadata strips, elapsed timers, and any data value that needs fixed-width legibility.

**Character:** The Plex family reads like a research institution's house type — authoritative and neutral, without personality overreach. Serif for the conclusions that matter; sans for the scaffolding; mono for the data that needs to be read at a glance. The three variants create clear hierarchy without ever changing families.

### Hierarchy

- **Display** (IBM Plex Serif, 600, clamp(22px, 3vw, 30px), lh 1.2, ls -0.015em): Report titles and analysis headers. Not a hero typeface — it appears when a named deliverable needs a headline.
- **Headline** (IBM Plex Serif, 600, italic, clamp(20px, 2.8vw, 28px), lh 1.3, ls -0.01em): Verdict statements — the single conclusive sentence above each report's scoring summary. Italic signals a judgment, not a label.
- **Title** (IBM Plex Serif, 600, 20px, lh 1.35, ls -0.01em): Section titles like "Analysing…" in the pipeline view.
- **Body** (IBM Plex Sans, 400, 14px, lh 1.5): All descriptive copy — gap descriptions, roadmap milestones, competitor analysis. Max-width 580–640px to hold line length.
- **Label** (IBM Plex Mono, 700, 10px, ls 0.10em, UPPERCASE): Section metadata — stage numbers, "PRIMARY FINDING", competitor headers, report eyebrows. The uppercase mono register signals system-generated data, not authored prose.

### Named Rules

**The Italic Verdict Rule.** IBM Plex Serif italic appears in exactly one place: the verdict statement that opens each report. It signals judgment. Applying italic to any other element breaks the signal.

**The Mono-for-Data Rule.** If a number or label comes from the system (timestamps, counts, scores, IDs), it uses IBM Plex Mono. If it comes from the AI analysis or the user (ideas, competitor names, gap titles), it uses Sans or Serif. The distinction is immediate and consistent.

## 4. Elevation

This system is flat by default. Depth is expressed through the tonal surface ladder — void-midnight → ink-surface → surface-raised → surface-hover — not through shadows. Shadows are state feedback, not ambient decoration.

At rest, every card sits flush on its surface. The boundary between levels is communicated by background tint, a 1px border (border-subtle or border-mid), and occasionally an inset gloss layer (`oklch(100% 0 0 / 0.04)` — barely visible, adds micro-definition to card tops).

### Shadow Vocabulary

- **Focus Glow** (`0 0 50px oklch(76% 0.22 215 / 0.12)`): Applied to the AI input field on focus. Communicates active state without hard geometry.
- **Stage Active Glow** (`0 0 14px oklch(76% 0.22 215 / 0.40)`): Applied to pipeline stage indicator dots when their stage is running. Signals live activity.
- **3D Tilt Shadow** (`6px 8px 20px oklch(7% 0.032 245 / 0.55), inset 0 1px 0 oklch(100% 0 0 / 0.04)`): Applied to stat cards on hover, combined with `perspective(600px) rotateY(4deg) rotateX(-2deg) translateZ(6px)`. The only decorative lift in the system — used specifically on data stat cards as tactile feedback.
- **Send Button Glow** (`0 0 28px oklch(76% 0.22 215 / 0.35)`): Applied to the primary send button on hover. Reinforces the action state of the most important control on screen.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. If a shadow appears on initial render, it's wrong. Shadows enter only as a response to user action (hover, focus, active pipeline state).

## 5. Components

### Buttons

Primary is action; ghost is secondary action; chip is suggestion.

- **Shape:** Ghost and ghost-variant buttons are gently squared (4px, `--radius-md`). The primary send button is slightly more rounded (10px) to distinguish it as the dominant action. Chip/pill buttons are fully rounded (9999px) for suggestion affordance.
- **Primary (Send / Analyse):** Ionosphere Blue background, Void Midnight text, 10px radius, 36px height. All-caps IBM Plex Sans at 12px, letter-spacing 0.08em. On hover: `ionosphere-hover` background + blue glow (`0 0 28px oklch(76% 0.22 215 / 0.35)`).
- **Ghost:** `ink-surface` background, 1px `border-subtle` border, `text-secondary` text, `radius-md`. On hover: `surface-raised` background, `border-mid` border, `frost-white` text. 32px height.
- **Chip / Pill:** Full radius, `ink-surface` background, `border-mid` border. On hover: `accent-light` background, `ionosphere-blue` text, `accent-border` border. Used for example queries and suggestion affordances.

### Cards / Containers

- **Score Card:** `ink-surface` background, 1px `border-subtle`, `radius-lg` (6px). A 3px colored top border encodes the saturation level — clearance teal for open, caution amber for moderate, risk coral for crowded. 24px internal padding.
- **Stat Card:** `ink-surface` background, 1px `border-subtle`, `radius-md` (4px). On hover: 3D perspective tilt (`rotateY(4deg) rotateX(-2deg) translateZ(6px)`) plus directional shadow. This is the only component in the system with a 3D hover transform.
- **Bottom Cards (Trend / Recommendation):** Use semantic tinted backgrounds — `accent-light` for trend, `warning-light` for recommendation. Internal borders match (`accent-border`, `warning-border`). These are read-only informational surfaces, never interactive.
- **Pipeline Stage (active):** Adds `accent-light` background tint and a 2px left `ionosphere-blue` border when the stage is running. At rest: no decoration.

### Inputs / Fields

- **AI Input:** `ink-surface` (78% opacity) background with `backdrop-filter: blur(24px)`. 16px border radius. Default border: `oklch(76% 0.22 215 / 0.22)` + a 3px left border in `ionosphere-blue`. On focus: border brightens to `oklch(76% 0.22 215 / 0.55)` and a diffuse glow (`0 0 50px oklch(76% 0.22 215 / 0.12)`) expands outward.
- **Style:** The 3px left border accent is the identity element for this input. It persists at rest and on focus, distinguishing it from a generic input. The rest of the border is subtle at rest.
- **Disabled:** 32% opacity, cursor not-allowed.

### Navigation

- **Workspace Header:** Fixed 52px bar. `oklch(9% 0.030 244 / 0.88)` background with `backdrop-filter: blur(18px) saturate(150%)`. 1px `border-subtle` bottom border. Logo: IBM Plex Sans (word) + IBM Plex Serif (accent word). Nav badge: IBM Plex Mono, 10px, uppercase, `ionosphere-blue` on `accent-light` background, full-radius.

### Signature Components

**Brief Section Header.** Every report section opens with a numbered header — mono index in `ionosphere-blue`, an em-dash in `border-strong`, section name in `text-secondary` uppercase at 10px, and an optional count in `text-muted` mono at right. This pattern (01 — COMPETITORS 8 found) is the system's most distinctive recurring element. It reads like a brief appendix index.

**Pipeline Stage Indicator.** A 24px circle with a 1.5px border sits on a vertical 1px line. At rest: `ink-surface` fill, `border-mid` stroke. Running: `accent-light` fill, `ionosphere-blue` stroke, 14px glow halo. Done: `success-light` fill, `clearance-teal` stroke. The state transitions are animated via Framer Motion.

## 6. Do's and Don'ts

### Do:

- **Do** use IBM Plex Mono for all system-generated data: timestamps, counts, section numbers, IDs, elapsed timers. Never body copy.
- **Do** use the tonal surface ladder (void-midnight → ink-surface → surface-raised) to communicate hierarchy. One step up = one level of importance.
- **Do** limit Ionosphere Blue to interactive and active states. It should appear infrequently enough that its presence always signals something clickable or running.
- **Do** reserve Scanner Violet for opportunity scores only. No other element in the interface takes that hue.
- **Do** use semantic color (teal/amber/coral) to encode market saturation status on score cards — the colored top border is the only decoration those cards carry.
- **Do** keep body copy max-width at 580–640px. The reports are meant to be read, not scanned across a wide viewport.
- **Do** use the brief-section-header pattern (mono index + dash + uppercase label) for every report section. Consistency here is what makes the report feel like a structured deliverable.
- **Do** apply `prefers-reduced-motion` to all Framer Motion animations. The cosmetic pipeline animation especially must respect this.

### Don't:

- **Don't** use gradient text on any UI copy or labels. The wordmark logo is the sole exception and is a locked identity element, not a pattern.
- **Don't** build generic SaaS dashboard surfaces: pastel cards, excessive border-radius, icon + heading + body card grids, "Get started" button energy. MarketScout looks like a research tool, not a B2B SaaS product.
- **Don't** use a chat-bubble or conversational framing for any part of the analysis flow. The interface is structured output, not a dialogue.
- **Don't** add confetti, gradient CTAs, progress celebrations, or growth-hacker marketing copy patterns.
- **Don't** use shadows at rest. Elevation is communicated through surface tint and borders. A card that starts with a drop-shadow looks wrong here.
- **Don't** reuse Scanner Violet outside gap/opportunity scores. It is a single-purpose semantic signal.
- **Don't** apply the 3D tilt transform to anything other than stat data cards. It is a purposeful exception that communicates "this data is interactive," not a card hover template.
- **Don't** introduce a fourth typeface or use system-ui serif as a display face. The Plex family is complete: Serif for display, Sans for copy, Mono for data.
- **Don't** animate layout properties (width, height, top, left). All motion uses `opacity`, `transform`, and `filter` only.
