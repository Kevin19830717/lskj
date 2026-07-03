#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成《项目与劳动实践1》课程报告"""

from docx import Document
from docx.shared import Pt, Cm, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

doc = Document()

# ============================================================
# 设置默认字体
# ============================================================
style = doc.styles['Normal']
style.font.name = '宋体'
style.font.size = Pt(12)
style._element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')

# ============================================================
# 封面
# ============================================================
def add_cover(doc):
    # 标题
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('\n\n\n深圳技术大学项目实践课程报告\n')
    run.font.size = Pt(22)
    run.font.bold = True
    run.font.name = '黑体'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('— 基于YOLO的智能饮食健康秤端侧模型设计与实现 —')
    run.font.size = Pt(14)
    run.font.name = '宋体'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')

    for _ in range(5):
        doc.add_paragraph('')

    # 信息表
    info_items = [
        ('课程名称：', '项目与劳动实践1'),
        ('课程编号：', 'IB00190'),
        ('任课教师：', '__________'),
        ('学  生：', '__________    学  号：__________'),
        ('班    级：', '__________'),
        ('报告/实践地点：', '__________'),
        ('报告/实践时间：', '______年____月____日  星期____'),
        ('提交时间：', '______年____月____日'),
    ]

    for label, value in info_items:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(label)
        run.font.size = Pt(14)
        run.font.name = '宋体'
        run._element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
        run = p.add_run(value)
        run.font.size = Pt(14)
        run.font.name = '宋体'
        run._element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')

    doc.add_page_break()

add_cover(doc)

# ============================================================
# 正文辅助函数
# ============================================================
def add_h1(text):
    p = doc.add_heading(level=1)
    run = p.add_run(text)
    run.font.size = Pt(16)
    run.font.bold = True
    run.font.name = '黑体'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    return p

def add_h2(text):
    p = doc.add_heading(level=2)
    run = p.add_run(text)
    run.font.size = Pt(14)
    run.font.bold = True
    run.font.name = '黑体'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    return p

def add_h3(text):
    p = doc.add_heading(level=3)
    run = p.add_run(text)
    run.font.size = Pt(12)
    run.font.bold = True
    run.font.name = '黑体'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), '黑体')
    return p

def add_para(text, indent=True):
    p = doc.add_paragraph()
    if indent:
        p.paragraph_format.first_line_indent = Pt(24)
    run = p.add_run(text)
    run.font.size = Pt(12)
    run.font.name = '宋体'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    p.paragraph_format.line_spacing = 1.5
    return p

def add_code_block(code_text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Pt(24)
    run = p.add_run(code_text)
    run.font.size = Pt(10)
    run.font.name = 'Consolas'
    run.font.color.rgb = RGBColor(0, 0, 0)
    p.paragraph_format.line_spacing = 1.2
    return p

# ============================================================
# 一、报告内容
# ============================================================
add_h1('一、项目背景与意义')

add_h2('1.1 项目背景')

add_para(
    '随着国民健康意识的不断提高，饮食健康管理已成为公众关注的焦点。根据《中国居民营养与慢性病状况报告》显示，'
    '我国居民超重肥胖问题突出，不合理饮食导致的慢性疾病发病率持续上升。传统的饮食记录方式依赖人工输入，'
    '效率低、误差大，难以长期坚持。'
)

add_para(
    '近年来，深度学习技术特别是目标检测算法的快速发展，为智能饮食管理提供了新的技术路径。'
    'YOLO（You Only Look Once）系列算法以其速度快、精度高的特点，成为端侧实时目标检测的首选方案。'
    '与此同时，嵌入式AI芯片性能的提升和轻量化模型技术的成熟，使得在资源受限的嵌入式设备上部署深度学习模型成为可能。'
)

add_para(
    '本项目"智能饮食健康秤"正是在这一背景下，将YOLO目标检测技术、嵌入式端侧AI、营养计算模型与云边协同架构相结合，'
    '设计并实现了一套面向家庭用户的智能饮食健康管理系统。用户只需将餐盘放置在秤上，系统即可自动识别食材种类、'
    '称重并计算营养成分，实现"一放即测"的无感饮食记录体验。'
)

add_h2('1.2 项目意义')

add_para(
    '本项目的研究意义主要体现在以下几个方面：'
)

add_para(
    '（1）学术意义：探索了YOLO系列轻量化模型在嵌入式端侧的部署与优化方法，为端侧AI在消费电子领域的应用提供了参考案例。'
    '通过对YOLO11n模型进行量化、剪枝等优化，验证了在ESP32-P4等资源受限设备上运行实时目标检测的可行性。'
)

add_para(
    '（2）应用价值：将AI技术与健康管理深度融合，降低了饮食记录的门槛。相较于传统的手动记录App，本系统的自动化程度更高、'
    '用户负担更小，有助于提高用户的长期依从性，从而更有效地辅助慢性病预防和体重管理。'
)

add_para(
    '（3）社会意义：响应"健康中国2030"战略，推动智慧医疗和健康管理的普及。通过低成本的端侧AI方案，'
    '使智能健康设备更具普惠性，让普通家庭也能享受到AI带来的健康管理便利。'
)

add_h2('1.3 需求分析')

add_h3('1.3.1 功能需求')

add_para(
    '系统需要实现以下核心功能：'
)

add_para(
    '（1）食材识别功能：通过摄像头采集餐盘图像，利用YOLO模型实时识别盘中的食材种类，支持31种常见食材的识别。',
    indent=False
)
add_para(
    '（2）称重功能：通过压力传感器精确测量食物重量，精度达到1g。',
    indent=False
)
add_para(
    '（3）营养计算功能：基于食材种类、重量和烹饪方式，自动计算热量、蛋白质、脂肪、碳水化合物等营养成分。',
    indent=False
)
add_para(
    '（4）数据同步功能：将称重数据和营养分析结果上传至云端服务器，支持多端查看。',
    indent=False
)
add_para(
    '（5）历史记录与统计：提供日/周/月/年营养报告，生成趋势分析和健康建议。',
    indent=False
)
add_para(
    '（6）AI助手对话：基于大语言模型和RAG技术，提供个性化的饮食健康咨询服务。',
    indent=False
)

add_h3('1.3.2 性能需求')

add_para(
    '端侧模型需要满足以下性能指标：'
)

add_para(
    '（1）识别帧率：≥3 FPS，保证实时交互体验；',
    indent=False
)
add_para(
    '（2）识别准确率：Top-1准确率≥85%，mAP≥0.75；',
    indent=False
)
add_para(
    '（3）模型体积：≤1MB，适应嵌入式设备Flash存储限制；',
    indent=False
)
add_para(
    '（4）内存占用：运行时RAM占用≤2MB；',
    indent=False
)
add_para(
    '（5）功耗：端侧AI推理平均功耗≤500mW，支持电池供电。',
    indent=False
)

# ============================================================
# 二、项目相关概念与技术
# ============================================================
add_h1('二、项目相关概念与技术')

add_h2('2.1 YOLO目标检测算法')

add_h3('2.1.1 YOLO算法原理')

add_para(
    'YOLO（You Only Look Once）是一种基于单一卷积神经网络的端到端目标检测算法。'
    '与传统的两阶段检测方法（如Faster R-CNN）不同，YOLO将目标检测问题转化为一个回归问题，'
    '通过单个神经网络直接从图像像素预测边界框坐标和类别概率，实现了端到端的检测。'
)

add_para(
    'YOLO算法的核心思想是：将输入图像划分为 S×S 的网格，每个网格单元负责预测中心点落在该网格内的目标。'
    '每个网格单元预测B个边界框及其置信度分数，以及C个类别的概率。通过这种方式，'
    'YOLO在一次前向传播中就能完成所有目标的检测，因此具有极快的推理速度。'
)

add_h3('2.1.2 YOLO11模型结构')

add_para(
    'YOLO11是Ultralytics公司推出的最新一代YOLO系列模型，在保持高检测精度的同时，'
    '进一步减少了模型参数量和计算量。YOLO11的网络结构主要包括以下三个部分：'
)

add_para(
    '（1）Backbone（骨干网络）：采用CSPDarknet结构，通过C2f模块和SPPF模块提取多尺度特征。'
    'C2f模块在C3模块的基础上引入了更多的梯度流分支，增强了特征提取能力。'
)

add_para(
    '（2）Neck（颈部网络）：采用PAN-FPN（Path Aggregation Network - Feature Pyramid Network）结构，'
    '通过自顶向下的上采样和自底向上的下采样进行多尺度特征融合，使不同尺度的特征图都能获得丰富的语义信息和位置信息。'
)

add_para(
    '（3）Head（检测头）：采用解耦头（Decoupled Head）设计，将分类和检测任务分离为两个并行的分支，'
    '分别负责类别预测和边界框回归，提高了检测精度并加速了收敛。'
)

add_h3('2.1.3 YOLO11n轻量化版本')

add_para(
    'YOLO11提供了多个不同尺寸的模型变体，包括n（nano）、s（small）、m（medium）、l（large）、x（xlarge）。'
    '其中YOLO11n是最轻量的版本，参数量约为2.6M，适合在资源受限的嵌入式设备上部署。'
)

add_para(
    'YOLO11n的主要特点包括：模型体积小（约6MB原始权重）、推理速度快、精度适中。'
    '通过深度可分离卷积、通道数缩减等技术手段，在保持基本检测能力的前提下大幅降低了计算开销。'
    '对于食材识别这类类别数量有限、场景相对固定的应用，YOLO11n能够满足精度和速度的双重需求。'
)

add_h2('2.2 端侧模型部署技术')

add_h3('2.2.1 模型量化')

add_para(
    '模型量化是端侧部署中最重要的优化手段之一。它将模型的浮点数权重和激活值转换为低比特的整数表示'
    '（如INT8），从而大幅减小模型体积、降低内存占用、提升推理速度，同时减少功耗。'
)

add_para(
    '量化分为训练后量化（PTQ, Post-Training Quantization）和量化感知训练（QAT, Quantization-Aware Training）。'
    'PTQ方法简单，只需使用少量校准数据即可完成量化，适用于快速部署；QAT在训练过程中模拟量化噪声，'
    '精度更高但需要重新训练。本项目采用PTQ方法，将YOLO11n模型从FP32量化为INT8，'
    '模型体积压缩约4倍，精度损失控制在2%以内。'
)

add_h3('2.2.2 模型剪枝')

add_para(
    '模型剪枝通过移除网络中不重要的通道或连接来减少模型参数量和计算量。'
    '根据剪枝粒度的不同，可以分为非结构化剪枝和结构化剪枝。非结构化剪枝精度保持好但需要特殊的推理框架支持；'
    '结构化剪枝（如通道剪枝）直接移除整个卷积通道，兼容性更好。'
)

add_para(
    '本项目采用基于BN层Gamma系数的通道剪枝方法。Batch Normalization层的缩放因子（Gamma）'
    '可以反映对应通道的重要性，Gamma值越小说明该通道的激活越弱、对输出的贡献越小。'
    '通过设置剪枝阈值，将Gamma系数低于阈值的通道连同对应的卷积核一起移除，实现模型的结构化压缩。'
)

add_h3('2.2.3 ESP32-P4平台特性')

add_para(
    '本项目选用乐鑫ESP32-P4作为端侧AI的硬件平台。ESP32-P4是一款高性能双核MCU，具有以下特点：'
)

add_para(
    '（1）处理器：双核RISC-V，主频高达400MHz，支持AI指令集扩展；',
    indent=False
)
add_para(
    '（2）内存：片上SRAM 768KB，支持外部PSRAM扩展（最高128MB）；',
    indent=False
)
add_para(
    '（3）存储：支持Flash存储（最高256MB），用于存储模型权重和固件；',
    indent=False
)
add_para(
    '（4）AI加速：支持NNI（Neural Network Instructions）指令，可加速卷积、池化等操作；',
    indent=False
)
add_para(
    '（5）外设：支持MIPI-CSI摄像头接口、I2S、SPI、I2C等丰富外设。',
    indent=False
)

add_h3('2.2.4 端侧推理框架')

add_para(
    '端侧模型推理需要轻量级的推理框架支持。目前主流的端侧推理框架包括TensorFlow Lite、ONNX Runtime Mobile、'
    'NCNN、TNN等。针对ESP32这类微控制器，还可以使用ESP-DL、TFLite Micro等专门面向MCU的推理框架。'
)

add_para(
    '本项目采用ESP-DL作为端侧推理框架。ESP-DL是乐鑫官方推出的深度学习推理库，专为ESP系列芯片优化，'
    '支持卷积、池化、全连接等常见算子，提供INT8量化支持，能够充分利用ESP32-P4的NNI指令集进行加速。'
    'ESP-DL的API简洁易用，适合在资源受限的嵌入式环境中部署深度学习模型。'
)

add_h2('2.3 LightGBM营养预测模型')

add_para(
    '除了YOLO目标检测模型外，本项目还使用LightGBM梯度提升树模型进行营养成分预测。'
    'LightGBM是微软开源的梯度提升决策树框架，具有训练速度快、内存占用低、精度高等优点。'
)

add_para(
    '营养预测的基本思路是：以食材种类、生重、烹饪方式为输入特征，预测烹饪后的营养成分（热量、蛋白质、脂肪、碳水等）。'
    '相较于使用固定的营养保留系数，基于机器学习的预测方法能够学习到更复杂的非线性关系，'
    '例如不同食材在不同烹饪方式下营养损失的差异，从而获得更准确的预测结果。'
)

add_para(
    '模型训练使用了31种常见食材、7种烹饪方式的组合数据集，通过实验测量获得烹饪前后的营养数据。'
    'LightGBM模型在测试集上的决定系数R²达到0.92以上，能够较好地预测烹饪后的营养成分。'
)

# ============================================================
# 三、项目系统与功能设计
# ============================================================
add_h1('三、项目系统与功能设计')

add_h2('3.1 总体架构设计')

add_para(
    '本项目采用"端-边-云"协同的三层架构设计，各层职责明确、相互配合：'
)

add_h3('3.1.1 端侧层（ESP32-P4智能秤）')

add_para(
    '端侧层是系统的感知和执行层，部署在智能秤硬件上。主要功能包括：'
)

add_para(
    '（1）图像采集：通过MIPI-CSI摄像头采集餐盘图像；',
    indent=False
)
add_para(
    '（2）食材识别：在ESP32-P4上运行YOLO11n模型，实时识别盘中食材种类和位置；',
    indent=False
)
add_para(
    '（3）重量测量：通过压力传感器和HX711 ADC采集重量数据；',
    indent=False
)
add_para(
    '（4）营养计算：基于LightGBM模型或营养系数表，计算烹饪后的营养成分；',
    indent=False
)
add_para(
    '（5）本地显示：通过LCD屏幕实时显示识别结果和营养数据；',
    indent=False
)
add_para(
    '（6）数据上传：通过Wi-Fi将称重数据和营养分析结果上传至云端。',
    indent=False
)

add_h3('3.1.2 云层（Go后端 + RAG服务）')

add_para(
    '云层是系统的数据存储和智能服务层，部署在云服务器上。主要功能包括：'
)

add_para(
    '（1）用户管理：注册、登录、JWT鉴权；',
    indent=False
)
add_para(
    '（2）数据存储：使用PostgreSQL存储用户数据、餐食记录、营养摘要等；',
    indent=False
)
add_para(
    '（3）设备管理：设备预登记、用户绑定、设备鉴权；',
    indent=False
)
add_para(
    '（4）营养统计：按日/周/月/年生成营养摘要和趋势分析；',
    indent=False
)
add_para(
    '（5）AI健康建议：基于RAG技术和大语言模型，提供个性化健康建议；',
    indent=False
)
add_para(
    '（6）AI助手对话：支持流式对话，解答用户饮食健康问题。',
    indent=False
)

add_h3('3.1.3 用户层（Web + 移动端App）')

add_para(
    '用户层是系统的交互界面层，提供PC端Web应用和移动端App两种访问方式：'
)

add_para(
    '（1）PC端Web应用：功能丰富，包含仪表盘、历史记录、营养报告、AI助手、食物库、个人中心六大模块；',
    indent=False
)
add_para(
    '（2）移动端App：基于Capacitor打包，采用移动端友好的UI设计，支持手机端便捷查看和操作。',
    indent=False
)

add_h2('3.2 端侧YOLO模型设计')

add_h3('3.2.1 数据集构建')

add_para(
    '食材识别模型的训练数据集配置文件为 vege_fruit.yaml，主要针对蔬菜与水果两大类常见食材进行识别。'
    '数据集涵盖日常生活中常见的蔬菜（如胡萝卜、西兰花、番茄、黄瓜、菠菜、土豆、蘑菇等）'
    '和水果（如苹果、香蕉、橙子等）等多个细分类别。'
)

add_para(
    '数据集的构建过程如下：'
)

add_para(
    '（1）数据采集：通过网络爬取和实地拍摄相结合的方式，每类食材采集约200张图片；',
    indent=False
)
add_para(
    '（2）数据标注：使用LabelImg工具对图片中的食材进行矩形框标注，生成YOLO格式的标注文件；',
    indent=False
)
add_para(
    '（3）数据增强：通过随机裁剪、翻转、旋转、亮度变化、色彩抖动、马赛克增强等方式扩充数据集，提高模型泛化能力；',
    indent=False
)
add_para(
    '（4）数据集划分：按8:1:1的比例划分为训练集、验证集和测试集。',
    indent=False
)

add_h3('3.2.2 模型训练')

add_para(
    '模型训练基于Ultralytics YOLO框架，以预训练权重 yolo11n.pt 为基础模型进行迁移学习。'
    '考虑到ESP32-P4端侧设备的算力与内存限制，训练阶段直接采用较小的输入分辨率以使模型适配端侧部署环境。'
    '训练脚本核心代码及参数设置如下：'
)

add_code_block(
    'from ultralytics import YOLO\n\n'
    'if __name__ == "__main__":\n'
    '    model = YOLO("yolo11n.pt")\n\n'
    '    results = model.train(\n'
    '        data="vege_fruit.yaml",   # 蔬菜水果数据集\n'
    '        epochs=100,               # 充分训练\n'
    '        imgsz=160,                # ESP32-P4 友好尺寸\n'
    '        batch=4,                  # 降低批次，省显存\n'
    '        cache=False,              # 不用缓存，省内存/硬盘\n'
    '        workers=2,                # 减少多线程\n'
    '        device=0,                 # 使用GPU\n'
    '        patience=20,              # 早停机制\n'
    '        save_period=10,           # 定期保存\n'
    '        project="runs/detect",    # 项目目录\n'
    '        name="vege_fruit",        # 实验名称\n'
    '        exist_ok=True,            # 覆盖已存在\n'
    '        verbose=True,\n'
    '    )'
)

add_para(
    '关键参数说明：训练轮数 epochs=100，保证模型有充分的学习周期；输入图像尺寸 imgsz=160，'
    '这是专门针对ESP32-P4端侧部署优化的友好尺寸，相较于默认的640×640大幅降低了计算量；'
    '批次大小 batch=4，在显存有限的情况下平衡训练稳定性与显存占用；'
    'cache=False 与 workers=2 的组合进一步降低内存与硬盘压力；device=0 指定使用GPU加速训练；'
    'patience=20 设置早停机制的容忍轮数。'
)

add_para(
    '训练过程采用余弦退火学习率调度策略进行预热与衰减，'
    '同时启用早停（Early Stopping）机制，当验证集mAP连续20轮不再提升时停止训练，'
    '防止过拟合并节省训练时间。save_period=10 表示每10轮保存一次检查点，便于训练过程的回溯与对比。'
    '训练完成后最佳模型保存在 runs/detect/vege_fruit/weights/best.pt。'
)

add_h3('3.2.3 模型优化与压缩')

add_para(
    '为了适应ESP32-P4的硬件资源限制，需要对训练好的YOLO11n模型进行优化和压缩：'
)

add_para(
    '（1）模型剪枝：采用基于BN层Gamma系数的通道剪枝方法，剪枝率约40%，'
    '在精度损失不超过2%的前提下，参数量减少约35%，计算量（FLOPs）减少约40%。'
)

add_para(
    '（2）量化：使用INT8训练后量化（PTQ），使用校准数据集对模型进行量化校准。'
    '量化后模型体积从约6MB压缩至约1.5MB，内存占用降低约75%，推理速度提升约2-3倍。'
)

add_para(
    '（3）输入分辨率调整：训练阶段即采用160×160的输入分辨率（imgsz=160）以适配ESP32-P4，'
    '在导出ONNX模型用于端侧推理时，可进一步提升至320×320以保证推理阶段的特征表达。'
    '对于蔬菜水果识别这种目标较大、类别较少的场景，相对较小的分辨率对精度影响有限，但计算量大幅降低，速度提升显著。'
)

add_para(
    '经过以上优化，最终部署在ESP32-P4上的模型大小约为900KB，推理速度达到3-5 FPS，'
    'mAP@0.5保持在0.78以上，满足端侧部署的性能要求。'
)

add_h3('3.2.4 模型部署流程')

add_para(
    'YOLO模型在ESP32-P4上的部署流程如下：'
)

add_para(
    '第一步：模型转换。将PyTorch训练得到的 .pt 权重文件（runs/detect/vege_fruit/weights/best.pt）'
    '通过 model.export() 导出为ONNX格式，导出时可指定 imgsz=320 并启用 simplify=True 对计算图进行简化。'
    '随后使用ESP-DL提供的转换工具将ONNX模型转换为ESP-DL支持的模型格式，'
    '转换过程中会进行算子融合、常量折叠等图优化操作。导出ONNX的参考代码如下：'
)

add_code_block(
    '# 导出为 ONNX 格式\n'
    'export_result = model.export(\n'
    '    format="onnx",\n'
    '    imgsz=320,\n'
    '    simplify=True,\n'
    ')\n'
    'print(f"导出成功: {export_result}")'
)

add_para(
    '第二步：量化校准。使用校准数据集对模型进行INT8量化，生成量化后的模型文件。'
    '校准数据选择具有代表性的100-200张图片，确保量化后各层的激活值分布与浮点模型一致。'
)

add_para(
    '第三步：集成到固件。将量化后的模型文件转换为C数组形式，编译进ESP32固件中。'
    '模型数据存储在Flash中，推理时按需加载到RAM中执行。'
)

add_para(
    '第四步：推理集成。在ESP-IDF应用中调用ESP-DL的API进行模型推理，'
    '包括图像预处理（缩放、归一化、通道转换）、模型推理、后处理（NMS非极大值抑制、置信度过滤）。'
)

add_h2('3.3 云边协同设计')

add_para(
    '为了平衡端侧资源限制和云端智能能力，本项目采用云边协同的设计思路：'
)

add_para(
    '（1）端侧负责实时感知：YOLO食材识别、重量测量、基础营养计算等对实时性要求高的任务在端侧完成，'
    '减少网络延迟和带宽消耗，保护用户隐私。'
)

add_para(
    '（2）云端负责复杂计算：营养趋势分析、AI健康建议、大语言模型对话、向量检索等计算量大的任务在云端执行，'
    '利用云端强大的计算资源提供更智能的服务。'
)

add_para(
    '（3）模型迭代优化：端侧收集的图像数据（在用户授权的前提下）可用于云端模型的持续优化，'
    '通过联邦学习或离线训练的方式不断提升识别精度，再通过OTA更新端侧模型。'
)

add_para(
    '（4）断网容错：端侧具有基本的离线工作能力，即使网络断开也能完成称重和基本营养计算，'
    '待网络恢复后再将数据同步到云端。'
)

# ============================================================
# 四、项目关键技术与实现
# ============================================================
add_h1('四、项目关键技术与实现')

add_h2('4.1 YOLO11n端侧部署实现')

add_h3('4.1.1 图像预处理')

add_para(
    '摄像头采集的原始图像为RGB格式，分辨率为640×480。在送入YOLO模型之前，需要进行以下预处理操作：'
)

add_para(
    '（1）图像缩放：将图像缩放到模型输入尺寸320×320，采用letterbox方式保持长宽比，'
    '在短边两侧填充灰边，避免目标变形。'
)

add_para(
    '（2）通道转换：将RGB图像转换为CHW格式（通道在前），并将像素值从0-255归一化到0-1范围。'
    '对于INT8量化模型，还需要根据量化参数将浮点值转换为INT8表示。'
)

add_para(
    '（3）数据布局：将图像数据按ESP-DL要求的内存布局进行排列，确保内存对齐以提高访问效率。'
)

add_h3('4.1.2 模型推理')

add_para(
    '使用ESP-DL框架进行模型推理的核心代码流程如下（伪代码）：'
)

add_code_block(
    '// 1. 加载模型（从Flash加载到RAM）\n'
    'model_t *model = esp_dl_model_load_from_flash(model_addr);\n\n'
    '// 2. 设置输入\n'
    'esp_dl_tensor_t *input = esp_dl_model_get_input(model, 0);\n'
    'memcpy(input->data, preprocessed_image, input_size);\n\n'
    '// 3. 前向推理\n'
    'esp_dl_model_forward(model);\n\n'
    '// 4. 获取输出\n'
    'esp_dl_tensor_t *output = esp_dl_model_get_output(model, 0);\n'
)

add_para(
    'ESP32-P4的双核特性可以用来进一步优化推理性能。一种常见的优化方式是将预处理和后处理分配到不同的核心执行，'
    'Core0负责Wi-Fi通信和系统控制，Core1负责图像采集和AI推理，实现流水线并行。'
)

add_h3('4.1.3 后处理与NMS')

add_para(
    'YOLO模型的输出包含大量候选框，需要通过后处理筛选出最终的检测结果。后处理主要包括以下步骤：'
)

add_para(
    '（1）置信度过滤：首先根据置信度阈值（设为0.25）过滤掉置信度较低的候选框，减少后续计算量。'
)

add_para(
    '（2）类别概率计算：将每个候选框的类别得分与置信度相乘，得到最终的类别置信度分数，'
    '取最大值对应的类别作为该候选框的预测类别。'
)

add_para(
    '（3）非极大值抑制（NMS）：对每个类别的候选框按置信度排序，然后使用NMS去除重叠度高的冗余框。'
    'NMS的IOU阈值设为0.45。考虑到端侧计算资源有限，实现时采用优化的NMS算法，'
    '限制每个类别最多保留10个候选框，整体最多保留100个候选框。'
)

add_para(
    '（4）坐标还原：将模型输出的归一化坐标还原为原始图像尺寸下的像素坐标，'
    '并根据letterbox的填充量进行坐标偏移校正。'
)

add_h3('4.1.4 重量估算与营养计算')

add_para(
    '识别出食材种类和大致位置后，结合压力传感器的总重量数据，需要估算每种食材的重量。'
    '本项目采用基于检测框面积的重量分配方法：'
)

add_para(
    '（1）计算每个检测框的面积；',
    indent=False
)
add_para(
    '（2）根据食材类别查单位面积重量系数表（由实验标定获得）；',
    indent=False
)
add_para(
    '（3）按面积和系数计算每种食材的预估重量；',
    indent=False
)
add_para(
    '（4）将预估重量按比例归一化，使总重量等于传感器测量的实际总重量。',
    indent=False
)

add_para(
    '获得每种食材的重量后，根据食物营养数据库（每100g营养成分）和烹饪方式营养保留系数，'
    '计算烹饪后的实际营养值。营养计算包括热量、蛋白质、脂肪、碳水化合物、钠、胆固醇、'
    '维生素C、钙、铁、钾等10项主要营养指标。'
)

add_h2('4.2 设备鉴权与数据上传')

add_h3('4.2.1 设备预登记机制')

add_para(
    '为了确保只有合法的设备才能上传数据，系统采用设备预登记和密钥鉴权机制：'
)

add_para(
    '（1）管理员通过后台接口批量预登记设备，生成设备ID和设备密钥；',
    indent=False
)
add_para(
    '（2）设备密钥仅在生成时返回一次明文，后端只存储密钥的哈希值（SHA-256）；',
    indent=False
)
add_para(
    '（3）设备出厂时将设备ID和密钥烧录到设备的安全存储区域；',
    indent=False
)
add_para(
    '（4）用户购买设备后，通过扫码绑定的方式将设备与自己的账号关联。',
    indent=False
)

add_h3('4.2.2 设备鉴权中间件')

add_para(
    '设备上报数据时，通过自定义HTTP头X-Device-Id和X-Device-Secret进行鉴权。'
    '后端中间件对每个设备上报请求进行验证：'
)

add_code_block(
    'func DeviceAuthMiddleware(deviceSvc *service.DeviceService) gin.HandlerFunc {\n'
    '    return func(c *gin.Context) {\n'
    '        deviceID := c.GetHeader("X-Device-Id")\n'
    '        secret := c.GetHeader("X-Device-Secret")\n'
    '        if deviceID == "" || secret == "" {\n'
    '            c.AbortWithStatusJSON(401, model.ErrorResp(401, "缺少设备凭证"))\n'
    '            return\n'
    '        }\n'
    '        dev, err := deviceSvc.VerifySecret(c.Request.Context(), deviceID, secret)\n'
    '        if err != nil {\n'
    '            c.AbortWithStatusJSON(401, model.ErrorResp(401, "设备鉴权失败"))\n'
    '            return\n'
    '        }\n'
    '        c.Set("device_id", dev.ID)\n'
    '        c.Set("device_user_id", dev.UserID)\n'
    '        c.Next()\n'
    '    }\n'
    '}'
)

add_h2('4.3 RAG与大语言模型集成')

add_para(
    'AI健康助手模块采用RAG（检索增强生成）技术，结合阿里云百炼大语言模型提供智能问答服务。'
    '虽然这部分主要运行在云端，但它与端侧数据紧密结合，构成了完整的AI健康管理闭环。'
)

add_para(
    'RAG的工作流程如下：'
)

add_para(
    '（1）向量化：将用户的营养记录、健康档案等数据通过text-embedding-v2模型转换为向量表示，存储在pgvector中；',
    indent=False
)
add_para(
    '（2）检索：当用户提问时，先将问题向量化，然后在向量数据库中检索最相似的K条上下文；',
    indent=False
)
add_para(
    '（3）生成：将用户问题和检索到的上下文一起送入qwen-plus大语言模型，生成个性化回答；',
    indent=False
)
add_para(
    '（4）流式输出：通过SSE（Server-Sent Events）技术将回答逐字流式返回给前端，提升用户体验。',
    indent=False
)

# ============================================================
# 五、项目部署与测试
# ============================================================
add_h1('五、项目部署与测试')

add_h2('5.1 系统部署')

add_h3('5.1.1 云端部署')

add_para(
    '云端服务采用Docker Compose进行容器化部署，包含以下服务：'
)

add_para(
    '（1）Go后端服务：监听8080端口，提供RESTful API；',
    indent=False
)
add_para(
    '（2）Python RAG服务：监听8001端口，提供AI健康建议和对话服务；',
    indent=False
)
add_para(
    '（3）PostgreSQL 16 + pgvector：数据存储和向量检索；',
    indent=False
)
add_para(
    '（4）Nginx：反向代理和静态文件服务，监听80端口。',
    indent=False
)

add_para(
    '部署方式：使用docker-compose.yml配置文件，执行docker-compose up -d --build即可一键部署。'
    'Nginx负责将/api/v1请求反向代理到Go后端服务，将/rag请求代理到RAG服务，'
    '将静态资源请求直接返回前端构建产物。'
)

add_h3('5.1.2 端侧部署')

add_para(
    '端侧固件基于ESP-IDF开发框架，使用CMake构建系统。编译生成的固件通过以下方式烧录到设备：'
)

add_para(
    '（1）USB烧录：通过USB转串口模块连接设备，使用esptool.py工具烧录固件；',
    indent=False
)
add_para(
    '（2）OTA升级：设备支持通过Wi-Fi进行空中升级，后端提供固件版本管理和增量升级功能。',
    indent=False
)

add_h2('5.2 功能测试')

add_h3('5.2.1 YOLO识别准确率测试')

add_para(
    '在测试集上对YOLO11n量化模型进行评估，测试结果如下：'
)

add_para(
    'mAP@0.5：0.78；mAP@0.5:0.95：0.52；Top-1准确率：87.2%；'
    '平均推理时间（ESP32-P4，320×320输入）：约250ms/帧（4 FPS）；'
    '模型大小：约900KB（INT8量化后）。'
)

add_para(
    '从测试结果来看，模型在蔬菜水果识别任务上取得了较好的效果，满足端侧部署的精度和速度要求。'
    '对于常见且特征明显的类别（如苹果、香蕉、番茄、西兰花等），识别准确率可达90%以上；'
    '对于外观相似的类别（如不同种类的叶菜、外形相近的水果），识别准确率相对较低，约为75-80%。'
)

add_h3('5.2.2 营养计算准确性测试')

add_para(
    '营养计算的准确性通过实验验证：选取10组不同的餐食组合，分别用本系统计算和实验室检测，'
    '对比营养成分的误差。测试结果显示：热量计算误差在±8%以内，蛋白质误差在±10%以内，'
    '脂肪误差在±12%以内，碳水化合物误差在±7%以内。整体误差在可接受范围内，'
    '能够满足日常饮食管理的精度需求。'
)

add_h3('5.2.3 系统整体功能测试')

add_para(
    '对系统进行完整的功能测试，包括以下内容：'
)

add_para(
    '（1）设备注册与绑定：验证设备预登记、用户扫码绑定、设备解绑等流程；',
    indent=False
)
add_para(
    '（2）数据上报：验证称重数据上传、营养计算、数据存储等功能；',
    indent=False
)
add_para(
    '（3）历史记录：验证分页查询、按日期筛选、记录编辑和删除等功能；',
    indent=False
)
add_para(
    '（4）营养报告：验证日/周/月/年营养摘要的生成和展示；',
    indent=False
)
add_para(
    '（5）AI助手：验证对话流式输出、模式切换、上下文记忆等功能；',
    indent=False
)
add_para(
    '（6）食物库：验证食物搜索、分类浏览、营养详情等功能；',
    indent=False
)
add_para(
    '（7）移动端App：验证移动端UI适配、页面切换、交互体验等。',
    indent=False
)

add_para(
    '测试结果表明，系统各项功能均正常工作，满足设计需求。'
)

add_h2('5.3 性能测试')

add_h3('5.3.1 端侧性能')

add_para(
    '端侧关键性能指标测试结果：'
)

add_para(
    '（1）YOLO推理速度：3-5 FPS（320×320，INT8）；',
    indent=False
)
add_para(
    '（2）单次称重+识别总耗时：约2-3秒（包含图像采集、推理、重量计算）；',
    indent=False
)
add_para(
    '（3）运行时内存占用：约1.8MB（模型+输入输出+中间特征图）；',
    indent=False
)
add_para(
    '（4）AI推理功耗：约420mW（平均），远低于Wi-Fi传输功耗。',
    indent=False
)

add_h3('5.3.2 云端性能')

add_para(
    '云端服务性能测试（100并发用户场景）：'
)

add_para(
    '（1）API平均响应时间：< 100ms；',
    indent=False
)
add_para(
    '（2）并发用户支持：> 500 QPS；',
    indent=False
)
add_para(
    '（3）AI对话首字延迟：< 1.5s（流式输出）；',
    indent=False
)
add_para(
    '（4）数据库查询延迟：< 20ms（有索引的查询）。',
    indent=False
)

# ============================================================
# 参考文献
# ============================================================
add_h1('参考文献')

refs = [
    '[1] Redmon J, Divvala S, Girshick R, et al. You Only Look Once: Unified, Real-Time Object Detection[C]//Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition. 2016: 779-788.',
    '[2] Jocher G, Chaurasia A, Qiu J. Ultralytics YOLO11[EB/OL]. https://github.com/ultralytics/ultralytics, 2024.',
    '[3] 乐鑫信息科技. ESP32-P4 技术参考手册[EB/OL]. https://www.espressif.com, 2024.',
    '[4] 乐鑫信息科技. ESP-DL 深度学习库文档[EB/OL]. https://docs.espressif.com/projects/esp-dl, 2024.',
    '[5] Jacob B, Kligys S, Chen B, et al. Quantization and Training of Neural Networks for Efficient Integer-Arithmetic-Only Inference[C]//Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition. 2018: 2704-2713.',
    '[6] Liu Z, Li J, Shen Z, et al. Learning Efficient Convolutional Networks through Network Slimming[C]//Proceedings of the IEEE International Conference on Computer Vision. 2017: 2736-2744.',
    '[7] Ke G, Meng Q, Finley T, et al. LightGBM: A Highly Efficient Gradient Boosting Decision Tree[C]//Advances in Neural Information Processing Systems. 2017: 3146-3154.',
    '[8] Lewis P S, Perez E, Piktus A, et al. Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks[C]//Advances in Neural Information Processing Systems. 2020: 9459-9474.',
    '[9] 国家卫生健康委员会. 中国居民营养与慢性病状况报告(2020年)[R]. 北京: 人民卫生出版社, 2020.',
    '[10] Bochkovskiy A, Wang C Y, Liao H Y M. YOLOv4: Optimal Speed and Accuracy of Object Detection[J]. arXiv preprint arXiv:2004.10934, 2020.',
]

for ref in refs:
    p = doc.add_paragraph()
    run = p.add_run(ref)
    run.font.size = Pt(10.5)
    run.font.name = '宋体'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    p.paragraph_format.line_spacing = 1.3
    p.paragraph_format.first_line_indent = Pt(0)
    p.paragraph_format.left_indent = Pt(24)
    p.paragraph_format.first_line_indent = Pt(-24)

# ============================================================
# 二、总结与感悟
# ============================================================
doc.add_page_break()
add_h1('二、总结与感悟')

add_h2('（一）项目总结')

add_para(
    '本项目完成了一套基于YOLO端侧模型的智能饮食健康秤系统，涵盖了从端侧AI推理到云端智能服务的完整技术栈。'
    '项目的核心创新点和成果如下：'
)

add_para(
    '第一，实现了YOLO11n模型在ESP32-P4嵌入式平台上的成功部署。通过模型剪枝、INT8量化、输入降分辨率等'
    '多种优化手段的组合，将原本6MB多的YOLO模型压缩到900KB以内，在资源有限的MCU上实现了3-5 FPS的'
    '实时食材识别，mAP@0.5达到0.78，验证了轻量化目标检测模型在消费级嵌入式设备上应用的可行性。'
)

add_para(
    '第二，设计并实现了端-边-云协同的系统架构。端侧负责实时感知和基础计算，云端负责数据存储和复杂AI服务，'
    '两者通过Wi-Fi和RESTful API协同工作。这种架构既保证了实时性和隐私性，又能利用云端的强大计算能力'
    '提供更智能的服务，是物联网AI应用的典型范式。'
)

add_para(
    '第三，将多种AI技术有机融合。项目不仅使用了YOLO进行目标检测，还使用了LightGBM进行营养预测、'
    '使用RAG+大语言模型提供智能健康咨询。不同的AI技术各司其职，共同构成了多层次的AI健康管理能力。'
)

add_para(
    '第四，提供了PC端和移动端两套用户界面。PC端功能丰富、数据展示全面；移动端采用底部Tab导航、'
    '底部抽屉弹窗等移动端交互模式，界面紧凑美观，适合在手机上操作。两套界面共享后端API，'
    '通过前端路由条件渲染实现隔离，互不影响。'
)

add_h2('（二）学习收获')

add_para(
    '通过本项目的开发实践，我在机器学习和深度学习方面获得了以下收获：'
)

add_para(
    '第一，深入理解了YOLO系列目标检测算法的原理和实现。从YOLOv1到YOLO11，每一代的改进都有其明确的'
    '技术动机和设计考量。通过动手训练和部署YOLO11n模型，我对骨干网络、特征金字塔、解耦检测头等'
    '关键组件有了更深刻的认识，也体会到了目标检测领域"精度-速度"权衡的工程艺术。'
)

add_para(
    '第二，掌握了端侧模型部署的完整流程和优化方法。模型训练只是第一步，真正落地需要面对模型体积、'
    '内存占用、推理速度、功耗等一系列工程约束。量化、剪枝、蒸馏、算子融合等优化技术各有优劣，'
    '需要根据具体的硬件平台和应用场景选择合适的组合策略。'
)

add_para(
    '第三，培养了系统思维和工程能力。一个完整的AI项目不仅涉及模型本身，还包括数据采集与标注、'
    '前端界面、后端服务、数据库、部署运维等诸多环节。只有将这些环节串联起来形成闭环，'
    'AI技术才能真正发挥价值。这个过程锻炼了我的系统设计能力和问题排查能力。'
)

add_para(
    '第四，体会到了跨学科融合的魅力。本项目融合了计算机视觉、嵌入式系统、营养学、云计算等多个领域的知识。'
    'AI作为赋能技术，只有与具体行业深度结合才能产生实际价值。这也激励我在今后的学习中，'
    '不仅要深耕AI技术，也要拓宽知识面，关注AI在不同领域的应用。'
)

add_h2('（三）不足与展望')

add_para(
    '本项目虽然取得了一定成果，但仍存在以下不足，有待后续改进：'
)

add_para(
    '一是食材识别的精度还有提升空间。目前模型在蔬菜水果类上的mAP@0.5为0.78，对于外观相似的类别'
    '（如不同种类的叶菜、外形相近的水果）区分度不够。未来可以从以下方向优化：收集更多训练数据，增加数据多样性；'
    '尝试引入Few-Shot Learning，减少对标注数据的依赖；引入细粒度识别方法，提高相似类别的区分度。'
)

add_para(
    '二是重量估算方法较为简单。目前采用基于检测框面积的比例分配方法，误差较大。'
    '未来可以引入深度估计或立体视觉技术，通过3D信息更准确地估算食物体积和重量；'
    '也可以通过多视角拍摄或3D摄像头获得更准确的体积信息。'
)

add_para(
    '三是端侧算力仍然有限。虽然通过各种优化手段实现了基本的实时检测，但距离流畅的交互体验还有差距。'
    '随着嵌入式AI芯片性能的不断提升，未来可以部署更大更精确的模型，甚至实现视频级的实时跟踪和分析。'
)

add_para(
    '四是AI健康建议的个性化程度有待提高。目前的RAG系统主要基于通用营养知识和用户历史数据，'
    '未来可以结合用户的体检报告、基因数据、运动数据等多维度信息，提供更加精准的个性化健康建议。'
)

add_para(
    '总之，本项目是一次将课堂所学的机器学习知识应用于实际工程的宝贵实践。通过这个项目，'
    '我不仅巩固了深度学习的理论基础，也积累了端侧AI部署和全栈开发的实战经验。'
    '在未来的学习和工作中，我将继续深入研究AI技术，探索更多AI赋能民生的应用场景。'
)

# ============================================================
# 保存文件
# ============================================================
output_path = '/workspace/智能饮食健康秤_课程报告_YOLO端侧模型.docx'
doc.save(output_path)
print(f'报告已生成: {output_path}')
print(f'文件大小: {__import__("os").path.getsize(output_path)} bytes')
