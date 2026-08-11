const SETTINGS_KEY = "davidbeasts3d-settings-v1";
const SAVE_KEY = "davidbeasts3d-save-v1";

const defaultSettings = {
  difficulty: "normal",
  modeId: "duel",
  beastId: "lion1",
  audioEnabled: true,
  realMap: "off", // 🗺 牧場漫遊的地面:off=曠野牧場 / gps=真實地圖 / demo=台北測試地圖
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

export function saveSettings(settings) {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      ...defaultSettings,
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
