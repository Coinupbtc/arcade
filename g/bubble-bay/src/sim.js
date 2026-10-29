// Bubble Bay — DOM-free simulation: hex grid, launcher, projectile, matches, ceiling.

export const COLORS = ['#e8404f', '#46c05a', '#3a7fe0', '#f2c93e', '#a465d8', '#9aa4b0'];
export const COLOR_NAMES = ['red', 'green', 'blue', 'yellow', 'purple', 'grey'];

const SQ3 = Math.sqrt(3);

export function createSim(opts = {}) {
  const rng = opts.rng || Math.random;
  let W = opts.W || 390;
  let H = opts.H || 844;

  const state = {
    status: 'ready',            // ready | playing | clear | over
    score: 0,
    best: 0,
    round: 1,
    shots: 0,
    shotsSinceDrop: 0,
    shotsPerDrop: 8,
    grid: new Map(),            // "r,c" -> { color, r, c, x, y }
    projectile: null,
    aim: { angle: -Math.PI / 2, active: false },
    current: null,
    next: null,
    particles: [],
    pops: [],
    events: [],
    flash: 0,
    shake: 0,
    reason: '',
    stats: { popped: 0, dropped: 0 },
  };

  let R = 18, cols = 11, rowH = 31, topY = 110, floorY = 760, dangerY = 620, launchX = 195, launchY = 760;
  let gridLeft = 0, gridRight = 390;

  function layout() {
    cols = W > H ? 12 : 11;
    R = Math.min((W * 0.98) / (2 * cols), H * 0.05);
    rowH = R * SQ3;
    topY = H * 0.14;
    floorY = H * 0.92;
    dangerY = H * 0.78;
    const gridW = cols * 2 * R;
    gridLeft = (W - gridW) / 2;
    gridRight = gridLeft + gridW;
    launchX = W / 2;
    launchY = floorY - R * 0.2;
  }
  layout();

  function cellX(r, c) { return gridLeft + R + c * 2 * R + (r % 2) * R; }
  function cellY(r) { return topY + r * rowH + R; }
  function inBounds(r, c) {
    if (r < 0 || c < 0) return false;
    if (c >= cols) return false;
    if (r % 2 === 1 && c >= cols - 1) return false;
    return true;
  }
  function key(r, c) { return r + ',' + c; }

  function neighbors(r, c) {
    const out = [];
    const even = r % 2 === 0;
    out.push([r, c - 1], [r, c + 1]);
    if (even) {
      out.push([r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]);
    } else {
      out.push([r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]);
    }
    return out.filter(([rr, cc]) => inBounds(rr, cc));
  }

  function paletteSize() {
    return Math.min(3 + Math.floor((state.round - 1) / 2), 6);
  }
  function pickColor() {
    // never hand the player a colour that is not on the wall: that is a dead turn
    const onWall = new Set();
    for (const b of state.grid.values()) onWall.add(b.color);
    const pool = onWall.size ? [...onWall] : COLORS.slice(0, paletteSize());
    return pool[Math.floor(rng() * pool.length)];
  }

  function addBubble(r, c, color) {
    const b = { r, c, color, x: cellX(r, c), y: cellY(r) };
    state.grid.set(key(r, c), b);
    return b;
  }

  function clearGrid() {
    state.grid.clear();
  }

  function buildRound() {
    clearGrid();
    // The opening wall must leave at least three rows of shooting room above the line.
    // H-only sizing capped R in landscape, so five rows started two rows from the danger
    // line and round 1 was near-fatal there (playtest 2026-10-27: 0 of 9 clears).
    const room = Math.max(2, Math.floor(((dangerY - topY) - rowH * 3.2) / rowH));
    const rows = Math.min(4 + Math.min(state.round, 6), Math.max(3, room));
    const nColors = paletteSize();
    const useColors = COLORS.slice(0, nColors);
    for (let r = 0; r < rows; r++) {
      const maxC = r % 2 === 1 ? cols - 1 : cols;
      for (let c = 0; c < maxC; c++) {
        if (rng() < 0.22) continue;                       // holes so clusters can hang
        const color = useColors[Math.floor(rng() * useColors.length)];
        addBubble(r, c, color);
      }
    }
    // guarantee every colour appears at least twice, so matching is always possible
    for (const col of useColors) {
      let count = 0;
      for (const b of state.grid.values()) if (b.color === col) count++;
      let guard = 0;
      while (count < 2 && guard++ < 40) {
        const r = Math.floor(rng() * Math.min(3, rows));
        const maxC = r % 2 === 1 ? cols - 1 : cols;
        const c = Math.floor(rng() * maxC);
        if (!state.grid.has(key(r, c))) { addBubble(r, c, col); count++; }
      }
    }
    state.shotsSinceDrop = 0;
    state.shotsPerDrop = Math.max(5, 8 - Math.floor((state.round - 1) / 2));
    state.projectile = null;
    state.aim = { angle: -Math.PI / 2, active: false };
    state.current = pickColor();
    state.next = pickColor();
  }

  function event(type, data) {
    state.events.push(Object.assign({ type }, data || {}));
  }

  function start() {
    state.status = 'playing';
    state.score = 0;
    state.round = 1;
    state.shots = 0;
    state.particles.length = 0;
    state.pops.length = 0;
    state.events.length = 0;
    state.flash = 0;
    state.shake = 0;
    state.reason = '';
    state.stats = { popped: 0, dropped: 0 };
    buildRound();
    return state;
  }

  function nextRound() {
    state.round++;
    state.status = 'playing';
    state.projectile = null;
    state.shotsSinceDrop = 0;
    buildRound();
    return state;
  }

  /* ------------------------------------------------------------ aiming */

  function clampAngle(a) {
    const lo = -Math.PI + 0.20;    // just past straight-left
    const hi = -0.20;              // just past straight-right
    return Math.max(lo, Math.min(hi, a));
  }

  function aimAt(x, y) {
    const dx = x - launchX;
    const dy = y - launchY;
    let a = Math.atan2(dy, dx);
    if (a > 0) a = dy < 0 ? a : (dx >= 0 ? -0.20 : -Math.PI + 0.20);
    state.aim.angle = clampAngle(a);
    state.aim.active = true;
    return state.aim.angle;
  }

  function swap() {
    if (state.status !== 'playing' || state.projectile) return false;
    const t = state.current;
    state.current = state.next;
    state.next = t;
    event('swap');
    return true;
  }

  /* ------------------------------------------------------------ shooting */

  function speed() {
    return Math.max(560, R * 58);
  }

  function shoot() {
    if (state.status !== 'playing' || state.projectile) return false;
    const a = state.aim.angle;
    const sp = speed();
    state.projectile = {
      x: launchX, y: launchY,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      color: state.current,
      bounces: 0,
    };
    state.current = state.next;
    state.next = pickColor();
    state.aim.active = false;
    state.shots++;
    event('shoot', { color: state.projectile.color });
    return true;
  }

  /* ------------------------------------------------------------ grid math */

  function nearestEmptyCell(x, y) {
    let best = null, bestD = Infinity;
    for (let r = 0; r < 40; r++) {
      const maxC = r % 2 === 1 ? cols - 1 : cols;
      for (let c = 0; c < maxC; c++) {
        if (state.grid.has(key(r, c))) continue;
        const bx = cellX(r, c), by = cellY(r);
        if (by - R > dangerY) continue;
        const d = (bx - x) ** 2 + (by - y) ** 2;
        if (d < bestD) { bestD = d; best = { r, c }; }
      }
    }
    return best;
  }

  function snapCell(x, y, hitBubble) {
    if (hitBubble) {
      let best = null, bestD = Infinity;
      for (const [rr, cc] of neighbors(hitBubble.r, hitBubble.c)) {
        if (state.grid.has(key(rr, cc))) continue;
        const bx = cellX(rr, cc), by = cellY(rr);
        const d = (bx - x) ** 2 + (by - y) ** 2;
        if (d < bestD) { bestD = d; best = { r: rr, c: cc }; }
      }
      if (best) return best;
    }
    // ceiling hit, or no free neighbour: snap to the closest legal free cell
    return nearestEmptyCell(x, y);
  }

  function groupFrom(r, c, color) {
    const seen = new Set();
    const stack = [[r, c]];
    const out = [];
    while (stack.length) {
      const [rr, cc] = stack.pop();
      const k = key(rr, cc);
      if (seen.has(k)) continue;
      seen.add(k);
      const b = state.grid.get(k);
      if (!b || b.color !== color) continue;
      out.push(b);
      for (const [nr, nc] of neighbors(rr, cc)) {
        if (!seen.has(key(nr, nc))) stack.push([nr, nc]);
      }
    }
    return out;
  }

  function attachedSet() {
    const seen = new Set();
    const stack = [];
    for (const b of state.grid.values()) if (b.r === 0) stack.push(b);
    while (stack.length) {
      const b = stack.pop();
      const k = key(b.r, b.c);
      if (seen.has(k)) continue;
      seen.add(k);
      for (const [nr, nc] of neighbors(b.r, b.c)) {
        const nb = state.grid.get(key(nr, nc));
        if (nb && !seen.has(key(nr, nc))) stack.push(nb);
      }
    }
    return seen;
  }

  function burst(b) {
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2;
      const sp = 40 + rng() * 190;
      state.particles.push({
        x: b.x, y: b.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: 1.5 + rng() * 3, color: b.color, age: 0, life: 0.35 + rng() * 0.4,
      });
    }
  }

  function pop(text, x, y) {
    state.pops.push({ text, x, y, age: 0, life: 1.0 });
  }

  function land(px, py, color) {
    const hit = (() => {
      let best = null, bestD = Infinity;
      for (const b of state.grid.values()) {
        const d = (b.x - px) ** 2 + (b.y - py) ** 2;
        if (d < (2 * R * 0.92) ** 2 && d < bestD) { bestD = d; best = b; }
      }
      return best;
    })();

    const cell = snapCell(px, py, hit);
    if (!cell) { event('miss'); return; }
    const b = addBubble(cell.r, cell.c, color);
    event('land', { x: b.x, y: b.y, color });

    const group = groupFrom(cell.r, cell.c, color);
    let popped = 0, dropped = 0;
    if (group.length >= 3) {
      for (const g of group) {
        state.grid.delete(key(g.r, g.c));
        burst(g);
        popped++;
      }
      const attached = attachedSet();
      for (const other of [...state.grid.values()]) {
        if (!attached.has(key(other.r, other.c))) {
          state.grid.delete(key(other.r, other.c));
          burst(other);
          dropped++;
        }
      }
      state.stats.popped += popped;
      state.stats.dropped += dropped;
      const gained = popped * 10 + dropped * 25;
      state.score += gained;
      state.flash = Math.min(1, 0.25 + popped * 0.05 + dropped * 0.04);
      if (dropped > 0) state.shake = 8;
      pop('+' + gained, b.x, b.y - R * 1.6);
      event('pop', { n: popped, dropped, gained, x: b.x, y: b.y });
    }

    if (state.grid.size === 0) {
      state.status = 'clear';
      event('clear', { round: state.round, score: state.score });
      return;
    }

    state.shotsSinceDrop++;
    if (state.shotsSinceDrop >= state.shotsPerDrop) {
      state.shotsSinceDrop = 0;
      dropCeiling();
    }

    // danger check
    for (const b of state.grid.values()) {
      if (b.y + R > dangerY) {
        state.status = 'over';
        state.reason = 'line';
        state.shake = 26;
        state.flash = 1;
        event('over', { reason: 'line', score: state.score, round: state.round });
        return;
      }
    }
  }

  function dropCeiling() {
    const next = new Map();
    for (const b of state.grid.values()) {
      const nr = b.r + 1;
      const nb = { r: nr, c: b.c, color: b.color, x: cellX(nr, b.c), y: cellY(nr) };
      next.set(key(nr, b.c), nb);
    }
    state.grid.clear();
    for (const [k, v] of next) state.grid.set(k, v);

    const maxC = cols;                      // new top row is even
    for (let c = 0; c < maxC; c++) {
      if (rng() < 0.18) continue;
      addBubble(0, c, pickColor());
    }
    event('dropRow', { round: state.round, shotsPerDrop: state.shotsPerDrop });
  }

  /* ------------------------------------------------------------ update */

  function update(dt) {
    if (state.status !== 'playing') {
      // let particles settle on menus too
      stepParticles(dt);
      return state.events;
    }

    stepParticles(dt);
    state.flash = Math.max(0, state.flash - dt * 3);
    state.shake = Math.max(0, state.shake - dt * 90);

    const p = state.projectile;
    if (p) {
      const steps = 3;
      for (let s = 0; s < steps && p; s++) {
        const h = dt / steps;
        p.x += p.vx * h;
        p.y += p.vy * h;

        if (p.x - R < gridLeft) { p.x = gridLeft + R; p.vx = Math.abs(p.vx); p.bounces++; event('bounce'); }
        if (p.x + R > gridRight) { p.x = gridRight - R; p.vx = -Math.abs(p.vx); p.bounces++; event('bounce'); }

        // ceiling
        if (p.y - R <= topY) { land(p.x, topY + R * 0.4, p.color); state.projectile = null; return state.events; }

        // bubble contact
        for (const b of state.grid.values()) {
          const d = Math.hypot(b.x - p.x, b.y - p.y);
          if (d < 2 * R * 0.90) {
            land(p.x, p.y, p.color);
            state.projectile = null;
            return state.events;
          }
        }

        // safety: if it somehow leaves the band, snap it
        if (p.y > floorY + R * 2) { state.projectile = null; event('miss'); }
      }
    }

    return state.events;
  }

  function stepParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const q = state.particles[i];
      q.age += dt;
      q.vy += 900 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.age >= q.life) state.particles.splice(i, 1);
    }
    for (let i = state.pops.length - 1; i >= 0; i--) {
      state.pops[i].age += dt;
      if (state.pops[i].age >= state.pops[i].life) state.pops.splice(i, 1);
    }
  }

  function drain() {
    const out = state.events;
    state.events = [];
    return out;
  }

  function setSize(w, h) {
    W = w; H = h;
    layout();
    // re-place every bubble on the new grid
    for (const b of state.grid.values()) {
      b.x = cellX(b.r, b.c);
      b.y = cellY(b.r);
    }
    state.projectile = null;
  }

  function pause() { if (state.status === 'playing') state.status = 'paused'; }
  function resume() { if (state.status === 'paused') state.status = 'playing'; }

  /* ------------------------------------------------------------ self-use */

  function aimPreview(maxBounces = 2) {
    // returns the polyline of the guide, ending at first contact or after maxBounces
    const a = state.aim.angle;
    const sp = speed();
    let x = launchX, y = launchY;
    let vx = Math.cos(a), vy = Math.sin(a);
    const pts = [{ x, y }];
    let bounces = 0;
    for (let i = 0; i < 900; i++) {
      const nx = x + vx * 6, ny = y + vy * 6;
      if (nx - R < gridLeft || nx + R > gridRight) {
        bounces++;
        vx = -vx;
        pts.push({ x: nx, y: ny });
        if (bounces > maxBounces) break;
        continue;
      }
      if (ny - R <= topY) { pts.push({ x: nx, y: ny }); break; }
      let hit = false;
      for (const b of state.grid.values()) {
        if (Math.hypot(b.x - nx, b.y - ny) < 2 * R * 0.9) { hit = true; break; }
      }
      x = nx; y = ny;
      if (hit) { pts.push({ x, y }); break; }
    }
    return pts;
  }

  buildRound();          // menu backdrop: a real wall is already on screen

  return {
    get W() { return W; },
    get H() { return H; },
    get R() { return R; },
    get cols() { return cols; },
    get rowH() { return rowH; },
    get topY() { return topY; },
    get dangerY() { return dangerY; },
    get launchX() { return launchX; },
    get launchY() { return launchY; },
    get gridLeft() { return gridLeft; },
    get gridRight() { return gridRight; },
    get gridW() { return gridRight - gridLeft; },
    state,
    setSize, start, nextRound, pause, resume,
    aimAt, aimPreview, shoot, swap,
    update, drain,
    // test / self-use helpers
    addBubble, groupFrom, attachedSet, dropCeiling, land,
    gridHas: (r, c) => state.grid.has(key(r, c)),
    cellX, cellY,
    setShotsPerDrop: (n) => { state.shotsPerDrop = n; },
    setStatus: (s) => { state.status = s; },
  };
}
