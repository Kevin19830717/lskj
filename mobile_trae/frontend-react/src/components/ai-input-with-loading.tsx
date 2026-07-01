import { CornerRightUp, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react"
import { useRef, useState } from "react"
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
  /** 文件上传支持 */
  attachedFile?: File | null
  onFileSelect?: (file: File) => void
  onFileClear?: () => void
  /** 文件上传中状态 */
  uploading?: boolean
}

export function AIInputWithLoading({
  id = "ai-input",
  placeholder = "输入你的问题...",
  minHeight = 56,
  maxHeight = 200,
  externalLoading = false,
  onSubmit,
  className,
  attachedFile = null,
  onFileSelect,
  onFileClear,
  uploading = false,
}: AIInputWithLoadingProps) {
  const [inputValue, setInputValue] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    if (submitted || externalLoading || uploading) return
    if (!inputValue.trim() && !attachedFile) return

    setSubmitted(true)
    await onSubmit?.(inputValue)
    setInputValue("")
    adjustHeight(true)
  }

  const hasText = inputValue.trim().length > 0
  const canSend = hasText || !!attachedFile

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect?.(file)
    }
    // 重置 input 的 value 以便重复选择同一文件
    e.target.value = ""
  }

  const isImage = attachedFile?.type.startsWith("image/")

  return (
    <div className={cn("w-full", className)}>
      {/* 附件预览条 */}
      {attachedFile && (
        <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-[#667eea]/30 bg-[#667eea]/5 px-2.5 py-1.5">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#667eea]/10">
            {isImage ? <ImageIcon className="h-3.5 w-3.5 text-[#667eea]" /> : <FileText className="h-3.5 w-3.5 text-[#667eea]" />}
          </div>
          <span className="flex-1 truncate text-[11px] lg:text-xs text-gray-600 font-medium">{attachedFile.name}</span>
          {uploading ? (
            <span className="text-[10px] lg:text-[11px] text-[#667eea] font-medium">解析中...</span>
          ) : (
            <button
              type="button"
              onClick={onFileClear}
              className="flex-shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="relative w-full">
        <Textarea
          id={id}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-2xl pr-12 lg:pr-14 py-2.5 lg:py-3.5",
            onFileSelect ? "pl-10 lg:pl-12" : "pl-4 lg:pl-5",
            "placeholder:text-gray-400",
            "border border-[rgba(200,195,235,0.4)] bg-white/85 backdrop-blur-md",
            "focus:border-[#667eea]/50 focus:ring-2 focus:ring-[#667eea]/15",
            "text-gray-700 resize-none text-[13px] lg:text-sm",
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
        {/* 文件上传按钮 */}
        {onFileSelect && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitted || externalLoading || uploading}
            className="absolute left-2 bottom-2 lg:left-2.5 lg:bottom-3 flex h-7 w-7 lg:h-8 lg:w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-[#667eea]/10 hover:text-[#667eea] transition-colors disabled:opacity-40"
            title="上传文件"
          >
            <Paperclip className="h-4 w-4 lg:h-4.5 lg:w-4.5" />
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,text/plain,text/markdown,text/csv,application/json,.txt,.md,.csv,.json,.html,.htm,.log"
          onChange={handleFileChange}
        />
        {/* 发送按钮：灰色圆 → 紫色方块旋转 → 灰色圆 */}
        <motion.button
          onClick={handleSubmit}
          disabled={submitted || (!canSend && !externalLoading) || uploading}
          className="absolute right-2 bottom-2 lg:right-3 lg:bottom-3"
          type="button"
          animate={{
            borderRadius: isAnimating ? "8px" : "50%",
            backgroundColor: isAnimating ? "#667eea" : (canSend ? "#667eea" : "#e5e7eb"),
            // 步进旋转：转90°花1s → 停1s → 转90°花1s... 8s一个完整360°
            rotate: isAnimating ? [0, 0, 90, 90, 180, 180, 270, 270, 360, 360] : 0,
            opacity: isAnimating || canSend ? 1 : 0.6,
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
            width: 30,
            height: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            outline: "none",
          }}
        >
          {isAnimating ? (
            <div className="w-3 h-3 bg-white rounded-[2px]" />
          ) : (
            <CornerRightUp className="w-3.5 h-3.5" style={{ color: canSend ? "#fff" : "#9ca3af" }} />
          )}
        </motion.button>
      </div>
    </div>
  )
}
