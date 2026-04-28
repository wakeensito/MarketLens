# 02 — Microservices Design

> Every service MarketLens will run: what it does, what it owns, who calls it, and how it scales.

**Status:** v1.0 · **Owner:** Engineering Lead · **Last reviewed:** April 2026

> 📖 **Prerequisites:** Read [01 — Technical Specification](./01-technical-spec.md) §2 (System Architecture) before this doc.

---

## Table of Contents

1. [Service Map](#1-service-map)
2. [Service Boundaries & Principles](#2-service-boundaries--principles)
3. [Auth Service](#3-auth-service)
4. [Permission Engine](#4-permission-engine)
5. [Org & User Service](#5-org--user-service)
6. [Report Service](#6-report-service)
7. [AI Orchestration Service](#7-ai-orchestration-service)
8. [Search Service](#8-search-service)
9. [Audit Service](#9-audit-service)
10. [Billing Service](#10-billing-service)
11. [Notification Service](#11-notification-service)
12. [Export Service](#12-export-service)
13. [Service Communication Patterns](#13-service-communication-patterns)
14. [Service-Level Objectives (SLOs)](#14-service-level-objectives-slos)

---

## 1. Service Map

MarketLens is composed of **10 microservices**. Each runs as an independent ECS Fargate service (or Lambda for async/AI workloads). All inter-service traffic is mTLS-authenticated; no service is publicly exposed.

```text
                         ┌────────────────────────────┐
                         │    CloudFront + WAF        │
                         └──────────────┬─────────────┘
                                        │
                                        ▼
                         ┌────────────────────────────┐
                         │     API Gateway            │
                         │  (Lambda Authoriser)       │
                         └─────┬──────────────────┬───┘
                               │                  │
                ┌──────────────┼──────────────┐   │
                ▼              ▼              ▼   ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐
        │  Auth    │    │  Org &   │    │  Report  │    │   Billing    │
        │ Service  │    │  User    │    │ Service  │    │   Service    │
        └────┬─────┘    └────┬─────┘    └────┬─────┘    └──────┬───────┘
             │               │               │                 │
             └────┬──────────┴────────┬──────┴────────┬────────┘
                  │                   │               │
                  ▼                   ▼               ▼
         ┌────────────────┐  ┌────────────────┐  ┌──────────────┐
         │  Permission    │  │     Audit      │  │ Notification │
         │   Engine       │◄─┤    Service     │  │   Service    │
         └────────────────┘  └────────────────┘  └──────────────┘
                                                         ▲
                                                         │
         ┌────────────────────────────────┐              │
         │  AI Orchestration (Step Fns)   │──────────────┘
         │  ┌──────────┐  ┌────────────┐  │
         │  │  Search  │  │   Export   │  │
         │  │  Service │  │   Service  │  │
         │  └──────────┘  └────────────┘  │
         └────────────────────────────────┘
```

### Service Inventory

| # | Service | Type | Language | Owner |
|---|---|---|---|---|
| 1 | Auth Service | ECS Fargate | TypeScript (Node.js) | Security Lead |
| 2 | Permission Engine | ECS Fargate | Go | Security Lead |
| 3 | Org & User Service | ECS Fargate | TypeScript (Node.js) | Backend Lead |
| 4 | Report Service | ECS Fargate | TypeScript (Node.js) | Backend Lead |
| 5 | AI Orchestration | Step Functions + Lambda | Python | AI Lead |
| 6 | Search Service | Lambda | Python | AI Lead |
| 7 | Audit Service | ECS Fargate | Go | Security Lead |
| 8 | Billing Service | ECS Fargate | TypeScript (Node.js) | Backend Lead |
| 9 | Notification Service | Lambda + SQS | TypeScript (Node.js) | Backend Lead |
| 10 | Export Service | Lambda | Python | Backend Lead |

---

## 2. Service Boundaries & Principles

### 2.1 The Rules

1. **One database, one owner.** Each service owns its data exclusively. Other services NEVER read from another service's DB directly — they call the owning service's API.
2. **Synchronous calls are gRPC + mTLS.** Internal-only. No service is publicly reachable.
3. **Async is SQS or EventBridge.** SQS for work queues (one consumer); EventBridge for event broadcast (many consumers).
4. **Every service writes audit events.** Via the Audit Service async API. Audit writes never block business logic.
5. **Every service is stateless.** State lives in the data layer. Any task can be killed and respawned at any time.
6. **Every service has its own IAM Task Role.** With least-privilege permissions to only the resources it needs.
7. **Every service has a circuit breaker.** Calls to dependencies fail fast if the dependency is unhealthy.

### 2.2 What Belongs in a Service

A service exists for one of three reasons:

- **Domain boundary** — it owns a coherent slice of business logic (e.g. Billing, Reports).
- **Scaling boundary** — its load profile differs sharply from neighbours (e.g. AI Orchestration burns tokens; Auth handles bursty login traffic).
- **Trust boundary** — it handles data with stricter access requirements (e.g. Audit Service, Permission Engine).

### 2.3 What Does NOT Belong as a Separate Service

- **Internal libraries.** Shared validation, logging, error formatting → use a shared package, not a service.
- **CRUD on a single entity.** Don't create a "Comments Service" if comments live inside reports — keep it in Report Service.
- **A wrapper around an external API.** Unless it has retry/cache/auth complexity worth isolating.

---

## 3. Auth Service

> **Owns:** Authentication flows, session lifecycle, MFA orchestration, password reset, SSO (SAML/OIDC).

### 3.1 Responsibilities

- Wrap AWS Cognito for user-facing auth flows (signup, login, MFA, password reset).
- Issue, refresh, and revoke session records in DynamoDB.
- Validate API key authentication (separate flow from JWT).
- Handle SAML/OIDC SSO for enterprise tenants.
- Enforce session policies (concurrent limit, idle timeout, absolute expiry).

### 3.2 Public API

| Endpoint | Method | Description | Auth |
|---|---|---|---|
| `/auth/signup` | POST | New user registration | Public (rate-limited) |
| `/auth/login` | POST | Email + password (+ MFA) | Public (rate-limited) |
| `/auth/refresh` | POST | Exchange refresh token for new access token | Refresh token |
| `/auth/logout` | POST | Revoke current session | JWT |
| `/auth/logout-all` | POST | Revoke all sessions for user | JWT |
| `/auth/mfa/enroll` | POST | Begin MFA enrolment (TOTP) | JWT |
| `/auth/mfa/verify` | POST | Confirm MFA enrolment | JWT |
| `/auth/password-reset` | POST | Initiate password reset | Public (rate-limited) |
| `/auth/sso/saml` | GET/POST | SAML SSO entry point | Public |

### 3.3 Internal API (gRPC)

| RPC | Description | Called By |
|---|---|---|
| `ValidateToken` | Validate JWT, return claims | API Gateway authoriser |
| `GetSession` | Fetch session record by ID | All services (rare) |
| `RevokeSession` | Force-revoke a session | Org & User Service (admin force-logout) |

### 3.4 Data Owned

- DynamoDB table: `sessions`
- Cognito User Pool (managed by Auth Service IAM role only)

### 3.5 Dependencies

- **Cognito** — primary identity store
- **Permission Engine** — to look up user roles after auth (cached in JWT for 15 min)
- **Audit Service** — log every auth event
- **Notification Service** — send password reset emails, MFA setup notifications

### 3.6 Scaling Profile

Bursty: spikes during business-hours logins. Scale on `requests/sec` and `Cognito API latency`.

- Min tasks: 2
- Max tasks: 20
- Target CPU: 60%

---

## 4. Permission Engine

> **Owns:** All authorisation decisions. The only service in the platform that says "yes" or "no" to access.

### 4.1 Responsibilities

- Evaluate `(role, scope, resource_type, action)` permission decisions.
- Cache role and permission policies in-process (refreshed every 60 seconds from Postgres).
- Resolve custom roles → permission strings.
- Provide bulk permission checks (e.g. "which reports can this user see?").
- Emit permission denial events to the Audit Service.

### 4.2 Why Its Own Service?

- **Trust boundary** — central enforcement point for ALL access decisions; isolated for security audit.
- **Latency-critical** — every API call goes through it; written in Go for low p99.
- **Independent scaling** — permission checks scale with API traffic, not user count.

### 4.3 Internal API (gRPC only — no public endpoint)

| RPC | Description | Called By |
|---|---|---|
| `Authorize` | Check single permission: returns allow/deny + reason | All services on every protected operation |
| `AuthorizeBulk` | Check multiple permissions in one call | Report Service (for list views) |
| `GetEffectivePermissions` | List all permissions a user has within an org | Org & User Service (UI permission display) |
| `RefreshPolicy` | Force cache reload (after RBAC change) | Org & User Service |

### 4.4 Decision Algorithm

```text
INPUT: user_id, org_id, scope, resource_type, action, [team_id], [resource_id]

1. Load user's roles (cached, 60s TTL).
2. Resolve role hierarchy → effective permission set.
3. For each permission string `{scope}:{resource_type}:{action}`:
   a. Match scope: exact match, or wildcard for super_admin.
   b. Match resource_type: exact match.
   c. Match action: action character must be in the permission's action set.
4. If any permission matches → ALLOW (return decision + matching permission).
5. If no permission matches → DENY (return decision + closest-miss for debugging).
6. Emit audit event (success or denial) async to Audit Service.
```

### 4.5 Data Owned

- Postgres tables: `roles`, `user_roles`, `team_members` (read replicas in each AZ for HA).

### 4.6 Dependencies

- **Audit Service** — fire-and-forget event for every decision.

### 4.7 Performance Targets

- p50: < 5 ms
- p99: < 20 ms
- Throughput: 5,000 RPS per task

---

## 5. Org & User Service

> **Owns:** Organisations, users, teams, roles, RBAC configuration.

### 5.1 Responsibilities

- CRUD on organisations, users, teams, role assignments.
- Invite flow (email invite → accept → user creation).
- Custom role creation and editing (composing permission strings).
- Team membership management.
- Org-level settings (SSO config, password policy, concurrent session limits, MFA enforcement).
- Force-logout other users (admin action).
- Triggers `Permission Engine.RefreshPolicy` on any RBAC change.

### 5.2 Public API

| Endpoint | Method | Permission Required |
|---|---|---|
| `/orgs/:org_id` | GET | `global:org_settings:R` |
| `/orgs/:org_id` | PATCH | `global:org_settings:U` |
| `/orgs/:org_id/users` | GET | `global:team_members:R` |
| `/orgs/:org_id/users` | POST (invite) | `global:team_members:CU` |
| `/orgs/:org_id/users/:user_id` | GET, PATCH, DELETE | `global:team_members:RUD` |
| `/orgs/:org_id/teams` | GET, POST | `global:team_members:R/CU` |
| `/orgs/:org_id/teams/:team_id` | GET, PATCH, DELETE | varies |
| `/orgs/:org_id/teams/:team_id/members` | GET, POST, DELETE | `team:team_members:RUD` |
| `/orgs/:org_id/roles` | GET, POST | `global:org_settings:R/CU` |
| `/orgs/:org_id/sessions` | GET (list active sessions) | `global:team_members:R` |
| `/orgs/:org_id/sessions/:session_id` | DELETE (force-logout) | `global:team_members:U` + MFA step-up |

### 5.3 Data Owned

- Postgres tables: `organisations`, `users`, `teams`, `team_members`, `roles`, `user_roles`.

### 5.4 Dependencies

- **Permission Engine** — every endpoint authorises via Engine.
- **Auth Service** — calls `RevokeSession` on user deactivation or force-logout.
- **Notification Service** — send invite emails, role change notifications.
- **Audit Service** — log every mutation.

---

## 6. Report Service

> **Owns:** Market reports, query history, sharing, report metadata.

### 6.1 Responsibilities

- Accept user query: idea text → trigger AI pipeline.
- Store report metadata + result JSON.
- List reports user can access (scoped via Permission Engine).
- Generate share links (signed URLs with TTL + access scope).
- Soft-delete and purge reports.
- Track report status: `pending`, `running`, `complete`, `failed`.

### 6.2 Public API

| Endpoint | Method | Permission Required |
|---|---|---|
| `/reports` | GET (list) | `team:market_reports:R` |
| `/reports` | POST (create) | `team:market_reports:C` |
| `/reports/:report_id` | GET | `team:market_reports:R` (or `shared:<report_id>:R`) |
| `/reports/:report_id` | PATCH (update title, notes) | `team:market_reports:U` |
| `/reports/:report_id` | DELETE (soft) | `team:market_reports:D` |
| `/reports/:report_id/purge` | POST | `team:market_reports:P` + MFA |
| `/reports/:report_id/share` | POST | `team:market_reports:S` |
| `/reports/:report_id/export` | POST | `team:market_reports:E` |
| `/queries` | GET (own query history) | `personal:query_history:R` |

### 6.3 Report Lifecycle

```text
1. POST /reports { idea_text }
2. Report Service creates row: status='pending'
3. Returns { report_id, status: 'pending' }   ← immediate response (< 200ms)
4. Async: SQS message → AI Orchestration starts Step Function
5. AI Orchestration writes intermediate progress → DynamoDB
6. Front-end polls /reports/:id (or WebSocket) for status updates
7. AI Orchestration completes → writes result_json → status='complete'
8. Notification Service sends "your report is ready" email/push
```

### 6.4 Data Owned

- Postgres tables: `market_reports`, `query_history`, `report_shares`.
- S3: report PDF/CSV exports under `s3://reports-{env}/{org_id}/{report_id}/`.

### 6.5 Dependencies

- **Permission Engine** — authorisation on every request.
- **AI Orchestration** — submits report jobs via SQS.
- **Audit Service** — log all report access and mutations.
- **Notification Service** — completion notifications.
- **Export Service** — PDF/CSV generation.

---

## 7. AI Orchestration Service

> **Owns:** The market analysis pipeline. Takes an idea, returns a structured report.

### 7.1 Responsibilities

- Orchestrate the multi-step AI pipeline via Step Functions.
- Manage prompt templates (versioned in code).
- Call the Search Service for web/competitor data.
- Call LLM APIs (Anthropic / OpenAI / etc.) with retry, fallback, and rate limiting.
- Aggregate sub-results into a structured report.
- Track token usage per organisation; deduct from credit balance via Billing Service.
- Handle partial failure (a sub-step fails → degraded report with warnings, not full failure).

### 7.2 Pipeline Stages (high level)

```text
[INPUT: idea_text, org_id, user_id]
   │
   ▼
1. SANITIZE ─── strip PII, validate length, detect prompt injection
   │
   ▼
2. PARSE ─── LLM call: extract industry, geography, business model from idea
   │
   ▼
3. SEARCH (parallel) ─── Search Service for competitors, market size, trends
   │
   ▼
4. ANALYSE ─── LLM call: synthesise competitor list with positioning
   │
   ▼
5. SCORE ─── compute saturation score, difficulty score, opportunity score
   │
   ▼
6. SUMMARISE ─── LLM call: beginner-friendly explanation, gap analysis
   │
   ▼
7. ASSEMBLE ─── combine into final result_json schema
   │
   ▼
[OUTPUT: result_json → Report Service]
```

> 📖 **Full pipeline details, prompt templates, scoring algorithm, and cost model:** see [03 — AI Pipeline Architecture](./03-ai-pipeline.md).

### 7.3 Why Step Functions?

- **Visibility** — each stage is a distinct state; failures can be inspected per step.
- **Retry policy per step** — different stages have different retry semantics (LLM call: 3 retries; Search call: 2 retries).
- **Parallel execution** — competitor lookup, market sizing, and trend analysis run in parallel.
- **State persistence** — intermediate results survive Lambda timeouts (up to 1 year for Standard workflows).

### 7.4 Data Owned

- DynamoDB: `pipeline_executions` (audit trail of every Step Function run, indexed by `org_id`).
- No Postgres tables — final result is handed back to Report Service.

### 7.5 Dependencies

- **Report Service** — receives jobs from, returns results to.
- **Search Service** — web/competitor data lookups.
- **Billing Service** — deduct credits per token used.
- **Audit Service** — log every pipeline execution.
- **External LLM APIs** — Anthropic Claude (primary), OpenAI (fallback).

---

## 8. Search Service

> **Owns:** All external data fetching — web search, competitor data scraping, market data APIs.

### 8.1 Responsibilities

- Web search (via search API provider).
- Fetch and parse competitor websites.
- Query market data sources (Crunchbase, SEMrush, etc. — TBD per integration).
- Cache results in ElastiCache (1-hour TTL for hot queries).
- Rate-limit per data source; queue requests when limits approached.

### 8.2 Why Its Own Service?

- **External dependency isolation** — third-party APIs go down; isolating prevents cascade failure.
- **Cache locality** — search results are highly cacheable; centralising the cache reduces cost.
- **Rate limit management** — single point to manage quotas across vendors.

### 8.3 Internal API (Lambda invoked, not gRPC)

| Function | Description |
|---|---|
| `web_search(query, max_results)` | Search the web; return top-N results with titles, URLs, snippets |
| `fetch_url(url)` | Fetch and parse a URL; return structured content |
| `competitor_lookup(idea_keywords)` | Find candidate competitors for an idea |

### 8.4 Data Owned

- ElastiCache: search result cache (key namespaced by `org_id` + query hash).

### 8.5 Dependencies

- External: search API provider, web fetch capability, market data APIs (TBD).

---

## 9. Audit Service

> **Owns:** The immutable audit log. The most security-critical service in the platform.

### 9.1 Responsibilities

- Accept audit events via internal SQS queue (fire-and-forget for callers).
- Validate event schema; reject malformed events.
- Compute hash chain checksum (`prev_checksum` + current event → `checksum`).
- Write to DynamoDB (hot, queryable) AND stream to S3 (cold, WORM archive).
- Provide read-only query API for Auditors and authorised viewers.
- Run scheduled chain integrity verification (Lambda, every 6h).

### 9.2 Why Its Own Service?

- **Trust boundary** — only this service can write to the audit log; isolated for security guarantees.
- **Append-only semantics** — protected by a service that REJECTS update/delete attempts.
- **Different scaling profile** — write-heavy, read-rare.

### 9.3 Public API

| Endpoint | Method | Permission Required |
|---|---|---|
| `/audit/logs` | GET (query) | `global:audit_logs:R` (varies by scope) |
| `/audit/logs/:log_id` | GET | `global:audit_logs:R` |
| `/audit/integrity` | GET | `global:audit_logs:R` (returns last verification status) |

### 9.4 Internal Async Ingestion

Producers send events to SQS queue `audit-events-{env}`. Audit Service Lambda consumes, validates, chains, and persists.

### 9.5 Data Owned

- DynamoDB: `audit_events` (partition: `org_id`, sort: `timestamp#log_id`, GSI on `actor_id` and `resource_id`).
- S3: `audit-archive-{env}` bucket with Object Lock (Compliance mode).

### 9.6 Hardening Specifics

- **No `Update` or `Delete` operations exposed.** Service literally has no code path for it.
- **IAM Task Role** has `dynamodb:PutItem` only — no `UpdateItem`, no `DeleteItem`, no `BatchWriteItem` with delete operations.
- **S3 Object Lock** enforced at bucket policy level — even root cannot delete during retention.

### 9.7 Dependencies

- All other services emit events to it.
- No services it calls (it's a sink).

---

## 10. Billing Service

> **Owns:** Subscriptions, invoices, payment methods, credit balance, AI token accounting.

### 10.1 Responsibilities

- Manage subscription tiers (Free, Pro, Team, Enterprise).
- Stripe integration: payment methods, charges, invoices, webhooks.
- Track AI credit balance per org; deduct on token usage.
- Generate monthly invoices.
- Enforce usage limits per tier.

### 10.2 Public API

| Endpoint | Method | Permission Required |
|---|---|---|
| `/billing/subscription` | GET, PATCH | `global:billing_data:R/U` + MFA on update |
| `/billing/invoices` | GET (list) | `global:billing_data:R` |
| `/billing/invoices/:invoice_id` | GET | `global:billing_data:R` |
| `/billing/payment-methods` | GET, POST, DELETE | `global:billing_data:CRUD` + MFA |
| `/billing/usage` | GET (current period usage) | `global:billing_data:R` |
| `/billing/credits` | GET, POST (purchase) | `global:billing_data:R/C` + MFA |

### 10.3 Internal API (gRPC)

| RPC | Description | Called By |
|---|---|---|
| `DeductCredits` | Deduct credits for AI usage; throws if insufficient | AI Orchestration after each pipeline run |
| `CheckUsageLimit` | Verify org is within tier limits | Report Service before accepting new query |

### 10.4 Data Owned

- Postgres: `subscriptions`, `invoices`, `payment_methods`, `credit_balances`, `usage_records`.
- Stripe is the source of truth for payment-related state; we mirror for query performance.

### 10.5 Dependencies

- Stripe API
- Audit Service
- Notification Service (invoice emails)

---

## 11. Notification Service

> **Owns:** All outbound communications: email, in-app, push, Slack.

### 11.1 Responsibilities

- Send transactional emails (invites, password reset, report ready, billing).
- Send Slack notifications (Enterprise tier integration).
- Manage user notification preferences.
- Template rendering (MJML for email).

### 11.2 Architecture

Lambda triggered by SQS. Each event type has a queue + handler.

### 11.3 Data Owned

- DynamoDB: `notification_preferences` (per user).
- DynamoDB: `notification_log` (sent notifications, for audit/dedupe).

### 11.4 Dependencies

- AWS SES (email)
- Slack API (Enterprise)
- Apple Push / FCM (mobile push, future)

---

## 12. Export Service

> **Owns:** Generating downloadable artifacts (PDF, CSV, PPTX) from reports.

### 12.1 Responsibilities

- Render reports to PDF (Puppeteer + headless Chrome in Lambda layer).
- Generate CSV exports of competitor data.
- Generate PPTX presentations (for Pro/Team tiers).
- Upload to S3 with signed URL (24-hour TTL).

### 12.2 Why Its Own Service?

- **Resource-heavy** — Puppeteer needs more memory than other services.
- **Separable failure mode** — export failures should not block report viewing.
- **Tier-gated** — different formats for different tiers; isolating makes the policy clear.

### 12.3 Trigger

SQS message from Report Service: `{ report_id, format: 'pdf'|'csv'|'pptx', org_id, user_id }`.

### 12.4 Dependencies

- Report Service (read source data)
- Audit Service (log every export)

---

## 13. Service Communication Patterns

### 13.1 Quick Reference

| Pattern | Use For | Example |
|---|---|---|
| gRPC + mTLS | Sync, low-latency, internal | Permission Engine `Authorize` call |
| SQS FIFO | Async, ordered work queue | Report job submission to AI Orchestration |
| EventBridge | Async, broadcast (1→N) | "Report Completed" event |
| Step Functions | Multi-step workflow | AI Orchestration pipeline |
| DynamoDB Streams | Reactive on data change | Session record TTL → trigger cleanup Lambda |

### 13.2 Failure Modes & Circuit Breakers

Every gRPC client implements:

- **Timeout** — default 2s, configurable per call.
- **Retry** — exponential backoff (100ms → 200ms → 400ms), max 3 attempts, only for retryable errors.
- **Circuit breaker** — open after 5 consecutive failures in 10s; half-open after 30s.
- **Fallback** — every caller defines a fallback (e.g. Permission Engine cache miss → deny by default).

### 13.3 Distributed Tracing

Every request entering the system gets a `trace_id` (W3C Trace Context). Propagated through all sync and async calls. X-Ray + OpenTelemetry collect traces; viewable in Grafana.

---

## 14. Service-Level Objectives (SLOs)

| Service | Availability SLO | Latency SLO (p99) | Error Budget |
|---|---|---|---|
| API Gateway / CloudFront | 99.95% | < 100ms | 21.6 min/month |
| Auth Service | 99.9% | < 300ms | 43 min/month |
| Permission Engine | 99.95% | < 20ms | 21.6 min/month |
| Org & User Service | 99.9% | < 500ms | 43 min/month |
| Report Service (read) | 99.9% | < 500ms | 43 min/month |
| Report Service (create) | 99.5% | < 1s (initial response) | 3.6 hr/month |
| AI Orchestration | 99% | < 90s (full pipeline) | 7.2 hr/month |
| Search Service | 99% | < 5s per search | 7.2 hr/month |
| Audit Service (write) | 99.99% | < 100ms (async) | 4.3 min/month |
| Audit Service (read) | 99.5% | < 1s | 3.6 hr/month |
| Billing Service | 99.9% | < 500ms | 43 min/month |
| Notification Service | 99% | < 30s (email delivery) | 7.2 hr/month |
| Export Service | 99% | < 60s (PDF generation) | 7.2 hr/month |

> **Error budget policy:** When a service exceeds its error budget in a rolling 30-day window, feature releases for that service are paused; only reliability work is shipped until the budget recovers.

---

## Owners

| Area | Owner |
|---|---|
| Auth Service (§3) | Security Lead |
| Permission Engine (§4) | Security Lead |
| Audit Service (§9) | Security Lead |
| Org & User Service (§5) | Backend Lead |
| Report Service (§6) | Backend Lead |
| Billing Service (§10) | Backend Lead |
| Notification Service (§11) | Backend Lead |
| Export Service (§12) | Backend Lead |
| AI Orchestration (§7) | AI Lead |
| Search Service (§8) | AI Lead |

---

← Previous: [01 — Technical Specification](./01-technical-spec.md) · Next: [03 — AI Pipeline Architecture](./03-ai-pipeline.md)
