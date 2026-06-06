"""
智能饮食健康秤 — RAG 服务 (FastAPI 入口)
提供向量检索、文本向量化、AI健康建议生成等能力
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from config import settings
from database.connection import get_pool, close_pool, get_connection
from routers.rag import router as rag_router

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    logger.info("🚀 Starting RAG Service...")
    
    # 启动时初始化数据库连接池
    try:
        await get_pool()
        logger.info("✅ Database connection pool initialized")
        
        # 验证数据库连接
        async with get_connection() as conn:
            result = await conn.fetchval("SELECT 1")
            logger.info(f"✅ Database connection verified: {result}")
            
    except Exception as e:
        logger.error(f"❌ Failed to initialize database: {e}")
        raise
    
    yield
    
    # 关闭时断开连接池
    await close_pool()
    logger.info("👋 RAG Service shutdown complete")


# 创建 FastAPI 应用实例
app = FastAPI(
    title="Smart Scale RAG Service",
    description="智能饮食健康秤 — AI检索增强生成服务（基于阿里云百炼 + pgvector）",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== 全局异常处理 ====================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """请求参数验证错误处理"""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "code": 422,
            "message": "Validation error",
            "data": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局未捕获异常处理"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "code": 500,
            "message": f"Internal server error: {str(exc)}",
            "data": None,
        },
    )


# ==================== 注册路由 ====================

app.include_router(rag_router, prefix="/api/v1/rag", tags=["RAG"])


# ==================== 根路径健康检查 ====================

@app.get("/health", tags=["Health"])
async def health_check():
    """服务健康检查"""
    db_status = "disconnected"
    try:
        async with get_connection() as conn:
            await conn.fetchval("SELECT 1")
            db_status = "connected"
    except Exception:
        pass
    
    return {
        "status": "ok",
        "service": "rag-service",
        "version": "1.0.0",
        "database": {"status": db_status},
        "dashscope_connected": bool(settings.DASHSCOPE_API_KEY),
    }


@app.get("/", tags=["Root"])
async def root():
    """根路径"""
    return {
        "service": "Smart Scale RAG Service",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": [
            "POST /api/v1/rag/embedding      — 文本向量化",
            "POST /api/v1/rag/retrieve       — 向量相似度检索",
            "POST /api/v1/rag/generate-advice — RAG健康建议生成",
            "POST /api/v1/rag/parse-medical-report — 体检报告多模态解析",
            "GET  /api/v1/rag/health         — 健康检查",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app:app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=settings.SERVER_MODE != "production",
        log_level="info",
    )
