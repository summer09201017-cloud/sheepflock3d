// 人聲播報 runtime——mp3(雲哲神經語音預烤)優先;缺檔=靜默只出字幕。
// ★人聲鐵則(2026-07-10 使用者點名「太機器聲」):不用 Web Speech 機器聲 fallback。
import { voiceKey, BLEATS } from "./voicePhrases.js";

let manifest = null;
let current = null;
let enabled = true;

async function loadManifest() {
  if (manifest) return manifest;
  try {
    const res = await fetch("./voice/manifest.json");
    manifest = res.ok ? await res.json() : {};
  } catch {
    manifest = {};
  }
  return manifest;
}
loadManifest();

export function setVoiceEnabled(v) {
  enabled = v;
  if (!v && current) {
    current.pause();
    current = null;
  }
}

/* 🐑 羊叫(0811「羊要發出妹妹的叫聲」)——曉雨預烤的「咩~」,
   用**獨立的小音池**播:走 speakLine 會跟旁白/經文搶同一個 Audio ⇒ 咩一聲就把經文切斷。
   pitch>1=更高更奶聲(小羊);同時多隻咩會輪流用池子裡的元素,不會互相打斷。 */
const bleatPool = [];
let bleatIdx = 0;
export function playBleat(pitch = 1) {
  if (!enabled || !manifest) return;
  const keys = BLEATS.map((t) => manifest[voiceKey(t)]).filter(Boolean);
  if (!keys.length) return; // 沒烤過=靜默(人聲鐵則:不用機器聲頂替)
  try {
    if (bleatPool.length < 3) bleatPool.push(new Audio());
    const a = bleatPool[bleatIdx % bleatPool.length];
    bleatIdx += 1;
    a.pause();
    a.src = "./" + keys[Math.floor(Math.random() * keys.length)];
    a.volume = 0.55;
    a.playbackRate = Math.max(0.8, Math.min(1.8, pitch));
    a.play().catch(() => {});
  } catch { /* ignore */ }
}

export function speakLine(text) {
  if (!enabled || !text || !manifest) return;
  const path = manifest[voiceKey(text)];
  if (!path) return; // 沒烤過的句子=只出字幕,不用機器聲
  try {
    // 單一 Audio 元素重用:每句 new Audio 會累積 WebMediaPlayer,長場次被 Chrome 封鎖
    if (!current) {
      current = new Audio();
      current.volume = 0.95;
    }
    current.pause();
    current.src = "./" + path;
    current.play().catch(() => {});
  } catch {
    // ignore
  }
}
