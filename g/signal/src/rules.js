// SIGNAL — shared state + rules.
// Deliberately pure: no DOM, no Three.js. Everything here is callable from a test
// (node test/acceptance.js) so the mechanics are provable without a browser.

export const CONFIG = {
  maxLocks: 8,
  lives: 3,
  railSpeed: 9.2,        // world units / second the player travels forward
  spawnDistance: 190,    // targets appear this far ahead
  reachDistance: 3.0,    // a target at this depth has reached the player
  lockTimeBase: 0.55,    // seconds to lock, scaled by depth
  lockTimeDepthFactor: 0.55,
  fireDelay: 0.055,      // stagger between locks in one volley
  scorePerTarget: 100,
  comboWindow: 2.6,      // seconds before the multiplier decays
  overdrivePerHit: 0.045,
  overdriveDrainPerSec: 0.42,
  bossHp: 90,
};

// D-minor scale, one note per kill.
export const SCALE_STEPS = 7;

export function createState(seed = 1337) {
  return {
    phase: 'title',          // title | play | boss | over | win
    score: 0,
    combo: 0,
    multiplier: 1,
    shakeGuard: 0,        // >0 = brief grace after a landed hit
    bossCharge: 0,
    bossFired: false,
    lives: CONFIG.lives,
    overdrive: 0,
    overdriveActive: 0,
    time: 0,
    distance: 0,
    railSpeed: CONFIG.railSpeed,
    targets: [],
    locks: [],
    projectiles: [],
    particles: [],
    boss: null,
    wave: 0,
    waveTimer: 0,
    nextId: 1,
    rngState: seed >>> 0,
    stats: { fired: 0, hit: 0, missed: 0, best: 0, locksPeak: 0 },
    lastHitAt: -99,
    events: [],              // drained by the renderer/audio each frame
    shake: 0,
  };
}

// ── deterministic rng so tests and play see the same waves ──────────────────
export function rand(s) {
  s.rngState = (s.rngState * 1664525 + 1013904223) >>> 0;
  return s.rngState / 4294967296;
}

function emit(s, type, data = {}) {
  s.events.push({ type, ...data });
}

// ── targets ────────────────────────────────────────────────────────────────
// depth: how far ahead. A "shallow" target arrives sooner and locks faster.
export function spawnTarget(s, kind = 'drone', depth = null) {
  // Lane is chosen so the target lands where it LOOKS: spread in screen space,
  // then converted to world x at that depth. A flat world spread put every target
  // in a dot at the centre of the screen.
  const d = depth ?? CONFIG.spawnDistance * (0.55 + rand(s) * 0.45);
  // screenX is a fraction of HALF the screen width, in [-0.78, 0.78]. The world x is
  // derived from it at the live aspect (see laneFor), so the spread is the same on
  // any screen shape.
  const screenX = (rand(s) * 2 - 1) * 0.78;
  const lane = laneFor(screenX, d, s.aspect || 1);
  const kindCfg = {
    drone:  { lockScale: 1.0,  hp: 1, score: 100 },
    orb:    { lockScale: 0.72, hp: 1, score: 150 },   // fast + shallow, urgent
    shard:  { lockScale: 1.35, hp: 1, score: 80  },   // slow + deep, cheap
  }[kind];
  const t = {
    id: s.nextId++,
    kind,
    depth: d,
    startDepth: d,
    lane,
    screenX,
    wobble: rand(s) * Math.PI * 2,
    // y offset as a fraction of half-height, so vertical aim matters
    yFrac: (rand(s) * 2 - 1) * 0.62,
    yAmp: 0.10 + rand(s) * 0.12,
    hp: kindCfg.hp,
    score: kindCfg.score,
    lockScale: kindCfg.lockScale,
    locked: false,
    lockProgress: 0,
    dead: false,
    hitAt: -1,
  };
  s.targets.push(t);
  return t;
}

export function wavePlan(s) {
  // Rising difficulty: waves get more targets and a higher fast/orb share.
  const w = s.wave;
  const count = Math.min(15, 6 + Math.floor(w * 1.7));
  const orbShare = Math.min(0.45, 0.10 + w * 0.045);
  return { count, orbShare };
}

export function spawnWave(s) {
  const { count, orbShare } = wavePlan(s);
  for (let i = 0; i < count; i++) {
    const r = rand(s);
    const kind = r < orbShare ? 'orb' : (r < orbShare + 0.35 ? 'shard' : 'drone');
    // spread the formation across depth so the wave reads as a stream, and the
    // nearest few are always close enough to engage
    const depth = CONFIG.spawnDistance * (0.42 + 0.58 * (i / Math.max(1, count - 1)));
    spawnTarget(s, kind, depth);
  }
  s.wave += 1;
  s.waveAge = 0;
  // the rail accelerates each wave: less time to aim, real pressure
  // ease the speed curve: linear +22%/wave made wave 5 a cliff
  s.railSpeed = CONFIG.railSpeed * (1 + (s.wave - 1) * 0.145);
  s.trickleUsed = 0;
  s.trickleBudget = 3 + s.wave * 2;
  emit(s, 'wave', { wave: s.wave });
}

// ── lock / fire (the core verb) ────────────────────────────────────────────
// lockTime for a target: closer targets lock faster. This is why committing to
// shallow targets early is a real decision.
export function lockTimeFor(t) {
  // NOTE: deliberately NOT scaled by wave — the pressure comes from speed, and
  // scaling both would cancel out.
  const nearness = 1 - Math.min(1, t.depth / CONFIG.spawnDistance);
  return CONFIG.lockTimeBase * t.lockScale * (1 - CONFIG.lockTimeDepthFactor * nearness);
}

// Called every frame while the player holds the button over a target.
// Returns true when the target just finished locking.
export function tickLock(s, target, dt) {
  if (!target || target.dead) return false;
  if (target.locked) return false;
  if (s.locks.length >= CONFIG.maxLocks) return false;
  const need = lockTimeFor(target);
  target.lockProgress += dt / need;
  if (target.lockProgress >= 1) {
    target.locked = true;
    s.locks.push(target.id);
    if (s.locks.length > s.stats.locksPeak) s.stats.locksPeak = s.locks.length;
    emit(s, 'lock', { id: target.id, count: s.locks.length });
    return true;
  }
  return false;
}

// Release: fire every locked target in order. Multiplier grows with stack size,
// so holding for a bigger stack pays — but only if you survive the wait.
export function fireLocks(s) {
  const count = s.locks.length;
  if (count === 0) { emit(s, 'fire', { count: 0 }); return { fired: 0, score: 0 }; }
  const ids = s.locks.slice();
  s.locks = [];
  let gained = 0;
  for (const id of ids) {
    const t = s.targets.find(x => x.id === id && !x.dead);
    if (!t) continue;
    t.dead = true;
    t.hitAt = s.time;
    s.stats.hit++;
    const stackBonus = 1 + (count - 1) * 0.85;   // 1x .. ~7x at 8 locks
    const pts = Math.round(t.score * s.multiplier * stackBonus);
    s.score += pts;
    gained += pts;
    s.combo += 1;
    s.overdrive = Math.min(1, s.overdrive + CONFIG.overdrivePerHit);
    s.lastHitAt = s.time;
    emit(s, 'hit', { id: t.id, x: t.lane, depth: t.depth, degree: (t.id - 1) % SCALE_STEPS, points: pts });
  }
  s.stats.fired++;
  // a fired stack keeps the combo chain alive even while you are re-aiming
  s.lastHitAt = s.time;
  emit(s, 'fire', { count: ids.length });
  return { fired: ids.length, score: gained };
}

export function clearLocks(s) {
  for (const id of s.locks) {
    const t = s.targets.find(x => x.id === id);
    if (t) { t.locked = false; t.lockProgress = 0; }
  }
  s.locks = [];
}

// ── damage ─────────────────────────────────────────────────────────────────
export function damagePlayer(s, amount = 1) {
  if (s.phase === 'over' || s.phase === 'win') return;
  s.lives = Math.max(0, s.lives - amount);
  s.combo = 0;
  s.multiplier = 1;
  s.shake = 1;
  emit(s, 'hurt', { lives: s.lives });
  if (s.lives <= 0) {
    s.phase = 'over';
    emit(s, 'over', { score: s.score });
  }
}

// ── overdrive ──────────────────────────────────────────────────────────────
export function canUseOverdrive(s) { return s.overdrive >= 0.999 && s.overdriveActive <= 0; }

export function useOverdrive(s) {
  if (!canUseOverdrive(s)) return false;
  s.overdriveActive = 3.2;
  s.overdrive = 0;
  emit(s, 'overdrive', {});
  return true;
}

// ── boss ───────────────────────────────────────────────────────────────────
// Two-part decision: shields block the core. Hitting a shield still scores a
// little, but spends the shot — so shooting the core first means waiting.
export function spawnBoss(s) {
  s.boss = { hp: CONFIG.bossHp, shields: 3, shieldHp: 1, coreHp: CONFIG.bossHp,
             phase: 'shields', depth: 120, volleys: 0 };
  s.phase = 'boss';
  emit(s, 'boss', {});
}

export function hitBoss(s, part) {
  const b = s.boss;
  if (!b) return { damage: 0, blocked: false };
  // One landed boss hit per cooldown. The fight is paced by aim-and-release, not
  // by how fast the input can repeat.
  if (s.time - (s.lastBossHit || -99) < 0.38) return { damage: 0, blocked: true, cooldown: true };
  s.lastBossHit = s.time;
  // A landed shot delays the volley but does NOT cancel it: the boss keeps firing,
  // so you cannot neutralise it by tapping. Overdrive is the real counter.
  if (s.bossCharge > 0 && !s.chargeDelayed) {
    s.chargeDelay = 0.30;        // one extension per volley, not per shot
    s.chargeDelayed = true;
  }
  if (part === 'shield') {
    if (b.shields > 0) {
      b.shields -= 1;
      s.score += 50;
      s.combo += 1;
      emit(s, 'shield', { left: b.shields });
      return { damage: 0, blocked: true };
    }
    // no shields left: an off-centre shot still lands. It does less than a core
    // hit, but it always scores, so it is a slower route — not a dead end.
    b.hp -= 3;
    s.score += 120;
    s.combo += 1;
    s.overdrive = Math.min(1, s.overdrive + 0.10);
    emit(s, 'bosshit', { hp: b.hp });
    if (b.hp <= 0) {
      s.phase = 'win';
      emit(s, 'win', { score: s.score });
    }
    return { damage: 3, blocked: false };
  }
  // core shot: while shields stand it chips a shield instead of being wasted.
  // Without this, the most natural input (tap the bright centre) is a soft-lock.
  if (b.shields > 0) {
    b.shields -= 1;
    s.score += 50;
    s.combo += 1;
    s.overdrive = Math.min(1, s.overdrive + 0.12);
    emit(s, 'shield', { left: b.shields });
    return { damage: 0, blocked: true, stripped: true };
  }
  b.hp -= 2;
  s.score += 250;
  s.overdrive = Math.min(1, s.overdrive + 0.14);
  emit(s, 'bosshit', { hp: b.hp });
  if (b.hp <= 0) {
    s.phase = 'win';
    emit(s, 'win', { score: s.score });
  }
  return { damage: 2, blocked: false };
}

// ── the frame ──────────────────────────────────────────────────────────────
export function update(s, dt) {
  if (s.phase === 'title' || s.phase === 'over' || s.phase === 'win') {
    s.time += dt;
    s.shake = Math.max(0, s.shake - dt * 3);
    return;
  }
  dt = Math.min(dt, 0.05);            // clamp: a background tab must not teleport targets
  s.time += dt;
  s.shake = Math.max(0, s.shake - dt * 3);

  // overdrive window slows the world, not the clock
  let worldScale = 1;
  if (s.overdriveActive > 0) {
    s.overdriveActive -= dt;
    worldScale = 0.45;
  } else if (s.overdrive > 0 && s.phase !== 'boss') {
    s.overdrive = Math.max(0, s.overdrive - CONFIG.overdriveDrainPerSec * dt * 0.12);
  }

  const move = s.railSpeed * dt * worldScale;
  s.distance += move;

  // targets advance toward the player
  for (const t of s.targets) {
    if (t.dead) continue;
    // runners close faster than the rail (a real threat, not just a faster wave)
    t.depth -= move * (t.depthSpeed || 1) * worldScale;
    // keep the target's SCREEN x constant: world x scales down with depth, so it
    // converges toward the centre instead of flying off-screen and breaching.
    if (t.screenX != null) t.lane = laneFor(t.screenX, Math.max(1, t.depth), s.aspect || 1);
    t.wobble += dt * 1.6;
    if (t.depth <= CONFIG.reachDistance) {
      t.dead = true;
      s.stats.missed++;
      damagePlayer(s, 1);
      emit(s, 'breach', { id: t.id });
    }
  }
  s.targets = s.targets.filter(t => !t.dead || s.time - t.hitAt < 0.6);

  // combo decay
  if (s.time - s.lastHitAt > CONFIG.comboWindow && s.combo > 0) {
    s.combo = 0;
    s.multiplier = 1;
  }
  s.multiplier = 1 + Math.min(4, Math.floor(s.combo / 4) * 0.5);

  if (s.shakeGuard > 0) s.shakeGuard = Math.max(0, s.shakeGuard - dt);

  // boss attacks: a telegraphed volley on a timer. Moving (aiming away) does not
  // save you — firing your stack does, because the volley is cancelled by a hit.
  if (s.phase === 'boss' && s.boss) {
    s.bossTimer = (s.bossTimer || 0) + dt;
    const hpFrac = Math.max(0, s.boss.hp / CONFIG.bossHp);
    const period = 1.9 + hpFrac * 1.4;    // 3.3s at full, 1.9s near death
    if (s.bossTimer > period) {
      s.bossTimer = 0;
      s.bossCharge = 1.0;               // telegraph window
      s.bossFired = false;
      s.chargeDelayed = false;
    }
    if (s.overdriveActive > 0) {
      // the bar is a hard counter: no volley can resolve while it is up
      s.bossCharge = 0;
      s.bossFired = true;
    }
    if (s.bossCharge > 0) {
      // consume the one-shot delay first, then run the clock down
      if (s.chargeDelay > 0) { s.chargeDelay -= dt; }
      else { s.bossCharge -= dt; }
      // resolve exactly once, on the frame the window closes (not every frame)
      if (s.bossCharge <= 0 && !s.bossFired) {
        s.bossFired = true;
        emit(s, 'bossFire', {});
        // overdrive slow-motion neutralises the volley — the reason to hold it
        const protectedByOverdrive = s.overdriveActive > 0;
        if (!protectedByOverdrive && !(s.shakeGuard > 0)) damagePlayer(s, 1);
      }
    }
  }

  if (s.phase === 'play') s.waveAge = (s.waveAge || 0) + dt;

  // waves
  if (s.phase === 'play') {
    const alive = s.targets.filter(t => !t.dead).length;
    // reinforcement trickle: never let the screen go quiet mid-wave
    s.trickle = (s.trickle || 0) + dt;
    const floor = 3 + Math.min(4, s.wave);
    const budget = Math.max(0, (s.trickleBudget ?? 6) - (s.trickleUsed || 0));
    if (alive < floor && alive > 0 && s.wave > 0 && budget > 0 && s.trickle > 0.55) {
      s.trickle = 0;
      s.trickleUsed = (s.trickleUsed || 0) + 1;
      const r = rand(s);
      const kind = r < 0.35 ? 'orb' : (r < 0.7 ? 'drone' : 'shard');
      spawnTarget(s, kind, CONFIG.spawnDistance * 0.92);
    }
    // runners: from wave 2, a fast shallow target that punishes slow aiming
    s.runnerTimer = (s.runnerTimer || 0) + dt;
    const runnerGap = Math.max(1.5, 4.4 - s.wave * 0.55);
    if (s.wave >= 1 && s.runnerTimer > runnerGap) {
      s.runnerTimer = 0;
      const r = spawnTarget(s, 'orb', 62);
      r.runner = true;
      r.depthSpeed = 1.9;      // closes faster than the rail alone
    }

    if (alive === 0) {
      s.waveTimer += dt;
      // A wave only ends after a minimum duration AND an empty screen. Without
      // the floor, a good player clears in seconds and the stage is a demo.
      const waveAge = s.waveAge || 0;
      // The FIRST wave must spawn at once; only later waves have a floor.
      const minWave = s.wave === 0 ? 0 : 11 + s.wave * 2;   // 13s .. 21s per wave
      if (s.waveTimer > 0.45 && waveAge >= minWave) {
        s.waveTimer = 0;
        if (s.wave >= 5) spawnBoss(s);
        else spawnWave(s);
      }
    }
  }

  // boss drift
  if (s.phase === 'boss' && s.boss) {
    s.boss.depth = Math.max(60, s.boss.depth - dt * 1.2);
  }

  if (s.score > s.stats.best) s.stats.best = s.score;
}

// ── screen-space projection (shared by renderer + hit test + tests) ────────
// Returns normalised device coords in [-1,1]; null when behind the camera.
// Nearest target that is not yet locked, within a radius. Used while holding so a
// stack can keep growing even if the reticle sits on something already locked.
export function pickNearestUnlocked(s, aim, aspect = 1, radius = 0.34) {
  let best = null, bestD = Infinity;
  for (const t of s.targets) {
    if (t.dead || t.locked) continue;
    const p = projectToNdc(t.lane, targetY(t), -t.depth, 62, aspect);
    if (!p) continue;
    const d = Math.hypot(p.x - aim.x, p.y - aim.y);
    if (d < radius && d < bestD) { bestD = d; best = t; }
  }
  return best;
}

// World y of a target at time t: a static band offset plus a slow drift. The
// renderer and the picker both call this, so the hit test matches what is drawn.
export function targetY(t) {
  const y0 = (t.yFrac || 0) * (t.depth || 100) * 0.30;
  return y0 + Math.sin(t.wobble) * (t.yAmp || 0) * (t.depth || 100) * 0.10;
}

// World x that puts a target at `screenX` (fraction of half-width) at `depth`,
// for the given aspect. Inverse of projectToNdc's x term.
export function laneFor(screenX, depth, aspect = 1) {
  const f = 1 / Math.tan((62 * Math.PI / 180) / 2);
  return screenX * depth * aspect / f;
}

export function projectToNdc(x, y, z, fovDeg = 62, aspect = 1) {
  if (z >= -0.1) return null;                 // behind / at camera
  const f = 1 / Math.tan((fovDeg * Math.PI / 180) / 2);
  const ndcX = (f / aspect) * x / -z;
  const ndcY = f * y / -z;
  return { x: ndcX, y: ndcY };
}

// Pick the target nearest the aim point (ndc space), within a radius.
// Locked targets stay eligible: a player holding the button must be able to keep
// stacking up to maxLocks. tickLock() ignores an already-locked target, so the
// same target cannot double-lock — it just keeps the reticle on it.
export function pickTarget(s, aim, aspect = 1, radius = null) {
  // On a narrow (portrait) screen the same world lane maps to a much larger NDC x,
  // so a flat NDC radius makes targets unreachable by a finger. Scale the grab
  // radius with the aspect: wide screens keep precision, narrow screens stay usable.
  if (radius == null) radius = Math.min(0.34, Math.max(0.22, 0.26 / Math.max(0.5, aspect)));
  let best = null, bestD = radius, bestLocked = null, bestLockedD = radius;
  for (const t of s.targets) {
    if (t.dead) continue;
    const p = projectToNdc(t.lane, targetY(t), -t.depth, 62, aspect);
    if (!p) continue;
    const d = Math.hypot(p.x - aim.x, p.y - aim.y);
    if (d >= radius) continue;
    if (t.locked) {
      if (d < bestLockedD) { bestLockedD = d; bestLocked = t; }
    } else if (d < bestD) {
      bestD = d; best = t;
    }
  }
  // Prefer something new to lock; fall back to the locked one under the reticle
  // so the reticle still reads as "on target".
  return best || bestLocked;
}
