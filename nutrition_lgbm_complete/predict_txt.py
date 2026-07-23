"""
使用11个独立 LightGBM .txt 模型批量预测菜品营养值
====================================================
用法：python predict_txt.py
"""

import os
import json
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

MODELS_DIR = "lgbm_output"

# ============================================================
# 加载模型
# ============================================================

def load_models():
    """加载11个 .txt 模型"""
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
    """构建41维特征向量"""
    feature_cols = (
        [f"ing_{ing}" for ing in ALL_INGREDIENTS]
        + ["raw_weight_1", "raw_weight_2", "raw_weight_3", "raw_weight_4"]
        + ["raw_weight_total", "raw_weight_mean"]
        + ["n_ingredients", "has_fruit", "has_meat"]
        + ["cooking_method_enc"]
    )

    row = {col: 0 for col in feature_cols}

    # 食材 one-hot
    for ing in ingredients:
        key = f"ing_{ing}"
        if key in row:
            row[key] = 1

    # 重量（最多4个位置）
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
    """预测一道菜的11个营养值"""
    X = build_features(ingredients, weights, cooking_method)

    results = {}
    for target, model in models.items():
        results[target] = model.predict(X)[0]

    return results


def print_result(ingredients, weights, cooking_method, results):
    """打印预测结果"""
    raw_total = sum(weights)
    ing_str = " + ".join(ingredients)

    # 计算Atwater验算
    atwater = (results["cooked_protein_g"] * 4
               + results["cooked_fat_g"] * 9
               + results["cooked_carbohydrate_g"] * 4)
    energy_pred = results["cooked_energy_kcal"]
    atwater_err = abs(atwater - energy_pred) / max(energy_pred, 1) * 100

    # 熟重变化
    weight_change = (results["cooked_weight_g"] - raw_total) / raw_total * 100

    print(f"  {ing_str:30s} | {cooking_method:10s} | "
          f"生重={raw_total:5.0f}g 熟重={results['cooked_weight_g']:6.1f}g ({weight_change:+.1f}%) | "
          f"热量={energy_pred:6.0f}kcal | "
          f"蛋白={results['cooked_protein_g']:5.1f}g 脂肪={results['cooked_fat_g']:5.1f}g 碳水={results['cooked_carbohydrate_g']:5.1f}g | "
          f"钠={results['cooked_sodium_mg']:6.0f}mg 胆固醇={results['cooked_cholesterol_mg']:5.0f}mg | "
          f"Atwater偏差={atwater_err:.1f}%")


# ============================================================
# 20道菜品
# ============================================================

DISHES = [
    # --- 炒菜 ---
    (["chicken", "bell_pepper"],             [200.0, 150.0],             "stir_fry"),
    (["beef", "onion"],                      [250.0, 100.0],             "stir_fry"),
    (["shrimp", "egg"],                      [200.0, 80.0],              "stir_fry"),
    (["pork", "cabbage"],                    [200.0, 300.0],             "stir_fry"),
    # --- 蒸菜 ---
    (["fish"],                               [400.0],                    "steam"),
    (["egg", "tofu"],                        [120.0, 200.0],             "steam"),
    (["chicken", "mushroom"],                [300.0],                    "steam"),  # mushroom不在库中，one-hot全0
    (["egg"],                                [60.0],                     "steam"),
    # --- 煮菜 ---
    (["beef", "potato", "carrot"],           [200.0, 200.0, 150.0],     "boil"),
    (["chicken", "tomato"],                  [250.0, 200.0],             "boil"),
    # --- 红烧/炖 ---
    (["pork", "potato"],                     [300.0, 200.0],             "braise"),
    (["beef", "carrot", "onion", "potato"],  [200.0, 150.0, 100.0, 200.0], "braise"),
    # --- 煎 ---
    (["egg"],                                [100.0],                    "pan_fry"),
    (["tofu"],                               [300.0],                    "pan_fry"),
    (["pork"],                               [200.0],                    "pan_fry"),
    # --- 炸 ---
    (["chicken"],                            [250.0],                    "deep_fry"),
    (["potato"],                             [300.0],                    "deep_fry"),
    # --- 烤 ---
    (["beef"],                               [350.0],                    "roast"),
    (["chicken", "potato"],                  [300.0, 200.0],             "roast"),
    # --- 水果类 ---
    (["pineapple", "shrimp"],                [150.0, 200.0],             "stir_fry"),
]


def main():
    print("加载11个 LightGBM .txt 模型...")
    models = load_models()

    if len(models) < 11:
        print("[ERROR] 模型不完整，请先运行 python train_lgbm.py")
        return

    print(f"\n{'='*140}")
    print(f"  {'菜品':30s} | {'方式':10s} | {'重量变化':30s} | {'热量':12s} | {'三大营养素':35s} | {'钠/胆固醇':25s} | Atwater")
    print(f"{'='*140}")

    for ingredients, weights, method in DISHES:
        results = predict(models, ingredients, weights, method)
        print_result(ingredients, weights, method, results)

    print(f"{'='*140}")
    print(f"\n共预测 {len(DISHES)} 道菜品")


if __name__ == "__main__":
    main()
