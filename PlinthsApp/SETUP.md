# PlinthsApp — iOS Setup & Toolchain

Native SwiftUI client for Plinths. Built as a learn-Swift project and a real
App Store pipeline run. The backend (REST API on AWS) already exists; this app
is a client of it.

## Toolchain
- macOS 26.3
- Xcode 26.3 (universal), installed at `/Applications/Xcode.app`
- iOS components only (no macOS/watchOS/tvOS/visionOS SDKs)
- Deployment target: iOS 26.2 · Swift 6.2
- Project uses **file-system-synchronized groups** — any file added under
  `PlinthsApp/PlinthsApp/` is auto-included in the build (no manual "add to
  target" step).

### First-time gotcha (resolved)
Xcode was first launched from `~/Downloads`, leaving the toolchain pointed at the
Command Line Tools. Fixed by moving Xcode to `/Applications` and running:
```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

## Apple Developer account
- A free Apple ID is enough to build and run in the Simulator and on a device
  (7-day provisioning).
- The **$99/yr Apple Developer Program is deferred** until we need TestFlight or
  App Store submission (a later milestone).

## Project structure (feature folders)
```text
PlinthsApp/PlinthsApp/
  PlinthsAppApp.swift        # entry; registers fonts, switches splash ↔ workspace
  DesignSystem/
    Color+Hex.swift          # Color(hex:) initializer
    Theme.swift              # Palette + Stealth palette + Typeface (font roles)
    FontRegistrar.swift      # registers bundled fonts at launch
    PlinthsMark.swift        # native stepped-pyramid logo mark
    TypingText.swift         # typewriter reveal (honors Reduce Motion)
  Splash/
    SplashSignInView.swift   # the app-open splash + sign-in moment
    SplashSignInControls.swift # Google default + "Other options" (Apple/email)
    SplashPillButton.swift   # reusable capsule sign-in button
    DesertSkyBackground.swift  # Stealth-Desert dusk gradient backdrop
    SandParticleField.swift  # animated drifting sand motes (Canvas)
    SandMote.swift           # one mote's seed data
  Workspace/
    WorkspaceView.swift      # signed-in root (home / loading + history sheet)
    WorkspaceTopBar.swift    # ☰ history · plinths wordmark · ⊕ new
    WorkspaceHome.swift      # hero + example-idea chips + idea input
    IdeaInputBar.swift       # bottom-docked text field + amber send
    ExampleIdeaChip.swift    # one tappable sample idea
    HistoryDrawer.swift      # past-reports list (presented as a sheet)
    HistoryRow.swift         # one past-report row (saturation chip + date)
    PipelineLoadingView.swift  # staged analysis-loading animation
  Models/
    WorkspaceScreen.swift    # home / loading enum
    PipelineStage.swift      # mock analysis stages (ported from mockData.ts)
    MockWorkspace.swift      # example ideas + mock history
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
  Resources/Fonts/           # IBM Plex Serif/Sans/Mono .ttf
```

## Design system
- `DesignSystem/Theme.swift` is the single source of truth (colors + fonts),
  ported from the web app's Pale Intelligence palette (`DESIGN.md`, `index.css`).
- IBM Plex fonts are bundled under `Resources/Fonts/` and registered in code via
  `CTFontManager` (the project uses a generated Info.plist, so there is no
  `UIAppFonts` key). PostScript names matter — IBM Plex Sans SemiBold is
  `IBMPlexSans-SmBld`, not `-SemiBold`.
- Typeface roles use `Font.custom(_:size:relativeTo:)` so custom fonts scale with
  Dynamic Type.

## Quality
- SwiftUI reviewed with the `swiftui-pro` skill (twostraws), installed via the
  Claude Code plugin marketplace.
- No third-party Swift packages.

## Build & run from CLI
```bash
cd PlinthsApp
# compile check
xcodebuild -project PlinthsApp.xcodeproj -scheme PlinthsApp \
  -destination 'generic/platform=iOS Simulator' build

# run in a simulator (example: iPhone 17)
xcrun simctl boot "iPhone 17"
open -a Simulator
APP=$(find ~/Library/Developer/Xcode/DerivedData/PlinthsApp-*/Build/Products/Debug-iphonesimulator -name "PlinthsApp.app" | head -1)
xcrun simctl install booted "$APP"
xcrun simctl launch booted Plinths.PlinthsApp
```
Or just press ▶ in Xcode.

## Status
Milestone 4 complete: signing in enters a dark Stealth-Desert **workspace** —
top bar (history · wordmark · new), a hero with example-idea chips, a bottom-
docked idea input (text + send only), a **history sheet** of mock past reports
(opened from ☰), and a staged **pipeline-loading** animation on submit (it runs,
then advances to the report). All mock data, ported from the web app's
`frontend/src/mockData.ts`. On completion the loading screen now advances to a full
**Market Memo** report — hero score bands (amber-only), market size, competitors,
why-now, gaps with sourced quotes, cost to enter, an entry roadmap, and an honest
bottom line — reached on submit or by tapping a history row. Still all mock (3
fixtures); the real API lands in M7.

Each report now has a Muse conversation: tap into the docked "Ask about this
report…" composer (or the chat-bubble toggle) to open a full-screen thread of
document-pair Q/A turns — streaming answers with inline citation tokens and a
GROUNDED IN sources row. Tapping a citation flips back to the report, scrolls to
the cited cell and pulses it, with a FROM YOUR CONVERSATION banner. All mock
(3 per-report canned threads); the live SSE stream lands in M7.

Auth is still mock — any sign-in button enters the workspace. Sign in with Apple
remains a placeholder pill; App Store guideline 4.8 requires Apple's official
`SignInWithAppleButton` once Google is offered, wired with real auth in M8.

Next milestones: Build Brief + the full report/brief/muse navigation (M5),
peripheral UI — settings, theme toggle, account (M6), wire real backends + a
test target (M7), real auth (M8). See
`docs/superpowers/specs/` and `docs/superpowers/plans/` for the milestone arc.
