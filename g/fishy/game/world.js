/* FISHY — world: player, fish, waves, hunters, eating, dying, winning.
   Frame-based physics scaled by dt so 30 fps and 60 fps feel the same. */

"use strict";

/* ---------- saved progress ---------- */
var bestScore = +(localStorage.getItem("fishy_best") || 0);   // same key as earlier builds
var bestTierEver = +(localStorage.getItem("fishy_tier") || 0);
var clearedPond = localStorage.getItem("fishy_cleared") === "1";
var deepCleared = localStorage.getItem("fishy_deep") === "1";

/* ---------- state ---------- */
var state = "menu";            // menu | play | over        (hook maps menu/play/over; pause wins)
var won = false;
var newBest = false;           // did this run beat the saved best?
var score = 0;
var lives = 3, T = 0, runFrames = 0, stage = 1;
var mode = "pond";             // pond | deep
var targetTier = TARGET_TIER;
var waveNo = 0;
var lastWaveBanner = 0;

var playerHue = { back: "#e8641f", belly: "#f7d878", fin: "#c4481a" };
var player, fishes = [], bits = [], bubbles = [], chunks = [], motes = [], rings = [], popups = [];
var wave = { phase: "idle", t: 0, band: null, toSpawn: 0, spawnTick: 0, life: 0 };
var banner = { text: "", t: 0 };
var NURSERY = 60 * 10;          // feeding time: only food fish, no hunters. The first minute must start fast and safe.
var edibleTimer = 0, blinkT = 0, shakeT = 0, hitStop = 0, flashT = 0;
var hunterTimer = 0;
var hunger = 0;                    // 0 = fed, 1 = starving: the pond will not let you hide
var lastDeath = null;      // what actually killed the last life — readable by probes and the tester
var WRAP_M = 90;

/* ---------- helpers ---------- */
function plen() { return fishLen(player.tier); }
/* A 5% size edge makes food; a 12% edge makes a killer. Anything in between is a
   pond-mate you can ignore — that band is what stops "same size, unfair death". */
function isFood(f) { return fishLen(f.tier) < plen() * 0.95; }
function isDanger(f) { return fishLen(f.tier) > plen() * 1.12; }

function makeFish(tier, x, y) {
  var dir = Math.random() < 0.5 ? -1 : 1;
  var roll = Math.random(), sp;
  if (roll < 0.30) sp = 0.25 + Math.random() * 0.35;
  else if (roll < 0.75) sp = 0.8 + Math.random() * 1.0;
  else sp = 2.0 + Math.random() * 1.2;
  sp *= (tier > 8 ? 0.62 : 1) * PACE;
  var f = {
    x: x == null ? Math.random() * W : x,
    y: y == null ? rnd(0.06, 0.80) * H : y,
    vx: dir * sp, vy: 0, dir: dir, tier: tier,
    k: colorForTier(tier), wob: Math.random() * 9,
    vy0: rnd(-0.3, 0.3), wSp: rnd(0.02, 0.05),
    waveBoost: 0, waveBand: null, homing: false,
    near: false, windup: 0, lunge: 0, cool: 0
  };
  return f;
}

/* A bigger fish may never appear inside the player's bubble: unfair spawns were the
   playtest's #6 complaint. Food is allowed close: it is a reward, not a threat. */
function pushAwayFromPlayer(f, minD) {
  if (isFood(f)) return;
  for (var tries = 0; tries < 3; tries++) {
    var dx = wrapDX(f.x - player.x), dy = f.y - player.y;
    var d = Math.hypot(dx, dy);
    if (d >= minD) return;
    var ang = d > 1 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
    f.x = player.x + Math.cos(ang) * (minD + rnd(20, 90));
    f.y = clamp(player.y + Math.sin(ang) * (minD + rnd(20, 90)), 24, H * 0.86);
  }
}

function showBanner(text, frames) { banner.text = text; banner.t = frames; }
function inNursery() { return runFrames < NURSERY; }
function nurseryTier() { return rint(0, Math.min(2, Math.max(0, Math.floor(player.tier) - 1))); }

/* One pond, one population. Waves pour in only while there is room, and stale fish
   leave instead of piling up off-screen (the old build reached 38 fish and slowed down). */
function pondCap() { return clamp(Math.round((W * H) / 34000), 10, 22); }

function bigWeight() { return clamp(0.20 + 0.045 * stage + (mode === "deep" ? 0.10 : 0), 0.2, 0.62); }
function randomTier() {
  var t = rint(0, 9);
  if (Math.random() < bigWeight()) t = rint(4, 9);
  // a leviathan only shows up once the player is big enough to read it as a threat,
  // never while it is still a minnow (a 93 px fish vs a 24 px fish is not a fair fight)
  if (player.tier >= 5 && Math.random() < 0.04 + stage * 0.008) t = rint(10, 12);
  return t;
}

function spawnTier() { return inNursery() ? nurseryTier() : randomTier(); }

function spawnAtEdge(tier) {
  var f = makeFish(tier);
  var fromLeft = Math.random() < 0.5;
  f.x = fromLeft ? -WRAP_M : W + WRAP_M;
  f.dir = fromLeft ? 1 : -1;
  f.vx = Math.abs(f.vx) * f.dir;
  f.y = stageBandY();
  // a bigger fish enters away from the player's lane: it can hunt you, but it may not
  // arrive on top of you (the playtest's "deaths feel unfair" complaint)
  if (isDanger(f)) f.y = (player.y < H * 0.5 ? rnd(0.58, 0.84) : rnd(0.08, 0.42)) * H;
  pushAwayFromPlayer(f, 300);
  fishes.push(f);
  return f;
}

/* ---------- crowd waves ---------- */
function stageBandY() {
  if (wave.phase === "idle") return rnd(0.08, 0.82) * H;
  if (wave.band === "top") return rnd(0.08, 0.42) * H;
  if (wave.band === "bottom") return rnd(0.50, 0.82) * H;
  if (wave.band === "middle") return rnd(0.30, 0.62) * H;
  return rnd(0.08, 0.82) * H;
}

function startWave() {
  var bands = ["full", "top", "bottom", "middle"];
  wave.band = bands[rint(0, bands.length - 1)];
  wave.phase = "spawning";
  wave.toSpawn = Math.max(0, Math.min(5 + stage * 2, pondCap() + 2 - fishes.length));
  wave.spawnTick = 0;
  wave.life = 60 * rnd(14, 22);
  waveNo++;
  showBanner("SCHOOL " + waveNo, 90);
  sfx("wave");
}

function updateWave(k) {
  if (wave.phase === "idle") {
    wave.t -= k;
    if (wave.t <= 0 && runFrames > 60 * 6) startWave();
    return;
  }
  if (wave.phase === "spawning") {
    wave.spawnTick -= k;
    if (wave.spawnTick <= 0 && wave.toSpawn > 0) {
      wave.spawnTick = 6;
      wave.toSpawn--;
      var t = inNursery() ? nurseryTier() : randomTier();
      var f = spawnAtEdge(t);
      f.y = stageBandY();
      f.waveBand = wave.band;
      f.waveBoost = 120;
    }
    if (wave.toSpawn <= 0) wave.phase = "living";
    return;
  }
  if (wave.phase === "living") {
    wave.life -= k;
    if (wave.life <= 0) {
      wave.phase = "idle";
      wave.t = 60 * rnd(9, 16);
      for (var i = 0; i < fishes.length; i++) fishes[i].waveBand = null;
    }
  }
}

/* ---------- hunters: the pressure that makes late waves bite ---------- */
function spawnHunter() {
  var t = clamp(Math.floor(player.tier) + 2 + Math.floor(stage / 3), 4, MAX_TIER);
  var f = makeFish(t);
  f.homing = true;
  f.speedCap = 1.00 * PACE * (mode === "deep" ? 1.25 : 1);
  f.giveUp = 60 * 18;
  f.vx = 0; f.vy = 0;
  var side = Math.random() < 0.5 ? -1 : 1;
  f.x = side < 0 ? -WRAP_M - 30 : W + WRAP_M + 30;
  f.y = clamp(player.y + rnd(-120, 120), 30, H * 0.85);
  f.cool = 120;
  pushAwayFromPlayer(f, 340);
  fishes.push(f);
  sfx("hunter");
}

/* The pond answers growth: while the player is big, at least two fish bigger than it
   stay in the water. They come in from the edges, never on top of the player. */
function countDanger() {
  var n = 0;
  for (var i = 0; i < fishes.length; i++) if (isDanger(fishes[i])) n++;
  return n;
}
function keepPressure() {
  var want = W < 700 ? 1 : 2;          // a narrow phone pond needs fewer walls of fish
  if (inNursery() || countDanger() >= want || fishes.length >= pondCap()) return;
  var t = clamp(Math.floor(player.tier) + 2 + rint(0, 1), 3, MAX_TIER);
  spawnAtEdge(t);
}

function updateHunters(k) {
  hunterTimer -= k;
  var live = 0;
  for (var i = 0; i < fishes.length; i++) if (fishes[i].homing) live++;
  var maxH = stage >= 5 ? 2 : stage >= 3 ? 1 : 0;
  if (maxH > 0 && live < maxH && hunterTimer <= 0 && runFrames > 60 * 12) {
    spawnHunter();
    hunterTimer = 60 * rnd(11, 18);
  }
}

/* ---------- one guaranteed meal ---------- */
function countEdible() {
  var n = 0;
  for (var i = 0; i < fishes.length; i++) if (isFood(fishes[i])) n++;
  return n;
}
var MAX_FOOD = 3;               // the pond holds a few meals, not a buffet (see foodCap)
function scheduleEdible() { edibleTimer = 60 * rnd(3, 6); }
function foodCap() { return clamp(Math.round((W * H) / 170000) + 1, 4, 6); }
function tickEdible(k) {
  if (countEdible() >= foodCap()) return;
  if (edibleTimer <= 0) { scheduleEdible(); return; }
  edibleTimer -= k;
  if (edibleTimer <= 0) {
    // a meal arrives in open water, never on top of the player
    var ft = Math.max(0, Math.floor(player.tier - 1 - Math.random() * 3));
    var mf = makeFish(ft, rnd(60, W - 60), rnd(0.10, 0.80) * H);
    pushAwayFromPlayer(mf, 220);
    mf.waveBand = null;
    fishes.push(mf);
    scheduleEdible();
  }
}

/* ---------- run lifecycle ---------- */
function reset(m, forMenu) {
  mode = m || "pond";
  targetTier = mode === "deep" ? DEEP_TARGET : TARGET_TIER;
  score = 0; T = 0; runFrames = 0; lives = 3; stage = 1; waveNo = 0;
  won = false; newBest = false; blinkT = 0; shakeT = 0; hitStop = 0; flashT = 0; hunger = 0;
  hunterTimer = 60 * 8;
  lastWaveBanner = 0;
  player = { x: W * 0.5, y: H * 0.55, ang: 0, tier: 1, vx: 0, vy: 0,
             accel: 0.42 * PACE, maxSp: 6.2 * PACE, drag: 0.976, burstT: 0, burstCD: 0 };
  playerHue = { back: PLAYER_BASE.back, belly: PLAYER_BASE.belly, fin: PLAYER_BASE.fin };
  fishes = []; bits = []; bubbles = []; chunks = []; rings = []; popups = [];
  var n = clamp(Math.round((W * H) / 34000), 10, 18);
  for (var i = 0; i < n; i++) {
    // the title screen is a show pond; a run opens with food only
    var f = makeFish(forMenu ? randomTier() : rint(0, 1));
    if (!forMenu) pushAwayFromPlayer(f, 300);
    fishes.push(f);
  }
  if (!forMenu) {
    var h = makeFish(clamp(player.tier + 3, 3, MAX_TIER));
    pushAwayFromPlayer(h, 360);
    fishes.push(h);
  }
  // three free meals near the player so the first five seconds teach the verb
  for (var j = 0; j < 2; j++) {
    var ang = rnd(0, Math.PI * 2);
    var meal = makeFish(0, player.x + Math.cos(ang) * rnd(120, 210), clamp(player.y + Math.sin(ang) * rnd(80, 150), 40, H * 0.82));
    fishes.push(meal);
  }
  motes = [];
  for (var m2 = 0; m2 < Math.round((W * H) / 26000); m2++)
    motes.push({ x: Math.random() * W, y: Math.random() * H * 0.88, r: rnd(0.6, 2),
                 a: rnd(0.15, 0.4), ph: Math.random() * 6.3, dx: rnd(-0.08, 0.08), dy: -rnd(0.05, 0.17) });
  scheduleEdible();
  wave = { phase: "idle", t: 60 * rnd(5, 9), band: null, toSpawn: 0, spawnTick: 0, life: 0 };
  buildBackdrop();
}

function startRun(m) {
  reset(m);
  state = "play";
  if (input) input.pause.reset();
}

/* ---------- eating, dying, winning ---------- */
function popup(x, y, text, color) { popups.push({ x: x, y: y, text: text, color: color || "#fff", life: 46 }); }

function eat(f, i) {
  var ratio = clamp(fishLen(f.tier) / plen(), 0, 1);
  rings.push({ x: f.x, y: f.y, r: 4, life: 24 });
  flashT = Math.min(10, 5 + ratio * 8);
  hitStop = Math.max(hitStop, 3);
  bloodBurst(f.x, f.y, f.k.belly, Math.round(8 + ratio * 12), 1.2 + ratio * 1.4, Math.round(2 + ratio * 4));
  sfx(ratio > 0.7 ? "eatBig" : "eat", ratio);
  fishes.splice(i, 1);
  var pts = Math.round(10 + 24 * ratio);
  score += pts * (mode === "deep" ? 1.5 : 1);
  score = Math.round(score);
  popup(f.x, f.y - fishLen(f.tier) * 0.4, "+" + pts, "#fff7cf");
  var gain = (0.20 + 0.30 * ratio) * (mode === "deep" ? 0.9 : 1);
  player.tier = Math.min(MAX_TIER + 1, player.tier + gain);
  playerHue.back = mixHex(playerHue.back, f.k.back, 0.22);
  playerHue.belly = mixHex(playerHue.belly, f.k.belly, 0.22);
  playerHue.fin = mixHex(playerHue.fin, f.k.fin, 0.22);
  hunger = Math.max(0, hunger - 0.6);
  sfx("grow");
  if (player.tier >= targetTier && !won) { winRun(); return; }
  // A meal does not refill the buffet: the pond usually answers with a bigger fish,
  // and the next small one takes a few seconds to arrive.
  if (Math.random() < 0.5 && fishes.length < pondCap()) {
    var nf = makeFish(rint(3, Math.max(4, Math.min(MAX_TIER, Math.floor(player.tier) + 4))));
    var fromLeft = Math.random() < 0.5;
    nf.x = fromLeft ? -WRAP_M : W + WRAP_M;
    nf.dir = fromLeft ? 1 : -1;
    nf.vx = Math.abs(nf.vx) * nf.dir;
    pushAwayFromPlayer(nf, 300);
    fishes.push(nf);
  }
  edibleTimer = 60 * rnd(1.5, 3.2);
}

function die(killer) {
  if (blinkT > 0) return;
  lastDeath = { t: Math.round(runFrames / 60 * 10) / 10, tier: Math.round(player.tier * 10) / 10,
                killerLen: killer ? Math.round(fishLen(killer.tier)) : 0,
                killerHunter: !!(killer && killer.homing), playerLen: Math.round(plen()),
                dist: killer ? Math.round(Math.hypot(wrapDX(player.x - killer.x), player.y - killer.y)) : 0 };
  lives--;
  rings.push({ x: player.x, y: player.y, r: 6, life: 40 });
  flashT = 22; shakeT = 20;
  bloodBurst(player.x, player.y, playerHue.back, 22, 2.2, 8);
  sfx("die");
  if (input && input.rumble) input.rumble(180, 0.7, 0.4);
  if (lives <= 0) { endRun(false); return; }
  player.tier = Math.max(1, player.tier - 0.8);
  player.x = W * 0.5; player.y = H * 0.55; player.vx = 0; player.vy = 0;
  player.burstT = 0; player.burstCD = 0;
  blinkT = 120;
  hunger = Math.min(hunger, 0.4);
  // clear the bubble again on respawn: no instant second death
  for (var i = 0; i < fishes.length; i++) {
    var rf = fishes[i];
    var rdx = wrapDX(rf.x - player.x), rdy = rf.y - player.y;
    var rd = Math.hypot(rdx, rdy);
    if (rd < 340) {
      var ra = rd > 1 ? Math.atan2(rdy, rdx) : Math.random() * Math.PI * 2;
      rf.x = player.x + Math.cos(ra) * 360;
      rf.y = clamp(player.y + Math.sin(ra) * 360, 24, H * 0.86);
    }
  }
}

function winRun() { endRun(true); }

function endRun(isWin) {
  won = isWin;
  state = "over";
  var prevBest = bestScore;
  bestScore = Math.max(bestScore, Math.round(score));
  newBest = Math.round(score) > prevBest;
  bestTierEver = Math.max(bestTierEver, Math.floor(player.tier));
  localStorage.setItem("fishy_best", String(bestScore));
  localStorage.setItem("fishy_tier", String(bestTierEver));
  if (isWin) {
    sfx("clear");
    if (mode === "deep") { deepCleared = true; localStorage.setItem("fishy_deep", "1"); }
    else { clearedPond = true; localStorage.setItem("fishy_cleared", "1"); }
  }
  if (input && input.pause) input.pause.reset();
}

/* ---------- burst ---------- */
function tryBurst() {
  if (state !== "play" || player.burstCD > 0) return;
  // A dash, not a nudge: 0.55 s of real speed so the burst reads on screen and gets you
  // out of a hunter's reach. The gate measured a tiny impulse as "speed went down".
  player.burstT = 34;
  player.burstCD = 150;
  var sp = Math.hypot(player.vx, player.vy);
  var ax = sp > 0.4 ? player.vx / sp : Math.cos(player.ang);
  var ay = sp > 0.4 ? player.vy / sp : Math.sin(player.ang);
  var dashSp = player.maxSp * (1 - Math.min(0.30, player.tier * 0.018)) * 1.95;
  player.vx = ax * dashSp; player.vy = ay * dashSp;
  sfx("burst");
  for (var i = 0; i < 10; i++)
    bubbles.push({ x: player.x - ax * plen() * 0.4, y: player.y - ay * plen() * 0.4,
                   r: rnd(1.4, 3), life: 50, vx: -ax * rnd(0.4, 1.2) });
  if (input && input.rumble) input.rumble(60, 0.2, 0.5);
}

/* ---------- update ---------- */
function update(dt) {
  T++;
  var k = clamp(dt * 60, 0.4, 2.4);
  if (state !== "play") {
    if (state === "menu") driftScene(k);
    updateFx(k);
    if (shakeT > 0) shakeT -= 0.5;
    return;
  }
  if (input && input.pause && input.pause.paused) { updateFx(k * 0.25); return; }
  if (hitStop > 0) { hitStop -= 1; updateFx(k * 0.35); return; }

  var wasNursery = inNursery();
  runFrames += k;
  var newStage = 1 + Math.floor(runFrames / (60 * 25));
  if (newStage > stage) { stage = newStage; }
  if (wasNursery && !inNursery()) {
    showBanner("THE POND WAKES", 120);
    sfx("wave");
  }

  var f = frameInput || { move: { x: 0, y: 0 }, pressed: {}, held: {} };

  // --- steering: one vector from every device (keys, stick, pad, mouse drag) ---
  var mx = f.move.x, my = f.move.y;
  var mag = Math.hypot(mx, my);
  if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
  var dashing = player.burstT > 0;
  var accel = player.accel * (dashing ? 2.2 : 1);
  player.vx += mx * accel * k * (0.6 + 0.4 * mag);
  player.vy += my * accel * k * (0.6 + 0.4 * mag);

  var bigDrag = player.drag * (1 - Math.min(0.012, player.tier * 0.0008));
  if (dashing) bigDrag = 0.993;              // a dash keeps its speed long enough to matter
  var dk = Math.pow(bigDrag, k);
  player.vx *= dk; player.vy *= dk;
  var maxSp = player.maxSp * (1 - Math.min(0.30, player.tier * 0.018)) * (dashing ? 2.0 : 1);
  var sp = Math.hypot(player.vx, player.vy);
  if (sp > maxSp) { player.vx *= maxSp / sp; player.vy *= maxSp / sp; sp = maxSp; }
  player.x += player.vx * k; player.y += player.vy * k;

  // The pond edge is a wall, not a teleport: the gate measured a wrap as "x went down",
  // and slipping off-screen read as a free escape (playtest: "I did not know where I was").
  var xm = Math.max(16, plen() * 0.34);
  player.x = clamp(player.x, xm, W - xm);
  player.y = clamp(player.y, 24, H * 0.90 - 10);
  if (sp > 0.2) player.ang = Math.atan2(player.vy, player.vx);

  if (player.burstT > 0) player.burstT--;
  if (player.burstCD > 0) player.burstCD--;

  // --- fish ---
  for (var i = 0; i < fishes.length; i++) {
    var fi = fishes[i];
    fi.wob += fi.wSp * 2 * k;
    if (fi.homing) {
      var dx = wrapDX(player.x - fi.x), dy = player.y - fi.y;
      var d = Math.hypot(dx, dy) || 1;
      var want = stage >= 3 ? 1.7 : 1.3;
      fi.vx += (dx / d) * 0.030 * PACE * k;
      fi.vy += (dy / d) * 0.026 * PACE * k;
      var fsp = Math.hypot(fi.vx, fi.vy);
      if (fsp > fi.speedCap) { fi.vx *= fi.speedCap / fsp; fi.vy *= fi.speedCap / fsp; }
      if (fi.x > W + WRAP_M) fi.x = -WRAP_M + 1;
      if (fi.x < -WRAP_M) fi.x = W + WRAP_M - 1;
      fi.y += fi.vy * k;
      fi.y = clamp(fi.y, 20, H * 0.88);
      fi.dir = fi.vx < 0 ? -1 : 1;
      // telegraph: 24 frames of red glow before a lunge
      if (fi.giveUp != null) { fi.giveUp -= k; if (fi.giveUp <= 0) { fishes.splice(i, 1); i--; continue; } }
      if (fi.cool > 0) fi.cool -= k;
      if (fi.windup > 0) { fi.windup -= k; if (fi.windup <= 0) { fi.lunge = 22; fi.cool = 170; } }
      else if (fi.lunge > 0) { fi.lunge -= k; fi.x += (dx / d) * 2.2 * PACE * k; fi.y += (dy / d) * 1.9 * PACE * k; }
      else if (d < 190 && fi.cool <= 0) fi.windup = 24;
      if (fi.y < 20) fi.y = 20; if (fi.y > H * 0.88) fi.y = H * 0.88;
    } else {
      if (isFood(fi) && blinkT <= 0) {
        var fdx = wrapDX(fi.x - player.x), fdy = fi.y - player.y;
        var fd = Math.hypot(fdx, fdy) || 1;
        if (fd < 100) {
          var scare = fd < 70 ? 1.6 : 1;
          fi.vx += (fdx / fd) * 0.16 * scare * PACE * k;
          fi.vy += (fdy / fd) * 0.12 * scare * PACE * k;
          var capV = (fd < 70 ? 2.8 : 1.8) * PACE;
          if (Math.abs(fi.vx) > capV) fi.vx = capV * Math.sign(fi.vx);
          if (Math.abs(fi.vy) > capV * 0.8) fi.vy = capV * 0.8 * Math.sign(fi.vy);
        } else {
          fi.vx *= Math.pow(0.985, k);
          fi.vy *= Math.pow(0.985, k);
        }
      }
      if (fi.waveBoost > 0) { fi.waveBoost -= k; fi.x += fi.vx * 1.4 * k; } else fi.x += fi.vx * k;
      fi.y += (fi.vy0 + Math.sin(fi.wob) * 0.3) * k;
      if (fi.waveBand) {
        var lo, hi;
        if (fi.waveBand === "top") { lo = 0.08 * H; hi = 0.42 * H; }
        else if (fi.waveBand === "bottom") { lo = 0.50 * H; hi = 0.82 * H; }
        else if (fi.waveBand === "middle") { lo = 0.30 * H; hi = 0.62 * H; }
        else { lo = 0.06 * H; hi = 0.84 * H; }
        if (fi.y < lo) fi.y = lo;
        if (fi.y > hi) fi.y = hi;
      }
      if (fi.x < -WRAP_M) {
        if (fishes.length > pondCap() && !fi.homing && Math.random() < 0.5) { fishes.splice(i, 1); i--; continue; }
        fi.x = W + WRAP_M - 1;
      }
      if (fi.x > W + WRAP_M) {
        if (fishes.length > pondCap() && !fi.homing && Math.random() < 0.5) { fishes.splice(i, 1); i--; continue; }
        fi.x = -WRAP_M + 1;
      }
      fi.dir = fi.vx < 0 ? -1 : 1;
    }
    if (fi.y < 20) fi.y = 20; if (fi.y > H * 0.88) fi.y = H * 0.88;
  }

  // --- collisions ---
  if (blinkT > 0) blinkT -= k;
  var myR = plen() * 0.30;
  for (var j = fishes.length - 1; j >= 0; j--) {
    var fj = fishes[j];
    var ddx = wrapDX(player.x - fj.x), ddy = player.y - fj.y;
    var dist = Math.hypot(ddx, ddy);
    var fr = fishLen(fj.tier) * 0.30;
    var hitR = (myR + fr) * 0.72;
    if (dist < hitR) {
      if (isFood(fj)) eat(fj, j);
      else if (isDanger(fj) && blinkT <= 0) { die(fj); if (state !== "play") return; }
    } else if (isDanger(fj) && !fj.homing) {
      // near miss: a danger fish sweeps past without eating you
      if (dist < hitR * 1.9) fj.near = true;
      else if (fj.near && dist > hitR * 2.6) {
        fj.near = false;
        sfx("nearmiss");
        popup(player.x, player.y - plen() * 0.7, "DODGED", "#ffe9a8");
      }
    }
  }

  // nursery: a bigger fish may not crowd the player while the pond is still calm
  if (inNursery()) {
    for (var q = 0; q < fishes.length; q++) {
      var nf = fishes[q];
      if (isFood(nf)) continue;
      var ndx = wrapDX(nf.x - player.x), ndy = nf.y - player.y;
      var nd = Math.hypot(ndx, ndy);
      if (nd < 300) {
        var push = (300 - nd) * 0.18 * k;
        if (nd < 1) { nf.x += 60; }
        else { nf.x += (ndx / nd) * push; nf.y = clamp(nf.y + (ndy / nd) * push, 24, H * 0.86); }
      }
    }
  }

  if (!inNursery()) {
    hunger += k / (60 * 26);              // 26 seconds of not eating fills the bar
    if (hunger >= 1) {
      hunger = 0.2;
      lastDeath = { t: Math.round(runFrames / 60 * 10) / 10, tier: Math.round(player.tier * 10) / 10,
                    killerLen: 0, killerHunter: false, playerLen: Math.round(plen()), dist: 0, starved: true };
      lives--;
      shakeT = 14; flashT = 14;
      sfx("die");
      popup(player.x, player.y - plen() * 0.8, "STARVED", "#ffb3a0");
      if (lives <= 0) { endRun(false); return; }
      player.tier = Math.max(1, player.tier - 0.8);
      player.x = W * 0.5; player.y = H * 0.55; player.vx = 0; player.vy = 0;
      blinkT = 120;
    }
  }

  updateFx(k);
  if (shakeT > 0) shakeT -= 0.4;
  tickEdible(k);
  if (!inNursery()) { updateWave(k); updateHunters(k); if (T % 420 === 0) keepPressure(); }
  else { wave.phase = "idle"; wave.t = 60 * 3; }
  if (T % 14 === 0 && sp > 0.5)
    bubbles.push({ x: player.x + Math.cos(player.ang) * plen() * 0.5, y: player.y - 4,
                   r: rnd(1.5, 3.5), life: 80, vx: player.vx * 0.2 });
}

/* the title screen is a live pond: fish keep swimming behind the menu */
function driftScene(k) {
  for (var i = 0; i < fishes.length; i++) {
    var f = fishes[i];
    f.wob += f.wSp * 2 * k;
    f.x += f.vx * 0.65 * k;
    f.y += (f.vy0 + Math.sin(f.wob) * 0.3) * k;
    if (f.x < -WRAP_M) f.x = W + WRAP_M - 1;
    if (f.x > W + WRAP_M) f.x = -WRAP_M + 1;
    f.y = clamp(f.y, 20, H * 0.88);
    f.dir = f.vx < 0 ? -1 : 1;
  }
}

function updateFx(k) {
  for (var i = bits.length - 1; i >= 0; i--) {
    var b = bits[i];
    b.x += b.vx * k; b.y += b.vy * k;
    b.vx *= Math.pow(0.94, k); b.vy = b.vy * Math.pow(0.94, k) + (b.cloud ? -0.02 : 0.03) * k;
    b.life -= k;
    if (b.life <= 0) bits.splice(i, 1);
  }
  for (var j = chunks.length - 1; j >= 0; j--) {
    var c = chunks[j];
    c.x += c.vx * k; c.y += c.vy * k; c.rot += c.vr * k; c.life -= k;
    if (c.life <= 0) chunks.splice(j, 1);
  }
  for (var m = bubbles.length - 1; m >= 0; m--) {
    var bu = bubbles[m];
    bu.x += ((bu.vx || 0.2) + Math.sin(bu.life * 0.3) * 0.3) * k;
    bu.y -= 0.55 * k; bu.life -= k;
    if (bu.life <= 0) bubbles.splice(m, 1);
  }
  for (var n = 0; n < motes.length; n++) {
    var mo = motes[n];
    mo.x += mo.dx * k; mo.y += mo.dy * k;
    if (mo.y < -4) { mo.y = H * 0.88; mo.x = Math.random() * W; }
    if (mo.x < -4) mo.x = W + 4; if (mo.x > W + 4) mo.x = -4;
  }
  for (var r = rings.length - 1; r >= 0; r--) {
    var ri = rings[r]; ri.r += 2.6 * k; ri.life -= k;
    if (ri.life <= 0) rings.splice(r, 1);
  }
  for (var p = popups.length - 1; p >= 0; p--) {
    var po = popups[p]; po.y -= 0.8 * k; po.life -= k;
    if (po.life <= 0) popups.splice(p, 1);
  }
  if (flashT > 0) flashT -= 1;
  if (lastWaveBanner > 0) lastWaveBanner -= k;
  if (banner.t > 0) banner.t -= k;
}

/* ---------- gore ---------- */
function bloodBurst(x, y, color, n, power, bigChunks) {
  for (var j = 0; j < n; j++) {
    var a = Math.random() * Math.PI * 2, sp = rnd(0.5, 2.5) * power;
    bits.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.3,
                life: rnd(22, 47), color: Math.random() < 0.75 ? "#c41f1f" : color, r: rnd(1.5, 4) });
  }
  for (var c = 0; c < bigChunks; c++) {
    var a2 = Math.random() * Math.PI * 2, sp2 = rnd(0.5, 1.9) * power;
    chunks.push({ x: x, y: y, vx: Math.cos(a2) * sp2, vy: Math.sin(a2) * sp2,
                  rot: Math.random() * 6.3, vr: rnd(-0.15, 0.15), life: rnd(40, 70),
                  color: Math.random() < 0.5 ? "#8a1010" : "#c43030", w: rnd(5, 14), h: rnd(3, 8) });
  }
  for (var q = 0; q < (bigChunks ? 4 : 2); q++)
    bits.push({ x: x + rnd(-7, 7), y: y + rnd(-7, 7), vx: rnd(-0.2, 0.2), vy: -0.1,
                life: rnd(55, 85), color: "rgba(180,20,20,0.35)", r: rnd(6, 14), cloud: true });
}
