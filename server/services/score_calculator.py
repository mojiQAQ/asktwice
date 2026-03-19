"""
Ask Twice — 综合评分计算服务（领域感知版）

根据来源验证、交叉验证和利益冲突结果，
按领域严谨度加权计算综合评分。
"""


def calculate_score(
    claims: list[dict],
    cross_results: list[dict],
    conflicts: dict,
) -> tuple[int, str, str]:
    """
    综合评分计算。

    参数:
        claims: 各条声明的验证结果（含 score, rigour, evidence_type）
        cross_results: 各条声明的交叉验证结果
        conflicts: 利益冲突检测结果

    返回: (overall_score, level, summary)
    """
    reasons = []

    if not claims:
        return 50, "needs_verification", "未提取到可验证的事实声明，给予中间评分。"

    # ── 1. 各声明的综合得分（来源 + 交叉加权）──
    claim_final_scores = []
    claim_details = []

    for i, c in enumerate(claims):
        source_score = c.get("score", 50)
        rigour = c.get("rigour", 5)
        evidence_type = c.get("evidence_type", "consensus")
        domain = c.get("domain", "通用")
        has_sources = bool(c.get("sources"))

        # 交叉验证分数
        cross = cross_results[i] if i < len(cross_results) else {}
        cross_agrees = cross.get("agrees", True)
        cross_confidence = cross.get("confidence", 50)

        # 交叉验证转分数：同意=高分，不同意=低分
        if cross_agrees:
            cross_score = 60 + cross_confidence * 0.4  # 60-100
        else:
            cross_score = max(10, 50 - cross_confidence * 0.4)  # 10-50

        # 根据 evidence_type 调整搜索/交叉的权重
        weights = _get_blend_weights(evidence_type)

        # 当搜索无结果时，大幅提升交叉验证权重
        # （避免搜索引擎覆盖不足导致误判）
        if not has_sources:
            weights = {"search": 0.15, "cross": 0.85}

        blended = source_score * weights["search"] + cross_score * weights["cross"]
        blended = max(0, min(100, int(blended)))

        # 交叉验证保底：当交叉验证明确通过且置信度较高时，
        # 最终分数不应低于 55（"待验证"而非"不可信"）
        if cross_agrees and cross_confidence >= 60 and blended < 55:
            blended = 55

        claim_final_scores.append({
            "score": blended,
            "rigour": rigour,
            "domain": domain,
        })

        # 收集详情
        status = "✓" if blended >= 60 else "△" if blended >= 40 else "✗"
        claim_details.append(f"{status} {domain}（{blended}分）")

    # ── 2. 按严谨度加权平均 ──
    total_weight = sum(c["rigour"] for c in claim_final_scores)
    if total_weight == 0:
        total_weight = 1

    weighted_sum = sum(c["score"] * c["rigour"] for c in claim_final_scores)
    base_score = weighted_sum / total_weight

    # ── 3. 利益冲突惩罚 ──
    if conflicts.get("has_conflict"):
        bias = conflicts.get("bias_score", 50)
        penalty = bias * 0.3
        base_score -= penalty
        reasons.append(f"检测到利益冲突倾向（偏差 {bias}），可能影响客观性")

    # ── 4. 最终分数和等级 ──
    overall = max(0, min(100, int(base_score)))

    if overall >= 80:
        level = "high"
        level_desc = "高可信"
    elif overall >= 60:
        level = "needs_verification"
        level_desc = "待验证"
    elif overall >= 40:
        level = "low"
        level_desc = "低可信"
    else:
        level = "unreliable"
        level_desc = "不可信"

    # ── 5. 生成综合判断分析 ──
    n = len(claims)
    good = sum(1 for c in claim_final_scores if c["score"] >= 60)

    # 将各来源和交叉验证的信息融合为分析文本
    analysis_parts = []

    for i, c in enumerate(claims):
        domain = c.get("domain", "通用")
        rigour = c.get("rigour", 5)
        sources_info = c.get("sources", [])
        cross = cross_results[i] if i < len(cross_results) else {}

        # 来源分析
        if sources_info:
            src_count = len(sources_info)
            # 获取权威度最高的来源们
            if hasattr(sources_info[0], 'authority'):
                top_srcs = sorted(sources_info, key=lambda s: s.authority, reverse=True)
                top_names = [s.title[:20] for s in top_srcs[:2] if s.title]
            else:
                top_names = []
            src_names = "、".join(top_names) if top_names else f"{src_count} 个来源"
            analysis_parts.append(f"经 {src_names} 等 {src_count} 个信息源核实")
        else:
            analysis_parts.append("未找到直接佐证来源")

        # 交叉验证分析
        cross_reasoning = cross.get("reasoning", "")
        cross_agrees = cross.get("agrees", True)
        cross_conf = cross.get("confidence", 50)

        if cross_reasoning:
            # 用交叉验证的推理作为核心判断
            if len(cross_reasoning) > 150:
                cross_reasoning = cross_reasoning[:147] + "..."
            if cross_agrees:
                analysis_parts.append(f"交叉验证认为：{cross_reasoning}")
            else:
                correction = cross.get("correction", "")
                if correction:
                    analysis_parts.append(f"交叉验证存疑：{cross_reasoning}。建议修正：{correction[:80]}")
                else:
                    analysis_parts.append(f"交叉验证存疑：{cross_reasoning}")

    # 领域严谨度提示
    if n == 1:
        c0 = claim_final_scores[0]
        domain_note = f"（{c0['domain']}领域，严谨度 {c0['rigour']}/10）"
    else:
        domain_note = f"（涉及 {n} 个要点）"

    # 清理末尾句号后再拼接，避免 。。
    analysis_text = "。".join(p.rstrip("。.") for p in analysis_parts if p)
    summary = analysis_text + "。" + domain_note

    return overall, level, summary


def _get_blend_weights(evidence_type: str) -> dict:
    """根据佐证类型返回搜索/交叉验证的权重"""
    return {
        "authoritative": {"search": 0.70, "cross": 0.30},
        "empirical":     {"search": 0.60, "cross": 0.40},
        "consensus":     {"search": 0.40, "cross": 0.60},
        "subjective":    {"search": 0.20, "cross": 0.80},
    }.get(evidence_type, {"search": 0.50, "cross": 0.50})
