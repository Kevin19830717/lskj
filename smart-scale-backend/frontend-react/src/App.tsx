import * as React from "react"
import { useState, useRef, useCallback, useEffect } from "react"
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import {
  Leaf,
  Apple,
  Activity,
  Target,
  TrendingUp,
  Calendar,
  MessageSquare,
  Camera,
  ChevronRight,
  Sparkles,
  Heart,
  ArrowUpIcon,
  CheckCircle2,
  Upload,
  BarChart3,
  BookOpen,
  Scale,
  PhoneIcon,
  LockIcon,
  UserIcon,
  EyeIcon,
  EyeOffIcon,
  X,
} from "lucide-react"
import DashboardPage from "@/pages/DashboardPage"
import RecordsPage from "@/pages/RecordsPage"
import ReportsPage from "@/pages/ReportsPage"
import AIChatPage from "@/pages/AIChatPage"
import FoodsPage from "@/pages/FoodsPage"
import ProfilePage from "@/pages/ProfilePage"
import { AdaptiveRoutes } from "@/mobile/MobileApp"

// ============================================================
// API
// ============================================================
const API_BASE = "/api/v1"

interface ApiResponse<T = unknown> {
  code: number
  message: string
  data?: T
}

interface AuthData {
  token: string
  user: {
    id: number
    phone: string
    nickname: string
    avatar_url?: string
    created_at: string
  }
}

async function apiLogin(phone: string, password: string): Promise<ApiResponse<AuthData>> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  })
  return res.json()
}

async function apiRegister(
  phone: string,
  password: string,
  nickname: string
): Promise<ApiResponse<AuthData>> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password, nickname }),
  })
  return res.json()
}

// ============================================================
// 子组件
// ============================================================
type MessageType = "error" | "success" | ""

function MessageAlert({ type, message }: { type: MessageType; message: string }) {
  if (!type || !message) return null
  const isError = type === "error"
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`px-4 py-3 rounded-lg text-sm font-medium ${
        isError
          ? "bg-red-50 text-red-700 border border-red-200"
          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
      }`}
    >
      {message}
    </motion.div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  let strength = 0
  let label = ""
  let color = ""
  if (password.length >= 6) strength++
  if (password.length >= 8) strength++
  if (/[A-Z]/.test(password) && /[0-9]/.test(password)) strength++
  if (/[!@#$%^&*]/.test(password)) strength++

  switch (strength) {
    case 0:
    case 1:
      label = "较弱"; color = "text-red-500"; break
    case 2:
      label = "一般"; color = "text-amber-500"; break
    case 3:
      label = "良好"; color = "text-lime-600"; break
    case 4:
      label = "很强"; color = "text-emerald-600"; break
  }
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex gap-1 flex-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`h-1 flex-1 rounded-full transition-colors ${
              level <= strength
                ? strength <= 2 ? "bg-red-400" : strength === 3 ? "bg-lime-500" : "bg-emerald-500"
                : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <span className={`text-xs font-medium ${color}`}>{label}</span>
    </div>
  )
}

// ============================================================
// 登录/注册弹窗
// ============================================================
function AuthDialog({
  open,
  onClose,
  onLoginSuccess,
}: {
  open: boolean
  onClose: () => void
  onLoginSuccess: () => void
}) {
  const [tab, setTab] = useState<"login" | "register">("login")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: MessageType; text: string }>({ type: "", text: "" })

  const [loginPhone, setLoginPhone] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [showLoginPwd, setShowLoginPwd] = useState(false)

  const [regNickname, setRegNickname] = useState("")
  const [regPhone, setRegPhone] = useState("")
  const [regPassword, setRegPassword] = useState("")
  const [regPassword2, setRegPassword2] = useState("")
  const [showRegPwd, setShowRegPwd] = useState(false)
  const [showRegPwd2, setShowRegPwd2] = useState(false)

  const showMessage = useCallback((type: MessageType, text: string) => {
    setMessage({ type, text })
  }, [])
  const clearMessage = useCallback(() => {
    setMessage({ type: "", text: "" })
  }, [])

  const switchTab = useCallback(
    (newTab: "login" | "register") => {
      setTab(newTab)
      clearMessage()
    },
    [clearMessage]
  )

  useEffect(() => {
    if (open) {
      setTab("login")
      setLoginPhone(""); setLoginPassword("")
      setRegNickname(""); setRegPhone("")
      setRegPassword(""); setRegPassword2("")
      clearMessage()
    }
  }, [open, clearMessage])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessage()
    const phone = loginPhone.trim(); const password = loginPassword
    if (!phone || !password) { showMessage("error", "请填写手机号和密码"); return }
    if (phone.length !== 11 || !/^\d{11}$/.test(phone)) { showMessage("error", "请输入正确的11位手机号"); return }
    setLoading(true)
    try {
      const data = await apiLogin(phone, password)
      if (data.code === 0 && data.data) {
        localStorage.setItem("token", data.data.token)
        localStorage.setItem("user", JSON.stringify(data.data.user))
        showMessage("success", "登录成功，正在跳转...")
        setTimeout(() => { onLoginSuccess() }, 600)
      } else { showMessage("error", data.message || "登录失败，请检查手机号和密码") }
    } catch { showMessage("error", "网络连接失败，请检查网络后重试") }
    finally { setLoading(false) }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); clearMessage()
    const nickname = regNickname.trim(); const phone = regPhone.trim()
    const password = regPassword; const password2 = regPassword2
    if (!nickname || !phone || !password || !password2) { showMessage("error", "请填写所有字段"); return }
    if (phone.length !== 11 || !/^\d{11}$/.test(phone)) { showMessage("error", "请输入正确的11位手机号"); return }
    if (password.length < 6) { showMessage("error", "密码长度至少6位"); return }
    if (password !== password2) { showMessage("error", "两次输入的密码不一致"); return }
    setLoading(true)
    try {
      const data = await apiRegister(phone, password, nickname)
      if (data.code === 0) {
        const loginData = await apiLogin(phone, password)
        if (loginData.code === 0 && loginData.data) {
          localStorage.setItem("token", loginData.data.token)
          localStorage.setItem("user", JSON.stringify(loginData.data.user))
          showMessage("success", "注册成功！正在跳转...")
          setTimeout(() => { onLoginSuccess() }, 600)
        } else { switchTab("login"); showMessage("success", "注册成功！请登录") }
      } else { showMessage("error", data.message || "注册失败，请重试") }
    } catch { showMessage("error", "网络连接失败，请检查网络后重试") }
    finally { setLoading(false) }
  }

  const inputClass =
    "h-11 pl-10 pr-10 bg-white border-gray-200 focus-visible:ring-green-500/30 focus-visible:border-green-400 rounded-lg"
  const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"

  return (
    <Dialog open={open} onClose={onClose}>
      <AnimatePresence>
        {open && (
          <motion.div
            key="auth-card"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative w-full max-w-lg bg-gradient-to-br from-green-50 via-emerald-50 to-lime-50 rounded-2xl p-8 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                {tab === "login" ? "登录账号" : "注册账号"}
              </h2>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={tab === "login" ? handleLogin : handleRegister} className="space-y-6">
              {/* Brand */}
              <div className="flex flex-col items-center gap-3 pb-5 border-b border-gray-100">
                <Avatar className="h-20 w-20 border-2 border-green-200">
                  <AvatarFallback className="bg-gradient-to-br from-green-500 to-emerald-600">
                    <Scale className="w-9 h-9 text-white" />
                  </AvatarFallback>
                </Avatar>
                <div className="text-center">
                  <p className="text-base font-semibold text-gray-900">智能饮食健康秤</p>
                  <p className="text-xs text-gray-500 mt-0.5">AI驱动的健康管理</p>
                </div>
              </div>

              {/* Tab */}
              <div className="flex bg-gray-100/80 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => switchTab("login")}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-all duration-200 ${
                    tab === "login" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >登 录</button>
                <button
                  type="button"
                  onClick={() => switchTab("register")}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-all duration-200 ${
                    tab === "register" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >注 册</button>
              </div>

              <MessageAlert type={message.type} message={message.text} />

              {/* Login fields */}
              {tab === "login" && (
                <div className="space-y-4">
                  <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="login-phone">手机号 <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <PhoneIcon className={iconClass} />
                      <Input id="login-phone" type="tel" placeholder="请输入11位手机号" className={inputClass} maxLength={11} value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="login-pwd">密码</Label>
                    <div className="relative">
                      <LockIcon className={iconClass} />
                      <Input id="login-pwd" type={showLoginPwd ? "text" : "password"} placeholder="请输入密码" className={inputClass} minLength={6} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                      <button type="button" onClick={() => setShowLoginPwd(!showLoginPwd)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        {showLoginPwd ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Register fields */}
              {tab === "register" && (
                <div className="space-y-4">
                  <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="reg-nickname">昵称 <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <UserIcon className={iconClass} />
                      <Input id="reg-nickname" type="text" placeholder="给自己起个名字吧" className={inputClass} maxLength={20} value={regNickname} onChange={(e) => setRegNickname(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="reg-phone">手机号 <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <PhoneIcon className={iconClass} />
                      <Input id="reg-phone" type="tel" placeholder="请输入11位手机号" className={inputClass} maxLength={11} value={regPhone} onChange={(e) => setRegPhone(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="reg-pwd">设置密码</Label>
                    <div className="relative">
                      <LockIcon className={iconClass} />
                      <Input id="reg-pwd" type={showRegPwd ? "text" : "password"} placeholder="至少6位密码" className={inputClass} minLength={6} maxLength={64} value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
                      <button type="button" onClick={() => setShowRegPwd(!showRegPwd)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        {showRegPwd ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    </div>
                    <PasswordStrength password={regPassword} />
                  </div>
                  <div className="grid w-full items-center gap-1.5">
                    <Label htmlFor="reg-pwd2">确认密码</Label>
                    <div className="relative">
                      <CheckCircle2 className={iconClass} />
                      <Input id="reg-pwd2" type={showRegPwd2 ? "text" : "password"} placeholder="再次输入密码" className={inputClass} minLength={6} maxLength={64} value={regPassword2} onChange={(e) => setRegPassword2(e.target.value)} />
                      <button type="button" onClick={() => setShowRegPwd2(!showRegPwd2)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        {showRegPwd2 ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={onClose} className="flex-1">取消</Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 h-11 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold shadow-md hover:shadow-lg transition-all duration-300"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {tab === "login" ? "登录中..." : "注册中..."}
                    </span>
                  ) : (tab === "login" ? "登 录" : "立即注册")}
                </Button>
              </div>

              {tab === "register" && (
                <p className="text-center text-sm text-gray-500">
                  已有账号？
                  <button type="button" onClick={() => switchTab("login")} className="text-green-600 hover:text-green-700 font-semibold ml-1">立即登录</button>
                </p>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  )
}

// ============================================================
// Hooks
// ============================================================
interface AutoResizeProps {
  minHeight: number
  maxHeight?: number
}
function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current
      if (!textarea) return
      if (reset) { textarea.style.height = `${minHeight}px`; return }
      textarea.style.height = `${minHeight}px`
      const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight ?? Infinity))
      textarea.style.height = `${newHeight}px`
    },
    [minHeight, maxHeight]
  )
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`
  }, [minHeight])
  return { textareaRef, adjustHeight }
}

// ============================================================
// HeroSection
// ============================================================
function HeroSection({ onGetStarted }: { onGetStarted: () => void }) {
  const [isLoaded, setIsLoaded] = useState(false)
  useEffect(() => { setIsLoaded(true) }, [])

  return (
    <section className="relative w-full min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-lime-50 overflow-hidden flex items-center">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
          animate={isLoaded ? { opacity: 0.15, scale: 1.2, rotate: 45 } : {}}
          transition={{ duration: 2, ease: "easeOut" }}
          className="absolute -top-20 -left-20 w-96 h-96 rounded-full bg-green-400/30 blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
          animate={isLoaded ? { opacity: 0.1, scale: 1.2, rotate: -45 } : {}}
          transition={{ duration: 2, delay: 0.3, ease: "easeOut" }}
          className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-emerald-400/30 blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={isLoaded ? { opacity: 0.08, scale: 1 } : {}}
          transition={{ duration: 2, delay: 0.6, ease: "easeOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-lime-400/20 blur-3xl"
        />
      </div>

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isLoaded ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex justify-center"
          >
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/80 backdrop-blur-md border border-green-200 shadow-lg">
              <Sparkles className="w-4 h-4 text-green-600" />
              <span className="text-sm font-semibold text-green-800">AI驱动的智能健康管理</span>
            </div>
          </motion.div>

          <div className="space-y-6">
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={isLoaded ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
              className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-tight text-gray-900"
            >
              记录每一餐
              <br />
              <span className="bg-gradient-to-r from-green-600 via-emerald-500 to-lime-500 bg-clip-text text-transparent">
                守护您的健康
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={isLoaded ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
              className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto leading-relaxed"
            >
              通过AI智能分析您的饮食习惯，结合个人健康档案，
              <br className="hidden md:block" />
              为您量身定制长期健康规划。让每一餐都成为健康的投资。
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isLoaded ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.6, ease: "easeOut" }}
            className="flex items-center justify-center"
          >
            <Button
              size="lg"
              onClick={onGetStarted}
              className="group bg-green-600 hover:bg-green-700 text-white px-16 py-6 text-lg font-semibold shadow-xl hover:shadow-2xl transition-all duration-300 rounded-full"
            >
              开始记录
              <ChevronRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isLoaded ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.8, ease: "easeOut" }}
            className="grid grid-cols-3 gap-8 max-w-2xl mx-auto pt-12"
          >
            {[
              { value: "10k+", label: "活跃用户" },
              { value: "50k+", label: "饮食记录" },
              { value: "98%", label: "满意度" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">{stat.value}</div>
                <div className="text-sm md:text-base text-gray-600">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isLoaded ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 1, ease: "easeOut" }}
            className="flex flex-wrap items-center justify-center gap-6 pt-8"
          >
            {["AI智能分析", "个性化规划", "图片识别"].map((label) => (
              <div key={label} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-green-100">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-gray-700">{label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// FeaturesSection
// ============================================================
function FeaturesSection() {
  const features = [
    { icon: <Activity className="w-6 h-6" />, title: "智能饮食记录", description: "手动录入每餐食材、重量、烹饪方式和热量，系统自动分析营养成分", color: "green" },
    { icon: <MessageSquare className="w-6 h-6" />, title: "AI健康对话", description: "专属AI助手，基于知识库和您的实际情况提供个性化健康建议", color: "emerald" },
    { icon: <Camera className="w-6 h-6" />, title: "图片识别", description: "上传食物图片，AI自动识别并记录营养信息", color: "lime" },
    { icon: <Target className="w-6 h-6" />, title: "个性化规划", description: "根据年龄、身高、体重和健康目标，生成长期饮食建议", color: "green" },
    { icon: <BarChart3 className="w-6 h-6" />, title: "数据可视化", description: "直观展示饮食趋势和健康指标变化", color: "emerald" },
    { icon: <BookOpen className="w-6 h-6" />, title: "知识库支持", description: "基于阿里云百炼知识库，提供专业的营养和健康知识", color: "lime" },
  ]

  const colorMap: Record<string, string> = {
    green: "bg-green-100 text-green-600",
    emerald: "bg-emerald-100 text-emerald-600",
    lime: "bg-lime-100 text-lime-600",
  }

  return (
    <section className="w-full py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">核心功能</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            全方位的健康管理工具，让您轻松掌控每一餐的营养摄入
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="group"
            >
              <div className="h-full p-6 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 hover:shadow-lg transition-all duration-300">
                <div className={`inline-flex p-3 rounded-xl ${colorMap[feature.color]} mb-4`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// AIChatSection
// ============================================================
function AIChatSection() {
  const [message, setMessage] = useState("")
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 48, maxHeight: 150 })

  const quickActions = [
    { icon: <Apple className="w-4 h-4" />, label: "今日饮食分析" },
    { icon: <Target className="w-4 h-4" />, label: "健康目标设定" },
    { icon: <Calendar className="w-4 h-4" />, label: "一周饮食计划" },
    { icon: <TrendingUp className="w-4 h-4" />, label: "营养趋势" },
    { icon: <Heart className="w-4 h-4" />, label: "健康建议" },
    { icon: <Upload className="w-4 h-4" />, label: "上传食物图片" },
  ]

  return (
    <section className="w-full py-24 bg-gradient-to-br from-green-50 via-emerald-50 to-lime-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">AI智能助手</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            随时随地与AI对话，获取个性化的健康建议和饮食规划
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <div className="relative bg-white/80 backdrop-blur-md rounded-2xl border border-green-200 shadow-xl">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value)
                adjustHeight()
              }}
              placeholder="输入您的问题或上传食物图片..."
              className={cn(
                "w-full px-6 py-4 resize-none border-none",
                "bg-transparent text-gray-900 text-base",
                "focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-gray-400 min-h-[48px]"
              )}
              style={{ overflow: "hidden" }}
            />
            <div className="flex items-center justify-between p-4 border-t border-green-100">
              <Button variant="ghost" size="icon" className="text-green-600 hover:bg-green-100">
                <Camera className="w-5 h-5" />
              </Button>
              <Button
                disabled={!message.trim()}
                className={cn(
                  "flex items-center gap-2 px-6 py-2 rounded-full transition-colors",
                  message.trim()
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                <ArrowUpIcon className="w-4 h-4" />
                <span>发送</span>
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center flex-wrap gap-3 mt-6">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant="outline"
                className="flex items-center gap-2 rounded-full border-green-300 bg-white/50 text-gray-700 hover:bg-green-50"
              >
                {action.icon}
                <span className="text-sm">{action.label}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// Footer
// ============================================================
function Footer() {
  return (
    <footer className="w-full py-12 bg-gray-900 border-t border-gray-800">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 max-w-6xl mx-auto">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <Leaf className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white">智能饮食助手</span>
            </div>
            <p className="text-gray-400 text-sm">记录每一餐，守护您的健康</p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">产品功能</h3>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>饮食记录</li><li>AI对话</li><li>健康规划</li><li>数据分析</li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">技术支持</h3>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>Go后端</li><li>Python RAG</li><li>阿里云百炼</li><li>PostgreSQL</li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">联系我们</h3>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li>support@health.com</li><li>用户协议</li><li>隐私政策</li><li>帮助中心</li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-gray-800 text-center text-gray-400 text-sm max-w-6xl mx-auto">
          <p>© 2024 智能饮食健康管理助手. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

// ============================================================
// Landing Page (with auth dialog)
// ============================================================
function LandingPage() {
  const [showAuth, setShowAuth] = useState(false)
  const navigate = useNavigate()

  const handleLoginSuccess = () => {
    navigate("/dashboard")
  }

  return (
    <div className="min-h-screen w-full bg-white">
      <HeroSection onGetStarted={() => setShowAuth(true)} />
      <FeaturesSection />
      <AIChatSection />
      <Footer />
      <AuthDialog open={showAuth} onClose={() => setShowAuth(false)} onLoginSuccess={handleLoginSuccess} />
    </div>
  )
}

// ============================================================
// App - Router
// ============================================================
function AppRoutes() {
  const location = useLocation()
  const desktopRoutes = (
    <Routes location={location}>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/records" element={<RecordsPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/ai-chat" element={<AIChatPage />} />
      <Route path="/foods" element={<FoodsPage />} />
      <Route path="/profile" element={<ProfilePage />} />
    </Routes>
  )
  return (
    <AdaptiveRoutes desktop={desktopRoutes} />
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
