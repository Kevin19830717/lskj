"""
向量化服务
调用阿里云百炼 DashScope text-embedding-v2 API 将文本转换为向量
"""
import logging
from typing import List, Tuple

import httpx
from config import settings

logger = logging.getLogger(__name__)

# DashScope Embedding API 配置
EMBEDDING_URL = settings.embedding_url
HEADERS = {
    "Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}",
    "Content-Type": "application/json",
}

# 最大重试次数和超时设置
MAX_RETRIES = 3
TIMEOUT_SECONDS = 30


async def call_embedding_api(texts: List[str]) -> Tuple[List[List[float]], int]:
    """
    调用 DashScope text-embedding-v2 API 获取文本向量
    
    Args:
        texts: 待向量化文本列表（最多20条）
    
    Returns:
        (embeddings_list, total_tokens) 元组
        embeddings_list: 每个文本对应的1536维向量列表
        total_tokens: 消耗的总 token 数
    
    Raises:
        Exception: 当所有重试都失败时抛出异常
    """
    payload = {
        "model": settings.EMBEDDING_MODEL,
        "input": {
            "texts": texts,
        },
    }

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.post(
                    EMBEDDING_URL,
                    headers=HEADERS,
                    json=payload,
                )
                
                if response.status_code == 200:
                    data = response.json()
                    output = data.get("output", {})
                    embeddings_data = output.get("embeddings", [])
                    
                    # 按 text_index 排序确保顺序一致
                    embeddings_data.sort(key=lambda x: x["text_index"])
                    
                    embeddings = [item["embedding"] for item in embeddings_data]
                    usage = data.get("usage", {})
                    total_tokens = usage.get("total_tokens", 0)
                    
                    logger.info(
                        f"Embedding success: {len(texts)} texts, "
                        f"{len(embeddings)} vectors, tokens={total_tokens}"
                    )
                    return embeddings, total_tokens
                
                elif response.status_code == 429:
                    # Rate limit - 指数退避
                    wait_time = attempt * 2
                    logger.warning(f"Rate limited (attempt {attempt}/{MAX_RETRIES}), waiting {wait_time}s...")
                    import asyncio
                    await asyncio.sleep(wait_time)
                    last_error = f"Rate limit: {response.text}"
                    
                elif response.status_code >= 500:
                    # Server error - 重试
                    logger.warning(
                        f"Server error {response.status_code} (attempt {attempt}/{MAX_RETRIES})"
                    )
                    import asyncio
                    await asyncio.sleep(1)
                    last_error = f"Server error {response.status_code}: {response.text}"
                    
                else:
                    # Client error - 不重试，直接报错
                    error_msg = f"Embedding API error {response.status_code}: {response.text}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
                    
        except httpx.TimeoutException as e:
            logger.warning(f"Timeout on embedding API (attempt {attempt}/{MAX_RETRIES}): {e}")
            last_error = str(e)
            import asyncio
            await asyncio.sleep(2)
            
        except httpx.RequestError as e:
            logger.warning(f"Request error (attempt {attempt}/{MAX_RETRIES}): {e}")
            last_error = str(e)
            import asyncio
            await asyncio.sleep(2)

    # 所有重试耗尽
    raise Exception(f"Embedding API failed after {MAX_RETRIES} attempts. Last error: {last_error}")


def embed_single_text_sync(text: str) -> List[float]:
    """
    同步方式对单条文本向量化（用于简单场景）
    使用 httpx 同步客户端
    """
    import httpx
    
    payload = {
        "model": settings.EMBEDDING_MODEL,
        "input": {"texts": [text]},
    }
    
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            response = client.post(EMBEDDING_URL, headers=HEADERS, json=payload)
            if response.status_code == 200:
                data = response.json()
                embeddings = data["output"]["embeddings"]
                return embeddings[0]["embedding"]
            else:
                raise Exception(f"Sync embedding failed: status={response.status_code}, body={response.text}")
    except Exception as e:
        logger.error(f"Sync embedding error: {e}")
        raise
