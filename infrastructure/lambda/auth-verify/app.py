"""
Cognito VerifyAuthChallengeResponse trigger — checks the user's OTP answer.

Compares the user's answer against the code stored in privateChallengeParameters.
Uses constant-time comparison to prevent timing attacks.
"""
import hmac

from aws_lambda_powertools import Logger

logger = Logger()


def lambda_handler(event: dict, context) -> dict:
    expected = event.get("request", {}).get("privateChallengeParameters", {}).get("code")
    answer = (event.get("request", {}).get("challengeAnswer") or "").strip()

    logger.info("Verify event details", extra={
        "has_private_params": bool(event.get("request", {}).get("privateChallengeParameters")),
        "has_expected": bool(expected),
        "answer_length": len(answer) if answer else 0,
        "expected_length": len(expected) if expected else 0,
    })

    if not expected or not isinstance(expected, str):
        event["response"]["answerCorrect"] = False
        logger.warning("OTP verification missing or invalid expected code in privateChallengeParameters")
        return event

    # Constant-time comparison (expected is a non-empty string)
    if len(expected) != len(answer):
        is_correct = False
    else:
        is_correct = hmac.compare_digest(expected, answer)

    event["response"]["answerCorrect"] = is_correct

    if not is_correct:
        logger.info("OTP verification failed")
    else:
        logger.info("OTP verification succeeded")

    return event
