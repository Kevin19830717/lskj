import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Capacitor } from "@capacitor/core"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Apple,
  BarChart3,
  Brain,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Leaf,
  LoaderCircle,
  Lock,
  LogOut,
  Pencil,
  Phone,
  RotateCcw,
  Search,
  SendHorizontal,
  Sparkles,
  UserRound,
  X,
} from "lucide-react"
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { AnimatedNumber } from "@/components/fx"
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  type AnalysisSummary,
  type ApiResponse,
  type CompanionStats,
  type DashboardStats,
  type Food,
  type FoodSearchResult,
  type PaginatedRecords,
  type UserProfile,
  type WeighRecord,
} from "@/lib/api"
import { cn } from "@/lib/utils"

const API_BASE = (import.meta.env.VITE_API_BASE as string) || "/api/v1"
const FORCE_MOBILE_KEY = "force_mobile_app"

type AuthData = {
  token: string
  user: {
    id: number
    phone: string
    nickname: string
    avatar_url?: string
    created_at: string
  }
}

type MobileTabKey = "records" | "reports" | "ai-chat" | "foods" | "profile"

type ChatMsg = {
  role: "user" | "assistant"
  content: string
  thinking?: string
  thinkingDone?: boolean
}

type ReportType = "daily" | "weekly" | "monthly" | "yearly"

type PaginatedFoods = {
  items: Food[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

const quickQuestions = [
  "分析饮食",
  "增加蛋白质",
  "减脂怎么吃",
  "晚餐推荐",
]

const goals: Record<string, string> = {
  lose_weight: "减脂",
  gain_weight: "增重",
  maintain: "维持",
  muscle_gain: "增肌",
  health_maintenance: "健康维护",
}

const genders: Record<string, string> = {
  male: "男",
  female: "女",
  other: "其他",
}

const categoryStyles = [
  { key: "all", label: "全部", emoji: "🍽️", test: () => true, className: "from-emerald-500 to-lime-500" },
  { key: "fruit", label: "水果", emoji: "🍎", test: (v: string) => /fruit|水果/i.test(v), className: "from-pink-500 to-rose-500" },
  { key: "meat", label: "肉类", emoji: "🥩", test: (v: string) => /meat|肉/i.test(v), className: "from-orange-500 to-red-500" },
  { key: "vegetable", label: "蔬菜", emoji: "🥦", test: (v: string) => /vegetable|蔬菜/i.test(v), className: "from-green-500 to-emerald-500" },
  { key: "egg", label: "蛋类", emoji: "🥚", test: (v: string) => /egg|蛋/i.test(v), className: "from-amber-400 to-yellow-500" },
  { key: "bean", label: "豆制品", emoji: "🫘", test: (v: string) => /bean|豆/i.test(v), className: "from-lime-500 to-green-500" },
  { key: "seafood", label: "海鲜", emoji: "🐟", test: (v: string) => /seafood|fish|海鲜/i.test(v), className: "from-cyan-500 to-sky-500" },
  { key: "staple", label: "主食", emoji: "🍚", test: (v: string) => /grain|staple|rice|主食/i.test(v), className: "from-violet-500 to-fuchsia-500" },
  { key: "dairy", label: "乳制品", emoji: "🥛", test: (v: string) => /milk|dairy|乳/i.test(v), className: "from-indigo-500 to-blue-500" },
  { key: "other", label: "其他", emoji: "📦", test: () => true, className: "from-slate-500 to-gray-500" },
] as const

const reportTypes: Array<{ key: ReportType; label: string; emoji: string; className: string }> = [
  { key: "daily", label: "日报", emoji: "🌞", className: "from-amber-500 to-orange-500" },
  { key: "weekly", label: "周报", emoji: "📅", className: "from-emerald-500 to-green-500" },
  { key: "monthly", label: "月报", emoji: "🗓️", className: "from-cyan-500 to-blue-500" },
  { key: "yearly", label: "年报", emoji: "🎯", className: "from-violet-500 to-fuchsia-500" },
]

const cookingOptions = [
  { value: "boil", label: "煮" },
  { value: "steam", label: "蒸" },
  { value: "stir_fry", label: "炒" },
  { value: "braise", label: "炖" },
  { value: "roast", label: "烤" },
  { value: "pan_fry", label: "煎" },
  { value: "deep_fry", label: "炸" },
]

const tabItems: Array<{ key: MobileTabKey; label: string; path: string; icon: ReactNode }> = [
  { key: "records", label: "记录", path: "/records", icon: <CalendarDays className="h-4 w-4" /> },
  { key: "reports", label: "报告", path: "/reports", icon: <BarChart3 className="h-4 w-4" /> },
  { key: "ai-chat", label: "AI", path: "/ai-chat", icon: <Sparkles className="h-4 w-4" /> },
  { key: "foods", label: "食物库", path: "/foods", icon: <Apple className="h-4 w-4" /> },
  { key: "profile", label: "我的", path: "/profile", icon: <UserRound className="h-4 w-4" /> },
]

function getHasToken() {
  return typeof window !== "undefined" ? Boolean(localStorage.getItem("token")) : false
}

function getStoredUser() {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem("user")
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function notifyAuthChanged() {
  window.dispatchEvent(new Event("smart-scale-auth-change"))
}

function saveSession(auth: AuthData) {
  localStorage.setItem("token", auth.token)
  localStorage.setItem("user", JSON.stringify(auth.user))
  notifyAuthChanged()
}

function clearSession() {
  localStorage.removeItem("token")
  localStorage.removeItem("user")
  notifyAuthChanged()
}

async function authLogin(phone: string, password: string): Promise<ApiResponse<AuthData>> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  })
  return res.json()
}

async function authRegister(phone: string, password: string, nickname: string): Promise<ApiResponse<AuthData>> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password, nickname }),
  })
  return res.json()
}

function useIsMobileApp() {
  const location = useLocation()
  return useMemo(() => {
    if (Capacitor.isNativePlatform()) return true
    const params = new URLSearchParams(location.search)
    if (params.get("mobile") === "1") {
      sessionStorage.setItem(FORCE_MOBILE_KEY, "1")
      return true
    }
    return sessionStorage.getItem(FORCE_MOBILE_KEY) === "1"
  }, [location.search])
}

function formatDateTime(dateStr?: string) {
  if (!dateStr) return "-"
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "-"
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function formatMetric(value?: number | null, digits = 1) {
  if (value == null || Number.isNaN(value)) return "-"
  return digits === 0 ? String(Math.round(value)) : Number(value).toFixed(digits)
}

function firstText(value?: string) {
  return value?.trim()?.slice(0, 1) || "餐"
}

function categoryLabel(food: Food) {
  const source = `${food.category || ""} ${food.name} ${food.name_en}`
  const matched = categoryStyles.find((item) => item.key !== "all" && item.key !== "other" && item.test(source))
  return matched?.label || "其他"
}

function categoryKey(food: Food) {
  const source = `${food.category || ""} ${food.name} ${food.name_en}`
  const matched = categoryStyles.find((item) => item.key !== "all" && item.key !== "other" && item.test(source))
  return matched?.key || "other"
}

function reportTypeLabel(type: string) {
  return reportTypes.find((item) => item.key === type)?.label || type
}

function toDatetimeLocal(dateStr?: string) {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (v: number) => String(v).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function calcBMI(heightCm?: number, weightKg?: number) {
  if (!heightCm || !weightKg) return null
  const heightM = heightCm / 100
  if (!heightM) return null
  return weightKg / (heightM * heightM)
}

const primaryButtonClass =
  "rounded-2xl bg-[linear-gradient(135deg,#10b981_0%,#667eea_55%,#7c3aed_100%)] text-white shadow-[0_14px_28px_rgba(76,29,149,0.22),0_8px_22px_rgba(16,185,129,0.18)] active:scale-95"

const ghostButtonClass =
  "rounded-2xl border border-white/60 bg-white/72 text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl active:scale-95"

const successSoftButtonClass =
  "rounded-2xl border border-emerald-200/60 bg-emerald-50/85 text-emerald-700 shadow-[0_8px_20px_rgba(16,185,129,0.10)] backdrop-blur active:scale-95"

const dangerSoftButtonClass =
  "rounded-2xl border border-rose-200/60 bg-rose-50/88 text-rose-600 shadow-[0_8px_20px_rgba(244,63,94,0.10)] backdrop-blur active:scale-95"

const inputClass =
  "w-full rounded-2xl border border-white/65 bg-white/76 px-3 py-3 text-[13px] text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_22px_rgba(15,23,42,0.05)] outline-none backdrop-blur placeholder:text-slate-400"

function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 z-40 bg-black/35"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-50 overflow-hidden rounded-t-[34px] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(244,240,255,0.94))] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_80px_rgba(31,41,55,0.24)] backdrop-blur-2xl"
          >
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-10 left-1/4 h-28 w-28 rounded-full bg-emerald-300/18 blur-3xl" />
              <div className="absolute top-0 right-0 h-28 w-28 rounded-full bg-violet-300/18 blur-3xl" />
            </div>
            <div className="relative mx-auto mb-3 h-1.5 w-12 rounded-full bg-[linear-gradient(90deg,#10b981,#8b5cf6)]" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="bg-[linear-gradient(90deg,#10b981,#7c3aed)] bg-clip-text text-sm font-semibold text-transparent">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/50 bg-white/70 text-slate-500 shadow-sm backdrop-blur active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative max-h-[76dvh] overflow-y-auto pr-1">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function SectionCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-white/58 bg-[linear-gradient(145deg,rgba(255,255,255,0.86),rgba(255,255,255,0.60))] p-3 shadow-[0_14px_34px_rgba(76,29,149,0.10),0_8px_24px_rgba(16,185,129,0.08)] backdrop-blur-2xl",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-10 -top-8 h-20 w-20 rounded-full bg-violet-300/16 blur-2xl" />
        <div className="absolute -bottom-8 left-0 h-16 w-24 rounded-full bg-emerald-300/12 blur-2xl" />
        <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      </div>
      <div className="relative">{children}</div>
    </div>
  )
}

function TinyStat({
  label,
  value,
  unit,
  color,
}: {
  label: string
  value: number
  unit?: string
  color: string
}) {
  return (
    <div className="rounded-[20px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(248,250,252,0.68))] p-2 shadow-[0_10px_22px_rgba(15,23,42,0.05)] backdrop-blur">
      <div className="mb-1 h-1 w-8 rounded-full" style={{ background: `linear-gradient(90deg, ${color}, rgba(255,255,255,0.65))` }} />
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold tracking-tight" style={{ color }}>
        <AnimatedNumber value={value} decimals={unit === "kcal" ? 0 : 1} />
        {unit ? <span className="ml-0.5 text-[10px] font-medium text-slate-400">{unit}</span> : null}
      </div>
    </div>
  )
}

function AppHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[26px] border border-white/55 bg-white/58 px-3 py-2 shadow-[0_12px_28px_rgba(76,29,149,0.08)] backdrop-blur-2xl">
      <div>
        <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-emerald-500">Smart Scale</div>
        <h1 className="bg-[linear-gradient(90deg,#0f766e,#667eea,#7c3aed)] bg-clip-text text-base font-semibold text-transparent">{title}</h1>
      </div>
      {right}
    </div>
  )
}

function MobileAuthPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<"login" | "register">("login")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [nickname, setNickname] = useState("")
  const [password2, setPassword2] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  const submit = async () => {
    if (!/^\d{11}$/.test(phone)) {
      setMessage("请输入正确的 11 位手机号")
      return
    }
    if (password.length < 6) {
      setMessage("密码至少 6 位")
      return
    }
    if (tab === "register") {
      if (!nickname.trim()) {
        setMessage("请填写昵称")
        return
      }
      if (password !== password2) {
        setMessage("两次输入密码不一致")
        return
      }
    }
    setLoading(true)
    setMessage("")
    try {
      const result = tab === "login"
        ? await authLogin(phone.trim(), password)
        : await authRegister(phone.trim(), password, nickname.trim())
      if (result.code === 0 && result.data) {
        saveSession(result.data)
        navigate("/profile", { replace: true })
        return
      }
      if (tab === "register" && result.code === 0 && !result.data) {
        const loginResult = await authLogin(phone.trim(), password)
        if (loginResult.code === 0 && loginResult.data) {
          saveSession(loginResult.data)
          navigate("/profile", { replace: true })
          return
        }
      }
      setMessage(result.message || "操作失败，请重试")
    } catch {
      setMessage("网络连接失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[linear-gradient(160deg,#0b1120_0%,#0f172a_16%,#065f46_42%,#667eea_72%,#7c3aed_100%)] px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-[max(16px,env(safe-area-inset-top))] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-14 left-[-12%] h-44 w-44 rounded-full bg-emerald-300/24 blur-3xl" />
        <div className="absolute top-[28%] right-[-10%] h-52 w-52 rounded-full bg-violet-300/24 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[20%] h-40 w-40 rounded-full bg-fuchsia-300/16 blur-3xl" />
      </div>
      <div className="flex flex-1 flex-col justify-between">
        <div className="relative pt-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/10 px-3 py-1.5 text-[11px] font-medium backdrop-blur-xl">
            <Sparkles className="h-3.5 w-3.5" />
            绿紫双主题移动端
          </div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">智能饮食健康秤</h1>
          <p className="mt-2 max-w-[18rem] text-[13px] text-white/82">延续网页版的绿紫视觉，把登录、功能入口和层级都做成更像原生 App 的玻璃质感。</p>
        </div>

        <div className="relative rounded-[34px] border border-white/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(245,242,255,0.88))] p-4 text-slate-900 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[34px]">
            <div className="absolute -top-10 right-0 h-28 w-28 rounded-full bg-violet-300/16 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-emerald-300/12 blur-3xl" />
          </div>
          <div className="relative mb-4 flex rounded-2xl border border-white/70 bg-white/60 p-1 shadow-sm backdrop-blur">
            {(["login", "register"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMessage("")
                  setTab(item)
                }}
                className={cn(
                  "relative flex-1 rounded-xl py-2 text-[13px] font-semibold transition",
                  tab === item ? "text-violet-700" : "text-slate-500"
                )}
              >
                {tab === item && (
                  <motion.span
                    layoutId="auth-pill"
                    className="absolute inset-0 rounded-xl bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(124,58,237,0.12),rgba(255,255,255,0.95))] shadow-[0_8px_20px_rgba(76,29,149,0.10)]"
                  />
                )}
                <span className="relative z-10">{item === "login" ? "登录" : "注册"}</span>
              </button>
            ))}
          </div>

          <div className="relative space-y-3">
            {tab === "register" && (
              <label className="block">
                <div className="mb-1 text-[11px] font-medium text-slate-500">昵称</div>
                <div className={cn("flex items-center gap-2", inputClass)}>
                  <UserRound className="h-4 w-4 text-violet-500" />
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="给自己起个名字"
                    className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                  />
                </div>
              </label>
            )}
            <label className="block">
              <div className="mb-1 text-[11px] font-medium text-slate-500">手机号</div>
              <div className={cn("flex items-center gap-2", inputClass)}>
                <Phone className="h-4 w-4 text-emerald-500" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入 11 位手机号"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                />
              </div>
            </label>
            <label className="block">
              <div className="mb-1 text-[11px] font-medium text-slate-500">密码</div>
              <div className={cn("flex items-center gap-2", inputClass)}>
                <Lock className="h-4 w-4 text-violet-500" />
                <input
                  value={password}
                  type="password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                />
              </div>
            </label>
            {tab === "register" && (
              <label className="block">
                <div className="mb-1 text-[11px] font-medium text-slate-500">确认密码</div>
                <div className={cn("flex items-center gap-2", inputClass)}>
                  <Lock className="h-4 w-4 text-violet-500" />
                  <input
                    value={password2}
                    type="password"
                    onChange={(e) => setPassword2(e.target.value)}
                    placeholder="再次输入密码"
                    className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                  />
                </div>
              </label>
            )}
          </div>

          {message ? (
            <div className="mt-3 rounded-2xl border border-rose-200/70 bg-rose-50/88 px-3 py-2 text-[12px] text-rose-600 shadow-sm">{message}</div>
          ) : null}

          <button
            type="button"
            disabled={loading}
            onClick={submit}
            className={cn("mt-4 flex w-full items-center justify-center gap-2 py-3 text-[13px] font-semibold disabled:opacity-60", primaryButtonClass)}
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {tab === "login" ? "进入移动端 App" : "创建账号并进入"}
          </button>
        </div>

        <div className="pb-1 text-center text-[11px] text-white/74">
          保持 PC 端不变，移动端走独立手机 UI
        </div>
      </div>
    </div>
  )
}

function MobileLayout({
  activeTab,
  title,
  children,
}: {
  activeTab: MobileTabKey
  title: string
  children: ReactNode
}) {
  const navigate = useNavigate()

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[linear-gradient(180deg,#edfdf5_0%,#f5f3ff_38%,#eef2ff_72%,#f8fafc_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-10 left-[-12%] h-40 w-40 rounded-full bg-emerald-300/24 blur-3xl" />
        <div className="absolute top-[18%] right-[-10%] h-48 w-48 rounded-full bg-violet-300/22 blur-3xl" />
        <div className="absolute bottom-[8%] left-[16%] h-36 w-36 rounded-full bg-fuchsia-200/18 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(102,126,234,0.05)_1px,transparent_1px)] bg-[size:22px_22px] opacity-70" />
      </div>
      <div className="relative flex h-full flex-col px-3 pb-[calc(88px+max(10px,env(safe-area-inset-bottom)))] pt-[max(10px,env(safe-area-inset-top))]">
        <div className="mb-2 flex items-center justify-between rounded-[26px] border border-white/50 bg-white/38 px-3 py-2 shadow-[0_14px_32px_rgba(76,29,149,0.10)] backdrop-blur-2xl">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#10b981_0%,#667eea_55%,#7c3aed_100%)] text-white shadow-[0_10px_20px_rgba(76,29,149,0.18)]">
              <Leaf className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-500">Smart Scale Mobile</div>
              <div className="bg-[linear-gradient(90deg,#0f766e,#667eea,#7c3aed)] bg-clip-text text-sm font-semibold text-transparent">{title}</div>
            </div>
          </div>
          <div className="rounded-full border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(255,255,255,0.42))] px-2.5 py-1 text-[10px] font-medium text-violet-600 backdrop-blur">
            Green x Purple
          </div>
        </div>

        <div className="min-h-0 flex-1">{children}</div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(8px,env(safe-area-inset-bottom))]">
        <div className="rounded-[30px] border border-white/38 bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(30,41,59,0.70))] p-1.5 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-2xl">
          <div className="grid grid-cols-5 gap-1">
            {tabItems.map((item) => {
              const selected = item.key === activeTab
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="relative flex flex-col items-center gap-1 rounded-[22px] py-2 text-[10px] font-medium text-slate-500 active:scale-95"
                >
                  {selected ? (
                    <motion.span
                      layoutId="tab-pill"
                      className="absolute inset-0 rounded-[22px] bg-[linear-gradient(135deg,#10b981_0%,#667eea_55%,#7c3aed_100%)] shadow-[0_10px_24px_rgba(76,29,149,0.30)]"
                    />
                  ) : null}
                  <span className={cn("relative z-10", selected ? "text-white" : "text-white/70")}>{item.icon}</span>
                  <span className={cn("relative z-10", selected ? "text-white" : "text-white/70")}>{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function MobileProfilePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [companion, setCompanion] = useState<CompanionStats | null>(null)
  const [healthScore, setHealthScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nickname: "",
    gender: "other",
    age: "",
    height_cm: "",
    weight_kg: "",
    health_goal: "maintain",
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [profileRes, statsRes, companionRes, healthRes] = await Promise.all([
          apiGet<UserProfile>("/user/profile"),
          apiGet<DashboardStats>("/dashboard/stats?days=7"),
          apiGet<CompanionStats>("/dashboard/companion"),
          apiGet<{ health_score: number }>("/user/health-score"),
        ])
        if (cancelled) return
        setProfile(profileRes.data ?? null)
        setStats(statsRes.data ?? null)
        setCompanion(companionRes.data ?? null)
        setHealthScore(healthRes.data?.health_score ?? 0)
        const p = profileRes.data
        if (p) {
          setForm({
            nickname: p.nickname || "",
            gender: p.gender || "other",
            age: p.age != null ? String(p.age) : "",
            height_cm: p.height_cm != null ? String(p.height_cm) : "",
            weight_kg: p.weight_kg != null ? String(p.weight_kg) : "",
            health_goal: p.health_goal || "maintain",
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const bmi = calcBMI(profile?.height_cm, profile?.weight_kg)

  const saveProfile = async () => {
    setSaving(true)
    const payload = {
      nickname: form.nickname || undefined,
      gender: form.gender || undefined,
      age: form.age ? Number(form.age) : undefined,
      height_cm: form.height_cm ? Number(form.height_cm) : undefined,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined,
      health_goal: form.health_goal || undefined,
    }
    const res = await apiPut("/user/profile", payload)
    setSaving(false)
    if (res.code === 0) {
      const user = getStoredUser()
      if (user) {
        localStorage.setItem("user", JSON.stringify({ ...user, nickname: form.nickname || user.nickname }))
      }
      notifyAuthChanged()
      setEditOpen(false)
      const profileRes = await apiGet<UserProfile>("/user/profile")
      setProfile(profileRes.data ?? null)
    }
  }

  const logout = () => {
    clearSession()
    navigate("/", { replace: true })
  }

  return (
    <MobileLayout activeTab="profile" title="我的">
      <div className="flex h-full min-h-0 flex-col gap-2">
        <AppHeader
          title="我的"
          right={
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className={cn("px-3 py-2 text-[12px] font-medium", ghostButtonClass)}
            >
              编辑
            </button>
          }
        />

        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_auto_auto_auto] gap-2">
          <SectionCard className="bg-[linear-gradient(135deg,rgba(16,185,129,0.90)_0%,rgba(102,126,234,0.90)_55%,rgba(124,58,237,0.88)_100%)] text-white shadow-[0_18px_42px_rgba(76,29,149,0.24),0_10px_28px_rgba(16,185,129,0.18)]">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl border border-white/18 bg-white/18 text-lg font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.26)]">
                {firstText(profile?.nickname || profile?.phone)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">{profile?.nickname || "未设置昵称"}</div>
                <div className="truncate text-[11px] text-white/84">{profile?.phone || "暂无手机号"}</div>
                <div className="mt-1 inline-flex rounded-full bg-white/16 px-2 py-1 text-[10px]">
                  已陪伴 {companion?.total_days ?? 0} 天
                </div>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/14 px-3 py-2 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                <div className="text-[10px] text-white/70">健康评分</div>
                <div className="text-lg font-semibold">{healthScore}</div>
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12px] font-semibold text-slate-900">本周营养概览</div>
              <div className="text-[10px] text-slate-400">尽量一屏看完</div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <TinyStat label="热量" value={stats?.avg_daily_energy_kcal ?? 0} unit="kcal" color="#f97316" />
              <TinyStat label="蛋白" value={stats?.total_protein_g ?? 0} unit="g" color="#ec4899" />
              <TinyStat label="脂肪" value={stats?.total_fat_g ?? 0} unit="g" color="#f59e0b" />
              <TinyStat label="碳水" value={stats?.total_carbohydrate_g ?? 0} unit="g" color="#22c55e" />
            </div>
          </SectionCard>

          <SectionCard>
            <div className="mb-2 text-[12px] font-semibold text-slate-900">营养素分布</div>
            {[
              { label: "蛋白质", value: stats?.nutrient_distribution?.protein_pct ?? 0, color: "bg-pink-500" },
              { label: "脂肪", value: stats?.nutrient_distribution?.fat_pct ?? 0, color: "bg-amber-500" },
              { label: "碳水", value: stats?.nutrient_distribution?.carb_pct ?? 0, color: "bg-emerald-500" },
            ].map((item) => (
              <div key={item.label} className="mb-2 last:mb-0">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">{item.label}</span>
                  <span className="font-medium text-slate-700">{formatMetric(item.value, 1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className={cn("h-2 rounded-full", item.color)} style={{ width: `${Math.min(item.value, 100)}%` }} />
                </div>
              </div>
            ))}
          </SectionCard>

          <SectionCard>
            <div className="mb-2 text-[12px] font-semibold text-slate-900">陪伴记录</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "记录天数", value: companion?.total_days ?? 0 },
                { label: "记录餐数", value: companion?.total_meals ?? 0 },
                { label: "常用方式", value: companion?.favorite_method_label || "暂无" },
                { label: "食材种类", value: companion?.ingredient_variety ?? 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-slate-50 p-2">
                  <div className="text-[10px] text-slate-500">{item.label}</div>
                  <div className="mt-1 text-[13px] font-semibold text-slate-900">{item.value}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard className="min-h-0">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12px] font-semibold text-slate-900">个人信息</div>
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin text-emerald-500" /> : null}
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              {[
                { label: "性别", value: genders[profile?.gender || ""] || "未填" },
                { label: "年龄", value: profile?.age ?? "未填" },
                { label: "身高", value: profile?.height_cm ? `${profile.height_cm} cm` : "未填" },
                { label: "体重", value: profile?.weight_kg ? `${profile.weight_kg} kg` : "未填" },
                { label: "BMI", value: bmi ? bmi.toFixed(1) : "未填" },
                { label: "目标", value: goals[profile?.health_goal || ""] || "未填" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl bg-slate-50 p-2">
                  <div className="text-[10px] text-slate-500">{item.label}</div>
                  <div className="mt-1 truncate font-medium text-slate-800">{item.value}</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={logout}
              className={cn("mt-3 flex w-full items-center justify-center gap-2 py-2.5 text-[12px] font-semibold", dangerSoftButtonClass)}
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </SectionCard>
        </div>
      </div>

      <BottomSheet open={editOpen} title="编辑个人信息" onClose={() => setEditOpen(false)}>
        <div className="space-y-3">
          <label className="block">
            <div className="mb-1 text-[11px] text-slate-500">昵称</div>
            <input
              value={form.nickname}
              onChange={(e) => setForm((prev) => ({ ...prev, nickname: e.target.value }))}
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1 text-[11px] text-slate-500">性别</div>
              <select
                value={form.gender}
                onChange={(e) => setForm((prev) => ({ ...prev, gender: e.target.value }))}
                className={inputClass}
              >
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-[11px] text-slate-500">年龄</div>
              <input
                value={form.age}
                onChange={(e) => setForm((prev) => ({ ...prev, age: e.target.value }))}
                className={inputClass}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1 text-[11px] text-slate-500">身高 cm</div>
              <input
                value={form.height_cm}
                onChange={(e) => setForm((prev) => ({ ...prev, height_cm: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <div className="mb-1 text-[11px] text-slate-500">体重 kg</div>
              <input
                value={form.weight_kg}
                onChange={(e) => setForm((prev) => ({ ...prev, weight_kg: e.target.value }))}
                className={inputClass}
              />
            </label>
          </div>
          <label className="block">
            <div className="mb-1 text-[11px] text-slate-500">健康目标</div>
            <select
              value={form.health_goal}
              onChange={(e) => setForm((prev) => ({ ...prev, health_goal: e.target.value }))}
              className={inputClass}
            >
              {Object.entries(goals).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className={cn("flex w-full items-center justify-center gap-2 py-3 text-[13px] font-semibold disabled:opacity-60", primaryButtonClass)}
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            保存资料
          </button>
        </div>
      </BottomSheet>
    </MobileLayout>
  )
}

function MobileRecordsPage() {
  const [records, setRecords] = useState<PaginatedRecords | null>(null)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState("")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<WeighRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    cooking_method: "",
    created_at: "",
    cooked_weight_g: "",
    cooked_energy_kcal: "",
    cooked_protein_g: "",
    cooked_fat_g: "",
    cooked_carbohydrate_g: "",
    items: [{ name: "", weight: "" }],
  })

  const loadRecords = async (currentPage = page) => {
    setLoading(true)
    const res = await apiGet<PaginatedRecords>(`/records?page=${currentPage}&page_size=8`)
    setRecords(res.data ?? null)
    setLoading(false)
  }

  useEffect(() => {
    loadRecords(page)
  }, [page])

  const filteredItems = useMemo(() => {
    const items = records?.items ?? []
    if (!query.trim()) return items
    const q = query.toLowerCase().trim()
    return items.filter((item) => {
      const names = item.ingredient_names?.length ? item.ingredient_names : item.ingredients
      return names.some((name) => name.toLowerCase().includes(q)) || (item.cooking_method_label || item.cooking_method || "").toLowerCase().includes(q)
    })
  }, [query, records])

  const openEdit = (record: WeighRecord) => {
    const names = record.ingredient_names?.length ? record.ingredient_names : record.ingredients
    setEditing(record)
    setForm({
      cooking_method: record.cooking_method || "",
      created_at: toDatetimeLocal(record.created_at),
      cooked_weight_g: record.cooked_weight_g != null ? String(record.cooked_weight_g) : "",
      cooked_energy_kcal: record.cooked_energy_kcal != null ? String(record.cooked_energy_kcal) : "",
      cooked_protein_g: record.cooked_protein_g != null ? String(record.cooked_protein_g) : "",
      cooked_fat_g: record.cooked_fat_g != null ? String(record.cooked_fat_g) : "",
      cooked_carbohydrate_g: record.cooked_carbohydrate_g != null ? String(record.cooked_carbohydrate_g) : "",
      items: names.map((name, index) => ({ name, weight: String(record.raw_weights_g?.[index] ?? "") })),
    })
  }

  const saveRecord = async () => {
    if (!editing) return
    setSaving(true)
    const body = {
      ingredients: form.items.map((item) => item.name).filter(Boolean),
      raw_weights_g: form.items.map((item) => Number(item.weight) || 0),
      cooking_method: form.cooking_method || undefined,
      cooked_weight_g: Number(form.cooked_weight_g) || 0,
      cooked_energy_kcal: Number(form.cooked_energy_kcal) || 0,
      cooked_protein_g: Number(form.cooked_protein_g) || 0,
      cooked_fat_g: Number(form.cooked_fat_g) || 0,
      cooked_carbohydrate_g: Number(form.cooked_carbohydrate_g) || 0,
      created_at: form.created_at ? new Date(form.created_at).toISOString() : undefined,
    }
    const res = await apiPut(`/records/${editing.id}`, body)
    setSaving(false)
    if (res.code === 0) {
      setEditing(null)
      loadRecords()
    }
  }

  const deleteRecord = async (id: number) => {
    if (!window.confirm("确定删除这条记录吗？")) return
    const res = await apiDelete(`/records/${id}`)
    if (res.code === 0) {
      if ((records?.items.length || 0) === 1 && page > 1) {
        setPage((prev) => prev - 1)
      } else {
        loadRecords()
      }
    }
  }

  return (
    <MobileLayout activeTab="records" title="记录">
      <div className="flex h-full min-h-0 flex-col gap-2">
        <AppHeader title="历史记录" />

        <SectionCard className="py-2">
          <div className="flex items-center gap-2 rounded-[22px] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(243,244,255,0.76))] px-3 py-2 shadow-sm backdrop-blur">
            <Search className="h-4 w-4 text-violet-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索食材或烹饪方式"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
            />
          </div>
        </SectionCard>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-2">
            {loading ? (
              <SectionCard className="flex items-center justify-center py-8 text-slate-400">
                <LoaderCircle className="h-5 w-5 animate-spin" />
              </SectionCard>
            ) : filteredItems.length === 0 ? (
              <SectionCard className="py-8 text-center text-[12px] text-slate-400">暂无记录</SectionCard>
            ) : (
              filteredItems.map((record) => {
                const names = record.ingredient_names?.length ? record.ingredient_names : record.ingredients
                const expanded = expandedId === record.id
                return (
                  <SectionCard key={record.id} className="overflow-hidden p-0">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : record.id)}
                      className="w-full px-3 py-3 text-left"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-slate-900">{names.join("、")}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                            <Clock3 className="h-3 w-3" />
                            {formatDateTime(record.created_at)}
                            <span className="rounded-full border border-emerald-200/60 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(124,58,237,0.08))] px-1.5 py-0.5 text-emerald-700">
                              {record.cooking_method_label || record.cooking_method || "未设置"}
                            </span>
                          </div>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition", expanded ? "rotate-180" : "")} />
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-1.5">
                        <TinyStat label="热量" value={record.cooked_energy_kcal ?? 0} unit="kcal" color="#f97316" />
                        <TinyStat label="蛋白" value={record.cooked_protein_g ?? 0} unit="g" color="#ec4899" />
                        <TinyStat label="脂肪" value={record.cooked_fat_g ?? 0} unit="g" color="#f59e0b" />
                        <TinyStat label="碳水" value={record.cooked_carbohydrate_g ?? 0} unit="g" color="#22c55e" />
                      </div>
                    </button>

                    <AnimatePresence>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-slate-100"
                        >
                          <div className="space-y-3 px-3 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {names.map((name, index) => (
                                <span key={`${name}-${index}`} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">
                                  {name} {record.raw_weights_g?.[index] ? `${Math.round(record.raw_weights_g[index])}g` : ""}
                                </span>
                              ))}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[11px]">
                              {[
                                { label: "钠", value: record.cooked_sodium_mg, unit: "mg" },
                                { label: "胆固醇", value: record.cooked_cholesterol_mg, unit: "mg" },
                                { label: "维生素C", value: record.cooked_vitamin_c_mg, unit: "mg" },
                                { label: "钙", value: record.cooked_calcium_mg, unit: "mg" },
                                { label: "铁", value: record.cooked_iron_mg, unit: "mg" },
                                { label: "钾", value: record.cooked_potassium_mg, unit: "mg" },
                              ].map((item) => (
                                <div key={item.label} className="rounded-2xl bg-slate-50 p-2">
                                  <div className="text-[10px] text-slate-500">{item.label}</div>
                                  <div className="mt-1 font-medium text-slate-800">{formatMetric(item.value)} {item.unit}</div>
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openEdit(record)}
                                className={cn("flex flex-1 items-center justify-center gap-1 py-2 text-[12px] font-medium", successSoftButtonClass)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                编辑
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteRecord(record.id)}
                                className={cn("flex flex-1 items-center justify-center gap-1 py-2 text-[12px] font-medium", dangerSoftButtonClass)}
                              >
                                <X className="h-3.5 w-3.5" />
                                删除
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </SectionCard>
                )
              })
            )}
          </div>
        </div>

        <SectionCard className="py-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className={cn("flex items-center gap-1 px-3 py-2 text-[12px] font-medium disabled:opacity-40", ghostButtonClass)}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </button>
            <div className="text-[11px] text-slate-500">第 {page} / {records?.total_pages || 1} 页</div>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(records?.total_pages || prev, prev + 1))}
              disabled={page >= (records?.total_pages || 1)}
              className={cn("flex items-center gap-1 px-3 py-2 text-[12px] font-medium disabled:opacity-40", successSoftButtonClass)}
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </SectionCard>
      </div>

      <BottomSheet open={Boolean(editing)} title="编辑记录" onClose={() => setEditing(null)}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1 text-[11px] text-slate-500">用餐时间</div>
              <input
                type="datetime-local"
                value={form.created_at}
                onChange={(e) => setForm((prev) => ({ ...prev, created_at: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <div className="mb-1 text-[11px] text-slate-500">烹饪方式</div>
              <select
                value={form.cooking_method}
                onChange={(e) => setForm((prev) => ({ ...prev, cooking_method: e.target.value }))}
                className={inputClass}
              >
                <option value="">未设置</option>
                {cookingOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-slate-500">食材行</div>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, items: [...prev.items, { name: "", weight: "" }] }))}
                className="text-[11px] font-medium text-emerald-600"
              >
                添加
              </button>
            </div>
            {form.items.map((item, index) => (
              <div key={index} className="grid grid-cols-[1fr_96px_32px] gap-2">
                <input
                  value={item.name}
                  onChange={(e) => setForm((prev) => {
                    const items = [...prev.items]
                    items[index] = { ...items[index], name: e.target.value }
                    return { ...prev, items }
                  })}
                  placeholder="食材名"
                  className={inputClass}
                />
                <input
                  value={item.weight}
                  onChange={(e) => setForm((prev) => {
                    const items = [...prev.items]
                    items[index] = { ...items[index], weight: e.target.value }
                    return { ...prev, items }
                  })}
                  placeholder="克数"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))}
                  disabled={form.items.length === 1}
                  className={cn("text-slate-500 disabled:opacity-40", ghostButtonClass)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "cooked_weight_g", label: "熟重 g" },
              { key: "cooked_energy_kcal", label: "热量 kcal" },
              { key: "cooked_protein_g", label: "蛋白 g" },
              { key: "cooked_fat_g", label: "脂肪 g" },
              { key: "cooked_carbohydrate_g", label: "碳水 g" },
            ].map((item) => (
              <label key={item.key} className="block">
                <div className="mb-1 text-[11px] text-slate-500">{item.label}</div>
                <input
                  value={form[item.key as keyof typeof form] as string}
                  onChange={(e) => setForm((prev) => ({ ...prev, [item.key]: e.target.value }))}
                  className={inputClass}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={saveRecord}
            disabled={saving}
            className={cn("flex w-full items-center justify-center gap-2 py-3 text-[13px] font-semibold disabled:opacity-60", primaryButtonClass)}
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            保存修改
          </button>
        </div>
      </BottomSheet>
    </MobileLayout>
  )
}

function MobileReportsPage() {
  const [type, setType] = useState<ReportType>("daily")
  const [page, setPage] = useState(1)
  const [reports, setReports] = useState<AnalysisSummary[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [selected, setSelected] = useState<AnalysisSummary | null>(null)
  const [detailTab, setDetailTab] = useState<"basic" | "foods" | "ai">("basic")

  const loadReports = async (reportType = type, currentPage = page) => {
    setLoading(true)
    const res = await apiGet<{ items: AnalysisSummary[]; total_pages: number }>(`/summaries?type=${reportType}&page=${currentPage}&page_size=8`)
    setReports(res.data?.items ?? [])
    setTotalPages(res.data?.total_pages ?? 1)
    setLoading(false)
  }

  useEffect(() => {
    loadReports(type, page)
  }, [type, page])

  const generateReport = async () => {
    setBusy(true)
    await apiPost(`/summaries/generate-next?type=${type}`)
    setBusy(false)
    loadReports(type, page)
  }

  const clearReports = async () => {
    setClearing(true)
    await apiDelete(type === "daily" ? "/summaries" : "/summaries?exclude_daily=true")
    setClearing(false)
    setSelected(null)
    setPage(1)
    loadReports(type, 1)
  }

  return (
    <MobileLayout activeTab="reports" title="报告">
      <div className="flex h-full min-h-0 flex-col gap-2">
        <AppHeader title="营养报告" />

        <SectionCard className="p-2">
          <div className="grid grid-cols-4 gap-1">
            {reportTypes.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setType(item.key)
                  setPage(1)
                }}
                className="relative rounded-2xl py-2 text-[11px] font-semibold text-slate-500 active:scale-95"
              >
                {type === item.key ? (
                  <motion.span layoutId="report-pill" className={cn("absolute inset-0 rounded-2xl bg-gradient-to-r", item.className)} />
                ) : null}
                <span className={cn("relative z-10", type === item.key ? "text-white" : "text-slate-500")}>
                  {item.emoji} {item.label}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={generateReport}
              disabled={busy}
            className={cn("flex flex-1 items-center justify-center gap-1 py-2 text-[12px] font-semibold disabled:opacity-60", successSoftButtonClass)}
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              生成
            </button>
            <button
              type="button"
              onClick={clearReports}
              disabled={clearing}
            className={cn("flex flex-1 items-center justify-center gap-1 py-2 text-[12px] font-semibold disabled:opacity-60", dangerSoftButtonClass)}
            >
              {clearing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              清除
            </button>
          </div>
        </SectionCard>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-2">
            {loading ? (
              <SectionCard className="flex items-center justify-center py-8 text-slate-400">
                <LoaderCircle className="h-5 w-5 animate-spin" />
              </SectionCard>
            ) : reports.length === 0 ? (
              <SectionCard className="py-8 text-center text-[12px] text-slate-400">暂无报告</SectionCard>
            ) : (
              reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => {
                    setSelected(report)
                    setDetailTab("basic")
                  }}
                  className="w-full text-left"
                >
                  <SectionCard className="active:scale-[0.99]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(124,58,237,0.08))] px-2 py-1 text-[10px] font-semibold text-emerald-700">
                          {reportTypes.find((item) => item.key === report.summary_type)?.emoji} {reportTypeLabel(report.summary_type)}
                        </div>
                        <div className="mt-1 text-[13px] font-semibold text-slate-900">{formatDate(report.summary_date)}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-2.5 py-1.5 text-right">
                        <div className="text-[10px] text-slate-500">AI 总结</div>
                        <div className="text-[11px] font-medium text-slate-700">
                          {report.insights?.ai_summary ? "已生成" : "待生成"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      <TinyStat label="热量" value={Number(report.insights?.avg_daily_energy_kcal || report.insights?.total_energy_kcal || 0)} unit="kcal" color="#f97316" />
                      <TinyStat label="蛋白" value={Number(report.insights?.total_protein_g || 0)} unit="g" color="#ec4899" />
                      <TinyStat label="脂肪" value={Number(report.insights?.total_fat_g || 0)} unit="g" color="#f59e0b" />
                      <TinyStat label="碳水" value={Number(report.insights?.total_carbohydrate_g || 0)} unit="g" color="#22c55e" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(report.insights?.top_foods || []).slice(0, 3).map((food) => (
                        <span key={food.name} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">
                          {food.name}
                        </span>
                      ))}
                    </div>
                  </SectionCard>
                </button>
              ))
            )}
          </div>
        </div>

        <SectionCard className="py-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className={cn("flex items-center gap-1 px-3 py-2 text-[12px] font-medium disabled:opacity-40", ghostButtonClass)}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </button>
            <div className="text-[11px] text-slate-500">第 {page} / {totalPages} 页</div>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className={cn("flex items-center gap-1 px-3 py-2 text-[12px] font-medium disabled:opacity-40", successSoftButtonClass)}
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </SectionCard>
      </div>

      <BottomSheet open={Boolean(selected)} title="报告详情" onClose={() => setSelected(null)}>
        {selected ? (
          selected.summary_type === "daily" ? (
            <div className="space-y-3 text-[12px]">
              <SectionCard className="bg-slate-50">
                <div className="text-[11px] text-slate-500">日期</div>
                <div className="mt-1 font-semibold text-slate-900">{formatDate(selected.summary_date)}</div>
              </SectionCard>
              <SectionCard>
                <div className="mb-2 text-[12px] font-semibold text-slate-900">核心营养</div>
                <div className="grid grid-cols-2 gap-2">
                  <TinyStat label="总热量" value={Number(selected.insights?.total_energy_kcal || 0)} unit="kcal" color="#f97316" />
                  <TinyStat label="蛋白" value={Number(selected.insights?.total_protein_g || 0)} unit="g" color="#ec4899" />
                  <TinyStat label="脂肪" value={Number(selected.insights?.total_fat_g || 0)} unit="g" color="#f59e0b" />
                  <TinyStat label="碳水" value={Number(selected.insights?.total_carbohydrate_g || 0)} unit="g" color="#22c55e" />
                </div>
              </SectionCard>
              <SectionCard>
                <div className="text-[12px] font-semibold text-slate-900">AI 总结</div>
                <div className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-slate-600">
                  {selected.insights?.ai_summary || selected.insights?.ai_advice || "暂无 AI 总结"}
                </div>
              </SectionCard>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex rounded-2xl bg-slate-100 p-1">
                {[
                  { key: "basic", label: "基本信息" },
                  { key: "foods", label: "常吃食物" },
                  { key: "ai", label: "AI 总结" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setDetailTab(item.key as "basic" | "foods" | "ai")}
                    className="relative flex-1 rounded-xl py-2 text-[12px] font-medium text-slate-500"
                  >
                    {detailTab === item.key ? <motion.span layoutId="report-detail-pill" className="absolute inset-0 rounded-xl bg-white shadow-sm" /> : null}
                    <span className={cn("relative z-10", detailTab === item.key ? "text-emerald-600" : "text-slate-500")}>{item.label}</span>
                  </button>
                ))}
              </div>
              {detailTab === "basic" ? (
                <SectionCard>
                  <div className="mb-2 text-[12px] font-semibold text-slate-900">时间范围</div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-2xl bg-slate-50 p-2">
                      <div className="text-slate-500">开始</div>
                      <div className="mt-1 font-medium text-slate-800">{formatDate(String(selected.insights?.period_start || ""))}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-2">
                      <div className="text-slate-500">结束</div>
                      <div className="mt-1 font-medium text-slate-800">{formatDate(String(selected.insights?.period_end || ""))}</div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <TinyStat label="总餐数" value={Number(selected.insights?.total_meals || 0)} color="#10b981" />
                    <TinyStat label="均热量" value={Number(selected.insights?.avg_daily_energy_kcal || 0)} unit="kcal" color="#f97316" />
                  </div>
                </SectionCard>
              ) : null}
              {detailTab === "foods" ? (
                <SectionCard>
                  <div className="mb-2 text-[12px] font-semibold text-slate-900">常吃食物</div>
                  <div className="space-y-2">
                    {(selected.insights?.top_foods || []).length ? (
                      selected.insights.top_foods!.map((food) => (
                        <div key={food.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-[12px]">
                          <div>
                            <div className="font-medium text-slate-800">{food.name}</div>
                            <div className="text-[10px] text-slate-400">{food.name_en}</div>
                          </div>
                          <div className="text-right text-[11px] text-slate-500">
                            <div>{food.count} 次</div>
                            <div>{Math.round(food.total_weight_g)}g</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-[12px] text-slate-400">暂无食物数据</div>
                    )}
                  </div>
                </SectionCard>
              ) : null}
              {detailTab === "ai" ? (
                <SectionCard>
                  <div className="mb-2 text-[12px] font-semibold text-slate-900">AI 总结</div>
                  <div className="whitespace-pre-wrap text-[12px] leading-6 text-slate-600">
                    {selected.insights?.ai_summary || selected.insights?.ai_advice || "暂无 AI 总结"}
                  </div>
                </SectionCard>
              ) : null}
            </div>
          )
        ) : null}
      </BottomSheet>
    </MobileLayout>
  )
}

function MobileAIPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content: "你好呀，我可以分析饮食、帮你补蛋白、给你减脂建议，也可以直接看你的历史数据来回答。",
    },
  ])
  const [mode, setMode] = useState<"fast" | "expert">(() => (localStorage.getItem("mobile_ai_mode") as "fast" | "expert") || "fast")
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    localStorage.setItem("mobile_ai_mode", mode)
  }, [mode])

  useEffect(() => {
    let cancelled = false
    async function loadHistory() {
      try {
        const res = await apiGet<{ history: ChatMsg[] }>("/ai/chat/history")
        if (!cancelled && res.code === 0 && res.data?.history?.length) {
          setMessages(res.data.history)
        }
      } finally {
        if (!cancelled) setHistoryLoaded(true)
      }
    }
    loadHistory()
    return () => {
      cancelled = true
    }
  }, [])

  useLayoutEffect(() => {
    if (!historyLoaded || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, loading, historyLoaded])

  const submit = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const userMessage: ChatMsg = { role: "user", content }
    const history = messages.map((item) => ({ role: item.role, content: item.content }))
    setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "", thinking: "" }])
    setInput("")
    setLoading(true)
    setThinking(mode === "expert")

    const controller = new AbortController()
    abortRef.current = controller
    let fullText = ""
    let fullThinking = ""

    try {
      const token = localStorage.getItem("token") || ""
      const res = await fetch(`${API_BASE}/ai/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: content, history, mode }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          const raw = line.slice(5).trim()
          if (!raw) continue
          try {
            const data = JSON.parse(raw)
            if (data.thinking_delta) {
              fullThinking += data.thinking_delta
              setThinking(true)
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: "assistant", content: fullText, thinking: fullThinking, thinkingDone: false }
                return next
              })
            }
            if (data.thinking_end) {
              setMessages((prev) => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last?.role === "assistant") next[next.length - 1] = { ...last, thinkingDone: true }
                return next
              })
            }
            if (data.delta) {
              fullText += data.delta
              setThinking(false)
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: "assistant", content: fullText, thinking: fullThinking || undefined, thinkingDone: Boolean(fullThinking) }
                return next
              })
            }
            if (data.error) {
              fullText = data.error
              setThinking(false)
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: "assistant", content: `出错了：${fullText}` }
                return next
              })
            }
          } catch {
            // ignore invalid chunks
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        if (fullText) await apiPost("/ai/chat/save-interrupted", { message: content, reply: fullText }).catch(() => {})
      } else {
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: "assistant", content: "网络连接失败，请稍后重试。" }
          return next
        })
      }
    } finally {
      setLoading(false)
      setThinking(false)
      abortRef.current = null
      textareaRef.current?.focus()
    }
  }

  const resetChat = async () => {
    if (abortRef.current) abortRef.current.abort()
    await apiPost("/ai/chat/reset").catch(() => {})
    setMessages([
      {
        role: "assistant",
        content: "你好呀，我可以分析饮食、帮你补蛋白、给你减脂建议，也可以直接看你的历史数据来回答。",
      },
    ])
    setResetOpen(false)
    setLoading(false)
    setThinking(false)
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "40px"
    el.style.height = `${Math.min(el.scrollHeight, 92)}px`
  }, [input])

  return (
    <MobileLayout activeTab="ai-chat" title="AI">
      <div className="flex h-full min-h-0 flex-col gap-2">
        <AppHeader
          title="AI 助手"
          right={
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className={cn("px-3 py-2 text-[12px] font-medium", ghostButtonClass)}
            >
              重置
            </button>
          }
        />

        <SectionCard className="p-2">
          <div className="flex items-center gap-2">
            <div className="flex rounded-2xl bg-slate-100 p-1">
              {[
                { key: "fast", label: "快速" },
                { key: "expert", label: "专家" },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMode(item.key as "fast" | "expert")}
                  className="relative rounded-xl px-3 py-1.5 text-[12px] font-medium text-slate-500"
                >
                  {mode === item.key ? <motion.span layoutId="ai-mode-pill" className="absolute inset-0 rounded-xl bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(124,58,237,0.12),rgba(255,255,255,0.95))] shadow-sm" /> : null}
                  <span className={cn("relative z-10", mode === item.key ? "text-violet-700" : "text-slate-500")}>{item.label}</span>
                </button>
              ))}
            </div>
            <div className="text-[11px] text-slate-400">{mode === "expert" ? "深度思考" : "快速回复"}</div>
          </div>
        </SectionCard>

        {messages.length <= 1 ? (
          <SectionCard className="p-2">
            <div className="flex flex-wrap gap-1.5">
              {quickQuestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => submit(item)}
                  className="rounded-full border border-emerald-200/60 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(124,58,237,0.08))] px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 active:scale-95"
                >
                  {item}
                </button>
              ))}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard className="min-h-0 flex-1 p-2">
          <div ref={listRef} className="h-full overflow-y-auto pr-1">
            <div className="space-y-2">
              {messages.map((message, index) => {
                const isUser = message.role === "user"
                const isLast = index === messages.length - 1
                return (
                  <div key={index} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[84%] rounded-[22px] px-3 py-2 text-[12px] leading-6 shadow-sm",
                        isUser
                          ? "rounded-br-md bg-[linear-gradient(135deg,#10b981_0%,#667eea_55%,#7c3aed_100%)] text-white"
                          : mode === "expert"
                          ? "rounded-bl-md bg-[linear-gradient(160deg,#111827,#312e81)] text-white"
                          : "rounded-bl-md border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.88),rgba(244,240,255,0.72))] text-slate-700"
                      )}
                    >
                      {!isUser && thinking && isLast && !message.content ? (
                        <div className="mb-2 flex items-center gap-2 text-[11px]">
                          <span className={cn("relative flex h-2 w-2 rounded-full", mode === "expert" ? "bg-emerald-300" : "bg-emerald-500")}>
                            <span className={cn("absolute inset-0 animate-ping rounded-full", mode === "expert" ? "bg-emerald-200/60" : "bg-emerald-500/40")} />
                          </span>
                          正在查找数据
                          <span className="inline-flex items-end gap-[2px]">
                            {[0, 120, 240, 360].map((delay, idx) => (
                              <span
                                key={delay}
                                className={cn("w-[2px] rounded-full animate-[mobilebar_1.1s_ease-in-out_infinite]", mode === "expert" ? "bg-white" : "bg-emerald-500")}
                                style={{ height: `${40 + idx * 12}%`, animationDelay: `${delay}ms` }}
                              />
                            ))}
                          </span>
                        </div>
                      ) : null}
                      {!isUser && message.thinking ? (
                        <div className={cn("mb-2 rounded-2xl px-2 py-1.5 text-[11px]", mode === "expert" ? "bg-white/8 text-white/78" : "bg-slate-100 text-slate-500")}>
                          <div className="mb-1 flex items-center gap-1">
                            <Brain className="h-3.5 w-3.5" />
                            思考过程
                          </div>
                          <div className="max-h-20 overflow-y-auto whitespace-pre-wrap pr-1">{message.thinking}</div>
                        </div>
                      ) : null}
                      {isUser ? (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      ) : (
                        <div className={cn("prose prose-sm max-w-none text-[12px]", mode === "expert" ? "prose-invert" : "")}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </SectionCard>

        <SectionCard className="p-2">
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-3xl border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.86),rgba(244,240,255,0.72))] px-3 py-2 shadow-sm backdrop-blur">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    submit()
                  }
                }}
                placeholder="输入你的饮食问题..."
                className="min-h-[40px] w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-slate-400"
              />
            </div>
            <button
              type="button"
              onClick={() => submit()}
              disabled={!input.trim() || loading}
              className={cn("flex h-11 w-11 items-center justify-center shadow-sm disabled:opacity-40", primaryButtonClass)}
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            </button>
          </div>
        </SectionCard>
      </div>

      <BottomSheet open={resetOpen} title="重置对话" onClose={() => setResetOpen(false)}>
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-50 px-3 py-3 text-[12px] text-slate-600">
            将清空当前 AI 对话历史，保留登录状态。
          </div>
          <button
            type="button"
            onClick={resetChat}
            className={cn("flex w-full items-center justify-center gap-2 py-3 text-[13px] font-semibold", dangerSoftButtonClass)}
          >
            <RotateCcw className="h-4 w-4" />
            确认重置
          </button>
        </div>
      </BottomSheet>
    </MobileLayout>
  )
}

function MobileFoodsPage() {
  const [query, setQuery] = useState("")
  const [foods, setFoods] = useState<Food[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)

  const loadFoods = async (searchText?: string) => {
    setLoading(true)
    if (searchText?.trim()) {
      const res = await apiGet<FoodSearchResult>(`/foods/search?query=${encodeURIComponent(searchText.trim())}&limit=40`)
      setFoods(res.data?.items ?? [])
      setLoading(false)
      return
    }
    const res = await apiGet<PaginatedFoods>("/foods?page=1&page_size=40")
    setFoods(res.data?.items ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadFoods()
  }, [])

  const filteredFoods = useMemo(() => {
    const q = query.trim().toLowerCase()
    return foods.filter((food) => {
      const bySearch = !q || `${food.name} ${food.name_en}`.toLowerCase().includes(q)
      const byCategory = selectedCategory === "all" || categoryKey(food) === selectedCategory
      return bySearch && byCategory
    })
  }, [foods, query, selectedCategory])

  const fetchFoodDetail = async (food: Food) => {
    const res = await apiGet<Food>(`/foods?id=${food.id}`)
    setSelectedFood(res.data ?? food)
  }

  return (
    <MobileLayout activeTab="foods" title="食物库">
      <div className="flex h-full min-h-0 flex-col gap-2">
        <AppHeader title="食物库" />

        <SectionCard className="space-y-2">
          <div className="flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-[22px] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(243,244,255,0.76))] px-3 py-2 shadow-sm backdrop-blur">
              <Search className="h-4 w-4 text-violet-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索食物"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
              />
            </div>
            <button
              type="button"
              onClick={() => loadFoods(query)}
              className={cn("px-3 py-2 text-[12px] font-semibold", successSoftButtonClass)}
            >
              搜索
            </button>
            <button
              type="button"
              onClick={() => {
                setQuery("")
                setSelectedCategory("all")
                loadFoods()
              }}
              className={cn("px-3 py-2 text-[12px] font-semibold", ghostButtonClass)}
            >
              全部
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {categoryStyles.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedCategory(item.key)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium active:scale-95",
                  selectedCategory === item.key
                    ? `bg-gradient-to-r ${item.className} text-white`
                    : "border border-white/60 bg-white/60 text-slate-600 backdrop-blur"
                )}
              >
                {item.emoji} {item.label}
              </button>
            ))}
          </div>
        </SectionCard>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <SectionCard className="flex items-center justify-center py-8 text-slate-400">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </SectionCard>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredFoods.map((food) => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => fetchFoodDetail(food)}
                  className="text-left"
                >
                  <SectionCard className="h-full p-2 active:scale-[0.99]">
                    <div className="truncate text-[13px] font-semibold text-slate-900">{food.name}</div>
                    <div className="truncate text-[10px] text-slate-400">{food.name_en || "No English"}</div>
                    <div className="mt-2 inline-flex rounded-full border border-emerald-200/60 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(124,58,237,0.08))] px-2 py-1 text-[10px] font-medium text-emerald-700">
                      {categoryLabel(food)}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <TinyStat label="能量" value={food.energy_kcal} unit="kcal" color="#f97316" />
                      <TinyStat label="蛋白" value={food.protein_g} unit="g" color="#ec4899" />
                      <TinyStat label="脂肪" value={food.fat_g} unit="g" color="#f59e0b" />
                      <TinyStat label="碳水" value={food.carbohydrate_g} unit="g" color="#22c55e" />
                    </div>
                  </SectionCard>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomSheet open={Boolean(selectedFood)} title={selectedFood?.name || "食物详情"} onClose={() => setSelectedFood(null)}>
        {selectedFood ? (
          <div className="space-y-3">
            <SectionCard className="bg-slate-50">
              <div className="text-base font-semibold text-slate-900">{selectedFood.name}</div>
              <div className="mt-1 text-[11px] text-slate-400">{selectedFood.name_en || "No English Name"}</div>
              <div className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-600">
                可食部 {selectedFood.edible_ratio}%
              </div>
            </SectionCard>
            <SectionCard>
              <div className="mb-2 text-[12px] font-semibold text-slate-900">核心营养</div>
              <div className="grid grid-cols-2 gap-2">
                <TinyStat label="能量" value={selectedFood.energy_kcal} unit="kcal" color="#f97316" />
                <TinyStat label="蛋白" value={selectedFood.protein_g} unit="g" color="#ec4899" />
                <TinyStat label="脂肪" value={selectedFood.fat_g} unit="g" color="#f59e0b" />
                <TinyStat label="碳水" value={selectedFood.carbohydrate_g} unit="g" color="#22c55e" />
              </div>
            </SectionCard>
            <SectionCard>
              <div className="mb-2 text-[12px] font-semibold text-slate-900">微量元素</div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  { label: "钠", value: selectedFood.sodium_mg, unit: "mg" },
                  { label: "胆固醇", value: selectedFood.cholesterol_mg, unit: "mg" },
                  { label: "维生素C", value: selectedFood.vitamin_c_mg, unit: "mg" },
                  { label: "钙", value: selectedFood.calcium_mg, unit: "mg" },
                  { label: "铁", value: selectedFood.iron_mg, unit: "mg" },
                  { label: "钾", value: selectedFood.potassium_mg, unit: "mg" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl bg-slate-50 p-2">
                    <div className="text-[10px] text-slate-500">{item.label}</div>
                    <div className="mt-1 font-medium text-slate-800">{formatMetric(item.value)} {item.unit}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        ) : null}
      </BottomSheet>
    </MobileLayout>
  )
}

function MobileRoutes() {
  const hasToken = getHasToken()
  return (
    <Routes>
      <Route path="/" element={hasToken ? <Navigate to="/profile" replace /> : <MobileAuthPage />} />
      <Route path="/profile" element={hasToken ? <MobileProfilePage /> : <MobileAuthPage />} />
      <Route path="/records" element={hasToken ? <MobileRecordsPage /> : <MobileAuthPage />} />
      <Route path="/reports" element={hasToken ? <MobileReportsPage /> : <MobileAuthPage />} />
      <Route path="/ai-chat" element={hasToken ? <MobileAIPage /> : <MobileAuthPage />} />
      <Route path="/foods" element={hasToken ? <MobileFoodsPage /> : <MobileAuthPage />} />
      <Route path="*" element={<Navigate to={hasToken ? "/profile" : "/"} replace />} />
    </Routes>
  )
}

export function AdaptiveRoutes({ desktop }: { desktop: ReactNode }) {
  const isMobileApp = useIsMobileApp()
  if (isMobileApp) {
    return (
      <>
        <style>{`
          @keyframes mobilebar {
            0%, 100% { transform: scaleY(.45); opacity: .65; }
            50% { transform: scaleY(1); opacity: 1; }
          }
        `}</style>
        <MobileRoutes />
      </>
    )
  }
  return <>{desktop}</>
}
