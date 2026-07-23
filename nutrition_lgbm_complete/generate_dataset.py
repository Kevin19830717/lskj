#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成用于训练LightGBM回归模型的数据集。
基于食材营养数据库和烹饪方式影响系数表，生成烹饪前后的营养数据。

使用方法:
    python generate_dataset.py -o dataset.csv -n 20000 -s 42
    python generate_dataset.py -o dataset.json -n 10000  # 也支持JSON输出
"""

import json
import random
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import pandas as pd


# ========== 常量定义 ==========

# 支持的烹饪方式
COOKING_METHODS = ['steam', 'boil', 'stir_fry', 'pan_fry', 'deep_fry', 'braise', 'roast']

# 烹饪方式系数表（基准值）
# 每100g生食材转换为每100g成品的乘数
COOKING_COEFFICIENTS_BASE = {
    'steam': {
        'weight': 0.95,
        'calories': 1.00,
        'protein': 0.95,
        'fat': 1.00,
        'carb': 0.98,
        'fiber': 1.00,
        'sodium': 1.00,
        'cholesterol': 1.00,
        'vitamin_c': 0.50,
        'calcium': 0.95,
        'iron': 0.95,
        'potassium': 0.90
    },
    'boil': {
        'weight': 1.10,
        'calories': 0.98,
        'protein': 0.90,
        'fat': 0.98,
        'carb': 0.95,
        'fiber': 0.90,
        'sodium': 0.80,
        'cholesterol': 1.00,
        'vitamin_c': 0.40,
        'calcium': 0.85,
        'iron': 0.85,
        'potassium': 0.70
    },
    'stir_fry': {
        'weight': 0.85,
        'calories': 1.20,
        'protein': 0.92,
        'fat': 1.30,
        'carb': 0.90,
        'fiber': 1.00,
        'sodium': 1.30,
        'cholesterol': 1.00,
        'vitamin_c': 0.35,
        'calcium': 0.90,
        'iron': 0.90,
        'potassium': 0.80
    },
    'pan_fry': {
        'weight': 0.80,
        'calories': 1.25,
        'protein': 0.92,
        'fat': 1.40,
        'carb': 0.88,
        'fiber': 1.00,
        'sodium': 1.20,
        'cholesterol': 1.00,
        'vitamin_c': 0.30,
        'calcium': 0.90,
        'iron': 0.90,
        'potassium': 0.80
    },
    'deep_fry': {
        'weight': 0.70,
        'calories': 1.60,
        'protein': 0.90,
        'fat': 2.00,
        'carb': 0.85,
        'fiber': 1.00,
        'sodium': 1.10,
        'cholesterol': 1.00,
        'vitamin_c': 0.15,
        'calcium': 0.90,
        'iron': 0.90,
        'potassium': 0.75
    },
    'braise': {
        'weight': 0.85,
        'calories': 1.35,
        'protein': 0.90,
        'fat': 1.20,
        'carb': 0.95,
        'fiber': 1.00,
        'sodium': 2.00,
        'cholesterol': 1.00,
        'vitamin_c': 0.30,
        'calcium': 0.90,
        'iron': 0.90,
        'potassium': 0.80
    },
    'roast': {
        'weight': 0.75,
        'calories': 1.10,
        'protein': 0.92,
        'fat': 1.05,
        'carb': 0.85,
        'fiber': 1.00,
        'sodium': 1.05,
        'cholesterol': 1.00,
        'vitamin_c': 0.25,
        'calcium': 0.92,
        'iron': 0.92,
        'potassium': 0.85
    }
}

# 随机误差范围（均匀分布）
# 格式: {营养字段: (最小值, 最大值)}
ERROR_RANGES = {
    'weight': (0.95, 1.05),
    'calories': (0.95, 1.05),
    'protein': (0.95, 1.05),
    'fat': (0.95, 1.05),
    'carb': (0.95, 1.05),
    'fiber': (0.95, 1.05),
    'sodium': (0.80, 1.20),
    'cholesterol': (1.00, 1.00),  # 不添加误差
    'vitamin_c': (0.90, 1.10),
    'calcium': (0.95, 1.05),
    'iron': (0.95, 1.05),
    'potassium': (0.95, 1.05)
}

# 边界保护规则
# 格式: {营养字段: (最小倍数, 最大倍数)}，基于生食材总值
BOUNDARY_RULES = {
    'calories': (0.7, 2.5),   # 成品热量范围：生食材热量的 0.7~2.5 倍
    'fat': (0.5, 3.0),        # 成品脂肪范围：生食材脂肪的 0.5~3.0 倍
    'weight': (0.5, 1.3)      # 成品重量范围：生食材总重的 0.5~1.3 倍
}


def load_nutrition_db(filepath: str) -> Dict:
    """
    加载食材营养数据库
    
    Args:
        filepath: JSON文件路径
    
    Returns:
        营养数据库字典，格式为 {食材英文名: {营养字段: 值}}
        只返回 'items' 部分的数据
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 支持两种格式：
    # 1. {"items": {食材数据}} - 有外层包装
    # 2. {食材数据} - 直接是食材数据
    if 'items' in data:
        return data['items']
    else:
        return data


def get_nutrition_value(ingredient_data: Dict, nutrient_key: str) -> float:
    """
    从食材数据中提取特定营养成分的值（每100g）
    
    Args:
        ingredient_data: 单个食材的营养数据字典
        nutrient_key: 营养类型标识符，如 'calories', 'protein' 等
    
    Returns:
        每100g该食材的营养值（mg或g），如果字段不存在则返回0.0
    """
    # 字段映射表：将标准标识符映射到JSON中的实际字段名
    field_mapping = {
        'calories': 'energy_kcal',
        'protein': 'protein_g',
        'fat': 'fat_g',
        'carb': 'carbohydrate_g',
        'fiber': 'fiber_g',              # 注意：final.json中可能不存在此字段
        'sodium': 'sodium_mg',
        'cholesterol': 'cholesterol_mg', # 注意：final.json中可能不存在此字段
        'vitamin_c': 'vitamin_c_mg',
        'calcium': 'calcium_mg',
        'iron': 'iron_mg',
        'potassium': 'potassium_mg'
    }
    
    field_name = field_mapping.get(nutrient_key)
    
    if field_name and field_name in ingredient_data:
        return float(ingredient_data[field_name])
    else:
        # 字段不存在（如植物性食材的胆固醇），返回0.0
        return 0.0


def apply_cooking(ingredients: List[str], weights: List[float], 
                  method: str, nutrition_db: Dict, 
                  random_seed: Optional[int] = None) -> Dict:
    """
    对食材应用烹饪系数，计算烹饪后的总营养值
    
    该函数是核心计算函数，根据烹饪方式系数表和随机误差规则，
    计算每种食材烹饪后的营养贡献，并累加得到整道菜的总营养值。
    
    Args:
        ingredients: 食材名称列表（英文名）
        weights: 对应食材的生重列表（克），与ingredients一一对应
        method: 烹饪方式，必须是COOKING_METHODS中的一种
        nutrition_db: 营养数据库（load_nutrition_db的返回值）
        random_seed: 随机种子，用于复现结果（可选）
    
    Returns:
        字典，包含：
        - cooked_weight_g: 成品总重（克）
        - cooked_calories: 总热量（kcal）
        - cooked_protein_g: 总蛋白质（g）
        - cooked_fat_g: 总脂肪（g）
        - cooked_carb_g: 总碳水化合物（g）
        - cooked_fiber_g: 总膳食纤维（g）
        - cooked_sodium_mg: 总钠（mg）
        - cooked_cholesterol_mg: 总胆固醇（mg）
        - cooked_vitamin_c_mg: 总维生素C（mg）
        - cooked_calcium_mg: 总钙（mg）
        - cooked_iron_mg: 总铁（mg）
        - cooked_potassium_mg: 总钾（mg）
    """
    if random_seed is not None:
        random.seed(random_seed)
    
    # 获取该烹饪方式的基准系数表
    base_coeffs = COOKING_COEFFICIENTS_BASE[method]
    
    # 初始化累加器：烹饪后的总营养值
    total_cooked = {
        'weight': 0.0,
        'calories': 0.0,
        'protein': 0.0,
        'fat': 0.0,
        'carb': 0.0,
        'fiber': 0.0,
        'sodium': 0.0,
        'cholesterol': 0.0,
        'vitamin_c': 0.0,
        'calcium': 0.0,
        'iron': 0.0,
        'potassium': 0.0
    }
    
    # 计算生食材的总营养（用于后续的边界保护）
    total_raw = {
        'weight': 0.0,
        'calories': 0.0,
        'fat': 0.0
    }
    
    # ========== 第一步：对每种食材分别计算 ==========
    for ing_name, raw_weight in zip(ingredients, weights):
        if ing_name not in nutrition_db:
            # 食材不在数据库中，跳过
            continue
        
        ing_data = nutrition_db[ing_name]
        
        # 计算该食材的生营养值（根据重量按比例计算）
        # 数据库中的值是"每100g"的营养值，所以需要乘以 (重量/100)
        weight_ratio = raw_weight / 100.0
        
        # 生营养值（总重量，不是每100g）
        raw_nutrition = {}
        for nutrient in total_cooked.keys():
            per_100g_value = get_nutrition_value(ing_data, nutrient)
            raw_nutrition[nutrient] = per_100g_value * weight_ratio
        
        # 累生生食材总营养（用于边界检查）
        total_raw['weight'] += raw_weight
        total_raw['calories'] += raw_nutrition['calories']
        total_raw['fat'] += raw_nutrition['fat']
        
        # ========== 第二步：应用烹饪系数（带随机误差） ==========
        for nutrient in total_cooked.keys():
            # 获取该营养的基准系数
            base_coeff = base_coeffs.get(nutrient, 1.0)
            
            # 添加随机误差
            error_range = ERROR_RANGES.get(nutrient, (1.0, 1.0))
            
            if error_range[0] == error_range[1]:
                # 误差范围上下限相等（如胆固醇），不添加随机误差
                actual_coeff = base_coeff
            else:
                # 在误差范围内生成随机因子
                error_factor = random.uniform(error_range[0], error_range[1])
                actual_coeff = base_coeff * error_factor
            
            # 计算该食材的熟营养贡献
            # 公式：熟营养 = 生营养 × 烹饪系数（带误差）
            cooked_contribution = raw_nutrition[nutrient] * actual_coeff
            
            # 累加到总营养
            total_cooked[nutrient] += cooked_contribution
    
    # ========== 第三步：应用边界保护 ==========
    # 防止极端值影响模型训练
    
    # 1. 热量边界保护
    min_calories = total_raw['calories'] * BOUNDARY_RULES['calories'][0]
    max_calories = total_raw['calories'] * BOUNDARY_RULES['calories'][1]
    total_cooked['calories'] = max(min_calories, min(max_calories, total_cooked['calories']))
    
    # 2. 脂肪边界保护
    min_fat = total_raw['fat'] * BOUNDARY_RULES['fat'][0]
    max_fat = total_raw['fat'] * BOUNDARY_RULES['fat'][1]
    total_cooked['fat'] = max(min_fat, min(max_fat, total_cooked['fat']))
    
    # 3. 重量边界保护
    min_weight = total_raw['weight'] * BOUNDARY_RULES['weight'][0]
    max_weight = total_raw['weight'] * BOUNDARY_RULES['weight'][1]
    total_cooked['weight'] = max(min_weight, min(max_weight, total_cooked['weight']))
    
    # ========== 第四步：构造返回值 ==========
    # 将内部使用的键名转换为输出格式（带单位）
    result = {
        'cooked_weight_g': round(total_cooked['weight'], 1),
        'cooked_calories': round(total_cooked['calories'], 1),
        'cooked_protein_g': round(total_cooked['protein'], 1),
        'cooked_fat_g': round(total_cooked['fat'], 1),
        'cooked_carb_g': round(total_cooked['carb'], 1),
        'cooked_fiber_g': round(total_cooked['fiber'], 1),
        'cooked_sodium_mg': round(total_cooked['sodium'], 1),
        'cooked_cholesterol_mg': round(total_cooked['cholesterol'], 1),
        'cooked_vitamin_c_mg': round(total_cooked['vitamin_c'], 1),
        'cooked_calcium_mg': round(total_cooked['calcium'], 1),
        'cooked_iron_mg': round(total_cooked['iron'], 1),
        'cooked_potassium_mg': round(total_cooked['potassium'], 1)
    }
    
    return result


def generate_random_meal(nutrition_db: Dict, 
                         allow_uncommon_pairs: bool = True,
                         random_seed: Optional[int] = None) -> Dict:
    """
    生成一条随机餐食样本
    
    该函数随机选择食材、重量和烹饪方式，生成一条完整的训练样本。
    
    Args:
        nutrition_db: 营养数据库
        allow_uncommon_pairs: 是否允许不常见搭配（如水果+肉类），默认允许
        random_seed: 随机种子（可选）
    
    Returns:
        样本字典，包含：
        - ingredients: 食材英文名，多个用下划线连接
        - raw_weights_g: 对应重量，多个用下划线连接
        - cooking_method: 烹饪方式
        - cooked_xxx: 各项烹饪后的营养值
    """
    if random_seed is not None:
        random.seed(random_seed)
    
    # 获取所有食材名称
    all_ingredients = list(nutrition_db.keys())
    
    if len(all_ingredients) == 0:
        raise ValueError("营养数据库为空，无法生成样本")
    
    # 随机选择1~4种食材
    num_ingredients = random.randint(1, min(4, len(all_ingredients)))
    
    # 随机选择食材（不重复）
    selected_ingredients = random.sample(all_ingredients, num_ingredients)
    
    # 为每种食材生成重量（50~500g，精确到1位小数）
    weights = [round(random.uniform(50, 500), 1) for _ in range(num_ingredients)]
    
    # 随机选择烹饪方式（从7种中均匀选择）
    cooking_method = random.choice(COOKING_METHODS)
    
    # 应用烹饪系数，计算营养值
    cooked_nutrition = apply_cooking(
        selected_ingredients, 
        weights, 
        cooking_method, 
        nutrition_db,
        random_seed=None  # 这里不使用seed，让每条样本都不同
    )
    
    # 构造输出样本
    sample = {
        'ingredients': '_'.join(selected_ingredients),
        'raw_weights_g': '_'.join([str(w) for w in weights]),
        'cooking_method': cooking_method
    }
    
    # 添加烹饪后的营养值
    sample.update(cooked_nutrition)
    
    return sample


def generate_dataset(nutrition_db: Dict, 
                    num_samples: int = 20000,
                    allow_uncommon_pairs: bool = True,
                    random_seed: Optional[int] = 42,
                    progress_interval: int = 5000) -> List[Dict]:
    """
    生成整个数据集
    
    Args:
        nutrition_db: 营养数据库
        num_samples: 要生成的样本数量
        allow_uncommon_pairs: 是否允许不常见搭配
        random_seed: 随机种子，用于复现（设置为None则完全随机）
        progress_interval: 进度打印间隔（每生成N条打印一次）
    
    Returns:
        样本列表，每个样本是一个字典
    """
    # 设置随机种子（如果提供）
    if random_seed is not None:
        random.seed(random_seed)
    
    dataset = []
    
    print(f"开始生成 {num_samples} 条样本...")
    
    for i in range(num_samples):
        # 为每个样本生成独立的随机种子（基于基础种子+i）
        # 这样可以保证可复现，同时又让每条样本不同
        if random_seed is not None:
            sample_seed = random_seed + i * 12345  # 使用大步长避免相邻样本的seed冲突
        else:
            sample_seed = None
        
        # 生成一条随机样本
        sample = generate_random_meal(
            nutrition_db,
            allow_uncommon_pairs=allow_uncommon_pairs,
            random_seed=sample_seed
        )
        
        dataset.append(sample)
        
        # 打印进度
        if (i + 1) % progress_interval == 0:
            print(f"  已生成 {i + 1}/{num_samples} 条样本 ({((i+1)/num_samples*100):.1f}%)")
    
    print(f"数据集生成完成！共 {len(dataset)} 条样本")
    
    return dataset


def save_dataset(dataset: List[Dict], output_path: str):
    """
    保存数据集到文件
    
    支持两种格式：
    - CSV (.csv)：使用pandas保存，便于数据分析
    - JSON (.json)：使用json.dump保存，便于程序读取
    
    Args:
        dataset: 样本列表
        output_path: 输出文件路径（会根据扩展名自动选择格式）
    """
    output_path = Path(output_path)
    
    if len(dataset) == 0:
        print("警告：数据集为空，未保存任何文件")
        return
    
    if output_path.suffix.lower() == '.csv':
        # 保存为CSV格式
        df = pd.DataFrame(dataset)
        df.to_csv(output_path, index=False, encoding='utf-8-sig')
        print(f"✓ 数据集已保存为CSV: {output_path}")
        print(f"  共 {len(df)} 行 × {len(df.columns)} 列")
        print(f"  列名: {', '.join(df.columns.tolist())}")
    
    elif output_path.suffix.lower() == '.json':
        # 保存为JSON格式
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(dataset, f, ensure_ascii=False, indent=2)
        print(f"✓ 数据集已保存为JSON: {output_path}")
        print(f"  共 {len(dataset)} 条记录")
    
    else:
        # 不支持的格式，默认保存为CSV
        csv_path = output_path.with_suffix('.csv')
        df = pd.DataFrame(dataset)
        df.to_csv(csv_path, index=False, encoding='utf-8-sig')
        print(f"警告：不支持的文件格式 '{output_path.suffix}'，已自动保存为CSV: {csv_path}")


def main():
    """
    主程序入口
    
    解析命令行参数，加载数据，生成数据集，保存结果。
    """
    # ========== 命令行参数解析 ==========
    parser = argparse.ArgumentParser(
        description='生成用于训练LightGBM的烹饪营养数据集',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 生成20000条样本，保存为CSV
  python generate_dataset.py -o dataset.csv -n 20000
  
  # 生成10000条样本，保存为JSON，设置随机种子
  python generate_dataset.py -o dataset.json -n 10000 -s 123
  
  # 不允许不常见食材搭配
  python generate_dataset.py -o dataset.csv --no-allow-uncommon
  
  # 使用自定义营养数据库
  python generate_dataset.py -i my_nutrition.json -o output.csv
        """
    )
    
    parser.add_argument(
        '-o', '--output',
        type=str,
        default='dataset.csv',
        help='输出文件路径（支持 .csv 或 .json），默认: dataset.csv'
    )
    
    parser.add_argument(
        '-n', '--num_samples',
        type=int,
        default=20000,
        help='生成样本数量，默认: 20000'
    )
    
    parser.add_argument(
        '-s', '--seed',
        type=int,
        default=42,
        help='随机种子，用于复现结果，默认: 42（设置为 -1 表示完全随机）'
    )
    
    parser.add_argument(
        '-i', '--input',
        type=str,
        default='final.json',
        help='输入营养数据库文件路径，默认: final.json'
    )
    
    parser.add_argument(
        '--no-allow-uncommon',
        action='store_true',
        help='禁止不常见食材搭配（如水果+肉类），默认: 允许所有搭配'
    )
    
    parser.add_argument(
        '-p', '--progress',
        type=int,
        default=5000,
        help='进度打印间隔（每生成N条打印一次），默认: 5000'
    )
    
    args = parser.parse_args()
    
    # ========== 打印配置信息 ==========
    print("=" * 70)
    print("  烹饪营养数据集生成脚本")
    print("=" * 70)
    print(f"  输入文件: {args.input}")
    print(f"  输出文件: {args.output}")
    print(f"  样本数量: {args.num_samples}")
    print(f"  随机种子: {args.seed if args.seed != -1 else '完全随机'}")
    print(f"  允许不常见搭配: {not args.no_allow_uncommon}")
    print(f"  进度打印间隔: 每 {args.progress} 条")
    print("=" * 70)
    
    # ========== 加载营养数据库 ==========
    print(f"\n[1/3] 正在加载营养数据库: {args.input}")
    
    try:
        nutrition_db = load_nutrition_db(args.input)
    except FileNotFoundError:
        print(f"错误：找不到输入文件 '{args.input}'")
        print(f"请确保文件存在，或修改 -i 参数指定正确路径")
        return
    except json.JSONDecodeError as e:
        print(f"错误：无法解析JSON文件 '{args.input}'")
        print(f"详细错误: {e}")
        return
    
    print(f"  ✓ 成功加载 {len(nutrition_db)} 种食材的营养数据")
    
    # 显示前5种食材（用于验证）
    sample_ingredients = list(nutrition_db.keys())[:5]
    print(f"  示例食材: {', '.join(sample_ingredients)}")
    
    # ========== 生成数据集 ==========
    print(f"\n[2/3] 正在生成数据集...")
    
    # 处理随机种子（设置为None表示完全随机）
    seed = args.seed if args.seed != -1 else None
    
    dataset = generate_dataset(
        nutrition_db=nutrition_db,
        num_samples=args.num_samples,
        allow_uncommon_pairs=not args.no_allow_uncommon,
        random_seed=seed,
        progress_interval=args.progress
    )
    
    # ========== 保存数据集 ==========
    print(f"\n[3/3] 正在保存数据集...")
    
    try:
        save_dataset(dataset, args.output)
    except Exception as e:
        print(f"错误：保存文件失败")
        print(f"详细错误: {e}")
        return
    
    # ========== 完成提示 ==========
    print("\n" + "=" * 70)
    print("  ✓ 数据集生成完成！")
    print("=" * 70)
    print(f"\n接下来你可以:")
    print(f"  1. 查看数据: head {args.output}")
    print(f"  2. 训练模型: 使用LightGBM读取 {args.output}")
    print(f"  3. 数据分析: 使用pandas读取并进行EDA\n")


if __name__ == '__main__':
    main()
