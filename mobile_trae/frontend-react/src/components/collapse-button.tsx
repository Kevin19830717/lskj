import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================================
// CollapseButton — 侧边栏折叠/展开控制按钮
// 跨在侧边栏与主区域交界线上(各占一半)，垂直居中。
// 默认：竖向小方块(仅箭头)，半透明；hover/press：竖向加长，
// 文字逐字竖排显示"收起/展开侧边栏"，箭头在文字下方，整体垂直居中。
// 支持紫色(purple)和绿色(green)两种主题色。
// ============================================================

const FILL_DURATION = 0.5
const FILL_EASE = [0.16, 1, 0.3, 1] as const

function getCoverDiameter(width: number, height: number, x: number, y: number) {
  return Math.ceil(
    2 *
      Math.max(
        Math.hypot(x, y),
        Math.hypot(width - x, y),
        Math.hypot(x, height - y),
        Math.hypot(width - x, height - y)
      )
  )
}

interface CollapseButtonProps {
  collapsed: boolean
  onClick: () => void
  theme?: "purple" | "green"
}

export function CollapseButton({ collapsed, onClick, theme = "purple" }: CollapseButtonProps) {
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = React.useState(false)
  const [pressed, setPressed] = React.useState(false)
  const [origin, setOrigin] = React.useState({ x: 0, y: 0 })
  const [coverSize, setCoverSize] = React.useState(0)

  const expanded = hovered || pressed
  const showFill = expanded

  // 主题色配置
  const isGreen = theme === "green"
  const colors = isGreen
    ? {
        fillBg: "#16a34a",       // 悬停填充色（绿）
        fillBgClass: "bg-[#16a34a]",
        activeBg: "bg-[#16a34a]/90",
        activeBorder: "border-[#22c55e]/80",
        activeShadow: "shadow-[0_4px_16px_rgba(22,163,74,0.4)]",
        idleText: "text-[#16a34a]",
        idleShadow: "shadow-[0_2px_8px_rgba(22,163,74,0.2)] hover:shadow-[0_4px_12px_rgba(22,163,74,0.3)]",
      }
    : {
        fillBg: "#667eea",       // 悬停填充色（紫）
        fillBgClass: "bg-[#667eea]",
        activeBg: "bg-[#3730a3]/90",
        activeBorder: "border-[#4f46e5]/80",
        activeShadow: "shadow-[0_4px_16px_rgba(55,48,163,0.4)]",
        idleText: "text-[#3730a3]",
        idleShadow: "shadow-[0_2px_8px_rgba(45,36,144,0.2)] hover:shadow-[0_4px_12px_rgba(45,36,144,0.3)]",
      }

  const updateOrigin = React.useCallback((x: number, y: number) => {
    const node = btnRef.current
    if (!node) return
    setOrigin({ x, y })
    const rect = node.getBoundingClientRect()
    setCoverSize(getCoverDiameter(rect.width, rect.height, x, y))
  }, [])

  React.useLayoutEffect(() => {
    const node = btnRef.current
    if (!node) return
    const measure = () => {
      const rect = node.getBoundingClientRect()
      setCoverSize(getCoverDiameter(rect.width, rect.height, origin.x, origin.y))
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(node)
    return () => obs.disconnect()
  }, [origin.x, origin.y, expanded])

  const label = collapsed ? "展开侧边栏" : "收起侧边栏"
  const chars = label.split("")

  return (
    <motion.button
      ref={btnRef}
      type="button"
      onClick={onClick}
      animate={{
        height: expanded ? 180 : 48,
        width: expanded ? 32 : 28,
      }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileTap={{ scale: 0.94 }}
      onPointerEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        updateOrigin(e.clientX - rect.left, e.clientY - rect.top)
        setHovered(true)
      }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        updateOrigin(e.clientX - rect.left, e.clientY - rect.top)
        setPressed(true)
      }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => {
        setHovered(false)
        setPressed(false)
      }}
      aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
      className={cn(
        "relative overflow-hidden cursor-pointer select-none touch-manipulation",
        "flex flex-col items-center justify-center gap-2",
        "rounded-lg",
        "transition-colors duration-300 outline-none",
        "focus-visible:ring-2 focus-visible:ring-white/50",
        showFill
          ? cn(colors.activeBg, "text-white border", colors.activeBorder, colors.activeShadow)
          : cn("bg-white/90", colors.idleText, "border border-white/80", colors.idleShadow)
      )}
    >
      <motion.span
        aria-hidden
        className={cn("pointer-events-none absolute rounded-full", colors.fillBgClass)}
        style={{
          width: coverSize,
          height: coverSize,
          left: origin.x,
          top: origin.y,
          translateX: "-50%",
          translateY: "-50%",
        }}
        animate={{ scale: showFill && coverSize > 0 ? 1 : 0 }}
        initial={false}
        transition={{ duration: FILL_DURATION, ease: FILL_EASE }}
      />
      <AnimatePresence mode="popLayout">
        {expanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, delay: 0.08 }}
            className="relative z-10 flex flex-col items-center justify-center gap-2"
          >
            <div className="flex flex-col items-center leading-none">
              {chars.map((ch, i) => (
                <span key={i} className="text-[12px] font-medium tracking-wide">
                  {ch}
                </span>
              ))}
            </div>
            {collapsed ? (
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ChevronLeft className="w-4 h-4 flex-shrink-0" />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 flex items-center justify-center"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
