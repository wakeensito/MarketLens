---
name: plinths
description: AI market intelligence tool for founders. Two themes (Pale Intelligence, Stealth), single accent per theme, IBM Plex throughout.
themes:
  light:
    label: "Pale Intelligence"
    canvas: "warm parchment"
    accent: "dark ink, amber on the wordmark only"
    signal: "slate blue (oklch 36 0.10 240)"
  stealth:
    label: "Stealth"
    canvas: "neutral near-black (chroma 0)"
    accent: "off-white"
    signal: "warm amber #c9965a (also the logo accent and only colour in the UI)"
colors:
  light:
    bg:                "oklch(98.5% 0.004 80)"
    surface:           "oklch(97% 0.006 80)"
    surface-alt:       "oklch(94% 0.009 80)"
    surface-hover:     "oklch(91% 0.011 80)"
    border:            "oklch(88% 0.006 80)"
    border-mid:        "oklch(80% 0.008 80)"
    border-strong:     "oklch(68% 0.010 80)"
    border-focus:      "oklch(13% 0.008 245 / 0.35)"
    text:              "oklch(13% 0.008 245)"
    text-secondary:    "oklch(44% 0.006 245)"
    text-muted:        "oklch(62% 0.005 245)"
    text-inverse:      "oklch(98.5% 0.004 80)"
    accent:            "oklch(13% 0.008 245)"
    accent-light:      "oklch(13% 0.008 245 / 0.06)"
    accent-border:     "oklch(13% 0.008 245 / 0.14)"
    accent-hover:      "oklch(7% 0.006 245)"
    signal:            "oklch(36% 0.10 240)"
    signal-light:      "oklch(36% 0.10 240 / 0.08)"
    signal-border:     "oklch(36% 0.10 240 / 0.18)"
    logo-accent:       "oklch(68% 0.12 65)"
    logo-accent-mid:   "oklch(73% 0.11 65)"
    logo-accent-ink:   "oklch(57% 0.10 65)"
    success:           "oklch(50% 0.15 152)"
    warning:           "oklch(60% 0.16 67)"
    danger:            "oklch(54% 0.20 23)"
  stealth:
    bg:                "oklch(14% 0 0)"
    surface:           "oklch(18% 0 0)"
    surface-alt:       "oklch(22% 0 0)"
    surface-hover:     "oklch(26% 0 0)"
    border:            "oklch(27% 0 0)"
    border-mid:        "oklch(32% 0 0)"
    border-strong:     "oklch(38% 0 0)"
    border-focus:      "#c9965a40"
    text:              "oklch(93% 0 0)"
    text-secondary:    "oklch(76% 0 0)"
    text-muted:        "oklch(60% 0 0)"
    text-inverse:      "oklch(14% 0 0)"
    accent:            "oklch(93% 0 0)"
    accent-light:      "oklch(93% 0 0 / 0.07)"
    accent-border:     "oklch(93% 0 0 / 0.12)"
    accent-hover:      "oklch(97% 0 0)"
    signal:            "#c9965a"
    signal-light:      "#c9965a1e"
    signal-border:     "#c9965a33"
    logo-accent:       "#c9965a"
    logo-accent-mid:   "#d4a76e"
    logo-accent-ink:   "#a87a3f"
    success:           "oklch(56% 0.14 152)"
    warning:           "oklch(68% 0.15 67)"
    danger:            "oklch(60% 0.18 23)"
typography:
  display:
    fontFamily: "'IBM Plex Serif', Georgia, serif"
    fontSize: "clamp(28px, 4vw, 44px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'IBM Plex Serif', Georgia, serif"
    fontSize: "clamp(22px, 3vw, 32px)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
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
    lineHeight: 1.55
  body-lg:
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  ui:
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace"
    fontSize: "10.5px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.10em"
    textTransform: "uppercase"
  data:
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  sm:    "3px"
  md:    "4px"
  lg:    "6px"
  xl:    "10px"
  input: "16px"
  full:  "9999px"
spacing:
  xxs:  "2px"
  xs:   "4px"
  sm:   "8px"
  md:   "12px"
  base: "16px"
  lg:   "24px"
  xl:   "40px"
  xxl:  "64px"
motion:
  ease-out: "cubic-bezier(0.22, 1, 0.36, 1)"
  ease-out-quart: "cubic-bezier(0.25, 1, 0.5, 1)"
  duration-fast: "180ms"
  duration-base: "280ms"
  duration-slow: "400ms"
  duration-count-up: "700ms — 1200ms (data only)"
components:
  button-primary:
    backgroundColor: "{accent}"
    textColor: "{text-inverse}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "36px"
    fontSize: "13px"
    fontWeight: 600
  button-ghost:
    backgroundColor: "transparent"
    border: "1px solid {border-mid}"
    textColor: "{text-secondary}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "32px"
  chip-pill:
    backgroundColor: "{surface-alt}"
    border: "1px solid {border}"
    textColor: "{text-secondary}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "30px"
  ai-input:
    backgroundColor: "{surface}"
    border: "1px solid {border}"
    rounded: "{rounded.input}"
    padding: "12px 14px"
    fontSize: "15px"
    minHeight-hero: "72px"
    minHeight-compact: "44px"
  brief-section-header:
    indexColor: "{signal}"
    indexFont: "{label}"
    nameFont: "{label}"
    nameColor: "{text-muted}"
    countColor: "{text-muted}"
    separator: "·"  # NOT em-dash
---

# Design System: plinths

## 1. Overview

**Creative North Star: "The Brief, calmly delivered."**

Plinths looks like a private research deliverable that was prepared specifically for the reader. Not a SaaS dashboard, not a chatbot, not a marketing landing. The product earns trust by being calm, specific, and quiet about its own machinery.

Two themes are first-class:

- **Pale Intelligence** (light, default). Warm parchment surfaces, warm-tinted charcoal text, dark-ink for every interaction, slate-blue for data signals, and a single warm-amber wordmark accent that appears nowhere else in the UI. The reader feels like they are reading a document, not using software.
- **Stealth** (dark variant). Pure neutral near-black surfaces (chroma 0, no warm or cool tint), pure off-white text and accent. Warm amber `#c9965a` is the only chromatic colour in the entire UI: it is the data signal, the wordmark, and the focus ring. Reads like a calibrated reference monitor at night.

The two themes share the same type system, the same component shapes, the same motion budget, the same content patterns. Only the surface palette and accent role change. Identity is preserved across them by typography and rhythm, not by colour.

There is no third theme. The system was previously also documenting a "warm dark" mode; that has been retired in favour of Stealth.

**Key Characteristics:**
- Two-theme system, both first-class, both quiet
- IBM Plex Serif / Sans / Mono — three roles, never mixed
- Tonal surface ladder for elevation, no shadows at rest
- One accent role per theme: dark-ink (light) or off-white (stealth)
- One signal role per theme: slate-blue (light) or warm-amber (stealth)
- Logo wordmark amber is the only ornamental colour in light mode and is restricted to the wordmark
- Animation budget: 280ms default, 400ms ceiling, 700-1200ms only for data count-ups
- The shared input layoutId pattern that morphs from landing-centre to workspace-bottom is the system's most distinctive interaction

## 2. Colours

A two-palette system. Each theme picks one chromatic role and one logo role; everything else is a neutral on a deliberate hue axis.

### Pale Intelligence (light, default)

The canvas is warm parchment, biased toward hue 80 (warm yellow-cream), with very low chroma (0.004 to 0.011) so the warmth reads as paper rather than as colour. Text is warm charcoal on hue 245 (the one cool axis in the palette), giving readable contrast that doesn't feel synthetic.

- **Foundation neutrals (hue 80, low chroma):** `--bg` `oklch(98.5% 0.004 80)` → `--surface` `oklch(97% 0.006 80)` → `--surface-alt` `oklch(94% 0.009 80)` → `--surface-hover` `oklch(91% 0.011 80)`. Each step is a real elevation level.
- **Borders:** `--border` `oklch(88% 0.006 80)` (default), `--border-mid` `oklch(80% 0.008 80)`, `--border-strong` `oklch(68% 0.010 80)`. Borders carry hierarchy; shadows are reserved for state.
- **Text:** `--text` `oklch(13% 0.008 245)` (warm charcoal), `--text-secondary` `oklch(44% 0.006 245)`, `--text-muted` `oklch(62% 0.005 245)`. The cool-shifted dark on warm-shifted background is the source of the "expensive paper" feeling.
- **Accent (interaction):** `--accent` `oklch(13% 0.008 245)` — the same dark ink as body text. Every interactive element (buttons, links, focus rings, send affordances) uses this colour. It is the only "non-neutral" treatment in the light theme. Hover lifts to `--accent-hover` `oklch(7% 0.006 245)`.
- **Signal (data):** `--signal` `oklch(36% 0.10 240)` slate blue. Used on report scores, data callouts, the brief-section-header index. Distinct from accent so a "this is data" beat is visible.
- **Logo accent (wordmark only):** `--logo-accent` `oklch(68% 0.12 65)` warm amber. Restricted by rule to the four-bar mark in the wordmark. Never used on a button, never used on a score, never used on a status. The amber's job is to ID the brand and nothing else.

### Stealth (dark variant)

The canvas is pure neutral. Chroma 0 across all neutrals. The eye reads it as graphite or obsidian, not as "dark mode." The single chromatic colour, warm amber `#c9965a`, takes on three jobs at once: data signal, focus ring, and wordmark accent.

- **Foundation neutrals (chroma 0):** `--bg` `oklch(14% 0 0)` ≈ `#1c1c1c` → `--surface` `oklch(18% 0 0)` → `--surface-alt` `oklch(22% 0 0)` → `--surface-hover` `oklch(26% 0 0)`.
- **Borders:** `--border` `oklch(27% 0 0)`, `--border-mid` `oklch(32% 0 0)`, `--border-strong` `oklch(38% 0 0)`. `--border-focus` is the warm amber at 25% opacity.
- **Text:** `--text` `oklch(93% 0 0)` (off-white), `--text-secondary` `oklch(76% 0 0)`, `--text-muted` `oklch(60% 0 0)`. Pure neutral, no warm shift in stealth.
- **Accent (interaction):** `--accent` `oklch(93% 0 0)` — off-white, the inversion of light's dark-ink rule. Buttons and interactive surfaces use the off-white treatment.
- **Signal + logo (single role):** `--signal` and `--logo-accent` both equal `#c9965a` in stealth. This consolidation is intentional: stealth has one accent and one accent only. Data scores, focus rings, the wordmark mark, and any ornamental highlight all use this exact value.

### Semantic colours (both themes)

Three semantic roles, both themes. Each is OKLCH-tuned for the theme it appears in.

| Role | Light | Stealth | Use |
|---|---|---|---|
| `--success` | `oklch(50% 0.15 152)` | `oklch(56% 0.14 152)` | Saturation ≤40 (open market), completed pipeline stages |
| `--warning` | `oklch(60% 0.16 67)` | `oklch(68% 0.15 67)` | Saturation 41–65 (contested), recommendation block tint |
| `--danger`  | `oklch(54% 0.20 23)` | `oklch(60% 0.18 23)` | Saturation >65 (crowded), errors, pipeline failures |

Score colour direction is **inverted for opportunity**: high opportunity is success-coloured, not danger-coloured. The codebase already implements this via `scoreColor(score, invert)`.

### Named Rules

**The Single Accent Rule.** Each theme has exactly one interaction colour. Light: dark ink. Stealth: off-white. Never mix or layer accents within a theme.

**The Single Signal Rule.** Each theme has exactly one data colour. Light: slate blue. Stealth: warm amber. Score colours (success/warning/danger) are not signals; they are categorical labels and only appear on saturation/difficulty/opportunity scores.

**The Logo-Accent Rule (light theme).** Warm amber `oklch(68% 0.12 65)` appears only on the wordmark mark in the light theme. Never on a button, never on a score, never on an alert, never on a tooltip. If amber appears anywhere else in light mode, it is a bug.

**The Stealth Mono-Chroma Rule.** Stealth has exactly one chromatic colour: amber `#c9965a`. The wordmark, the signal, the focus ring, and the data emphasis all use this exact value. The semantic palette (success/warning/danger) is the only exception, and only on score surfaces.

**The Cool-Text-on-Warm-Surface Rule (light theme).** Body text in light mode is biased toward hue 245 (cool charcoal); surfaces are biased toward hue 80 (warm cream). The contrast between the two hue families is the source of the "Pale Intelligence" character. Don't move text colour onto the warm axis or surfaces onto the cool axis.

## 3. Typography

**Display:** IBM Plex Serif (Georgia fallback). Used for landing wordmark, report titles, verdict statements, score values, roadmap phase titles.
**Body:** IBM Plex Sans (system-ui fallback). Used for all running copy, UI labels, and interactive controls.
**Data / Label:** IBM Plex Mono (Courier New fallback). Used for system-generated data: timestamps, brief IDs, elapsed timers, scores, section index numbers, uppercase metadata labels.

The Plex family is the only typeface in the system. Three variants, three roles, no exceptions.

### Hierarchy

| Role | Font | Size | Weight | Line height | Letter spacing | Use |
|---|---|---|---|---|---|---|
| Display | Plex Serif | clamp(28px, 4vw, 44px) | 600 | 1.15 | -0.02em | Landing wordmark, report idea title |
| Headline | Plex Serif | clamp(22px, 3vw, 32px) | 600 | 1.25 | -0.015em | Section heads, verdict statements |
| Title | Plex Serif | 20px | 600 | 1.35 | -0.01em | Pipeline title, modal title, sub-section titles |
| Body Large | Plex Sans | 15px | 400 | 1.6 | 0 | Recommendation copy, report one-liner, modal body |
| Body | Plex Sans | 14px | 400 | 1.55 | 0 | All running copy, gap descriptions, roadmap milestones |
| UI | Plex Sans | 13px | 500 | 1.4 | 0 | Buttons, controls, sidebar labels, nav items |
| Label | Plex Mono | 10.5px | 600 | 1 | 0.10em UPPERCASE | Section index, eyebrows, "PRIMARY FINDING", category tags |
| Data | Plex Mono | 12px | 500 | 1.2 | 0.02em | Brief IDs, timestamps, scores, elapsed timers |

### Named Rules

**The Mono-for-Data Rule.** Anything generated by the system uses Plex Mono. Anything authored by the AI or the user uses Plex Sans (body) or Plex Serif (titles, verdicts). The split is non-negotiable and is the single most important typographic signal in the system.

**The Italic Verdict Rule.** Plex Serif italic appears in exactly one place: the one-sentence recommendation that opens each report. Italic anywhere else dilutes that signal.

**The Body-Width Rule.** Long-form copy is capped at 65–75ch (approximately 580–640px at 14px). Reports are read, not scanned across a wide viewport.

**The No-Gradient-Text Rule.** No `background-clip: text` anywhere. Hierarchy is built from size, weight, and family, not from colour treatment.

## 4. Elevation & Surface

The system is flat at rest. Depth lives in the tonal surface ladder, not in shadows.

### Surface ladder (both themes)

| Layer | Role |
|---|---|
| `--bg` | Page canvas. The lowest surface. |
| `--surface` | Primary card / panel. The default elevated layer above the canvas. |
| `--surface-alt` | Secondary elevation: nested containers, table headers, mini-cards inside cards. |
| `--surface-hover` | State feedback on row hovers and pill hovers. |

Going up one layer means going up one level of importance. Don't skip layers, don't double-stack identical surfaces.

### Shadow vocabulary (state only, never at rest)

- **Focus glow.** Applied to the AI input on `:focus-within`. Light: `0 0 0 3px oklch(13% 0.008 245 / 0.10)` (subtle dark-ink halo). Stealth: `0 0 0 3px #c9965a40` (warm amber halo).
- **Send-button hover lift.** Applied to the primary send affordance on hover only. Light: `0 4px 14px oklch(13% 0.008 245 / 0.18)`. Stealth: `0 4px 14px #00000060`.
- **Modal scrim.** `backdrop-filter: blur(6px)` on the modal backdrop. Both themes.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. If a shadow appears on initial render, it is wrong. Shadows are state feedback only.

**The No-Glassmorphism Rule.** `backdrop-filter` is allowed on the modal scrim only. Card surfaces are solid. Decorative blurs do not appear in the system.

## 5. Components

### Buttons

Three roles: primary, ghost, pill.

- **Primary (Send / Analyse / sign-in CTA).** `--accent` background, `--text-inverse` foreground, 36px height, 6px radius (`{rounded.lg}`), 13px Plex Sans 600. On hover: `--accent-hover` background plus the send-button hover lift shadow. Disabled: 40% opacity, cursor not-allowed.
- **Ghost (secondary actions, top-nav buttons).** Transparent background, 1px `--border-mid`, `--text-secondary` foreground, 32px height, 6px radius (`{rounded.lg}`). On hover: `--surface-alt` fill, `--text` foreground.
- **Pill / Chip (example queries, suggestions).** `--surface-alt` background, 1px `--border`, `--text-secondary` foreground, 30px height, full radius. On hover: `--accent-light` background, `--text` foreground, `--accent-border` border.

### AI Input (signature component)

The single most important component in the system. One implementation, two sizes.

- **Hero size.** Used on landing and workspace empty state. Min height 72px, max 280px (auto-resize). Toolbar row beneath the textarea with: model badge (left), attach affordance (left, only if attachments are wired), Analyse button (right) with text label.
- **Compact size.** Used as the workspace bottom rail during analysis and after a report. Min height 44px, max 180px. Same toolbar pattern but the send button shows arrow only (no label).

The same component instance is shared across landing and workspace via `layoutId="ml-input"` on its motion wrapper. The morph from landing-centre to workspace-bottom is the system's most distinctive interaction.

Visual treatment: `--surface` background, 1px `--border`, 16px radius. On focus-within: `--accent` border, focus-glow halo.

### Brief Section Header (signature pattern)

Every report section opens with a row that reads like an appendix index entry:

```text
01 · COMPETITIVE LANDSCAPE · 8 COMPANIES IDENTIFIED
```

- **Index** (`01`, `02`, `03`): Plex Mono, `--signal` colour, 12px.
- **Separator**: middle dot `·` in `--border-strong`. NOT an em-dash.
- **Name**: Plex Mono uppercase, 10.5px, 0.10em letter-spacing, `--text-muted`.
- **Count** (optional, right-aligned): Plex Mono, `--text-muted`, same size as name.

The middle-dot separator replaces the em-dash used in the previous design system. Em-dashes are banned in user-facing copy and structural patterns.

### Score Cards (Hero Metrics)

Three numeric scores rendered in a row: Saturation, Entry Difficulty, Opportunity. Each is a column with: column label (Plex Sans 13px secondary), score number (Plex Serif 600, count-up animated), bar track + fill (semantic colour), status label (Plex Sans, semantic colour).

The hero metrics row is the single allowed instance of "big number" treatment in the system. It is not the report's lead; the verdict and recommendation precede it.

### Pipeline Tracker

Vertical stack of stage rows, with optional "parallel block" wrappers for stages that run concurrently (e.g., Brave Search and Bedrock Parse in parallel).

Each stage row: 24px circular indicator (left) on a vertical 1px line, body to the right with stage label, elapsed timer (mono), description, and a 1px progress bar that fills during the running state.

Indicator states: pending (`--surface` fill, `--border-mid` stroke, muted minus icon), running (`--accent-light` fill, `--accent` stroke, spinning loader, no glow), done (`--success-light` fill, `--success` stroke, check icon).

### Sidebar (Recent Reports)

Two modes: collapsed (rail, ~52px wide, only mark + new-analysis + avatar) and expanded (~280px wide, full thread list + profile).

Thread item: relative date (Plex Mono, muted), idea text (Plex Sans 14px, `--text`, two-line clamp), saturation score (Plex Mono, semantic colour, with `score · saturation` label).

Section heading "Reports" (renamed from "Briefings"), Plex Mono uppercase 10.5px, `--text-muted`, with a count chip.

### Profile Footer

Avatar circle (logo-accent background in stealth, surface-alt in light), name, plan badge with lightning glyph. Click opens upward-flying menu (theme picker, settings, sign out).

### Modals

Centred dialog on a blurred backdrop. Card surface with 16px radius, 1px `--border`, generous internal padding (24px on mobile, 32px on desktop). Close button top-right at 14px. Modal title in Plex Serif 20px. Body in Plex Sans 15px.

Focus is trapped while open and restored on close. Backdrop click and Escape both close.

## 6. Motion

Motion budget is strict. The product feels expensive because nothing is gratuitous.

### Curve

Single curve: `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quart). Applied to every transition. No bounce, no elastic, no spring physics outside the layoutId morph.

### Durations

| Token | Value | Use |
|---|---|---|
| `duration-fast` | 180ms | Hover state changes, focus rings, dropdown opens |
| `duration-base` | 280ms | Most enter/exit transitions, content reveals |
| `duration-slow` | 400ms | Page-level transitions, modal enter/exit (ceiling) |
| `duration-count-up` | 700ms — 1200ms | Score count-up animations (data only) |

Anything longer than 400ms must be data-driven.

### Patterns

- **Entry.** `opacity 0 → 1` and `translateY 8px → 0`, ease-out-quart, 280ms.
- **Stagger.** 60–90ms between siblings on lists and section reveals.
- **Score count-up.** RAF loop, cubic ease-out, 700–1200ms depending on value range.
- **Layout morph.** The shared input uses `layoutId="ml-input"` with `type: 'spring', stiffness: 280, damping: 36`. This is the only spring in the system.
- **Reduced motion.** When `prefers-reduced-motion: reduce` is set: no parallax, count-ups settle to final values immediately, sequential reveals collapse to instant fade-ins.

### Banned

- Bounce / elastic curves
- Animating layout properties (width, height, top, left). Use transform or opacity.
- Looping idle animations on UI chrome (orbital glows, pulsing dots that aren't status indicators)
- Mouse parallax on hero elements (recently retired from the landing wordmark)
- Anything that animates "AI is working" beyond the pipeline tracker's running state

## 7. Iconography

Single icon library: **lucide-react**. Stroke widths: 1.8 default, 2 for emphasis, 2.5 for status indicators (check, dot). Sizes: 11px (sidebar microcopy), 13px (UI controls), 15px (primary controls), 24px (pipeline indicators).

No emoji glyphs in UI chrome. Use lucide icons or coloured dots.

## 8. Do's and Don'ts

### Do

- Use Plex Mono for all system-generated data: timestamps, brief IDs, scores, section index numbers, elapsed timers.
- Use the tonal surface ladder for elevation. Borders carry hierarchy; shadows carry state.
- Restrict the wordmark amber to the wordmark mark in light mode.
- In stealth, use `#c9965a` as the single chromatic colour for signal, focus, and brand.
- Use middle-dots `·` as separators in structural patterns. Never em-dashes.
- Cap body line length at 65–75ch.
- Lead reports with the recommendation. The metrics come second.
- Honour `prefers-reduced-motion` everywhere motion appears.
- Keep both themes equally polished. Test every change in both before declaring done.

### Don't

- Don't use a third theme. Light + Stealth are the only two. The previously-shipped warm "dark" theme is retired.
- Don't introduce a fourth typeface. Plex Serif / Sans / Mono is complete.
- Don't use gradient text, gradient buttons, or gradient backgrounds anywhere.
- Don't use side-stripe borders (`border-left: 3px solid …` as a card decoration). Use full borders, semantic backgrounds, or numeric prefixes.
- Don't use the hero-metric template (big number + small label + supporting stats + accent gradient). The hero in plinths is the recommendation sentence.
- Don't ship decorative controls. If a button has no behaviour, remove it. If a dropdown has no working alternates, render it as static text.
- Don't add idle-loop animations to UI chrome. The product is fast; the chrome doesn't need to perform speed.
- Don't use em-dashes in user-facing copy or structural patterns. Use commas, colons, periods, or middle-dots.
- Don't use the words "drop", "vibe", "magic", "supercharge", "10x", or "unlock" in copy.
- Don't use a chat-bubble or streaming-text framing on report output. The output is structured, not conversational.
- Don't apply `outline: none` without a visible focus replacement. Accessibility ahead of aesthetics, every time.
