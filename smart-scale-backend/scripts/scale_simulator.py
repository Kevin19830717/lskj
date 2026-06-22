#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================
智能饮食健康秤 — 嵌入式秤端模拟脚本
模拟真实秤通过设备凭证(X-Device-Id + X-Device-Secret)上报餐食数据

用法:
  # 单次上报
  python3 scale_simulator.py --device-id SS26065EF3F70AF2 \
      --secret b56fb968a466f1cb726a280785766c858cb906e03fe288e533f4cf847f3de890 \
      --once

  # 循环上报（默认每30秒一条，共100条）
  python3 scale_simulator.py --device-id SS26065EF3F70AF2 \
      --secret b56fb968a466f1cb726a280785766c858cb906e03fe288e533f4cf847f3de890 \
      --interval 30 --count 100

  # 指定服务器地址（默认本机）
  python3 scale_simulator.py --device-id ... --secret ... \
      --host http://106.53.198.194:8080

  # 连续上报模式（无限循环，按 Ctrl+C 停止）
  python3 scale_simulator.py --device-id ... --secret ... --count 0

依赖: 仅需 Python3 标准库（requests 可选，无则用 urllib）
============================================================
"""

import argparse
import json
import random
import sys
import time
import urllib.request
import urllib.error

# ============================================================
# 食材样本库（name_en: 中文名 + 每100g生食营养基准）
# 用于随机组合生成测试餐食
# ============================================================
FOOD_SAMPLES = {
    "chicken":       {"zh": "鸡肉",   "kcal": 167, "protein": 19.3, "fat": 9.4,  "carb": 1.3},
    "pork":          {"zh": "猪肉",   "kcal": 395, "protein": 13.2, "fat": 37.0, "carb": 2.4},
    "beef":          {"zh": "牛肉",   "kcal": 125, "protein": 19.9, "fat": 4.2,  "carb": 2.0},
    "fish":          {"zh": "鱼肉",   "kcal": 145, "protein": 22.0, "fat": 5.2,  "carb": 0.0},
    "tofu":          {"zh": "豆腐",   "kcal": 81,  "protein": 8.1,  "fat": 3.7,  "carb": 4.2},
    "egg":           {"zh": "鸡蛋",   "kcal": 144, "protein": 13.3, "fat": 8.8,  "carb": 2.8},
    "carrot":        {"zh": "胡萝卜", "kcal": 39,  "protein": 1.0,  "fat": 0.2,  "carb": 8.8},
    "broccoli":      {"zh": "西兰花", "kcal": 36,  "protein": 4.1,  "fat": 0.6,  "carb": 4.3},
    "tomato":        {"zh": "番茄",   "kcal": 20,  "protein": 0.9,  "fat": 0.2,  "carb": 4.0},
    "potato":        {"zh": "土豆",   "kcal": 81,  "protein": 2.6,  "fat": 0.2,  "carb": 17.8},
    "rice":          {"zh": "米饭",   "kcal": 130, "protein": 2.7,  "fat": 0.3,  "carb": 28.2},
    "cucumber":      {"zh": "黄瓜",   "kcal": 16,  "protein": 0.8,  "fat": 0.2,  "carb": 2.9},
    "spinach":       {"zh": "菠菜",   "kcal": 28,  "protein": 2.6,  "fat": 0.3,  "carb": 4.5},
    "mushroom":      {"zh": "蘑菇",   "kcal": 24,  "protein": 2.7,  "fat": 0.1,  "carb": 4.1},
    "shrimp":        {"zh": "虾",     "kcal": 87,  "protein": 16.4, "fat": 2.4,  "carb": 0.0},
}

COOKING_METHODS = ["boil", "braise", "deep_fry", "pan_fry", "roast", "steam", "stir_fry"]

# 各烹饪方式营养保留/增益系数（与后端 CookingLossRates 对应）
COOKING_FACTORS = {
    "boil":     {"kcal": 0.92, "protein": 0.95, "fat": 0.85, "carb": 0.90},
    "braise":   {"kcal": 0.88, "protein": 0.92, "fat": 0.90, "carb": 0.88},
    "deep_fry": {"kcal": 1.45, "protein": 0.90, "fat": 2.20, "carb": 0.85},
    "pan_fry":  {"kcal": 1.25, "protein": 0.93, "fat": 1.60, "carb": 0.88},
    "roast":    {"kcal": 0.98, "protein": 0.96, "fat": 0.97, "carb": 0.94},
    "steam":    {"kcal": 0.96, "protein": 0.98, "fat": 0.92, "carb": 0.96},
    "stir_fry": {"kcal": 1.08, "protein": 0.95, "fat": 1.15, "carb": 0.92},
}


def generate_meal():
    """随机生成一条餐食上报数据（模拟秤已称重并计算好烹饪后营养值）"""
    # 随机选 2-4 种食材
    n = random.randint(2, 4)
    chosen = random.sample(list(FOOD_SAMPLES.keys()), n)
    cooking = random.choice(COOKING_METHODS)
    factor = COOKING_FACTORS[cooking]

    ingredients = []
    raw_weights = []
    total_kcal = total_protein = total_fat = total_carb = 0.0
    total_weight = 0.0

    for name_en in chosen:
        food = FOOD_SAMPLES[name_en]
        # 每种食材随机 50-300g
        w = random.randint(50, 300)
        ratio = w / 100.0

        kcal = food["kcal"] * ratio * factor["kcal"]
        protein = food["protein"] * ratio * factor["protein"]
        fat = food["fat"] * ratio * factor["fat"]
        carb = food["carb"] * ratio * factor["carb"]

        total_kcal += kcal
        total_protein += protein
        total_fat += fat
        total_carb += carb
        total_weight += w * 0.85  # 烹饪后失水约15%

        ingredients.append(name_en)
        raw_weights.append(w)

    payload = {
        "ingredients": ingredients,
        "raw_weights_g": raw_weights,
        "cooking_method": cooking,
        "cooked_weight_g": round(total_weight, 1),
        "cooked_energy_kcal": round(total_kcal, 1),
        "cooked_protein_g": round(total_protein, 1),
        "cooked_fat_g": round(total_fat, 1),
        "cooked_carbohydrate_g": round(total_carb, 1),
        "cooked_sodium_mg": round(random.uniform(200, 800), 1),
        "cooked_cholesterol_mg": round(random.uniform(30, 150), 1),
        "cooked_vitamin_c_mg": round(random.uniform(2, 30), 1),
        "cooked_calcium_mg": round(random.uniform(20, 120), 1),
        "cooked_iron_mg": round(random.uniform(0.5, 4.0), 2),
        "cooked_potassium_mg": round(random.uniform(150, 600), 1),
    }
    return payload


def upload(host, device_id, secret, payload):
    """通过设备凭证上报，返回 (http_status, response_dict)"""
    url = f"{host}/api/v1/device/weigh-in"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Device-Id": device_id,
            "X-Device-Secret": secret,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except json.JSONDecodeError:
            return e.code, {"raw": body}
    except Exception as e:
        return -1, {"error": str(e)}


def fmt_meal(payload):
    """格式化打印餐食摘要"""
    ings_zh = [FOOD_SAMPLES[i]["zh"] for i in payload["ingredients"]]
    return (
        f"食材: {', '.join(ings_zh)} | "
        f"生重: {payload['raw_weights_g']} | "
        f"烹饪: {payload['cooking_method']} | "
        f"熟重: {payload['cooked_weight_g']}g | "
        f"热量: {payload['cooked_energy_kcal']}kcal | "
        f"蛋白: {payload['cooked_protein_g']}g"
    )


def main():
    parser = argparse.ArgumentParser(
        description="智能饮食健康秤 — 嵌入式秤端模拟脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--host", default="http://localhost:8080", help="服务器地址(默认本机)")
    parser.add_argument("--device-id", required=True, help="设备序列号")
    parser.add_argument("--secret", required=True, help="设备密钥")
    parser.add_argument("--once", action="store_true", help="仅上报一次")
    parser.add_argument("--interval", type=float, default=30, help="上报间隔秒数(默认30)")
    parser.add_argument("--count", type=int, default=100, help="上报条数，0=无限(默认100)")
    args = parser.parse_args()

    host = args.host.rstrip("/")
    print("=" * 64)
    print("  智能饮食健康秤 — 秤端模拟器")
    print("=" * 64)
    print(f"  服务器:   {host}")
    print(f"  设备ID:   {args.device_id}")
    print(f"  模式:     {'单次' if args.once else f'循环(间隔{args.interval}s, ' + ('无限' if args.count == 0 else str(args.count)) + '条)'}")
    print("=" * 64)
    print()

    total = args.count if args.count > 0 else float("inf")
    success = fail = 0
    n = 0

    try:
        while n < total:
            n += 1
            payload = generate_meal()
            tag = f"[{n}]" if args.count > 0 else f"[{n}]"
            print(f"{tag} 上报 → {fmt_meal(payload)}")

            status, resp = upload(host, args.device_id, args.secret, payload)
            if status == 201:
                success += 1
                rec_id = resp.get("data", {}).get("id", "?")
                print(f"     ✅ 成功 (HTTP 201, 记录ID={rec_id})")
            else:
                fail += 1
                print(f"     ❌ 失败 (HTTP {status}): {resp}")

            if args.once:
                break
            if n < total:
                time.sleep(args.interval)

    except KeyboardInterrupt:
        print("\n\n用户中断，停止上报。")

    print()
    print("=" * 64)
    print(f"  汇总: 共尝试 {n} 次, 成功 {success}, 失败 {fail}")
    print("=" * 64)
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
