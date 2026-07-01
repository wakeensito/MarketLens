# iOS Milestone 2 — Post-Login Workspace Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the signed-in workspace shell — a dark Stealth-Desert home where a user describes a business idea, browses mock past reports in a slide-in history drawer, and on submit sees a staged pipeline-loading animation.

**Architecture:** A top-level `isSignedIn` flag in `PlinthsAppApp` crossfades between the existing `SplashSignInView` (signed-out) and a new `WorkspaceView` (signed-in). `WorkspaceView` is a `ZStack` over `DesertSkyBackground` that hosts a top bar, a `WorkspaceScreen`-driven body (`.home` / `.loading`), and an overlaid history drawer. All data is static mock content ported from the web app's `frontend/src/mockData.ts`.

**Tech Stack:** SwiftUI (iOS 26.2, Swift 6.2), Xcode 26.3. No third-party packages. File-system-synchronized Xcode group (any file added under `PlinthsApp/PlinthsApp/` auto-joins the build).

## Global Constraints

- **Target:** iOS 26.2 · Swift 6.2. Bundle id `Plinths.PlinthsApp`.
- **One type per file** (swiftui-pro convention already followed in the repo).
- **Palette: `Theme.Stealth` tokens only** — `skyTop`, `skyMid`, `amber`, `text`, `textSecondary`, `sand`. **Introduce no new colors.** In Stealth, **amber is the only color**; saturation severity reads from the number + label, never new reds/greens.
- **Input is text + send only** — no `Model` picker, no `＋` attach button (both would be dead affordances).
- **No cinematic transitions** — splash↔workspace and home↔loading are plain crossfades; the drawer slides (fades under Reduce Motion).
- **Mock auth** — any splash sign-in button enters the workspace. No real auth until M5.
- **Accessibility** — every icon button has an `accessibilityLabel`; tap targets ≥ 44×44; honor Reduce Motion; all text uses `Theme.Typeface` roles (Dynamic Type via `relativeTo:`).
- **No test target exists** (XCTest is deferred to M4). Each task verifies with `xcodebuild … build` (compile gate) **and** a simulator screenshot (behavior gate) — not unit tests.

### Standard verification commands (used by every task)

Build (from `PlinthsApp/`):
```bash
cd /Users/wakeensito/Plinths/PlinthsApp
xcodebuild -project PlinthsApp.xcodeproj -scheme PlinthsApp \
  -destination 'generic/platform=iOS Simulator' build 2>&1 | tail -20
```
Expected: `** BUILD SUCCEEDED **`. (If the build approaches the timeout, re-run with `run_in_background: true` and poll the output file.)

Install + launch + screenshot (after a successful build):
```bash
xcrun simctl boot "iPhone 17" 2>/dev/null; open -a Simulator
APP=$(find ~/Library/Developer/Xcode/DerivedData/PlinthsApp-*/Build/Products/Debug-iphonesimulator -name "PlinthsApp.app" | head -1)
xcrun simctl install booted "$APP"
xcrun simctl launch booted Plinths.PlinthsApp
sleep 3
xcrun simctl io booted screenshot /tmp/m2-step.png
```
Then Read `/tmp/m2-step.png` to confirm the expected UI.

---

## File Structure

```text
PlinthsApp/PlinthsApp/
  Models/
    WorkspaceScreen.swift      # enum { home, loading }                (Task 1)
    PipelineStage.swift        # stage model + ordered list + helpers  (Task 1)
    MockWorkspace.swift        # example ideas + mock past reports      (Task 1)
  Workspace/
    WorkspaceView.swift        # signed-in root; grows across tasks 2,3,4,5
    WorkspaceTopBar.swift      # ☰ · plinths · ⊕                       (Task 2)
    ExampleIdeaChip.swift      # one tappable sample idea               (Task 3)
    IdeaInputBar.swift         # bottom-docked text + send              (Task 3)
    WorkspaceHome.swift        # hero + chips + input                   (Task 3)
    HistoryRow.swift           # one past-report row                    (Task 4)
    HistoryDrawer.swift        # slide-in panel + scrim                 (Task 4)
    PipelineLoadingView.swift  # staged loading animation               (Task 5)
  Splash/
    SplashSignInControls.swift # MODIFY: accept onSignIn                (Task 2)
    SplashSignInView.swift     # MODIFY: pass onSignIn through          (Task 2)
  PlinthsAppApp.swift          # MODIFY: isSignedIn switch              (Task 2)
```

`WorkspaceView.swift` is the assembling root and is intentionally edited in Tasks 2–5; each edit is a focused, explicitly specified diff that lands a visible change in the running app.

---

## Task 1: Models & mock data

**Files:**
- Create: `PlinthsApp/PlinthsApp/Models/WorkspaceScreen.swift`
- Create: `PlinthsApp/PlinthsApp/Models/PipelineStage.swift`
- Create: `PlinthsApp/PlinthsApp/Models/MockWorkspace.swift`

**Interfaces:**
- Produces: `enum WorkspaceScreen { case home, loading }`
- Produces: `struct PipelineStage: Identifiable` with `id, label, description, startMs, durationMs`; statics `all: [PipelineStage]`, `totalSeconds: Double`, `stage(at: Double) -> PipelineStage`
- Produces: `struct MockReport: Identifiable` with `id, ideaText, saturationScore: Int, saturationLabel: String, createdAt: Date`; `enum MockWorkspace` with `exampleIdeas: [String]`, `history: [MockReport]`

- [ ] **Step 1: Create `WorkspaceScreen.swift`**

```swift
import Foundation

/// Which screen the signed-in workspace is currently showing.
enum WorkspaceScreen {
    case home
    case loading
}
```

- [ ] **Step 2: Create `PipelineStage.swift`**

```swift
import Foundation

/// One stage of the (mock) analysis pipeline shown on the loading screen.
/// Mirrors the web app's PIPELINE_STAGE_DEFS (frontend/src/mockData.ts), with
/// the three parallel web-research stages collapsed into one and the total
/// compressed to ~6.5s for a snappier feel.
struct PipelineStage: Identifiable {
    let id: String
    let label: String
    let description: String
    let startMs: Int
    let durationMs: Int

    static let all: [PipelineStage] = [
        PipelineStage(id: "validate", label: "Validating",
                      description: "Sanitizing input", startMs: 0, durationMs: 300),
        PipelineStage(id: "parse", label: "Parsing concept",
                      description: "Extracting vertical, keywords & intent", startMs: 300, durationMs: 900),
        PipelineStage(id: "research", label: "Web Research",
                      description: "Mapping competitors, market size & trends", startMs: 1200, durationMs: 2200),
        PipelineStage(id: "analyse", label: "Analysing landscape",
                      description: "Competitive positioning & moats", startMs: 3400, durationMs: 1600),
        PipelineStage(id: "score", label: "Scoring",
                      description: "Saturation & opportunity index", startMs: 5000, durationMs: 400),
        PipelineStage(id: "synthesise", label: "Synthesising insights",
                      description: "Summary, gaps & entry roadmap", startMs: 5400, durationMs: 900),
        PipelineStage(id: "assemble", label: "Assembling report",
                      description: "Packaging the final report", startMs: 6300, durationMs: 400),
    ]

    /// Total runtime in seconds (end of the last stage).
    static let totalSeconds: Double = {
        let endMs = all.map { $0.startMs + $0.durationMs }.max() ?? 0
        return Double(endMs) / 1000.0
    }()

    /// The stage active at the given elapsed time (seconds), clamped to the last.
    static func stage(at elapsed: Double) -> PipelineStage {
        let ms = Int(elapsed * 1000)
        return all.last(where: { ms >= $0.startMs }) ?? all[0]
    }
}
```

- [ ] **Step 3: Create `MockWorkspace.swift`**

```swift
import Foundation

/// A past report shown in the history drawer (mock only).
struct MockReport: Identifiable {
    let id: String
    let ideaText: String
    let saturationScore: Int
    let saturationLabel: String
    let createdAt: Date
}

/// Static mock content for the workspace shell, ported from the web app's
/// mockData.ts (EXAMPLE_QUERIES + MOCK_HISTORY).
enum MockWorkspace {
    /// Example ideas offered on the empty home. Tapping one fills the input.
    static let exampleIdeas: [String] = [
        "AI fitness coaching app",
        "D2C supplement brand",
        "SaaS for dental offices",
    ]

    /// Mock past reports for the history drawer, newest first.
    static let history: [MockReport] = [
        MockReport(id: "mock-h1", ideaText: "Creator economy monetization platform",
                   saturationScore: 73, saturationLabel: "Highly Saturated",
                   createdAt: Date(timeIntervalSinceNow: -3600 * 2)),
        MockReport(id: "mock-h2", ideaText: "Sustainable food delivery platform",
                   saturationScore: 81, saturationLabel: "Highly Saturated",
                   createdAt: Date(timeIntervalSinceNow: -86400)),
        MockReport(id: "mock-h3", ideaText: "B2B SaaS for construction project management",
                   saturationScore: 34, saturationLabel: "Low Saturation",
                   createdAt: Date(timeIntervalSinceNow: -86400 * 2)),
        MockReport(id: "mock-h4", ideaText: "Pet telehealth and vet booking service",
                   saturationScore: 47, saturationLabel: "Moderately Saturated",
                   createdAt: Date(timeIntervalSinceNow: -86400 * 5)),
    ]
}
```

- [ ] **Step 4: Build to verify it compiles**

Run the standard build command. Expected: `** BUILD SUCCEEDED **`. (No UI change yet — compile gate only.)

- [ ] **Step 5: Commit**

```bash
git add PlinthsApp/PlinthsApp/Models/
git commit -m "feat(ios): M2 models — workspace screen, pipeline stages, mock data"
```

---

## Task 2: App session switch, WorkspaceView root & top bar

**Files:**
- Create: `PlinthsApp/PlinthsApp/Workspace/WorkspaceView.swift`
- Create: `PlinthsApp/PlinthsApp/Workspace/WorkspaceTopBar.swift`
- Modify: `PlinthsApp/PlinthsApp/Splash/SplashSignInControls.swift`
- Modify: `PlinthsApp/PlinthsApp/Splash/SplashSignInView.swift`
- Modify: `PlinthsApp/PlinthsApp/PlinthsAppApp.swift`

**Interfaces:**
- Consumes: nothing from Task 1 yet.
- Produces: `WorkspaceView()` (no params); `WorkspaceTopBar(onHistory: () -> Void, onNew: () -> Void)`; `SplashSignInView(onSignIn: () -> Void)`; `SplashSignInControls(onSignIn: () -> Void)`.

- [ ] **Step 1: Create `WorkspaceTopBar.swift`**

```swift
import SwiftUI

/// The workspace top bar: a history button, the plinths wordmark, and a
/// new-report button. Sits above the active screen.
struct WorkspaceTopBar: View {
    let onHistory: () -> Void
    let onNew: () -> Void

    var body: some View {
        HStack {
            iconButton("line.3.horizontal", label: "Open history", action: onHistory)
            Spacer()
            Text("plinths")
                .font(Theme.Typeface.wordmark)
                .foregroundStyle(Theme.Stealth.text)
            Spacer()
            iconButton("plus", label: "New report", action: onNew)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    private func iconButton(_ systemName: String, label: String,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(Theme.Stealth.textSecondary)
                .frame(width: 44, height: 44)
                .contentShape(.rect)
        }
        .accessibilityLabel(label)
    }
}

#Preview {
    VStack {
        WorkspaceTopBar(onHistory: {}, onNew: {})
        Spacer()
    }
    .background(Theme.Stealth.skyTop)
}
```

- [ ] **Step 2: Create `WorkspaceView.swift` (placeholder home — replaced in Task 3)**

```swift
import SwiftUI

/// The signed-in workspace root: a dark Stealth-Desert surface hosting the
/// idea-input home, a history drawer, and the pipeline-loading screen.
/// (This task ships the top bar over a placeholder hero; Task 3 adds the real
/// home, Task 4 the drawer, Task 5 the loading screen.)
struct WorkspaceView: View {
    var body: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                WorkspaceTopBar(onHistory: {}, onNew: {})
                Spacer()
                VStack(spacing: 12) {
                    Text("What are you building?")
                        .font(Theme.Typeface.title)
                        .foregroundStyle(Theme.Stealth.text)
                    Text("Describe an idea to map its competitive landscape.")
                        .font(Theme.Typeface.caption)
                        .foregroundStyle(Theme.Stealth.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 20)
                Spacer()
            }
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    WorkspaceView()
}
```

- [ ] **Step 3: Modify `SplashSignInControls.swift` — accept `onSignIn`**

Add the property at the top of the struct (after `@State private var showMoreOptions = false`):
```swift
    /// Called when the user picks any sign-in option. Mock auth in M2 — every
    /// option simply enters the workspace; real auth lands in M5.
    let onSignIn: () -> Void
```
Replace the three print handlers:
```swift
    private func handleGoogle() {
        onSignIn()
    }

    private func handleApple() {
        onSignIn()
    }

    private func handleEmail() {
        onSignIn()
    }
```
Update its `#Preview` to pass the closure:
```swift
#Preview {
    SplashSignInControls(onSignIn: {})
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Stealth.skyTop)
}
```

- [ ] **Step 4: Modify `SplashSignInView.swift` — pass `onSignIn` through**

Add the property at the top of the struct:
```swift
    let onSignIn: () -> Void
```
Pass it into the controls (replace `SplashSignInControls()`):
```swift
                SplashSignInControls(onSignIn: onSignIn)
```
Update its `#Preview`:
```swift
#Preview {
    SplashSignInView(onSignIn: {})
}
```

- [ ] **Step 5: Modify `PlinthsAppApp.swift` — session switch**

Replace the struct body with:
```swift
@main
struct PlinthsAppApp: App {
    @State private var isSignedIn = false

    init() {
        FontRegistrar.registerBundledFonts()
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                if isSignedIn {
                    WorkspaceView()
                        .transition(.opacity)
                } else {
                    SplashSignInView(onSignIn: { isSignedIn = true })
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.35), value: isSignedIn)
        }
    }
}
```

- [ ] **Step 6: Build**

Run the standard build command. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 7: Screenshot to verify the switch**

Run the install/launch/screenshot commands. In the simulator, tap **Continue with Google** on the splash, then re-screenshot:
```bash
xcrun simctl io booted screenshot /tmp/m2-task2.png
```
Read `/tmp/m2-task2.png`. Expected: the dark workspace with `☰  plinths  ⊕` across the top and the centered "What are you building?" hero.

- [ ] **Step 8: Commit**

```bash
git add PlinthsApp/PlinthsApp/Workspace/ PlinthsApp/PlinthsApp/Splash/ PlinthsApp/PlinthsApp/PlinthsAppApp.swift
git commit -m "feat(ios): M2 splash→workspace switch + top bar"
```

---

## Task 3: Workspace home — hero, example chips, idea input

**Files:**
- Create: `PlinthsApp/PlinthsApp/Workspace/ExampleIdeaChip.swift`
- Create: `PlinthsApp/PlinthsApp/Workspace/IdeaInputBar.swift`
- Create: `PlinthsApp/PlinthsApp/Workspace/WorkspaceHome.swift`
- Modify: `PlinthsApp/PlinthsApp/Workspace/WorkspaceView.swift`

**Interfaces:**
- Consumes: `MockWorkspace.exampleIdeas` (Task 1).
- Produces: `ExampleIdeaChip(title: String, action: () -> Void)`; `IdeaInputBar(draft: Binding<String>, onSubmit: () -> Void, isFocused: FocusState<Bool>.Binding)`; `WorkspaceHome(draft: Binding<String>, onSubmit: () -> Void)`.

- [ ] **Step 1: Create `ExampleIdeaChip.swift`**

```swift
import SwiftUI

/// A tappable sample business idea on the empty home. Tapping fills the input
/// (it does not submit).
struct ExampleIdeaChip: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.sand)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .overlay(Capsule().stroke(Theme.Stealth.amber.opacity(0.55), lineWidth: 1))
                .clipShape(.capsule)
        }
    }
}

#Preview {
    ExampleIdeaChip(title: "AI fitness coaching app", action: {})
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Stealth.skyTop)
}
```

- [ ] **Step 2: Create `IdeaInputBar.swift`**

```swift
import SwiftUI

/// The bottom-docked idea composer: a multi-line text field and an amber send
/// button. Text + send only — no model picker or attachment (Plinths has
/// neither). Send is disabled until there is non-empty text.
struct IdeaInputBar: View {
    @Binding var draft: String
    var onSubmit: () -> Void
    @FocusState.Binding var isFocused: Bool

    private var canSubmit: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Describe your idea…", text: $draft, axis: .vertical)
                .font(Theme.Typeface.body)
                .foregroundStyle(Theme.Stealth.text)
                .tint(Theme.Stealth.amber)
                .lineLimit(1...4)
                .focused($isFocused)
                .submitLabel(.go)

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
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(Theme.Stealth.skyMid)
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(Theme.Stealth.amber.opacity(0.3), lineWidth: 1)
                )
        )
    }

    private func submit() {
        guard canSubmit else { return }
        isFocused = false
        onSubmit()
    }
}
```

- [ ] **Step 3: Create `WorkspaceHome.swift`**

```swift
import SwiftUI

/// The empty-state home: a hero prompt, example-idea chips, and the bottom-
/// docked idea input. Tapping a chip fills (but does not submit) the input.
struct WorkspaceHome: View {
    @Binding var draft: String
    var onSubmit: () -> Void
    @FocusState private var inputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 12) {
                Text("What are you building?")
                    .font(Theme.Typeface.title)
                    .foregroundStyle(Theme.Stealth.text)
                Text("Describe an idea to map its competitive landscape.")
                    .font(Theme.Typeface.caption)
                    .foregroundStyle(Theme.Stealth.textSecondary)
                    .multilineTextAlignment(.center)
            }

            Spacer().frame(height: 28)

            VStack(spacing: 10) {
                ForEach(MockWorkspace.exampleIdeas, id: \.self) { idea in
                    ExampleIdeaChip(title: idea) {
                        draft = idea
                        inputFocused = true
                    }
                }
            }

            Spacer()

            IdeaInputBar(draft: $draft, onSubmit: onSubmit, isFocused: $inputFocused)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }
}

#Preview {
    WorkspaceHome(draft: .constant(""), onSubmit: {})
        .background(DesertSkyBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
```

- [ ] **Step 4: Modify `WorkspaceView.swift` — mount the real home**

Replace the whole struct with (adds `draft` state + `startNew`; `onSubmit` is a no-op until Task 5):
```swift
struct WorkspaceView: View {
    @State private var draft = ""

    var body: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                WorkspaceTopBar(onHistory: {}, onNew: startNew)
                WorkspaceHome(draft: $draft, onSubmit: {})
            }
        }
        .preferredColorScheme(.dark)
    }

    private func startNew() {
        draft = ""
    }
}
```

- [ ] **Step 5: Build**

Run the standard build command. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 6: Screenshot — empty home, then tap a chip**

Install/launch, tap **Continue with Google**, screenshot the home:
```bash
xcrun simctl io booted screenshot /tmp/m2-task3-home.png
```
Read it. Expected: hero + 3 example chips + the bottom input with a dimmed send button. Then tap the "AI fitness coaching app" chip and re-screenshot:
```bash
xcrun simctl io booted screenshot /tmp/m2-task3-filled.png
```
Expected: the input now contains "AI fitness coaching app", keyboard up, send button amber/enabled.

- [ ] **Step 7: Commit**

```bash
git add PlinthsApp/PlinthsApp/Workspace/
git commit -m "feat(ios): M2 workspace home — hero, example chips, idea input"
```

---

## Task 4: History drawer

**Files:**
- Create: `PlinthsApp/PlinthsApp/Workspace/HistoryRow.swift`
- Create: `PlinthsApp/PlinthsApp/Workspace/HistoryDrawer.swift`
- Modify: `PlinthsApp/PlinthsApp/Workspace/WorkspaceView.swift`

**Interfaces:**
- Consumes: `MockReport`, `MockWorkspace.history` (Task 1).
- Produces: `HistoryRow(report: MockReport, onSelect: () -> Void)` + static `HistoryRow.relativeDate(_ Date) -> String`; `HistoryDrawer(reports: [MockReport], onClose: () -> Void, onSelect: (MockReport) -> Void)`.

- [ ] **Step 1: Create `HistoryRow.swift`**

```swift
import SwiftUI

/// One past report in the history drawer: idea title, a saturation chip, and a
/// relative date. Tapping selects it — a stub in M2 (the report UI is M3).
struct HistoryRow: View {
    let report: MockReport
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 8) {
                Text(report.ideaText)
                    .font(Theme.Typeface.body)
                    .foregroundStyle(Theme.Stealth.text)
                    .lineLimit(1)
                HStack(spacing: 10) {
                    saturationChip
                    Text(Self.relativeDate(report.createdAt))
                        .font(Theme.Typeface.caption)
                        .foregroundStyle(Theme.Stealth.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    // Stealth keeps amber as the only color; severity reads from the number +
    // label rather than from new reds/greens.
    private var saturationChip: some View {
        Text("\(report.saturationScore) · \(report.saturationLabel)")
            .font(Theme.Typeface.badge)
            .foregroundStyle(Theme.Stealth.amber)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Theme.Stealth.amber.opacity(0.12))
            .clipShape(.capsule)
    }

    static func relativeDate(_ date: Date) -> String {
        let seconds = -date.timeIntervalSinceNow
        let hours = seconds / 3600
        if hours < 1 { return "just now" }
        if hours < 24 { return "\(Int(hours))h ago" }
        let days = Int(hours / 24)
        if days == 1 { return "yesterday" }
        return "\(days)d ago"
    }
}

#Preview {
    VStack(spacing: 0) {
        ForEach(MockWorkspace.history) { report in
            HistoryRow(report: report, onSelect: {}).padding(16)
            Divider()
        }
    }
    .background(Theme.Stealth.skyMid)
    .preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Create `HistoryDrawer.swift`**

> **Superseded by the final build:** the scrim + leading-panel push-aside below
> was the plan. The shipped `HistoryDrawer` keeps its name and list body but
> drops the scrim/panel/`onClose` — `WorkspaceView` presents it as a standard
> `.sheet` (see the Step 3 note). Code below is the historical plan, not the
> shipped code.

```swift
import SwiftUI

/// The slide-in history panel: a tappable scrim plus a leading panel listing
/// mock past reports. Selecting a row is a stub in M2 (the report UI is M3).
struct HistoryDrawer: View {
    let reports: [MockReport]
    let onClose: () -> Void
    let onSelect: (MockReport) -> Void

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Color.black.opacity(0.45)
                    .ignoresSafeArea()
                    .onTapGesture(perform: onClose)
                    .accessibilityLabel("Close history")

                panel
                    .frame(width: min(geo.size.width * 0.82, 340))
                    .frame(maxHeight: .infinity, alignment: .top)
                    .background(Theme.Stealth.skyMid)
                    .ignoresSafeArea(edges: .vertical)
            }
        }
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("HISTORY")
                .font(Theme.Typeface.label)
                .foregroundStyle(Theme.Stealth.textSecondary)
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 16)

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(reports) { report in
                        HistoryRow(report: report) { onSelect(report) }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 14)
                        Divider().overlay(Theme.Stealth.textSecondary.opacity(0.15))
                    }
                }
            }
        }
    }
}

#Preview {
    HistoryDrawer(reports: MockWorkspace.history, onClose: {}, onSelect: { _ in })
        .preferredColorScheme(.dark)
}
```

- [ ] **Step 3: Modify `WorkspaceView.swift` — wire the drawer**

> **Superseded by the final build:** the `ZStack` overlay + `.transition(.move)`
> below was the plan. The shipped `WorkspaceView` presents history via
> `.sheet(isPresented: $isHistoryOpen)` with
> `.presentationBackground(Theme.Stealth.skyTop)` — no overlay, `zIndex`, or
> move-edge transition. The custom push-aside was dropped for fighting the safe
> area; see `WorkspaceView.swift` and `PlinthsApp/SETUP.md`. Code below is the
> historical plan.

Replace the whole struct with (adds `isHistoryOpen` + `reduceMotion` + drawer overlay):
```swift
struct WorkspaceView: View {
    @State private var draft = ""
    @State private var isHistoryOpen = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                WorkspaceTopBar(onHistory: { isHistoryOpen = true }, onNew: startNew)
                WorkspaceHome(draft: $draft, onSubmit: {})
            }

            if isHistoryOpen {
                HistoryDrawer(
                    reports: MockWorkspace.history,
                    onClose: { isHistoryOpen = false },
                    onSelect: { _ in isHistoryOpen = false }
                )
                .transition(reduceMotion ? .opacity : .move(edge: .leading).combined(with: .opacity))
                .zIndex(1)
            }
        }
        .preferredColorScheme(.dark)
        .animation(.easeOut(duration: 0.28), value: isHistoryOpen)
    }

    private func startNew() {
        draft = ""
        isHistoryOpen = false
    }
}
```

- [ ] **Step 4: Build**

Run the standard build command. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Screenshot — open the drawer**

Install/launch, tap **Continue with Google**, tap the `☰` button, screenshot:
```bash
xcrun simctl io booted screenshot /tmp/m2-task4-drawer.png
```
Read it. Expected: a left panel headed `HISTORY` over a dimmed scrim, listing the 4 mock reports, each with an amber "score · label" chip and a relative date ("2h ago", "yesterday", "2d ago", "5d ago").

- [ ] **Step 6: Commit**

```bash
git add PlinthsApp/PlinthsApp/Workspace/
git commit -m "feat(ios): M2 history drawer with mock past reports"
```

---

## Task 5: Pipeline-loading screen + submit wiring

**Files:**
- Create: `PlinthsApp/PlinthsApp/Workspace/PipelineLoadingView.swift`
- Modify: `PlinthsApp/PlinthsApp/Workspace/WorkspaceView.swift`

**Interfaces:**
- Consumes: `PipelineStage.all / .totalSeconds / .stage(at:)` (Task 1); `WorkspaceScreen` (Task 1).
- Produces: `PipelineLoadingView(idea: String, onCancel: () -> Void)`.

- [ ] **Step 1: Create `PipelineLoadingView.swift`**

```swift
import SwiftUI

/// The staged pipeline-loading screen shown after submitting an idea. Mirrors
/// the web app's analysis pipeline (mock, time-driven). It runs through the
/// stages and holds on the last frame — the report UI lands in M3. Reduce
/// Motion disables the mark pulse (stage text and progress still advance).
struct PipelineLoadingView: View {
    let idea: String
    let onCancel: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(action: onCancel) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(Theme.Stealth.textSecondary)
                        .frame(width: 44, height: 44)
                        .contentShape(.rect)
                }
                .accessibilityLabel("Cancel analysis")
                Spacer()
            }
            .padding(.horizontal, 8)

            Spacer()

            TimelineView(.animation) { timeline in
                let elapsed = timeline.date.timeIntervalSince(start)
                let stage = PipelineStage.stage(at: elapsed)
                let progress = min(elapsed / PipelineStage.totalSeconds, 1.0)

                VStack(spacing: 24) {
                    PlinthsMark(height: 84, color: Theme.Stealth.amber)
                        .opacity(reduceMotion ? 1 : pulse(elapsed))

                    VStack(spacing: 8) {
                        Text(stage.label)
                            .font(Theme.Typeface.title)
                            .foregroundStyle(Theme.Stealth.text)
                        Text(stage.description)
                            .font(Theme.Typeface.caption)
                            .foregroundStyle(Theme.Stealth.textSecondary)
                            .multilineTextAlignment(.center)
                    }

                    progressBar(progress)
                }
            }

            Spacer()

            Text("\u{201C}\(idea)\u{201D}")
                .font(Theme.Typeface.caption)
                .foregroundStyle(Theme.Stealth.textSecondary.opacity(0.7))
                .lineLimit(1)
                .padding(.bottom, 24)
        }
        .padding(.horizontal, 20)
        .onAppear { start = Date() }
    }

    private func pulse(_ elapsed: Double) -> Double {
        0.6 + 0.4 * (0.5 + 0.5 * sin(elapsed * 2))
    }

    private func progressBar(_ progress: Double) -> some View {
        ZStack(alignment: .leading) {
            Capsule().fill(Theme.Stealth.textSecondary.opacity(0.2))
            GeometryReader { geo in
                Capsule()
                    .fill(Theme.Stealth.amber)
                    .frame(width: geo.size.width * progress)
            }
        }
        .frame(width: 200, height: 3)
    }
}

#Preview {
    PipelineLoadingView(idea: "AI fitness coaching app", onCancel: {})
        .background(DesertSkyBackground().ignoresSafeArea())
        .preferredColorScheme(.dark)
}
```

- [ ] **Step 2: Modify `WorkspaceView.swift` — add the screen switch + submit**

Replace the whole struct with (adds `screen` state, the `.home`/`.loading` switch, and `submit()`):
```swift
struct WorkspaceView: View {
    @State private var screen: WorkspaceScreen = .home
    @State private var draft = ""
    @State private var isHistoryOpen = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            DesertSkyBackground()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                WorkspaceTopBar(onHistory: { isHistoryOpen = true }, onNew: startNew)

                switch screen {
                case .home:
                    WorkspaceHome(draft: $draft, onSubmit: submit)
                case .loading:
                    PipelineLoadingView(idea: draft, onCancel: startNew)
                }
            }

            if isHistoryOpen {
                HistoryDrawer(
                    reports: MockWorkspace.history,
                    onClose: { isHistoryOpen = false },
                    onSelect: { _ in isHistoryOpen = false }
                )
                .transition(reduceMotion ? .opacity : .move(edge: .leading).combined(with: .opacity))
                .zIndex(1)
            }
        }
        .preferredColorScheme(.dark)
        .animation(.easeOut(duration: 0.28), value: isHistoryOpen)
        .animation(.easeInOut(duration: 0.3), value: screen)
    }

    private func submit() {
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        screen = .loading
    }

    private func startNew() {
        draft = ""
        screen = .home
        isHistoryOpen = false
    }
}
```

- [ ] **Step 3: Build**

Run the standard build command. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Screenshot — submit an idea, catch a mid-pipeline frame**

Install/launch, tap **Continue with Google**, tap the "AI fitness coaching app" chip (fills the input), tap **send**, then screenshot during the animation:
```bash
xcrun simctl io booted screenshot /tmp/m2-task5-loading.png
```
Read it. Expected: the Plinths mark above a stage label (e.g. "Web Research" / "Analysing landscape"), its description, an amber progress line partway across, and the quoted idea at the bottom. Tapping the back chevron returns to the home.

- [ ] **Step 5: Commit**

```bash
git add PlinthsApp/PlinthsApp/Workspace/
git commit -m "feat(ios): M2 pipeline-loading screen + submit wiring"
```

---

## Task 6: Docs & SETUP refresh

**Files:**
- Modify: `PlinthsApp/SETUP.md`

**Interfaces:** none.

- [ ] **Step 1: Update the project-structure tree in `SETUP.md`**

Add the new `Workspace/` and `Models/` folders to the structure block (under the existing `Splash/` entry), e.g.:
```text
  Workspace/
    WorkspaceView.swift        # signed-in root (home / loading + drawer)
    WorkspaceTopBar.swift      # ☰ history · plinths · ⊕ new
    WorkspaceHome.swift        # hero + example chips + idea input
    IdeaInputBar.swift         # bottom-docked text + send
    ExampleIdeaChip.swift      # one tappable sample idea
    HistoryDrawer.swift        # slide-in past-reports panel
    HistoryRow.swift           # one past-report row
    PipelineLoadingView.swift  # staged loading animation
  Models/
    WorkspaceScreen.swift      # home / loading enum
    PipelineStage.swift        # mock analysis stages
    MockWorkspace.swift        # example ideas + mock history
```

- [ ] **Step 2: Update the `## Status` section**

Replace the status body with:
```text
Milestone 2 complete: post-login workspace shell — sign in enters a dark
Stealth-Desert workspace (top bar, hero, example-idea chips, idea input),
a slide-in history drawer of mock past reports, and a staged pipeline-loading
animation on submit. All mock data (ported from the web app's mockData.ts).
Auth is still mock; the report UI (M3), real API (M4), and real auth (M5)
are next.
```

- [ ] **Step 3: Commit**

```bash
git add PlinthsApp/SETUP.md
git commit -m "docs(ios): refresh SETUP for the M2 workspace shell"
```

---

## Self-Review

**Spec coverage:**
- App session switch (signed-out↔signed-in, mock auth) → Task 2 ✓
- Top bar (☰ / wordmark / ⊕), no Discover/Spaces → Task 2 ✓
- Home hero + sub-line → Tasks 2 (placeholder) / 3 (real) ✓
- Example-idea chips (fill, not submit) → Task 3 ✓
- Idea input, text + send only, no Model/＋ → Task 3 ✓
- History + rows (amber-only saturation chip, relative date, select stub) → Task 4 ✓ *(shipped as a `.sheet`, not the planned push-aside drawer)*
- Submit → staged pipeline-loading, holds on last frame, Reduce Motion → Task 5 ✓
- Theme.Stealth tokens only, no new colors → enforced in every component ✓
- Accessibility (labels, 44pt, Reduce Motion, Dynamic Type) → in each component ✓
- SETUP refresh → Task 6 ✓

**Placeholder scan:** No "TBD/TODO" steps; every code step ships complete code. The Task 2 "placeholder home" is intentional, explicitly replaced in Task 3.

**Type consistency:** `WorkspaceView()` no-arg throughout; `WorkspaceHome(draft:onSubmit:)`, `IdeaInputBar(draft:onSubmit:isFocused:)`, `WorkspaceTopBar(onHistory:onNew:)`, `HistoryDrawer(reports:onClose:onSelect:)`, `HistoryRow(report:onSelect:)`, `PipelineLoadingView(idea:onCancel:)`, `SplashSignInView(onSignIn:)`, `SplashSignInControls(onSignIn:)` — names and signatures match across the tasks that define and consume them. `PipelineStage.stage(at:)` / `.totalSeconds` / `.all` match Task 1 ↔ Task 5. `MockWorkspace.exampleIdeas` / `.history` and `MockReport.{saturationScore,saturationLabel,createdAt,ideaText}` match Task 1 ↔ Tasks 3/4.
