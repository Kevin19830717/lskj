"""
使用训练好的多输出模型预测菜品营养值
====================================
用法：
  python predict.py
  python predict.py --model lgbm_output_multi/multi_output_model.pkl
"""

import pickle
import sys
import os
import pandas as pd
import numpy as np

# 食材分类
FRUITS = {"apple", "banana", "grape", "kiwi", "kumquat", "lemon",
          "orange", "peach", "pineapple", "strawberry", "watermelon"}
MEATS = {"beef", "chicken", "pork", "shrimp", "fish"}

ALL_INGREDIENTS = [
    "apple", "banana", "beef", "bell_pepper", "cabbage", "carrot",
    "cauliflower", "chicken", "cucumber", "egg", "eggplant", "fish",
    "garlic", "ginger", "grape", "kiwi", "kumquat", "lemon",
    "onion", "orange", "peach", "pepper", "pineapple", "pork",
    "potato", "shrimp", "small_pepper", "strawberry", "tofu",
    "tomato", "watermelon"
]

TARGET_COLS = [
    "cooked_weight_g",
    "cooked_energy_kcal",
    "cooked_protein_g",
    "cooked_fat_g",
    "cooked_carbohydrate_g",
    "cooked_sodium_mg",
    "cooked_cholesterol_mg",
    "cooked_vitamin_c_mg",
    "cooked_calcium_mg",
    "cooked_iron_mg",
    "cooked_potassium_mg",
]


def load_model(model_path="lgbm_output_multi/multi_output_model.pkl"):
    """加载模型"""
    with open(model_path, "rb") as f:
        saved = pickle.load(f)
    return saved


def predict(ingredients, weights, cooking_method, saved):
    """
    预测一道菜的营养值

    参数:
        ingredients: 食材列表, 如 ["chicken", "potato"]
        weights: 重量列表(g), 如 [200.0, 150.0]
        cooking_method: 烹饪方式, 如 "stir_fry"
        saved: 加载的模型字典
    """
    model = saved["model"]
    feature_cols = saved["feature_cols"]
    le_method = saved["le_method"]

    # 构建特征
    row = {col: 0 for col in feature_cols}

    for ing in ingredients:
        key = f"ing_{ing}"
        if key in row:
            row[key] = 1

    for i, w in enumerate(weights[:4]):
        row[f"raw_weight_{i+1}"] = w

    row["raw_weight_total"] = sum(weights)
    row["raw_weight_mean"] = sum(weights) / len(weights)
    row["n_ingredients"] = len(ingredients)
    row["has_fruit"] = 1 if any(i in FRUITS for i in ingredients) else 0
    row["has_meat"] = 1 if any(i in MEATS for i in ingredients) else 0

    try:
        row["cooking_method_enc"] = le_method.transform([cooking_method])[0]
    except ValueError:
        print(f"  [WARN] 未知烹饪方式: {cooking_method}，使用默认值0")
        row["cooking_method_enc"] = 0

    X = pd.DataFrame([row], columns=feature_cols)

    # 一次预测，输出11个值
    predictions = model.predict(X)[0]

    # 打印结果
    raw_total = sum(weights)
    print(f"\n  {'='*55}")
    print(f"  菜品: {' + '.join(ingredients)}")
    print(f"  烹饪方式: {cooking_method}")
    print(f"  生重: {weights} (总计 {raw_total:.0f}g)")
    print(f"  {'-'*55}")
    print(f"  {'营养素':25s} {'预测值':>10s}    {'单位'}")
    print(f"  {'-'*55}")

    atwater_sum = 0
    for i, target in enumerate(TARGET_COLS):
        short = target.replace("cooked_", "")
        val = predictions[i]
        if short == "weight_g":
            unit = "g"
            change = (val - raw_total) / raw_total * 100
            print(f"  {short:25s} {val:10.1f} {unit:>5s}  (变化 {change:+.1f}%)")
        elif short == "energy_kcal":
            unit = "kcal"
            print(f"  {short:25s} {val:10.1f} {unit:>5s}")
        elif short.endswith("_mg"):
            unit = "mg"
            print(f"  {short:25s} {val:10.1f} {unit:>5s}")
        else:
            unit = "g"
            print(f"  {short:25s} {val:10.1f} {unit:>5s}")

        if short == "protein_g":
            atwater_sum += val * 4
        elif short == "fat_g":
            atwater_sum += val * 9
        elif short == "carbohydrate_g":
            atwater_sum += val * 4

    energy_idx = TARGET_COLS.index("cooked_energy_kcal")
    energy_pred = predictions[energy_idx]
    print(f"  {'-'*55}")
    print(f"  Atwater验算: {atwater_sum:.1f} kcal (预测: {energy_pred:.1f})")
    print(f"  偏差: {abs(atwater_sum - energy_pred) / max(energy_pred, 1) * 100:.1f}%")
    print(f"  {'='*55}")

    return predictions


def main():
    model_path = sys.argv[1] if len(sys.argv) > 1 else "lgbm_output_multi/multi_output_model.pkl"

    if not os.path.exists(model_path):
        print(f"[ERROR] 模型文件不存在: {model_path}")
        print("请先运行: python train_lgbm_multi.py")
        return

    print("加载模型...")
    saved = load_model(model_path)
    print(f"模型策略: {saved.get('strategy', 'unknown')}")

    # ==========================================
    # 测试用例
    # ==========================================

    print("\n" + "=" * 60)
    print("开始预测")
    print("=" * 60)

    # 1. 经典家常菜
    predict(
        ingredients=["chicken", "potato"],
        weights=[200.0, 150.0],
        cooking_method="stir_fry",
        saved=saved,
    )

    # 2. 红烧肉
    predict(
        ingredients=["pork"],
        weights=[300.0],
        cooking_method="braise",
        saved=saved,
    )

    # 3. 清蒸鱼
    predict(
        ingredients=["fish"],
        weights=[400.0],
        cooking_method="steam",
        saved=saved,
    )

    # 4. 炸鸡
    predict(
        ingredients=["chicken"],
        weights=[250.0],
        cooking_method="deep_fry",
        saved=saved,
    )

    # 5. 番茄炒蛋
    predict(
        ingredients=["tomato", "egg"],
        weights=[300.0, 100.0],
        cooking_method="stir_fry",
        saved=saved,
    )

    # 6. 水煮牛肉
    predict(
        ingredients=["beef", "cabbage"],
        weights=[200.0, 300.0],
        cooking_method="boil",
        saved=saved,
    )

    # 7. 烤土豆
    predict(
        ingredients=["potato"],
        weights=[250.0],
        cooking_method="roast",
        saved=saved,
    )

    # 8. 菠萝炒饭（特例水果）
    predict(
        ingredients=["pineapple", "shrimp"],
        weights=[150.0, 200.0],
        cooking_method="stir_fry",
        saved=saved,
    )

    # 9. 煎豆腐
    predict(
        ingredients=["tofu"],
        weights=[350.0],
        cooking_method="pan_fry",
        saved=saved,
    )

    # 10. 炖菜大杂烩
    predict(
        ingredients=["beef", "carrot", "potato", "onion"],
        weights=[200.0, 150.0, 200.0, 100.0],
        cooking_method="braise",
        saved=saved,
    )

    print("\n" + "=" * 60)
    print("预测完成！如需自定义预测，修改 predict() 参数即可")
    print("=" * 60)


if __name__ == "__main__":
    main()
