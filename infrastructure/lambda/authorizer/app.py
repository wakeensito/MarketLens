"""
MarketLens Lambda Authorizer — Cookie-based JWT validation.

Reads ml_access cookie, validates JWT against Cognito JWKS,
and injects user_id + org_id into the request context.

Supports mixed mode:
  - Authenticated requests get full context
  - Anonymous requests get a limited "anonymous" context
    (API Lambda enforces the 1-free-report limit)
"""
import os
import json
import re

import boto3
import jwt
from jwt import PyJWKClient

from aws_lambda_powertools import Logger

logger = Logger()

# ── Config ──
CLIENT_ID = os.environ["COGNITO_CLIENT_ID"]
USER_POOL_ID = os.environ["COGNITO_USER_POOL_ID"]
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
REPORTS_TABLE = os.environ["REPORTS_TABLE"]

JWKS_URI = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json"
EXPECTED_ISSUER = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{USER_POOL_ID}"

# Cached across invocations
_jwks_client = None
_dynamodb = None
_table = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(JWKS_URI, cache_keys=True)
    return _jwks_client


def _get_table():
    global _dynamodb, _table
    if _table is None:
        _dynamodb = boto3.resource("dynamodb")
        _table = _dynamodb.Table(REPORTS_TABLE)
    return _table


def _parse_cookies(cookie_header: str) -> dict:
    """Parse Cookie header into dict."""
    cookies = {}
    if not cookie_header:
        return cookies
    for pair in cookie_header.split(";"):
        pair = pair.strip()
        if "=" in pair:
            k, v = pair.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies


def _extract_cookie_header(event: dict) -> str:
    """Extract Cookie header from API Gateway event (v1 format)."""
    headers = event.get("headers") or {}
    # API Gateway normalizes header names to lowercase
    return headers.get("Cookie") or headers.get("cookie") or ""


def _generate_policy(principal_id: str, effect: str, resource: str, context: dict) -> dict:
    """Generate IAM policy document for API Gateway authorizer."""
    # Use a wildcard resource so the policy is cached across all API methods
    # Strip the specific method/path and replace with wildcard
    arn_parts = resource.split(":")
    api_gw_arn = arn_parts[5].split("/")
    # arn:aws:execute-api:region:account:api-id/stage/method/resource
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


def lambda_handler(event: dict, context) -> dict:
    """
    Authorizer handler. Always allows the request through (mixed mode),
    but sets context differently for authenticated vs anonymous users.
    """
    method_arn = event.get("methodArn", "")
    cookie_header = _extract_cookie_header(event)
    cookies = _parse_cookies(cookie_header)
    access_token = cookies.get("ml_access", "")

    # No token → anonymous context
    if not access_token:
        logger.info("Anonymous request (no token)")
        return _generate_policy("anonymous", "Allow", method_arn, {
            "user_id": "anonymous",
            "org_id": "anonymous",
            "is_authenticated": "false",
        })

    # Validate JWT
    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(access_token)
        claims = jwt.decode(
            access_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=CLIENT_ID,
            issuer=EXPECTED_ISSUER,
            options={"verify_exp": True},
        )

        # Cognito access tokens have token_use=access; reject ID tokens
        if claims.get("token_use") != "access":
            logger.warning("Token is not an access token", extra={"token_use": claims.get("token_use")})
            return _generate_policy("anonymous", "Allow", method_arn, {
                "user_id": "anonymous",
                "org_id": "anonymous",
                "is_authenticated": "false",
            })
    except jwt.ExpiredSignatureError:
        logger.info("Expired access token")
        return _generate_policy("anonymous", "Allow", method_arn, {
            "user_id": "anonymous",
            "org_id": "anonymous",
            "is_authenticated": "false",
            "token_expired": "true",
        })
    except Exception as e:
        logger.warning("JWT validation failed", extra={"error": str(e)})
        return _generate_policy("anonymous", "Allow", method_arn, {
            "user_id": "anonymous",
            "org_id": "anonymous",
            "is_authenticated": "false",
        })

    sub = claims.get("sub", "")

    # Look up user record to get org_id
    try:
        table = _get_table()
        result = table.get_item(Key={"pk": f"USER#{sub}", "sk": f"USER#{sub}"})
        user = result.get("Item")
        if not user:
            logger.warning("Authenticated user not found in DB", extra={"sub": sub})
            return _generate_policy(sub, "Allow", method_arn, {
                "user_id": sub,
                "org_id": "anonymous",
                "is_authenticated": "false",
            })

        org_id = user.get("org_id", "")
        logger.info("Authenticated request", extra={"user_id": sub, "org_id": org_id})

        return _generate_policy(sub, "Allow", method_arn, {
            "user_id": sub,
            "org_id": org_id,
            "is_authenticated": "true",
            "plan": user.get("plan", "free"),
            "email": user.get("email", ""),
        })

    except Exception as e:
        logger.error("User lookup failed", extra={"error": str(e), "sub": sub})
        return _generate_policy(sub, "Allow", method_arn, {
            "user_id": sub,
            "org_id": "anonymous",
            "is_authenticated": "false",
        })
