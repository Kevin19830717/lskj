import os
import argparse
import warnings
import json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # 无GUI后端，避免弹窗
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import lightgbm as lgb

warnings.filterwarnings('ignore')

# matplotlib 中文显示
plt.rcParams['font.sans-serif'] = ['SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# ============================================================
# 1. 配置
# ============================================================

# 预测目标列
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

# 食材列表（与 final.json 中的 keys 一致）
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

def load_and_preprocess(csv_path: str) -> tuple:
    """
    加载CSV并做特征工程，返回 (X, y_dict)

    特征工程：
    - ingredients → 拆分为每个食材的 one-hot 列 + 食材数量
    - raw_weights_g → 拆分为每个位置的重量 + 总重量 + 平均重量
    - cooking_method → Label Encoding
    - 衍生特征：是否含水果、是否含肉类、食材数等
    """
    print(f"[1/5] 加载数据: {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"      原始数据: {len(df)} 行, {len(df.columns)} 列")

    # ----------------------------------------------------------
    # 2.1 解析 ingredients → one-hot
    # ----------------------------------------------------------
    print("      特征工程: 解析食材...")
    for ing in ALL_INGREDIENTS:
        df[f"ing_{ing}"] = df["ingredients"].apply(
            lambda x: 1 if ing in str(x).split("_") else 0
        )

    # ----------------------------------------------------------
    # 2.2 解析 raw_weights_g → 各位置重量 + 统计量
    # ----------------------------------------------------------
    print("      特征工程: 解析重量...")
    weights_split = df["raw_weights_g"].astype(str).str.split("_", expand=True)
    for i in range(4):
        col_name = f"raw_weight_{i+1}"
        df[col_name] = pd.to_numeric(weights_split[i], errors='coerce').fillna(0)

    df["raw_weight_total"] = df[["raw_weight_1", "raw_weight_2",
                                  "raw_weight_3", "raw_weight_4"]].sum(axis=1)
    df["raw_weight_mean"] = df["raw_weight_total"] / df["ingredients"].apply(
        lambda x: len(str(x).split("_"))
    )

    # ----------------------------------------------------------
    # 2.3 食材数量 & 分类特征
    # ----------------------------------------------------------
    print("      特征工程: 衍生特征...")
    df["n_ingredients"] = df["ingredients"].apply(
        lambda x: len(str(x).split("_"))
    )
    df["has_fruit"] = df["ingredients"].apply(
        lambda x: 1 if any(i in FRUITS for i in str(x).split("_")) else 0
    )
    df["has_meat"] = df["ingredients"].apply(
        lambda x: 1 if any(i in MEATS for i in str(x).split("_")) else 0
    )

    # ----------------------------------------------------------
    # 2.4 烹饪方式 Label Encoding
    # ----------------------------------------------------------
    le_method = LabelEncoder()
    df["cooking_method_enc"] = le_method.fit_transform(df["cooking_method"])
    method_mapping = dict(zip(le_method.classes_, le_method.transform(le_method.classes_)))
    print(f"      烹饪方式映射: {method_mapping}")

    # ----------------------------------------------------------
    # 2.5 构建特征矩阵 X 和目标字典 y
    # ----------------------------------------------------------
    feature_cols = (
        [f"ing_{ing}" for ing in ALL_INGREDIENTS]  # 31个食材 one-hot
        + ["raw_weight_1", "raw_weight_2", "raw_weight_3", "raw_weight_4"]  # 4个位置重量
        + ["raw_weight_total", "raw_weight_mean"]  # 总重、均重
        + ["n_ingredients", "has_fruit", "has_meat"]  # 衍生特征
        + ["cooking_method_enc"]  # 编码后的烹饪方式
    )

    X = df[feature_cols].copy()
    y_dict = {col: df[col].copy() for col in TARGET_COLS}

    print(f"      特征数: {len(feature_cols)}")
    print(f"      目标数: {len(TARGET_COLS)}")
    print(f"      特征列表: {feature_cols}")

    return X, y_dict, feature_cols, le_method


# ============================================================
# 3. 模型训练
# ============================================================

def train_models(X: pd.DataFrame, y_dict: dict, output_dir: str,
                 test_size: float = 0.2, seed: int = 42) -> dict:
    """
    为每个目标训练一个独立的 LightGBM 回归模型

    返回: results 字典，包含每个目标的评估指标
    """
    print(f"\n[2/5] 划分训练/测试集 (test_size={test_size}, seed={seed})")

    # 划分数据（所有目标用相同的划分）
    indices = np.arange(len(X))
    train_idx, test_idx = train_test_split(
        indices, test_size=test_size, random_state=seed
    )

    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    print(f"      训练集: {len(X_train)} 条, 测试集: {len(X_test)} 条")

    # LightGBM 参数
    lgb_params = {
        "objective": "regression",
        "metric": "rmse",
        "boosting_type": "gbdt",
        "num_leaves": 63,
        "learning_rate": 0.05,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "verbose": -1,
        "seed": seed,
    }

    results = {}

    print(f"\n[3/5] 开始训练 {len(TARGET_COLS)} 个模型...")
    print("-" * 65)

    for i, target in enumerate(TARGET_COLS):
        y_train = y_dict[target].iloc[train_idx]
        y_test = y_dict[target].iloc[test_idx]

        # 创建 LightGBM 数据集
        train_data = lgb.Dataset(X_train, label=y_train)
        valid_data = lgb.Dataset(X_test, label=y_test, reference=train_data)

        # 训练
        model = lgb.train(
            lgb_params,
            train_data,
            num_boost_round=1000,
            valid_sets=[train_data, valid_data],
            valid_names=["train", "valid"],
            callbacks=[
                lgb.early_stopping(stopping_rounds=50),
                lgb.log_evaluation(period=0),  # 不打印训练日志
            ],
        )

        # 预测
        y_pred = model.predict(X_test, num_iteration=model.best_iteration)

        # 评估
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        mae = mean_absolute_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)

        # 相对误差（MAPE，避免除以0）
        mask = y_test > 1.0
        if mask.sum() > 0:
            mape = np.mean(np.abs((y_test[mask] - y_pred[mask]) / y_test[mask])) * 100
        else:
            mape = 0.0

        results[target] = {
            "model": model,
            "rmse": rmse,
            "mae": mae,
            "r2": r2,
            "mape": mape,
            "best_iteration": model.best_iteration,
            "y_test": y_test.values,
            "y_pred": y_pred,
        }

        status = "OK" if r2 > 0.9 else ("WARN" if r2 > 0.8 else "POOR")
        print(f"  [{i+1:2d}/{len(TARGET_COLS)}] {target:30s} "
              f"RMSE={rmse:8.2f}  MAE={mae:8.2f}  "
              f"R2={r2:.4f}  MAPE={mape:5.1f}%  "
              f"iter={model.best_iteration:4d}  [{status}]")

        # 保存模型
        model_path = os.path.join(output_dir, f"lgbm_{target}.txt")
        model.save_model(model_path)

    return results


# ============================================================
# 4. 评估报告
# ============================================================

def print_report(results: dict):
    """打印评估摘要"""
    print(f"\n[4/5] 评估报告")
    print("=" * 90)
    print(f"  {'目标':30s} {'RMSE':>10s} {'MAE':>10s} {'R2':>8s} {'MAPE':>8s} {'迭代数':>8s}")
    print("-" * 90)

    for target in TARGET_COLS:
        r = results[target]
        print(f"  {target:30s} {r['rmse']:10.2f} {r['mae']:10.2f} "
              f"{r['r2']:8.4f} {r['mape']:7.1f}% {r['best_iteration']:8d}")

    # 总体统计
    avg_r2 = np.mean([r["r2"] for r in results.values()])
    avg_mape = np.mean([r["mape"] for r in results.values()])
    print("-" * 90)
    print(f"  {'平均':30s} {'':>10s} {'':>10s} {avg_r2:8.4f} {avg_mape:7.1f}%")
    print("=" * 90)

    if avg_r2 > 0.95:
        print("  >> 模型表现: 优秀 (平均 R2 > 0.95)")
    elif avg_r2 > 0.90:
        print("  >> 模型表现: 良好 (平均 R2 > 0.90)")
    elif avg_r2 > 0.80:
        print("  >> 模型表现: 一般 (平均 R2 > 0.80)，可考虑调参")
    else:
        print("  >> 模型表现: 较差 (平均 R2 < 0.80)，需要检查数据或特征")


# ============================================================
# 5. 可视化
# ============================================================

def plot_results(results: dict, output_dir: str, feature_cols: list):
    """生成可视化图表"""

    print(f"\n[5/5] 生成可视化图表...")

    # ----------------------------------------------------------
    # 5.1 特征重要性（取所有模型的平均）
    # ----------------------------------------------------------
    fig, ax = plt.subplots(figsize=(12, 8))

    # 收集所有模型的特征重要性
    all_importances = []
    for target in TARGET_COLS:
        model = results[target]["model"]
        importance = model.feature_importance(importance_type="gain")
        all_importances.append(importance)

    avg_importance = np.mean(all_importances, axis=0)
    sorted_idx = np.argsort(avg_importance)[::-1][:25]  # Top 25

    top_features = [feature_cols[i] for i in sorted_idx]
    top_values = avg_importance[sorted_idx]

    ax.barh(range(len(top_features)), top_values[::-1], color="steelblue")
    ax.set_yticks(range(len(top_features)))
    ax.set_yticklabels(top_features[::-1])
    ax.set_xlabel("Average Gain Importance")
    ax.set_title("Feature Importance (Top 25, Averaged Across All Targets)")
    plt.tight_layout()
    fig_path = os.path.join(output_dir, "feature_importance.png")
    fig.savefig(fig_path, dpi=150)
    plt.close(fig)
    print(f"      保存: {fig_path}")

    # ----------------------------------------------------------
    # 5.2 预测 vs 真实值散点图（每个目标一张子图）
    # ----------------------------------------------------------
    n_targets = len(TARGET_COLS)
    n_cols = 4
    n_rows = (n_targets + n_cols - 1) // n_cols

    fig, axes = plt.subplots(n_rows, n_cols, figsize=(20, n_rows * 4))
    axes = axes.flatten()

    for i, target in enumerate(TARGET_COLS):
        ax = axes[i]
        y_test = results[target]["y_test"]
        y_pred = results[target]["y_pred"]
        r2 = results[target]["r2"]

        ax.scatter(y_test, y_pred, alpha=0.3, s=10, color="steelblue")
        # 理想线
        min_val = min(y_test.min(), y_pred.min())
        max_val = max(y_test.max(), y_pred.max())
        ax.plot([min_val, max_val], [min_val, max_val], 'r--', linewidth=1)
        ax.set_xlabel("Actual")
        ax.set_ylabel("Predicted")
        short_name = target.replace("cooked_", "").replace("_", " ")
        ax.set_title(f"{short_name}\nR2={r2:.4f}", fontsize=10)
        ax.set_aspect('equal', adjustable='box')

    # 隐藏多余子图
    for j in range(n_targets, len(axes)):
        axes[j].set_visible(False)

    plt.suptitle("Prediction vs Actual (All Targets)", fontsize=14, y=1.02)
    plt.tight_layout()
    fig_path = os.path.join(output_dir, "prediction_scatter.png")
    fig.savefig(fig_path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"      保存: {fig_path}")

    # ----------------------------------------------------------
    # 5.3 R2 分数条形图
    # ----------------------------------------------------------
    fig, ax = plt.subplots(figsize=(12, 5))
    targets_short = [t.replace("cooked_", "").replace("_", " ") for t in TARGET_COLS]
    r2_values = [results[t]["r2"] for t in TARGET_COLS]
    colors = ["#2ecc71" if r2 > 0.95 else "#f39c12" if r2 > 0.9 else "#e74c3c" for r2 in r2_values]

    ax.bar(range(len(targets_short)), r2_values, color=colors)
    ax.set_xticks(range(len(targets_short)))
    ax.set_xticklabels(targets_short, rotation=45, ha='right', fontsize=8)
    ax.set_ylabel("R2 Score")
    ax.set_title("R2 Score by Target")
    ax.set_ylim(0, 1.05)
    ax.axhline(y=0.9, color='gray', linestyle='--', alpha=0.5)
    ax.axhline(y=0.95, color='gray', linestyle='--', alpha=0.5)

    for i, (v, c) in enumerate(zip(r2_values, colors)):
        ax.text(i, v + 0.01, f"{v:.3f}", ha='center', fontsize=8)

    plt.tight_layout()
    fig_path = os.path.join(output_dir, "r2_scores.png")
    fig.savefig(fig_path, dpi=150)
    plt.close(fig)
    print(f"      保存: {fig_path}")


# ============================================================
# 6. 预测演示函数（用训练好的模型做预测）
# ============================================================

def predict_nutrition(ingredients: list, weights: list, cooking_method: str,
                      models_dir: str, feature_cols: list, le_method: LabelEncoder):
    """
    使用训练好的模型预测一道菜的营养值

    参数:
        ingredients: 食材列表，如 ["chicken", "potato"]
        weights: 对应重量列表，如 [200.0, 150.0]
        cooking_method: 烹饪方式，如 "stir_fry"
        models_dir: 模型文件目录
        feature_cols: 特征列名列表
        le_method: 烹饪方式的 LabelEncoder
    """
    # 构建特征向量
    row = {}
    for col in feature_cols:
        row[col] = 0

    # 食材 one-hot
    for ing in ingredients:
        key = f"ing_{ing}"
        if key in row:
            row[key] = 1

    # 重量
    for i, w in enumerate(weights[:4]):
        row[f"raw_weight_{i+1}"] = w

    row["raw_weight_total"] = sum(weights)
    row["raw_weight_mean"] = sum(weights) / len(weights)
    row["n_ingredients"] = len(ingredients)
    row["has_fruit"] = 1 if any(i in FRUITS for i in ingredients) else 0
    row["has_meat"] = 1 if any(i in MEATS for i in ingredients) else 0

    # 烹饪方式编码
    try:
        row["cooking_method_enc"] = le_method.transform([cooking_method])[0]
    except ValueError:
        print(f"[WARN] 未知烹饪方式: {cooking_method}")
        row["cooking_method_enc"] = 0

    # 构建 DataFrame
    X = pd.DataFrame([row], columns=feature_cols)

    # 逐目标预测
    print(f"\n  预测: {'+'.join(ingredients)} ({cooking_method})")
    print(f"  生重: {weights}")
    print(f"  {'-'*45}")

    for target in TARGET_COLS:
        model_path = os.path.join(models_dir, f"lgbm_{target}.txt")
        if os.path.exists(model_path):
            model = lgb.Booster(model_file=model_path)
            pred = model.predict(X)[0]
            short = target.replace("cooked_", "")
            print(f"  {short:25s}: {pred:8.1f}")

    return X


# ============================================================
# 7. 主程序
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="LightGBM 烹饪营养预测训练脚本"
    )
    parser.add_argument("--data", type=str, default="training_data copy.csv",
                        help="训练数据CSV路径")
    parser.add_argument("--output", type=str, default="lgbm_output",
                        help="输出目录")
    parser.add_argument("--test-size", type=float, default=0.2,
                        help="测试集比例（默认0.2）")
    parser.add_argument("--seed", type=int, default=42,
                        help="随机种子（默认42）")
    args = parser.parse_args()

    print("=" * 70)
    print("LightGBM 烹饪营养预测训练")
    print("=" * 70)
    print(f"  数据文件: {args.data}")
    print(f"  输出目录: {args.output}")
    print(f"  测试比例: {args.test_size}")
    print(f"  随机种子: {args.seed}")
    print("=" * 70)

    # 创建输出目录
    os.makedirs(args.output, exist_ok=True)

    # 1. 加载数据
    X, y_dict, feature_cols, le_method = load_and_preprocess(args.data)

    # 2. 训练模型
    results = train_models(X, y_dict, args.output, args.test_size, args.seed)

    # 3. 打印报告
    print_report(results)

    # 4. 可视化
    plot_results(results, args.output, feature_cols)

    # 5. 保存元数据（特征列、编码映射等，用于后续预测）
    meta = {
        "feature_cols": feature_cols,
        "target_cols": TARGET_COLS,
        "method_mapping": {str(k): int(v) for k, v in
                           zip(le_method.classes_, le_method.transform(le_method.classes_))},
        "all_ingredients": ALL_INGREDIENTS,
        "seed": args.seed,
        "test_size": args.test_size,
        "metrics": {t: {"rmse": r["rmse"], "mae": r["mae"],
                        "r2": r["r2"], "mape": r["mape"]}
                    for t, r in results.items()},
    }
    meta_path = os.path.join(args.output, "model_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"\n  元数据已保存: {meta_path}")

    # 6. 预测演示
    print("\n" + "=" * 70)
    print("预测演示")
    print("=" * 70)
    predict_nutrition(
        ingredients=["chicken", "potato"],
        weights=[200.0, 150.0],
        cooking_method="stir_fry",
        models_dir=args.output,
        feature_cols=feature_cols,
        le_method=le_method,
    )

    print("\n" + "=" * 70)
    print(f"全部完成！输出目录: {args.output}")
    print("=" * 70)
    print(f"""
后续使用：
  1. 查看图表:
     - {args.output}/feature_importance.png
     - {args.output}/prediction_scatter.png
     - {args.output}/r2_scores.png

  2. 加载模型预测:
     import lightgbm as lgb
     model = lgb.Booster(model_file="{args.output}/lgbm_cooked_energy_kcal.txt")
     pred = model.predict(X_new)

  3. 如果 R2 < 0.9，可以尝试:
     - 增加训练数据 (--samples 50000)
     - 调大 num_leaves (63 -> 127)
     - 调小 learning_rate (0.05 -> 0.01) + 增加 num_boost_round
     - 增加特征 (如食材间的交互特征)
""")


if __name__ == "__main__":
    main()
