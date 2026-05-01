"""
MarketLens AI Orchestration — Durable Function pipeline.

Stages: sanitize → parse → search → analyse → score → summarise → assemble
Each stage is a durable step with automatic checkpointing and retry.

Models (per stage):
  - Parse:     Amazon Nova Micro   ($0.035/$0.14 per 1M tokens)
  - Search:    Brave Search API    ($5/1K requests) + Nova Micro (structuring)
  - Analyse:   DeepSeek V3.2       ($0.62/$1.85 per 1M tokens)
  - Summarise: Claude 3 Haiku      ($0.25/$1.25 per 1M tokens)
"""
import os
import json
import boto3
import random
import time
import requests
from datetime import datetime

from aws_lambda_powertools import Logger, Tracer
from aws_durable_execution_sdk_python import durable_execution, DurableContext
from botocore.exceptions import BotoCoreError, ClientError

logger = Logger()
tracer = Tracer()

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["REPORTS_TABLE"])
bedrock = boto3.client("bedrock-runtime")

# Per-stage model IDs
MODEL_ID_PARSE = os.environ["BEDROCK_MODEL_ID_PARSE"]
MODEL_ID_ANALYSE = os.environ["BEDROCK_MODEL_ID_ANALYSE"]
MODEL_ID_SUMMARISE = os.environ["BEDROCK_MODEL_ID_SUMMARISE"]

# Brave Search API
ssm = boto3.client("ssm")
_brave_api_key: str | None = None

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"


def _get_brave_api_key() -> str | None:
    """Retrieve Brave Search API key from SSM Parameter Store (cached in memory)."""
    global _brave_api_key
    if _brave_api_key is not None:
        return _brave_api_key
    param_name = os.environ.get("BRAVE_SEARCH_API_KEY_PARAM", "")
    if not param_name:
        return None
    try:
        resp = ssm.get_parameter(Name=param_name, WithDecryption=True)
        _brave_api_key = resp["Parameter"]["Value"]
        return _brave_api_key
    except Exception as e:
        logger.warning("Failed to retrieve Brave API key from SSM", extra={"error": str(e)})
        return None


def _brave_search(query: str, count: int = 20) -> list[dict]:
    """Call Brave Search API and return web results. Returns empty list on failure."""
    api_key = _get_brave_api_key()
    if not api_key:
        return []
    try:
        resp = requests.get(
            BRAVE_SEARCH_URL,
            headers={"X-Subscription-Token": api_key, "Accept": "application/json"},
            params={"q": query, "count": count, "country": "us", "search_lang": "en"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("web", {}).get("results", [])
        return [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "description": r.get("description", ""),
            }
            for r in results
        ]
    except Exception as e:
        logger.warning("Brave Search API call failed", extra={"query": query, "error": str(e)})
        return []


def _set_stage(report_id: str, stage: str) -> None:
    try:
        table.update_item(
            Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
            UpdateExpression="SET current_stage = :stage",
            ExpressionAttributeValues={":stage": stage},
        )
    except Exception as e:
        logger.warning(
            "Stage persistence failed (best-effort)",
            extra={"report_id": report_id, "stage": stage, "error": str(e)},
        )


def _build_payload(model_id: str, prompt: str, max_tokens: int, temperature: float) -> str:
    """Build the invoke_model payload based on model provider."""
    if "anthropic" in model_id:
        return json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        })
    if "deepseek" in model_id:
        # DeepSeek uses OpenAI-compatible format
        return json.dumps({
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        })
    # Amazon Nova — Converse-style payload
    return json.dumps({
        "inferenceConfig": {"max_new_tokens": max_tokens, "temperature": temperature},
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
    })


def _extract_text(model_id: str, response_body: dict) -> str:
    """Extract text from model response based on provider format."""
    if "anthropic" in model_id:
        return response_body["content"][0]["text"]
    if "deepseek" in model_id:
        # DeepSeek uses OpenAI-compatible response format
        return response_body["choices"][0]["message"]["content"]
    # Amazon Nova
    return response_body["output"]["message"]["content"][0]["text"]


def call_llm(prompt: str, model_id: str, max_tokens: int = 1024, temperature: float = 0.2) -> str:
    """Call a Bedrock model and return the text response. Handles retries with backoff."""
    max_attempts = int(os.environ.get("LLM_MAX_ATTEMPTS", "3"))
    backoff_base_ms = int(os.environ.get("LLM_BACKOFF_BASE_MS", "400"))
    backoff_cap_ms = int(os.environ.get("LLM_BACKOFF_CAP_MS", "4000"))

    transient_codes = {
        "ThrottlingException",
        "TooManyRequestsException",
        "ServiceUnavailableException",
        "InternalServerException",
        "ModelNotReadyException",
        "ModelTimeoutException",
    }

    payload = _build_payload(model_id, prompt, max_tokens, temperature)

    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = bedrock.invoke_model(
                modelId=model_id,
                contentType="application/json",
                accept="application/json",
                body=payload,
            )

            raw = response["body"].read()
            try:
                parsed = json.loads(raw)
            except Exception as e:
                raise ValueError(f"Bedrock response JSON parse failed: {e}") from e

            return _extract_text(model_id, parsed)

        except (ClientError, BotoCoreError, ValueError) as e:
            last_err = e
            code = None
            if isinstance(e, ClientError):
                code = e.response.get("Error", {}).get("Code")

            retryable = isinstance(e, ValueError) or (code in transient_codes if code else True)
            if (not retryable) or attempt >= max_attempts:
                logger.exception(
                    "Bedrock invoke failed",
                    extra={
                        "model_id": model_id,
                        "attempt": attempt,
                        "max_attempts": max_attempts,
                        "error_code": code,
                    },
                )
                raise

            backoff_ms = min(backoff_cap_ms, backoff_base_ms * (2 ** (attempt - 1)))
            jitter_ms = random.randint(0, 250)
            sleep_s = (backoff_ms + jitter_ms) / 1000.0
            logger.warning(
                "Bedrock invoke transient failure; retrying",
                extra={"model_id": model_id, "attempt": attempt, "sleep_s": sleep_s, "error_code": code},
            )
            time.sleep(sleep_s)

    raise RuntimeError(f"Bedrock invoke failed after {max_attempts} attempts: {last_err}")


# ---------------------------------------------------------------------------
# Stage 1: Sanitize (no LLM)
# ---------------------------------------------------------------------------
def sanitize(idea_text: str) -> dict:
    """Validate and clean input."""
    cleaned = idea_text.strip()
    if len(cleaned) < 5:
        raise ValueError("Idea text too short")
    if len(cleaned) > 2000:
        cleaned = cleaned[:2000]
    return {"cleaned_idea": cleaned}


# ---------------------------------------------------------------------------
# Stage 2: Parse  (Nova Micro — cheap structured extraction)
# ---------------------------------------------------------------------------
def parse(cleaned_idea: str) -> dict:
    """Extract industry, geography, business model, complexity via LLM."""
    prompt = f"""Analyze this business idea and extract structured information.
Return ONLY valid JSON with these fields:
- industry: the primary industry/vertical (e.g. "cybersecurity", "edtech", "ecommerce")
- sub_industry: narrower category (e.g. "cloud security", "K-12 tutoring", "dropshipping")
- business_model: one of [b2b_saas, b2c_saas, marketplace, ecommerce, service, hardware, other]
- target_customer: who buys/uses this (e.g. "small business owners", "enterprise IT teams")
- geography: target market geography ("global" if unspecified)
- keywords: list of 5-8 search keywords for competitor research
- estimated_complexity: one of [low, medium, high] based on technical/operational complexity
- estimated_market_age_years: approximate age of this market in years (integer)

Business idea: <<<{cleaned_idea}>>>"""

    response = call_llm(prompt, model_id=MODEL_ID_PARSE, max_tokens=512, temperature=0.1)
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        return {
            "industry": "Technology",
            "sub_industry": "General",
            "business_model": "other",
            "target_customer": "General consumers",
            "geography": "Global",
            "keywords": [cleaned_idea],
            "estimated_complexity": "medium",
            "estimated_market_age_years": 5,
        }


# ---------------------------------------------------------------------------
# Stage 3: Search  (Brave Search API + Nova Micro for structuring)
# ---------------------------------------------------------------------------
def search(parsed: dict) -> dict:
    """Search for competitors, market size, and trends via Brave Search API.

    Runs 6 targeted searches across high-quality sources, then uses Nova Micro
    to structure the raw results into the schema the pipeline expects.
    Falls back to pure LLM search if Brave API is unavailable.
    """
    keywords = parsed.get("keywords", [])
    industry = parsed.get("industry", "")
    sub_industry = parsed.get("sub_industry", "")
    geography = parsed.get("geography", "Global")
    business_model = parsed.get("business_model", "")
    keyword_str = " ".join(keywords[:4])

    # ── 6 targeted Brave searches ──

    # 1. Competitors via Crunchbase (funding, stage, description)
    competitor_crunchbase = _brave_search(
        f'"{sub_industry}" site:crunchbase.com/organization', count=15
    )
    # 2. Competitors via general web (broader net)
    competitor_general = _brave_search(
        f"{industry} {sub_industry} competitors alternatives companies {keyword_str}", count=15
    )
    # 3. Market size from research firms
    market_size = _brave_search(
        f'"{industry}" "{sub_industry}" market size TAM revenue '
        f"site:statista.com OR site:grandviewresearch.com OR site:mordorintelligence.com OR site:fortunebusinessinsights.com",
        count=10,
    )
    # 4. Funding and trends from tech press
    funding_trends = _brave_search(
        f'"{sub_industry}" startup raised funding 2025 2026 '
        f"site:techcrunch.com OR site:crunchbase.com/funding-round",
        count=10,
    )
    # 5. User pain points from communities (gap signals)
    pain_points = _brave_search(
        f'"{sub_industry}" {keyword_str} "wish" OR "missing" OR "expensive" OR "frustrating" '
        f"site:reddit.com OR site:g2.com OR site:trustpilot.com",
        count=10,
    )
    # 6. Industry trends and analysis
    trend_results = _brave_search(
        f"{industry} {sub_industry} trends predictions outlook 2025 2026", count=10
    )

    # Merge competitor results (dedup by URL)
    seen_urls: set[str] = set()
    all_competitors: list[dict] = []
    for r in competitor_crunchbase + competitor_general:
        if r["url"] not in seen_urls:
            seen_urls.add(r["url"])
            all_competitors.append(r)

    has_brave_data = len(all_competitors) > 0

    if not has_brave_data:
        logger.info("Brave Search unavailable, falling back to LLM-only search")
        return _search_fallback_llm(parsed)

    # Format raw results for the LLM to structure
    competitor_snippets = "\n".join(
        f"- {r['title']}: {r['description']} ({r['url']})" for r in all_competitors[:25]
    )
    market_snippets = "\n".join(
        f"- {r['title']}: {r['description']}" for r in market_size[:10]
    )
    funding_snippets = "\n".join(
        f"- {r['title']}: {r['description']}" for r in funding_trends[:10]
    )
    pain_snippets = "\n".join(
        f"- {r['title']}: {r['description']}" for r in pain_points[:10]
    )
    trend_snippets = "\n".join(
        f"- {r['title']}: {r['description']}" for r in trend_results[:10]
    )

    prompt = f"""You are a market research assistant. I've searched the web for information about the
{industry} / {sub_industry} market ({business_model}, {geography}).

COMPETITOR & COMPANY RESULTS (from Crunchbase + web):
{competitor_snippets}

MARKET SIZE & RESEARCH REPORTS:
{market_snippets}

RECENT FUNDING & DEALS:
{funding_snippets}

USER PAIN POINTS & REVIEWS:
{pain_snippets}

INDUSTRY TRENDS & OUTLOOK:
{trend_snippets}

Based on these REAL search results, extract structured data. Return ONLY valid JSON:
{{
  "competitors": [
    {{
      "name": "Company Name",
      "description": "One-line description from search results",
      "founded_year": 2015,
      "url": "https://actual-url-from-results.com",
      "funding_stage": "series_c_plus | series_a_b | seed | bootstrapped | public | acquired | unknown",
      "target_segment": "enterprise | mid_market | smb | prosumer | consumer | unknown",
      "pricing_tier": "free | low | mid | high | enterprise | unknown"
    }}
  ],
  "market_size_tam_usd": null or number,
  "market_growth_rate_pct": null or number,
  "market_age_years": number,
  "trends": ["trend 1", "trend 2", "trend 3"],
  "user_pain_points": ["pain point 1", "pain point 2"]
}}

RULES:
- Extract 10-15 REAL companies from the search results. Use actual names and URLs.
- Do NOT invent companies that aren't in the search results.
- For market size and growth, extract actual numbers from the research report snippets.
- For user pain points, extract real complaints from the community/review results.
- If a data point isn't in the search results, set it to null — do not guess."""

    response = call_llm(prompt, model_id=MODEL_ID_PARSE, max_tokens=2048, temperature=0.1)
    try:
        result = json.loads(response)
        competitors = result.get("competitors", [])
        if not isinstance(competitors, list):
            competitors = []
        return {
            "competitors": competitors,
            "market_size_tam_usd": result.get("market_size_tam_usd"),
            "market_growth_rate_pct": result.get("market_growth_rate_pct"),
            "market_age_years": result.get("market_age_years", 5),
            "trends": result.get("trends", []),
            "user_pain_points": result.get("user_pain_points", []),
        }
    except json.JSONDecodeError:
        logger.warning("Failed to parse structured search results, falling back to LLM-only")
        return _search_fallback_llm(parsed)


def _search_fallback_llm(parsed: dict) -> dict:
    """Fallback: use Nova Micro to generate search results when Brave is unavailable."""
    keywords = parsed.get("keywords", [])
    industry = parsed.get("industry", "")
    sub_industry = parsed.get("sub_industry", "")
    geography = parsed.get("geography", "Global")
    business_model = parsed.get("business_model", "")

    prompt = f"""You are a market research assistant. Given this market context:
- Industry: {industry}
- Sub-industry: {sub_industry}
- Business model: {business_model}
- Geography: {geography}
- Keywords: {json.dumps(keywords)}

Research this market thoroughly. Return ONLY valid JSON with:
{{
  "competitors": [
    {{
      "name": "Company Name",
      "description": "One-line description of what they do",
      "founded_year": 2015,
      "url": "https://example.com",
      "funding_stage": "series_c_plus | series_a_b | seed | bootstrapped | public | acquired | unknown",
      "target_segment": "enterprise | mid_market | smb | prosumer | consumer | unknown",
      "pricing_tier": "free | low | mid | high | enterprise | unknown"
    }}
  ],
  "market_size_tam_usd": null or number (total addressable market in USD),
  "market_growth_rate_pct": null or number (year-over-year growth percentage),
  "market_age_years": number (how old is this market),
  "trends": ["trend 1", "trend 2", "trend 3"]
}}

RULES:
- List 10-15 REAL competitors. Do NOT invent companies.
- Include a mix of direct competitors and adjacent players.
- Be specific about funding stages and target segments when known.
- For market size, use your best estimate. Set to null if truly unknown.
- For growth rate, estimate based on industry knowledge. Set to null if unknown."""

    response = call_llm(prompt, model_id=MODEL_ID_PARSE, max_tokens=2048, temperature=0.2)
    try:
        result = json.loads(response)
        competitors = result.get("competitors", [])
        if not isinstance(competitors, list):
            competitors = []
        return {
            "competitors": competitors,
            "market_size_tam_usd": result.get("market_size_tam_usd"),
            "market_growth_rate_pct": result.get("market_growth_rate_pct"),
            "market_age_years": result.get("market_age_years", 5),
            "trends": result.get("trends", []),
        }
    except json.JSONDecodeError:
        return {
            "competitors": [],
            "market_size_tam_usd": None,
            "market_growth_rate_pct": None,
            "market_age_years": 5,
            "trends": [],
        }


# ---------------------------------------------------------------------------
# Stage 4: Analyse  (DeepSeek V3.2 — strong reasoning)
# ---------------------------------------------------------------------------
def analyse(parsed: dict, search_results: dict) -> dict:
    """Synthesize competitor landscape with positioning via LLM."""
    competitors = search_results.get("competitors", [])
    industry = parsed.get("industry", "")
    sub_industry = parsed.get("sub_industry", "")
    business_model = parsed.get("business_model", "")
    target_customer = parsed.get("target_customer", "")

    prompt = f"""You are a senior market research analyst. Analyze this competitive landscape.

CONTEXT:
- Industry: {industry} / {sub_industry}
- Business model: {business_model}
- Target customer: {target_customer}
- Competitors found: {json.dumps(competitors, indent=2)}

Return ONLY valid JSON with this exact structure:
{{
  "competitor_analysis": [
    {{
      "name": "Company Name",
      "strength": "Their key competitive advantage (one sentence)",
      "weakness": "Their main vulnerability or gap (one sentence)",
      "market_position": "leader | major | growing | niche | declining",
      "target_segment": "enterprise | mid_market | smb | prosumer | consumer",
      "funding_stage": "public | series_c_plus | series_a_b | seed | bootstrapped | unknown"
    }}
  ],
  "market_gaps": [
    {{
      "title": "Gap title",
      "description": "Why this gap exists and who it affects"
    }}
  ],
  "positioning": "One sentence on how a new entrant should differentiate",
  "has_public_companies": true/false,
  "has_series_c_plus": true/false,
  "dominant_segment": "enterprise | mid_market | smb | consumer | mixed",
  "funding_concentration_high": true/false (are top 3 players holding most of the market?),
  "rising_cac_signals": true/false (are there signs of rising customer acquisition costs?)
}}

RULES:
- Only include competitors from the provided list. Do NOT invent new ones.
- Be honest about strengths and weaknesses. No generic filler.
- market_gaps should identify 2-4 genuinely underserved areas.
- Mark uncertainty explicitly — if you don't know a funding stage, say "unknown"."""

    response = call_llm(prompt, model_id=MODEL_ID_ANALYSE, max_tokens=2048, temperature=0.3)
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        return {
            "competitor_analysis": [],
            "market_gaps": [],
            "positioning": "Differentiation opportunity exists.",
            "has_public_companies": False,
            "has_series_c_plus": False,
            "dominant_segment": "mixed",
            "funding_concentration_high": False,
            "rising_cac_signals": False,
        }


# ---------------------------------------------------------------------------
# Stage 5: Score  (deterministic — no LLM)
# ---------------------------------------------------------------------------
def _clamp(value: float, lo: int = 0, hi: int = 100) -> int:
    return int(min(hi, max(lo, round(value))))


def score(parsed: dict, analysis: dict, search_results: dict) -> dict:
    """Compute saturation, difficulty, opportunity scores using the design-doc algorithm."""

    competitors = analysis.get("competitor_analysis", [])
    num_direct = len(competitors)
    num_gaps = len(analysis.get("market_gaps", []))
    market_age = search_results.get("market_age_years") or parsed.get("estimated_market_age_years", 5)
    tam_usd = search_results.get("market_size_tam_usd")
    growth_pct = search_results.get("market_growth_rate_pct")
    complexity = parsed.get("estimated_complexity", "medium")
    business_model = parsed.get("business_model", "other")
    dominant_segment = analysis.get("dominant_segment", "mixed")
    has_public = analysis.get("has_public_companies", False)
    has_series_c = analysis.get("has_series_c_plus", False)
    funding_concentrated = analysis.get("funding_concentration_high", False)
    rising_cac = analysis.get("rising_cac_signals", False)
    industry = (parsed.get("industry") or "").lower()

    # ── Saturation Score (0-100) ──
    base_score = 20
    competitor_count_factor = min(40, num_direct * 2.5)

    if funding_concentrated:
        funding_factor = 25
    elif has_series_c or has_public:
        funding_factor = 15
    else:
        funding_factor = 5

    if market_age and market_age > 10:
        age_factor = 10
    elif market_age and market_age > 5:
        age_factor = 5
    else:
        age_factor = 0

    cac_factor = 5 if rising_cac else 0

    saturation = _clamp(base_score + competitor_count_factor + funding_factor + age_factor + cac_factor)

    # ── Difficulty Score (0-100) ──
    complexity_map = {"high": 25, "medium": 15, "low": 5}
    technical_score = complexity_map.get(complexity, 15)

    capital_map = {
        "hardware": 25, "b2b_saas": 20, "marketplace": 20,
        "b2c_saas": 10, "ecommerce": 10, "service": 5, "other": 10,
    }
    capital_score = capital_map.get(business_model, 10)

    segment_map = {"enterprise": 20, "mid_market": 10, "smb": 5, "prosumer": 0, "consumer": 0, "mixed": 8}
    sales_cycle_score = segment_map.get(dominant_segment, 5)

    regulated_industries = {"healthcare", "fintech", "finance", "legal", "edtech", "insurance", "banking"}
    semi_regulated = {"proptech", "foodtech", "transport", "logistics", "real estate"}
    if any(r in industry for r in regulated_industries):
        regulatory_score = 20
    elif any(r in industry for r in semi_regulated):
        regulatory_score = 10
    else:
        regulatory_score = 0

    if has_public:
        brand_trust_score = 10
    elif has_series_c:
        brand_trust_score = 5
    else:
        brand_trust_score = 0

    difficulty = _clamp(technical_score + capital_score + sales_cycle_score + regulatory_score + brand_trust_score)

    # ── Opportunity Score (0-100) ──
    if tam_usd and tam_usd > 10_000_000_000:
        market_size_score = 25
    elif tam_usd and tam_usd > 1_000_000_000:
        market_size_score = 18
    elif tam_usd and tam_usd > 100_000_000:
        market_size_score = 10
    elif tam_usd and tam_usd > 0:
        market_size_score = 5
    else:
        market_size_score = 0

    if growth_pct and growth_pct > 25:
        growth_score = 25
    elif growth_pct and growth_pct > 15:
        growth_score = 18
    elif growth_pct and growth_pct > 8:
        growth_score = 10
    else:
        growth_score = 0

    # Gap indicator: check if competitor weaknesses suggest common buyer complaints
    weakness_keywords = {"expensive", "complex", "no smb", "limited", "outdated", "slow", "poor"}
    weaknesses_text = " ".join(
        (c.get("weakness") or "").lower() for c in competitors
    )
    # Also factor in real user pain points from search
    pain_points = search_results.get("user_pain_points", [])
    pain_text = " ".join(p.lower() for p in pain_points if isinstance(p, str))
    combined_complaints = weaknesses_text + " " + pain_text
    has_buyer_complaint_match = any(kw in combined_complaints for kw in weakness_keywords)
    num_pain_points = len(pain_points)

    if has_buyer_complaint_match and (num_gaps >= 2 or num_pain_points >= 2):
        gap_score = 30
    elif num_gaps >= 1 or num_pain_points >= 1:
        gap_score = 15
    else:
        gap_score = 0

    saturation_penalty = saturation * 0.20
    difficulty_penalty = difficulty * 0.15

    opportunity = _clamp(market_size_score + growth_score + gap_score - saturation_penalty - difficulty_penalty)

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

    saturation_label = _band(saturation, ["Wide Open", "Some Players", "Competitive", "Saturated"])
    difficulty_label = _band(difficulty, ["Easy Entry", "Manageable", "Challenging", "Very Hard"])
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


# ---------------------------------------------------------------------------
# Stage 6: Summarise  (Claude 3 Haiku — natural prose)
# ---------------------------------------------------------------------------
def summarise(analysis: dict, scores: dict, parsed: dict, search_results: dict) -> dict:
    """Generate beginner-friendly explanation and gap analysis via LLM."""
    prompt = f"""You are an experienced startup advisor talking to a first-time founder.
Your job is to explain a market in plain language — like a friend who knows the industry well.

VOICE GUIDELINES:
- Use second person ("you", "your idea").
- Avoid jargon. If you must use a term (TAM, churn, CAC), explain it inline in parentheses.
- Be honest. If the market is brutal, say so. If it's promising, say so.
- Short sentences. Specific numbers when available. No hedging filler.
- Do NOT inflate numbers or make up data.

INPUT:
Industry: {parsed.get('industry', '')} / {parsed.get('sub_industry', '')}
Business model: {parsed.get('business_model', '')}
Target customer: {parsed.get('target_customer', '')}
Saturation score: {scores['saturation_score']}/100 ({scores['saturation_label']})
Difficulty score: {scores['difficulty_score']}/100 ({scores.get('difficulty_label', '')})
Opportunity score: {scores['opportunity_score']}/100 ({scores.get('opportunity_label', '')})
Market gaps: {json.dumps(analysis.get('market_gaps', []), indent=2)}
User pain points from reviews: {json.dumps(search_results.get('user_pain_points', []))}
Competitor count: {len(analysis.get('competitor_analysis', []))}
Key positioning advice: {analysis.get('positioning', '')}

Return ONLY valid JSON with:
{{
  "oneliner": "One sentence summary of the market opportunity",
  "gaps": [
    {{"title": "Gap title", "description": "Why this gap matters and who it serves"}}
  ],
  "trend_signal": "One sentence on where this market is heading",
  "recommendation": "2-3 sentence actionable recommendation for the founder",
  "roadmap": [
    {{"phase": "Phase 1 (0-3 months)", "title": "Step title", "description": "What to do"}}
  ]
}}

Include 2-3 gaps, and 3-4 roadmap phases."""

    response = call_llm(prompt, model_id=MODEL_ID_SUMMARISE, max_tokens=1500, temperature=0.6)
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        return {
            "oneliner": "Analysis complete. Review the scores above for market positioning.",
            "gaps": [],
            "trend_signal": "Market data analyzed.",
            "recommendation": "Review the competitor analysis for entry opportunities.",
            "roadmap": [],
        }


# ---------------------------------------------------------------------------
# Stage 7: Assemble  (no LLM)
# ---------------------------------------------------------------------------
def assemble(parsed: dict, search_results: dict, analysis: dict, scores: dict, summary: dict) -> dict:
    """Combine all results into the final report JSON."""
    return {
        "vertical": parsed.get("industry", ""),
        "geography": parsed.get("geography", ""),
        "business_model": parsed.get("business_model", ""),
        **scores,
        **summary,
        "competitors": analysis.get("competitor_analysis", []),
        "market_size": search_results.get("market_size_tam_usd") or "Unknown",
    }


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------
@durable_execution
def handler(event: dict, context: DurableContext) -> dict:
    """
    Main durable function handler.
    Each context.step() is checkpointed — if the function is interrupted,
    it resumes from the last completed step.
    """
    report_id = event.get("report_id")
    idea_text = event.get("idea_text")

    logger.info("Pipeline started", extra={"report_id": report_id})

    try:
        # Update status to running
        table.update_item(
            Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
            UpdateExpression="SET #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": "running"},
        )

        # Stage 1: Sanitize
        sanitized = context.step(lambda _: sanitize(idea_text), name="sanitize")
        _set_stage(report_id, "sanitize")

        # Stage 2: Parse  (Nova Micro)
        parsed = context.step(lambda _: parse(sanitized["cleaned_idea"]), name="parse")
        _set_stage(report_id, "parse")

        # Stage 3: Search  (Brave Search API + Nova Micro)
        search_results = context.step(lambda _: search(parsed), name="search")
        _set_stage(report_id, "search")

        # Stage 4: Analyse  (DeepSeek V3.2)
        analysis = context.step(lambda _: analyse(parsed, search_results), name="analyse")
        _set_stage(report_id, "analyse")

        # Stage 5: Score  (deterministic)
        scores = context.step(lambda _: score(parsed, analysis, search_results), name="score")
        _set_stage(report_id, "score")

        # Stage 6: Summarise  (Claude 3 Haiku)
        summary = context.step(lambda _: summarise(analysis, scores, parsed, search_results), name="summarise")
        _set_stage(report_id, "summarise")

        # Stage 7: Assemble
        result = context.step(
            lambda _: assemble(parsed, search_results, analysis, scores, summary),
            name="assemble",
        )
        _set_stage(report_id, "assemble")

        # Write final result to DynamoDB
        now = datetime.utcnow().isoformat()
        table.update_item(
            Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
            UpdateExpression="SET #s = :status, result_json = :result, completed_at = :now",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":status": "complete",
                ":result": result,
                ":now": now,
            },
        )

        logger.info("Pipeline completed", extra={"report_id": report_id})
        return {"report_id": report_id, "status": "complete"}
    except Exception as e:
        logger.exception("Pipeline failed", extra={"report_id": report_id})
        if report_id:
            now = datetime.utcnow().isoformat()
            table.update_item(
                Key={"pk": f"REPORT#{report_id}", "sk": f"REPORT#{report_id}"},
                UpdateExpression="SET #s = :status, error_message = :error_message, completed_at = :now",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":status": "failed",
                    ":error_message": str(e),
                    ":now": now,
                },
            )
        raise
