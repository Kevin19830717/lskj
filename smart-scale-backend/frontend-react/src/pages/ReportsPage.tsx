import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import AppShell from "@/components/app-shell"
import { Card, CardContent } from "@/components/ui/card"
import { ParticleButton } from "@/components/particle-button"
import { AnimatedDropdown, type DropdownOption } from "@/components/animated-dropdown"
import { apiGet, apiPost, type AnalysisSummary, type SummaryInsights } from "@/lib/api"
import { FileText, LoaderCircle, Sparkles, X, Clock, Info, Apple, Lightbulb } from "lucide-react"

const summaryTypeOptions: DropdownOption[] = [
  { value: "weekly", label: "周报" },
  { value: "daily", label: "日报" },
  { value: "monthly", label: "月报" },
  { value: "yearly", label: "年报" },
]

function formatDate(dateStr?: string) {
  if (!dateStr) return "-"
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString("zh-CN")
}

// 中文标签映射
const INSIGHTS_LABELS: Record<string, string> = {
  period_start: "周期开始",
  period_end: "周期结束",
  total_meals: "餐次",
  total_energy_kcal: "总热量",
  avg_daily_energy_kcal: "日均热量",
  total_protein_g: "总蛋白质",
  total_fat_g: "总脂肪",
  total_carbohydrate_g: "总碳水",
  total_sodium_mg: "总钠",
  total_cholesterol_mg: "总胆固醇",
  total_vitamin_c_mg: "总维生素C",
  total_calcium_mg: "总钙",
  total_iron_mg: "总铁",
  total_potassium_mg: "总钾",
  health_score: "健康评分",
}

// 隐藏在"基本信息"中的字段
const HIDDEN_KEYS = new Set(["top_foods", "recommendations", "nutrient_trend", "name"])

const TAB_ITEMS = [
  { id: "basic", label: "基本信息", icon: Info },
  { id: "foods", label: "常吃食物", icon: Apple },
  { id: "advice", label: "AI 建议", icon: Lightbulb },
] as const

function metricEntries(insights?: SummaryInsights) {
  if (!insights) return []
  return [
    { key: "total_energy_kcal", label: "总热量", value: insights.total_energy_kcal, unit: "kcal" },
    { key: "avg_daily_energy_kcal", label: "日均热量", value: insights.avg_daily_energy_kcal, unit: "kcal" },
    { key: "total_meals", label: "餐次", value: insights.total_meals, unit: "次" },
    { key: "total_protein_g", label: "蛋白质", value: insights.total_protein_g, unit: "g" },
    { key: "total_fat_g", label: "脂肪", value: insights.total_fat_g, unit: "g" },
    { key: "total_carbohydrate_g", label: "碳水", value: insights.total_carbohydrate_g, unit: "g" },
  ].filter((m) => m.value != null && m.value !== 0)
}

function renderValue(value: unknown) {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1)
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "object" && value !== null) return JSON.stringify(value)
  return String(value)
}

// ============================================================
// 详情模态框 — 浅白背景 + AnimatedTabs 风格
// ============================================================
function ReportDetailModal({ summary, onClose }: { summary: AnalysisSummary; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<string>("basic")

  const detailRows = useMemo(() => {
    if (!summary.insights) return []
    return Object.entries(summary.insights)
      .filter(([key]) => !HIDDEN_KEYS.has(key))
      .map(([key, value]) => ({ key, label: INSIGHTS_LABELS[key] || key, value }))
  }, [summary])

  // 将基本信息分组：周期、概览、宏量营养素、微量元素
  const groupedRows = useMemo(() => {
    const groups: { title: string; rows: typeof detailRows }[] = []
    const periodKeys = ["period_start", "period_end", "total_meals"]
    const macroKeys = ["total_energy_kcal", "avg_daily_energy_kcal", "total_protein_g", "total_fat_g", "total_carbohydrate_g"]
    const microKeys = ["total_sodium_mg", "total_cholesterol_mg", "total_vitamin_c_mg", "total_calcium_mg", "total_iron_mg", "total_potassium_mg"]
    const otherKeys = ["health_score"]

    const period = detailRows.filter(r => periodKeys.includes(r.key))
    const macro = detailRows.filter(r => macroKeys.includes(r.key))
    const micro = detailRows.filter(r => microKeys.includes(r.key))
    const other = detailRows.filter(r => ![...periodKeys, ...macroKeys, ...microKeys].includes(r.key))

    if (period.length) groups.push({ title: "周期信息", rows: period })
    if (macro.length) groups.push({ title: "热量与宏量营养素", rows: macro })
    if (micro.length) groups.push({ title: "微量元素", rows: micro })
    if (other.length) groups.push({ title: "其他", rows: other })
    return groups
  }, [detailRows])

  const topFoods = summary.insights?.top_foods ?? []
  const recommendations = summary.insights?.recommendations ?? []
  const maxCount = Math.max(...topFoods.map((f) => f.count), 1)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4 py-8" onClick={onClose}>
      <div
        className="w-full max-w-3xl overflow-hidden rounded-3xl bg-gradient-to-br from-white via-[#fafbff] to-[#f0f4ff] shadow-2xl border border-gray-200/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between border-b border-gray-200/60 px-6 py-4 bg-gradient-to-r from-[#f0f4ff]/50 to-transparent">
          <div>
            <h4 className="text-lg font-semibold text-gray-900">
              {summary.summary_type}报告 · {formatDate(summary.summary_date)}
            </h4>
            <p className="text-sm text-gray-500">数据来源：{summary.source}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs 导航 */}
        <div className="px-6 pt-4">
          <div className="flex gap-2 flex-wrap bg-gray-100/80 p-1 rounded-xl border border-gray-200/60">
            {TAB_ITEMS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="relative px-4 py-2 text-sm font-medium rounded-lg text-gray-600 hover:text-gray-900 outline-none transition-colors"
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="report-active-tab"
                      className="absolute inset-0 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] !rounded-lg"
                      transition={{ type: "spring", duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon className={`h-4 w-4 ${activeTab === tab.id ? "text-[#667eea]" : ""}`} />
                    {tab.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 内容区 */}
        <div className="p-6 max-h-[65vh] overflow-y-auto">
          <div className="bg-white/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] text-gray-800 rounded-xl border border-gray-200/60 min-h-[280px] p-5">
            {activeTab === "basic" && (
              <motion.div
                key="basic"
                initial={{ opacity: 0, scale: 0.95, x: -10, filter: "blur(10px)" }}
                animate={{ opacity: 1, scale: 1, x: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.5, ease: "circInOut" }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <Info className="h-5 w-5 text-[#667eea]" />
                  <h5 className="text-base font-semibold text-gray-900">基本信息</h5>
                </div>
                {groupedRows.length === 0 ? (
                  <p className="text-center text-gray-400 py-10">暂无基本数据</p>
                ) : (
                  <div className="space-y-5">
                    {groupedRows.map((group) => (
                      <div key={group.title}>
                        <h6 className="text-xs font-semibold text-[#667eea] uppercase tracking-wider mb-2.5">{group.title}</h6>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          {group.rows.map((row) => (
                            <div
                              key={row.key}
                              className="flex items-center justify-between rounded-lg bg-gradient-to-r from-[#f8f9ff] to-[#f0f4ff] border border-[#667eea]/10 px-3.5 py-2.5"
                            >
                              <span className="text-sm text-gray-500">{row.label}</span>
                              <span className="text-sm font-semibold text-gray-800">
                                {renderValue(row.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "foods" && (
              <motion.div
                key="foods"
                initial={{ opacity: 0, scale: 0.95, x: -10, filter: "blur(10px)" }}
                animate={{ opacity: 1, scale: 1, x: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.5, ease: "circInOut" }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Apple className="h-5 w-5 text-[#667eea]" />
                  <h5 className="text-base font-semibold text-gray-900">常吃食物排行</h5>
                </div>
                {topFoods.length === 0 ? (
                  <p className="text-center text-gray-400 py-10">暂无常吃食物数据</p>
                ) : (
                  <div className="space-y-3">
                    {topFoods.slice(0, 10).map((food, i) => (
                      <div key={`${food.name}-${i}`} className="flex items-center gap-3">
                        <span className="w-7 text-sm font-bold text-gray-400 flex-shrink-0 text-center">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-sm mb-1.5">
                            <span className="text-gray-800 truncate font-medium">{food.name || food.name_en}</span>
                            <span className="text-gray-400 text-xs">{food.count}次</span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2]"
                              style={{ width: `${(food.count / maxCount) * 100}%` }}
                            />
                          </div>
                        </div>
                        {food.total_weight_g > 0 && (
                          <span className="text-xs text-gray-400 flex-shrink-0 w-16 text-right">
                            {Math.round(food.total_weight_g)}g
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "advice" && (
              <motion.div
                key="advice"
                initial={{ opacity: 0, scale: 0.95, x: -10, filter: "blur(10px)" }}
                animate={{ opacity: 1, scale: 1, x: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.5, ease: "circInOut" }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5 text-[#667eea]" />
                  <h5 className="text-base font-semibold text-gray-900">AI 建议</h5>
                </div>
                {recommendations.length === 0 ? (
                  <p className="text-center text-gray-400 py-10">暂无 AI 建议</p>
                ) : (
                  <div className="space-y-3">
                    {recommendations.map((item, index) => (
                      <div
                        key={`${index}`}
                        className="flex gap-3 rounded-xl bg-gradient-to-r from-[#f0f4ff] to-[#f8f9ff] border border-[#667eea]/15 px-4 py-3"
                      >
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white text-xs font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <p className="text-sm text-gray-700 leading-relaxed">{item}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [summaryType, setSummaryType] = useState("weekly")
  const [summaries, setSummaries] = useState<AnalysisSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedSummary, setSelectedSummary] = useState<AnalysisSummary | null>(null)
  const [feedback, setFeedback] = useState("")

  useEffect(() => {
    let cancelled = false
    async function fetchSummaries() {
      setLoading(true)
      const res = await apiGet<AnalysisSummary[]>(`/summaries?type=${summaryType}&limit=20`)
      if (!cancelled) {
        setSummaries(res.data ?? [])
        setLoading(false)
      }
    }

    fetchSummaries().catch(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [summaryType])

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <AnimatedDropdown
        options={summaryTypeOptions}
        value={summaryType}
        onChange={setSummaryType}
        theme="green"
        icon={<Clock className="h-4 w-4" />}
      />
      <ParticleButton
        className="bg-gradient-to-r from-green-500 to-green-600 px-5 py-2 text-white hover:from-green-600 hover:to-green-700"
        onClick={async () => {
          setGenerating(true)
          setFeedback("")
          try {
            const res = await apiPost(`/summaries/generate?type=${summaryType}`)
            setFeedback(res.message || "报告生成成功")
            const listRes = await apiGet<AnalysisSummary[]>(`/summaries?type=${summaryType}&limit=20`)
            setSummaries(listRes.data ?? [])
          } finally {
            setGenerating(false)
          }
        }}
        disabled={generating}
      >
        {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        生成报告
      </ParticleButton>
    </div>
  )

  return (
    <AppShell title="营养分析报告" titleIcon={<FileText className="w-6 h-6 text-green-600" />} actions={actions} theme="green">
      {feedback && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {feedback}
        </div>
      )}

      <div className="grid gap-4">
        {loading && (
          <Card className="border-0 bg-white/80">
            <CardContent className="px-6 py-10 text-center text-gray-400">加载中...</CardContent>
          </Card>
        )}

        {!loading && summaries.length === 0 && (
          <Card className="border-0 bg-white/80">
            <CardContent className="px-6 py-10 text-center text-gray-400">暂无报告</CardContent>
          </Card>
        )}

        {!loading &&
          summaries.map((summary) => (
            <Card
              key={summary.id}
              className="cursor-pointer border-0 bg-white/85 transition-transform hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(102,126,234,0.16)]"
              onClick={() => setSelectedSummary(summary)}
            >
              <CardContent className="px-6 py-5">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <strong className="text-base text-gray-800">{summary.summary_type}</strong>
                  <span className="rounded-full bg-[#eef1ff] px-3 py-1 text-xs font-medium text-[#5f63d8]">
                    {summary.source}
                  </span>
                  <span className="text-sm text-gray-500">{formatDate(summary.summary_date)}</span>
                </div>

                <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                  {metricEntries(summary.insights).map((m) => (
                    <span key={m.key} className="rounded-lg bg-[#f8f9ff] px-3 py-2">
                      <b className="mr-1 text-gray-800">{m.label}:</b>
                      {renderValue(m.value)}
                      {m.unit}
                    </span>
                  ))}
                </div>

                {summary.insights.top_foods?.length ? (
                  <p className="mt-3 text-sm text-gray-500">
                    常吃食物: {summary.insights.top_foods.slice(0, 5).map((food) => food.name || food.name_en).join(", ")}
                  </p>
                ) : null}

                {summary.insights.recommendations?.length ? (
                  <p className="mt-2 text-sm text-[#6b5db7]">{summary.insights.recommendations[0]}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
      </div>

      {selectedSummary && (
        <ReportDetailModal summary={selectedSummary} onClose={() => setSelectedSummary(null)} />
      )}
    </AppShell>
  )
}
