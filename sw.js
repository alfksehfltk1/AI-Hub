/* AI 허브 PWA 서비스워커
   · 앱 껍데기는 캐시 우선(설치 때 cache:"reload" 로 새로 받아 둔다) → 배포 후 버전만 올리면 폰에서 바로 새 화면
   · 스냅샷(암호화 데이터)은 네트워크 우선 → 새 오더보드가 있으면 바로 반영
*/
const CACHE = "aihub-pwa-v4";
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
  "icons/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // HTTP 캐시를 건너뛰고 새 파일을 받아 둔다 (GitHub Pages 의 max-age=600 무시)
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
      fetch(req, { cache: "reload" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 앱 껍데기: 캐시 우선, 없으면 네트워크
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});
