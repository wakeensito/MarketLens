# MarketLens — AI-Powered Market Intelligence Platform

> Type a business idea, get the full competitive landscape, saturation analysis, and entry roadmap in minutes.

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) (frontend)
- [Python 3.13+](https://www.python.org/) (Lambdas)
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Terraform](https://developer.hashicorp.com/terraform/install) (IAM / infra)
- [Docker](https://www.docker.com/products/docker-desktop/) (for `sam local`)

### Frontend (local dev)

```bash
cd frontend
bun install
bun run dev
```

### Backend (local Lambda testing)

```bash
sam build
sam local invoke ApiFunction --event events/test-api.json
sam local start-api   # starts local API Gateway at http://localhost:3000
```

### Deploy to AWS

```bash
# First time (guided) — two-step deploy required for auth
sam build
sam deploy --guided
# After first deploy: copy CloudFrontDomainName from stack outputs,
# set CognitoCallbackDomain parameter to that value, then redeploy:
sam build && sam deploy
```

The first deploy creates the Cognito User Pool but cannot configure callback URLs because the CloudFront domain doesn't exist yet. After the first deploy, grab the `CloudFrontDomainName` from the stack outputs, set it as the `CognitoCallbackDomain` parameter, and redeploy. Subsequent deploys are single-step.

```bash
# Subsequent deploys
sam build && sam deploy
```

---

## Project Structure

```text
├── template.yaml                  # SAM template (S3, CloudFront, API GW, Cognito, DynamoDB, Lambdas)
├── samconfig.toml                 # SAM deploy config (auto-generated)
├── infrastructure/
│   └── lambda/
│       ├── api/                   # REST API Lambda (reports CRUD, org-scoped)
│       ├── ai-orchestration/      # AI pipeline (Durable Function)
│       ├── export/                # PDF/CSV export Lambda
│       ├── bff/                   # BFF Auth Lambda (login, callback, refresh, logout, me)
│       └── authorizer/            # Lambda Authorizer (JWT validation, auth context injection)
├── infra/
│   └── iam/                       # Terraform (CD role, OIDC provider)
├── frontend/                      # React + Vite + TypeScript
├── .github/
│   └── workflows/
│       ├── ci.yml                 # PR checks: lint, type check, Trivy, Checkov
│       └── deploy.yml             # CD: build frontend → S3 → CloudFront invalidation
└── docs/                          # Architecture documentation
```

---

## Architecture

### AWS Services (deployed)

| Service | Purpose |
|---|---|
| S3 | Frontend hosting + report exports |
| CloudFront | CDN with security headers, SPA routing, cookie forwarding for auth |
| API Gateway | REST API with access logging + Lambda Authorizer (default) |
| Cognito | User pool with Google SSO + GitHub SSO (OIDC), mandatory TOTP MFA |
| Lambda (x5) | API, AI Orchestration, Export, BFF Auth, Authorizer |
| DynamoDB | Reports (org-scoped), user records, org records (pay-per-request, PITR) |
| IAM (OIDC) | GitHub Actions CD role |

### IaC Split

| Tool | Scope | Config |
|---|---|---|
| SAM | Serverless (Lambdas, API GW, S3, CloudFront, DynamoDB) | `template.yaml` |
| Terraform | IAM roles, VPC, RDS, ECS (future) | `infra/` |

### Lambda Functions

| Function | Purpose | Runtime |
|---|---|---|
| `marketlens-api` | REST endpoints for reports CRUD (org-scoped) | Python 3.13 |
| `marketlens-ai-orchestration` | AI analysis pipeline (Durable Function) | Python 3.13 |
| `marketlens-export` | CSV/PDF report generation | Python 3.13 |
| `marketlens-bff-auth` | BFF auth endpoints (login, callback, refresh, logout, me) | Python 3.13 |
| `marketlens-authorizer` | Lambda Authorizer — JWT validation, auth context injection | Python 3.13 |

### AI Pipeline (Lambda Durable Functions)

The AI orchestration uses Lambda Durable Functions instead of Step Functions. The entire pipeline runs as a single Lambda with automatic checkpointing per stage:

```text
sanitize → parse → search → analyse → score → summarise → assemble
```

Each stage is a `context.step()` call — if the function is interrupted, it resumes from the last completed step.

### Authentication (BFF Pattern)

Auth uses the Backend-for-Frontend (BFF) pattern — more secure than client-side token handling because tokens never touch JavaScript.

```text
Browser → CloudFront → BFF Lambda (/auth/*) → Cognito
                     → Lambda Authorizer (validates cookies on /api/*)
```

**Flow:** User clicks "Sign in with Google/GitHub" → redirected to Cognito hosted UI → callback hits BFF Lambda → BFF exchanges auth code for tokens → tokens set as HttpOnly/Secure/SameSite=Strict cookies (`ml_access`, `ml_refresh`, `ml_logged_in`) → all subsequent API requests carry cookies automatically.

**Lambda Authorizer** (REQUEST type, 300s cache): reads `ml_access` cookie, validates JWT against Cognito JWKS, looks up user record in DynamoDB, injects `user_id`, `org_id`, `plan`, `email` into request context. Supports mixed mode — anonymous requests get Allow with anonymous context.

**Rate limiting:** Anonymous users get 1 free report. Signed-in free tier users get 3 reports/day (daily counter with date-based reset on user record).

**CloudFront cookie forwarding:** Custom cache policy (zero TTL) and origin request policy forward `ml_access`, `ml_refresh`, `ml_logged_in` cookies on `/api/*` and `/auth/*` paths.

**DynamoDB key schema (org-scoped):**
- Reports: `PK: ORG#{org_id}#REPORT#{report_id}`, `SK: REPORT#{report_id}`, `GSI1PK: ORG#{org_id}#REPORTS`
- Users: `PK/SK: USER#{sub}`
- Orgs: `PK/SK: ORG#{org_id}`

---

## CI/CD

### CI (on PR)

- Lint + type check (Bun/ESLint/TypeScript)
- Trivy security scan
- Terraform validate + Checkov IaC scan
- Codecov coverage reporting

### CD (on merge to main)

- Build frontend → sync to S3 → invalidate CloudFront
- Uses GitHub OIDC to assume `marketlens-cd-role` (no static credentials)

### GitHub Repo Variables Required

| Variable | Description |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | Set to your IAM CD role ARN |
| `S3_BUCKET_NAME` | Set to your frontend S3 bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | Set to your deployed CloudFront distribution ID (see `sam deploy` output) |

### GitHub Repo Secrets Required

| Secret | Description |
|---|---|
| `CODECOV_TOKEN` | From [codecov.io](https://codecov.io) |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID (from Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App client ID (from GitHub Developer Settings) |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App client secret |

---

## Documentation Index

| # | Document | What's in it |
|---|---|---|
| 01 | [Technical Specification](./docs/01-technical-spec.md) | Architecture, access control, RBAC, audit logging, AWS infrastructure, IaC, security, CI/CD, DR |
| 02 | [Microservices Design](./docs/02-microservices-design.md) | Every service: responsibilities, APIs, boundaries, scaling, ownership |
| 03 | [AI Pipeline Architecture](./docs/03-ai-pipeline.md) | Durable Function pipeline, prompt design, web search, saturation scoring, cost tracking |
| 04 | [Data Model](./docs/04-data-model.md) | Full ERD, every table, every index, RLS policies, retention rules, GDPR deletion |
| 05 | [Milestones & Sprints](./docs/05-milestones-and-sprints.md) | Phase plan, sprint breakdown, delivery timeline |

---

## Live URLs

| Environment | URL |
|---|---|
| Frontend | Set after `sam deploy` — see CloudFrontDomainName output |
| API | Set after `sam deploy` — see ApiUrl output |

---

## Status

- **Version:** 1.1
- **Last updated:** May 2026
- **Region:** us-east-1
- **Account:** (configured per environment)
- **Auth:** Cognito + Google/GitHub SSO (BFF pattern)
