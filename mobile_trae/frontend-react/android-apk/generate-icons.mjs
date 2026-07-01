// ============================================================
// generate-icons.mjs
// 用途：从 public/icon-512.svg 生成 Android 所需的全部 PNG 图标
// 依赖：@resvg/resvg-js（纯 Rust 渲染，不依赖系统 ImageMagick）
// 用法：node android-apk/generate-icons.mjs
// ============================================================
import { Resvg } from "@resvg/resvg-js"
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, "..")
const SVG_PATH = join(PROJECT_ROOT, "public", "icon-512.svg")
const OUT_ROOT = join(__dirname, "resources")

if (!existsSync(SVG_PATH)) {
  console.error(`✗ 找不到 SVG 源文件: ${SVG_PATH}`)
  process.exit(1)
}

const svgBuffer = readFileSync(SVG_PATH)

// ------------------------------------------------------------
// 渲染单个 PNG：fitTo 模式 width 指定像素宽度
// ------------------------------------------------------------
function renderPng(size, outPath) {
  const resvg = new Resvg(svgBuffer, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
  })
  const png = resvg.render().asPng()
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, png)
  console.log(`✓ ${size}×${size} → ${outPath.replace(OUT_ROOT, "<resources>")}`)
}

// ------------------------------------------------------------
// Android 启动器图标（5 个密度）
// ------------------------------------------------------------
const launcherSizes = [
  ["mipmap-mdpi",    48],
  ["mipmap-hdpi",    72],
  ["mipmap-xhdpi",   96],
  ["mipmap-xxhdpi",  144],
  ["mipmap-xxxhdpi", 192],
]

console.log("\n=== 生成启动器图标 ===")
for (const [dir, size] of launcherSizes) {
  renderPng(size, join(OUT_ROOT, "android", dir, "ic_launcher.png"))
  // 圆形启动器（部分设备用）
  renderPng(size, join(OUT_ROOT, "android", dir, "ic_launcher_round.png"))
}

// ------------------------------------------------------------
// Play 商店图标 512×512
// ------------------------------------------------------------
console.log("\n=== 生成 Play 商店图标 ===")
renderPng(512, join(OUT_ROOT, "android", "playstore", "ic_launcher.png"))

// ------------------------------------------------------------
// 自适应图标前景/背景 432×432（Android 8.0+）
// ------------------------------------------------------------
console.log("\n=== 生成自适应图标前景/背景 ===")
// 前景：透明背景，居中放白色天平（取 SVG 的中心区域）
// 直接渲染原图作为前景（已带绿色背景），后续如需透明前景可单独绘制
renderPng(432, join(OUT_ROOT, "android", "mipmap-anydpi-v26", "ic_launcher_foreground.png"))
// 背景纯绿色
{
  const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="432" height="432"><rect width="432" height="432" fill="#059669"/></svg>`
  const resvg = new Resvg(Buffer.from(bgSvg))
  const png = resvg.render().asPng()
  const outPath = join(OUT_ROOT, "android", "mipmap-anydpi-v26", "ic_launcher_background.png")
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, png)
  console.log(`✓ 432×432 → <resources>/android/mipmap-anydpi-v26/ic_launcher_background.png`)
}

// ------------------------------------------------------------
// 启动屏图标 288×288
// ------------------------------------------------------------
console.log("\n=== 生成启动屏图标 ===")
renderPng(288, join(OUT_ROOT, "android", "splash", "drawable-xxxhdpi", "splash.png"))

// ------------------------------------------------------------
// 通知栏小图标 24×24（白色透明，Android 5.0+ 强制要求）
// ------------------------------------------------------------
console.log("\n=== 生成通知栏小图标 ===")
{
  // 通知图标必须是白色透明，单独绘制简化版天平
  const notifSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <g fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="6" x2="12" y2="19"/>
    <line x1="5" y1="9" x2="19" y2="9"/>
    <path d="M 5 9 L 3 14 L 7 14 Z"/>
    <path d="M 19 9 L 17 14 L 21 14 Z"/>
    <line x1="8" y1="19" x2="16" y2="19"/>
  </g>
</svg>`
  const resvg = new Resvg(Buffer.from(notifSvg))
  const png = resvg.render().asPng()
  const outPath = join(OUT_ROOT, "android", "drawable-mdpi", "ic_notification.png")
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, png)
  console.log(`✓ 24×24 → <resources>/android/drawable-mdpi/ic_notification.png`)
}

// ------------------------------------------------------------
// 1024×1024 高清源图（备用，可用于截图/营销）
// ------------------------------------------------------------
console.log("\n=== 生成高清源图 ===")
renderPng(1024, join(OUT_ROOT, "android", "icon-1024.png"))

console.log("\n✅ 全部图标生成完毕")
console.log(`📁 输出目录: ${OUT_ROOT}`)
