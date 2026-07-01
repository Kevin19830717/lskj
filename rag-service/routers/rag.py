"""
RAG API 路由
提供文本向量化、向量检索、健康建议生成、体检报告解析等端点
"""
import logging
from typing import List

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from database.connection import get_connection
from models.schemas import (
    EmbeddingRequest,
    EmbeddingResponse,
    RetrieveRequest,
    RetrieveResponse,
    GenerateAdviceRequest,
    GenerateAdviceResponse,
    HealthCheckResponse,
    ChatRequest,
    ChatResponse,
)
from services.embedding_service import call_embedding_api
from services.retrieval_service import similarity_search, store_embedding
from services.generation_service import call_responses_api, generate_multimodal, RESPONSES_URL, HEADERS, CHAT_COMPLETIONS_URL
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== 文本向量化 ====================

@router.post("/embedding", response_model=EmbeddingResponse, summary="文本向量化")
async def create_embedding(req: EmbeddingRequest):
    """
    将文本向量化并存储到 pgvector 数据库
    
    - 调用 DashScope text-embedding-v2 API 获取 1536 维向量
    - 自动存储到 user_health_embeddings 表
    """
    try:
        embeddings_list, total_tokens = await call_embedding_api(req.texts)
        
        # 存储每条嵌入记录
        stored_count = 0
        stored_ids = []
        
        for i, embedding in enumerate(embeddings_list):
            source_date = req.source_date
            text = req.texts[i] if i < len(req.texts) else ""
            
            record_id = await store_embedding(
                user_id=req.user_id,
                embedding=embedding,
                source_text=text,
                source_type=req.source_type,
                source_date=source_date,
            )
            stored_ids.append(record_id)
            stored_count += 1
        
        return EmbeddingResponse(
            success=True,
            message=f"Successfully embedded and stored {stored_count} texts",
            results=[{
                "text_index": i,
                "text": req.texts[i] if i < len(req.texts) else "",
                "embedding_dim": 1536 if embeddings_list else 0,
                "success": True,
            } for i in range(len(embeddings_list))],
            stored_count=stored_count,
            total_tokens_used=total_tokens,
        )
        
    except Exception as e:
        logger.error(f"Embedding failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 向量检索 ====================

@router.post("/retrieve", response_model=RetrieveResponse, summary="向量相似度检索")
async def retrieve_similar(req: RetrieveRequest):
    """
    在 pgvector 中执行余弦相似度检索
    
    流程：
    1. 将查询文本通过 DashScope API 向量化
    2. 在 user_health_embeddings 表中按余弦距离排序
    3. 返回 Top-K 最相似的记录
    """
    import time
    start_time = time.time()
    
    try:
        from services.embedding_service import call_embedding_api
        
        # 先对查询文本向量化
        query_embeddings, _ = await call_embedding_api([req.query_text])
        if not query_embeddings or not query_embeddings[0]:
            raise ValueError("Failed to generate query embedding")
        
        query_vector = query_embeddings[0]
        
        # 执行相似度搜索
        results = await similarity_search(
            query_vector=query_vector,
            user_id=req.user_id,
            top_k=req.top_k,
            source_type_filter=req.source_type_filter,
            similarity_threshold=req.similarity_threshold,
            date_start=req.date_start,
            date_end=req.date_end,
        )
        
        elapsed_ms = (time.time() - start_time) * 1000
        
        return RetrieveResponse(
            query_text=req.query_text,
            total_found=len(results),
            records=results,
            retrieval_time_ms=round(elapsed_ms, 2),
        )
        
    except Exception as e:
        logger.error(f"Retrieval failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== RAG 健康建议生成（核心） ====================

@router.post("/generate-advice", response_model=GenerateAdviceResponse, summary="生成AI健康建议（RAG流水线）")
async def generate_health_advice(req: GenerateAdviceRequest):
    """
    完整的 RAG (Retrieval-Augmented Generation) 健康建议生成流水线
    
    流程：
    1. 构建查询文本（将当前饮食摘要转为自然语言）
    2. 调用 DashScope text-embedding-v2 向量化查询
    3. 在 pgvector 中检索 Top-K 相似历史记录
    4. 组装 Prompt（系统提示词 + 当前数据 + 历史参考上下文）
    5. 调用 DashScope qwen-plus 生成个性化建议
    6. 返回建议内容 + 参考上下文 + Token 用量
    """
    import uuid
    import time
    from datetime import datetime
    from prompts.system_prompt import get_system_prompt_for_advice
    
    start_time = time.time()
    advice_id = f"adv_{uuid.uuid4().hex[:12]}"
    
    try:
        # ===== Step 1: 构建查询文本 =====
        summary = req.current_summary
        profile = req.user_profile
        
        query_text = build_query_from_summary(summary, profile)
        logger.info(f"Query text built ({len(query_text)} chars)")
        
        # ===== Step 2: 向量化查询文本 =====
        query_embeddings, embed_tokens = await call_embedding_api([query_text])
        if not query_embeddings or not query_embeddings[0]:
            raise ValueError("Failed to generate query embedding for advice generation")
        query_vector = query_embeddings[0]
        
        # ===== Step 3: 检索相似历史记录 =====
        similar_results = await similarity_search(
            query_vector=query_vector,
            user_id=req.user_id,
            top_k=5,
            similarity_threshold=None,  # 使用默认阈值
        )
        logger.info(f"Retrieved {len(similar_results)} similar historical records")
        
        # ===== Step 4 & 5: 构建 Prompt + 生成建议（Responses API）=====
        system_prompt = get_system_prompt_for_advice()
        user_prompt = build_rag_user_prompt(summary, profile, similar_results)

        gen_result = await call_responses_api(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=1024,
        )
        
        advice_content = gen_result["content"]
        token_usage = gen_result.get("token_usage", {})
        
        elapsed_sec = time.time() - start_time
        logger.info(f"RAG advice generated in {elapsed_sec:.1f}s, content length={len(advice_content)}")
        
        return GenerateAdviceResponse(
            advice_id=advice_id,
            advice_type=req.advice_type,
            advice_content=advice_content,
            context={
                "retrieved_records": [
                    {
                        "content_text": r.get("source_text", ""),
                        "similarity": r.get("similarity", 0),
                        "source_type": r.get("source_type", ""),
                        "source_date": str(r.get("source_date", "")),
                    }
                    for r in similar_results
                ],
                "record_count": len(similar_results),
            },
            token_usage=token_usage,
            generated_at=datetime.utcnow(),
        )
        
    except Exception as e:
        logger.error(f"RAG generate-advice failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate advice: {str(e)}")


# ==================== 体检报告多模态解析 ====================

@router.post("/parse-medical-report", summary="多模态解析体检报告")
async def parse_medical_report(file: UploadFile = File(...)):
    """
    使用 qwen-vl-flash 多模态模型解析体检报告图片
    
    支持上传 PNG/JPG 格式的体检报告照片，
    AI 会自动提取所有可见的医学检验指标并返回结构化 JSON。
    """
    from prompts.system_prompt import get_system_prompt_for_medical_parser
    
    try:
        # 读取图片内容
        contents = await file.read()
        import base64
        image_base64 = base64.b64encode(contents).decode("utf-8")
        
        # 确定MIME类型
        content_type = file.content_type or "image/jpeg"
        
        # 构建多模态请求
        messages = [{
            "role": "user",
            "content": [
                {"image": f"data:{content_type};base64,{image_base64}"},
                {"text": get_system_prompt_for_medical_parser()},
            ],
        }]
        
        result = await generate_multimodal(messages=messages, max_tokens=2048)
        
        return {
            "code": 0,
            "message": "success",
            "data": {
                "parsed_data": result.get("content", {}),
                "raw_response": result.get("content", ""),
                "model_used": result.get("model_used", "qwen-vl-flash"),
                "file_name": file.filename,
            },
        }
        
    except Exception as e:
        logger.error(f"Medical report parsing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== AI 对话文件上传解析 ====================

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
ALLOWED_TEXT_TYPES = {"text/plain", "text/markdown", "text/csv", "application/json", "text/html"}
ALLOWED_TEXT_EXTS = {".txt", ".md", ".csv", ".json", ".html", ".htm", ".log"}


@router.post("/chat/upload-file", summary="上传文件并解析为文本（供AI对话使用）")
async def chat_upload_file(file: UploadFile = File(...)):
    """
    接受图片或文本文件，解析为纯文本返回。
    - 图片：用 qwen-vl-flash 多模态模型描述图片内容
    - 文本：直接读取文件内容
    返回 { code, data: { text, file_name, file_type } }
    """
    import base64
    import os

    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="文件为空")

        content_type = (file.content_type or "").lower()
        filename = file.filename or "upload"
        ext = os.path.splitext(filename)[1].lower()

        # 图片 → 多模态解析
        if content_type in ALLOWED_IMAGE_TYPES or ext in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
            image_base64 = base64.b64encode(contents).decode("utf-8")
            mime = content_type or "image/jpeg"
            messages = [{
                "role": "user",
                "content": [
                    {"image": f"data:{mime};base64,{image_base64}"},
                    {"text": "请详细描述这张图片的内容。如果是食物、营养成分表、饮食记录或健康相关的内容，请重点提取关键数据。用简洁的中文回答。"},
                ],
            }]
            result = await generate_multimodal(messages=messages, max_tokens=1024)
            parsed_text = result.get("content", "") or "（图片解析结果为空）"
            return {
                "code": 0,
                "message": "success",
                "data": {"text": parsed_text, "file_name": filename, "file_type": "image"},
            }

        # 文本文件 → 直接读取
        if content_type in ALLOWED_TEXT_TYPES or ext in ALLOWED_TEXT_EXTS:
            try:
                text = contents.decode("utf-8")
            except UnicodeDecodeError:
                text = contents.decode("gbk", errors="replace")
            # 截断过长文本（避免超出 LLM 上下文）
            if len(text) > 4000:
                text = text[:4000] + "\n\n...(文件过长，已截断)"
            return {
                "code": 0,
                "message": "success",
                "data": {"text": text, "file_name": filename, "file_type": "text"},
            }

        raise HTTPException(status_code=415, detail=f"不支持的文件类型: {content_type or ext}（支持图片和常见文本文件）")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload parsing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== AI 对话 ====================

@router.post("/chat", response_model=ChatResponse, summary="AI健康对话")
async def chat(req: ChatRequest):
    """
    AI 健康对话 — 使用 Responses API + previous_response_id 多轮记忆 + 分层归档上下文

    记忆机制：
    1. 短期对话记忆：previous_response_id（7天有效，自动关联上下文）
    2. 长期知识库：从 user_analysis_summaries 获取日/周/月/年归档摘要注入 system prompt
    """
    import time
    start_time = time.time()

    try:
        if req.mode == "expert":
            # 专家模式：加载完整上下文
            prev_response_id = await _get_last_response_id(req.user_id)
            user_context = await _build_user_context(req.user_id)
            archived_summaries = await _get_archived_summaries(req.user_id, req.message)
            system_prompt = _get_chat_system_prompt(user_context, archived_summaries, mode="expert")
            messages = [{"role": "system", "content": system_prompt}]
            for h in req.history[-20:]:
                messages.append({"role": h.role, "content": h.content})
            messages.append({"role": "user", "content": req.message})
            result = await call_responses_api(
                messages=messages,
                previous_response_id=prev_response_id,
                temperature=0.5,
                max_tokens=4096,
            )
            new_response_id = result.get("response_id", "")
            if new_response_id:
                await _save_response_id(req.user_id, new_response_id)
        else:
            # 快速模式：默认不加上下文，直接调用；但检测到时间关键词（如"2022年年报"）时注入归档数据
            archived_summaries_fast = ""
            if _match_time_keyword(req.message):
                try:
                    archived_summaries_fast = await _get_archived_summaries(req.user_id, req.message)
                except Exception as e:
                    logger.warning(f"Fast mode RAG retrieval failed: {e}")

            if archived_summaries_fast:
                sys_content = ("你是智能饮食健康秤的AI助手。用中文简洁回答，不要用emoji。\n\n"
                                "以下是用户的历史归档数据，请基于这些数据回答用户问题：\n"
                                + archived_summaries_fast)
            else:
                sys_content = "你是智能饮食健康秤的AI助手。用中文简洁回答，不要用emoji。"
            messages = [{"role": "system", "content": sys_content}]
            for h in req.history[-10:]:
                messages.append({"role": h.role, "content": h.content})
            messages.append({"role": "user", "content": req.message})
            result = await call_responses_api(
                messages=messages,
                temperature=0.7,
                max_tokens=1024,
            )

        elapsed = time.time() - start_time
        logger.info(f"Chat completed in {elapsed:.1f}s, user={req.user_id}, mode={req.mode}")

        return ChatResponse(
            reply=result["content"],
            model_used=result.get("model_used", settings.TEXT_MODEL),
        )

    except Exception as e:
        logger.error(f"Chat failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"对话失败: {str(e)}")


# ==================== AI 流式对话 ====================

@router.get("/chat/history", summary="获取聊天历史记录")
async def get_chat_history(user_id: int, limit: int = 100):
    """获取用户聊天历史记录（取最近 limit 条，按时间正序返回）"""
    history = await _get_chat_history(user_id, limit)
    return {"history": history}


@router.post("/chat/reset", summary="重置对话")
async def reset_chat(user_id: int):
    """删除用户所有聊天记录和对话状态"""
    try:
        async with get_connection() as conn:
            await conn.execute("DELETE FROM chat_messages WHERE user_id = $1", user_id)
            await conn.execute("DELETE FROM ai_conversation_state WHERE user_id = $1", user_id)
        logger.info(f"Chat reset for user={user_id}")
        return {"status": "ok", "message": "对话已重置"}
    except Exception as e:
        logger.error(f"Chat reset failed for user={user_id}: {e}")
        raise HTTPException(status_code=500, detail="重置失败")


@router.post("/chat/delete-last-user", summary="删除最后一条孤立的用户消息")
async def delete_last_user_message(user_id: int):
    """删除用户最后一条 user 消息（用于前端重发前去重，避免孤立 user 消息堆积）"""
    try:
        async with get_connection() as conn:
            # 找到最后一条 user 消息的 id
            last_user_id = await conn.fetchval(
                "SELECT id FROM chat_messages WHERE user_id = $1 AND role = 'user' ORDER BY id DESC LIMIT 1",
                user_id,
            )
            if last_user_id is not None:
                # 检查它后面是否还有 assistant 消息（如果有，说明不是孤立的，不删）
                next_msg = await conn.fetchval(
                    "SELECT id FROM chat_messages WHERE user_id = $1 AND id > $2 ORDER BY id ASC LIMIT 1",
                    user_id, last_user_id,
                )
                if next_msg is None:
                    # 后面没有消息 → 这是一条孤立 user 消息，删除
                    await conn.execute("DELETE FROM chat_messages WHERE id = $1", last_user_id)
                    logger.info(f"Deleted orphan user message id={last_user_id} for user={user_id}")
                    return {"status": "ok", "deleted": True}
        return {"status": "ok", "deleted": False}
    except Exception as e:
        logger.error(f"Delete last user message failed for user={user_id}: {e}")
        raise HTTPException(status_code=500, detail="删除失败")


class SaveInterruptedReq(BaseModel):
    user_id: int
    message: str
    reply: str

@router.post("/chat/save-interrupted", summary="保存中断的对话消息")
async def save_interrupted(req: SaveInterruptedReq):
    """用户切页面中断流式时，保存已收到的部分 AI 回复，防止孤立 user 消息"""
    try:
        async with get_connection() as conn:
            await conn.execute(
                "INSERT INTO chat_messages (user_id, role, content) VALUES ($1, 'user', $2)",
                req.user_id, req.message,
            )
            await conn.execute(
                "INSERT INTO chat_messages (user_id, role, content) VALUES ($1, 'assistant', $2)",
                req.user_id, req.reply + " [已中断]",
            )
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Save interrupted failed for user={req.user_id}: {e}")
        raise HTTPException(status_code=500, detail="保存失败")


@router.post("/chat/stream", summary="AI健康对话(流式)")
async def chat_stream(req: ChatRequest):
    """
    AI 健康对话流式输出 — 使用 Chat Completions API
    快速模式：不加任何上下文，关闭思考，流式快速回复
    专家模式：加载完整健康数据+归档报告，启用深度思考，流式输出思考过程+回复
    返回 Server-Sent Events (SSE)
    """
    from fastapi.responses import StreamingResponse
    import json as _json
    import time

    start_time = time.time()

    async def event_generator():
        # ===== 修复刷新吞消息：进入流式前先持久化用户消息 =====
        # 即使后续 AI 响应中断/页面刷新，用户消息也已经落库不会丢失
        await _save_chat_message(req.user_id, "user", req.message)

        full_text = ""
        full_thinking = ""

        # ===== 多模态支持：有图片时用 qwen3-omni-flash + 多模态消息格式 =====
        has_images = bool(req.images)
        # 构造用户消息 content：有图片时为 [{type:text}, {type:image_url}...]；无图片时为纯字符串
        if has_images:
            user_content = [{"type": "text", "text": req.message or "请分析这张图片"}]
            for img_url in req.images:
                user_content.append({"type": "image_url", "image_url": {"url": img_url}})
        else:
            user_content = req.message
        # 有图片时强制使用多模态模型；无图片时用文本模型（质量更好）
        chat_model = settings.OMNI_MODEL if has_images else settings.TEXT_MODEL

        try:
            if req.mode == "expert":
                # ===== 专家模式：加载完整上下文 + 启用深度思考 =====
                import asyncio
                _, user_context, archived_summaries = await asyncio.gather(
                    _get_last_response_id(req.user_id),
                    _build_user_context(req.user_id),
                    _get_archived_summaries(req.user_id, req.message),
                )
                system_prompt = _get_chat_system_prompt(user_context, archived_summaries, mode="expert")
                messages = [{"role": "system", "content": system_prompt}]
                for h in req.history[-20:]:
                    messages.append({"role": h.role, "content": h.content})
                messages.append({"role": "user", "content": user_content})

                # 专家模式：显式开启深度思考
                payload = {
                    "model": chat_model,
                    "messages": messages,
                    "stream": True,
                    "max_tokens": 16384,
                    "enable_thinking": True,
                    "stream_options": {"include_usage": True},
                }
                # 多模态模型需指定输出模态为纯文本（思考模式下不支持音频）
                if has_images:
                    payload["modalities"] = ["text"]

                stream_error = None
                try:
                    async with httpx.AsyncClient(timeout=600) as client:
                        async with client.stream("POST", CHAT_COMPLETIONS_URL, headers=HEADERS, json=payload) as response:
                            if response.status_code != 200:
                                await response.aread()
                                err_msg = f"AI服务错误({response.status_code})"
                                yield f"data: {_json.dumps({'error': err_msg}, ensure_ascii=False)}\n\n"
                                return

                            async for line in response.aiter_lines():
                                if not line or not line.startswith("data:"):
                                    continue
                                data_str = line[5:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    chunk = _json.loads(data_str)
                                except _json.JSONDecodeError:
                                    continue

                                choices = chunk.get("choices", [])
                                if not choices:
                                    continue
                                delta = choices[0].get("delta", {})

                                # 思考过程：原样转发，让用户看到完整真实推理流
                                # 不再过滤英文行 —— 避免开头十秒空窗期，也避免删除模型真实推理
                                reasoning = delta.get("reasoning_content", "")
                                if reasoning:
                                    full_thinking += reasoning
                                    yield f"data: {_json.dumps({'thinking_delta': reasoning}, ensure_ascii=False)}\n\n"

                                # 正式回复内容
                                content = delta.get("content", "")
                                if content:
                                    full_text += content
                                    yield f"data: {_json.dumps({'delta': content}, ensure_ascii=False)}\n\n"

                            # 思考结束，通知前端切换到正式回答阶段
                            if full_thinking:
                                yield f"data: {_json.dumps({'thinking_end': True}, ensure_ascii=False)}\n\n"
                except Exception as stream_exc:
                    # 流式中断（如客户端断开/超时）：保存已收到的部分，避免丢消息
                    logger.warning(f"Expert stream interrupted: {stream_exc}, saving partial reply len={len(full_text)}")
                    stream_error = stream_exc

                # 保存助手回复（即使在 try 内中断，finally 已确保执行到这里）
                if full_text:
                    await _save_chat_message(req.user_id, "assistant", full_text)

                elapsed = time.time() - start_time
                logger.info(f"Expert stream chat completed in {elapsed:.1f}s, user={req.user_id}, "
                           f"model={chat_model}, images={len(req.images)}, "
                           f"thinking_len={len(full_thinking)}, reply_len={len(full_text)}")

                yield f"data: {_json.dumps({'done': True}, ensure_ascii=False)}\n\n"

            else:
                # ===== 快速模式：默认不加上下文，关闭思考，极速响应 =====
                # 但若用户问题涉及历史数据查询（如"2022年年报"），仍注入 RAG 检索结果
                archived_summaries_fast = ""
                if _match_time_keyword(req.message):
                    try:
                        archived_summaries_fast = await _get_archived_summaries(req.user_id, req.message)
                    except Exception as e:
                        logger.warning(f"Fast mode RAG retrieval failed: {e}")

                if archived_summaries_fast:
                    sys_content = ("你是智能饮食健康秤的AI助手。用中文简洁回答，不要用emoji。\n"
                                    "你具备视觉能力，可以查看和分析用户发送的图片，不要声称自己无法查看图片。\n\n"
                                    "以下是用户的历史归档数据，请基于这些数据回答用户问题：\n"
                                    + archived_summaries_fast)
                else:
                    sys_content = ("你是智能饮食健康秤的AI助手。用中文简洁回答，不要用emoji。\n"
                                    "你具备视觉能力，可以查看和分析用户发送的图片，不要声称自己无法查看图片。")
                messages = [{"role": "system", "content": sys_content}]
                # 快速模式：仅保留最近3轮对话（6条），最小化上下文以极速响应
                for h in req.history[-6:]:
                    messages.append({"role": h.role, "content": h.content})
                messages.append({"role": "user", "content": user_content})

                # 快速模式：显式关闭思考，极速响应
                payload = {
                    "model": chat_model,
                    "messages": messages,
                    "stream": True,
                    "max_tokens": 1024,
                    "enable_thinking": False,
                    "stream_options": {"include_usage": True},
                }
                # 多模态模型需指定输出模态为纯文本
                if has_images:
                    payload["modalities"] = ["text"]

                try:
                    # 有图片时多模态处理较慢，放宽超时
                    async with httpx.AsyncClient(timeout=180 if has_images else 60) as client:
                        async with client.stream("POST", CHAT_COMPLETIONS_URL, headers=HEADERS, json=payload) as response:
                            if response.status_code != 200:
                                await response.aread()
                                err_msg = f"AI服务错误({response.status_code})"
                                yield f"data: {_json.dumps({'error': err_msg}, ensure_ascii=False)}\n\n"
                                return

                            async for line in response.aiter_lines():
                                if not line or not line.startswith("data:"):
                                    continue
                                data_str = line[5:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    chunk = _json.loads(data_str)
                                except _json.JSONDecodeError:
                                    continue

                                choices = chunk.get("choices", [])
                                if not choices:
                                    continue
                                delta = choices[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    full_text += content
                                    yield f"data: {_json.dumps({'delta': content}, ensure_ascii=False)}\n\n"
                except Exception as stream_exc:
                    logger.warning(f"Fast stream interrupted: {stream_exc}, saving partial reply len={len(full_text)}")

                # 保存助手回复（包括中断时的部分内容）
                if full_text:
                    await _save_chat_message(req.user_id, "assistant", full_text)

                elapsed = time.time() - start_time
                logger.info(f"Fast stream chat completed in {elapsed:.1f}s, user={req.user_id}, reply_len={len(full_text)}")

                yield f"data: {_json.dumps({'done': True}, ensure_ascii=False)}\n\n"

        except Exception as e:
            # 兜底：异常情况下也要保存已收到的部分助手回复
            if full_text:
                try:
                    await _save_chat_message(req.user_id, "assistant", full_text)
                except Exception:
                    pass
            logger.error(f"Stream chat failed: {e}", exc_info=True)
            yield f"data: {_json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


async def _get_last_response_id(user_id: int) -> str:
    """获取用户上次对话的 response_id"""
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                "SELECT last_response_id FROM ai_conversation_state WHERE user_id = $1", user_id
            )
            return row["last_response_id"] if row else ""
    except Exception as e:
        logger.warning(f"Failed to get last response_id: {e}")
        return ""


# 常见问候/简单消息，这类消息不需要加载历史上下文，跳过 previous_response_id 可大幅加速响应
_SIMPLE_GREETINGS = {
    "你好", "您好", "hi", "hello", "hey", "嗨", "在吗", "在么", "在不在",
    "早", "早上好", "中午好", "下午好", "晚上好", "晚安",
    "谢谢", "感谢", "ok", "好的", "嗯", "收到", "了解",
}


def _is_simple_message(message: str) -> bool:
    """判断是否为简单/问候消息。
    这类消息无需 previous_response_id（避免加载完整历史上下文，可大幅降低首字延迟）。
    """
    msg = message.strip().lower()
    if not msg:
        return True
    if msg in _SIMPLE_GREETINGS:
        return True
    # 极短且不含问号或饮食/健康关键词，视为闲聊
    if len(msg) <= 6 and "?" not in msg and "？" not in msg:
        diet_kw = ("吃", "营养", "热量", "卡路里", "蛋白质", "脂肪", "碳水", "饮食",
                   "减脂", "增肌", "健康", "食谱", "秤", "称重")
        if not any(k in msg for k in diet_kw):
            return True
    return False


async def _save_response_id(user_id: int, response_id: str):
    """保存用户的 response_id"""
    try:
        async with get_connection() as conn:
            await conn.execute(
                """INSERT INTO ai_conversation_state (user_id, last_response_id, updated_at)
                   VALUES ($1, $2, NOW())
                   ON CONFLICT (user_id) DO UPDATE SET last_response_id = $2, updated_at = NOW()""",
                user_id, response_id,
            )
    except Exception as e:
        logger.warning(f"Failed to save response_id: {e}")


async def _save_chat_message(user_id: int, role: str, content: str):
    """保存聊天消息到数据库"""
    try:
        async with get_connection() as conn:
            await conn.execute(
                "INSERT INTO chat_messages (user_id, role, content) VALUES ($1, $2, $3)",
                user_id, role, content,
            )
    except Exception as e:
        logger.warning(f"Failed to save chat message: {e}")


async def _get_chat_history(user_id: int, limit: int = 50) -> list:
    """获取用户聊天历史 — 取最近 limit 条，按时间正序返回"""
    try:
        async with get_connection() as conn:
            # 先取最近 limit 条（DESC），再在 Python 中反转为时间正序（ASC）
            # 这样用户即使超过 limit 条消息，最新的对话也不会被吞掉
            rows = await conn.fetch(
                """SELECT role, content, created_at FROM (
                       SELECT role, content, created_at FROM chat_messages
                       WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
                   ) t ORDER BY created_at ASC""",
                user_id, limit,
            )
            return [{"role": r["role"], "content": r["content"], "created_at": str(r["created_at"])} for r in rows]
    except Exception as e:
        logger.warning(f"Failed to get chat history: {e}")
        return []


async def _get_archived_summaries(user_id: int, query: str = "") -> str:
    """获取与用户问题最相关的归档摘要（RAG 检索）。

    架构：把所有周/月/年报的 insights 文本向量化存入 pgvector，
    用户提问时用 query embedding 检索 top-k 最相关的摘要注入 prompt。
    这样既能用上全部历史数据，又不会让 prompt 膨胀到几万字符。

    Read-through cache 模式：
    - 首次访问时，把所有未向量化的归档摘要 embed 并入库
    - 之后的请求直接走向量检索
    """
    if not query or not query.strip():
        # 无 query 时回退：取最近 1 周报 + 1 月报（避免空上下文）
        return await _fallback_recent_summaries(user_id)

    try:
        # 1. 确保 user_analysis_summaries 中所有摘要都已向量化入库
        await _ensure_summaries_embedded(user_id)

        # 1.5 时间关键词识别：如果用户问句含"YYYY年"+"年报/月报/周报"，优先精确按年份匹配
        time_matched = _match_time_keyword(query)
        if time_matched:
            year, s_type = time_matched
            async with get_connection() as conn:
                # 优先取该年的年报；若无则取该年所有月报；再无则取该年所有周报
                rows = []
                if s_type in ("yearly", "all"):
                    rows = await conn.fetch(
                        """SELECT source_date, source_type, content_text FROM user_health_embeddings
                           WHERE user_id=$1 AND source_type='yearly_summary'
                             AND EXTRACT(YEAR FROM source_date)=$2
                           ORDER BY source_date DESC""",
                        user_id, year)
                if not rows:
                    target_type = "monthly_summary" if s_type in ("monthly", "all") else "weekly_summary"
                    rows = await conn.fetch(
                        """SELECT source_date, source_type, content_text FROM user_health_embeddings
                           WHERE user_id=$1 AND source_type=$2
                             AND EXTRACT(YEAR FROM source_date)=$3
                           ORDER BY source_date DESC""",
                        user_id, target_type, year)
            if rows:
                type_label = {"yearly": "年", "monthly": "月", "weekly": "周", "all": ""}.get(s_type, "")
                parts = [f"## 用户询问的{year}年{type_label}报数据（按时间精确匹配）"]
                for r in rows[:8]:
                    s_t_cn = {"yearly_summary": "年", "monthly_summary": "月",
                              "weekly_summary": "周"}.get(r["source_type"], r["source_type"])
                    parts.append(f"- [{s_t_cn}报 {r['source_date']}]\n{r['content_text']}")
                result = "\n".join(parts)
                logger.info(f"[rag] Time-match {year}/{s_type}: {len(rows)} rows, prompt_len={len(result)}")
                return result
            logger.info(f"[rag] Time-match {year}/{s_type}: no rows found, fallback to semantic search")

        # 2. 用 query embedding 检索 top-k 最相关摘要
        query_embedding_list, _ = await call_embedding_api([query])
        if not query_embedding_list or not query_embedding_list[0]:
            logger.warning("Empty query embedding, fallback to recent summaries")
            return await _fallback_recent_summaries(user_id)
        query_vector = query_embedding_list[0]

        results = await similarity_search(
            query_vector=query_vector,
            user_id=user_id,
            top_k=5,
            source_type_filter=["weekly_summary", "monthly_summary", "yearly_summary"],
            similarity_threshold=0.20,  # 摘要文本较长，阈值放低一些
        )

        if not results:
            logger.info(f"[rag] No relevant summaries for query='{query[:30]}', fallback to recent")
            return await _fallback_recent_summaries(user_id)

        # 3. 把检索到的摘要格式化为 prompt 片段
        parts = ["## 与本次问题最相关的历史归档数据（向量检索 top-k）"]
        for r in results:
            s_type = (r.get("source_type") or "").replace("_summary", "")
            s_date = r.get("source_date")
            sim = r.get("similarity", 0)
            # content_text 是 embed 时存入的格式化文本，直接复用
            text = r.get("content_text", "")
            parts.append(f"- [{s_type}报 {s_date} 相似度{sim:.2f}]\n{text}")

        result = "\n".join(parts)
        logger.info(f"[rag] Retrieved {len(results)} summaries for query='{query[:30]}...', prompt_len={len(result)}")
        return result
    except Exception as e:
        logger.warning(f"RAG retrieval failed, fallback to recent: {e}")
        return await _fallback_recent_summaries(user_id)


async def _ensure_summaries_embedded(user_id: int):
    """确保 user_analysis_summaries 中所有摘要都已向量化入库（read-through cache）。

    策略：
    1. 查出所有归档摘要的 (summary_date, summary_type) 列表
    2. 查出 user_health_embeddings 中已存在的 (source_date, source_type) 列表
    3. 对差集批量 embed 入库
    """
    try:
        async with get_connection() as conn:
            # 所有归档摘要
            summaries = await conn.fetch(
                """SELECT summary_date, summary_type, insights FROM user_analysis_summaries
                   WHERE user_id = $1 ORDER BY summary_date ASC""", user_id)
            if not summaries:
                return

            # 已向量化的归档摘要（按 source_date + source_type 去重）
            existing = await conn.fetch(
                """SELECT DISTINCT source_date, source_type FROM user_health_embeddings
                   WHERE user_id = $1
                     AND source_type IN ('weekly_summary','monthly_summary','yearly_summary')""",
                user_id)
            existing_keys = {(r["source_date"], r["source_type"]) for r in existing}

            # 找出待向量化的
            type_map = {"weekly": "weekly_summary", "monthly": "monthly_summary", "yearly": "yearly_summary"}
            to_embed = []
            for r in summaries:
                s_type = type_map.get(r["summary_type"])
                if not s_type:
                    continue
                key = (r["summary_date"], s_type)
                if key in existing_keys:
                    continue
                ins = _parse_insights(r["insights"])
                text = _format_summary_for_embedding(r["summary_date"], r["summary_type"], ins)
                if text:
                    to_embed.append((r["summary_date"], s_type, text, ins))

            if not to_embed:
                return

            logger.info(f"[rag] Embedding {len(to_embed)} new summaries for user={user_id}")
            # 分批 embed（DashScope embedding API 单批最多 25 条）
            BATCH = 25
            total_embedded = 0
            for i in range(0, len(to_embed), BATCH):
                batch = to_embed[i:i + BATCH]
                batch_texts = [t[2] for t in batch]
                embeddings, _ = await call_embedding_api(batch_texts)
                if not embeddings or len(embeddings) != len(batch):
                    logger.warning(f"[rag] Batch {i//BATCH+1} count mismatch: got {len(embeddings) if embeddings else 0}, expected {len(batch)}")
                    continue
                for (s_date, s_type, text, ins), emb in zip(batch, embeddings):
                    await store_embedding(
                        user_id=user_id,
                        embedding=emb,
                        source_text=text,
                        source_type=s_type,
                        source_date=s_date,
                        metadata={"insights": ins},
                    )
                total_embedded += len(batch)
            logger.info(f"[rag] Successfully embedded {total_embedded}/{len(to_embed)} summaries for user={user_id}")
    except Exception as e:
        logger.warning(f"_ensure_summaries_embedded failed: {e}")


def _format_summary_for_embedding(s_date, s_type: str, ins: dict) -> str:
    """把摘要格式化为用于 embedding 的文本（也作为 prompt 注入文本）"""
    try:
        ps = ins.get("period_start", "")
        pe = ins.get("period_end", "")
        total_kcal = ins.get("total_energy_kcal", 0)
        avg_kcal = ins.get("avg_daily_energy_kcal", 0)
        total_p = ins.get("total_protein_g", 0)
        total_f = ins.get("total_fat_g", 0)
        total_c = ins.get("total_carbohydrate_g", 0)
        meals = ins.get("total_meals", 0)
        ai_summary = ins.get("ai_summary", "")
        top_foods = ins.get("top_foods", [])

        type_cn = {"weekly": "周报", "monthly": "月报", "yearly": "年报"}.get(s_type, s_type)
        line = (f"{type_cn}({s_date}) 周期{ps}~{pe}, {meals}餐, "
                f"总热量{total_kcal:.0f}kcal(日均{avg_kcal:.0f}), "
                f"蛋白{total_p:.0f}g/脂肪{total_f:.0f}g/碳水{total_c:.0f}g")
        if top_foods:
            food_names = ", ".join([f"{f.get('name','?')}({f.get('count',0)}次)"
                                    for f in top_foods[:8] if isinstance(f, dict)])
            line += f"\n常吃: {food_names}"
        if ai_summary:
            # 截断 AI 总结避免 embedding 文本过长
            line += f"\nAI总结: {ai_summary[:500]}"
        return line
    except Exception:
        return ""


def _match_time_keyword(query: str):
    """识别问句中的"YYYY年+年报/月报/周报"模式。

    返回 (year, s_type) 元组，其中 s_type ∈ {'yearly','monthly','weekly','all'}。
    无法识别时返回 None。

    Examples:
      "我2022年的年报信息是什么" -> (2022, 'yearly')
      "2020年月报" -> (2020, 'monthly')
      "2023年的数据" -> (2023, 'all')
      "去年的年报" -> None（相对时间暂不处理，避免歧义）
    """
    import re
    m = re.search(r'(20\d{2}|19\d{2})\s*年', query)
    if not m:
        return None
    year = int(m.group(1))
    q_lower = query.lower()
    if "年报" in q_lower or "年度" in q_lower or "annual" in q_lower:
        return (year, "yearly")
    if "月报" in q_lower or "月度" in q_lower or "monthly" in q_lower:
        return (year, "monthly")
    if "周报" in q_lower or "weekly" in q_lower:
        return (year, "weekly")
    # 默认：用户问"YYYY年的数据"但没指定类型，优先取年报
    return (year, "all")


async def _fallback_recent_summaries(user_id: int) -> str:
    try:
        async with get_connection() as conn:
            parts = []
            weekly = await conn.fetchrow(
                """SELECT summary_date, insights FROM user_analysis_summaries
                   WHERE user_id = $1 AND summary_type = 'weekly'
                   ORDER BY summary_date DESC LIMIT 1""", user_id)
            if weekly:
                ins = _parse_insights(weekly["insights"])
                text = _format_summary_for_embedding(weekly["summary_date"], "weekly", ins)
                if text:
                    parts.append(f"- [周报 {weekly['summary_date']}]\n{text}")
            monthly = await conn.fetchrow(
                """SELECT summary_date, insights FROM user_analysis_summaries
                   WHERE user_id = $1 AND summary_type = 'monthly'
                   ORDER BY summary_date DESC LIMIT 1""", user_id)
            if monthly:
                ins = _parse_insights(monthly["insights"])
                text = _format_summary_for_embedding(monthly["summary_date"], "monthly", ins)
                if text:
                    parts.append(f"- [月报 {monthly['summary_date']}]\n{text}")
            return "## 最近历史归档数据\n" + "\n".join(parts) if parts else "暂无历史归档数据"
    except Exception as e:
        logger.warning(f"_fallback_recent_summaries failed: {e}")
        return "暂无历史归档数据"


def _parse_insights(raw) -> dict:
    """解析 insights 字段（asyncpg 可能返回 str 或 dict）"""
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            import json
            return json.loads(raw)
        except:
            return {}
    return {}


async def _build_user_context(user_id: int) -> str:
    """构建用户健康上下文（最近饮食 + 画像）"""
    parts = []
    try:
        async with get_connection() as conn:
            # 最近7天饮食统计
            rows = await conn.fetch(
                """SELECT ingredients, cooked_energy_kcal, cooked_protein_g, cooked_fat_g,
                          cooked_carbohydrate_g, cooking_method, created_at
                   FROM weigh_records
                   WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
                   ORDER BY created_at DESC LIMIT 20""",
                user_id,
            )
            if rows:
                total_kcal = sum((r["cooked_energy_kcal"] or 0) for r in rows)
                total_p = sum((r["cooked_protein_g"] or 0) for r in rows)
                total_f = sum((r["cooked_fat_g"] or 0) for r in rows)
                total_c = sum((r["cooked_carbohydrate_g"] or 0) for r in rows)
                parts.append(f"近7天饮食：共{len(rows)}餐，总热量{total_kcal:.0f}kcal，"
                             f"蛋白质{total_p:.0f}g，脂肪{total_f:.0f}g，碳水{total_c:.0f}g。")
                # 高频食材
                from collections import Counter
                food_cnt = Counter()
                for r in rows:
                    for ing in (r["ingredients"] or []):
                        food_cnt[ing] += 1
                if food_cnt:
                    top = "、".join(f"{k}({v}次)" for k, v in food_cnt.most_common(5))
                    parts.append(f"高频食材：{top}。")
            
            # 用户画像
            profile = await conn.fetchrow(
                """SELECT p.gender, p.age, p.height_cm, p.weight_kg, p.health_goal, p.allergies
                   FROM user_profiles p WHERE p.user_id = $1""", user_id)
            if profile:
                gender_map = {"male": "男", "female": "女"}
                goal_map = {"lose_weight": "减脂", "gain_weight": "增重",
                            "maintain": "维持", "muscle_gain": "增肌", "health_maintenance": "健康管理"}
                parts.append(f"用户：{profile['age'] or '?'}岁{gender_map.get(profile['gender'], '?')}，"
                             f"身高{profile['height_cm'] or '?'}cm，体重{profile['weight_kg'] or '?'}kg，"
                             f"目标：{goal_map.get(profile['health_goal'], '未设定')}。")
                allergies = profile["allergies"]
                if allergies:
                    parts.append(f"过敏：{', '.join(allergies)}。")
    except Exception as e:
        logger.warning(f"Failed to build user context: {e}")
    
    return "\n".join(parts) if parts else "暂无用户健康数据。"


def _get_chat_system_prompt(user_context: str, archived_summaries: str = "", mode: str = "fast") -> str:
    if mode == "expert":
        style_guide = (
            "## 当前对话模式：专家模式（深度思考）\n"
            "## 关于内部思考过程（reasoning_content）的强制要求\n"
            "1. 必须使用中文，严禁出现任何英文单词或英文句子。\n"
            "2. 直接对用户问题进行分析推理，给出你的判断依据和结论方向。\n"
            "3. 严禁在思考中复述、翻译、解释本指令本身的内容。\n"
            "4. 严禁在思考中出现「Analyze」「Draft」「Check」「Structure」「Output」等英文标题或步骤标记。\n"
            "5. 思考要精炼聚焦，一次推演即可，严禁重复相同内容。\n"
            "6. 思考长度控制在200-500字，不要写元指令、不要写输出计划。\n"
            "## 回答要求\n"
            "用中文回复，使用标准Markdown语法输出，不要用emoji。\n"
            "- 使用 **加粗** 突出关键概念、术语和结论；\n"
            "- 使用 ### 小标题分章节组织内容；\n"
            "- 使用有序或无序列表分点罗列数据支撑、原因解释、可执行方案；\n"
            "- 涉及对比数据时使用Markdown表格呈现；\n"
            "- 引用重要结论或补充说明时使用 > 引用块；\n"
            "- 回复正文要详尽完整，单次回复不少于500字，复杂问题可更长；\n"
            "- 避免空话套话，要让用户感受到专业、可信、有用的深度内容。\n"
        )
    else:
        style_guide = (
            "## 当前对话模式：快速模式\n"
            "回答要求：用中文回复，使用标准Markdown语法输出，不要用emoji。\n"
            "- 抓住用户核心问题给出明确回答，可使用 **加粗** 突出重点；\n"
            "- 必要时使用列表补充1-2点要点；\n"
            "- 单次回复长度建议100-300字；\n"
            "- 如用户希望更详细的展开，可提示用户切换到「专家模式」获取深度分析。\n"
        )
    prompt = (
        "你是智能饮食健康秤的AI助手。你可以回答任何问题，用户问什么就答什么，不要强行往饮食话题上靠。\n"
        "## 多模态能力\n"
        "你具备视觉能力，可以查看和分析用户发送的图片。当用户消息中包含图片时：\n"
        "- 直接描述和分析图片内容，不要声称自己无法查看图片或只是文本AI；\n"
        "- 如果图片是食物、营养成分表、体检报告、健康数据等，请结合用户的健康数据给出专业分析；\n"
        "- 如果图片与饮食健康无关（如游戏截图、风景照等），正常回答用户关于图片的问题即可。\n\n"
        f"{style_guide}"
        "以下数据包含该用户的历史饮食报告（周/月/年报）和健康画像，"
        "用户询问饮食、营养、健康相关问题时请基于这些数据给出具体、有依据的回答。"
        "当用户问\"最近爱吃啥\"、\"饮食习惯\"、\"营养状况\"等问题时，请引用具体周/月/年报中的常吃食物和营养数据来回答，"
        "而不是说\"未收录\"。只有当确实没有任何周/月/年报数据时才说明数据不足。\n\n"
        f"## 用户健康数据\n{user_context}"
    )
    if archived_summaries and archived_summaries != "暂无历史归档数据":
        prompt += f"\n\n## 历史饮食归档（周/月/年报，含完整营养数据与AI总结）\n{archived_summaries}"
    return prompt


# ==================== 健康检查 ====================

@router.get("/health", response_model=HealthCheckResponse, summary="RAG服务健康检查")
async def rag_health_check():
    """检查 RAG 服务各组件状态"""
    from database.connection import get_connection
    
    db_status = {"status": "disconnected"}
    try:
        async with get_connection() as conn:
            version = await conn.fetchval("SELECT version()")
            db_status = {"status": "connected", "postgres_version": str(version)[:50]}
    except Exception as e:
        db_status = {"status": "error", "error": str(e)}
    
    return HealthCheckResponse(
        status="ok",
        service="rag-service",
        version="1.0.0",
        database=db_status,
        dashscope_connected=bool(settings.DASHSCOPE_API_KEY),
    )


# ==================== 辅助函数 ====================

def build_query_from_summary(summary, profile) -> str:
    """将当前饮食摘要转为自然语言查询文本，用于向量检索"""
    parts = []
    
    # 基本信息
    gender_str = {"male": "男性", "female": "女性"}.get(profile.gender, "未知")
    goal_map = {
        "lose_weight": "减脂",
        "gain_weight": "增重",
        "maintain": "维持体重",
        "muscle_gain": "增肌",
    }
    goal_str = goal_map.get(profile.health_goal, "健康管理")
    
    parts.append(f"{profile.age or 28}岁{gender_str}用户，身高{profile.height_cm or 170}cm，目标：{goal_str}。")
    
    # 饮食概况
    if summary.avg_daily_calories > 0:
        parts.append(f"日均摄入热量{summary.avg_daily_calories:.0f}kcal。")
    if summary.avg_protein_g > 0:
        parts.append(f"蛋白质{summary.avg_protein_g:.1f}g、脂肪{summary.avg_fat_g:.1f}g、碳水{summary.avg_carbs_g:.1f}g。")
    
    if summary.top_foods:
        foods_str = "、".join(summary.top_foods[:5])
        parts.append(f"高频食材：{foods_str}。")
    
    if summary.cooking_methods_used:
        method_cn = {
            "boil": "煮", "braise": "红烧", "deep_fry": "炸",
            "pan_fry": "煎", "roast": "烤", "steam": "蒸", "stir_fry": "炒",
        }
        methods = [method_cn.get(m, m) for m in summary.cooking_methods_used]
        parts.append(f"烹饪方式：{'、'.join(methods)}。")
    
    if profile.medical_notes:
        parts.append(f"健康状况备注：{profile.medical_notes}。")
    
    if profile.allergies:
        parts.append(f"过敏食物：{'、'.join(profile.allergies)}。")
    
    return "".join(parts)


def build_rag_user_prompt(summary, profile, similar_results) -> str:
    """构建包含 RAG 检索上下文的用户 Prompt"""
    lines = []
    
    lines.append("## 用户当前饮食数据")
    lines.append(f"- 统计周期：{summary.period}")
    lines.append(f"- 平均每日热量：{summary.avg_daily_calories:.0f} kcal")
    lines.append(f"- 平均蛋白质：{summary.avg_protein_g:.1f} g | 脂肪：{summary.avg_fat_g:.1f} g | 碳水：{summary.avg_carbs_g:.1f} g")
    
    if summary.top_foods:
        lines.append(f"- 高频食物：{'、'.join(summary.top_foods[:8])}")
    if summary.cooking_methods_used:
        method_cn = {"boil":"煮","braise":"红烧","deep_fry":"炸","pan_fry":"煎","roast":"烤","steam":"蒸","stir_fry":"炒"}
        methods = [method_cn.get(m, m) for m in summary.cooking_methods_used]
        lines.append(f"- 烹饪方式：{'、'.join(methods)}")
    
    lines.append("")
    lines.append("## 用户画像")
    lines.append(f"- 年龄：{profile.age or '?'}岁 | 性别：{profile.gender or '?'}")
    lines.append(f"- 身高：{profile.height_cm or '?'}cm | 体重：{profile.weight_kg or '?'}kg")
    lines.append(f"- 健康目标：{profile.health_goal or '未设定'}")
    if profile.allergies:
        lines.append(f"- 过敏：{', '.join(profile.allergies)}")
    if profile.medical_notes:
        lines.append(f"- 健康备注：{profile.medical_notes}")
    
    # 注入 RAG 检索到的历史参考
    if similar_results:
        lines.append("")
        lines.append("## 历史相似案例参考（用于辅助生成更精准的建议）")
        for i, r in enumerate(similar_results[:5], 1):
            sim = r.get("similarity", 0)
            text = r.get("source_text", "")
            stype = r.get("source_type", "")
            sdate = r.get("source_date", "")
            lines.append(f"\n### 参考{i} (相似度:{sim:.2%}, 来源:{stype}, 日期:{sdate})")
            lines.append(text[:300] + ("..." if len(text) > 300 else ""))
    
    lines.append("")
    lines.append("请基于以上信息，给出专业的饮食健康建议：")
    
    return "\n".join(lines)
