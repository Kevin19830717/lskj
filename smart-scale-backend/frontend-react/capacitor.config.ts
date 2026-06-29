import { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.smartscale.app",
  appName: "智能饮食健康秤",
  webDir: "dist",
  server: {
    // 允许 http 明文（局域网/公网后端用）
    androidScheme: "http",
  },
}

export default config
