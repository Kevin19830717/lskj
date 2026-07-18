import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import AppShell from "@/components/app-shell"
import { cn } from "@/lib/utils"
import { apiGet, apiPost, apiUpload } from "@/lib/api"
import { Sparkles, User, RotateCcw, Brain } from "lucide-react"
import { AIInputWithLoading } from "@/components/ai-input-with-loading"

interface ChatMsg {
  role: "user" | "assistant"
  content: string
  thinking?: string
  thinkingDone?: boolean
  images?: string[] // 用户发送的图片 data URL 列表（多模态消息展示用）
}

// 极简风格可折叠思考块（深色主题，自动滚动跟随输出）
function ThinkingBlock({ thinking, isThinking, done, expert }: { thinking: string; isThinking: boolean; done: boolean; expert: boolean }) {
  const [expanded, setExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  // 思考完成时自动折叠
  useEffect(() => {
    if (done) setExpanded(false)
  }, [done])
  // 自动滚动到底部：思考文字更新时跟随流式输出
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [thinking, expanded])

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 text-xs transition-colors mb-1.5",
          expert
            ? "text-white/70 hover:text-white"
            : "text-gray-500 hover:text-gray-900"
        )}
      >
        {/* 单点呼吸光晕 */}
        <span className="relative flex h-2 w-2">
          {isThinking && (
            <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-30", expert ? "bg-white" : "bg-gray-900")} />
          )}
          <span
            className={cn(
              "relative inline-flex rounded-full h-2 w-2 transition-colors duration-300",
              isThinking
                ? (expert ? "bg-white" : "bg-gray-900")
                : (expert ? "bg-white/40" : "bg-gray-400")
            )}
          />
        </span>
        <span className={cn(isThinking && (expert ? "text-white font-medium" : "text-gray-900 font-medium"))}>
          {isThinking ? "正在前往信息库查找相关数据" : `已查找完毕 · 点击${expanded ? "收起" : "展开"}`}
        </span>
        {isThinking && (
          <span className="inline-flex items-end gap-[2px] h-3 ml-0.5">
            <span className={cn("w-[2px] rounded-full animate-[thinkbar_1.2s_ease-in-out_infinite]", expert ? "bg-white" : "bg-gray-900")} style={{ animationDelay: "0ms", height: "40%" }} />
            <span className={cn("w-[2px] rounded-full animate-[thinkbar_1.2s_ease-in-out_infinite]", expert ? "bg-white" : "bg-gray-900")} style={{ animationDelay: "150ms", height: "70%" }} />
            <span className={cn("w-[2px] rounded-full animate-[thinkbar_1.2s_ease-in-out_infinite]", expert ? "bg-white" : "bg-gray-900")} style={{ animationDelay: "300ms", height: "50%" }} />
            <span className={cn("w-[2px] rounded-full animate-[thinkbar_1.2s_ease-in-out_infinite]", expert ? "bg-white" : "bg-gray-900")} style={{ animationDelay: "450ms", height: "85%" }} />
          </span>
        )}
      </button>
      {expanded && (
        <div
          ref={scrollRef}
          className={cn(
            "mt-1 pl-3 border-l-2 text-xs leading-relaxed whitespace-pre-wrap max-h-44 overflow-y-auto",
            expert
              ? "border-white/20 text-white/80"
              : "border-gray-200 text-gray-500"
          )}
        >
          {thinking}
          {isThinking && (
            <span className={cn("inline-block w-[2px] h-3 ml-0.5 animate-pulse align-text-bottom", expert ? "bg-white" : "bg-gray-900")} />
          )}
        </div>
      )}
    </div>
  )
}

const API_BASE = import.meta.env.VITE_API_BASE || "/api/v1"

// 根据 API_BASE 计算 origin，用于把 /uploads/... 这类相对 URL 补成绝对 URL
// （APK/WebView 中前端 host 与后端不一致，相对路径会指向 App 本地，导致图片不显示）
function apiOrigin(): string {
  try {
    if (API_BASE.startsWith("http://") || API_BASE.startsWith("https://")) {
      const u = new URL(API_BASE)
      return `${u.protocol}//${u.host}`
    }
  } catch { /* 忽略 */ }
  return ""
}

// 把图片 URL 正规化：相对路径（/uploads、./、不以 http 开头）补成绝对 URL
// 绝对 URL 直接返回
export function resolveImageUrl(url: string): string {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith("//")) return location.protocol + url
  const origin = apiOrigin()
  if (!origin) return url // 纯网页端：仍走相对路径（同源）
  if (url.startsWith("/")) return origin + url
  return origin + "/" + url
}

// 读取文件为 base64 data URL（供多模态聊天直传图片）
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// 从消息内容中解析 [IMG:url] 标记，返回清理后的文本和图片URL列表
function parseImageMarkers(content: string): { text: string; images: string[] } {
  const images: string[] = []
  const text = content.replace(/\[IMG:(https?:\/\/[^\]]+|\/[^\]]+)\]/g, (_, url) => {
    images.push(resolveImageUrl(url))
    return ""
  }).replace(/\n{3,}/g, "\n\n").trim()
  return { text, images }
}

// 从消息内容中移除 [IMG:url] 标记（用于发送历史给AI时清理）
function stripImageMarkers(content: string): string {
  return content.replace(/\[IMG:[^\]]+\]/g, "").replace(/\n{3,}/g, "\n\n").trim()
}

const WELCOME_MSG: ChatMsg = {
  role: "assistant",
  content: "你好呀！我是你的 AI 健康助手 🌿\n\n我可以帮你分析饮食营养、推荐健康食谱、解答健康疑问。基于你最近的饮食数据，我会给出个性化的建议。\n\n有什么想聊的吗？",
}

const quickQuestions = [
  { icon: "🥗", text: "分析我最近的饮食营养" },
  { icon: "💪", text: "如何增加蛋白质摄入？" },
  { icon: "⚖️", text: "减脂期该怎么吃？" },
  { icon: "🌙", text: "晚餐吃什么更健康？" },
  { icon: "🍎", text: "推荐几种低卡零食" },
  { icon: "🥦", text: "素食者如何均衡营养？" },
]

// ===== 模块级变量：SSE 流不绑定组件生命周期，SPA 内切换页面不中断 =====
let _bgAbortController: AbortController | null = null
let _bgFullText = ""
let _bgFullThinking = ""
let _bgRunning = false

// 模块级回调：组件挂载时注册，从后台流推送 UI 更新
type StreamCB = (msg: { type: "thinking" | "text" | "thinking_end" | "done" | "error"; data?: string }) => void
let _streamCB: StreamCB | null = null
function _emit(msg: { type: "thinking" | "text" | "thinking_end" | "done" | "error"; data?: string }) {
  if (_streamCB) _streamCB(msg)
}

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME_MSG])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [mode, setMode] = useState<"fast" | "expert">(() => {
    return (localStorage.getItem("ai_chat_mode") as "fast" | "expert") || "fast"
  })
  const [thinking, setThinking] = useState(false)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  // 模式变化时持久化
  useEffect(() => {
    localStorage.setItem("ai_chat_mode", mode)
  }, [mode])
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isFirstRender = useRef(true)

  // 加载历史聊天记录（如果后台 SSE 正在跑则跳过，避免覆盖实时流状态）
  useEffect(() => {
    let cancelled = false
    async function loadHistory() {
      // 方案B：后台流正在跑时，不加载数据库历史（数据还没落库，加载的是旧的）
      if (_bgRunning) {
        if (!cancelled) setHistoryLoaded(true)
        return
      }
      try {
        const res = await apiGet<{ history: ChatMsg[] }>("/ai/chat/history")
        if (!cancelled && res.code === 0 && res.data?.history?.length) {
          const history = res.data.history
          // 解析历史消息中的 [IMG:url] 标记，恢复图片显示（跨端支持）
          const parsed = history.map((msg) => {
            if (msg.role === "user") {
              const { images } = parseImageMarkers(msg.content)
              return images.length > 0 ? { ...msg, images } : msg
            }
            return msg
          })
          // 若最后一条是孤立的用户消息（后台流未在跑但消息不完整），提示用户重发
          const last = parsed[parsed.length - 1]
          if (last && last.role === "user") {
            const trimmed = parsed.slice(0, -1)
            setMessages(trimmed)
            setHistoryLoaded(true)
            try { await apiPost("/ai/chat/delete-last-user") } catch { /* 忽略 */ }
            trimmed.push({ role: "assistant", content: "⏳ 上次对话中断，请重新发送您的问题。" })
            setMessages(trimmed)
            return
          }
          setMessages(parsed)
        }
      } catch {
        // 忽略错误，使用欢迎消息
      } finally {
        if (!cancelled) {
          setHistoryLoaded(true)
        }
      }
    }
    loadHistory()
    return () => { cancelled = true }
  }, [])

  // ===== 方案B：注册模块级回调 + 检查后台流 =====
  useEffect(() => {
    // 注册回调：后台 SSE 有数据时推送给当前组件实例
    _streamCB = (msg) => {
      if (msg.type === "thinking") {
        setThinking(true)
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === "assistant") {
            next[next.length - 1] = { role: "assistant", content: "", thinking: _bgFullThinking, thinkingDone: false }
          }
          return next
        })
      } else if (msg.type === "thinking_end") {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, thinkingDone: true }
          }
          return next
        })
      } else if (msg.type === "text") {
        setThinking(false)
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, content: _bgFullText, thinking: _bgFullThinking || undefined, thinkingDone: true }
          }
          return next
        })
      } else if (msg.type === "done") {
        setThinking(false)
        setLoading(false)
      } else if (msg.type === "error") {
        setThinking(false)
        setLoading(false)
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === "assistant" && !last.content) {
            next[next.length - 1] = { role: "assistant", content: msg.data || "请求失败" }
          }
          return next
        })
      }
    }

    // 组件重新挂载时：如果后台流在跑，重建完整的消息列表（历史 + 当前流状态）
    if (_bgRunning) {
      setLoading(true)
      setThinking(_bgFullText === "")
      // 从数据库加载历史，然后追加当前正在生成的 assistant 消息
      ;(async () => {
        try {
          const res = await apiGet<{ history: ChatMsg[] }>("/ai/chat/history")
          if (res.code === 0 && res.data?.history?.length) {
            const parsed = res.data.history.map((msg) => {
              if (msg.role === "user") {
                const { images } = parseImageMarkers(msg.content)
                return images.length > 0 ? { ...msg, images } : msg
              }
              return msg
            })
            // 最后一条如果是孤立的 user（后台流触发的），追加当前 assistant 状态
            const last = parsed[parsed.length - 1]
            if (last && last.role === "user") {
              parsed.push({
                role: "assistant",
                content: _bgFullText,
                thinking: _bgFullThinking || undefined,
                thinkingDone: _bgFullText ? true : false,
              })
            } else if (last && last.role === "assistant" && !last.content && _bgFullText) {
              // 最后一条是空的 assistant 占位，用当前流内容替换
              parsed[parsed.length - 1] = {
                role: "assistant",
                content: _bgFullText,
                thinking: _bgFullThinking || undefined,
                thinkingDone: true,
              }
            }
            setMessages(parsed)
          } else {
            // 没有历史，创建一个占位 assistant 消息
            setMessages([
              { role: "user", content: "..." },
              {
                role: "assistant",
                content: _bgFullText,
                thinking: _bgFullThinking || undefined,
                thinkingDone: _bgFullText ? true : false,
              },
            ])
          }
        } catch {
          // 忽略
        }
      })()
    }

    return () => {
      _streamCB = null
    }
  }, [])

  // 滚动到底部：用 useLayoutEffect 在浏览器绘制前同步设置，避免"从顶滑到底"
  useLayoutEffect(() => {
    if (!historyLoaded || !scrollRef.current) return
    const el = scrollRef.current
    if (isFirstRender.current) {
      isFirstRender.current = false
      el.scrollTop = el.scrollHeight
      // AppShell 页面切换动画约 450ms，动画结束后再校正一次确保位置准确
      const timer = setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }, 500)
      return () => clearTimeout(timer)
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, loading, historyLoaded])

  const send = async (text?: string) => {
    const rawContent = (text ?? input).trim()
    if ((!rawContent && !attachedFile) || loading) return

    const file = attachedFile
    const isImage = file?.type.startsWith("image/")

    // 图片：上传到服务器获取URL(跨端显示) + 转base64(发给AI)
    // 文本文件：先上传解析为文本，再拼接到消息中
    let fileText = ""
    let imageUrls: string[] = []  // 服务器URL（用于展示和历史记录）
    let aiImages: string[] = []   // base64 data URL（仅用于当前AI请求）
    if (file) {
      if (isImage) {
        setUploading(true)
        try {
          // 1. 上传到服务器获取URL（持久化，跨端可访问）
          const uploadRes = await apiUpload<{ url?: string }>("/ai/chat/upload-image", file, "file")
          if (uploadRes.code === 0 && uploadRes.data?.url) {
            imageUrls.push(uploadRes.data.url)
          }
          // 2. 转 base64 给AI（当前请求用，不持久化）
          aiImages = [await readFileAsDataURL(file)]
        } catch {
          fileText = `\n\n[图片上传失败: ${file.name}]`
        } finally {
          setUploading(false)
          setAttachedFile(null)
        }
      } else {
        // 文本文件走解析接口
        setUploading(true)
        try {
          const res = await apiUpload<{ text?: string; file_name?: string; file_type?: string }>(
            "/ai/chat/upload-file",
            file,
            "file"
          )
          if (res.code === 0 && res.data?.text) {
            fileText = `\n\n[附件: ${res.data.file_name || file.name}]\n${res.data.text}`
          } else {
            fileText = `\n\n[附件解析失败: ${file.name}]`
          }
        } catch {
          fileText = `\n\n[附件上传失败: ${file.name}]`
        } finally {
          setUploading(false)
          setAttachedFile(null)
        }
      }
    }

    // 消息内容 = 用户文本 + 文本附件 + [IMG:url] 标记（标记会存入数据库，跨端可解析）
    const imgMarkers = imageUrls.map(url => `[IMG:${url}]`).join("")
    const content = (rawContent + fileText + (imgMarkers ? `\n${imgMarkers}` : "")).trim()
    if (!content && aiImages.length === 0) return

    // 用户气泡：文本 + 图片URL列表（图片在气泡内展示）
    const resolvedImageUrls = imageUrls.map((u) => resolveImageUrl(u))
    const userMsg: ChatMsg = {
      role: "user",
      content,
      images: resolvedImageUrls.length > 0 ? resolvedImageUrls : undefined,
    }
    // 发送给AI的历史：移除 [IMG:url] 标记（AI不需要看到旧图片的URL）
    const history = messages.map((m) => ({ role: m.role, content: stripImageMarkers(m.content) }))
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "", thinking: "" }])
    setInput("")
    setLoading(true)
    // 专家模式立即显示"正在深度思考"占位符，避免十秒空窗期
    setThinking(mode === "expert")

    // ===== 方案B：模块级 AbortController，组件卸载不中断 SSE =====
    // 如果上一个流还在跑，先 abort（防止并发冲突）
    if (_bgAbortController) {
      _bgAbortController.abort()
    }
    _bgAbortController = new AbortController()
    _bgFullText = ""
    _bgFullThinking = ""
    _bgRunning = true

    const controller = _bgAbortController

    try {
      const token = localStorage.getItem("token") || ""
      const res = await fetch(`${API_BASE}/ai/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: content, history, mode, images: aiImages }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          const dataStr = line.slice(5).trim()
          if (!dataStr) continue

          try {
            const data = JSON.parse(dataStr)
            if (data.thinking_delta) {
              _bgFullThinking += data.thinking_delta
              _emit({ type: "thinking", data: data.thinking_delta })
            }
            if (data.thinking_end) {
              _emit({ type: "thinking_end" })
            }
            if (data.delta) {
              _bgFullText += data.delta
              _emit({ type: "text", data: data.delta })
            } else if (data.error) {
              _bgFullText = _bgFullText || `抱歉，出了一点小问题：${data.error}`
              _emit({ type: "error", data: _bgFullText })
            } else if (data.done) {
              _emit({ type: "done" })
            }
          } catch {
            // skip invalid JSON
          }
        }
      }

      // SSE 正常结束
      _bgRunning = false
      _emit({ type: "done" })

    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // 用户主动点"重置"才 abort，这里只是标记后台流结束
        _bgRunning = false
        return
      }
      // 网络错误：如果后台流还在跑（组件已卸载），忽略 UI 更新
      _bgRunning = false
      _emit({ type: "error", data: "网络连接失败，请检查网络后重试" })
    } finally {
      _bgAbortController = null
      // 组件还在的话更新 loading 状态
      setLoading(false)
      setThinking(false)
      inputRef.current?.focus()
    }
  }

  const resetChat = async () => {
    // 方案B：用模块级 abort 停止后台流
    if (_bgAbortController) {
      _bgAbortController.abort()
      _bgAbortController = null
    }
    _bgRunning = false
    _bgFullText = ""
    _bgFullThinking = ""
    setMessages([WELCOME_MSG])
    setLoading(false)
    setThinking(false)
    // 调用后端接口清除服务器端的聊天记录和对话状态
    apiPost("/ai/chat/reset").catch(() => {})
  }

  return (
    <AppShell title="AI 健康助手" titleIcon={<Sparkles className="w-6 h-6 text-[#667eea]" />}>
      <div className="flex flex-col h-[calc(100vh-100px)] lg:h-[calc(100vh-180px)]">
        {/* 模式切换 + 重置记录 */}
        <div className="flex items-center gap-2 mb-2 lg:mb-3">
          <div className="flex-1" />
          {/* 专家模式 toggle 开关 */}
          <motion.button
            onClick={() => setMode(mode === "expert" ? "fast" : "expert")}
            className={cn(
              "group relative flex items-center gap-1 pl-1.5 pr-2 py-0.5 lg:gap-2.5 lg:pl-3 lg:pr-4 lg:py-2 rounded-full text-[11px] lg:text-xs font-medium transition-all duration-500 ease-out shadow-sm border",
              mode === "expert"
                ? "bg-gradient-to-r from-[#667eea] to-[#764ba2] border-[#667eea] text-white shadow-[0_2px_12px_rgba(102,126,234,0.35)]"
                : "bg-white/70 backdrop-blur-sm border-[rgba(200,195,235,0.4)] text-gray-500 hover:text-gray-900 hover:border-gray-700"
            )}
            whileTap={{ scale: 0.93 }}
            whileHover={{ scale: 1.03 }}
            title={mode === "expert" ? "专家模式已开启：深度思考，详尽分析。点击切回快速模式" : "当前快速模式：简洁直接。点击开启专家模式深度思考"}
          >
            {/* 专家模式激活时的呼吸光晕 */}
            {mode === "expert" && (
              <motion.span
                className="absolute inset-0 rounded-full"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: [0.2, 0.05, 0.2],
                  boxShadow: [
                    "0 0 0px rgba(102,126,234,0)",
                    "0 0 20px rgba(102,126,234,0.4)",
                    "0 0 0px rgba(102,126,234,0)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            {mode !== "expert" && (
              <motion.span
                className="absolute inset-0 rounded-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0 }}
              />
            )}
            {/* Toggle 轨道 */}
            <span
              className={cn(
                "relative inline-flex h-4 w-7 lg:h-5 lg:w-9 items-center rounded-full transition-colors duration-300",
                mode === "expert" ? "bg-gradient-to-r from-[#667eea] to-[#764ba2]" : "bg-gray-300"
              )}
            >
              {/* Toggle 滑块 */}
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 lg:h-4 lg:w-4 transform rounded-full bg-white shadow-sm transition-transform duration-300 flex items-center justify-center",
                  mode === "expert" ? "translate-x-3 lg:translate-x-4" : "translate-x-0.5"
                )}
              >
                <Brain className={cn("w-2 h-2 lg:w-2.5 lg:h-2.5 transition-colors duration-300", mode === "expert" ? "text-[#667eea]" : "text-gray-400")} />
              </span>
            </span>
            <span className="flex items-center gap-1">
              <Brain className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
              <span>专家模式</span>
            </span>
          </motion.button>
          {/* 重置记录按钮 — 与专家模式同行，右对齐，等高 */}
          <div className="flex-1 flex justify-end">
            <button
              onClick={resetChat}
              title="清除聊天记录"
              className="flex items-center gap-1 py-0.5 lg:py-2 px-2.5 lg:px-4 rounded-full text-[11px] lg:text-xs font-medium bg-white/70 backdrop-blur-sm border border-[rgba(200,195,235,0.4)] text-gray-500 hover:text-[#667eea] hover:border-[#667eea]/40 transition-all duration-300 shadow-sm"
            >
              <RotateCcw className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
              <span>重置记录</span>
            </button>
          </div>
        </div>
        {/* 消息列表区 */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            className="absolute inset-0 overflow-y-auto pr-1 lg:pr-2 space-y-2 lg:space-y-5"
          >
            {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn("flex gap-1.5 lg:gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
            >
              {/* 头像：仅用户显示，专家模式下翻转为白底紫线 */}
              {msg.role === "user" && (
                <div
                  className={cn(
                    "flex-shrink-0 w-6 h-6 lg:w-10 lg:h-10 rounded-xl lg:rounded-2xl flex items-center justify-center shadow-lg transition-all duration-500 ease-out",
                    mode === "expert"
                      ? "bg-white border border-[rgba(200,195,235,0.5)] text-[#667eea] shadow-[0_4px_14px_rgba(102,126,234,0.15)]"
                      : "bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white shadow-[0_4px_14px_rgba(102,126,234,0.4)]"
                  )}
                >
                  <User className="w-3.5 h-3.5 lg:w-5 lg:h-5" />
                </div>
              )}

              {/* 气泡：专家模式助手气泡用深色主题（黑底白字），切换时平滑过渡 */}
              <div
                className={cn(
                  "relative max-w-[85%] lg:max-w-[72%] px-3 py-2 lg:px-5 lg:py-3.5 rounded-xl lg:rounded-2xl shadow-md transition-all duration-500 ease-out",
                  msg.role === "user"
                    ? mode === "expert"
                      ? "bg-white/95 text-gray-700 rounded-tr-md border border-[rgba(200,195,235,0.4)] shadow-[0_4px_16px_rgba(102,126,234,0.08)]"
                      : "bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white rounded-tr-md shadow-[0_4px_16px_rgba(102,126,234,0.25)]"
                    : mode === "expert"
                    ? "bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white rounded-tl-md shadow-[0_4px_16px_rgba(102,126,234,0.25)]"
                    : "bg-white/95 text-gray-700 rounded-tl-md border border-[rgba(200,195,235,0.4)] shadow-[0_4px_16px_rgba(102,126,234,0.08)]"
                )}
              >
                {/* 气泡装饰光晕 */}
                {msg.role === "assistant" && (
                  <div
                    className={cn(
                      "absolute -top-2 -left-2 w-16 h-16 rounded-full pointer-events-none",
                      mode === "expert"
                        ? "bg-[radial-gradient(circle,rgba(255,255,255,0.15)_0%,transparent_70%)]"
                        : "bg-[radial-gradient(circle,rgba(102,126,234,0.12)_0%,transparent_70%)]"
                    )}
                  />
                )}
                <div className="relative text-[13px] lg:text-[14px] leading-relaxed break-words">
                  {/* DeepSeek 风格可折叠思考区 */}
                  {msg.role === "assistant" && msg.thinking && (
                    <ThinkingBlock
                      thinking={msg.thinking}
                      isThinking={thinking && idx === messages.length - 1 && !msg.content}
                      done={!!msg.thinkingDone || !!msg.content}
                      expert={mode === "expert"}
                    />
                  )}
                  {/* 思考阶段且尚无思考文字时显示极简占位（专家模式深色） */}
                  {thinking && idx === messages.length - 1 && msg.role === "assistant" && !msg.content && !msg.thinking && (
                    <div className={cn("flex items-center gap-2 text-xs mb-3 font-medium", mode === "expert" ? "text-white" : "text-gray-900")}>
                      <span className="relative flex h-2 w-2">
                        <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-30", mode === "expert" ? "bg-white" : "bg-gray-900")} />
                        <span className={cn("relative inline-flex rounded-full h-2 w-2", mode === "expert" ? "bg-white" : "bg-gray-900")} />
                      </span>
                      <span>正在前往信息库查找相关数据</span>
                      <span className="inline-flex items-end gap-[2px] h-3 ml-0.5">
                        <span className={cn("w-[2px] rounded-full animate-[thinkbar_1.2s_ease-in-out_infinite]", mode === "expert" ? "bg-white" : "bg-gray-900")} style={{ animationDelay: "0ms", height: "40%" }} />
                        <span className={cn("w-[2px] rounded-full animate-[thinkbar_1.2s_ease-in-out_infinite]", mode === "expert" ? "bg-white" : "bg-gray-900")} style={{ animationDelay: "150ms", height: "70%" }} />
                        <span className={cn("w-[2px] rounded-full animate-[thinkbar_1.2s_ease-in-out_infinite]", mode === "expert" ? "bg-white" : "bg-gray-900")} style={{ animationDelay: "300ms", height: "50%" }} />
                        <span className={cn("w-[2px] rounded-full animate-[thinkbar_1.2s_ease-in-out_infinite]", mode === "expert" ? "bg-white" : "bg-gray-900")} style={{ animationDelay: "450ms", height: "85%" }} />
                      </span>
                    </div>
                  )}
                  {msg.role === "assistant" ? (
                    <div className={cn(mode === "expert" ? "ds-markdown-dark" : "ds-markdown", "transition-colors duration-500")}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <>
                      {/* 用户消息：先显示图片，再显示文本（文本中剥离 [IMG:url] 标记） */}
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {msg.images.map((imgUrl, imgIdx) => (
                            <img
                              key={imgIdx}
                              src={resolveImageUrl(imgUrl)}
                              alt={`用户上传图片 ${imgIdx + 1}`}
                              loading="lazy"
                              className="rounded-lg max-w-[140px] max-h-[140px] lg:max-w-[200px] lg:max-h-[200px] object-cover border border-white/20"
                              onError={(e) => {
                                // 兜底：图片加载失败时用 API_BASE 的 origin 再试一次
                                const cur = (e.currentTarget as HTMLImageElement).src
                                const origin = apiOrigin()
                                if (!origin) return
                                const fallback = imgUrl.startsWith("/") ? origin + imgUrl : origin + "/" + imgUrl
                                if (fallback !== cur) {
                                  (e.currentTarget as HTMLImageElement).src = fallback
                                }
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {(() => {
                        const { text } = parseImageMarkers(msg.content)
                        return text ? (
                          <div className="whitespace-pre-wrap transition-colors duration-500">{text}</div>
                        ) : null
                      })()}
                    </>
                  )}
                  {/* 流式输出光标 */}
                  {loading && idx === messages.length - 1 && msg.role === "assistant" && msg.content && !thinking && (
                    <span className={cn("inline-block w-[2px] h-4 ml-0.5 animate-pulse align-text-bottom", mode === "expert" ? "bg-white" : "bg-[#667eea]")} />
                  )}
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>

        {/* 快捷问题 */}
        {messages.length <= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-1.5 lg:gap-2 py-1 lg:py-3"
          >
            {quickQuestions.map((q) => (
              <button
                key={q.text}
                onClick={() => send(q.text)}
                className="group flex items-center gap-1 px-2.5 py-1 lg:px-4 lg:py-2 rounded-full bg-white/70 backdrop-blur-sm border border-[rgba(102,126,234,0.25)] text-[11px] lg:text-sm text-gray-600 hover:bg-gradient-to-r hover:from-[#667eea]/10 hover:to-[#764ba2]/10 hover:border-[#667eea]/40 hover:text-[#3730a3] transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
              >
                <span className="text-sm lg:text-base">{q.icon}</span>
                <span>{q.text}</span>
              </button>
            ))}
          </motion.div>
        )}

        {/* 输入区 */}
        <div className="pt-2 pb-1 lg:pt-3 lg:pb-0">
          <div className="flex items-end gap-1.5 lg:gap-2.5">
            <AIInputWithLoading
              placeholder="输入你的健康问题... (Enter 发送, Shift+Enter 换行)"
              minHeight={48}
              maxHeight={150}
              externalLoading={loading}
              onSubmit={async (val) => { setInput(val); send(val) }}
              attachedFile={attachedFile}
              onFileSelect={setAttachedFile}
              onFileClear={() => setAttachedFile(null)}
              uploading={uploading}
            />
          </div>
          <p className="text-center text-[10px] lg:text-[11px] text-gray-400 mt-1.5 lg:mt-2.5">
            AI 助手基于你的饮食数据提供个性化建议 · 仅供健康参考，不替代专业医疗诊断
          </p>
        </div>
      </div>
    </AppShell>
  )
}
