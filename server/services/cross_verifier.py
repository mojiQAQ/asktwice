"""
Ask Twice — LLM 交叉验证服务

"Ask Twice" 的核心理念：用另一次独立 LLM 调用验证声明是否正确。
不给它看原始 AI 回答，只给用户问题和要验证的声明。
"""
from services.llm_client import llm_json


CROSS_VERIFY_PROMPT = """你是一个独立的事实核查专家。请判断以下声明是否正确。

## 背景
用户的原始问题：{user_question}

## 要验证的声明
{claim_text}

## 该声明所属领域
{domain}

## 要求
请基于你的知识独立判断这个声明是否正确。不要假设它是对的。

如果你不确定，请诚实说明你不确定的原因。

返回 JSON:
{{
  "agrees": true或false（你是否认同这个声明基本正确）,
  "confidence": 0-100的整数（你对自己判断的置信度，100=完全确定，0=完全不确定）,
  "correction": "如果不认同，正确的说法是什么；如果认同则留空",
  "reasoning": "简要的推理过程（1-2句话）"
}}
"""


def _extract_user_question(conversation: list) -> str:
    """从对话历史中提取用户的原始问题"""
    if not conversation:
        return "（未知）"

    # 从后往前找最近的用户消息
    for msg in reversed(conversation):
        role = msg.get("role", "") if isinstance(msg, dict) else msg.role
        content = msg.get("content", "") if isinstance(msg, dict) else msg.content
        if role == "user" and content.strip():
            return content[:500]

    return "（未知）"


async def cross_verify(claim: dict, conversation: list = None) -> dict:
    """
    用 LLM 独立验证声明是否正确。

    参数:
        claim: 包含 text, domain 等的声明 dict
        conversation: 对话历史

    返回: {"agrees", "confidence", "correction", "reasoning"}
    """
    claim_text = claim.get("text", "")
    domain = claim.get("domain", "通用")

    if not claim_text:
        return {
            "agrees": True,
            "confidence": 0,
            "correction": "",
            "reasoning": "无声明内容",
        }

    user_question = _extract_user_question(conversation)

    try:
        result = await llm_json(
            CROSS_VERIFY_PROMPT.format(
                user_question=user_question,
                claim_text=claim_text,
                domain=domain,
            ),
            system="你是一个严谨的独立事实核查专家。请基于你的知识独立判断，不要盲目认同。",
            temperature=0.3,  # 稍高温度鼓励独立思考
        )

        if isinstance(result, dict):
            return {
                "agrees": bool(result.get("agrees", True)),
                "confidence": max(0, min(100, int(result.get("confidence", 50)))),
                "correction": str(result.get("correction", "")),
                "reasoning": str(result.get("reasoning", "")),
            }

        return {"agrees": True, "confidence": 30, "correction": "", "reasoning": "LLM 返回格式异常"}

    except Exception as e:
        print(f"[Ask Twice] 交叉验证失败: {e}")
        return {
            "agrees": True,
            "confidence": 0,
            "correction": "",
            "reasoning": f"交叉验证异常: {str(e)[:50]}",
        }


async def cross_verify_all(claims: list[dict], conversation: list = None) -> list[dict]:
    """
    并发验证多条声明。
    """
    import asyncio

    if not claims:
        return []

    tasks = [cross_verify(c, conversation) for c in claims]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    verified = []
    for r in results:
        if isinstance(r, Exception):
            verified.append({"agrees": True, "confidence": 0, "correction": "", "reasoning": "异常"})
        else:
            verified.append(r)

    return verified
