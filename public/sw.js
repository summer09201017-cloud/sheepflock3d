// 網路優先 HTML+快取優先資產(07-13 修復:cache-first 舊 index 會在部署後 404 壞站)
// nf3(2026-07-30):🧸 獅/熊改成 tsum 圓萌造型(全艦隊政策「動物一律 tsum」第一個回頭改的舊站)
// v4(2026-08-12):🐑 羊圈和尋羊記(GPS 版)**互通**(B 案)——共用跨站格式 hfpc-sheepdex-v1
//                 (src/sheepdex.js=skill sheepdex-crossite 垂直搬運複本)+ ☁ 6 碼短碼搬運
//                 + 🗺 **真實地標任務**(走進真的公園/學校 → 那裡有一隻唱詩的羊;預烤台北地標包
//                 + 走出範圍才線上補查、結果只存在本機)。順修:saveSettings 會把沒帶到的鍵打回預設
//                 ⇒「牧場漫遊的地面」每次出發都被洗回曠野。
// v5(2026-08-12):🔴 修「首頁選單捲不動、『出發!』按不到」——使用者回報「開始遊戲的按鈕太下面看不到」。
//                 真因不是太長:.home-screen 是 position:absolute + place-items:center 但**沒有 overflow**
//                 ⇒ 內容超過一屏時 grid 置中把**上下兩端都切掉,而且捲不到**
//                 (實測手機直向 390×844:「出發!」在 1616px、頂端經文卡也被切一半)。
//                 修:place-items: safe center + overflow-y:auto(只加 overflow 是修不好的,
//                 被切掉的頂端在捲動範圍之外),再把「出發!」改 position:sticky 釘在底部。
// v6(2026-08-12):🐑 羊叫聲重烤——使用者回報烤「咩」出來**聽起來是「捏」**。
//                 「咩」=ㄇㄧㄝ,TTS 合成時 ㄇ 的鼻音配閉口韻 ㄧㄝ 聽感會滑成 ㄋㄧㄝ;
//                 改唸「妹」(ㄇㄟˋ,開口大、聲母清楚)才是羊叫的 "meh~"。
//                 ★ BLEATS 是**唸稿不是字幕**(voice.js 只拿它算 hash 取 mp3),
//                   所以畫面文案仍寫「咩咩叫」、不跟著改。舊 4 支 mp3 已清孤兒。
const CACHE_NAME = "sheepflock3d-v6";
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
