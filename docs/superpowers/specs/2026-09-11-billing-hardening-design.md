# Billing hardening — design

**Date:** 2026-09-11
**Status:** proposed
**Scope:** Plinths only. Backend billing Lambda, shared auth layer, plan gates, frontend activation flow, infra, tests.

## Why

`infrastructure/lambda/billing/app.py` was reviewed end to end while it served as the template for another project's billing design. The review found that the Lambda is the right *shape* (one Lambda, plan state on the user row, SSM secrets) but not correct. Verified against the code on 2026-09-11:

| # | Gap | Consequence |
|---|---|---|
| 1 | No `subscription_status`; `plan` alone grants access. `invoice.payment_failed` only logs | A `past_due` or `paused` subscription keeps paid access for weeks until Stripe cancels it |
| 2 | `customer.subscription.deleted` resets to free keyed on `customer_id` only | Cancel at period end, resubscribe, and the old subscription's deletion (up to a month later) wipes the new paid plan |
| 3 | Checkout never checks for an existing live subscription | Two checkouts create two subscriptions; the user is billed twice |
| 4 | No webhook dedup, no ordering guard | Stripe delivers at least once and out of order. A delayed `.updated` after `.deleted` resurrects a paid plan |
| 5 | Idempotency key is a minute bucket | A retry across the minute boundary mints a second Checkout Session |
| 6 | Customer reverse lookup is a full scan of the shared reports table | Cost and latency grow with every report written, on every subscription event |
| 7 | No `customer.subscription.created` / `.paused` / `.resumed`; no `livemode` check | Paused subscriptions keep access; a test-mode event against a misconfigured endpoint mutates real rows |
| 8 | ORG row plan written on checkout, never on update or delete | Latent drift; nothing reads ORG plan today |
| 9 | No tests | None of the above is caught |
| 10 | Activation poll watches the `plan` string | Monthly to annual and reactivation never change the string; the poll waits 60 s and reports failure |

There are zero subscriptions and zero users, so no migration, no backfill, and no compatibility constraint on the user row.

## Decisions

- **Plan is per user.** The ORG row's `plan` attribute stops being written. Nothing reads it.
- **`plan` records what Stripe says the price is; `subscription_status` records whether it is paid for.** Neither is deleted on downgrade. The gates read an *effective plan* derived from both.
- **Entitlement is one function, defined once, in the shared `plinths_auth` layer.** Every gate and every plan surface calls it. No Lambda re-derives it.
- **Stripe is the authority; the webhook is the nudge.** Every subscription-state write refetches the subscription from the Stripe API and writes what the API reports, never what the event payload says.
- **Dedup and the state write are one DynamoDB transaction.** Marking first and writing second is the bug the transaction exists to prevent.
- **The client mints the checkout intent.** One UUID per attempt, resent verbatim on retry, and it is the Stripe idempotency key.
- **Grace on `past_due` is 7 days**, set only when a subscription that was already entitled becomes `past_due`. It extends access; it never grants it. Configurable via env var.
- **Out of scope**, as decisions not oversights: disputes and refunds (Stripe moves the status; the manual path is fine at this volume), proration previews, tax beyond Stripe Tax config, iOS purchases (its own spec), centralising the per-Lambda tier limit tables (they stay where they are; only the plan string they key on changes).

## Data model

All on the existing user row (`pk = sk = USER#<sub>`) in `marketlens-reports-<stage>`. snake_case like its neighbours.

| Attribute | Type | Written by | Meaning |
|---|---|---|---|
| `plan` | S | webhook | `free` / `pro` / `max` from the subscription's price id; `admin` is set by hand and has no subscription |
| `subscription_status` | S | webhook | Stripe's status string, verbatim, from the refetched subscription |
| `stripe_customer_id` | S | checkout, webhook | existing |
| `stripe_subscription_id` | S | webhook install only | the *current* subscription. Generation pin for every other write |
| `billing_source_event_created` | N | webhook | `event.created` of the last event that wrote subscription state. Ordering guard |
| `billing_revision` | N | webhook, `ADD 1` | change notification for the frontend. Bumped only by a write that changes a field |
| `pending_intent_id` | S | checkout | the intent the server most recently issued a Session for. Cleared on install |
| `last_checkout_intent_id` | S | webhook install | echoed from `metadata.intent_id`; the activation poll correlates on it |
| `entitlement_grace_until` | N (epoch s) | webhook | set only on the entitled → `past_due` transition |
| `plan_updated_at` | S | webhook | existing |

**Processed-event marker.** `pk = sk = BILLING_EVENT#<event.id>`, `ttl` = now + 72 h. The reports table gets `TimeToLiveSpecification` on `ttl` (the muse table already has one). 72 h covers Stripe's automatic retry window; a manual resend up to 30 days later is covered by the no-change rule (it writes nothing and bumps nothing).

## Entitlement (shared layer)

`plinths_auth.billing` gains:

```python
ENTITLED_STATUSES = {"active", "trialing"}
BILLING_ATTRS = ("plan", "subscription_status", "entitlement_grace_until")

def is_entitled(row: dict, now: int) -> bool:
    status = row.get("subscription_status")
    if status in ENTITLED_STATUSES:
        return True
    if status == "past_due":
        return int(row.get("entitlement_grace_until") or 0) > now
    return False

def effective_plan(row: dict, now: int | None = None) -> str:
    plan = row.get("plan") or "free"
    if plan in ("free", "admin"):
        return plan
    return plan if is_entitled(row, now or int(time.time())) else "free"
```

`admin` passes through because it has no subscription. A `pro`/`max` row with no `subscription_status` reads as `free`: comps go through Stripe (100 % coupon or trial), not a hand-set `plan`.

Consumers, each changed from `row.get("plan")` to `effective_plan(row)` and each projecting `BILLING_ATTRS` instead of just `plan`:

- `plinths_auth.cookie_jwt.verify_session_cookie` → `AuthContext.plan`. This covers the authorizer (and therefore every cached authorizer context) and the muse stream Lambda.
- `api/app.py` `create_report` fresh read and `GET /api/me`.
- `export/app.py` `_resolve_current_plan`.
- `build-brief/app.py` `_fresh_plan`.
- `bff/app.py` `GET /auth/me`.

The `ConsistentRead=True` those reads already use stays.

## Billing Lambda

### `POST /api/billing/checkout`

Body `{ plan, intent_id }`. `intent_id` must parse as a UUID; otherwise 400.

1. Consistent read of the user row.
2. If `stripe_subscription_id` is set, retrieve it from Stripe. If its status is not in `{canceled, incomplete_expired}`, return **409 `{ error: "subscription_exists" }`**. The frontend routes to the portal, where an upgrade mutates the existing subscription.
3. Get or create the Stripe customer (existing race-guarded helper, unchanged).
4. `SET pending_intent_id = :intent` on the user row.
5. `stripe.checkout.Session.create(...)` with `idempotency_key = f"checkout:{intent_id}"`, `metadata = {user_id, org_id, intent_id}`, `subscription_data.metadata = {user_id, intent_id}`, `client_reference_id = user_id`, `success_url = APP_DOMAIN?billing=success`, `cancel_url = APP_DOMAIN?billing=cancelled`. `session_id` leaves the success URL: activation is webhook-driven and the frontend never used it.

Step 4 before step 5 is deliberate. The install guard in the webhook compares against `pending_intent_id`, and a Session that exists before the intent is recorded could complete before the record lands.

### `POST /api/billing/portal`

Two changes: the idempotency key becomes a fresh UUID per request (portal sessions are cheap and short-lived; there is nothing to collapse), and `return_url` becomes `APP_DOMAIN?billing=portal` so the frontend can tell a portal return from a cold load.

### `GET /api/billing/me`

Auth required. Consistent read. Returns:

```json
{ "plan", "effective_plan", "subscription_status", "entitlement_grace_until",
  "last_checkout_intent_id", "billing_revision", "plan_updated_at" }
```

### `POST /api/billing/webhook`

Order is fixed and nothing below a step runs if the step fails:

1. **Signature on the exact bytes.** Use `decoded_body` so a base64-encoded API Gateway body verifies. 400 on failure, metric, no log of contents.
2. **Parse.**
3. **`livemode` must equal `STRIPE_LIVEMODE`** (env, `"true"` only on the prod stage). Mismatch → 400, metric `WebhookLivemodeMismatch`, nothing else touched.
4. **Resolve the user.** `metadata.user_id` from the session (checkout events) or subscription (subscription events; `subscription_data.metadata` at checkout puts it there). Fallback when metadata is absent (a subscription created from the Stripe dashboard): `stripe.Customer.retrieve(customer).metadata.user_id`, which the customer-create helper already sets. The table scan is deleted.
5. **Dispatch** by type. Unhandled types return 200 immediately.
6. **Apply** via one `TransactWriteItems` containing the processed-event marker (`Put`, `attribute_not_exists(pk)`) and the user row update (`Update`, conditioned as below). On `TransactionCanceledException`, read `CancellationReasons`: marker failed → duplicate, 200; row condition failed → stale or superseded, log, metric `WebhookStaleEvent`, 200; anything else → raise, so Stripe retries. A stale-condition failure on the `past_due` path is retried once after a re-read (see below) before being treated as stale.

**Events handled**

| Event | Path |
|---|---|
| `checkout.session.completed` | install (subscription id from `session.subscription`) |
| `customer.subscription.created` | install (subscription id from `object.id`) |
| `customer.subscription.updated` / `.paused` / `.resumed` / `.deleted` | state |
| `invoice.payment_failed` | state, subscription id from `invoice.subscription` or, on the 2025+ API shape, `invoice.parent.subscription_details.subscription` |

**Install path** (may write `stripe_subscription_id`; the only path that may).

Refetch the subscription. Read the row (consistent). Compare `metadata.intent_id` against `pending_intent_id`:

| Case | Action | Row condition in the transaction |
|---|---|---|
| Intent matches | Install | `pending_intent_id = :intent` |
| Intent does not match, subscription not live | Drop (marker only) | — |
| Intent does not match, row holds this same subscription | No-op (marker only). This is the second of `checkout.session.completed` / `subscription.created` arriving | — |
| Intent does not match, row holds no live subscription | Install: it is the user's only real subscription | `attribute_not_exists(stripe_subscription_id) OR stripe_subscription_id = :recorded` |
| Intent does not match, row holds a *different* live subscription | Anomaly: cancel the newly found subscription via the API, metric `DoubleSubscriptionCancelled`, marker only | — |

Install writes `stripe_subscription_id`, `stripe_customer_id`, `plan`, `subscription_status`, `billing_source_event_created`, `last_checkout_intent_id = :intent`, `plan_updated_at`, `REMOVE pending_intent_id`, `ADD billing_revision 1`. "Live" means Stripe reports a status not in `{canceled, incomplete_expired}`. The install condition never compares timestamps: a replacement subscription can legitimately share an `event.created` second with the outgoing one's last event. A row-condition failure on install is re-read and reclassified (up to three attempts), never treated as stale — the only way an install condition fails is that a concurrent install won, and the re-read routes the loser into the reconcile table.

**State path** (never writes `stripe_subscription_id`).

Refetch the subscription. Read the row. Compute the write:

- `plan` from the refetched price id; `subscription_status` verbatim.
- If the refetched status is `past_due` and the row's current status is in `ENTITLED_STATUSES`: `entitlement_grace_until = event.created + GRACE_WINDOW_SECONDS`. Any other transition leaves it untouched; leaving `past_due` for `active` removes it.
- If nothing would change: marker only, no revision bump.

Row condition: `stripe_subscription_id = :sub_id AND subscription_status <> 'canceled' AND (attribute_not_exists(billing_source_event_created) OR billing_source_event_created <= :created)`, plus `subscription_status = :status_read` on the grace path so the transition decision is safe under concurrency. Equal timestamps pass because the write carries the refetched truth, not the payload. `canceled` is terminal for that subscription id; only an install can move the row off it.

## Frontend

`useBilling.startCheckout(plan)`:

1. `intentId = crypto.randomUUID()`; write `{ intentId, plan, startedAt }` to `sessionStorage` under `plinths.checkout`.
2. `POST /api/billing/checkout { plan, intent_id }`. On 409 `subscription_exists`, clear the record and call `openPortal()` instead. Redirect otherwise.

On `?billing=success` (already read once and stripped): read the record, poll `GET /api/billing/me` at the existing 800 ms / 10 s lag / 60 s cap. Done when `last_checkout_intent_id === intentId && ["active","trialing"].includes(subscription_status)`. Both halves matter: the intent keeps an unrelated portal change in another tab from being read as this checkout, and the status keeps `checkout.session.completed` from reporting success while the subscription is `incomplete`. The `baselinePlan` argument and plan-string comparison are removed. On done, clear the record and refresh auth.

**Portal return** is a separate path with no intent. Before redirecting to the portal, store `billing_revision` under `plinths.portal`. On return (`return_url` becomes `APP_DOMAIN?billing=portal`), fetch `GET /api/billing/me`; if `billing_revision` changed, refresh auth. No poll: the portal returns after Stripe has already processed the change, and if the webhook is still in flight the next page load catches it.

`MeResponse.plan` from `/api/me` is the effective plan, so every plan-gated component keeps working unchanged.

## Infra (`template.yaml`)

- `ReportsTable`: add `TimeToLiveSpecification { AttributeName: ttl, Enabled: true }`.
- `BillingFunction` env: `STRIPE_LIVEMODE` (`!If [IsProd, "true", "false"]`, adding the condition if absent), `GRACE_WINDOW_SECONDS: "604800"`.
- New `Api` event `GET /api/billing/me` with the default authorizer.
- Stripe dashboard: the webhook endpoint should point at the execute-api URL, not the CloudFront domain. Nothing sits between Stripe and signature verification that way. Documented in `docs/operations/SECURITY.md`; not a template change.

## Tests

`infrastructure/lambda/billing/tests/` with pytest, `moto` for DynamoDB (`transact_write_items` is supported), and monkeypatched `stripe.*` calls. Webhook tests sign real payloads with `stripe.WebhookSignature` so verification runs for real. Cases, one per row of the tables above plus:

- duplicate delivery of the same `event.id` writes nothing and bumps nothing
- `.updated` with `event.created` older than the recorded source is rejected; equal passes
- `.updated` for a superseded subscription id is rejected
- `.deleted` then late `.updated` on the same id stays `canceled`
- `past_due` from `active` sets grace; `past_due` from `incomplete` does not; `active` after `past_due` clears it
- `livemode` mismatch touches nothing
- checkout with a live subscription returns 409 and creates no Session
- `effective_plan` truth table, including `admin` and a `pro` row with no status

`infrastructure/layers/plinths-auth-shared/tests/` for the entitlement functions.

CI: a `python-test` job that runs `pytest` in every `infrastructure/lambda/*` and `infrastructure/layers/*` directory containing a `tests/` folder. Today the existing ai-orchestration tests are not run by CI; this job picks them up too.

## Edge cases (senior dev / QA pass)

Each row is a decision the code must make and a test must cover.

| Case | Decision |
|---|---|
| **Webhook for a user row that does not exist** (row deleted by hand; there is no account-deletion feature) | Detected on the pre-transaction read. Metric `WebhookOrphanUser`, log the user id, return 200. Returning 500 would make Stripe retry for three days and then disable the endpoint for every user |
| **Stripe API call fails during refetch** (5xx, rate limit, network) | Raise → 500 → Stripe retries. The Stripe client gets `max_network_retries = 2` and a 10 s request timeout, so three calls stay under the 30 s Lambda timeout instead of inheriting the SDK's 80 s default |
| **Async payment methods** (bank debit): `checkout.session.completed` fires with the subscription `incomplete` | The install refetch writes `incomplete`, effective plan stays free, the poll keeps waiting. `subscription.updated` → `active` finishes it. `checkout.session.async_payment_failed` needs no handler: the subscription goes `incomplete_expired` on its own |
| **Unknown price id** on a live subscription (prices rotated in the dashboard, env not updated) | Fail toward capped: `plan = free`, metric `UnknownPriceId` with an alarm, log the price id. The user is billed and gated; the alarm is what fixes it. Silently mapping to a paid tier is the wrong direction |
| **Subscription with more than one item** | Plinths sells one item. Use `items[0]`, log a warning if more |
| **`admin` row starts checkout** | 400 `admin_accounts_cannot_subscribe`. Installing a subscription would overwrite `plan = admin` with `pro` |
| **Stripe idempotency conflict** (same `intent_id` resent with a different plan or customer) | Catch `stripe.error.IdempotencyError` → 409 `{ error: "intent_reused" }`. The frontend mints a fresh intent and retries once. An intent is bound to one `(attempt, plan)`; the retry-after-error path reuses it only with `lastPlan` |
| **Two checkouts completed by the same user** (two tabs, both paid) | The second install finds a *different* live subscription on the row and cancels the newly found one immediately (`stripe.Subscription.cancel`). Stripe does not auto-refund on cancel: metric `DoubleSubscriptionCancelled` has an alarm and the runbook step is a manual refund of that subscription's invoice. At current volume that beats writing refund code that runs once a year |
| **State event arrives before the install** (`subscription.updated` outruns `checkout.session.completed`) | The generation pin rejects it (row holds no such id) → 200. The install's refetch then writes current truth, so nothing is lost |
| **`invoice.payment_failed` for the first invoice of a not-yet-installed subscription** | Same: rejected by the pin, and the install refetch tells the truth |
| **Grace-path conditional conflict** under concurrent deliveries | Re-read and re-evaluate up to three times before treating it as stale. Only the grace transition carries the `subscription_status = :status_read` condition; plain state writes carry the refetched truth and need no retry |
| **`cancel_at_period_end`** | Status stays `active` until the period ends; access continues, which is correct. The state write also records `cancel_at_period_end` (BOOL) and `current_period_end` (N) so the settings UI can say "ends on <date>" later without another backend change. UI is out of scope here |
| **Success URL opened with no `sessionStorage` record** (different browser, cleared storage) | One fetch of `GET /api/billing/me`. Effective plan not free → done. Otherwise show the "your plan will land shortly" state once and stop; there is no intent to correlate, so polling would be guessing |
| **Portal opened from `past_due`** | The 409 route sends the user to the portal, where "update payment method" is the fix. A dunning banner that reads `entitlement_grace_until` and links to the portal is a UI follow-up; `GET /api/billing/me` already exposes what it needs |
| **DynamoDB `Number` comes back as `Decimal`** through the resource API | Every numeric billing attribute goes through `int()` at the read boundary. A test asserts the JSON response serialises |
| **`effective_plan(row, now=0)`** | `now is None` check, not truthiness |
| **Logging** | Webhook logs carry `event.id`, `event.type`, `user_id`, `subscription_id`. Never the payload |
| **`GET /api/billing/me` never returns Stripe ids** | Customer and subscription ids stay server-side |
| **Webhook secret rotation** | Out of scope. Stripe supports overlapping secrets; a follow-up can read a list from SSM |

**Manual QA before prod** (runs against `dev` with `stripe listen`):

1. Happy path on `4242 4242 4242 4242`: overlay resolves, `/api/billing/me` shows `active`, a report over the free limit succeeds.
2. Abandon checkout, start a second, complete the first tab: exactly one subscription, plan active, no `DoubleSubscriptionCancelled`.
3. Complete two checkouts: second is cancelled, metric fires.
4. Stripe **test clock**: advance past renewal with card `4000 0000 0000 0341` attached → `past_due`, grace set, access still paid; advance 7 days → effective free with status unchanged; update card → `active`, grace cleared.
5. Cancel at period end in the portal → still `active`; advance the clock → `canceled`, effective free; new checkout → new subscription installed, old id gone.
6. `stripe trigger customer.subscription.updated` against an installed row with a hand-edited older `billing_source_event_created` → applied; with a newer one → `WebhookStaleEvent`.
7. Resend a processed event from the dashboard → no revision bump.
8. Point the dev endpoint at a live-mode secret temporarily → `WebhookLivemodeMismatch`, row untouched.
9. Monthly → annual in the portal → `billing_revision` bumps, plan string unchanged, UI refreshes.

## Rollout

Feature branch `feat/billing-hardening`, commits pushed as work lands, one PR at the end. With zero users there is no data migration. After merge: deploy `dev`, run `stripe listen --forward-to <execute-api>/api/billing/webhook` and `stripe trigger` through the event list above, confirm the activation overlay resolves on a test card, then deploy `prod` and re-point the production webhook endpoint at execute-api.
