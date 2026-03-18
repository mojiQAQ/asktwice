"""
Ask Twice — 声明分析服务（合并声明理解 + 领域识别）

从用户选中的文字和对话上下文中：
1. 补全选中内容为完整语义
2. 拆分多个独立声明（如有）
3. 识别每条声明的领域和严谨度
"""
from services.llm_client import llm_json


ANALYSIS_PROMPT = """你是一个专业的事实核查分析助手。

## 任务
用户在阅读一段 AI 回答后，选中了其中一段文字要求验证其可信度。请基于对话上下文分析选中内容。

## 对话历史
{conversation}

## 用户选中的文字
{selected_text}

## 要求
1. **补全**：用户选中时可能漏了几个字，请结合上下文将选中内容还原为完整、通顺的表述
2. **提取主旨**：从选中内容中提炼出关键的事实性要点（key factual points），而不是把句子拆成碎片。每个要点应该是一个独立的、可验证的核心论断。例如"乌鲁鲁位于澳大利亚北领地，是世界自然与文化双重遗产"应提炼为一个整体要点，而不是拆成"位于澳大利亚"、"在北领地"、"是双重遗产"三个碎片。
3. **领域判断**：对每条要点判断所属知识领域和验证标准

## 返回 JSON
{{
  "claims": [
    {{
      "text": "补全后的完整声明（保持用户选中内容的完整性，仅做语义补全）",
      "type": "statistic|fact|quote|claim",
      "domain": "知识领域（精确到子领域，如'临床医学-泌尿科'、'中国税法-个税'）",
      "rigour": 1-10的整数（该领域对事实准确性的要求，10=极严谨如医学用药，1=纯主观如审美偏好）,
      "evidence_type": "authoritative|empirical|consensus|subjective",
      "search_query": "最适合用于搜索引擎验证此声明的查询词"
    }}
  ]
}}

## evidence_type 说明
- **authoritative**: 需要权威机构/学术论文/官方数据佐证（医学、法律、金融）
- **empirical**: 需要实证数据/实验结果/统计数据（科学、工程）
- **consensus**: 社区共识/行业惯例/多数专家意见即可（编程最佳实践、生活技巧）
- **subjective**: 主观性强，无客观标准（审美、个人偏好、创意）

## 注意
- 通常一句话只需要输出 1 条完整声明，除非选中内容明确包含多个完全不同领域的论断
- 如果选中内容不包含任何可验证的事实声明（纯观点或修辞），返回空 claims 数组
- search_query 要精炼，适合搜索引擎，不要太长
"""


def _format_conversation(conversation: list[dict]) -> str:
    """格式化对话历史"""
    if not conversation:
        return "（无对话历史）"

    lines = []
    for msg in conversation[-10:]:  # 最多取最近 10 条（5 轮对话）
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        if isinstance(msg, dict):
            pass
        else:
            # Pydantic model
            role = msg.role
            content = msg.content
        # 截断过长的单条消息
        if len(content) > 1500:
            content = content[:1500] + "...(截断)"
        role_label = "用户" if role == "user" else "AI"
        lines.append(f"【{role_label}】{content}")

    return "\n\n".join(lines)


async def analyze_claims(selected_text: str, conversation: list = None, full_text: str = "") -> list[dict]:
    """
    分析用户选中的文字，补全、拆分并识别领域。

    参数:
        selected_text: 用户选中的文字
        conversation: 对话历史
        full_text: 完整的 AI 回答（兼容旧请求）

    返回: [{"text", "type", "domain", "rigour", "evidence_type", "search_query"}]
    """
    # 确定要分析的文本
    text_to_analyze = selected_text or full_text
    if not text_to_analyze or len(text_to_analyze) < 5:
        return []

    # 构建上下文
    if conversation:
        conv_str = _format_conversation(conversation)
    elif full_text:
        conv_str = f"【AI】{full_text[:3000]}"
    else:
        conv_str = "（无对话历史）"

    try:
        result = await llm_json(
            ANALYSIS_PROMPT.format(
                conversation=conv_str,
                selected_text=text_to_analyze[:1000],
            ),
            system="你是一个精确的事实分析工具，擅长识别声明的知识领域和验证标准。",
        )

        if isinstance(result, dict) and "claims" in result:
            claims = result["claims"]
        elif isinstance(result, list):
            claims = result
        else:
            return []

        # 验证和清洗
        validated = []
        for item in claims[:3]:
            if not isinstance(item, dict) or not item.get("text"):
                continue
            validated.append({
                "text": str(item["text"]).strip(),
                "type": item.get("type", "claim"),
                "domain": item.get("domain", "通用"),
                "rigour": max(1, min(10, int(item.get("rigour", 5)))),
                "evidence_type": item.get("evidence_type", "consensus")
                    if item.get("evidence_type") in ("authoritative", "empirical", "consensus", "subjective")
                    else "consensus",
                "search_query": item.get("search_query", item["text"][:80]),
            })

        return validated

    except Exception as e:
        print(f"[Ask Twice] 声明分析失败: {e}")
        # 降级：直接使用选中文字作为单条声明
        return [{
            "text": text_to_analyze[:200],
            "type": "claim",
            "domain": "通用",
            "rigour": 5,
            "evidence_type": "consensus",
            "search_query": text_to_analyze[:80],
        }]
