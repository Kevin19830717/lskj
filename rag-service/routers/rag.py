"""
RAG API 路由
提供文本向量化、向量检索、健康建议生成、体检报告解析等端点
"""
import json
import logging
import re
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
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
    
    - 调用 DashScope qwen3.7-text-embedding API 获取 1024 维向量
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
                "embedding_dim": len(embeddings_list[0]) if embeddings_list else 0,
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
    2. 调用 DashScope qwen3.7-text-embedding 向量化查询
    3. 在 pgvector 中检索 Top-K 相似历史记录
    4. 组装 Prompt（系统提示词 + 当前数据 + 历史参考上下文）
    5. 调用 DashScope qwen3.7-flash-2026-07-15 生成个性化建议
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
    使用 qwen3.7-flash-2026-07-15 多模态模型解析体检报告图片
    
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
                "model_used": result.get("model_used", "qwen3.7-flash-2026-07-15"),
                "file_name": file.filename,
            },
        }
        
    except Exception as e:
        logger.error(f"Medical report parsing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 体检报告持久化存储 + 综合分析 ====================

def _extract_json_block(text: str) -> Optional[dict]:
    """从 LLM 返回文本中鲁棒地提取 JSON 对象（容忍 ```json 围栏和前后噪声）"""
    if not text:
        return None
    cleaned = re.sub(r"```(?:json)?", "", text).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(cleaned[start:end + 1])
    except json.JSONDecodeError:
        return None


def _parse_range_for_stats(normal_range: str):
    """解析参考范围字符串为 (low, high)，供服务端快速异常统计"""
    if not normal_range:
        return None, None
    s = str(normal_range).strip().replace("～", "-").replace("~", "-")
    m = re.match(r"^<?\s*([\d.]+)\s*-?\s*>?\s*([\d.]*)$", s)
    if not m:
        return None, None
    low_s, high_s = m.group(1), m.group(2)
    try:
        low = float(low_s) if low_s else None
    except ValueError:
        low = None
    try:
        high = float(high_s) if high_s else (low if s.startswith("<") or "<" in s[:2] else None)
    except ValueError:
        high = None
    if s.startswith("<") and high is None:
        high = low
        low = None
    if s.startswith(">"):
        low = low if low is not None else high
        high = None
    return low, high


def _compute_quick_stats(indicators: list) -> dict:
    """服务端兜底统计（前端规则引擎随后会用 PUT quick-stats 覆盖为精确值）"""
    total = len(indicators)
    abnormal = significant = 0
    for it in indicators:
        try:
            val = float(str(it.get("value", "")).replace(",", ""))
        except (ValueError, TypeError):
            continue
        low, high = _parse_range_for_stats(it.get("normal_range", ""))
        if high is not None and val > high:
            abnormal += 1
            if high > 0 and val > high * 1.15:
                significant += 1
        elif low is not None and val < low:
            abnormal += 1
    return {"total": total, "abnormal": abnormal, "significant": significant, "risk_levels": []}


async def _gather_medical_context(user_id: int) -> str:
    """
    构建体检综合分析上下文：用户档案 + 近14天餐食营养 + 营养报告摘要
    与 _build_user_context 不同：本函数面向体检解读，聚合维度更全（钠/胆固醇/钙铁钾等）
    """
    parts = []
    try:
        async with get_connection() as conn:
            # 用户画像
            profile = await conn.fetchrow(
                """SELECT p.gender, p.age, p.height_cm, p.weight_kg, p.health_goal, p.allergies
                   FROM user_profiles p WHERE p.user_id = $1""", user_id)
            if profile:
                gender_map = {"male": "男", "female": "女"}
                goal_map = {"lose_weight": "减脂", "gain_weight": "增重", "maintain": "维持",
                            "muscle_gain": "增肌", "health_maintenance": "健康管理"}
                parts.append(f"【用户档案】{profile['age'] or '?'}岁{gender_map.get(profile['gender'], '?')}，"
                             f"身高{profile['height_cm'] or '?'}cm，体重{profile['weight_kg'] or '?'}kg，"
                             f"健康目标：{goal_map.get(profile['health_goal'], '未设定')}。")

            # 近14天餐食营养汇总（日均）
            rows = await conn.fetch(
                """SELECT ingredients, cooked_energy_kcal, cooked_protein_g, cooked_fat_g,
                          cooked_carbohydrate_g, cooked_sodium_mg, cooked_cholesterol_mg,
                          cooked_calcium_mg, cooked_iron_mg, cooked_potassium_mg, created_at
                   FROM weigh_records
                   WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '14 days'
                   ORDER BY created_at DESC LIMIT 60""",
                user_id,
            )
            if rows:
                n = len(rows)
                s = lambda col: sum((r[col] or 0) for r in rows)
                days = max(1, (rows[0]["created_at"] - rows[-1]["created_at"]).days + 1)
                parts.append(
                    f"【近14天餐食记录】共{n}条记录（约{days}天）："
                    f"日均热量{s('cooked_energy_kcal')/days:.0f}kcal，"
                    f"蛋白质{s('cooked_protein_g')/days:.1f}g/天，脂肪{s('cooked_fat_g')/days:.1f}g/天，"
                    f"碳水{s('cooked_carbohydrate_g')/days:.1f}g/天，"
                    f"钠{s('cooked_sodium_mg')/days:.0f}mg/天，胆固醇{s('cooked_cholesterol_mg')/days:.0f}mg/天，"
                    f"钙{s('cooked_calcium_mg')/days:.0f}mg/天，铁{s('cooked_iron_mg')/days:.1f}mg/天，"
                    f"钾{s('cooked_potassium_mg')/days:.0f}mg/天。"
                )
                from collections import Counter
                food_cnt = Counter()
                for r in rows:
                    ings = r["ingredients"]
                    if isinstance(ings, str):
                        try:
                            ings = json.loads(ings)
                        except Exception:
                            ings = []
                    for ing in (ings or []):
                        if isinstance(ing, str) and len(ing) > 1:
                            food_cnt[ing] += 1
                if food_cnt:
                    top = "、".join(f"{k}({v}次)" for k, v in food_cnt.most_common(8))
                    parts.append(f"【高频食材】{top}。")
            else:
                parts.append("【近14天餐食记录】暂无数据。")

            # 营养报告摘要（最近1份周报 + 最近1份月报 + 最近3份日报）
            summaries = await conn.fetch(
                """SELECT summary_type, summary_date, insights FROM user_analysis_summaries
                   WHERE user_id = $1 AND summary_type IN ('daily', 'weekly', 'monthly')
                   ORDER BY summary_date DESC LIMIT 30""",
                user_id,
            )
            picked, seen = [], {"daily": 0, "weekly": 0, "monthly": 0}
            for r in summaries:
                t = r["summary_type"]
                if t == "daily" and seen[t] < 3:
                    picked.append(r); seen[t] += 1
                elif t in ("weekly", "monthly") and seen[t] < 1:
                    picked.append(r); seen[t] += 1
            if picked:
                type_name = {"daily": "日报", "weekly": "周报", "monthly": "月报"}
                blocks = [f"【营养报告·{type_name[r['summary_type']]} {r['summary_date']}】{json.dumps(r['insights'], ensure_ascii=False)[:600]}"
                          for r in picked]
                parts.append("\n".join(blocks))
            else:
                parts.append("【营养报告】暂无数据。")
    except Exception as e:
        logger.warning(f"Failed to gather medical context for user={user_id}: {e}")

    return "\n".join(parts) if parts else "暂无用户健康数据。"


def _compress_image(contents: bytes, max_width: int = 1600, quality: int = 60) -> tuple[bytes, str]:
    """压缩图片：限制宽度上限 + JPEG 重编码。失败时原样返回，不阻断流程。"""
    import io
    from PIL import Image

    try:
        img = Image.open(io.BytesIO(contents))
        # 透明通道（PNG）铺白底，避免转 JPEG 变黑
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        # 只缩不放，保持纵横比
        if img.width > max_width:
            new_h = int(img.height * max_width / img.width)
            img = img.resize((max_width, new_h), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        return buf.getvalue(), "image/jpeg"
    except Exception:
        return contents, "image/jpeg"


async def _ocr_medical_report(file: UploadFile) -> dict:
    """多模态 OCR：体检报告图片 -> 结构化指标 dict"""
    from prompts.system_prompt import get_system_prompt_for_medical_parser
    import base64

    contents = await file.read()
    contents, content_type = _compress_image(contents)
    logger.info(f"OCR image after compress: {len(contents) / 1024:.0f}KB")
    image_base64 = base64.b64encode(contents).decode("utf-8")
    messages = [{
        "role": "user",
        "content": [
            {"image": f"data:{content_type};base64,{image_base64}"},
            {"text": get_system_prompt_for_medical_parser()},
        ],
    }]
    result = await generate_multimodal(messages=messages, max_tokens=4096)
    raw_content = result.get("content", "")
    parsed = _extract_json_block(raw_content)
    if not parsed or not isinstance(parsed.get("indicators"), list) or not parsed["indicators"]:
        logger.warning(
            f"OCR JSON 提取失败 | finish_reason={result.get('finish_reason')} | "
            f"len={len(raw_content)} | head={raw_content[:300]!r} | tail={raw_content[-200:]!r}"
        )
        raise HTTPException(status_code=422, detail="未能从报告中识别出指标，请换一张更清晰的照片")
    return parsed


@router.post("/medical-report/analyze", summary="体检报告综合分析并持久化存储")
async def analyze_medical_report(
    file: UploadFile = File(...),
    user_id: int = Form(...),
):
    """
    完整流水线：OCR 解析体检报告 -> 关联用户餐食记录/营养报告/健康档案 ->
    大模型综合分析 -> 存入 medical_reports 表 -> 返回完整记录
    """
    from prompts.system_prompt import get_system_prompt_for_medical_comprehensive
    from datetime import datetime

    try:
        # 1. OCR 解析
        try:
            parsed = await _ocr_medical_report(file)
        except HTTPException:
            raise
        except Exception as e:
            msg = str(e)
            if "FreeTierOnly" in msg or "Free quota exhausted" in msg:
                raise HTTPException(
                    status_code=402,
                    detail="AI 免费额度已用完：请在阿里云百炼控制台充值或关闭「仅使用免费额度」模式，额度每日会自动重置一部分，明早可再试。",
                )
            raise HTTPException(status_code=502, detail=f"报告识别失败，请稍后重试：{msg[:200]}")
        indicators = parsed.get("indicators", [])

        # 2. 用户健康上下文（档案 + 餐食 + 营养报告）
        context = await _gather_medical_context(user_id)

        # 3. 构建分析输入
        ind_lines = []
        for it in indicators:
            ind_lines.append(
                f"- {it.get('name', '?')}：{it.get('value', '?')}{it.get('unit') or ''} "
                f"（参考范围 {it.get('normal_range') or '未提供'}，状态 {it.get('status') or '未知'}）"
            )
        # 校验 OCR 提取的日期：格式合法且在合理区间才采用，否则兜底为上传日
        raw_date = parsed.get("report_date")
        report_date = datetime.now().strftime("%Y-%m-%d")
        if raw_date:
            try:
                d = datetime.strptime(str(raw_date)[:10], "%Y-%m-%d")
                if datetime(1990, 1, 1) <= d <= datetime.now():
                    report_date = d.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                pass
        user_prompt = (
            f"体检日期：{report_date}\n\n【体检指标】\n" + "\n".join(ind_lines)
            + f"\n\nOCR 摘要：{parsed.get('summary_text', '无')}\n\n{context}"
        )

        # 4. 大模型综合分析（失败不阻断存储，ai_summary 置空由前端兜底）
        # 走 chat/completions 通道（generate_multimodal 也接受纯文本消息）：
        # - enable_thinking:false 在此通道确认生效，仅本处关思考提速，AI对话等不受影响
        # - 默认模型即 VL_MODEL(qwen3.7-flash)，与第1步 OCR 统一模型
        ai_summary = {}
        model_used = ""
        try:
            result = await generate_multimodal(
                messages=[
                    {"role": "system", "content": get_system_prompt_for_medical_comprehensive()},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.4,
                max_tokens=2048,
            )
            model_used = result.get("model_used", "")
            ai_summary = _extract_json_block(result.get("content", "")) or {}
        except Exception as llm_err:
            logger.warning(f"Medical comprehensive analysis LLM failed: {llm_err}")

        # 5. 服务端兜底统计 + 入库
        quick_stats = _compute_quick_stats(indicators)
        parsed_date = None
        try:
            parsed_date = datetime.strptime(str(report_date)[:10], "%Y-%m-%d").date()
        except ValueError:
            parsed_date = datetime.now().date()

        async with get_connection() as conn:
            row = await conn.fetchrow(
                """INSERT INTO medical_reports
                   (user_id, report_date, indicators, ai_summary, quick_stats, model_used)
                   VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6)
                   RETURNING id, user_id, report_date, indicators, ai_summary, quick_stats,
                             model_used, created_at""",
                user_id, parsed_date,
                json.dumps(indicators, ensure_ascii=False),
                json.dumps(ai_summary, ensure_ascii=False),
                json.dumps(quick_stats, ensure_ascii=False),
                model_used,
            )

        record = _row_to_record(row)
        return {"code": 0, "message": "success", "data": record}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Medical report analyze failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _row_to_record(row) -> dict:
    rec = dict(row)
    # asyncpg 默认把 jsonb 列返回为 JSON 字符串，这里统一解析为对象
    for col in ("indicators", "ai_summary", "quick_stats"):
        if isinstance(rec.get(col), str):
            try:
                rec[col] = json.loads(rec[col])
            except json.JSONDecodeError:
                rec[col] = {} if col != "indicators" else []
    rec["report_date"] = rec["report_date"].isoformat() if rec["report_date"] else None
    rec["created_at"] = rec["created_at"].isoformat()
    return rec


@router.get("/medical-report/list", summary="体检报告历史列表")
async def list_medical_reports(
    user_id: int = Query(...),
    limit: int = Query(20, ge=1, le=100),
):
    """返回用户的体检报告历史（按创建时间倒序），轻量字段用于预览卡片"""
    try:
        async with get_connection() as conn:
            rows = await conn.fetch(
                """SELECT id, report_date, quick_stats, created_at,
                          ai_summary->>'overall' AS overall,
                          jsonb_array_length(indicators) AS indicator_count
                   FROM medical_reports WHERE user_id = $1
                   ORDER BY created_at DESC LIMIT $2""",
                user_id, limit,
            )
        return {"code": 0, "message": "success",
                "data": {"items": [_row_to_record(r) for r in rows]}}
    except Exception as e:
        logger.error(f"List medical reports failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/medical-report/{record_id}", summary="体检报告详情")
async def get_medical_report(record_id: int):
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """SELECT id, user_id, report_date, indicators, ai_summary, quick_stats,
                          model_used, created_at
                   FROM medical_reports WHERE id = $1""",
                record_id,
            )
        if not row:
            raise HTTPException(status_code=404, detail="报告不存在")
        return {"code": 0, "message": "success", "data": _row_to_record(row)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get medical report failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class QuickStatsUpdate(BaseModel):
    quick_stats: dict


@router.put("/medical-report/{record_id}/quick-stats", summary="回写前端规则引擎计算结果")
async def update_quick_stats(record_id: int, req: QuickStatsUpdate):
    """前端规则引擎（风险评分等）计算完详情后回写，供列表卡片精确展示"""
    try:
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """UPDATE medical_reports SET quick_stats = $1::jsonb, updated_at = now()
                   WHERE id = $2 RETURNING id""",
                json.dumps(req.quick_stats, ensure_ascii=False), record_id,
            )
        if not row:
            raise HTTPException(status_code=404, detail="报告不存在")
        return {"code": 0, "message": "success", "data": {"id": record_id}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update quick stats failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/medical-report/{record_id}", summary="删除体检报告")
async def delete_medical_report(record_id: int):
    try:
        async with get_connection() as conn:
            row = await conn.fetchval(
                "DELETE FROM medical_reports WHERE id = $1 RETURNING id", record_id)
        if row is None:
            raise HTTPException(status_code=404, detail="报告不存在")
        return {"code": 0, "message": "success", "data": {"id": record_id}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete medical report failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ==================== AI 对话文件上传解析 ====================

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
ALLOWED_TEXT_TYPES = {"text/plain", "text/markdown", "text/csv", "application/json", "text/html"}
ALLOWED_TEXT_EXTS = {".txt", ".md", ".csv", ".json", ".html", ".htm", ".log"}


@router.post("/chat/upload-file", summary="上传文件并解析为文本（供AI对话使用）")
async def chat_upload_file(file: UploadFile = File(...)):
    """
    接受图片或文本文件，解析为纯文本返回。
    - 图片：用 qwen3.7-flash-2026-07-15 多模态模型描述图片内容
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
        # ===== 多模态支持：统一使用 qwen3.7-flash-2026-07-15 =====
        has_images = bool(req.images)
        if has_images:
            user_content = [{"type": "text", "text": req.message or "请分析这张图片"}]
            for img_url in req.images:
                user_content.append({"type": "image_url", "image_url": {"url": img_url}})
        else:
            user_content = req.message
        chat_model = settings.OMNI_MODEL if has_images else settings.TEXT_MODEL

        if req.mode == "expert":
            # 专家模式：加载完整上下文；有图片时跳过 previous_response_id（跨模型记忆不兼容）
            prev_response_id = await _get_last_response_id(req.user_id) if not has_images else None
            user_context = await _build_user_context(req.user_id)
            archived_summaries = await _get_archived_summaries(req.user_id, req.message)
            system_prompt = _get_chat_system_prompt(user_context, archived_summaries, mode="expert")
            messages = [{"role": "system", "content": system_prompt}]
            for h in req.history[-20:]:
                messages.append({"role": h.role, "content": h.content})
            messages.append({"role": "user", "content": user_content})
            result = await call_responses_api(
                messages=messages,
                previous_response_id=prev_response_id,
                model=chat_model,
                temperature=0.5,
                max_tokens=4096,
            )
            if not has_images:
                new_response_id = result.get("response_id", "")
                if new_response_id:
                    await _save_response_id(req.user_id, new_response_id)
        else:
            # 快速模式：无条件走 RAG 检索 + 用户画像
            import asyncio as _asyncio
            user_context_fast, archived_summaries_fast = await _asyncio.gather(
                _build_user_context(req.user_id),
                _get_archived_summaries(req.user_id, req.message) if not has_images else _asyncio.sleep(0, result=""),
            )
            if not isinstance(archived_summaries_fast, str):
                archived_summaries_fast = ""

            if has_images:
                sys_content = "你是智能饮食健康秤的AI助手。你具备视觉能力，可以查看和分析用户发送的图片。当用户消息中包含图片时，请直接描述和分析图片内容。用中文回答。"
            elif archived_summaries_fast:
                sys_content = ("你是智能饮食健康秤的AI助手。用中文简洁回答，不要用emoji，"
                                "不要使用LaTeX公式(如$...$)，用中文文字表达计算。\n\n"
                                f"## 用户信息\n{user_context_fast}\n\n"
                                "## 历史归档数据\n"
                                + archived_summaries_fast)
            else:
                sys_content = ("你是智能饮食健康秤的AI助手。用中文简洁回答，"
                                "不要用emoji，不要使用LaTeX公式(如$...$)，用中文文字表达计算。")
            messages = [{"role": "system", "content": sys_content}]
            for h in req.history[-10:]:
                messages.append({"role": h.role, "content": h.content})
            messages.append({"role": "user", "content": user_content})
            result = await call_responses_api(
                messages=messages,
                model=chat_model,
                temperature=0.7,
                max_tokens=16384,
            )

        elapsed = time.time() - start_time
        logger.info(f"Chat completed in {elapsed:.1f}s, user={req.user_id}, mode={req.mode}, model={chat_model}, has_images={has_images}")

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

                # 专家模式：开启深度思考，充足思考预算确保完整推理
                payload = {
                    "model": chat_model,
                    "messages": messages,
                    "stream": True,
                    "max_tokens": 16384,
                    "enable_thinking": True,
                    "thinking_budget": 2048,  # 充足思考预算，避免截断导致思考混入正文
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
                # ===== 快速模式：注入用户画像 + 最近归档 + 时间关键词触发完整 RAG =====
                import asyncio
                user_context_fast, archived_summaries_fast, recent_summaries_fast = await asyncio.gather(
                    _build_user_context(req.user_id),
                    _get_archived_summaries(req.user_id, req.message),
                    _fallback_recent_summaries(req.user_id),
                )
                # asyncio.gather 的 sleep 返回 None，需处理
                if not isinstance(archived_summaries_fast, str):
                    archived_summaries_fast = ""

                if archived_summaries_fast:
                    sys_content = ("你是智能饮食健康秤的AI助手。用中文简洁回答，不要用emoji，"
                                    "不要使用LaTeX公式(如$...$)，用中文文字表达计算。\n\n"
                                    f"## 用户信息\n{user_context_fast}\n\n"
                                    "## 历史归档数据\n"
                                    + archived_summaries_fast)
                elif recent_summaries_fast:
                    sys_content = ("你是智能饮食健康秤的AI助手。用中文简洁回答，不要用emoji，"
                                    "不要使用LaTeX公式(如$...$)，用中文文字表达计算。\n\n"
                                    f"## 用户信息\n{user_context_fast}\n\n"
                                    + recent_summaries_fast)
                else:
                    sys_content = ("你是智能饮食健康秤的AI助手。用中文简洁回答，不要用emoji，"
                                    "不要使用LaTeX公式(如$...$)，用中文文字表达计算。\n\n"
                                    f"## 用户信息\n{user_context_fast}\n\n"
                                    "请基于用户的个人数据（性别、年龄、身高、体重、目标、近期饮食）给出针对性回答。")
                messages = [{"role": "system", "content": sys_content}]
                # 快速模式：仅保留最近3轮对话（6条），最小化上下文以极速响应
                for h in req.history[-6:]:
                    messages.append({"role": h.role, "content": h.content})
                messages.append({"role": "user", "content": user_content})

                # 快速模式：显式关闭思考，极速响应，16384 tokens 保证不截断
                payload = {
                    "model": chat_model,
                    "messages": messages,
                    "stream": True,
                    "max_tokens": 16384,
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

        # 1.5 时间关键词识别：支持绝对年份(2024年)、相对时间(3年前/去年)、时间段(这7年)等
        time_matched = _match_time_keyword(query)
        if time_matched:
            if time_matched[0] == "recent":
                # "最近/近期" → 直接取最近归档，不走语义检索
                logger.info(f"[rag] Recent-time query detected, using fallback summaries")
                return await _fallback_recent_summaries(user_id)
            if len(time_matched) == 4 and time_matched[2] == "range":
                # 时间段范围查询："这7年" → (2020, 2026, "range")
                start_year, end_year, _, _ = time_matched
                async with get_connection() as conn:
                    rows = await conn.fetch(
                        """SELECT source_date, source_type, content_text FROM user_health_embeddings
                           WHERE user_id=$1 AND source_type='yearly_summary'
                             AND EXTRACT(YEAR FROM source_date) >= $2
                             AND EXTRACT(YEAR FROM source_date) <= $3
                           ORDER BY source_date ASC""",
                        user_id, start_year, end_year)
                if rows:
                    parts = [f"## 用户{start_year}-{end_year}年全部年报数据（按时间排序）"]
                    for r in rows:
                        label = _format_summary_label(r["source_date"], "yearly")
                        parts.append(f"- [{label}]\n{r['content_text']}")
                    result = "\n".join(parts)
                    logger.info(f"[rag] Range-match {start_year}-{end_year}: {len(rows)} yearly summaries, prompt_len={len(result)}")
                    return result
                logger.info(f"[rag] Range-match {start_year}-{end_year}: no rows found, fallback to semantic search")
                # 无年报范围数据，继续走语义检索
            else:
                # 单年单类型匹配
                year, s_type = time_matched[0], time_matched[1]
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
                        s_t = (r["source_type"] or "").replace("_summary", "")
                        label = _format_summary_label(r["source_date"], s_t)
                        parts.append(f"- [{label}]\n{r['content_text']}")
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
            label = _format_summary_label(s_date, s_type)
            parts.append(f"- [{label} 相似度{sim:.2f}]\n{text}")

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


def _format_summary_label(s_date, s_type: str) -> str:
    """生成人类可读的报告标签，例如「2025年3月」「2025年」「2026-07-06~2026-07-12」"""
    if not isinstance(s_date, (str, type(None))):
        try:
            s_date = str(s_date)
        except Exception:
            s_date = ""
    if not s_date:
        return s_type

    parts = s_date.split("-")
    try:
        year = int(parts[0])
        month = int(parts[1]) if len(parts) >= 2 else 0
        day = int(parts[2]) if len(parts) >= 3 else 0
    except (ValueError, IndexError):
        return f"{s_type}({s_date})"

    if s_type == "yearly":
        return f"{year}年"
    elif s_type == "monthly":
        return f"{year}年{month}月"
    elif s_type == "weekly":
        # 周报显示日期区间：2026-07-06~2026-07-12
        from datetime import date, timedelta
        try:
            d = date(year, month, day)
            end = d + timedelta(days=6)
            return f"{d.isoformat()}~{end.isoformat()}"
        except (ValueError, IndexError):
            return f"{s_date}"
    else:
        return f"{s_type}({s_date})"


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

        label = _format_summary_label(s_date, s_type)
        line = (f"{label} 周期{ps}~{pe}, {meals}餐, "
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
    """识别问句中的时间模式。

    返回：
      - (year, s_type) 元组：s_type ∈ {'yearly','monthly','weekly','all'}
      - ("recent", None)：最近/近期等相对时间
      - None：无法识别

    Examples:
      "我2022年的年报信息是什么" -> (2022, 'yearly')
      "三年前吃什么比较多"     -> (当前年-3, 'all')
      "去年饮食"               -> (当前年-1, 'all')
      "最近饮食怎么样"          -> ("recent", None)
    """
    import re
    from datetime import datetime

    current_year = datetime.now().year

    def _parse_number(s: str):
        """解析中文或阿拉伯数字，如 '3'→3, '三'→3, '十二'→12"""
        cn = {'零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
              '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}
        s = s.strip()
        if s.isdigit():
            return int(s)
        if len(s) == 1 and s in cn:
            return cn[s]
        if '十' in s:
            parts = s.split('十')
            tens = (cn.get(parts[0], 1) if parts[0] else 1) * 10
            ones = cn.get(parts[1], 0) if len(parts) > 1 and parts[1] else 0
            return tens + ones
        return None

    # 1. 相对年份：X年前（支持中文和阿拉伯数字，如"三年前"/"1年前"/"十二年前"）
    m = re.search(r'([一二两三四五六七八九十\d]+)\s*年前', query)
    if m:
        n = _parse_number(m.group(1))
        if n:
            return _resolve_type(query, current_year - n)

    # 2. "去年" / "前年"
    if re.search(r'去年', query):
        return _resolve_type(query, current_year - 1)
    if re.search(r'前年', query):
        return _resolve_type(query, current_year - 2)

    # 3. 绝对年份：20XX年
    m = re.search(r'(20\d{2}|19\d{2})\s*年', query)
    if m:
        return _resolve_type(query, int(m.group(1)))

    # 4. 时间段："这X年"/"过去X年"/"X年的" → 返回最早年份到当前年份范围
    m = re.search(r'(?:这|过去(?:的)?|最近)([一二两三四五六七八九十\d]+)\s*年', query)
    if m:
        n = _parse_number(m.group(1))
        if n:
            # 返回(start_year, end_year, 'range')→检索该年份范围的全部归档数据
            return (current_year - n + 1, current_year, "range")
    # "X年的营养" 等变体
    m = re.search(r'([一二两三四五六七八九十\d]+)\s*年的(?:营养|饮食|数据)', query)
    if m:
        n = _parse_number(m.group(1))
        if n:
            return (current_year - n + 1, current_year, "range")

    # 5. 最近/近期/这周/这个月 等相对时间 → 走 fallback 取最近归档
    if re.search(r'最近|近期|这段|这周|这个月|近几|上个?月|上个?周|这段时间', query):
        return ("recent", None)

    return None


def _resolve_type(query: str, year: int):
    """根据问句中的关键词解析摘要类型"""
    q_lower = query.lower()
    if "年报" in q_lower or "年度" in q_lower or "annual" in q_lower:
        return (year, "yearly")
    if "月报" in q_lower or "月度" in q_lower or "monthly" in q_lower:
        return (year, "monthly")
    if "周报" in q_lower or "weekly" in q_lower:
        return (year, "weekly")
    return (year, "all")


async def _fallback_recent_summaries(user_id: int) -> str:
    """获取最近归档摘要：2周报 + 2月报 + 1年报，提供完整的近期饮食全景"""
    try:
        async with get_connection() as conn:
            parts = []
            # 最近2份周报
            weekly_rows = await conn.fetch(
                """SELECT summary_date, insights FROM user_analysis_summaries
                   WHERE user_id = $1 AND summary_type = 'weekly'
                   ORDER BY summary_date DESC LIMIT 2""", user_id)
            for r in weekly_rows:
                ins = _parse_insights(r["insights"])
                text = _format_summary_for_embedding(r["summary_date"], "weekly", ins)
                if text:
                    label = _format_summary_label(r["summary_date"], "weekly")
                    parts.append(f"- [{label}]\n{text}")
            # 最近2份月报
            monthly_rows = await conn.fetch(
                """SELECT summary_date, insights FROM user_analysis_summaries
                   WHERE user_id = $1 AND summary_type = 'monthly'
                   ORDER BY summary_date DESC LIMIT 2""", user_id)
            for r in monthly_rows:
                ins = _parse_insights(r["insights"])
                text = _format_summary_for_embedding(r["summary_date"], "monthly", ins)
                if text:
                    label = _format_summary_label(r["summary_date"], "monthly")
                    parts.append(f"- [{label}]\n{text}")
            # 最近1份年报
            yearly = await conn.fetchrow(
                """SELECT summary_date, insights FROM user_analysis_summaries
                   WHERE user_id = $1 AND summary_type = 'yearly'
                   ORDER BY summary_date DESC LIMIT 1""", user_id)
            if yearly:
                ins = _parse_insights(yearly["insights"])
                text = _format_summary_for_embedding(yearly["summary_date"], "yearly", ins)
                if text:
                    label = _format_summary_label(yearly["summary_date"], "yearly")
                    parts.append(f"- [{label}]\n{text}")
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
                    ings = r["ingredients"]
                    # 兼容 JSONB 返回 list 或 JSON 字符串两种情况
                    if isinstance(ings, str):
                        try: ings = json.loads(ings)
                        except: ings = []
                    for ing in (ings or []):
                        if isinstance(ing, str) and len(ing) > 1:  # 过滤单字/单字符噪声
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
                    # 兼容 JSONB 数组或逗号分隔文本
                    if isinstance(allergies, str):
                        try:
                            allergies = json.loads(allergies)
                        except:
                            allergies = [a.strip() for a in allergies.split(",") if a.strip()]
                    if isinstance(allergies, list) and len(allergies) > 0:
                        parts.append(f"过敏：{', '.join(str(a) for a in allergies)}。")
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
            "- 回复正文控制在 300-500 字，用最精炼的语言呈现核心结论和建议；\n"
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
        "不要使用LaTeX公式(如$...$或$$...$$)，用中文文字自然表达计算过程和结果。\n"
        "标题和正文结论必须一致，不要出现标题说\"严重超标\"但结论说\"完全达标\"的矛盾。\n"
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


# ==================== 营养预测 API（LightGBM 多输出模型） ====================
import pickle
import os as _os
import numpy as np

_MODEL_PATH = _os.environ.get(
    "LGBM_MODEL_PATH",
    _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), "..", "nutrition_lgbm_complete", "lgbm_output_multi", "multi_output_model.pkl")
)
_lgbm_model_cache = None

TARGET_COLS_PREDICT = [
    "cooked_weight_g", "cooked_energy_kcal", "cooked_protein_g",
    "cooked_fat_g", "cooked_carbohydrate_g", "cooked_sodium_mg",
    "cooked_cholesterol_mg", "cooked_vitamin_c_mg", "cooked_calcium_mg",
    "cooked_iron_mg", "cooked_potassium_mg"
]

def _load_lgbm_model():
    global _lgbm_model_cache
    if _lgbm_model_cache is not None:
        return _lgbm_model_cache
    path = _os.path.abspath(_MODEL_PATH)
    with open(path, "rb") as f:
        saved = pickle.load(f)
    _lgbm_model_cache = saved
    return saved

def predict_nutrients_sync(ingredients, weights, cooking_method):
    """同步调用 LightGBM 预测 11 营养素"""
    import pandas as pd
    import numpy as np
    saved = _load_lgbm_model()
    model = saved["model"]
    feature_cols = saved["feature_cols"]
    le_method = saved["le_method"]
    row = {col: 0 for col in feature_cols}
    for ing in ingredients:
        key = f"ing_{ing}"
        if key in row:
            row[key] = 1
    for i, w in enumerate(weights[:4]):
        row[f"raw_weight_{i+1}"] = w
    row["raw_weight_total"] = sum(weights)
    row["raw_weight_mean"] = sum(weights) / max(len(weights), 1)
    row["n_ingredients"] = len(ingredients)
    row["has_fruit"] = 1 if any(i in ["apple","banana","grape","kiwi","kumquat","lemon","orange","peach","pineapple","strawberry","watermelon"] for i in ingredients) else 0
    row["has_meat"] = 1 if any(i in ["beef","chicken","pork","shrimp","fish"] for i in ingredients) else 0
    try:
        row["cooking_method_enc"] = le_method.transform([cooking_method])[0]
    except:
        row["cooking_method_enc"] = 0
    X = pd.DataFrame([row], columns=feature_cols)
    preds = model.predict(X)[0]
    result = {}
    for i, col in enumerate(TARGET_COLS_PREDICT):
        val = float(preds[i])
        if col in ("cooked_weight_g", "cooked_energy_kcal", "cooked_vitamin_c_mg", "cooked_calcium_mg", "cooked_sodium_mg", "cooked_cholesterol_mg", "cooked_iron_mg"):
            val = max(0, val)
        result[col] = round(val, 1)
    return result

class PredictNutrientsRequest(BaseModel):
    ingredients: list
    weights: list
    cooking_method: str = "stir_fry"

@router.post("/predict-nutrients")
async def api_predict_nutrients(req: PredictNutrientsRequest):
    """调用 LightGBM 模型预测 11 营养素"""
    import asyncio
    result = await asyncio.to_thread(predict_nutrients_sync, req.ingredients, req.weights, req.cooking_method)
    return {"code": 0, "data": result}
