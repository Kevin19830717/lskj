import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import AppShell from "@/components/app-shell"
import { cn } from "@/lib/utils"
import { apiGet, apiPost } from "@/lib/api"
import { Send, Sparkles, User, RotateCcw } from "lucide-react"

interface ChatMsg {
  role: "user" | "assistant"
  content: string
}

const API_BASE = import.meta.env.VITE_API_BASE || "/api/v1"

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

export default function AIChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME_MSG])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const isFirstRender = useRef(true)

  // 加载历史聊天记录
  useEffect(() => {
    let cancelled = false
    async function loadHistory() {
      try {
        const res = await apiGet<{ history: ChatMsg[] }>("/ai/chat/history")
        if (!cancelled && res.code === 0 && res.data?.history?.length) {
          setMessages(res.data.history)
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

  // 滚动到底部：首次加载用 instant，后续用 smooth
  useEffect(() => {
    if (!historyLoaded || !scrollRef.current) return
    const el = scrollRef.current
    if (isFirstRender.current) {
      // 首次加载：AppShell 页面切换动画约 450ms，期间 scrollHeight 不稳定，
      // 先立即跳一次，动画结束后再校正一次，确保无可见的"从顶滑到底"
      isFirstRender.current = false
      el.scrollTop = el.scrollHeight
      const timer = setTimeout(() => {
        el.scrollTop = el.scrollHeight
      }, 500)
      return () => clearTimeout(timer)
    } else {
      // 后续新消息平滑滚动
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }
  }, [messages, loading, historyLoaded])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return

    const userMsg: ChatMsg = { role: "user", content }
    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }])
    setInput("")
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = localStorage.getItem("token") || ""
      const res = await fetch(`${API_BASE}/ai/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: content, history }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""
      let fullText = ""

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
            if (data.delta) {
              fullText += data.delta
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: "assistant", content: fullText }
                return next
              })
            } else if (data.error) {
              fullText = fullText || `抱歉，出了一点小问题：${data.error}`
              setMessages((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: "assistant", content: fullText }
                return next
              })
            } else if (data.done) {
              if (!fullText) {
                setMessages((prev) => {
                  const next = [...prev]
                  next[next.length - 1] = { role: "assistant", content: "（回复为空，请重试）" }
                  return next
                })
              }
            }
          } catch {
            // skip invalid JSON
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return
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
      abortRef.current = null
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const resetChat = async () => {
    if (loading && abortRef.current) {
      abortRef.current.abort()
    }
    setMessages([WELCOME_MSG])
    setLoading(false)
    // 调用后端接口清除服务器端的聊天记录和对话状态
    apiPost("/ai/chat/reset").catch(() => {})
  }

  return (
    <AppShell title="AI 健康助手" titleIcon={<Sparkles className="w-6 h-6 text-[#667eea]" />}>
      <div className="flex flex-col h-[calc(100vh-180px)]">
        {/* 消息列表区 */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto pr-2 space-y-5"
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
            >
              {/* 头像：仅用户显示 */}
              {msg.role === "user" && (
                <div className="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white shadow-[0_4px_14px_rgba(102,126,234,0.4)]">
                  <User className="w-5 h-5" />
                </div>
              )}

              {/* 气泡 */}
              <div
                className={cn(
                  "relative max-w-[72%] px-5 py-3.5 rounded-2xl shadow-md",
                  msg.role === "user"
                    ? "bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white rounded-tr-md shadow-[0_4px_16px_rgba(102,126,234,0.25)]"
                    : "bg-white/95 text-gray-700 rounded-tl-md border border-[rgba(200,195,235,0.4)] shadow-[0_4px_16px_rgba(102,126,234,0.08)]"
                )}
              >
                {/* 气泡装饰光晕 */}
                {msg.role === "assistant" && (
                  <div className="absolute -top-2 -left-2 w-16 h-16 bg-[radial-gradient(circle,rgba(250,204,21,0.15)_0%,transparent_70%)] rounded-full pointer-events-none" />
                )}
                <div className="relative whitespace-pre-wrap text-[14px] leading-relaxed break-words">
                  {msg.content}
                  {/* 流式输出光标 */}
                  {loading && idx === messages.length - 1 && msg.role === "assistant" && (
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-[#667eea] animate-pulse align-text-bottom" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 快捷问题 */}
        {messages.length <= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-wrap gap-2 py-3"
          >
            {quickQuestions.map((q) => (
              <button
                key={q.text}
                onClick={() => send(q.text)}
                className="group flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/70 backdrop-blur-sm border border-[rgba(102,126,234,0.25)] text-sm text-gray-600 hover:bg-gradient-to-r hover:from-[#667eea]/10 hover:to-[#764ba2]/10 hover:border-[#667eea]/40 hover:text-[#3730a3] transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
              >
                <span className="text-base">{q.icon}</span>
                <span>{q.text}</span>
              </button>
            ))}
          </motion.div>
        )}

        {/* 输入区 */}
        <div className="pt-3">
          <div className="flex items-end gap-2.5">
            <button
              onClick={resetChat}
              title="重置对话"
              className="flex-shrink-0 w-11 h-11 rounded-2xl bg-white/70 backdrop-blur-sm border border-[rgba(200,195,235,0.4)] text-gray-500 hover:text-[#667eea] hover:border-[#667eea]/40 transition-all duration-300 flex items-center justify-center hover:shadow-md"
            >
              <RotateCcw className="w-4.5 h-4.5" />
            </button>
            <div className="flex-1 relative">
              <div className="absolute inset-0 bg-gradient-to-r from-[#667eea]/8 to-[#764ba2]/8 rounded-2xl blur-sm" />
              <div className="relative flex items-end gap-2 bg-white/85 backdrop-blur-md rounded-2xl border border-[rgba(200,195,235,0.45)] shadow-[0_4px_20px_rgba(102,126,234,0.1)] p-2 pl-4 focus-within:border-[#667eea]/50 focus-within:shadow-[0_4px_24px_rgba(102,126,234,0.18)] transition-all duration-300">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入你的健康问题... (Enter 发送, Shift+Enter 换行)"
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-[14px] text-gray-700 placeholder:text-gray-400 outline-none max-h-32 py-2 leading-relaxed"
                  style={{ minHeight: "24px" }}
                />
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => send()}
                  disabled={!input.trim() || loading}
                  className={cn(
                    "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
                    input.trim() && !loading
                      ? "bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white shadow-[0_4px_14px_rgba(102,126,234,0.4)] hover:shadow-[0_6px_20px_rgba(102,126,234,0.55)]"
                      : "bg-gray-100 text-gray-300 cursor-not-allowed"
                  )}
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-2.5">
            AI 助手基于你的饮食数据提供个性化建议 · 仅供健康参考，不替代专业医疗诊断
          </p>
        </div>
      </div>
    </AppShell>
  )
}
