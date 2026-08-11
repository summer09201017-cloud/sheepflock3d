/* landmarks.js — 🗺 真實地標任務:走到真的公園/學校,就有一隻特別的羊在那裡等你
 *
 * 兩個資料來源(0812 使用者拍板「預烤包 + 線上補查」):
 *   ① 預烤包 `landmarks-taipei.json` —— 台北車站一帶的**公開**地標,進版控、線上零 API、離線可用。
 *      服務「🧪 台北測試地圖」那個模式。
 *   ② 線上補查 —— 走出預烤範圍(=真的用 GPS 在自己家附近走)才查一次 Overpass,
 *      結果**只存在這支裝置的 localStorage**。
 *
 * ★★ 為什麼補查的結果不進版控:尋羊記 index.html:163 立的規則——
 *    「地名是執行時查來的,不寫死在原始碼裡 —— 公開 repo 不會帶著任何人的所在地」。
 *    把自家周邊烤進公開 repo = 把住處發佈到 GitHub。
 *
 * ★★ 「別打 API 打到爆」(使用者 0812 明白提的)——五道閘,全部都要在:
 *    ① **只在跨進新的格子時查**(格 ≈ 1.1 公里),同一格永遠只查一次;
 *    ② 兩次請求至少間隔 20 秒,且同時只有一個請求在飛;
 *    ③ 每天最多 25 次(存在快取的 meta 裡,跨 session 也算);
 *    ④ 查到的結果快取 30 天;**查失敗/查到空的也要記**(記 1 天),不然會每秒重試;
 *    ⑤ 快取最多 60 格,滿了丟最舊的。
 *    ⇒ 最壞情況:一個人走一整天 = 25 個請求。Overpass 是志工營運的,這個量是有禮貌的。
 *
 * ★ 隱私:送出去的**不是手機拿到的精確座標**,是那個格子的中心點(≈1 公里粗)——
 *   與尋羊記查地名時同一個做法。而且可以整個關掉(settings.landmarksOnline = false)。
 */
import PACK from "./landmarks-taipei.json";

const CACHE_KEY = "sheepflock3d-landmarks-v1";        // 線上補查結果(只在這支裝置)
const CLAIM_KEY = "sheepflock3d-landmark-claims-v1";  // 「這座公園今天的羊領過了」
const CELL = 0.01;                                    // ≈1.1 公里見方
const CELL_TTL = 30 * 864e5;                          // 查到的:30 天
const MISS_TTL = 1 * 864e5;                           // 真的沒地標(200 但 0 筆):1 天後才再試
/* 網路失敗/超時:只鎖 10 分鐘。
   ★ 為什麼要跟 MISS_TTL 分開:0812 實測 Overpass 忙起來要 9~12 秒,超時是**常態不是結論**。
     把「這次沒連上」記成「這一帶沒有地標」並鎖一整天,等於一次塞車就讓孩子今天走遍公園都沒有羊。 */
const FAIL_TTL = 6e5;
const MIN_GAP_MS = 20000;                             // 兩次請求最少間隔
const DAY_CAP = 25;                                   // 每天上限
const MAX_CELLS = 60;                                 // 快取格數上限
const CLAIM_COOLDOWN = 864e5;                         // 同一座地標 24 小時後可以再來一隻

const KIND_META = {
  park: { icon: "🌳", label: "公園" },
  garden: { icon: "🌷", label: "花園" },
  playground: { icon: "🛝", label: "遊戲場" },
  pitch: { icon: "⚽", label: "球場" },
  square: { icon: "🏛", label: "廣場" },
  school: { icon: "🏫", label: "學校" },
};
const DEFAULT_R = { park: 70, garden: 55, playground: 35, pitch: 45, square: 45, school: 80 };

/* ---------- 小工具 ---------- */
function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;   // 壞檔/私密模式=當作沒有,不炸
  }
}
function writeJson(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}
const cellKey = (lat, lon) => `${Math.floor(lat / CELL)}_${Math.floor(lon / CELL)}`;
const cellCentre = (lat, lon) => ({
  lat: (Math.floor(lat / CELL) + 0.5) * CELL,
  lon: (Math.floor(lon / CELL) + 0.5) * CELL,
});

// haversine(公尺)
export function distM(aLat, aLon, bLat, bLon) {
  const R = 6371000, rad = Math.PI / 180;
  const dLa = (bLat - aLat) * rad, dLo = (bLon - aLon) * rad;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function landmarkMeta(kind) {
  return KIND_META[kind] || { icon: "📍", label: "地標" };
}

/* ---------- 快取 ---------- */
function loadCache() {
  const c = readJson(CACHE_KEY, null);
  if (c && c.v === 1 && c.cells && typeof c.cells === "object") {
    c.meta = c.meta || {};
    return c;
  }
  return { v: 1, cells: {}, meta: {} };
}
function saveCache(c) {
  // 滿了丟最舊的(依 at 排序)
  const keys = Object.keys(c.cells);
  if (keys.length > MAX_CELLS) {
    keys.sort((a, b) => (c.cells[a].at || 0) - (c.cells[b].at || 0));
    for (const k of keys.slice(0, keys.length - MAX_CELLS)) delete c.cells[k];
  }
  writeJson(CACHE_KEY, c);
}

/* ---------- 地標查詢 ---------- */
/* 把「預烤包 + 已快取的格子」合起來,找出離 (lat,lon) 最近、而且**已經走進去**的那一個。
   回傳 {n, k, lat, lon, r, distM} 或 null。 */
export function findLandmarkAt(lat, lon) {
  let best = null;
  const consider = (it) => {
    const r = Number(it.r) || DEFAULT_R[it.k] || 50;
    const d = distM(lat, lon, it.lat, it.lon);
    if (d > r) return;                                  // 還沒走進去
    if (!best || d < best.distM) best = { ...it, r, distM: d };
  };
  for (const it of PACK.items || []) consider(it);
  const cache = loadCache();
  for (const k in cache.cells) for (const it of cache.cells[k].items || []) consider(it);
  return best;
}

/* 這一格在預烤包裡有涵蓋嗎?(有就不必線上補查) */
function packCoversCell(lat, lon) {
  const c = PACK.center;
  if (!c) return false;
  // 格中心離預烤中心 < 預烤半徑 ⇒ 算涵蓋(邊界模糊沒關係,補查本來就是保險)
  const p = cellCentre(lat, lon);
  return distM(p.lat, p.lon, c.lat, c.lon) <= (c.radiusM || 0);
}

let inFlight = false;
let lastReqAt = 0;

/* 🔍 診斷探針(艦隊 probe() 慣例):補查「為什麼沒發請求」有七個理由,
   而它們全都是「安靜地不做事」——沒有這支,驗收只看得到「沒發請求」,分不出是節流生效還是壞了。
   0812 就是靠它一次抓到 packCoversCell 把整個台北都算成「預烤涵蓋」。 */
let lastReason = "(還沒跑過)";
export function landmarksDebug(lat, lon) {
  const cache = loadCache();
  return {
    lastReason,
    inFlight, lastReqAt,
    cells: Object.keys(cache.cells).length,
    meta: cache.meta,
    packCentre: PACK.center,
    ...(Number.isFinite(lat) && Number.isFinite(lon)
      ? {
        cell: cellKey(lat, lon),
        cellCentre: cellCentre(lat, lon),
        distToPackCentreM: Math.round(distM(cellCentre(lat, lon).lat, cellCentre(lat, lon).lon, PACK.center.lat, PACK.center.lon)),
        covered: packCoversCell(lat, lon),
      }
      : {}),
  };
}

/* 線上補查(走出預烤範圍才會真的發請求)。永遠 resolve,失敗一律靜默。
   回傳 true=這次真的補到了新資料(呼叫端可以重新判位)。 */
export async function topUpLandmarks(lat, lon, { enabled = true } = {}) {
  const no = (why) => { lastReason = why; return false; };
  if (!enabled) return no("關閉");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return no("座標不是數字");
  if (packCoversCell(lat, lon)) return no("預烤包已涵蓋");   // 閘①:預烤包已經涵蓋
  if (inFlight) return no("已有請求在飛");                  // 閘②:同時只有一個請求

  const key = cellKey(lat, lon);
  const cache = loadCache();
  const hit = cache.cells[key];
  const now = Date.now();
  if (hit) {
    // 閘④:查空的也要記,不然每秒重試。三種壽命:查到的 30 天 / 真的沒有 1 天 / 沒連上 10 分鐘
    const ttl = hit.items && hit.items.length ? CELL_TTL : hit.failed ? FAIL_TTL : MISS_TTL;
    if (now - (hit.at || 0) < ttl) return no(hit.failed ? "這格上次沒連上(10 分鐘後再試)" : "這格查過了(快取命中)");
  }
  if (now - lastReqAt < MIN_GAP_MS) return no("兩次請求間隔不足 20 秒");  // 閘②:間隔
  const day = new Date().toISOString().slice(0, 10);
  if (cache.meta.day !== day) { cache.meta.day = day; cache.meta.count = 0; }
  if ((cache.meta.count || 0) >= DAY_CAP) return no(`今天已查 ${cache.meta.count} 次(上限 ${DAY_CAP})`);

  // ★ 送出去的是**格中心**,不是手機的精確座標
  const p = cellCentre(lat, lon);
  const q = `[out:json][timeout:25];
(
  nwr["leisure"~"^(park|garden|playground|pitch|track)$"](around:900,${p.lat.toFixed(4)},${p.lon.toFixed(4)});
  nwr["amenity"~"^(school|college|university)$"](around:900,${p.lat.toFixed(4)},${p.lon.toFixed(4)});
  nwr["place"="square"](around:900,${p.lat.toFixed(4)},${p.lon.toFixed(4)});
);
out center tags;`;

  inFlight = true;
  lastReqAt = now;
  lastReason = "發出請求";
  cache.meta.count = (cache.meta.count || 0) + 1;
  saveCache(cache);                                       // 先記帳再打:失敗也算一次,才擋得住連環重試

  let items = [];
  let failed = false;
  try {
    const ctl = new AbortController();
    /* ⏱ 30 秒。★ 這個數字是量出來的,不是猜的:0812 在瀏覽器實測 Overpass 同一段查詢
       要 8.9~12.3 秒(它是志工營運、常常滿載)。第一版寫 12 秒 ⇒ **剛好會砍掉成功的請求**,
       而且失敗是靜默的 ⇒ 線上補查看起來「永遠找不到地標」,完全不會有人知道是超時。
       這是背景工作(fire-and-forget),等久一點不影響任何畫面。 */
    const t = setTimeout(() => ctl.abort(), 30000);
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST", body: q, signal: ctl.signal,
      headers: { "content-type": "text/plain;charset=UTF-8" },
    });
    clearTimeout(t);
    if (r.ok) items = normalizeOverpass(await r.json());
    else failed = true;                                    // 429/504 是「等一下再來」,不是「這裡沒公園」
  } catch {
    /* 沒網路 / 被擋 / 超時 / Overpass 忙 → 記成 failed,10 分鐘後再試。
       ★ 絕不可以讓它變成錯誤訊息:地標羊是**加分**功能,沒有它遊戲照樣完整。 */
    failed = true;
  } finally {
    inFlight = false;
  }
  lastReason = failed ? "請求失敗(10 分鐘後再試)" : `補到 ${items.length} 個地標`;

  const c2 = loadCache();
  c2.meta = cache.meta;
  c2.cells[key] = { at: Date.now(), items, ...(failed ? { failed: true } : {}) };
  saveCache(c2);
  return items.length > 0;
}

const NAME_OK = {
  park: /(公園|綠地|花園|苗圃|植物園|森林|河濱|園區)/,
  garden: /(花園|園|綠地|苗圃)/,
  playground: /(遊戲場|兒童|遊樂|公園)/,
  pitch: /(球場|操場|運動場|棒球|籃球|網球|田徑|足球)/,
  square: /(廣場)/,
  school: /(國小|國中|高中|高職|國民小學|國民中學|高級中學|實驗小學|附小|附中|大學|學院|專科|校區|學校)/,
};
function kindOf(t) {
  if (t.leisure === "park") return "park";
  if (t.leisure === "garden") return "garden";
  if (t.leisure === "playground") return "playground";
  if (t.leisure === "pitch" || t.leisure === "track") return "pitch";
  if (t.place === "square") return "square";
  if (t.amenity === "school" || t.amenity === "college" || t.amenity === "university") return "school";
  return null;
}
/* 與 scripts/gen-landmarks.mjs 同一套清理與過濾(名字唸不出來是什麼地方的就不要)。
   ★ export 出來是為了**可以確定性測試**:Overpass 是志工服務,實測會回 504,
     把「解析對不對」綁在「今天它有沒有空」上面,驗收就變成看天氣(0812 踩過)。 */
export function normalizeOverpass(data) {
  const seen = new Set(), out = [];
  for (const el of (data && data.elements) || []) {
    const t = el.tags || {};
    const n = String(t["name:zh"] || t.name || "").replace(/[​-‏﻿­]/g, "").replace(/\s+/g, " ").trim();
    if (!n) continue;
    const k = kindOf(t);
    if (!k || !NAME_OK[k].test(n)) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = n + "|" + lat.toFixed(3) + "|" + lon.toFixed(3);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ n: n.slice(0, 30), k, lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)), r: DEFAULT_R[k] || 50 });
    if (out.length >= 80) break;                          // 一格夠用就好,別把 localStorage 塞爆
  }
  return out;
}

/* ---------- 「這座地標的羊領過了嗎」(只存在這支裝置) ---------- */
const claimKeyOf = (lm) => `${lm.n}|${lm.lat.toFixed(4)}`;

export function landmarkClaimed(lm) {
  const c = readJson(CLAIM_KEY, {});
  const at = c[claimKeyOf(lm)];
  return !!at && Date.now() - at < CLAIM_COOLDOWN;        // 24 小時後可以再來一隻(下次來公園還有驚喜)
}
export function claimLandmark(lm) {
  const c = readJson(CLAIM_KEY, {});
  c[claimKeyOf(lm)] = Date.now();
  // 名單別無限長大:只留最近 200 筆
  const keys = Object.keys(c);
  if (keys.length > 200) {
    keys.sort((a, b) => c[a] - c[b]);
    for (const k of keys.slice(0, keys.length - 200)) delete c[k];
  }
  writeJson(CLAIM_KEY, c);
}

export const packInfo = () => ({ count: (PACK.items || []).length, center: PACK.center });
