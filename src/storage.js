const SETTINGS_KEY = "davidbeasts3d-settings-v1";
const SAVE_KEY = "davidbeasts3d-save-v1";

const defaultSettings = {
  difficulty: "normal",
  modeId: "duel",
  beastId: "lion1",
  audioEnabled: true,
  realMap: "off", // 🗺 牧場漫遊的地面:off=曠野牧場 / gps=真實地圖 / demo=台北測試地圖
  /* 🗺 真實地標任務的「線上補查」:走出預烤地標包的範圍時,查一次這一帶有哪些公園/學校。
     ★ 預設開啟,但**關得掉**(關了=只用內建的台北測試地標包)。
       關掉的理由是隱私:補查會把「你所在的 1 公里方格中心」送去 Overpass 問一次
       (不是精確座標、同一格只問一次、結果只存在這支手機)——但那畢竟是一次連外,
       所以照尋羊記的慣例給一個明確的開關,而不是替使用者決定。 */
  landmarksOnline: true,
  /* 🌅 時段氛圍(0826:使用者「尋羊記的真實地圖…可以學習參考」→ 拍板「先搬時段氛圍」)。
     真實地圖模式的光線跟著**真實世界時間**走(清晨偏暖 / 白天 / 黃昏偏橘 / 夜晚偏藍)。
     ★ 預設開啟,關得掉(關了=回到原本的固定正午光)。
     ★ 只影響真實地圖模式:曠野牧場那個「50 秒跑完一天」的加速日夜循環是既有的刻意設計,
       這個開關碰不到它。 */
  realTod: true,
};

function parseValue(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSettings() {
  return {
    ...defaultSettings,
    ...parseValue(localStorage.getItem(SETTINGS_KEY), {}),
  };
}

/* ⚠ 0812 修的真 bug:原本是 `{...defaultSettings, ...settings}` —— 只補預設值、**不讀既有存檔**。
   於是任何「只存一部分」的呼叫都會把沒帶到的鍵**打回預設**:
   game.js 出發時會 `saveSettings({difficulty, modeId, beastId})`,
   ⇒ 每按一次「出發」,`realMap`(牧場漫遊的地面)就被洗回 "off"
   ⇒ 使用者選了「🗺 我家附近的真實地圖」,重新載入頁面就變回曠野牧場。
   而 main.js:135 那段註解寫的正是「地面選擇要記得(不然每次都要重選)」——
   ★ 存了、也讀了、看起來完全正常,只是**被另一個呼叫者靜靜蓋掉**(localstorage 無聲失敗的一型)。
   ⇒ 一律先讀既有的再蓋上這次要改的,讓「只存一部分」變成安全操作(每個呼叫端本來就這樣假設)。 */
export function saveSettings(settings) {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      ...loadSettings(),
      ...settings,
    }),
  );
}

export function loadSavedGame() {
  return parseValue(localStorage.getItem(SAVE_KEY), null);
}

export function saveGameState(snapshot) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
}

export function hasSavedGame() {
  return localStorage.getItem(SAVE_KEY) !== null;
}
