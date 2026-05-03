"""
MarketLens BFF Auth Lambda — Backend-for-Frontend auth endpoints.

Handles OAuth2 flows with Cognito and passwordless email OTP.
Tokens never reach the browser — they're stored in HttpOnly, Secure, SameSite=Strict cookies.

Endpoints:
  POST /auth/initiate  → start passwordless email OTP flow
  POST /auth/verify    → verify OTP code, set cookies
  GET  /auth/login     → redirect to Cognito Hosted UI (Google SSO)
  GET  /auth/callback  → exchange code for tokens, set cookies, redirect to app
  POST /auth/refresh   → silent token refresh via refresh_token cookie
  POST /auth/logout    → revoke tokens, clear cookies
  GET  /auth/me        → return current user info from access token
"""
import os
import json
import secrets
import urllib.parse
import base64
import hashlib
import hmac

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
_CLIENT_SECRET: str | None = None


def _get_client_secret() -> str:
    global _CLIENT_SECRET
    if _CLIENT_SECRET is None:
        ssm = boto3.client("ssm")
        _CLIENT_SECRET = ssm.get_parameter(
            Name=os.environ["COGNITO_CLIENT_SECRET_PARAM"],
            WithDecryption=True,
        )["Parameter"]["Value"]
    return _CLIENT_SECRET
USER_POOL_ID = os.environ["COGNITO_USER_POOL_ID"]
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
APP_DOMAIN = os.environ["APP_DOMAIN"].rstrip("/")

# Cognito endpoints
TOKEN_ENDPOINT = f"https://{COGNITO_DOMAIN}/oauth2/token"
AUTHORIZE_ENDPOINT = f"https://{COGNITO_DOMAIN}/oauth2/authorize"
JWKS_URI = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json"
EXPECTED_ISSUER = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{USER_POOL_ID}"

# Cookie config
ACCESS_TOKEN_MAX_AGE = 3600        # 1 hour
REFRESH_TOKEN_MAX_AGE = 2592000    # 30 days
STATE_COOKIE_MAX_AGE = 600         # 10 minutes (OAuth state CSRF)

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


def _set_cookie(name: str, value: str, max_age: int, http_only: bool = True, samesite: str = "Strict") -> str:
    """Build a Set-Cookie header value."""
    parts = [
        f"{name}={value}",
        f"Max-Age={max_age}",
        "Path=/",
        "Secure",
        f"SameSite={samesite}",
    ]
    if http_only:
        parts.append("HttpOnly")
    return "; ".join(parts)


def _clear_cookie(name: str, samesite: str = "Strict") -> str:
    """Build a Set-Cookie header that clears a cookie."""
    return f"{name}=; Max-Age=0; Path=/; Secure; SameSite={samesite}; HttpOnly"


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


def _decode_and_verify_token(token: str) -> dict:
    """Decode and validate a Cognito token with full verification."""
    jwks_client = _get_jwks_client()
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=CLIENT_ID,
        issuer=EXPECTED_ISSUER,
        options={"verify_exp": True},
    )


def _ensure_user_record(sub: str, email: str, name: str) -> dict:
    """Create or fetch user + personal org in DynamoDB.

    Uses TransactWriteItems to atomically create both org and user records,
    with a condition check to prevent duplicate creation on concurrent logins.
    Returns user item.
    """
    from uuid import uuid4

    user_pk = f"USER#{sub}"

    # Check if user already exists (fast path)
    result = reports_table.get_item(Key={"pk": user_pk, "sk": user_pk})
    existing = result.get("Item")
    if existing:
        return existing

    # First login — create personal org + user record atomically
    org_id = str(uuid4()).replace("-", "")[:16]
    now = _iso_now()

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

    org_item = {
        "pk": f"ORG#{org_id}",
        "sk": f"ORG#{org_id}",
        "org_id": org_id,
        "org_name": f"{name or email}'s workspace",
        "owner_sub": sub,
        "plan": "free",
        "created_at": now,
    }

    try:
        client = reports_table.meta.client
        client.transact_write_items(
            TransactItems=[
                {
                    "Put": {
                        "TableName": reports_table.name,
                        "Item": {k: _serialize_value(v) for k, v in org_item.items()},
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
                {
                    "Put": {
                        "TableName": reports_table.name,
                        "Item": {k: _serialize_value(v) for k, v in user_item.items()},
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
            ]
        )
        logger.info("New user created", extra={"user_id": sub, "org_id": org_id})
        return user_item
    except client.exceptions.TransactionCanceledException:
        # Race condition: another concurrent login already created the user.
        # ConsistentRead ensures we see the item written by the winning transaction.
        result = reports_table.get_item(Key={"pk": user_pk, "sk": user_pk}, ConsistentRead=True)
        existing = result.get("Item")
        if existing:
            return existing
        raise


def _serialize_value(val):
    """Convert a Python value to DynamoDB AttributeValue format for low-level client."""
    if isinstance(val, str):
        return {"S": val}
    if isinstance(val, (int, float)):
        return {"N": str(val)}
    if isinstance(val, bool):
        return {"BOOL": val}
    if val is None:
        return {"NULL": True}
    return {"S": str(val)}


def _iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _get_redirect_uri() -> str:
    return f"{APP_DOMAIN}/auth/callback"


def _get_app_url() -> str:
    return f"{APP_DOMAIN}/"


# Cognito client for custom auth (InitiateAuth / RespondToAuthChallenge)
cognito_client = boto3.client("cognito-idp")


def _compute_secret_hash(username: str) -> str:
    msg = username + CLIENT_ID
    dig = hmac.new(_get_client_secret().encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(dig).decode("utf-8")


# ── Routes ──


@app.post("/initiate")
@tracer.capture_method
def initiate():
    """Start passwordless email OTP flow.

    If the user doesn't exist in Cognito, auto-creates them with a random password
    (they'll never use it — custom auth bypasses password entirely).
    """
    body = app.current_event.json_body
    if not isinstance(body, dict):
        return {"error": "Request body must be a JSON object"}, 400

    email = (body.get("email") or "").strip().lower()
    if not email or "@" not in email:
        return {"error": "Valid email is required"}, 400

    # Auto-create user if they don't exist
    try:
        cognito_client.admin_get_user(
            UserPoolId=USER_POOL_ID,
            Username=email,
        )
    except cognito_client.exceptions.UserNotFoundException:
        # Create user with random password (never used — custom auth bypasses it)
        random_password = secrets.token_urlsafe(24) + "!A1a"  # meets password policy
        try:
            cognito_client.sign_up(
                ClientId=CLIENT_ID,
                SecretHash=_compute_secret_hash(email),
                Username=email,
                Password=random_password,
                UserAttributes=[
                    {"Name": "email", "Value": email},
                ],
            )
            # Auto-confirm the user (skip email verification — OTP is the verification)
            cognito_client.admin_confirm_sign_up(
                UserPoolId=USER_POOL_ID,
                Username=email,
            )
            # Mark email as verified (OTP proves ownership)
            cognito_client.admin_update_user_attributes(
                UserPoolId=USER_POOL_ID,
                Username=email,
                UserAttributes=[
                    {"Name": "email_verified", "Value": "true"},
                ],
            )
            logger.info("Auto-created Cognito user", extra={"email_domain": email.split("@")[-1]})
        except cognito_client.exceptions.UsernameExistsException:
            pass  # Race condition — another request created them
        except Exception as e:
            logger.error("Failed to create Cognito user", extra={"error": str(e)})
            return {"error": "Failed to start sign-in. Please try again."}, 500

    # Initiate custom auth challenge
    try:
        response = cognito_client.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow="CUSTOM_AUTH",
            AuthParameters={
                "USERNAME": email,
                "SECRET_HASH": _compute_secret_hash(email),
            },
        )
    except Exception as e:
        logger.error("InitiateAuth failed", extra={"error": str(e)})
        return {"error": "Failed to start sign-in. Please try again."}, 500

    session = response.get("Session", "")
    challenge = response.get("ChallengeName", "")

    if challenge != "CUSTOM_CHALLENGE":
        logger.error("Unexpected challenge", extra={"challenge": challenge})
        return {"error": "Authentication configuration error."}, 500

    # Return session token (client needs it for verify step)
    return {
        "session": session,
        "challenge": challenge,
        "email_hint": email[:3] + "***" + email[email.index("@"):],
    }


@app.post("/verify")
@tracer.capture_method
def verify():
    """Verify OTP code and set auth cookies."""
    body = app.current_event.json_body
    if not isinstance(body, dict):
        return {"error": "Request body must be a JSON object"}, 400

    email = (body.get("email") or "").strip().lower()
    code = (body.get("code") or "").strip()
    session = body.get("session", "")

    if not email or not code or not session:
        return {"error": "Email, code, and session are required"}, 400

    if len(code) != 6 or not code.isdigit():
        return {"error": "Code must be 6 digits"}, 400

    try:
        response = cognito_client.respond_to_auth_challenge(
            ClientId=CLIENT_ID,
            ChallengeName="CUSTOM_CHALLENGE",
            Session=session,
            ChallengeResponses={
                "USERNAME": email,
                "ANSWER": code,
                "SECRET_HASH": _compute_secret_hash(email),
            },
        )
    except cognito_client.exceptions.NotAuthorizedException:
        return {"error": "Invalid or expired code. Please try again."}, 401
    except cognito_client.exceptions.CodeMismatchException:
        return {"error": "Incorrect code. Please try again."}, 401
    except Exception as e:
        logger.error("RespondToAuthChallenge failed", extra={"error": str(e)})
        return {"error": "Verification failed. Please try again."}, 500

    # Check if we got tokens (authentication complete)
    auth_result = response.get("AuthenticationResult")
    if not auth_result:
        # Another challenge round needed (shouldn't happen with our flow)
        new_session = response.get("Session", "")
        return {
            "session": new_session,
            "challenge": response.get("ChallengeName", ""),
            "error": "Incorrect code. Please try again.",
        }, 401

    access_token = auth_result.get("AccessToken", "")
    refresh_token = auth_result.get("RefreshToken", "")
    id_token = auth_result.get("IdToken", "")

    if not access_token or not refresh_token:
        logger.error("Cognito returned incomplete tokens after OTP verify")
        return {"error": "Authentication failed. Please try again."}, 500

    # Get user sub from ID token
    try:
        id_claims = _decode_and_verify_token(id_token)
        sub = id_claims.get("sub", "")
    except Exception as e:
        logger.error("ID token verification failed after OTP", extra={"error": str(e)})
        return {"error": "Authentication failed. Please try again."}, 500

    if not sub:
        return {"error": "Authentication failed."}, 500

    # Ensure user + org exist in DynamoDB
    try:
        _ensure_user_record(sub, email, email.split("@")[0])
    except Exception as e:
        logger.error("User record creation failed", extra={"error": str(e), "sub": sub})

    # Set cookies
    response_cookies = [
        _set_cookie("ml_access", access_token, ACCESS_TOKEN_MAX_AGE),
        _set_cookie("ml_refresh", refresh_token, REFRESH_TOKEN_MAX_AGE),
        _set_cookie("ml_logged_in", "1", REFRESH_TOKEN_MAX_AGE, http_only=False),
    ]

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "multiValueHeaders": {"Set-Cookie": response_cookies},
        "body": json.dumps({"status": "authenticated", "email": email}),
    }


@app.get("/login")
@tracer.capture_method
def login():
    """Redirect to Cognito Hosted UI with CSRF state parameter."""
    state = secrets.token_urlsafe(32)

    params = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "response_type": "code",
        "scope": "openid email profile",
        "redirect_uri": _get_redirect_uri(),
        "state": state,
    })

    state_cookie = _set_cookie("ml_oauth_state", state, STATE_COOKIE_MAX_AGE, samesite="Lax")

    return {
        "statusCode": 302,
        "headers": {"Location": f"{AUTHORIZE_ENDPOINT}?{params}"},
        "multiValueHeaders": {"Set-Cookie": [state_cookie]},
        "body": "",
    }


@app.get("/callback")
@tracer.capture_method
def callback():
    """Exchange authorization code for tokens, set cookies, redirect to app."""
    code = app.current_event.get_query_string_value("code")
    error = app.current_event.get_query_string_value("error")
    state = app.current_event.get_query_string_value("state")

    if error:
        logger.warning("OAuth callback error", extra={"error": error})
        return _redirect_with_error("Authentication failed. Please try again.")

    if not code:
        return _redirect_with_error("Missing authorization code.")

    # Validate CSRF state
    cookie_header = app.current_event.get_header_value("Cookie") or ""
    cookies = _parse_cookies(cookie_header)
    expected_state = cookies.get("ml_oauth_state", "")

    if not state or not expected_state or not secrets.compare_digest(state, expected_state):
        logger.warning("OAuth state mismatch (CSRF check failed)")
        return _redirect_with_error("Authentication failed. Please try again.")

    # Exchange code for tokens
    try:
        resp = http_requests.post(
            TOKEN_ENDPOINT,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": _get_redirect_uri(),
                "client_id": CLIENT_ID,
                "client_secret": _get_client_secret(),
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

    # Validate tokens are present
    if not access_token or not refresh_token:
        logger.error("Cognito returned incomplete tokens", extra={
            "has_access": bool(access_token),
            "has_refresh": bool(refresh_token),
        })
        return _redirect_with_error("Login failed. Please try again.")

    # Decode and verify ID token (full signature + issuer validation)
    try:
        id_claims = _decode_and_verify_token(id_token)
        sub = id_claims.get("sub", "")
        email = id_claims.get("email", "")
        name = id_claims.get("name", "") or id_claims.get("cognito:username", "")
    except Exception as e:
        logger.error("ID token verification failed", extra={"error": str(e)})
        return _redirect_with_error("Login failed. Please try again.")

    if not sub:
        logger.error("ID token missing sub claim")
        return _redirect_with_error("Login failed. Please try again.")

    # Ensure user + org exist in DynamoDB
    try:
        _ensure_user_record(sub, email, name)
    except Exception as e:
        logger.error("User record creation failed", extra={"error": str(e), "sub": sub})

    # Set cookies and redirect to app (clear the state cookie)
    response_cookies = [
        _set_cookie("ml_access", access_token, ACCESS_TOKEN_MAX_AGE),
        _set_cookie("ml_refresh", refresh_token, REFRESH_TOKEN_MAX_AGE),
        _set_cookie("ml_logged_in", "1", REFRESH_TOKEN_MAX_AGE, http_only=False),
        _clear_cookie("ml_oauth_state", samesite="Lax"),
    ]

    return {
        "statusCode": 302,
        "headers": {"Location": _get_app_url()},
        "multiValueHeaders": {"Set-Cookie": response_cookies},
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
                "client_secret": _get_client_secret(),
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
    if not new_access:
        return {"error": "Refresh failed"}, 401

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

    if refresh_token:
        try:
            cognito = boto3.client("cognito-idp")
            cognito.revoke_token(
                Token=refresh_token,
                ClientId=CLIENT_ID,
                ClientSecret=_get_client_secret(),
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
        claims = _decode_and_verify_token(access_token)
        sub = claims.get("sub", "")
    except Exception:
        return {"authenticated": False}, 200

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
