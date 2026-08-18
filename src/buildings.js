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

/* 0818 使用者四連發:「高樓太高大太厚」「看不到路與牧人」「牧人與羊穿進房子」「全是灰色、
   街道太窄動彈不得」。根因=真實高度照搬:信義區 180m 大樓=人高(2m)的 90 倍,第三人稱
   鏡頭(y≈3)整根埋在樓體裡 ⇒ 滿屏灰、不知道路在哪。遊戲化四板斧(快取內容不動——
   存的是真實高度與輪廓,以下全在建 mesh 時做,舊快取直接受益):
   ① 高度壓縮:10m 以下(2~3 層)原樣,超過的部分壓 78%,天花板 26m(≈8 層)——
      高低差還在(平房 vs 大樓看得出來),但不再戳破天空。
   ② 輪廓向內縮 20%:街廓認得出來,巷弄卻變寬——看得到路、也走得過去。
   ③ 粉彩配色(per-building vertex color):六色粉彩由輪廓座標穩定雜湊,重建同色不閃爍。
   ④ 視線遮擋淡出+碰撞:見 updateFade / collide(牧人與羊不再穿牆,擋鏡頭的那格半透明)。 */
const GAME_H_KEEP = 10;         // 這個高度以下原樣保留
const GAME_H_RATE = 0.22;       // 超過部分的壓縮率
const GAME_H_MAX = 26;          // 遊戲內天花板(≈8 層樓)
const SHRINK = 0.8;             // 輪廓向形心內縮的比例
const gameHeight = (h) => Math.min(h <= GAME_H_KEEP ? h : GAME_H_KEEP + (h - GAME_H_KEEP) * GAME_H_RATE, GAME_H_MAX);
const PALETTE = [0xd9d3ea, 0xf0e6d2, 0xf3dbe0, 0xd6e4f0, 0xdcebd8, 0xe7e3da].map((c) => new THREE.Color(c));
const colorIdx = (ring) => Math.abs(Math.round(ring[0] * 1e6) * 31 + Math.round(ring[1] * 1e6)) % PALETTE.length;

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
  const colliders = [];   // [{minX,maxX,minZ,maxZ,h,pts:Float32Array[x0,z0,…]}] 給 collide/updateFade
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
    // ② 輪廓向形心內縮:街廓形狀還在,巷弄變寬(看得到路、走得過去)
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;
    for (const p of pts) { p.x = cx + (p.x - cx) * SHRINK; p.y = cy + (p.y - cy) * SHRINK; }
    const gh = gameHeight(h);   // ① 高度遊戲化壓縮
    try {
      const shape = new THREE.Shape(pts);
      const g = new THREE.ExtrudeGeometry(shape, { depth: gh, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);   // 躺平:Shape 的 +z(擠出方向)變成世界的 +y(往上)
      // ③ 粉彩配色:同一棟一個色,座標雜湊決定 ⇒ 走回來重建同色
      const col = PALETTE[colorIdx(ring)];
      const cnt = g.getAttribute("position").count;
      const carr = new Float32Array(cnt * 3);
      for (let k = 0; k < cnt; k += 1) { carr[k * 3] = col.r; carr[k * 3 + 1] = col.g; carr[k * 3 + 2] = col.b; }
      g.setAttribute("color", new THREE.BufferAttribute(carr, 3));
      geos.push(g);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      const flat = new Float32Array(pts.length * 2);
      for (let k = 0; k < pts.length; k += 1) {
        flat[k * 2] = pts[k].x; flat[k * 2 + 1] = pts[k].y;
        if (pts[k].x < minX) minX = pts[k].x;
        if (pts[k].x > maxX) maxX = pts[k].x;
        if (pts[k].y < minZ) minZ = pts[k].y;
        if (pts[k].y > maxZ) maxZ = pts[k].y;
      }
      colliders.push({ minX, maxX, minZ, maxZ, h: gh, pts: flat });
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
    vertexColors: true, // ③ 六色粉彩在 vertex color 上(合併後仍分得出棟)
    flatShading: true,  // 平面著色:街廓的邊角更清楚(也更像積木,配得上 tsum 造型)
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = false;      // 影子關掉:186 棟投影在手機上太貴,靠受光的明暗就夠立體
  mesh.receiveShadow = false;
  mesh.frustumCulled = true;
  return { mesh, colliders };
}

/* ---------- ④ 碰撞與視線遮擋的幾何小工具 ---------- */
// 點在多邊形內 + 最近邊推出:回傳修正後座標,沒碰到回 null
function pushOut(px, pz, r, pts) {
  const n = pts.length / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], zi = pts[i * 2 + 1], xj = pts[j * 2], zj = pts[j * 2 + 1];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  let bx = 0, bz = 0, bd = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = pts[j * 2], az = pts[j * 2 + 1];
    const ex = pts[i * 2] - ax, ez = pts[i * 2 + 1] - az;
    const L2 = ex * ex + ez * ez || 1e-9;
    let t = ((px - ax) * ex + (pz - az) * ez) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t, qz = az + ez * t;
    const d = (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
    if (d < bd) { bd = d; bx = qx; bz = qz; }
  }
  const dist = Math.sqrt(bd);
  if (!inside && dist >= r) return null;
  let dx = px - bx, dz = pz - bz;
  if (inside) { dx = -dx; dz = -dz; }   // 在樓裡:往最近邊界的外側推
  const len = Math.hypot(dx, dz) || 1;
  return { x: bx + (dx / len) * r, z: bz + (dz / len) * r };
}
// 線段 ab 與線段 cd 相交時回傳 ab 上的參數 t(0~1),否則 -1
function segX(ax, az, bx, bz, cx, cz, dx, dz) {
  const r1x = bx - ax, r1z = bz - az, r2x = dx - cx, r2z = dz - cz;
  const den = r1x * r2z - r1z * r2x;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
  const u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}
// 鏡頭→牧人的視線有沒有被這棟樓擋住(2D 邊相交+相交點高度低於樓頂;鏡頭在樓裡也會命中出口邊)
function segHitsPoly(cam, tx, ty, tz, b) {
  const pts = b.pts, n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const t = segX(cam.x, cam.z, tx, tz, pts[j * 2], pts[j * 2 + 1], pts[i * 2], pts[i * 2 + 1]);
    if (t >= 0) {
      const y = cam.y + (ty - cam.y) * t;
      if (y < b.h) return true;
    }
  }
  return false;
}

/* ---------- 零相依的 geometry 合併(three 的 BufferGeometryUtils 在本專案沒被打包進來) ---------- */
function mergeGeometries(geos) {
  const attrNames = ["position", "normal", "color"];
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

  const cellMeshes = new Map(); // cellKey → {mesh, colliders, fade}
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
    const built = buildMesh(items, latLonToWorld);
    if (!built) return;
    cellMeshes.set(key, { mesh: built.mesh, colliders: built.colliders, fade: 1 });
    group.add(built.mesh);
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
    /** ④ 碰撞(0818「牧人與羊會穿進房子裡」):在樓裡/貼太近就推到最近邊界外 r 公尺。
        呼叫端:每個實體每幀一次;bbox 粗篩後只有腳邊那幾棟會算到多邊形。 */
    collide(x, z, r = 0.5) {
      let cx = x, cz = z, hit = false;
      for (const cell of cellMeshes.values()) {
        for (const b of cell.colliders) {
          if (cx < b.minX - r || cx > b.maxX + r || cz < b.minZ - r || cz > b.maxZ + r) continue;
          const res = pushOut(cx, cz, r, b.pts);
          if (res) { cx = res.x; cz = res.z; hit = true; }
        }
      }
      return hit ? { x: cx, z: cz } : null;
    },
    /** ④ 視線遮擋淡出(0818「看不到路與牧人」):鏡頭→牧人的視線被某棟樓擋住
        ⇒ 那一格建築整體淡到半透明(合併 mesh 做不到單棟淡,整格淡反而看得到整條街)。 */
    updateFade(cam, target) {
      const tx = target.x, tz = target.z;
      const ty = (target.y || 0) + 1.3;   // 看牧人的頭,不是腳
      for (const cell of cellMeshes.values()) {
        let blocked = false;
        const loX = Math.min(cam.x, tx), hiX = Math.max(cam.x, tx);
        const loZ = Math.min(cam.z, tz), hiZ = Math.max(cam.z, tz);
        for (const b of cell.colliders) {
          if (hiX < b.minX || loX > b.maxX || hiZ < b.minZ || loZ > b.maxZ) continue;
          if (segHitsPoly(cam, tx, ty, tz, b)) { blocked = true; break; }
        }
        const goal = blocked ? 0.42 : 1;
        cell.fade += (goal - cell.fade) * 0.18;
        if (Math.abs(cell.fade - goal) < 0.02) cell.fade = goal;
        const m = cell.mesh.material;
        if (m.opacity !== cell.fade) {
          m.opacity = cell.fade;
          m.transparent = cell.fade < 0.999;
        }
      }
    },
    dispose() {
      disposed = true;
      scene.remove(group);
      for (const cell of cellMeshes.values()) {
        cell.mesh.geometry.dispose();
        cell.mesh.material.dispose();
      }
      cellMeshes.clear();
    },
  };
}
