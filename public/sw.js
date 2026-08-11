// 網路優先 HTML+快取優先資產(07-13 修復:cache-first 舊 index 會在部署後 404 壞站)
// nf3(2026-07-30):🧸 獅/熊改成 tsum 圓萌造型(全艦隊政策「動物一律 tsum」第一個回頭改的舊站)
// v4(2026-08-12):🐑 羊圈和尋羊記(GPS 版)**互通**(B 案)——共用跨站格式 hfpc-sheepdex-v1
//                 (src/sheepdex.js=skill sheepdex-crossite 垂直搬運複本)+ ☁ 6 碼短碼搬運
//                 + 🗺 **真實地標任務**(走進真的公園/學校 → 那裡有一隻唱詩的羊;預烤台北地標包
//                 + 走出範圍才線上補查、結果只存在本機)。順修:saveSettings 會把沒帶到的鍵打回預設
//                 ⇒「牧場漫遊的地面」每次出發都被洗回曠野。
const CACHE_NAME = "sheepflock3d-v4";
const CORE_ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/icon-maskable.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {})).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // HTML/導覽:網路優先(拿到就更新快取),離線才用快取——部署新版立即生效
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match("/"))),
    );
    return;
  }

  // 其他資產(vite hashed 檔名=不可變):快取優先,沒有才抓網路回填
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (request.url.startsWith(self.location.origin) && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      }).catch(() => caches.match("/"));
    }),
  );
});
