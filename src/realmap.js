// 🗺 真實地圖地面(0811 使用者點名「要跟皮克敏一樣,可以選擇走在真實的 3D 地圖上,像尋羊記」)
// 把你**所在位置**的地圖圖磚鋪成 3D 地面,牧人與羊群就走在真實的街道上。
// 圖磚來源=CARTO Voyager(OpenStreetMap 資料),與尋羊記(sheepquest)同一份 ⇒ 兩站看起來是同一個世界。
//
// ★ 授權鐵則:用 OSM 圖磚當地面**必須**在畫面上標示來源(不是可選的裝飾)——
//   呼叫端要顯示「© OpenStreetMap 貢獻者 © CARTO」,見 index.html #mapCredit。
// ★ 離線鐵則:圖磚要連網才有。拿不到=`ok:false`,呼叫端**退回原本的曠野牧場**繼續玩,
//   絕不讓遊戲卡在黑地板(這站是 PWA,孩子在教會沒網路也要能玩)。
// ★ 座標系:世界 +x=東、+z=南(對齊 three 的預設右手座標與本引擎的 heading 慣例),
//   世界原點 (0,0)=開場時你站的那個經緯度。
import * as THREE from "three";

export const TILE_Z = 18;          // 縮放層級:z18 一磚≈140 公尺(看得到街廓與建物輪廓)
const TILE_PX = 256;
const SUBS = ["a", "b", "c", "d"];

/* 🎨 0812 使用者回報:「地上幾乎全白,看不清楚線與字」。三層原因疊在一起,不是單一個:
     ① CARTO Voyager 本來就是**淺色底圖**(給白背景網頁用的,不是給 3D 場景當地面)
     ② 場景用 ACESFilmic tone mapping + exposure 1.08 ⇒ 亮部再被提亮
     ③ realmap 模式的霧 near=140(z18 一磚才 140m)⇒ 一磚以外就開始被霧洗白
   ⇒ 在**地面材質**上做顏色強化(不動全場 tone mapping,免得人物與天空跟著變),
     再把霧往後推。配色參考尋羊記 pastelize():它好看的關鍵不是「更亮」,是**顏色分區明確**。
   ⚠ 這幾個數字是看著截圖調的,要再調就改這裡一處(三個磚材質共用同一段 shader)。*/
const LOOK = {
  contrast: 1.34,    // 對比:把路網/文字從白底裡拉出來
  saturation: 1.62,  // 飽和:綠地、水、道路各自的顏色分得開(尋羊記的做法)
  brightness: 0.88,  // 整體壓暗一點,抵銷 tone mapping 的提亮
};

/* 🌅 時段氛圍(0826:使用者「尋羊記的真實地圖…可以學習參考」拍板「先搬時段氛圍」)
   ──────────────────────────────────────────────────────────────────────────────
   ★★ 為什麼**地面**也要能染色 —— 這是真實地圖模式原本沒有時段氛圍的根本原因:
     圖磚是 `MeshBasicMaterial`(**不吃光**),所以只調場景燈光的話,
     天空會變黑而地面照樣雪亮 ⇒ 走一走就變成「黑天配白地」,看起來像壞掉。
     (game.js 的 updateWeather 就是因為這個把 realmap 模式硬鎖在正午 12 點。)
   ⇒ 解法:天和地**一起**調 —— 燈光走場景那邊,地面走這裡的 shader。
   ★ uniform 而不是寫死的字串:三個 LOOK 值原本是 `${...}` 內嵌進 shader 的常數,
     那樣執行時改不了。染色值必須是 uniform 才能跟著時間變。
   ★ **共享同一個 uniform 物件**:每塊磚各有自己的 material,但 shader 裡引用的是
     這同一個物件 ⇒ 改一次,已經貼上的與之後才載入的磚**全部**同步(各自一份的話,
     後來載入的磚會停在載入那一刻的時段,走一走就出現「補丁色塊」)。
   ⚠ 夜晚**不可以壓暗**(同尋羊記羊11 的鐵則):這是走在路上看的地圖,
     地面暗到看不清路名就是安全問題,不是美感問題 ⇒ 只做冷/暖色偏移,亮度最多降 7%。 */
const todUniform = { value: new THREE.Vector3(1, 1, 1) };   // 逐通道乘數(RGB)
export function setGroundTod(r, g, b) {
  todUniform.value.set(r, g, b);
}

// 公尺/像素(Web Mercator;隨緯度變化——台灣約 0.54,赤道約 0.6)
export function metersPerPixel(lat, z = TILE_Z) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
}
export function lonToPx(lon, z = TILE_Z) {
  return ((lon + 180) / 360) * TILE_PX * Math.pow(2, z);
}
export function latToPx(lat, z = TILE_Z) {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE_PX * Math.pow(2, z);
}
export function pxToLon(px, z = TILE_Z) {
  return (px / (TILE_PX * Math.pow(2, z))) * 360 - 180;
}
export function pxToLat(py, z = TILE_Z) {
  const n = Math.PI - (2 * Math.PI * py) / (TILE_PX * Math.pow(2, z));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function tileUrl(x, y, z) {
  const s = SUBS[(x + y) % SUBS.length];
  return `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}@2x.png`;
}

/* 建一塊會跟著你延伸的真實地圖地面。
   scene=three 場景;lat/lon=開場站的位置;radius=以你為中心先鋪幾圈磚(2 ⇒ 5×5)。
   回傳 { ok, group, mpp, tileMeters, update(x,z), worldToLatLon(x,z), latLonToWorld(lat,lon), dispose() }
   —— update() 由主迴圈每幀呼叫(內部自己節流):走到哪就補到哪,遠的磚回收。 */
export async function createRealMap(scene, { lat, lon, radius = 2, z = TILE_Z } = {}) {
  const mpp = metersPerPixel(lat, z);
  const tileMeters = TILE_PX * mpp;
  // 原點:你站的位置(像素座標);世界公尺 = (像素 - 原點像素) × mpp
  const originPx = lonToPx(lon, z);
  const originPy = latToPx(lat, z);

  const group = new THREE.Group();
  group.renderOrder = -1;
  scene.add(group);
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous"); // 圖磚是跨網域資源,沒設會變成汙染貼圖
  const tiles = new Map();            // "x,y" → mesh
  let loaded = 0;
  let failed = 0;

  const geo = new THREE.PlaneGeometry(tileMeters, tileMeters);

  function addTile(tx, ty) {
    const key = `${tx},${ty}`;
    if (tiles.has(key)) return null;
    // 磚中心的世界座標:磚左上角像素 +128px,再減原點
    const cx = (tx * TILE_PX + TILE_PX / 2 - originPx) * mpp;
    const cz = (ty * TILE_PX + TILE_PX / 2 - originPy) * mpp;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    /* 🎨 對比/飽和強化(見檔頭 LOOK):注入在 fog 之前 —— 順序很重要,
       要先把圖磚本身的顏色拉出來,再讓霧照常吃它,不然遠處會出現「顏色比近處還鮮」的怪畫面。 */
    mat.onBeforeCompile = (shader) => {
      // 🌅 共享同一個 uniform 物件 ⇒ 改一次全部的磚同步(見檔頭 setGroundTod 的說明)
      shader.uniforms.uTod = todUniform;
      shader.fragmentShader = shader.fragmentShader
        .replace("void main() {", "uniform vec3 uTod;\nvoid main() {")
        .replace(
          "#include <fog_fragment>",
          `{
           vec3 mc = gl_FragColor.rgb;
           mc = (mc - 0.5) * ${LOOK.contrast.toFixed(3)} + 0.5;
           float ml = dot(mc, vec3(0.2126, 0.7152, 0.0722));
           mc = mix(vec3(ml), mc, ${LOOK.saturation.toFixed(3)});
           mc *= ${LOOK.brightness.toFixed(3)};
           mc *= uTod;                       // 🌅 時段染色(逐通道;夜晚偏冷、黃昏偏暖)
           gl_FragColor.rgb = clamp(mc, 0.0, 1.0);
         }
         #include <fog_fragment>`,
        );
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0.01, cz); // 抬 1cm:壓在草地之上,免得 z-fighting 閃爍
    group.add(mesh);
    tiles.set(key, mesh);
    return new Promise((resolve) => {
      loader.load(
        tileUrl(tx, ty, z),
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearFilter;   // 不產 mipmap:非 2 的冪次尺寸在部分手機 GPU 會整片變黑
          tex.generateMipmaps = false;
          mat.map = tex;
          mat.opacity = 1;                       // 淡入完成(載到才顯示,避免白格閃一下)
          mat.needsUpdate = true;
          loaded += 1;
          resolve(true);
        },
        undefined,
        () => { failed += 1; resolve(false); },  // 單磚失敗=那格留空,不影響其它磚
      );
    });
  }

  /* ⚠ 只等「你腳下那一塊」就開場——0811 實測:等 5×5 全部載完要 7~9 秒,
     使用者按下「出發」後乾等一片空白,會以為當掉了。腳下那塊 ≈1 秒,
     其餘 24 塊在你走路的時候自己補上(視野內本來也一次看不完)。 */
  const ctx = Math.floor(originPx / TILE_PX);
  const cty = Math.floor(originPy / TILE_PX);
  let centerOk = await addTile(ctx, cty);
  if (!centerOk) centerOk = await addTile(ctx + 1, cty); // 再給一次機會:單磚失敗可能只是那一格

  if (!centerOk) { // 兩塊都拿不到 = 沒網路/被擋 ⇒ 告訴呼叫端退回曠野牧場
    scene.remove(group);
    geo.dispose();
    return { ok: false, reason: "tiles-failed", loaded, failed };
  }
  // 其餘的不等它(fire-and-forget),載好一塊顯示一塊
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) addTile(ctx + dx, cty + dy);
  }

  let lastKey = "";
  return {
    ok: true,
    group,
    mpp,
    tileMeters,
    get stats() { return { loaded, failed, live: tiles.size }; },
    // 走到哪補到哪(自己節流:同一格磚內不重算)
    update(worldX, worldZ) {
      const px = originPx + worldX / mpp;
      const py = originPy + worldZ / mpp;
      const tx = Math.floor(px / TILE_PX);
      const ty = Math.floor(py / TILE_PX);
      const key = `${tx},${ty}`;
      if (key === lastKey) return;
      lastKey = key;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) addTile(tx + dx, ty + dy);
      }
      // 回收:離現在位置超過 radius+1 圈的磚(手機記憶體有限,一直走會爆)
      for (const [k, mesh] of tiles) {
        const [kx, ky] = k.split(",").map(Number);
        if (Math.abs(kx - tx) > radius + 1 || Math.abs(ky - ty) > radius + 1) {
          group.remove(mesh);
          if (mesh.material.map) mesh.material.map.dispose();
          mesh.material.dispose();
          tiles.delete(k);
        }
      }
    },
    // 世界座標 → 真實經緯度(給「你現在站在哪條街」用)
    worldToLatLon(worldX, worldZ) {
      return {
        lat: pxToLat(originPy + worldZ / mpp, z),
        lon: pxToLon(originPx + worldX / mpp, z),
      };
    },
    /* 真實經緯度 → 世界座標(worldToLatLon 的反函數)。
       🗺 地標任務要用:把「那座公園」放在它**真正的位置**上,而不是「在你附近隨便找個點」——
       孩子走過去看到的必須真的是那座公園,不然「真實地標」就只是個標籤。 */
    latLonToWorld(lat2, lon2) {
      return {
        x: (lonToPx(lon2, z) - originPx) * mpp,
        z: (latToPx(lat2, z) - originPy) * mpp,
      };
    },
    dispose() {
      for (const [, mesh] of tiles) {
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
      }
      tiles.clear();
      geo.dispose();
      scene.remove(group);
    },
  };
}
