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
    WorkspaceView.swift      # signed-in root (home / loading + history drawer)
    WorkspaceTopBar.swift    # ☰ history · plinths wordmark · ⊕ new
    WorkspaceHome.swift      # hero + example-idea chips + idea input
    IdeaInputBar.swift       # bottom-docked text field + amber send
    ExampleIdeaChip.swift    # one tappable sample idea
    HistoryDrawer.swift      # slide-in past-reports panel + scrim
    HistoryRow.swift         # one past-report row (saturation chip + date)
    PipelineLoadingView.swift  # staged analysis-loading animation
  Models/
    WorkspaceScreen.swift    # home / loading enum
    PipelineStage.swift      # mock analysis stages (ported from mockData.ts)
    MockWorkspace.swift      # example ideas + mock history
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
Milestone 2 complete: signing in enters a dark Stealth-Desert **workspace** —
top bar (history · wordmark · new), a hero with example-idea chips, a bottom-
docked idea input (text + send only), a slide-in **history drawer** of mock
past reports, and a staged **pipeline-loading** animation on submit (it runs and
holds — the report render is M3). All mock data, ported from the web app's
`frontend/src/mockData.ts`.

Auth is still mock — any sign-in button enters the workspace. Sign in with Apple
remains a placeholder pill; App Store guideline 4.8 requires Apple's official
`SignInWithAppleButton` once Google is offered, wired with real auth in M5.

Next milestones: report UI (M3), wire real API + add a test target (M4), real
auth (M5). See `docs/superpowers/specs/` and `docs/superpowers/plans/` for the
milestone arc.
