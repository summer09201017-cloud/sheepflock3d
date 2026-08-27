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

ok("⑤ 零 pageerror / console.error", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\n🔬 verify-steps:${pass} 過 / ${fail} 失敗`);
console.log("⚠ 這支只證明接線與邏輯沒寫錯。真實準確度要拿手機走一次、跟系統計步器比對才知道。");
process.exitCode = fail ? 1 : 0;
