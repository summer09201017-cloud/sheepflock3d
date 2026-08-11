/* verify-landmarks.mjs — 🗺 真實地標任務的走位驗收
 *
 * 為什麼要「真的走過去」而不是只讀程式碼:0811 那一課——換掉遊戲的地基會有一組尺度假設
 * 跟著崩,而且**六個全都不亮紅燈**(clamp 太小、生成半徑、光柱高度、鏡頭焦點…)。
 * 地標任務同樣是「靠座標換算成立」的功能:算式錯一個號誌位,人就永遠走不到地標裡。
 *
 * 用法:npm run build 之後
 *   node scripts/verify-landmarks.mjs [port]     # 預設 4319(需先起 vite preview)
 *
 * ⚠ 用 process.exitCode,不用 process.exit()(fetch/瀏覽器之後 exit 會打亂離開碼,守門 #36)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.argv[2] || 4319);
const BASE = `http://localhost:${PORT}/`;
const PACK = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "src", "landmarks-taipei.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { if (c) { pass++; console.log(`  🟢 ${n}`); } else { fail++; console.log(`  🔴 ${n} ${extra}`); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
/* ⚠ Overpass 是第三方志工服務,滿載時回 504 —— 瀏覽器會把它記成一條 console error。
   那**不是我們的缺陷**(程式已經把它處理成「10 分鐘後再試」),不可以算進紅燈,
   否則這支驗收會變成「Overpass 今天好不好」的溫度計。其它 console error 一律照抓。 */
const isThirdPartyNoise = (t) => /overpass/i.test(t) || (/Failed to load resource/.test(t) && /50\d|429|Gateway/.test(t));
const errors = [];
page.on("console", (m) => { if (m.type() === "error" && !isThirdPartyNoise(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(BASE, { waitUntil: "load" });

  // 乾淨的一台裝置:清掉圖鑑與地標領取紀錄
  await page.evaluate(() => {
    localStorage.removeItem("hfpc-sheepdex-v1");
    localStorage.removeItem("sheepflock3d-landmark-claims-v1");
    localStorage.removeItem("sheepflock3d-landmarks-v1");
  });
  await page.reload({ waitUntil: "load" });

  console.log("① 進「牧場漫遊・尋羊」+「🧪 台北測試地圖」");
  // 模式=尋羊(seek)。★ 用**真點擊**選卡片與出發,不用 evaluate 硬設狀態 ——
  //   只靠 evaluate 呼叫函式會繞過可見性檢查,「按鈕永遠不出現」照樣全綠(守門 #29 抓的就是這個)。
  await page.locator('.mode-card[data-mode="seek"]').click();
  await page.selectOption("#realMapSelect", "demo");
  await page.selectOption("#landmarkSelect", "on");
  await page.locator("#startMatchButton").click();

  // 等真實地圖起來(demo 模式不需定位)
  await page.waitForFunction(() => {
    const g = window.__game;
    return g && g.realMap && typeof g.realMap.latLonToWorld === "function";
  }, null, { timeout: 30000 });
  ok("真實地圖已啟用且有 latLonToWorld", true);

  console.log("② 座標換算來回一致(算式錯一個號誌位,人就永遠走不到地標裡)");
  const roundTrip = await page.evaluate(() => {
    const g = window.__game;
    const probes = [[25.0330, 121.5654], [25.0400, 121.5500], [25.0200, 121.5800]];
    return probes.map(([lat, lon]) => {
      const w = g.realMap.latLonToWorld(lat, lon);
      const back = g.realMap.worldToLatLon(w.x, w.z);
      return { lat, lon, x: w.x, z: w.z, dLat: Math.abs(back.lat - lat), dLon: Math.abs(back.lon - lon) };
    });
  });
  for (const r of roundTrip) {
    ok(`latLon→world→latLon 誤差 <1e-9 (${r.lat},${r.lon})`, r.dLat < 1e-9 && r.dLon < 1e-9, JSON.stringify(r));
  }
  // 開場站在台北車站 ⇒ 台北車站的世界座標必須≈原點
  const originW = roundTrip[0];
  ok("開場點的世界座標≈原點", Math.hypot(originW.x, originW.z) < 1, `x=${originW.x.toFixed(2)} z=${originW.z.toFixed(2)}`);

  console.log("③ 走進最近的地標 → 冒出一隻地標羊");
  // 找出離開場點最近、而且在 clamp 邊界內的地標
  const target = await page.evaluate((items) => {
    const g = window.__game;
    const bound = (g.bound || 15) - 1;
    let best = null;
    for (const it of items) {
      const w = g.realMap.latLonToWorld(it.lat, it.lon);
      if (Math.abs(w.x) > bound || Math.abs(w.z) > bound) continue;   // 走得到的範圍內
      const d = Math.hypot(w.x, w.z);
      if (!best || d < best.d) best = { ...it, x: w.x, z: w.z, d };
    }
    return best;
  }, PACK.items);
  ok("找得到一個走得到的地標", !!target, `bound 內沒有地標(clamp 太小?)`);

  if (target) {
    console.log(`   → 目標:${target.n}(${target.k})距開場點 ${Math.round(target.d)} 公尺,半徑 ${target.r}`);
    // 把牧人放到地標中心,然後讓遊戲跑幾秒(判位是 1.2 秒節流)
    const spawned = await page.evaluate(async (t) => {
      const g = window.__game;
      g.my.pos.x = t.x; g.my.pos.z = t.z;
      g.lost = null; g.holdRoam = false; g._lmT = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 8000) {
        await new Promise((r) => setTimeout(r, 200));
        if (g.lost && g.lost.landmark) return { n: g.lost.landmark.n, k: g.lost.landmark.k,
          gift: g.lost.genes.gift, size: g.lost.genes.size,
          beaconColor: g.lost.beacon ? "#" + g.lost.beacon.material.color.getHexString() : null,
          sheepX: g.lost.pos.x, sheepZ: g.lost.pos.z, msg: g.message };
      }
      return null;
    }, target);
    ok("走進地標 → 生出地標羊", !!spawned, "8 秒內沒有任何地標羊(判位或半徑錯了?)");
    if (spawned) {
      ok("地標名字對得上", spawned.n === target.n, `${spawned.n} vs ${target.n}`);
      ok("羊放在地標真正的位置(誤差 <2m)",
        Math.hypot(spawned.sheepX - target.x, spawned.sheepZ - target.z) < 2,
        `羊在 ${spawned.sheepX.toFixed(1)},${spawned.sheepZ.toFixed(1)} 地標在 ${target.x.toFixed(1)},${target.z.toFixed(1)}`);
      ok("天賦固定成詩歌羊", spawned.gift === "song", spawned.gift);
      ok("光柱是淡青色(和一般迷羊的金色不同)", spawned.beaconColor === "#9fe8dd", spawned.beaconColor);
      ok("訊息有寫出地標名字(不只靠顏色分辨)", (spawned.msg || "").includes(target.n), spawned.msg);
    }

    console.log("④ 同一座地標不會連噴(24 小時一隻)");
    const again = await page.evaluate(async (t) => {
      const g = window.__game;
      g.lost = null; g.holdRoam = false; g._lmT = 0;      // 假裝那隻被收走了
      const t0 = Date.now();
      while (Date.now() - t0 < 4000) {
        await new Promise((r) => setTimeout(r, 200));
        if (g.lost && g.lost.landmark) return g.lost.landmark.n;
      }
      return null;
    }, target);
    ok("領過的地標不再生地標羊", again === null, `又生出 ${again}`);

    console.log("⑤ 地標名字寫進圖鑑(只有名字,沒有經緯度)");
    const dexed = await page.evaluate((name) => {
      const SD = window.SheepDex, dex = SD.loadDex();
      const rec = SD.addSheep(dex, SD.makeEntry({ name: "恩典", source: "3d", landmark: name }));
      const back = SD.loadDex().sheep.find((s) => s.id === rec.id);
      return { landmark: back.landmark, hasLat: back.lat !== undefined, hasLon: back.lon !== undefined, hasPlace: back.place !== undefined };
    }, target.n);
    ok("圖鑑記著地標名", dexed.landmark === target.n, JSON.stringify(dexed));
    ok("★ 圖鑑沒有存經緯度", !dexed.hasLat && !dexed.hasLon, JSON.stringify(dexed));
    ok("★ 圖鑑沒有存 place", !dexed.hasPlace);
  }

  console.log("⑥ 線上補查:走出預烤範圍才查,同一格只查一次");
  {
    const reqs = [];
    page.on("request", (r) => { if (r.url().includes("overpass")) reqs.push(r.url()); });

    // 先確認「還在預烤範圍內」不會發請求(閘①)
    await page.evaluate(async () => {
      const g = window.__game;
      g.my.pos.x = 300; g.my.pos.z = 300; g._lmT = 0;      // 台北車站 300m 外=預烤包內
      await new Promise((r) => setTimeout(r, 3000));
    });
    ok("預烤範圍內 → 零請求(不浪費)", reqs.length === 0, reqs.join(","));

    /* 走到板橋車站一帶(離台北車站約 10 公里=預烤範圍外,而且**確定有帶名字的公園與學校**)。
       ★ 目標地點要挑「一定有地標」的:第一版挑了深坑山區,Overpass 正確回了 0 筆,
         看起來像「補查壞了」其實是那裡真的沒有公園 —— 測試點選錯會把綠燈讀成紅燈。
       ⚠ 一定要先放大 bound:漫遊的 clamp 是 400 公尺,直接設 pos 會**當場被拉回 (400,400)**,
         而那裡還在預烤範圍內 ⇒ 也會看起來像「補查壞了」
         (0812 兩種誤判都踩過,靠 window.__landmarks 探針的 lastReason 才分辨出來)。 */
    const FAR = { lat: 25.0140, lon: 121.4670 };            // 板橋車站
    await page.evaluate(async (far) => {
      const g = window.__game;
      g.bound = 20000;
      const w = g.realMap.latLonToWorld(far.lat, far.lon);
      g.my.pos.x = w.x; g.my.pos.z = w.z; g._lmT = 0;
      await new Promise((r) => setTimeout(r, 34000));        // 給 Overpass 時間(內部 30 秒超時;實測要 9~12 秒)
    }, FAR);
    const why = await page.evaluate((far) => window.__landmarks(far.lat, far.lon), FAR);
    ok("走出預烤範圍 → 補查了一次", reqs.length === 1,
      `發了 ${reqs.length} 次;探針說:${why.lastReason}(距預烤中心 ${why.distToPackCentreM}m、covered=${why.covered})`);
    /* ★ 判準邊界:我們控制的是「有沒有發出正確的請求、回來後有沒有處理對」;
       「Overpass 今天有沒有空」不是我們的紅燈(實測會回 504)。
       ⇒ 線上結果只當情報印出來,解析對不對交給下面 ⑥b 的確定性單測。 */
    console.log(`   → 線上這一次:${why.lastReason}`
      + (/失敗/.test(why.lastReason) ? "(Overpass 志工服務滿載時會回 504/超時,程式已記成 10 分鐘後再試=預期行為)" : ""));

    const cache = await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("sheepflock3d-landmarks-v1") || "{}");
      const cells = Object.keys(c.cells || {});
      return { cells: cells.length, day: c.meta?.day, count: c.meta?.count,
               items: cells.length ? (c.cells[cells[0]].items || []).length : -1,
               sample: cells.length ? (c.cells[cells[0]].items || []).slice(0, 3).map((i) => i.n) : [] };
    });
    // ★ 判準邊界:「有沒有發請求 + 有沒有記進快取」是我們的程式;
    //   「Overpass 這次回不回得出東西」是志工服務的事,不能當成我們的紅燈。
    ok("這一格記進快取了(查空的也要記,不然每秒重試)", cache.cells === 1, JSON.stringify(cache));
    ok("每日計數有記帳(擋得住連環重試)", cache.count === 1, JSON.stringify(cache));
    if (cache.items > 0) console.log(`   → Overpass 回了 ${cache.items} 個地標,例如:${cache.sample.join("、")}`);
    else console.log("   → Overpass 這次沒回東西(忙碌/超時)——已記成「這格沒地標」,一天後才會再試,這是預期行為");

    // 同一格再走一次 ⇒ 不可以再發請求(閘①快取命中)
    await page.evaluate(async (far) => {
      const g = window.__game;
      const w = g.realMap.latLonToWorld(far.lat + 0.002, far.lon + 0.002);   // 同一格內(格≈1.1 公里)
      g.my.pos.x = w.x; g.my.pos.z = w.z; g._lmT = 0;
      await new Promise((r) => setTimeout(r, 3000));
    }, FAR);
    ok("同一格再走 → 不再發請求(快取命中)", reqs.length === 1, `變成 ${reqs.length} 次`);

    // 補到的地標要真的能觸發地標羊(不然補查等於白做)
    const spawnedFar = await page.evaluate(async () => {
      const g = window.__game;
      const c = JSON.parse(localStorage.getItem("sheepflock3d-landmarks-v1") || "{}");
      const cell = Object.values(c.cells || {})[0];
      const it = (cell && cell.items || [])[0];
      if (!it) return { skip: true };
      const w = g.realMap.latLonToWorld(it.lat, it.lon);
      g.my.pos.x = w.x; g.my.pos.z = w.z; g.lost = null; g.holdRoam = false; g._lmT = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 6000) {
        await new Promise((r) => setTimeout(r, 200));
        if (g.lost && g.lost.landmark) return { name: g.lost.landmark.n, want: it.n };
      }
      return { name: null, want: it.n };
    });
    if (spawnedFar.skip) console.log("   → 這一格沒補到地標(Overpass 忙),跳過「補查的地標能不能生羊」");
    else ok(`補查來的地標也生得出羊(${spawnedFar.want})`, spawnedFar.name === spawnedFar.want, JSON.stringify(spawnedFar));
  }

  console.log("⑥b 解析 Overpass 回應(確定性單測——不靠 Overpass 今天有沒有空)");
  {
    // 固定樣本:一筆正常公園(way,有 center)、一筆學校(node)、一筆沒名字、
    // 一筆名字唸不出來是什麼地方的(咖啡店花圃)、一筆重複、一筆座標壞掉、一筆帶零寬空白
    const sample = {
      elements: [
        { type: "way", center: { lat: 25.0141, lon: 121.4671 }, tags: { leisure: "park", name: "板橋第一公園" } },
        { type: "node", lat: 25.0150, lon: 121.4680, tags: { amenity: "school", name: "板橋國小" } },
        { type: "way", center: { lat: 25.0160, lon: 121.4690 }, tags: { leisure: "park" } },
        { type: "way", center: { lat: 25.0170, lon: 121.4700 }, tags: { leisure: "park", name: "Knutsen Petite Cafe 小花圃" } },
        { type: "relation", center: { lat: 25.0141, lon: 121.4671 }, tags: { leisure: "park", name: "板橋第一公園" } },
        { type: "way", tags: { leisure: "park", name: "沒有座標公園" } },
        { type: "node", lat: 25.0180, lon: 121.4710, tags: { leisure: "pitch", name: "​ 板橋田徑場 " } },
      ],
    };
    const got = await page.evaluate((s) => window.__parseOverpass(s), sample);
    const names = got.map((g) => g.n);
    ok("正常公園解析出來", names.includes("板橋第一公園"), JSON.stringify(names));
    ok("node 型的學校也解析出來(lat/lon 不在 center)", names.includes("板橋國小"));
    ok("沒名字的丟掉", got.length === 3, JSON.stringify(names));
    ok("唸不出來是什麼地方的丟掉(咖啡店花圃)", !names.some((n) => /Knutsen/.test(n)));
    ok("重複的只留一筆", names.filter((n) => n === "板橋第一公園").length === 1);
    ok("沒座標的丟掉", !names.includes("沒有座標公園"));
    ok("零寬空白與前後空白被清掉", names.includes("板橋田徑場"), JSON.stringify(names));
    ok("每筆都有觸發半徑", got.every((g) => Number(g.r) > 0), JSON.stringify(got.map((g) => g.r)));
    ok("座標收斂到 5 位小數", got.every((g) => String(g.lat).split(".")[1]?.length <= 5));
  }

  console.log("⑦ 關掉線上補查 → 不發任何 Overpass 請求");
  {
    const hits = [];
    page.on("request", (r) => { if (r.url().includes("overpass")) hits.push(r.url()); });
    await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem("davidbeasts3d-settings-v1") || "{}");
      s.landmarksOnline = false;
      localStorage.setItem("davidbeasts3d-settings-v1", JSON.stringify(s));
      const g = window.__game;
      // 走到一個離預烤中心很遠的地方(正常會觸發補查)
      g.my.pos.x = 1e5; g.my.pos.z = 1e5; g._lmT = 0;
      await new Promise((r) => setTimeout(r, 4000));
    });
    ok("關掉後零 Overpass 請求", hits.length === 0, hits.join(","));
  }

  console.log("⑧ 沒有 console error");
  ok("零 console error", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  fail++;
  console.log(`  🔴 驗收中斷:${e.message}`);
} finally {
  await browser.close();
}

console.log(`\n合計:${pass} 🟢 / ${fail} 🔴`);
process.exitCode = fail ? 1 : 0;
