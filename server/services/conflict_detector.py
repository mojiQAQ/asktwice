"""
Ask Twice — 利益冲突检测服务

检测 AI 回答中的商业推荐和利益冲突。
"""
import re
from services.llm_client import llm_json

# 商业链接和推销关键词
COMMERCIAL_URL_PATTERNS = [
    r"mall\.douyin\.com",
    r"item\.jd\.com", r"jd\.com/product",
    r"item\.taobao\.com", r"detail\.tmall\.com",
    r"mobile\.yangkeduo\.com",  # 拼多多
    r"union\.click",  # 联盟链接
    r"s\.click",
    r"affiliate",
]

COMMERCIAL_KEYWORDS = [
    "点击购买", "立即下单", "限时优惠", "独家折扣", "优惠券",
    "限时特价", "抢购", "秒杀", "满减", "折扣码",
    "官方旗舰店", "天猫旗舰", "京东自营",
]

# LLM 利益冲突分析 Prompt
CONFLICT_PROMPT = """
分析以下 AI 回答是否存在商业推荐倾向或利益冲突：

判断维度：
1. 品牌/产品推荐是否异常突出？（对某品牌描述明显更正面或篇幅更长）
2. 推荐是否附带客观理由和替代方案？
3. 语气是否过度正面或推销化？（"强烈推荐"、"首选"、"No.1"）
4. 是否包含购买引导或商业链接？

AI 回答：
{text}

返回 JSON：
{{
  "has_conflict": true/false,
  "bias_score": 0-100 的数字（0=完全客观，100=明显推销）,
  "details": "简要分析说明（1-2句话）"
}}
"""


async def detect_conflicts(text: str) -> dict:
    """
    检测 AI 回答中的利益冲突

    返回: {"has_conflict", "commercial_links", "bias_score", "details"}
    """
    result = {
        "has_conflict": False,
        "commercial_links": [],
        "bias_score": 0,
        "details": "",
    }

    # ── Layer 1: 关键词快速扫描 ──
    # 检测商业链接
    for pattern in COMMERCIAL_URL_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            # 提取完整 URL
            urls = re.findall(r'https?://[^\s\'"<>]+' + pattern.split(r"\.")[0] + r'[^\s\'"<>]*', text)
            result["commercial_links"].extend(urls[:5])

    # 检测推销关键词
    keyword_hits = [kw for kw in COMMERCIAL_KEYWORDS if kw in text]

    if result["commercial_links"] or len(keyword_hits) >= 2:
        result["has_conflict"] = True
        result["bias_score"] = min(90, 40 + len(keyword_hits) * 10 + len(result["commercial_links"]) * 20)
        result["details"] = f"检测到{'商业链接' if result['commercial_links'] else ''}{'和' if result['commercial_links'] and keyword_hits else ''}{'推销关键词' if keyword_hits else ''}"
        return result

    # ── Layer 2: LLM 深度分析（关键词未命中时） ──
    try:
        truncated = text[:2000] if len(text) > 2000 else text
        llm_result = await llm_json(
            CONFLICT_PROMPT.format(text=truncated),
            system="你是一个客观的利益冲突检测工具。",
        )

        if isinstance(llm_result, dict):
            result["has_conflict"] = bool(llm_result.get("has_conflict", False))
            result["bias_score"] = int(llm_result.get("bias_score", 0))
            result["details"] = str(llm_result.get("details", ""))

    except Exception as e:
        print(f"[Ask Twice] LLM 冲突检测失败: {e}")
        # 保守处理：不误报
        result["has_conflict"] = False

    return result
