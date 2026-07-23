# -*- coding: utf-8 -*-
"""LightGBM 模型推理性能详细测试 - 精简版"""

import os, time, random, numpy as np, pandas as pd, lightgbm as lgb

ALL_INGREDIENTS = [
    "apple","banana","beef","bell_pepper","cabbage","carrot","cauliflower",
    "chicken","cucumber","egg","eggplant","fish","garlic","ginger","grape",
    "kiwi","kumquat","lemon","onion","orange","peach","pepper","pineapple",
    "pork","potato","shrimp","small_pepper","strawberry","tofu","tomato","watermelon"
]
FRUITS = {"apple","banana","grape","kiwi","kumquat","lemon","orange","peach","pineapple","strawberry","watermelon"}
MEATS = {"beef","chicken","pork","shrimp","fish"}
TARGET_COLS = [
    "cooked_weight_g","cooked_energy_kcal","cooked_protein_g","cooked_fat_g",
    "cooked_carbohydrate_g","cooked_sodium_mg","cooked_cholesterol_mg",
    "cooked_vitamin_c_mg","cooked_calcium_mg","cooked_iron_mg","cooked_potassium_mg",
]
METHOD_MAPPING = {"boil":0,"braise":1,"deep_fry":2,"pan_fry":3,"roast":4,"steam":5,"stir_fry":6}
METHOD_CN = {"boil":"zhu","braise":"hongshao","deep_fry":"zha","pan_fry":"jian","roast":"kao","steam":"zheng","stir_fry":"chao"}
TARGET_CN = {
    "cooked_weight_g":"weight(g)","cooked_energy_kcal":"energy(kcal)","cooked_protein_g":"protein(g)",
    "cooked_fat_g":"fat(g)","cooked_carbohydrate_g":"carb(g)","cooked_sodium_mg":"Na(mg)",
    "cooked_cholesterol_mg":"cholesterol(mg)","cooked_vitamin_c_mg":"VitC(mg)",
    "cooked_calcium_mg":"Ca(mg)","cooked_iron_mg":"Fe(mg)","cooked_potassium_mg":"K(mg)",
}
MODELS_DIR = "jiaofu/models"
SPICE_WEIGHT_RANGE = {"pepper":(0.5,5.0),"ginger":(5.0,30.0),"garlic":(5.0,30.0)}

models = {}
for t in TARGET_COLS:
    p = os.path.join(MODELS_DIR, f"lgbm_{t}.txt")
    models[t] = lgb.Booster(model_file=p)
print(f"Loaded {len(models)} models")

def build_features(ingredients, weights, cooking_method):
    fc = [f"ing_{i}" for i in ALL_INGREDIENTS] + [
        "raw_weight_1","raw_weight_2","raw_weight_3","raw_weight_4",
        "raw_weight_total","raw_weight_mean","n_ingredients","has_fruit","has_meat","cooking_method_enc"
    ]
    row = {c:0 for c in fc}
    for ing in ingredients: row[f"ing_{ing}"] = 1
    for i,w in enumerate(weights[:4]): row[f"raw_weight_{i+1}"] = w
    row["raw_weight_total"] = sum(weights)
    row["raw_weight_mean"] = sum(weights)/len(weights)
    row["n_ingredients"] = len(weights)
    row["has_fruit"] = 1 if any(i in FRUITS for i in ingredients) else 0
    row["has_meat"] = 1 if any(i in MEATS for i in ingredients) else 0
    row["cooking_method_enc"] = METHOD_MAPPING.get(cooking_method,0)
    return pd.DataFrame([row], columns=fc)

def predict(models, ingredients, weights, cooking_method):
    X = build_features(ingredients, weights, cooking_method)
    results = {}
    for target, model in models.items():
        results[target] = model.predict(X)[0]
    for k in results:
        if k != "cooked_energy_kcal": results[k] = max(0.0, results[k])
    results["cooked_energy_kcal"] = round(
        results["cooked_protein_g"]*4 + results["cooked_fat_g"]*9 + results["cooked_carbohydrate_g"]*4, 1)
    return results

# ============================================================
# Test 1: single model timing (1000 runs)
# ============================================================
print("\n" + "="*70)
print("Test 1: single model inference time (1000 runs avg)")
print("="*70)
X_test = build_features(["chicken","potato"], [200.0, 150.0], "stir_fry")
total_ms = 0
for target, model in models.items():
    for _ in range(50): model.predict(X_test)
    t0 = time.perf_counter()
    for _ in range(1000): model.predict(X_test)
    t1 = time.perf_counter()
    avg = (t1-t0)/1000*1000
    total_ms += avg
    fsize = os.path.getsize(os.path.join(MODELS_DIR, f"lgbm_{target}.txt"))/1024
    print(f"  {target:<30s} {avg:.4f} ms  (file: {fsize:.0f} KB)")
print(f"  --- TOTAL 11 models: {total_ms:.2f} ms ---")

# ============================================================
# Test 2: full pipeline timing (500 runs)
# ============================================================
print("\n" + "="*70)
print("Test 2: full pipeline time (feature+inference+postprocess, 500 runs)")
print("="*70)
random.seed(42)
cases = []
for _ in range(500):
    n = random.randint(1,4)
    ch = random.sample(ALL_INGREDIENTS, n)
    w = []
    for ing in ch:
        if ing in SPICE_WEIGHT_RANGE:
            lo,hi = SPICE_WEIGHT_RANGE[ing]
        else:
            lo,hi = 50.0,500.0
        w.append(round(random.uniform(lo,hi),1))
    m = random.choice(list(METHOD_MAPPING.keys()))
    cases.append((ch,w,m))

for _ in range(20): predict(models, *cases[0])

t0 = time.perf_counter()
for c,w,m in cases: predict(models, c, w, m)
t1 = time.perf_counter()
avg_full = (t1-t0)/500*1000
print(f"  Full pipeline avg: {avg_full:.2f} ms per prediction")

# ============================================================
# Test 3: demo predictions
# ============================================================
print("\n" + "="*70)
print("Test 3: demo predictions with detailed results")
print("="*70)
demos = [
    (["chicken"],[200.0],"stir_fry","chicken stir-fry"),
    (["pork","potato"],[150.0,100.0],"braise","braised pork+potato"),
    (["fish","ginger","garlic"],[300.0,15.0,10.0],"steam","steamed fish"),
    (["egg","tomato"],[120.0,200.0],"stir_fry","egg+tomato stir-fry"),
    (["beef","onion","bell_pepper"],[200.0,80.0,60.0],"pan_fry","pan-fried beef"),
    (["shrimp","ginger"],[200.0,10.0],"boil","boiled shrimp"),
    (["potato"],[300.0],"deep_fry","deep-fried potato"),
    (["chicken","carrot","potato","onion"],[200.0,80.0,100.0,50.0],"roast","roasted chicken+veg"),
]
for ings, wts, mth, desc in demos:
    t0 = time.perf_counter()
    r = predict(models, ings, wts, mth)
    t1 = time.perf_counter()
    ms = (t1-t0)*1000
    raw = sum(wts)
    wc = (r["cooked_weight_g"]-raw)/raw*100
    print(f"\n  Dish: {desc} (method={mth})")
    print(f"  Ingredients: {'+'.join(ings)}, raw={raw:.0f}g")
    print(f"  Inference time: {ms:.2f} ms")
    print(f"  Cooked weight: {r['cooked_weight_g']:.1f}g ({wc:+.1f}%)")
    print(f"  Energy: {r['cooked_energy_kcal']:.0f} kcal | Protein: {r['cooked_protein_g']:.1f}g | Fat: {r['cooked_fat_g']:.1f}g | Carb: {r['cooked_carbohydrate_g']:.1f}g")
    print(f"  Na: {r['cooked_sodium_mg']:.0f}mg | Cholesterol: {r['cooked_cholesterol_mg']:.0f}mg | VitC: {r['cooked_vitamin_c_mg']:.1f}mg")
    print(f"  Ca: {r['cooked_calcium_mg']:.0f}mg | Fe: {r['cooked_iron_mg']:.1f}mg | K: {r['cooked_potassium_mg']:.0f}mg")

# ============================================================
# Test 4: model file stats
# ============================================================
print("\n" + "="*70)
print("Test 4: model file statistics")
print("="*70)
ts = 0; tt = 0; tl = 0
for target in TARGET_COLS:
    p = os.path.join(MODELS_DIR, f"lgbm_{target}.txt")
    sz = os.path.getsize(p)/1024; ts += sz
    with open(p,"r",encoding="utf-8") as f: c = f.read()
    nt = c.count("Tree="); tt += nt
    nl = sum(int(l.split("=")[1]) for l in c.split("\n") if l.startswith("num_leaves=")); tl += nl
    print(f"  {target:<30s} {sz:>8.1f} KB | {nt} trees | {nl} leaves")
print(f"  --- TOTAL: {ts:.0f} KB ({ts/1024:.1f} MB) | {tt} trees | {tl} leaves ---")

# ============================================================
# Test 5: batch throughput
# ============================================================
print("\n" + "="*70)
print("Test 5: batch throughput (1000 samples)")
print("="*70)
random.seed(123)
all_X = []
for _ in range(1000):
    n = random.randint(1,4)
    ch = random.sample(ALL_INGREDIENTS, n)
    w = [round(random.uniform(50,500),1) for _ in ch]
    m = random.choice(list(METHOD_MAPPING.keys()))
    X = build_features(ch, w, m)
    all_X.append(X)
X_batch = pd.concat(all_X, ignore_index=True)

for target, model in models.items():
    model.predict(X_batch.iloc[:10])
    t0 = time.perf_counter()
    preds = model.predict(X_batch)
    t1 = time.perf_counter()
    throughput = 1000/(t1-t0)
    print(f"  {target:<30s}  1000 samples in {(t1-t0)*1000:.1f} ms  |  {throughput:.0f} samples/sec")

# ============================================================
# Summary
# ============================================================
print("\n" + "="*70)
print("SUMMARY")
print("="*70)
print(f"  PC (this machine):")
print(f"    - 11 models serial inference: ~{total_ms:.1f} ms")
print(f"    - Full pipeline (feature+inference+post): ~{avg_full:.1f} ms")
print(f"  ESP32-P4 estimate (400MHz, ~1/10-1/20 of PC):")
print(f"    - 11 models inference: ~{total_ms*10:.0f}-{total_ms*20:.0f} ms")
print(f"    - Full pipeline: ~{avg_full*10:.0f}-{avg_full*20:.0f} ms")
print(f"  Model size:")
print(f"    - 11 model files total: {ts:.0f} KB ({ts/1024:.1f} MB)")
print(f"    - Total decision trees: {tt}")
print(f"    - Total leaf nodes: {tl}")
