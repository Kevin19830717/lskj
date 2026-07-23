"""
烹饪营养预测训练数据生成脚本（连锁反应模型 v2）
=================================================
核心思想：只随机化少数"烹饪条件参数"（水分、添加油/盐/糖、热强度、水溶流失），
所有营养变化都由这些条件物理推导，保证能量守恒和营养一致性。

v2 修复：
  1. 能量始终由 Atwater 公式推导（4×蛋白+9×脂肪+4×碳水），不做独立clamp
  2. 调整油/盐/糖参数，使熟重变化符合真实烹饪物理
  3. 已删除膳食纤维（final.json中该字段缺失严重）

使用方法：
  python generate_training_data.py --output training_data --samples 20000 --seed 42
  python generate_training_data.py --output test --samples 100 --csv-only
"""

import json
import random
import argparse
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional


# ============================================================================
# 1. 烹饪方式参数表（基准值）
#    核心参数：water_ratio, oil_added, salt_added, sugar_added
#    保留率：各营养素在烹饪过程中的保留比例
# ============================================================================

COOKING_PARAMS = {
    # ------------------------------------------------------------------
    # steam（蒸）：微失水、不添油、少盐、维C中等损失
    # 预期熟重变化：-3%~-8%
    # ------------------------------------------------------------------
    "steam": {
        "water_ratio": 0.95,
        "oil_added_g_per_100g": 0,
        "salt_added_mg_per_100g": 300,
        "sugar_added_g_per_100g": 0,
        "protein_retention": 0.95,
        "fat_retention": 0.98,
        "carb_retention": 1.00,
        "sodium_retention": 1.00,
        "potassium_retention": 0.90,
        "calcium_retention": 1.00,
        "iron_retention": 1.00,
        "vit_c_retention": 0.50,
    },
    # ------------------------------------------------------------------
    # boil（煮）：吸水、不添油、少盐、水溶性营养流失大
    # 预期熟重变化：+5%~+15%
    # ------------------------------------------------------------------
    "boil": {
        "water_ratio": 1.08,
        "oil_added_g_per_100g": 0,
        "salt_added_mg_per_100g": 200,
        "sugar_added_g_per_100g": 0,
        "protein_retention": 0.90,
        "fat_retention": 0.95,
        "carb_retention": 0.98,
        "sodium_retention": 0.80,
        "potassium_retention": 0.70,
        "calcium_retention": 0.95,
        "iron_retention": 0.95,
        "vit_c_retention": 0.40,
    },
    # ------------------------------------------------------------------
    # stir_fry（炒）：失水、添油、添盐、维C损失大
    # 预期熟重变化：-8%~-18%
    # ------------------------------------------------------------------
    "stir_fry": {
        "water_ratio": 0.82,
        "oil_added_g_per_100g": 6,
        "salt_added_mg_per_100g": 1200,
        "sugar_added_g_per_100g": 1,
        "protein_retention": 0.92,
        "fat_retention": 0.88,
        "carb_retention": 0.95,
        "sodium_retention": 0.95,
        "potassium_retention": 0.85,
        "calcium_retention": 1.00,
        "iron_retention": 1.00,
        "vit_c_retention": 0.35,
    },
    # ------------------------------------------------------------------
    # pan_fry（煎）：失水多、添油中等、维C损失大
    # 预期熟重变化：-10%~-22%
    # ------------------------------------------------------------------
    "pan_fry": {
        "water_ratio": 0.78,
        "oil_added_g_per_100g": 8,
        "salt_added_mg_per_100g": 1000,
        "sugar_added_g_per_100g": 0,
        "protein_retention": 0.92,
        "fat_retention": 0.85,
        "carb_retention": 0.95,
        "sodium_retention": 0.95,
        "potassium_retention": 0.85,
        "calcium_retention": 1.00,
        "iron_retention": 1.00,
        "vit_c_retention": 0.30,
    },
    # ------------------------------------------------------------------
    # deep_fry（油炸）：大量失水、吸油中等、维C几乎全灭
    # 预期熟重变化：-15%~-30%
    # ------------------------------------------------------------------
    "deep_fry": {
        "water_ratio": 0.65,
        "oil_added_g_per_100g": 12,
        "salt_added_mg_per_100g": 600,
        "sugar_added_g_per_100g": 0,
        "protein_retention": 0.90,
        "fat_retention": 0.75,
        "carb_retention": 0.95,
        "sodium_retention": 0.95,
        "potassium_retention": 0.80,
        "calcium_retention": 1.00,
        "iron_retention": 1.00,
        "vit_c_retention": 0.15,
    },
    # ------------------------------------------------------------------
    # braise（红烧/炖）：收汁、少油、多盐多糖、维C损失大
    # 预期熟重变化：-5%~+5%
    # ------------------------------------------------------------------
    "braise": {
        "water_ratio": 0.88,
        "oil_added_g_per_100g": 3,
        "salt_added_mg_per_100g": 2000,
        "sugar_added_g_per_100g": 3,
        "protein_retention": 0.90,
        "fat_retention": 0.90,
        "carb_retention": 0.98,
        "sodium_retention": 0.90,
        "potassium_retention": 0.80,
        "calcium_retention": 1.00,
        "iron_retention": 1.00,
        "vit_c_retention": 0.30,
    },
    # ------------------------------------------------------------------
    # roast（烤）：大量失水、少油、少盐、维C损失大
    # 预期熟重变化：-20%~-30%
    # ------------------------------------------------------------------
    "roast": {
        "water_ratio": 0.72,
        "oil_added_g_per_100g": 3,
        "salt_added_mg_per_100g": 800,
        "sugar_added_g_per_100g": 1,
        "protein_retention": 0.92,
        "fat_retention": 0.88,
        "carb_retention": 0.95,
        "sodium_retention": 0.95,
        "potassium_retention": 0.85,
        "calcium_retention": 1.00,
        "iron_retention": 1.00,
        "vit_c_retention": 0.25,
    },
}


# ============================================================================
# 2. 随机误差范围
# ============================================================================

RANDOM_ERROR_RANGES = {
    # --- 烹饪条件参数（波动较大）---
    "water_ratio":           (0.95, 1.05),
    "oil_added_g_per_100g":  (0.80, 1.20),
    "salt_added_mg_per_100g":(0.70, 1.30),
    "sugar_added_g_per_100g":(0.80, 1.20),
    # --- 营养保留率（波动较小）---
    "protein_retention":     (0.97, 1.03),
    "fat_retention":         (0.97, 1.03),
    "carb_retention":        (0.98, 1.02),
    "sodium_retention":      (0.90, 1.10),
    "potassium_retention":   (0.95, 1.05),
    "calcium_retention":     (0.98, 1.02),
    "iron_retention":        (0.98, 1.02),
    "vit_c_retention":       (0.90, 1.10),
}

# Atwater热量系数（kcal/g）
ATWATER_PROTEIN = 4.0
ATWATER_FAT = 9.0
ATWATER_CARB = 4.0

# 食品添加剂纯度
SALT_SODIUM_RATIO = 0.393
OIL_FAT_RATIO = 0.996
SUGAR_CARB_RATIO = 0.995

# 需要处理的营养字段（已删除 dietary_fiber_g）
NUTRITION_FIELDS = [
    "energy_kcal", "protein_g", "fat_g", "carbohydrate_g",
    "sodium_mg", "cholesterol_mg",
    "vitamin_c_mg", "calcium_mg", "iron_mg", "potassium_mg"
]


# ============================================================================
# 3. 核心函数
# ============================================================================

def load_nutrition_db(filepath: str) -> Dict[str, Dict]:
    """
    加载食材营养数据库，补全缺失字段（cholesterol_mg 对植物性食材补0）

    参数：
        filepath: final.json 的文件路径

    返回：
        字典 {食材英文名: {营养字段: 值, ...}}
    """
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    items = data.get("items", {})

    for ingredient, nutrition in items.items():
        # 补全所有缺失的营养字段为0（植物性食材的 cholesterol_mg 正确为0）
        for field in NUTRITION_FIELDS:
            if field not in nutrition:
                nutrition[field] = 0.0

    print(f"[INFO] 成功加载 {len(items)} 种食材的营养数据")
    return items


def apply_random_error(
    base_params: Dict[str, float],
    error_ranges: Dict[str, Tuple[float, float]],
    seed: Optional[int] = None
) -> Dict[str, float]:
    """
    对烹饪条件基准参数添加随机误差
    """
    if seed is not None:
        random.seed(seed)

    result = {}
    for key, base_val in base_params.items():
        low, high = error_ranges.get(key, (1.00, 1.00))
        error_factor = random.uniform(low, high)
        result[key] = base_val * error_factor

    return result


def apply_cooking(
    ingredients: List[str],
    weights: List[float],
    method: str,
    nutrition_db: Dict[str, Dict],
    seed: Optional[int] = None
) -> Dict[str, Any]:
    """
    基于连锁反应模型计算一道菜烹饪后的营养值

    物理推导逻辑（严格执行，无魔术系数）：
    1. 计算所有食材的生营养绝对量
    2. 根据烹饪条件推导熟营养绝对量
    3. 脂肪 = 原有脂肪 × 保留率 + 添加油 × 0.996
    4. 碳水 = 原有碳水 × 保留率 + 添加糖 × 0.995
    5. 热量 = 蛋白质×4 + 脂肪×9 + 碳水×4 （Atwater公式，最终计算）
    6. 熟重 = 生重×水分比 + 添加油 + 添加盐 + 添加糖

    重要：热量不做独立边界保护，始终由三大营养素推导！
    """
    # ---------- 第一步：获取带随机误差的烹饪参数 ----------
    base_params = COOKING_PARAMS[method]
    params = apply_random_error(base_params, RANDOM_ERROR_RANGES, seed)

    # ---------- 第二步：计算生食材总营养绝对量 ----------
    total_raw_weight = 0.0
    raw_nutrition = {field: 0.0 for field in NUTRITION_FIELDS}

    for ing, w in zip(ingredients, weights):
        nutrition = nutrition_db[ing]
        factor = w / 100.0  # final.json 的数据是每100g

        total_raw_weight += w
        for field in NUTRITION_FIELDS:
            if field != "energy_kcal":  # 能量后面由三大营养素推导
                raw_nutrition[field] += nutrition.get(field, 0.0) * factor

    # 生食材总热量（仅用于边界检查参考，不参与计算）
    raw_nutrition["energy_kcal"] = (
        raw_nutrition["protein_g"] * ATWATER_PROTEIN
        + raw_nutrition["fat_g"] * ATWATER_FAT
        + raw_nutrition["carbohydrate_g"] * ATWATER_CARB
    )

    # ---------- 第三步：计算添加物量（基于总生重）----------
    oil_added_g = params["oil_added_g_per_100g"] / 100.0 * total_raw_weight
    salt_added_mg = params["salt_added_mg_per_100g"] / 100.0 * total_raw_weight
    sugar_added_g = params["sugar_added_g_per_100g"] / 100.0 * total_raw_weight
    salt_added_g = salt_added_mg / 1000.0  # mg转g，用于熟重计算

    # ---------- 第四步：推导成品营养（连锁反应核心）----------

    # 蛋白质：原有蛋白质 × 保留率（烹饪不添加蛋白质）
    cooked_protein = raw_nutrition["protein_g"] * params["protein_retention"]

    # 脂肪：原有脂肪 × 保留率 + 添加油中的脂肪
    cooked_fat = (
        raw_nutrition["fat_g"] * params["fat_retention"]
        + oil_added_g * OIL_FAT_RATIO
    )

    # 碳水：原有碳水 × 保留率 + 添加糖中的碳水
    cooked_carb = (
        raw_nutrition["carbohydrate_g"] * params["carb_retention"]
        + sugar_added_g * SUGAR_CARB_RATIO
    )

    # 钠：原有钠 × 保留率 + 添加盐中的钠
    cooked_sodium = (
        raw_nutrition["sodium_mg"] * params["sodium_retention"]
        + salt_added_mg * SALT_SODIUM_RATIO
    )

    # 胆固醇：绝对量不变（烹饪不创造也不消灭胆固醇）
    cooked_cholesterol = raw_nutrition["cholesterol_mg"]

    # 维C：受热破坏
    cooked_vit_c = raw_nutrition["vitamin_c_mg"] * params["vit_c_retention"]

    # 钙：微量流失或不流失
    cooked_calcium = raw_nutrition["calcium_mg"] * params["calcium_retention"]

    # 铁：微量流失或不流失
    cooked_iron = raw_nutrition["iron_mg"] * params["iron_retention"]

    # 钾：水溶性，煮/炖流失较大
    cooked_potassium = raw_nutrition["potassium_mg"] * params["potassium_retention"]

    # ---------- 第五步：边界保护（只对脂肪做，然后热量由脂肪推导）----------

    # 脂肪边界：成品脂肪不应低于生脂肪×0.5，不应高于生脂肪×3.5
    raw_fat = raw_nutrition["fat_g"]
    if raw_fat > 0:
        cooked_fat = max(raw_fat * 0.5, min(cooked_fat, raw_fat * 3.5))

    # ---------- 第六步：计算热量（Atwater公式，最终步骤！）----------
    cooked_energy = (
        cooked_protein * ATWATER_PROTEIN
        + cooked_fat * ATWATER_FAT
        + cooked_carb * ATWATER_CARB
    )

    # ---------- 第七步：计算熟重 ----------
    cooked_weight = (
        total_raw_weight * params["water_ratio"]
        + oil_added_g
        + salt_added_g
        + sugar_added_g
    )

    # 重量边界：成品重量应在生重的0.5~1.3倍之间
    cooked_weight = max(
        total_raw_weight * 0.5,
        min(cooked_weight, total_raw_weight * 1.3)
    )

    # ---------- 第八步：汇总结果 ----------
    result = {
        "ingredients": ingredients,
        "raw_weights_g": weights,
        "cooking_method": method,
        "cooked_weight_g": round(cooked_weight, 1),
        "cooked_energy_kcal": round(cooked_energy, 1),
        "cooked_protein_g": round(cooked_protein, 2),
        "cooked_fat_g": round(cooked_fat, 2),
        "cooked_carbohydrate_g": round(cooked_carb, 2),
        "cooked_sodium_mg": round(cooked_sodium, 1),
        "cooked_cholesterol_mg": round(cooked_cholesterol, 1),
        "cooked_vitamin_c_mg": round(cooked_vit_c, 2),
        "cooked_calcium_mg": round(cooked_calcium, 1),
        "cooked_iron_mg": round(cooked_iron, 2),
        "cooked_potassium_mg": round(cooked_potassium, 1),
    }

    return result


def generate_random_meal(
    nutrition_db: Dict[str, Dict],
    n_samples: int = 20000,
    min_ingredients: int = 1,
    max_ingredients: int = 4,
    min_weight: float = 50.0,
    max_weight: float = 500.0,
    allow_uncommon_pairs: bool = True,
    seed: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    批量生成随机菜品数据（带水果-烹饪方式适配概率）

    核心逻辑：
    - 先随机选食材和烹饪方式
    - 如果食材中包含水果，根据 FRUIT_COOKING_ACCEPT 表计算接受概率
    - 特例水果（菠萝、苹果、梨、香蕉）在某些烹饪方式下有更高接受概率
    - 不接受的组合直接丢弃，重新生成，直到累积到 n_samples 条
    - 烹饪方式本身按 COOKING_WEIGHTS 权重采样（接近真实中式家常菜分布）
    """
    if seed is not None:
        random.seed(seed)

    ingredient_names = list(nutrition_db.keys())
    cooking_methods = list(COOKING_PARAMS.keys())

    # ------------------------------------------------------------------
    # 食材分类
    # ------------------------------------------------------------------
    fruits = {"apple", "banana", "grape", "kiwi", "kumquat", "lemon",
              "orange", "peach", "pineapple", "strawberry", "watermelon"}

    # ------------------------------------------------------------------
    # 烹饪方式采样权重（接近真实中式家常菜分布）
    # ------------------------------------------------------------------
    COOKING_WEIGHTS = {
        "steam":     0.20,
        "boil":      0.15,
        "stir_fry":  0.35,
        "pan_fry":   0.10,
        "deep_fry":  0.05,
        "braise":    0.05,
        "roast":     0.10,
    }
    cooking_weight_keys = list(COOKING_WEIGHTS.keys())
    cooking_weight_vals = list(COOKING_WEIGHTS.values())

    # ------------------------------------------------------------------
    # 香辛料食材：重量范围远小于普通食材（否则会出现"半斤胡椒"的荒谬样本）
    # ------------------------------------------------------------------
    SPICE_WEIGHT_RANGE = {
        "pepper": (0.5, 5.0),    # 胡椒：0.5~5g
        "ginger":  (5.0, 30.0),  # 生姜：5~30g（常作调味）
        "garlic":  (5.0, 30.0),  # 大蒜：5~30g（常作调味）
    }

    # ------------------------------------------------------------------
    # 水果 × 烹饪方式 接受概率表
    # 含水果的菜：以该概率接受，否则丢弃重新生成
    # 不含水果的菜：接受概率 1.0（全盘接受）
    # ------------------------------------------------------------------
    FRUIT_COOKING_ACCEPT = {
        "steam":     0.10,   # 蒸梨、蒸苹果等甜品
        "boil":      0.25,   # 水果茶、糖水较常见
        "stir_fry":  0.02,   # 几乎不会炒水果
        "pan_fry":   0.01,   # 极稀有（煎香蕉配甜品）
        "deep_fry":  0.005,  # 几乎禁止
        "braise":    0.02,   # 极少数酸甜口
        "roast":     0.08,   # 烤苹果、烤梨等西式甜点
    }

    # 特例水果：某些水果与特定烹饪方式搭配更常见，覆盖基准概率
    FRUIT_COOKING_EXCEPTIONS = {
        # 菠萝：菠萝炒饭、酸甜排骨等真实菜式
        ("pineapple", "stir_fry"): 0.20,
        ("pineapple", "braise"):   0.15,
        # 苹果/梨：蒸/煮/烤甜品常见
        ("apple",  "steam"): 0.20,
        ("apple",  "boil"):  0.30,
        ("apple",  "roast"): 0.20,
        ("peach",  "steam"): 0.20,
        ("peach",  "boil"):  0.30,
        # 香蕉：烤香蕉、煎香蕉配甜品
        ("banana", "roast"):   0.15,
        ("banana", "pan_fry"): 0.08,
        ("banana", "deep_fry"):0.03,
        # 橙子/柠檬：煮果茶、蒸橙子
        ("orange", "boil"):  0.30,
        ("orange", "steam"): 0.15,
        ("lemon",  "boil"):  0.30,
        ("lemon",  "roast"): 0.10,
    }

    samples = []
    attempts = 0
    rejected = 0
    last_progress = 0  # 上次打印进度时的样本数

    while len(samples) < n_samples:
        attempts += 1

        # 进度提示（每5000条打印一次）
        current_count = len(samples)
        if current_count - last_progress >= 5000 or current_count == 0:
            last_progress = current_count
            print(f"[INFO] 已生成 {current_count}/{n_samples} 条样本"
                  f"（尝试 {attempts} 次，拒绝 {rejected} 次）...")

        # 按权重随机选择烹饪方式
        method = random.choices(cooking_weight_keys, weights=cooking_weight_vals, k=1)[0]

        # 随机选择食材数量和具体食材
        n_ing = random.randint(min_ingredients, max_ingredients)

        if not allow_uncommon_pairs:
            # 禁止不常见搭配模式：20%概率选纯水果组，80%选非水果组
            if random.random() < 0.2:
                pool = list(fruits & set(ingredient_names))
                chosen = random.sample(pool, min(n_ing, len(pool)))
                method = random.choice(["steam", "boil", "roast"])
            else:
                pool = list(set(ingredient_names) - fruits)
                chosen = random.sample(pool, min(n_ing, len(pool)))
        else:
            chosen = random.sample(ingredient_names, n_ing)

        # ------------------------------------------------------------------
        # 水果 × 烹饪方式 适配概率过滤
        # ------------------------------------------------------------------
        has_fruit = any(ing in fruits for ing in chosen)
        if has_fruit:
            # 先取该烹饪方式的基准接受概率
            accept_prob = FRUIT_COOKING_ACCEPT.get(method, 0.01)

            # 检查是否有特例水果覆盖
            for ing in chosen:
                if ing in fruits:
                    exception_prob = FRUIT_COOKING_EXCEPTIONS.get((ing, method), None)
                    if exception_prob is not None:
                        # 取所有特例水果中的最大接受概率
                        accept_prob = max(accept_prob, exception_prob)

            # 按概率决定是否接受
            if random.random() >= accept_prob:
                rejected += 1
                continue  # 拒绝，重新生成

        # 生成随机重量（香辛料使用特殊范围，普通食材使用默认范围）
        weights = []
        for ing in chosen:
            if ing in SPICE_WEIGHT_RANGE:
                lo, hi = SPICE_WEIGHT_RANGE[ing]
            else:
                lo, hi = min_weight, max_weight
            weights.append(round(random.uniform(lo, hi), 1))

        sample_seed = seed + attempts if seed is not None else None
        sample = apply_cooking(chosen, weights, method, nutrition_db, seed=sample_seed)
        samples.append(sample)

    print(f"[INFO] 样本生成完成，共 {len(samples)} 条"
          f"（总尝试 {attempts} 次，拒绝 {rejected} 次，"
          f"接受率 {len(samples)/attempts:.1%}）")
    return samples


# ============================================================================
# 4. 数据保存函数
# ============================================================================

def save_as_csv(samples: List[Dict], output_path: str):
    """保存为CSV格式"""
    import csv

    if not samples:
        print("[WARN] 没有数据可保存")
        return

    csv_columns = [
        "ingredients", "raw_weights_g", "cooking_method",
        "cooked_weight_g", "cooked_energy_kcal",
        "cooked_protein_g", "cooked_fat_g", "cooked_carbohydrate_g",
        "cooked_sodium_mg", "cooked_cholesterol_mg",
        "cooked_vitamin_c_mg", "cooked_calcium_mg",
        "cooked_iron_mg", "cooked_potassium_mg"
    ]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=csv_columns)
        writer.writeheader()

        for sample in samples:
            row = {}
            row["ingredients"] = "_".join(sample["ingredients"])
            row["raw_weights_g"] = "_".join(str(w) for w in sample["raw_weights_g"])
            for col in csv_columns[2:]:
                row[col] = sample[col]
            writer.writerow(row)

    print(f"[INFO] CSV文件已保存：{output_path}")


def save_as_json(samples: List[Dict], output_path: str):
    """保存为JSON格式"""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(samples, f, ensure_ascii=False, indent=2)
    print(f"[INFO] JSON文件已保存：{output_path}")


# ============================================================================
# 5. 数据验证函数
# ============================================================================

def validate_samples(samples: List[Dict], max_check: int = 0) -> Dict[str, Any]:
    """对生成的数据进行合理性检查"""
    issues = {
        "energy_mismatch": 0,
        "negative_values": 0,
        "weight_anomaly": 0,
    }

    checked = len(samples) if max_check == 0 else min(len(samples), max_check)

    for sample in samples[:checked]:
        # Atwater公式验证（允许2%舍入误差）
        expected_energy = (
            sample["cooked_protein_g"] * ATWATER_PROTEIN
            + sample["cooked_fat_g"] * ATWATER_FAT
            + sample["cooked_carbohydrate_g"] * ATWATER_CARB
        )
        actual_energy = sample["cooked_energy_kcal"]
        if abs(actual_energy - expected_energy) > max(2.0, expected_energy * 0.02):
            issues["energy_mismatch"] += 1

        # 负值检查
        for key in sample:
            if isinstance(sample[key], (int, float)) and sample[key] < 0:
                issues["negative_values"] += 1
                break

        # 熟重异常检查
        if sample["cooked_weight_g"] <= 0:
            issues["weight_anomaly"] += 1

    result = {
        "checked_samples": checked,
        "total_samples": len(samples),
        "issues": issues,
        "pass_rate": 1.0 - sum(issues.values()) / max(checked, 1)
    }

    return result


# ============================================================================
# 6. 主程序
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="烹饪营养预测训练数据生成脚本（连锁反应模型 v2）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例：
  python generate_training_data.py --output training_data --samples 20000 --seed 42
  python generate_training_data.py --output test --samples 100 --csv-only
  python generate_training_data.py --output data/train --samples 50000 --no-uncommon-pairs
        """
    )

    parser.add_argument("--input", type=str, default="final.json",
                        help="食材营养数据库路径（默认：final.json）")
    parser.add_argument("--output", type=str, default="training_data",
                        help="输出文件基础路径（不含扩展名，默认：training_data）")
    parser.add_argument("--samples", type=int, default=20000,
                        help="生成样本数量（默认：20000）")
    parser.add_argument("--seed", type=int, default=None,
                        help="随机种子（默认：None=随机，指定数字可复现）")
    parser.add_argument("--min-ingredients", type=int, default=1,
                        help="每道菜最少食材数（默认：1）")
    parser.add_argument("--max-ingredients", type=int, default=4,
                        help="每道菜最多食材数（默认：4）")
    parser.add_argument("--no-uncommon-pairs", action="store_true",
                        help="禁止不常见搭配（如水果+肉类）")
    parser.add_argument("--csv-only", action="store_true",
                        help="只输出CSV格式")
    parser.add_argument("--json-only", action="store_true",
                        help="只输出JSON格式")
    parser.add_argument("--validate", action="store_true",
                        help="生成后进行数据验证")

    args = parser.parse_args()

    print("=" * 60)
    print("烹饪营养预测训练数据生成脚本（连锁反应模型 v2）")
    print("=" * 60)
    print(f"输入文件：{args.input}")
    print(f"输出基础路径：{args.output}")
    print(f"样本数量：{args.samples}")
    print(f"随机种子：{args.seed if args.seed is not None else '随机（不可复现）'}")
    print(f"食材数量范围：{args.min_ingredients}~{args.max_ingredients}")
    print(f"允许不常见搭配：{not args.no_uncommon_pairs}")
    print(f"数据验证：{args.validate}")
    print("=" * 60)

    if not Path(args.input).exists():
        print(f"[ERROR] 输入文件不存在：{args.input}")
        sys.exit(1)

    nutrition_db = load_nutrition_db(args.input)

    samples = generate_random_meal(
        nutrition_db=nutrition_db,
        n_samples=args.samples,
        min_ingredients=args.min_ingredients,
        max_ingredients=args.max_ingredients,
        allow_uncommon_pairs=not args.no_uncommon_pairs,
        seed=args.seed
    )

    output_base = Path(args.output)
    output_base.parent.mkdir(parents=True, exist_ok=True)

    if not args.json_only:
        save_as_csv(samples, f"{args.output}.csv")

    if not args.csv_only:
        save_as_json(samples, f"{args.output}.json")

    if args.validate:
        print("\n--- 数据验证 ---")
        result = validate_samples(samples)
        print(f"检查样本数：{result['checked_samples']}/{result['total_samples']}")
        print(f"问题统计：{result['issues']}")
        print(f"通过率：{result['pass_rate']:.2%}")

    print("\n" + "=" * 60)
    print("全部完成！")
    print("=" * 60)


if __name__ == "__main__":
    main()
