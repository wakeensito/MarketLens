# Billing Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Plinths' Stripe billing correct: status-based entitlement defined once, transactional webhook dedup and ordering, intent-keyed checkout that cannot double-bill, and a frontend activation flow that watches the billing revision.

**Architecture:** Entitlement (`effective_plan`) lives in the shared `plinths_auth` layer and every gate calls it. The billing Lambda is split into `stripe_client.py` (SDK config, secrets, price→plan), `store.py` (DynamoDB reads and the single `TransactWriteItems` apply), `webhook.py` (event dispatch, install path, state path) and `app.py` (routes). Every subscription-state write refetches from Stripe and writes truth; the webhook payload is only a nudge.

**Tech Stack:** Python 3.13, aws-lambda-powertools (layer), stripe==12.1.0, boto3, pytest + moto for tests; React + TypeScript (Vite, bun) frontend; SAM template.

**Spec:** `docs/superpowers/specs/2026-09-11-billing-hardening-design.md`

## Global Constraints

- Branch `feat/billing-hardening`; commit after every task with the attribution trailer below; `git push` after each commit; no PR until the last task.
- Commit trailer (every commit): `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` then `Claude-Session: https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK`.
- Python: `ruff check` and `ruff format --check` clean on `infrastructure/lambda/ infrastructure/layers/`; mypy per Lambda dir with `--ignore-missing-imports --no-strict-optional` (that is what CI runs).
- Local Python is 3.14 with nothing installed; use `python3.13 -m venv .venv` at repo root (add `.venv/` to `.gitignore`). Install per-directory `requirements-dev.txt` into it.
- Attribute names on the user row are snake_case: `plan`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `billing_source_event_created`, `billing_revision`, `pending_intent_id`, `last_checkout_intent_id`, `entitlement_grace_until`, `cancel_at_period_end`, `current_period_end`, `plan_updated_at`.
- Processed-event marker: `pk = sk = "BILLING_EVENT#<event.id>"`, `ttl` epoch seconds, 72 h.
- `ENTITLED_STATUSES = {"active", "trialing"}`; "live" subscription = Stripe status not in `{"canceled", "incomplete_expired"}`.
- Grace window env `GRACE_WINDOW_SECONDS` default `604800`. Livemode env `STRIPE_LIVEMODE` `"true"|"false"`.
- Webhook never returns 5xx for a user-data problem (orphan, stale, duplicate) — only for Stripe/DynamoDB infrastructure failures, so Stripe retries those and only those.
- Webhook logs carry `event_id`, `event_type`, `user_id`, `subscription_id`. Never the payload.
- Frontend: no new dependencies. `sessionStorage` keys `plinths.checkout` and `plinths.portal`; every access wrapped in try/catch (existing convention, see `PENDING_QUERY_KEY` usage in `App.tsx`).
- No AWS account IDs or ARNs committed.

## File structure

| Path | Responsibility |
|---|---|
| `infrastructure/layers/plinths-auth-shared/python/plinths_auth/billing.py` | **Create.** `is_entitled`, `effective_plan`, `ENTITLED_STATUSES`, `BILLING_ATTRS`, `BILLING_PROJECTION`. Pure functions, no AWS. |
| `infrastructure/layers/plinths-auth-shared/python/plinths_auth/__init__.py` | **Modify.** Lazy re-exports so importing `plinths_auth.billing` does not import PyJWT. |
| `infrastructure/layers/plinths-auth-shared/python/plinths_auth/cookie_jwt.py` | **Modify.** `AuthContext.plan` = effective plan. |
| `infrastructure/layers/plinths-auth-shared/tests/test_billing.py` | **Create.** Entitlement truth table. |
| `infrastructure/layers/plinths-auth-shared/requirements-dev.txt` | **Create.** pytest. |
| `infrastructure/lambda/{api,export,build-brief,bff}/app.py` | **Modify.** Plan reads go through `effective_plan`. |
| `infrastructure/lambda/billing/stripe_client.py` | **Create.** SDK timeouts/retries, SSM secrets, `plan_from_subscription`, `retrieve_subscription`, `user_id_from_customer`. |
| `infrastructure/lambda/billing/store.py` | **Create.** `get_user`, `set_pending_intent`, `apply_event` (marker + update in one transaction), `ApplyOutcome`. |
| `infrastructure/lambda/billing/webhook.py` | **Create.** `handle_event` → dispatch → `install_subscription` / `apply_subscription_state`. |
| `infrastructure/lambda/billing/app.py` | **Rewrite.** Routes only: checkout, portal, `GET /billing/me`, webhook entry (signature → parse → livemode → `handle_event`). |
| `infrastructure/lambda/billing/tests/{conftest.py,test_checkout.py,test_me.py,test_webhook_entry.py,test_install.py,test_state.py,test_store.py}` | **Create.** |
| `infrastructure/lambda/billing/requirements-dev.txt` | **Create.** pytest, moto, stripe, aws-lambda-powertools, boto3. |
| `template.yaml` | **Modify.** TTL on `ReportsTable`, `IsProd` condition, billing env, `GET /api/billing/me`, `PlinthsAuthLayer` on five more functions. |
| `frontend/src/api.ts` | **Modify.** `startBillingCheckout(plan, intentId)`, `getBillingMe()`, `BillingMeResponse`, `ApiError` 409 handling. |
| `frontend/src/hooks/useBilling.ts` | **Rewrite.** Intent minting, 409 → portal, revision/intent poll, portal-return refresh. |
| `frontend/src/App.tsx` | **Modify.** `?billing=success|cancelled|portal` dispatch. |
| `.github/workflows/ci.yml` | **Modify.** `python-test` job. |
| `docs/operations/SECURITY.md`, `CLAUDE.md` | **Modify.** Webhook endpoint rule; route table. |

---

### Task 1: Entitlement functions in the shared layer

**Files:**
- Create: `infrastructure/layers/plinths-auth-shared/python/plinths_auth/billing.py`
- Modify: `infrastructure/layers/plinths-auth-shared/python/plinths_auth/__init__.py`
- Create: `infrastructure/layers/plinths-auth-shared/requirements-dev.txt`
- Create: `infrastructure/layers/plinths-auth-shared/conftest.py`
- Create: `infrastructure/layers/plinths-auth-shared/tests/test_billing.py`
- Modify: `.gitignore` (add `.venv/`)

**Interfaces:**
- Produces: `plinths_auth.billing.is_entitled(row: dict, now: int) -> bool`; `effective_plan(row: dict, now: int | None = None) -> str`; `ENTITLED_STATUSES: frozenset[str]`; `BILLING_ATTRS: tuple[str, ...]`; `BILLING_PROJECTION: dict` (kwargs for `get_item`: `ProjectionExpression` + `ExpressionAttributeNames` because `plan` is a reserved word).

- [ ] **Step 1: Tooling**

```bash
cd /Users/wakeensito/Plinths
python3.13 -m venv .venv
printf '\n# Local Python venv\n.venv/\n' >> .gitignore
printf 'pytest==8.3.4\n' > infrastructure/layers/plinths-auth-shared/requirements-dev.txt
.venv/bin/pip install -q -r infrastructure/layers/plinths-auth-shared/requirements-dev.txt ruff mypy
```

- [ ] **Step 2: conftest so `plinths_auth` imports from `python/`**

`infrastructure/layers/plinths-auth-shared/conftest.py`:
```python
# conftest.py — makes `plinths_auth` importable from tests/ without installing the layer.
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent / "python"))
```

- [ ] **Step 3: Failing tests**

`infrastructure/layers/plinths-auth-shared/tests/test_billing.py`:
```python
import pytest

from plinths_auth.billing import BILLING_PROJECTION, effective_plan, is_entitled

NOW = 1_700_000_000


@pytest.mark.parametrize(
    "row,expected",
    [
        ({"plan": "pro", "subscription_status": "active"}, True),
        ({"plan": "pro", "subscription_status": "trialing"}, True),
        ({"plan": "pro", "subscription_status": "past_due", "entitlement_grace_until": NOW + 1}, True),
        ({"plan": "pro", "subscription_status": "past_due", "entitlement_grace_until": NOW}, False),
        ({"plan": "pro", "subscription_status": "past_due"}, False),
        ({"plan": "pro", "subscription_status": "paused"}, False),
        ({"plan": "pro", "subscription_status": "canceled"}, False),
        ({"plan": "pro", "subscription_status": "incomplete"}, False),
        ({"plan": "pro", "subscription_status": "unpaid"}, False),
        ({"plan": "pro"}, False),
        ({}, False),
    ],
)
def test_is_entitled(row, expected):
    assert is_entitled(row, NOW) is expected


@pytest.mark.parametrize(
    "row,expected",
    [
        ({}, "free"),
        ({"plan": "free"}, "free"),
        ({"plan": "admin"}, "admin"),
        ({"plan": "admin", "subscription_status": "canceled"}, "admin"),
        ({"plan": "pro"}, "free"),
        ({"plan": "max", "subscription_status": "active"}, "max"),
        ({"plan": "max", "subscription_status": "paused"}, "free"),
        ({"plan": "pro", "subscription_status": "past_due", "entitlement_grace_until": NOW + 5}, "pro"),
        ({"plan": "pro", "subscription_status": "past_due", "entitlement_grace_until": NOW - 5}, "free"),
    ],
)
def test_effective_plan(row, expected):
    assert effective_plan(row, NOW) == expected


def test_effective_plan_now_zero_is_not_treated_as_missing():
    row = {"plan": "pro", "subscription_status": "past_due", "entitlement_grace_until": 1}
    assert effective_plan(row, 0) == "pro"


def test_effective_plan_defaults_now_to_wall_clock():
    row = {"plan": "pro", "subscription_status": "past_due", "entitlement_grace_until": 1}
    assert effective_plan(row) == "free"


def test_decimal_grace_from_dynamodb():
    from decimal import Decimal

    row = {"plan": "pro", "subscription_status": "past_due", "entitlement_grace_until": Decimal(NOW + 1)}
    assert effective_plan(row, NOW) == "pro"


def test_projection_names_every_billing_attr():
    assert BILLING_PROJECTION["ProjectionExpression"] == "#p, subscription_status, entitlement_grace_until"
    assert BILLING_PROJECTION["ExpressionAttributeNames"] == {"#p": "plan"}
```

- [ ] **Step 4: Run, expect ImportError**

```bash
cd infrastructure/layers/plinths-auth-shared && ../../../.venv/bin/python -m pytest tests -q
```

- [ ] **Step 5: Implement**

`infrastructure/layers/plinths-auth-shared/python/plinths_auth/billing.py`:
```python
"""Entitlement — the one place that decides whether a plan is paid for.

`plan` records what Stripe says the price is. `subscription_status` records
whether it is being paid for. Every gate reads `effective_plan`, never `plan`.
Copies of this logic would drift, and the drift would be invisible until
someone was billed wrongly.
"""

from __future__ import annotations

import time

ENTITLED_STATUSES: frozenset[str] = frozenset({"active", "trialing"})

# Attributes a gate must project to call effective_plan().
BILLING_ATTRS: tuple[str, ...] = ("plan", "subscription_status", "entitlement_grace_until")

# `plan` is a DynamoDB reserved word, hence the alias.
BILLING_PROJECTION: dict = {
    "ProjectionExpression": "#p, subscription_status, entitlement_grace_until",
    "ExpressionAttributeNames": {"#p": "plan"},
}


def is_entitled(row: dict, now: int) -> bool:
    """True when the subscription on this row is paid for at `now`.

    Grace on past_due extends an entitlement; it never grants one — the
    grace deadline is only ever written on an entitled → past_due transition.
    """
    status = row.get("subscription_status")
    if status in ENTITLED_STATUSES:
        return True
    if status == "past_due":
        return int(row.get("entitlement_grace_until") or 0) > now
    return False


def effective_plan(row: dict, now: int | None = None) -> str:
    """The plan the gates should enforce.

    `free` and `admin` have no subscription and pass through. Any paid plan
    string with no entitled status reads as free — comps go through Stripe
    (coupon or trial), never a hand-set `plan`.
    """
    plan = row.get("plan") or "free"
    if plan in ("free", "admin"):
        return plan
    if now is None:
        now = int(time.time())
    return plan if is_entitled(row, now) else "free"
```

`infrastructure/layers/plinths-auth-shared/python/plinths_auth/__init__.py` (replace whole file):
```python
"""Plinths shared auth + entitlement.

`verify_session_cookie` is the single source of truth for "is this caller a
valid signed-in user?" (API Gateway authorizer and the Muse Stream Lambda).
`plinths_auth.billing.effective_plan` is the single source of truth for
"which plan do the gates enforce?" (every plan-gated Lambda).

Re-exports are lazy (PEP 562) so a Lambda that only needs `billing` does not
import PyJWT/cryptography at cold start.
"""

from __future__ import annotations

__all__ = ["AuthContext", "parse_cookie_header", "verify_session_cookie"]


def __getattr__(name: str):
    if name in __all__:
        from . import cookie_jwt

        return getattr(cookie_jwt, name)
    raise AttributeError(f"module 'plinths_auth' has no attribute {name!r}")
```

- [ ] **Step 6: Run tests, ruff, mypy**

```bash
cd infrastructure/layers/plinths-auth-shared && ../../../.venv/bin/python -m pytest tests -q
cd /Users/wakeensito/Plinths && .venv/bin/ruff check infrastructure/layers/ && .venv/bin/ruff format --check infrastructure/layers/ && .venv/bin/mypy infrastructure/layers/plinths-auth-shared/python --ignore-missing-imports --no-strict-optional
```
Expected: all pass. (`ruff format` may want a reformat of the parametrize lists; run `ruff format` and re-check.)

- [ ] **Step 7: Commit**

```bash
git add .gitignore infrastructure/layers/plinths-auth-shared
git commit -m "feat(auth-layer): effective_plan entitlement predicate

One function decides whether a paid plan is paid for; gates will call it
instead of reading plan directly. Lazy package re-exports keep PyJWT out
of Lambdas that only need billing.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK"
git push
```

---

### Task 2: Every gate reads the effective plan

**Files:**
- Modify: `infrastructure/layers/plinths-auth-shared/python/plinths_auth/cookie_jwt.py:155-160`
- Modify: `infrastructure/lambda/api/app.py:66-83` (create_report fresh read) and `:159-183` (`GET /me`)
- Modify: `infrastructure/lambda/export/app.py:98-124`
- Modify: `infrastructure/lambda/build-brief/app.py:66-79`
- Modify: `infrastructure/lambda/bff/app.py:686-703`
- Modify: `template.yaml` — add `PlinthsAuthLayer` to `ApiFunction`, `ExportFunction`, `BuildBriefFunction`, `BffAuthFunction`, `BillingFunction`

**Interfaces:**
- Consumes: `plinths_auth.billing.effective_plan`, `BILLING_PROJECTION`.

- [ ] **Step 1: cookie_jwt uses effective_plan**

In `cookie_jwt.py`, add after the existing imports:
```python
from .billing import effective_plan
```
and change the `AuthContext(...)` construction at the end of `verify_session_cookie`:
```python
    return AuthContext(
        user_id=sub,
        org_id=org_id,
        plan=effective_plan(user),
        email=user.get("email", ""),
    )
```
Update the `AuthContext.plan` docstring line (the dataclass at ~line 73) to read `plan: str  # effective plan — already accounts for subscription_status`.

- [ ] **Step 2: Layer test for the cookie path**

Append to `infrastructure/layers/plinths-auth-shared/tests/test_billing.py`:
```python
def test_auth_context_plan_is_effective(monkeypatch):
    """verify_session_cookie must hand gates the effective plan, not the raw one."""
    from plinths_auth import cookie_jwt

    class _Key:
        key = "k"

    class _Jwks:
        def get_signing_key_from_jwt(self, _):
            return _Key()

    class _Table:
        def get_item(self, **_):
            return {"Item": {"org_id": "o1", "plan": "pro", "subscription_status": "paused", "email": "e"}}

    monkeypatch.setattr(cookie_jwt, "_get_jwks_client", lambda: _Jwks())
    monkeypatch.setattr(cookie_jwt, "_get_table", lambda: _Table())
    monkeypatch.setattr(cookie_jwt, "_CLIENT_ID", "cid")
    monkeypatch.setattr(
        cookie_jwt.jwt,
        "decode",
        lambda *a, **k: {"token_use": "access", "client_id": "cid", "sub": "u1"},
    )
    ctx = cookie_jwt.verify_session_cookie("ml_access=tok")
    assert ctx is not None and ctx.plan == "free"
```
Run: `cd infrastructure/layers/plinths-auth-shared && ../../../.venv/bin/python -m pytest tests -q` → the new test fails before Step 1 is applied and passes after. (PyJWT is needed to import `cookie_jwt`: `.venv/bin/pip install -q -r infrastructure/layers/plinths-auth-shared/requirements.txt boto3`.)

- [ ] **Step 3: api/app.py**

Add import near the top (after the powertools imports):
```python
from plinths_auth.billing import BILLING_PROJECTION, effective_plan
```
Replace the fresh-read block in `create_report` (the `user_row = (table.get_item(...ProjectionExpression="#p"...` through `plan = user_row.get("plan") or plan`) with:
```python
    plan = auth.get("plan", "free")
    try:
        user_row = (
            table.get_item(
                Key={"pk": user_pk, "sk": user_pk},
                ConsistentRead=True,
                **BILLING_PROJECTION,
            ).get("Item")
            or {}
        )
        plan = effective_plan(user_row) if user_row else plan
    except ClientError as e:
        logger.warning(
            "Plan refresh failed; using authorizer snapshot", extra={"error": str(e)}
        )
```
In `get_me`, change the final return's plan line to `"plan": effective_plan(item),`.

- [ ] **Step 4: export/app.py**

Add `from plinths_auth.billing import BILLING_PROJECTION, effective_plan` to imports. In `_resolve_current_plan`, replace the `get_item(...)` kwargs `ProjectionExpression="#p", ExpressionAttributeNames={"#p": "plan"}` with `**BILLING_PROJECTION` and the return with `return effective_plan(item) if item else snapshot`.

- [ ] **Step 5: build-brief/app.py**

Same import. In `_fresh_plan`, replace the projection kwargs with `**BILLING_PROJECTION` and `return row.get("plan") or fallback` with `return effective_plan(row) if row else fallback`.

- [ ] **Step 6: bff/app.py**

Add `from plinths_auth.billing import effective_plan` to imports. In `GET /auth/me`'s returned user dict, `"plan": effective_plan(user),`.

- [ ] **Step 7: template.yaml — attach the layer**

For each of `ApiFunction`, `ExportFunction`, `BuildBriefFunction` (already has a `Layers:` block — add the line), `BffAuthFunction`, `BillingFunction`, add under `Properties:` (matching the existing `AuthorizerFunction` block at ~line 996):
```yaml
      Layers:
        # Powertools layer comes from Globals.Function.Layers (SAM appends
        # function-level Layers to the global list).
        - !Ref PlinthsAuthLayer
```

- [ ] **Step 8: Lint, type-check, validate**

```bash
.venv/bin/ruff check infrastructure/lambda/ && .venv/bin/ruff format --check infrastructure/lambda/
for d in api export build-brief bff; do .venv/bin/mypy infrastructure/lambda/$d --ignore-missing-imports --no-strict-optional; done
sam validate --lint
```

- [ ] **Step 9: Commit**

```bash
git add -A infrastructure template.yaml
git commit -m "feat(gates): every plan read goes through effective_plan

api, export, build-brief, bff and the cookie verifier now enforce the
entitled plan. subscription_status has teeth before the webhook writes it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK"
git push
```

---

### Task 3: Infra for billing

**Files:**
- Modify: `template.yaml` — `ReportsTable` (~line 478), new `Conditions:` block after `Parameters:`, `BillingFunction` env + events (~line 1390)

- [ ] **Step 1: TTL on ReportsTable**

After `GlobalSecondaryIndexes:` block of `ReportsTable`, add (mirroring the muse table):
```yaml
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true
```

- [ ] **Step 2: IsProd condition**

There is no `Conditions:` section. Add one directly before `Globals:`:
```yaml
Conditions:
  IsProd: !Equals [!Ref Stage, prod]
```

- [ ] **Step 3: Billing env + route**

In `BillingFunction.Environment.Variables` add:
```yaml
          STRIPE_LIVEMODE: !If [IsProd, "true", "false"]
          GRACE_WINDOW_SECONDS: "604800"
```
In `BillingFunction.Events` add:
```yaml
        BillingMe:
          Type: Api
          Properties:
            Path: /api/billing/me
            Method: GET
            RestApiId: !Ref ApiGatewayApi
```

- [ ] **Step 4: Validate and commit**

```bash
sam validate --lint
git add template.yaml
git commit -m "infra(billing): TTL for event markers, livemode + grace env, GET /api/billing/me

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK"
git push
```

---

### Task 4: Billing test scaffold + `stripe_client.py`

**Files:**
- Create: `infrastructure/lambda/billing/requirements-dev.txt`
- Create: `infrastructure/lambda/billing/conftest.py`
- Create: `infrastructure/lambda/billing/stripe_client.py`
- Create: `infrastructure/lambda/billing/tests/test_stripe_client.py`

**Interfaces:**
- Produces: `stripe_client.configure() -> None` (idempotent: api key from SSM, `max_network_retries=2`, 10 s timeout); `webhook_secret() -> str`; `plan_from_subscription(sub: dict) -> str` (`"free"` + metric `UnknownPriceId` on unknown price); `retrieve_subscription(sub_id: str) -> dict`; `user_id_from_customer(customer_id: str) -> str | None`; `subscription_id_from_invoice(invoice: dict) -> str | None`; `is_live(sub: dict) -> bool`.
- Produces (conftest fixtures): `env` (all billing env vars set, autouse), `ddb_table` (moto table `marketlens-reports-test` with pk/sk), `user_row(user_id="u1", **attrs)` factory that puts a USER# row, `stripe_stub` (monkeypatched `stripe.Subscription.retrieve` etc. backed by dicts), `signed_event(payload: dict) -> tuple[str, str]` returning `(body, stripe-signature header)`.

- [ ] **Step 1: dev requirements + install**

`infrastructure/lambda/billing/requirements-dev.txt`:
```
pytest==8.3.4
moto[dynamodb]==5.1.14
boto3==1.40.30
stripe==12.1.0
aws-lambda-powertools==3.22.0
```
Run: `.venv/bin/pip install -q -r infrastructure/lambda/billing/requirements-dev.txt`

- [ ] **Step 2: conftest**

`infrastructure/lambda/billing/conftest.py`:
```python
# conftest.py — billing Lambda tests. Env, moto DynamoDB, Stripe stubs, signed events.
import hashlib
import hmac
import json
import os
import pathlib
import sys
import time

import boto3
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
sys.path.insert(
    0, str(pathlib.Path(__file__).parents[2] / "layers" / "plinths-auth-shared" / "python")
)

WEBHOOK_SECRET = "whsec_test_secret"
PRICES = {
    "pro": "price_pro",
    "max": "price_max",
    "pro_annual": "price_pro_a",
    "max_annual": "price_max_a",
}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("APP_DOMAIN", "https://app.test")
    monkeypatch.setenv("REPORTS_TABLE", "marketlens-reports-test")
    monkeypatch.setenv("STRIPE_SECRET_KEY_PARAM", "/test/sk")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET_PARAM", "/test/whsec")
    monkeypatch.setenv("STRIPE_PRICE_ID_PRO", PRICES["pro"])
    monkeypatch.setenv("STRIPE_PRICE_ID_MAX", PRICES["max"])
    monkeypatch.setenv("STRIPE_PRICE_ID_PRO_ANNUAL", PRICES["pro_annual"])
    monkeypatch.setenv("STRIPE_PRICE_ID_MAX_ANNUAL", PRICES["max_annual"])
    monkeypatch.setenv("STRIPE_LIVEMODE", "false")
    monkeypatch.setenv("GRACE_WINDOW_SECONDS", "604800")
    monkeypatch.setenv("POWERTOOLS_METRICS_NAMESPACE", "test")
    monkeypatch.setenv("POWERTOOLS_SERVICE_NAME", "billing-test")


@pytest.fixture
def ddb_table(env):
    from moto import mock_aws

    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="us-east-1")
        table = ddb.create_table(
            TableName=os.environ["REPORTS_TABLE"],
            KeySchema=[
                {"AttributeName": "pk", "KeyType": "HASH"},
                {"AttributeName": "sk", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        yield table


@pytest.fixture
def user_row(ddb_table):
    def _put(user_id="u1", **attrs):
        item = {
            "pk": f"USER#{user_id}",
            "sk": f"USER#{user_id}",
            "user_id": user_id,
            "org_id": "org1",
            "email": f"{user_id}@test",
            "plan": "free",
        }
        item.update(attrs)
        ddb_table.put_item(Item=item)
        return item

    return _put


def get_user(ddb_table, user_id="u1"):
    return ddb_table.get_item(
        Key={"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"}, ConsistentRead=True
    ).get("Item") or {}


def make_subscription(sub_id="sub_1", status="active", price="price_pro", customer="cus_1", **extra):
    sub = {
        "id": sub_id,
        "object": "subscription",
        "status": status,
        "customer": customer,
        "livemode": False,
        "cancel_at_period_end": False,
        "current_period_end": 1_800_000_000,
        "items": {"data": [{"price": {"id": price}}]},
        "metadata": {"user_id": "u1", "intent_id": "intent-1"},
    }
    sub.update(extra)
    return sub


@pytest.fixture
def stripe_stub(monkeypatch):
    """Stripe API surface the Lambda touches, backed by plain dicts."""
    import stripe

    state = {"subscriptions": {}, "customers": {}, "cancelled": [], "sessions": [], "portal": []}

    def retrieve_sub(sub_id, **_):
        if sub_id not in state["subscriptions"]:
            raise stripe.error.InvalidRequestError("No such subscription", "id")
        return state["subscriptions"][sub_id]

    def cancel_sub(sub_id, **_):
        state["cancelled"].append(sub_id)
        state["subscriptions"][sub_id]["status"] = "canceled"
        return state["subscriptions"][sub_id]

    def retrieve_customer(cid, **_):
        return state["customers"].get(cid, {"id": cid, "metadata": {}})

    def create_customer(**kw):
        cid = f"cus_{len(state['customers']) + 1}"
        state["customers"][cid] = {"id": cid, "metadata": kw.get("metadata", {})}
        return type("C", (), {"id": cid})()

    def create_session(**kw):
        state["sessions"].append(kw)
        return type("S", (), {"id": f"cs_{len(state['sessions'])}", "url": "https://stripe.test/cs"})()

    def create_portal(**kw):
        state["portal"].append(kw)
        return type("P", (), {"url": "https://stripe.test/portal"})()

    monkeypatch.setattr(stripe.Subscription, "retrieve", staticmethod(retrieve_sub))
    monkeypatch.setattr(stripe.Subscription, "cancel", staticmethod(cancel_sub))
    monkeypatch.setattr(stripe.Customer, "retrieve", staticmethod(retrieve_customer))
    monkeypatch.setattr(stripe.Customer, "create", staticmethod(create_customer))
    monkeypatch.setattr(stripe.Customer, "delete", staticmethod(lambda *_a, **_k: None))
    monkeypatch.setattr(stripe.checkout.Session, "create", staticmethod(create_session))
    monkeypatch.setattr(stripe.billing_portal.Session, "create", staticmethod(create_portal))

    import stripe_client

    monkeypatch.setattr(stripe_client, "configure", lambda: None)
    monkeypatch.setattr(stripe_client, "webhook_secret", lambda: WEBHOOK_SECRET)
    return state


def sign(body: str, secret: str = WEBHOOK_SECRET, ts: int | None = None) -> str:
    ts = ts or int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


def make_event(event_type: str, obj: dict, event_id="evt_1", created=1_700_000_000, livemode=False):
    return {
        "id": event_id,
        "object": "event",
        "type": event_type,
        "created": created,
        "livemode": livemode,
        "api_version": "2025-04-30.basil",
        "data": {"object": obj},
    }


@pytest.fixture
def signed_event():
    def _make(payload: dict):
        body = json.dumps(payload)
        return body, sign(body)

    return _make


def api_event(method: str, path: str, body: str | None = None, headers: dict | None = None, auth: dict | None = None):
    """Minimal API Gateway REST proxy event for APIGatewayRestResolver."""
    ctx_auth = {"user_id": "u1", "org_id": "org1", "is_authenticated": "true", "plan": "free", "email": "u1@test"}
    if auth is not None:
        ctx_auth = auth
    return {
        "httpMethod": method,
        "path": path,
        "resource": path,
        "headers": {"content-type": "application/json", **(headers or {})},
        "multiValueHeaders": {},
        "queryStringParameters": None,
        "pathParameters": None,
        "body": body,
        "isBase64Encoded": False,
        "requestContext": {"authorizer": ctx_auth, "requestId": "r1", "stage": "test", "httpMethod": method, "path": path},
    }
```

- [ ] **Step 3: Failing tests for stripe_client**

`infrastructure/lambda/billing/tests/test_stripe_client.py`:
```python
from conftest import make_subscription


def test_plan_from_subscription_maps_monthly_and_annual_to_one_plan():
    import stripe_client

    assert stripe_client.plan_from_subscription(make_subscription(price="price_pro")) == "pro"
    assert stripe_client.plan_from_subscription(make_subscription(price="price_pro_a")) == "pro"
    assert stripe_client.plan_from_subscription(make_subscription(price="price_max")) == "max"
    assert stripe_client.plan_from_subscription(make_subscription(price="price_max_a")) == "max"


def test_unknown_price_fails_toward_free(monkeypatch):
    import stripe_client

    seen = []
    monkeypatch.setattr(stripe_client.metrics, "add_metric", lambda **kw: seen.append(kw["name"]))
    assert stripe_client.plan_from_subscription(make_subscription(price="price_zzz")) == "free"
    assert "UnknownPriceId" in seen


def test_no_items_is_free():
    import stripe_client

    assert stripe_client.plan_from_subscription({"items": {"data": []}}) == "free"


def test_is_live():
    import stripe_client

    assert stripe_client.is_live(make_subscription(status="active"))
    assert stripe_client.is_live(make_subscription(status="past_due"))
    assert stripe_client.is_live(make_subscription(status="incomplete"))
    assert not stripe_client.is_live(make_subscription(status="canceled"))
    assert not stripe_client.is_live(make_subscription(status="incomplete_expired"))


def test_subscription_id_from_invoice_both_api_shapes():
    import stripe_client

    assert stripe_client.subscription_id_from_invoice({"subscription": "sub_a"}) == "sub_a"
    assert (
        stripe_client.subscription_id_from_invoice(
            {"parent": {"subscription_details": {"subscription": "sub_b"}}}
        )
        == "sub_b"
    )
    assert stripe_client.subscription_id_from_invoice({}) is None


def test_user_id_from_customer_reads_metadata(stripe_stub):
    import stripe_client

    stripe_stub["customers"]["cus_9"] = {"id": "cus_9", "metadata": {"user_id": "u9"}}
    assert stripe_client.user_id_from_customer("cus_9") == "u9"
    assert stripe_client.user_id_from_customer("cus_none") is None


def test_configure_sets_timeouts(monkeypatch):
    import stripe
    import stripe_client

    monkeypatch.setattr(stripe_client, "_get_param", lambda name: "sk_test_x")
    stripe_client._configured = False
    stripe_client.configure()
    assert stripe.api_key == "sk_test_x"
    assert stripe.max_network_retries == 2
    assert stripe.default_http_client._timeout == 10
```

Run: `cd infrastructure/lambda/billing && ../../../.venv/bin/python -m pytest tests/test_stripe_client.py -q` → ImportError.

- [ ] **Step 4: Implement `stripe_client.py`**

```python
"""Stripe SDK configuration and the handful of calls the billing Lambda makes.

Everything that talks to Stripe or reads Stripe objects lives here so the
route and webhook code can be tested against dicts.
"""

from __future__ import annotations

import os

import boto3
import stripe
from aws_lambda_powertools import Logger, Metrics
from aws_lambda_powertools.metrics import MetricUnit

logger = Logger(child=True)
metrics = Metrics()

_PRICE_TO_PLAN: dict[str, str] = {}
for _env, _plan in (
    ("STRIPE_PRICE_ID_PRO", "pro"),
    ("STRIPE_PRICE_ID_PRO_ANNUAL", "pro"),
    ("STRIPE_PRICE_ID_MAX", "max"),
    ("STRIPE_PRICE_ID_MAX_ANNUAL", "max"),
):
    if os.environ.get(_env):
        _PRICE_TO_PLAN[os.environ[_env]] = _plan

NOT_LIVE_STATUSES = frozenset({"canceled", "incomplete_expired"})

_ssm = None
_configured = False
_webhook_secret: str | None = None


def _get_param(name: str) -> str:
    global _ssm
    if _ssm is None:
        _ssm = boto3.client("ssm")
    return _ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]


def configure() -> None:
    """Idempotent. API key from SSM; retries and a timeout that fits in the Lambda budget.

    The SDK default is 80 s per request. Three calls at that timeout blow the
    30 s Lambda timeout and leave the webhook returning nothing to Stripe.
    """
    global _configured
    if _configured:
        return
    stripe.api_key = _get_param(os.environ["STRIPE_SECRET_KEY_PARAM"])
    stripe.max_network_retries = 2
    stripe.default_http_client = stripe.http_client.RequestsClient(timeout=10)
    _configured = True


def webhook_secret() -> str:
    global _webhook_secret
    if _webhook_secret is None:
        _webhook_secret = _get_param(os.environ["STRIPE_WEBHOOK_SECRET_PARAM"])
    return _webhook_secret


def plan_from_subscription(sub: dict) -> str:
    """Price id → plan. Unknown prices fail toward capped and page someone."""
    items = (sub.get("items") or {}).get("data") or []
    if not items:
        return "free"
    if len(items) > 1:
        logger.warning("Subscription has multiple items", extra={"subscription_id": sub.get("id")})
    price_id = ((items[0].get("price") or {}).get("id")) or ""
    plan = _PRICE_TO_PLAN.get(price_id)
    if plan is None:
        logger.error("Unknown price id", extra={"price_id": price_id, "subscription_id": sub.get("id")})
        metrics.add_metric(name="UnknownPriceId", unit=MetricUnit.Count, value=1)
        return "free"
    return plan


def is_live(sub: dict) -> bool:
    return sub.get("status") not in NOT_LIVE_STATUSES


def retrieve_subscription(sub_id: str) -> dict:
    configure()
    return stripe.Subscription.retrieve(sub_id)


def cancel_subscription(sub_id: str) -> None:
    configure()
    stripe.Subscription.cancel(sub_id)


def user_id_from_customer(customer_id: str) -> str | None:
    """Fallback identity for subscriptions created outside checkout (dashboard)."""
    configure()
    customer = stripe.Customer.retrieve(customer_id)
    return (customer.get("metadata") or {}).get("user_id") or None


def subscription_id_from_invoice(invoice: dict) -> str | None:
    """Invoice.subscription moved under parent.subscription_details in the 2025 API."""
    direct = invoice.get("subscription")
    if isinstance(direct, str) and direct:
        return direct
    nested = ((invoice.get("parent") or {}).get("subscription_details") or {}).get("subscription")
    return nested if isinstance(nested, str) and nested else None
```

- [ ] **Step 5: Run tests; ruff; commit**

```bash
cd infrastructure/lambda/billing && ../../../.venv/bin/python -m pytest tests -q && cd - 
.venv/bin/ruff check infrastructure/lambda/billing && .venv/bin/ruff format infrastructure/lambda/billing
git add infrastructure/lambda/billing
git commit -m "feat(billing): stripe_client module + test scaffold

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK"
git push
```

---

### Task 5: `store.py` — reads and the single transactional apply

**Files:**
- Create: `infrastructure/lambda/billing/store.py`
- Create: `infrastructure/lambda/billing/tests/test_store.py`

**Interfaces:**
- Produces:
  - `get_user(user_id: str) -> dict | None` (ConsistentRead).
  - `set_pending_intent(user_id: str, intent_id: str) -> None`.
  - `class Outcome(str, Enum)`: `APPLIED`, `DUPLICATE`, `STALE`, `NOOP`.
  - `apply_event(event_id: str, user_id: str | None, update: dict | None) -> Outcome` where `update` is a dict with keys `UpdateExpression`, `ConditionExpression`, `ExpressionAttributeNames`, `ExpressionAttributeValues` already serialised for the low-level client (use `serialize(v)`), or `None` for marker-only.
  - `serialize(value) -> dict` (Python → DynamoDB AttributeValue via `boto3.dynamodb.types.TypeSerializer`).
  - `marker_ttl(now: int) -> int` = now + 72 h.

- [ ] **Step 1: Failing tests**

`infrastructure/lambda/billing/tests/test_store.py`:
```python
import pytest
from conftest import get_user


def _upd(**values):
    """A minimal SET update with a condition that always passes."""
    import store

    names = {f"#{k}": k for k in values}
    vals = {f":{k}": store.serialize(v) for k, v in values.items()}
    return {
        "UpdateExpression": "SET " + ", ".join(f"#{k} = :{k}" for k in values),
        "ConditionExpression": "attribute_exists(pk)",
        "ExpressionAttributeNames": names,
        "ExpressionAttributeValues": vals,
    }


def test_apply_writes_marker_and_row(ddb_table, user_row):
    import store

    user_row()
    out = store.apply_event("evt_1", "u1", _upd(subscription_status="active"))
    assert out is store.Outcome.APPLIED
    assert get_user(ddb_table)["subscription_status"] == "active"
    marker = ddb_table.get_item(Key={"pk": "BILLING_EVENT#evt_1", "sk": "BILLING_EVENT#evt_1"})["Item"]
    assert marker["ttl"] > 0


def test_duplicate_event_writes_nothing(ddb_table, user_row):
    import store

    user_row()
    store.apply_event("evt_1", "u1", _upd(subscription_status="active"))
    out = store.apply_event("evt_1", "u1", _upd(subscription_status="canceled"))
    assert out is store.Outcome.DUPLICATE
    assert get_user(ddb_table)["subscription_status"] == "active"


def test_failed_row_condition_is_stale_and_marker_not_written(ddb_table, user_row):
    import store

    user_row()
    upd = _upd(subscription_status="active")
    upd["ConditionExpression"] = "attribute_not_exists(pk)"  # will fail: row exists
    out = store.apply_event("evt_2", "u1", upd)
    assert out is store.Outcome.STALE
    assert "subscription_status" not in get_user(ddb_table)
    # A stale event may be redelivered legitimately later; it is not marked processed.
    assert "Item" not in ddb_table.get_item(Key={"pk": "BILLING_EVENT#evt_2", "sk": "BILLING_EVENT#evt_2"})


def test_marker_only_noop(ddb_table, user_row):
    import store

    user_row()
    out = store.apply_event("evt_3", None, None)
    assert out is store.Outcome.NOOP
    assert "Item" in ddb_table.get_item(Key={"pk": "BILLING_EVENT#evt_3", "sk": "BILLING_EVENT#evt_3"})


def test_noop_then_same_event_is_duplicate(ddb_table, user_row):
    import store

    user_row()
    store.apply_event("evt_3", None, None)
    assert store.apply_event("evt_3", None, None) is store.Outcome.DUPLICATE


def test_get_user_and_pending_intent(ddb_table, user_row):
    import store

    user_row()
    store.set_pending_intent("u1", "intent-9")
    assert store.get_user("u1")["pending_intent_id"] == "intent-9"
    assert store.get_user("nobody") is None


def test_serialize_numbers_and_bools():
    import store

    assert store.serialize(5) == {"N": "5"}
    assert store.serialize(True) == {"BOOL": True}
    assert store.serialize("x") == {"S": "x"}
```

Run: `cd infrastructure/lambda/billing && ../../../.venv/bin/python -m pytest tests/test_store.py -q` → ImportError.

- [ ] **Step 2: Implement `store.py`**

```python
"""DynamoDB access for billing. One transaction per webhook event.

The processed-event marker and the user-row update commit together. Marking
first and updating second would turn a crash between the two into a
permanently stale plan: Stripe's retry would look like a duplicate.
"""

from __future__ import annotations

import os
import time
from enum import Enum

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

MARKER_TTL_SECONDS = 72 * 3600

_client = None
_table = None
_serializer = TypeSerializer()


def _table_name() -> str:
    return os.environ["REPORTS_TABLE"]


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client("dynamodb")
    return _client


def _get_table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb").Table(_table_name())
    return _table


def serialize(value) -> dict:
    return _serializer.serialize(value)


def marker_ttl(now: int) -> int:
    return now + MARKER_TTL_SECONDS


def user_key(user_id: str) -> dict:
    pk = f"USER#{user_id}"
    return {"pk": pk, "sk": pk}


class Outcome(str, Enum):
    APPLIED = "applied"
    DUPLICATE = "duplicate"
    STALE = "stale"
    NOOP = "noop"


def get_user(user_id: str) -> dict | None:
    result = _get_table().get_item(Key=user_key(user_id), ConsistentRead=True)
    return result.get("Item") or None


def set_pending_intent(user_id: str, intent_id: str) -> None:
    _get_table().update_item(
        Key=user_key(user_id),
        UpdateExpression="SET pending_intent_id = :i",
        ExpressionAttributeValues={":i": intent_id},
    )


def apply_event(event_id: str, user_id: str | None, update: dict | None) -> Outcome:
    """Commit the processed marker and (optionally) the row update atomically.

    Returns DUPLICATE when the marker already exists, STALE when the row
    condition fails (the marker is *not* written, so a legitimately later
    redelivery can still apply), APPLIED / NOOP otherwise. Any other
    DynamoDB failure raises so the caller returns 5xx and Stripe retries.
    """
    marker_pk = f"BILLING_EVENT#{event_id}"
    items: list[dict] = [
        {
            "Put": {
                "TableName": _table_name(),
                "Item": {
                    "pk": {"S": marker_pk},
                    "sk": {"S": marker_pk},
                    "ttl": {"N": str(marker_ttl(int(time.time())))},
                },
                "ConditionExpression": "attribute_not_exists(pk)",
            }
        }
    ]
    if update is not None and user_id is not None:
        items.append(
            {
                "Update": {
                    "TableName": _table_name(),
                    "Key": {k: {"S": v} for k, v in user_key(user_id).items()},
                    **update,
                }
            }
        )
    try:
        _get_client().transact_write_items(TransactItems=items)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") != "TransactionCanceledException":
            raise
        reasons = e.response.get("CancellationReasons") or []
        codes = [r.get("Code") for r in reasons]
        if codes and codes[0] == "ConditionalCheckFailed":
            return Outcome.DUPLICATE
        if len(codes) > 1 and codes[1] == "ConditionalCheckFailed":
            return Outcome.STALE
        raise
    return Outcome.APPLIED if update is not None else Outcome.NOOP
```

- [ ] **Step 3: Run, lint, commit**

```bash
cd infrastructure/lambda/billing && ../../../.venv/bin/python -m pytest tests -q && cd -
.venv/bin/ruff check infrastructure/lambda/billing && .venv/bin/ruff format infrastructure/lambda/billing
git add infrastructure/lambda/billing
git commit -m "feat(billing): store.apply_event — marker + row update in one transaction

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK"
git push
```

---

### Task 6: `webhook.py` — dispatch, install path, state path

**Files:**
- Create: `infrastructure/lambda/billing/webhook.py`
- Create: `infrastructure/lambda/billing/tests/test_install.py`
- Create: `infrastructure/lambda/billing/tests/test_state.py`

**Interfaces:**
- Consumes: `store.get_user`, `store.apply_event`, `store.serialize`, `store.Outcome`; `stripe_client.retrieve_subscription`, `cancel_subscription`, `plan_from_subscription`, `is_live`, `user_id_from_customer`, `subscription_id_from_invoice`; `plinths_auth.billing.ENTITLED_STATUSES`.
- Produces: `handle_event(event: dict) -> str` — returns one of `"applied" | "duplicate" | "stale" | "noop" | "orphan" | "ignored"` (the route logs it and always answers 200). Raises on Stripe/DynamoDB infrastructure errors.
- Produces (internal, tested directly): `install_subscription(event, user_id, sub_id) -> str`, `apply_subscription_state(event, user_id, sub_id) -> str`, `build_state_update(row, sub, event_created, grace_seconds) -> dict | None`.

- [ ] **Step 1: Failing install tests**

`infrastructure/lambda/billing/tests/test_install.py`:
```python
from conftest import get_user, make_event, make_subscription


def _session(sub_id="sub_1", intent="intent-1", user_id="u1", customer="cus_1"):
    return {
        "id": "cs_1",
        "object": "checkout.session",
        "subscription": sub_id,
        "customer": customer,
        "metadata": {"user_id": user_id, "org_id": "org1", "intent_id": intent},
    }


def test_matching_intent_installs_and_clears_pending(ddb_table, user_row, stripe_stub):
    import webhook

    user_row(pending_intent_id="intent-1")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active", price="price_max")
    out = webhook.handle_event(make_event("checkout.session.completed", _session()))
    assert out == "applied"
    row = get_user(ddb_table)
    assert row["stripe_subscription_id"] == "sub_1"
    assert row["stripe_customer_id"] == "cus_1"
    assert row["plan"] == "max"
    assert row["subscription_status"] == "active"
    assert row["last_checkout_intent_id"] == "intent-1"
    assert "pending_intent_id" not in row
    assert int(row["billing_revision"]) == 1
    assert int(row["billing_source_event_created"]) == 1_700_000_000


def test_incomplete_subscription_installs_but_is_not_entitled(ddb_table, user_row, stripe_stub):
    from plinths_auth.billing import effective_plan
    import webhook

    user_row(pending_intent_id="intent-1")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="incomplete")
    webhook.handle_event(make_event("checkout.session.completed", _session()))
    row = get_user(ddb_table)
    assert row["subscription_status"] == "incomplete"
    assert effective_plan(row) == "free"


def test_subscription_created_installs_from_subscription_metadata(ddb_table, user_row, stripe_stub):
    import webhook

    user_row(pending_intent_id="intent-1")
    sub = make_subscription(status="active")
    stripe_stub["subscriptions"]["sub_1"] = sub
    out = webhook.handle_event(make_event("customer.subscription.created", sub))
    assert out == "applied"
    assert get_user(ddb_table)["stripe_subscription_id"] == "sub_1"


def test_second_install_event_for_same_subscription_is_noop(ddb_table, user_row, stripe_stub):
    import webhook

    user_row(pending_intent_id="intent-1")
    sub = make_subscription(status="active")
    stripe_stub["subscriptions"]["sub_1"] = sub
    webhook.handle_event(make_event("checkout.session.completed", _session(), event_id="evt_a"))
    out = webhook.handle_event(make_event("customer.subscription.created", sub, event_id="evt_b"))
    assert out == "noop"
    assert int(get_user(ddb_table)["billing_revision"]) == 1


def test_stale_intent_not_live_is_dropped(ddb_table, user_row, stripe_stub):
    import webhook

    user_row(pending_intent_id="intent-2")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="incomplete_expired")
    out = webhook.handle_event(make_event("checkout.session.completed", _session(intent="intent-1")))
    assert out == "noop"
    assert "stripe_subscription_id" not in get_user(ddb_table)


def test_stale_intent_live_and_row_empty_installs_anyway(ddb_table, user_row, stripe_stub):
    """Abandon tab A, start B, then complete A: A is the only real subscription."""
    import webhook

    user_row(pending_intent_id="intent-B")
    stripe_stub["subscriptions"]["sub_A"] = make_subscription(sub_id="sub_A", status="active")
    out = webhook.handle_event(
        make_event("checkout.session.completed", _session(sub_id="sub_A", intent="intent-A"))
    )
    assert out == "applied"
    row = get_user(ddb_table)
    assert row["stripe_subscription_id"] == "sub_A"
    assert row["last_checkout_intent_id"] == "intent-A"


def test_stale_intent_with_different_live_subscription_cancels_newcomer(ddb_table, user_row, stripe_stub, monkeypatch):
    import webhook

    seen = []
    monkeypatch.setattr(webhook.metrics, "add_metric", lambda **kw: seen.append(kw["name"]))
    user_row(stripe_subscription_id="sub_1", subscription_status="active", plan="pro")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(sub_id="sub_1", status="active")
    stripe_stub["subscriptions"]["sub_2"] = make_subscription(sub_id="sub_2", status="active")
    out = webhook.handle_event(
        make_event("checkout.session.completed", _session(sub_id="sub_2", intent="intent-old"))
    )
    assert out == "noop"
    assert stripe_stub["cancelled"] == ["sub_2"]
    assert "DoubleSubscriptionCancelled" in seen
    assert get_user(ddb_table)["stripe_subscription_id"] == "sub_1"


def test_replacement_after_cancel_installs_new_id(ddb_table, user_row, stripe_stub):
    import webhook

    user_row(stripe_subscription_id="sub_old", subscription_status="canceled", plan="pro",
             billing_source_event_created=1_700_000_000, pending_intent_id="intent-new")
    stripe_stub["subscriptions"]["sub_old"] = make_subscription(sub_id="sub_old", status="canceled")
    stripe_stub["subscriptions"]["sub_new"] = make_subscription(sub_id="sub_new", status="active")
    # Same created second as the old subscription's final event — must still install.
    out = webhook.handle_event(
        make_event("checkout.session.completed", _session(sub_id="sub_new", intent="intent-new"), created=1_700_000_000)
    )
    assert out == "applied"
    assert get_user(ddb_table)["stripe_subscription_id"] == "sub_new"


def test_orphan_user_returns_orphan_and_writes_nothing(ddb_table, stripe_stub, monkeypatch):
    import webhook

    seen = []
    monkeypatch.setattr(webhook.metrics, "add_metric", lambda **kw: seen.append(kw["name"]))
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active")
    out = webhook.handle_event(make_event("checkout.session.completed", _session(user_id="ghost")))
    assert out == "orphan"
    assert "WebhookOrphanUser" in seen


def test_missing_user_id_falls_back_to_customer_metadata(ddb_table, user_row, stripe_stub):
    import webhook

    user_row(pending_intent_id="intent-1")
    stripe_stub["customers"]["cus_1"] = {"id": "cus_1", "metadata": {"user_id": "u1"}}
    sub = make_subscription(status="active", metadata={})
    stripe_stub["subscriptions"]["sub_1"] = sub
    out = webhook.handle_event(make_event("customer.subscription.created", sub))
    assert out == "applied"


def test_unhandled_event_type_is_ignored(ddb_table):
    import webhook

    assert webhook.handle_event(make_event("customer.subscription.trial_will_end", {})) == "ignored"
```

- [ ] **Step 2: Failing state tests**

`infrastructure/lambda/billing/tests/test_state.py`:
```python
from conftest import get_user, make_event, make_subscription

T0 = 1_700_000_000
GRACE = 604_800


def _installed(user_row, **over):
    base = dict(stripe_subscription_id="sub_1", stripe_customer_id="cus_1", plan="pro",
                subscription_status="active", billing_source_event_created=T0, billing_revision=1)
    base.update(over)
    return user_row(**base)


def test_updated_changes_plan_and_bumps_revision(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    sub = make_subscription(status="active", price="price_max")
    stripe_stub["subscriptions"]["sub_1"] = sub
    out = webhook.handle_event(make_event("customer.subscription.updated", sub, created=T0 + 10))
    assert out == "applied"
    row = get_user(ddb_table)
    assert row["plan"] == "max" and int(row["billing_revision"]) == 2
    assert int(row["billing_source_event_created"]) == T0 + 10


def test_monthly_to_annual_bumps_revision_without_plan_change(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row, current_period_end=1)
    sub = make_subscription(status="active", price="price_pro_a", current_period_end=2)
    stripe_stub["subscriptions"]["sub_1"] = sub
    webhook.handle_event(make_event("customer.subscription.updated", sub, created=T0 + 10))
    row = get_user(ddb_table)
    assert row["plan"] == "pro" and int(row["billing_revision"]) == 2


def test_no_change_writes_nothing_and_no_bump(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row, cancel_at_period_end=False, current_period_end=1_800_000_000)
    sub = make_subscription(status="active")
    stripe_stub["subscriptions"]["sub_1"] = sub
    out = webhook.handle_event(make_event("customer.subscription.updated", sub, created=T0 + 10))
    assert out == "noop"
    assert int(get_user(ddb_table)["billing_revision"]) == 1


def test_older_event_is_stale(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    sub = make_subscription(status="active", price="price_max")
    stripe_stub["subscriptions"]["sub_1"] = sub
    out = webhook.handle_event(make_event("customer.subscription.updated", sub, created=T0 - 1))
    assert out == "stale"
    assert get_user(ddb_table)["plan"] == "pro"


def test_equal_timestamp_applies_refetched_truth(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    sub = make_subscription(status="active", price="price_max")
    stripe_stub["subscriptions"]["sub_1"] = sub
    assert webhook.handle_event(make_event("customer.subscription.updated", sub, created=T0)) == "applied"
    assert get_user(ddb_table)["plan"] == "max"


def test_event_for_other_subscription_id_is_stale(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    other = make_subscription(sub_id="sub_9", status="active", price="price_max")
    stripe_stub["subscriptions"]["sub_9"] = other
    out = webhook.handle_event(make_event("customer.subscription.updated", other, created=T0 + 99))
    assert out == "stale"
    assert get_user(ddb_table)["stripe_subscription_id"] == "sub_1"


def test_deleted_then_late_updated_stays_canceled(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="canceled")
    assert webhook.handle_event(make_event("customer.subscription.deleted", stripe_stub["subscriptions"]["sub_1"], event_id="e1", created=T0 + 5)) == "applied"
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active")
    out = webhook.handle_event(make_event("customer.subscription.updated", stripe_stub["subscriptions"]["sub_1"], event_id="e2", created=T0 + 9))
    assert out == "stale"
    row = get_user(ddb_table)
    assert row["subscription_status"] == "canceled" and row["plan"] == "pro"


def test_paused_and_resumed(ddb_table, user_row, stripe_stub):
    from plinths_auth.billing import effective_plan
    import webhook

    _installed(user_row)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="paused")
    webhook.handle_event(make_event("customer.subscription.paused", stripe_stub["subscriptions"]["sub_1"], event_id="e1", created=T0 + 1))
    assert effective_plan(get_user(ddb_table)) == "free"
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active")
    webhook.handle_event(make_event("customer.subscription.resumed", stripe_stub["subscriptions"]["sub_1"], event_id="e2", created=T0 + 2))
    assert effective_plan(get_user(ddb_table)) == "pro"


def test_payment_failed_from_active_sets_grace(ddb_table, user_row, stripe_stub):
    from plinths_auth.billing import effective_plan
    import webhook

    _installed(user_row)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="past_due")
    invoice = {"id": "in_1", "object": "invoice", "customer": "cus_1", "subscription": "sub_1"}
    out = webhook.handle_event(make_event("invoice.payment_failed", invoice, created=T0 + 10))
    assert out == "applied"
    row = get_user(ddb_table)
    assert row["subscription_status"] == "past_due"
    assert int(row["entitlement_grace_until"]) == T0 + 10 + GRACE
    assert effective_plan(row, T0 + 11) == "pro"
    assert effective_plan(row, T0 + 11 + GRACE) == "free"


def test_payment_failed_on_never_entitled_gets_no_grace(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row, subscription_status="incomplete")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="past_due")
    webhook.handle_event(make_event("invoice.payment_failed", {"subscription": "sub_1"}, created=T0 + 10))
    row = get_user(ddb_table)
    assert row["subscription_status"] == "past_due"
    assert "entitlement_grace_until" not in row


def test_recovery_clears_grace(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row, subscription_status="past_due", entitlement_grace_until=T0 + GRACE)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active")
    webhook.handle_event(make_event("customer.subscription.updated", stripe_stub["subscriptions"]["sub_1"], created=T0 + 20))
    row = get_user(ddb_table)
    assert row["subscription_status"] == "active"
    assert "entitlement_grace_until" not in row


def test_payment_failed_new_invoice_shape(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="past_due")
    invoice = {"parent": {"subscription_details": {"subscription": "sub_1"}}}
    assert webhook.handle_event(make_event("invoice.payment_failed", invoice, created=T0 + 10)) == "applied"


def test_payment_failed_without_subscription_is_ignored(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    assert webhook.handle_event(make_event("invoice.payment_failed", {"id": "in_x"})) == "ignored"


def test_unknown_price_on_live_subscription_writes_free(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active", price="price_gone")
    webhook.handle_event(make_event("customer.subscription.updated", stripe_stub["subscriptions"]["sub_1"], created=T0 + 1))
    assert get_user(ddb_table)["plan"] == "free"


def test_duplicate_delivery_is_duplicate(ddb_table, user_row, stripe_stub):
    import webhook

    _installed(user_row)
    sub = make_subscription(status="active", price="price_max")
    stripe_stub["subscriptions"]["sub_1"] = sub
    ev = make_event("customer.subscription.updated", sub, event_id="same", created=T0 + 1)
    assert webhook.handle_event(ev) == "applied"
    assert webhook.handle_event(ev) == "duplicate"
    assert int(get_user(ddb_table)["billing_revision"]) == 2


def test_state_event_for_orphan_user(ddb_table, stripe_stub):
    import webhook

    sub = make_subscription(status="active")
    stripe_stub["subscriptions"]["sub_1"] = sub
    assert webhook.handle_event(make_event("customer.subscription.updated", sub)) == "orphan"
```

Run: `cd infrastructure/lambda/billing && ../../../.venv/bin/python -m pytest tests/test_install.py tests/test_state.py -q` → ImportError.

- [ ] **Step 3: Implement `webhook.py`**

```python
"""Stripe webhook handling. Stripe is the authority; the event is a nudge.

Two paths. The *install* path is the only one that may write
`stripe_subscription_id`; it is gated by the checkout intent, not by
timestamps. The *state* path refetches the subscription and writes what the
API reports, guarded by the subscription-id generation pin, the terminal
`canceled` status, and a not-strictly-older `event.created`.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone

from aws_lambda_powertools import Logger, Metrics
from aws_lambda_powertools.metrics import MetricUnit
from plinths_auth.billing import ENTITLED_STATUSES

import store
import stripe_client

logger = Logger(child=True)
metrics = Metrics()

INSTALL_EVENTS = {"checkout.session.completed", "customer.subscription.created"}
STATE_EVENTS = {
    "customer.subscription.updated",
    "customer.subscription.paused",
    "customer.subscription.resumed",
    "customer.subscription.deleted",
    "invoice.payment_failed",
}

MAX_CONDITION_RETRIES = 3


def _grace_seconds() -> int:
    return int(os.environ.get("GRACE_WINDOW_SECONDS", "604800"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_user_id(obj: dict, sub: dict | None) -> str | None:
    for source in (obj.get("metadata") or {}, (sub or {}).get("metadata") or {}):
        uid = source.get("user_id")
        if uid:
            return uid
    customer = obj.get("customer") or (sub or {}).get("customer")
    if isinstance(customer, dict):
        customer = customer.get("id")
    return stripe_client.user_id_from_customer(customer) if customer else None


def handle_event(event: dict) -> str:
    event_type = event["type"]
    obj = event["data"]["object"]
    log = {"event_id": event["id"], "event_type": event_type}

    if event_type in INSTALL_EVENTS:
        sub_id = obj.get("subscription") if event_type == "checkout.session.completed" else obj.get("id")
        if not sub_id:
            logger.warning("Install event without subscription", extra=log)
            return "ignored"
        sub = stripe_client.retrieve_subscription(sub_id)
        user_id = _resolve_user_id(obj, sub)
        if not user_id:
            logger.warning("Could not resolve user for event", extra={**log, "subscription_id": sub_id})
            return "ignored"
        return install_subscription(event, user_id, sub)

    if event_type in STATE_EVENTS:
        if event_type == "invoice.payment_failed":
            sub_id = stripe_client.subscription_id_from_invoice(obj)
        else:
            sub_id = obj.get("id")
        if not sub_id:
            return "ignored"
        sub = stripe_client.retrieve_subscription(sub_id)
        user_id = _resolve_user_id(obj, sub)
        if not user_id:
            logger.warning("Could not resolve user for event", extra={**log, "subscription_id": sub_id})
            return "ignored"
        return apply_subscription_state(event, user_id, sub)

    return "ignored"


def _orphan(event: dict, user_id: str) -> str:
    logger.warning("Webhook for missing user row", extra={"event_id": event["id"], "user_id": user_id})
    metrics.add_metric(name="WebhookOrphanUser", unit=MetricUnit.Count, value=1)
    return "orphan"


def _log_outcome(outcome: store.Outcome, event: dict, user_id: str, sub_id: str) -> str:
    extra = {"event_id": event["id"], "event_type": event["type"], "user_id": user_id, "subscription_id": sub_id}
    if outcome is store.Outcome.STALE:
        metrics.add_metric(name="WebhookStaleEvent", unit=MetricUnit.Count, value=1)
        logger.info("Webhook event stale", extra=extra)
    elif outcome is store.Outcome.DUPLICATE:
        logger.info("Webhook event duplicate", extra=extra)
    else:
        logger.info("Webhook event applied", extra={**extra, "outcome": outcome.value})
    return outcome.value


# ─── Install path ───


def _install_update(sub: dict, intent_id: str | None, event_created: int, condition: str, names: dict, values: dict) -> dict:
    plan = stripe_client.plan_from_subscription(sub)
    customer = sub.get("customer")
    if isinstance(customer, dict):
        customer = customer.get("id")
    sets = {
        "stripe_subscription_id": sub["id"],
        "stripe_customer_id": customer,
        "plan": plan,
        "subscription_status": sub.get("status"),
        "billing_source_event_created": event_created,
        "last_checkout_intent_id": intent_id or "",
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
        "current_period_end": int(sub.get("current_period_end") or 0),
        "plan_updated_at": _now_iso(),
    }
    n = {"#plan": "plan", **names}
    v = {f":s_{k}": store.serialize(val) for k, val in sets.items()}
    v.update(values)
    set_expr = ", ".join(("#plan" if k == "plan" else k) + f" = :s_{k}" for k in sets)
    return {
        "UpdateExpression": f"SET {set_expr} ADD billing_revision :one REMOVE pending_intent_id, entitlement_grace_until",
        "ConditionExpression": condition,
        "ExpressionAttributeNames": n,
        "ExpressionAttributeValues": {**v, ":one": store.serialize(1)},
    }


def install_subscription(event: dict, user_id: str, sub: dict) -> str:
    row = store.get_user(user_id)
    if row is None:
        return _orphan(event, user_id)

    obj = event["data"]["object"]
    intent = (obj.get("metadata") or {}).get("intent_id") or (sub.get("metadata") or {}).get("intent_id")
    pending = row.get("pending_intent_id")
    recorded = row.get("stripe_subscription_id") or ""
    created = int(event["created"])

    if intent and pending and intent == pending:
        update = _install_update(sub, intent, created, "pending_intent_id = :intent", {}, {":intent": store.serialize(intent)})
        outcome = store.apply_event(event["id"], user_id, update)
        return _log_outcome(outcome, event, user_id, sub["id"])

    # Intent does not match (or is absent): classify by what Stripe says.
    if not stripe_client.is_live(sub):
        return _log_outcome(store.apply_event(event["id"], None, None), event, user_id, sub["id"])

    if recorded == sub["id"]:
        return _log_outcome(store.apply_event(event["id"], None, None), event, user_id, sub["id"])

    recorded_live = False
    if recorded:
        recorded_live = stripe_client.is_live(stripe_client.retrieve_subscription(recorded))

    if not recorded_live:
        condition = "attribute_not_exists(stripe_subscription_id) OR stripe_subscription_id = :recorded"
        update = _install_update(sub, intent, created, condition, {}, {":recorded": store.serialize(recorded)})
        outcome = store.apply_event(event["id"], user_id, update)
        return _log_outcome(outcome, event, user_id, sub["id"])

    # Two live subscriptions: the user is paying twice. Cancel the newcomer.
    stripe_client.cancel_subscription(sub["id"])
    metrics.add_metric(name="DoubleSubscriptionCancelled", unit=MetricUnit.Count, value=1)
    logger.error(
        "Cancelled second live subscription; refund manually",
        extra={"event_id": event["id"], "user_id": user_id, "subscription_id": sub["id"], "kept": recorded},
    )
    return _log_outcome(store.apply_event(event["id"], None, None), event, user_id, sub["id"])


# ─── State path ───


def build_state_update(row: dict, sub: dict, event_created: int, grace_seconds: int) -> dict | None:
    """The row update for a refetched subscription, or None when nothing changes."""
    new_status = sub.get("status")
    old_status = row.get("subscription_status")
    sets = {
        "plan": stripe_client.plan_from_subscription(sub),
        "subscription_status": new_status,
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
        "current_period_end": int(sub.get("current_period_end") or 0),
    }
    removes: list[str] = []
    grace_transition = new_status == "past_due" and old_status in ENTITLED_STATUSES
    if grace_transition:
        sets["entitlement_grace_until"] = event_created + grace_seconds
    elif new_status != "past_due" and "entitlement_grace_until" in row:
        removes.append("entitlement_grace_until")

    changed = any(row.get(k) != v for k, v in sets.items() if k != "current_period_end") or (
        int(row.get("current_period_end") or 0) != sets["current_period_end"]
    ) or bool(removes)
    if not changed:
        return None

    sets["billing_source_event_created"] = event_created
    sets["plan_updated_at"] = _now_iso()
    names = {"#plan": "plan"}
    values = {f":s_{k}": store.serialize(v) for k, v in sets.items()}
    values.update(
        {
            ":sub_id": store.serialize(sub["id"]),
            ":canceled": store.serialize("canceled"),
            ":created": store.serialize(event_created),
            ":one": store.serialize(1),
        }
    )
    condition = (
        "stripe_subscription_id = :sub_id AND subscription_status <> :canceled "
        "AND (attribute_not_exists(billing_source_event_created) OR billing_source_event_created <= :created)"
    )
    if grace_transition:
        condition += " AND subscription_status = :old_status"
        values[":old_status"] = store.serialize(old_status)
    set_expr = ", ".join(("#plan" if k == "plan" else k) + f" = :s_{k}" for k in sets)
    expr = f"SET {set_expr} ADD billing_revision :one"
    if removes:
        expr += " REMOVE " + ", ".join(removes)
    return {
        "UpdateExpression": expr,
        "ConditionExpression": condition,
        "ExpressionAttributeNames": names,
        "ExpressionAttributeValues": values,
    }


def apply_subscription_state(event: dict, user_id: str, sub: dict) -> str:
    created = int(event["created"])
    for attempt in range(MAX_CONDITION_RETRIES):
        row = store.get_user(user_id)
        if row is None:
            return _orphan(event, user_id)
        if row.get("stripe_subscription_id") != sub["id"] or row.get("subscription_status") == "canceled":
            return _log_outcome(store.Outcome.STALE, event, user_id, sub["id"])
        if int(row.get("billing_source_event_created") or 0) > created:
            return _log_outcome(store.Outcome.STALE, event, user_id, sub["id"])
        update = build_state_update(row, sub, created, _grace_seconds())
        if update is None:
            return _log_outcome(store.apply_event(event["id"], None, None), event, user_id, sub["id"])
        outcome = store.apply_event(event["id"], user_id, update)
        grace_path = ":old_status" in update["ExpressionAttributeValues"]
        if outcome is store.Outcome.STALE and grace_path and attempt < MAX_CONDITION_RETRIES - 1:
            time.sleep(0.05)
            continue
        return _log_outcome(outcome, event, user_id, sub["id"])
    return _log_outcome(store.Outcome.STALE, event, user_id, sub["id"])
```

Note on the in-code pre-checks in `apply_subscription_state`: they exist so a stale event is reported as STALE without a transaction round-trip and so the marker is not written for it. The `ConditionExpression` inside the transaction is what makes the write safe under concurrency; the pre-check is an optimisation, never the guard.

- [ ] **Step 4: Run, lint, type-check, commit**

```bash
cd infrastructure/lambda/billing && ../../../.venv/bin/python -m pytest tests -q && cd -
.venv/bin/ruff check infrastructure/lambda/billing && .venv/bin/ruff format infrastructure/lambda/billing
.venv/bin/mypy infrastructure/lambda/billing --ignore-missing-imports --no-strict-optional
git add infrastructure/lambda/billing
git commit -m "feat(billing): webhook install + state paths with intent gate and generation pin

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK"
git push
```

---

### Task 7: `app.py` — routes and the webhook entry

**Files:**
- Rewrite: `infrastructure/lambda/billing/app.py`
- Create: `infrastructure/lambda/billing/tests/test_checkout.py`, `tests/test_me.py`, `tests/test_webhook_entry.py`

**Interfaces:**
- Consumes: `store.*`, `stripe_client.*`, `webhook.handle_event`, `plinths_auth.billing.effective_plan`.
- Produces HTTP contract: `POST /billing/checkout {plan, intent_id}` → `200 {checkout_url}` | `400 {error}` | `409 {error: "subscription_exists"|"intent_reused"}` | `502`; `POST /billing/portal` → `{portal_url}`; `GET /billing/me` → `{plan, effective_plan, subscription_status, entitlement_grace_until, last_checkout_intent_id, billing_revision, plan_updated_at, cancel_at_period_end, current_period_end}`; `POST /billing/webhook` → `200 {received: true, outcome}` | `400`.

- [ ] **Step 1: Failing checkout tests**

`infrastructure/lambda/billing/tests/test_checkout.py`:
```python
import json

from conftest import api_event, get_user, make_subscription


def _post(body: dict, auth=None):
    import app

    resp = app.lambda_handler(api_event("POST", "/api/billing/checkout", json.dumps(body), auth=auth), None)
    return resp["statusCode"], json.loads(resp["body"])


INTENT = "3f2c1a9e-8b4d-4c6e-9f1a-2b3c4d5e6f70"


def test_checkout_records_intent_and_creates_session(ddb_table, user_row, stripe_stub):
    user_row()
    code, body = _post({"plan": "pro", "intent_id": INTENT})
    assert code == 200 and body["checkout_url"] == "https://stripe.test/cs"
    assert get_user(ddb_table)["pending_intent_id"] == INTENT
    kw = stripe_stub["sessions"][0]
    assert kw["idempotency_key"] == f"checkout:{INTENT}"
    assert kw["metadata"] == {"user_id": "u1", "org_id": "org1", "intent_id": INTENT}
    assert kw["subscription_data"]["metadata"] == {"user_id": "u1", "intent_id": INTENT}
    assert kw["client_reference_id"] == "u1"
    assert kw["success_url"] == "https://app.test?billing=success"
    assert "session_id" not in kw["success_url"]


def test_checkout_rejects_missing_or_bad_intent(ddb_table, user_row, stripe_stub):
    user_row()
    assert _post({"plan": "pro"})[0] == 400
    assert _post({"plan": "pro", "intent_id": "not-a-uuid"})[0] == 400
    assert stripe_stub["sessions"] == []


def test_checkout_rejects_bad_plan(ddb_table, user_row, stripe_stub):
    user_row()
    assert _post({"plan": "gold", "intent_id": INTENT})[0] == 400


def test_checkout_409_when_live_subscription_exists(ddb_table, user_row, stripe_stub):
    user_row(stripe_subscription_id="sub_1", subscription_status="active", plan="pro")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="past_due")
    code, body = _post({"plan": "max", "intent_id": INTENT})
    assert code == 409 and body["error"] == "subscription_exists"
    assert stripe_stub["sessions"] == []


def test_checkout_allowed_after_cancellation(ddb_table, user_row, stripe_stub):
    user_row(stripe_subscription_id="sub_1", subscription_status="canceled", plan="pro")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="canceled")
    assert _post({"plan": "pro", "intent_id": INTENT})[0] == 200


def test_admin_cannot_subscribe(ddb_table, user_row, stripe_stub):
    user_row(plan="admin")
    code, body = _post({"plan": "pro", "intent_id": INTENT})
    assert code == 400 and body["error"] == "admin_accounts_cannot_subscribe"


def test_idempotency_conflict_maps_to_409(ddb_table, user_row, stripe_stub, monkeypatch):
    import stripe

    user_row()

    def boom(**_):
        raise stripe.error.IdempotencyError("Keys for idempotent requests can only be used with the same parameters")

    monkeypatch.setattr(stripe.checkout.Session, "create", staticmethod(boom))
    code, body = _post({"plan": "pro", "intent_id": INTENT})
    assert code == 409 and body["error"] == "intent_reused"


def test_checkout_requires_auth(ddb_table, stripe_stub):
    code, _ = _post({"plan": "pro", "intent_id": INTENT}, auth={"is_authenticated": "false"})
    assert code == 401
```

- [ ] **Step 2: Failing `/billing/me` tests**

`infrastructure/lambda/billing/tests/test_me.py`:
```python
import json

from conftest import api_event


def _get(auth=None):
    import app

    resp = app.lambda_handler(api_event("GET", "/api/billing/me", auth=auth), None)
    return resp["statusCode"], json.loads(resp["body"])


def test_me_returns_billing_state_without_stripe_ids(ddb_table, user_row, stripe_stub):
    user_row(plan="pro", subscription_status="past_due", entitlement_grace_until=1, billing_revision=3,
             last_checkout_intent_id="i1", stripe_subscription_id="sub_1", stripe_customer_id="cus_1",
             cancel_at_period_end=True, current_period_end=1_800_000_000, plan_updated_at="2026-01-01T00:00:00+00:00")
    code, body = _get()
    assert code == 200
    assert body == {
        "plan": "pro",
        "effective_plan": "free",
        "subscription_status": "past_due",
        "entitlement_grace_until": 1,
        "last_checkout_intent_id": "i1",
        "billing_revision": 3,
        "plan_updated_at": "2026-01-01T00:00:00+00:00",
        "cancel_at_period_end": True,
        "current_period_end": 1_800_000_000,
    }


def test_me_defaults_for_fresh_user(ddb_table, user_row, stripe_stub):
    user_row()
    code, body = _get()
    assert code == 200
    assert body["plan"] == "free" and body["effective_plan"] == "free"
    assert body["billing_revision"] == 0 and body["subscription_status"] is None


def test_me_requires_auth(ddb_table, stripe_stub):
    assert _get(auth={"is_authenticated": "false"})[0] == 401
```

- [ ] **Step 3: Failing webhook entry tests**

`infrastructure/lambda/billing/tests/test_webhook_entry.py`:
```python
import base64
import json

from conftest import api_event, make_event, make_subscription, sign


def _post(body: str, sig: str, base64_body=False):
    import app

    ev = api_event("POST", "/api/billing/webhook", body, headers={"stripe-signature": sig}, auth={})
    if base64_body:
        ev["body"] = base64.b64encode(body.encode()).decode()
        ev["isBase64Encoded"] = True
    resp = app.lambda_handler(ev, None)
    return resp["statusCode"], json.loads(resp["body"])


def test_bad_signature_is_400_and_touches_nothing(ddb_table, stripe_stub, monkeypatch):
    import webhook

    called = []
    monkeypatch.setattr(webhook, "handle_event", lambda e: called.append(e))
    body, _ = json.dumps(make_event("customer.subscription.updated", {})), None
    code, _ = _post(body, sign(body, secret="whsec_wrong"))
    assert code == 400 and called == []


def test_livemode_mismatch_is_400_before_any_work(ddb_table, stripe_stub, monkeypatch):
    import webhook

    called = []
    monkeypatch.setattr(webhook, "handle_event", lambda e: called.append(e))
    seen = []
    import app

    monkeypatch.setattr(app.metrics, "add_metric", lambda **kw: seen.append(kw["name"]))
    body = json.dumps(make_event("customer.subscription.updated", {}, livemode=True))
    code, _ = _post(body, sign(body))
    assert code == 400 and called == [] and "WebhookLivemodeMismatch" in seen


def test_valid_event_dispatches_and_returns_outcome(ddb_table, stripe_stub, monkeypatch):
    import webhook

    monkeypatch.setattr(webhook, "handle_event", lambda e: "applied")
    body = json.dumps(make_event("customer.subscription.updated", {}))
    code, resp = _post(body, sign(body))
    assert code == 200 and resp == {"received": True, "outcome": "applied"}


def test_base64_body_verifies_on_exact_bytes(ddb_table, stripe_stub, monkeypatch):
    import webhook

    monkeypatch.setattr(webhook, "handle_event", lambda e: "applied")
    body = json.dumps(make_event("customer.subscription.updated", {}))
    code, _ = _post(body, sign(body), base64_body=True)
    assert code == 200


def test_infrastructure_error_is_500_so_stripe_retries(ddb_table, stripe_stub, monkeypatch):
    import webhook

    def boom(e):
        raise RuntimeError("dynamodb down")

    monkeypatch.setattr(webhook, "handle_event", boom)
    body = json.dumps(make_event("customer.subscription.updated", {}))
    code, _ = _post(body, sign(body))
    assert code == 500


def test_end_to_end_signed_install(ddb_table, user_row, stripe_stub):
    from conftest import get_user

    user_row(pending_intent_id="intent-1")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="active")
    session = {"id": "cs_1", "subscription": "sub_1", "customer": "cus_1",
               "metadata": {"user_id": "u1", "org_id": "org1", "intent_id": "intent-1"}}
    body = json.dumps(make_event("checkout.session.completed", session))
    code, resp = _post(body, sign(body))
    assert code == 200 and resp["outcome"] == "applied"
    assert get_user(ddb_table)["subscription_status"] == "active"
```

Run: `cd infrastructure/lambda/billing && ../../../.venv/bin/python -m pytest tests -q` → the three new files fail (old `app.py` has no `/billing/me`, no intent handling).

- [ ] **Step 4: Rewrite `app.py`**

```python
"""
Plinths Billing Lambda — Stripe subscriptions.

  POST /api/billing/checkout  → Checkout Session (auth; body {plan, intent_id})
  POST /api/billing/portal    → Customer Portal session (auth)
  GET  /api/billing/me        → billing state for the activation poll (auth)
  POST /api/billing/webhook   → Stripe events (no auth; signature-verified)

Design record: docs/superpowers/specs/2026-09-11-billing-hardening-design.md
"""

from __future__ import annotations

import os
import uuid

import stripe
from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.typing import LambdaContext
from botocore.exceptions import ClientError
from plinths_auth.billing import effective_plan

import store
import stripe_client
import webhook

logger = Logger()
tracer = Tracer()
metrics = Metrics()
app = APIGatewayRestResolver(strip_prefixes=["/api"])

APP_DOMAIN = os.environ["APP_DOMAIN"].rstrip("/")
PRICE_IDS = {
    "pro": os.environ.get("STRIPE_PRICE_ID_PRO", ""),
    "max": os.environ.get("STRIPE_PRICE_ID_MAX", ""),
    "pro_annual": os.environ.get("STRIPE_PRICE_ID_PRO_ANNUAL", ""),
    "max_annual": os.environ.get("STRIPE_PRICE_ID_MAX_ANNUAL", ""),
}


def _auth() -> dict:
    authorizer = app.current_event.raw_event.get("requestContext", {}).get("authorizer", {}) or {}
    return {
        "user_id": authorizer.get("user_id", "anonymous"),
        "org_id": authorizer.get("org_id", "anonymous"),
        "is_authenticated": authorizer.get("is_authenticated", "false") == "true",
        "email": authorizer.get("email", ""),
    }


def _get_or_create_stripe_customer(auth: dict, row: dict) -> str:
    """Race-guarded: only the first writer's customer id persists; the loser deletes its orphan."""
    stripe_client.configure()
    if row.get("stripe_customer_id"):
        return row["stripe_customer_id"]
    customer = stripe.Customer.create(
        email=auth.get("email", ""),
        metadata={"user_id": auth["user_id"], "org_id": auth["org_id"]},
    )
    try:
        store._get_table().update_item(
            Key=store.user_key(auth["user_id"]),
            UpdateExpression="SET stripe_customer_id = :cid",
            ConditionExpression="attribute_not_exists(stripe_customer_id)",
            ExpressionAttributeValues={":cid": customer.id},
        )
        return customer.id
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        try:
            stripe.Customer.delete(customer.id)
        except stripe.error.StripeError as del_err:
            logger.warning("Could not delete orphan Stripe customer", extra={"orphan_customer_id": customer.id, "error": str(del_err)})
        winner = store.get_user(auth["user_id"]) or {}
        winner_id = winner.get("stripe_customer_id")
        if not winner_id:
            raise RuntimeError("stripe_customer_id missing after race") from e
        return winner_id


@app.post("/billing/checkout")
@tracer.capture_method
def create_checkout_session():
    auth = _auth()
    if not auth["is_authenticated"]:
        return {"error": "Authentication required"}, 401

    body = app.current_event.json_body
    if not isinstance(body, dict):
        return {"error": "Request body must be a JSON object."}, 400
    plan = body.get("plan", "pro")
    price_id = PRICE_IDS.get(plan)
    if not price_id:
        return {"error": f"Invalid plan: {plan}. Must be one of {sorted(PRICE_IDS)}."}, 400
    intent_id = body.get("intent_id")
    try:
        intent_id = str(uuid.UUID(str(intent_id)))
    except (ValueError, TypeError):
        return {"error": "intent_id must be a UUID."}, 400

    row = store.get_user(auth["user_id"])
    if row is None:
        return {"error": "User not found"}, 404
    if row.get("plan") == "admin":
        return {"error": "admin_accounts_cannot_subscribe"}, 400

    recorded = row.get("stripe_subscription_id")
    if recorded:
        existing = stripe_client.retrieve_subscription(recorded)
        if stripe_client.is_live(existing):
            return {"error": "subscription_exists"}, 409

    customer_id = _get_or_create_stripe_customer(auth, row)
    store.set_pending_intent(auth["user_id"], intent_id)

    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            client_reference_id=auth["user_id"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=f"{APP_DOMAIN}?billing=success",
            cancel_url=f"{APP_DOMAIN}?billing=cancelled",
            metadata={"user_id": auth["user_id"], "org_id": auth["org_id"], "intent_id": intent_id},
            subscription_data={"metadata": {"user_id": auth["user_id"], "intent_id": intent_id}},
            idempotency_key=f"checkout:{intent_id}",
        )
    except stripe.error.IdempotencyError:
        return {"error": "intent_reused"}, 409
    except stripe.error.StripeError as e:
        logger.error("Stripe checkout creation failed", extra={"user_id": auth["user_id"], "plan": plan, "error": str(e)})
        return {"error": "Could not start checkout. Please try again."}, 502

    logger.info("Checkout session created", extra={"user_id": auth["user_id"], "plan": plan, "session_id": session.id, "intent_id": intent_id})
    return {"checkout_url": session.url}


@app.post("/billing/portal")
@tracer.capture_method
def create_portal_session():
    auth = _auth()
    if not auth["is_authenticated"]:
        return {"error": "Authentication required"}, 401
    row = store.get_user(auth["user_id"]) or {}
    customer_id = _get_or_create_stripe_customer(auth, row)
    try:
        portal = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{APP_DOMAIN}?billing=portal",
            idempotency_key=f"portal:{uuid.uuid4()}",
        )
    except stripe.error.StripeError as e:
        logger.error("Stripe portal creation failed", extra={"user_id": auth["user_id"], "error": str(e)})
        return {"error": "Could not open the billing portal. Please try again."}, 502
    return {"portal_url": portal.url}


@app.get("/billing/me")
@tracer.capture_method
def get_billing_me():
    auth = _auth()
    if not auth["is_authenticated"]:
        return {"error": "Authentication required"}, 401
    row = store.get_user(auth["user_id"])
    if row is None:
        return {"error": "User not found"}, 404
    grace = row.get("entitlement_grace_until")
    return {
        "plan": row.get("plan") or "free",
        "effective_plan": effective_plan(row),
        "subscription_status": row.get("subscription_status"),
        "entitlement_grace_until": int(grace) if grace is not None else None,
        "last_checkout_intent_id": row.get("last_checkout_intent_id"),
        "billing_revision": int(row.get("billing_revision") or 0),
        "plan_updated_at": row.get("plan_updated_at"),
        "cancel_at_period_end": bool(row.get("cancel_at_period_end", False)),
        "current_period_end": int(row.get("current_period_end") or 0),
    }


@app.post("/billing/webhook")
@tracer.capture_method
def stripe_webhook():
    """Signature → parse → livemode → handle. Nothing else runs before the signature passes."""
    payload = app.current_event.decoded_body or ""
    sig_header = app.current_event.get_header_value("stripe-signature") or ""
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, stripe_client.webhook_secret())
    except stripe.error.SignatureVerificationError:
        metrics.add_metric(name="WebhookSignatureFailure", unit=MetricUnit.Count, value=1)
        return {"error": "Invalid signature"}, 400
    except (ValueError, KeyError, stripe.error.StripeError):
        metrics.add_metric(name="WebhookMalformedPayload", unit=MetricUnit.Count, value=1)
        return {"error": "Bad request"}, 400

    expected_live = os.environ.get("STRIPE_LIVEMODE", "false") == "true"
    if bool(event.get("livemode")) != expected_live:
        metrics.add_metric(name="WebhookLivemodeMismatch", unit=MetricUnit.Count, value=1)
        logger.error("Webhook livemode mismatch", extra={"event_id": event["id"], "event_livemode": event.get("livemode")})
        return {"error": "livemode mismatch"}, 400

    logger.info("Webhook received", extra={"event_id": event["id"], "event_type": event["type"]})
    try:
        outcome = webhook.handle_event(event.to_dict_recursive() if hasattr(event, "to_dict_recursive") else dict(event))
    except Exception:
        logger.exception("Webhook handling failed; Stripe will retry", extra={"event_id": event["id"]})
        metrics.add_metric(name="WebhookUnexpectedError", unit=MetricUnit.Count, value=1)
        return {"error": "Internal error"}, 500
    return {"received": True, "outcome": outcome}


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
```

Note: `stripe.Webhook.construct_event` returns a `stripe.Event`; `to_dict_recursive()` turns it into plain dicts so `webhook.py` and the tests only ever see dicts. If `stripe_stub` replaced `construct_event` in some test, the fallback `dict(event)` keeps it working.

- [ ] **Step 5: Delete the old `requirements.txt` comment drift, run everything**

`infrastructure/lambda/billing/requirements.txt` stays `stripe==12.1.0` (boto3 and Powertools come from the runtime and layer).

```bash
cd infrastructure/lambda/billing && ../../../.venv/bin/python -m pytest tests -q && cd -
.venv/bin/ruff check infrastructure/lambda/billing && .venv/bin/ruff format infrastructure/lambda/billing
.venv/bin/mypy infrastructure/lambda/billing --ignore-missing-imports --no-strict-optional
```
Expected: every test in `tests/` passes; ruff and mypy clean. If Powertools' `decoded_body` is not present in the installed version, `pip show aws-lambda-powertools` must show ≥ 2.x; it is present in v3.

- [ ] **Step 6: Commit**

```bash
git add infrastructure/lambda/billing
git commit -m "feat(billing): intent-keyed checkout, 409 on live subscription, GET /billing/me, hardened webhook entry

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK"
git push
```

---

### Task 8: Frontend API client + `useBilling` rewrite

**Files:**
- Modify: `frontend/src/api.ts:262-285`
- Rewrite: `frontend/src/hooks/useBilling.ts`

**Interfaces:**
- Produces (`api.ts`): `startBillingCheckout(plan: BillingPlan, intentId: string): Promise<{ checkout_url: string }>`; `getBillingMe(): Promise<BillingMeResponse>`; `interface BillingMeResponse { plan: string; effective_plan: string; subscription_status: string | null; entitlement_grace_until: number | null; last_checkout_intent_id: string | null; billing_revision: number; plan_updated_at: string | null; cancel_at_period_end: boolean; current_period_end: number }`. `ApiError` already carries `.status`.
- Produces (`useBilling.ts`): same public surface as today (`checkout`, `portal`, `activation`, `startCheckout(plan)`, `openPortal()`, `beginActivationPoll()`, `cancelActivationPoll()`, `dismissCheckoutError()`, `dismissPortalError()`) plus `checkPortalReturn(): Promise<boolean>` (true when `billing_revision` changed since the portal was opened). `beginActivationPoll` takes **no arguments** now; it reads the `plinths.checkout` record. `ActivationState` gains `{ kind: 'unknown' }` for the no-record case.

There is no frontend test runner in this repo; verification is `bun run build` + `bun run lint` and the manual QA list in the spec.

- [ ] **Step 1: `api.ts`**

Replace the block from `export type BillingPlan` through `openBillingPortal` with:
```ts
export type BillingPlan = 'pro' | 'pro_annual' | 'max' | 'max_annual';

export interface MeResponse {
  is_authenticated: boolean;
  user_id?: string;
  email?: string;
  plan: string;
  stale?: boolean;
}

export interface BillingMeResponse {
  plan: string;
  effective_plan: string;
  subscription_status: string | null;
  entitlement_grace_until: number | null;
  last_checkout_intent_id: string | null;
  billing_revision: number;
  plan_updated_at: string | null;
  cancel_at_period_end: boolean;
  current_period_end: number;
}

export function getMe(): Promise<MeResponse> {
  return request<MeResponse>('/api/me');
}

export function getBillingMe(): Promise<BillingMeResponse> {
  return request<BillingMeResponse>('/api/billing/me');
}

export function startBillingCheckout(plan: BillingPlan, intentId: string): Promise<{ checkout_url: string }> {
  return request('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan, intent_id: intentId }),
  });
}

export function openBillingPortal(): Promise<{ portal_url: string }> {
  return request('/api/billing/portal', { method: 'POST' });
}
```

- [ ] **Step 2: `useBilling.ts`**

Replace the whole file:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  getBillingMe,
  openBillingPortal,
  startBillingCheckout,
  type BillingPlan,
} from '../api';

type CheckoutState =
  | { kind: 'idle' }
  | { kind: 'redirecting'; plan: BillingPlan }
  | { kind: 'error'; message: string; lastPlan: BillingPlan };

type PortalState =
  | { kind: 'idle' }
  | { kind: 'redirecting' }
  | { kind: 'error'; message: string };

type ActivationState =
  | { kind: 'idle' }
  | { kind: 'polling'; startedAt: number }
  | { kind: 'lagged'; startedAt: number }
  | { kind: 'done'; plan: string }
  | { kind: 'unknown' }
  | { kind: 'error'; message: string };

const POLL_INTERVAL_MS = 800;
const LAG_THRESHOLD_MS = 10_000;
const MAX_TOTAL_MS = 60_000;
const ENTITLED = new Set(['active', 'trialing']);

const CHECKOUT_KEY = 'plinths.checkout';
const PORTAL_KEY = 'plinths.portal';

interface CheckoutRecord {
  intentId: string;
  plan: BillingPlan;
  startedAt: number;
}

function readCheckout(): CheckoutRecord | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutRecord>;
    if (typeof parsed.intentId !== 'string' || typeof parsed.plan !== 'string') return null;
    return parsed as CheckoutRecord;
  } catch {
    return null;
  }
}

function writeCheckout(rec: CheckoutRecord | null) {
  try {
    if (rec) sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(rec));
    else sessionStorage.removeItem(CHECKOUT_KEY);
  } catch { /* private mode */ }
}

function readPortalRevision(): number | null {
  try {
    const raw = sessionStorage.getItem(PORTAL_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function writePortalRevision(rev: number | null) {
  try {
    if (rev === null) sessionStorage.removeItem(PORTAL_KEY);
    else sessionStorage.setItem(PORTAL_KEY, String(rev));
  } catch { /* private mode */ }
}

function mintIntent(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for very old WebViews: RFC 4122 v4 from Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function useBilling() {
  const [checkout, setCheckout] = useState<CheckoutState>({ kind: 'idle' });
  const [portal, setPortal] = useState<PortalState>({ kind: 'idle' });
  const [activation, setActivation] = useState<ActivationState>({ kind: 'idle' });

  const pollHandleRef = useRef<{ cancelled: boolean } | null>(null);

  useEffect(() => () => {
    if (pollHandleRef.current) pollHandleRef.current.cancelled = true;
  }, []);

  const openPortal = useCallback(async () => {
    setPortal({ kind: 'redirecting' });
    try {
      // Remember the revision so the return path can tell whether anything changed.
      try {
        const me = await getBillingMe();
        writePortalRevision(me.billing_revision);
      } catch {
        writePortalRevision(null);
      }
      const { portal_url } = await openBillingPortal();
      window.location.href = portal_url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not reach Stripe.';
      setPortal({ kind: 'error', message });
    }
  }, []);

  /**
   * One intent per checkout attempt. The same intent is resent on the
   * retry-after-error path (same plan), so Stripe collapses it to one Session.
   * A 409 `subscription_exists` means an upgrade, not a new subscription:
   * hand off to the portal. A 409 `intent_reused` means the intent was bound
   * to different parameters: mint a fresh one and retry once.
   */
  const startCheckout = useCallback(async (plan: BillingPlan, retryIntent?: string) => {
    setCheckout({ kind: 'redirecting', plan });
    const existing = readCheckout();
    const intentId = retryIntent ?? (existing && existing.plan === plan ? existing.intentId : mintIntent());
    writeCheckout({ intentId, plan, startedAt: Date.now() });
    try {
      const { checkout_url } = await startBillingCheckout(plan, intentId);
      window.location.href = checkout_url;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        if (err.message === 'subscription_exists') {
          writeCheckout(null);
          setCheckout({ kind: 'idle' });
          await openPortal();
          return;
        }
        if (err.message === 'intent_reused' && !retryIntent) {
          await startCheckout(plan, mintIntent());
          return;
        }
      }
      const message = err instanceof Error ? err.message : 'Could not reach Stripe.';
      setCheckout({ kind: 'error', message, lastPlan: plan });
    }
  }, [openPortal]);

  const dismissCheckoutError = useCallback(() => {
    writeCheckout(null);
    setCheckout({ kind: 'idle' });
  }, []);

  const dismissPortalError = useCallback(() => {
    setPortal({ kind: 'idle' });
  }, []);

  /**
   * Poll GET /api/billing/me until the row reports *this* checkout's intent
   * AND an entitled status. The intent keeps an unrelated portal change in
   * another tab from being mistaken for this checkout; the status keeps
   * checkout.session.completed from reporting success while the
   * subscription is still `incomplete`.
   */
  const beginActivationPoll = useCallback(() => {
    if (pollHandleRef.current) pollHandleRef.current.cancelled = true;
    const record = readCheckout();
    if (!record) {
      // No intent to correlate (different browser, cleared storage). One look, then stop.
      setActivation({ kind: 'polling', startedAt: Date.now() });
      void getBillingMe()
        .then(me => {
          setActivation(me.effective_plan !== 'free' ? { kind: 'done', plan: me.effective_plan } : { kind: 'unknown' });
        })
        .catch(() => setActivation({ kind: 'unknown' }));
      return;
    }

    const handle = { cancelled: false };
    pollHandleRef.current = handle;
    const startedAt = Date.now();
    setActivation({ kind: 'polling', startedAt });

    const tick = async () => {
      if (handle.cancelled) return;
      const elapsed = Date.now() - startedAt;
      try {
        const me = await getBillingMe();
        if (handle.cancelled) return;
        if (
          me.last_checkout_intent_id === record.intentId &&
          me.subscription_status !== null &&
          ENTITLED.has(me.subscription_status)
        ) {
          writeCheckout(null);
          setActivation({ kind: 'done', plan: me.effective_plan });
          return;
        }
      } catch {
        // Transient network error — keep polling. Don't surface unless we time out.
      }
      if (handle.cancelled) return;
      if (elapsed >= MAX_TOTAL_MS) {
        setActivation({
          kind: 'error',
          message: 'Your plan is taking longer than usual to activate. Refresh to try again.',
        });
        return;
      }
      if (elapsed >= LAG_THRESHOLD_MS) setActivation({ kind: 'lagged', startedAt });
      window.setTimeout(tick, POLL_INTERVAL_MS);
    };
    void tick();
  }, []);

  const cancelActivationPoll = useCallback(() => {
    if (pollHandleRef.current) pollHandleRef.current.cancelled = true;
    pollHandleRef.current = null;
    setActivation({ kind: 'idle' });
  }, []);

  /** Returning from the Customer Portal: did anything change while we were away? */
  const checkPortalReturn = useCallback(async (): Promise<boolean> => {
    const before = readPortalRevision();
    writePortalRevision(null);
    try {
      const me = await getBillingMe();
      return before === null || me.billing_revision !== before;
    } catch {
      return true; // can't tell — refresh anyway
    }
  }, []);

  return {
    checkout,
    portal,
    activation,
    startCheckout,
    openPortal,
    beginActivationPoll,
    cancelActivationPoll,
    checkPortalReturn,
    dismissCheckoutError,
    dismissPortalError,
  };
}

export type UseBillingResult = ReturnType<typeof useBilling>;
```

- [ ] **Step 3: Type-check (expect App.tsx errors only)**

```bash
cd frontend && bunx tsc -b --noEmit
```
Expected: errors only in `App.tsx` (`beginActivationPoll` argument) and possibly `ActivatingPlan.tsx` (`'unknown'` kind not handled). Fixed in Task 9.

- [ ] **Step 4: Commit (WIP is fine — the branch is not main)**

```bash
git add frontend/src/api.ts frontend/src/hooks/useBilling.ts
git commit -m "feat(frontend): intent-keyed checkout + revision/intent activation poll

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK"
git push
```

---

### Task 9: `App.tsx` and `ActivatingPlan.tsx` wiring

**Files:**
- Modify: `frontend/src/App.tsx:172-217` (billing flag effect), `:476` (retry button)
- Modify: `frontend/src/components/ActivatingPlan.tsx` (handle `'unknown'`)

- [ ] **Step 1: App.tsx billing flag effect**

Replace the effect that starts `// Read ?billing=success|cancelled once on boot` with:
```tsx
  // Read ?billing=success|cancelled|portal once on boot, strip the query, dispatch.
  const billingFlagHandledRef = useRef(false);
  useEffect(() => {
    if (billingFlagHandledRef.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('billing');
    if (flag !== 'success' && flag !== 'cancelled' && flag !== 'portal') return;
    billingFlagHandledRef.current = true;
    params.delete('billing');
    params.delete('session_id');
    const remaining = params.toString();
    const url = window.location.pathname + (remaining ? `?${remaining}` : '');
    window.history.replaceState({}, '', url);
    if (flag === 'success') {
      billing.beginActivationPoll();
    } else if (flag === 'portal') {
      void billing.checkPortalReturn().then(changed => { if (changed) void auth.refresh(); });
    }
    // billing.* and auth.refresh are stable callbacks; the whole objects would refire this on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing.beginActivationPoll, billing.checkPortalReturn, auth.refresh]);
```

- [ ] **Step 2: Retry button**

At the `void billing.startCheckout(billing.checkout.lastPlan);` call (~line 476) nothing changes: the hook reuses the stored intent for the same plan.

- [ ] **Step 3: ActivatingPlan handles `'unknown'` and names the real plan**

In `frontend/src/components/ActivatingPlan.tsx`:

`paused` prop (line ~110):
```tsx
                paused={activation.kind === 'done' || activation.kind === 'error' || activation.kind === 'unknown'}
```
Title (line ~115) — the old copy said "Pro is live." even for a Max checkout:
```tsx
              {activation.kind === 'done' ? `${activation.plan === 'max' ? 'Max' : 'Pro'} is live.` :
               activation.kind === 'error' ? 'Activation is taking longer than usual.' :
               activation.kind === 'unknown' ? 'Your plan will land shortly.' :
               'Building your plan.'}
```
Description (line ~121):
```tsx
              {activation.kind === 'done'
                ? 'Workspace ready.'
                : activation.kind === 'error'
                ? 'Your charge succeeded. Stripe is still confirming with us.'
                : activation.kind === 'unknown'
                ? 'We could not match this tab to your checkout. Refresh in a minute and your plan will be there.'
                : activation.kind === 'lagged'
                ? 'Your charge succeeded. Final confirmation incoming.'
                : 'Your charge succeeded. Stacking your workspace.'}
```
Refresh button condition (line ~134):
```tsx
              {activation.kind === 'lagged' || activation.kind === 'error' || activation.kind === 'unknown' ? (
```

- [ ] **Step 4: Verify**

```bash
cd frontend && bun run lint && bun run build
```
Expected: clean. Then run the app (`bun dev` with the dev API proxy per `frontend/.env`) and exercise steps 1, 2 and 9 of the spec's manual QA list against the dev stack once the backend is deployed (Task 11).

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): portal-return refresh, no-record activation state

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK"
git push
```

---

### Task 10: CI python-test job, docs

**Files:**
- Modify: `.github/workflows/ci.yml` (after the `python-lint` job)
- Modify: `docs/operations/SECURITY.md` (new "Stripe webhook" section)
- Modify: `CLAUDE.md` (API table rows for billing; `useBilling` description; Stripe return flow paragraph)
- Modify: `docs/superpowers/specs/2026-09-11-billing-hardening-design.md` status → `implemented`

- [ ] **Step 1: CI job**

Insert after the `python-lint` job:
```yaml
  python-test:
    name: Python Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.13'

      # Every Lambda / layer directory that ships a tests/ folder and a
      # requirements-dev.txt runs in isolation so their deps never collide.
      - name: Run pytest per directory
        run: |
          set -euo pipefail
          failed=0
          for d in infrastructure/lambda/*/ infrastructure/layers/*/; do
            [ -d "$d/tests" ] || continue
            echo "=== $d"
            python -m venv "/tmp/venv-$(basename "$d")"
            # shellcheck disable=SC1090
            . "/tmp/venv-$(basename "$d")/bin/activate"
            pip install -q --upgrade pip
            [ -f "$d/requirements.txt" ] && pip install -q -r "$d/requirements.txt" || true
            [ -f "$d/requirements-dev.txt" ] && pip install -q -r "$d/requirements-dev.txt" || true
            (cd "$d" && python -m pytest tests -q) || failed=1
            deactivate
          done
          exit $failed
```
Note: the ai-orchestration tests have never run in CI. If they fail here, fix or `@pytest.mark.skip` them in a separate commit with a reason — do not drop the job.

- [ ] **Step 2: SECURITY.md**

Append:
```markdown
## Stripe webhook

- The Stripe dashboard endpoint for `POST /api/billing/webhook` points at the **execute-api URL** (`https://<api-id>.execute-api.us-east-1.amazonaws.com/<stage>/api/billing/webhook`), never the CloudFront domain. No cookies are involved and nothing sits between Stripe and signature verification.
- Order inside the handler is fixed: verify the signature on the exact request bytes, parse, check `livemode` against `STRIPE_LIVEMODE`, and only then touch Stripe or DynamoDB. An unverified caller cannot drive spend.
- Each stage has its own API key, webhook secret (SSM SecureString) and price IDs. Staging never points at the production table.
- Alarms worth wiring: `WebhookLivemodeMismatch`, `UnknownPriceId`, `DoubleSubscriptionCancelled` (manual refund runbook), `WebhookOrphanUser`.
```

- [ ] **Step 3: CLAUDE.md**

In the API table, change the checkout row's body to `{"plan": ..., "intent_id": "<uuid>"}` and add a row: `| GET | \`/api/billing/me\` | required | Billing state for the activation poll: \`effective_plan\`, \`subscription_status\`, \`billing_revision\`, \`last_checkout_intent_id\` |`. Replace the `useBilling.ts` bullet and the **Stripe return flow** paragraph with: the frontend mints a UUID intent per checkout, stores it in `sessionStorage` (`plinths.checkout`), and the activation poll on `?billing=success` watches `GET /api/billing/me` until `last_checkout_intent_id` matches and `subscription_status` is `active`/`trialing`; `?billing=portal` refetches and refreshes auth when `billing_revision` changed. In **Plans**, add: "`plan` records the Stripe price; `subscription_status` says whether it is paid for; gates read `plinths_auth.billing.effective_plan`, never `plan` directly. A hand-set `pro` with no status reads as free — comp through a Stripe coupon or trial."

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml docs CLAUDE.md
git commit -m "ci+docs(billing): python-test job, webhook endpoint rule, route table

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK"
git push
```

---

### Task 11: Deploy to dev, run the QA list, open the PR

**Files:** none new.

- [ ] **Step 1: Full local verification**

```bash
.venv/bin/ruff check infrastructure/lambda/ infrastructure/layers/ scripts/ && .venv/bin/ruff format --check infrastructure/lambda/ infrastructure/layers/ scripts/
for d in infrastructure/lambda/*/; do .venv/bin/mypy "$d" --ignore-missing-imports --no-strict-optional; done
(cd infrastructure/lambda/billing && ../../../.venv/bin/python -m pytest tests -q)
(cd infrastructure/layers/plinths-auth-shared && ../../../.venv/bin/python -m pytest tests -q)
(cd frontend && bun run lint && bun run build)
sam validate --lint
```

- [ ] **Step 2: Deploy dev and run the spec's manual QA list**

```bash
sam build && bin/deploy   # dev stack per samconfig.toml
stripe listen --forward-to https://<api-id>.execute-api.us-east-1.amazonaws.com/dev/api/billing/webhook
```
Put the `whsec_` that `stripe listen` prints into `/marketlens/dev/stripe-webhook-secret` for the session. Walk QA items 1–9 from the spec. Record the outcome of each in the PR body; anything that fails is fixed on the branch before the PR opens.

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base main --head feat/billing-hardening --title "Billing hardening: status-based entitlement, transactional webhook, intent-keyed checkout" --body-file - <<'PR'
## Why
The billing Lambda granted access on `plan` alone, had no webhook dedup or ordering, reset plans by customer id, and let a second checkout double-bill. Spec: `docs/superpowers/specs/2026-09-11-billing-hardening-design.md`.

## What
- `plinths_auth.billing.effective_plan` — one entitlement predicate; every gate uses it
- Billing Lambda split into `stripe_client` / `store` / `webhook` / `app`; marker + row update in one `TransactWriteItems`
- Install path gated by checkout intent; state path pinned to subscription id, terminal on `canceled`, refetches from Stripe
- `past_due` grace (7 d) only extends existing entitlement
- Checkout: UUID intent as idempotency key, 409 on a live subscription, admin guard
- `GET /api/billing/me` + frontend poll on intent + status; portal return watches `billing_revision`
- CI runs Python tests for the first time

## Manual QA (dev stack, `stripe listen`)
<paste the 1–9 results here>

## Follow-ups
- Alarms on `WebhookLivemodeMismatch`, `UnknownPriceId`, `DoubleSubscriptionCancelled`, `WebhookOrphanUser`
- iOS purchase path (own spec)
- Re-point the production webhook endpoint at execute-api after merge

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MAoTMv1nqvYAKPB5DcygqK
PR
```
