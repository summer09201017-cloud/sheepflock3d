# CLAUDE.md — sheepflock3d(牧羊人與羊群 3D:尋羊+集羊+護羊)

> 2026-08-11 換皮自 davidbeasts3d(DEYI 機)。★已上架:https://hfpc-sheepflock3d.pages.dev(0811 點名);部署=npx vite build && npx wrangler pages deploy dist --project-name hfpc-sheepflock3d --branch main。
> 🐑 新增系統全在 **src/flock.js**(基因羊/圖鑑/跟隨/天賦)+ game.js 標 🐑 的段落 + main.js 圖鑑取名 UI。
> 羊圈圖鑑=跨站格式 `hfpc-sheepdex-v1`(B 案接口,尋羊記 GPS 版日後對接;格式見 flock.js 檔頭)。
> 🧸 TSUM 鐵則(0811 使用者點名):牧人=makeShepherdTsum(chibi 大頭+tsumFaceZ,四肢用 createLimb
> =與 makePerson 同介面,姿勢系統零改動);羊=makeGeneSheep(圓萌頭+水潤高光+腮紅)。
> 🐑 神學鐵則:羊只支援不攻擊、永遠不會死;尋回=溫柔靠近(路15:5);跟隨=約10:3-4。
>
> **v0827(agape250 機・Opus 5):🪵🏏 竿與杖都變成真武器 + 🐕 牧羊犬參戰(SW v24)**
> · **J = 竿橫掃**(左手長彎鉤,轉腰掃過身前,把獸推離羊群)/ **K = 杖重劈**(右手短棒,高舉過頭重重打下)。
>   詩23:4 的杖(שֵׁבֶט,打退野獸/權柄)與竿(מִשְׁעֶנֶת,引導/支持/鉤羊)本來就是兩件不同的東西 ——
>   原本「赤手空拳、真武器插腰當裝飾」經文上是反的(撒上17:40「手中拿杖」)。
> · 🔴 **本輪根因,別再犯**:竿掛左手,而攻擊動畫**只動空的右臂** ⇒ 玩家看到「竿只搖一下」、
>   兩個鍵一模一樣、打不到獸。`3d-game-kit` 第 46~47 行**早就寫過**這條(器械黏在身側自己轉=退件)。
> · ⚠ 兵器角度一律用「想要的兵器角度」**反推**,不寫死補償常數:
>   `staff.rotation.x = staffPitch - (lArmX + lArmJ)`(靜止時剛好等於原本那顆 0.98)。
> · ⚠ 動畫與命中判定**共用一份時間表**(`LIGHT_SWING`/`HEAVY_SWING`)—— 各寫各的會變成
>   「血掉了、棒子還沒下來」,而那不會亮任何紅燈。
> · 🐕 狗會幫忙咬(4 傷害/1.35s 冷卻=獸血 4%)、血量 60、會被獸掃到 -9、**不會死**
>   (歸零=側躺 7 秒後站起來回滿血;HUD 顯示「休息中」不是 0)。0818 的「守護不攻擊」**已作廢**。
> · 🔬 `npm run verify:staff`(8 項)**量世界座標**判斷「有沒有真的碰到」——
>   舊驗收只看「血有沒有掉」⇒ 判定對、畫面錯時它全綠,這次就是這樣漏掉的。
> · ⚠ `main.js` 曾用**顯示字串**當 key(`event.weapon === "輕拳"`)決定唸哪一句 ⇒ 改名就靜靜壞掉;
>   已改吃穩定 `moveId`。**顯示文字是給人看的,不是拿來當 key 的。**
> v2(0811 使用者三點回饋,agape250 機):①視角 4→5 檔,新增「側身跟隨」(V 序位 1,鏡頭掛牧人側面)
> ②牧人加詩23:4 杖與竿——竿=左手長牧杖+頂端彎鉤,杖=短棒
> (~~右腰帶;純裝飾,戰鬥仍赤手~~ ⚠ **0827 作廢:兩件都是真武器了,杖改握右手**,見下面 v0827) ③羊圈看得到+選得到:漫遊時「已尋回未帶出門」
> 的羊(≤10)待在東側石圈休息;遊戲內 #dexButtonGame(側欄)+#dexFab(左上懸浮)+B 鍵隨時開圖鑑;
> 關圖鑑 → game.refreshFlock() 漫遊中立即換班(戰鬥中刻意不重建,防絨毛盾冷卻被洗);走近石圈一次性提示。
> ⚠ 路15 語音 mp3 收割自 sheepquest/voice,manifest 對映的唸稿字串在 voicePhrases.FLOCK_SCRIPTURES,改一個字 hash 就對不上=靜默。

> v3(0811 使用者三點回饋,agape250 機):
> ① **圖鑑 3D 會動的羊**(`createSheepShowcase` in flock.js):**單一** WebGLRenderer 逐卡 render→drawImage
>    到各卡 2D canvas(一卡一個 context 會撞瀏覽器 8~16 上限=黑圖);IntersectionObserver 只畫看得到的卡;
>    ~30fps;關視窗 `clear()` 停 rAF;WebGL 開不起來→`ok:false` 退回 `drawSheepPortrait` 2D。
>    取名視窗另開一個 showcase 實例(免得 clear 互相清掉)。圈中休息的羊也會低頭吃草(`updatePenSheep`)。
> ② **妹妹的咩咩聲**:BLEATS 四句用 **zh-TW-HsiaoYuNeural(曉雨)** 預烤;`playBleat(pitch)` 走
>    **獨立三顆 Audio 音池**(走 speakLine 會跟經文搶同一顆 Audio ⇒ 咩一聲切斷經文);
>    pitch=1.3+(1−size) ⇒ 小羊更高更奶聲;迷羊呼喚 1.25、初次見面 1.35。
> ③ **🗺 真實地圖漫遊**(`src/realmap.js`,首頁「牧場漫遊的地面」三選一:曠野/GPS/台北測試):
>    CARTO Voyager 圖磚(=尋羊記同一份 OSM 底圖)鋪成 3D 地面,z18 一磚≈138m;
>    **只等腳下那一塊就開場**(等 5×5 全載要 7~9 秒=按下出發乾等),其餘 fire-and-forget、走到哪補到哪、
>    離開 radius+1 就回收貼圖;`worldToLatLon()` 可反推所在經緯度。
>    ⚠ 四個「換地圖才會露出來」的坑,都已修:
>      (a) **clamp 例外**:`movePos`/擊退/迷羊生成改吃 `this.bound`(真實地圖 400,曠野仍 15)——
>          不改的話地圖是真的、腳步卻被關在 ±15m 的圍欄裡;
>      (b) **漫遊鏡頭焦點**:側面/俯瞰原本以「玩家與野獸中點」為焦點,漫遊沒有野獸⇒鏡頭飄向隱形獸;
>      (c) **fog 每幀被 updateWeather 覆寫**=enableRealMap 設的遠景霧從來沒生效(寫了被蓋掉);
>          且圖磚是 MeshBasicMaterial 不受光 ⇒ 日夜循環會變成「黑天配白地」⇒ 真實地圖鎖正午;
>      (d) 迷羊散佈 9~13m → 35~110m、光柱 6m → 34m,HUD「與野獸距離」漫遊時改顯示「離迷羊距離」。
>    ★ 授權鐵則:OSM 圖磚當地面**必須**標來源(#mapCredit「© OpenStreetMap 貢獻者 © CARTO」,同尋羊記)。
>    ★ 離線鐵則:拿不到定位或圖磚下載失敗 ⇒ 退回曠野牧場照玩,絕不卡住(教會沒網路也要能上課)。
>    定位用 `watchPosition`(getCurrentPosition 一次逾時就死)+ LINE/FB WebView 明講怎麼換瀏覽器。

> v4(2026-08-12 使用者點名兩件,HFP 機):
> ① **🐑 兩站的羊互通(B 案)**——對象=尋羊記(sheepquest,GPS 抓寶版)。
>    ★★ **兩站在不同 origin**(pages.dev vs workers.dev)⇒ 同一個 localStorage 鍵**不會自動同步**。
>       統一格式買到的只有「匯出的文字互相吃得下」;真正的搬運要另外給 ⇒ 做了兩層:
>       (a) 同格式匯出/匯入(零基礎設施、離線可用、保底)
>       (b) ☁ **6 碼短碼**走 `hfpc-sheepdex` Worker + 一顆 KV(30 天 TTL 自動消失)。
>    格式實作搬出 flock.js → **`src/sheepdex.js`**(=skill `sheepdex-crossite` 的垂直搬運複本,
>    **勿就地改**;與 sheepquest/hfpc-sheepdex 三份逐位元相同,可用 Get-FileHash 對賬)。
>    flock.js 只留 three.js 專屬的部分,對外名字全數 re-export ⇒ main.js/game.js 的 import 一行沒改。
>    ⚠ **UMD 掛載不可以寫成 if/else**(0812 實錘):Vite/Rollup 會把裸識別字 `module` 當外部全域
>      並且**走 CJS 那支** ⇒ 傳統 UMD 的 `else root.X=…` 永遠不執行 ⇒ 取全域拿到 undefined ⇒
>      解構當場拋 TypeError ⇒ **整包 JS 全死**,而選單是靜態 HTML 所以「頁面看起來正常」、
>      build 也是綠的、HTTP 200。抓到它的只有真的開瀏覽器看 console。⇒ 先無條件掛全域,再給 module.exports。
>    確定性 genes(種子=entry.id)⇒ 同一隻羊在兩站長相**逐欄相同**;確定性 GPS id ⇒ 重複匯入不生第二隻。
>    圖鑑徽章:🛰️尋羊記 / ✨金毛 / ⚔️獸口救回 / 🗺地標。
> ② **🗺 真實地標任務**(`src/landmarks.js` + `src/landmarks-taipei.json`):
>    真實地圖漫遊時走進真的公園/學校/球場 ⇒ **那座地標上**有一隻特別的羊(天賦鎖詩歌羊、
>    光柱改淡青色、訊息直接寫出地標名字=不只靠顏色分辨),每座地標 24 小時一隻。
>    位置用 `realMap.latLonToWorld()`(本輪新增的 `worldToLatLon` 反函數)算,誤差<2m。
>    資料兩源:預烤包(台北車站 3km,257 個公開地標,26KB,線上零 API)+ 走出範圍才線上補查。
>    ★★ 「別打 API 打到爆」五道閘:①只在跨進新格(≈1.1km)時查 ②間隔 ≥20 秒且同時只一個
>       ③每天 ≤25 次 ④查到快取 30 天 / 真的沒有 1 天 / **沒連上只鎖 10 分鐘** ⑤快取上限 60 格。
>    ⚠ abort 超時 **30 秒**是量出來的:實測 Overpass 要 9~12 秒,第一版寫 12 秒會**砍掉成功的請求**,
>      而且失敗是靜默的 ⇒ 看起來「永遠找不到地標」。
>
> ★★ 隱私鐵則(0812 立;兩條既有規則的延伸,別「順手」破壞)★★
>   · 圖鑑**不存經緯度、不存地名**,只存地標的**名字**當紀念。
>     由來:尋羊記 index.html 原註解「地名只顯示在畫面上,不上傳、**不寫進羊圈紀錄**」,
>     而圖鑑現在**可以用短碼上雲** ⇒ 寫進去就等於把行蹤送出這支手機。
>   · `hfpc-sheepdex` Worker **主動刪掉** place/lat/lon(不信任前端,defense in depth)。
>   · 預烤地標包**只放公開知名地標**,絕不烤使用者家附近 ——
>     尋羊記 index.html:163「地名是執行時查來的,**不寫死在原始碼裡**,公開 repo 不會帶著任何人的所在地」。
>     自家周邊一律走線上補查,結果只存這支手機的 localStorage。
>   · 線上補查送出去的是**格中心**(≈1km 粗),不是手機的精確座標;而且首頁給得到開關整個關掉。
>
> 🐛 順修一個既有真 bug:`storage.js` 的 `saveSettings` 原本是 `{...defaultSettings, ...settings}`
>   ⇒ 只存一部分的呼叫會把沒帶到的鍵**打回預設**。game.js 出發時 `saveSettings({difficulty,modeId,beastId})`
>   ⇒ 每按一次「出發」,`realMap`(牧場漫遊的地面)就被洗回 "off" ⇒ 使用者選了真實地圖、重載就變回曠野
>   (而 main.js 那段註解寫的正是「地面選擇要記得」)。改成先讀既有存檔再蓋。

> v5(2026-08-17 HFP 機,三輪;細節見讀我-HANDOFF 0817 兩個 ★段):🔍 鏡頭縮放(camZoom 0.6~4.0,
>   滾輪/雙指捏合/🔍鈕)· 🏙 真實建築量體(buildings.js,Overpass 逐格管理器+五道禮貌閘)·
>   🪧 地標招牌(landmarks.js createPoiMarkers,700m 內彩色光柱+名字)· 🚻 羊公母配飾(基因雜湊推導,
>   sex 刻意不進跨站格式)· SW v12→v14。
>
> v6(2026-08-18 agape250 機):🏙 **建築遊戲化四板斧**(使用者四連發:高樓壓頂/看不到路與牧人/
>   穿牆/全灰+街窄動彈不得——根因=0817 照搬真實高度,信義區 180m=人高 90 倍,鏡頭埋在樓裡):
>   ① 高度壓縮 gameHeight()(≤10m 原樣、超過×0.22、天花板 26m)② 輪廓向形心內縮 20%
>   ③ 粉彩六色 per-building vertex color(座標雜湊,重建同色)④ collide(x,z,r)碰撞
>   (movePos 牧人/野獸 r0.55、updateFlock 羊 r0.4,最近邊回推=貼牆滑行不卡死)
>   ⑤ updateFade(camPos,myPos) 視線遮擋淡出(2D 線段×樓邊+撞點高度判定;擋鏡頭那**格**淡到 0.42
>   ——合併 mesh 做不到單棟淡)。**快取格式不動**,舊快取直接受益。SW v15→**v16**。
>   驗收=scripts/verify-buildings.mjs(**注入合成建築快取**=零 Overpass 依賴,含 180m 驗天花板)10/10 🟢。
>   ⚠ localstorage-key-guard 會對它吠「寫了不讀」=測試種快取給 App 讀,刻意如此。

> v7(2026-08-18 HFP 機):🐕 **牧羊犬**(makeSheepdog in flock.js+game.js updateDogs):
>   忠忠(邊牧)/勇勇(柴柴)相位差 π 繞隊伍橢圓巡邏;戰鬥中獸進羊群 10m ⇒ 最近的狗擋在
>   獸與羊群之間站哨吠(**守護不攻擊**,傷害零變動);吠=audio.bark 合成音效。
>   🏙 **demo 建築預烤包** buildings-taipei.json(1373 棟,fetchCell 包優先,零 API):
>   0818「pages.dev 看不到高樓」破案=Overpass 志工端點當天全倒,agape250 看得到只是 30 天快取
>   ——**統計/畫面證明不了服務活著**。GPS 區仍線上、失敗改吭一聲。⚠ 包沒 hash 走 cache-first,
>   改包必連著 bump SW;⚠ verify-buildings 要把包 route 成 200+空 cells(404 會髒 console)。
>   驗證 verify:dogs 10🟢+verify:buildings 10🟢;SW v16→**v17**。
>   0819 二連修:v18=吠聲聽得到(gain 0.085→0.3 雙層波形+開場報到吠;事件與振盪器本來就在跑,
>   純響度問題——合成音效「有在響」≠「聽得見」);v19=**第三種沉默也吭聲**(抓成功但 0 棟=
>   OSM 這帶沒人畫過建築)+招牌訊息讓路 4 秒(1.2s 就蓋掉建築訊息=來不及讀)。
>   ⚠ 無頭驗收:遊戲 time 比真實時間慢約 10 倍(rAF 節流),時間類斷言別綁真實秒數。

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

## 驗證(兩支,都要跑)

先 `npm run build && npx vite preview --port 4189`,然後:

1. `npm run verify:beasts` —— 六關全綠+0 pageerror:①lion1 kids bot 勝 ②bear3 三熊 KO 鏈
   ③both hard 站樁玩家該輸 ④金光穿透雙獸都掉血 ⑤death 黑化 16110d/14100c+normal 回 c9863a
   ⑥practice 8 秒不掉血。
2. `npm run verify:landmarks` —— 🗺 地標任務 **33 項**(0812 新增):座標來回換算、走進地標生羊、
   羊放在地標真正的位置(誤差<2m)、24 小時不連噴、圖鑑只記名字不記經緯度、線上補查五道閘、
   Overpass 解析確定性單測、關掉後零請求。

★ 這支驗收的兩條血淚判準(照抄,別放寬):
  · **一定要放大 `g.bound` 再設 pos**:漫遊 clamp 是 400m,直接瞬移會被拉回 (400,400),
    那裡還在預烤範圍內 ⇒ 看起來像「補查壞了」。
  · **Overpass 是志工服務、實測會回 504**:它的死活不算我們的紅燈(console error 過濾第三方雜訊),
    「解析對不對」交給固定樣本的單測,不要綁在「它今天有沒有空」上。

## dev hook

`window.__davidbeasts3d`(+`__warrior3d` 引擎舊名雙掛)+`window.__game`(/smoke3d 通用)。
`window.__landmarks(lat,lon)` —— 🗺 地標補查探針:回 `lastReason`(不發請求的七個理由全是安靜的,
沒這支就分不出「節流生效」與「壞了」)、快取格數、每日計數、距預烤中心多遠、covered。
`window.__parseOverpass(json)` —— 解析器,給確定性單測用。

## 部署與同步(上架後,主線負責)

尚未上架——公開 repo 名/Netlify 站名待使用者逐字點名;上架收尾三件套=大廳入口卡
(戰爭合輯)→作品集 add-work 登記→sites.json,另 Worker NAMES 加 davidbeasts3d 中文名。
