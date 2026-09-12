import json

from conftest import LambdaContext, api_event, get_user, make_subscription


def _post(body: dict, auth=None):
    import app

    resp = app.lambda_handler(
        api_event("POST", "/api/billing/checkout", json.dumps(body), auth=auth),
        LambdaContext(),
    )
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
    assert "pending_intent_id" not in get_user(ddb_table)


def test_checkout_allowed_when_recorded_subscription_incomplete(
    ddb_table, user_row, stripe_stub
):
    """An `incomplete` recorded subscription is an abandoned checkout that
    never charged. Stripe takes 23 h to expire it; blocking checkout for that
    long is the bug."""
    user_row(
        stripe_subscription_id="sub_1", subscription_status="incomplete", plan="pro"
    )
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="incomplete")
    code, body = _post({"plan": "pro", "intent_id": INTENT})
    assert code == 200 and body["checkout_url"] == "https://stripe.test/cs"
    assert len(stripe_stub["sessions"]) == 1
    assert get_user(ddb_table)["pending_intent_id"] == INTENT


def test_checkout_proceeds_when_recorded_subscription_is_gone(
    ddb_table, user_row, stripe_stub
):
    user_row(
        stripe_subscription_id="sub_gone", subscription_status="active", plan="pro"
    )
    code, body = _post({"plan": "pro", "intent_id": INTENT})
    assert code == 200 and body["checkout_url"] == "https://stripe.test/cs"
    assert len(stripe_stub["sessions"]) == 1


def test_checkout_502_when_refetch_fails_transiently(
    ddb_table, user_row, stripe_stub, monkeypatch
):
    import stripe

    import stripe_client

    user_row(stripe_subscription_id="sub_1", subscription_status="active", plan="pro")

    def boom(_sub_id):
        raise stripe.APIConnectionError("down")

    monkeypatch.setattr(stripe_client, "retrieve_subscription", boom)
    code, body = _post({"plan": "pro", "intent_id": INTENT})
    assert (
        code == 502 and body["error"] == "Could not start checkout. Please try again."
    )
    assert stripe_stub["sessions"] == []
    assert "pending_intent_id" not in get_user(ddb_table)


def test_checkout_allowed_after_cancellation(ddb_table, user_row, stripe_stub):
    user_row(stripe_subscription_id="sub_1", subscription_status="canceled", plan="pro")
    stripe_stub["subscriptions"]["sub_1"] = make_subscription(status="canceled")
    assert _post({"plan": "pro", "intent_id": INTENT})[0] == 200


def test_admin_cannot_subscribe(ddb_table, user_row, stripe_stub):
    user_row(plan="admin")
    code, body = _post({"plan": "pro", "intent_id": INTENT})
    assert code == 400 and body["error"] == "admin_accounts_cannot_subscribe"


def test_idempotency_conflict_maps_to_409(
    ddb_table, user_row, stripe_stub, monkeypatch
):
    import stripe

    user_row()

    def boom(**_):
        raise stripe.IdempotencyError(
            "Keys for idempotent requests can only be used with the same parameters"
        )

    monkeypatch.setattr(stripe.checkout.Session, "create", staticmethod(boom))
    code, body = _post({"plan": "pro", "intent_id": INTENT})
    assert code == 409 and body["error"] == "intent_reused"


def test_checkout_requires_auth(ddb_table, stripe_stub):
    code, _ = _post(
        {"plan": "pro", "intent_id": INTENT}, auth={"is_authenticated": "false"}
    )
    assert code == 401
