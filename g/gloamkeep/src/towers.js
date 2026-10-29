/* GLOAMKEEP — towers with dual fire modes (A/B), tar pools, lances, storms. */
window.GK = window.GK || {};

(function () {
  const C = GK.CFG, P = C.PAL, T = C.TILE;

  const TARGETS = ['first', 'strong', 'close', 'last'];
  const MODE_COL = {
    bolt: P.ember, flare: P.fire, bomb: P.fire, tar: '#c25a2a',
    aura: P.frost, lance: P.frostLit, chain: P.arc, storm: P.arcLit
  };

  let list = [];
  let projs = [];
  let patches = [];

  function def(type) { return C.TOWERS[type]; }

  function stats(t) {
    const d = def(t.type);
    const m = d.modes[t.fireMode];
    const L = t.level - 1;
    return {
      name: m.name, blurb: m.blurb, kind: m.kind,
      dmg: m.dmg * C.LVL_DMG[L],
      rate: m.rate * C.LVL_RATE[L],
      range: m.range + C.LVL_RANGE[L],
      speed: m.speed || 0,
      splash: (m.splash || 0) + L * 2,
      mark: m.mark || 0,
      pierce: m.pierce || 0,
      slow: (m.slow || 0) + L * 0.06,
      slowDur: m.slowDur || 0,
      chain: (m.chain || 0) + L,
      chainFall: m.chainFall || 0.7,
      chainRange: m.chainRange || 30,
      root: (m.root || 0) + L * 0.1,
      stun: (m.stun || 0) + L * 0.1,
      strikes: (m.strikes || 0) + L,
      tarDur: m.tarDur || 0,
      tarRadius: (m.tarRadius || 0) + L * 2,
      tarSlow: m.tarSlow || 0,
      tarDps: (m.tarDps || 0) * C.LVL_DMG[L]
    };
  }

  function upCost(t) {
    if (t.level >= C.MAX_LEVEL) return 0;
    return C.upCost(t.type, t.level);
  }
  function sellValue(t) { return Math.floor(t.spent * C.SELL_RATE); }

  function towerAt(c, r) {
    for (const t of list) if (t.c === c && t.r === r) return t;
    return null;
  }

  function nearestTower(lx, ly, rad) {
    let best = null, bd = rad * rad;
    for (const t of list) {
      const dx = t.x - lx, dy = (t.y - 10) - ly;
      const d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = t; }
    }
    return best;
  }

  function build(type, c, r, gold) {
    if (!C.buildable(c, r) || towerAt(c, r)) return { ok: false, why: 'blocked' };
    const cost = def(type).cost;
    if (gold < cost) return { ok: false, why: 'gold' };
    const t = {
      type, c, r,
      x: c * T + T / 2,
      y: r * T + T - 2,
      level: 1, spent: cost, cd: 0.25,
      fireMode: 'a', target: 'first',
      flash: 0, pulse: Math.random() * 6.28
    };
    list.push(t);
    GK.Audio.play('build');
    GK.FX.burst(t.x, t.y - 12, 10, [P.stoneLit, P.stone, P.gold], { speed: 22, grav: 40, life: 0.45 });
    GK.FX.ring(t.x, t.y - 10, 16, P.gold);
    return { ok: true, tower: t };
  }

  function upgrade(t, gold) {
    if (t.level >= C.MAX_LEVEL) return { ok: false, why: 'max' };
    const cost = upCost(t);
    if (gold < cost) return { ok: false, why: 'gold' };
    t.level++;
    t.spent += cost;
    t.flash = 1;
    GK.Audio.play('build');
    GK.FX.burst(t.x, t.y - 14, 14, [P.gold, P.flame, P.stoneLit], { speed: 26, grav: 30 });
    GK.FX.ring(t.x, t.y - 12, 20, P.gold);
    return { ok: true, cost };
  }

  function sell(t) {
    const v = sellValue(t);
    list = list.filter(x => x !== t);
    GK.FX.burst(t.x, t.y - 10, 10, [P.stone, P.stoneDark], { speed: 20, grav: 60 });
    GK.FX.text(t.x, t.y - 16, '+' + v, P.gold);
    GK.Audio.play('coin');
    return v;
  }

  function toggleFire(t) {
    t.fireMode = t.fireMode === 'a' ? 'b' : 'a';
    t.cd = Math.min(t.cd, 0.25);
    GK.Audio.play('tap');
    GK.FX.ring(t.x, t.y - 12, 12, MODE_COL[stats(t).kind] || P.gold);
    return t.fireMode;
  }

  function cycleTarget(t) {
    const i = TARGETS.indexOf(t.target);
    t.target = TARGETS[(i + 1) % TARGETS.length];
    GK.Audio.play('tap');
    return t.target;
  }

  function inRange(t, e, range) {
    const dx = e.x - t.x, dy = e.y - (t.y - 10);
    return dx * dx + dy * dy <= range * range;
  }

  function pickTarget(t, enemies, range) {
    let best = null, bestVal = -Infinity;
    for (const e of enemies) {
      if (e.dead || !inRange(t, e, range)) continue;
      let val;
      if (t.target === 'first') val = e.progress;
      else if (t.target === 'last') val = -e.progress;
      else if (t.target === 'strong') val = e.hp;
      else val = -((e.x - t.x) ** 2 + (e.y - (t.y - 10)) ** 2);
      if (val > bestVal) { bestVal = val; best = e; }
    }
    return best;
  }

  function fire(t, st, enemies) {
    const kind = st.kind;

    if (kind === 'aura') {
      let hit = 0;
      for (const e of enemies) {
        if (e.dead || !inRange(t, e, st.range)) continue;
        GK.Enemies.applyDamage(e, st.dmg, 'frost');
        GK.Enemies.applySlow(e, st.slow, st.slowDur);
        hit++;
      }
      if (hit) {
        GK.Audio.play('frost');
        GK.FX.ring(t.x, t.y - 10, st.range, P.frost);
        t.flash = 0.25;
      }
      return;
    }

    const target = pickTarget(t, enemies, st.range);
    if (!target) return;

    if (kind === 'chain') {
      const pts = [{ x: t.x, y: t.y - 14 }];
      let cur = target, dmg = st.dmg;
      const hitSet = new Set();
      for (let i = 0; i < st.chain; i++) {
        if (!cur || cur.dead) break;
        hitSet.add(cur);
        pts.push({ x: cur.x, y: cur.y });
        GK.Enemies.applyDamage(cur, dmg, 'arc');
        dmg *= st.chainFall;
        let next = null, nd = Infinity;
        for (const e of enemies) {
          if (e.dead || hitSet.has(e)) continue;
          const dd = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
          if (dd < st.chainRange * st.chainRange && dd < nd) { nd = dd; next = e; }
        }
        cur = next;
      }
      GK.Audio.play('zap');
      GK.FX.beam(pts, P.arcLit);
      GK.FX.burst(target.x, target.y, 5, [P.arcLit, P.arc], { speed: 22, grav: 0, life: 0.25 });
      t.flash = 0.7;
      return;
    }

    if (kind === 'storm') {
      const pool = enemies.filter(e => !e.dead && inRange(t, e, st.range))
        .sort((a, b) => b.hp - a.hp).slice(0, st.strikes);
      if (!pool.length) return;
      for (const e of pool) {
        GK.Enemies.applyDamage(e, st.dmg, 'arc', st.pierce);
        GK.Enemies.applyStun(e, st.stun);
        GK.FX.beam([{ x: e.x, y: e.y - 34 }, { x: e.x, y: e.y }], P.arcLit);
        GK.FX.ring(e.x, e.y, 12, P.arcLit);
        GK.FX.burst(e.x, e.y, 8, [P.arcLit, P.arc], { speed: 30, grav: 20, life: 0.35 });
      }
      GK.Audio.play('zap');
      t.flash = 0.8;
      return;
    }

    if (kind === 'lance') {
      GK.FX.beam([{ x: t.x, y: t.y - 16 }, { x: target.x, y: target.y }], P.frostLit);
      GK.Enemies.applyDamage(target, st.dmg, 'frost', st.pierce);
      GK.Enemies.applyStun(target, st.root);
      GK.Enemies.applySlow(target, 0.6, st.root + 0.4);
      GK.FX.ring(target.x, target.y, 14, P.frost);
      GK.FX.burst(target.x, target.y, 10, [P.frost, P.frostLit], { speed: 28, grav: 10, life: 0.4 });
      GK.Audio.play('frost');
      t.flash = 0.8;
      return;
    }

    if (kind === 'tar') {
      patches.push({
        x: target.x, y: target.y, r: st.tarRadius,
        life: st.tarDur, max: st.tarDur,
        dps: st.tarDps, slow: st.tarSlow, tick: 0
      });
      if (patches.length > 14) patches.shift();
      GK.FX.ring(target.x, target.y, st.tarRadius, '#c25a2a');
      GK.Audio.play('boom');
      t.flash = 0.6;
      return;
    }

    // projectiles: bolt / flare / bomb
    projs.push({
      x: t.x, y: t.y - 16,
      target,
      lastX: target.x, lastY: target.y,
      speed: st.speed,
      dmg: st.dmg,
      splash: st.splash,
      mark: st.mark,
      kind,
      travel: 0
    });
    t.flash = 0.5;
    GK.Audio.play(kind === 'bomb' ? 'boom' : 'shoot');
  }

  function impact(p) {
    const enemies = GK.Game.enemies();
    if (p.splash) {
      GK.FX.ring(p.x, p.y, p.splash, p.kind === 'flare' ? P.ember : P.fire);
      GK.FX.burst(p.x, p.y, 14, [P.fire, P.ember, P.flame], { speed: 42, grav: 50, life: 0.5 });
      GK.FX.shakeAdd(0.35);
      for (const e of enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= p.splash) {
          GK.Enemies.applyDamage(e, p.dmg, 'fire');
          if (p.mark) GK.Enemies.applyMark(e, p.mark);
        }
      }
    } else {
      if (p.target && !p.target.dead) GK.Enemies.applyDamage(p.target, p.dmg, 'fire');
      GK.FX.burst(p.x, p.y, 5, [P.ember, P.flame], { speed: 24, grav: 0, life: 0.3 });
    }
  }

  function updatePatches(dt) {
    for (let i = patches.length - 1; i >= 0; i--) {
      const p = patches[i];
      p.life -= dt;
      p.tick -= dt;
      if (p.tick <= 0) {
        p.tick = 0.4;
        for (const e of GK.Game.enemies()) {
          if (e.dead) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) <= p.r) {
            GK.Enemies.applyDamage(e, p.dps * 0.4, 'tar');
            GK.Enemies.applySlow(e, p.slow, 0.5);
          }
        }
      }
      if (p.life <= 0) patches.splice(i, 1);
    }
  }

  function update(dt, enemies) {
    for (const tw of list) {
      tw.pulse += dt * 3;
      tw.flash = Math.max(0, tw.flash - dt * 4);
      const st = stats(tw);
      tw.cd -= dt;
      if (tw.cd <= 0) {
        fire(tw, st, enemies);
        tw.cd = st.rate;
      }
    }
    updatePatches(dt);

    for (let i = projs.length - 1; i >= 0; i--) {
      const p = projs[i];
      let tx = p.lastX, ty = p.lastY;
      if (p.target && !p.target.dead) {
        tx = p.target.x; ty = p.target.y;
        p.lastX = tx; p.lastY = ty;
      }
      const dx = tx - p.x, dy = ty - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = p.speed * dt;
      p.travel += dt;
      if (d <= step + 2) {
        p.x = tx; p.y = ty;
        impact(p);
        projs.splice(i, 1);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    }
  }

  function drawPatches(ctx) {
    for (const p of patches) {
      const a = Math.min(1, p.life / 0.6);
      ctx.globalAlpha = 0.75 * a;
      ctx.fillStyle = '#160e0b';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 4, p.r, p.r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.55 * a;
      ctx.fillStyle = '#5c2f18';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 3, p.r * 0.8, p.r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      // bubbles
      ctx.globalAlpha = 0.8 * a;
      ctx.fillStyle = P.fire;
      for (let i = 0; i < 3; i++) {
        const bx = p.x + Math.sin(p.life * 3 + i * 2) * p.r * 0.5;
        const by = p.y + 2 + Math.cos(p.life * 2 + i) * 2;
        ctx.fillRect(Math.round(bx), Math.round(by), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  // pre-rendered additive light pools: a radial gradient built every frame per tower cost ~30
  // gradient objects a frame and held phone portrait at 50 fps. One sprite per colour, drawn scaled.
  const glowCache = {};
  function glowSprite(hex, rad) {
    const key = hex + '|' + rad;
    if (glowCache[key]) return glowCache[key];
    const cv = document.createElement('canvas');
    cv.width = cv.height = rad * 2;
    const c = cv.getContext('2d');
    const cr = parseInt(hex.slice(1, 3), 16), cg = parseInt(hex.slice(3, 5), 16), cb = parseInt(hex.slice(5, 7), 16);
    const g = c.createRadialGradient(rad, rad, 1, rad, rad, rad);
    g.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.24)');
    g.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
    c.fillStyle = g;
    c.fillRect(0, 0, rad * 2, rad * 2);
    glowCache[key] = cv;
    return cv;
  }

  function draw(ctx, sel) {
    drawPatches(ctx);
    const sorted = list.slice().sort((a, b) => a.y - b.y);
    for (const tw of sorted) {
      const lvl = tw.level;
      const st = stats(tw);
      const bob = Math.sin(tw.pulse) * 0.5;
      const accent = MODE_COL[st.kind] || P.gold;

      // cast shadow + stone pad
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#04060a';
      ctx.beginPath();
      ctx.ellipse(tw.x + 3, tw.y + 2, 11, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = P.stoneLit;
      ctx.fillRect(tw.x - 8, tw.y - 1, 16, 1);
      ctx.globalAlpha = 1;

      // light pool (additive) — the moor is dark, towers are the light
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rad = 22 + lvl * 3;
      ctx.drawImage(glowSprite(accent, rad), tw.x - rad, tw.y - 10 - rad, rad * 2, rad * 2);
      ctx.restore();

      GK.Spr.drawBottom(ctx, tw.type, tw.x, tw.y + bob, { flash: tw.flash });

      // B-mode marker: a small chevron over the tower so dual-use is visible without tapping
      if (tw.fireMode === 'b') {
        const my = Math.round(tw.y - 31 + Math.sin(tw.pulse * 2) * 1);
        ctx.fillStyle = '#05070b';
        ctx.fillRect(tw.x - 2, my - 1, 5, 3);
        ctx.fillStyle = accent;
        ctx.fillRect(tw.x - 1, my, 3, 1);
        ctx.fillRect(tw.x, my + 1, 1, 1);
      }

      // mode ring at the base: A solid, B pulsing
      ctx.globalAlpha = tw.fireMode === 'a' ? 0.5 : 0.55 + 0.35 * Math.sin(tw.pulse * 1.6);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(tw.x, tw.y + 1, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // level pips
      if (lvl > 1) {
        ctx.fillStyle = P.gold;
        for (let i = 0; i < lvl - 1; i++) ctx.fillRect(tw.x - 5 + i * 4, tw.y + 2, 3, 1);
      }

      if (sel && sel === tw) {
        ctx.strokeStyle = P.gold;
        ctx.lineWidth = 1;
        ctx.strokeRect(tw.c * T + 0.5, tw.r * T + 0.5, T - 1, T - 1);
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(tw.x, tw.y - 12, st.range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    for (const p of projs) {
      if (p.kind === 'bomb') {
        const hop = Math.sin(Math.min(1, p.travel * 2.2) * Math.PI) * 7;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) + 2, 3, 1);
        ctx.fillStyle = P.fire;
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y - hop) - 1, 3, 3);
        ctx.fillStyle = P.flame;
        ctx.fillRect(Math.round(p.x), Math.round(p.y - hop), 1, 1);
      } else {
        const big = p.kind === 'flare' ? 2 : 1;
        ctx.fillStyle = P.flame;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1 + big, 1 + big);
        ctx.fillStyle = P.ember;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3 + big, 3 + big);
        ctx.globalAlpha = 1;
      }
    }
  }

  GK.Towers = {
    reset() { list = []; projs = []; patches = []; },
    list() { return list; },
    towerAt, nearestTower, build, upgrade, sell,
    toggleFire, cycleTarget, stats, upCost, sellValue, update, draw,
    TARGETS, MODE_COL
  };
})();
