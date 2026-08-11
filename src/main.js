import "./styles.css";
import { WarriorGame, GAME_MODES } from "./game.js";
import { AudioManager } from "./audio.js";
import { speakLine, setVoiceEnabled } from "./voice.js";
import { PHRASES, SCRIPTURES, FLOCK_SCRIPTURES } from "./voicePhrases.js";
import { hasSavedGame, loadSettings, saveSettings } from "./storage.js";
import { GIFTS, NAME_POOL, loadDex, saveDex, addSheepToDex, drawSheepPortrait, exportDexText, importDexText, SQUAD_MAX, FOLLOW_MAX } from "./flock.js";

const ui = {
  canvas: document.querySelector("#gameCanvas"),
  cameraButton: document.querySelector("#cameraButton"),
  myScoreLabel: document.querySelector("#myScoreLabel"),
  aiScoreLabel: document.querySelector("#aiScoreLabel"),
  modeCode: document.querySelector("#modeCode"),
  passLabel: document.querySelector("#passLabel"),
  gapLabel: document.querySelector("#gapLabel"),
  gapSideLabel: document.querySelector("#gapSideLabel"),
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
  dexModal: document.querySelector("#dexModal"),
  dexGrid: document.querySelector("#dexGrid"),
  dexCount: document.querySelector("#dexCount"),
  dexCloseButton: document.querySelector("#dexCloseButton"),
  dexExportButton: document.querySelector("#dexExportButton"),
  dexImportButton: document.querySelector("#dexImportButton"),
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
        window.__introSpoken ? null : FLOCK_SCRIPTURES.intro);
      window.__introSpoken = true;
      break;
    }
    case "lost-appear": {
      audio.uiTap();
      audio.vibrate(12);
      pushCommentary("有迷失的羊!循著光柱走過去。", "cool", null);
      break;
    }
    case "sheep-cry": {
      audio.rebound();
      break;
    }
    case "sheep-found": {
      audio.scoreSting();
      audio.crowdCheer(0.8);
      audio.vibrate([40, 30, 60]);
      openNameModal(event.genes);
      break;
    }
    case "sheep-bell": {
      audio.uiTap();
      pushCommentary("🔔 鈴鐺羊搖鈴——野獸分神了!", "hot", null);
      break;
    }
    case "sheep-wool": {
      audio.rebound();
      audio.vibrate(20);
      pushCommentary("🧣 絨毛羊蓬的一聲擋在前面——這一下不痛!", "hot", null);
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
let pickedName = "";

function openNameModal(genes) {
  pendingGenes = genes;
  pickedName = "";
  ui.nameInput.value = "";
  drawSheepPortrait(ui.namePortrait, genes);
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
  const rec = addSheepToDex(dex, name, pendingGenes);
  pendingGenes = null;
  ui.nameModal.hidden = true;
  game.adoptLostSheep(rec);
  const total = dex.sheep.length;
  window.psPing?.("sheepflock3d-found");
  if (total > 0 && total % 10 === 0) {
    pushCommentary(`第 ${total} 隻!${name} 加入了羊群——你們和我一同歡喜吧!`, "hot", FLOCK_SCRIPTURES.party);
  } else {
    pushCommentary(`${name} 加入了羊群!(羊圈裡有 ${total} 隻羊)`, "hot", FLOCK_SCRIPTURES.found);
  }
});

// ---------- 🐑 羊圈圖鑑(伴行/出戰選擇+跨站匯出匯入) ----------
function renderDex() {
  const dex = loadDex();
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
    drawSheepPortrait(cv, s.genes);
    card.appendChild(cv);
    const nm = document.createElement("div");
    nm.className = "dex-name";
    nm.textContent = s.name;
    card.appendChild(nm);
    const gift = GIFTS[s.genes.gift] || GIFTS.bell;
    const gl = document.createElement("div");
    gl.className = "dex-gift";
    gl.textContent = `${gift.icon} ${gift.label}${s.source === "gps" ? "・🛰️尋羊記" : ""}`;
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
  ui.dexCount.textContent = added < 0 ? "看不懂這段 JSON——請確認是羊圈匯出的內容。" : `匯入完成:新增 ${added} 隻羊。`;
  if (added > 0) renderDex();
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

ui.startMatchButton.addEventListener("click", () => {
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
  game.startSelectedMatch();
  closeHomeScreen();
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
