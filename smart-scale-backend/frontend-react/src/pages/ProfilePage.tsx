import { useEffect, useMemo, useState, type ChangeEvent } from "react"
import AppShell, { notifyUserUpdated } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AnimatedDropdown, type DropdownOption } from "@/components/animated-dropdown"
import { apiGet, apiPut, type UserProfile } from "@/lib/api"
import { LoaderCircle, Save, User, Camera, Sparkles, Ruler, Weight, Target, HeartPulse, Calendar } from "lucide-react"

const genderOptions: DropdownOption[] = [
  { value: "", label: "未设置" },
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: "other", label: "其他" },
]

const healthGoalOptions: DropdownOption[] = [
  { value: "", label: "未设置" },
  { value: "lose_weight", label: "减脂" },
  { value: "gain_weight", label: "增重" },
  { value: "maintain", label: "保持体重" },
  { value: "muscle_gain", label: "增肌" },
  { value: "health_maintenance", label: "健康维护" },
]

const goalLabels: Record<string, string> = {
  lose_weight: "减脂", gain_weight: "增重", maintain: "保持体重",
  muscle_gain: "增肌", health_maintenance: "健康维护",
}
const genderLabels: Record<string, string> = { male: "男", female: "女", other: "其他" }

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}") as { nickname?: string; phone?: string }
  } catch { return {} }
}

function getStoredAvatar() {
  return localStorage.getItem("user_avatar") || ""
}

export default function ProfilePage() {
  const sessionUser = getStoredUser()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [nickname, setNickname] = useState(sessionUser.nickname || "")
  const [phone, setPhone] = useState(sessionUser.phone || "")
  const [gender, setGender] = useState("")
  const [age, setAge] = useState("")
  const [heightCm, setHeightCm] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [healthGoal, setHealthGoal] = useState("")
  const [allergies, setAllergies] = useState("")
  const [avatarPreview, setAvatarPreview] = useState(getStoredAvatar())
  const [feedback, setFeedback] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      const profileRes = await apiGet<UserProfile>("/user/profile")
      if (cancelled) return
      const nextProfile = profileRes.data ?? null
      setProfile(nextProfile)
      if (nextProfile) {
        setNickname(nextProfile.nickname || sessionUser.nickname || "")
        setPhone(nextProfile.phone || sessionUser.phone || "")
        setGender(nextProfile.gender || "")
        setAge(nextProfile.age != null ? String(nextProfile.age) : "")
        setHeightCm(nextProfile.height_cm != null ? String(nextProfile.height_cm) : "")
        setWeightKg(nextProfile.weight_kg != null ? String(nextProfile.weight_kg) : "")
        setHealthGoal(nextProfile.health_goal || "")
        setAllergies(nextProfile.allergies?.join(", ") || "")
      }
    }
    loadAll().catch(() => undefined)
    return () => { cancelled = true }
  }, [sessionUser.nickname, sessionUser.phone])

  const avatarLetter = useMemo(() => (nickname || phone || "U").trim().charAt(0).toUpperCase(), [nickname, phone])

  const bmi = useMemo(() => {
    const h = Number(heightCm), w = Number(weightKg)
    if (!h || !w || h < 50 || w < 10) return null
    return (w / Math.pow(h / 100, 2)).toFixed(1)
  }, [heightCm, weightKg])

  const registerDays = useMemo(() => {
    if (!profile?.created_at) return null
    return Math.max(1, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000))
  }, [profile?.created_at])

  async function saveAll() {
    setSaving(true); setFeedback("")
    try {
      await apiPut("/user/profile", {
        nickname: nickname.trim() || undefined,
        gender: gender || undefined, age: age ? Number(age) : undefined,
        height_cm: heightCm ? Number(heightCm) : undefined, weight_kg: weightKg ? Number(weightKg) : undefined,
        health_goal: healthGoal || undefined,
        allergies: allergies.split(",").map(i => i.trim()).filter(Boolean),
      })
      notifyUserUpdated({ nickname: nickname.trim(), phone })
      setFeedback("保存成功")
    } finally { setSaving(false) }
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) { setFeedback("请选择图片文件"); return }
    if (file.size > 5 * 1024 * 1024) { setFeedback("头像图片不能超过 5MB"); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = String(e.target?.result || "")
      localStorage.setItem("user_avatar", result)
      setAvatarPreview(result)
      window.dispatchEvent(new Event("avatar-updated"))
      setFeedback("头像已更新")
    }
    reader.readAsDataURL(file)
    event.target.value = ""
  }

  const summaryItems = [
    { icon: Ruler, label: "身高", value: heightCm ? `${heightCm} cm` : "未设置" },
    { icon: Weight, label: "体重", value: weightKg ? `${weightKg} kg` : "未设置" },
    { icon: HeartPulse, label: "BMI", value: bmi ?? "未设置" },
    { icon: Target, label: "目标", value: goalLabels[healthGoal] || "未设置" },
  ]

  return (
    <AppShell title="个人中心" titleIcon={<User className="w-6 h-6 text-[#667eea]" />}>
      {feedback && (
        <div className="mb-4 rounded-xl bg-gradient-to-r from-[#667eea]/10 to-[#764ba2]/10 border border-[#667eea]/20 px-4 py-3 text-sm text-[#4f46b5] font-medium">
          <Sparkles className="h-4 w-4 inline mr-2" />{feedback}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        {/* ===== 左侧：头像信息卡片 ===== */}
        <div className="space-y-4">
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#667eea] via-[#6c63ff] to-[#764ba2] text-white shadow-[0_12px_36px_rgba(102,126,234,0.25)]">
            <CardContent className="p-6 relative">
              <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-white/8 blur-sm" />
              <div className="flex flex-col items-center gap-3 relative z-10">
                <label className="group relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border-4 border-white/30 bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] font-bold text-white shadow-xl flex-shrink-0 ring-4 ring-white/10">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="头像" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl">{avatarLetter}</span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="h-5 w-5" />
                  </span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                </label>
                <div className="text-center">
                  <h3 className="text-xl font-bold">{nickname || "未设置昵称"}</h3>
                  <p className="text-sm text-white/60 mt-0.5">{phone || "未绑定手机"}</p>
                </div>
                {registerDays && (
                  <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs">
                    <Calendar className="h-3 w-3" /> 已使用 {registerDays} 天
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 信息摘要 */}
          <div className="grid grid-cols-2 gap-3">
            {summaryItems.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="rounded-xl bg-white/85 border border-[#667eea]/10 p-4 shadow-sm">
                  <div className="flex items-center gap-1.5 text-[#667eea] text-xs mb-1.5">
                    <Icon className="h-3.5 w-3.5" /> {item.label}
                  </div>
                  <div className="text-lg font-bold text-gray-800">{item.value}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ===== 右侧：编辑表单 ===== */}
        <Card className="border-0 bg-gradient-to-br from-white to-[#f8f9ff] shadow-[0_8px_30px_rgba(102,126,234,0.08)]">
          <CardContent className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-lg font-semibold text-[#4f46b5]">
                <User className="h-5 w-5 text-[#667eea]" /> 个人信息
              </h4>
              <Button onClick={() => void saveAll()} disabled={saving}
                className="bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:from-[#5b6ee0] hover:to-[#6d42a0] rounded-xl px-5 h-10 shadow-md shadow-[#667eea]/20">
                {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                保存
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-[#667eea]/80">昵称</label>
                <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="设置昵称..."
                  className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-xl h-11" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-[#667eea]/80">手机号</label>
                <Input value={phone} readOnly placeholder="手机号"
                  className="border-[#667eea]/15 bg-gray-50 text-gray-500 rounded-xl h-11" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#667eea]/80">性别</label>
                <AnimatedDropdown options={genderOptions} value={gender} onChange={setGender} theme="purple" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#667eea]/80">年龄</label>
                <Input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="年龄"
                  className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-xl h-11" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#667eea]/80">身高 (cm)</label>
                <Input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="身高"
                  className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-xl h-11" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#667eea]/80">体重 (kg)</label>
                <Input type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="体重"
                  className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-xl h-11" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-[#667eea]/80">健康目标</label>
                <AnimatedDropdown options={healthGoalOptions} value={healthGoal} onChange={setHealthGoal} theme="purple" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-[#667eea]/80">过敏食物（逗号分隔）</label>
                <Input value={allergies} onChange={e => setAllergies(e.target.value)} placeholder="如: 花生,海鲜"
                  className="border-[#667eea]/20 focus:border-[#667eea] focus:ring-[#667eea]/20 rounded-xl h-11" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
