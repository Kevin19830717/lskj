#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
烹饪营养数据生成器（修正版）
基于严格的营养学系数表，确保数据合理
"""

import json
import random
import math

# ==================== 配置 ====================
INPUT_FILE = "final.json"
OUTPUT_FILE = "cooking_data_corrected.json"
TOTAL_TARGET = 500

# ==================== 食材分类 ====================
MEAT = ["beef", "chicken", "pork", "fish", "shrimp", "egg"]
VEGETABLE = ["cabbage", "carrot", "cauliflower", "bell_pepper", "cucumber",
             "eggplant", "garlic", "onion", "small_pepper", "tomato", "potato"]
FRUIT = ["apple", "banana", "grape", "kiwi", "kumquat", "lemon", "orange",
         "peach", "pineapple", "strawberry", "watermelon"]
OTHER = ["pepper", "ginger", "tofu"]

# ==================== 合理食材组合规则 ====================
# 水果只适合：生食、蒸（少量）、烤（甜品）
FRUIT_ALLOWED_METHODS = ["steam", "roast"]  # 水果不油炸/爆炒/红烧
MEAT_VEG_METHODS = ["stir_fry", "steam", "braise", "deep_fry", "boil", "roast", "pan_fry"]

# ==================== 烹饪系数表（严格值，非范围）====================
# 基于营养学研究：每100g成品 = 生食材每100g营养 × 系数
# 系数 < 1 表示减少，> 1 表示增加
COOKING_FACTORS = {
    "stir_fry": {
        # 高温快炒：失水10-20%，加少量油(5-15g/100g食材)
        "weight_retention": 0.85,    # 生重100g → 熟重85g
        "calories_factor": 1.12,      # 加少量油，热量增12%
        "protein_factor": 1.18,       # 失水浓缩
        "fat_factor": 1.8,            # 吸油（原本低脂食材吸油更多）
        "carb_factor": 1.0,
        "fiber_factor": 1.05,
        "sodium_factor": 2.5,         # 加盐(2-3g/100g食材)
        "cholesterol_factor": 1.0,
        "vitamin_c_factor": 0.45,     # 损失55%
        "calcium_factor": 1.05,
        "iron_factor": 1.05,
        "potassium_factor": 0.88       # 流失12%
    },
    "steam": {
        # 清蒸：基本不失水，可能略吸水
        "weight_retention": 0.98,
        "calories_factor": 0.98,
        "protein_factor": 1.02,
        "fat_factor": 0.98,
        "carb_factor": 0.98,
        "fiber_factor": 0.98,
        "sodium_factor": 1.05,        # 少量盐
        "cholesterol_factor": 1.0,
        "vitamin_c_factor": 0.60,      # 保留60%
        "calcium_factor": 0.98,
        "iron_factor": 0.98,
        "potassium_factor": 0.95
    },
    "braise": {
        # 红烧：加糖(5-10g/100g)、酱油(10-15g/100g)、油(10g/100g)
        "weight_retention": 0.90,
        "calories_factor": 1.35,      # 糖油导致热量增35%
        "protein_factor": 1.12,
        "fat_factor": 2.0,            # 加食用油
        "carb_factor": 1.4,           # 加糖
        "fiber_factor": 0.95,
        "sodium_factor": 5.0,         # 酱油钠含量极高
        "cholesterol_factor": 1.0,
        "vitamin_c_factor": 0.35,      # 损失65%
        "calcium_factor": 1.1,          # 酱油含钙
        "iron_factor": 1.1,
        "potassium_factor": 0.92
    },
    "deep_fry": {
        # 油炸：大量吸油(15-40g/100g食材)，重量的变化取决于食材
        "weight_retention": 1.15,     # 吸油增重15%
        "calories_factor": 2.0,       # 热量翻倍
        "protein_factor": 1.25,
        "fat_factor": 5.0,            # 大量吸油
        "carb_factor": 1.2,           # 裹粉
        "fiber_factor": 0.85,
        "sodium_factor": 2.0,         # 裹粉含盐
        "cholesterol_factor": 1.0,
        "vitamin_c_factor": 0.15,      # 几乎损失殆尽
        "calcium_factor": 0.9,
        "iron_factor": 0.9,
        "potassium_factor": 0.78
    },
    "boil": {
        # 水煮：水溶性物质流失
        "weight_retention": 0.92,
        "calories_factor": 0.95,      # 可能略降低
        "protein_factor": 1.08,
        "fat_factor": 0.85,           # 脂肪溶出
        "carb_factor": 0.92,
        "fiber_factor": 0.95,
        "sodium_factor": 1.8,          # 加盐或水中已有盐
        "cholesterol_factor": 0.9,     # 胆固醇溶出
        "vitamin_c_factor": 0.40,      # 溶水损失60%
        "calcium_factor": 0.92,
        "iron_factor": 0.92,
        "potassium_factor": 0.75        # 钾大量溶出
    },
    "roast": {
        # 烤：失水明显，浓缩效应
        "weight_retention": 0.80,      # 失水20%
        "calories_factor": 1.25,       # 浓缩导致热量升25%
        "protein_factor": 1.35,       # 蛋白质浓缩
        "fat_factor": 0.95,           # 脂肪可能流出
        "carb_factor": 1.15,
        "fiber_factor": 1.1,
        "sodium_factor": 2.0,          # 腌料含钠
        "cholesterol_factor": 1.0,
        "vitamin_c_factor": 0.55,      # 损失45%
        "calcium_factor": 1.1,
        "iron_factor": 1.1,
        "potassium_factor": 0.88
    },
    "pan_fry": {
        # 煎：一面接触油，吸油10-20g/100g
        "weight_retention": 0.88,
        "calories_factor": 1.22,       # 加煎油
        "protein_factor": 1.15,
        "fat_factor": 2.2,            # 吸油
        "carb_factor": 0.98,
        "fiber_factor": 1.0,
        "sodium_factor": 2.2,          # 加盐
        "cholesterol_factor": 1.0,
        "vitamin_c_factor": 0.50,      # 损失50%
        "calcium_factor": 1.0,
        "iron_factor": 1.0,
        "potassium_factor": 0.86
    }
}

# ==================== 加载数据 ====================
def load_ingredient_data():
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data.get('items', {})

# ==================== 生成合理食材组合 ====================
def generate_valid_combo():
    """生成符合常识的食材组合"""
    # 决定组合类型
    combo_type = random.choice([
        'meat_veg',      # 肉类+蔬菜（最常见）
        'meat_veg',
        'meat_veg',      # 权重更高
        'veg_only',      # 纯蔬菜
        'meat_only',      # 纯肉类
        'tofu_veg',     # 豆腐+蔬菜
        'egg_veg'       # 鸡蛋+蔬菜
    ])
    
    if combo_type == 'meat_veg':
        n = random.randint(2, 4)
        meat = random.choice(MEAT)
        vegs = random.sample(VEGETABLE, min(n-1, 3))
        combo = [meat] + vegs
    elif combo_type == 'veg_only':
        n = random.randint(2, 4)
        combo = random.sample(VEGETABLE, n)
    elif combo_type == 'meat_only':
        combo = [random.choice(MEAT)]
    elif combo_type == 'tofu_veg':
        n = random.randint(2, 3)
        vegs = random.sample(VEGETABLE, n-1)
        combo = ['tofu'] + vegs
    elif combo_type == 'egg_veg':
        n = random.randint(2, 3)
        vegs = random.sample(VEGETABLE, n-1)
        combo = ['egg'] + vegs
    else:
        # 默认：肉类+蔬菜
        meat = random.choice(MEAT)
        veg = random.choice(VEGETABLE)
        combo = [meat, veg]
    
    return list(set(combo))  # 去重

def generate_weights(ingredients):
    """生成合理重量"""
    weights = []
    for ing in ingredients:
        if ing in MEAT:
            # 肉类：100-350g（一人份或多人份）
            w = random.randint(100, 350)
        elif ing in VEGETABLE:
            # 蔬菜：80-300g
            w = random.randint(80, 300)
        elif ing in FRUIT:
            w = random.randint(100, 250)
        elif ing == 'tofu':
            w = random.randint(100, 250)
        elif ing == 'egg':
            # 鸡蛋按个算，1个约50g
            n_eggs = random.randint(2, 6)
            w = n_eggs * 50
        else:
            w = random.randint(20, 100)
        weights.append(w)
    return weights

def choose_cooking_method(ingredients):
    """根据食材选择合适的烹饪方式"""
    has_fruit = any(ing in FRUIT for ing in ingredients)
    
    if has_fruit:
        # 水果只允许蒸或烤
        return random.choice(["steam", "roast"])
    else:
        return random.choice(MEAT_VEG_METHODS)

# ==================== 计算营养 ====================
def calculate(ingredient_data, ingredients, weights, method):
    """基于系数表计算烹饪后营养"""
    factors = COOKING_FACTORS[method]
    
    # 1. 计算生食材总营养
    total_raw = {
        'energy_kcal': 0,
        'protein_g': 0,
        'fat_g': 0,
        'carbohydrate_g': 0,
        'dietary_fiber_g': 0,
        'sodium_mg': 0,
        'cholesterol_mg': 0,
        'vitamin_c_mg': 0,
        'calcium_mg': 0,
        'iron_mg': 0,
        'potassium_mg': 0
    }
    
    for ing, w in zip(ingredients, weights):
        d = ingredient_data.get(ing, {})
        ratio = w / 100.0
        for key in total_raw:
            raw_key = key  # 如 'energy_kcal' 对应数据中的 'energy_kcal'
            if raw_key in d:
                total_raw[key] += d[raw_key] * ratio
            # 处理字段名差异
            elif key == 'protein_g' and 'protein_g' in d:
                total_raw[key] += d['protein_g'] * ratio
            elif key == 'fat_g' and 'fat_g' in d:
                total_raw[key] += d['fat_g'] * ratio
            elif key == 'carbohydrate_g' and 'carbohydrate_g' in d:
                total_raw[key] += d['carbohydrate_g'] * ratio
            elif key == 'dietary_fiber_g' and 'dietary_fiber_g' in d:
                total_raw[key] += d['dietary_fiber_g'] * ratio
            elif key == 'sodium_mg':
                # 数据中可能是钠 mg 或 g
                sodium = d.get('sodium_mg', 0)
                if sodium == 0:
                    sodium = d.get('sodium_g', 0) * 1000
                total_raw[key] += sodium * ratio
            elif key == 'cholesterol_mg':
                cholesterol = d.get('cholesterol_mg', 0)
                total_raw[key] += cholesterol * ratio
            elif key == 'vitamin_c_mg':
                vc = d.get('vitamin_c_mg', 0)
                total_raw[key] += vc * ratio
            elif key == 'calcium_mg':
                ca = d.get('calcium_mg', 0)
                if ca == 0:
                    ca = d.get('calcium_g', 0) * 1000
                total_raw[key] += ca * ratio
            elif key == 'iron_mg':
                iron = d.get('iron_mg', 0)
                if iron == 0:
                    iron = d.get('iron_g', 0) * 1000
                total_raw[key] += iron * ratio
            elif key == 'potassium_mg':
                k = d.get('potassium_mg', 0)
                if k == 0:
                    k = d.get('potassium_g', 0) * 1000
                total_raw[key] += k * ratio
    
    # 2. 计算成品重量
    total_raw_weight = sum(weights)
    cooked_weight = total_raw_weight * factors['weight_retention']
    cooked_weight = max(20, cooked_weight)  # 至少20g
    
    # 3. 应用系数，计算成品总营养
    # 注意：系数应用于"每100g生食材营养"，然后按成品重量缩放
    total_cooked = {}
    factor_map = {
        'energy_kcal': 'calories_factor',
        'protein_g': 'protein_factor',
        'fat_g': 'fat_factor',
        'carbohydrate_g': 'carb_factor',
        'dietary_fiber_g': 'fiber_factor',
        'sodium_mg': 'sodium_factor',
        'cholesterol_mg': 'cholesterol_factor',
        'vitamin_c_mg': 'vitamin_c_factor',
        'calcium_mg': 'calcium_factor',
        'iron_mg': 'iron_factor',
        'potassium_mg': 'potassium_factor'
    }
    
    for raw_key, factor_key in factor_map.items():
        factor = factors[factor_key]
        # 成品总营养 = 生总营养 × 系数
        total_cooked[raw_key] = total_raw[raw_key] * factor
    
    # 4. 转换为每100g成品的营养
    per_100g = {}
    for key in total_cooked:
        per_100g[key] = total_cooked[key] / cooked_weight * 100
    
    return cooked_weight, per_100g

# ==================== 主函数 ====================
def main():
    print("=" * 50)
    print("烹饪营养数据生成器（修正版）")
    print("=" * 50)
    
    ingredient_data = load_ingredient_data()
    print(f"加载 {len(ingredient_data)} 个食材\n")
    
    records = []
    attempts = 0
    max_attempts = TOTAL_TARGET * 2
    
    while len(records) < TOTAL_TARGET and attempts < max_attempts:
        attempts += 1
        
        # 生成组合
        ingredients = generate_valid_combo()
        weights = generate_weights(ingredients)
        method = choose_cooking_method(ingredients)
        
        # 计算营养
        cooked_weight, nutrition = calculate(
            ingredient_data, ingredients, weights, method
        )
        
        # 合理性校验
        total_raw_weight = sum(weights)
        
        # 校验1: 油炸/煎炒后热量必须高于生食材
        raw_calories_per_100g = sum(
            ingredient_data.get(ing, {}).get('energy_kcal', 0) * w / total_raw_weight
            for ing, w in zip(ingredients, weights)
        )
        cooked_calories = nutrition['energy_kcal']
        
        # 油炸后热量应 > 生热量
        if method in ['deep_fry', 'pan_fry', 'stir_fry']:
            if cooked_calories < raw_calories_per_100g * 1.05:
                continue  # 丢弃这条
        
        # 校验2: 水煮/蒸后重量不应大幅增加
        if method in ['boil', 'steam']:
            if cooked_weight > total_raw_weight * 1.05:
                continue
        
        # 校验3: 油炸后VC应极低（< 5mg/100g）
        if method == 'deep_fry' and nutrition['vitamin_c_mg'] > 10:
            continue
        
        # 构建记录
        record = {
            "ingredients": ingredients,
            "weights": weights,
            "cooking_method": method,
            "cooked_weight_g": round(cooked_weight, 1),
            "cooked_calories": round(nutrition['energy_kcal'], 1),
            "cooked_protein": round(nutrition['protein_g'], 1),
            "cooked_fat": round(nutrition['fat_g'], 1),
            "cooked_carb": round(nutrition['carbohydrate_g'], 1),
            "cooked_fiber": round(nutrition.get('dietary_fiber_g', 0), 1),
            "cooked_sodium": round(nutrition['sodium_mg'], 1),
            "cooked_cholesterol": round(nutrition['cholesterol_mg'], 1),
            "cooked_vitamin_c": round(nutrition['vitamin_c_mg'], 1),
            "cooked_calcium": round(nutrition['calcium_mg'], 1),
            "cooked_iron": round(nutrition['iron_mg'], 1),
            "cooked_potassium": round(nutrition['potassium_mg'], 1)
        }
        
        records.append(record)
        
        if len(records) % 50 == 0:
            print(f"  已生成 {len(records)}/{TOTAL_TARGET}")
    
    # 保存
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    
    print(f"\n完成！共 {len(records)} 条")
    print(f"保存到: {OUTPUT_FILE}\n")
    
    # 显示示例
    print("=" * 50)
    print("示例数据：\n")
    for r in records[:5]:
        print(json.dumps(r, ensure_ascii=False, indent=2))
        print()

if __name__ == "__main__":
    main()
