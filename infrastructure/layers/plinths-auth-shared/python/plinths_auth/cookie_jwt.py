"""Cookie JWT verification — shared across the API Gateway Authorizer and
the Muse Stream Lambda.

The function URL on `MuseStreamFunction` is `AuthType: NONE` (Function URLs
don't compose with the existing HttpOnly cookie auth), so that Lambda must
verify the cookie itself. The API Gateway Authorizer also verifies the same
cookie. Both call `verify_session_cookie` here so the rules stay aligned.

Rule: **Always-Deny on uncertainty.** Any branch that can't produce a fully
valid user record returns `None`. Never raise out of this module — the
callers cannot recover from an unexpected exception in a way that's safer
than denying.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import boto3
import jwt
from jwt import PyJWKClient


# ─── Configuration (resolved at import time) ───

_CLIENT_ID = os.environ.get("COGNITO_CLIENT_ID", "")
_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
_AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
_REPORTS_TABLE_NAME = os.environ.get("REPORTS_TABLE", "")

_JWKS_URI = (
    f"https://cognito-idp.{_AWS_REGION}.amazonaws.com/"
    f"{_USER_POOL_ID}/.well-known/jwks.json"
    if _USER_POOL_ID
    else ""
)
_EXPECTED_ISSUER = (
    f"https://cognito-idp.{_AWS_REGION}.amazonaws.com/{_USER_POOL_ID}"
    if _USER_POOL_ID
    else ""
)


# ─── Module-level caches (reused across Lambda invocations) ───

_jwks_client: PyJWKClient | None = None
_dynamodb = None
_table = None


def _get_jwks_client() -> PyJWKClient | None:
    global _jwks_client
    if _jwks_client is None and _JWKS_URI:
        _jwks_client = PyJWKClient(_JWKS_URI, cache_keys=True)
    return _jwks_client


def _get_table():
    global _dynamodb, _table
    if _table is None and _REPORTS_TABLE_NAME:
        _dynamodb = boto3.resource("dynamodb")
        _table = _dynamodb.Table(_REPORTS_TABLE_NAME)
    return _table


# ─── Public types ───


@dataclass(frozen=True)
class AuthContext:
    """Verified caller identity. Returned only after the JWT validates AND
    the user record exists in the Reports table with a non-empty org_id."""

    user_id: str
    org_id: str
    plan: str
    email: str


# ─── Public helpers ───


def parse_cookie_header(cookie_header: str | None) -> dict[str, str]:
    """Parse a raw `Cookie:` header value into a dict. Whitespace-tolerant."""
    cookies: dict[str, str] = {}
    if not cookie_header:
        return cookies
    for pair in cookie_header.split(";"):
        pair = pair.strip()
        if "=" in pair:
            k, v = pair.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies


def verify_session_cookie(cookie_header: str | None) -> AuthContext | None:
    """Validate the `ml_access` cookie. Returns `AuthContext` on success, `None`
    on any failure (missing/invalid/expired token, missing user record,
    DynamoDB error, unexpected exception).

    Callers MUST treat `None` as deny. Do not log the token. Errors are
    swallowed deliberately — the only safe response to ambiguity is deny.
    """
    cookies = parse_cookie_header(cookie_header)
    access_token = cookies.get("ml_access", "")
    if not access_token:
        return None

    try:
        jwks_client = _get_jwks_client()
        if jwks_client is None:
            return None
        signing_key = jwks_client.get_signing_key_from_jwt(access_token)
        # Cognito access tokens carry `client_id`, not `aud`. Verify manually.
        claims = jwt.decode(
            access_token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=_EXPECTED_ISSUER,
            options={"verify_exp": True, "verify_aud": False},
        )
    except Exception:
        return None

    if claims.get("token_use") != "access":
        return None
    if claims.get("client_id") != _CLIENT_ID:
        return None

    sub = claims.get("sub", "")
    if not sub:
        return None

    table = _get_table()
    if table is None:
        return None

    try:
        result = table.get_item(
            Key={"pk": f"USER#{sub}", "sk": f"USER#{sub}"},
            ConsistentRead=True,
        )
    except Exception:
        return None

    user = result.get("Item")
    if not user:
        return None

    org_id = user.get("org_id", "")
    if not org_id:
        return None

    return AuthContext(
        user_id=sub,
        org_id=org_id,
        plan=user.get("plan", "free"),
        email=user.get("email", ""),
    )
