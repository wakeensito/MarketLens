"""Plinths shared auth — cookie JWT verification.

Single source of truth for "is this caller a valid signed-in user?" used by
the API Gateway Lambda Authorizer AND by Lambdas behind a Function URL that
must verify the cookie themselves (the Muse Stream Lambda).

Always-Deny on any uncertainty (CLAUDE.md > Security Rules — Lambda Authorizer).
"""

from .cookie_jwt import (
    AuthContext,
    parse_cookie_header,
    verify_session_cookie,
)

__all__ = ["AuthContext", "parse_cookie_header", "verify_session_cookie"]
