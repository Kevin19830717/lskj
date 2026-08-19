"""
向量检索服务
基于 pgvector 的余弦相似度搜索
"""
import time
import logging
from typing import List, Optional
from datetime import date

import asyncpg
from config import settings
from database.connection import get_connection

logger = logging.getLogger(__name__)


async def store_embedding(
    user_id: int,
    embedding: list,
    source_text: str,
    source_type: str = "diet_summary",
    source_date: Optional[date] = None,
    metadata: Optional[dict] = None,
) -> int:
    """
    将向量存入数据库
    
    Args:
        user_id: 用户ID
        embedding: 1024维向量
        source_text: 原始文本
        source_type: 来源类型
        source_date: 数据日期
        metadata: 额外元数据(JSONB)
    
    Returns:
        新插入记录的 ID
    """
    async with get_connection() as conn:
        # asyncpg-pgvector 适配器：把 list 转为字符串形式以便 ::vector 强制转换
        embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
        # asyncpg 把 dict 传给 jsonb 列时需要 JSON 字符串
        import json as _json
        metadata_str = _json.dumps(metadata or {}, ensure_ascii=False, default=str)
        record_id = await conn.fetchval("""
            INSERT INTO user_health_embeddings 
                (user_id, embedding, content_text, source_type, source_date, metadata)
            VALUES ($1, $2::vector, $3, $4, $5, $6::jsonb)
            RETURNING id
        """, user_id, embedding_str, source_text, source_type, source_date, metadata_str)
        
        logger.debug(f"Stored embedding: record_id={record_id}, user={user_id}, type={source_type}")
        return record_id


async def similarity_search(
    query_vector: list,
    user_id: int,
    top_k: int = 5,
    source_type_filter: Optional[List[str]] = None,
    similarity_threshold: Optional[float] = None,
    date_start: Optional[date] = None,
    date_end: Optional[date] = None,
) -> List[dict]:
    """
    在 pgvector 中执行余弦相似度检索
    
    Args:
        query_vector: 查询向量（1024维）
        user_id: 用户ID
        top_k: 返回数量上限
        source_type_filter: 来源类型过滤列表
        similarity_threshold: 相似度阈值（0-1），低于此值的结果将被过滤
        date_start: 起始日期过滤
        date_end: 结束日期过滤
    
    Returns:
        检索结果列表，每项包含记录详情 + similarity 字段
        
    注意：
        pgvector 的 <=> 运算符返回的是**余弦距离**（0=完全相同，2=相反）
        相似度 = 1 - 余弦距离
    """
    threshold = similarity_threshold if similarity_threshold is not None else settings.SIMILARITY_THRESHOLD

    # asyncpg-pgvector 适配器：把 query_vector 转为字符串形式
    query_vector_str = "[" + ",".join(str(x) for x in query_vector) + "]"

    # 动态构建 WHERE 条件
    conditions = ["user_id = $2"]
    params_idx = 3
    params = [query_vector_str, user_id]
    
    if source_type_filter and len(source_type_filter) > 0:
        # source_type_filter 是内部白名单常量（非用户输入），直接拼进 SQL 避免 asyncpg 类型推断问题
        safe_types = [t.replace("'", "''") for t in source_type_filter if isinstance(t, str)]
        if safe_types:
            in_clause = ",".join([f"'{t}'" for t in safe_types])
            conditions.append(f"source_type IN ({in_clause})")
    
    if date_start is not None:
        conditions.append(f"source_date >= ${params_idx}")
        params.append(date_start)
        params_idx += 1
    
    if date_end is not None:
        conditions.append(f"source_date <= ${params_idx}")
        params.append(date_end)
        params_idx += 1
    
    where_clause = " AND ".join(conditions)
    
    sql = f"""
        SELECT 
            id, user_id, content_text, source_type, source_date, 
            metadata, created_at,
            1 - (embedding <=> $1::vector) AS similarity
        FROM user_health_embeddings
        WHERE {where_clause}
        ORDER BY similarity DESC
        LIMIT ${params_idx}::int
    """
    params.append(top_k)
    
    start_time = time.time()
    async with get_connection() as conn:
        rows = await conn.fetch(sql, *params)
    
    elapsed_ms = (time.time() - start_time) * 1000
    logger.debug(f"Similarity search completed in {elapsed_ms:.1f}ms, raw results={len(rows)}")
    
    # 过滤低于阈值的结果并转为 dict 列表
    results = []
    for row in rows:
        sim = float(row["similarity"])
        if sim < threshold:
            continue
        result = dict(row)
        result["similarity"] = round(sim, 4)
        results.append(result)
    
    logger.info(f"Retrieval: found {len(results)} records above threshold {threshold} for user {user_id}")
    return results


async def get_user_embedding_count(user_id: int) -> int:
    """获取用户的嵌入记录总数"""
    async with get_connection() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM user_health_embeddings WHERE user_id = $1",
            user_id,
        )
        return count
