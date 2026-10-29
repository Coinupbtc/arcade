// Slice Party — DOM-free simulation core.
// Everything mechanical lives here: spawns, ballistic motion, slicing, score, lives, timer.
// The renderer and the touch handler only call into this module.

export const DURATION = 60;
// 5 drops, not 3: a 60 s casual slicer should survive a bad first ten seconds, and a phone
// player reading the board for the first time needs the extra room. The HUD draws five pips.
export const MAX_MISSES = 5;
const TAU = Math.PI * 2;

export const TYPES = {
  watermelon: { value: 3, size: 0.078, weight: 2.2, juice: '#e8384f' },
  pineapple:  { value: 4, size: 0.070, weight: 1.3, juice: '#ffcf4a' },
  orange:     { value: 1, size: 0.056, weight: 2.6, juice: '#ff9f2e' },
  lemon:      { value: 1, size: 0.056, weight: 2.1, juice: '#ffe066' },
  lime:       { value: 2, size: 0.050, weight: 1.9, juice: '#9ad24e' },
  kiwi:       { value: 2, size: 0.050, weight: 1.8, juice: '#a9d24e' },
  banana:     { value: 2, size: 0.055, weight: 1.9, juice: '#f2cf5a' },
  strawberry: { value: 1, size: 0.046, weight: 2.2, juice: '#ef3b52' },
};

// --- difficulty curves (exported so tests can prove they rise) ---
export function spawnInterval(t) {
  const k = Math.max(0, Math.min(1, t / DURATION));
  return 1.90 - 1.35 * k;                    // 1.90 s -> 0.55 s: a calmer opening
}

export function waveRange(t) {
  if (t < 8) return [1, 1];        // gentle open so the first cut is easy
  if (t < 20) return [1, 2];
  if (t < 35) return [2, 3];
  if (t < 50) return [2, 4];
  return [3, 4];
}

export function bombChance(t) {
  // Bombs start at 12 s, not 8: the opening is a fruit-only lesson in the swipe, and a
  // player (or a probe) has cut something before the first bomb can appear.
  if (t < 12) return 0;
  return Math.min(0.18, 0.04 + 0.14 * Math.min(1, (t - 12) / (DURATION - 12)));
}

export function comboBonus(n) {
  return n >= 2 ? 5 * (n - 1) : 0;
}

// point-to-segment distance
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function pickWeighted(rng) {
  const names = Object.keys(TYPES);
  let total = 0;
  for (const n of names) total += TYPES[n].weight;
  let r = rng() * total;
  for (const n of names) {
    r -= TYPES[n].weight;
    if (r <= 0) return n;
  }
  return names[names.length - 1];
}

export function createSim(opts = {}) {
  let W = opts.W || 390;
  let H = opts.H || 844;
  const rng = opts.rng || Math.random;

  const state = {
    status: 'ready',          // ready | playing | paused | over
    score: 0,
    timeLeft: DURATION,
    misses: 0,
    maxMisses: MAX_MISSES,
    elapsed: 0,
    fruits: [],
    halves: [],
    juice: [],
    pops: [],
    events: [],
    swipe: null,
    slowmo: 0,
    flash: 0,
    shake: 0,
    stats: { sliced: 0, bestCombo: 0, bombs: 0 },
    reason: '',
  };

  let spawnTimer = 0;
  let spawnCount = 0;
  // Arc scale: the short side of a landscape phone (390 px) used to shrink the fruit arc and
  // the fruit itself. Use the bigger of the height and 0.55 of the width so a landscape run
  // plays like a portrait one (playtest 2026-10-28: portrait 146 pts, landscape 53).
  const S = () => Math.max(H, W * 0.55);
  let GRAV = 1.0 * H;

  function push(type, data) {
    state.events.push(Object.assign({ type }, data || {}));
  }

  function end(reason) {
    if (state.status !== 'playing') return;
    state.status = 'over';
    state.reason = reason;
    push('over', { reason, score: state.score });
  }

  function pop(text, x, y) {
    state.pops.push({ text, x, y, age: 0, life: 1.15 });
  }

  function addFruit(type, x, y, o = {}) {
    const bomb = type === 'bomb';
    const def = bomb ? { size: 0.055 } : TYPES[type];
    // Fruit size follows the bigger axis and a share of the width: landscape is only 390 px
    // tall, and H-only sizing made fruit 18-22 px (playtest 2026-10-27: "small and fiddly").
    const r = o.r != null ? o.r : def.size * S();
    const f = {
      type,
      bomb,
      x,
      y,
      r,
      vx: o.vx != null ? o.vx : 0,
      vy: o.vy != null ? o.vy : -1.3 * S(),
      rot: o.rot != null ? o.rot : rng() * TAU,
      vrot: o.vrot != null ? o.vrot : (rng() - 0.5) * 3.2,
      born: state.elapsed,
    };
    state.fruits.push(f);
    spawnCount++;
    return f;
  }

  function sliceFruit(f, angle) {
    const def = TYPES[f.type];
    state.score += def.value;
    state.stats.sliced++;
    push('slice', { fruit: f.type, value: def.value, x: f.x, y: f.y, angle });

    const sep = f.r * 2.4;
    for (const side of [1, -1]) {
      const px = Math.cos(angle + (Math.PI / 2) * side);
      const py = Math.sin(angle + (Math.PI / 2) * side);
      state.halves.push({
        type: f.type, r: f.r,
        x: f.x + px * f.r * 0.32,
        y: f.y + py * f.r * 0.32,
        vx: f.vx * 0.55 + px * sep,
        vy: f.vy * 0.55 + py * sep - 40,
        rot: angle,
        vrot: side * 2.6,
        cut: angle,
        side,
        life: 2.6,
      });
    }

    for (let i = 0; i < 13; i++) {
      const a = angle + (rng() - 0.5) * Math.PI * 1.7;
      const sp = 80 + rng() * 300;
      state.juice.push({
        x: f.x, y: f.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        r: 2 + rng() * 4.5,
        color: def.juice,
        age: 0,
        life: 0.45 + rng() * 0.55,
      });
    }
  }

  function hitBomb(f) {
    state.stats.bombs++;
    state.flash = 1;
    state.shake = 22;
    for (let i = 0; i < 26; i++) {
      const a = rng() * TAU, sp = 60 + rng() * 420;
      state.juice.push({
        x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 2 + rng() * 5, color: i % 3 ? '#ffb347' : '#3a3a44', age: 0, life: 0.5 + rng() * 0.5,
      });
    }
    push('bomb', { x: f.x, y: f.y });
    end('bomb');
  }

  function spawnWave() {
    const t = state.elapsed;
    const [lo, hi] = waveRange(t);
    const count = lo + Math.floor(rng() * (hi - lo + 1));
    const bc = bombChance(t);
    for (let i = 0; i < count; i++) {
      const bomb = rng() < bc;
      const type = bomb ? 'bomb' : pickWeighted(rng);
      const r = (bomb ? 0.055 : TYPES[type].size) * H;
      // a bomb must not start on top of anything already in the air (fruit or another bomb),
      // so a player can always cut the fruit they can see
      const avoid = state.fruits.map(f => ({ x: f.x, r: f.r, bomb: f.bomb }));
      const clashes = (list) => list.some(p => Math.abs(p.x - x) < (p.r + r) * 1.45);
      const blockers = bomb ? avoid : avoid.filter(p => p.bomb);
      let x = 0, tries = 0, clear = false;
      do {
        x = W * (0.12 + rng() * 0.76);
        tries++;
        clear = !clashes(blockers);
      } while (tries < 30 && !clear);
      if (!clear) continue;                       // crowded sky: skip this spawn
      const y = H + r * 0.4;                 // never spawn 40 px below the edge: low-H viewports lost those
      const vy = -H * (1.22 + rng() * 0.20);
      const air = (-2 * vy) / GRAV;
      const vx = ((W * 0.5 - x) / air) * (0.45 + rng() * 0.55);
      addFruit(type, x, y, { r, vy, vx });
    }
    push('wave', { t, count });
  }

  // ---- swipes: the same three calls the pointer handler makes ----
  function beginSwipe() {
    state.swipe = { n: 0, bomb: false, last: null, start: state.elapsed };
    return state.swipe;
  }

  function swipeTo(x, y) {
    if (!state.swipe) beginSwipe();
    const s = state.swipe;
    const last = s.last;
    s.last = { x, y };
    if (!last) return [];
    if (state.status !== 'playing') return [];

    const angle = Math.atan2(y - last.y, x - last.x);
    const hits = [];
    for (let i = state.fruits.length - 1; i >= 0; i--) {
      const f = state.fruits[i];
      if (segDist(f.x, f.y, last.x, last.y, x, y) <= f.r * 0.95) hits.push({ f, i });
    }

    // the bomb resolves first: if this swipe touches one, the run ends and no fruit pays
    const bombHit = hits.find(h => h.f.bomb);
    if (bombHit) {
      state.fruits.splice(bombHit.i, 1);
      s.bomb = true;
      hitBomb(bombHit.f);
      return hits.map(h => h.f);
    }

    // remove from the end so indices stay valid
    hits.sort((a, b) => b.i - a.i);
    for (const h of hits) {
      if (h.i < state.fruits.length) state.fruits.splice(h.i, 1);
    }
    for (const h of hits) {
      s.n++;
      sliceFruit(h.f, angle);
    }
    return hits.map(h => h.f);
  }

  function endSwipe() {
    const s = state.swipe;
    state.swipe = null;
    if (!s || state.status !== 'playing') return { n: 0, bonus: 0 };
    // a sweep held on the glass for over a second is a drag, not a slice: it pays no combo bonus
    const held = state.elapsed - s.start;
    const bonus = held > 1.05 ? 0 : comboBonus(s.n);
    if (bonus === 0 && s.n >= 2) {
      pop('SWEEP TOO LONG', state.W * 0.5, state.H * 0.24);
      push('long', { n: s.n, held: +held.toFixed(2) });
    }
    if (bonus > 0) {
      state.score += bonus;
      state.stats.bestCombo = Math.max(state.stats.bestCombo, s.n);
      const head = W * 0.5;
      pop(`COMBO ×${s.n}`, head, H * 0.24);
      push('combo', { n: s.n, bonus });
      if (s.n >= 4) state.slowmo = 0.45;
    }
    return { n: s.n, bonus };
  }

  function update(dt) {
    if (state.status !== 'playing') return state.events;

    const scale = state.slowmo > 0 ? 0.42 : 1;
    const sdt = dt * scale;
    state.slowmo = Math.max(0, state.slowmo - dt);
    state.flash = Math.max(0, state.flash - dt * 3.2);
    state.shake = Math.max(0, state.shake - dt * 90);

    state.elapsed += dt;              // difficulty follows wall time
    state.timeLeft -= dt;             // the 60 s run is fixed, even during slow motion

    spawnTimer -= sdt;
    let guard = 0;
    while (spawnTimer <= 0 && guard++ < 4) {
      spawnWave();
      spawnTimer += spawnInterval(state.elapsed);
    }

    for (let i = state.fruits.length - 1; i >= 0; i--) {
      const f = state.fruits[i];
      f.vy += GRAV * sdt;
      f.x += f.vx * sdt;
      f.y += f.vy * sdt;
      f.rot += f.vrot * sdt;
      if (f.x < -f.r * 2 || f.x > W + f.r * 2) f.vx *= 0.4;
      if (f.y - f.r > H + Math.max(34, f.r * 1.3)) {
        state.fruits.splice(i, 1);
        if (!f.bomb) {
          state.misses++;
          push('miss', { x: f.x, misses: state.misses });
          if (state.misses >= MAX_MISSES) { end('misses'); break; }
        }
      }
    }

    for (let i = state.halves.length - 1; i >= 0; i--) {
      const h = state.halves[i];
      h.vy += GRAV * 0.85 * sdt;
      h.vx *= Math.pow(0.995, sdt * 60);
      h.x += h.vx * sdt;
      h.y += h.vy * sdt;
      h.rot += h.vrot * sdt;
      h.life -= sdt;
      if (h.life <= 0 || h.y - h.r > H + 90) state.halves.splice(i, 1);
    }

    for (let i = state.juice.length - 1; i >= 0; i--) {
      const j = state.juice[i];
      j.age += sdt;
      j.vy += GRAV * 0.5 * sdt;
      j.x += j.vx * sdt;
      j.y += j.vy * sdt;
      if (j.age >= j.life) state.juice.splice(i, 1);
    }

    for (let i = state.pops.length - 1; i >= 0; i--) {
      state.pops[i].age += dt;
      if (state.pops[i].age >= state.pops[i].life) state.pops.splice(i, 1);
    }

    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      end('time');
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
    state.score = 0;
    state.timeLeft = DURATION;
    state.misses = 0;
    state.elapsed = 0;
    state.fruits.length = 0;
    state.halves.length = 0;
    state.juice.length = 0;
    state.pops.length = 0;
    state.events.length = 0;
    state.swipe = null;
    state.slowmo = 0;
    state.flash = 0;
    state.shake = 0;
    state.stats = { sliced: 0, bestCombo: 0, bombs: 0 };
    state.reason = '';
    spawnTimer = 0.35;
    spawnCount = 0;
    return state;
  }

  function setSize(w, h) {
    const ow = W || w, oh = H || h;
    W = w; H = h; GRAV = 1.0 * S();
    // A rotation must not end the run: scale everything in flight into the new
    // frame, and lift any fruit that the shorter height would put under the floor.
    if (oh > 0 && (Math.abs(ow - w) > 1 || Math.abs(oh - h) > 1)) {
      const kx = w / (ow || w), ky = h / (oh || h);
      const k = Math.min(kx, ky);
      for (const f of state.fruits) {
        f.x *= kx; f.y *= ky;
        f.vx *= kx; f.vy *= ky;
        f.r *= k;
        const floor = H + Math.max(34, f.r * 1.3);
        if (f.y - f.r > floor) f.y = H * 0.45;
      }
      for (const p of state.halves) { p.x *= kx; p.y *= ky; }
      for (const j of state.juice) { j.x *= kx; j.y *= ky; }
      for (const p of state.pops) { p.x *= kx; p.y *= ky; }
    }
  }

  function pause() { if (state.status === 'playing') state.status = 'paused'; }
  function resume() { if (state.status === 'paused') state.status = 'playing'; }

  return {
    get W() { return W; },
    get H() { return H; },
    state,
    setSize,
    start, pause, resume, update, drain,
    beginSwipe, swipeTo, endSwipe,
    addFruit,
    // test / self-use helpers
    setTime: (t) => { state.timeLeft = t; },
    spawnWave,
    gravity: GRAV,
  };
}
