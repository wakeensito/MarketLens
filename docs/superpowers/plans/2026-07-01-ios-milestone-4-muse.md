# iOS Milestone 4 — Muse chat + report↔muse navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the per-report Muse conversation surface and the two-face (report ⇄ muse) mobile navigation to the native iOS app, mock-first.

**Architecture:** A `ReportSurface` container owns one report's session state and swaps between `MemoView` (report) and `MuseView` (conversation) via a destination-toggle glyph. Muse renders locked "document Q/A" turns with streaming prose, `**bold**` and `[[cell|Label]]` inline citations, a sources row, action row, and follow-up chips. Citations flip to the report and scroll+pulse the cited cell. Content is per-report canned threads behind an in-memory `@Observable MuseStore`.

**Tech Stack:** SwiftUI (iOS 26.2, Swift 6.2), the Observation framework (`@Observable`/`@Environment`), Xcode 26.3, `xcodebuild`, `xcrun simctl`.

## Global Constraints

- **Deployment target iOS 26.2 · Swift 6.2 · Xcode 26.3.** Files created under `PlinthsApp/PlinthsApp/` auto-join the build (file-system-synchronized groups) — no manual target step.
- **No test target yet** (lands in M7). The verification gate for every task is `xcodebuild … build` succeeding, plus — for view/flow tasks — a simulator screenshot reached by a temporary flag-flip that is reverted before commit. This is the established M1–M3 pattern; do NOT add a test target. (`parseMuseRuns` is a prime M7 unit-test candidate — note it, don't test it now.)
- **Amber is the only color.** Use `Theme.Stealth` tokens only (`skyTop`, `skyMid`, `amber`, `text`, `textSecondary`, `sand`). **No additions to `Theme.swift`.** Citation pills, the ▬▬ mark, active thumbs (BOTH up and down), the stream cursor, and the citation pulse are all amber or `textSecondary`. No coral/`warning`/`success`.
- **Locked craft (CLAUDE.md → Muse):** document-pair turns (serif query heading + hairline rule + answer block, no bubbles/avatars); `GROUNDED IN` sources row above prose; no "thinking" state; action row `COPY · REGENERATE · CITE AS MARKDOWN` + thumbs; 3 follow-up chips as a vertical hairline-bordered list; empty state is the single Plex Mono line `MUSE · ready · grounded in this report`; toggle glyph shows the *destination* (chat-bubble → muse, ▬▬ → report), never ✕ or a paperclip; back banner (`FROM YOUR CONVERSATION · ← BACK TO CHAT`) appears only on citation arrival; plain mount/unmount face swaps, no `layoutId` morph.
- **Prose font:** Muse answer prose uses `Theme.Typeface.body` (sans) — matching how the M3 report already renders prose. Serif (`Theme.Typeface.title`) is reserved for the query heading. Citations use `Theme.Typeface.caption` (mono) in amber. (Intentional native-consistency divergence from the web's serif prose — do not add a font role.)
- **Thread/content key = `reportKey`:** one of `"digitalFitness"`, `"crowded"`, `"open"`. Threads and canned content are keyed by this, NOT by history-row id — so the two history rows that share the `crowded` memo share one thread (consistent with the existing M3 mock artifact).
- **Reveal model:** a turn is `(displayedQuery, resolvedAnswer)` where the displayed query is what the user actually asked. Free-typed → the user's text + the report's canonical answer. Chip tap → the chip's exact text + that chip's mapped authored answer.
- **verbatim** curly quotes/apostrophes/em-dashes preserved in authored content (use `\u{201C}`/`\u{201D}` for curly double-quotes as M3 did).
- **SourceKit cross-file "Cannot find X" diagnostics are noise** — `xcodebuild` is authoritative.
- **Build command:**
  ```bash
  cd /Users/wakeensito/Plinths/PlinthsApp && xcodebuild -project PlinthsApp.xcodeproj -scheme PlinthsApp -destination 'generic/platform=iOS Simulator' build 2>&1 | tail -3
  ```
  Expected: `** BUILD SUCCEEDED **`.
- **Screenshot recipe** (when a task calls for it):
  ```bash
  xcrun simctl boot "iPhone 17" 2>/dev/null; open -a Simulator
  APP=$(find ~/Library/Developer/Xcode/DerivedData/PlinthsApp-*/Build/Products/Debug-iphonesimulator -name "PlinthsApp.app" | head -1)
  xcrun simctl install booted "$APP"
  xcrun simctl terminate booted Plinths.PlinthsApp 2>/dev/null
  xcrun simctl launch booted Plinths.PlinthsApp; sleep 8
  xcrun simctl io booted screenshot /tmp/m4-<name>.png
  ```
  Taps are NOT scriptable (no idb/cliclick; AppleScript blocked). Reach a state by temporarily setting a `@State` default and/or `isSignedIn = true`, screenshot, then REVERT before commit.
- **Commit cadence:** one commit per task; end every message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch: `feat/ios-m4-muse` (already created off `main`).

---

## File Structure

**Create — models (`PlinthsApp/PlinthsApp/Models/Muse/`):**
- `MuseModel.swift` — `MuseRun`, `MuseCitationTarget`, `MuseCellRef`, `MuseFeedbackValue`, `MuseTurn`, `ReportFace`, and `parseMuseRuns(_:)` + `museTarget(_:)`.
- `MockMuse.swift` — `canonicalTurn(for:query:)`, `turn(forChip:in:)`, authored content for the 3 report keys.
- `MuseStore.swift` — `@Observable` in-memory thread store keyed by `reportKey`.

**Create — views (`PlinthsApp/PlinthsApp/Muse/`, one type per file):**
- `SaturationToggleMark.swift` · `MuseEmptyLine.swift` · `MuseCitePill.swift` · `MuseSourcesRow.swift` · `MuseProseText.swift` · `MuseActionRow.swift` · `MuseFollowupChips.swift` · `MuseComposer.swift` · `MuseTurnView.swift` · `MuseView.swift` · `BackToChatBanner.swift` · `ReportSurface.swift`

**Modify:**
- `Models/WorkspaceScreen.swift` — `.report(MarketMemo, Date, String)` (add `reportKey`).
- `Models/Memo/MockMemo.swift` — add `reportKey(for:)` + `digitalFitnessKey`.
- `Workspace/WorkspaceView.swift` — route `.report` to `ReportSurface`; read `MuseStore`; thread `reportKey` + initial face.
- `Report/MemoView.swift` — `ScrollViewReader` + cell IDs + citation pulse + docked composer + toggle glyph + back banner (via new params).
- `PlinthsAppApp.swift` — own + inject `MuseStore`.
- `PlinthsApp/SETUP.md` — M4 status.

---

## Task 1: Muse model + run parser

**Files:** Create `PlinthsApp/PlinthsApp/Models/Muse/MuseModel.swift`

**Interfaces:**
- Produces: `MuseRun` (`.text`/`.bold`/`.cite(target:label:)`), `MuseCitationTarget` (`.competitor(Int)`/`.gap(Int)`/`.roadmap(Int)`), `museTarget(_ raw: String) -> MuseCitationTarget?`, `MuseCellRef`, `MuseFeedbackValue`, `MuseTurn`, `ReportFace`, `parseMuseRuns(_ raw: String) -> [MuseRun]`.

- [ ] **Step 1: Write `MuseModel.swift`**

```swift
import Foundation

/// One face of the report surface.
enum ReportFace: Equatable { case report, muse }

/// Where a citation points, 1-indexed to match MemoView's cell ids.
enum MuseCitationTarget: Equatable {
    case competitor(Int), gap(Int), roadmap(Int)

    /// The scroll id used in MemoView (e.g. "competitor-1").
    var cellID: String {
        switch self {
        case .competitor(let n): "competitor-\(n)"
        case .gap(let n):        "gap-\(n)"
        case .roadmap(let n):    "roadmap-\(n)"
        }
    }
}

/// Parse a raw target string like "competitor-2" into a typed target.
func museTarget(_ raw: String) -> MuseCitationTarget? {
    let parts = raw.split(separator: "-")
    guard parts.count == 2, let n = Int(parts[1]) else { return nil }
    switch parts[0] {
    case "competitor": return .competitor(n)
    case "gap":        return .gap(n)
    case "roadmap":    return .roadmap(n)
    default:           return nil
    }
}

/// A renderable span of an answer.
enum MuseRun: Equatable {
    case text(String)
    case bold(String)
    case cite(target: String, label: String)   // target e.g. "competitor-2"
}

/// A citation pill in the GROUNDED IN sources row.
struct MuseCellRef: Identifiable, Equatable {
    var id: String { label }
    let target: String     // "competitor-2"
    let label: String      // "Competitors"
}

enum MuseFeedbackValue: Equatable { case none, up, down }

/// One resolved conversation turn.
struct MuseTurn: Identifiable, Equatable {
    let id: String
    let query: String        // what the user actually asked (typed or chip text)
    let answerRaw: String     // the [[…]]/**…** source string
    let sources: [MuseCellRef]
    let followups: [String]   // 3 follow-up questions
    var feedback: MuseFeedbackValue = .none
}

/// Split an answer string into runs. Stream-safe: an unterminated `**` or `[[`
/// at the end renders as plain text until it closes.
func parseMuseRuns(_ raw: String) -> [MuseRun] {
    var runs: [MuseRun] = []
    let chars = Array(raw)
    var text = ""
    var i = 0
    func flush() { if !text.isEmpty { runs.append(.text(text)); text = "" } }

    while i < chars.count {
        // Citation [[target|label]]
        if chars[i] == "[", i + 1 < chars.count, chars[i + 1] == "[" {
            if let close = closeIndex(chars, from: i + 2, marker: "]") {
                let inner = String(chars[(i + 2)..<close])
                let bar = inner.split(separator: "|", maxSplits: 1).map(String.init)
                let target = bar.first ?? ""
                let label = bar.count > 1 ? bar[1] : target
                flush()
                runs.append(.cite(target: target, label: label))
                i = close + 2
                continue
            } else {
                text += String(chars[i...]); i = chars.count; break   // unterminated → text
            }
        }
        // Bold **text**
        if chars[i] == "*", i + 1 < chars.count, chars[i + 1] == "*" {
            if let close = closeIndex(chars, from: i + 2, marker: "*") {
                flush()
                runs.append(.bold(String(chars[(i + 2)..<close])))
                i = close + 2
                continue
            } else {
                text += String(chars[i...]); i = chars.count; break
            }
        }
        text.append(chars[i]); i += 1
    }
    flush()
    return runs
}

/// Index of the first doubled `marker` (e.g. "]]" or "**") at/after `from`, or nil.
private func closeIndex(_ chars: [Character], from: Int, marker: Character) -> Int? {
    var j = from
    while j + 1 < chars.count {
        if chars[j] == marker, chars[j + 1] == marker { return j }
        j += 1
    }
    return nil
}

#Preview("parse check") {
    let sample = "Whoop [[competitor-2|Whoop]] locks you into **hardware** and barely coaches."
    return VStack(alignment: .leading, spacing: 6) {
        ForEach(Array(parseMuseRuns(sample).enumerated()), id: \.offset) { _, run in
            switch run {
            case .text(let s):  Text("text: \(s)")
            case .bold(let s):  Text("bold: \(s)").bold()
            case .cite(let t, let l): Text("cite: \(l) → \(t)").foregroundStyle(.orange)
            }
        }
    }.padding()
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/Muse/MuseModel.swift && git commit -m "feat(ios): M4 Muse model + [[cite]]/**bold** run parser

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Mock threads

**Files:** Create `PlinthsApp/PlinthsApp/Models/Muse/MockMuse.swift`

**Interfaces:**
- Consumes: `MuseTurn`, `MuseCellRef` (Task 1).
- Produces: `MockMuse.canonicalTurn(for reportKey: String, query: String) -> MuseTurn`, `MockMuse.turn(forChip chip: String, in reportKey: String) -> MuseTurn`.

- [ ] **Step 1: Write `MockMuse.swift`** (authored content for all 3 report keys; each answer cites that report's real cells)

```swift
import Foundation

/// Canned Muse threads (no live backend until M7). Content is keyed by reportKey
/// ("digitalFitness"/"crowded"/"open") and cites that report's real cells.
enum MockMuse {

    /// The report's canonical answer — returned for any free-typed question. The
    /// displayed query is the user's own text.
    static func canonicalTurn(for reportKey: String, query: String) -> MuseTurn {
        let a = answers[reportKey] ?? answers["digitalFitness"]!
        return MuseTurn(id: "\(reportKey)-canonical-\(query.hashValue)",
                        query: query, answerRaw: a.canonical.raw,
                        sources: a.canonical.sources, followups: a.chipQuestions)
    }

    /// The authored answer mapped to a follow-up chip. The displayed query is the
    /// chip's exact text.
    static func turn(forChip chip: String, in reportKey: String) -> MuseTurn {
        let a = answers[reportKey] ?? answers["digitalFitness"]!
        let mapped = a.chips[chip] ?? a.canonical
        return MuseTurn(id: "\(reportKey)-chip-\(chip.hashValue)",
                        query: chip, answerRaw: mapped.raw,
                        sources: mapped.sources, followups: a.chipQuestions)
    }

    // MARK: - Authored content

    private struct Answer { let raw: String; let sources: [MuseCellRef] }
    private struct ReportAnswers {
        let canonical: Answer
        let chipQuestions: [String]          // the 3 follow-up chips shown under every turn
        let chips: [String: Answer]          // chipQuestion → mapped answer
    }

    private static let answers: [String: ReportAnswers] = [
        "digitalFitness": ReportAnswers(
            canonical: Answer(
                raw: "The threats that matter are [[competitor-1|Future]] and [[competitor-2|Whoop]] — but both chase the **expensive, hardware-heavy end**. Neither adapts a plan to you at a price normal people can pay.",
                sources: [MuseCellRef(target: "competitor-1", label: "Competitors")]),
            chipQuestions: ["Where's the opening?", "How hard is it to enter?", "What would you build first?"],
            chips: [
                "Where's the opening?": Answer(
                    raw: "The clearest gap is [[gap-1|a plan that adapts to you]] — none of the big apps change the plan based on your sleep, food, and schedule. That's the **affordable, adapts-to-you** spot no one owns.",
                    sources: [MuseCellRef(target: "gap-1", label: "Gap 01")]),
                "How hard is it to enter?": Answer(
                    raw: "Moderate. The real challenge isn't the tech — it's **retention**: keeping people past the first couple of months, plus health-data privacy rules.",
                    sources: []),
                "What would you build first?": Answer(
                    raw: "Start with [[roadmap-1|proving the loop]] — one adaptive coaching flow to a small cohort, measured on week-4 retention before anything else.",
                    sources: [MuseCellRef(target: "roadmap-1", label: "Roadmap")]),
            ]),
        "crowded": ReportAnswers(
            canonical: Answer(
                raw: "This is a **giant-dominated** space — [[competitor-1|Patreon]] and [[competitor-2|YouTube]] own the paying creators. Going head-to-head is a losing game; the win is owning a niche they ignore.",
                sources: [MuseCellRef(target: "competitor-1", label: "Competitors")]),
            chipQuestions: ["So where's the opening?", "Is it worth entering?", "What's the first move?"],
            chips: [
                "So where's the opening?": Answer(
                    raw: "In [[gap-1|payouts that don't punish small creators]] — the giants take a big cut and hold funds for weeks. **Fair, fast payouts** is the wedge.",
                    sources: [MuseCellRef(target: "gap-1", label: "Gap 01")]),
                "Is it worth entering?": Answer(
                    raw: "Only narrowly. Opportunity is **limited** at the broad level — most easy niches are taken. Pick one underserved community and be indispensable to it.",
                    sources: []),
                "What's the first move?": Answer(
                    raw: "[[roadmap-1|Pick one underserved niche]] and solve its payout pain end-to-end before widening. Don't try to out-feature the giants.",
                    sources: [MuseCellRef(target: "roadmap-1", label: "Roadmap")]),
            ]),
        "open": ReportAnswers(
            canonical: Answer(
                raw: "This is the **rare open lane** — [[competitor-1|Procore]] aims at big contractors, not small crews. Real pain, weak incumbents for this segment, buyers actively looking.",
                sources: [MuseCellRef(target: "competitor-1", label: "Competitors")]),
            chipQuestions: ["What's the gap exactly?", "What's the catch?", "Where do I start?"],
            chips: [
                "What's the gap exactly?": Answer(
                    raw: "[[gap-1|Tools that match how small crews actually work]] — mobile-first, two-tap simple. The enterprise tools assume office admins small firms don't have.",
                    sources: [MuseCellRef(target: "gap-1", label: "Gap 01")]),
                "What's the catch?": Answer(
                    raw: "The **sales motion** — it's slow, offline, and referral-driven. The product is the easy part; earning trust in a trade is the work.",
                    sources: []),
                "Where do I start?": Answer(
                    raw: "[[roadmap-1|Win one beachhead trade]] — make one trade's jobsite coordination effortless, prove ROI, then let referrals travel.",
                    sources: [MuseCellRef(target: "roadmap-1", label: "Roadmap")]),
            ]),
    ]
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/Muse/MockMuse.swift && git commit -m "feat(ios): M4 canned per-report Muse threads

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: MuseStore

**Files:** Create `PlinthsApp/PlinthsApp/Models/Muse/MuseStore.swift`

**Interfaces:**
- Consumes: `MuseTurn`, `MuseFeedbackValue` (Task 1).
- Produces: `@Observable final class MuseStore` with `thread(for:) -> [MuseTurn]`, `hasThread(for:) -> Bool`, `append(_:for:)`, `setFeedback(_:turnID:reportKey:)`.

- [ ] **Step 1: Write `MuseStore.swift`**

```swift
import Foundation
import Observation

/// In-memory per-session thread store, keyed by reportKey. Durable (across-launch)
/// persistence is deferred to M7 with the real backend.
@Observable
final class MuseStore {
    private var threads: [String: [MuseTurn]] = [:]

    func thread(for reportKey: String) -> [MuseTurn] { threads[reportKey] ?? [] }
    func hasThread(for reportKey: String) -> Bool { !(threads[reportKey] ?? []).isEmpty }

    func append(_ turn: MuseTurn, for reportKey: String) {
        threads[reportKey, default: []].append(turn)
    }

    func setFeedback(_ value: MuseFeedbackValue, turnID: String, reportKey: String) {
        guard var t = threads[reportKey], let idx = t.firstIndex(where: { $0.id == turnID }) else { return }
        t[idx].feedback = value
        threads[reportKey] = t
    }
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/Muse/MuseStore.swift && git commit -m "feat(ios): M4 in-memory MuseStore

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Leaf glyphs (SaturationToggleMark · MuseEmptyLine · MuseCitePill)

**Files:** Create `Muse/SaturationToggleMark.swift`, `Muse/MuseEmptyLine.swift`, `Muse/MuseCitePill.swift`

**Interfaces:**
- Consumes: `MuseCellRef` (Task 1).
- Produces: `SaturationToggleMark()`, `MuseEmptyLine()`, `MuseCitePill(cell:onTap:)`.

- [ ] **Step 1: `SaturationToggleMark.swift`** (the ▬▬ two-bar mark)

```swift
import SwiftUI

/// The two-bar mini-saturation mark — the "go to report" toggle glyph.
struct SaturationToggleMark: View {
    var body: some View {
        HStack(spacing: 3) {
            Capsule().frame(width: 11, height: 3)
            Capsule().frame(width: 7, height: 3)
        }
        .foregroundStyle(Theme.Stealth.amber)
    }
}

#Preview {
    SaturationToggleMark().padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 2: `MuseEmptyLine.swift`**

```swift
import SwiftUI

/// The Muse empty state — one mono line where the thread will be. No greeting.
struct MuseEmptyLine: View {
    var body: some View {
        Text("MUSE · ready · grounded in this report")
            .font(Theme.Typeface.caption)
            .foregroundStyle(Theme.Stealth.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    MuseEmptyLine().padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 3: `MuseCitePill.swift`** (a capsule pill in the sources row; tap routes to a cell, not a URL)

```swift
import SwiftUI

/// A citation pill in the GROUNDED IN sources row. Tapping routes to the cited
/// report cell (via onTap), unlike the report's URL-opening CitePill.
struct MuseCitePill: View {
    let cell: MuseCellRef
    let onTap: (String) -> Void   // target string, e.g. "competitor-2"

    var body: some View {
        Button { onTap(cell.target) } label: {
            Text(cell.label)
                .font(Theme.Typeface.badge)
                .foregroundStyle(Theme.Stealth.amber)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Theme.Stealth.amber.opacity(0.12))
                .overlay(Capsule().stroke(Theme.Stealth.amber.opacity(0.25), lineWidth: 1))
                .clipShape(.capsule)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Go to \(cell.label)")
        .accessibilityAddTraits(.isLink)
    }
}

#Preview {
    MuseCitePill(cell: MuseCellRef(target: "competitor-1", label: "Competitors"), onTap: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 4: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 5: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/SaturationToggleMark.swift PlinthsApp/PlinthsApp/Muse/MuseEmptyLine.swift PlinthsApp/PlinthsApp/Muse/MuseCitePill.swift && git commit -m "feat(ios): M4 Muse leaf glyphs (toggle mark, empty line, cite pill)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: MuseSourcesRow

**Files:** Create `Muse/MuseSourcesRow.swift`

**Interfaces:**
- Consumes: `MuseCellRef` (Task 1), `MuseCitePill` (Task 4).
- Produces: `MuseSourcesRow(sources:onTap:)`.

- [ ] **Step 1: Write `MuseSourcesRow.swift`**

```swift
import SwiftUI

/// The GROUNDED IN row above a Muse answer — a mono label + citation pills.
/// Renders nothing when there are no sources.
struct MuseSourcesRow: View {
    let sources: [MuseCellRef]
    let onTap: (String) -> Void

    var body: some View {
        if !sources.isEmpty {
            HStack(spacing: 8) {
                Text("GROUNDED IN")
                    .font(Theme.Typeface.badge)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                ForEach(sources) { MuseCitePill(cell: $0, onTap: onTap) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

#Preview {
    MuseSourcesRow(sources: [MuseCellRef(target: "competitor-1", label: "Competitors"),
                             MuseCellRef(target: "gap-1", label: "Gap 01")], onTap: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/MuseSourcesRow.swift && git commit -m "feat(ios): M4 MuseSourcesRow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: MuseProseText (runs → attributed, inline citations, cursor)

**Files:** Create `Muse/MuseProseText.swift`

**Interfaces:**
- Consumes: `parseMuseRuns(_:)`, `MuseRun` (Task 1).
- Produces: `MuseProseText(raw:showCursor:onCite:)` — `onCite: (String) -> Void` receives the target string.

- [ ] **Step 1: Write `MuseProseText.swift`**

```swift
import SwiftUI

/// Renders an answer string: sans prose, **bold** runs, and [[target|Label]]
/// inline citations as tappable mono-amber tokens (routed via a muse:// link
/// intercepted here). Stream-safe. Appends a blinking cursor while streaming.
struct MuseProseText: View {
    let raw: String
    var showCursor: Bool = false
    let onCite: (String) -> Void

    var body: some View {
        Text(attributed)
            .tint(Theme.Stealth.amber)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .environment(\.openURL, OpenURLAction { url in
                if url.scheme == "muse" {
                    onCite(url.host ?? "")
                    return .handled
                }
                return .systemAction
            })
    }

    private var attributed: AttributedString {
        var result = AttributedString("")
        for run in parseMuseRuns(raw) {
            switch run {
            case .text(let s):
                var a = AttributedString(s)
                a.font = Theme.Typeface.body
                a.foregroundColor = Theme.Stealth.text
                result += a
            case .bold(let s):
                var a = AttributedString(s)
                a.font = Theme.Typeface.bodyEmphasized
                a.foregroundColor = Theme.Stealth.text
                result += a
            case .cite(let target, let label):
                var a = AttributedString(label)
                a.font = Theme.Typeface.caption            // mono
                a.foregroundColor = Theme.Stealth.amber
                a.link = URL(string: "muse://\(target)")
                result += a
            }
        }
        if showCursor {
            var c = AttributedString(" ▏")
            c.foregroundColor = Theme.Stealth.textSecondary
            result += c
        }
        return result
    }
}

#Preview {
    MuseProseText(raw: "Whoop [[competitor-2|Whoop]] locks you into **hardware** and barely coaches your workouts.", onCite: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/MuseProseText.swift && git commit -m "feat(ios): M4 MuseProseText (bold + inline citation runs + cursor)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: MuseActionRow + MuseFollowupChips

**Files:** Create `Muse/MuseActionRow.swift`, `Muse/MuseFollowupChips.swift`

**Interfaces:**
- Consumes: `MuseFeedbackValue` (Task 1).
- Produces: `MuseActionRow(feedback:onCopy:onRegenerate:onCiteMarkdown:onFeedback:)`, `MuseFollowupChips(questions:onTap:)`.

- [ ] **Step 1: `MuseActionRow.swift`** (amber-only thumbs — active = amber for both, icon distinguishes valence)

```swift
import SwiftUI

/// Below a Muse answer: mono action buttons (left) + thumbs feedback (right).
/// Amber-only: an active thumb (up OR down) colors amber; icon carries valence.
struct MuseActionRow: View {
    let feedback: MuseFeedbackValue
    let onCopy: () -> Void
    let onRegenerate: () -> Void
    let onCiteMarkdown: () -> Void
    let onFeedback: (MuseFeedbackValue) -> Void

    var body: some View {
        HStack {
            HStack(spacing: 14) {
                action("COPY", onCopy)
                action("REGENERATE", onRegenerate)
                action("CITE AS MARKDOWN", onCiteMarkdown)
            }
            Spacer()
            HStack(spacing: 12) {
                thumb("hand.thumbsup", active: feedback == .up) { onFeedback(feedback == .up ? .none : .up) }
                thumb("hand.thumbsdown", active: feedback == .down) { onFeedback(feedback == .down ? .none : .down) }
            }
        }
    }

    private func action(_ title: String, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(title).font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
        }
        .buttonStyle(.plain)
    }

    private func thumb(_ symbol: String, active: Bool, _ tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Image(systemName: active ? "\(symbol).fill" : symbol)
                .font(.system(size: 15))
                .foregroundStyle(active ? Theme.Stealth.amber : Theme.Stealth.textSecondary)
                .frame(width: 30, height: 30)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(symbol.contains("up") ? "Helpful" : "Not helpful")
    }
}

#Preview {
    MuseActionRow(feedback: .up, onCopy: {}, onRegenerate: {}, onCiteMarkdown: {}, onFeedback: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 2: `MuseFollowupChips.swift`** (vertical hairline-bordered list, 3 rows)

```swift
import SwiftUI

/// Three follow-up questions as a vertical list with hairline separators. Each
/// row is a question + a right arrow; tap fires the question.
struct MuseFollowupChips: View {
    let questions: [String]
    let onTap: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            Divider().overlay(Theme.Stealth.textSecondary.opacity(0.15))
            ForEach(questions, id: \.self) { q in
                Button { onTap(q) } label: {
                    HStack {
                        Text(q).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.text)
                        Spacer()
                        Image(systemName: "arrow.right").font(.system(size: 13)).foregroundStyle(Theme.Stealth.amber)
                    }
                    .padding(.vertical, 12)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                Divider().overlay(Theme.Stealth.textSecondary.opacity(0.15))
            }
        }
    }
}

#Preview {
    MuseFollowupChips(questions: ["Where's the opening?", "How hard is it to enter?", "What would you build first?"], onTap: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 3: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 4: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/MuseActionRow.swift PlinthsApp/PlinthsApp/Muse/MuseFollowupChips.swift && git commit -m "feat(ios): M4 Muse action row (amber-only thumbs) + follow-up chips

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: MuseComposer

**Files:** Create `Muse/MuseComposer.swift`

**Interfaces:**
- Produces: `MuseComposer(placeholder:onSubmit:)` — `onSubmit: (String) -> Void`.

- [ ] **Step 1: Write `MuseComposer.swift`** (mirrors the `IdeaInputBar` idiom; emits the text and clears)

```swift
import SwiftUI

/// The docked Muse composer — a recessed field + amber send, styled like the
/// workspace IdeaInputBar. Emits the trimmed text and clears on submit.
struct MuseComposer: View {
    var placeholder: String = "Ask a follow-up…"
    let onSubmit: (String) -> Void

    @State private var draft = ""
    @FocusState private var focused: Bool

    private var canSubmit: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            TextField(placeholder, text: $draft, axis: .vertical)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.text)
                .tint(Theme.Stealth.amber)
                .lineLimit(1...4)
                .focused($focused)
                .submitLabel(.go)
                .onSubmit(submit)
            Button(action: submit) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.Stealth.skyTop)
                    .frame(width: 36, height: 36)
                    .background(Theme.Stealth.amber.opacity(canSubmit ? 1 : 0.4))
                    .clipShape(.circle)
            }
            .disabled(!canSubmit)
            .accessibilityLabel("Send")
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(Theme.Stealth.skyMid.opacity(0.55))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(Theme.Stealth.amber.opacity(0.14), lineWidth: 1))
        )
    }

    private func submit() {
        guard canSubmit else { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        draft = ""; focused = false
        onSubmit(text)
    }
}

#Preview {
    MuseComposer(onSubmit: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/MuseComposer.swift && git commit -m "feat(ios): M4 MuseComposer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: MuseTurnView (document pair + streaming)

**Files:** Create `Muse/MuseTurnView.swift`

**Interfaces:**
- Consumes: `MuseTurn`, `MuseFeedbackValue` (Task 1); `MuseSourcesRow` (T5), `MuseProseText` (T6), `MuseActionRow`+`MuseFollowupChips` (T7).
- Produces: `MuseTurnView(turn:isLast:animate:onCite:onFollowup:onFeedback:onCopy:onRegenerate:onCiteMarkdown:)`. `animate` = stream this turn's answer char-by-char (true only for the freshly-appended last turn).

- [ ] **Step 1: Write `MuseTurnView.swift`** (owns the per-turn streaming state; honors Reduce Motion)

```swift
import SwiftUI

/// One document-pair turn: the user's query as a serif heading with a hairline
/// rule, then the answer block (sources row, streaming prose, action row,
/// follow-up chips).
struct MuseTurnView: View {
    let turn: MuseTurn
    let isLast: Bool
    let animate: Bool
    let onCite: (String) -> Void
    let onFollowup: (String) -> Void
    let onFeedback: (MuseFeedbackValue) -> Void
    let onCopy: () -> Void
    let onRegenerate: () -> Void
    let onCiteMarkdown: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = ""            // streamed prefix
    @State private var streaming = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Query heading + hairline rule
            VStack(alignment: .leading, spacing: 8) {
                Text(turn.query)
                    .font(Theme.Typeface.title)
                    .foregroundStyle(Theme.Stealth.text)
                    .fixedSize(horizontal: false, vertical: true)
                Rectangle().fill(Theme.Stealth.textSecondary.opacity(0.2)).frame(height: 1)
            }
            // Answer block
            MuseSourcesRow(sources: turn.sources, onTap: onCite)
            MuseProseText(raw: streaming ? shown : turn.answerRaw, showCursor: streaming, onCite: onCite)
            MuseActionRow(feedback: turn.feedback, onCopy: onCopy, onRegenerate: onRegenerate,
                          onCiteMarkdown: onCiteMarkdown, onFeedback: onFeedback)
            if isLast { MuseFollowupChips(questions: turn.followups, onTap: onFollowup) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: turn.id) { await streamIfNeeded() }
    }

    private func streamIfNeeded() async {
        guard animate, !reduceMotion else { shown = turn.answerRaw; streaming = false; return }
        streaming = true; shown = ""
        let chars = Array(turn.answerRaw)
        var i = 0
        while i < chars.count {
            shown.append(chars[i]); i += 1
            // Settle at sentence boundaries, unless inside an unterminated [[…
            let insideCite = shown.hasSuffix("[") || (shown.contains("[[") && !shown.hasSuffix("]]") && lastOpenIsCite(shown))
            let isBoundary = ".?!".contains(chars[i - 1]) && !insideCite
            let ns: UInt64 = isBoundary ? 240_000_000 : 12_000_000
            try? await Task.sleep(nanoseconds: ns)
            if Task.isCancelled { break }
        }
        shown = turn.answerRaw; streaming = false
    }

    // True if the most recent unmatched "[[" has no closing "]]" yet.
    private func lastOpenIsCite(_ s: String) -> Bool {
        guard let open = s.range(of: "[[", options: .backwards) else { return false }
        return s.range(of: "]]", options: .backwards).map { $0.lowerBound < open.lowerBound } ?? true
    }
}

#Preview {
    MuseTurnView(
        turn: MuseTurn(id: "t1", query: "Who's the biggest threat?",
                       answerRaw: "The threats are [[competitor-1|Future]] and [[competitor-2|Whoop]] — both chase the **expensive end**.",
                       sources: [MuseCellRef(target: "competitor-1", label: "Competitors")],
                       followups: ["Where's the opening?", "How hard is it to enter?", "What would you build first?"]),
        isLast: true, animate: false, onCite: { _ in }, onFollowup: { _ in }, onFeedback: { _ in },
        onCopy: {}, onRegenerate: {}, onCiteMarkdown: {})
    .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/MuseTurnView.swift && git commit -m "feat(ios): M4 MuseTurnView (document pair + char-by-char streaming)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: MuseView (thread + composer + ask flow)

**Files:** Create `Muse/MuseView.swift`

**Interfaces:**
- Consumes: `MuseStore` (T3), `MockMuse` (T2), `MuseTurn` (T1), `MuseEmptyLine` (T4), `MuseComposer` (T8), `MuseTurnView` (T9), `memoMarkdown`-style not needed here.
- Produces: `MuseView(reportKey:onCite:onToggleToReport:onBack:)` — `onCite: (String) -> Void` (target), `onToggleToReport: () -> Void`, `onBack: () -> Void`.

- [ ] **Step 1: Write `MuseView.swift`** (top bar with back + ▬▬ toggle; scroll of turns; docked composer; ask via MockMuse + store)

> **Note:** `UIPasteboard` (used by COPY / CITE AS MARKDOWN) is UIKit — the file needs `import UIKit` in addition to `import SwiftUI`.

```swift
import SwiftUI
import UIKit

/// The Muse conversation face: a scroll of document-pair turns over a docked
/// composer. Asking resolves a canned turn (MockMuse) and appends it to the store.
struct MuseView: View {
    let reportKey: String
    let onCite: (String) -> Void
    let onToggleToReport: () -> Void
    let onBack: () -> Void

    @Environment(MuseStore.self) private var store
    @State private var lastTurnID: String?     // the turn to animate (freshly appended)

    private var turns: [MuseTurn] { store.thread(for: reportKey) }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 28) {
                        if turns.isEmpty { MuseEmptyLine() }
                        ForEach(turns) { turn in
                            MuseTurnView(
                                turn: turn, isLast: turn.id == turns.last?.id,
                                animate: turn.id == lastTurnID,
                                onCite: onCite,
                                onFollowup: { ask(chip: $0) },
                                onFeedback: { store.setFeedback($0, turnID: turn.id, reportKey: reportKey) },
                                onCopy: { UIPasteboard.general.string = turn.answerRaw },
                                onRegenerate: { lastTurnID = nil; DispatchQueue.main.async { lastTurnID = turn.id } },
                                onCiteMarkdown: { UIPasteboard.general.string = "> \(turn.answerRaw)\n\n— Muse, grounded in this report" })
                            .id(turn.id)
                        }
                    }
                    .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 24)
                }
                .onChange(of: turns.count) {
                    if let last = turns.last?.id { withAnimation { proxy.scrollTo(last, anchor: .bottom) } }
                }
            }
            MuseComposer { ask(free: $0) }
                .padding(.horizontal, 20).padding(.bottom, 12)
        }
        .background(Theme.Stealth.skyTop.ignoresSafeArea())
    }

    private var topBar: some View {
        HStack {
            Button(action: onBack) {
                Image(systemName: "chevron.left").font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary).frame(width: 44, height: 44).contentShape(.rect)
            }
            .accessibilityLabel("Back")
            Spacer()
            Button(action: onToggleToReport) { SaturationToggleMark().frame(width: 44, height: 44).contentShape(.rect) }
                .accessibilityLabel("Show report")
        }
        .padding(.horizontal, 8)
    }

    private func ask(free query: String) {
        let turn = MockMuse.canonicalTurn(for: reportKey, query: query)
        store.append(turn, for: reportKey); lastTurnID = turn.id
    }
    private func ask(chip: String) {
        let turn = MockMuse.turn(forChip: chip, in: reportKey)
        store.append(turn, for: reportKey); lastTurnID = turn.id
    }
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Screenshot the Muse face.** Temporarily add a preview harness OR flag-flip: in `PlinthsAppApp.swift` swap the `WindowGroup` body to `MuseView(reportKey: "digitalFitness", onCite: { _ in }, onToggleToReport: {}, onBack: {}).environment(MuseStore()).preferredColorScheme(.dark)`. Build, screenshot `/tmp/m4-muse-empty.png` (expect the `MUSE · ready · grounded in this report` line + composer). **Revert `PlinthsAppApp.swift`.** (Asking requires a tap, not scriptable — the populated thread is screenshotted in Task 13's flow.)
- [ ] **Step 4: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/MuseView.swift && git commit -m "feat(ios): M4 MuseView (thread scroll + composer + ask flow)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: MemoView surgery (cell ids, scroll+pulse, composer, toggle, banner)

**Files:** Create `Muse/BackToChatBanner.swift`; Modify `Report/MemoView.swift`

**Interfaces:**
- Consumes: `MuseCitationTarget` (T1), `MuseComposer` (T8), `SaturationToggleMark` (T4).
- Produces: `BackToChatBanner(onBack:)`; `MemoView(memo:date:highlightTarget:hasThread:onBack:onAsk:onToggleToMuse:onBannerBack:)`.

- [ ] **Step 1: Write `BackToChatBanner.swift`**

```swift
import SwiftUI

/// Sticky banner shown at the top of the report only when the user arrived via a
/// citation. Returns to the conversation.
struct BackToChatBanner: View {
    let onBack: () -> Void
    var body: some View {
        HStack {
            Text("FROM YOUR CONVERSATION").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
            Spacer()
            Button(action: onBack) {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.left").font(.system(size: 12))
                    Text("BACK TO CHAT").font(Theme.Typeface.badge)
                }.foregroundStyle(Theme.Stealth.amber)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20).padding(.vertical, 10)
        .background(Theme.Stealth.skyMid)
    }
}

#Preview {
    BackToChatBanner(onBack: {}).background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Rewrite `MemoView.swift`** — add the params, `ScrollViewReader`, cell `.id`s + pulse, the toggle glyph, the docked composer, and the banner. Replace the whole struct with:

```swift
import SwiftUI

/// The full market-memo report. In M4 it is one face of the report surface:
/// it hosts a docked "Ask about this report…" composer, a toggle glyph to the
/// Muse face, and citation scroll-targets that pulse when arrived at.
struct MemoView: View {
    let memo: MarketMemo
    let date: Date
    let highlightTarget: MuseCitationTarget?     // set on citation arrival
    let hasThread: Bool                          // show the chat-bubble toggle
    let onBack: () -> Void
    let onAsk: (String) -> Void                  // free-typed question → open Muse
    let onToggleToMuse: () -> Void
    let onBannerBack: () -> Void

    @State private var pulseID: String?

    var body: some View {
        VStack(spacing: 0) {
            topBar
            if highlightTarget != nil { BackToChatBanner(onBack: onBannerBack) }
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        identity
                        bands
                        divider
                        section("01", "Market Size", "How big is this market, and is it growing?") { marketSize }
                        divider
                        section("02", "Who Else Is Doing This", "Who's already out there, and where are they weak?") { competitors }
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
                    .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 24)
                }
                .onAppear { routeHighlight(proxy) }
                .onChange(of: highlightTarget) { routeHighlight(proxy) }
            }
            MuseComposer(placeholder: "Ask about this report…") { onAsk($0) }
                .padding(.horizontal, 20).padding(.bottom, 12)
        }
        .background(Theme.Stealth.skyTop.ignoresSafeArea())
    }

    private func routeHighlight(_ proxy: ScrollViewProxy) {
        guard let id = highlightTarget?.cellID else { return }
        withAnimation { proxy.scrollTo(id, anchor: .center) }
        pulseID = id
        Task { try? await Task.sleep(nanoseconds: 1_600_000_000); pulseID = nil }
    }

    private func pulse(_ id: String) -> some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Theme.Stealth.amber.opacity(pulseID == id ? 0.9 : 0), lineWidth: 2)
            .animation(.easeOut(duration: 1.6), value: pulseID)
    }

    private var topBar: some View {
        HStack {
            Button(action: onBack) {
                Image(systemName: "chevron.left").font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary).frame(width: 44, height: 44).contentShape(.rect)
            }
            .accessibilityLabel("Back")
            Spacer()
            if hasThread {
                Button(action: onToggleToMuse) {
                    Image(systemName: "message").font(.system(size: 17, weight: .medium))
                        .foregroundStyle(Theme.Stealth.textSecondary).frame(width: 44, height: 44).contentShape(.rect)
                }
                .accessibilityLabel("Show conversation")
            }
            ShareLink(item: memoMarkdown(memo)) {
                Image(systemName: "square.and.arrow.up").font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary).frame(width: 44, height: 44).contentShape(.rect)
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
            Text(memo.oneliner).font(Theme.Typeface.title).foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 4) {
                Text("THE IDEA").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
                Text(memo.idea).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var bands: some View {
        VStack(spacing: 12) { ForEach(memo.bands) { BandCard(band: $0) } }
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
            ForEach(Array(sortedCompetitors.enumerated()), id: \.element.id) { i, c in
                CompetitorCard(competitor: c)
                    .id("competitor-\(i + 1)")
                    .overlay(pulse("competitor-\(i + 1)"))
            }
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
                    .id("gap-\(i + 1)")
                    .overlay(pulse("gap-\(i + 1)"))
            }
        }
    }

    private var entryCost: some View {
        VStack(alignment: .leading, spacing: 16) { ForEach(memo.entryCost) { EntryCostRow(factor: $0) } }
    }

    private var roadmap: some View {
        VStack(alignment: .leading, spacing: 20) {
            ForEach(Array(memo.roadmap.enumerated()), id: \.element.id) { i, phase in
                RoadmapRow(phase: phase)
                    .id("roadmap-\(i + 1)")
                    .overlay(pulse("roadmap-\(i + 1)"))
            }
        }
    }

    private var divider: some View {
        Rectangle().fill(Theme.Stealth.textSecondary.opacity(0.15)).frame(height: 1)
    }

    private func section<Content: View>(_ num: String, _ name: String, _ q: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) { SectionHead(num: num, name: name, question: q); content() }
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var sortedCompetitors: [MemoCompetitor] {
        let rank: [CompetitorTier: Int] = [.dominant: 0, .strong: 1, .moderate: 2, .niche: 3]
        return memo.competitors.enumerated().sorted { a, b in
            let ra = rank[a.element.tier] ?? 9, rb = rank[b.element.tier] ?? 9
            return ra == rb ? a.offset < b.offset : ra < rb
        }.map(\.element)
    }

    private var briefId: String {
        let n = memo.idea.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF } % 10000
        let year = Calendar.current.component(.year, from: date)
        return "PLN-\(year)-" + String(format: "%04d", n)
    }

    private var dateStr: String { date.formatted(.dateTime.month(.abbreviated).day().year()) }
}

#Preview {
    MemoView(memo: MockMemo.digitalFitness, date: .now, highlightTarget: nil, hasThread: false,
             onBack: {}, onAsk: { _ in }, onToggleToMuse: {}, onBannerBack: {})
        .preferredColorScheme(.dark)
}
```

- [ ] **Step 3: Build.** Expected: `** BUILD SUCCEEDED **`. (The M3 `#Preview` signature changed; the new one above compiles.)
- [ ] **Step 4: Screenshot.** Flag-flip `PlinthsAppApp.swift` `WindowGroup` body to `MemoView(memo: MockMemo.digitalFitness, date: .now, highlightTarget: .gap(1), hasThread: true, onBack: {}, onAsk: { _ in }, onToggleToMuse: {}, onBannerBack: {}).preferredColorScheme(.dark)`. Build, screenshot `/tmp/m4-report-cited.png` — expect the back-to-chat banner at top, the chat-bubble + share glyphs, the docked composer, and the report scrolled toward Gap 01 with an amber ring. **Revert `PlinthsAppApp.swift`.**
- [ ] **Step 5: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/BackToChatBanner.swift PlinthsApp/PlinthsApp/Report/MemoView.swift && git commit -m "feat(ios): M4 MemoView as report face — composer, toggle, cell scroll+pulse, banner

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: ReportSurface (two-face container)

**Files:** Create `Muse/ReportSurface.swift`

**Interfaces:**
- Consumes: `MemoView` (T11), `MuseView` (T10), `MuseStore` (T3), `MuseCitationTarget`+`museTarget` (T1), `ReportFace` (T1).
- Produces: `ReportSurface(memo:date:reportKey:initialFace:onBack:)`.

- [ ] **Step 1: Write `ReportSurface.swift`**

```swift
import SwiftUI

/// One report's two faces — the memo report and its Muse conversation — swapped
/// by a destination-toggle glyph. Owns the citation-highlight + pending-ask state.
struct ReportSurface: View {
    let memo: MarketMemo
    let date: Date
    let reportKey: String
    let initialFace: ReportFace
    let onBack: () -> Void

    @Environment(MuseStore.self) private var store
    @State private var face: ReportFace
    @State private var highlight: MuseCitationTarget?
    @State private var pendingAsk: String?     // a report-composer question to run on the Muse face

    init(memo: MarketMemo, date: Date, reportKey: String, initialFace: ReportFace, onBack: @escaping () -> Void) {
        self.memo = memo; self.date = date; self.reportKey = reportKey
        self.initialFace = initialFace; self.onBack = onBack
        _face = State(initialValue: initialFace)
    }

    var body: some View {
        switch face {
        case .report:
            MemoView(memo: memo, date: date, highlightTarget: highlight,
                     hasThread: store.hasThread(for: reportKey), onBack: onBack,
                     onAsk: { openMuseAsking($0) },
                     onToggleToMuse: { highlight = nil; face = .muse },
                     onBannerBack: { highlight = nil; face = .muse })
        case .muse:
            MuseView(reportKey: reportKey,
                     pendingAsk: pendingAsk,
                     onConsumePendingAsk: { pendingAsk = nil },
                     onCite: { routeCite($0) },
                     onToggleToReport: { highlight = nil; face = .report },
                     onBack: onBack)
        }
    }

    // A free-typed question from the report composer: stash it and flip to Muse,
    // which runs it once on appear (so it streams). We do NOT append here — that
    // keeps all append+animate logic inside MuseView, so a later toggle back to
    // the Muse face renders the thread statically instead of re-animating.
    private func openMuseAsking(_ query: String) {
        pendingAsk = query; highlight = nil; face = .muse
    }

    // A citation tap in Muse: flip to the report, highlight the cell.
    private func routeCite(_ target: String) {
        guard let t = museTarget(target) else { return }
        highlight = t; face = .report
    }
}
```

- [ ] **Step 2: Adjust `MuseView` for the pending-ask + scroll-on-appear.** In `MuseView.swift`:
  (a) add two params right after `let reportKey: String` (defaults keep Task 10's other callers valid):
  ```swift
      var pendingAsk: String? = nil
      var onConsumePendingAsk: () -> Void = {}
  ```
  (b) in the `ScrollViewReader` (alongside the existing `.onChange(of: turns.count)`), add an `.onAppear` that scrolls to the latest turn and consumes a pending ask **exactly once**:
  ```swift
      .onAppear {
          if let last = turns.last?.id { proxy.scrollTo(last, anchor: .bottom) }
          if let q = pendingAsk { ask(free: q); onConsumePendingAsk() }
      }
  ```
  **Do NOT set `lastTurnID` from `onAppear`.** `lastTurnID` must be driven only by `ask(...)`, so an existing thread renders statically on (re)mount and only a freshly-asked turn streams. This is what prevents the last turn from re-streaming every time the user toggles back to the Muse face.

- [ ] **Step 3: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 4: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/ReportSurface.swift PlinthsApp/PlinthsApp/Muse/MuseView.swift && git commit -m "feat(ios): M4 ReportSurface two-face container + Muse arrival animation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Workspace integration + store injection

**Files:** Modify `Models/WorkspaceScreen.swift`, `Models/Memo/MockMemo.swift`, `Workspace/WorkspaceView.swift`, `PlinthsAppApp.swift`

**Interfaces:**
- Consumes: `ReportSurface` (T12), `MuseStore` (T3), `ReportFace` (T1).
- Produces: `WorkspaceScreen.report(MarketMemo, Date, String)`; `MockMemo.reportKey(for:)`, `MockMemo.digitalFitnessKey`.

- [ ] **Step 1: `WorkspaceScreen.swift`** — add the reportKey to the case:
```swift
enum WorkspaceScreen {
    case home
    case loading
    case report(MarketMemo, Date, String)   // memo, created date, reportKey
}
```

- [ ] **Step 2: `MockMemo.swift`** — add, inside `enum MockMemo`, the key resolver + submit constant (place next to `memo(for:)`):
```swift
    /// The canonical reportKey for the submit-complete report.
    static let digitalFitnessKey = "digitalFitness"

    /// Thread/content key for a history row (parallels `memo(for:)`).
    static func reportKey(for report: MockReport) -> String {
        switch report.id {
        case "mock-h1", "mock-h2": "crowded"
        case "mock-h3":            "open"
        default:                   "digitalFitness"
        }
    }
```

- [ ] **Step 3: `PlinthsAppApp.swift`** — own + inject the store. Replace the struct body:
```swift
import SwiftUI

@main
struct PlinthsAppApp: App {
    @State private var isSignedIn = false
    @State private var museStore = MuseStore()

    init() { FontRegistrar.registerBundledFonts() }

    var body: some Scene {
        WindowGroup {
            ZStack {
                if isSignedIn {
                    WorkspaceView().transition(.opacity)
                } else {
                    SplashSignInView(onSignIn: { isSignedIn = true }).transition(.opacity)
                }
            }
            .environment(museStore)
            .animation(.easeInOut(duration: 0.35), value: isSignedIn)
        }
    }
}
```

- [ ] **Step 4: `WorkspaceView.swift`** — read the store, route `.report` to `ReportSurface`, thread `reportKey` + initial face. Replace the struct:
```swift
import SwiftUI

/// The signed-in workspace root: idea-input home, pipeline loading, and — via
/// `ReportSurface` — the report⇄muse surface. History is a sheet (tap ☰).
struct WorkspaceView: View {
    @State private var screen: WorkspaceScreen = .home
    @State private var draft = ""
    @State private var isHistoryOpen = false
    @State private var reportOrigin: ReportOrigin = .home
    @Environment(MuseStore.self) private var store

    private enum ReportOrigin { case home, history }

    var body: some View {
        ZStack {
            DesertSkyBackground().ignoresSafeArea()
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
                        onComplete: { showReport(MockMemo.digitalFitness, date: .now, key: MockMemo.digitalFitnessKey, origin: .home) })
                }
            case .report(let memo, let date, let key):
                ReportSurface(memo: memo, date: date, reportKey: key,
                              initialFace: store.hasThread(for: key) ? .muse : .report,
                              onBack: backFromReport)
            }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $isHistoryOpen) {
            HistoryDrawer(reports: MockWorkspace.history) { report in openReport(for: report) }
                .presentationBackground(Theme.Stealth.skyTop)
                .preferredColorScheme(.dark)
        }
    }

    private func submit() {
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        screen = .loading
    }
    private func showReport(_ memo: MarketMemo, date: Date, key: String, origin: ReportOrigin) {
        reportOrigin = origin
        screen = .report(memo, date, key)
    }
    private func openReport(for report: MockReport) {
        isHistoryOpen = false
        showReport(MockMemo.memo(for: report), date: report.createdAt,
                   key: MockMemo.reportKey(for: report), origin: .history)
    }
    private func backFromReport() {
        screen = .home
        if reportOrigin == .history { isHistoryOpen = true }
    }
    private func startNew() { draft = ""; screen = .home; isHistoryOpen = false }
}
```

- [ ] **Step 5: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 6: Screenshot the real flow.** Temporarily set `isSignedIn = true` in `PlinthsAppApp.swift`. Build, launch. Because taps aren't scriptable, ALSO temporarily set `WorkspaceView`'s default `screen = .report(MockMemo.digitalFitness, .now, "digitalFitness")` to land on the report face; screenshot `/tmp/m4-flow-report.png` (report with docked "Ask about this report…" composer + share glyph, no chat-bubble yet since no thread). Then temporarily seed a thread for the screenshot: set the default to open Muse by changing `initialFace` computation is store-driven — simplest, screenshot the empty Muse via Task 10's harness already covered. **Revert both** `isSignedIn = false` and `screen = .home` before committing.
- [ ] **Step 7: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/WorkspaceScreen.swift PlinthsApp/PlinthsApp/Models/Memo/MockMemo.swift PlinthsApp/PlinthsApp/PlinthsAppApp.swift PlinthsApp/PlinthsApp/Workspace/WorkspaceView.swift && git commit -m "feat(ios): M4 wire ReportSurface + MuseStore into the workspace

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: SETUP doc + final verification

**Files:** Modify `PlinthsApp/SETUP.md`

- [ ] **Step 1: Update the project-structure list** — after the `Report/` block add:
```text
  Muse/
    ReportSurface.swift      # two-face container (report ⇄ muse)
    MuseView.swift           # conversation face (thread + composer)
    MuseTurnView.swift       # one document-pair turn (streams)
    MuseProseText.swift      # bold + inline citation runs + cursor
    MuseSourcesRow.swift     # GROUNDED IN + citation pills
    MuseCitePill.swift       # a source pill (routes to a report cell)
    MuseActionRow.swift      # COPY · REGENERATE · CITE + amber thumbs
    MuseFollowupChips.swift  # 3 vertical follow-up questions
    MuseComposer.swift       # docked ask field
    MuseEmptyLine.swift      # empty-state line
    SaturationToggleMark.swift # the ▬▬ destination glyph
    BackToChatBanner.swift   # citation-arrival banner (on the report)
  Models/
    …
    Muse/
      MuseModel.swift        # runs, citation targets, turn + [[..]] parser
      MockMuse.swift         # per-report canned threads
      MuseStore.swift        # in-memory thread store (@Observable)
```

- [ ] **Step 2: Update the Status section** — change `Milestone 3 complete:` to `Milestone 4 complete:` and append:
```text
Each report now has a Muse conversation: tap into the docked "Ask about this
report…" composer (or the chat-bubble toggle) to open a full-screen thread of
document-pair Q/A turns — streaming answers with inline citation tokens and a
GROUNDED IN sources row. Tapping a citation flips back to the report, scrolls to
the cited cell and pulses it, with a FROM YOUR CONVERSATION banner. All mock
(3 per-report canned threads); the live SSE stream lands in M7.
```

- [ ] **Step 3: Build + confirm production defaults.** Run the build (expect `** BUILD SUCCEEDED **`), then:
```bash
cd /Users/wakeensito/Plinths && git grep -n "isSignedIn = true" -- 'PlinthsApp/PlinthsApp/'; git grep -nE "WorkspaceScreen = \.report|WindowGroup \{[^}]*MemoView|WindowGroup \{[^}]*MuseView" -- 'PlinthsApp/PlinthsApp/'
```
Expected: only the `SplashSignInView(onSignIn: { isSignedIn = true })` line; no flag-flip defaults or swapped `WindowGroup` bodies. Confirm `WorkspaceView.swift` has `screen: WorkspaceScreen = .home` and `PlinthsAppApp.swift` has `isSignedIn = false` and the standard `ZStack` body.

- [ ] **Step 4: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/SETUP.md && git commit -m "docs(ios): SETUP reflects the M4 Muse surface

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Two-face nav + destination-toggle glyph → `ReportSurface` (T12), `SaturationToggleMark` (T4), MemoView chat-bubble (T11) ✓
- MuseView document-pair turns, sources row, streaming prose, action row, chips, composer, empty state → T4–T10 ✓
- Citation round-trip (pill → report + scroll + pulse + banner) → `MuseProseText`/`MuseCitePill` routing (T6/T4), MemoView scroll+pulse+banner (T11), `ReportSurface.routeCite` (T12) ✓
- Per-report canned threads + reveal model → `MockMuse` (T2); in-memory store → `MuseStore` (T3) ✓
- Amber-only thumbs → `MuseActionRow` (T7) ✓
- reportKey keying (2 rows share crowded) → `MockMemo.reportKey` (T13) ✓
- Store injection at app root → `PlinthsAppApp` (T13) ✓
- Ungated / Max out / persistence+SSE deferred → not built (correct) ✓
- SETUP refresh → T14 ✓

**Placeholder scan:** No TBD/TODO. Every code step ships complete Swift; mock threads fully authored. No test target by design (M7) — verification is build + screenshot, per M1–M3.

**Type consistency:** `MuseTurn`/`MuseRun`/`MuseCellRef`/`MuseCitationTarget`/`MuseFeedbackValue`/`ReportFace` defined in T1, consumed unchanged after. `parseMuseRuns`/`museTarget` (T1) used by `MuseProseText` (T6) and `ReportSurface` (T12). `MuseStore` API (`thread(for:)`/`hasThread(for:)`/`append(_:for:)`/`setFeedback(_:turnID:reportKey:)`) defined T3, used in `MuseView` (T10), `ReportSurface` (T12), `WorkspaceView` (T13). `MockMuse.canonicalTurn(for:query:)`/`turn(forChip:in:)` (T2) used in `MuseView` (T10) and `ReportSurface` (T12). `MemoView` new signature (`highlightTarget:hasThread:onAsk:onToggleToMuse:onBannerBack:`, T11) matches its only caller `ReportSurface` (T12). `WorkspaceScreen.report(_,_,_)` (T13) matches `WorkspaceView`'s switch + `showReport` (T13). `MockMemo.reportKey(for:)`/`digitalFitnessKey` (T13) used in `WorkspaceView` (T13). Store injected via `.environment` (T13) satisfies every `@Environment(MuseStore.self)` reader (T10/T12/T13).
