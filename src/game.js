import * as THREE from "three";
import { InputManager } from "./input.js";
import { loadSettings, saveSettings, loadSavedGame, saveGameState } from "./storage.js";
import { makeGeneSheep, makeSheepdog, randomGenes, loadDex } from "./flock.js";
import { findLandmarkAt, topUpLandmarks, landmarkClaimed, claimLandmark, landmarkMeta, createPoiMarkers } from "./landmarks.js";
import { createRealWalk } from "./realwalk.js";

// —— 牧羊人與羊群(sheepflock3d)——2026-08-11 換皮自 davidbeasts3d(3D 大衛打獅熊・護羊之戰)。
// 新增:🐑 羊群系統(src/flock.js)——牧場漫遊尋回迷羊(路15:4-6)、每隻羊基因長相不同、
// 皮克敏式跟隨(約10:3-4 按名叫羊、羊跟著牧人)、出戰羊=支援天賦(鈴鐺/絨毛/快腿/詩歌),
// 羊永遠不會死;戰鬥半邊沿用 davidbeasts3d 引擎(下述鐵則全數保留)。
// —— 底座:3D 大衛打獅熊(davidbeasts3d,真 3D 牧場)——2026-07-19 換皮自 samson3d(參孫打獅子)。
// 撒母耳記上十七章三十四至三十七節:大衛為父親放羊,有時來了獅子,有時來了熊,從群中啣一隻
// 羊羔去;大衛追趕擊打,將羊羔從野獸口中救出來——「耶和華救我脫離獅子和熊的爪」。
// ★神學鐵則:得勝在乎耶和華,不是大衛的臂力;勝負文案必回到神(撒上17:37)。
// ★兒童安全鐵則:不流血;野獸被制伏=側躺不流血;大衛落敗=溫柔跪地,溫柔重試。
// ★判定=畫面(鐵則4):出手當下用「距離+朝向」幾何判定,命中瞬間演出;野獸撲擊攻擊前必先
//   亮紅色預告扇形,預告範圍=實際命中範圍,預告結束那一幀才結算。
// ★多獸同場(beast-boss-kit §6):foes[] 陣列——玩家攻擊鎖定最近活獸、聖靈金光可穿透多獸、
//   群獸傷害縮放(獸越多單獸越輕),七種陣容(獅/熊 ×1~3+獅熊夾攻)。

// ---------- 可調量值 ----------
export const DIFFICULTY_PRESETS = {
  kids: { maxFwd: 3.8, boost: 2.8, turnRate: 2.5, aiSkill: 0.25, aiCd: 2.3, aiDmg: 0.45, aiSpd: 0.5, assist: 0.5 },
  child: { maxFwd: 4.2, boost: 3.2, turnRate: 2.45, aiSkill: 0.4, aiCd: 1.9, aiDmg: 0.65, aiSpd: 0.58, assist: 0.3 },
  easy: { maxFwd: 4.8, boost: 3.8, turnRate: 2.4, aiSkill: 0.55, aiCd: 1.55, aiDmg: 0.8, aiSpd: 0.68, assist: 0.15 },
  normal: { maxFwd: 5.4, boost: 4.4, turnRate: 2.35, aiSkill: 0.68, aiCd: 1.2, aiDmg: 0.95, aiSpd: 0.82, assist: 0 },
  hard: { maxFwd: 6.0, boost: 4.8, turnRate: 2.3, aiSkill: 0.82, aiCd: 0.95, aiDmg: 1.1, aiSpd: 0.95, assist: 0 },
  // 死神模式(beast-boss-kit §3):黑獸+紅眼+獠牙閃現+黑手抓心壞結局——恐怖元素只在這一檔(分級鐵則)
  death: { maxFwd: 6.0, boost: 4.8, turnRate: 2.3, aiSkill: 0.9, aiCd: 0.85, aiDmg: 1.2, aiSpd: 1.0, assist: 0, deathMode: true },
};

export const DIFFICULTY_LABELS = {
  kids: "幼兒(超簡單)",
  child: "兒童(簡單)",
  easy: "入門",
  normal: "標準",
  hard: "全力獸王",
  death: "死神(黑獸)⚠",
};

export const GAME_MODES = {
  seek: {
    label: "牧場漫遊・尋羊",
    hp: 100,
    roam: true,
    description: "曠野裡有迷失的羊在咩咩叫——走過去把牠找回來,給牠取名字,牠就一直跟著你。(路加福音十五章)",
    goal: "尋回迷羊、蒐集羊圈圖鑑,羊群跟著牧人走",
  },
  duel: {
    label: "護羊之戰",
    hp: 100,
    description: "野獸闖進羊群要叼走羊羔——像大衛一樣追上去,倚靠耶和華制伏牠!",
    goal: "打光野獸血量(大衛 100)",
  },
  epic: {
    label: "與獸纏鬥",
    hp: 300,
    roundCap: 300,
    description: "雙方血量提高到 300——考驗你能與野獸周旋多久。",
    goal: "血量 300,戰到分出勝負",
  },
  practice: {
    label: "牧場練習",
    hp: 100,
    passive: true,
    description: "野獸只走位不攻擊——自由練習輕拳、重拳與聖靈金光的手感。",
    goal: "純練手感,不計勝負",
  },
};

export function getModeConfig(modeId) {
  return GAME_MODES[modeId] || GAME_MODES.duel;
}

// ---------- 野獸種類(獅/熊)與陣容(BOSS 種類×數量,beast-boss-kit §6) ----------
export const BEAST_TYPES = {
  lion: {
    label: "獅子", short: "獅",
    claw: { reach: 1.3, dmg: 6, cd: 1.3, arc: 1.0, knockback: 0.22, label: "獅爪", shortLabel: "爪擊" },
    pounce: { reach: 2.1, dmg: 15, cd: 3.6, arc: 0.85, knockback: 1.0, telegraphMin: 0.5, telegraphMax: 0.8, commitDur: 0.22, label: "獅子撲咬", shortLabel: "撲咬" },
    speedMul: 1.0, hpMul: 1.0,
  },
  bear: {
    label: "熊", short: "熊",
    claw: { reach: 1.45, dmg: 8, cd: 1.7, arc: 1.0, knockback: 0.32, label: "熊掌", shortLabel: "熊掌" },
    pounce: { reach: 1.9, dmg: 19, cd: 4.6, arc: 0.85, knockback: 1.3, telegraphMin: 0.62, telegraphMax: 0.95, commitDur: 0.26, label: "熊撲擊", shortLabel: "熊撲" },
    speedMul: 0.85, hpMul: 1.3,
  },
};

export const BEAST_LOADOUTS = {
  lion1: { label: "獅子 ×1", beasts: ["lion"] },
  lion2: { label: "獅子 ×2", beasts: ["lion", "lion"] },
  lion3: { label: "獅子 ×3", beasts: ["lion", "lion", "lion"] },
  bear1: { label: "熊 ×1", beasts: ["bear"] },
  bear2: { label: "熊 ×2", beasts: ["bear", "bear"] },
  bear3: { label: "熊 ×3", beasts: ["bear", "bear", "bear"] },
  both: { label: "獅+熊 雙獸夾攻", beasts: ["lion", "bear"] },
};

// 群獸公平鐵則:獸越多,單獸出手傷害越低(總壓力仍上升),孩子不被圍毆秒殺
const PACK_DMG_SCALE = { 1: 1, 2: 0.75, 3: 0.6 };

// ---------- 武器系統只留 fists(赤手空拳,不畫武器 mesh) ----------
// 重拳(K/Space,可蓄力)沿用 fists 這張表;輕拳(J)自成一組更快更輕的量值(見下 LIGHT_PUNCH)。
export const WEAPON_ORDER = ["fists"];
export const WEAPONS = {
  fists: { label: "赤手空拳", short: "拳", reach: 1.5, dmg: 15, cd: 1.05, arc: 1.2, swing: "chop", chargeBonus: 0.6, hint: "少年牧人,倚靠耶和華追打野獸" },
};

// 輕拳:快、傷害低、獨立冷卻(不佔重拳的 cd)
const LIGHT_PUNCH = { dmg: 6, cd: 0.42, reach: 1.4, arc: 1.3 };

// 揮擊「接觸瞬間」(秒)——傷害/閃光/慢動作在這一刻才發生
const CONTACT_AT = { chop: 0.22 };

// 蓄力大招(聖靈金光):長按重拳鍵蓄力,放開發出金色光波(撒上16:13 耶和華的靈大大感動大衛,不血腥)。
const CHARGE_MIN = 0.6;
const CHARGE_FULL = 1.5;
const HOLY_LIGHT_COLOR = 0xffd84a;

// 自動面向敵人:野獸靠近時,大衛沒在手動轉向/衝刺時自動轉身面對最近的活獸(讓位鐵則:W 前進完全不干預)。
const AUTO_FACE_RANGE = 8;

// 格擋(大衛限定,野獸不格擋):按住 C=舉起雙臂防禦——近戰傷害 ×0.3;剛舉起 ≤PARRY_WINDOW
// 秒內被打到=完美盾反(無傷+野獸被彈開硬直)。
const BLOCK_ARC = 1.05;
const PARRY_WINDOW = 0.35;

// ---------- 蜂蜜補血(§1,獨立一段,整段可刪不傷核心;多獸時出現更頻繁) ----------
const HONEY_MIN_T = 12;
const HONEY_MAX_T = 20;
const HONEY_LIFE = 10;
const HONEY_HEAL_PCT = 0.25;
const HONEY_EAT_DIST = 1.2;

// ---------- 野獸配色集中表(日後黑化/死神模式用) ----------
export const LION_COLORS = {
  body: 0xc9863a,
  bodyDark: 0xb06e2c,
  belly: 0xe4c087,
  mane: 0x6b3a1c,
  snout: 0x3a2415,
  nose: 0x241812,
  eye: 0xffffff,
  pupil: 0x1a1208,
  paw: 0xb06e2c,
  tailTuft: 0x4a2a16,
};

// 死神模式黑獅配色(beast-boss-kit §3:一鍵黑化+紅眼;只在 death 難度使用)
export const LION_COLORS_DEATH = {
  body: 0x16110d,
  bodyDark: 0x0c0906,
  belly: 0x241d16,
  mane: 0x060404,
  snout: 0x0a0706,
  nose: 0x050303,
  eye: 0xff2a1a,
  pupil: 0x7a0000,
  paw: 0x0c0906,
  tailTuft: 0x030202,
};

export const BEAR_COLORS = {
  body: 0x6d4b2c,
  bodyDark: 0x54381f,
  belly: 0x8a6a45,
  snout: 0x4a331d,
  nose: 0x1c130c,
  eye: 0xffffff,
  pupil: 0x140e08,
  paw: 0x4a331d,
};

// 死神模式黑熊配色(同黑化語彙:全黑+紅眼)
export const BEAR_COLORS_DEATH = {
  body: 0x14100c,
  bodyDark: 0x0b0805,
  belly: 0x201a13,
  snout: 0x0a0705,
  nose: 0x050302,
  eye: 0xff2a1a,
  pupil: 0x7a0000,
  paw: 0x0b0805,
};

// ---------- 比武場常數 ----------
const ARENA_HALF = 15;
const BODY_REACH = 0.55;
const MAX_BACK = 1.9;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// ---------- 人物關節工具(matches 3d-figure-kit 鐵則:雙節肢體+五指手) ----------
function createLimb({ upperMaterial, lowerMaterial, endMaterial, upperLen, lowerLen, upperRadius, lowerRadius, end = "hand", thumbSide = 1 }) {
  const pivot = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(upperRadius, upperLen, 4, 8), upperMaterial);
  upper.position.y = -upperLen / 2;
  pivot.add(upper);
  const joint = new THREE.Group();
  joint.position.y = -upperLen;
  pivot.add(joint);
  const lower = new THREE.Mesh(new THREE.CapsuleGeometry(lowerRadius, lowerLen, 4, 8), lowerMaterial);
  lower.position.y = -lowerLen / 2;
  joint.add(lower);
  let endMesh;
  if (end === "foot") {
    endMesh = new THREE.Mesh(new THREE.BoxGeometry(lowerRadius * 2.1, lowerRadius, lowerRadius * 3.4), endMaterial);
    endMesh.position.set(0, -lowerLen - lowerRadius * 0.4, lowerRadius * 0.9);
  } else {
    const r = lowerRadius;
    endMesh = new THREE.Group();
    endMesh.position.y = -lowerLen - r * 0.2;
    const palm = new THREE.Mesh(new THREE.BoxGeometry(r * 2.2, r * 1.7, r * 1.0), endMaterial);
    palm.position.y = -r * 0.85;
    endMesh.add(palm);
    for (let i = 0; i < 4; i += 1) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(r * 0.44, r * 1.25, r * 0.55), endMaterial);
      finger.position.set((i - 1.5) * r * 0.54, -r * 2.1, 0);
      finger.rotation.x = 0.14;
      endMesh.add(finger);
    }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 1.0, r * 0.55), endMaterial);
    thumb.position.set(thumbSide * r * 1.3, -r * 0.95, r * 0.1);
    thumb.rotation.z = thumbSide * -0.55;
    endMesh.add(thumb);
  }
  joint.add(endMesh);
  return { pivot, upper, joint, lower, end: endMesh };
}

// ---------- 大衛(少年牧人:羊毛短袍+腰帶+投石帶斜背,無鬍鬚、短捲髮) ----------
const DAVID_SKIN = 0xd9a066;
const DAVID_TUNIC = 0xd9c9a3;
const DAVID_SKIRT = 0x8a6a3f;
const DAVID_HAIR = 0x3a2415;

function makePerson({ shirt = DAVID_TUNIC, pants = DAVID_SKIRT, skin = DAVID_SKIN, hair = DAVID_HAIR, gender = "m", scale = 1 } = {}) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.72 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.78, emissive: 0x8a7355, emissiveIntensity: 0.5 });

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.76, 0.32), shirtMat);
  chest.position.y = 1.42;
  rig.add(chest);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.2, 12), skinMat);
  neck.position.y = 1.88;
  rig.add(neck);
  const waist = new THREE.Group();
  waist.position.y = 1.16;
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.27), shirtMat);
  belly.position.y = -0.05;
  waist.add(belly);
  const hip = new THREE.Mesh(
    gender === "f" ? new THREE.BoxGeometry(0.48, 0.22, 0.3) : new THREE.BoxGeometry(0.44, 0.24, 0.29),
    pantsMat,
  );
  hip.position.y = -0.26;
  waist.add(hip);
  const beltLine = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.07, 0.3), new THREE.MeshStandardMaterial({ color: 0x6b4a26, roughness: 0.7 }));
  beltLine.position.y = -0.13;
  waist.add(beltLine);
  rig.add(waist);

  // 投石帶(甩石的機弦,撒上17:40)斜背在胸前+腰間小石袋——純裝飾,戰鬥仍是赤手
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.85 });
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.86, 0.05), strapMat);
  strap.position.set(0, 1.42, 0.18);
  strap.rotation.z = 0.72;
  rig.add(strap);
  const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), strapMat);
  pouch.scale.set(1, 1.2, 0.7);
  pouch.position.set(-0.24, 1.06, 0.16);
  rig.add(pouch);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 18), skinMat);
  head.position.y = 2.12;
  rig.add(head);
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), skinMat);
  earL.scale.set(0.45, 1, 0.8);
  earL.position.set(-0.245, 2.11, 0);
  rig.add(earL);
  const earR = earL.clone();
  earR.position.x = 0.245;
  rig.add(earR);

  // 短捲髮(少年大衛,無七綹髮辮——那是參孫的)
  const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.85 });
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.265, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), hairMat);
  hairCap.position.y = 2.13;
  hairCap.rotation.x = -0.22;
  rig.add(hairCap);
  const hairBack = new THREE.Mesh(
    new THREE.SphereGeometry(0.255, 16, 8, Math.PI, Math.PI, Math.PI * 0.35, Math.PI * 0.2),
    hairMat,
  );
  hairBack.position.y = 2.12;
  rig.add(hairBack);
  for (const [cx, cy] of [[-0.16, 2.3], [0, 2.34], [0.16, 2.3], [-0.22, 2.2], [0.22, 2.2]]) {
    const curl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), hairMat);
    curl.position.set(cx, cy, 0.02);
    rig.add(curl);
  }

  const faceDark = new THREE.MeshBasicMaterial({ color: 0x25201a });
  const faceWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), faceWhite);
  eyeL.position.set(-0.09, 2.18, 0.21);
  rig.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.09;
  rig.add(eyeR);
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), faceDark);
  pupilL.position.set(-0.09, 2.18, 0.25);
  rig.add(pupilL);
  const pupilR = pupilL.clone();
  pupilR.position.x = 0.09;
  rig.add(pupilR);
  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.02), faceDark);
  browL.position.set(-0.09, 2.26, 0.22);
  browL.rotation.z = 0.16;
  rig.add(browL);
  const browR = browL.clone();
  browR.position.x = 0.09;
  browR.rotation.z = -0.16;
  rig.add(browR);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 14, Math.PI), faceDark);
  smile.position.set(0, 2.04, 0.21);
  smile.rotation.z = Math.PI;
  rig.add(smile);

  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xb08a52, roughness: 0.85 }); // 涼鞋(赤足感)
  const mkArm = (x) => {
    const arm = createLimb({
      upperMaterial: skinMat, lowerMaterial: skinMat, endMaterial: skinMat,
      upperLen: 0.27, lowerLen: 0.26, upperRadius: 0.075, lowerRadius: 0.06,
      end: "hand", thumbSide: x < 0 ? 1 : -1,
    });
    arm.pivot.position.set(x, 1.72, 0);
    arm.joint.rotation.x = -0.18;
    rig.add(arm.pivot);
    return arm;
  };
  const leftArm = mkArm(-0.4);
  const rightArm = mkArm(0.4);
  const mkLeg = (x) => {
    const leg = createLimb({
      upperMaterial: skinMat, lowerMaterial: skinMat, endMaterial: shoeMat,
      upperLen: 0.40, lowerLen: 0.38, upperRadius: 0.09, lowerRadius: 0.072,
      end: "foot",
    });
    leg.pivot.position.set(x, 1.0, 0);
    leg.pivot.rotation.x = -0.05;
    leg.joint.rotation.x = 0.1;
    rig.add(leg.pivot);
    return leg;
  };
  const leftLeg = mkLeg(-0.15);
  const rightLeg = mkLeg(0.15);

  group.scale.setScalar(scale);
  return { group, rig, head, waist, leftArm, rightArm, leftLeg, rightLeg, shirtMat, pantsMat, smile };
}

/* 🧸 TSUM 牧人(0811 使用者點名「牧人與羊都要可愛的 TSUM 3D 造型」):
   大頭圓身 chibi+tsumFaceZ 水潤大眼+白頭巾;四肢沿用 createLimb ⇒ pivot/joint 介面
   與 makePerson 完全相同,揮拳/走路/KO 姿勢系統零改動。回傳鍵與 makePerson 一致。 */
function makeShepherdTsum() {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0c08a, roughness: 0.75, emissive: 0x8a7355, emissiveIntensity: 0.35 });
  const tunicMat = tmat(0xd9c9a3, 0.8);
  const beltMat = tmat(0x8a6a3f, 0.85);
  const clothMat = tmat(0xf6f1e4, 0.9);

  // 圓身(短袍)+腰帶
  const body = tblob(0.5, tunicMat, 1, 1.02, 0.92);
  body.position.y = 0.98;
  rig.add(body);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 18), beltMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.86;
  rig.add(belt);

  // 大頭+tsum 臉+腮紅
  const head = tblob(0.52, skinMat, 1, 0.96, 0.94);
  head.position.y = 1.86;
  rig.add(head);
  tsumFaceZ(head, { r: 0.52, eye: 0.22, eyeGap: 0.42, eyeColor: 0xffffff, pupilColor: 0x2b1d12, mouth: 0x8a5a3a, blush: 0xf0a088, mouthY: 0.38 });
  // 白頭巾:頭頂布+額帶+後披
  const cap = tblob(0.5, clothMat, 1.04, 0.62, 1.0);
  cap.position.set(0, 0.28, -0.05);
  head.add(cap);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.055, 8, 20), beltMat);
  band.rotation.x = Math.PI / 2.15;
  band.position.set(0, 0.2, 0);
  head.add(band);
  const drape = tblob(0.34, clothMat, 1.1, 1.25, 0.5);
  drape.position.set(0, -0.12, -0.42);
  head.add(drape);

  // 短短的手腳(createLimb=姿勢系統相同介面)
  const mkArm = (x) => {
    const arm = createLimb({
      upperMaterial: tunicMat, lowerMaterial: skinMat, endMaterial: skinMat,
      upperLen: 0.2, lowerLen: 0.18, upperRadius: 0.11, lowerRadius: 0.09,
      end: "hand", thumbSide: x < 0 ? 1 : -1,
    });
    arm.pivot.position.set(x, 1.3, 0);
    arm.joint.rotation.x = -0.18;
    rig.add(arm.pivot);
    return arm;
  };
  const leftArm = mkArm(-0.46);
  const rightArm = mkArm(0.46);

  // 🪵 你的杖、你的竿(詩23:4)——竿=頂端彎鉤的長牧杖握在左手(跟著手臂擺動;
  // 護胸姿勢下反轉 rotation.x 讓竿平時直立、格擋時自然舉起),杖=短棒插在右腰帶;純裝飾,戰鬥仍是赤手
  const woodMat = tmat(0x8a5a2e, 0.85);
  const staff = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.06, 8), woodMat); // ⚠ 長度別動:少一個小數位會撞使用者的 pii 禁字表而擋下部署(原因不寫在這=公開 repo)
  shaft.position.y = 0.28;
  staff.add(shaft);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 14, Math.PI * 1.25), woodMat);
  hook.rotation.y = Math.PI / 2;
  hook.position.set(0, 1.305, 0.16);
  staff.add(hook);
  staff.position.set(0, -0.1, 0.05);
  staff.rotation.x = 0.98; // 抵銷護胸臂角(-0.8 pivot + -0.18 joint),竿身回到垂直
  leftArm.end.add(staff);
  const rod = new THREE.Group();
  const rodShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.5, 7), woodMat);
  rodShaft.position.y = 0.25;
  rod.add(rodShaft);
  const rodKnob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), woodMat);
  rodKnob.position.y = 0.52;
  rod.add(rodKnob);
  rod.position.set(0.4, 0.5, -0.14);
  rod.rotation.z = -0.5;
  rig.add(rod);

  const shoeMat = tmat(0xb08a52, 0.85);
  const mkLeg = (x) => {
    const leg = createLimb({
      upperMaterial: tunicMat, lowerMaterial: skinMat, endMaterial: shoeMat,
      upperLen: 0.24, lowerLen: 0.22, upperRadius: 0.12, lowerRadius: 0.1,
      end: "foot",
    });
    leg.pivot.position.set(x, 0.62, 0);
    leg.pivot.rotation.x = -0.05;
    leg.joint.rotation.x = 0.1;
    rig.add(leg.pivot);
    return leg;
  };
  const leftLeg = mkLeg(-0.2);
  const rightLeg = mkLeg(0.2);

  return { group, rig, head, waist: body, leftArm, rightArm, leftLeg, rightLeg, shirtMat: tunicMat, pantsMat: beltMat, smile: null };
}

function makeDavidFigure() {
  return makeShepherdTsum();
}

// ---------- 野獸(四足,beast-boss-kit §4):Box 軀幹水平,四腿在軀幹下方四角,頭前端+尾巴 ----------
function makeBeastLeg(x, z, legMat, pawMat, thick = 1, pivotY = 0.62) {
  const pivot = new THREE.Group();
  pivot.position.set(x, pivotY, z);
  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.09 * thick, 0.26, 4, 8), legMat);
  thigh.position.y = -0.15;
  pivot.add(thigh);
  const joint = new THREE.Group();
  joint.position.y = -0.3;
  pivot.add(joint);
  const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.075 * thick, 0.24, 4, 8), legMat);
  shin.position.y = -0.13;
  joint.add(shin);
  const paw = new THREE.Mesh(new THREE.BoxGeometry(0.17 * thick, 0.09, 0.22 * thick), pawMat);
  paw.position.set(0, -0.26, 0.04);
  joint.add(paw);
  return { pivot, joint };
}

// 撲擊紅色預告扇形(telegraph;只設 rotation.x——避免 Euler 疊加雷區);範圍=該獸實際命中範圍
function makeTelegraph(pounce) {
  const telegraph = new THREE.Mesh(
    new THREE.CircleGeometry(pounce.reach + BODY_REACH, 24, -Math.PI / 2 - pounce.arc, pounce.arc * 2),
    new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  telegraph.rotation.x = -Math.PI / 2;
  telegraph.position.y = -0.6; // 相對於 rig(rig.y 基準在腳掌之上),貼地
  telegraph.visible = false;
  return telegraph;
}

/* ══════════════════════════════════════════════════════════════════════════════
   🧸 tsum 圓萌野獸(2026-07-30;使用者拍板的全艦隊畫風政策:**動物一律 tsum**)
   ★ 定案來源=尋羊記 sheepquest/index.html 的 makeBeast(**已截圖驗收通過**)。
     skill `tsum-3d-kit` 要以那一版為準;這裡是照本遊戲的骨架重寫,**不是直接搬**。
   ★ 兩邊骨架不同,照抄一定壞:尋羊記的頭朝 local **+x**、身體是一顆豆子、沒有真的腿;
     本遊戲的頭朝 **+z**、身體是水平方塊、**有四條會走路的腿**。
   ★ 因此本次**只換視覺外殼**,以下一律不動(動了就會出事):
       · 腿的 pivot/joint 結構與所有 y 值 → 動了腳會浮空或穿地(walk cycle 靠它);
       · rig 的原點與 telegraph 的 y=-0.6 → 動了紅色攻擊預告扇形會跑掉(判定=畫面);
       · 回傳的 { group, rig, head, legs, tailPivot, telegraph, bodyMat, maneMat } 接口。
   ★ 腿刻意**不做成 tsum 的小圓球**:這關的獸會走過來撲你,腿看不出動作就違反
     「判定=畫面」。做法是保留骨架、只把積木換成圓的(圓胖大腿+球狀腳掌)。
   ★ 一個開關:TSUM_BEASTS=false 就整個回到原本的寫實野獸(方便日後接年齡分級)。
   ★ 認得出來的輪廓線索(tsum 化最容易漏的一條,狼就是漏了被使用者退件):
     獅=兩層重疊的鬃毛球 + 尖立耳;熊=最圓最胖 + 肩隆 + 圓耳 + 短尾。
   ══════════════════════════════════════════════════════════════════════════════ */
const TSUM_BEASTS = true;

const tmat = (c, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
// 壓扁/拉長的球:tsum 造型的主要積木
function tblob(r, mat, sx = 1, sy = 1, sz = 1, seg = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat);
  m.scale.set(sx, sy, sz);
  return m;
}
/* 🧸 tsum 圓萌臉(大眼 + 水潤雙高光 + 深笑 + 腮紅)。
   ★ 本遊戲的臉朝 **+z**(尋羊記是 +x)—— 所有「往前」都是 +z,別把兩邊的軸搞混。
   ★ 眼睛保留「白+瞳」的臉部鐵則(colors.eye / colors.pupil),死神模式換色才生效。 */
function tsumFaceZ(parent, o) {
  const R = o.r, front = R * 0.86, eyeR = R * o.eye;
  const whiteMat = new THREE.MeshBasicMaterial({ color: o.eyeColor });
  const pupilMat = new THREE.MeshBasicMaterial({ color: o.pupilColor });
  const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 12, 12), whiteMat);
    white.position.set(sx * R * o.eyeGap, R * 0.1, front);
    parent.add(white);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.72, 10, 10), pupilMat);
    pupil.position.set(sx * R * o.eyeGap, R * 0.1, front + eyeR * 0.4);
    parent.add(pupil);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.3, 8, 8), hiMat);    // 水潤高光①
    hi.position.set(sx * (R * o.eyeGap + eyeR * 0.26), R * 0.1 + eyeR * 0.38, front + eyeR * 0.62);
    parent.add(hi);
    const hi2 = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.15, 6, 6), hiMat);  // 水潤高光②
    hi2.position.set(sx * (R * o.eyeGap - eyeR * 0.3), R * 0.1 - eyeR * 0.42, front + eyeR * 0.6);
    parent.add(hi2);
    if (o.blush) {                                                                   // 腮紅
      const bl = tblob(R * 0.17, tmat(o.blush, 0.9), 1, 0.75, 0.4, 8);
      bl.position.set(sx * R * (o.eyeGap + 0.34), -R * 0.16, front * 0.86);
      parent.add(bl);
    }
  }
  // 深笑:半圈甜甜圈當嘴,開口朝下=笑
  const smile = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.045, 6, 14, Math.PI), tmat(o.mouth, 0.9));
  smile.position.set(0, -R * (o.mouthY ?? 0.3), front + R * 0.06);
  smile.rotation.z = Math.PI;
  parent.add(smile);
}
/* 圓胖版的腿:**關節結構與所有 y 值和 makeBeastLeg 完全一樣**(walk cycle 與腳貼地靠它),
   只把「膠囊+方塊腳掌」換成「圓胖膠囊+球狀腳掌」。一個 y 都不能改。 */
function makeTsumLeg(x, z, legMat, pawMat, thick = 1, pivotY = 0.62) {
  const pivot = new THREE.Group();
  pivot.position.set(x, pivotY, z);
  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13 * thick, 0.2, 4, 10), legMat);
  thigh.position.y = -0.15;
  pivot.add(thigh);
  const joint = new THREE.Group();
  joint.position.y = -0.3;
  pivot.add(joint);
  const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.115 * thick, 0.16, 4, 10), legMat);
  shin.position.y = -0.13;
  joint.add(shin);
  const paw = tblob(0.13 * thick, pawMat, 1.05, 0.85, 1.15, 10);      // 球狀腳掌(不是方塊)
  paw.position.set(0, -0.245, 0.03);
  joint.add(paw);
  return { pivot, joint };
}

function makeLionTsum(colors = LION_COLORS) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const bodyMat = tmat(colors.body);
  const bellyMat = tmat(colors.belly);
  const maneMat = tmat(colors.mane, 0.95);
  const pawMat = tmat(colors.paw);
  const noseMat = new THREE.MeshBasicMaterial({ color: colors.nose });

  // 圓團身體(豆子形;長度對齊原本方塊軀幹的 1.15,才不會改變命中距離的觀感)
  const BR = 0.42, BY = 0.62;
  const body = tblob(BR, bodyMat, 0.98, 0.94, 1.36);
  body.position.set(0, BY, 0);
  rig.add(body);
  const belly = tblob(BR * 0.74, bellyMat, 0.95, 0.66, 1.2);          // 淺色肚子,讓側面有層次
  belly.position.set(0, BY - BR * 0.42, 0.02);
  rig.add(belly);

  // 頭:幾乎和身體一樣大的圓球,黏在前端(tsum 的比例=頭大身大、四肢小)
  const HR = 0.4, HY = 0.8, HZ = 0.62;
  const head = tblob(HR, bodyMat, 1, 0.97, 1);
  head.position.set(0, HY, HZ);
  rig.add(head);
  const face = new THREE.Group();                                     // 臉的零件掛這裡(不影響回傳的 head)
  face.position.set(0, HY, HZ);
  rig.add(face);
  const snout = tblob(HR * 0.46, bellyMat, 1.1, 0.8, 1.15, 12);
  snout.position.set(0, -HR * 0.22, HR * 0.74);
  face.add(snout);
  const nose = tblob(HR * 0.16, noseMat, 1.2, 0.85, 1, 8);
  nose.position.set(0, -HR * 0.14, HR * 1.12);
  face.add(nose);
  tsumFaceZ(face, {
    r: HR, eye: 0.3, eyeGap: 0.36, mouthY: 0.34,
    eyeColor: colors.eye, pupilColor: colors.pupil, mouth: colors.snout, blush: 0xe08b86,
  });
  /* 🦁 鬃毛:**前後兩層互相重疊的小毛球**(定案,尋羊記改了 5 版才對)。
     絕不要用一圈粗甜甜圈 —— 那會變成「咖啡色大喇叭口」把臉吃掉(0730 被使用者退件);
     也不要太小太疏(會變成一串珠子)或只做一層(會變成背上的鬃冠)。
     圈在 XY 平面(法線=+z=臉的方向),整圈往後推才不會蓋臉。*/
  for (const [mz, mr, off] of [[-0.18, 0.9, 0], [-0.48, 1.0, 0.5]]) {
    const N = 11;
    for (let i = 0; i < N; i++) {
      const a = ((i + off) / N) * Math.PI * 2;
      const fluff = new THREE.Mesh(new THREE.SphereGeometry(HR * 0.32, 8, 8), maneMat);
      fluff.position.set(Math.cos(a) * HR * mr, HY + Math.sin(a) * HR * mr, HZ + HR * mz);
      rig.add(fluff);
    }
  }
  /* 耳朵:尖立耳,而且**要推到鬃毛帶外面**(半徑 1.24×HR)。
     0730 幾何驗算抓到:耳朵留在原半徑會整個被鬃毛埋掉,違反臉部鐵則「眼耳嘴眉齊」。
     ⚠ 鬃毛尺寸與耳朵位置是一組的,改一個一定要重算另一個。*/
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(HR * 0.26, HR * 0.62, 10), maneMat);
    ear.position.set(sx * HR * 0.74, HY + HR * 1.0, HZ - HR * 0.1);
    ear.rotation.z = sx * -0.2;
    rig.add(ear);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(HR * 0.1, 8, 8), tmat(0xd79a94, 0.9));
    inner.position.set(sx * HR * 0.72, HY + HR * 1.02, HZ - HR * 0.04);
    rig.add(inner);
  }

  const legs = {
    fl: makeTsumLeg(-0.2, 0.42, bodyMat, pawMat),
    fr: makeTsumLeg(0.2, 0.42, bodyMat, pawMat),
    bl: makeTsumLeg(-0.2, -0.42, bodyMat, pawMat),
    br: makeTsumLeg(0.2, -0.42, bodyMat, pawMat),
  };
  for (const leg of Object.values(legs)) rig.add(leg.pivot);

  // 尾巴:一串由小到大的毛球(細圓柱在圓身旁邊等於一根牙籤);尾端用鬃色=獅子的毛球尖
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, BY + 0.08, -0.56);
  [0.35, 0.7, 1.0].forEach((f, i) => {
    const r = 0.105 * (0.8 + 0.28 * f);
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), i === 2 ? maneMat : tmat(colors.tailTuft));
    b.position.set(0, 0.04 * f, -0.54 * f);
    tailPivot.add(b);
  });
  rig.add(tailPivot);

  const telegraph = makeTelegraph(BEAST_TYPES.lion.pounce);
  rig.add(telegraph);
  return { group, rig, head, legs, tailPivot, telegraph, bodyMat, maneMat };
}

function makeBearTsum(colors = BEAR_COLORS) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const bodyMat = tmat(colors.body);
  const bellyMat = tmat(colors.belly);
  const pawMat = tmat(colors.paw);
  const noseMat = new THREE.MeshBasicMaterial({ color: colors.nose });

  // 熊=**最圓最胖**(牠的輪廓線索);沿用原本寫實版「整體壯一號」的量感
  const BR = 0.5, BY = 0.62;
  const body = tblob(BR, bodyMat, 1.04, 0.98, 1.24);
  body.position.set(0, BY, 0);
  rig.add(body);
  const hump = tblob(BR * 0.62, bodyMat, 0.95, 0.8, 0.9);             // 肩隆(熊的招牌)
  hump.position.set(0, BY + BR * 0.5, 0.14);
  rig.add(hump);
  const belly = tblob(BR * 0.72, bellyMat, 0.95, 0.62, 1.1);
  belly.position.set(0, BY - BR * 0.44, 0.02);
  rig.add(belly);

  const HR = 0.42, HY = 0.86, HZ = 0.66;
  const head = tblob(HR, bodyMat, 1, 0.97, 1);
  head.position.set(0, HY, HZ);
  rig.add(head);
  const face = new THREE.Group();
  face.position.set(0, HY, HZ);
  rig.add(face);
  const snout = tblob(HR * 0.48, tmat(colors.snout), 1.12, 0.8, 1.18, 12);
  snout.position.set(0, -HR * 0.24, HR * 0.74);
  face.add(snout);
  const nose = tblob(HR * 0.17, noseMat, 1.2, 0.85, 1, 8);
  nose.position.set(0, -HR * 0.16, HR * 1.14);
  face.add(nose);
  tsumFaceZ(face, {
    r: HR, eye: 0.3, eyeGap: 0.36, mouthY: 0.34,
    eyeColor: colors.eye, pupilColor: colors.pupil, mouth: colors.snout, blush: 0xe08b86,
  });
  // 圓耳(熊的輪廓線索之一;尖耳是獅/狼的,熊不能做尖)
  for (const sx of [-1, 1]) {
    const ear = tblob(HR * 0.34, bodyMat, 1, 1, 0.6, 10);
    ear.position.set(sx * HR * 0.62, HY + HR * 0.82, HZ - HR * 0.1);
    rig.add(ear);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(HR * 0.13, 8, 8), tmat(0xd79a94, 0.9));
    inner.position.set(sx * HR * 0.6, HY + HR * 0.84, HZ - HR * 0.04);
    rig.add(inner);
  }

  const legs = {
    fl: makeTsumLeg(-0.22, 0.4, bodyMat, pawMat, 1.15),
    fr: makeTsumLeg(0.22, 0.4, bodyMat, pawMat, 1.15),
    bl: makeTsumLeg(-0.22, -0.4, bodyMat, pawMat, 1.15),
    br: makeTsumLeg(0.22, -0.4, bodyMat, pawMat, 1.15),
  };
  for (const leg of Object.values(legs)) rig.add(leg.pivot);

  // 熊尾:只有一小截(兩顆球)—— 這也是「認得出是熊」的線索
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, BY + 0.06, -0.6);
  [0.5, 1.0].forEach((f) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.13 * (0.8 + 0.28 * f), 10, 10), tmat(colors.bodyDark));
    b.position.set(0, 0.02 * f, -0.2 * f);
    tailPivot.add(b);
  });
  rig.add(tailPivot);

  const telegraph = makeTelegraph(BEAST_TYPES.bear.pounce);
  rig.add(telegraph);
  return { group, rig, head, legs, tailPivot, telegraph, bodyMat, maneMat: bodyMat };
}

function makeLion(colors = LION_COLORS) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const bodyMat = new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.85 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: colors.belly, roughness: 0.85 });
  const maneMat = new THREE.MeshStandardMaterial({ color: colors.mane, roughness: 0.95 });
  const snoutMat = new THREE.MeshStandardMaterial({ color: colors.snout, roughness: 0.8 });
  const pawMat = new THREE.MeshStandardMaterial({ color: colors.paw, roughness: 0.85 });
  const noseMat = new THREE.MeshBasicMaterial({ color: colors.nose });
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: colors.eye });
  const pupilMat = new THREE.MeshBasicMaterial({ color: colors.pupil });
  const tuftMat = new THREE.MeshStandardMaterial({ color: colors.tailTuft, roughness: 0.9 });

  // 軀幹(水平箱體,+z=前)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.15), bodyMat);
  body.position.set(0, 0.62, 0);
  rig.add(body);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 1.0), bellyMat);
  belly.position.set(0, 0.4, 0);
  rig.add(belly);

  // 頭(前端)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.4), bodyMat);
  head.position.set(0, 0.8, 0.72);
  rig.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), snoutMat);
  snout.position.set(0, 0.72, 0.95);
  rig.add(snout);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.03), noseMat);
  nose.position.set(0, 0.78, 1.07);
  rig.add(nose);

  // 眼睛(臉部鐵則:白+瞳)
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeWhiteMat);
    eye.position.set(sx * 0.13, 0.86, 0.9);
    rig.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), pupilMat);
    pupil.position.set(sx * 0.13, 0.86, 0.93);
    rig.add(pupil);
  }
  // 耳朵
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 8), bodyMat);
    ear.position.set(sx * 0.16, 1.02, 0.62);
    ear.rotation.x = -0.3;
    rig.add(ear);
  }
  // 鬃毛環(獅子限定)
  const mane = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.16, 10, 16), maneMat);
  mane.position.set(0, 0.78, 0.5);
  rig.add(mane);
  const maneTop = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), maneMat);
  maneTop.position.set(0, 0.92, 0.55);
  rig.add(maneTop);

  // 四腿(軀幹下方四角)
  const legs = {
    fl: makeBeastLeg(-0.2, 0.42, bodyMat, pawMat),
    fr: makeBeastLeg(0.2, 0.42, bodyMat, pawMat),
    bl: makeBeastLeg(-0.2, -0.42, bodyMat, pawMat),
    br: makeBeastLeg(0.2, -0.42, bodyMat, pawMat),
  };
  for (const leg of Object.values(legs)) rig.add(leg.pivot);

  // 尾巴(後端)+毛簇
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.7, -0.58);
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.55, 4, 8), bodyMat);
  tail.rotation.x = Math.PI / 2 + 0.35;
  tail.position.set(0, 0.05, -0.28);
  tailPivot.add(tail);
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), tuftMat);
  tuft.position.set(0, -0.05, -0.58);
  tailPivot.add(tuft);
  rig.add(tailPivot);

  const telegraph = makeTelegraph(BEAST_TYPES.lion.pounce);
  rig.add(telegraph);

  return { group, rig, head, legs, tailPivot, telegraph, bodyMat, maneMat };
}

// 熊(撒上17:34「有時來了獅子,有時來了熊」):無鬃、體壯、肩隆、圓耳、短尾,整體放大 1.12
function makeBear(colors = BEAR_COLORS) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const bodyMat = new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: colors.bodyDark, roughness: 0.9 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: colors.belly, roughness: 0.9 });
  const snoutMat = new THREE.MeshStandardMaterial({ color: colors.snout, roughness: 0.85 });
  const pawMat = new THREE.MeshStandardMaterial({ color: colors.paw, roughness: 0.85 });
  const noseMat = new THREE.MeshBasicMaterial({ color: colors.nose });
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: colors.eye });
  const pupilMat = new THREE.MeshBasicMaterial({ color: colors.pupil });

  // 軀幹(比獅子更寬更厚)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.6, 1.28), bodyMat);
  body.position.set(0, 0.68, 0);
  rig.add(body);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 1.1), bellyMat);
  belly.position.set(0, 0.42, 0);
  rig.add(belly);
  // 肩隆(熊的招牌駝峰)
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), darkMat);
  hump.scale.set(1, 0.72, 0.9);
  hump.position.set(0, 1.0, 0.22);
  rig.add(hump);

  // 頭(前端,無鬃)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.42), bodyMat);
  head.position.set(0, 0.94, 0.8);
  rig.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.17, 0.3), snoutMat);
  snout.position.set(0, 0.86, 1.06);
  rig.add(snout);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.03), noseMat);
  nose.position.set(0, 0.9, 1.22);
  rig.add(nose);

  // 眼睛(臉部鐵則:白+瞳)
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeWhiteMat);
    eye.position.set(sx * 0.14, 1.0, 0.99);
    rig.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), pupilMat);
    pupil.position.set(sx * 0.14, 1.0, 1.02);
    rig.add(pupil);
  }
  // 圓耳(熊)
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), darkMat);
    ear.scale.set(1, 1, 0.55);
    ear.position.set(sx * 0.19, 1.2, 0.7);
    rig.add(ear);
  }

  // 四腿(粗壯)
  const legs = {
    fl: makeBeastLeg(-0.24, 0.46, bodyMat, pawMat, 1.3, 0.68),
    fr: makeBeastLeg(0.24, 0.46, bodyMat, pawMat, 1.3, 0.68),
    bl: makeBeastLeg(-0.24, -0.46, bodyMat, pawMat, 1.3, 0.68),
    br: makeBeastLeg(0.24, -0.46, bodyMat, pawMat, 1.3, 0.68),
  };
  for (const leg of Object.values(legs)) rig.add(leg.pivot);

  // 短尾(熊)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.74, -0.66);
  const stub = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), darkMat);
  stub.position.set(0, 0, -0.05);
  tailPivot.add(stub);
  rig.add(tailPivot);

  const telegraph = makeTelegraph(BEAST_TYPES.bear.pounce);
  rig.add(telegraph);

  group.scale.setScalar(1.12);
  return { group, rig, head, legs, tailPivot, telegraph, bodyMat, maneMat: darkMat };
}

function makeBeast(typeId, colors) {
  /* 🧸 動物一律 tsum(使用者 0730 拍板的全艦隊政策)。
     TSUM_BEASTS=false 就整個回到原本的寫實野獸——寫實那兩支函式**刻意保留不刪**,
     因為日後要接「年齡分級」(幼兒/兒童=圓萌、青少年=寫實)時就直接用得上。
     ⚠ 熊的寫實版有 group.scale.setScalar(1.12)「整體壯一號」;tsum 版**不縮放整體**,
       而是把身體半徑本身做大(BR 0.42→0.5)+加肩隆 —— 縮放整體會連腿長和腳貼地一起放大。*/
  if (TSUM_BEASTS) return typeId === "bear" ? makeBearTsum(colors) : makeLionTsum(colors);
  return typeId === "bear" ? makeBear(colors) : makeLion(colors);
}

// ---------- 主遊戲類別 ----------
export class WarriorGame {
  constructor({ canvas, touchRoot }) {
    this.canvas = canvas;
    this.touchRoot = touchRoot;

    const settings = loadSettings();
    this.difficulty = DIFFICULTY_PRESETS[settings.difficulty] ? settings.difficulty : "normal";
    this.modeId = GAME_MODES[settings.modeId] ? settings.modeId : "duel";
    this.mode = getModeConfig(this.modeId);
    this.beastId = BEAST_LOADOUTS[settings.beastId] ? settings.beastId : "lion1";
    this.weaponId = "fists";
    this.characterId = "default";

    this.input = new InputManager();
    this.input.bindTouchButtons(this.touchRoot);

    this.onHudUpdate = null;
    this.onEvent = null;

    this.running = false;
    this.time = 0;
    this.phase = "menu"; // menu | gate | battle | ended
    this.message = "在首頁選擇模式、野獸陣容與難度後開始。";
    this.cameraView = 0;
    // 鏡頭縮放倍率:1=標準;愈大機位離注視點愈遠=一眼看到更多地圖與羊(0816 使用者需求)
    this.camZoom = 1;
    this.autoSaveTimer = 0;

    this.roundNo = 0;
    this.lastHit = null;
    this.projectiles = []; // 聖靈金光波動
    this._pendingStrikes = [];
    this.hitCamT = 9;
    this.endT = -1;

    this.honey = null;
    this.honeyTimer = HONEY_MIN_T + Math.random() * (HONEY_MAX_T - HONEY_MIN_T);

    // ---- 🐑 羊群系統(flock.js) ----
    this.roam = false;          // 本局是不是牧場漫遊
    this.flock = [];            // 場上跟隨中的羊實體 [{id,name,genes,person:{group,legs},pos,heading,speed,walkT}]
    this.trail = [];            // 牧人足跡點(跟隨鏈用)
    this.lost = null;           // 漫遊中的迷羊 {genes, group, pos, bleatT, beacon}
    this.lostTimer = 3;         // 下一隻迷羊出現倒數
    this.holdRoam = false;      // 取名對話框開著=暫停尋回邏輯
    this.foundCount = 0;        // 本局尋回數
    this._bellT = 0;            // 鈴鐺羊計時
    this._songT = 0;            // 詩歌羊計時
    this._woolCd = 0;           // 絨毛羊護盾冷卻(0=可擋)

    this.overlay = { visible: false, eyebrow: "", title: "", text: "", canResume: false };

    // ---- three ----
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc4e8);
    this.scene.fog = new THREE.Fog(0xbfd8ec, 55, 150);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 220);
    this.camPos = new THREE.Vector3(3, 3.5, -16);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    this.camera.position.copy(this.camPos);

    this.clock = new THREE.Clock();

    this.setupScene();
    this.setupInput();

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.pushHud();
  }

  emitEvent(type, payload = {}) {
    if (this.onEvent) this.onEvent({ type, ...payload });
  }

  // ---------- 場景:伯利恆曠野牧場(羊群+羊圈+樹+遠山+暖天光),少年牧人獨自看守 ----------
  setupScene() {
    const sun = new THREE.HemisphereLight(0xfff6de, 0x6a7a3a, 1.35);
    this.scene.add(sun);
    const key = new THREE.DirectionalLight(0xfff0cf, 2.1);
    key.position.set(30, 50, -18);
    this.scene.add(key);
    this.keyLight = key;
    const rim = new THREE.DirectionalLight(0xbfe0ff, 0.45);
    rim.position.set(-25, 30, 25);
    this.scene.add(rim);
    // 🌅 0826:三盞燈都要留參考,時段氛圍(realTod)換的就是它們的顏色與太陽方位
    this.hemiLight = sun;
    this.rimLight = rim;

    // 🗺 真實地圖模式要把「曠野牧場」整組藏起來(遠山/橄欖樹/草地不能疊在台北街道上)。
    // 這裡用「前後快照 scene.children」收集本段加進去的物件——比在 buildPasture 裡逐行改 this.scene.add 安全。
    const beforePasture = this.scene.children.length;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: 0x99a052, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    this.scene.add(grass);
    // 開放式草地(牧場中的空地——大衛追上野獸之處,不設任何阻擋)
    const soil = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2 + 6, ARENA_HALF * 2 + 6), new THREE.MeshStandardMaterial({ color: 0xc9b06b, roughness: 1 }));
    soil.rotation.x = -Math.PI / 2;
    this.scene.add(soil);

    this.buildPasture();
    this.pastureObjects = this.scene.children.slice(beforePasture);
    this._buildFighters();

    // 擊中閃光
    this.hitFlash = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    this.scene.add(this.hitFlash);
    this.hitFlashT = 9;

    // 天氣系統可留(晴日為主,日夜仍緩慢流動;此作預設晴日暖光)
    this.buildWeather();

    this.resetFighters();
  }

  // 伯利恆曠野牧場:羊群在場外圍觀望+石砌羊圈+橄欖樹+遠山
  buildPasture() {
    const F = ARENA_HALF + 2;
    const woolMat = new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.95 });
    const woolShade = new THREE.MeshStandardMaterial({ color: 0xdad2c2, roughness: 0.95 });
    const sheepFaceMat = new THREE.MeshStandardMaterial({ color: 0x3a3128, roughness: 0.8 });
    // 羊群(在場外圍,不進戰場;每隻朝向略異)
    const mkSheep = (x, z, s = 1) => {
      const sheep = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), Math.random() < 0.3 ? woolShade : woolMat);
      body.scale.set(1.05, 0.85, 1.35);
      body.position.y = 0.52;
      sheep.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.26), sheepFaceMat);
      head.position.set(0, 0.66, 0.56);
      sheep.add(head);
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), sheepFaceMat);
        ear.scale.set(1.4, 0.6, 0.8);
        ear.position.set(sx * 0.12, 0.74, 0.52);
        sheep.add(ear);
      }
      for (const [lx, lz] of [[-0.16, 0.24], [0.16, 0.24], [-0.16, -0.24], [0.16, -0.24]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.07), sheepFaceMat);
        leg.position.set(lx, 0.15, lz);
        sheep.add(leg);
      }
      sheep.position.set(x, 0, z);
      sheep.rotation.y = Math.random() * Math.PI * 2;
      sheep.scale.setScalar(s);
      this.scene.add(sheep);
    };
    for (let i = 0; i < 7; i += 1) mkSheep(-F - 4 - Math.random() * 5, (Math.random() * 2 - 1) * F);
    for (let i = 0; i < 5; i += 1) mkSheep((Math.random() * 2 - 1) * F, -F - 4 - Math.random() * 5);
    mkSheep(F + 4.5, F * 0.4, 0.62); // 被救回的小羊羔(撒上17:35),在羊圈邊
    // 石砌羊圈(場外一角,低牆弧)
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a917e, roughness: 1 });
    for (let i = 0; i < 14; i += 1) {
      const a = Math.PI * 0.55 + (i / 13) * Math.PI * 0.9;
      const stone = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.7 + Math.random() * 0.2, 0.6), stoneMat);
      stone.position.set(F + 7 + Math.cos(a) * 4.5, 0.35, F * 0.4 + Math.sin(a) * 4.5);
      stone.rotation.y = -a;
      this.scene.add(stone);
    }
    // 橄欖樹/篤耨香樹(場外幾棵)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4a26, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x5f7a34, roughness: 0.95 });
    for (const [tx, tz, ts] of [[-F - 8, F + 5, 1.2], [F + 6, -F - 6, 1], [-4, F + 9, 1.35], [F + 12, 6, 0.9]]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * ts, 0.26 * ts, 2.2 * ts, 8), trunkMat);
      trunk.position.set(tx, 1.1 * ts, tz);
      this.scene.add(trunk);
      for (const [ox, oy, oz, r] of [[0, 2.4, 0, 1.1], [-0.7, 2.0, 0.3, 0.7], [0.65, 2.1, -0.25, 0.75]]) {
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(r * ts, 10, 8), leafMat);
        canopy.scale.y = 0.7;
        canopy.position.set(tx + ox * ts, oy * ts, tz + oz * ts);
        this.scene.add(canopy);
      }
    }
    // 遠山(猶大曠野)
    const mtnMat = new THREE.MeshStandardMaterial({ color: 0xa39468, roughness: 1 });
    const mtnMat2 = new THREE.MeshStandardMaterial({ color: 0x87885e, roughness: 1 });
    const mtnSpecs = [
      [-70, -95, 26, 40, mtnMat], [40, -115, 34, 52, mtnMat2], [95, -60, 22, 34, mtnMat],
      [-95, 70, 30, 44, mtnMat2], [60, 105, 24, 36, mtnMat], [0, -130, 40, 58, mtnMat2],
    ];
    for (const [x, z, r, h, mat] of mtnSpecs) {
      const mtn = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat);
      mtn.position.set(x, h / 2 - 2, z);
      this.scene.add(mtn);
    }
  }

  // 建(或重建)大衛與野獸群(陣容/死神黑化改變時重建)
  _buildFighters() {
    if (this.my) this.scene.remove(this.my.person.group);
    if (this.foes) for (const f of this.foes) this.scene.remove(f.person.group);
    this.my = this.makeDavidFighter();
    this.foes = BEAST_LOADOUTS[this.beastId].beasts.map((typeId) => this.makeBeastFighter(typeId));
  }

  makeDavidFighter() {
    const person = makeDavidFigure();
    this.scene.add(person.group);
    const chargeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.82, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    chargeRing.rotation.x = -Math.PI / 2;
    chargeRing.position.y = 0.05;
    person.group.add(chargeRing);
    return {
      person, chargeRing,
      pos: new THREE.Vector3(), heading: 0, speed: 0,
      hp: 100, maxHp: 100, cd: 0, lightCd: 0, chargeT: -1, strikeKind: null,
      blocking: false, blockT: 9,
      strikeT: 9, hitT: 9, stunT: 9, koT: -1, walkT: 0,
    };
  }

  makeBeastFighter(typeId) {
    const stats = BEAST_TYPES[typeId];
    const dm = DIFFICULTY_PRESETS[this.difficulty]?.deathMode;
    const colors = typeId === "bear" ? (dm ? BEAR_COLORS_DEATH : BEAR_COLORS) : (dm ? LION_COLORS_DEATH : LION_COLORS);
    const beast = makeBeast(typeId, colors);
    this.scene.add(beast.group);
    return {
      person: beast, type: typeId, stats,
      pos: new THREE.Vector3(), heading: 0, speed: 0,
      hp: 100, maxHp: 100, cd: 0, lightCd: 0, pounce: null,
      strikeT: 9, hitT: 9, stunT: 9, koT: -1, walkT: 0,
      chargeT: -1, blocking: false, blockT: 9,
      brain: { retreatT: 0, orbitDir: 1 },
    };
  }

  livingFoes() {
    return this.foes.filter((f) => f.koT < 0);
  }

  nearestFoe(from = this.my) {
    let best = null;
    let bd = Infinity;
    for (const f of this.livingFoes()) {
      const d = f.pos.distanceTo(from.pos);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  resetFighters() {
    const hp = this.mode.hp || 100;
    const all = [this.my, ...this.foes];
    for (const f of all) {
      f.speed = 0;
      f.cd = 0;
      f.lightCd = 0;
      f.strikeT = 9;
      f.hitT = 9;
      f.stunT = 9;
      f.koT = -1;
      f.chargeT = -1;
      f.blocking = false;
      f.blockT = 9;
      f.pounce = null;
      f.person.group.rotation.z = 0;
      f.person.group.position.y = 0;
      f.person.rig.rotation.set(0, 0, 0);
    }
    this.my.pos.set(0, 0, -7);
    this.my.heading = 0;
    this.my.hp = hp;
    this.my.maxHp = hp;
    // 野獸排開站位(弧形),開場臉必朝玩家(鐵則)
    const n = this.foes.length;
    this.foes.forEach((f, i) => {
      const off = i - (n - 1) / 2;
      f.pos.set(off * 4.2, 0, 7 + Math.abs(off) * 0.8);
      f.heading = Math.atan2(this.my.pos.x - f.pos.x, this.my.pos.z - f.pos.z);
      f.hp = Math.round(hp * f.stats.hpMul);
      f.maxHp = f.hp;
      if (f.person.telegraph) {
        f.person.telegraph.visible = false;
        f.person.telegraph.material.opacity = 0;
      }
      f.brain.retreatT = 0;
      f.brain.orbitDir = i % 2 === 0 ? 1 : -1;
      f.brain.breatherT = 4 + Math.random() * 4;
      f.brain.restT = 0;
      f.brain.pounceT = 3 + i * 2 + Math.random() * 3; // 錯開撲擊節奏,群獸不同步撲
    });
    this.roundNo = 0;
    this.lastHit = null;
    this.endT = -1;
    this.hitCamT = 9;
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    this._pendingStrikes = [];
    if (this.honey) { this.scene.remove(this.honey.group); this.honey = null; }
    this.honeyTimer = this._nextHoneyTimer();
    this.syncFighterTransforms();
    const fwd = new THREE.Vector3(Math.sin(this.my.heading), 0, Math.cos(this.my.heading));
    this.camPos.copy(this.my.pos).addScaledVector(fwd, -5.5).setY(3.0);
    this.camLook.copy(this.my.pos).addScaledVector(fwd, 8).setY(1.3);
  }

  _nextHoneyTimer() {
    // 多獸時蜂蜜更頻繁(公平鐵則的另一半:壓力大,補給也多)
    let scale = this.foes && this.foes.length > 1 ? 0.7 : 1;
    // 🍯 快腿羊天賦:蜂蜜更常被牠找到
    if (this.flock && this.flock.some((s) => s.genes.gift === "swift")) scale *= 0.65;
    return (HONEY_MIN_T + Math.random() * (HONEY_MAX_T - HONEY_MIN_T)) * scale;
  }

  syncFighterTransforms() {
    for (const f of [this.my, ...this.foes]) {
      f.person.group.position.x = f.pos.x;
      f.person.group.position.z = f.pos.z;
      f.person.group.rotation.y = f.heading;
    }
  }

  // ---------- 局面控制 ----------
  applyPresentation({ difficulty, modeId, beastId }) {
    let rebuild = false;
    if (difficulty && DIFFICULTY_PRESETS[difficulty]) {
      const wasDeath = !!DIFFICULTY_PRESETS[this.difficulty]?.deathMode;
      this.difficulty = difficulty;
      if (wasDeath !== !!DIFFICULTY_PRESETS[difficulty].deathMode) rebuild = true; // 黑獸⇄原色即時重建
    }
    if (beastId && BEAST_LOADOUTS[beastId] && beastId !== this.beastId) {
      this.beastId = beastId;
      rebuild = true;
    }
    if (modeId && GAME_MODES[modeId]) {
      this.modeId = modeId;
      this.mode = getModeConfig(modeId);
    }
    if (rebuild) {
      this._buildFighters();
      this.resetFighters();
    }
    saveSettings({ difficulty: this.difficulty, modeId: this.modeId, beastId: this.beastId });
    this.message = `${this.mode.label} · ${BEAST_LOADOUTS[this.beastId].label} · ${DIFFICULTY_LABELS[this.difficulty]} 已設定。`;
    this.pushHud();
  }

  openHomeMenu() {
    this.phase = "menu";
    this.overlay.visible = false;
    // 🐑 清掉漫遊殘留(迷羊/取名凍結),羊群留在場上當背景無妨(下一局會重建)
    if (this.lost) { this.scene.remove(this.lost.group); this.lost = null; }
    this.holdRoam = false;
    for (const f of this.foes) f.person.group.visible = true;
    this.message = "在首頁選擇模式、野獸陣容與難度後開始。";
    this.pushHud();
  }

  startSelectedMatch() {
    this.resetFighters();
    this.roam = !!this.mode.roam;
    this._setupFlockForMatch();
    this._setupDogsForMatch();
    if (this.roam) {
      // 漫遊:野獸收起來(移到場外遠處+隱形),不進戰鬥判定
      for (const f of this.foes) {
        f.pos.set(999, 0, 999);
        f.person.group.visible = false;
      }
      this.syncFighterTransforms();
      this.lost = null;
      this.lostTimer = 2.5;
      this.foundCount = 0;
      this._penHint = false;
      this.phase = "battle"; // 漫遊不設 gate,直接開走
      this.message = "牧場漫遊——聽!曠野裡有羊在咩咩叫,走過去找牠。WASD 走路、Shift 快跑。";
      this.emitEvent("roam-start", { flock: this.flock.length });
      this.pushHud();
      return;
    }
    for (const f of this.foes) f.person.group.visible = true;
    this.phase = "gate";
    this.message = "點畫面(或空白鍵/K)開戰!WASD 走位、J 輕拳、K 重拳(可蓄力放聖靈金光)。";
    this.emitEvent("match-start", { mode: this.mode.label, loadout: BEAST_LOADOUTS[this.beastId].label });
    this.pushHud();
  }

  // ---------- 🐑 羊群:建場上羊實體(漫遊=伴行清單;戰鬥=出戰清單) ----------
  _setupFlockForMatch() {
    for (const s of this.flock) this.scene.remove(s.person.group);
    this.flock = [];
    this.trail = [];
    this._bellT = 0;
    this._songT = 0;
    this._woolCd = 0;
    const dex = loadDex();
    const ids = this.roam || this.mode.roam ? dex.follow : dex.squad;
    const byId = new Map(dex.sheep.map((s) => [s.id, s]));
    for (const id of ids) {
      const rec = byId.get(id);
      if (rec) this._addFlockEntity(rec);
    }
    // 🐑 羊圈裡的羊:已尋回但這次沒帶出門的,待在東側石圈裡休息(看得到自己的收藏;上限 10)
    for (const p of this.penSheep || []) this.scene.remove(p.group);
    this.penSheep = [];
    // 🗺 真實地圖模式不放圈中羊:石砌羊圈跟著曠野牧場一起收起來了,
    // 只留羊在街上會變成「一群羊浮在馬路中間、旁邊沒有圈」——看羊改走 🐑 圖鑑鈕。
    if ((this.roam || this.mode.roam) && !this.realMap) {
      const F = ARENA_HALF + 2;
      const out = new Set(ids);
      const resting = dex.sheep.filter((s) => !out.has(s.id)).slice(0, 10);
      resting.forEach((rec, i) => {
        const p = makeGeneSheep(rec.genes);
        const a = (i / 10) * Math.PI * 2 + 0.4;
        const r = 1.1 + (i % 3) * 0.95;
        p.group.position.set(F + 7 + Math.cos(a) * r, 0, F * 0.4 + Math.sin(a) * r);
        p.group.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(p.group);
        p.phase = Math.random() * 10;    // 各自的節奏,不會整群同步(像一群真的羊)
        p.baseY = p.group.rotation.y;
        this.penSheep.push(p);
      });
    }
  }

  // 🐑 圖鑑改了伴行名單 → 漫遊中立即重建場上羊與圈中羊;戰鬥中不重建(絨毛盾等冷卻會被洗掉),下一場才生效
  refreshFlock() {
    if (this.roam && this.phase === "battle") this._setupFlockForMatch();
  }

  /* 🗺 開啟真實地圖地面(0811「像尋羊記一樣走在真實的 3D 地圖上」)。
     成功=腳下換成你所在位置的街道、活動範圍放大到 ±400 公尺、曠野牧場整組收起來;
     失敗(沒網路/圖磚被擋)=回 false,呼叫端就留在曠野牧場照玩(離線鐵則)。 */
  async enableRealMap(lat, lon) {
    /* 🌅 setGroundTod 跟著同一次動態 import 取出來存著 ——
       realmap.js 是**刻意動態載入**的(曠野模式不載它,省首屏),
       所以不可以為了時段氛圍在檔頭加一條靜態 import,那會把它拉回主包。 */
    const { createRealMap, setGroundTod } = await import("./realmap.js");
    this._setGroundTod = setGroundTod;
    let map = null;
    try {
      map = await createRealMap(this.scene, { lat, lon, radius: 2 });
    } catch {
      map = { ok: false, reason: "exception" };
    }
    if (!map.ok) return false;
    this.realMap = map;
    this.bound = 400;                                   // 走得出去才叫「走在地圖上」
    for (const o of this.pastureObjects || []) o.visible = false;
    // 還沒補到的磚底下要有東西:不然遠處是天空的顏色,看起來像世界破了一個洞
    if (!this.mapBase) {
      this.mapBase = new THREE.Mesh(
        new THREE.PlaneGeometry(1400, 1400),
        new THREE.MeshBasicMaterial({ color: 0xe8e6df }),
      );
      this.mapBase.rotation.x = -Math.PI / 2;
      this.mapBase.position.y = -0.02;
      this.scene.add(this.mapBase);
    }
    this.mapBase.visible = true;
    // 🗺 0812:進場那一刻的霧也要跟 update 一致(原 90/320 太近,街道一出腳下磚就糊)
    this.scene.fog = new THREE.Fog(0xcfe2f2, 260, 470);  // near 遠一點才看得清街廓;far 留著讓地圖邊界淡出
    this.camera.far = 700;
    this.camera.updateProjectionMatrix();

    /* 🏙 真實建築量體(0812 使用者:「也沒有高樓大廈」「尋羊記裡的高樓…可以參考」)。
       ★ 刻意**不 await**:Overpass 實測 1.3~3.7 秒,擋在這裡等於按下「出發」要多等三秒
         (0811 已經為了「只等腳下一塊」把開場從 7~9 秒壓到 0.9 秒,不能又加回去)。
         建築晚幾秒浮出來完全可以接受 —— 它是加分,不是玩法。
       ★ 失敗一律靜默:沒網路/Overpass 忙 → 就是沒有建築,遊戲照玩(同離線鐵則)。 */
    import("./buildings.js")
      .then(({ createBuildings }) => createBuildings(this.scene, {
        lat, lon,
        latLonToWorld: map.latLonToWorld,
        enabled: this.settings?.landmarksOnline !== false,   // 沿用「不連外查」那個開關,不另開一個
      }))
      .then((b) => {
        if (!b) return;
        if (!this.realMap) { b.dispose(); return; }          // 已經離開真實地圖模式了(使用者手快)
        this.buildings = b;
      })
      .catch(() => { /* 建築是加分,失敗不吭聲 */ });

    /* 🪧 地標招牌(0817):公園/學校/超市/便利店在畫面上看得見、認得出。
       純本機渲染(讀預烤包+快取),失敗就是沒有,不影響玩法。 */
    try {
      this.poiMarkers = createPoiMarkers(this.scene, { latLonToWorld: map.latLonToWorld });
      this.poiMarkers?.update(lat, lon);
    } catch { this.poiMarkers = null; }

    return true;
  }

  /* 🚶 實走模式(牧10):GPS 是搖桿。要在 enableRealMap 成功**之後**開
     (latLonToWorld 住在 realMap 上)。main.js 負責 watchPosition,這裡只吃座標。 */
  setRealWalk(on) {
    if (!on || !this.realMap || !this.realMap.latLonToWorld) { this.realWalk = null; return false; }
    const map = this.realMap;
    this.realWalk = createRealWalk({ latLonToWorld: (lat, lon) => map.latLonToWorld(lat, lon) });
    return true;
  }

  feedRealWalk(lat, lon, accuracy) {
    if (!this.realWalk) return null;
    return this.realWalk.feed(lat, lon, accuracy);
  }

  disableRealMap() {
    this.realWalk = null;    // 🚶 地圖收了,實走一起收(不然 feed 會往不存在的地圖投影)
    this._bAnnounced = false;
    this._bFailAnnounced = false;
    this._bEmptyAnnounced = false;
    this._poiAnnounced = false;
    if (this.poiMarkers) { this.poiMarkers.dispose(); this.poiMarkers = null; }
    if (this.buildings) { this.buildings.dispose(); this.buildings = null; }
    if (this.realMap) { this.realMap.dispose(); this.realMap = null; }
    if (this.mapBase) this.mapBase.visible = false;
    this.bound = ARENA_HALF;
    for (const o of this.pastureObjects || []) o.visible = true;
    this.scene.fog = new THREE.Fog(0xbfd8ec, 55, 150);
    this.camera.far = 220;
    this.camera.updateProjectionMatrix();
  }

  _addFlockEntity(rec) {
    const person = makeGeneSheep(rec.genes);
    this.scene.add(person.group);
    const i = this.flock.length;
    const s = {
      id: rec.id, name: rec.name, genes: rec.genes, person,
      pos: new THREE.Vector3(this.my.pos.x - Math.sin(this.my.heading) * (1.2 * (i + 1)), 0, this.my.pos.z - Math.cos(this.my.heading) * (1.2 * (i + 1))),
      heading: this.my.heading, speed: 0, walkT: Math.random() * 3, bleatT: 4 + Math.random() * 8,
    };
    person.group.position.set(s.pos.x, 0, s.pos.z);
    person.group.rotation.y = s.heading;
    this.flock.push(s);
    return s;
  }

  // 跟隨鏈(皮克敏式):第 0 隻跟牧人、第 i 隻跟第 i-1 隻,保持間距;羊有自己的小碎步節奏
  updateFlock(dt) {
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    let prev = this.my;
    for (const s of this.flock) {
      const gap = 1.15 + s.genes.size * 0.25;
      const dx = prev.pos.x - s.pos.x;
      const dz = prev.pos.z - s.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > gap) {
        const want = Math.atan2(dx, dz);
        const diff = wrapAngle(want - s.heading);
        s.heading += clamp(diff, -3.2 * dt, 3.2 * dt);
        const targetSpd = Math.min(preset.maxFwd * 1.25, (dist - gap) * 3.2);
        s.speed += (targetSpd - s.speed) * Math.min(1, dt * 5);
      } else {
        s.speed += (0 - s.speed) * Math.min(1, dt * 6);
      }
      s.pos.x += Math.sin(s.heading) * s.speed * dt;
      s.pos.z += Math.cos(s.heading) * s.speed * dt;
      // 🏙 建築碰撞:羊也不穿牆(半徑比牧人小,巷弄跟得進去)
      if (this.buildings?.collide) {
        const c = this.buildings.collide(s.pos.x, s.pos.z, 0.4);
        if (c) { s.pos.x = c.x; s.pos.z = c.z; }
      }
      s.walkT += dt * (1 + Math.abs(s.speed));
      const g = s.person.group;
      g.position.set(s.pos.x, Math.abs(Math.sin(s.walkT * 6)) * Math.min(0.06, Math.abs(s.speed) * 0.05), s.pos.z);
      g.rotation.y = s.heading;
      s.person.legs.forEach((leg, li) => {
        leg.rotation.x = Math.sin(s.walkT * 6 + (li % 2 ? Math.PI : 0)) * Math.min(0.7, Math.abs(s.speed) * 0.4);
      });
      s.bleatT -= dt;
      if (s.bleatT <= 0) {
        s.bleatT = 6 + Math.random() * 10;
        // 妹妹的咩咩聲:小羊更高更奶聲(size 0.88~1.14 → pitch 1.42~1.16)
        this.emitEvent("sheep-bleat", { pitch: 1.3 + (1 - s.genes.size) });
      }
      prev = s;
    }
  }

  // ---------- 🐕 牧羊犬(0818 使用者:「羊群的頭尾各1隻,繞著羊群,來保護羊群」) ----------
  // 忠忠(邊牧)開場在羊群頭側、勇勇(柴柴)在尾側,兩隻相位差 π 繞著「牧人→最後一隻羊」
  // 的隊伍橢圓巡邏;戰鬥中野獸靠近羊群,離牠最近的狗會脫隊擋在野獸與羊之間吠(不咬——
  // 狗與羊同一條神學鐵則:守護與同行,不是攻擊單位,傷害數值零變動)。
  _setupDogsForMatch() {
    for (const d of this.dogs || []) this.scene.remove(d.person.group);
    this.dogs = [];
    const specs = [
      { name: "忠忠", variant: "collie", phase: 0, pitch: 1.0 },
      { name: "勇勇", variant: "shiba", phase: Math.PI, pitch: 1.18 },
    ];
    for (const sp of specs) {
      const person = makeSheepdog(sp.variant);
      const d = {
        ...sp, person,
        pos: new THREE.Vector3(
          this.my.pos.x + Math.sin(this.my.heading + sp.phase) * 2.6, 0,
          this.my.pos.z + Math.cos(this.my.heading + sp.phase) * 2.6,
        ),
        heading: this.my.heading, speed: 0, walkT: Math.random() * 3,
        barkT: 2.5 + Math.random() * 2.5, guard: false,   // 開場先「報到」吠一聲(0819:太久才吠=以為沒聲音)
      };
      person.group.position.set(d.pos.x, 0, d.pos.z);
      person.group.rotation.y = d.heading;
      this.scene.add(person.group);
      this.dogs.push(d);
    }
    this._dogOrbitA = 0;
    this._dogHintT = this._dogIntroDone ? -1 : 3.2;   // 開場稍後介紹一次(不蓋掉模式開場訊息)
  }

  updateDogs(dt) {
    if (!this.dogs || !this.dogs.length) return;
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    this._dogOrbitA += dt * 0.85;                      // 巡邏角速度:小跑步,不狂奔
    if (this._dogHintT > 0) {
      this._dogHintT -= dt;
      if (this._dogHintT <= 0) {
        this._dogIntroDone = true;
        this.message = "🐕 牧羊犬忠忠與勇勇一頭一尾繞著羊群巡邏,保護大家!";
      }
    }
    // 隊伍橢圓:牧人=頭、最後一隻羊=尾;沒帶羊出門就繞著牧人轉
    const head = this.my.pos;
    const tail = this.flock.length ? this.flock[this.flock.length - 1].pos : this.my.pos;
    const cx = (head.x + tail.x) / 2, cz = (head.z + tail.z) / 2;
    const half = Math.hypot(head.x - tail.x, head.z - tail.z) / 2;
    const orbitR = clamp(half + 2.4, 2.6, 11);
    const angle0 = Math.atan2(head.x - tail.x, head.z - tail.z); // 相位 0 = 頭側

    // 戰鬥中:最靠近羊群的活獸(10m 內)由最近的狗去擋
    let threat = null;
    if (!this.roam) {
      let best = 10;
      for (const f of this.livingFoes()) {
        const dd = Math.hypot(f.pos.x - cx, f.pos.z - cz);
        if (dd < best) { best = dd; threat = f; }
      }
    }
    let guardDog = null;
    if (threat) {
      let best = Infinity;
      for (const d of this.dogs) {
        const dd = Math.hypot(d.pos.x - threat.pos.x, d.pos.z - threat.pos.z);
        if (dd < best) { best = dd; guardDog = d; }
      }
    }

    for (const d of this.dogs) {
      const wasGuard = d.guard;
      d.guard = d === guardDog;
      if (!d.guard) d._guardSaid = false;
      else if (!wasGuard) d.barkT = Math.min(d.barkT, 0.3);   // 一站上哨就先吠一聲
      let tx, tz, faceAt = null;
      if (d.guard) {
        // 擋位:野獸與羊群中心連線上、離野獸 1.5m 的那一點,臉朝野獸
        const dx = threat.pos.x - cx, dz = threat.pos.z - cz;
        const L = Math.hypot(dx, dz) || 1;
        tx = threat.pos.x - (dx / L) * 1.5;
        tz = threat.pos.z - (dz / L) * 1.5;
        faceAt = threat.pos;
        d.barkT -= dt * 4;                             // 站哨時吠得勤(≈每 3 秒)
      } else {
        const a = angle0 + d.phase + this._dogOrbitA;
        tx = cx + Math.sin(a) * orbitR;
        tz = cz + Math.cos(a) * orbitR;
        d.barkT -= dt;                                 // 巡邏時偶爾開心吠一聲
      }
      if (d.barkT <= 0) {
        d.barkT = 9 + Math.random() * 9;   // 兩隻合計約 6~7 秒聽到一聲(0819 從 12~24 收短)
        // 字幕只在「剛站上哨」那一聲出(之後只有汪汪聲)——不然戰鬥中每幾秒洗一行版
        const announce = d.guard && !d._guardSaid;
        if (announce) d._guardSaid = true;
        this.emitEvent("dog-bark", { pitch: d.pitch * (d.guard ? 1.06 : 1), guard: announce, name: d.name });
      }
      // 追目標點(目標一直在動 ⇒ 狗自然一直小跑);狗比羊快,跟得上牧人衝刺
      const dx = tx - d.pos.x, dz = tz - d.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.25) {
        const want = Math.atan2(dx, dz);
        const diff = wrapAngle(want - d.heading);
        d.heading += clamp(diff, -4.2 * dt, 4.2 * dt);
        const targetSpd = Math.min(preset.maxFwd * 1.6, dist * 2.6);
        d.speed += (targetSpd - d.speed) * Math.min(1, dt * 5);
      } else {
        d.speed += (0 - d.speed) * Math.min(1, dt * 6);
      }
      d.pos.x += Math.sin(d.heading) * d.speed * dt;
      d.pos.z += Math.cos(d.heading) * d.speed * dt;
      const b = this.bound || ARENA_HALF;
      d.pos.x = clamp(d.pos.x, -b, b);
      d.pos.z = clamp(d.pos.z, -b, b);
      // 🏙 狗也不穿牆(半徑同羊,巷弄跟得進去)
      if (this.buildings?.collide) {
        const c = this.buildings.collide(d.pos.x, d.pos.z, 0.4);
        if (c) { d.pos.x = c.x; d.pos.z = c.z; }
      }
      // 站哨時臉鎖野獸(移動慢時才鎖得住,免得跑動中原地打轉)
      if (faceAt && dist <= 1.2) {
        const wantFace = Math.atan2(faceAt.x - d.pos.x, faceAt.z - d.pos.z);
        d.heading += clamp(wrapAngle(wantFace - d.heading), -5 * dt, 5 * dt);
      }
      d.walkT += dt * (1 + Math.abs(d.speed));
      const g = d.person.group;
      g.position.set(d.pos.x, Math.abs(Math.sin(d.walkT * 7)) * Math.min(0.07, Math.abs(d.speed) * 0.05), d.pos.z);
      g.rotation.y = d.heading;
      d.person.legs.forEach((leg, li) => {
        leg.rotation.x = Math.sin(d.walkT * 7 + (li % 2 ? Math.PI : 0)) * Math.min(0.75, Math.abs(d.speed) * 0.42);
      });
      // 搖尾巴:巡邏=開心慢搖;站哨=快搖(警戒但不兇——牠是保護者不是攻擊者)
      d.person.tail.rotation.z = Math.sin(this.time * (d.guard ? 14 : 6) + d.phase) * 0.38;
    }
  }

  // 🐑 圈裡休息的羊也要會動:低頭吃草的小晃+偶爾換個方向(不走出圈,免得看起來像逃跑)
  updatePenSheep() {
    for (const p of this.penSheep || []) {
      const t = this.time + p.phase;
      p.group.position.y = Math.abs(Math.sin(t * 1.6)) * 0.03;
      p.group.rotation.y = p.baseY + Math.sin(t * 0.35) * 0.5;
      p.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(t * 1.6 + (i % 2 ? Math.PI : 0)) * 0.12;
      });
    }
  }

  // ---------- 🐑 漫遊:迷羊出現與尋回(路15:4-6) ----------
  updateRoam(dt) {
    this.updatePenSheep();
    // 🗺 走到哪就把地圖補到哪(realmap 內部自己節流,同一格磚內不重算)
    if (this.realMap) this.realMap.update(this.my.pos.x, this.my.pos.z);
    if (this.holdRoam) return;
    // 走近東側石圈=看見圈中休息的羊,提示可開圖鑑挑選(每次漫遊只提示一次)
    if (!this._penHint) {
      const F = ARENA_HALF + 2;
      if (Math.hypot(this.my.pos.x - (F + 7), this.my.pos.z - F * 0.4) < 11.5) {
        this._penHint = true;
        this.message = "前面就是羊圈!已尋回的羊在圈裡休息——按「🐑 羊圈」查看與挑選伴行的羊。";
        this.pushHud();
      }
    }
    this._updateLandmarks(dt);          // 🗺 走進真的公園/學校 → 那裡有一隻特別的羊
    if (!this.lost) {
      this.lostTimer -= dt;
      if (this.lostTimer <= 0) this._spawnLostSheep();
      return;
    }
    const L = this.lost;
    L.bleatT -= dt;
    if (L.bleatT <= 0) {
      L.bleatT = 2.2 + Math.random() * 1.6;
      this.emitEvent("sheep-cry", {});
    }
    // 迷羊原地不安地小轉+光柱呼吸
    L.group.rotation.y += Math.sin(this.time * 1.7) * dt * 0.8;
    if (L.beacon) {
      L.beacon.material.opacity = 0.2 + 0.14 * (1 + Math.sin(this.time * 2.2)) * 0.5;
      L.beacon.rotation.y += dt * 0.6;
    }
    const d = Math.hypot(L.pos.x - this.my.pos.x, L.pos.z - this.my.pos.z);
    if (d < 1.7) {
      // 尋回!交給 UI 取名(holdRoam 由 UI 設回)
      this.holdRoam = true;
      // 🗺 地標羊要把地標名帶給 UI,取名後才寫得進圖鑑(「恩典・🗺大安公園」)
      this.emitEvent("sheep-found", { genes: L.genes, landmark: L.landmark || null });
    }
  }

  /* ---------- 🗺 真實地標任務(0812)----------
     走進真的公園/學校/球場,那座地標上就有一隻**特別的羊**在等你(每座地標 24 小時一隻)。
     ★ 只在真實地圖模式有效:曠野牧場沒有「真的地方」可以走進去。
     ★ 判位節流 1.2 秒一次:worldToLatLon + 距離比對很便宜,但沒必要每幀跑 60 次。
     ★ 線上補查是 fire-and-forget:它自己有五道閘(見 landmarks.js),而且**永遠不吐錯**——
       地標羊是加分功能,查不到就當這一帶沒有地標,遊戲照樣完整。 */
  _updateLandmarks(dt) {
    if (!this.realMap || !this.realMap.latLonToWorld) return;
    this._lmT = (this._lmT || 0) - dt;
    if (this._lmT > 0) return;
    this._lmT = 1.2;

    const here = this.realMap.worldToLatLon(this.my.pos.x, this.my.pos.z);
    if (!Number.isFinite(here.lat) || !Number.isFinite(here.lon)) return;

    // 走出預烤範圍才會真的發請求;補到新資料就立刻再判一次位
    // 🔒 可以整個關掉線上補查(關了=只用預烤包)。★ 讀 storage 而不是快取在物件上:
    //    使用者在設定裡按下去要**當場生效**,不必重開遊戲。loadSettings 只讀一顆 localStorage,
    //    而這裡 1.2 秒才跑一次,完全不是熱路徑。
    const online = loadSettings().landmarksOnline !== false;
    topUpLandmarks(here.lat, here.lon, { enabled: online }).catch(() => {});
    // 0817 走到哪補到哪:建築走進新格才抓(內建五道禮貌閘);招牌純本機、只是重掃快取
    if (online && this.buildings?.update) this.buildings.update(here.lat, here.lon);
    if (this.poiMarkers?.update) this.poiMarkers.update(here.lat, here.lon);
    // 第一批到貨時吭一聲——「正在向志工伺服器排隊(9~12 秒)」和「壞了」在畫面上長一樣,
    // 不吭聲使用者只會覺得「都看不到」(0817 實際回報)。
    if (!this._bAnnounced && this.buildings && this.buildings.count > 0) {
      this._bAnnounced = true;
      this._bMsgAt = this.time;
      this.message = `🏙 附近的建築上好了(${this.buildings.count} 棟)。`;
    }
    // 🏙 0818:抓失敗也要吭一聲——「志工伺服器在忙」和「壞了」在畫面上長一樣,
    // 全靜默的結果就是使用者回報「看不到高樓大廈」(demo 區已預烤所以進不到這行;GPS 區才會)。
    if (!this._bAnnounced && !this._bFailAnnounced && this.buildings
        && this.buildings.count === 0 && this.buildings.lastFailAt > 0) {
      this._bFailAnnounced = true;
      this._bMsgAt = this.time;
      this.message = "🏙 建築資料的志工伺服器現在正忙——街道照逛,建築等一下會自動再試。";
    }
    // 🏙 0819:抓成功但 0 棟也要吭(第三種沉默)——OSM 公開地圖上沒有志工畫過這一帶的建築,
    // 伺服器與程式都沒壞;不吭的話與「壞了」在畫面上長一樣(使用者實際回報「沒看到狀態列」)。
    if (!this._bAnnounced && !this._bFailAnnounced && !this._bEmptyAnnounced && this.buildings
        && this.buildings.count === 0 && this.buildings.emptyOkAt > 0) {
      this._bEmptyAnnounced = true;
      this._bMsgAt = this.time;
      this.message = "🏙 公開地圖(OpenStreetMap)這一帶還沒有人畫建築——街道與地標照常。";
    }
    // 🪧 招牌訊息讓路 4 秒:0819 實測它下一個 1.2s tick 就把建築訊息蓋掉=使用者根本來不及讀
    if (!this._poiAnnounced && this.poiMarkers && this.poiMarkers.count > 0
        && (!this._bMsgAt || this.time - this._bMsgAt > 4)) {
      this._poiAnnounced = true;
      this.message = `🪧 附近有 ${this.poiMarkers.count} 面地標招牌(學校/公園/商店,拉遠更好認)。`;
    }

    if (this.lost || this.holdRoam) return;              // 已經有一隻羊在等他找了,不要同時兩隻
    const lm = findLandmarkAt(here.lat, here.lon);
    if (!lm || landmarkClaimed(lm)) return;
    claimLandmark(lm);                                   // 先記帳:免得同一座公園連噴好幾隻
    this._spawnLostSheep(lm);
  }

  _spawnLostSheep(landmark = null) {
    const genes = randomGenes();
    // 🗺 地標羊=看得出來不一樣:大一點、而且天賦固定成「詩歌羊」(在那個地方唱詩讚美)
    if (landmark) { genes.size = Math.min(1.28, genes.size * 1.12); genes.gift = "song"; }
    const person = makeGeneSheep(genes);
    // 出現在牧人一段距離外的環帶上(看得到方向、要走一小段)
    // 🗺 真實地圖:散到 35~110 公尺外的街區——沿用曠野的 9~13 公尺會變成「一出門就踩到羊」,
    //    整個「走出去找」的重點就沒了(這是換地圖才會露出來的體驗 bug,不是數值偏好)。
    const sb = (this.bound || ARENA_HALF) - 1; // 真實地圖模式=迷羊散在幾百公尺的街區裡(同 movePos 的 clamp 例外)
    let x, z, r;
    if (landmark) {
      // 🗺 放在**那座地標真正的位置**上(不是「在你附近隨便找個點」)——孩子走過去看到的就是那座公園
      const w = this.realMap.latLonToWorld(landmark.lat, landmark.lon);
      x = clamp(w.x, -sb, sb);
      z = clamp(w.z, -sb, sb);
      r = Math.hypot(x - this.my.pos.x, z - this.my.pos.z);
    } else {
      const a = Math.random() * Math.PI * 2;
      r = this.realMap ? 35 + Math.random() * 75 : 9 + Math.random() * 4.5;
      x = clamp(this.my.pos.x + Math.cos(a) * r, -sb, sb);
      z = clamp(this.my.pos.z + Math.sin(a) * r, -sb, sb);
    }
    person.group.position.set(x, 0, z);
    // 柔光柱=遠遠就看得到牠在哪(兒童友善指引)
    // 🗺 真實地圖上羊在上百公尺外,光柱要又高又粗才看得到(6 公尺的柱子在 100 公尺外=一個小點)
    const bh = this.realMap ? 34 : 6;
    // 🗺 地標羊的光柱是**淡青色**(一般迷羊是金色)⇒ 一眼看得出「那邊那隻不一樣」。
    //    ★ 不能只靠顏色分辨(紅綠色弱看不出來):所以訊息也直接寫出地標名字。
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(this.realMap ? 1.5 : 0.5, this.realMap ? 2.1 : 0.7, bh, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: landmark ? 0x9fe8dd : 0xffe89a,
        transparent: true, opacity: landmark ? 0.32 : 0.25, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    beacon.position.set(0, bh / 2, 0);
    person.group.add(beacon);
    this.scene.add(person.group);
    this.lost = { genes, group: person.group, person, pos: new THREE.Vector3(x, 0, z), bleatT: 0.5, beacon, landmark };
    if (landmark) {
      const m = landmarkMeta(landmark.k);
      this.message = `${m.icon} 你走到「${landmark.n}」了!這座${m.label}裡有一隻特別的羊在唱詩——`
        + `牠在 ${Math.round(r)} 公尺外,循著淡青色的光柱走過去。`;
    } else {
      this.message = this.realMap
        ? `聽——有迷失的羊在咩咩叫!牠在 ${Math.round(r)} 公尺外,循著金色光柱走過去(Shift 快跑)。`
        : "聽——有迷失的羊在咩咩叫!循著光柱走過去。";
    }
    this.emitEvent("lost-appear", { landmark });
    this.pushHud();
  }

  // UI 取完名字後呼叫:迷羊加入羊群(拿掉光柱、接到跟隨鏈尾)
  adoptLostSheep(rec) {
    if (!this.lost) return;
    const L = this.lost;
    if (L.beacon) L.group.remove(L.beacon);
    this.scene.remove(L.group);
    this.lost = null;
    this.foundCount += 1;
    const s = this._addFlockEntity(rec);
    s.pos.set(L.pos.x, 0, L.pos.z);
    this.lostTimer = 6 + Math.random() * 5;
    this.holdRoam = false;
    this.message = `${rec.name} 加入了羊群!(本次已尋回 ${this.foundCount} 隻)`;
    this.pushHud();
  }

  // ---------- 🐑 出戰羊天賦(支援,不攻擊;羊永遠不會死) ----------
  _squadHas(gift) {
    return this.flock.some((s) => s.genes.gift === gift);
  }

  updateSquadGifts(dt) {
    if (!this.flock.length) return;
    // 🔔 鈴鐺羊:定時搖鈴,野獸分神——取消進行中的撲擊預告、撲擊計時延後
    if (this._squadHas("bell")) {
      this._bellT += dt;
      if (this._bellT >= 12) {
        this._bellT = 0;
        let dazed = 0;
        for (const f of this.livingFoes()) {
          if (f.pounce && f.pounce.phase === "telegraph") {
            f.pounce = null;
            if (f.person.telegraph) { f.person.telegraph.visible = false; f.person.telegraph.material.opacity = 0; }
          }
          f.brain.pounceT += 3.5;
          f.cd = Math.max(f.cd, 0.9);
          dazed += 1;
        }
        if (dazed) this.emitEvent("sheep-bell", {});
      }
    }
    // 🎵 詩歌羊:每 3 秒回 1 點勇氣
    if (this._squadHas("song")) {
      this._songT += dt;
      if (this._songT >= 3) {
        this._songT = 0;
        if (this.my.hp > 0 && this.my.hp < this.my.maxHp) {
          this.my.hp = Math.min(this.my.maxHp, this.my.hp + 1);
        }
      }
    }
    // 🧣 絨毛羊護盾冷卻
    this._woolCd = Math.max(0, this._woolCd - dt);
  }

  strike() {
    if (this.overlay.visible) return;
    if (this.phase === "gate") {
      this.phase = "battle";
      this.emitEvent("battle-start", {});
      this.message = "開戰!倚靠耶和華,把羊羔從野獸口中救回來!";
      this.pushHud();
    }
  }

  // ---------- 輸入 ----------
  setupInput() {
    this.canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this._heavyPress();
    });
    window.addEventListener("pointerup", () => this._heavyRelease());
    window.addEventListener("pointercancel", () => this._heavyRelease());
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  // 按下重拳鍵:開戰/開始蓄力(短按放開=普通重拳,長按=聖靈金光)
  _heavyPress() {
    if (this.overlay.visible) return;
    if (this.phase === "gate") {
      this.strike();
      return;
    }
    if (this.phase !== "battle" || this.my.koT >= 0 || this.endT >= 0) return;
    if (this.my.blocking) return;
    if (this.my.cd > 0 || this.my.stunT < this._stunDur()) return;
    if (this.my.chargeT < 0) this.my.chargeT = 0;
  }

  // 放開重拳鍵:蓄滿=聖靈金光,沒蓄滿=普通重拳
  _heavyRelease() {
    if (this.my.chargeT < 0) return;
    const c = this.my.chargeT;
    this.my.chargeT = -1;
    if (this.phase !== "battle" || this.my.koT >= 0) return;
    const target = this.nearestFoe();
    if (!target) return;
    if (c >= CHARGE_MIN) {
      this.superAttack(this.my, target, clamp((c - CHARGE_MIN) / (CHARGE_FULL - CHARGE_MIN), 0, 1));
    } else {
      this.attack(this.my, target);
    }
  }

  // ---------- 輕拳(J):快、傷害低、獨立冷卻,不蓄力;目標=最近的活獸 ----------
  lightPunch() {
    if (this.overlay.visible || this.phase !== "battle" || this.endT >= 0) return;
    const f = this.my;
    if (f.koT >= 0 || f.blocking || f.chargeT >= 0) return;
    if (f.lightCd > 0 || f.stunT < this._stunDur()) return;
    const target = this.nearestFoe();
    if (!target) return;
    f.lightCd = LIGHT_PUNCH.cd;
    f.strikeT = 0;
    f.strikeKind = "light";
    this.roundNo += 1;
    const dist = f.pos.distanceTo(target.pos);
    if (dist <= LIGHT_PUNCH.reach + BODY_REACH + 1.0) {
      f.heading = Math.atan2(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
    }
    const toTarget = Math.atan2(target.pos.x - f.pos.x, target.pos.z - f.pos.z);
    const facing = Math.abs(wrapAngle(toTarget - f.heading)) <= LIGHT_PUNCH.arc;
    const lands = dist <= LIGHT_PUNCH.reach + BODY_REACH && facing;
    if (lands) {
      this._pendingStrikes.push({
        target,
        dmg: LIGHT_PUNCH.dmg,
        opts: { who: "me", weapon: { label: "輕拳", short: "輕拳" }, stun: 0, attacker: f, kind: "melee", knockback: 0.1 },
        t: 0.12,
      });
    } else {
      this.emitEvent("miss", { who: "me" });
      this.message = dist > LIGHT_PUNCH.reach + BODY_REACH ? "太遠了——再靠近一步出拳!" : `沒對準——轉身面向${target.stats.label}!`;
      this.pushHud();
    }
  }

  // ---------- 重拳(K,普通釋放):慢、傷害高、命中擊退 ----------
  attack(fighter, target) {
    if (this.phase !== "battle" || this.endT >= 0) return;
    if (fighter.cd > 0 || fighter.stunT < this._stunDur() || fighter.koT >= 0) return;
    const w = WEAPONS.fists;
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const isPlayer = fighter === this.my;
    fighter.cd = w.cd * (isPlayer ? 1 : preset.aiCd);
    fighter.strikeT = 0;
    if (isPlayer) fighter.strikeKind = "heavy";
    this.roundNo += 1;

    if (isPlayer) {
      const snapDist = fighter.pos.distanceTo(target.pos);
      if (snapDist <= w.reach + BODY_REACH + 1.0) {
        fighter.heading = Math.atan2(target.pos.x - fighter.pos.x, target.pos.z - fighter.pos.z);
      }
    }

    const dist = fighter.pos.distanceTo(target.pos);
    const assist = isPlayer ? preset.assist : 0;
    const reach = w.reach + BODY_REACH + assist * 0.6;
    const toTarget = Math.atan2(target.pos.x - fighter.pos.x, target.pos.z - fighter.pos.z);
    const facing = Math.abs(wrapAngle(toTarget - fighter.heading)) <= w.arc + assist * 0.5;
    let lands = dist <= reach && facing;
    if (lands && !isPlayer && Math.random() > clamp(preset.aiSkill + 0.18, 0, 0.95)) lands = false;
    if (lands) {
      let dmg = w.dmg;
      if (w.chargeBonus) dmg *= 1 + w.chargeBonus * clamp(Math.abs(fighter.speed) / preset.maxFwd, 0, 1);
      dmg *= isPlayer ? 1 + assist * 0.6 : preset.aiDmg;
      this._pendingStrikes.push({
        target,
        dmg: Math.round(dmg),
        opts: { who: isPlayer ? "me" : "ai", weapon: { label: "重拳", short: "重拳" }, stun: 0, attacker: fighter, kind: "melee", knockback: 0.65 },
        t: CONTACT_AT[w.swing] || 0.2,
      });
    } else {
      this.emitEvent("miss", { who: isPlayer ? "me" : "ai" });
      if (isPlayer) {
        this.message = dist > reach ? "太遠了——再靠近一步出手!" : `沒對準——轉身面向${target.stats.label}再出手!`;
        this.pushHud();
      }
    }
  }

  _stunDur() {
    return 1.1;
  }

  // ---------- 蓄力大招:聖靈金光(撒上16:13,大傷害、不血腥;光波可穿透多獸) ----------
  superAttack(fighter, target, charge01) {
    if (this.phase !== "battle" || this.endT >= 0 || fighter.koT >= 0) return;
    const w = WEAPONS.fists;
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const isPlayer = fighter === this.my;
    fighter.cd = w.cd * 2.2 * (isPlayer ? 1 : preset.aiCd);
    fighter.strikeT = 0;
    if (isPlayer) fighter.strikeKind = "holy";
    this.roundNo += 1;
    if (isPlayer && target && fighter.pos.distanceTo(target.pos) <= 22) {
      fighter.heading = Math.atan2(target.pos.x - fighter.pos.x, target.pos.z - fighter.pos.z);
    }
    let dmg = w.dmg * (1.4 + 1.1 * charge01);
    dmg *= isPlayer ? 1 + preset.assist * 0.6 : preset.aiDmg;
    this._fireHolyWave(fighter, Math.round(dmg));
    this.emitEvent("super", { who: isPlayer ? "me" : "ai" });
    this.message = isPlayer
      ? "聖靈的能力臨到——金光大作!"
      : "野獸撲勢驚人——快閃開!";
    this.pushHud();
  }

  _fireHolyWave(fighter, dmg) {
    const wave = new THREE.Group();
    const arcMesh = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.15, 10, 26, Math.PI * 0.95),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 }),
    );
    arcMesh.rotation.z = Math.PI * 0.03;
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.36, 10, 26, Math.PI * 0.95),
      new THREE.MeshBasicMaterial({ color: HOLY_LIGHT_COLOR, transparent: true, opacity: 0.6 }),
    );
    glow.rotation.z = Math.PI * 0.03;
    wave.add(arcMesh);
    wave.add(glow);
    const light = new THREE.PointLight(HOLY_LIGHT_COLOR, 1.5, 5);
    wave.add(light);
    const fwd = new THREE.Vector3(Math.sin(fighter.heading), 0, Math.cos(fighter.heading));
    wave.position.copy(fighter.pos).setY(1.4).addScaledVector(fwd, 1.0);
    wave.rotation.y = fighter.heading;
    this.scene.add(wave);
    this.projectiles.push({
      mesh: wave, vel: fwd.multiplyScalar(13), t: 0,
      dmg, stun: 0,
      who: fighter === this.my ? "me" : "ai",
      weapon: { label: "聖靈金光", short: "金光" },
      isWave: true, hitR: 1.6, life: 1.3,
      hitSet: new Set(), // 穿透:同一獸只結算一次,可連中多獸
    });
  }

  // ---------- 格擋判定(大衛限定;野獸從不格擋) ----------
  _blockCheck(target, src, kind) {
    if (!target.blocking || !src) return null;
    const ang = Math.abs(wrapAngle(Math.atan2(src.x - target.pos.x, src.z - target.pos.z) - target.heading));
    if (ang > BLOCK_ARC) return null;
    if (kind === "melee" && target.blockT <= PARRY_WINDOW) return "parry";
    return "block";
  }

  foesHpSummary() {
    return this.foes.map((f) => ({ type: f.type, label: f.stats.label, short: f.stats.short, hp: f.hp, maxHp: f.maxHp, down: f.koT >= 0 }));
  }

  totalFoesHp() {
    return this.foes.reduce((s, f) => s + f.hp, 0);
  }

  applyHit(target, dmg, { who, weapon, stun, attacker, from, kind, knockback }) {
    if (this.phase !== "battle" || target.koT >= 0 || this.endT >= 0) return;
    // 🧣 絨毛羊:蓬蓬絨毛替牧人擋下這一擊(冷卻 20 秒;羊本身不受傷,鐵則)
    if (target === this.my && this._woolCd <= 0 && this._squadHas("wool")) {
      this._woolCd = 20;
      this.hitFlash.position.copy(target.pos).setY(1.5);
      this.hitFlash.material.color.setHex(0xffffff);
      this.hitFlashT = 0;
      this.emitEvent("sheep-wool", {});
      this.message = "絨毛羊蓬的一聲擋在前面——這一下不痛!";
      this.pushHud();
      return;
    }
    const src = from || (attacker ? attacker.pos : null);
    const block = this._blockCheck(target, src, kind);
    const targetLabel = target === this.my ? "大衛" : target.stats.label;
    if (block) {
      this.hitFlash.position.copy(target.pos).setY(1.5);
      this.hitFlash.material.color.setHex(0xffffff);
      this.hitFlashT = 0;
      if (block === "parry") {
        this.hitCamT = 0;
        if (attacker) {
          attacker.stunT = 0;
          attacker.cd = Math.max(attacker.cd, 1.2);
          attacker.speed *= -0.25;
          attacker.chargeT = -1;
        }
        this.emitEvent("parry", { who: target === this.my ? "me" : "ai" });
        this.message = `完美格擋!${attacker && attacker !== this.my ? attacker.stats.label : "野獸"}被震退!`;
        this.pushHud();
        return;
      }
      const reduced = Math.round(dmg * 0.3);
      this.emitEvent("block", { who: target === this.my ? "me" : "ai" });
      if (reduced <= 0) {
        this.message = "舉臂格擋——擋下來了!";
        this.pushHud();
        return;
      }
      target.hp = Math.max(0, target.hp - reduced);
      this.lastHit = { who, dmg: reduced, weapon: weapon.short };
      this.emitEvent("hit", { who, dmg: reduced, weapon: weapon.label, stun: false, myHp: this.my.hp, foesHp: this.foesHpSummary(), aiHp: this.totalFoesHp(), round: this.roundNo });
      this.message = `舉臂擋下大半——只受 -${reduced}`;
      if (target.hp <= 0) this._handleKnockout(target, who);
      this.pushHud();
      return;
    }
    target.hp = Math.max(0, target.hp - dmg);
    target.hitT = 0;
    if (stun) target.stunT = 0;
    target.chargeT = -1;
    target.speed *= 0.4;
    if (knockback && attacker) {
      const dir = target.pos.clone().sub(attacker.pos).setY(0);
      if (dir.lengthSq() > 0.0001) {
        dir.normalize();
        target.pos.addScaledVector(dir, knockback);
        target.pos.x = clamp(target.pos.x, -(this.bound || ARENA_HALF), this.bound || ARENA_HALF);
        target.pos.z = clamp(target.pos.z, -(this.bound || ARENA_HALF), this.bound || ARENA_HALF);
      }
    }
    this.hitFlash.position.copy(target.pos).setY(1.5);
    this.hitFlash.material.color.setHex(stun ? 0x6dff7a : 0xffe14d);
    this.hitFlashT = 0;
    this.hitCamT = 0;
    const isMe = who === "me";
    this.lastHit = { who, dmg, weapon: weapon.short };
    this.emitEvent("hit", {
      who, dmg, weapon: weapon.label, stun: !!stun,
      myHp: this.my.hp, foesHp: this.foesHpSummary(), aiHp: this.totalFoesHp(), round: this.roundNo,
      beast: target !== this.my ? target.type : (attacker && attacker !== this.my ? attacker.type : null),
    });
    this.message = isMe
      ? `${weapon.label}命中!${targetLabel} -${dmg}`
      : `被${weapon.label}擊中 -${dmg}——拉開距離再反擊!`;
    if (target.hp <= 0) this._handleKnockout(target, who);
    this.pushHud();
  }

  // KO 分流:玩家倒下=終局;單獸倒下=繼續戰,全獸倒下=得勝終局
  _handleKnockout(target, who) {
    target.koT = 0;
    if (target === this.my) {
      this.endT = 0;
      this.emitEvent("ko", { winner: "ai" });
      return;
    }
    const remaining = this.livingFoes().length;
    this.emitEvent("beast-down", { beast: target.type, label: target.stats.label, remaining });
    if (remaining === 0) {
      this.endT = 0;
      this.emitEvent("ko", { winner: "me" });
    } else {
      this.message = `${target.stats.label}被制伏了!還有 ${remaining} 隻野獸——不要鬆懈!`;
    }
  }

  finishMatch() {
    this.phase = "ended";
    const foesLeft = this.totalFoesHp();
    const foesMax = this.foes.reduce((s, f) => s + f.maxHp, 0) || 1;
    const win = this.livingFoes().length === 0 && this.my.hp > 0;
    const myRatio = this.my.hp / (this.my.maxHp || 1);
    const foeRatio = foesLeft / foesMax;
    const draw = Math.abs(myRatio - foeRatio) < 0.0001 && !win;
    const byRounds = this.mode.roundCap && this.roundNo >= this.mode.roundCap && this.my.hp > 0 && foesLeft > 0;
    const rWin = byRounds ? myRatio > foeRatio : win;
    this.overlay = {
      visible: true,
      eyebrow: rWin ? "得勝!" : draw ? "勢均力敵" : "溫柔的提醒",
      title: byRounds ? `戰滿三百回合 ${this.my.hp}:${foesLeft}` : rWin ? "耶和華救我脫離獅子和熊的爪!" : "再試一次",
      text: rWin
        ? "羊羔救回來了!🦁🐻\n撒母耳記上十七章三十七節:「耶和華救我脫離獅子和熊的爪,也必救我脫離這非利士人的手。」"
        : draw
          ? "勢均力敵!再與野獸周旋一次!"
          : "再試一次——能力不在乎自己,在乎耶和華。",
      canResume: false,
    };
    this.emitEvent("match-end", { win: rWin, draw, myHp: this.my.hp, aiHp: foesLeft, rounds: this.roundNo });
    this.message = `比武結束——大戰 ${this.roundNo} 回合。`;
    this.saveGame(true);
    this.pushHud();
  }

  togglePause() {
    if (this.phase === "menu" || this.phase === "ended") return;
    if (this.overlay.visible) {
      this.resume();
    } else {
      this.overlay = { visible: true, eyebrow: "暫停中", title: "喘口氣", text: "調整呼吸,準備好再上場。", canResume: true };
      this.pushHud();
    }
  }

  resume() {
    if (!this.overlay.canResume) return;
    this.overlay.visible = false;
    this.pushHud();
  }

  cycleCameraView() {
    this.cameraView = (this.cameraView + 1) % 5;
    const names = ["跟隨視角", "側身跟隨", "側面轉播", "高空俯瞰", "第一人稱"];
    this.message = `視角:${names[this.cameraView]}。`;
    this.pushHud();
  }

  /** 鏡頭拉近/拉遠。factor>1=拉遠(看得更廣),<1=拉近。滾輪/雙指/按鈕共用這一支 */
  adjustZoom(factor) {
    const prev = this.camZoom;
    this.camZoom = clamp(this.camZoom * factor, 0.6, 4.0); // 0817 使用者:「讓我能再拉遠一些」2.4→4.0
    if (this.camZoom === prev) return;
    const tag = this.camZoom >= 3.99 ? "(最遠)" : this.camZoom <= 0.61 ? "(最近)" : "";
    this.message = `鏡頭距離 ${Math.round(this.camZoom * 100)}%${tag}。`;
  }

  // ---------- 主迴圈 ----------
  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    const tick = () => {
      if (!this.running) return;
      const delta = Math.min(this.clock.getDelta(), 0.05);
      this.update(delta);
      this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height || 1.6;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  buildWeather() {
    const AUR = [
      { r: 70, y: 36, h: 22, a0: -Math.PI, a1: Math.PI, phase: 0, speed: 0.5 },
      { r: 88, y: 48, h: 28, a0: -Math.PI * 0.9, a1: Math.PI * 0.35, phase: 2.1, speed: 0.38 },
      { r: 58, y: 28, h: 17, a0: -Math.PI * 0.1, a1: Math.PI * 0.95, phase: 4.2, speed: 0.66 },
    ];
    const SEGS = 64;
    this.aurora = { group: new THREE.Group(), curtains: [] };
    for (const cfg of AUR) {
      const pos = new Float32Array((SEGS + 1) * 2 * 3);
      const col = new Float32Array((SEGS + 1) * 2 * 3);
      const idx = [];
      for (let i = 0; i <= SEGS; i += 1) {
        const a = cfg.a0 + (cfg.a1 - cfg.a0) * (i / SEGS);
        const x = Math.cos(a) * cfg.r;
        const z = Math.sin(a) * cfg.r;
        pos[(i * 2) * 3] = x; pos[(i * 2) * 3 + 1] = cfg.y; pos[(i * 2) * 3 + 2] = z;
        col[(i * 2) * 3] = 0.15; col[(i * 2) * 3 + 1] = 0.85; col[(i * 2) * 3 + 2] = 0.45;
        pos[(i * 2 + 1) * 3] = x; pos[(i * 2 + 1) * 3 + 1] = cfg.y + cfg.h; pos[(i * 2 + 1) * 3 + 2] = z;
        col[(i * 2 + 1) * 3] = 0.09; col[(i * 2 + 1) * 3 + 1] = 0.02; col[(i * 2 + 1) * 3 + 2] = 0.16;
        if (i < SEGS) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      this.aurora.group.add(mesh);
      this.aurora.curtains.push({ mesh, base: pos.slice(), phase: cfg.phase, speed: cfg.speed });
    }
    this.aurora.group.visible = false;
    this.scene.add(this.aurora.group);
    const N = 420;
    const spos = new Float32Array(N * 3);
    for (let i = 0; i < N; i += 1) {
      spos[i * 3] = (Math.random() - 0.5) * 60;
      spos[i * 3 + 1] = Math.random() * 20;
      spos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.BufferAttribute(spos, 3));
    this.snowFx = {
      pts: new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.7, depthWrite: false, fog: false })),
      speeds: Float32Array.from({ length: N }, () => 3 + Math.random() * 3),
    };
    this.scene.add(this.snowFx.pts);
    this.blizzardWarned = false;
  }

  /* 🎥 轉向要相對「鏡頭」,不是相對「角色自己」(0826 使用者實測回報)
     ─────────────────────────────────────────────────────────────────────────
     原話:「側面轉播,我方向鍵按右轉,結果往左轉(逆時鐘);按左轉,結果往右轉。」
     ★ 根因(可以算出來,不必猜):`heading += turn` 而 heading 增加 = 往**角色自己的左邊**轉。
       跟隨視角下鏡頭的右邊剛好就是角色的右邊 ⇒ 一致、沒問題(所以這個 bug 只在某些視角出現)。
       但**側面轉播的漫遊機位固定在世界 +x 側**(轉播車機位,`mid + (9,3.4,0)`):
       當牧人朝東走 = 朝著鏡頭走過來,他的右手邊在畫面上就是左邊 ⇒ 左右整個反過來。
     ⇒ 修法:比較「角色的右向量」與「鏡頭的右向量」,反向就把轉向符號翻過來
       ⇒ **按右永遠是往畫面的右邊轉**,五種視角都一樣。

     ⚠ 奇異點要 hysteresis(這是這個修法唯一會咬人的地方):
       當角色**正對或背對鏡頭**時,兩個右向量垂直(點積≈0),此時「左右轉」在畫面上
       其實是「朝鏡頭轉/離開鏡頭轉」,任何符號都不算錯 —— 但符號會在穿越 0 的瞬間翻面,
       變成「轉到某個角度突然反向」,那**比一致的反向更難操作**。
       ⇒ |點積| < 0.3 就沿用上一次的符號,不在奇異點附近翻來翻去。
     ★ 側身跟隨視角的點積恆為 +0.08(從正側面看,左右轉本來就是朝/離鏡頭)⇒ 一律走 hysteresis,
       行為與修改前完全相同;跟隨視角點積=+1 ⇒ 也不變。**只有側面轉播真的被修到。** */
  _turnSign() {
    const camFwd = this.camLook.clone().sub(this.camPos);
    camFwd.y = 0;
    if (camFwd.lengthSq() < 1e-6) return this._lastTurnSign || 1;
    camFwd.normalize();
    const UP = new THREE.Vector3(0, 1, 0);
    const camRight = new THREE.Vector3().crossVectors(camFwd, UP);
    const h = this.my ? this.my.heading : 0;
    const charRight = new THREE.Vector3().crossVectors(new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), UP);
    const d = charRight.dot(camRight);
    if (Math.abs(d) < 0.3) return this._lastTurnSign || 1;    // 奇異點:沿用,不要抖
    this._lastTurnSign = d > 0 ? 1 : -1;
    return this._lastTurnSign;
  }

  // 天氣系統保留但預設晴日:一天=50 秒,以正午(12 時暖光)為起點慢慢流動
  dayHours() {
    return (12 + this.time * (24 / 50)) % 24;
  }

  /* 🌅 真實地圖模式的時段氛圍(0826;走**真實世界時間**)。
     欄位:sky 天空/霧 · key 方向光(接近白,不染白羊)· hemi/hemiGnd 半球光 · rim 邊光
           · gnd 地面圖磚的逐通道乘數 · int 方向光強度 · az/el 太陽方位角與仰角
     ★ 夜晚 sky 用中夜藍(0x4a6a9c)而不是近黑的 0x0a2050:
       近黑的天空配上「不吃光的雪亮地面」就是原本那個「黑天白地」——
       天空稍暗、地面微冷,兩邊都看得清,才是走在路上能用的夜景。
     ★ gnd 夜晚 0.93 是**刻意的下限**(只降 7%):再暗下去路名就開始難讀。 */
  realTod(hour) {
    const H = hour != null ? hour : (this._todFake != null ? this._todFake : new Date().getHours());
    /* ⚠⚠ **三盞燈都會照到角色,所以三盞都要接近白** —— 這一條踩了兩次才寫對:
       第一版只把「太陽(key)」收白,結果黃昏的**牧羊犬從黑白變成橘褐色**(截圖抓到)——
       因為半球光 hemi 那時是 0xffd4b0(通道差 79,**比太陽還飽和**),而它照到每一個角色。
       我的閘門當時只檢查 key ⇒ 全綠 ⇒ **判準只認得自己想到的那一盞,就等於沒在守**
       (同一天在尋羊記的提示條也犯過一次:只比對記得的那幾個元素)。
     ⇒ 鐵則:key / hemi / rim **三盞的通道差都 ≤ 0x30**;
       氛圍一律交給 ①天空 background ②霧 ③地面圖磚染色 —— 那三層都不碰角色。
       hemiGnd(地面反射色)不在此限:它本來就是在模擬地面的顏色反射上來。 */
    const T = [
      { k: "dawn", a: 5, b: 8, sky: 0xf3d3ab, key: 0xfff0dc, hemi: 0xffeedd, hemiGnd: 0x7a8a4a, rim: 0xffe9d5,
        gnd: [1.04, 1.00, 0.94], int: 1.70, az: 1.25, el: 0.35 },
      { k: "day", a: 8, b: 16, sky: 0x8fc4e8, key: 0xffffff, hemi: 0xfff6de, hemiGnd: 0x6a7a3a, rim: 0xd8ecff,
        gnd: [1.00, 1.00, 1.00], int: 2.10, az: 0.60, el: 0.95 },
      { k: "dusk", a: 16, b: 19, sky: 0xeda878, key: 0xffecdc, hemi: 0xffe8d8, hemiGnd: 0x7a6a44, rim: 0xffe4d0,
        gnd: [1.05, 0.99, 0.92], int: 1.75, az: -1.25, el: 0.32 },
      { k: "night", a: 19, b: 5, sky: 0x4a6a9c, key: 0xeaf1ff, hemi: 0xdfe9ff, hemiGnd: 0x4a5a6a, rim: 0xdfeaff,
        gnd: [0.93, 0.96, 1.05], int: 1.50, az: -0.40, el: 0.80 },
    ];
    for (const t of T) {
      if (t.a < t.b ? (H >= t.a && H < t.b) : (H >= t.a || H < t.b)) return t;
    }
    return T[1];
  }

  updateWeather(delta) {
    const KEYS = [
      [0, 0x0a2050, 0.35], [5, 0x0a2050, 0.35], [6.5, 0xf0955f, 1.1],
      [9, 0x8fc4e8, 2.1], [16, 0x8fc4e8, 2.1], [18.5, 0xf0854f, 1.0],
      [20, 0x0a2050, 0.35], [24, 0x0a2050, 0.35],
    ];
    /* 🗺 真實地圖模式**過去**鎖在正午,原因是真的:圖磚是不受光的貼圖(MeshBasicMaterial),
       只調燈光的話天空會變黑而地面照樣雪亮 ⇒ 走一走變成「黑天配白地」像壞掉。
       ⚠ 順帶治一個沉默的洞:fog 的 near/far 每幀都在這裡被覆寫,
       enableRealMap 裡設的遠景霧其實**從來沒生效過**(設了沒用=典型的寫了被蓋掉)。

       🌅 **0826 起改成有時段氛圍**(使用者:「尋羊記的真實地圖…可以學習參考」→ 拍板「先搬時段氛圍」)。
       解掉「黑天白地」的關鍵是**天和地一起調**:燈光/天空/霧走這裡,
       地面圖磚走 realmap.js 的 uTod uniform(見那支檔頭)。
       ★★ 三條與尋羊記羊11 同一份鐵則(那邊今天實測踩過):
         ① **方向光一律接近白** —— 光的顏色會直接乘在材質上,而羊是純白的;
            光一飽和整群羊就變成那個顏色(尋羊記第一版黃昏把白羊染成褐色)。
            氛圍交給天空/霧/地面,不是交給打在羊身上的那盞光。
         ② **夜晚只換色、不壓暗** —— 這是走在路上看的地圖,地面暗到看不清路名
            就是安全問題不是美感問題(地面亮度最多降 7%;天空可以深但不能近黑)。
         ③ 走**真實世界時間**(不是牧場那個 50 秒一天的加速循環)——
            傍晚玩就是傍晚的光,那才是「跟現實同一個世界」的意義。
       ★ 牧場模式維持原本的加速日夜循環(KEYS),那是既有的刻意設計,這裡不動它。 */
    const rm = !!this.realMap;
    /* ⚠ `h` 是**既有系統**的遊戲時鐘(KEYS 的天空 lerp、極光的夜晚判斷都吃它),
       realmap 模式維持原本的 12 —— **不可以**讓它跟著真實時間跑:
       極光是曠野牧場的夜景裝飾,h 一走真實時間,台北街道上晚上就會冒出極光。
       時段氛圍(realTod)自己讀 new Date(),與這個時鐘刻意分開。
       ★ 第一版我把 h 移進 else 分支 ⇒ 極光那段 `ReferenceError: h is not defined`
         (閘門的「零 console error」當場抓到)。 */
    const h = rm ? 12 : this.dayHours();
    let ca, keyInt;
    if (rm && this.todOn !== false) {
      const T = this.realTod();
      ca = new THREE.Color(T.sky);
      keyInt = T.int;
      if (this.keyLight) {
        this.keyLight.color.setHex(T.key);                       // ① 接近白,不染白羊
        /* 影子方向跟著太陽走(清晨從東、黃昏從西)。光源要離場景夠遠,
           不然不同羊被打到的角度差很多,看起來像每隻羊各有一顆太陽。 */
        this.keyLight.position.set(Math.sin(T.az) * 46, 24 + T.el * 34, Math.cos(T.az) * 46);
      }
      if (this.hemiLight) {
        this.hemiLight.color.setHex(T.hemi);
        this.hemiLight.groundColor.setHex(T.hemiGnd);
      }
      if (this.rimLight) this.rimLight.color.setHex(T.rim);
      if (this._setGroundTod) this._setGroundTod(T.gnd[0], T.gnd[1], T.gnd[2]);   // ② 地面一起調(治「黑天白地」)
    } else {
      let a = KEYS[0], b = KEYS[KEYS.length - 1];
      for (let i = 0; i < KEYS.length - 1; i += 1) {
        if (h >= KEYS[i][0] && h <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
      }
      const t = (h - a[0]) / (b[0] - a[0] || 1);
      ca = new THREE.Color(a[1]).lerp(new THREE.Color(b[1]), t);
      keyInt = a[2] + (b[2] - a[2]) * t;
      if (rm && this._setGroundTod) this._setGroundTod(1, 1, 1);  // 關掉時段=地面回到原本的顏色
    }
    this.scene.background = ca;
    if (this.keyLight) this.keyLight.intensity = keyInt;
    const gust = Math.max(0, Math.min(1, (Math.sin(this.time * 0.12) - 0.55) / 0.45));
    if (this.scene.fog) {
      this.scene.fog.color.copy(ca);
      /* 🗺 0812:真實地圖模式**只把霧的起點往後推**(near 140 → 260),far 維持 460。
         使用者回報「地上幾乎全白」的第三層原因就是 near:z18 一磚才 140 公尺,
         near=140 等於**走出腳下那一磚,街道就開始被霧洗白** ⇒ 看不清線與字。
         ⚠ far **不可以跟著推遠**:地圖只有 5×5 磚(對角≈495m),那圈霧是**刻意用來
           讓地圖邊界淡出**的;推遠會露出「地圖突然結束」的硬邊。
         ⚠ 曠野模式維持原值不動(那裡的霧另有收邊作用)。*/
      this.scene.fog.near = rm ? 260 - 60 * gust : 55 - 30 * gust;
      this.scene.fog.far = rm ? 470 - 110 * gust : 150 - 76 * gust;
    }
    if (this.snowFx) {
      const attr = this.snowFx.pts.geometry.getAttribute("position");
      const windX = (1.2 + 7 * gust) * delta;
      for (let i = 0; i < attr.count; i += 1) {
        attr.array[i * 3 + 1] -= this.snowFx.speeds[i] * (1 + gust * 1.6) * delta;
        attr.array[i * 3] += windX * (0.6 + (i % 5) * 0.2);
        if (attr.array[i * 3 + 1] < 0) attr.array[i * 3 + 1] = 20;
        if (attr.array[i * 3] > 30) attr.array[i * 3] = -30;
        if (attr.array[i * 3 + 2] > 30) attr.array[i * 3 + 2] = -30;
        if (attr.array[i * 3 + 2] < -30) attr.array[i * 3 + 2] = 30;
      }
      attr.needsUpdate = true;
      this.snowFx.pts.material.opacity = 0.15 * gust;
    }
    if (this.aurora) {
      let nf = 0;
      if (h >= 20.5 || h <= 4.5) nf = 1;
      else if (h > 19.5 && h < 20.5) nf = h - 19.5;
      else if (h > 4.5 && h < 5.5) nf = 5.5 - h;
      this.aurora.group.visible = nf > 0.02;
      if (this.aurora.group.visible) {
        for (const c of this.aurora.curtains) {
          c.mesh.material.opacity = nf * 0.65;
          const attr = c.mesh.geometry.getAttribute("position");
          for (let i = 0; i < attr.count / 2; i += 1) {
            const sway = Math.sin(i * 0.32 + this.time * c.speed + c.phase) * 4;
            const swayTop = Math.sin(i * 0.32 + this.time * c.speed * 1.35 + c.phase + 0.9) * 7;
            attr.array[(i * 2) * 3] = c.base[(i * 2) * 3] + sway;
            attr.array[(i * 2 + 1) * 3] = c.base[(i * 2 + 1) * 3] + swayTop;
          }
          attr.needsUpdate = true;
        }
      }
    }
  }

  // ---------- 蜂蜜補血(§1,可整段刪除,不傷核心) ----------
  spawnHoney() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xf0a820, emissive: 0x8a5a10, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.15 });
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.38, 6), mat);
    group.add(hex);
    const light = new THREE.PointLight(0xffcf5e, 1.1, 4);
    light.position.y = 0.3;
    group.add(light);
    const x = (Math.random() * 2 - 1) * (ARENA_HALF - 3);
    const z = (Math.random() * 2 - 1) * (ARENA_HALF - 3);
    group.position.set(x, 0.55, z);
    this.scene.add(group);
    this.honey = { group, t: 0, baseY: 0.55, mat, light };
  }

  updateHoney(delta) {
    if (!this.honey) {
      this.honeyTimer -= delta;
      if (this.honeyTimer <= 0) {
        this.spawnHoney();
        this.honeyTimer = this._nextHoneyTimer();
      }
      return;
    }
    const h = this.honey;
    h.t += delta;
    h.group.rotation.y += delta * 1.8;
    h.group.position.y = h.baseY + Math.sin(h.t * 2.2) * 0.08;
    if (h.t > HONEY_LIFE - 1) {
      const fade = clamp(HONEY_LIFE - h.t, 0, 1);
      h.mat.transparent = true;
      h.mat.opacity = fade;
      h.light.intensity = 1.1 * fade;
    }
    if (h.t >= HONEY_LIFE) {
      this.scene.remove(h.group);
      this.honey = null;
      return;
    }
    const d = Math.hypot(this.my.pos.x - h.group.position.x, this.my.pos.z - h.group.position.z);
    if (d < HONEY_EAT_DIST) {
      this.my.hp = Math.min(this.my.maxHp, this.my.hp + this.my.maxHp * HONEY_HEAL_PCT);
      this.scene.remove(h.group);
      this.honey = null;
      this.message = "野地的蜂蜜!";
      this.emitEvent("honey", {});
      this.pushHud();
    }
  }

  // ---------- 野獸攻擊:爪擊(輕,無預告)/撲擊(重,帶紅色預告)——量值取自該獸 stats ----------
  beastClaw(fighter, target) {
    if (this.phase !== "battle" || this.endT >= 0 || fighter.koT >= 0) return;
    if (fighter.lightCd > 0 || fighter.stunT < this._stunDur()) return;
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const claw = fighter.stats.claw;
    const packScale = PACK_DMG_SCALE[this.foes.length] ?? 0.6;
    fighter.lightCd = claw.cd * preset.aiCd;
    fighter.strikeT = 0;
    this.roundNo += 1;
    const dist = fighter.pos.distanceTo(target.pos);
    const toTarget = Math.atan2(target.pos.x - fighter.pos.x, target.pos.z - fighter.pos.z);
    const facing = Math.abs(wrapAngle(toTarget - fighter.heading)) <= claw.arc;
    let lands = dist <= claw.reach + BODY_REACH && facing;
    if (lands && Math.random() > clamp(preset.aiSkill + 0.18, 0, 0.95)) lands = false;
    if (lands) {
      this._pendingStrikes.push({
        target, dmg: Math.max(1, Math.round(claw.dmg * preset.aiDmg * packScale)),
        opts: { who: "ai", weapon: { label: claw.label, short: claw.shortLabel }, stun: 0, attacker: fighter, kind: "melee", knockback: claw.knockback },
        t: 0.16,
      });
    } else {
      this.emitEvent("miss", { who: "ai" });
    }
  }

  _startBeastPounce(fighter, target) {
    const pounce = fighter.stats.pounce;
    fighter.pounce = {
      phase: "telegraph",
      t: 0,
      dur: pounce.telegraphMin + Math.random() * (pounce.telegraphMax - pounce.telegraphMin),
    };
    fighter.heading = Math.atan2(target.pos.x - fighter.pos.x, target.pos.z - fighter.pos.z);
    fighter.speed = 0;
    if (fighter.person.telegraph) fighter.person.telegraph.visible = true;
    this.message = `${fighter.stats.label}要撲了——快閃開!`;
    this.emitEvent("beast-telegraph", { beast: fighter.type, label: fighter.stats.label });
    this.pushHud();
  }

  _resolveBeastPounce(fighter, target) {
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const pounce = fighter.stats.pounce;
    const packScale = PACK_DMG_SCALE[this.foes.length] ?? 0.6;
    const dist = fighter.pos.distanceTo(target.pos);
    const toTarget = Math.atan2(target.pos.x - fighter.pos.x, target.pos.z - fighter.pos.z);
    const facing = Math.abs(wrapAngle(toTarget - fighter.heading)) <= pounce.arc;
    const lands = dist <= pounce.reach + BODY_REACH && facing && target.koT < 0;
    fighter.pounce = { phase: "commit", t: 0, dur: pounce.commitDur };
    if (fighter.person.telegraph) fighter.person.telegraph.visible = false;
    fighter.cd = pounce.cd * preset.aiCd;
    if (lands) {
      this._pendingStrikes.push({
        target, dmg: Math.max(1, Math.round(pounce.dmg * preset.aiDmg * packScale)),
        opts: { who: "ai", weapon: { label: pounce.label, short: pounce.shortLabel }, stun: 0, attacker: fighter, kind: "melee", knockback: pounce.knockback },
        t: 0.08,
      });
    } else {
      this.emitEvent("miss", { who: "ai" });
      this.message = `${fighter.stats.label}撲空了——趁機反擊!`;
      this.pushHud();
    }
  }

  update(delta) {
    this.time += delta;
    const paused = this.overlay.visible;
    this.updateWeather(delta);

    this._slowMo = !paused && this.hitCamT < 0.4 ? 0.42 : 1;
    const sdt = delta * this._slowMo;

    if (!paused && this.phase === "battle") {
      this.updatePlayerMovement(sdt);
      if (this.roam) {
        this.updateRoam(sdt);
      } else {
        for (const f of this.foes) this.updateBeastAi(f, sdt);
        this.updateProjectiles(sdt);
        this.updateHoney(sdt);
        this.updateSquadGifts(sdt);
      }
      this.updateFlock(sdt);
      this.updateDogs(sdt);   // 🐕 牧羊犬:頭尾各一隻繞著羊群巡邏(0818)
      this.resolveBodyPush();
      this.syncFighterTransforms();

      if (this.mode.roundCap && this.roundNo >= this.mode.roundCap && this.endT < 0 && this.my.hp > 0 && this.livingFoes().length > 0) {
        this.endT = 0.01;
      }
      if (this.endT >= 0) {
        this.endT += delta;
        if (this.endT >= 1.6) this.finishMatch();
      }
    }

    this.hitFlashT += sdt;
    if (this.hitFlashT < 0.5) {
      this.hitFlash.material.opacity = 0.9 * (1 - this.hitFlashT / 0.5);
      this.hitFlash.scale.setScalar(1 + this.hitFlashT * 2.2);
      this.hitFlash.lookAt(this.camera.position);
    } else {
      this.hitFlash.material.opacity = 0;
    }
    this.hitCamT += delta;
    for (const f of [this.my, ...this.foes]) {
      f.hitT += sdt;
      f.stunT += sdt;
      f.strikeT += sdt;
      f.cd = Math.max(0, f.cd - sdt);
      f.lightCd = Math.max(0, (f.lightCd || 0) - sdt);
      if (f.koT >= 0) f.koT += delta;
      if (f.chargeT >= 0 && this.phase === "battle" && !paused) {
        f.chargeT = Math.min(CHARGE_FULL, f.chargeT + sdt);
      }
    }

    this.handleKeys();
    this.updatePoses();
    this.updateCamera(delta);
    // 🏙 擋在鏡頭與牧人之間的建築淡出(0818「看不到路與牧人」)
    if (this.buildings?.updateFade) this.buildings.updateFade(this.camPos, this.my.pos);

    this.autoSaveTimer += delta;
    if (this.autoSaveTimer > 5) {
      this.autoSaveTimer = 0;
      this.saveGame(true);
    }

    this.input.endFrame();
    this.pushHud();
  }

  updatePlayerMovement(dt) {
    const f = this.my;
    if (f.koT >= 0) {
      f.speed += (0 - f.speed) * Math.min(1, dt * 3);
      this.movePos(f, dt);
      return;
    }
    /* 🚶 實走模式接管(牧10):GPS 目標在,鍵盤/搖桿的**移動**整段跳過 ——
       混用會被下一筆定位橡皮筋拉回(你用鍵盤走出去 20 公尺,GPS 說你還在原地)。
       視角鍵不在這裡,照常可用。抖動的緩衝全在 realwalk.js(死區/速度上限/傳送規則),
       這裡只負責:朝向平滑轉過去 + 走 movePos(dt=0)讓邊界夾限與建築碰撞照跑。 */
    if (this.realWalk && this.realMap) {
      const t = this.realWalk.step(f.pos.x, f.pos.z, dt);
      if (t) {
        if (t.moving && t.heading !== null) {
          const diff = wrapAngle(t.heading - f.heading);
          f.heading += clamp(diff, -3.2 * dt, 3.2 * dt);
        }
        f.speed = t.moving ? Math.min(t.speed, 4.8) : 0;
        f.pos.x = t.x;
        f.pos.z = t.z;
        this.movePos(f, 0);        // dt=0 ⇒ 不再積分,只跑邊界夾限+建築碰撞
        f.walkT += dt * (Math.abs(f.speed) / 2.4);
      } else {
        f.speed += (0 - f.speed) * Math.min(1, dt * 6);
      }
      return;
    }

    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const stunned = f.stunT < this._stunDur();
    const wantBlock = this.input.isDown("action") && !stunned && f.chargeT < 0;
    if (wantBlock && !f.blocking) f.blockT = 0;
    else if (f.blocking && wantBlock) f.blockT += dt;
    f.blocking = wantBlock;
    if (!f.blocking) f.blockT = 9;
    let target = 0;
    if (!stunned) {
      if (this.input.isDown("up")) target = preset.maxFwd + (this.input.isDown("sprint") ? preset.boost : 0);
      else if (this.input.isDown("down")) target = f.speed > 0.4 ? 0 : -MAX_BACK;
      if (f.chargeT >= 0) target *= 0.5;
      if (f.blocking) target *= 0.35;
      const turn = (this.input.isDown("left") ? 1 : 0) - (this.input.isDown("right") ? 1 : 0);
      f.heading += turn * this._turnSign() * preset.turnRate * dt;
      const nearest = this.nearestFoe();
      if (turn === 0 && !this.input.isDown("sprint") && !this.input.isDown("up") && nearest) {
        const dxF = nearest.pos.x - f.pos.x;
        const dzF = nearest.pos.z - f.pos.z;
        const distF = Math.hypot(dxF, dzF);
        if (distF <= AUTO_FACE_RANGE) {
          const diff = wrapAngle(Math.atan2(dxF, dzF) - f.heading);
          const maxTurn = preset.turnRate * 1.15 * dt;
          f.heading += clamp(diff, -maxTurn, maxTurn);
        }
      }
    }
    const rate = target < f.speed ? 6.0 : 4.0;
    f.speed += (target - f.speed) * Math.min(1, dt * rate);
    this.movePos(f, dt);
    f.walkT += dt * (Math.abs(f.speed) / 2.4);
  }

  movePos(f, dt) {
    f.pos.x += Math.sin(f.heading) * f.speed * dt;
    f.pos.z += Math.cos(f.heading) * f.speed * dt;
    // ⚠ clamp 例外(side-1d-engine-kit 的經典炸點):真實地圖模式活動範圍要放大到幾百公尺,
    // 沿用 ±15 的話,地圖鋪好了人卻在原地撞牆——地圖是真的、腳步卻被關在羊圈裡。
    const b = this.bound || ARENA_HALF;
    const nx = clamp(f.pos.x, -b, b);
    const nz = clamp(f.pos.z, -b, b);
    if (nx !== f.pos.x || nz !== f.pos.z) f.speed *= 0.5;
    f.pos.x = nx;
    f.pos.z = nz;
    // 🏙 建築碰撞(0818「牧人與羊會穿進房子裡」):牧人與野獸都走這裡;
    // collide 直接回推到牆外的點 ⇒ 天然貼牆滑行,不會卡死
    if (this.buildings?.collide) {
      const c = this.buildings.collide(f.pos.x, f.pos.z, 0.55);
      if (c) { f.pos.x = c.x; f.pos.z = c.z; }
    }
  }

  // 身體推擠:玩家與每隻活獸、活獸彼此之間,兩兩互推(倒地的獸不再推擠)
  resolveBodyPush() {
    const all = [this.my, ...this.livingFoes()];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i];
        const b = all[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 0.9) {
          const push = (0.9 - d) / 2;
          const ux = dx / d;
          const uz = dz / d;
          a.pos.x -= ux * push;
          a.pos.z -= uz * push;
          b.pos.x += ux * push;
          b.pos.z += uz * push;
        }
      }
    }
  }

  // ---------- 野獸 AI(三腦:走位+爪擊/撲擊決策+喘息)——每隻獨立,群獸撲擊節奏錯開 ----------
  updateBeastAi(f, dt) {
    if (f.koT >= 0) {
      f.speed += (0 - f.speed) * Math.min(1, dt * 3);
      this.movePos(f, dt);
      return;
    }
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const stats = f.stats;
    const brain = f.brain;
    const stunned = f.stunT < this._stunDur();
    const dx = this.my.pos.x - f.pos.x;
    const dz = this.my.pos.z - f.pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);

    if (f.pounce) {
      f.pounce.t += dt;
      if (f.pounce.phase === "telegraph" && f.pounce.t >= f.pounce.dur) {
        this._resolveBeastPounce(f, this.my);
      } else if (f.pounce.phase === "commit" && f.pounce.t >= f.pounce.dur) {
        f.pounce = null;
      }
      f.speed += (0 - f.speed) * Math.min(1, dt * 4);
      this.movePos(f, dt);
      return;
    }

    let desiredHeading = toPlayer;
    let desiredSpeed = preset.maxFwd * preset.aiSpd * stats.speedMul * (dist > 5 ? 1 : dist > 2.2 ? 0.6 : 0.3);
    if (brain.retreatT > 0) {
      brain.retreatT -= dt;
      desiredHeading = toPlayer + Math.PI + brain.orbitDir * 0.5;
      desiredSpeed = preset.maxFwd * preset.aiSpd * stats.speedMul * 0.8;
    }
    if (Math.abs(f.pos.x) > ARENA_HALF - 2 || Math.abs(f.pos.z) > ARENA_HALF - 2) {
      desiredHeading = Math.atan2(-f.pos.x, -f.pos.z);
    }
    if (stunned) desiredSpeed = 0;

    if (preset.aiSkill < 0.6) {
      brain.breatherT = (brain.breatherT ?? 4) - dt;
      if (brain.breatherT <= 0) {
        brain.restT = 1.4;
        brain.breatherT = 4 + Math.random() * 4;
      }
      if (brain.restT > 0) {
        brain.restT -= dt;
        desiredSpeed *= 0.15;
      }
    }

    const angDiff = wrapAngle(desiredHeading - f.heading);
    const maxTurn = preset.turnRate * preset.aiSpd * stats.speedMul * dt;
    f.heading += clamp(angDiff, -maxTurn, maxTurn);
    f.speed += (desiredSpeed * clamp(1 - Math.abs(angDiff) / Math.PI, 0.25, 1) - f.speed) * Math.min(1, dt * 3.0);
    this.movePos(f, dt);
    f.walkT += dt * (Math.abs(f.speed) / 2.2);

    if (this.mode.passive || stunned) return;
    const facingOk = Math.abs(wrapAngle(toPlayer - f.heading)) <= stats.claw.arc + 0.25;
    brain.pounceT = Math.max(0, (brain.pounceT ?? 3) - dt);
    if (f.cd <= 0 && brain.pounceT <= 0 && dist >= 1.4 && dist <= stats.pounce.reach + BODY_REACH + 2.5) {
      // 群獸禮讓:同一時刻只允許一隻獸亮預告(孩子看得懂該閃誰)
      const someoneTelegraphing = this.foes.some((o) => o !== f && o.pounce && o.pounce.phase === "telegraph");
      if (!someoneTelegraphing) {
        brain.pounceT = 6.5 + Math.random() * 5;
        this._startBeastPounce(f, this.my);
        return;
      }
      brain.pounceT = 1 + Math.random() * 1.5; // 稍後再試
    }
    if (f.lightCd <= 0 && dist <= stats.claw.reach + BODY_REACH && facingOk) {
      this.beastClaw(f, this.my);
      if (Math.random() < 0.35) {
        brain.retreatT = 0.8 + Math.random();
        brain.orbitDir = Math.random() < 0.5 ? -1 : 1;
      }
    }
  }

  updateProjectiles(dt) {
    if (this._pendingStrikes && this._pendingStrikes.length) {
      for (const s of this._pendingStrikes) s.t -= dt;
      const landed = this._pendingStrikes.filter((s) => s.t <= 0);
      this._pendingStrikes = this._pendingStrikes.filter((s) => s.t > 0);
      for (const s of landed) this.applyHit(s.target, s.dmg, s.opts);
    }
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.isWave) {
        p.mesh.position.addScaledVector(p.vel, dt);
        const s = 1.15 + p.t * 0.8 + Math.sin(p.t * 18) * 0.06;
        p.mesh.scale.setScalar(s);
        for (const c of p.mesh.children) if (c.rotation) c.rotation.z += dt * 5.5;
        p.mesh.children[1].material.opacity = 0.6 * (1 - (p.t / p.life) * 0.7);
      }
      // 金光穿透:掃過每隻活獸,同一獸只結算一次(不因命中而消失,可連中多獸)
      if (p.who === "me") {
        for (const foe of this.livingFoes()) {
          if (p.hitSet && p.hitSet.has(foe)) continue;
          const chest = foe.pos.clone().setY(p.isWave ? 1.4 : 1.35);
          if (p.mesh.position.distanceTo(chest) < (p.hitR || 1.0)) {
            if (p.hitSet) p.hitSet.add(foe);
            this.applyHit(foe, p.dmg, {
              who: p.who, weapon: p.weapon, stun: p.stun,
              from: p.mesh.position, kind: p.isWave ? "wave" : "proj",
            });
          }
        }
      }
      if (p.isWave ? p.t > p.life : p.t > 3.5) p.remove = true;
    }
    for (const p of this.projectiles.filter((x) => x.remove)) this.scene.remove(p.mesh);
    this.projectiles = this.projectiles.filter((x) => !x.remove);
  }

  handleKeys() {
    if (this.input.consumePress("camera")) this.cycleCameraView();
    if (this.input.consumePress("zoomOut")) this.adjustZoom(1.25);
    if (this.input.consumePress("zoomIn")) this.adjustZoom(1 / 1.25);
    if (this.input.consumePress("pause")) this.togglePause();
    if (this.input.consumeRelease("heavyAttack")) this._heavyRelease();
    if (this.overlay.visible) return;
    if (this.input.consumePress("heavyAttack")) this._heavyPress();
    if (this.input.consumePress("lightAttack")) this.lightPunch();
  }

  // ---------- 姿勢動畫:大衛(人形)+野獸群(四足)分開更新 ----------
  updatePoses() {
    this.updateDavidPose(this.my);
    for (const f of this.foes) this.updateBeastPose(f);
  }

  updateDavidPose(f) {
    const person = f.person;
    const nearest = this.nearestFoe();
    const dist = nearest ? f.pos.distanceTo(nearest.pos) : 99;
    const engaged = this.phase === "battle" && dist < 9;

    const amp = clamp(Math.abs(f.speed) / 6, 0, 0.62);
    const t = f.walkT * Math.PI * 2;
    if (f.koT < 0) {
      person.leftLeg.pivot.rotation.x = -0.05 + Math.sin(t) * amp;
      person.rightLeg.pivot.rotation.x = -0.05 + Math.sin(t + Math.PI) * amp;
      person.leftLeg.joint.rotation.x = 0.1 + Math.max(0, Math.sin(t + 0.8)) * amp * 1.1;
      person.rightLeg.joint.rotation.x = 0.1 + Math.max(0, Math.sin(t + Math.PI + 0.8)) * amp * 1.1;
      person.group.position.y = Math.abs(Math.sin(t)) * amp * 0.08;
      if (engaged && Math.abs(f.speed) < 1.2) {
        person.leftLeg.pivot.rotation.x = -0.3;
        person.rightLeg.pivot.rotation.x = -0.22;
        person.leftLeg.joint.rotation.x = 0.45;
        person.rightLeg.joint.rotation.x = 0.4;
        person.group.position.y = -0.06;
      }
    }

    const st = f.strikeT;
    let armX = engaged ? -1.2 : -0.9;
    let armJ = engaged ? -0.3 : -0.5;
    let strikeLean = 0;
    const kind = f.strikeKind;
    if (kind === "light" && st < 0.28) {
      // 輕拳:快、短促的直拳
      if (st < 0.1) {
        const k = st / 0.1;
        armX = -1.2 - k * 0.9;
      } else if (st < 0.2) {
        const k = (st - 0.1) / 0.1;
        armX = -2.1 + k * 1.3;
        strikeLean = k * 0.2;
      } else {
        const k = (st - 0.2) / 0.08;
        armX = -0.8 - (1 - k) * 0.2;
        strikeLean = 0.2 * (1 - k);
      }
    } else if ((kind === "heavy" || kind === "holy") && st < 0.6) {
      // 重拳/聖靈金光:180°舉過頭直劈式重拳,動作大、看得見打到身上
      if (st < 0.14) {
        const k = st / 0.14;
        armX = -1.2 - k * 1.85;
      } else if (st < 0.34) {
        const k = (st - 0.14) / 0.2;
        armX = -3.05 + k * 2.7;
        armJ = -0.1 - k * 0.2;
        strikeLean = k * (kind === "holy" ? 0.5 : 0.35);
      } else {
        const k = (st - 0.34) / 0.26;
        armX = -0.35 - k * 0.85;
        armJ = -0.3 + k * 0.15;
        strikeLean = (kind === "holy" ? 0.5 : 0.35) * (1 - k);
      }
    }
    // 蓄力(聖靈金光蓄勢):雙臂高舉發抖+腳下金圈亮起
    if (f.chargeT >= 0) {
      const c01 = clamp(f.chargeT / CHARGE_FULL, 0, 1);
      armX = -2.3 + Math.sin(this.time * 26) * 0.07 * (0.5 + c01);
      armJ = -0.1;
      f.chargeRing.material.opacity = 0.25 + c01 * 0.6;
      f.chargeRing.scale.setScalar(0.8 + c01 * 1.0);
    } else {
      f.chargeRing.material.opacity = 0;
    }
    person.rightArm.pivot.rotation.order = "YXZ";
    person.rightArm.pivot.rotation.x = armX;
    person.rightArm.pivot.rotation.y = 0;
    person.rightArm.joint.rotation.x = armJ;
    person.rig.rotation.y = 0;

    // 左臂:平時護胸;格擋=雙臂舉至身前(赤手防禦,無盾牌)
    if (f.blocking) {
      person.leftArm.pivot.rotation.x = -1.55;
      person.leftArm.pivot.rotation.z = -0.25;
      person.leftArm.joint.rotation.x = -0.35;
      person.rightArm.pivot.rotation.x = -1.4;
      person.rightArm.pivot.rotation.z = 0.25;
      person.rightArm.joint.rotation.x = -0.3;
    } else {
      person.leftArm.pivot.rotation.x = engaged ? -1.0 : -0.8;
      person.leftArm.pivot.rotation.z = 0.35;
      person.leftArm.joint.rotation.x = -0.18;
    }

    const stunned = f.stunT < this._stunDur();
    if (f.koT >= 0) {
      const k = clamp(f.koT / 1.2, 0, 1);
      person.group.position.y = -k * 0.5;
      person.rig.rotation.x = k * 0.5;
      person.leftLeg.pivot.rotation.x = -k * 1.3;
      person.leftLeg.joint.rotation.x = k * 1.5;
      person.rightLeg.pivot.rotation.x = k * 0.2;
      person.rightLeg.joint.rotation.x = k * 1.2;
    } else if (stunned) {
      person.rig.rotation.z = Math.sin(this.time * 10) * 0.12;
      person.rig.rotation.x = 0.1;
    } else {
      person.rig.rotation.z = 0;
      person.rig.rotation.x = f.hitT < 0.8
        ? -0.8 * (1 - f.hitT / 0.8)
        : Math.max(strikeLean, engaged ? 0.08 : 0);
    }
  }

  updateBeastPose(f) {
    const person = f.person;
    const amp = clamp(Math.abs(f.speed) / 5, 0, 0.5);
    const t = f.walkT * Math.PI * 2;
    if (f.koT < 0 && !(f.pounce && f.pounce.phase === "commit")) {
      person.legs.fl.pivot.rotation.x = Math.sin(t) * amp;
      person.legs.br.pivot.rotation.x = Math.sin(t) * amp;
      person.legs.fr.pivot.rotation.x = Math.sin(t + Math.PI) * amp;
      person.legs.bl.pivot.rotation.x = Math.sin(t + Math.PI) * amp;
      person.legs.fl.joint.rotation.x = Math.max(0, Math.sin(t + 0.6)) * amp * 1.3;
      person.legs.br.joint.rotation.x = Math.max(0, Math.sin(t + 0.6)) * amp * 1.3;
      person.legs.fr.joint.rotation.x = Math.max(0, Math.sin(t + Math.PI + 0.6)) * amp * 1.3;
      person.legs.bl.joint.rotation.x = Math.max(0, Math.sin(t + Math.PI + 0.6)) * amp * 1.3;
      person.group.position.y = Math.abs(Math.sin(t)) * amp * 0.05;
    }
    // 尾巴搖擺
    person.tailPivot.rotation.y = Math.sin(this.time * 3) * 0.25;

    // 爪擊(輕攻擊):前腿快速一揮,不預告
    if (f.strikeT < 0.22 && !f.pounce) {
      const k = Math.sin(clamp(f.strikeT / 0.22, 0, 1) * Math.PI);
      person.legs.fl.pivot.rotation.x = -0.7 * k;
    }

    // 撲擊紅色預告扇形(判定=畫面:範圍=實際命中範圍)
    if (person.telegraph) {
      if (f.pounce && f.pounce.phase === "telegraph") {
        person.telegraph.visible = true;
        const k = clamp(f.pounce.t / f.pounce.dur, 0, 1);
        person.telegraph.material.opacity = 0.5 * (0.55 + 0.45 * Math.sin(this.time * 14)) * (0.35 + 0.65 * k);
      } else {
        person.telegraph.visible = false;
      }
    }

    // 撲擊瞬間:前身抬起撲落
    let rigX = 0;
    if (f.pounce && f.pounce.phase === "commit") {
      const k = clamp(f.pounce.t / f.pounce.dur, 0, 1);
      const rise = Math.sin(k * Math.PI);
      rigX = -rise * 0.4;
      person.legs.fl.pivot.rotation.x = -rise * 0.95;
      person.legs.fr.pivot.rotation.x = -rise * 0.95;
    }

    const stunned = f.stunT < this._stunDur();
    if (f.koT >= 0) {
      // 敗=側躺被制伏(不流血)
      const k = clamp(f.koT / 1.2, 0, 1);
      person.rig.rotation.z = k * (Math.PI / 2 - 0.05);
      person.group.position.y = -k * 0.35;
      person.rig.rotation.x = k * 0.1;
    } else if (stunned) {
      person.rig.rotation.z = Math.sin(this.time * 10) * 0.1;
      person.rig.rotation.x = rigX;
    } else {
      person.rig.rotation.z = 0;
      // 被打=後仰退開(街霸式,誰都黏不住誰:hitT 剛被打時身體後傾)
      person.rig.rotation.x = f.hitT < 0.5 ? -0.3 * (1 - f.hitT / 0.5) + rigX : rigX;
    }
  }

  updateCamera(delta) {
    let desiredPos;
    let desiredLook;
    const focusFoe = this.nearestFoe() || this.foes[0];
    /* ⚠ 漫遊沒有野獸(牠們是隱形的),用「玩家與野獸的中點」當焦點會讓側面/俯瞰鏡頭
       飄到看不見的獸那邊——畫面上人跑到角落、中間空一片。漫遊一律以牧人自己為焦點。 */
    const mid = this.roam
      ? this.my.pos.clone()
      : this.my.pos.clone().add(focusFoe.pos).multiplyScalar(0.5);
    if (this.phase === "menu") {
      const a = this.time * 0.08;
      desiredPos = new THREE.Vector3(Math.cos(a) * 22, 8, Math.sin(a) * 22);
      desiredLook = new THREE.Vector3(0, 1.1, 0);
    } else if (this.hitCamT < 0.55 && this.phase === "battle") {
      const dir = focusFoe.pos.clone().sub(this.my.pos).setY(0).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      desiredPos = mid.clone().addScaledVector(perp, 5).setY(1.9);
      desiredLook = mid.clone().setY(1.35);
    } else if (this.cameraView === 0) {
      const fwd = new THREE.Vector3(Math.sin(this.my.heading), 0, Math.cos(this.my.heading));
      desiredPos = this.my.pos.clone().addScaledVector(fwd, -5.2).setY(3.0);
      desiredLook = this.my.pos.clone().addScaledVector(fwd, 6).setY(1.3);
    } else if (this.cameraView === 1) {
      // 側身跟隨:鏡頭掛在牧人側面同步移動——看得到牧人的側身、手上的竿與腰間的杖,不只後腦
      const fwd = new THREE.Vector3(Math.sin(this.my.heading), 0, Math.cos(this.my.heading));
      const side = new THREE.Vector3(-Math.cos(this.my.heading), 0, Math.sin(this.my.heading));
      desiredPos = this.my.pos.clone().addScaledVector(side, 5.0).addScaledVector(fwd, 0.8).setY(2.1);
      desiredLook = this.my.pos.clone().addScaledVector(fwd, 1.2).setY(1.15);
    } else if (this.cameraView === 2) {
      // 側面轉播:戰鬥=場邊固定機位;漫遊=跟著牧人的側邊(固定機位會被走出畫面)
      desiredPos = this.roam
        ? mid.clone().add(new THREE.Vector3(9, 3.4, 0))
        : new THREE.Vector3(ARENA_HALF + 5, 3.2, clamp(mid.z, -10, 10));
      desiredLook = mid.clone().setY(1.2);
    } else if (this.cameraView === 3) {
      // 高空俯瞰:漫遊(尤其真實地圖)拉高一點+略朝行進方向,看得到整片街廓與遠處的光柱
      const h = this.roam ? 30 : 22;
      const fwd = new THREE.Vector3(Math.sin(this.my.heading), 0, Math.cos(this.my.heading));
      desiredPos = mid.clone().addScaledVector(fwd, this.roam ? -6 : 0).setY(h);
      desiredLook = mid.clone().addScaledVector(fwd, this.roam ? 6 : 0).setY(0.5);
    } else {
      const fwd = new THREE.Vector3(Math.sin(this.my.heading), 0, Math.cos(this.my.heading));
      desiredPos = this.my.pos.clone().addScaledVector(fwd, 0.3).setY(2.0);
      desiredLook = this.my.pos.clone().addScaledVector(fwd, 10).setY(1.3);
    }
    // 縮放:把「機位相對注視點的偏移」按倍率縮放——五種視角同一套公式,
    // 高空俯瞰 zoom out 會自動拉更高。主選單環繞鏡頭與第一人稱(眼睛就在頭上)不縮。
    if (this.phase !== "menu" && this.cameraView !== 4 && this.camZoom !== 1) {
      desiredPos = desiredLook
        .clone()
        .addScaledVector(desiredPos.clone().sub(desiredLook), this.camZoom);
      if (desiredPos.y < 1.2) desiredPos.y = 1.2; // 拉太近也不鑽進地面
    }
    const k = 1 - Math.exp(-delta * (this.hitCamT < 0.55 && this.phase !== "menu" ? 6.5 : 3.4));
    this.camPos.lerp(desiredPos, k);
    this.camLook.lerp(desiredLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  // ---------- HUD ----------
  pushHud() {
    if (!this.onHudUpdate) return;
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const w = WEAPONS.fists;
    const nearest = this.nearestFoe();
    const dist = nearest ? this.my.pos.distanceTo(nearest.pos) : 0;
    const heavyReady01 = w.cd > 0 ? clamp(1 - this.my.cd / w.cd, 0, 1) : 1;
    const inReach = nearest ? dist <= w.reach + BODY_REACH + preset.assist * 0.6 : false;
    const phaseLabels = { menu: "主選單", gate: "出戰準備", battle: "激戰中", ended: "終場" };
    this.onHudUpdate({
      myHp: this.my.hp,
      aiHp: this.totalFoesHp(),
      foes: this.foesHpSummary(),
      maxHp: this.my.maxHp || 100,
      loadoutLabel: BEAST_LOADOUTS[this.beastId].label,
      roundNo: this.roundNo,
      roundCap: this.mode.roundCap || null,
      modeLabel: this.mode.label,
      difficultyLabel: DIFFICULTY_LABELS[this.difficulty],
      phaseLabel: this.roam && this.phase === "battle" ? "漫遊中" : phaseLabels[this.phase] || "",
      message: this.message,
      speed01: clamp(Math.abs(this.my.speed) / (preset.maxFwd + preset.boost), 0, 1),
      speedText: `${(this.my.speed * 3.6).toFixed(0)} km/h`,
      heavyReady01,
      heavyReady: this.my.cd <= 0,
      lightReady: this.my.lightCd <= 0,
      charging: this.my.chargeT >= 0,
      charge01: this.my.chargeT >= 0 ? clamp(this.my.chargeT / CHARGE_FULL, 0, 1) : 0,
      chargeReady: this.my.chargeT >= CHARGE_MIN,
      inReach,
      // 漫遊改顯示「離迷羊還有多遠」——真實地圖上羊在上百公尺外,只有光柱不夠,要有數字才知道走對沒
      gapText: this.roam
        ? (this.lost ? `🐑 ${Math.round(Math.hypot(this.lost.pos.x - this.my.pos.x, this.lost.pos.z - this.my.pos.z))} m` : "—")
        : (this.phase === "battle" && nearest ? `${dist.toFixed(1)} m` : "—"),
      lastHit: this.lastHit,
      roam: this.roam,
      flockCount: this.flock.length,
      foundCount: this.foundCount,
      overlay: { ...this.overlay },
    });
  }

  // ---------- 存讀檔(勝場紀錄) ----------
  saveGame(silent = false) {
    const prev = loadSavedGame() || {};
    const snapshot = {
      difficulty: this.difficulty, modeId: this.modeId, beastId: this.beastId,
      wins: prev.wins || 0, matches: prev.matches || 0,
    };
    if (this.phase === "ended" && !this.mode.passive) {
      snapshot.matches = (prev.matches || 0) + 1;
      if (this.livingFoes().length === 0 && this.my.hp > 0) snapshot.wins = (prev.wins || 0) + 1;
    }
    saveGameState(snapshot);
    if (!silent) {
      this.message = "已存檔。";
      this.pushHud();
    }
  }

  loadGame() {
    const snap = loadSavedGame();
    if (!snap) return false;
    if (DIFFICULTY_PRESETS[snap.difficulty]) this.difficulty = snap.difficulty;
    if (BEAST_LOADOUTS[snap.beastId]) this.beastId = snap.beastId;
    if (GAME_MODES[snap.modeId]) {
      this.modeId = snap.modeId;
      this.mode = getModeConfig(snap.modeId);
    }
    this.openHomeMenu();
    this.message = snap.matches
      ? `戰績:${snap.wins} 勝 / ${snap.matches} 場——繼續練!`
      : "尚無戰績,先來一場吧!";
    this.pushHud();
    return true;
  }
}
