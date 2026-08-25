/* 🚶 實走模式(牧10)的離線驗算 —— 不開瀏覽器、不用真 GPS:
   用合成的定位軌跡餵 realwalk.js,釘住「GPS 抖動不會變成 3D 牧人的鬼畜」。
   跑法:node scripts/verify-realwalk.mjs

   釘五件:
     ① 站著不動 + 定位抖動(σ≈3m)⇒ 牧人漂移要小(死區在擋)
     ② 直線走 100 公尺 ⇒ 牧人平滑到達,**每一幀的步伐都不超過速度上限**(絕不瞬移)
     ③ 爛精度(>40m)的定位整筆被擋(feed 回 reason:'acc')
     ④ GPS 大跳(>60m)⇒ 一次傳送(snap),不是狂奔過去
     ⑤ 沒有定位之前 step() 回 null(牧人照舊聽鍵盤——別讓 (0,0) 把人吸走) */
import { createRealWalk } from '../src/realwalk.js';

let pass = 0, fail = 0;
const ok = (label, cond, note = '') => {
  if (cond) { pass++; console.log('  🟢 ' + label); }
  else { fail++; console.log('  🔴 ' + label + (note ? '  → ' + String(note).slice(0, 200) : '')); }
};
const section = (s) => console.log('\n── ' + s + ' ──');

/* 假投影:1 度 ≈ 111,320 公尺的簡化平面(測的是濾波邏輯,不是球面幾何) */
const M = 111320;
const latLonToWorld = (lat, lon) => ({ x: lon * M, z: -lat * M });
/* 決定性的偽亂數(測試要能重跑出同一個結果) */
let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 2;   // 近似常態,σ≈0.29

const mkWalk = () => createRealWalk({ latLonToWorld });

/** 跑一段模擬:每秒一筆定位、60fps 步進;回 {pos, path, maxStep, snaps} */
function run(walk, fixes, seconds) {
  const pos = { x: 0, z: 0 };
  let maxStep = 0, snaps = 0, travelled = 0, movingFrames = 0, frames = 0;
  const dt = 1 / 60;
  let fi = 0;
  for (let f = 0; f < seconds * 60; f++) {
    const t = f * dt;
    while (fi < fixes.length && fixes[fi].t <= t) {
      walk.feed(fixes[fi].lat, fixes[fi].lon, fixes[fi].acc);
      fi++;
    }
    const r = walk.step(pos.x, pos.z, dt);
    if (r) {
      const step = Math.hypot(r.x - pos.x, r.z - pos.z);
      if (r.snap) snaps++;
      else { maxStep = Math.max(maxStep, step); travelled += step; }
      if (r.moving) movingFrames++;
      pos.x = r.x; pos.z = r.z;
    }
    frames++;
  }
  return { pos, maxStep, snaps, travelled, movingPct: (movingFrames / Math.max(1, frames)) * 100 };
}
const jitter = (m) => gauss() * (m / 0.29) / M;   // 產生 σ≈m 公尺的經緯度抖動

/* ══ ① 站著不動 ══ */
section('① 站著不動:定位抖 σ≈3m,牧人不能自己走掉');
{
  const walk = mkWalk();
  const fixes = [];
  for (let t = 0; t < 60; t++) fixes.push({ t, lat: 0 + jitter(3), lon: 0 + jitter(3), acc: 8 });
  const r = run(walk, fixes, 62);
  const drift = Math.hypot(r.pos.x, r.pos.z);
  ok('①a 60 秒抖動後總漂移 < 8 公尺', drift < 8, drift.toFixed(2) + ' m');
  ok('①b 過程中零傳送', r.snaps === 0, String(r.snaps));
  /* ★★ 這兩條才是死區+低通真正買的東西 —— 0825 實測只驗漂移會漏:
     沒有 EMA 時牧人原地 60 秒走 154 公尺、72.6% 的幀在動(=鬼畜),但淨漂移照樣 <8m。
     EMA 後實測 40.9m / 19.3%,門檻給 1.6 倍餘裕。 */
  ok('①c ★★ 原地累計走動 < 65 公尺(不做低通會是 ~154m 的原地鬼畜)', r.travelled < 65, r.travelled.toFixed(1) + ' m');
  ok('①d ★★ 動幀比 < 35%(牧人大部分時間站著)', r.movingPct < 35, r.movingPct.toFixed(1) + '%');
}

/* ══ ② 直線走 100 公尺 ══ */
section('② 直線走 100 公尺(1.4 m/s,71 秒),含 σ≈3m 抖動');
{
  const walk = mkWalk();
  const fixes = [];
  for (let t = 0; t <= 71; t++) {
    const dist = Math.min(100, t * 1.4);
    fixes.push({ t, lat: 0 + jitter(3), lon: (dist / M) + jitter(3), acc: 8 });
  }
  const r = run(walk, fixes, 78);
  const endErr = Math.hypot(r.pos.x - 100, r.pos.z);
  ok('②a 走到終點附近(誤差 < 10 公尺)', endErr < 10, '離終點 ' + endErr.toFixed(2) + ' m(x=' + r.pos.x.toFixed(1) + ')');
  /* 上限=walkMax 3.4 ×追趕 1.6 = 5.44 m/s ⇒ 一幀最多 0.091m。超過=瞬移=鬼畜。 */
  ok('②b ★★ 每一幀步伐 ≤ 速度上限(絕不瞬移)', r.maxStep <= (3.4 * 1.6) / 60 + 1e-9, r.maxStep.toFixed(4) + ' m/幀');
  ok('②c 零傳送(100 公尺是用走的,不是跳的)', r.snaps === 0, String(r.snaps));
}

/* ══ ③ 精度閘門 ══ */
section('③ 爛精度整筆擋下');
{
  const walk = mkWalk();
  walk.feed(0, 0, 8);
  const bad = walk.feed(0.001, 0.001, 80);      // ±80m 的爛 fix(111m 外)
  ok('③a acc>40 被擋且講明理由', bad.ok === false && bad.reason === 'acc', JSON.stringify(bad));
  const r = walk.step(0, 0, 1 / 60);
  ok('③b 目標沒被爛 fix 拉走(牧人朝原目標,不是朝 111 公尺外)',
    Math.hypot(r.x, r.z) < 0.1, JSON.stringify({ x: r.x.toFixed(3), z: r.z.toFixed(3) }));
  ok('③c 統計有記(rejected=1)', walk.stats.rejected === 1, JSON.stringify(walk.stats));
}

/* ══ ④ GPS 大跳 ══ */
section('④ 大跳(120 公尺)⇒ 一次傳送,不是狂奔');
{
  const walk = mkWalk();
  walk.feed(0, 0, 8);
  const pos = { x: 0, z: 0 };
  let r = walk.step(pos.x, pos.z, 1 / 60);
  walk.feed(0, 120 / M, 8);                      // 瞬間跳 120m(電梯出來/隧道恢復)
  r = walk.step(pos.x, pos.z, 1 / 60);
  ok('④a 回報 snap 並直接落在目標', r.snap === true && Math.abs(r.x - 120) < 0.5, JSON.stringify({ snap: r.snap, x: r.x.toFixed(1) }));
}

/* ══ ⑤ 沒定位之前 ══ */
section('⑤ 沒有定位之前');
{
  const walk = mkWalk();
  ok('⑤a step() 回 null(牧人照舊聽鍵盤,不被 (0,0) 吸走)', walk.step(37, -12, 1 / 60) === null);
  ok('⑤b hasFix=false', walk.hasFix === false);
}

console.log(`\n🚶 realwalk:${pass} 過 / ${fail} 失敗`);
process.exit(fail ? 1 : 0);
