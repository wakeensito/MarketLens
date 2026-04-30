# BACKLOG

> Ideas that came up during development. Not in scope for current sprint. Review after beta launch.

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

Free tier uses Claude 3 Haiku (fast, cheap). Paid tiers get access to better models for higher quality analysis:

| Tier | Model | Use Case |
|---|---|---|
| Free | Claude 3 Haiku | Quick analysis, good enough for exploration |
| Pro | Claude 3.5 Haiku or Sonnet | Better competitor analysis, richer summaries |
| Enterprise | Claude Sonnet 4.6 | Deep analysis, detailed market sizing, investor-grade output |

**Implementation:** Add `model_tier` to the report request (derived from user's subscription). AI Lambda reads the tier and selects the Bedrock model ID accordingly. IAM already has wildcard Bedrock permissions.

---
