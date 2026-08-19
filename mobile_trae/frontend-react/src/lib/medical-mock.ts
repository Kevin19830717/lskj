// ============================================================
// 体检报告演示数据（后端不可用 / 演示时使用）
// ============================================================

import type { Indicator } from "./medical-rules"

export const MOCK_INDICATORS: Indicator[] = [
  { code: "SBP", name: "收缩压", value: 142, unit: "mmHg", refLow: 90, refHigh: 139, criticalFactor: 1.15, group: "血压" },
  { code: "DBP", name: "舒张压", value: 94, unit: "mmHg", refLow: 60, refHigh: 89, criticalFactor: 1.15, group: "血压" },
  { code: "FPG", name: "空腹血糖", value: 7.2, unit: "mmol/L", refLow: 3.9, refHigh: 6.1, criticalFactor: 1.15, group: "血糖" },
  { code: "HbA1c", name: "糖化血红蛋白", value: 6.4, unit: "%", refLow: 4.0, refHigh: 6.0, group: "血糖" },
  { code: "INS", name: "空腹胰岛素", value: 18.6, unit: "μIU/ml", refLow: 2.6, refHigh: 24.9, group: "血糖" },
  { code: "TC", name: "总胆固醇", value: 6.28, unit: "mmol/L", refLow: 3.1, refHigh: 5.2, group: "血脂" },
  { code: "TG", name: "甘油三酯", value: 2.85, unit: "mmol/L", refLow: 0.4, refHigh: 1.7, criticalFactor: 1.2, group: "血脂" },
  { code: "LDL", name: "低密度脂蛋白胆固醇", value: 4.12, unit: "mmol/L", refLow: 1.9, refHigh: 3.4, criticalFactor: 1.2, group: "血脂" },
  { code: "HDL", name: "高密度脂蛋白胆固醇", value: 0.98, unit: "mmol/L", refLow: 1.0, refHigh: 2.2, criticalFactor: 0.3, group: "血脂" },
  { code: "UA", name: "血尿酸", value: 478, unit: "μmol/L", refLow: 200, refHigh: 420, criticalFactor: 1.15, group: "尿酸与代谢" },
  { code: "CR", name: "血肌酐", value: 88, unit: "μmol/L", refLow: 57, refHigh: 111, group: "尿酸与代谢" },
  { code: "ALT", name: "谷丙转氨酶", value: 46, unit: "U/L", refLow: 9, refHigh: 50, group: "肝功能" },
  { code: "AST", name: "谷草转氨酶", value: 38, unit: "U/L", refLow: 15, refHigh: 40, group: "肝功能" },
  { code: "GGT", name: "γ-谷氨酰转肽酶", value: 78, unit: "U/L", refLow: 10, refHigh: 60, group: "肝功能" },
  { code: "AFP", name: "甲胎蛋白 AFP", value: 3.6, unit: "ng/ml", refLow: 0, refHigh: 7, group: "肿瘤标志物" },
  { code: "CEA", name: "癌胚抗原 CEA", value: 5.8, unit: "ng/ml", refLow: 0, refHigh: 5, group: "肿瘤标志物" },
  { code: "CA199", name: "糖类抗原 CA19-9", value: 31, unit: "U/ml", refLow: 0, refHigh: 37, group: "肿瘤标志物" },
  { code: "PSA", name: "前列腺特异性抗原 PSA", value: 2.1, unit: "ng/ml", refLow: 0, refHigh: 4, group: "肿瘤标志物" },
]

export const MOCK_TREND_DATES = ["1月", "2月", "3月", "4月", "5月", "6月"]

export const MOCK_TRENDS: Record<string, number[]> = {
  FPG: [5.2, 5.8, 6.1, 6.3, 6.8, 7.2],
  UA: [380, 402, 425, 446, 462, 478],
  TC: [4.6, 4.9, 5.3, 5.6, 5.9, 6.28],
  TG: [1.2, 1.6, 1.9, 2.2, 2.5, 2.85],
  SBP: [124, 128, 132, 135, 138, 142],
  DBP: [78, 81, 84, 87, 91, 94],
  HbA1c: [5.4, 5.6, 5.8, 6.0, 6.2, 6.4],
  LDL: [2.8, 3.1, 3.3, 3.6, 3.9, 4.12],
}

export const MOCK_AI_SUMMARY =
  "本次体检整体提示代谢综合征倾向：血压、空腹血糖、甘油三酯、尿酸多项达标异常，" +
  "且近半年呈持续上升趋势。糖化血红蛋白 6.4% 处于糖尿病前期区间，联合空腹血糖 7.2 已达到糖尿病诊断参考值，" +
  "建议尽快内分泌科复查确诊。尿酸 478 伴 γ-GT 升高，与饮食结构偏油腻、饮酒相关。肿瘤标志物中 CEA 轻度升高，单次意义有限，建议 1~3 个月后复查观察动态变化。"
