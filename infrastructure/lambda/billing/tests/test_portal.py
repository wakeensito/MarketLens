import json

from conftest import LambdaContext, api_event


def _post(auth=None):
    import app

    resp = app.lambda_handler(
        api_event("POST", "/api/billing/portal", "{}", auth=auth), LambdaContext()
    )
    return resp["statusCode"], json.loads(resp["body"])


def test_portal_returns_url_with_billing_portal_return(
    ddb_table, user_row, stripe_stub
):
    user_row()
    code, body = _post()
    assert code == 200 and body == {"portal_url": "https://stripe.test/portal"}
    assert stripe_stub["portal"][0]["return_url"] == "https://app.test?billing=portal"
    key1 = stripe_stub["portal"][0]["idempotency_key"]
    assert key1.startswith("portal:")

    code2, _ = _post()
    assert code2 == 200
    key2 = stripe_stub["portal"][1]["idempotency_key"]
    assert key2.startswith("portal:")
    assert key1 != key2


def test_portal_requires_auth(ddb_table, stripe_stub):
    code, _ = _post(auth={"is_authenticated": "false"})
    assert code == 401
