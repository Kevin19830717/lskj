import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import { apiGet, apiPost } from "@/lib/api"
import { Sparkles, User, RotateCcw, Brain, Send, Zap, Trash2 } from "lucide-react"

interface ChatMsg {
  role: "user" | "assistant"
  content: string
  thinking?: string
  thinkingDone?: boolean
}

const API_BASE = import.meta.env.VITE_API_BASE || "/api/v1"

const WELCOME_MSG: ChatMsg = {
  role: "assistant",
  content: "你好呀 🌿\n我是你的 AI 健康助手，可以分析饮食、推荐食谱、解答健康疑问。\n\n有什么想问的吗？",
}

const quickQuestions = [
  { icon: "🥗", text: "分析最近的饮食" },
  { icon: "💪", text: "如何增加蛋白质" },
  { icon: "⚖️", text: "减脂怎么吃" },
  { icon: "🌙", text: "晚餐推荐" },
]

function MiniThinking({ thinking, isThinking, done }: { thinking: string; isThinking: boolean; done: boolean }) {
  const [expanded, setExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (done) setExpanded(false)
  }, [done])
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [thinking, expanded])
  return (
    <div className="mb-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-emerald-600/70 active:text-emerald-700"
      >
        <span className="relative flex h-1.5 w-1.5">
          {isThinking && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 bg-emerald-500" />
          )}
          <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", isThinking ? "bg-emerald-500" : "bg-emerald-400")} />
        </span>
        <span>{isThinking ? "正在查找数据" : `已查找${expanded ? "·收起" : "·展开"}`}</span>
        {isThinking && (
          <span className="inline-flex items-end gap-[1.5px] h-2.5">
            {[0, 150, 300, 450].map((d, i) => (
              <span
                key={d}
                className="w-[2px] rounded-full bg-emerald-500 animate-[thinkbar_1.2s_ease-in-out_infinite]"
                style={{ animationDelay: `${d}ms`, height: `${[40, 70, 50, 85][i]}%` }}
              />
            ))}
          </span>
        )}
      </button>
      {expanded && (
        <div
          ref={scrollRef}
          className="mt-1 pl-2 border-l border-emerald-200 text-[10px] leading-relaxed whitespace-pre-wrap max-h-24 overflow-y-auto text-gray-500"
        >
          {thinking}
          {isThinking && <span className="inline-block w-[2px] h-2.5 ml-0.5 animate-pulse align-text-bottom bg-emerald-600" />}
        </div>
      )}
    </div>
  )
}

export default function MobileAIChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME_MSG])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [mode, setMode] = useState<"fast" | "expert">(() => {
    return (localStorage.getItem("ai_chat_mode") as "fast" | "expert") || "fast"
  })
  const [thinking, setThinking] = useState(false)
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    localStorage.setItem("ai_chat_mode", mode)
  }, [mode])

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    let cancelled = false
    async function loadHistory() {
      try {
        const res = await apiGet<{ history: ChatMsg[] }>("/ai/chat/history")
        if (!cancelled && res.code === 0 && res.data?.history?.length) {
          const history = res.data.history
          const last = history[history.length - 1]
          if (last && last.role === "user") {
            const trimmed = history.slice(0, -1)
            trimmed.push({ role: "assistant", content: "⏳ 上次对话中断，请重新发送您的问题。" })
            setMessages(trimmed)
            try { await apiPost("/ai/chat/delete-last-user") } catch { /* 忽略 */ }
            return
          }
          setMessages(history)
        }
      } catch {
        // 忽略错误，使用欢迎消息
      } finally {
        if (!cancelled) setHistoryLoaded(true)
      }
    }
    loadHistory()
    return () => { cancelled = true }
  }, [])

  useLayoutEffect(() => {
    if (!historyLoaded || !scrollRef.current) return
    const el = scrollRef.current
    if (isFirstRender.current) {
      isFirstRender.current = false
      el.scrollTop = el.scrollHeight
      const timer = setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }, 300)
      return () => clearTimeout(timer)
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, loading, historyLoaded])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return

    const userMsg: ChatMsg = { role: "user", content }
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "", thinking: "" }])
    setInput("")
    setLoading(true)
    setThinking(mode === "expert")

    const controller = new AbortController()
    abortRef.current = controller

    let fullText = ""
    let fullThinking = ""

    try {
      const token = localStorage.getItem("token") || ""
      const res = await fetch(`${API_BASE}/ai/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: content, history, mode }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
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
              if (!thinking) setThinking(true)
              fullThinking += data.thinking_delta
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: "assistant", content: "", thinking: fullThinking, thinkingDone: false }
                return next
              })
            }
            if (data.thinking_end) {
              setMessages((prev) => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last.role === "assistant") next[next.length - 1] = { ...last, thinkingDone: true }
                return next
              })
            }
            if (data.delta) {
              fullText += data.delta
              if (thinking) setThinking(false)
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: "assistant", content: fullText, thinking: fullThinking || undefined }
                return next
              })
            } else if (data.error) {
              fullText = fullText || `抱歉，出了一点小问题：${data.error}`
              setThinking(false)
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: "assistant", content: fullText }
                return next
              })
            } else if (data.done) {
              setThinking(false)
              if (!fullText && !fullThinking) {
                setMessages((prev) => {
                  const next = [...prev]
                  next[next.length - 1] = { role: "assistant", content: "（回复为空，请重试）" }
                  return next
                })
              }
            }
          } catch { /* skip invalid JSON */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        if (fullText) {
          try { await apiPost("/ai/chat/save-interrupted", { message: content, reply: fullText }) } catch { /* 忽略 */ }
        }
        return
      }
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === "assistant" && !last.content) {
          next[next.length - 1] = { role: "assistant", content: "网络连接失败，请检查网络后重试 🙏" }
        } else {
          next.push({ role: "assistant", content: "网络连接失败，请检查网络后重试 🙏" })
        }
        return next
      })
    } finally {
      setLoading(false)
      setThinking(false)
      abortRef.current = null
    }
  }

  const resetChat = async () => {
    if (loading && abortRef.current) abortRef.current.abort()
    setMessages([WELCOME_MSG])
    setLoading(false)
    setThinking(false)
    setShowMenu(false)
    apiPost("/ai/chat/reset").catch(() => {})
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // 自适应高度的输入框
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 96) + "px"
  }, [input])

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-emerald-50/40 to-white">
      {/* 顶部紧凑工具栏 */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1.5 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-gray-800">AI 健康助手</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* 模式切换胶囊 */}
          <button
            onClick={() => setMode(mode === "expert" ? "fast" : "expert")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all active:scale-95",
              mode === "expert"
                ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm"
                : "bg-white text-gray-500 border border-gray-200"
            )}
          >
            {mode === "expert" ? <Brain className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
            <span>{mode === "expert" ? "专家" : "快速"}</span>
          </button>
          <button
            onClick={() => setShowMenu(true)}
            className="w-7 h-7 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 消息列表区 */}
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto px-3 py-2 space-y-2.5">
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn("flex gap-1.5", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
            >
              {msg.role === "user" && (
                <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-sm">
                  <User className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div
                className={cn(
                  "relative max-w-[78%] px-3 py-2 rounded-2xl shadow-sm",
                  msg.role === "user"
                    ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white rounded-tr-md"
                    : "bg-white text-gray-700 rounded-tl-md border border-gray-100"
                )}
              >
                {msg.role === "assistant" && msg.thinking && (
                  <MiniThinking
                    thinking={msg.thinking}
                    isThinking={thinking && idx === messages.length - 1 && !msg.content}
                    done={!!msg.thinkingDone || !!msg.content}
                  />
                )}
                {thinking && idx === messages.length - 1 && msg.role === "assistant" && !msg.content && !msg.thinking && (
                  <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 bg-emerald-500" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    <span>正在查找数据</span>
                    <span className="inline-flex items-end gap-[1.5px] h-2.5">
                      {[0, 150, 300, 450].map((d, i) => (
                        <span
                          key={d}
                          className="w-[2px] rounded-full bg-emerald-500 animate-[thinkbar_1.2s_ease-in-out_infinite]"
                          style={{ animationDelay: `${d}ms`, height: `${[40, 70, 50, 85][i]}%` }}
                        />
                      ))}
                    </span>
                  </div>
                )}
                {msg.role === "assistant" ? (
                  <div className="ds-markdown text-[13px] leading-relaxed break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</div>
                )}
                {loading && idx === messages.length - 1 && msg.role === "assistant" && msg.content && !thinking && (
                  <span className="inline-block w-[2px] h-3.5 ml-0.5 animate-pulse align-text-bottom bg-emerald-600" />
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 快捷问题 */}
      {messages.length <= 1 && (
        <div className="flex-shrink-0 px-3 pb-1.5">
          <div className="flex flex-wrap gap-1.5">
            {quickQuestions.map((q) => (
              <button
                key={q.text}
                onClick={() => send(q.text)}
                disabled={loading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-emerald-200 text-[11px] text-gray-600 active:scale-95 disabled:opacity-50"
              >
                <span>{q.icon}</span>
                <span>{q.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入区 */}
      <div className="flex-shrink-0 px-2.5 pt-1.5 pb-[max(8px,env(safe-area-inset-bottom))] bg-white/80 backdrop-blur-md border-t border-gray-100">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="输入问题... Enter发送"
            className="flex-1 resize-none bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 text-[13px] leading-relaxed text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-emerald-400 focus:bg-white max-h-24"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-md active:scale-95 disabled:opacity-40 disabled:shadow-none transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 重置确认抽屉 */}
      <AnimatePresence>
        {showMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMenu(false)}
              className="fixed inset-0 bg-black/30 z-40"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl p-4 pb-[max(16px,env(safe-area-inset-bottom))]"
            >
              <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-3" />
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-full bg-red-50 mx-auto mb-2 flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-500" />
                </div>
                <h3 className="text-base font-bold text-gray-800">重置对话</h3>
                <p className="text-xs text-gray-500 mt-1">将清空当前对话记录和上下文</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowMenu(false)}
                  className="flex-1 h-10 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium active:scale-95"
                >
                  取消
                </button>
                <button
                  onClick={resetChat}
                  className="flex-1 h-10 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white text-sm font-medium active:scale-95"
                >
                  确认重置
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
