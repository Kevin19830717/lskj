import { useState, type FormEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Scale, Phone, Lock, User, Eye, EyeOff, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiPost } from "@/lib/api"

interface AuthData {
  token: string
  user: { id: number; phone: string; nickname: string; avatar_url?: string; created_at: string }
}

export default function MobileAuthPage({ onSuccess }: { onSuccess: () => void }) {
  const [tab, setTab] = useState<"login" | "register">("login")
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null)

  const [phone, setPhone] = useState("")
  const [pwd, setPwd] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [nick, setNick] = useState("")
  const [pwd2, setPwd2] = useState("")
  const [showPwd2, setShowPwd2] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const p = phone.trim()
    if (p.length !== 11 || !/^\d{11}$/.test(p)) { setMsg({ type: "error", text: "请输入正确的11位手机号" }); return }
    if (pwd.length < 6) { setMsg({ type: "error", text: "密码至少6位" }); return }
    if (tab === "register") {
      if (!nick.trim()) { setMsg({ type: "error", text: "请填写昵称" }); return }
      if (pwd !== pwd2) { setMsg({ type: "error", text: "两次密码不一致" }); return }
    }
    setLoading(true)
    try {
      if (tab === "register") {
        const r = await apiPost("/auth/register", { phone: p, password: pwd, nickname: nick.trim() })
        if (r.code !== 0) { setMsg({ type: "error", text: r.message || "注册失败" }); return }
      }
      const data = await apiPost<AuthData>("/auth/login", { phone: p, password: pwd })
      if (data.code === 0 && data.data) {
        localStorage.setItem("token", data.data.token)
        localStorage.setItem("user", JSON.stringify(data.data.user))
        setMsg({ type: "success", text: "登录成功" })
        setTimeout(onSuccess, 400)
      } else {
        setMsg({ type: "error", text: data.message || "登录失败" })
      }
    } catch {
      setMsg({ type: "error", text: "网络连接失败" })
    } finally {
      setLoading(false)
    }
  }

  const field = "h-11 rounded-xl border-gray-200 bg-white pl-10 pr-10 text-[15px] focus-visible:border-green-400 focus-visible:ring-green-400/30"
  const icon = "absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400"

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-gradient-to-br from-green-500 via-emerald-500 to-lime-500">
      {/* 装饰光斑 */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-lime-200/20 blur-3xl" />

      {/* 顶部品牌区 */}
      <div className="flex shrink-0 flex-col items-center gap-3 px-6 pt-[14vh] pb-8 text-white">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 16 }}
          className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/20 backdrop-blur-md shadow-xl"
        >
          <Scale className="h-10 w-10 text-white" />
        </motion.div>
        <h1 className="text-2xl font-bold tracking-wide">智能饮食健康秤</h1>
        <p className="text-sm text-white/80">AI 驱动的健康管理</p>
      </div>

      {/* 卡片 */}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5">
        <div className="rounded-3xl bg-white/95 p-6 shadow-2xl backdrop-blur-xl">
          {/* Tab */}
          <div className="mb-5 flex rounded-xl bg-gray-100 p-1">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setMsg(null) }}
                className={cn(
                  "flex-1 rounded-lg py-2 text-sm font-semibold transition-all",
                  tab === t ? "bg-white text-green-700 shadow-sm" : "text-gray-500"
                )}
              >
                {t === "login" ? "登录" : "注册"}
              </button>
            ))}
          </div>

          <AnimatePresence>
            {msg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "mb-4 rounded-lg px-3 py-2 text-xs font-medium",
                  msg.type === "error"
                    ? "bg-red-50 text-red-600"
                    : "bg-emerald-50 text-emerald-600"
                )}
              >
                {msg.text}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={submit} className="space-y-3.5">
            {tab === "register" && (
              <div className="relative">
                <User className={icon} />
                <input
                  className={cn(field, "w-full")}
                  placeholder="昵称"
                  maxLength={20}
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                />
              </div>
            )}
            <div className="relative">
              <Phone className={icon} />
              <input
                type="tel"
                inputMode="numeric"
                className={cn(field, "w-full")}
                placeholder="手机号"
                maxLength={11}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="relative">
              <Lock className={icon} />
              <input
                type={showPwd ? "text" : "password"}
                className={cn(field, "w-full")}
                placeholder="密码"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
              />
              <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPwd ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </div>
            {tab === "register" && (
              <div className="relative">
                <CheckCircle2 className={icon} />
                <input
                  type={showPwd2 ? "text" : "password"}
                  className={cn(field, "w-full")}
                  placeholder="确认密码"
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                />
                <button type="button" onClick={() => setShowPwd2((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPwd2 ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-[15px] font-semibold text-white shadow-lg shadow-green-500/30 transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : tab === "login" ? "登 录" : "立即注册"}
            </button>
          </form>

          {tab === "register" && (
            <p className="mt-4 text-center text-xs text-gray-500">
              已有账号？
              <button onClick={() => { setTab("login"); setMsg(null) }} className="ml-1 font-semibold text-green-600">去登录</button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
