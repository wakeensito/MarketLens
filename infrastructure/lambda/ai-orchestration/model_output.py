"""Validate model output before it can become a completed report."""

import json


def parse_object(text: str) -> dict:
    text = text.strip()
    if text.startswith("```") and text.endswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError("Model response must be a JSON object")
    return value


def require_text(value: dict, *keys: str) -> None:
    for key in keys:
        if not isinstance(value.get(key), str) or not value[key].strip():
            raise ValueError(f"Model response missing text: {key}")


def require_rows(value: dict, key: str, *fields: str, allow_empty=False) -> None:
    rows = value.get(key)
    if not isinstance(rows, list) or (not rows and not allow_empty):
        raise ValueError(f"Model response missing rows: {key}")
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError(f"Model response has invalid row: {key}")
        require_text(row, *fields)


def validate_analysis(value: dict, has_competitors: bool) -> dict:
    require_rows(
        value,
        "competitor_analysis",
        "name",
        "strength",
        "weakness",
        "market_position",
        allow_empty=not has_competitors,
    )
    require_rows(value, "market_gaps", "title", "description")
    require_text(value, "positioning")
    return value


def validate_summary(value: dict) -> dict:
    require_text(value, "oneliner", "trend_signal", "recommendation", "why_now")
    require_rows(value, "gaps", "title", "description")
    require_rows(value, "roadmap", "phase", "title", "description")
    require_rows(value, "entry_cost", "label", "value")
    if not isinstance(value.get("read"), dict):
        raise ValueError("Model response missing read")
    require_text(value["read"], "synthesis", "recommendation", "limit")
    return value
