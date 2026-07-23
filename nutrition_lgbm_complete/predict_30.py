"""
使用 Stephen 目录下11个独立 .txt 模型随机预测30道菜品
"""

import os
import json
import random
import numpy as np
import pandas as pd
import lightgbm as lgb

# ============================================================
# 配置
# ============================================================

ALL_INGREDIENTS = [
    "apple", "banana", "beef", "bell_pepper", "cabbage", "carrot",
    "cauliflower", "chicken", "cucumber", "egg", "eggplant", "fish",
    "garlic", "ginger", "grape", "kiwi", "kumquat", "lemon",
    "onion", "orange", "peach", "pepper", "pineapple", "pork",
    "potato", "shrimp", "small_pepper", "strawberry", "tofu",
    "tomato", "watermelon"
]

FRUITS = {"apple", "banana", "grape", "kiwi", "kumquat", "lemon",
          "orange", "peach", "pineapple", "strawberry", "watermelon"}
MEATS = {"beef", "chicken", "pork", "shrimp", "fish"}

TARGET_COLS = [
    "cooked_weight_g", "cooked_energy_kcal", "cooked_protein_g",
    "cooked_fat_g", "cooked_carbohydrate_g", "cooked_sodium_mg",
    "cooked_cholesterol_mg", "cooked_vitamin_c_mg", "cooked_calcium_mg",
    "cooked_iron_mg", "cooked_potassium_mg",
]

METHOD_MAPPING = {"boil": 0, "braise": 1, "deep_fry": 2, "pan_fry": 3,
                  "roast": 4, "steam": 5, "stir_fry": 6}

COOKING_METHODS = list(METHOD_MAPPING.keys())

# 香辛料特殊重量范围
SPICE_WEIGHT_RANGE = {
    "pepper": (0.5, 5.0),
    "ginger":  (5.0, 30.0),
    "garlic":  (5.0, 30.0),
}

MODELS_DIR = "Stephen"

# ============================================================
# 加载模型
# ============================================================

def load_models():
    models = {}
    for target in TARGET_COLS:
        path = os.path.join(MODELS_DIR, f"lgbm_{target}.txt")
        if os.path.exists(path):
            models[target] = lgb.Booster(model_file=path)
        else:
            print(f"[WARN] 模型不存在: {path}")
    print(f"已加载 {len(models)} 个模型")
    return models

# ============================================================
# 特征构建
# ============================================================

def build_features(ingredients, weights, cooking_method):
    feature_cols = (
        [f"ing_{ing}" for ing in ALL_INGREDIENTS]
        + ["raw_weight_1", "raw_weight_2", "raw_weight_3", "raw_weight_4"]
        + ["raw_weight_total", "raw_weight_mean"]
        + ["n_ingredients", "has_fruit", "has_meat"]
        + ["cooking_method_enc"]
    )

    row = {col: 0 for col in feature_cols}

    for ing in ingredients:
        key = f"ing_{ing}"
        if key in row:
            row[key] = 1

    for i, w in enumerate(weights[:4]):
        row[f"raw_weight_{i+1}"] = w

    row["raw_weight_total"] = sum(weights)
    row["raw_weight_mean"] = sum(weights) / len(weights)
    row["n_ingredients"] = len(weights)
    row["has_fruit"] = 1 if any(i in FRUITS for i in ingredients) else 0
    row["has_meat"] = 1 if any(i in MEATS for i in ingredients) else 0
    row["cooking_method_enc"] = METHOD_MAPPING.get(cooking_method, 0)

    return pd.DataFrame([row], columns=feature_cols)

# ============================================================
# 预测
# ============================================================

def predict(models, ingredients, weights, cooking_method):
    X = build_features(ingredients, weights, cooking_method)
    results = {}
    for target, model in models.items():
        results[target] = model.predict(X)[0]

    # ---- 后处理修正 ----
    # 1. 脂肪不能为负（独立模型可能出现微小负值）
    results["cooked_fat_g"] = max(0.0, results["cooked_fat_g"])

    # 2. 蛋白质、碳水也不能为负
    results["cooked_protein_g"] = max(0.0, results["cooked_protein_g"])
    results["cooked_carbohydrate_g"] = max(0.0, results["cooked_carbohydrate_g"])

    # 3. 微量营养素不能为负
    for key in ["cooked_sodium_mg", "cooked_cholesterol_mg",
                "cooked_vitamin_c_mg", "cooked_calcium_mg",
                "cooked_iron_mg", "cooked_potassium_mg"]:
        results[key] = max(0.0, results[key])

    # 4. 能量用 Atwater 公式重算（覆盖模型输出，消除偏差）
    results["cooked_energy_kcal"] = round(
        results["cooked_protein_g"] * 4
        + results["cooked_fat_g"] * 9
        + results["cooked_carbohydrate_g"] * 4
    , 1)

    # 5. 熟重不能小于0
    results["cooked_weight_g"] = max(0.0, results["cooked_weight_g"])

    return results


def generate_random_dish():
    """随机生成一道菜：1~4种食材 + 随机烹饪方式 + 合理重量"""
    n_ing = random.randint(1, 4)
    chosen = random.sample(ALL_INGREDIENTS, n_ing)

    # 香辛料特殊重量，普通食材50~500g
    weights = []
    for ing in chosen:
        if ing in SPICE_WEIGHT_RANGE:
            lo, hi = SPICE_WEIGHT_RANGE[ing]
        else:
            lo, hi = 50.0, 500.0
        weights.append(round(random.uniform(lo, hi), 1))

    method = random.choice(COOKING_METHODS)
    return chosen, weights, method


def print_result(idx, ingredients, weights, cooking_method, results):
    raw_total = sum(weights)
    ing_str = "+".join(ingredients)
    weight_change = (results["cooked_weight_g"] - raw_total) / raw_total * 100

    print(f"  {idx:2d}. {ing_str:35s} | {cooking_method:10s} | "
          f"生重={raw_total:5.0f}g 熟重={results['cooked_weight_g']:6.1f}g ({weight_change:+.1f}%) | "
          f"热量={results['cooked_energy_kcal']:6.0f}kcal | "
          f"蛋白={results['cooked_protein_g']:5.1f}g 脂肪={results['cooked_fat_g']:5.1f}g 碳水={results['cooked_carbohydrate_g']:5.1f}g | "
          f"钠={results['cooked_sodium_mg']:6.0f}mg 胆固醇={results['cooked_cholesterol_mg']:5.0f}mg")


def main():
    random.seed(42)

    print("加载11个 LightGBM .txt 模型 (Stephen) ...")
    models = load_models()

    if len(models) < 11:
        print("[ERROR] 模型不完整")
        return

    print(f"\n{'='*155}")
    print(f"  {'#':3s}  {'菜品':35s} | {'方式':10s} | {'重量变化':30s} | {'热量':12s} | {'三大营养素':35s} | {'钠+胆固醇':25s}")
    print(f"{'='*155}")

    for i in range(30):
        ingredients, weights, method = generate_random_dish()
        results = predict(models, ingredients, weights, method)
        print_result(i + 1, ingredients, weights, method, results)

    print(f"{'='*155}")
    print(f"\n共预测 30 道菜品")
    print(f"后处理: 脂肪/蛋白/碳水/微量营养素已裁剪非负, 能量由Atwater公式重算")


if __name__ == "__main__":
    main()
