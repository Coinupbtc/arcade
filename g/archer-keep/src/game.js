// Archer.Game — boot, rAF loop, wave machine, camera, minimap, knights, wallet (M2)
Archer.Game = (function(){
  const CFG_ = () => Archer.CFG;
  let cv, ctx, dpr = 1, last = 0, t = 0, frameMsAvg = 16, bootOk = false;
  let State = null, incomingT = 0;
  let arrowRain = 0, oil = 0, watchtowerN = 0, wtTimer = 0, moatLevel = 0, rainTimer = 0, oilTimer = 0;
  let drawPctCache = 25, wasPressing = false;

  function wallet(){ try{ return JSON.parse(localStorage.getItem(CFG_().WALLET_KEY)) || {coins:0, best:0}; }catch(e){ return {coins:0, best:0}; } }
  function saveWallet(w){ try{ localStorage.setItem(CFG_().WALLET_KEY, JSON.stringify(w)); }catch(e){} }

  function newRun(seed){
    seed = (seed!==undefined) ? seed : (Math.random()*1e9)|0;
    const w = wallet();
    const bestWave = w.best || 0;
    State = {
      status:'playing', round:1, roundState:'incoming',
      castleHp: CFG_().CASTLE.hpTier1, castleMax: CFG_().CASTLE.hpTier1, castleTier: 1,
      archerHp: CFG_().ARCHER.hpMax, archerMax: CFG_().ARCHER.hpMax,
      coins: 0, combo: 0, isBoss: false,   // M12: every run starts with an empty purse — a retry is a clean run, not a head start (the playtester died with 86 and began the next run with 86).
      selArrow:'broadhead', drawPct: 25, bootOk: true, seed,
      runCoins: 0, wavesHeld: 0, waveDamage: 0, runT: 0, bestWave: bestWave,
      // M10: the verdict names what broke the keep, so the retry has a purpose.
      fellTo: null, critWarned: false,
    };
    arrowRain = 0; oil = 0; watchtowerN = 0; wtTimer = 0; moatLevel = 0;
    rainTimer = 0; oilTimer = 0;
    shots = 0; lastPower = 25; drawPctCache = 25; wasPressing = false;
    // M9: every run starts clean. A retry must not inherit timers, shot state or a pause.
    Shot.angle = -45; Shot.power = 25; Shot.trackIds = []; Shot.trackT = 0;
    Shot.landingX = null; Shot.landingT = 0; Shot.slowmo = 0;
    forcedSel = 'broadhead';
    if(Archer.Controls && Archer.Controls.raw) Archer.Controls.raw.pause.reset();
    Archer.World.init(seed); Archer.Enemies.reset(); Archer.Knights.reset();
    Archer.Garrison.reset(); Archer.Cauldron.reset();
    Archer.Shop.reset(seed); Archer.Bow.reset(seed); Archer.Camera.reset();
    Archer.FX.clear();
    if(Archer.Input && Archer.Input.setExternalDraw) Archer.Input.setExternalDraw(false);
    startIncoming();
    Archer.UI.hideMenu(); Archer.UI.hideVerdict(); Archer.UI.hidePause(); Archer.Shop.hide(); Archer.UI.hideCoach();
  }
  function startIncoming(){
    State.roundState = 'incoming';
    State.waveDamage = 0;
    State.isBoss = State.round % CFG_().ROUND.bossEvery === 0;
    incomingT = State.isBoss ? 2.2 : 1.4;
    const intro = Archer.Curves.introFor(State.round);
    if(State.round === 1){
      // M11: a judgeable start names the gesture on screen, for the device in hand, and retires
      // the moment the first arrow leaves.
      Archer.UI.banner('WAVE 1 — AIM, HOLD, LOOSE', 1700);
      const dev = (Archer.Controls && Archer.Controls.getDevice) ? Archer.Controls.getDevice() : 'touch';
      setTimeout(()=>{ if(State && State.status==='playing' && shots === 0) Archer.UI.showCoach(coachLine(dev), 14000); }, 900);
    } else if(intro){
      Archer.UI.banner('NEW ENEMY: ' + Archer.Curves.nameOf(intro.key).toUpperCase(), 2200);
      setTimeout(()=>{ if(State && State.status==='playing') Archer.UI.toast(intro.hint, 2600); }, 2300);
    } else {
      Archer.UI.banner(State.isBoss ? '⚠ WAVE ' + State.round + ' — BOSS' : 'WAVE ' + State.round, State.isBoss?2000:1200);
    }
    Archer.Audio.play(State.isBoss ? 'bossIn' : 'wave');
  }
  function beginFight(){
    State.roundState = 'fight';
    Archer.Enemies.startRound(State.round, State.seed, onRoundCleared);
    Archer.Enemies.setOnKill(onKill);
    Archer.Knights.musterRound();
    Archer.Garrison.musterRound();
  }
  function onRoundCleared(){
    State.roundState = 'cleared';
    State.wavesHeld++;
    Archer.UI.hideCoach();
    const bonus = CFG_().ROUND.coins(State.round);
    State.coins += bonus;
    State.runCoins += bonus;
    // M9: a wave held without a scratch pays extra — gives a reason to play well, not just survive.
    if(State.waveDamage <= 0){
      const perfect = 14 + State.round * 5;
      State.coins += perfect; State.runCoins += perfect;
      Archer.UI.banner('PERFECT WALL +' + perfect, 1500);
    }
    const w = wallet(); w.coins = State.coins; w.best = Math.max(w.best||0, State.wavesHeld); saveWallet(w);
    Archer.FX.coinPop(CFG_().CASTLE.x, CFG_().CASTLE.baseY - 240, bonus);
    setTimeout(()=>{ if(State.status==='playing' && State.roundState==='cleared'){
      State.status = 'shop';
      Archer.Shop.show(State); State.roundState = 'shop';
    } }, 700);
  }
  function onKill(e, coins){
    State.combo++;
    // M10: the HUD showed COMBO ×N but paid nothing. A streak now pays: +4% per kill, capped +50%.
    const mul = 1 + Math.min(CFG_().COMBO.max - 1, Math.max(0, State.combo-1) * CFG_().COMBO.coinMul);
    const total = Math.round(coins * mul);
    State.coins += total;
    State.runCoins += total;
    Archer.FX.coinPop(e.x, e.y - e.def.h - 8, total);
    Archer.FX.hit(e.x, e.y - e.def.h/2, e.def.body);
    if(State.combo === 5 || State.combo === 10 || State.combo === 15){
      Archer.UI.banner('COMBO ×' + State.combo + ' — COINS +' + Math.round((mul-1)*100) + '%', 1200);
    }
    saveWalletThrottled();
  }
  let saveT = 0;
  function saveWalletThrottled(){ saveT = 0.5; }

  function applyUpgrade(id){
    if(id === 'repair'){ State.castleHp = State.castleMax; }
    else if(id === 'wallTier'){
      State.castleTier = Math.min(3, State.castleTier+1);
      State.castleMax = Math.round(State.castleMax * 1.4);
      State.castleHp = State.castleMax;
    }
    else if(id === 'drawTier'){ Archer.Bow.upgradeDraw && Archer.Bow.upgradeDraw(); }
    else if(id === 'arrowRain'){ arrowRain = Math.min(3, arrowRain+1); }
    else if(id === 'cauldron'){ Archer.Cauldron.upgrade('cauldron'); }
    else if(id === 'vatHeat'){ Archer.Cauldron.upgrade('vatHeat'); }
    else if(id === 'vatBig'){ Archer.Cauldron.upgrade('vatBig'); }
    else if(id === 'bowTier'){ Archer.Bow.upgradeBow(); }
    else if(id === 'unlockPierce'){ Archer.Bow.unlock('piercing'); forcedSel = 'piercing'; Archer.Bow.select('piercing'); }
    else if(id === 'unlockFire'){ Archer.Bow.unlock('fire'); forcedSel = 'fire'; Archer.Bow.select('fire'); }
    else if(id === 'unlockFrost'){ Archer.Bow.unlock('frost'); forcedSel = 'frost'; Archer.Bow.select('frost'); }
    else if(id === 'unlockBomb'){ Archer.Bow.unlock('bomb'); forcedSel = 'bomb'; Archer.Bow.select('bomb'); }
    else if(id === 'slot'){ Archer.Garrison.buySlot(); }
    else if(id === 'soldier'){ /* handled by shop UI type picker */ }
    else if(id === 'watchtower'){ watchtowerN = Math.min(2, watchtowerN+1); }
    else if(id === 'moat'){ moatLevel = Math.min(2, moatLevel+1); }
  }
  function nextRound(){
    Archer.Shop.hide();
    State.status = 'playing';
    State.round++;
    startIncoming();
  }

  // ---- one start path: the DEFEND button, Enter/Space/A at the menu, and __game.start() all call this.
  function start(){
    // A live run, a pause or an open shop owns the screen; only menu / over may start.
    if(State && (State.status === 'playing' || State.status === 'paused' || State.status === 'shop')) return;
    newRun();
  }
  // The hook must never lie: there are four public states. A shop panel is a halt, so it reports paused.
  function rawState(){
    if(!State) return 'menu';
    if(State.status === 'shop') return 'paused';
    return State.status;
  }

  // ---- pause: one owner (arcade-input). Paused is a real state, not "playing with a flag".
  // The wave-1 coach names the device in hand. 10-26 tester: a pad press, then touch play, left the pad
  // wording up for the whole wave (it was picked once). Controls re-texts it on every device change.
  function coachLine(dev){
    return dev === 'pad'
      ? '<b>LS / DPAD</b> aims · hold <b>A</b> to draw · release <b>A</b>'
      : dev === 'touch'
        ? '<b>DRAG AT THE ORC</b> · hold · release — the bow lifts the shot'
        : '<b>DRAG AT THE ORC</b> or hold <b>SPACE</b> · release to loose';
  }
  function refreshCoach(dev){ Archer.UI.retextCoach(coachLine(dev)); }
  function setPaused(on){
    if(!State) return;
    if(on && State.status === 'playing'){
      State.status = 'paused';
      if(Archer.Input && Archer.Input.setExternalDraw) Archer.Input.setExternalDraw(false);
      Archer.UI.showPause();
    } else if(!on && State.status === 'paused'){
      State.status = 'playing';
      Archer.UI.hidePause();
      last = 0;    // no time jump on resume
    }
  }

  // ---- sally: garrison knights take the field (one path for the DOM button, pad X and key F)
  function sally(){
    if(!State || State.status !== 'playing') return false;
    let sent = 0;
    for(const r of Archer.Garrison.all()){
      if(r.type==='knight' && r.mode !== 'sallied'){ r.mode='sallied'; sent++; }
    }
    const ok = Archer.Knights.sally();
    if(sent > 0 || ok){
      Archer.UI.toast('KNIGHTS SALLY OUT!' + (sent ? (' ×'+sent) : ''), 1400);
      Archer.Audio.play('win');
      return true;
    }
    Archer.UI.toast('No knights ready — recruit some in the shop', 1600);
    Archer.Audio.play('deny');
    return false;
  }

  // ---- arrow selection: chips, E/R (next), Q (prev), pad Y/RB, pad LB
  function selectArrow(k){
    if(!Archer.Bow.isUnlocked(k)) return false;
    if(!State || State.status !== 'playing') return false;
    forcedSel = k; Archer.Bow.select(k); Archer.Audio.play('draw');
    return true;
  }
  function cycleArrow(dir){
    const keys = Object.keys(CFG_().ARROWS).filter(k => Archer.Bow.isUnlocked(k));
    if(keys.length < 2) return false;
    const i = keys.indexOf(forcedSel);
    const n = keys[((i + (dir>0?1:-1)) + keys.length) % keys.length];
    return selectArrow(n);
  }
  function shotsFired(){ return shots; }
  function lastShotPower(){ return lastPower; }
  function selectedArrow(){ return forcedSel; }
  // Test-only: run the REAL death → verdict → retry path without waiting a full wave.
  function debugAPI(){
    return {
      hurtCastle(n){ if(State && State.status==='playing'){ State.castleHp = Math.max(0, State.castleHp - (n||9999)); } },
      hurtArcher(n){ if(State && State.status==='playing'){ State.archerHp = Math.max(0, State.archerHp - (n||9999)); } },
      // Test-only: clear the live wave through the REAL clear path (kills → onRoundCleared → shop),
      // so a test can reach the between-wave panel without playing a whole wave.
      clearRound(){ if(State && State.status==='playing' && State.roundState==='fight'){
        Archer.Enemies.forceClear();
      }},
      // Test-only: put coin in the purse so a test can reach a shop purchase without farming.
      addCoins(n){ if(State){ State.coins += (n||0); } },
      round(){ return State ? State.round : null; }
    };
  }

  let shots = 0, lastPower = 25;   // QA hook counters (real fires only)
  function releaseFire(){
    if(!State || State.status!=='playing' || State.roundState!=='fight') return;
    const inp = Archer.Input;
    if(!inp.canFire()) return;   // still nocking the previous arrow — no rapid fire
    if(inp.refreshAim) inp.refreshAim();   // solve the drop at the final power, not the last frame
    const drawPct = inp.drawPct();
    if(drawPct < CFG_().AIM.minFireDraw){ inp.resetDraw(); return; }  // tap spam: too weak to loose
    if(shots === 0) Archer.UI.hideCoach();   // the gesture landed: the coach has done its job
    drawPctCache = drawPct;
    State.drawPct = drawPct;
    lastPower = drawPct;
    const ax = CFG_().CASTLE.x, ay = CFG_().CASTLE.baseY + CFG_().ARCHER.yOff;
    const a = inp.getAim()*Math.PI/180;
    const res = Archer.Bow.fire(inp.getAim(), drawPct, ax + Math.cos(a)*16,
      ay + Math.sin(a)*16, ()=>{ Archer.FX.puff(ax+10, ay-4, 'rgba(255,255,255,0.5)'); });
    inp.resetDraw();
    inp.startNock();   // nock cooldown — anti rapid-fire
    // SHOT TRACKING: record angle/power, follow THESE arrow ids until impact
    Shot.angle = Math.round(inp.getAim());
    Shot.power = drawPct;
    Shot.trackIds = res.ids;
    Shot.trackT = 5.0;
    shots++;
    // camera keeps following the shot direction briefly after release
    const lead = Math.cos(a) * 260;
    if(Math.abs(lead) > 40) Archer.Camera.followAim(lead);
  }

  // enemy API bridge for Enemies.update
  function enemyApi(){
    return {
      archerPos: { x: CFG_().CASTLE.x, y: CFG_().CASTLE.baseY + CFG_().ARCHER.yOff },
      moatX: moatLevel > 0 ? CFG_().CASTLE.x + 60 + (moatLevel-1)*30 : undefined,
      damageCastle: (n, src) => {
        State.castleHp = Math.max(0, State.castleHp - n);
        State.waveDamage += n;
        State.fellTo = src || 'the horde';
        if(n >= 2){ Archer.FX.shake(Math.min(5, 1 + n*0.08)); Archer.Audio.play('gateHit'); }
      },
      damageArcher: (n) => { State.archerHp = Math.max(0, State.archerHp - n); State.fellTo = State.fellTo || 'arrows'; },
      spawnArrowFrom: (x, y, dmg) => { Archer.Bow.enemyArrow(x, y, dmg); },
      spawnMagicFrom: (x, y, dmg) => { Archer.Bow.magicBolt(x, y, dmg); },
      explosion: (x, y) => { Archer.FX.explosion(x, y); },
      shake: (n) => { Archer.FX.shake(n); },
      puff: (x, y, c) => { Archer.FX.puff(x, y, c); },
      kill: (i, paid, mul) => { Archer.Enemies.kill(i, paid, mul); },
      // friendlies are mortal: melee enemies in range hurt sallied knights/garrison
      damageKnights: (ex, dps) => {
        const G = CFG_().GARRISON_COMBAT || { meleeRange: 30, enemyDps: 6 };
        for(const k of Archer.Knights.all()){
          if(Math.abs(k.x - ex) < G.meleeRange) Archer.Knights.damageAt(k, dps);
        }
        for(const r of Archer.Garrison.all()){
          if(r.type==='knight' && r.mode==='sallied' && Math.abs(r.x - ex) < G.meleeRange){
            r.hp -= dps;
          }
        }
      },
    };
  }
  // knight API bridge
  function knightApi(){
    return {
      enemiesAll: () => Archer.Enemies.all(),
      damageEnemy: (idx, dmg) => {
        const e = Archer.Enemies.all()[idx]; if(!e) return;
        Archer.Enemies.damage(e, dmg, {armorMul:1});
        Archer.FX.hit(e.x, e.y - e.def.h/2, '#cfd8dc');
        Archer.Audio.play('hit');
        if(e.hp <= 0){
          const i = Archer.Enemies.all().indexOf(e);
          if(i >= 0) Archer.Enemies.kill(i, true, 1);
        }
      },
      healCastle: (n) => { State.castleHp = Math.min(State.castleMax, State.castleHp + n); },
      healArcher: (n) => { State.archerHp = Math.min(State.archerMax, State.archerHp + n); },
      puff: (x, y, c) => { Archer.FX.puff(x, y, c); },
    };
  }
  // garrison API bridge
  function garrisonApi(){
    return {
      enemiesAll: () => Archer.Enemies.all(),
      damageEnemy: (idx, dmg) => {
        const e = Archer.Enemies.all()[idx]; if(!e) return;
        Archer.Enemies.damage(e, dmg, {armorMul:1});
        Archer.FX.hit(e.x, e.y - e.def.h/2, '#e8eefc');
        if(e.hp <= 0){
          const i = Archer.Enemies.all().indexOf(e);
          if(i >= 0) Archer.Enemies.kill(i, true, 1);
        }
      },
      spawnWallArrow: (x, y, dmg, magic) => {
        // garrison wall units shoot at the nearest enemy
        const es = Archer.Enemies.all().filter(e=>e.x > x);
        if(!es.length) return;
        const tgt = es.reduce((a,b)=> a.x<b.x?a:b);
        const ty = tgt.y - (tgt.def.flies ? (tgt.alt||90) : tgt.def.h/2);
        const dx = tgt.x-x, dy = ty-y, d = Math.hypot(dx,dy)||1, s = 640;
        if(magic) Archer.Bow.magicBolt(x, y, dmg); // approximate: reuse bolt toward castle
        else Archer.Bow.fireRaw(x, y, dx/d*s, dy/d*s - 60, 'broadhead');
        Archer.Audio.play('shoot');
      },
      damageArcherGuard: (n) => { /* guard absorbs climber dps — reduce incoming */ State.archerHp = Math.max(0, State.archerHp - n*0.4); },
      puff: (x, y, c) => { Archer.FX.puff(x, y, c); },
      castleX: CFG_().CASTLE.x, gateY: CFG_().CASTLE.gateY,
    };
  }
  function hitEnemy(idx, arrow){
    const list = Archer.Enemies.all();
    const e = list[idx]; if(!e) return 0;
    const def = CFG_().ARROWS[arrow.kind];
    const isBoss = !!(e.def && e.def.boss);
    // boss weak point: 2x while open; bow tier dmgMul scales everything
    const bowMul = arrow.dmgMul || 1;
    let dmg = def.dmg * bowMul;
    if(isBoss && e.weakOpen > 0) dmg *= 2;
    // M7 HEADSHOTS: impact in the top zone of the body = 1.8x + banner (owner ask:
    // bigger enemies + headshots that matter). 2026-10-16: e.y is already altitude-
    // adjusted for flyers — no extra alt subtraction (was a double-count).
    const HS = CFG_().HEADSHOT;
    const hgt = e.def.h;
    const eyTop = e.y - hgt;
    const headshot = arrow.y < (eyTop + hgt*HS.zone);
    if(headshot) dmg *= HS.mul;
    const eff = Archer.Enemies.damage(e, dmg, def);
    if(def.burn) Archer.Enemies.applyBurn(e, def.burn.dps, def.burn.dur);
    if(def.slow) Archer.Enemies.applySlow(e, def.slow.mul, def.slow.dur);
    if(def.aoe){
      Archer.FX.explosion(arrow.x, arrow.y);
      Archer.Enemies.all().forEach((o,j)=>{ if(o!==e) Archer.Enemies.damage(o, def.dmg*0.6, def); });
    }
    const col = arrow.kind==='fire' ? '#ffb347' : arrow.kind==='frost' ? '#bfefff' : '#fff';
    Archer.FX.damageNum(e.x, e.y - e.def.h - 10, headshot ? Math.round(eff) + ' HEAD!' : eff,
      headshot ? '#ff5252' : col, headshot || eff >= 40);
    Archer.FX.hit(arrow.x, arrow.y, col, eff >= 40);
    // M12 feel: a head hit lands with weight — a 45 ms stop and a small kick, so the best shot
    // in the game feels like the best shot in the game.
    if(headshot){ Archer.FX.hitStop(); Archer.FX.shake(1.6); }
    Archer.Audio.play(headshot ? 'crit' : (eff >= 40 ? 'crit' : 'hit'));
    if(arrow.kind === 'fire') Archer.Audio.play('burn');
    if(arrow.kind === 'frost') Archer.Audio.play('freeze');
    return eff;
  }

  // camera focus: the owner wants the camera on THEIR position, not the enemy.
  // M9 (2026-10-25): the lane in front of the keep is the stage. Warbands now enter at the right
  // edge of the home view, so panning toward every approach pushed the archer off-screen and made
  // aiming worse. Home is the default; an arrow in flight is followed; a manual pan/peek always wins.
  function focusX(){
    const tracked = trackedArrow();
    if(tracked !== null) return tracked;
    const es = Archer.Enemies.all();
    let nearest = 1e9;
    for(const e of es) nearest = Math.min(nearest, e.x);
    const homeX = CFG_().CASTLE.x - CFG_().W*0.28;   // castle at ~28% from left
    // Only if something got PAST the keep do we swing the view after it.
    if(nearest < CFG_().CASTLE.x - 40) return Math.max(0, nearest - CFG_().W*0.45);
    return Math.max(0, homeX);
  }
  // ---- SHOT TRACKING STATE ----
  const Shot = { angle: -45, power: 25, trackIds: [], trackT: 0,
                 landingX: null, landingT: 0, slowmo: 0 };
  // find a tracked arrow still flying; return camera edge to center it
  function trackedArrow(){
    if(Shot.trackT <= 0 || !Shot.trackIds.length) return null;
    Shot.trackT -= 1/60;
    const flying = Archer.Bow.debugList().filter(a => Shot.trackIds.includes(a.id));
    if(!flying.length){
      // all tracked arrows impacted — the impact callback already set landing + slowmo
      Shot.trackIds = [];
      return null;
    }
    const lead = flying.reduce((a,b)=> a.x>b.x?a:b);
    return Math.max(0, lead.x - CFG_().W*0.45);
  }
  // called by Bow when a tracked arrow impacts ground
  function arrowImpact(id, x, y){
    if(!Shot.trackIds.includes(id)) return;
    Shot.trackIds = Shot.trackIds.filter(i2 => i2 !== id);
    Shot.landingX = Math.round(x);
    Shot.landingT = 4.0;                    // marker persists ~4s
    Shot.slowmo = 0.55;                     // slow-motion on impact
    Archer.FX.puff(x, y, 'rgba(230,220,190,0.9)');
    Archer.FX.puff(x+4, y-4, 'rgba(200,190,160,0.7)');
  }

  function frame(ts){
    requestAnimationFrame(frame);
    if(!last) last = ts;
    let dt = Math.min(0.05, (ts-last)/1000); last = ts; t += dt;
    frameMsAvg = frameMsAvg*0.95 + dt*1000*0.05;
    try{
      // One input poll per frame: menus, pause pill, auto-pause, keyboard/pad edges.
      const frameInput = Archer.Controls.poll();
      if(!State) { publishMenuFrame(); return; }
      // SLOWMO: when a tracked arrow just impacted, time crawls briefly
      Shot.slowmo = Math.max(0, Shot.slowmo - dt);
      Shot.landingT = Math.max(0, Shot.landingT - dt);
      const slowScale = Shot.slowmo > 0 ? 0.28 : 1;
      const hs = Archer.FX.hitStopScale();
      const sdt = dt * hs * slowScale;
      if(State.status === 'playing' || State.status === 'shop'){
        if(State.status === 'playing'){
          State.runT += dt;
          Archer.Input.tick(dt);
          // bow weight: a creak the moment the string is taken up (press edge only, no spam)
          const nowPressing = Archer.Input.isPressing();
          if(nowPressing && !wasPressing) Archer.Audio.play('draw');
          wasPressing = nowPressing;
        }
        Archer.Controls.drive(frameInput, dt);
      }
      saveT -= dt; if(saveT <= 0 && saveT > -1){ const w = wallet(); w.coins = State.coins; w.best = Math.max(w.best||0, State.wavesHeld||0); saveWallet(w); saveT = -1; }
      if(State.status === 'playing'){
        if(State.roundState === 'incoming'){
          incomingT -= dt;
          if(incomingT <= 0) beginFight();
        } else if(State.roundState === 'fight'){
          Archer.Enemies.update(sdt, enemyApi());
          Archer.Knights.update(sdt, knightApi());
          Archer.Garrison.update(sdt, garrisonApi());
          Archer.Cauldron.update(sdt, {});
          // cauldron auto-dump on wall attackers
          if(Archer.Cauldron.isBuilt()){
            const dumped = Archer.Cauldron.tryDump(Archer.Enemies.all());
            if(dumped > 0){
              for(let v=0;v<8;v++) Archer.FX.puff(CFG_().CASTLE.x+34+Math.random()*50, CFG_().LANE.y-8-Math.random()*30, 'rgba(255,120,60,0.8)');
              Archer.UI.toast('CAULDRON DUMP!', 1000);
            }
          }
          // arrow rain charge: auto-volley on cooldown
          if(arrowRain > 0){
            rainTimer -= sdt;
            if(rainTimer <= 0){
              rainTimer = 12 - arrowRain*1.5;
              const list = Archer.Enemies.all().filter(e=>!e.def.flies);
              if(list.length){
                for(let v=0; v<6; v++){
                  const tgt = list[Math.floor(Math.random()*list.length)];
                  const vx = (tgt.x + (Math.random()*40-20)) - CFG_().CASTLE.x, vy = (tgt.y-200) - (CFG_().CASTLE.baseY - 160);
                  const d = Math.hypot(vx,vy)||1, s = 560;
                  Archer.Bow.fireRaw(CFG_().CASTLE.x+20, CFG_().CASTLE.baseY-170, vx/d*s, vy/d*s - 100, 'broadhead');
                }
                Archer.Audio.play('shoot');
                Archer.UI.toast('ARROW RAIN', 900);
              }
            }
          }
          // boiling oil: auto-scald on cooldown
          if(oil > 0){
            oilTimer -= sdt;
            if(oilTimer <= 0){
              oilTimer = 15 - oil*2;
              const list = Archer.Enemies.all().filter(e=> e.x < CFG_().CASTLE.x + 170 && !e.def.flies);
              if(list.length){
                list.forEach(e=>Archer.Enemies.damage(e, 14, {armorMul:1}));
                for(let v=0;v<10;v++) Archer.FX.puff(CFG_().CASTLE.x+60+Math.random()*100, CFG_().LANE.y-6, 'rgba(255,190,80,0.8)');
                Archer.Audio.play('burn'); Archer.UI.toast('BOILING OIL', 900);
              }
            }
          }
          // watchtower auto-shot
          if(watchtowerN > 0){
            wtTimer -= sdt;
            if(wtTimer <= 0){
              const list = Archer.Enemies.all().filter(e=>!e.def.flies);
              if(list.length){
                wtTimer = 3.2;
                const tgt = list.reduce((a,b)=> a.x<b.x?a:b);
                const ax = CFG_().CASTLE.x + 44, ay = CFG_().CASTLE.baseY - CFG_().CASTLE.towerH - 8;
                const s = 760, dx = tgt.x-ax, dy = (tgt.y-tgt.def.h/2)-ay, d = Math.hypot(dx,dy)||1;
                Archer.Bow.fireRaw(ax, ay, dx/d*s, dy/d*s - 120, 'broadhead');
                Archer.Audio.play('shoot');
              } else wtTimer = 0.5;
            }
          }
          // GATE CRITICAL: the keep warns once, loudly — a losing run must be legible at a glance.
          const hpFrac = State.castleMax > 0 ? State.castleHp / State.castleMax : 1;
          if(hpFrac <= 0.25 && !State.critWarned){
            State.critWarned = true;
            Archer.UI.banner('⚠ GATE CRITICAL', 1800);
            Archer.UI.toast('Walls failing — repair in the shop after this wave', 2400);
            Archer.Audio.play('gateHit'); Archer.FX.shake(4);
          }
          // archer / castle death
          if(State.castleHp <= 0 || State.archerHp <= 0){
            State.status = 'over';
            Archer.FX.shake(7);
            if(Archer.Input && Archer.Input.setExternalDraw) Archer.Input.setExternalDraw(false);
            const w = wallet(); w.coins = State.coins; w.best = Math.max(w.best||0, State.wavesHeld); saveWallet(w);
            setTimeout(()=>Archer.UI.showVerdict(State), 380);
          }
        }
        Archer.Bow.update(sdt, {
          enemies: Archer.Enemies,
          hitEnemy,
          hitArcher: (n) => { State.archerHp = Math.max(0, State.archerHp - n); Archer.FX.shake(1.6); },
          groundY: () => CFG_().LANE.y,
          trail: (x,y,k) => Archer.FX.trail(x,y,k),
          stick: (x,y) => Archer.FX.stickDust(x,y),
          arrowImpact,
        });
      }
      Archer.FX.update(dt);
      Archer.World.update(dt);
      // keep castle damage visuals in sync with actual HP (75/50/25% states)
      Archer.World.setCastle(State.castleTier, Math.max(0, State.castleHp / State.castleMax),
        State.castleHp > 0 ? Math.min(1, State.castleHp / (CFG_().CASTLE.hpTier1*0.5)) : 0);
      // camera: aim-follow while drawing (lead the shot), else home/fight focus
      const inpAim = Archer.Input;
      if(State.status !== 'paused'){
        if(inpAim.isPressing()){
          // shift camera toward aim direction (right aim → look right), but NEVER push the
          // archer off-screen: owner ask — bow + angle/power readout + guide must stay visible.
          const aRad = inpAim.getAim()*Math.PI/180;
          const leadX = Math.cos(aRad) * 120 * (inpAim.drawPct()/100) * dt * 6;
          const archerScreen = CFG_().CASTLE.x - Archer.Camera.x;
          // archer must stay >= 90px inside the left edge while drawing
          const maxSlide = Math.max(0, archerScreen - 90);
          Archer.Camera.aimBias(Math.min(leadX, maxSlide));
        }
        // camera: follow fight, honor peek
        Archer.Camera.tick(dt, focusX());
      }
      // draw (screen space; world draws subtract camera)
      const so = Archer.FX.shakeOffset();
      const vsc = (Archer.CFG.viewScale && Archer.CFG.viewScale()) || 1;
      ctx.setTransform(dpr*vsc,0,0,dpr*vsc,0,0);
      ctx.save(); ctx.translate(so.x, so.y);
      Archer.World.draw(ctx, t);
      const inp = Archer.Input;
      drawArcher(ctx, t, inp);
      drawLandingMarker(ctx);
      drawAimReadout(ctx, inp);
      Archer.Garrison.draw(ctx);
      Archer.Cauldron.draw(ctx);
      Archer.Knights.draw(ctx);
      Archer.Enemies.draw(ctx);
      Archer.Bow.draw(ctx);
      drawAimLock(ctx);
      if(State.status==='playing' && State.roundState==='fight') Archer.Enemies.drawBossBar(ctx);
      Archer.FX.drawOver(ctx);
      drawOffscreenThreats(ctx);
      drawDanger(ctx);
      // minimap on top
      Archer.Minimap.draw(ctx);
      ctx.restore();
      // HUD
      State.selArrow = archerSel();
      State.drawPct = inp.drawPct();
      Archer.UI.update(State, {});
      publishDebug();
      bootOk = true;
    }catch(err){
      window.__errs.push('frame: '+err.message);
      console.error(err);
    }
  }

  function publishMenuFrame(){
    // menu idle: draw world + minimap once per frame for backdrop
    const vsc = (Archer.CFG.viewScale && Archer.CFG.viewScale()) || 1;
    ctx.setTransform(dpr*vsc,0,0,dpr*vsc,0,0);
    Archer.World.draw(ctx, t);
    drawArcher(ctx, t, Archer.Input);
  }

  // ---- OFF-SCREEN THREAT: a chevron at the edge tells you the horde is out there ----
  // In portrait the home view is 390 units wide and the wave spawns past its right edge, so the lane
  // looked empty at wave start. The radar shows dots; this says it in one glance.
  function drawOffscreenThreats(ctx){
    if(!State || State.status !== 'playing' || State.roundState !== 'fight') return;
    const Cfg = CFG_(), cam = Archer.Camera.x;
    let right = 0, left = 0;
    for(const e of Archer.Enemies.all()){
      const px = e.x - cam;
      if(px > Cfg.W - 6) right++; else if(px < 6) left++;
    }
    if(!right && !left) return;
    const pulse = 0.62 + 0.38 * Math.abs(Math.sin(t * 3.2));
    const y = Cfg.LANE.y - 74;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.font = '900 10px -apple-system,sans-serif';
    if(right){
      const x = Cfg.W - 14;
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.moveTo(x - 11, y - 9); ctx.lineTo(x, y); ctx.lineTo(x - 11, y + 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd0cc'; ctx.textAlign = 'right';
      ctx.fillText('⚔ ' + right, x - 16, y + 3);
    }
    if(left){
      const x = 14;
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.moveTo(x + 11, y - 9); ctx.lineTo(x, y); ctx.lineTo(x + 11, y + 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd0cc'; ctx.textAlign = 'left';
      ctx.fillText('⚔ ' + left, x + 16, y + 3);
    }
    ctx.restore();
  }

  let dangerGrad = null, dangerKey = '';

  // ---- DANGER VIGNETTE: the screen breathes red while the gate is about to fall ----
  function drawDanger(ctx){
    if(!State || State.status !== 'playing') return;
    const frac = State.castleMax > 0 ? State.castleHp / State.castleMax : 1;
    if(frac > 0.3) return;
    const W = CFG_().W, H = CFG_().H, cx = W*0.5, cy = H*0.5;
    const r = Math.hypot(W, H) * 0.5;
    const key = W + 'x' + H;
    if(!dangerGrad || dangerKey !== key){
      // Built once per viewport size: a new gradient every frame is a real cost at 60 fps.
      dangerGrad = ctx.createRadialGradient(cx, cy, r*0.5, cx, cy, r);
      dangerGrad.addColorStop(0, 'rgba(200,30,30,0)');
      dangerGrad.addColorStop(1, 'rgba(200,30,30,1)');
      dangerKey = key;
    }
    const pulse = 0.16 + 0.10 * Math.sin(t * 5);
    ctx.save(); ctx.globalAlpha = pulse; ctx.fillStyle = dangerGrad; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // ---- LAST-SHOT LANDING MARKER: pulsing X at the impact point ----
  function drawLandingMarker(ctx){
    if(Shot.landingT <= 0 || Shot.landingX === null) return;
    const cam = Archer.Camera ? Archer.Camera.x : 0;
    const px = Shot.landingX - cam;
    if(px < -20 || px > CFG_().W+20) return;
    const pulse = 1 + Math.sin(t*6)*0.15;
    const fade = Math.min(1, Shot.landingT/1.0);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2;
    const s = 7*pulse;
    ctx.beginPath();
    ctx.moveTo(px-s, CFG_().LANE.y-s); ctx.lineTo(px+s, CFG_().LANE.y+s);
    ctx.moveTo(px+s, CFG_().LANE.y-s); ctx.lineTo(px-s, CFG_().LANE.y+s);
    ctx.stroke();
    // distance label
    const dist = Math.round(Shot.landingX - CFG_().CASTLE.x);
    ctx.fillStyle = 'rgba(255,213,79,'+(0.85*fade)+')';
    ctx.font = '800 8px -apple-system,sans-serif'; ctx.textAlign='center';
    ctx.fillText(dist + 'm', px, CFG_().LANE.y + 12);
    ctx.textAlign='left';
    ctx.restore();
  }

  // ---- AIM LOCK: the bow has solved the drop for this body. A ring says so, so a drag that
  // looks aimed at an orc is visibly the shot that will hit it.
  function drawAimLock(ctx){
    if(!State || State.status !== 'playing' || State.roundState !== 'fight') return;
    const lock = (Archer.Input && Archer.Input.aimLock) ? Archer.Input.aimLock() : null;
    if(!lock || !lock.def) return;
    const cam = Archer.Camera.x;
    const px = lock.x - cam;
    const cy = lock.y - (lock.def.flies ? lock.def.h*0.5 : lock.def.h*0.5);
    if(px < -40 || px > CFG_().W + 40) return;
    const r = Math.max(14, Math.max(lock.def.w, lock.def.h) * 0.72);
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(t * 6));
    ctx.save();
    ctx.strokeStyle = 'rgba(255,213,79,' + pulse.toFixed(2) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, cy, r, 0, 7); ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(255,213,79,' + (pulse * 0.55).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(px, cy, r + 5, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,213,79,' + (0.95 * pulse).toFixed(2) + ')';
    ctx.font = '900 8px -apple-system,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('LOCK', px, cy - r - 5);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ---- ANGLE + POWER READOUT: near the archer while drawing ----
  // Owner fix: chips CLAMP to the viewport instead of vanishing when the camera
  // slides during a far aim — the aim bar must never disappear mid-draw.
  function drawAimReadout(ctx, inp){
    if(!State || State.status!=='playing') return;
    const keyAim = (inp.showingAim && inp.showingAim()) && (Archer.Controls.getDevice ? Archer.Controls.getDevice() !== 'touch' : true);
    if(!inp.isPressing() && !keyAim) return;
    const Cfg = CFG_();
    const ax = Cfg.CASTLE.x - (Archer.Camera ? Archer.Camera.x : 0);
    const ay = Cfg.CASTLE.baseY + Cfg.ARCHER.yOff;
    if(ax < -160 || ax > Cfg.W+160) return;
    const cx = Math.max(26, Math.min(Cfg.W-26, ax));   // clamp into view
    const ang = Math.round(inp.getAim());
    const pow = inp.isPressing() ? inp.drawPct() : inp.idleDrawPct();
    ctx.save();
    ctx.font = '900 10px -apple-system,sans-serif';
    // angle chip
    ctx.fillStyle = 'rgba(10,16,30,0.8)';
    ctx.fillRect(cx-24, ay-62, 48, 13);
    ctx.fillStyle = '#8fd3ff'; ctx.textAlign='center';
    ctx.fillText(ang + '°', cx, ay-52);
    // power bar + number
    ctx.fillStyle = 'rgba(10,16,30,0.8)';
    ctx.fillRect(cx-24, ay-46, 48, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(cx-22, ay-44, 44, 4);
    ctx.fillStyle = pow >= 95 ? '#ffd54f' : '#8fd3ff';
    ctx.fillRect(cx-22, ay-44, 44*(pow/100), 4);
    ctx.fillStyle = '#e8eefc';
    ctx.fillText(pow + '%', cx, ay-36);
    ctx.textAlign='left';
    ctx.restore();
  }

  let forcedSel = 'broadhead';
  function archerSel(){ return forcedSel; }
  function drawArcher(ctx, t, inp){
    const Cfg = CFG_(), P = Cfg.PALETTE;
    const ax = Cfg.CASTLE.x - (Archer.Camera ? Archer.Camera.x : 0);
    const ay = Cfg.CASTLE.baseY + Cfg.ARCHER.yOff;
    if(ax < -80 || ax > Cfg.W+80) return; // archer off-camera
    // platform
    ctx.fillStyle = P.woodDark; ctx.fillRect(ax-30, ay+8, 60, 6);
    ctx.fillStyle = P.wood; ctx.fillRect(ax-30, ay+8, 60, 2);
    // legs
    ctx.strokeStyle = '#3d3a4f'; ctx.lineWidth = 3.4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(ax-3, ay-2); ctx.lineTo(ax-4, ay+9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax+3, ay-2); ctx.lineTo(ax+4, ay+9); ctx.stroke();
    // body (knight tabard) + belt
    ctx.fillStyle = P.pArchDark; ctx.fillRect(ax-8, ay-16, 16, 16);
    ctx.fillStyle = P.pArch; ctx.fillRect(ax-8, ay-16, 10, 16);
    ctx.fillStyle = '#5d3f22'; ctx.fillRect(ax-8, ay-7, 16, 2.4);
    // quiver on back
    ctx.fillStyle = P.woodDark; ctx.save(); ctx.translate(ax-10, ay-12); ctx.rotate(0.35);
    ctx.fillRect(-2.4, -8, 5, 13); ctx.restore();
    // head + knight helm with plume
    ctx.fillStyle = '#e0b089'; ctx.beginPath(); ctx.arc(ax, ay-22, 6.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#90a4ae'; ctx.beginPath(); ctx.arc(ax, ay-24, 7, Math.PI*0.95, Math.PI*0.05); ctx.fill();
    ctx.fillRect(ax-7, ay-24, 14, 3.4);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ax, ay-28); ctx.quadraticCurveTo(ax+4, ay-33, ax, ay-35); ctx.stroke();
    // bow + arm toward aim (screen-space aim)
    const ang = inp.getAim()*Math.PI/180;
    const pressing = inp.isPressing();
    const drawPct = inp.drawPct();
    const pull = pressing ? 8*(drawPct/100) : 0;
    const bx = ax + Math.cos(ang)*12, by = ay - 6 + Math.sin(ang)*12;
    ctx.strokeStyle = P.wood; ctx.lineWidth = 2.6; ctx.lineCap='round';
    ctx.beginPath(); ctx.arc(bx, by, 11, ang-1.25, ang+1.25); ctx.stroke();
    // string
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    const nx = bx + Math.cos(ang+1.25)*11, ny = by + Math.sin(ang+1.25)*11;
    const fx = bx + Math.cos(ang-1.25)*11, fy = by + Math.sin(ang-1.25)*11;
    const sx2 = bx - Math.cos(ang)*pull, sy2 = by - Math.sin(ang)*pull;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(sx2, sy2); ctx.lineTo(fx, fy); ctx.stroke();
    // nocked arrow while drawing + dotted guide (screen-space flight preview)
    const keyAim = (inp.showingAim && inp.showingAim()) &&
                   (!Archer.Controls.getDevice || Archer.Controls.getDevice() !== 'touch');
    if(pressing || keyAim){
      const gPct = pressing ? drawPct : inp.idleDrawPct();
      ctx.strokeStyle = CFG_().ARROWS[forcedSel].color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx2, sy2);
      ctx.lineTo(sx2 + Math.cos(ang)*14, sy2 + Math.sin(ang)*14); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,200,0.95)';
      const cam = Archer.Camera ? Archer.Camera.x : 0;
      const v0 = (Cfg.AIM.speedMin + (Cfg.AIM.speedMax-Cfg.AIM.speedMin)*(gPct/100)) *
                 ((Cfg.ARROWS[forcedSel] && Cfg.ARROWS[forcedSel].speed) || 1) *
                 (Archer.Bow.speedMul ? Archer.Bow.speedMul() : 1);
      let wx = Cfg.CASTLE.x + Math.cos(ang)*16, wy = ay + Math.sin(ang)*16;
      let vx = Math.cos(ang)*v0, vy = Math.sin(ang)*v0;
      // Owner fix: full-flight guide (was 34 dots ≈ 1s — fell silent long before far enemies).
      // Simulate until ground with the REAL per-kind gravity; dots spaced ~14px of arc travel
      // (time-based spacing broke at high v0 — dots landed 150px apart and vanished).
      const gk = Cfg.GRAVITY * 0.75;
      let landX = null, lastDotX = -1e9, lastDotY = -1e9;
      for(let i=0;i<400;i++){
        vy += gk*0.03; wx += vx*0.03; wy += vy*0.03;
        if(wy >= Cfg.LANE.y){ landX = wx; break; }
        const px = wx - cam;
        if(px >= -10 && px <= Cfg.W+10){
          const ddx = wx - lastDotX, ddy = wy - lastDotY;
          if(ddx*ddx + ddy*ddy >= 196){   // ~14px arc spacing
            ctx.beginPath(); ctx.arc(px, wy, 2.2, 0, 7); ctx.fill();
            lastDotX = wx; lastDotY = wy;
          }
        }
      }
      // predicted impact: X marker + distance label, clamped on-screen
      if(landX !== null){
        const lx = Math.max(8, Math.min(Cfg.W-30, landX - cam));
        ctx.strokeStyle = 'rgba(255,213,79,0.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(lx-5, Cfg.LANE.y-5); ctx.lineTo(lx+5, Cfg.LANE.y+5);
        ctx.moveTo(lx+5, Cfg.LANE.y-5); ctx.lineTo(lx-5, Cfg.LANE.y+5);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,213,79,0.9)';
        ctx.font = '800 8px -apple-system,sans-serif'; ctx.textAlign='center';
        ctx.fillText(Math.round(landX - Cfg.CASTLE.x) + 'm', lx, Cfg.LANE.y - 9);
        ctx.textAlign='left';
      }
    }
    // watchtower visuals
    if(watchtowerN > 0){
      ctx.fillStyle = P.wood; ctx.fillRect(ax+34, Cfg.CASTLE.baseY-Cfg.CASTLE.towerH-6, 12, 14);
      ctx.fillStyle = P.woodDark; ctx.fillRect(ax+33, Cfg.CASTLE.baseY-Cfg.CASTLE.towerH+6, 14, 4);
    }
    // draw meter over archer
    if(pressing){
      ctx.fillStyle='rgba(10,14,24,0.7)'; ctx.fillRect(ax-16, ay-40, 32, 5);
      ctx.fillStyle= drawPct>=95 ? '#ffd54f' : '#8fd3ff';
      ctx.fillRect(ax-15, ay-39, 30*(drawPct/100), 3);
    }
  }

  function publishDebug(){
    window.ArcherDebug = {
      status: State.status, round: State.round, roundState: State.roundState,
      castleHp: Math.round(State.castleHp), castleMax: State.castleMax, castleTier: State.castleTier,
      archerHp: Math.round(State.archerHp), coins: State.coins, combo: State.combo,
      isBoss: State.isBoss, selArrow: forcedSel, drawPct: State.drawPct,
      enemies: Archer.Enemies.alive(), arrows: Archer.Bow.activeCount(),
      camX: Math.round(Archer.Camera.x),
      allies: Archer.Knights.alive(), sallyReady: Archer.Knights.canSally(),
      knightList: Archer.Knights.all().map(k=>({t:k.type,x:Math.round(k.x),hp:Math.round(k.hp)})),
      arrowList: Archer.Bow.debugList(),
      enemyList: Archer.Enemies.all().map(e=>({t:e.type,x:Math.round(e.x),hp:Math.round(e.hp)})),
      input: Archer.Input.info(), frameMs: +frameMsAvg.toFixed(2), t: +t.toFixed(2), bootOk,
      runCoins: State.runCoins || 0, wavesHeld: State.wavesHeld || 0, bestWave: State.bestWave || 0,
      enemiesLeft: Archer.Enemies.remaining(), runT: +(State.runT || 0).toFixed(1),
      lastShot: { angle: Shot.angle, power: Shot.power, landingX: Shot.landingX, landingT: +Shot.landingT.toFixed(1), slowmo: Shot.slowmo > 0 },
      upgrades: { arrowRain, oil, watchtowerN, moatLevel, knights: Archer.Knights.getLevel() },
    };
  }

  function resize(){
    dpr = Math.min(2, window.devicePixelRatio||1);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
    // M7: live viewport — W/H follow the real canvas so landscape is fully painted (owner fix)
    if(window.Archer && Archer.CFG && Archer.CFG.setView) Archer.CFG.setView(w, h);
  }

  function bindUI(){
    const play = document.getElementById('btn-play');
    if(play) play.addEventListener('click', ()=>{ Archer.Audio.unlock(); start(); });
    const retry = document.getElementById('btn-retry');
    if(retry) retry.addEventListener('click', ()=>{ retryRun(); });
    Archer.Shop.bindContinue();
  }
  function retryRun(){ newRun(State ? State.seed : undefined); }

  function boot(){
    cv = document.getElementById('cv');
    ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', ()=>setTimeout(resize,120));
    Archer.Shop.init(module);
    Archer.UI.init(module);
    Archer.Input.init(cv, module);
    Archer.Controls.create();          // keyboard + mouse, touch, pad, pause, audio unlock, __game hook
    bindUI();
    const h = location.hash||'';
    const seedM = h.match(/seed=(\d+)/);
    const roundM = h.match(/round=(\d+)/);
    if(h.includes('auto')){
      newRun(seedM ? +seedM[1] : undefined);
      if(roundM){ State.round = +roundM[1]; startIncoming(); }
    } else {
      Archer.World.init(seedM ? +seedM[1] : 1);
      State = { status:'menu', round:1, roundState:'idle', castleHp:0, castleMax:1, castleTier:1,
        archerHp:1, archerMax:1, coins: 0, combo:0, isBoss:false, selArrow:'broadhead',
        drawPct:25, bootOk:true, runCoins:0, wavesHeld:0, waveDamage:0, runT:0, bestWave: wallet().best||0 };
      Archer.UI.showMenu();
    }
    requestAnimationFrame(frame);
  }

  const module = { boot, start, retry: retryRun, setPaused, refreshCoach, rawState, sally, selectArrow, cycleArrow,
    shotsFired, lastShotPower, selectedArrow, debugAPI,
    nextRound, applyUpgrade, releaseFire,
    get State(){ return State; } };
  return module;
})();

window.addEventListener('DOMContentLoaded', ()=>Archer.Game.boot());
