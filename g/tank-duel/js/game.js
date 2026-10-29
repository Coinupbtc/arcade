// Tank.Game — boot, loop, campaign, camera, turn machine, pause, hook
Tank.Game = (function(){
  const CFG = Tank.CFG;
  let cv, ctx, dpr = 1;
  let last = 0, t = 0, frameMsAvg = 16;
  let killZoomT = 0;
  let view = {x:0, y:0, scale:1, w:390, h:844};
  let State = null;
  let stage = CFG.STAGES[0];
  let save = loadSave();
  let selected = defaultSelected();
  let aiTimer = 0, aiPhase = 'idle';
  let bootOk = false;
  let resolveWatch = null;
  let lastWind = null, windPulseT = 0, idleT = 0;
  let lastLand = null, missText = '';
  let metrics = {top:120, bottom:700, ground:660};
  let attempts = 0;

  // ------------------------------------------------------------------ save / menu selection
  function loadSave(){
    const def = {unlocked:1, stars:{}, best:{}, bestAll:0};
    try{
      const raw = localStorage.getItem(CFG.SAVE_KEY);
      if(!raw) return def;
      const s = JSON.parse(raw);
      return {unlocked: Math.max(1, Math.min(5, s.unlocked|0 || 1)),
              stars: s.stars || {}, best: s.best || {}, bestAll: s.bestAll|0 || 0};
    }catch(e){ return def; }
  }
  function persist(){
    try{ localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(save)); }catch(e){}
  }
  function defaultSelected(){
    for(let i=0;i<CFG.STAGES.length;i++){
      const n = i+1;
      if(n <= save.unlocked && !(save.stars[n] > 0)) return n;
    }
    return Math.min(5, save.unlocked);
  }

  // ------------------------------------------------------------------ round setup
  function menuState(){
    return { status:'menu', turn:'player', wind:0, shotNo:0, angleDeg:60, powerPct:60,
      selAmmo:'standard', ammoP:{}, ammoE:{}, hpP:CFG.TANK_HP, hpE:stage.enemyHp,
      hpMax:CFG.TANK_HP, hpMaxE:stage.enemyHp, pX:CFG.WORLD_W*0.18, eX:CFG.WORLD_W*0.82,
      dmgDealt:0, shotsFired:0, score:save.bestAll|0, lastShot:null, forfeits:0, shooter:null };
  }

  // A sortie map must give both tanks a fair duel: no tank in a hole, no ridge so tall
  // that no shell can reach the other side. Pick a seed that passes, else take the best.
  function pickMap(cfg, baseSeed){
    const pX = CFG.WORLD_W*0.18, eX = CFG.WORLD_W*0.82;
    let best = null;
    for(let k=0;k<24;k++){
      const seed = (baseSeed + k*2654435761) >>> 0;
      Tank.Terrain.generate(seed, {ridge:cfg.ridge});
      const hp = Tank.Terrain.heightAt(pX), he = Tank.Terrain.heightAt(eX);
      const ridge = Tank.Terrain.ridge();
      let ridgeTop = null;
      if(ridge){
        ridgeTop = 1e9;
        for(let x=ridge.x-ridge.w/2; x<=ridge.x+ridge.w/2; x+=ridge.w/12)
          ridgeTop = Math.min(ridgeTop, Tank.Terrain.heightAt(x));
      }
      const flat = Math.abs(hp - he) <= 95;
      const lowRidge = !ridge || ridgeTop >= Math.min(hp, he) - 90;
      const sol = Tank.Phys.solve(pX, hp-26, eX, 0, Tank.Terrain,
        {aMin:10, aMax:84, pMin:16, pMax:100, dir:1, mass:CFG.AMMO.heavy.mass});
      const reach = sol.err <= 35;
      const score = Math.abs(hp-he) + (sol.err||0);
      if(flat && lowRidge && reach) return seed;
      if(!best || score < best.score) best = {seed, score};
    }
    return best ? best.seed : baseSeed;
  }

  function startStage(n){
    const cfg = CFG.STAGES[Tank.U.clamp((n|0) || 1, 1, CFG.STAGES.length) - 1];
    stage = cfg;
    selected = cfg.n;
    attempts++;
    const baseSeed = ((attempts * 2654435761) ^ (cfg.n * 97)) >>> 0;
    const seed = pickMap(cfg, baseSeed);
    Tank.Terrain.generate(seed, {ridge:cfg.ridge});
    Tank.Shells.clear(); Tank.Units.clear(); Tank.FX.clear();
    Tank.AI.reset(cfg);
    State = {
      status:'playing', turn: cfg.aiFirst ? 'ai' : 'player', wind: (Math.random()*2-1)*cfg.windMax,
      shotNo:0, angleDeg:62, powerPct:42, selAmmo:'standard',
      ammoP:{ standard:Infinity, heavy:CFG.AMMO.heavy.count, drill:CFG.AMMO.drill.count,
              cluster:CFG.AMMO.cluster.count, emp:CFG.AMMO.emp.count },
      ammoE:{ standard:Infinity, heavy:cfg.enemy.heavy||0, drill:cfg.enemy.drill||0,
              cluster:cfg.enemy.cluster||0, emp:cfg.enemy.emp||0 },
      hpP:CFG.TANK_HP, hpE:cfg.enemyHp, hpMax:CFG.TANK_HP, hpMaxE:cfg.enemyHp,
      pX:CFG.WORLD_W*0.18, eX:CFG.WORLD_W*0.82,
      dmgDealt:0, shotsFired:0, score:0, lastShot:null, forfeits:0, shooter:null,
      clockLeft:cfg.clock, clockMax:cfg.clock,
    };
    aiTimer = 0; aiPhase = 'idle'; killZoomT = 0; idleT = 0; windPulseT = 0;
    lastWind = State.wind; lastLand = null; missText = ''; resolveWatch = null;
    Tank.Input.resetDrag();
    Tank.UI.hideMenu(); Tank.UI.hideVerdict(); Tank.UI.showPause(false);
    document.getElementById('aim-hint').classList.remove('faded');
    layout(); updateCamera(true);
    if(cfg.aiFirst){
      aiPhase = 'aiming'; aiTimer = 1.1;
      Tank.UI.toast('SORTIE ' + cfg.n + ' — ' + cfg.name + ': the AI shoots first', 2600);
    } else {
      Tank.UI.toast('SORTIE ' + cfg.n + ' — ' + cfg.name + ': your turn', 2200);
    }
  }

  function toMenu(){
    stage = CFG.STAGES[selected-1] || CFG.STAGES[0];
    State = menuState();
    Tank.Shells.clear(); Tank.Units.clear(); Tank.FX.clear(); Tank.AI.reset(stage);
    Tank.Terrain.generate(20261026 + selected*13, {ridge:stage.ridge});
    aiPhase = 'idle'; killZoomT = 0; lastLand = null; missText = '';
    Tank.UI.showPause(false); Tank.UI.hideVerdict();
    Tank.UI.showMenu(save, selected);
    layout(); updateCamera(true);
  }

  function nextStage(){
    const n = stage.n + 1;
    if(n <= CFG.STAGES.length && n <= save.unlocked) startStage(n);
    else startStage(stage.n);
  }

  // ------------------------------------------------------------------ layout + camera
  function layout(){
    const topEl = document.getElementById('hud-top');
    const botEl = document.getElementById('hud-bottom');
    const hudOn = State && State.status !== 'menu';
    if(hudOn && topEl && botEl){
      const tr = topEl.getBoundingClientRect(), br = botEl.getBoundingClientRect();
      metrics.top = Math.max(90, tr.bottom + 4);
      metrics.bottom = Math.min(view.h - 40, br.top - 6);
    } else {
      metrics.top = view.h * 0.14;
      metrics.bottom = view.h * 0.84;
    }
    if(metrics.bottom - metrics.top < 120) metrics.bottom = metrics.top + 120;
  }

  function updateCamera(snap){
    if(!State) return;
    const midX = (State.pX + State.eX) / 2;
    const dist = Math.abs(State.eX - State.pX);
    let s = Tank.U.clamp(view.w / (dist + 150), 0.42, 1.15);
    let cx = midX;
    if(killZoomT > 0){
      killZoomT = Math.max(0, killZoomT - 1/60);
      const loserX = State.hpP <= 0 ? State.pX : State.eX;
      cx = Tank.U.lerp(midX, loserX, 0.55);
      s = Math.min(1.25, s * CFG.FX.KILL_ZOOM);
    }
    const groundScreen = metrics.bottom - 8;             // ground sits just above the controls
    // Frame the LOWEST tank, not the average: on a hilly map the enemy stood below the
    // average and was half hidden behind the power bar / FIRE row (playtest 2026-10-27).
    const groundMid = Math.max(Tank.Terrain.heightAt(State.pX), Tank.Terrain.heightAt(State.eX)) + 18;
    let x = cx - view.w / (2*s);
    x = Tank.U.clamp(x, -40, CFG.WORLD_W - view.w/s + 40);
    const y = groundMid - groundScreen / s;
    const tv = {scale:s, x, y};
    if(snap){ view.scale = tv.scale; view.x = tv.x; view.y = tv.y; }
    else {
      const k = killZoomT > 0 ? 0.18 : 0.08;
      view.scale = Tank.U.lerp(view.scale, tv.scale, k);
      view.x = Tank.U.lerp(view.x, tv.x, k);
      view.y = Tank.U.lerp(view.y, tv.y, k);
    }
  }

  function resize(){
    dpr = Math.min(1.5, window.devicePixelRatio || 1);   // 2x on a phone costs 44% more fill for no readable gain
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
    view.w = w; view.h = h;
    layout();
    if(State) updateCamera(false);
  }

  // ------------------------------------------------------------------ aiming + firing
  function canAim(){
    return !!State && State.status === 'playing' && State.turn === 'player';
  }
  function adjustAim(dAng, dPow){
    if(!canAim()) return;
    State.angleDeg = Tank.U.clamp(State.angleDeg + dAng, CFG.ANGLE_MIN, CFG.ANGLE_MAX);
    State.powerPct = Tank.U.clamp(State.powerPct + dPow, CFG.POWER_MIN, CFG.POWER_MAX);
  }
  function selectAmmo(k){
    if(!State || !State.ammoP || !CFG.AMMO[k] || CFG.AMMO[k].hidden) return;
    if(State.turn !== 'player' || State.status !== 'playing'){ return; }
    const def = CFG.AMMO[k];
    if(!def.infinite && State.ammoP[k] <= 0){ Tank.UI.toast('No ' + def.name + ' rounds left'); return; }
    State.selAmmo = k;
  }
  function selectAmmoByIndex(i){
    const keys = Object.keys(CFG.AMMO).filter(k=>!CFG.AMMO[k].hidden);
    if(i >= 0 && i < keys.length) selectAmmo(keys[i]);
  }
  function cycleAmmo(dir){
    if(!State || State.status !== 'playing') return;
    const keys = Object.keys(CFG.AMMO).filter(k=>!CFG.AMMO[k].hidden);
    let i = keys.indexOf(State.selAmmo);
    for(let s=0;s<keys.length;s++){
      i = (i + dir + keys.length) % keys.length;
      if(CFG.AMMO[keys[i]].infinite || State.ammoP[keys[i]] > 0){ selectAmmo(keys[i]); return; }
    }
  }

  function fire(){
    if(!canAim()) return;
    let k = State.selAmmo, def = CFG.AMMO[k];
    if(!def.infinite){
      if(State.ammoP[k] <= 0){
        // The last special round used to leave the empty chip selected: FIRE did nothing and
        // the shot clock burned the whole turn (playtest 2026-10-27: 39 turns).
        Tank.UI.toast('OUT OF ' + def.name + ' — STANDARD SELECTED', 1600);
        k = 'standard'; def = CFG.AMMO[k];
      } else {
        State.ammoP[k]--;
      }
      State.selAmmo = k;
      if(!def.infinite && State.ammoP[k] <= 0) State.selAmmo = 'standard';
    }
    idleT = 0;
    const a = State.angleDeg * Math.PI/180;
    const meY = Tank.Terrain.heightAt(State.pX) - 26;
    Tank.Shells.spawn(k, State.pX + Math.cos(a)*30, meY - Math.sin(a)*30, State.angleDeg, State.powerPct);
    Tank.Units.addFlash(State.pX + Math.cos(a)*32, meY - Math.sin(a)*32, 10);
    Tank.Units.addShake(3);
    Tank.FX.whistle(flightEstimate(State.pX, State.eX, State.angleDeg, State.powerPct));
    State.shooter = 'player'; State.turn = 'resolving'; State.shotNo++; State.shotsFired++;
    Tank.Shells.whenResolved(()=>resolvePlayerShot());
  }

  function flightEstimate(fromX, toX, angleDeg, powerPct){
    const v0 = Tank.Phys.muzzleVel(powerPct), a = angleDeg*Math.PI/180;
    const vy = -Math.sin(a)*v0;
    const dy = Tank.Terrain.heightAt(toX) - (Tank.Terrain.heightAt(fromX) - 26 - Math.sin(a)*30);
    const disc = vy*vy + 2*CFG.GRAVITY*Math.max(0, dy);
    return Math.max(0.4, Math.min(3.4, (-vy + Math.sqrt(Math.max(0,disc))) / CFG.GRAVITY + 0.15));
  }

  function windShift(){
    State.wind = Tank.U.clamp(State.wind + (Math.random()*2-1)*CFG.WIND_CHANGE, -stage.windMax, stage.windMax);
  }

  function resolvePlayerShot(){
    if(!State || State.status !== 'playing') return;
    windShift();
    if(State.hpE > 0){
      State.turn = 'ai'; aiPhase = 'aiming'; aiTimer = CFG.AI.thinkMs/1000;
      State.clockLeft = stage.clock;
    }
    resolveWatch = null;
  }

  function aiFire(){
    let kind = Tank.AI.pickAmmo(State);
    const plan = Tank.AI.aim(State, Tank.Terrain, (CFG.AMMO[kind]||CFG.AMMO.standard).mass);
    if(!CFG.AMMO[kind].infinite){
      if(State.ammoE[kind] > 0) State.ammoE[kind]--;
      else kind = 'standard';
    }
    const ang = 180 - plan.angleDeg;              // AI fires leftward
    const meY = Tank.Terrain.heightAt(State.eX) - 26;
    Tank.Shells.spawn(kind, State.eX + Math.cos(ang*Math.PI/180)*30,
      meY - Math.sin(ang*Math.PI/180)*30, ang, plan.powerPct);
    Tank.Units.addFlash(State.eX + Math.cos(ang*Math.PI/180)*32,
      meY - Math.sin(ang*Math.PI/180)*32, 10);
    Tank.Units.addShake(3);
    Tank.FX.whistle(flightEstimate(State.eX, State.pX, ang, plan.powerPct));
    State.shooter = 'ai'; State.shotNo++;
    State.lastShot = {angleDeg:plan.angleDeg, powerPct:plan.powerPct, ammo:kind, err:Tank.AI.info()};
    Tank.Shells.whenResolved(()=>resolveAiShot());
  }

  function resolveAiShot(){
    if(!State || State.status !== 'playing') return;
    windShift();
    if(State.hpP > 0){
      State.turn = 'player';
      State.clockLeft = stage.clock;
      Tank.UI.toast('YOUR TURN — ' + Math.round(State.clockLeft) + 's on the clock', 1500);
    }
    resolveWatch = null;
  }

  // watchdog: a hung salvo must never lock the turn
  function updateResolveWatch(dt){
    if(!State || State.status !== 'playing') return;
    const inFlight = Tank.Shells.active() > 0;
    if((State.turn === 'resolving' || State.turn === 'ai') && inFlight){
      resolveWatch = (resolveWatch || 0) + dt;
      if(resolveWatch > 9){
        Tank.Shells.clear();
        if(State.shooter === 'player') resolvePlayerShot(); else resolveAiShot();
      }
    } else resolveWatch = null;
  }

  // ------------------------------------------------------------------ impact
  function onImpact(ev){
    const def = CFG.AMMO[ev.kind] || CFG.AMMO.standard;
    const shooter = State.shooter;
    if(ev.prop) Tank.Terrain.damageProp(ev.prop, def.dmg*1.6);
    if(!ev.offworld){
      Tank.Terrain.carve(ev.x, Math.max(CFG.CRATER_MIN, def.r*0.8));
      Tank.Terrain.addScorch(ev.x, def.r*0.9);
      const kickX = ev.x > (State.pX+State.eX)/2 ? 1 : -1;
      if(def.stun){
        Tank.FX.empBlast(ev.x, ev.y, def.r);
        Tank.Units.addShake(Math.min(11, 3+def.r/9), kickX*0.4, -1);
      } else if(ev.internal){
        Tank.FX.dirtJet(ev.x, ev.y);
        Tank.FX.explosion(ev.x, ev.y, ev.kind, {dirAway:{x:-kickX,y:-1}, bomblet:!!ev.bomblet});
      } else {
        Tank.FX.explosion(ev.x, ev.y, ev.kind, {dirAway:{x:-kickX*0.6, y:-1}, bomblet:!!ev.bomblet});
      }
      Tank.Units.addDebris(ev.x, ev.y, '#7a5a3a', 8);
    }
    // spotter data
    if(shooter === 'player'){
      lastLand = {x:ev.x, y:ev.y};
      const miss = ev.x - State.eX;
      if(ev.offworld) missText = 'OFF MAP';
      else missText = Math.abs(Math.round(miss)) + ' ' + (Math.abs(miss) < 8 ? 'ON TARGET' : (miss < 0 ? 'SHORT' : 'LONG'));
    } else if(shooter === 'ai'){
      Tank.AI.observeLanding(ev.x);
    }
    // splash damage on the opposing tank
    const tg = shooter === 'player'
      ? {x:State.eX, hp:'hpE', who:'E'}
      : {x:State.pX, hp:'hpP', who:'P'};
    if(!ev.offworld){
      const d = Math.abs(tg.x - ev.x), R = def.r*1.15;
      if(d < R){
        let dmg = def.dmg * (1 - 0.5*d/R);
        if(ev.internal) dmg *= 1.15;
        // The AI's hits are softened on the late sorties: a fixed 100 hull against an AI that
        // fires first and can one-shot with a heavy shell made S4/S5 a coin flip
        // (playtest 2026-10-28: bot lost S5 9/9, dead after 2-4 of its own shots).
        if(shooter === 'ai') dmg *= (stage.enemyDmgMul || 1);
        const before = State[tg.hp];
        State[tg.hp] = Math.max(0, State[tg.hp] - dmg);
        const applied = Math.round(before - State[tg.hp]);
        if(applied > 0){
          const gy = Tank.Terrain.heightAt(tg.x);
          Tank.Units.notifyDamage(tg.who, tg.x, gy-34, applied);
          Tank.Units.hpFlash(tg.who);
          if(shooter === 'player') State.dmgDealt += applied;
        }
        if(def.stun && shooter === 'player' && tg.who === 'E') Tank.AI.stun();
      }
    }
    State.score = Math.round(State.dmgDealt*10);
    if((State.hpP <= 0 || State.hpE <= 0) && State.status === 'playing'){
      killZoomT = CFG.FX.KILL_ZOOM_HOLD;
      Tank.Units.slowmoStart();
      const winner = State.hpE <= 0 && State.hpP > 0;
      setTimeout(()=>endRound(winner), 1150);
    }
  }

  function endRound(win){
    if(!State || State.status !== 'playing') return;
    State.status = 'over';
    const hpP = Math.max(0, State.hpP);
    const stars = win ? (hpP >= 70 ? 3 : hpP >= 35 ? 2 : 1) : 0;
    const score = Math.round(State.dmgDealt*10 + (win ? 400 + hpP*4 : hpP*2));
    const prevBest = save.best[stage.n] || 0;
    const newBest = score > prevBest;
    save.best[stage.n] = Math.max(prevBest, score);
    save.bestAll = Math.max(save.bestAll|0, save.best[stage.n]);
    save.stars[stage.n] = Math.max(save.stars[stage.n]||0, stars);
    if(win) save.unlocked = Math.max(save.unlocked|0, Math.min(CFG.STAGES.length, stage.n+1));
    persist();
    State.score = score;
    State.lastWin = !!win;
    Tank.UI.showVerdict({win, stage:stage.n, stars, score, best:save.best[stage.n], newBest,
      hpP, dmg:State.dmgDealt, shots:State.shotsFired});
  }

  // ------------------------------------------------------------------ pause / actions
  function stateName(){
    if(!State) return 'menu';
    if(State.status === 'menu') return 'menu';
    if(State.status === 'paused') return 'paused';
    if(State.status === 'over') return 'over';
    return 'play';
  }
  function setPaused(on){
    if(!State || (State.status !== 'playing' && State.status !== 'paused')) return;
    if(on && State.status === 'playing'){
      State.status = 'paused';
      Tank.UI.showPause(true);
    } else if(!on && State.status === 'paused'){
      State.status = 'playing';
      Tank.UI.showPause(false);
      layout(); updateCamera(false);
    }
  }
  function togglePause(){ setPaused(State && State.status !== 'paused'); }
  function confirmPrimary(){
    const s = stateName();
    if(s === 'over'){
      // On a win, Enter/Space/A advances to the next sortie. It used to restart the same one,
      // so a keyboard or pad player could never reach NEXT SORTIE (playtest 2026-10-28).
      if(State && State.lastWin && (selected|0) < CFG.STAGES.length){ nextStage(); return; }
      start(); return;
    }
    if(s === 'menu') start();
    else if(s === 'paused') setPaused(false);
    else if(s === 'play') fire();
  }
  function backAction(){
    const s = stateName();
    if(s === 'play') setPaused(true);
    else if(s === 'paused') setPaused(false);
    else if(s === 'over') toMenu();
  }
  function menuStep(d){
    if(stateName() !== 'menu') return;
    const max = Math.min(CFG.STAGES.length, save.unlocked|0 || 1);
    selected = Tank.U.clamp((selected|0 || 1) + d, 1, Math.max(1, max));
    Tank.UI.showMenu(save, selected);
  }
  function selectStage(n){
    if(n > (save.unlocked|0 || 1)){ Tank.UI.toast('Clear sortie ' + (save.unlocked|0 || 1) + ' to unlock this one'); return; }
    selected = Tank.U.clamp(n|0, 1, CFG.STAGES.length);
    Tank.UI.showMenu(save, selected);
  }
  function start(){ startStage(selected); }
  function firstDrag(){ Tank.UI.hideHint(); }

  // ------------------------------------------------------------------ frame
  function uiPulse(dt){
    if(State.wind !== lastWind){
      if(lastWind !== null && Math.abs(State.wind - lastWind) > 0.01) windPulseT = 1.2;
      lastWind = State.wind;
    }
    if(State.turn === 'player' && State.status === 'playing') idleT += dt; else idleT = 0;
    windPulseT = Math.max(0, windPulseT - dt);
    return {windPulse: windPulseT > 0, idle: idleT >= CFG.FX.IDLE_NUDGE_S};
  }

  function frame(ts){
    requestAnimationFrame(frame);
    if(!last) last = ts;
    let dt = Math.min(0.05, (ts - last)/1000); last = ts; t += dt;
    frameMsAvg = frameMsAvg*0.95 + dt*1000*0.05;
    try{
      if(!State) return;
      const inp = Tank.Input.tick(dt);
      if(State.status === 'playing'){
        adjustAim(inp.dAngle, inp.dPower);
        if(State.turn === 'player'){
          State.clockLeft -= dt;
          if(State.clockLeft <= 0){
            State.forfeits++;
            Tank.UI.toast('OUT OF TIME — turn forfeited', 1800);
            State.turn = 'ai'; aiPhase = 'aiming'; aiTimer = 0.6;
            State.clockLeft = 0;
          }
        }
        const hs = Tank.FX.hitStopScale();
        const sdt = dt * hs * (Tank.Units.slowmoActive() ? Tank.Units.slowmoUpdate(dt) : 1);
        Tank.Shells.update(sdt, Tank.Terrain, shellEvent);
        Tank.Terrain.updateProps(sdt);
        Tank.FX.update(sdt);
        Tank.Units.update(sdt, State);
        if(aiPhase === 'aiming'){ aiTimer -= dt; if(aiTimer <= 0){ aiPhase = 'idle'; aiFire(); } }
        updateResolveWatch(dt);
        updateCamera(false);
      }
      render();
      Tank.UI.update(State.status === 'menu' ? null : State, uiPulse(dt), {
        score: State.score || 0, stage: stage.n, clockLeft: State.clockLeft||0,
        clockMax: State.clockMax||stage.clock, sightFull: stage.preview >= 60,
        sightPct: Math.round(stage.preview/60*100), missText
      });
      publishDebug();
      bootOk = true;
    }catch(err){
      window.__errs.push('frame: ' + (err && err.message));
    }
  }

  function render(){
    const so = Tank.Units.shakeOffset();
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,view.w,view.h);
    ctx.save();
    ctx.translate(so.x, so.y);
    Tank.FX.drawUnder(ctx, view);
    Tank.Terrain.draw(ctx, view, t);
    if(State.status === 'playing' && State.turn === 'player') drawAimArc();
    if(lastLand && State.status !== 'menu') drawLastLand();
    Tank.Units.drawTank(ctx, view, State.pX, State.angleDeg, State.hpP, true, State.hpMax);
    const aiAng = State.lastShot ? 180 - State.lastShot.angleDeg : 120;
    Tank.Units.drawTank(ctx, view, State.eX, aiAng, State.hpE, false, State.hpMaxE);
    Tank.Units.drawShotAndTrail(ctx, view);
    Tank.FX.drawOver(ctx, view);
    ctx.restore();
  }

  function drawAimArc(){
    const a = State.angleDeg*Math.PI/180;
    const meY = Tank.Terrain.heightAt(State.pX) - 26;
    const pts = Tank.Phys.ballisticPreview(State.pX, meY, State.angleDeg, State.powerPct, State.wind, 60, 1, Tank.Terrain, CFG.AMMO[State.selAmmo].mass);
    const n = Math.min(pts.length, stage.preview);
    for(let i=0;i<n;i++){
      const p = pts[i];
      const frac = i/Math.max(1,n-1);
      ctx.globalAlpha = 0.75*(1-frac*0.75);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc((p.x-view.x)*view.scale, (p.y-view.y)*view.scale, Math.max(1.8, 2.6*view.scale), 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // muzzle reference: a short bright tick where the barrel points
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc((State.pX + Math.cos(a)*36 - view.x)*view.scale,
            (meY - Math.sin(a)*36 - view.y)*view.scale, 2.4, 0, 7);
    ctx.fill();
  }

  function drawLastLand(){
    const sx = (lastLand.x - view.x)*view.scale, sy = (lastLand.y - view.y)*view.scale;
    ctx.strokeStyle = 'rgba(255,213,79,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx-5, sy-5); ctx.lineTo(sx+5, sy+5);
    ctx.moveTo(sx+5, sy-5); ctx.lineTo(sx-5, sy+5); ctx.stroke();
  }

  function shellEvent(ev){
    if(ev.type === 'trail'){ Tank.Units.addTrail(ev.x, ev.y, ev.kind); }
    else if(ev.type === 'impact'){ onImpact(ev); }
    else if(ev.type === 'burrow'){ Tank.Units.addFlash(ev.x, ev.y, 6); }
    else if(ev.type === 'split'){ Tank.Units.addFlash(ev.x, ev.y, 12); }
  }

  // ------------------------------------------------------------------ hook + debug
  function publishDebug(){
    window.TankDebug = {
      status:State.status, turn:State.turn, angleDeg:+State.angleDeg.toFixed(1),
      powerPct:+State.powerPct.toFixed(1), hpP:Math.round(State.hpP), hpE:Math.round(State.hpE),
      wind:+State.wind.toFixed(2), shotNo:State.shotNo, selAmmo:State.selAmmo,
      ammoP:Object.assign({}, State.ammoP), lastShot:State.lastShot, aiPhase,
      shots:Tank.Shells.active(), t:+t.toFixed(2), bootOk, frameMs:+frameMsAvg.toFixed(2),
      stage:stage.n, score:State.score, clock:+((State.clockLeft||0)).toFixed(1),
      sight:stage.preview, miss:missText, paused:State.status==='paused',
    };
  }

  function solveFor(x){
    if(!State) return null;
    const my = Tank.Terrain.heightAt(State.pX) - 26;
    const sol = Tank.Phys.solve(State.pX, my, Tank.U.clamp(x, 40, CFG.WORLD_W-40),
      State.wind, Tank.Terrain, {aMin:10, aMax:84, pMin:16, pMax:100, dir:1,
                                 mass:(CFG.AMMO[State.selAmmo]||CFG.AMMO.standard).mass});
    return {angleDeg: Math.round(sol.angleDeg*10)/10, powerPct: Math.round(sol.powerPct*10)/10,
            err: Math.round(sol.err), landX: Math.round(sol.landX)};
  }

  function installHook(){
    const g = {
      get state(){ return stateName(); },
      get score(){ return (State && typeof State.score === 'number') ? State.score : 0; },
      start(){ start(); },
      get player(){ return State ? {x:State.pX, y:Tank.Terrain.heightAt(State.pX)} : {x:0,y:0}; },
      get angle(){ return State ? State.angleDeg : 0; },
      get power(){ return State ? State.powerPct : 0; },
      get ammo(){ return State ? State.selAmmo : 'standard'; },
      get shots(){ return State ? State.shotsFired : 0; },
      get fired(){ return State ? State.shotsFired : 0; },
      get hits(){ return State ? Math.round(State.dmgDealt) : 0; },
      get turn(){ return State ? State.turn : 'player'; },
      get wind(){ return State ? State.wind : 0; },
      get stage(){ return stage.n; },
      get stageName(){ return stage.name; },
      get unlocked(){ return save.unlocked|0 || 1; },
      get stars(){ return (save.stars || {})[stage.n] || 0; },
      get best(){ return (save.best || {})[stage.n] || 0; },
      get hpP(){ return State ? Math.round(State.hpP) : 100; },
      get hpE(){ return State ? Math.round(State.hpE) : 0; },
      get hpMaxE(){ return stage.enemyHp; },
      get enemyX(){ return State ? State.eX : 0; },
      get playerX(){ return State ? State.pX : 0; },
      get clock(){ return State ? +(State.clockLeft||0).toFixed(1) : 0; },
      get paused(){ return State ? State.status === 'paused' : false; },
      get forfeits(){ return State ? State.forfeits : 0; },
      ui(){ return Tank.UI.rects(); },
      framebox(){ return {hudTop: metrics.top, hudBottom: metrics.bottom,
        groundScreenY: metrics.bottom - 8, viewH: view.h}; },
      solve(x){ return solveFor(x); },
      pause(){ setPaused(true); },
      resume(){ setPaused(false); },
      selectStage(n){ selectStage(n); },
      startStage(n){ startStage(n); },
      toMenu(){ toMenu(); },
      aimTo(angleDeg, powerPct){
        if(!State) return;
        State.angleDeg = Tank.U.clamp(+angleDeg||0, CFG.ANGLE_MIN, CFG.ANGLE_MAX);
        State.powerPct = Tank.U.clamp(+powerPct||0, CFG.POWER_MIN, CFG.POWER_MAX);
      },
    };
    window.__game = g;
  }

  // ------------------------------------------------------------------ boot
  function boot(){
    cv = document.getElementById('cv');
    ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', ()=>setTimeout(resize, 120));
    Tank.UI.init(module);
    Tank.UI.bind(module);
    Tank.Input.init(cv, module);
    Tank.UI.setDevice(Tank.Input.deviceNow());
    Tank.Terrain.generate(20261026 + selected*13, {ridge:CFG.STAGES[selected-1].ridge});
    State = menuState();
    stage = CFG.STAGES[selected-1];
    layout(); updateCamera(true);
    Tank.UI.showMenu(save, selected);
    installHook();
    document.addEventListener('visibilitychange', ()=>{
      if(document.hidden && State && State.status === 'playing') setPaused(true);
    });
    window.addEventListener('blur', ()=>{
      if(State && State.status === 'playing') setPaused(true);
    });
    // hash routes for dev tools: #stage=3 starts there, #auto starts, #seed ignored (maps are per attempt)
    const h = location.hash || '';
    const sm = h.match(/stage=(\d+)/);
    if(sm){ selected = Tank.U.clamp(+sm[1], 1, CFG.STAGES.length); startStage(selected); }
    else if(h.includes('auto')) startStage(selected);
    requestAnimationFrame(frame);
  }

  const module = { boot, start, startStage, nextStage, toMenu, adjustAim, selectAmmo,
    selectAmmoByIndex, cycleAmmo, fire, setPaused, togglePause, confirmPrimary, backAction,
    menuStep, selectStage, firstDrag, canAim, stateName, toast:(m,ms)=>Tank.UI.toast(m,ms),
    onDevice:(d)=>Tank.UI.setDevice(d), wind:()=>State?State.wind:0,
    get State(){ return State; }, view:()=>view };
  return module;
})();

window.addEventListener('DOMContentLoaded', ()=>Tank.Game.boot());
