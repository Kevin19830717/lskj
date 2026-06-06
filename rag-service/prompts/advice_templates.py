"""
建议生成模板
构建不同场景下的 prompt 模板
"""
from typing import Dict, Any


def build_advice_user_prompt(
    current_summary: Dict[str, Any],
    user_profile: Dict[str, Any],
    retrieved_contexts: list,
) -> str:
    """
    构建生成健康建议的用户侧 Prompt
    
    Args:
        current_summary: 当前饮食摘要数据
        user_profile: 用户画像
        retrieved_contexts: 从向量库检索到的历史记录列表
        
    Returns:
        格式化后的用户提示词
    """
    # 格式化当前饮食数据
    period = current_summary.get("period", "未知周期")
    calories = current_summary.get("avg_daily_calories", 0)
    protein = current_summary.get("avg_protein_g", 0)
    fat = current_summary.get("avg_fat_g", 0)
    carbs = current_summary.get("avg_carbs_g", 0)
    top_foods = current_summary.get("top_foods", [])
    cooking_methods = current_summary.get("cooking_methods_used", [])
    health_goals = current_summary.get("health_goals", [])

    # 格式化用户画像
    age = user_profile.get("age", "未知")
    gender = user_profile.get("gender", "未知")
    height = user_profile.get("height_cm", "未知")
    weight = user_profile.get("weight_kg", "未知")
    health_goal = user_profile.get("health_goal", "未设置")
    allergies = user_profile.get("allergies", [])
    medical_notes = user_profile.get("medical_notes", "无")

    # 格式化检索到的上下文
    context_section = ""
    if retrieved_contexts:
        context_lines = []
        for i, ctx in enumerate(retrieved_contexts[:5], 1):
            text = ctx.get("source_text", "")
            sim = ctx.get("similarity", 0)
            context_lines.append(f"[参考{i}] (相似度:{sim:.2f}) {text}")
        context_section = "\n".join(context_lines)
    else:
        context_section = "（暂无相似历史记录）"

    # 组装完整 Prompt
    prompt = f"""## 当前用户基本信息
- 性别/年龄：{gender} / {age}岁
- 身高/体重：{height}cm / {weight}kg
- 健康目标：{health_goal}
- 过敏史：{', '.join(allergies) if allergies else '无'}
- 医学备注：{medical_notes}

## 本{period.replace('至','至').replace(' ','')} 饮食数据汇总
- 平均每日热量摄入：{calories:.0f} kcal
- 蛋白质：{protein:.1f}g | 脂肪：{fat:.1f}g | 碳水：{carbs:.1f}g
- 高频食物：{', '.join(top_foods) if top_foods else '无记录'}
- 烹饪方式：{', '.join(cooking_methods) if cooking_methods else '无记录'}
- 设定健康目标：{', '.join(health_goals) if health_goals else '未设置'}

## 历史相似饮食记录（供参考）
{context_section}

---

请根据以上信息，结合你的专业判断，为该用户生成个性化的饮食健康建议。重点关注热量平衡和宏量营养素分配的合理性，并针对其具体目标和健康状况给出可行建议。"""

    return prompt


def build_medical_report_prompt(extra_prompt: str = None) -> str:
    """构建解析体检报告的用户提示词"""
    base = (
        "请仔细阅读这张体检报告图片，"
        "提取所有可见的检验指标并以标准JSON格式返回。\n"
        "请包含每个指标的名称、数值、单位、参考范围、以及是否异常的状态标注。"
    )
    if extra_prompt:
        base += f"\n\n额外要求：{extra_prompt}"
    return base


def build_query_from_summary(summary: Dict[str, Any]) -> str:
    """
    将结构化的饮食摘要转换为自然语言查询文本
    用于向量检索时的语义匹配
    """
    parts = [
        f"日均热量{summary.get('avg_daily_calories', 0):.0f}千卡",
        f"蛋白质{summary.get('avg_protein_g', 0):.1f}克",
        f"脂肪{summary.get('avg_fat_g', 0):.1f}克",
        f"碳水{summary.get('avg_carbs_g', 0):.1f}克",
    ]
    
    foods = summary.get("top_foods", [])
    if foods:
        parts.append(f"常吃食物包括{', '.join(foods[:5])}")
    
    cooking = summary.get("cooking_methods_used", [])
    if cooking:
        parts.append(f"烹饪方式有{', '.join(cooking)}")
    
    goals = summary.get("health_goals", [])
    if goals:
        parts.append(f"健康目标是{', '.join(goals)}")
    
    return "。".join(parts) + "。"
