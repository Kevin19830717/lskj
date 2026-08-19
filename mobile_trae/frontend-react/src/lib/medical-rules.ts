// ============================================================
// 体检指标规则引擎（前端版）
// 判断指标状态（正常/偏高/偏低）+ 慢病风险评分
// 与后端规则引擎保持同一套阈值口径
// ============================================================

export type IndicatorStatus = "normal" | "high" | "low" | "critical_high" | "critical_low"

export interface Indicator {
  /** 指标代码 */
  code: string
  /** 中文名 */
  name: string
  /** 检测值 */
  value: number
  /** 单位 */
  unit: string
  /** 参考范围 */
  refLow?: number
  refHigh?: number
  /** 严重程度阈值（超过 refHigh 的该倍数算 critical） */
  criticalFactor?: number
  /** 所属分组 */
  group: IndicatorGroup
}

export type IndicatorGroup =
  | "血压"
  | "血糖"
  | "血脂"
  | "尿酸与代谢"
  | "肝功能"
  | "肿瘤标志物"
  | "其他"

export interface GroupMeta {
  key: IndicatorGroup
  icon: string
  color: string
  desc: string
}

export const GROUP_META: GroupMeta[] = [
  { key: "血压", icon: "🫀", color: "#ef4444", desc: "高血压早筛核心指标" },
  { key: "血糖", icon: "🍬", color: "#f59e0b", desc: "糖尿病早筛核心指标" },
  { key: "血脂", icon: "🩸", color: "#8b5cf6", desc: "高血脂/心血管风险" },
  { key: "尿酸与代谢", icon: "⚡", color: "#06b6d4", desc: "高尿酸/痛风风险" },
  { key: "肝功能", icon: "🟢", color: "#10b981", desc: "肝脏代谢功能" },
  { key: "肿瘤标志物", icon: "🔍", color: "#ec4899", desc: "癌症早筛参考指标" },
  { key: "其他", icon: "🧪", color: "#64748b", desc: "其他检验指标" },
]

/** 判断单个指标状态 */
export function judgeIndicator(ind: Indicator): IndicatorStatus {
  const factor = ind.criticalFactor ?? 1.2
  if (ind.refHigh != null) {
    if (ind.value > ind.refHigh * factor) return "critical_high"
    if (ind.value > ind.refHigh) return "high"
  }
  if (ind.refLow != null) {
    if (ind.value < ind.refLow / factor) return "critical_low"
    if (ind.value < ind.refLow) return "low"
  }
  return "normal"
}

export const STATUS_META: Record<
  IndicatorStatus,
  { label: string; color: string; bg: string; arrow: string }
> = {
  normal: { label: "正常", color: "#059669", bg: "rgba(16,185,129,0.10)", arrow: "" },
  high: { label: "偏高", color: "#d97706", bg: "rgba(245,158,11,0.12)", arrow: "↑" },
  low: { label: "偏低", color: "#0284c7", bg: "rgba(14,165,233,0.10)", arrow: "↓" },
  critical_high: { label: "显著偏高", color: "#dc2626", bg: "rgba(239,68,68,0.12)", arrow: "↑↑" },
  critical_low: { label: "显著偏低", color: "#b91c1c", bg: "rgba(239,68,68,0.10)", arrow: "↓↓" },
}

// ============================================================
// 慢病风险评分
// ============================================================

export type RiskLevel = "low" | "medium" | "high"

export interface RiskAssessment {
  /** 疾病 key */
  key: string
  name: string
  icon: string
  /** 0-100 */
  score: number
  level: RiskLevel
  /** 触发风险的异常指标证据 */
  evidence: { name: string; value: string; status: IndicatorStatus }[]
  /** 干预建议 */
  advice: string
  /** 就医提醒（红牌时） */
  alert?: string
}

export const RISK_LEVEL_META: Record<
  RiskLevel,
  { label: string; color: string; grad: string; emoji: string }
> = {
  low: { label: "低风险", color: "#10b981", grad: "from-emerald-500 to-green-400", emoji: "🌿" },
  medium: { label: "中风险", color: "#f59e0b", grad: "from-amber-500 to-yellow-400", emoji: "⚠️" },
  high: { label: "高风险", color: "#ef4444", grad: "from-red-500 to-rose-400", emoji: "🚨" },
}

interface RiskRule {
  key: string
  name: string
  icon: string
  advice: string
  alert?: string
  /** 参与评分的指标：code -> (权重, 打分函数) */
  factors: {
    code: string
    weight: number
    /** 返回 0~1 的危险度 */
    danger: (v: number) => number
  }[]
}

// 规则表：数值参考《中国高血压防治指南》《中国2型糖尿病防治指南》等
const RISK_RULES: RiskRule[] = [
  {
    key: "hypertension",
    name: "高血压风险",
    icon: "🫀",
    advice: "限盐（每日<5g）、控体重、规律有氧运动，家庭自测血压并记录趋势。",
    alert: "血压达 2 级水平，建议心内科就诊评估靶器官损害。",
    factors: [
      { code: "SBP", weight: 0.6, danger: (v) => clampScore((v - 110) / 60) },
      { code: "DBP", weight: 0.4, danger: (v) => clampScore((v - 70) / 40) },
    ],
  },
  {
    key: "diabetes",
    name: "糖尿病风险",
    icon: "🍬",
    advice: "控制精制碳水与含糖饮料，增加全谷物和膳食纤维，餐后散步 15 分钟。",
    alert: "空腹血糖≥7.0 达糖尿病诊断参考值，建议内分泌科复查 OGTT + 糖化血红蛋白。",
    factors: [
      { code: "FPG", weight: 0.7, danger: (v) => clampScore((v - 4.8) / 3.2) },
      { code: "HbA1c", weight: 0.3, danger: (v) => clampScore((v - 5.2) / 2.0) },
    ],
  },
  {
    key: "dyslipidemia",
    name: "高血脂风险",
    icon: "🩸",
    advice: "减少饱和脂肪与油炸食品，每周吃 2 次深海鱼，燕麦等可溶性膳食纤维有助降 LDL。",
    factors: [
      { code: "TC", weight: 0.25, danger: (v) => clampScore((v - 4.0) / 2.8) },
      { code: "TG", weight: 0.3, danger: (v) => clampScore((v - 1.0) / 2.6) },
      { code: "LDL", weight: 0.45, danger: (v) => clampScore((v - 2.6) / 1.9) },
    ],
  },
  {
    key: "hyperuricemia",
    name: "高尿酸风险",
    icon: "⚡",
    advice: "低嘌呤饮食：少吃动物内脏、浓肉汤、海鲜，戒啤酒与含糖饮料，每日饮水>2000ml。",
    factors: [
      { code: "UA", weight: 1.0, danger: (v) => clampScore((v - 300) / 180) },
    ],
  },
  {
    key: "cancer_screening",
    name: "癌症早筛线索",
    icon: "🔍",
    advice: "肿瘤标志物受炎症等良性因素影响，单次轻度升高无需恐慌，动态监测更有意义。",
    alert: "多项肿瘤标志物显著升高，建议尽快至肿瘤科/体检中心专项复查并联合影像学检查。",
    factors: [
      { code: "AFP", weight: 0.3, danger: (v) => clampScore((v - 7) / 14) },
      { code: "CEA", weight: 0.3, danger: (v) => clampScore((v - 4) / 11) },
      { code: "CA199", weight: 0.2, danger: (v) => clampScore((v - 27) / 65) },
      { code: "PSA", weight: 0.2, danger: (v) => clampScore((v - 4) / 6) },
    ],
  },
]

function clampScore(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/** 对整份报告跑风险评分 */
export function assessRisks(indicators: Indicator[]): RiskAssessment[] {
  const byCode = new Map(indicators.map((i) => [i.code, i]))

  return RISK_RULES.map((rule) => {
    let score = 0
    let totalWeight = 0
    const evidence: RiskAssessment["evidence"] = []

    for (const f of rule.factors) {
      const ind = byCode.get(f.code)
      if (!ind) continue
      totalWeight += f.weight
      const danger = f.danger(ind.value)
      score += danger * f.weight
      if (danger > 0.15) {
        evidence.push({
          name: ind.name,
          value: `${ind.value} ${ind.unit}`,
          status: judgeIndicator(ind),
        })
      }
    }

    // 归一化到 0-100
    const finalScore = totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 0
    // 只要有显著异常指标，保底中风险
    const hasCritical = rule.factors.some((f) => {
      const ind = byCode.get(f.code)
      return ind ? judgeIndicator(ind).startsWith("critical") : false
    })
    const adjusted = hasCritical ? Math.max(finalScore, 62) : finalScore

    const level: RiskLevel = adjusted >= 60 ? "high" : adjusted >= 35 ? "medium" : "low"

    return {
      key: rule.key,
      name: rule.name,
      icon: rule.icon,
      score: adjusted,
      level,
      evidence,
      advice: rule.advice,
      alert: level === "high" ? rule.alert : undefined,
    }
  })
}
