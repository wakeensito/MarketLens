"""
Cognito CreateAuthChallenge trigger — generates a 6-digit OTP and sends it via SES.

The OTP is stored in privateChallengeParameters (never sent to the client).
The client receives only metadata (email destination hint).
"""
import os
import secrets

import boto3
from aws_lambda_powertools import Logger

logger = Logger()

ses = boto3.client("ses")
SENDER_EMAIL = os.environ["SENDER_EMAIL"]
APP_NAME = "MarketLens"


def _generate_code() -> str:
    """Generate a cryptographically secure 6-digit code."""
    return str(secrets.randbelow(900000) + 100000)


def _send_code(email: str, code: str) -> None:
    """Send the OTP code via SES."""
    ses.send_email(
        Source=SENDER_EMAIL,
        Destination={"ToAddresses": [email]},
        Message={
            "Subject": {"Data": f"Your {APP_NAME} sign-in code", "Charset": "UTF-8"},
            "Body": {
                "Html": {
                    "Data": (
                        f"<div style='font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;'>"
                        f"<h2 style='color: #1a1a2e; margin-bottom: 8px;'>{APP_NAME}</h2>"
                        f"<p style='color: #555; font-size: 15px; line-height: 1.5;'>Your sign-in code is:</p>"
                        f"<div style='background: #f4f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;'>"
                        f"<span style='font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1a1a2e;'>{code}</span>"
                        f"</div>"
                        f"<p style='color: #888; font-size: 13px;'>This code expires in 10 minutes. If you didn't request this, ignore this email.</p>"
                        f"</div>"
                    ),
                    "Charset": "UTF-8",
                },
                "Text": {
                    "Data": f"Your {APP_NAME} sign-in code is: {code}\n\nThis code expires in 10 minutes.",
                    "Charset": "UTF-8",
                },
            },
        },
    )


def lambda_handler(event: dict, context) -> dict:
    email = event.get("request", {}).get("userAttributes", {}).get("email", "")

    if not email:
        logger.error("No email in user attributes")
        raise ValueError("Email is required for custom auth challenge")

    code = _generate_code()

    # Send the code
    try:
        _send_code(email, code)
        logger.info("OTP sent", extra={"email_domain": email.split("@")[-1]})
    except Exception as e:
        logger.error("Failed to send OTP", extra={"error": str(e)})
        raise

    # Store code in private parameters (Cognito keeps this server-side)
    event["response"]["privateChallengeParameters"] = {"code": code}
    # Public parameters sent to client (just a hint, not the code)
    event["response"]["publicChallengeParameters"] = {
        "email": email[:3] + "***" + email[email.index("@"):],
    }
    event["response"]["challengeMetadata"] = "OTP_CHALLENGE"

    return event
