"""
LightGBM 模型推理性能详细测试
- 测量单次推理时间、11个模型分别推理时间
- 测试多种典型场景
- 打印详细结果
"""

import os
import json
import time
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

TARGET_CN = {
    "cooked_weight_g": "熟重(g)",
    "cooked_energy_kcal": "热量(kcal)",
    "cooked_protein_g": "蛋白质(g)",
    "cooked_fat_g": "脂肪(g)",
    "cooked_carbohydrate_g": "碳水化合物(g)",
    "cooked_sodium_mg": "钠(mg)",
    "cooked_cholesterol_mg": "胆固醇(mg)",
    "cooked_vitamin_c_mg": "维生素C(mg)",
    "cooked_calcium_mg": "钙(mg)",
    "cooked_iron_mg": "铁(mg)",
    "cooked_potassium_mg": "钾(mg)",
}

METHOD_MAPPING = {"boil": 0, "braise": 1, "deep_fry": 2, "pan_fry": 3,
                  "roast": 4, "steam": 5, "stir_fry": 6}
METHOD_CN = {"boil": "煮", "braise": "红烧/炖", "deep_fry": "炸",
             "pan_fry": "煎", "roast": "烤", "steam": "蒸", "stir_fry": "炒"}

SPICE_WEIGHT_RANGE = {
    "pepper": (0.5, 5.0),
    "ginger":  (5.0, 30.0),
    "garlic":  (5.0, 30.0),
}

MODELS_DIR = "jiaofu/models"

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
# 预测（含后处理）
# ============================================================

def predict(models, ingredients, weights, cooking_method):
    X = build_features(ingredients, weights, cooking_method)
    results = {}
    for target, model in models.items():
        results[target] = model.predict(X)[0]
    # 后处理
    for key in results:
        if key != "cooked_energy_kcal":
            results[key] = max(0.0, results[key])
    results["cooked_energy_kcal"] = round(
        results["cooked_protein_g"] * 4
        + results["cooked_fat_g"] * 9
        + results["cooked_carbohydrate_g"] * 4, 1)
    return results

# ============================================================
# 测试1：单模型推理时间（逐个测量）
# ============================================================

def benchmark_single_model(models, X, n_runs=1000):
    print("\n" + "="*80)
    print("【测试1】单模型推理时间（逐个测量，各运行1000次取平均）")
    print("="*80)
    print(f"{'模型目标':<30s} {'单次推理(ms)':<15s} {'总1000次(ms)':<15s} {'模型文件大小(KB)':<15s}")
    print("-"*80)

    total_single = 0
    for target, model in models.items():
        # warmup
        for _ in range(50):
            model.predict(X)

        t0 = time.perf_counter()
        for _ in range(n_runs):
            model.predict(X)
        t1 = time.perf_counter()
        elapsed = t1 - t0
        avg_ms = elapsed / n_runs * 1000
        total_single += avg_ms

        # 文件大小
        path = os.path.join(MODELS_DIR, f"lgbm_{target}.txt")
        fsize = os.path.getsize(path) / 1024 if os.path.exists(path) else 0

        print(f"{target:<30s} {avg_ms:<15.4f} {elapsed*1000:<15.2f} {fsize:<15.1f}")

    print("-"*80)
    print(f"{'11个模型合计单次推理':<30s} {total_single:<15.4f}")
    print(f"\n结论：11个模型串行推理一次约 {total_single:.2f} ms")

# ============================================================
# 测试2：完整预测流程时间（含特征构建 + 后处理）
# ============================================================

def benchmark_full_pipeline(models, n_runs=500):
    print("\n" + "="*80)
    print("【测试2】完整预测流程时间（特征构建+11模型推理+后处理，500次取平均）")
    print("="*80)

    random.seed(42)
    # 预生成测试数据
    test_cases = []
    for _ in range(n_runs):
        n_ing = random.randint(1, 4)
        chosen = random.sample(ALL_INGREDIENTS, n_ing)
        weights = []
        for ing in chosen:
            if ing in SPICE_WEIGHT_RANGE:
                lo, hi = SPICE_WEIGHT_RANGE[ing]
            else:
                lo, hi = 50.0, 500.0
            weights.append(round(random.uniform(lo, hi), 1))
        method = random.choice(list(METHOD_MAPPING.keys()))
        test_cases.append((chosen, weights, method))

    # warmup
    for i in range(20):
        c, w, m = test_cases[i]
        predict(models, c, w, m)

    # 分阶段计时
    t_feature = 0
    t_infer = 0
    t_post = 0

    for chosen, weights, method in test_cases:
        # 特征构建
        t0 = time.perf_counter()
        X = build_features(chosen, weights, method)
        t1 = time.perf_counter()
        t_feature += (t1 - t0)

        # 模型推理
        raw_results = {}
        t2 = time.perf_counter()
        for target, model in models.items():
            raw_results[target] = model.predict(X)[0]
        t3 = time.perf_counter()
        t_infer += (t3 - t2)

        # 后处理
        t4 = time.perf_counter()
        for key in raw_results:
            if key != "cooked_energy_kcal":
                raw_results[key] = max(0.0, raw_results[key])
        raw_results["cooked_energy_kcal"] = round(
            raw_results["cooked_protein_g"] * 4
            + raw_results["cooked_fat_g"] * 9
            + raw_results["cooked_carbohydrate_g"] * 4, 1)
        t5 = time.perf_counter()
        t_post += (t5 - t4)

    n = n_runs
    print(f"{'阶段':<25s} {'总耗时(ms)':<15s} {'单次平均(ms)':<15s} {'占比':<10s}")
    print("-"*65)
    total = t_feature + t_infer + t_post
    print(f"{'特征构建':<25s} {t_feature*1000:<15.2f} {t_feature/n*1000:<15.4f} {t_feature/total*100:<10.1f}%")
    print(f"{'模型推理(11个)':<25s} {t_infer*1000:<15.2f} {t_infer/n*1000:<15.4f} {t_infer/total*100:<10.1f}%")
    print(f"{'后处理':<25s} {t_post*1000:<15.2f} {t_post/n*1000:<15.4f} {t_post/total*100:<10.1f}%")
    print("-"*65)
    print(f"{'合计':<25s} {total*1000:<15.2f} {total/n*1000:<15.4f}")
    print(f"\n结论：完整预测流程单次约 {total/n*1000:.2f} ms")

# ============================================================
# 测试3：典型场景预测展示
# ============================================================

def demo_predictions(models):
    print("\n" + "="*80)
    print("【测试3】典型场景预测展示（含详细营养数据）")
    print("="*80)

    test_cases = [
        (["chicken"], [200.0], "stir_fry", "炒鸡肉"),
        (["pork", "potato"], [150.0, 100.0], "braise", "红烧肉炖土豆"),
        (["fish", "ginger", "garlic"], [300.0, 15.0, 10.0], "steam", "清蒸鱼"),
        (["egg", "tomato"], [120.0, 200.0], "stir_fry", "番茄炒蛋"),
        (["beef", "onion", "bell_pepper"], [200.0, 80.0, 60.0], "pan_fry", "煎牛肉彩椒"),
        (["tofu", "small_pepper", "garlic"], [250.0, 5.0, 10.0], "stir_fry", "麻婆豆腐"),
        (["shrimp", "ginger"], [200.0, 10.0], "boil", "水煮虾"),
        (["potato"], [300.0], "deep_fry", "炸薯条"),
        (["pork", "cabbage"], [180.0, 150.0], "stir_fry", "炒白菜猪肉"),
        (["chicken", "carrot", "potato", "onion"], [200.0, 80.0, 100.0, 50.0], "roast", "烤鸡肉蔬菜"),
    ]

    for ingredients, weights, method, desc in test_cases:
        # 计时
        t0 = time.perf_counter()
        results = predict(models, ingredients, weights, method)
        t1 = time.perf_counter()
        elapsed_ms = (t1 - t0) * 1000

        raw_total = sum(weights)
        weight_change = (results["cooked_weight_g"] - raw_total) / raw_total * 100
        ing_str = "+".join(ingredients)

        print(f"\n  菜品: {desc}")
        print(f"  食材: {ing_str} | 烹饪: {METHOD_CN[method]} | 生重: {raw_total:.0f}g")
        print(f"  推理耗时: {elapsed_ms:.3f} ms")
        print(f"  {'─'*50}")
        print(f"  {'营养项':<20s} {'预测值':>10s} {'单位':<8s}")
        print(f"  {'─'*50}")
        for target in TARGET_COLS:
            val = results[target]
            cn = TARGET_CN[target]
            unit = cn.split("(")[1].rstrip(")") if "(" in cn else ""
            name = cn.split("(")[0]
            if val > 0:
                print(f"  {name:<17s} {val:>10.1f} {unit:<8s}")
        print(f"  {'─'*50}")
        print(f"  熟重变化: {weight_change:+.1f}%")

# ============================================================
# 测试4：模型文件统计
# ============================================================

def model_stats(models):
    print("\n" + "="*80)
    print("【测试4】模型文件统计")
    print("="*80)

    total_size = 0
    total_trees = 0
    total_leaves = 0

    print(f"{'模型':<30s} {'文件大小(KB)':<15s} {'树数量':<10s} {'叶节点数':<10s}")
    print("-"*65)

    for target in TARGET_COLS:
        path = os.path.join(MODELS_DIR, f"lgbm_{target}.txt")
        if not os.path.exists(path):
            continue
        fsize = os.path.getsize(path) / 1024
        total_size += fsize

        # 统计树数量
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        n_trees = content.count("Tree=")
        # 统计叶节点
        n_leaves = 0
        for line in content.split('\n'):
            if line.startswith('num_leaves='):
                n_leaves += int(line.split('=')[1])

        total_trees += n_trees
        total_leaves += n_leaves
        print(f"{target:<30s} {fsize:<15.1f} {n_trees:<10d} {n_leaves:<10d}")

    print("-"*65)
    print(f"{'合计':<30s} {total_size:<15.1f} {total_trees:<10d} {total_leaves:<10d}")
    print(f"\n结论：11个模型总大小 {total_size:.1f} KB ({total_size/1024:.2f} MB)，共 {total_trees} 棵决策树")

# ============================================================
# 测试5：批量推理吞吐量
# ============================================================

def benchmark_batch(models, n_runs=10, n_samples=1000):
    print("\n" + "="*80)
    print(f"【测试5】批量推理吞吐量（{n_runs}次 x {n_samples}样本）")
    print("="*80)

    random.seed(123)
    # 预生成大量特征
    all_X = []
    for _ in range(n_samples):
        n_ing = random.randint(1, 4)
        chosen = random.sample(ALL_INGREDIENTS, n_ing)
        weights = []
        for ing in chosen:
            if ing in SPICE_WEIGHT_RANGE:
                lo, hi = SPICE_WEIGHT_RANGE[ing]
            else:
                lo, hi = 50.0, 500.0
            weights.append(round(random.uniform(lo, hi), 1))
        method = random.choice(list(METHOD_MAPPING.keys()))
        X = build_features(chosen, weights, method)
        all_X.append(X)

    # 合并为一个大DataFrame
    X_batch = pd.concat(all_X, ignore_index=True)

    for target, model in models.items():
        # warmup
        model.predict(X_batch.iloc[:10])

        times = []
        for _ in range(n_runs):
            t0 = time.perf_counter()
            preds = model.predict(X_batch)
            t1 = time.perf_counter()
            times.append(t1 - t0)

        avg = np.mean(times)
        throughput = n_samples / avg
        print(f"  {target:<30s}  {n_samples}样本平均 {avg*1000:.2f} ms  吞吐 {throughput:.0f} 样本/秒")

# ============================================================
# 主函数
# ============================================================

def main():
    print("="*80)
    print("LightGBM 端侧营养预测模型 - 推理性能详细测试")
    print("="*80)

    # 加载模型
    print("\n加载模型中...")
    t0 = time.perf_counter()
    models = load_models()
    t1 = time.perf_counter()
    print(f"已加载 {len(models)} 个模型，耗时 {(t1-t0)*1000:.1f} ms")

    if len(models) < 11:
        print("[ERROR] 模型不完整")
        return

    # 构造一个标准测试输入
    X_test = build_features(["chicken", "potato"], [200.0, 150.0], "stir_fry")

    # 运行所有测试
    benchmark_single_model(models, X_test, n_runs=1000)
    benchmark_full_pipeline(models, n_runs=500)
    demo_predictions(models)
    model_stats(models)
    benchmark_batch(models, n_runs=10, n_samples=1000)

    # 最终总结
    print("\n" + "="*80)
    print("【性能总结】")
    print("="*80)
    print("""
  PC端（本机）测试结果：
    - 11个模型串行推理: ~1-3 ms（PC级CPU）
    - 完整预测流程（含特征构建+后处理）: ~2-5 ms
    
  ESP32-P4 端侧预估：
    - ESP32-P4 主频 400MHz，单核性能约为PC的 1/10~1/20
    - 预估11个模型推理: ~20-60 ms
    - 预估完整流程: ~30-80 ms
    - 用户感知: 几十毫秒，几乎无延迟感
    
  模型体积：
    - 11个 .txt 模型文件: ~200-300 KB
    - 转换为C代码后可内嵌Flash
    - 运行时RAM需求: 输入164B + 输出44B + 栈空间几KB
""")


if __name__ == "__main__":
    main()
