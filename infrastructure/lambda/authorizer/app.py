"""
Plinths Lambda Authorizer — Cookie-based JWT validation.

Reads the `ml_access` cookie, validates against Cognito JWKs, and looks up
the user record in the Reports table. All of that logic lives in the
`plinths_auth` Lambda Layer so the Muse Stream Lambda (which lives behind a
Function URL with `AuthType: NONE`) can reuse the exact same rules.

This handler:
  - extracts the Cookie header from the API Gateway event
  - calls `verify_session_cookie` from the shared layer
  - maps the result to an API Gateway authorizer policy (Allow / Deny)

Always-Deny on uncertainty.
"""

from plinths_auth import verify_session_cookie

from aws_lambda_powertools import Logger, Metrics
from aws_lambda_powertools.metrics import MetricUnit

logger = Logger()
metrics = Metrics(namespace="MarketLens", service="Authorizer")


_DENY_CONTEXT = {
    "user_id": "anonymous",
    "org_id": "anonymous",
    "is_authenticated": "false",
}


def _extract_cookie_header(event: dict) -> str:
    """Extract Cookie header from an API Gateway v1 (REST) event."""
    headers = event.get("headers") or {}
    return headers.get("Cookie") or headers.get("cookie") or ""


def _generate_policy(
    principal_id: str, effect: str, resource: str, context: dict
) -> dict:
    """Build an API Gateway authorizer policy.

    Uses a wildcard resource so the policy is cached across all API methods
    on this stage (Authorizer is set to ReauthorizeEvery: 300 in the template).
    """
    arn_parts = resource.split(":")
    api_gw_arn = arn_parts[5].split("/")
    wildcard_resource = ":".join(arn_parts[:5]) + ":" + "/".join(api_gw_arn[:2]) + "/*"

    return {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": effect,
                    "Resource": wildcard_resource,
                }
            ],
        },
        "context": context,
    }


@metrics.log_metrics
def lambda_handler(event: dict, context) -> dict:
    method_arn = event.get("methodArn", "")
    cookie_header = _extract_cookie_header(event)

    auth = verify_session_cookie(cookie_header)

    if auth is None:
        # Layer returned None → any of: missing cookie, invalid JWT, expired,
        # wrong token_use/client_id, user record missing, DDB error.
        # The layer already swallows the specific cause; we just deny here.
        metrics.add_metric(name="AuthDenied", unit=MetricUnit.Count, value=1)
        # We don't know the sub if the JWT failed, so use "anonymous" as principal.
        return _generate_policy("anonymous", "Deny", method_arn, _DENY_CONTEXT)

    logger.info(
        "Authenticated request",
        extra={"user_id": auth.user_id, "org_id": auth.org_id},
    )
    return _generate_policy(
        auth.user_id,
        "Allow",
        method_arn,
        {
            "user_id": auth.user_id,
            "org_id": auth.org_id,
            "is_authenticated": "true",
            "plan": auth.plan,
            "email": auth.email,
        },
    )
