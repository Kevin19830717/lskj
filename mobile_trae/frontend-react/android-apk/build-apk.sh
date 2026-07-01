#!/usr/bin/env bash
# ============================================================
# build-apk.sh — 一键构建 Android APK
# 用途：在 Linux/Mac 上用 Capacitor + Gradle 打包 APK
# 前置：JDK 17 + Android SDK + 项目已 npm install
# 用法：
#   bash android-apk/build-apk.sh debug    # 调试版（默认 debug 签名）
#   bash android-apk/build-apk.sh release  # 发布版（需要先生成 keystore）
# ============================================================
set -e

MODE="${1:-debug}"
cd "$(dirname "$0")/.."
echo "=== 工作目录: $(pwd) ==="
echo "=== 构建模式: $MODE ==="

# ------------------------------------------------------------
# 1. 环境检查
# ------------------------------------------------------------
echo ""
echo "[1/6] 检查环境..."

command -v node   &> /dev/null || { echo "✗ 未安装 node"; exit 1; }

# 优先使用 JDK 21（Capacitor 8 插件要求），其次 JDK 17
if [ -z "$JAVA_HOME" ] || [ ! -d "$JAVA_HOME" ]; then
  for jdk in /usr/lib/jvm/java-21-openjdk-amd64 /usr/lib/jvm/java-17-openjdk-amd64; do
    if [ -d "$jdk" ]; then
      export JAVA_HOME="$jdk"
      export PATH="$JAVA_HOME/bin:$PATH"
      break
    fi
  done
fi
command -v java &> /dev/null || { echo "✗ 未安装 JDK
  Ubuntu: sudo apt install openjdk-21-jdk"; exit 1; }
JAVA_VER=$(java -version 2>&1 | head -1 | awk -F\" '{print $2}' | cut -d. -f1)
if [ "$JAVA_VER" -lt 17 ]; then
  echo "✗ Java 版本过低: $JAVA_VER，需要 17 或 21"
  exit 1
fi
echo "  ✓ JAVA_HOME: $JAVA_HOME (版本 $JAVA_VER)"

# 检查 ANDROID_HOME
if [ -z "$ANDROID_HOME" ]; then
  # 尝试常见路径
  for p in "/home/ubuntu/lskj/android-sdk" "$HOME/Android/Sdk" "$HOME/android-sdk" "/opt/android-sdk"; do
    if [ -d "$p" ]; then
      export ANDROID_HOME="$p"
      export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools"
      break
    fi
  done
fi
if [ -z "$ANDROID_HOME" ]; then
  echo "✗ 未设置 ANDROID_HOME
  请先安装 Android SDK command-line tools:
    https://developer.android.com/studio#command-line-tools-only
  然后设置:
    export ANDROID_HOME=\$HOME/Android/Sdk
    sdkmanager 'platform-tools' 'platforms;android-34' 'build-tools;34.0.0'"
  exit 1
fi
echo "  ✓ Node: $(node --version)"
echo "  ✓ Java: $(java --version 2>&1 | head -1)"
echo "  ✓ ANDROID_HOME: $ANDROID_HOME"

# ------------------------------------------------------------
# 2. 安装 npm 依赖（确保 capacitor 已装）
# ------------------------------------------------------------
echo ""
echo "[2/6] 检查 npm 依赖..."
if [ ! -d node_modules/@capacitor ]; then
  echo "  安装 @capacitor 依赖..."
  npm install --no-audit --no-fund
else
  echo "  ✓ @capacitor 已安装"
fi

# ------------------------------------------------------------
# 3. 用 APK 专用环境变量构建前端
# ------------------------------------------------------------
echo ""
echo "[3/6] 构建前端（使用 .env.apk 配置）..."
# Vite 会按 mode 加载 .env.<mode>，mode=apk 会读 .env.apk
npm run build -- --mode apk
echo "  ✓ dist/ 已生成"

# ------------------------------------------------------------
# 4. 同步到 Android 项目（首次会自动 npx cap add android）
# ------------------------------------------------------------
echo ""
echo "[4/6] 同步到 Android..."
if [ ! -d android ]; then
  echo "  首次运行，添加 Android 平台..."
  npx cap add android
fi

# 复制图标资源到 android/app/src/main/res/
echo "  复制图标资源..."
RES_DIR="android-apk/resources/android"
if [ -d "$RES_DIR" ]; then
  for d in mipmap-mdpi mipmap-hdpi mipmap-xhdpi mipmap-xxhdpi mipmap-xxxhdpi mipmap-anydpi-v26 drawable-mdpi; do
    if [ -d "$RES_DIR/$d" ]; then
      mkdir -p "android/app/src/main/res/$d"
      cp -f "$RES_DIR/$d"/* "android/app/src/main/res/$d/" 2>/dev/null || true
    fi
  done
  # Play 商店图标不放在 res/ 下（Gradle 不允许），保留在 android-apk/resources/ 中供上传时手动使用
  # 启动屏
  if [ -d "$RES_DIR/splash/drawable-xxxhdpi" ]; then
    mkdir -p "android/app/src/main/res/drawable-xxxhdpi"
    cp -f "$RES_DIR/splash/drawable-xxxhdpi/"*.png "android/app/src/main/res/drawable-xxxhdpi/" 2>/dev/null || true
  fi
  echo "  ✓ 图标已复制"
fi

npx cap sync android
echo "  ✓ sync 完成"

# ------------------------------------------------------------
# 5. Gradle 编译 APK
# ------------------------------------------------------------
echo ""
echo "[5/6] Gradle 编译..."
cd android

if [ "$MODE" = "release" ]; then
  # 检查 keystore
  if [ ! -f "keystore/release.keystore" ]; then
    echo "✗ 未找到 release.keystore，请先运行:"
    echo "  bash android-apk/generate-keystore.sh"
    exit 1
  fi

  # 配置签名信息（从环境变量读，避免提交到 git）
  export KEYSTORE_FILE="$(pwd)/keystore/release.keystore"
  export KEYSTORE_ALIAS="smartscale-key"
  if [ -z "$KEYSTORE_PASSWORD" ]; then
    read -s -p "请输入 keystore 密码: " KEYSTORE_PASSWORD
    echo
  fi
  export KEYSTORE_PASSWORD

  ./gradlew assembleRelease
  APK_PATH="app/build/outputs/apk/release/app-release.apk"
else
  ./gradlew assembleDebug
  APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
fi

cd ..
echo "  ✓ APK 编译完成"

# ------------------------------------------------------------
# 6. 输出结果
# ------------------------------------------------------------
echo ""
echo "[6/6] 构建结果"
FULL_PATH="android/$APK_PATH"
if [ -f "$FULL_PATH" ]; then
  SIZE=$(du -h "$FULL_PATH" | cut -f1)
  echo ""
  echo "✅ APK 生成成功！"
  echo "📁 路径: $(pwd)/$FULL_PATH"
  echo "📦 大小: $SIZE"
  echo ""
  echo "安装到设备（需 USB 调试）:"
  echo "  adb install $FULL_PATH"
else
  echo "✗ APK 未找到: $FULL_PATH"
  exit 1
fi
