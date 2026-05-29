# Plinths — Pale Intelligence (Interface Design System)

This file is the source of truth for interface-design decisions on Plinths. App-wide foundations live here; surface-specific patterns (report, pricing, Muse) live in their own sections below.

The full token definitions live in `frontend/src/index.css` — this file documents intent, not values. When the two disagree, the CSS wins; update this file.

---

## Direction

**Feel:** Warm parchment, dark ink, quiet structure. Reading room, not chat app. Document-feel, not dashboard-feel.

**Default mode:** Light. Dark exists but warmth and restraint are preserved (warm signal, low contrast jumps).

**Type system:** IBM Plex Serif / Sans / Mono — used as *three voices*, not interchangeably:
- **Serif** (`--font-display`): titles, Muse turns. The "book voice."
- **Sans** (`--font-body`): UI, user turns, prose. The "person voice."
- **Mono** (`--font-mono`): timestamps, labels, citation pills, system signals. The "machine voice."

This typographic role-split is a recurring identity move. Don't reach for size variations when a face-swap would communicate the role more clearly.

---

## Depth strategy

**Borders-only** (with one exception below).

- Borders use `color-mix(in oklch, …, transparent)` — they recede until you look for them. No solid hex borders.
- Border progression: `--border` (standard) · `--border-mid` (slightly stronger) · `--border-strong` (emphasis) · `--border-focus` (focus rings, tinted).
- **Exception:** ring shadows (`0 0 0 1px ...`) are allowed for focus states.
- No drop shadows on cards. No layered shadows. No premium-feeling elevation tricks.
- Surface hierarchy via *lightness shifts only*, never different hues: `--bg` → `--surface` → `--surface-alt` → `--surface-hover`. Each step is a few percent of lightness.

The squint test passes when nothing jumps out and hierarchy is still readable.

---

## Spacing

Base unit: **0.25rem (4px)**. Stick to multiples.

Typical scale in CSS: `0.25 · 0.5 · 0.625 · 0.75 · 1 · 1.25 · 1.5 · 2 · 2.5 · 3 · 4 · 5 · 6rem`.

- `0.625rem` (10px) appears in nav padding and is intentional — don't normalize it out.
- Symmetrical padding unless content forces asymmetry.

---

## Radius

```text
--radius-sm:   3px   inputs, small pills
--radius-md:   4px   buttons
--radius-lg:   6px   surface chips, attachment buttons, focus targets
--radius-xl:   12px  cards, modals, the main input bar
--radius-full: 9999  pills (rarely — prefer sharper)
```

Plinths leans sharper than most warm-toned UIs. Rounded-full is exceptional.

---

## Color tokens (roles, not values)

| Token | Role |
|---|---|
| `--bg` / `--surface` / `--surface-alt` / `--surface-hover` | Surface elevation by lightness |
| `--text` / `--text-secondary` / `--text-muted` / `--text-inverse` | Four-step text hierarchy |
| `--border` / `--border-mid` / `--border-strong` / `--border-focus` | Border progression |
| `--accent` / `--accent-light` / `--accent-border` / `--accent-hover` | Interactive ink (all buttons, links, focus) |
| `--signal` / `--signal-light` / `--signal-border` | Data highlights, scores, citation pills |
| `--logo-accent` / `--logo-accent-mid` / `--logo-accent-ink` | **Restricted to the Plinths wordmark only** — do not use elsewhere |
| `--success` / `--warning` / `--danger` | Semantic colors with `-light` variants for backgrounds |

**Color rules:**
- One accent (`--accent`, dark ink) for all interactive elements.
- One restricted brand color (`--logo-accent`, warm amber) — wordmark only.
- `--signal` is the data color (saturation score, citation pills) — never decorative.
- No new hues. New roles for existing tokens are how the system grows.

---

## Animation

- Entry: `opacity 0→1` + `y 8→0`, `easeOut`, ~0.35–0.4s.
- Stagger: `0.06–0.09s` between siblings.
- Score count-up: RAF cubic ease-out, 700–1200ms.
- Nothing longer than 400ms except data-driven count-ups.
- Smooth scroll: `scroll-behavior: smooth` global; `prefers-reduced-motion` overrides to `auto`.
- No spring/bounce in chrome. Spring is reserved for the `layoutId="ml-input"` morph (the input bar across landing/compact). Larger view swaps (Muse chat ↔ report) are plain mount/unmount — no morph, no spring. Dramatic bounding-box morphs over a viewport's worth of distance read as cinematic, not professional.

---

## Iconography

- One set: Lucide.
- Icons clarify, not decorate. If the icon could be removed with no loss of meaning, remove it.
- Standalone icons (paperclip, chevron, etc.) get a subtle container background only when they're interactive controls.

---

## Component patterns

### Input bar (`AnimatedAiInput`)
Two-row layout: textarea on top, toolbar on the bottom. Toolbar-left has the model dropdown; toolbar-right has the Send arrow. On a report (where the compact composer is the Muse composer), the toolbar-left also renders, after a separator, the **navigation glyphs** (see *Navigation glyphs* below) — the two surfaces you're not currently on. The bar morphs between full (landing/empty workspace) and compact (analysis/report) via `layoutId="ml-input"`. Both variants share the same toolbar order.

### Legal pages
38rem max-width column, left-aligned in a centered shell. Headings in Plex Serif, body in Plex Sans, metadata in Plex Mono. No horizontal rules in the body flow — whitespace is the divider. Back-to-top sits at the document close with light treatment (no divider above, no hover pill).

### Cards (report, plan, brief)
Same surface treatment across all cards: `--surface` background, `--border` border, symmetrical padding. Report and Build Brief cards use `--radius-lg` corners; modals and the main input bar use the larger `--radius-xl` / input radius. Internal structure varies by content; surface chrome does not.

### Workspace navigation — tabs + nav glyphs (added 2026-05-28)

A report workspace has three surfaces: **Report · Build Brief · Muse**, shown one at a time (single-attention; no split-screen). Two navigations, one state (`activeTab`, owned in `App.tsx`):

- **Header tabs** (`WorkspaceTabs`) — the header row is the tab bar (mono uppercase labels; an animated `--accent` underline that slides via a `layoutId` *tween*, not a spring). Always shows all three. Gated tabs carry a small marker — `Pro` on Build Brief once the free sample is used (no marker while the sample is available), `Sign in` on Muse for anon — and open to a calm upsell pane, never a blurred teaser.
- **Toolbar nav glyphs** (in the composer) — an always-on quick-switch shortcut; see *Navigation glyphs* under Muse patterns.

Both routes call one shared `handleTabChange`, so they cannot diverge. Default tab on opening a report: Report for a fresh one; Muse if a saved thread exists. Tab/pane swaps are a plain opacity fade — no morph. Each pane is a `role="tabpanel"` (`.ws-pane`) wired to its tab.

### Build Brief (Pro) — the build read

A Pro deliverable derived from a completed report; lives in its own tab/pane. States:

- **Free sample available / Idle (Pro, not generated):** a warm **invitation card** — `--signal-light` background + `--signal-border` (echoes the recommendation block), a serif headline, and a primary CTA (`Generate your free build brief · 1 sample` for a free user who hasn't used their sample; `Generate build brief` for paid). Present and inviting, never a blurred teaser.
- **Locked (free, sample used):** the same invitation card surface with a `Upgrade to Pro` CTA — the single-sample taste has been consumed.
- **Generating:** a content-shaped skeleton (no lingering spinner).
- **Ready:** the brief — a complexity + effort strip; a **build/buy pill** where **BUILD carries `--signal`** ("the work that's yours") and **BUY stays neutral** (a vendor solved it); a vendor-neutral **foundation** list with cross-cloud mappings in mono (`S3 / Blob / Cloud Storage`, no vendor logos or colors); MVP scope; technical risks (mono `R1…` index in `--signal`); a fixed **`FOUNDATIONS & LIMITS`** block (product-voice principles + the "AI isn't always right, get professional review" limit); and an action row (`copy as markdown`).

Generation is synchronous — a deliverable, not a chat reply. Type roles hold: serif for the conclusion-y headlines, mono for labels / data / cloud mappings, sans for prose.

---

## Muse patterns (locked 2026-05-12)

These decisions sit on top of the structural locks in CLAUDE.md (inline thread, no split-screen, single-attention, plain view-swap with no morph). Navigation among Report · Build Brief · Muse is via the header tabs + toolbar nav glyphs (see *Workspace navigation*); the earlier single "report-as-toggle" has been superseded by that three-surface model.

**Register:** "prestigious LLM" — read as document Q/A pairs, not as a chat exchange. Anti-references: iMessage bubbles, ChatGPT speaker labels, "Claude is typing…" dots, avatar bubbles, right-aligned user turns. Reference: Perplexity, executed in the Pale Intelligence palette.

### Turn format — document pair, not chat

Every turn is a **query → answer** document pair. No bubbles, no avatars, no left-side rules, no right-alignment. The hierarchy is the speaker indicator.

```text
how does the gap around onboarding compare to mid-market HR tools?
──────────────────────────────────────────────────────────────────
(thin --accent-border rule under the heading)

GROUNDED IN  ·  [Gap 2]  [Competitor 3]  [Roadmap · Phase 1]

The opportunity is real but narrow. [Competitor 3] already
does guided onboarding well — what they miss is the cross-team
handoff. [Gap 2] points exactly there.

COPY  ·  REGENERATE  ·  CITE AS MARKDOWN
──────────────────────────────────────────
what about retention?                    →
compare to Future                        →
how big is the Phase 1 risk?             →
```

Typography:
- **User query (heading):** `--font-display`, `clamp(1.25rem, 1.8vw, 1.625rem)`, weight 500, letter-spacing `-0.015em`, line-height 1.3.
- **Muse prose (body):** `--font-display`, 1.0625rem, line-height 1.7, color `--text`. Max width 38rem.
- Inline `**bold**` → weight 600.
- Turn-to-turn gap: `3rem` desktop, `2.25rem` mobile.

### Citation pills — first-class, document-shaped

Mono pills in `--signal`. Cite cells, not URLs.

```text
[Gap 2]                   in-report citation
[Competitor 3]            in-report citation
[Roadmap · Phase 1]       in-report citation, subsection
⌗ Q3 SaaS · Gap 1         Max-only: cross-report citation (filing-tab glyph)
```

Pill style:
- font: `--font-mono`, 0.8125rem, weight 500
- padding: `0.125rem 0.5rem` (larger than a footnote — these are an identity element, not chrome)
- color: `--signal` · background: `--signal-light` · border: `--signal-border`
- radius: `--radius-sm` (square; pills not capsules)
- hover: background → `color-mix(in oklch, var(--signal) 14%, transparent)`, border stronger
- on tap: the active surface switches to the **Report tab**, the matching `[data-muse-cell="<target>"]` element scrolls into view (`block: center`, smooth), then pulses once (1.6s ring shadow in `--signal-light`). The integration owns the routing — `ReportView` just emits stable `data-muse-cell` attributes on competitor / gap / roadmap items (`competitor-N` / `gap-N` / `roadmap-N`, 1-indexed).

Model output uses `[[target|Label]]` syntax — renderer parses these inline. Stream-safe: partial tokens degrade to plain text and snap into pills on `]]`.

### Sources row — prestige signal

Above the Muse prose, a horizontal row of all citations used in the response:

```text
GROUNDED IN  ·  [Gap 2]  [Competitor 3]  [Roadmap · Phase 1]
```

Label: `--font-mono`, 0.625rem, uppercase, letter-spacing 0.1em, `--text-muted`. Pills are clickable, same behavior as inline. Tells the reader what source material the answer rests on *before* they read it.

### No "thinking" state

Earlier iterations rendered status lines ("reading saturation score" / "checking competitors" / "cross-referencing roadmap") between submit and first token. **Removed.** The user said it read as performance, not like a normal chat. The sources row + immediate streaming carries enough signal — no need to narrate the work.

If a future iteration wants to surface real backend tool calls (search, lookup, etc.), revisit this; for now, the chat just responds.

### Streaming rhythm

- Char-by-char streaming, 14–32ms per char (random jitter).
- ~240ms settle at sentence boundaries (`.?!`) — *skipped* while inside a `[[…]]` citation token so the period inside a citation doesn't trigger a fake pause.
- Stream cursor: 1px-wide vertical line (`--text-secondary`), 1.05em tall, blinks 1s steps. Not a block.
- No typing dots, no spinner.
- On stream complete, cursor disappears (no animation needed).

### Action row

Below the prose, two groups separated by `justify-between`:

```text
COPY  ·  REGENERATE  ·  CITE AS MARKDOWN              [👍]  [👎]
```

**Left group** — content actions:
- Style: `--font-mono`, 0.6875rem, uppercase, letter-spacing 0.06em, `--text-muted` → `--text` on hover. Plain text buttons, no borders.
- **copy** → plain text (citation tokens stripped to labels)
- **regenerate** → re-runs the thinking + streaming sequence on this turn; truncates anything after it
- **cite as markdown** → clipboards a blockquote with citation tokens rendered as `[Label](#cell-target)` markdown links

**Right group** — per-response feedback (`MuseFeedback`):
- Two icon-only buttons (lucide `ThumbsUp` / `ThumbsDown`), 26×26 hit target, 14px icons.
- Default: `--text-muted`, transparent border. Hover: `--text` + `--accent-light` bg.
- Active up: `--signal` color + `--signal-light` bg + `--signal-border` border, icon filled, scale 1.05.
- Active down: `--warning` color + `--warning-light` bg + tinted border, icon filled, scale 1.05.
- Clicking the same direction toggles off. Switching directions clears the other and sets the new one. Feedback persists with the thread.

### Follow-up chips — anticipatory intelligence

Below the action row, a vertical list (not pill buttons) of 3 suggested questions:

```text
──────────────────────────────────────────
what about retention?                    →
compare to Future                        →
how big is the Phase 1 risk?             →
──────────────────────────────────────────
```

Style: `--font-body`, 0.9375rem, `--text-secondary` → `--text` on hover. Each row has hairline `--accent-border` top/bottom. The arrow slides 4px right on hover; the row indents 6px left. Tap → fires the question through `sendMessage` (creates the next turn).

### Back-to-chat banner (citation-only)

A sticky banner appears at the top of the report column **only when the user arrived via a citation pill** — not when they opened the report via the toolbar toggle.

- **Label** (left, mono uppercase, `--text-muted`): `FROM YOUR CONVERSATION`. The banner exists to ferry the reader back to where they left off mid-conversation.
- **Button** (right, mono uppercase, bordered): `← BACK TO CHAT`. Tap returns to the thread.

**Why citation-only:** when the user explicitly taps the toolbar's `▬▬` glyph to open the report, they already know how to navigate back — they took an explicit action. The banner would be redundant chrome in that case. When they tap a citation, they got teleported mid-read and need an obvious "continue where I left off" path.

Style: `--surface` bg, `--accent-border` border, `--radius-lg`. Sticky `top: 1rem` so it stays visible during scroll. State management: opening via toolbar / closing via toolbar both clear `highlightTarget` so the banner state stays honest.

### Navigation glyphs — destination semantics (updated 2026-05-28)

The workspace has three surfaces (Report · Build Brief · Muse) navigated by **header tabs** (primary, labeled — see *Workspace navigation*) and by **toolbar nav glyphs** in `AnimatedAiInput` (a quiet, in-context shortcut). Both drive the same `activeTab` via one shared `handleTabChange`, so they can never diverge.

The glyphs are **always-on** while the composer shows (signed-in, on a report): the toolbar renders a glyph for each of the *other two* surfaces — always exactly two. The icon represents *where the tap will take you*, not the action being performed:

- **Report** → `▬▬` mini-saturation mark (`SaturationToggleMark`, 14px) — echoes the report's saturation gauge.
- **Build Brief** → lucide `Blocks` (16px) — matches the Build Brief CTA icon.
- **Muse** → lucide `MessageSquare` (16px). **Never `✕`** — close-style icons read as "delete" first.

All `--text-secondary`; each is a plain `<button class="ai-input__nav-glyph">` with a subtle hover container and a `title` / `aria-label`. No `layoutId`, no spring. (This replaces the earlier single `museMode` toggle, which appeared only when chat was active — superseded once the three-surface tab model landed. The active surface never shows its own glyph.)

### Empty state

Single Plex Mono line where the thread will live:

```text
MUSE · ready · grounded in this report
```

Style: `--font-mono`, 0.75rem, uppercase, letter-spacing 0.08em, `--text-muted`, centered. No box, no bubble, no greeting.

Free-locked variant:
```text
MUSE · upgrade to chat with this report      [ see plans ]
```

### Per-report scoping

Threads are keyed by `reportId` and persisted server-side (the Muse SSE Lambda + DynamoDB; `useMuse` hydrates the thread on report open). Switching reports in the sidebar surfaces each report's own conversation. Opening a report that already has a thread defaults to the **Muse tab** (CLAUDE.md locked behavior); otherwise the Report tab.

---

## Reference

- Muse is live in the workspace (no preview flag). It POSTs to `/api/muse/stream` and consumes the live SSE stream.
- Source: `frontend/src/hooks/useMuse.ts`, `frontend/src/hooks/useBuildBrief.ts`, `frontend/src/components/muse/*`, `frontend/src/components/WorkspaceTabs.tsx`, `frontend/src/components/BuildBrief.tsx`, integration in `frontend/src/App.tsx` and `frontend/src/components/AnimatedAiInput.tsx`
- Token definitions: `frontend/src/index.css`
- Animation presets: `frontend/src/motion.ts`
- CLAUDE.md Muse section: top-level Muse status and constraints
