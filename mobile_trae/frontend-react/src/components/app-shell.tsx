import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { CollapseButton } from "@/components/collapse-button"
import { AuroraBackground } from "@/components/fx"
import {
  BarChart3,
  ClipboardList,
  FileText,
  UtensilsCrossed,
  User,
  LogOut,
  Sparkles,
} from "lucide-react"

export const USER_UPDATED_EVENT = "smart-scale-user-updated"

interface NavItem {
  path: string
  icon: typeof BarChart3
  label: string
  emoji: string
}

const navItems: NavItem[] = [
  { path: "/dashboard", icon: BarChart3, label: "仪表盘", emoji: "📊" },
  { path: "/records", icon: ClipboardList, label: "历史记录", emoji: "📝" },
  { path: "/reports", icon: FileText, label: "营养报告", emoji: "📋" },
  { path: "/ai-chat", icon: Sparkles, label: "AI助手", emoji: "✨" },
  { path: "/foods", icon: UtensilsCrossed, label: "食物库", emoji: "🍽️" },
  { path: "/profile", icon: User, label: "个人中心", emoji: "👤" },
]

interface SessionUser {
  nickname?: string
  phone?: string
  avatar_url?: string
}

interface AppShellProps {
  title: string
  titleIcon?: ReactNode
  actions?: ReactNode
  children: ReactNode
  contentClassName?: string
  /** 主题色：purple(默认紫色) | green(绿色，与登录页一致) */
  theme?: "purple" | "green"
}

function getStoredUser(): SessionUser {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}") as SessionUser
  } catch {
    return {}
  }
}

export function notifyUserUpdated(nextUser: SessionUser) {
  const prevUser = getStoredUser()
  localStorage.setItem("user", JSON.stringify({ ...prevUser, ...nextUser }))
  window.dispatchEvent(new Event(USER_UPDATED_EVENT))
}

export default function AppShell({
  title,
  titleIcon,
  actions,
  children,
  contentClassName,
  theme = "purple",
}: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const hasToken = typeof window !== "undefined" ? Boolean(localStorage.getItem("token")) : false
  // 惰性同步读取收起状态：localStorage 存 "1" 才收起，否则展开（含首次访问）
  // 同步读取避免路由切换重挂载时先渲染默认态再异步切换产生的闪烁
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("sidebar-collapsed") === "1" : false
  )
  const [user, setUser] = useState<SessionUser>({})

  useEffect(() => {
    if (!hasToken) {
      navigate("/")
      return
    }

    setUser(getStoredUser())

    const syncUser = () => {
      setUser(getStoredUser())
    }
    window.addEventListener("storage", syncUser)
    window.addEventListener(USER_UPDATED_EVENT, syncUser)
    return () => {
      window.removeEventListener("storage", syncUser)
      window.removeEventListener(USER_UPDATED_EVENT, syncUser)
    }
  }, [hasToken, navigate])

  if (!hasToken) {
    return null
  }

  const displayName = useMemo(() => user.nickname || user.phone || "未登录", [user.nickname, user.phone])
  const userInitial = useMemo(() => displayName.charAt(0).toUpperCase(), [displayName])

  // 主题色配置：紫色(默认) vs 绿色(与登录页同色系，侧边栏中绿过渡到主区浅绿)
  const isGreen = theme === "green"
  const t = {
    bg: isGreen
      ? "bg-gradient-to-br from-[#dcfce7] via-[#d1fae5] to-[#ecfccb]"
      : "bg-[radial-gradient(120%_100%_at_0%_0%,rgba(160,180,255,0.65)_0%,rgba(200,190,240,0.52)_35%,rgba(232,222,248,0.42)_60%,rgba(215,208,245,0.55)_100%)]",
    sidebar: isGreen
      ? "bg-gradient-to-b from-[#15803d] via-[#16a34a] to-[#22c55e]"
      : "bg-gradient-to-b from-[#2d2490] via-[#3730a3] to-[#667eea]",
    sidebarShadow: isGreen
      ? "shadow-[4px_0_24px_rgba(21,128,61,0.2)]"
      : "shadow-[4px_0_24px_rgba(45,36,144,0.3)]",
    cardBg: isGreen
      ? "bg-white/75 backdrop-blur-[14px] saturate-[1.2] rounded-none lg:rounded-[20px] border-0 lg:border border-[rgba(187,247,208,0.5)] shadow-none lg:shadow-[0_6px_28px_rgba(34,197,94,0.08)] p-2 lg:p-7 min-h-full relative overflow-hidden"
      : "bg-white lg:bg-[radial-gradient(ellipse_at_20%_0%,rgba(102,126,234,0.14)_0%,transparent_55%),radial-gradient(ellipse_at_80%_100%,rgba(118,75,162,0.11)_0%,transparent_55%)] lg:backdrop-blur-[16px] lg:saturate-[1.3] rounded-none lg:rounded-[20px] border-0 lg:border border-[rgba(200,195,235,0.35)] shadow-none lg:shadow-[0_8px_32px_rgba(102,126,234,0.1),inset_0_1px_0_rgba(255,255,255,0.4)] p-2 lg:p-7 min-h-full relative overflow-hidden",
    floatA: isGreen
      ? "bg-[radial-gradient(circle,rgba(74,222,128,0.05)_0%,transparent_70%)]"
      : "bg-[radial-gradient(circle,rgba(102,126,234,0.09)_0%,transparent_70%)]",
    floatB: isGreen
      ? "bg-[radial-gradient(circle,rgba(52,211,153,0.04)_0%,transparent_70%)]"
      : "bg-[radial-gradient(circle,rgba(118,75,162,0.07)_0%,transparent_70%)]",
    titleColor: isGreen ? "text-green-700" : "text-gray-800",
    avatarBg: isGreen
      ? "bg-gradient-to-br from-green-400 to-green-600 shadow-[0_2px_10px_rgba(34,197,94,0.35)] hover:shadow-[0_4px_16px_rgba(34,197,94,0.5)]"
      : "bg-gradient-to-br from-[#667eea] to-[#764ba2] shadow-[0_2px_10px_rgba(102,126,234,0.4)] hover:shadow-[0_4px_16px_rgba(102,126,234,0.5)]",
    // 侧边栏文字色（深绿底用白色文字）
    navText: "text-white",
    navTextMuted: "text-white/78",
    navTextDim: "text-white/60",
    navActive: isGreen
      ? "bg-gradient-to-r from-lime-300/25 to-lime-300/5 text-white border-l-lime-300 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(190,242,100,0.15)]"
      : "bg-gradient-to-r from-yellow-400/20 to-yellow-400/5 text-white border-l-yellow-400 font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(255,213,79,0.1)]",
    navHover: isGreen
      ? "hover:bg-white/9 hover:text-white hover:border-l-lime-300/50"
      : "hover:bg-white/9 hover:text-white hover:border-l-yellow-400/50",
    navBorder: "border-white/10",
    footerBg: "bg-gradient-to-t from-black/8 to-transparent",
    logoutBtn: "bg-white/10 text-white/70 hover:text-red-300 hover:bg-red-400/10",
    logoColor: "text-white drop-shadow-sm",
  }

  const handleToggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem("sidebar-collapsed", next ? "1" : "0")
  }

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    navigate("/")
  }

  return (
    <div className={cn("relative flex h-screen overflow-hidden bg-fixed", t.bg)}>
      <nav
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 hidden lg:flex flex-col transition-all duration-300",
          t.sidebar, t.sidebarShadow, t.navText,
          collapsed ? "w-20" : "w-60"
        )}
      >
        <div className={cn("relative text-center py-5 px-4 border-b flex items-center justify-between", t.navBorder)}>
          {!collapsed && (
            <div className="flex items-center gap-2 flex-1 justify-center">
              <span className="text-3xl inline-block animate-[bounce_3s_ease-in-out_infinite]">🥗</span>
              <h2 className={cn("text-[16px] font-bold tracking-wider whitespace-nowrap", t.logoColor)}>智能饮食秤</h2>
            </div>
          )}
          {collapsed && (
            <div className="flex-1 flex justify-center">
              <span className="text-3xl inline-block animate-[bounce_3s_ease-in-out_infinite]">🥗</span>
            </div>
          )}
        </div>

        <ul className="list-none flex-1 py-3 px-0 overflow-y-auto scrollbar-none">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path
            const Icon = item.icon
            return (
              <li key={item.path}>
                <button
                  onClick={() => navigate(item.path)}
                  title={collapsed ? item.label : ""}
                  className={cn(
                    "w-full flex items-center gap-3 py-3 transition-all duration-300 text-left relative overflow-hidden group",
                    collapsed ? "px-0 justify-center" : "px-6",
                    "border-l-[3px]",
                    "hover:translate-x-1",
                    t.navHover,
                    isActive
                      ? t.navActive
                      : cn(t.navTextMuted, "border-l-transparent")
                  )}
                >
                  <span
                    className={cn(
                      "text-lg flex-shrink-0 transition-transform duration-300 group-hover:scale-110",
                      collapsed ? "mx-auto" : "w-[22px] text-center"
                    )}
                  >
                    {!collapsed ? item.emoji : <Icon className="w-5 h-5 mx-auto" />}
                  </span>
                  {!collapsed && <span className="text-sm flex-1 text-left whitespace-nowrap">{item.label}</span>}
                </button>
              </li>
            )
          })}
        </ul>

        <div className={cn("p-3.5 border-t", t.navBorder, t.footerBg)}>
          <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between gap-2")}>
            <button
              type="button"
              className={cn(
                "rounded-full flex items-center justify-center font-bold text-white border-2 border-white/25 hover:scale-108 transition-all duration-300 flex-shrink-0 overflow-hidden",
                t.avatarBg,
                collapsed ? "w-9 h-9 text-sm" : "w-[42px] h-[42px] text-[17px]"
              )}
              onClick={() => navigate("/profile")}
              title={collapsed ? displayName : ""}
            >
              {userInitial}
            </button>
            {!collapsed && (
              <div className="flex-1 flex flex-col items-start min-w-0 px-1">
                <span className={cn("text-xs font-medium truncate max-w-full", t.navTextMuted)}>{displayName}</span>
                <button
                  onClick={handleLogout}
                  className={cn("inline-flex items-center gap-1 text-[11px] hover:text-red-500 transition-colors duration-300 mt-0.5", t.navTextDim)}
                >
                  <LogOut className="w-3 h-3" />
                  退出登录
                </button>
              </div>
            )}
            {collapsed && (
              <button
                onClick={handleLogout}
                className={cn("w-9 h-9 rounded-full flex items-center justify-center transition-all", t.logoutBtn)}
                title="退出登录"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* 折叠按钮：跨在侧边栏与主区域交界线上(各占一半)，垂直居中，translateX(-50%) 使中心对齐边线 */}
      <div
        className={cn(
          "fixed top-1/2 -translate-y-1/2 -translate-x-1/2 z-[60] hidden lg:block transition-all duration-300",
          collapsed ? "left-20" : "left-60"
        )}
      >
        <CollapseButton collapsed={collapsed} onClick={handleToggle} theme={theme} />
      </div>

      <main
        className={cn(
          "box-border h-screen p-0 pb-12 lg:p-7 relative z-1 overflow-x-hidden overflow-y-auto transition-all duration-300",
          collapsed ? "lg:ml-20 lg:w-[calc(100%-80px)] w-full" : "lg:ml-60 lg:w-[calc(100%-240px)] w-full"
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ x: "100%", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              t.cardBg,
              contentClassName
            )}
          >
          <div className="absolute -top-15 -right-10 w-50 h-50 rounded-full pointer-events-none animate-[lightFloat_8s_ease-in-out_infinite] hidden lg:block" />
          <div className={cn("absolute -bottom-20 -left-8 w-45 h-45 rounded-full pointer-events-none animate-[lightFloat_10s_ease-in-out_infinite_reverse] hidden lg:block", t.floatB)} />
          <AuroraBackground theme={theme} className={isGreen ? "opacity-20 hidden lg:block" : "opacity-60 hidden lg:block"} />

          <div className="relative z-10">
            <div className="hidden lg:flex justify-between items-center mb-6 flex-wrap gap-3">
              <h3 className={cn("text-[22px] font-bold flex items-center gap-2", t.titleColor)}>
                {titleIcon}
                {title}
              </h3>
              {actions}
            </div>
            {/* 移动端：actions 放在标题下方（无标题行） */}
            {actions && (
              <div className="lg:hidden flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-none -mx-1 px-1">
                {actions}
              </div>
            )}
            {children}
          </div>
        </motion.div>
        </AnimatePresence>
      </main>

      {/* ===== 移动端底部 TabBar（仅 <lg 显示）===== */}
      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[55] flex items-stretch lg:hidden bg-white border-t border-gray-200/80",
          isGreen ? "" : ""
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          const Icon = item.icon
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex-1 flex flex-col items-center justify-center py-1 gap-0"
            >
              <Icon
                className={cn("w-[16px] h-[16px] transition-colors", isActive ? (isGreen ? "text-green-600" : "text-[#667eea]") : "text-gray-400")}
              />
              <span
                className={cn(
                  "text-[9px] leading-tight mt-0.5",
                  isActive ? (isGreen ? "text-green-600 font-medium" : "text-[#667eea] font-medium") : "text-gray-400"
                )}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>

      <style>{`
        @keyframes lightFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(15px, -10px) scale(1.1); }
        }
      `}</style>
    </div>
  )
}
