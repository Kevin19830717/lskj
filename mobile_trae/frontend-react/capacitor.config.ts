import type { CapacitorConfig } from "@capacitor/cli"

// ============================================================
// Capacitor 配置 — Android APK 套壳
// 文档：https://capacitorjs.com/docs/config
// ============================================================
const config: CapacitorConfig = {
  // 应用 ID（反向域名格式，Android 包名）
  appId: "com.lskj.smartscale",

  // 应用名（显示在桌面图标下方）
  appName: "智能饮食健康秤",

  // Web 资源目录（Vite 构建产物）
  webDir: "dist",

  // Android 配置
  android: {
    // App 用 http scheme 与后端协议一致，无需混合内容
    allowMixedContent: false,
    // 启用 WebView 调试（开发期，正式发布建议关闭）
    webContentsDebuggingEnabled: true,
    // WebView 背景色：与启动图保持一致，避免切后台/页面加载时白屏
    backgroundColor: "#059669",
  },

  // 服务端配置：纯离线套壳，所有请求走前端 fetch + 公网后端
  server: {
    // 与后端 http://106.53.198.194 协议一致，避免混合内容拦截
    androidScheme: "http",
    // Capacitor 会自动在 Manifest 注入 usesCleartextTraffic="true"
    // 允许明文 HTTP 访问后端（Android 9+ 必需）
    cleartext: true,
  },

  // 插件配置
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#059669",
      showSpinner: false,
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
    },
  },
}

export default config
