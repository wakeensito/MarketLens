"""Deterministic scoring — no AWS, no LLM, no I/O. Pure functions only.

Extracted from app.py so it can be unit-tested without importing the Lambda
(which builds boto3 clients at module load). app.py imports back from here.
"""
import math
import logging

logger = logging.getLogger(__name__)


def _clamp(value: float, lo: int = 0, hi: int = 100) -> int:
    return int(min(hi, max(lo, round(value))))


def _safe_number(val, default=None) -> float | None:
    """Coerce a value to float. LLMs often return numbers as strings or with
    formatting like '$14.8B'. This handles those cases gracefully."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        # Strip currency symbols, commas, whitespace
        cleaned = (
            val.strip()
            .replace(",", "")
            .replace("$", "")
            .replace("€", "")
            .replace("£", "")
        )
        if not cleaned:
            return default
        # Handle suffixes: B(illion), M(illion), K(thousand), T(rillion)
        multipliers = {"T": 1e12, "B": 1e9, "M": 1e6, "K": 1e3}
        upper = cleaned.upper()
        for suffix, mult in multipliers.items():
            if upper.endswith(suffix):
                try:
                    return float(upper[:-1]) * mult
                except ValueError:
                    return default
        # Handle percentage signs
        if cleaned.endswith("%"):
            try:
                return float(cleaned[:-1])
            except ValueError:
                return default
        try:
            return float(cleaned)
        except ValueError:
            return default
    return default


def score(parsed: dict, analysis: dict, search_results: dict) -> dict:
    """Compute saturation, difficulty, opportunity scores.

    Uses 1-10 gradient signals from the analyse stage instead of binary booleans.
    This produces a continuous distribution of scores across the 0-100 range.
    """

    competitors = analysis.get("competitor_analysis", [])
    num_direct = len(competitors)
    num_gaps = len(analysis.get("market_gaps", []))

    # Market age: prefer search data, fall back to parse estimate (preserve 0; don't use "or")
    _market_age_search = _safe_number(
        search_results.get("market_age_years"), default=None
    )
    market_age = (
        _market_age_search
        if _market_age_search is not None
        else _safe_number(parsed.get("estimated_market_age_years"), default=5)
    )

    # TAM/growth: prefer search data, fall back to analyse estimates (preserve 0)
    _tam_search = _safe_number(search_results.get("market_size_tam_usd"))
    _tam_analysis = _safe_number(analysis.get("estimated_tam_usd"))
    tam_usd = _tam_search if _tam_search is not None else _tam_analysis

    _growth_search = _safe_number(search_results.get("market_growth_rate_pct"))
    _growth_analysis = _safe_number(analysis.get("estimated_growth_pct"))
    growth_pct = _growth_search if _growth_search is not None else _growth_analysis

    complexity = parsed.get("estimated_complexity", "medium")
    business_model = parsed.get("business_model", "other")
    dominant_segment = analysis.get("dominant_segment", "mixed")
    industry = (parsed.get("industry") or "").lower()

    # 1-10 gradient signals from analyse (with sane defaults)
    funding_maturity = max(
        1, min(10, int(_safe_number(analysis.get("funding_maturity"), default=5)))
    )
    market_consolidation = max(
        1, min(10, int(_safe_number(analysis.get("market_consolidation"), default=5)))
    )
    switching_cost = max(
        1, min(10, int(_safe_number(analysis.get("switching_cost"), default=5)))
    )
    cac_pressure = max(
        1, min(10, int(_safe_number(analysis.get("cac_pressure"), default=5)))
    )
    innovation_velocity = max(
        1, min(10, int(_safe_number(analysis.get("innovation_velocity"), default=5)))
    )

    # Backward compat: if old boolean signals exist, convert them to gradient
    if "has_public_companies" in analysis and "funding_maturity" not in analysis:
        has_public = analysis.get("has_public_companies", False)
        has_series_c = analysis.get("has_series_c_plus", False)
        funding_concentrated = analysis.get("funding_concentration_high", False)
        rising_cac = analysis.get("rising_cac_signals", False)
        funding_maturity = (
            10
            if (has_public and funding_concentrated)
            else 8
            if has_public
            else 6
            if has_series_c
            else 3
        )
        market_consolidation = 8 if funding_concentrated else 4
        cac_pressure = 7 if rising_cac else 3

    # ── Saturation Score (0-100) ──
    # Competitor count: logarithmic scaling (diminishing returns after 8)
    if num_direct > 0:
        # 1→5, 4→14, 8→22, 12→27, 16→30 (log curve, max 30)
        competitor_factor = min(30.0, 5.0 * math.log2(num_direct + 1))
    else:
        competitor_factor = 0.0

    # Funding maturity: 1-10 → 0-20 (linear)
    funding_factor = (funding_maturity - 1) * (20.0 / 9.0)

    # Market consolidation: 1-10 → 0-18 (linear)
    consolidation_factor = (market_consolidation - 1) * (18.0 / 9.0)

    # Market age: continuous 0-12 (1 point per year, cap at 12)
    if market_age is not None and market_age > 0:
        age_factor = min(12.0, market_age * 1.0)
    else:
        age_factor = 4.0

    # CAC pressure: 1-10 → 0-10
    cac_factor = (cac_pressure - 1) * (10.0 / 9.0)

    # Innovation velocity adds to saturation (fast-moving = harder to enter)
    innovation_factor = (innovation_velocity - 1) * (10.0 / 9.0)

    saturation_raw = (
        competitor_factor
        + funding_factor
        + consolidation_factor
        + age_factor
        + cac_factor
        + innovation_factor
    )
    saturation = _clamp(saturation_raw)

    # ── Difficulty Score (0-100) ──
    complexity_map = {"high": 22, "medium": 13, "low": 5}
    technical_score = complexity_map.get(complexity, 13)

    capital_map = {
        "hardware": 22,
        "b2b_saas": 16,
        "marketplace": 18,
        "b2c_saas": 9,
        "ecommerce": 7,
        "service": 4,
        "other": 10,
    }
    capital_score = capital_map.get(business_model, 10)

    segment_map = {
        "enterprise": 18,
        "mid_market": 11,
        "smb": 5,
        "prosumer": 2,
        "consumer": 0,
        "mixed": 7,
    }
    sales_cycle_score = segment_map.get(dominant_segment, 5)

    regulated_industries = {
        "healthcare",
        "fintech",
        "finance",
        "legal",
        "edtech",
        "insurance",
        "banking",
    }
    semi_regulated = {"proptech", "foodtech", "transport", "logistics", "real estate"}
    if any(r in industry for r in regulated_industries):
        regulatory_score = 18
    elif any(r in industry for r in semi_regulated):
        regulatory_score = 9
    else:
        regulatory_score = 0

    # Switching cost contributes to difficulty (high lock-in = hard to steal customers)
    switching_factor = (switching_cost - 1) * (15.0 / 9.0)

    # Funding maturity also makes it harder (well-funded incumbents)
    incumbent_strength = (funding_maturity - 1) * (10.0 / 9.0)

    difficulty = _clamp(
        technical_score
        + capital_score
        + sales_cycle_score
        + regulatory_score
        + switching_factor
        + incumbent_strength
    )

    # ── Opportunity Score (0-100) ──
    # Market size: log scale
    if tam_usd is not None and tam_usd > 0:
        log_tam = math.log10(tam_usd)
        market_size_score = min(25.0, max(0.0, (log_tam - 6.0) * (25.0 / 6.0)))
    else:
        # No TAM data: give a moderate default instead of 0 (absence of data ≠ small market)
        market_size_score = 8.0

    # Growth: continuous
    if growth_pct is not None and growth_pct > 0:
        growth_score = min(
            22.0,
            growth_pct * 0.7 if growth_pct <= 25 else 17.5 + (growth_pct - 25) * 0.15,
        )
    else:
        growth_score = 5.0  # moderate default

    # Gap signals
    weakness_keywords = {
        "expensive",
        "complex",
        "no smb",
        "limited",
        "outdated",
        "slow",
        "poor",
        "lacking",
        "missing",
        "frustrating",
        "clunky",
        "overpriced",
        "rigid",
    }
    weaknesses_text = " ".join((c.get("weakness") or "").lower() for c in competitors)
    pain_points = search_results.get("user_pain_points", [])
    pain_text = " ".join(p.lower() for p in pain_points if isinstance(p, str))
    combined_complaints = weaknesses_text + " " + pain_text
    complaint_matches = sum(1 for kw in weakness_keywords if kw in combined_complaints)
    num_pain_points = len(pain_points)

    gap_signals = num_gaps + num_pain_points + complaint_matches
    gap_score = min(25.0, gap_signals * 3.0)

    # Low consolidation = more room for new entrants (inverse of consolidation)
    fragmentation_bonus = max(0.0, (6 - market_consolidation)) * 2.5  # 0-12.5

    # Low switching cost = easier to win customers
    low_switching_bonus = max(0.0, (6 - switching_cost)) * 2.0  # 0-10

    saturation_penalty = saturation * 0.15
    difficulty_penalty = difficulty * 0.10

    opportunity_raw = (
        market_size_score
        + growth_score
        + gap_score
        + fragmentation_bonus
        + low_switching_bonus
        - saturation_penalty
        - difficulty_penalty
    )
    opportunity = _clamp(opportunity_raw)

    logger.info(
        "Score breakdown",
        extra={
            "num_competitors": num_direct,
            "num_gaps": num_gaps,
            "tam_usd": tam_usd,
            "growth_pct": growth_pct,
            "market_age": market_age,
            "funding_maturity": funding_maturity,
            "market_consolidation": market_consolidation,
            "switching_cost": switching_cost,
            "cac_pressure": cac_pressure,
            "innovation_velocity": innovation_velocity,
            "saturation_raw": round(saturation_raw, 1),
            "saturation": saturation,
            "difficulty": difficulty,
            "opportunity_raw": round(opportunity_raw, 1),
            "opportunity": opportunity,
            "competitor_factor": round(competitor_factor, 1),
            "funding_factor": round(funding_factor, 1),
            "consolidation_factor": round(consolidation_factor, 1),
            "market_size_score": round(market_size_score, 1),
            "growth_score": round(growth_score, 1),
            "gap_score": round(gap_score, 1),
            "fragmentation_bonus": round(fragmentation_bonus, 1),
        },
    )

    # ── Labels ──
    def _band(val, labels):
        if val <= 24:
            return labels[0]
        elif val <= 49:
            return labels[1]
        elif val <= 74:
            return labels[2]
        else:
            return labels[3]

    saturation_label = _band(
        saturation, ["Wide Open", "Some Players", "Competitive", "Saturated"]
    )
    difficulty_label = _band(
        difficulty, ["Easy Entry", "Manageable", "Challenging", "Very Hard"]
    )
    opportunity_label = _band(opportunity, ["Low", "Modest", "Strong", "Excellent"])

    return {
        "saturation_score": saturation,
        "saturation_label": saturation_label,
        "difficulty_score": difficulty,
        "difficulty_label": difficulty_label,
        "opportunity_score": opportunity,
        "opportunity_label": opportunity_label,
        "key_stats": [
            {"label": "Saturation", "value": f"{saturation}/100"},
            {"label": "Difficulty", "value": f"{difficulty}/100"},
            {"label": "Opportunity", "value": f"{opportunity}/100"},
            {"label": "Competitors Found", "value": str(num_direct)},
        ],
    }
