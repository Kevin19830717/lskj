import { cva } from "class-variance-authority"
import { motion, type HTMLMotionProps } from "framer-motion"
import { cn } from "@/lib/utils"

const waveLoaderVariants = cva("flex gap-2 items-center justify-center", {
  variants: {
    messagePlacement: {
      bottom: "flex-col",
      right: "flex-row",
      left: "flex-row-reverse",
    },
  },
  defaultVariants: {
    messagePlacement: "bottom",
  },
})

export interface WaveLoaderProps {
  bars?: number
  message?: string
  messagePlacement?: "bottom" | "left" | "right"
}

export function WaveLoader({
  bars = 5,
  message,
  messagePlacement,
  className,
  ...props
}: HTMLMotionProps<"div"> & WaveLoaderProps) {
  return (
    <div className={cn(waveLoaderVariants({ messagePlacement }))}>
      <div className="flex gap-1 items-center justify-center">
        {Array(bars)
          .fill(undefined)
          .map((_, index) => (
            <motion.div
              key={index}
              className={cn("w-1.5 h-5 rounded-full bg-[#667eea]", className)}
              animate={{ scaleY: [1, 1.6, 1] }}
              transition={{
                duration: 0.8,
                repeat: Number.POSITIVE_INFINITY,
                delay: index * 0.1,
              }}
              {...props}
            />
          ))}
      </div>
      {message && <div className="text-xs text-gray-400">{message}</div>}
    </div>
  )
}
