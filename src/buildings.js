// 🏙 真實建築量體(0812 使用者點名:「沒有高樓大廈」「尋羊記裡的高樓與地圖,滿不錯的,你可以參考」)
//
// 尋羊記(sheepquest)是 MapLibre GL + 向量圖磚,建築是 fill-extrusion 圖層、樣式自帶 render_height;
// 本站是 three.js 3D 遊戲、地面只是點陣圖磚貼圖 ⇒ **不能直接搬那套**(渲染引擎相反)。
// 這裡改用 Overpass 抓真實建築輪廓,自己 extrude 成量體,配色學尋羊記 pastelize() 的淡紫。
//
// ★ 為什麼值得做:z18 圖磚貼在地上就是一張白紙,沒有任何立體感;
//   有了量體之後畫面才有遮擋、影子與街廓的深度 —— 也是使用者說「地上幾乎全白」的一半解法。
//
// ★★ 「別打 API 打到爆」(使用者 0812 明白提的,同 landmarks.js 的五道閘):
//    ① 只在**開場**查一次(不是走一步查一次);② 兩次請求至少隔 20 秒且同時只一個;
//    ③ 每天最多 12 次;④ 查到的快取 30 天、真的沒有記 1 天、**沒連上只鎖 10 分鐘**;
//    ⑤ 快取最多 12 格(建築資料比地標大,格數要收斂)。
//    ⇒ 最壞情況:一個人走一整天 = 12 個請求。Overpass 是志工營運的,這個量是有禮貌的。
//
// ★ 隱私:與 landmarks.js 同一條規則 —— 送出去的**不是精確座標**,是格子中心(≈1.1 公里粗);
//   而且建築只在畫面上出現,**不寫進羊圈紀錄、不上傳任何東西**。
//
// ★ 實測容量(0812 台北車站,決定用 400m 的依據):
//     半徑 250m → 77 棟 / 124 KB / 1.3 秒;半徑 400m → 186 棟 / 239 KB / 3.7 秒。
import * as THREE from "three";

const CACHE_KEY = "sheepflock3d-buildings-v1";
const CELL = 0.01;              // ≈1.1 公里見方(與 landmarks.js 同一套格子)
const RADIUS_M = 400;           // 查詢半徑(實測 186 棟 / 239KB / 3.7s,走得到的範圍)
const CELL_TTL = 30 * 864e5;    // 查到的:30 天
const MISS_TTL = 1 * 864e5;     // 真的沒建築(200 但 0 筆):1 天
const FAIL_TTL = 6e5;           // 沒連上/超時:只鎖 10 分鐘(同 landmarks.js 的教訓:超時是常態不是結論)
const MIN_GAP_MS = 20000;
const DAY_CAP = 12;
const MAX_CELLS = 12;
const REQ_TIMEOUT = 30000;      // 30 秒——量出來的(landmarks.js 實測 Overpass 要 9~12 秒)

const LEVEL_M = 3.3;            // 一層樓約 3.3 公尺
const DEFAULT_H = 9;            // 沒有任何高度標示時的預設(≈3 層樓;尋羊記 fill-extrusion 用 8)
const MAX_H = 180;              // 上限:免得資料錯標(實測抓到「101 層」)戳破天空
const MIN_AREA = 24;            // 太小的輪廓(小屋、雨遮)不畫,省 draw call

let inFlight = false;
let lastReqAt = 0;

/* ---------- 快取(與 landmarks.js 同款,壞檔/私密模式一律當作沒有,不炸) ---------- */
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}
const cellKey = (lat, lon) => `${Math.floor(lat / CELL)}_${Math.floor(lon / CELL)}`;
const cellCentre = (lat, lon) => ({
  lat: (Math.floor(lat / CELL) + 0.5) * CELL,
  lon: (Math.floor(lon / CELL) + 0.5) * CELL,
});

function loadCache() {
  const c = readJson(CACHE_KEY, null);
  return c && c.cells ? c : { cells: {}, meta: {} };
}
function saveCache(c) {
  const keys = Object.keys(c.cells);
  if (keys.length > MAX_CELLS) {
    keys.sort((a, b) => (c.cells[a].at || 0) - (c.cells[b].at || 0));
    for (const k of keys.slice(0, keys.length - MAX_CELLS)) delete c.cells[k];
  }
  writeJson(CACHE_KEY, c);
}

/* ---------- 高度判讀 ---------- */
// OSM 的高度散在好幾個標籤,而且格式很雜("25 m"、"25.5"、"3"…)⇒ 一律寬鬆解析再夾範圍。
function heightOf(tags = {}) {
  const num = (v) => {
    const m = String(v || "").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  };
  let h = num(tags.height);
  if (!Number.isFinite(h)) {
    const lv = num(tags["building:levels"]);
    if (Number.isFinite(lv)) h = lv * LEVEL_M;
  }
  if (!Number.isFinite(h) || h <= 0) h = DEFAULT_H;
  return Math.min(h, MAX_H);
}

/* ---------- Overpass ---------- */
async function fetchCell(lat, lon) {
  const cache = loadCache();
  const key = cellKey(lat, lon);
  const hit = cache.cells[key];
  const now = Date.now();
  if (hit) {
    const ttl = hit.fail ? FAIL_TTL : hit.items && hit.items.length ? CELL_TTL : MISS_TTL;
    if (now - (hit.at || 0) < ttl) return hit.items || [];
  }
  if (inFlight) return hit ? hit.items || [] : [];
  if (now - lastReqAt < MIN_GAP_MS) return hit ? hit.items || [] : [];

  const day = new Date(now).toISOString().slice(0, 10);
  if (cache.meta.day !== day) cache.meta = { day, count: 0 };
  if ((cache.meta.count || 0) >= DAY_CAP) return hit ? hit.items || [] : [];

  const c = cellCentre(lat, lon);   // ★ 隱私:送格子中心,不送手機拿到的精確座標
  const dLat = RADIUS_M / 111320;
  const dLon = RADIUS_M / (111320 * Math.cos((c.lat * Math.PI) / 180));
  const bbox = `${(c.lat - dLat).toFixed(6)},${(c.lon - dLon).toFixed(6)},${(c.lat + dLat).toFixed(6)},${(c.lon + dLon).toFixed(6)}`;
  const q = `[out:json][timeout:30];way["building"](${bbox});out geom;`;

  inFlight = true;
  lastReqAt = now;
  cache.meta.count = (cache.meta.count || 0) + 1;
  saveCache(cache);   // 先記帳再打:失敗也算一次,才擋得住連環重試

  let items = [];
  let failed = false;
  try {
    /* ⚠⚠ **一定要用 GET `?data=`,不可以用 POST**(0812 線上實測):
         overpass-api.de 對**跨來源的 POST 不回 `Access-Control-Allow-Origin`** ⇒ 瀏覽器擋死。
         而本機 `vite preview`(localhost)POST 是通的 ⇒ **本機全綠、線上全死**,
         加上這族失敗刻意是靜默的 ⇒ 沒有任何紅燈。landmarks.js 同一個坑(上線以來沒成功過)。

       ⚠ 備援端點:Overpass 是**志工營運**的,過載時回 **504**,而 504 回應**不帶 CORS header**
         ⇒ 瀏覽器只看得到 `net::ERR_FAILED`,看起來像我們的程式壞了(0812 為此繞了一大圈)。
         ⇒ 依序試最多兩個端點就停(不是全部掃一遍——那是把別人的服務當自己的重試池)。 */
    const ENDPOINTS = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];
    for (const ep of ENDPOINTS) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), REQ_TIMEOUT);
      try {
        const r = await fetch(`${ep}?data=${encodeURIComponent(q)}`, { method: "GET", signal: ctl.signal });
        clearTimeout(t);
        if (!r.ok) { failed = true; continue; }   // 429/504 是「等一下再來」,不是「這裡沒有建築」
        const j = await r.json();
        for (const el of j.elements || []) {
          if (el.type !== "way" || !Array.isArray(el.geometry) || el.geometry.length < 4) continue;
          // 精簡成 [高度, lat/lon 扁平陣列] —— 存原始 JSON 會把 localStorage 撐爆
          const ring = [];
          for (const p of el.geometry) ring.push(+p.lat.toFixed(6), +p.lon.toFixed(6));
          items.push([Math.round(heightOf(el.tags) * 10) / 10, ring]);
        }
        failed = false;
        break;                                    // 拿到就走,不再打第二個端點
      } catch {
        clearTimeout(t);
        failed = true;                            // 沒網路 / 超時 / 504 沒 CORS → 換下一個
      }
    }
  } catch {
    failed = true;
  } finally {
    inFlight = false;
  }

  const c2 = loadCache();
  c2.meta = cache.meta;
  c2.cells[key] = failed ? { at: Date.now(), fail: true, items: hit ? hit.items || [] : [] } : { at: Date.now(), items };
  saveCache(c2);
  return failed && hit ? hit.items || [] : items;
}

/* ---------- 建幾何 ---------- */
// 多邊形面積(公尺²,用世界座標算)——太小的不畫
function areaOf(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return Math.abs(a / 2);
}

/**
 * 把一格的建築資料做成一個合併後的 mesh。
 * @param {Array} items  [[高度, [lat,lon,...]], ...]
 * @param {(lat:number,lon:number)=>{x:number,z:number}} latLonToWorld  來自 realmap
 */
function buildMesh(items, latLonToWorld) {
  const geos = [];
  for (const [h, ring] of items) {
    const pts = [];
    for (let i = 0; i < ring.length; i += 2) {
      const w = latLonToWorld(ring[i], ring[i + 1]);
      if (!w) continue;
      // ⚠ Shape 是 XY 平面,之後整個 mesh 轉 -90° 躺平 ⇒ 這裡的 y 就是世界的 z
      pts.push(new THREE.Vector2(w.x, w.z));
    }
    if (pts.length < 4) continue;
    // OSM 的 way 首尾同點,Shape 會自己閉合 ⇒ 去掉重複的尾點免得產生零長度邊
    if (pts.length > 1) {
      const a = pts[0], b = pts[pts.length - 1];
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) pts.pop();
    }
    if (pts.length < 3 || areaOf(pts) < MIN_AREA) continue;
    try {
      const shape = new THREE.Shape(pts);
      const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);   // 躺平:Shape 的 +z(擠出方向)變成世界的 +y(往上)
      geos.push(g);
    } catch { /* 自交多邊形之類的怪資料:跳過這一棟,不影響其它 */ }
  }
  if (!geos.length) return null;

  // 合併成一個 mesh:186 棟各自 draw call 在手機上會掉幀
  let merged = null;
  try {
    merged = mergeGeometries(geos);
  } catch { merged = null; }
  for (const g of geos) if (g !== merged) g.dispose();
  if (!merged) return null;

  merged.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    color: 0xd9d3ea,   // 淡紫——學尋羊記 pastelize() 的 #e9e2f4,壓深一點好在戶外底圖上分得出來
    flatShading: true, // 平面著色:街廓的邊角更清楚(也更像積木,配得上 tsum 造型)
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = false;      // 影子關掉:186 棟投影在手機上太貴,靠受光的明暗就夠立體
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  return mesh;
}

/* ---------- 零相依的 geometry 合併(three 的 BufferGeometryUtils 在本專案沒被打包進來) ---------- */
function mergeGeometries(geos) {
  const attrNames = ["position", "normal"];
  let total = 0;
  for (const g of geos) total += g.getAttribute("position").count;
  const out = new THREE.BufferGeometry();
  for (const name of attrNames) {
    const first = geos[0].getAttribute(name);
    if (!first) continue;
    const itemSize = first.itemSize;
    const arr = new Float32Array(total * itemSize);
    let off = 0;
    for (const g of geos) {
      const a = g.getAttribute(name);
      if (!a) continue;
      arr.set(a.array.subarray(0, a.count * itemSize), off);
      off += a.count * itemSize;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  return out;
}

/**
 * 開場時建立真實建築量體。
 * 失敗一律回 null —— 建築是**加分**,沒有它牧場漫遊照樣完整(同 landmarks 的降級鐵則)。
 * @returns {Promise<{group:THREE.Group, count:number, dispose:()=>void}|null>}
 */
/* 0817 使用者:「看不到附近的高樓大廈」——舊版只在開場抓**出生那一格**(400m),
   走出去世界就變平的。改成逐格管理器:1.2 秒判位那條線每次餵目前位置進來,
   走進新格才抓(fetchCell 的五道禮貌閘全部原封不動:20 秒間隔/每日 12 次/快取 TTL/同時一個),
   已快取的格子走回來**零網路**直接重建。 */
export async function createBuildings(scene, { lat, lon, latLonToWorld, enabled = true } = {}) {
  if (!enabled || !latLonToWorld) return null;

  const group = new THREE.Group();
  group.name = "realBuildings";
  scene.add(group);

  const cellMeshes = new Map(); // cellKey → mesh
  const pending = new Set();    // 正在抓的格子(同格併發只跑一次)
  let disposed = false;
  let total = 0;
  let lastTry = 0;

  async function addCell(la, lo) {
    const key = cellKey(la, lo);
    if (disposed || cellMeshes.has(key) || pending.has(key)) return;
    pending.add(key);
    let items = [];
    try {
      items = await fetchCell(la, lo);
    } catch { /* 靜默:建築是加分不是玩法 */ }
    pending.delete(key);
    if (disposed || cellMeshes.has(key)) return;
    if (!items || !items.length) return; // 失敗/沒資料:fetchCell 的 TTL 會決定何時再試,這裡不用記
    const mesh = buildMesh(items, latLonToWorld);
    if (!mesh) return;
    cellMeshes.set(key, mesh);
    group.add(mesh);
    total += items.length;
  }

  await addCell(lat, lon); // 開場那一格照舊先到(呼叫端本來就不 await 整個 createBuildings)

  return {
    group,
    get count() { return total; },
    /** 每 1.2 秒的判位線餵進來;3 秒節流,走進沒建過的格子才動作 */
    update(la, lo) {
      const now = Date.now();
      if (now - lastTry < 3000) return;
      lastTry = now;
      void addCell(la, lo);
    },
    dispose() {
      disposed = true;
      scene.remove(group);
      for (const mesh of cellMeshes.values()) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      cellMeshes.clear();
    },
  };
}
