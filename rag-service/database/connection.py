"""
数据库异步连接池管理
使用 asyncpg + asyncpg-pgvector 连接 PostgreSQL (pgvector)
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from config import settings
from asyncpg import connect, create_pool
from asyncpg.exceptions import PostgresError

logger = logging.getLogger(__name__)

# 全局连接池引用
_pool = None


async def init_pgvector_extension(conn):
    """初始化 pgvector 扩展（如果尚未启用）"""
    await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    logger.info("pgvector extension ready")


async def create_embeddings_table(conn):
    """创建 user_health_embeddings 表（如果不存在）"""
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS user_health_embeddings (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            embedding VECTOR(1536) NOT NULL,
            source_text TEXT NOT NULL,
            source_type VARCHAR(50) DEFAULT 'diet_summary',
            source_date DATE,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    # 创建向量索引以加速余弦相似度搜索
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_health_embeddings_user_id 
        ON user_health_embeddings(user_id)
    """)
    await conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_health_embeddings_embedding 
        ON user_health_embeddings USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    """)
    logger.info("user_health_embeddings table ready")


async def get_pool():
    """获取或创建数据库连接池"""
    global _pool
    if _pool is None:
        _pool = await create_pool(
            dsn=settings.DATABASE_URL,
            min_size=2,
            max_size=10,
            setup=init_pgvector_extension,
        )
        # 验证并创建表结构
        async with _pool.acquire() as conn:
            await create_embeddings_table(conn)
        logger.info(f"Database pool created: {settings.DATABASE_URL}")
    return _pool


async def close_pool():
    """关闭数据库连接池"""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed")


@asynccontextmanager
async def get_connection():
    """获取单个数据库连接的上下文管理器"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


async def health_check() -> dict:
    """数据库健康检查"""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            version = await conn.fetchval("SELECT version()")
            return {
                "status": "healthy",
                "database": "PostgreSQL + pgvector",
                "version": version.split(",")[0] if version else "unknown",
            }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
        }
