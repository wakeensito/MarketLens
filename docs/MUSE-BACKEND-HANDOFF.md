# Muse Backend — Handoff Contract

> **Audience:** the backend Claude session implementing Muse.
> **Author:** the frontend lane Claude (UI/UX only — does not touch `template.yaml`, `infrastructure/lambda/`, `infra/`, or `samconfig.toml`).
> **Goal:** give you everything you need in one file so the backend can be built without ambiguity.

## Stack guardrail (non-negotiable)

**This repo is Python + AWS SAM** (`template.yaml`, `sam build` / `sam deploy`). New Muse Lambdas live under `infrastructure/lambda/` with the same style as `api/`, `ai-orchestration/`, etc.

General-purpose **AWS Lambda** or **serverless deployment** guidance often defaults to **TypeScript + CDK** when the stack is unspecified. **Ignore that here.** Do not introduce CDK or Node Lambdas for Muse unless the project explicitly migrates. If an agent skill suggests TS/CDK snippets, translate the intent into **Python + SAM** to match this repository.

## Related references

- `docs/MUSE-IMPLEMENTATION-PLAN.md` — the original product/architecture plan. Treat as background; this handoff supersedes it on transport, contract, and frontend behavior.
- `docs/BEDROCK-MODEL-CONFIG.md` — report-pipeline Bedrock model IDs (Nova Micro / DeepSeek / Nova 2 Lite). Muse streaming uses **Nova 2 Lite** for chat; do not confuse with Parse’s Nova Micro.
- `docs/muse-streaming-architecture.drawio` — the AWS architecture diagram for this design.
- `CLAUDE.md` > **Muse** section — locked structural decisions and the IAM/secrets rules you must follow.
- `frontend/src/hooks/useMuse.ts`, `frontend/src/components/muse/MuseThread.tsx`, `frontend/src/components/muse/museTypes.ts` — the frontend that will consume this backend.

## TL;DR architecture

REST API Gateway buffers Lambda responses end-to-end, so it cannot deliver token streaming. The chosen route:

- **Streaming endpoint** (`POST /api/muse/stream`) → **Lambda Function URL** with `InvokeMode: RESPONSE_STREAM`, fronted by a new CloudFront behavior using OAC. Native SSE.
- **Sync endpoints** (`GET`/`DELETE /api/muse/conversations/{report_id}`) → the **existing REST API Gateway + cookie Authorizer**, no changes to that path.
- **Inference:** Bedrock `InvokeModelWithResponseStream`. Pro tier uses **Amazon Nova 2 Lite** (`amazon.nova-2-lite-v1:0`) as the Muse chat model. This is separate from the **report** pipeline in `docs/BEDROCK-MODEL-CONFIG.md`: **Nova Micro** (parse/search) + **DeepSeek V3.2** (analyse) + **Nova 2 Lite** (summarise only).
- **Persistence:** new DynamoDB table `MuseConversationsTable`. Existing `ReportsTable` is read-only from Muse.

## Endpoint contract

Base path: `/api/muse`. CloudFront forwards `/api/muse/stream*` to the Function URL origin; everything else under `/api/muse/*` falls through to the existing API Gateway origin.

| Method | Path | Auth | Origin | Description |
|---|---|---|---|---|
| POST | `/api/muse/stream` | cookie (verified inside Lambda) | Function URL | Send a turn, receive `text/event-stream`. |
| GET | `/api/muse/conversations/{report_id}` | cookie (existing Authorizer) | API Gateway | List thread for a report. |
| DELETE | `/api/muse/conversations/{report_id}` | cookie (existing Authorizer) | API Gateway | Delete a thread. |

### `POST /api/muse/stream`

Request body:

```json
{
  "report_id": "uuid",
  "message": "user prompt text",
  "conversation_id": "uuid | null"   // null = start new thread
}
```

Response: `Content-Type: text/event-stream`. The frontend reads this with `fetch` + `getReader()`. Three event types only:

```text
event: token
data: {"delta": "Sentence content "}

event: token
data: {"delta": "continues here."}

event: sentence_boundary
data: {}

event: token
data: {"delta": "Next sentence."}

event: sentence_boundary
data: {}

event: done
data: {
  "conversation_id": "uuid",
  "message_id": "uuid",
  "tokens_in": 1234,
  "tokens_out": 567,
  "sources": [
    { "kind": "inline", "target": "gap-2", "label": "Gap 2" },
    { "kind": "inline", "target": "competitor-3", "label": "Competitor 3" }
  ],
  "follow_ups": [
    "What's the cheapest entry path?",
    "Which competitor is closest to that gap?"
  ]
}
```

Notes:

- **Emit `sentence_boundary` after every sentence-final punctuation token** (`.`, `!`, `?`) that the model produces. The frontend uses this to drive a 60ms settle pause per the locked craft direction. Do not emit it inside parenthesized punctuation or mid-citation tokens.
- **`sources` and `follow_ups` go inside `event: done`**, not as separate event types. Decided to minimize the event surface area on the frontend.
- **Citation tokens in `delta` strings** use the format `[[target|Label]]` (e.g. `[[gap-2|Gap 2]]`). The frontend's `MuseThread.tsx` already parses this — keep the format.
- **Error path:** emit `event: error\ndata: {"code": "...", "message": "..."}\n\n` then close the stream. Codes the frontend will recognize: `limit_reached`, `report_not_found`, `auth_failed`, `model_error`, `timeout`.
- **Heartbeat:** if the model is slow to first token, emit `: keep-alive\n\n` (SSE comment line) every ~15s so CloudFront doesn't idle-disconnect.

### `GET /api/muse/conversations/{report_id}`

Returns the full thread for a report, ordered oldest-first. Used when the user opens a past report and Muse has prior conversation history.

```json
{
  "conversation_id": "uuid",
  "messages": [
    {
      "role": "user",
      "content": "What's the biggest market gap?",
      "created_at": "2026-05-12T14:23:01Z"
    },
    {
      "role": "assistant",
      "content": "The clearest gap is [[gap-2|Gap 2]]: ...",
      "created_at": "2026-05-12T14:23:08Z",
      "sources": [...],
      "follow_ups": [...],
      "tokens_in": 1234,
      "tokens_out": 567
    }
  ]
}
```

Empty thread: return `200` with `{"conversation_id": null, "messages": []}`. Never 404 on an empty thread — the frontend renders an empty state.

### `DELETE /api/muse/conversations/{report_id}`

Delete every row in the conversation for this report+user. Return `200` with `{"deleted": true}` regardless of whether a thread existed.

## DynamoDB schema — new table

Resource name: `MuseConversationsTable`. Table name pattern: `marketlens-muse-conversations-${Stage}`.

```yaml
MuseConversationsTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: !Sub marketlens-muse-conversations-${Stage}
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - AttributeName: pk
        AttributeType: S
      - AttributeName: sk
        AttributeType: S
      # GSI1 reserved for Max-tier cross-report memory (out of scope now, but
      # provisioning the keys up front avoids a table rebuild later).
      - AttributeName: gsi1pk
        AttributeType: S
      - AttributeName: gsi1sk
        AttributeType: S
    KeySchema:
      - AttributeName: pk
        KeyType: HASH
      - AttributeName: sk
        KeyType: RANGE
    GlobalSecondaryIndexes:
      - IndexName: gsi1
        KeySchema:
          - AttributeName: gsi1pk
            KeyType: HASH
          - AttributeName: gsi1sk
            KeyType: RANGE
        Projection:
          ProjectionType: ALL
    TimeToLiveSpecification:
      AttributeName: ttl
      Enabled: true
    SSESpecification:
      SSEEnabled: true
    PointInTimeRecoverySpecification:
      PointInTimeRecoveryEnabled: true
```

Item shape per message:

```python
{
  "pk":          f"REPORT#{report_id}",
  "sk":          f"MSG#{iso_timestamp}#{message_id}",
  "gsi1pk":      f"ORG#{org_id}",                 # for future cross-report memory
  "gsi1sk":      f"{iso_timestamp}#{report_id}",
  "conversation_id": "uuid",
  "message_id":  "uuid",
  "role":        "user" | "assistant",
  "content":     "...",                            # full text including citation tokens
  "sources":     [...],                            # only on assistant rows
  "follow_ups":  [...],                            # only on assistant rows
  "tokens_in":   1234,                             # only on assistant rows
  "tokens_out":  567,
  "model_id":    "amazon.nova-2-lite-v1:0",
  "created_at":  "ISO8601",
  "ttl":         <int | None>                      # see retention below
}
```

Retention (TTL on assistant + user rows):

- **Free** users: `now + 30 days` epoch seconds.
- **Pro** users: `None` (no TTL — kept indefinitely).
- **Max** users: `None` (Max is out of scope, but follow the same rule when it ships).

## Auth approach — shared module

Function URL `AuthType` only supports `NONE` or `AWS_IAM`; neither composes with the existing HttpOnly auth cookie. The Muse Stream Lambda **must verify the cookie JWT itself**. Since the existing `infrastructure/lambda/authorizer/app.py` already does this for the REST API path, extract the verification into a shared helper rather than duplicating:

**Suggested:** create `infrastructure/lambda/_shared/auth.py` exporting something like:

```python
def verify_session_cookie(cookie_header: str) -> AuthContext | None:
    """
    Returns AuthContext (user_id, org_id, plan, email) on valid JWT,
    or None if the cookie is missing/invalid/expired.
    Always-Deny on uncertainty — never raise, never return partial.
    """
```

Both the existing `authorizer/app.py` and the new `muse/app.py` import it. Caches Cognito JWKs at module scope (cold-start fetch, refresh on signature failure once).

Per CLAUDE.md > "Security Rules — Lambda Authorizer", **deny on any uncertainty**: missing cookie, JWT validation failure, user record not found, DynamoDB lookup throws, wrong `token_use`. All return `None` from `verify_session_cookie`.

## New AWS resources to add to `template.yaml`

Wire-by-wire what needs to land in the template:

### 1. New Lambda

```yaml
MuseStreamFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: app.handler
    CodeUri: infrastructure/lambda/muse/
    MemorySize: 1024              # bigger heap for Bedrock streaming buffers
    Timeout: 120                  # match CloudFront idle timeout ceiling
    FunctionUrlConfig:
      AuthType: NONE
      InvokeMode: RESPONSE_STREAM
      Cors:
        AllowOrigins:
          - !Sub https://${CognitoCallbackDomain}    # plinths.net in prod
        AllowMethods: [POST]
        AllowHeaders: [content-type, cookie]
        AllowCredentials: true
        MaxAge: 300
    Environment:
      Variables:
        MUSE_CONVERSATIONS_TABLE: !Ref MuseConversationsTable
        REPORTS_TABLE: !Ref ReportsTable
        COGNITO_USER_POOL_ID: !Ref CognitoUserPool
        COGNITO_CLIENT_ID: !Ref CognitoUserPoolClient
        CHAT_MODEL_ID: amazon.nova-2-lite-v1:0
    Policies:
      - DynamoDBCrudPolicy:
          TableName: !Ref MuseConversationsTable
      - DynamoDBReadPolicy:
          TableName: !Ref ReportsTable
      - Statement:
          - Effect: Allow
            Action: bedrock:InvokeModelWithResponseStream
            Resource: !Sub arn:aws:bedrock:${AWS::Region}::foundation-model/amazon.nova-2-lite-v1:0
```

Scoped IAM per CLAUDE.md: model ARN is **exact**, not wildcard. Same rule for the table policies.

### 2. Function URL → CloudFront integration

- Create an **Origin Access Control (OAC)** for Lambda Function URLs.
- Add a CloudFront origin pointing at `!GetAtt MuseStreamFunction.FunctionUrl` (parse domain via `!Select`/`!Split`).
- Add a behavior with `PathPattern: /api/muse/stream*` mapped to that origin:
  - `AllowedMethods: [POST, OPTIONS]`
  - `CachePolicyId`: managed `CachingDisabled` (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`)
  - `OriginRequestPolicyId`: managed `AllViewerExceptHostHeader` (`b689b0a8-53d0-40ab-baf2-68738e2966ac`) — forwards cookies.
  - `ResponseHeadersPolicyId`: managed `CORS-with-preflight-and-credentials` or a custom one allowing your origin.
- Grant CloudFront permission to invoke the Function URL via a `Lambda::Permission` resource:

```yaml
MuseStreamFunctionUrlPermission:
  Type: AWS::Lambda::Permission
  Properties:
    FunctionName: !Ref MuseStreamFunction
    Action: lambda:InvokeFunctionUrl
    Principal: cloudfront.amazonaws.com
    FunctionUrlAuthType: NONE
    SourceArn: !Sub arn:aws:cloudfront::${AWS::AccountId}:distribution/${CloudFrontDistribution}
```

**The new behavior's PathPattern must be ordered ABOVE the existing `/api/*` behavior** so CloudFront matches `/api/muse/stream*` first.

### 3. New sync-path Lambda (optional split)

You can either:

- **Option A:** add a second Lambda `MuseSyncFunction` for `GET`/`DELETE /api/muse/conversations/{report_id}`, mounted on the existing `ApiGatewayApi` with the cookie Authorizer — keeps streaming and sync deployments independent.
- **Option B:** add the sync routes to the existing `ApiFunction` (`infrastructure/lambda/api/`) — fewer Lambdas, one more route handler.

**Recommendation: Option A.** The streaming Lambda has a 1024MB / 120s footprint; the sync handlers don't need that. Keeping them separate also lets you iterate on the streaming surface without touching the rest of the REST API.

### 4. CORS on the existing API Gateway

The existing `ApiGatewayApi.Cors` already allows the `Cookie` header (verified — see `template.yaml:379`). No change needed for the sync routes.

## Frontend integration — what it expects from you

The frontend hook `useMuse` (`frontend/src/hooks/useMuse.ts`) currently uses a mock simulator. The backend swap will replace the inside of `sendMessage` with a real `fetch` against `/api/muse/stream`, parse SSE events, and call:

- `setStreamingText(partial)` for each `token` event.
- `queueTimer(..., 60)` after each `sentence_boundary` for the settle pause.
- `setThread(prev => prev.with(lastTurn, finalTurnWithSourcesAndFollowUps))` on `done`.

What this means for you:

1. **Citation tokens in the model output must be in the `[[target|Label]]` format** — the frontend parser at `MuseThread.tsx:33-78` is already wired for this. If you feed the model a system prompt instructing it to use this format when referencing report cells, the frontend will render them as tappable pills automatically.

   **Suggested system-prompt fragment for the chat model:**

   ```text
   When referencing the user's report, use citation tokens in the exact format
   [[target|Label]] inline in your prose. Allowed targets:
     - gap-{N}            (e.g. gap-2 for the second gap)
     - competitor-{N}     (e.g. competitor-3)
     - roadmap-phase-{N}  (e.g. roadmap-phase-1)
     - key-stat-{slug}    (e.g. key-stat-tam)
   Labels are short and human (e.g. "Gap 2", "Competitor 3", "Roadmap · Phase 1").
   ```

2. **Sources** in `event: done` are typed as:

   ```ts
   type MuseCitationKind = 'inline' | 'cross';
   interface MuseCitation {
     kind: MuseCitationKind;
     target: string;   // e.g. "gap-2"
     label: string;    // e.g. "Gap 2"
   }
   ```

   For Pro tier, always use `kind: "inline"`. Cross-report citations (`kind: "cross"`) are Max-tier only and out of scope for now.

3. **Follow-ups** are plain strings; frontend renders them as buttons that re-trigger `sendMessage` when clicked.

## Plan-tier behavior

Per CLAUDE.md > Plans:

- **Free:** Muse is **locked**. The Stream Lambda should reject Free-tier requests with `event: error\ndata: {"code": "plan_locked", "message": "Upgrade to Pro to chat with Muse."}\n\n` and close the stream. The frontend will show the upgrade prompt; do not bill any tokens.
- **Pro:** 30 messages per `report_id`. Count `role: "user"` rows in the conversation. On the 31st request, emit `event: error\ndata: {"code": "limit_reached", "message": "...", "limit": 30, "used": 30}\n\n` before any token is generated. The frontend will swap in the upgrade card.
- **Max:** out of scope. For now, treat Max identically to Pro (single default model = **Amazon Nova 2 Lite**, same as Pro Muse; no message cap — `limit_reached` never fires for Max users). The Max-tier features (cross-report memory, model selection across Claude/GPT/Gemini/Perplexity) are deliberately deferred and should not influence the v1 implementation.

The exact display pattern for the Pro limit on the frontend is **deferred** — see `docs/BACKLOG.md` > "Muse Pro limit indicator — display pattern" — but the backend contract for `limit_reached` is fixed.

## Things explicitly out of scope for v1

Do not build any of these — they're documented as decided-but-deferred:

1. **Max-tier model picker** (Claude / GPT / Gemini / Perplexity) — no third-party API integrations, no extra SSM params.
2. **Cross-report memory** (Max only). The `gsi1pk` / `gsi1sk` keys are provisioned in the table so adding it later doesn't require a rebuild, but no code paths should populate them yet (you can write them blank or just `ORG#{org_id}` — either is fine).
3. **Custom token-based caps.** The user is considering a token-cap pivot post-v1; for now, the cap is strictly 30 user messages per `report_id` for Pro.
4. **Conversation branching, regenerate-from-mid-thread, etc.** The `regenerate` action in the frontend hook just re-requests the latest assistant turn — backend can implement this as a fresh `POST /api/muse/stream` with the same `conversation_id` and a flag (`"regenerate_message_id": "<assistant_message_id>"`) in the body if you want clean semantics. Optional for v1.

## Validation checklist for the backend Claude

Before declaring done, walk through:

- [ ] `sam validate --lint` passes.
- [ ] `ruff format --check infrastructure/lambda/ scripts/` passes.
- [ ] New SSM parameters (if any) are populated manually post-deploy and documented somewhere. (None expected for v1 — the only secret is the model ID, which isn't a secret.)
- [ ] All IAM resources are exact ARNs, not `*` — Bedrock model ARN, DynamoDB table ARN, Reports table ARN.
- [ ] Function URL CORS `AllowOrigins` matches the production CloudFront domain — **not** `*`.
- [ ] CloudFront behavior precedence: `/api/muse/stream*` is ordered above `/api/*`.
- [ ] `cookie` header is forwarded on the streaming behavior (Origin Request Policy `AllViewerExceptHostHeader` does this).
- [ ] Heartbeat keep-alive emits at least every 15s if the model is slow.
- [ ] `event: error` with `plan_locked` fires for Free, `limit_reached` fires for Pro at >30 user messages.
- [ ] `event: done` payload includes `sources` and `follow_ups` (even if empty arrays).
- [ ] Conversations Lambda (sync path) is wired to the existing `CookieAuthorizer` on `ApiGatewayApi`, not a new authorizer.

## Quick sequence for implementation

Suggested order if you're starting from zero:

1. **Sync path first** — easier, no streaming surprises. Create `infrastructure/lambda/muse/sync.py` or extend `api/`. Wire `GET`/`DELETE /api/muse/conversations/{id}` to `MuseConversationsTable`. Validate against a hand-written test thread.
2. **Streaming Lambda skeleton** — handler that just emits a hardcoded `token` then `done`. Wire the Function URL + CloudFront behavior. Get the SSE plumbing right end-to-end before touching Bedrock.
3. **Bedrock streaming** — swap the hardcoded tokens for `invoke_model_with_response_stream` against **Amazon Nova 2 Lite** (`amazon.nova-2-lite-v1:0`; env `CHAT_MODEL_ID`). Confirm request/response JSON matches Bedrock docs for this model (same Nova family conventions as `ai-orchestration` unless AWS documents otherwise). Implement the sentence-boundary detector. Inject the report `result_json` from `ReportsTable` into the system prompt.
4. **Persistence** — write user + assistant rows after the stream completes. Don't try to write tokens incrementally; one batch write at end-of-stream is fine.
5. **Plan gates** — implement `plan_locked` (Free) and `limit_reached` (Pro) error paths.
6. **Polish** — heartbeat keep-alive, error handling for `report_not_found`, retry semantics on the frontend side (handled by the frontend Claude — not your concern).

## When you're done

Drop a line in this file or in `CLAUDE.md` confirming what got built so the frontend Claude knows to flip `useMuse` from mock-mode to real-fetch mode.
