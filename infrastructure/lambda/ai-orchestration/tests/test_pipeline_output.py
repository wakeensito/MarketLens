"""Exercise actual stage functions with mocked AWS and model responses."""

import importlib.util
import io
import json
from pathlib import Path
from unittest.mock import patch

import pytest


@pytest.fixture
def pipeline(monkeypatch):
    for name in (
        "REPORTS_TABLE",
        "BEDROCK_MODEL_ID_PARSE",
        "BEDROCK_MODEL_ID_ANALYSE",
        "BEDROCK_MODEL_ID_SUMMARISE",
    ):
        monkeypatch.setenv(name, "test")
    monkeypatch.setenv("LLM_MAX_ATTEMPTS", "2")
    spec = importlib.util.spec_from_file_location(
        "report_pipeline_test", Path(__file__).parents[1] / "app.py"
    )
    module = importlib.util.module_from_spec(spec)
    with patch("boto3.client"), patch("boto3.resource"):
        spec.loader.exec_module(module)
    monkeypatch.setattr(module.time, "sleep", lambda _: None)
    return module


def response(text):
    return {
        "body": io.BytesIO(
            json.dumps({"output": {"message": {"content": [{"text": text}]}}}).encode()
        )
    }


def test_malformed_json_retries_before_returning(pipeline):
    pipeline.bedrock.invoke_model.side_effect = [
        response('{"gaps": ['),
        response('```json\n{"industry":"Fitness"}\n```'),
    ]
    assert (
        json.loads(pipeline.call_llm("prompt", "nova", stage="parse").split("\n")[1])[
            "industry"
        ]
        == "Fitness"
    )
    assert pipeline.bedrock.invoke_model.call_count == 2


def test_empty_summary_is_retried_then_fails(pipeline):
    pipeline.bedrock.invoke_model.side_effect = [response("{}"), response("{}")]
    with pytest.raises(ValueError, match="oneliner"):
        pipeline.summarise(
            {},
            dict(
                saturation_score=50,
                saturation_label="Mixed",
                difficulty_score=50,
                opportunity_score=50,
            ),
            {},
            {},
        )
    assert pipeline.bedrock.invoke_model.call_count == 2


def test_fallback_discards_guessed_tam(pipeline, monkeypatch):
    monkeypatch.setattr(
        pipeline,
        "call_llm",
        lambda *args, **kwargs: json.dumps(
            dict(competitors=[], market_size_tam_usd=99e9, market_growth_rate_pct=75)
        ),
    )
    result = pipeline._search_fallback_llm({})
    assert result["market_size_tam_usd"] is None
    assert result["market_growth_rate_pct"] is None


def test_dropped_competitors_trigger_retry(pipeline):
    text = json.dumps(
        {
            "competitor_analysis": [],
            "market_gaps": [{"title": "Gap", "description": "Need"}],
            "positioning": "Test",
        }
    )
    pipeline.bedrock.invoke_model.side_effect = [response(text), response(text)]
    with pytest.raises(ValueError, match="competitor_analysis"):
        pipeline.analyse({}, {"competitors": [{"name": "Acme"}]})
    assert pipeline.bedrock.invoke_model.call_count == 2
