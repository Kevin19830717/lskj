import { useEffect, useMemo, useState } from "react"
import type { DateRange } from "react-aria-components"
import AppShell from "@/components/app-shell"
import { apiGet, apiPut, apiDelete, type PaginatedRecords, type WeighRecord } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { motion, AnimatePresence } from "framer-motion"
import { JollyDateRangePicker } from "@/components/ui/date-range-picker"
import { ClipboardList, ChevronDown, ChevronLeft, ChevronRight, Search, Clock, Flame, Beef, Droplets, Wheat, Scale, ChefHat, Utensils, Pencil, Trash2 } from "lucide-react"

// ============================================================
// 工具函数
// ============================================================
function formatDateTime(dateStr?: string) {
  if (!dateStr) return "-"
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function formatMetric(value?: number, digits = 1) {
  if (value == null) return "-"
  return digits === 0 ? String(Math.round(value)) : value.toFixed(digits)
}

function formatDateTimeForInput(dateStr?: string) {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ""
  // 转成 datetime-local 格式: yyyy-MM-ddTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ============================================================
// 烹饪方式颜色映射 — 7种方式对应7种颜色
// ============================================================
export const COOKING_COLORS: Record<string, { from: string; to: string; text: string; bg: string }> = {
  boil:      { from: "#38bdf8", to: "#0284c7", text: "#0369a1", bg: "#e0f2fe" },  // 煮 — 蓝
  braise:    { from: "#fb923c", to: "#c2410c", text: "#9a3412", bg: "#ffedd5" },  // 炖 — 橙
  deep_fry:  { from: "#f87171", to: "#dc2626", text: "#b91c1c", bg: "#fee2e2" },  // 炸 — 红
  pan_fry:   { from: "#fbbf24", to: "#d97706", text: "#b45309", bg: "#fef3c7" },  // 煎 — 黄
  roast:     { from: "#c084fc", to: "#7e22ce", text: "#6b21a8", bg: "#f3e8ff" },  // 烤 — 紫
  steam:     { from: "#4ade80", to: "#16a34a", text: "#15803d", bg: "#dcfce7" },  // 蒸 — 绿
  stir_fry:  { from: "#2dd4bf", to: "#0d9488", text: "#0f766e", bg: "#ccfbf1" },  // 炒 — 青
}
const DEFAULT_COOKING_C = { from: "#9ca3af", to: "#4b5563", text: "#374151", bg: "#f3f4f6" }
export function cookingColor(method?: string) {
  return (method && COOKING_COLORS[method]) ? COOKING_COLORS[method] : DEFAULT_COOKING_C
}

function cookingLabel(record: WeighRecord) {
  return record.cooking_method_label || record.cooking_method || "-"
}

// ============================================================
// 烹饪方式标签 — 简单彩色背景（不用渐变标签框）
// ============================================================
function CookingTag({ method, label }: { method?: string; label: string }) {
  const c = cookingColor(method)
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ color: c.text, backgroundColor: c.bg }}
    >
      {label}
    </span>
  )
}

// ============================================================
// 展开行详情面板 — 蓝紫色背景，烹饪方式用对应颜色
// ============================================================
function RecordDetail({ record }: { record: WeighRecord }) {
  const names = record.ingredient_names?.length ? record.ingredient_names : record.ingredients
  const weights = record.raw_weights_g || []
  const cc = cookingColor(record.cooking_method)
  const methodLabel = cookingLabel(record)

  const coreMetrics = [
    { icon: <Flame className="h-4 w-4" />, label: "热量", value: record.cooked_energy_kcal, unit: "kcal", color: "#FF5722" },
    { icon: <Beef className="h-4 w-4" />, label: "蛋白质", value: record.cooked_protein_g, unit: "g", color: "#E91E63" },
    { icon: <Droplets className="h-4 w-4" />, label: "脂肪", value: record.cooked_fat_g, unit: "g", color: "#FF9800" },
    { icon: <Wheat className="h-4 w-4" />, label: "碳水", value: record.cooked_carbohydrate_g, unit: "g", color: "#4CAF50" },
  ]

  const detailMetrics = [
    { label: "钠", value: record.cooked_sodium_mg, unit: "mg" },
    { label: "胆固醇", value: record.cooked_cholesterol_mg, unit: "mg" },
    { label: "维生素C", value: record.cooked_vitamin_c_mg, unit: "mg" },
    { label: "钙", value: record.cooked_calcium_mg, unit: "mg" },
    { label: "铁", value: record.cooked_iron_mg, unit: "mg" },
    { label: "钾", value: record.cooked_potassium_mg, unit: "mg" },
  ].filter((m) => m.value != null && m.value > 0)

  return (
    <div className="mx-4 my-3 rounded-2xl bg-gradient-to-br from-[#f0f2ff] via-[#eef1ff] to-[#f6f7ff] border border-[#dde0ff] overflow-hidden">
      {/* 顶部装饰条 */}
      <div className="h-1.5 bg-gradient-to-r from-[#667eea] to-[#764ba2]" />

      <div className="p-5">
        <div className="grid gap-5 md:grid-cols-[0.9fr_1fr]">
          {/* 食材明细 — 整体垂直居中 */}
          <div className="rounded-xl bg-white/70 backdrop-blur-sm p-5 shadow-sm border border-white/50 flex flex-col justify-center min-h-[240px]">
            <h5 className="flex items-center justify-center gap-2 text-sm font-semibold text-[#667eea] mb-4">
              <Scale className="h-4 w-4 text-[#667eea]" /> 食材明细
            </h5>
            <div className="space-y-2.5 flex flex-col items-center">
              {names.map((name, i) => (
                <div key={i} className="flex items-center justify-between w-full max-w-[200px] py-1 text-base">
                  <span className="text-gray-700 font-medium">{name}</span>
                  {weights[i] != null && (
                    <span className="rounded px-2.5 py-0.5 text-sm font-semibold" style={{ color: cc.text, backgroundColor: cc.bg }}>
                      {Math.round(weights[i])}g
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* 烹饪方式 + 用餐时间(created_at) — 竖直居中 */}
            <div className="pt-4 mt-5 border-t border-[#667eea]/15 flex flex-col items-center gap-2.5">
              {record.cooking_method && (
                <div className="flex items-center justify-center gap-2 text-base">
                  <span className="flex items-center gap-1.5 text-[#667eea] font-medium">
                    <ChefHat className="h-4 w-4 text-[#667eea]" /> 烹饪方式
                  </span>
                  <CookingTag method={record.cooking_method} label={methodLabel} />
                </div>
              )}
              <div className="flex items-center justify-center gap-2 text-base">
                <span className="flex items-center gap-1.5 text-[#667eea] font-medium">
                  <Clock className="h-4 w-4 text-[#667eea]" /> 用餐时间
                </span>
                <span className="rounded px-2.5 py-0.5 text-sm font-semibold" style={{ color: cc.text, backgroundColor: cc.bg }}>
                  {formatDateTime(record.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* 营养数据 */}
          <div className="space-y-3">
            <h5 className="flex items-center justify-center gap-2 text-sm font-semibold text-[#667eea]">
              <Utensils className="h-4 w-4 text-[#667eea]" /> 营养数据
            </h5>
            {/* 核心营养素 */}
            <div className="grid grid-cols-2 gap-2.5">
              {coreMetrics.map((m) => (
                <div key={m.label} className="rounded-xl bg-white/70 backdrop-blur-sm p-3 text-center shadow-sm border border-white/50">
                  <div className="flex items-center justify-center gap-1 text-xs text-gray-500 mb-1">
                    <span style={{ color: m.color }}>{m.icon}</span> {m.label}
                  </div>
                  <div className="text-lg font-bold" style={{ color: m.color }}>
                    {formatMetric(m.value, m.label === "热量" ? 0 : 1)}
                    <span className="text-xs font-normal text-gray-400 ml-0.5">{m.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 详细营养素 */}
            {detailMetrics.length > 0 && (
              <div className="rounded-xl bg-white/70 backdrop-blur-sm p-3 shadow-sm border border-white/50">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  {detailMetrics.map((m) => (
                    <div key={m.label} className="text-center py-1">
                      <div className="font-bold text-[#5a6fd8]">{formatMetric(m.value)} {m.unit}</div>
                      <div className="text-gray-400 mt-0.5">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 主页面
// ============================================================
export default function RecordsPage() {
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [records, setRecords] = useState<PaginatedRecords | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [editingRecord, setEditingRecord] = useState<WeighRecord | null>(null)
  const [editItems, setEditItems] = useState<{ name: string; weight: string }[]>([])
  const [editCookingMethod, setEditCookingMethod] = useState("")
  const [editDateTime, setEditDateTime] = useState("")
  const [editEnergy, setEditEnergy] = useState("")
  const [editProtein, setEditProtein] = useState("")
  const [editFat, setEditFat] = useState("")
  const [editCarb, setEditCarb] = useState("")
  const [editWeight, setEditWeight] = useState("")
  const [savingRecordId, setSavingRecordId] = useState<number | null>(null)
  const [deletingRecordId, setDeletingRecordId] = useState<number | null>(null)

  const startDate = dateRange?.start ? dateRange.start.toString() : ""
  const endDate = dateRange?.end ? dateRange.end.toString() : ""

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams({
      page: String(currentPage),
      page_size: "15",
    })
    if (startDate) params.set("start_date", startDate)
    if (endDate) params.set("end_date", endDate)
    apiGet<PaginatedRecords>(`/records?${params.toString()}`).then(res => {
      if (!cancelled) {
        setRecords(res.data ?? null)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [currentPage, startDate, endDate])

  const pageButtons = useMemo(() => {
    const totalPages = records?.total_pages ?? 0
    const page = records?.page ?? 1
    const start = Math.max(1, page - 2)
    const end = Math.min(totalPages, page + 2)
    return Array.from({ length: Math.max(end - start + 1, 0) }, (_, i) => start + i)
  }, [records])

  const total = records?.total ?? 0
  const items = records?.items ?? []

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.trim().toLowerCase()
    return items.filter((r) => {
      const names = r.ingredient_names?.length ? r.ingredient_names : r.ingredients
      return names.some((n) => n.toLowerCase().includes(q))
        || (r.cooking_method_label || r.cooking_method || "").toLowerCase().includes(q)
    })
  }, [items, searchQuery])

  const refreshRecords = () => {
    const params = new URLSearchParams({ page: String(currentPage), page_size: "15" })
    if (startDate) params.set("start_date", startDate)
    if (endDate) params.set("end_date", endDate)
    setLoading(true)
    apiGet<PaginatedRecords>(`/records?${params.toString()}`).then(res => {
      setRecords(res.data ?? null)
      setLoading(false)
    })
  }

  const handleEditRecord = (r: WeighRecord) => {
    const names = r.ingredient_names?.length ? r.ingredient_names : r.ingredients
    const weights = r.raw_weights_g || []
    setEditingRecord(r)
    setEditItems(names.map((n, i) => ({ name: n, weight: weights[i] != null ? String(Math.round(weights[i])) : "" })))
    setEditCookingMethod(r.cooking_method || "")
    setEditDateTime(formatDateTimeForInput(r.created_at))
    setEditEnergy(r.cooked_energy_kcal != null ? String(Math.round(r.cooked_energy_kcal)) : "")
    setEditProtein(r.cooked_protein_g != null ? String(r.cooked_protein_g) : "")
    setEditFat(r.cooked_fat_g != null ? String(r.cooked_fat_g) : "")
    setEditCarb(r.cooked_carbohydrate_g != null ? String(r.cooked_carbohydrate_g) : "")
    setEditWeight(r.cooked_weight_g != null ? String(Math.round(r.cooked_weight_g)) : "")
  }

  const handleSaveRecord = async () => {
    if (!editingRecord) return
    setSavingRecordId(editingRecord.id)
    const ingredients = editItems.map(it => it.name).filter(Boolean)
    const rawWeights = editItems.map(it => parseFloat(it.weight) || 0)
    // 同时发送 created_at 让后端更新
    const res = await apiPut(`/records/${editingRecord.id}`, {
      ingredients,
      raw_weights_g: rawWeights,
      cooking_method: editCookingMethod,
      cooked_weight_g: parseFloat(editWeight) || 0,
      cooked_energy_kcal: parseFloat(editEnergy) || 0,
      cooked_protein_g: parseFloat(editProtein) || 0,
      cooked_fat_g: parseFloat(editFat) || 0,
      cooked_carbohydrate_g: parseFloat(editCarb) || 0,
      created_at: editDateTime || undefined,
    })
    if (res.code === 0) {
      setEditingRecord(null)
      refreshRecords()
    }
    setSavingRecordId(null)
  }

  const handleDeleteRecord = async (id: number) => {
    if (!confirm("确定删除这条记录？")) return
    setDeletingRecordId(id)
    const res = await apiDelete(`/records/${id}`)
    if (res.code === 0) refreshRecords()
    setDeletingRecordId(null)
  }

  return (
    <AppShell title="称重历史记录" titleIcon={<ClipboardList className="w-6 h-6 text-[#667eea]" />}>
      <style>{`
        .date-picker-purple [data-selected] { background-color: #667eea !important; color: #fff !important; }
        .date-picker-purple [data-focused] { background-color: #667eea !important; color: #fff !important; }
        .date-picker-purple [data-hovered] { background-color: rgba(102,126,234,0.15) !important; }
        .date-picker-purple [data-selection-start], .date-picker-purple [data-selection-end] { background-color: #667eea !important; color: #fff !important; }
        .date-picker-purple [data-selected][data-selection-start], .date-picker-purple [data-selected][data-selection-end] { background-color: #667eea !important; }
        .date-picker-purple .bg-accent { background-color: rgba(102,126,234,0.12) !important; }
        .date-picker-purple .text-primary { color: #667eea !important; }
        .date-picker-purple .bg-primary { background-color: #667eea !important; }
        .date-picker-purple button[class*="bg-primary"] { background-color: #667eea !important; }
        .date-picker-purple .text-accent-foreground { color: #667eea !important; }
      `}</style>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索食材或烹饪方式..."
              className="h-10 min-w-[220px] rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#667eea] focus:ring-2 focus:ring-[#667eea]/20 transition-all"
            />
          </div>
          <span className="text-sm text-gray-500">
            共 {total} 条记录{searchQuery.trim() ? `，筛选 ${filteredItems.length} 条` : ""}
          </span>
        </div>
        <div className="date-picker-purple flex flex-wrap items-center gap-2">
          <JollyDateRangePicker
            label="日期范围"
            value={dateRange}
            onChange={(value) => {
              setCurrentPage(1)
              setDateRange(value as DateRange | null)
            }}
            className="min-w-[300px]"
          />
        </div>
      </div>

      <Card className="border-0 bg-white/85 shadow-[0_12px_40px_rgba(102,126,234,0.12)]">
        <CardContent className="p-0">
          {/* 分页 */}
          <div className="flex flex-wrap items-center justify-center gap-3 border-b border-gray-100 px-6 py-4">
            {records && records.total_pages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="h-8 rounded-full border border-[#667eea]/30 px-3 text-sm font-medium text-[#667eea] hover:bg-[#667eea]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  首页
                </button>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 rounded-full border border-[#667eea]/30 px-3 text-sm font-medium text-[#667eea] hover:bg-[#667eea]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />上一页
                </button>
                <div className="flex items-center gap-1">
                  {pageButtons.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className="h-8 w-8 rounded-full text-sm font-medium transition"
                      style={page === currentPage
                        ? { backgroundImage: "linear-gradient(to right, #667eea, #764ba2)", color: "#fff" }
                        : { color: "#6b7280" }}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={currentPage >= (records?.total_pages ?? 1)}
                  onClick={() => setCurrentPage((p) => Math.min(records?.total_pages ?? p, p + 1))}
                  className="h-8 rounded-full border border-[#667eea]/30 px-3 text-sm font-medium text-[#667eea] hover:bg-[#667eea]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  下一页<ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= (records?.total_pages ?? 1)}
                  onClick={() => setCurrentPage(records?.total_pages ?? 1)}
                  className="h-8 rounded-full border border-[#667eea]/30 px-3 text-sm font-medium text-[#667eea] hover:bg-[#667eea]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  尾页
                </button>
              </div>
            )}
            <p className="text-center text-xs text-gray-400">第 {currentPage} / {records?.total_pages ?? 1} 页，共 {records?.total ?? 0} 条记录</p>
          </div>

          {/* 表头 */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-gray-50/80 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="w-6" />
            <div className="flex-1 flex items-center gap-4 min-w-0">
              <div className="w-[130px] text-center whitespace-nowrap flex-shrink-0">时间</div>
              <div className="flex-1 text-center">食材</div>
              <div className="w-[70px] text-center whitespace-nowrap flex-shrink-0">烹饪方式</div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-[70px] text-right">热量</div>
              <div className="w-[55px] text-right">蛋白质</div>
              <div className="w-[55px] text-right">脂肪</div>
              <div className="w-[55px] text-right">碳水</div>
            </div>
          </div>

          {/* 列表 — 每条记录独立容器，详情紧跟其后 */}
          <div className="divide-y divide-gray-100">
            {loading && (
              <div className="px-4 py-10 text-center text-gray-400">加载中...</div>
            )}
            {!loading && filteredItems.length === 0 && (
              <div className="px-4 py-10 text-center text-gray-400">暂无记录</div>
            )}
            {!loading && filteredItems.map((record, recordIdx) => {
              const isExpanded = expandedId === record.id
              const names = record.ingredient_names?.length ? record.ingredient_names : record.ingredients
              const methodLabel = cookingLabel(record)
              return (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: recordIdx * 0.05, ease: [0.4, 0, 0.2, 1] }}
                  className={isExpanded ? "bg-[#f8f9ff]" : ""}
                >
                  {/* 概要行 */}
                  <div
                    className="group flex items-center gap-3 px-6 py-3 cursor-pointer transition-colors hover:bg-[#f8f9ff]"
                    onClick={() => setExpandedId(isExpanded ? null : record.id)}
                  >
                    {/* 展开箭头 */}
                    <motion.div
                      animate={{ rotate: isExpanded ? 90 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center justify-center w-6"
                    >
                      <ChevronDown className="h-4 w-4 text-[#667eea]" />
                    </motion.div>

                    {/* 数据列 */}
                    <div className="flex-1 flex items-center gap-4 min-w-0">
                      {/* 时间 */}
                      <span className="text-sm text-gray-700 whitespace-nowrap flex-shrink-0 w-[130px] text-center">
                        {formatDateTime(record.created_at)}
                      </span>
                      {/* 食材 — 居中 + 加粗 */}
                      <span className="text-sm font-semibold text-gray-800 min-w-0 truncate flex-1 text-center">
                        {names.join("、")}
                      </span>
                      {/* 烹饪方式 — 居中 + 彩色背景 */}
                      <span className="flex-shrink-0 w-[70px] flex justify-center">
                        <CookingTag method={record.cooking_method} label={methodLabel} />
                      </span>
                    </div>

                    {/* 营养数值 — 全部不加粗 */}
                    <div className="flex items-center gap-3 text-sm flex-shrink-0">
                      <span className="text-gray-700 w-[70px] text-right">
                        {formatMetric(record.cooked_energy_kcal, 0)} kcal
                      </span>
                      <span className="text-gray-600 w-[55px] text-right">
                        {formatMetric(record.cooked_protein_g)}g
                      </span>
                      <span className="text-gray-600 w-[55px] text-right">
                        {formatMetric(record.cooked_fat_g)}g
                      </span>
                      <span className="text-gray-600 w-[55px] text-right">
                        {formatMetric(record.cooked_carbohydrate_g)}g
                      </span>
                    </div>

                    {/* 编辑 & 删除按钮 */}
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); handleEditRecord(record) }}
                        className="rounded-full p-1.5 text-gray-300 hover:text-[#667eea] hover:bg-[#667eea]/10 transition-all"
                        title="编辑">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" disabled={deletingRecordId === record.id}
                        onClick={(e) => { e.stopPropagation(); handleDeleteRecord(record.id) }}
                        className="rounded-full p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="删除">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 详情 — 紧跟该行展开 */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        key={`detail-${record.id}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                      >
                        <RecordDetail record={record} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 编辑称重记录弹窗 */}
      {editingRecord && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4" onClick={() => setEditingRecord(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">编辑称重记录</h3>
            <div className="space-y-3">
              {/* 用餐时间 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">用餐时间</label>
                <input type="datetime-local" value={editDateTime}
                  onChange={e => setEditDateTime(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#667eea] focus:ring-2 focus:ring-[#667eea]/20" />
              </div>

              {/* 食材逐行编辑 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-500">食材明细</label>
                  <button type="button" onClick={() => setEditItems([...editItems, { name: "", weight: "" }])}
                    className="text-xs text-[#667eea] hover:underline">+ 添加食材</button>
                </div>
                <div className="space-y-2">
                  {editItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={item.name} placeholder="食材名"
                        onChange={e => {
                          const next = [...editItems]
                          next[i] = { ...next[i], name: e.target.value }
                          setEditItems(next)
                        }}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#667eea]" />
                      <input type="number" value={item.weight} placeholder="克数"
                        onChange={e => {
                          const next = [...editItems]
                          next[i] = { ...next[i], weight: e.target.value }
                          setEditItems(next)
                        }}
                        className="w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#667eea]" />
                      <span className="text-xs text-gray-400">g</span>
                      {editItems.length > 1 && (
                        <button type="button" onClick={() => setEditItems(editItems.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 text-lg leading-none">&times;</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 烹饪方式 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">烹饪方式</label>
                <select value={editCookingMethod} onChange={e => setEditCookingMethod(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#667eea]">
                  <option value="">未选择</option>
                  <option value="boil">煮</option><option value="steam">蒸</option>
                  <option value="stir_fry">炒</option><option value="braise">炖</option>
                  <option value="roast">烤</option><option value="pan_fry">煎</option>
                  <option value="deep_fry">炸</option>
                </select>
              </div>

              {/* 营养数据 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">熟重 (g)</label>
                  <input type="number" value={editWeight} onChange={e => setEditWeight(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#667eea]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">热量 (kcal)</label>
                  <input type="number" value={editEnergy} onChange={e => setEditEnergy(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#667eea]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">蛋白质 (g)</label>
                  <input type="number" value={editProtein} onChange={e => setEditProtein(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#667eea]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">脂肪 (g)</label>
                  <input type="number" value={editFat} onChange={e => setEditFat(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#667eea]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">碳水 (g)</label>
                  <input type="number" value={editCarb} onChange={e => setEditCarb(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#667eea]" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setEditingRecord(null)} className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition">取消</button>
              <button onClick={handleSaveRecord} disabled={savingRecordId === editingRecord.id}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:shadow-md transition disabled:opacity-50">
                {savingRecordId === editingRecord.id ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
