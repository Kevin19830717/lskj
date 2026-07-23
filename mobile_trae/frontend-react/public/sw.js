// 智能饮食健康秤 — Service Worker (离线缓存 + PWA)
const CACHE = "smart-scale-v4"

self.addEventListener("install", (e) => {
  self.skipWaiting()
})

self.addEventListener("activate", (e) => {
  // 清除所有旧版本缓存
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (e) => {
  const req = e.request
  // 跳过 API 请求与跨源请求（让它们直接走到服务器）
  if (req.url.includes("/api/") || req.url.includes("/uploads/") || req.url.includes("/rag/")) return
  // 只处理同源 GET 请求
  if (req.method !== "GET") return
  try {
    const u = new URL(req.url)
    if (u.origin !== self.location.origin) return
  } catch (_) { return }

  // HTML 导航请求：network-first，确保拿到最新 index.html（避免缓存旧版本导致白屏）
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req).then((resp) => {
        // 把最新的 HTML 存入缓存
        const copy = resp.clone()
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        return resp
      }).catch(() => caches.match(req).then((r) => r || caches.match("/")))
    )
    return
  }

  // 静态资源（带 hash 文件名的 JS/CSS/图片等）：cache-first
  e.respondWith(
    caches.match(req).then((r) =>
      r || fetch(req).then((resp) => {
        // 只缓存成功的响应
        if (resp && resp.status === 200) {
          const copy = resp.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        }
        return resp
      })
    )
  )
})
