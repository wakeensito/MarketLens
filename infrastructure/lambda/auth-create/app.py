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


def _generate_code() -> str:
    """Generate a cryptographically secure 6-digit code."""
    return str(secrets.randbelow(900000) + 100000)


def _html_email(code: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f0ede7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f0ede7;">
    <tr>
      <td align="center" style="padding:48px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">

          <!-- Wordmark -->
          <tr>
            <td style="padding-bottom:24px;">
              <span style="font-size:22px;font-weight:700;letter-spacing:-0.03em;color:#1a1814;">plinths</span>
              <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#c9965a;margin-left:3px;vertical-align:middle;"></span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#faf8f5;border-radius:10px;border:1px solid #e4dfd6;overflow:hidden;">

              <!-- Card body -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:36px 40px 28px;">
                    <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#a89f96;">Sign-in code</p>
                    <p style="margin:0 0 28px;font-size:15px;color:#3d3830;line-height:1.65;">Enter this code to complete your sign-in. It expires in <strong style="color:#1a1814;">10 minutes</strong>.</p>

                    <!-- Code block -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td align="center" style="background-color:#eae6df;border-radius:8px;padding:28px 20px;">
                          <span style="font-family:'Courier New',Courier,monospace;font-size:38px;font-weight:700;letter-spacing:12px;color:#1a1814;display:block;padding-left:12px;">{code}</span>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:24px 0 0;font-size:13px;color:#a89f96;line-height:1.65;">Didn't request this? You can safely ignore this email — your account remains secure.</p>
                  </td>
                </tr>

                <!-- Card footer -->
                <tr>
                  <td style="padding:18px 40px;border-top:1px solid #e4dfd6;">
                    <p style="margin:0;font-size:12px;color:#b8b2aa;">plinths &mdash; AI market intelligence</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _send_code(email: str, code: str) -> None:
    """Send the OTP code via SES."""
    ses.send_email(
        Source=SENDER_EMAIL,
        Destination={"ToAddresses": [email]},
        Message={
            "Subject": {"Data": "Your plinths sign-in code", "Charset": "UTF-8"},
            "Body": {
                "Html": {
                    "Data": _html_email(code),
                    "Charset": "UTF-8",
                },
                "Text": {
                    "Data": (
                        f"Your plinths sign-in code is: {code}\n\n"
                        "This code expires in 10 minutes.\n"
                        "If you didn't request this, you can safely ignore this email."
                    ),
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

    try:
        _send_code(email, code)
        logger.info("OTP sent", extra={"email_domain": email.split("@")[-1]})
    except Exception as e:
        logger.error("Failed to send OTP", extra={"error": str(e)})
        raise

    event["response"]["privateChallengeParameters"] = {"code": code}

    local, _, domain = email.partition("@")
    if domain:
        masked_local = local if len(local) <= 3 else local[:3]
        masked_email = masked_local + "***@" + domain
    else:
        masked_email = (email[:3] if len(email) > 3 else email) + "***"

    event["response"]["publicChallengeParameters"] = {"email": masked_email}
    event["response"]["challengeMetadata"] = "OTP_CHALLENGE"

    return event
