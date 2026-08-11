/* 線上收斂驗收:兩站都是新版嗎?跨站搬羊在**真的網址上**通嗎?
   ⚠ process.exitCode(fetch 之後 exit 會打亂離開碼,守門 #36) */
import { chromium } from "playwright";

const Q = "https://hfpc-sheepquest.summer09201017.workers.dev";
const F = "https://hfpc-sheepflock3d.pages.dev";
let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  🟢 ${n}`); } else { fail++; console.log(`  🔴 ${n} ${e}`); } };
const NC = { "cache-control": "no-cache", pragma: "no-cache" };

console.log("① 線上是新版嗎(SW 版名 + 資產)");
{
  const sw = await (await fetch(`${Q}/sw.js`, { headers: NC })).text();
  ok("尋羊記 sw = sheepquest-v23", /sheepquest-v23/.test(sw), (sw.match(/sheepquest-v\d+/) || [])[0]);
  ok("尋羊記 CORE 含 ./sheepdex.js", /\.\/sheepdex\.js/.test(sw));
  const sd = await fetch(`${Q}/sheepdex.js`, { headers: NC });
  const sdText = await sd.text();
  ok("尋羊記 /sheepdex.js 200 且有真內容", sd.ok && /hfpc-sheepdex-v1/.test(sdText), `${sd.status} ${sdText.length}B`);
  const idx = await (await fetch(`${Q}/`, { headers: NC })).text();
  ok("尋羊記首頁版本標記 v23", /版本 v23/.test(idx), (idx.match(/版本 v\d+/) || [])[0]);
  ok("尋羊記首頁不再有外洩的 Markdown 星號", !/你\*\*精確\*\*/.test(idx));

  const fsw = await (await fetch(`${F}/sw.js`, { headers: NC })).text();
  ok("3D 站 sw = sheepflock3d-v4", /sheepflock3d-v4/.test(fsw), (fsw.match(/sheepflock3d-v\d+/) || [])[0]);
  const fidx = await (await fetch(`${F}/`, { headers: NC })).text();
  ok("3D 站首頁有「真實地標的羊」設定", /真實地標的羊/.test(fidx));
  ok("3D 站首頁有短碼鈕", /產生短碼/.test(fidx));
}

console.log("② 短碼中繼站活著");
{
  const h = await fetch("https://hfpc-sheepdex.summer09201017.workers.dev/health");
  const j = await h.json();
  ok("/health 回 200 且格式對", h.ok && j.format === "hfpc-sheepdex-v1", JSON.stringify(j));
}

console.log("③ 真網址上的跨站搬羊(手機抓的羊 → 教室電腦)");
const browser = await chromium.launch();
try {
  // ── 尋羊記(線上):種三隻羊 → 產短碼
  const p1 = await browser.newPage();
  const e1 = [];
  p1.on("pageerror", (e) => e1.push(String(e)));
  await p1.goto(Q, { waitUntil: "load" });
  await p1.evaluate(() => {
    localStorage.setItem("sheepquest-v1", JSON.stringify({ flock: {
      "1678|347|777": { name: "咩咩", e: "🐑", gold: false, ts: 1000, rescued: null },
      "1679|347|777": { name: "小白", e: "🐏", gold: true, ts: 2000, rescued: "獅子" },
      "1680|347|777": { name: "捲捲", e: "🐑", gold: false, ts: 3000, rescued: null },
    } }));
    localStorage.removeItem("hfpc-sheepdex-v1");
  });
  await p1.reload({ waitUntil: "load" });
  ok("線上 window.SheepDex 掛上了", await p1.evaluate(() => !!window.SheepDex));
  const backfilled = await p1.evaluate(() => window.SheepDex.dexStats(window.SheepDex.loadDex()));
  ok("開場自動回填 3 隻(舊使用者的羊帶得走)", backfilled.total === 3 && backfilled.gps === 3, JSON.stringify(backfilled));
  ok("★ 線上回填沒有寫入任何位置資料",
    await p1.evaluate(() => !window.SheepDex.loadDex().sheep.some((s) => s.place || s.lat || s.lon)));

  await p1.getByRole("checkbox", { name: "我答應遵守牧人守則" }).click();
  await p1.getByRole("button", { name: "🧪 客廳測試模式(不用出門)" }).click();
  await p1.getByRole("button", { name: "📖 羊圈" }).click();
  await p1.getByRole("button", { name: "☁ 產生搬運短碼" }).click();
  await p1.waitForFunction(() => /短碼是|送不出去/.test(document.getElementById("dexMsg").textContent), null, { timeout: 30000 });
  const msg = await p1.locator("#dexMsg").textContent();
  const code = (await p1.locator("#dexIo").inputValue()).trim();
  ok("尋羊記產出 6 碼", /^[a-hj-km-np-z2-9]{6}$/.test(code), `${code} / ${msg}`);
  ok("尋羊記零 pageerror", e1.length === 0, e1.slice(0, 2).join(" | "));

  // ── 3D 站(線上,另一個 origin=另一份 localStorage):用短碼收羊
  const p2 = await browser.newPage();
  const e2 = [];
  p2.on("pageerror", (e) => e2.push(String(e)));
  p2.on("dialog", (d) => d.accept(code));
  await p2.goto(F, { waitUntil: "load" });
  await p2.evaluate(() => localStorage.removeItem("hfpc-sheepdex-v1"));
  await p2.reload({ waitUntil: "load" });
  const before = await p2.evaluate(() => window.SheepDex.loadDex().sheep.length);
  ok("3D 站是乾淨的另一台裝置(0 隻)", before === 0, String(before));
  await p2.locator("#dexButton").click();
  await p2.locator("#dexDownButton").click();
  await p2.waitForFunction(() => /收到|都已經有了|查不到|收不到|看不懂/.test(document.getElementById("dexCount").textContent), null, { timeout: 30000 });
  const got = await p2.evaluate(() => {
    const d = window.SheepDex.loadDex();
    return { msg: document.getElementById("dexCount").textContent, total: d.sheep.length,
      names: d.sheep.map((s) => `${s.name}/${s.source}`),
      badges: [...document.querySelectorAll("#dexGrid .dex-gift")].map((e) => e.textContent),
      noGeo: !d.sheep.some((s) => s.place || s.lat || s.lon) };
  });
  ok("3D 站收到 3 隻", got.total === 3, JSON.stringify(got));
  ok("羊都標成 gps 來源", got.names.every((n) => n.endsWith("/gps")), JSON.stringify(got.names));
  ok("徽章有 🛰️尋羊記", got.badges.some((b) => b.includes("🛰️尋羊記")), JSON.stringify(got.badges));
  ok("金毛+獸口救回的徽章都在", got.badges.some((b) => b.includes("✨金毛") && b.includes("⚔️獅子")), JSON.stringify(got.badges));
  ok("★ 雲端搬運沒帶任何位置資料", got.noGeo);
  ok("3D 站零 pageerror", e2.length === 0, e2.slice(0, 2).join(" | "));

  // 再收一次同一個短碼 → 不可以變 6 隻
  // ⚠ 不要再註冊一次 dialog handler:上面那個是持久的,兩個都會去 accept ⇒ 第二個拋
  //   「Cannot accept dialog which is already handled」(這是測試自己的 bug,不是產品的)
  await p2.locator("#dexDownButton").click();
  await p2.waitForFunction(() => /都已經有了|收到/.test(document.getElementById("dexCount").textContent), null, { timeout: 30000 });
  const twice = await p2.evaluate(() => ({ n: window.SheepDex.loadDex().sheep.length, msg: document.getElementById("dexCount").textContent }));
  ok("重複收同一個短碼 → 不重複新增", twice.n === 3, JSON.stringify(twice));
} catch (e) {
  fail++;
  console.log(`  🔴 中斷:${e.message}`);
} finally {
  await browser.close();
}

console.log(`\n合計:${pass} 🟢 / ${fail} 🔴`);
process.exitCode = fail ? 1 : 0;
