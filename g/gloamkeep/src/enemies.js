/* GLOAMKEEP — enemies: causeway walkers, flyers, marks, stuns, splits, HP bars. */
window.GK = window.GK || {};

(function () {
  const C = GK.CFG, P = C.PAL;
  let list = [];

  function spawn(type, wave, opts) {
    const d = C.ENEMIES[type];
    const w = wave - 1;
    // per-wave toughness from config: the curve is the difficulty ramp, so balancing is one edit
    const curve = (C.HP_CURVE && C.HP_CURVE[w] != null) ? C.HP_CURVE[w] : (1 + 0.13 * w + 0.007 * w * w);
    const hpMul = curve * (C.ENEMY_HP_MUL || 1);
    const spdMul = 1 + 0.02 * w;
    const hp = Math.round(d.hp * hpMul);
    const o = opts || {};
    const e = {
      key: type, def: d, spr: d.spr, wave,
      maxHp: hp, hp,
      baseSpd: d.spd * spdMul,
      armor: d.armor,
      gold: d.gold,
      leak: d.leak,
      r: d.r,
      fly: !!d.fly,
      ward: !!d.ward,
      dist: o.dist != null ? o.dist : 0,
      len: d.fly ? Math.hypot(GK.World.gate.x - GK.World.spawn.x, GK.World.gate.y - GK.World.spawn.y) : GK.World.total,
      x: GK.World.spawn.x,
      y: GK.World.spawn.y,
      slowT: 0, slowAmt: 0,
      markT: 0, stunT: 0,
      flash: 0, dead: false,
      age: 0, phase: Math.random() * 6.28,
      progress: 0
    };
    if (o.hpScale) { e.maxHp = Math.round(e.maxHp * o.hpScale); e.hp = e.maxHp; }
    list.push(e);
    return e;
  }

  function applyDamage(e, dmg, kind, pierce) {
    if (e.dead) return 0;
    let d = dmg * (e.markT > 0 ? C.MARK_MULT : 1);
    // A marked target loses its armour entirely: FLARE (Ember B) or any mark is the answer to
    // armoured knights, brutes and the Sovereign. Pierce still helps on unmarked targets.
    const armor = e.markT > 0 ? 0 : Math.max(0, e.armor - (pierce || 0));
    if (armor) d = Math.max(1, d - armor);
    // An unmarked Sovereign shrugs off most damage (C.WARD_MUL). This is what makes "save FLARE
    // for the Sovereign" a decision: marking it is worth more than a dozen extra towers.
    if (e.ward && e.markT <= 0) d = Math.max(1, d * C.WARD_MUL);
    e.hp -= d;
    e.flash = 1;
    if (e.hp <= 0) kill(e, kind);
    return d;
  }

  function applySlow(e, amt, dur) {
    if (e.dead) return;
    const a = e.ward ? amt * 0.5 : amt;
    if (a >= e.slowAmt) e.slowAmt = a;
    e.slowT = Math.max(e.slowT, dur);
  }

  function applyMark(e, dur) {
    if (e.dead) return;
    e.markT = Math.max(e.markT, dur);
  }

  function applyStun(e, dur) {
    if (e.dead) return;
    const d = e.ward ? dur * 0.5 : dur;
    e.stunT = Math.max(e.stunT, d);
  }

  function kill(e, kind) {
    if (e.dead) return;
    e.dead = true;
    GK.Game.addGold(e.gold);
    GK.Game.countKill();
    GK.FX.text(e.x, e.y - 10, '+' + e.gold, P.gold);
    const cols = kind === 'frost' ? [P.frost, P.frostLit] :
                 kind === 'arc' ? [P.arc, P.arcLit] :
                 kind === 'tar' ? [P.fire, '#6b4a2f'] :
                 [P.fire, P.ember, P.flame];
    GK.FX.burst(e.x, e.y, e.key === 'boss' ? 30 : 8, cols,
                { speed: e.key === 'boss' ? 55 : 26, grav: 40, life: 0.5 });
    // weight: the world freezes for a beat on the killing blow — longer for bigger foes
    GK.Game.hitStop(e.key === 'boss' ? 0.22 : (e.key === 'brute' || e.key === 'knight') ? 0.055 : 0.03);
    if (e.key === 'boss') {
      GK.FX.shakeAdd(1.8);
      GK.FX.ring(e.x, e.y, 40, P.gold);
      GK.Audio.play('boom');
    } else {
      GK.Audio.play('coin');
    }
    // gloamlings split into two wisps
    if (e.def.split) {
      for (let i = 0; i < e.def.split; i++) {
        const c = spawn('wisp', e.wave, { dist: Math.max(0, e.dist - 5 - i * 3), hpScale: 0.6 });
        c.x = e.x + (i ? 3 : -3);
        c.y = e.y;
      }
      GK.FX.ring(e.x, e.y, 16, P.shadeLit);
    }
  }

  function leak(e) {
    e.dead = true;
    GK.Game.leak(e.leak);
    GK.FX.text(e.x, e.y - 8, '-' + e.leak, '#ff7a7a');
    GK.FX.burst(e.x, e.y, 10, ['#ff6b6b', '#ffb0b0'], { speed: 30, grav: 0 });
    GK.FX.shakeAdd(1.0);
    GK.Audio.play('leak');
  }

  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.dead) { list.splice(i, 1); continue; }
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt * 5);
      if (e.slowT > 0) {
        e.slowT -= dt;
        if (e.slowT <= 0) e.slowAmt = 0;
      }
      if (e.markT > 0) e.markT -= dt;
      if (e.stunT > 0) e.stunT -= dt;
      const spd = e.stunT > 0 ? 0 : e.baseSpd * (1 - e.slowAmt);
      e.dist += spd * dt;
      if (e.fly) {
        const t = Math.min(1, e.dist / e.len);
        e.x = GK.World.spawn.x + (GK.World.gate.x - GK.World.spawn.x) * t;
        e.y = GK.World.spawn.y + (GK.World.gate.y - GK.World.spawn.y) * t;
        e.y += Math.sin(e.age * 4 + e.phase) * 2;
        e.progress = t;
      } else {
        const p = GK.World.posAt(e.dist);
        e.x = p.x;
        e.y = p.y - 4;
        e.progress = e.dist / GK.World.total;
      }
      if (e.dist >= e.len) { leak(e); list.splice(i, 1); }
    }
  }

  // enemy glow sprites, pre-rendered once (a gradient per enemy per frame was the other hot spot)
  const glowCache = {};
  function glowSprite(col, rad) {
    const key = col + '|' + rad;
    if (glowCache[key]) return glowCache[key];
    const cv = document.createElement('canvas');
    cv.width = cv.height = rad * 2;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(rad, rad, 1, rad, rad, rad);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, rad * 2, rad * 2);
    glowCache[key] = cv;
    return cv;
  }

  function draw(ctx) {
    for (const e of list) {
      if (e.dead) continue;
      const boss = e.key === 'boss';
      const sc = boss ? 1.6 : 1;
      const alpha = Math.min(1, e.age * 5);

      // glow so enemies never vanish into the dark causeway
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gcol = (e.key === 'wisp' || e.key === 'shade' || e.key === 'gloamling')
        ? 'rgba(170,125,255,0.20)' : 'rgba(255,105,105,0.13)';
      const gr = Math.round((boss ? 18 : 10) * sc);
      ctx.globalAlpha = alpha;
      ctx.drawImage(glowSprite(gcol, gr), e.x - gr, e.y - gr, gr * 2, gr * 2);
      ctx.restore();

      // shadow
      ctx.globalAlpha = (e.fly ? 0.16 : 0.4) * alpha;
      ctx.fillStyle = '#04060a';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + (e.fly ? 10 : 8), e.r + (boss ? 3 : 1), boss ? 4 : 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // boss ward aura
      if (e.ward) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const ag = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, 26);
        ag.addColorStop(0, 'rgba(190,120,255,0.26)');
        ag.addColorStop(1, 'rgba(190,120,255,0)');
        ctx.fillStyle = ag;
        ctx.fillRect(e.x - 26, e.y - 26, 52, 52);
        ctx.restore();
      }

      // bob for flyers
      const bob = e.fly ? Math.sin(e.age * 5 + e.phase) * 1.5 : 0;
      GK.Spr.draw(ctx, e.spr, e.x, e.y + bob, { scale: sc, alpha, flash: e.flash });

      // frost sparkle
      if (e.slowT > 0) {
        ctx.fillStyle = P.frostLit;
        const sx = e.x + Math.sin(e.age * 9) * 5;
        const sy = e.y - 7 * sc + bob;
        ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
        ctx.globalAlpha = 0.5;
        ctx.fillRect(Math.round(sx) - 1, Math.round(sy) + 1, 3, 1);
        ctx.globalAlpha = 1;
      }

      // mark: gold chevron
      if (e.markT > 0) {
        const my = Math.round(e.y - (boss ? 16 : 11));
        ctx.fillStyle = P.gold;
        ctx.fillRect(Math.round(e.x) - 2, my, 5, 1);
        ctx.fillRect(Math.round(e.x) - 1, my + 1, 3, 1);
        if (boss) {
          // a marked Sovereign loses its armour: say it on the body, not just in the strip
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255,209,102,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 15 + Math.sin(e.age * 6) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // stun: two sparks orbiting
      if (e.stunT > 0) {
        const a0 = e.age * 8;
        for (let i = 0; i < 2; i++) {
          const a = a0 + i * Math.PI;
          ctx.fillStyle = '#ffe07a';
          ctx.fillRect(Math.round(e.x + Math.cos(a) * 5), Math.round(e.y - 9 * sc + Math.sin(a) * 2), 1, 1);
        }
      }

      // health bar
      if (e.hp < e.maxHp) {
        const w = boss ? 30 : 14;
        const x = Math.round(e.x - w / 2);
        const y = Math.round(e.y - (boss ? 18 : 10));
        const pct = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(5,6,10,0.85)';
        ctx.fillRect(x - 1, y - 1, w + 2, boss ? 5 : 3);
        ctx.fillStyle = '#3a2030';
        ctx.fillRect(x, y, w, boss ? 3 : 1);
        ctx.fillStyle = pct > 0.5 ? '#7ee06b' : (pct > 0.25 ? '#ffc247' : '#ff5c5c');
        ctx.fillRect(x, y, Math.max(1, Math.round(w * pct)), boss ? 3 : 1);
      }
    }
  }

  GK.Enemies = {
    reset() { list = []; },
    list() { return list; },
    spawn, applyDamage, applySlow, applyMark, applyStun, update, draw,
    count() { return list.filter(e => !e.dead).length; },
    boss() { return list.find(e => !e.dead && e.key === 'boss') || null; }
  };
})();
