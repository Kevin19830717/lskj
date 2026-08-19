import { motion } from "framer-motion"
import { Bot, UtensilsCrossed, Stethoscope, ShieldAlert, FileSearch } from "lucide-react"
import type { Indicator, RiskAssessment } from "@/lib/medical-rules"
import { judgeIndicator } from "@/lib/medical-rules"
import { GlowCard } from "@/components/fx"

interface AiInsightProps {
  indicators: Indicator[]
  risks: RiskAssessment[]
  /** 后端多模态解析附带的总结（OCR 摘要） */
  rawSummary?: string
}

/** AI 解读区：综合解读 + 饮食干预 + 就医提醒 + 免责声明 */
export function AiInsight({ indicators, risks, rawSummary }: AiInsightProps) {
  const abnormal = indicators.filter((i) => judgeIndicator(i) !== "normal")
  const highRisks = risks.filter((r) => r.level === "high")
  const medRisks = risks.filter((r) => r.level === "medium")
  const alerts = risks.filter((r) => r.alert).map((r) => r.alert!)

  // 前端规则引擎生成的结构化解读（迁移后由后端 LLM 生成替换）
  const lines: string[] = []
  if (abnormal.length === 0) {
    lines.push("各项指标均在参考范围内，整体代谢状态良好，保持当前饮食与运动习惯即可。")
  } else {
    lines.push(
      `共 ${indicators.length} 项指标中 ${abnormal.length} 项异常：` +
        abnormal.map((i) => i.name).join("、") +
        "。主要问题集中在代谢方向，建议优先处理高风险项。",
    )
    if (highRisks.length) lines.push(`高风险项：${highRisks.map((r) => r.name.replace("风险", "")).join("、")}，需重点干预。`)
    if (medRisks.length) lines.push(`中等风险项：${medRisks.map((r) => r.name.replace("风险", "")).join("、")}，建议 1~3 个月内复查。`)
  }

  return (
    <div className="space-y-3">
      {/* 综合解读 */}
      <GlowCard theme="green">
        <div className="mb-2 flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-br from-green-500 to-emerald-400 p-1.5">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-800">AI 综合解读</span>
        </div>
        <div className="space-y-1.5">
          {lines.map((t, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.12 }}
              className="text-[13px] leading-relaxed text-gray-700"
            >
              {t}
            </motion.p>
          ))}
        </div>
      </GlowCard>

      {/* 后端 OCR 摘要（真实解析时才有） */}
      {rawSummary && (
        <GlowCard theme="green">
          <div className="mb-2 flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-br from-teal-500 to-green-400 p-1.5">
              <FileSearch className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-800">报告原文摘要（多模态识别）</span>
          </div>
          <p className="text-[13px] leading-relaxed text-gray-600">{rawSummary}</p>
        </GlowCard>
      )}

      {/* 饮食干预 */}
      <GlowCard theme="green">
        <div className="mb-2 flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-br from-amber-500 to-yellow-400 p-1.5">
            <UtensilsCrossed className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-800">饮食干预建议</span>
        </div>
        <ul className="space-y-1.5">
          {risks
            .filter((r) => r.level !== "low")
            .map((r, i) => (
              <motion.li
                key={r.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-start gap-2 rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-[12px] leading-relaxed text-gray-700"
              >
                <span className="shrink-0">{r.icon}</span>
                <span>
                  <b className="text-gray-800">{r.name.replace("风险", "").replace("线索", "")}</b>
                  ：{r.advice}
                </span>
              </motion.li>
            ))}
          {risks.every((r) => r.level === "low") && (
            <li className="rounded-lg bg-emerald-50/70 px-2.5 py-1.5 text-[12px] text-emerald-700">
              🌿 当前无慢病风险项，保持均衡饮食与规律运动即可。
            </li>
          )}
        </ul>
      </GlowCard>

      {/* 就医提醒 */}
      {alerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-3"
        >
          <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-red-600">
            <Stethoscope className="h-4 w-4" />
            就医提醒
          </div>
          <ul className="space-y-1">
            {alerts.map((a, i) => (
              <li key={i} className="text-[12px] leading-relaxed text-red-600/90">
                · {a}
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      <div className="flex items-start gap-1.5 px-1 text-[10px] leading-relaxed text-gray-400">
        <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
        本解读由规则引擎自动生成，仅供健康管理参考，不构成医学诊断。异常指标请以医院复查结果为准。
      </div>
    </div>
  )
}
