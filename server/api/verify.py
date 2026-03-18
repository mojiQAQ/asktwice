"""
Ask Twice — 验证 API 路由（核心）

POST /api/verify

新流程：
1. 缓存检查
2. 声明分析（补全 + 拆分 + 领域识别）
3. 并发执行：来源验证 + 交叉验证 + 利益冲突检测
4. 综合评分（领域加权）
5. 缓存 + 返回
"""
import time
import asyncio
from fastapi import APIRouter, HTTPException

from models.request import VerifyRequest
from models.response import (
    VerifyResponse, ClaimResult, SourceInfo,
    ConflictResult, CrossCheckResult, VerifyMeta,
)
from services.claim_analyzer import analyze_claims
from services.source_verifier import verify_all_claims
from services.cross_verifier import cross_verify_all
from services.conflict_detector import detect_conflicts
from services.score_calculator import calculate_score
from utils.cache import cache

router = APIRouter()


@router.post("/verify", response_model=VerifyResponse)
async def verify(req: VerifyRequest):
    """
    核心验证接口（领域感知版）
    """
    start_time = time.time()
    llm_calls = 0
    search_calls = 0

    # 确定缓存 key 和分析文本
    selected = req.selected_text or req.text
    cache_key = selected

    # ── 1. 缓存检查 ──
    cached_result = cache.get(cache_key)
    if cached_result:
        cached_result["meta"]["cached"] = True
        return VerifyResponse(**cached_result)

    # ── 2. 声明分析（补全 + 拆分 + 领域识别）──
    conversation = [msg.model_dump() for msg in req.conversation] if req.conversation else []

    analyzed_claims = await analyze_claims(
        selected_text=selected,
        conversation=conversation,
        full_text=req.text,
    )
    llm_calls += 1

    if not analyzed_claims:
        # 没有可验证的声明
        response_data = {
            "overall_score": 50,
            "level": "needs_verification",
            "summary": "未提取到可验证的事实声明。所选内容可能是主观观点或修辞表达。",
            "claims": [],
            "conflicts": ConflictResult(),
            "meta": VerifyMeta(
                latency_ms=int((time.time() - start_time) * 1000),
                llm_calls=llm_calls,
                cached=False,
            ),
        }
        return VerifyResponse(**response_data)

    # ── 3. 并发执行：来源验证 + 交叉验证 + 利益冲突 ──
    async def _noop_conflict():
        return {"has_conflict": False, "commercial_links": [], "bias_score": 0, "details": ""}

    async def _noop_claims():
        return analyzed_claims

    async def _noop_cross():
        return []

    verify_task = verify_all_claims(analyzed_claims) if "source_verify" in req.features else _noop_claims()
    cross_task = cross_verify_all(analyzed_claims, conversation) if "cross_verify" in req.features else _noop_cross()
    conflict_task = detect_conflicts(req.text or selected) if "conflict_detect" in req.features else _noop_conflict()

    verified_claims, cross_results, conflict_result = await asyncio.gather(
        verify_task, cross_task, conflict_task
    )

    search_calls += len(analyzed_claims) if "source_verify" in req.features else 0
    llm_calls += 1 if "cross_verify" in req.features else 0
    llm_calls += 1 if "conflict_detect" in req.features else 0

    # ── 4. 综合评分（领域加权）──
    overall_score, level, summary = calculate_score(verified_claims, cross_results, conflict_result)

    # ── 5. 构建响应 ──
    claims_response = []
    for i, c in enumerate(verified_claims):
        sources = c.get("sources", [])
        sources_data = []
        for s in sources:
            if isinstance(s, SourceInfo):
                sources_data.append(s)
            elif isinstance(s, dict):
                sources_data.append(SourceInfo(**s))

        cross = cross_results[i] if i < len(cross_results) else {}

        claims_response.append(ClaimResult(
            id=i + 1,
            text=c.get("text", ""),
            original_text=selected,
            type=c.get("type", "claim"),
            domain=c.get("domain", ""),
            rigour=c.get("rigour", 5),
            evidence_type=c.get("evidence_type", "consensus"),
            score=c.get("score", 50),
            reason=c.get("reason", ""),
            sources=sources_data,
            cross_check=CrossCheckResult(**cross) if isinstance(cross, dict) and cross else CrossCheckResult(),
        ))

    elapsed_ms = int((time.time() - start_time) * 1000)

    response_data = {
        "overall_score": overall_score,
        "level": level,
        "summary": summary,
        "claims": claims_response,
        "conflicts": ConflictResult(**conflict_result) if isinstance(conflict_result, dict) else conflict_result,
        "meta": VerifyMeta(
            latency_ms=elapsed_ms,
            llm_calls=llm_calls,
            search_calls=search_calls,
            cached=False,
        ),
    }

    # ── 6. 缓存 ──
    cache.set(cache_key, {
        "overall_score": overall_score,
        "level": level,
        "summary": summary,
        "claims": [c.model_dump() for c in claims_response],
        "conflicts": conflict_result if isinstance(conflict_result, dict) else conflict_result.model_dump(),
        "meta": {"latency_ms": elapsed_ms, "llm_calls": llm_calls, "search_calls": search_calls, "cached": False},
    })

    return VerifyResponse(**response_data)
