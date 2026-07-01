# iOS Milestone 2 — Post-Login Workspace Shell (Design)

**Date:** 2026-06-26
**Status:** Approved design, pending spec review
**Scope:** Native SwiftUI, client-only, **all mock data** (no backend). Dark
Stealth-Desert palette throughout.

## Goal

The post-login workspace shell: a calm, input-centric home where a signed-in
user describes a business idea, browses past reports in a history drawer, and —
on submit — watches a staged pipeline-loading animation. Perplexity's *restraint*
(one dominant input, minimal chrome, calm empty state) executed in Plinths'
*semantics* (a business idea → a market report) and the dark Stealth-Desert
identity established by the M1 splash.

### In scope
- Top-level session switch: signed-out splash ↔ signed-in workspace.
- Workspace home: top bar, hero prompt, example-idea chips, bottom-docked input.
- History: a list of mock past reports. *(Planned as a slide-in drawer;
  shipped as a standard SwiftUI sheet — see the HistoryDrawer note below.)*
- Submit → staged pipeline-loading animation, which runs and then stops.

### Out of scope (later milestones)
- **M3:** the report UI (scores, competitors, gaps, roadmap render).
- **M4:** wiring the real REST API + a test target.
- **M5:** real auth (Cognito + Apple IdP, official `SignInWithAppleButton`).
- Muse chat, settings, theme toggle, billing.

## Decisions (locked during brainstorming)

1. **Palette — dark Stealth-Desert** for the whole workspace. Continuity with the
   splash; distinct from Perplexity's generic light. `Theme.Stealth` already
   exists; **no new colors** are introduced.
2. **Scope — shell only.** Home + history drawer + submit→loading. Report render
   is M3.
3. **No Discover/Spaces tabs.** Plinths has neither surface; empty tabs read as
   unfinished.
4. **Input bar is text + send only.** The `Model` picker and `＋` attach button
   from Perplexity are **cut** — Plinths has no user-facing model selection
   (Max-only, unimplemented; app is free during beta) and no file attachments.
   Both would be dead affordances.
5. **No cinematic transitions.** Splash↔workspace and home↔loading are plain
   crossfades, consistent with the locked "plain mount/unmount" ethos.

## Architecture

### App-level session switch
`PlinthsAppApp` gains a single `@State private var isSignedIn = false`. Body:
- `false` → `SplashSignInView` (unchanged layout).
- `true` → `WorkspaceView`.
- Swap is a `.transition(.opacity)` crossfade.

`SplashSignInControls`' three handlers (`handleGoogle` / `handleApple` /
`handleEmail`) currently `print`. M2 routes them to a single `onSignIn` closure
passed down from the app, which sets `isSignedIn = true`. **Mock auth: any
sign-in button enters the workspace.** No credential flow until M5. The MOCK /
4.8 comment on the Apple button stays.

### Workspace view state
```swift
enum WorkspaceScreen { case home, loading }
```
`WorkspaceView` owns:
- `@State private var screen: WorkspaceScreen = .home`
- `@State private var isHistoryOpen = false`
- `@State private var draft = ""`  // the idea text being composed

Layout is a `ZStack`: `DesertSkyBackground` (reused from the splash, no particle
field — the workspace is a working surface, not a showcase) + the active screen +
the history drawer overlay.

## Components (one type per file, per swiftui-pro)

```text
PlinthsApp/PlinthsApp/
  Workspace/
    WorkspaceView.swift        # signed-in root; owns screen + drawer state
    WorkspaceTopBar.swift      # ☰ history · plinths wordmark · ⊕ new
    WorkspaceHome.swift        # hero + example chips (composes IdeaInputBar)
    IdeaInputBar.swift         # bottom-docked text field + amber send
    ExampleIdeaChip.swift      # one tappable sample idea
    HistoryDrawer.swift        # past-reports list (presented as a sheet)
    HistoryRow.swift           # one past-report row
    PipelineLoadingView.swift  # staged loading animation
  Models/
    WorkspaceScreen.swift      # enum { home, loading }
    PipelineStage.swift        # stage model + the ordered stage list
    MockWorkspace.swift        # example ideas + mock past reports
```

### WorkspaceTopBar
Three slots, fixed at the top inside the safe area:
- **Left** `☰` (lucide-equivalent SF Symbol `line.3.horizontal`) → toggles
  `isHistoryOpen`.
- **Center** `plinths` wordmark (`Theme.Typeface.wordmark`, `Theme.Stealth.text`).
- **Right** `⊕` (`plus`) → resets to a fresh `.home` with empty `draft` and
  closes the drawer.

Icon buttons use `Theme.Stealth.textSecondary`, min 44×44 tap target.

### WorkspaceHome
Centered column:
- **Hero** — serif `What are you building?` (`Theme.Typeface.title`,
  `Theme.Stealth.text`).
- **Sub** — mono `Describe an idea to map its competitive landscape.`
  (`Theme.Typeface.caption`, `Theme.Stealth.textSecondary`).
- **Example chips** — 3 `ExampleIdeaChip`s from `MockWorkspace.exampleIdeas`.
  Tap sets `draft` to that text and focuses the input (does **not** auto-submit).
- Pushes `IdeaInputBar` to the bottom via a `Spacer`.

### ExampleIdeaChip
A capsule: mono text, `Theme.Stealth.amber` 0.55 border (matches
`SplashPillButton`), `Theme.Stealth.sand` text. `let title: String; let action`.

### IdeaInputBar
Bottom-docked, above the home indicator:
- A rounded container (`Theme.Stealth.skyMid` fill, hairline amber border).
- `TextField("Describe your idea…", text: $draft, axis: .vertical)` —
  `Theme.Typeface.body`, `Theme.Stealth.text`, 1–4 lines.
- An amber circular **send** button (`arrow.up`) trailing. Disabled (dimmed) when
  `draft` is empty/whitespace; enabled → calls `onSubmit`.
- **No `＋`, no `Model` chip.**
- Binds a `@FocusState` so example chips can focus it.

### HistoryDrawer
> **Superseded in the final build:** the slide-in-drawer-over-scrim below was
> the plan; the shipped `WorkspaceView` presents `HistoryDrawer` as a standard
> SwiftUI sheet (`.sheet(isPresented:)` + `.presentationBackground(...)`). The
> custom push-aside interaction was dropped after it fought the safe area; the
> type keeps its name and its list body. See `WorkspaceView.swift` and
> `PlinthsApp/SETUP.md`.

- A left panel (~82% width, max ~340pt) over a tappable scrim
  (`Color.black.opacity(0.45)`).
- Slides in from the leading edge (`.transition(.move(edge: .leading))`),
  honoring Reduce Motion (no slide, just fade).
- Header: mono uppercase `HISTORY`.
- A `ScrollView` of `HistoryRow`s from `MockWorkspace.history`.
- Tapping a row is a **stub** in M2 (closes the drawer; opening the report is
  M3). Tapping the scrim or `⊕` closes it.

### HistoryRow
`let report: MockReport`. Renders:
- Idea title (`Theme.Typeface.body`, one line, truncating).
- A **saturation chip**: the score number in a pill colored by the standard rule
  — `≤40` → `success`, `≤65` → `warning`, `>65` → `danger` (Stealth equivalents;
  in Stealth the single accent is amber, so the chip uses score-driven opacity of
  amber plus a label, avoiding inventing greens/reds that aren't in the Stealth
  palette — see Open question 1).
- A relative date (`Theme.Typeface.caption`, `textSecondary`), e.g. "2h ago",
  "yesterday", "5d ago", computed from `createdAt`.

### PipelineLoadingView
`let idea: String`. Replaces the home on submit:
- The `PlinthsMark` centered, with a soft amber pulse (Reduce Motion → static).
- The current stage label (serif) + its description (mono) beneath, e.g.
  `Analysing landscape` / `LLM deep-dive on competitive positioning & moats`.
- A thin progress line (amber) advancing across the bottom.
- Drives a **time-based mock progression** through `PipelineStage.all` using a
  `TimelineView(.animation)` against a captured start `Date`; the three parallel
  "Web Research" stages collapse into one displayed group. After the final stage
  it **holds on the last frame** (no report — that's M3). A `Cancel`/back
  affordance returns to `.home`.

## Models & mock data (ported from the web app)

### PipelineStage (`Models/PipelineStage.swift`)
Mirror of the web's `PIPELINE_STAGE_DEFS` (`frontend/src/mockData.ts`), collapsed
for display. Fields: `id`, `label`, `description`, `startMs`, `durationMs`.
Ordered list (display labels):
1. `Validating` — Sanitizing input
2. `Parsing concept` — Extracting vertical, keywords & intent
3. `Web Research` — Mapping competitors, market size & trends (collapses the 3
   parallel search stages)
4. `Analysing landscape` — Competitive positioning & moats
5. `Scoring` — Saturation & opportunity index
6. `Synthesising insights` — Summary, gaps & entry roadmap
7. `Assembling report` — Packaging the final report

Total ≈ the web's ~12s; the iOS mock may compress to ~6–8s for feel.

### MockWorkspace (`Models/MockWorkspace.swift`)
- `exampleIdeas: [String]` — ported from `EXAMPLE_QUERIES`:
  `"AI fitness coaching app"`, `"D2C supplement brand"`,
  `"SaaS for dental offices"` (show 3; the array can hold all 6).
- `struct MockReport { id, ideaText, saturationScore, saturationLabel, createdAt }`
- `history: [MockReport]` — ported from `MOCK_HISTORY`:
  - "Creator economy monetization platform" — 73 — 2h ago
  - "Sustainable food delivery platform" — 81 — yesterday
  - "B2B SaaS for construction project management" — 34 — 2d ago
  - "Pet telehealth and vet booking service" — 47 — 5d ago

## Theming

All surfaces use existing `Theme.Stealth` tokens (`skyTop`, `skyMid`, `amber`,
`text`, `textSecondary`, `sand`). No additions to `Theme.swift` unless Open
question 1 resolves toward score colors.

## Accessibility

- All icon buttons carry `accessibilityLabel`s ("Open history", "New report",
  "Send").
- Reduce Motion: drawer fades instead of sliding; the loading mark/progress hold
  static (stage text still advances).
- Dynamic Type: all text uses the `Font.custom(…relativeTo:)` roles already in
  `Theme.Typeface`.
- Tap targets ≥ 44×44.

## Verification

- `xcodebuild … build` is green.
- Simulator screenshots of: home (empty), home with draft + example tapped,
  history drawer open, and a mid-pipeline loading frame.

## Open questions

1. **Saturation chip color in Stealth.** The light theme uses green/amber/coral
   by score. Stealth's design law is "amber is the only color." Proposal: keep
   the chip amber and convey severity with the **number + label** (e.g. "73 ·
   Highly Saturated") rather than introducing red/green. Decide at build time;
   default to amber-only to respect the Stealth palette.
2. **Loading duration.** Web is ~12s. iOS mock proposed at ~6–8s for a snappier
   feel. Tune during build.

Neither blocks implementation; both are noted for the build plan.
