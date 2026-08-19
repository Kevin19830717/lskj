import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"
import {
  type RiskAssessment,
  RISK_LEVEL_META,
  STATUS_META,
} from "@/lib/medical-rules"
import { GlowCard, AnimatedNumber } from "@/components/fx"

interface RiskCardsProps {
  risks: RiskAssessment[]
}

/** 5 项慢病风险卡片：环形评分动画 + 等级徽章 + 证据链 + 就医提醒 */
export function RiskCards({ risks }: RiskCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {risks.map((risk, i) => (
        <RiskCard key={risk.key} risk={risk} index={i} />
      ))}
    </div>
  )
}

function RiskCard({ risk, index }: { risk: RiskAssessment; index: number }) {
  const meta = RISK_LEVEL_META[risk.level]
  // 环形进度 0 -> score 动画
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setProgress(risk.score), 150 + index * 120)
    return () => clearTimeout(t)
  }, [risk.score, index])

  const R = 30
  const C = 2 * Math.PI * R
  const offset = C * (1 - progress / 100)

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.09, type: "spring", stiffness: 160, damping: 18 }}
    >
      <GlowCard theme="green" className="h-full">
        <div className="flex items-start gap-3">
          {/* 评分环 */}
          <div className="relative h-[76px] w-[76px] shrink-0">
            <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
              <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="7" />
              <circle
                cx="38" cy="38" r={R}
                fill="none"
                stroke={meta.color}
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={offset}
                style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold tabular-nums text-gray-800">
                <AnimatedNumber value={risk.score} duration={1.1} />
              </span>
              <span className="text-[9px] text-gray-400">风险分</span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                <span>{risk.icon}</span>
                {risk.name}
              </div>
            </div>
            <span
              className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: meta.color }}
            >
              {meta.emoji} {meta.label}
            </span>
          </div>
        </div>

        {/* 证据链 */}
        {risk.evidence.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {risk.evidence.map((ev, i) => {
              const st = STATUS_META[ev.status]
              return (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.09 + i * 0.08 }}
                  className="flex items-center justify-between rounded-lg bg-gray-50/80 px-2 py-1 text-[11px]"
                >
                  <span className="text-gray-600">{ev.name}</span>
                  <span className="font-semibold tabular-nums" style={{ color: st.color }}>
                    {ev.value} {st.arrow}
                  </span>
                </motion.li>
              )
            })}
          </ul>
        ) : (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-600">
            <Sparkles className="h-3 w-3" />
            相关指标均在安全区间
          </div>
        )}

        {/* 干预建议 */}
        <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{risk.advice}</p>

        {/* 就医提醒 */}
        {risk.alert && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.75, 1, 0.75] }}
            transition={{ duration: 2.2, repeat: Infinity }}
            className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-medium text-red-600"
          >
            🚨 {risk.alert}
          </motion.div>
        )}
      </GlowCard>
    </motion.div>
  )
}
