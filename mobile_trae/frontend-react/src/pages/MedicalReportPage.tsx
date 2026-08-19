import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  ChevronLeft, ClipboardList, Sparkles, Trash2, History, FileText,
  TrendingUp, AlertTriangle, CalendarDays, PlayCircle,
} from "lucide-react"
import AppShell from "@/components/app-shell"
import { GlowCard, AnimatedNumber } from "@/components/fx"
import { ReportUpload } from "@/components/medical/report-upload"
import { IndicatorTable } from "@/components/medical/indicator-table"
import { RiskCards } from "@/components/medical/risk-cards"
import { TrendChart } from "@/components/medical/trend-chart"
import { AiInsight } from "@/components/medical/ai-insight"
import {
  analyzeMedicalReport, getMedicalReportList, getMedicalReportDetail,
  deleteMedicalReport, updateMedicalQuickStats,
  type MedicalReportRecord, type MedicalReportListItem, type MedicalAiSummary,
} from "@/lib/api"
import { adaptMedicalReport } from "@/lib/medical-adapter"
import { assessRisks, judgeIndicator, type Indicator, type RiskAssessment } from "@/lib/medical-rules"
import { MOCK_INDICATORS, MOCK_TRENDS, MOCK_TREND_DATES, MOCK_AI_SUMMARY } from "@/lib/medical-mock"

/** 当前打开的报告（id 为 null 表示本地演示模式，不入库） */
interface ActiveReport {
  id: number | null
  indicators: Indicator[]
  risks: RiskAssessment[]
  aiSummary?: MedicalAiSummary
  reportDate?: string | null
  createdAt?: string
}

const fmtDate = (s?: string | null) => (s ? String(s).slice(0, 10) : "未知日期")

export default function MedicalReportPage() {
  const [view, setView] = useState<"history" | "detail">("history")
  const [historyList, setHistoryList] = useState<MedicalReportListItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [active, setActive] = useState<ActiveReport | null>(null)
  const [trendData, setTrendData] = useState<{ dates: string[]; trends: Record<string, number[]> } | null>(null)
  const [trendLoading, setTrendLoading] = useState(false)

  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true)
      setHistoryList(await getMedicalReportList(20))
    } catch {
      setHistoryList([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  /** 组装详情视图数据 */
  const openReport = useCallback(
    async (
      record: Pick<MedicalReportRecord, "id" | "indicators" | "ai_summary" | "report_date" | "created_at">,
      fallbackDate: string,
    ) => {
      const indicators = adaptMedicalReport({
        indicators: record.indicators || [],
        report_date: record.report_date || undefined,
      })
      setActive({
        id: record.id,
        indicators,
        risks: assessRisks(indicators),
        aiSummary: record.ai_summary,
        reportDate: record.report_date || fallbackDate,
        createdAt: record.created_at,
      })
      setView("detail")
      setTrendData(null)
      window.scrollTo({ top: 0 })
    },
    [],
  )

  /** 上传 -> OCR + 综合分析 -> 入库 -> 打开详情 */
  const handleAnalyze = useCallback(
    async (file: File) => {
      setParsing(true)
      setParseError(null)
      try {
        const record = await analyzeMedicalReport(file)
        const indicators = adaptMedicalReport({
          indicators: record.indicators || [],
          report_date: record.report_date || undefined,
        })
        const risks = assessRisks(indicators)
        const stats = {
          total: indicators.length,
          abnormal: indicators.filter((i) => judgeIndicator(i) !== "normal").length,
          significant: indicators.filter((i) => ["critical_high", "critical_low"].includes(judgeIndicator(i))).length,
          risk_levels: risks
            .filter((r) => r.level !== "low")
            .map((r) => ({ name: r.name, score: Math.round(r.score), level: r.level })),
        }
        setActive({
          id: record.id,
          indicators,
          risks,
          aiSummary: record.ai_summary,
          reportDate: record.report_date,
          createdAt: record.created_at,
        })
        setView("detail")
        setTrendData(null)
        window.scrollTo({ top: 0 })
        // 回写精确统计 + 静默刷新历史列表（不阻塞展示）
        updateMedicalQuickStats(record.id, stats)
        loadHistory()
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "分析失败，请重试")
      } finally {
        setParsing(false)
      }
    },
    [loadHistory],
  )

  /** 点击历史卡片 -> 拉详情 */
  const handleOpenItem = useCallback(
    async (item: MedicalReportListItem) => {
      try {
        const record = await getMedicalReportDetail(item.id)
        await openReport(record, fmtDate(item.created_at))
      } catch {
        setParseError("加载报告详情失败，请重试")
      }
    },
    [openReport],
  )

  /** 用数据库里的历史记录构建真实趋势（最近 6 份，含当前） */
  useEffect(() => {
    if (view !== "detail" || !active || active.id === null || trendData) return
    const currentId: number = active.id
    let cancelled = false
    ;(async () => {
      try {
        setTrendLoading(true)
        const list = historyList.length
          ? historyList
          : await getMedicalReportList(6)
        const ids = [currentId, ...list.map((i) => i.id).filter((id) => id !== currentId)].slice(0, 6)
        const records = await Promise.all(ids.map((id) => getMedicalReportDetail(id).catch(() => null)))
        const valid = records.filter(Boolean) as MedicalReportRecord[]
        // 按日期升序排列
        valid.sort((a, b) =>
          String(a.report_date || a.created_at).localeCompare(String(b.report_date || b.created_at)),
        )
        const dates = valid.map((r) => fmtDate(r.report_date || r.created_at))
        const perCode: Record<string, (number | null)[]> = {}
        for (const r of valid) {
          const inds = adaptMedicalReport({ indicators: r.indicators || [] })
          const seen = new Set<string>()
          for (const ind of inds) {
            if (seen.has(ind.code)) continue
            seen.add(ind.code)
            ;(perCode[ind.code] ||= []).push(ind.value)
          }
          // 补齐缺失位
          for (const code of Object.keys(perCode)) {
            if (perCode[code].length < dates.length) perCode[code].push(null as unknown as number)
          }
        }
        // 只保留 >= 2 个有效点的指标
        const trends: Record<string, number[]> = {}
        for (const [code, arr] of Object.entries(perCode)) {
          const series = arr.slice(0, dates.length)
          while (series.length < dates.length) series.push(null as unknown as number)
          if (series.filter((v) => typeof v === "number").length >= 2) trends[code] = series as number[]
        }
        if (!cancelled) setTrendData({ dates, trends })
      } catch {
        /* 趋势失败不阻断详情 */
      } finally {
        if (!cancelled) setTrendLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [view, active, trendData, historyList])

  const handleDelete = useCallback(
    async (id: number) => {
      if (!window.confirm("确定删除这份体检报告吗？删除后不可恢复。")) return
      setDeletingId(id)
      try {
        await deleteMedicalReport(id)
        setHistoryList((l) => l.filter((i) => i.id !== id))
        if (active?.id === id) {
          setActive(null)
          setView("history")
          setTrendData(null)
        }
      } catch {
        setParseError("删除失败，请重试")
      } finally {
        setDeletingId(null)
      }
    },
    [active],
  )

  /** 本地演示（不入库） */
  const runDemo = useCallback(() => {
    setActive({
      id: null,
      indicators: MOCK_INDICATORS,
      risks: assessRisks(MOCK_INDICATORS),
      aiSummary: { overall: MOCK_AI_SUMMARY },
      reportDate: new Date().toISOString().slice(0, 10),
    })
    setTrendData({ dates: MOCK_TREND_DATES, trends: MOCK_TRENDS })
    setView("detail")
  }, [])

  const stats = useMemo(() => {
    if (!active) return { total: 0, abnormal: 0, significant: 0, highRisk: 0 }
    return {
      total: active.indicators.length,
      abnormal: active.indicators.filter((i) => judgeIndicator(i) !== "normal").length,
      significant: active.indicators.filter((i) =>
        ["critical_high", "critical_low"].includes(judgeIndicator(i)),
      ).length,
      highRisk: active.risks.filter((r) => r.level === "high").length,
    }
  }, [active])

  return (
    <AppShell theme="green" title="体检报告">
      <div className="mx-auto w-full max-w-4xl space-y-4 pb-20">
        {/* ==================== 历史视图 ==================== */}
        {view === "history" && (
          <>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <GlowCard theme="green">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-gradient-to-br from-green-600 to-emerald-400 p-1.5">
                        <ClipboardList className="h-4 w-4 text-white" />
                      </div>
                      <h1 className="text-base font-bold text-gray-800">体检报告智能解读</h1>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-gray-500">
                      上传体检报告照片，多模态 OCR 提取指标并<span className="font-medium text-green-700">关联你的餐食记录与营养报告</span>，
                      由 AI 做综合健康分析。所有报告云端持久保存，可随时回看历史。
                    </p>
                  </div>
                  <button
                    onClick={runDemo}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-[11px] font-medium text-green-700 transition hover:bg-green-100 active:scale-95"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    示例演示
                  </button>
                </div>
              </GlowCard>
            </motion.div>

            <ReportUpload
              parsing={parsing}
              error={parseError}
              onParse={handleAnalyze}
              onReset={() => setParseError(null)}
              footer={
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1 pt-1">
                    <History className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-semibold text-gray-800">历史体检报告</span>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      {historyList.length} 份
                    </span>
                  </div>

                  {historyLoading ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-32 animate-pulse rounded-2xl border border-green-100 bg-green-50/50" />
                      ))}
                    </div>
                  ) : historyList.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-green-200 bg-white/60 py-10 text-center">
                      <FileText className="h-8 w-8 text-green-300" />
                      <p className="text-xs text-gray-400">还没有体检报告，上传第一份开始云端健康档案吧</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {historyList.map((item, idx) => {
                        const risks = (item.quick_stats?.risk_levels || []) as { name: string; level: string; score: number }[]
                        const abnormal = item.quick_stats?.abnormal as number | undefined
                        return (
                          <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.06 }}
                          >
                            <GlowCard theme="green" className="group cursor-pointer transition-transform hover:-translate-y-0.5">
                              <div onClick={() => handleOpenItem(item)}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-800">
                                    <CalendarDays className="h-3.5 w-3.5 text-green-600" />
                                    {fmtDate(item.report_date)}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDelete(item.id)
                                    }}
                                    disabled={deletingId === item.id}
                                    className="rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                                    title="删除"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                                    {item.indicator_count ?? "—"} 项指标
                                  </span>
                                  {typeof abnormal === "number" && abnormal > 0 ? (
                                    <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                                      <AlertTriangle className="h-3 w-3" />
                                      {abnormal} 项异常
                                    </span>
                                  ) : (
                                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                                      全部正常
                                    </span>
                                  )}
                                  {risks.slice(0, 2).map((r) => (
                                    <span
                                      key={r.name}
                                      className={
                                        "rounded-md px-2 py-0.5 text-[10px] font-medium " +
                                        (r.level === "high"
                                          ? "bg-red-50 text-red-500"
                                          : "bg-orange-50 text-orange-500")
                                      }
                                    >
                                      {r.name} {r.score}
                                    </span>
                                  ))}
                                </div>

                                <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-gray-500">
                                  {item.overall || "AI 综合解读（含餐食营养关联分析）…"}
                                </p>
                                <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-green-600 opacity-0 transition group-hover:opacity-100">
                                  查看完整分析 <ChevronLeft className="h-3 w-3 rotate-180" />
                                </div>
                              </div>
                            </GlowCard>
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </div>
              }
            />
          </>
        )}

        {/* ==================== 详情视图 ==================== */}
        {view === "detail" && active && (
          <>
            {/* 顶栏：返回 + 标题 */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  setView("history")
                  setActive(null)
                  setTrendData(null)
                  loadHistory()
                }}
                className="flex items-center gap-1 rounded-full border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-green-50 active:scale-95"
              >
                <ChevronLeft className="h-4 w-4" />
                返回历史
              </button>
              <div className="flex items-center gap-2">
                {active.id === null && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-medium text-amber-700">演示数据</span>
                )}
                <span className="text-xs font-medium text-gray-500">{fmtDate(active.reportDate)} 体检报告</span>
                {active.id !== null && (
                  <button
                    onClick={() => handleDelete(active.id!)}
                    disabled={deletingId === active.id}
                    className="rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                    title="删除这份报告"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </motion.div>

            {/* 统计总览 */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <GlowCard theme="green">
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: "检测指标", value: stats.total, color: "text-gray-800", suffix: "项" },
                    { label: "异常指标", value: stats.abnormal, color: "text-amber-500", suffix: "项" },
                    { label: "显著异常", value: stats.significant, color: "text-red-500", suffix: "项" },
                    { label: "高风险慢病", value: stats.highRisk, color: "text-red-500", suffix: "项" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className={"text-xl font-bold " + s.color}>
                        <AnimatedNumber value={s.value} />
                        <span className="ml-0.5 text-[10px] font-normal text-gray-400">{s.suffix}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-gray-400">{s.label}</div>
                    </div>
                  ))}
                </div>
              </GlowCard>
            </motion.div>

            {/* AI 综合解读（体检 + 餐食 + 营养联动） */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <AiInsight indicators={active.indicators} risks={active.risks} aiSummary={active.aiSummary} />
            </motion.div>

            {/* 慢病风险分层 */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <Sparkles className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-gray-800">慢病风险分层</span>
              </div>
              <RiskCards risks={active.risks} />
            </motion.div>

            {/* 历史趋势（云端历史记录构建） */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-gray-800">指标历史趋势</span>
                {trendLoading && <span className="text-[10px] text-gray-400">加载云端历史…</span>}
              </div>
              {trendData ? (
                <TrendChart trends={trendData.trends} dates={trendData.dates} indicators={active.indicators} />
              ) : (
                <GlowCard theme="green">
                  <p className="py-4 text-center text-xs text-gray-400">
                    {trendLoading ? "正在从云端读取历史体检记录…" : "暂无趋势数据，再上传一份报告即可对比历史变化"}
                  </p>
                </GlowCard>
              )}
            </motion.div>

            {/* 指标明细 */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <ClipboardList className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-gray-800">指标明细</span>
              </div>
              <IndicatorTable indicators={active.indicators} />
            </motion.div>
          </>
        )}
      </div>
    </AppShell>
  )
}
