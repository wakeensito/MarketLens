"""Prompt construction + response parsing for the Build Brief.

`build_prompt` grounds a founder-altitude, vendor-neutral brief in the completed
report. `parse_and_validate` extracts the JSON object the frontend adapter
expects and makes it DynamoDB-safe (no floats)."""

from __future__ import annotations

import json
import re
from decimal import Decimal

_INSTRUCTIONS = """You are writing a founder-altitude "Build Brief" for a NON-TECHNICAL founder, derived from a completed market report. Write plain English. Stay vendor-neutral: name generic primitives with example cross-cloud mappings; never recommend a specific cloud, never use vendor logos.

Rules:
- If the idea is NOT technology-dominant (e.g. a local bakery), set "is_tech_dominant": false, keep complexity low, and let "foundation" collapse to a website + payments. Never invent infrastructure a simple business does not need.
- "capabilities": the functional building blocks the product needs; tag each "build" (the founder's differentiator) or "buy" (an off-the-shelf vendor solves it) with a one-line recommendation.
- "foundation": the handful of generic primitives this needs (e.g. object storage, a managed database), each with a cross-cloud example mapping like "S3 / Blob Storage / Cloud Storage".
- "technical_risks": what commonly sinks this kind of build.
- Be directional and honest; this is a starting point, not a vetted secure design."""

_SCHEMA_HINT = """Return ONLY a JSON object — no prose, no markdown fences — matching exactly this shape:
{
  "is_tech_dominant": true,
  "complexity_score": "0-100 as a string",
  "complexity_label": "short label, e.g. Moderate",
  "complexity_drivers": ["short phrase"],
  "capabilities": [
    {"name": "", "description": "", "build_or_buy": "build", "recommendation": ""}
  ],
  "foundation": [
    {"primitive": "", "why": "", "cloud_examples": "S3 / Blob Storage / Cloud Storage"}
  ],
  "mvp_scope": "plain-English paragraph",
  "effort_estimate": {"timeframe": "", "team_shape": ""},
  "technical_risks": [{"title": "", "description": ""}]
}"""

_REQUIRED_KEYS = (
    "is_tech_dominant",
    "complexity_score",
    "complexity_label",
    "complexity_drivers",
    "capabilities",
    "foundation",
    "mvp_scope",
    "effort_estimate",
    "technical_risks",
)


def build_prompt(idea_text: str, result_json: dict) -> str:
    # default=str so DynamoDB Decimals (and anything non-JSON) serialize cleanly.
    report_summary = json.dumps(result_json, default=str)[:6000]
    return (
        f"{_INSTRUCTIONS}\n\n"
        f"FOUNDER'S IDEA:\n{idea_text}\n\n"
        f"MARKET REPORT (JSON):\n{report_summary}\n\n"
        f"{_SCHEMA_HINT}"
    )


def parse_and_validate(raw_text: str) -> dict:
    """Extract the JSON object from the model output and validate required keys.
    Raises ValueError (incl. json.JSONDecodeError) if unparseable or incomplete."""
    text = raw_text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("No JSON object in model output")
        text = text[start : end + 1]

    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("Model output is not a JSON object")
    missing = [k for k in _REQUIRED_KEYS if k not in parsed]
    if missing:
        raise ValueError(f"Brief missing keys: {missing}")
    # Container-type guard: generate-once (no regenerate) makes a malformed brief
    # permanent, and the frontend adapter .map()s the array fields. Fail to a 502
    # on a wrong container type so a retry can recover instead of storing garbage.
    for key in ("complexity_drivers", "capabilities", "foundation", "technical_risks"):
        if not isinstance(parsed[key], list):
            raise ValueError(f"{key} must be a list")
    if not isinstance(parsed["effort_estimate"], dict):
        raise ValueError("effort_estimate must be an object")
    # Frontend adapter treats complexity_score via parseScore; keep it a string
    # to match the result_json string-number convention.
    if not isinstance(parsed["complexity_score"], str):
        parsed["complexity_score"] = str(parsed["complexity_score"])
    # DynamoDB rejects Python floats — round-trip with parse_float=Decimal so any
    # stray numeric field stores safely. Powertools serializes Decimal on read.
    return json.loads(json.dumps(parsed), parse_float=Decimal)
