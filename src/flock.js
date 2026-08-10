// 羊群系統:基因羊(每隻長相不同)+羊圈圖鑑(跨站格式)+皮克敏式跟隨+戰鬥天賦。
// ★ B 案接口:圖鑑存 localStorage `hfpc-sheepdex-v1`,格式見 DEX 註解——
//   尋羊記(sheepquest,GPS 抓寶版)日後對接同一格式,兩站互通(source: '3d' | 'gps')。
// ★ 神學鐵則:羊是牧人保護與同行的羊群(約10:3-4 按名叫羊、羊跟著牧人),不是攻擊單位;
//   戰鬥中羊只做支援(引開/擋一次/找蜜/唱詩),永遠不會死。
import * as THREE from "three";

// ---------- 天賦(gift)=戰鬥支援能力,同時決定配飾外觀 ----------
export const GIFTS = {
  bell: { label: "鈴鐺羊", icon: "🔔", desc: "搖鈴引開野獸的注意,撲擊會慢下來" },
  wool: { label: "絨毛羊", icon: "🧣", desc: "蓬蓬的絨毛替牧人擋下一次重擊" },
  swift: { label: "快腿羊", icon: "🍯", desc: "腿快鼻靈,野地的蜂蜜更常被牠找到" },
  song: { label: "詩歌羊", icon: "🎵", desc: "咩咩唱詩,牧人的勇氣慢慢恢復" },
};
export const GIFT_ORDER = ["bell", "wool", "swift", "song"];

const WOOL_COLORS = [0xf4efe3, 0xefe3cf, 0xe8e8ee, 0xd9cbb2, 0xcbb9a2, 0x8a7a6a, 0x4a4038, 0xf2ddda];
const FACE_COLORS = [0x3a3128, 0x6b5138, 0x2b2b30, 0x8a6a4a, 0xcaa27a];
const SPOTS = ["none", "none", "patch", "dots"];
const EARS = ["up", "down", "long"];
const EYES = ["round", "sleepy", "happy"];

export const NAME_POOL = [
  "小雪", "棉棉", "咩咩", "乖乖", "毛毛", "恩典", "平安", "喜樂", "小雲", "奶油",
  "小星", "月光", "阿寶", "糰子", "泡泡", "小福", "路得", "迦勒", "小羔", "白白",
];

export function randomGenes(rand = Math.random) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  return {
    wool: pick(WOOL_COLORS),
    face: pick(FACE_COLORS),
    spots: pick(SPOTS),
    ears: pick(EARS),
    eyes: pick(EYES),
    gift: pick(GIFT_ORDER),
    size: 0.88 + rand() * 0.26,
  };
}

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
  group.scale.setScalar(g.size);
  return { group, legs, body };
}

// ---------- 圖鑑頭像(2D canvas,列表用,不開 WebGL) ----------
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

// ---------- 羊圈圖鑑(跨站格式;B 案接口) ----------
// {
//   v: 1,
//   sheep: [{ id, name, genes:{wool,face,spots,ears,eyes,gift,size}, verse, foundAt, source: '3d'|'gps' }],
//   squad: [id, id, id],     // 出戰(最多 3)
//   follow: [id, ...],       // 伴行(最多 5;漫遊時跟在身邊)
//   updatedAt
// }
export const DEX_KEY = "hfpc-sheepdex-v1";
export const SQUAD_MAX = 3;
export const FOLLOW_MAX = 5;

export function loadDex() {
  try {
    const raw = localStorage.getItem(DEX_KEY);
    const d = raw ? JSON.parse(raw) : null;
    if (d && d.v === 1 && Array.isArray(d.sheep)) {
      d.squad = Array.isArray(d.squad) ? d.squad : [];
      d.follow = Array.isArray(d.follow) ? d.follow : [];
      return d;
    }
  } catch { /* 壞檔=重新開始,不炸 */ }
  return { v: 1, sheep: [], squad: [], follow: [], updatedAt: 0 };
}

export function saveDex(dex) {
  try {
    dex.updatedAt = Date.now();
    localStorage.setItem(DEX_KEY, JSON.stringify(dex));
  } catch { /* 私密模式:本場有效,不炸 */ }
}

export function addSheepToDex(dex, name, genes) {
  const entry = {
    id: "s_" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    name, genes, verse: "路15:5", foundAt: Date.now(), source: "3d",
  };
  dex.sheep.push(entry);
  if (dex.follow.length < FOLLOW_MAX) dex.follow.push(entry.id);
  if (dex.squad.length < SQUAD_MAX) dex.squad.push(entry.id);
  saveDex(dex);
  return entry;
}

export function exportDexText(dex) {
  return JSON.stringify(dex, null, 1);
}

// 匯入=合併(同 id 略過),回傳新增數;壞 JSON 回 -1
export function importDexText(dex, text) {
  try {
    const inc = JSON.parse(text);
    if (!inc || inc.v !== 1 || !Array.isArray(inc.sheep)) return -1;
    const have = new Set(dex.sheep.map((s) => s.id));
    let added = 0;
    for (const s of inc.sheep) {
      if (s && s.id && s.genes && !have.has(s.id)) { dex.sheep.push(s); added += 1; }
    }
    saveDex(dex);
    return added;
  } catch {
    return -1;
  }
}
