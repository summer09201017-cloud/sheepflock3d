/* verify-buildings.mjs — 🏙 建築「遊戲化四板斧」驗收(0818 使用者四連發後加)
 *
 * 治的是:「高樓太高大太厚」「看不到路與牧人」「牧人與羊穿進房子」「全灰、街道窄到動彈不得」。
 * ★ 不靠 Overpass 今天有沒有空:先把**合成建築**注入 localStorage 快取(fetchCell 直接命中),
 *   幾何/碰撞/淡出全部確定性可驗。合成樓包含一棟「真實 180m」= 驗高度壓縮的天花板。
 *
 * 用法:npm run build && npx vite preview --port 4321 之後
 *   node scripts/verify-buildings.mjs [port]     # 預設 4321
 *
 * ⚠ 用 process.exitCode,不用 process.exit()(fetch/瀏覽器之後 exit 會打亂離開碼,守門 #36)
 */
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 4321);
const BASE = `http://localhost:${PORT}/`;

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { if (c) { pass++; console.log(`  🟢 ${n}`); } else { fail++; console.log(`  🔴 ${n} ${extra}`); } };

// 合成建築(信義區 demo 中心 25.0330,121.5654 那一格):
//   B1 高樓 180m(驗壓縮天花板)、B2 平房 6m(驗低樓原樣)、B3 中樓 40m。
//   ring=[lat,lon,…] 四點方形(半寬 ~13m/11m),與線上資料同格式。
const sq = (lat, lon, dLat, dLon) => [lat + dLat, lon - dLon, lat + dLat, lon + dLon, lat - dLat, lon + dLon, lat - dLat, lon - dLon];
const CELL_ITEMS = [
  [180, sq(25.0333, 121.5654, 0.00012, 0.00013)],
  [6,   sq(25.0330, 121.5661, 0.00010, 0.00011)],
  [40,  sq(25.0327, 121.5648, 0.00010, 0.00011)],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const isThirdPartyNoise = (t) => /overpass/i.test(t) || (/Failed to load resource/.test(t) && /50\d|429|Gateway/.test(t));
const errors = [];
page.on("console", (m) => { if (m.type() === "error" && !isThirdPartyNoise(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(BASE, { waitUntil: "load" });
  await page.evaluate((items) => {
    // 種快取:格鍵與 buildings.js 的 cellKey 同式(floor(lat/0.01)_floor(lon/0.01))
    const key = `${Math.floor(25.0330 / 0.01)}_${Math.floor(121.5654 / 0.01)}`;
    localStorage.setItem("sheepflock3d-buildings-v1", JSON.stringify({
      cells: { [key]: { at: Date.now(), items } },
      meta: { day: new Date().toISOString().slice(0, 10), count: 0 },
    }));
  }, CELL_ITEMS);
  await page.reload({ waitUntil: "load" });

  console.log("① 進「牧場漫遊・尋羊」+「🧪 台北測試地圖」(快取命中=零 Overpass 請求)");
  const reqs = [];
  page.on("request", (r) => { if (r.url().includes("overpass")) reqs.push(r.url()); });
  await page.locator('.mode-card[data-mode="seek"]').click();
  await page.selectOption("#realMapSelect", "demo");
  await page.locator("#startMatchButton").click();
  await page.waitForFunction(() => {
    const g = window.__game;
    return g && g.buildings && g.buildings.count > 0;
  }, null, { timeout: 30000 });
  ok("建築上好了(合成 3 棟)", true);
  ok("零 Overpass 請求(吃快取)", reqs.length === 0, reqs.join(","));

  console.log("② 高度壓縮:180m 高樓在遊戲裡 ≤26m,低樓原樣");
  const geom = await page.evaluate(() => {
    const g = window.__game;
    const grp = g.buildings.group;
    let maxY = 0;
    let hasColor = false;
    const colorSet = new Set();
    grp.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      maxY = Math.max(maxY, o.geometry.boundingBox.max.y);
      const c = o.geometry.getAttribute("color");
      if (c) {
        hasColor = true;
        for (let i = 0; i < c.count; i += 7) colorSet.add(`${c.getX(i).toFixed(2)},${c.getY(i).toFixed(2)},${c.getZ(i).toFixed(2)}`);
      }
    });
    return { maxY, hasColor, colors: colorSet.size, vertexColors: !!grp.children[0]?.material?.vertexColors };
  });
  ok("最高樓頂 ≤ 26m(180m 被壓縮)", geom.maxY > 20 && geom.maxY <= 26.01, `maxY=${geom.maxY.toFixed(1)}`);

  console.log("③ 粉彩配色:vertex color 開著、不只一種顏色");
  ok("材質 vertexColors=true", geom.vertexColors);
  ok("至少兩種顏色(不再一片灰)", geom.hasColor && geom.colors >= 2, `distinct=${geom.colors}`);

  console.log("④ 碰撞:牧人放進高樓中心 → 被推到樓外;羊同 API");
  const col = await page.evaluate(async () => {
    const g = window.__game;
    const w = g.realMap.latLonToWorld(25.0333, 121.5654);          // B1 中心
    const edge = g.realMap.latLonToWorld(25.0333 + 0.00012, 121.5654); // B1 北緣
    const half = Math.hypot(edge.x - w.x, edge.z - w.z);           // 半寬(公尺)
    const api = g.buildings.collide(w.x, w.z, 0.55);
    // 整合:直接把牧人放進樓心,讓遊戲迴圈自己推出來
    g.my.pos.x = w.x; g.my.pos.z = w.z;
    await new Promise((r) => setTimeout(r, 700));
    const dPlayer = Math.hypot(g.my.pos.x - w.x, g.my.pos.z - w.z);
    return { apiHit: !!api, apiD: api ? Math.hypot(api.x - w.x, api.z - w.z) : 0, half, dPlayer };
  });
  ok("collide() 樓心命中並回推", col.apiHit && col.apiD >= col.half * 0.8 * 0.9, `推到 ${col.apiD.toFixed(1)}m(半寬 ${col.half.toFixed(1)})`);
  ok("遊戲迴圈把牧人推出樓外", col.dPlayer >= col.half * 0.8 * 0.85, `牧人離樓心 ${col.dPlayer.toFixed(1)}m`);

  console.log("⑤ 視線遮擋淡出:鏡頭被高樓擋住 → 那格建築半透明;走開 → 恢復不透明");
  const fade = await page.evaluate(async () => {
    const g = window.__game;
    const w = g.realMap.latLonToWorld(25.0333, 121.5654);
    const edge = g.realMap.latLonToWorld(25.0333 + 0.00012, 121.5654);
    const half = Math.hypot(edge.x - w.x, edge.z - w.z);
    // 站在樓緣外 2m、背對高樓 ⇒ 跟隨鏡頭(後方 5.2m)落在樓體裡,視線必被擋
    const ux = (edge.x - w.x) / half || 0, uz = (edge.z - w.z) / half || 1;
    g.cameraView = 0;
    g.my.pos.x = w.x + ux * (half + 2); g.my.pos.z = w.z + uz * (half + 2);
    g.my.heading = Math.atan2(ux, uz);
    for (let i = 0; i < 80; i += 1) g.updateCamera(0.1);   // 同步收斂 lerp(Playwright 節流防呆)
    await new Promise((r) => setTimeout(r, 1200));          // 給 updateFade 的 0.18 lerp 收斂
    const mesh = g.buildings.group.children[0];
    const faded = mesh.material.opacity;
    // 走到空地(樓群東邊 80m),鏡頭視線不再穿樓 ⇒ 要恢復
    g.my.pos.x = w.x + 80; g.my.pos.z = w.z + 80;
    for (let i = 0; i < 80; i += 1) g.updateCamera(0.1);
    await new Promise((r) => setTimeout(r, 1500));
    return { faded, restored: mesh.material.opacity, transparentWhenFaded: faded < 0.999 };
  });
  ok("被擋 → 淡到半透明(<0.6)", fade.faded < 0.6, `opacity=${fade.faded.toFixed(2)}`);
  ok("走開 → 恢復(>0.95)", fade.restored > 0.95, `opacity=${fade.restored.toFixed(2)}`);

  console.log("⑥ 羊不穿牆:第一隻羊放進樓心 → 下一幀在樓外");
  const sheep = await page.evaluate(async () => {
    const g = window.__game;
    if (!g.flock.length) return { skip: true };
    const w = g.realMap.latLonToWorld(25.0333, 121.5654);
    const edge = g.realMap.latLonToWorld(25.0333 + 0.00012, 121.5654);
    const half = Math.hypot(edge.x - w.x, edge.z - w.z);
    const s = g.flock[0];
    s.pos.x = w.x; s.pos.z = w.z;
    await new Promise((r) => setTimeout(r, 700));
    return { d: Math.hypot(s.pos.x - w.x, s.pos.z - w.z), half };
  });
  if (sheep.skip) console.log("   → 這台裝置圖鑑沒有跟隨中的羊,跳過(collide 與牧人同一支)");
  else ok("羊被推出樓外", sheep.d >= sheep.half * 0.8 * 0.85, `羊離樓心 ${sheep.d.toFixed(1)}m(半寬 ${sheep.half.toFixed(1)})`);

  console.log("⑦ 沒有 console error");
  ok("零 console error", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  fail++;
  console.log(`  🔴 驗收中斷:${e.message}`);
} finally {
  await browser.close();
}

console.log(`\n合計:${pass} 🟢 / ${fail} 🔴`);
process.exitCode = fail ? 1 : 0;
