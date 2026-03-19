"""
Ask Twice — 多源搜索封装

支持 Brave Search + DuckDuckGo + 多 LLM 知识搜索。
多源并发查询，返回每源独立结果。
"""
import asyncio
import json
import httpx
from urllib.parse import urlparse
from config.settings import settings
from config.prompts import LLM_SEARCH_PROMPT


# ═══════ Brave Search ═══════

async def search_brave(query: str, count: int = 5, api_key: str = "") -> dict:
    """
    Brave Search API

    返回: { engine, engine_type, results: [...], assessment, confidence, reasoning }
    """
    key = api_key or settings.BRAVE_API_KEY
    engine_info = {"engine": "brave", "engine_type": "search"}

    if not key:
        return {**engine_info, "results": [], "assessment": "", "confidence": 0, "reasoning": "未配置 Brave API Key"}

    if len(query) > 200:
        query = query[:200]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": count},
                headers={
                    "Accept": "application/json",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                    "X-Subscription-Token": key,
                },
            )
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        print(f"[Ask Twice] Brave Search failed: {e}")
        return {**engine_info, "results": [], "assessment": "", "confidence": 0, "reasoning": f"搜索失败: {str(e)[:50]}"}

    results = []
    for item in data.get("web", {}).get("results", [])[:count]:
        parsed = urlparse(item.get("url", ""))
        results.append({
            "url": item.get("url", ""),
            "title": item.get("title", ""),
            "description": item.get("description", ""),
            "domain": parsed.netloc,
        })

    reasoning = f"找到 {len(results)} 条相关结果" if results else "未找到相关结果"
    return {**engine_info, "results": results, "assessment": "", "confidence": 0, "reasoning": reasoning}


# ═══════ DuckDuckGo Search ═══════

async def search_duckduckgo(query: str, count: int = 5) -> dict:
    """DuckDuckGo Instant Answer API"""
    engine_info = {"engine": "duckduckgo", "engine_type": "search"}

    if len(query) > 200:
        query = query[:200]

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_redirect": 1, "skip_disambig": 1},
                headers={"User-Agent": "AskTwice/0.1"},
            )
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        print(f"[Ask Twice] DuckDuckGo failed: {e}")
        return {**engine_info, "results": [], "assessment": "", "confidence": 0, "reasoning": f"搜索失败: {str(e)[:50]}"}

    results = []

    if data.get("AbstractURL") and data.get("Abstract"):
        parsed = urlparse(data["AbstractURL"])
        results.append({
            "url": data["AbstractURL"],
            "title": data.get("AbstractSource", data.get("Heading", "")),
            "description": data["Abstract"],
            "domain": parsed.netloc,
        })

    for topic in data.get("RelatedTopics", [])[:count]:
        if isinstance(topic, dict) and topic.get("FirstURL"):
            parsed = urlparse(topic["FirstURL"])
            results.append({
                "url": topic["FirstURL"],
                "title": topic.get("Text", "")[:80],
                "description": topic.get("Text", ""),
                "domain": parsed.netloc,
            })

    for r in data.get("Results", [])[:count]:
        if isinstance(r, dict) and r.get("FirstURL"):
            parsed = urlparse(r["FirstURL"])
            results.append({
                "url": r["FirstURL"],
                "title": r.get("Text", "")[:80],
                "description": r.get("Text", ""),
                "domain": parsed.netloc,
            })

    results = results[:count]
    reasoning = f"找到 {len(results)} 条相关结果" if results else "未找到相关结果"
    return {**engine_info, "results": results, "assessment": "", "confidence": 0, "reasoning": reasoning}


# ═══════ LLM 知识搜索 ═══════

async def search_llm(query: str, claim_text: str, llm_config: dict = None) -> dict:
    """利用 LLM 内置知识搜索"""
    from openai import AsyncOpenAI

    config = llm_config or {}
    base_url = config.get("base_url") or settings.OPENAI_BASE_URL
    api_key = config.get("api_key") or settings.OPENAI_API_KEY
    model = config.get("model") or settings.OPENAI_MODEL
    engine_name = f"llm:{model}"
    engine_info = {"engine": engine_name, "engine_type": "llm"}

    if not api_key:
        return {**engine_info, "results": [], "assessment": "uncertain", "confidence": 0, "reasoning": "未配置 API Key"}

    try:
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是一个严谨的事实核查助手。请仅返回有效的 JSON。"},
                {"role": "user", "content": LLM_SEARCH_PROMPT.format(claim_text=claim_text)},
            ],
            temperature=0.1,
            max_tokens=1500,
            timeout=15.0,
        )

        text = response.choices[0].message.content or ""
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if len(lines) > 2 else text
        text = text.strip("`").strip()

        data = json.loads(text)

        results = []
        for fact in data.get("facts", []):
            url = fact.get("source_url", "")
            domain = ""
            if url:
                try:
                    domain = urlparse(url).netloc
                except:
                    pass
            results.append({
                "url": url,
                "title": fact.get("source_name", ""),
                "description": fact.get("fact", ""),
                "domain": domain or fact.get("source_name", ""),
            })

        return {
            **engine_info,
            "results": results,
            "assessment": data.get("assessment", "uncertain"),
            "confidence": data.get("confidence", 50),
            "reasoning": data.get("reasoning", ""),
        }

    except Exception as e:
        print(f"[Ask Twice] LLM search failed ({model}): {e}")
        return {**engine_info, "results": [], "assessment": "uncertain", "confidence": 0, "reasoning": f"LLM 搜索失败: {str(e)[:50]}"}


# ═══════ 多源聚合搜索 ═══════

async def search_multi(
    query: str,
    claim_text: str = "",
    count: int = 5,
    brave_api_key: str = "",
    llm_configs: list[dict] = None,
) -> dict:
    """
    并发调用所有搜索源，返回每源独立结果。

    返回: {
        "per_source": [每源独立结果 dict],
        "all_results": [所有结果合并去重],
        "sources_used": ["brave", "duckduckgo", ...],
    }
    """
    tasks = [
        search_brave(query, count, brave_api_key),
        search_duckduckgo(query, count),
    ]

    configs = llm_configs or []
    if not configs:
        configs = [{"base_url": settings.OPENAI_BASE_URL, "api_key": settings.OPENAI_API_KEY, "model": settings.OPENAI_MODEL}]

    for cfg in configs:
        if cfg.get("api_key"):
            tasks.append(search_llm(query, claim_text or query, cfg))

    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    per_source = []
    all_results = []
    sources_used = []

    for r in raw_results:
        if isinstance(r, Exception):
            continue
        if not isinstance(r, dict):
            continue

        per_source.append(r)
        sources_used.append(r.get("engine", "unknown"))

        for item in r.get("results", []):
            all_results.append({**item, "source_engine": r.get("engine", "unknown")})

    # 去重
    seen_urls = set()
    deduped = []
    for item in all_results:
        url = item.get("url", "").rstrip("/")
        if url and url in seen_urls:
            continue
        if url:
            seen_urls.add(url)
        deduped.append(item)

    return {
        "per_source": per_source,
        "all_results": deduped[:count * 3],
        "sources_used": sources_used,
    }


# ═══════ 权威度评估 ═══════

def get_domain_authority(domain: str) -> int:
    """根据域名评估权威度（1-5）"""
    domain_lower = domain.lower()
    for score in [5, 4, 3, 2]:
        for pattern in settings.AUTHORITY_DOMAINS.get(score, []):
            if pattern.startswith("."):
                if domain_lower.endswith(pattern):
                    return score
            else:
                if pattern in domain_lower:
                    return score
    return 1
