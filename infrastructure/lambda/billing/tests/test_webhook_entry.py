import base64
import json

from conftest import LambdaContext, api_event, make_event, make_subscription, sign


def _post(body: str, sig: str, base64_body=False):
    import app

    ev = api_event(
        "POST", "/api/billing/webhook", body, headers={"stripe-signature": sig}, auth={}
    )
    if base64_body:
        ev["body"] = base64.b64encode(body.encode()).decode()
        ev["isBase64Encoded"] = True
    resp = app.lambda_handler(ev, LambdaContext())
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


def test_valid_event_dispatches_and_returns_outcome(
    ddb_table, stripe_stub, monkeypatch
):
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


def test_infrastructure_error_is_500_so_stripe_retries(
    ddb_table, stripe_stub, monkeypatch
):
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
    session = {
        "id": "cs_1",
        "subscription": "sub_1",
        "customer": "cus_1",
        "metadata": {"user_id": "u1", "org_id": "org1", "intent_id": "intent-1"},
    }
    body = json.dumps(make_event("checkout.session.completed", session))
    code, resp = _post(body, sign(body))
    assert code == 200 and resp["outcome"] == "applied"
    assert get_user(ddb_table)["subscription_status"] == "active"
