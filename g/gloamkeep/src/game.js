/* GLOAMKEEP — game state, wave machine, loop. */
window.GK = window.GK || {};

(function () {
  const C = GK.CFG;

  let S = null;
  let canvas = null, ctx = null;
  let dpr = 1, last = 0;
  let dprCap = 2, dprTarget = 2;      // adaptive resolution: fill is the cost on a busy phone
  let dprCeiling = 2;                 // a level that measured under 36 fps is never retried
  let fpsAcc = 0, fpsN = 0, goodWin = 0;

  GK.W = 390; GK.H = 844;

  function reset() {
    S = {
      status: 'menu',
      wave: 0,
      gold: C.START_GOLD,
      lives: C.START_LIVES,
      speed: 1,
      paused: false,
      prepT: C.PREP,
      groups: [],
      banner: '', bannerT: 0,
      selected: null,
      buildMode: null,
      best: +(localStorage.getItem('gloamkeep_best') || 0),
      bestLight: +(localStorage.getItem('gloamkeep_best_light') || 0),   // best light left in a win
      kills: 0, leaks: 0,
      time: 0,
      toast: '', toastT: 0,
      waveTotal: 0,
      waveKilled: 0,
      muted: false,
      bossSeen: 0,
      cursorC: 4, cursorR: 10,      // tile cursor: keyboard / pad build aim. It starts on a
                                    // buildable tile beside the causeway, never on the road.
      danger: 0,                    // 0..1: how close the leading foe is to the gate (edge glow)
      leakFlash: 0,                 // red edge pulse after a foe reaches the keep
      streak: 0, streakT: 0, bestStreak: 0,
      heat: 0, heatCool: 0,        // KEEP HEAT: streak steps -> real fire-rate bonus (see C.HEAT)
      coach: 0, coachT: 0,          // first-run coach: 0 tap a tower, 1 tap a tile, 2 upgrade, 3 flare
      flareUsed: false,
      flareCd: 0, flareFlash: 0,    // the keep lantern's active verb
      hitStop: 0                    // seconds of frozen world after a kill (weight, not a bug)
    };
    GK.Towers.reset();
    GK.Enemies.reset();
    GK.FX.reset();
    GK.World.reset();
  }

  function banner(text, t) { S.banner = text; S.bannerT = t || 1.8; }
  function toast(text, col) { S.toast = text; S.toastT = 1.7; S.toastCol = col || null; }

  function startRun() {
    reset();
    // headless logic suites load game.js without input.js: guard rather than assume the shell
    const inp = GK.Input && GK.Input.frame ? GK.Input.frame() : null;
    if (inp) inp.pause.reset();     // a pause from the last run must not report on this one
    S.status = 'prep';
    S.wave = 1;
    S.prepT = C.PREP;
    banner('WAVE 1 INCOMING', 2.2);
    GK.Audio.play('horn');
    if (GK.Input && GK.Input.syncMenu) GK.Input.syncMenu();
  }

  function startWave() {
    const def = C.WAVES[S.wave - 1];
    S.groups = def.map(g => ({ t: g.t, left: g.n, gap: g.gap, gapT: 0, delay: g.delay || 0 }));
    S.waveTotal = def.reduce((a, g) => a + g.n, 0);
    S.waveKilled = 0;
    S.status = 'wave';
    S.prepT = 0;
    banner('WAVE ' + S.wave, 1.6);
    const notice = C.NOTICES && C.NOTICES[S.wave];
    if (notice) toast(notice, '#ff9a9a');
    GK.Audio.play('horn');
  }

  function clearWave() {
    const bonus = C.WAVE_BONUS + S.wave * C.WAVE_BONUS_PER;
    addGold(bonus);
    GK.FX.text(GK.World.gate.x, GK.World.gate.y - 28, '+' + bonus, C.PAL.gold);
    GK.Audio.play('coin');
    if (S.wave >= C.WAVES.length) {
      S.status = 'win';
      S.best = Math.max(S.best, S.wave);
      localStorage.setItem('gloamkeep_best', String(S.best));
      // the run's grade is the light you kept, not a made-up score: it is what the next run beats
      if (S.lives > S.bestLight) {
        S.bestLight = S.lives;
        localStorage.setItem('gloamkeep_best_light', String(S.bestLight));
      }
      GK.Audio.play('win');
      banner('THE LIGHT HOLDS', 3);
    } else {
      const held = S.wave;
      S.wave++;
      S.status = 'prep';
      S.prepT = C.PREP;
      // celebrate the clear, not just the next alarm: the strip and the bar already count the
      // next wave down, so the banner can carry the reward
      banner('WAVE ' + held + ' CLEARED  \u00b7  +' + bonus + ' EMBERS', 2.2);
    }
  }

  function addGold(n) { S.gold += n; }

  /** one kill: score, streak window, the audio tick that rises with the streak, and KEEP HEAT */
  function countKill() {
    S.kills++;
    S.waveKilled++;
    S.streak++;
    S.streakT = C.STREAK_WINDOW;
    if (S.streak > S.bestStreak) S.bestStreak = S.streak;
    if (S.streak >= 3) GK.Audio.play('tick', S.streak);
    // KEEP HEAT: one step per kill in the chain, capped. Steps stay warm (update() cools them one
    // at a time) and each cuts FLARE's recharge by C.HEAT.flareCut, so a long chain buys more of
    // the verb that strips armour. Measured effect, not a display number.
    const before = S.heat;
    const h = Math.min(C.HEAT.max, Math.max(S.heat, S.streak));
    if (h > before) GK.Audio.play('heat', h);
    S.heat = h;
    S.heatCool = C.HEAT.cool;
    if (h === C.HEAT.max && before < C.HEAT.max) {
      toast('FULL HEAT — FLARE RECHARGES 40% FASTER', C.PAL.gold);
    }
  }

  /** freeze the world for a moment. Weight on a hit, never a stall: capped at a quarter second. */
  function hitStop(sec) {
    S.hitStop = Math.min(0.26, Math.max(S.hitStop, sec || 0.03));
  }
  function leak(n) {
    S.lives -= n;
    S.leaks += n;
    S.leakFlash = 0.55;                 // red edge pulse: the screen says the keep was hit
    // a leak breaks the chain and cools the keep: the heat bonus is gone until the next chain
    S.streak = 0; S.streakT = 0; S.heat = 0; S.heatCool = 0;
    toast('LEAK \u2212' + n + ' \u00b7 LIGHT ' + Math.max(0, S.lives), '#ff6b6b');
    if (S.lives <= 0) {
      S.lives = 0;
      S.status = 'over';
      S.best = Math.max(S.best, S.wave - 1);
      localStorage.setItem('gloamkeep_best', String(S.best));
      GK.Audio.play('lose');
    }
  }

  function sendEarly() {
    if (S.status !== 'prep') return;
    const bonus = Math.ceil(S.prepT) * 2;
    addGold(bonus);
    GK.FX.text(GK.World.gate.x, GK.World.gate.y - 34, '+' + bonus, C.PAL.gold);
    startWave();
  }

  /** pick the previous / next tower while nothing is selected: the pad has no shop row, so LT / RT
   *  are the pad's tower picker (B stays a pure cancel, keys 1-4 are unchanged). */
  function cycleBuild(dir) {
    if (S.status !== 'prep' && S.status !== 'wave') return;
    const order = Object.keys(C.TOWERS);
    const cur = S.buildMode ? order.indexOf(S.buildMode) : (dir > 0 ? -1 : 0);
    for (let i = 1; i <= order.length; i++) {
      const idx = ((cur + dir * i) % order.length + order.length) % order.length;
      const type = order[idx];
      if (S.gold >= C.TOWERS[type].cost) {
        S.buildMode = type;
        S.selected = null;
        if (S.coach === 0) S.coach = 1;
        toast(C.TOWERS[type].short + ' ARMED — TAP A TILE', C.TOWERS[type].accent);
        GK.Audio.play('tap');
        return;
      }
    }
    toast('NOT ENOUGH EMBERS'); GK.Audio.play('deny');
  }

  function toggleSpeed() { S.speed = S.speed === 1 ? 2 : 1; }
  function togglePause() { GK.Input.togglePause(); }
  function toggleMute() { S.muted = GK.Audio.toggle(); }

  /** the keep's lantern: mark every foe on the field. The one verb you use while a wave runs.
   *  It never spends its charge on an empty moor: the playtester burnt it with 0 foes, got no
   *  warning and lost 12 s of cooldown for nothing. Now the press is held and the slot stays full. */
  function flare() {
    if (S.status !== 'wave') { toast('FLARE ONLY DURING A WAVE', C.PAL.stoneLit); GK.Audio.play('deny'); return false; }
    if (S.flareCd > 0) {
      toast('LANTERN RECHARGING ' + Math.ceil(S.flareCd) + 's', C.PAL.stoneLit);
      GK.Audio.play('deny');
      return false;
    }
    let foes = 0;
    for (const e of GK.Enemies.list()) if (!e.dead) foes++;
    if (!foes) {
      toast('FLARE HELD \u00b7 NO FOES ON THE MOOR', C.PAL.stoneLit);
      GK.Audio.play('deny');
      return false;
    }
    let n = 0;
    for (const e of GK.Enemies.list()) {
      if (e.dead) continue;
      GK.Enemies.applyMark(e, C.FLARE.mark);
      GK.FX.burst(e.x, e.y, 4, [C.PAL.gold, C.PAL.goldLit], { speed: 20, grav: 0, life: 0.4 });
      n++;
    }
    S.flareCd = C.FLARE.cd * (1 - C.HEAT.flareCut * S.heat);
    S.flareFlash = C.FLARE.flash;
    S.flareUsed = true;
    GK.FX.ring(GK.World.gate.x, GK.World.gate.y - 26, 150, C.PAL.gold);
    GK.FX.shakeAdd(S.lives <= 5 ? 0.9 : 0.5);
    GK.Audio.play('flare');
    toast(n ? 'FLARE · ' + n + ' MARKED · NO ARMOUR' : 'FLARE · NO FOES YET', C.PAL.gold);
    return true;
  }

  // ---- tile cursor (keyboard / pad) ---------------------------------------
  function setCursorTile(c, r) {
    S.cursorC = Math.max(0, Math.min(C.COLS - 1, c | 0));
    S.cursorR = Math.max(0, Math.min(C.ROWS - 1, r | 0));
  }
  /** one tile step. A cursor never parks on the road or on decor: it slides to the next legal tile
   *  in that direction and stays put when there is none.
   *  The slide reaches 6 tiles, not 2: the causeway is 2 tiles wide, so a 2-tile slide left the
   *  cursor trapped on one bank (measured by the round-4 tester, pad LEFT/UP stuck at (4,10)).
   *  A buildable tile on the far bank is 3 steps away, and decor can add one more. */
  function stepCursor(dx, dy) {
    let c = S.cursorC, r = S.cursorR;
    for (let i = 0; i < 6; i++) {
      const nc = c + dx, nr = r + dy;
      if (!C.inBounds(nc, nr)) return;
      c = nc; r = nr;
      if (C.buildable(c, r)) { setCursorTile(c, r); return; }
    }
    // no legal tile within the slide: hold position (the ghost keeps showing the last legal spot)
    if (C.buildable(c, r)) setCursorTile(c, r);
  }
  function cursorWorld() {
    return { x: S.cursorC * C.TILE + C.TILE / 2, y: S.cursorR * C.TILE + C.TILE / 2 };
  }

  /** the nearest buildable tile around the cursor (used when a tap or the pointer parked it on the road) */
  function snapToBuildable() {
    if (C.buildable(S.cursorC, S.cursorR)) return true;
    for (let rad = 1; rad <= 3; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const c = S.cursorC + dc, r = S.cursorR + dr;
          if (C.buildable(c, r)) { setCursorTile(c, r); return true; }
        }
      }
    }
    return false;
  }

  /** Enter / pad A: confirm whatever the cursor is on (inspect a tower, place an armed tower,
   *  send the wave early). */
  function cursorAction() {
    if (S.status !== 'prep' && S.status !== 'wave') return;
    const t = GK.Towers.towerAt(S.cursorC, S.cursorR);
    if (t) { selectTower(t); GK.Audio.play('tap'); return; }
    if (S.buildMode) {
      snapToBuildable();     // forgiving: a cursor on the road places on the next legal tile
      tapWorld(S.cursorC * C.TILE + C.TILE / 2, S.cursorR * C.TILE + C.TILE / 2);
      return;
    }
    if (S.status === 'prep') { sendEarly(); return; }
    flare();                 // a wave is running and nothing is armed: the keep's own lantern
  }

  /** Space / pad RB: the wave verb, and nothing else.
   *  In a wave it is ALWAYS the keep lantern, even when the cursor sits on the tower you just
   *  built or a build is armed (the round-4 tester lost FLARE to a sheet open on the first press).
   *  In prep it sends the next wave early. Building lives on Enter / pad A, exactly as the hint
   *  row, the coach and arcade.json say: an earlier build branch here made Space build while the
   *  screen claimed it flared, so the same press did two jobs. */
  function spaceAction() {
    if (S.status !== 'prep' && S.status !== 'wave') return;
    if (S.status === 'wave') { flare(); return; }
    sendEarly();
  }

  function selectTower(t) {
    S.selected = t; S.buildMode = null;
    if (S.coach === 2) { S.coach = 3; S.coachT = 0; }   // it opened the sheet: coach is done
  }
  function clearSelection() { S.selected = null; }

  /** Backspace / pad B / right-click: put down what is armed, close the sheet. Never sells. */
  function cancelAction() {
    if (S.status !== 'prep' && S.status !== 'wave') return false;
    if (S.buildMode) { S.buildMode = null; GK.Audio.play('tap'); return true; }
    if (S.selected) { S.selected = null; GK.Audio.play('tap'); return true; }
    return false;
  }

  function setBuild(type) {
    if (S.status !== 'prep' && S.status !== 'wave') return;
    const cost = C.TOWERS[type].cost;
    if (S.gold < cost) { toast('NOT ENOUGH EMBERS'); GK.Audio.play('deny'); return; }
    S.buildMode = S.buildMode === type ? null : type;
    S.selected = null;
    if (S.buildMode && S.coach === 0) S.coach = 1;   // first run: now tap a tile
    GK.Audio.play('tap');
  }

  /** nearest buildable, unoccupied tile within `rad` tiles of (c,r), nearest first. Used by the touch
   *  tap: on a landscape phone the moor is ~203 CSS px wide, so a tile is ~17 px and a thumb lands a
   *  tile off. Without this a near miss on the 2-tile causeway built nothing at all (measured: a tap
   *  10 px right of tile (1,12) hit the road and towers stayed 0). */
  function nearestBuildTile(c, r, rad) {
    let best = null, bestD = Infinity;
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const nc = c + dc, nr = r + dr;
        if (!C.buildable(nc, nr) || GK.Towers.towerAt(nc, nr)) continue;
        const d = dc * dc + dr * dr;
        if (d < bestD) { bestD = d; best = { c: nc, r: nr }; }
      }
    }
    return best;
  }

  /** one world-space tap: build if in build mode, else snap-select the nearest tower.
   *  `tol` > 0 is the touch tolerance in tiles: a tap that lands on the road / decor slides to the
   *  nearest legal tile instead of failing. Returns the tile the tap resolved to. */
  function tapWorld(lx, ly, tol) {
    if (S.status !== 'prep' && S.status !== 'wave') return null;
    let c = Math.floor(lx / C.TILE), r = Math.floor(ly / C.TILE);
    if (S.buildMode) {
      const existing = GK.Towers.towerAt(c, r);
      if (existing) { selectTower(existing); GK.Audio.play('tap'); return { c, r }; }
      if (tol > 0 && !C.buildable(c, r)) {
        const near = nearestBuildTile(c, r, tol);
        if (near) { c = near.c; r = near.r; }
      }
      const type = S.buildMode;
      const res = GK.Towers.build(type, c, r, S.gold);
      if (!res.ok) {
        toast(res.why === 'gold' ? 'NOT ENOUGH EMBERS' : 'CANNOT BUILD THERE');
        GK.Audio.play('deny');
        return { c, r };
      }
      S.gold -= C.TOWERS[type].cost;
      // stay in build mode so the player can place several towers in a row
      S.selected = null;
      if (S.coach === 1) { S.coach = 2; S.coachT = 8; }   // first tower down: teach the sheet
      if (S.gold < C.TOWERS[type].cost) {
        S.buildMode = null;
        toast('OUT OF EMBERS');
      }
      return { c, r };
    }
    const tw = GK.Towers.nearestTower(lx, ly, C.TAP_RADIUS * (tol > 0 ? 1.6 : 1));
    if (tw) { selectTower(tw); GK.Audio.play('tap'); return { c, r }; }
    S.selected = null;
    return { c, r };
  }

  // kept for older tests/tools: tile-based tap goes through the same path
  function tapTile(c, r) { tapWorld(c * C.TILE + C.TILE / 2, r * C.TILE + C.TILE / 2); }

  function upgradeSelected() {
    if (!S.selected) return;
    const res = GK.Towers.upgrade(S.selected, S.gold);
    if (!res.ok) {
      toast(res.why === 'max' ? 'MAX LEVEL' : 'NOT ENOUGH EMBERS');
      GK.Audio.play('deny');
      return;
    }
    S.gold -= res.cost;
  }

  function sellSelected() {
    if (!S.selected) return;
    const v = GK.Towers.sell(S.selected);
    S.gold += v;
    S.selected = null;
  }

  function toggleFireMode() {
    if (!S.selected) return;
    GK.Towers.toggleFire(S.selected);
  }

  function setFireMode(m) {
    if (!S.selected) return;
    if (S.selected.fireMode === m) return;
    GK.Towers.toggleFire(S.selected);
  }

  function cycleTarget() {
    if (!S.selected) return;
    GK.Towers.cycleTarget(S.selected);
  }

  // ---- update ------------------------------------------------------------
  function update(dt) {
    // timers that must keep ticking while the world is frozen
    if (S.streakT > 0) {
      S.streakT -= dt;
      if (S.streakT <= 0) { S.streakT = 0; S.streak = 0; }
    }
    // KEEP HEAT cools one step at a time while no kill lands, so a chain keeps paying for a while
    if (S.heat > 0 && S.streakT <= 0) {
      S.heatCool -= dt;
      if (S.heatCool <= 0) { S.heat--; S.heatCool = C.HEAT.cool; }
    }
    if (S.coach === 2 && S.coachT > 0) {
      S.coachT -= dt;
      if (S.coachT <= 0) S.coach = 4;      // the sheet hint has had its 8 s
    }
    if (S.flareCd > 0) S.flareCd = Math.max(0, S.flareCd - dt);
    if (S.flareFlash > 0) S.flareFlash = Math.max(0, S.flareFlash - dt * 2.2);
    if (S.leakFlash > 0) S.leakFlash = Math.max(0, S.leakFlash - dt);

    if (S.hitStop > 0) { S.hitStop = Math.max(0, S.hitStop - dt); return; }

    S.time += dt;
    GK.FX.update(dt);
    if (S.bannerT > 0) S.bannerT -= dt;
    if (S.toastT > 0) S.toastT -= dt;

    if (S.status === 'menu' || S.status === 'over' || S.status === 'win') return;
    if (S.paused) return;

    const d = dt * S.speed;

    if (S.status === 'prep') {
      S.prepT -= d;
      if (S.prepT <= 0) startWave();
    }

    if (S.status === 'wave') {
      for (const g of S.groups) {
        if (g.left <= 0) continue;
        if (g.delay > 0) { g.delay -= d; continue; }
        g.gapT -= d;
        if (g.gapT <= 0) {
          GK.Enemies.spawn(g.t, S.wave);
          if (g.t === 'boss') {
            banner('THE GLOAM SOVEREIGN WALKS', 2.4);
            GK.FX.shakeAdd(1.2);
          }
          g.left--;
          g.gapT = g.gap;
        }
      }
    }

    GK.Towers.update(d, GK.Enemies.list());
    GK.Enemies.update(d);

    // danger: how close the leading foe is to the gate (0..1). The screen edges glow red near 1,
    // so a leak is telegraphed before it lands instead of only reported after it.
    if (S.status === 'wave') {
      let lead = 0;
      for (const e of GK.Enemies.list()) if (!e.dead && e.progress > lead) lead = e.progress;
      S.danger = lead;
    } else {
      S.danger = 0;
    }

    if (S.status === 'wave') {
      const allSpawned = S.groups.every(g => g.left <= 0);
      if (allSpawned && GK.Enemies.count() === 0) clearWave();
    }
  }

  // ---- render ------------------------------------------------------------
  function render() {
    const L = GK.UI.layout();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.PAL.ink;
    ctx.fillRect(0, 0, GK.W, GK.H);

    const shake = GK.FX.getShake();
    const ox = (Math.random() - 0.5) * shake * 2.2;
    const oy = (Math.random() - 0.5) * shake * 2.2;

    ctx.save();
    ctx.translate(L.wx + ox, L.wy + oy);
    ctx.scale(L.scale, L.scale);
    ctx.imageSmoothingEnabled = false;
    GK.World.draw(ctx, S.time);
    if (S.buildMode) drawBuildMarkers();
    GK.Towers.draw(ctx, S.selected);
    GK.Enemies.draw(ctx);
    if (S.flareFlash > 0) drawFlareLight();
    drawCursor();
    GK.FX.draw(ctx);
    ctx.restore();

    GK.UI.vignette(ctx, L);
    GK.UI.draw(ctx, L);
  }

  /** the lantern's light washing the moor, one second of gold when FLARE fires */
  function drawFlareLight() {
    const x = GK.World.gate.x, y = GK.World.gate.y - 30;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * S.flareFlash;
    const g = ctx.createRadialGradient(x, y, 8, x, y, 190);
    g.addColorStop(0, 'rgba(255,225,150,0.9)');
    g.addColorStop(0.5, 'rgba(255,190,90,0.25)');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C.W, C.H);
    ctx.restore();
  }

  /** keyboard / pad build cursor: a bracket on the tile, plus a ghost of the armed tower */
  function drawCursor() {
    if (GK.Input.device() === 'touch') return;
    if (S.status !== 'prep' && S.status !== 'wave') return;
    if (S.paused) return;
    const x = S.cursorC * C.TILE, y = S.cursorR * C.TILE;
    const armed = !!S.buildMode;
    const col = armed ? (S.gold >= C.TOWERS[S.buildMode].cost ? C.PAL.gold : C.PAL.stoneLit) : '#ffffff';
    ctx.save();
    ctx.globalAlpha = armed ? 0.95 : 0.5;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.4;
    const b = 5;
    ctx.beginPath();
    // four corner brackets
    ctx.moveTo(x + 1, y + b); ctx.lineTo(x + 1, y + 1); ctx.lineTo(x + b, y + 1);
    ctx.moveTo(x + C.TILE - b, y + 1); ctx.lineTo(x + C.TILE - 1, y + 1); ctx.lineTo(x + C.TILE - 1, y + b);
    ctx.moveTo(x + C.TILE - 1, y + C.TILE - b); ctx.lineTo(x + C.TILE - 1, y + C.TILE - 1); ctx.lineTo(x + C.TILE - b, y + C.TILE - 1);
    ctx.moveTo(x + b, y + C.TILE - 1); ctx.lineTo(x + 1, y + C.TILE - 1); ctx.lineTo(x + 1, y + C.TILE - b);
    ctx.stroke();
    if (armed) {
      const spr = GK.Spr.get(S.buildMode);
      ctx.globalAlpha = 0.55;
      ctx.drawImage(spr.cv, x + 1, y - 12, 18, 28);
      // range preview: where the tower would reach at level 1
      const rng = C.TOWERS[S.buildMode].modes.a.range;
      ctx.globalAlpha = 0.30;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x + C.TILE / 2, y + C.TILE / 2, rng, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawBuildMarkers() {
    const pal = C.PAL;
    const afford = S.gold >= C.TOWERS[S.buildMode].cost;
    for (let r = 0; r < C.ROWS; r++) {
      for (let c = 0; c < C.COLS; c++) {
        if (!C.buildable(c, r)) continue;
        if (GK.Towers.towerAt(c, r)) continue;
        const x = c * C.TILE + 8, y = r * C.TILE + 8;
        ctx.strokeStyle = afford ? pal.gold : pal.stoneLit;
        ctx.globalAlpha = afford ? 0.5 : 0.28;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = afford ? pal.gold : pal.stoneLit;
        ctx.fillRect(x - 1, y, 2, 1);
        ctx.fillRect(x, y - 1, 1, 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---- boot --------------------------------------------------------------
  function resize() {
    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;
    // The canvas is capped at 2x: an iPhone reports DPR 3, and 3x costs ~2.3 MP for no visible
    // gain on pixel art. On top of the cap the buffer is adaptive: if a busy box holds the game
    // under 40 fps the fill drops by a quarter (1.25x at the floor), and it climbs back after
    // three good seconds. The look does not change, only how many device pixels carry it.
    dprCap = Math.min(2, window.devicePixelRatio || 1);
    if (dprCeiling > dprCap) dprCeiling = dprCap;
    if (dprTarget > dprCeiling) dprTarget = dprCeiling;
    dpr = Math.max(1, Math.min(dprCap, dprTarget));
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    GK.W = cw; GK.H = ch;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    GK.UI.measureSafe();
  }

  /** one-second fps window: drop fill when slow, raise it when there is headroom again.
   *  Step straight to 1.5x: on this box 2x measured 29 fps and 1.5x is the cheapest step that
   *  still reads as pixel art. 1.25x is the emergency floor if 1.5x is still under the fail line. */
  function adaptQuality(dtReal) {
    fpsAcc += dtReal; fpsN++;
    if (fpsAcc < 1) return;
    const fps = fpsN / fpsAcc;
    fpsAcc = 0; fpsN = 0;
    if (fps < 36) {
      if (dprTarget > 1.5) { dprTarget = 1.5; dprCeiling = Math.min(dprCeiling, 1.5); goodWin = 0; resize(); }
      else if (dprTarget > 1.25 && fps < 32) { dprTarget = 1.25; dprCeiling = Math.min(dprCeiling, 1.25); goodWin = 0; resize(); }
    } else if (fps > 52 && dprTarget < Math.min(dprCap, dprCeiling)) {
      if (++goodWin >= 3) { dprTarget = Math.min(dprCap, dprCeiling, dprTarget + 0.25); goodWin = 0; resize(); }
    } else {
      goodWin = 0;
    }
  }

  function frame(now) {
    const raw = (now - last) / 1000 || 0;
    const dt = Math.min(0.05, raw);
    last = now;
    GK.Input.poll();
    GK.Input.syncMenu();
    if (S.status !== 'menu') update(dt);
    else S.time += dt;
    render();
    if (raw > 0 && raw < 0.5) adaptQuality(raw);
    requestAnimationFrame(frame);
  }

  function boot() {
    canvas = document.getElementById('cv');
    ctx = canvas.getContext('2d');
    GK.Spr.init();
    GK.UI.init();
    resize();
    reset();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 120));
    GK.Input.start(canvas);
    last = performance.now();
    requestAnimationFrame(frame);

    // debug/test surface
    window.GKDebug = {
      S: () => S,
      startRun, startWave, sendEarly, setBuild, tapTile, tapWorld,
      upgradeSelected, sellSelected, toggleFireMode, cycleTarget,
      toggleSpeed, togglePause, flare, hitStop, cycleBuild,
      sim(seconds, dt) {
        const step = dt || 1 / 60;
        const n = Math.round(seconds / step);
        for (let i = 0; i < n; i++) {
          update(step);
          if (S.status === 'over' || S.status === 'win') break;
        }
        return { status: S.status, wave: S.wave, lives: S.lives, gold: S.gold, enemies: GK.Enemies.count() };
      },
      autoBuild() {
        const spots = [[1,2,'lantern'],[4,2,'lantern'],[5,3,'brazier'],[9,6,'chill'],[9,8,'lantern'],[1,8,'brazier']];
        for (const [c, r, t] of spots) {
          if (S.gold < C.TOWERS[t].cost) continue;
          const res = GK.Towers.build(t, c, r, S.gold);
          if (res.ok) S.gold -= C.TOWERS[t].cost;
        }
      },
      jumpTo(w) {
        // screenshot/debug helper: a funded run dropped straight onto wave w
        reset();
        S.status = 'prep';
        S.wave = w;
        S.gold = 620;
        S.prepT = 0;
        GKDebug.bot();
        startWave();
        return { wave: S.wave, gold: S.gold, towers: GK.Towers.list().length };
      },
      bot() {
        // full-run bot: fill a strong layout, mix modes, then upgrade cheapest
        const spots = [
          [1,2,'lantern','a'],[4,2,'lantern','a'],[5,3,'brazier','a'],[9,6,'chill','a'],
          [9,8,'lantern','a'],[1,8,'brazier','a'],[6,7,'lantern','a'],[4,10,'chill','a'],
          [9,11,'lantern','a'],[1,12,'lantern','a'],[6,16,'brazier','a'],[9,16,'arc','a'],
          [4,15,'lantern','a'],[6,19,'lantern','a'],[9,18,'arc','a'],[1,4,'lantern','a']
        ];
        let did = true;
        while (did) {
          did = false;
          for (const [c, r, t, m] of spots) {
            if (GK.Towers.towerAt(c, r) || S.gold < C.TOWERS[t].cost) continue;
            const res = GK.Towers.build(t, c, r, S.gold);
            if (res.ok) {
              S.gold -= C.TOWERS[t].cost;
              if (m === 'b') GK.Towers.toggleFire(res.tower);
              did = true;
            }
          }
          if (!did) {
            let best = null, bc = 1e9;
            for (const tw of GK.Towers.list()) {
              const cost = GK.Towers.upCost(tw);
              if (cost && cost < bc && S.gold >= cost) { bc = cost; best = tw; }
            }
            if (best) {
              const res = GK.Towers.upgrade(best, S.gold);
              if (res.ok) { S.gold -= res.cost; did = true; }
            }
          }
        }
      }
    };
  }

  /** honest run grade from the light you kept: S 18+, A 14+, B 9+, C 4+, D below */
  function grade(lives) {
    const l = lives == null ? S.lives : lives;
    return l >= 18 ? 'S' : l >= 14 ? 'A' : l >= 9 ? 'B' : l >= 4 ? 'C' : 'D';
  }

  GK.Game = {
    boot, reset, update, render, resize, startRun, startWave, clearWave,
    addGold, countKill, leak, sendEarly, toggleSpeed, togglePause, toggleMute,
    flare, hitStop, grade,
    selectTower, clearSelection, setBuild, tapWorld, tapTile,
    cancelAction, cycleBuild,
    upgradeSelected, sellSelected, toggleFireMode, setFireMode, cycleTarget,
    setCursorTile, stepCursor, cursorWorld, cursorAction, spaceAction,
    S: () => S,
    enemies: () => GK.Enemies.list()
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
