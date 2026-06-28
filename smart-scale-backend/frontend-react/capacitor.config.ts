import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.smartscale.app',
  appName: '智能饮食健康秤',
  webDir: 'dist',
  // 后端使用 http:// 局域网地址，webview 用 http 方案避免混合内容拦截
  server: {
    androidScheme: 'http',
  },
  android: {
    allowMixedContent: true,
  },
}

export default config
