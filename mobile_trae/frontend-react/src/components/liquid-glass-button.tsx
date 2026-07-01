import React from "react"
import { cn } from "@/lib/utils"

interface LiquidGlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 主色，默认绿色 */
  color?: string
  children: React.ReactNode
}

export function LiquidGlassButton({ color = "#22c55e", children, className, ...props }: LiquidGlassButtonProps) {
  const btnId = React.useId().replace(/:/g, "")
  const colorLight = color + "30"  // 透明度 ~19%
  const colorMid = color + "55"    // 透明度 ~33%
  const colorGlow = color + "40"   // 阴影发光

  return (
    <>
      <style>{`
        .lgb-${btnId} {
          position: relative;
          background: linear-gradient(135deg, ${colorLight} 0%, rgba(255,255,255,0.6) 50%, ${colorMid} 100%);
          backdrop-filter: blur(12px) saturate(1.8);
          -webkit-backdrop-filter: blur(12px) saturate(1.8);
          border: 1.5px solid ${color}55;
          color: #15803d;
          font-weight: 600;
          box-shadow:
            0 4px 16px ${colorGlow},
            inset 0 1px 1px rgba(255,255,255,0.7),
            inset 0 -1px 1px ${color}22;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }
        .lgb-${btnId}:hover {
          background: linear-gradient(135deg, ${colorMid} 0%, rgba(255,255,255,0.7) 50%, ${colorLight} 100%);
          border-color: ${color}99;
          box-shadow:
            0 8px 28px ${colorGlow},
            inset 0 1px 1px rgba(255,255,255,0.8),
            inset 0 -1px 1px ${color}33;
          transform: translateY(-1px);
        }
        .lgb-${btnId}:active {
          transform: translateY(0) scale(0.97);
          box-shadow:
            0 2px 8px ${colorGlow},
            inset 0 1px 2px ${color}33;
        }
        .lgb-${btnId}::before {
          content: '';
          position: absolute;
          top: 0; left: -100%;
          width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent);
          transition: left 0.6s ease;
          pointer-events: none;
        }
        .lgb-${btnId}:hover::before {
          left: 120%;
        }
      `}</style>
      <button
        className={cn("lgb-" + btnId, "cursor-pointer rounded-full px-6 py-2.5 text-sm font-semibold outline-none", className)}
        {...props}
      >
        {children}
      </button>
    </>
  )
}
