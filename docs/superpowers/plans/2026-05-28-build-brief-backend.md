# Build Brief Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the backend for the already-built Build Brief frontend — a synchronous `GET`/`POST /api/reports/{id}/build-brief` that generates a structured brief via one Claude 3 Haiku call and stores it on the report item — plus remove the now-cut regenerate path from the frontend.

**Architecture:** A new dedicated `BuildBriefFunction` (mirrors `MuseSyncFunction`) behind the existing API Gateway + authorizer owns both routes. POST is paid-gated, requires a completed report, is idempotent (returns the stored brief instead of re-spending), and runs a single provider-aware Bedrock `invoke_model` call. The brief is stored as `build_brief_json` + `build_brief_generated_at` on the report's DynamoDB item.

**Tech Stack:** Python 3 + AWS Lambda Powertools (`APIGatewayRestResolver`), Bedrock Runtime (`anthropic.claude-3-haiku-20240307-v1:0`), DynamoDB, AWS SAM. Frontend: React + Vite + TypeScript (`bun`).

**Spec:** `docs/superpowers/specs/2026-05-28-build-brief-backend-design.md`

---

## Verification approach (read first)

This repo has **no test framework** — not for the Python Lambdas, not for the frontend. Per `CLAUDE.md` and the existing plans, verification is:

- **Python:** `python3 -m py_compile <file>` (syntax) and `sam build` (full build + template validation + dependency resolution).
- **Frontend:** `bun run build` (`tsc -b && vite build`, catches all type errors) + `bun run lint`. The pre-existing Vite ">500 kB chunk" warning is expected and is NOT an error.
- **End-to-end:** documented manual deploy + exercise (Task 5). `sam local invoke` is not used here because it would still call live Bedrock + DynamoDB and needs a real completed report row.

**Do NOT add a test framework.** Do NOT start a dev server / drive a browser (browser-check notes are for the human).

**Working-tree hygiene:** the tree has **unrelated uncommitted changes** from a prior session — `CLAUDE.md`, `frontend/src/App.tsx`, `frontend/src/components/ReportView.tsx`, `frontend/src/index.css`, `frontend/src/components/WorkspaceTabs.tsx`. **Stage only the files each task names. Never `git add -A` / `git add .`.** Task 7 edits `CLAUDE.md`, which already carries a pending edit — review `git diff CLAUDE.md` and stage only the Build-Brief hunk (use `git add -p CLAUDE.md`).

---

## File structure

**Create (`infrastructure/lambda/build-brief/`):**
- `llm.py` — provider-aware Bedrock `invoke_model` helper with retry/backoff (adapted from `ai-orchestration/app.py`, no token tracking).
- `prompt.py` — `build_prompt(idea_text, result_json)` + `parse_and_validate(raw_text)` (extracts/validates the brief JSON, DynamoDB-safe).
- `app.py` — Powertools resolver: GET + POST handlers, auth, fresh-plan gate, ownership, completeness check, idempotency, orchestration, storage.
- `requirements.txt` — comment-only (boto3 in runtime, Powertools via layer).

**Modify:**
- `template.yaml` — add `BedrockModelIdBuildBrief` param, `BuildBriefFunction` + its `LogGroup`, scoped IAM, GET/POST events.
- `frontend/src/components/BuildBrief.tsx` — remove regenerate button + dead `capReached` message + props.
- `frontend/src/hooks/useBuildBrief.ts` — remove `capReached` state + 429 branch + regenerate-specific deps.
- `frontend/.interface-design/system.md` — action row no longer says "· regenerate".
- `CLAUDE.md` — same doc fix if present.

---

## Task 1: Bedrock invoke helper (`llm.py`) + requirements

**Files:**
- Create: `infrastructure/lambda/build-brief/llm.py`
- Create: `infrastructure/lambda/build-brief/requirements.txt`

- [ ] **Step 1: Create `requirements.txt`**

```text
# boto3 is included in the Lambda runtime — do not add here
# aws-lambda-powertools is provided via the Globals layer — do not add here
```

- [ ] **Step 2: Create `llm.py`**

```python
"""Bedrock invoke helper for the Build Brief — provider-aware, with retry/backoff.

Adapted from infrastructure/lambda/ai-orchestration/app.py (token tracking
dropped — the brief is a single one-shot call, not a metered pipeline)."""
from __future__ import annotations

import json
import os
import random
import time

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from aws_lambda_powertools import Logger

logger = Logger(child=True)
bedrock = boto3.client("bedrock-runtime")

_TRANSIENT = {
    "ThrottlingException",
    "TooManyRequestsException",
    "ServiceUnavailableException",
    "InternalServerException",
    "ModelNotReadyException",
    "ModelTimeoutException",
}


def _build_payload(model_id: str, prompt: str, max_tokens: int, temperature: float) -> str:
    if "anthropic" in model_id:
        return json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
            }
        )
    if "deepseek" in model_id:
        return json.dumps(
            {
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
            }
        )
    # Amazon Nova — Converse-style payload.
    return json.dumps(
        {
            "inferenceConfig": {"max_new_tokens": max_tokens, "temperature": temperature},
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
        }
    )


def _extract_text(model_id: str, body: dict) -> str:
    if "anthropic" in model_id:
        return body["content"][0]["text"]
    if "deepseek" in model_id:
        return body["choices"][0]["message"]["content"]
    return body["output"]["message"]["content"][0]["text"]


def call_llm(prompt: str, model_id: str, max_tokens: int = 2048, temperature: float = 0.3) -> str:
    """Invoke a Bedrock model and return its text. Retries transient errors with
    exponential backoff + jitter. Raises on exhaustion / non-retryable errors."""
    max_attempts = int(os.environ.get("LLM_MAX_ATTEMPTS", "3"))
    base_ms = int(os.environ.get("LLM_BACKOFF_BASE_MS", "400"))
    cap_ms = int(os.environ.get("LLM_BACKOFF_CAP_MS", "4000"))
    payload = _build_payload(model_id, prompt, max_tokens, temperature)

    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            resp = bedrock.invoke_model(
                modelId=model_id,
                contentType="application/json",
                accept="application/json",
                body=payload,
            )
            parsed = json.loads(resp["body"].read())
            return _extract_text(model_id, parsed)
        except (ClientError, BotoCoreError, ValueError) as e:
            last_err = e
            code = e.response.get("Error", {}).get("Code") if isinstance(e, ClientError) else None
            retryable = isinstance(e, ValueError) or (code in _TRANSIENT if code else True)
            if (not retryable) or attempt >= max_attempts:
                logger.exception("Bedrock invoke failed", extra={"model_id": model_id})
                raise
            sleep_ms = min(cap_ms, base_ms * (2 ** (attempt - 1)))
            time.sleep((sleep_ms + random.uniform(0, base_ms)) / 1000.0)
    raise last_err if last_err else RuntimeError("call_llm exhausted")
```

- [ ] **Step 3: Verify syntax**

Run: `python3 -m py_compile infrastructure/lambda/build-brief/llm.py`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add infrastructure/lambda/build-brief/llm.py infrastructure/lambda/build-brief/requirements.txt
git commit -m "Add Build Brief Bedrock invoke helper"
```

---

## Task 2: Prompt builder + response validation (`prompt.py`)

**Files:**
- Create: `infrastructure/lambda/build-brief/prompt.py`

- [ ] **Step 1: Create `prompt.py`**

```python
"""Prompt construction + response parsing for the Build Brief.

`build_prompt` grounds a founder-altitude, vendor-neutral brief in the completed
report. `parse_and_validate` extracts the JSON object the frontend adapter
expects and makes it DynamoDB-safe (no floats)."""
from __future__ import annotations

import json
import re
from decimal import Decimal

_INSTRUCTIONS = """You are writing a founder-altitude "Build Brief" for a NON-TECHNICAL founder, derived from a completed market report. Write plain English. Stay vendor-neutral: name generic primitives with example cross-cloud mappings; never recommend a specific cloud, never use vendor logos.

Rules:
- If the idea is NOT technology-dominant (e.g. a local bakery), set "is_tech_dominant": false, keep complexity low, and let "foundation" collapse to a website + payments. Never invent infrastructure a simple business does not need.
- "capabilities": the functional building blocks the product needs; tag each "build" (the founder's differentiator) or "buy" (an off-the-shelf vendor solves it) with a one-line recommendation.
- "foundation": the handful of generic primitives this needs (e.g. object storage, a managed database), each with a cross-cloud example mapping like "S3 / Blob Storage / Cloud Storage".
- "technical_risks": what commonly sinks this kind of build.
- Be directional and honest; this is a starting point, not a vetted secure design."""

_SCHEMA_HINT = """Return ONLY a JSON object — no prose, no markdown fences — matching exactly this shape:
{
  "is_tech_dominant": true,
  "complexity_score": "0-100 as a string",
  "complexity_label": "short label, e.g. Moderate",
  "complexity_drivers": ["short phrase"],
  "capabilities": [
    {"name": "", "description": "", "build_or_buy": "build", "recommendation": ""}
  ],
  "foundation": [
    {"primitive": "", "why": "", "cloud_examples": "S3 / Blob Storage / Cloud Storage"}
  ],
  "mvp_scope": "plain-English paragraph",
  "effort_estimate": {"timeframe": "", "team_shape": ""},
  "technical_risks": [{"title": "", "description": ""}]
}"""

_REQUIRED_KEYS = (
    "is_tech_dominant",
    "complexity_score",
    "complexity_label",
    "complexity_drivers",
    "capabilities",
    "foundation",
    "mvp_scope",
    "effort_estimate",
    "technical_risks",
)


def build_prompt(idea_text: str, result_json: dict) -> str:
    # default=str so DynamoDB Decimals (and anything non-JSON) serialize cleanly.
    report_summary = json.dumps(result_json, default=str)[:6000]
    return (
        f"{_INSTRUCTIONS}\n\n"
        f"FOUNDER'S IDEA:\n{idea_text}\n\n"
        f"MARKET REPORT (JSON):\n{report_summary}\n\n"
        f"{_SCHEMA_HINT}"
    )


def parse_and_validate(raw_text: str) -> dict:
    """Extract the JSON object from the model output and validate required keys.
    Raises ValueError (incl. json.JSONDecodeError) if unparseable or incomplete."""
    text = raw_text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("No JSON object in model output")
        text = text[start : end + 1]

    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("Model output is not a JSON object")
    missing = [k for k in _REQUIRED_KEYS if k not in parsed]
    if missing:
        raise ValueError(f"Brief missing keys: {missing}")
    # Frontend adapter treats complexity_score via parseScore; keep it a string
    # to match the result_json string-number convention.
    if not isinstance(parsed["complexity_score"], str):
        parsed["complexity_score"] = str(parsed["complexity_score"])
    # DynamoDB rejects Python floats — round-trip with parse_float=Decimal so any
    # stray numeric field stores safely. Powertools serializes Decimal on read.
    return json.loads(json.dumps(parsed), parse_float=Decimal)
```

- [ ] **Step 2: Verify syntax**

Run: `python3 -m py_compile infrastructure/lambda/build-brief/prompt.py`
Expected: no output (exit 0).

- [ ] **Step 3: Sanity-check the parser locally**

Run:
```bash
cd infrastructure/lambda/build-brief && python3 -c "
import prompt
raw = '''Here is your brief:
\`\`\`json
{\"is_tech_dominant\": true, \"complexity_score\": 65, \"complexity_label\": \"Moderate\", \"complexity_drivers\": [\"realtime sync\"], \"capabilities\": [], \"foundation\": [], \"mvp_scope\": \"x\", \"effort_estimate\": {\"timeframe\": \"3 mo\", \"team_shape\": \"2 eng\"}, \"technical_risks\": []}
\`\`\`'''
out = prompt.parse_and_validate(raw)
assert out['complexity_score'] == '65', out['complexity_score']
assert out['is_tech_dominant'] is True
print('OK', out['complexity_label'])
"; cd - >/dev/null
```
Expected: prints `OK Moderate` (confirms fence-stripping, key validation, and score-to-string coercion).

- [ ] **Step 4: Commit**

```bash
git add infrastructure/lambda/build-brief/prompt.py
git commit -m "Add Build Brief prompt builder + response validation"
```

---

## Task 3: Resolver app (`app.py`)

**Files:**
- Create: `infrastructure/lambda/build-brief/app.py`

- [ ] **Step 1: Create `app.py`**

```python
"""Build Brief routes — generate + fetch the Pro Build Brief for a report.

Behind the existing API Gateway + authorizer:
  GET  /api/reports/{report_id}/build-brief  -> stored brief or nulls
  POST /api/reports/{report_id}/build-brief  -> generate-once, store, return

Paid-gated (pro/max/admin). Report must be complete (result_json present).
POST is idempotent: a stored brief is returned instead of re-generating."""
from __future__ import annotations

import os
import re
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.utilities.typing import LambdaContext

import llm
import prompt as prompt_mod

logger = Logger()
tracer = Tracer()
metrics = Metrics()
app = APIGatewayRestResolver(strip_prefixes=["/api"])

_REPORT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,80}$")
_PAID_PLANS = {"pro", "max", "admin"}

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["REPORTS_TABLE"])
MODEL_ID = os.environ["BEDROCK_MODEL_ID_BUILD_BRIEF"]


def _auth() -> dict:
    raw = app.current_event.raw_event
    authorizer = raw.get("requestContext", {}).get("authorizer", {}) or {}
    return {
        "user_id": authorizer.get("user_id", "anonymous"),
        "org_id": authorizer.get("org_id", "anonymous"),
        "is_authenticated": authorizer.get("is_authenticated", "false") == "true",
        "plan": authorizer.get("plan", "free"),
    }


def _fresh_plan(user_id: str, fallback: str) -> str:
    """Resolve plan from the USER# row; the authorizer plan can be ~5min stale."""
    try:
        row = (
            table.get_item(
                Key={"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"},
                ConsistentRead=True,
                ProjectionExpression="#p",
                ExpressionAttributeNames={"#p": "plan"},
            ).get("Item")
            or {}
        )
        return row.get("plan") or fallback
    except ClientError:
        return fallback


def _get_report(org_id: str, report_id: str) -> dict | None:
    item = table.get_item(
        Key={"pk": f"ORG#{org_id}#REPORT#{report_id}", "sk": f"REPORT#{report_id}"}
    ).get("Item")
    if not item or item.get("status") == "deleted":
        return None
    return item


def _gate(report_id: str):
    """Shared precondition checks. Returns (auth, error_tuple). error_tuple is
    None when the caller is an authenticated paid user."""
    if not _REPORT_ID_RE.match(report_id):
        return None, ({"error": "Invalid report_id"}, 400)
    auth = _auth()
    if not auth["is_authenticated"]:
        return auth, ({"error": "Authentication required"}, 401)
    if _fresh_plan(auth["user_id"], auth["plan"]) not in _PAID_PLANS:
        return auth, ({"error": "Build Brief is a Pro feature", "code": "upgrade_required"}, 403)
    return auth, None


@app.get("/reports/<report_id>/build-brief")
@tracer.capture_method
def get_brief(report_id: str):
    auth, err = _gate(report_id)
    if err:
        return err
    report = _get_report(auth["org_id"], report_id)
    if report is None:
        return {"error": "Report not found"}, 404
    return {
        "build_brief_json": report.get("build_brief_json"),
        "build_brief_generated_at": report.get("build_brief_generated_at"),
    }


@app.post("/reports/<report_id>/build-brief")
@tracer.capture_method
def generate_brief(report_id: str):
    auth, err = _gate(report_id)
    if err:
        return err
    report = _get_report(auth["org_id"], report_id)
    if report is None:
        return {"error": "Report not found"}, 404

    # Idempotent — never re-spend on a brief we already have.
    if report.get("build_brief_json"):
        return {
            "build_brief_json": report["build_brief_json"],
            "build_brief_generated_at": report.get("build_brief_generated_at"),
        }

    result_json = report.get("result_json")
    if report.get("status") != "complete" or not result_json:
        return {"error": "Report is not complete yet", "code": "not_ready"}, 409

    try:
        raw = llm.call_llm(
            prompt_mod.build_prompt(report.get("idea_text", ""), result_json),
            model_id=MODEL_ID,
        )
        brief_json = prompt_mod.parse_and_validate(raw)
    except Exception as e:
        logger.exception(
            "Build Brief generation failed",
            extra={"report_id": report_id, "error": str(e)},
        )
        return {"error": "Could not generate the brief. Try again."}, 502

    generated_at = datetime.now(timezone.utc).isoformat()
    try:
        table.update_item(
            Key={
                "pk": f"ORG#{auth['org_id']}#REPORT#{report_id}",
                "sk": f"REPORT#{report_id}",
            },
            UpdateExpression="SET build_brief_json = :b, build_brief_generated_at = :t",
            ConditionExpression="attribute_exists(pk)",
            ExpressionAttributeValues={":b": brief_json, ":t": generated_at},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return {"error": "Report not found"}, 404
        raise

    logger.info("Build Brief generated", extra={"report_id": report_id})
    return {"build_brief_json": brief_json, "build_brief_generated_at": generated_at}


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
```

- [ ] **Step 2: Verify syntax**

Run: `python3 -m py_compile infrastructure/lambda/build-brief/app.py`
Expected: no output (exit 0). (Powertools imports resolve via the layer at build/deploy; `py_compile` only checks syntax, so a missing-import warning at runtime is not surfaced here — Task 5's `sam build` is the real import check.)

- [ ] **Step 3: Commit**

```bash
git add infrastructure/lambda/build-brief/app.py
git commit -m "Add Build Brief resolver (GET/POST routes)"
```

---

## Task 4: SAM template wiring

**Files:**
- Modify: `template.yaml` (Parameters; Resources: add `BuildBriefFunction` + `BuildBriefFunctionLogGroup`)

- [ ] **Step 1: Add the model parameter**

In `template.yaml`, immediately after the `BedrockModelIdMuseChat` parameter block (ends at line ~31, the `Default: us.amazon.nova-2-lite-v1:0` line), add:

```yaml
  BedrockModelIdBuildBrief:
    Type: String
    Default: anthropic.claude-3-haiku-20240307-v1:0
    Description: >-
      Bedrock model for Build Brief generation (Pro). Bare foundation-model ID,
      invoked on-demand (no inference profile). Matches the live report pipeline.
```

- [ ] **Step 2: Add the function + log group**

In `template.yaml`, immediately after the `MuseSyncFunctionLogGroup` resource (ends at line ~1049, `RetentionInDays: 90`) and before the `# ─── Lambda: Muse Chat ───` comment, add:

```yaml
  # ─── Lambda: Build Brief (Pro) — synchronous generate + fetch ───
  BuildBriefFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: app.lambda_handler
      CodeUri: infrastructure/lambda/build-brief/
      Description: Build Brief — GET/POST /api/reports/{report_id}/build-brief (Pro)
      MemorySize: 512
      # API Gateway integration caps at 29s; match it so the Lambda dies with
      # the request rather than storing a brief after the client already 504'd.
      Timeout: 29
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref ReportsTable
        - Statement:
            - Effect: Allow
              Action: bedrock:InvokeModel
              Resource: !Sub "arn:aws:bedrock:${AWS::Region}::foundation-model/${BedrockModelIdBuildBrief}"
      Environment:
        Variables:
          REPORTS_TABLE: !Ref ReportsTable
          BEDROCK_MODEL_ID_BUILD_BRIEF: !Ref BedrockModelIdBuildBrief
          POWERTOOLS_SERVICE_NAME: build-brief
      Events:
        GetBrief:
          Type: Api
          Properties:
            Path: /api/reports/{report_id}/build-brief
            Method: GET
            RestApiId: !Ref ApiGatewayApi
        GenerateBrief:
          Type: Api
          Properties:
            Path: /api/reports/{report_id}/build-brief
            Method: POST
            RestApiId: !Ref ApiGatewayApi

  BuildBriefFunctionLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${BuildBriefFunction}
      RetentionInDays: 90
```

(No `Runtime`/`Layers` block — like `MuseSyncFunction`, these inherit from `Globals.Function`, which provides the runtime and the Powertools layer. No explicit `Authorizer` — the route inherits the API's default authorizer that injects `requestContext.authorizer`.)

- [ ] **Step 3: Verify the template builds**

Run: `sam build BuildBriefFunction`
Expected: `Build Succeeded`. (This resolves Powertools imports + packages the dir; it's the real check that `app.py`/`llm.py`/`prompt.py` import cleanly.)

If `sam build BuildBriefFunction` rejects the single-resource arg on this SAM version, run `sam build` (whole stack) instead.

- [ ] **Step 4: Commit**

```bash
git add template.yaml
git commit -m "Wire BuildBriefFunction + model param into SAM template"
```

---

## Task 5: Deploy + exercise (manual verification)

**Files:** none (verification only).

- [ ] **Step 1: Full build**

Run: `sam build`
Expected: `Build Succeeded` for all functions including `BuildBriefFunction`.

- [ ] **Step 2: Deploy to dev**

Run: `sam deploy`
Expected: changeset creates `BuildBriefFunction`, `BuildBriefFunctionLogGroup`, the new parameter, and two API methods. **Confirm the changeset does NOT modify `BedrockModelIdParse/Analyse/Summarise/MuseChat`** — `samconfig.toml` doesn't pass them, so CloudFormation keeps their live values. The new `BedrockModelIdBuildBrief` takes its default (`anthropic.claude-3-haiku-...`).

- [ ] **Step 3: Exercise against a completed report**

Use a Pro/Max/admin account. With the report open in the app (`VITE_USE_MOCK` unset/false), the Build Brief tab's **Generate** CTA should: POST → ~few-second skeleton → rendered brief. Re-open the tab → instant from storage (GET). Confirm in CloudWatch (`/aws/lambda/<BuildBriefFunction>`) a single `Build Brief generated` log per first generation, none on re-open.

- [ ] **Step 4: Spot-check the gates** (optional, via browser devtools or curl with the auth cookie)
  - Free account → `POST` returns `403` `{code: "upgrade_required"}`.
  - A report still `pending`/`running` → `POST` returns `409` `{code: "not_ready"}`.
  - Second `POST` after success → returns the stored brief (same `build_brief_generated_at`), no new generation log.

No commit (verification only).

---

## Task 6: Frontend — remove the cut regenerate path

**Files:**
- Modify: `frontend/src/hooks/useBuildBrief.ts`
- Modify: `frontend/src/components/BuildBrief.tsx`

- [ ] **Step 1: `useBuildBrief.ts` — drop `capReached` from the result type**

Remove these lines from the `UseBuildBriefResult` interface:

```ts
  /** True when a regenerate hit the soft daily cap (429). The prior brief, if any, stays visible. */
  capReached: boolean;
```

- [ ] **Step 2: `useBuildBrief.ts` — drop the `capReached` state**

Remove this line (after the `error` state):

```ts
  const [capReached, setCapReached] = useState(false);
```

- [ ] **Step 3: `useBuildBrief.ts` — drop the two `setCapReached(false)` resets**

In the hydrate effect, change:

```ts
    setError(null);
    setCapReached(false);
    setBrief(null);
```
to:
```ts
    setError(null);
    setBrief(null);
```

In `generate`, change:

```ts
    setError(null);
    setCapReached(false);
    setStatus('generating');
```
to:
```ts
    setError(null);
    setStatus('generating');
```

- [ ] **Step 4: `useBuildBrief.ts` — remove the 429 branch and `brief` dep**

Replace this catch block in `generate`:

```ts
      } catch (e) {
        if (generationRef.current !== gen) return;
        if (e instanceof ApiError && e.status === 429) {
          // Soft daily cap — keep any prior brief visible, surface calmly.
          setCapReached(true);
          setStatus(brief ? 'ready' : 'idle');
          return;
        }
        setStatus('error');
        const msg =
          e instanceof ApiError && e.message
            ? e.message
            : "Couldn't generate the brief. Try again.";
        setError(msg);
      }
    })();
  }, [reportId, paid, brief]);
```

with:

```ts
      } catch (e) {
        if (generationRef.current !== gen) return;
        setStatus('error');
        const msg =
          e instanceof ApiError && e.message
            ? e.message
            : "Couldn't generate the brief. Try again.";
        setError(msg);
      }
    })();
  }, [reportId, paid]);
```

- [ ] **Step 5: `useBuildBrief.ts` — drop `capReached` from the return**

Change:

```ts
  return { status, brief, generatedAt, error, capReached, generate, dismissError };
```
to:
```ts
  return { status, brief, generatedAt, error, generate, dismissError };
```

- [ ] **Step 6: `BuildBrief.tsx` — drop `RefreshCw` from the lucide import**

Change line 2:

```ts
import { Blocks, Check, Copy, Lock, RefreshCw } from 'lucide-react';
```
to:
```ts
import { Blocks, Check, Copy, Lock } from 'lucide-react';
```

- [ ] **Step 7: `BuildBrief.tsx` — drop `capReached`/`onRegenerate` from `BriefBody` props**

Change:

```ts
function BriefBody({
  brief,
  idea,
  generatedAt,
  capReached,
  onRegenerate,
}: {
  brief: BuildBrief;
  idea: string;
  generatedAt: string | null;
  capReached: boolean;
  onRegenerate: () => void;
}) {
```
to:
```ts
function BriefBody({
  brief,
  idea,
  generatedAt,
}: {
  brief: BuildBrief;
  idea: string;
  generatedAt: string | null;
}) {
```

- [ ] **Step 8: `BuildBrief.tsx` — remove the regenerate button + cap message**

Replace the action row + cap block (the `bb-actions-group` through the `capReached` block):

```tsx
        <div className="bb-actions-group">
          <button type="button" className="bb-action-btn" onClick={copyMarkdown}>
            {copied ? (
              <>
                <Check size={12} strokeWidth={2} aria-hidden />
                copied
              </>
            ) : (
              <>
                <Copy size={12} strokeWidth={2} aria-hidden />
                copy as markdown
              </>
            )}
          </button>
          <span className="bb-actions-dot" aria-hidden>
            ·
          </span>
          <button type="button" className="bb-action-btn" onClick={onRegenerate}>
            <RefreshCw size={12} strokeWidth={2} aria-hidden />
            regenerate
          </button>
        </div>
        {generatedAt && (
          <span className="bb-generated">Generated {formatGeneratedAt(generatedAt)}</span>
        )}
      </div>

      {capReached && (
        <div className="bb-cap-msg" role="status">
          You have reached today's regenerate limit. Try again tomorrow.
        </div>
      )}
    </div>
```

with:

```tsx
        <div className="bb-actions-group">
          <button type="button" className="bb-action-btn" onClick={copyMarkdown}>
            {copied ? (
              <>
                <Check size={12} strokeWidth={2} aria-hidden />
                copied
              </>
            ) : (
              <>
                <Copy size={12} strokeWidth={2} aria-hidden />
                copy as markdown
              </>
            )}
          </button>
        </div>
        {generatedAt && (
          <span className="bb-generated">Generated {formatGeneratedAt(generatedAt)}</span>
        )}
      </div>
    </div>
```

- [ ] **Step 9: `BuildBrief.tsx` — drop `capReached` from the pane destructure + `BriefBody` usage**

Change:

```ts
  const { status, brief, generatedAt, error, capReached, generate, dismissError } = buildBrief;
```
to:
```ts
  const { status, brief, generatedAt, error, generate, dismissError } = buildBrief;
```

And change the `BriefBody` element:

```tsx
        <BriefBody
          brief={brief}
          idea={idea}
          generatedAt={generatedAt}
          capReached={capReached}
          onRegenerate={generate}
        />
```
to:
```tsx
        <BriefBody
          brief={brief}
          idea={idea}
          generatedAt={generatedAt}
        />
```

- [ ] **Step 10: Remove the now-dead `.bb-actions-dot` / `.bb-cap-msg` CSS if present**

Run: `grep -n "bb-actions-dot\|bb-cap-msg" frontend/src/index.css`
If either rule exists, delete that rule block. If `grep` finds nothing, skip.

- [ ] **Step 11: Verify build + lint**

Run: `cd frontend && bun run build && bun run lint`
Expected: build succeeds (the >500 kB chunk warning is fine), lint clean (0 errors). `RefreshCw` is gone, no unused-var or missing-prop errors.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/hooks/useBuildBrief.ts frontend/src/components/BuildBrief.tsx frontend/src/index.css
git commit -m "Remove cut Build Brief regenerate + dead daily-cap path"
```

> **Markdown export note:** the brief already exposes **copy as markdown** (`buildBriefMarkdown` → clipboard) in this bottom action row, matching the report's bottom-of-view export placement. Per the spec this is retained as-is — no new download is added. If true file-download parity with the report is wanted later, it's a small follow-up (extract `downloadBlob` from `ReportView.tsx` into a shared helper and add an "Export markdown" button here).

---

## Task 7: Docs — drop "regenerate" from the design records

**Files:**
- Modify: `frontend/.interface-design/system.md`
- Modify: `CLAUDE.md` (only if it references brief regenerate)

- [ ] **Step 1: Fix `system.md`**

In `frontend/.interface-design/system.md`, find the Build Brief "Ready" description action row:

```
and an action row (`copy as markdown · regenerate`).
```
Change to:
```
and an action row (`copy as markdown`).
```

- [ ] **Step 2: Check + fix `CLAUDE.md`**

Run: `grep -n "regenerate" CLAUDE.md`
If a Build-Brief line mentions regenerate (e.g. an action row), edit just that phrase to drop "regenerate". If `grep` finds no Build-Brief regenerate reference, skip the `CLAUDE.md` edit.

- [ ] **Step 3: Commit**

`system.md` has no pending edits — stage it directly. `CLAUDE.md` carries an unrelated pending edit, so stage only the Build-Brief hunk:

```bash
git add frontend/.interface-design/system.md
git add -p CLAUDE.md   # only if Step 2 made an edit; select just the Build-Brief hunk
git commit -m "Docs: Build Brief action row drops regenerate"
```

---

## Self-review (completed during planning)

- **Spec coverage:**
  - Routes/contract (GET+POST, nulls when ungenerated) → Task 3 `get_brief`/`generate_brief`. ✓
  - Paid gate (`pro`/`max`/`admin`, fresh plan) → Task 3 `_gate` + `_fresh_plan`. ✓
  - `409` when report not complete → Task 3. ✓ `404` ownership (org-scoped key) → Task 3 `_get_report`. ✓
  - Idempotent POST (return stored, no re-spend) → Task 3. ✓
  - Single Bedrock pass, provider-aware, retry/backoff → Task 1 `llm.call_llm`. ✓
  - Parse/validate, `502` on malformed → Task 2 + Task 3 except→502. ✓
  - Storage `build_brief_json` + `build_brief_generated_at` on report item → Task 3 `update_item`. ✓
  - Dedicated `BuildBriefFunction`, Bedrock IAM scoped to bare FM ARN, DynamoDB CRUD on Reports → Task 4. ✓
  - Model = `anthropic.claude-3-haiku-20240307-v1:0`, samconfig untouched → Task 4 param + Task 5 deploy check. ✓
  - No regenerate, no cap (frontend cleanup) → Task 6. ✓ Docs → Task 7. ✓
  - Markdown export consistency → Task 6 note (existing copy-as-markdown retained, per spec). ✓
- **Placeholder scan:** none — every step has exact code/commands.
- **Type/name consistency:** `BEDROCK_MODEL_ID_BUILD_BRIEF` env ↔ `os.environ` (app.py) ↔ template `Environment`; `REPORTS_TABLE` ↔ template; `call_llm(prompt, model_id, ...)` ↔ app.py call; `build_prompt(idea_text, result_json)` / `parse_and_validate(raw_text)` ↔ app.py imports `prompt as prompt_mod`; response keys `build_brief_json` / `build_brief_generated_at` ↔ frontend `BuildBriefResponse`. ✓
- **DynamoDB float guard:** `parse_and_validate` round-trips with `parse_float=Decimal`; `complexity_score` coerced to string. ✓
