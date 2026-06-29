import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  Pencil, LogOut, X, LoaderCircle, Save, Flame, Beef, Droplets, Wheat,
  CalendarDays, Utensils, ChefHat, Heart, Activity, Award, User as UserIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { apiGet, apiPut, type UserProfile, type CompanionStats, type DashboardStats } from "@/lib/api"
import { notifyUserUpdated } from "@/components/app-shell"

const goalLabels: Record<string, string> = {
  lose_weight: "减脂", gain_weight: "增重", maintain: "保持体重",
  muscle_gain: "增肌", health_maintenance: "健康维护",
}
const goalKeyFromLabel: Record<string, string> = Object.fromEntries(Object.entries(goalLabels).map(([k, v]) => [v, k]))
const genderEnToCn: Record<string, string> = { male: "男", female: "女" }
const genderCnToEn: Record<string, string> = { 男: "male", 女: "female" }

function getStoredUser(): { nickname?: string; phone?: string } {
  try { return JSON.parse(localStorage.getItem("user") || "{}") } catch { return {} }
}

function metric(v?: number | null) { return v == null ? "-" : v.toFixed(1) }

export default function MobileProfilePage() {
  const sessionUser = getStoredUser()
  const [nickname, setNickname] = useState(sessionUser.nickname || "")
  const [phone, setPhone] = useState(sessionUser.phone || "")
  const [gender, setGender] = useState("")
  const [age, setAge] = useState("")
  const [heightCm, setHeightCm] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [healthGoal, setHealthGoal] = useState("")
  const [allergies, setAllergies] = useState("")

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [companion, setCompanion] = useState<CompanionStats | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiGet<UserProfile>("/user/profile").then((d) => {
      if (cancelled || !d.data) return
      const p = d.data
      setNickname(p.nickname || sessionUser.nickname || "")
      setPhone(p.phone || sessionUser.phone || "")
      setGender(p.gender ? (genderEnToCn[p.gender] || p.gender) : "")
      setAge(p.age != null ? String(p.age) : "")
      setHeightCm(p.height_cm != null ? String(p.height_cm) : "")
      setWeightKg(p.weight_kg != null ? String(p.weight_kg) : "")
      setHealthGoal(p.health_goal ? (goalLabels[p.health_goal] || p.health_goal) : "")
      setAllergies(p.allergies?.join(", ") || "")
    }).catch(() => {})
    apiGet<CompanionStats>("/dashboard/companion").then((d) => { if (!cancelled && d.code === 0 && d.data) setCompanion(d.data) }).catch(() => {})
    apiGet<DashboardStats>("/dashboard/stats?days=7").then((d) => { if (!cancelled && d.code === 0 && d.data) setStats(d.data) }).catch(() => {})
    return () => { cancelled = true }
  }, [sessionUser.nickname, sessionUser.phone])

  const avatarLetter = useMemo(() => (nickname || phone || "U").trim().charAt(0).toUpperCase(), [nickname, phone])
  const bmi = useMemo(() => {
    const h = Number(heightCm), w = Number(weightKg)
    if (!h || !w || h < 50 || w < 10) return null
    return (w / Math.pow(h / 100, 2)).toFixed(1)
  }, [heightCm, weightKg])

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    window.dispatchEvent(new Event("smart-scale-auth-change"))
  }

  const save = async () => {
    setSaving(true)
    try {
      await apiPut("/user/profile", {
        nickname: nickname.trim() || undefined,
        gender: genderCnToEn[gender] || gender || undefined,
        age: age ? Number(age) : undefined,
        height_cm: heightCm ? Number(heightCm) : undefined,
        weight_kg: weightKg ? Number(weightKg) : undefined,
        health_goal: goalKeyFromLabel[healthGoal] || healthGoal || undefined,
        allergies: allergies.split(",").map((i) => i.trim()).filter(Boolean),
      })
      notifyUserUpdated({ nickname: nickname.trim(), phone })
      setEditing(false)
    } finally { setSaving(false) }
  }

  const statCards = [
    { label: "日均热量", icon: Flame, color: "#FF5722", value: stats?.avg_daily_energy_kcal, unit: "kcal", dec: 0 },
    { label: "蛋白质", icon: Beef, color: "#E91E63", value: stats?.total_protein_g, unit: "g", dec: 1 },
    { label: "脂肪", icon: Droplets, color: "#FF9800", value: stats?.total_fat_g, unit: "g", dec: 1 },
    { label: "碳水", icon: Wheat, color: "#4CAF50", value: stats?.total_carbohydrate_g, unit: "g", dec: 1 },
  ]
  const dist = stats?.nutrient_distribution
  const nutrients = [
    { label: "蛋白质", pct: dist?.protein_pct ?? 0, color: "#E91E63" },
    { label: "脂肪", pct: dist?.fat_pct ?? 0, color: "#FF9800" },
    { label: "碳水", pct: dist?.carb_pct ?? 0, color: "#4CAF50" },
  ]
  const infoItems = [
    { label: "性别", value: gender || "未设置", icon: UserIcon, color: "#60a5fa" },
    { label: "年龄", value: age ? `${age}岁` : "未设置", icon: Heart, color: "#f472b6" },
    { label: "身高", value: heightCm ? `${heightCm}cm` : "未设置", icon: Activity, color: "#34d399" },
    { label: "体重", value: weightKg ? `${weightKg}kg` : "未设置", icon: Activity, color: "#a78bfa" },
    { label: "BMI", value: bmi ?? "未设置", icon: Activity, color: "#fb923c" },
    { label: "目标", value: healthGoal || "未设置", icon: Award, color: "#fbbf24" },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 顶部用户卡（绿色渐变） */}
      <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-green-500 via-emerald-500 to-lime-500 px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-white">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-white/40 bg-white/20 text-2xl font-bold backdrop-blur-md">
            {avatarLetter}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{nickname || "未设置昵称"}</h2>
            <p className="truncate text-xs text-white/80">{phone || "未绑定手机"}</p>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/85">
              <CalendarDays className="h-3 w-3" />
              {companion ? `已陪伴 ${companion.total_days} 天 · ${companion.total_meals} 餐` : "加载中…"}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur-md active:scale-95"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 可滚动内容区 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {/* 本周概览 - 4 统计卡 */}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-700">本周营养概览</h3>
          <span className="text-[11px] text-gray-400">近7天</span>
        </div>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {statCards.map((c) => {
            const Icon = c.icon
            return (
              <div key={c.label} className="rounded-2xl border border-green-100/70 bg-white/80 p-2.5 text-center backdrop-blur-sm">
                <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${c.color}18`, color: c.color }}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="text-sm font-bold text-gray-800">
                  {c.value != null && c.value > 0 ? metric(c.value) : "--"}
                </div>
                <div className="text-[10px] text-gray-400">{c.label}</div>
              </div>
            )
          })}
        </div>

        {/* 营养素分布 - 紧凑横条 */}
        <div className="mb-4 rounded-2xl border border-green-100/70 bg-white/80 p-3.5 backdrop-blur-sm">
          <h4 className="mb-2.5 text-xs font-bold text-gray-600">营养素分布</h4>
          <div className="space-y-2">
            {nutrients.map((n) => (
              <div key={n.label} className="flex items-center gap-2">
                <span className="w-10 text-[11px] text-gray-500">{n.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <motion.div className="h-full rounded-full" style={{ background: n.color }} initial={{ width: 0 }} animate={{ width: `${n.pct}%` }} transition={{ duration: 0.6 }} />
                </div>
                <span className="w-8 text-right text-[11px] font-semibold text-gray-700">{n.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* 陪伴记录 - 2x2 */}
        {companion && (
          <div className="mb-4 grid grid-cols-2 gap-2">
            {[
              { icon: CalendarDays, label: "记录天数", value: companion.total_days, suffix: "天" },
              { icon: Utensils, label: "记录餐数", value: companion.total_meals, suffix: "顿" },
              { icon: ChefHat, label: "最爱烹饪", value: companion.favorite_method_label || "暂无", suffix: "" },
              { icon: Activity, label: "食材种类", value: companion.ingredient_variety, suffix: "种" },
            ].map((c) => {
              const Icon = c.icon
              return (
                <div key={c.label} className="rounded-2xl border border-green-100/70 bg-white/80 p-3 backdrop-blur-sm">
                  <div className="mb-1 flex items-center gap-1 text-[11px] text-gray-400">
                    <Icon className="h-3 w-3" /> {c.label}
                  </div>
                  <div className="text-base font-bold text-gray-800">
                    {c.value}<span className="ml-0.5 text-xs font-normal text-gray-400">{c.suffix}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 个人信息列表 */}
        <div className="mb-4 overflow-hidden rounded-2xl border border-green-100/70 bg-white/80 backdrop-blur-sm">
          {infoItems.map((it, i) => {
            const Icon = it.icon
            return (
              <div key={it.label} className={cn("flex items-center gap-3 px-3.5 py-2.5", i > 0 && "border-t border-gray-100")}>
                <Icon className="h-4 w-4" style={{ color: it.color }} />
                <span className="text-[13px] text-gray-500">{it.label}</span>
                <span className="ml-auto text-[13px] font-medium text-gray-800">{it.value}</span>
              </div>
            )
          })}
        </div>

        {/* 登出 */}
        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white/80 py-3 text-sm font-medium text-red-500 active:scale-[0.98]"
        >
          <LogOut className="h-4 w-4" /> 退出登录
        </button>
      </div>

      {/* 编辑弹层 */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(false)} />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative z-10 max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800">编辑信息</h3>
              <button onClick={() => setEditing(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "昵称", val: nickname, set: setNickname, ph: "昵称" },
                { label: "手机号", val: phone, set: () => {}, ph: "手机号", ro: true },
                { label: "性别", val: gender, set: setGender, ph: "男 / 女" },
                { label: "年龄", val: age, set: setAge, ph: "年龄", num: true },
                { label: "身高(cm)", val: heightCm, set: setHeightCm, ph: "身高", num: true },
                { label: "体重(kg)", val: weightKg, set: setWeightKg, ph: "体重", num: true },
                { label: "健康目标", val: healthGoal, set: setHealthGoal, ph: "如:减脂" },
                { label: "过敏食物", val: allergies, set: setAllergies, ph: "逗号分隔" },
              ].map((f) => (
                <div key={f.label}>
                  <label className="mb-1 block text-[11px] font-medium text-green-700/80">{f.label}</label>
                  <input
                    value={f.val}
                    readOnly={f.ro}
                    placeholder={f.ph}
                    type={f.num ? "number" : "text"}
                    onChange={(e) => f.set(e.target.value)}
                    className={cn(
                      "h-10 w-full rounded-xl border px-3 text-sm outline-none",
                      f.ro ? "border-gray-100 bg-gray-50 text-gray-400" : "border-green-200 focus:border-green-400 focus:ring-2 focus:ring-green-400/20"
                    )}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-sm font-semibold text-white shadow-lg shadow-green-500/25 active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 保存
            </button>
          </motion.div>
        </div>
      )}
    </div>
  )
}
