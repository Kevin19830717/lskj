"""
文本生成服务
调用阿里云百炼 DashScope qwen-plus / qwen-vl-flash API 生成文本
"""
import logging
from typing import Dict, Any, Optional

import httpx
from config import settings

logger = logging.getLogger(__name__)

TEXT_GEN_URL = settings.text_generation_url
MULTIMODAL_URL = settings.multimodal_url
HEADERS = {
    "Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}",
    "Content-Type": "application/json",
}

TIMEOUT_SECONDS = 60


async def generate_text(
    system_prompt: str,
    user_prompt: str,
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 512,
) -> Dict[str, Any]:
    """
    调用 DashScope 文本生成 API (qwen-plus)
    
    Args:
        system_prompt: 系统提示词
        user_prompt: 用户提示词
        model: 模型名称，默认使用配置值
        temperature: 温度参数 (0-2)
        max_tokens: 最大输出 token 数
    
    Returns:
        包含 content 和 token_usage 的字典
    """
    model_name = model or settings.TEXT_MODEL
    
    payload = {
        "model": model_name,
        "input": {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
        },
        "parameters": {
            "result_format": "message",
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
    }
    
    last_error = None
    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
                response = await client.post(TEXT_GEN_URL, headers=HEADERS, json=payload)
                
                if response.status_code == 200:
                    data = response.json()
                    output = data.get("output", {})
                    choices = output.get("choices", [])
                    
                    content = choices[0]["message"]["content"] if choices else ""
                    usage = data.get("usage", {})
                    
                    token_usage = {
                        "prompt_tokens": usage.get("input_tokens"),
                        "completion_tokens": usage.get("output_tokens"),
                        "total_tokens": usage.get("total_tokens"),
                    }
                    
                    logger.info(
                        f"Text generation success: model={model_name}, "
                        f"tokens={token_usage['total_tokens']}, "
                        f"output_length={len(content)}"
                    )
                    return {
                        "content": content,
                        "token_usage": token_usage,
                        "model_used": model_name,
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
                    error_msg = f"Text gen API error {response.status_code}: {response.text}"
                    logger.error(error_msg)
                    raise Exception(error_msg)
                    
        except httpx.TimeoutException:
            import asyncio
            await asyncio.sleep(3)
            last_error = "Request timeout"
            
        except httpx.RequestError as e:
            import asyncio
            await asyncio.sleep(2)
            last_error = f"Request error: {e}"

    raise Exception(f"Text generation failed after {max_retries} attempts. Last error: {last_error}")


async def generate_multimodal(
    messages: list,
    model: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> Dict[str, Any]:
    """
    调用 DashScope 多模态 API (qwen-vl-flash)
    用于图片理解和体检报告解析
    
    Args:
        messages: 消息列表，格式见 DashScope 多模态文档
        model: 模型名称
        temperature: 温度参数
        max_tokens: 最大 token 数
    
    Returns:
        包含解析结果的字典
    """
    model_name = model or settings.VL_MODEL
    
    payload = {
        "model": model_name,
        "input": {"messages": messages},
        "parameters": {
            "result_format": "message",
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
    }
    
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(MULTIMODAL_URL, headers=HEADERS, json=payload)
            
            if response.status_code == 200:
                data = response.json()
                choices = data.get("output", {}).get("choices", [])
                content = choices[0]["message"]["content"] if choices else ""
                usage = data.get("usage", {})
                
                return {
                    "content": content,
                    "token_usage": {
                        "prompt_tokens": usage.get("input_tokens"),
                        "completion_tokens": usage.get("output_tokens"),
                        "total_tokens": usage.get("total_tokens"),
                    },
                    "model_used": model_name,
                }
            else:
                raise Exception(f"Multimodal API error {response.status_code}: {response.text}")
                
    except httpx.TimeoutException:
        raise Exception("Multimodal API request timeout")
    except httpx.RequestError as e:
        raise Exception(f"Multimodal API request error: {e}")
