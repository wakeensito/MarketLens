"""Plinths shared auth + entitlement.

`verify_session_cookie` is the single source of truth for "is this caller a
valid signed-in user?" (API Gateway authorizer and the Muse Stream Lambda).
`plinths_auth.billing.effective_plan` is the single source of truth for
"which plan do the gates enforce?" (every plan-gated Lambda).

Re-exports are lazy (PEP 562) so a Lambda that only needs `billing` does not
import PyJWT/cryptography at cold start.
"""

from __future__ import annotations

__all__ = ["AuthContext", "parse_cookie_header", "verify_session_cookie"]


def __getattr__(name: str):
    if name in __all__:
        from . import cookie_jwt

        return getattr(cookie_jwt, name)
    raise AttributeError(f"module 'plinths_auth' has no attribute {name!r}")
