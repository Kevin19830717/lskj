"""
烹饪营养预测 — LightGBM 多输出回归训练脚本
============================================
核心：训练一个统一的多输出模型，一次预测11种营养值

策略对比：
  - MultiOutputRegressor：并行训练11个子模型，统一 API（一个 fit/predict）
  - RegressorChain：链式训练，利用目标间相关性（如 protein→energy）

使用方法：
  python train_lgbm_multi.py
  python train_lgbm_multi.py --strategy chain
"""

import os
import argparse
import warnings
import json
import time
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.multioutput import MultiOutputRegressor, RegressorChain
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from lightgbm import LGBMRegressor

warnings.filterwarnings('ignore')

plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# ============================================================
# 1. 配置
# ============================================================

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


# ============================================================
# 2. 数据加载与特征工程
# ============================================================

def load_and_preprocess(csv_path: str):
    """加载CSV并做特征工程"""
    print(f"[1/4] 加载数据: {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"      原始数据: {len(df)} 行, {len(df.columns)} 列")

    # 食材 one-hot
    for ing in ALL_INGREDIENTS:
        df[f"ing_{ing}"] = df["ingredients"].apply(
            lambda x: 1 if ing in str(x).split("_") else 0
        )

    # 重量解析
    weights_split = df["raw_weights_g"].astype(str).str.split("_", expand=True)
    for i in range(4):
        df[f"raw_weight_{i+1}"] = pd.to_numeric(weights_split[i], errors='coerce').fillna(0)

    df["raw_weight_total"] = df[["raw_weight_1", "raw_weight_2",
                                  "raw_weight_3", "raw_weight_4"]].sum(axis=1)
    df["raw_weight_mean"] = df["raw_weight_total"] / df["ingredients"].apply(
        lambda x: len(str(x).split("_"))
    )

    # 衍生特征
    df["n_ingredients"] = df["ingredients"].apply(lambda x: len(str(x).split("_")))
    df["has_fruit"] = df["ingredients"].apply(
        lambda x: 1 if any(i in FRUITS for i in str(x).split("_")) else 0
    )
    df["has_meat"] = df["ingredients"].apply(
        lambda x: 1 if any(i in MEATS for i in str(x).split("_")) else 0
    )

    # 烹饪方式编码
    le_method = LabelEncoder()
    df["cooking_method_enc"] = le_method.fit_transform(df["cooking_method"])

    # 特征列
    feature_cols = (
        [f"ing_{ing}" for ing in ALL_INGREDIENTS]
        + ["raw_weight_1", "raw_weight_2", "raw_weight_3", "raw_weight_4"]
        + ["raw_weight_total", "raw_weight_mean"]
        + ["n_ingredients", "has_fruit", "has_meat"]
        + ["cooking_method_enc"]
    )

    X = df[feature_cols].copy()
    y = df[TARGET_COLS].copy()  # 多输出：一次取所有目标列

    print(f"      特征数: {len(feature_cols)}, 目标数: {len(TARGET_COLS)}")
    return X, y, feature_cols, le_method


# ============================================================
# 3. 模型训练（多输出）
# ============================================================

def train_multioutput_model(X_train, y_train, strategy="parallel", seed=42):
    """
    训练多输出 LightGBM 模型

    strategy:
      - "parallel": MultiOutputRegressor（并行，各目标独立）
      - "chain": RegressorChain（链式，利用目标间相关性）
    """
    base_estimator = LGBMRegressor(
        objective="regression",
        boosting_type="gbdt",
        num_leaves=63,
        learning_rate=0.05,
        n_estimators=500,
        feature_fraction=0.8,
        bagging_fraction=0.8,
        bagging_freq=5,
        verbose=-1,
        seed=seed,
    )

    if strategy == "chain":
        # 链式顺序：先预测不依赖其他的，再预测依赖前面的
        # weight → protein, fat, carb → energy → 其他
        chain_order = [
            TARGET_COLS.index("cooked_weight_g"),       # 0  先预测重量
            TARGET_COLS.index("cooked_protein_g"),      # 2  三大营养素
            TARGET_COLS.index("cooked_fat_g"),          # 3
            TARGET_COLS.index("cooked_carbohydrate_g"), # 4
            TARGET_COLS.index("cooked_energy_kcal"),    # 1  热量依赖三大营养素
            TARGET_COLS.index("cooked_sodium_mg"),      # 5
            TARGET_COLS.index("cooked_cholesterol_mg"), # 6
            TARGET_COLS.index("cooked_vitamin_c_mg"),   # 7
            TARGET_COLS.index("cooked_calcium_mg"),     # 8
            TARGET_COLS.index("cooked_iron_mg"),        # 9
            TARGET_COLS.index("cooked_potassium_mg"),   # 10
        ]
        model = RegressorChain(
            base_estimator=base_estimator,
            order=chain_order,
            random_state=seed,
        )
        print(f"      策略: RegressorChain（链式多输出）")
        print(f"      链式顺序: weight → protein → fat → carb → energy → 其他")
    else:
        model = MultiOutputRegressor(base_estimator)
        print(f"      策略: MultiOutputRegressor（并行多输出）")

    return model


# ============================================================
# 4. 评估
# ============================================================

def evaluate_model(model, X_test, y_test, feature_cols):
    """评估多输出模型"""
    print(f"\n[3/4] 模型评估")
    print("-" * 90)
    print(f"  {'目标':30s} {'RMSE':>10s} {'MAE':>10s} {'R2':>8s} {'MAPE':>8s}")
    print("-" * 90)

    y_pred = model.predict(X_test)
    results = {}

    for i, target in enumerate(TARGET_COLS):
        y_true = y_test.iloc[:, i].values
        y_p = y_pred[:, i]

        rmse = np.sqrt(mean_squared_error(y_true, y_p))
        mae = mean_absolute_error(y_true, y_p)
        r2 = r2_score(y_true, y_p)

        mask = y_true > 1.0
        mape = np.mean(np.abs((y_true[mask] - y_p[mask]) / y_true[mask])) * 100 if mask.sum() > 0 else 0.0

        status = "OK" if r2 > 0.9 else ("WARN" if r2 > 0.8 else "POOR")
        print(f"  {target:30s} {rmse:10.2f} {mae:10.2f} {r2:8.4f} {mape:7.1f}%  [{status}]")

        results[target] = {"rmse": rmse, "mae": mae, "r2": r2, "mape": mape,
                           "y_test": y_true, "y_pred": y_p}

    avg_r2 = np.mean([r["r2"] for r in results.values()])
    avg_mape = np.mean([r["mape"] for r in results.values()])
    print("-" * 90)
    print(f"  {'平均':30s} {'':>10s} {'':>10s} {avg_r2:8.4f} {avg_mape:7.1f}%")
    print("=" * 90)

    return results, y_pred


# ============================================================
# 5. 可视化
# ============================================================

def plot_results(results, y_test, y_pred, output_dir, feature_cols, model, strategy):
    """生成可视化图表"""
    print(f"\n[4/4] 生成可视化图表...")

    # 5.1 R2 分数条形图
    fig, ax = plt.subplots(figsize=(12, 5))
    targets_short = [t.replace("cooked_", "").replace("_", " ") for t in TARGET_COLS]
    r2_values = [results[t]["r2"] for t in TARGET_COLS]
    colors = ["#2ecc71" if r2 > 0.95 else "#f39c12" if r2 > 0.9 else "#e74c3c" for r2 in r2_values]

    bars = ax.bar(range(len(targets_short)), r2_values, color=colors)
    ax.set_xticks(range(len(targets_short)))
    ax.set_xticklabels(targets_short, rotation=45, ha='right', fontsize=8)
    ax.set_ylabel("R2 Score")
    strategy_name = "RegressorChain" if strategy == "chain" else "MultiOutputRegressor"
    ax.set_title(f"R2 Score by Target ({strategy_name})")
    ax.set_ylim(0, 1.05)
    ax.axhline(y=0.9, color='gray', linestyle='--', alpha=0.5)
    for i, v in enumerate(r2_values):
        ax.text(i, v + 0.01, f"{v:.3f}", ha='center', fontsize=8)
    plt.tight_layout()
    fig_path = os.path.join(output_dir, "r2_scores.png")
    fig.savefig(fig_path, dpi=150)
    plt.close(fig)
    print(f"      保存: {fig_path}")

    # 5.2 预测 vs 真实散点图
    n_targets = len(TARGET_COLS)
    n_cols = 4
    n_rows = (n_targets + n_cols - 1) // n_cols
    fig, axes = plt.subplots(n_rows, n_cols, figsize=(20, n_rows * 4))
    axes = axes.flatten()

    for i, target in enumerate(TARGET_COLS):
        ax = axes[i]
        yt = results[target]["y_test"]
        yp = results[target]["y_pred"]
        r2 = results[target]["r2"]

        ax.scatter(yt, yp, alpha=0.3, s=10, color="steelblue")
        min_val = min(yt.min(), yp.min())
        max_val = max(yt.max(), yp.max())
        ax.plot([min_val, max_val], [min_val, max_val], 'r--', linewidth=1)
        ax.set_xlabel("Actual")
        ax.set_ylabel("Predicted")
        short = target.replace("cooked_", "").replace("_", " ")
        ax.set_title(f"{short}\nR2={r2:.4f}", fontsize=10)

    for j in range(n_targets, len(axes)):
        axes[j].set_visible(False)

    plt.suptitle(f"Prediction vs Actual ({strategy_name})", fontsize=14, y=1.02)
    plt.tight_layout()
    fig_path = os.path.join(output_dir, "prediction_scatter.png")
    fig.savefig(fig_path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"      保存: {fig_path}")

    # 5.3 特征重要性
    # 注意：RegressorChain 中后续子模型会多出"前序目标预测值"作为特征，
    # 导致各子模型的 feature_importances_ 长度不同，无法直接取平均。
    # 解决：只统计原始特征部分的重要性，链式追加的目标特征单独显示。
    fig, axes = plt.subplots(1, 2, figsize=(20, 8), gridspec_kw={'width_ratios': [3, 1]})

    estimators = model.estimators_
    n_original_features = len(feature_cols)

    # 只取每个子模型中"原始特征"部分的重要性
    original_importances = []
    chain_bonus_importances = []  # 链式追加的目标特征重要性

    for est in estimators:
        imp = est.feature_importances_
        original_importances.append(imp[:n_original_features])
        if len(imp) > n_original_features:
            chain_bonus_importances.append(imp[n_original_features:])

    avg_importance = np.mean(original_importances, axis=0)
    sorted_idx = np.argsort(avg_importance)[::-1][:20]

    top_features = [feature_cols[i] for i in sorted_idx]
    top_values = avg_importance[sorted_idx]

    # 左图：原始特征重要性
    ax = axes[0]
    ax.barh(range(len(top_features)), top_values[::-1], color="steelblue")
    ax.set_yticks(range(len(top_features)))
    ax.set_yticklabels(top_features[::-1])
    ax.set_xlabel("Average Feature Importance (split)")
    ax.set_title(f"Original Features Top 20 ({strategy_name})")

    # 右图：链式追加的目标特征重要性（如果有）
    ax = axes[1]
    if chain_bonus_importances:
        # 各子模型追加的特征数不同，取平均
        max_bonus = max(len(imp) for imp in chain_bonus_importances)
        bonus_names = [TARGET_COLS[i].replace("cooked_", "") for i in range(max_bonus)]
        bonus_avg = np.zeros(max_bonus)
        bonus_count = np.zeros(max_bonus)
        for imp in chain_bonus_importances:
            for j in range(len(imp)):
                bonus_avg[j] += imp[j]
                bonus_count[j] += 1
        bonus_avg = bonus_avg / np.maximum(bonus_count, 1)
        bonus_sorted = np.argsort(bonus_avg)[::-1]
        bonus_avg = bonus_avg[bonus_sorted]
        bonus_names_sorted = [bonus_names[i] for i in bonus_sorted if bonus_avg[bonus_names.index(bonus_names[i])] > 0]
        # 简化：只显示非零的
        non_zero = bonus_avg > 0
        ax.barh(range(non_zero.sum()), bonus_avg[non_zero][::-1], color="coral")
        ax.set_yticks(range(non_zero.sum()))
        ax.set_yticklabels([bonus_names[i] for i in np.where(non_zero)[0]][::-1])
        ax.set_xlabel("Avg Importance from Chain Targets")
        ax.set_title("Chain Bonus Features\n(previous target predictions)")
    else:
        ax.text(0.5, 0.5, "N/A\n(parallel strategy)", ha='center', va='center', fontsize=14)
        ax.set_title("Chain Bonus Features")

    plt.tight_layout()
    fig_path = os.path.join(output_dir, "feature_importance.png")
    fig.savefig(fig_path, dpi=150)
    plt.close(fig)
    print(f"      保存: {fig_path}")

    # 5.4 目标间相关性热力图
    fig, ax = plt.subplots(figsize=(10, 8))
    corr = y_test.corr()
    im = ax.imshow(corr.values, cmap='RdYlGn', vmin=-1, vmax=1)
    ax.set_xticks(range(len(TARGET_COLS)))
    ax.set_yticks(range(len(TARGET_COLS)))
    short_names = [t.replace("cooked_", "").replace("_", "\n") for t in TARGET_COLS]
    ax.set_xticklabels(short_names, fontsize=7, rotation=45, ha='right')
    ax.set_yticklabels(short_names, fontsize=7)
    for i in range(len(TARGET_COLS)):
        for j in range(len(TARGET_COLS)):
            ax.text(j, i, f"{corr.values[i, j]:.2f}", ha='center', va='center', fontsize=6)
    ax.set_title("Target Correlation Matrix")
    fig.colorbar(im, ax=ax, shrink=0.8)
    plt.tight_layout()
    fig_path = os.path.join(output_dir, "target_correlation.png")
    fig.savefig(fig_path, dpi=150)
    plt.close(fig)
    print(f"      保存: {fig_path}")


# ============================================================
# 6. 预测接口
# ============================================================

def predict_nutrition(ingredients, weights, cooking_method, model, feature_cols, le_method):
    """使用多输出模型一次预测所有营养值"""
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
        row["cooking_method_enc"] = 0

    X = pd.DataFrame([row], columns=feature_cols)

    # 一次预测，输出11个值
    predictions = model.predict(X)[0]

    print(f"\n  预测: {'+'.join(ingredients)} ({cooking_method})")
    print(f"  生重: {weights}")
    print(f"  {'-'*45}")

    atwater_sum = 0
    for i, target in enumerate(TARGET_COLS):
        short = target.replace("cooked_", "")
        val = predictions[i]
        print(f"  {short:25s}: {val:8.1f}")
        if short == "protein_g":
            atwater_sum += val * 4
        elif short == "fat_g":
            atwater_sum += val * 9
        elif short == "carbohydrate_g":
            atwater_sum += val * 4

    energy_idx = TARGET_COLS.index("cooked_energy_kcal")
    print(f"  {'-'*45}")
    print(f"  Atwater验算热量: {atwater_sum:.1f} kcal (预测: {predictions[energy_idx]:.1f})")
    print(f"  偏差: {abs(atwater_sum - predictions[energy_idx]) / max(predictions[energy_idx], 1) * 100:.1f}%")

    return predictions


# ============================================================
# 7. 主程序
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="LightGBM 多输出回归 — 烹饪营养预测"
    )
    parser.add_argument("--data", type=str, default="training_data copy.csv",
                        help="训练数据CSV路径")
    parser.add_argument("--output", type=str, default="lgbm_output_multi",
                        help="输出目录")
    parser.add_argument("--strategy", type=str, default="chain",
                        choices=["parallel", "chain"],
                        help="多输出策略: parallel(并行) / chain(链式,默认)")
    parser.add_argument("--test-size", type=float, default=0.2,
                        help="测试集比例")
    parser.add_argument("--seed", type=int, default=42,
                        help="随机种子")
    args = parser.parse_args()

    print("=" * 70)
    print("LightGBM 多输出回归 — 烹饪营养预测")
    print("=" * 70)
    print(f"  数据文件: {args.data}")
    print(f"  输出目录: {args.output}")
    print(f"  多输出策略: {args.strategy}")
    print(f"  随机种子: {args.seed}")
    print("=" * 70)

    os.makedirs(args.output, exist_ok=True)

    # 1. 加载数据
    X, y, feature_cols, le_method = load_and_preprocess(args.data)

    # 2. 划分数据
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed
    )
    print(f"\n[2/4] 训练集: {len(X_train)} 条, 测试集: {len(X_test)} 条")

    # 3. 训练多输出模型
    model = train_multioutput_model(X_train, y_train, strategy=args.strategy, seed=args.seed)
    print(f"      开始训练...")

    t0 = time.time()
    model.fit(X_train, y_train)
    train_time = time.time() - t0
    print(f"      训练完成！耗时: {train_time:.1f}s")

    # 4. 评估
    results, y_pred = evaluate_model(model, X_test, y_test, feature_cols)

    # 5. 可视化
    plot_results(results, y_test, y_pred, args.output, feature_cols, model, args.strategy)

    # 6. 保存模型（用 pickle，因为 sklearn 包装器不支持 LightGBM 原生保存）
    import pickle
    model_path = os.path.join(args.output, "multi_output_model.pkl")
    with open(model_path, "wb") as f:
        pickle.dump({
            "model": model,
            "feature_cols": feature_cols,
            "target_cols": TARGET_COLS,
            "le_method": le_method,
            "strategy": args.strategy,
        }, f)
    print(f"\n  模型已保存: {model_path}")

    # 7. 保存元数据
    meta = {
        "strategy": args.strategy,
        "feature_cols": feature_cols,
        "target_cols": TARGET_COLS,
        "method_mapping": {str(k): int(v) for k, v in
                           zip(le_method.classes_, le_method.transform(le_method.classes_))},
        "metrics": {t: {"rmse": r["rmse"], "mae": r["mae"], "r2": r["r2"], "mape": r["mape"]}
                    for t, r in results.items()},
        "train_time_sec": train_time,
    }
    meta_path = os.path.join(args.output, "model_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # 8. 预测演示
    print("\n" + "=" * 70)
    print("预测演示")
    print("=" * 70)

    # 示例1：鸡肉+土豆炒
    predict_nutrition(
        ingredients=["chicken", "potato"],
        weights=[200.0, 150.0],
        cooking_method="stir_fry",
        model=model, feature_cols=feature_cols, le_method=le_method,
    )

    # 示例2：牛肉炖
    predict_nutrition(
        ingredients=["beef", "carrot", "potato"],
        weights=[300.0, 200.0, 150.0],
        cooking_method="braise",
        model=model, feature_cols=feature_cols, le_method=le_method,
    )

    # 示例3：蒸虾
    predict_nutrition(
        ingredients=["shrimp"],
        weights=[250.0],
        cooking_method="steam",
        model=model, feature_cols=feature_cols, le_method=le_method,
    )

    print("\n" + "=" * 70)
    print(f"全部完成！输出目录: {args.output}")
    print("=" * 70)
    print(f"""
后续使用 — 加载模型做预测:
  import pickle
  with open("{args.output}/multi_output_model.pkl", "rb") as f:
      saved = pickle.load(f)
  model = saved["model"]
  predictions = model.predict(X_new)  # 一次输出11个营养值
""")


if __name__ == "__main__":
    main()
