import { useCallback, useEffect, useMemo, useState } from "react"
import AppShell from "@/components/app-shell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AnimatedDropdown, type DropdownOption } from "@/components/animated-dropdown"
import { AnimatedNumber } from "@/components/fx"
import { apiGet, apiPost, apiDelete, type AnalysisSummary } from "@/lib/api"
import { FileText, Clock, Trash2, RefreshCw, Zap, ChevronLeft, ChevronRight, Trash, X, ChevronsLeft, ChevronsRight, Info, Apple, Sparkles } from "lucide-react"
import { WaveLoader } from "@/components/wave-loader"
import { motion, AnimatePresence } from "framer-motion"

const PAGE_SIZE = 10

// ============ 报告类型配置：标签 + 颜色 + 底色 ============
const TYPE_TAGS: Record<string, { label: string; from: string; to: string; emoji: string; bg: string }> = {
  daily:   { label: "日报",   from: "#22c55e", to: "#16a34a", emoji: "📅", bg: "#dcfce7" },
  weekly:  { label: "周报",   from: "#38bdf8", to: "#0284c7", emoji: "📊", bg: "#dbeafe" },
  monthly: { label: "月报",   from: "#fb923c", to: "#ea580c", emoji: "📈", bg: "#ffedd5" },
  yearly:  { label: "年报",   from: "#c084fc", to: "#7e22ce", emoji: "🏆", bg: "#f3e8ff" },
}

const summaryTypeOptions: DropdownOption[] = [
  { value: "daily", label: "📅 日报" },
  { value: "weekly", label: "📊 周报" },
  { value: "monthly", label: "📈 月报" },
  { value: "yearly", label: "🏆 年报" },
]

const INSIGHTS_LABELS: Record<string, string> = {
  period_start: "周期开始", period_end: "周期结束", total_meals: "餐次",
  total_energy_kcal: "总热量", avg_daily_energy_kcal: "日均热量",
  total_protein_g: "蛋白质", total_fat_g: "脂肪", total_carbohydrate_g: "碳水",
  total_sodium_mg: "钠", total_cholesterol_mg: "胆固醇",
  total_vitamin_c_mg: "维生素C", total_calcium_mg: "钙",
  total_iron_mg: "铁", total_potassium_mg: "钾",
  health_score: "健康评分",
}
const TAB_ITEMS = [
  { id: "basic", label: "基本信息", icon: Info },
  { id: "foods", label: "常吃食物", icon: Apple },
  { id: "ai", label: "AI总结", icon: Sparkles },
] as const

function fmtDate(v?: string) {
  if (!v) return "-"; const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("zh-CN")
}
function rv(v: unknown) {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(1)
  if (Array.isArray(v)) return v.join(", ")
  if (typeof v === "object" && v !== null) return JSON.stringify(v)
  return String(v)
}

// ============ 详情弹窗 ============
function ReportDetailModal({ summary, onClose }: { summary: AnalysisSummary; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState("basic")
  const tg = TYPE_TAGS[summary.summary_type] ?? TYPE_TAGS.daily
  const ins = summary.insights
  const isDaily = summary.summary_type === "daily"

  // 日均除数（与后端 mergeInsights 保持一致：周=7，月=30，年=365）
  const periodDiv = useMemo(() => {
    switch (summary.summary_type) {
      case "weekly": return 7
      case "monthly": return 30
      case "yearly": return 365
      default: return 1
    }
  }, [summary.summary_type])

  const g = (k: string): string => INSIGHTS_LABELS[k] || k
  const v = (k: string) => ins?.[k]
  const avg = (k: string) => { const t = typeof v(k) === "number" ? (v(k) as number) : 0; return t / periodDiv }

  type InfoItem = { label: string; value: string | number; unit: string; color?: string }
  const basicGroups = useMemo(() => {
    if (!ins) return [] as { label: string; items: InfoItem[] }[]
    const dark = tg.to, light = tg.from
    const groups: { label: string; items: InfoItem[] }[] = []

    // 基本营养素（全部深色）
    const macros: InfoItem[] = []
    macros.push({ label: "总热量", value: rv(v("total_energy_kcal")), unit: "kcal", color: dark })
    if (!isDaily) macros.push({ label: "日均热量", value: ins.avg_daily_energy_kcal != null ? rv(ins.avg_daily_energy_kcal) : rv(avg("total_energy_kcal")), unit: "kcal", color: dark })
    macros.push({ label: "总蛋白质", value: rv(v("total_protein_g")), unit: "g", color: dark })
    if (!isDaily) macros.push({ label: "日均蛋白质", value: rv(avg("total_protein_g")), unit: "g", color: dark })
    macros.push({ label: "总脂肪", value: rv(v("total_fat_g")), unit: "g", color: dark })
    if (!isDaily) macros.push({ label: "日均脂肪", value: rv(avg("total_fat_g")), unit: "g", color: dark })
    macros.push({ label: "总碳水", value: rv(v("total_carbohydrate_g")), unit: "g", color: dark })
    if (!isDaily) macros.push({ label: "日均碳水", value: rv(avg("total_carbohydrate_g")), unit: "g", color: dark })
    groups.push({ label: "基本营养素", items: macros })

    // 微量元素（统一浅色）
    const microKeys = ["total_sodium_mg", "total_cholesterol_mg", "total_vitamin_c_mg", "total_calcium_mg", "total_iron_mg", "total_potassium_mg"]
    const microUnits: Record<string, string> = { total_sodium_mg: "mg", total_cholesterol_mg: "mg", total_vitamin_c_mg: "mg", total_calcium_mg: "mg", total_iron_mg: "mg", total_potassium_mg: "mg" }
    const microItems = microKeys.filter(k => v(k) != null).map(k => ({
      label: g(k), value: rv(v(k)), unit: microUnits[k] || "", color: light,
    }))
    if (microItems.length > 0) groups.push({ label: "微量元素", items: microItems })

    // 周期（仅非日报显示，黑色，放最后）—— 确保 start <= end
    if (!isDaily) {
      const ps = typeof v("period_start") === "string" ? v("period_start") as string : ""
      const pe = typeof v("period_end") === "string" ? v("period_end") as string : ""
      const [start, end] = ps && pe && ps > pe ? [pe, ps] : [ps, pe]
      groups.push({
        label: "周期",
        items: [
          { label: "周期开始", value: start, unit: "", color: "#111827" },
          { label: "周期结束", value: end, unit: "", color: "#111827" },
        ],
      })
    }

    return groups
  }, [ins, isDaily, periodDiv, tg])

  const topFoods = (ins?.top_foods ?? []) as Array<{ name?: string; name_en?: string; count: number; total_weight_g?: number }>
  const maxCount = Math.max(...topFoods.map(f => f.count), 1)

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center bg-black/45 px-0 lg:px-4 py-0 lg:py-8" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] lg:max-h-[85vh] overflow-y-auto rounded-t-3xl lg:rounded-3xl bg-white border border-gray-200 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 lg:px-6 py-3 lg:py-4 sticky top-0 z-10" style={{ backgroundColor: tg.bg }}>
          <div>
            <h4 className="text-lg font-semibold flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold text-white"
                style={{ backgroundImage: `linear-gradient(to right, ${tg.from}, ${tg.to})` }}>{tg.emoji} {tg.label}</span>
              {fmtDate(summary.summary_date)}
            </h4>
            <p className="text-xs text-gray-500 mt-1">{!isDaily ? `共 ${periodDiv} 天` : ""}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        {!isDaily && (
          <div className="px-4 lg:px-6 pt-4">
            <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
              {TAB_ITEMS.map(tab => {
                const Icon = tab.icon
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className="relative px-2 py-1.5 lg:px-4 lg:py-2 text-[11px] lg:text-sm font-medium rounded-lg text-gray-600 hover:text-gray-900">
                    {activeTab === tab.id && <motion.div layoutId="report-detail-tab" className="absolute inset-0 bg-white shadow rounded-lg" transition={{ type: "spring", duration: 0.5 }} />}
                    <span className="relative z-10 flex items-center gap-1.5"><Icon className="h-4 w-4" />{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="p-3 lg:p-6 min-h-[380px] relative">
          <AnimatePresence mode="popLayout">
            {/* ===== 基本信息 ===== */}
            {activeTab === "basic" && (
              <motion.div key="basic" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                {basicGroups.length === 0 ? <p className="text-gray-400 text-center py-8">暂无基本数据</p> : (
                  <div className="space-y-4 overflow-hidden">
                    {basicGroups.map((group, gi) => {
                      const isNum = (v: string | number) => typeof v === "number" || (!Number.isNaN(Number(v)) && v !== "" && v !== "-")
                      const isPeriod = group.label === "周期"
                      const cardBg = isPeriod
                        ? "bg-white border border-gray-200"
                        : `bg-gradient-to-br from-white to-[${tg.bg}] border border-[${tg.from}]/20`
                      return (
                        <div key={gi}>
                          <h6 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{group.label}</h6>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {group.items.map((item, ii) => (
                              <motion.div key={ii}
                                initial={{ x: 20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ duration: 0.3, delay: ii * 0.05, ease: [0.22, 1, 0.36, 1] }}
                                className={`flex items-center justify-between rounded-xl px-3 py-2.5 shadow-sm ${cardBg}`}>
                                <span className="text-xs text-gray-500 font-medium">{item.label}</span>
                                <span className="text-xs font-bold flex items-baseline" style={item.color ? { color: item.color } : undefined}>
                                  {isNum(item.value) ? (
                                    <AnimatedNumber value={Number(item.value)} duration={0.6} decimals={1} />
                                  ) : item.value}
                                  {item.unit ? <span className="ml-0.5 text-[10px] text-gray-400 font-normal">{item.unit}</span> : null}
                                </span>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* 日报：食物统计合并到基本信息页下方 */}
                {isDaily && topFoods.length > 0 && (
                  <div className="mt-4">
                    <h6 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">食物统计</h6>
                    <div className="flex flex-wrap gap-2">
                      {topFoods.map((f, i) => (
                        <span key={`${f.name || f.name_en}-${i}`}
                          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border"
                          style={{ backgroundColor: tg.bg, borderColor: `${tg.from}40`, color: tg.to }}>
                          {f.name || f.name_en || "未知"}
                          <span className="text-gray-400">{f.count}次{f.total_weight_g ? ` · ${Math.round(f.total_weight_g)}g` : ""}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ===== 常吃食物（仅非日报显示） ===== */}
            {!isDaily && activeTab === "foods" && (
              <motion.div key="foods" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                {topFoods.length === 0 ? <p className="text-gray-400 text-center py-8">暂无数据</p> : (
                  <div className="space-y-3">
                    {topFoods.slice(0, 10).map((f, i) => (
                      <div key={`${f.name || f.name_en}-${i}`} className="flex items-center gap-3">
                        <span className="w-6 text-sm font-bold text-gray-400 text-center">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-1"><span className="font-medium">{f.name || f.name_en}</span><span className="text-gray-400 text-xs">{f.count}次</span></div>
                          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                            <motion.div className="h-full rounded-full"
                              style={{ backgroundImage: `linear-gradient(to right, ${tg.from}, ${tg.to})` }}
                              initial={{ width: 0 }}
                              animate={{ width: `${(f.count / maxCount) * 100}%` }}
                              transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }} />
                          </div>
                        </div>
                        {f.total_weight_g ? <span className="text-xs text-gray-400 w-12 text-right">{Math.round(f.total_weight_g)}g</span> : null}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ===== AI 总结页（仅非日报显示） ===== */}
            {!isDaily && activeTab === "ai" && (
              <motion.div key="ai" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25, ease: "easeOut" }}>
                {(() => {
                  const aiSummary = typeof ins?.ai_summary === "string" ? ins.ai_summary as string : ""
                  const aiAdvice = typeof ins?.ai_advice === "string" ? ins.ai_advice as string : ""
                  if (!aiSummary && !aiAdvice) {
                    return (
                      <div className="text-center py-8">
                        <Sparkles className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">尚未生成AI总结</p>
                        <p className="text-gray-400 text-xs mt-1">点击页面顶部「生成一条」按钮，系统会从近到远依次为每条报告生成AI总结</p>
                      </div>
                    )
                  }
                  return (
                    <div className="space-y-4">
                      {aiSummary && (
                        <div className="rounded-2xl p-4 border" style={{ backgroundColor: tg.bg, borderColor: `${tg.from}40` }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="h-4 w-4" style={{ color: tg.to }} />
                            <h6 className="text-sm font-semibold" style={{ color: tg.to }}>本期总结</h6>
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
                        </div>
                      )}
                      {aiAdvice && (
                        <div className="rounded-2xl p-4 border bg-white" style={{ borderColor: `${tg.from}40` }}>
                          <div className="flex items-center gap-2 mb-2">
                            <Zap className="h-4 w-4" style={{ color: tg.to }} />
                            <h6 className="text-sm font-semibold" style={{ color: tg.to }}>下期建议</h6>
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{aiAdvice}</p>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ============ 主页面 ============
export default function ReportsPage() {
  const [summaryType, setSummaryType] = useState("daily")
  const [summaries, setSummaries] = useState<AnalysisSummary[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AnalysisSummary | null>(null)
  const [feedback, setFeedback] = useState("")
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [animKey, setAnimKey] = useState(0) // 动画触发 key

  const fetchPage = useCallback(async (p: number, type: string) => {
    setLoading(true)
    const res = await apiGet<{ items: AnalysisSummary[]; total: number; total_pages: number }>(
      `/summaries?type=${type}&page=${p}&page_size=${PAGE_SIZE}`
    )
    if (res.data) {
      setSummaries(res.data.items ?? [])
      setTotal(res.data.total ?? 0)
      setTotalPages(res.data.total_pages ?? 1)
    }
    setLoading(false)
    setAnimKey(k => k + 1)
  }, [])

  useEffect(() => { setPage(1); fetchPage(1, summaryType).catch(() => setLoading(false)) }, [summaryType, fetchPage])

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("确定删除？")) return
    setDeletingId(id)
    const res = await apiDelete(`/summaries/${id}`)
    if (res.code === 0) { setFeedback("已删除"); fetchPage(page, summaryType) }
    else setFeedback("删除失败：" + res.message)
    setDeletingId(null)
    setTimeout(() => setFeedback(""), 3000)
  }

  const handleClearAll = async () => {
    if (!confirm("确定清除全部周报、月报和年报？日报数据将保留，原始数据不受影响")) return
    setClearing(true)
    const res = await apiDelete("/summaries?exclude_daily=true")
    if (res.code === 0) {
      const d = res.data as { deleted?: number } | null
      setFeedback(`已清除 ${d?.deleted ?? "全部"} 条（周/月/年报）`)
      setPage(1); fetchPage(1, summaryType)
    } else setFeedback("清除失败：" + res.message)
    setClearing(false)
    setTimeout(() => setFeedback(""), 4000)
  }

  const handleBackfill = async () => {
    const cn = TYPE_TAGS[summaryType]?.label || summaryType
    setBackfilling(true); setFeedback(`生成${cn}中...`)
    const res = await apiPost<unknown>(`/summaries/generate-next?type=${summaryType}`)
    if (res.code === 0) {
      setFeedback(res.message ? res.message : `已生成一条${cn}`)
      fetchPage(page, summaryType)
    } else setFeedback("生成失败：" + (res.message || "未知错误"))
    setBackfilling(false); setTimeout(() => setFeedback(""), 4000)
  }

  const goPage = (p: number) => { if (p >= 1 && p <= totalPages) { setPage(p); fetchPage(p, summaryType) } }

  const actions = (
    <div className="flex items-center gap-2 ml-auto flex-wrap">
      <AnimatedDropdown options={summaryTypeOptions} value={summaryType} onChange={setSummaryType} theme="green" icon={<Clock className="h-4 w-4" />} />
      <button disabled={backfilling} onClick={handleBackfill}
        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white px-2 py-1.5 text-xs lg:px-3 lg:py-2 lg:text-sm font-medium shadow-sm hover:shadow-md transition disabled:opacity-50">
        <Zap className={`h-4 w-4 ${backfilling ? "animate-pulse" : ""}`} />{backfilling ? "生成中…" : "生成一条"}
      </button>
      <button disabled={clearing} onClick={handleClearAll}
        className="inline-flex items-center gap-1 rounded-xl bg-red-50 border border-red-200 px-2 py-1.5 text-xs lg:px-3 lg:py-2 lg:text-sm text-red-600 hover:bg-red-100 transition disabled:opacity-50" title="清除周报/月报/年报（保留日报）">
        <Trash className="h-4 w-4" />清除周/月/年报
      </button>
      <button onClick={() => fetchPage(page, summaryType)}
        className="inline-flex items-center gap-1 rounded-xl bg-white/80 border border-gray-200 px-2 py-1.5 text-xs lg:px-3 lg:py-2 lg:text-sm text-gray-600 hover:bg-gray-50 transition" title="刷新">
        <RefreshCw className="h-4 w-4" />
      </button>
    </div>
  )

  return (
    <AppShell title="营养分析报告" titleIcon={<FileText className="w-6 h-6 text-green-600" />} actions={actions} theme="green">
      {feedback && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">{feedback}</div>
      )}

      <div className="mb-3 text-xs text-gray-400">
        共 {total} 条
      </div>

      {loading ? (
        <Card className="border-0 bg-white/80"><CardContent className="px-6 py-8 flex justify-center"><WaveLoader bars={4} message="加载中..." /></CardContent></Card>
      ) : summaries.length === 0 ? (
        <Card className="border-0 bg-white/80"><CardContent className="px-6 py-10 text-center text-gray-400">暂无报告，点击「一键生成」开始</CardContent></Card>
      ) : (
        <>
          {/* 双列网格 + 依次出现动画 */}
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            <AnimatePresence mode="wait">
              {summaries.map((s, idx) => {
                const tg = TYPE_TAGS[s.summary_type] ?? TYPE_TAGS.daily
                const i = s.insights
                return (
                  <motion.div
                    key={`${s.id}-${animKey}`}
                    initial={{ x: 60, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.35, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Card
                      className="cursor-pointer border-0 hover:-translate-y-0.5 hover:shadow-lg transition-all relative group"
                      style={{ backgroundColor: tg.bg }}
                      onClick={() => setSelected(s)}>
                      <CardContent className="p-2 lg:p-2.5">
                        {/* 左右分区 */}
                        <div className="flex gap-3">
                          {/* 左侧：标签 + 日期 */}
                          <div className="flex-shrink-0 flex flex-col items-start min-w-0" style={{ minWidth: "38%" }}>
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white whitespace-nowrap"
                              style={{ backgroundImage: `linear-gradient(to right, ${tg.from}, ${tg.to})` }}>
                              {tg.emoji} {tg.label}
                            </span>
                            <h3 className="text-xs lg:text-sm font-bold text-gray-900 mt-1.5 leading-tight">{fmtDate(s.summary_date)}</h3>
                          </div>

                          {/* 右侧：营养数据 + 常吃食物 */}
                          <div className="flex-1 min-w-0">
                            {i && (
                              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                {i.total_energy_kcal != null && (
                                  <span className="text-[11px] lg:text-xs text-gray-600">🔥 {Math.round(i.total_energy_kcal)} kcal</span>
                                )}
                                {i.total_protein_g != null && (
                                  <span className="text-[11px] lg:text-xs text-gray-600">💪 {rv(i.total_protein_g)}g</span>
                                )}
                                {i.total_fat_g != null && (
                                  <span className="text-[11px] lg:text-xs text-gray-600">🧈 {rv(i.total_fat_g)}g</span>
                                )}
                                {i.total_carbohydrate_g != null && (
                                  <span className="text-[11px] lg:text-xs text-gray-600">🍚 {rv(i.total_carbohydrate_g)}g</span>
                                )}
                              </div>
                            )}
                            {i?.top_foods?.length ? (
                              <p className="text-[10px] lg:text-[11px] text-gray-400 mt-1.5 truncate">
                                常吃：{i.top_foods.slice(0, 4).map((f: { name?: string; name_en?: string }) => f.name || f.name_en).join("、")}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {/* 删除 — hover 出现 */}
                        <button type="button" disabled={deletingId === s.id}
                          onClick={(e) => handleDelete(s.id, e)}
                          className="absolute top-2 right-2 rounded-full p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                          title="删除"><Trash2 className="h-3.5 w-3.5" /></button>

                        {/* AI总结标记 — 有ai_summary时显示，右下角 */}
                        {i?.ai_summary && (
                          <span className="absolute bottom-2 right-2 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                            style={{ backgroundImage: `linear-gradient(to right, ${tg.from}, ${tg.to})` }}
                            title="已生成AI总结">
                            <Sparkles className="h-2.5 w-2.5" />AI
                          </span>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-1 flex-wrap">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goPage(1)}
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><ChevronsLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goPage(page - 1)}
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></Button>

              {(() => {
                const winSize = 5
                let start = Math.max(1, page - 2)
                if (start + winSize - 1 > totalPages) start = Math.max(1, totalPages - winSize + 1)
                const end = Math.min(start + winSize - 1, totalPages)
                return Array.from({ length: end - start + 1 }, (_, i) => start + i).map(p => (
                  <button key={p} onClick={() => goPage(p)}
                    className={`h-6 w-6 lg:h-8 lg:w-8 rounded-full text-xs lg:text-sm font-medium transition ${p === page ? "bg-gradient-to-r from-emerald-500 to-green-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>{p}</button>
                ))
              })()}

              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goPage(page + 1)}
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goPage(totalPages)}
                className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><ChevronsRight className="h-4 w-4" /></Button>
            </div>
          )}
          <p className="mt-2 text-center text-xs text-gray-400">第 {page}/{totalPages} 页 · 共 {total} 条</p>
        </>
      )}

      {selected && <ReportDetailModal summary={selected} onClose={() => setSelected(null)} />}
    </AppShell>
  )
}
