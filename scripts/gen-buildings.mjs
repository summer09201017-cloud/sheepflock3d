/* gen-buildings.mjs — 🏙 預烤「台北測試地圖」的建築包(0818 使用者:「pages.dev 看不到高樓大廈」)
 *
 * 為什麼要烤:建築靠 Overpass(志工營運)線上抓,0818 實測主端點 504、兩個備援逾時
 *   ⇒ 新裝置/新瀏覽器一棟都看不到(agape250 機看得到是因為那台有 30 天 localStorage 快取)。
 *   跟 landmarks 同一帖藥:demo 區(信義區,公開鬧區,無隱私疑慮)烤成靜態包,線上零 API 必有樓;
 *   GPS 模式(使用者所在地)不能烤(隱私鐵則:絕不把任何人家附近烤進公開 repo),仍走線上。
 *
 * 資料源(依序試到成功):
 *   ① Overpass 四端點輪詢(GET ?data=,帶 UA;每輪之間歇 20 秒,最多 3 輪)
 *   ② OSM 官方 0.6 map API(XML;bbox 很小,遠低於 50k 元素上限)——Overpass 全倒時的保底
 *
 * 用法:node scripts/gen-buildings.mjs   → 寫 public/buildings-taipei.json
 * 格式:{ cells: { "<latIdx>_<lonIdx>": [[高度m, [lat,lon,...]], ...] } }
 *   與 src/buildings.js 的 localStorage 快取 items 同格式(6 位小數、高度 0.1m),runtime 直接吃。
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEMO = { lat: 25.0330, lon: 121.5654 }; // 與 src/main.js 的 DEMO_LATLON 同一點
const BOUND_M = 400;                          // 遊戲內 this.bound=400,走不出去
const CELL = 0.01;                            // 與 buildings.js 同一套格子
const RADIUS_M = 400;                         // 與 buildings.js fetchCell 同半徑
const LEVEL_M = 3.3, DEFAULT_H = 9, MAX_H = 180, MIN_AREA = 24; // 與 buildings.js 同值
const UA = "hfpc-sheepflock3d-bake/1.0 (church kids game; github summer09201017-cloud)";

const cellKey = (lat, lon) => `${Math.floor(lat / CELL)}_${Math.floor(lon / CELL)}`;
const cellCentre = (key) => {
  const [a, b] = key.split("_").map(Number);
  return { lat: (a + 0.5) * CELL, lon: (b + 0.5) * CELL };
};

// 玩家走得到的格子:活動範圍四角+中心落在哪些格就烤哪些(與 runtime 觸發條件一致)
function reachableCells() {
  const dLat = BOUND_M / 111320;
  const dLon = BOUND_M / (111320 * Math.cos((DEMO.lat * Math.PI) / 180));
  const keys = new Set();
  for (const la of [DEMO.lat - dLat, DEMO.lat, DEMO.lat + dLat]) {
    for (const lo of [DEMO.lon - dLon, DEMO.lon, DEMO.lon + dLon]) keys.add(cellKey(la, lo));
  }
  return [...keys];
}

function heightOf(tags = {}) {
  const num = (v) => { const m = String(v || "").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
  let h = num(tags.height);
  if (!Number.isFinite(h)) {
    const lv = num(tags["building:levels"]);
    if (Number.isFinite(lv)) h = lv * LEVEL_M;
  }
  if (!Number.isFinite(h) || h <= 0) h = DEFAULT_H;
  return Math.min(h, MAX_H);
}

// 面積(m²,等距圓柱近似)——太小的雨遮小屋不進包,runtime 反正也不畫
function areaM2(ring, cLat) {
  const kx = 111320 * Math.cos((cLat * Math.PI) / 180), ky = 111320;
  const pts = [];
  for (let i = 0; i < ring.length; i += 2) pts.push([ring[i + 1] * kx, ring[i] * ky]);
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}

function bboxOf(key) {
  const c = cellCentre(key);
  const dLat = RADIUS_M / 111320;
  const dLon = RADIUS_M / (111320 * Math.cos((c.lat * Math.PI) / 180));
  return { s: c.lat - dLat, w: c.lon - dLon, n: c.lat + dLat, e: c.lon + dLon, cLat: c.lat };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpass(bb) {
  const q = `[out:json][timeout:30];way["building"](${bb.s.toFixed(6)},${bb.w.toFixed(6)},${bb.n.toFixed(6)},${bb.e.toFixed(6)});out geom;`;
  const EPS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
  ];
  for (let round = 0; round < 3; round += 1) {
    for (const ep of EPS) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 45000);
        const r = await fetch(`${ep}?data=${encodeURIComponent(q)}`, {
          signal: ctl.signal,
          headers: { "User-Agent": UA, Accept: "application/json" },
        });
        clearTimeout(t);
        if (!r.ok) { console.log(`  · ${ep} → HTTP ${r.status}`); continue; }
        const j = await r.json();
        const items = [];
        for (const el of j.elements || []) {
          if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 4) continue;
          const ring = [];
          for (const p of el.geometry) ring.push(+p.lat.toFixed(6), +p.lon.toFixed(6));
          items.push([Math.round(heightOf(el.tags) * 10) / 10, ring]);
        }
        console.log(`  · ${ep} → ${items.length} 棟 ✓`);
        return items;
      } catch (e) {
        console.log(`  · ${ep} → ${String(e).slice(0, 60)}`);
      }
    }
    if (round < 2) { console.log("  …這一輪全倒,歇 20 秒再試"); await sleep(20000); }
  }
  return null;
}

// 保底:OSM 官方 0.6 map API(XML)。<node> 建座標表,<way> 抓 building tag + nd ref 串 ring。
async function fetchOsmXml(bb) {
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${bb.w.toFixed(6)},${bb.s.toFixed(6)},${bb.e.toFixed(6)},${bb.n.toFixed(6)}`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`osm map api HTTP ${r.status}`);
  const xml = await r.text();
  const nodes = new Map();
  for (const m of xml.matchAll(/<node id="(\d+)"[^>]*? lat="([-\d.]+)" lon="([-\d.]+)"/g)) {
    nodes.set(m[1], [+(+m[2]).toFixed(6), +(+m[3]).toFixed(6)]);
  }
  const items = [];
  for (const m of xml.matchAll(/<way id="\d+"[^>]*>([\s\S]*?)<\/way>/g)) {
    const body = m[1];
    if (!/<tag k="building"/.test(body)) continue;
    const tags = {};
    for (const t of body.matchAll(/<tag k="([^"]+)" v="([^"]*)"/g)) tags[t[1]] = t[2];
    const ring = [];
    for (const nd of body.matchAll(/<nd ref="(\d+)"/g)) {
      const p = nodes.get(nd[1]);
      if (p) ring.push(p[0], p[1]);
    }
    if (ring.length < 8) continue; // <4 點的不成樓
    items.push([Math.round(heightOf(tags) * 10) / 10, ring]);
  }
  console.log(`  · api.openstreetmap.org → ${items.length} 棟 ✓(XML 保底)`);
  return items;
}

const cells = {};
for (const key of reachableCells()) {
  console.log(`格 ${key}(中心 ${JSON.stringify(cellCentre(key))}):`);
  const bb = bboxOf(key);
  let items = await fetchOverpass(bb);
  if (!items) {
    console.log("  Overpass 三輪全倒,改走 OSM 官方 map API…");
    items = await fetchOsmXml(bb);
  }
  cells[key] = items.filter(([, ring]) => areaM2(ring, bb.cLat) >= MIN_AREA);
  console.log(`  → 入包 ${cells[key].length} 棟(濾掉 <${MIN_AREA}m² 的小屋雨遮)`);
  await sleep(3000); // 兩格之間也客氣一點
}

const out = {
  note: "預烤建築包:台北測試地圖(信義區 demo)專用。公開鬧區、無任何人的住處。gen-buildings.mjs 產生。",
  bakedAt: new Date().toISOString().slice(0, 10),
  centre: DEMO,
  cells,
};
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "buildings-taipei.json");
writeFileSync(dest, JSON.stringify(out));
const kb = Math.round(JSON.stringify(out).length / 1024);
console.log(`\n寫入 public/buildings-taipei.json:${Object.keys(cells).length} 格 / ${Object.values(cells).reduce((a, b) => a + b.length, 0)} 棟 / ${kb} KB`);
if (Object.values(cells).some((c) => !c || !c.length)) {
  console.log("⚠ 有格子是空的——資料源可能還在鬧脾氣,晚點重跑一次");
  process.exitCode = 1;
}
