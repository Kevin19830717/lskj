import { useState, useEffect, useCallback, useMemo, useRef, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { apiGet, type DashboardStats, type RecentMeal } from "@/lib/api"
import { cn } from "@/lib/utils"
import AppShell from "@/components/app-shell"
import { AnimatedNumber, GlowCard, GradientText } from "@/components/fx"
import { LiquidGlassButton } from "@/components/liquid-glass-button"
import { cookingColor } from "@/pages/RecordsPage"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AnimatedDropdown, type DropdownOption } from "@/components/animated-dropdown"
import { useDeviceTilt } from "@/components/hooks/use-device-tilt"
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

// 不同周期对应的热量趋势卡片宽度比例（calc减去gap的一半）
const chartWidthMap: Record<number, string> = {
  7: "calc(50% - 10px)",
  15: "calc(75% - 10px)",
  30: "100%",
}
const statsWidthMap: Record<number, string> = {
  7: "calc(50% - 10px)",
  15: "calc(25% - 10px)",
  30: "100%",
}

// ============================================================
// Stats Cards — 动态标签，支持垂直/水平布局
// ============================================================
function StatsGrid({ stats, days, layout }: { stats: DashboardStats | null; days: number; layout: "vertical" | "horizontal" }) {
  const periodLabel = periodOptions.find(o => o.days === days)?.label || `近${days}天`

  const statCards = [
    { id: "statCal", label: `${periodLabel}平均热量`, icon: Flame, color: "#FF5722", field: "avg_daily_energy_kcal" as const, unit: "kcal", decimals: 0 },
    { id: "statPro", label: `${periodLabel}平均蛋白质`, icon: Beef, color: "#E91E63", field: "total_protein_g" as const, unit: "g", decimals: 1 },
    { id: "statFat", label: `${periodLabel}平均脂肪`, icon: Droplets, color: "#FF9800", field: "total_fat_g" as const, unit: "g", decimals: 1 },
    { id: "statCarb", label: `${periodLabel}平均碳水`, icon: Wheat, color: "#4CAF50", field: "total_carbohydrate_g" as const, unit: "g", decimals: 1 },
  ]

  // 垂直布局（侧边窄列）：卡片纵向堆叠，图标和数值横向排列
  // 水平布局（底部全宽）：4卡片横向排列
  // 移动端：统计区独占第二行，2x2 紧凑网格
  const gridClass = layout === "vertical"
    ? "grid grid-cols-2 lg:grid-cols-1 gap-1.5 lg:gap-3"
    : "grid grid-cols-2 lg:grid-cols-4 gap-1.5 lg:gap-4"

  return (
    <div className={gridClass}>
      {statCards.map((card, i) => {
        const Icon = card.icon
        const value = stats ? stats[card.field] : null
        return (
          <motion.div
            key={card.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: i * 0.05, layout: { duration: 0.5, ease: [0.4, 0, 0.2, 1] } }}
            style={{ "--cc": card.color } as CSSProperties}
          >
            <GlowCard
              theme="green"
              className={cn(
                "h-full p-2",
                layout === "vertical" ? "lg:p-3.5" : "lg:p-4",
                // 移动端：扁平白底 + 彩色左边框（inset 阴影实现，避免与 border 工具类冲突）；桌面端：保留原流光卡片样式
                "bg-white lg:bg-white/70",
                "backdrop-blur-none lg:backdrop-blur-xl",
                "rounded-md lg:rounded-2xl",
                "shadow-[inset_3px_0_0_var(--cc)] lg:shadow-[0_4px_20px_rgba(0,0,0,0.06)]",
                "border-0 lg:border lg:border-white/50",
              )}
            >
              <div className={cn(
                "relative overflow-hidden flex items-center gap-1.5",
                layout === "vertical" ? "lg:gap-3" : "lg:flex-col lg:items-center lg:text-center lg:gap-2",
              )}>
                <div
                  className="absolute -top-5 -right-5 w-15 h-15 rounded-full opacity-10"
                  style={{ background: card.color }}
                />
                <div
                  className={cn(
                    "rounded-lg lg:rounded-xl flex items-center justify-center flex-shrink-0 w-6 h-6",
                    layout === "vertical" ? "lg:w-9 lg:h-9" : "lg:w-11 lg:h-11",
                  )}
                  style={{ background: `${card.color}18`, color: card.color }}
                >
                  <Icon className={cn("w-3 h-3", layout === "vertical" ? "lg:w-4 lg:h-4" : "lg:w-5 lg:h-5")} />
                </div>
                <div className={cn("min-w-0 flex flex-col", layout === "horizontal" && "lg:items-center")}>
                  <span className={cn(
                    "text-gray-500 font-medium truncate text-[9px]",
                    layout === "vertical" ? "lg:text-[11px]" : "lg:text-xs",
                  )}>{card.label}</span>
                  {value != null && value > 0 ? (
                    <span className={cn(
                      "font-bold text-gray-800 text-xs",
                      layout === "vertical" ? "lg:text-base" : "lg:text-lg",
                    )}>
                      <AnimatedNumber value={value} decimals={card.decimals} duration={1.2} />
                      <span className="text-[9px] lg:text-xs font-normal text-gray-400 ml-0.5">{card.unit}</span>
                    </span>
                  ) : (
                    <span className={cn(
                      "font-bold text-gray-300 text-xs",
                      layout === "vertical" ? "lg:text-base" : "lg:text-lg",
                    )}>--</span>
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

function ActivityChartCard({ stats, days }: { stats: DashboardStats | null; days: number }) {
  const periodLabel = periodOptions.find(o => o.days === days)?.label || `近${days}天`
  // 手机端点击柱状图显示详细数据：记录被点中的柱子索引
  const [tappedBar, setTappedBar] = useState<number | null>(null)

  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!stats?.energy_trend?.length) return []
    // 切换周期时清空点击态，避免错位
    setTappedBar(null)
    return stats.energy_trend.map((t) => ({
      day: t.date.slice(5),
      value: Math.round(t.value),
    }))
  }, [stats, days])

  // 桌面端标签间隔：每 4 天显示一个标签（统一规律，不特殊处理最后一天）
  const labelInterval = useMemo(() => {
    if (chartData.length <= 7) return 1
    if (chartData.length <= 15) return 2
    return 4
  }, [chartData.length])

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
    () => chartData.reduce((max, item) => (item.value > max ? item.value : max), 1),
    [chartData]
  )

  const isTrendUp = trendPct != null && trendPct >= 0

  return (
    <Card className={cn("w-full border-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] bg-white/92 backdrop-blur-[12px] py-2 lg:py-4 gap-2 lg:gap-3 lg:h-full lg:flex lg:flex-col")}>
      {/* 手机端：block 正常流式布局；桌面端：flex 列布局填充到与右侧统计卡等高 */}
      <CardContent className="px-3 lg:px-6 pb-3 lg:pb-4 lg:flex-1 lg:flex lg:flex-col lg:min-h-0">
        {chartData.length === 0 ? (
          <div className="py-6 lg:py-0 lg:flex-1 lg:flex lg:items-center lg:justify-center text-center text-muted-foreground text-xs lg:text-sm">暂无热量数据</div>
        ) : (
          <>
            {/* 总热量 + 标题(居中) + 趋势 — 同一行 */}
            <div className="relative flex items-end gap-2 lg:gap-3 mb-2 lg:mb-3">
              <GradientText className="text-lg lg:text-4xl font-bold tracking-tighter">
                {totalStr}
              </GradientText>
              <span className="text-[10px] lg:text-xs text-gray-400 mb-0.5 lg:mb-1.5">kcal 总计</span>
              {/* 标题居中显示 */}
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm lg:text-base font-bold flex items-center gap-1.5 lg:gap-2 whitespace-nowrap text-gray-700">
                <span className="text-sm lg:text-lg">📈</span> {periodLabel}热量趋势
              </span>
              {trendPct != null && (
                <div className="flex items-center gap-0.5 lg:gap-1 mb-0.5 lg:mb-1.5 ml-auto">
                  {isTrendUp ? (
                    <TrendingUp className="h-3 w-3 lg:h-4 lg:w-4 text-emerald-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 lg:h-4 lg:w-4 text-red-500" />
                  )}
                  <span className={cn("text-xs lg:text-sm font-semibold", isTrendUp ? "text-emerald-500" : "text-red-500")}>
                    {isTrendUp ? "+" : ""}{trendPct.toFixed(1)}%
                  </span>
                  <span className="text-[10px] lg:text-xs text-gray-400">vs 上半周期</span>
                </div>
              )}
            </div>

            {/* 柱状图 — 手机端固定 h-[80px]；桌面端 flex-1 填满，另给 lg:min-h-[220px] 避免近一月独立行被压缩 */}
            <div className="relative w-full h-[80px] lg:flex-1 lg:min-h-[220px]">
              <div className="absolute inset-0 flex items-end justify-between gap-1.5">
                {chartData.map((item, index) => {
                  const pct = maxValue > 0 ? (item.value / maxValue) * 100 : 0
                  const isTapped = tappedBar === index
                  return (
                    <div
                      key={`${days}-${index}`}
                      className="group relative flex-1 h-full flex flex-col justify-end items-center min-w-0 cursor-pointer"
                      onClick={() => setTappedBar(isTapped ? null : index)}
                    >
                      {/* 悬浮/点击提示：桌面端hover显示，手机端点击显示 */}
                      <div
                        className={cn(
                          "absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full transition-opacity z-10 pointer-events-none whitespace-nowrap rounded-lg bg-gray-800 px-2 py-1 text-xs text-white shadow-lg",
                          isTapped ? "opacity-100" : "opacity-0 lg:group-hover:opacity-100"
                        )}
                      >
                        {item.day}: {item.value} kcal
                      </div>
                      {/* 柱子 — 逐个从底部弹出，点击时加高亮阴影 */}
                      <motion.div
                        className={cn(
                          "w-full max-w-[40px] rounded-t-md bg-gradient-to-t from-[#16a34a] to-[#4ade80] transition-colors duration-200 group-hover:from-[#15803d] group-hover:to-[#22c55e]",
                          (isTapped) && "shadow-lg shadow-green-500/50 from-[#15803d] to-[#22c55e]"
                        )}
                        style={{
                          height: `${pct}%`,
                          minHeight: item.value > 0 ? "3px" : "0",
                        }}
                        initial={{ scaleY: 0, opacity: 0 }}
                        animate={{ scaleY: 1, opacity: 1 }}
                        transition={{
                          duration: 0.35,
                          delay: index * 0.04,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 手机端日期标签：7天全部显示；半月/一月只渲染3个span(左/中/右)，不再用N个flex-1空盒占位导致每格仅1/N宽度被截断 */}
            {chartData.length <= 7 ? (
              <div className="flex justify-between gap-1.5 mt-1 lg:hidden">
                {chartData.map((item) => (
                  <div key={`mob-${days}-${item.day}`} className="flex-1 min-w-0 text-center">
                    <span className="text-[9px] text-muted-foreground truncate block">{item.day}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex justify-between items-center gap-2 mt-1 lg:hidden">
                <span className="text-[9px] text-muted-foreground text-left">{chartData[0].day}</span>
                <span className="text-[9px] text-muted-foreground text-center">
                  {chartData[Math.floor(chartData.length / 2)].day}
                </span>
                <span className="text-[9px] text-muted-foreground text-right">
                  {chartData[chartData.length - 1].day}
                </span>
              </div>
            )}
            {/* 桌面端日期标签 — 4天间隔，统一规律不特殊处理最后一天 */}
            <div className="hidden lg:flex justify-between gap-1.5 mt-2 lg:flex-shrink-0">
              {chartData.map((item, index) => (
                <div key={`desk-${days}-${index}`} className="flex-1 min-w-0 text-center">
                  {index % labelInterval === 0 ? (
                    <span className="text-xs text-muted-foreground truncate block">
                      {item.day}
                    </span>
                  ) : (
                    <span className="text-xs text-transparent block">&nbsp;</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// NutrientDistribution — 营养素分布环形图
// ============================================================
function NutrientDistribution({ stats }: { stats: DashboardStats | null }) {
  const [hovered, setHovered] = useState<number | null>(null)
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
  const active = hovered !== null ? items[hovered] : null

  return (
    <Card className={cn("w-full border-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] bg-white/92 backdrop-blur-[12px] py-2 lg:py-6 gap-2 lg:gap-6")}>
      <CardHeader className="px-3 lg:px-6 py-0 lg:py-0">
        <CardTitle className="text-sm lg:text-base font-bold flex items-center gap-1.5 lg:gap-2">
          <PieChart className="h-4 w-4 lg:h-5 lg:w-5 text-green-500" /> 营养素分布
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 lg:px-6 pb-3 lg:pb-6 flex-1 flex flex-col justify-center">
        <div className="flex flex-row lg:flex-row items-center lg:items-center gap-2 lg:gap-6">
          <motion.div
            className="relative flex-shrink-0 cursor-pointer"
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <svg viewBox="0 0 160 160" className="w-[72px] h-[72px] lg:w-[160px] lg:h-[160px] -rotate-90">
              {items.map((item, i) => {
                const dash = (item.pct / total) * circumference
                const isHovered = hovered === i
                const dimmed = hovered !== null && !isHovered
                const circle = (
                  <motion.circle key={i} cx="80" cy="80" r={radius} fill="none"
                    stroke={item.color} strokeWidth={isHovered ? 26 : 20}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset} strokeLinecap="round"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                      opacity: dimmed ? 0.3 : 1,
                      scale: isHovered ? 1.04 : 1,
                    }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    style={{ transformOrigin: "80px 80px" }}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                  />
                )
                offset += dash
                return circle
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <AnimatedNumber
                value={stats?.total_meals ?? 0}
                duration={1.2}
                className="text-sm lg:text-2xl font-bold text-gray-800"
              />
              <span className="text-[8px] lg:text-xs text-gray-400">{active ? active.label : "总餐次"}</span>
              {active && (
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[8px] lg:text-[11px] font-semibold mt-0.5"
                  style={{ color: active.color }}
                >
                  {active.pct.toFixed(0)}%
                </motion.span>
              )}
            </div>
          </motion.div>
          <div className="flex-1 space-y-1 lg:space-y-3">
            {items.map((item, i) => {
              const Icon = item.icon
              const isHovered = hovered === i
              return (
                <div
                  key={item.label}
                  className="flex items-center gap-1.5 lg:gap-3 cursor-pointer transition-opacity"
                  style={{ opacity: hovered !== null && !isHovered ? 0.4 : 1 }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <motion.div
                    className="w-5 h-5 lg:w-8 lg:h-8 rounded-md lg:rounded-lg flex items-center justify-center"
                    style={{ background: `${item.color}18` }}
                    animate={{ scale: isHovered ? 1.15 : 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Icon className="w-2.5 h-2.5 lg:w-4 lg:h-4" style={{ color: item.color }} />
                  </motion.div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-[10px] lg:text-sm">
                      <span className="text-gray-600">{item.label}</span>
                      <span className="font-semibold text-gray-800">{item.pct.toFixed(0)}%</span>
                    </div>
                    <div className="mt-0.5 lg:mt-1 h-1 lg:h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: item.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${item.pct}%` }}
                        transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      />
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
  // 手机端用重力感应模拟桌面端鼠标悬停的 3D 倾斜
  useDeviceTilt(cardRef)
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl my-auto" style={{ perspective: "1000px" }} onClick={e => e.stopPropagation()}>
        <div ref={cardRef} onMouseMove={onMove} onMouseLeave={onLeave}
          className="relative rounded-3xl border bg-white p-3.5 lg:p-7 shadow-2xl transition-transform duration-200 ease-out [zoom:0.8] lg:[zoom:1]"
          style={{ borderColor: cc.from, transformStyle: "preserve-3d" }}>
          <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(to_right,#00000006_1px,transparent_1px),linear-gradient(to_bottom,#00000006_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]" />

          <button type="button" onClick={onClose} className="absolute right-3 top-3 lg:right-4 lg:top-4 z-20 rounded-full p-1.5 lg:p-2 text-gray-400 hover:bg-gray-100 transition-colors" style={{ transform: "translateZ(100px)" }}><X className="h-4 w-4 lg:h-5 lg:w-5" /></button>

          {/* 标题 + 烹饪方式标签 */}
          <div style={{ transform: "translateZ(60px)" }} className="relative z-10 mt-1 lg:mt-2 flex flex-wrap items-center justify-center gap-2 lg:gap-3">
            <h2 className="text-base lg:text-3xl font-bold tracking-tight text-gray-900">{names.join("、")}</h2>
            <LiquidGlassButton color={cc.from} className="!px-2.5 !py-1 !text-xs lg:!px-4 lg:!py-1.5 lg:!text-sm">
              <ChefHat className="h-2.5 w-2.5 lg:h-3 lg:w-3 mr-0.5 lg:mr-1" /> {methodLabel}
            </LiquidGlassButton>
          </div>

          {/* 食材明细 + 重量 + 烹饪时间 */}
          <div style={{ transform: "translateZ(40px)" }} className="relative z-10 mt-2 lg:mt-3 text-center">
            <div className="flex flex-wrap justify-center gap-1.5 lg:gap-2">
              {names.map((name, i) => (
                <span key={i} className="rounded-full px-2 py-0.5 lg:px-3 lg:py-1 text-xs lg:text-sm font-medium" style={{ backgroundColor: cc.bg, color: cc.text }}>
                  {name}{weights[i] != null ? ` ${Math.round(weights[i])}g` : ""}
                </span>
              ))}
            </div>
            <div className="mt-1.5 lg:mt-2 flex items-center justify-center gap-3">
              <p className="text-xs lg:text-sm text-gray-500">
                {new Date(meal.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>

          {/* 核心营养素 — 数值用主题色 */}
          <div style={{ transform: "translateZ(35px)" }} className="relative z-10 mt-3 lg:mt-5 grid grid-cols-2 lg:grid-cols-4 gap-1.5 lg:gap-2">
            {[["🔥","热量",metric(meal.cooked_energy_kcal),"kcal"],["💪","蛋白质",metric(meal.cooked_protein_g),"g"],["🧈","脂肪",metric(meal.cooked_fat_g),"g"],["🍚","碳水",metric(meal.cooked_carbohydrate_g),"g"]]
              .map(([icon, label, value, unit]) => (
                <div key={String(label)} className="rounded-lg lg:rounded-xl px-1.5 py-1 lg:px-2 lg:py-3 text-center shadow-sm" style={{ backgroundColor: cc.bg }}>
                  <div className="mb-0.5 lg:mb-1 text-sm lg:text-xl">{icon}</div>
                  <div className="text-xs lg:text-lg font-extrabold" style={{ color: cc.text }}>{value}</div>
                  <div className="text-[9px] lg:text-[10px] text-gray-500">{label} ({unit})</div>
                </div>))}
          </div>

          {/* 详细营养素 — 类似食物库的表格 */}
          {detailMetrics.length > 0 && (
            <div className="relative z-10 mt-3 lg:mt-4 pt-2 lg:pt-3" style={{ transform: "translateZ(20px)" }}>
              <div className="overflow-hidden rounded-lg lg:rounded-xl border" style={{ borderColor: cc.from }}>
                <table className="min-w-full text-[11px] lg:text-sm">
                  <thead style={{ backgroundImage: `linear-gradient(to right, ${cc.from}, ${cc.to})` }} className="text-white">
                    <tr><th className="px-2.5 py-1 lg:px-4 lg:py-2 text-left font-medium">营养素</th><th className="px-2.5 py-1 lg:px-4 lg:py-2 text-left font-medium">含量</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {detailMetrics.map((m) => (
                      <tr key={m.label}>
                        <td className="px-2.5 py-1 lg:px-4 lg:py-2 text-gray-700">{m.icon} {m.label}</td>
                        <td className="px-2.5 py-1 lg:px-4 lg:py-2 font-medium" style={{ color: cc.text }}>{metric(m.value)} {m.unit}</td>
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
// 导出供 ProfilePage 使用
// ============================================================
export function RecentMealsList({ days = 30, limit = 4 }: { days?: number; limit?: number }) {
  const [meals, setMeals] = useState<RecentMeal[]>([])
  const [selectedMeal, setSelectedMeal] = useState<RecentMeal | null>(null)

  useEffect(() => {
    apiGet<RecentMeal[]>(`/dashboard/recent-meals?days=${days}&limit=${limit}`).then((d) => {
      if (d.code === 0 && d.data) setMeals(d.data)
    }).catch(() => {})
  }, [days, limit])

  return (
    <>
      <Card className={cn("relative overflow-hidden w-full border-0 shadow-[0_8px_32px_rgba(102,126,234,0.1)] bg-white/92 backdrop-blur-[12px] py-2 lg:py-6 gap-2 lg:gap-6")}>
        <CardHeader className="px-3 lg:px-6 py-0 lg:py-0">
          <CardTitle className="text-sm lg:text-base font-bold flex items-center gap-1.5 lg:gap-2">
            <div className="w-5 h-5 lg:w-7 lg:h-7 rounded-md lg:rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center">
              <Clock className="h-3 w-3 lg:h-4 lg:w-4 text-white" />
            </div>
            最近餐食
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 lg:px-6 pb-3 lg:pb-6">
          {meals.length === 0 ? (
            <div className="py-4 lg:py-8 text-center text-xs lg:text-sm text-gray-400">暂无用餐记录</div>
          ) : (
            <div className="space-y-1 lg:space-y-3">
              {meals.map((meal, i) => {
                const cc = cookingColor(meal.cooking_method)
                const time = new Date(meal.created_at)
                const timeStr = time.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.08, ease: [0.4, 0, 0.2, 1] }}
                    className="flex items-center gap-1.5 lg:gap-3 rounded lg:rounded-xl px-2 py-1.5 lg:px-4 lg:py-3 cursor-pointer transition-all hover:shadow-md hover:translate-x-1"
                    style={{ backgroundColor: cc.bg }}
                    onClick={() => setSelectedMeal(meal)}
                  >
                    <div
                      className="w-6 h-6 lg:w-9 lg:h-9 rounded-md lg:rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 text-white"
                      style={{ backgroundImage: `linear-gradient(to right, ${cc.from}, ${cc.to})` }}
                    >
                      <ChefHat className="h-3 w-3 lg:h-4 lg:w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] lg:text-sm font-medium text-gray-800 truncate">
                        {meal.ingredient_names?.join("、") || meal.ingredients.join("、")}
                      </div>
                      <div className="text-[10px] lg:text-xs text-gray-400">{timeStr} · <span style={{ color: cc.text }}>{meal.cooking_method_label || meal.cooking_method}</span></div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[11px] lg:text-sm font-bold" style={{ color: cc.text }}>{Math.round(meal.cooked_energy_kcal)}</div>
                      <div className="text-[10px] lg:text-xs text-gray-400">kcal</div>
                    </div>
                  </motion.div>
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
    <Card className={cn("w-full border-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] bg-white/92 backdrop-blur-[12px] py-2 lg:py-4 gap-2 lg:gap-3")}>
      <CardHeader className="px-3 lg:px-6 py-0 lg:py-0">
        <CardTitle className="text-sm lg:text-base font-bold flex items-center gap-1.5 lg:gap-2">
          <Apple className="h-4 w-4 lg:h-5 lg:w-5 text-green-500" /> 常吃食物排行
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 lg:px-6 pb-3 lg:pb-4 flex-1 flex flex-col justify-center">
        {topFoods.length === 0 ? (
          <div className="py-4 lg:py-8 text-center text-xs lg:text-sm text-gray-400">暂无数据</div>
        ) : (
          <div className="space-y-1 lg:space-y-2">
            {topFoods.slice(0, 5).map((food, i) => (
              <div key={food.name} className="flex items-center gap-1.5 lg:gap-3">
                <span className="w-4 lg:w-5 text-[10px] lg:text-sm font-bold text-gray-400 flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-[10px] lg:text-sm mb-0.5 lg:mb-1">
                    <span className="text-gray-700 truncate">{food.name}</span>
                    <span className="text-gray-400 text-[10px] lg:text-xs">{food.count}次</span>
                  </div>
                  <div className="h-1 lg:h-2 rounded-full bg-gray-100 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#667eea] to-[#764ba2]"
                      initial={{ width: 0 }}
                      animate={{ width: `${(food.count / maxCount) * 100}%` }}
                      transition={{ duration: 0.5, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    />
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
  const chartWidth = chartWidthMap[days] || "calc(50% - 10px)"
  const statsWidth = statsWidthMap[days] || "calc(50% - 10px)"
  const statsLayout = days === 30 ? "horizontal" : "vertical"

  return (
    <AppShell title="仪表盘" titleIcon={<BarChart3 className="w-6 h-6 text-green-600" />} theme="green">
      {/* 全局时间范围选择器 */}
      <div className="flex items-center justify-between mb-2 lg:mb-5">
        <h2 className="text-sm lg:text-lg font-bold text-gray-700">
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

      {/* 第一行：热量趋势（左）+ 统计卡片（右），切换days时用淡入淡出+layout动画避免卡顿 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={days}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.25 }}
          className="mb-2 lg:mb-6"
        >
          <div className="flex flex-col lg:flex-row lg:flex-wrap gap-2 lg:gap-5">
            <div
              className="min-w-0 max-lg:!w-full"
              style={{
                width: chartWidth,
                transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <ActivityChartCard stats={stats} days={days} />
            </div>
            <div
              className="min-w-0 max-lg:!w-full"
              style={{
                width: statsWidth,
                transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <StatsGrid stats={stats} days={days} layout={statsLayout} />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* 第二行：营养素分布 + 常吃食物排行 — 切换时淡入 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`row2-${days}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="grid grid-cols-2 gap-2 lg:gap-5 lg:grid-cols-2"
        >
          <NutrientDistribution stats={stats} />
          <TopFoodsCard stats={stats} />
        </motion.div>
      </AnimatePresence>
    </AppShell>
  )
}
