/* AI 허브 PWA 서비스워커 — 앱 껍데기만 캐시, 데이터·API는 네트워크 우선 */
const CACHE = "aihub-pwa-v3";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "room.js",
  "lock.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 새 버전이 배포되면 폰에서 바로 받도록: 페이지가 열릴 때 갱신 확인
self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Gemini·텔레그램 등 외부 요청은 손대지 않는다

  // 스냅샷(암호화 파일)은 항상 새 것을 먼저, 실패하면 캐시
  if (url.pathname.endsWith("snapshot.enc.json")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 앱 껍데기는 네트워크 우선 — 새 배포가 바로 반영되고, 오프라인이면 캐시
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
