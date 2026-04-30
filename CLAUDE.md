# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**MarketLens** — AI-powered market intelligence platform. Users type a business idea and receive a competitive landscape, saturation score, and entry roadmap.

## Repository Structure

```
├── template.yaml                  # SAM template (S3, CloudFront, API GW, DynamoDB, Lambdas)
├── samconfig.toml                 # SAM deploy config
├── infrastructure/
│   └── lambda/
│       ├── api/                   # REST API Lambda (Python, Powertools)
│       ├── ai-orchestration/      # AI pipeline Lambda (Python, Durable Function)
│       └── export/                # CSV export Lambda (Python, Powertools)
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

**State machine** (`useAnalysis.ts`): `'landing' | 'analysis' | 'report'`
- On search: POST `/api/reports` → get `report_id` → poll GET `/api/reports/{id}` every 3s
- Cosmetic animation runs during polling (9 stages, RAF-driven)
- On `status: "complete"`: stop polling, adapt response, show report
- Timeout: 120s → show error with retry button

**API URL config**:
- `frontend/.env` sets `VITE_API_BASE_URL` for local dev (points to API Gateway)
- On CloudFront: `VITE_API_BASE_URL` is empty, so requests go to `/api/*` which CloudFront proxies to API Gateway

## TypeScript Rules (verbatimModuleSyntax is ON)

- Use `import type { Foo }` or `import { type Foo }` for all type-only imports.
- Framer Motion `ease` values must be string literals: `'easeOut' as const`.

## Design System — Night Sky Aurora

Dark mode. Deep midnight blue + electric sky blue accent + violet signal.

**Color tokens** (OKLCH) in `src/index.css`:
- `--bg`: deep space blue-black
- `--surface`: midnight navy
- `--accent`: electric sky blue (interactions)
- `--signal`: electric violet (gap scores, brief ID)
- `--success/warning/danger`: cyan-teal / amber / coral-red

**Saturation score color**: ≤40 → `--success`, ≤65 → `--warning`, >65 → `--danger`

## Animation

- Entry: `opacity 0→1` + `y 8→0`, `easeOut`, ~0.35–0.4s
- Stagger: `0.06–0.09s`
- Score count-up: RAF loop, cubic ease-out, 700–1200ms
- Nothing longer than 400ms except data-driven count-ups

## Infrastructure

- **SAM**: Lambdas, API Gateway, S3, CloudFront, DynamoDB
- **Terraform**: IAM roles (CD role with GitHub OIDC)
- **Bedrock**: Claude 3 Haiku (`anthropic.claude-3-haiku-20240307-v1:0`) for all LLM calls
- **Lambda Durable Functions**: AI pipeline with automatic checkpointing per stage
