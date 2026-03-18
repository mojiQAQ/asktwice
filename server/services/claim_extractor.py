"""
Ask Twice — 声明提取服务

从 AI 回答文本中提取可验证的事实性声明（Claims）。
"""
from services.llm_client import llm_json

EXTRACTION_PROMPT = """
你是一个事实核查助手。请从以下 AI 生成的回答中，提取所有可验证的事实性声明。

要求：
1. 只提取客观事实声明（具体数据、日期、人名、事件、统计数据），忽略主观观点和修辞表达
2. 每条声明应独立、完整、可通过搜索引擎验证
3. 最多提取 8 条最重要的声明
4. 如果回答中没有可验证的事实声明，返回空数组

AI 回答：
{text}

返回 JSON 数组：
[
  {{"text": "具体的事实声明内容", "type": "statistic|fact|quote|claim"}}
]

type 说明：
- statistic: 包含具体数字/百分比/金额的统计数据
- fact: 可验证的事实陈述（日期、地点、人物、事件）
- quote: 引述某人或某机构说的话
- claim: 其他可验证的声明
"""


async def extract_claims(text: str) -> list[dict]:
    """
    从 AI 回答中提取事实性声明

    返回: [{"text": "...", "type": "..."}]
    """
    if len(text) < 30:
        return []

    # 截断过长文本
    truncated = text[:3000] if len(text) > 3000 else text

    try:
        result = await llm_json(
            EXTRACTION_PROMPT.format(text=truncated),
            system="你是一个精确的事实提取工具。",
        )

        if isinstance(result, list):
            # 过滤无效结果
            claims = []
            for i, item in enumerate(result[:8]):
                if isinstance(item, dict) and item.get("text"):
                    claims.append({
                        "text": str(item["text"]).strip(),
                        "type": item.get("type", "claim"),
                    })
            return claims

        return []

    except Exception as e:
        print(f"[Ask Twice] 声明提取失败: {e}")
        return []
