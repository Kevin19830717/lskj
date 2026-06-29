import { useEffect, useState, type ComponentType } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { ClipboardList, FileText, Sparkles, UtensilsCrossed, User } from "lucide-react"
import MobileAuthPage from "./MobileAuthPage"
import MobileProfilePage from "./pages/MobileProfilePage"
import MobileRecordsPage from "./pages/MobileRecordsPage"
import MobileReportsPage from "./pages/MobileReportsPage"
import MobileAIChatPage from "./pages/MobileAIChatPage"
import MobileFoodsPage from "./pages/MobileFoodsPage"

interface TabDef {
  key: string
  label: string
  icon: typeof User
  comp: ComponentType
}

// 5 个底部 Tab：默认进入「我的」（含仪表盘概览）
const TABS: TabDef[] = [
  { key: "profile", label: "我的", icon: User, comp: MobileProfilePage },
  { key: "records", label: "记录", icon: ClipboardList, comp: MobileRecordsPage },
  { key: "reports", label: "报告", icon: FileText, comp: MobileReportsPage },
  { key: "ai", label: "AI", icon: Sparkles, comp: MobileAIChatPage },
  { key: "foods", label: "食物", icon: UtensilsCrossed, comp: MobileFoodsPage },
]

export default function MobileApp() {
  const [authed, setAuthed] = useState(() =>
    typeof window !== "undefined" ? Boolean(localStorage.getItem("token")) : false
  )
  const [tab, setTab] = useState("profile")

  useEffect(() => {
    const check = () => setAuthed(Boolean(localStorage.getItem("token")))
    window.addEventListener("storage", check)
    // 同标签页登出/登录通知
    window.addEventListener("smart-scale-auth-change", check)
    return () => {
      window.removeEventListener("storage", check)
      window.removeEventListener("smart-scale-auth-change", check)
    }
  }, [])

  // 未登录 → 全屏登录页
  if (!authed) {
    return <MobileAuthPage onSuccess={() => setAuthed(true)} />
  }

  const current = TABS.find((t) => t.key === tab) ?? TABS[0]
  const Current = current.comp

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-gradient-to-b from-green-50 via-emerald-50 to-lime-50">
      {/* 主内容区：每个页面自行管理内部滚动 */}
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="h-full w-full"
          >
            <Current />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* 底部 Tab 栏 */}
      <nav className="relative z-20 flex shrink-0 items-stretch border-t border-green-100/80 bg-white/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = t.key === tab
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 active:scale-95 transition-transform"
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-x-2 top-1 bottom-1 rounded-2xl bg-gradient-to-b from-green-100/70 to-emerald-100/40"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon
                className={cn(
                  "relative z-10 h-[22px] w-[22px] transition-colors",
                  active ? "text-green-600" : "text-gray-400"
                )}
                strokeWidth={active ? 2.4 : 2}
              />
              <span
                className={cn(
                  "relative z-10 text-[11px] font-medium transition-colors",
                  active ? "text-green-700" : "text-gray-400"
                )}
              >
                {t.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
