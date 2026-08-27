/* 🚶 計步健檢閘門 — 2026-08-27(sheepflock3d)
 *
 * 由來:使用者「sheepflock3d 與尋羊記,要跟皮克敏一樣能計步」。
 *
 * ★★ 本站比尋羊記多一個**非驗不可**的風險:pedometer.js 是 **UMD、不是 ES module**,
 *   而本站走 Vite 打包 —— bundler-global-guard #37 的實錄就發生在這個 repo:
 *   Vite/Rollup 把裸識別字 `module` 當外部全域並走了 CJS 那一支 ⇒ 傳統 UMD 的 else 永不執行
 *   ⇒ 取全域的那一站拿到 undefined ⇒ **整包 JS 一行都沒跑**,而 build 是綠的、HTTP 200、
 *   頁面還畫得出來(那是 index.html 的靜態標記)。
 *   ⇒ 所以這支的第 ① 項就是「window.Pedometer 真的在」——build 綠不算數。
 *
 * 驗五件:
 *   ① 打包後 window.Pedometer 還在(UMD 掛全域沒被 Vite 吃掉)
 *   ② 按下側欄「🚶 開始計步」→ 合成走路訊號會讓 HUD 步數上升
 *   ③ 步數存進既有的 settings 鍵(不新開 localStorage 鍵)
 *   ④ 重新載入後步數還在
 *   ⑤ 零 pageerror / console.error
 *
 * 跑法:npm run build && npx vite preview --port 4321,再 node scripts/verify-steps.mjs [port]
 * ⚠ 用 process.exitCode,不用 process.exit()(守門 #36)
 */
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 4321);
const BASE = `http://localhost:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { if (c) { pass++; console.log(`  🟢 ${n}`); } else { fail++; console.log(`  🔴 ${n} ${extra}`); } };

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 412, height: 900 },
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
});
const errors = [];
const noise = (t) => /overpass/i.test(t) || (/Failed to load resource/.test(t) && /50\d|429|Gateway/.test(t));
page.on("pageerror", (e) => errors.push("pageerror: " + String(e)));
page.on("console", (m) => { if (m.type() === "error" && !noise(m.text())) errors.push("console.error: " + m.text()); });

await page.goto(BASE, { waitUntil: "load", timeout: 25000 });
await sleep(1000);

console.log("① UMD 掛全域有沒有被 Vite 吃掉(build 綠不算數)");
ok("window.Pedometer 真的在",
  await page.evaluate(() => typeof globalThis.Pedometer === "object" && globalThis.Pedometer !== null));
ok("create 是函式", await page.evaluate(() => typeof globalThis.Pedometer?.create === "function"));

console.log("② 進遊戲 → 按「🚶 開始計步」→ 合成走路");
// 用真的 UI 進場(不用 evaluate 戳函式 —— evaluate-not-click-guard #29)
await page.locator('.mode-card[data-mode="seek"]').click();
await page.selectOption("#realMapSelect", "off").catch(() => {});
await page.locator("#startMatchButton").click();
await page.waitForFunction(() => window.__game && window.__game.phase === "battle", null, { timeout: 15000 });
await sleep(500);

ok("側欄有「🚶 開始計步」鈕", await page.locator("#stepButton").count() === 1);
await page.locator("#stepButton").click();
await sleep(300);
ok("步數卡出現", await page.locator("#stepCard").isVisible());

const counted = await page.evaluate(async () => {
  const hz = 50, cadence = 110, steps = 100, amp = 3;
  const stepMs = 60000 / cadence;
  for (let t = 0; t <= steps * stepMs; t += 1000 / hz) {
    const phase = (t % stepMs) / stepMs;
    const mag = 9.8 + amp * Math.pow(Math.max(0, Math.sin(phase * Math.PI)), 3);
    const ev = new Event("devicemotion");
    // ⚠ timeStamp 要自己蓋:合成事件全在同一毫秒派發,不蓋會被步頻理智夾吃成 1 步
    Object.defineProperty(ev, "timeStamp", { value: t + 1, configurable: true });
    ev.accelerationIncludingGravity = { x: 0, y: 0, z: mag };
    window.dispatchEvent(ev);
  }
  return Number(document.getElementById("stepLabel").textContent);
});
ok(`合成 100 步 → HUD 顯示 ${counted}(容許 80~120)`, counted >= 80 && counted <= 120, `got=${counted}`);

console.log("③ 存進既有的 settings 鍵,不新開 localStorage 鍵");
const store = await page.evaluate(() => {
  const keys = Object.keys(localStorage);
  let found = false;
  for (const k of keys) {
    try {
      const v = JSON.parse(localStorage.getItem(k) || "null");
      if (v && v.steps && v.steps.days) found = true;
    } catch {}
  }
  return { keys, found, strayStepKey: keys.filter((k) => /step|pedo/i.test(k)) };
});
ok("步數存在既有鍵裡", store.found, JSON.stringify(store.keys));
ok("沒有新開 step/pedo 專用鍵", store.strayStepKey.length === 0, JSON.stringify(store.strayStepKey));

console.log("④ 重新載入後步數還在");
await page.reload({ waitUntil: "load" });
await sleep(1000);
const after = await page.evaluate(() => Number(document.getElementById("stepLabel")?.textContent || 0));
ok(`重新載入後 ${after} 步`, after >= 80, `after=${after}`);

console.log("⑦ ⛶ 全螢幕鈕(0827 使用者:兩站都要)");
{
  const n = await page.locator("#fullscreenButton").count();
  ok(`側欄有 ⛶ 全螢幕鈕,而且只有一顆(${n})`, n === 1, String(n));
  /* ⚠ 不驗「按下去真的全螢幕」——headless Chromium 的全螢幕行為跟真手機不同,
     驗了只會得到一個跟現場無關的綠燈。這裡只驗「鈕在、id 不撞、按了不炸」。 */
  await page.locator("#fullscreenButton").click().catch(() => {});
  await sleep(300);
}

console.log("⑥ 步數里程碑 + 足跡面板(熱圖 / 月報卡 / 可攜匯出)");
{
  /* ⚠ 上一項 reload 過 ⇒ 現在人在首頁,而首頁會蓋住步數卡(click 會一直重試到 timeout)。
     那是**測試沒進到遊戲**,不是功能壞了 —— 首跑就是這樣紅的。要先重新進場。 */
  await page.locator('.mode-card[data-mode="seek"]').click();
  await page.selectOption("#realMapSelect", "off").catch(() => {});
  await page.locator("#startMatchButton").click();
  await page.waitForFunction(() => window.__game && window.__game.phase === "battle", null, { timeout: 15000 });
  await page.locator("#stepButton").click();
  await sleep(400);

  // 推到 1200 步跨過 1000 台階,驗它真的給金句(用 >= 比對,一次跳好幾步不可以漏)
  const due = await page.evaluate(() => {
    const P = globalThis.Pedometer;
    return P.milestoneDue(1200, {}) ? P.milestoneDue(1200, {}).ref : null;
  });
  ok(`1200 步該給 1000 台階(${due})`, due === "詩 23:3", String(due));

  /* 從**側欄的鈕**打開(已在計步時那顆鈕就是入口)。
     ⚠ 不要點 HUD 上那張步數卡:412px 下側欄會蓋住它 —— 那是真的可用性問題,
       首跑被 .side-panel intercepts pointer events 攔下來才發現的。 */
  await page.locator("#stepButton").click();
  await sleep(400);
  ok("側欄按鈕打開足跡面板", await page.locator("#stepModal").isVisible());

  const heat = await page.evaluate(() => {
    const cv = document.querySelector("#stepHeat");
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
    return { painted, stats: document.querySelector("#stepStats").textContent };
  });
  // 「畫得出來」要用像素證明,不是看 canvas 存不存在
  ok(`熱圖有畫上像素(${heat.painted})`, heat.painted > 100, String(heat.painted));
  ok("統計有本月/近12月/連續", /本月/.test(heat.stats) && /近 12 月/.test(heat.stats) && /連續/.test(heat.stats), heat.stats.slice(0, 60));

  await page.locator("#stepCardBtn").click();
  await sleep(500);
  const card = await page.evaluate(() => {
    const cv = document.querySelector("#stepCardCv");
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
    return { w: cv.width, h: cv.height, painted };
  });
  ok(`月報卡畫出來了(${card.w}x${card.h})`, card.w === 900 && card.h > 800 && card.painted > 10000, JSON.stringify(card));

  /* 📤 可攜匯出:步數**不在羊圈匯出鏈裡**(0827 訂正——原本以為跟著走,其實沒有),
     所以它自己這份格式是「換手機不掉資料」的唯一保障,一定要驗。 */
  await page.locator("#stepIoBtn").click();
  await sleep(250);
  const io = await page.evaluate(() => {
    const t = document.querySelector("#stepIoText").value;
    const P = globalThis.Pedometer;
    const fresh = P.normalize(null);
    const merged = P.importText(fresh, t);
    const bad = P.importText(fresh, "亂打的");
    return { tag: JSON.parse(t).t, merged, bad, days: Object.keys(fresh.days).length };
  });
  ok(`匯出格式標籤正確(${io.tag})`, io.tag === "hfpc-steps-v1", String(io.tag));
  ok(`匯出的文字能被匯回來(${io.merged} 天)`, io.merged >= 1, String(io.merged));
  ok("壞檔案回 -1 不是 0(匯入 0 天與檔案壞掉是兩件事)", io.bad === -1, String(io.bad));
}


ok("⑤ 零 pageerror / console.error", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\n🔬 verify-steps:${pass} 過 / ${fail} 失敗`);
console.log("⚠ 這支只證明接線與邏輯沒寫錯。真實準確度要拿手機走一次、跟系統計步器比對才知道。");
process.exitCode = fail ? 1 : 0;
