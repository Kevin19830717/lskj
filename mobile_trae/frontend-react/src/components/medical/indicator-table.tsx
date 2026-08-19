import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronUp } from "lucide-react"
import {
  type Indicator,
  type GroupMeta,
  GROUP_META,
  STATUS_META,
  judgeIndicator,
} from "@/lib/medical-rules"
import { cn } from "@/lib/utils"

interface IndicatorTableProps {
  indicators: Indicator[]
}

/** 指标明细表：按分组折叠展示 + 状态高亮 + 参考区间位置条 */
export function IndicatorTable({ indicators }: IndicatorTableProps) {
  const groups = useMemo(() => {
    const meta = GROUP_META.filter((g) => indicators.some((i) => i.group === g.key))
    const other = indicators.some((i) => i.group === "其他")
    const list: GroupMeta[] = [...meta]
    if (other) {
      list.push(GROUP_META.find((g) => g.key === "其他")!)
    }
    return list.map((g) => ({
      meta: g,
      items: indicators.filter((i) => i.group === g.key),
    }))
  }, [indicators])

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {groups.map(({ meta, items }, gi) => {
        const abnormal = items.filter((i) => judgeIndicator(i) !== "normal").length
        const isCollapsed = collapsed.has(meta.key)
        return (
          <motion.section
            key={meta.key}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: gi * 0.07, duration: 0.4, ease: "easeOut" }}
            className="overflow-hidden rounded-2xl border border-green-100 bg-white/80 shadow-sm backdrop-blur"
          >
            <button
              onClick={() => toggle(meta.key)}
              className="flex w-full items-center justify-between px-4 py-3 transition hover:bg-green-50/50"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
                  style={{ backgroundColor: `${meta.color}18` }}
                >
                  {meta.icon}
                </span>
                <div className="text-left">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    {meta.key}
                    {abnormal > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                        {abnormal} 项异常
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400">{meta.desc}</div>
                </div>
              </div>
              {isCollapsed ? (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              )}
            </button>

            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <div className="divide-y divide-gray-100 border-t border-green-50">
                    {items.map((ind, idx) => (
                      <Row key={ind.code} ind={ind} idx={idx} />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )
      })}
    </div>
  )
}

function Row({ ind, idx }: { ind: Indicator; idx: number }) {
  const status = judgeIndicator(ind)
  const meta = STATUS_META[status]
  const hasRef = ind.refLow != null && ind.refHigh != null && ind.refHigh > ind.refLow

  // 值在参考区间上的位置百分比（0~100，超出截断）
  const pos = useMemo(() => {
    if (!hasRef) return null
    const lo = ind.refLow!
    const hi = ind.refHigh!
    const p = ((ind.value - lo) / (hi - lo)) * 100
    return Math.max(0, Math.min(100, p))
  }, [ind, hasRef])

  return (
    <motion.div
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(idx * 0.05, 0.4), duration: 0.35 }}
      className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-2.5 sm:grid-cols-[1.4fr_1fr_1.2fr_auto]"
    >
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-gray-800">{ind.name}</div>
        <div className="text-[11px] text-gray-400">
          {hasRef ? `参考 ${ind.refLow}~${ind.refHigh}` : "参考范围见报告"}
        </div>
      </div>

      <div className="col-span-2 flex items-baseline gap-1 sm:col-span-1 sm:justify-center">
        <span className="text-base font-bold tabular-nums" style={{ color: meta.color }}>
          {ind.value}
        </span>
        <span className="text-[11px] text-gray-400">{ind.unit}</span>
      </div>

      {/* 参考区间位置条 */}
      <div className="col-span-2 hidden items-center sm:flex">
        {pos != null ? (
          <div className="relative h-1.5 w-full max-w-40 rounded-full bg-gradient-to-r from-green-200 via-green-100 to-red-200">
            <motion.div
              initial={{ left: 0 }}
              animate={{ left: `${pos}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 16, delay: 0.2 }}
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ backgroundColor: meta.color }}
            />
          </div>
        ) : (
          <div className="text-[11px] text-gray-300">—</div>
        )}
      </div>

      <div className="flex justify-end">
        <span
          className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold")}
          style={{ color: meta.color, backgroundColor: meta.bg }}
        >
          {meta.label}
          {meta.arrow}
        </span>
      </div>
    </motion.div>
  )
}
