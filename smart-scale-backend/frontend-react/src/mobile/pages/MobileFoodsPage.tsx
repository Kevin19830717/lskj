import { useEffect, useMemo, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { apiGet, type Food, type FoodSearchResult } from "@/lib/api"
import { Search, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"

const PAGE_SIZE = 6

const catEmoji: Record<string, string> = {
  "水果": "🍎", "肉类": "🥩", "蔬菜": "🥬", "蛋类": "🥚", "豆制品": "🫘",
  "海鲜": "🦐", "主食": "🌾", "乳制品": "🥛", "其他": "📦",
}
function emojiOf(c?: string) { return (c && catEmoji[c]) ? catEmoji[c] : "📦" }

const COLORS: Record<string, { from: string; to: string; text: string; bg: string }> = {
  "水果":   { from: "#fde047", to: "#ca8a04", text: "#a16207", bg: "#fef9c3" },
  "肉类":   { from: "#f87171", to: "#dc2626", text: "#b91c1c", bg: "#fee2e2" },
  "蛋类":   { from: "#38bdf8", to: "#0284c7", text: "#0369a1", bg: "#e0f2fe" },
  "豆制品": { from: "#c084fc", to: "#7e22ce", text: "#6b21a8", bg: "#f3e8ff" },
  "蔬菜":   { from: "#4ade80", to: "#16a34a", text: "#15803d", bg: "#dcfce7" },
  "海鲜":   { from: "#2dd4bf", to: "#0d9488", text: "#0f766e", bg: "#ccfbf1" },
  "主食":   { from: "#fb923c", to: "#ea580c", text: "#9a3412", bg: "#ffedd5" },
  "乳制品": { from: "#38bdf8", to: "#0284c7", text: "#075985", bg: "#e0f2fe" },
  "其他":   { from: "#9ca3af", to: "#4b5563", text: "#374151", bg: "#f3f4f6" },
}
const DEFAULT_C = COLORS["蔬菜"]
function clr(c?: string) { return (c && COLORS[c]) ? COLORS[c] : DEFAULT_C }

const detailFields = [
  ["sodium_mg", "钠", "mg", "🧂"], ["cholesterol_mg", "胆固醇", "mg", "🩸"],
  ["vitamin_c_mg", "维生素C", "mg", "🍋"], ["calcium_mg", "钙", "mg", "🦴"],
  ["iron_mg", "铁", "mg", "⚡"], ["potassium_mg", "钾", "mg", "🫀"],
] as const

function metric(v?: number) { if (v == null) return "-"; return v.toFixed(1) }

export default function MobileFoodsPage() {
  const [query, setQuery] = useState("")
  const [allFoods, setAllFoods] = useState<Food[]>([])
  const [cat, setCat] = useState("all")
  const [selected, setSelected] = useState<Food | null>(null)
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState("加载中...")
  const [page, setPage] = useState(1)

  const loadAll = useCallback(async () => {
    setLoading(true); setPage(1)
    try {
      const res = await apiGet<{ items: Food[] }>("/foods?page=1&page_size=200")
      const items = res.data?.items ?? []
      setAllFoods(items); setCat("all"); setLabel(`共 ${items.length} 种`)
    } catch {
      setLabel("加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll().catch(() => setLoading(false)) }, [loadAll])

  const cats = useMemo(() => Array.from(new Set(allFoods.map(f => f.category).filter(Boolean))) as string[], [allFoods])
  const visible = useMemo(() => cat === "all" ? allFoods : allFoods.filter(f => f.category === cat), [allFoods, cat])
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const paged = useMemo(() => visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [visible, page])

  const switchCat = useCallback((c: string) => {
    setCat(c); setPage(1)
    const cnt = c === "all" ? allFoods.length : allFoods.filter(f => f.category === c).length
    setLabel(c === "all" ? `共 ${cnt} 种` : `${emojiOf(c)} ${c} ${cnt} 种`)
  }, [allFoods])

  async function search() {
    const t = query.trim()
    if (!t) { await loadAll(); return }
    setLoading(true); setPage(1)
    try {
      const res = await apiGet<FoodSearchResult>(`/foods/search?query=${encodeURIComponent(t)}&limit=200`)
      const items = res.data?.items ?? []
      setAllFoods(items); setCat("all"); setLabel(`"${t}" 找到 ${items.length} 种`)
    } catch {
      setLabel("搜索失败")
    } finally {
      setLoading(false)
    }
  }

  async function detail(id: number) {
    try {
      const res = await apiGet<Food>(`/foods?id=${id}`)
      if (res.data) setSelected(res.data)
    } catch { /* 忽略 */ }
  }

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-green-50/40 to-white">
      {/* 顶部搜索栏 */}
      <div className="flex-shrink-0 px-3 pt-2 pb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void search() } }}
              placeholder="搜索食物..."
              className="h-9 w-full rounded-xl bg-white border border-gray-200 pl-8 pr-3 text-[13px] outline-none focus:border-emerald-400"
            />
          </div>
          <button
            onClick={() => void search()}
            className="h-9 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-xs font-medium active:scale-95"
          >
            搜索
          </button>
          <button
            onClick={() => { setQuery(""); void loadAll() }}
            className="h-9 px-2.5 rounded-xl bg-white border border-gray-200 text-gray-500 text-xs active:scale-95"
          >
            全部
          </button>
        </div>
      </div>

      {/* 分类筛选：横向滚动 */}
      <div className="flex-shrink-0 px-3 pb-1.5">
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          <CatChip label={`全部 ${allFoods.length}`} active={cat === "all"} onClick={() => switchCat("all")} c={DEFAULT_C} />
          {cats.map(c => {
            const cl = clr(c)
            const cnt = allFoods.filter(f => f.category === c).length
            return (
              <CatChip
                key={c}
                label={`${emojiOf(c)} ${c} ${cnt}`}
                active={cat === c}
                onClick={() => switchCat(c)}
                c={cl}
              />
            )
          })}
        </div>
      </div>

      {/* 标签栏 */}
      <div className="flex-shrink-0 px-3 pb-1">
        <p className="text-[11px] text-gray-500">{label}</p>
      </div>

      {/* 食物网格区 */}
      <div className="relative flex-1 min-h-0">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
          </div>
        ) : visible.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            未找到食物
          </div>
        ) : (
          <div className="absolute inset-0 overflow-y-auto px-3">
            <div className="grid grid-cols-2 gap-2 pb-2">
              <AnimatePresence mode="wait">
                {paged.map((food, idx) => {
                  const c = clr(food.category)
                  return (
                    <motion.div
                      key={food.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: idx * 0.03 }}
                      onClick={() => void detail(food.id)}
                      className="cursor-pointer rounded-2xl bg-white border border-gray-100 p-2.5 active:scale-95 transition-transform shadow-sm"
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-1 border-b border-gray-50 pb-1.5">
                        <div className="min-w-0 flex-1">
                          <h5 className="truncate text-[13px] font-semibold text-gray-800">{food.name}</h5>
                          <p className="truncate text-[10px] text-gray-400">{food.name_en}</p>
                        </div>
                        {food.category && (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white"
                            style={{ backgroundImage: `linear-gradient(to right, ${c.from}, ${c.to})` }}
                          >
                            {food.category}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {[["🔥", metric(food.energy_kcal), "kcal"],
                          ["💪", metric(food.protein_g), "g"],
                          ["🧈", metric(food.fat_g), "g"],
                          ["🍚", metric(food.carbohydrate_g), "g"]].map(([icon, value, unit]) => (
                          <div key={String(unit) + String(value)} className="rounded-md px-1.5 py-1" style={{ backgroundColor: c.bg }}>
                            <div className="text-[9px]">{icon}</div>
                            <div className="text-[11px] font-bold leading-tight" style={{ color: c.text }}>
                              {value}<span className="ml-0.5 text-[8px] font-normal text-gray-400">{unit}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 py-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center disabled:opacity-40 active:scale-95"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
                </button>
                <span className="text-[11px] text-gray-500 px-1.5">{page} / {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center disabled:opacity-40 active:scale-95"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 详情底部抽屉 */}
      <AnimatePresence>
        {selected && (
          <FoodDetailSheet food={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function CatChip({ label, active, onClick, c }: { label: string; active: boolean; onClick: () => void; c: { from: string; to: string } }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all active:scale-95",
        active ? "text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200"
      )}
      style={active ? { backgroundImage: `linear-gradient(to right, ${c.from}, ${c.to})` } : undefined}
    >
      {label}
    </button>
  )
}

function FoodDetailSheet({ food, onClose }: { food: Food; onClose: () => void }) {
  const c = clr(food.category)
  const emj = emojiOf(food.category)
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/40 z-40"
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 35 }}
        className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl max-h-[88vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white rounded-t-3xl pt-3 pb-2 px-4 z-10 border-b border-gray-100">
          <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-2" />
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900 truncate">{food.name}</h3>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                  style={{ backgroundImage: `linear-gradient(to right, ${c.from}, ${c.to})` }}
                >
                  {emj} {food.category || "其他"}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">{food.name_en}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-2 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {food.edible_ratio ? (
            <p className="mt-1 text-[11px] text-gray-500">
              可食部占比: <b style={{ color: c.text }}>{(food.edible_ratio * 100).toFixed(0)}%</b>
            </p>
          ) : null}
        </div>

        <div className="px-4 py-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          {/* 核心营养素 */}
          <h5 className="text-xs font-semibold text-gray-700 mb-1.5">核心营养（每100g）</h5>
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {[["🔥", "能量", food.energy_kcal, "kcal"],
              ["💪", "蛋白质", food.protein_g, "g"],
              ["🧈", "脂肪", food.fat_g, "g"],
              ["🍚", "碳水", food.carbohydrate_g, "g"]].map(([icon, lbl, value, unit]) => (
              <div key={String(lbl)} className="rounded-xl px-1.5 py-2 text-center" style={{ backgroundColor: c.bg }}>
                <div className="mb-0.5 text-base">{icon}</div>
                <div className="text-sm font-extrabold" style={{ color: c.text }}>{metric(value as number)}</div>
                <div className="text-[9px] text-gray-500">{lbl} ({unit})</div>
              </div>
            ))}
          </div>

          {/* 详细营养 */}
          {detailFields.some(([k]) => (food[k] as number) > 0) && (
            <>
              <h5 className="text-xs font-semibold text-gray-700 mb-1.5">详细营养（每100g）</h5>
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: c.from }}>
                <div
                  className="text-white text-[11px] py-1.5 px-2.5 grid grid-cols-2 font-medium"
                  style={{ backgroundImage: `linear-gradient(to right, ${c.from}, ${c.to})` }}
                >
                  <span>营养素</span>
                  <span className="text-right">含量</span>
                </div>
                <div className="divide-y divide-gray-100 bg-white">
                  {detailFields.filter(([k]) => (food[k] as number) > 0).map(([key, lbl, unit, icon]) => (
                    <div key={key} className="text-[12px] py-1.5 px-2.5 grid grid-cols-2">
                      <span className="text-gray-700">{icon} {lbl}</span>
                      <span className="text-right font-medium" style={{ color: c.text }}>{metric(food[key])} {unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </>
  )
}
