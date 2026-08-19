"""
RAG 流水线 — 完整的检索增强生成流程
串联：构建查询 → 向量化 → 检索 → 组装Prompt → LLM生成 → 返回结果
"""
import logging
import time
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List

from config import settings
from services.embedding_service import call_embedding_api
from services.retrieval_service import similarity_search, store_embedding
from services.generation_service import generate_text
from prompts.system_prompt import get_system_prompt_for_advice

logger = logging.getLogger(__name__)


class RAGPipeline:
    """
    RAG (Retrieval-Augmented Generation) 完整流水线
    
    处理步骤：
    1. Query Builder: 将结构化数据转为自然语言查询文本
    2. Embedder: 调用 DashScope qwen3.7-text-embedding 生成向量
    3. Retriever: 在 pgvector 中执行余弦相似度检索
    4. Prompt Assembler: 组装系统提示词 + 用户数据 + 历史参考
    5. Generator: 调用 qwen-plus 生成最终建议
    """

    async def run(
        self,
        user_id: int,
        current_summary: Dict[str, Any],
        user_profile: Dict[str, Any],
        advice_type: str = "weekly",
        top_k: int = 5,
    ) -> Dict[str, Any]:
        """
        执行完整 RAG 流水线
        
        Args:
            user_id: 用户ID
            current_summary: 当前饮食摘要数据
            user_profile: 用户画像信息
            advice_type: 建议类型 (weekly/daily/monthly/long_term)
            top_k: 检索返回数量
            
        Returns:
            包含建议内容、参考上下文、Token用量等信息的字典
        """
        pipeline_id = f"rag_{uuid.uuid4().hex[:8]}"
        start_time = time.time()
        
        logger.info(f"[{pipeline_id}] 🚀 Starting RAG pipeline (type={advice_type}, user={user_id})")
        
        try:
            # ========== Step 1: 构建查询文本 ==========
            step1_time = time.time()
            query_text = self._build_query(current_summary, user_profile)
            logger.info(f"[{pipeline_id}] Step1 ✅ Query built ({len(query_text)} chars, {(time.time()-step1_time):.2f}s)")

            # ========== Step 2: 向量化查询文本 ==========
            step2_time = time.time()
            query_embedding, embed_token_usage = await call_embedding_api([query_text])
            if not query_embedding or not query_embedding[0]:
                raise RuntimeError("Embedding generation returned empty result")
            query_vector = query_embedding[0]
            logger.info(f"[{pipeline_id}] Step2 ✅ Query embedded (dim={len(query_vector)}, {(time.time()-step2_time):.2f}s)")

            # ========== Step 3: 检索相似历史记录 ==========
            step3_time = time.time()
            retrieved_records = await similarity_search(
                query_vector=query_vector,
                user_id=user_id,
                top_k=top_k,
            )
            logger.info(f"[{pipeline_id}] Step3 ✅ Retrieved {len(retrieved_records)} records ({(time.time()-step3_time):.2f}s)")

            # ========== Step 4: 组装 Prompt ==========
            step4_time = time.time()
            system_prompt = get_system_prompt_for_advice()
            user_prompt = self._build_prompt(current_summary, user_profile, retrieved_records)
            logger.info(f"[{pipeline_id}] Step4 ✅ Prompt assembled ({len(user_prompt)} chars, {(time.time()-step4_time):.2f}s)")

            # ========== Step 5: LLM 生成 ==========
            step5_time = time.time()
            generation_result = await generate_text(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.7,
                max_tokens=1024,
            )
            advice_content = generation_result["content"]
            token_usage = generation_result.get("token_usage", {})
            logger.info(f"[{pipeline_id}] Step5 ✅ Advice generated ({len(advice_content)} chars, {(time.time()-step5_time):.2f}s)")

            # ========== Step 6: 存储本次查询嵌入（可选）==========
            try:
                await store_embedding(
                    user_id=user_id,
                    embedding=query_vector,
                    source_text=query_text,
                    source_type="advice_query",
                    metadata={"advice_type": advice_type, "pipeline_id": pipeline_id},
                )
            except Exception as e:
                logger.warning(f"[{pipeline_id}] Failed to store query embedding: {e}")

            # ========== 组装结果 ==========
            total_time = time.time() - start_time
            
            result = {
                "pipeline_id": pipeline_id,
                "advice_id": f"adv_{uuid.uuid4().hex[:12]}",
                "advice_type": advice_type,
                "advice_content": advice_content,
                "context": {
                    "retrieved_records": [
                        {
                            "id": r.get("id"),
                            "source_text": r.get("source_text"),
                            "similarity": round(r.get("similarity", 0), 4),
                            "source_type": r.get("source_type"),
                            "source_date": str(r.get("source_date", "")),
                        }
                        for r in retrieved_records
                    ],
                    "record_count": len(retrieved_records),
                    "query_text": query_text[:200] + ("..." if len(query_text) > 200 else ""),
                },
                "token_usage": {
                    "embed_tokens": embed_token_usage,
                    **token_usage,
                },
                "performance": {
                    "total_seconds": round(total_time, 3),
                    "retrieved_count": len(retrieved_records),
                },
                "generated_at": datetime.utcnow().isoformat(),
                "model_used": settings.TEXT_MODEL,
            }

            logger.info(
                f"[{pipeline_id}] 🎉 RAG pipeline completed! "
                f"time={total_time:.2f}s, advice_len={len(advice_content)}, "
                f"contexts={len(retrieved_records)}"
            )

            return result

        except Exception as e:
            logger.error(f"[{pipeline_id}] ❌ RAG pipeline FAILED: {e}", exc_info=True)
            raise

    def _build_query(self, summary: dict, profile: dict) -> str:
        """Step 1: 将结构化摘要数据转为自然语言查询文本"""
        parts = []

        # 用户基本信息
        gender_cn = {"male": "男性", "female": "女性", "other": "其他"}
        goal_cn = {
            "lose_weight": "减脂", "gain_weight": "增重", "maintain": "维持",
            "muscle_gain": "增肌", "health_maintenance": "健康维护",
        }

        age = profile.get("age") or 28
        gender = gender_cn.get(profile.get("gender"), "未知性别")
        height = profile.get("height_cm") or 170
        weight = profile.get("weight_kg") or 65
        goal = goal_cn.get(profile.get("health_goal"), "健康管理")

        parts.append(f"用户为{age}岁{gender}，身高{height}cm，体重{weight}kg，目标是{goal}")

        # 饮食数据
        cal = summary.get("avg_daily_calories", 0)
        protein = summary.get("avg_protein_g", 0)
        fat = summary.get("avg_fat_g", 0)
        carbs = summary.get("avg_carbs_g", 0)

        nutrition_parts = []
        if cal > 0:
            nutrition_parts.append(f"日均摄入{cal:.0f}千卡热量")
        if protein > 0 or fat > 0 or carbs > 0:
            nutrition_parts.append(f"蛋白质{protein:.1f}g、脂肪{fat:.1f}g、碳水化合物{carbs:.1f}g")
        if nutrition_parts:
            parts.append("，".join(nutrition_parts) + "。")

        # 高频食材
        top_foods = summary.get("top_foods", [])
        if top_foods:
            food_names = "、".join(top_foods[:8])
            parts.append(f"高频摄入的食物有：{food_names}。")

        # 烹饪方式
        cooking = summary.get("cooking_methods_used", [])
        if cooking:
            cook_cn = {
                "boil": "煮", "braise": "红烧/炖", "deep_fry": "炸",
                "pan_fry": "煎", "roast": "烤", "steam": "蒸", "stir_fry": "炒",
            }
            methods = [cook_cn.get(m, m) for m in cooking]
            parts.append(f"常用烹饪方式包括：{'、'.join(methods)}。")

        # 健康备注
        medical = profile.get("medical_notes")
        if medical:
            parts.append(f"特别关注：{medical}")

        allergies = profile.get("allergies", [])
        if allergies:
            parts.append(f"过敏食物：{'、'.join(allergies)}")

        health_goals = summary.get("health_goals", [])
        if health_goals:
            parts.append(f"当前健康目标：{'、'.join(health_goals)}")

        return "".join(parts)

    def _build_prompt(self, summary: dict, profile: dict, contexts: list) -> str:
        """Step 4: 组装完整的用户 Prompt（包含系统提示词 + 数据 + RAG上下文）"""
        sections = []

        # === 当前饮食数据 ===
        sections.append("【当前饮食数据分析】")
        sections.append(f"统计周期：{summary.get('period', '最近一周')}")

        cal = summary.get("avg_daily_calories", 0)
        if cal > 0:
            sections.append(f"平均日热量：{cal:.0f} kcal")

        p = summary.get("avg_protein_g", 0)
        f = summary.get("avg_fat_g", 0)
        c = summary.get("avg_carbs_g", 0)
        if p > 0 or f > 0 or c > 0:
            sections.append(f"三大营养素 — 蛋白质:{p:.1f}g | 脂肪:{f:.1f}g | 碳水:{c:.1f}g")

        foods = summary.get("top_foods", [])
        if foods:
            sections.append(f"高频食物 TOP：{' / '.join(foods[:6])}")

        cook = summary.get("cooking_methods_used", [])
        if cook:
            cn = {"boil":"煮","braise":"红烧","deep_fry":"炸","pan_fry":"煎","roast":"烤","steam":"蒸","stir_fry":"炒"}
            sections.append(f"烹饪方式：{'、'.join([cn.get(m,m) for m in cook])}")

        # === 用户画像 ===
        sections.append("\n【用户健康画像】")
        sections.append(f"年龄:{profile.get('age','?')} | 性别:{profile.get('gender','?')}")
        sections.append(f"身高:{profile.get('height_cm','?')}cm | 体重:{profile.get('weight_kg','?')}kg")
        sections.append(f"健康目标:{profile.get('health_goal','未设定')}")

        if profile.get("allergies"):
            sections.append(f"⚠️ 过敏：{', '.join(profile['allergies'])}")
        if profile.get("medical_notes"):
            sections.append(f"📋 医疗备注：{profile['medical_notes']}")

        # === RAG 检索上下文 ===
        if contexts:
            sections.append("\n【历史相似情况参考】")
            sections.append("(以下是从数据库中检索到的与本用户情况相似的历史饮食记录)")
            for i, ctx in enumerate(contexts[:5], 1):
                sim = ctx.get("similarity", 0)
                text = ctx.get("source_text", "")[:250]
                stype = ctx.get("source_type", "")
                sdate = ctx.get("source_date", "")
                sections.append(f"\n--- 案例{i} (相似度:{sim:.1%}, 来源:{stype}, 日期:{sdate}) ---")
                sections.append(text + ("..." if len(ctx.get("source_text", "")) > 250 else ""))

        # === 输出要求 ===
        sections.append("\n请根据以上全部信息，给出专业、具体、可操作的个性化饮食健康建议：")

        return "\n".join(sections)


# 单例实例
pipeline = RAGPipeline()


async def run_advice_generation(
    user_id: int,
    current_summary: dict,
    user_profile: dict,
    advice_type: str = "weekly",
) -> dict:
    """
    便捷方法：直接调用 RAG 流水线生成建议
    
    这是外部调用的主要入口点。
    """
    return await pipeline.run(
        user_id=user_id,
        current_summary=current_summary,
        user_profile=user_profile,
        advice_type=advice_type,
    )
