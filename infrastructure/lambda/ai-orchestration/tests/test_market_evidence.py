import pytest
from market_evidence import grounded_market
from scoring import score
from tests.test_scoring import _fixture


def fixture():
    quote = "The US fitness market was USD 14.8 billion in 2025, growing 24%."
    source = dict(
        title="Fitness market",
        description=quote,
        url="https://research.example/fitness",
    )
    result = dict(
        market_size_tam_usd=14_800_000_000,
        market_growth_rate_pct=24,
        market_evidence=dict(
            url=source["url"], quote=quote, scope="US fitness market", year="2025"
        ),
    )
    return result, [source]


def test_exact_market_evidence_retains_amount_and_scope():
    result, sources = fixture()
    out = grounded_market(result, sources)
    assert out["market_size_tam_usd"] == 14_800_000_000
    assert out["market_growth_rate_pct"] == 24
    assert "US fitness market (2025)" in out["market_note"]
    assert out["market_sources"][0]["url"] == sources[0]["url"]


@pytest.mark.parametrize(
    "fault",
    [
        "no_sources",
        "no_evidence",
        "fake_url",
        "fake_quote",
        "wrong_amount",
        "no_year",
        "no_scope",
    ],
)
def test_unsupported_market_figures_are_unknown(fault):
    result, sources = fixture()
    if fault == "no_sources":
        sources = []
    elif fault == "no_evidence":
        result.pop("market_evidence")
    elif fault == "wrong_amount":
        result["market_size_tam_usd"] = 99_000_000_000
    else:
        key = {
            "fake_url": "url",
            "fake_quote": "quote",
            "no_year": "year",
            "no_scope": "scope",
        }[fault]
        result["market_evidence"][key] = ""
    out = grounded_market(result, sources)
    assert out["market_size_tam_usd"] is None
    assert out["market_growth_rate_pct"] is None
    assert out["market_sources"] == []


def test_growth_cannot_be_guessed_even_with_sourced_tam():
    result, sources = fixture()
    result["market_growth_rate_pct"] = 75
    assert grounded_market(result, sources)["market_growth_rate_pct"] is None


def test_scoring_ignores_analysis_guesses_when_research_is_missing():
    parsed, analysis, search = _fixture()
    search["market_size_tam_usd"] = None
    search["market_growth_rate_pct"] = None
    baseline = score(parsed, analysis, search)
    analysis["estimated_tam_usd"] = 1e15
    analysis["estimated_growth_pct"] = 200
    assert score(parsed, analysis, search) == baseline
