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
    sources: list[SourceInfo] = []
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
    cached: bool = False


class VerifyResponse(BaseModel):
    overall_score: int
    level: str  # high / needs_verification / low / unreliable
    summary: str = ""  # 总评分理由说明
    claims: list[ClaimResult] = []
    conflicts: ConflictResult = ConflictResult()
    meta: VerifyMeta = VerifyMeta()
