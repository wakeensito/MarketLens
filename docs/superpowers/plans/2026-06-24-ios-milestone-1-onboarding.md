# iOS Milestone 1 — Onboarding → Login Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native SwiftUI onboarding flow — three swipeable "offer" pages ending at a login prompt — using mock data only, as the first screen of the Plinths iOS app and the user's first SwiftUI build.

**Architecture:** A single `OnboardingFlow` view drives a 4-page `TabView` (`.page` style). Pages 1–3 reuse one `OnboardingPage` view fed by an `OfferPage` data array; page 4 is `LoginPromptView` with stubbed buttons. All colors and fonts come from a `Theme` design-system file ported from the web app's Pale Intelligence palette. No networking, no auth, no real navigation.

**Tech Stack:** Swift 6.2, SwiftUI, Xcode 26.3, iOS 26.2 deployment target. IBM Plex fonts bundled via `UIAppFonts`. No third-party packages.

## Global Constraints

- **Platform:** iOS 26.2 deployment target, Swift 6.2+, SwiftUI only — no UIKit unless unavoidable.
- **No third-party frameworks.** Standard library + Apple SDKs only.
- **One type per file.** Each `struct`/`enum` gets its own `.swift` file (swiftui-pro convention).
- **Feature-based folders.** Group files by feature: `DesignSystem/`, `Onboarding/`, `Resources/Fonts/`.
- **Modern API only:** use `foregroundStyle()` not `foregroundColor()`; `Button("Label", systemImage:)` for icon buttons; `@State` + `.onChange` not `Binding(get:set:)`.
- **Design tokens (light theme), exact hex:** `bg #FAF9F6` · `surface #F5F3EF` · `text #1A1C1E` · `textSecondary #6C6F73` · `signal #5C4A38` · `logoAccent #C68A4E`.
- **Copy, verbatim:** Page 1 headline `Type an idea.` sub `Describe any business idea in a sentence.` · Page 2 `See the landscape.` sub `Competitors, gaps, and a saturation score in seconds.` · Page 3 `Get your entry plan.` sub `A concrete roadmap for breaking in.` · Login `Log in to start.` button `Log in` secondary `Skip for now`. Wordmark `plinths` + badge `Beta`.
- **Verification model:** No XCTest target in M1 (pure UI). Each task verifies via `xcodebuild` compile (BUILD SUCCEEDED) + visual observation in the iOS Simulator. The swiftui-pro skill reviews the finished code in the final task.
- **Project uses file-system-synchronized groups:** creating a `.swift` file inside `PlinthsApp/PlinthsApp/` automatically adds it to the build — no manual Xcode "add to target" step.

**Reusable build command** (referenced as `[BUILD]` below):
```bash
cd /Users/wakeensito/Plinths/PlinthsApp
xcodebuild -project PlinthsApp.xcodeproj -scheme PlinthsApp \
  -destination 'generic/platform=iOS Simulator' build 2>&1 | tail -5
```
Expected on success: a line containing `** BUILD SUCCEEDED **`.

---

## File Structure

```
PlinthsApp/PlinthsApp/
  PlinthsAppApp.swift            # entry point — shows OnboardingFlow (modified)
  DesignSystem/
    Color+Hex.swift             # Color(hex:) initializer
    Theme.swift                 # Palette (colors) + Typeface (font helpers)
  Onboarding/
    OfferPage.swift             # data model + the 3 offer pages
    OnboardingPage.swift        # reusable single offer-page view
    LoginPromptView.swift       # page 4: wordmark + stubbed buttons
    OnboardingFlow.swift        # 4-page TabView container + Skip
  Resources/Fonts/
    IBMPlexSerif-Medium.ttf     # added in Task 6
    IBMPlexSans-Regular.ttf
    IBMPlexSans-SemiBold.ttf
    IBMPlexMono-Medium.ttf
PlinthsApp/SETUP.md             # toolchain/setup doc (Task 7)
```
`ContentView.swift` (Xcode default) is **deleted** in Task 5 once `OnboardingFlow` replaces it.

---

### Task 1: Color hex initializer

**Files:**
- Create: `PlinthsApp/PlinthsApp/DesignSystem/Color+Hex.swift`

**Interfaces:**
- Produces: `Color(hex: String)` — accepts a 6-digit hex like `"FAF9F6"` or `"#FAF9F6"`, returns an sRGB `Color`.

- [ ] **Step 1: Create the folder and file**

```bash
mkdir -p /Users/wakeensito/Plinths/PlinthsApp/PlinthsApp/DesignSystem
```

- [ ] **Step 2: Write `Color+Hex.swift`**

```swift
import SwiftUI

extension Color {
    /// Creates a Color from a 6-digit hex string such as "FAF9F6".
    /// A leading "#" is ignored. Invalid input falls back to black.
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        let red = Double((value & 0xFF0000) >> 16) / 255.0
        let green = Double((value & 0x00FF00) >> 8) / 255.0
        let blue = Double(value & 0x0000FF) / 255.0
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: 1.0)
    }
}
```

- [ ] **Step 3: Build to verify it compiles**

Run `[BUILD]`. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
cd /Users/wakeensito/Plinths
git add PlinthsApp/PlinthsApp/DesignSystem/Color+Hex.swift
git commit -m "feat(ios): add Color(hex:) initializer"
```

---

### Task 2: Theme (palette + typeface helpers)

**Files:**
- Create: `PlinthsApp/PlinthsApp/DesignSystem/Theme.swift`

**Interfaces:**
- Consumes: `Color(hex:)` from Task 1.
- Produces:
  - `Theme.Palette.bg / surface / text / textSecondary / signal / logoAccent` → `Color`
  - `Theme.Typeface.serif(_ size: CGFloat) -> Font`
  - `Theme.Typeface.body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font`
  - `Theme.Typeface.mono(_ size: CGFloat) -> Font`
- Note: typeface helpers return **system fonts** in this task (`.serif` / `.monospaced` designs). Task 6 swaps their bodies to bundled IBM Plex with no change to call sites.

- [ ] **Step 1: Write `Theme.swift`**

```swift
import SwiftUI

/// The Plinths design system, ported from the web app's Pale Intelligence palette.
/// Single source of truth for all colors and fonts in the iOS app.
enum Theme {
    enum Palette {
        static let bg = Color(hex: "FAF9F6")
        static let surface = Color(hex: "F5F3EF")
        static let text = Color(hex: "1A1C1E")
        static let textSecondary = Color(hex: "6C6F73")
        static let signal = Color(hex: "5C4A38")
        static let logoAccent = Color(hex: "C68A4E")
    }

    enum Typeface {
        // System fonts for now. Task 6 replaces these with bundled IBM Plex.
        static func serif(_ size: CGFloat) -> Font {
            .system(size: size, weight: .medium, design: .serif)
        }
        static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
            .system(size: size, weight: weight, design: .default)
        }
        static func mono(_ size: CGFloat) -> Font {
            .system(size: size, weight: .medium, design: .monospaced)
        }
    }
}
```

- [ ] **Step 2: Build to verify**

Run `[BUILD]`. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
cd /Users/wakeensito/Plinths
git add PlinthsApp/PlinthsApp/DesignSystem/Theme.swift
git commit -m "feat(ios): add Theme palette and typeface helpers"
```

---

### Task 3: Offer page model + single-page view

**Files:**
- Create: `PlinthsApp/PlinthsApp/Onboarding/OfferPage.swift`
- Create: `PlinthsApp/PlinthsApp/Onboarding/OnboardingPage.swift`

**Interfaces:**
- Consumes: `Theme.Palette`, `Theme.Typeface` from Task 2.
- Produces:
  - `struct OfferPage: Identifiable` with `id`, `symbol: String`, `headline: String`, `subtext: String`, and `static let all: [OfferPage]` (exactly 3).
  - `struct OnboardingPage: View` initialized as `OnboardingPage(page: OfferPage)`.

- [ ] **Step 1: Create the folder**

```bash
mkdir -p /Users/wakeensito/Plinths/PlinthsApp/PlinthsApp/Onboarding
```

- [ ] **Step 2: Write `OfferPage.swift`**

```swift
import Foundation

/// One onboarding "offer" page — the promise shown before login.
struct OfferPage: Identifiable {
    let id = UUID()
    let symbol: String      // SF Symbol name (placeholder art for M1)
    let headline: String
    let subtext: String

    /// The three offer pages, in order: idea -> landscape -> plan.
    static let all: [OfferPage] = [
        OfferPage(
            symbol: "lightbulb",
            headline: "Type an idea.",
            subtext: "Describe any business idea in a sentence."
        ),
        OfferPage(
            symbol: "chart.bar.xaxis",
            headline: "See the landscape.",
            subtext: "Competitors, gaps, and a saturation score in seconds."
        ),
        OfferPage(
            symbol: "map",
            headline: "Get your entry plan.",
            subtext: "A concrete roadmap for breaking in."
        ),
    ]
}
```

- [ ] **Step 3: Write `OnboardingPage.swift`**

```swift
import SwiftUI

/// Renders a single offer page: glyph, serif headline, secondary subtext.
struct OnboardingPage: View {
    let page: OfferPage

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: page.symbol)
                .font(.system(size: 64))
                .foregroundStyle(Theme.Palette.signal)
                .accessibilityHidden(true)

            Text(page.headline)
                .font(Theme.Typeface.serif(34))
                .foregroundStyle(Theme.Palette.text)

            Text(page.subtext)
                .font(Theme.Typeface.body(17))
                .foregroundStyle(Theme.Palette.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    OnboardingPage(page: OfferPage.all[0])
        .background(Theme.Palette.bg)
}
```

- [ ] **Step 4: Build to verify**

Run `[BUILD]`. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
cd /Users/wakeensito/Plinths
git add PlinthsApp/PlinthsApp/Onboarding/OfferPage.swift PlinthsApp/PlinthsApp/Onboarding/OnboardingPage.swift
git commit -m "feat(ios): add offer-page model and single-page view"
```

---

### Task 4: Login prompt view (page 4)

**Files:**
- Create: `PlinthsApp/PlinthsApp/Onboarding/LoginPromptView.swift`

**Interfaces:**
- Consumes: `Theme.Palette`, `Theme.Typeface`.
- Produces: `struct LoginPromptView: View` (no parameters). Buttons are stubs that `print(...)`.

- [ ] **Step 1: Write `LoginPromptView.swift`**

```swift
import SwiftUI

/// The final onboarding page: brand wordmark + a stubbed login prompt.
/// Real authentication arrives in a later milestone; buttons only print for now.
struct LoginPromptView: View {
    var body: some View {
        VStack(spacing: 28) {
            wordmark

            Text("Log in to start.")
                .font(Theme.Typeface.serif(24))
                .foregroundStyle(Theme.Palette.text)

            Button {
                print("login tapped")
            } label: {
                Text("Log in")
                    .font(Theme.Typeface.body(17, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Theme.Palette.text)
                    .foregroundStyle(Theme.Palette.bg)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Button("Skip for now") {
                print("skip tapped")
            }
            .font(Theme.Typeface.mono(13))
            .foregroundStyle(Theme.Palette.textSecondary)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var wordmark: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("plinths")
                .font(Theme.Typeface.mono(28))
                .foregroundStyle(Theme.Palette.logoAccent)
            Text("Beta")
                .font(Theme.Typeface.mono(11))
                .foregroundStyle(Theme.Palette.textSecondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Theme.Palette.surface)
                .clipShape(Capsule())
        }
    }
}

#Preview {
    LoginPromptView()
        .background(Theme.Palette.bg)
}
```

- [ ] **Step 2: Build to verify**

Run `[BUILD]`. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
cd /Users/wakeensito/Plinths
git add PlinthsApp/PlinthsApp/Onboarding/LoginPromptView.swift
git commit -m "feat(ios): add stubbed login prompt page"
```

---

### Task 5: Onboarding flow container + wire into app

**Files:**
- Create: `PlinthsApp/PlinthsApp/Onboarding/OnboardingFlow.swift`
- Modify: `PlinthsApp/PlinthsApp/PlinthsAppApp.swift`
- Delete: `PlinthsApp/PlinthsApp/ContentView.swift`

**Interfaces:**
- Consumes: `OfferPage.all`, `OnboardingPage`, `LoginPromptView`, `Theme.Palette`.
- Produces: `struct OnboardingFlow: View` — the app's root view.

- [ ] **Step 1: Write `OnboardingFlow.swift`**

```swift
import SwiftUI

/// Root onboarding experience: three swipeable offer pages followed by the
/// login prompt. A Skip button (visible only on the offer pages) jumps to login.
struct OnboardingFlow: View {
    @State private var page = 0
    private let pages = OfferPage.all

    /// Index of the login page (last tab).
    private var loginIndex: Int { pages.count }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Theme.Palette.bg.ignoresSafeArea()

            TabView(selection: $page) {
                ForEach(Array(pages.enumerated()), id: \.element.id) { index, offer in
                    OnboardingPage(page: offer)
                        .tag(index)
                }
                LoginPromptView()
                    .tag(loginIndex)
            }
            .tabViewStyle(.page)
            .indexViewStyle(.page(backgroundDisplayMode: .always))

            if page < loginIndex {
                Button("Skip") {
                    withAnimation { page = loginIndex }
                }
                .font(Theme.Typeface.mono(15))
                .foregroundStyle(Theme.Palette.textSecondary)
                .padding(24)
            }
        }
    }
}

#Preview {
    OnboardingFlow()
}
```

- [ ] **Step 2: Replace `PlinthsAppApp.swift` body to show `OnboardingFlow`**

```swift
import SwiftUI

@main
struct PlinthsAppApp: App {
    var body: some Scene {
        WindowGroup {
            OnboardingFlow()
        }
    }
}
```

- [ ] **Step 3: Delete the default ContentView**

```bash
rm /Users/wakeensito/Plinths/PlinthsApp/PlinthsApp/ContentView.swift
```

- [ ] **Step 4: Build to verify**

Run `[BUILD]`. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Run in the Simulator and observe**

In Xcode, select an iPhone simulator and press ▶ (or run `[BUILD]` swapped to a concrete `-destination 'platform=iOS Simulator,name=iPhone 16'` + `xcrun simctl`). Observe:
- Three pages swipe horizontally; page dots track position.
- "Skip" (top-right) is visible on pages 1–3 and jumps to the login page.
- Login page shows `plinths` + `Beta`, a dark "Log in" button, and "Skip for now".
- Tapping "Log in" prints `login tapped`; "Skip for now" prints `skip tapped` (Debug Console).

- [ ] **Step 6: Commit**

```bash
cd /Users/wakeensito/Plinths
git add PlinthsApp/PlinthsApp/Onboarding/OnboardingFlow.swift PlinthsApp/PlinthsApp/PlinthsAppApp.swift
git add -A PlinthsApp/PlinthsApp/ContentView.swift
git commit -m "feat(ios): assemble onboarding flow and wire as app root"
```

---

### Task 6: Bundle IBM Plex fonts + swap Theme to use them

**Files:**
- Create: `PlinthsApp/PlinthsApp/Resources/Fonts/*.ttf` (4 files)
- Modify: `PlinthsApp/PlinthsApp/DesignSystem/Theme.swift` (Typeface bodies only)
- Modify: target Info settings — add `UIAppFonts` (Xcode GUI step)

**Interfaces:**
- Produces: same `Theme.Typeface` API as Task 2, now backed by IBM Plex custom fonts.

- [ ] **Step 1: Download the four font files**

```bash
mkdir -p /Users/wakeensito/Plinths/PlinthsApp/PlinthsApp/Resources/Fonts
cd /Users/wakeensito/Plinths/PlinthsApp/PlinthsApp/Resources/Fonts
BASE="https://github.com/google/fonts/raw/main/ofl"
curl -fL "$BASE/ibmplexserif/IBMPlexSerif-Medium.ttf"   -o IBMPlexSerif-Medium.ttf
curl -fL "$BASE/ibmplexsans/IBMPlexSans-Regular.ttf"    -o IBMPlexSans-Regular.ttf
curl -fL "$BASE/ibmplexsans/IBMPlexSans-SemiBold.ttf"   -o IBMPlexSans-SemiBold.ttf
curl -fL "$BASE/ibmplexmono/IBMPlexMono-Medium.ttf"     -o IBMPlexMono-Medium.ttf
```

- [ ] **Step 2: Verify the downloads are real TrueType fonts**

```bash
cd /Users/wakeensito/Plinths/PlinthsApp/PlinthsApp/Resources/Fonts
file *.ttf
```
Expected: each line says `TrueType Font` (or `TrueType font data`). If any file is HTML/empty (a 404), the path moved — find the file under `github.com/google/fonts/tree/main/ofl/ibmplexserif` (or `IBM/plex` releases) and re-download before continuing.

- [ ] **Step 3: Register the fonts in the target's Info (Xcode GUI)**

This project uses a generated Info.plist, so add the key through Xcode:
1. Select the **PlinthsApp** project in the navigator → **PlinthsApp** target → **Info** tab.
2. Under **Custom iOS Target Properties**, hover any row, click **+**.
3. Add key **"Fonts provided by application"** (`UIAppFonts`), type Array.
4. Add four String items, each the exact filename:
   `IBMPlexSerif-Medium.ttf`, `IBMPlexSans-Regular.ttf`, `IBMPlexSans-SemiBold.ttf`, `IBMPlexMono-Medium.ttf`.

- [ ] **Step 4: Confirm the exact PostScript names the system registered**

Temporarily add this to `OnboardingFlow`'s `body` `.onAppear` (or run once), then read the Debug Console:

```swift
.onAppear {
    for family in UIFont.familyNames where family.contains("Plex") {
        print(family, UIFont.fontNames(forFamilyName: family))
    }
}
```
Expected output includes names like `IBMPlexSerif-Medium`, `IBMPlexSans`, `IBMPlexSans-SemiBold`, `IBMPlexMono-Medium`. **Use the exact strings printed** in Step 5. (Classic gotcha: the PostScript name often differs from the filename — Regular weights frequently drop the suffix, e.g. `IBMPlexSans`.) Remove this `.onAppear` after noting the names.

- [ ] **Step 5: Swap `Theme.Typeface` bodies to the custom fonts**

Replace only the `Typeface` enum in `Theme.swift` with (substitute any name corrected from Step 4):

```swift
    enum Typeface {
        static func serif(_ size: CGFloat) -> Font {
            .custom("IBMPlexSerif-Medium", size: size)
        }
        static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
            .custom(weight >= .semibold ? "IBMPlexSans-SemiBold" : "IBMPlexSans", size: size)
        }
        static func mono(_ size: CGFloat) -> Font {
            .custom("IBMPlexMono-Medium", size: size)
        }
    }
```

- [ ] **Step 6: Build and run; confirm fonts changed**

Run `[BUILD]` (Expected: `** BUILD SUCCEEDED **`), then run in the Simulator. Observe: headlines are now a serif (IBM Plex Serif), the wordmark is IBM Plex Mono — visibly different from the earlier system fonts. If text still looks like the system font, the `.custom` name is wrong → recheck Step 4's printed names.

- [ ] **Step 7: Commit**

```bash
cd /Users/wakeensito/Plinths
git add PlinthsApp/PlinthsApp/Resources/Fonts PlinthsApp/PlinthsApp/DesignSystem/Theme.swift PlinthsApp/PlinthsApp.xcodeproj/project.pbxproj
git commit -m "feat(ios): bundle IBM Plex fonts and use them in Theme"
```

---

### Task 7: swiftui-pro review pass + setup doc

**Files:**
- Modify: any files flagged by the review
- Create: `PlinthsApp/SETUP.md`

- [ ] **Step 1: Run the swiftui-pro review**

Invoke the `swiftui-pro:swiftui-pro` skill against the files under `PlinthsApp/PlinthsApp/`. Apply genuine fixes (deprecated APIs, accessibility, data flow). Skip non-issues — do not invent problems.

- [ ] **Step 2: Re-build after any fixes**

Run `[BUILD]`. Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Write `PlinthsApp/SETUP.md`**

```markdown
# PlinthsApp — iOS Setup & Toolchain

Native SwiftUI client for Plinths. Built as a learn-Swift project and a real
App Store pipeline run.

## Toolchain
- macOS 26.3
- Xcode 26.3 (universal)
- iOS components only (no macOS/watchOS/tvOS/visionOS SDKs)
- Deployment target: iOS 26.2 · Swift 6.2
- Project uses file-system-synchronized groups (files on disk auto-join the build)

## Apple Developer account
- Free Apple ID is enough to build and run on a device (7-day provisioning) and
  in the Simulator.
- The $99/yr Apple Developer Program is **deferred** until we need TestFlight or
  App Store submission (a later milestone).

## Design system
- `DesignSystem/Theme.swift` is the single source of truth (colors + fonts),
  ported from the web app's Pale Intelligence palette (`DESIGN.md`, `index.css`).
- IBM Plex fonts (Serif/Sans/Mono) are bundled under `Resources/Fonts/` and
  registered via `UIAppFonts`.

## Quality
- SwiftUI reviewed with the `swiftui-pro` skill (twostraws), installed via the
  Claude Code plugin marketplace.
- No third-party Swift packages.

## Build from CLI
\`\`\`bash
cd PlinthsApp
xcodebuild -project PlinthsApp.xcodeproj -scheme PlinthsApp \
  -destination 'generic/platform=iOS Simulator' build
\`\`\`
```

- [ ] **Step 4: Commit**

```bash
cd /Users/wakeensito/Plinths
git add -A PlinthsApp
git commit -m "chore(ios): swiftui-pro review fixes and setup doc"
```

---

## Self-Review

**Spec coverage:**
- 3 offer pages + login prompt → Tasks 3, 4, 5 ✓
- Skip from page 1 → Task 5 (`Skip` button, `page < loginIndex`) ✓
- Pale Intelligence tokens → Tasks 1–2 ✓
- IBM Plex bundled in M1 → Task 6 ✓
- Stubbed login/skip buttons print to console → Task 4 ✓
- Page dots → Task 5 (`.indexViewStyle`) ✓
- Design-system single source of truth → `Theme.swift` ✓
- Setup doc → Task 7 ✓
- "Onboarding shows every launch (no persistence)" → satisfied by default (no persistence added) ✓
- Feature-folder structure → File Structure section ✓

**Placeholder scan:** No TBD/TODO left as work; the only `// Task 6 replaces` note in Task 2 is resolved with full code in Task 6. ✓

**Type consistency:** `OfferPage.all`, `OnboardingPage(page:)`, `LoginPromptView()`, `OnboardingFlow()`, `Theme.Palette.*`, `Theme.Typeface.serif/body/mono` are used identically across tasks. `loginIndex == pages.count` consistent. ✓

**Out of scope (per spec):** real auth, report UI, stealth theme, custom art, networking — none introduced. ✓
