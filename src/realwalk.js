/* 🚶 實走模式(牧10「皮克敏 GO」)——GPS 是搖桿:你在真實世界走 100 公尺,
   牧人就走 100 公尺,羊群跟在身後。純函式模組,node 直接驗得到(verify-realwalk.mjs)。

   ★★ 這支存在的理由:**GPS 抖動對 3D 角色特別兇**。定位每秒跳 ±5~30 公尺,
     2D 地圖上的小點跳一下沒人在意,3D 牧人會瞬移、橡皮筋、原地鬼畜。
     所以「定位 → 角色位置」中間必須隔一層:
       ① 精度閘門:誤差 > accGate 的定位整筆不吃(市區高樓常見 ±50m 的爛 fix)
       ② 自適應死區:新定位離目標 < max(1.6m, 誤差×0.35) 就不動目標
          —— 門檻跟著誤差走:訊號差就要走更遠才算「真的在走」,站著不動時牧人不會自己飄。
          ⚠ 死區比的是**離目標**不是離上一筆:慢走(1.4m/s、每秒一筆)第 2~3 筆就會
            累積超過門檻 ⇒ 目標每 2~3 秒前進一段,step() 再把它滑順掉。
       ③ 速度上限:角色朝目標最多 walkMax(遠了給追趕加成),永遠不瞬移
       ④ 傳送規則:目標離角色 > snapDist(GPS 大跳/久凍後恢復)才一次跳過去
          —— 那時候用走的會演一段「牧人自己狂奔 60 公尺」,比跳一下更奇怪。 */

export function createRealWalk({ latLonToWorld, walkMax = 3.4, snapDist = 60, accGate = 40 } = {}) {
  let target = null;      // 世界座標目標 {x,z}
  let ema = null;         // 低通後的定位(見 feed 的註解)
  let lastAcc = null;
  let fixes = 0;
  let held = 0;           // 被死區擋下的筆數(驗證/除錯用)
  let rejected = 0;       // 被精度閘門擋下的筆數

  return {
    /** 餵一筆定位。回 {ok} / {ok,held:true} / {ok:false,reason:'acc'} */
    feed(lat, lon, accuracy) {
      lastAcc = accuracy ?? null;
      if (accuracy != null && accuracy > accGate) { rejected += 1; return { ok: false, reason: "acc" }; }
      const w = latLonToWorld(lat, lon);
      if (!w) return { ok: false, reason: "map" };
      fixes += 1;
      /* ★★ 先低通再過死區 —— 0825 用自己的測試量出來的教訓:只有死區的話,
         抖動點對之間平均 ~5.3m(σ=3m),幾乎每筆都穿過 2.8m 的門檻 ⇒ 目標一直跳、
         牧人**原地也 60 秒走 154 公尺**(72.6% 的幀在動)= 就是我們要防的鬼畜,
         只是淨漂移小所以「漂移測試」看不到它。EMA(α=0.35)把抖動的標準差壓到
         ~1.3m(σ×√(α/(2−α))),死區才真的擋得住;走路時 EMA 只落後 2~3 公尺,無感。 */
      /* ⚠ 大跳要在低通**之前**判:EMA 會把 120m 的真跳吸收成 42m 的目標(< snapDist)
         ⇒ step() 判不到 snap,牧人改用「狂奔」過去 —— 正是傳送規則要避免的畫面。
         離 EMA 超過 snapDist 的 fix = 真的換了地方(電梯/隧道出來),直接重置。 */
      if (ema && Math.hypot(w.x - ema.x, w.z - ema.z) > snapDist) {
        ema = { x: w.x, z: w.z };
        target = { x: w.x, z: w.z };
        return { ok: true, jumped: true };
      }
      const a = 0.35;
      ema = ema ? { x: ema.x + (w.x - ema.x) * a, z: ema.z + (w.z - ema.z) * a } : { x: w.x, z: w.z };
      if (target) {
        const dead = Math.max(1.6, (accuracy ?? 10) * 0.35);
        if (Math.hypot(ema.x - target.x, ema.z - target.z) < dead) { held += 1; return { ok: true, held: true }; }
      }
      target = { x: ema.x, z: ema.z };
      return { ok: true };
    },

    /** 每幀:從 (x,z) 朝目標走一步。回 null(還沒有定位)或
        { x, z, heading, speed, moving, snap? }。呼叫端負責邊界夾限與建築碰撞。 */
    step(x, z, dt) {
      if (!target) return null;
      const dx = target.x - x;
      const dz = target.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) return { x: target.x, z: target.z, heading: null, speed: 0, moving: false };
      if (d > snapDist) return { x: target.x, z: target.z, heading: Math.atan2(dx, dz), speed: 0, moving: false, snap: true };
      /* 追趕加成:目標領先 8 公尺以上(死區分段+定位間隔造成的正常落差)可以走快一點,
         但封頂 1.6 倍 —— 再快看起來就是用飄的。 */
      const cap = walkMax * (d > 8 ? 1.6 : 1);
      const sp = Math.min(cap, d / Math.max(dt, 1e-3));
      const step = sp * dt;
      const k = Math.min(1, step / d);
      return { x: x + dx * k, z: z + dz * k, heading: Math.atan2(dx, dz), speed: sp, moving: true };
    },

    get accuracy() { return lastAcc; },
    get hasFix() { return !!target; },
    get stats() { return { fixes, held, rejected }; },
  };
}
