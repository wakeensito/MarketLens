# BACKLOG

> Ideas that came up during development. Not in scope for current sprint. Review after beta launch.

---

## ✅ Multi-Model AI Pipeline (Completed)

**Status:** Done — April 2026

Replaced single-model pipeline (Claude 3 Haiku for everything) with a 3-model setup optimized for cost and quality:

| Stage | Model | Role | Cost/1M tokens (in/out) |
|---|---|---|---|
| Parse + Search | Amazon Nova Micro | Structured extraction | $0.035 / $0.14 |
| Analyse | DeepSeek V3.2 | Competitive reasoning | $0.62 / $1.85 |
| Summarise | Claude 3 Haiku | Narrative prose | $0.25 / $1.25 |

**Per-report cost:** ~$0.007 (down from ~$0.043 in the original design spec)

Changes:
- `template.yaml`: 3 separate model parameters (`BedrockModelIdParse`, `BedrockModelIdAnalyse`, `BedrockModelIdSummarise`) with per-model IAM permissions
- `app.py`: Provider-aware `call_llm()` handling Anthropic, DeepSeek (OpenAI-style), and Nova payload/response formats
- Richer prompts: Parse extracts `sub_industry`, `target_customer`, `estimated_complexity`, `estimated_market_age_years`; Search returns 10-15 competitors with funding stage, TAM, growth rate; Analyse outputs structured signals for scoring
- Real scoring algorithm from design doc: saturation factors in competitor count, funding concentration, market age, CAC signals; difficulty uses complexity, capital requirements, sales cycle, regulation, brand trust; opportunity uses TAM, growth rate, gap indicators minus penalties

---

## ✅ Authentication & User Identity (Completed)

**Status:** Done — May 2026

Implemented passwordless email OTP + Google SSO via BFF (Backend-for-Frontend) pattern. Sign-in required for all API access — no anonymous usage. All DynamoDB queries org-scoped.

**What was built:**
- Passwordless email OTP: 3 Cognito trigger Lambdas (define, create, verify) + SES (`noreply@plinths.net`)
- Google SSO via Cognito with custom domain (`auth.plinths.net`)
- BFF Auth Lambda: `/auth/initiate`, `/auth/verify`, `/auth/login`, `/auth/callback`, `/auth/refresh`, `/auth/logout`, `/auth/me`
- Lambda Authorizer: denies all anonymous requests, validates JWT with issuer + token_use checks
- HttpOnly/Secure/SameSite cookies — tokens never touch JavaScript
- Transactional user+org creation (DynamoDB TransactWriteItems)
- Plan-aware rate limiting: free=3/day, pro=15/day, team=50/day, admin=9999/day
- Secrets in SSM Parameter Store (API key, Cognito client secret, sender email, Google OAuth creds)
- Custom domain: `plinths.net` (CloudFront + ACM) + `auth.plinths.net` (Cognito + ACM)
- Security: CVE patches (PyJWT, cryptography), OAuth CSRF state, verified ID token decode, atomic rate limiting

**Deferred:**
- GitHub SSO (requires Lambda-backed OIDC proxy — GitHub doesn't support standard OIDC for user login)
- Permission Engine / RBAC (single role for now)
- Team management, invite flow, self-service profile editing

---

## ✅ Scoring Algorithm & Data Enrichment (Completed)

**Status:** Done — May 2026

Rewrote the scoring algorithm to produce continuous scores across 0-100 instead of clustering at 10 and 75. Added Wikipedia + Wikidata as free data sources alongside Brave Search.

**Scoring changes:**
- Analyse prompt: binary booleans (true/false) → 1-10 gradient signals (funding_maturity, market_consolidation, switching_cost, cac_pressure, innovation_velocity)
- LLM now estimates TAM and growth when Brave Search doesn't find data
- Logarithmic competitor scaling (diminishing returns after 8 competitors)
- No fixed base score — all factors are data-driven
- New factors: switching cost, innovation velocity, fragmentation bonus

**Data enrichment:**
- Wikipedia REST API: company summaries and descriptions
- Wikidata SPARQL: founding year, employee count, revenue, industry, HQ, parent org
- Parallel lookups via ThreadPoolExecutor (8 workers, ~1s for 15 companies)
- Structured data formatted into LLM prompt as separate verified-facts section

---

## Persona-Based Reports

**Priority:** High (post-MVP)

Same pipeline, different output lens based on who's reading the report:

- **Founder** (current default): "Can I build this? What's the gap? How do I enter?"
- **Product Manager**: "What features are competitors missing? Where's the user pain? What should we build next?"
- **Angel Investor**: "Is this market worth investing in? What's the TAM? Who are the winners? What's the risk?"

**Implementation:** Add a `persona` field to `POST /api/reports`. Swap the summarise stage prompt template based on persona. Same data collection, different narrative output.

---

## Tiered Model Selection (Paid Feature)

**Priority:** Medium (post-billing)

Free tier uses the current 3-model pipeline (Nova Micro + DeepSeek + Haiku). Paid tiers upgrade the Analyse and Summarise models:

| Tier | Parse | Analyse | Summarise | Est. cost/report |
|---|---|---|---|---|
| Free | Nova Micro | DeepSeek V3.2 | Claude 3 Haiku | ~$0.007 |
| Pro | Nova Micro | Claude 3.5 Sonnet v2 | Claude 3.5 Sonnet v2 | ~$0.04 |
| Enterprise | Nova Micro | Claude Sonnet 4.6 | Claude Sonnet 4.6 | ~$0.06 |

**Implementation:** Add `model_tier` to the report request (derived from user's subscription). AI Lambda reads the tier and selects the Bedrock model ID accordingly. IAM already has wildcard Bedrock permissions.

---

## Crunchbase API — Investor Premium Tier

**Priority:** Medium (post-billing, post-beta validation)

Add Crunchbase Basic API ($500/month) as a premium data source for an Investor-grade report tier. This unlocks structured data that Brave Search can only approximate from public pages:

| Data | Brave (free, current) | Crunchbase API ($500/mo) |
|---|---|---|
| Company names & descriptions | ✅ via search snippets | ✅ structured, complete |
| Funding rounds & amounts | ⚠️ partial, from news articles | ✅ exact amounts, dates, investors |
| Investor names & portfolios | ❌ | ✅ full investor profiles |
| Acquisition history | ⚠️ partial | ✅ structured with deal terms |
| Employee count & growth | ⚠️ from LinkedIn snippets | ✅ historical headcount data |
| Revenue estimates | ❌ | ✅ where available |
| Similar companies graph | ❌ | ✅ Crunchbase's own similarity engine |

**Business case:** Charge $49-99/report or $299/month subscription for "Investor Intelligence" tier. At $500/month Crunchbase cost, you need ~10 premium reports/month to break even. The data quality jump justifies the price — investors expect Crunchbase-grade data.

**Implementation:**
- Add Crunchbase API key to SSM Parameter Store
- New search sub-stage: `_crunchbase_search()` alongside Brave searches
- Merge Crunchbase structured data with Brave web data before Analyse stage
- Upgrade Analyse model to Claude Sonnet for investor-tier reports
- Add investor-specific Summarise prompt (TAM breakdown, risk assessment, comparable exits, investment thesis)

**Pairs with:** Persona-Based Reports (Investor persona) + Tiered Model Selection (Enterprise tier models)

---

## Enterprise Hardening & Scalability

> Tasks from the original milestones that are not in scope for the current sprint but are relevant to production readiness and scale. Nothing here is cancelled — it's deferred until the core product is working and has users.

### Infrastructure (original Phase 1, Days 6-9)
- [ ] Create Terraform repo (`marketlens-infra`) with remote state in S3 + DynamoDB lock table
- [ ] AWS account structure: `dev`, `staging`, `prod` accounts via AWS Organizations
- [ ] Enable CloudTrail (all regions), GuardDuty, S3 Block Public Access — account level
- [ ] Bootstrap VPC: public subnet (ALB), private app subnet (ECS), private data subnet (RDS/DynamoDB)
- [ ] Security groups: default deny-all; explicit allow rules per service pair only
- [ ] Create KMS CMKs: one per environment (`dev`, `staging`, `prod`)
- [ ] Create remaining S3 buckets: audit-archive, search-cache, iac-state
- [ ] Enable Object Lock on `audit-archive` bucket (cannot be added retroactively)
- [ ] Provision RDS PostgreSQL (Multi-AZ off for dev, on for staging/prod)
- [ ] Run initial schema migration — all tables from data model doc
- [ ] Enable RLS on every table
- [ ] Create DynamoDB tables: `audit_events`, `sessions`, `pipeline_executions`, `notification_log`, `notification_preferences`
- [ ] Provision ElastiCache Redis cluster
- [ ] Migrate pipeline from DynamoDB to Postgres `market_reports` table

### Audit Service (original Phase 1, Days 10-11)
- [ ] Build Audit Service: SQS consumer Lambda
- [ ] Implement hash chain: each event gets `checksum` + `prev_checksum` from day one
- [ ] Write to DynamoDB `audit_events` table
- [ ] Stream to S3 `audit-archive` via DynamoDB Streams → Lambda
- [ ] Wire pipeline Lambda to emit audit events on: report created, pipeline complete
- [ ] Integrity check Lambda: scheduled every 6h, SNS alert on chain break

### Local Dev & Testing (original Phase 1, Days 12-13)
- [ ] Local dev: `docker-compose.yml` with Postgres, Redis, LocalStack (for SQS/S3/DynamoDB)
- [ ] Shared packages: `logger` (structured JSON), `errors` (typed error classes), `db` (connection pool + RLS context setter)
- [ ] `.env.example` with all required env vars documented
- [ ] Wire ElastiCache cache for search results: key pattern `search_cache:{sub_stage}:{query_hash}`, 1hr TTL

### Unit Tests (original Phase 0, unchecked)
- [ ] Unit tests: sanitize rejects bad inputs, parse returns valid schema
- [ ] Unit test scoring algorithm: known inputs → expected outputs
- [ ] End-to-end test: open browser → type idea → watch it process → read the report

### WAF & Throttling (original Phase 3)
- [ ] Wire AWS API Gateway in front of all services (WAF entry point)
- [ ] Attach WAF: OWASP Core Rule Set, rate limiting per `org_id`
- [ ] Per-client throttling: free tier = 10 reports/hr, Pro = 100/hr
- [ ] Error messages: every error the user might see has a human-readable message (not a stack trace)

### Beta Operations (original Phase 3)
- [ ] Invite list: 10–20 people who will give you honest feedback
- [ ] Feedback mechanism: simple thumbs up/down on reports + optional free text
- [ ] Basic analytics: how many reports run, which ideas, where does the pipeline fail
- [ ] `staging` environment fully deployed — beta users hit staging, not dev
- [ ] On-call: PagerDuty or simple CloudWatch alarm → SMS

### Token Tracking (original Phase 0 Day 4)
- [ ] AI Lambda: sum input/output tokens per LLM call across all stages
- [ ] Write `total_tokens_input`, `total_tokens_output`, `cost_usd_cents` to report record in DynamoDB
- [ ] Log token breakdown per stage in CloudWatch

### RBAC Expansion (original Phase 5)
- [ ] Add remaining roles: `team_manager`, `api_developer`, `auditor`, `billing_admin`
- [ ] Add all 6 platform roles: `super_admin`, `platform_ops`, `platform_support`, etc.
- [ ] Custom role builder: org owners compose permission strings via UI
- [ ] MFA step-up enforcement for privileged actions (delete, purge, admin, impersonate)

### Audit Depth Expansion (original Phase 5)
- [ ] Add all 8 event categories (currently only: data access + data mutation)
- [ ] Add: auth events, access control changes, billing events, security events, system events
- [ ] Audit log query UI for org `auditor` role
- [ ] Scheduled chain integrity report: weekly email to `org_owner`

### Multi-Tenancy Hardening (original Phase 5)
- [ ] Test RLS with 10+ concurrent orgs
- [ ] Verify cross-tenant query is impossible (automated test suite)
- [ ] Separate KMS keys per org (Enterprise tier only)
- [ ] S3 prefix isolation tested under load

### Disaster Recovery (original Phase 5)
- [ ] Enable RDS Multi-AZ in prod
- [ ] Enable DynamoDB Global Tables (replicate to `us-west-2`)
- [ ] S3 cross-region replication
- [ ] Route 53 health checks + failover routing
- [ ] First GameDay exercise: simulate `us-east-1` outage, verify failover

### Compliance Runway (original Phase 5)
- [ ] Set up Vanta (SOC 2 evidence automation)
- [ ] Security Hub: CIS L1 findings remediated
- [ ] Privacy policy + DPA published
- [ ] GDPR deletion workflow live
- [ ] Penetration test (external, before SOC 2 audit)

---
