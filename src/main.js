import "./styles.css";
import { WarriorGame, GAME_MODES } from "./game.js";
import { AudioManager } from "./audio.js";
import { speakLine, setVoiceEnabled, playBleat } from "./voice.js";
import { PHRASES, SCRIPTURES, FLOCK_SCRIPTURES } from "./voicePhrases.js";
import { hasSavedGame, loadSettings, saveSettings } from "./storage.js";
import { landmarksDebug, normalizeOverpass } from "./landmarks.js";
import { GIFTS, NAME_POOL, loadDex, saveDex, addSheepToDex, drawSheepPortrait, exportDexText, importDexText, SQUAD_MAX, FOLLOW_MAX, createSheepShowcase } from "./flock.js";

const ui = {
  canvas: document.querySelector("#gameCanvas"),
  cameraButton: document.querySelector("#cameraButton"),
  myScoreLabel: document.querySelector("#myScoreLabel"),
  aiScoreLabel: document.querySelector("#aiScoreLabel"),
  modeCode: document.querySelector("#modeCode"),
  passLabel: document.querySelector("#passLabel"),
  gapLabel: document.querySelector("#gapLabel"),
  gapSideLabel: document.querySelector("#gapSideLabel"),
  gapSideTitle: document.querySelector("#gapSideTitle"),
  lastPassLabel: document.querySelector("#lastPassLabel"),
  phaseLabel: document.querySelector("#phaseLabel"),
  statusMessage: document.querySelector("#statusMessage"),
  modeLabel: document.querySelector("#modeLabel"),
  difficultyLabel: document.querySelector("#difficultyLabel"),
  speedLabel: document.querySelector("#speedLabel"),
  audioStatus: document.querySelector("#audioStatus"),
  saveStatus: document.querySelector("#saveStatus"),
  installButton: document.querySelector("#installButton"),
  installHint: document.querySelector("#installHint"),
  loadButton: document.querySelector("#loadButton"),
  menuButton: document.querySelector("#menuButton"),
  audioButton: document.querySelector("#audioButton"),
  pauseButton: document.querySelector("#pauseButton"),
  touchControls: document.querySelector("#touchControls"),
  speedMeterFill: document.querySelector("#speedMeterFill"),
  speedMeterText: document.querySelector("#speedMeterText"),
  windowFill: document.querySelector("#windowFill"),
  windowValue: document.querySelector("#windowValue"),
  matchOverlay: document.querySelector("#matchOverlay"),
  overlayEyebrow: document.querySelector("#overlayEyebrow"),
  overlayTitle: document.querySelector("#overlayTitle"),
  overlayText: document.querySelector("#overlayText"),
  resumeButton: document.querySelector("#resumeButton"),
  overlayMenuButton: document.querySelector("#overlayMenuButton"),
  homeScreen: document.querySelector("#homeScreen"),
  modeCardGrid: document.querySelector("#modeCardGrid"),
  modeDescription: document.querySelector("#modeDescription"),
  menuDifficultySelect: document.querySelector("#menuDifficultySelect"),
  beastSelect: document.querySelector("#beastSelect"),
  bigPowerLabel: document.querySelector("#bigPowerLabel"),
  audioSelect: document.querySelector("#audioSelect"),
  modeMetaTitle: document.querySelector("#modeMetaTitle"),
  modeMetaGoal: document.querySelector("#modeMetaGoal"),
  startMatchButton: document.querySelector("#startMatchButton"),
  commentaryBar: document.querySelector("#commentaryBar"),
  continueSavedButton: document.querySelector("#continueSavedButton"),
  // 🐑 羊圈圖鑑+尋回取名
  dexButton: document.querySelector("#dexButton"),
  dexButtonGame: document.querySelector("#dexButtonGame"),
  dexFab: document.querySelector("#dexFab"),
  realMapSelect: document.querySelector("#realMapSelect"),
  landmarkSelect: document.querySelector("#landmarkSelect"),
  todSelect: document.querySelector("#todSelect"),
  mapCredit: document.querySelector("#mapCredit"),
  dexModal: document.querySelector("#dexModal"),
  dexGrid: document.querySelector("#dexGrid"),
  dexCount: document.querySelector("#dexCount"),
  dexCloseButton: document.querySelector("#dexCloseButton"),
  dexExportButton: document.querySelector("#dexExportButton"),
  dexImportButton: document.querySelector("#dexImportButton"),
  dexUpButton: document.querySelector("#dexUpButton"),
  dexDownButton: document.querySelector("#dexDownButton"),
  dexIoBox: document.querySelector("#dexIoBox"),
  nameModal: document.querySelector("#nameModal"),
  namePortrait: document.querySelector("#namePortrait"),
  nameGiftLine: document.querySelector("#nameGiftLine"),
  nameSuggest: document.querySelector("#nameSuggest"),
  nameInput: document.querySelector("#nameInput"),
  nameConfirmButton: document.querySelector("#nameConfirmButton"),
};

const settings = loadSettings();
const audio = new AudioManager();
audio.setEnabled(settings.audioEnabled !== false);

const game = new WarriorGame({
  canvas: ui.canvas,
  touchRoot: ui.touchControls,
});
window.__sheepflock3d = game; window.__davidbeasts3d = game; window.__warrior3d = game; // dev hook(新名+引擎舊名雙掛)
window.__game = game; // /smoke3d 通用鉤子
// 🗺 地標補查的診斷探針:補查「不發請求」有七個理由且全是安靜的,沒這支就分不出「節流生效」與「壞了」
window.__landmarks = landmarksDebug;
window.__parseOverpass = normalizeOverpass;   // 驗收用:解析邏輯要能不靠 Overpass 死活就測

let selectedModeId = game.modeId;
let selectedDifficulty = game.difficulty;
let selectedBeastId = game.beastId;
let audioEnabled = settings.audioEnabled !== false;

function persistSettings() {
  saveSettings({
    difficulty: selectedDifficulty,
    modeId: selectedModeId,
    beastId: selectedBeastId,
    audioEnabled,
    realMap: ui.realMapSelect ? ui.realMapSelect.value : "off",
    // 🗺 地標補查開關。★ 沒有這個元素時要維持 true(預設開啟),不能寫成 `=== "on"` ——
    //    那樣在元素還沒渲染出來時會被存成 false,使用者從沒關過卻被關掉。
    landmarksOnline: ui.landmarkSelect ? ui.landmarkSelect.value !== "off" : true,
    // 🌅 時段氛圍。同上:元素還沒渲染時要維持 true,不可寫成 `=== "on"`(會把沒關過的人關掉)
    realTod: ui.todSelect ? ui.todSelect.value !== "off" : true,
  });
}

function setMeterFill(element, value) {
  element.style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
}

function setAudioState(enabled) {
  audioEnabled = enabled;
  audio.setEnabled(enabled);
  setVoiceEnabled(enabled);
  ui.audioStatus.textContent = enabled ? "開啟" : "靜音";
  ui.audioButton.textContent = enabled ? "音效開啟" : "音效靜音";
  ui.audioSelect.value = enabled ? "on" : "off";
  persistSettings();
}

function syncMenuCards() {
  for (const button of ui.modeCardGrid.querySelectorAll(".mode-card")) {
    button.classList.toggle("selected", button.dataset.mode === selectedModeId);
  }
  const mode = GAME_MODES[selectedModeId];
  ui.modeDescription.textContent = mode.description;
  ui.modeMetaTitle.textContent = mode.label;
  ui.modeMetaGoal.textContent = mode.goal;
}

function syncMenuControls() {
  ui.menuDifficultySelect.value = selectedDifficulty;
  if (ui.beastSelect) ui.beastSelect.value = selectedBeastId;
  syncMenuCards();
}

// 🗺 地面選擇要記得(不然每次都要重選);change 時存檔
if (ui.realMapSelect) {
  ui.realMapSelect.value = settings.realMap || "off";
  ui.realMapSelect.addEventListener("change", () => {
    unlockAudio();
    audio.uiTap();
    persistSettings();
  });
}
// 🗺 地標補查開關(同上,要記得住)。預設開啟 ⇒ 舊存檔沒有這個鍵時不可以讀成關閉
if (ui.landmarkSelect) {
  ui.landmarkSelect.value = settings.landmarksOnline === false ? "off" : "on";
  ui.landmarkSelect.addEventListener("change", () => {
    unlockAudio();
    audio.uiTap();
    persistSettings();
  });
}
/* 🌅 時段氛圍開關(0826)。同上兩條慣例:預設開啟、舊存檔沒這個鍵不可讀成關閉。
   ★ 改了要**當場生效**(不必重開遊戲)—— game.todOn 直接寫過去,
     下一幀 updateWeather 就會用新值(那支每幀都在跑)。 */
if (ui.todSelect) {
  ui.todSelect.value = settings.realTod === false ? "off" : "on";
  game.todOn = settings.realTod !== false;
  ui.todSelect.addEventListener("change", () => {
    unlockAudio();
    audio.uiTap();
    game.todOn = ui.todSelect.value !== "off";
    persistSettings();
  });
}

function syncGameConfigurationToMenu() {
  selectedModeId = game.modeId;
  selectedDifficulty = game.difficulty;
  selectedBeastId = game.beastId;
  syncMenuControls();
}

function syncOverlay(overlay) {
  ui.matchOverlay.classList.toggle("visible", overlay.visible);
  ui.overlayEyebrow.textContent = overlay.eyebrow;
  ui.overlayTitle.textContent = overlay.title;
  ui.overlayText.textContent = overlay.text;
  ui.resumeButton.hidden = !overlay.canResume;
}

function openHomeScreen() {
  game.openHomeMenu();
  audio.stopCrowd();
  syncGameConfigurationToMenu();
  ui.homeScreen.classList.add("visible");
  ui.dexFab.hidden = true;
  game.disableRealMap();     // 回首頁=收掉地圖圖磚(下次出發再依設定重鋪),手機記憶體不留著
  ui.mapCredit.hidden = true;
}

function closeHomeScreen() {
  ui.homeScreen.classList.remove("visible");
  ui.dexFab.hidden = false;
}

function unlockAudio() {
  audio.unlock();
}

function pushCommentary(text, tone = "info", spoken = text) {
  const bar = ui.commentaryBar;
  if (!bar || !text) return;
  bar.hidden = false;
  bar.dataset.tone = tone;
  bar.textContent = text;
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
  speakLine(spoken);
}

function handleGameEvent(event) {
  switch (event.type) {
    // ---------- 🐑 羊群事件 ----------
    case "roam-start": {
      audio.whistle();
      pushCommentary("牧場漫遊——聽,曠野裡有羊在咩咩叫!", "info",
        window.__introSpoken ? PHRASES[21] : FLOCK_SCRIPTURES.intro);
      window.__introSpoken = true;
      break;
    }
    case "lost-appear": {
      audio.uiTap();
      audio.vibrate(12);
      pushCommentary("有迷失的羊!循著光柱走過去。", "cool", PHRASES[15]);
      break;
    }
    case "sheep-cry": { // 迷羊在遠處呼喚:妹妹的咩咩聲(略高=著急的小羊)
      playBleat(1.25);
      break;
    }
    case "sheep-bleat": { // 跟著走的羊偶爾咩一聲;體型越小聲音越高(event.pitch 由基因 size 算)
      playBleat(event.pitch || 1);
      break;
    }
    case "dog-bark": { // 🐕 牧羊犬:巡邏偶爾開心吠;站哨(擋在野獸前)吠得勤、字幕吭一聲
      audio.bark(event.pitch || 1);
      if (event.guard) pushCommentary(`🐕 ${event.name}擋在野獸前面:汪!汪!(保護羊群)`, "hot", PHRASES[16]);
      break;
    }
    case "sheep-found": {
      audio.scoreSting();
      audio.crowdCheer(0.8);
      audio.vibrate([40, 30, 60]);
      openNameModal(event.genes, event.landmark);
      break;
    }
    case "sheep-bell": {
      audio.uiTap();
      pushCommentary("🔔 鈴鐺羊搖鈴——野獸分神了!", "hot", PHRASES[17]);
      break;
    }
    case "sheep-wool": {
      audio.rebound();
      audio.vibrate(20);
      pushCommentary("🧣 絨毛羊蓬的一聲擋在前面——這一下不痛!", "hot", PHRASES[18]);
      break;
    }
    case "match-start": {
      audio.whistle();
      audio.vibrate(18);
      pushCommentary(`伯利恆的曠野——${event.loadout || "野獸"}闖進了羊群!`, "info", PHRASES[0]);
      break;
    }
    case "battle-start": {
      audio.horn();
      audio.vibrate(16);
      pushCommentary("開戰!倚靠耶和華,把羊羔從野獸口中救回來!", "hot", SCRIPTURES[1]);
      break;
    }
    case "miss": {
      if (event.who === "me") {
        audio.rebound();
        pushCommentary("這一下落空了——靠近、對準再出手!", "cool", PHRASES[8]);
      }
      break;
    }
    case "super": {
      audio.scoreSting();
      audio.swish();
      audio.vibrate([40, 20, 60]);
      if (event.who === "me") {
        pushCommentary("聖靈的能力臨到——金光大作!", "hot", PHRASES[3]);
      } else {
        pushCommentary("野獸撲勢驚人——快閃開!", "cool");
      }
      break;
    }
    case "beast-telegraph": {
      audio.rebound();
      audio.vibrate([20, 40]);
      pushCommentary(`${event.label}要撲了——快閃開!`, "cool", event.beast === "bear" ? PHRASES[6] : PHRASES[5]);
      break;
    }
    case "block": {
      audio.rebound();
      audio.thud(0.4);
      audio.vibrate(18);
      if (event.who === "me") {
        pushCommentary("舉臂格擋——擋下來了!", "info");
      }
      break;
    }
    case "parry": {
      audio.scoreSting();
      audio.rebound();
      audio.vibrate([30, 20, 50]);
      if (event.who === "me") {
        pushCommentary("完美格擋!野獸被震退!", "hot");
      }
      break;
    }
    case "honey": {
      audio.uiTap();
      audio.vibrate(14);
      pushCommentary("野地的蜂蜜!", "hot", PHRASES[4]);
      break;
    }
    case "hit": {
      if (event.who === "me") {
        audio.scoreSting();
        audio.crowdCheer(event.dmg >= 14 ? 0.9 : 0.5);
        audio.vibrate([30, 20, 45]);
        const spoken = event.weapon === "輕拳" ? PHRASES[1] : event.weapon === "重拳" ? PHRASES[2] : PHRASES[3];
        pushCommentary(
          `${event.weapon}命中!-${event.dmg}(第 ${event.round} 回合)`,
          "hot",
          spoken,
        );
      } else {
        audio.thud(0.8);
        audio.vibrate(24);
        if (game.difficulty === "death") fangFlash(); // 死神模式限定:獠牙閃現(單次 0.3s)
        const spoken = event.beast === "bear" ? PHRASES[8] : PHRASES[7];
        pushCommentary(
          `被${event.weapon}擊中 -${event.dmg}——拉開距離再反擊!`,
          "cool",
          spoken,
        );
      }
      break;
    }
    case "beast-down": {
      audio.horn();
      audio.crowdCheer(0.9);
      audio.vibrate([80, 40, 90]);
      const spoken = event.beast === "bear" ? PHRASES[11] : PHRASES[10];
      pushCommentary(
        event.remaining > 0
          ? `${event.label}被制伏了!還有 ${event.remaining} 隻野獸——不要鬆懈!`
          : `${event.label}被制伏了!`,
        "hot",
        event.remaining > 0 ? PHRASES[14] : spoken,
      );
      break;
    }
    case "ko": {
      audio.horn();
      audio.crowdCheer(event.winner === "me" ? 1 : 0.6);
      audio.vibrate([110, 50, 120]);
      if (event.winner === "me") pushCommentary("全部制伏了!羊羔平安!", "hot", PHRASES[12]);
      break;
    }
    case "match-end": {
      try { if (!['localhost','127.0.0.1'].includes(location.hostname)) {   // -done:玩完一局(t=本局秒數,/stats 使用次數與平均停留吃這個)
        var __dt = Math.round((Date.now() - (window.__matchT0 || Date.now())) / 1000);
        navigator.sendBeacon?.('https://hfpc-play-stats.summer09201017.workers.dev/api/ping?g=sheepflock3d-done&t=' + __dt);
      } } catch (_) {}
      if (!event.win && game.difficulty === "death") playDarkHand(); // 死神模式限定:黑手抓心壞結局(嚇一下就收)
      const winText = "耶和華救大衛脫離獅子和熊的爪!羊羔救回來了!🦁🐻";
      const loseText = "再試一次——能力不在乎自己,在乎耶和華。";
      pushCommentary(
        event.win ? winText : loseText,
        event.win ? "hot" : "info",
        SCRIPTURES[0],
      );
      ui.saveStatus.textContent = hasSavedGame() ? "已記錄" : "尚無";
      window.psPing?.("sheepflock3d-done", window.__psT0 ? Math.round((Date.now() - window.__psT0) / 1000) : 0);
      break;
    }
    default:
      break;
  }
}

game.onEvent = handleGameEvent;

// ---------- 🐑 尋回取名(路15:5;約10:3 按著名叫自己的羊) ----------
let pendingGenes = null;
let pendingLandmark = null;   // 🗺 這隻是在哪個真實地標撿到的(地標羊才有;寫進圖鑑當紀念)
let pickedName = "";
const nameShowcase = createSheepShowcase(); // 取名視窗專用(與圖鑑分開,免得 clear 互相清掉)

function openNameModal(genes, landmark = null) {
  pendingGenes = genes;
  pendingLandmark = landmark;
  pickedName = "";
  ui.nameInput.value = "";
  // 初次見面也給 3D 會動的羊(見面禮比 2D 頭像有感);舊裝置退回 2D
  nameShowcase.clear();
  if (nameShowcase.ok) nameShowcase.add(ui.namePortrait, genes);
  else drawSheepPortrait(ui.namePortrait, genes);
  playBleat(1.35); // 牠先跟你打招呼
  const gift = GIFTS[genes.gift];
  ui.nameGiftLine.textContent = `${gift.icon} 這是一隻「${gift.label}」——${gift.desc}。`;
  const dex = loadDex();
  const used = new Set(dex.sheep.map((s) => s.name));
  const pool = NAME_POOL.filter((n) => !used.has(n));
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  ui.nameSuggest.innerHTML = "";
  for (const n of picks) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = n;
    b.addEventListener("click", () => {
      pickedName = n;
      ui.nameInput.value = "";
      for (const x of ui.nameSuggest.children) x.classList.toggle("sel", x === b);
      audio.uiTap();
    });
    ui.nameSuggest.appendChild(b);
  }
  ui.nameModal.hidden = false;
}

ui.nameConfirmButton.addEventListener("click", () => {
  if (!pendingGenes) return;
  unlockAudio();
  audio.uiTap();
  const name = (ui.nameInput.value.trim() || pickedName || NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)]).slice(0, 8);
  const dex = loadDex();
  // 🗺 地標名只存**羊的名字旁邊當紀念**,不存經緯度(位置資料不落地——同尋羊記的隱私鐵則)
  const lm = pendingLandmark;
  const rec = addSheepToDex(dex, name, pendingGenes, lm ? { landmark: lm.n } : {});
  pendingGenes = null;
  pendingLandmark = null;
  ui.nameModal.hidden = true;
  nameShowcase.clear(); // 收工:停掉那張卡的 rAF
  game.adoptLostSheep(rec);
  const total = dex.sheep.length;
  window.psPing?.("sheepflock3d-found");
  if (lm) window.psPing?.("sheepflock3d-landmark");   // 🗺 地標羊單獨打點(才知道這功能有沒有人用到)
  if (lm) {
    pushCommentary(`${name} 是在「${lm.n}」遇見的——那個地方以後你會記得牠!`, "hot", FLOCK_SCRIPTURES.found);
  } else if (total > 0 && total % 10 === 0) {
    pushCommentary(`第 ${total} 隻!${name} 加入了羊群——你們和我一同歡喜吧!`, "hot", FLOCK_SCRIPTURES.party);
  } else {
    pushCommentary(`${name} 加入了羊群!(羊圈裡有 ${total} 隻羊)`, "hot", FLOCK_SCRIPTURES.found);
  }
});

// ---------- 🐑 羊圈圖鑑(伴行/出戰選擇+跨站匯出匯入) ----------
// 🐑 3D 動態頭像(0811 使用者點名「圖鑑的羊要像皮克敏一樣 3D 會動」):
// 單一 renderer 逐卡繪製(見 flock.js);WebGL 開不起來的舊裝置自動退回 2D 頭像。
const showcase = createSheepShowcase();

function renderDex() {
  const dex = loadDex();
  showcase.clear();
  ui.dexCount.textContent = `${dex.sheep.length} 隻・🚶伴行 ${dex.follow.length}/${FOLLOW_MAX}・⚔️出戰 ${dex.squad.length}/${SQUAD_MAX}`;
  ui.dexGrid.innerHTML = "";
  if (!dex.sheep.length) {
    ui.dexGrid.innerHTML = '<p class="dex-empty">羊圈還空空的——去「🐑 牧場漫遊・尋羊」把迷失的羊找回來吧!</p>';
    return;
  }
  for (const s of dex.sheep) {
    const card = document.createElement("div");
    card.className = "dex-card";
    const cv = document.createElement("canvas");
    cv.width = 84;
    cv.height = 84;
    if (showcase.ok) showcase.add(cv, s.genes); // 3D 會動(轉一圈+踏步+小蹦跳)
    else drawSheepPortrait(cv, s.genes);        // 舊裝置退路
    card.appendChild(cv);
    const nm = document.createElement("div");
    nm.className = "dex-name";
    nm.textContent = s.name;
    card.appendChild(nm);
    const gift = GIFTS[s.genes.gift] || GIFTS.bell;
    const gl = document.createElement("div");
    gl.className = "dex-gift";
    // 徽章:天賦 + 來源 + ✨金毛 + ⚔️從獸口救回 + 🗺 真實地標(選填欄位,沒有就不顯示)
    const marks = [`${gift.icon} ${gift.label}`];
    if (s.source === "gps") marks.push("🛰️尋羊記");
    if (s.gold) marks.push("✨金毛");
    if (s.rescued) marks.push(`⚔️${s.rescued}口中救回`);
    if (s.landmark) marks.push(`🗺${s.landmark}`);
    gl.textContent = marks.join("・");
    card.appendChild(gl);
    const row = document.createElement("div");
    row.className = "dex-toggles";
    const mkToggle = (label, listKey, max) => {
      const b = document.createElement("button");
      b.type = "button";
      const on = dex[listKey].includes(s.id);
      b.textContent = label;
      b.classList.toggle("on", on);
      b.addEventListener("click", () => {
        audio.uiTap();
        const d2 = loadDex();
        const list = d2[listKey];
        const idx = list.indexOf(s.id);
        if (idx >= 0) list.splice(idx, 1);
        else if (list.length < max) list.push(s.id);
        else { ui.dexCount.textContent = `${label}最多 ${max} 隻——先取消一隻再選。`; return; }
        saveDex(d2);
        renderDex();
      });
      return b;
    };
    row.appendChild(mkToggle("🚶伴行", "follow", FOLLOW_MAX));
    row.appendChild(mkToggle("⚔️出戰", "squad", SQUAD_MAX));
    card.appendChild(row);
    ui.dexGrid.appendChild(card);
  }
}

function openDex() {
  unlockAudio();
  audio.uiTap();
  ui.dexIoBox.hidden = true;
  renderDex();
  ui.dexModal.hidden = false;
}
ui.dexButton.addEventListener("click", openDex);
ui.dexButtonGame.addEventListener("click", openDex);   // 遊戲中(側欄)
ui.dexFab.addEventListener("click", openDex);          // 遊戲中(畫面左上,手機也按得到)
window.addEventListener("keydown", (e) => {            // 快捷鍵 B
  if (e.key !== "b" && e.key !== "B") return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
  if (ui.dexModal.hidden) openDex();
});
ui.dexCloseButton.addEventListener("click", () => {
  audio.uiTap();
  ui.dexModal.hidden = true;
  showcase.clear();    // 關掉圖鑑就停 rAF(不然 3D 頭像在背景一直轉、吃手機電)
  game.refreshFlock(); // 漫遊中改了伴行名單 → 場上羊與圈中羊立即換班
});
ui.dexExportButton.addEventListener("click", () => {
  audio.uiTap();
  ui.dexIoBox.hidden = false;
  ui.dexIoBox.value = exportDexText(loadDex());
  ui.dexIoBox.select();
  ui.dexCount.textContent = "已產生羊圈 JSON——全選複製,貼到另一台裝置匯入。";
});
ui.dexImportButton.addEventListener("click", () => {
  audio.uiTap();
  if (ui.dexIoBox.hidden || !ui.dexIoBox.value.trim()) {
    ui.dexIoBox.hidden = false;
    ui.dexIoBox.value = "";
    ui.dexIoBox.focus();
    ui.dexCount.textContent = "把另一台裝置匯出的 JSON 貼進下面,再按一次「匯入」。";
    return;
  }
  const dex = loadDex();
  const added = importDexText(dex, ui.dexIoBox.value);
  // ★ 三種結果要講成三句話:看不懂 / 都已經有了 / 真的新增(全講「完成」就是無聲失敗)
  dexSay(added < 0
    ? "看不懂這段 JSON——請確認是羊圈匯出的內容(沒有動到你原有的羊)。"
    : added === 0 ? "這些羊你羊圈裡都已經有了,沒有新增(不是失敗)。" : `匯入完成:新增 ${added} 隻羊。`,
  added > 0);
});

/* 圖鑑的訊息列。★★ 一定要走這支,不要直接寫 ui.dexCount:
   `renderDex()` 的第一件事就是把 dexCount 覆寫成「N 隻・🚶伴行…」
   ⇒ 先寫訊息再 renderDex,使用者**永遠看不到那句話**(訊息閃一下就被蓋掉)。
   0812 線上驗收時 waitForFunction 逾時才抓到;既有的「匯入」按鈕從一開始就是這個病。
   ⇒ 先重畫,再寫字。 */
function dexSay(text, alsoRerender = false) {
  if (alsoRerender) renderDex();
  ui.dexCount.textContent = text;
}

// ---------- ☁ 短碼搬羊(跨站;0812 B 案第二層)----------
// 為什麼要:尋羊記在**不同 origin**,localStorage 不共用。孩子在外面用手機抓羊、回教室用電腦玩 3D,
// 「複製一大段 JSON 再貼過去」在手機上很難做對 ⇒ 打 6 個字就好。
// ★ 失敗一律指路回「匯出/匯入」那條離線路徑,不可以只印「失敗」讓人卡住。
const DEX_MOVE_API = "https://hfpc-sheepdex.summer09201017.workers.dev";
ui.dexUpButton.addEventListener("click", async () => {
  audio.uiTap();
  const dex = loadDex();
  if (!dex.sheep.length) { dexSay("羊圈是空的——先去牧場找一隻羊回來。"); return; }
  dexSay("☁ 正在送出…");
  try {
    const r = await fetch(`${DEX_MOVE_API}/put`, {
      method: "POST", headers: { "content-type": "application/json" }, body: exportDexText(dex),
    });
    const j = await r.json();
    if (!r.ok || !j.code) throw new Error(j.error || `HTTP ${r.status}`);
    ui.dexIoBox.hidden = false;
    ui.dexIoBox.value = j.code;
    dexSay(`☁ 短碼是 ${j.code} —— 在另一台裝置按「📥 短碼收羊」打進去(30 天內有效)。`
      + "(短碼不會帶地點資訊;要連地標名字一起搬就用「匯出/匯入」貼文字。)");
  } catch {
    dexSay("☁ 送不出去(沒網路或被擋)。改用「匯出」複製文字貼過去,一樣搬得動。");
  }
});
ui.dexDownButton.addEventListener("click", async () => {
  audio.uiTap();
  const code = (prompt("打入另一台裝置給你的 6 碼搬運碼:") || "").trim().toLowerCase();
  if (!code) return;
  dexSay("📥 正在收…");
  try {
    const r = await fetch(`${DEX_MOVE_API}/get?code=${encodeURIComponent(code)}`);
    if (r.status === 404) { dexSay("📥 查不到這個短碼(可能打錯,或已經過了 30 天)。"); return; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const dex = loadDex();
    const added = importDexText(dex, await r.text());
    dexSay(added < 0
      ? "⚠ 收到的內容看不懂——沒有動到你原有的羊。"
      : added === 0 ? "那邊的羊你都已經有了,沒有新增(不是失敗)。" : `🐑 收到 ${added} 隻新的羊!`,
    added > 0);
  } catch {
    dexSay("📥 收不到(沒網路或被擋)。改用「匯入」貼文字也可以。");
  }
});

game.onHudUpdate = (state) => {
  ui.myScoreLabel.textContent = state.roam ? `🐑${state.flockCount}` : String(Math.round(state.myHp));
  // 漫遊:右側顯示本次尋回數;多獸:逐獸顯示「獅72 熊88」(倒下的顯示 ✓);單獸維持大數字
  ui.aiScoreLabel.textContent = state.roam
    ? `尋回 ${state.foundCount}`
    : state.foes && state.foes.length > 1
      ? state.foes.map((f) => `${f.short}${f.down ? "✓" : Math.round(f.hp)}`).join(" ")
      : String(Math.round(state.aiHp));
  ui.modeCode.textContent = state.modeLabel;
  ui.passLabel.textContent = state.roundCap ? `${state.roundNo}/${state.roundCap}` : String(state.roundNo);
  ui.gapLabel.textContent = state.gapText;
  ui.gapSideLabel.textContent = state.gapText;
  // 漫遊時這欄量的是「離迷羊多遠」,標題要跟著改(不然寫著「與野獸距離」卻顯示羊的距離)
  if (ui.gapSideTitle) ui.gapSideTitle.textContent = state.roam ? "離迷羊距離" : "與野獸距離";
  ui.lastPassLabel.textContent = state.lastHit
    ? (state.lastHit.who === "me" ? `${state.lastHit.weapon} -${state.lastHit.dmg}` : `挨${state.lastHit.weapon} -${state.lastHit.dmg}`)
    : "—";
  ui.phaseLabel.textContent = state.phaseLabel;
  ui.statusMessage.textContent = state.message;
  ui.modeLabel.textContent = state.modeLabel;
  ui.difficultyLabel.textContent = state.difficultyLabel;
  ui.speedLabel.textContent = state.speedText;
  ui.speedMeterText.textContent = state.speedText;
  setMeterFill(ui.speedMeterFill, state.speed01);
  ui.windowValue.textContent = state.charging
    ? (state.chargeReady ? "放開出聖靈金光!" : "蓄力中…")
    : state.heavyReady ? (state.inReach ? "可出拳!" : "冷卻好了,靠近!") : "冷卻中…";
  setMeterFill(ui.windowFill, state.charging ? state.charge01 : state.heavyReady01);
  { // 中下方大出手條:戰鬥中顯示;蓄力時變蓄力條;滿=發光
    const bp = document.getElementById("bigPower"), bf = document.getElementById("bigPowerFill");
    if (bp) {
      bp.hidden = state.phaseLabel !== "激戰中";
      if (ui.bigPowerLabel) ui.bigPowerLabel.textContent = state.charging ? "聖靈金光蓄力" : "重拳出手";
      bf.style.transform = `scaleX(${Math.min(1, state.charging ? state.charge01 : state.heavyReady01)})`;
      bf.classList.toggle("full", state.charging ? state.chargeReady : (state.heavyReady && state.inReach));
    }
  }
  syncOverlay(state.overlay);
};

syncGameConfigurationToMenu();
setAudioState(audioEnabled);
ui.saveStatus.textContent = hasSavedGame() ? "已記錄" : "尚無";

ui.modeCardGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".mode-card");
  if (!button) return;
  unlockAudio();
  audio.uiTap();
  selectedModeId = button.dataset.mode;
  syncMenuCards();
  persistSettings();
});

ui.menuDifficultySelect.addEventListener("change", (event) => {
  selectedDifficulty = event.target.value;
  persistSettings();
});

ui.beastSelect.addEventListener("change", (event) => {
  unlockAudio();
  audio.uiTap();
  selectedBeastId = event.target.value;
  persistSettings();
});

ui.audioSelect.addEventListener("change", (event) => {
  unlockAudio();
  audio.uiTap();
  setAudioState(event.target.value === "on");
});

/* 🗺 真實地圖(0811「像尋羊記一樣走在真實的 3D 地圖上」)——取得座標。
   ★ 三條現場鐵則(全部學自尋羊記 v13~v17 的實戰):
     ① 用 watchPosition 不用 getCurrentPosition:後者一次逾時就死,前者會一直重試到拿到 fix。
     ② LINE/FB 內建瀏覽器(WebView)的定位常年拿不到 ⇒ 明講怎麼換瀏覽器,並留「測試地圖」出口。
     ③ 非 https 一律拿不到定位(瀏覽器規定)——直接說,不要讓使用者乾等。
   拿不到座標 = 回 null,呼叫端退回曠野牧場,遊戲照玩。 */
// ⚠ 0812 更正:這個座標其實在**信義區**(松智路/信義路五段口,台北 101 旁),不是台北車站——
//   原註解寫錯了,實際俯視驗證時才發現。街廓密、樓多,拿來測「真實地圖+建築」剛好。
const DEMO_LATLON = { lat: 25.0330, lon: 121.5654 }; // 台北信義區(同尋羊記的客廳測試起點)

function getPosition(timeoutMs = 9000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation || !window.isSecureContext) return resolve(null);
    let done = false;
    let watchId = null;
    const finish = (v) => {
      if (done) return;
      done = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      resolve(v);
    };
    watchId = navigator.geolocation.watchPosition(
      (p) => finish({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => finish(null),
      { enableHighAccuracy: true, maximumAge: 15000 },
    );
    setTimeout(() => finish(null), timeoutMs);
  });
}

/* 🚶 實走模式(牧10)的連續定位。與 getPosition(一次性)分開:
   那支拿到第一筆就 clearWatch(拿來定地圖中心),這支一直聽、一直餵給 game。
   ★ 分頁藏起來就停(省電;背景 GPS 多數瀏覽器也會斷),回前景自動重開。 */
let realWalkWatchId = null;
let realWalkAccWarnAt = 0;
function stopRealWalkWatch() {
  if (realWalkWatchId !== null) {
    try { navigator.geolocation.clearWatch(realWalkWatchId); } catch { /* ignore */ }
    realWalkWatchId = null;
  }
}
function startRealWalkWatch() {
  stopRealWalkWatch();
  if (!navigator.geolocation || !window.isSecureContext) return;
  realWalkWatchId = navigator.geolocation.watchPosition(
    (p) => {
      const r = game.feedRealWalk(p.coords.latitude, p.coords.longitude, p.coords.accuracy);
      /* 訊號爛要講,不能讓人以為遊戲壞了(牧人原地不動的原因是精度閘門在擋)。30 秒最多唸一次。 */
      if (r && r.ok === false && r.reason === "acc" && Date.now() - realWalkAccWarnAt > 30000) {
        realWalkAccWarnAt = Date.now();
        pushCommentary(`📍 定位誤差 ±${Math.round(p.coords.accuracy)} 公尺——牧人先原地等訊號(走到空曠處會準)。`, "cool", null);
      }
    },
    () => { /* 單筆失敗不吵,watch 會自己重試 */ },
    { enableHighAccuracy: true, maximumAge: 1000 },
  );
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopRealWalkWatch();
  else if (ui.realMapSelect.value === "walk" && game.realWalk) startRealWalkWatch();
});

async function setupGroundForMatch() {
  const want = ui.realMapSelect.value;
  const isRoam = selectedModeId === "seek";
  stopRealWalkWatch();
  game.disableRealMap();
  ui.mapCredit.hidden = true;
  if (want === "off" || !isRoam) return;
  let pos = null;
  if (want === "demo") {
    pos = DEMO_LATLON;
  } else {
    ui.statusMessage.textContent = "🗺 正在取得你的位置…(第一次會跳出詢問,請按「允許」)";
    pos = await getPosition();
    if (!pos) {
      pushCommentary(
        IN_APP
          ? `🗺 ${IN_APP.n} 的內建瀏覽器拿不到定位——${IN_APP.m},或在設定裡選「🧪 台北測試地圖」。這次先走曠野牧場。`
          : "🗺 這次拿不到定位(可能沒開權限或不是 https)——先走曠野牧場;想看地圖可改選「🧪 台北測試地圖」。",
        "cool", null,
      );
      return;
    }
  }
  const ok = await game.enableRealMap(pos.lat, pos.lon);
  if (!ok) {
    pushCommentary("🗺 地圖圖磚下載不到(沒網路?)——這次先走曠野牧場,遊戲照玩。", "cool", null);
    return;
  }
  ui.mapCredit.hidden = false; // OSM 授權:地圖一上場就要標來源
  if (want === "walk") {
    game.setRealWalk(true);
    startRealWalkWatch();
    pushCommentary("🚶 實走模式!你走到哪,牧人與羊群就跟到哪——走路請抬頭看路,建議在公園或教會園區用。", "hot", PHRASES[19]);
  } else {
    pushCommentary(want === "demo"
      ? "🗺 台北測試地圖!牧人和羊群走在真實街道上——羊散在附近幾百公尺,走過去找牠們。"
      : "🗺 這是你家附近的真實地圖!羊散在附近幾百公尺的街上,像尋羊記那樣把牠們找回來。", "hot", PHRASES[20]);
  }
}

ui.startMatchButton.addEventListener("click", async () => {
  window.__matchT0 = Date.now();   // -done beacon 用:本局開始時間
  unlockAudio();
  audio.uiTap();
  window.psPing?.("sheepflock3d-start");
  window.__psT0 = Date.now();
  game.applyPresentation({
    difficulty: selectedDifficulty,
    modeId: selectedModeId,
    beastId: selectedBeastId,
  });
  closeHomeScreen();
  await setupGroundForMatch();     // 地面要先決定好(真實地圖會改活動範圍與迷羊散佈)
  game.startSelectedMatch();
});

function loadIntoUi() {
  const loaded = game.loadGame();
  syncGameConfigurationToMenu();
  ui.saveStatus.textContent = loaded && hasSavedGame() ? "已記錄" : "尚無";
}

ui.continueSavedButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  loadIntoUi();
});

ui.loadButton.addEventListener("click", loadIntoUi);

ui.menuButton.addEventListener("click", () => {
  stopRealWalkWatch();   // 🚶 回選單就別再吃電了(地圖與 realWalk 由下一次 setupGround 收)
  unlockAudio();
  audio.uiTap();
  openHomeScreen();
});

ui.overlayMenuButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  openHomeScreen();
});

ui.cameraButton.addEventListener("click", () => {
  game.cycleCameraView();
});

// ── 鏡頭縮放:側欄按鈕 + 滑鼠滾輪 + 手機雙指捏合(三路共用 game.adjustZoom)
document.querySelector("#zoomOutButton")?.addEventListener("click", () => game.adjustZoom(1.25));
document.querySelector("#zoomInButton")?.addEventListener("click", () => game.adjustZoom(1 / 1.25));

ui.canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault(); // 別讓頁面跟著捲
    game.adjustZoom(e.deltaY > 0 ? 1.12 : 1 / 1.12);
  },
  { passive: false },
);

// 雙指捏合:兩指距離變短=拉遠(看更多),變長=拉近——跟地圖 App 同方向
{
  const pinchPts = new Map();
  let pinchDist = 0;
  const dist = () => {
    const [a, b] = [...pinchPts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  ui.canvas.addEventListener("pointerdown", (e) => {
    pinchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPts.size === 2) pinchDist = dist();
  });
  ui.canvas.addEventListener("pointermove", (e) => {
    if (!pinchPts.has(e.pointerId)) return;
    pinchPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPts.size !== 2) return;
    const d = dist();
    if (pinchDist > 0 && d > 0) game.adjustZoom(pinchDist / d);
    pinchDist = d;
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) {
    ui.canvas.addEventListener(ev, (e) => {
      pinchPts.delete(e.pointerId);
      pinchDist = 0;
    });
  }
}

ui.audioButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  setAudioState(!audioEnabled);
});

ui.pauseButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  game.togglePause();
});

ui.resumeButton.addEventListener("click", () => {
  unlockAudio();
  audio.uiTap();
  game.resume();
});

window.addEventListener("pointerdown", unlockAudio, { passive: true });
window.addEventListener("keydown", unlockAudio, { passive: true });

// in-app-browser-guard(#30):LINE/FB 內建瀏覽器裡「加到主畫面」永遠不會觸發——開場就提醒換瀏覽器,只提醒不擋
const IN_APP = (() => {
  const ua = navigator.userAgent || "";
  if (/\bLine\//i.test(ua) || /\bLIFF\b/i.test(ua)) return { n: "LINE", m: "右上角「⋯」→「用其他瀏覽器開啟」" };
  if (/FBAN|FBAV|FB_IAB|FB4A/i.test(ua)) return { n: "Facebook", m: "右上角「⋯」→「在外部瀏覽器中開啟」" };
  if (/Instagram/i.test(ua)) return { n: "Instagram", m: "右上角「⋯」→「在瀏覽器中開啟」" };
  if (/MicroMessenger/i.test(ua)) return { n: "微信", m: "右上角「⋯」→「在瀏覽器中開啟」" };
  return null;
})();
if (IN_APP) {
  ui.installHint.textContent = `你正在 ${IN_APP.n} 內建瀏覽器裡——想安裝或存進度,請${IN_APP.m}。`;
}

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  ui.installButton.hidden = false;
  ui.installHint.textContent = "已偵測到可安裝版本，點一下就能加入主畫面。";
});

ui.installButton.addEventListener("click", async () => {
  unlockAudio();
  audio.uiTap();
  if (!deferredInstallPrompt) {
    ui.installHint.textContent = "如果是 iPhone，請用分享選單的「加入主畫面」。";
    return;
  }
  deferredInstallPrompt.prompt();
  const outcome = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  ui.installButton.hidden = true;
  ui.installHint.textContent =
    outcome.outcome === "accepted" ? "安裝要求已送出。" : "你可以之後再安裝。";
});

window.addEventListener("appinstalled", () => {
  ui.installButton.hidden = true;
  ui.installHint.textContent = "已安裝到裝置。";
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    game.saveGame(true);
  }
});

// dev(localhost)不註冊 SW(07-11 踩雷)
if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      ui.installHint.textContent = "Service Worker 註冊失敗，但仍可直接遊玩。";
    });
  });
}

game.start();

// ── 死神模式恐怖演出(beast-boss-kit §3;只在 death 難度被呼叫,分級鐵則)──
function fangFlash() {
  const el = document.getElementById("fangFlash");
  if (!el) return;
  el.hidden = false;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show"); // CSS 單次 0.3s 淡入淡出,無連續爆閃(癲癇安全)
  setTimeout(() => { el.hidden = true; el.classList.remove("show"); }, 340);
}
function playDarkHand() {
  const el = document.getElementById("darkHand");
  if (!el) return;
  el.hidden = false;
  el.classList.remove("play");
  void el.offsetWidth;
  el.classList.add("play"); // 黑手升起抓走心臟 ~2s,收掉後回到一般溫柔重試文案
  setTimeout(() => { el.hidden = true; el.classList.remove("play"); }, 2100);
}
