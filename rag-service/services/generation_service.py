"""
文本生成服务 — 阿里云百炼 Responses API
使用 /compatible-mode/v1/responses 接口，支持 previous_response_id 多轮记忆
"""
import logging
from typing import Dict, Any, Optional, List

import httpx
from config import settings

logger = logging.getLogger(__name__)

RESPONSES_URL = settings.responses_url
CHAT_COMPLETIONS_URL = settings.chat_completions_url
EMBEDDINGS_URL = settings.embeddings_url
HEADERS = {
    "Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}",
    "Content-Type": "application/json",
}

TIMEOUT_SECONDS = 120


async def call_responses_api(
    messages: List[dict],
    previous_response_id: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> Dict[str, Any]:
    """
    调用 Responses API（支持 previous_response_id 多轮记忆）

    Args:
        messages: 消息列表 [{"role": "system", "content": "..."}, ...]
        previous_response_id: 上一轮响应的 ID，用于自动关联上下文（7天有效）
        model: 模型名称
        temperature: 温度
        max_tokens: 最大 token

    Returns:
        {"content": str, "response_id": str, "model_used": str}
    """
    model_name = model or settings.TEXT_MODEL
    payload = {
        "model": model_name,
        "input": messages,
    }
    if previous_response_id:
        payload["previous_response_id"] = previous_response_id

    last_error = None
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.post(RESPONSES_URL, headers=HEADERS, json=payload)

                if response.status_code == 200:
                    data = response.json()
                    response_id = data.get("id", "")
                    content = _extract_text(data)
                    usage = data.get("usage", {})

                    logger.info(
                        f"Responses API success: model={model_name}, "
                        f"response_id={response_id}, "
                        f"output_length={len(content)}"
                    )
                    return {
                        "content": content,
                        "response_id": response_id,
                        "model_used": model_name,
                        "token_usage": {
                            "prompt_tokens": usage.get("input_tokens"),
                            "completion_tokens": usage.get("output_tokens"),
                            "total_tokens": usage.get("total_tokens"),
                        },
                    }

                elif response.status_code == 429:
                    import asyncio
                    await asyncio.sleep(attempt * 2)
                    last_error = f"Rate limited: {response.text}"

                elif response.status_code >= 500:
                    import asyncio
                    await asyncio.sleep(1)
                    last_error = f"Server error {response.status_code}: {response.text}"

                else:
                    raise Exception(f"Responses API error {response.status_code}: {response.text}")

        except httpx.TimeoutException:
            import asyncio
            await asyncio.sleep(3)
            last_error = "Request timeout"

        except httpx.RequestError as e:
            import asyncio
            await asyncio.sleep(2)
            last_error = f"Request error: {e}"

    raise Exception(f"Responses API failed after {max_retries} attempts. Last error: {last_error}")


def _extract_text(data: dict) -> str:
    """从 Responses API 响应中提取文本"""
    output = data.get("output", [])
    for item in output:
        if item.get("type") == "message":
            for c in item.get("content", []):
                if c.get("type") == "output_text" and c.get("text"):
                    return c["text"]
    return ""


async def generate_text(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    便捷方法：传入 system prompt + user prompt，调用 Responses API 生成文本。
    这是 RAG 流水线调用的入口函数。
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    return await call_responses_api(
        messages=messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
    )


async def generate_multimodal(
    messages: list,
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> Dict[str, Any]:
    """
    调用多模态 Chat Completions API（新版 OpenAI 兼容格式，用于图片理解）

    Args:
        messages: 消息列表，支持图片 base64 或 image_url 格式
        model: 模型名称，默认使用 VL_MODEL (qwen3.7-flash-2026-07-15)
        temperature: 温度
        max_tokens: 最大 token

    Returns:
        {"content": str, "model_used": str}
    """
    model_name = model or settings.VL_MODEL

    # 将旧版多模态消息格式转为 Chat Completions 格式
    # 旧版: [{"role":"user", "content":[{"image":"data:...base64,..."}, {"text":"prompt"}]}]
    # 新版: [{"role":"user", "content":[{"type":"image_url", "image_url":{"url":"data:..."}}, {"type":"text","text":"prompt"}]}]
    chat_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        content_parts = msg.get("content", [])
        if isinstance(content_parts, list):
            new_parts = []
            for part in content_parts:
                if isinstance(part, dict):
                    if "image" in part:
                        # 旧版格式 → 新版 image_url 格式
                        new_parts.append({"type": "image_url", "image_url": {"url": part["image"]}})
                    elif "text" in part:
                        new_parts.append({"type": "text", "text": part["text"]})
                    elif "type" in part:
                        # 已经是新版格式，直接保留
                        new_parts.append(part)
                elif isinstance(part, str):
                    new_parts.append({"type": "text", "text": part})
            chat_messages.append({"role": role, "content": new_parts})
        else:
            chat_messages.append({"role": role, "content": content_parts})

    payload = {
        "model": model_name,
        "messages": chat_messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    last_error = None
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.post(CHAT_COMPLETIONS_URL, headers=HEADERS, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    choices = data.get("choices", [])
                    content = choices[0]["message"]["content"] if choices else ""
                    return {"content": content, "model_used": model_name}
                elif response.status_code == 429:
                    import asyncio
                    await asyncio.sleep(attempt * 2)
                    last_error = f"Rate limited: {response.text}"
                elif response.status_code >= 500:
                    import asyncio
                    await asyncio.sleep(1)
                    last_error = f"Server error {response.status_code}: {response.text}"
                else:
                    raise Exception(f"Chat Completions API error {response.status_code}: {response.text}")
        except httpx.TimeoutException:
            import asyncio
            await asyncio.sleep(3)
            last_error = "Request timeout"
        except httpx.RequestError as e:
            import asyncio
            await asyncio.sleep(2)
            last_error = f"Request error: {e}"

    raise Exception(f"Chat Completions API failed after {max_retries} attempts. Last error: {last_error}")
