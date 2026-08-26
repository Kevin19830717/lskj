"""
为用户 13800000007 (user_id=20) 重新生成 2026-07-20 到 2026-08-11 的完整一日三餐数据
食材模式：只能用 foods 表里的 31 种基础食材组合
饮食正常（男性 20 岁 65kg，每日约 2200-2500 kcal）
"""
import psycopg2
import json
import random
from datetime import datetime, timedelta

# 连接数据库
conn = psycopg2.connect(
    host="localhost", port=5432,
    user="postgres", password="321738392",
    dbname="smart_scale"
)
cur = conn.cursor()

# 1. 清除旧数据（包括 weigh_records + summaries + advice）
print("=== 清除 7.20-8.12 的旧数据 ===")
cur.execute("""
    DELETE FROM weigh_records_default
    WHERE user_id = 20 AND created_at >= '2026-07-20' AND created_at < '2026-08-12'
""")
deleted_records = cur.rowcount

cur.execute("""
    DELETE FROM user_analysis_summaries
    WHERE user_id = 20 AND summary_date >= '2026-07-20' AND summary_date < '2026-08-12'
""")
deleted_summaries = cur.rowcount

cur.execute("""
    DELETE FROM health_advice_records
    WHERE user_id = 20 AND week_start_date >= '2026-07-20' AND week_start_date < '2026-08-12'
""")
deleted_advice = cur.rowcount
conn.commit()
print(f"删除：records={deleted_records}, summaries={deleted_summaries}, advice={deleted_advice}")

# 2. 读取 31 种基础食材的营养数据
print("\n=== 读取 31 种基础食材 ===")
cur.execute("SELECT name, energy_kcal, protein_g, fat_g, carbohydrate_g, sodium_mg, cholesterol_mg, vitamin_c_mg, calcium_mg, iron_mg, potassium_mg FROM foods")
foods = {}
for row in cur.fetchall():
    name = row[0]
    foods[name] = {
        "kcal": float(row[1] or 0),
        "protein": float(row[2] or 0),
        "fat": float(row[3] or 0),
        "carb": float(row[4] or 0),
        "sodium": float(row[5] or 0),
        "chol": float(row[6] or 0),
        "vit_c": float(row[7] or 0),
        "calcium": float(row[8] or 0),
        "iron": float(row[9] or 0),
        "potassium": float(row[10] or 0),
    }
print(f"加载 {len(foods)} 种食材")

# 3. 食材组合库（每餐 2-5 种基础食材 + 烹饪方式）
# 关键词：增肌、20岁男、65kg，每日需 ~2500 kcal，蛋白质 ~110-130g
meal_combinations = {
    "breakfast": [
        # 主食 + 蛋白 + 蔬果（克重增加到合理水平）
        {"items": [("鸡蛋", 150), ("马铃薯", 250), ("洋葱", 40), ("苹果", 200)],
         "method": "stir_fry"},
        {"items": [("鸡蛋", 80), ("香蕉", 120), ("马铃薯", 150), ("牛奶", 0)],  # 牛奶不在31种
         "method": "boil"},
        {"items": [("鸡蛋", 100), ("马铃薯", 180), ("胡萝卜", 50), ("豆腐", 80)],
         "method": "stir_fry"},
        {"items": [("鸡蛋", 100), ("花菜", 150), ("洋葱", 40), ("马铃薯", 120), ("苹果", 150)],
         "method": "stir_fry"},
        {"items": [("鸡蛋", 80), ("香蕉", 150), ("猕猴桃", 100), ("马铃薯", 200)],
         "method": "boil"},
        {"items": [("鸡蛋", 100), ("胡萝卜", 60), ("马铃薯", 150), ("卷心菜", 100)],
         "method": "stir_fry"},
        {"items": [("鸡蛋", 80), ("草莓", 120), ("马铃薯", 180), ("黄瓜", 80)],
         "method": "stir_fry"},
        {"items": [("鸡蛋", 100), ("马铃薯", 200), ("番茄", 100), ("苹果", 150)],
         "method": "stir_fry"},
        {"items": [("鸡蛋", 80), ("香蕉", 120), ("胡萝卜", 50), ("马铃薯", 180)],
         "method": "boil"},
        {"items": [("鸡蛋", 100), ("豆腐", 100), ("马铃薯", 150), ("黄瓜", 80)],
         "method": "stir_fry"},
    ],
    "lunch": [
        # 蛋白 + 主食 + 蔬菜
        {"items": [("鸡肉", 180), ("马铃薯", 200), ("胡萝卜", 60), ("洋葱", 40)],
         "method": "stir_fry"},
        {"items": [("牛肉", 150), ("马铃薯", 180), ("番茄", 120), ("花菜", 100)],
         "method": "stir_fry"},
        {"items": [("鱼", 200), ("马铃薯", 150), ("胡萝卜", 60), ("黄瓜", 80), ("生姜", 10)],
         "method": "steam"},
        {"items": [("虾", 150), ("马铃薯", 150), ("西兰花", 0), ("大蒜", 10), ("黄瓜", 80)],  # 西兰花不在
         "method": "stir_fry"},
        {"items": [("猪肉", 150), ("马铃薯", 200), ("卷心菜", 120), ("胡萝卜", 50)],
         "method": "stir_fry"},
        {"items": [("鸡肉", 200), ("胡萝卜", 80), ("马铃薯", 150), ("洋葱", 50), ("苹果", 150)],
         "method": "braise"},
        {"items": [("牛肉", 180), ("洋葱", 60), ("马铃薯", 150), ("番茄", 120), ("甜椒", 80)],
         "method": "stir_fry"},
        {"items": [("鱼", 180), ("生姜", 10), ("大蒜", 10), ("胡萝卜", 80), ("马铃薯", 200), ("黄瓜", 100)],
         "method": "steam"},
        {"items": [("鸡蛋", 150), ("马铃薯", 200), ("番茄", 150), ("洋葱", 50)],
         "method": "stir_fry"},
        {"items": [("虾", 180), ("大蒜", 15), ("胡萝卜", 80), ("马铃薯", 180), ("花菜", 100)],
         "method": "stir_fry"},
        {"items": [("鸡肉", 150), ("豆腐", 100), ("胡萝卜", 60), ("马铃薯", 180), ("甜椒", 60)],
         "method": "stir_fry"},
        {"items": [("牛肉", 150), ("胡萝卜", 50), ("洋葱", 50), ("马铃薯", 200), ("番茄", 100)],
         "method": "braise"},
        {"items": [("鱼", 180), ("生姜", 10), ("大蒜", 10), ("胡萝卜", 80), ("黄瓜", 100), ("马铃薯", 150)],
         "method": "steam"},
        {"items": [("猪肉", 180), ("洋葱", 60), ("胡萝卜", 60), ("马铃薯", 200), ("黄瓜", 80)],
         "method": "stir_fry"},
        {"items": [("鸡肉", 200), ("花菜", 100), ("胡萝卜", 60), ("马铃薯", 180), ("大蒜", 10)],
         "method": "stir_fry"},
    ],
    "dinner": [
        {"items": [("鸡蛋", 100), ("马铃薯", 150), ("黄瓜", 100), ("胡萝卜", 50), ("苹果", 150)],
         "method": "stir_fry"},
        {"items": [("鱼", 150), ("生姜", 10), ("胡萝卜", 80), ("马铃薯", 150), ("黄瓜", 80)],
         "method": "steam"},
        {"items": [("豆腐", 150), ("胡萝卜", 60), ("洋葱", 50), ("马铃薯", 150), ("番茄", 100)],
         "method": "stir_fry"},
        {"items": [("虾", 120), ("花菜", 100), ("大蒜", 10), ("马铃薯", 180), ("黄瓜", 100)],
         "method": "stir_fry"},
        {"items": [("鸡蛋", 120), ("番茄", 150), ("洋葱", 50), ("马铃薯", 150), ("黄瓜", 80)],
         "method": "stir_fry"},
        {"items": [("鸡肉", 150), ("胡萝卜", 60), ("洋葱", 50), ("马铃薯", 150), ("苹果", 150)],
         "method": "stir_fry"},
        {"items": [("牛肉", 120), ("胡萝卜", 50), ("洋葱", 50), ("马铃薯", 180), ("番茄", 100)],
         "method": "braise"},
        {"items": [("猪肉", 120), ("卷心菜", 100), ("胡萝卜", 50), ("马铃薯", 150), ("黄瓜", 80)],
         "method": "stir_fry"},
        {"items": [("鱼", 180), ("胡萝卜", 80), ("洋葱", 50), ("马铃薯", 150), ("黄瓜", 100)],
         "method": "steam"},
        {"items": [("鸡蛋", 100), ("马铃薯", 150), ("胡萝卜", 60), ("洋葱", 40), ("苹果", 150)],
         "method": "stir_fry"},
        {"items": [("虾", 100), ("黄瓜", 100), ("胡萝卜", 60), ("马铃薯", 150), ("生姜", 10)],
         "method": "stir_fry"},
        {"items": [("豆腐", 150), ("胡萝卜", 60), ("花菜", 100), ("马铃薯", 180), ("番茄", 100)],
         "method": "stir_fry"},
    ],
}

# 4. 计算营养素（按食物名称和克重，忽略不在数据库的食材如牛奶、西兰花）
# 烹饪附加：只加油脂(9kcal/g)和盐(钠)，维生素C按热加工损失
COOKING_EXTRAS = {
    #   (油g, 钠mg, 维C保留率)
    "stir_fry": (18, 700, 0.85),
    "pan_fry":  (14, 650, 0.85),
    "braise":   (13, 800, 0.80),
    "steam":    (4, 350, 0.75),
    "boil":     (2, 300, 0.70),
}

def calc_nutrition(items, method):
    """items: [(food_name, weight_g), ...]"""
    totals = {"kcal":0, "protein":0, "fat":0, "carb":0,
              "sodium":0, "chol":0, "vit_c":0, "calcium":0, "iron":0, "potassium":0}
    total_weight = 0
    valid_names = []
    for name, w in items:
        if name in foods:
            ratio = w / 100.0
            f = foods[name]
            for k in totals:
                totals[k] += f[k] * ratio
            valid_names.append(name)
            total_weight += w
        # 跳过不在31种基础食材里的（如牛奶、西兰花）

    # 烹饪油脂与盐：只增能量/脂肪/钠，维C热损失
    oil_g, salt_mg, vit_c_keep = COOKING_EXTRAS.get(method, (8, 600, 0.85))
    totals["kcal"] += oil_g * 9
    totals["fat"] += oil_g
    totals["sodium"] += salt_mg
    totals["vit_c"] *= vit_c_keep
    return totals, total_weight, valid_names

# 5. 餐次时间
meal_times = {
    "breakfast": (7, 30, 8, 30),
    "lunch": (12, 0, 13, 0),
    "dinner": (18, 0, 19, 30),
}

# 6. 生成 7.20 - 8.11 的数据
print("\n=== 生成新数据 ===")
start_date = datetime(2026, 7, 20)
end_date = datetime(2026, 8, 11)

records_added = 0
current_date = start_date

while current_date <= end_date:
    # 先为当天选好三餐模板，按日总热量校准克重系数，保证全天 2200~2500 kcal
    day_templates = {mt: random.choice(meal_combinations[mt])
                     for mt in ("breakfast", "lunch", "dinner")}
    base_day_kcal = 350  # 三餐烹饪油脂的估算贡献
    for t in day_templates.values():
        for name, w in t["items"]:
            if name in foods:
                base_day_kcal += foods[name]["kcal"] * w / 100.0
    scale = max(1.2, min(2.0, 2350.0 / base_day_kcal)) if base_day_kcal > 0 else 1.5

    for meal_type in ["breakfast", "lunch", "dinner"]:
        template = day_templates[meal_type]
        # 克重 = 模板克重 × 日校准系数 × 每餐 ±8% 随机波动
        jitter = random.uniform(0.92, 1.08)
        items = [(name, int(round(w * scale * jitter))) for name, w in template["items"]]
        method = template["method"]

        nut, total_weight, valid_names = calc_nutrition(items, method)
        if not valid_names:
            continue

        # 烹饪导致水分损失：炒/煎约-5%，蒸约-10%
        cook_loss = {"boil": 0.95, "steam": 0.90, "stir_fry": 0.93, "braise": 0.92, "pan_fry": 0.90}.get(method, 0.95)
        cooked_weight = round(total_weight * cook_loss)

        # 时间
        h1, m1, h2, m2 = meal_times[meal_type]
        hour = random.randint(h1, h2)
        if hour == h2:
            minute = random.randint(m1, m2)
        else:
            minute = random.randint(0, 59)
        ts = current_date.replace(hour=hour, minute=minute, second=random.randint(0, 59))

        # 只用 valid_names + 它们的克重
        ings = valid_names
        weights = [w for n, w in items if n in valid_names]

        cur.execute("""
            INSERT INTO weigh_records_default
            (user_id, ingredients, raw_weights_g, cooking_method,
             cooked_weight_g, cooked_energy_kcal, cooked_protein_g, cooked_fat_g,
             cooked_carbohydrate_g, cooked_sodium_mg, cooked_cholesterol_mg,
             cooked_vitamin_c_mg, cooked_calcium_mg, cooked_iron_mg, cooked_potassium_mg,
             created_at, record_mode)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            20,
            json.dumps(ings, ensure_ascii=False),
            json.dumps(weights),
            method,
            cooked_weight,
            round(nut["kcal"]),
            round(nut["protein"], 1),
            round(nut["fat"], 1),
            round(nut["carb"], 1),
            round(nut["sodium"]),
            round(nut["chol"]),
            round(nut["vit_c"], 1),
            round(nut["calcium"]),
            round(nut["iron"], 1),
            round(nut["potassium"]),
            ts,
            "raw",
        ))
        records_added += 1
    current_date += timedelta(days=1)

conn.commit()
print(f"✅ 生成 {records_added} 条记录（{records_added//3} 天 × 3 餐）")
print(f"📅 日期：{start_date.date()} ~ {end_date.date()}")

# 7. 重新生成 7.20-8.11 的日汇总
print("\n=== 生成日汇总（daily） ===")
cur.execute("""
    SELECT DATE(created_at) as d,
           SUM(cooked_energy_kcal) as kcal,
           SUM(cooked_protein_g) as protein,
           SUM(cooked_fat_g) as fat,
           SUM(cooked_carbohydrate_g) as carb,
           SUM(cooked_sodium_mg) as sodium,
           SUM(cooked_cholesterol_mg) as chol,
           SUM(cooked_vitamin_c_mg) as vit_c,
           SUM(cooked_calcium_mg) as calcium,
           SUM(cooked_iron_mg) as iron,
           SUM(cooked_potassium_mg) as potassium,
           SUM(cooked_weight_g) as total_weight,
           COUNT(*) as meal_count
    FROM weigh_records_default
    WHERE user_id = 20 AND created_at >= '2026-07-20' AND created_at < '2026-08-12'
    GROUP BY DATE(created_at)
    ORDER BY d
""")
daily_count = 0
for row in cur.fetchall():
    d = row[0]
    # 查当天 top 食材（WITH ORDINALITY 按索引配对食材与克重，避免笛卡尔积）
    cur.execute("""
        SELECT ingredient, COUNT(*) as cnt, SUM(weight::numeric) as total_w
        FROM (
            SELECT ing.ingredient, wgt.weight
            FROM weigh_records_default w
            CROSS JOIN LATERAL jsonb_array_elements_text(w.ingredients) WITH ORDINALITY AS ing(ingredient, idx)
            CROSS JOIN LATERAL jsonb_array_elements(w.raw_weights_g) WITH ORDINALITY AS wgt(weight, idx)
            WHERE w.user_id = 20 AND DATE(w.created_at) = %s AND ing.idx = wgt.idx
        ) sub
        GROUP BY ingredient ORDER BY cnt DESC, total_w DESC LIMIT 5
    """, (d,))
    top_foods = []
    for fr in cur.fetchall():
        top_foods.append({"name": fr[0], "name_en": fr[0], "count": int(fr[1]), "total_weight_g": float(fr[2] or 0)})

    insights = {
        "total_meals": int(row[12] or 0),
        "total_fat_g": float(row[3] or 0),
        "total_iron_mg": float(row[9] or 0),
        "top_foods": top_foods,
        "total_protein_g": float(row[2] or 0),
        "total_sodium_mg": float(row[5] or 0),
        "total_calcium_mg": float(row[8] or 0),
        "total_energy_kcal": float(row[1] or 0),
        "total_potassium_mg": float(row[10] or 0),
        "total_vitamin_c_mg": float(row[7] or 0),
        "total_weight_g": float(row[11] or 0),
        "total_carbohydrate_g": float(row[4] or 0),
        "total_cholesterol_mg": float(row[6] or 0),
    }
    cur.execute("""
        INSERT INTO user_analysis_summaries
        (user_id, summary_date, summary_type, source, insights)
        VALUES (%s, %s, %s, 'auto', %s)
        ON CONFLICT (user_id, summary_date, summary_type, source) DO UPDATE
        SET insights = EXCLUDED.insights
    """, (20, d, "daily", json.dumps(insights, ensure_ascii=False)))
    daily_count += 1
conn.commit()
print(f"✅ 生成 {daily_count} 条日汇总")

# 8. 重新生成周汇总（7.13-19, 7.20-26, 7.27-8.2, 8.3-8.9）
print("\n=== 生成周汇总（weekly） ===")
week_ranges = [
    ("2026-07-13", "2026-07-20"),
    ("2026-07-20", "2026-07-27"),
    ("2026-07-27", "2026-08-03"),
    ("2026-08-03", "2026-08-10"),
]
weekly_count = 0
for start, end in week_ranges:
    # 周期最后一整天（周日），与后端 periodEndInclusive 格式对齐
    end_inclusive = (datetime.strptime(end, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    cur.execute("""
        SELECT AVG(daily_kcal), AVG(daily_protein), AVG(daily_fat), AVG(daily_carb),
               SUM(daily_kcal), SUM(daily_protein), SUM(daily_fat), SUM(daily_carb),
               SUM(daily_sodium), SUM(daily_chol), SUM(daily_vit_c), SUM(daily_calcium),
               SUM(daily_iron), SUM(daily_potassium),
               SUM(daily_meals), COUNT(*)
        FROM (
            SELECT DATE(created_at) as d,
                   SUM(cooked_energy_kcal) as daily_kcal,
                   SUM(cooked_protein_g) as daily_protein,
                   SUM(cooked_fat_g) as daily_fat,
                   SUM(cooked_carbohydrate_g) as daily_carb,
                   SUM(cooked_sodium_mg) as daily_sodium,
                   SUM(cooked_cholesterol_mg) as daily_chol,
                   SUM(cooked_vitamin_c_mg) as daily_vit_c,
                   SUM(cooked_calcium_mg) as daily_calcium,
                   SUM(cooked_iron_mg) as daily_iron,
                   SUM(cooked_potassium_mg) as daily_potassium,
                   COUNT(*) as daily_meals
            FROM weigh_records_default
            WHERE user_id = 20 AND created_at >= %s AND created_at < %s
            GROUP BY DATE(created_at)
        ) sub
    """, (start, end))
    r = cur.fetchone()
    if r and r[0]:
        # 查周内 top 食材（WITH ORDINALITY 按索引配对，避免取错克重）
        cur.execute("""
            SELECT ingredient, COUNT(*) as cnt, SUM(weight::numeric) as total_w
            FROM (
                SELECT ing.ingredient, wgt.weight
                FROM weigh_records_default w
                CROSS JOIN LATERAL jsonb_array_elements_text(w.ingredients) WITH ORDINALITY AS ing(ingredient, idx)
                CROSS JOIN LATERAL jsonb_array_elements(w.raw_weights_g) WITH ORDINALITY AS wgt(weight, idx)
                WHERE w.user_id = 20 AND created_at >= %s AND created_at < %s AND ing.idx = wgt.idx
            ) sub
            GROUP BY ingredient ORDER BY cnt DESC, total_w DESC LIMIT 10
        """, (start, end))
        top_foods = [{"name": fr[0], "name_en": fr[0], "count": int(fr[1]), "total_weight_g": float(fr[2] or 0)}
                     for fr in cur.fetchall()]

        insights = {
            "period_start": start,
            "period_end": end_inclusive,
            "total_meals": int(r[14] or 0),
            "avg_daily_energy_kcal": float(r[0]),
            "avg_daily_protein_g": float(r[1]),
            "avg_daily_fat_g": float(r[2]),
            "avg_daily_carbohydrate_g": float(r[3]),
            "total_energy_kcal": float(r[4]),
            "total_protein_g": float(r[5]),
            "total_fat_g": float(r[6]),
            "total_carbohydrate_g": float(r[7]),
            "total_sodium_mg": round(float(r[8] or 0), 2),
            "total_cholesterol_mg": round(float(r[9] or 0), 2),
            "total_vitamin_c_mg": round(float(r[10] or 0), 2),
            "total_calcium_mg": round(float(r[11] or 0), 2),
            "total_iron_mg": round(float(r[12] or 0), 2),
            "total_potassium_mg": round(float(r[13] or 0), 2),
            "top_foods": top_foods,
            "recommendations": ["当前饮食结构较为均衡，请继续保持良好饮食习惯"],
            "days_with_data": int(r[15]),
        }
        cur.execute("""
            INSERT INTO user_analysis_summaries
            (user_id, summary_date, summary_type, source, insights)
            VALUES (%s, %s, 'weekly', 'auto', %s)
            ON CONFLICT (user_id, summary_date, summary_type, source) DO UPDATE
            SET insights = EXCLUDED.insights
        """, (20, datetime.strptime(start, "%Y-%m-%d").date(), json.dumps(insights, ensure_ascii=False)))
        weekly_count += 1
conn.commit()
print(f"✅ 生成 {weekly_count} 条周汇总")

# 9. 重新生成月汇总（7月）
print("\n=== 生成月汇总（monthly） ===")
# 先删除7月旧月报
cur.execute("DELETE FROM user_analysis_summaries WHERE user_id=20 AND summary_type='monthly' AND summary_date='2026-07-01'")
conn.commit()

cur.execute("""
    SELECT SUM(cooked_energy_kcal), SUM(cooked_protein_g), SUM(cooked_fat_g),
           SUM(cooked_carbohydrate_g), SUM(cooked_sodium_mg), SUM(cooked_cholesterol_mg),
           SUM(cooked_vitamin_c_mg), SUM(cooked_calcium_mg), SUM(cooked_iron_mg),
           SUM(cooked_potassium_mg), SUM(cooked_weight_g), COUNT(*),
           COUNT(DISTINCT DATE(created_at))
    FROM weigh_records_default
    WHERE user_id = 20 AND created_at >= '2026-07-01' AND created_at < '2026-08-01'
""")
monthly_count = 0
for row in cur.fetchall():
    m = datetime(2026, 7, 1).date()
    # 查月内 top 食材（WITH ORDINALITY 按索引配对，避免取错克重）
    cur.execute("""
        SELECT ingredient, COUNT(*) as cnt, SUM(weight::numeric) as total_w
        FROM (
            SELECT ing.ingredient, wgt.weight
            FROM weigh_records_default w
            CROSS JOIN LATERAL jsonb_array_elements_text(w.ingredients) WITH ORDINALITY AS ing(ingredient, idx)
            CROSS JOIN LATERAL jsonb_array_elements(w.raw_weights_g) WITH ORDINALITY AS wgt(weight, idx)
            WHERE w.user_id = 20 AND created_at >= '2026-07-01' AND created_at < '2026-08-01' AND ing.idx = wgt.idx
        ) sub
        GROUP BY ingredient ORDER BY cnt DESC, total_w DESC LIMIT 10
    """)
    top_foods = [{"name": fr[0], "name_en": fr[0], "count": int(fr[1]), "total_weight_g": float(fr[2] or 0)}
                 for fr in cur.fetchall()]

    total_meals = int(row[11] or 0)
    days_with_data = int(row[12] or 0)
    total_kcal = float(row[0] or 0)
    total_protein = float(row[1] or 0)
    total_fat = float(row[2] or 0)
    total_carb = float(row[3] or 0)

    insights = {
        "period_start": "2026-07-01",
        "period_end": "2026-07-31",
        "total_meals": total_meals,
        "total_fat_g": total_fat,
        "total_iron_mg": float(row[8] or 0),
        "top_foods": top_foods,
        "recommendations": ["当前饮食结构较为均衡，请继续保持良好饮食习惯"],
        "total_protein_g": total_protein,
        "total_sodium_mg": float(row[4] or 0),
        "total_calcium_mg": float(row[7] or 0),
        "total_energy_kcal": total_kcal,
        "total_potassium_mg": float(row[9] or 0),
        "total_vitamin_c_mg": float(row[6] or 0),
        "total_weight_g": float(row[10] or 0),
        "total_carbohydrate_g": total_carb,
        "total_cholesterol_mg": float(row[5] or 0),
        "avg_daily_energy_kcal": total_kcal / max(days_with_data, 1),
        "avg_daily_protein_g": total_protein / max(days_with_data, 1),
        "avg_daily_fat_g": total_fat / max(days_with_data, 1),
        "avg_daily_carbohydrate_g": total_carb / max(days_with_data, 1),
        "days_with_data": days_with_data,
    }
    cur.execute("""
        INSERT INTO user_analysis_summaries
        (user_id, summary_date, summary_type, source, insights)
        VALUES (%s, %s, 'monthly', 'auto', %s)
        ON CONFLICT (user_id, summary_date, summary_type, source) DO UPDATE
        SET insights = EXCLUDED.insights
    """, (20, m, json.dumps(insights, ensure_ascii=False)))
    monthly_count += 1
conn.commit()
print(f"✅ 生成 {monthly_count} 条月汇总")

# 10. 检查年报（应该不影响）
print("\n=== 年报数据 ===")
cur.execute("SELECT summary_date, summary_type, insights FROM user_analysis_summaries WHERE user_id=20 AND summary_type='yearly'")
yearly = cur.fetchall()
print(f"已有 {len(yearly)} 条年报（不动）")

cur.close()
conn.close()
print("\n🎉 全部完成！")