"""Keep market figures only when an exact search excerpt supports them."""

import math
import re
from scoring import _safe_number, _top_sources

_MONEY = re.compile(
    r"(?:US\$|USD\s*|\$)\s*([\d,]+(?:\.\d+)?)\s*(trillion|billion|million|thousand|[TBMK]\b)?",
    re.I,
)
_SCALE = {"t": 1e12, "b": 1e9, "m": 1e6, "k": 1e3}


def grounded_market(result: dict, snippets: list[dict]) -> dict:
    out: dict = {
        "market_size_tam_usd": None,
        "market_growth_rate_pct": None,
        "market_sources": [],
        "market_note": "No market-size figure could be verified from the search results.",
    }
    evidence = result.get("market_evidence")
    if not isinstance(evidence, dict):
        return out
    source = next((s for s in snippets if s.get("url") == evidence.get("url")), None)
    quote = evidence.get("quote")
    if source is None or not isinstance(quote, str) or not quote.strip():
        return out
    text = f"{source.get('title', '')}: {source.get('description', '')}"
    if quote not in text:
        return out
    # Require the model to identify the scope and year, and display both.
    scope, year = evidence.get("scope"), str(evidence.get("year", ""))
    if (
        not isinstance(scope, str)
        or not scope.strip()
        or not re.fullmatch(r"20\d{2}", year)
        or year not in quote
    ):
        return out
    tam = _safe_number(result.get("market_size_tam_usd"))
    if tam is None or not math.isfinite(tam) or tam <= 0:
        return out
    for amount, unit in _MONEY.findall(quote):
        scale = {"trillion": 1e12, "billion": 1e9, "million": 1e6, "thousand": 1e3}.get(
            unit.lower(), _SCALE.get(unit.lower(), 1)
        )
        if math.isclose(float(amount.replace(",", "")) * scale, tam, rel_tol=1e-6):
            out.update(
                market_size_tam_usd=tam,
                market_sources=_top_sources([source], n=1),
                market_note=f"{scope.strip()} ({year}). Source excerpt: {quote}",
            )
            break
    # Growth is retained only when its percentage appears in the same excerpt.
    growth = _safe_number(result.get("market_growth_rate_pct"))
    if out["market_sources"] and growth is not None and math.isfinite(growth):
        if any(
            math.isclose(float(n), growth)
            for n in re.findall(r"(-?\d+(?:\.\d+)?)\s*%", quote)
        ):
            out["market_growth_rate_pct"] = growth
    return out
