"""
RAG 服务配置 — 阿里云百炼 OpenAI 兼容模式 Responses API
"""
import os
from functools import lru_cache

from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:321738392@localhost:5432/smart_scale"

    # DashScope API (OpenAI 兼容模式)
    DASHSCOPE_API_KEY: str = ""
    TEXT_MODEL: str = "qwen3.7-flash-2026-07-15"
    VL_MODEL: str = "qwen3.7-flash-2026-07-15"
    OMNI_MODEL: str = "qwen3.7-flash-2026-07-15"  # 统一使用 qwen3.7-flash-2026-07-15
    EMBEDDING_MODEL: str = "qwen3.7-text-embedding"

    DASHSCOPE_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    SERVER_PORT: int = 8001
    SERVER_HOST: str = "0.0.0.0"

    SIMILARITY_THRESHOLD: float = 0.3
    TOP_K_DEFAULT: int = 5

    @property
    def responses_url(self) -> str:
        """Responses API — 支持 previous_response_id 多轮记忆"""
        return f"{self.DASHSCOPE_BASE_URL}/responses"

    @property
    def chat_completions_url(self) -> str:
        """Chat Completions API — 支持 enable_thinking 深度思考"""
        return f"{self.DASHSCOPE_BASE_URL}/chat/completions"

    @property
    def embeddings_url(self) -> str:
        return f"{self.DASHSCOPE_BASE_URL}/embeddings"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
