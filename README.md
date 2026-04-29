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
# First time (guided)
sam build
sam deploy --guided

# Subsequent deploys
sam build && sam deploy
```

---

## Project Structure

```text
├── template.yaml                  # SAM template (S3, CloudFront, API GW, DynamoDB, Lambdas)
├── samconfig.toml                 # SAM deploy config (auto-generated)
├── infrastructure/
│   └── lambda/
│       ├── api/                   # REST API Lambda (reports CRUD)
│       ├── ai-orchestration/      # AI pipeline (Durable Function)
│       └── export/                # PDF/CSV export Lambda
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
| CloudFront | CDN with security headers, SPA routing |
| API Gateway | REST API with access logging |
| Lambda (x3) | API, AI Orchestration, Export |
| DynamoDB | Reports storage (pay-per-request, PITR) |
| IAM (OIDC) | GitHub Actions CD role |

### IaC Split

| Tool | Scope | Config |
|---|---|---|
| SAM | Serverless (Lambdas, API GW, S3, CloudFront, DynamoDB) | `template.yaml` |
| Terraform | IAM roles, VPC, RDS, ECS (future) | `infra/` |

### Lambda Functions

| Function | Purpose | Runtime |
|---|---|---|
| `marketlens-api` | REST endpoints for reports CRUD | Python 3.13 |
| `marketlens-ai-orchestration` | AI analysis pipeline (Durable Function) | Python 3.13 |
| `marketlens-export` | CSV/PDF report generation | Python 3.13 |

### AI Pipeline (Lambda Durable Functions)

The AI orchestration uses Lambda Durable Functions instead of Step Functions. The entire pipeline runs as a single Lambda with automatic checkpointing per stage:

```text
sanitize → parse → search → analyse → score → summarise → assemble
```

Each stage is a `context.step()` call — if the function is interrupted, it resumes from the last completed step.

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

- **Version:** 1.0
- **Last updated:** April 2026
- **Region:** us-east-1
- **Account:** (configured per environment)
