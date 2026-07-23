#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
直接生成30条烹饪营养数据
基于营养学知识，不依赖AI API
"""

import json
import random

# ==================== 配置 ====================
INPUT_FILE = "final.json"
OUTPUT_FILE = "cooking_data_30.json"

# ==================== 食材分类 ====================
MEAT = ["beef", "chicken", "pork", "fish", "shrimp", "egg"]
VEGETABLE = ["cabbage", "carrot", "cauliflower", "bell_pepper", "cucumber", 
             "eggplant", "garlic", "onion", "small_pepper", "tomato", "potato"]
OTHER = ["pepper", "ginger", "tofu"]
FRUIT = ["apple", "banana", "grape", "kiwi", "kumquat", "lemon", "orange", 
         "peach", "pineapple", "strawberry", "watermelon"]

# ==================== 烹饪方式 ====================
COOKING_METHODS = ["stir_fry", "steam", "braise", "deep_fry", "boil", "roast", "pan_fry"]

# ==================== 烹饪系数（基于营养学知识）====================
# 系数说明：应用于生食材营养成分，得到成品每100g的营养
COOKING_FACTORS = {
    "stir_fry": {
        "weight_change": (-0.15, -0.05),  # 失水5-15%
        "calories": (1.05, 1.20),          # 加少量油，热量增5-20%
        "protein": (1.10, 1.25),          # 蛋白质浓缩
        "fat": (1.3, 2.0),               # 吸油30-100%
        "carb": (0.95, 1.05),
        "fiber": (0.95, 1.05),
        "sodium": (2.0, 4.0),            # 加盐
        "cholesterol": (0.95, 1.05),
        "vitamin_c": (0.30, 0.60),       # VC损失40-70%
        "calcium": (0.95, 1.05),
        "iron": (0.95, 1.05),
        "potassium": (0.80, 0.95)        # 流失
    },
    "steam": {
        "weight_change": (-0.05, 0.05),  # 可能略吸水
        "calories": (0.90, 1.05),
        "protein": (1.0, 1.15),
        "fat": (0.95, 1.05),
        "carb": (0.95, 1.05),
        "fiber": (0.95, 1.05),
        "sodium": (0.95, 1.10),
        "cholesterol": (0.95, 1.05),
        "vitamin_c": (0.50, 0.70),       # VC保留50-70%
        "calcium": (0.95, 1.05),
        "iron": (0.95, 1.05),
        "potassium": (0.90, 1.0)
    },
    "braise": {
        "weight_change": (-0.10, 0.00),  # 略失水
        "calories": (1.25, 1.60),        # 加糖油，热量增25-60%
        "protein": (1.15, 1.35),
        "fat": (1.5, 2.5),              # 加食用油
        "carb": (1.3, 1.8),              # 加糖
        "fiber": (0.90, 1.10),
        "sodium": (4.0, 8.0),            # 酱油含盐高
        "cholesterol": (0.95, 1.05),
        "vitamin_c": (0.20, 0.50),       # VC损失50-80%
        "calcium": (1.0, 1.2),            # 酱油含钙
        "iron": (1.0, 1.2),
        "potassium": (0.85, 1.0)
    },
    "deep_fry": {
        "weight_change": (0.05, 0.25),   # 吸油增重5-25%
        "calories": (1.5, 2.5),          # 热量大幅上升
        "protein": (1.20, 1.50),
        "fat": (3.0, 6.0),              # 大量吸油
        "carb": (1.1, 1.3),              # 裹粉
        "fiber": (0.80, 1.0),
        "sodium": (1.5, 3.0),            # 加盐或裹粉含盐
        "cholesterol": (0.95, 1.05),
        "vitamin_c": (0.05, 0.30),       # VC大量损失70-95%
        "calcium": (0.80, 1.10),
        "iron": (0.80, 1.10),
        "potassium": (0.70, 0.90)
    },
    "boil": {
        "weight_change": (-0.20, -0.05),  # 失水5-20%
        "calories": (0.85, 1.05),         # 可能略增（水煮不加东西）
        "protein": (1.05, 1.20),
        "fat": (0.80, 1.0),              # 脂肪可能溶出
        "carb": (0.90, 1.05),
        "fiber": (0.90, 1.05),
        "sodium": (1.2, 2.5),            # 加盐或水中有盐
        "cholesterol": (0.90, 1.0),       # 胆固醇可能溶出
        "vitamin_c": (0.30, 0.60),       # VC溶水损失40-70%
        "calcium": (0.90, 1.05),
        "iron": (0.90, 1.05),
        "potassium": (0.70, 0.90)        # 钾溶水流失
    },
    "roast": {
        "weight_change": (-0.30, -0.10),  # 失水10-30%
        "calories": (1.15, 1.40),         # 失水浓缩，热量升15-40%
        "protein": (1.20, 1.50),         # 蛋白质浓缩
        "fat": (0.90, 1.10),             # 脂肪可能流出
        "carb": (1.10, 1.30),
        "fiber": (1.05, 1.20),
        "sodium": (1.5, 3.0),            # 加盐/腌料
        "cholesterol": (0.95, 1.05),
        "vitamin_c": (0.40, 0.70),       # VC损失30-60%
        "calcium": (1.0, 1.15),
        "iron": (1.0, 1.15),
        "potassium": (0.85, 1.0)
    },
    "pan_fry": {
        "weight_change": (-0.15, 0.00),  # 失水或不增不减
        "calories": (1.10, 1.35),         # 吸油10-35%
        "protein": (1.10, 1.30),
        "fat": (1.5, 2.5),              # 吸油50-150%
        "carb": (0.95, 1.10),
        "fiber": (0.95, 1.10),
        "sodium": (1.5, 3.0),            # 加盐
        "cholesterol": (0.95, 1.05),
        "vitamin_c": (0.35, 0.65),       # VC损失35-65%
        "calcium": (0.95, 1.10),
        "iron": (0.95, 1.10),
        "potassium": (0.80, 0.95)
    }
}

# ==================== 加载数据 ====================
def load_ingredient_data():
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data.get('items', {})

# ==================== 生成食材组合 ====================
def generate_ingredient_combo():
    """生成1-5个食材组合"""
    n = random.randint(1, 5)
    # 偏向2-3个食材
    if n > 3 and random.random() < 0.6:
        n = random.randint(2, 3)
    
    combo = []
    category = random.choice(['meat', 'vegetable', 'fruit', 'mixed'])
    
    if category == 'meat' and random.random() < 0.7:
        combo.append(random.choice(MEAT))
        for _ in range(n - 1):
            combo.append(random.choice(VEGETABLE + OTHER))
    elif category == 'vegetable' and random.random() < 0.7:
        combo.append(random.choice(VEGETABLE))
        for _ in range(n - 1):
            combo.append(random.choice(VEGETABLE + OTHER))
    else:
        all_items = MEAT + VEGETABLE + OTHER + FRUIT
        combo = random.sample(all_items, min(n, len(all_items)))
    
    return list(set(combo))[:n]  # 去重

# ==================== 生成重量 ====================
def generate_weights(ingredients):
    weights = []
    for ing in ingredients:
        if ing in MEAT:
            w = random.randint(80, 350)
        elif ing in VEGETABLE:
            w = random.randint(50, 300)
        elif ing in FRUIT:
            w = random.randint(80, 250)
        else:
            w = random.randint(10, 100)
        weights.append(w)
    return weights

# ==================== 计算营养成分 ====================
def calculate_nutrition(ingredient_data, ingredients, weights, cooking_method):
    """基于生食材数据计算烹饪后营养"""
    
    # 获取该烹饪方式的系数范围
    factors = COOKING_FACTORS[cooking_method]
    
    # 计算生食材总营养（按重量加权）
    total_raw_weight = sum(weights)
    raw_nutrition = {
        'calories': 0,
        'protein': 0,
        'fat': 0,
        'carb': 0,
        'fiber': 0,
        'sodium': 0,
        'cholesterol': 0,
        'vitamin_c': 0,
        'calcium': 0,
        'iron': 0,
        'potassium': 0
    }
    
    for ing, w in zip(ingredients, weights):
        d = ingredient_data.get(ing, {})
        ratio = w / 100.0  # 每100g的营养 × 重量/100
        raw_nutrition['calories'] += d.get('energy_kcal', 0) * ratio
        raw_nutrition['protein'] += d.get('protein_g', 0) * ratio
        raw_nutrition['fat'] += d.get('fat_g', 0) * ratio
        raw_nutrition['carb'] += d.get('carbohydrate_g', 0) * ratio
        raw_nutrition['fiber'] += d.get('dietary_fiber_g', 0) * ratio
        raw_nutrition['sodium'] += d.get('sodium_mg', 0) * ratio
        raw_nutrition['cholesterol'] += d.get('cholesterol_mg', 0) * ratio
        raw_nutrition['vitamin_c'] += d.get('vitamin_c_mg', 0) * ratio
        raw_nutrition['calcium'] += d.get('calcium_mg', 0) * ratio if 'calcium_mg' in d else d.get('calcium_mg', 0) * ratio
        raw_nutrition['iron'] += d.get('iron_mg', 0) * ratio if 'iron_mg' in d else d.get('iron_g', 0) * 1000 * ratio
        raw_nutrition['potassium'] += d.get('potassium_mg', 0) * ratio if 'potassium_mg' in d else d.get('potassium_g', 0) * 1000 * ratio
    
    # 计算成品重量
    weight_change = random.uniform(*factors['weight_change'])
    cooked_weight = total_raw_weight * (1 + weight_change)
    cooked_weight = max(10, cooked_weight)  # 至少10g
    
    # 计算成品每100g的营养
    # 先算出总营养，再除以成品重量 × 100
    total_cooked = {}
    for nutrient in raw_nutrition:
        if nutrient in factors:
            factor = random.uniform(*factors[nutrient])
        else:
            factor = 1.0
        total_cooked[nutrient] = raw_nutrition[nutrient] * factor
    
    # 转换为每100g
    per_100g = {}
    for nutrient in total_cooked:
        per_100g[nutrient] = total_cooked[nutrient] / cooked_weight * 100
    
    return cooked_weight, per_100g

# ==================== 主函数 ====================
def main():
    print("加载食材数据...")
    ingredient_data = load_ingredient_data()
    print(f"共 {len(ingredient_data)} 个食材\n")
    
    records = []
    
    for i in range(30):
        # 生成组合
        ingredients = generate_ingredient_combo()
        weights = generate_weights(ingredients)
        method = random.choice(COOKING_METHODS)
        
        # 计算营养
        cooked_weight, nutrition = calculate_nutrition(
            ingredient_data, ingredients, weights, method
        )
        
        # 构建记录
        record = {
            "ingredients": ingredients,
            "weights": weights,
            "cooking_method": method,
            "cooked_weight_g": round(cooked_weight, 1),
            "cooked_calories": round(nutrition['calories'], 1),
            "cooked_protein": round(nutrition['protein'], 1),
            "cooked_fat": round(nutrition['fat'], 1),
            "cooked_carb": round(nutrition['carb'], 1),
            "cooked_fiber": round(nutrition['fiber'], 1),
            "cooked_sodium": round(nutrition['sodium'], 1),
            "cooked_cholesterol": round(nutrition['cholesterol'], 1),
            "cooked_vitamin_c": round(nutrition['vitamin_c'], 1),
            "cooked_calcium": round(nutrition['calcium'], 1),
            "cooked_iron": round(nutrition['iron'], 1),
            "cooked_potassium": round(nutrition['potassium'], 1)
        }
        
        records.append(record)
        
        # 打印进度
        ing_str = " + ".join([f"{w}g {ing}" for ing, w in zip(ingredients, weights)])
        print(f"[{i+1}/30] {ing_str} -> {method}")
    
    # 保存
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    
    print(f"\n完成！保存到: {OUTPUT_FILE}")
    print(f"共 {len(records)} 条记录\n")
    
    # 显示前3条
    for r in records[:3]:
        print(json.dumps(r, ensure_ascii=False, indent=2))
        print()

if __name__ == "__main__":
    main()
