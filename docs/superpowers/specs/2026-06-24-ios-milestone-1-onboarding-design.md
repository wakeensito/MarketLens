# iOS Milestone 1 — Onboarding → Login Prompt (SwiftUI, mock-only)

**Date:** 2026-06-24
**Status:** Approved design, pre-implementation
**Project:** `PlinthsApp/` — native SwiftUI iOS client for Plinths (learn-Swift vehicle)

## Context

Plinths is a deployed web product (React SPA + AWS backend). The iOS app is a **native
SwiftUI client** of the existing backend, built primarily to learn native iOS development
and to go through the real Apple App Store pipeline. The backend already exists; the iOS
work is client-only.

Approach is **mock-first**: build UI against hardcoded data, wire the real API in later
milestones. This mirrors the user's established frontend-first workflow and avoids fighting
auth + networking while still learning the language.

**Milestone arc (for orientation; only M1 is specced here):**
1. **M1 — Onboarding (3 pages) → login prompt** ← *this spec*
2. M2 — Idea-input / post-login landing screen
3. M3 — Report screen (mock data)
4. M4 — Wire the real reports API (fetch + poll + decode)
5. M5 — Real auth (Cognito; native token-in-Keychain — needs backend review)
6. M6+ — Muse chat, etc.

## Goal

One paged onboarding flow that ends at a login prompt, teaching the core SwiftUI
fundamentals reused everywhere: **paged navigation (`TabView`), layout stacks, `@State`,
styling with design tokens, and button actions.** No networking, no real auth, no report UI.

## Why onboarding-then-login (not straight to a login wall)

- A mobile app is a cold install with zero context; a short walkthrough sets it up.
- Apple App Store guideline **5.1.1** discourages mandatory login before showing any value.
  Show the offer first, then invite login — keeps us review-safe.
- The paging mechanism is a distinctly-iOS, satisfying first build.

## Screens

A single root view drives a 4-page `TabView` with `.page` style (swipeable). A **Skip**
button is visible from page 1 and jumps to the login page.

### Pages 1–3: the offer (idea → landscape → plan)

| Page | Headline | Subtext |
|------|----------|---------|
| 1 | **Type an idea.** | Describe any business idea in a sentence. |
| 2 | **See the landscape.** | Competitors, gaps, and a saturation score in seconds. |
| 3 | **Get your entry plan.** | A concrete roadmap for breaking in. |

Each page: a simple glyph/visual placeholder (SF Symbol for now — custom art is later),
serif headline (`--font-display`), secondary-color subtext (`--font-body`), centered in a
`VStack`. A page indicator (dots) sits near the bottom.

### Page 4: login prompt

- `plinths` wordmark + `Beta` badge (mono, lowercase) — matches web brand.
- Copy: **"Log in to start."**
- A primary **Log in** button — **stubbed**: prints `"login tapped"` to the Debug Console.
  No real auth in this milestone.
- A secondary **"Skip for now"** text affordance — **stubbed**: prints `"skip tapped"`.

## Design tokens — Pale Intelligence (light theme), ported to SwiftUI

SwiftUI cannot read OKLCH, so we define a `Color` extension with hex equivalents derived
from `index.css` / `DESIGN.md`. This file (`Theme.swift`) becomes the reusable design
system for all later screens. Exact hex values to be calibrated against DESIGN.md during
implementation; starting approximations:

| Token | OKLCH (source) | SwiftUI hex (approx) | Use |
|-------|----------------|----------------------|-----|
| `bg` | `oklch(98.5% 0.004 80)` | `#FAF9F6` | page canvas |
| `surface` | `oklch(97% 0.006 80)` | `#F5F3EF` | cards/panels |
| `text` | `oklch(13% 0.008 245)` | `#1A1C1E` | primary ink |
| `textSecondary` | `oklch(44% 0.006 245)` | `#6C6F73` | subtext |
| `signal` | `oklch(34% 0.05 65)` | `#5C4A38` | data/highlight |
| `logoAccent` | `oklch(68% 0.12 65)` | `#C68A4E` | wordmark only |

**Fonts:** IBM Plex Serif (`--font-display`), Sans (`--font-body`), Mono (`--font-mono`)
are **bundled into the app** in this milestone (added to the project, registered via
Info.plist `UIAppFonts`). Doing it now is a real, instructive iOS task and avoids a
later retrofit. A `Font` helper in `Theme.swift` exposes them.

## Design parity with the web frontend

The iOS UI must hold the **same design language and craft bar as the web app**, not drift
into default SwiftUI styling. Parity is achieved by concrete, Swift-real mechanisms — NOT
by invoking the web design skills (`interface-design`, `impeccable`), which are CSS-oriented
and cannot read or validate SwiftUI. Referencing them as a process step here would be hollow.

What actually delivers parity:

1. **Ported design system (`Theme.swift`)** — the single source of truth for the app, a
   direct SwiftUI port of Pale Intelligence (colors, fonts, spacing scale) from `index.css`
   / `DESIGN.md`. Every screen pulls from it; no ad-hoc colors or system fonts.
2. **Ground-truth references** — the live web app, `DESIGN.md`, and the frontend's extracted
   system at `frontend/.interface-design/system.md` define "what good looks like." We match
   against them by eye and by token values.
3. **Manual craft critique** — after a screen builds and runs, a deliberate pass against the
   web app's look: typographic hierarchy, spacing rhythm, weight, restraint. The *principles*
   behind `impeccable` inform this critique; the skill itself is not run on Swift.

The discipline that carries over is "one source of truth, consistent tokens, premium
restraint." The CSS mechanics do not.

## Files

| File | Purpose |
|------|---------|
| `OnboardingView.swift` | root 4-page `TabView`, Skip button, page state |
| `OnboardingPage.swift` | reusable single-page view (glyph + headline + subtext) |
| `LoginPromptView.swift` | page 4 — wordmark, copy, stubbed buttons |
| `Theme.swift` | `Color` + `Font` extensions (the ported design system) |
| `ContentView.swift` | becomes the app root; hosts `OnboardingView` |
| IBM Plex font files | added to bundle + `Info.plist UIAppFonts` |

`PlinthsAppApp.swift` (the `@main` entry) is left effectively unchanged — it already shows
`ContentView`.

## State / data flow

- `@State private var page: Int` in `OnboardingView` drives the `TabView` selection.
- **Skip** sets `page = 3` (the login page).
- No persistence, no model layer, no networking. Button taps `print(...)` only.

## Done when

1. App builds and runs in the iOS Simulator.
2. Three offer pages swipe horizontally; page dots track position.
3. **Skip** (visible from page 1) jumps to the login page.
4. Login page shows the `plinths` wordmark + Beta badge in the bundled mono font.
5. **Log in** and **Skip for now** each print their tap to the Debug Console.
6. All text uses bundled IBM Plex fonts; colors come from `Theme.swift`.

## Explicitly NOT in this milestone (YAGNI)

- Real authentication / Cognito / Keychain.
- The idea-input screen and report UI (M2/M3).
- Stealth (dark) theme switching — light theme only for now.
- Custom onboarding artwork (SF Symbols stand in).
- "Don't show onboarding again" persistence — onboarding shows every launch for now.
- Networking of any kind.

## Open questions / later flags

- **Auth (M5):** web uses Cognito Hosted UI + HttpOnly cookies via a BFF. Native iOS wants
  JWT-in-Keychain (likely `ASWebAuthenticationSession`). Confirm the API accepts a bearer
  token directly, or a backend tweak may be needed. Out of scope for M1 — flagged early.
- **Setup doc:** capture toolchain state (macOS 26.3, Xcode 26.3 universal, iOS-only
  components, $99 Apple Developer fee deferred until TestFlight/submit) in an
  `PlinthsApp/SETUP.md` during/after M1.
