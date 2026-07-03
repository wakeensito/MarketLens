# iOS Milestone 5 — Build Brief + three-surface navigation — Design

**Status:** approved, ready for implementation plan
**Branch:** `feat/ios-m5-build-brief` (stacked on `feat/ios-m4-muse`, PR #60)
**Depends on:** M4 Muse (report ⇄ muse two-face surface + `MuseStore`)

## Overview

M5 adds the **Build Brief** surface — a founder-altitude "what would it take to
build this" deliverable derived from a report — and grows the navigation from
M4's two faces (report ⇄ muse) into **three** (report / build brief / muse).
Mock-only; no live generation until M7.

Two things ship together because they're inseparable: the third surface can't
exist without a three-way nav, and the nav is where the user's request lives —
*"navigate from the chat box, using the same symbols for report, build brief,
and muse."* This mirrors the web's **composer destination glyphs**
(`AnimatedAiInput.tsx` nav-glyph group) rather than its header tabs.

Reference (native port source): `frontend/src/components/BuildBrief.tsx`,
`frontend/src/hooks/useBuildBrief.ts`, `frontend/src/types.ts:190-228`
(`BuildBrief`), `frontend/src/mockData.ts:197-294` (`MOCK_BUILD_BRIEF`),
`frontend/src/components/AnimatedAiInput.tsx:41-52,239-255` (the nav glyphs).

### In scope
- Three-face report surface (report / build brief / muse) with composer-toolbar
  destination glyphs.
- The Build Brief surface: generate flow (invite → skeleton → brief), the full
  brief body, copy-as-markdown.
- Build Brief model + 3 per-report mock fixtures + an in-memory generate-state store.
- **Relocating M4's nav** from the per-face top bars into a shared docked composer.

### Out of scope (later milestones)
- **M6:** Pro gating / paywall. iOS is free-during-beta / no in-app payment, so
  Build Brief is **ungated** here (everyone can generate); the upsell placeholder
  is M6. The web's `locked` (Pro upsell) state is NOT built.
- **M7:** live generation API (the mock "Generate" reveals canned content), real
  copy/analytics, across-launch persistence, the test target.
- **Max features** — unchanged, out of scope.

## Decisions (locked during brainstorming)

1. **Nav = composer-toolbar destination glyphs (3-way).** In the docked composer,
   render the glyphs for the **two surfaces you are not on** — `▬▬` report ·
   build brief · `message` muse. Tap → switch face. The composer is
   **always the Muse composer**: submitting from any face asks Muse and switches
   to the Muse face. No tabs, no split-screen (Plinths' locked single-attention).
2. **This relocates M4's nav.** M4 put the destination-toggle in `MemoView`/
   `MuseView` top bars; M5 moves it into the shared composer and supersedes M4's
   `hasThread`-gated chat-bubble — all three surfaces are always reachable via
   their glyph.
3. **Build Brief is generated on demand** (invite → skeleton → brief), persisted
   per report for the session. Ungated in beta.
4. **Three per-report brief fixtures**, keyed by reportKey: `digitalFitness`
   (canonical, ports web `MOCK_BUILD_BRIEF`), `crowded` (creator-economy),
   `open` (construction-SaaS). The `isTechDominant: false` low-tech branch is
   built and shown in a `#Preview` (no report idea triggers it naturally).
5. **Amber-only.** Complexity is number + label (no green/red, same as
   saturation). `BUILD` reads amber (the differentiator); `BUY` reads mono/
   `textSecondary`. Distinguished by treatment + label, never a second hue.
   Nothing added to `Theme.swift`.

## Architecture

### Three faces
```swift
enum ReportFace: Equatable { case report, brief, muse }   // was: report, muse
```
`ReportSurface` (M4) becomes a three-way container. It owns `face`, the Muse
citation `highlight`, the Muse `pendingAsk` (all from M4), and injects the new
`BuildBriefStore`. Its `body` switches:
- `.report` → `MemoView(...)`
- `.brief`  → `BuildBriefView(reportKey:...)`
- `.muse`   → `MuseView(...)`

A single **`onNavigate: (ReportFace) -> Void`** replaces M4's `onToggleToMuse`/
`onToggleToReport`; each face's composer calls it. Navigating to `.report`
clears `highlight` (as M4's toggle did).

### The shared composer (`Muse/WorkspaceComposer.swift`, new)
Replaces the per-face `MuseComposer` on all three faces. Layout: a leading
**nav-glyph row** + the Muse text field + amber send.
```swift
struct WorkspaceComposer: View {
    let current: ReportFace
    let onNavigate: (ReportFace) -> Void
    var placeholder: String = "Ask about this report…"
    let onSubmit: (String) -> Void
}
```
- **Nav glyphs** (`Muse/NavGlyphRow.swift`, new): fixed order
  `[.report, .brief, .muse]`, rendered for every case **except `current`** →
  always exactly the other two, stable positions. Each is an icon button
  (`SaturationToggleMark` / `Image(systemName: "square.grid.2x2")` /
  `Image(systemName: "message")`), amber, ≥44×44, with `accessibilityLabel`
  `Open report` / `Open build brief` / `Open chat`.
- Submitting routes to Muse via the existing M4 path (report/brief composer →
  `pendingAsk` + navigate to `.muse`; the Muse face appends directly).

> **SF Symbol for Build Brief:** `square.grid.2x2` (reads as blocks/modules,
> matching the web's lucide `Blocks`). Pin at build; alternative `cube`.

### Top bars after relocation
`MemoView` / `MuseView` / `BuildBriefView` top bars keep the back chevron `‹`
(→ `onBack`) and each surface's own context action only:
- report → `ShareLink(item: memoMarkdown(memo))` (unchanged)
- muse → (per-turn actions live in the thread; top bar is just back)
- brief → copy-as-markdown lives in the brief's action row (not the top bar)

The destination-toggle glyphs are gone from all top bars.

## Build Brief surface (`BuildBrief/`)

### `BuildBriefView.swift` — the state machine
Reads `BuildBriefStore`; drives:
- **`.idle`** → `BuildBriefInvite` (`BuildBrief/BuildBriefInvite.swift`): a calm
  centered card — blocks glyph, headline "Turn this idea into a build brief.",
  a `Generate build brief` button (amber). Tapping sets the store to
  `.generating`.
- **`.generating`** → `BuildBriefSkeleton` (`BuildBrief/BuildBriefSkeleton.swift`):
  animated placeholder bars (~1.5s), echoing the pipeline-loading register.
  A `.task` sleeps ~1.5s then sets the store to `.ready`.
- **`.ready`** → `BuildBriefBody(brief:)`.
Docked `WorkspaceComposer(current: .brief, …)` at the bottom in every state.

### `BuildBriefBody.swift` — the brief, in the web's order
1. **Conclusion strip** — if `isTechDominant == false`, a single "Not
   technology-dominant" card (`BuildBrief/BuildBriefLowTechCard.swift`). Else two
   cells: **Build complexity** (`complexityScore`/100 + `complexityLabel`,
   amber — no threshold colors — with a "Driven by {drivers}" line) and
   **Effort** (`effort.timeframe` large, `effort.teamShape` sub).
2. **Capabilities · build or buy** — each `BuildBriefCapability` as a row
   (`BuildBrief/CapabilityRow.swift`): `name` + a `BUILD`/`BUY` tag
   (`BuildOrBuyTag`: BUILD amber-filled, BUY mono hairline) + `description` +
   `recommendation` (eyebrow "Recommended").
3. **Foundation · vendor-neutral** — intro line, then each `BuildBriefPrimitive`
   (`FoundationRow.swift`): `primitive` + `cloudExamples` (mono) + `why`.
4. **MVP scope** — the `mvpScope` paragraph.
5. **Technical risks** — each `BuildBriefRisk` indexed `R1`/`R2`… + title + description.
6. **Foundations & Limits** — FIXED copy (not fixture data): 4 principles
   (least privilege · managed services · one cloud · secure defaults) + a limit
   disclaimer ("AI isn't always right. Treat this as a starting point…").
7. **Action row** — a `copy as markdown` button (`buildBriefMarkdown(_:)` helper,
   `BuildBrief/BuildBriefMarkdown.swift`) + a "Generated {Mon D}" timestamp.

## Models & mock content

### `Models/BuildBrief/BuildBriefModel.swift` (verbatim from `types.ts:190-228`)
```swift
enum BuildOrBuy: String, Equatable { case build, buy }

struct BuildBriefCapability: Identifiable, Equatable {
    let id = UUID()
    let name: String
    let description: String
    let buildOrBuy: BuildOrBuy
    let recommendation: String
}
struct BuildBriefPrimitive: Identifiable, Equatable {
    let id = UUID()
    let primitive: String
    let why: String
    let cloudExamples: String
}
struct BuildBriefRisk: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let description: String
}
struct BuildBriefEffort: Equatable {
    let timeframe: String
    let teamShape: String
}
struct BuildBrief: Equatable {
    let isTechDominant: Bool
    let complexityScore: Int
    let complexityLabel: String
    let complexityDrivers: [String]
    let capabilities: [BuildBriefCapability]
    let foundation: [BuildBriefPrimitive]
    let mvpScope: String
    let effort: BuildBriefEffort
    let technicalRisks: [BuildBriefRisk]
}
```
Fixed copy (module constants): `BuildBriefCopy.principles: [String]` (4) and
`BuildBriefCopy.limit: String`.

### `Models/BuildBrief/MockBuildBrief.swift`
- `MockBuildBrief.brief(for reportKey: String) -> BuildBrief` → 3 fixtures:
  - `digitalFitness` — ports web `MOCK_BUILD_BRIEF`: `isTechDominant: true`,
    complexity 58 "Moderate", drivers [real-time adaptive logic, wearable &
    biometric integrations, a model that improves per user], 6 capabilities
    (Accounts→buy, Payments→buy, Wearable sync→build, Adaptive coaching→build,
    Notifications→buy, Analytics→buy), 5 foundation primitives (object storage,
    managed database, serverless compute, CDN, data pipeline), the MVP-scope
    paragraph, effort "8 to 14 weeks…" / "1 to 2 engineers, plus a part-time
    designer", 3 risks (Retention…, Health data…, Wearable drift).
  - `crowded` — creator-economy brief (tech-dominant): payments/creators focus.
  - `open` — construction-SaaS brief (tech-dominant): mobile/offline focus.
- `MockBuildBrief.lowTechExample` — an `isTechDominant: false` fixture used only
  in a `#Preview` (verifies the low-tech branch).

### `Models/BuildBrief/BuildBriefStore.swift`
```swift
enum BuildBriefState: Equatable { case idle, generating, ready }

@Observable final class BuildBriefStore {
    private var states: [String: BuildBriefState] = [:]   // keyed by reportKey
    func state(for key: String) -> BuildBriefState { states[key] ?? .idle }
    func startGenerating(_ key: String) { states[key] = .generating }
    func markReady(_ key: String) { states[key] = .ready }
}
```
Injected at the app root alongside `MuseStore`. In-memory per session (M7 wires
real generation + persistence).

## Theming & amber-only discipline
`Theme.Stealth` tokens only; nothing added to `Theme.swift`. The complexity
figure, `BUILD` tag, generate button, and skeleton shimmer are amber; `BUY`
tags, effort sub-text, and the limit disclaimer are `textSecondary`. No
success/warning/danger anywhere — the web's threshold coloring on complexity and
the two-tone build/buy tags are deliberately flattened to the single hue.

## Accessibility
- Nav glyphs, generate button, copy-as-markdown, back chevron carry
  `accessibilityLabel`s; tap targets ≥44×44.
- Reduce Motion: the skeleton renders static (no shimmer); the ~1.5s generate
  delay still applies (it models work, not decoration).
- Dynamic Type via `Theme.Typeface` roles.

## Verification
- `xcodebuild … build` green.
- Simulator screenshots (flag-flip to reach states, revert before commit): the
  three-face nav (composer glyphs on the report face), the Build Brief invite,
  the skeleton, and the ready brief (capabilities + foundation + risks); plus the
  low-tech branch via its `#Preview`. Capture across at least two fixtures.
- No test target (deferred to M7).

## Open questions
None blocking. Plan-time choices noted inline:
1. Build Brief SF Symbol — `square.grid.2x2` vs `cube`.
2. Whether `WorkspaceComposer` fully replaces `MuseComposer` or wraps it (plan
   decides; the composer field/behaviour is identical, only the nav row is new).
