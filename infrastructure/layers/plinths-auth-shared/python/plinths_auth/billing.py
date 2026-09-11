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
BILLING_ATTRS: tuple[str, ...] = (
    "plan",
    "subscription_status",
    "entitlement_grace_until",
)

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
