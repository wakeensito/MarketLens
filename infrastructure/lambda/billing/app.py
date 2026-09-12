"""
Plinths Billing Lambda — Stripe subscriptions.

  POST /api/billing/checkout  → Checkout Session (auth; body {plan, intent_id})
  POST /api/billing/portal    → Customer Portal session (auth)
  GET  /api/billing/me        → billing state for the activation poll (auth)
  POST /api/billing/webhook   → Stripe events (no auth; signature-verified)

Design record: docs/superpowers/specs/2026-09-11-billing-hardening-design.md
"""

from __future__ import annotations

import json
import os
import uuid

import stripe
from aws_lambda_powertools import Logger, Metrics, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.typing import LambdaContext
from botocore.exceptions import ClientError
from plinths_auth.billing import effective_plan

import store
import stripe_client
import webhook

logger = Logger()
tracer = Tracer()
metrics = Metrics()
app = APIGatewayRestResolver(strip_prefixes=["/api"])

APP_DOMAIN = os.environ["APP_DOMAIN"].rstrip("/")
PRICE_IDS = {
    "pro": os.environ.get("STRIPE_PRICE_ID_PRO", ""),
    "max": os.environ.get("STRIPE_PRICE_ID_MAX", ""),
    "pro_annual": os.environ.get("STRIPE_PRICE_ID_PRO_ANNUAL", ""),
    "max_annual": os.environ.get("STRIPE_PRICE_ID_MAX_ANNUAL", ""),
}


def _auth() -> dict:
    authorizer = (
        app.current_event.raw_event.get("requestContext", {}).get("authorizer", {})
        or {}
    )
    return {
        "user_id": authorizer.get("user_id", "anonymous"),
        "org_id": authorizer.get("org_id", "anonymous"),
        "is_authenticated": authorizer.get("is_authenticated", "false") == "true",
        "email": authorizer.get("email", ""),
    }


def _get_or_create_stripe_customer(auth: dict, row: dict) -> str:
    """Race-guarded: only the first writer's customer id persists; the loser deletes its orphan."""
    stripe_client.configure()
    if row.get("stripe_customer_id"):
        return row["stripe_customer_id"]
    customer = stripe.Customer.create(
        email=auth.get("email", ""),
        metadata={"user_id": auth["user_id"], "org_id": auth["org_id"]},
    )
    try:
        store._get_table().update_item(
            Key=store.user_key(auth["user_id"]),
            UpdateExpression="SET stripe_customer_id = :cid",
            ConditionExpression="attribute_not_exists(stripe_customer_id)",
            ExpressionAttributeValues={":cid": customer.id},
        )
        logger.info(
            "Stripe customer created",
            extra={"user_id": auth["user_id"], "stripe_customer_id": customer.id},
        )
        return customer.id
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        logger.info(
            "Stripe customer race lost; cleaning up orphan",
            extra={"user_id": auth["user_id"], "orphan_customer_id": customer.id},
        )
        try:
            stripe.Customer.delete(customer.id)
        except stripe.StripeError as del_err:
            logger.warning(
                "Could not delete orphan Stripe customer",
                extra={"orphan_customer_id": customer.id, "error": str(del_err)},
            )
        winner = store.get_user(auth["user_id"]) or {}
        winner_id = winner.get("stripe_customer_id")
        if not winner_id:
            raise RuntimeError("stripe_customer_id missing after race") from e
        return winner_id


@app.post("/billing/checkout")
@tracer.capture_method
def create_checkout_session():
    auth = _auth()
    if not auth["is_authenticated"]:
        return {"error": "Authentication required"}, 401

    body = app.current_event.json_body
    if not isinstance(body, dict):
        return {"error": "Request body must be a JSON object."}, 400
    plan = body.get("plan", "pro")
    price_id = PRICE_IDS.get(plan)
    if not price_id:
        return {
            "error": f"Invalid plan: {plan}. Must be one of {sorted(PRICE_IDS)}."
        }, 400
    intent_id = body.get("intent_id")
    try:
        intent_id = str(uuid.UUID(str(intent_id)))
    except (ValueError, TypeError):
        return {"error": "intent_id must be a UUID."}, 400

    row = store.get_user(auth["user_id"])
    if row is None:
        return {"error": "User not found"}, 404
    if row.get("plan") == "admin":
        return {"error": "admin_accounts_cannot_subscribe"}, 400

    recorded = row.get("stripe_subscription_id")
    if recorded:
        try:
            existing = stripe_client.retrieve_subscription(recorded)
        except stripe.InvalidRequestError:
            logger.warning(
                "Recorded subscription not retrievable; treating as not live",
                extra={"user_id": auth["user_id"], "subscription_id": recorded},
            )
        except stripe.StripeError as e:
            logger.error(
                "Stripe checkout creation failed",
                extra={"user_id": auth["user_id"], "plan": plan, "error": str(e)},
            )
            return {"error": "Could not start checkout. Please try again."}, 502
        else:
            if stripe_client.is_live(existing):
                return {"error": "subscription_exists"}, 409

    customer_id = _get_or_create_stripe_customer(auth, row)
    store.set_pending_intent(auth["user_id"], intent_id)

    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            client_reference_id=auth["user_id"],
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            success_url=f"{APP_DOMAIN}?billing=success",
            cancel_url=f"{APP_DOMAIN}?billing=cancelled",
            metadata={
                "user_id": auth["user_id"],
                "org_id": auth["org_id"],
                "intent_id": intent_id,
            },
            subscription_data={
                "metadata": {"user_id": auth["user_id"], "intent_id": intent_id}
            },
            idempotency_key=f"checkout:{intent_id}",
        )
    except stripe.IdempotencyError:
        return {"error": "intent_reused"}, 409
    except stripe.StripeError as e:
        logger.error(
            "Stripe checkout creation failed",
            extra={"user_id": auth["user_id"], "plan": plan, "error": str(e)},
        )
        return {"error": "Could not start checkout. Please try again."}, 502

    logger.info(
        "Checkout session created",
        extra={
            "user_id": auth["user_id"],
            "plan": plan,
            "session_id": session.id,
            "intent_id": intent_id,
        },
    )
    return {"checkout_url": session.url}


@app.post("/billing/portal")
@tracer.capture_method
def create_portal_session():
    auth = _auth()
    if not auth["is_authenticated"]:
        return {"error": "Authentication required"}, 401
    row = store.get_user(auth["user_id"]) or {}
    customer_id = _get_or_create_stripe_customer(auth, row)
    try:
        portal = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{APP_DOMAIN}?billing=portal",
            idempotency_key=f"portal:{uuid.uuid4()}",
        )
    except stripe.StripeError as e:
        logger.error(
            "Stripe portal creation failed",
            extra={"user_id": auth["user_id"], "error": str(e)},
        )
        return {"error": "Could not open the billing portal. Please try again."}, 502
    return {"portal_url": portal.url}


@app.get("/billing/me")
@tracer.capture_method
def get_billing_me():
    auth = _auth()
    if not auth["is_authenticated"]:
        return {"error": "Authentication required"}, 401
    row = store.get_user(auth["user_id"])
    if row is None:
        return {"error": "User not found"}, 404
    grace = row.get("entitlement_grace_until")
    return {
        "plan": row.get("plan") or "free",
        "effective_plan": effective_plan(row),
        "subscription_status": row.get("subscription_status"),
        "entitlement_grace_until": int(grace) if grace is not None else None,
        "last_checkout_intent_id": row.get("last_checkout_intent_id"),
        "billing_revision": int(row.get("billing_revision") or 0),
        "plan_updated_at": row.get("plan_updated_at"),
        "cancel_at_period_end": bool(row.get("cancel_at_period_end", False)),
        "current_period_end": int(row.get("current_period_end") or 0),
    }


@app.post("/billing/webhook")
@tracer.capture_method
def stripe_webhook():
    """Signature → parse → livemode → handle. Nothing else runs before the signature passes."""
    payload = app.current_event.decoded_body or ""
    sig_header = app.current_event.headers.get("stripe-signature", "")
    secret = stripe_client.webhook_secret()
    try:
        stripe.WebhookSignature.verify_header(payload, sig_header, secret)
    except stripe.SignatureVerificationError:
        logger.warning("Webhook signature verification failed")
        metrics.add_metric(
            name="WebhookSignatureFailure", unit=MetricUnit.Count, value=1
        )
        return {"error": "Invalid signature"}, 400

    try:
        event = json.loads(payload)
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("Webhook payload malformed", extra={"error": str(e)})
        metrics.add_metric(
            name="WebhookMalformedPayload", unit=MetricUnit.Count, value=1
        )
        return {"error": "Bad request"}, 400

    expected_live = os.environ.get("STRIPE_LIVEMODE", "false") == "true"
    if bool(event.get("livemode")) != expected_live:
        metrics.add_metric(
            name="WebhookLivemodeMismatch", unit=MetricUnit.Count, value=1
        )
        logger.error(
            "Webhook livemode mismatch",
            extra={"event_id": event["id"], "event_livemode": event.get("livemode")},
        )
        return {"error": "livemode mismatch"}, 400

    logger.info(
        "Webhook received", extra={"event_id": event["id"], "event_type": event["type"]}
    )
    try:
        outcome = webhook.handle_event(event)
    except Exception:
        logger.exception(
            "Webhook handling failed; Stripe will retry",
            extra={"event_id": event["id"]},
        )
        metrics.add_metric(
            name="WebhookUnexpectedError", unit=MetricUnit.Count, value=1
        )
        return {"error": "Internal error"}, 500
    return {"received": True, "outcome": outcome}


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
