"""
Ask Twice — 数据模型（请求）
"""
from pydantic import BaseModel


class ConversationMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class LLMConfig(BaseModel):
    """用户自定义 LLM 配置"""
    base_url: str = ""
    api_key: str = ""
    model: str = ""


class VerifyRequest(BaseModel):
    text: str = ""  # AI 回答原文（兼容旧请求）
    selected_text: str = ""  # 用户选中的文字
    conversation: list[ConversationMessage] = []  # 对话历史
    platform: str = "unknown"  # 来源平台: doubao / chatgpt
    language: str = "zh"  # 语言: zh / en / auto
    depth: str = "standard"  # 深度: quick / standard / deep
    features: list[str] = ["source_verify", "conflict_detect", "cross_verify"]
    # 用户自定义配置（可选，前端传入）
    brave_api_key: str = ""  # 自定义 Brave Search API Key
    llm_configs: list[LLMConfig] = []  # 额外 LLM 模型列表

