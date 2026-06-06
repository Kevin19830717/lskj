"""
RAG API 路由
提供文本向量化、向量检索、健康建议生成、体检报告解析等端点
"""
import logging
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from models.schemas import (
    EmbeddingRequest,
    EmbeddingResponse,
    RetrieveRequest,
    RetrieveResponse,
    GenerateAdviceRequest,
    GenerateAdviceResponse,
    HealthCheckResponse,
)
from services.embedding_service import call_embedding_api
from services.retrieval_service import similarity_search, store_embedding
from services.generation_service import generate_text, generate_multimodal

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
        
        # ===== Step 4 & 5: 构建 Prompt + 生成建议 =====
        system_prompt = get_system_prompt_for_advice()
        user_prompt = build_rag_user_prompt(summary, profile, similar_results)
        
        gen_result = await generate_text(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
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
