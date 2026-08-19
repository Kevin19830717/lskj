import { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import {
  Stethoscope,
  ArrowLeft,
  Sparkles,
  ListChecks,
  HeartPulse,
  TriangleAlert,
} from "lucide-react"
import AppShell from "@/components/app-shell"
import { GlowCard, AnimatedNumber } from "@/components/fx"
import { ReportUpload } from "@/components/medical/report-upload"
import { IndicatorTable } from "@/components/medical/indicator-table"
import { RiskCards } from "@/components/medical/risk-cards"
import { TrendChart } from "@/components/medical/trend-chart"
import { AiInsight } from "@/components/medical/ai-insight"
import { parseMedicalReport } from "@/lib/api"
import { adaptMedicalReport } from "@/lib/medical-adapter"
import {
  type Indicator,
  assessRisks,
  judgeIndicator,
} from "@/lib/medical-rules"
import { MOCK_INDICATORS, MOCK_TRENDS, MOCK_TREND_DATES, MOCK_AI_SUMMARY } from "@/lib/medical-mock"

/** 本地历史记录（趋势图数据源），最多保留 12 次 */
const HISTORY_KEY = "lskj_medical_history"

interface HistoryEntry {
  date: string // YYYY-MM-DD
  values: Record<string, number>
}

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")
  } catch {
    return []
  }
}

function saveHistory(indicators: Indicator[]): HistoryEntry[] {
  const values: Record<string, number> = {}
  for (const i of indicators) values[i.code] = i.value
  const entry: HistoryEntry = {
    date: new Date().toISOString().slice(0, 10),
    values,
  }
  const next = [...loadHistory().filter((e) => e.date !== entry.date), entry].slice(-12)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  return next
}

/** 从本地历史构建趋势序列：code -> 数值数组（末位为本次） */
function buildTrends(history: HistoryEntry[], indicators: Indicator[]) {
  const trends: Record<string, number[]> = {}
  const dates = history.map((e) => e.date.slice(5).replace("-", "/"))
  for (const ind of indicators) {
    const series = history.map((e) => e.values[ind.code]).filter((v) => v != null)
    if (series.length >= 1) trends[ind.code] = series
  }
  return { trends, dates }
}

interface ParseResult {
  indicators: Indicator[]
  rawSummary?: string
  isDemo: boolean
}

export default function MedicalReportPage() {
  const navigate = useNavigate()
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [trendData, setTrendData] = useState<{ trends: Record<string, number[]>; dates: string[] } | null>(null)

  const risks = useMemo(() => (result ? assessRisks(result.indicators) : []), [result])
  const abnormalCount = useMemo(
    () => (result ? result.indicators.filter((i) => judgeIndicator(i) !== "normal").length : 0),
    [result],
  )
  const highRiskCount = risks.filter((r) => r.level === "high").length

  /** 真实解析：上传图片 -> 后端多模态 OCR -> 规则引擎 */
  const handleParse = async (file: File) => {
    setParsing(true)
    setError(null)
    try {
      const data = await parseMedicalReport(file)
      const indicators = adaptMedicalReport(data)
      if (indicators.length === 0) {
        throw new Error("未能识别出有效指标，请确保照片完整清晰")
      }
      const history = saveHistory(indicators)
      const { trends, dates } = buildTrends(history, indicators)
      setTrendData({ trends, dates })
      setResult({ indicators, rawSummary: data.summary_text, isDemo: false })
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析失败，请稍后重试")
    } finally {
      setParsing(false)
    }
  }

  /** 示例数据演示（后端不可用时） */
  const handleDemo = () => {
    setError(null)
    setTrendData({ trends: MOCK_TRENDS, dates: MOCK_TREND_DATES })
    setResult({ indicators: MOCK_INDICATORS, rawSummary: MOCK_AI_SUMMARY, isDemo: true })
  }

  const handleReset = () => {
    setResult(null)
    setError(null)
    setTrendData(null)
  }

  return (
    <AppShell
      title="体检报告解读"
      titleIcon={<Stethoscope className="h-6 w-6 text-green-600" />}
      theme="green"
    >
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {/* 顶部操作条 */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/reports")}
            className="flex items-center gap-1 rounded-lg border border-green-200 bg-white/80 px-2.5 py-1.5 text-xs text-gray-600 transition hover:bg-green-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回报告中心
          </button>
          {!result && (
            <button
              onClick={handleDemo}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-green-600 to-emerald-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:brightness-110 active:scale-95"
            >
              <Sparkles className="h-3.5 w-3.5" />
              示例数据演示
            </button>
          )}
          {result && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-white/80 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-green-50"
            >
              重新上传
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {!result ? (
            /* ---------- 上传视图 ---------- */
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-4"
            >
              <GlowCard theme="green">
                <div className="py-2 text-center">
                  <h2 className="text-lg font-bold text-gray-800">🩺 体检报告智能解读</h2>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    上传体检报告照片，AI 多模态识别指标 → 慢病/癌症早筛风险分层 → 解读与饮食干预建议
                  </p>
                </div>
              </GlowCard>
              <ReportUpload parsing={parsing} error={error} onParse={handleParse} onReset={handleReset} />
            </motion.div>
          ) : (
            /* ---------- 结果视图 ---------- */
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* 统计总览条 */}
              <GlowCard theme="green">
                <div className="grid grid-cols-3 divide-x divide-green-100">
                  <Stat icon={<ListChecks className="h-4 w-4 text-green-600" />} label="识别指标" value={result.indicators.length} unit="项" />
                  <Stat icon={<TriangleAlert className="h-4 w-4 text-amber-500" />} label="异常指标" value={abnormalCount} unit="项" />
                  <Stat icon={<HeartPulse className="h-4 w-4 text-red-500" />} label="高风险项" value={highRiskCount} unit="项" />
                </div>
                {result.isDemo && (
                  <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-center text-[10px] text-amber-600">
                    当前为示例数据演示
                  </div>
                )}
              </GlowCard>

              {/* 风险卡片 */}
              <section>
                <SectionTitle icon="🎯" title="慢病风险分层" />
                <RiskCards risks={risks} />
              </section>

              {/* AI 解读 */}
              <section>
                <SectionTitle icon="🤖" title="AI 解读与干预建议" />
                <AiInsight indicators={result.indicators} risks={risks} rawSummary={result.rawSummary} />
              </section>

              {/* 趋势 */}
              {trendData && (
                <section>
                  <SectionTitle icon="📈" title="指标趋势追踪" />
                  <TrendChart trends={trendData.trends} dates={trendData.dates} indicators={result.indicators} />
                </section>
              )}

              {/* 指标明细 */}
              <section>
                <SectionTitle icon="📋" title="指标明细" />
                <IndicatorTable indicators={result.indicators} />
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  )
}

function Stat({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: number; unit: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-1">
      <div className="flex items-center gap-1 text-[11px] text-gray-500">
        {icon}
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums text-gray-800">
        <AnimatedNumber value={value} duration={0.8} />
        <span className="ml-0.5 text-[11px] font-normal text-gray-400">{unit}</span>
      </div>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <h3 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-bold text-gray-700">
      <span>{icon}</span>
      {title}
    </h3>
  )
}
