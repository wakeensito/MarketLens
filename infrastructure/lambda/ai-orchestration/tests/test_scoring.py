from scoring import score, _safe_number, _clamp


def _fixture():
    parsed = {
        "industry": "fitness", "business_model": "b2c_saas",
        "estimated_complexity": "medium", "estimated_market_age_years": 6,
    }
    analysis = {
        "competitor_analysis": [{"name": f"C{i}"} for i in range(4)],
        "market_gaps": [{"title": "g1"}, {"title": "g2"}, {"title": "g3"}],
        "dominant_segment": "consumer",
        "funding_maturity": 7, "market_consolidation": 6, "switching_cost": 3,
        "cac_pressure": 6, "innovation_velocity": 7,
        "estimated_tam_usd": 14_800_000_000, "estimated_growth_pct": 24,
    }
    search_results = {
        "market_size_tam_usd": 14_800_000_000, "market_growth_rate_pct": 24,
        "market_age_years": 6, "user_pain_points": ["too expensive", "clunky"],
    }
    return parsed, analysis, search_results


def test_clamp_bounds():
    assert _clamp(150) == 100
    assert _clamp(-5) == 0
    assert _clamp(42.6) == 43


def test_safe_number_suffixes():
    assert _safe_number("$14.8B") == 14_800_000_000.0
    assert _safe_number("24%") == 24.0
    assert _safe_number(None, default=5) == 5


def test_score_shape_and_ranges():
    scores = score(*_fixture())
    for key in ("saturation_score", "difficulty_score", "opportunity_score"):
        assert 0 <= scores[key] <= 100
    assert scores["saturation_label"]
    assert isinstance(scores["key_stats"], list)


def test_bands_present_and_shaped():
    scores = score(*_fixture())
    bands = scores["bands"]
    assert [b["axis"] for b in bands] == ["saturation", "difficulty", "opportunity"]
    for b in bands:
        assert b["label"]
        assert b["receipt"]
        assert b["tone"] in ("good", "mixed", "bad")
        assert 0 <= b["score"] <= 100


def test_band_tone_opportunity_inverted():
    # opportunity: high score = good; saturation: high score = bad
    _, analysis, search = _fixture()
    parsed = {"industry": "fitness", "business_model": "b2c_saas",
              "estimated_complexity": "low", "estimated_market_age_years": 1}
    scores = score(parsed, analysis, search)
    sat = next(b for b in scores["bands"] if b["axis"] == "saturation")
    opp = next(b for b in scores["bands"] if b["axis"] == "opportunity")
    if sat["score"] <= 40:
        assert sat["tone"] == "good"
    if opp["score"] > 65:
        assert opp["tone"] == "good"
