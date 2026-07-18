import { useEffect, useMemo, useState } from "react"
import AppShell, { notifyUserUpdated } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiGet, apiPut, type UserProfile, type CompanionStats } from "@/lib/api"
import { AnimatedNumber } from "@/components/fx"
import { RecentMealsList } from "@/pages/DashboardPage"
import { LoaderCircle, Save, User, Sparkles, X, Pencil, Heart, Activity, Award, Utensils, CalendarDays, Flame, ChefHat, LogOut } from "lucide-react"
import { WaveLoader } from "@/components/wave-loader"
import { useNavigate } from "react-router-dom"

const goalLabels: Record<string, string> = {
  lose_weight: "减脂", gain_weight: "增重", maintain: "保持体重",
  muscle_gain: "增肌", health_maintenance: "健康维护",
}
// 反向映射：中文 → 英文 key（保存时用）
const goalKeyFromLabel: Record<string, string> = Object.fromEntries(
  Object.entries(goalLabels).map(([k, v]) => [v, k])
)
const genderEnToCn: Record<string, string> = { male: "男", female: "女" }
const genderCnToEn: Record<string, string> = { "男": "male", "女": "female" }

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}") as { nickname?: string; phone?: string }
  } catch { return {} }
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const sessionUser = getStoredUser()
  const [nickname, setNickname] = useState(sessionUser.nickname || "")
  const [phone, setPhone] = useState(sessionUser.phone || "")
  const [gender, setGender] = useState("")
  const [age, setAge] = useState("")
  const [heightCm, setHeightCm] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [healthGoal, setHealthGoal] = useState("")
  const [allergies, setAllergies] = useState("")
  const [feedback, setFeedback] = useState("")
  const [saving, setSaving] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [companion, setCompanion] = useState<CompanionStats | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      const profileRes = await apiGet<UserProfile>("/user/profile")
      if (cancelled) return
      const nextProfile = profileRes.data ?? null
      if (nextProfile) {
        setNickname(nextProfile.nickname || sessionUser.nickname || "")
        setPhone(nextProfile.phone || sessionUser.phone || "")
        // 性别/健康目标：英文 key 转中文显示
        setGender(nextProfile.gender ? (genderEnToCn[nextProfile.gender] || nextProfile.gender) : "")
        setAge(nextProfile.age != null ? String(nextProfile.age) : "")
        setHeightCm(nextProfile.height_cm != null ? String(nextProfile.height_cm) : "")
        setWeightKg(nextProfile.weight_kg != null ? String(nextProfile.weight_kg) : "")
        setHealthGoal(nextProfile.health_goal ? (goalLabels[nextProfile.health_goal] || nextProfile.health_goal) : "")
        setAllergies(nextProfile.allergies?.join(", ") || "")
      }
    }
    loadAll().catch(() => undefined)

    // 加载陪伴记录统计
    apiGet<CompanionStats>("/dashboard/companion").then((d) => {
      if (!cancelled && d.code === 0 && d.data) setCompanion(d.data)
    }).catch(() => {})

    return () => { cancelled = true }
  }, [sessionUser.nickname, sessionUser.phone])

  const avatarLetter = useMemo(() => (nickname || phone || "U").trim().charAt(0).toUpperCase(), [nickname, phone])

  const bmi = useMemo(() => {
    const h = Number(heightCm), w = Number(weightKg)
    if (!h || !w || h < 50 || w < 10) return null
    return (w / Math.pow(h / 100, 2)).toFixed(1)
  }, [heightCm, weightKg])

  async function saveAll() {
    setSaving(true); setFeedback("")
    try {
      await apiPut("/user/profile", {
        nickname: nickname.trim() || undefined,
        // 性别/健康目标：中文转英文 key 提交
        gender: genderCnToEn[gender] || gender || undefined,
        age: age ? Number(age) : undefined,
        height_cm: heightCm ? Number(heightCm) : undefined, weight_kg: weightKg ? Number(weightKg) : undefined,
        health_goal: goalKeyFromLabel[healthGoal] || healthGoal || undefined,
        allergies: allergies.split(",").map(i => i.trim()).filter(Boolean),
      })
      notifyUserUpdated({ nickname: nickname.trim(), phone })
      setFeedback("保存成功")
      setShowEditModal(false)
    } finally { setSaving(false) }
  }

  const summaryItems = [
    { label: "性别", value: gender || "未设置", icon: User, color: "#60a5fa" },
    { label: "年龄", value: age ? `${age} 岁` : "未设置", icon: Heart, color: "#f472b6" },
    { label: "目标", value: healthGoal || "未设置", icon: Award, color: "#fbbf24" },
    { label: "身高", value: heightCm ? `${heightCm} cm` : "未设置", icon: Activity, color: "#34d399" },
    { label: "体重", value: weightKg ? `${weightKg} kg` : "未设置", icon: Activity, color: "#a78bfa" },
    { label: "BMI", value: bmi ?? "未设置", icon: Activity, color: "#fb923c" },
  ]

  return (
    <AppShell title="个人中心" titleIcon={<User className="w-6 h-6 text-[#667eea]" />}>
      {feedback && (
        <div className="mb-2 lg:mb-4 rounded-xl bg-gradient-to-r from-[#667eea]/10 to-[#764ba2]/10 border border-[#667eea]/20 px-3 lg:px-4 py-2 lg:py-3 text-xs lg:text-sm text-[#4f46b5] font-medium">
          <Sparkles className="h-3.5 w-3.5 lg:h-4 lg:w-4 inline mr-1.5 lg:mr-2" />{feedback}
        </div>
      )}

      {/* ===== 紫色大框：左1/3用户信息 + 右2/3数据卡片 ===== */}
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#667eea] via-[#6c63ff] to-[#764ba2] text-white shadow-[0_8px_28px_rgba(102,126,234,0.22)] mb-2 lg:mb-5 py-0 gap-0 lg:py-6 lg:gap-6">
        <CardContent className="p-0 relative">
          {/* 装饰光晕 */}
          <div className="absolute -top-12 -right-8 w-28 h-28 rounded-full bg-white/8 blur-sm pointer-events-none" />
          <div className="absolute -bottom-10 -left-6 w-24 h-24 rounded-full bg-white/6 blur-sm pointer-events-none" />
          <div className="absolute top-1/3 right-1/4 w-2 h-2 rounded-full bg-white/30 blur-[1px] pointer-events-none animate-pulse" />

          <div className="flex flex-row relative z-10">
            {/* 左1/3：头像（名字首字）、名字、电话、编辑按钮 */}
            <div className="flex flex-col items-center justify-center gap-1 lg:gap-3 p-2 lg:p-6 w-1/3 sm:w-1/3 border-r border-white/15">
              <div className="flex h-9 w-9 lg:h-20 lg:w-20 items-center justify-center overflow-hidden rounded-full border-2 lg:border-4 border-white/30 bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] font-bold text-white shadow-xl flex-shrink-0 transition-all duration-300 hover:scale-110 hover:border-white/50 hover:shadow-2xl cursor-default">
                <span className="text-base lg:text-3xl transition-transform duration-300">{avatarLetter}</span>
              </div>
              <h3 className="text-[11px] lg:text-lg font-bold text-center transition-all duration-300 hover:scale-105 hover:text-white/90 cursor-default truncate max-w-full">{nickname || "未设置昵称"}</h3>
              <p className="text-[9px] lg:text-sm text-white/65 transition-all duration-300 hover:text-white/85 hover:scale-105 cursor-default truncate max-w-full">{phone || "未绑定手机"}</p>
              <button
                onClick={() => setShowEditModal(true)}
                className="flex items-center gap-0.5 lg:gap-1.5 rounded-full bg-white/15 hover:bg-white/25 px-2 py-0.5 lg:px-4 lg:py-2 text-[9px] lg:text-sm font-medium transition-all duration-300 hover:shadow-lg hover:shadow-white/20 hover:-translate-y-0.5 whitespace-nowrap"
              >
                <Pencil className="h-2.5 w-2.5 lg:h-3.5 lg:w-3.5" /> 信息编辑
              </button>
            </div>

            {/* 右2/3：6格信息（悬停动画+图标） */}
            <div className="w-2/3 sm:w-2/3 p-1.5 lg:p-5">
              <div className="grid grid-cols-3 lg:grid-cols-3 gap-1 lg:gap-3 h-full content-center">
                {summaryItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={item.label}
                      className="group relative rounded-lg lg:rounded-xl bg-white/15 p-1.5 lg:p-3.5 text-center transition-all duration-300 hover:bg-white/25 hover:shadow-lg hover:shadow-black/10 hover:-translate-y-1 cursor-default overflow-hidden"
                    >
                      {/* 悬停时显示的图标光晕 */}
                      <div
                        className="absolute -top-4 -right-4 w-12 h-12 rounded-full opacity-0 group-hover:opacity-20 blur-[2px] transition-opacity duration-300"
                        style={{ background: item.color }}
                      />
                      <div className="relative z-10">
                        <div className="flex items-center justify-center gap-0.5 lg:gap-1 text-[10px] lg:text-xs text-white/65 mb-0.5 lg:mb-1">
                          <Icon className="h-2.5 w-2.5 lg:h-3 lg:w-3 transition-transform duration-300 group-hover:scale-125" style={{ color: item.color }} />
                          {item.label}
                        </div>
                        <div className="text-[11px] lg:text-base font-bold text-white truncate transition-transform duration-300 group-hover:scale-105">{item.value}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== 最近餐食（左） + 智能秤陪伴记录（右） ===== */}
      <div className="grid grid-cols-1 gap-2 lg:gap-5 lg:grid-cols-2">
        {/* 左：最近餐食 */}
        <RecentMealsList days={30} limit={4} />

        {/* 右：智能秤陪伴记录 */}
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-white via-[#f5f3ff] to-[#ede9fe] shadow-[0_8px_32px_rgba(102,126,234,0.12)] py-2 gap-2 lg:py-6 lg:gap-6">
          {/* 装饰光斑 */}
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-[#667eea]/8 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full bg-[#764ba2]/6 blur-2xl pointer-events-none" />
          <CardContent className="p-2.5 lg:p-5 relative z-10">
            <div className="mb-2 lg:mb-4 flex items-center gap-1.5 lg:gap-2">
              <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-md lg:rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center shadow-md">
                <Sparkles className="h-3 w-3 lg:h-4 lg:w-4 text-white" />
              </div>
              <h4 className="text-[13px] lg:text-base font-bold text-[#4f46b5]">智能秤陪伴记录</h4>
            </div>

            {companion ? (
              <div className="grid grid-cols-2 gap-1.5 lg:gap-3">
                {/* 记录天数 */}
                <div className="group relative rounded-xl lg:rounded-2xl bg-white/70 backdrop-blur-sm border border-[#667eea]/12 p-1.5 lg:p-4 text-center transition-all duration-300 hover:shadow-lg hover:shadow-[#667eea]/10 hover:-translate-y-0.5 overflow-hidden">
                  <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-[#667eea]/8 transition-opacity duration-300 group-hover:opacity-100 opacity-0 blur-[2px]" />
                  <div className="flex items-center justify-center gap-1 text-[#667eea] text-[10px] lg:text-xs mb-0.5 lg:mb-1.5 relative z-10">
                    <CalendarDays className="h-3 w-3 lg:h-3.5 lg:w-3.5" /> 记录天数
                  </div>
                  <div className="text-xl lg:text-3xl font-bold text-[#4f46b5] relative z-10">
                    <AnimatedNumber value={companion.total_days} duration={1.5} />
                    <span className="text-[10px] lg:text-sm font-normal text-gray-400 ml-1">天</span>
                  </div>
                </div>

                {/* 记录餐数 */}
                <div className="group relative rounded-xl lg:rounded-2xl bg-white/70 backdrop-blur-sm border border-[#667eea]/12 p-1.5 lg:p-4 text-center transition-all duration-300 hover:shadow-lg hover:shadow-[#667eea]/10 hover:-translate-y-0.5 overflow-hidden">
                  <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-[#764ba2]/8 transition-opacity duration-300 group-hover:opacity-100 opacity-0 blur-[2px]" />
                  <div className="flex items-center justify-center gap-1 text-[#667eea] text-[10px] lg:text-xs mb-0.5 lg:mb-1.5 relative z-10">
                    <Utensils className="h-3 w-3 lg:h-3.5 lg:w-3.5" /> 记录餐数
                  </div>
                  <div className="text-xl lg:text-3xl font-bold text-[#4f46b5] relative z-10">
                    <AnimatedNumber value={companion.total_meals} duration={1.5} />
                    <span className="text-[10px] lg:text-sm font-normal text-gray-400 ml-1">顿</span>
                  </div>
                </div>

                {/* 食材种类 */}
                <div className="group relative rounded-xl lg:rounded-2xl bg-white/70 backdrop-blur-sm border border-[#667eea]/12 p-1.5 lg:p-4 text-center transition-all duration-300 hover:shadow-lg hover:shadow-[#667eea]/10 hover:-translate-y-0.5 overflow-hidden">
                  <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-[#f59e0b]/8 transition-opacity duration-300 group-hover:opacity-100 opacity-0 blur-[2px]" />
                  <div className="flex items-center justify-center gap-1 text-[#667eea] text-[10px] lg:text-xs mb-0.5 lg:mb-1.5 relative z-10">
                    <Flame className="h-3 w-3 lg:h-3.5 lg:w-3.5" /> 食材种类
                  </div>
                  <div className="text-xl lg:text-3xl font-bold text-[#4f46b5] relative z-10">
                    <AnimatedNumber value={companion.ingredient_variety} duration={1.5} />
                    <span className="text-[10px] lg:text-sm font-normal text-gray-400 ml-1">种</span>
                  </div>
                </div>

                {/* 最爱烹饪方式 */}
                <div className="group relative rounded-xl lg:rounded-2xl bg-white/70 backdrop-blur-sm border border-[#667eea]/12 p-1.5 lg:p-4 text-center transition-all duration-300 hover:shadow-lg hover:shadow-[#667eea]/10 hover:-translate-y-0.5 overflow-hidden">
                  <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-[#10b981]/8 transition-opacity duration-300 group-hover:opacity-100 opacity-0 blur-[2px]" />
                  <div className="flex items-center justify-center gap-1 text-[#667eea] text-[10px] lg:text-xs mb-0.5 lg:mb-1.5 relative z-10">
                    <ChefHat className="h-3 w-3 lg:h-3.5 lg:w-3.5" /> 最爱烹饪
                  </div>
                  <div className="text-base lg:text-2xl font-bold text-[#4f46b5] relative z-10">
                    {companion.favorite_method_label || "暂无"}
                  </div>
                  {companion.favorite_method_count > 0 && (
                    <div className="text-[10px] lg:text-xs text-gray-400 mt-0.5 relative z-10">{companion.favorite_method_count} 次</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-4 lg:py-6 flex justify-center"><WaveLoader bars={4} message="加载中..." /></div>
            )}

            {companion?.first_record_date && (
              <div className="mt-2 lg:mt-4 text-center text-[10px] lg:text-xs text-gray-400 relative z-10">
                自 {companion.first_record_date} 开始记录 · 感谢你的坚持
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== 退出登录按钮（手机端可见） ===== */}
      <div className="mt-3 lg:mt-5 flex justify-center lg:hidden">
        <button
          onClick={() => {
            localStorage.removeItem("token")
            localStorage.removeItem("user")
            navigate("/")
          }}
          className="flex items-center gap-1.5 rounded-xl bg-red-50 hover:bg-red-100 px-5 py-2.5 text-sm font-medium text-red-600 transition-all duration-300 border border-red-200"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </div>

      {/* ===== 编辑信息弹窗 ===== */}
      {showEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowEditModal(false)} />
          <Card className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto border-0 bg-gradient-to-br from-white to-[#f8f9ff] shadow-2xl rounded-3xl py-0 gap-0 lg:py-6 lg:gap-6">
            <CardContent className="p-2.5 lg:p-5">
              <div className="mb-3 lg:mb-4 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 lg:gap-2 text-sm lg:text-base font-semibold text-[#4f46b5]">
                  <User className="h-4 w-4 lg:h-4.5 lg:w-4.5 text-[#667eea]" /> 编辑信息
                </h4>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                </button>
              </div>

              {/* 统一输入框排版：从上到下、从左到右
                  昵称 | 手机号
                  性别 | 年龄
                  身高 | 体重
                  健康目标 | 过敏食物
                  最后一行：居中保存按钮 */}
              <div className="grid grid-cols-2 lg:grid-cols-2 gap-2 lg:gap-3.5">
                <div>
                  <label className="mb-0.5 block text-[10px] lg:text-sm font-medium text-[#667eea]/80">昵称</label>
                  <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="设置昵称..."
                    className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-lg lg:rounded-xl h-8 lg:h-10 text-xs lg:text-sm" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] lg:text-sm font-medium text-[#667eea]/80">手机号</label>
                  <Input value={phone} readOnly placeholder="手机号"
                    className="border-[#667eea]/15 bg-gray-50 text-gray-500 rounded-lg lg:rounded-xl h-8 lg:h-10 text-xs lg:text-sm" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] lg:text-sm font-medium text-[#667eea]/80">性别</label>
                  <Input value={gender} onChange={e => setGender(e.target.value)} placeholder="男 / 女"
                    className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-lg lg:rounded-xl h-8 lg:h-10 text-xs lg:text-sm" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] lg:text-sm font-medium text-[#667eea]/80">年龄</label>
                  <Input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="年龄"
                    className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-lg lg:rounded-xl h-8 lg:h-10 text-xs lg:text-sm" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] lg:text-sm font-medium text-[#667eea]/80">身高 (cm)</label>
                  <Input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="身高"
                    className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-lg lg:rounded-xl h-8 lg:h-10 text-xs lg:text-sm" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] lg:text-sm font-medium text-[#667eea]/80">体重 (kg)</label>
                  <Input type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="体重"
                    className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-lg lg:rounded-xl h-8 lg:h-10 text-xs lg:text-sm" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] lg:text-sm font-medium text-[#667eea]/80">健康目标</label>
                  <Input value={healthGoal} onChange={e => setHealthGoal(e.target.value)} placeholder="如: 减脂"
                    className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-lg lg:rounded-xl h-8 lg:h-10 text-xs lg:text-sm" />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] lg:text-sm font-medium text-[#667eea]/80">过敏食物</label>
                  <Input value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="逗号分隔"
                    className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-lg lg:rounded-xl h-8 lg:h-10 text-xs lg:text-sm" />
                </div>
              </div>

              {/* 居中保存按钮 */}
              <div className="mt-3 lg:mt-5 flex justify-center">
                <Button onClick={() => void saveAll()} disabled={saving}
                  className="bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:from-[#5b6ee0] hover:to-[#6d42a0] rounded-xl px-5 h-9 lg:h-10 shadow-md shadow-[#667eea]/20 w-full text-sm lg:text-base">
                  {saving ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                  保存
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  )
}
