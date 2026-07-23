============================================================
端侧智能饮食健康管理助手 — 完整复现指南
============================================================

文件结构：
-----------
_pack/
├── final.json                    # 31种食材营养数据库 (每100g)
├── generate_training_data.py     # 训练数据生成器 (连锁反应物理模型)
├── generate_correct.py           # 简单公式方案 (用于对比)
├── generate_dataset.py           # 另一版本数据生成器
├── generate_30.py                # 小批量数据生成器
├── train_lgbm.py                 # ★ 独立模型训练脚本 (11个LightGBM)
├── train_lgbm_multi.py           # 多输出链式模型训练脚本 (RegressorChain)
├── benchmark_lgbm.py             # ★ 综合基准测试 (推理速度+菜品演示)
├── bench_lgbm.py                 # 精简版基准测试
├── analyze_training.py           # 训练数据分析 (11项分析)
├── predict_txt.py                # 使用11个独立txt模型预测
├── predict.py                    # 使用多输出pkl模型预测
├── predict_30.py                 # 30道随机菜批量预测
├── README_训练指南.py            # 零基础训练指南
├── training_50k.csv              # 预生成5万条训练数据 (用于Stephen)
├── training_data copy.csv        # 原始2万条训练数据 (用于lgbm_output)
├── Stephen/                      # ★ 最优模型 (平均R²=0.9385)
│   ├── lgbm_cooked_*.txt ×11     # 11个LightGBM模型文件
│   ├── model_meta.json           # 训练指标元数据
│   ├── feature_importance.png    # 特征重要性图
│   ├── prediction_scatter.png    # 预测vs真实散点图
│   └── r2_scores.png             # R²分数柱状图
├── lgbm_output/                  # 早期模型 (平均R²=0.910)
├── lgbm_output_multi/            # 多输出模型 (RegressorChain策略)
├── jiaofu/                       # 最终部署交付包
│   ├── models/                   # 部署用11个模型
│   ├── final.json                # 营养数据库
│   ├── README.md                 # ESP32部署文档
│   └── 项目技术说明.txt          # 系统架构说明
├── 端侧智能饮食健康管理助手_课程汇报大纲.md
├── ppt讲解.txt
└── README_复现指南.txt           # 本文件


============================================================
完整复现流程 (3步)
============================================================

环境要求：
  Python 3.8+
  pip install lightgbm scikit-learn pandas numpy matplotlib

----------------------------------------------------------------
第1步：生成训练数据 (或跳过，直接用预生成CSV)
----------------------------------------------------------------

python generate_training_data.py --output training_data --samples 50000 --seed 42
  输出: training_data.csv + training_data.json

----------------------------------------------------------------
第2步：训练模型
----------------------------------------------------------------

# 独立模型训练 (生成 Stephen)
python train_lgbm.py --data training_50k.csv --output Stephen --seed 42

# 或使用原始数据训练 (生成 lgbm_output)
python train_lgbm.py --data "training_data copy.csv" --output lgbm_output --seed 42

# 或训练多输出模型
python train_lgbm_multi.py --data training_50k.csv --output lgbm_output_multi --seed 42

----------------------------------------------------------------
第3步：评估与预测
----------------------------------------------------------------

# 综合基准测试 (推理速度 + 10道菜品预测演示)
python benchmark_lgbm.py

# 训练数据分析
python analyze_training.py

# 用Stephen模型预测30道随机菜品
python predict_30.py

# 多输出模型预测
python predict.py


============================================================
模型对比：三种训练策略
============================================================

| 策略         | 脚本              | 输出目录          | 平均R² | 数据量 |
|-------------|-------------------|-------------------|--------|-------|
| 11独立模型   | train_lgbm.py     | Stephen/          | 0.9385 | 50k   |
| 11独立模型   | train_lgbm.py     | lgbm_output/      | 0.910  | 20k   |
| RegressorChain | train_lgbm_multi.py | lgbm_output_multi/ | 见meta | 20k   |

Stephen用5万条数据 + 独立模型策略，效果最优。


============================================================
公式 vs 模型对比
============================================================

generate_correct.py 实现了"简单公式"方案 (系数直接乘法)。
与模型方案的对比要点参见 端侧智能饮食健康管理助手_课程汇报大纲.md。


============================================================
benchmark_lgbm.py 输出说明
============================================================

测试1: 单模型推理速度 (11个模型逐个测)
测试2: 完整流程计时 (特征构建+推理+后处理)
测试3: 10道典型菜品预测演示 ← 最重要
测试4: 模型文件统计 (大小、树数量)
测试5: 批量推理吞吐量
