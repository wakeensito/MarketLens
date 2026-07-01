# iOS Milestone 3 — Market Memo (report render) — Design

**Status:** approved, ready for implementation plan
**Branch:** `feat/ios-m3-report`
**Depends on:** M2 workspace shell (merged to `main`)

## Overview

M3 renders a **completed market report** natively. The M2 `PipelineLoadingView`
currently runs its staged animation and *holds* on the last frame; M3 replaces
that hold with the actual report and makes loading→report a real transition.

The report we port is the web app's **v2 Market Memo**, not the classic v1
`ReportView`. Alignment check: `App.tsx:812` renders `<MarketMemo>`, and
`<ReportView>` is never mounted anywhere (retired). Porting v1 would ship a
report the web no longer uses. So M3 mirrors `frontend/src/components/MarketMemo.tsx`
and the `MarketMemo` type (`frontend/src/types.ts:171-184`).

Still mock-only — no backend until **M4**. Every source URL and gap quote is
fixture data; the milestone builds the *render*, not a live pipeline.

### In scope
- Full memo model ported to Swift (all sections **including sourcing**).
- Three contrasting mock fixtures + history-row → memo resolution.
- A dedicated full-screen report view (reading mode, distinct from the composer).
- Loading→report transition and history-row→report navigation.

### Out of scope (later milestones)
- **M4:** wire the real REST API + a test target. The web's `parseScore`
  (string→int clamp, `adapter.ts:4-7`) is an *adapter* concern and lands with
  the API, not here — M3 authors scores as `Int` directly.
- **Muse milestone:** the citation *interaction*. Anchors (`competitor-N` /
  `gap-N` / `roadmap-N`) are modeled/derivable but inert — no tap-to-scroll.
- CSV/PDF export (Pro/web). M3 ships only a native share-sheet with markdown.

## Decisions (locked during brainstorming)

1. **Target the v2 Market Memo, not the classic report.** The web ships the
   memo; the classic `ReportView` is retired.
2. **Full memo including sourcing**, backed by mock fixtures. Sources use *real,
   plausible domains* (statista.com, crunchbase.com, r/fitness) so nothing reads
   as broken, and the citation UI is built for real — M4 swaps only the data,
   not the components.
3. **Amber-only score encoding.** The three hero `ScoreBand`s render entirely in
   amber; **tone is carried by the label** ("Competitive" / "Challenging" /
   "Strong") + the receipt line, plus an optional **thin amber intensity bar**
   (opacity by score). No green/red — the Stealth "amber is the only color" law
   holds. Rationale: saturation *high = bad* while opportunity *high = good*, so
   a traffic-light would mean opposite things across axes — the label is the
   honest valence signal. `tone` stays in the model but never maps to hue.
4. **Dedicated report view.** A distinct full-screen surface pushed over the
   workspace — back chevron `‹`, the memo's identity row as its header, the
   composer's `☰ / wordmark / ＋` bar hidden. Reading mode, not composing mode.
5. **Three varied fixtures.** Canonical *Digital Fitness* memo (mirrors web
   `MOCK_MEMO`) + one *crowded/high-saturation* + one *open/low-saturation*,
   deliberately varying competitor count, gap-quote presence, score extremes,
   and receipt length so the layout is proven across shapes. The four M2 history
   rows map onto these three.

## Architecture

### View state
`WorkspaceScreen` (currently `.home | .loading`) gains a report case:

```swift
enum WorkspaceScreen {
    case home
    case loading
    case report(MarketMemo)
}
```

`WorkspaceView` also tracks where the report was opened from, so `‹` returns
correctly:

```swift
enum ReportOrigin { case home, history }
@State private var reportOrigin: ReportOrigin = .home
```

- `MarketMemo` must be `Equatable` (associated value in the enum) so
  `.animation(_:value:)` on `screen` compiles cleanly. Its nested types conform
  to `Equatable` too (all value types).

### Flow
- **Submit → loading → report.** `PipelineLoadingView` gains an
  `onComplete: () -> Void`, fired by its existing `.task` (the one that sleeps
  `PipelineStage.totalSeconds` then sets `isComplete`). After a short beat on the
  final "Assembling report" frame (~600ms) it calls `onComplete`, and
  `WorkspaceView` sets `screen = .report(MockMemo.digitalFitness)`,
  `reportOrigin = .home`. (Mock: submit always yields the canonical memo.)
- **History row → report.** `HistoryDrawer`'s `onSelect(report)` resolves the
  row's memo, dismisses the sheet, and sets `screen = .report(memo)`,
  `reportOrigin = .history`.
- **Back.** `MemoView`'s `onBack` → `.home` if `reportOrigin == .home`; if
  `.history`, return to `.home` *and* reopen the history sheet
  (`isHistoryOpen = true`) so the user lands where they came from.

## Data model (`Models/Memo/`, one type per file — swiftui-pro)

Mirror of `frontend/src/types.ts`. All value types, `Equatable`; collections
`Identifiable` where they render in `ForEach`.

```swift
struct MarketMemo: Equatable {
    let idea: String
    let vertical: String
    let oneliner: String
    let bands: [ScoreBand]
    let marketSize: MarketSizeEvidence
    let competitors: [MemoCompetitor]
    let whyNow: WhyNow
    let gaps: [MemoGap]
    let entryCost: [EntryCostFactor]
    let roadmap: [MemoRoadmapPhase]
    let read: MemoRead
}

enum ScoreAxis: String, Equatable { case saturation, difficulty, opportunity }
enum BandTone: String, Equatable { case good, mixed, bad }   // modeled, never → hue
struct ScoreBand: Identifiable, Equatable {
    var id: String { axis.rawValue }
    let axis: ScoreAxis
    let label: String        // "Competitive"
    let receipt: String      // "A handful of well-funded apps already exist…"
    let score: Int           // 0–100, authored directly
    let tone: BandTone
}

enum EvidenceTier: String, Equatable { case fact, estimate, analysis }
struct Source: Identifiable, Equatable {
    var id: String { label + url }
    let label: String        // "Statista", "r/fitness"
    let url: String
}

struct MarketSizeEvidence: Equatable {
    let tam: String          // "$14.8B"
    let growth: String       // "growing 24% a year"
    let note: String?        // bottoms-up caveat
    let tier: EvidenceTier
    let sources: [Source]
}

enum CompetitorTier: String, Equatable { case dominant, strong, moderate, niche }
struct MemoCompetitor: Identifiable, Equatable {
    let id = UUID()
    let name: String
    let tier: CompetitorTier
    let strength: String
    let weakness: String
    let position: String     // "Big player (premium)"
    let fundingStage: String // "Well funded"
    let url: String
}

enum GapSeverity: String, Equatable { case high, medium, low }
struct GapQuote: Identifiable, Equatable {
    let id = UUID()
    let quote: String
    let source: Source
}
struct MemoGap: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let description: String
    let severity: GapSeverity
    let underserved: String
    let opportunityScore: Int
    let tags: [String]
    let quotes: [GapQuote]   // empty → no receipts row
}

struct EntryCostFactor: Identifiable, Equatable {
    let id = UUID()
    let label: String        // "Rules & privacy"
    let value: String
    let tier: EvidenceTier
    let sources: [Source]    // may be empty
}

struct MemoRoadmapPhase: Identifiable, Equatable {
    let id = UUID()
    let phase: String        // "Phase 1 · 0–3 months"
    let title: String
    let description: String
}

struct MemoRead: Equatable {
    let synthesis: String
    let recommendation: String
    let limit: String        // honest disclaimer
}
```

**Citation anchors:** the tap-to-scroll interaction is the Muse milestone.
For M3, targets are *derivable by position* at render time (`competitor-\(i+1)`
etc.) and need no stored field — do not add dead identifiers to the model now.

## Mock fixtures (`Models/Memo/MockMemo.swift`)

```swift
enum MockMemo {
    static let digitalFitness: MarketMemo   // canonical — mirrors web MOCK_MEMO
    static let crowded: MarketMemo          // ~81 saturation, dominant field
    static let open: MarketMemo             // ~34 saturation, thin field
}
```

**`digitalFitness`** ports `mockData.ts:299-468` verbatim (content is already
plain-English and on-brand):
- idea: "An AI fitness coaching app that adjusts every workout in real time…"
- vertical: "Fitness app · United States & Western Europe"
- oneliner: "Lots of people want this and the market is growing fast. The catch…"
- bands: saturation 62 "Competitive" / difficulty 58 "Challenging" /
  opportunity 71 "Strong" (each with its receipt)
- marketSize: `$14.8B` · "growing 24% a year" · estimate · sources
  [Grand View '25, Statista] · the bottoms-up note
- competitors (4): Future (dominant), Whoop (dominant), Freeletics (strong),
  Ladder (niche) — each with strength/weakness/position/fundingStage/url
- whyNow: the smartwatch + cheap-AI shift · estimate · [TechCrunch]
- gaps (3): "A plan that adjusts to you" (high, 90, 2 quotes),
  "Expert coaching that's affordable" (high, 81, 1 quote),
  "Everything in one place" (medium, 58, **0 quotes**)
- entryCost (4): Rules & privacy (fact) / Getting customers (estimate, sourced)
  / Money to start (estimate) / Keeping people (estimate)
- roadmap (3): Prove the loop / Earn trust with results / Widen the wedge
- read: synthesis + recommendation + limit (verbatim)

**`crowded`** and **`open`** are authored in the *same voice and structure* to
stress the layout, mapped to the existing M2 history idea strings:
- `crowded` — "Creator economy monetization platform" / "Sustainable food
  delivery platform": saturation ~81, 5–6 competitors (several `dominant`),
  opportunity low, a gap with **empty** quotes and a gap with **long** receipts.
- `open` — "B2B SaaS for construction project management": saturation ~34,
  1–2 competitors (`niche`/`moderate`), opportunity high (~80s), rich quotes.

**History resolution.** `MockReport` gains a memo resolver; the four M2 rows map
onto the three fixtures. To keep the history chip and the opened report in
agreement, each row's `saturationScore` is set to its memo's saturation band —
which nudges two M2 numbers (labels are unchanged, both stay on the same side of
the 65 threshold):

| History row | Saturation (was → is) | Label | Memo |
|---|---|---|---|
| Creator economy monetization platform | 73 → **81** | Highly Saturated | `crowded` |
| Sustainable food delivery platform | 81 → 81 | Highly Saturated | `crowded` |
| B2B SaaS for construction project management | 34 → 34 | Low Saturation | `open` |
| Pet telehealth and vet booking service | 47 → **62** | Moderately Saturated | `digitalFitness` |

So `crowded`'s saturation band = 81, `open`'s = 34, `digitalFitness`'s = 62 (the
canonical value). Both crowded rows share the one `crowded` memo — acceptable in
mock; M4 gives each report its own real data.

Implementation choice (decide in plan): add `let memo: MarketMemo` to
`MockReport`, or a `memo(for:)` switch in `MockMemo`.

## Report screen (`Report/`, one type per file)

`MemoView(memo: MarketMemo, onBack: () -> Void)` — a `ScrollView` with a pinned
top row: back chevron `‹` (left, ≥44×44) and a native `ShareLink` (right)
exporting a generated markdown memo. Sections, in the web's order
(`MarketMemo.tsx`):

1. **Identity** — `MARKET MEMO` · `vertical` (mono meta row with hairline
   separators); serif headline = `oneliner`; a "The idea" block showing `idea`.
   A `PLN-YYYY-NNNN` brief id + a formatted date complete the identity line.
2. **Bands hero** — three `BandCard`s: large serif `score`, mono axis label
   ("SATURATION"), the valence `label`, a **thin amber intensity bar**
   (`Theme.Stealth.amber`, width or opacity ∝ score/100), and the `receipt`.
   All amber.
3. **01 · Market Size** — `SectionHead(num:"01", name:"Market Size",
   question:"How big is this market, and is it growing?")`; `tam` + `growth` +
   `TierTag(tier)`; a plain-English explainer line; `note` when present;
   `SourcesRow(sources)`.
4. **02 · Who Else Is Doing This** — "Who's already out there, and where are they
   weak?" Competitors sorted by tier (dominant→strong→moderate→niche, stable);
   `CompetitorCard` (name, tier dot + lowercase tier word, `strength`,
   **`weakness`**, `position`, `fundingStage`, `url` as a `CitePill`).
5. **03 · Why Now** — "Why is this a good time to start?" `shift` prose +
   `SourcesRow`.
6. **04 · Market Gaps** — "What are people missing that you could offer?"
   `GapRow` per gap: `Gap 01` label, `title`, severity marker, `description`,
   an "underserved" line, `opportunityScore` (mono), `tags`, and — when
   `quotes` non-empty — a receipts block of `GapQuote`s (quote + source
   `CitePill`).
7. **05 · What It Takes to Start** — "What will you need to get going?"
   `EntryCostFactor` rows (`label`, `value`, `TierTag`, optional `SourcesRow`).
8. **06 · Where to Start** — "What are the first moves to get going?" roadmap
   phases (`phase`, `title`, `description`).
9. **The Bottom Line** — `synthesis`; a `recommendation` block (eyebrow); the
   honest `limit` disclaimer, visually de-emphasized (`textSecondary`).

**Shared subviews (`Report/`):**
- `SectionHead(num:name:question:)` — mono `num`, serif `name`, mono `question`.
- `BandCard(band:)` — the amber score card above.
- `CitePill(source:)` — mono pill; tap → `openURL(source.url)`. Amber accent on
  `Theme.Stealth.skyMid`.
- `SourcesRow(label:sources:)` — a "GROUNDED IN" mono-uppercase label + a wrap of
  `CitePill`s. Renders nothing when `sources` is empty.
- `TierTag(tier:)` — evidence tier as a **mono uppercase amber/`textSecondary`
  label** ("FACT" / "ESTIMATE" / "ANALYSIS"). **Never a colored badge.**
- `CompetitorCard`, `GapRow`, `MemoQuoteRow`, `EntryCostRow`, `RoadmapRow`,
  `ReadBlock`.

**Markdown export.** A `memoMarkdown(_:) -> String` helper (mirrors the web's
`buildMarkdown`) feeds `ShareLink`. Canonical field ordering = the section order
above.

## Theming & amber-only discipline

All surfaces use existing `Theme.Stealth` tokens
(`skyTop`/`skyMid`/`amber`/`text`/`textSecondary`/`sand`). **No additions to
`Theme.swift`.** Every place the web used success/warning/danger — score bands,
evidence tiers, competitor tiers, gap severity — renders single-hue:
- Band bars: amber, intensity by score.
- Competitor tier dot: amber at varying opacity (dominant brightest → niche
  dimmest).
- Gap severity / evidence tier: mono uppercase text, no fill color.

## Accessibility
- Back chevron and `ShareLink` carry `accessibilityLabel`s; tap targets ≥44×44.
- `CitePill`s are buttons with a "Open source: {label}" label.
- Dynamic Type via the existing `Theme.Typeface` roles
  (`Font.custom(…relativeTo:)`).
- Reduce Motion: band count-up / bar animations hold static; no score animation
  requirement is load-bearing.
- Score bands read as "Saturation 62 of 100, Competitive" (number + label), so
  valence survives with color stripped — consistent with the amber-only choice.

## Verification
- `xcodebuild -project PlinthsApp.xcodeproj -scheme PlinthsApp
  -destination 'generic/platform=iOS Simulator' build` is green.
- Simulator screenshots (flag-flip a `WorkspaceScreen.report` default to jump
  straight in, then revert): the canonical memo top (identity + bands),
  competitors, gaps-with-quotes, the read — **plus** the `crowded` and `open`
  fixtures to confirm the layout survives extremes (empty quotes, single
  competitor, 80+ scores, long receipts).
- No test target (deferred to M4).

## Open questions
None blocking. Two plan-time implementation choices noted inline:
1. `MockReport` memo resolution — stored field vs. `memo(for:)` switch.
2. Final-frame beat before auto-advancing loading→report (~600ms) — tune for feel.
