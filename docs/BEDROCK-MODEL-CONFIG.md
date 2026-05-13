# Bedrock model configuration (report pipeline)

**Source of truth for model IDs:** AWS Bedrock console → Model access, and [Supported foundation models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html) for your deployment region.

## Current decision (Plinths AI orchestration)

| Stage | Model | Bedrock model ID (parameter default) |
|-------|--------|--------------------------------------|
| Parse | **Amazon Nova 2 Lite** | `amazon.nova-2-lite-v1:0` |
| Search (structuring) | Same as Parse | Uses `BEDROCK_MODEL_ID_PARSE` |
| Analyse | **DeepSeek V3.2** | `deepseek.v3.2` |
| Summarise | **Amazon Nova 2 Lite** | `amazon.nova-2-lite-v1:0` |

**Change from prior docs:** stages that used **Amazon Nova 1 Micro** (parse/search) and **Claude 3 Haiku** (summarise) now use **Nova 2 Lite** for a single fast, cost‑effective Amazon model on those slots. **Analyse** remains **DeepSeek** for competitive reasoning.

## SAM parameters

Defined in `template.yaml`: `BedrockModelIdParse`, `BedrockModelIdAnalyse`, `BedrockModelIdSummarise` → Lambda env `BEDROCK_MODEL_ID_*` in `infrastructure/lambda/ai-orchestration`.

Override at deploy time if AWS renames an ID or you use inference profiles.

## Implementation notes

- `app.py` `call_llm()` treats **Nova** family IDs (including Nova 2 Lite) with the same **invoke_model** JSON shape as other Amazon Nova text models. If AWS documents a different contract for Nova 2 only, align `_build_payload` / `_extract_text` / `_extract_token_usage` with the official model parameters page.
- Token **cost estimates** in `app.py` use a dedicated key for Nova 2 Lite; **reconcile rates** with the current [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) page when billing accuracy matters.

## Muse (future)

Default chat model on Bedrock is documented alongside the report pipeline in `CLAUDE.md` (Muse section). When Muse ships, default **Pro** Bedrock chat to **Nova 2 Lite** unless product specifies otherwise; **Max** may still offer Claude / DeepSeek / Sonnet per plan.
