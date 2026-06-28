"""
请求与响应的 Pydantic 数据模型
定义所有 API 接口的输入输出格式
"""
from datetime import date, datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field


# ==================== Embedding API ====================

class EmbeddingRequestItem(BaseModel):
    """待向量化的文本项"""
    text: str = Field(..., description="待向量化文本")
    metadata: Optional[dict] = Field(default=None, description="附加元数据")


class EmbeddingRequest(BaseModel):
    """向量化请求体"""
    texts: List[str] = Field(..., description="文本列表", min_length=1, max_length=20)
    user_id: int = Field(..., description="用户ID")
    source_type: str = Field(default="diet_summary", description="来源类型: diet_summary / medical_report / etc.")
    source_date: Optional[date] = Field(default=None, description="数据日期")


class EmbeddingResult(BaseModel):
    """单条向量化结果"""
    text_index: int
    text: str
    embedding_dim: int
    success: bool = True
    error: Optional[str] = None


class EmbeddingResponse(BaseModel):
    """向量化响应体"""
    success: bool
    message: str
    results: List[EmbeddingResult]
    stored_count: int = 0
    total_tokens_used: Optional[int] = None


# ==================== Retrieval API ====================

class RetrieveRequest(BaseModel):
    """向量检索请求体"""
    query_text: str = Field(..., description="查询文本")
    user_id: int = Field(..., description="用户ID")
    top_k: int = Field(default=5, ge=1, le=20, description="返回数量")
    source_type_filter: Optional[List[str]] = Field(default=None, description="来源类型过滤")
    similarity_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="相似度阈值")
    date_start: Optional[date] = Field(default=None, description="起始日期")
    date_end: Optional[date] = Field(default=None, description="结束日期")


class RetrievedRecord(BaseModel):
    """检索到的记录"""
    id: int
    user_id: int
    source_text: str
    source_type: str
    source_date: Optional[date]
    metadata: Optional[dict]
    created_at: datetime
    similarity: float = Field(description="余弦相似度, 范围 [0,1]")


class RetrieveResponse(BaseModel):
    """向量检索响应体"""
    query_text: str
    total_found: int
    records: List[RetrievedRecord]
    retrieval_time_ms: float


# ==================== Generate Advice API ====================

class CurrentSummary(BaseModel):
    """当前饮食摘要"""
    period: str = Field(default="", description="统计周期")
    avg_daily_calories: float = Field(0, description="平均每日热量(kcal)")
    avg_protein_g: float = Field(0, description="平均蛋白质(g)")
    avg_fat_g: float = Field(0, description="平均脂肪(g)")
    avg_carbs_g: float = Field(0, description="平均碳水化合物(g)")
    top_foods: List[str] = Field(default_factory=list, description="高频食物")
    cooking_methods_used: List[str] = Field(default_factory=list, description="烹饪方式")
    health_goals: List[str] = Field(default_factory=list, description="健康目标")


class UserProfile(BaseModel):
    """用户画像"""
    age: Optional[int] = None
    gender: Optional[str] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    health_goal: Optional[str] = None
    allergies: List[str] = Field(default_factory=list)
    medical_notes: Optional[str] = None
    activity_level: Optional[str] = None


class GenerateAdviceRequest(BaseModel):
    """生成健康建议请求体 - 核心RAG接口"""
    user_id: int = Field(..., description="用户ID")
    current_summary: CurrentSummary = Field(..., description="当前饮食摘要数据")
    user_profile: UserProfile = Field(default_factory=UserProfile, description="用户画像")
    advice_type: str = Field(default="weekly", description="建议类型: weekly / daily / meal")


class TokenUsage(BaseModel):
    """Token 用量信息"""
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None


class AdviceContext(BaseModel):
    """参考上下文"""
    retrieved_records: List[dict]
    record_count: int


class GenerateAdviceResponse(BaseModel):
    """生成健康建议响应体"""
    advice_id: str
    advice_type: str
    advice_content: str
    context: AdviceContext
    token_usage: Optional[TokenUsage] = None
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ==================== Parse Medical Report API ====================

class ParseMedicalReportRequest(BaseModel):
    """解析体检报告请求体"""
    image_url: Optional[str] = Field(None, description="图片URL")
    image_base64: Optional[str] = Field(None, description="Base64编码图片")
    extra_prompt: Optional[str] = Field(None, description="额外提示词")


class MedicalIndicator(BaseModel):
    """体检指标项"""
    name: str
    value: str
    unit: Optional[str] = None
    normal_range: Optional[str] = None
    status: Optional[str] = None  # normal / high / low / abnormal


class ParseMedicalReportResponse(BaseModel):
    """解析体检报告响应体"""
    report_date: Optional[str] = None
    indicators: List[MedicalIndicator] = Field(default_factory=list)
    summary_text: Optional[str] = None
    raw_json: Optional[Any] = None
    model_used: str = "qwen-vl-flash"


# ==================== Health Check API ====================

class HealthCheckResponse(BaseModel):
    """健康检查响应体"""
    status: str
    service: str = "rag-service"
    version: str = "1.0.0"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    database: Optional[dict] = None
    dashscope_connected: bool = False


# ==================== Chat API ====================

class ChatMessage(BaseModel):
    """单条聊天消息"""
    role: str = Field(..., description="消息角色: user / assistant")
    content: str = Field(..., description="消息内容")


class ChatRequest(BaseModel):
    """AI 对话请求体"""
    user_id: int = Field(..., description="用户ID")
    message: str = Field(..., description="本次用户消息")
    history: List[ChatMessage] = Field(default_factory=list, description="历史对话(不含本次消息)")
    mode: str = Field("fast", description="对话模式: fast(快速模式,简洁回复) / expert(专家模式,深度思考+详细回复)")


class ChatResponse(BaseModel):
    """AI 对话响应体"""
    reply: str = Field(..., description="AI 回复内容")
    model_used: str = "qwen-plus"
    generated_at: datetime = Field(default_factory=datetime.utcnow)
