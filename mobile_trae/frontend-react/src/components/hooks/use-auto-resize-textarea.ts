import { useCallback, useRef } from "react"

interface UseAutoResizeTextareaProps {
  minHeight?: number
  maxHeight?: number
}

export function useAutoResizeTextarea({ minHeight = 56, maxHeight = 200 }: UseAutoResizeTextareaProps = {}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const ta = textareaRef.current
      if (!ta) return
      if (reset) {
        ta.style.height = `${minHeight}px`
        return
      }
      ta.style.height = "0px"
      ta.style.height = `${Math.max(minHeight, Math.min(ta.scrollHeight, maxHeight))}px`
    },
    [minHeight, maxHeight]
  )

  return { textareaRef, adjustHeight }
}
