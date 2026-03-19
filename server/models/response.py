"""
Ask Twice — 数据模型（响应）
"""
from pydantic import BaseModel


class SourceInfo(BaseModel):
    url: str = ""
    title: str = ""
    domain: str = ""
    authority: int = 1  # 1-5
    match_score: float = 0.0  # 0-1


class SourceResult(BaseModel):
    """单个搜索源的独立结果"""
    engine: str = ""          # 搜索源名称：brave / duckduckgo / llm:gpt-4o-mini
    engine_type: str = ""     # 类型：search / llm
    score: int = 0            # 该源评分 0-100
    result_count: int = 0     # 返回结果数
    assessment: str = ""      # LLM 源专用：correct / incorrect / uncertain
    confidence: int = 0       # LLM 源专用：置信度 0-100
    reasoning: str = ""       # LLM 源的推理过程 / 搜索源的摘要
    findings: list[SourceInfo] = []  # 该源找到的具体来源列表


class CrossCheckResult(BaseModel):
    agrees: bool = True             # LLM 是否认同该声明
    confidence: int = 50            # 置信度 0-100
    correction: str = ""            # 如果不认同，正确说法
    reasoning: str = ""             # 推理过程


class ClaimResult(BaseModel):
    id: int
    text: str                       # 补全后的完整声明
    original_text: str = ""         # 用户原始选中文字
    type: str = "fact"              # statistic / fact / quote / claim
    domain: str = ""                # 领域（如"临床医学-泌尿科"）
    rigour: int = 5                 # 严谨度 1-10
    evidence_type: str = "consensus"  # authoritative/empirical/consensus/subjective
    score: int = 50
    reason: str = ""                # 评分理由
    sources: list[SourceInfo] = []  # 保留兼容（所有源合并）
    source_results: list[SourceResult] = []  # 每个源的独立结果
    cross_check: CrossCheckResult = CrossCheckResult()


class ConflictResult(BaseModel):
    has_conflict: bool = False
    commercial_links: list[str] = []
    bias_score: int = 0  # 0-100
    details: str = ""


class VerifyMeta(BaseModel):
    latency_ms: int = 0
    llm_calls: int = 0
    search_calls: int = 0
    sources_used: list[str] = []   # 用了哪些搜索源
    cached: bool = False


class VerifyResponse(BaseModel):
    overall_score: int
    level: str  # high / needs_verification / low / unreliable
    summary: str = ""             # 简短总结
    judgment: str = ""            # 交叉判断模型的综合评定（红框内容）
    claims: list[ClaimResult] = []
    conflicts: ConflictResult = ConflictResult()
    meta: VerifyMeta = VerifyMeta()
