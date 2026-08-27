/* 🪵🏏 竿與杖驗收(0827 使用者退件:「J 與 K 動作上沒有差別,都只是手裡的竿搖一下,
 *   沒有碰到獅子與熊,也沒有將竿高高舉起重重打下」)。
 *
 * ★★ 這支刻意**量世界座標**,不是截圖用看的 —— 「打到沒打到」是個距離,可以是數字就不要是感覺。
 *   舊的 verify-davidbeasts 只驗「血有沒有掉」⇒ 判定對、畫面錯的時候它全綠(這次就是這樣漏掉的)。
 *
 * 驗五件:
 *   ① 兩招用不同的手、不同的兵器:J 動竿(左手)、K 動杖(右手)
 *   ② K 真的「高高舉起」:蓄勢頂點時杖尖必須高過頭頂
 *   ③ 兩招都真的「碰到」:接觸瞬間,該招兵器的尖端離獸身表面 ≤ TOUCH_SLACK
 *   ④ 兩招看起來不一樣:同一時刻的骨架姿勢差距要夠大(不是同一段動畫換個名字)
 *   ⑤ 零 pageerror
 *
 * 用法:npm run build && npx vite preview --port 4321 之後
 *   node scripts/verify-staff.mjs [port]
 * ⚠ 用 process.exitCode,不用 process.exit()(守門 #36:fetch 後 exit 會亂碼)
 */
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 4321);
const BASE = `http://localhost:${PORT}/`;
const TOUCH_SLACK = 0.45;      // 尖端離獸身表面容許的縫(m)。獸身本身有體積,貼到這個距離畫面上就是打在身上

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { if (c) { pass++; console.log(`  🟢 ${n}`); } else { fail++; console.log(`  🔴 ${n} ${extra}`); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });

await page.goto(BASE, { waitUntil: "load", timeout: 25000 });
await page.waitForTimeout(1200);

// 開一場對獅子的戰鬥,把牧人擺在「剛好在攻擊距離內」的地方,面向野獸
const setup = () => page.evaluate(() => {
  const g = window.__sheepflock3d;
  g.applyPresentation({ difficulty: "normal", modeId: "lion1", beastId: "lion1" });
  g.startSelectedMatch();
  document.querySelector("#homeScreen")?.classList.remove("visible");
  g.strike();
  const foe = g.livingFoes()[0];
  foe.pos.set(0, 0, 2.0);
  g.my.pos.set(0, 0, 0);
  g.my.heading = 0;              // 朝 +z = 朝著獸
  foe.speed = 0; g.my.speed = 0;
  return { foe: foe.pos.toArray(), me: g.my.pos.toArray() };
});

/* 出一招,逐幀走到「接觸瞬間」,回報那一刻的量測值。
   ⚠ 不用 setTimeout 等 —— 直接鎖住雙方位置並用固定 dt 推進,量到的才是可重現的數字。 */
const swing = (which) => page.evaluate((w) => {
  const g = window.__sheepflock3d;
  const foe = g.livingFoes()[0];
  const p = g.my.person;
  /* ⚠⚠ 0827 首版在這裡踩了兩次:
       ① 自己 `strikeT += 1/60` 累加,而**真正的 rAF 迴圈也在加同一個變數** ⇒ 同一份 build
          跑兩次量到完全不同的杖尖位置(z=1.42 vs z=0.12),而且都不亮紅燈。
       ② `chargeT` 只在開頭清一次,兩次 evaluate 之間又被帶回 >=0 ⇒ 姿勢掉進**蓄力分支**
          (杖舉在胸前發抖),量到的根本不是重劈。
     ⇒ 改成:每一幀都重新凍結全部狀態,並**明確設定** strikeT 到要量的時間點(不累加)。
       量測必須可重現;量不準的量測比不量更危險。 */
  const freeze = () => {
    foe.pos.set(0, 0, 2.0); g.my.pos.set(0, 0, 0); g.my.heading = 0;
    foe.speed = 0; g.my.speed = 0;
    g.my.chargeT = -1; g.my.stunT = 9; g.my.koT = -1; g.my.blocking = false;
    /* ⚠⚠ hitT 一定要凍:updateDavidPose 最後一行會用它把**整個上半身往後仰 0.8 弧度**
       (`rig.rotation.x`),而 rig 是竿與杖的祖先 ⇒ 獅子在兩次量測之間打到牧人一下,
       同樣的局部角度就會量到完全不同的世界座標(實測 z=1.43 vs z=0.12,而 rArm/rod.rotX 一模一樣)。
       ★ 這是 silent-failure ㊸ 的現場:我凍的是「我想得到的那幾個狀態」,而世界比那份清單大。
       ⇒ 凍結清單要涵蓋**所有會動到祖先變換的東西**,不是只有我在量的那一段。 */
    g.my.hitT = 9; g.my.walkT = 0;
    // mesh 的 group 位置/朝向由遊戲迴圈從 f.pos 同步 ⇒ 只凍 f.pos 不夠,mesh 也要一起釘死
    // (不釘的話量到的世界座標會飄 ~0.2m:數字看起來還在容許值內,但它已經不可重現了)
    p.group.position.set(0, 0, 0); p.group.rotation.y = 0;
  };
  freeze();
  g.my.cd = 0; g.my.lightCd = 0;
  if (w === "light") g.lightPunch(); else g.attack(g.my, foe);
  const kindNow = g.my.strikeKind;
  const contact = w === "light" ? 0.12 : 0.22;
  const tipOf = (o) => { o.updateMatrixWorld(true); const e = o.matrixWorld.elements; return { x: e[12], y: e[13], z: e[14] }; };
  const sampleAt = (t) => {
    freeze();
    g.my.strikeT = t;                 // ★ 明確設定,不累加 —— 不跟遊戲迴圈搶
    g.updatePoses();
    p.group.updateMatrixWorld(true);
    return {
      t,
      staffTip: tipOf(p.staffTip), rodTip: tipOf(p.rodTip), head: tipOf(p.head),
      lArm: p.leftArm.pivot.rotation.x, rArm: p.rightArm.pivot.rotation.x, twist: p.rig.rotation.y,
    };
  };
  const samples = [];
  for (let i = 0; i <= 40; i++) samples.push(sampleAt(i / 60));
  const at = sampleAt(contact);       // ★ 接觸瞬間直接量,不靠迴圈剛好踩到
  const tip = w === "light" ? at.staffTip : at.rodTip;
  const peakTwist = samples.reduce((m, s2) => (Math.abs(s2.twist) > Math.abs(m) ? s2.twist : m), 0);
  const rodPeakY = Math.max(...samples.map((s2) => s2.rodTip.y));
  return {
    kind: kindNow, phase: g.phase, kindAfter: g.my.strikeKind,
    rodRotX: p.rod.rotation.x, armJ: p.rightArm.joint.rotation.x,
    engagedDist: g.my.pos.distanceTo(foe.pos),
    contactFrame: {
      st: contact,
      tipToFoe: Math.hypot(tip.x - foe.pos.x, tip.z - foe.pos.z),
      tip: [tip.x, tip.y, tip.z], foe: foe.pos.toArray(),
      lArm: at.lArm, rArm: at.rArm, twist: at.twist,
    },
    rodPeakY, peakTwist, headY: samples[0].head.y,
  };
}, which);

await setup();
await page.waitForTimeout(400);
const L = await swing("light");
const H = await swing("heavy");
const foeR = await page.evaluate(() => {
  const g = window.__sheepflock3d;
  const f = g.livingFoes()[0];
  return f.stats?.radius ?? f.radius ?? 0.9;
});

console.log(`\n🪵 竿與杖驗收(獸半徑 ${foeR}m,容許縫 ${TOUCH_SLACK}m)`);

// ① 不同的手、不同的兵器
const lMoves = Math.abs(L.contactFrame.lArm - (-0.8)) > 0.15;
const hMoves = Math.abs(H.contactFrame.rArm - (-0.9)) > 0.4;
ok("① J 動的是左手(竿)", lMoves, `lArm=${L.contactFrame.lArm.toFixed(2)}`);
ok("① K 動的是右手(杖)", hMoves, `rArm=${H.contactFrame.rArm.toFixed(2)}`);

// ② 高高舉起:蓄勢頂點杖尖要高過頭頂
ok("② K「高高舉起」:杖尖高過頭頂", H.rodPeakY > H.headY + 0.15,
   `杖尖最高 ${H.rodPeakY.toFixed(2)}m vs 頭頂 ${H.headY.toFixed(2)}m`);

// ③ 真的碰到
const lGap = L.contactFrame.tipToFoe - foeR;
const hGap = H.contactFrame.tipToFoe - foeR;
ok("③ J 橫掃碰得到獸身", lGap <= TOUCH_SLACK, `竿尖離獸身表面 ${lGap.toFixed(2)}m`);
ok("③ K 重劈碰得到獸身", hGap <= TOUCH_SLACK, `杖尖離獸身表面 ${hGap.toFixed(2)}m`);

// ④ 兩招看起來不一樣(不同軸:J 轉腰、K 俯仰)
/* ⚠ 比的是**整段動畫的轉腰峰值**,不是「各自接觸瞬間的轉腰角」——
     橫掃正好在接觸那一刻通過身體中線(twist≈0),拿那一幀去比會量到假的 0.23。
     0827 首版就是這樣寫錯,判準自己說謊。 */
const twistDiff = Math.abs(L.peakTwist - H.peakTwist);
const armDiff = Math.abs(L.contactFrame.rArm - H.contactFrame.rArm);
ok("④ 兩招差在不同軸(J 轉腰峰值 vs K 幾乎不轉)", twistDiff > 0.35 && Math.abs(H.peakTwist) < 0.2,
   `J峰值=${L.peakTwist.toFixed(2)} K峰值=${H.peakTwist.toFixed(2)}`);
ok("④ 兩招姿勢差得夠遠(右臂俯仰)", armDiff > 0.35, `ΔrArm=${armDiff.toFixed(2)}`);

if (process.env.DEBUG) {
  const d = (t, r) => console.log(`  · ${t} kind=${r.kind}/${r.kindAfter} phase=${r.phase} dist=${r.engagedDist.toFixed(2)} 尖端=(${r.contactFrame.tip.map(v=>v.toFixed(2)).join(", ")}) rArm=${r.contactFrame.rArm.toFixed(2)} armJ=${r.armJ.toFixed(2)} rod.rotX=${r.rodRotX.toFixed(2)}`);
  console.log("  🔎 DEBUG:"); d("J", L); d("K", H);
}
ok("⑤ 零 pageerror / console.error", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`\n🔬 verify-staff:${pass} 過 / ${fail} 失敗`);
await browser.close();
process.exitCode = fail ? 1 : 0;
