/* 🌅 四個時段各截一張(真實地圖模式)—— 給使用者過目用。
 * ⚠ 定位聲明(hook #29):純渲染截圖台,不驗互動;互動由 verify-tod-turn.mjs 真的 click。
 * 跑法:先起伺服器指到 dist(port 4321),然後 node scripts/shot-tod.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.URL || "http://localhost:4321/";
const OUT = "scripts/shots-tod";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
await page.context().grantPermissions(["geolocation"]);
await page.context().setGeolocation({ latitude: 25.033, longitude: 121.5654, accuracy: 8 });
page.on("pageerror", (e) => console.log("🔴 pageerror:", String(e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

// 進「牧場漫遊」+ 真實地圖(那是時段氛圍生效的地方)
await page.locator("#realMapSelect").selectOption({ index: 1 }).catch(() => {});
await page.locator("button:has-text('牧場漫遊')").first().click().catch(() => {});
await sleep(1200);
await page.locator("button:has-text('出發')").first().click().catch(() => {});
await sleep(9000);                                    // 等圖磚與建築

const state = await page.evaluate(() => ({ realMap: !!window.__game.realMap, roam: !!window.__game.roam }));
console.log("進入狀態:", JSON.stringify(state));

for (const [k, h] of [["dawn", 6], ["day", 12], ["dusk", 17], ["night", 22]]) {
  await page.evaluate((hh) => { window.__game._todFake = hh; }, h);
  await sleep(900);
  await page.screenshot({ path: `${OUT}/tod-${k}.png` });
  console.log("📷", k, h + " 點");
}
await browser.close();
