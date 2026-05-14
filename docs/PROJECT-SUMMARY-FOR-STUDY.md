# Plinths — Project Summary for AWS ML Associate Study

> This document summarizes the Plinths platform architecture, AI/ML pipeline, and AWS services used. Designed to be paired with AWS ML Associate certification study material in Google NotebookLM for contextual learning.

---

## 1. What Is Plinths?

Plinths is an AI-powered market intelligence platform that turns a one-line business idea into a structured market report in under 90 seconds. It scores market saturation, entry difficulty, and opportunity using real-time web data and multi-model LLM inference — then generates a beginner-friendly analysis with competitor breakdowns, gap identification, and an entry roadmap.

**Target user:** Solo founders and first-time entrepreneurs who need fast, affordable market validation.

**Core value proposition:** Paste a business idea, get a scored market report with competitors, gaps, and a roadmap — in 90 seconds, for under $0.01 in LLM cost per report.

---

## 2. Architecture Overview

### Infrastructure Stack
- **Compute:** AWS Lambda (Python 3.13) — 9 functions total
- **AI/ML:** Amazon Bedrock (multi-model inference)
- **Orchestration:** Lambda Durable Functions (code-first, automatic checkpointing)
- **API:** API Gateway (REST) with Lambda Authorizer
- **Storage:** DynamoDB (single-table design, org-scoped)
- **CDN:** CloudFront + S3 (React frontend)
- **Auth:** Amazon Cognito (passwordless email OTP + Google SSO)
- **Secrets:** SSM Parameter Store (SecureString)
- **Billing:** Stripe (Checkout Sessions, Customer Portal, Webhooks)
- **Search:** Brave Search API + Wikipedia REST API + Wikidata SPARQL
- **Observability:** CloudWatch Logs, Metrics, X-Ray tracing (via Lambda Powertools)
- **IaC:** SAM (application layer) + Terraform (IAM/OIDC)
- **CI/CD:** GitHub Actions (lint, build, S3 deploy, CloudFront invalidation)

### Lambda Functions (9 total)

| # | Function | Purpose | ML-Relevant? |
|---|---|---|---|
| 1 | API | REST CRUD for reports, rate limiting | No |
| 2 | AI Orchestration | 7-stage durable ML pipeline | **Yes — core ML workload** |
| 3 | Export | CSV/Markdown generation | No |
| 4 | BFF Auth | OAuth2 flows, cookie management | No |
| 5 | Authorizer | JWT validation, context injection | No |
| 6 | Auth Define | Cognito custom auth flow control | No |
| 7 | Auth Create | OTP generation + SES delivery | No |
| 8 | Auth Verify | Constant-time OTP comparison | No |
| 9 | Billing | Stripe checkout, portal, webhooks | No |

---

## 3. AI/ML Pipeline — The Core ML Workload

The AI pipeline is a **Lambda Durable Function** that orchestrates 7 stages. Each stage is checkpointed — if the function is interrupted, it resumes from the last completed step.

### Pipeline Stages

```
INPUT: { idea_text, org_id, user_id }
  │
  ▼
┌─────────────┐
│ 1. SANITIZE │  Python validation, PII redaction, prompt injection detection
└──────┬──────┘
       ▼
┌─────────────┐
│ 2. PARSE    │  LLM call → structured JSON (industry, business model, keywords)
└──────┬──────┘
       ▼
┌─────────────┐
│ 3. SEARCH   │  Brave Search API (6 queries) + Wikipedia + Wikidata enrichment
└──────┬──────┘  Then LLM structures raw results into schema
       ▼
┌─────────────┐
│ 4. ANALYSE  │  LLM synthesizes competitor landscape, market gaps, 1-10 signals
└──────┬──────┘
       ▼
┌─────────────┐
│ 5. SCORE    │  Deterministic algorithm — no LLM (reproducible, explainable)
└──────┬──────┘
       ▼
┌─────────────┐
│ 6. SUMMARISE│  LLM generates beginner-friendly narrative
└──────┬──────┘
       ▼
┌─────────────┐
│ 7. ASSEMBLE │  Merge all outputs, persist to DynamoDB, emit metrics
└─────────────┘
```

### Multi-Model Strategy

The pipeline uses **3 different foundation models** via Amazon Bedrock, each chosen for cost/quality tradeoff at that stage:

| Stage | Model | Why This Model | Cost/1M tokens (in/out) |
|---|---|---|---|
| Parse + Search | Amazon Nova Micro | Cheap structured extraction, fast | $0.035 / $0.14 |
| Analyse | DeepSeek V3.2 | Strong reasoning at mid-tier price | $0.62 / $1.85 |
| Summarise | Amazon Nova 2 Lite | Natural prose JSON (replaces Claude 3 Haiku) | sync AWS pricing |

**Per-report total LLM cost:** re-benchmark after Nova 2 Lite on Summarise only (prior ~$0.007 with Nova Micro + DeepSeek + Haiku). See `docs/operations/BEDROCK-MODEL-CONFIG.md`.

### Why Multi-Model?

- **Cost optimization:** **Nova Micro** for Parse and Search structuring (minimal task); **Nova 2 Lite** only where prose quality matters (Summarise). See `docs/operations/BEDROCK-MODEL-CONFIG.md`.
- **Quality optimization:** DeepSeek V3.2 for reasoning outperforms lighter models on competitive analysis tasks.
- **Latency optimization:** Smaller models respond faster for simple tasks.

---

## 4. Amazon Bedrock Integration

### How Bedrock Is Used

- **`bedrock-runtime:InvokeModel`** — synchronous inference calls
- **Provider-aware payload construction** — different JSON formats for Anthropic (Messages API), DeepSeek (OpenAI-compatible), and Amazon Nova (Converse-style)
- **Provider-aware response parsing** — each model returns tokens/usage in different fields
- **Retry with exponential backoff** — handles `ThrottlingException`, `TooManyRequestsException`, `ServiceUnavailableException`, `ModelNotReadyException`

### Model Selection Architecture

```python
# Per-stage model IDs from environment variables
MODEL_ID_PARSE = os.environ["BEDROCK_MODEL_ID_PARSE"]
MODEL_ID_ANALYSE = os.environ["BEDROCK_MODEL_ID_ANALYSE"]
MODEL_ID_SUMMARISE = os.environ["BEDROCK_MODEL_ID_SUMMARISE"]
```

Models are configured as SAM template parameters — swappable without code changes. IAM permissions are scoped per-model ARN.

### Token Usage Tracking

Every LLM call extracts token counts from the Bedrock response:
- Anthropic: `response.usage.input_tokens`, `response.usage.output_tokens`
- DeepSeek: `response.usage.prompt_tokens`, `response.usage.completion_tokens`
- Nova: `response.usage.inputTokens`, `response.usage.outputTokens`

Tokens are accumulated per-stage, written to DynamoDB per-report, and emitted as CloudWatch custom metrics (`TokensInput`, `TokensOutput`, `EstimatedCostUsd`).

---

## 5. ML-Relevant Design Decisions

### 5.1 Prompt Engineering

- **Structured output enforcement:** All prompts request "Return ONLY valid JSON" with explicit schemas
- **Temperature tuning per task:** 0.1 for classification (Parse), 0.3 for analysis (Analyse), 0.6 for creative writing (Summarise)
- **Prompt injection defense:** Input wrapped in delimiters (`<<<USER INPUT>>>`), system prompts explicitly mark user content as untrusted
- **Fallback on parse failure:** If JSON parsing fails, retry once with self-correction prompt, then degrade gracefully

### 5.2 Deterministic Scoring (Not LLM-Driven)

The scoring algorithm is pure Python — no LLM involvement:
- **Saturation (0-100):** Logarithmic competitor count + funding maturity + market consolidation + CAC pressure + innovation velocity
- **Difficulty (0-100):** Technical complexity + capital requirements + sales cycle + regulatory burden + switching cost
- **Opportunity (0-100):** Market size (log10 TAM) + growth rate + gap signals + fragmentation bonus - saturation penalty - difficulty penalty

**Why deterministic?** Reproducibility, explainability, no hallucination on numbers, versionable algorithm.

### 5.3 Data Enrichment Pipeline

Before LLM analysis, the pipeline enriches raw search results with structured data:
- **Brave Search API:** 6 targeted queries (competitors, market size, funding, pain points, trends)
- **Wikipedia REST API:** Company summaries and descriptions
- **Wikidata SPARQL:** Founding year, employee count, revenue, industry, HQ, parent org
- **Parallel execution:** ThreadPoolExecutor with 8 workers for Wikipedia/Wikidata lookups

### 5.4 Failure Handling & Degraded Reports

The pipeline degrades rather than fails:
- Stage 2 (Parse) fails → fall back to keyword extraction
- Stage 3 (Search) fails → continue with empty data, show "limited data" warning
- Stage 4 (Analyse) fails → retry with cheaper model, then hard fail
- Stage 6 (Summarise) fails → return scores + competitors without narrative

Degraded reports are marked `metadata.degraded = true` and the user is not charged.

---

## 6. Observability & MLOps

### CloudWatch Metrics (MarketLens namespace)

| Metric | What It Tracks |
|---|---|
| `TokensInput` | Input tokens per report |
| `TokensOutput` | Output tokens per report |
| `TokensTotal` | Combined tokens per report |
| `EstimatedCostUsd` | Estimated LLM cost per report |
| `ReportCompleted` | Successful pipeline completions |
| `ReportFailed` | Pipeline failures |
| `ColdStart` | Lambda cold starts (auto from Powertools) |

### Structured Logging

Every LLM call logs:
```json
{
  "stage": "analyse",
  "model_id": "deepseek-v3.2",
  "input_tokens": 3200,
  "output_tokens": 1450,
  "cost_usd": 0.004
}
```

Score breakdown logged with all factors for debugging:
```json
{
  "message": "Score breakdown",
  "tam_usd": 4800000000,
  "growth_pct": 15.0,
  "saturation": 63,
  "opportunity": 30,
  "market_size_score": 15.3,
  "gap_score": 15.0
}
```

### X-Ray Tracing

All Lambdas have active tracing. API Gateway traces propagate through to Bedrock calls, giving end-to-end latency visibility per pipeline stage.

---

## 7. Cost Model & Unit Economics

| Component | Cost Per Report | Notes |
|---|---|---|
| LLM (Bedrock) | ~$0.007 | 3 models, ~8K total tokens |
| Brave Search | ~$0.005 | 6 queries at $5/1K requests |
| Wikipedia/Wikidata | $0.00 | Free APIs |
| Lambda compute | ~$0.001 | 900s max, typically 60-90s |
| DynamoDB | ~$0.0001 | On-demand, few writes |
| **Total per report** | **~$0.013** | |

**Revenue per report:** $0.67 (Pro at $20/mo ÷ 30 reports) to $3.33 (Max at $100/mo ÷ 30 reports)

**Gross margin:** >95% on LLM costs alone.

---

## 8. Security Architecture

### Authentication Flow
- Passwordless email OTP via Cognito Custom Auth Challenge
- Google SSO via Cognito Identity Provider
- BFF pattern: tokens stored in HttpOnly/Secure/SameSite=Strict cookies (never in JavaScript)
- Lambda Authorizer validates JWT on every API call

### Multi-Tenancy
- All DynamoDB queries scoped to `ORG#{org_id}`
- Atomic rate limiting via conditional DynamoDB UpdateItem (no race conditions)
- Plan-aware gates: export formats, history depth, daily report limits

### Prompt Injection Defense
- Input sanitization (length, PII, injection patterns)
- Delimiter wrapping (`<<<` / `>>>`)
- Output schema validation (reject non-JSON responses)
- Rate limiting per user and org

---

## 9. AWS Services Used (Complete List)

| Service | How It's Used | ML Associate Relevance |
|---|---|---|
| **Amazon Bedrock** | Multi-model LLM inference (Nova, DeepSeek, Claude) | **High** — foundation models, inference, model selection |
| **Lambda** | All compute (9 functions) | Medium — serverless ML inference hosting |
| **Lambda Durable Functions** | Pipeline orchestration with checkpointing | Medium — ML workflow orchestration |
| **DynamoDB** | Reports, users, orgs, rate limits | Low — data storage for ML outputs |
| **S3** | Raw JSON reports, Parquet analytics data | Medium — ML data lake, feature store |
| **AWS Glue DataBrew** | JSON → Parquet ETL for analytics | Medium — data preparation, feature engineering |
| **Amazon Athena** | SQL analytics on Parquet data | Medium — ML model performance analysis |
| **API Gateway** | REST API with auth | Low |
| **CloudFront + S3** | Frontend CDN + export storage | Low |
| **Cognito** | User authentication | Low |
| **SSM Parameter Store** | Secrets (API keys, Stripe keys) | Low |
| **SES** | OTP email delivery | Low |
| **CloudWatch** | Metrics, logs, alarms | Medium — ML model monitoring |
| **X-Ray** | Distributed tracing | Medium — ML pipeline observability |
| **IAM** | Per-model Bedrock permissions | Medium — security for ML resources |

---

## 10. Key Concepts That Map to ML Associate Exam

| Project Concept | ML Associate Domain |
|---|---|
| Multi-model pipeline (Nova + DeepSeek + Claude) | Model selection, cost/quality tradeoffs |
| Token tracking + cost estimation | ML cost optimization, inference monitoring |
| Prompt engineering (temperature, structured output) | Foundation model customization |
| Deterministic scoring vs LLM scoring | When to use ML vs traditional algorithms |
| Retry with model fallback | ML system reliability, error handling |
| CloudWatch metrics for ML | Model monitoring, operational metrics |
| Bedrock InvokeModel with provider-specific payloads | Bedrock API, model invocation patterns |
| Data enrichment before inference | Feature engineering, data preparation |
| Degraded reports (graceful failure) | ML system design, fault tolerance |
| Per-model IAM permissions | Security for ML workloads |
| Pipeline checkpointing (Durable Functions) | ML workflow orchestration |
| Input validation + prompt injection defense | Responsible AI, security |
| **S3 data lake (JSON → Parquet)** | **Data storage for ML, columnar formats** |
| **Glue DataBrew ETL pipeline** | **Data preparation, feature engineering** |
| **Athena SQL analytics on ML outputs** | **Model performance analysis, business metrics** |
| **Parquet columnar storage** | **Efficient ML data storage, query optimization** |

---

## 11. Analytics Pipeline (New: May 2026)

### Architecture

```
AI Orchestration Lambda (completes report)
  ↓ writes JSON
S3: marketlens-reports-raw-dev/reports/raw/{org_id}/{report_id}.json
  ↓ manual trigger
AWS Glue DataBrew (unnest, flatten, type conversion)
  ↓ writes Parquet
S3: marketlens-reports-parquet-dev/latest/*.parquet
  ↓ SQL queries
Amazon Athena (serverless SQL engine)
  ↓ results
Business Intelligence (cost analysis, market trends, user behavior)
```

### Why This Pipeline?

**Problem:** DynamoDB is great for transactional queries (get report by ID), but terrible for analytics (average saturation by industry, cost trends over time).

**Solution:** Export completed reports to S3 as JSON, transform to Parquet (columnar format), query with Athena (SQL).

### DataBrew Transformation

**Input (JSON):**
```json
{
  "report_id": "uuid",
  "org_id": "org_123",
  "status": "complete",
  "total_cost_usd": 0.007,
  "result": {
    "saturation_score": 45,
    "opportunity_score": 78,
    "business_model": "b2b_saas"
  }
}
```

**Output (Parquet):**
```
report_id | org_id  | status   | total_cost_usd | result_saturation_score | result_opportunity_score | result_business_model
uuid      | org_123 | complete | 0.007          | 45                      | 78                       | b2b_saas
```

**DataBrew Recipe:**
1. Unnest `result` object (flatten nested JSON)
2. Rename columns (add `result_` prefix with underscore delimiter)
3. Type conversion (STRING → BIGINT for scores)
4. Write to Parquet (columnar compression)

### Athena Queries (Examples)

**Average saturation by business model:**
```sql
SELECT result_business_model, 
       AVG(result_saturation_score) as avg_saturation,
       COUNT(*) as reports
FROM marketlens.reports
WHERE org_id != 'unknown'
GROUP BY result_business_model
ORDER BY reports DESC;
```

**Total LLM cost by organization:**
```sql
SELECT org_id,
       COUNT(*) as reports,
       SUM(total_cost_usd) as total_cost,
       AVG(total_cost_usd) as avg_cost_per_report
FROM marketlens.reports
WHERE org_id != 'unknown'
GROUP BY org_id
ORDER BY total_cost DESC;
```

**High-opportunity markets (low saturation, high opportunity):**
```sql
SELECT result_business_model,
       result_geography,
       result_saturation_score,
       result_opportunity_score
FROM marketlens.reports
WHERE org_id != 'unknown'
  AND result_saturation_score < 30
  AND result_opportunity_score > 80
ORDER BY result_opportunity_score DESC;
```

### Cost Analysis

| Component | Cost |
|---|---|
| S3 storage (JSON) | ~$0.01/month (72 reports × 5MB) |
| S3 storage (Parquet) | ~$0.001/month (500 KB compressed) |
| DataBrew job | $0 (free tier: 40 node-hours/month) |
| Athena queries | ~$0.01/month (100 queries × 500 KB scanned) |
| **Total** | **~$0.03/month** |

### ML Associate Exam Relevance

- **Data lake architecture:** S3 as central storage for ML data
- **Columnar formats:** Parquet for efficient analytics (vs row-based JSON)
- **ETL pipelines:** Glue DataBrew for data preparation
- **Serverless analytics:** Athena for ad-hoc SQL queries
- **Cost optimization:** Parquet compression (10x smaller than JSON)
- **Schema evolution:** Adding new fields without breaking queries

---

## 12. Architecture Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│                   CloudFront + S3 (plinths.net)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (cookies)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (REST)                           │
│              Lambda Authorizer (JWT + DynamoDB)                   │
│                    API Key (CloudFront-injected)                  │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
       │          │          │          │          │
       ▼          ▼          ▼          ▼          ▼
   ┌───────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │  API  │ │  BFF   │ │ Export │ │Billing │ │  AI    │
   │Lambda │ │ Auth   │ │ Lambda │ │ Lambda │ │Pipeline│
   └───┬───┘ └────────┘ └───┬────┘ └───┬────┘ └───┬────┘
       │                     │          │          │
       ▼                     ▼          ▼          ▼
   ┌────────┐           ┌────────┐ ┌────────┐ ┌────────────────┐
   │DynamoDB│           │   S3   │ │ Stripe │ │ Amazon Bedrock  │
   │(reports│           │(exports│ │  API   │ │                 │
   │ users) │           │  .csv) │ │        │ │ Nova Micro      │
   └────────┘           └────────┘ └────────┘ │ DeepSeek V3.2   │
                                               │ Nova 2 Lite     │
       ┌───────────────────────────────────────┘
       │
       ▼
   ┌────────────────────────────────────────┐
   │         EXTERNAL DATA SOURCES           │
   │  Brave Search · Wikipedia · Wikidata    │
   └────────────────────────────────────────┘
```

---

## 13. What's Next (Planned)

- **Muse (Chat Agent):** SSE-based LLM chat per report, conversation history in DynamoDB
- **Model Selection (paid feature):** Users choose models per pipeline stage
- **CloudWatch Dashboard:** Token usage, cost trends, pipeline latency visualization
- **Persona-Based Reports:** Same pipeline, different output lens (Founder / PM / Investor)
- **Crunchbase API:** Premium data source for investor-grade reports

---

*Generated: May 2026 · For use with Google NotebookLM alongside AWS ML Associate study material.*
