"""
Plinths Billing Lambda — Stripe integration for subscriptions.

Endpoints:
  POST /api/billing/checkout       → Create Stripe Checkout Session (requires auth)
  POST /api/billing/portal         → Create Stripe Customer Portal session (requires auth)
  POST /api/billing/webhook        → Stripe webhook receiver (no auth, signature-verified)
"""
import os
import json
import time
import boto3
import stripe
from botocore.exceptions import ClientError

from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()
tracer = Tracer()
metrics = Metrics()
app = APIGatewayRestResolver(strip_prefixes=["/api"])

# ── Config ──
APP_DOMAIN = os.environ["APP_DOMAIN"].rstrip("/")

# Stripe keys from SSM (loaded lazily)
ssm = boto3.client("ssm")
_stripe_secret_key: str | None = None
_stripe_webhook_secret: str | None = None

# Price IDs
PRICE_ID_PRO = os.environ["STRIPE_PRICE_ID_PRO"]
PRICE_ID_MAX = os.environ["STRIPE_PRICE_ID_MAX"]
PRICE_ID_PRO_ANNUAL = os.environ.get("STRIPE_PRICE_ID_PRO_ANNUAL", "")
PRICE_ID_MAX_ANNUAL = os.environ.get("STRIPE_PRICE_ID_MAX_ANNUAL", "")

# DynamoDB
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["REPORTS_TABLE"])


def _get_stripe_secret_key() -> str:
    global _stripe_secret_key
    if _stripe_secret_key is None:
        _stripe_secret_key = ssm.get_parameter(
            Name=os.environ["STRIPE_SECRET_KEY_PARAM"],
            WithDecryption=True,
        )["Parameter"]["Value"]
        stripe.api_key = _stripe_secret_key
    return _stripe_secret_key


def _get_webhook_secret() -> str:
    global _stripe_webhook_secret
    if _stripe_webhook_secret is None:
        _stripe_webhook_secret = ssm.get_parameter(
            Name=os.environ["STRIPE_WEBHOOK_SECRET_PARAM"],
            WithDecryption=True,
        )["Parameter"]["Value"]
    return _stripe_webhook_secret


def _get_auth_context() -> dict:
    """Extract auth context injected by the Lambda Authorizer."""
    raw_event = app.current_event.raw_event
    authorizer = (
        raw_event.get("requestContext", {})
        .get("authorizer", {})
    )
    return {
        "user_id": authorizer.get("user_id", "anonymous"),
        "org_id": authorizer.get("org_id", "anonymous"),
        "is_authenticated": authorizer.get("is_authenticated", "false") == "true",
        "plan": authorizer.get("plan", "free"),
        "email": authorizer.get("email", ""),
    }


def _get_or_create_stripe_customer(auth: dict) -> str:
    """Get existing Stripe customer ID from DynamoDB, or create one in Stripe.

    Concurrent calls (e.g., a double-clicked CTA) could each create a Stripe
    customer. We guard the DDB write with attribute_not_exists so only the
    first writer persists; the loser deletes its orphan customer in Stripe
    and returns the persisted ID.
    """
    _get_stripe_secret_key()

    user_pk = f"USER#{auth['user_id']}"
    result = table.get_item(Key={"pk": user_pk, "sk": user_pk})
    item = result.get("Item", {})

    # Already have a Stripe customer?
    stripe_customer_id = item.get("stripe_customer_id")
    if stripe_customer_id:
        return stripe_customer_id

    # Create one
    customer = stripe.Customer.create(
        email=auth.get("email", ""),
        metadata={
            "user_id": auth["user_id"],
            "org_id": auth["org_id"],
        },
    )

    # Store on user record. Condition guards the race so only the first
    # writer wins; the loser cleans up its orphan customer and re-reads.
    try:
        table.update_item(
            Key={"pk": user_pk, "sk": user_pk},
            UpdateExpression="SET stripe_customer_id = :cid",
            ConditionExpression="attribute_not_exists(stripe_customer_id)",
            ExpressionAttributeValues={":cid": customer.id},
        )
        logger.info("Stripe customer created", extra={
            "user_id": auth["user_id"],
            "stripe_customer_id": customer.id,
        })
        return customer.id
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        # Lost the race — another caller already wrote a customer ID.
        logger.info("Stripe customer race lost; cleaning up orphan", extra={
            "user_id": auth["user_id"],
            "orphan_customer_id": customer.id,
        })
        try:
            stripe.Customer.delete(customer.id)
        except stripe.error.StripeError as del_err:
            logger.warning("Could not delete orphan Stripe customer", extra={
                "orphan_customer_id": customer.id,
                "error": str(del_err),
            })
        winner = table.get_item(
            Key={"pk": user_pk, "sk": user_pk},
            ConsistentRead=True,
        ).get("Item", {})
        winner_id = winner.get("stripe_customer_id")
        if not winner_id:
            # Should be unreachable: the conditional failed, so a value exists.
            raise RuntimeError("stripe_customer_id missing after race") from e
        return winner_id


# ─── Endpoints ───

@app.post("/billing/checkout")
@tracer.capture_method
def create_checkout_session():
    """Create a Stripe Checkout Session for subscription signup."""
    auth = _get_auth_context()
    if not auth["is_authenticated"]:
        return {"error": "Authentication required"}, 401

    body = app.current_event.json_body or {}
    plan = body.get("plan", "pro")

    price_map = {
        "pro": PRICE_ID_PRO,
        "max": PRICE_ID_MAX,
        "pro_annual": PRICE_ID_PRO_ANNUAL,
        "max_annual": PRICE_ID_MAX_ANNUAL,
    }
    price_id = price_map.get(plan)
    if not price_id:
        return {"error": f"Invalid plan: {plan}. Must be 'pro', 'max', 'pro_annual', or 'max_annual'."}, 400

    customer_id = _get_or_create_stripe_customer(auth)

    _get_stripe_secret_key()
    session = stripe.checkout.Session.create(
        customer=customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{APP_DOMAIN}?billing=success&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{APP_DOMAIN}?billing=cancelled",
        metadata={
            "user_id": auth["user_id"],
            "org_id": auth["org_id"],
        },
        idempotency_key=_idempotency_key("checkout", auth["user_id"], plan),
    )

    logger.info("Checkout session created", extra={
        "user_id": auth["user_id"],
        "plan": plan,
        "session_id": session.id,
    })

    return {"checkout_url": session.url}


@app.post("/billing/portal")
@tracer.capture_method
def create_portal_session():
    """Create a Stripe Customer Portal session for managing subscriptions."""
    auth = _get_auth_context()
    if not auth["is_authenticated"]:
        return {"error": "Authentication required"}, 401

    customer_id = _get_or_create_stripe_customer(auth)

    _get_stripe_secret_key()
    portal_session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=APP_DOMAIN,
        idempotency_key=_idempotency_key("portal", auth["user_id"], "portal"),
    )

    return {"portal_url": portal_session.url}


@app.post("/billing/webhook")
@tracer.capture_method
def stripe_webhook():
    """Handle Stripe webhook events. No auth — verified by signature."""
    payload = app.current_event.body or ""
    sig_header = app.current_event.get_header_value("stripe-signature") or ""
    webhook_secret = _get_webhook_secret()

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
    except stripe.error.SignatureVerificationError:
        logger.warning("Webhook signature verification failed")
        metrics.add_metric(name="WebhookSignatureFailure", unit=MetricUnit.Count, value=1)
        return {"error": "Invalid signature"}, 400
    except (ValueError, KeyError) as e:
        logger.warning("Webhook payload malformed", extra={"error": str(e)})
        metrics.add_metric(name="WebhookMalformedPayload", unit=MetricUnit.Count, value=1)
        return {"error": "Bad request"}, 400
    except stripe.error.StripeError as e:
        logger.warning("Webhook Stripe error", extra={"error": str(e)})
        metrics.add_metric(name="WebhookStripeError", unit=MetricUnit.Count, value=1)
        return {"error": "Bad request"}, 400
    except Exception:
        logger.exception("Webhook unexpected error")
        metrics.add_metric(name="WebhookUnexpectedError", unit=MetricUnit.Count, value=1)
        return {"error": "Bad request"}, 400

    event_type = event["type"]
    data_object = event["data"]["object"]

    logger.info("Webhook received", extra={"event_type": event_type, "event_id": event["id"]})

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(data_object)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_updated(data_object)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(data_object)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(data_object)

    return {"received": True}


# ─── Webhook Handlers ───

def _handle_checkout_completed(session: dict):
    """User completed checkout — activate their plan."""
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    metadata = session.get("metadata", {})
    user_id = metadata.get("user_id")
    org_id = metadata.get("org_id")

    if not user_id:
        # Try to find user by stripe_customer_id
        logger.warning("No user_id in checkout metadata", extra={"customer_id": customer_id})
        return

    # Determine plan from subscription
    plan = _plan_from_subscription(subscription_id)

    # Update user record
    user_pk = f"USER#{user_id}"
    table.update_item(
        Key={"pk": user_pk, "sk": user_pk},
        UpdateExpression=(
            "SET #p = :plan, stripe_subscription_id = :sub_id, "
            "stripe_customer_id = :cust_id, plan_updated_at = :now"
        ),
        ExpressionAttributeNames={"#p": "plan"},
        ExpressionAttributeValues={
            ":plan": plan,
            ":sub_id": subscription_id,
            ":cust_id": customer_id,
            ":now": _now_iso(),
        },
    )

    # Update org record too
    if org_id:
        org_pk = f"ORG#{org_id}"
        table.update_item(
            Key={"pk": org_pk, "sk": org_pk},
            UpdateExpression="SET #p = :plan, plan_updated_at = :now",
            ExpressionAttributeNames={"#p": "plan"},
            ExpressionAttributeValues={":plan": plan, ":now": _now_iso()},
        )

    logger.info("Plan activated", extra={
        "user_id": user_id, "org_id": org_id, "plan": plan,
        "subscription_id": subscription_id,
    })
    metrics.add_metric(name="PlanActivated", unit=MetricUnit.Count, value=1)


def _handle_subscription_updated(subscription: dict):
    """Subscription changed (upgrade/downgrade)."""
    customer_id = subscription.get("customer")
    subscription_id = subscription.get("id")
    plan = _plan_from_subscription_object(subscription)

    # Find user by stripe_customer_id
    user_id = _find_user_by_customer_id(customer_id)
    if not user_id:
        logger.warning("No user found for customer", extra={"customer_id": customer_id})
        return

    user_pk = f"USER#{user_id}"
    table.update_item(
        Key={"pk": user_pk, "sk": user_pk},
        UpdateExpression="SET #p = :plan, stripe_subscription_id = :sub_id, plan_updated_at = :now",
        ExpressionAttributeNames={"#p": "plan"},
        ExpressionAttributeValues={
            ":plan": plan,
            ":sub_id": subscription_id,
            ":now": _now_iso(),
        },
    )

    logger.info("Subscription updated", extra={
        "user_id": user_id, "plan": plan, "subscription_id": subscription_id,
    })


def _handle_subscription_deleted(subscription: dict):
    """Subscription cancelled — reset to free."""
    customer_id = subscription.get("customer")

    user_id = _find_user_by_customer_id(customer_id)
    if not user_id:
        logger.warning("No user found for cancelled subscription", extra={"customer_id": customer_id})
        return

    user_pk = f"USER#{user_id}"
    table.update_item(
        Key={"pk": user_pk, "sk": user_pk},
        UpdateExpression="SET #p = :plan, stripe_subscription_id = :empty, plan_updated_at = :now",
        ExpressionAttributeNames={"#p": "plan"},
        ExpressionAttributeValues={
            ":plan": "free",
            ":empty": "",
            ":now": _now_iso(),
        },
    )

    logger.info("Subscription cancelled, reset to free", extra={"user_id": user_id})
    metrics.add_metric(name="PlanCancelled", unit=MetricUnit.Count, value=1)


def _handle_payment_failed(invoice: dict):
    """Payment failed — log it. Could add email notification later."""
    customer_id = invoice.get("customer")
    logger.warning("Payment failed", extra={
        "customer_id": customer_id,
        "invoice_id": invoice.get("id"),
        "amount_due": invoice.get("amount_due"),
    })
    metrics.add_metric(name="PaymentFailed", unit=MetricUnit.Count, value=1)


# ─── Helpers ───

def _plan_from_subscription(subscription_id: str) -> str:
    """Fetch subscription from Stripe and determine plan."""
    _get_stripe_secret_key()
    sub = stripe.Subscription.retrieve(subscription_id)
    return _plan_from_subscription_object(sub)


def _plan_from_subscription_object(subscription) -> str:
    """Determine plan name from subscription's price ID."""
    items = subscription.get("items", {}).get("data", [])
    if not items:
        return "free"
    price_id = items[0].get("price", {}).get("id", "")
    if price_id in (PRICE_ID_MAX, PRICE_ID_MAX_ANNUAL):
        return "max"
    if price_id in (PRICE_ID_PRO, PRICE_ID_PRO_ANNUAL):
        return "pro"
    return "free"


def _find_user_by_customer_id(customer_id: str) -> str | None:
    """Find user_id by scanning for stripe_customer_id.

    NOTE: For production scale, add a GSI on stripe_customer_id.
    For beta with <100 users, a scan with filter is fine.

    Loops over pages until a match is found or the table is exhausted.
    Note: passing Limit=1 alongside a FilterExpression scans only one
    item before filtering and silently misses matches further in.
    """
    scan_kwargs: dict = {
        "FilterExpression": "stripe_customer_id = :cid AND begins_with(pk, :prefix)",
        "ExpressionAttributeValues": {
            ":cid": customer_id,
            ":prefix": "USER#",
        },
        "ProjectionExpression": "pk",
    }
    while True:
        result = table.scan(**scan_kwargs)
        for item in result.get("Items", []):
            # pk is "USER#{user_id}"
            return item["pk"].replace("USER#", "", 1)
        last = result.get("LastEvaluatedKey")
        if not last:
            return None
        scan_kwargs["ExclusiveStartKey"] = last


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _idempotency_key(scope: str, user_id: str, variant: str) -> str:
    """Build a deterministic idempotency key for Stripe API calls.

    Bucketed to the minute so a quick double-click collapses to one resource,
    but a deliberate retry a minute later creates a fresh session.
    """
    minute_bucket = int(time.time()) // 60
    return f"{scope}:{user_id}:{variant}:{minute_bucket}"


# ─── Lambda Handler ───

@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
