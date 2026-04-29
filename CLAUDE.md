# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**MarketLens** — AI-powered market intelligence platform. Users type a business idea and receive a competitive landscape, saturation score, and entry roadmap.

The repository contains:
- `docs/` — authoritative engineering specs (architecture, microservices, AI pipeline, data model)
- `frontend/` — React/TypeScript UI (the only code that exists today; backend is not yet built)

## Frontend Commands

All commands run from `frontend/`:

```bash
bun dev          # dev server with hot reload
bun run build    # type-check + production build (tsc -b && vite build)
bun run lint     # ESLint
bun run preview  # serve the production build locally
```

No tests yet. Run `bun run build` to catch type errors — that is the verification step.

## TypeScript Rules (verbatimModuleSyntax is ON)

- Use `import type { Foo }` or `import { type Foo }` for all type-only imports.
- Framer Motion `ease` values inside `Variants` objects must be string literals: `'easeOut' as const`. Bezier arrays don't compile — use named strings only.

## Architecture

**State machine** (`App.tsx`): `'landing' | 'analysis' | 'report'`. A `requestAnimationFrame` loop in `runPipeline()` drives stage timing from `mockData.ts`; a ref + `cancelAnimationFrame` handles cleanup on reset/unmount.

**Data flow**:
- `mockData.ts` — `PIPELINE_STAGE_DEFS` (timing metadata), `MOCK_REPORT` (static payload), `EXAMPLE_QUERIES`. When the backend exists, replace `MOCK_REPORT` with an API fetch and drive stage updates from SSE/WebSocket instead of the RAF loop.
- `types.ts` — single source of truth for all shared interfaces (`MarketReport`, `PipelineStage`, `AppState`, etc.).

**Active components**:
- `LandingScreen` — full-screen hero with command field input and animated cycling placeholder
- `Header` — sticky bar during `analysis`/`report`; shows query label, Beta badge, New analysis button
- `PipelineTracker` — 9 pipeline stages; stages sharing a `parallelGroup` are grouped into a `ParallelBlock` with mini cards
- `ReportView` — full intelligence brief; contains `VerdictDeclaration`, `BriefSectionHeader`, `CompetitorTable`, `GapRow`, `RoadmapRow`, `StatCard` as internal sub-components
- `SaturationGauge` — RAF count-up animation on the saturation score number

**Dead code** (wizard flow was removed): `IdeaScreen.tsx`, `IndustryScreen.tsx`, `StageScreen.tsx`, `WizardNav.tsx`, `SearchHero.tsx` — safe to delete.

**Styling**: single `src/index.css` with CSS custom properties. No CSS modules, no Tailwind. IBM Plex fonts loaded from Google Fonts in `index.html`.

## Design System — Night Sky Aurora

**Direction**: Deep midnight blue + electric sky blue accent + violet signal. Dark mode. Feels electric and premium — Gen Z professional, not corporate dashboard.

**Color tokens** (OKLCH) — all in `src/index.css` `:root`:
```
--bg:              oklch(7%  0.032 245)    deep space blue-black
--surface:         oklch(12% 0.030 244)    midnight navy
--accent:          oklch(76% 0.22 215)     electric sky blue — all interactions
--accent-hover:    oklch(82% 0.20 215)
--signal:          oklch(74% 0.28 300)     electric violet — gap scores, brief ID
--success:         oklch(72% 0.20 168)     cyan-teal
--warning:         oklch(80% 0.18 68)      amber
--danger:          oklch(68% 0.22 22)      coral-red
--text:            oklch(95% 0.006 220)    cool near-white
--text-secondary:  oklch(68% 0.012 230)
--text-muted:      oklch(48% 0.012 235)
--border:          oklch(22% 0.028 242)    blue-tinted
```

**Depth**: borders-only on surfaces. Left-rail `2px solid var(--accent)` for active/running states. Running stage indicators glow: `box-shadow: 0 0 14px oklch(76% 0.22 215 / 0.40)`.

**Saturation score color** rule: ≤40 → `--success`, ≤65 → `--warning`, >65 → `--danger`. Applied via `scoreColor()` in `SaturationGauge.tsx`.

**Landing page**:
- Three aurora orbs: sky blue (bottom-left), violet (top-right), indigo (center) — CSS `@keyframes orb-drift`
- Mouse-tracking 3D tilt on the "MarketLens" wordmark via Framer Motion `useMotionValue` + `useSpring` + `rotateX/Y` transforms in `LandingScreen.tsx`
- "Lens" in `landing-wordmark-accent` gets an aurora gradient: sky blue → indigo → violet, with `drop-shadow` glow

**Key patterns**:
- *Command field* — glass morphism (`backdrop-filter: blur(24px)`), sky blue left border, glow on focus-within
- *Brief metadata strip* — `MS-YYYY-XXXX · Date · Full Spectrum Analysis` in mono above each report; ref ID uses `--signal` violet
- *Verdict declaration* — IBM Plex Serif italic in semantic color, no card wrapper; this is the signature element
- *Section headers* — `01 — COMPETITIVE LANDSCAPE` format: `brief-section-num` (accent), em-dash, uppercase name, count right-aligned
- *Gap scores* — use `--signal` violet, not `--text`
- *Competitor avatars* — 30px circles with 2-letter initials, colors cycle through 6 OKLCH presets in `ReportView.tsx`

## Animation

- Entry: `opacity 0→1` + `y 8→0`, `easeOut`, ~0.35–0.4s
- Stagger children: `0.06–0.09s`
- Scroll reveals: `whileInView` + `viewport={{ once: true, margin: "-60px" }}`
- Score count-up: RAF loop, cubic ease-out, 700–1200ms
- Nothing longer than 400ms except data-driven count-ups

## Docs

`docs/` is the source of truth for backend specs. Pipeline timing in `mockData.ts` mirrors `docs/03-ai-pipeline.md` — keep them in sync when wiring up the real backend.
