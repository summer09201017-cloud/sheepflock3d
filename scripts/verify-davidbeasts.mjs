// davidbeasts3d 端到端驗證(多獸版):
// ①lion1 kids 對決:自走 bot(追最近獸+輕重拳)→ 應全獸制伏獲勝
// ②bear3 kids 群獸局:三熊同場,bot 應能逐隻制伏(驗 foes[] KO 鏈+beast-down)
// ③both hard 被動局:玩家站著不動 → 獅+熊應能圍上並 KO 玩家(證明雙獸 AI 會走位會打)
// ④聖靈金光穿透:both 陣容把兩獸排在正前方一直線,發滿蓄力金光 → 兩獸都要掉血
// ⑤死神黑化:death 難度 lion2/bear1 → 獸身黑色+紅眼;normal 回原色
// ⑥牧場練習:practice 模式跑 8 秒,玩家血量不得減少
// 全程 0 pageerror。用法:node scripts/verify-davidbeasts.mjs <url> <outDir>
import { chromium } from "playwright";

const [url, outDir] = process.argv.slice(2);
const EXE = process.env.CHROME_EXE ||
  "C:/Users/agape250/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe";
const errors = [];
const results = {};
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

await page.goto(url, { waitUntil: "load", timeout: 25000 });
await page.bringToFront();
await page.waitForTimeout(1200);

const G = "__davidbeasts3d";

const startMatch = (mode, difficulty, beastId) => page.evaluate(([g, m, d, b]) => {
  const game = window[g];
  game.applyPresentation({ difficulty: d, modeId: m, beastId: b });
  game.startSelectedMatch();
  document.querySelector("#homeScreen").classList.remove("visible");
  game.strike(); // gate → battle
}, [G, mode, difficulty, beastId]);

const backToMenu = async () => {
  await page.evaluate(() => {
    document.querySelector("#overlayMenuButton").click();
    document.querySelector("#homeScreen").classList.remove("visible");
  });
  await page.waitForTimeout(300);
};

// 自走 bot:追最近活獸,近身輕拳連打+週期重拳,直到終場
const runBot = (timeoutMs) => page.evaluate(async ([g, tmo]) => {
  const game = window[g];
  const t0 = performance.now();
  let heavyAt = 0;
  const downs = [];
  const onEvt = game.onEvent;
  game.onEvent = (e) => { if (e.type === "beast-down") downs.push(e.label + ":" + e.remaining); if (onEvt) onEvt(e); };
  while (game.phase !== "ended" && performance.now() - t0 < tmo) {
    const target = game.nearestFoe();
    if (target) {
      const dx = target.pos.x - game.my.pos.x;
      const dz = target.pos.z - game.my.pos.z;
      const dist = Math.hypot(dx, dz);
      game.my.heading = Math.atan2(dx, dz);
      if (dist > 1.6) game.input.held.add("up"); else game.input.held.delete("up");
      if (dist < 2.2) {
        game.lightPunch();
        if (performance.now() - heavyAt > 2600) {
          heavyAt = performance.now();
          game._heavyPress();
          setTimeout(() => game._heavyRelease(), 120); // 短按=普通重拳
        }
      }
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  game.input.held.delete("up");
  game.onEvent = onEvt;
  return {
    phase: game.phase,
    myHp: game.my.hp,
    foesHp: game.foes.map((f) => f.hp),
    foesDown: game.foes.every((f) => f.koT >= 0),
    downs,
    elapsedSec: Math.round((performance.now() - t0) / 1000),
  };
}, [G, timeoutMs]);

// —— ① lion1 kids 對決 ——
await page.screenshot({ path: outDir + "/db-menu.png" });
await startMatch("duel", "kids", "lion1");
await page.waitForTimeout(600);
results.lion1Duel = await runBot(120000);
await page.screenshot({ path: outDir + "/db-lion1-end.png" });
await backToMenu();

// —— ② bear3 kids 群獸局 ——
await startMatch("duel", "kids", "bear3");
await page.waitForTimeout(400);
results.bear3Count = await page.evaluate(([g]) => ({
  n: window[g].foes.length,
  types: window[g].foes.map((f) => f.type),
  hp: window[g].foes.map((f) => f.hp),
}), [G]);
await page.screenshot({ path: outDir + "/db-bear3-start.png" });
results.bear3Duel = await runBot(180000);
await page.screenshot({ path: outDir + "/db-bear3-end.png" });
await backToMenu();

// —— ③ both hard 被動局(玩家不動,獅熊該打贏)——
await startMatch("duel", "hard", "both");
await page.waitForTimeout(300);
await page.screenshot({ path: outDir + "/db-both-start.png" });
results.bothPassive = await page.evaluate(async ([g]) => {
  const game = window[g];
  const t0 = performance.now();
  while (game.phase !== "ended" && performance.now() - t0 < 150000) {
    await new Promise((r) => setTimeout(r, 200));
  }
  return { phase: game.phase, myHp: game.my.hp, foesTypes: game.foes.map((f) => f.type), elapsedSec: Math.round((performance.now() - t0) / 1000) };
}, [G]);
await page.screenshot({ path: outDir + "/db-both-end.png" });
await backToMenu();

// —— ④ 聖靈金光穿透:兩獸排一直線,一發金光兩獸都掉血 ——
await startMatch("duel", "kids", "both");
await page.waitForTimeout(300);
results.wavePierce = await page.evaluate(async ([g]) => {
  const game = window[g];
  game.my.pos.set(0, 0, -8); game.my.heading = 0;
  game.foes[0].pos.set(0, 0, -4);
  game.foes[1].pos.set(0, 0, 0);
  const before = game.foes.map((f) => f.hp);
  game.superAttack(game.my, game.foes[0], 1); // 滿蓄力金光
  await new Promise((r) => setTimeout(r, 1400));
  const after = game.foes.map((f) => f.hp);
  return { before, after, bothHit: after[0] < before[0] && after[1] < before[1] };
}, [G]);
await backToMenu();

// —— ⑤ 死神黑化(lion2 黑獅紅眼/bear1 黑熊紅眼;normal 回原色)——
await page.evaluate(([g]) => window[g].applyPresentation({ difficulty: "death", beastId: "lion2" }), [G]);
await page.waitForTimeout(300);
results.deathLion = await page.evaluate(([g]) => {
  const game = window[g];
  return { n: game.foes.length, body: game.foes.map((f) => f.person.bodyMat.color.getHex().toString(16)) };
}, [G]);
await page.screenshot({ path: outDir + "/db-death-lion2.png" });
await page.evaluate(([g]) => window[g].applyPresentation({ beastId: "bear1" }), [G]);
await page.waitForTimeout(300);
results.deathBear = await page.evaluate(([g]) => {
  const game = window[g];
  return { body: game.foes[0].person.bodyMat.color.getHex().toString(16) };
}, [G]);
await page.screenshot({ path: outDir + "/db-death-bear1.png" });
await page.evaluate(([g]) => window[g].applyPresentation({ difficulty: "normal", beastId: "lion1" }), [G]);
await page.waitForTimeout(300);
results.normalLion = await page.evaluate(([g]) => ({
  body: window[g].foes[0].person.bodyMat.color.getHex().toString(16),
}), [G]);

// —— ⑥ 牧場練習:8 秒不掉血 ——
await startMatch("practice", "normal", "both");
await page.waitForTimeout(8000);
results.practice = await page.evaluate(([g]) => ({ myHp: window[g].my.hp, phase: window[g].phase }), [G]);
await page.screenshot({ path: outDir + "/db-practice.png" });

await browser.close();

const ok =
  results.lion1Duel.phase === "ended" && results.lion1Duel.foesDown &&
  results.bear3Count.n === 3 && results.bear3Count.types.every((t) => t === "bear") &&
  results.bear3Duel.phase === "ended" && results.bear3Duel.foesDown &&
  results.bothPassive.phase === "ended" && results.bothPassive.myHp <= 0 &&
  results.wavePierce.bothHit &&
  results.deathLion.body.every((b) => b === "16110d") &&
  results.deathBear.body === "14100c" &&
  results.normalLion.body === "c9863a" &&
  results.practice.myHp === 100 &&
  errors.length === 0;

console.log(JSON.stringify({ ok, errors, results }, null, 2));
process.exit(ok ? 0 : 1);
