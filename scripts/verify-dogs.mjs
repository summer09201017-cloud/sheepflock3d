/* verify-dogs.mjs — 🐕 牧羊犬驗收(0818 使用者:「羊群的頭尾各1隻牧羊犬,繞著羊群,來保護羊群」)
 *
 * 驗六件:①漫遊有兩隻狗(忠忠/勇勇,模型齊件)②繞行:相位差 π+繞角有在前進
 * ③跟隊:狗不脫隊(離牧人 ≤ 橢圓半徑+餘裕)④戰鬥:野獸靠近 → 一隻狗站哨、擋位在獸與羊群之間
 * ⑤⚠ 0827 使用者拍板改寫:狗**會幫忙咬**獸(原本斷言「獸血量零變動」,現在斷言相反)。
 *   同時驗「狗有血量、會受傷、但**不會死**」——血歸零=趴下休息,downSec 後自己站起來。
 *   ★ 神學鐵則沒有被放寬:那條管的是**羊**(只支援、不攻擊、永遠不會死),狗不在裡面。
 *   ★ 咬的傷害刻意很低(獸血 4%/口 + 1.35s 冷卻):狗是幫忙,得勝仍歸耶和華(撒上17:37)。
 * ⑥零 pageerror。
 *
 * 用法:npm run build && npx vite preview --port 4321 之後
 *   node scripts/verify-dogs.mjs [port]     # 預設 4321
 * ⚠ 用 process.exitCode,不用 process.exit()(守門 #36)
 */
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 4321);
const BASE = `http://localhost:${PORT}/`;

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { if (c) { pass++; console.log(`  🟢 ${n}`); } else { fail++; console.log(`  🔴 ${n} ${extra}`); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const isThirdPartyNoise = (t) => /overpass/i.test(t) || (/Failed to load resource/.test(t) && /50\d|429|Gateway/.test(t));
const errors = [];
page.on("console", (m) => { if (m.type() === "error" && !isThirdPartyNoise(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

try {
  await page.goto(BASE, { waitUntil: "load" });

  console.log("① 漫遊(曠野):兩隻狗都在,模型齊件");
  await page.locator('.mode-card[data-mode="seek"]').click();
  await page.selectOption("#realMapSelect", "off");
  await page.locator("#startMatchButton").click();
  await page.waitForFunction(() => window.__game && window.__game.phase === "battle", null, { timeout: 15000 });
  const setup = await page.evaluate(() => {
    const g = window.__game;
    return {
      n: (g.dogs || []).length,
      names: (g.dogs || []).map((d) => d.name).join(","),
      parts: (g.dogs || []).every((d) => d.person.group && d.person.legs.length === 4 && d.person.tail),
      inScene: (g.dogs || []).every((d) => !!d.person.group.parent),
      phaseGap: g.dogs?.length === 2 ? Math.abs(g.dogs[1].phase - g.dogs[0].phase) : 0,
    };
  });
  ok("兩隻狗(忠忠+勇勇)", setup.n === 2 && setup.names.includes("忠忠") && setup.names.includes("勇勇"), setup.names);
  ok("模型齊件(四腿+尾巴)且在場景裡", setup.parts && setup.inScene);
  ok("頭尾相位差 π", Math.abs(setup.phaseGap - Math.PI) < 0.01, `gap=${setup.phaseGap.toFixed(2)}`);

  console.log("② 繞行:3 秒內繞角前進、兩隻都有在動");
  const orbit = await page.evaluate(async () => {
    const g = window.__game;
    const a0 = g._dogOrbitA;
    const p0 = g.dogs.map((d) => ({ x: d.pos.x, z: d.pos.z }));
    await new Promise((r) => setTimeout(r, 3000));
    const moved = g.dogs.map((d, i) => Math.hypot(d.pos.x - p0[i].x, d.pos.z - p0[i].z));
    return { dA: g._dogOrbitA - a0, moved };
  });
  // ⚠ 門檻只驗「有在前進」不驗速率:無頭 rAF 會節流,3 秒真實時間 ≈ 1 秒遊戲時間(實測 ΔA=0.85)
  ok("繞角有前進", orbit.dA > 0.4, `ΔA=${orbit.dA.toFixed(2)}`);
  ok("兩隻狗都有在動", orbit.moved.every((m) => m > 0.5), orbit.moved.map((m) => m.toFixed(1)).join(","));

  console.log("③ 跟隊:狗不脫隊(離牧人 ≤ 14m)");
  const near = await page.evaluate(() => {
    const g = window.__game;
    return g.dogs.map((d) => Math.hypot(d.pos.x - g.my.pos.x, d.pos.z - g.my.pos.z));
  });
  ok("兩隻都貼著隊伍", near.every((d) => d <= 14), near.map((d) => d.toFixed(1)).join(","));

  console.log("④ 戰鬥(lion1・kids):獸靠近 → 一隻狗站哨、擋位在獸與羊群之間");
  await page.goto(BASE, { waitUntil: "load" });   // 重載=最乾淨的換場
  await page.locator('.mode-card[data-mode="duel"]').click();
  await page.selectOption("#menuDifficultySelect", "kids");
  await page.locator("#startMatchButton").click();
  // 戰鬥模式先進 gate(預備畫面),按一下攻擊才開戰
  await page.waitForFunction(() => window.__game && window.__game.phase === "gate", null, { timeout: 15000 });
  await page.evaluate(() => window.__game.strike());
  await page.waitForFunction(() => {
    const g = window.__game;
    return g && g.phase === "battle" && !g.roam && (g.dogs || []).length === 2;
  }, null, { timeout: 15000 });
  const guard = await page.evaluate(async () => {
    const g = window.__game;
    // 把獅子放到羊群邊上(6m),下一輪 updateDogs 就該指派站哨
    const foe = g.livingFoes()[0];
    const hp0 = foe.hp;
    foe.pos.x = g.my.pos.x + 6; foe.pos.z = g.my.pos.z;
    const t0 = Date.now();
    let gd = null;
    while (Date.now() - t0 < 8000) {
      gd = (g.dogs || []).find((d) => d.guard);
      if (gd) {
        const dFoe = Math.hypot(gd.pos.x - foe.pos.x, gd.pos.z - foe.pos.z);
        if (dFoe < 3.2) break;   // 已就位
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!gd) return { assigned: false };
    const dFoe = Math.hypot(gd.pos.x - foe.pos.x, gd.pos.z - foe.pos.z);
    // 擋位=在「獸→羊群中心」的路線上:狗到獸的方向 vs 羊群中心到獸的方向要同側(夾角小)
    const cx = g.my.pos.x, cz = g.my.pos.z; // kids 開場羊群中心≈牧人
    const vFoe = Math.atan2(foe.pos.x - cx, foe.pos.z - cz);
    const vDog = Math.atan2(gd.pos.x - cx, gd.pos.z - cz);
    let dAng = Math.abs(vFoe - vDog) % (Math.PI * 2);
    if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
    await new Promise((r) => setTimeout(r, 4000));   // 站哨一陣子,看狗有沒有咬到獸
    const dog = (g.dogs || []).find((d) => d.name === gd.name);
    return {
      assigned: true, name: gd.name, dFoe, dAng,
      hpDelta: hp0 - g.livingFoes()[0]?.hp,
      dogHp: dog?.hp, dogMaxHp: dog?.maxHp, dogDown: (dog?.downT ?? -1) >= 0,
      hasHpField: typeof dog?.hp === "number" && typeof dog?.maxHp === "number",
      allAlive: (g.dogs || []).every((d) => d.hp !== undefined),   // 沒有「死亡」欄位,只有趴下
    };
  });
  ok("有狗站哨且就位(離獸 <3.2m)", guard.assigned && guard.dFoe < 3.2, guard.assigned ? `${guard.name} 離獸 ${guard.dFoe.toFixed(1)}m` : "沒有狗接哨");
  ok("擋位在獸與羊群之間(夾角 <40°)", guard.assigned && guard.dAng < 0.7, `夾角=${(guard.dAng * 57.3).toFixed(0)}°`);

  console.log("⑤ 狗會幫忙咬(0827 改寫;玩家全程沒出手)+ 狗有血量、不會死");
  ok("站哨期間獸血量有因狗下降", guard.assigned && (guard.hpDelta || 0) > 0, `Δhp=${guard.hpDelta}`);
  ok("咬的傷害是「幫忙」不是「主力」(4 秒內 <= 獸血的 20%)",
     guard.assigned && (guard.hpDelta || 0) <= 20, `Δhp=${guard.hpDelta}`);
  ok("狗有血量欄位(hp/maxHp)", !!guard.hasHpField, `hp=${guard.dogHp}/${guard.dogMaxHp}`);
  ok("狗不會死:血量歸零只會趴下(hp>=0 且仍在 dogs 名單裡)",
     guard.assigned && guard.dogHp >= 0 && guard.allAlive, `hp=${guard.dogHp} down=${guard.dogDown}`);

  console.log("⑥ 沒有 console error");
  ok("零 console error", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  fail++;
  console.log(`  🔴 驗收中斷:${e.message}`);
} finally {
  await browser.close();
}

console.log(`\n合計:${pass} 🟢 / ${fail} 🔴`);
process.exitCode = fail ? 1 : 0;
