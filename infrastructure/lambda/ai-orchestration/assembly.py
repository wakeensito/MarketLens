"""Pure assembly of the final result_json (v2). No AWS, no LLM, no I/O."""

from scoring import _safe_number

# entry_cost labels that are statements of fact (regulatory regime) vs estimates.
_FACT_LABELS = {"rules & privacy", "regulatory"}


def _fmt_tam(tam_usd) -> str:
    n = _safe_number(tam_usd)
    if not n or n <= 0:
        return "Unknown"
    if n >= 1e9:
        return f"${n / 1e9:.1f}B"
    if n >= 1e6:
        return f"${n / 1e6:.0f}M"
    return f"${n:,.0f}"


def _fmt_growth(pct) -> str:
    n = _safe_number(pct)
    return f"growing {n:.0f}% a year" if n and n > 0 else ""


def _join_competitors(analysis: dict, search_results: dict) -> list[dict]:
    """Attach the real URL (from search) to each analysed competitor by name."""
    url_by_name = {
        (c.get("name") or "").strip().lower(): c.get("url", "")
        for c in search_results.get("competitors", [])
    }
    out = []
    for c in analysis.get("competitor_analysis", []):
        name = (c.get("name") or "").strip()
        merged = dict(c)
        merged["url"] = url_by_name.get(name.lower(), "")
        merged.setdefault("funding_stage", c.get("funding_stage", "unknown"))
        out.append(merged)
    return out


def _resolve_gap_quotes(
    summary_gaps: list,
    pain: list,
    pain_sources: list,
    analysis_gaps: list | None = None,
) -> list:
    """Map each gap's quote_indexes to {quote, source} using real search data,
    and merge severity/tags from the analyse stage by positional index.

    CAVEAT: pain (user_pain_points, LLM-extracted) and pain_sources (raw Brave
    pain results) are NOT guaranteed index-aligned, so the attached source is
    best-effort — a real URL from the pain-point search, not provably the exact
    origin of this specific quote. Likewise analyse gaps and summarise gaps are
    aligned positionally (both ordered as analyse emitted them); acceptable for v2."""
    fallback_src = (
        pain_sources[0] if pain_sources else {"label": "User review", "url": ""}
    )
    out = []
    for i, g in enumerate(summary_gaps):
        quotes = []
        for idx in g.get("quote_indexes", []) or []:
            if isinstance(idx, str) and idx.strip().isdigit():
                idx = int(idx)
            if isinstance(idx, int) and 0 <= idx < len(pain):
                src = pain_sources[idx] if idx < len(pain_sources) else fallback_src
                quotes.append({"quote": str(pain[idx]), "source": src})
        merged = {k: v for k, v in g.items() if k != "quote_indexes"}
        merged["quotes"] = quotes
        analysis_gap = (
            analysis_gaps[i] if analysis_gaps and i < len(analysis_gaps) else {}
        )
        merged.setdefault("severity", analysis_gap.get("severity", "medium"))
        merged.setdefault("tags", analysis_gap.get("tags", []))
        merged.setdefault("underserved", "")
        out.append(merged)
    return out


def _entry_cost_with_tiers(entry_cost: list) -> list:
    out = []
    for f in entry_cost or []:
        tier = (
            "fact"
            if (f.get("label", "").strip().lower() in _FACT_LABELS)
            else "estimate"
        )
        out.append(
            {
                "label": f.get("label", ""),
                "value": f.get("value", ""),
                "tier": tier,
                "sources": f.get("sources", []),
            }
        )
    return out


def assemble_v2(
    parsed: dict, search_results: dict, analysis: dict, scores: dict, summary: dict
) -> dict:
    pain = search_results.get("user_pain_points", [])
    pain_sources = search_results.get("pain_sources", [])

    market = {
        "tam": _fmt_tam(search_results.get("market_size_tam_usd")),
        "growth": _fmt_growth(search_results.get("market_growth_rate_pct")),
        "note": "",
        "tier": "estimate",
        "sources": search_results.get("market_sources", []),
    }
    why_now = {
        "shift": summary.get("why_now", ""),
        "tier": "estimate",
        "sources": search_results.get("trend_sources", []),
    }
    read = summary.get("read") or {"synthesis": "", "recommendation": "", "limit": ""}

    result = {
        "vertical": parsed.get("industry", ""),
        "geography": parsed.get("geography", ""),
        "business_model": parsed.get("business_model", ""),
        **scores,  # bands + legacy score keys
        **summary,  # oneliner, trend_signal, recommendation, roadmap (+ raw why_now/gaps/entry_cost/read, overridden below)
        "competitors": _join_competitors(analysis, search_results),
        "gaps": _resolve_gap_quotes(
            summary.get("gaps", []), pain, pain_sources, analysis.get("market_gaps", [])
        ),
        "market_size": _fmt_tam(
            search_results.get("market_size_tam_usd")
        ),  # legacy string key
        "market": market,
        "why_now": why_now,
        "entry_cost": _entry_cost_with_tiers(summary.get("entry_cost", [])),
        "read": read,
    }
    return result
