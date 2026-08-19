// ============================================================
// 体检报告后端数据适配器
// 把 /rag/parse-medical-report 返回的多模态 OCR 结果
// 转换为规则引擎可用的 Indicator[]
// （指标名别名映射 + 参考范围字符串解析）
// ============================================================

import type { Indicator, IndicatorGroup } from "./medical-rules"

/** 后端多模态解析返回的原始指标 */
export interface RawMedicalIndicator {
  name?: string
  value?: string | number
  unit?: string
  normal_range?: string
  status?: string
}

export interface RawMedicalReport {
  report_date?: string
  indicators?: RawMedicalIndicator[]
  summary_text?: string
}

/** 已知指标字典：别名（规范化后）-> 标准定义 */
interface KnownDef {
  code: string
  name: string
  group: IndicatorGroup
  unit?: string
  refLow?: number
  refHigh?: number
  criticalFactor?: number
}

const KNOWN: Record<string, KnownDef> = {
  // 血压
  "收缩压": { code: "SBP", name: "收缩压", group: "血压", unit: "mmHg", refLow: 90, refHigh: 139, criticalFactor: 1.15 },
  "高压": { code: "SBP", name: "收缩压", group: "血压", unit: "mmHg", refLow: 90, refHigh: 139, criticalFactor: 1.15 },
  "舒张压": { code: "DBP", name: "舒张压", group: "血压", unit: "mmHg", refLow: 60, refHigh: 89, criticalFactor: 1.15 },
  "低压": { code: "DBP", name: "舒张压", group: "血压", unit: "mmHg", refLow: 60, refHigh: 89, criticalFactor: 1.15 },
  // 血糖
  "空腹血糖": { code: "FPG", name: "空腹血糖", group: "血糖", unit: "mmol/L", refLow: 3.9, refHigh: 6.1, criticalFactor: 1.15 },
  "血糖": { code: "FPG", name: "空腹血糖", group: "血糖", unit: "mmol/L", refLow: 3.9, refHigh: 6.1, criticalFactor: 1.15 },
  "fpg": { code: "FPG", name: "空腹血糖", group: "血糖", unit: "mmol/L", refLow: 3.9, refHigh: 6.1, criticalFactor: 1.15 },
  "糖化血红蛋白": { code: "HbA1c", name: "糖化血红蛋白", group: "血糖", unit: "%", refLow: 4.0, refHigh: 6.0 },
  "hba1c": { code: "HbA1c", name: "糖化血红蛋白", group: "血糖", unit: "%", refLow: 4.0, refHigh: 6.0 },
  "空腹胰岛素": { code: "INS", name: "空腹胰岛素", group: "血糖", unit: "μIU/ml", refLow: 2.6, refHigh: 24.9 },
  "胰岛素": { code: "INS", name: "空腹胰岛素", group: "血糖", unit: "μIU/ml", refLow: 2.6, refHigh: 24.9 },
  // 血脂
  "总胆固醇": { code: "TC", name: "总胆固醇", group: "血脂", unit: "mmol/L", refLow: 3.1, refHigh: 5.2 },
  "tc": { code: "TC", name: "总胆固醇", group: "血脂", unit: "mmol/L", refLow: 3.1, refHigh: 5.2 },
  "胆固醇": { code: "TC", name: "总胆固醇", group: "血脂", unit: "mmol/L", refLow: 3.1, refHigh: 5.2 },
  "甘油三酯": { code: "TG", name: "甘油三酯", group: "血脂", unit: "mmol/L", refLow: 0.4, refHigh: 1.7, criticalFactor: 1.2 },
  "tg": { code: "TG", name: "甘油三酯", group: "血脂", unit: "mmol/L", refLow: 0.4, refHigh: 1.7, criticalFactor: 1.2 },
  "低密度脂蛋白": { code: "LDL", name: "低密度脂蛋白胆固醇", group: "血脂", unit: "mmol/L", refLow: 1.9, refHigh: 3.4, criticalFactor: 1.2 },
  "ldl": { code: "LDL", name: "低密度脂蛋白胆固醇", group: "血脂", unit: "mmol/L", refLow: 1.9, refHigh: 3.4, criticalFactor: 1.2 },
  "ldlc": { code: "LDL", name: "低密度脂蛋白胆固醇", group: "血脂", unit: "mmol/L", refLow: 1.9, refHigh: 3.4, criticalFactor: 1.2 },
  "高密度脂蛋白": { code: "HDL", name: "高密度脂蛋白胆固醇", group: "血脂", unit: "mmol/L", refLow: 1.0, refHigh: 2.2, criticalFactor: 0.3 },
  "hdl": { code: "HDL", name: "高密度脂蛋白胆固醇", group: "血脂", unit: "mmol/L", refLow: 1.0, refHigh: 2.2, criticalFactor: 0.3 },
  "hdlc": { code: "HDL", name: "高密度脂蛋白胆固醇", group: "血脂", unit: "mmol/L", refLow: 1.0, refHigh: 2.2, criticalFactor: 0.3 },
  // 尿酸与代谢
  "尿酸": { code: "UA", name: "血尿酸", group: "尿酸与代谢", unit: "μmol/L", refLow: 200, refHigh: 420, criticalFactor: 1.15 },
  "血尿酸": { code: "UA", name: "血尿酸", group: "尿酸与代谢", unit: "μmol/L", refLow: 200, refHigh: 420, criticalFactor: 1.15 },
  "ua": { code: "UA", name: "血尿酸", group: "尿酸与代谢", unit: "μmol/L", refLow: 200, refHigh: 420, criticalFactor: 1.15 },
  "肌酐": { code: "CR", name: "血肌酐", group: "尿酸与代谢", unit: "μmol/L", refLow: 57, refHigh: 111 },
  "血肌酐": { code: "CR", name: "血肌酐", group: "尿酸与代谢", unit: "μmol/L", refLow: 57, refHigh: 111 },
  "crea": { code: "CR", name: "血肌酐", group: "尿酸与代谢", unit: "μmol/L", refLow: 57, refHigh: 111 },
  // 肝功能
  "谷丙转氨酶": { code: "ALT", name: "谷丙转氨酶", group: "肝功能", unit: "U/L", refLow: 9, refHigh: 50 },
  "alt": { code: "ALT", name: "谷丙转氨酶", group: "肝功能", unit: "U/L", refLow: 9, refHigh: 50 },
  "sgpt": { code: "ALT", name: "谷丙转氨酶", group: "肝功能", unit: "U/L", refLow: 9, refHigh: 50 },
  "谷草转氨酶": { code: "AST", name: "谷草转氨酶", group: "肝功能", unit: "U/L", refLow: 15, refHigh: 40 },
  "ast": { code: "AST", name: "谷草转氨酶", group: "肝功能", unit: "U/L", refLow: 15, refHigh: 40 },
  "sgot": { code: "AST", name: "谷草转氨酶", group: "肝功能", unit: "U/L", refLow: 15, refHigh: 40 },
  "谷氨酰转肽酶": { code: "GGT", name: "γ-谷氨酰转肽酶", group: "肝功能", unit: "U/L", refLow: 10, refHigh: 60 },
  "ggt": { code: "GGT", name: "γ-谷氨酰转肽酶", group: "肝功能", unit: "U/L", refLow: 10, refHigh: 60 },
  "r谷氨酰转肽酶": { code: "GGT", name: "γ-谷氨酰转肽酶", group: "肝功能", unit: "U/L", refLow: 10, refHigh: 60 },
  "总胆红素": { code: "TBIL", name: "总胆红素", group: "肝功能", unit: "μmol/L", refLow: 5.1, refHigh: 21 },
  "tbil": { code: "TBIL", name: "总胆红素", group: "肝功能", unit: "μmol/L", refLow: 5.1, refHigh: 21 },
  // 肿瘤标志物
  "甲胎蛋白": { code: "AFP", name: "甲胎蛋白 AFP", group: "肿瘤标志物", unit: "ng/ml", refLow: 0, refHigh: 7 },
  "afp": { code: "AFP", name: "甲胎蛋白 AFP", group: "肿瘤标志物", unit: "ng/ml", refLow: 0, refHigh: 7 },
  "癌胚抗原": { code: "CEA", name: "癌胚抗原 CEA", group: "肿瘤标志物", unit: "ng/ml", refLow: 0, refHigh: 5 },
  "cea": { code: "CEA", name: "癌胚抗原 CEA", group: "肿瘤标志物", unit: "ng/ml", refLow: 0, refHigh: 5 },
  "糖类抗原199": { code: "CA199", name: "糖类抗原 CA19-9", group: "肿瘤标志物", unit: "U/ml", refLow: 0, refHigh: 37 },
  "糖类抗原19-9": { code: "CA199", name: "糖类抗原 CA19-9", group: "肿瘤标志物", unit: "U/ml", refLow: 0, refHigh: 37 },
  "ca199": { code: "CA199", name: "糖类抗原 CA19-9", group: "肿瘤标志物", unit: "U/ml", refLow: 0, refHigh: 37 },
  "ca19-9": { code: "CA199", name: "糖类抗原 CA19-9", group: "肿瘤标志物", unit: "U/ml", refLow: 0, refHigh: 37 },
  "前列腺特异性抗原": { code: "PSA", name: "前列腺特异性抗原 PSA", group: "肿瘤标志物", unit: "ng/ml", refLow: 0, refHigh: 4 },
  "psa": { code: "PSA", name: "前列腺特异性抗原 PSA", group: "肿瘤标志物", unit: "ng/ml", refLow: 0, refHigh: 4 },
}

/** 规范化指标名：去括号注释/空白/连字符、去「血清」前缀、统一小写英文 */
function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[（(][^（）()]*[)）]/g, "")
    .replace(/[\s\-—–_/]/g, "")
    .replace(/^血清/, "")
    .trim()
}

/** 解析参考范围字符串："200-420" / "3.9~6.1" / "<5.2" / "≤7.0" / "0-4.0" */
function parseRange(range?: string): { low?: number; high?: number } {
  if (!range) return {}
  const s = range.replace(/\s/g, "").replace(/[—–~]/g, "-").replace(/[＜＜]/g, "<").replace(/[＞≥≤＞]/g, (m) => (m === "≤" ? "<" : ">"))
  const m = s.match(/^([\d.]+)-([\d.]+)$/)
  if (m) return { low: parseFloat(m[1]), high: parseFloat(m[2]) }
  const lt = s.match(/^<([\d.]+)$/)
  if (lt) return { high: parseFloat(lt[1]) }
  const gt = s.match(/^>([\d.]+)$/)
  if (gt) return { low: parseFloat(gt[1]) }
  return {}
}

function parseValue(v?: string | number): number | null {
  if (v == null) return null
  if (typeof v === "number") return v
  const m = String(v).replace(/,/g, "").match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

/**
 * 后端原始报告 -> Indicator[]
 * 已知指标用标准 code/分组/参考值；未知指标解析报告上的参考范围，归入「其他」
 */
export function adaptMedicalReport(raw: RawMedicalReport): Indicator[] {
  const list = raw.indicators ?? []
  const out: Indicator[] = []
  const seen = new Set<string>()

  for (const item of list) {
    const rawName = (item.name ?? "").trim()
    if (!rawName) continue
    const value = parseValue(item.value)
    if (value == null) continue

    const norm = normalizeName(rawName)
    const known = KNOWN[norm]
    const range = parseRange(item.normal_range)

    const ind: Indicator = known
      ? {
          code: known.code,
          name: known.name,
          value,
          unit: item.unit || known.unit || "",
          refLow: known.refLow ?? range.low,
          refHigh: known.refHigh ?? range.high,
          criticalFactor: known.criticalFactor,
          group: known.group,
        }
      : {
          code: `X_${norm}`,
          name: rawName,
          value,
          unit: item.unit || "",
          refLow: range.low,
          refHigh: range.high,
          group: "其他" as IndicatorGroup,
        }

    if (seen.has(ind.code)) continue
    seen.add(ind.code)
    out.push(ind)
  }

  return out
}
