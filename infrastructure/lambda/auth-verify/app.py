"""
Cognito VerifyAuthChallengeResponse trigger — checks the user's OTP answer.

Compares the user's answer against the code stored in privateChallengeParameters.
Uses constant-time comparison to prevent timing attacks.
"""
import hmac

from aws_lambda_powertools import Logger

logger = Logger()


def lambda_handler(event: dict, context) -> dict:
    expected = event.get("request", {}).get("privateChallengeParameters", {}).get("code", "")
    answer = event.get("request", {}).get("challengeAnswer", "").strip()

    # Constant-time comparison
    is_correct = hmac.compare_digest(expected, answer)

    event["response"]["answerCorrect"] = is_correct

    if not is_correct:
        logger.info("OTP verification failed")
    else:
        logger.info("OTP verification succeeded")

    return event
