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
// v7(2026-08-12):🐑 羊叫聲**還原回「咩」**——使用者 A/B 試聽 8 個候選後拍板選 H(原本的)。
//                 v6 改成的「妹」已撤回、4 支 mp3 連 manifest 條目清掉,語音回到 24 支。
//                 ★ 為什麼一開始會覺得像「捏」:單獨聽原檔偏低偏慢;遊戲裡是加速播的
//                   (playbackRate 1.16~1.42),那才是實際聽感 —— 試聽一定要用實際播放參數。
//                 ★★ 教訓:語音只有使用者的耳朵能判斷,別憑推理改字;烤 A/B 候選讓他挑,一次定案。
// v6(2026-08-12):(已撤回)羊叫聲「咩」→「妹」。
// v8(2026-08-12):🏙 真實地圖模式**加上真實建築量體** + 地面看得清楚
//                 (使用者:「地上幾乎全白,看不清楚線與字,也沒有高樓大廈」
//                  「尋羊記裡的高樓與地圖,滿不錯的,你可以參考」)。
//                 ① 新 src/buildings.js:Overpass 抓真實建築輪廓 → extrude 成量體,
//                    高度取 height / building:levels×3.3(預設 9m、上限 180m),配色學尋羊記 pastelize。
//                    ★ 不 await:背景載入,不讓開場多等 1.3~3.7 秒(0811 才把開場壓到 0.9 秒)。
//                    ★ 五道閘(同 landmarks):開場查一次/間隔 20s/每天 12 次/快取 30 天/最多 12 格。
//                 ② 地面顏色強化(realmap.js LOOK):對比 1.34、飽和 1.62、亮度 0.88。
//                 ③ 霧的起點 140→260(z18 一磚才 140m,原設定等於走出腳下那磚就被霧洗白);
//                    far 維持 470 —— 那圈霧是刻意用來讓地圖邊界淡出的,不可以跟著推遠。
const CACHE_NAME = "sheepflock3d-v8";
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
