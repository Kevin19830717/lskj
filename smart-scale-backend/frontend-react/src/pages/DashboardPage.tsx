import { useState, useEffect, useMemo } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import { apiGet, type DashboardStats, type RecentMeal } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  Flame,
  Beef,
  Droplets,
  Wheat,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  LogOut,
  BarChart3,
  ClipboardList,
  FileText,
  UtensilsCrossed,
  User,
} from "lucide-react"

// ============================================================
// Sidebar
// ============================================================
const navItems = [
  { path: "/dashboard", icon: BarChart3, label: "仪表盘", emoji: "📊", isReactRoute: true },
  { path: "/records", icon: ClipboardList, label: "历史记录", emoji: "📝", isReactRoute: false },
  { path: "/reports", icon: FileText, label: "营养报告", emoji: "📋", isReactRoute: false },
  { path: "/foods", icon: UtensilsCrossed, label: "食物库", emoji: "🍽️", isReactRoute: false },
  { path: "/profile", icon: User, label: "个人中心", emoji: "👤", isReactRoute: false },
]

function DashboardSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [userInitial, setUserInitial] = useState("?")

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}")
      const name = user.nickname || user.phone || ""
      if (name) setUserInitial(name.charAt(0).toUpperCase())
    } catch {}
  }, [])

  const handleNav = (path: string, isReactRoute: boolean) => {
    if (isReactRoute) {
      navigate(path)
    } else {
      window.location.href = path
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    navigate("/")
  }

  return (
    <nav className="w-60 bg-gradient-to-b from-[#2d2490] via-[#3730a3] to-[#667eea] text-white fixed left-0 top-0 bottom-0 z-50 flex flex-col shadow-[4px_0_24px_rgba(45,36,144,0.3)]">
      {/* Header */}
      <div className="text-center py-5 px-5 border-b border-white/10 relative">
        <span className="text-4xl inline-block drop-shadow-lg animate-[bounce_3s_ease-in-out_infinite]">🥗</span>
        <h2 className="text-[17px] font-bold mt-2 tracking-wider drop-shadow-sm">智能饮食秤</h2>
      </div>

      {/* Nav */}
      <ul className="list-none flex-1 py-3 px-0 overflow-y-auto scrollbar-none">
        {navItems.map((item) => {
          const isActive = item.isReactRoute
            ? location.pathname === item.path
            : location.pathname === item.path
          return (
            <li key={item.path} className={isActive ? "active" : ""}>
              <button
                onClick={() => handleNav(item.path, item.isReactRoute)}
                className={cn(
                  "w-full flex items-center gap-3 py-3 px-6 text-white/78 transition-all duration-300",
                  "border-l-[3px] text-left relative overflow-hidden",
                  "hover:bg-white/9 hover:text-white hover:translate-x-1 hover:border-l-yellow-400/50",
                  "before:content-[''] before:absolute before:left-0 before:top-0 before:w-0 before:h-full",
                  "before:bg-gradient-to-r before:from-yellow-300/15 before:to-transparent before:transition-all before:duration-300",
                  "hover:before:w-full",
                  isActive && "bg-gradient-to-r from-yellow-400/20 to-yellow-400/5 text-white border-l-yellow-400 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(255,213,79,0.1)] before:w-full"
                )}
              >
                <span className="text-lg w-[22px] text-center flex-shrink-0 transition-transform duration-300 hover:scale-110">
                  {item.emoji}
                </span>
                <span className="text-sm">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* User Area */}
      <div className="p-3.5 border-t border-white/10 bg-gradient-to-t from-black/8 to-transparent">
        <div className="flex items-center justify-between">
          <div
            className="w-[42px] h-[42px] rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center font-bold text-[17px] text-white shadow-[0_2px_10px_rgba(102,126,234,0.4)] border-2 border-white/25 cursor-pointer hover:scale-108 hover:shadow-[0_4px_16px_rgba(102,126,234,0.5)] transition-all duration-300"
            onClick={() => (window.location.href = "/profile")}
          >
            {userInitial}
          </div>
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 text-xs text-white/70 py-1.5 px-4 border border-white/18 rounded-full bg-white/6 tracking-wide hover:text-red-300/95 hover:bg-red-400/10 hover:border-red-300/28 transition-all duration-300 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3 h-3" />
              退出登录
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

// ============================================================
// Stats Cards
// ============================================================
const statCards = [
  { id: "statCal", label: "本周平均热量", icon: Flame, color: "#FF5722", field: "avg_daily_energy_kcal" as const, unit: "kcal", decimals: 0 },
  { id: "statPro", label: "本周平均蛋白质", icon: Beef, color: "#E91E63", field: "total_protein_g" as const, unit: "g", decimals: 1 },
  { id: "statFat", label: "本周平均脂肪", icon: Droplets, color: "#FF9800", field: "total_fat_g" as const, unit: "g", decimals: 1 },
  { id: "statCarb", label: "本周平均碳水", icon: Wheat, color: "#4CAF50", field: "total_carbohydrate_g" as const, unit: "g", decimals: 1 },
]

function StatsGrid({ stats }: { stats: DashboardStats | null }) {
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
            className="bg-white/80 backdrop-blur-[10px] rounded-[14px] p-5 flex items-center gap-4 shadow-[0_2px_8px_rgba(102,126,234,0.1)] border border-white/60 border-l-4 hover:-translate-y-[3px] hover:shadow-[0_12px_40px_rgba(102,126,234,0.18)] transition-all duration-300 relative overflow-hidden"
            style={{ borderLeftColor: card.color }}
          >
            <div
              className="absolute -top-5 -right-5 w-15 h-15 rounded-full opacity-8"
              style={{ background: card.color }}
            />
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${card.color}18`, color: card.color }}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-gray-500 font-medium truncate">{card.label}</span>
              <span className="text-lg font-bold text-gray-800">
                {value != null && value > 0 ? value.toFixed(card.decimals) : "--"}
                <span className="text-xs font-normal text-gray-400 ml-1">{card.unit}</span>
              </span>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// ============================================================
// ActivityChartCard (animated bar chart — template-based)
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

function ActivityChartCard() {
  const [selectedRange, setSelectedRange] = useState("本周")
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [totalKcal, setTotalKcal] = useState<string>("--")
  const [trendPct, setTrendPct] = useState<number | null>(null)

  const dropdownOptions = ["本周", "近14天", "近30天"]

  const rangeDays = useMemo(() => {
    if (selectedRange === "本周") return 7
    if (selectedRange === "近14天") return 14
    return 30
  }, [selectedRange])

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      try {
        const d = await apiGet<RecentMeal[]>(`/dashboard/recent-meals?limit=${Math.min(rangeDays * 5, 100)}`)
        if (d.code !== 0 || !d.data?.length) {
          setChartData([])
          setTotalKcal("--")
          setTrendPct(null)
          return
        }

        // Aggregate by day
        const dayMap: Record<string, number> = {}
        d.data.forEach((m) => {
          const date = (m.created_at || "").split("T")[0]
          if (!date) return
          dayMap[date] = (dayMap[date] || 0) + (m.cooked_energy_kcal || 0)
        })

        // Generate date range
        const dates: string[] = []
        const today = new Date()
        for (let i = rangeDays - 1; i >= 0; i--) {
          const dt = new Date(today)
          dt.setDate(dt.getDate() - i)
          dates.push(dt.toISOString().split("T")[0])
        }

        const dayLabels = ["日", "一", "二", "三", "四", "五", "六"]
        const data: ChartDataPoint[] = dates.map((date) => ({
          day: rangeDays <= 7 ? "周" + dayLabels[new Date(date).getDay()] : date.slice(5),
          value: Math.round(dayMap[date] || 0),
        }))

        if (cancelled) return
        setChartData(data)

        const total = data.reduce((a, b) => a + b.value, 0)
        setTotalKcal(total > 0 ? total.toLocaleString() : "0")

        const mid = Math.floor(data.length / 2)
        const firstHalf = data.slice(0, mid).reduce((a, b) => a + b.value, 0) / Math.max(mid, 1)
        const secondHalf = data.slice(mid).reduce((a, b) => a + b.value, 0) / Math.max(data.length - mid, 1)
        if (firstHalf > 0) {
          setTrendPct(((secondHalf - firstHalf) / firstHalf) * 100)
        } else {
          setTrendPct(null)
        }
      } catch {
        setChartData([])
        setTotalKcal("--")
        setTrendPct(null)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [rangeDays])

  const maxValue = useMemo(
    () => chartData.reduce((max, item) => (item.value > max ? item.value : max), 0),
    [chartData]
  )

  const isTrendUp = trendPct != null && trendPct >= 0

  return (
    <Card className={cn("w-full border-0 shadow-[0_4px_24px_rgba(0,0,0,0.06)] bg-white/92 backdrop-blur-[12px]")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <span className="text-lg">📈</span> 近{rangeDays}天热量趋势
          </CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-1 text-sm"
                aria-haspopup="true"
              >
                {selectedRange}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {dropdownOptions.map((option) => (
                <DropdownMenuItem
                  key={option}
                  onSelect={() => setSelectedRange(option)}
                  className={cn(option === selectedRange && "font-semibold text-[#667eea]")}
                >
                  {option}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          {/* Total Value */}
          <div className="flex flex-col">
            <p className="text-5xl font-bold tracking-tighter text-foreground">
              {totalKcal}
            </p>
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

          {/* Bar Chart */}
          <motion.div
            key={selectedRange}
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
                    className="w-full rounded-md bg-gradient-to-t from-[#764ba2] to-[#667eea]"
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
// Dashboard Page
// ============================================================
export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    // Auth check
    const token = localStorage.getItem("token")
    if (!token) {
      navigate("/")
      return
    }

    // Load stats
    apiGet<DashboardStats>("/dashboard/stats").then((d) => {
      if (d.code === 0 && d.data) setStats(d.data)
    }).catch(console.error)
  }, [navigate])

  return (
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(120%_100%_at_0%_0%,rgba(160,180,255,0.65)_0%,rgba(200,190,240,0.52)_35%,rgba(232,222,248,0.42)_60%,rgba(215,208,245,0.55)_100%)] bg-fixed">
      <DashboardSidebar />

      {/* Main */}
      <main className="ml-60 flex-1 p-7 h-screen max-w-[calc(100%-240px)] relative z-1 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="bg-[radial-gradient(ellipse_at_20%_0%,rgba(102,126,234,0.14)_0%,transparent_55%),radial-gradient(ellipse_at_80%_100%,rgba(118,75,162,0.11)_0%,transparent_55%)] backdrop-blur-[16px] saturate-[1.3] rounded-[20px] border border-[rgba(200,195,235,0.35)] shadow-[0_8px_32px_rgba(102,126,234,0.1),inset_0_1px_0_rgba(255,255,255,0.4)] p-7 min-h-full relative"
        >
          {/* Decorative light blobs */}
          <div className="absolute -top-15 -right-10 w-50 h-50 bg-[radial-gradient(circle,rgba(102,126,234,0.09)_0%,transparent_70%)] rounded-full pointer-events-none animate-[lightFloat_8s_ease-in-out_infinite]" />
          <div className="absolute -bottom-20 -left-8 w-45 h-45 bg-[radial-gradient(circle,rgba(118,75,162,0.07)_0%,transparent_70%)] rounded-full pointer-events-none animate-[lightFloat_10s_ease-in-out_infinite_reverse]" />

          {/* Top bar */}
          <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
            <h3 className="text-[22px] text-gray-800 font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[#667eea]" /> 仪表盘
            </h3>
          </div>

          {/* Stats */}
          <StatsGrid stats={stats} />

          {/* Chart */}
          <ActivityChartCard />
        </motion.div>
      </main>

      <style>{`
        @keyframes lightFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(15px, -10px) scale(1.1); }
        }
      `}</style>
    </div>
  )
}
