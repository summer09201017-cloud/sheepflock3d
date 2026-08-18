// 羊群系統:基因羊(每隻長相不同)+羊圈圖鑑(跨站格式)+皮克敏式跟隨+戰鬥天賦。
// ★ 神學鐵則:羊是牧人保護與同行的羊群(約10:3-4 按名叫羊、羊跟著牧人),不是攻擊單位;
//   戰鬥中羊只做支援(引開/擋一次/找蜜/唱詩),永遠不會死。
//
// ★★ 圖鑑格式與基因表**不在這個檔**:它們是與尋羊記(sheepquest)共用的跨站格式,
//    正本 = skill `sheepdex-crossite/assets/sheepdex.js`,本 repo 的複本 = ./sheepdex.js。
//    要改格式/加顏色請改正本再搬過來(0809「共用 core 鐵則」:共用邏輯不複製第二份實作)。
//    本檔只留**three.js 專屬**的部分:基因羊模型、縮圖、圖鑑展示台。
import * as THREE from "three";

// UMD 資產:import 只為了跑它的掛載(它會無條件掛上 globalThis.SheepDex——理由見該檔檔頭,
// 簡述:Rollup 會走 CJS 那支,傳統 UMD 的 else 分支永遠不執行 ⇒ 那樣寫整包 JS 會死掉)。
import "./sheepdex.js";
const SD = /** @type {any} */ (globalThis).SheepDex;
if (!SD) throw new Error("sheepdex.js 沒有掛上 globalThis.SheepDex(垂直搬運的複本壞了?)");

// 對外維持原本的名字(main.js / game.js 的 import 一行都不用改)
export const { GIFTS, GIFT_ORDER, NAME_POOL, randomGenes, genesFromSeed, hexCss } = SD;

// ---------- 基因羊模型(tsum 圓萌基因;臉朝 +z=引擎慣例) ----------
export function makeGeneSheep(genes) {
  const g = genes;
  const group = new THREE.Group();
  const woolMat = new THREE.MeshStandardMaterial({ color: g.wool, roughness: 0.95 });
  const faceMat = new THREE.MeshStandardMaterial({ color: g.face, roughness: 0.8 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), woolMat);
  body.scale.set(1.05, 0.85, 1.35);
  body.position.y = 0.52;
  group.add(body);
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), woolMat);
  tuft.position.set(0, 0.86, 0.42);
  group.add(tuft);

  if (g.spots === "patch") {
    const spotMat = new THREE.MeshStandardMaterial({ color: g.face, roughness: 0.95 });
    const patch = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), spotMat);
    patch.scale.set(1.2, 0.6, 1.1);
    patch.position.set(0.22, 0.78, -0.12);
    group.add(patch);
  } else if (g.spots === "dots") {
    const spotMat = new THREE.MeshStandardMaterial({ color: g.face, roughness: 0.95 });
    for (const [sx, sy, sz] of [[-0.26, 0.7, 0.1], [0.24, 0.62, -0.28], [0.05, 0.82, -0.35]]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), spotMat);
      dot.position.set(sx, sy, sz);
      group.add(dot);
    }
  }

  // 🧸 tsum 圓萌頭(0811 使用者點名):圓頭+水潤大眼雙高光+腮紅+微笑
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), faceMat);
  head.scale.set(1, 0.95, 0.95);
  head.position.set(0, 0.7, 0.56);
  group.add(head);
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1c1712 });
  for (const sx of [-1, 1]) {
    const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), whiteMat);
    eyeW.position.set(sx * 0.085, g.eyes === "sleepy" ? 0.72 : 0.74, 0.72);
    if (g.eyes === "sleepy") eyeW.scale.y = 0.45;
    if (g.eyes === "happy") eyeW.scale.set(1.1, 0.7, 1);
    group.add(eyeW);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.037, 8, 8), pupilMat);
    pupil.position.set(sx * 0.085, eyeW.position.y, 0.755);
    group.add(pupil);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), whiteMat);
    hi.position.set(sx * 0.085 + 0.018, eyeW.position.y + 0.02, 0.775);
    group.add(hi);
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshStandardMaterial({ color: 0xf0a088, roughness: 0.9 }));
    blush.scale.set(1.2, 0.7, 0.4);
    blush.position.set(sx * 0.15, 0.66, 0.68);
    group.add(blush);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 12, Math.PI), pupilMat);
  smile.position.set(0, 0.66, 0.75);
  smile.rotation.z = Math.PI;
  group.add(smile);
  // 耳朵(型依基因)
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), faceMat);
    if (g.ears === "up") { ear.scale.set(0.9, 1.6, 0.7); ear.position.set(sx * 0.12, 0.8, 0.5); }
    else if (g.ears === "long") { ear.scale.set(0.8, 2.1, 0.7); ear.position.set(sx * 0.13, 0.62, 0.5); }
    else { ear.scale.set(1.5, 0.6, 0.8); ear.position.set(sx * 0.13, 0.72, 0.5); }
    group.add(ear);
  }
  // 腿(走路擺動用,存進 anim)
  const legs = [];
  for (const [lx, lz] of [[-0.16, 0.24], [0.16, 0.24], [-0.16, -0.24], [0.16, -0.24]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), faceMat);
    leg.position.set(lx, 0.15, lz);
    group.add(leg);
    legs.push(leg);
  }
  // 天賦配飾
  if (g.gift === "bell") {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshStandardMaterial({ color: 0xf2b93c, roughness: 0.35, metalness: 0.5 }));
    bell.position.set(0, 0.5, 0.62);
    group.add(bell);
  } else if (g.gift === "wool") {
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 14), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.9 }));
    scarf.rotation.x = Math.PI / 2;
    scarf.position.set(0, 0.56, 0.44);
    group.add(scarf);
  } else if (g.gift === "swift") {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), new THREE.MeshStandardMaterial({ color: 0x2980b9, roughness: 0.8 }));
    band.rotation.x = Math.PI / 2.4;
    band.position.set(0, 0.82, 0.52);
    group.add(band);
  } else if (g.gift === "song") {
    const petalMat = new THREE.MeshStandardMaterial({ color: 0xe98ab5, roughness: 0.85 });
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), petalMat);
      petal.position.set(Math.cos(a) * 0.07 - 0.12, 0.88 + Math.sin(a) * 0.07, 0.46);
      group.add(petal);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), new THREE.MeshStandardMaterial({ color: 0xf2d13c }));
    core.position.set(-0.12, 0.88, 0.5);
    group.add(core);
  }
  // 🚻 公母一眼認(0817 使用者:「花=母、太陽眼鏡=公、裙子幫助識別」)。
  // sex **刻意不進跨站基因格式**(sheepdex.js 是共用複本不能就地改)——
  // 由既有基因做穩定雜湊推導:同一隻羊每次都同性別、舊圖鑑的羊也有、兩站不漂移。
  if (sheepSexOf(g) === "f") {
    // 母:頭頂花冠(與 song 天賦的側花錯開位置)+ 粉紅小裙
    const petalMat = new THREE.MeshStandardMaterial({ color: 0xf27fb2, roughness: 0.85 });
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), petalMat);
      petal.position.set(Math.cos(a) * 0.06, 0.92, 0.56 + Math.sin(a) * 0.06);
      group.add(petal);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), new THREE.MeshStandardMaterial({ color: 0xf2d13c }));
    core.position.set(0, 0.945, 0.56);
    group.add(core);
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.56, 0.2, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf5a3c7, roughness: 0.9, side: THREE.DoubleSide }),
    );
    skirt.scale.z = 1.25;
    skirt.position.y = 0.34;
    group.add(skirt);
  } else {
    // 公:太陽眼鏡(蓋在水潤大眼上,一眼認出)
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.25, metalness: 0.35 });
    for (const sx of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.078, 0.02), lensMat);
      lens.position.set(sx * 0.085, 0.745, 0.778);
      group.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.016, 0.018), lensMat);
    bridge.position.set(0, 0.755, 0.778);
    group.add(bridge);
  }
  group.scale.setScalar(g.size);
  return { group, legs, body };
}

/** 由既有基因推導穩定性別:'f' 或 'm'。不吃亂數、不改存檔,同基因永遠同答案 */
export function sheepSexOf(g) {
  const s = `${g.wool}|${g.face}|${g.ears}|${g.eyes}|${g.spots}|${g.gift}|${g.size}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h & 1) === 1 ? "f" : "m";
}

// ---------- 🐕 牧羊犬(0818 使用者:「羊群的頭尾各1隻牧羊犬,繞著羊群,來保護羊群」) ----------
// tsum 圓萌造型與羊同一家族(圓頭大眼水潤高光+腮紅);legs 與 makeGeneSheep 同介面
// (四支 Box,updateFlock 那套擺腿動畫直接可用),另回傳 tail 給搖尾巴用。
// 神學鐵則不變:狗跟羊一樣是守護與同行,不是攻擊單位——會擋在野獸前面吠,不咬。
export function makeSheepdog(variant = "collie") {
  const V = variant === "shiba"
    ? { fur: 0xefdcbc, patch: 0xb5762f, earUp: true }   // 柴柴:奶油毛+棕斑+立耳
    : { fur: 0xf5f2ec, patch: 0x3a3733, earUp: false }; // 邊牧:白毛+黑斑+垂耳
  const group = new THREE.Group();
  const furMat = new THREE.MeshStandardMaterial({ color: V.fur, roughness: 0.9 });
  const patchMat = new THREE.MeshStandardMaterial({ color: V.patch, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), furMat);
  body.scale.set(0.95, 0.8, 1.4);
  body.position.y = 0.48;
  group.add(body);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), patchMat); // 背上一大塊斑
  back.scale.set(1.1, 0.55, 1.5);
  back.position.set(0, 0.66, -0.08);
  group.add(back);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), furMat);
  head.position.set(0, 0.72, 0.5);
  group.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 10), patchMat); // 頭頂斑
  cap.scale.set(1.05, 0.7, 0.9);
  cap.position.set(0, 0.84, 0.44);
  group.add(cap);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), furMat);
  muzzle.scale.set(1, 0.75, 0.9);
  muzzle.position.set(0, 0.66, 0.7);
  group.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 0.4 }));
  nose.position.set(0, 0.69, 0.79);
  group.add(nose);

  // 水潤大眼+腮紅(與羊同款畫法=同一家族的臉)
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1c1712 });
  for (const sx of [-1, 1]) {
    const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), whiteMat);
    eyeW.position.set(sx * 0.09, 0.78, 0.68);
    group.add(eyeW);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), pupilMat);
    pupil.position.set(sx * 0.09, 0.78, 0.712);
    group.add(pupil);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), whiteMat);
    hi.position.set(sx * 0.09 + 0.016, 0.8, 0.73);
    group.add(hi);
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), new THREE.MeshStandardMaterial({ color: 0xf0a088, roughness: 0.9 }));
    blush.scale.set(1.2, 0.7, 0.4);
    blush.position.set(sx * 0.16, 0.7, 0.62);
    group.add(blush);
    // 耳朵:邊牧=垂耳(貼頭側)、柴柴=立耳
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), patchMat);
    if (V.earUp) { ear.scale.set(0.8, 1.5, 0.55); ear.position.set(sx * 0.13, 0.92, 0.42); }
    else { ear.scale.set(0.7, 1.3, 0.5); ear.position.set(sx * 0.2, 0.8, 0.44); ear.rotation.z = sx * -0.55; }
    group.add(ear);
  }
  // 微笑舌頭(守護的狗也是開心的狗)
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), new THREE.MeshStandardMaterial({ color: 0xe8788a, roughness: 0.8 }));
  tongue.scale.set(1, 0.6, 1.1);
  tongue.position.set(0, 0.6, 0.76);
  group.add(tongue);

  // 紅項圈+金牌(一眼認出是牧人的狗,不是野狗)
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.035, 8, 14), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.85 }));
  collar.rotation.x = Math.PI / 2.25;
  collar.position.set(0, 0.6, 0.42);
  group.add(collar);
  const tag = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshStandardMaterial({ color: 0xf2b93c, roughness: 0.35, metalness: 0.5 }));
  tag.position.set(0, 0.52, 0.53);
  group.add(tag);

  // 尾巴(上翹,updateDogs 搖它)
  const tail = new THREE.Group();
  const tailFur = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), patchMat);
  tailFur.scale.set(0.7, 1, 2.2);
  tailFur.position.set(0, 0.12, -0.12);
  tail.add(tailFur);
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), furMat); // 白尾尖
  tailTip.position.set(0, 0.2, -0.26);
  tail.add(tailTip);
  tail.position.set(0, 0.62, -0.5);
  tail.rotation.x = -0.7;
  group.add(tail);

  // 腿:與羊同介面(四支 Box,前二後二),同一套走路擺動直接吃
  const legs = [];
  for (const [lx, lz] of [[-0.14, 0.26], [0.14, 0.26], [-0.14, -0.26], [0.14, -0.26]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.3, 0.075), patchMat);
    leg.position.set(lx, 0.15, lz);
    group.add(leg);
    legs.push(leg);
  }
  return { group, legs, tail, head };
}

// ---------- 🐑 3D 動態頭像(0811 使用者點名「圖鑑的羊要像皮克敏一樣 3D 會動」) ----------
// 共用**單一** WebGLRenderer 逐卡繪製再 drawImage 到各卡的 2D canvas——
// 一卡一個 WebGL context 會超過瀏覽器上限(8~16 個)直接黑圖,不可以。
// WebGL 開不起來(舊平板)→ 回傳 ok:false,呼叫端退回 drawSheepPortrait 2D 頭像。
export function createSheepShowcase() {
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(168, 168, false);
  } catch {
    return { ok: false, add() {}, clear() {} };
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
  camera.position.set(0, 1.0, 2.7);
  camera.lookAt(0, 0.52, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.25);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const entries = [];
  let raf = 0;
  let last = 0;
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (now - last < 33) return; // ~30fps:夠順又省手機電
    last = now;
    const t = now / 1000;
    for (const e of entries) {
      if (!e.visible) continue;
      e.model.group.visible = true;
      const tt = t + e.phase;
      e.model.group.rotation.y = tt * 0.9;                                   // 轉盤慢轉
      e.model.group.position.y = Math.abs(Math.sin(tt * 5)) * 0.05;          // 小蹦跳
      e.model.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(tt * 5 + (i % 2 ? Math.PI : 0)) * 0.5;     // 原地踏步
      });
      renderer.render(scene, camera);
      e.ctx.clearRect(0, 0, e.canvas.width, e.canvas.height);
      e.ctx.drawImage(renderer.domElement, 0, 0, e.canvas.width, e.canvas.height);
      e.model.group.visible = false;
    }
  };
  // 捲出視野的卡不渲染(圖鑑幾十隻時省一大截)
  const io = typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver((obs) => {
      for (const x of obs) {
        const e = entries.find((n) => n.canvas === x.target);
        if (e) e.visible = x.isIntersecting;
      }
    })
    : null;
  return {
    ok: true,
    add(canvas, genes) {
      const model = makeGeneSheep(genes);
      model.group.visible = false;
      scene.add(model.group);
      entries.push({ canvas, ctx: canvas.getContext("2d"), model, phase: Math.random() * 10, visible: !io });
      if (io) io.observe(canvas);
      if (!raf) raf = requestAnimationFrame(tick);
    },
    clear() {
      for (const e of entries) {
        scene.remove(e.model.group);
        if (io) io.unobserve(e.canvas);
      }
      entries.length = 0;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    },
  };
}

// ---------- 圖鑑頭像(2D canvas,WebGL 開不起來時的退路) ----------
export function drawSheepPortrait(canvas, genes) {
  const g = genes;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const hex = (c) => "#" + c.toString(16).padStart(6, "0");
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = hex(g.wool);
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.58, w * 0.34, h * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
  if (g.spots !== "none") {
    ctx.fillStyle = hex(g.face);
    ctx.globalAlpha = 0.85;
    if (g.spots === "patch") { ctx.beginPath(); ctx.ellipse(w * 0.62, h * 0.5, w * 0.1, h * 0.07, 0.4, 0, Math.PI * 2); ctx.fill(); }
    else for (const [dx, dy] of [[-0.12, -0.04], [0.1, 0.06], [0.02, -0.1]]) { ctx.beginPath(); ctx.arc(w * (0.5 + dx), h * (0.58 + dy), w * 0.035, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  // 頭+耳
  ctx.fillStyle = hex(g.face);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    if (g.ears === "up") ctx.ellipse(w * (0.5 + sx * 0.1), h * 0.22, w * 0.03, h * 0.07, 0, 0, Math.PI * 2);
    else if (g.ears === "long") ctx.ellipse(w * (0.5 + sx * 0.12), h * 0.34, w * 0.03, h * 0.1, 0, 0, Math.PI * 2);
    else ctx.ellipse(w * (0.5 + sx * 0.13), h * 0.28, w * 0.06, h * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(w * 0.4, h * 0.2, w * 0.2, h * 0.2, w * 0.05);
  ctx.fill();
  // 眼
  ctx.fillStyle = "#fff";
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    if (g.eyes === "sleepy") ctx.ellipse(w * (0.5 + sx * 0.05), h * 0.3, w * 0.023, h * 0.01, 0, 0, Math.PI * 2);
    else ctx.arc(w * (0.5 + sx * 0.05), h * 0.29, w * 0.023, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1c1712";
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(w * (0.5 + sx * 0.05), h * 0.3, w * 0.01, 0, Math.PI * 2); ctx.fill(); }
  // 天賦配飾
  const giftDot = { bell: "#f2b93c", wool: "#c0392b", swift: "#2980b9", song: "#e98ab5" }[g.gift];
  ctx.fillStyle = giftDot;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.44, w * 0.04, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- 羊圈圖鑑(跨站格式)----------
// 實作全在 ./sheepdex.js(skill sheepdex-crossite 的垂直搬運複本),這裡只是把名字接出去。
// 格式說明、三條鐵則(確定性外觀 / 確定性 id / 多的原樣留)都寫在那支檔的檔頭。
export const {
  DEX_KEY, SQUAD_MAX, FOLLOW_MAX,
  loadDex, saveDex, exportDexText, importDexText, mergeDex,
  makeEntry, addSheep, gpsSheepId, normalizeEntry, dexStats,
} = SD;

// 3D 側的「取名後入圈」:名字是使用者當場打的,所以用時間+亂數的 s_ id(獨立個體)。
export function addSheepToDex(dex, name, genes, extra = {}) {
  return SD.addSheep(dex, SD.makeEntry({ name, genes, source: "3d", ...extra }));
}
