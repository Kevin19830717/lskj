import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// 主题色配置
const themeColors = {
  green: {
    triggerBorder: "border-green-200",
    triggerHover: "hover:bg-green-50 hover:border-green-300",
    triggerActive: "bg-green-50 border-green-400",
    iconColor: "text-green-500",
    textColor: "text-green-600",
    itemHover: "hover:bg-green-50",
    itemActive: "bg-green-50 text-green-700 font-semibold",
    dropdownBg: "bg-white",
    dropdownBorder: "border-green-100",
    dropdownShadow: "shadow-[0_8px_30px_rgba(34,197,94,0.15)]",
  },
  purple: {
    triggerBorder: "border-purple-200",
    triggerHover: "hover:bg-purple-50 hover:border-purple-300",
    triggerActive: "bg-purple-50 border-purple-400",
    iconColor: "text-purple-500",
    textColor: "text-purple-600",
    itemHover: "hover:bg-purple-50",
    itemActive: "bg-purple-50 text-purple-700 font-semibold",
    dropdownBg: "bg-white",
    dropdownBorder: "border-purple-100",
    dropdownShadow: "shadow-[0_8px_30px_rgba(139,92,246,0.15)]",
  },
}

export interface DropdownOption {
  value: string
  label: string
  icon?: React.ReactNode
}

interface AnimatedDropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  theme?: "green" | "purple"
  placeholder?: string
  className?: string
  icon?: React.ReactNode
  size?: "sm" | "md"
}

export function AnimatedDropdown({
  options,
  value,
  onChange,
  theme = "green",
  placeholder = "选择",
  className,
  icon,
  size = "md",
}: AnimatedDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const colors = themeColors[theme]

  const selectedOption = options.find((o) => o.value === value)

  // 点击外部关闭
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open, handleClickOutside])

  // Escape 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open])

  const sizeClasses = size === "sm"
    ? "h-9 px-3 text-sm gap-1"
    : "h-11 px-4 text-sm gap-1.5"

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center rounded-lg border transition-all duration-200 font-medium",
          colors.triggerBorder,
          colors.triggerHover,
          open ? colors.triggerActive : "bg-white",
          sizeClasses,
        )}
      >
        {icon && <span className={colors.iconColor}>{icon}</span>}
        <span className={cn(open ? colors.textColor : "text-gray-700")}>
          {selectedOption?.label || placeholder}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className={cn(colors.iconColor, "ml-0.5")}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              "absolute z-50 mt-2 min-w-[160px] rounded-xl border p-1.5 overflow-hidden",
              "left-1/2 -translate-x-1/2",
              colors.dropdownBg,
              colors.dropdownBorder,
              colors.dropdownShadow,
            )}
          >
            {options.map((option, index) => (
              <motion.button
                key={option.value}
                type="button"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15, delay: index * 0.04 }}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  "flex items-center gap-2 w-full rounded-lg px-3 py-2.5 text-sm text-left transition-colors duration-150",
                  colors.itemHover,
                  option.value === value ? colors.itemActive : "text-gray-700",
                )}
              >
                {option.icon}
                {option.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
