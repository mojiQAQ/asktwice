"""
Ask Twice — 来源验证服务（多源分层版）

对每条 Claim 通过多源搜索，返回每源独立结果 + 合并评分。
"""
import asyncio
from utils.search import search_multi, get_domain_authority
from models.response import SourceInfo, SourceResult


# ── 评分参数 ──

def get_scoring_params(rigour: int) -> dict:
    if rigour >= 8:
        return {"no_source_score": 15, "min_authority": 4, "authority_weight": 0.70, "match_weight": 0.30, "high_score_threshold": 75}
    elif rigour >= 5:
        return {"no_source_score": 25, "min_authority": 3, "authority_weight": 0.60, "match_weight": 0.40, "high_score_threshold": 65}
    else:
        return {"no_source_score": 40, "min_authority": 2, "authority_weight": 0.40, "match_weight": 0.60, "high_score_threshold": 55}


async def verify_claim(
    claim: dict,
    brave_api_key: str = "",
    llm_configs: list[dict] = None,
) -> dict:
    """
    验证单条声明，返回每个搜索源的独立结果。
    """
    rigour = claim.get("rigour", 5)
    search_query = claim.get("search_query", claim["text"])
    params = get_scoring_params(rigour)

    # 多源搜索
    try:
        multi_result = await search_multi(
            query=search_query,
            claim_text=claim["text"],
            count=5,
            brave_api_key=brave_api_key,
            llm_configs=llm_configs,
        )
    except Exception as e:
        print(f"[Ask Twice] Multi-search failed: {e}")
        multi_result = {"per_source": [], "all_results": [], "sources_used": []}

    per_source = multi_result.get("per_source", [])
    all_results = multi_result.get("all_results", [])

    # ── 构建每源独立结果 ──
    source_results = []
    for src in per_source:
        engine = src.get("engine", "unknown")
        engine_type = src.get("engine_type", "search")
        src_results = src.get("results", [])

        # 对搜索源计算评分
        findings = []
        src_score = 0
        if src_results:
            for r in src_results:
                authority = get_domain_authority(r.get("domain", "")) if r.get("domain") else 1
                match_score = _calc_match_score(search_query, r.get("description", ""))
                findings.append(SourceInfo(
                    url=r.get("url", ""),
                    title=r.get("title", ""),
                    domain=r.get("domain", ""),
                    authority=authority,
                    match_score=match_score,
                ))

            # 搜索源评分
            if engine_type == "search":
                src_score = _calc_source_score(findings, params)
            else:
                # LLM 源用其 confidence 作为分数
                confidence = src.get("confidence", 50)
                assessment = src.get("assessment", "uncertain")
                if assessment == "correct":
                    src_score = max(60, confidence)
                elif assessment == "incorrect":
                    src_score = min(40, 100 - confidence)
                else:
                    src_score = 50
        else:
            src_score = params["no_source_score"] if engine_type == "search" else 0

        reasoning = src.get("reasoning", "")
        if engine_type == "search" and not reasoning:
            reasoning = f"找到 {len(src_results)} 条结果" if src_results else "未找到相关结果"

        source_results.append(SourceResult(
            engine=engine,
            engine_type=engine_type,
            score=src_score,
            result_count=len(src_results),
            assessment=src.get("assessment", ""),
            confidence=src.get("confidence", 0),
            reasoning=reasoning,
            findings=findings,
        ))

    # ── 合并所有源的来源（兼容旧结构）──
    all_sources = []
    for sr in source_results:
        all_sources.extend(sr.findings)

    # ── 综合评分（取各源最高分加权）──
    if source_results:
        scores = [sr.score for sr in source_results if sr.score > 0]
        if scores:
            best = max(scores)
            avg = sum(scores) / len(scores)
            # 多源一致加成
            n_with_results = sum(1 for sr in source_results if sr.result_count > 0 or sr.assessment)
            bonus = min(15, max(0, (n_with_results - 1) * 7))
            combined_score = int(best * 0.6 + avg * 0.4 + bonus)
            combined_score = max(0, min(100, combined_score))
        else:
            combined_score = params["no_source_score"]
    else:
        combined_score = params["no_source_score"]

    return {
        **claim,
        "score": combined_score,
        "reason": _generate_reason(source_results, claim, params),
        "sources": all_sources,
        "source_results": source_results,
        "sources_used": multi_result.get("sources_used", []),
    }


async def verify_all_claims(
    claims: list[dict],
    brave_api_key: str = "",
    llm_configs: list[dict] = None,
) -> list[dict]:
    """并发验证所有声明"""
    if not claims:
        return []
    tasks = [verify_claim(c, brave_api_key, llm_configs) for c in claims]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    verified = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            print(f"[Ask Twice] Claim verify error: {r}")
            verified.append({**claims[i], "score": 30, "sources": [], "source_results": [], "reason": "验证过程出现异常"})
        else:
            verified.append(r)
    return verified


def _calc_match_score(query: str, description: str) -> float:
    if not description or not query:
        return 0.0
    def get_bigrams(text):
        text = text.lower().strip()
        return {text[i:i+2] for i in range(len(text) - 1)} if len(text) >= 2 else {text}
    q_bi = get_bigrams(query)
    d_bi = get_bigrams(description)
    if not q_bi:
        return 0.0
    overlap = len(q_bi & d_bi)
    return min(1.0, overlap / max(len(q_bi) * 0.3, 1))


def _calc_source_score(sources: list[SourceInfo], params: dict) -> int:
    if not sources:
        return params.get("no_source_score", 25)
    aw, mw = params["authority_weight"], params["match_weight"]
    weighted = []
    for s in sources:
        auth_norm = min(1.0, 0.15 + s.authority * 0.17)
        weighted.append(auth_norm * aw + s.match_score * mw)
    best = max(weighted)
    avg = sum(weighted) / len(weighted)
    count_bonus = min(1.0, len(sources) / 3.0)
    raw = best * 0.5 + avg * 0.25 + count_bonus * 0.25
    return max(10, min(100, int(raw * 100)))


def _generate_reason(source_results: list[SourceResult], claim: dict, params: dict) -> str:
    domain = claim.get("domain", "通用")
    rigour = claim.get("rigour", 5)
    rigour_desc = "高严谨度" if rigour >= 8 else "中等严谨度" if rigour >= 5 else "一般"

    if not source_results:
        return f"未使用任何搜索源（{domain}领域，{rigour_desc}）"

    lines = []
    for sr in source_results:
        name = sr.engine.replace("llm:", "")
        if sr.engine_type == "search":
            if sr.result_count > 0:
                lines.append(f"🔍 {name}：找到 {sr.result_count} 条相关结果")
            else:
                lines.append(f"🔍 {name}：未找到相关结果")
        else:
            icon = "✅" if sr.assessment == "correct" else "❌" if sr.assessment == "incorrect" else "❓"
            lines.append(f"🤖 {name}：{icon} {sr.assessment or 'uncertain'}（置信度 {sr.confidence}%）")

    header = f"信息源验证（{domain}，{rigour_desc}）："
    return header + "\n" + "\n".join(lines)

