from assembly import assemble_v2


def _fixtures():
    parsed = {"industry": "Fitness", "geography": "US", "business_model": "b2c_saas"}
    search_results = {
        "competitors": [{"name": "Future", "url": "https://future.co"}],
        "market_size_tam_usd": 14_800_000_000, "market_growth_rate_pct": 24,
        "user_pain_points": ["too expensive", "no personalization"],
        "market_sources": [{"label": "Grand View Research", "url": "https://gv.com"}],
        "trend_sources": [{"label": "TechCrunch", "url": "https://tc.com"}],
        "pain_sources": [{"label": "Reddit", "url": "https://reddit.com/a"},
                         {"label": "G2", "url": "https://g2.com/b"}],
    }
    analysis = {
        "competitor_analysis": [
            {"name": "Future", "strength": "coaches", "weakness": "pricey",
             "market_position": "leader", "funding_stage": "series_c_plus"}
        ],
    }
    scores = {"saturation_score": 62, "bands": [{"axis": "saturation"}]}
    summary = {
        "oneliner": "x", "recommendation": "r", "trend_signal": "t", "roadmap": [],
        "why_now": "AI got cheap.",
        "entry_cost": [{"label": "Rules & privacy", "value": "careful with health data"}],
        "read": {"synthesis": "s", "recommendation": "rr", "limit": "l"},
        "gaps": [
            {"title": "Adaptive", "description": "d", "underserved": "u",
             "quote_indexes": [0]}
        ],
    }
    return parsed, search_results, analysis, scores, summary


def test_assemble_v2_joins_competitor_urls_and_funding():
    out = assemble_v2(*_fixtures())
    c = out["competitors"][0]
    assert c["url"] == "https://future.co"
    assert c["funding_stage"] == "series_c_plus"


def test_assemble_v2_builds_market_object_with_sources():
    out = assemble_v2(*_fixtures())
    assert out["market"]["tam"].startswith("$")
    assert out["market"]["tier"] == "estimate"
    assert out["market"]["sources"][0]["url"] == "https://gv.com"


def test_assemble_v2_resolves_gap_quotes_by_index():
    out = assemble_v2(*_fixtures())
    q = out["gaps"][0]["quotes"][0]
    assert q["quote"] == "too expensive"
    assert q["source"]["url"] == "https://reddit.com/a"


def test_assemble_v2_keeps_legacy_and_structured_keys():
    out = assemble_v2(*_fixtures())
    assert out["saturation_score"] == 62
    assert out["why_now"]["shift"] == "AI got cheap."
    assert out["entry_cost"][0]["tier"] == "fact"  # regulatory/rules&privacy defaults to fact
    assert out["read"]["limit"] == "l"
    assert out["gaps"][0]["severity"] == "medium"  # defaulted when summary omits it


def test_assemble_v2_merges_analyse_severity_and_tags_by_index():
    parsed, search_results, analysis, scores, summary = _fixtures()
    analysis["market_gaps"] = [{"severity": "high", "tags": ["adaptive", "retention"]}]
    out = assemble_v2(parsed, search_results, analysis, scores, summary)
    assert out["gaps"][0]["severity"] == "high"
    assert out["gaps"][0]["tags"] == ["adaptive", "retention"]


def test_assemble_v2_coerces_string_quote_index():
    parsed, search_results, analysis, scores, summary = _fixtures()
    summary["gaps"][0]["quote_indexes"] = ["0"]  # LLM sometimes returns quoted ints
    out = assemble_v2(parsed, search_results, analysis, scores, summary)
    assert out["gaps"][0]["quotes"][0]["quote"] == "too expensive"
