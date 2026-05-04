# 05 — Milestones & Sprints

> Build plan for Plinths (formerly MarketLens). PoC-first: prove the pipeline works with minimal infra, then layer in enterprise features.

**Status:** v1.3 · **Owner:** Engineering Lead · **Last reviewed:** May 2026
**Team:** Solo founder · **Velocity:** 2–4 hrs/day · **Start date:** TBD

---

## The Core Principle

> Prove the value first. Harden second.

This plan starts with the simplest possible AWS deployment — Lambda Durable Functions + API Gateway + S3 — to get a working "idea in, report out" loop. The full microservices architecture (ECS, RDS, RBAC, multi-tenancy) comes after the PoC proves the AI pipeline produces reports people actually want.

| PoC (Phase 0) | Current State (May 2026) | Full Architecture (Target) |
|---|---|---|
| 2 S3 buckets (frontend + exports) | 2 S3 buckets (frontend + exports) | Multi-bucket with Object Lock, lifecycle policies |
| 3 Lambdas (API + durable pipeline + export) | 8 Lambdas (API + AI + Export + BFF Auth + Authorizer + 3 Cognito triggers) | 10 microservices on ECS Fargate + Lambda |
| API Gateway (REST) + CloudFront | API Gateway + Lambda Authorizer + CloudFront (cookie forwarding, custom domain `plinths.net`) | API Gateway + WAF + per-tenant throttling |
| DynamoDB (reports table) | DynamoDB (org-scoped reports + user/org records) | RDS Postgres with RLS + DynamoDB + ElastiCache |
| SAM + Terraform (IAM) for deployment | SAM + Terraform (IAM), secrets in SSM Parameter Store | SAM (application layer) + Terraform (infrastructure layer) |
| No auth (hardcoded user) | Cognito + Google SSO + passwordless email OTP + BFF Lambda + HttpOnly cookies | Cognito + JWT + RBAC + Permission Engine |
| Python only | Python only (all 8 Lambdas) | Python (AI) + TypeScript (services) + Rust or Go (Permission Engine, Audit) |
| No search APIs | Brave Search + Wikipedia + Wikidata (parallel enrichment) | + Crunchbase, Perplexity (paid tiers) |
| Binary scoring (10 or 75) | Gradient scoring (1-10 signals, continuous 0-100 output) | Same algorithm, more data sources |

---

## Timeline Overview

| Phase | Name | Status | Goal |
|---|---|---|---|
| 0 | PoC — Prove the Pipeline | ✅ DONE | Idea in → report out, deployed on AWS |
| 1 | Foundation & Full Pipeline | ⚠️ PARTIAL (CI/CD done, infra pending) | AWS skeleton, data layer, audit chain, CI/CD |
| 2 | Auth & Users | ✅ DONE | Real accounts, login, org isolation |
| 2.5 | Scoring & Data Enrichment | ✅ DONE | Intelligent scores, Wikipedia/Wikidata |
| 3 | Beta Launch | 🔄 IN PROGRESS | Custom domain, pricing gates, beta users |
| 4 | Billing | ⏳ NEXT | Stripe, credits, free vs paid |
| 5 | Hardening Snap-ins | ⏳ FUTURE | RBAC rules, audit depth, DR, compliance |

---

## Phase 0 — PoC: Prove the Pipeline ✅ DONE

All items completed. See previous version for full checklist.

**Result:** Full 7-stage AI pipeline (sanitize → parse → search → analyse → score → summarise → assemble) running on Lambda Durable Functions with multi-model setup (Nova Micro + DeepSeek V3.2 + Claude 3 Haiku). Per-report cost: ~$0.007.

---

## Phase 1 — Foundation & Full Pipeline ⚠️ PARTIAL

### What's done:
- [x] CI/CD: GitHub Actions CI (lint, type check, Trivy, Checkov) + CD (S3 sync, CloudFront invalidation)
- [x] IAM CD role with GitHub OIDC (Terraform)
- [x] Frontend deployed to S3 + CloudFront with custom domain (`plinths.net`)
- [x] CD workflow builds with `VITE_API_BASE_URL=""` for same-origin API calls

### What's pending (deferred to post-beta):
- [ ] Terraform infra repo (VPC, RDS, ECS, KMS)
- [ ] RDS PostgreSQL + RLS
- [ ] ElastiCache Redis
- [ ] Audit Service (hash chain)
- [ ] Local dev (docker-compose)

---

## Phase 2 — Auth & Users ✅ DONE

### Passwordless Email OTP (Custom Auth) ✅
- [x] 3 Cognito trigger Lambdas: `auth-define`, `auth-create` (sends OTP via SES), `auth-verify` (constant-time comparison)
- [x] BFF endpoints: `POST /auth/initiate` (auto-creates Cognito user, calls InitiateAuth CUSTOM_AUTH), `POST /auth/verify` (RespondToAuthChallenge, sets cookies)
- [x] User auto-creation with random password (never used), auto-confirm, email_verified=true
- [x] Transactional user+org creation in DynamoDB (TransactWriteItems with attribute_not_exists)
- [x] SES domain verified: `plinths.net` with DKIM, SPF, DMARC — sends from `noreply@plinths.net`
- [x] SES production access requested (sandbox mode — only verified emails for now)

### Google SSO ✅
- [x] Google OAuth 2.0 client configured in Google Cloud Console
- [x] Cognito Google identity provider wired
- [x] Custom Cognito domain: `auth.plinths.net` (ACM cert + Route 53 alias)
- [x] OAuth CSRF state parameter with `ml_oauth_state` cookie (forwarded by CloudFront)
- [x] Google consent screen published (production mode, basic scopes: openid, email, profile)

### GitHub SSO ❌ REMOVED
- GitHub doesn't expose a standard OIDC issuer for user login
- Requires a Lambda-backed OIDC proxy — deferred to post-beta
- Button remains in UI for future implementation

### Lambda Authorizer ✅
- [x] REQUEST type, 300s cache, identity source is Cookie header
- [x] JWT validation against Cognito JWKS with issuer + token_use checks
- [x] DynamoDB user lookup for org_id
- [x] Denies all anonymous/expired/invalid tokens (sign-in required)
- [x] Denies users with missing org_id

### DynamoDB Key Schema ✅
- [x] Reports: `PK: ORG#{org_id}#REPORT#{report_id}`, `SK: REPORT#{report_id}`, `GSI1PK: ORG#{org_id}#REPORTS`
- [x] Users: `PK/SK: USER#{sub}`
- [x] Orgs: `PK/SK: ORG#{org_id}`
- [x] Migration script: `scripts/migrate-reports.py` (re-keys old reports)

### Rate Limiting ✅
- [x] Atomic check-and-increment via conditional DynamoDB UpdateItem (no race condition)
- [x] Plan-aware: free=3/day, pro=15/day, team=50/day, admin=9999/day
- [x] Anonymous access eliminated — sign-in required for all API calls

### Frontend Auth ✅
- [x] `useAuth` hook with `continueWithEmail` (two-step OTP) and `verifyCode`
- [x] `SignInModal` with animated email → code step transitions
- [x] Google SSO button (redirects to Cognito hosted UI)
- [x] Sign-in gate on submit: stores pending query, auto-submits after sign-in
- [x] Profile section shows real user data from auth context

### Security Fixes ✅
- [x] PyJWT 2.9.0 → 2.12.1, cryptography 44.0.3 → 46.0.6 (CVE patches)
- [x] OAuth state CSRF protection
- [x] ID token fully verified (signature + issuer)
- [x] Cognito client secret in SSM SecureString (not env var)
- [x] API key + sender email in SSM (not in samconfig.toml)
- [x] `raw_event` instead of private `_data` attribute in Powertools

---

## Phase 2.5 — Scoring & Data Enrichment ✅ DONE

### Scoring Algorithm Rewrite ✅
- [x] Analyse prompt: binary booleans → 1-10 gradient signals (funding_maturity, market_consolidation, switching_cost, cac_pressure, innovation_velocity)
- [x] LLM estimates TAM and growth when search data is missing
- [x] Score function: logarithmic competitor scaling, plan-based factors, no fixed base score
- [x] Backward compatible with old boolean signals
- [x] Continuous score distribution across 0-100 (was clustering at 10 and 75)

### Wikipedia + Wikidata Enrichment ✅
- [x] `_wikipedia_summary()`: REST API for company descriptions
- [x] `_wikidata_company_facts()`: SPARQL query for founding year, employee count, revenue, industry, HQ, parent org
- [x] `_enrich_competitors_with_wiki()`: parallel lookups via ThreadPoolExecutor (8 workers)
- [x] Structured data formatted into LLM prompt as separate section
- [x] No API keys needed — fully open APIs

---

## Phase 3 — Beta Launch 🔄 IN PROGRESS

### Custom Domain ✅
- [x] Domain purchased: `plinths.net` (Route 53)
- [x] ACM certificate: `plinths.net` + `*.plinths.net` (validated)
- [x] CloudFront alternate domain: `plinths.net` with ACM cert (in SAM template)
- [x] Route 53 A record: `plinths.net` → CloudFront
- [x] Cognito custom domain: `auth.plinths.net` (ACM cert + Route 53 alias)
- [x] SES: `noreply@plinths.net` (DKIM + SPF + DMARC)

### Pricing & Gates (defined, not yet enforced in code)
Tier structure decided:

| | Free | Pro ($20/mo) | Team ($100/mo) |
|---|---|---|---|
| Reports | 3/day | 15/day | 50/day per seat |
| Chat per report | ❌ | ~30 msgs then cooldown | ~100 msgs then cooldown |
| Exports | MD only | CSV, PDF, MD | CSV, PDF, MD |
| History | 7 days | Unlimited | Unlimited |
| Model selection | Default | ✅ | ✅ |
| Perplexity search | ❌ | ❌ | ✅ |
| Sharing | ❌ | ✅ | ✅ |
| Seats | 1 | 1 | 5 included |

### Still TODO for beta:
- [ ] Export gate: block CSV/PDF for free tier, allow MD
- [ ] History gate: filter list_reports to 7 days for free tier
- [ ] Frontend upgrade prompts at each gate
- [ ] Locked chat placeholder on report view ("Upgrade to Pro")
- [ ] Feedback mechanism: thumbs up/down on reports
- [ ] Basic analytics: report count, failure rate, cost tracking
- [ ] Invite 10-20 beta testers

---

## Phase 4 — Billing ⏳ NEXT

### Stripe Integration (planned)
- [ ] Stripe account + products: Pro ($20/mo), Team ($100/mo)
- [ ] `POST /api/billing/checkout` — creates Stripe Checkout Session
- [ ] `POST /api/billing/portal` — Stripe Customer Portal for subscription management
- [ ] `POST /api/billing/webhook` — receives Stripe events (Authorizer: NONE, signature verified)
- [ ] Store `stripe_customer_id` on user record
- [ ] Webhook handlers: `checkout.session.completed` → update plan, `customer.subscription.deleted` → reset to free
- [ ] Frontend: "Upgrade" button → Stripe Checkout redirect

### LLM Chat (planned, paid tier feature)
- [ ] Chat Lambda: conversation history in DynamoDB per report
- [ ] Report `result_json` as system prompt context
- [ ] WebSocket or SSE for streaming responses
- [ ] Frontend chat panel alongside report view
- [ ] Session-based usage limits (~30 msgs/report for Pro, ~100 for Team)

### Custom Model Selection (planned, paid tier feature)
- [ ] Model config per stage stored on user/org record
- [ ] AI Lambda reads model IDs from config instead of env vars
- [ ] Frontend model picker UI per pipeline stage
- [ ] "Recommended" preset + custom option
- [ ] Per-report cost calculation based on actual models used

---

## Phase 5 — Hardening Snap-ins ⏳ FUTURE

Unchanged from previous version. Includes: RBAC expansion, audit depth, multi-tenancy hardening, disaster recovery, compliance runway.

---

## Dependency Map

```text
Phase 0 (PoC) ✅
  └── Phase 1 (Foundation) ⚠️ CI/CD done, infra deferred
        └── Phase 2 (Auth) ✅ passwordless OTP + Google SSO + org isolation
              └── Phase 2.5 (Scoring) ✅ gradient signals + Wiki enrichment
                    └── Phase 3 (Beta) 🔄 domain done, gates + testers next
                          └── Phase 4 (Billing) ⏳ Stripe + chat + model selection
                                └── Phase 5 (Hardening) ⏳ RBAC, audit, DR

INDEPENDENT:
  - Audit Service — build when needed, hash chain must start from record #1
  - Permission Engine — build when multi-role orgs are needed
  - DR setup — additive, same Terraform modules
  - Crunchbase API — add when revenue justifies $500/mo
```

---

## Current Architecture (8 Lambdas)

| # | Lambda | Purpose |
|---|---|---|
| 1 | API | REST CRUD for reports (org-scoped, plan-aware rate limits) |
| 2 | AI Orchestration | 7-stage durable pipeline (Nova Micro + DeepSeek + Haiku) |
| 3 | Export | CSV generation with presigned S3 URLs |
| 4 | BFF Auth | `/auth/initiate`, `/auth/verify`, `/auth/login`, `/auth/callback`, `/auth/refresh`, `/auth/logout`, `/auth/me` |
| 5 | Authorizer | Cookie → JWT validation → DynamoDB user lookup → context injection |
| 6 | Auth Define | Cognito trigger: controls custom auth flow |
| 7 | Auth Create | Cognito trigger: generates OTP, sends via SES |
| 8 | Auth Verify | Cognito trigger: constant-time OTP comparison |

---

## Metrics to Track From Day One

| Metric | Why |
|---|---|
| Pipeline success rate | Is the AI actually working? |
| Pipeline p99 latency | Are users waiting too long? |
| Reports per user per week | Are people coming back? |
| Degraded report rate | Which stage is failing most? |
| Cost per report (actual) | Is the unit economics holding? |
| Thumbs up / thumbs down ratio | Is the output actually useful? |
| Sign-in conversion rate | Are landing page visitors signing up? |
| Daily active users | Is the product sticky? |

---

## Owners

| Area | Owner |
|---|---|
| All of it (for now) | You |
| First hire (when ready) | Wherever you're slowest — measure first |

---

← Previous: [04 — Data Model](./04-data-model.md) · Back to [README](../README.md)
