# MarketLens — Engineering Documentation

> AI-powered market intelligence platform. Type a business idea, get the full competitive landscape, saturation analysis, and entry roadmap in minutes.

This repository contains the full engineering specification for MarketLens. Documentation is the source of truth — code is built from these docs, not the other way around.

---

## Documentation Index

| # | Document | What's in it |
|---|----------|--------------|
| 01 | [Technical Specification](./docs/01-technical-spec.md) | Top-level architecture: access control, RBAC, audit logging, AWS infrastructure, IaC strategy, security, CI/CD, DR |
| 02 | [Microservices Design](./docs/02-microservices-design.md) | Every service: responsibilities, APIs, boundaries, scaling, ownership |
| 03 | [AI Pipeline Architecture](./docs/03-ai-pipeline.md) | Step Functions workflow, prompt design, web search integration, saturation scoring algorithm, cost & token tracking |
| 04 | [Data Model](./docs/04-data-model.md) | Full ERD, every table, every index, RLS policies, retention rules, GDPR deletion strategy |

---

## Reading Order

**New engineer onboarding:** Read `01` end-to-end, then skim `02` to understand the service map, then read whichever of `03` / `04` is closest to your area.

**Architecture review:** Read `01` (sections 2, 7, 8) → `02` (service boundaries) → `04` (isolation enforcement at data layer).

**Security review:** Read `01` (sections 3–7, 10) → `04` (RLS, audit logs, encryption).

**AI / ML focus:** Read `03` end-to-end, then `01` section 2.1 for context.

---

## Document Conventions

- **Status markers:** `[REQUIRED DAY 1]` `[SPRINT 1]` `[Y1 GOAL]` `[Y2 GOAL]` indicate target delivery timeline.
- **Severity markers:** `[P1]` `[P2]` `[P3]` for incidents and alerts.
- **Identifier format:** `org_id`, `user_id`, `team_id`, `report_id` — always snake_case UUIDs unless otherwise noted.
- **Permission format:** `{scope}:{resource_type}:{action}` — e.g. `team:market_reports:CRE`.
- **Code blocks:** Pseudo-code is fenced as ` ```text `; real code is fenced with the appropriate language.

---

## Editing These Docs

Documentation changes go through the same PR process as code:

1. Branch from `main`.
2. Edit markdown.
3. Open PR — must be reviewed by the relevant area owner (see the Owners table in each doc).
4. Merge after 1 approval (architecture changes require 2).

Markdown is rendered by GitHub natively. For local preview: `npx markdown-preview` or any editor with markdown support.

---

## Status

- **Document version:** 1.0
- **Last updated:** April 2026
- **Document owner:** Engineering Lead
- **Confidentiality:** Internal — do not share outside the organisation without authorisation.
