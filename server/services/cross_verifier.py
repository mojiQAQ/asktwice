"""
Ask Twice — 交叉判断模型（综合多源结果评定）

接收所有搜索源的独立结果，由一个独立 LLM 综合评定声明可信度。
Prompt 由系统后台配置（config/prompts.py）。
"""
from services.llm_client import llm_json
from config.prompts import JUDGMENT_PROMPT


def _format_source_results(source_results: list) -> str:
    """将各源结果格式化为文本，供交叉判断 Prompt 使用"""
    if not source_results:
        return "（无搜索结果）"

    parts = []
    for i, sr in enumerate(source_results):
        engine = sr.engine if hasattr(sr, 'engine') else sr.get("engine", "unknown")
        engine_type = sr.engine_type if hasattr(sr, 'engine_type') else sr.get("engine_type", "search")
        result_count = sr.result_count if hasattr(sr, 'result_count') else sr.get("result_count", 0)
        reasoning = sr.reasoning if hasattr(sr, 'reasoning') else sr.get("reasoning", "")
        assessment = sr.assessment if hasattr(sr, 'assessment') else sr.get("assessment", "")
        confidence = sr.confidence if hasattr(sr, 'confidence') else sr.get("confidence", 0)
        findings = sr.findings if hasattr(sr, 'findings') else sr.get("findings", [])

        part = f"### 信息源 {i+1}: {engine}"
        if engine_type == "llm":
            part += f"\n- 类型: LLM 知识验证"
            part += f"\n- 评估: {assessment}（置信度 {confidence}%）"
            if reasoning:
                part += f"\n- 推理: {reasoning}"
        else:
            part += f"\n- 类型: 搜索引擎"
            part += f"\n- 结果数: {result_count}"

        if findings:
            part += "\n- 找到的来源:"
            for f in findings[:3]:
                title = f.title if hasattr(f, 'title') else f.get("title", "")
                domain = f.domain if hasattr(f, 'domain') else f.get("domain", "")
                desc = f.description if hasattr(f, 'description') else f.get("description", "")
                if not desc:
                    desc = title
                part += f"\n  - [{domain}] {title}: {str(desc)[:100]}"

        if not findings and reasoning:
            part += f"\n- 说明: {reasoning}"

        parts.append(part)

    return "\n\n".join(parts)


def _extract_user_question(conversation: list) -> str:
    """从对话历史中提取用户的原始问题"""
    if not conversation:
        return "（未知）"
    for msg in reversed(conversation):
        role = msg.get("role", "") if isinstance(msg, dict) else msg.role
        content = msg.get("content", "") if isinstance(msg, dict) else msg.content
        if role == "user" and content.strip():
            return content[:500]
    return "（未知）"


async def cross_verify(claim: dict, source_results: list, conversation: list = None) -> dict:
    """
    综合判断模型：接收所有源的结果，给出最终判断。

    参数:
        claim: 声明 dict
        source_results: 所有搜索源的独立结果 list
        conversation: 对话历史

    返回: {"agrees", "confidence", "correction", "reasoning", "judgment"}
    """
    claim_text = claim.get("text", "")
    domain = claim.get("domain", "通用")
    rigour = claim.get("rigour", 5)

    if not claim_text:
        return {"agrees": True, "confidence": 0, "correction": "", "reasoning": "无声明内容", "judgment": ""}

    user_question = _extract_user_question(conversation)
    source_results_text = _format_source_results(source_results)

    try:
        result = await llm_json(
            JUDGMENT_PROMPT.format(
                user_question=user_question,
                claim_text=claim_text,
                domain=domain,
                rigour=rigour,
                source_results_text=source_results_text,
            ),
            system="你是 Ask Twice 的交叉判断专家。综合所有信息源的结果，给出客观公正的最终判断。请仅返回有效的 JSON。",
            temperature=0.2,
        )

        if isinstance(result, dict):
            return {
                "agrees": bool(result.get("agrees", True)),
                "confidence": max(0, min(100, int(result.get("confidence", 50)))),
                "correction": str(result.get("correction", "")),
                "reasoning": str(result.get("reasoning", "")),
                "judgment": str(result.get("judgment", "")),
            }

        return {"agrees": True, "confidence": 30, "correction": "", "reasoning": "LLM 返回格式异常", "judgment": ""}

    except Exception as e:
        print(f"[Ask Twice] Cross-verify failed: {e}")
        return {"agrees": True, "confidence": 0, "correction": "", "reasoning": f"交叉验证异常: {str(e)[:50]}", "judgment": ""}


async def cross_verify_all(claims: list[dict], per_claim_source_results: list[list], conversation: list = None) -> list[dict]:
    """
    并发对所有声明进行交叉判断。

    参数:
        claims: 声明列表
        per_claim_source_results: 每条声明对应的搜索源结果列表
        conversation: 对话历史
    """
    import asyncio

    if not claims:
        return []

    tasks = []
    for i, c in enumerate(claims):
        sr = per_claim_source_results[i] if i < len(per_claim_source_results) else []
        tasks.append(cross_verify(c, sr, conversation))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    verified = []
    for r in results:
        if isinstance(r, Exception):
            verified.append({"agrees": True, "confidence": 0, "correction": "", "reasoning": "异常", "judgment": ""})
        else:
            verified.append(r)

    return verified
