"""
Ask Twice — 搜索 API 封装（Brave Search）
"""
import httpx
from urllib.parse import urlparse
from config.settings import settings


async def search_brave(query: str, count: int = 5) -> list[dict]:
    """
    使用 Brave Search API 搜索

    返回: [{ url, title, description, domain }]
    """
    if not settings.BRAVE_API_KEY:
        # 没有 API Key 时返回空结果（开发模式）
        return []

    # 截断过长查询（Brave 限制约 400 字符）
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
                    "X-Subscription-Token": settings.BRAVE_API_KEY,
                },
            )
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        print(f"[Ask Twice] Brave Search 请求失败: {e}")
        return []

    results = []
    for item in data.get("web", {}).get("results", [])[:count]:
        parsed = urlparse(item.get("url", ""))
        results.append({
            "url": item.get("url", ""),
            "title": item.get("title", ""),
            "description": item.get("description", ""),
            "domain": parsed.netloc,
        })

    return results


def get_domain_authority(domain: str) -> int:
    """
    根据域名评估权威度（1-5）
    """
    domain_lower = domain.lower()

    for score in [5, 4, 3, 2]:
        for pattern in settings.AUTHORITY_DOMAINS.get(score, []):
            if pattern.startswith("."):
                # 顶级域名匹配
                if domain_lower.endswith(pattern):
                    return score
            else:
                # 完整域名匹配
                if pattern in domain_lower:
                    return score

    return 1  # 默认未知来源
