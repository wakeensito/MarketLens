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


def _current_period_end(sub: dict) -> int:
    """`current_period_end` lives on the subscription item, not the
    subscription, in the pinned API version. Fall back to the top-level key
    for older event shapes that still carry it there."""
    items = (sub.get("items") or {}).get("data") or []
    if items and items[0].get("current_period_end") is not None:
        return int(items[0]["current_period_end"])
    return int(sub.get("current_period_end") or 0)


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
        sub_id = (
            obj.get("subscription")
            if event_type == "checkout.session.completed"
            else obj.get("id")
        )
        if not sub_id:
            logger.warning("Install event without subscription", extra=log)
            return "ignored"
        sub = stripe_client.retrieve_subscription(sub_id)
        user_id = _resolve_user_id(obj, sub)
        if not user_id:
            logger.warning(
                "Could not resolve user for event",
                extra={**log, "subscription_id": sub_id},
            )
            metrics.add_metric(
                name="WebhookUnresolvedUser", unit=MetricUnit.Count, value=1
            )
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
            logger.warning(
                "Could not resolve user for event",
                extra={**log, "subscription_id": sub_id},
            )
            metrics.add_metric(
                name="WebhookUnresolvedUser", unit=MetricUnit.Count, value=1
            )
            return "ignored"
        return apply_subscription_state(event, user_id, sub)

    return "ignored"


def _orphan(event: dict, user_id: str, sub_id: str) -> str:
    logger.warning(
        "Webhook for missing user row",
        extra={
            "event_id": event["id"],
            "event_type": event["type"],
            "user_id": user_id,
            "subscription_id": sub_id,
        },
    )
    metrics.add_metric(name="WebhookOrphanUser", unit=MetricUnit.Count, value=1)
    return "orphan"


def _log_unknown_subscription(event: dict, user_id: str, sub_id: str) -> str:
    extra = {
        "event_id": event["id"],
        "event_type": event["type"],
        "user_id": user_id,
        "subscription_id": sub_id,
    }
    metrics.add_metric(
        name="WebhookUnknownSubscription", unit=MetricUnit.Count, value=1
    )
    logger.info("Webhook event for a subscription not yet on the row", extra=extra)
    return "unknown_subscription"


def _log_outcome(outcome: store.Outcome, event: dict, user_id: str, sub_id: str) -> str:
    extra = {
        "event_id": event["id"],
        "event_type": event["type"],
        "user_id": user_id,
        "subscription_id": sub_id,
    }
    if outcome is store.Outcome.STALE:
        metrics.add_metric(name="WebhookStaleEvent", unit=MetricUnit.Count, value=1)
        logger.info("Webhook event stale", extra=extra)
    elif outcome is store.Outcome.DUPLICATE:
        logger.info("Webhook event duplicate", extra=extra)
    else:
        logger.info("Webhook event applied", extra={**extra, "outcome": outcome.value})
    return outcome.value


# ─── Install path ───


def _install_update(
    sub: dict,
    intent_id: str | None,
    event_created: int,
    condition: str,
    names: dict,
    values: dict,
) -> dict:
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
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
        "current_period_end": _current_period_end(sub),
        "plan_updated_at": _now_iso(),
    }
    if intent_id:
        sets["last_checkout_intent_id"] = intent_id
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


def _cancel_newcomer(event: dict, user_id: str, sub: dict, kept: str) -> store.Outcome:
    """Two live subscriptions for the same user: cancel the one just found via
    the API and leave the recorded (`kept`) subscription alone. Shared by
    both the intent-match branch (a different subscription is already live
    on the row) and the reconcile branch (the recorded id is still live)."""
    stripe_client.cancel_subscription(sub["id"])
    metrics.add_metric(
        name="DoubleSubscriptionCancelled", unit=MetricUnit.Count, value=1
    )
    logger.error(
        "Cancelled second live subscription; refund manually",
        extra={
            "event_id": event["id"],
            "event_type": event["type"],
            "user_id": user_id,
            "subscription_id": sub["id"],
            "kept": kept,
        },
    )
    return store.apply_event(event["id"], None, None)


def install_subscription(event: dict, user_id: str, sub: dict) -> str:
    """Classify + apply, retrying on a lost race.

    The classification (matching intent / not live / already-recorded /
    reconcile / double-subscription) is read from a snapshot of the row, but
    the write is conditioned on that same snapshot. If a concurrent install
    commits first, our condition fails (STALE) and the snapshot we
    classified from is now wrong — so we re-read and reclassify rather than
    reporting a spurious "stale" for what is really a race we lost. The
    re-read will see the winner's write and route us into the
    already-recorded or double-subscription branches as appropriate.
    """
    obj = event["data"]["object"]
    for attempt in range(MAX_CONDITION_RETRIES):
        row = store.get_user(user_id)
        if row is None:
            return _orphan(event, user_id, sub["id"])

        intent = (obj.get("metadata") or {}).get("intent_id") or (
            sub.get("metadata") or {}
        ).get("intent_id")
        pending = row.get("pending_intent_id")
        recorded = row.get("stripe_subscription_id") or ""
        created = int(event["created"])

        if intent and pending and intent == pending:
            other_live = False
            if recorded and recorded != sub["id"]:
                other_live = stripe_client.is_live(
                    stripe_client.retrieve_subscription(recorded)
                )
            if other_live:
                # The matching intent still can't overwrite a different
                # subscription that is actually live on the row — treat this
                # exactly like the reconcile double-subscription case.
                outcome = _cancel_newcomer(event, user_id, sub, recorded)
            else:
                update = _install_update(
                    sub,
                    intent,
                    created,
                    "pending_intent_id = :intent",
                    {},
                    {":intent": store.serialize(intent)},
                )
                outcome = store.apply_event(event["id"], user_id, update)
        elif not stripe_client.is_live(sub):
            # Intent does not match (or is absent): classify by what Stripe says.
            outcome = store.apply_event(event["id"], None, None)
        elif recorded == sub["id"]:
            outcome = store.apply_event(event["id"], None, None)
        else:
            recorded_live = False
            if recorded:
                recorded_live = stripe_client.is_live(
                    stripe_client.retrieve_subscription(recorded)
                )

            if not recorded_live:
                condition = "attribute_not_exists(stripe_subscription_id) OR stripe_subscription_id = :recorded"
                update = _install_update(
                    sub,
                    intent,
                    created,
                    condition,
                    {},
                    {":recorded": store.serialize(recorded)},
                )
                outcome = store.apply_event(event["id"], user_id, update)
            else:
                # Two live subscriptions: the user is paying twice. Cancel the newcomer.
                outcome = _cancel_newcomer(event, user_id, sub, recorded)

        if outcome is store.Outcome.STALE and attempt < MAX_CONDITION_RETRIES - 1:
            time.sleep(0.05)
            continue
        return _log_outcome(outcome, event, user_id, sub["id"])
    return _log_outcome(store.Outcome.STALE, event, user_id, sub["id"])


# ─── State path ───


def build_state_update(
    row: dict, sub: dict, event_created: int, grace_seconds: int
) -> dict | None:
    """The row update for a refetched subscription, or None when nothing changes."""
    new_status = sub.get("status")
    old_status = row.get("subscription_status")
    sets = {
        "plan": stripe_client.plan_from_subscription(sub),
        "subscription_status": new_status,
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
        "current_period_end": _current_period_end(sub),
    }
    removes: list[str] = []
    grace_transition = new_status == "past_due" and old_status in ENTITLED_STATUSES
    if grace_transition:
        sets["entitlement_grace_until"] = event_created + grace_seconds
    elif new_status != "past_due" and "entitlement_grace_until" in row:
        removes.append("entitlement_grace_until")

    # Decimal(n) == n is True, so every field — current_period_end included —
    # compares the same way against the DynamoDB-native row value.
    changed = any(row.get(k) != v for k, v in sets.items()) or bool(removes)
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
    """Retry loop with no trailing fallback: every branch below either
    `continue`s (only when attempts remain) or `return`s, and the last
    attempt can never `continue` — so the loop is guaranteed to return
    before falling off the end. `while True` (no `break`) tells mypy that
    directly, so no unreachable statement is needed after the loop.
    """
    created = int(event["created"])
    attempt = 0
    while True:
        row = store.get_user(user_id)
        if row is None:
            return _orphan(event, user_id, sub["id"])
        if row.get("stripe_subscription_id") != sub["id"]:
            # Not necessarily stale: Stripe routinely delivers `.updated` /
            # `invoice.*` before the install lands, so the row simply doesn't
            # know about this subscription yet. That's expected traffic, not
            # an anomaly — give it its own outcome/metric so it doesn't drown
            # out real staleness.
            return _log_unknown_subscription(event, user_id, sub["id"])
        if row.get("subscription_status") == "canceled":
            return _log_outcome(store.Outcome.STALE, event, user_id, sub["id"])
        if int(row.get("billing_source_event_created") or 0) > created:
            return _log_outcome(store.Outcome.STALE, event, user_id, sub["id"])
        update = build_state_update(row, sub, created, _grace_seconds())
        if update is None:
            return _log_outcome(
                store.apply_event(event["id"], None, None), event, user_id, sub["id"]
            )
        outcome = store.apply_event(event["id"], user_id, update)
        grace_path = ":old_status" in update["ExpressionAttributeValues"]
        attempt += 1
        if (
            outcome is store.Outcome.STALE
            and grace_path
            and attempt < MAX_CONDITION_RETRIES
        ):
            time.sleep(0.05)
            continue
        return _log_outcome(outcome, event, user_id, sub["id"])
