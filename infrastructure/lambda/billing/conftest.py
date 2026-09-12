# conftest.py — billing Lambda tests. Env, moto DynamoDB, Stripe stubs, signed events.
import hashlib
import hmac
import json
import os
import pathlib
import sys
import time
from dataclasses import dataclass

import boto3
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
sys.path.insert(
    0,
    str(
        pathlib.Path(__file__).parents[2] / "layers" / "plinths-auth-shared" / "python"
    ),
)

WEBHOOK_SECRET = "whsec_test_secret"
PRICES = {
    "pro": "price_pro",
    "max": "price_max",
    "pro_annual": "price_pro_a",
    "max_annual": "price_max_a",
}


@dataclass
class LambdaContext:
    function_name: str = "billing-test"
    memory_limit_in_mb: int = 128
    invoked_function_arn: str = (
        "arn:aws:lambda:us-east-1:123456789012:function:billing-test"
    )
    aws_request_id: str = "00000000-0000-0000-0000-000000000000"

    def get_remaining_time_in_millis(self) -> int:
        return 10_000


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
    return (
        ddb_table.get_item(
            Key={"pk": f"USER#{user_id}", "sk": f"USER#{user_id}"}, ConsistentRead=True
        ).get("Item")
        or {}
    )


def make_subscription(
    sub_id="sub_1",
    status="active",
    price="price_pro",
    customer="cus_1",
    current_period_end=1_800_000_000,
    **extra,
):
    """Note: `current_period_end` lives on `items.data[0]`, not the top level
    — that's the real shape in the pinned API version, and webhook.py reads
    it from there (see `_current_period_end`)."""
    sub = {
        "id": sub_id,
        "object": "subscription",
        "status": status,
        "customer": customer,
        "livemode": False,
        "cancel_at_period_end": False,
        "items": {
            "data": [{"price": {"id": price}, "current_period_end": current_period_end}]
        },
        "metadata": {"user_id": "u1", "intent_id": "intent-1"},
    }
    sub.update(extra)
    return sub


@pytest.fixture
def stripe_stub(monkeypatch):
    """Stripe API surface the Lambda touches, backed by plain dicts."""
    import stripe

    state = {
        "subscriptions": {},
        "customers": {},
        "cancelled": [],
        "sessions": [],
        "portal": [],
    }

    def retrieve_sub(sub_id, **_):
        if sub_id not in state["subscriptions"]:
            raise stripe.InvalidRequestError("No such subscription", "id")
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
        return type(
            "S",
            (),
            {"id": f"cs_{len(state['sessions'])}", "url": "https://stripe.test/cs"},
        )()

    def create_portal(**kw):
        state["portal"].append(kw)
        return type("P", (), {"url": "https://stripe.test/portal"})()

    monkeypatch.setattr(stripe.Subscription, "retrieve", staticmethod(retrieve_sub))
    monkeypatch.setattr(stripe.Subscription, "cancel", staticmethod(cancel_sub))
    monkeypatch.setattr(stripe.Customer, "retrieve", staticmethod(retrieve_customer))
    monkeypatch.setattr(stripe.Customer, "create", staticmethod(create_customer))
    monkeypatch.setattr(stripe.Customer, "delete", staticmethod(lambda *_a, **_k: None))
    monkeypatch.setattr(stripe.checkout.Session, "create", staticmethod(create_session))
    monkeypatch.setattr(
        stripe.billing_portal.Session, "create", staticmethod(create_portal)
    )

    import stripe_client

    monkeypatch.setattr(stripe_client, "configure", lambda: None)
    monkeypatch.setattr(stripe_client, "webhook_secret", lambda: WEBHOOK_SECRET)
    return state


def sign(body: str, secret: str = WEBHOOK_SECRET, ts: int | None = None) -> str:
    ts = ts or int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


def make_event(
    event_type: str, obj: dict, event_id="evt_1", created=1_700_000_000, livemode=False
):
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


def api_event(
    method: str,
    path: str,
    body: str | None = None,
    headers: dict | None = None,
    auth: dict | None = None,
):
    """Minimal API Gateway REST proxy event for APIGatewayRestResolver."""
    ctx_auth = {
        "user_id": "u1",
        "org_id": "org1",
        "is_authenticated": "true",
        "plan": "free",
        "email": "u1@test",
    }
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
        "requestContext": {
            "authorizer": ctx_auth,
            "requestId": "r1",
            "stage": "test",
            "httpMethod": method,
            "path": path,
        },
    }
