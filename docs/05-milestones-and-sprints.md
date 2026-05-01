# 05 — Milestones & Sprints

> Build plan for MarketLens. PoC-first: prove the pipeline works with minimal infra, then layer in enterprise features.

**Status:** v1.1 · **Owner:** Engineering Lead · **Last reviewed:** April 2026
**Team:** Solo founder · **Velocity:** 2–4 hrs/day · **Start date:** TBD

---

## The Core Principle

> Prove the value first. Harden second.

This plan starts with the simplest possible AWS deployment — Lambda Durable Functions + API Gateway + S3 — to get a working "idea in, report out" loop. The full microservices architecture (ECS, RDS, RBAC, multi-tenancy) comes after the PoC proves the AI pipeline produces reports people actually want.

| PoC (Phase 0) | Full Architecture (Phase 1+) |
|---|---|
| 2 S3 buckets (frontend + exports) | Multi-bucket with Object Lock, lifecycle policies |
| 3 Lambdas (API + durable pipeline + export) | 10 microservices on ECS Fargate + Lambda |
| API Gateway (REST) + CloudFront | API Gateway + WAF + per-tenant throttling |
| DynamoDB (reports table) | RDS Postgres with RLS + DynamoDB + ElastiCache |
| SAM + Terraform (IAM) for deployment | SAM (application layer) + Terraform (infrastructure layer) |
| No auth (hardcoded user) | Cognito + JWT + RBAC + Permission Engine |
| Python only | Python (AI) + TypeScript (services) + Rust or Go (Permission Engine, Audit) |

---

## Timeline Overview

| Phase | Name | Duration | Cumulative | Goal |
|---|---|---|---|---|
| 0 | PoC — Prove the Pipeline | Days 1–5 | Day 5 | Idea in → report out, deployed on AWS |
| 1 | Foundation & Full Pipeline | Days 6–13 | Day 13 | AWS skeleton, data layer, audit chain, CI/CD |
| 2 | Auth & Users | Days 14–19 | Day 19 | Real accounts, login, org isolation |
| 3 | Beta Launch | Days 20–23 | Day 23 | Wire UI to backend, invite flow, private beta live |
| 4 | Billing | Days 24–28 | Day 28 | Stripe, credits, free vs paid |
| 5 | Hardening Snap-ins | Ongoing post-beta | — | RBAC rules, audit depth, DR, compliance |

**PoC target: Day 5** — working pipeline you can demo.
**Private beta target: Day 23–28** (roughly 4 weeks at 2–4 hrs/day).

> **Rule:** If a day runs over, protect the next day. Don't compound. One hard day doesn't mean the plan is broken.

---

## Phase 0 — PoC: Prove the Pipeline (Days 1–5)

> **Goal:** Type an idea, get a real AI-generated market report back. Deployed on AWS. Minimal infra.

### Architecture

```text
┌──────────────┐     ┌─────────────────┐     ┌──────────────────────────────────┐
│   React/Vite │────▶│  API Gateway    │────▶│  Lambda: run-pipeline            │
│   (UI)       │     │  (REST)         │     │  (Python, Durable Function)      │
└──────────────┘     └────────┬────────┘     │                                  │
                              │              │  context.step('sanitize')         │
                              │              │  context.step('parse')     → LLM  │
                              │              │  context.step('search')    → Web  │
                              │              │  context.step('analyse')   → LLM  │
                              │              │  context.step('score')            │
                              │              │  context.step('summarise') → LLM  │
                              │              │  context.step('assemble')         │
                              │              │  → writes result to DynamoDB      │
                              │              └──────────────────────────────────┘
                              │
                              │              ┌──────────────────────────────────┐
                              └─────────────▶│  Lambda: get-report              │
                                             │  (Python)                        │
                                             │  → reads from DynamoDB           │
                                             └──────────────────────────────────┘

                                             ┌──────────────────────────────────┐
                                             │  DynamoDB: ReportsTable          │
                                             │  PK/SK: REPORT#{report_id}       │
                                             │  attrs: status, current_stage,   │
                                             │         result_json, completed_at │
                                             └──────────────────────────────────┘
```

### IaC: AWS SAM

All PoC infrastructure defined in a single `template.yaml`. Deploy with `sam build && sam deploy`.

Terraform is added in Phase 1 for the heavier infrastructure (VPC, RDS, ECS). SAM and Terraform coexist — SAM for the application layer, Terraform for the infrastructure layer.

### Why Lambda Durable Functions (not Step Functions)?

- **Simpler** — entire pipeline is one Lambda with `context.step()` per stage. No state machine JSON to manage.
- **Built-in checkpointing** — each step's result is persisted automatically. If a step fails, retry picks up where it left off.
- **Same resilience** — retry logic, state persistence, up to 1 year execution time.
- **Less infra** — no separate state machine, no SQS queue, no separate Lambda per stage.
- **Migration path** — can move to Step Functions later if you need the visual debugging or complex branching features.

### Day 1 — AWS Setup + SAM Skeleton

- [x] Create GitHub repo with monorepo structure
- [x] Install AWS SAM CLI, configure AWS credentials
- [x] Create SAM `template.yaml`: S3 buckets, 3 Lambdas (API, AI Orchestration, Export), API Gateway (REST), DynamoDB, CloudFront
- [x] Install Python Durable Execution SDK: `pip install aws-durable-execution-sdk-python`
- [x] Stub `api` Lambda: REST endpoints for reports CRUD using Powertools
- [x] Stub `ai-orchestration` Lambda: durable function with 7 `context.step()` calls returning mock data
- [x] Stub `export` Lambda: CSV generation with presigned S3 download URLs
- [x] `sam build && sam deploy` — confirmed everything deploys clean
- [x] Test: `curl POST /api/reports` → returns `report_id`; `curl GET /api/reports/{id}` → returns complete AI-generated report

**Done when:** All Lambdas deployed. API Gateway returns responses. S3 buckets and DynamoDB table exist.

---

### Day 2 — Sanitize + Parse (Real LLM)

**Reference:** [03 — AI Pipeline §2 (Sanitize), §3 (Parse)](./03-ai-pipeline.md)

- [x] Implement `sanitize` step: length check, basic validation
- [x] Implement `parse` step: Bedrock Claude 3 Haiku call, structured JSON output
- [x] Use AWS Bedrock (no external API keys needed — IAM-based auth)
- [x] Attach `AWSLambdaBasicDurableExecutionRolePolicy` to Lambda execution role
- [ ] Unit tests: sanitize rejects bad inputs, parse returns valid schema
- [x] Test end-to-end: real idea text → sanitized → parsed to structured JSON → checkpointed

**Done when:** First two pipeline steps run with a real LLM call. Durable checkpointing works.

---

### Day 3 — Search + Analyse + Score

**Reference:** [03 — AI Pipeline §4 (Search), §5 (Analyse), §6 (Score)](./03-ai-pipeline.md)

- [x] Implement `search` step: competitor lookup via Bedrock LLM (real search API integration later)
- [x] Implement `analyse` step: Bedrock LLM call, competitor list extraction, schema validation
- [x] Implement `score` step: deterministic Saturation, Difficulty, Opportunity algorithm (full design-doc formula)
- [x] Graceful degradation: if LLM returns invalid JSON, fallback to defaults (don't kill the pipeline)
- [x] Multi-model pipeline: Nova Micro (Parse/Search), DeepSeek V3.2 (Analyse), Claude 3 Haiku (Summarise)
- [x] Provider-aware payload handling: Anthropic, DeepSeek (OpenAI-style), and Nova formats
- [x] Richer prompts: Parse extracts sub_industry, complexity, market age; Search returns 10-15 competitors with funding/TAM/growth; Analyse outputs structured scoring signals
- [ ] Unit test scoring algorithm: known inputs → expected outputs

**Done when:** Given an idea, returns scored competitor list. Scores are deterministic.

---

### Day 4 — Summarise + Assemble + DynamoDB Storage

**Reference:** [03 — AI Pipeline §7 (Summarise), §8 (Assemble), §9 (Final Report Schema)](./03-ai-pipeline.md)

- [x] Implement `summarise` step: Bedrock Claude 3 Haiku call, beginner-friendly "startup advisor" prose
- [x] Implement `assemble` step: merge all outputs into final `result_json`
- [x] Write status updates to DynamoDB (pending → running → complete/failed)
- [x] Write `result_json` to DynamoDB on completion
- [x] API Lambda returns real report data via `GET /api/reports/{id}`
- [ ] Track token usage per LLM call in the result metadata
- [x] Test full pipeline end-to-end: real idea → real report in DynamoDB

**Done when:** Full pipeline produces a real report. Read the prose — does it sound like a smart friend explaining a market?

---

### Day 5 — Wire UI + Polish

- [x] Point React front-end at API Gateway URL (VITE_API_BASE_URL environment variable)
- [x] Implement polling: front-end calls `GET /api/reports/{id}` every 3s until status is `complete`
- [x] Error handling: failed pipeline → inline error with retry button (useAnalysis.ts)
- [x] CORS configuration on API Gateway
- [x] Deploy front-end to S3 + CloudFront
- [ ] Test the full loop: open browser → type idea → watch it process → read the report

**Done when:** You can demo the product to someone. Idea in, report out, in a browser.

---

## Phase 1 — Foundation & Full Pipeline (Days 6–13)

> **Goal:** Graduate from PoC to production-grade infrastructure. Add the data layer, audit chain, and CI/CD. The PoC Lambda stays — it just gets wired into the real architecture.

### Days 6–7 — AWS Infrastructure (Terraform)

**Reference:** [01 — Technical Spec §8 (AWS Infrastructure), §9 (IaC)](./01-technical-spec.md)

- [ ] Create Terraform repo (`marketlens-infra`) with remote state in S3 + DynamoDB lock table
- [ ] Create AWS account structure: `dev`, `staging`, `prod` accounts via AWS Organizations
- [ ] Enable CloudTrail (all regions), GuardDuty, S3 Block Public Access — account level
- [ ] Bootstrap VPC in `dev`: public subnet (ALB), private app subnet (ECS), private data subnet (RDS/DynamoDB)
- [ ] Security groups: default deny-all; explicit allow rules per service pair only
- [ ] Create KMS CMKs: one per environment (`dev`, `staging`, `prod`)
- [ ] Create remaining S3 buckets: audit-archive, search-cache, iac-state (see [04 §5](./04-data-model.md))
- [ ] Enable Object Lock on `audit-archive` bucket — do this NOW, cannot be added retroactively

**Done when:** `terraform apply` runs clean in `dev`. VPC, buckets, and security baseline exist.

---

### Days 8–9 — Data Layer

**Reference:** [04 — Data Model §2 (Postgres), §3 (RLS), §4 (DynamoDB)](./04-data-model.md)

- [ ] Provision RDS PostgreSQL in `dev` (Multi-AZ off for now — turn on for staging/prod)
- [ ] Run initial schema migration — all tables from [04 §2](./04-data-model.md), even ones you won't use yet
- [ ] Enable RLS on every table (policies in place, even if only one org exists)
- [ ] Create DynamoDB tables: `audit_events`, `sessions`, `pipeline_executions`, `notification_log`, `notification_preferences`
- [ ] Provision ElastiCache Redis cluster (single node for dev)
- [ ] Seed one org row + one super_admin user row — enough to test with
- [ ] Write and run migration smoke test: confirm RLS blocks query without `app.current_org_id` set
- [ ] Migrate pipeline from S3 storage to Postgres `market_reports` table

**Done when:** Postgres accepts queries, RLS is live and tested, DynamoDB tables exist. Pipeline writes to Postgres instead of S3.

---

### Days 10–11 — Audit Service (Skeleton)

**Reference:** [02 — Microservices §9 (Audit Service)](./02-microservices-design.md), [01 — Technical Spec §6 (Audit Logging)](./01-technical-spec.md)

- [ ] Build Audit Service: SQS consumer Lambda
- [ ] Implement hash chain: each event gets `checksum` + `prev_checksum` from day one
- [ ] Write to DynamoDB `audit_events` table
- [ ] Stream to S3 `audit-archive` via DynamoDB Streams → Lambda
- [ ] Wire pipeline Lambda to emit audit events on: report created, pipeline complete
- [ ] Integrity check Lambda: scheduled every 6h, SNS alert on chain break

> **Why now, not later?** The hash chain only works if it starts from record #1. You cannot add it retroactively. This is the one thing that truly cannot be bolted on.

**Done when:** Every report action produces an audit event. Chain integrity verified.

---

### Days 12–13 — CI/CD & Local Dev

**Reference:** [01 — Technical Spec §13 (CI/CD)](./01-technical-spec.md)

- [x] Create app monorepo with GitHub repo
- [x] GitHub Actions CI pipeline: lint, type check, Trivy security scan, Checkov IaC scan, Codecov
- [x] GitHub Actions CD pipeline: build frontend → S3 sync → CloudFront invalidation (with concurrency control)
- [x] IAM CD role with GitHub OIDC (Terraform, deployed) — least-privilege policy generated via IAM Policy Autopilot
- [x] Frontend deployed to S3 + CloudFront
- [ ] Local dev: `docker-compose.yml` with Postgres, Redis, LocalStack (for SQS/S3/DynamoDB)
- [ ] Shared packages: `logger` (structured JSON), `errors` (typed error classes), `db` (connection pool + RLS context setter)
- [ ] `.env.example` with all required env vars documented — no undocumented secrets ever
- [ ] Wire ElastiCache cache for search results: key pattern `search_cache:{sub_stage}:{query_hash}`, 1hr TTL

**Done when:** `docker-compose up` runs locally. Push to `main` auto-deploys to `dev`.

---

## Phase 2 — Auth & Users (Days 14–19)

> **Goal:** Real accounts. Real isolation. No more hardcoded user.

### Days 14–15 — Auth Service

**Reference:** [01 — Technical Spec §3 (Access Control)](./01-technical-spec.md), [02 — Microservices §3 (Auth Service)](./02-microservices-design.md)

- [ ] Provision Cognito User Pool: email/password, MFA optional (enforced for admins)
- [ ] Build Auth Service (ECS Fargate): wraps Cognito, manages sessions in DynamoDB
- [ ] Endpoints: `/auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout`
- [ ] JWT validation: API Gateway Lambda Authoriser — validates every request
- [ ] Authoriser injects `user_id`, `org_id` into request context — all downstream services read from context, never re-validate
- [ ] Session management: store in DynamoDB with TTL, idle timeout 30 min
- [ ] Wire Report Service: replace hardcoded org with `org_id` from JWT context

**Done when:** Sign up → login → JWT → call Report Service with real identity. RLS now uses real `org_id`.

---

### Days 16–17 — Permission Engine

**Reference:** [01 — Technical Spec §4–5 (RBAC)](./01-technical-spec.md), [02 — Microservices §4 (Permission Engine)](./02-microservices-design.md)

- [ ] Build Permission Engine (ECS Fargate, Go): gRPC server
- [ ] Implement `Authorize` RPC: resolve user roles → permission strings → allow/deny
- [ ] Start with 3 roles only: `org_owner`, `analyst`, `viewer` — extend later
- [ ] Cache permission sets in-process: 60s TTL refresh from Postgres
- [ ] Wire Report Service: every endpoint calls `Permission Engine.Authorize` before executing
- [ ] Wire Audit Service to log every `denied` decision

> **This is the snap-in point.** New roles, new permissions, new rules → add to Permission Engine only. No other service changes.

**Done when:** A `viewer` cannot create reports. An `analyst` can. An `org_owner` can do everything.

---

### Days 18–19 — Org & User Service

**Reference:** [02 — Microservices §5 (Org & User Service)](./02-microservices-design.md)

- [ ] Build Org & User Service (ECS Fargate, TypeScript)
- [ ] Endpoints: create org, invite user, list users, assign role, remove user
- [ ] Invite flow: email → one-time token → accept → Cognito user created → role assigned
- [ ] On any RBAC change: call `Permission Engine.RefreshPolicy` to bust cache
- [ ] Self-service: users can update display name, change password, view own sessions

**Done when:** You can create an org, invite a second user, assign them a role, and their permissions work immediately.

---

## Phase 3 — Beta Launch (Days 20–23)

> **Goal:** Wire the existing UI to the real backend. Something a real human can use without you explaining it.

### Days 20–21 — Wire UI + API Gateway & Polish

**Reference:** [01 — Technical Spec §11 (API Gateway)](./01-technical-spec.md)

- [x] Framework: React + Vite + TypeScript — fast to build, easy to iterate
- [x] Pages: Landing (idea input), Analysis (pipeline tracker), Report view (results)
- [x] Report view: scores as visual gauges, competitor cards, summary prose, "Where's the gap?" section
- [x] Wire UI to real backend APIs (api.ts, adapter.ts, useAnalysis.ts)
- [x] Polling: front-end polls `GET /api/reports/:id` every 3s while status is `pending`/`running`; cosmetic stage animation during wait
- [ ] Wire AWS API Gateway in front of all services (WAF entry point)
- [ ] Attach WAF: OWASP Core Rule Set, rate limiting per `org_id`
- [ ] Per-client throttling: free tier = 10 reports/hr, Pro = 100/hr
- [ ] Error messages: every error the user might see has a human-readable message (not a stack trace)
- [x] Loading states: pipeline tracker with 9 animated stages + finalizing state
- [x] Deploy: S3 + CloudFront (stays in AWS ecosystem)

---

### Days 22–23 — Private Beta Launch

- [ ] Invite list: 10–20 people who will give you honest feedback, not just say it's great
- [ ] Feedback mechanism: simple thumbs up/down on reports + optional free text
- [ ] Basic analytics: how many reports run, which ideas, where does the pipeline fail
- [ ] `staging` environment fully deployed — beta users hit staging, not dev
- [ ] On-call: just you, PagerDuty or simple CloudWatch alarm → SMS

**Done when:** First 10 beta users have submitted a real idea and got a real report back.

---

## Phase 4 — Billing (Days 24–28)

> **Goal:** Someone can pay you. Free tier has a ceiling.

**Reference:** [02 — Microservices §10 (Billing Service)](./02-microservices-design.md), [04 — Data Model §2 (subscriptions, invoices, credit_balances)](./04-data-model.md)

- [ ] Stripe integration: products, prices, checkout session, webhook handler
- [ ] Billing Service: subscription CRUD, invoice mirror, credit balance deduction
- [ ] Credit deduction: AI Orchestration calls `Billing.DeductCredits` after every pipeline run — wire was already stubbed in Phase 1
- [ ] Tier enforcement: Report Service calls `Billing.CheckUsageLimit` before accepting new query
- [ ] Free tier: 3 credits/month, hard stop with friendly message + upgrade CTA
- [ ] Upgrade flow: Stripe Checkout → webhook → subscription updated → credit balance topped up
- [ ] Low balance notification: < 5 credits remaining → email via Notification Service

**Done when:** A user on free tier hits their limit and sees an upgrade prompt. A paid user's card is charged.

---

## Phase 5 — Hardening Snap-ins (Post-Beta, Ongoing)

> **Goal:** Extend what's already there. Nothing gets rebuilt.

These are not blocked — they're deliberately deferred until beta proves the product has users worth protecting.

### RBAC Expansion
**Reference:** [01 — Technical Spec §4–5](./01-technical-spec.md)

- [ ] Add remaining roles: `team_manager`, `api_developer`, `auditor`, `billing_admin`
- [ ] Add all 6 platform roles: `super_admin`, `platform_ops`, `platform_support`, etc.
- [ ] Custom role builder: org owners compose permission strings via UI
- [ ] MFA step-up enforcement for privileged actions (delete, purge, admin, impersonate)

**Snap-in point:** Permission Engine already exists. Add roles → add permission strings → done. No other service changes.

---

### Audit Depth Expansion
**Reference:** [01 — Technical Spec §6](./01-technical-spec.md)

- [ ] Add all 8 event categories (currently only: data access + data mutation)
- [ ] Add: auth events, access control changes, billing events, security events, system events
- [ ] Audit log query UI for org `auditor` role
- [ ] Scheduled chain integrity report: weekly email to `org_owner`

**Snap-in point:** Audit Service already exists, hash chain already running. Add event types → wire more services to emit them.

---

### Multi-Tenancy Hardening
**Reference:** [01 — Technical Spec §7](./01-technical-spec.md)

- [ ] Test RLS with 10+ concurrent orgs
- [ ] Verify cross-tenant query is impossible (automated test suite for this)
- [ ] Separate KMS keys per org (Enterprise tier only)
- [ ] S3 prefix isolation tested under load

**Snap-in point:** RLS was on since Day 2. This phase just tests and stress-tests it.

---

### Disaster Recovery
**Reference:** [01 — Technical Spec §15](./01-technical-spec.md), [04 — Data Model §11](./04-data-model.md)

- [ ] Enable RDS Multi-AZ in prod
- [ ] Enable DynamoDB Global Tables (replicate to `us-west-2`)
- [ ] S3 cross-region replication
- [ ] Route 53 health checks + failover routing
- [ ] First GameDay exercise: simulate `us-east-1` outage, verify failover

**Snap-in point:** Single-region from day one. Multi-region is additive — same Terraform modules, second region added.

---

### Compliance Runway
**Reference:** [01 — Technical Spec §10](./01-technical-spec.md)

- [ ] Set up Vanta (SOC 2 evidence automation)
- [ ] Security Hub: CIS L1 findings remediated
- [ ] Privacy policy + DPA published
- [ ] GDPR deletion workflow live (see [04 §9](./04-data-model.md))
- [ ] Penetration test (external, before SOC 2 audit)

---

## Dependency Map

Some things genuinely block others. This is the order that matters:

```text
Phase 0 (PoC) — prove the pipeline works
  └── Phase 1 (Foundation) — add real infra, data layer, audit chain
        └── Phase 2 (Auth) — real accounts, org isolation
              └── Phase 3 (Beta) — wire UI to backend, launch
                    └── Phase 4 (Billing) — billing needs users
                          └── Phase 5 (Hardening) — fills in what's already wired

INDEPENDENT (can be done anytime after Phase 1):
  - Audit Service depth (Phase 5) — pipe exists from Day 11
  - Permission Engine role expansion — engine exists from Day 17
  - DR setup — infra exists from Phase 1
```

---

## Daily Habit

2–4 hours focused beats 8 hours scattered. Protect the habit:

1. **Start each session** by reading today's checklist — only today's.
2. **End each session** by ticking what's done and writing one sentence on what's next.
3. **If stuck for > 45 min** on one thing — skip it, flag it, move on. Come back.
4. **Scope creep rule:** any idea that comes up mid-build goes into a `BACKLOG.md` file. Not in your head. Not in this sprint.

---

## Metrics to Track From Day One

Even in private beta, measure these:

| Metric | Why |
|---|---|
| Pipeline success rate | Is the AI actually working? |
| Pipeline p99 latency | Are users waiting too long? |
| Reports per user per week | Are people coming back? |
| Degraded report rate | Which stage is failing most? |
| Cost per report (actual) | Is the unit economics holding? |
| Thumbs up / thumbs down ratio | Is the output actually useful? |

---

## Owners

| Area | Owner |
|---|---|
| All of it (for now) | You |
| First hire (when ready) | Wherever you're slowest — measure first |

---

← Previous: [04 — Data Model](./04-data-model.md) · Back to [README](../README.md)
