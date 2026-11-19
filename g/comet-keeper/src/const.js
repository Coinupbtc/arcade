// Comet Keeper — every number the game feels is here, and CONTRACT.md repeats them.
window.CK = window.CK || {};

CK.PAL = {
  ink: "#0a0a1e", teal: "#46e0b4", deep: "#1d7d8a", moon: "#dfe8f5",
  amber: "#ffb347", cyan: "#7fe9ff", magenta: "#ff6bd6", paper: "#eaf2ff"
};

CK.TUNE = {
  waveSeconds: 45,          // a wave is 45 s
  calm: 3,                  // first 3 s of every wave are calm
  spawnBase: 1.6,           // wave 1: one comet every 1.6 s
  spawnGrowth: 1.12,        // spawn rate rises 12 % per wave
  telegraph: 0.8,           // edge arrow 0.8 s before a comet appears
  deflectHitstop: 0.05,     // 50 ms
  crackHitstop: 0.09,       // 90 ms
  shakeDeflect: 2,          // px
  shakeCrack: 6,            // px, the cap the brief sets
  pulseCd: 12,              // seconds
  pulseRadius: 0.52,        // of min(w,h)
  maxCracks: 3,
  turnEase: 11,             // rad/s the moon can swing toward the thumb
  keyTurn: 3.6,             // rad/s with left/right
  chainWindow: 2.5,
  // geometry, all as a fraction of min(w,h)
  planetR: 0.086,
  orbitR: 0.335,
  moonR: 0.040,
  moonHit: 1.32,            // hit radius is 32 % larger than the drawn moon: forgiving
  cometR: 0.017,
  speed: 0.30,              // min(w,h) per second for a plain comet
  fastSpeed: 1.65,
  splitSpeed: 0.92,
  spawnRadius: 0.62,        // of the diagonal: always off screen
  scoreDeflect: 10
};

CK.COL = { plain: CK.PAL.amber, fast: CK.PAL.cyan, split: CK.PAL.magenta };

CK.G = {
  mode: "menu",
  score: 0, best: 0, wave: 1, waveT: 0, calm: 0,
  cracks: 0, maxCracks: CK.TUNE.maxCracks,
  w: 0, h: 0, s: 0, diag: 0,
  planet: { x: 0, y: 0, r: 0, wince: 0, hitFlash: 0 },
  orbitR: 0,
  moons: [], comets: [], parts: [], pops: [], tele: [],
  pulse: { cd: 0, max: CK.TUNE.pulseCd, flash: 0, ring: 0 },
  shake: 0, hitstop: 0,
  chain: 0, chainT: 0,
  spawnT: 0, time: 0,
  up: { moonScale: 1, twin: false, pulseCd: CK.TUNE.pulseCd, cometScale: 1 },
  stats: { deflects: 0, chains: 0 },
  offers: [],
  flash: 0
};

CK.Geom = function (w, h) {
  var G = CK.G, s = Math.min(w, h);
  G.w = w; G.h = h; G.s = s; G.diag = Math.hypot(w, h);
  G.planet.x = w / 2; G.planet.y = h / 2;
  G.planet.r = s * CK.TUNE.planetR;
  G.orbitR = s * CK.TUNE.orbitR;
};

CK.newRun = function () {
  var G = CK.G, T = CK.TUNE;
  G.score = 0; G.wave = 1; G.cracks = 0;
  G.comets = []; G.parts = []; G.pops = []; G.tele = [];
  G.chain = 0; G.chainT = 0; G.shake = 0; G.hitstop = 0; G.time = 0; G.flash = 0;
  G.planet.wince = 0; G.planet.hitFlash = 0;
  G.pulse = { cd: 0, max: T.pulseCd, flash: 0, ring: 0 };
  G.up = { moonScale: 1, twin: false, pulseCd: T.pulseCd, cometScale: 1 };
  G.stats = { deflects: 0, chains: 0 };
  G.moons = [{ a: -Math.PI / 2, spin: 0, squash: 0, hit: 0 }];
  if (G.up.twin) G.moons.push({ a: Math.PI / 2, spin: 0, squash: 0, hit: 0 });
};

CK.startWave = function (n) {
  var G = CK.G, T = CK.TUNE;
  G.wave = n;
  G.waveT = T.waveSeconds;
  G.calm = T.calm;
  G.spawnT = 0.5;
  G.tele = [];
  G.offers = [];
};

CK.moonR = function (i) {
  var G = CK.G;
  var base = G.s * CK.TUNE.moonR * G.up.moonScale;
  return i === 0 ? base : base * 0.72;
};

CK.moonPos = function (i) {
  var G = CK.G, m = G.moons[i];
  var r = G.orbitR * (i === 0 ? 1 : 1);
  return { x: G.planet.x + Math.cos(m.a) * r, y: G.planet.y + Math.sin(m.a) * r };
};

CK.cometR = function (type) {
  var G = CK.G, base = G.s * CK.TUNE.cometR;
  if (type === "fast") return base * 0.72;
  if (type === "split") return base * 1.28;
  return base;
};

CK.spawnComet = function (angle, type) {
  var G = CK.G, T = CK.TUNE;
  var r = CK.cometR(type);
  var spawnR = G.diag * T.spawnRadius;
  var x = G.planet.x + Math.cos(angle) * spawnR;
  var y = G.planet.y + Math.sin(angle) * spawnR;
  // wave 1 teaches: 55 % are aimed at the world; later waves 68 %. The rest cut past (still worth deflecting).
  var aimed = Math.random() < (G.wave <= 1 ? 0.55 : 0.68);
  var tx = G.planet.x, ty = G.planet.y;
  if (!aimed) {
    var side = Math.random() < 0.5 ? 1 : -1;
    var off = G.planet.r * (1.9 + Math.random() * 1.6) * side;
    tx += Math.cos(angle + Math.PI / 2) * off;
    ty += Math.sin(angle + Math.PI / 2) * off;
  } else {
    var j = G.planet.r * 0.55;
    tx += (Math.random() - 0.5) * j;
    ty += (Math.random() - 0.5) * j;
  }
  var dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
  var speed = G.s * T.speed * G.up.cometScale * (1 + (G.wave - 1) * 0.03);
  if (type === "fast") speed *= T.fastSpeed;
  if (type === "split") speed *= T.splitSpeed;
  G.comets.push({
    x: x, y: y, vx: dx / d * speed, vy: dy / d * speed,
    r: r, type: type, state: "in", spin: Math.random() * 6.28, born: G.time, pushed: false, hurt: 0
  });
};

CK.pickType = function (wave) {
  var r = Math.random();
  if (wave <= 1) return "plain";
  if (wave === 2) return r < 0.7 ? "plain" : "fast";
  if (wave === 3) return r < 0.55 ? "plain" : (r < 0.8 ? "fast" : "split");
  return r < 0.45 ? "plain" : (r < 0.75 ? "fast" : "split");
};

CK.spawnInterval = function () {
  var G = CK.G, T = CK.TUNE;
  return T.spawnBase / Math.pow(T.spawnGrowth, G.wave - 1);
};

CK.pulseReady = function () { return CK.G.pulse.cd <= 0; };

CK.firePulse = function () {
  var G = CK.G, T = CK.TUNE;
  if (G.mode !== "play" || G.pulse.cd > 0) return false;
  var R = G.s * T.pulseRadius;
  G.pulse.cd = G.up.pulseCd;
  G.pulse.flash = 1; G.pulse.ring = 0.001;
  G.shake = Math.max(G.shake, 3);
  for (var i = 0; i < G.comets.length; i++) {
    var c = G.comets[i];
    if (c.state !== "in") continue;
    var dx = c.x - G.planet.x, dy = c.y - G.planet.y, d = Math.hypot(dx, dy) || 1;
    if (d > R + c.r) continue;
    var sp = Math.hypot(c.vx, c.vy) * 1.35;
    c.vx = dx / d * sp; c.vy = dy / d * sp;
    c.state = "out"; c.pushed = true; c.hurt = 1;
    CK.burst(c.x, c.y, 6, CK.PAL.paper, 90);
  }
  CK.burst(G.planet.x, G.planet.y, 26, CK.PAL.paper, 220, true);
  CK.Audio.play("pulse");
  return true;
};

CK.burst = function (x, y, n, color, speed, add) {
  var G = CK.G;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * 6.283, v = speed * (0.35 + Math.random() * 0.8);
    G.parts.push({
      x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      t: 0, life: 0.35 + Math.random() * 0.5, r: G.s * (0.004 + Math.random() * 0.008),
      color: color, add: !!add
    });
  }
};

CK.pop = function (x, y, text, color, size) {
  CK.G.pops.push({ x: x, y: y, text: text, color: color || CK.PAL.paper, size: size || 1, t: 0, life: 0.95 });
};

CK.addScore = function (n, x, y, label, color) {
  var G = CK.G;
  G.score += n;
  if (G.score > G.best) { G.best = G.score; CK.saveBest(G.best); }
  if (label) CK.pop(x, y, label, color);
};

CK.saveBest = function (v) {
  try { localStorage.setItem("cometkeeper.best", String(v)); } catch (e) {}
};
CK.loadBest = function () {
  try { var v = parseInt(localStorage.getItem("cometkeeper.best") || "0", 10); return isFinite(v) ? v : 0; }
  catch (e) { return 0; }
};

CK.crack = function (c) {
  var G = CK.G, T = CK.TUNE;
  G.cracks++;
  G.planet.wince = 1;
  G.planet.hitFlash = 1;
  G.shake = T.shakeCrack;
  G.hitstop = T.crackHitstop;
  G.flash = 0.55;
  CK.burst(c.x, c.y, 22, CK.PAL.amber, 190, true);
  CK.burst(G.planet.x, G.planet.y, 18, CK.PAL.teal, 150, true);
  CK.Audio.play("crack");
  if (G.cracks >= G.maxCracks) CK.gameOver();
  else CK.pop(G.planet.x, G.planet.y - G.planet.r * 1.4, "CRACK " + G.cracks + "/" + G.maxCracks, "#ff8a8a", 1.1);
};

CK.gameOver = function () {
  var G = CK.G;
  if (G.mode === "over") return;
  G.mode = "over";
  if (G.score > G.best) { G.best = G.score; CK.saveBest(G.best); }
  G.shake = 6;
  CK.Audio.play("over");
  CK.Audio.music(false);
  CK.UI.showOver();
};

CK.deflect = function (c, mi) {
  var G = CK.G, T = CK.TUNE;
  var m = G.moons[mi], p = CK.moonPos(mi);
  var nx = c.x - p.x, ny = c.y - p.y, d = Math.hypot(nx, ny) || 1;
  nx /= d; ny /= d;
  var dot = c.vx * nx + c.vy * ny;
  var rx = c.vx - 2 * dot * nx;
  var ry = c.vy - 2 * dot * ny;
  // the moon's spin bends the ball: tangential push from how fast the moon is sweeping
  var tx = -ny, ty = nx;
  var spin = Math.max(-9, Math.min(9, m.spin));
  rx += tx * spin * 18;
  ry += ty * spin * 18;
  var sp = Math.hypot(rx, ry) || 1;
  var want = Math.hypot(c.vx, c.vy) * 1.12;
  rx = rx / sp * want; ry = ry / sp * want;
  // never let a deflect send it back into the moon
  if (rx * nx + ry * ny < 0) { rx = -rx; ry = -ry; }
  c.x = p.x + nx * (c.r + CK.moonR(mi) * T.moonHit + 2);
  c.y = p.y + ny * (c.r + CK.moonR(mi) * T.moonHit + 2);
  c.vx = rx; c.vy = ry;
  c.state = "out"; c.hurt = 1;
  m.squash = 0.35; m.hit = 1;
  G.hitstop = Math.max(G.hitstop, T.deflectHitstop);
  G.shake = Math.max(G.shake, T.shakeDeflect);
  G.stats.deflects++;
  G.chain = 0; G.chainT = T.chainWindow;
  CK.addScore(T.scoreDeflect, c.x, c.y, null);
  CK.burst(c.x, c.y, 12, CK.COL[c.type], 160, true);
  CK.Audio.play("deflect", c.type);
  if (c.type === "split") CK.splitComet(c);
};

CK.splitComet = function (c) {
  var G = CK.G, T = CK.TUNE;
  var base = Math.atan2(G.planet.y - c.y, G.planet.x - c.x);
  var speed = G.s * T.speed * G.up.cometScale * (1 + (G.wave - 1) * 0.03) * T.splitSpeed * 0.95;
  for (var k = -1; k <= 1; k += 2) {
    var a = base + k * 0.42;
    G.comets.push({
      x: c.x, y: c.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      r: c.r * 0.55, type: "plain", state: "in", spin: Math.random() * 6.28, born: G.time, pushed: false, hurt: 0, grace: 0.35
    });
  }
  CK.pop(c.x, c.y, "SPLIT", CK.PAL.magenta, 0.9);
};

CK.chainKill = function (a, b) {
  var G = CK.G;
  a.dead = true; b.dead = true;
  G.chain = Math.min(9, G.chain + 1);
  G.chainT = CK.TUNE.chainWindow;
  G.stats.chains++;
  var mult = G.chain + 1;
  CK.addScore(CK.TUNE.scoreDeflect * mult, (a.x + b.x) / 2, (a.y + b.y) / 2, "CHAIN \u00d7" + mult, CK.PAL.amber);
  CK.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 18, CK.PAL.amber, 210, true);
  G.shake = Math.max(G.shake, 3);
  G.hitstop = Math.max(G.hitstop, 0.035);
  CK.Audio.play("chain");
};

CK.update = function (dt, f, ptr) {
  var G = CK.G, T = CK.TUNE;
  G.time += dt;

  // ---- the moon follows the device in use: thumb/cursor angle, pad direction, or keys
  var target = null, useKeys = 0;
  if (f.held.left) useKeys = -1;
  else if (f.held.right) useKeys = 1;
  if (!useKeys && f.device === "pad" && Math.hypot(f.move.x, f.move.y) > 0.28) target = Math.atan2(f.move.y, f.move.x);
  if (!useKeys && target === null && ptr && ptr.active && G.time - ptr.t < (ptr.down ? 5 : 0.6)) {
    var dx = ptr.x - G.planet.x, dy = ptr.y - G.planet.y;
    if (Math.hypot(dx, dy) > G.planet.r * 1.2) target = Math.atan2(dy, dx);
  }
  if (!useKeys && target === null && f.device === "keyboard" && Math.abs(f.move.x) > 0.3) useKeys = Math.sign(f.move.x);
  for (var mi = 0; mi < G.moons.length; mi++) {
    var m = G.moons[mi], off = mi === 0 ? 0 : Math.PI;
    var prev = m.a;
    if (target !== null) {
      var want = target - off;
      var diff = Math.atan2(Math.sin(want - m.a), Math.cos(want - m.a));
      var step = Math.max(-T.turnEase * dt, Math.min(T.turnEase * dt, diff));
      m.a += step;
    } else if (useKeys) {
      m.a += useKeys * T.keyTurn * dt;
    }
    m.spin = (m.a - prev) / Math.max(dt, 0.0001);
    m.squash += (0 - m.squash) * Math.min(1, dt * 12);
    m.hit = Math.max(0, m.hit - dt * 4);
  }

  // ---- pulse
  if (G.pulse.cd > 0) G.pulse.cd = Math.max(0, G.pulse.cd - dt);
  if (G.pulse.flash > 0) G.pulse.flash = Math.max(0, G.pulse.flash - dt * 2.2);
  if (G.pulse.ring > 0) { G.pulse.ring += dt * (G.s * 1.9); if (G.pulse.ring > G.s * 0.75) G.pulse.ring = 0; }
  G.planet.wince = Math.max(0, G.planet.wince - dt * 1.2);
  G.planet.hitFlash = Math.max(0, G.planet.hitFlash - dt * 2.5);
  G.flash = Math.max(0, G.flash - dt * 3);
  G.shake *= Math.pow(0.0015, dt);
  if (G.shake < 0.05) G.shake = 0;

  // ---- waves
  if (G.calm > 0) G.calm -= dt;
  else {
    G.waveT -= dt;
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      var a = Math.random() * Math.PI * 2;
      G.tele.push({ a: a, type: CK.pickType(G.wave), t: T.telegraph });
      G.spawnT = CK.spawnInterval() * (0.82 + Math.random() * 0.36);
    }
  }
  for (var ti = G.tele.length - 1; ti >= 0; ti--) {
    G.tele[ti].t -= dt;
    if (G.tele[ti].t <= 0) { CK.spawnComet(G.tele[ti].a, G.tele[ti].type); G.tele.splice(ti, 1); }
  }
  if (G.waveT <= 0 && G.calm <= 0) { CK.waveComplete(); return; }

  // ---- comets
  var i, j, c;
  for (i = 0; i < G.comets.length; i++) {
    c = G.comets[i];
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.spin += dt * 3;
    if (c.hurt > 0) c.hurt = Math.max(0, c.hurt - dt * 3);
    if (c.grace > 0) c.grace = Math.max(0, c.grace - dt);
    // trail
    if (Math.random() < 0.55) {
      G.parts.push({ x: c.x, y: c.y, vx: -c.vx * 0.05, vy: -c.vy * 0.05, t: 0, life: 0.28,
        r: c.r * 0.55, color: CK.COL[c.type], add: true });
    }
  }
  // moon hits
  for (i = 0; i < G.comets.length; i++) {
    c = G.comets[i];
    if (c.dead || c.state !== "in") continue;
    for (var k = 0; k < G.moons.length; k++) {
      var p = CK.moonPos(k);
      var rr = c.r + CK.moonR(k) * T.moonHit;
      if ((c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y) <= rr * rr) { CK.deflect(c, k); break; }
    }
  }
  // world hits
  for (i = 0; i < G.comets.length; i++) {
    c = G.comets[i];
    if (c.dead || c.state !== "in") continue;
    var pd = Math.hypot(c.x - G.planet.x, c.y - G.planet.y);
    if (pd < G.planet.r + c.r * 0.8) { c.dead = true; CK.crack(c); }
  }
  // deflected comets smash incoming ones: chains
  for (i = 0; i < G.comets.length; i++) {
    var a = G.comets[i];
    if (a.dead || a.state !== "out") continue;
    for (j = 0; j < G.comets.length; j++) {
      var b = G.comets[j];
      if (b === a || b.dead || b.state !== "in") continue;
      if ((a.grace || 0) > 0 || (b.grace || 0) > 0) continue;
      var dx2 = a.x - b.x, dy2 = a.y - b.y, rad = a.r + b.r + 3;
      if (dx2 * dx2 + dy2 * dy2 <= rad * rad) { CK.chainKill(a, b); break; }
    }
  }
  // out of the dark
  var far = G.diag * (T.spawnRadius + 0.35);
  for (i = G.comets.length - 1; i >= 0; i--) {
    c = G.comets[i];
    if (c.dead) { G.comets.splice(i, 1); continue; }
    if (Math.hypot(c.x - G.planet.x, c.y - G.planet.y) > far) G.comets.splice(i, 1);
  }
  // chain timer
  if (G.chainT > 0) { G.chainT -= dt; if (G.chainT <= 0) G.chain = 0; }

  // ---- particles and pops
  for (i = G.parts.length - 1; i >= 0; i--) {
    var q = G.parts[i];
    q.t += dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vx *= Math.pow(0.06, dt); q.vy *= Math.pow(0.06, dt);
    if (q.t >= q.life) G.parts.splice(i, 1);
  }
  for (i = G.pops.length - 1; i >= 0; i--) {
    var pp = G.pops[i];
    pp.t += dt; pp.y -= dt * 34;
    if (pp.t >= pp.life) G.pops.splice(i, 1);
  }
};

CK.waveComplete = function () {
  var G = CK.G;
  if (G.mode !== "play") return;
  G.mode = "upgrade";
  G.comets = []; G.tele = [];
  G.offers = CK.rollOffers();
  CK.Audio.play("wave");
  CK.UI.showUpgrade();
};

CK.rollOffers = function () {
  var G = CK.G;
  var pool = [
    { id: "big", name: "BIGGER MOON", desc: "The moon grows 18 %. A wider net for every comet." },
    { id: "twin", name: "TWIN MOON", desc: "A second, smaller moon on the far side of the ring." },
    { id: "fast", name: "QUICK PULSE", desc: "PULSE recharges 3 s sooner." },
    { id: "slow", name: "THIN DARK", desc: "Comets arrive 8 % slower." },
    { id: "heal", name: "MEND THE WORLD", desc: "The world heals one crack." }
  ].filter(function (o) {
    if (o.id === "twin" && G.up.twin) return false;
    if (o.id === "heal" && G.cracks <= 0) return false;
    if (o.id === "fast" && G.up.pulseCd <= 6) return false;
    return true;
  });
  for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  return pool.slice(0, Math.min(3, pool.length));
};

CK.takeUpgrade = function (id) {
  var G = CK.G;
  if (G.mode !== "upgrade") return;
  if (id === "big") G.up.moonScale *= 1.18;
  else if (id === "twin") { G.up.twin = true; G.moons.push({ a: G.moons[0].a + Math.PI, spin: 0, squash: 0, hit: 0 }); }
  else if (id === "fast") { G.up.pulseCd = Math.max(6, G.up.pulseCd - 3); G.pulse.max = G.up.pulseCd; }
  else if (id === "slow") G.up.cometScale *= 0.92;
  else if (id === "heal") G.cracks = Math.max(0, G.cracks - 1);
  CK.Audio.play("pick");
  G.mode = "play";
  CK.UI.hidePanels();
  CK.startWave(G.wave + 1);
  CK.UI.banner("WAVE " + G.wave, CK.waveNote(G.wave));
};

CK.waveNote = function (w) {
  if (w === 2) return "FAST STREAKS";
  if (w === 3) return "SPLITTERS";
  if (w === 4) return "EVERYTHING, FASTER";
  return "THE DARK THICKENS";
};
