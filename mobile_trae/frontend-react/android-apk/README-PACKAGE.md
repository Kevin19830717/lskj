# Android APK 打包工作区

本目录包含把现有 React + Vite 项目打包成 Android APK 的所有资源、脚本和配置。

---

## 📁 目录结构

```
mobile_trae/frontend-react/
├── capacitor.config.ts              ← Capacitor 配置（包名/应用名/webDir）
├── .env.apk                         ← APK 专用环境变量（指向公网后端）
├── package.json                     ← 已添加 build:apk / apk:debug / apk:release 脚本
├── src/App.tsx                      ← 已修改：API_BASE 走环境变量（默认值不变）
├── .gitignore                       ← 已添加 android/ 和 resources/ 排除
└── android-apk/                     ← 本目录
    ├── README-PACKAGE.md            ← 本文档
    ├── generate-icons.mjs           ← 生成 PNG 图标的脚本
    ├── build-apk.sh                 ← 一键构建 APK 脚本
    ├── generate-keystore.sh         ← 生成签名密钥脚本
    ├── package.json                 ← @resvg/resvg-js 依赖（独立于主项目）
    └── resources/android/           ← 生成的 PNG 资源（运行 generate-icons.mjs 后才有）
        ├── mipmap-mdpi/ic_launcher.png       48×48
        ├── mipmap-mdpi/ic_launcher_round.png 48×48
        ├── mipmap-hdpi/ic_launcher.png       72×72
        ├── mipmap-hdpi/ic_launcher_round.png 72×72
        ├── mipmap-xhdpi/ic_launcher.png      96×96
        ├── mipmap-xhdpi/ic_launcher_round.png 96×96
        ├── mipmap-xxhdpi/ic_launcher.png     144×144
        ├── mipmap-xxhdpi/ic_launcher_round.png 144×144
        ├── mipmap-xxxhdpi/ic_launcher.png    192×192
        ├── mipmap-xxxhdpi/ic_launcher_round.png 192×192
        ├── playstore/ic_launcher.png         512×512
        ├── mipmap-anydpi-v26/ic_launcher_foreground.png  432×432
        ├── mipmap-anydpi-v26/ic_launcher_background.png  432×432
        ├── splash/drawable-xxxhdpi/splash.png 288×288
        ├── drawable-mdpi/ic_notification.png  24×24
        └── icon-1024.png                     1024×1024（备用）
```

---

## ✅ 已完成（不用你再做）

1. **Capacitor 配置** → [capacitor.config.ts](file:///home/ubuntu/lskj/mobile_trae/frontend-react/capacitor.config.ts)
   - 包名: `com.lskj.smartscale`
   - 应用名: `智能饮食健康秤`
   - webDir: `dist`
   - 允许 http 混合内容（因后端走公网 IP 80 端口）

2. **环境变量切换** → [.env.apk](file:///home/ubuntu/lskj/mobile_trae/frontend-react/.env.apk)
   - `VITE_API_BASE=http://106.53.198.194/api/v1`
   - 网页端构建（`npm run build`）走默认 `/api/v1` 相对路径，APK 构建（`npm run build:apk`）走公网地址，**web 端无影响**

3. **API_BASE 代码统一** → [src/App.tsx#L47](file:///home/ubuntu/lskj/mobile_trae/frontend-react/src/App.tsx#L47)
   - 改为 `import.meta.env.VITE_API_BASE || "/api/v1"`
   - 默认值仍是 `/api/v1`，网页端行为不变

4. **PNG 图标全部生成** → `android-apk/resources/android/`
   - 5 个密度的启动器图标（含 round 版本）
   - Play 商店 512×512
   - 自适应图标前景/背景（Android 8.0+）
   - 启动屏图标 288×288
   - 通知栏小图标 24×24
   - 全部从 [public/icon-512.svg](file:///home/ubuntu/lskj/mobile_trae/frontend-react/public/icon-512.svg) 渲染，纯绿色背景 + 白色天平秤

5. **构建脚本** → [build-apk.sh](file:///home/ubuntu/lskj/mobile_trae/frontend-react/android-apk/build-apk.sh)
   - 自动检查环境、构建前端、同步资源、调用 Gradle 编译
   - 支持 debug/release 两种模式

6. **签名脚本** → [generate-keystore.sh](file:///home/ubuntu/lskj/mobile_trae/frontend-react/android-apk/generate-keystore.sh)
   - 生成 release 签名用的 keystore

7. **npm 脚本** → [package.json](file:///home/ubuntu/lskj/mobile_trae/frontend-react/package.json#L6-L15)
   - `npm run build:apk` — 用 .env.apk 构建前端
   - `npm run apk:debug` — 一键打 debug APK
   - `npm run apk:release` — 一键打 release APK
   - `npm run icons` — 重新生成图标

---

## ⚠️ 你需要做的（按顺序）

### 第 1 步：安装 JDK 17 + Android SDK

```bash
# JDK 17
sudo apt update
sudo apt install -y openjdk-17-jdk
java --version  # 确认 17.x

# Android SDK command-line tools
mkdir -p ~/Android/Sdk/cmdline-tools
cd ~/Android/Sdk/cmdline-tools
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-11076708_latest.zip
mv cmdline-tools latest

# 设置环境变量（写入 ~/.bashrc）
echo 'export ANDROID_HOME=$HOME/Android/Sdk' >> ~/.bashrc
echo 'export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools' >> ~/.bashrc
source ~/.bashrc

# 安装 SDK 组件
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

### 第 2 步：生成签名密钥（release 版才需要，debug 版跳过）

```bash
cd /home/ubuntu/lskj/mobile_trae/frontend-react
bash android-apk/generate-keystore.sh
# 按提示输入密码（至少6位，请记住！）
# 生成在 android/keystore/release.keystore（已在 .gitignore 排除）
```

### 第 3 步：一键构建 APK

```bash
cd /home/ubuntu/lskj/mobile_trae/frontend-react

# 方式 A：直接用 npm 脚本
npm run apk:debug    # debug 版（默认 debug 签名，任何人可装）
# 或
npm run apk:release  # release 版（需先完成第 2 步）

# 方式 B：直接调脚本
bash android-apk/build-apk.sh debug
bash android-apk/build-apk.sh release
```

### 第 4 步：安装到手机

```bash
# 用 USB 连接手机（开启 USB 调试）
adb install android/app/build/outputs/apk/debug/app-debug.apk

# 或者把 APK 文件传到手机（微信/QQ/网盘）后点击安装
# APK 路径：android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📋 已有 PNG 图标清单（15 个）

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `mipmap-mdpi/ic_launcher.png` | 48×48 | 启动器（低密度） |
| `mipmap-mdpi/ic_launcher_round.png` | 48×48 | 圆形启动器 |
| `mipmap-hdpi/ic_launcher.png` | 72×72 | 启动器（高密度） |
| `mipmap-hdpi/ic_launcher_round.png` | 72×72 | 圆形启动器 |
| `mipmap-xhdpi/ic_launcher.png` | 96×96 | 启动器（超高密度） |
| `mipmap-xhdpi/ic_launcher_round.png` | 96×96 | 圆形启动器 |
| `mipmap-xxhdpi/ic_launcher.png` | 144×144 | 启动器（极高密度） |
| `mipmap-xxhdpi/ic_launcher_round.png` | 144×144 | 圆形启动器 |
| `mipmap-xxxhdpi/ic_launcher.png` | 192×192 | 启动器（最高密度） |
| `mipmap-xxxhdpi/ic_launcher_round.png` | 192×192 | 圆形启动器 |
| `playstore/ic_launcher.png` | 512×512 | Play 商店展示 |
| `mipmap-anydpi-v26/ic_launcher_foreground.png` | 432×432 | 自适应图标前景 |
| `mipmap-anydpi-v26/ic_launcher_background.png` | 432×432 | 自适应图标背景 |
| `splash/drawable-xxxhdpi/splash.png` | 288×288 | 启动屏 |
| `drawable-mdpi/ic_notification.png` | 24×24 | 通知栏小图标 |

如果 [public/icon-512.svg](file:///home/ubuntu/lskj/mobile_trae/frontend-react/public/icon-512.svg) 修改了，重新生成所有 PNG：

```bash
npm run icons
```

---

## 🔧 关键配置说明

### 后端地址
- **网页端**：`/api/v1`（nginx 反代，默认值）
- **APK**：`http://106.53.198.194/api/v1`（从 [.env.apk](file:///home/ubuntu/lskj/mobile_trae/frontend-react/.env.apk) 读取）

### 应用包名
`com.lskj.smartscale`（定义在 [capacitor.config.ts](file:///home/ubuntu/lskj/mobile_trae/frontend-react/capacitor.config.ts#L9)）

### 混合内容（HTTP）
APK 允许 WebView 加载 http 资源（[capacitor.config.ts](file:///home/ubuntu/lskj/mobile_trae/frontend-react/capacitor.config.ts#L19) `allowMixedContent: true`），因后端为 http://106.53.198.194。**建议后续给后端配置 HTTPS**。

---

## 🐛 常见问题

**Q: `sdkmanager` 命令找不到？**
A: 检查 `ANDROID_HOME` 是否设置，`source ~/.bashrc` 后重试。

**Q: Gradle 编译报错 `Failed to install the following Android SDK components`？**
A: 用 `sdkmanager` 安装缺失的组件，例如：
```bash
sdkmanager "platforms;android-34" "build-tools;34.0.0"
```

**Q: APK 装上后白屏？**
A: 1) 确认 [.env.apk](file:///home/ubuntu/lskj/mobile_trae/frontend-react/.env.apk) 中的后端地址手机能访问
   2) 用 `chrome://inspect` 调试 WebView 查看控制台错误

**Q: 想改应用名/包名？**
A: 编辑 [capacitor.config.ts](file:///home/ubuntu/lskj/mobile_trae/frontend-react/capacitor.config.ts)，然后删除 `android/` 目录重新 `npx cap add android`。

**Q: 想换图标？**
A: 替换 [public/icon-512.svg](file:///home/ubuntu/lskj/mobile_trae/frontend-react/public/icon-512.svg)，然后 `npm run icons`，再 `npm run apk:debug`。
