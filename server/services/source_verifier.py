"""
Ask Twice — 来源验证服务（领域感知版）

对每条 Claim 搜索来源并评估可信度。
根据领域严谨度和佐证类型动态调整评分标准。
"""
import asyncio
from utils.search import search_brave, get_domain_authority
from models.response import SourceInfo


# ── 评分参数（按严谨度分级）──

def get_scoring_params(rigour: int, evidence_type: str) -> dict:
    """根据严谨度和佐证类型返回动态评分参数"""
    if rigour >= 8:
        # 严谨类：医学、法律、金融
        return {
            "no_source_score": 15,
            "min_authority": 4,
            "authority_weight": 0.70,
            "match_weight": 0.30,
            "high_score_threshold": 75,
            "label": "strict",
        }
    elif rigour >= 5:
        # 中等：科学、工程、历史
        return {
            "no_source_score": 25,
            "min_authority": 3,
            "authority_weight": 0.60,
            "match_weight": 0.40,
            "high_score_threshold": 65,
            "label": "moderate",
        }
    else:
        # 宽松：生活建议、创意、主观
        return {
            "no_source_score": 40,
            "min_authority": 2,
            "authority_weight": 0.40,
            "match_weight": 0.60,
            "high_score_threshold": 55,
            "label": "lenient",
        }


async def verify_claim(claim: dict) -> dict:
    """
    验证单条声明的来源可信度（领域感知版）

    返回: claim dict 新增 "score", "reason", "sources" 字段
    """
    rigour = claim.get("rigour", 5)
    evidence_type = claim.get("evidence_type", "consensus")
    search_query = claim.get("search_query", claim["text"])
    params = get_scoring_params(rigour, evidence_type)

    # 搜索来源
    try:
        search_results = await search_brave(search_query, count=5)
    except Exception as e:
        print(f"[Ask Twice] 搜索失败: {e}")
        search_results = []

    if not search_results:
        return {
            **claim,
            "score": params["no_source_score"],
            "reason": f"未找到相关来源佐证此声明（{claim.get('domain', '通用')}领域需要{'权威来源' if rigour >= 8 else '可靠佐证'}）",
            "sources": [],
        }

    # 评估每个来源
    sources = []
    for r in search_results:
        authority = get_domain_authority(r["domain"])
        match_score = _calc_match_score(search_query, r.get("description", ""))
        sources.append(SourceInfo(
            url=r["url"],
            title=r["title"],
            domain=r["domain"],
            authority=authority,
            match_score=match_score,
        ))

    # 按领域参数计算分数
    score = _calc_claim_score(sources, params)

    # 生成理由
    reason = _generate_claim_reason(score, sources, claim, params)

    return {
        **claim,
        "score": score,
        "reason": reason,
        "sources": sources,
    }


async def verify_all_claims(claims: list[dict]) -> list[dict]:
    """并发验证所有声明"""
    if not claims:
        return []

    tasks = [verify_claim(c) for c in claims]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    verified = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            print(f"[Ask Twice] 声明验证异常: {r}")
            verified.append({**claims[i], "score": 30, "sources": [], "reason": "验证过程出现异常"})
        else:
            verified.append(r)

    return verified


def _calc_match_score(query: str, description: str) -> float:
    """文本匹配度计算（字符级 bigram 重叠率）"""
    if not description or not query:
        return 0.0

    def get_bigrams(text: str) -> set:
        text = text.lower().strip()
        return {text[i:i+2] for i in range(len(text) - 1)} if len(text) >= 2 else {text}

    query_bigrams = get_bigrams(query)
    desc_bigrams = get_bigrams(description)

    if not query_bigrams:
        return 0.0

    overlap = len(query_bigrams & desc_bigrams)
    return min(1.0, overlap / max(len(query_bigrams) * 0.3, 1))


def _calc_claim_score(sources: list[SourceInfo], params: dict) -> int:
    """根据来源质量和领域参数计算声明可信度评分"""
    if not sources:
        return params.get("no_source_score", 25)

    aw = params["authority_weight"]
    mw = params["match_weight"]

    weighted_scores = []
    for s in sources:
        # 权威度归一化：1→0.3, 2→0.45, 3→0.6, 4→0.8, 5→1.0
        auth_norm = 0.15 + s.authority * 0.17
        auth_norm = min(1.0, auth_norm)
        combined = auth_norm * aw + s.match_score * mw
        weighted_scores.append(combined)

    best_score = max(weighted_scores)
    avg_score = sum(weighted_scores) / len(weighted_scores)
    # 找到来源本身就是积极信号，给予基础分
    count_bonus = min(1.0, len(sources) / 3.0)

    raw = best_score * 0.5 + avg_score * 0.25 + count_bonus * 0.25

    return max(10, min(100, int(raw * 100)))


def _generate_claim_reason(score: int, sources: list, claim: dict, params: dict) -> str:
    """根据评分、来源和领域生成中文理由"""
    if not sources:
        return "未找到相关来源佐证此声明"

    total = len(sources)
    min_auth = params.get("min_authority", 3)
    domain = claim.get("domain", "通用")
    rigour = claim.get("rigour", 5)
    high_auth = sum(1 for s in sources if s.authority >= min_auth)
    top_domains = [s.domain for s in sorted(sources, key=lambda x: x.authority, reverse=True)[:2]]
    domains_str = "、".join(top_domains)

    rigour_desc = "高严谨度" if rigour >= 8 else "中等严谨度" if rigour >= 5 else "一般"

    if score >= params.get("high_score_threshold", 65):
        return f"找到 {total} 个来源支撑（{domains_str}），其中 {high_auth} 个满足{domain}领域（{rigour_desc}）的可信标准"
    elif score >= 50:
        if high_auth > 0:
            return f"找到 {total} 个来源（{domains_str}），{high_auth} 个达到{domain}领域要求，但匹配度一般"
        else:
            return f"找到 {total} 个来源（{domains_str}），但对于{domain}领域（{rigour_desc}），来源权威度偏低"
    elif score >= 30:
        return f"找到 {total} 个来源，但对于{domain}领域（{rigour_desc}），来源质量不足（{domains_str}）"
    else:
        return f"仅找到 {total} 个相关来源，且均不满足{domain}领域（{rigour_desc}）的可信标准"
