"""
为用户 13800000007 (user_id=20) 生成 2026-07-20 到 2026-08-11 的完整一日三餐数据
饮食正常（男性 20 岁 65kg，每日约 2000-2200 kcal）
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

# 先清除该用户从 7.20 开始的数据
cur.execute("""
    DELETE FROM weigh_records_default
    WHERE user_id = 20
    AND created_at >= '2026-07-20'
    AND created_at < '2026-08-12'
""")
deleted = cur.rowcount
print(f"清除旧数据 {deleted} 条")

# 餐次模板（按真实一日三餐设计，食材、克重、营养素、烹饪方式齐全）
meals_template = [
    # 早餐 7:30-8:30 （约 450-550 kcal）
    {
        "type": "breakfast",
        "ingredients_list": [
            # 鸡蛋白粥 + 鸡蛋
            {
                "ingredients": ["鸡蛋白粥", "鸡蛋"],
                "weights": [200, 60],
                "cooking_method": "boil",
                "energy": 320, "protein": 16, "fat": 8, "carb": 50,
                "sodium": 380, "chol": 195, "vit_c": 0, "calcium": 60,
                "iron": 1.8, "potassium": 220
            },
            # 包子 + 豆浆
            {
                "ingredients": ["鲜肉包", "豆浆"],
                "weights": [150, 250],
                "cooking_method": "steam",
                "energy": 480, "protein": 22, "fat": 14, "carb": 65,
                "sodium": 520, "chol": 35, "vit_c": 0, "calcium": 95,
                "iron": 2.5, "potassium": 280
            },
            # 全麦面包 + 牛奶 + 鸡蛋
            {
                "ingredients": ["全麦面包", "牛奶", "鸡蛋"],
                "weights": [80, 200, 60],
                "cooking_method": "pan_fry",
                "energy": 520, "protein": 25, "fat": 18, "carb": 60,
                "sodium": 480, "chol": 220, "vit_c": 1, "calcium": 280,
                "iron": 2.2, "potassium": 380
            },
            # 燕麦 + 鸡蛋 + 苹果
            {
                "ingredients": ["燕麦片", "鸡蛋", "苹果"],
                "weights": [60, 50, 180],
                "cooking_method": "boil",
                "energy": 460, "protein": 18, "fat": 11, "carb": 72,
                "sodium": 320, "chol": 185, "vit_c": 6, "calcium": 120,
                "iron": 2.0, "potassium": 320
            },
            # 米粉 + 鸡蛋
            {
                "ingredients": ["米粉", "鸡蛋", "小白菜"],
                "weights": [200, 60, 80],
                "cooking_method": "boil",
                "energy": 440, "protein": 17, "fat": 9, "carb": 75,
                "sodium": 420, "chol": 195, "vit_c": 22, "calcium": 90,
                "iron": 1.8, "potassium": 240
            },
        ]
    },
    # 午餐 12:00-13:00 （约 600-750 kcal）
    {
        "type": "lunch",
        "ingredients_list": [
            # 米饭 + 番茄炒蛋 + 清炒西兰花
            {
                "ingredients": ["米饭", "番茄炒蛋", "清炒西兰花"],
                "weights": [200, 180, 120],
                "cooking_method": "stir_fry",
                "energy": 680, "protein": 24, "fat": 18, "carb": 95,
                "sodium": 720, "chol": 380, "vit_c": 78, "calcium": 120,
                "iron": 3.5, "potassium": 580
            },
            # 米饭 + 红烧鸡腿 + 炒青菜
            {
                "ingredients": ["米饭", "红烧鸡腿", "炒青菜"],
                "weights": [200, 200, 150],
                "cooking_method": "braise",
                "energy": 720, "protein": 32, "fat": 22, "carb": 88,
                "sodium": 850, "chol": 145, "vit_c": 35, "calcium": 95,
                "iron": 3.2, "potassium": 520
            },
            # 米饭 + 宫保鸡丁 + 凉拌黄瓜
            {
                "ingredients": ["米饭", "宫保鸡丁", "凉拌黄瓜"],
                "weights": [200, 220, 100],
                "cooking_method": "stir_fry",
                "energy": 700, "protein": 30, "fat": 25, "carb": 85,
                "sodium": 920, "chol": 155, "vit_c": 12, "calcium": 75,
                "iron": 2.8, "potassium": 480
            },
            # 米饭 + 清蒸鱼 + 炒豆芽
            {
                "ingredients": ["米饭", "清蒸鲈鱼", "炒豆芽"],
                "weights": [200, 200, 100],
                "cooking_method": "steam",
                "energy": 640, "protein": 38, "fat": 12, "carb": 90,
                "sodium": 680, "chol": 165, "vit_c": 8, "calcium": 110,
                "iron": 2.5, "potassium": 620
            },
            # 牛肉面 + 凉拌豆腐
            {
                "ingredients": ["牛肉面", "凉拌豆腐"],
                "weights": [400, 100],
                "cooking_method": "boil",
                "energy": 750, "protein": 35, "fat": 18, "carb": 100,
                "sodium": 1100, "chol": 95, "vit_c": 0, "calcium": 220,
                "iron": 4.5, "potassium": 480
            },
            # 米饭 + 回锅肉 + 炒白菜
            {
                "ingredients": ["米饭", "回锅肉", "炒白菜"],
                "weights": [200, 200, 120],
                "cooking_method": "stir_fry",
                "energy": 730, "protein": 28, "fat": 28, "carb": 88,
                "sodium": 980, "chol": 135, "vit_c": 28, "calcium": 85,
                "iron": 3.0, "potassium": 540
            },
        ]
    },
    # 晚餐 18:00-19:30 （约 500-650 kcal）
    {
        "type": "dinner",
        "ingredients_list": [
            # 米饭 + 炒时蔬 + 蒸蛋
            {
                "ingredients": ["米饭", "炒时蔬", "蒸蛋"],
                "weights": [150, 150, 150],
                "cooking_method": "steam",
                "energy": 520, "protein": 22, "fat": 14, "carb": 75,
                "sodium": 580, "chol": 235, "vit_c": 38, "calcium": 95,
                "iron": 2.8, "potassium": 420
            },
            # 杂粮饭 + 西红柿炖牛腩
            {
                "ingredients": ["杂粮饭", "西红柿炖牛腩"],
                "weights": [150, 250],
                "cooking_method": "braise",
                "energy": 620, "protein": 32, "fat": 16, "carb": 78,
                "sodium": 720, "chol": 115, "vit_c": 25, "calcium": 75,
                "iron": 4.2, "potassium": 680
            },
            # 米饭 + 香菇滑鸡 + 凉拌菠菜
            {
                "ingredients": ["米饭", "香菇滑鸡", "凉拌菠菜"],
                "weights": [150, 200, 120],
                "cooking_method": "stir_fry",
                "energy": 560, "protein": 30, "fat": 14, "carb": 72,
                "sodium": 640, "chol": 165, "vit_c": 22, "calcium": 110,
                "iron": 3.0, "potassium": 580
            },
            # 饺子 + 凉拌木耳
            {
                "ingredients": ["猪肉白菜饺子", "凉拌木耳"],
                "weights": [300, 80],
                "cooking_method": "boil",
                "energy": 640, "protein": 26, "fat": 22, "carb": 78,
                "sodium": 880, "chol": 95, "vit_c": 2, "calcium": 130,
                "iron": 3.5, "potassium": 380
            },
            # 米饭 + 蒜蓉虾 + 凉拌豆角
            {
                "ingredients": ["米饭", "蒜蓉虾", "凉拌豆角"],
                "weights": [150, 180, 120],
                "cooking_method": "stir_fry",
                "energy": 580, "protein": 32, "fat": 12, "carb": 75,
                "sodium": 760, "chol": 285, "vit_c": 18, "calcium": 145,
                "iron": 3.2, "potassium": 520
            },
            # 面条 + 番茄鸡蛋
            {
                "ingredients": ["面条", "番茄鸡蛋"],
                "weights": [200, 200],
                "cooking_method": "stir_fry",
                "energy": 590, "protein": 22, "fat": 15, "carb": 88,
                "sodium": 620, "chol": 295, "vit_c": 18, "calcium": 85,
                "iron": 2.8, "potassium": 480
            },
        ]
    },
]

# 餐次时间
meal_times = {
    "breakfast": (7, 30, 8, 30),
    "lunch": (12, 0, 13, 0),
    "dinner": (18, 0, 19, 30),
}

# 生成日期范围
start_date = datetime(2026, 7, 20)
end_date = datetime(2026, 8, 11)

records_added = 0
current_date = start_date

while current_date <= end_date:
    for meal_info in meals_template:
        # 随机选一餐
        template = random.choice(meal_info["ingredients_list"])

        # 随机分钟偏移
        h1, m1, h2, m2 = meal_times[meal_info["type"]]
        hour = random.randint(h1, h2)
        minute = random.randint(m1, m2) if hour == h2 else random.randint(0, 59)
        ts = current_date.replace(hour=hour, minute=minute, second=random.randint(0, 59))

        # 计算总重量
        total_weight = sum(template["weights"])

        # 写入数据库
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
            json.dumps(template["ingredients"]),
            json.dumps(template["weights"]),
            template["cooking_method"],
            total_weight,
            template["energy"],
            template["protein"],
            template["fat"],
            template["carb"],
            template["sodium"],
            template["chol"],
            template["vit_c"],
            template["calcium"],
            template["iron"],
            template["potassium"],
            ts,
            "raw",
        ))
        records_added += 1

    current_date += timedelta(days=1)

conn.commit()
print(f"✅ 成功生成 {records_added} 条记录")
print(f"📅 日期范围: {start_date.date()} ~ {end_date.date()}")

cur.close()
conn.close()