"""
MarketLens BFF Auth Lambda — Backend-for-Frontend auth endpoints.

Handles OAuth2 flows with Cognito. Tokens never reach the browser —
they're stored in HttpOnly, Secure, SameSite=Strict cookies.

Endpoints:
  GET  /auth/login     → redirect to Cognito Hosted UI
  GET  /auth/callback  → exchange code for tokens, set cookies, redirect to app
  POST /auth/refresh   → silent token refresh via refresh_token cookie
  POST /auth/logout    → revoke tokens, clear cookies
  GET  /auth/me        → return current user info from access token
"""
import os
import json
import time
import hashlib
import hmac
import base64
import urllib.parse

import boto3
import jwt
import requests as http_requests
from jwt import PyJWKClient

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

logger = Logger()
tracer = Tracer()
app = APIGatewayRestResolver(strip_prefixes=["/auth"])

# ── Config from environment ──
COGNITO_DOMAIN = os.environ["COGNITO_DOMAIN"]
CLIENT_ID = os.environ["COGNITO_CLIENT_ID"]
CLIENT_SECRET = os.environ["COGNITO_CLIENT_SECRET"]
USER_POOL_ID = os.environ["COGNITO_USER_POOL_ID"]
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

# Cognito endpoints
TOKEN_ENDPOINT = f"https://{COGNITO_DOMAIN}/oauth2/token"
AUTHORIZE_ENDPOINT = f"https://{COGNITO_DOMAIN}/oauth2/authorize"
LOGOUT_ENDPOINT = f"https://{COGNITO_DOMAIN}/logout"
JWKS_URI = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json"

# Cookie config
ACCESS_TOKEN_MAX_AGE = 3600        # 1 hour
REFRESH_TOKEN_MAX_AGE = 2592000    # 30 days
COOKIE_DOMAIN = ""                 # empty = same origin (CloudFront domain)

# DynamoDB for user records
dynamodb = boto3.resource("dynamodb")
reports_table = dynamodb.Table(os.environ["REPORTS_TABLE"])

# JWKS client (cached in Lambda execution context)
_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(JWKS_URI, cache_keys=True)
    return _jwks_client


def _compute_secret_hash(username: str) -> str:
    """Compute Cognito SECRET_HASH for token requests."""
    msg = username + CLIENT_ID
    dig = hmac.new(
        CLIENT_SECRET.encode("utf-8"),
        msg.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.b64encode(dig).decode("utf-8")


def _set_cookie(name: str, value: str, max_age: int, http_only: bool = True) -> str:
    """Build a Set-Cookie header value."""
    parts = [
        f"{name}={value}",
        f"Max-Age={max_age}",
        "Path=/",
        "Secure",
        "SameSite=Strict",
    ]
    if http_only:
        parts.append("HttpOnly")
    return "; ".join(parts)


def _clear_cookie(name: str) -> str:
    """Build a Set-Cookie header that clears a cookie."""
    return f"{name}=; Max-Age=0; Path=/; Secure; SameSite=Strict; HttpOnly"


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


def _decode_access_token(token: str) -> dict:
    """Decode and validate a Cognito access token."""
    jwks_client = _get_jwks_client()
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=CLIENT_ID,
        options={"verify_exp": True},
    )


def _ensure_user_record(sub: str, email: str, name: str) -> dict:
    """Create or fetch user + personal org in DynamoDB. Returns user item."""
    from uuid import uuid4

    user_pk = f"USER#{sub}"
    result = reports_table.get_item(Key={"pk": user_pk, "sk": user_pk})
    existing = result.get("Item")

    if existing:
        return existing

    # First login — create personal org + user record
    org_id = str(uuid4()).replace("-", "")[:16]
    now = _iso_now()

    # Create org record
    reports_table.put_item(Item={
        "pk": f"ORG#{org_id}",
        "sk": f"ORG#{org_id}",
        "org_id": org_id,
        "org_name": f"{name or email}'s workspace",
        "owner_sub": sub,
        "plan": "free",
        "created_at": now,
    })

    # Create user record
    user_item = {
        "pk": user_pk,
        "sk": user_pk,
        "user_id": sub,
        "email": email,
        "name": name or email.split("@")[0],
        "org_id": org_id,
        "plan": "free",
        "created_at": now,
        "report_count_today": 0,
        "report_count_date": now[:10],
    }
    reports_table.put_item(Item=user_item)

    logger.info("New user created", extra={"user_id": sub, "org_id": org_id})
    return user_item


def _iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _get_origin_domain() -> str:
    """Derive the CloudFront domain from the request's Host or Origin header.
    Falls back to Referer. This avoids a circular dependency in the SAM template."""
    # API Gateway forwards the original Host header from CloudFront
    host = app.current_event.get_header_value("Host") or ""
    # If behind API Gateway, the Host is the APIGW domain — check Origin/Referer instead
    origin = app.current_event.get_header_value("Origin") or ""
    referer = app.current_event.get_header_value("Referer") or ""

    if origin and "cloudfront" in origin:
        return origin.replace("https://", "").replace("http://", "").split("/")[0]
    if referer and "cloudfront" in referer:
        return referer.replace("https://", "").replace("http://", "").split("/")[0]
    # For direct CloudFront → APIGW, the Host header is the APIGW domain.
    # The actual CF domain comes through the X-Forwarded-Host or we derive from Referer.
    x_fwd_host = app.current_event.get_header_value("X-Forwarded-Host") or ""
    if x_fwd_host:
        return x_fwd_host.split(",")[0].strip()
    # Last resort: use the Host header (works when CF passes it through)
    return host


def _get_redirect_uri() -> str:
    domain = _get_origin_domain()
    return f"https://{domain}/auth/callback"


def _get_app_url() -> str:
    domain = _get_origin_domain()
    return f"https://{domain}/"


# ── Routes ──


@app.get("/login")
@tracer.capture_method
def login():
    """Redirect to Cognito Hosted UI."""
    params = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "response_type": "code",
        "scope": "openid email profile",
        "redirect_uri": _get_redirect_uri(),
    })
    return {
        "statusCode": 302,
        "headers": {"Location": f"{AUTHORIZE_ENDPOINT}?{params}"},
        "body": "",
    }


@app.get("/callback")
@tracer.capture_method
def callback():
    """Exchange authorization code for tokens, set cookies, redirect to app."""
    code = app.current_event.get_query_string_value("code")
    error = app.current_event.get_query_string_value("error")

    if error:
        logger.warning("OAuth callback error", extra={"error": error})
        return _redirect_with_error("Authentication failed. Please try again.")

    if not code:
        return _redirect_with_error("Missing authorization code.")

    # Exchange code for tokens
    try:
        resp = http_requests.post(
            TOKEN_ENDPOINT,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": _get_redirect_uri(),
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )
        resp.raise_for_status()
        tokens = resp.json()
    except Exception as e:
        logger.error("Token exchange failed", extra={"error": str(e)})
        return _redirect_with_error("Login failed. Please try again.")

    access_token = tokens.get("access_token", "")
    refresh_token = tokens.get("refresh_token", "")
    id_token = tokens.get("id_token", "")

    # Decode ID token to get user info (unverified — we trust Cognito here)
    try:
        id_claims = jwt.decode(id_token, options={"verify_signature": False})
        sub = id_claims.get("sub", "")
        email = id_claims.get("email", "")
        name = id_claims.get("name", "") or id_claims.get("cognito:username", "")
    except Exception:
        sub, email, name = "", "", ""

    # Ensure user + org exist in DynamoDB
    if sub:
        try:
            _ensure_user_record(sub, email, name)
        except Exception as e:
            logger.error("User record creation failed", extra={"error": str(e), "sub": sub})

    # Set cookies and redirect to app
    cookies = [
        _set_cookie("ml_access", access_token, ACCESS_TOKEN_MAX_AGE),
        _set_cookie("ml_refresh", refresh_token, REFRESH_TOKEN_MAX_AGE),
        _set_cookie("ml_logged_in", "1", REFRESH_TOKEN_MAX_AGE, http_only=False),
    ]

    return {
        "statusCode": 302,
        "headers": {"Location": _get_app_url()},
        "multiValueHeaders": {"Set-Cookie": cookies},
        "body": "",
    }


@app.post("/refresh")
@tracer.capture_method
def refresh():
    """Silent refresh — exchange refresh token for new access token."""
    cookie_header = app.current_event.get_header_value("Cookie") or ""
    cookies = _parse_cookies(cookie_header)
    refresh_token = cookies.get("ml_refresh", "")

    if not refresh_token:
        return {"error": "No refresh token"}, 401

    try:
        resp = http_requests.post(
            TOKEN_ENDPOINT,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )
        resp.raise_for_status()
        tokens = resp.json()
    except Exception as e:
        logger.error("Token refresh failed", extra={"error": str(e)})
        return {"error": "Refresh failed"}, 401

    new_access = tokens.get("access_token", "")
    set_cookies = [
        _set_cookie("ml_access", new_access, ACCESS_TOKEN_MAX_AGE),
        _set_cookie("ml_logged_in", "1", REFRESH_TOKEN_MAX_AGE, http_only=False),
    ]

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "multiValueHeaders": {"Set-Cookie": set_cookies},
        "body": json.dumps({"status": "refreshed"}),
    }


@app.post("/logout")
@tracer.capture_method
def logout():
    """Revoke tokens and clear cookies."""
    cookie_header = app.current_event.get_header_value("Cookie") or ""
    cookies = _parse_cookies(cookie_header)
    refresh_token = cookies.get("ml_refresh", "")

    # Revoke refresh token with Cognito (best-effort)
    if refresh_token:
        try:
            cognito = boto3.client("cognito-idp")
            cognito.revoke_token(
                Token=refresh_token,
                ClientId=CLIENT_ID,
                ClientSecret=CLIENT_SECRET,
            )
        except Exception as e:
            logger.warning("Token revocation failed", extra={"error": str(e)})

    clear_cookies = [
        _clear_cookie("ml_access"),
        _clear_cookie("ml_refresh"),
        _clear_cookie("ml_logged_in"),
    ]

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "multiValueHeaders": {"Set-Cookie": clear_cookies},
        "body": json.dumps({"status": "logged_out"}),
    }


@app.get("/me")
@tracer.capture_method
def me():
    """Return current user info from access token cookie."""
    cookie_header = app.current_event.get_header_value("Cookie") or ""
    cookies = _parse_cookies(cookie_header)
    access_token = cookies.get("ml_access", "")

    if not access_token:
        return {"authenticated": False}, 200

    try:
        claims = _decode_access_token(access_token)
        sub = claims.get("sub", "")
    except Exception:
        return {"authenticated": False}, 200

    # Fetch user record
    try:
        result = reports_table.get_item(Key={"pk": f"USER#{sub}", "sk": f"USER#{sub}"})
        user = result.get("Item")
        if not user:
            return {"authenticated": False}, 200

        return {
            "authenticated": True,
            "user": {
                "user_id": user.get("user_id"),
                "email": user.get("email"),
                "name": user.get("name"),
                "org_id": user.get("org_id"),
                "plan": user.get("plan", "free"),
            },
        }
    except Exception as e:
        logger.error("Failed to fetch user", extra={"error": str(e)})
        return {"authenticated": False}, 200


def _redirect_with_error(message: str) -> dict:
    """Redirect to frontend with error query param."""
    encoded = urllib.parse.quote(message)
    app_url = _get_app_url().rstrip("/")
    return {
        "statusCode": 302,
        "headers": {"Location": f"{app_url}/?auth_error={encoded}"},
        "body": "",
    }


@logger.inject_lambda_context(correlation_id_path=correlation_paths.API_GATEWAY_REST)
@tracer.capture_lambda_handler
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
