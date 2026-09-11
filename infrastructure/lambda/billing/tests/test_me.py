import json

from conftest import LambdaContext, api_event


def _get(auth=None):
    import app

    resp = app.lambda_handler(
        api_event("GET", "/api/billing/me", auth=auth), LambdaContext()
    )
    return resp["statusCode"], json.loads(resp["body"])


def test_me_returns_billing_state_without_stripe_ids(ddb_table, user_row, stripe_stub):
    user_row(
        plan="pro",
        subscription_status="past_due",
        entitlement_grace_until=1,
        billing_revision=3,
        last_checkout_intent_id="i1",
        stripe_subscription_id="sub_1",
        stripe_customer_id="cus_1",
        cancel_at_period_end=True,
        current_period_end=1_800_000_000,
        plan_updated_at="2026-01-01T00:00:00+00:00",
    )
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
