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
from services.generation_service import call_responses_api, generate_multimodal, RESPONSES_URL, HEADERS
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
        # 1. 获取用户最近的 response_id（用于多轮记忆）
        prev_response_id = await _get_last_response_id(req.user_id)

        # 2. 获取用户健康上下文 + 分层归档摘要
        user_context = await _build_user_context(req.user_id)
        archived_summaries = await _get_archived_summaries(req.user_id)

        # 3. 组装 system prompt（含用户画像 + 归档知识库）
        system_prompt = _get_chat_system_prompt(user_context, archived_summaries)

        # 4. 组装 messages（system + 历史10轮 + 当前消息；历史做兜底防止 previous_response_id 截断丢上下文）
        messages = [{"role": "system", "content": system_prompt}]
        for h in req.history[-20:]:
            messages.append({"role": h.role, "content": h.content})
        messages.append({"role": "user", "content": req.message})

        # 5. 调用 Responses API
        result = await call_responses_api(
            messages=messages,
            previous_response_id=prev_response_id,
            temperature=0.7,
            max_tokens=2048,
        )

        # 6. 保存 response_id 供下次使用
        new_response_id = result.get("response_id", "")
        if new_response_id:
            await _save_response_id(req.user_id, new_response_id)

        elapsed = time.time() - start_time
        logger.info(f"Chat completed in {elapsed:.1f}s, user={req.user_id}, response_id={new_response_id}")

        return ChatResponse(
            reply=result["content"],
            model_used=result.get("model_used", settings.TEXT_MODEL),
        )

    except Exception as e:
        logger.error(f"Chat failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"对话失败: {str(e)}")


# ==================== AI 流式对话 ====================

@router.get("/chat/history", summary="获取聊天历史记录")
async def get_chat_history(user_id: int, limit: int = 50):
    """获取用户聊天历史记录"""
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


@router.post("/chat/stream", summary="AI健康对话(流式)")
async def chat_stream(req: ChatRequest):
    """
    AI 健康对话流式输出 — 使用 Responses API stream=True
    返回 Server-Sent Events (SSE)，每行 data: {"delta": "文本片段"}
    """
    from fastapi.responses import StreamingResponse
    import json as _json
    import time

    start_time = time.time()

    async def event_generator():
        try:
            import asyncio
            # 并行查询，减少等待时间
            prev_response_id, user_context, archived_summaries = await asyncio.gather(
                _get_last_response_id(req.user_id),
                _build_user_context(req.user_id),
                _get_archived_summaries(req.user_id),
            )
            system_prompt = _get_chat_system_prompt(user_context, archived_summaries)

            # 简单问候消息跳过历史上下文(previous_response_id)，
            # 避免加载完整对话历史导致首字延迟过高（如"你好"原本要16-18s）
            use_history = not _is_simple_message(req.message)
            if not use_history:
                prev_response_id = ""
                logger.info(f"Simple message detected, skipping previous_response_id for user={req.user_id}")

            messages = [{"role": "system", "content": system_prompt}]
            # 注入最近历史对话（10轮=20条），确保上下文不丢失
            # previous_response_id 可能因长回复被截断，这里提供可靠兜底
            for h in req.history[-20:]:
                messages.append({"role": h.role, "content": h.content})
            messages.append({"role": "user", "content": req.message})

            payload = {
                "model": settings.TEXT_MODEL,
                "input": messages,
                "stream": True,
                "max_output_tokens": 2048,
            }
            if prev_response_id:
                payload["previous_response_id"] = prev_response_id

            full_text = ""
            new_response_id = ""

            async with httpx.AsyncClient(timeout=120) as client:
                async with client.stream("POST", RESPONSES_URL, headers=HEADERS, json=payload) as response:
                    if response.status_code != 200:
                        body = await response.aread()
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
                            event = _json.loads(data_str)
                        except _json.JSONDecodeError:
                            continue

                        event_type = event.get("type", "")

                        if event_type == "response.created" or event_type == "response.in_progress":
                            resp = event.get("response", {})
                            if resp.get("id"):
                                new_response_id = resp["id"]

                        elif event_type == "response.output_text.delta":
                            delta = event.get("delta", "")
                            if delta:
                                full_text += delta
                                yield f"data: {_json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"

                        elif event_type == "response.completed":
                            resp = event.get("response", {})
                            if resp.get("id"):
                                new_response_id = resp["id"]
                            break

            if new_response_id:
                await _save_response_id(req.user_id, new_response_id)

            # 保存聊天记录到数据库
            if full_text:
                await _save_chat_message(req.user_id, "user", req.message)
                await _save_chat_message(req.user_id, "assistant", full_text)

            elapsed = time.time() - start_time
            logger.info(f"Stream chat completed in {elapsed:.1f}s, user={req.user_id}, response_id={new_response_id}")

            yield f"data: {_json.dumps({'done': True}, ensure_ascii=False)}\n\n"

        except Exception as e:
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
    """获取用户聊天历史"""
    try:
        async with get_connection() as conn:
            rows = await conn.fetch(
                """SELECT role, content, created_at FROM chat_messages
                   WHERE user_id = $1 ORDER BY created_at ASC LIMIT $2""",
                user_id, limit,
            )
            return [{"role": r["role"], "content": r["content"], "created_at": str(r["created_at"])} for r in rows]
    except Exception as e:
        logger.warning(f"Failed to get chat history: {e}")
        return []


async def _get_archived_summaries(user_id: int) -> str:
    """获取用户归档摘要（精简版，仅最近2条周报+1条月报）"""
    parts = []
    try:
        async with get_connection() as conn:
            # 最近2条周度摘要
            weekly_rows = await conn.fetch(
                """SELECT summary_date, insights FROM user_analysis_summaries
                   WHERE user_id = $1 AND summary_type = 'weekly'
                   ORDER BY summary_date DESC LIMIT 2""", user_id)
            if weekly_rows:
                parts.append("## 每周饮食趋势")
                for r in weekly_rows:
                    ins = _parse_insights(r["insights"])
                    avg = ins.get("avg_daily_energy_kcal", 0)
                    parts.append(f"- 周报({r['summary_date']}): 日均{avg:.0f}kcal")

            # 最近1条月度摘要
            monthly_rows = await conn.fetch(
                """SELECT summary_date, insights FROM user_analysis_summaries
                   WHERE user_id = $1 AND summary_type = 'monthly'
                   ORDER BY summary_date DESC LIMIT 1""", user_id)
            if monthly_rows:
                parts.append("\n## 月度饮食总结")
                for r in monthly_rows:
                    ins = _parse_insights(r["insights"])
                    avg = ins.get("avg_daily_energy_kcal", 0)
                    parts.append(f"- 月报({r['summary_date']}): 日均{avg:.0f}kcal")

    except Exception as e:
        logger.warning(f"Failed to get archived summaries: {e}")

    return "\n".join(parts) if parts else "暂无历史归档数据"


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


def _get_chat_system_prompt(user_context: str, archived_summaries: str = "") -> str:
    prompt = (
        "你是智能饮食健康秤的AI助手。你可以回答任何问题，用户问什么就答什么，不要强行往饮食话题上靠。\n"
        "回答要求：用中文，简洁直接，不要用emoji，不要过度展开。"
        "只有用户主动询问饮食健康时才参考以下数据。\n\n"
        f"## 用户健康数据\n{user_context}"
    )
    if archived_summaries and archived_summaries != "暂无历史归档数据":
        prompt += f"\n\n## 历史饮食归档\n{archived_summaries}"
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
