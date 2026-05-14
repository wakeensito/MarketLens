# Security Findings & Remediations

Audit conducted: 2026-05-03. Scope: auth system, Lambda Authorizer, BFF Lambda, API Lambda, SAM template.

---

## VULN-01 — Authorizer wrong `token_use` returned Allow ✅ Fixed

**Severity:** High  
**File:** `infrastructure/lambda/authorizer/app.py`

**Issue:** When a token passed JWT signature verification but had `token_use != "access"` (e.g., an ID token), the authorizer returned an `Allow` policy with `is_authenticated: "false"`. The request reached downstream Lambdas.

**Fix:** Changed `"Allow"` → `"Deny"` on the wrong `token_use` branch. Only tokens with `token_use == "access"` may receive an Allow.

---

## VULN-02 — Authorizer user-not-found returned Allow ✅ Fixed

**Severity:** High  
**File:** `infrastructure/lambda/authorizer/app.py`

**Issue:** When the JWT was valid but the user record didn't exist in DynamoDB, the authorizer returned `Allow` with `is_authenticated: "false"` and `org_id: "anonymous"`. A Cognito user deleted from DynamoDB could pass the authorizer gate.

**Fix:** Changed `"Allow"` → `"Deny"` when the user record is not found.

---

## VULN-03 — Authorizer DynamoDB error returned Allow ✅ Fixed

**Severity:** High  
**File:** `infrastructure/lambda/authorizer/app.py`

**Issue:** When the DynamoDB `get_item` call threw (throttle, transient error), the exception handler returned `Allow` — a fail-open on infrastructure error. Any valid JWT holder would pass the authorizer with degraded `org_id: "anonymous"` context during a DynamoDB outage.

**Fix:** Changed `"Allow"` → `"Deny"` in the DynamoDB exception handler. The authorizer now fails closed.

**Rule going forward:** The authorizer returns `Allow` only when it has both a valid JWT and a found user record. Every other code path is `Deny`. See `CLAUDE.md` § Security Rules — Lambda Authorizer.

---

## VULN-04 — Cognito client secret stored as plaintext Lambda env var ✅ Fixed

**Severity:** High  
**Files:** `template.yaml`, `infrastructure/lambda/bff/app.py`

**Issue:** `COGNITO_CLIENT_SECRET: !GetAtt CognitoUserPoolClient.ClientSecret` injected the secret directly into the Lambda environment. Lambda env vars are visible in plaintext in the AWS Console to anyone with `lambda:GetFunctionConfiguration`, and appear in CloudFormation stack state.

**Fix:**
- `template.yaml`: replaced the direct env var with `COGNITO_CLIENT_SECRET_PARAM: /marketlens/<stage>/cognito-client-secret` and added a scoped `ssm:GetParameter` IAM permission.
- `bff/app.py`: added `_get_client_secret()` helper that lazy-loads from SSM SecureString and caches the value in the Lambda execution context.

**Action required after deploy:** Populate the SSM parameter once (it cannot be auto-populated because CloudFormation cannot write SecureString from a resource attribute):

```bash
# Get the generated client secret from Cognito
CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id <YOUR_POOL_ID> \
  --client-id <YOUR_CLIENT_ID> \
  --query UserPoolClient.ClientSecret \
  --output text)

# Store it as a SecureString
aws ssm put-parameter \
  --name /marketlens/prod/cognito-client-secret \
  --type SecureString \
  --value "$CLIENT_SECRET" \
  --overwrite
```

The BFF Lambda will fail on cold start until this parameter exists.

---

## VULN-05 — Eventually-consistent fallback read after concurrent user creation ✅ Fixed

**Severity:** Medium  
**File:** `infrastructure/lambda/bff/app.py`

**Issue:** In `_ensure_user_record`, after a `TransactionCanceledException` (concurrent login won the race), the fallback `get_item` used the default eventually-consistent read. Under high concurrency, DynamoDB's eventual consistency can cause this read to miss the item just written by the winning transaction, causing an unhandled exception that surfaces as a 500 to the user — even though their OTP was correct.

**Fix:** Added `ConsistentRead=True` to the fallback `get_item` call.

**Rule going forward:** Any `get_item` that is the recovery path after a failed conditional write must use `ConsistentRead=True`. See `CLAUDE.md` § Security Rules — DynamoDB Consistency.

---

## VULN-06 — Wildcard Secrets Manager ARN in AI orchestration IAM policy ⚠️ Needs audit

**Severity:** Medium  
**File:** `template.yaml` — `AiOrchestrationFunction` policies

**Issue:** The AI orchestration Lambda has `secretsmanager:GetSecretValue` on `arn:...:secret:marketlens/${Stage}/*`. Any new secret added under that prefix is automatically accessible to this Lambda without an explicit IAM change.

**Status:** Not yet fixed — the AI orchestration Lambda's exact Secrets Manager usage was not fully audited. The wildcard is scoped to the `marketlens/${Stage}/` prefix, which limits blast radius.

**Action required:** Audit `infrastructure/lambda/ai-orchestration/app.py` to identify every Secrets Manager secret it reads, then replace the wildcard with specific ARNs. Per `CLAUDE.md` § IAM & Least Privilege, never use wildcard resources in IAM statements.

---

## Non-findings

| Item | Reason cleared |
|---|---|
| CORS `AllowOrigin: '*'` on API GW | Paired with `AllowCredentials: false` — cookies cannot be sent cross-origin. API key provides real access control. |
| No CSRF tokens on `/auth/refresh` and `/auth/logout` | Both `ml_refresh` and `ml_access` cookies are `SameSite=Strict`, which prevents cross-site inclusion. |
| OTP length check before `hmac.compare_digest` | Both codes are always 6 digits. Early-exit on length mismatch leaks no useful timing information. |
| `auth_error` URL param reflected in frontend | Rendered inside a React text node — React auto-escapes the value, no XSS path. |
