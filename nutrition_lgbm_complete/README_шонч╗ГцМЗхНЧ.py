# ============================================================
# LightGBM 烹饪营养预测 — 零基础完整指南
# ============================================================
#
# 你的目标：用食材+重量+烹饪方式 → 预测烹饪后的营养值
# 输入特征：ingredients, raw_weights_g, cooking_method
# 预测目标：cooked_weight_g, cooked_energy_kcal, cooked_protein_g, ...
#

# ============================================================
# 方案一：Google Colab（推荐零基础用户）
# ============================================================
#
# 优点：免费GPU、无需安装、打开即用
# 步骤：
#
# 1. 打开浏览器，访问 https://colab.research.google.com
# 2. 登录 Google 账号
# 3. 点击「新建笔记本」
# 4. 点击左侧文件夹图标 📁 → 「上传到会话存储」
#    上传你的 training_data copy.csv 文件
# 5. 在代码单元格中粘贴 train_lgbm.py 的全部代码
# 6. 点击 ▶ 运行
#
# 注意：Colab 上文件路径改为 "/content/training_data copy.csv"
#

# ============================================================
# 方案二：本地 Windows 环境
# ============================================================
#
# 步骤1：确认 Python 环境
# -------------------------
# 打开 PowerShell，输入：
#   python --version
# 应显示 Python 3.8+ （你已有 conda base 环境，应该OK）
#
# 步骤2：安装依赖
# -------------------------
# 在 PowerShell 中运行：
#   pip install lightgbm scikit-learn pandas numpy matplotlib
#
# 如果速度慢，用清华镜像：
#   pip install lightgbm scikit-learn pandas numpy matplotlib -i https://pypi.tuna.tsinghua.edu.cn/simple
#
# 步骤3：运行训练脚本
# -------------------------
#   cd d:\data
#   python train_lgbm.py
#
# 步骤4：查看结果
# -------------------------
# 脚本会输出：
#   - 每个目标的 RMSE、MAE、R² 分数
#   - 特征重要性图（保存为 feature_importance.png）
#   - 预测 vs 真实值散点图（保存为 prediction_scatter.png）
#   - 训练好的模型文件（.txt 格式，可复用）
#

# ============================================================
# 常见问题
# ============================================================
#
# Q: pip install lightgbm 报错怎么办？
# A: Windows 上如果编译失败，试试：
#    pip install lightgbm --install-option=--nomp
#    或者直接用 conda：
#    conda install lightgbm
#
# Q: 内存不够怎么办？
# A: 减少 --samples 或在脚本中设置 n_samples 参数
#
# Q: 想用 GPU 加速？
# A: 需要安装 lightgbm 的 GPU 版本，零基础建议先用 CPU 版本
#    GPU 版本安装参考：https://lightgbm.readthedocs.io/en/latest/GPU-Tutorial.html
#
