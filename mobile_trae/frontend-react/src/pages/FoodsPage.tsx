import { useEffect, useMemo, useState, useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react"
import AppShell from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { apiGet, type Food, type FoodSearchResult } from "@/lib/api"
import { Search, UtensilsCrossed, X, ChevronLeft, ChevronRight } from "lucide-react"
import { WaveLoader } from "@/components/wave-loader"
import { motion, AnimatePresence } from "framer-motion"
import { LiquidGlassButton } from "@/components/liquid-glass-button"
import { useDeviceTilt } from "@/components/hooks/use-device-tilt"

const PAGE_SIZE = typeof window !== "undefined" && window.innerWidth < 1024 ? 6 : 8

// 数据库中 category 存的是中文，按中文映射 emoji
const catEmoji: Record<string, string> = {
  "水果": "🍎", "肉类": "🥩", "蔬菜": "🥬", "蛋类": "🥚", "豆制品": "🫘",
  "海鲜": "🦐", "主食": "🌾", "乳制品": "🥛", "其他": "📦",
}
function emojiOf(c?: string) { return (c && catEmoji[c]) ? catEmoji[c] : "📦" }

// 主题色（from 浅色 / text 深色 / bg 极浅背景），按中文 category 映射
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

// ==================== 详情卡片（3D 悬浮 + 分类色）====================
function FoodDetailCard({ food, onClose }: { food: Food; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null)
  // 手机端用重力感应模拟桌面端鼠标悬停的 3D 倾斜
  useDeviceTilt(cardRef)
  const c = clr(food.category)
  const emj = emojiOf(food.category)

  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const card = cardRef.current; if (!card) return
    const { left, top, width, height } = card.getBoundingClientRect()
    // 增强旋转角度：±30°
    const rx = ((e.clientY - top - height / 2) / height) * 30
    const ry = ((e.clientX - left - width / 2) / width) * -30
    card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(1.04)`
  }
  const onLeave = () => { const el = cardRef.current; if (el) el.style.transform = "rotateX(0deg) rotateY(0deg) scale(1)" }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl my-auto" style={{ perspective: "1000px" }} onClick={e => e.stopPropagation()}>
        <div ref={cardRef} onMouseMove={onMove} onMouseLeave={onLeave}
          className="relative rounded-3xl border bg-white p-3.5 lg:p-7 shadow-2xl transition-transform duration-200 ease-out [zoom:0.8] lg:[zoom:1]"
          style={{ borderColor: c.from, transformStyle: "preserve-3d" }}>
          <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(to_right,#00000006_1px,transparent_1px),linear-gradient(to_bottom,#00000006_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]" />

          <button type="button" onClick={onClose} className="absolute right-3 top-3 lg:right-4 lg:top-4 z-20 rounded-full p-1.5 lg:p-2 text-gray-400 hover:bg-gray-100 transition-colors" style={{ transform: "translateZ(100px)" }}><X className="h-4 w-4 lg:h-5 lg:w-5" /></button>

          {/* 标题 + 分类标签（星星飞散效果），居中 */}
          <div style={{ transform: "translateZ(60px)" }} className="relative z-10 mt-1 lg:mt-2 flex flex-wrap items-center justify-center gap-2 lg:gap-3">
            <h2 className="text-base lg:text-3xl font-bold tracking-tight text-gray-900">{food.name}</h2>
            <LiquidGlassButton color={c.from} className="!px-2.5 !py-1 !text-xs lg:!px-4 lg:!py-1.5 lg:!text-sm">
              {emj} {food.category || "其他"}
            </LiquidGlassButton>
          </div>

          <div style={{ transform: "translateZ(40px)" }} className="relative z-10 mt-1.5 lg:mt-2 text-center">
            <p className="text-xs lg:text-sm text-gray-500">{food.name_en}</p>
            {food.edible_ratio ? (
              <p className="mt-0.5 lg:mt-1 text-[11px] lg:text-xs">可食部占比: <b style={{ color: c.text }}>{(food.edible_ratio * 100).toFixed(0)}%</b></p>
            ) : null}
          </div>

          {/* 核心营养素 — 数值用主题色 */}
          <div style={{ transform: "translateZ(35px)" }} className="relative z-10 mt-3 lg:mt-5 grid grid-cols-2 lg:grid-cols-4 gap-1.5 lg:gap-2">
            {[["🔥","能量",food.energy_kcal,"kcal"],["💪","蛋白质",food.protein_g,"g"],["🧈","脂肪",food.fat_g,"g"],["🍚","碳水",food.carbohydrate_g,"g"]]
              .map(([icon, label, value, unit]) => (
                <div key={String(label)} className="rounded-lg lg:rounded-xl px-1.5 py-1 lg:px-2 lg:py-3 text-center shadow-sm" style={{ backgroundColor: c.bg }}>
                  <div className="mb-0.5 lg:mb-1 text-sm lg:text-xl">{icon}</div>
                  <div className="text-xs lg:text-lg font-extrabold" style={{ color: c.text }}>{metric(value as number)}</div>
                  <div className="text-[9px] lg:text-[10px] text-gray-500">{label} ({unit})</div>
                </div>))}
          </div>

          {/* 详细营养表格 — 表头背景 + 数值用主题色 */}
          {detailFields.some(([k]) => (food[k] as number) > 0) && (
            <div className="relative z-10 mt-3 lg:mt-5 pt-2 lg:pt-4" style={{ transform: "translateZ(20px)" }}>
              <h5 className="mb-1.5 lg:mb-2 text-xs lg:text-sm font-semibold text-gray-700">详细营养数据（每100g）</h5>
              <div className="overflow-hidden rounded-lg lg:rounded-xl border" style={{ borderColor: c.from }}>
                <table className="min-w-full text-[11px] lg:text-sm">
                  <thead style={{ backgroundImage: `linear-gradient(to right, ${c.from}, ${c.to})` }} className="text-white">
                    <tr><th className="px-2.5 py-1 lg:px-4 lg:py-2 text-left font-medium">营养素</th><th className="px-2.5 py-1 lg:px-4 lg:py-2 text-left font-medium">含量</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {detailFields.filter(([k]) => (food[k] as number) > 0).map(([key, label, unit, icon]) => (
                      <tr key={key}>
                        <td className="px-2.5 py-1 lg:px-4 lg:py-2 text-gray-700">{icon} {label}</td>
                        <td className="px-2.5 py-1 lg:px-4 lg:py-2 font-medium" style={{ color: c.text }}>{metric(food[key])} {unit}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </div>)}
        </div>
      </div>
    </div>
  )
}

// ==================== 主页 ====================
export default function FoodsPage() {
  const [query, setQuery] = useState("")
  const [allFoods, setAllFoods] = useState<Food[]>([])
  const [cat, setCat] = useState("all")
  const [selected, setSelected] = useState<Food | null>(null)
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState("加载中...")
  const [page, setPage] = useState(1)
  const [ak, setAk] = useState(0)

  const loadAll = useCallback(async () => {
    setLoading(true); setPage(1)
    const res = await apiGet<{ items: Food[] }>("/foods?page=1&page_size=200")
    const items = res.data?.items ?? []
    setAllFoods(items); setCat("all"); setLabel(`共 ${items.length} 种食物`); setLoading(false)
    setAk(k => k + 1)
  }, [])

  useEffect(() => { loadAll().catch(() => setLoading(false)) }, [loadAll])

  const cats = useMemo(() => Array.from(new Set(allFoods.map(f => f.category).filter(Boolean))) as string[], [allFoods])
  const visible = useMemo(() => cat === "all" ? allFoods : allFoods.filter(f => f.category === cat), [allFoods, cat])
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const paged = useMemo(() => visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [visible, page])

  const switchCat = useCallback((c: string) => {
    setCat(c); setPage(1)
    const cnt = c === "all" ? allFoods.length : allFoods.filter(f => f.category === c).length
    setLabel(c === "all" ? `共 ${cnt} 种食物` : `${emojiOf(c)} ${c}: ${cnt} 种食物`)
    setAk(k => k + 1)
  }, [allFoods])

  async function search() {
    const t = query.trim(); if (!t) { await loadAll(); return }
    setLoading(true); setPage(1)
    const res = await apiGet<FoodSearchResult>(`/foods/search?query=${encodeURIComponent(t)}&limit=200`)
    const items = res.data?.items ?? []
    setAllFoods(items); setCat("all"); setLabel(`搜索 "${t}" 找到 ${items.length} 种食物`); setLoading(false)
    setAk(k => k + 1)
  }
  async function detail(id: number) {
    const res = await apiGet<Food>(`/foods?id=${id}`); if (res.data) setSelected(res.data)
  }

  return (
    <AppShell title="食物营养库" titleIcon={<UtensilsCrossed className="w-6 h-6 text-green-600" />}
      actions={(
        <div className="flex flex-wrap items-center gap-1.5 lg:gap-3 w-full lg:w-auto">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void search() } }}
              placeholder="搜索食物（中文名/英文名）..."
              className="h-8 lg:h-11 w-full lg:min-w-[280px] rounded-lg border border-white/60 bg-white/85 pl-9 pr-3 text-[11px] lg:text-sm shadow-sm outline-none focus:border-green-500" />
          </div>
          <LiquidGlassButton color="#22c55e" onClick={() => void search()}>搜索</LiquidGlassButton>
        </div>
      )} theme="green">
      <p className="mb-2 lg:mb-4 text-[11px] lg:text-sm text-gray-500">{label}</p>

      {/* 分类筛选 — 选中态用各分类主题色 */}
      <div className="mb-3 lg:mb-5 flex gap-1.5 lg:gap-2 overflow-x-auto flex-nowrap lg:flex-wrap">
        <button type="button" onClick={() => switchCat("all")}
          className="rounded-full border px-2.5 lg:px-4 py-1 lg:py-2 text-[10px] lg:text-sm font-medium transition whitespace-nowrap"
          style={cat === "all"
            ? { backgroundImage: `linear-gradient(to right, ${DEFAULT_C.from}, ${DEFAULT_C.to})`, color: "#fff", borderColor: "transparent" }
            : { borderColor: "#e5e7eb", backgroundColor: "rgba(255,255,255,0.8)", color: "#4b5563" }}>
          全部 ({allFoods.length})
        </button>
        {cats.map(c => {
          const clr = clr2(c)
          const cnt = allFoods.filter(f => f.category === c).length
          const isActive = cat === c
          return (
            <button key={c} type="button" onClick={() => switchCat(c)}
              className="rounded-full border px-2.5 lg:px-4 py-1 lg:py-2 text-[10px] lg:text-sm font-medium transition whitespace-nowrap"
              style={isActive
                ? { backgroundImage: `linear-gradient(to right, ${clr.from}, ${clr.to})`, color: "#fff", borderColor: "transparent" }
                : { borderColor: "#e5e7eb", backgroundColor: "rgba(255,255,255,0.8)", color: "#4b5563" }}>
              {emojiOf(c)} {c} ({cnt})
            </button>
          )
        })}
      </div>

      {loading ? (
        <Card className="border-0 bg-white/80 py-4 lg:py-8"><CardContent className="px-6 py-4 lg:py-8 flex justify-center"><WaveLoader bars={4} message="加载中..." /></CardContent></Card>
      ) : visible.length === 0 ? (
        <Card className="border-0 bg-white/80 py-4 lg:py-10"><CardContent className="px-6 py-4 lg:py-10 text-center text-gray-400 text-xs lg:text-sm">未找到食物</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5 lg:gap-3 lg:grid-cols-4">
            <AnimatePresence mode="wait">
              {paged.map((food, idx) => {
                const c = clr2(food.category)
                return (
                  <motion.div key={`${food.id}-${ak}`}
                    initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.35, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}>
                    <Card
                      className="cursor-pointer border border-transparent bg-white/85 transition-all hover:-translate-y-1 py-2 lg:py-6 gap-2 lg:gap-6"
                      onMouseEnter={e => { e.currentTarget.style.borderColor = c.from; e.currentTarget.style.boxShadow = `0 8px 24px ${c.from}44` }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.boxShadow = "" }}
                      onClick={() => void detail(food.id)}>
                      <CardContent className="p-1.5 lg:p-3">
                        <div className="mb-1.5 lg:mb-2 flex items-start justify-between gap-1 border-b border-gray-100 pb-1 lg:pb-2">
                          <div className="min-w-0 flex-1">
                            <h5 className="truncate text-[11px] lg:text-sm font-semibold text-gray-900">{food.name}</h5>
                            <p className="truncate text-[9px] lg:text-[11px] text-gray-400">{food.name_en}</p>
                          </div>
                          {/* 小卡片标签：仅显示分类名一次（emoji 在分类筛选按钮里） */}
                          {food.category && (
                            <span className="shrink-0 rounded-full px-1.5 lg:px-2 py-0 lg:py-0.5 text-[9px] lg:text-[10px] font-semibold text-white"
                              style={{ backgroundImage: `linear-gradient(to right, ${c.from}, ${c.to})` }}>
                              {food.category}
                            </span>)}
                        </div>
                        {/* 营养数据 — 数值用主题色 */}
                        <div className="grid grid-cols-2 gap-0.5 lg:gap-1.5">
                          {[["🔥","能量",metric(food.energy_kcal),"kcal"],["💪","蛋白质",metric(food.protein_g),"g"],["🧈","脂肪",metric(food.fat_g),"g"],["🍚","碳水",metric(food.carbohydrate_g),"g"]]
                            .map(([icon, l, value, unit]) => (
                              <div key={String(l)} className="rounded-md lg:rounded-lg px-1.5 lg:px-2 py-1 lg:py-1.5" style={{ backgroundColor: c.bg }}>
                                <div className="mb-0 lg:mb-0.5 text-[10px] lg:text-xs">{icon}</div>
                                <div className="text-[8px] lg:text-[10px] text-gray-500">{l}</div>
                                <div className="text-[11px] lg:text-sm font-bold" style={{ color: c.text }}>{value}<span className="ml-0.5 text-[8px] lg:text-[10px] font-normal text-gray-400">{unit}</span></div>
                              </div>))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

          {totalPages > 1 && (
            <div className="mt-3 lg:mt-6 flex items-center justify-center gap-1 lg:gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(p => p - 1); setAk(k => k + 1) }}
                className="border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-40 h-7 px-2 text-[11px]"><ChevronLeft className="h-3.5 w-3.5 lg:h-4 lg:w-4" />上一页</Button>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} type="button" onClick={() => { setPage(p); setAk(k => k + 1) }}
                    className="h-6 w-6 lg:h-8 lg:w-8 rounded-full text-[11px] lg:text-sm font-medium transition"
                    style={p === page
                      ? { backgroundImage: `linear-gradient(to right, ${DEFAULT_C.from}, ${DEFAULT_C.to})`, color: "#fff" }
                      : { color: "#6b7280" }}>{p}</button>))}
              </div>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(p => p + 1); setAk(k => k + 1) }}
                className="border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-40 h-7 px-2 text-[11px]">下一页<ChevronRight className="h-3.5 w-3.5 lg:h-4 lg:w-4" /></Button>
            </div>
          )}
          <p className="mt-1.5 lg:mt-2 text-center text-[10px] lg:text-xs text-gray-400">第 {page} / {totalPages} 页，共 {visible.length} 种食物</p>
        </>
      )}

      {selected && <FoodDetailCard food={selected} onClose={() => setSelected(null)} />}
    </AppShell>
  )
}

// 别名避免与 map 内的 clr 变量冲突
function clr2(c?: string) { return clr(c) }
