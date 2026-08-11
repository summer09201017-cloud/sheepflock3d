/* gen-landmarks.mjs — 🗺 預烤「真實地標包」(公園/學校/操場/廣場)
 *
 * 用途:真實地圖漫遊時,走進公園或學校就有一隻**特別的羊**在那裡等你。
 *   地標資料來自 OpenStreetMap(Overpass API),**烤成 JSON 進版控**
 *   ⇒ 線上零 API 呼叫、離線也玩得到、絕對不會被 rate limit 擋。
 *
 * ★★ 只烤「公開知名地標」,絕對不要烤使用者家附近 ★★
 *   理由(尋羊記 index.html:163 立的規則):「地名是執行時查來的,**不寫死在原始碼裡**
 *   —— 公開 repo 不會帶著任何人的所在地」。把自家周邊的公園學校烤進公開 repo,
 *   等於把住處發佈到 GitHub 上。
 *   ⇒ 預烤包只服務**台北測試地圖**那個模式(台北車站一帶,人人皆知的公共設施)。
 *   ⇒ 「我家附近 GPS」模式走 src/landmarks.js 的**線上補查**,結果只存在那支手機的 localStorage。
 *
 * 用法(需要網路,平常不必跑;要換範圍才跑):
 *   node scripts/gen-landmarks.mjs                       # 預設:台北車站一帶 3 公里
 *   node scripts/gen-landmarks.mjs 25.0330 121.5654 3000 # 自訂 中心緯度 經度 半徑(公尺)
 *
 * ⚠ Overpass 是志工營運的免費服務:這支腳本**只發一個請求**,而且不要一直重跑。
 */
import fs from "node:fs";
import path from "node:path";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const OUT = path.join(import.meta.dirname, "..", "src", "landmarks-taipei.json");

const lat0 = Number(process.argv[2] || 25.0330);
const lon0 = Number(process.argv[3] || 121.5654);
const radiusM = Number(process.argv[4] || 3000);

/* 地標種類 → 觸發半徑(公尺)與說明。
   ★ 半徑不是美感選的:真實地圖上人是「走過去」的,半徑太小=站在公園裡卻沒反應
     (0811 那一課:換掉地基會有一組尺度假設跟著崩)。用地標本身的大小當基準。 */
const KINDS = {
  park: { r: 70, icon: "🌳", label: "公園" },
  school: { r: 80, icon: "🏫", label: "學校" },
  playground: { r: 35, icon: "🛝", label: "遊戲場" },
  pitch: { r: 45, icon: "⚽", label: "球場" },
  square: { r: 45, icon: "🏛", label: "廣場" },
  garden: { r: 55, icon: "🌷", label: "花園" },
};

/* 名稱清理:OSM 的 name 常帶零寬空白(U+200B)、BOM、連續空白 —— 那些字在畫面上看不見,
   卻會讓「同一座公園」比對不出來、也會讓字串長度看起來很怪。 */
function cleanName(s) {
  return String(s).replace(/[​-‏﻿­]/g, "").replace(/\s+/g, " ").trim();
}

/* 只留「唸得出來的地標」。★ 這不是潔癖:實測抓到「Knutsen Petite Cafe 小花圃」
   (咖啡店門口的花圃被標成 leisure=park)——孩子看到「走進 Knutsen Petite Cafe 小花圃」
   完全不知道那是什麼地方,而地標羊的重點就是「那個我認得的地方」。
   ⇒ 要求名字帶一個常見的地名後綴;比對不到就丟掉(寧缺勿濫)。 */
const NAME_OK = {
  park: /(公園|綠地|花園|苗圃|植物園|森林|河濱|園區)$|(公園|綠地|河濱公園)/,
  garden: /(花園|園|綠地|苗圃)/,
  playground: /(遊戲場|兒童|遊樂|公園)/,
  pitch: /(球場|操場|運動場|棒球|籃球|網球|田徑|足球)/,
  square: /(廣場)/,
  school: /(國小|國中|高中|高職|國民小學|國民中學|高級中學|實驗小學|附小|附中|大學|學院|專科|校區|學校)/,
};

function kindOf(tags) {
  if (tags.leisure === "park") return "park";
  if (tags.leisure === "garden") return "garden";
  if (tags.leisure === "playground") return "playground";
  if (tags.leisure === "pitch" || tags.leisure === "track") return "pitch";
  if (tags.place === "square") return "square";
  if (tags.amenity === "school" || tags.amenity === "college" || tags.amenity === "university") return "school";
  return null;
}

const query = `[out:json][timeout:60];
(
  nwr["leisure"~"^(park|garden|playground|pitch|track)$"](around:${radiusM},${lat0},${lon0});
  nwr["amenity"~"^(school|college|university)$"](around:${radiusM},${lat0},${lon0});
  nwr["place"="square"](around:${radiusM},${lat0},${lon0});
);
out center tags;`;

console.log(`🗺 向 Overpass 要「${lat0},${lon0} 半徑 ${radiusM}m」的公園/學校/球場/廣場…`);

let data;
try {
  const r = await fetch(OVERPASS, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", "user-agent": "hfpc-sheepflock3d/1.0 (church kids game; one-off bake)" },
    body: query,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  data = await r.json();
} catch (e) {
  console.error(`🔴 抓不到:${e.message}`);
  console.error("   Overpass 忙碌時常回 429/504 —— 等幾分鐘再跑,或換 https://overpass.kumi.systems/api/interpreter");
  process.exitCode = 1;              // ⚠ 不用 process.exit():fetch 之後 exit 會打亂離開碼(守門 #36)
}

if (data) {
  const seen = new Set();
  const out = [];
  for (const el of data.elements || []) {
    const t = el.tags || {};
    const name = cleanName(t["name:zh"] || t.name || "");
    if (!name) continue;                             // 沒名字的地標對玩家沒意義(「無名公園」不會讓孩子想去)
    const kind = kindOf(t);
    if (!kind) continue;
    if (!NAME_OK[kind].test(name)) continue;         // 唸不出來是什麼地方的就不要(見 NAME_OK 註解)
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = name + "|" + lat.toFixed(3) + "|" + lon.toFixed(3);
    if (seen.has(key)) continue;                     // 同一座公園常有好幾個 way/relation
    seen.add(key);
    out.push({ n: name.slice(0, 30), k: kind, lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)), r: KINDS[kind].r });
  }
  out.sort((a, b) => (a.n < b.n ? -1 : 1));

  const pack = {
    v: 1,
    note: "台北車站一帶的公開地標(給「🧪 台北測試地圖」用)。★ 不要在這裡放任何人的住處周邊——見 scripts/gen-landmarks.mjs 檔頭。",
    center: { lat: lat0, lon: lon0, radiusM },
    source: "OpenStreetMap contributors (ODbL) via Overpass API",
    items: out,
  };
  fs.writeFileSync(OUT, JSON.stringify(pack, null, 1) + "\n", "utf8");

  const byKind = {};
  for (const it of out) byKind[it.k] = (byKind[it.k] || 0) + 1;
  console.log(`✓ 寫入 ${path.relative(process.cwd(), OUT)}:${out.length} 個地標`);
  console.log("  " + Object.entries(byKind).map(([k, n]) => `${KINDS[k].icon}${KINDS[k].label} ${n}`).join(" · "));
  console.log(`  檔案大小 ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
}
