# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Plinths** — AI-powered market intelligence platform (beta, live on production domain). Users type a business idea and receive a competitive landscape, saturation score, and entry roadmap. A conversational agent ("Muse") is in active development — see the **Muse** section below.

## Advisory Council

On significant decisions, reason through five standing advisors and surface their relevant takes before recommending. The five lenses are deliberately in tension — the friction is the point.

- **Contrarian** — argues against the chosen path *and* against my own first answer. Names the strongest case for not doing this, the hidden cost, the failure mode everyone's ignoring.
- **First Principles** — strips the problem to fundamentals. Ignores "how it's currently done"; asks what's actually true and actually required. Challenges inherited constraints and cargo-culted patterns.
- **Expansionist** — thinks bigger and longer-horizon. What does this unlock, what could it become, where's the leverage. (Checked by the Contrarian and the project's anti-scope-creep rules — ambition is surfaced, not automatically followed.)
- **Outsider** — fresh, cross-domain eyes. How a new user, a non-engineer, or someone from another industry would see it. Names what we've gone blind to.
- **Executor** — biases to action. Smallest concrete next step, real cost, reversibility. Cuts analysis paralysis and lands the decision.

**When to convene:** architecture and API-shape choices, product/scope decisions, design tradeoffs, naming, and risky or irreversible actions. **Not** for routine edits, lookups, mechanical refactors, or simple bug fixes — those stay terse.

**How to surface (labeled, on big calls):** quote only the advisors with something non-redundant to say (often 2–3, rarely all five), one or two sentences each, then a short **Synthesis** that lands on a single recommendation. Keep it tight — the output is a sharper decision, not a committee transcript. This honors the project's less-chrome bar: no performing the debate, no padding.

## Repository Structure

```text
├── template.yaml                  # SAM template (S3, CloudFront, API GW, DynamoDB, Lambdas)
├── samconfig.toml                 # SAM deploy config
├── infrastructure/
│   └── lambda/
│       ├── api/                   # REST API Lambda (Python, Powertools)
│       ├── ai-orchestration/      # AI pipeline Lambda (Python, Durable Function)
│       ├── auth-create/           # Cognito custom auth: create-challenge trigger
│       ├── auth-define/           # Cognito custom auth: define-challenge trigger
│       ├── auth-verify/           # Cognito custom auth: verify-challenge-response trigger
│       ├── authorizer/            # API Gateway JWT authorizer (always-Deny on uncertainty)
│       ├── bff/                   # Backend-for-frontend (Hosted UI ↔ HttpOnly cookies, OTP exchange)
│       ├── billing/               # Stripe billing Lambda — checkout, portal, webhook
│       ├── email-forwarder/       # SES inbound (info@/support@plinths.net) → personal addr via SSM
│       ├── export/                # CSV export Lambda (Python, Powertools)
│       ├── muse/                  # Chat agent: sync.py (REST routes) + stream.py (SSE via LWA) — see Muse
│       └── muse-forwarder/        # DynamoDB Stream → Firehose → Parquet (Muse analytics)
├── infra/
│   └── iam/                       # Terraform (CD role, OIDC provider)
├── frontend/                      # React + Vite + TypeScript
├── bin/                           # deploy wrapper script
├── scripts/                       # one-off data scripts (report export / migration)
├── .github/workflows/             # CI + CD pipelines
├── events/                        # SAM local test events
├── docs/                          # Architecture documentation
├── DESIGN.md                      # Design-system spec (themes, OKLCH tokens) — source of truth for theming
└── PRODUCT.md                     # Product register / positioning
```

## Frontend Commands

All commands run from `frontend/`:

```bash
bun dev          # dev server with hot reload
bun run build    # type-check + production build (tsc -b && vite build)
bun run lint     # ESLint
bun run preview  # serve the production build locally
```

Run `bun run build` to catch type errors — that is the verification step.

## Backend Commands

From repo root:

```bash
sam build                    # build all Lambdas
sam deploy                   # deploy to AWS (uses samconfig.toml)
sam local start-api          # local API Gateway at http://localhost:3000
sam local invoke ApiFunction # invoke a single Lambda locally
```

## API Endpoints (deployed)

Base URL: `https://amcgahmo7i.execute-api.us-east-1.amazonaws.com/dev`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | none | Health check |
| GET | `/api/me` | required | Returns the authenticated user incl. `plan`; used by billing activation poll |
| POST | `/api/reports` | required | Create report, body: `{"idea_text": "..."}` |
| GET | `/api/reports/{report_id}` | required | Get report (poll until `status: "complete"`) |
| GET | `/api/reports` | required | List user's reports |
| POST | `/api/reports/{report_id}/export` | required | Export, returns `{"download_url": "..."}` |
| POST | `/api/billing/checkout` | required | Create Stripe Checkout Session, body: `{"plan": "pro" \| "pro_annual" \| "max" \| "max_annual"}` |
| POST | `/api/billing/portal` | required | Create Stripe Customer Portal session for self-serve management |
| POST | `/api/billing/webhook` | none (Stripe-signed) | Stripe webhook receiver — signature is verified, never trust the body without it |
| GET | `/api/muse/conversations/{report_id}` | required | List the per-report Muse thread |
| DELETE | `/api/muse/conversations/{report_id}` | required | Clear the per-report thread |
| POST | `/api/muse/conversations/{report_id}/messages/{message_id}/feedback` | required | Thumbs up/down on a Muse turn |
| POST | `/api/muse/stream` | cookie (in-Lambda) | Muse chat SSE — **not** API GW; see note below |

`required` = passes through the Lambda Authorizer (`infrastructure/lambda/authorizer/app.py`); always-Deny on uncertainty. The webhook route is mounted with `Authorizer: NONE` so Stripe can reach it; signature verification is the only gate.

The three `GET`/`DELETE`/feedback Muse routes are API GW + the standard authorizer (`MuseSyncFunction`). **`POST /api/muse/stream` is different**: it's a Lambda Function URL (`MuseStreamFunction`, `InvokeMode: RESPONSE_STREAM`) that CloudFront proxies under `/api/muse/stream*` with OAC SigV4 signing. The Function URL bypasses API Gateway entirely, so the Lambda verifies the `ml_access` cookie itself via `plinths_auth` at request time.

## Actual Backend Response Schema

**IMPORTANT**: The backend returns a FLAT structure, NOT the nested schema described in `docs/architecture/03-ai-pipeline.md` §9. The docs describe the target schema; the current implementation returns this:

When `status: "pending"` or `"running"`:
```json
{
  "report_id": "uuid",
  "idea_text": "...",
  "status": "running",
  "created_at": "ISO8601",
  "pk": "REPORT#uuid",
  "sk": "REPORT#uuid",
  "gsi1pk": "REPORTS",
  "gsi1sk": "ISO8601"
}
```

When `status: "complete"`, adds `result_json` (flat object):
```json
{
  "result_json": {
    "vertical": "string",
    "geography": "string",
    "business_model": "string",
    "saturation_score": "number-as-string",
    "saturation_label": "string",
    "difficulty_score": "number-as-string",
    "opportunity_score": "number-as-string",
    "market_size": "string",
    "oneliner": "string",
    "trend_signal": "string",
    "recommendation": "string",
    "competitors": [{"name": "", "strength": "", "weakness": "", "market_position": ""}],
    "gaps": [{"title": "", "description": ""}],
    "roadmap": [{"phase": "", "title": "", "description": ""}],
    "key_stats": [{"label": "", "value": ""}]
  },
  "completed_at": "ISO8601"
}
```

Scores are STRING numbers (e.g. `"10"` not `10`). The adapter in `frontend/src/adapter.ts` handles parseInt conversion.

## Frontend Architecture

**Key files for API integration**:
- `src/api.ts` — fetch wrapper, types for backend response (`ResultJson`, `ApiReport`); also `getMe`, `startBillingCheckout`, `openBillingPortal`, `BillingPlan`
- `src/adapter.ts` — transforms `ResultJson` → `MarketReport` (frontend type)
- `src/hooks/useAnalysis.ts` — state machine: create report → poll → adapt → display
- `src/hooks/useBilling.ts` — Stripe redirect (`startCheckout` / `openPortal`) + activation poll. `beginActivationPoll(baselinePlan?)` polls `/api/me` until the plan changes from the supplied baseline (or until any non-`free` plan appears when no baseline is given) so a webhook that landed before the user returned still resolves immediately
- `src/components/ActivatingPlan.tsx` — modal scrim shown while the activation poll runs; surfaces a "taking longer than usual" affordance after `LAG_THRESHOLD_MS` and an error/refresh button after `MAX_TOTAL_MS`
- `src/components/PricingSection.tsx` — Free / Pro / Max table with monthly ↔ annual cadence toggle (ARIA radio-group)
- `src/types.ts` — frontend-only types (`MarketReport`, `PipelineStage`, etc.)
- `src/motion.ts` — shared Framer Motion presets (`landingEntryInitial`, `landingEntryAnimate`)
- `src/theme.ts` — theme preference helpers (`getThemePref`, `setThemePref`, `initTheme`)
- `src/mockData.ts` — fixture `MarketReport` used by `VITE_USE_MOCK` and demo states

**Stripe return flow**: After Checkout, Stripe redirects to `/?billing=success&session_id=…` (or `?billing=cancelled`). `App.tsx` reads the flag once on boot, strips the query, and either dispatches `billing.beginActivationPoll(auth.user?.plan ?? 'free')` or shows the cancel toast. Pass the *pre-checkout* plan as the baseline so a webhook that already updated `/api/me` resolves the poll on the first read.

**Auth context split:** `src/authContext.ts` holds the bare `createContext`; `src/AuthContext.tsx` holds the `<AuthProvider>` component. They are intentionally separate so React Fast Refresh stays clean — don't merge them.

**State machine** (`useAnalysis.ts`): `'landing' | 'analysis' | 'report'`
- On search: POST `/api/reports` → get `report_id` → poll GET `/api/reports/{id}` every 3s
- Cosmetic animation runs during polling (9 stages, RAF-driven)
- On `status: "complete"`: stop polling, adapt response, show report
- Timeout: 120s → show error with retry button

**API URL config**:
- `frontend/.env` sets `VITE_API_BASE_URL` for local dev (points to API Gateway)
- On CloudFront: `VITE_API_BASE_URL` is empty, so requests go to `/api/*` which CloudFront proxies to API Gateway

## Auth System (Cognito)

`src/hooks/useAuth.ts` — React hook wrapping Cognito Hosted UI + BFF token exchange.
`src/AuthContext.tsx` — provides `AuthState` to the tree; wrap app root to access via `useContext(AuthContext)`.

**Key methods on `AuthState`**:
- `login()` — redirect to Cognito Hosted UI
- `continueWithEmail(email)` — starts passwordless OTP via BFF (`POST /auth/initiate`); returns `{ session, emailHint }` for the code step (Cognito custom auth challenge)
- `verifyCode(email, code, session)` — validates the OTP and completes sign-in (`POST /auth/verify`)
- `logout()` — clears cookies via BFF
- `refresh()` — silent token refresh
- `loginWithEmail({ email, password }, intent)` — legacy email/password hook used by older flows; production posts to BFF where configured

**Dev shortcut**: set `VITE_USE_MOCK=true` in `.env` to enable `mockLogin()` — instant auth bypass.
No real Cognito call is made; `AuthUser` fields are stubbed. Integrations should prefer `continueWithEmail` / `verifyCode`; under mock, those APIs stub the OTP steps (no real email/code) rather than password auth.

## Plans (Free / Pro / Max)

Plinths is solo-only. The plan axis is power, not audience.

**Plan strings the backend accepts** (in `infrastructure/lambda/billing/app.py` checkout `plan` field): `pro`, `pro_annual`, `max`, `max_annual`. The user's stored plan in DynamoDB resolves to one of `free`, `pro`, `max`, or `admin`.

**Pricing**: Free $0 · Pro $20/mo (annual $192) · Max $100/mo (annual $960).

**Daily report limits** (`infrastructure/lambda/api/app.py` `plan_limits`): free 3, pro 15, max 9999, admin 9999.

**Max differentiators vs Pro**: unlimited reports, cross-report memory in Muse, Muse model selection (Claude, GPT, Gemini, Perplexity vs. Pro's default model). Stripe price IDs live in the SAM template (`STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_PRO_ANNUAL`, `STRIPE_PRICE_ID_MAX`, `STRIPE_PRICE_ID_MAX_ANNUAL`).

**Build Brief gating**: Build Brief is a Pro feature. Free users get a **small daily allowance** — **temporary beta: 3/day** via env `FREE_BUILD_BRIEF_DAILY_LIMIT` (default 3), tracked by `free_brief_count_today` + `free_brief_count_date` on the `USER#{user_id}` row, reserved atomically per generation and reset daily (UTC); once today's allowance is spent the pane shows the Pro upsell. (Long-term spec is **one lifetime sample**; revert by lowering the env var or reverting the daily-counter commit. The old `free_build_brief_used` flag is now unused and just lingers on existing rows.) GET `/api/build-brief/{report_id}` is open to all authenticated users and returns `free_brief_used` so the frontend can render the correct CTA. Paid plans (Pro, Max, admin) have no cap.

**Things on the pricing page that are NOT plan-gated yet**: Brave Search + Wikipedia + Wikidata enrichment runs on every report regardless of plan (`infrastructure/lambda/ai-orchestration/app.py:133–246`). Model selection is unimplemented — every plan uses the same Bedrock pipeline (**Nova Micro** on Parse/Search, **DeepSeek V3.2** on Analyse, **Nova 2 Lite** on Summarise). Canonical IDs and deploy notes: `docs/operations/BEDROCK-MODEL-CONFIG.md`. If a future feature claims to gate either, verify the backend actually checks the plan before adding the row to PricingSection.

There is no Team plan and no multi-seat workflow. Teams considering plinths are routed to a "Contact us" affordance (not built yet). If a future feature implies team usage, push back rather than scope-creeping it.

## Muse — Chat Agent (backend built; in active dev)

Conversational agent that lets authenticated users ask questions about a generated report and run general market-research Q&A. **Muse** is the brand/UI name; older docs (`docs/planning/BACKLOG.md`, `docs/planning/05-milestones-and-sprints.md`) still call it "chat" — both refer to the same surface.

**Status:** backend is built and deployed in the dev stack; the frontend (`useMuse`) consumes the live stream. The Pro tier (default Bedrock model) works end-to-end. Max-only features — cross-report memory and multi-model selection — are scaffolded but not wired (the `gsi1pk=ORG#…` index is reserved for cross-report queries; the OpenAI/Google/Perplexity integrations are not built). Backend implementation notes: `docs/muse/MUSE-BACKEND-HANDOFF.md` (authoritative SSE spec) and `docs/muse/MUSE-IMPLEMENTATION-PLAN.md`.

**Implemented architecture:**
- **Transport: SSE over a Lambda Function URL** (`MuseStreamFunction`, `InvokeMode: RESPONSE_STREAM`). The AWS Lambda Web Adapter (LWA) layer bridges the Function URL's streaming protocol to ordinary HTTP, where `uvicorn` serves a Starlette ASGI app (`infrastructure/lambda/muse/stream.py`) using `sse-starlette`. CloudFront proxies `/api/muse/stream*` to the Function URL with OAC SigV4 signing; the URL is `AuthType: AWS_IAM` so only CloudFront-signed requests reach it. SSE events: `token` / `sentence_boundary` / `done` / `error` + 15s keep-alives.
- **Auth on the stream:** Function URLs bypass the API GW authorizer, so `stream.py` verifies the `ml_access` cookie itself via the `plinths_auth` layer (`PlinthsAuthLayer`) at request time.
- **Sync routes** (`MuseSyncFunction`, normal API GW + authorizer, `infrastructure/lambda/muse/sync.py`): list / delete a thread and post per-message feedback.
- **DynamoDB key schema** (`MuseConversationsTable`, `infrastructure/lambda/muse/persistence.py`): `pk=REPORT#{report_id}`, `sk=MSG#{iso_ts}#{message_id}` (lexicographic time order); `gsi1pk=ORG#{org_id}`, `gsi1sk={iso_ts}#{report_id}` — the GSI is reserved for Max cross-report memory.
- **Model:** Pro uses `BedrockModelIdMuseChat` (default `amazon.nova-2-lite-v1:0`) via `InvokeModelWithResponseStream`. Caps via env: `MUSE_FREE_DAILY_LIMIT` (3), `MUSE_PRO_MESSAGE_CAP` (~30/report), `MUSE_HISTORY_TURN_LIMIT` (12). Free-tier daily counter writes to `USER#{user_id}` rows on the Reports table (scoped `UpdateItem` on `USER#*` leading keys only).

**UI direction (locked):**
- **Inline conversation** lives in the workspace once a report exists — chat thread renders below the report on submit.
- **The report collapses into a toggle** when chat starts: a toggle button appears in the input toolbar next to the plinths wordmark — `▬▬` mini-saturation mark when the chat is active (tap opens the report fullscreen), chat-bubble glyph when the report is open (tap returns to the conversation). The toolbar has no toggle when chat is idle.
- **Per-report thread**, persisted across sessions. When a user opens an old report from the sidebar, default to chat-view if a thread exists, report-view otherwise.
- **No split-screen.** The "report-as-toggle" pattern means desktop and mobile behave identically — single-attention focus at any moment.
- **Empty state copy** (no greeting bubble): a single Plex Mono line where the thread will be — `MUSE · ready · grounded in this report`.
- **No layoutId morph between the report and the toggle.** An earlier iteration animated the report shrinking into the toolbar button via shared `layoutId`. Removed — the spring physics over a large bounding box read as cinematic, not as a professional tool. View swaps are plain mount/unmount with no spring or scale animation. (`layoutId="ml-input"` for the landing↔compact input morph is preserved — that's a different element, smaller delta, and still earns its keep.)

**Decided:**
- Auth: required (Cognito SSO + existing JWT authorizer); no anonymous access
- Persistence: per-report thread in DynamoDB, durable per-user across sessions
- Tier gating: Free → locked placeholder with paywall to Pro · Pro → ~30 messages per report on a default model · Max → unlimited messages, **cross-report memory** (Muse cites the user's other reports inline), and **model selection** (Claude, GPT, Gemini, Perplexity)
- Models for chat: Pro uses a single default model on Bedrock (**Amazon Nova 2 Lite** unless product changes it). Max requires three new API integrations (OpenAI for GPT, Google AI for Gemini, Perplexity API), each with its own SSM SecureString secret + IAM-scoped permission. Plan accordingly when scaffolding.
- Tools: Brave Search API for live retrieval (reuse existing SSM-stored key + scoped IAM)

**Craft (locked 2026-05-12) — non-negotiable for build:**

Direction: "prestigious LLM" register (Perplexity-grade) executed in the Pale Intelligence palette. The conversation reads as a series of document Q/A pairs, not as a chat exchange.

- **Turn format:** each turn is rendered as a **document pair** — user query is a serif heading (`var(--font-display)`, ~1.5rem, weight 500) with a hairline rule under it; the Muse answer is a self-contained block beneath. No bubbles, no avatars, no right-alignment, no left-side speaker rules. The hierarchy *is* the speaker indicator.
- **Sources row** (Muse turns only): a `GROUNDED IN` label in mono uppercase followed by a horizontal row of citation pills, sitting above the prose. The row tells the reader what report cells the answer rests on before they read it. Hidden when sources are empty.
- **No "thinking" state.** The model just responds — sources row appears, then prose streams. No status lines, no "researching..." copy, no typing dots. The chat-style instinct to fill the pre-response gap with chrome was rejected — empty space + immediate streaming reads more like a normal chat and less like a stage performance.
- **Prose:** Muse answers in `var(--font-display)` at 1.0625rem, line-height 1.7, capped at ~38rem column width. Inline `**bold**` supported. Citation tokens use `[[target|Label]]` syntax in the model output; rendered as inline pills. Stream-safe — partial `[[…` tokens degrade to plain text and snap into pills on `]]`.
- **Citation pills:** mono, 0.8125rem (larger than a footnote — first-class), `--signal` color with `--signal-light` background and `--signal-border` border. Tap → view flips to `report-open`, the matching `[data-muse-cell="<target>"]` element scrolls into view (smooth, centered) and pulses once (1.6s ring in `--signal-light`). `ReportView` carries stable `data-muse-cell` attributes (`competitor-N` / `gap-N` / `roadmap-N`, 1-indexed); routing logic lives in the muse integration in `App.tsx` so `ReportView` stays pure. Cross-report citations on Max get a filing-tab glyph (`⌗ Other report · Cell`) instead of square brackets.
- **Action row:** below the prose, two groups split with `justify-between`. Left group: mono uppercase buttons — `COPY · REGENERATE · CITE AS MARKDOWN`. Right group: thumbs-up / thumbs-down icon buttons (`MuseFeedback`) for per-response feedback. Thumbs are toggle-able; active state colors up = `--signal`, down = `--warning`. Feedback persists with the thread (localStorage in preview, DynamoDB-bound when backend lands).
- **Follow-up chips:** vertical list (not pill buttons) with hairline top/bottom borders. Each row is a question + right arrow that slides on hover. Tap → fires the question through `sendMessage`. 3 per Muse turn.
- **Toggle glyph (destination semantics):** the icon shows *where the tap will take you*, not what action it performs. The slot is **empty** when there's no destination — no disabled placeholder, no ghost paperclip. **Chat active:** a two-bar mini-saturation mark (`▬▬`) — tap opens the report. **Report open:** a chat-bubble glyph (lucide `MessageSquare`) — tap returns to the conversation. Never an `✕` (reads as "delete"). Never a paperclip (implies an attachment affordance that doesn't exist).
- **Back-to-chat banner (citation-only):** when the user arrives at the report via a citation pill, a sticky banner appears at the top of the report column: `FROM YOUR CONVERSATION` on the left, `← BACK TO CHAT` button on the right. Mono uppercase. Tap returns to the thread. The banner does **not** appear when the user opens the report via the toolbar toggle — that's an explicit nav action and the banner would be redundant chrome. Opening via toolbar / closing via toolbar both clear `highlightTarget` so the banner state stays honest about how the user arrived.
- **Streaming rhythm:** char-by-char with ~240ms settle at sentence boundaries (`.?!`). Settles are skipped while *inside* a `[[…]]` citation token. Stream cursor is a 1px-wide vertical line in `--text-secondary` that blinks at 1s steps. No "Muse is typing…" dots.
- **Per-report scoping:** threads are keyed by `reportId` and persisted to localStorage (preview only — production will hit DynamoDB). Switching reports in the sidebar surfaces each report's own conversation; opening a report with an existing thread defaults to chat-view.

**Frontend wiring (live):** Muse is a real workspace feature, no longer behind a preview flag — the `?muse=1` / `?muse=demo` / `VITE_MUSE_PREVIEW` gates and canned mock replies have been removed. `frontend/src/hooks/useMuse.ts` POSTs to `/api/muse/stream` and consumes the live SSE stream (`streamMuseMessage` in `src/api.ts`); `event: token` appends to `streamingText`, `done` finalizes. Source: `frontend/src/hooks/useMuse.ts`, `frontend/src/components/muse/*`, integration in `frontend/src/App.tsx` and `frontend/src/components/AnimatedAiInput.tsx`.

**Still TBD:**
- Max-only features — cross-report memory (query the reserved `gsi1pk=ORG#…` index) and multi-model selection (OpenAI/Google/Perplexity integrations, each needing its own SSM SecureString + scoped IAM). Not built.
- Animation timings: currently plain mount/unmount on view swap (no morph). Revisit only if hard snapping reads as broken in real use.

**Naming convention when scaffolding:** Lambda dir `infrastructure/lambda/muse/`, API route prefix `/api/muse`, frontend hook `useMuse`, types prefixed `Muse*` (e.g., `MuseMessage`, `MuseConversation`).

**Out of scope for CLAUDE.md:** the system prompt / training behavior of Muse is owned by the user and will be engineered separately — do not invent prompt rules here.

## TypeScript Rules (verbatimModuleSyntax is ON)

- Use `import type { Foo }` or `import { type Foo }` for all type-only imports.
- Framer Motion `ease` values must be string literals: `'easeOut' as const`.

## Design System — Pale Intelligence

Two themes (full token tables + rationale live in `DESIGN.md`, the source of truth):
- **`light` — Pale Intelligence** (default): warm parchment backgrounds, dark ink interactions, warm-sepia signal, amber on the wordmark only.
- **`stealth` — Stealth**: neutral near-black canvas (chroma 0), off-white accent, and warm amber (`#c9965a`) as the *only* color in the UI — it doubles as both signal and logo accent.

Theme preference is `'light' | 'stealth' | 'system'` (resolves to `'light' | 'stealth'`) via `src/theme.ts`; persisted in localStorage key `'plinths-theme'`; applied as `data-theme` on `<html>`. A legacy stored value of `'dark'` is migrated to `'stealth'` on read.

**Color tokens** (OKLCH) in `src/index.css`:
- `--bg / --surface / --surface-alt`: warm parchment scale (light) / near-black scale (stealth)
- `--text / --text-secondary / --text-muted`: warm charcoal scale
- `--accent`: dark ink / off-white (all interactive elements)
- `--signal`: warm sepia ink in light (`oklch(34% 0.05 65)`); amber in stealth (scores, data highlights, Muse citation pills)
- `--logo-accent`: warm amber — in light, **restricted to the "plinths" wordmark only**; in stealth it's the single UI accent
- `--success/warning/danger`: green / amber / coral

**Fonts**: IBM Plex Serif (`--font-display`), IBM Plex Sans (`--font-body`), IBM Plex Mono (`--font-mono`)

**Saturation score color**: ≤40 → `--success`, ≤65 → `--warning`, >65 → `--danger`

## Animation

- Entry: `opacity 0→1` + `y 8→0`, `easeOut`, ~0.35–0.4s
- Stagger: `0.06–0.09s`
- Score count-up: RAF loop, cubic ease-out, 700–1200ms
- Nothing longer than 400ms except data-driven count-ups

## Infrastructure

- **SAM**: Lambdas, API Gateway, S3, CloudFront, DynamoDB
- **Terraform**: IAM roles (CD role with GitHub OIDC)
- **Bedrock**: 3-model pipeline — **Nova Micro** (Parse/Search), **DeepSeek V3.2** (Analyse), **Nova 2 Lite** (Summarise). See `docs/operations/BEDROCK-MODEL-CONFIG.md`.
- **Brave Search API**: Real web search for competitor/market data (key in SSM Parameter Store)
- **Lambda Durable Functions**: AI pipeline with automatic checkpointing per stage
- **Muse analytics**: Chat rows flow `MuseConversationsTable` → DynamoDB Streams → forwarder Lambda → Firehose (JSON→Parquet via Glue schema) → `marketlens-muse-raw-${Stage}` S3 → Athena (`plinths_muse_${Stage}.muse_messages`). See `docs/muse/MUSE-ANALYTICS-PIPELINE.md` for schema, runbook, and Athena queries.

## IAM & Least Privilege

All IAM policies follow the principle of least privilege. When adding new permissions:

- **Bedrock**: scope `bedrock:InvokeModel` to the exact foundation model ARNs used, not `*`
- **SSM Parameter Store**: scope `ssm:GetParameter` to the exact parameter ARN (e.g. `/marketlens/${Stage}/brave-search-api-key`), not a wildcard path
- **DynamoDB**: use SAM policy templates (`DynamoDBCrudPolicy`, `DynamoDBReadPolicy`) scoped to the specific table
- **S3**: use SAM policy templates (`S3CrudPolicy`) scoped to the specific bucket
- **Secrets Manager**: scope to the exact secret ARN, not `*`
- **Lambda invoke**: scope to the exact function ARN, not `*`

Never use wildcard (`*`) resources in IAM statements. If a new external API key or parameter is added, create a dedicated SSM parameter and add a scoped IAM permission for only that parameter.

## Security Rules — Lambda Authorizer

The authorizer (`infrastructure/lambda/authorizer/app.py`) must **always Deny** when auth state is uncertain. Never return `Allow` on an error path. Concretely:

- Wrong or missing `token_use` → **Deny**
- User record not found in DynamoDB → **Deny**
- DynamoDB lookup throws (throttle, transient error) → **Deny**
- JWT validation fails for any reason → **Deny** (already correct)

The pattern is: only return `Allow` when you have confirmed a valid JWT *and* a found user record with an `org_id`. Every other branch is `Deny`.

## Security Rules — Secrets in Lambda

**Never** put secret values directly in Lambda environment variables via `!GetAtt` or `!Ref` of a secret-bearing resource. Environment variables are visible in plaintext in the Lambda console and CloudFormation stack state.

Instead: store secrets in SSM SecureString and read them at Lambda cold start:

```python
_SECRET_CACHE: str | None = None

def _get_secret() -> str:
    global _SECRET_CACHE
    if _SECRET_CACHE is None:
        ssm = boto3.client("ssm")
        _SECRET_CACHE = ssm.get_parameter(
            Name=os.environ["MY_SECRET_PARAM"],
            WithDecryption=True,
        )["Parameter"]["Value"]
    return _SECRET_CACHE
```

The SSM parameter itself is populated manually after the first deploy (since CloudFormation cannot write SecureString from a resource attribute). Add an `ssm:GetParameter` IAM permission scoped to the exact parameter ARN.

## Security Rules — DynamoDB Consistency

When a `TransactWriteItems` call raises `TransactionCanceledException` (concurrent write won), the fallback `get_item` to read the winning write **must** use `ConsistentRead=True`. Without it, eventual consistency can cause the read to miss the item that was just written, causing an unhandled exception to bubble up.

```python
result = table.get_item(Key={...}, ConsistentRead=True)
```
