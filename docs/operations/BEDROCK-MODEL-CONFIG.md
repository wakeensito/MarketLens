# Bedrock model configuration (report pipeline)

**Source of truth for model IDs:** AWS Bedrock console → Model access, and [Supported foundation models](https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html) for your deployment region.

## Current decision (Plinths AI orchestration)

| Stage | Model | Bedrock model ID (parameter default) |
|-------|--------|--------------------------------------|
| Parse | **Amazon Nova Micro** | `amazon.nova-micro-v1:0` |
| Search (structuring) | Same as Parse | Uses `BEDROCK_MODEL_ID_PARSE` |
| Analyse | **DeepSeek V3.2** | `deepseek.v3.2` |
| Summarise | **Amazon Nova 2 Lite** | `us.amazon.nova-2-lite-v1:0` (inference profile) |
| Build Brief | **Amazon Nova 2 Lite** | `us.amazon.nova-2-lite-v1:0` (inference profile) |

**Rationale:** **Nova Micro** is enough for bounded JSON extraction and search structuring (low cost, low latency). **Nova 2 Lite** is reserved for **Summarise** (and optional Muse default) where founder-facing prose and richer JSON benefit from a stronger model; using Nova 2 Lite on Parse would be overkill. **Analyse** stays **DeepSeek** for competitive reasoning.

## SAM parameters

Defined in `template.yaml`: `BedrockModelIdParse`, `BedrockModelIdAnalyse`, `BedrockModelIdSummarise` → Lambda env `BEDROCK_MODEL_ID_*` in `infrastructure/lambda/ai-orchestration`.

**Model IDs are pinned in `samconfig.toml` `parameter_overrides`.** CI runs a bare `sam deploy`, which reuses each parameter's *previous* stack value — editing a template `Default` alone never reaches the live stack. Change models in `samconfig.toml` (and keep the template defaults in sync for fresh stacks).

**Nova 2 Lite is not invokable on-demand by bare FM ID** — use the `us.amazon.nova-2-lite-v1:0` cross-region inference profile. IAM must allow the profile ARN *and* the FM ARN in us-east-1, us-east-2 and us-west-2.

**Claude 3 Haiku (`anthropic.claude-3-haiku-20240307-v1:0`) is end-of-life on Bedrock** — invoke returns `ResourceNotFoundException: This model version has reached the end of its life`, even though `GetFoundationModelAvailability` still reports it AVAILABLE. Don't use it.

## Implementation notes

- `app.py` `call_llm()` treats **Nova** family IDs (including Nova 2 Lite) with the same **invoke_model** JSON shape as other Amazon Nova text models. If AWS documents a different contract for Nova 2 only, align `_build_payload` / `_extract_text` / `_extract_token_usage` with the official model parameters page.
- Token **cost estimates** in `app.py` use a dedicated key for Nova 2 Lite; **reconcile rates** with the current [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) page when billing accuracy matters.

## Muse (future)

Default chat model on Bedrock is documented alongside the report pipeline in `CLAUDE.md` (Muse section). When Muse ships, default **Pro** Bedrock chat to **Nova 2 Lite** (same family as **Summarise**, not Parse) unless product specifies otherwise; **Max** may still offer Claude / DeepSeek / Sonnet per plan.
