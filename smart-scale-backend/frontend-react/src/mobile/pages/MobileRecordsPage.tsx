import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, ChevronLeft, ChevronRight, Trash2, Pencil, X, Plus, ChefHat, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiGet, apiPut, apiDelete, type PaginatedRecords, type WeighRecord } from "@/lib/api"
import { cookingColor, COOKING_COLORS } from "@/pages/RecordsPage"

const PAGE_SIZE = 15
const COOKING_LABELS: Record<string, string> = {
  boil: "水煮", steam: "清蒸", stir_fry: "炒", braise: "炖煮",
  roast: "烤", pan_fry: "煎", deep_fry: "油炸",
}
const metric = (v?: number | null) => (v == null ? "-" : v.toFixed(1))

export default function MobileRecordsPage() {
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [items, setItems] = useState<WeighRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [kw, setKw] = useState("")
  const [expanded, setExpanded] = useState<number | null>(null)
  const [editing, setEditing] = useState<WeighRecord | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const d = await apiGet<PaginatedRecords>(`/records?page=${p}&page_size=${PAGE_SIZE}`)
      if (d.code === 0 && d.data) {
        setItems(d.data.items || [])
        setTotal(d.data.total)
        setTotalPages(d.data.total_pages || 1)
        setPage(d.data.page || p)
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void fetchPage(page) }, [page, fetchPage])

  const filtered = kw.trim()
    ? items.filter((r) => {
        const names = (r.ingredient_names?.length ? r.ingredient_names : r.ingredients).join("、").toLowerCase()
        const method = (r.cooking_method_label || r.cooking_method || "").toLowerCase()
        return names.includes(kw.toLowerCase()) || method.includes(kw.toLowerCase())
      })
    : items

  const doDelete = async (id: number) => {
    if (!confirm("确定删除这条记录？")) return
    setDeleting(id)
    try {
      const d = await apiDelete(`/records/${id}`)
      if (d.code === 0) { void fetchPage(page); setExpanded(null) }
    } finally { setDeleting(null) }
  }

  const onSaved = () => { setEditing(null); void fetchPage(page); setExpanded(null) }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 头部 */}
      <div className="shrink-0 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">历史记录</h2>
          <span className="text-[11px] text-gray-400">共 {total} 条</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索食材 / 烹饪方式"
            className="h-10 w-full rounded-xl border border-green-100 bg-white/80 pl-9 pr-3 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20"
          />
        </div>
      </div>

      {/* 列表（内部滚动） */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
        {loading && items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> 加载中…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-sm text-gray-400">
            <ChefHat className="mb-2 h-8 w-8 text-gray-300" /> 暂无记录
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => {
              const cc = cookingColor(r.cooking_method)
              const names = r.ingredient_names?.length ? r.ingredient_names : r.ingredients
              const isOpen = expanded === r.id
              const time = new Date(r.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
              return (
                <motion.div
                  key={r.id}
                  layout
                  className="overflow-hidden rounded-2xl border border-green-100/70 bg-white/80 backdrop-blur-sm"
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-gray-50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundImage: `linear-gradient(to right, ${cc.from}, ${cc.to})` }}>
                      <ChefHat className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-gray-800">{names.join("、")}</div>
                      <div className="text-[11px] text-gray-400">{time} · <span style={{ color: cc.text }}>{r.cooking_method_label || COOKING_LABELS[r.cooking_method || ""] || r.cooking_method}</span></div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold" style={{ color: cc.text }}>{Math.round(r.cooked_energy_kcal || 0)}</div>
                      <div className="text-[10px] text-gray-400">kcal</div>
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <div className="border-t border-gray-100 px-3.5 py-3">
                          {/* 食材明细 */}
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {names.map((n, i) => (
                              <span key={i} className="rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: cc.bg, color: cc.text }}>
                                {n}{r.raw_weights_g?.[i] != null ? ` ${Math.round(r.raw_weights_g[i])}g` : ""}
                              </span>
                            ))}
                          </div>
                          {/* 核心营养 4 格 */}
                          <div className="mb-3 grid grid-cols-4 gap-2">
                            {[["热量", metric(r.cooked_energy_kcal), "kcal"], ["蛋白", metric(r.cooked_protein_g), "g"], ["脂肪", metric(r.cooked_fat_g), "g"], ["碳水", metric(r.cooked_carbohydrate_g), "g"]].map(([l, v, u]) => (
                              <div key={l} className="rounded-lg py-2 text-center" style={{ backgroundColor: cc.bg }}>
                                <div className="text-sm font-bold" style={{ color: cc.text }}>{v}</div>
                                <div className="text-[10px] text-gray-500">{l}·{u}</div>
                              </div>
                            ))}
                          </div>
                          {/* 微量元素 */}
                          {[
                            ["钠", r.cooked_sodium_mg, "mg"], ["胆固醇", r.cooked_cholesterol_mg, "mg"],
                            ["维C", r.cooked_vitamin_c_mg, "mg"], ["钙", r.cooked_calcium_mg, "mg"],
                            ["铁", r.cooked_iron_mg, "mg"], ["钾", r.cooked_potassium_mg, "mg"],
                          ].filter(([, v]) => v != null && (v as number) > 0).length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                              {[["钠", r.cooked_sodium_mg], ["胆固醇", r.cooked_cholesterol_mg], ["维C", r.cooked_vitamin_c_mg], ["钙", r.cooked_calcium_mg], ["铁", r.cooked_iron_mg], ["钾", r.cooked_potassium_mg]].map(([l, v]) => (
                                v != null && (v as number) > 0 ? <span key={l as string}>{l}: {metric(v as number)}mg</span> : null
                              ))}
                            </div>
                          )}
                          {/* 操作 */}
                          <div className="flex gap-2">
                            <button onClick={() => setEditing(r)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-green-200 py-2 text-xs font-medium text-green-600 active:scale-95">
                              <Pencil className="h-3.5 w-3.5" /> 编辑
                            </button>
                            <button onClick={() => void doDelete(r.id)} disabled={deleting === r.id} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 py-2 text-xs font-medium text-red-500 active:scale-95">
                              {deleting === r.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} 删除
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* 分页栏 */}
      <div className="flex shrink-0 items-center justify-between border-t border-green-100/70 bg-white/70 px-4 py-2 backdrop-blur-sm">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-gray-500">第 {page} / {totalPages} 页</span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 编辑弹层 */}
      <AnimatePresence>
        {editing && <EditSheet record={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
      </AnimatePresence>
    </div>
  )
}

function EditSheet({ record, onClose, onSaved }: { record: WeighRecord; onClose: () => void; onSaved: () => void }) {
  const [names, setNames] = useState<string[]>(record.ingredient_names?.length ? record.ingredient_names : record.ingredients)
  const [weights, setWeights] = useState<number[]>(record.raw_weights_g || [])
  const [method, setMethod] = useState(record.cooking_method || "stir_fry")
  const [cookedWeight, setCookedWeight] = useState(String(record.cooked_weight_g ?? ""))
  const [energy, setEnergy] = useState(String(record.cooked_energy_kcal ?? ""))
  const [protein, setProtein] = useState(String(record.cooked_protein_g ?? ""))
  const [fat, setFat] = useState(String(record.cooked_fat_g ?? ""))
  const [carb, setCarb] = useState(String(record.cooked_carbohydrate_g ?? ""))
  const [saving, setSaving] = useState(false)

  const setItem = (i: number, field: "name" | "weight", val: string | number) => {
    const nn = [...names], ww = [...weights]
    if (field === "name") nn[i] = val as string
    else ww[i] = Number(val) || 0
    setNames(nn); setWeights(ww)
  }
  const addRow = () => { setNames([...names, ""]); setWeights([...weights, 0]) }
  const delRow = (i: number) => { setNames(names.filter((_, j) => j !== i)); setWeights(weights.filter((_, j) => j !== i)) }

  const save = async () => {
    setSaving(true)
    try {
      const body = {
        ingredients: names.filter(Boolean),
        raw_weights_g: weights,
        cooking_method: method,
        cooked_weight_g: Number(cookedWeight) || 0,
        cooked_energy_kcal: Number(energy) || 0,
        cooked_protein_g: Number(protein) || 0,
        cooked_fat_g: Number(fat) || 0,
        cooked_carbohydrate_g: Number(carb) || 0,
        created_at: record.created_at,
      }
      const d = await apiPut(`/records/${record.id}`, body)
      if (d.code === 0) onSaved()
    } finally { setSaving(false) }
  }

  const numField = "h-9 w-full rounded-lg border border-green-200 px-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20"
  const labelCls = "mb-1 block text-[11px] font-medium text-green-700/80"

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800">编辑记录</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        {/* 食材行 */}
        <div className="mb-3">
          <label className={labelCls}>食材明细</label>
          <div className="space-y-2">
            {names.map((n, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={n} onChange={(e) => setItem(i, "name", e.target.value)} placeholder="食材名" className="h-9 flex-1 rounded-lg border border-green-200 px-2 text-sm outline-none focus:border-green-400" />
                <input value={weights[i] ?? ""} type="number" onChange={(e) => setItem(i, "weight", e.target.value)} placeholder="克数" className="h-9 w-20 rounded-lg border border-green-200 px-2 text-sm outline-none focus:border-green-400" />
                <button onClick={() => delRow(i)} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <button onClick={addRow} className="mt-2 flex items-center gap-1 text-xs font-medium text-green-600"><Plus className="h-3.5 w-3.5" /> 添加食材</button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>烹饪方式</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 w-full rounded-lg border border-green-200 px-2 text-sm outline-none focus:border-green-400">
              {Object.keys(COOKING_COLORS).map((m) => <option key={m} value={m}>{COOKING_LABELS[m] || m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>熟重(g)</label>
            <input value={cookedWeight} type="number" onChange={(e) => setCookedWeight(e.target.value)} className={numField} />
          </div>
        </div>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {[["热量", energy, setEnergy], ["蛋白", protein, setProtein], ["脂肪", fat, setFat], ["碳水", carb, setCarb]].map(([l, v, s]) => (
            <div key={l as string}>
              <label className={labelCls}>{l as string}</label>
              <input value={v as string} type="number" onChange={(e) => (s as (x: string) => void)(e.target.value)} className={numField} />
            </div>
          ))}
        </div>

        <button onClick={() => void save()} disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-sm font-semibold text-white shadow-lg shadow-green-500/25 active:scale-[0.98] disabled:opacity-60">
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} 保存
        </button>
      </motion.div>
    </div>
  )
}
