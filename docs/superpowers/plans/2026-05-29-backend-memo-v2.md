# Backend result_json v2 (Market Memo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI-orchestration Lambda emit a `result_json` that carries the Market Memo's defensible layer — score *bands*, real *citations*, quality-weighted *gaps*, *why-now*, and *cost-to-enter* — so the frontend memo can render receipts instead of a hollow report.

**Architecture:** Changes are **purely additive** — every existing `result_json` key stays, so the current `ReportView`/`adapter.ts` keep working until Plan B swaps in `MarketMemo`. The deterministic scoring logic is extracted into a new pure `scoring.py` (no AWS imports) so it can be unit-tested; `score()` gains a `bands` list. `search()` retains the source URLs it currently discards. `analyse()` adds per-gap `severity`/`tags`. `summarise()` writes the plain-language `read`/`why_now`/`entry_cost` and maps quotes to gaps **by index** (so URLs are resolved from real search data in `assemble()`, never fabricated by the LLM). `assemble()` joins it all into the v2 shape.

**Tech Stack:** Python 3.12, AWS Lambda durable functions, Bedrock (Nova Micro / DeepSeek / Nova 2 Lite), Brave Search API, pytest (new, dev-only).

**The v2 additive keys** (`assemble()` output gains these; all legacy keys remain):

```jsonc
{
  "bands": [ {"axis":"saturation","label":"Competitive","receipt":"...","score":62,"tone":"mixed"}, ... ],
  "market": {"tam":"$14.8B","growth":"+24%/yr","note":"...","tier":"estimate","sources":[{"label":"Grand View","url":"https://..."}]},
  "why_now": {"shift":"...","tier":"estimate","sources":[{"label":"TechCrunch","url":"https://..."}]},
  "entry_cost": [ {"label":"Rules & privacy","value":"...","tier":"fact","sources":[]}, ... ],
  "read": {"synthesis":"...","recommendation":"...","limit":"..."},
  // competitors[] each gain: "funding_stage", "url"
  // gaps[] each gain: "severity", "underserved", "opportunity_score", "tags":[], "quotes":[{"quote":"...","source":{"label":"r/fitness","url":"https://..."}}]
}
```

This matches `frontend/src/types.ts` `MarketMemo` (snake_case here, camelCase there — Plan B's adapter bridges).

---

## Environment setup (one-time, before Task 0)

All backend commands run from `infrastructure/lambda/ai-orchestration/`.

```bash
cd infrastructure/lambda/ai-orchestration
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`pytest` is added in Task 0. The durable-function and boto3 imports in `app.py` require AWS env/clients at import time, so **all unit tests target `scoring.py` and a new `assembly.py` — pure modules with no `app.py` import.**

---

### Task 0: Test harness + extract pure scoring into `scoring.py`

Behavior-preserving refactor. Move the pure deterministic helpers out of `app.py` (which can't be imported without AWS) into a pure module, and lock current behavior with a characterization test.

**Files:**
- Create: `infrastructure/lambda/ai-orchestration/requirements-dev.txt`
- Create: `infrastructure/lambda/ai-orchestration/scoring.py`
- Create: `infrastructure/lambda/ai-orchestration/tests/__init__.py`
- Create: `infrastructure/lambda/ai-orchestration/tests/test_scoring.py`
- Modify: `infrastructure/lambda/ai-orchestration/app.py` (remove moved funcs, add import)

- [ ] **Step 1: Add dev requirements**

Create `requirements-dev.txt`:

```text
pytest==8.3.4
```

Install: `pip install -r requirements-dev.txt`

- [ ] **Step 2: Create `scoring.py` by moving the pure functions verbatim**

Cut these from `app.py` **verbatim** and paste into a new `scoring.py`, adding `import math` at the top of `scoring.py` (the `import math` currently inside `score()` at app.py:1155 can stay where it is or move to the module top — move it to scoring.py module top and delete the in-function one):

- `_clamp` (app.py:1027-1028)
- `_safe_number` (app.py:1043-1080)
- `score` (app.py:1083-1372) — including the local `def _band` and `import math` inside it

`scoring.py` starts:

```python
"""Deterministic scoring — no AWS, no LLM, no I/O. Pure functions only.

Extracted from app.py so it can be unit-tested without importing the Lambda
(which builds boto3 clients at module load). app.py imports back from here.
"""
import math

# <-- paste _clamp, _safe_number, score (with its inner _band) here verbatim -->
```

Leave `_floats_to_decimal` (app.py:1031-1040) in `app.py` — it is used by the DynamoDB write path and is not pure-scoring.

- [ ] **Step 3: Wire the import in `app.py`**

At the top of `app.py`, in the import block, add:

```python
from scoring import _clamp, _safe_number, score
```

Delete the now-moved `_clamp`, `_safe_number`, and `score` definitions from `app.py`. Verify no other code in `app.py` defines them.

- [ ] **Step 4: Write the characterization test**

Create `tests/__init__.py` (empty). Create `tests/test_scoring.py`:

```python
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
```

- [ ] **Step 5: Run tests — verify they pass (behavior preserved)**

Run: `python -m pytest tests/test_scoring.py -v`
Expected: 3 passed.

- [ ] **Step 6: Verify the Lambda still builds**

Run: `cd ../../.. && sam build AiOrchestrationFunction 2>&1 | tail -5` (or `sam build` if the function logical id differs — check `template.yaml`).
Expected: `Build Succeeded`.

- [ ] **Step 7: Commit**

```bash
git add infrastructure/lambda/ai-orchestration/scoring.py infrastructure/lambda/ai-orchestration/tests/ infrastructure/lambda/ai-orchestration/requirements-dev.txt infrastructure/lambda/ai-orchestration/app.py
git commit -m "refactor: extract pure scoring into scoring.py + pytest harness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1: Emit score `bands` (label + tone + grounded receipt)

Bands are deterministic and live in `score()` (it has every factor in scope). Tone uses the existing color thresholds; the receipt is a factual one-clause string built from the real scoring inputs (defensible — no LLM prose).

**Files:**
- Modify: `infrastructure/lambda/ai-orchestration/scoring.py`
- Modify: `infrastructure/lambda/ai-orchestration/tests/test_scoring.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_scoring.py`:

```python
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_scoring.py::test_bands_present_and_shaped -v`
Expected: FAIL with `KeyError: 'bands'`.

- [ ] **Step 3: Implement band assembly in `scoring.py`**

In `scoring.py`, add these module-level helpers above `score`:

```python
def _tone(score_val: int, *, higher_is_good: bool) -> str:
    """good/mixed/bad. For saturation & difficulty higher is bad;
    for opportunity higher is good."""
    if higher_is_good:
        if score_val > 65:
            return "good"
        if score_val > 40:
            return "mixed"
        return "bad"
    # higher is bad (saturation, difficulty)
    if score_val <= 40:
        return "good"
    if score_val <= 65:
        return "mixed"
    return "bad"


def _saturation_receipt(num_direct: int, funding_maturity: int) -> str:
    if funding_maturity >= 8:
        funding = "with well-funded incumbents"
    elif funding_maturity >= 5:
        funding = "across a mix of funding stages"
    else:
        funding = "mostly early-stage"
    n = "No direct" if num_direct == 0 else f"{num_direct}+"
    return f"{n} competitors found, {funding}."


def _difficulty_receipt(regulatory_score: int, capital_score: int,
                        complexity: str) -> str:
    drivers = []
    if regulatory_score >= 18:
        drivers.append("a regulated industry")
    elif regulatory_score >= 9:
        drivers.append("some regulation")
    if capital_score >= 16:
        drivers.append("high capital needs")
    if complexity == "high":
        drivers.append("real technical complexity")
    if not drivers:
        return "Few hard barriers to entry."
    return "Entry is shaped by " + ", ".join(drivers) + "."


def _opportunity_receipt(tam_usd, growth_pct, num_gaps: int) -> str:
    parts = []
    if tam_usd and tam_usd > 0:
        if tam_usd >= 1e9:
            parts.append(f"a ${tam_usd / 1e9:.1f}B market")
        else:
            parts.append(f"a ${tam_usd / 1e6:.0f}M market")
    if growth_pct and growth_pct > 0:
        parts.append(f"growing {growth_pct:.0f}% a year")
    if num_gaps:
        parts.append(f"{num_gaps} clear gap{'s' if num_gaps != 1 else ''}")
    return (", ".join(parts).capitalize() + ".") if parts else "Moderate room to enter."
```

Then, **just before the `return {` at the end of `score()`** (currently app.py:1359, now in `scoring.py`), build the bands using the locals already in scope (`num_direct`, `funding_maturity`, `regulatory_score`, `capital_score`, `complexity`, `tam_usd`, `growth_pct`, `num_gaps`, `saturation`, `difficulty`, `opportunity`, and the `*_label` vars):

```python
    bands = [
        {"axis": "saturation", "label": saturation_label,
         "receipt": _saturation_receipt(num_direct, funding_maturity),
         "score": saturation, "tone": _tone(saturation, higher_is_good=False)},
        {"axis": "difficulty", "label": difficulty_label,
         "receipt": _difficulty_receipt(regulatory_score, capital_score, complexity),
         "score": difficulty, "tone": _tone(difficulty, higher_is_good=False)},
        {"axis": "opportunity", "label": opportunity_label,
         "receipt": _opportunity_receipt(tam_usd, growth_pct, num_gaps),
         "score": opportunity, "tone": _tone(opportunity, higher_is_good=True)},
    ]
```

Add `"bands": bands,` as the first key in the returned dict.

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_scoring.py -v`
Expected: all passed (5+).

- [ ] **Step 5: Commit**

```bash
git add infrastructure/lambda/ai-orchestration/scoring.py infrastructure/lambda/ai-orchestration/tests/test_scoring.py
git commit -m "feat: score() emits bands (label + tone + grounded receipt)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Retain source URLs in `search()`

Today `search()` strips URLs off the market-size / trend results and returns pain points as bare strings. Keep them: add a `_top_sources` helper and surface `market_sources`, `trend_sources`, and a `pain_points` list that carries each quote's URL.

**Files:**
- Modify: `infrastructure/lambda/ai-orchestration/app.py` (`search()` ~658-868)
- Create: `infrastructure/lambda/ai-orchestration/tests/test_search_sources.py`
- Test target: a new pure helper `_top_sources` placed in `scoring.py` (pure, importable)

- [ ] **Step 1: Write the failing test**

Create `tests/test_search_sources.py`:

```python
from scoring import _top_sources


def test_top_sources_labels_by_domain_and_dedupes():
    results = [
        {"title": "Fitness Market Size 2025 - Grand View Research",
         "url": "https://www.grandviewresearch.com/report", "description": ""},
        {"title": "Statista fitness", "url": "https://www.statista.com/x", "description": ""},
        {"title": "dupe", "url": "https://www.grandviewresearch.com/report", "description": ""},
    ]
    out = _top_sources(results, n=2)
    assert out == [
        {"label": "Grand View Research", "url": "https://www.grandviewresearch.com/report"},
        {"label": "Statista", "url": "https://www.statista.com/x"},
    ]


def test_top_sources_empty():
    assert _top_sources([], n=2) == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_search_sources.py -v`
Expected: FAIL with `ImportError: cannot import name '_top_sources'`.

- [ ] **Step 3: Implement `_top_sources` in `scoring.py`**

```python
# Maps known research/source domains to clean display labels.
_SOURCE_LABELS = {
    "grandviewresearch.com": "Grand View Research",
    "statista.com": "Statista",
    "mordorintelligence.com": "Mordor Intelligence",
    "fortunebusinessinsights.com": "Fortune Business Insights",
    "techcrunch.com": "TechCrunch",
    "crunchbase.com": "Crunchbase",
    "reddit.com": "Reddit",
    "g2.com": "G2",
    "trustpilot.com": "Trustpilot",
}


def _source_label(url: str) -> str:
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or "").lower().lstrip("www.")
    for domain, label in _SOURCE_LABELS.items():
        if host.endswith(domain):
            return label
    # fall back to the registrable-ish domain, title-cased
    return host.split(".")[0].title() if host else "Source"


def _top_sources(results: list[dict], n: int = 2) -> list[dict]:
    """Pick up to n unique {label, url} citations from Brave web results."""
    seen: set[str] = set()
    out: list[dict] = []
    for r in results:
        url = (r or {}).get("url", "")
        if not url or url in seen:
            continue
        seen.add(url)
        out.append({"label": _source_label(url), "url": url})
        if len(out) >= n:
            break
    return out
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_search_sources.py -v`
Expected: 2 passed.

- [ ] **Step 5: Surface sources in `search()`**

In `app.py`, add `from scoring import _top_sources` to the existing `from scoring import ...` line. Then in `search()`:

(a) After the `pain_points = _brave_search(...)` call (~app.py:696) the variable `pain_points` holds raw results with urls. Keep them. The structuring LLM currently turns pain points into bare strings; instead, attach urls in the **return**.

(b) Change the final return dict of `search()` (app.py:853-863) to add three keys (leave all existing keys untouched):

```python
        return {
            "competitors": competitors,
            "market_size_tam_usd": _safe_number(result.get("market_size_tam_usd")),
            "market_growth_rate_pct": _safe_number(result.get("market_growth_rate_pct")),
            "market_age_years": _safe_number(result.get("market_age_years"), default=5),
            "trends": result.get("trends", []),
            "user_pain_points": result.get("user_pain_points", []),
            "wiki_enrichment": wiki_enrichment,
            # --- v2 additive: real citations (the receipts) ---
            "market_sources": _top_sources(market_size, n=2),
            "trend_sources": _top_sources(trend_results, n=1),
            "pain_sources": _top_sources(pain_points, n=4),
        }
```

(Note: `market_size`, `trend_results`, `pain_points` are the raw Brave result lists already in scope at app.py:684-704.)

(c) In `_search_fallback_llm` (app.py:871+), add the same three keys with empty lists so the shape is consistent:

```python
        "market_sources": [],
        "trend_sources": [],
        "pain_sources": [],
```

(Add them to that function's return dict.)

- [ ] **Step 6: Verify build**

Run: `cd ../../.. && sam build 2>&1 | tail -3 && cd infrastructure/lambda/ai-orchestration`
Expected: `Build Succeeded`.

- [ ] **Step 7: Commit**

```bash
git add infrastructure/lambda/ai-orchestration/scoring.py infrastructure/lambda/ai-orchestration/app.py infrastructure/lambda/ai-orchestration/tests/test_search_sources.py
git commit -m "feat: search() retains market/trend/pain source URLs (citations)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `analyse()` adds per-gap severity + tags, per-competitor funding

The analyse LLM already returns `funding_stage` per competitor and `market_gaps`. Add `severity` and `tags` to each gap, and ensure `funding_stage` is on `competitor_analysis` items.

**Files:**
- Modify: `infrastructure/lambda/ai-orchestration/app.py` (analyse prompt ~962-997 and fallback ~1009-1021)

- [ ] **Step 1: Update the `market_gaps` schema in the analyse prompt**

In `app.py`, in the analyse prompt JSON (app.py:974-979), replace the `market_gaps` block with:

```text
  "market_gaps": [
    {
      "title": "Gap title",
      "description": "Why this gap exists and who it affects",
      "severity": "high | medium | low (how big the opening is)",
      "tags": ["2-3 short lowercase descriptors"]
    }
  ],
```

- [ ] **Step 2: Ensure competitor funding_stage is requested**

Confirm the `competitor_analysis` block (app.py:964-973) includes `"funding_stage"` (it does, at app.py:971). No change needed. Add to the RULES list (app.py:991-997):

```text
- For each gap: severity reflects how underserved the need is and how clearly incumbents miss it. Use all three levels across the gaps; don't mark everything "high".
```

- [ ] **Step 3: Update the analyse fallback**

In the `except json.JSONDecodeError` fallback (app.py:1009-1021), the `"market_gaps": []` line needs no change (empty list is shape-safe). Leave as is.

- [ ] **Step 4: Verify build**

Run: `cd ../../.. && sam build 2>&1 | tail -3 && cd infrastructure/lambda/ai-orchestration`
Expected: `Build Succeeded`.

- [ ] **Step 5: Commit**

```bash
git add infrastructure/lambda/ai-orchestration/app.py
git commit -m "feat: analyse() asks for per-gap severity + tags

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `summarise()` writes read / why_now / entry_cost / gap underserved + quotes

Expand the summarise LLM to produce the memo's narrative layer in plain language. Quotes reference pain points **by index** so `assemble()` resolves real URLs (the LLM never emits a URL).

**Files:**
- Modify: `infrastructure/lambda/ai-orchestration/app.py` (`summarise()` 1378-1433)

- [ ] **Step 1: Pass indexed pain points into the prompt**

Replace the `summarise()` prompt construction. The new prompt (keep the existing VOICE GUIDELINES block, extend INPUT and the return schema):

```python
    pain = search_results.get("user_pain_points", [])
    pain_indexed = "\n".join(f"[{i}] {p}" for i, p in enumerate(pain)) or "(none)"
    prompt = f"""You are an experienced startup advisor talking to a first-time founder.
Your job is to explain a market in plain language — like a friend who knows the industry well.

VOICE GUIDELINES:
- Use second person ("you", "your idea").
- Extremely plain language. Assume a complete beginner. If you must use a term (TAM, CAC), explain it in plain words.
- Be honest. If the market is brutal, say so. If it's promising, say so.
- Short sentences. Specific numbers when available. No hedging filler.
- Do NOT inflate numbers or make up data. Do NOT invent sources or URLs.

INPUT:
Industry: {parsed.get("industry", "")} / {parsed.get("sub_industry", "")}
Business model: {parsed.get("business_model", "")}
Target customer: {parsed.get("target_customer", "")}
Saturation: {scores["saturation_score"]}/100 ({scores["saturation_label"]})
Difficulty: {scores["difficulty_score"]}/100 ({scores.get("difficulty_label", "")})
Opportunity: {scores["opportunity_score"]}/100 ({scores.get("opportunity_label", "")})
Market gaps: {json.dumps(analysis.get("market_gaps", []), indent=2)}
Numbered user complaints (cite by index):
{pain_indexed}
Competitor count: {len(analysis.get("competitor_analysis", []))}
Positioning advice: {analysis.get("positioning", "")}

Return ONLY valid JSON with:
{{
  "oneliner": "One plain sentence: the opportunity in a nutshell",
  "trend_signal": "One sentence on where this market is heading",
  "recommendation": "2-3 sentence actionable recommendation",
  "roadmap": [
    {{"phase": "Phase 1 (0-3 months)", "title": "Step", "description": "What to do"}}
  ],
  "why_now": "One or two sentences: what changed recently that makes this a good time",
  "gaps": [
    {{
      "title": "Gap title (plain)",
      "description": "What the big players miss, in plain words",
      "underserved": "Who is left out by this gap",
      "quote_indexes": [list of integers from the numbered complaints above that back this gap, or []]
    }}
  ],
  "entry_cost": [
    {{"label": "Rules & privacy", "value": "plain explanation"}},
    {{"label": "Getting customers", "value": "plain explanation"}},
    {{"label": "Money to start", "value": "plain explanation"}},
    {{"label": "Keeping people", "value": "plain explanation"}}
  ],
  "read": {{
    "synthesis": "3-4 plain sentences: the honest bottom line",
    "recommendation": "What you'd do, in plain words",
    "limit": "One sentence reminder that this is an AI read of public info, not advice, and figures are estimates"
  }}
}}

Include 2-4 gaps and 3-4 roadmap phases. quote_indexes must only use indexes shown above."""
```

- [ ] **Step 2: Update the fallback return**

Replace the `except json.JSONDecodeError` fallback dict (app.py:1427-1432) with one that has the new shape (shape-safe defaults):

```python
        return {
            "oneliner": "Analysis complete. Review the scores above for market positioning.",
            "trend_signal": "Market data analyzed.",
            "recommendation": "Review the competitor analysis for entry opportunities.",
            "roadmap": [],
            "why_now": "",
            "gaps": [],
            "entry_cost": [],
            "read": {"synthesis": "", "recommendation": "", "limit":
                     "This is an AI-generated read of public information, not advice. Figures are estimates."},
        }
```

- [ ] **Step 3: Verify build**

Run: `cd ../../.. && sam build 2>&1 | tail -3 && cd infrastructure/lambda/ai-orchestration`
Expected: `Build Succeeded`.

- [ ] **Step 4: Commit**

```bash
git add infrastructure/lambda/ai-orchestration/app.py
git commit -m "feat: summarise() writes read/why_now/entry_cost + indexed gap quotes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `assemble()` v2 — join sources, competitors, gaps into the memo shape

Pure join logic. Extract into a new pure `assembly.py` so it is unit-testable (the current `assemble()` is trivial and pure already). `app.py` imports it.

**Files:**
- Create: `infrastructure/lambda/ai-orchestration/assembly.py`
- Create: `infrastructure/lambda/ai-orchestration/tests/test_assembly.py`
- Modify: `infrastructure/lambda/ai-orchestration/app.py` (replace `assemble()` body with a call)

- [ ] **Step 1: Write the failing test**

Create `tests/test_assembly.py`:

```python
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


def test_assemble_v2_keeps_legacy_keys():
    out = assemble_v2(*_fixtures())
    assert out["saturation_score"] == 62
    assert out["why_now"]["shift"] == "AI got cheap."
    assert out["entry_cost"][0]["tier"] == "fact"  # regulatory defaults to fact
    assert out["read"]["limit"] == "l"
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_assembly.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'assembly'`.

- [ ] **Step 3: Implement `assembly.py`**

```python
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


def _resolve_gap_quotes(summary_gaps: list[dict], pain: list, pain_sources: list[dict]) -> list[dict]:
    """Map each gap's quote_indexes to real {quote, source} from search data."""
    out = []
    for g in summary_gaps:
        quotes = []
        for idx in g.get("quote_indexes", []) or []:
            if isinstance(idx, int) and 0 <= idx < len(pain):
                src = pain_sources[idx] if idx < len(pain_sources) else (
                    pain_sources[0] if pain_sources else {"label": "User review", "url": ""})
                quotes.append({"quote": str(pain[idx]), "source": src})
        merged = {k: v for k, v in g.items() if k != "quote_indexes"}
        merged["quotes"] = quotes
        merged.setdefault("severity", "medium")
        merged.setdefault("tags", [])
        merged.setdefault("underserved", "")
        out.append(merged)
    return out


def _entry_cost_with_tiers(entry_cost: list[dict]) -> list[dict]:
    out = []
    for f in entry_cost or []:
        tier = "fact" if (f.get("label", "").strip().lower() in _FACT_LABELS) else "estimate"
        out.append({"label": f.get("label", ""), "value": f.get("value", ""),
                    "tier": tier, "sources": f.get("sources", [])})
    return out


def assemble_v2(parsed: dict, search_results: dict, analysis: dict,
                scores: dict, summary: dict) -> dict:
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

    # Legacy summary keys (oneliner, trend_signal, recommendation, roadmap) flow via **summary;
    # we override the structured ones we own here.
    result = {
        "vertical": parsed.get("industry", ""),
        "geography": parsed.get("geography", ""),
        "business_model": parsed.get("business_model", ""),
        **scores,                       # includes bands + legacy score keys
        **summary,                      # includes oneliner, trend_signal, recommendation, roadmap
        "competitors": _join_competitors(analysis, search_results),
        "gaps": _resolve_gap_quotes(summary.get("gaps", []), pain, pain_sources),
        "market_size": _fmt_tam(search_results.get("market_size_tam_usd")),  # legacy string
        # --- v2 structured additive keys ---
        "market": market,
        "why_now": why_now,
        "entry_cost": _entry_cost_with_tiers(summary.get("entry_cost", [])),
        "read": read,
    }
    return result
```

- [ ] **Step 4: Run to verify pass**

Run: `python -m pytest tests/test_assembly.py -v`
Expected: 4 passed.

- [ ] **Step 5: Wire `assemble()` in `app.py` to call it**

Add `from assembly import assemble_v2` to the imports. Replace the body of `assemble()` (app.py:1442-1451) with:

```python
def assemble(parsed, search_results, analysis, scores, summary) -> dict:
    """Combine all results into the final report JSON (v2, additive)."""
    return assemble_v2(parsed, search_results, analysis, scores, summary)
```

- [ ] **Step 6: Run the full suite + build**

Run: `python -m pytest tests/ -v && cd ../../.. && sam build 2>&1 | tail -3 && cd infrastructure/lambda/ai-orchestration`
Expected: all tests pass, `Build Succeeded`.

- [ ] **Step 7: Commit**

```bash
git add infrastructure/lambda/ai-orchestration/assembly.py infrastructure/lambda/ai-orchestration/tests/test_assembly.py infrastructure/lambda/ai-orchestration/app.py
git commit -m "feat: assemble v2 result_json — join citations, competitors, gaps into memo shape

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end shape contract test

One test that asserts the assembled v2 output carries every key the frontend `MarketMemo` contract needs, so Plan B's adapter has a guaranteed surface.

**Files:**
- Create: `infrastructure/lambda/ai-orchestration/tests/test_contract.py`

- [ ] **Step 1: Write the contract test**

```python
from assembly import assemble_v2
from tests.test_assembly import _fixtures


def test_v2_contract_surface():
    out = assemble_v2(*_fixtures())
    # bands
    assert "bands" in out
    # market block
    for k in ("tam", "growth", "note", "tier", "sources"):
        assert k in out["market"]
    # why_now
    for k in ("shift", "tier", "sources"):
        assert k in out["why_now"]
    # entry_cost items
    for f in out["entry_cost"]:
        assert {"label", "value", "tier", "sources"} <= set(f)
    # read
    assert {"synthesis", "recommendation", "limit"} <= set(out["read"])
    # competitors enriched
    for c in out["competitors"]:
        assert "url" in c and "funding_stage" in c
    # gaps enriched
    for g in out["gaps"]:
        assert {"severity", "underserved", "tags", "quotes"} <= set(g)
    # legacy still present (frontend back-compat during transition)
    assert "saturation_score" in out and "roadmap" in out
```

- [ ] **Step 2: Run to verify pass**

Run: `python -m pytest tests/test_contract.py -v`
Expected: 1 passed.

- [ ] **Step 3: Run full suite + build**

Run: `python -m pytest tests/ -v && cd ../../.. && sam build 2>&1 | tail -3`
Expected: all pass, `Build Succeeded`.

- [ ] **Step 4: Commit**

```bash
git add infrastructure/lambda/ai-orchestration/tests/test_contract.py
git commit -m "test: assert v2 result_json carries the full MarketMemo contract surface

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Deferred to a later pass (NOT in this plan)

- Deriving `funding_maturity` / `market_consolidation` from per-competitor evidence (scoring-methodology change "A" — improves accuracy, doesn't change the v2 shape).
- Opportunity-ceiling recalibration.
- `market.note` population (bottoms-up caveat) — currently empty string; needs a thin-data heuristic.
- Live deploy + a real report invocation to eyeball the LLM output quality (do after Plan B so it's visible in the memo).

## Manual verification after merge

```bash
# from repo root, with AWS creds + deployed dev stack
sam build && sam deploy
# create a report via the API, poll until complete, inspect result_json for the v2 keys
curl -s -X POST "$API/api/reports" -H "Authorization: Bearer $JWT" -d '{"idea_text":"AI fitness coaching app"}'
```
Confirm `bands`, `market`, `why_now`, `entry_cost`, `read`, enriched `competitors`/`gaps` appear.
