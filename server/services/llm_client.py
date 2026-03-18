"""
Ask Twice — LLM 客户端封装
"""
import json
from openai import AsyncOpenAI
from config.settings import settings


client = AsyncOpenAI(
    api_key=settings.OPENAI_API_KEY,
    base_url=settings.OPENAI_BASE_URL,
)


async def llm_chat(prompt: str, system: str = "", temperature: float = 0.2) -> str:
    """
    调用 LLM 获取文本响应
    """
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=2000,
    )

    return response.choices[0].message.content or ""


async def llm_json(prompt: str, system: str = "", temperature: float = 0.1) -> dict | list:
    """
    调用 LLM 获取 JSON 格式响应
    """
    full_system = (system + "\n\n" if system else "") + "请仅返回有效的 JSON，不要添加任何解释文字或 markdown 格式。"

    text = await llm_chat(prompt, system=full_system, temperature=temperature)

    # 清理可能的 markdown 代码块标记
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1]) if len(lines) > 2 else text
    text = text.strip("`").strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 尝试从文本中提取 JSON
        start = text.find("[") if "[" in text else text.find("{")
        end = text.rfind("]") + 1 if "]" in text else text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
        raise ValueError(f"LLM 返回的内容无法解析为 JSON: {text[:200]}")
