#!/usr/bin/env bash
# ============================================================
# generate-keystore.sh
# 用途：生成 APK 签名密钥（release 用）
# 用法：bash android-apk/generate-keystore.sh
# ============================================================
set -e

KEYSTORE_PATH="android/keystore/release.keystore"
ALIAS="smartscale-key"
STORE_PASSWORD=""
KEY_PASSWORD=""
VALIDITY=10000  # 10000天 ≈ 27年
DNAME="CN=SmartScale, OU=Dev, O=lskj, L=Shenzhen, ST=Guangdong, C=CN"

# 切换到项目根
cd "$(dirname "$0")/.."
echo "当前目录: $(pwd)"

# 检查 keytool
if ! command -v keytool &> /dev/null; then
  echo "✗ 未找到 keytool，请先安装 JDK 17"
  echo "  Ubuntu/Debian: sudo apt install openjdk-17-jdk"
  echo "  macOS: brew install openjdk@17"
  exit 1
fi

# 交互式输入密码（更安全），也可用 -storepass / -keypass 命令行传入
read -s -p "请输入 keystore 密码（至少6位）: " STORE_PASSWORD
echo
read -s -p "请再次输入: " KEY_PASSWORD
echo
if [ "$STORE_PASSWORD" != "$KEY_PASSWORD" ]; then
  echo "✗ 两次输入不一致"
  exit 1
fi
if [ ${#STORE_PASSWORD} -lt 6 ]; then
  echo "✗ 密码至少6位"
  exit 1
fi

mkdir -p "$(dirname "$KEYSTORE_PATH")"

# 生成 keystore
keytool -genkeypair \
  -keystore "$KEYSTORE_PATH" \
  -alias "$ALIAS" \
  -storepass "$STORE_PASSWORD" \
  -keypass "$STORE_PASSWORD" \
  -keyalg RSA \
  -keysize 2048 \
  -validity "$VALIDITY" \
  -dname "$DNAME"

echo ""
echo "✅ 密钥生成成功"
echo "📁 文件: $KEYSTORE_PATH"
echo "🔑 别名: $ALIAS"
echo "⚠️  请妥善保管此 keystore 文件和密码，丢失后无法更新应用！"
echo "⚠️  请勿提交到 git（已在 .gitignore 中排除 android/keystore/）"
