"""
训练数据综合分析脚本
分析 training_data.json 的分布、合理性、异常值等
"""
import json
import sys
from collections import Counter, defaultdict
import statistics

# ── 常量 ──
ATWATER_PROTEIN = 4.0
ATWATER_FAT = 9.0
ATWATER_CARB = 4.0

FRUITS = {"apple", "banana", "grape", "kiwi", "kumquat", "lemon",
          "orange", "peach", "pineapple", "strawberry", "watermelon"}
MEATS = {"beef", "chicken", "pork", "shrimp", "fish"}

filepath = sys.argv[1] if len(sys.argv) > 1 else "training_data.json"

with open(filepath, "r", encoding="utf-8") as f:
    data = json.load(f)

print("=" * 70)
print(f"训练数据分析报告 — {filepath}")
print("=" * 70)

# ═══════════════════════════════════════════════════════════════════
# 1. 基本统计
# ═══════════════════════════════════════════════════════════════════
print("\n【1. 基本统计】")
print(f"  总样本数: {len(data)}")
print(f"  每条字段数: {len(data[0]) if data else 0}")
print(f"  字段列表: {list(data[0].keys()) if data else 'N/A'}")

# ═══════════════════════════════════════════════════════════════════
# 2. 烹饪方式分布
# ═══════════════════════════════════════════════════════════════════
print("\n【2. 烹饪方式分布】")
method_counts = Counter(s["cooking_method"] for s in data)
total = len(data)
for m, c in sorted(method_counts.items(), key=lambda x: -x[1]):
    print(f"  {m:12s}: {c:5d} ({c/total:.1%})")

# ═══════════════════════════════════════════════════════════════════
# 3. 食材数量分布
# ═══════════════════════════════════════════════════════════════════
print("\n【3. 食材数量分布】")
ing_count_dist = Counter(len(s["ingredients"]) for s in data)
for n in sorted(ing_count_dist.keys()):
    c = ing_count_dist[n]
    print(f"  {n}种食材: {c:5d} ({c/total:.1%})")

# ═══════════════════════════════════════════════════════════════════
# 4. 食材出现频率 Top 15
# ═══════════════════════════════════════════════════════════════════
print("\n【4. 食材出现频率 Top 15】")
ingredient_counts = Counter()
for s in data:
    for ing in s["ingredients"]:
        ingredient_counts[ing] += 1
for ing, c in ingredient_counts.most_common(15):
    cat = "水果" if ing in FRUITS else ("肉类" if ing in MEATS else "其他")
    print(f"  {ing:15s}: {c:5d} ({c/total:.1%}) [{cat}]")

# ═══════════════════════════════════════════════════════════════════
# 5. 水果 × 烹饪方式交叉分析
# ═══════════════════════════════════════════════════════════════════
print("\n【5. 水果 × 烹饪方式交叉分析】")
fruit_method = Counter()
fruit_total = 0
for s in data:
    has_fruit = any(i in FRUITS for i in s["ingredients"])
    if has_fruit:
        fruit_method[s["cooking_method"]] += 1
        fruit_total += 1

print(f"  含水果菜品总计: {fruit_total}/{total} ({fruit_total/total:.1%})")
for m, c in sorted(fruit_method.items(), key=lambda x: -x[1]):
    pct = c / method_counts[m] * 100
    print(f"  {m:12s}: {c:4d} 条 (占该烹饪方式 {pct:.1f}%)")

# ═══════════════════════════════════════════════════════════════════
# 6. 营养值描述性统计
# ═══════════════════════════════════════════════════════════════════
print("\n【6. 营养值描述性统计】")
nut_cols = [
    ("cooked_energy_kcal", "热量(kcal)"),
    ("cooked_protein_g", "蛋白质(g)"),
    ("cooked_fat_g", "脂肪(g)"),
    ("cooked_carbohydrate_g", "碳水(g)"),
    ("cooked_sodium_mg", "钠(mg)"),
    ("cooked_cholesterol_mg", "胆固醇(mg)"),
    ("cooked_vitamin_c_mg", "维C(mg)"),
    ("cooked_calcium_mg", "钙(mg)"),
    ("cooked_iron_mg", "铁(mg)"),
    ("cooked_potassium_mg", "钾(mg)"),
]
print(f"  {'营养素':15s} {'均值':>10s} {'中位数':>10s} {'标准差':>10s} {'最小值':>10s} {'最大值':>10s}")
print("  " + "-" * 65)
for col, label in nut_cols:
    vals = [s[col] for s in data]
    mean_v = statistics.mean(vals)
    med_v = statistics.median(vals)
    std_v = statistics.stdev(vals)
    min_v = min(vals)
    max_v = max(vals)
    print(f"  {label:15s} {mean_v:10.1f} {med_v:10.1f} {std_v:10.1f} {min_v:10.1f} {max_v:10.1f}")

# ═══════════════════════════════════════════════════════════════════
# 7. 熟重变化分析（按烹饪方式）
# ═══════════════════════════════════════════════════════════════════
print("\n【7. 熟重变化率（按烹饪方式）】")
print(f"  {'烹饪方式':12s} {'平均变化':>10s} {'中位变化':>10s} {'样本数':>8s}")
print("  " + "-" * 42)
for method in sorted(method_counts.keys()):
    weight_changes = []
    for s in data:
        if s["cooking_method"] == method:
            raw_w = sum(s["raw_weights_g"])
            cooked_w = s["cooked_weight_g"]
            change_pct = (cooked_w - raw_w) / raw_w * 100
            weight_changes.append(change_pct)
    if weight_changes:
        avg_c = statistics.mean(weight_changes)
        med_c = statistics.median(weight_changes)
        print(f"  {method:12s} {avg_c:+10.1f}% {med_c:+10.1f}% {len(weight_changes):8d}")

# ═══════════════════════════════════════════════════════════════════
# 8. Atwater 能量一致性检查
# ═══════════════════════════════════════════════════════════════════
print("\n【8. Atwater 能量一致性检查】")
mismatch_count = 0
max_mismatch = 0.0
mismatch_examples = []
for s in data:
    expected = (s["cooked_protein_g"] * ATWATER_PROTEIN
                + s["cooked_fat_g"] * ATWATER_FAT
                + s["cooked_carbohydrate_g"] * ATWATER_CARB)
    actual = s["cooked_energy_kcal"]
    err_pct = abs(actual - expected) / max(expected, 0.01) * 100
    if err_pct > 2.0:
        mismatch_count += 1
        if err_pct > max_mismatch:
            max_mismatch = err_pct
        if len(mismatch_examples) < 3:
            mismatch_examples.append((s, expected, actual, err_pct))

if mismatch_count == 0:
    print("  [OK] 全部通过！所有样本的 energy = 4*蛋白 + 9*脂肪 + 4*碳水（误差<2%）")
else:
    print(f"  [FAIL] {mismatch_count}/{total} 条不匹配（误差>2%）")
    print(f"  最大误差: {max_mismatch:.1f}%")
    for s, exp, act, err in mismatch_examples:
        print(f"  示例: {s['cooking_method']} {'_'.join(s['ingredients'])} "
              f"实际={act:.1f} 期望={exp:.1f} 误差={err:.1f}%")

# ═══════════════════════════════════════════════════════════════════
# 9. 异常值检测
# ═══════════════════════════════════════════════════════════════════
print("\n【9. 异常值检测】")
issues = {
    "负值": 0,
    "熟重为0": 0,
    "胆固醇在纯植物菜中出现>0": 0,
    "钠异常高(>10000mg)": 0,
    "脂肪为0但热量>100": 0,
}

for s in data:
    # 负值
    for k, v in s.items():
        if isinstance(v, (int, float)) and v < 0:
            issues["负值"] += 1
            break
    # 熟重为0
    if s["cooked_weight_g"] <= 0:
        issues["熟重为0"] += 1
    # 纯植物菜有胆固醇
    all_plant = all(i not in MEATS and i not in {"egg", "shrimp", "fish"} for i in s["ingredients"])
    if all_plant and s["cooked_cholesterol_mg"] > 0:
        issues["胆固醇在纯植物菜中出现>0"] += 1
    # 钠异常
    if s["cooked_sodium_mg"] > 10000:
        issues["钠异常高(>10000mg)"] += 1
    # 脂肪0但热量高
    if s["cooked_fat_g"] < 0.01 and s["cooked_energy_kcal"] > 100:
        issues["脂肪为0但热量>100"] += 1

all_clean = all(v == 0 for v in issues.values())
if all_clean:
    print("  [OK] 未检测到异常值")
else:
    for k, v in issues.items():
        if v > 0:
            print(f"  [WARN] {k}: {v} 条")

# ═══════════════════════════════════════════════════════════════════
# 10. 各烹饪方式营养值均值对比
# ═══════════════════════════════════════════════════════════════════
print("\n【10. 各烹饪方式平均营养值（每道菜）】")
print(f"  {'方式':12s} {'热量':>8s} {'蛋白':>8s} {'脂肪':>8s} {'碳水':>8s} {'钠':>8s} {'熟重变化':>8s}")
print("  " + "-" * 64)
for method in sorted(method_counts.keys()):
    subset = [s for s in data if s["cooking_method"] == method]
    n = len(subset)
    avg_e = sum(s["cooked_energy_kcal"] for s in subset) / n
    avg_p = sum(s["cooked_protein_g"] for s in subset) / n
    avg_f = sum(s["cooked_fat_g"] for s in subset) / n
    avg_c = sum(s["cooked_carbohydrate_g"] for s in subset) / n
    avg_na = sum(s["cooked_sodium_mg"] for s in subset) / n
    avg_wc = sum((s["cooked_weight_g"] - sum(s["raw_weights_g"])) / sum(s["raw_weights_g"]) * 100 for s in subset) / n
    print(f"  {method:12s} {avg_e:8.0f} {avg_p:8.1f} {avg_f:8.1f} {avg_c:8.1f} {avg_na:8.0f} {avg_wc:+7.1f}%")

# ═══════════════════════════════════════════════════════════════════
# 11. 特例水果验证
# ═══════════════════════════════════════════════════════════════════
print("\n【11. 特例水果分布验证】")
fruit_detail = defaultdict(lambda: Counter())
for s in data:
    for ing in s["ingredients"]:
        if ing in FRUITS:
            fruit_detail[ing][s["cooking_method"]] += 1

for fruit in sorted(fruit_detail.keys()):
    methods = fruit_detail[fruit]
    total_f = sum(methods.values())
    top3 = methods.most_common(3)
    top3_str = ", ".join(f"{m}={c}" for m, c in top3)
    print(f"  {fruit:12s}: {total_f:4d} 条 | Top3: {top3_str}")

print("\n" + "=" * 70)
print("分析完成")
print("=" * 70)
