import pytest
from plinths_auth.billing import BILLING_PROJECTION, effective_plan, is_entitled

NOW = 1_700_000_000


@pytest.mark.parametrize(
    "row,expected",
    [
        ({"plan": "pro", "subscription_status": "active"}, True),
        ({"plan": "pro", "subscription_status": "trialing"}, True),
        (
            {
                "plan": "pro",
                "subscription_status": "past_due",
                "entitlement_grace_until": NOW + 1,
            },
            True,
        ),
        (
            {
                "plan": "pro",
                "subscription_status": "past_due",
                "entitlement_grace_until": NOW,
            },
            False,
        ),
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
        (
            {
                "plan": "pro",
                "subscription_status": "past_due",
                "entitlement_grace_until": NOW + 5,
            },
            "pro",
        ),
        (
            {
                "plan": "pro",
                "subscription_status": "past_due",
                "entitlement_grace_until": NOW - 5,
            },
            "free",
        ),
    ],
)
def test_effective_plan(row, expected):
    assert effective_plan(row, NOW) == expected


def test_effective_plan_now_zero_is_not_treated_as_missing():
    row = {
        "plan": "pro",
        "subscription_status": "past_due",
        "entitlement_grace_until": 1,
    }
    assert effective_plan(row, 0) == "pro"


def test_effective_plan_defaults_now_to_wall_clock():
    row = {
        "plan": "pro",
        "subscription_status": "past_due",
        "entitlement_grace_until": 1,
    }
    assert effective_plan(row) == "free"


def test_decimal_grace_from_dynamodb():
    from decimal import Decimal

    row = {
        "plan": "pro",
        "subscription_status": "past_due",
        "entitlement_grace_until": Decimal(NOW + 1),
    }
    assert effective_plan(row, NOW) == "pro"


def test_projection_names_every_billing_attr():
    assert (
        BILLING_PROJECTION["ProjectionExpression"]
        == "#p, subscription_status, entitlement_grace_until"
    )
    assert BILLING_PROJECTION["ExpressionAttributeNames"] == {"#p": "plan"}
