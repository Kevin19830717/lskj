import { CornerRightUp } from "lucide-react"
import { useState } from "react"
import { motion } from "framer-motion"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useAutoResizeTextarea } from "@/components/hooks/use-auto-resize-textarea"

interface AIInputWithLoadingProps {
  id?: string
  placeholder?: string
  minHeight?: number
  maxHeight?: number
  /** AI 是否正在回复（从外部传入，精准控制动画停止） */
  externalLoading?: boolean
  onSubmit?: (value: string) => void | Promise<void>
  className?: string
}

export function AIInputWithLoading({
  id = "ai-input",
  placeholder = "输入你的问题...",
  minHeight = 56,
  maxHeight = 200,
  externalLoading = false,
  onSubmit,
  className,
}: AIInputWithLoadingProps) {
  const [inputValue, setInputValue] = useState("")
  const [submitted, setSubmitted] = useState(false)

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight,
    maxHeight,
  })

  const isAnimating = submitted && externalLoading

  // 当 AI 回复结束，自动停止动画
  if (submitted && !externalLoading) {
    // 用 setTimeout 避免在 render 里直接 setState
    setTimeout(() => setSubmitted(false), 0)
  }

  const handleSubmit = async () => {
    if (!inputValue.trim() || submitted || externalLoading) return

    setSubmitted(true)
    await onSubmit?.(inputValue)
    setInputValue("")
    adjustHeight(true)
  }

  const hasText = inputValue.trim().length > 0

  return (
    <div className={cn("w-full", className)}>
      <div className="relative w-full">
        <Textarea
          id={id}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-2xl pl-5 pr-14 py-3.5",
            "placeholder:text-gray-400",
            "border border-[rgba(200,195,235,0.4)] bg-white/85 backdrop-blur-md",
            "focus:border-[#667eea]/50 focus:ring-2 focus:ring-[#667eea]/15",
            "text-gray-700 resize-none text-sm",
            "shadow-[0_4px_20px_rgba(102,126,234,0.08)]"
          )}
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            adjustHeight()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          disabled={submitted || externalLoading}
        />
        {/* 发送按钮：灰色圆 → 紫色方块旋转 → 灰色圆 */}
        <motion.button
          onClick={handleSubmit}
          disabled={submitted || (!hasText && !externalLoading)}
          className="absolute right-3 bottom-3"
          type="button"
          animate={{
            borderRadius: isAnimating ? "8px" : "50%",
            backgroundColor: isAnimating ? "#667eea" : (hasText ? "#667eea" : "#e5e7eb"),
            // 步进旋转：转90°花1s → 停1s → 转90°花1s... 8s一个完整360°
            rotate: isAnimating ? [0, 0, 90, 90, 180, 180, 270, 270, 360, 360] : 0,
            opacity: isAnimating || hasText ? 1 : 0.6,
          }}
          transition={
            isAnimating
              ? {
                  rotate: {
                    duration: 8,
                    times: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.975, 1],
                    repeat: Infinity,
                    ease: "easeInOut",
                  },
                  borderRadius: { duration: 0.8, ease: "easeInOut" },
                  backgroundColor: { duration: 0.8, ease: "easeInOut" },
                }
              : {
                  rotate: { duration: 0.5, ease: "easeInOut" },
                  borderRadius: { duration: 0.8, ease: "easeInOut" },
                  backgroundColor: { duration: 0.8, ease: "easeInOut" },
                }
          }
          style={{
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            outline: "none",
          }}
        >
          {isAnimating ? (
            <div className="w-3.5 h-3.5 bg-white rounded-[2px]" />
          ) : (
            <CornerRightUp className="w-4 h-4" style={{ color: hasText ? "#fff" : "#9ca3af" }} />
          )}
        </motion.button>
      </div>
    </div>
  )
}
