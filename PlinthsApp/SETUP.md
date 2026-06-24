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
```
PlinthsApp/PlinthsApp/
  PlinthsAppApp.swift        # entry; registers fonts, shows OnboardingFlow
  DesignSystem/
    Color+Hex.swift          # Color(hex:) initializer
    Theme.swift              # Palette (colors) + Typeface (semantic font roles)
    FontRegistrar.swift      # registers bundled fonts at launch
    BrandWordmark.swift      # reusable "plinths" + Beta wordmark
  Onboarding/
    OfferPage.swift          # data model + the 3 offer pages
    OnboardingPage.swift     # one offer page
    LoginPromptView.swift    # page 4 (stubbed login)
    OnboardingFlow.swift     # 4-page TabView + Skip
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
Milestone 1 complete: onboarding (3 offer pages) → stubbed login prompt, mock-only.
Next milestones: idea-input screen, report UI, wire real API, real auth.
See `docs/superpowers/specs/` and `docs/superpowers/plans/` for the milestone arc.
