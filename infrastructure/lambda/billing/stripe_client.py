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

# "Live" for the *install* guard means "Stripe still knows about it", so an
# `incomplete` subscription counts — installing over one would lose it.
# "Billing-live" is the stricter question the checkout 409 and the
# replace-the-recorded-subscription decision ask: is this subscription
# actually going to bill? An `incomplete` subscription never charged
# (the payment intent was abandoned) and expires on its own after 23 h.
# Treating it as live would lock the user out of checkout for a day.
# Deliberately a denylist, not an allowlist: an unknown or missing status is
# treated as billing, so a second checkout is refused (409 → portal) rather
# than a second subscription being created. Money-safe direction.
NOT_BILLING_STATUSES = NOT_LIVE_STATUSES | {"incomplete"}

_ssm = None
_configured = False
_webhook_secret: str | None = None


def _get_param(name: str) -> str:
    global _ssm
    if _ssm is None:
        _ssm = boto3.client("ssm")
    return _ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]


def configure() -> None:
    """Idempotent. API key from SSM; a timeout that fits the Lambda budget.

    The SDK default is 80 s per request with no cap that fits in a 30 s
    Lambda. The webhook's worst case is five *sequential* Stripe calls:
    refetch the newcomer, the `Customer.retrieve` identity fallback, refetch
    the recorded subscription, the cancel, and — on a failed cancel — the
    confirmation refetch that decides whether the cancel actually took. At
    5 s each that is 25 s — under API Gateway's 29 s REST integration cap
    and the 30 s Lambda timeout. SDK-level retries are switched off
    deliberately: one retry per call would blow both caps, and Stripe's own
    webhook redelivery is the outer retry that matters (returning 5xx is
    what we want when Stripe is down).
    """
    global _configured
    if _configured:
        return
    stripe.api_key = _get_param(os.environ["STRIPE_SECRET_KEY_PARAM"])
    stripe.max_network_retries = 0
    stripe.default_http_client = stripe.RequestsClient(timeout=5)
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
        logger.warning(
            "Subscription has multiple items", extra={"subscription_id": sub.get("id")}
        )
    price_id = ((items[0].get("price") or {}).get("id")) or ""
    plan = _PRICE_TO_PLAN.get(price_id)
    if plan is None:
        logger.error(
            "Unknown price id",
            extra={"price_id": price_id, "subscription_id": sub.get("id")},
        )
        metrics.add_metric(name="UnknownPriceId", unit=MetricUnit.Count, value=1)
        return "free"
    return plan


def is_live(sub: dict) -> bool:
    return sub.get("status") not in NOT_LIVE_STATUSES


def is_billing_live(sub: dict) -> bool:
    """Will this subscription actually bill? `incomplete` will not — it is an
    abandoned checkout that Stripe expires after 23 h — so it must never
    block a new checkout or survive a replacement install."""
    return sub.get("status") not in NOT_BILLING_STATUSES


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
    nested = ((invoice.get("parent") or {}).get("subscription_details") or {}).get(
        "subscription"
    )
    return nested if isinstance(nested, str) and nested else None
