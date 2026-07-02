# iOS Milestone 5 — Build Brief + three-surface navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Build Brief surface (generate → skeleton → brief) and grow M4's two-face report⇄muse nav into a three-face (report / build brief / muse) nav driven by destination glyphs in a shared docked composer.

**Architecture:** `ReportFace` gains `.brief`; `ReportSurface` becomes a three-way container. A new `WorkspaceComposer` (nav-glyph row + Muse text field) replaces `MuseComposer` on every face and relocates M4's top-bar toggle into the composer. The Build Brief surface is a small state machine (`BuildBriefStore`: idle → generating → ready) rendering a canned per-report `BuildBrief` fixture.

**Tech Stack:** SwiftUI (iOS 26.2, Swift 6.2), Observation framework, Xcode 26.3, `xcodebuild`, `xcrun simctl`.

## Global Constraints

- **Deployment target iOS 26.2 · Swift 6.2 · Xcode 26.3.** Files under `PlinthsApp/PlinthsApp/` auto-join the build (file-system-synchronized groups) — no manual target step.
- **No test target yet** (M7). The verification gate for every task is `xcodebuild … build` succeeding, plus — for view/flow tasks — a simulator screenshot reached by a temporary flag-flip reverted before commit. Established M1–M4 pattern; do NOT add a test target.
- **Amber is the only color.** Use `Theme.Stealth` tokens only (`skyTop`/`skyMid`/`amber`/`text`/`textSecondary`/`sand`). **No additions to `Theme.swift`.** Complexity is number + label (no green/red). `BUILD` tag = amber-filled; `BUY` tag = `textSecondary` mono hairline (no fill). The generate button, blocks glyph, skeleton shimmer, and nav glyphs are amber. No success/warning/danger anywhere.
- **Nav = composer destination glyphs.** Fixed order `[.report, .brief, .muse]`; render the two faces that are NOT the current one. Glyphs: `SaturationToggleMark` (report) · `Image(systemName: "square.grid.2x2")` (build brief) · `Image(systemName: "message")` (muse). Labels: `Open report` / `Open build brief` / `Open chat`. The composer is always the Muse composer — submitting from any face asks Muse.
- **Ungated in beta** — no Pro lock state; the Build Brief invite is shown to everyone. Pro upsell is M6.
- **Build Brief section order** (verbatim from the web): conclusion strip (complexity + effort, or low-tech card) → capabilities (build/buy) → foundation (vendor-neutral) → MVP scope → technical risks → fixed Foundations & Limits copy → action row (copy-as-markdown + "Generated {date}").
- **Content verbatim** from the web fixture for the canonical brief; preserve punctuation. Author `crowded`/`open` in the same voice.
- **SourceKit cross-file "Cannot find X" / "No such module 'UIKit'" diagnostics are noise** — `xcodebuild` is authoritative.
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
  xcrun simctl io booted screenshot /tmp/m5-<name>.png
  ```
  Taps are NOT scriptable — reach a state via a temporary `@State`/`isSignedIn` default, screenshot, then REVERT before commit.
- **Commit cadence:** one commit per task; end every message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Branch: `feat/ios-m5-build-brief` (already created off `main`, which now has M4).

---

## File Structure

**Create — models (`PlinthsApp/PlinthsApp/Models/BuildBrief/`):**
- `BuildBriefModel.swift` — `BuildBrief` + nested types + `BuildBriefCopy` constants.
- `MockBuildBrief.swift` — 3 per-report fixtures + `lowTechExample` + `brief(for:)`.
- `BuildBriefStore.swift` — `@Observable` generate-state store keyed by reportKey.

**Create — views:**
- `Muse/NavGlyphRow.swift` — the two-glyph destination row.
- `Muse/WorkspaceComposer.swift` — nav row + Muse field (replaces `MuseComposer`).
- `BuildBrief/BuildBriefView.swift` — the surface (state machine + composer).
- `BuildBrief/BuildBriefInvite.swift` — idle "Generate" CTA.
- `BuildBrief/BuildBriefSkeleton.swift` — generating placeholder.
- `BuildBrief/BuildBriefBody.swift` — the ready brief render.
- `BuildBrief/BuildBriefLowTechCard.swift` — the `isTechDominant:false` card.
- `BuildBrief/CapabilityRow.swift` — one capability + `BuildOrBuyTag`.
- `BuildBrief/FoundationRow.swift` — one foundation primitive.
- `BuildBrief/BuildBriefMarkdown.swift` — `buildBriefMarkdown(_:) -> String`.

**Modify:**
- `Models/Muse/MuseModel.swift` — `ReportFace` gains `.brief`; make it `Hashable`.
- `Muse/ReportSurface.swift` — three-way container; `navigate(to:)`.
- `Report/MemoView.swift` — drop `hasThread`/`onToggleToMuse`; add `onNavigate`; use `WorkspaceComposer`; banner → `onNavigate(.muse)`.
- `Muse/MuseView.swift` — drop `onToggleToReport`; add `onNavigate`; use `WorkspaceComposer`.
- `Muse/MuseComposer.swift` — **delete** (superseded by `WorkspaceComposer`).
- `PlinthsAppApp.swift` — own + inject `BuildBriefStore`.
- `PlinthsApp/SETUP.md` — M5 status.

---

## Task 1: Build Brief data model

**Files:** Create `PlinthsApp/PlinthsApp/Models/BuildBrief/BuildBriefModel.swift`

**Interfaces:**
- Produces: `BuildBrief`, `BuildBriefCapability`, `BuildBriefPrimitive`, `BuildBriefRisk`, `BuildBriefEffort`, `BuildOrBuy`, `BuildBriefCopy`.

- [ ] **Step 1: Write `BuildBriefModel.swift`**

```swift
import Foundation

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

/// A founder-altitude build deliverable derived from a report (mirrors the web
/// `BuildBrief`). Vendor-neutral by design.
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

/// Fixed copy shown on every brief (not model output).
enum BuildBriefCopy {
    static let principles: [String] = [
        "Least privilege — grant the minimum access that works.",
        "Prefer managed services over running your own.",
        "Pick one cloud and stay in it early.",
        "Secure defaults — encryption and backups from day one.",
    ]
    static let limit =
        "AI isn’t always right. Treat this as a starting point, not a spec — " +
        "sanity-check the stack against your own constraints before you commit."
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/BuildBrief/BuildBriefModel.swift && git commit -m "feat(ios): M5 Build Brief data model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Mock briefs (3 fixtures + low-tech)

**Files:** Create `PlinthsApp/PlinthsApp/Models/BuildBrief/MockBuildBrief.swift`

**Interfaces:**
- Consumes: Task 1 types.
- Produces: `MockBuildBrief.brief(for reportKey: String) -> BuildBrief`, `MockBuildBrief.lowTechExample: BuildBrief`.

- [ ] **Step 1: Write `MockBuildBrief.swift`** (canonical ports the web `MOCK_BUILD_BRIEF`)

```swift
import Foundation

/// Canned per-report Build Briefs (no live generation until M7). Keyed by the
/// same reportKey as MockMemo / MockMuse.
enum MockBuildBrief {

    static func brief(for reportKey: String) -> BuildBrief {
        switch reportKey {
        case "crowded": creatorEconomy
        case "open":    construction
        default:        digitalFitness
        }
    }

    // MARK: digitalFitness — verbatim port of web MOCK_BUILD_BRIEF
    static let digitalFitness = BuildBrief(
        isTechDominant: true,
        complexityScore: 58, complexityLabel: "Moderate",
        complexityDrivers: ["real-time adaptive logic", "wearable & biometric integrations", "a model that improves per user"],
        capabilities: [
            BuildBriefCapability(name: "Accounts & sign-in",
                description: "Let people create an account and sign in securely across devices.",
                buildOrBuy: .buy, recommendation: "Use a managed identity provider (Auth0, Cognito, or Clerk). Do not roll your own."),
            BuildBriefCapability(name: "Payments & subscriptions",
                description: "Charge for a monthly plan and manage upgrades, cancellations, and refunds.",
                buildOrBuy: .buy, recommendation: "Stripe handles billing, tax, and the customer portal — don’t build this."),
            BuildBriefCapability(name: "Wearable & health-data sync",
                description: "Pull heart rate, sleep, and activity from watches and phones.",
                buildOrBuy: .build, recommendation: "Thin integration layer over HealthKit / vendor APIs; the normalization is yours."),
            BuildBriefCapability(name: "Adaptive coaching engine",
                description: "Adjust each workout in real time from the person’s data and history.",
                buildOrBuy: .build, recommendation: "This is your differentiator — own it end to end."),
            BuildBriefCapability(name: "Notifications",
                description: "Nudge people to work out and celebrate progress.",
                buildOrBuy: .buy, recommendation: "A managed push service (OneSignal, or the platform APIs) is plenty."),
            BuildBriefCapability(name: "Outcome & retention analytics",
                description: "See who sticks around, who drops off, and why.",
                buildOrBuy: .buy, recommendation: "Off-the-shelf product analytics; instrument the retention loop first."),
        ],
        foundation: [
            BuildBriefPrimitive(primitive: "Object storage", why: "Store media, exports, and model artifacts cheaply.",
                cloudExamples: "S3 (AWS) / Blob Storage (Azure) / Cloud Storage (GCP)"),
            BuildBriefPrimitive(primitive: "Managed database", why: "Your source of truth for users, plans, and history.",
                cloudExamples: "RDS (AWS) / Azure SQL / Cloud SQL (GCP)"),
            BuildBriefPrimitive(primitive: "Serverless compute", why: "Run the adaptive logic without managing servers.",
                cloudExamples: "Lambda (AWS) / Functions (Azure) / Cloud Functions (GCP)"),
            BuildBriefPrimitive(primitive: "CDN", why: "Serve the app and media fast, everywhere.",
                cloudExamples: "CloudFront (AWS) / Front Door (Azure) / Cloud CDN (GCP)"),
            BuildBriefPrimitive(primitive: "Lightweight data pipeline", why: "Move wearable data in and analytics out.",
                cloudExamples: "EventBridge + Kinesis (AWS) / Event Grid (Azure) / Pub/Sub (GCP)"),
        ],
        mvpScope: "To stand up a localhost MVP: a sign-in screen, a profile, a workout that adapts from one manual input (like “I’m tired today”), and a way to log that it happened. Skip wearables, payments, and the learning model until you have proven people come back.",
        effort: BuildBriefEffort(timeframe: "8 to 14 weeks to a usable MVP", teamShape: "1 to 2 engineers, plus a part-time designer"),
        technicalRisks: [
            BuildBriefRisk(title: "Retention is the real product", description: "If people don’t come back in week 4, nothing else matters — instrument it from day one."),
            BuildBriefRisk(title: "Health data is sensitive", description: "Heart rate and sleep carry privacy obligations; handle, store, and delete it carefully."),
            BuildBriefRisk(title: "Wearable integrations drift", description: "Device APIs change and break; budget ongoing maintenance, not a one-time build."),
        ])

    // MARK: crowded — creator-economy monetization
    static let creatorEconomy = BuildBrief(
        isTechDominant: true,
        complexityScore: 66, complexityLabel: "High",
        complexityDrivers: ["money movement & payouts", "fraud and compliance", "multi-party accounting"],
        capabilities: [
            BuildBriefCapability(name: "Creator & fan accounts",
                description: "Two account types with different permissions and dashboards.",
                buildOrBuy: .buy, recommendation: "Managed identity with roles; don’t build auth."),
            BuildBriefCapability(name: "Payments, payouts & escrow",
                description: "Take money from fans, hold it, and pay creators — correctly, on time.",
                buildOrBuy: .buy, recommendation: "Stripe Connect is built for exactly this; fair payouts is your product, not the rails."),
            BuildBriefCapability(name: "Fair-payout logic",
                description: "Faster, more transparent payouts than the incumbents’ long holds.",
                buildOrBuy: .build, recommendation: "This is the wedge — own the payout timing and transparency."),
            BuildBriefCapability(name: "Fraud & chargeback handling",
                description: "Catch bad actors before they cost creators money.",
                buildOrBuy: .buy, recommendation: "Use the processor’s fraud tools first; tune, don’t build."),
        ],
        foundation: [
            BuildBriefPrimitive(primitive: "Managed database", why: "Ledger-grade record of every transaction.",
                cloudExamples: "RDS (AWS) / Azure SQL / Cloud SQL (GCP)"),
            BuildBriefPrimitive(primitive: "Queue / workflow", why: "Payout jobs must be reliable and retryable.",
                cloudExamples: "SQS + Step Functions (AWS) / Service Bus (Azure) / Cloud Tasks (GCP)"),
            BuildBriefPrimitive(primitive: "Object storage", why: "Store creator content and payout records.",
                cloudExamples: "S3 (AWS) / Blob Storage (Azure) / Cloud Storage (GCP)"),
            BuildBriefPrimitive(primitive: "Serverless compute", why: "Run payout and webhook handlers on demand.",
                cloudExamples: "Lambda (AWS) / Functions (Azure) / Cloud Functions (GCP)"),
        ],
        mvpScope: "Pick one niche and prove fair payouts: creator sign-up, a fan checkout, and a payout that lands faster and clearer than Patreon. Skip discovery, messaging, and analytics until creators trust you with their money.",
        effort: BuildBriefEffort(timeframe: "12 to 20 weeks to a trustworthy MVP", teamShape: "2 engineers with payments experience, plus a designer"),
        technicalRisks: [
            BuildBriefRisk(title: "Money movement is unforgiving", description: "A payout bug erodes trust instantly; correctness beats features here."),
            BuildBriefRisk(title: "Compliance scales with volume", description: "KYC, tax, and regional rules grow as you do — design for them early."),
            BuildBriefRisk(title: "Incumbents can copy fast", description: "Fair payouts is a wedge, not a moat; keep earning the niche’s loyalty."),
        ])

    // MARK: open — construction project management
    static let construction = BuildBrief(
        isTechDominant: true,
        complexityScore: 44, complexityLabel: "Moderate",
        complexityDrivers: ["offline-first mobile", "role-based jobsite workflows", "slow, referral-driven sales"],
        capabilities: [
            BuildBriefCapability(name: "Accounts & crews",
                description: "Owners, foremen, and crew with the right access on the jobsite.",
                buildOrBuy: .buy, recommendation: "Managed identity with simple roles."),
            BuildBriefCapability(name: "Offline-first mobile app",
                description: "Works with no signal on site, syncs when it’s back.",
                buildOrBuy: .build, recommendation: "This is the differentiator small crews actually need — own the sync."),
            BuildBriefCapability(name: "Scheduling & coordination",
                description: "Who’s where, what’s next, two-tap simple.",
                buildOrBuy: .build, recommendation: "Keep it lighter than the enterprise tools; that simplicity is the product."),
            BuildBriefCapability(name: "Notifications & reminders",
                description: "Nudge the crew about today’s plan and changes.",
                buildOrBuy: .buy, recommendation: "Platform push APIs are enough."),
        ],
        foundation: [
            BuildBriefPrimitive(primitive: "Managed database", why: "Source of truth for jobs, schedules, and crews.",
                cloudExamples: "RDS (AWS) / Azure SQL / Cloud SQL (GCP)"),
            BuildBriefPrimitive(primitive: "Sync / offline store", why: "The offline-first experience depends on solid sync.",
                cloudExamples: "AppSync (AWS) / Cosmos DB (Azure) / Firestore (GCP)"),
            BuildBriefPrimitive(primitive: "Object storage", why: "Store jobsite photos and documents.",
                cloudExamples: "S3 (AWS) / Blob Storage (Azure) / Cloud Storage (GCP)"),
            BuildBriefPrimitive(primitive: "Serverless compute", why: "Run coordination logic without ops overhead.",
                cloudExamples: "Lambda (AWS) / Functions (Azure) / Cloud Functions (GCP)"),
        ],
        mvpScope: "Win one trade: a mobile schedule a foreman can update offline, a job list, and a change that reaches the crew. Skip billing, documents, and reporting until one trade relies on it daily.",
        effort: BuildBriefEffort(timeframe: "10 to 16 weeks to a jobsite-ready MVP", teamShape: "1 to 2 engineers comfortable with mobile + sync, plus a designer"),
        technicalRisks: [
            BuildBriefRisk(title: "Offline sync is deceptively hard", description: "Conflict resolution on flaky connections is where these apps live or die."),
            BuildBriefRisk(title: "Adoption is a field problem", description: "If the foreman won’t use it in gloves, nothing else matters — design for the site."),
            BuildBriefRisk(title: "Sales is slow and offline", description: "Referral-driven; the build is easy, earning trust in a trade is the work."),
        ])

    // MARK: low-tech branch (preview only — no report idea triggers it)
    static let lowTechExample = BuildBrief(
        isTechDominant: false,
        complexityScore: 0, complexityLabel: "", complexityDrivers: [],
        capabilities: [], foundation: [], mvpScope: "",
        effort: BuildBriefEffort(timeframe: "", teamShape: ""), technicalRisks: [])
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/BuildBrief/MockBuildBrief.swift && git commit -m "feat(ios): M5 canned per-report build briefs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: BuildBriefStore

**Files:** Create `PlinthsApp/PlinthsApp/Models/BuildBrief/BuildBriefStore.swift`

**Interfaces:**
- Produces: `BuildBriefState` (`.idle`/`.generating`/`.ready`), `@Observable final class BuildBriefStore` with `state(for:)`, `startGenerating(_:)`, `markReady(_:)`.

- [ ] **Step 1: Write `BuildBriefStore.swift`**

```swift
import Foundation
import Observation

enum BuildBriefState: Equatable { case idle, generating, ready }

/// In-memory per-session generate state, keyed by reportKey. Real generation +
/// persistence land in M7.
@Observable
final class BuildBriefStore {
    private var states: [String: BuildBriefState] = [:]

    func state(for key: String) -> BuildBriefState { states[key] ?? .idle }
    func startGenerating(_ key: String) { states[key] = .generating }
    func markReady(_ key: String) { states[key] = .ready }
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/BuildBrief/BuildBriefStore.swift && git commit -m "feat(ios): M5 BuildBriefStore

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: ReportFace `.brief` + NavGlyphRow

**Files:** Modify `Models/Muse/MuseModel.swift`; Create `Muse/NavGlyphRow.swift`

**Interfaces:**
- Consumes: `SaturationToggleMark` (M4).
- Produces: `ReportFace` (now `.report`/`.brief`/`.muse`, `Hashable`); `NavGlyphRow(current:onNavigate:)`.

- [ ] **Step 1: `MuseModel.swift`** — change the `ReportFace` line:
```swift
/// One face of the report surface.
enum ReportFace: Hashable { case report, brief, muse }
```

- [ ] **Step 2: Write `NavGlyphRow.swift`**

```swift
import SwiftUI

/// The destination-glyph group for the composer: renders the two surfaces you
/// are NOT on, in fixed order. Tapping one navigates there.
struct NavGlyphRow: View {
    let current: ReportFace
    let onNavigate: (ReportFace) -> Void

    private let order: [ReportFace] = [.report, .brief, .muse]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(order.filter { $0 != current }, id: \.self) { face in
                Button { onNavigate(face) } label: {
                    glyph(face).frame(width: 34, height: 34).contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(label(face))
            }
        }
    }

    @ViewBuilder private func glyph(_ face: ReportFace) -> some View {
        switch face {
        case .report: SaturationToggleMark()
        case .brief:  Image(systemName: "square.grid.2x2").font(.system(size: 16, weight: .medium)).foregroundStyle(Theme.Stealth.amber)
        case .muse:   Image(systemName: "message").font(.system(size: 16, weight: .medium)).foregroundStyle(Theme.Stealth.amber)
        }
    }

    private func label(_ face: ReportFace) -> String {
        switch face {
        case .report: "Open report"
        case .brief:  "Open build brief"
        case .muse:   "Open chat"
        }
    }
}

#Preview {
    VStack(spacing: 12) {
        NavGlyphRow(current: .report, onNavigate: { _ in })
        NavGlyphRow(current: .brief, onNavigate: { _ in })
        NavGlyphRow(current: .muse, onNavigate: { _ in })
    }
    .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 3: Add a temporary `.brief` stub to `ReportSurface`** so its `switch face` stays exhaustive. Adding `.brief` to the enum makes M4's two-case switch (`case .report` / `case .muse`) non-exhaustive → build error. In `Muse/ReportSurface.swift`'s `body` switch, add this case (Task 11 replaces it with the real `BuildBriefView`):
```swift
        case .brief:
            EmptyView()   // wired to BuildBriefView in Task 11
```

- [ ] **Step 4: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Commit** (includes the `ReportSurface` stub)
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Models/Muse/MuseModel.swift PlinthsApp/PlinthsApp/Muse/NavGlyphRow.swift PlinthsApp/PlinthsApp/Muse/ReportSurface.swift && git commit -m "feat(ios): M5 ReportFace .brief + NavGlyphRow (report/brief/muse glyphs)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: WorkspaceComposer (replaces MuseComposer)

**Files:** Create `Muse/WorkspaceComposer.swift`

**Interfaces:**
- Consumes: `NavGlyphRow` (T4), `ReportFace` (T4).
- Produces: `WorkspaceComposer(current:onNavigate:placeholder:onSubmit:)` — `onSubmit: (String) -> Void`, `placeholder` defaults to `"Ask about this report…"`.

- [ ] **Step 1: Write `WorkspaceComposer.swift`**

```swift
import SwiftUI

/// The docked composer shared by all three faces: a leading nav-glyph row (the
/// two other surfaces) + the Muse text field + amber send. Always Muse-bound —
/// submitting asks Muse. Supersedes MuseComposer.
struct WorkspaceComposer: View {
    let current: ReportFace
    let onNavigate: (ReportFace) -> Void
    var placeholder: String = "Ask about this report…"
    let onSubmit: (String) -> Void

    @State private var draft = ""
    @FocusState private var focused: Bool
    private var canSubmit: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            NavGlyphRow(current: current, onNavigate: onNavigate)
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
    WorkspaceComposer(current: .report, onNavigate: { _ in }, onSubmit: { _ in })
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/WorkspaceComposer.swift && git commit -m "feat(ios): M5 WorkspaceComposer (nav glyphs + Muse field)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Build Brief invite + skeleton

**Files:** Create `BuildBrief/BuildBriefInvite.swift`, `BuildBrief/BuildBriefSkeleton.swift`

**Interfaces:**
- Produces: `BuildBriefInvite(onGenerate:)`, `BuildBriefSkeleton()`.

- [ ] **Step 1: `BuildBriefInvite.swift`**

```swift
import SwiftUI

/// The idle state: a calm invite to generate the brief.
struct BuildBriefInvite: View {
    let onGenerate: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "square.grid.2x2")
                .font(.system(size: 32, weight: .regular))
                .foregroundStyle(Theme.Stealth.amber)
            Text("Turn this idea into a build brief.")
                .font(Theme.Typeface.title)
                .foregroundStyle(Theme.Stealth.text)
                .multilineTextAlignment(.center)
            Text("What it would take to build this — capabilities, foundation, effort, and the risks that matter.")
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: onGenerate) {
                Text("Generate build brief")
                    .font(Theme.Typeface.label)
                    .foregroundStyle(Theme.Stealth.skyTop)
                    .padding(.horizontal, 20).padding(.vertical, 12)
                    .background(Theme.Stealth.amber)
                    .clipShape(.capsule)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Generate build brief")
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
    }
}

#Preview {
    BuildBriefInvite(onGenerate: {})
        .background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 2: `BuildBriefSkeleton.swift`**

```swift
import SwiftUI

/// The generating state: placeholder bars with an amber shimmer (static under
/// Reduce Motion).
struct BuildBriefSkeleton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shimmer = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(0..<6, id: \.self) { i in
                RoundedRectangle(cornerRadius: 8)
                    .fill(Theme.Stealth.skyMid.opacity(reduceMotion ? 0.5 : (shimmer ? 0.7 : 0.35)))
                    .frame(height: i == 0 ? 56 : 18)
                    .frame(maxWidth: i % 2 == 0 ? .infinity : 220, alignment: .leading)
            }
            Spacer()
        }
        .padding(20)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { shimmer = true }
        }
    }
}

#Preview {
    BuildBriefSkeleton().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 3: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 4: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/BuildBrief/BuildBriefInvite.swift PlinthsApp/PlinthsApp/BuildBrief/BuildBriefSkeleton.swift && git commit -m "feat(ios): M5 Build Brief invite + skeleton states

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Section rows (CapabilityRow · FoundationRow · LowTechCard)

**Files:** Create `BuildBrief/CapabilityRow.swift`, `BuildBrief/FoundationRow.swift`, `BuildBrief/BuildBriefLowTechCard.swift`

**Interfaces:**
- Consumes: `BuildBriefCapability`/`BuildBriefPrimitive`/`BuildOrBuy` (T1).
- Produces: `CapabilityRow(capability:)`, `BuildOrBuyTag(kind:)`, `FoundationRow(primitive:)`, `BuildBriefLowTechCard()`.

- [ ] **Step 1: `CapabilityRow.swift`** (includes `BuildOrBuyTag` — it renders only inside a capability)

```swift
import SwiftUI

/// A BUILD (amber-filled) / BUY (mono hairline) tag. Amber-only: the label +
/// treatment carry the meaning, never a second hue.
struct BuildOrBuyTag: View {
    let kind: BuildOrBuy
    var body: some View {
        Text(kind == .build ? "BUILD" : "BUY")
            .font(Theme.Typeface.badge)
            .foregroundStyle(kind == .build ? Theme.Stealth.skyTop : Theme.Stealth.textSecondary)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(kind == .build ? Theme.Stealth.amber : Color.clear)
            .overlay(Capsule().stroke(Theme.Stealth.textSecondary.opacity(kind == .build ? 0 : 0.3), lineWidth: 1))
            .clipShape(.capsule)
    }
}

/// One capability: name + build/buy tag, description, and the recommendation.
struct CapabilityRow: View {
    let capability: BuildBriefCapability
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(capability.name).font(Theme.Typeface.bodyEmphasized).foregroundStyle(Theme.Stealth.text)
                BuildOrBuyTag(kind: capability.buildOrBuy)
            }
            Text(capability.description).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if !capability.recommendation.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("RECOMMENDED").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
                    Text(capability.recommendation).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    CapabilityRow(capability: MockBuildBrief.digitalFitness.capabilities[3])
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 2: `FoundationRow.swift`**

```swift
import SwiftUI

/// One vendor-neutral foundation primitive: name + cloud examples + why.
struct FoundationRow: View {
    let primitive: BuildBriefPrimitive
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(primitive.primitive).font(Theme.Typeface.bodyEmphasized).foregroundStyle(Theme.Stealth.text)
            Text(primitive.cloudExamples).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
            Text(primitive.why).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    FoundationRow(primitive: MockBuildBrief.digitalFitness.foundation[2])
        .padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 3: `BuildBriefLowTechCard.swift`**

```swift
import SwiftUI

/// Shown instead of the complexity/effort strip when `isTechDominant == false`.
struct BuildBriefLowTechCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("NOT TECHNOLOGY-DOMINANT").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
            Text("This idea is more about operations and go-to-market than custom software. A website plus off-the-shelf payments gets you most of the way — hold off on an engineering build-out until demand is proven.")
                .font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Stealth.skyMid.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

#Preview {
    BuildBriefLowTechCard().padding().background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 4: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 5: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/BuildBrief/CapabilityRow.swift PlinthsApp/PlinthsApp/BuildBrief/FoundationRow.swift PlinthsApp/PlinthsApp/BuildBrief/BuildBriefLowTechCard.swift && git commit -m "feat(ios): M5 Build Brief section rows (capability, foundation, low-tech)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Build Brief markdown export

**Files:** Create `BuildBrief/BuildBriefMarkdown.swift`

**Interfaces:**
- Consumes: `BuildBrief`, `BuildBriefCopy` (T1).
- Produces: `buildBriefMarkdown(_ brief: BuildBrief) -> String`.

- [ ] **Step 1: Write `BuildBriefMarkdown.swift`**

```swift
import Foundation

/// Renders a Build Brief as plain markdown for copy/share. Dependency-free.
func buildBriefMarkdown(_ brief: BuildBrief) -> String {
    var lines: [String] = ["# Build Brief", ""]

    if brief.isTechDominant {
        lines.append("**Build complexity:** \(brief.complexityScore)/100 — \(brief.complexityLabel)")
        if !brief.complexityDrivers.isEmpty {
            lines.append("Driven by \(brief.complexityDrivers.joined(separator: ", ")).")
        }
        lines.append("**Effort:** \(brief.effort.timeframe) · \(brief.effort.teamShape)")
    } else {
        lines.append("**Not technology-dominant** — a website plus off-the-shelf payments gets you most of the way.")
    }
    lines.append("")

    lines.append("## Capabilities · build or buy")
    for c in brief.capabilities {
        lines.append("- **\(c.name)** (\(c.buildOrBuy.rawValue)): \(c.description)")
        if !c.recommendation.isEmpty { lines.append("  - Recommended: \(c.recommendation)") }
    }
    lines.append("")

    lines.append("## Foundation · vendor-neutral")
    for f in brief.foundation {
        lines.append("- **\(f.primitive)** — \(f.cloudExamples): \(f.why)")
    }
    lines.append("")

    lines.append("## MVP scope")
    lines.append(brief.mvpScope)
    lines.append("")

    lines.append("## Technical risks")
    for (i, r) in brief.technicalRisks.enumerated() {
        lines.append("### R\(i + 1) — \(r.title)")
        lines.append(r.description)
    }
    lines.append("")

    lines.append("## Foundations & Limits")
    for p in BuildBriefCopy.principles { lines.append("- \(p)") }
    lines.append("")
    lines.append("> \(BuildBriefCopy.limit)")
    lines.append("")
    lines.append("— Generated by plinths · Build Brief")

    return lines.joined(separator: "\n")
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/BuildBrief/BuildBriefMarkdown.swift && git commit -m "feat(ios): M5 Build Brief markdown export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: BuildBriefBody (the ready render)

**Files:** Create `BuildBrief/BuildBriefBody.swift`

**Interfaces:**
- Consumes: `BuildBrief` (T1), `CapabilityRow`/`FoundationRow`/`BuildBriefLowTechCard` (T7), `buildBriefMarkdown` (T8), `BuildBriefCopy` (T1).
- Produces: `BuildBriefBody(brief:)`.

- [ ] **Step 1: Write `BuildBriefBody.swift`**

```swift
import SwiftUI
import UIKit

/// The ready Build Brief: conclusion strip → capabilities → foundation → MVP
/// scope → technical risks → Foundations & Limits → action row.
struct BuildBriefBody: View {
    let brief: BuildBrief
    @State private var copied = false

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("BUILD BRIEF").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
            conclusion
            divider
            section("Capabilities", "Build or buy") {
                VStack(alignment: .leading, spacing: 16) { ForEach(brief.capabilities) { CapabilityRow(capability: $0) } }
            }
            divider
            section("Foundation", "Vendor-neutral primitives") {
                VStack(alignment: .leading, spacing: 14) { ForEach(brief.foundation) { FoundationRow(primitive: $0) } }
            }
            divider
            section("MVP scope", "The smallest thing worth shipping") {
                Text(brief.mvpScope).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            divider
            section("Technical risks", nil) {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(Array(brief.technicalRisks.enumerated()), id: \.element.id) { i, risk in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 8) {
                                Text("R\(i + 1)").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
                                Text(risk.title).font(Theme.Typeface.bodyEmphasized).foregroundStyle(Theme.Stealth.text)
                            }
                            Text(risk.description).font(Theme.Typeface.body).foregroundStyle(Theme.Stealth.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            divider
            foundationsAndLimits
            actionRow
        }
    }

    private var conclusion: some View {
        Group {
            if brief.isTechDominant {
                HStack(alignment: .top, spacing: 24) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("BUILD COMPLEXITY").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("\(brief.complexityScore)").font(Theme.Typeface.largeTitle).foregroundStyle(Theme.Stealth.amber)
                            Text("/100").font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                        }
                        Text(brief.complexityLabel).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.amber)
                        if !brief.complexityDrivers.isEmpty {
                            Text("Driven by \(brief.complexityDrivers.joined(separator: ", "))")
                                .font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("EFFORT").font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
                        Text(brief.effort.timeframe).font(Theme.Typeface.title).foregroundStyle(Theme.Stealth.text)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(brief.effort.teamShape).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else {
                BuildBriefLowTechCard()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var foundationsAndLimits: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Foundations & Limits").font(Theme.Typeface.title).foregroundStyle(Theme.Stealth.text)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(BuildBriefCopy.principles, id: \.self) { p in
                    HStack(alignment: .top, spacing: 8) {
                        Text("·").foregroundStyle(Theme.Stealth.amber)
                        Text(p).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            Text(BuildBriefCopy.limit).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var actionRow: some View {
        HStack {
            Button {
                UIPasteboard.general.string = buildBriefMarkdown(brief)
                copied = true
                Task { try? await Task.sleep(for: .seconds(1.5)); copied = false }
            } label: {
                Text(copied ? "COPIED" : "COPY AS MARKDOWN")
                    .font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.amber)
            }
            .buttonStyle(.plain)
            Spacer()
            Text("Generated \(Date.now.formatted(.dateTime.month(.abbreviated).day()))")
                .font(Theme.Typeface.badge).foregroundStyle(Theme.Stealth.textSecondary)
        }
    }

    private var divider: some View {
        Rectangle().fill(Theme.Stealth.textSecondary.opacity(0.15)).frame(height: 1)
    }

    private func section<Content: View>(_ name: String, _ sub: String?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(name).font(Theme.Typeface.title).foregroundStyle(Theme.Stealth.text)
                if let sub { Text(sub).font(Theme.Typeface.caption).foregroundStyle(Theme.Stealth.textSecondary) }
            }
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview("tech-dominant") {
    ScrollView { BuildBriefBody(brief: MockBuildBrief.digitalFitness).padding(20) }
        .background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
#Preview("low-tech") {
    ScrollView { BuildBriefBody(brief: MockBuildBrief.lowTechExample).padding(20) }
        .background(Theme.Stealth.skyTop).preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/BuildBrief/BuildBriefBody.swift && git commit -m "feat(ios): M5 BuildBriefBody (ready render, all sections)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: BuildBriefView (state machine + generate flow)

**Files:** Create `BuildBrief/BuildBriefView.swift`

**Interfaces:**
- Consumes: `BuildBriefStore`/`BuildBriefState` (T3), `MockBuildBrief` (T2), `BuildBriefInvite`/`BuildBriefSkeleton` (T6), `BuildBriefBody` (T9), `WorkspaceComposer` (T5), `ReportFace` (T4).
- Produces: `BuildBriefView(reportKey:onBack:onAsk:onNavigate:)`.

- [ ] **Step 1: Write `BuildBriefView.swift`**

```swift
import SwiftUI

/// The Build Brief face: a generate state machine (idle → generating → ready)
/// over the shared composer. The brief content is canned per report; the store
/// tracks whether it's been "generated" this session.
struct BuildBriefView: View {
    let reportKey: String
    let onBack: () -> Void
    let onAsk: (String) -> Void
    let onNavigate: (ReportFace) -> Void

    @Environment(BuildBriefStore.self) private var store

    private var brief: BuildBrief { MockBuildBrief.brief(for: reportKey) }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            content
            WorkspaceComposer(current: .brief, onNavigate: onNavigate, onSubmit: onAsk)
                .padding(.horizontal, 20).padding(.bottom, 12)
        }
        .background(Theme.Stealth.skyTop.ignoresSafeArea())
        // When the store enters .generating, model ~1.5s of work then reveal.
        .task(id: store.state(for: reportKey)) {
            guard store.state(for: reportKey) == .generating else { return }
            try? await Task.sleep(for: .seconds(1.5))
            store.markReady(reportKey)
        }
    }

    @ViewBuilder private var content: some View {
        switch store.state(for: reportKey) {
        case .idle:
            BuildBriefInvite { store.startGenerating(reportKey) }
        case .generating:
            BuildBriefSkeleton()
        case .ready:
            ScrollView { BuildBriefBody(brief: brief).padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 24) }
        }
    }

    private var topBar: some View {
        HStack {
            Button(action: onBack) {
                Image(systemName: "chevron.left").font(.system(size: 18, weight: .medium))
                    .foregroundStyle(Theme.Stealth.textSecondary).frame(width: 44, height: 44).contentShape(.rect)
            }
            .accessibilityLabel("Back")
            Spacer()
        }
        .padding(.horizontal, 8)
    }
}
```

- [ ] **Step 2: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 3: Screenshot the ready brief.** Temporarily point the app entry at a ready BuildBriefView: in `PlinthsAppApp.swift` replace the `WindowGroup { ... }` body with
  ```swift
  BuildBriefView(reportKey: "digitalFitness", onBack: {}, onAsk: { _ in }, onNavigate: { _ in })
      .environment({ let s = BuildBriefStore(); s.markReady("digitalFitness"); return s }())
      .preferredColorScheme(.dark)
  ```
  (keep `init`/struct intact). Build, screenshot `/tmp/m5-brief-ready.png` — expect the BUILD BRIEF label, complexity 58 / Moderate + effort, capabilities with BUILD/BUY tags, foundation, and the docked composer with the report+muse glyphs. **Revert `PlinthsAppApp.swift`.**
- [ ] **Step 4: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/BuildBrief/BuildBriefView.swift && git commit -m "feat(ios): M5 BuildBriefView (generate → skeleton → brief)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: MemoView — relocate nav into the composer

**Files:** Modify `Report/MemoView.swift`

**Interfaces:**
- Consumes: `WorkspaceComposer` (T5), `ReportFace` (T4).
- Produces: `MemoView(memo:date:highlightTarget:onBack:onAsk:onNavigate:)` — drops `hasThread`, `onToggleToMuse`, `onBannerBack`.

- [ ] **Step 1: Edit `MemoView.swift`** — make four changes:
  1. **Signature:** replace the property block so it reads:
     ```swift
         let memo: MarketMemo
         let date: Date
         let highlightTarget: MuseCitationTarget?
         let onBack: () -> Void
         let onAsk: (String) -> Void
         let onNavigate: (ReportFace) -> Void
     ```
     (removes `hasThread`, `onToggleToMuse`, `onBannerBack`.)
  2. **Top bar:** delete the `if hasThread { Button(action: onToggleToMuse) { Image(systemName: "message") … } }` block entirely (nav now lives in the composer). Keep the back chevron and the `ShareLink`.
  3. **Banner:** change `BackToChatBanner(onBack: onBannerBack)` to `BackToChatBanner(onBack: { onNavigate(.muse) })`.
  4. **Composer:** replace `MuseComposer(placeholder: "Ask about this report…") { onAsk($0) }` with
     ```swift
             WorkspaceComposer(current: .report, onNavigate: onNavigate, onSubmit: onAsk)
     ```
     (keep its `.padding(.horizontal, 20).padding(.bottom, 12)`.)
  5. **`#Preview`:** update to the new signature:
     ```swift
     #Preview {
         MemoView(memo: MockMemo.digitalFitness, date: .now, highlightTarget: nil,
                  onBack: {}, onAsk: { _ in }, onNavigate: { _ in })
             .preferredColorScheme(.dark)
     }
     ```

- [ ] **Step 2: Update `ReportSurface`'s `.report` case** (required for a green build — `MemoView`'s only caller must match the new signature). Add a `navigate(to:)` helper and rewire just the `.report` case (leave the `.brief` stub and the `.muse` case untouched):
```swift
    private func navigate(to target: ReportFace) { highlight = nil; face = target }
```
```swift
        case .report:
            MemoView(memo: memo, date: date, highlightTarget: highlight, onBack: onBack,
                     onAsk: { openMuseAsking($0) }, onNavigate: { navigate(to: $0) })
```

- [ ] **Step 3: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit** (`MemoView` + `ReportSurface`)
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Report/MemoView.swift PlinthsApp/PlinthsApp/Muse/ReportSurface.swift && git commit -m "feat(ios): M5 MemoView nav → composer (drop top-bar toggle)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: MuseView — relocate nav + delete MuseComposer

**Files:** Modify `Muse/MuseView.swift`; **delete** `Muse/MuseComposer.swift`

**Interfaces:**
- Consumes: `WorkspaceComposer` (T5), `ReportFace` (T4).
- Produces: `MuseView(reportKey:pendingAsk:onConsumePendingAsk:onCite:onBack:onNavigate:)` — drops `onToggleToReport`.

- [ ] **Step 1: Edit `MuseView.swift`** — three changes:
  1. **Signature:** replace `let onToggleToReport: () -> Void` with `let onNavigate: (ReportFace) -> Void`.
  2. **Top bar:** delete the trailing `Button(action: onToggleToReport) { SaturationToggleMark()… }` block (nav now in the composer). Keep the back chevron. The top bar becomes just:
     ```swift
     private var topBar: some View {
         HStack {
             Button(action: onBack) {
                 Image(systemName: "chevron.left").font(.system(size: 18, weight: .medium))
                     .foregroundStyle(Theme.Stealth.textSecondary).frame(width: 44, height: 44).contentShape(.rect)
             }
             .accessibilityLabel("Back")
             Spacer()
         }
         .padding(.horizontal, 8)
     }
     ```
  3. **Composer:** replace `MuseComposer { ask(free: $0) }` with
     ```swift
             WorkspaceComposer(current: .muse, onNavigate: onNavigate, onSubmit: { ask(free: $0) })
     ```
     (keep its `.padding(.horizontal, 20).padding(.bottom, 12)`.)

- [ ] **Step 2: Delete `MuseComposer.swift`** (superseded):
  ```bash
  git rm PlinthsApp/PlinthsApp/Muse/MuseComposer.swift
  ```

- [ ] **Step 3: Update `ReportSurface`'s `.muse` case** (required for a green build — `MuseView`'s only caller must match). Change the `.muse` case in `body` to pass `onNavigate` instead of `onToggleToReport` (leave `.report` and the `.brief` stub as-is):
```swift
        case .muse:
            MuseView(reportKey: reportKey, pendingAsk: pendingAsk,
                     onConsumePendingAsk: { pendingAsk = nil },
                     onCite: { routeCite($0) }, onBack: onBack,
                     onNavigate: { navigate(to: $0) })
```

- [ ] **Step 4: Build.** Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Commit** (`MuseView` + `ReportSurface`, and the deleted `MuseComposer`)
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/MuseView.swift PlinthsApp/PlinthsApp/Muse/ReportSurface.swift PlinthsApp/PlinthsApp/Muse/MuseComposer.swift && git commit -m "feat(ios): M5 MuseView nav → composer; delete MuseComposer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: ReportSurface three-way + store injection

**Files:** Modify `Muse/ReportSurface.swift`, `PlinthsAppApp.swift`

**Interfaces:**
- Consumes: `BuildBriefView` (T10), `MemoView`/`MuseView` (T11/T12), `BuildBriefStore` (T3), `ReportFace` (T4).

- [ ] **Step 1: Wire the `.brief` face** — replace the `case .brief: EmptyView()` stub with the real `BuildBriefView`. By now (Tasks 4/11/12) `ReportSurface` already has `navigate(to:)` and the updated `.report`/`.muse` cases; the final file should read exactly this (confirm it matches):
```swift
import SwiftUI

/// One report's three faces — report / build brief / muse — swapped by the
/// composer's destination glyphs. Owns the citation highlight + pending-ask.
struct ReportSurface: View {
    let memo: MarketMemo
    let date: Date
    let reportKey: String
    let initialFace: ReportFace
    let onBack: () -> Void

    @Environment(MuseStore.self) private var store
    @State private var face: ReportFace
    @State private var highlight: MuseCitationTarget?
    @State private var pendingAsk: String?

    init(memo: MarketMemo, date: Date, reportKey: String, initialFace: ReportFace, onBack: @escaping () -> Void) {
        self.memo = memo; self.date = date; self.reportKey = reportKey
        self.initialFace = initialFace; self.onBack = onBack
        _face = State(initialValue: initialFace)
    }

    var body: some View {
        switch face {
        case .report:
            MemoView(memo: memo, date: date, highlightTarget: highlight, onBack: onBack,
                     onAsk: { openMuseAsking($0) },
                     onNavigate: { navigate(to: $0) })
        case .brief:
            BuildBriefView(reportKey: reportKey, onBack: onBack,
                           onAsk: { openMuseAsking($0) },
                           onNavigate: { navigate(to: $0) })
        case .muse:
            MuseView(reportKey: reportKey, pendingAsk: pendingAsk,
                     onConsumePendingAsk: { pendingAsk = nil },
                     onCite: { routeCite($0) },
                     onBack: onBack,
                     onNavigate: { navigate(to: $0) })
        }
    }

    private func navigate(to target: ReportFace) { highlight = nil; face = target }

    private func openMuseAsking(_ query: String) { pendingAsk = query; highlight = nil; face = .muse }

    private func routeCite(_ target: String) {
        guard let t = museTarget(target) else { return }
        highlight = t; face = .report
    }
}
```

- [ ] **Step 2: `PlinthsAppApp.swift`** — own + inject `BuildBriefStore` alongside `MuseStore`. Add the state and the environment injection:
  ```swift
      @State private var museStore = MuseStore()
      @State private var briefStore = BuildBriefStore()
  ```
  and on the root `ZStack` add `.environment(briefStore)` next to the existing `.environment(museStore)`:
  ```swift
              .environment(museStore)
              .environment(briefStore)
  ```

- [ ] **Step 3: Build.** Expected: `** BUILD SUCCEEDED **`.
- [ ] **Step 4: Screenshot the three-face nav.** Temporarily set `isSignedIn = true` in `PlinthsAppApp.swift` AND set `WorkspaceView`'s default `screen = .report(MockMemo.digitalFitness, .now, "digitalFitness")`. Build, launch, screenshot `/tmp/m5-report-nav.png` — expect the report with the docked composer showing the **build-brief (□□) + muse (💬) glyphs** on the left (report's own glyph hidden). **Revert both** (`isSignedIn = false`, `screen = .home`).
- [ ] **Step 5: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/PlinthsApp/Muse/ReportSurface.swift PlinthsApp/PlinthsApp/PlinthsAppApp.swift && git commit -m "feat(ios): M5 ReportSurface three-face nav + BuildBriefStore injection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: SETUP doc + final verification

**Files:** Modify `PlinthsApp/SETUP.md`

- [ ] **Step 1: Update the project-structure list** — add the `BuildBrief/` folder + `Models/BuildBrief/` files and the two new `Muse/` files; remove `MuseComposer.swift` (deleted). Under the structure list add:
```text
  Muse/
    …
    NavGlyphRow.swift        # report/brief/muse destination glyphs
    WorkspaceComposer.swift  # nav glyphs + Muse field (replaces MuseComposer)
  BuildBrief/
    BuildBriefView.swift     # the surface (generate → skeleton → brief)
    BuildBriefInvite.swift   # idle "Generate" CTA
    BuildBriefSkeleton.swift # generating placeholder
    BuildBriefBody.swift     # the ready brief render
    BuildBriefLowTechCard.swift  # isTechDominant:false card
    CapabilityRow.swift      # one capability + BUILD/BUY tag
    FoundationRow.swift      # one vendor-neutral primitive
    BuildBriefMarkdown.swift # copy-as-markdown
  Models/
    …
    BuildBrief/
      BuildBriefModel.swift  # BuildBrief value types + fixed copy
      MockBuildBrief.swift    # 3 per-report briefs + low-tech
      BuildBriefStore.swift   # in-memory generate state (@Observable)
```

- [ ] **Step 2: Update the Status section** — change `Milestone 4 complete:` to `Milestone 5 complete:` and append:
```text
The report, its Muse conversation, and now a **Build Brief** are three faces of
one report, navigated by destination glyphs in the docked composer (▬▬ report ·
□□ build brief · 💬 muse — you always see the two you're not on). The Build
Brief generates on demand (invite → skeleton → brief): build complexity + effort,
capabilities as build-or-buy, a vendor-neutral foundation, MVP scope, technical
risks, and a fixed Foundations & Limits note, with copy-as-markdown. Ungated in
beta; all mock (3 per-report briefs). Real generation lands in M7.
```
Also update the "Next milestones" line to drop M5 (now done): it should read
`Next milestones: peripheral UI — settings, theme toggle, account (M6), wire real backends + a test target (M7), real auth (M8).`

- [ ] **Step 3: Build + confirm production defaults.** Run the build (expect `** BUILD SUCCEEDED **`), then:
```bash
cd /Users/wakeensito/Plinths && git grep -n "isSignedIn = true" -- 'PlinthsApp/PlinthsApp/'; git grep -nE "screen: WorkspaceScreen = \.report" -- 'PlinthsApp/PlinthsApp/'
```
Expected: only the `SplashSignInView(onSignIn: { isSignedIn = true })` line; no `screen = .report` default. Confirm `WorkspaceView.swift` has `screen: WorkspaceScreen = .home` and `PlinthsAppApp.swift` has `isSignedIn = false` + the normal `ZStack` body (no swapped `WindowGroup` root).

- [ ] **Step 4: Commit**
```bash
cd /Users/wakeensito/Plinths && git add PlinthsApp/SETUP.md && git commit -m "docs(ios): SETUP reflects the M5 Build Brief + three-surface nav

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- 3-way composer-glyph nav → `NavGlyphRow` (T4), `WorkspaceComposer` (T5), face relocations (T11/T12), `ReportSurface` (T13) ✓
- Build Brief generate flow (invite → skeleton → brief, persists) → `BuildBriefStore` (T3), `BuildBriefView` (T10), invite/skeleton (T6) ✓
- Brief body sections in web order → `BuildBriefBody` (T9), rows (T7), markdown (T8) ✓
- `isTechDominant:false` low-tech branch coded + previewed → `BuildBriefLowTechCard` (T7), `BuildBriefBody` low-tech `#Preview` (T9), `lowTechExample` (T2) ✓
- 3 per-report fixtures → `MockBuildBrief` (T2) ✓
- Ungated in beta (no Pro lock) → `BuildBriefView` has only idle/generating/ready ✓
- Amber-only (complexity number+label; BUILD amber / BUY mono) → `BuildOrBuyTag`/`CapabilityRow` (T7), `BuildBriefBody` conclusion (T9) ✓
- Nav relocation (drop M4 top-bar toggles; delete MuseComposer) → T11/T12 ✓
- Store injection at root → `PlinthsAppApp` (T13) ✓
- SETUP refresh → T14 ✓

**Placeholder scan:** No TBD/TODO. Every code step ships complete Swift; the 3 briefs are fully authored. No test target by design (M7) — verification is build + screenshot per M1–M4.

**Type consistency:** `BuildBrief`/`BuildBriefCapability`/`BuildBriefPrimitive`/`BuildBriefRisk`/`BuildBriefEffort`/`BuildOrBuy`/`BuildBriefCopy` (T1) used unchanged in T2/T7/T8/T9. `BuildBriefStore`/`BuildBriefState` (T3) consumed by `BuildBriefView` (T10). `MockBuildBrief.brief(for:)`/`lowTechExample` (T2) consumed by T7/T9/T10. `ReportFace` `.report/.brief/.muse` (T4) used by `NavGlyphRow`/`WorkspaceComposer`/all faces/`ReportSurface`. `WorkspaceComposer(current:onNavigate:placeholder:onSubmit:)` (T5) called by `MemoView`/`MuseView`/`BuildBriefView`. New `MemoView(...:onNavigate:)` (T11) and `MuseView(...:onNavigate:)` (T12) match `ReportSurface`'s calls (T13). `BuildBriefView(reportKey:onBack:onAsk:onNavigate:)` (T10) matches `ReportSurface` (T13). `MockMemo.digitalFitness`/`reportKey` unchanged. `WorkspaceView`/`WorkspaceScreen` are UNCHANGED (ReportSurface signature identical to M4; the store is read via `@Environment`).

**Sequencing note:** `ReportFace.brief` + the `MemoView`/`MuseView` signature changes couple through `ReportSurface`, handled definitely so every task builds green in isolation: Task 4 adds a `case .brief: EmptyView()` stub (keeps the switch exhaustive); Tasks 11 and 12 each update the matching `ReportSurface` call site (`.report` / `.muse`) alongside their view's signature change and add/keep the `navigate(to:)` helper; Task 13 swaps the stub for `BuildBriefView`. No fold-forward guesswork.
