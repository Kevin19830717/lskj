import { useEffect } from "react"

interface DeviceTiltOptions {
  /** 最大倾斜角度（度） */
  maxRotate?: number
  /** 悬停放大倍数 */
  scale?: number
}

/**
 * 在触屏设备（无 hover）上用设备方向/重力感应模拟桌面端鼠标悬停的 3D 倾斜效果。
 * 桌面端自动跳过，仍由组件自身的 onMouseMove 处理。
 *
 * @param ref  需要倾斜的卡片元素 ref
 * @param opts 倾斜参数
 */
export function useDeviceTilt<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  { maxRotate = 18, scale = 1.04 }: DeviceTiltOptions = {}
) {
  useEffect(() => {
    // 仅在「无 hover」的触屏设备启用（手机/平板）；桌面端走鼠标事件
    if (!window.matchMedia("(hover: none)").matches) return
    const card = ref.current
    if (!card) return

    let baseGamma: number | null = null
    let baseBeta: number | null = null
    let listening = false

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      // 以首次读数作为基准，倾斜是相对当前持机姿态的变化量
      if (baseGamma === null || baseBeta === null) {
        baseGamma = e.gamma
        baseBeta = e.beta
        return
      }
      const dg = Math.max(-maxRotate * 2, Math.min(maxRotate * 2, e.gamma - baseGamma))
      const db = Math.max(-maxRotate * 2, Math.min(maxRotate * 2, e.beta - baseBeta))
      const ry = Math.max(-maxRotate, Math.min(maxRotate, -dg))
      const rx = Math.max(-maxRotate, Math.min(maxRotate, db))
      card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`
    }

    const start = () => {
      if (listening) return
      const DTO = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
      // iOS 13+ 需在用户手势内请求权限
      if (DTO && typeof DTO.requestPermission === "function") {
        DTO.requestPermission()
          .then((state) => {
            if (state === "granted") {
              listening = true
              window.addEventListener("deviceorientation", onOrient)
            }
          })
          .catch(() => {})
      } else {
        // Android / 桌面浏览器：无需权限
        listening = true
        window.addEventListener("deviceorientation", onOrient)
      }
    }

    // Android/Chrome 通常模块加载即可监听；iOS 需手势，监听首次触摸兜底
    start()
    card.addEventListener("touchstart", start, { once: true })

    return () => {
      card.removeEventListener("touchstart", start)
      window.removeEventListener("deviceorientation", onOrient)
    }
  }, [ref, maxRotate, scale])
}
