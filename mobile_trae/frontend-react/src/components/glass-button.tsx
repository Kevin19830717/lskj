import * as React from "react"
import { cn } from "@/lib/utils"

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  theme?: "green" | "purple"
  size?: "default" | "sm" | "lg" | "icon"
}

const sizeMap = {
  default: "text-base px-6 py-3.5",
  sm: "text-sm px-4 py-2",
  lg: "text-lg px-8 py-4",
  icon: "h-10 w-10 flex items-center justify-center",
}

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, theme = "green", size = "default", disabled, ...props }, ref) => {
    const isGreen = theme === "green"
    // 主题色：绿色用绿色系，紫色用紫色系
    const glowColor = isGreen ? "34, 197, 94" : "102, 126, 234"
    const borderColor = isGreen ? "rgba(34, 197, 94, 0.4)" : "rgba(102, 126, 234, 0.4)"
    const borderColorHover = isGreen ? "rgba(34, 197, 94, 0.7)" : "rgba(102, 126, 234, 0.7)"
    const textColor = isGreen ? "#15803d" : "#4f46e5"
    const textColorHover = isGreen ? "#166534" : "#3730a3"

    return (
      <>
        <style>{`
          .glass-btn-wrap-${theme} {
            position: relative;
            display: inline-block;
          }
          .glass-btn-${theme} {
            position: relative;
            all: unset;
            cursor: ${disabled ? "not-allowed" : "pointer"};
            border-radius: 9999px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            background: rgba(255, 255, 255, 0.55);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1.5px solid ${borderColor};
            box-shadow:
              0 4px 16px rgba(${glowColor}, 0.15),
              inset 0 1px 1px rgba(255, 255, 255, 0.5),
              inset 0 -1px 1px rgba(${glowColor}, 0.1);
            color: ${textColor};
            font-weight: 500;
            letter-spacing: -0.02em;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            opacity: ${disabled ? 0.5 : 1};
          }
          .glass-btn-${theme}:hover {
            background: rgba(255, 255, 255, 0.75);
            border-color: ${borderColorHover};
            box-shadow:
              0 8px 28px rgba(${glowColor}, 0.25),
              inset 0 1px 1px rgba(255, 255, 255, 0.6),
              inset 0 -1px 1px rgba(${glowColor}, 0.15);
            color: ${textColorHover};
            transform: translateY(-1px);
          }
          .glass-btn-${theme}:active {
            transform: translateY(0px);
            box-shadow:
              0 2px 8px rgba(${glowColor}, 0.2),
              inset 0 1px 2px rgba(${glowColor}, 0.15);
          }
          .glass-btn-shadow-${theme} {
            position: absolute;
            inset: 0;
            border-radius: 9999px;
            background: radial-gradient(ellipse at top, rgba(${glowColor}, 0.12) 0%, transparent 70%);
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
            z-index: -1;
          }
          .glass-btn-wrap-${theme}:hover .glass-btn-shadow-${theme} {
            opacity: 1;
          }
        `}</style>
        <div className={cn(`glass-btn-wrap-${theme}`, className)}>
          <button
            ref={ref}
            className={`glass-btn-${theme} ${sizeMap[size]}`}
            disabled={disabled}
            {...props}
          >
            {children}
          </button>
          <div className={`glass-btn-shadow-${theme}`}></div>
        </div>
      </>
    )
  }
)

GlassButton.displayName = "GlassButton"
