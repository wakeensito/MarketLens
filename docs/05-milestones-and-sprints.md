# 05 — Milestones & Sprints

> Build plan for MarketLens. Skeleton-first: the foundation is laid once, correctly. Each phase fills it in — nothing gets rebuilt, everything gets extended.

**Status:** v1.0 · **Owner:** Engineering Lead · **Last reviewed:** April 2026
**Team:** Solo founder · **Velocity:** 2–4 hrs/day · **Start date:** TBD

---

## The Core Principle

> Build the pipes on day one. Fill them in as you grow.

This plan is NOT "MVP now, security later." That always means painful rewrites.

Instead every service, table, and wire gets created in Phase 1 — just with minimal rules. Later phases don't add new architecture, they add logic to what already exists.

| What gets built ONCE (Phase 1) | What gets filled in (Phase 2+) |
|---|---|
| RLS on every Postgres table | More orgs, more isolation tested |
| Permission Engine service exists | More roles, more rules added |
| Audit Service wired to every service | More event categories logged |
| Stripe integration live | More tiers, more billing logic |
| Step Functions pipeline | More stages, better prompts |
| VPC + subnets + security groups | Same network, more services added |

---

## Timeline Overview

| Phase | Name | Duration | Cumulative | Goal |
|---|---|---|---|---|
| 0 | Foundation | Days 1–3 | Day 3 | AWS skeleton, local dev, CI/CD |
| 1 | Core Pipeline | Days 4–10 | Day 10 | Idea in → report out (working end-to-end) |
| 2 | Auth & Users | Days 11–16 | Day 16 | Real accounts, login, org isolation |
| 3 | UI & Beta | Days 17–23 | Day 23 | Front-end, invite flow, private beta live |
| 4 | Billing | Days 24–28 | Day 28 | Stripe, credits, free vs paid |
| 5 | Hardening Snap-ins | Ongoing post-beta | — | RBAC rules, audit depth, DR, compliance |

**Private beta target: Day 23–28** (roughly 4 weeks at 2–4 hrs/day).

> **Rule:** If a day runs over, protect the next day. Don't compound. One hard day doesn't mean the plan is broken.

---

## Phase 0 — Foundation (Days 1–3)

> **Goal:** Nothing runs yet, but everything has a place. No "I'll set that up later."

This phase feels slow. It pays back every single day after.

### Day 1 — AWS Skeleton

**Reference:** [01 — Technical Spec §8 (AWS Infrastructure), §9 (IaC)](./01-technical-spec.md)

- [ ] Create AWS account structure: `dev`, `staging`, `prod` accounts via AWS Organizations
- [ ] Enable CloudTrail (all regions), GuardDuty, S3 Block Public Access — account level
- [ ] Create Terraform repo (`marketlens-infra`) with remote state in S3 + DynamoDB lock table
- [ ] Bootstrap VPC in `dev`: public subnet (ALB), private app subnet (ECS), private data subnet (RDS/DynamoDB)
- [ ] Security groups: default deny-all; explicit allow rules per service pair only
- [ ] Create KMS CMKs: one per environment (`dev`, `staging`, `prod`)
- [ ] Create all S3 buckets (empty): reports, audit-archive, search-cache, iac-state (see [04 §5](./04-data-model.md))
- [ ] Enable Object Lock on `audit-archive` bucket — do this NOW, cannot be added retroactively

**Done when:** `terraform apply` runs clean in `dev`. All buckets exist. CloudTrail logging.

---

### Day 2 — Data Layer

**Reference:** [04 — Data Model §2 (Postgres), §3 (RLS), §4 (DynamoDB)](./04-data-model.md)

- [ ] Provision RDS PostgreSQL in `dev` (Multi-AZ off for now — turn on for staging/prod)
- [ ] Run initial schema migration — all tables from [04 §2](./04-data-model.md), even ones you won't use yet
- [ ] Enable RLS on every table (policies in place, even if only one org exists)
- [ ] Create DynamoDB tables: `audit_events`, `sessions`, `pipeline_executions`, `notification_log`, `notification_preferences`
- [ ] Provision ElastiCache Redis cluster (single node for dev)
- [ ] Seed one org row + one super_admin user row — enough to test with
- [ ] Write and run migration smoke test: confirm RLS blocks query without `app.current_org_id` set

**Done when:** Postgres accepts queries, RLS is live and tested, DynamoDB tables exist.

---

### Day 3 — CI/CD & Local Dev

**Reference:** [01 — Technical Spec §13 (CI/CD)](./01-technical-spec.md)

- [ ] Create app monorepo (`marketlens-app`): `/services`, `/cdk`, `/shared`
- [ ] GitHub Actions pipeline: lint → test → build → deploy to `dev` on merge to `main`
- [ ] ECR repositories: one per service
- [ ] Local dev: `docker-compose.yml` with Postgres, Redis, LocalStack (for SQS/S3/DynamoDB)
- [ ] Shared packages: `logger` (structured JSON), `errors` (typed error classes), `db` (connection pool + RLS context setter)
- [ ] `.env.example` with all required env vars documented — no undocumented secrets ever

**Done when:** `docker-compose up` runs locally. A dummy service deploys to `dev` via GitHub Actions.

---

## Phase 1 — Core Pipeline (Days 4–10)

> **Goal:** Type an idea, get a report back. No auth, no UI — just the engine working.

This is the heart of the product. Everything else is wrapper.

### Day 4 — AI Orchestration Skeleton

**Reference:** [02 — Microservices §7 (AI Orchestration)](./02-microservices-design.md), [03 — AI Pipeline §1 (Overview)](./03-ai-pipeline.md)

- [ ] Create Step Functions state machine: all 7 stages stubbed (each stage returns mock data)
- [ ] Wire SQS queue: `report-jobs-dev` → triggers Step Functions execution
- [ ] Create `pipeline_executions` DynamoDB writer — log every execution from day one
- [ ] IAM execution role for Step Functions: least-privilege, scoped to only what it needs
- [ ] Test: send a message to SQS → Step Functions runs → all stubs complete → execution logged

**Done when:** Full pipeline runs end-to-end with stubs. Logging works.

---

### Day 5 — Sanitize + Parse (Stages 1 & 2)

**Reference:** [03 — AI Pipeline §2 (Sanitize), §3 (Parse)](./03-ai-pipeline.md)

- [ ] Implement Stage 1 (Sanitize): length check, PII strip, prompt injection pattern match, fingerprint hash
- [ ] Implement Stage 2 (Parse): Anthropic API call with `claude-haiku-4-5`, structured JSON output, schema validation
- [ ] Store prompt template in `prompts/parse/v2.1.txt` — versioned from day one
- [ ] Unit tests: sanitize rejects bad inputs, parse returns valid schema
- [ ] Wire Anthropic API key via Secrets Manager (never in env vars or code)
- [ ] Test end-to-end: real idea text → sanitized → parsed to structured JSON

**Done when:** Stage 1 + 2 run with real LLM call. Output is valid JSON matching schema.

---

### Day 6 — Search (Stage 3)

**Reference:** [03 — AI Pipeline §4 (Search)](./03-ai-pipeline.md), [02 — Microservices §8 (Search Service)](./02-microservices-design.md)

- [ ] Choose and integrate search API provider (Brave Search API or Serper — pick one, move on)
- [ ] Implement Search Service Lambda: `web_search`, `competitor_lookup` functions
- [ ] Implement 3 parallel search sub-stages in Step Functions `Parallel` state
- [ ] Wire ElastiCache cache: key pattern `search_cache:{sub_stage}:{query_hash}`, 1hr TTL
- [ ] Graceful degradation: if search fails, return `unavailable` and continue (don't kill the pipeline)
- [ ] Test: parallel searches run, cache hit on second identical query

**Done when:** 3 parallel searches run in ~10s. Cache works. Failure doesn't kill pipeline.

---

### Day 7 — Analyse + Score (Stages 4 & 5)

**Reference:** [03 — AI Pipeline §5 (Analyse), §6 (Score)](./03-ai-pipeline.md)

- [ ] Implement Stage 4 (Analyse): `claude-sonnet-4-6` call, competitor list extraction, schema validation
- [ ] Implement Stage 5 (Score): deterministic algorithm — Saturation, Difficulty, Opportunity scores
- [ ] Unit test scoring algorithm thoroughly: known inputs → expected outputs (this is what users will trust)
- [ ] Test score breakdown is stored: sub-factors visible, not just the final number

**Done when:** Given search results, returns scored competitor list. Scores are deterministic (same input = same output every time).

---

### Day 8 — Summarise + Assemble (Stages 6 & 7)

**Reference:** [03 — AI Pipeline §7 (Summarise), §8 (Assemble)](./03-ai-pipeline.md)

- [ ] Implement Stage 6 (Summarise): `claude-sonnet-4-6` call, beginner-friendly prose output
- [ ] Implement Stage 7 (Assemble): merge all stage outputs into final `result_json` schema
- [ ] Write final result to `market_reports` Postgres table (status → `complete`)
- [ ] Emit `report.completed` event to EventBridge
- [ ] Wire token usage tracking: count tokens per LLM call, total stored on report row
- [ ] Test full pipeline end-to-end: real idea → real report in Postgres

**Done when:** Full pipeline produces a real report in the database. Check the prose — does it actually sound like a smart friend explaining a market?

---

### Day 9 — Report Service API

**Reference:** [02 — Microservices §6 (Report Service)](./02-microservices-design.md)

- [ ] Build Report Service (ECS Fargate, TypeScript): Express or Fastify
- [ ] Endpoints: `POST /reports` (submit idea), `GET /reports/:id` (poll status + result)
- [ ] RLS context: every DB query sets `app.current_org_id` from JWT (hardcode one org for now)
- [ ] Status polling: `pending` → `running` → `complete` / `failed`
- [ ] Store `report_progress` in Redis for lightweight polling
- [ ] Error handling: failed pipeline → status `failed` + error reason stored, user gets useful message

**Done when:** `POST /reports` triggers the pipeline. `GET /reports/:id` returns the result when complete.

---

### Day 10 — Audit Service (Skeleton)

**Reference:** [02 — Microservices §9 (Audit Service)](./02-microservices-design.md), [01 — Technical Spec §6 (Audit Logging)](./01-technical-spec.md)

- [ ] Build Audit Service: SQS consumer Lambda
- [ ] Implement hash chain: each event gets `checksum` + `prev_checksum` from day one
- [ ] Write to DynamoDB `audit_events` table
- [ ] Stream to S3 `audit-archive` via DynamoDB Streams → Lambda
- [ ] Wire Report Service to emit audit events on: report created, report viewed, pipeline complete
- [ ] Integrity check Lambda: scheduled every 6h, SNS alert on chain break

> **Why now, not later?** The hash chain only works if it starts from record #1. You cannot add it retroactively. This is the one thing that truly cannot be bolted on.

**Done when:** Every report action produces an audit event. Chain integrity verified.

---

## Phase 2 — Auth & Users (Days 11–16)

> **Goal:** Real accounts. Real isolation. No more hardcoded org.

### Days 11–12 — Auth Service

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

### Days 13–14 — Permission Engine

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

### Days 15–16 — Org & User Service

**Reference:** [02 — Microservices §5 (Org & User Service)](./02-microservices-design.md)

- [ ] Build Org & User Service (ECS Fargate, TypeScript)
- [ ] Endpoints: create org, invite user, list users, assign role, remove user
- [ ] Invite flow: email → one-time token → accept → Cognito user created → role assigned
- [ ] On any RBAC change: call `Permission Engine.RefreshPolicy` to bust cache
- [ ] Self-service: users can update display name, change password, view own sessions

**Done when:** You can create an org, invite a second user, assign them a role, and their permissions work immediately.

---

## Phase 3 — UI & Private Beta (Days 17–23)

> **Goal:** Something a real human can use without you explaining it.

### Days 17–19 — Front-End

- [ ] Framework: Next.js (App Router) + Tailwind — fast to build, easy to iterate
- [ ] Pages: Login, Sign up, Dashboard (report list), New report (idea input), Report view (results)
- [ ] Report view: scores as visual gauges, competitor cards, summary prose, "Where's the gap?" section
- [ ] Polling: front-end polls `GET /reports/:id` every 3s while status is `pending`/`running`; show live progress
- [ ] Deploy: Vercel (fastest path) or CloudFront + S3 (stays in AWS ecosystem)

**Done when:** You can go from signup → submit idea → watch it process → read the report. No console needed.

---

### Days 20–21 — API Gateway & Polish

**Reference:** [01 — Technical Spec §11 (API Gateway)](./01-technical-spec.md)

- [ ] Wire AWS API Gateway in front of all services (not just for show — this is your WAF entry point)
- [ ] Attach WAF: OWASP Core Rule Set, rate limiting per `org_id`
- [ ] Per-client throttling: free tier = 10 reports/hr, Pro = 100/hr
- [ ] Error messages: every error the user might see has a human-readable message (not a stack trace)
- [ ] Loading states: every async action has a spinner and a timeout message

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
Phase 0 (Foundation)
  └── Phase 1 (Pipeline) — needs DB, S3, SQS from Phase 0
        └── Phase 2 (Auth) — pipeline needs real org_id
              └── Phase 3 (UI) — UI needs auth to work
                    └── Phase 4 (Billing) — billing needs users
                          └── Phase 5 (Hardening) — fills in what's already wired

INDEPENDENT (can be done anytime):
  - Audit Service depth (Phase 5) — pipe exists from Day 10
  - Permission Engine role expansion — engine exists from Day 14
  - DR setup — infra exists from Phase 0
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
