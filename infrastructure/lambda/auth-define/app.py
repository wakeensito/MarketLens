"""
Cognito DefineAuthChallenge trigger — controls the custom auth flow.

Flow:
  1. First call: no previous challenges → issue CUSTOM_CHALLENGE
  2. User answers correctly → authentication complete
  3. User fails 3 times → authentication failed
"""
from aws_lambda_powertools import Logger

logger = Logger()

MAX_ATTEMPTS = 3


def lambda_handler(event: dict, context) -> dict:
    session = event.get("request", {}).get("session", [])

    # No previous challenges — start the flow
    if len(session) == 0:
        event["response"]["issueTokens"] = False
        event["response"]["failAuthentication"] = False
        event["response"]["challengeName"] = "CUSTOM_CHALLENGE"
        return event

    # Check the last challenge result
    last = session[-1]

    if last.get("challengeResult") is True:
        # Correct answer — issue tokens
        event["response"]["issueTokens"] = True
        event["response"]["failAuthentication"] = False
        return event

    if len(session) >= MAX_ATTEMPTS:
        # Too many failed attempts
        event["response"]["issueTokens"] = False
        event["response"]["failAuthentication"] = True
        return event

    # Wrong answer but attempts remaining — re-issue challenge
    event["response"]["issueTokens"] = False
    event["response"]["failAuthentication"] = False
    event["response"]["challengeName"] = "CUSTOM_CHALLENGE"
    return event
