import { useState, useEffect, useCallback, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react"
import { motion } from "framer-motion"
import { apiGet, type DashboardStats, type RecentMeal } from "@/lib/api"
import { cn } from "@/lib/utils"
import AppShell from "@/components/app-shell"
import { AnimatedNumber, GlowCard, GradientText } from "@/components/fx"
import { LiquidGlassButton } from "@/components/liquid-glass-button"
import { cookingColor } from "@/pages/RecordsPage"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AnimatedDropdown, type DropdownOption } from "@/components/animated-dropdown"
import {
  Flame, Beef, Droplets, Wheat, TrendingUp, TrendingDown, BarChart3,
  Clock, PieChart, Apple, X, ChefHat,
} from "lucide-react"

function metric(v?: number) { if (v == null) return "-"; return v.toFixed(1) }

// ============================================================
// 时间范围选项
// ============================================================
const periodOptions = [
  { label: "近一周", days: 7 },
  { label: "近半月", days: 15 },
  { label: "近一月", days: 30 },
]

const periodDropdownOptions: DropdownOption[] = periodOptions.map((o) => ({
  value: String(o.days),
  label: o.label,
}))

// ============================================================
// Stats Cards — 动态标签
// ============================================================
function StatsGrid({ stats, days }: { stats: DashboardStats | null; days: number }) {
  const periodLabel = periodOptions.find(o => o.days === days)?.label || `近${days}天`

  const statCards = [
    { id: "statCal", label: `${periodLabel}平均热量`, icon: Flame, color: "#FF5722", field: "avg_daily_energy_kcal" as const, unit: "kcal", decimals: 0 },
    { id: "statPro", label: `${periodLabel}平均蛋白质`, icon: Beef, color: "#E91E63", field: "total_protein_g" as const, unit: "g", decimals: 1 },
    { id: "statFat", label: `${periodLabel}平均脂肪`, icon: Droplets, color: "#FF9800", field: "total_fat_g" as const, unit: "g", decimals: 1 },
    { id: "statCarb", label: `${periodLabel}平均碳水`, icon: Wheat, color: "#4CAF50", field: "total_carbohydrate_g" as const, unit: "g", decimals: 1 },
  ]

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4 mb-6">
      {statCards.map((card, i) => {
        const Icon = card.icon
        const value = stats ? stats[card.field] : null
        return (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
          >
            <GlowCard theme="green" className="p-5 h-full">
              <div className="flex items-center gap-4 relative overflow-hidden">
                <div
                  className="absolute -top-5 -right-5 w-15 h-15 rounded-full opacity-10"
                  style={{ background: card.color }}
                />
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${card.color}18`, color: card.color }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-gray-500 font-medium truncate">{card.label}</span>
                  {value != null && value > 0 ? (
                    <span className="text-lg font-bold text-gray-800">
                      <AnimatedNumber value={value} decimals={card.decimals} duration={1.2} />
                      <span className="text-xs font-normal text-gray-400 ml-1">{card.unit}</span>
                    </span>
                  ) : (
                    <span className="text-lg font-bold text-gray-300">--</span>
                  )}
                </div>
              </div>
            </GlowCard>
          </motion.div>
        )
      })}
    </div>
  )
}

// ============================================================
// ActivityChartCard — 热量趋势柱状图
// ============================================================
interface ChartDataPoint {
  day: string;
  value: number;
}

const chartVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const barVariants = {
  hidden: { scaleY: 0, opacity: 0, transformOrigin: "bottom" },
  visible: {
    scaleY: 1,
    opacity: 1,
    transformOrigin: "bottom",
    transition: {
      duration: 0.5,
      ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
    },
  },
}

function ActivityChartCard({ stats, days }: { stats: DashboardStats | null; days: number }) {
  const periodLabel = periodOptions.find(o => o.days === days)?.label || `近${days}天`

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!stats?.energy_trend?.length) return []
    const dayLabels = ["日", "一", "二", "三", "四", "五", "六"]
    return stats.energy_trend.map((t) => ({
      day: days <= 7 ? "周" + dayLabels[new Date(t.date).getDay()] : t.date.slice(5),
      value: Math.round(t.value),
    }))
  }, [stats, days])

  const totalKcal = chartData.reduce((a, b) => a + b.value, 0)
  const totalStr = totalKcal > 0 ? totalKcal.toLocaleString() : "0"

  const trendPct = useMemo(() => {
    if (chartData.length < 2) return null
    const mid = Math.floor(chartData.length / 2)
    const firstHalf = chartData.slice(0, mid).reduce((a, b) => a + b.value, 0) / Math.max(mid, 1)
    const secondHalf = chartData.slice(mid).reduce((a, b) => a + b.value, 0) / Math.max(chartData.length - mid, 1)
    if (firstHalf > 0) return ((secondHalf - firstHalf) / firstHalf) * 100
    return null
  }, [chartData])

  const maxValue = useMemo(
    () => chartData.reduce((max, item) => (item.value > max ? item.value : max), 0),
    [chartData]
  )

  const isTrendUp = trendPct != null && trendPct >= 0

  return (
    <Card className={cn("w-full border-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] bg-white/92 backdrop-blur-[12px]")}>
      <CardHeader>
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <span className="text-lg">📈</span> {periodLabel}热量趋势
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div className="flex flex-col">
            <GradientText className="text-5xl font-bold tracking-tighter">
              {totalStr}
            </GradientText>
            <CardDescription className="flex items-center gap-1 mt-1">
              {trendPct != null ? (
                <>
                  {isTrendUp ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                  <span className={isTrendUp ? "text-emerald-500" : "text-red-500"}>
                    {isTrendUp ? "+" : ""}{trendPct.toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground ml-0.5">vs 上半周期</span>
                </>
              ) : (
                <span className="text-muted-foreground">暂无趋势数据</span>
              )}
            </CardDescription>
          </div>

          <motion.div
            key={`chart-${days}`}
            className="flex h-28 w-full items-end justify-between gap-2"
            variants={chartVariants}
            initial="hidden"
            animate="visible"
            aria-label="Activity chart"
          >
            {chartData.length === 0 ? (
              <div className="flex-1 text-center text-muted-foreground text-sm py-8">暂无热量数据</div>
            ) : (
              chartData.map((item, index) => (
                <div
                  key={index}
                  className="flex h-full w-full flex-col items-center justify-end gap-2"
                  role="presentation"
                >
                  <motion.div
                    className="w-full rounded-md bg-gradient-to-t from-[#16a34a] to-[#4ade80]"
                    style={{
                      height: `${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%`,
                    }}
                    variants={barVariants}
                    aria-label={`${item.day}: ${item.value} kcal`}
                  />
                  <span className="text-xs text-muted-foreground">
                    {item.day}
                  </span>
                </div>
              ))
            )}
          </motion.div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// NutrientDistribution — 营养素分布环形图
// ============================================================
function NutrientDistribution({ stats }: { stats: DashboardStats | null }) {
  const dist = stats?.nutrient_distribution
  const items = [
    { label: "蛋白质", pct: dist?.protein_pct ?? 0, color: "#E91E63", icon: Beef },
    { label: "脂肪", pct: dist?.fat_pct ?? 0, color: "#FF9800", icon: Droplets },
    { label: "碳水", pct: dist?.carb_pct ?? 0, color: "#4CAF50", icon: Wheat },
  ]
  const total = items.reduce((a, b) => a + b.pct, 0) || 1

  const radius = 60
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <Card className={cn("w-full border-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] bg-white/92 backdrop-blur-[12px]")}>
      <CardHeader>
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <PieChart className="h-5 w-5 text-green-500" /> 营养素分布
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="relative flex-shrink-0">
            <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
              {items.map((item, i) => {
                const dash = (item.pct / total) * circumference
                const circle = (
                  <circle key={i} cx="80" cy="80" r={radius} fill="none"
                    stroke={item.color} strokeWidth="20"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset} strokeLinecap="round" />
                )
                offset += dash
                return circle
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-800">{stats?.total_meals ?? 0}</span>
              <span className="text-xs text-gray-400">总餐次</span>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            {items.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${item.color}18` }}>
                    <Icon className="w-4 h-4" style={{ color: item.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{item.label}</span>
                      <span className="font-semibold text-gray-800">{item.pct.toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                      <div className="h-full rounded-full" style={{ width: `${item.pct}%`, background: item.color }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// MealDetailCard — 餐食详情卡片（类似食物库的 3D 卡片）
// ============================================================
function MealDetailCard({ meal, onClose }: { meal: RecentMeal; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const cc = cookingColor(meal.cooking_method)
  const methodLabel = meal.cooking_method_label || meal.cooking_method || ""

  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const card = cardRef.current; if (!card) return
    const { left, top, width, height } = card.getBoundingClientRect()
    const rx = ((e.clientY - top - height / 2) / height) * 30
    const ry = ((e.clientX - left - width / 2) / width) * -30
    card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(1.04)`
  }
  const onLeave = () => { const el = cardRef.current; if (el) el.style.transform = "rotateX(0deg) rotateY(0deg) scale(1)" }

  const names = meal.ingredient_names?.length ? meal.ingredient_names : meal.ingredients
  const weights = meal.raw_weights_g || []

  const detailMetrics = [
    { label: "钠", value: meal.cooked_sodium_mg, unit: "mg", icon: "🧂" },
    { label: "胆固醇", value: meal.cooked_cholesterol_mg, unit: "mg", icon: "🩸" },
    { label: "维生素C", value: meal.cooked_vitamin_c_mg, unit: "mg", icon: "🍋" },
    { label: "钙", value: meal.cooked_calcium_mg, unit: "mg", icon: "🦴" },
    { label: "铁", value: meal.cooked_iron_mg, unit: "mg", icon: "⚡" },
    { label: "钾", value: meal.cooked_potassium_mg, unit: "mg", icon: "🫀" },
  ].filter((m) => m.value != null && m.value > 0)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4 py-8" onClick={onClose}>
      <div className="w-full max-w-2xl" style={{ perspective: "1000px" }} onClick={e => e.stopPropagation()}>
        <div ref={cardRef} onMouseMove={onMove} onMouseLeave={onLeave}
          className="rounded-3xl border bg-white p-7 shadow-2xl transition-transform duration-200 ease-out"
          style={{ borderColor: cc.from, transformStyle: "preserve-3d" }}>
          <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(to_right,#00000006_1px,transparent_1px),linear-gradient(to_bottom,#00000006_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]" />

          <button type="button" onClick={onClose} className="absolute right-4 top-4 z-20 rounded-full p-2 text-gray-400 hover:bg-gray-100 transition-colors" style={{ transform: "translateZ(100px)" }}><X className="h-5 w-5" /></button>

          {/* 标题 + 烹饪方式标签 */}
          <div style={{ transform: "translateZ(60px)" }} className="relative z-10 mt-2 flex flex-wrap items-center justify-center gap-3">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">{names.join("、")}</h2>
            <LiquidGlassButton color={cc.from} className="!px-4 !py-1.5 !text-sm">
              <ChefHat className="h-3 w-3 mr-1" /> {methodLabel}
            </LiquidGlassButton>
          </div>

          {/* 食材明细 + 重量 + 烹饪时间 */}
          <div style={{ transform: "translateZ(40px)" }} className="relative z-10 mt-3 text-center">
            <div className="flex flex-wrap justify-center gap-2">
              {names.map((name, i) => (
                <span key={i} className="rounded-full px-3 py-1 text-sm font-medium" style={{ backgroundColor: cc.bg, color: cc.text }}>
                  {name}{weights[i] != null ? ` ${Math.round(weights[i])}g` : ""}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-center gap-3">
              <p className="text-sm text-gray-500">
                {new Date(meal.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>

          {/* 核心营养素 — 数值用主题色 */}
          <div style={{ transform: "translateZ(35px)" }} className="relative z-10 mt-5 grid grid-cols-4 gap-2">
            {[["🔥","热量",metric(meal.cooked_energy_kcal),"kcal"],["💪","蛋白质",metric(meal.cooked_protein_g),"g"],["🧈","脂肪",metric(meal.cooked_fat_g),"g"],["🍚","碳水",metric(meal.cooked_carbohydrate_g),"g"]]
              .map(([icon, label, value, unit]) => (
                <div key={String(label)} className="rounded-xl px-2 py-3 text-center shadow-sm" style={{ backgroundColor: cc.bg }}>
                  <div className="mb-1 text-xl">{icon}</div>
                  <div className="text-lg font-extrabold" style={{ color: cc.text }}>{value}</div>
                  <div className="text-[10px] text-gray-500">{label} ({unit})</div>
                </div>))}
          </div>

          {/* 详细营养素 — 类似食物库的表格 */}
          {detailMetrics.length > 0 && (
            <div className="relative z-10 mt-4 pt-3" style={{ transform: "translateZ(20px)" }}>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: cc.from }}>
                <table className="min-w-full text-sm">
                  <thead style={{ backgroundImage: `linear-gradient(to right, ${cc.from}, ${cc.to})` }} className="text-white">
                    <tr><th className="px-4 py-2 text-left font-medium">营养素</th><th className="px-4 py-2 text-left font-medium">含量</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {detailMetrics.map((m) => (
                      <tr key={m.label}>
                        <td className="px-4 py-2 text-gray-700">{m.icon} {m.label}</td>
                        <td className="px-4 py-2 font-medium" style={{ color: cc.text }}>{metric(m.value)} {m.unit}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// RecentMealsList — 最近用餐记录（可点击查看详情）
// ============================================================
function RecentMealsList({ days }: { days: number }) {
  const [meals, setMeals] = useState<RecentMeal[]>([])
  const [selectedMeal, setSelectedMeal] = useState<RecentMeal | null>(null)

  useEffect(() => {
    apiGet<RecentMeal[]>(`/dashboard/recent-meals?days=${days}&limit=4`).then((d) => {
      if (d.code === 0 && d.data) setMeals(d.data)
    }).catch(() => {})
  }, [days])

  return (
    <>
      <Card className={cn("w-full border-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] bg-white/92 backdrop-blur-[12px]")}>
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-green-500" /> 最近用餐
          </CardTitle>
        </CardHeader>
        <CardContent>
          {meals.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">暂无用餐记录</div>
          ) : (
            <div className="space-y-3">
              {meals.map((meal, i) => {
                const cc = cookingColor(meal.cooking_method)
                const time = new Date(meal.created_at)
                const timeStr = time.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-all hover:shadow-md"
                    style={{ backgroundColor: cc.bg }}
                    onClick={() => setSelectedMeal(meal)}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 text-white"
                      style={{ backgroundImage: `linear-gradient(to right, ${cc.from}, ${cc.to})` }}
                    >
                      <ChefHat className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {meal.ingredient_names?.join("、") || meal.ingredients.join("、")}
                      </div>
                      <div className="text-xs text-gray-400">{timeStr} · <span style={{ color: cc.text }}>{meal.cooking_method_label || meal.cooking_method}</span></div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold" style={{ color: cc.text }}>{Math.round(meal.cooked_energy_kcal)}</div>
                      <div className="text-xs text-gray-400">kcal</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {selectedMeal && <MealDetailCard meal={selectedMeal} onClose={() => setSelectedMeal(null)} />}
    </>
  )
}

// ============================================================
// TopFoodsCard — 常吃食物排行
// ============================================================
function TopFoodsCard({ stats }: { stats: DashboardStats | null }) {
  const topFoods = stats?.top_foods ?? []
  const maxCount = Math.max(...topFoods.map(f => f.count), 1)

  return (
    <Card className={cn("w-full border-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] bg-white/92 backdrop-blur-[12px]")}>
      <CardHeader>
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Apple className="h-5 w-5 text-green-500" /> 常吃食物排行
        </CardTitle>
      </CardHeader>
      <CardContent>
        {topFoods.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">暂无数据</div>
        ) : (
          <div className="space-y-2">
            {topFoods.slice(0, 5).map((food, i) => (
              <div key={food.name} className="flex items-center gap-3">
                <span className="w-5 text-sm font-bold text-gray-400 flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700 truncate">{food.name}</span>
                    <span className="text-gray-400 text-xs">{food.count}次</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2]" style={{ width: `${(food.count / maxCount) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// Dashboard Page
// ============================================================
export default function DashboardPage() {
  const [days, setDays] = useState(7)
  const [stats, setStats] = useState<DashboardStats | null>(null)

  const fetchStats = useCallback(() => {
    apiGet<DashboardStats>(`/dashboard/stats?days=${days}`).then((d) => {
      if (d.code === 0 && d.data) setStats(d.data)
    }).catch(console.error)
  }, [days])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const selectedPeriod = periodOptions.find(o => o.days === days) || periodOptions[0]

  return (
    <AppShell title="仪表盘" titleIcon={<BarChart3 className="w-6 h-6 text-green-600" />} theme="green">
      {/* 全局时间范围选择器 */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-700">
          {selectedPeriod.label}数据概览
        </h2>
        <AnimatedDropdown
          options={periodDropdownOptions}
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          theme="green"
          icon={<Clock className="h-4 w-4" />}
          size="sm"
        />
      </div>

      {/* 统计卡片 */}
      <StatsGrid stats={stats} days={days} />

      {/* 热量趋势 + 营养分布 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ActivityChartCard stats={stats} days={days} />
        <NutrientDistribution stats={stats} />
      </div>

      {/* 最近用餐 + 食物排行 */}
      <div className="grid gap-5 lg:grid-cols-2 mt-5">
        <RecentMealsList days={days} />
        <TopFoodsCard stats={stats} />
      </div>
    </AppShell>
  )
}
