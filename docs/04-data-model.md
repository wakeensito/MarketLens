# 04 — Data Model

> Every table, every relationship, every index. The contract every service builds against.

**Status:** v1.0 · **Owner:** Backend Lead · **Last reviewed:** April 2026

> 📖 **Prerequisites:** Read [01 — Technical Specification](./01-technical-spec.md) §7 (Architecture-Level Isolation) and §12 (Data Architecture).

---

## Table of Contents

1. [Storage Strategy Overview](#1-storage-strategy-overview)
2. [PostgreSQL Schema](#2-postgresql-schema)
3. [Row-Level Security](#3-row-level-security)
4. [DynamoDB Tables](#4-dynamodb-tables)
5. [S3 Bucket Layout](#5-s3-bucket-layout)
6. [ElastiCache Key Patterns](#6-elasticache-key-patterns)
7. [Indexes & Query Patterns](#7-indexes--query-patterns)
8. [Data Retention & Deletion](#8-data-retention--deletion)
9. [GDPR Right to Erasure](#9-gdpr-right-to-erasure)
10. [Schema Migration Strategy](#10-schema-migration-strategy)
11. [Backup & Restore](#11-backup--restore)

---

## 1. Storage Strategy Overview

MarketLens uses **four storage technologies**, each chosen for a specific access pattern:

| Store | Used For | Access Pattern | Why This Choice |
|---|---|---|---|
| PostgreSQL (RDS) | Relational entities: orgs, users, teams, reports, billing | Complex joins, transactions, ACID requirements | Mature, RLS for tenant isolation, strong type system |
| DynamoDB | Audit logs, sessions, pipeline executions, notification log | High write throughput, key-based access, TTL needs | Auto-scaling writes, partition isolation, cheap at scale |
| S3 | Report exports (PDF/CSV/PPTX), audit archive, raw search caches | Object storage, large blobs, immutable archives | Object Lock for audit, lifecycle management, cheap |
| ElastiCache (Redis) | Session cache, AI search result cache, rate-limit counters | Sub-ms reads, ephemeral data | In-memory speed, clustering, AUTH support |

### Decision Rules

- **Need complex queries / joins?** → Postgres.
- **Write-heavy, read-by-key?** → DynamoDB.
- **Large blob (>1MB) or for download?** → S3.
- **Sub-ms read, ephemeral?** → ElastiCache.

---

## 2. PostgreSQL Schema

### 2.1 ERD (Entity Relationship Diagram)

```text
┌──────────────────┐       ┌──────────────────┐
│  organisations   │◄──────┤      users       │
│ ─────────────── │ 1   * │ ─────────────── │
│ org_id  PK       │       │ user_id  PK      │
│ name             │       │ org_id   FK      │
│ tier             │       │ email            │
│ settings_json    │       │ cognito_sub      │
│ created_at       │       │ status           │
│ is_active        │       │ created_at       │
└────────┬─────────┘       └─────────┬────────┘
         │                           │
         │ 1                       * │
         ▼ *                         │
┌──────────────────┐                 │
│      teams       │                 │
│ ─────────────── │                 │
│ team_id  PK      │                 │
│ org_id   FK      │◄────────────────┤
│ name             │   *           * │
│ settings_json    │                 │
│ created_at       │                 │
└────────┬─────────┘                 │
         │ 1                         │
         ▼ *                         │
┌──────────────────┐                 │
│  team_members    │                 │
│ ─────────────── │                 │
│ team_id  FK PK   │◄────────────────┤
│ user_id  FK PK   │                 │
│ joined_at        │                 │
└──────────────────┘                 │
                                     │
┌──────────────────┐                 │
│      roles       │                 │
│ ─────────────── │                 │
│ role_id  PK      │                 │
│ org_id   FK      │                 │
│ role_name        │                 │
│ is_system_role   │                 │
│ permissions_json │                 │
│ created_at       │                 │
└────────┬─────────┘                 │
         │ 1                         │
         ▼ *                         │
┌──────────────────────┐             │
│    user_roles        │             │
│ ─────────────────── │             │
│ user_id   FK PK      │◄────────────┤
│ role_id   FK PK      │             │
│ team_id   FK (nullable)            │
│ granted_by FK        │             │
│ granted_at           │             │
└──────────────────────┘             │
                                     │
┌──────────────────────┐             │
│   market_reports     │             │
│ ─────────────────── │             │
│ report_id   PK       │             │
│ org_id      FK       │             │
│ team_id     FK (nullable)          │
│ created_by  FK       │◄────────────┤
│ idea_text   text     │             │
│ result_json jsonb    │             │
│ status      enum     │             │
│ created_at           │             │
│ updated_at           │             │
│ deleted_at (nullable)│             │
└──────────┬───────────┘             │
           │ 1                       │
           ▼ *                       │
┌──────────────────────┐             │
│   report_shares      │             │
│ ─────────────────── │             │
│ share_id    PK       │             │
│ report_id   FK       │             │
│ org_id      FK       │             │
│ shared_by   FK       │◄────────────┤
│ share_token (unique) │             │
│ expires_at           │             │
│ access_scope         │             │
│ created_at           │             │
└──────────────────────┘             │
                                     │
┌──────────────────────┐             │
│   query_history      │             │
│ ─────────────────── │             │
│ query_id    PK       │             │
│ org_id      FK       │             │
│ user_id     FK       │◄────────────┤
│ query_text           │             │
│ tokens_used  int     │             │
│ created_at           │             │
└──────────────────────┘             │
                                     │
┌──────────────────────┐             │
│      api_keys        │             │
│ ─────────────────── │             │
│ key_id      PK       │             │
│ org_id      FK       │             │
│ user_id     FK       │◄────────────┤
│ key_hash    (unique) │             │
│ scopes_json          │             │
│ expires_at           │             │
│ last_used_at         │             │
│ is_revoked   bool    │             │
│ created_at           │             │
└──────────────────────┘             │
                                     │
┌──────────────────────┐             │
│   subscriptions      │             │
│ ─────────────────── │             │
│ subscription_id PK   │             │
│ org_id      FK       │◄────────────┤
│ tier        enum     │ (one-to-one)│
│ stripe_sub_id        │             │
│ status               │             │
│ current_period_end   │             │
│ created_at           │             │
└──────────────────────┘             │
                                     │
┌──────────────────────┐             │
│      invoices        │             │
│ ─────────────────── │             │
│ invoice_id  PK       │             │
│ org_id      FK       │             │
│ stripe_invoice_id    │             │
│ amount_usd_cents int │             │
│ status      enum     │             │
│ issued_at            │             │
│ paid_at  (nullable)  │             │
└──────────────────────┘             │
                                     │
┌──────────────────────┐             │
│  credit_balances     │             │
│ ─────────────────── │             │
│ org_id     PK        │             │
│ balance    int       │             │
│ updated_at           │             │
└──────────────────────┘             │
                                     │
┌──────────────────────┐             │
│   usage_records      │             │
│ ─────────────────── │             │
│ usage_id    PK       │             │
│ org_id      FK       │             │
│ user_id     FK       │◄────────────┘
│ report_id   FK       │
│ credits_consumed int │
│ tokens_input  int    │
│ tokens_output int    │
│ cost_usd_cents int   │
│ created_at           │
└──────────────────────┘
```

### 2.2 Table Definitions

#### `organisations`

```sql
CREATE TABLE organisations (
  org_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT         NOT NULL,
  slug            TEXT         NOT NULL UNIQUE,        -- URL-safe identifier
  tier            TEXT         NOT NULL CHECK (tier IN ('free','pro','team','enterprise')),
  settings_json   JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  deleted_at      TIMESTAMPTZ                          -- soft delete
);

CREATE INDEX idx_organisations_slug ON organisations(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_organisations_tier ON organisations(tier) WHERE is_active;
```

#### `users`

```sql
CREATE TABLE users (
  user_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID         NOT NULL REFERENCES organisations(org_id),
  email           TEXT         NOT NULL,
  cognito_sub     TEXT         NOT NULL UNIQUE,        -- Cognito 'sub' claim
  display_name    TEXT,
  status          TEXT         NOT NULL CHECK (status IN ('invited','active','suspended','deactivated')),
  mfa_enrolled    BOOLEAN      NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_users_org_email ON users(org_id, lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_cognito_sub ON users(cognito_sub);
CREATE INDEX idx_users_status ON users(org_id, status) WHERE deleted_at IS NULL;
```

#### `teams`

```sql
CREATE TABLE teams (
  team_id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID         NOT NULL REFERENCES organisations(org_id),
  name            TEXT         NOT NULL,
  settings_json   JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_teams_org ON teams(org_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_teams_org_name ON teams(org_id, lower(name)) WHERE deleted_at IS NULL;
```

#### `team_members`

```sql
CREATE TABLE team_members (
  team_id         UUID         NOT NULL REFERENCES teams(team_id),
  user_id         UUID         NOT NULL REFERENCES users(user_id),
  org_id          UUID         NOT NULL REFERENCES organisations(org_id),  -- denormalised for RLS
  joined_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON team_members(user_id);
CREATE INDEX idx_team_members_org ON team_members(org_id);
```

#### `roles`

```sql
CREATE TABLE roles (
  role_id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID         REFERENCES organisations(org_id),  -- NULL for system roles
  role_name         TEXT         NOT NULL,
  is_system_role    BOOLEAN      NOT NULL DEFAULT FALSE,
  permissions_json  JSONB        NOT NULL DEFAULT '[]',  -- array of "scope:resource:action" strings
  description       TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_roles_org ON roles(org_id) WHERE NOT is_system_role;
CREATE UNIQUE INDEX idx_roles_system ON roles(role_name) WHERE is_system_role;
CREATE UNIQUE INDEX idx_roles_org_name ON roles(org_id, lower(role_name)) WHERE NOT is_system_role;
```

#### `user_roles`

```sql
CREATE TABLE user_roles (
  user_id         UUID         NOT NULL REFERENCES users(user_id),
  role_id         UUID         NOT NULL REFERENCES roles(role_id),
  team_id         UUID         REFERENCES teams(team_id),  -- NULL = org-wide role
  org_id          UUID         NOT NULL REFERENCES organisations(org_id),  -- denormalised for RLS
  granted_by      UUID         REFERENCES users(user_id),
  granted_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_user_roles_team ON user_roles(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_user_roles_org ON user_roles(org_id);
```

#### `market_reports`

```sql
CREATE TABLE market_reports (
  report_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID         NOT NULL REFERENCES organisations(org_id),
  team_id         UUID         REFERENCES teams(team_id),  -- NULL = personal report
  created_by      UUID         NOT NULL REFERENCES users(user_id),
  idea_text       TEXT         NOT NULL,
  result_json     JSONB,                                    -- full report output (Section 9 of AI doc)
  status          TEXT         NOT NULL CHECK (status IN ('pending','running','complete','failed')),
  pipeline_version TEXT,
  fingerprint     TEXT,                                     -- sha256 of sanitized idea
  total_tokens_input  INTEGER,
  total_tokens_output INTEGER,
  duration_ms     INTEGER,
  is_degraded     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_reports_org ON market_reports(org_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_team ON market_reports(team_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_user ON market_reports(created_by, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_status ON market_reports(status) WHERE status IN ('pending','running');
CREATE INDEX idx_reports_fingerprint ON market_reports(org_id, fingerprint) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_result_gin ON market_reports USING gin (result_json jsonb_path_ops);
```

#### `report_shares`

```sql
CREATE TABLE report_shares (
  share_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID         NOT NULL REFERENCES market_reports(report_id),
  org_id          UUID         NOT NULL REFERENCES organisations(org_id),
  shared_by       UUID         NOT NULL REFERENCES users(user_id),
  share_token     TEXT         NOT NULL UNIQUE,        -- random URL token
  expires_at      TIMESTAMPTZ  NOT NULL,
  access_scope    TEXT         NOT NULL CHECK (access_scope IN ('view_only','view_and_export')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_shares_report ON report_shares(report_id);
CREATE INDEX idx_shares_token ON report_shares(share_token) WHERE revoked_at IS NULL AND expires_at > now();
```

#### `query_history`

```sql
CREATE TABLE query_history (
  query_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID         NOT NULL REFERENCES organisations(org_id),
  user_id         UUID         NOT NULL REFERENCES users(user_id),
  query_text      TEXT         NOT NULL,
  tokens_used     INTEGER      NOT NULL DEFAULT 0,
  report_id       UUID         REFERENCES market_reports(report_id),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_queries_org_user ON query_history(org_id, user_id, created_at DESC);
CREATE INDEX idx_queries_org_time ON query_history(org_id, created_at DESC);
```

#### `api_keys`

```sql
CREATE TABLE api_keys (
  key_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID         NOT NULL REFERENCES organisations(org_id),
  user_id         UUID         NOT NULL REFERENCES users(user_id),
  key_hash        TEXT         NOT NULL UNIQUE,        -- bcrypt hash; raw key shown ONCE on creation
  key_prefix      TEXT         NOT NULL,               -- first 8 chars for UI display
  name            TEXT         NOT NULL,
  scopes_json     JSONB        NOT NULL DEFAULT '[]',
  rate_limit_per_min INTEGER   NOT NULL DEFAULT 60,
  ip_allowlist    INET[]       DEFAULT NULL,           -- NULL = no restriction
  expires_at      TIMESTAMPTZ,
  last_used_at    TIMESTAMPTZ,
  last_used_ip    INET,
  is_revoked      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX idx_apikeys_org ON api_keys(org_id) WHERE NOT is_revoked;
CREATE INDEX idx_apikeys_user ON api_keys(user_id) WHERE NOT is_revoked;
CREATE INDEX idx_apikeys_hash ON api_keys(key_hash) WHERE NOT is_revoked;
```

#### `subscriptions`

```sql
CREATE TABLE subscriptions (
  subscription_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID         NOT NULL UNIQUE REFERENCES organisations(org_id),
  tier              TEXT         NOT NULL CHECK (tier IN ('free','pro','team','enterprise')),
  stripe_sub_id     TEXT         UNIQUE,
  status            TEXT         NOT NULL CHECK (status IN ('active','past_due','canceled','paused')),
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_status ON subscriptions(status, current_period_end);
```

#### `invoices`

```sql
CREATE TABLE invoices (
  invoice_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID         NOT NULL REFERENCES organisations(org_id),
  stripe_invoice_id TEXT         UNIQUE,
  amount_usd_cents  INTEGER      NOT NULL,
  status            TEXT         NOT NULL CHECK (status IN ('draft','open','paid','void','uncollectible')),
  issued_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  paid_at           TIMESTAMPTZ,
  pdf_url           TEXT,                              -- S3 signed URL (regenerated on demand)
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_org ON invoices(org_id, issued_at DESC);
```

#### `credit_balances`

```sql
CREATE TABLE credit_balances (
  org_id          UUID         PRIMARY KEY REFERENCES organisations(org_id),
  balance         INTEGER      NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

#### `usage_records`

```sql
CREATE TABLE usage_records (
  usage_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID         NOT NULL REFERENCES organisations(org_id),
  user_id           UUID         NOT NULL REFERENCES users(user_id),
  report_id         UUID         REFERENCES market_reports(report_id),
  credits_consumed  INTEGER      NOT NULL,
  tokens_input      INTEGER      NOT NULL DEFAULT 0,
  tokens_output     INTEGER      NOT NULL DEFAULT 0,
  cost_usd_cents    INTEGER      NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_org_time ON usage_records(org_id, created_at DESC);
CREATE INDEX idx_usage_user_time ON usage_records(user_id, created_at DESC);
```

---

## 3. Row-Level Security

Every table containing tenant data has Row-Level Security (RLS) enabled. This is the **last line of defence** against cross-tenant access — even if application code is buggy, the database itself blocks the query.

### 3.1 Setup Pattern

```sql
ALTER TABLE market_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_reports FORCE ROW LEVEL SECURITY;   -- applies even to table owner

CREATE POLICY tenant_isolation ON market_reports
  USING (org_id = current_setting('app.current_org_id')::uuid);
```

### 3.2 Setting the Tenant Context

Every database connection from a service sets the `app.current_org_id` session variable IMMEDIATELY after acquiring the connection from the pool:

```sql
SET LOCAL app.current_org_id = '<uuid>';
```

If this is NOT set, RLS rejects all queries — fail-closed by default.

### 3.3 Tables With RLS

All tables in §2 have RLS enabled with the `tenant_isolation` policy, except:

- `roles` (when `is_system_role = TRUE`) — system roles are global; policy includes a `OR is_system_role` clause.
- `organisations` — readable per-row only when `org_id = current_setting('app.current_org_id')::uuid`; the Org & User Service has a separate "admin pool" connection for super_admin queries.

### 3.4 Bypass for super_admin

`super_admin` operations require a separate connection pool that uses a privileged DB role with `BYPASSRLS`. This pool is:

- Used only by the `super_admin` API handlers.
- Audit-logged on every query (separate Postgres extension records all statements via `pg_stat_statements`).
- Inaccessible from any other service.

---

## 4. DynamoDB Tables

### 4.1 `audit_events`

> Owner: Audit Service · Encrypted with dedicated CMK · Capacity: On-demand

| Attribute | Type | Notes |
|---|---|---|
| `pk` (partition) | String | `org_id` |
| `sk` (sort) | String | `<timestamp_ms>#<log_id>` (sortable, unique) |
| `log_id` | String | UUID v4 |
| `actor_id` | String | (GSI1 partition key) |
| `actor_type` | String | enum |
| `actor_ip_hash` | String | SHA-256 of IP (GDPR) |
| `session_id` | String | |
| `action` | String | e.g. `market_reports:create` |
| `resource_type` | String | (GSI2 partition key) |
| `resource_id` | String | (GSI2 sort key with timestamp) |
| `result` | String | `success` / `denied` / `error` |
| `metadata` | Map | JSON, PII stripped |
| `checksum` | String | SHA-256 of all above |
| `prev_checksum` | String | Chain link |

**GSI1:** `actor_id` (partition) + `sk` — query by user.
**GSI2:** `resource_type#resource_id` (partition) + `sk` — query by resource history.

**Stream:** Enabled. Consumed by Lambda that copies records to S3 audit archive (immutable storage).

### 4.2 `sessions`

> Owner: Auth Service · TTL enabled (auto-cleanup expired sessions)

| Attribute | Type | Notes |
|---|---|---|
| `pk` (partition) | String | `session_id` |
| `user_id` | String | (GSI1 partition key) |
| `org_id` | String | |
| `created_at` | Number | epoch ms |
| `last_active` | Number | epoch ms (updated on each request) |
| `ip_hash` | String | |
| `user_agent_hash` | String | |
| `is_revoked` | Boolean | |
| `expires_at` | Number | TTL attribute (DynamoDB auto-deletes) |

**GSI1:** `user_id` + `created_at` — list all sessions for a user.

### 4.3 `pipeline_executions`

> Owner: AI Orchestration Service · Capacity: On-demand

| Attribute | Type | Notes |
|---|---|---|
| `pk` (partition) | String | `org_id` |
| `sk` (sort) | String | `<timestamp_ms>#<execution_id>` |
| `execution_id` | String | Step Functions ARN |
| `report_id` | String | |
| `pipeline_version` | String | |
| `stage_results` | Map | per-stage metadata (duration, tokens, errors) |
| `total_duration_ms` | Number | |
| `total_tokens_input` | Number | |
| `total_tokens_output` | Number | |
| `cost_usd_cents` | Number | |
| `final_status` | String | `complete` / `failed` / `degraded` |
| `created_at` | Number | epoch ms |

### 4.4 `notification_log`

> Owner: Notification Service · TTL: 90 days

| Attribute | Type | Notes |
|---|---|---|
| `pk` (partition) | String | `user_id` |
| `sk` (sort) | String | `<timestamp_ms>#<notif_id>` |
| `notif_type` | String | e.g. `report_ready`, `invoice_issued` |
| `channel` | String | `email`, `slack`, `push` |
| `status` | String | `sent`, `delivered`, `failed` |
| `dedupe_key` | String | (GSI1) prevents duplicate sends within 1h |
| `created_at` | Number | |
| `expires_at` | Number | TTL |

### 4.5 `notification_preferences`

> Owner: Notification Service

| Attribute | Type | Notes |
|---|---|---|
| `pk` (partition) | String | `user_id` |
| `sk` (sort) | String | `<notif_type>` |
| `email_enabled` | Boolean | |
| `slack_enabled` | Boolean | |
| `push_enabled` | Boolean | |
| `updated_at` | Number | |

---

## 5. S3 Bucket Layout

| Bucket | Purpose | Encryption | Object Lock | Lifecycle |
|---|---|---|---|---|
| `marketlens-reports-{env}` | Generated PDF/CSV/PPTX exports | KMS (CMK) | No | Delete after 30 days |
| `marketlens-audit-archive-{env}` | Immutable audit log archive (Parquet) | KMS (dedicated CMK) | **YES — Compliance mode** | Glacier Deep Archive after 1 year; never delete |
| `marketlens-search-cache-{env}` | Cached search results (raw HTML/JSON) | KMS (CMK) | No | Delete after 7 days |
| `marketlens-iac-state-{env}` | Terraform state files | KMS (CMK) | No | Versioning enabled (no expiry) |
| `marketlens-cloudtrail-{env}` | AWS API audit logs | KMS (CMK) | YES (Governance mode) | Glacier after 90 days; retain 7 years |
| `marketlens-vpc-flow-logs-{env}` | VPC Flow Logs | KMS (CMK) | No | Delete after 1 year |
| `marketlens-static-assets` | Public CDN assets (logo, CSS) | SSE-S3 | No | n/a (CloudFront cached) |

### 5.1 Tenant Key Prefix Pattern

All tenant data buckets use this prefix structure:

```text
marketlens-reports-prod/
  {org_id}/
    {report_id}/
      report.pdf
      data.csv
      slides.pptx
```

IAM policies enforce that services can only access objects under their tenant's prefix (via `s3:prefix` condition keys).

---

## 6. ElastiCache Key Patterns

> Redis cluster mode enabled. AUTH token stored in Secrets Manager.

| Key Pattern | TTL | Purpose | Owner |
|---|---|---|---|
| `session:{session_id}` | 30 min idle / 12h absolute | Hot session cache | Auth Service |
| `permissions:{user_id}:{org_id}` | 60s | Computed permission set cache | Permission Engine |
| `rate_limit:user:{user_id}:{endpoint}` | 1 min sliding | Per-user rate limiting | API Gateway authoriser |
| `rate_limit:org:{org_id}:{endpoint}` | 1 min sliding | Per-org rate limiting | API Gateway authoriser |
| `search_cache:{sub_stage}:{query_hash}` | 1 hour | AI search result cache | Search Service |
| `report_progress:{report_id}` | 5 min | Pipeline progress for polling | Report Service |
| `revoked_tokens:{token_jti}` | until token expiry | Revocation list (set membership) | Auth Service |

**Naming rule:** All keys start with the data type, then identifiers, separated by `:`. Tenant-scoping is implicit through the IDs (no cross-tenant collisions because UUIDs are globally unique).

---

## 7. Indexes & Query Patterns

### 7.1 Common Query Patterns

| Query | Index Used | Service |
|---|---|---|
| List reports for org, newest first | `idx_reports_org` | Report Service |
| List reports for a team | `idx_reports_team` | Report Service |
| List reports created by a user | `idx_reports_user` | Report Service |
| Find pending/running reports (status check) | `idx_reports_status` (partial index) | Report Service |
| Deduplicate identical idea within 24h | `idx_reports_fingerprint` | AI Orchestration |
| Search inside `result_json` for keyword | `idx_reports_result_gin` | Report Service (search feature) |
| User's role assignments | `idx_user_roles_user` | Permission Engine |
| Team's members | `idx_team_members_user`, `idx_team_members_team` (PK) | Org & User Service |
| Active sessions for a user | DynamoDB GSI1 on `sessions` | Auth Service |
| Audit events for a resource | DynamoDB GSI2 on `audit_events` | Audit Service |
| Audit events by actor | DynamoDB GSI1 on `audit_events` | Audit Service |

### 7.2 Index Design Principles

- **Partial indexes** for soft-deleted rows: `WHERE deleted_at IS NULL` keeps indexes small.
- **Composite indexes** match the WHERE clause AND ORDER BY together (e.g. `(org_id, created_at DESC)`).
- **GIN index on JSONB** for flexible search on report contents (`@>` containment queries).
- **No over-indexing** — every index slows writes; we add indexes only for measured query patterns.

---

## 8. Data Retention & Deletion

### 8.1 Retention Schedule

| Data | Retention | Deletion Method |
|---|---|---|
| Authentication events | 2 years | DynamoDB TTL → archive to S3 Glacier |
| Access control changes | 5 years | Stored in audit log (immutable) |
| Data access events | 1 year | DynamoDB TTL |
| Data mutation events | 5 years | Stored in audit log (immutable) |
| Privileged actions | 7 years | Stored in audit log (immutable) |
| Billing events | 7 years | Stored in audit log (immutable) |
| Security events | 3 years | DynamoDB TTL → archive to S3 |
| Sessions | 12 hours absolute / 30 min idle | DynamoDB TTL |
| Search cache | 1 hour | Redis TTL |
| Search cache (raw S3) | 7 days | S3 lifecycle |
| Report exports (S3) | 30 days | S3 lifecycle |
| Query history (free tier) | 12 months | Scheduled Lambda cleanup |
| Query history (paid tiers) | Life of account | Manual deletion only |
| Soft-deleted reports | 30 days, then purged | Scheduled Lambda |
| Notification log | 90 days | DynamoDB TTL |

### 8.2 Soft Delete vs Hard Delete

Most tables use soft delete: `deleted_at` timestamp set, row hidden by partial indexes and queries. Hard delete (purge) requires:

- `team:market_reports:P` permission, OR
- Scheduled cleanup Lambda (after retention period)
- MFA step-up for user-initiated purge
- Always logged to audit (immutable) — the audit log records the deletion forever, even after the data itself is gone

---

## 9. GDPR Right to Erasure

GDPR Article 17 grants EU users the right to have their personal data erased. MarketLens supports this via a dedicated `data_deletion_requests` workflow.

### 9.1 What Gets Erased

When a deletion request is verified and approved:

| Data | Action |
|---|---|
| `users` row | Anonymised: email → `deleted-{user_id}@anon.local`, display_name → `Deleted User`, cognito_sub → null |
| User's `query_history` | Hard deleted |
| User's `market_reports` (created_by) | `created_by` set to special `system` user; `idea_text` redacted to `[REDACTED]` |
| `team_members` rows | Hard deleted |
| `user_roles` rows | Hard deleted |
| `api_keys` | All revoked and `key_hash` redacted |
| `sessions` (DynamoDB) | All revoked (TTL-cleaned naturally) |
| `notification_log` (DynamoDB) | Hard deleted |
| `notification_preferences` | Hard deleted |
| Audit logs containing `actor_id = user_id` | **NOT deleted** — `actor_id` replaced with deterministic pseudonym (HMAC-SHA256(user_id, secret)) |

### 9.2 Why Audit Logs Are Pseudonymised, Not Deleted

GDPR allows retention for legal compliance (Article 17(3)(b)). Audit logs satisfy SOC 2, financial, and security obligations that override the right to erasure. We pseudonymise instead — original `user_id` replaced with a one-way hash, breaking the link to the natural person while preserving the audit chain integrity (checksum chain remains valid because field length is preserved).

### 9.3 Deletion Workflow

```text
1. User initiates request via /me/delete-account UI.
2. Email verification: link with one-time token sent to user's email (24h expiry).
3. User confirms via link.
4. 7-day grace period: account suspended but recoverable. Email sent on Day 0, Day 5.
5. After Day 7: scheduled Lambda runs deletion routine inside a single Postgres transaction.
6. Audit event written: `event=user.erased, actor=system, target_user_pseudonym=<hash>`.
7. Confirmation email sent (to a separate "deletion confirmation" address user provided).
```

### 9.4 Org-Initiated Deletion

When an org_owner deletes a user from their org:

- The user's data is anonymised within the org's records.
- Personal queries and reports are reassigned to a "deleted user" placeholder.
- Audit log entries for that user remain (pseudonymised).

---

## 10. Schema Migration Strategy

### 10.1 Tooling

- **Migrations:** [Atlas](https://atlasgo.io) or [Flyway] — choose one in Sprint 0; documented in CONTRIBUTING.md.
- **Migration files:** versioned, immutable once merged. Located at `services/db-migrations/postgres/`.
- **DynamoDB:** schema-less; changes documented in this doc + table-design ADRs in `/docs/adr/`.

### 10.2 Migration Rules

1. **Backward compatible first.** A migration must NOT break existing service instances.
2. **Two-phase changes:** `add column` (deploy) → `start writing to it` (deploy) → `start reading from it` (deploy) → `remove old column` (deploy).
3. **Never `DROP` in the same migration as code changes.** Drops happen in a follow-up migration after all consumers have stopped using the column.
4. **No data migrations during deploys.** Heavy data backfills run as separate jobs against read replicas where possible.
5. **Run migrations BEFORE deploying app code.** Migration job runs as a pre-deploy step in the CI/CD pipeline.

### 10.3 Migration CI/CD

```text
1. PR includes new migration file + accompanying app code change.
2. CI runs migration against an ephemeral test database; runs full test suite.
3. Merge to main triggers staging migration.
4. Promotion to prod runs migration via dedicated migration runner ECS task BEFORE the new app version is deployed.
5. If migration fails, deployment aborts and on-call is paged.
```

---

## 11. Backup & Restore

### 11.1 RDS PostgreSQL

- **Automated backups:** daily, retained for 35 days.
- **Transaction log backups:** every 5 minutes (RPO < 5 min).
- **Cross-region snapshot copy:** daily snapshot copied to `us-west-2`.
- **Point-in-time restore:** any second within the retention window.
- **Monthly test restore:** automated; restored DB checked for schema integrity and row count parity.

### 11.2 DynamoDB

- **Point-in-time recovery (PITR):** enabled on all tables.
- **Global tables:** `audit_events`, `sessions`, `pipeline_executions` replicate to `us-west-2`.
- **On-demand backups:** weekly, retained for 90 days; stored in `us-east-1` and `us-west-2`.

### 11.3 S3

- **Versioning enabled** on all data buckets.
- **Cross-region replication:** all production buckets replicate to `us-west-2`.
- **Object Lock** on `audit-archive` and `cloudtrail` buckets — backups also locked.

### 11.4 Restore Procedures

Documented in runbooks (separate repo `marketlens-runbooks`). Each runbook covers:

- RDS point-in-time restore
- DynamoDB table restore from PITR
- S3 object version restore
- Full region failover (active-passive flip)

Each runbook is rehearsed quarterly via GameDay.

---

## Owners

| Area | Owner |
|---|---|
| Postgres schema (§2, §3) | Backend Lead |
| DynamoDB design (§4) | Backend Lead + Security Lead (audit) |
| S3 layout (§5) | DevOps Lead |
| ElastiCache patterns (§6) | Backend Lead |
| Retention & deletion (§8) | Security Lead + Legal |
| GDPR (§9) | Security Lead + Legal |
| Migrations (§10) | Backend Lead |
| Backup & restore (§11) | SRE Lead |

---

← Previous: [03 — AI Pipeline Architecture](./03-ai-pipeline.md) · Back to [README](../README.md)
