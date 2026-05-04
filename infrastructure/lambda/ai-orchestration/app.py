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
from decimal import Decimal

from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.metrics import MetricUnit
from aws_durable_execution_sdk_python import durable_execution, DurableContext
from botocore.exceptions import BotoCoreError, ClientError

logger = Logger()
tracer = Tracer()
metrics = Metrics()

# ── Token usage tracking ──
# Per-model cost rates (USD per 1M tokens) — keep in sync with pricing
_MODEL_COST_PER_1M = {
    "input": {
        "amazon.nova-micro": 0.035,
        "deepseek": 0.62,
        "anthropic.claude-3-haiku": 0.25,
    },
    "output": {
        "amazon.nova-micro": 0.14,
        "deepseek": 1.85,
        "anthropic.claude-3-haiku": 1.25,
    },
}


def _model_cost_key(model_id: str) -> str:
    """Map a full Bedrock model ID to a cost-table key."""
    mid = model_id.lower()
    if "nova-micro" in mid or "nova" in mid:
        return "amazon.nova-micro"
    if "deepseek" in mid:
        return "deepseek"
    if "claude" in mid and "haiku" in mid:
        return "anthropic.claude-3-haiku"
    # Fallback: use Haiku pricing as conservative default
    return "anthropic.claude-3-haiku"


def _estimate_cost_usd(model_id: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate LLM cost in USD for a single call."""
    key = _model_cost_key(model_id)
    input_cost = (input_tokens / 1_000_000) * _MODEL_COST_PER_1M["input"].get(key, 0.25)
    output_cost = (output_tokens / 1_000_000) * _MODEL_COST_PER_1M["output"].get(key, 1.25)
    return input_cost + output_cost


class TokenTracker:
    """Accumulates token usage across pipeline stages."""

    def __init__(self):
        self.stages: dict[str, dict] = {}
        self.total_input = 0
        self.total_output = 0
        self.total_cost_usd = 0.0

    def record(self, stage: str, model_id: str, input_tokens: int, output_tokens: int):
        cost = _estimate_cost_usd(model_id, input_tokens, output_tokens)
        if stage not in self.stages:
            self.stages[stage] = {
                "model_id": model_id,
                "input_tokens": 0,
                "output_tokens": 0,
                "cost_usd": 0.0,
                "calls": 0,
            }
        s = self.stages[stage]
        s["input_tokens"] += input_tokens
        s["output_tokens"] += output_tokens
        s["cost_usd"] += cost
        s["calls"] += 1
        self.total_input += input_tokens
        self.total_output += output_tokens
        self.total_cost_usd += cost

        logger.info(
            "LLM token usage",
            extra={
                "stage": stage,
                "model_id": model_id,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": round(cost, 6),
            },
        )

    def summary(self) -> dict:
        return {
            "total_input_tokens": self.total_input,
            "total_output_tokens": self.total_output,
            "total_tokens": self.total_input + self.total_output,
            "total_cost_usd": round(self.total_cost_usd, 6),
            "stages": self.stages,
        }


# Module-level tracker — reset per invocation in handler
_token_tracker: TokenTracker | None = None

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
WIKIPEDIA_API_URL = "https://en.wikipedia.org/api/rest_v1/page/summary"
WIKIDATA_SEARCH_URL = "https://www.wikidata.org/w/api.php"
WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"

# User-Agent for Wikipedia/Wikidata (their courtesy policy)
WIKI_HEADERS = {"User-Agent": "MarketLens/1.0 (market intelligence platform)"}

# Wikidata "instance of" (P31) values that indicate a company / business organization
_WD_COMPANY_LIKE = frozenset({
    "Q783794",  # company
    "Q6881511",  # enterprise
    "Q891723",  # publicly traded company
    "Q4830453",  # business
    "Q43229",  # organization
    "Q219577",  # holding company
    "Q167037",  # corporation
    "Q3187459",  # internet company
})


def _wikidata_entity_is_company_like(entity_id: str) -> bool:
    """Use wbgetentities to verify P31 (instance of) is a company/business-like item."""
    try:
        ent_resp = requests.get(
            WIKIDATA_SEARCH_URL,
            params={
                "action": "wbgetentities",
                "ids": entity_id,
                "format": "json",
                "props": "claims",
            },
            headers=WIKI_HEADERS,
            timeout=5,
        )
        ent_resp.raise_for_status()
        entity = ent_resp.json().get("entities", {}).get(entity_id)
        if not entity or entity.get("missing") == "":
            return False
        for stmt in entity.get("claims", {}).get("P31", []):
            snak = stmt.get("mainsnak", {})
            if snak.get("snaktype") != "value":
                continue
            datavalue = snak.get("datavalue", {})
            value = datavalue.get("value")
            if isinstance(value, dict) and value.get("entity-type") == "item":
                if value.get("id") in _WD_COMPANY_LIKE:
                    return True
        return False
    except Exception as e:
        logger.warning(
            "Wikidata entity verification failed",
            extra={"entity_id": entity_id, "error": str(e)},
        )
        return False


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


def _wikipedia_summary(company_name: str) -> dict | None:
    """Fetch a company summary from Wikipedia. Returns None on miss."""
    try:
        # Wikipedia titles use underscores for spaces
        title = company_name.strip().replace(" ", "_")
        resp = requests.get(
            f"{WIKIPEDIA_API_URL}/{title}",
            headers=WIKI_HEADERS,
            timeout=5,
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()
        if data.get("type") == "disambiguation":
            return None  # Ambiguous — skip
        return {
            "name": data.get("title", company_name),
            "description": data.get("description", ""),
            "extract": data.get("extract", ""),
            "url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
        }
    except Exception:
        return None


def _wikidata_company_facts(company_name: str) -> dict | None:
    """Search Wikidata for a company and return structured facts.

    Returns dict with: founded_year, employee_count, revenue_usd, industry,
    hq_location, parent_org. All fields may be None.
    """
    try:
        # Step 1: Search for the entity
        search_resp = requests.get(
            WIKIDATA_SEARCH_URL,
            params={
                "action": "wbsearchentities",
                "search": company_name,
                "language": "en",
                "type": "item",
                "limit": 10,
                "format": "json",
            },
            headers=WIKI_HEADERS,
            timeout=5,
        )
        search_resp.raise_for_status()
        results = search_resp.json().get("search", [])
        if not results:
            return None

        skip_words = {"album", "song", "film", "village", "river", "person", "character"}
        entity_id = None
        for cand in results:
            cid = cand.get("id")
            if not cid:
                continue
            entity_desc = cand.get("description", "").lower()
            if any(w in entity_desc for w in skip_words):
                continue
            if not _wikidata_entity_is_company_like(cid):
                continue
            entity_id = cid
            break

        if not entity_id:
            return None

        # Step 2: SPARQL query for structured properties
        sparql = f"""
        SELECT ?founded ?employees ?revenue ?industryLabel ?hqLabel ?parentLabel WHERE {{
          OPTIONAL {{ wd:{entity_id} wdt:P571 ?founded. }}
          OPTIONAL {{ wd:{entity_id} wdt:P1128 ?employees. }}
          OPTIONAL {{ wd:{entity_id} wdt:P2139 ?revenue. }}
          OPTIONAL {{ wd:{entity_id} wdt:P452 ?industry. }}
          OPTIONAL {{ wd:{entity_id} wdt:P159 ?hq. }}
          OPTIONAL {{ wd:{entity_id} wdt:P749 ?parent. }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }}
        LIMIT 1
        """
        sparql_resp = requests.get(
            WIKIDATA_SPARQL_URL,
            params={"query": sparql, "format": "json"},
            headers=WIKI_HEADERS,
            timeout=8,
        )
        sparql_resp.raise_for_status()
        bindings = sparql_resp.json().get("results", {}).get("bindings", [])

        if not bindings:
            return {"name": company_name, "wikidata_id": entity_id}

        b = bindings[0]

        def _val(key):
            return b.get(key, {}).get("value")

        founded_raw = _val("founded")
        founded_year = None
        if founded_raw:
            try:
                founded_year = int(founded_raw[:4])
            except (ValueError, IndexError):
                pass

        employees_raw = _val("employees")
        employee_count = None
        if employees_raw:
            try:
                employee_count = int(float(employees_raw))
            except ValueError:
                pass

        revenue_raw = _val("revenue")
        revenue_usd = None
        if revenue_raw:
            try:
                revenue_usd = float(revenue_raw)
            except ValueError:
                pass

        return {
            "name": company_name,
            "wikidata_id": entity_id,
            "founded_year": founded_year,
            "employee_count": employee_count,
            "revenue_usd": revenue_usd,
            "industry": _val("industryLabel"),
            "hq_location": _val("hqLabel"),
            "parent_org": _val("parentLabel"),
        }
    except Exception as e:
        logger.warning("Wikidata lookup failed", extra={"company": company_name, "error": str(e)})
        return None


def _enrich_competitors_with_wiki(competitor_names: list[str]) -> dict:
    """Look up competitor names in Wikipedia + Wikidata in parallel. Returns enrichment data."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    wiki_data = {}
    names = competitor_names[:15]  # Cap at 15 to stay fast

    def _lookup(name: str) -> tuple[str, dict]:
        entry = {}
        facts = _wikidata_company_facts(name)
        summary = _wikipedia_summary(name)
        if facts:
            entry.update({k: v for k, v in facts.items() if v is not None})
        if summary:
            entry["wikipedia_extract"] = summary.get("extract", "")[:300]
            if not entry.get("name"):
                entry["name"] = summary.get("name", name)
        return (name, entry)

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_lookup, name): name for name in names}
        for future in as_completed(futures):
            name = futures.get(future, "unknown")
            try:
                res_name, entry = future.result()
                if entry:
                    wiki_data[res_name] = entry
            except Exception:
                logger.exception(
                    "Wiki enrichment lookup failed in _lookup",
                    extra={"company": name},
                )

    return wiki_data


def _set_stage(report_id: str, stage: str, org_id: str) -> None:
    if not org_id:
        raise ValueError(f"_set_stage called without org_id for report {report_id}")
    pk = f"ORG#{org_id}#REPORT#{report_id}"
    try:
        table.update_item(
            Key={"pk": pk, "sk": f"REPORT#{report_id}"},
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

    # ── Wikipedia + Wikidata enrichment ──
    # Extract company names from Brave results for wiki lookup
    brave_company_names = []
    for r in all_competitors[:20]:
        # Try to extract company name from title (before " - " or " | ")
        title = r.get("title", "")
        for sep in [" - ", " | ", " — ", ": "]:
            if sep in title:
                title = title.split(sep)[0]
                break
        name = title.strip()
        if name and len(name) < 60:
            brave_company_names.append(name)

    wiki_enrichment = {}
    if brave_company_names:
        try:
            wiki_enrichment = _enrich_competitors_with_wiki(brave_company_names)
            logger.info("Wiki enrichment complete", extra={"enriched": len(wiki_enrichment), "attempted": len(brave_company_names)})
        except Exception as e:
            logger.warning("Wiki enrichment failed", extra={"error": str(e)})

    # Format wiki data for the LLM
    wiki_snippets = ""
    if wiki_enrichment:
        lines = []
        for name, data in wiki_enrichment.items():
            parts = [f"- {name}:"]
            if data.get("founded_year"):
                parts.append(f"founded {data['founded_year']}")
            if data.get("employee_count"):
                parts.append(f"{data['employee_count']:,} employees")
            if data.get("revenue_usd"):
                rev = data["revenue_usd"]
                if rev >= 1e9:
                    parts.append(f"${rev/1e9:.1f}B revenue")
                elif rev >= 1e6:
                    parts.append(f"${rev/1e6:.0f}M revenue")
            if data.get("industry"):
                parts.append(f"industry: {data['industry']}")
            if data.get("hq_location"):
                parts.append(f"HQ: {data['hq_location']}")
            if data.get("parent_org"):
                parts.append(f"parent: {data['parent_org']}")
            if data.get("wikipedia_extract"):
                parts.append(f"— {data['wikipedia_extract'][:200]}")
            lines.append(" | ".join(parts))
        wiki_snippets = "\n".join(lines)

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

STRUCTURED COMPANY DATA (from Wikipedia + Wikidata — verified facts):
{wiki_snippets if wiki_snippets else "(no structured data found)"}

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
- Use the STRUCTURED COMPANY DATA (Wikipedia/Wikidata) for accurate founding years, employee counts, and revenue. Prefer these over guesses.
- For market size and growth, extract actual numbers from the research report snippets.
- For user pain points, extract real complaints from the community/review results.
- If a data point isn't in the search results or structured data, set it to null — do not guess."""

    response = call_llm(prompt, model_id=MODEL_ID_PARSE, max_tokens=2048, temperature=0.1)
    try:
        result = json.loads(response)
        competitors = result.get("competitors", [])
        if not isinstance(competitors, list):
            competitors = []
        return {
            "competitors": competitors,
            "market_size_tam_usd": _safe_number(result.get("market_size_tam_usd")),
            "market_growth_rate_pct": _safe_number(result.get("market_growth_rate_pct")),
            "market_age_years": _safe_number(result.get("market_age_years"), default=5),
            "trends": result.get("trends", []),
            "user_pain_points": result.get("user_pain_points", []),
            "wiki_enrichment": wiki_enrichment,
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
            "market_size_tam_usd": _safe_number(result.get("market_size_tam_usd")),
            "market_growth_rate_pct": _safe_number(result.get("market_growth_rate_pct")),
            "market_age_years": _safe_number(result.get("market_age_years"), default=5),
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
  "dominant_segment": "enterprise | mid_market | smb | consumer | mixed",
  "funding_maturity": 1-10 integer. 1=all bootstrapped/seed, 5=mix of seed and series A/B, 8=multiple series C+ players, 10=public companies dominate with high concentration,
  "market_consolidation": 1-10 integer. 1=highly fragmented (many small players, no clear leader), 5=moderately consolidated, 10=oligopoly (top 3 hold >70% share),
  "switching_cost": 1-10 integer. 1=trivial to switch (commodity), 5=moderate friction, 10=extreme lock-in (data, integrations, contracts),
  "cac_pressure": 1-10 integer. 1=organic/cheap acquisition channels available, 5=moderate paid acquisition needed, 10=extremely expensive to acquire customers (saturated ad channels, long sales cycles),
  "innovation_velocity": 1-10 integer. 1=stagnant market (incumbents not shipping), 5=moderate pace, 10=rapid innovation (hard to keep up),
  "estimated_tam_usd": number or null (total addressable market in USD, best estimate from competitor data),
  "estimated_growth_pct": number or null (estimated YoY market growth percentage)
}}

RULES:
- Only include competitors from the provided list. Do NOT invent new ones.
- Be honest about strengths and weaknesses. No generic filler.
- market_gaps should identify 2-4 genuinely underserved areas.
- Mark uncertainty explicitly — if you don't know a funding stage, say "unknown".
- For the 1-10 scores: use the FULL range. A 3 and a 7 should feel meaningfully different. Don't default to 5.
- estimated_tam_usd and estimated_growth_pct: infer from competitor scale, funding levels, and market context. Set to null ONLY if you truly cannot estimate."""

    response = call_llm(prompt, model_id=MODEL_ID_ANALYSE, max_tokens=2048, temperature=0.3)
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        return {
            "competitor_analysis": [],
            "market_gaps": [],
            "positioning": "Differentiation opportunity exists.",
            "dominant_segment": "mixed",
            "funding_maturity": 5,
            "market_consolidation": 5,
            "switching_cost": 5,
            "cac_pressure": 5,
            "innovation_velocity": 5,
            "estimated_tam_usd": None,
            "estimated_growth_pct": None,
        }


# ---------------------------------------------------------------------------
# Stage 5: Score  (deterministic — no LLM)
# ---------------------------------------------------------------------------
def _clamp(value: float, lo: int = 0, hi: int = 100) -> int:
    return int(min(hi, max(lo, round(value))))


def _floats_to_decimal(obj):
    """Recursively convert Python floats to Decimal so the dict can be written
    via the DynamoDB resource client (which rejects floats)."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _floats_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_floats_to_decimal(v) for v in obj]
    return obj


def _safe_number(val, default=None) -> float | None:
    """Coerce a value to float. LLMs often return numbers as strings or with
    formatting like '$14.8B'. This handles those cases gracefully."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        # Strip currency symbols, commas, whitespace
        cleaned = val.strip().replace(",", "").replace("$", "").replace("€", "").replace("£", "")
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
    _market_age_search = _safe_number(search_results.get("market_age_years"), default=None)
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
    funding_maturity = max(1, min(10, int(_safe_number(analysis.get("funding_maturity"), default=5))))
    market_consolidation = max(1, min(10, int(_safe_number(analysis.get("market_consolidation"), default=5))))
    switching_cost = max(1, min(10, int(_safe_number(analysis.get("switching_cost"), default=5))))
    cac_pressure = max(1, min(10, int(_safe_number(analysis.get("cac_pressure"), default=5))))
    innovation_velocity = max(1, min(10, int(_safe_number(analysis.get("innovation_velocity"), default=5))))

    # Backward compat: if old boolean signals exist, convert them to gradient
    if "has_public_companies" in analysis and "funding_maturity" not in analysis:
        has_public = analysis.get("has_public_companies", False)
        has_series_c = analysis.get("has_series_c_plus", False)
        funding_concentrated = analysis.get("funding_concentration_high", False)
        rising_cac = analysis.get("rising_cac_signals", False)
        funding_maturity = 10 if (has_public and funding_concentrated) else 8 if has_public else 6 if has_series_c else 3
        market_consolidation = 8 if funding_concentrated else 4
        cac_pressure = 7 if rising_cac else 3

    # ── Saturation Score (0-100) ──
    # Competitor count: logarithmic scaling (diminishing returns after 8)
    import math
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

    saturation_raw = competitor_factor + funding_factor + consolidation_factor + age_factor + cac_factor + innovation_factor
    saturation = _clamp(saturation_raw)

    # ── Difficulty Score (0-100) ──
    complexity_map = {"high": 22, "medium": 13, "low": 5}
    technical_score = complexity_map.get(complexity, 13)

    capital_map = {
        "hardware": 22, "b2b_saas": 16, "marketplace": 18,
        "b2c_saas": 9, "ecommerce": 7, "service": 4, "other": 10,
    }
    capital_score = capital_map.get(business_model, 10)

    segment_map = {"enterprise": 18, "mid_market": 11, "smb": 5, "prosumer": 2, "consumer": 0, "mixed": 7}
    sales_cycle_score = segment_map.get(dominant_segment, 5)

    regulated_industries = {"healthcare", "fintech", "finance", "legal", "edtech", "insurance", "banking"}
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

    difficulty = _clamp(technical_score + capital_score + sales_cycle_score + regulatory_score + switching_factor + incumbent_strength)

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
        growth_score = min(22.0, growth_pct * 0.7 if growth_pct <= 25 else 17.5 + (growth_pct - 25) * 0.15)
    else:
        growth_score = 5.0  # moderate default

    # Gap signals
    weakness_keywords = {"expensive", "complex", "no smb", "limited", "outdated", "slow", "poor",
                         "lacking", "missing", "frustrating", "clunky", "overpriced", "rigid"}
    weaknesses_text = " ".join(
        (c.get("weakness") or "").lower() for c in competitors
    )
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

    opportunity_raw = (market_size_score + growth_score + gap_score
                       + fragmentation_bonus + low_switching_bonus
                       - saturation_penalty - difficulty_penalty)
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
    org_id = event.get("org_id", "anonymous")

    pk = f"ORG#{org_id}#REPORT#{report_id}"
    sk = f"REPORT#{report_id}"

    logger.info("Pipeline started", extra={"report_id": report_id, "org_id": org_id})

    try:
        # Update status to running
        table.update_item(
            Key={"pk": pk, "sk": sk},
            UpdateExpression="SET #s = :status",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": "running"},
        )

        # Stage 1: Sanitize
        sanitized = context.step(lambda _: sanitize(idea_text), name="sanitize")
        _set_stage(report_id, "sanitize", org_id)

        # Stage 2: Parse  (Nova Micro)
        parsed = context.step(lambda _: parse(sanitized["cleaned_idea"]), name="parse")
        _set_stage(report_id, "parse", org_id)

        # Stage 3: Search  (Brave Search API + Nova Micro)
        search_results = context.step(lambda _: search(parsed), name="search")
        _set_stage(report_id, "search", org_id)

        # Stage 4: Analyse  (DeepSeek V3.2)
        analysis = context.step(lambda _: analyse(parsed, search_results), name="analyse")
        _set_stage(report_id, "analyse", org_id)

        # Stage 5: Score  (deterministic)
        scores = context.step(lambda _: score(parsed, analysis, search_results), name="score")
        _set_stage(report_id, "score", org_id)

        # Stage 6: Summarise  (Claude 3 Haiku)
        summary = context.step(lambda _: summarise(analysis, scores, parsed, search_results), name="summarise")
        _set_stage(report_id, "summarise", org_id)

        # Stage 7: Assemble
        result = context.step(
            lambda _: assemble(parsed, search_results, analysis, scores, summary),
            name="assemble",
        )
        _set_stage(report_id, "assemble", org_id)

        # Write final result to DynamoDB
        now = datetime.utcnow().isoformat()
        table.update_item(
            Key={"pk": pk, "sk": sk},
            UpdateExpression="SET #s = :status, result_json = :result, completed_at = :now",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":status": "complete",
                ":result": _floats_to_decimal(result),
                ":now": now,
            },
        )

        logger.info("Pipeline completed", extra={"report_id": report_id, "org_id": org_id})
        return {"report_id": report_id, "status": "complete"}
    except Exception as e:
        logger.exception("Pipeline failed", extra={"report_id": report_id})
        if report_id:
            now = datetime.utcnow().isoformat()
            table.update_item(
                Key={"pk": pk, "sk": sk},
                UpdateExpression="SET #s = :status, error_message = :error_message, completed_at = :now",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={
                    ":status": "failed",
                    ":error_message": str(e),
                    ":now": now,
                },
            )
        raise
