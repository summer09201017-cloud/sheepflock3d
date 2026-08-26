/* 🌅 時段氛圍(真實地圖模式)+ 🎥 轉向相對鏡頭 —— 2026-08-26 兩件的常設閘門。
 *
 * 由來(兩件都是使用者實測回報的):
 *   ① 「尋羊記的真實地圖與 3D 房子…可以學習參考」→ 拍板「先搬時段氛圍」。
 *      真實地圖模式**過去鎖在正午**,因為圖磚不吃光,只調燈光會變成「黑天配白地」。
 *   ② 「側面轉播,我方向鍵按右轉,結果往左轉(逆時鐘);按左轉,結果往右轉。」
 *
 * 跑法:npx vite preview --port 4321 然後 node scripts/verify-tod-turn.mjs
 *   (與 verify-dogs / verify-realwalk 同一套;URL= 可指到線上驗正版)
 *
 * 案子:
 *   ① 四個時段的天空/太陽/地面互不相同(不是掛了個沒作用的旗標)
 *   ② ★ 太陽顏色一律接近白 —— 光會直接乘在材質上,白羊會被整批染色(尋羊記踩過)
 *   ③ ★ 夜晚不壓暗:地面乘數 ≥ 0.9、天空不可以近黑(走在路上要看得清路名=安全問題)
 *   ④ ★ 天和地要一起變:天空變了地面也要變(只變一個就是原本那個「黑天白地」)
 *   ⑤ 清晨從東邊照、黃昏從西邊照(影子方向會反過來)
 *   ⑥ 關掉開關 → 地面乘數回到 (1,1,1)、天空回到固定正午色
 *   ⑦ 🎥 側面轉播:牧人朝東(朝著鏡頭)時,按右要往畫面右轉 —— 這是使用者回報的那一刻
 *   ⑧ ★ 反面對照:跟隨視角與側身跟隨的轉向符號**不可以被改動**(只該修到側面轉播)
 *   ⑨ 零 console error
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.URL || "http://localhost:4321/";
const OUT = process.env.OUT || "scripts/shots-tod";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE });
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });

let fail = 0;
const ok = (cond, label, extra) => {
  console.log(`${cond ? "🟢" : "🔴"} ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`);
  if (!cond) fail += 1;
};

await page.context().grantPermissions(["geolocation"]);
await page.context().setGeolocation({ latitude: 25.033, longitude: 121.5654, accuracy: 8 });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

/* ── ①~⑤ 時段表本身(純資料,不必真的進真實地圖模式就驗得到)── */
{
  const T = await page.evaluate(() => {
    const g = window.__game;
    const out = {};
    for (const [k, h] of [["dawn", 6], ["day", 12], ["dusk", 17], ["night", 22]]) {
      const t = g.realTod(h);
      out[k] = { k: t.k, sky: t.sky, key: t.key, hemi: t.hemi, rim: t.rim, gnd: t.gnd, int: t.int, az: t.az };
    }
    return out;
  });
  const keys = Object.keys(T);
  ok(keys.every((k) => T[k].k === k), "① 四個時段各自對得上", keys.map((k) => T[k].k));
  const skies = new Set(keys.map((k) => T[k].sky));
  const gnds = new Set(keys.map((k) => T[k].gnd.join(",")));
  ok(skies.size === 4, "① 四個時段的天空色互不相同", [...skies].map((n) => "#" + n.toString(16)));
  ok(gnds.size === 4, "①b 四個時段的地面染色互不相同", [...gnds]);

  /* ② ★★ **每一盞會照到角色的燈**都要接近白(三通道 ≥ 0xd0 且通道差 ≤ 0x30)。
       ⚠ 判準刻意涵蓋 key/hemi/rim **三盞**,不是只檢查太陽 ——
         第一版只檢查 key,結果黃昏的半球光 0xffd4b0(差 79,比太陽還飽和)
         把**牧羊犬從黑白染成橘褐色**,而閘門全綠(截圖才看出來)。
         判準只認得自己想到的那一盞,就等於沒在守。
       ★ hemiGnd 不在此限:它模擬的是地面顏色反射上來,本來就該有地面的顏色。 */
  for (const k of keys) {
    for (const lamp of ["key", "hemi", "rim"]) {
      const c = T[k][lamp], r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      ok(r >= 0xd0 && g >= 0xd0 && b >= 0xd0 && spread <= 0x30,
        `② ★${k}/${lamp} 的光接近白(光乘在材質上,白羊白狗不可被染色)`,
        { hex: "#" + c.toString(16), spread });
    }
  }

  /* ③ 夜晚不壓暗 */
  const nightGnd = Math.min(...T.night.gnd);
  ok(nightGnd >= 0.9, "③ ★夜晚地面不可壓暗(走在路上要看得清路名=安全,不是美感)", { minChannel: nightGnd });
  const ns = T.night.sky, nl = (((ns >> 16) & 255) + ((ns >> 8) & 255) + (ns & 255)) / 3;
  ok(nl >= 0x50, "③b ★夜晚天空不可近黑(近黑的天配不吃光的亮地面=原本那個「黑天白地」)", { avg: Math.round(nl) });

  /* ④ 天和地要一起變 */
  const dayG = T.day.gnd.join(","), duskG = T.dusk.gnd.join(",");
  ok(T.day.sky !== T.dusk.sky && dayG !== duskG,
    "④ ★天空變了地面也要跟著變(只變一個就是原本的黑天白地)", { day: dayG, dusk: duskG });

  /* ⑤ 太陽方位:清晨東(az>0)、黃昏西(az<0) */
  ok(T.dawn.az > 0 && T.dusk.az < 0, "⑤ 清晨從東邊照、黃昏從西邊照(影子方向相反)",
    { dawn: T.dawn.az, dusk: T.dusk.az });
}

/* ── ⑥ 開關:**真的去選它**,不是 evaluate 改變數(守門 #29 的理由)──
   ★ 尋羊記 v1 的教訓:驗收只 evaluate 呼叫函式 ⇒ 按鈕被 CSS 藏住、玩家根本點不到,
     而 18/18 全綠、上線兩天沒人發現。locator 會等元素**可見可操作**,藏起來就直接丟錯。 */
{
  await page.locator("#todSelect").selectOption("off");     // 真的操作那個下拉
  await sleep(300);
  /* ⚠ 存檔鍵是 `davidbeasts3d-settings-v1`(本站從 davidbeasts3d fork 而來,鍵沿用舊名)——
     第一版我照站名猜成 sheepflock3d-settings,那樣會永遠讀到 null ⇒ 這條斷言變成假的。
     (localstorage-key-guard 當場提醒「讀了從不寫」才發現。) */
  const off = await page.evaluate(() => ({
    todOn: window.__game.todOn,
    saved: JSON.parse(localStorage.getItem("davidbeasts3d-settings-v1") || "{}").realTod,
  }));
  ok(off.todOn === false, "⑥ ★真的去選「固定白天的光」→ 遊戲當場關掉時段氛圍", off);
  ok(off.saved === false, "⑥b 而且記得住(存進設定,不必每次重選)", { saved: off.saved });

  await page.locator("#todSelect").selectOption("on");
  await sleep(300);
  const on = await page.evaluate(() => window.__game.todOn);
  ok(on === true, "⑥c 再選回來也要當場生效");
}

/* ── ⑦⑧ 🎥 轉向相對鏡頭 ──────────────────────────────────────────────
   量的是 _turnSign():它決定「按左/按右」要不要翻面。
   ★ 判準寫成「按右之後,朝向往**畫面右**偏」——直接對應使用者看到的東西,
     不是對應內部的 heading 數字(那正是原本會搞錯的地方)。 */
{
  const probe = await page.evaluate(() => {
    const g = window.__game;
    const THREE_UP = { x: 0, y: 1, z: 0 };
    const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };

    /* 模擬:把鏡頭放到「側面轉播・漫遊」的機位(mid + (9,3.4,0)),牧人朝東(朝著鏡頭)。
       這正是使用者回報的那一刻。 */
    function testView(camPos, camLook, heading) {
      g.my.heading = heading;
      g.camPos.set(camPos[0], camPos[1], camPos[2]);
      g.camLook.set(camLook[0], camLook[1], camLook[2]);
      g._lastTurnSign = 0;                       // 清掉 hysteresis,量這一刻的判斷
      const sign = g._turnSign();
      // 按「右」:turn = -1(程式的定義),heading 變化量 = turn * sign
      const dh = -1 * sign;
      // 朝向的變化方向向量 = dh * d(fwd)/dh = dh * (cos h, 0, -sin h)
      const dFwd = { x: dh * Math.cos(heading), y: 0, z: dh * -Math.sin(heading) };
      // 鏡頭的右向量 = cross(camForward, up)
      const camFwd = norm({ x: camLook[0] - camPos[0], y: 0, z: camLook[2] - camPos[2] });
      const camRight = cross(camFwd, THREE_UP);
      return { sign, towardScreenRight: dot(dFwd, camRight) };
    }

    return {
      // ⑦ 側面轉播(漫遊機位:鏡頭在牧人 +x 側),牧人朝東 = 朝著鏡頭走來
      broadcastFacingCam: testView([9, 3.4, 0], [0, 1.2, 0], Math.PI / 2),
      // 同一個視角,牧人朝西(背對鏡頭)—— 原本就是對的,不可以被改壞
      broadcastAwayCam: testView([9, 3.4, 0], [0, 1.2, 0], -Math.PI / 2),
      // ⑧ 跟隨視角(鏡頭在牧人正後方):符號必須維持 +1(這個視角本來就正確)
      followBehind: (() => {
        const h = 0.7;
        const fwd = { x: Math.sin(h), y: 0, z: Math.cos(h) };
        return testView([-fwd.x * 5.2, 3.0, -fwd.z * 5.2], [fwd.x * 6, 1.3, fwd.z * 6], h);
      })(),
    };
  });

  ok(probe.broadcastFacingCam.towardScreenRight > 0.5,
    "⑦ ★側面轉播・牧人朝著鏡頭走來時,按右真的往畫面右轉(使用者回報的那一刻)",
    probe.broadcastFacingCam);
  ok(probe.broadcastAwayCam.towardScreenRight > 0.5,
    "⑦b 同一視角、牧人背對鏡頭時也對(原本就對的情況不可以被改壞)",
    probe.broadcastAwayCam);
  ok(probe.followBehind.sign === 1 && probe.followBehind.towardScreenRight > 0.5,
    "⑧ ★跟隨視角的轉向符號維持 +1(這支修的只該是側面轉播,不可波及別的視角)",
    probe.followBehind);
}

/* ── ⑩ 玩家真的按得到「視角切換」,而且按三下真的到得了「側面轉播」──
   ★ 這是使用者實際的路徑:他就是按這顆鈕切到側面轉播才遇到轉向反了的。
     只驗 _turnSign() 的數學而不驗這顆鈕,等於沒驗到他走的那條路。 */
{
  await page.locator("#startButton, [data-action=start], button:has-text('出發')").first().click().catch(() => {});
  await sleep(2500);
  const before = await page.evaluate(() => window.__game.cameraView);
  let view = before, hops = 0;
  while (view !== 2 && hops < 6) {
    await page.locator("#cameraButton").click();      // 真的按那顆鈕(不可見就會丟錯)
    await sleep(260);
    view = await page.evaluate(() => window.__game.cameraView);
    hops += 1;
  }
  ok(view === 2, "⑩ ★真的按「視角切換」到得了側面轉播(使用者走的那條路)", { from: before, to: view, hops });
  await page.screenshot({ path: `${OUT}/broadcast-view.png` });
}

/* ── ⑨ 零錯誤 ── */
await page.screenshot({ path: `${OUT}/menu.png` });
if (errs.length) { console.log("🔴 頁面錯誤:"); errs.forEach((e) => console.log("  " + e)); fail += 1; }
else console.log("🟢 ⑨ 0 console error");

console.log(fail ? `\n🔴 FAIL — ${fail} 項` : "\n🟢 PASS — 全部通過");
await browser.close();
process.exit(fail ? 1 : 0);
