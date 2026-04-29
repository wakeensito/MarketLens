# 01 — Technical Specification

> Top-level architecture, access control, RBAC, audit logging, AWS infrastructure, IaC, and operational security for MarketLens.

**Status:** v1.0 · **Owner:** Engineering Lead · **Last reviewed:** April 2026

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [System Architecture](#2-system-architecture)
3. [Access Control & Identity](#3-access-control--identity)
4. [Role-Based Permissions (RBAC)](#4-role-based-permissions-rbac)
5. [Permission Scoping](#5-permission-scoping)
6. [Audit Logging](#6-audit-logging)
7. [Architecture-Level Isolation](#7-architecture-level-isolation)
8. [AWS Infrastructure](#8-aws-infrastructure)
9. [Infrastructure as Code](#9-infrastructure-as-code)
10. [Security Hardening & Compliance](#10-security-hardening--compliance)
11. [API Gateway & Service Mesh](#11-api-gateway--service-mesh)
12. [Data Architecture](#12-data-architecture)
13. [CI/CD Pipeline](#13-cicd-pipeline)
14. [Monitoring & Observability](#14-monitoring--observability)
15. [Disaster Recovery](#15-disaster-recovery)

---

## 1. Executive Overview

MarketLens is an AI-powered market intelligence platform that lets entrepreneurs and early-stage founders understand any business vertical in minutes. A user types a business idea; the platform returns a structured competitive landscape: who the players are, how saturated the space is, where the gaps are, and what it would realistically take to enter.

The platform is built with enterprise-grade security from day one — multi-tenant, role-based, fully audited, AWS-native.

### 1.1 Core Design Principles

- **Security-first** — access control and audit logging are the foundation, not features.
- **Multi-tenancy by default** — every data access is tenant-scoped from the infrastructure layer up.
- **Principle of least privilege** — users and services get only the permissions they need.
- **Everything is code** — no manual AWS console changes; all infrastructure via IaC.
- **Immutable audit trail** — all actions logged, tamper-evident, queryable.

### 1.2 Stakeholder Roles

| Stakeholder | Role | Primary Concern |
|---|---|---|
| Platform Admin | Internal ops/eng | System health, user management, billing, global config |
| Organisation Owner | B2B customer (company) | Team setup, billing, data privacy, usage |
| Team Manager | Department lead | Assign roles, review team output, approve reports |
| Analyst / Builder | End user (founder/analyst) | Run queries, generate reports, explore market data |
| Read-Only Viewer | Stakeholder/investor | View shared reports, no write access |
| Developer / API User | Integration partner / internal dev | Programmatic API access, scoped API keys |
| Auditor | Compliance/legal | Read-only access to audit logs, no operational access |

---

## 2. System Architecture

Cloud-native, microservices, hosted entirely on AWS. Defence-in-depth: network → service → data → application. Each layer enforces security policy independently.

### 2.1 Architecture Layers

| Layer | Technology | Purpose |
|---|---|---|
| DNS & Edge | Route 53 + CloudFront + WAF | DDoS protection, geo-blocking, TLS termination, rate limiting |
| Identity & Auth | AWS Cognito + Custom Auth Service | User identity, JWT issuance, MFA, OAuth2 / OIDC |
| API Gateway | AWS API Gateway (REST + WebSocket) | Request routing, throttling, API key management, auth enforcement |
| Application Services | ECS Fargate (containerised microservices) | Business logic: market analysis, RBAC, reporting, billing |
| AI Orchestration | Lambda (Durable Functions) | LLM prompt chaining, web search, result aggregation |
| Data Layer | RDS (Postgres) + DynamoDB + ElastiCache | Structured data, audit logs, sessions, caching |
| Storage | S3 (multi-bucket, encrypted) | Report artifacts, exports, audit archives |
| Observability | CloudWatch + OpenSearch + X-Ray | Logging, tracing, metrics, alerting |
| Security Services | GuardDuty + Security Hub + Config + Macie | Threat detection, compliance, data classification |

### 2.2 Multi-Tenancy Model

Pool model with logical data isolation enforced at the application and database levels, plus architectural isolation via IAM, VPC subnets, and resource tagging. Each tenant (Organisation) gets a globally unique `org_id` stamped on every resource, row, log entry, and API call.

**Tenant Isolation Enforcement Points:**

- **Database** — Row-Level Security (RLS) on all Postgres tables; queries without valid tenant context are rejected at DB level.
- **API Gateway** — Custom authoriser validates JWT and injects tenant context into every downstream request.
- **S3** — Separate key prefixes per tenant; IAM conditions enforce prefix boundaries.
- **ElastiCache** — Tenant-namespaced cache keys; no cross-tenant cache sharing.
- **Audit Logs** — DynamoDB partition key includes `org_id`; no cross-tenant log access possible.
- **Lambda Durable Functions** — Execution context includes `org_id`; AI service calls scoped and logged per tenant.

---

## 3. Access Control & Identity

Layered model: authentication (who are you?) → authorisation (what are you allowed to do?) → context validation (allowed to do this here, on this data, right now?). No single layer is trusted in isolation.

### 3.1 Authentication

AWS Cognito is the primary identity provider. Handles registration, MFA enforcement, password policy, token issuance, OAuth2 flows. All tokens are short-lived JWTs signed with RSA-256.

| Token Type | TTL | Contents | Usage |
|---|---|---|---|
| Access Token | 15 min | `user_id`, `org_id`, roles, scopes | All API calls — sent in `Authorization` header |
| Refresh Token | 7 days | `user_id`, `session_id` | Obtain new access token via `/auth/refresh` |
| ID Token | 15 min | User profile claims | Front-end display only — never sent to API |
| API Key (dev) | Configurable (default 90d) | `api_key_id`, `org_id`, scopes, rate limits | Developer / service-to-service programmatic access |

### 3.2 Authentication Flow

1. User submits credentials (email + password + MFA code if enforced).
2. Cognito validates credentials, account status, MFA, password policy.
3. On success, Cognito issues access, refresh, and ID tokens.
4. Front-end stores access/ID tokens in memory; refresh token in HttpOnly secure cookie.
5. Every API request includes the access token in `Authorization: Bearer <token>`.
6. API Gateway Lambda Authoriser validates signature, expiry, issuer, audience.
7. Authoriser injects validated claims (`user_id`, `org_id`, roles) into request context.
8. Downstream services read context from the request — they never re-validate the token.

### 3.3 MFA Policy

| Role | MFA Requirement | Allowed Methods |
|---|---|---|
| Platform Admin | **MANDATORY** — cannot be disabled | TOTP only |
| Organisation Owner | **MANDATORY** after first login | TOTP or SMS |
| Team Manager | Enforced by org owner policy | TOTP or SMS |
| Analyst / Builder | Optional (owner can enforce) | TOTP or SMS |
| Read-Only Viewer | Optional | TOTP or SMS |
| Developer / API User | N/A — uses API keys, not passwords | API key + IP allowlist |
| Auditor | **MANDATORY** | TOTP only |

### 3.4 Session Management

- Sessions tracked in DynamoDB: `session_id`, `user_id`, `org_id`, `created_at`, `last_active`, `ip_address`, `user_agent`, `is_revoked`.
- Concurrent session limit: configurable per org (default 3 active per user).
- Idle timeout: 30 minutes — revokes access token; refresh required.
- Absolute session expiry: 12 hours regardless of activity (8 hours for Platform Admins).
- Token revocation: immediate; revocation list checked by authoriser on every request.
- Admin force-logout: Platform Admins and Org Owners can terminate any session in scope instantly.

---

## 4. Role-Based Permissions (RBAC)

Two independent role hierarchies: **Platform Roles** (internal, cross-tenant) and **Organisation Roles** (tenant-scoped). Internal staff with both are governed by strict PAM policies.

### 4.1 Platform Roles (Internal / Cross-Tenant)

> ⚠️ Not visible to customers. Access logged with elevated scrutiny. All destructive ops require MFA step-up. Breakglass access (emergency cross-tenant read) requires dual approval and auto-expires in 2 hours.

| Platform Role | Scope | Key Permissions |
|---|---|---|
| `super_admin` | All tenants, all data | Full system access, role assignment, emergency ops, config changes |
| `platform_ops` | All tenants, operational data | Infrastructure, deployments, monitoring, support tickets |
| `platform_support` | Tenant metadata only | Read account info, impersonate (with audit log) for support |
| `platform_billing` | Billing records only | Read/write billing, invoices, subscriptions — no user data |
| `platform_auditor` | All audit logs | Read-only audit trail, compliance reports — no operational access |
| `platform_security` | Security events, configs | WAF rules, GuardDuty findings, security policies |

### 4.2 Organisation Roles (Tenant-Scoped)

Scoped entirely within a single tenant. An `org_owner` cannot access another tenant's data even if they hold the same role there. Roles are additive — `team_manager` inherits `analyst` permissions. Custom roles can be composed by `org_owner`s (see §5).

| Org Role | Inherits From | Scope |
|---|---|---|
| `org_owner` | `team_manager` | Full org: billing, user management, all teams, all data, all settings |
| `team_manager` | `analyst` | Assigned teams: members, approve reports, view usage, set team policies |
| `analyst` | `viewer` | Assigned teams: create/run queries, generate reports, save research, manage own data |
| `viewer` | (none) | Shared reports only: read-only access to reports explicitly shared |
| `api_developer` | (custom) | Programmatic API access: scoped by API key permissions, no UI access |
| `auditor` | (none) | Read-only: audit logs scoped to own org — cannot view data, only actions |
| `billing_admin` | `viewer` | Billing section only: invoices, usage, payment methods — no data access |

### 4.3 Permission Inheritance Matrix

Legend: ✅ allowed · 🔶 scoped · ❌ denied

| Permission Area | super_admin | org_owner | team_manager | analyst | viewer | api_dev | auditor |
|---|---|---|---|---|---|---|---|
| Manage org users | ✅ all orgs | ✅ own org | 🔶 own team | ❌ | ❌ | ❌ | ❌ |
| Create/run queries | ✅ | ✅ | ✅ | ✅ | ❌ | 🔶 API | ❌ |
| View reports | ✅ | ✅ | 🔶 team | 🔶 own | 🔶 shared | 🔶 API | ❌ |
| Export data | ✅ | ✅ | ✅ | ✅ | ❌ | 🔶 API | ❌ |
| Manage billing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View audit logs | ✅ | 🔶 own org | 🔶 team | ❌ | ❌ | ❌ | 🔶 own org |
| Modify RBAC config | ✅ | 🔶 own org | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete org / data | ✅ | 🔶 own org | ❌ | ❌ | ❌ | ❌ | ❌ |
| API key management | ✅ | ✅ | 🔶 team | 🔶 own keys | ❌ | 🔶 own keys | ❌ |

---

## 5. Permission Scoping

Every permission is evaluated against three orthogonal dimensions simultaneously. All three must pass for an operation to be authorised. Enforced by the **Permission Engine** — a centralised authorisation microservice called by all other services via internal gRPC.

### 5.1 Dimension 1 — Team Scope

| Scope Level | Description | Applies To |
|---|---|---|
| `global` | Across entire organisation | `org_owner`, `auditor`, `billing_admin` |
| `team` | Within specifically assigned teams | `team_manager`, `analyst` (multi-team support) |
| `personal` | Own data only — queries/reports created by self | `analyst` (default), all roles for own profile |
| `shared` | Explicitly shared resources (report, workspace) | `viewer`, `analyst` (read), any role with share token |

### 5.2 Dimension 2 — Data Type Scope

Each API endpoint declares which data types it touches; the Permission Engine validates the user has appropriate rights to all declared types.

| Data Type | Description | Sensitivity |
|---|---|---|
| `market_reports` | Generated competitive analysis and market intelligence reports | Standard |
| `query_history` | Log of search queries and AI prompts submitted by users | Standard |
| `team_members` | User profiles, role assignments within the org | Sensitive |
| `api_keys` | Developer API keys and their scopes | Sensitive |
| `billing_data` | Invoices, payment methods, subscription tier, credit usage | Highly Sensitive |
| `audit_logs` | Full immutable action log — all user/system events | Highly Sensitive |
| `org_settings` | Organisation configuration, RBAC policy, SSO settings | Sensitive |
| `ai_usage_metrics` | Token consumption, query counts, credit balance | Standard |
| `system_config` | Platform-level configuration (internal only) | Critical |

### 5.3 Dimension 3 — Action Scope

| Action | Code | Description | Requires MFA Step-Up |
|---|---|---|---|
| Create | `C` | Create a new resource | No (except `org_settings`, `api_keys`) |
| Read | `R` | Read/view a resource | No |
| Update | `U` | Modify an existing resource | No (except `billing_data`, `org_settings`) |
| Delete | `D` | Soft-delete a resource | Yes for bulk delete |
| Purge | `P` | Hard-delete (permanent) | **Yes — always** |
| Export | `E` | Download / export data externally | No (rate-limited) |
| Share | `S` | Generate share link / invite viewer | No |
| Admin | `A` | Role assignment, policy changes | **Yes — always** |
| Impersonate | `I` | Act as another user (support) | **Yes + dual approval** |

### 5.4 Permission String Format

```text
{scope}:{resource_type}:{action}

Examples:
  team:market_reports:CRE       → Create + Read + Export market reports in assigned teams
  global:audit_logs:R           → Read audit logs across entire org
  personal:api_keys:CRUD        → Full standard access to own API keys
```

- **Scope values:** `global`, `team:<team_id>`, `personal`, `shared:<resource_id>`.
- **Actions** are concatenated: `CRE` = Create + Read + Export.
- **Wildcard (`*`)** is permitted ONLY for `super_admin` — explicitly blocked for all org-scoped roles.
- **Custom roles** are built by composing permission strings via the org RBAC policy editor.

---

## 6. Audit Logging

Every action — user, service account, system process — is recorded in a tamper-evident, append-only audit log. Foundational to compliance, incident response, and customer trust. Cannot be deleted by anyone (including Platform Admins) without a documented multi-party approval process.

### 6.1 What Gets Logged

| Event Category | Examples | Retention |
|---|---|---|
| Authentication | Login, logout, failed login, MFA challenge, token refresh, session revocation | 2 years |
| Access Control | Role assignment/removal, permission change, team membership change, policy update | 5 years |
| Data Access | Report viewed, query run, export triggered, data searched | 1 year |
| Data Mutation | Report created/updated/deleted, settings changed, user invited/removed | 5 years |
| Privileged Actions | Admin impersonation, breakglass access, bulk delete, purge, API key creation | 7 years |
| Billing Events | Subscription change, payment, invoice generated, credit deduction | 7 years |
| Security Events | WAF block, rate limit hit, GuardDuty finding, suspicious login, IP blocklist | 3 years |
| System Events | Deployment, config change, service restart, infrastructure modification | 3 years |

### 6.2 Audit Log Record Schema

```json
{
  "log_id":        "UUID v4 — primary key, globally unique",
  "timestamp":     "ISO 8601 UTC — immutable, set at write time",
  "org_id":        "UUID — tenant, partition key for DynamoDB",
  "actor_id":      "UUID — user, service account, or 'system'",
  "actor_type":    "enum [human_user | api_key | service | platform_admin]",
  "actor_ip":      "IPv4/IPv6 — hashed for GDPR if EU tenant",
  "actor_role":    "Roles held at time of action (snapshot)",
  "session_id":    "UUID — links to session record",
  "action":        "string — e.g. 'market_reports:create'",
  "resource_type": "string — e.g. 'market_reports'",
  "resource_id":   "UUID — the affected resource",
  "result":        "enum [success | denied | error]",
  "metadata":      "JSON — request path, params, PII stripped",
  "checksum":      "SHA-256 of all fields above (tamper detection)",
  "prev_checksum": "SHA-256 of previous log entry (chain integrity)"
}
```

### 6.3 Tamper-Evidence & Integrity

- Each log entry includes a SHA-256 checksum of its own fields plus the checksum of the previous entry — a hash chain like a blockchain.
- Chain validated by a scheduled Lambda (every 6 hours) that recomputes checksums and alerts via SNS on any discrepancy.
- Log entries written to DynamoDB (hot, queryable) AND streamed to S3 in Parquet (cold archive, immutable).
- S3 audit archive buckets: **Object Lock** (WORM, Compliance mode), versioning enabled, **MFA delete required**.
- **No IAM policy — including `super_admin` — can delete from S3 audit archive.** Deletion requires AWS Support involvement and is logged at the AWS account level.

### 6.4 Audit Log Access Controls

| Role | Own Org Logs | All Org Logs | Platform Logs | Can Delete? |
|---|---|---|---|---|
| `super_admin` | ✅ | ✅ | ✅ | **❌ Never** |
| `platform_auditor` | ✅ | ✅ | ✅ | **❌ Never** |
| `org_owner` | ✅ | 🔶 own only | ❌ | **❌ Never** |
| `team_manager` | 🔶 own team | ❌ | ❌ | **❌ Never** |
| `auditor` (org) | ✅ | 🔶 own only | ❌ | **❌ Never** |
| `analyst` / `viewer` | 🔶 own actions only | ❌ | ❌ | **❌ Never** |

---

## 7. Architecture-Level Isolation

Isolation enforced at every layer, not just in app code. Even if app-level access control is bypassed (e.g. via a bug), underlying infrastructure controls prevent cross-tenant data access.

### 7.1 Network Isolation

- **Single VPC per environment** (dev, staging, prod) with strict subnet segmentation.
- **Public Subnet** — only ALB and NAT Gateways.
- **Private App Subnet** — all ECS Fargate tasks, Lambda functions. No public IPs.
- **Private Data Subnet** — RDS, DynamoDB VPC endpoints, ElastiCache. Reachable only via VPC Endpoints + Security Group rules.
- **Service-to-service** within VPC uses private DNS and TLS mutual authentication (mTLS via AWS Private CA).
- **Security Groups** follow zero-trust: default deny all; explicit allow rules per service pair only.

### 7.2 Compute Isolation

- ECS Fargate runs without underlying EC2 access — no SSH, no shared kernel exposure between tenants.
- Each microservice has a dedicated **IAM Task Role** with least-privilege permissions.
- Lambda functions run in isolated execution environments per invocation; no persistent shared state between executions.
- Container images are signed and verified with **AWS Signer** before deployment; unsigned images are rejected by ECS.

### 7.3 Data Isolation

| Data Store | Isolation Mechanism | Additional Controls |
|---|---|---|
| RDS PostgreSQL | RLS — `org_id` column on all tables; queries without valid org context blocked at DB level | AES-256 at rest, TLS 1.3 in transit, separate KMS key per env |
| DynamoDB | Partition key includes `org_id`; IAM `dynamodb:LeadingKeys` blocks cross-tenant access at API level | Point-in-time recovery, server-side encryption with customer-managed KMS keys |
| S3 | Bucket policy + IAM `s3:prefix` condition enforces tenant key prefix; cross-prefix access denied | Object Lock for audit, versioning, replication to secondary region |
| ElastiCache (Redis) | Tenant-namespaced key prefixes in app layer; Redis AUTH + TLS; no direct client access | In-transit + at-rest encryption (AWS-managed keys) |
| Secrets Manager | Separate secret per service; IAM role-based access; no cross-service secret sharing | Automatic rotation, audit log via CloudTrail |

### 7.4 Encryption Key Management

- **AWS KMS** for all encryption. Customer-managed KMS keys (CMKs) for all sensitive data stores.
- **Key hierarchy:** Master Key (KMS CMK) → Data Encryption Keys (DEKs, envelope encryption) → encrypted data.
- **Separate KMS keys** per environment (dev, staging, prod) AND per data classification (standard, sensitive, critical).
- **Key rotation** — automatic annual rotation enabled on all CMKs; manual rotation capability for incident response.
- **Key access logged** to CloudTrail. Access from unexpected principal triggers GuardDuty finding + SNS alert.

---

## 8. AWS Infrastructure

Two-region active-passive: primary `us-east-1` handles live traffic, secondary `us-west-2` is warm standby with replicated data. All infrastructure is IaC — no manually provisioned resources allowed in staging or production.

### 8.1 AWS Services Inventory

| Service | Usage | Config Notes |
|---|---|---|
| Route 53 | DNS, health checks, failover routing | Latency-based routing; failover to secondary on health check failure |
| CloudFront | CDN, TLS termination, edge caching | WAF attached; HTTPS-only; geo-restriction configurable per org |
| AWS WAF v2 | Web application firewall | OWASP Core Rule Set; custom rules for rate limiting, bot detection, SQLi/XSS |
| ACM | TLS certificate management | Wildcard cert for `*.marketlens.io`; auto-renewal; DNS validation |
| ALB | Load balancing, ECS routing | Target group per service; sticky sessions disabled; access logs to S3 |
| API Gateway | REST + WebSocket APIs | Custom Lambda authoriser; per-client throttling; usage plans per org tier |
| Cognito | User identity, auth, MFA | User Pools (humans) + Identity Pools (federated/API); SAML/OIDC SSO support |
| ECS Fargate | Container orchestration | No EC2 management; auto-scaling per service; task definitions versioned in ECR |
| ECR | Container image registry | Image scanning on push; lifecycle policies; immutable image tags in prod |
| Lambda | Serverless compute (AI, async tasks) | Durable Functions for AI orchestration; max 15min timeout; X-Ray tracing; DLQ on SQS |
| RDS PostgreSQL | Primary relational database | Multi-AZ; automated backups; Performance Insights; Secrets Manager rotation |
| DynamoDB | Audit logs, sessions, cache metadata | On-demand capacity; global tables for multi-region; TTL for session records |
| ElastiCache Redis | Session cache, query result cache | Cluster mode; Multi-AZ; AUTH enabled; TLS in-transit |
| S3 | Reports, exports, audit archive, IaC state | Multiple buckets by purpose; Object Lock on audit; lifecycle policies |
| SQS | Async job queue (report generation) | FIFO queues for ordering; DLQ for failed jobs; SSE-SQS encryption |
| SNS | Alerts and notifications | Security alerts, billing thresholds, system events; email + Slack |
| Secrets Manager | Secrets, API keys, DB credentials | Automatic rotation; resource-based policies; audit via CloudTrail |
| KMS | Encryption key management | CMKs per env + data class; key policies; CloudTrail logging |
| CloudTrail | AWS API audit logging | All regions; S3 + CloudWatch Logs; integrity validation enabled |
| CloudWatch | Metrics, logs, alarms | Log groups per service; metric filters; composite alarms; service dashboards |
| AWS X-Ray | Distributed tracing | Service map; latency histograms; error rate tracking across microservices |
| GuardDuty | Threat detection | All finding types enabled; EventBridge → Lambda auto-remediation for critical |
| Security Hub | Security posture management | CIS AWS Foundations; AWS FSBP; centralised findings |
| AWS Config | Configuration compliance | Rules for: MFA on root, S3 public access, SG unrestricted, encryption at rest |
| Macie | Data classification (S3) | Auto-discovery of PII/sensitive data; alerts on policy violations |
| IAM | Identity and access for AWS resources | No root usage; SCPs via AWS Organizations; permission boundaries on all roles |
| AWS Organizations | Multi-account management | Separate accounts: `prod`, `staging`, `dev`, `security`, `logging`, `shared-services` |

---

## 9. Infrastructure as Code

All AWS infrastructure is defined, version-controlled, reviewed, and deployed as code. Manual console changes in staging and prod are prohibited and detected by AWS Config rules that trigger immediate alerts. Only exception: emergency breakglass access — time-limited, dual-approval, automatically rolled back after expiry.

### 9.1 IaC Toolchain

| Tool | Purpose | Used For |
|---|---|---|
| **Terraform** | Primary IaC tool | All AWS resource provisioning: VPC, RDS, ECS, IAM, KMS, S3 |
| **Terragrunt** | Terraform wrapper | DRY config, env promotion (dev→staging→prod), remote state management |
| **AWS CDK (TypeScript)** | Application-layer IaC | ECS task definitions, Lambda functions, API Gateway APIs |
| **AWS SAM** | Serverless application model | Lambda packaging and local testing before CDK deployment |
| **Packer** | AMI / base image build | Golden AMI for any EC2 bastion hosts (minimal usage); container base images |
| **Checkov** | IaC static analysis | Security scanning of Terraform + CDK before every PR merge |
| **Infracost** | Cost estimation | Cost estimate on every Terraform PR — prevents accidental expensive resource creation |

### 9.2 Repository Structure

```text
marketlens-infra/
├── terraform/
│   ├── modules/                # Reusable modules: vpc, rds, ecs-service, cognito, kms…
│   ├── environments/
│   │   ├── dev/                # Terragrunt config for dev
│   │   ├── staging/            # Terragrunt config for staging
│   │   └── prod/               # Terragrunt config for prod (PR + 2 approvals)
│   └── global/                 # Account-level: IAM, SCPs, CloudTrail, Macie
├── cdk/
│   ├── stacks/                 # CDK stacks: ApiGateway, EcsCluster…
│   └── constructs/             # Reusable L3 constructs
├── scripts/
│   ├── bootstrap.sh            # One-time account bootstrap (state bucket, lock table)
│   └── breakglass.sh           # Emergency access (MFA + approval token)
├── policies/
│   ├── iam/                    # All IAM policies as JSON — managed by Terraform
│   ├── scp/                    # Service Control Policies
│   └── kms/                    # KMS key policies per resource type
└── .github/workflows/          # CI/CD pipelines for IaC
```

### 9.3 IaC Deployment Pipeline

| Stage | Trigger | Actions | Gate |
|---|---|---|---|
| PR Validation | PR opened | `terraform fmt`, `validate`; Checkov scan; Infracost; tflint | All checks pass |
| Plan | PR merged to main | `terraform plan` in target env; plan stored as artifact; SNS notification | Manual review of plan |
| Apply — Dev | Auto after plan | `terraform apply` to dev; smoke tests | Automated tests pass |
| Apply — Staging | Manual trigger by DevOps | `terraform apply` to staging; integration tests; security scan | QA sign-off required |
| Apply — Prod | Manual + dual approval | `terraform apply` to prod; canary 10% traffic; monitor 15 min; promote/rollback | 2 engineer approvals + no active incidents |
| Drift Detection | Scheduled (every 6h) | `terraform plan` in all envs; SNS alert on drift | Auto-alert on drift |

### 9.4 Terraform State Management

- Remote state in S3 with server-side encryption (KMS CMK) and versioning enabled.
- State locking via DynamoDB table — prevents concurrent applies.
- State files separated per environment AND per module to limit blast radius of state corruption.
- State access restricted to CI/CD pipeline IAM role and a restricted ops IAM role (MFA required).
- **Sensitive values** (passwords, keys) never stored in Terraform state — Secrets Manager is the source of truth.

---

## 10. Security Hardening & Compliance

### 10.1 AWS Account Hardening

| Control | Implementation | Status |
|---|---|---|
| Root account lockdown | Root keys deleted; MFA on root; no routine root usage; root creds in sealed vault | **REQUIRED DAY 1** |
| Multi-account strategy | Separate accounts: prod, staging, dev, security, logging, shared-services via AWS Organizations | **REQUIRED DAY 1** |
| Service Control Policies | SCPs block: disabling CloudTrail, removing GuardDuty, public S3 buckets, disabling encryption | **REQUIRED DAY 1** |
| CloudTrail — all regions | Multi-region trail; log file integrity validation; CloudWatch Logs integration; 7-year retention | **REQUIRED DAY 1** |
| GuardDuty | All regions; 15-min findings export; EventBridge auto-remediation for critical types | **REQUIRED DAY 1** |
| Security Hub | CIS L1 + L2; AWS FSBP benchmark; auto-remediation for select findings | Sprint 1 |
| VPC Flow Logs | All VPCs, all ENIs; S3 + Athena queryable; 1-year retention | Sprint 1 |
| S3 Block Public Access | Account-level block; SCP prevents any public bucket; Macie scans for public exposure | **REQUIRED DAY 1** |
| IMDSv2 enforcement | All EC2/ECS require IMDSv2; hop limit = 1 | Sprint 1 |
| Encryption everywhere | All EBS, RDS, S3, DynamoDB, ElastiCache, SQS encrypted; SCP blocks unencrypted | **REQUIRED DAY 1** |

### 10.2 Compliance Targets

| Framework | Target | Notes |
|---|---|---|
| SOC 2 Type II | Year 1 goal | Trust Service Criteria: Security, Availability, Confidentiality. Vanta for automated evidence collection. |
| GDPR | Launch requirement (EU users) | Data residency controls; right-to-erasure flow; DPA with AWS; privacy-by-design |
| CCPA | Launch requirement (CA users) | Data inventory; opt-out flow; vendor DPA; 12-month retention limit for free tier |
| ISO 27001 | Year 2 goal | ISMS documentation; risk register; asset inventory; incident management |

---

## 11. API Gateway & Service Mesh

### 11.1 API Gateway Design

- All external traffic enters via AWS API Gateway. No microservice is directly internet-accessible.
- **Custom Lambda Authoriser** validates every request: JWT signature, expiry, issuer, audience, token revocation list. Returns IAM policy allowing/denying the specific API method+resource.
- **Throttling** — per-client (by `org_id` from JWT) usage plans prevent one tenant from starving others.
- **API versioning** — `/v1/`, `/v2/` path prefix; old versions deprecated with 90-day notice and `Sunset` headers.
- **Developer API Keys** — separate from user JWTs; scoped to specific endpoints and rate limits; rotatable without user session impact.

### 11.2 Internal Service Communication

| Pattern | Protocol | Auth | Used For |
|---|---|---|---|
| Synchronous request | gRPC over TLS (mTLS) | Service-to-service mTLS with AWS Private CA certs | Permission Engine lookups, user profile fetches, real-time data |
| Async messaging | SQS FIFO | IAM Task Role + queue policy | Report generation jobs, email notifications, audit log writes |
| Event streaming | EventBridge | Resource-based policies, IAM | System events: user created, report completed, billing event, security finding |
| Workflow orchestration | Lambda Durable Functions | IAM execution role | Multi-step AI analysis pipeline: search → analyse → score → format → store |

---

## 12. Data Architecture

### 12.1 PostgreSQL Schema — Core Tables

> Full ERD and field-level definitions: see [04 — Data Model](./04-data-model.md).

```sql
-- Row-Level Security enabled on ALL tables
-- Every table has org_id column with NOT NULL constraint
-- RLS policy: USING (org_id = current_setting('app.current_org_id')::uuid)

organisations    (org_id PK, name, tier, settings_json, created_at, is_active)
users            (user_id PK, org_id FK, email, cognito_sub, status, created_at)
roles            (role_id PK, org_id FK, role_name, is_system_role, permissions_json)
user_roles       (user_id FK, role_id FK, team_id FK, granted_by FK, granted_at)
teams            (team_id PK, org_id FK, name, settings_json, created_at)
team_members     (team_id FK, user_id FK, joined_at)
market_reports   (report_id PK, org_id FK, team_id FK, created_by FK, idea_text,
                  result_json, status, created_at, updated_at)
query_history    (query_id PK, org_id FK, user_id FK, query_text, tokens_used, created_at)
api_keys         (key_id PK, org_id FK, user_id FK, key_hash, scopes_json, expires_at,
                  last_used_at, is_revoked)
sessions         (session_id PK, user_id FK, org_id FK, created_at, last_active,
                  ip_hash, user_agent_hash, is_revoked)
```

### 12.2 Data Classification & Handling

| Classification | Examples | Encryption | Retention | PII Treatment |
|---|---|---|---|---|
| Public | Generated market reports (shared) | In transit only | Indefinite | No PII expected |
| Internal | Query history, usage metrics | At rest + in transit | 1 year | Anonymise after 90 days |
| Sensitive | User profiles, role config, team data | At rest + in transit (CMK) | Life of account + 1 year | GDPR deletion on request |
| Highly Sensitive | Billing data, audit logs, API keys | At rest + in transit (dedicated CMK) | 7 years (billing/audit) | Pseudonymise where possible |
| Critical | Platform config, KMS keys, root credentials | HSM-backed KMS + Secrets Manager | Indefinite | No PII; strictly need-to-know |

---

## 13. CI/CD Pipeline

All app code and infrastructure changes flow through automated CI/CD pipelines. No direct deployments to staging or prod permitted — all changes go through code review, automated tests, and pipeline promotion.

| Pipeline Stage | Tools | Checks & Gates |
|---|---|---|
| Source Control | GitHub (private org) | Branch protection: require PR, 2 approvals, signed commits (GPG), no force-push on main |
| Build | GitHub Actions + CodeBuild | Unit tests, integration tests, code coverage (>80%), linting, SAST (Semgrep), dependency audit (`npm audit`/`pip-audit`) |
| Container Security | ECR image scan (Trivy) | Critical CVEs block deployment; high CVEs require ticket within 48h; images signed with AWS Signer |
| IaC Security | Checkov + tfsec | Security misconfig scan of Terraform + CDK; hard fail on CRITICAL findings |
| Deploy — Dev | GitHub Actions → ECS + Lambda | Automatic on merge to main; post-deploy smoke tests; rollback on test failure |
| Deploy — Staging | Manual trigger + approval | Full test suite; load test (k6); DAST (OWASP ZAP); security regression tests |
| Deploy — Prod | Manual + dual approval | Blue/green via ALB weighted target groups; canary 10% for 15 min; auto-rollback on error rate >1% |
| Post-Deploy | CloudWatch + PagerDuty | SLO dashboard check; error budget tracking; alert on p99 >2s or error rate >0.1% |

---

## 14. Monitoring & Observability

### 14.1 Three Pillars

| Pillar | Tool | What We Track |
|---|---|---|
| Metrics | CloudWatch + Grafana | Request rates, error rates, latency (p50/p95/p99), CPU/memory per service, DB connections, cache hit rate, SQS depth, AI tokens per org |
| Logs | CloudWatch Logs + OpenSearch | Structured JSON logs per service; request/response (PII stripped); errors with stack traces; correlation ID across services |
| Traces | AWS X-Ray + OpenTelemetry | End-to-end request tracing; service dependency map; slow query identification; AI pipeline step timing |

### 14.2 Security Alerting

| Alert | Severity | Response |
|---|---|---|
| GuardDuty HIGH/CRITICAL finding | **P1** | PagerDuty page on-call; auto-quarantine via Lambda; incident ticket auto-created |
| Audit log chain integrity failure | **P1** | Immediate page; lock audit writes; engage security team |
| 5+ failed logins for one user (5 min) | **P2** | Temporary account lock; notify user + `org_owner`; log to security events |
| Cross-tenant data access attempt detected | **P1** | Immediate page; block request; flag session; security team review within 1 hour |
| IaC drift detected (manual console change) | **P2** | Notify DevOps; create ticket; revert if unauthorised |
| API key used from new IP (anomaly) | **P3** | Notify key owner; log to audit; require re-auth if sensitivity threshold exceeded |
| Unusual data export volume | **P2** | Rate limit trigger; notify `org_owner`; log full export manifest to audit |
| KMS key access from unexpected principal | **P1** | Immediate page; revoke access; investigate CloudTrail |

---

## 15. Disaster Recovery

### 15.1 Recovery Objectives

| Tier | Services | RTO | RPO |
|---|---|---|---|
| Tier 1 — Critical | Auth, API Gateway, core query engine | < 15 minutes | < 1 minute |
| Tier 2 — High | Report generation, billing, team management | < 1 hour | < 5 minutes |
| Tier 3 — Standard | Audit log query UI, exports, analytics | < 4 hours | < 30 minutes |

### 15.2 Backup & Replication

- **RDS** — automated daily snapshots (35-day retention); transaction log backups every 5 min; cross-region snapshot copy to `us-west-2`.
- **DynamoDB** — point-in-time recovery (PITR) enabled; global tables replicate in real-time to secondary region.
- **S3** — cross-region replication for all production buckets; versioning for point-in-time restore.
- **Secrets Manager** — replicated to secondary region; accessible during primary outage.
- **IaC state (Terraform)** — S3 bucket with versioning + cross-region replication; full infra rebuild possible from state.

### 15.3 Runbook Requirements

Runbooks for all Tier 1 and Tier 2 failure scenarios must be documented, stored in the internal wiki, and rehearsed quarterly via GameDay exercises. Each runbook includes:

- Failure detection criteria
- Immediate containment steps
- Data integrity verification
- Restoration steps
- Customer communication template
- Post-incident review checklist

> **Non-negotiable DR requirements:**
>
> - GameDay exercises run quarterly; last GameDay date tracked in security posture dashboard.
> - Runbooks reviewed and updated after every production incident and every major infrastructure change.
> - Secondary region readiness tested monthly via automated smoke tests against the warm standby.
> - Full DR drill (simulated primary region failure) run at least once before GA launch.
> - RTO/RPO targets reviewed against actual measured performance — SLA commitments must not exceed demonstrated capability.

---

## Owners

| Area | Owner |
|---|---|
| Auth & Identity (§3) | Security Lead |
| RBAC & Permissions (§4–5) | Security Lead |
| Audit Logging (§6) | Security Lead |
| AWS Infrastructure (§8–9) | DevOps Lead |
| Data Architecture (§12) | Backend Lead |
| CI/CD (§13) | DevOps Lead |
| Monitoring (§14) | SRE Lead |
| Disaster Recovery (§15) | SRE Lead |

---

← Back to [README](../README.md) · Next: [02 — Microservices Design](./02-microservices-design.md)
