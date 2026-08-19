import { useCallback, useRef, useState, type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { UploadCloud, FileText, RefreshCw, Activity, AlertCircle } from "lucide-react"
import { WaveLoader } from "@/components/wave-loader"

interface ReportUploadProps {
  /** 正在解析（调后端） */
  parsing: boolean
  /** 解析错误信息 */
  error: string | null
  /** 选择文件并点击「开始解析」 */
  onParse: (file: File) => void
  /** 重新上传 */
  onReset: () => void
  /** 替换默认的「AI 就绪，等待报告」占位（如历史报告卡片） */
  footer?: ReactNode
}

/** 体检报告上传区：拖拽/点选 -> 预览 -> 解析（ECG 心电动画） */
export function ReportUpload({ parsing, error, onParse, onReset, footer }: ReportUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pick = useCallback((f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith("image/")) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = () => setPreview(String(reader.result))
    reader.readAsDataURL(f)
  }, [])

  if (parsing) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-green-200/60 bg-gray-950 shadow-lg">
        {/* ECG 心电监护网格 */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(16,185,129,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.25) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative flex h-64 flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-2 text-emerald-400">
            <Activity className="h-5 w-5 animate-pulse" />
            <span className="font-mono text-sm tracking-widest">正在解析体检报告…</span>
          </div>
          {/* 心电波形 */}
          <svg viewBox="0 0 300 60" className="h-16 w-72">
            <motion.polyline
              points="0,30 40,30 50,30 55,12 60,48 65,30 90,30 100,30 105,12 110,48 115,30 150,30 160,30 165,12 170,48 175,30 210,30 220,30 225,12 230,48 235,30 300,30"
              fill="none"
              stroke="#34d399"
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0.2 }}
              animate={{ pathLength: [0, 1], opacity: 1 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
            />
            {/* 扫描竖线 */}
            <motion.line
              y1="4" y2="56"
              stroke="rgba(52,211,153,0.8)"
              strokeWidth="1.5"
              initial={{ x: 0 }}
              animate={{ x: 300 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
            />
          </svg>
          <div className="font-mono text-xs text-emerald-600/80">
            多模态 OCR 提取指标 → 规则引擎风险分层
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="wait">
        {file && preview ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-green-200/70 bg-white/80 p-4 shadow-sm backdrop-blur"
          >
            <div className="flex items-center gap-4">
              <img
                src={preview}
                alt="报告预览"
                className="h-24 w-20 rounded-lg border border-green-100 object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  <FileText className="h-4 w-4 shrink-0 text-green-600" />
                  <span className="truncate">{file.name}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {(file.size / 1024).toFixed(0)} KB · 点击「开始解析」进行多模态识别
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onParse(file)}
                    className="rounded-lg bg-gradient-to-r from-green-600 to-emerald-500 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-95"
                  >
                    开始解析
                  </button>
                  <button
                    onClick={() => {
                      setFile(null)
                      setPreview(null)
                      onReset()
                    }}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
                  >
                    <RefreshCw className="h-3 w-3" />
                    重选
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="picker"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              pick(e.dataTransfer.files?.[0])
            }}
            onClick={() => inputRef.current?.click()}
            className={
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition " +
              (dragging
                ? "border-green-500 bg-green-50"
                : "border-green-200 bg-white/70 hover:border-green-400 hover:bg-green-50/50")
            }
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="rounded-full bg-gradient-to-br from-green-100 to-emerald-50 p-4"
            >
              <UploadCloud className="h-8 w-8 text-green-600" />
            </motion.div>
            <div>
              <p className="text-sm font-medium text-gray-800">上传体检报告照片</p>
              <p className="mt-1 text-xs text-gray-500">点击选择或拖拽到此处 · 支持 JPG / PNG</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </motion.div>
      )}

      {parsing === false && !file && (
        footer ?? (
          <div className="flex justify-center">
            <WaveLoader bars={5} message="AI 就绪，等待报告" />
          </div>
        )
      )}
    </div>
  )
}
