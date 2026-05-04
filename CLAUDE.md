# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Plinths** — AI-powered market intelligence platform (beta, live on production domain). Users type a business idea and receive a competitive landscape, saturation score, and entry roadmap. A conversational agent ("Muse") is in active development — see the **Muse** section below.

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
│       ├── export/                # CSV export Lambda (Python, Powertools)
│       └── muse/                  # Chat agent Lambda (planned — see Muse section)
├── infra/
│   └── iam/                       # Terraform (CD role, OIDC provider)
├── frontend/                      # React + Vite + TypeScript
├── .github/workflows/             # CI + CD pipelines
├── events/                        # SAM local test events
└── docs/                          # Architecture documentation
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

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/reports` | Create report, body: `{"idea_text": "..."}` |
| GET | `/api/reports/{report_id}` | Get report (poll until `status: "complete"`) |
| GET | `/api/reports` | List all reports |
| POST | `/api/reports/{report_id}/export` | Export CSV, returns `{"download_url": "..."}` |

No auth required (dev mode).

## Actual Backend Response Schema

**IMPORTANT**: The backend returns a FLAT structure, NOT the nested schema described in `docs/03-ai-pipeline.md` §9. The docs describe the target schema; the current implementation returns this:

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
- `src/api.ts` — fetch wrapper, types for backend response (`ResultJson`, `ApiReport`)
- `src/adapter.ts` — transforms `ResultJson` → `MarketReport` (frontend type)
- `src/hooks/useAnalysis.ts` — state machine: create report → poll → adapt → display
- `src/types.ts` — frontend-only types (`MarketReport`, `PipelineStage`, etc.)
- `src/motion.ts` — shared Framer Motion presets (`landingEntryInitial`, `landingEntryAnimate`)
- `src/theme.ts` — theme preference helpers (`getThemePref`, `setThemePref`, `initTheme`)
- `src/mockData.ts` — fixture `MarketReport` used by `VITE_USE_MOCK` and demo states

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

## Muse — Chat Agent (in progress)

Conversational agent that lets authenticated users ask questions about a generated report and run general market-research Q&A. **Muse** is the brand/UI name; older docs (`docs/BACKLOG.md`, `docs/05-milestones-and-sprints.md`) still call it "chat" — both refer to the same surface.

**Status:** architecture in progress. Backend is not yet scaffolded; UI placement and transport are not yet decided. Do not assume either when generating code — ask.

**Decided:**
- Auth: required (Cognito SSO + existing JWT authorizer); no anonymous access
- Persistence: per-user conversation history in DynamoDB, durable across sessions
- Models: same Bedrock pipeline as the report (Nova Micro / DeepSeek V3.2 / Claude 3 Haiku) for now; per-task model selection is a later phase
- Tools: Brave Search API for live retrieval (reuse existing SSM-stored key + scoped IAM)
- Tier-gated paid feature (see `docs/05-milestones-and-sprints.md`); free tier sees a locked placeholder

**TBD — flag rather than guess:**
- UI surface — side panel on report? floating widget? dedicated `/muse` route? Owner is architecting next.
- Transport — SSE / WebSocket / Lambda response streaming / plain JSON. Pending research; affects API Gateway type and Lambda config.
- History scope — current direction is **per user across sessions**. The older planning docs describe history as **per report** with message caps (~30 Pro / ~100 Plus). Reconcile with the user before designing the DynamoDB key schema.

**Naming convention when scaffolding:** Lambda dir `infrastructure/lambda/muse/`, API route prefix `/api/muse`, frontend hook `useMuse`, types prefixed `Muse*` (e.g., `MuseMessage`, `MuseConversation`). Keep "chat" only inside the older docs until those are revised.

**Out of scope for CLAUDE.md:** the system prompt / training behavior of Muse is owned by the user and will be engineered separately — do not invent prompt rules here.

## TypeScript Rules (verbatimModuleSyntax is ON)

- Use `import type { Foo }` or `import { type Foo }` for all type-only imports.
- Framer Motion `ease` values must be string literals: `'easeOut' as const`.

## Design System — Pale Intelligence

Light mode by default. Warm parchment backgrounds, dark ink interactions, single amber logo accent.
Theme toggle (light/dark/system) via `src/theme.ts`; persisted in localStorage key `'plinths-theme'`;
applied as `data-theme` attribute on `<html>`.

**Color tokens** (OKLCH) in `src/index.css`:
- `--bg / --surface / --surface-alt`: warm parchment scale
- `--text / --text-secondary / --text-muted`: warm charcoal scale
- `--accent`: dark ink (all interactive elements)
- `--signal`: slate blue (scores, data highlights)
- `--logo-accent`: warm amber — **restricted to "Lens" wordmark only**
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
- **Bedrock**: 3-model pipeline — Nova Micro (Parse/Search), DeepSeek V3.2 (Analyse), Claude 3 Haiku (Summarise)
- **Brave Search API**: Real web search for competitor/market data (key in SSM Parameter Store)
- **Lambda Durable Functions**: AI pipeline with automatic checkpointing per stage

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
