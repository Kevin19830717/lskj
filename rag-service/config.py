"""
RAG 服务配置模块
使用 pydantic-settings 加载环境变量
"""
import os
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()


class Settings(BaseSettings):
    """应用全局配置"""

    # 数据库连接
    DATABASE_URL: str = "postgresql://postgres:321738392@localhost:5432/smart_scale"

    # DashScope API
    DASHSCOPE_API_KEY: str = ""
    TEXT_MODEL: str = "qwen-plus"
    VL_MODEL: str = "qwen-vl-flash"
    EMBEDDING_MODEL: str = "text-embedding-v2"
    DASHSCOPE_BASE_URL: str = "https://dashscope.aliyuncs.com/api/v1/services"

    # 服务端口
    SERVER_PORT: int = 8001
    SERVER_HOST: str = "0.0.0.0"

    # 检索参数
    SIMILARITY_THRESHOLD: float = 0.3
    TOP_K_DEFAULT: int = 5

    @property
    def embedding_url(self) -> str:
        return f"{self.DASHSCOPE_BASE_URL}/embeddings/text-embedding/text-embedding"

    @property
    def text_generation_url(self) -> str:
        return f"{self.DASHSCOPE_BASE_URL}/aigc/text-generation/generation"

    @property
    def multimodal_url(self) -> str:
        return f"{self.DASHSCOPE_BASE_URL}/aigc/multimodal-generation/generation"


@lru_cache()
def get_settings() -> Settings:
    """获取全局配置单例"""
    return Settings()


settings = get_settings()
