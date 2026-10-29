/* Grave Lantern — DOM-free simulation. Renderer and tests both drive these functions. */
(function (root) {
  'use strict';

  var W = 1800, H = 1400;
  var RUN_TIME = 180;          // 3:00 → boss
  var WAVE_TIME = 18;          // 10 waves
  var MAX_ENEMIES = 130;
  // live-enemy cap and spawn gap for the streaming late waves (7-10)
  var STREAM_CAP = { 7: 52, 8: 68, 9: 84, 10: 100 };
  var STREAM_GAP = { 7: 0.38, 8: 0.34, 9: 0.3, 10: 0.26 };

  var DIRS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function len(x, y) { return Math.sqrt(x * x + y * y); }

  function dirName(x, y) {
    if (!x && !y) return 'S';
    var a = Math.atan2(y, x); // screen space: +y down
    var idx = Math.round(a / (Math.PI / 4)); // -4..4
    // map angle → compass (E=0, SE=1 ... )
    var map = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    var i = ((idx % 8) + 8) % 8;
    return map[i];
  }

  function createState(seed) {
    var s = {
      seed: seed == null ? 1337 : seed,
      rng: mulberry32(seed == null ? 1337 : seed),
      mode: 'menu',           // menu | run | levelup | paused | win | lose
      time: 0, wave: 1, timer: RUN_TIME,
      hp: 140, maxHp: 140, level: 1, xp: 0, xpToNext: 5,
      score: 0, kills: 0, gold: 0, survived: 0,
      player: {
        x: W / 2, y: H / 2, facing: { x: 0, y: 1 }, moveDir: 'S',
        moving: false, animT: 0, dashT: 0, dashCd: 0, invuln: 0,
        attackCd: 0, swing: 0, hurt: 0, hitFlash: 0, dead: 0, dashSet: {}
      },
      enemies: [], bolts: [], pickups: [], particles: [], events: [],
      upgrades: { blade: 0, swift: 0, boots: 0, vigor: 0, reach: 0, magnet: 0, dash: 0 },
      choices: [], bossSpawned: false, bossAlive: false, boss: null,
      spawnedThisWave: 0, spawnTotal: 0, spawnTimer: 0, nextId: 0,
      waveBanner: 0, endT: 0, shake: 0, best: 0,
      input: { x: 0, y: 0, dash: false }
    };
    return s;
  }

  // The curve has to RISE to the end. The playtest measured a peak at wave 6 and a victory lap
  // over waves 7-9, so the late waves now carry a quadratic term on hp and count instead of a line.
  function late(wave) { return Math.max(0, wave - 6); }
  function waveTotal(wave) { return 12 + wave * 5 + late(wave) * 10; }   // 17 … 42 … 90
  function minionHp(wave) { return 24 + 4 * (wave - 1) + 1 * late(wave) * late(wave); }
  function minionSpeed(wave) { return 46 + 2.2 * (wave - 1) + 2 * late(wave); }
  function minionDmg(wave) { return 5 + 1.1 * (wave - 1) + 0.5 * late(wave); }
  function mageHp(wave) { return 20 + 3 * (wave - 1) + 1 * late(wave) * late(wave); }
  function mageSpeed(wave) { return 38 + 2 * (wave - 1); }
  function bruteHp(wave) { return minionHp(wave) * 2.6; }
  function bruteSpeed(wave) { return minionSpeed(wave) * 0.72; }
  function bruteDmg(wave) { return minionDmg(wave) * 1.35; }

  function stats(s) {
    var u = s.upgrades;
    return {
      speed: 205 * (1 + 0.12 * u.boots),
      damage: 16 * (1 + 0.35 * u.blade),
      attackCd: 0.52 / (1 + 0.18 * u.swift),
      range: 126 * (1 + 0.20 * u.reach),
      arc: 2.00 + 0.25 * u.reach,
      magnet: 46 + 60 * u.magnet,
      dashCd: Math.max(1.2, 2.4 * (1 - 0.25 * u.dash))
    };
  }

  function startRun(s) {
    var st = stats(s);
    s.mode = 'run';
    // A run starts from the base knight. maxHp is a run value, not a page value: leaving the
    // VIGOR bonus in place made every later run silently easier (playtest BROKEN 1).
    s.maxHp = 140;
    s.time = 0; s.wave = 1; s.timer = RUN_TIME;
    s.hp = s.maxHp; s.level = 1; s.xp = 0; s.xpToNext = 5;
    s.score = 0; s.kills = 0; s.gold = 0;
    s.enemies = []; s.bolts = []; s.pickups = []; s.particles = []; s.events = [];
    s.upgrades = { blade: 0, swift: 0, boots: 0, vigor: 0, reach: 0, magnet: 0, dash: 0 };
    s.rng = mulberry32(s.seed);
    s.bossSpawned = false; s.bossAlive = false; s.boss = null;
    s.player.x = W / 2; s.player.y = H / 2;
    s.player.facing = { x: 0, y: 1 }; s.player.moveDir = 'S';
    s.player.dashT = 0; s.player.dashCd = 0; s.player.invuln = 0;
    s.player.attackCd = 0; s.player.swing = 0; s.player.hurt = 0; s.player.hitFlash = 0; s.player.dead = 0;
    s.player.dashSet = {};
    s.nextId = 0;
    s.spawnTotal = waveTotal(1); s.spawnedThisWave = 0;
    s.spawnTimer = 0.5; s.waveBanner = 1.2; s.endT = 0; s.shake = 0;
    s.choices = []; s.input.x = 0; s.input.y = 0; s.input.dash = false;
    s.player._speed = st.speed;
    emit(s, 'start');
    emit(s, 'wave', { wave: 1 });
  }

  function emit(s, type, data) {
    var e = { type: type };
    if (data) for (var k in data) e[k] = data[k];
    s.events.push(e);
    if (s.events.length > 240) s.events.shift();
  }

  function spawnEnemy(s, kind, x, y, wave) {
    var e;
    if (kind === 'mage') {
      e = { kind: 'mage', x: x, y: y, hp: mageHp(wave), maxHp: mageHp(wave), speed: mageSpeed(wave),
            r: 13, dmg: 0, hitCd: 0, fireCd: 1.2 + s.rng() * 1.4, animT: s.rng() * 2,
            dir: 'S', xp: 4, charge: 0, flash: 0, kb: { x: 0, y: 0 } };
    } else if (kind === 'brute') {
      e = { kind: 'brute', x: x, y: y, hp: bruteHp(wave), maxHp: bruteHp(wave), speed: bruteSpeed(wave),
            r: 19, dmg: bruteDmg(wave), hitCd: 0, animT: s.rng() * 2, wind: 0, lunge: 0, lungeCd: 1 + s.rng(),
            dir: 'S', xp: 8, flash: 0, kb: { x: 0, y: 0 } };
    } else {
      e = { kind: 'minion', x: x, y: y, hp: minionHp(wave), maxHp: minionHp(wave), speed: minionSpeed(wave),
            r: 14, dmg: minionDmg(wave), hitCd: 0, animT: s.rng() * 2, wind: 0, lunge: 0, lungeCd: 1 + s.rng(),
            dir: 'S', xp: 3, flash: 0, kb: { x: 0, y: 0 } };
    }
    e.id = ++s.nextId;
    s.enemies.push(e);
    return e;
  }

  function pickKind(s) {
    var i = s.spawnedThisWave;
    if (s.wave >= 7 && i % (s.wave >= 8 ? 6 : 9) === 4) return 'brute';
    if (s.wave >= 5 && i % (s.wave >= 7 ? 4 : 6) === 5) return 'mage';
    return 'minion';
  }

  function ringSpawn(s, kind) {
    var a = s.rng() * Math.PI * 2;
    var r = 330 + s.rng() * 80;
    var x = clamp(s.player.x + Math.cos(a) * r, 40, W - 40);
    var y = clamp(s.player.y + Math.sin(a) * r, 40, H - 40);
    // if clamped to a wall, walk the ring until inside
    if (len(x - s.player.x, y - s.player.y) < 200) {
      for (var i = 0; i < 8; i++) {
        var a2 = s.rng() * Math.PI * 2;
        x = clamp(s.player.x + Math.cos(a2) * r, 40, W - 40);
        y = clamp(s.player.y + Math.sin(a2) * r, 40, H - 40);
        if (len(x - s.player.x, y - s.player.y) >= 200) break;
      }
    }
    var e = spawnEnemy(s, kind, x, y, s.wave);
    emit(s, 'spawn', { x: x, y: y, kind: kind });
    return e;
  }

  function spawnBoss(s) {
    var a = s.rng() * Math.PI * 2;
    var x = clamp(s.player.x + Math.cos(a) * 260, 80, W - 80);
    var y = clamp(s.player.y + Math.sin(a) * 260, 80, H - 80);
    // The Warden is a fight, not a bag of hp: he closes ground, telegraphs a charge, and keeps
    // summoning. The old arrival deleted the whole horde within 520 px, which emptied wave 10.
    var b = { kind: 'boss', x: x, y: y, hp: 1300, maxHp: 1300, speed: 62, r: 40,
              dmg: 16, hitCd: 0, animT: 0, dir: 'S', xp: 25, flash: 0, kb: { x: 0, y: 0 },
              slamCd: 3, slamCharge: 0, chargeCd: 5, chargeWind: 0, chargeT: 0, summonCd: 5 };
    s.boss = b;
    s.enemies.push(b);
    s.bossAlive = true;
    s.bossSpawned = true;
    s.bossTime = 0;
    emit(s, 'boss');
  }

  function hurtPlayer(s, amount, fromX, fromY) {
    var p = s.player;
    if (p.invuln > 0 || s.mode !== 'run') return false;
    s.hp -= amount;
    p.invuln = 0.70;
    p.hurt = 0.32;
    s.shake = Math.min(16, s.shake + 7);
    emit(s, 'hurt', { amount: amount });
    if (s.hp <= 0) {
      s.hp = 0;
      s.mode = 'lose';
      s.endT = 0;
      s.survived = s.time;
      emit(s, 'lose');
    }
    return true;
  }

  function damageEnemy(s, e, dmg, kx, ky) {
    e.hp -= dmg;
    e.flash = 0.14;
    e.kb.x += kx * 60; e.kb.y += ky * 60;
    if (e.hp <= 0) killEnemy(s, e);
    else if (s.rng() < 0.18) emit(s, 'hit', { x: e.x, y: e.y, dmg: dmg });
  }

  function killEnemy(s, e) {
    if (e.dead) return;
    e.dead = true;
    s.kills++;
    s.score += e.kind === 'boss' ? 500 : e.kind === 'mage' ? 14 : 10;
    emit(s, 'death', { x: e.x, y: e.y, kind: e.kind, dir: e.dir });
    // gem drop
    s.pickups.push({ kind: 'gem', x: e.x, y: e.y, vx: (s.rng() - 0.5) * 60, vy: (s.rng() - 0.5) * 60,
                     value: e.xp, t: 0, r: 12 });
    if (s.rng() < 0.20) s.pickups.push({ kind: 'gold', x: e.x + 14, y: e.y + 8, vx: 0, vy: 0, value: 1, t: 0, r: 12 });
    if (s.rng() < 0.07) s.pickups.push({ kind: 'potion', x: e.x - 14, y: e.y + 6, vx: 0, vy: 0, value: 20, t: 0, r: 13 });
    if (e.kind === 'boss') {
      s.bossAlive = false;
      s.score += Math.floor(s.hp) * 2 + 250;
      s.mode = 'win';
      s.endT = 0;
      s.survived = s.time;
      emit(s, 'win');
    }
  }

  function levelUp(s) {
    while (s.xp >= s.xpToNext) {
      s.xp -= s.xpToNext;
      s.level++;
      s.xpToNext = 5 + (s.level - 1) * 4;
    }
    openChoices(s);
  }

  function gainXp(s, v) {
    s.xp += v;
    if (s.mode === 'run' && s.xp >= s.xpToNext) levelUp(s);
  }

  var POOL = [
    { id: 'blade',  name: 'BLADE',  desc: '+35% sword damage' },
    { id: 'swift',  name: 'SWIFT',  desc: '+18% attack speed' },
    { id: 'reach',  name: 'REACH',  desc: '+20% reach, wider arc' },
    { id: 'boots',  name: 'BOOTS',  desc: '+12% move speed' },
    { id: 'vigor',  name: 'VIGOR',  desc: '+25 max HP, heal 25' },
    { id: 'magnet', name: 'MAGNET', desc: '+60 gem pull radius' },
    { id: 'dash',   name: 'DASH',   desc: '-25% dash cooldown' }
  ];

  function openChoices(s) {
    var avail = POOL.filter(function (u) { return s.upgrades[u.id] < 4; });
    if (!avail.length) { s.choices = []; s.mode = 'run'; emit(s, 'maxed'); return; }
    // shuffle deterministically
    var arr = avail.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(s.rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    s.choices = arr.slice(0, Math.min(3, arr.length));
    s.mode = 'levelup';
    emit(s, 'levelup', { level: s.level });
  }

  function chooseUpgrade(s, id) {
    if (s.mode !== 'levelup') return false;
    var found = s.choices.some(function (c) { return c.id === id; });
    if (!found || s.upgrades[id] >= 4) return false;
    s.upgrades[id]++;
    if (id === 'vigor') { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); }
    s.choices = [];
    s.mode = 'run';
    emit(s, 'upgrade', { id: id, level: s.upgrades[id] });
    if (s.xp >= s.xpToNext) levelUp(s); // banked XP can trigger the next menu
    return true;
  }

  function nearestEnemy(s, maxR) {
    var p = s.player, best = null, bd = maxR * maxR;
    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (e.dead) continue;
      var d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function swing(s) {
    var st = stats(s), p = s.player;
    var f = p.facing, fl = len(f.x, f.y) || 1;
    f = { x: f.x / fl, y: f.y / fl };
    var hits = 0;
    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (e.dead) continue;
      var dx = e.x - p.x, dy = e.y - p.y;
      var d = len(dx, dy);
      if (d > st.range + e.r) continue;
      var dot = (dx / (d || 1)) * f.x + (dy / (d || 1)) * f.y;
      var ang = Math.acos(clamp(dot, -1, 1));
      if (ang <= st.arc / 2) {
        damageEnemy(s, e, st.damage, dx / (d || 1), dy / (d || 1));
        hits++;
      }
    }
    p.swing = 0.22;
    s.shake = Math.min(10, s.shake + 1.4);
    emit(s, 'swing', { x: p.x, y: p.y, dir: dirName(f.x, f.y), hits: hits, range: st.range, arc: st.arc });
    return hits;
  }

  // While the card menu is open the crypt holds still, but the knight can still shift his feet.
  // Standing rooted in a horde to read three cards is how a phone player dies; and a frozen
  // world that also freezes the thumb reads as a stutter.
  function moveOnly(s, dt, input) {
    dt = Math.min(dt, 0.05);
    var p = s.player;
    if (input) {
      s.input.x = input.x || 0;
      s.input.y = input.y || 0;
      s.input.dash = false;
    }
    var ix = s.input.x || 0, iy = s.input.y || 0;
    var il = Math.sqrt(ix * ix + iy * iy);
    if (il > 1) { ix /= il; iy /= il; il = 1; }
    var moved = false;
    if (il > 0.08) {
      var spd = stats(s).speed;
      p.x += ix * spd * dt;
      p.y += iy * spd * dt;
      p.facing = { x: ix, y: iy };
      p.moveDir = dirName(ix, iy);
      p.animT += dt;
      moved = true;
    }
    p.moving = moved;
    p.dashT = 0;
    p.swing = Math.max(0, p.swing - dt * 4);
    p.x = clamp(p.x, 26, W - 26);
    p.y = clamp(p.y, 26, H - 26);
  }

  function update(s, dt, input) {
    if (s.mode === 'win' || s.mode === 'lose') { s.endT += dt; return; }
    if (s.mode === 'levelup') { moveOnly(s, dt, input); return; }
    if (s.mode === 'menu' || s.mode === 'paused') return;
    if (s.mode !== 'run') return;

    dt = Math.min(dt, 0.05);
    var p = s.player, st = stats(s);
    s.time += dt;
    s.survived = s.time;

    if (input) {
      s.input.x = input.x || 0;
      s.input.y = input.y || 0;
      if (input.dash) s.input.dash = true;
    }

    // timer + waves
    s.timer = Math.max(0, RUN_TIME - s.time);
    var wave = Math.min(10, Math.floor(s.time / WAVE_TIME) + 1);
    if (wave !== s.wave) {
      s.wave = wave;
      s.spawnTotal = waveTotal(wave);
      s.spawnedThisWave = 0;
      s.spawnTimer = 0.2;
      s.waveBanner = 1.6;
      emit(s, 'wave', { wave: wave });
    }
    if (s.waveBanner > 0) s.waveBanner -= dt;

    if (!s.bossSpawned && s.time >= RUN_TIME) spawnBoss(s);

    // spawn wave enemies. Waves 1-6 are bursts (the horde arrives, then you clear it). Waves 7-10
    // stream continuously against a rising live cap — that is what makes the last minute the
    // hardest minute, instead of a victory lap over an empty floor (playtest BROKEN 2).
    if (!s.bossSpawned) {
      s.spawnTimer -= dt;
      if (s.wave < 7) {
        var interval = (WAVE_TIME * 0.7) / s.spawnTotal;
        while (s.spawnTimer <= 0 && s.spawnedThisWave < s.spawnTotal && s.enemies.length < MAX_ENEMIES) {
          var perTick = s.wave >= 5 ? 2 : 2;
          for (var q = 0; q < perTick && s.spawnedThisWave < s.spawnTotal; q++) {
            ringSpawn(s, pickKind(s));
            s.spawnedThisWave++;
          }
          s.spawnTimer += interval;
        }
      } else {
        var liveCap = STREAM_CAP[s.wave] || 60;
        var live = 0;
        for (var ai = 0; ai < s.enemies.length; ai++) if (!s.enemies[ai].dead) live++;
        if (s.spawnTimer <= 0 && live < liveCap && s.enemies.length < MAX_ENEMIES) {
          var n = s.wave >= 8 ? 2 : 1;
          for (var q2 = 0; q2 < n && live < liveCap; q2++) { ringSpawn(s, pickKind(s)); live++; s.spawnedThisWave++; }
          s.spawnTimer = STREAM_GAP[s.wave] || 1.0;
        }
      }
    } else {
      // boss fight: a trickle of minions
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0 && s.enemies.length < MAX_ENEMIES - 10) {
        ringSpawn(s, s.rng() < 0.25 ? 'mage' : 'minion');
        s.spawnTimer = 1.5;
      }
    }

    // dash
    p.dashCd = Math.max(0, p.dashCd - dt);
    // move vector (also the dash direction when the thumb is held)
    var ix = s.input.x, iy = s.input.y;
    var il = len(ix, iy);
    if (s.input.dash && p.dashCd <= 0 && s.mode === 'run') {
      s.input.dash = false;
      var dd = il > 0.12 ? { x: ix, y: iy } : p.facing;
      var ddl = len(dd.x, dd.y) || 1;
      p.facing = { x: dd.x / ddl, y: dd.y / ddl };
      p.moveDir = dirName(p.facing.x, p.facing.y);
      p.dashT = 0.18;
      p.dashCd = st.dashCd;
      p.invuln = Math.max(p.invuln, 0.35);
      p.dashSet = {};
      s.shake = Math.min(12, s.shake + 3);
      emit(s, 'dash', { x: p.x, y: p.y, dir: p.moveDir });
    }
    if (il > 1) { ix /= il; iy /= il; il = 1; }
    var spd = st.speed;
    var moved = false;
    if (p.dashT > 0) {
      p.dashT -= dt;
      var dx2 = p.facing.x, dy2 = p.facing.y;
      var dl = len(dx2, dy2) || 1;
      p.x += (dx2 / dl) * spd * 3.6 * dt;
      p.y += (dy2 / dl) * spd * 3.6 * dt;
      moved = true;
    } else if (il > 0.08) {
      p.x += ix * spd * dt;
      p.y += iy * spd * dt;
      p.facing = { x: ix, y: iy };
      p.moveDir = dirName(ix, iy);
      moved = true;
    }
    p.moving = moved;
    if (moved) p.animT += dt * (p.dashT > 0 ? 2.2 : 1);
    p.x = clamp(p.x, 26, W - 26);
    p.y = clamp(p.y, 26, H - 26);

    // invuln / flash timers
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurt = Math.max(0, p.hurt - dt);
    p.swing = Math.max(0, p.swing - dt * 4);
    p.attackCd = Math.max(0, p.attackCd - dt);
    s.shake = Math.max(0, s.shake * Math.pow(0.001, dt));

    // auto attack
    if (p.attackCd <= 0) {
      var target = nearestEnemy(s, st.range + 26);
      if (target) {
        // Unit vector. A raw offset was leaking out here and render.js multiplied it by 26,
        // so the camera could lead the knight by hundreds of pixels.
        var tx = target.x - p.x, ty = target.y - p.y;
        var tl = len(tx, ty) || 1;
        p.facing = { x: tx / tl, y: ty / tl };
        p.moveDir = dirName(p.facing.x, p.facing.y);
        swing(s);
        p.attackCd = st.attackCd;
      }
    }

    // enemies
    var alive = [];
    // At most a few enemies may commit to a lunge at once. Without this cap every skeleton near
    // the knight lunges, and the telegraph stops being readable — it is just constant chip damage.
    var lungeCap = s.wave >= 8 ? 3 : 2, lunging = 0;
    for (var li = 0; li < s.enemies.length; li++) {
      var le = s.enemies[li];
      if (le.wind > 0 || le.lunge > 0) lunging++;
    }
    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      var ex = p.x - e.x, ey = p.y - e.y;
      var ed = len(ex, ey) || 1;
      var ux = ex / ed, uy = ey / ed;

      if (e.kind === 'boss') {
        s.bossTime = (s.bossTime || 0) + dt;
        if (!e.phase2 && e.hp <= e.maxHp * 0.5) {
          e.phase2 = true;
          e.slamCd = Math.min(e.slamCd, 1.2);
          emit(s, 'bossphase', { x: e.x, y: e.y });
          for (var q2 = 0; q2 < 4; q2++) ringSpawn(s, q2 % 2 ? 'minion' : 'mage');
        }
        if (s.bossTime > 40 && !e.enraged) { e.enraged = true; e.speed = 100; e.chargeCd = Math.min(e.chargeCd, 2); emit(s, 'enrage'); }
      }
      if (e.kind === 'mage') {
        // hold range and shoot
        var want = 210;
        var sp = ed > want + 30 ? 1 : ed < want - 30 ? -0.7 : 0;
        e.x += ux * e.speed * sp * dt;
        e.y += uy * e.speed * sp * dt;
        if (e.charge > 0) {
          e.charge -= dt;
          if (e.charge <= 0) {
            e.fireCd = 3.0 + s.rng() * 0.7;
            s.bolts.push({ x: e.x, y: e.y - 10, vx: ux * 165, vy: uy * 165, dmg: 6 + 0.8 * s.wave, life: 4, r: 7 });
            emit(s, 'bolt', { x: e.x, y: e.y });
          }
        } else {
          e.fireCd -= dt;
          if (e.fireCd <= 0 && ed < 340) { e.charge = 0.45; emit(s, 'charge', { x: e.x, y: e.y }); }
        }
      } else if (e.kind === 'boss') {
        // THE WARDEN — closes ground, telegraphs a charge, slams when close, keeps summoning.
        if (e.chargeT > 0) {
          e.chargeT -= dt;                              // homing rush: move now, the knight must dash
          e.x += ux * 560 * dt; e.y += uy * 560 * dt;
          e.animT += dt * 2;
        } else if (e.chargeWind > 0) {
          e.chargeWind -= dt;
          if (e.chargeWind <= 0) {
            e.chargeT = 0.34; e.chargeCd = 6.5;
            emit(s, 'bosscharge', { x: e.x, y: e.y });
          }
        } else {
          e.x += ux * e.speed * dt;
          e.y += uy * e.speed * dt;
          e.chargeCd = Math.max(0, e.chargeCd - dt);
          if (e.chargeCd <= 0 && ed > 130) { e.chargeWind = 0.7; emit(s, 'bosswind', { x: e.x, y: e.y }); }
          if (e.slamCharge > 0) {
            e.slamCharge -= dt;
            if (e.slamCharge <= 0) {
              e.slamCd = 4.5;
              s.shake = Math.min(20, s.shake + 12);
              emit(s, 'slam', { x: e.x, y: e.y });
              if (ed < 195) hurtPlayer(s, 16, e.x, e.y);
            }
          } else {
            e.slamCd -= dt;
            if (e.slamCd <= 0 && ed < 260) { e.slamCharge = 0.7; emit(s, 'slamcharge', { x: e.x, y: e.y }); }
          }
        }
        e.summonCd -= dt;
        if (e.summonCd <= 0) {
          e.summonCd = 6.5;
          if (s.enemies.length < MAX_ENEMIES - 6) {
            ringSpawn(s, 'minion');
            ringSpawn(s, s.wave >= 8 ? 'brute' : 'mage');
          }
        }
      } else {
        // MINION / BRUTE — walk in, then a telegraphed lunge. The 0.5 s red wind-up is the
        // skill beat: step off the line, or dash through it. It also stops a blind thumb-circle
        // from being a winning policy.
        if (e.lunge > 0) {
          e.lunge -= dt;
          e.x += ux * e.lungeSpd * dt;
          e.y += uy * e.lungeSpd * dt;
          e.animT += dt * 2.4;
          if (e.lunge <= 0) e.stun = 0.7;   // recovery window: step out while it is winded
        } else if (e.wind > 0) {
          e.wind -= dt;
          if (e.wind <= 0) {
            e.lunge = 0.40;
            e.lungeSpd = e.kind === 'brute' ? 270 : 300;
            e.lungeCd = 7.0 + s.rng() * 2.0;
            emit(s, 'lunge', { x: e.x, y: e.y, kind: e.kind });
          }
        } else if (e.stun > 0) {
          e.stun -= dt;
        } else {
          e.x += ux * e.speed * dt;
          e.y += uy * e.speed * dt;
          e.lungeCd -= dt;
          if (s.wave >= 4 && e.lungeCd <= 0 && ed < 150 && ed > 30 && lunging < lungeCap) {
            e.wind = 0.5; e.lungeCd = 99; lunging++;
            emit(s, 'windup', { x: e.x, y: e.y, kind: e.kind });
          }
        }
      }
      // knockback decay
      e.x += e.kb.x * dt; e.y += e.kb.y * dt;
      e.kb.x *= Math.pow(0.001, dt); e.kb.y *= Math.pow(0.001, dt);

      // keep inside arena
      e.x = clamp(e.x, 22, W - 22);
      e.y = clamp(e.y, 22, H - 22);

      // face the player
      e.dir = dirName(-ux, -uy);
      e.animT += dt;

      // separation
      for (var j = i + 1; j < s.enemies.length; j++) {
        var o = s.enemies[j];
        if (o.dead) continue;
        var sx = o.x - e.x, sy = o.y - e.y;
        var sd = len(sx, sy);
        var minD = e.r + o.r + 4;
        if (sd > 0.001 && sd < minD) {
          var push = (minD - sd) / 2;
          var nx = sx / sd, ny = sy / sd;
          e.x -= nx * push; e.y -= ny * push;
          o.x += nx * push; o.y += ny * push;
        }
      }

      // dash is an attack as well as an escape: cut everything passed through, once per dash
      if (p.dashT > 0 && !p.dashSet[e.id] && ed < e.r + 26) {
        p.dashSet[e.id] = 1;
        damageEnemy(s, e, st.damage * 0.6, p.facing.x, p.facing.y);
        emit(s, 'dashhit', { x: e.x, y: e.y });
      }

      // contact damage — a lunge hits harder than a walk-in, and a boss charge hits hard
      e.hitCd = Math.max(0, e.hitCd - dt);
      var cdmg = e.dmg;
      if (e.lunge > 0) cdmg *= 1.0;
      if (e.kind === 'boss' && e.chargeT > 0) cdmg = 24;
      if (ed < e.r + 15 && e.hitCd <= 0 && e.kind !== 'mage') {
        if (hurtPlayer(s, cdmg, e.x, e.y)) e.hitCd = 0.8;
      }
      if (!e.dead) alive.push(e);
    }
    s.enemies = alive;
    if (s.boss && s.boss.dead) { s.boss = null; }

    // bolts
    var bl = [];
    for (var b = 0; b < s.bolts.length; b++) {
      var bo = s.bolts[b];
      bo.x += bo.vx * dt; bo.y += bo.vy * dt; bo.life -= dt;
      if (bo.life <= 0 || bo.x < -40 || bo.y < -40 || bo.x > W + 40 || bo.y > H + 40) continue;
      var bd = len(bo.x - p.x, bo.y - p.y);
      if (bd < bo.r + 15) { hurtPlayer(s, bo.dmg, bo.x, bo.y); continue; }
      bl.push(bo);
    }
    s.bolts = bl;

    // pickups
    var keep = [];
    for (var k = 0; k < s.pickups.length; k++) {
      var pu = s.pickups[k];
      pu.t += dt;
      pu.x += pu.vx * dt; pu.y += pu.vy * dt;
      pu.vx *= Math.pow(0.02, dt); pu.vy *= Math.pow(0.02, dt);
      var pd = len(pu.x - p.x, pu.y - p.y);
      var pull = pu.kind === 'gem' ? st.magnet : 30;
      if (pd < pull + 30) {
        // magnet
        pu.x += (p.x - pu.x) * Math.min(1, dt * 9);
        pu.y += (p.y - pu.y) * Math.min(1, dt * 9);
      }
      if (pd < 26) {
        if (pu.kind === 'gem') { gainXp(s, pu.value); emit(s, 'gem', { x: pu.x, y: pu.y }); }
        else if (pu.kind === 'gold') { s.gold++; s.score += 25; emit(s, 'coin', { x: pu.x, y: pu.y }); }
        else if (pu.kind === 'potion') { s.hp = Math.min(s.maxHp, s.hp + pu.value); emit(s, 'potion', { x: pu.x, y: pu.y }); }
        continue;
      }
      if (pu.t > 40) continue;
      keep.push(pu);
    }
    s.pickups = keep;

    // particles are visual state, advanced by the renderer
  }

  root.GraveSim = {
    W: W, H: H, RUN_TIME: RUN_TIME, WAVE_TIME: WAVE_TIME,
    DIRS: DIRS, POOL: POOL,
    createState: createState, startRun: startRun, update: update,
    chooseUpgrade: chooseUpgrade, stats: stats,
    swing: swing, nearestEnemy: nearestEnemy, hurtPlayer: hurtPlayer,
    damageEnemy: damageEnemy, spawnEnemy: spawnEnemy, ringSpawn: ringSpawn,
    spawnBoss: spawnBoss, gainXp: gainXp, dirName: dirName,
    waveTotal: waveTotal, minionHp: minionHp, minionSpeed: minionSpeed,
    mulberry32: mulberry32, clamp: clamp
  };
})(typeof window !== 'undefined' ? window : globalThis);
