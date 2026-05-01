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
