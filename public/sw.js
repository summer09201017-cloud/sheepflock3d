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
// v10(2026-08-12):🔴🔴 修 SW 攔截跨來源請求 —— 這支 SW 從第一版就缺「只接管自己網域」那行,
//                  跨域(圖磚 / Overpass)失敗時退到 caches.match("/") ⇒ **回 200 + 首頁 HTML**,
//                  呼叫端拿 HTML 去 JSON.parse / 當圖片解析,而且 r.ok 是 true ⇒ 連失敗都判不出來。
//                  這是建築量體「本機好好的、線上永遠空的」的真凶(v8/v9 都還沒修到)。
// v9(2026-08-12):Overpass 一律改用 GET ?data=(跨來源 POST 不回 CORS header,線上一直被擋)。
//                 ⚠ 連帶修好 landmarks.js 的線上地標補查 —— 它用 POST,**上線以來從沒成功過**,
//                   而且失敗是靜默的(記 fail、10 分鐘後再試),沒有任何紅燈。
// v17(2026-08-18):🐕 牧羊犬忠忠(邊牧)+勇勇(柴柴)——頭尾各一隻繞著羊群巡邏,
//                 戰鬥中野獸靠近羊群會擋在前面吠(守護不攻擊,傷害數值零變動)。
//                 🏙 建築改「預烤包優先」:demo 台北測試區烤成 buildings-taipei.json(1373 棟,零 API);
//                 由來=0818 使用者「pages.dev 看不到高樓大廈」——Overpass 志工端點當天 504+備援逾時,
//                 agape250 機看得到只是那台瀏覽器有 30 天快取。GPS 區仍走線上,但抓失敗改為吭一聲。
//                 ⚠ buildings-taipei.json 沒有 hash、走資產 cache-first ⇒ 改包必須連著 bump SW 版本。
// v18(2026-08-19):🐕 吠聲聽得到了——使用者「漫遊模式聽不到汪汪吠」:事件與振盪器都有在跑
//                 (Playwright 監測實證),純粹是 gain 0.085/0.09s 單層滑音太小太短。
//                 改雙層波形 gain 0.3×0.13s、開場 2.5~5 秒先報到吠、巡邏間隔 12~24s→9~18s。
// v19(2026-08-19):🏙 第三種沉默也吭聲——「抓成功但 0 棟」(OSM 這一帶沒人畫過建築)
//                 之前只有「到貨」與「伺服器忙」兩種訊息,成功的空白=什麼都不說,
//                 使用者在家用 GPS 模式看到的就是這個(「沒看到狀態列」0819 回報)。
// v22(2026-08-26):🌅 **真實地圖模式的時段氛圍**(使用者:「尋羊記的真實地圖與 3D 房子…
//                 可以學習參考」→ 拍板「先搬時段氛圍」)+ 🎥 **修側面轉播的轉向左右相反**。
//                 · 時段:真實地圖模式的光線/天空/霧/地面跟著**真實世界時間**走
//                   (清晨偏暖 / 白天 / 黃昏偏橘 / 夜晚偏藍);曠野牧場那個 50 秒一天的
//                   加速日夜循環是既有刻意設計,**不動**。設定面板可關。
//                   ★ 過去 realmap 鎖在正午是有原因的:圖磚是不吃光的貼圖,只調燈光會變成
//                     「黑天配白地」⇒ 解法是**天和地一起調**(地面走 realmap.js 的 uTod uniform)。
//                   ⚠⚠ **三盞燈(key/hemi/rim)都會照到角色,所以三盞都要接近白**——
//                     踩了兩次:先只收 key ⇒ 黃昏的半球光 0xffd4b0(比太陽還飽和)
//                     把牧羊犬從黑白染成橘褐色,而閘門全綠(只檢查 key)。判準只認得
//                     自己想到的那一盞,就等於沒在守。氛圍一律交給天空/霧/地面。
//                   ⚠ 夜晚只換色不壓暗(地面乘數 ≥0.9、天空不可近黑):走在路上要看得清街道。
//                   ⚠ `h`(遊戲時鐘)維持 realmap=12:極光吃它,讓它走真實時間的話
//                     台北街道晚上會冒出極光。時段氛圍自己讀 new Date(),兩者刻意分開。
//                 · 轉向:`heading += turn` 是「相對角色自己」,而側面轉播的漫遊機位固定在
//                   世界 +x 側 ⇒ 牧人朝東(朝著鏡頭走來)時左右整個相反(使用者實測回報)。
//                   改成**相對鏡頭**:比較角色右向量與鏡頭右向量,反向就翻符號;
//                   |點積|<0.3(角色正對/背對鏡頭)沿用上一次的符號,避免在奇異點翻來翻去。
//                   ★ 跟隨(點積 +1)與側身跟隨(+0.08 走 hysteresis)行為完全不變。
// v23(2026-08-26):🐑 羊圈格式同步 sex/deco(尋羊記 v29 加的公母與配飾)。
//                 ★ 本站**畫法不動**:它的 makeGeneSheep 不吃 sex ⇒ 不畫配飾(降級,不會壞)。
//                   同步的目的是 normalizeEntry **不要把這兩個欄位洗掉**——不同步的話,
//                   羊搬過來再搬回去會掉配飾。(不過那兩個欄位是從 id 現算的,所以就算掉了
//                   對面也會重新算出同一隻;同步只是讓格式乾淨。)
const CACHE_NAME = "sheepflock3d-v25";
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

  /* ⚠⚠ 0812:跨來源(CARTO 圖磚 / Overpass 建築與地標查詢)**由 SW 代打,但絕不 fallback**。
     踩了兩層才問對問題,兩件事都要記住:
     ① 原本跨域也走下面那段「快取優先 + 失敗退 caches.match('/')」⇒
        **任何跨域失敗都變成「HTTP 200 + 我們自己的首頁 HTML」**;呼叫端拿 HTML 去 JSON.parse,
        而且 `r.ok` 是 true ⇒ **連失敗都判斷不出來**,只會靜靜記成「這一帶沒有建築」。
     ② 那就改成「跨域一律 return 放行給瀏覽器」吧?**實測不行** ——
        線上用 `serviceWorkers:'block'` 開頁面直接 fetch Overpass 一樣 `Failed to fetch`,
        而同一個查詢用 curl 帶 Origin 是 200 + `Access-Control-Allow-Origin: *`。
        ⇒ 頁面直打被對方擋、**SW 代打反而通**(v8 那版誤打誤撞是這樣才成功的)。
     ⇒ 結論:跨域交給 SW 用一句乾淨的 `fetch(request)` 代打,不快取、不退路、失敗就讓它失敗。 */
  if (new URL(request.url).origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

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




// 🏷️ 版號回報(0820 全艦隊批次):頁尾徽章問「實際執行中的版本」,答案=本 SW 的快取名。
self.addEventListener('message', function (e) {
  if (e && e.data === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'SW_VERSION', v: CACHE_NAME });
});
