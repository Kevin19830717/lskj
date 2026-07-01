// 智能饮食健康秤 — Service Worker (离线缓存 + PWA)
const CACHE = "smart-scale-v1"

self.addEventListener("install", (e) => {
  self.skipWaiting()
})

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", (e) => {
  // 跳过 API 请求（让它们走到服务器）
  if (e.request.url.includes("/api/")) return
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  )
})
