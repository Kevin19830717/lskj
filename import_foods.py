#!/usr/bin/env python3
"""导入 final.json 食物营养数据到 PostgreSQL"""
import json
import asyncio
import asyncpg

DB_URL = "postgresql://postgres:321738392@localhost:5432/smart_scale"
JSON_PATH = "/home/ubuntu/lskj/final.json"

CATEGORY_MAP = {
    "apple": "水果", "banana": "水果", "grape": "水果", "kiwi": "水果",
    "kumquat": "水果", "lemon": "水果", "orange": "水果", "peach": "水果",
    "pineapple": "水果", "strawberry": "水果", "watermelon": "水果",
    "beef": "肉类", "chicken": "肉类", "pork": "肉类", "fish": "肉类", "shrimp": "肉类",
    "egg": "蛋类", "tofu": "豆制品",
    "cabbage": "蔬菜", "carrot": "蔬菜", "cauliflower": "蔬菜",
    "cucumber": "蔬菜", "eggplant": "蔬菜", "garlic": "蔬菜",
    "ginger": "蔬菜", "onion": "蔬菜", "potato": "蔬菜",
    "tomato": "蔬菜", "bell_pepper": "蔬菜", "small_pepper": "蔬菜",
    "pepper": "调味品",
}


def infer_category(name_en):
    return CATEGORY_MAP.get(name_en, "其他")


async def import_foods():
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    items = data.get("items", {})
    print(f"共读取 {len(items)} 种食物数据")

    conn = await asyncpg.connect(DB_URL)

    # 先清空旧数据（可选）
    await conn.execute("DELETE FROM foods")
    print("已清空 foods 表旧数据")

    inserted = 0
    for name_en, info in items.items():
        name = info.get("zh_name", name_en)
        category = infer_category(name_en)

        await conn.execute(
            """
            INSERT INTO foods (name, name_en, category, edible_ratio, energy_kcal,
                protein_g, fat_g, carbohydrate_g, sodium_mg, cholesterol_mg,
                vitamin_c_mg, calcium_mg, iron_mg, potassium_mg)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            """,
            name,
            name_en,
            category,
            float(info.get("edible_ratio", 1.0)),
            float(info.get("energy_kcal", 0)),
            float(info.get("protein_g", 0)),
            float(info.get("fat_g", 0)),
            float(info.get("carbohydrate_g", 0)),
            float(info.get("sodium_mg", 0)),
            float(info.get("cholesterol_mg", 0)),
            float(info.get("vitamin_c_mg", 0)),
            float(info.get("calcium_mg", 0)),
            float(info.get("iron_mg", 0)),
            float(info.get("potassium_mg", 0)),
        )
        inserted += 1

    await conn.close()
    print(f"成功导入 {inserted} 条食物数据到数据库！")


if __name__ == "__main__":
    asyncio.run(import_foods())
