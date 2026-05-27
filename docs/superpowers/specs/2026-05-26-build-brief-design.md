# Build Brief — Design (Phase 1, Pro)

**Status:** Design — pending review
**Date:** 2026-05-26
**Scope:** Phase 1 only (Pro tier, vendor-neutral Build Brief). Max tier (cloud-specific reference architecture + PDF) is documented here as post-scope, not built.

---

## North Star

The Pro Build Brief should be **addictive to people with ideas**. It takes a founder who just got a market read and makes their idea feel *buildable* — in plain English, easy to read, easy to understand — and leaves them wanting to dig deeper. If we sell them on the experience of seeing their idea take shape, we inspire them to keep going (and, later, to reach for Max).

It is not an engineering document. It is an accessible, momentum-building extension of the intelligence brief, written for a non-technical founder. The technical depth lives in Max.

**Success criterion:** a non-technical founder reads the brief and thinks "I could actually start this" — and clicks for more.

---

## Why this fits plinths

plinths is the intelligence a founder needs *before* they commit to a build. The Build Brief is the natural next beat: once the market read says "pursue it," the founder's next question is "what would it take to build?" The brief answers that at **founder altitude** — capabilities, build-vs-buy, a vendor-neutral foundation, rough effort, and the honest risks.

**Plan axis = power, not audience** (per CLAUDE.md). This feature respects that:

- **Pro** teaches the *shape and vocabulary* of a build (vendor-neutral primitives, plain English).
- **Max** does the *cloud-specific craft* (opinionated single-cloud reference architecture, PDF).

Pro makes you literate; Max makes you equipped. That is a depth/power ladder, not a persona split — a builder-founder on Pro is not walled out of anything they need at the validation stage.

---

## In scope (Phase 1)

A **Build Brief**: an on-demand, plan-gated, structured deliverable generated from an existing completed report. Surfaced as an inline expandable section in the report view.

### Brief content

1. **Build-complexity** — a score + label + the drivers that make it hard. (Implementation note: `estimated_complexity` is extracted at Parse but **not persisted** into `result_json` today; the brief either re-derives complexity from `result_json` + `idea_text`, or we persist `estimated_complexity` at Summarise. Decision deferred to the implementation plan — re-derivation is the lower-touch default.)
2. **Capabilities + build/buy** — the functional building blocks the product needs, each tagged build or buy with a recommendation (e.g., auth → buy: Auth0/Cognito; payments → buy: Stripe; core search → build).
3. **Foundational architecture (vendor-neutral)** — the handful of primitives this idea needs, named generically with an example cross-cloud mapping, framed as *"this is the foundation every cloud gives you; pick the one you're comfortable with."* Example primitive: *Object storage (≈ S3 on AWS · Blob Storage on Azure · Cloud Storage on GCP)*. Generic primitives have no catastrophic wrong answer, so this stays safe by construction.
4. **MVP scope** — plain-English "to stand up a localhost MVP you need…".
5. **Effort estimate** — rough timeframe and team shape (directional).
6. **Technical risks** — the things that commonly sink this kind of build.
7. **`FOUNDATIONS & LIMITS`** — a small, always-present block (see Trust & Framing).

### Non-software / low-tech ideas

plinths briefs *any* business idea, but a Build Brief presupposes a digital build. The brief must **detect low-tech ideas and degrade gracefully** rather than invent a stack. For a "bakery in Miami," it states the idea is **not technology-dominant** and that the most it needs is **a website + payments** — noting that even that is a scalable starting point. It never fabricates serverless/ML/infrastructure for a business that doesn't need it. (Inventing infrastructure for a bakery is precisely the "confidently wrong" failure this feature is designed to avoid.)

### Trust & framing (`FOUNDATIONS & LIMITS`)

A small block present on every brief. Two parts:

- **Principles it espouses** (these double as teaching, making the founder smarter, not just served): least privilege, managed services over self-hosted, one cloud to start (not multi-cloud), secure defaults.
- **The limit, stated plainly:** *AI isn't always right. This is a starting point, not a vetted secure design — get professional review before you build on it, especially on security.*

This is "calm authority" applied to the product's own limits. The Pro brief mostly avoids the trust risk by staying at capability/foundation altitude (robust, well-known answers); the block makes the boundary explicit anyway.

---

## User experience

1. User opens a **completed** report. A `BUILD BRIEF` section sits collapsed at the bottom.
2. **Free** → locked affordance: a clean lock + one-line value + upgrade CTA. No blurred teaser (PRODUCT.md kills decorative teasing chrome).
3. **Pro / Max / admin** → "Generate" → ~5–15s skeleton (no lingering spinner) → the structured brief renders and is stored.
4. Re-open → instant from storage. **Regenerate** allowed, under a soft daily cap.
5. **Copy as markdown** available on the rendered brief (mirrors Muse's "cite as markdown"). PDF export is Max-only.

Generation is **synchronous, not streamed** — per PRODUCT.md the output is a deliverable, not a chat bubble.

---

## Architecture

### Backend

- **Routes** on the existing API Lambda (API GW + standard authorizer):
  - `POST /api/reports/{report_id}/build-brief` — generate (if absent or regenerating) + store + return.
  - `GET  /api/reports/{report_id}/build-brief` — fetch stored brief.
- **Plan gate:** reuse the existing fresh-plan read (`USER#{user_id}` row, not the ~5-min-cached authorizer plan). `free` → 403 + paywall payload; `pro`/`max`/`admin` → allowed.
- **Regen soft cap:** reuse the existing atomic conditional-`UpdateItem` daily-counter pattern (as in `_atomic_check_and_increment`) on the `USER#` row, scoped to a build-brief counter key. Prevents runaway DeepSeek spend without nagging.
- **Generation:** a single LLM pass grounded in the report's `result_json` + `idea_text`, via **DeepSeek V3.2** (the existing Analyse reasoner) through the provider-aware `call_llm()` shape. New SAM parameter `BedrockModelIdBuildBrief` (default = the DeepSeek ID), with `bedrock:InvokeModel` IAM scoped to that exact model ARN only. (If DeepSeek cannot be invoked on-demand by its bare foundation-model ID — as Nova 2 Lite could not, requiring a `us.*` cross-region inference profile plus the underlying FM ARNs across all routed regions in the IAM policy — apply the same treatment. Confirm before wiring the IAM scope.)
- **Ownership:** org-scoped, same checks as `GET /reports/{id}`. Reject briefs for reports the caller does not own (404).

### Data model

Store on the existing report item (1:1 with the report):

- `build_brief_json` — the structured brief (schema below).
- `build_brief_generated_at` — ISO8601.

No new table. Stays inside the report's existing org-scoped key space.

### Brief schema (`build_brief_json`)

```
{
  "is_tech_dominant": "true" | "false",     // false → low-tech graceful path
  "complexity_score": "string-number",       // mirrors result_json string-number convention
  "complexity_label": "string",
  "complexity_drivers": ["string"],
  "capabilities": [
    { "name": "", "description": "", "build_or_buy": "build" | "buy", "recommendation": "" }
  ],
  "foundation": [
    { "primitive": "", "why": "", "cloud_examples": "S3 / Blob / Cloud Storage" }
  ],
  "mvp_scope": "string",
  "effort_estimate": { "timeframe": "", "team_shape": "" },
  "technical_risks": [ { "title": "", "description": "" } ]
}
```

Mirrors `result_json` conventions (object arrays, string-number scores) so the frontend adapter pattern carries over. For a low-tech idea, `is_tech_dominant` is `"false"`, `foundation` collapses to website + payments, and `complexity` is low.

### Frontend

- `BUILD BRIEF` section in `ReportView` (collapsed default). Free → locked CTA; Pro+ → generate → skeleton → render.
- New `useBuildBrief(reportId)` hook; `BuildBrief` component(s); `BuildBrief*` types; `generateBuildBrief` / `getBuildBrief` in `api.ts`; an adapter mapping `build_brief_json` → a frontend type.
- **Type rules honored:** serif for conclusions, mono for the score/labels and the `FOUNDATIONS & LIMITS` header, sans for body. Build-vs-buy as a restrained two-state pill. **No vendor logos or colors.** Complexity reuses the existing saturation-score color thresholds.
- `ReportView` stays pure; the generate/gate/routing logic lives in the integration layer (same discipline as the Muse citation routing in `App.tsx`).

---

## Edge cases

- Report not complete yet → 409 (can't brief an incomplete analysis).
- Report not owned by caller → 404.
- Generation failure → error state + retry (the report-timeout retry pattern).
- Free user hits the endpoint directly → 403 + paywall payload (defense in depth; UI already locks it).
- Regenerate past the soft cap → 429-style message, surfaced calmly.
- Low-tech idea → graceful "not tech-dominant" brief, never a fabricated stack.

---

## Decisions log

- **Original idea (multi-cloud AI architecture diagrams) was redirected.** It conflicted with positioning (after-build vs. before-build), the design system (one accent per theme vs. vendor-color soup), the "beginner-friendly" goal (multi-cloud is advanced), and trust (authoritative-but-wrong infra a beginner deploys). The Build Brief keeps the *intent* (help them build) at founder altitude.
- **Modes → depth, not persona.** "Venture vs. builder" personas would gate by audience, violating the plan rule. Instead: one default report for all; the brief is opt-in depth on Pro+.
- **No up-front mode choice.** The user never self-classifies; the persona difference becomes depth they opt into.
- **Vendor-neutral on Pro.** Generic primitives + example mappings; the founder picks the cloud. Cloud-specific craft is Max.
- **DeepSeek V3.2** generates the brief (reasoning quality for build-vs-buy / risks).
- **Synchronous generation**, stored once, regenerate under a soft cap.
- **Copy-as-markdown on Pro; PDF is Max.**
- **Thumbs feedback deferred** (cheap to add later via the Muse feedback pattern).
- **Name: "Build Brief."**
- **No Bedrock Agent.** This is structured generation, not orchestration; the existing `invoke_model` path is the right tool.

---

## Deferred — Phase 2 (Max), documented not built

- **Cloud-specific reference architecture.** One opinionated cloud (not a three-cloud menu), foundational-first (object storage + CDN, a managed database, serverless compute, light data engineering) framed as *"the strong base you extend with a senior architect."* Carries the `FOUNDATIONS & LIMITS` ethos at full size, with the reasoning shown and known-unknowns named (real cost at scale, compliance, data residency). This is where the trust guardrails do real work; they are part of the artifact, not bolted on.
- **PDF export.** A new render capability (today's export Lambda emits CSV, not PDF).
- **Possible Max extras:** cross-report shared-infrastructure synthesis (the reserved `gsi1pk=ORG#…` index), per-brief model selection.

### Future seams (not Phase 1, easy once the seam exists)

- **Muse grounding in the brief.** Muse is grounded in the report; the brief is a natural extension it could answer questions about.
- **Analytics.** Route brief generations into the Muse-style analytics pipeline (DynamoDB Streams → Firehose → Parquet → Athena).

---

## Open implementation questions

1. **Persist `estimated_complexity`** into `result_json` at Summarise, or **re-derive** complexity inside the brief pass? Re-derivation is lower-touch and self-contained; persisting is marginally cheaper per brief. Default: re-derive.
2. **DeepSeek on-demand vs. inference profile** — confirm whether `deepseek.v3.2` invokes on-demand by bare ID or needs an inference profile (Nova 2 Lite did not, and required cross-region FM ARNs in IAM). Resolve before wiring the IAM scope.
