# iOS Milestone 4 — Muse chat + report↔muse navigation — Design

**Status:** approved, ready for implementation plan
**Branch:** `feat/ios-m4-muse`
**Depends on:** M3 report / Market Memo (merged to `main`, PR #59)

## Overview

M4 adds **Muse** — the per-report conversational surface — to the native iOS
app, and the mobile navigation that lets a user move between a report and its
Muse thread. Mock-only (no live SSE until M7); this milestone builds the
*experience*, not the network.

This is largely a **translation** of the locked Muse craft (CLAUDE.md → "Muse"
section, "Craft (locked 2026-05-12)") from the web's Pale Intelligence palette
into native SwiftUI + the Stealth-Desert palette (amber-only). The web renders
Muse *inline below the report* in a shared workspace; iOS M3 made the report a
**dedicated full-screen surface**, so the report↔muse relationship is
re-expressed as two full-screen **faces** flipped by a destination-toggle glyph.

Reference (native port source): `frontend/src/hooks/useMuse.ts`,
`frontend/src/components/muse/*` (`MuseThread.tsx`, `MuseEmptyLine.tsx`,
`SaturationToggleMark.tsx`, `museTypes.ts`, `muse.css`).

### In scope
- Two-face report surface (report ⇄ muse), destination-toggle glyph.
- MuseView: document-pair turns, sources row, streaming prose with `**bold**`
  and `[[cell|Label]]` citation pills, action row, follow-up chips, docked
  composer, empty state.
- Citation round-trip: pill → report face + scroll-to-cell + pulse + back banner.
- Per-report canned mock threads (3 reports × ~3 Q/A) + an in-memory thread store.

### Out of scope (later milestones)
- **Max features:** model selection, cross-report memory (locked Max-only, unbuilt).
- **M6:** gating / paywall (iOS is free-during-beta, no in-app payment → Muse is
  ungated; the upsell placeholder lands in M6).
- **M7:** live SSE stream, real feedback POST, across-launch thread persistence.

## Decisions (locked during brainstorming)

1. **Navigation = two full-screen faces + docked composer.** The report and Muse
   are two faces of the same report, flipped by a toggle glyph whose icon shows
   the *destination* (chat-bubble on report → Muse; ▬▬ mini-saturation on Muse →
   report). No split-screen, no tabs, no `layoutId` morph — plain mount/unmount
   (all per the locked spec).
2. **Ungated in beta.** No Muse paywall on iOS (free-during-beta / no IAP). The
   upsell placeholder is M6.
3. **Max features stay unbuilt** — model selection + cross-report memory are
   Max-only and out of scope.
4. **Per-report canned threads.** ~3 hand-authored Q→A pairs per report fixture;
   each answer cites *that report's real cells* so the citation round-trip works.
   Free-typed submit → the report's canonical answer; follow-up chips → their
   mapped answer.
5. **In-memory per-session persistence,** keyed by `reportId`. Durable
   across-launch storage is deferred to M7 (backend).
6. **Amber-only thumbs.** The web colors thumbs-up `--signal` / thumbs-down
   `--warning`; Stealth is amber-only, so both active states are **amber**,
   distinguished by icon only. No `warning`/coral enters the app.
7. **`MemoView` gains a docked composer + scroll machinery.** M3's `MemoView` is
   a pure `ScrollView`; M4 adds the "Ask about this report…" composer, stable
   cell IDs, a `ScrollViewReader`, and a citation pulse + back banner.

## Architecture

### The report surface becomes two faces
Today: `WorkspaceView` `.report(memo, date)` → `MemoView`. M4 inserts a container
that owns one report's session state and swaps faces:

```swift
enum ReportFace { case report, muse }

struct ReportSurface: View {
    let memo: MarketMemo
    let date: Date
    let reportId: String
    let onBack: () -> Void
    @State private var face: ReportFace
    @State private var highlightTarget: MuseCitation.Target?   // set on citation arrival
    @Environment(MuseStore.self) private var store             // Observable, injected
    // body: switch face { case .report: MemoView(...); case .muse: MuseView(...) }
}
```

- `WorkspaceView` changes `case .report(let memo, let date)` to render
  `ReportSurface(memo:date:reportId:onBack:)`. `reportId` comes from the
  navigation context: history rows use `MockReport.id`; a submit-complete report
  uses a stable id for `digitalFitness` (e.g. `"report-digitalFitness"`). The
  `MockMemo` resolver gains a parallel `reportId(for:)` (or `MockReport` already
  carries `id`; submit uses the fixture's canonical id).
- **Default face on open:** `.muse` if `store.thread(for: reportId)` is non-empty,
  else `.report` (per the locked "open a report with an existing thread →
  chat-view"). A fresh submit-complete report opens `.report`.
- **Back chevron** on both faces calls `onBack` (M3's `backFromReport`).

### Toggle glyph (destination semantics)
- **On the report face:** a chat-bubble glyph (SF Symbol `message`) in the top
  bar, shown **only when a thread exists** for this report → tap sets
  `face = .muse`. (To *start* a thread with no history, use the docked composer —
  typing a question flips to `.muse`.) Empty slot when there's no destination.
- **On the muse face:** the ▬▬ two-bar mini-saturation mark
  (`SaturationToggleMark`, a small `Canvas`/`Shape`) → tap sets `face = .report`.
- **Never** an ✕ (reads as delete) or a paperclip (implies attachments).

## MuseView — the conversation (`Muse/MuseView.swift`)

A `ScrollView` of turns + a docked composer. Renders the locked "prestigious
LLM / document Q/A" register in Stealth.

- **Empty state** (`Muse/MuseEmptyLine.swift`): a single Plex Mono line
  `MUSE · ready · grounded in this report` (`Theme.Typeface.caption`,
  `Theme.Stealth.textSecondary`) where the thread will be. No greeting bubble.
- **Turn = document pair** (`Muse/MuseTurnView.swift`):
  - User query: serif heading (`Theme.Typeface.title`, `Theme.Stealth.text`)
    with a hairline rule beneath (`textSecondary` 0.15). No bubble, no avatar,
    no right-alignment — the hierarchy *is* the speaker indicator.
  - Muse answer: a self-contained block beneath.
- **Sources row** (`Muse/MuseSourcesRow.swift`, Muse turns only): a `GROUNDED IN`
  mono-uppercase label + a horizontal row of citation pills, above the prose.
  Hidden when empty.
- **Prose** (`Muse/MuseProseText.swift`): serif body (`Theme.Typeface.body` or a
  dedicated display role), generous line spacing, capped column width. Renders:
  - inline `**bold**` → bold run,
  - `[[target|Label]]` citation tokens → inline pills (mono, amber — reuses the
    citation-pill look, but tapping routes to a cell, not a URL),
  - Stream-safe: a partial trailing `[[…` renders as plain text and snaps into a
    pill when `]]` arrives.
  Built with `AttributedString`/inline `Text` composition, or a token-run model
  rendered as a wrapping `HStack`/`Text` concatenation (plan decides; must
  support tappable inline pills, so likely a custom flow of `Text` + `Button`
  runs).
- **Streaming** (`Muse/MuseStreamer.swift`): char-by-char append to a published
  `streamingText`; ~240ms settle at sentence boundaries (`.?!`), settles skipped
  while inside a `[[…]]` token; a 1px vertical cursor (`Theme.Stealth.textSecondary`)
  blinking at 1s. **No "thinking" state** — the sources row appears, then prose
  streams. Honors Reduce Motion (renders the full answer immediately, no cursor).
- **Action row** (`Muse/MuseActionRow.swift`): two groups, `justify-between`.
  Left: mono-uppercase `COPY · REGENERATE · CITE AS MARKDOWN`. Right: thumbs
  up/down (`Muse/MuseFeedback.swift`) — toggleable; **active = amber for both**
  (icon distinguishes valence), inactive = `textSecondary`. COPY → answer text;
  CITE AS MARKDOWN → the answer as markdown; REGENERATE → re-streams the same
  canned answer. Feedback persists in the store.
- **Follow-up chips** (`Muse/MuseFollowupChips.swift`): a vertical list (not
  pills) with hairline top/bottom borders; each row is a question + a right arrow
  that slides on hover/press; 3 per turn. Tap → submits that question (appends
  its mapped canned Q/A).
- **Docked composer** (`Muse/MuseComposer.swift`): "Ask a follow-up…" text field
  + amber send, reusing the `IdeaInputBar` visual idiom. Submit → append a turn.

## Citation round-trip

- **`MuseCitation`** — a parsed token: `target` (`.competitor(Int)` / `.gap(Int)`
  / `.roadmap(Int)`, 1-indexed) + `label`.
- Tapping a citation pill in Muse: sets `face = .report`, sets
  `highlightTarget = target`.
- **`MemoView` changes** (M3 file):
  - Wrap the scroll body in a `ScrollViewReader`.
  - Give the cited cells stable `.id(…)`: competitor rows `"competitor-\(i+1)"`
    over the **sorted/visible** list, gap rows `"gap-\(i+1)"`, roadmap rows
    `"roadmap-\(i+1)"` — matching the web's 1-based `data-muse-cell` convention.
  - On appear / when `highlightTarget` is set: `withAnimation` scroll the target
    id to center; pulse it once (a `1.6s` amber ring overlay in `Theme.Stealth`),
    then clear the pulse.
  - **Back banner** (`Muse/BackToChatBanner.swift`): a sticky top row
    `FROM YOUR CONVERSATION` (left) · `← BACK TO CHAT` (right), mono uppercase,
    shown **only** when `highlightTarget != nil` (citation arrival). Tap → back
    to `.muse`. Opening/closing via the toggle glyph leaves `highlightTarget nil`
    so the banner stays honest about how the user arrived.

## Models & mock content

### Muse types (`Models/Muse/MuseModel.swift`)
```swift
struct MuseCitation: Equatable {           // parsed from [[target|Label]]
    enum Target: Equatable { case competitor(Int), gap(Int), roadmap(Int) }
    let target: Target
    let label: String
}

enum MuseRun: Equatable {                   // one span of an answer
    case text(String)
    case bold(String)
    case cite(MuseCitation)
}

struct MuseTurn: Identifiable, Equatable {
    let id: String
    let query: String
    let answerRaw: String                   // the [[…]]/**…** source string
    let sources: [MuseCellRef]              // the report cells this answer rests on
    let followups: [String]                 // 3 follow-up questions
    var feedback: MuseFeedbackValue         // .none | .up | .down
}

struct MuseCellRef: Identifiable, Equatable {   // a citation pill in the sources row
    var id: String { label }
    let target: MuseCitation.Target
    let label: String                        // e.g. "Competitors", "Gap 01"
}
```
- A `parseRuns(_ raw:) -> [MuseRun]` function turns the answer source string into
  renderable runs (used both by the streamer and the final render). Stream-safe.

### Mock threads (`Models/Muse/MockMuse.swift`)

**Reveal model (resolves how asking advances the thread — no "type X, see Y"):**
a turn is always `(displayedQuery, resolvedAnswer)` where the displayed query is
*what the user actually asked* (their typed text or the exact chip text), and the
answer is resolved deterministically:
- **Free-typed submit** → the displayed query is the user's text; the answer is
  the report's **canonical** answer (`canonicalTurn(for:query:)`). This is always
  the first interaction (the empty state has no chips — you type first).
- **Follow-up chip tap** → the displayed query is the chip's exact text; the
  answer is the authored turn that chip maps to (`turn(forChip:in:)`),
  deterministic and repeatable.

So each report's authored content is: one **canonical** answer + a small set of
**chip→answer** pairs (~3), whose chips are surfaced under prior turns. The store
holds the *grown* sequence of resolved turns for the session.

API:
```swift
enum MockMuse {
    static func canonicalTurn(for reportId: String, query: String) -> MuseTurn
    static func turn(forChip chip: String, in reportId: String) -> MuseTurn
}
```
- Authored for all three M3 fixtures (`digitalFitness`, `crowded`, `open`). Each
  answer: 1–3 sentences of prose with a `**bold**` phrase and 1–2 `[[cell|Label]]`
  citations into that report's real cells, a `sources` row of those cells, and 3
  follow-up chips. Example (`digitalFitness`, canonical):
  - free-typed "Who's the biggest threat?" → A cites `[[competitor-1|Future]]`
    and `[[competitor-2|Whoop]]`; sources `[Competitors]`; chips ["Where's the
    opening?", "How hard is it to enter?", "What would you build first?"]. Each
    of those chips maps (via `turn(forChip:in:)`) to its own authored answer that
    cites the relevant cell (e.g. "Where's the opening?" → `[[gap-1|…]]`).

### Thread store (`Models/Muse/MuseStore.swift`)
- An `@Observable` class, in-memory, keyed by `reportId`:
  `threads: [String: [MuseTurn]]`. Methods: `thread(for:)`, `append(_:to:)`,
  `setFeedback(_:for:in:)`, `hasThread(for:)`. Seeded lazily from `MockMuse` on
  first access? **No** — threads start *empty* (the empty state is a locked
  design element); asking reveals authored turns one at a time. The store holds
  the *grown* thread for the session. Injected via `.environment(store)` at the
  app root.

## Theming & amber-only discipline
All surfaces use existing `Theme.Stealth` tokens. **No additions to `Theme.swift`.**
Citation pills, the ▬▬ mark, active thumbs, the cursor, and the citation pulse
are all amber or `textSecondary` — no `warning`/`success`/coral. The thumbs-down
active state is amber (icon-only valence), explicitly diverging from the web's
two-color treatment to hold the palette law.

## Accessibility
- Toggle glyph, back chevron, thumbs, composer send, citation pills all carry
  `accessibilityLabel`s; citation pills add `.isLink`; tap targets ≥44×44.
- Reduce Motion: streaming renders the full answer immediately (no char-by-char,
  no cursor); the citation pulse becomes a static highlight that fades.
- Dynamic Type via the `Theme.Typeface` roles.
- A Muse turn reads as "Question: … Answer: …" in order (heading + block
  hierarchy maps to VoiceOver reading order).

## Verification
- `xcodebuild … build` is green.
- Simulator screenshots (flag-flip to reach states, revert before commit):
  report face with docked composer; Muse empty state; a streamed answer with
  sources row + inline citation pills + action row + follow-up chips; the
  citation round-trip (report face scrolled to a pulsed cell with the back
  banner). Capture across at least two fixtures.
- No test target (deferred to M7).

## Open questions
None blocking. Plan-time choices noted inline:
1. Prose rendering mechanism — `AttributedString` vs a custom run-flow of
   `Text`/`Button` (must support tappable inline pills).
2. `reportId` derivation for the submit-complete report vs history rows —
   stabilize on `MockReport.id` + a canonical id for the fixture.
