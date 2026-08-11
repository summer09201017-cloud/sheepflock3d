# CLAUDE.md — sheepflock3d(牧羊人與羊群 3D:尋羊+集羊+護羊)

> 2026-08-11 換皮自 davidbeasts3d(DEYI 機)。★已上架:https://hfpc-sheepflock3d.pages.dev(0811 點名);部署=npx vite build && npx wrangler pages deploy dist --project-name hfpc-sheepflock3d --branch main。
> 🐑 新增系統全在 **src/flock.js**(基因羊/圖鑑/跟隨/天賦)+ game.js 標 🐑 的段落 + main.js 圖鑑取名 UI。
> 羊圈圖鑑=跨站格式 `hfpc-sheepdex-v1`(B 案接口,尋羊記 GPS 版日後對接;格式見 flock.js 檔頭)。
> 🧸 TSUM 鐵則(0811 使用者點名):牧人=makeShepherdTsum(chibi 大頭+tsumFaceZ,四肢用 createLimb
> =與 makePerson 同介面,姿勢系統零改動);羊=makeGeneSheep(圓萌頭+水潤高光+腮紅)。
> 🐑 神學鐵則:羊只支援不攻擊、永遠不會死;尋回=溫柔靠近(路15:5);跟隨=約10:3-4。
> ⚠ 路15 語音 mp3 收割自 sheepquest/voice,manifest 對映的唸稿字串在 voicePhrases.FLOCK_SCRIPTURES,改一個字 hash 就對不上=靜默。

以下為 davidbeasts3d 底座原文(戰鬥引擎照舊適用):

# CLAUDE.md — davidbeasts3d(3D 大衛打獅熊・護羊之戰,撒母耳記上十七章)

> 2026-07-19 換皮自 samson3d(參孫打獅子,agape250 機),引擎家族=warrior3d 真3D 自由走位。
> 帳號 summer09201017-cloud。★尚未上架:公開 repo/Netlify prod 站名等使用者逐字點名(上架鐵則)。

## 經文(撒母耳記上十七章三十四至三十七節,cuv 已查驗)

> 大衛對掃羅說:你僕人為父親放羊,有時來了獅子,有時來了熊,從群中啣一隻羊羔去。我就追趕他,
> 擊打他,將羊羔從他口中救出來。他起來要害我,我就揪著他的鬍子,將他打死。……
> 大衛又說:耶和華救我脫離獅子和熊的爪,也必救我脫離這非利士人的手。

## 本作獨有:多獸同場(beast-boss-kit §6 的活範例)

- **foes[] 陣列**取代單一 foe:`BEAST_LOADOUTS` 七陣容=獅×1/2/3、熊×1/2/3、獅+熊雙獸夾攻
  (`beastId` 進 settings/save;首頁 `#beastSelect` 下拉)。
- **BEAST_TYPES 資料驅動**:每獸自帶 claw/pounce 量值+速度/血量倍率+播報詞
  (熊=出手慢傷害高血厚 1.3x 走得慢;獅=快靈)。
- **群獸公平鐵則**:`PACK_DMG_SCALE` 1→1.0/2→0.75/3→0.6(獸越多單獸越輕,總壓力仍升);
  蜂蜜多獸時 0.7x 間隔更常出現;**同一時刻只允許一隻獸亮紅色預告**(孩子看得懂該閃誰);
  開場站位弧形排開+`pounceT` 依 index 錯開(不同步撲)。
- **玩家攻擊目標=最近活獸**(`nearestFoe()`);自動面向也鎖最近活獸;
  **聖靈金光穿透**:光波帶 `hitSet`,可一發連中多獸不消失。
- **KO 分流**:單獸倒下=`beast-down` 事件(播報「還有 N 隻」)戰鬥繼續;全獸倒下才終局。
- HUD 多獸=逐獸顯示「獅72 熊88」(倒下=✓),單獸維持大數字。

## 引擎要點(沿用 arena-duel-kit;細節同 samson3d)

- 徒步自由走位 WASD+Shift 衝刺;ARENA_HALF=15 開放無阻擋。輕拳 J/重拳 K 可蓄力
  (0.6s~1.5s)放開=聖靈金光(撒上16:13);格擋 C(±60°,≤0.35s 完美盾反)。
- 判定=畫面:近戰距離+朝向幾何判定,傷害延到接觸瞬間(`_pendingStrikes`);
  野獸重攻擊(撲擊)先亮紅色扇形預告 0.5~0.95s,預告範圍=實際命中範圍(每獸各自的
  telegraph 依其 pounce.reach 生成)。
- KO=溫柔演出:大衛單膝跪地;野獸側躺被制伏,無流血。

## 野獸模型(beast-boss-kit §4,真 3D 四足)

- `makeLion()`:同 samson3d(Box 軀幹+四腿四角+鬃毛環+尾+毛簇)。
- `makeBear()`:無鬃、軀幹加寬加厚、**肩隆駝峰**、圓耳(壓扁球)、短尾(球stub)、
  腿加粗 1.3x、整體 scale 1.12;棕色系 `BEAR_COLORS`。
- 死神模式:`LION_COLORS_DEATH`/`BEAR_COLORS_DEATH` 一鍵黑化+紅眼(只在 death 難度;
  重建於 `applyPresentation` 偵測 deathMode 或 beastId 改變時)。
- 開場獸臉必朝玩家(resetFighters 逐獸 `heading=atan2(玩家-獸)`)。

## 場景

伯利恆曠野牧場:`buildPasture()`——場外羊群(白絨球身+黑臉+四短腿)+被救回的小羊羔
(羊圈邊,0.62 縮放)+石砌羊圈低牆弧+橄欖樹+猶大曠野遠山;日夜循環一天 50 秒
(⚠ 天空會變粉紅=黃昏,特色不是 bug)。

## 語音(baked-voice-commentary 範式)

PHRASES 15 句(雲哲)+SCRIPTURES 2 句(曉臻,撒上17:34/17:37 逐字)=17 mp3 已烤。
獅/熊各有預告與被打句(main.js 依 `event.beast` 選);`beast-down` 剩獸>0 唸「還有野獸」。

## 驗證

`npm run build && npx vite preview --port 4189`;
`node scripts/verify-davidbeasts.mjs http://localhost:4189 scratch`——六關全綠+0 pageerror:
①lion1 kids bot 勝 ②bear3 三熊 KO 鏈 ③both hard 站樁玩家該輸 ④金光穿透雙獸都掉血
⑤death 黑化 16110d/14100c+normal 回 c9863a ⑥practice 8 秒不掉血。

## dev hook

`window.__davidbeasts3d`(+`__warrior3d` 引擎舊名雙掛)+`window.__game`(/smoke3d 通用)。

## 部署與同步(上架後,主線負責)

尚未上架——公開 repo 名/Netlify 站名待使用者逐字點名;上架收尾三件套=大廳入口卡
(戰爭合輯)→作品集 add-work 登記→sites.json,另 Worker NAMES 加 davidbeasts3d 中文名。
