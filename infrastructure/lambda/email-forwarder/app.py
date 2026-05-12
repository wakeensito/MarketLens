"""
Email forwarder Lambda — forwards incoming SES emails to personal Gmail.

Triggered by S3 put events when SES receives email at info@plinths.net or support@plinths.net.
"""
import os
import boto3
from email import message_from_bytes
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

s3 = boto3.client("s3")
ses = boto3.client("ses")

FORWARD_TO = os.environ["FORWARD_TO_EMAIL"]  # wakeenproduction@gmail.com


def handler(event, context):
    """Forward incoming email from S3 to personal Gmail."""
    
    # Get S3 object key from event
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = record["s3"]["object"]["key"]
    
    # Download email from S3
    response = s3.get_object(Bucket=bucket, Key=key)
    raw_email = response["Body"].read()
    
    # Parse email
    original_message = message_from_bytes(raw_email)
    
    # Extract key fields
    from_address = original_message.get("From", "unknown@unknown.com")
    subject = original_message.get("Subject", "(no subject)")
    
    # Create forwarded message
    forwarded = MIMEMultipart()
    forwarded["From"] = "info@plinths.net"
    forwarded["To"] = FORWARD_TO
    forwarded["Subject"] = f"[Plinths] {subject}"
    forwarded["Reply-To"] = from_address
    
    # Add body with original sender info
    body = f"""Forwarded message from: {from_address}
Original subject: {subject}

---

{original_message.get_payload()}
"""
    
    forwarded.attach(MIMEText(body, "plain"))
    
    # Send via SES
    ses.send_raw_email(
        Source="info@plinths.net",
        Destinations=[FORWARD_TO],
        RawMessage={"Data": forwarded.as_string()}
    )
    
    print(f"Forwarded email from {from_address} to {FORWARD_TO}")
    
    return {"statusCode": 200, "body": "Email forwarded"}
