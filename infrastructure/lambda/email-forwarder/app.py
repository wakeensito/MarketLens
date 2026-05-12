"""
Email forwarder Lambda — forwards incoming SES emails to a personal address.

Triggered by S3 put events when SES receives email at info@plinths.net or support@plinths.net.
The destination address is stored in SSM SecureString (PII).
"""

import os
import boto3
from email import message_from_bytes
from email.message import Message
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

s3 = boto3.client("s3")
ses = boto3.client("ses")
ssm = boto3.client("ssm")

_forward_to: str | None = None


def _get_forward_to() -> str:
    global _forward_to
    if _forward_to is None:
        _forward_to = ssm.get_parameter(
            Name=os.environ["FORWARD_TO_EMAIL_PARAM"],
            WithDecryption=True,
        )["Parameter"]["Value"]
    return _forward_to


def _extract_body(message: Message) -> str:
    if not message.is_multipart():
        payload = message.get_payload(decode=True)
        if isinstance(payload, bytes):
            charset = message.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace")
        return str(payload or "")

    html_fallback: str | None = None
    for part in message.walk():
        if part.is_multipart():
            continue
        disposition = part.get_content_disposition()
        if disposition not in (None, "inline") or part.get_filename():
            continue
        content_type = part.get_content_type()
        payload = part.get_payload(decode=True)
        if not isinstance(payload, bytes):
            continue
        charset = part.get_content_charset() or "utf-8"
        text = payload.decode(charset, errors="replace")
        if content_type == "text/plain":
            return text
        if content_type == "text/html" and html_fallback is None:
            html_fallback = text
    return html_fallback or ""


def handler(event, context):
    """Forward incoming email from S3 to the configured personal address."""
    forward_to = _get_forward_to()

    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = record["s3"]["object"]["key"]

    response = s3.get_object(Bucket=bucket, Key=key)
    raw_email = response["Body"].read()

    original_message = message_from_bytes(raw_email)

    from_address = original_message.get("From", "unknown@unknown.com")
    subject = original_message.get("Subject", "(no subject)")
    original_body = _extract_body(original_message)

    forwarded = MIMEMultipart()
    forwarded["From"] = "info@plinths.net"
    forwarded["To"] = forward_to
    forwarded["Subject"] = f"[Plinths] {subject}"
    forwarded["Reply-To"] = from_address

    body = f"""Forwarded message from: {from_address}
Original subject: {subject}

---

{original_body}
"""

    forwarded.attach(MIMEText(body, "plain"))

    ses.send_raw_email(
        Source="info@plinths.net",
        Destinations=[forward_to],
        RawMessage={"Data": forwarded.as_string()},
    )

    print(f"Forwarded email from {from_address}")

    return {"statusCode": 200, "body": "Email forwarded"}
