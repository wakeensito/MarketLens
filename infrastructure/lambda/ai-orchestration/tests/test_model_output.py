import json
import pytest
from model_output import parse_object, validate_analysis, validate_summary


def test_fenced_json_is_accepted():
    assert parse_object('```json\n{"oneliner": "hello"}\n```') == {"oneliner": "hello"}


@pytest.mark.parametrize("text", ['{"gaps": [', "[]", "null"])
def test_invalid_or_truncated_output_fails(text):
    with pytest.raises(ValueError):
        parse_object(text)


def summary():
    return dict(
        oneliner="An idea",
        trend_signal="A trend",
        recommendation="Test it",
        why_now="A change",
        gaps=[dict(title="Gap", description="Need")],
        roadmap=[dict(phase="1", title="Test", description="Interview users")],
        entry_cost=[dict(label="Time", value="A month")],
        read=dict(synthesis="Assessment", recommendation="Test", limit="Uncertain"),
    )


def test_valid_summary_roundtrip():
    value = summary()
    assert validate_summary(parse_object(json.dumps(value))) == value


@pytest.mark.parametrize(
    "key", ["gaps", "roadmap", "entry_cost", "read", "oneliner", "why_now"]
)
def test_missing_or_empty_summary_panels_fail(key):
    value = summary()
    value[key] = [] if key in {"gaps", "roadmap", "entry_cost"} else ""
    with pytest.raises(ValueError):
        validate_summary(value)


def test_empty_analysis_cannot_hide_discovered_competitors():
    value = dict(
        competitor_analysis=[],
        market_gaps=[dict(title="Gap", description="Need")],
        positioning="Test",
    )
    with pytest.raises(ValueError):
        validate_analysis(value, has_competitors=True)
    assert validate_analysis(value, has_competitors=False) == value
