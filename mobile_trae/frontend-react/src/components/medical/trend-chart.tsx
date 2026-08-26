import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { TrendingUp } from "lucide-react"
import type { Indicator } from "@/lib/medical-rules"
import { judgeIndicator } from "@/lib/medical-rules"
import { GlowCard } from "@/components/fx"

interface TrendChartProps {
  /** code -> 历史数值序列（时间升序，末位为本次） */
  trends: Record<string, number[]>
  /** 横轴日期标签 */
  dates: string[]
  /** 本次报告指标（用于筛选可看趋势的指标 + 参考值） */
  indicators: Indicator[]
}

/** SVG 趋势折线图：描线动画 + 异常点标红 + 参考上限虚线 + 指标切换 */
export function TrendChart({ trends, dates, indicators }: TrendChartProps) {
  const available = useMemo(
    () => indicators.filter((i) => (trends[i.code]?.length ?? 0) >= 2),
    [indicators, trends],
  )
  const [code, setCode] = useState(available[0]?.code ?? "")
  const cur = available.find((i) => i.code === code) ?? available[0]

  useEffect(() => {
    if (!cur && available[0]) setCode(available[0].code)
  }, [available, cur])

  if (!cur) {
    return (
      <GlowCard theme="green">
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <TrendingUp className="h-6 w-6 text-gray-300" />
          <p className="text-xs text-gray-400">历史数据不足 2 次，多次解析报告后这里将生成趋势曲线</p>
        </div>
      </GlowCard>
    )
  }

  const series = trends[cur.code]!
  const n = series.length

  // 坐标范围：数据 + 参考值兜底，上下留 12% 余量
  const values = [...series]
  if (cur.refHigh != null) values.push(cur.refHigh)
  if (cur.refLow != null) values.push(cur.refLow)
  let min = Math.min(...values)
  let max = Math.max(...values)
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.1 || 1
  min -= pad
  max += pad

  const W = 320
  const H = 130
  // 左右各留边距，避免首尾日期/数值标签超出画布
  const px = (i: number) => 38 + (i * (W - 58)) / (n - 1)
  const py = (v: number) => 12 + ((max - v) / (max - min)) * (H - 30)

  const path = series.map((v, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(v)}`).join(" ")
  const area = `${path} L${px(n - 1)},${H - 8} L${px(0)},${H - 8} Z`

  return (
    <GlowCard theme="green">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <TrendingUp className="h-4 w-4 text-green-600" />
          指标趋势
        </div>
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="rounded-lg border border-green-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-green-400"
        >
          {available.map((i) => (
            <option key={i.code} value={i.code}>
              {i.name}
            </option>
          ))}
        </select>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(16,185,129,0.25)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0)" />
          </linearGradient>
        </defs>

        {/* 参考上限虚线 */}
        {cur.refHigh != null && (
          <g>
            <line
              x1={26} x2={W - 8} y1={py(cur.refHigh)} y2={py(cur.refHigh)}
              stroke="#f59e0b" strokeDasharray="4 4" strokeWidth="1"
            />
            <text x={W - 10} y={Math.max(py(cur.refHigh) - 3, 9)} textAnchor="end" fontSize="8" fill="#d97706">
              上限 {cur.refHigh}
            </text>
          </g>
        )}

        {/* 面积 */}
        <motion.path
          d={area}
          fill="url(#trendFill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
        />

        {/* 主折线（描线动画） */}
        <motion.path
          d={path}
          fill="none"
          stroke="#10b981"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
        />

        {/* 数据点 */}
        {series.map((v, i) => {
          const abnormal = judgeIndicator({ ...cur, value: v }) !== "normal"
          const isLast = i === n - 1
          return (
            <motion.g
              key={i}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + i * 0.12, type: "spring", stiffness: 300 }}
            >
              <circle
                cx={px(i)} cy={py(v)}
                r={isLast ? 4.5 : abnormal ? 3.8 : 3}
                fill={abnormal ? "#ef4444" : "#10b981"}
                stroke="#fff" strokeWidth="1.5"
              />
              {isLast && (
                <g>
                  {(() => {
                    const bx = Math.min(Math.max(px(i) - 20, 2), W - 42)
                    const by = Math.max(py(v) - 22, 2)
                    return (
                      <>
                        <rect x={bx} y={by} width="40" height="15" rx="4" fill="#065f46" opacity="0.92" />
                        <text x={bx + 20} y={by + 11} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="600">
                          {v}
                        </text>
                      </>
                    )
                  })()}
                </g>
              )}
            </motion.g>
          )
        })}

        {/* 日期轴：首尾锚点内收，避免左右越界被裁 */}
        {dates.slice(0, n).map((d, i) =>
          n > 8 && i % 2 === 1 ? null : (
            <text
              key={i}
              x={px(i)}
              y={H - 1}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize="8"
              fill="#94a3b8"
            >
              {d}
            </text>
          ),
        )}
      </svg>
    </GlowCard>
  )
}
