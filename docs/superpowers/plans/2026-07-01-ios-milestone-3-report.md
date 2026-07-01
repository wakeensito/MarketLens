# iOS Milestone 3 — Market Memo (report render) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a completed market report natively by porting the web app's v2 Market Memo, reached from the pipeline-loading screen and from history rows.

**Architecture:** A pure Swift value-type model mirrors `frontend/src/types.ts` `MarketMemo`. Three mock fixtures feed a dedicated full-screen `MemoView` composed of small presentational subviews. `WorkspaceScreen` gains a `.report(MarketMemo)` case; loading auto-advances to it, and history rows resolve to a fixture.

**Tech Stack:** SwiftUI (iOS 26.2, Swift 6.2), Xcode 26.3, `xcodebuild`, `xcrun simctl`.

## Global Constraints

- **Deployment target:** iOS 26.2 · Swift 6.2. Xcode 26.3.
- **File-system-synchronized groups:** any file created under `PlinthsApp/PlinthsApp/` is auto-included in the build — no manual "add to target" step.
- **No test target yet.** XCTest lands in M4. The verification gate for every task is `xcodebuild … build` succeeding (compile gate) plus, for full-screen states, a simulator screenshot reached by a temporary flag-flip that is reverted before commit (behavior gate). This is the established M1/M2 pattern — do NOT add a test target.
- **Amber is the only color.** Use `Theme.Stealth` tokens only (`skyTop`, `skyMid`, `amber`, `text`, `textSecondary`, `sand`). **No additions to `Theme.swift`.** Every place the web used success/warning/danger renders single-hue (amber intensity or mono text). No green/red anywhere.
- **One type per file** for views (swiftui-pro convention already in the repo). The data model is the one exception: it lives in a single cohesive file mirroring `types.ts`.
- **Typeface roles** (from `Theme.Typeface`, verbatim): `largeTitle` (serif 34), `title` (serif 24), `body` (sans 17), `bodyEmphasized` (sans 17 semibold), `label` (mono 15), `caption` (mono 13), `badge` (mono 11). Do not invent roles or font names.
- **Content is copied verbatim** from `frontend/src/mockData.ts:299-468` for the canonical fixture (including curly quotes `“ ”` and em dashes).
- **SourceKit cross-file "Cannot find 'Theme'/'MarketMemo' in scope" diagnostics are noise** — the authoritative check is `xcodebuild`.
- **Build command** (run from repo root or `PlinthsApp/`):
  ```bash
  cd /Users/wakeensito/Plinths/PlinthsApp && xcodebuild -project PlinthsApp.xcodeproj -scheme PlinthsApp -destination 'generic/platform=iOS Simulator' build 2>&1 | tail -3
  ```
  Expected tail: `** BUILD SUCCEEDED **`.
- **Screenshot recipe** (when a task calls for it):
  ```bash
  xcrun simctl boot "iPhone 17" 2>/dev/null; open -a Simulator
  APP=$(find ~/Library/Developer/Xcode/DerivedData/PlinthsApp-*/Build/Products/Debug-iphonesimulator -name "PlinthsApp.app" | head -1)
  xcrun simctl install booted "$APP"
  xcrun simctl terminate booted Plinths.PlinthsApp 2>/dev/null
  xcrun simctl launch booted Plinths.PlinthsApp; sleep 4
  xcrun simctl io booted screenshot /tmp/m3-<name>.png
  ```
  Then Read the PNG.
- **Commit cadence:** one commit per task. End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Branch: `feat/ios-m3-report` (already created off `main`).

---

## File Structure

**Create:**
- `PlinthsApp/PlinthsApp/Models/Memo/MemoModel.swift` — all memo value types (one data-contract file mirroring `types.ts`).
- `PlinthsApp/PlinthsApp/Models/Memo/MockMemo.swift` — the 3 fixtures + `memo(for:)` resolver.
- `PlinthsApp/PlinthsApp/Report/SectionHead.swift`
- `PlinthsApp/PlinthsApp/Report/TierTag.swift`
- `PlinthsApp/PlinthsApp/Report/CitePill.swift`
- `PlinthsApp/PlinthsApp/Report/SourcesRow.swift`
- `PlinthsApp/PlinthsApp/Report/BandCard.swift`
- `PlinthsApp/PlinthsApp/Report/CompetitorCard.swift`
- `PlinthsApp/PlinthsApp/Report/GapRow.swift` (+ `MemoQuoteRow` in same file — it renders only inside a gap)
- `PlinthsApp/PlinthsApp/Report/EntryCostRow.swift`
- `PlinthsApp/PlinthsApp/Report/RoadmapRow.swift`
- `PlinthsApp/PlinthsApp/Report/ReadBlock.swift`
- `PlinthsApp/PlinthsApp/Report/MemoMarkdown.swift` — `memoMarkdown(_:) -> String`.
- `PlinthsApp/PlinthsApp/Report/MemoView.swift` — the assembled report.

**Modify:**
- `PlinthsApp/PlinthsApp/Models/WorkspaceScreen.swift` — add `.report(MarketMemo)`.
- `PlinthsApp/PlinthsApp/Models/MockWorkspace.swift` — adjust two history scores.
- `PlinthsApp/PlinthsApp/Workspace/PipelineLoadingView.swift` — add `onComplete`.
- `PlinthsApp/PlinthsApp/Workspace/WorkspaceView.swift` — wire report navigation.
- `PlinthsApp/SETUP.md` — Status reflects M3.

---

## Task 1: Memo data model

**Files:**
- Create: `PlinthsApp/PlinthsApp/Models/Memo/MemoModel.swift`

**Interfaces:**
- Produces: `MarketMemo`, `ScoreBand`, `ScoreAxis`, `BandTone`, `Source`, `EvidenceTier`, `MarketSizeEvidence`, `MemoCompetitor`, `CompetitorTier`, `WhyNow`, `MemoGap`, `GapSeverity`, `GapQuote`, `EntryCostFactor`, `MemoRoadmapPhase`, `MemoRead` — all `Equatable` value types; collections that render in `ForEach` are `Identifiable`.

- [ ] **Step 1: Write the model file**

```swift
import Foundation

/// The v2 Market Memo — a native port of the web app's `MarketMemo`
/// (frontend/src/types.ts). Pure value types. `tone`/`severity`/`tier` are kept
/// on the model but never map to a color: the Stealth palette stays amber-only.
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

enum ScoreAxis: String, Equatable {
    case saturation, difficulty, opportunity
}

/// Valence, retained for future use. In Stealth it never becomes a hue.
enum BandTone: String, Equatable { case good, mixed, bad }

struct ScoreBand: Identifiable, Equatable {
    var id: String { axis.rawValue }
    let axis: ScoreAxis
    let label: String     // "Competitive"
    let receipt: String   // "A handful of well-funded apps already exist…"
    let score: Int        // 0–100
    let tone: BandTone
}

enum EvidenceTier: String, Equatable { case fact, estimate, analysis }

struct Source: Identifiable, Equatable {
    var id: String { label + url }
    let label: String     // "Statista", "r/fitness"
    let url: String
}

struct MarketSizeEvidence: Equatable {
    let tam: String       // "$14.8B"
    let growth: String    // "growing 24% a year"
    let note: String?     // bottoms-up caveat
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

- [ ] **Step 2: Build**

Run the build command. Expected: `** BUILD SUCCEEDED **`. (No fixture yet references these types; the file compiles standalone.)

- [ ] **Step 3: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/Memo/MemoModel.swift && git commit -m "feat(ios): M3 memo data model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Canonical fixture (Digital Fitness)

**Files:**
- Create: `PlinthsApp/PlinthsApp/Models/Memo/MockMemo.swift`

**Interfaces:**
- Consumes: all types from Task 1.
- Produces: `MockMemo.digitalFitness: MarketMemo`. (Crowded/open and the resolver are added in Task 10.)

- [ ] **Step 1: Write the fixture** (verbatim port of `frontend/src/mockData.ts:299-468`)

```swift
import Foundation

/// Mock memo fixtures for M3 (no backend until M4). Sources use real, plausible
/// domains so the citation UI reads honestly; only the data is mock.
enum MockMemo {
    /// Canonical fixture — a verbatim port of the web's MOCK_MEMO.
    static let digitalFitness = MarketMemo(
        idea: "An AI fitness coaching app that adjusts every workout in real time based on your watch data, sleep, and schedule.",
        vertical: "Fitness app · United States & Western Europe",
        oneliner: "Lots of people want this and the market is growing fast. The catch: the big players either lock you into their hardware or charge a lot for a human coach. The opening is a smart app that adapts to you, at a price normal people can afford.",
        bands: [
            ScoreBand(axis: .saturation, label: "Competitive",
                      receipt: "A handful of well-funded apps already exist, but the big names all chase the expensive end.",
                      score: 62, tone: .mixed),
            ScoreBand(axis: .difficulty, label: "Challenging",
                      receipt: "Health data comes with privacy rules, and the real challenge is keeping people coming back after the first couple of months.",
                      score: 58, tone: .mixed),
            ScoreBand(axis: .opportunity, label: "Strong",
                      receipt: "A big, fast-growing market — and no one yet owns the affordable, adapts-to-you spot.",
                      score: 71, tone: .good),
        ],
        marketSize: MarketSizeEvidence(
            tam: "$14.8B", growth: "growing 24% a year",
            note: "There wasn’t much hard data for this exact niche, so this number is an estimate built from reports on fitness trackers and the wider digital-fitness market.",
            tier: .estimate,
            sources: [
                Source(label: "Grand View ’25", url: "https://www.grandviewresearch.com/"),
                Source(label: "Statista", url: "https://www.statista.com/"),
            ]),
        competitors: [
            MemoCompetitor(name: "Future", tier: .dominant,
                strength: "Real human coaches — people stay engaged and stick around.",
                weakness: "At $149 a month it’s out of reach for most people, and there’s no AI personalization.",
                position: "Big player (premium)", fundingStage: "Well funded", url: "https://www.future.co/"),
            MemoCompetitor(name: "Whoop", tier: .dominant,
                strength: "Strong brand and rich data from its wearable device.",
                weakness: "You have to buy and wear its hardware, and it barely guides your actual workouts.",
                position: "Big player (hardware)", fundingStage: "Heavily funded", url: "https://www.whoop.com/"),
            MemoCompetitor(name: "Freeletics", tier: .strong,
                strength: "Huge user base, has an AI coach, and needs no equipment.",
                weakness: "Dated design, shallow personalization, and lots of people quit after two months.",
                position: "Major", fundingStage: "Funded, growing", url: "https://www.freeletics.com/"),
            MemoCompetitor(name: "Ladder", tier: .niche,
                strength: "Well-designed programs, affordable, strong community.",
                weakness: "No AI personalization and little brand awareness outside its niche.",
                position: "Smaller, growing", fundingStage: "Early stage", url: "https://www.joinladder.com/"),
        ],
        whyNow: WhyNow(
            shift: "Smartwatches and fitness trackers are everywhere now, and AI has gotten cheap enough to personalize a workout on the fly. A few years ago, building this would have been much harder and far more expensive.",
            tier: .estimate,
            sources: [Source(label: "TechCrunch", url: "https://techcrunch.com/")]),
        gaps: [
            MemoGap(title: "A plan that adjusts to you",
                description: "None of the big apps change your plan based on your sleep, food, schedule, and past workouts. Their plan stays the same even when your week doesn’t.",
                severity: .high,
                underserved: "People who take fitness seriously and have outgrown one-size-fits-all plans, but can’t afford a $149-a-month human coach.",
                opportunityScore: 90,
                tags: ["adapts to you", "keeps people coming back"],
                quotes: [
                    GapQuote(quote: "“the program never changes even when I tell it the last week wrecked me”", source: Source(label: "r/fitness", url: "https://www.reddit.com/r/fitness/")),
                    GapQuote(quote: "“great coach, but $149 a month is brutal”", source: Source(label: "Trustpilot", url: "https://www.trustpilot.com/")),
                ]),
            MemoGap(title: "Expert coaching that’s affordable",
                description: "Good coaching is locked behind $100-plus a month. A smart, AI-first app could give people expert-level plans at a price the average person can actually pay.",
                severity: .high,
                underserved: "Everyday people priced out of the premium apps.",
                opportunityScore: 81,
                tags: ["affordable", "for everyone"],
                quotes: [
                    GapQuote(quote: "“I want Future-quality plans without the Future price”", source: Source(label: "G2", url: "https://www.g2.com/")),
                ]),
            MemoGap(title: "Everything in one place",
                description: "Fitness, sleep, stress, and food live in separate apps that don’t talk to each other. No one ties them together into a single, simple picture of how you’re doing.",
                severity: .medium,
                underserved: "People juggling three or four different wellness apps with no single view.",
                opportunityScore: 58,
                tags: ["all-in-one", "wellness"],
                quotes: []),
        ],
        entryCost: [
            EntryCostFactor(label: "Rules & privacy",
                value: "Health data like heart rate and sleep comes with privacy rules you have to follow. You won’t need medical approval to start, but you do need to handle that data carefully.",
                tier: .fact, sources: []),
            EntryCostFactor(label: "Getting customers",
                value: "Paying for ads in fitness is expensive, and interest spikes every January. The cheaper, smarter route is growing through word of mouth and real results.",
                tier: .estimate, sources: [Source(label: "TechCrunch", url: "https://techcrunch.com/")]),
            EntryCostFactor(label: "Money to start",
                value: "The software-only path is light — roughly $500K to $1.5M to reach a version people actually stick with. No hardware needed to get going.",
                tier: .estimate, sources: []),
            EntryCostFactor(label: "Keeping people",
                value: "People hop between fitness apps easily. That makes them easy to sign up — and just as easy to lose. You keep them by genuinely getting better the more they use you.",
                tier: .estimate, sources: []),
        ],
        roadmap: [
            MemoRoadmapPhase(phase: "Phase 1 · 0–3 months", title: "Prove the loop",
                description: "Ship a single adaptive coaching flow to a small cohort and measure week-4 retention before anything else. The whole thesis rests on people coming back."),
            MemoRoadmapPhase(phase: "Phase 2 · 3–9 months", title: "Earn trust with results",
                description: "Instrument outcomes and surface real progress publicly. Let demonstrated results — not paid acquisition — drive word-of-mouth growth."),
            MemoRoadmapPhase(phase: "Phase 3 · 9–18 months", title: "Widen the wedge",
                description: "Once retention holds, expand the program library and lean into the compounding advantage of getting smarter the more each person uses it."),
        ],
        read: MemoRead(
            synthesis: "The market is big and growing, and the leaders have left a clear opening: a coaching app that’s affordable and gets smarter the more you use it. The crowded part is the expensive, hardware-heavy end — not the affordable, AI-first space. The hardest part isn’t beating competitors; it’s getting people to keep coming back. Whoever proves people stick around, and actually get results, wins this opening.",
            recommendation: "Start with affordable coaching that adapts to each person in real time. Treat \"keeping people coming back\" as the real product: measure it from day one, share real results to build trust, and let those results — not ad spending — be what sets you apart.",
            limit: "This is an AI-generated read of public information, not financial advice. The market-size and cost figures are estimates — double-check the sources we linked, and get professional advice before putting in real money.")
    )
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/Memo/MockMemo.swift && git commit -m "feat(ios): M3 canonical memo fixture (Digital Fitness)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Memo chrome primitives (SectionHead · TierTag · CitePill · SourcesRow)

**Files:**
- Create: `PlinthsApp/PlinthsApp/Report/SectionHead.swift`, `TierTag.swift`, `CitePill.swift`, `SourcesRow.swift`

**Interfaces:**
- Consumes: `Source`, `EvidenceTier` (Task 1).
- Produces: `SectionHead(num:name:question:)`, `TierTag(tier:)`, `CitePill(source:)`, `SourcesRow(label:sources:)` (label defaults to `"grounded in"`).

- [ ] **Step 1: `SectionHead.swift`**

```swift
import SwiftUI

/// A numbered section header: mono number, serif name, and a plain-English
/// question beneath. Mirrors the web memo's SectionHead.
struct SectionHead: View {
    let num: String
    let name: String
    let question: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(num)
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.amber)
                Text(name)
                    .font(Theme.Typeface.title)
                    .foregroundStyle(Theme.Stealth.text)
            }
            Text(question)
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    SectionHead(num: "01", name: "Market Size", question: "How big is this market, and is it growing?")
        .padding()
        .background(Theme.Stealth.skyTop)
        .preferredColorScheme(.dark)
}
```

- [ ] **Step 2: `TierTag.swift`**

```swift
import SwiftUI

/// An evidence-tier badge (FACT / ESTIMATE / ANALYSIS). Amber-only discipline:
/// a hairline mono label, never a colored fill.
struct TierTag: View {
    let tier: EvidenceTier

    var body: some View {
        Text(tier.rawValue.uppercased())
            .font(Theme.Typeface.badge)
            .foregroundStyle(Theme.Stealth.textSecondary)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .overlay(
                Capsule().stroke(Theme.Stealth.textSecondary.opacity(0.3), lineWidth: 1)
            )
    }
}

#Preview {
    HStack(spacing: 8) {
        TierTag(tier: .fact); TierTag(tier: .estimate); TierTag(tier: .analysis)
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
```

- [ ] **Step 3: `CitePill.swift`**

```swift
import SwiftUI

/// A tappable source citation. Opens the source URL. In mock the URLs are real
/// plausible domains, so the tap lands somewhere sensible.
struct CitePill: View {
    let source: Source
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            if let url = URL(string: source.url) { openURL(url) }
        } label: {
            Text(source.label)
                .font(Theme.Typeface.badge)
                .foregroundStyle(Theme.Stealth.amber)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Theme.Stealth.amber.opacity(0.12))
                .clipShape(.capsule)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open source: \(source.label)")
    }
}

#Preview {
    CitePill(source: Source(label: "Statista", url: "https://www.statista.com/"))
        .padding()
        .background(Theme.Stealth.skyTop)
        .preferredColorScheme(.dark)
}
```

- [ ] **Step 4: `SourcesRow.swift`**

```swift
import SwiftUI

/// A "GROUNDED IN" label followed by a horizontal row of citation pills. Renders
/// nothing when there are no sources.
struct SourcesRow: View {
    var label: String = "grounded in"
    let sources: [Source]

    var body: some View {
        if !sources.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(label.uppercased())
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(sources) { CitePill(source: $0) }
                    }
                }
            }
        }
    }
}

#Preview {
    SourcesRow(sources: [
        Source(label: "Grand View ’25", url: "https://www.grandviewresearch.com/"),
        Source(label: "Statista", url: "https://www.statista.com/"),
    ])
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
```

- [ ] **Step 5: Build.** Expected: `** BUILD SUCCEEDED **`. (Visual verification of these primitives happens when they compose into `MemoView`, Task 9.)

- [ ] **Step 6: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Report/SectionHead.swift PlinthsApp/PlinthsApp/Report/TierTag.swift PlinthsApp/PlinthsApp/Report/CitePill.swift PlinthsApp/PlinthsApp/Report/SourcesRow.swift && git commit -m "feat(ios): M3 memo chrome primitives (SectionHead, TierTag, CitePill, SourcesRow)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: BandCard (hero score)

**Files:**
- Create: `PlinthsApp/PlinthsApp/Report/BandCard.swift`

**Interfaces:**
- Consumes: `ScoreBand` (Task 1).
- Produces: `BandCard(band:)`.

- [ ] **Step 1: Write `BandCard.swift`**

```swift
import SwiftUI

/// One hero score band: a large amber number, the axis label, a thin amber
/// intensity bar (width ∝ score), the valence label, and the receipt. Tone is
/// carried by the label — never by a hue (Stealth is amber-only).
struct BandCard: View {
    let band: ScoreBand

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(band.score)")
                    .font(Theme.Typeface.largeTitle)
                    .foregroundStyle(Theme.Stealth.amber)
                Text(band.axis.rawValue.uppercased())
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                Spacer()
                Text(band.label)
                    .font(Theme.Typeface.caption)
                    .foregroundStyle(Theme.Stealth.amber)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.Stealth.amber.opacity(0.15))
                    Capsule().fill(Theme.Stealth.amber)
                        .frame(width: geo.size.width * CGFloat(band.score) / 100)
                }
            }
            .frame(height: 3)

            Text(band.receipt)
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .background(Theme.Stealth.skyMid.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

#Preview {
    VStack(spacing: 12) {
        ForEach(MockMemo.digitalFitness.bands) { BandCard(band: $0) }
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Report/BandCard.swift && git commit -m "feat(ios): M3 BandCard hero score

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: CompetitorCard

**Files:**
- Create: `PlinthsApp/PlinthsApp/Report/CompetitorCard.swift`

**Interfaces:**
- Consumes: `MemoCompetitor`, `CompetitorTier`, `Source`, `CitePill` (Tasks 1, 3).
- Produces: `CompetitorCard(competitor:)`.

- [ ] **Step 1: Write `CompetitorCard.swift`**

```swift
import SwiftUI

/// One competitor: a tier dot (amber, brightness by threat), name, strength,
/// weakness, position + funding, and a source pill linking the claim to the
/// real company. Amber-only: the tier reads from dot brightness + a mono word.
struct CompetitorCard: View {
    let competitor: MemoCompetitor

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Circle()
                    .fill(Theme.Stealth.amber.opacity(tierOpacity))
                    .frame(width: 8, height: 8)
                Text(competitor.name)
                    .font(Theme.Typeface.bodyEmphasized)
                    .foregroundStyle(Theme.Stealth.text)
                Spacer()
                Text(competitor.tier.rawValue)
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
            }

            labeled("STRENGTH", competitor.strength)
            labeled("WEAKNESS", competitor.weakness)

            HStack(spacing: 8) {
                Text(competitor.position)
                    .font(Theme.Typeface.caption)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                Text("·").foregroundStyle(Theme.Stealth.textSecondary)
                Text(competitor.fundingStage)
                    .font(Theme.Typeface.caption)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                Spacer()
                CitePill(source: Source(label: linkLabel, url: competitor.url))
            }
        }
        .padding(16)
        .background(Theme.Stealth.skyMid.opacity(0.4))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var tierOpacity: Double {
        switch competitor.tier {
        case .dominant: 1.0
        case .strong:   0.75
        case .moderate: 0.5
        case .niche:    0.3
        }
    }

    private var linkLabel: String {
        URL(string: competitor.url)?.host?.replacingOccurrences(of: "www.", with: "") ?? "site"
    }

    private func labeled(_ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(Theme.Typeface.badge)
                .foregroundStyle(Theme.Stealth.textSecondary)
            Text(text)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

#Preview {
    VStack(spacing: 12) {
        ForEach(MockMemo.digitalFitness.competitors) { CompetitorCard(competitor: $0) }
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Report/CompetitorCard.swift && git commit -m "feat(ios): M3 CompetitorCard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: GapRow + MemoQuoteRow

**Files:**
- Create: `PlinthsApp/PlinthsApp/Report/GapRow.swift`

**Interfaces:**
- Consumes: `MemoGap`, `GapQuote`, `CitePill` (Tasks 1, 3).
- Produces: `GapRow(index:gap:)` (index is 1-based), `MemoQuoteRow(quote:)`.

- [ ] **Step 1: Write `GapRow.swift`** (both types — the quote row renders only inside a gap)

```swift
import SwiftUI

/// One market gap: a "Gap NN" label, the grounded opportunity score, title,
/// description, the underserved audience, tags, and — when present — a receipts
/// block of real complaints.
struct GapRow: View {
    let index: Int
    let gap: MemoGap

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(String(format: "Gap %02d", index))
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.amber)
                Spacer()
                Text("\(gap.opportunityScore)")
                    .font(Theme.Typeface.label)
                    .foregroundStyle(Theme.Stealth.amber)
                Text("SCORE")
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
            }

            Text(gap.title)
                .font(Theme.Typeface.title)
                .foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)

            Text(gap.description)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 2) {
                Text("UNDERSERVED")
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                Text(gap.underserved)
                    .font(Theme.Typeface.caption)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !gap.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(gap.tags, id: \.self) { tag in
                            Text(tag)
                                .font(Theme.Typeface.badge)
                                .foregroundStyle(Theme.Stealth.textSecondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .overlay(Capsule().stroke(Theme.Stealth.textSecondary.opacity(0.25), lineWidth: 1))
                        }
                    }
                }
            }

            if !gap.quotes.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(gap.quotes) { MemoQuoteRow(quote: $0) }
                }
                .padding(.top, 2)
            }
        }
    }
}

/// A single quoted pain point — the gap's receipt. An amber rule marks it as a
/// pulled quote; the source is a tappable pill.
struct MemoQuoteRow: View {
    let quote: GapQuote

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(quote.quote)
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.sand)
                .fixedSize(horizontal: false, vertical: true)
            CitePill(source: quote.source)
        }
        .padding(.leading, 12)
        .overlay(alignment: .leading) {
            Rectangle().fill(Theme.Stealth.amber.opacity(0.4)).frame(width: 2)
        }
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 20) {
        ForEach(Array(MockMemo.digitalFitness.gaps.enumerated()), id: \.element.id) { i, gap in
            GapRow(index: i + 1, gap: gap)
        }
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Report/GapRow.swift && git commit -m "feat(ios): M3 GapRow + MemoQuoteRow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: EntryCostRow · RoadmapRow · ReadBlock

**Files:**
- Create: `PlinthsApp/PlinthsApp/Report/EntryCostRow.swift`, `RoadmapRow.swift`, `ReadBlock.swift`

**Interfaces:**
- Consumes: `EntryCostFactor`, `MemoRoadmapPhase`, `MemoRead`, `TierTag`, `SourcesRow` (Tasks 1, 3).
- Produces: `EntryCostRow(factor:)`, `RoadmapRow(phase:)`, `ReadBlock(read:)`.

- [ ] **Step 1: `EntryCostRow.swift`**

```swift
import SwiftUI

/// One cost-to-enter factor: label + evidence tier, the plain-English detail,
/// and any sources.
struct EntryCostRow: View {
    let factor: EntryCostFactor

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(factor.label)
                    .font(Theme.Typeface.bodyEmphasized)
                    .foregroundStyle(Theme.Stealth.text)
                TierTag(tier: factor.tier)
            }
            Text(factor.value)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            SourcesRow(sources: factor.sources)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 16) {
        ForEach(MockMemo.digitalFitness.entryCost) { EntryCostRow(factor: $0) }
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
```

- [ ] **Step 2: `RoadmapRow.swift`**

```swift
import SwiftUI

/// One roadmap phase: the timeline label, the move's title, and what it entails.
struct RoadmapRow: View {
    let phase: MemoRoadmapPhase

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(phase.phase)
                .font(Theme.Typeface.badge)
                .foregroundStyle(Theme.Stealth.amber)
            Text(phase.title)
                .font(Theme.Typeface.title)
                .foregroundStyle(Theme.Stealth.text)
            Text(phase.description)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 20) {
        ForEach(MockMemo.digitalFitness.roadmap) { RoadmapRow(phase: $0) }
    }
    .padding()
    .background(Theme.Stealth.skyTop)
    .preferredColorScheme(.dark)
}
```

- [ ] **Step 3: `ReadBlock.swift`**

```swift
import SwiftUI

/// The Bottom Line: the synthesis, an amber-eyebrowed recommendation, and the
/// honest limit disclaimer (de-emphasized).
struct ReadBlock: View {
    let read: MemoRead

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("The Bottom Line")
                .font(Theme.Typeface.title)
                .foregroundStyle(Theme.Stealth.text)

            Text(read.synthesis)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 6) {
                Text("RECOMMENDATION")
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.amber)
                Text(read.recommendation)
                    .font(Theme.Typeface.body)
                    .foregroundStyle(Theme.Stealth.text)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text(read.limit)
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    ReadBlock(read: MockMemo.digitalFitness.read)
        .padding()
        .background(Theme.Stealth.skyTop)
        .preferredColorScheme(.dark)
}
```

- [ ] **Step 4: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Report/EntryCostRow.swift PlinthsApp/PlinthsApp/Report/RoadmapRow.swift PlinthsApp/PlinthsApp/Report/ReadBlock.swift && git commit -m "feat(ios): M3 EntryCostRow, RoadmapRow, ReadBlock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Markdown export helper

**Files:**
- Create: `PlinthsApp/PlinthsApp/Report/MemoMarkdown.swift`

**Interfaces:**
- Consumes: `MarketMemo` (Task 1).
- Produces: free function `memoMarkdown(_ memo: MarketMemo) -> String`.

- [ ] **Step 1: Write `MemoMarkdown.swift`**

```swift
import Foundation

/// Renders a memo as plain markdown for the share sheet. Section order mirrors
/// MemoView. Kept dependency-free so `ShareLink(item:)` gets a simple String.
func memoMarkdown(_ memo: MarketMemo) -> String {
    var lines: [String] = []
    lines.append("# Market Memo — \(memo.vertical)")
    lines.append("")
    lines.append("_\(memo.oneliner)_")
    lines.append("")
    lines.append("**The idea:** \(memo.idea)")
    lines.append("")

    lines.append("## Scores")
    for b in memo.bands {
        lines.append("- **\(b.axis.rawValue.capitalized): \(b.score)/100 — \(b.label).** \(b.receipt)")
    }
    lines.append("")

    lines.append("## Market Size")
    lines.append("\(memo.marketSize.tam) · \(memo.marketSize.growth) (\(memo.marketSize.tier.rawValue))")
    if let note = memo.marketSize.note { lines.append("") ; lines.append(note) }
    lines.append("")

    lines.append("## Who Else Is Doing This")
    for c in memo.competitors {
        lines.append("### \(c.name) — \(c.tier.rawValue)")
        lines.append("- Strength: \(c.strength)")
        lines.append("- Weakness: \(c.weakness)")
        lines.append("- \(c.position) · \(c.fundingStage) · \(c.url)")
    }
    lines.append("")

    lines.append("## Why Now")
    lines.append(memo.whyNow.shift)
    lines.append("")

    lines.append("## Market Gaps")
    for (i, g) in memo.gaps.enumerated() {
        lines.append("### Gap \(String(format: "%02d", i + 1)) — \(g.title) (\(g.opportunityScore)/100)")
        lines.append(g.description)
        lines.append("- Underserved: \(g.underserved)")
        for q in g.quotes { lines.append("- \(q.quote) — \(q.source.label)") }
    }
    lines.append("")

    lines.append("## What It Takes to Start")
    for f in memo.entryCost {
        lines.append("- **\(f.label)** (\(f.tier.rawValue)): \(f.value)")
    }
    lines.append("")

    lines.append("## Where to Start")
    for p in memo.roadmap {
        lines.append("### \(p.phase) — \(p.title)")
        lines.append(p.description)
    }
    lines.append("")

    lines.append("## The Bottom Line")
    lines.append(memo.read.synthesis)
    lines.append("")
    lines.append("**Recommendation:** \(memo.read.recommendation)")
    lines.append("")
    lines.append("> \(memo.read.limit)")

    return lines.joined(separator: "\n")
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Report/MemoMarkdown.swift && git commit -m "feat(ios): M3 memo markdown export helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: MemoView (assembled report)

**Files:**
- Create: `PlinthsApp/PlinthsApp/Report/MemoView.swift`

**Interfaces:**
- Consumes: `MarketMemo`, all Task 3–8 subviews, `memoMarkdown`.
- Produces: `MemoView(memo:onBack:)` — `onBack: () -> Void`.

- [ ] **Step 1: Write `MemoView.swift`**

```swift
import SwiftUI

/// The full market-memo report — a dedicated reading surface pushed over the
/// workspace. Back chevron + a share sheet (markdown) sit above the scroll; the
/// sections render in the web memo's order.
struct MemoView: View {
    let memo: MarketMemo
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    identity
                    bands
                    divider
                    section("01", "Market Size", "How big is this market, and is it growing?") { marketSize }
                    divider
                    section("02", "Who Else Is Doing This", "Who’s already out there, and where are they weak?") { competitors }
                    divider
                    section("03", "Why Now", "Why is this a good time to start?") { whyNow }
                    divider
                    section("04", "Market Gaps", "What are people missing that you could offer?") { gaps }
                    divider
                    section("05", "What It Takes to Start", "What will you need to get going?") { entryCost }
                    divider
                    section("06", "Where to Start", "What are the first moves to get going?") { roadmap }
                    divider
                    ReadBlock(read: memo.read)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
        }
        .background(Theme.Stealth.skyTop.ignoresSafeArea())
    }

    private var topBar: some View {
        HStack {
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary)
                    .frame(width: 44, height: 44)
                    .contentShape(.rect)
            }
            .accessibilityLabel("Back")
            Spacer()
            ShareLink(item: memoMarkdown(memo)) {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary)
                    .frame(width: 44, height: 44)
                    .contentShape(.rect)
            }
            .accessibilityLabel("Share memo")
        }
        .padding(.horizontal, 8)
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("MARKET MEMO").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
                Text("·").foregroundStyle(Theme.Stealth.textSecondary)
                Text(briefId).font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
                Text("·").foregroundStyle(Theme.Stealth.textSecondary)
                Text(dateStr).font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
            }
            Text(memo.vertical).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
            Text(memo.oneliner)
                .font(Theme.Typeface.title)
                .foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 4) {
                Text("THE IDEA").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
                Text(memo.idea)
                    .font(Theme.Typeface.body)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var bands: some View {
        VStack(spacing: 12) {
            ForEach(memo.bands) { BandCard(band: $0) }
        }
    }

    private var marketSize: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(memo.marketSize.tam).font(Theme.Typeface.largeTitle).foregroundStyle(Theme.Stealth.amber)
                Text(memo.marketSize.growth).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                TierTag(tier: memo.marketSize.tier)
            }
            if let note = memo.marketSize.note {
                Text(note).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            SourcesRow(sources: memo.marketSize.sources)
        }
    }

    private var competitors: some View {
        VStack(spacing: 12) {
            ForEach(sortedCompetitors) { CompetitorCard(competitor: $0) }
        }
    }

    private var whyNow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(memo.whyNow.shift).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)
            SourcesRow(sources: memo.whyNow.sources)
        }
    }

    private var gaps: some View {
        VStack(alignment: .leading, spacing: 20) {
            ForEach(Array(memo.gaps.enumerated()), id: \.element.id) { i, gap in
                GapRow(index: i + 1, gap: gap)
            }
        }
    }

    private var entryCost: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(memo.entryCost) { EntryCostRow(factor: $0) }
        }
    }

    private var roadmap: some View {
        VStack(alignment: .leading, spacing: 20) {
            ForEach(memo.roadmap) { RoadmapRow(phase: $0) }
        }
    }

    private var divider: some View {
        Rectangle().fill(Theme.Stealth.textSecondary.opacity(0.15)).frame(height: 1)
    }

    private func section<Content: View>(_ num: String, _ name: String, _ q: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHead(num: num, name: name, question: q)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var sortedCompetitors: [MemoCompetitor] {
        let rank: [CompetitorTier: Int] = [.dominant: 0, .strong: 1, .moderate: 2, .niche: 3]
        return memo.competitors.enumerated().sorted { a, b in
            let ra = rank[a.element.tier] ?? 9, rb = rank[b.element.tier] ?? 9
            return ra == rb ? a.offset < b.offset : ra < rb
        }.map(\.element)
    }

    // Deterministic (non-randomized) brief id derived from the idea, so it is
    // stable across launches for a given memo.
    private var briefId: String {
        let n = memo.idea.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF } % 10000
        return String(format: "PLN-2026-%04d", n)
    }

    private var dateStr: String {
        Date.now.formatted(.dateTime.month(.abbreviated).day().year())
    }
}

#Preview {
    MemoView(memo: MockMemo.digitalFitness, onBack: {})
        .preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Screenshot the canonical memo.** Temporarily set the workspace to open straight into the report: in `WorkspaceView.swift` change the default `@State private var screen: WorkspaceScreen = .home` to `= .report(MockMemo.digitalFitness)` **and** in `PlinthsAppApp.swift` set `@State private var isSignedIn = true`. Build, then run the screenshot recipe (`/tmp/m3-memo-top.png`). Read it: expect the identity row (`MARKET MEMO · PLN-… · date`), the oneliner, and three amber band cards with intensity bars. Scroll verification is optional here (full sections are stress-tested in Task 10). **Revert both flags** (`screen = .home`, `isSignedIn = false`) before committing.

- [ ] **Step 4: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Report/MemoView.swift && git commit -m "feat(ios): M3 MemoView assembled report

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Contrasting fixtures + history resolver

**Files:**
- Modify: `PlinthsApp/PlinthsApp/Models/Memo/MockMemo.swift`
- Modify: `PlinthsApp/PlinthsApp/Models/MockWorkspace.swift`

**Interfaces:**
- Consumes: `MockReport` (`Models/MockWorkspace.swift`), all Task 1 types.
- Produces: `MockMemo.crowded`, `MockMemo.open`, `MockMemo.memo(for: MockReport) -> MarketMemo`.

- [ ] **Step 1: Append the two fixtures + resolver to `MockMemo.swift`** (inside `enum MockMemo`, after `digitalFitness`)

```swift
    /// Crowded / high-saturation contrast — a dense field, low opportunity, and
    /// a gap with empty quotes (layout stress). Backs the two "Highly Saturated"
    /// history rows.
    static let crowded = MarketMemo(
        idea: "A platform that helps online creators make money through memberships, tips, and brand deals in one place.",
        vertical: "Creator economy · Global",
        oneliner: "Tons of tools already fight over this, and the big platforms take a large cut. Winning means owning a niche the giants ignore — not going head-to-head with Patreon and YouTube.",
        bands: [
            ScoreBand(axis: .saturation, label: "Crowded",
                      receipt: "Dozens of funded platforms; the top few already own most of the creators worth having.",
                      score: 81, tone: .bad),
            ScoreBand(axis: .difficulty, label: "Hard",
                      receipt: "Payments, payouts, and fraud are heavy lifts — and the giants bundle all of it for free.",
                      score: 68, tone: .mixed),
            ScoreBand(axis: .opportunity, label: "Limited",
                      receipt: "Real demand remains, but most of the easy, obvious niches are already taken.",
                      score: 44, tone: .mixed),
        ],
        marketSize: MarketSizeEvidence(
            tam: "$28B", growth: "growing 12% a year",
            note: "Broad estimate spanning memberships, tipping, and creator commerce — the exact slice a new tool would win is much smaller.",
            tier: .estimate,
            sources: [
                Source(label: "Statista", url: "https://www.statista.com/"),
                Source(label: "CB Insights", url: "https://www.cbinsights.com/"),
            ]),
        competitors: [
            MemoCompetitor(name: "Patreon", tier: .dominant,
                strength: "The default name for memberships, with a huge base of paying fans.",
                weakness: "Takes a meaningful cut and offers creators little control over the relationship.",
                position: "Category leader", fundingStage: "Late stage", url: "https://www.patreon.com/"),
            MemoCompetitor(name: "YouTube", tier: .dominant,
                strength: "Enormous reach and built-in monetization the moment you qualify.",
                weakness: "You rent the audience — the algorithm, not you, owns the relationship.",
                position: "Platform giant", fundingStage: "Public", url: "https://www.youtube.com/"),
            MemoCompetitor(name: "Substack", tier: .dominant,
                strength: "Owns the writer-newsletter niche and the direct-to-inbox relationship.",
                weakness: "Weak beyond text; video and community creators are an afterthought.",
                position: "Niche leader", fundingStage: "Well funded", url: "https://substack.com/"),
            MemoCompetitor(name: "Gumroad", tier: .strong,
                strength: "Dead-simple selling of digital products with almost no setup.",
                weakness: "Thin on recurring memberships and community features.",
                position: "Major", fundingStage: "Funded", url: "https://gumroad.com/"),
            MemoCompetitor(name: "Ko-fi", tier: .niche,
                strength: "Loved for low-friction tips and a creator-friendly free tier.",
                weakness: "Small brand and shallow tooling for anyone building a real business.",
                position: "Smaller, growing", fundingStage: "Bootstrapped", url: "https://ko-fi.com/"),
        ],
        whyNow: WhyNow(
            shift: "Creators increasingly want to own their audience and payments instead of renting both from one platform that can change the rules overnight.",
            tier: .estimate,
            sources: [Source(label: "The Verge", url: "https://www.theverge.com/")]),
        gaps: [
            MemoGap(title: "Payouts that don’t punish small creators",
                description: "The big platforms take a large cut and hold funds for weeks. Smaller creators feel it most, and there’s room for fairer, faster payouts.",
                severity: .high,
                underserved: "Mid-size creators earning real money but too small to negotiate better terms.",
                opportunityScore: 74,
                tags: ["fair payouts", "creator-first"],
                quotes: [
                    GapQuote(quote: "“the fees and the two-week hold quietly eat a whole tier of my income”", source: Source(label: "r/creators", url: "https://www.reddit.com/r/creators/")),
                ]),
            MemoGap(title: "One dashboard across every platform",
                description: "Creators juggle income from five services with no single view of what’s actually working. Nobody ties it together cleanly.",
                severity: .medium,
                underserved: "Full-time creators running memberships, tips, and brand deals in parallel.",
                opportunityScore: 55,
                tags: ["all-in-one", "analytics"],
                quotes: []),
        ],
        entryCost: [
            EntryCostFactor(label: "Payments & fraud",
                value: "Handling money means payment processing, payouts, taxes, and fraud — a serious build before you earn a cent.",
                tier: .fact, sources: []),
            EntryCostFactor(label: "Getting creators",
                value: "Creators are expensive to reach and slow to switch. The realistic path is winning one tight community and expanding by word of mouth.",
                tier: .estimate, sources: [Source(label: "The Verge", url: "https://www.theverge.com/")]),
            EntryCostFactor(label: "Money to start",
                value: "Payments-heavy from day one — plan for $1M–$3M to reach a version creators trust with their income.",
                tier: .estimate, sources: []),
        ],
        roadmap: [
            MemoRoadmapPhase(phase: "Phase 1 · 0–4 months", title: "Pick one underserved niche",
                description: "Choose a single community the giants neglect and solve its payout pain end to end before widening."),
            MemoRoadmapPhase(phase: "Phase 2 · 4–10 months", title: "Nail payouts",
                description: "Make fast, fair, transparent payouts the reason creators stay — the one thing the incumbents won’t copy quickly."),
            MemoRoadmapPhase(phase: "Phase 3 · 10–18 months", title: "Expand across platforms",
                description: "Add the cross-platform dashboard once you own the niche, turning a point tool into the creator’s home base."),
        ],
        read: MemoRead(
            synthesis: "This is a crowded, giant-dominated space where going head-to-head is a losing game. The opening isn’t a better Patreon — it’s owning a niche the giants ignore and solving its money problems better than anyone. The risk is spreading thin; the win is being indispensable to one community first.",
            recommendation: "Don’t compete broadly. Pick one underserved creator niche, make fair fast payouts your wedge, and only expand once that community treats you as home base.",
            limit: "This is an AI-generated read of public information, not financial advice. Market-size and cost figures are estimates — check the linked sources and get professional advice before investing.")
    )

    /// Open / low-saturation contrast — a thin field, high opportunity, rich
    /// quotes. Backs the "Low Saturation" history row.
    static let open = MarketMemo(
        idea: "Project-management software built specifically for small commercial construction firms.",
        vertical: "Construction SaaS · United States",
        oneliner: "A big, underserved market. Most tools are either built for giant contractors or too generic. The opening is software that fits how small crews actually work.",
        bands: [
            ScoreBand(axis: .saturation, label: "Open",
                      receipt: "Few players focus on small commercial firms specifically — most chase the enterprise end.",
                      score: 34, tone: .good),
            ScoreBand(axis: .difficulty, label: "Moderate",
                      receipt: "Sales cycles are slow and buyers are cautious, but the technology itself is straightforward.",
                      score: 52, tone: .mixed),
            ScoreBand(axis: .opportunity, label: "Strong",
                      receipt: "Clear pain, weak incumbents for this segment, and buyers who are actively looking.",
                      score: 83, tone: .good),
        ],
        marketSize: MarketSizeEvidence(
            tam: "$9.2B", growth: "growing 9% a year",
            note: nil,
            tier: .estimate,
            sources: [
                Source(label: "Grand View ’25", url: "https://www.grandviewresearch.com/"),
                Source(label: "IBISWorld", url: "https://www.ibisworld.com/"),
            ]),
        competitors: [
            MemoCompetitor(name: "Procore", tier: .strong,
                strength: "The enterprise standard, deep feature set, trusted by large general contractors.",
                weakness: "Overkill and expensive for small crews — long onboarding they don’t have time for.",
                position: "Enterprise leader", fundingStage: "Public", url: "https://www.procore.com/"),
            MemoCompetitor(name: "Buildertrend", tier: .moderate,
                strength: "Popular with builders and priced below the enterprise tools.",
                weakness: "Leans residential; small-commercial workflows are an afterthought.",
                position: "Major (residential)", fundingStage: "Funded", url: "https://buildertrend.com/"),
        ],
        whyNow: WhyNow(
            shift: "Construction is finally digitizing, and small firms now expect software as good as the consumer apps on their phones — patience for clunky tools is gone.",
            tier: .estimate,
            sources: [Source(label: "Construction Dive", url: "https://www.constructiondive.com/")]),
        gaps: [
            MemoGap(title: "Tools that match how small crews work",
                description: "Small commercial firms run lean and mobile. The big tools assume office admins and full-time schedulers they don’t have.",
                severity: .high,
                underserved: "5–30 person commercial firms doing real jobs with no dedicated software staff.",
                opportunityScore: 88,
                tags: ["mobile-first", "small crews"],
                quotes: [
                    GapQuote(quote: "“Procore is a Ferrari and I need a pickup truck”", source: Source(label: "r/construction", url: "https://www.reddit.com/r/construction/")),
                    GapQuote(quote: "“my foreman won’t touch anything that takes more than two taps”", source: Source(label: "Capterra", url: "https://www.capterra.com/")),
                ]),
            MemoGap(title: "Pricing a small firm can stomach",
                description: "Enterprise per-seat pricing doesn’t fit a crew that scales up and down by the job. Nobody prices for that reality.",
                severity: .high,
                underserved: "Owner-operators who won’t sign an enterprise contract for a 12-person shop.",
                opportunityScore: 79,
                tags: ["fair pricing", "flexible"],
                quotes: [
                    GapQuote(quote: "“the per-seat math kills it the second I add seasonal guys”", source: Source(label: "G2", url: "https://www.g2.com/")),
                ]),
        ],
        entryCost: [
            EntryCostFactor(label: "Rules & safety",
                value: "Construction carries safety and compliance expectations, but a scheduling and coordination tool doesn’t need heavy certification to start.",
                tier: .fact, sources: []),
            EntryCostFactor(label: "Getting customers",
                value: "Buyers are offline and referral-driven. Trade associations and word of mouth beat paid ads in this segment.",
                tier: .estimate, sources: [Source(label: "Construction Dive", url: "https://www.constructiondive.com/")]),
            EntryCostFactor(label: "Money to start",
                value: "A focused software play is reachable — roughly $750K–$2M to a version crews rely on daily.",
                tier: .estimate, sources: []),
        ],
        roadmap: [
            MemoRoadmapPhase(phase: "Phase 1 · 0–3 months", title: "Win a beachhead trade",
                description: "Pick one trade (say, electrical or HVAC subs) and make their jobsite coordination effortless before going wider."),
            MemoRoadmapPhase(phase: "Phase 2 · 3–9 months", title: "Prove ROI on jobsites",
                description: "Instrument time saved and rework avoided so the tool sells itself through referrals inside the trade."),
            MemoRoadmapPhase(phase: "Phase 3 · 9–18 months", title: "Expand across trades",
                description: "Generalize the workflows that worked and grow into adjacent trades on the back of proven, referenceable customers."),
        ],
        read: MemoRead(
            synthesis: "This is the rare open lane: real, well-understood pain, incumbents aimed elsewhere, and buyers actively looking. The hard part isn’t the product — it’s a slow, offline, referral-driven sales motion. Whoever earns trust in one trade and lets results travel by word of mouth can own a segment the giants find too small to bother with.",
            recommendation: "Go narrow first. Win one trade with a mobile-first, fairly priced tool, prove ROI on real jobsites, and expand only on the strength of referrals.",
            limit: "This is an AI-generated read of public information, not financial advice. Market-size and cost figures are estimates — check the linked sources and get professional advice before investing.")
    )

    /// Resolves a history row to its fixture (see the M3 spec's mapping table).
    static func memo(for report: MockReport) -> MarketMemo {
        switch report.id {
        case "mock-h1", "mock-h2": crowded   // creator economy, sustainable food
        case "mock-h3":            open      // construction SaaS
        default:                   digitalFitness
        }
    }
```

- [ ] **Step 2: Align two history scores in `MockWorkspace.swift`** so each row's chip matches its resolved memo's saturation band. Change `mock-h1` `saturationScore: 73` → `81` and `mock-h4` `saturationScore: 47` → `62` (labels are unchanged — 81 stays "Highly Saturated", 62 stays "Moderately Saturated"):

```swift
        MockReport(id: "mock-h1", ideaText: "Creator economy monetization platform",
                   saturationScore: 81, saturationLabel: "Highly Saturated",
                   createdAt: Date(timeIntervalSinceNow: -3600 * 2)),
```
and
```swift
        MockReport(id: "mock-h4", ideaText: "Pet telehealth and vet booking service",
                   saturationScore: 62, saturationLabel: "Moderately Saturated",
                   createdAt: Date(timeIntervalSinceNow: -86400 * 5)),
```

- [ ] **Step 3: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Screenshot both contrast fixtures.** Temporarily set `WorkspaceView`'s default `screen = .report(MockMemo.crowded)` and `isSignedIn = true`; screenshot `/tmp/m3-crowded.png`; then `screen = .report(MockMemo.open)`, screenshot `/tmp/m3-open.png`. Read both: confirm the layout holds for 5 competitors + an empty-quote gap (crowded) and 2 competitors + rich quotes + a nil market-size note (open). **Revert** `screen = .home` and `isSignedIn = false` before committing.

- [ ] **Step 5: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/Memo/MockMemo.swift PlinthsApp/PlinthsApp/Models/MockWorkspace.swift && git commit -m "feat(ios): M3 crowded/open memo fixtures + history resolver

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Workspace integration (loading→report, history→report, back)

**Files:**
- Modify: `PlinthsApp/PlinthsApp/Models/WorkspaceScreen.swift`
- Modify: `PlinthsApp/PlinthsApp/Workspace/PipelineLoadingView.swift`
- Modify: `PlinthsApp/PlinthsApp/Workspace/WorkspaceView.swift`

**Interfaces:**
- Consumes: `MarketMemo`, `MockMemo`, `MemoView`, `HistoryDrawer` (existing signature `HistoryDrawer(reports:onSelect:)`), `PipelineLoadingView`.
- Produces: `WorkspaceScreen.report(MarketMemo)`; `PipelineLoadingView(idea:onCancel:onComplete:)`.

- [ ] **Step 1: Add the report case to `WorkspaceScreen.swift`**

Replace the enum body so it reads:
```swift
/// The active workspace surface. `.report` carries the memo to display.
enum WorkspaceScreen {
    case home
    case loading
    case report(MarketMemo)
}
```

- [ ] **Step 2: Add `onComplete` to `PipelineLoadingView.swift`**

Add the property beside `onCancel`:
```swift
    let idea: String
    let onCancel: () -> Void
    var onComplete: () -> Void = {}
```
Then extend the existing `.task` (which currently sleeps `totalSeconds` then sets `isComplete = true`) to fire `onComplete` after a short beat on the final frame:
```swift
        .task {
            try? await Task.sleep(for: .seconds(PipelineStage.totalSeconds))
            isComplete = true
            try? await Task.sleep(for: .seconds(0.6))
            onComplete()
        }
```
Leave the `#Preview` as `PipelineLoadingView(idea: "AI fitness coaching app", onCancel: {})` — `onComplete` has a default, so it still compiles.

- [ ] **Step 3: Rewrite `WorkspaceView.swift`** so the report is a full-screen branch (no composer top bar), loading auto-advances, and history resolves to a memo:

```swift
import SwiftUI

/// The signed-in workspace root: the idea-input home, the pipeline-loading
/// screen, and — new in M3 — the market-memo report. History is a sheet (tap ☰).
/// The report is a dedicated full-screen surface; `reportOrigin` remembers where
/// it was opened from so back returns there.
struct WorkspaceView: View {
    @State private var screen: WorkspaceScreen = .home
    @State private var draft = ""
    @State private var isHistoryOpen = false
    @State private var reportOrigin: ReportOrigin = .home

    private enum ReportOrigin { case home, history }

    var body: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()

            switch screen {
            case .home:
                VStack(spacing: 0) {
                    WorkspaceTopBar(onHistory: { isHistoryOpen = true }, onNew: startNew)
                    WorkspaceHome(draft: $draft, onSubmit: submit)
                }
            case .loading:
                VStack(spacing: 0) {
                    WorkspaceTopBar(onHistory: { isHistoryOpen = true }, onNew: startNew)
                    PipelineLoadingView(idea: draft, onCancel: startNew,
                                        onComplete: { showReport(MockMemo.digitalFitness, origin: .home) })
                }
            case .report(let memo):
                MemoView(memo: memo, onBack: backFromReport)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $isHistoryOpen) {
            HistoryDrawer(reports: MockWorkspace.history) { report in
                openReport(for: report)
            }
            .presentationBackground(Theme.Stealth.skyTop)
            .preferredColorScheme(.dark)
        }
    }

    private func submit() {
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        screen = .loading
    }

    private func showReport(_ memo: MarketMemo, origin: ReportOrigin) {
        reportOrigin = origin
        screen = .report(memo)
    }

    private func openReport(for report: MockReport) {
        isHistoryOpen = false
        showReport(MockMemo.memo(for: report), origin: .history)
    }

    private func backFromReport() {
        screen = .home
        if reportOrigin == .history { isHistoryOpen = true }
    }

    private func startNew() {
        draft = ""
        screen = .home
        isHistoryOpen = false
    }
}
```

- [ ] **Step 4: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Screenshot the real flow.** Temporarily set `isSignedIn = true` in `PlinthsAppApp.swift` (leave `WorkspaceView.screen = .home`). Run the app: type/pick an idea, tap send, wait ~7s for loading to auto-advance, screenshot `/tmp/m3-flow-report.png` (expect the Digital Fitness memo). Then tap `‹` back (expect home), open `☰`, tap the "Creator economy" row, screenshot `/tmp/m3-flow-history.png` (expect the crowded memo, and `‹` back should reopen the history sheet). Read both. **Revert** `isSignedIn = false` before committing.

- [ ] **Step 6: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/WorkspaceScreen.swift PlinthsApp/PlinthsApp/Workspace/PipelineLoadingView.swift PlinthsApp/PlinthsApp/Workspace/WorkspaceView.swift && git commit -m "feat(ios): M3 wire loading→report and history→report navigation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: SETUP doc + final verification

**Files:**
- Modify: `PlinthsApp/SETUP.md`

- [ ] **Step 1: Update the project-structure list** — add the `Report/` folder and the `Models/Memo/` files. Under `Workspace/` the entries are unchanged; after the `Models/` block, add:

```text
  Models/
    …
    Memo/
      MemoModel.swift        # the v2 Market Memo value types
      MockMemo.swift         # 3 memo fixtures + history resolver
  Report/
    MemoView.swift           # the assembled market-memo report
    SectionHead.swift        # numbered section header
    BandCard.swift           # one hero score band (amber-only)
    CompetitorCard.swift     # one competitor (tier dot + strength/weakness)
    GapRow.swift             # one market gap + quote receipts
    EntryCostRow.swift       # one cost-to-enter factor
    RoadmapRow.swift         # one roadmap phase
    ReadBlock.swift          # The Bottom Line
    TierTag.swift            # evidence-tier badge (mono, amber-only)
    CitePill.swift           # tappable source citation
    SourcesRow.swift         # "GROUNDED IN" + citation pills
    MemoMarkdown.swift       # memo → markdown for the share sheet
```

- [ ] **Step 2: Update the Status section** — replace the M2 status paragraph's opening with M3:

Change `Milestone 2 complete:` to `Milestone 3 complete:` and append a sentence after the existing pipeline-loading sentence:
```text
On completion the loading screen now advances to a full **Market Memo** report —
hero score bands (amber-only), market size, competitors, why-now, gaps with
sourced quotes, cost to enter, an entry roadmap, and an honest bottom line —
reached on submit or by tapping a history row. Still all mock (3 fixtures); the
real API lands in M4.
```

- [ ] **Step 3: Build + confirm production defaults.** Run the build (expect `** BUILD SUCCEEDED **`) and verify `git grep -n "isSignedIn = true\|screen: WorkspaceScreen = .report\|= .report(MockMemo"` returns **nothing** in `PlinthsApp/PlinthsApp/` (all screenshot flag-flips reverted).

```bash
cd /Users/wakeensito/Plinths && git grep -n "isSignedIn = true" -- 'PlinthsApp/PlinthsApp/'; git grep -nE "WorkspaceScreen = \.report|= \.report\(MockMemo" -- 'PlinthsApp/PlinthsApp/'
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/SETUP.md && git commit -m "docs(ios): SETUP reflects the M3 market-memo report

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- v2 memo (not classic) target → Tasks 1–2, 9 ✓
- Full memo incl. sourcing → `SourcesRow`/`CitePill` (Task 3), used in market size / why-now / gaps / entry cost (Task 9) ✓
- Amber-only score encoding + intensity bar → `BandCard` (Task 4), `TierTag`/tier dot mono (Tasks 3, 5) ✓
- Dedicated report view, back chevron + ShareLink, identity header → `MemoView` (Task 9) ✓
- 3 varied fixtures + history mapping → Tasks 2, 10 ✓
- `.report(MarketMemo)` state, loading→report, history→report, origin-aware back → Task 11 ✓
- Muse anchors modeled but inert → derived-by-position in `MemoView`, no stored field (Task 1 note) ✓
- Sections in web order (identity, bands, 01–06, The Bottom Line) → Task 9 ✓
- Markdown share → Task 8 ✓
- Verification (build + screenshots of all 3 fixtures) → Tasks 9, 10, 11 ✓
- No new Theme tokens; amber-only everywhere → Global Constraints + every view task ✓
- SETUP refresh → Task 12 ✓

**Placeholder scan:** No "TBD/TODO". Every code step ships complete Swift; fixtures are fully authored. No test target by design (documented in Global Constraints) — verification is build + screenshot per the M1/M2 pattern.

**Type consistency:** `MarketMemo`/`ScoreBand`/`MemoCompetitor`/`MemoGap`/`GapQuote`/`EntryCostFactor`/`MemoRoadmapPhase`/`MemoRead`/`Source`/`EvidenceTier`/`CompetitorTier`/`GapSeverity`/`ScoreAxis`/`BandTone` defined in Task 1 and used consistently thereafter. Subview signatures — `SectionHead(num:name:question:)`, `TierTag(tier:)`, `CitePill(source:)`, `SourcesRow(label:sources:)`, `BandCard(band:)`, `CompetitorCard(competitor:)`, `GapRow(index:gap:)`, `MemoQuoteRow(quote:)`, `EntryCostRow(factor:)`, `RoadmapRow(phase:)`, `ReadBlock(read:)`, `MemoView(memo:onBack:)`, `memoMarkdown(_:)` — match between definition (Tasks 3–9) and use (Task 9). `PipelineLoadingView(idea:onCancel:onComplete:)` and `WorkspaceScreen.report` match between Task 11's edits and their callers. `HistoryDrawer(reports:onSelect:)` matches the existing (unchanged) signature. `MockMemo.memo(for:)` (Task 10) is consumed by `WorkspaceView.openReport` (Task 11).
