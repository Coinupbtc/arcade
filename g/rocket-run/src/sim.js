// Rocket Run — DOM-free simulation. Scroll, thrust, spawner, collisions, score.
// The renderer and the pointer handler only call into this module.

export const THRUST_KEYS = new Set([' ', 'ArrowUp', 'w', 'W']);

const TAU = Math.PI * 2;

export function speedAt(t, H) {
  const k = Math.max(0, Math.min(1, t / 90));
  const extra = Math.max(0, (t - 90) / 90) * 90;                 // keeps climbing, no flat tail
  return (240 + 320 * k + extra) * (H / 844);
}

export function gapAt(t) {
  const k = Math.max(0, Math.min(1, t / 90));
  const late = Math.max(0, (t - 90) / 180) * 0.10;
  return 1.25 - 0.60 * k - late;          // still tightening past 90 s
}

export function missileChance(t) {
  if (t < 15) return 0;
  return Math.min(0.22, 0.08 + 0.14 * Math.min(1, (t - 15) / 75));
}

export function createSim(opts = {}) {
  const rng = opts.rng || Math.random;
  let W = opts.W || 390;
  let H = opts.H || 844;

  const state = {
    status: 'ready',
    worldX: 0,
    coins: 0,
    best: 0,
    elapsed: 0,
    thrust: false,
    player: { x: 0, y: 0, vy: 0, r: 0 },
    hazards: [],
    pickups: [],
    particles: [],
    events: [],
    flash: 0,
    shake: 0,
    reason: '',
    spawning: true,
    invuln: 0,
    awaiting: false,   // true until the first real press: the run cannot kill a new player
    grace: 0,
    hull: 3,           // three hits end the run; a hit spends one and buys cover
    bonus: 0,      // metres bought with coins
    stats: { coinsThisRun: 0, dodges: 0 },
  };

  let spawnCursor = 0;
  let missileTimer = 0;
  let exhaustTimer = 0;

  const S = () => H / 844;

  function geom() {
    const floorY = H * 0.90;
    const ceilY = H * 0.08;
    const pr = H * 0.030;
    return { floorY, ceilY, pr };
  }

  function resetPlayer() {
    const { floorY, pr } = geom();
    state.player.x = W * 0.30;
    state.player.y = floorY - H * 0.45;   // start mid-band with a real hop
    state.player.vy = -H * 0.95;
    state.player.r = pr;
  }

  function push(type, data) {
    state.events.push(Object.assign({ type }, data || {}));
  }

  function meters() {
    return Math.floor(state.worldX / (H * 0.05)) + state.bonus;
  }

  function hit(reason) {
    if (state.invuln > 0) return;
    crash(reason);
  }

  function crash(reason) {
    if (state.status !== 'playing') return;
    state.flash = 1;
    state.shake = 26;
    const p = state.player;
    for (let i = 0; i < 34; i++) {
      const a = rng() * TAU;
      const sp = (60 + rng() * 380) * S();
      state.particles.push({
        x: p.x, y: p.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        r: 1.5 + rng() * 4.5,
        color: i % 3 === 0 ? '#ffd27a' : i % 3 === 1 ? '#ff7a2e' : '#9aa8b8',
        age: 0, life: 0.5 + rng() * 0.7,
      });
    }
    state.hull = Math.max(0, state.hull - 1);
    push('crash', { reason, meters: meters(), coins: state.coins, hull: state.hull });
    if (state.hull <= 0) {
      state.status = 'over';
      state.reason = reason;
      push('over', { reason, meters: meters(), coins: state.coins });
      return;
    }
    // One hull spent: the rocket survives the hit, lifts off whatever it touched
    // and gets a moment of cover so the same hazard cannot take a second hull.
    state.invuln = Math.max(state.invuln, 1.8);
    state.grace = Math.max(state.grace, 1.4);
    p.vy = -Math.abs(p.vy) * 0.45 - H * 0.18;
    push('hullLost', { reason, hull: state.hull });
  }

  // ---------------------------------------------------------------- spawner
  function spawnLaser(atX, hard) {
    const { floorY, ceilY } = geom();
    const gapH = H * (0.30 - 0.07 * hard);
    const mid = ceilY + (floorY - ceilY) * (0.30 + rng() * 0.42);
    const gapY = Math.max(ceilY + gapH * 0.5 + 2, Math.min(floorY - gapH * 0.5, mid));
    state.hazards.push({
      type: 'laser',
      x: atX,
      w: Math.max(6, W * 0.022),
      gapTop: gapY - gapH / 2,
      gapBottom: gapY + gapH / 2,
      phase: rng() * TAU,
    });
  }

  function spawnSaw(atX, hard) {
    const { floorY, ceilY } = geom();
    const r = H * (0.055 + 0.012 * hard);
    const onFloor = rng() < 0.62;
    state.hazards.push({
      type: 'saw',
      x: atX,
      y: onFloor ? floorY - r * 0.72 : ceilY + r * 0.72,
      r,
      rot: rng() * TAU,
      spin: (onFloor ? -1 : 1) * (5 + rng() * 3),
    });
  }

  function spawnBot(atX) {
    const { floorY } = geom();
    const w = H * 0.055;
    const h = H * 0.085;
    state.hazards.push({
      type: 'bot',
      x: atX,
      y: floorY - h,
      w, h,
      step: rng() * TAU,
    });
  }

  function spawnMissile() {
    const p = state.player;
    const fromTop = rng() < 0.5;
    state.hazards.push({
      type: 'missile',
      x: state.worldX + W * 0.95,
      y: fromTop ? H * (0.12 + rng() * 0.18) : H * (0.62 + rng() * 0.24),
      vx: 0,          // set at launch: closing speed stays ~1.25x the scroll
      vy: 0,
      r: H * 0.020,
      arm: 0.85,
      warn: 0.85,
      targetY: p.y,
      trailT: 0,
    });
    push('warn');
  }

  function spawnCoins(atX, nearY) {
    const { floorY, ceilY } = geom();
    const n = 4 + Math.floor(rng() * 5);
    const span = W * (0.16 + rng() * 0.12);
    const y0 = nearY != null
      ? Math.max(ceilY + H * 0.06, Math.min(floorY - H * 0.06, nearY))
      : ceilY + (floorY - ceilY) * (0.18 + rng() * 0.5);
    const amp = H * (rng() < 0.5 ? 0.05 : 0.13);
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0.5 : i / (n - 1);
      state.pickups.push({
        x: atX + span * k,
        y: y0 - Math.sin(k * Math.PI) * amp,
        r: H * 0.017,
        phase: rng() * TAU,
        got: false,
      });
    }
  }

  function spawnPattern() {
    const atX = spawnCursor;
    const hard = Math.min(1, state.elapsed / 90);
    const roll = rng();
    // lasers and saws keep the majority share: the late game must be harder gates, not just missiles
    if (roll < 0.30) {
      spawnLaser(atX, hard);
    } else if (roll < 0.48) {
      spawnSaw(atX, hard);
    } else if (roll < 0.60 && state.elapsed > 8) {
      spawnBot(atX);
    } else if (state.elapsed > 15 && roll < 0.60 + missileChance(state.elapsed)) {
      spawnMissile();
    } else {
      spawnCoins(atX);
    }
    // coins ride along with roughly half the hazards
    // coins ride near the hazard that just spawned, so collecting them costs altitude risk
    const lastHaz = state.hazards[state.hazards.length - 1];
    if (roll < 0.66 && rng() < 0.55) {
      let nearY = null;
      if (lastHaz && lastHaz.type === 'laser') {
        // outside the hole: grabbing these means leaving the safe line
        nearY = rng() < 0.5 ? lastHaz.gapTop - H * 0.12 : lastHaz.gapBottom + H * 0.12;
      } else if (lastHaz && lastHaz.type === 'saw') {
        nearY = lastHaz.y > H * 0.5 ? lastHaz.y + H * 0.18 : lastHaz.y - H * 0.18;
      } else if (lastHaz && lastHaz.type === 'bot') {
        nearY = lastHaz.y - H * 0.20;
      }
      spawnCoins(atX + W * (0.05 + rng() * 0.12), nearY);
    } else if (rng() < 0.5) {
      spawnCoins(atX + W * (0.05 + rng() * 0.12));
    }
  }

  // ---------------------------------------------------------------- update
  function update(dt) {
    if (state.status !== 'playing') return state.events;

    // until the player takes control, the rocket hovers but the run does not score:
    // idling on the start screen must never farm distance
    if (!state.awaiting) {
      state.elapsed += dt;
      state.worldX += speedAt(state.elapsed, H) * dt;
      state.best = Math.max(state.best, meters());
    }
    state.flash = Math.max(0, state.flash - dt * 3.2);
    state.shake = Math.max(0, state.shake - dt * 90);
    state.grace = Math.max(0, state.grace - dt);
    state.invuln = Math.max(0, state.invuln - dt);

    const sc = speedAt(state.elapsed, H);

    // thrust vs gravity
    const g = 1.8 * H;
    const thrustA = 5.0 * H;
    const vyMin = -1.35 * H;
    const vyMax = 1.50 * H;
    // before the first press the rocket hovers itself at mid-band, so the player can see the
    // control working and a tap on START is never a death
    const thrusting = state.awaiting ? (state.player.y > H * 0.48) : state.thrust;
    if (state.awaiting) {
      state.invuln = Math.max(state.invuln, 0.25);
    }
    const p = state.player;
    p.vy += (thrusting ? g - thrustA : g) * dt;
    p.vy = Math.max(vyMin, Math.min(vyMax, p.vy));
    p.y += p.vy * dt;

    const { floorY, ceilY } = geom();
    if (p.y + p.r > floorY) {
      p.y = floorY - p.r;
      p.vy = -Math.abs(p.vy) * 0.5;
      if (state.grace > 0) { /* launch grace: bounce, do not die */ }
      else hit('floor');
    }
    // the ceiling is a wall, not a death: you bump along it and keep flying
    if (p.y - p.r < ceilY) { p.y = ceilY + p.r; p.vy = Math.max(0, p.vy); }

    // exhaust smoke while thrusting
    if (thrusting && state.status === 'playing') {
      exhaustTimer -= dt;
      if (exhaustTimer <= 0) {
        exhaustTimer = 0.028;
        state.particles.push({
          x: p.x - p.r * 0.9, y: p.y + p.r * 0.35,
          vx: -70 - rng() * 60, vy: 20 + rng() * 60,
          r: 1.4 + rng() * 2.6, color: rng() < 0.5 ? '#c9d2dc' : '#8d99a8',
          age: 0, life: 0.35 + rng() * 0.3,
        });
      }
    }

    // spawn cadence: a pattern must always enter from the right edge, never pop in mid-screen
    if (state.spawning) {
      spawnCursor = Math.max(spawnCursor, state.worldX + W * 1.0);
      const spawnAhead = state.worldX + W * 1.25;
      let guard = 0;
      while (spawnCursor < spawnAhead && guard++ < 6) {
        spawnPattern();
        spawnCursor += sc * gapAt(state.elapsed) * (0.95 + rng() * 0.25);
      }
    }

    // hazards
    for (let i = state.hazards.length - 1; i >= 0; i--) {
      const h = state.hazards[i];
      if (h.type === 'saw') h.rot += h.spin * dt;

      if (h.type === 'missile') {
        if (h.warn > 0) {
          // keep the marker at a fixed screen position while the world scrolls under it
          h.x += sc * dt;
          h.warn -= dt;
          h.y += Math.sign(h.targetY - h.y) * H * 0.05 * dt;
          if (h.warn <= 0) { h.vx = -sc * 0.25; push('launch'); }
          continue;
        }
        const chase = Math.min(Math.abs(h.vx) * 0.35, H * 0.35);
        h.y += Math.sign(state.player.y - h.y) * chase * dt;
        h.x += h.vx * dt;
        h.trailT += dt;
        if (h.trailT > 0.05) {
          h.trailT = 0;
          state.particles.push({
            x: h.x + h.r, y: h.y,
            vx: 40 + rng() * 40, vy: (rng() - 0.5) * 50,
            r: 1.5 + rng() * 2, color: '#ffb347', age: 0, life: 0.22 + rng() * 0.2,
          });
        }
      }

      const sx = h.x - state.worldX;
      if (sx < -W * 0.3) { state.hazards.splice(i, 1); continue; }
      if (state.status !== 'playing') continue;

      if (h.type === 'laser') {
        const half = h.w / 2 + p.r * 0.72;
        if (Math.abs(p.x - sx) < half && (p.y - p.r * 0.72 < h.gapTop || p.y + p.r * 0.72 > h.gapBottom)) {
          hit('laser');
        }
      } else if (h.type === 'saw') {
        const dx = p.x - sx, dy = p.y - h.y;
        if (dx * dx + dy * dy < (h.r * 0.88 + p.r) ** 2) hit('saw');
      } else if (h.type === 'bot') {
        if (Math.abs(p.x - sx) < h.w / 2 + p.r * 0.8 &&
            p.y + p.r * 0.8 > h.y && p.y - p.r * 0.8 < h.y + h.h) hit('bot');
      } else if (h.type === 'missile' && h.warn <= 0) {
        const dx = p.x - sx, dy = p.y - h.y;
        if (dx * dx + dy * dy < (h.r + p.r) ** 2) hit('missile');
      }

      if (sx < -W * 0.6) state.hazards.splice(i, 1);
    }

    // pickups
    for (let i = state.pickups.length - 1; i >= 0; i--) {
      const c = state.pickups[i];
      const sx = c.x - state.worldX;
      if (sx < -W * 0.2) { state.pickups.splice(i, 1); continue; }
      const dx = p.x - sx, dy = p.y - c.y;
      if (dx * dx + dy * dy < (c.r + p.r * 1.05) ** 2) {
        state.coins++;
        state.stats.coinsThisRun++;
        if (state.coins % 10 === 0) {
          state.bonus += 5;                // every 10 coins buys 5 m of score
          push('bonus', { bonus: state.bonus });
        }
        state.pickups.splice(i, 1);
        push('coin', { x: sx, y: c.y });
        for (let k = 0; k < 5; k++) {
          const a = rng() * TAU;
          state.particles.push({
            x: sx, y: c.y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
            r: 1 + rng() * 2, color: '#ffd75e', age: 0, life: 0.25 + rng() * 0.25,
          });
        }
      }
    }

    // particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const q = state.particles[i];
      q.age += dt;
      q.vy += H * 0.6 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.age >= q.life) state.particles.splice(i, 1);
    }

    return state.events;
  }

  function drain() {
    const out = state.events;
    state.events = [];
    return out;
  }

  function start() {
    state.status = 'playing';
    state.worldX = 0;
    state.coins = 0;
    state.elapsed = 0;
    state.thrust = false;
    state.hazards.length = 0;
    state.pickups.length = 0;
    state.particles.length = 0;
    state.events.length = 0;
    state.flash = 0;
    state.shake = 0;
    state.reason = '';
    state.stats = { coinsThisRun: 0, dodges: 0 };
    spawnCursor = W * 1.05;
    state.spawning = true;
    state.bonus = 0;
    state.hull = 3;
    state.invuln = 1.2;
    state.grace = 1.6;
    state.awaiting = true;                // the rocket flies itself until the player takes over
    missileTimer = 0;
    exhaustTimer = 0;
    resetPlayer();
    return state;
  }

  function setSize(w, h) {
    const prevW = W, prevH = H;
    W = w; H = h;
    if (state.status === 'ready') { resetPlayer(); return; }
    // keep the altitude ratio when the viewport changes
    const ratio = prevH ? state.player.y / prevH : 0.75;
    state.player.x = W * 0.30;
    state.player.y = ratio * H;
    state.player.r = H * 0.030;
  }

  function pause() { if (state.status === 'playing') state.status = 'paused'; }
  function resume() { if (state.status === 'paused') state.status = 'playing'; }
  function setThrust(on) {
    state.thrust = !!on;
    if (on && state.awaiting) {
      state.awaiting = false;
      state.grace = Math.max(state.grace, 4.5);     // the launch press buys a real cushion
      state.invuln = Math.max(state.invuln, 1.2);
    }
  }

  resetPlayer();

  return {
    get W() { return W; },
    get H() { return H; },
    state, setSize, start, pause, resume, setThrust,
    update, drain,
    setSpawning: (on) => { state.spawning = !!on; },
    meters,
    speed: () => speedAt(state.elapsed, H),
    // test / self-use helpers
    spawnPattern: () => spawnPattern(),
    spawnLaser: (x, hard) => spawnLaser(x, hard || 0),
    spawnSaw: (x, hard) => spawnSaw(x, hard || 0),
    spawnBot: (x) => spawnBot(x),
    spawnMissile: () => spawnMissile(),
    spawnCoins: (x) => spawnCoins(x),
  };
}
