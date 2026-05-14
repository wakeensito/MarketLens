# Muse (Chat Agent) — Implementation Plan

> **Goal:** Add interactive chat to Plinths reports. Users ask follow-up questions about their market analysis, and Muse responds with context-aware answers using the report data.

**Status:** Planning phase
**Target:** Post-billing, pre-Phase 5
**Effort estimate:** 2-3 weeks
**ML Associate relevance:** High — model selection, inference optimization, cost analysis, SageMaker vs Bedrock comparison

---

## 1. What Is Muse?

Muse is a conversational AI agent that lives inside each report. It has full context of the market analysis and can answer questions like:

- "Who are the top 3 competitors and what are their weaknesses?"
- "What's the best entry strategy for this market?"
- "How does this compare to the SaaS market?"
- "What would a $50K MVP look like?"

**Key features:**
- Report-scoped conversation (each report has its own chat history)
- Streaming responses (SSE — tokens appear as they're generated)
- Plan-based limits (Pro: 30 messages/report, Max: unlimited)
- Context injection (report `result_json` in system prompt)

---

## 2. Architecture Options

### Option A: Bedrock (Recommended for MVP)

Frontend → POST /api/muse/stream → Lambda Function URL (RESPONSE_STREAM) → Bedrock `InvokeModelWithResponseStream` (Amazon Nova 2 Lite default; Claude / DeepSeek / Sonnet optional on Max) → SSE stream back to frontend.

**Pros:**
- No infrastructure (serverless)
- Fast to implement (1 Lambda + DynamoDB)
- Multiple models available (Claude, Nova, DeepSeek)
- Streaming built-in (`InvokeModelWithResponseStream`)

**Cons:**
- Higher per-token cost than SageMaker
- Less control over model behavior

### Option B: SageMaker Endpoint

Frontend → POST → Lambda → SageMaker Real-Time Endpoint (Llama 3.1 8B or Mistral 7B) with `InvokeEndpointWithResponseStream` → SSE stream back to frontend.

**Pros:**
- Lower per-token cost (pay for instance hours, not tokens)
- Full control (custom model, fine-tuning, quantization)
- ML Associate exam relevance (SageMaker deployment, endpoints, inference)

**Cons:**
- Always-on cost (instance runs 24/7 even with no traffic)
- Cold start (endpoint takes 2-5 min to spin up)
- More complex (model deployment, endpoint config, autoscaling)

### Option C: Bedrock Agents (Future)

Amazon Bedrock Agents with function calling (can query DynamoDB, call APIs, etc.). Deferred until Bedrock Agents support streaming responses.

---

## 3. Cost Comparison: Bedrock vs SageMaker

### Bedrock (Amazon Nova 2 Lite)

| Metric | Value |
|---|---|
| Input tokens | $0.25 / 1M tokens |
| Output tokens | $1.25 / 1M tokens |
| Avg conversation | 10 messages x 500 tokens/msg = 5K tokens |
| Cost per conversation | ~$0.006 |
| Monthly cost (100 users, 5 convos/user) | ~$3 |

**Break-even:** Always cheaper than SageMaker until you hit ~50K conversations/month.

### SageMaker (Llama 3.1 8B on ml.g5.xlarge)

| Metric | Value |
|---|---|
| Instance cost | $1.006/hour = $24.14/day = $724/month |
| Tokens per second | ~50 tokens/sec (8B model) |
| Cost per token | $0 (already paying for instance) |
| Monthly cost (100 users, 5 convos/user) | $724 (fixed) |

**Break-even:** Cheaper than Bedrock at ~120K conversations/month.

### Recommendation

**Start with Bedrock** (Option A):
- $3/month at 500 conversations
- $30/month at 5K conversations
- $300/month at 50K conversations

**Switch to SageMaker** when you hit 50K+ conversations/month (at that scale, $724/month fixed is cheaper than $300+ variable).

---

## 4. Implementation Plan (Bedrock MVP)

### Phase 1: Backend (Chat Lambda + DynamoDB)

- [ ] DynamoDB schema: `MuseConversationsTable` with pk/sk, GSI1 for cross-report memory (reserved), TTL. See `docs/MUSE-BACKEND-HANDOFF.md` for exact item shape.
- [ ] Muse Stream Lambda: `infrastructure/lambda/muse/` with Function URL (`InvokeMode: RESPONSE_STREAM`), cookie-based auth (Lambda Layer or duplicated helper), Bedrock `InvokeModelWithResponseStream` against `CHAT_MODEL_ID` env var.
- [ ] Muse Sync Lambda (Option A): separate function for `GET`/`DELETE /api/muse/conversations/{report_id}` on existing API Gateway + cookie Authorizer.
- [ ] SAM template additions: `MuseStreamFunction`, `MuseSyncFunction`, `MuseConversationsTable`, CloudFront behavior for `/api/muse/stream*` via OAC, `BedrockModelIdMuseChat` parameter.
- [ ] System prompt: inject report `result_json` (business model, industry, scores, competitors, gaps, key stats, market size) with citation-token instructions (`[[target|Label]]` format).
- [ ] IAM: exact ARN scoping for Bedrock model, DynamoDB tables. No wildcards.

### Phase 2: Frontend (SSE Client)

- [ ] Wire `useMuse` hook from mock to real `fetch` against `/api/muse/stream`.
- [ ] Parse SSE events: `token` (append delta), `sentence_boundary` (60ms settle), `done` (sources + follow-ups), `error` (codes: `limit_reached`, `plan_locked`, `report_not_found`, `auth_failed`, `model_error`, `timeout`).
- [ ] Verify `MuseThread.tsx` citation parsing works with live `[[target|Label]]` tokens from the model.

### Phase 3: Plan Gates

- [ ] Free tier: reject with `plan_locked` error event, close stream. Frontend shows upgrade prompt.
- [ ] Pro tier: count `role: "user"` rows per `report_id`. At >30, emit `limit_reached` error event before any tokens.
- [ ] Max tier: treat as Pro for v1 (same default model, no message cap). Cross-report memory and model selection deferred.

---

## 5. Model Selection for Chat

### Cost-Optimized Options (Bedrock)

| Model | Input $/1M | Output $/1M | Speed | Quality | Best For |
|---|---|---|---|---|---|
| **Amazon Nova 2 Lite** | sync AWS | sync AWS | Fast | Strong | Pro tier default (same tier as report Summarise) |
| **Amazon Nova Lite** | $0.06 | $0.24 | Fast | Good | Legacy reference only |
| **Claude 3 Haiku** | $0.25 | $1.25 | Fast | Excellent | Optional / legacy |
| **DeepSeek V3** | $0.62 | $1.85 | Medium | Excellent | Max tier (reasoning-heavy) |
| **Claude 3.5 Sonnet** | $3.00 | $15.00 | Slow | Best | Enterprise (overkill for chat) |

**Recommendation:**
- **Free tier:** No chat (locked paywall)
- **Pro tier:** Amazon Nova 2 Lite (default; sync pricing on AWS)
- **Max tier:** User choice (Nova 2 Lite, DeepSeek, or Sonnet, plus non-Bedrock providers per `CLAUDE.md`)

### SageMaker Options (For Learning)

| Model | Instance | Cost/hour | Tokens/sec | Cost/1M tokens (equiv) |
|---|---|---|---|---|
| **Llama 3.1 8B** | ml.g5.xlarge | $1.006 | ~50 | $0 (fixed cost) |
| **Mistral 7B** | ml.g5.xlarge | $1.006 | ~60 | $0 (fixed cost) |
| **Llama 3.1 70B** | ml.g5.12xlarge | $7.09 | ~20 | $0 (fixed cost) |

**Break-even calculation:**
- Bedrock (Nova 2 Lite baseline): re-run cost model x 120K conversations after pricing sync
- SageMaker (8B): $724/month (fixed)

**When to use SageMaker:**
- You hit 50K+ conversations/month
- You want to fine-tune the model on your data
- You need custom behavior (RAG, function calling)

---

## 6. SageMaker Deep Dive (ML Associate Study)

### 6.1 Deploy Llama 3.1 8B on SageMaker

- [ ] Create HuggingFace model with `meta-llama/Meta-Llama-3.1-8B-Instruct` on `ml.g5.xlarge`
- [ ] Deploy real-time endpoint (`plinths-chat-llama-8b`)
- [ ] Invoke with `invoke_endpoint_with_response_stream` and stream tokens
- [ ] Configure autoscaling: target tracking on `SageMakerVariantInvocationsPerInstance` (target 100, min 1, max 5, scale-out 60s cooldown, scale-in 300s)

### 6.2 Cost Optimization Techniques

- [ ] **Spot Instances** — not available for real-time endpoints
- [ ] **Multi-Model Endpoints** — share 1 instance across multiple models (Llama 8B + Mistral 7B); invoke with `target_model` parameter
- [ ] **Serverless Inference** — pay per request ($0.20/hour compute + $0.000012/request), no always-on cost; cheaper than real-time if <5 requests/min

---

## 7. ML Associate Exam Concepts

| Concept | Where It Appears in Muse |
|---|---|
| **Model selection** | Choosing Nova 2 Lite vs Sonnet vs DeepSeek based on cost/quality |
| **Inference optimization** | Streaming responses, token limits, caching |
| **SageMaker endpoints** | Real-time vs serverless vs batch |
| **Autoscaling** | Target tracking on invocations per instance |
| **Multi-model endpoints** | Sharing 1 instance across Llama 8B + Mistral 7B |
| **Cost analysis** | Bedrock pay-per-token vs SageMaker pay-per-hour |
| **Streaming inference** | `InvokeModelWithResponseStream`, SSE transport |
| **Context window management** | Truncating conversation history to fit token limits |
| **Prompt engineering** | System prompt with report context injection |
| **Model monitoring** | CloudWatch metrics (latency, token count, errors) |

---

## 8. Implementation Timeline

### Week 1: Backend MVP
- [ ] Day 1-2: DynamoDB schema + Muse Stream Lambda skeleton (hardcoded SSE, no Bedrock)
- [ ] Day 3-4: Bedrock streaming integration + sentence-boundary detector
- [ ] Day 5: Message limits + plan gates

### Week 2: Frontend + Polish
- [ ] Day 1-2: Wire `useMuse` from mock to real fetch + SSE parsing
- [ ] Day 3: Upgrade prompts + locked state for Free
- [ ] Day 4-5: Testing + bug fixes

### Week 3: SageMaker Experiment (Optional)
- [ ] Day 1-2: Deploy Llama 3.1 8B to SageMaker
- [ ] Day 3: Cost comparison (real usage data)
- [ ] Day 4-5: Document findings for ML Associate study

---

## 9. Success Metrics

| Metric | Target |
|---|---|
| Avg messages per conversation | >5 (indicates engagement) |
| Response latency (p95) | <3 seconds |
| Cost per conversation | Re-benchmark with Nova 2 Lite on Bedrock |
| Upgrade conversion (free -> Pro) | >10% (chat is a key driver) |
| User satisfaction (thumbs up) | >80% |

---

## 10. Next Steps

1. **Review this plan** — any questions or changes?
2. **Choose starting point:**
   - **Option A:** Build Bedrock MVP first (fastest path to users)
   - **Option B:** SageMaker experiment first (learning-focused)
3. **Create feature branch:** `feature/muse-chat`
4. **Start with DynamoDB schema** (lowest risk, foundational)

---

*Created: May 2026 · For Plinths Muse (Chat Agent) feature*
