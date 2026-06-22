import { useEffect, useRef, useState } from "react"
import { motion, useInView, animate } from "framer-motion"
import { cn } from "@/lib/utils"

// ============================================================
// 酷炫视觉效果组件库 (21st.dev 风格)
// 基于 framer-motion 实现：数字滚动 / 极光背景 / 流光卡片 / 渐变文字
// ============================================================

/** AnimatedNumber 数字滚动动画：进入视口时从0滚到目标值 */
export function AnimatedNumber({
  value,
  duration = 1.2,
  decimals = 0,
  suffix = "",
  prefix = "",
  className,
}: {
  value: number
  duration?: number
  decimals?: number
  suffix?: string
  prefix?: string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const [display, setDisplay] = useState("0")

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        setDisplay(v.toFixed(decimals))
      },
    })
    return () => controls.stop()
  }, [inView, value, duration, decimals])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  )
}

/** GradientText 渐变流动文字 */
export function GradientText({
  children,
  from = "#4ade80",
  via = "#22c55e",
  to = "#16a34a",
  className,
}: {
  children: React.ReactNode
  from?: string
  via?: string
  to?: string
  className?: string
}) {
  return (
    <span
      className={cn("bg-clip-text text-transparent", className)}
      style={{
        backgroundImage: `linear-gradient(135deg, ${from}, ${via}, ${to})`,
        backgroundSize: "200% 200%",
      }}
    >
      {children}
    </span>
  )
}

/** AuroraBackground 极光流动背景：多层渐变光斑缓慢漂移 */
export function AuroraBackground({
  theme = "green",
  className,
}: {
  theme?: "green" | "purple"
  className?: string
}) {
  const colors =
    theme === "green"
      ? ["rgba(74,222,128,0.35)", "rgba(52,211,153,0.3)", "rgba(134,239,172,0.28)"]
      : ["rgba(129,140,248,0.32)", "rgba(167,139,250,0.28)", "rgba(196,181,253,0.26)"]

  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}>
      {colors.map((c, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{
            background: c,
            width: "45%",
            height: "45%",
            left: `${[10, 45, 70][i]}%`,
            top: `${[15, 50, 25][i]}%`,
          }}
          animate={{
            x: [0, 40, -30, 0],
            y: [0, -30, 40, 0],
            scale: [1, 1.15, 0.95, 1],
          }}
          transition={{
            duration: 18 + i * 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  )
}

/** GlowCard 流光边框卡片：hover 时边框出现流光 + 内容上浮 */
export function GlowCard({
  children,
  theme = "green",
  className,
}: {
  children: React.ReactNode
  theme?: "green" | "purple"
  className?: string
}) {
  const glowColor = theme === "green" ? "rgba(74,222,128,0.5)" : "rgba(129,140,248,0.5)"

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={cn(
        "relative rounded-2xl overflow-hidden group",
        "bg-white/70 backdrop-blur-xl border border-white/50",
        "shadow-[0_4px_20px_rgba(0,0,0,0.06)]",
        className
      )}
    >
      {/* hover 流光边框 */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ boxShadow: `0 0 0 1.5px ${glowColor}, 0 8px 30px ${glowColor}` }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  )
}

/** StatBadge 统计指标胶囊：带图标和渐变 */
export function StatBadge({
  icon,
  label,
  theme = "green",
  className,
}: {
  icon: React.ReactNode
  label: string
  theme?: "green" | "purple"
  className?: string
}) {
  const grad =
    theme === "green"
      ? "from-emerald-50 to-green-100 text-emerald-600 border-emerald-200/60"
      : "from-indigo-50 to-purple-100 text-indigo-600 border-purple-200/60"
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r border backdrop-blur-sm",
        grad,
        className
      )}
    >
      {icon}
      {label}
    </div>
  )
}

/** ShimmerLine 流光分割线 */
export function ShimmerLine({ theme = "green" }: { theme?: "green" | "purple" }) {
  const colors =
    theme === "green"
      ? "from-transparent via-emerald-400 to-transparent"
      : "from-transparent via-indigo-400 to-transparent"
  return (
    <div className="relative h-px w-full overflow-hidden">
      <motion.div
        className={cn("absolute inset-0 bg-gradient-to-r", colors)}
        animate={{ x: ["-100%", "100%"] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  )
}
