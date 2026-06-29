import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, ChevronRight, Plus, Trash2, X, LoaderCircle, FileText, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiGet, apiPost, apiDelete, type AnalysisSummary } from "@/lib/api"

const PAGE_SIZE = 10
type SumType = "daily" | "weekly" | "monthly" | "yearly"
const TYPES: { key: SumType; label: string; emoji: string; from: string; to: string }[] = [
  { key: "daily", label: "日报", emoji: "📅", from: "#34d399", to: "#10b981" },
  { key: "weekly", label: "周报", emoji: "🗓️", from: "#60a5fa", to: "#3b82f6" },
  { key: "monthly", label: "月报", emoji: "📆", from: "#fbbf24", to: "#f59e0b" },
  { key: "yearly", label: "年报", emoji: "📊", from: "#a78bfa", to: "#8b5cf6" },
]
const metric = (v?: number | null) => (v == null ? "-" : v.toFixed(1))

export default function MobileReportsPage() {
  const [type, setType] = useState<SumType>("daily")
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<AnalysisSummary[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<AnalysisSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState("")

  const fetchPage = useCallback(async (p: number, t: SumType) => {
    setLoading(true)
    try {
      const d = await apiGet<{ items: AnalysisSummary[]; total: number; total_pages: number }>(`/summaries?type=${t}&page=${p}&page_size=${PAGE_SIZE}`)
      if (d.code === 0 && d.data) {
        setItems(d.data.items || [])
        setTotal(d.data.total)
        setTotalPages(d.data.total_pages || 1)
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { setPage(1); void fetchPage(1, type) }, [type, fetchPage])
  useEffect(() => { if (page > 1) void fetchPage(page, type) }, [page, type, fetchPage])

  const genNext = async () => {
    setBusy(true)
    try {
      const d = await apiPost(`/summaries/generate-next?type=${type}`)
      setToast(d.code === 0 ? (d.message || "已生成") : (d.message || "生成失败"))
      if (d.code === 0) void fetchPage(page, type)
    } finally { setBusy(false); setTimeout(() => setToast(""), 2200) }
  }

  const clearAll = async () => {
    if (!confirm("确定清除所有周/月/年报（保留日报）？")) return
    setBusy(true)
    try {
      const d = await apiDelete("/summaries?exclude_daily=true")
      setToast(d.code === 0 ? "已清除" : "操作失败")
      if (d.code === 0) { setPage(1); void fetchPage(1, type) }
    } finally { setBusy(false); setTimeout(() => setToast(""), 2200) }
  }

  const delOne = async (id: number) => {
    if (!confirm("删除这条报告？")) return
    const d = await apiDelete(`/summaries/${id}`)
    if (d.code === 0) void fetchPage(page, type)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 头部 + 类型 Tab */}
      <div className="shrink-0 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">营养报告</h2>
          <div className="flex gap-1.5">
            <button onClick={() => void genNext()} disabled={busy} className="flex items-center gap-1 rounded-lg border border-green-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-green-600 active:scale-95 disabled:opacity-50">
              {busy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} 生成
            </button>
            <button onClick={() => void clearAll()} disabled={busy} className="flex items-center gap-1 rounded-lg border border-red-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-red-500 active:scale-95 disabled:opacity-50">
              <Trash2 className="h-3 w-3" /> 清除
            </button>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                type === t.key ? "text-white shadow-md" : "bg-white/70 text-gray-500"
              )}
              style={type === t.key ? { backgroundImage: `linear-gradient(to right, ${t.from}, ${t.to})` } : undefined}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        {loading && items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> 加载中…</div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-sm text-gray-400"><FileText className="mb-2 h-8 w-8 text-gray-300" /> 暂无报告</div>
        ) : (
          <div className="space-y-2.5">
            {items.map((r) => {
              const cfg = TYPES.find((t) => t.key === r.summary_type) || TYPES[0]
              const ins = r.insights
              return (
                <div key={r.id} className="relative overflow-hidden rounded-2xl border border-green-100/70 bg-white/85 backdrop-blur-sm">
                  <button onClick={() => setDetail(r)} className="block w-full p-3.5 text-left active:bg-gray-50">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundImage: `linear-gradient(to right, ${cfg.from}, ${cfg.to})` }}>
                        {cfg.emoji} {cfg.label}
                      </span>
                      <span className="text-[11px] text-gray-400">{r.summary_date}</span>
                    </div>
                    <div className="mb-2 grid grid-cols-4 gap-1.5">
                      {[["热量", metric(ins.total_energy_kcal), "kcal"], ["蛋白", metric(ins.total_protein_g), "g"], ["脂肪", metric(ins.total_fat_g), "g"], ["碳水", metric(ins.total_carbohydrate_g), "g"]].map(([l, v, u]) => (
                        <div key={l} className="rounded-lg bg-gray-50 py-1.5 text-center">
                          <div className="text-xs font-bold text-gray-800">{v}</div>
                          <div className="text-[9px] text-gray-400">{l}·{u}</div>
                        </div>
                      ))}
                    </div>
                    {ins.top_foods && ins.top_foods.length > 0 && (
                      <div className="truncate text-[11px] text-gray-500">常吃: {ins.top_foods.slice(0, 4).map((f) => f.name).join("、")}</div>
                    )}
                    {ins.ai_summary && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-purple-500"><Sparkles className="h-3 w-3" /> 含AI总结</div>
                    )}
                  </button>
                  <button onClick={() => void delOne(r.id)} className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-gray-300 hover:text-red-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 分页 */}
      <div className="flex shrink-0 items-center justify-between border-t border-green-100/70 bg-white/70 px-4 py-2 backdrop-blur-sm">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-xs text-gray-500">第 {page} / {totalPages} 页 · {total}条</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
      </div>

      <AnimatePresence>
        {detail && <DetailSheet summary={detail} onClose={() => setDetail(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-gray-800 px-4 py-2 text-xs text-white shadow-lg">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function DetailSheet({ summary, onClose }: { summary: AnalysisSummary; onClose: () => void }) {
  const cfg = TYPES.find((t) => t.key === summary.summary_type) || TYPES[0]
  const isDaily = summary.summary_type === "daily"
  const [tab, setTab] = useState<"info" | "foods" | "ai">("info")
  const ins = summary.insights
  const denom = summary.summary_type === "weekly" ? 7 : summary.summary_type === "monthly" ? 30 : summary.summary_type === "yearly" ? 365 : 1
  const topFoods = ins.top_foods || []
  const maxCount = Math.max(...topFoods.map((f) => f.count), 1)

  const baseNutrients = [
    ["总热量", metric(ins.total_energy_kcal), "kcal"],
    ["蛋白质", metric(ins.total_protein_g), "g"],
    ["脂肪", metric(ins.total_fat_g), "g"],
    ["碳水", metric(ins.total_carbohydrate_g), "g"],
  ]
  const micro = [
    ["钠", ins.total_sodium_mg], ["胆固醇", ins.total_cholesterol_mg], ["维C", ins.total_vitamin_c_mg],
    ["钙", ins.total_calcium_mg], ["铁", ins.total_iron_mg], ["钾", ins.total_potassium_mg],
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl bg-white"
      >
        <div className="mx-auto my-3 h-1 w-10 shrink-0 rounded-full bg-gray-200" />
        <div className="flex items-center justify-between px-5 pb-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ backgroundImage: `linear-gradient(to right, ${cfg.from}, ${cfg.to})` }}>{cfg.emoji} {cfg.label}</span>
            <span className="text-sm text-gray-500">{summary.summary_date}</span>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        {/* Tabs (非日报) */}
        {!isDaily && (
          <div className="mx-5 mb-2 flex shrink-0 rounded-xl bg-gray-100 p-1">
            {[["info", "基本信息"], ["foods", "常吃食物"], ["ai", "AI总结"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k as "info" | "foods" | "ai")} className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium", tab === k ? "bg-white text-green-700 shadow-sm" : "text-gray-500")}>{l}</button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          {(isDaily || tab === "info") && (
            <div>
              {!isDaily && ins.period_start && (
                <div className="mb-3 text-xs text-gray-400">周期: {ins.period_start} ~ {ins.period_end}</div>
              )}
              <div className="mb-3 grid grid-cols-2 gap-2">
                {baseNutrients.map(([l, v, u]) => (
                  <div key={l} className="rounded-xl bg-gray-50 p-2.5">
                    <div className="text-[11px] text-gray-400">{l}{!isDaily && ins.total_energy_kcal ? ` · 日均${metric((Number(v) || 0) / denom)}` : ""}</div>
                    <div className="text-base font-bold text-gray-800">{v}<span className="ml-1 text-[10px] font-normal text-gray-400">{u}</span></div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                {micro.map(([l, v]) => (v != null && v > 0 ? <span key={l}>{l}: {metric(v)}mg</span> : null))}
              </div>
            </div>
          )}
          {(isDaily || tab === "foods") && topFoods.length > 0 && (
            <div className="space-y-2">
              {topFoods.slice(0, 10).map((f, i) => (
                <div key={f.name} className="flex items-center gap-2">
                  <span className="w-4 text-xs font-bold text-gray-400">{i + 1}</span>
                  <div className="flex-1">
                    <div className="mb-1 flex justify-between text-xs"><span className="text-gray-700">{f.name}</span><span className="text-gray-400">{f.count}次</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><motion.div className="h-full rounded-full" style={{ backgroundImage: `linear-gradient(to right, ${cfg.from}, ${cfg.to})` }} initial={{ width: 0 }} animate={{ width: `${(f.count / maxCount) * 100}%` }} transition={{ duration: 0.5 }} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "ai" && (
            <div className="space-y-3">
              {ins.ai_summary ? (
                <div className="rounded-xl bg-purple-50 p-3">
                  <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-purple-600"><Sparkles className="h-3 w-3" /> 本期总结</div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">{ins.ai_summary}</p>
                </div>
              ) : <div className="text-center text-xs text-gray-400">暂无AI总结</div>}
              {ins.ai_advice && (
                <div className="rounded-xl bg-green-50 p-3">
                  <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-green-600">💡 下期建议</div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">{ins.ai_advice}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
