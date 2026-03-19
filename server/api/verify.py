"""
Ask Twice — 验证 API 路由（多源分层版）

POST /api/verify

流程：
1. 缓存检查
2. 声明分析（补全 + 拆分 + 领域识别）
3. 并发：来源验证(多源) + 利益冲突检测
4. 交叉判断（综合所有源结果评定）
5. 综合评分
6. 缓存 + 返回
"""
import time
import asyncio
from fastapi import APIRouter, HTTPException

from models.request import VerifyRequest
from models.response import (
    VerifyResponse, ClaimResult, SourceInfo, SourceResult,
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
    start_time = time.time()
    llm_calls = 0
    search_calls = 0

    selected = req.selected_text or req.text
    cache_key = selected

    # 1. 缓存
    cached_result = cache.get(cache_key)
    if cached_result:
        cached_result["meta"]["cached"] = True
        return VerifyResponse(**cached_result)

    # 2. 声明分析
    conversation = [msg.model_dump() for msg in req.conversation] if req.conversation else []

    analyzed_claims = await analyze_claims(
        selected_text=selected,
        conversation=conversation,
        full_text=req.text,
    )
    llm_calls += 1

    if not analyzed_claims:
        response_data = {
            "overall_score": 50, "level": "needs_verification",
            "summary": "未提取到可验证的事实声明。", "judgment": "",
            "claims": [], "conflicts": ConflictResult(),
            "meta": VerifyMeta(latency_ms=int((time.time() - start_time) * 1000), llm_calls=llm_calls, cached=False),
        }
        return VerifyResponse(**response_data)

    # 3. 并发：来源验证 + 利益冲突
    user_brave_key = req.brave_api_key or ""
    user_llm_configs = [c.model_dump() for c in req.llm_configs] if req.llm_configs else None

    async def _noop_conflict():
        return {"has_conflict": False, "commercial_links": [], "bias_score": 0, "details": ""}

    async def _noop_claims():
        return analyzed_claims

    verify_task = verify_all_claims(analyzed_claims, user_brave_key, user_llm_configs) if "source_verify" in req.features else _noop_claims()
    conflict_task = detect_conflicts(req.text or selected) if "conflict_detect" in req.features else _noop_conflict()

    verified_claims, conflict_result = await asyncio.gather(verify_task, conflict_task)

    search_calls += len(analyzed_claims) if "source_verify" in req.features else 0
    llm_calls += 1 if "conflict_detect" in req.features else 0

    # 4. 交叉判断（综合所有源结果）
    cross_results = []
    if "cross_verify" in req.features:
        # 提取每条声明的 source_results
        per_claim_sr = [c.get("source_results", []) for c in verified_claims]
        cross_results = await cross_verify_all(verified_claims, per_claim_sr, conversation)
        llm_calls += len(verified_claims)

    # 5. 综合评分
    overall_score, level, summary = calculate_score(verified_claims, cross_results, conflict_result)

    # 提取综合判断文字（cross_verify 的 judgment 拼接）
    judgments = [cr.get("judgment", "") for cr in cross_results if cr.get("judgment")]
    judgment_text = " ".join(judgments) if judgments else summary

    # 6. 构建响应
    all_sources_used = set()
    claims_response = []
    for i, c in enumerate(verified_claims):
        # 来源
        sources_data = []
        for s in c.get("sources", []):
            if isinstance(s, SourceInfo):
                sources_data.append(s)
            elif isinstance(s, dict):
                sources_data.append(SourceInfo(**s))

        # 每源独立结果
        source_results_data = []
        for sr in c.get("source_results", []):
            if isinstance(sr, SourceResult):
                source_results_data.append(sr)
            elif isinstance(sr, dict):
                # 需要转换 findings
                findings = []
                for f in sr.get("findings", []):
                    if isinstance(f, SourceInfo):
                        findings.append(f)
                    elif isinstance(f, dict):
                        findings.append(SourceInfo(**f))
                sr_copy = {**sr, "findings": findings}
                source_results_data.append(SourceResult(**sr_copy))

        for su in c.get("sources_used", []):
            all_sources_used.add(su)

        # 交叉判断
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
            source_results=source_results_data,
            cross_check=CrossCheckResult(**{k: v for k, v in cross.items() if k in CrossCheckResult.model_fields}) if isinstance(cross, dict) and cross else CrossCheckResult(),
        ))

    elapsed_ms = int((time.time() - start_time) * 1000)

    response_data = {
        "overall_score": overall_score,
        "level": level,
        "summary": summary,
        "judgment": judgment_text,
        "claims": claims_response,
        "conflicts": ConflictResult(**conflict_result) if isinstance(conflict_result, dict) else conflict_result,
        "meta": VerifyMeta(
            latency_ms=elapsed_ms,
            llm_calls=llm_calls,
            search_calls=search_calls,
            sources_used=list(all_sources_used),
            cached=False,
        ),
    }

    # 缓存
    cache.set(cache_key, {
        "overall_score": overall_score,
        "level": level,
        "summary": summary,
        "judgment": judgment_text,
        "claims": [c.model_dump() for c in claims_response],
        "conflicts": conflict_result if isinstance(conflict_result, dict) else conflict_result.model_dump(),
        "meta": {"latency_ms": elapsed_ms, "llm_calls": llm_calls, "search_calls": search_calls, "sources_used": list(all_sources_used), "cached": False},
    })

    return VerifyResponse(**response_data)
