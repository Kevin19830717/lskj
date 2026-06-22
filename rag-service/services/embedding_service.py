"""
向量化服务 — OpenAI 兼容 embeddings 接口
"""
import logging
from typing import List, Tuple
import httpx
from config import settings

logger = logging.getLogger(__name__)

EMBEDDING_URL = settings.embeddings_url
HEADERS = {
    "Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}",
    "Content-Type": "application/json",
}
MAX_RETRIES = 3
TIMEOUT_SECONDS = 30


async def call_embedding_api(texts: List[str]) -> Tuple[List[List[float]], int]:
    payload = {"model": settings.EMBEDDING_MODEL, "input": texts}
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.post(EMBEDDING_URL, headers=HEADERS, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    embeddings_data = data.get("data", [])
                    embeddings_data.sort(key=lambda x: x.get("index", 0))
                    embeddings = [item["embedding"] for item in embeddings_data]
                    total_tokens = data.get("usage", {}).get("total_tokens", 0)
                    return embeddings, total_tokens
                elif response.status_code == 429:
                    import asyncio; await asyncio.sleep(attempt * 2)
                    last_error = f"Rate limit: {response.text}"
                elif response.status_code >= 500:
                    import asyncio; await asyncio.sleep(1)
                    last_error = f"Server error: {response.text}"
                else:
                    raise Exception(f"Embedding API error {response.status_code}: {response.text}")
        except httpx.TimeoutException as e:
            last_error = str(e); import asyncio; await asyncio.sleep(2)
        except httpx.RequestError as e:
            last_error = str(e); import asyncio; await asyncio.sleep(2)
    raise Exception(f"Embedding API failed after {MAX_RETRIES} attempts: {last_error}")
