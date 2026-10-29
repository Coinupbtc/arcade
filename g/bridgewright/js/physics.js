/* BRIDGEWRIGHT — Matter.js bridge world (v3).
 * Beams are rigid bodies pinned at both ends by zero-length constraints. Joints are pins: beams
 * rotate freely, so a flat chain sags and a triangle is rigid. Matter owns all motion and sag.
 *
 * v3 load model: a road beam only carries weight if its joints are tied to the banks by real
 * structure. Support beams are traced back to static anchors; a dangling stub reaches nothing and
 * therefore earns no credit. That is what makes trusses matter and fake braces useless.
 */
(function (root) {
  'use strict';

  const L = root.BW_LEVELS || (typeof require === 'function' ? require('./levels.js') : null);
  const M = root.Matter || (typeof require === 'function' ? require('../vendor/matter.js') : null);
  const { MATS, VEHICLES, LADDER } = L;

  const CAT = { road: 0x0002, terrain: 0x0004, vehicle: 0x0008, anchor: 0x0010, support: 0x0020 };
  const MAX_BEAM = 300;
  const MIN_BEAM = 24;
  const GRID = 20;
  const STEP = 1000 / 120;

  // Load model (v5): a real linear-elastic 2D frame analysis. Geometry decides, not a graph credit.
  // Each beam is an Euler-Bernoulli element: axial stiffness EA = strength*E_A, bending stiffness
  // EI = strength*E_I (px^2). A deep truss carries load by axial action; a shallow one bends under a
  // moment it cannot take; a bare chain of road beams is a near-mechanism and sags like a rope.
  const E_A = 6.0;            // axial stiffness per strength unit
  const E_I = 90.0;           // bending stiffness per strength unit (px^2)
  const N_CAP = 3.5;          // axial capacity per strength unit
  const M_CAP = 12.0;         // moment capacity per strength unit (load*px)
  const BUCKLE = 1.4;         // compression capacity falls with (len/160)^2
  const DEFL_MAX = 150;       // analytic deck drop (px) that counts as a collapse
  const ANALYZE_MS = 80;      // re-solve cadence: the solver is O(n^3) and runs on the fly
  const SPAN_REF = 120;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

  class BridgeWorld {
    constructor(level, hooks, opts) {
      this.level = level;
      this.hooks = hooks || {};
      // Simulator: no budget. Every beam is free.
      this.budget = Infinity;
      this.maxBeam = level.maxBeam || MAX_BEAM;
      this.segments = [];
      this.reset([]);
    }

    setBudget(n) { this.budget = n; }

    /* ---------- setup ---------- */

    reset(segments) {
      if (this.engine) {
        M.Events.off(this.engine);
        M.Engine.clear(this.engine);
      }
      this.engine = M.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
      this.engine.positionIterations = 40;
      this.engine.velocityIterations = 12;
      this.engine.constraintIterations = 12;
      this.world = this.engine.world;
      this.nodes = [];
      this.nodeMap = new Map();
      this.beams = [];
      this.vehicles = [];
      this.debris = [];
      this.segments = [];
      this.run = null;
      this.time = 0;
      this.snaps = 0;
      this.acc = 0;
      this.lastMaxStress = 0;
      this.maxSag = 0;
      this.lastFail = null;
      this.lastSnap = null;
      this._reach = null;
      this._stressDirty = true;
      this._analysisT = undefined;
      this.massScale = this.level.massScale || 1;

      this.buildStatics();
      this.buildAnchors();
      for (const s of segments || []) {
        this.addBeam(s.ax, s.ay, s.bx, s.by, s.mat, s.kind || 'road', { silent: true });
      }

      M.Events.on(this.engine, 'collisionStart', (ev) => {
        for (const pair of ev.pairs) {
          const a = pair.bodyA, b = pair.bodyB;
          const veh = a.label === 'vehicle' ? a : b.label === 'vehicle' ? b : null;
          if (!veh) continue;
          const other = veh === a ? b : a;
          const sup = pair.collision && pair.collision.supports && pair.collision.supports[0];
          if (sup && this.hooks.onHit) {
            const speed = Math.hypot(veh.velocity.x, veh.velocity.y);
            this.hooks.onHit({ x: sup.x, y: sup.y, speed, other: other.label, heavy: veh.plugin.weight });
          }
        }
      });
    }

    buildStatics() {
      const lv = this.level;
      const opts = {
        isStatic: true, friction: 1, frictionStatic: 2, restitution: 0,
        collisionFilter: { group: 0, category: CAT.terrain, mask: CAT.road | CAT.vehicle },
        label: 'terrain',
      };
      const add = (x, y, w, h) => {
        const body = M.Bodies.rectangle(x, y, w, h, opts);
        M.Composite.add(this.world, body);
        return body;
      };
      add((lv.left.edge - 500) / 2, lv.left.top + 320, lv.left.edge + 500, 640);
      add((lv.right.edge + 1500) / 2, lv.right.top + 320, 1500 - lv.right.edge, 640);
      for (const p of lv.piers || []) {
        const body = M.Bodies.rectangle(p.x, p.top + 320, p.w || 56, 640, {
          isStatic: true, friction: 1, frictionStatic: 2, restitution: 0,
          collisionFilter: { group: 0, category: CAT.terrain, mask: CAT.road },
          label: 'pier',
        });
        M.Composite.add(this.world, body);
      }

      const ramp = (x1, y1, x2, y2) => {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const thick = 10;
        const offX = -Math.sin(ang) * (thick / 2), offY = Math.cos(ang) * (thick / 2);
        const body = M.Bodies.rectangle((x1 + x2) / 2 + offX, (y1 + y2) / 2 + offY, len, thick, {
          isStatic: true, angle: ang, friction: 1, frictionStatic: 2, restitution: 0,
          collisionFilter: { group: 0, category: CAT.terrain, mask: CAT.road | CAT.vehicle },
          label: 'ramp',
        });
        M.Composite.add(this.world, body);
      };
      ramp(lv.left.edge - 56, lv.left.top, lv.left.edge - 2, lv.left.top - 6);
      this.terrain = { leftEdge: lv.left.edge, rightEdge: lv.right.edge, leftTop: lv.left.top, rightTop: lv.right.top };
    }

    buildAnchors() {
      const lv = this.level;
      const add = (x, y) => this.makeNode(x, y, true);
      for (const [x, y] of lv.anchors.left) add(x, y);
      for (const [x, y] of lv.anchors.right) add(x, y);
      for (const [x, y] of lv.anchors.piers || []) add(x, y);
    }

    makeNode(x, y, anchor) {
      const key = x.toFixed(1) + ',' + y.toFixed(1);
      if (this.nodeMap.has(key)) return this.nodeMap.get(key);
      const body = M.Bodies.circle(x, y, anchor ? 9 : 6, {
        isStatic: !!anchor,
        frictionAir: 0.01,
        collisionFilter: { group: -1, category: CAT.anchor, mask: 0 },
        label: anchor ? 'anchor' : 'joint',
      });
      if (!anchor) M.Body.setMass(body, 0.3);
      M.Composite.add(this.world, body);
      const node = { key, body, anchor: !!anchor, x0: x, y0: y, beams: [] };
      this.nodes.push(node);
      this.nodeMap.set(key, node);
      this._credit = null;
      return node;
    }

    getNode(x, y) { return this.makeNode(x, y, false); }

    nodeNear(x, y, r) {
      let best = null, bestD = r;
      for (const n of this.nodes) {
        const d = dist(x, y, n.body.position.x, n.body.position.y);
        if (d < bestD) { bestD = d; best = n; }
      }
      return best;
    }

    /* ---------- placement (the ONE function the touch handler and tests share) ---------- */

    snapPoint(fromNode, wx, wy) {
      const fx = fromNode.body.position.x, fy = fromNode.body.position.y;
      let dx = wx - fx, dy = wy - fy;
      let len = Math.hypot(dx, dy);
      let clamped = false;
      if (len > this.maxBeam) { dx = dx / len * this.maxBeam; dy = dy / len * this.maxBeam; clamped = true; }
      const yOff = ((fy % GRID) + GRID) % GRID;
      let ex = Math.round((fx + dx) / GRID) * GRID;
      let ey = Math.round((fy + dy - yOff) / GRID) * GRID + yOff;
      let l2 = dist(fx, fy, ex, ey);
      if (l2 > this.maxBeam) {
        ex -= Math.sign(ex - fx) * GRID;
        ey -= Math.sign(ey - fy) * GRID;
        ey = Math.round((ey - yOff) / GRID) * GRID + yOff;
        l2 = dist(fx, fy, ex, ey);
        clamped = true;
      }
      return { x: ex, y: ey, len: dist(fx, fy, ex, ey), clamped };
    }

    preview(fromNode, wx, wy, matKey, kind, snapRadius) {
      const mat = MATS[matKey];
      if (!mat) return { ok: false, reason: 'MAT' };
      const near = this.nodeNear(wx, wy, snapRadius || 14);
      let p, node;
      if (near && near !== fromNode) {
        node = near;
        p = { x: near.body.position.x, y: near.body.position.y, len: dist(fromNode.body.position.x, fromNode.body.position.y, near.body.position.x, near.body.position.y), clamped: false };
      } else {
        p = this.snapPoint(fromNode, wx, wy);
        node = this.nodeNear(p.x, p.y, GRID * 0.55) || null;
      }
      const len = p.len;
      const cost = this.beamCost(len, matKey);
      let reason = null;
      if (len < MIN_BEAM) reason = 'SHORT';
      else if (len > this.maxBeam + 0.5) reason = 'LONG';
      else if (node === fromNode) reason = 'SAME';
      else if (fromNode.beams.some((bm) => bm.a === node || bm.b === node)) reason = 'EXISTS';
      else if (this.level.noUnderDeck && kind === 'support' &&
               (fromNode.body.position.y + p.y) / 2 > this.deckLineY((fromNode.body.position.x + p.x) / 2) + 10) reason = 'UNDER';
      return { ok: !reason, reason, x: p.x, y: p.y, len, cost, clamped: p.clamped, node };
    }

    place(fromNode, wx, wy, matKey, kind, snapRadius) {
      const p = this.preview(fromNode, wx, wy, matKey, kind, snapRadius);
      if (!p.ok) return { ok: false, reason: p.reason, cost: p.cost, clamped: p.clamped };
      let node = p.node;
      if (!node) node = this.makeNode(p.x, p.y, false);
      const beam = this.addBeam(fromNode.body.position.x, fromNode.body.position.y, node.body.position.x, node.body.position.y, matKey, kind);
      if (!beam) return { ok: false, reason: 'ADD', node, cost: p.cost, clamped: p.clamped };
      return { ok: true, node, beam, cost: p.cost, clamped: p.clamped, len: p.len };
    }

    /* ---------- beams ---------- */

    beamCost(len, matKey) { return 0; }

    deckLineY(x) {
      const top = (arr) => arr.slice().sort((a, b) => a[1] - b[1])[0];
      const a = top(this.level.anchors.left), b = top(this.level.anchors.right);
      return a[1] + (b[1] - a[1]) * ((x - a[0]) / (b[0] - a[0]));
    }

    addBeam(ax, ay, bx, by, matKey, kind, opts) {
      opts = opts || {};
      kind = kind === 'support' ? 'support' : 'road';
      const len = dist(ax, ay, bx, by);
      if (len < MIN_BEAM || len > this.maxBeam + 0.5) return null;
      if (!MATS[matKey]) return null;
      const a = this.getNode(ax, ay);
      const b = this.getNode(bx, by);
      if (a === b) return null;
      if (a.beams.some((bm) => bm.a === b || bm.b === b)) return null;

      const mat = MATS[matKey];
      const angle = Math.atan2(by - ay, bx - ax);
      const h = mat.thick / 2;
      const downX = Math.cos(angle) >= 0 ? -Math.sin(angle) * h : Math.sin(angle) * h;
      const downY = Math.cos(angle) >= 0 ? Math.cos(angle) * h : -Math.cos(angle) * h;
      const isRoad = kind === 'road';
      // v3: a generous chamfer on road beams removes the deck-joint lip that used to jam wheels.
      const body = M.Bodies.rectangle((ax + bx) / 2 + downX, (ay + by) / 2 + downY, len, mat.thick, {
        angle,
        chamfer: { radius: Math.min(isRoad ? 6 : 3, mat.thick / 2.1) },
        friction: 0.9,
        frictionStatic: 1.0,
        restitution: 0,
        frictionAir: 0.004,
        collisionFilter: isRoad
          ? { group: -1, category: CAT.road, mask: CAT.vehicle }
          : { group: -1, category: CAT.support, mask: 0 },
        label: isRoad ? 'road' : 'support',
      });
      M.Body.setMass(body, mat.mass * len);
      M.Composite.add(this.world, body);

      const hx = Math.cos(angle) * (len / 2), hy = Math.sin(angle) * (len / 2);
      const ex = hx - downX, ey = hy - downY;
      const sx = -hx - downX, sy = -hy - downY;
      const inv = (x, y) => ({ x: x * Math.cos(angle) + y * Math.sin(angle), y: -x * Math.sin(angle) + y * Math.cos(angle) });
      const localA = inv(sx, sy), localB = inv(ex, ey);
      // v3: stiff pins. The old soft road pins let the deck hang like a rope (30-50px sag).
      const stiff = isRoad ? Math.max(0.94, Math.min(0.998, mat.stiffness)) : 0.99;
      const c1 = M.Constraint.create({
        bodyA: a.body, pointA: { x: 0, y: 0 },
        bodyB: body, pointB: { x: sx, y: sy },
        length: 0, stiffness: stiff, damping: 0.3,
      });
      const c2 = M.Constraint.create({
        bodyA: body, pointA: { x: ex, y: ey },
        bodyB: b.body, pointB: { x: 0, y: 0 },
        length: 0, stiffness: stiff, damping: 0.3,
      });
      M.Composite.add(this.world, c1);
      M.Composite.add(this.world, c2);

      const beam = {
        id: this.beams.length + 1, a, b, mat: matKey, matDef: mat, kind,
        ax, ay, bx, by, len, body, c1, c2, localA, localB,
        stress: 0, raw: 0, over: 0, broken: false, load: 0,
      };
      this.beams.push(beam);
      a.beams.push(beam);
      b.beams.push(beam);
      this.segments.push({ ax, ay, bx, by, mat: matKey, kind });
      // Both credits are connectivity caches. The v4 code reset `_credit` here but the reading moved
      // to `_reach` while the reset did not follow, so a new joint read as untied (red ring, false
      // "NO GROUND PATH" toast) until a member snapped. Reset the one the UI actually reads.
      this._credit = null;
      this._reach = null;
      this._stressDirty = true;
      if (!opts.silent && this.hooks.onBuild) this.hooks.onBuild({ beam, cost: this.beamCost(len, matKey) });
      return beam;
    }

    removeBeam(beam) {
      if (!beam || beam.broken) return;
      M.Composite.remove(this.world, beam.body);
      M.Composite.remove(this.world, beam.c1);
      M.Composite.remove(this.world, beam.c2);
      beam.a.beams = beam.a.beams.filter((x) => x !== beam);
      beam.b.beams = beam.b.beams.filter((x) => x !== beam);
      this.beams = this.beams.filter((x) => x !== beam);
      this.segments = this.segments.filter((s) =>
        !(Math.abs(s.ax - beam.ax) < 0.5 && Math.abs(s.ay - beam.ay) < 0.5 &&
          Math.abs(s.bx - beam.bx) < 0.5 && Math.abs(s.by - beam.by) < 0.5 &&
          s.mat === beam.mat && s.kind === beam.kind));
      for (const n of [beam.a, beam.b]) {
        if (!n.anchor && n.beams.length === 0) {
          M.Composite.remove(this.world, n.body);
          this.nodes = this.nodes.filter((x) => x !== n);
          this.nodeMap.delete(n.key);
        }
      }
      this._credit = null;
      this._reach = null;
      this._stressDirty = true;
      if (this.hooks.onRemove) this.hooks.onRemove({ beam, refund: this.beamCost(beam.len, beam.mat) });
    }

    beamAt(wx, wy, radius) {
      let best = null, bestD = radius;
      for (const bm of this.beams) {
        if (bm.broken) continue;
        const ax = bm.a.body.position.x, ay = bm.a.body.position.y;
        const bx = bm.b.body.position.x, by = bm.b.body.position.y;
        const t = clamp(((wx - ax) * (bx - ax) + (wy - ay) * (by - ay)) / (bm.len * bm.len), 0, 1);
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        const d = dist(wx, wy, px, py);
        if (d < bestD) { bestD = d; best = bm; }
      }
      return best;
    }

    nodeAt(wx, wy, radius) {
      let best = null, bestD = radius;
      for (const n of this.nodes) {
        if (!n.anchor && n.beams.length === 0 && n.body.position.y > this.level.world.waterY + 80) continue;
        const d = dist(wx, wy, n.body.position.x, n.body.position.y);
        if (d < bestD) { bestD = d; best = n; }
      }
      return best;
    }

    /* ---------- structure: ground path (the UI reading) ---------- */

    // A joint is TIED when an unbroken chain of beams reaches a bank or a pier. That is the honest
    // "has a ground path" reading the renderer and the HUD show. Strength is not guessed here: the
    // frame solve below measures it.
    computeStructure() {
      const reach = new Map();
      for (const n of this.nodes) reach.set(n, n.anchor ? 1 : 0);
      let changed = true, guard = 0;
      while (changed && guard++ < 40) {
        changed = false;
        for (const n of this.nodes) {
          if (n.anchor || (reach.get(n) || 0) > 0) continue;
          for (const bm of n.beams) {
            if (bm.broken) continue;
            const o = bm.a === n ? bm.b : bm.a;
            if ((reach.get(o) || 0) > 0) { reach.set(n, 1); changed = true; break; }
          }
        }
      }
      this._reach = reach;
    }

    nodeReach(n) {
      if (!this._reach) this.computeStructure();
      return this._reach.get(n) || 0;
    }

    // Kept for the HUD and the renderer: "does this joint have a ground path", 0..1.
    nodeCredit(n) { return this.nodeReach(n); }

    /* ---------- helpers ---------- */

    deckPlan(matKey) {
      const lv = this.level;
      const top = (arr) => arr.slice().sort((a, b) => a[1] - b[1])[0];
      const left = top(lv.anchors.left);
      const right = top(lv.anchors.right);
      const deckYAt = (x) => left[1] + (right[1] - left[1]) * ((x - left[0]) / (right[0] - left[0]));

      // v3: the quick deck runs through every pier and drops a post onto it, so a pier is a real
      // support instead of decoration. Deck stays straight: no kink for wheels to hit.
      const pierXs = (lv.piers || []).map((p) => p.x).filter((x) => x > left[0] + 20 && x < right[0] - 20).sort((a, b) => a - b);
      const stops = [left[0], ...pierXs, right[0]];
      const segs = [];
      let cost = 0;
      for (let i = 0; i < stops.length - 1; i++) {
        const x1 = stops[i], x2 = stops[i + 1];
        const y1 = deckYAt(x1), y2 = deckYAt(x2);
        const len = dist(x1, y1, x2, y2);
        const n = Math.max(1, Math.ceil(len / 140));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          segs.push({
            ax: x1 + (x2 - x1) * t0, ay: y1 + (y2 - y1) * t0,
            bx: x1 + (x2 - x1) * t1, by: y1 + (y2 - y1) * t1,
            mat: matKey, kind: 'road',
          });
          cost += this.beamCost(dist(x1, y1, x2, y2) / n, matKey);
        }
      }
      const posts = [];
      const pierAnchors = lv.anchors.piers || [];
      for (const px of pierXs) {
        const py = deckYAt(px);
        let best = null, bd = 1e9;
        for (const [ax, ay] of pierAnchors) {
          const d = Math.abs(ax - px) + Math.abs(ay - (py + 30));
          if (d < bd) { bd = d; best = [ax, ay]; }
        }
        if (!best) continue;
        const len = dist(px, py, best[0], best[1]);
        if (len < MIN_BEAM || len > MAX_BEAM) continue;
        posts.push({ ax: px, ay: py, bx: best[0], by: best[1], mat: matKey, kind: 'support' });
        cost += this.beamCost(len, matKey);
      }
      return { segs, posts, cost };
    }

    applyDeck(matKey) {
      const plan = this.deckPlan(matKey);
      for (const s of plan.segs) this.addBeam(s.ax, s.ay, s.bx, s.by, s.mat, 'road');
      for (const s of plan.posts) this.addBeam(s.ax, s.ay, s.bx, s.by, s.mat, 'support');
      return plan;
    }

    /* ---------- run: the load ladder ---------- */

    startRun() {
      this.maxSag = 0;
      this.lastFail = null;
      this.run = {
        t: 0, tier: -1, heaviest: -1, crossed: 0, dead: 0, failed: false, done: false,
        reason: null, nextAt: 220, total: LADDER.length, target: this.level.target || LADDER.length - 1, active: null,
      };
      return this.run;
    }

    spawnVehicle(typeKey) {
      const lv = this.level;
      const type = VEHICLES[typeKey];
      const x = lv.left.edge - 118;
      const y = lv.left.top - type.h / 2 - 8;
      const body = M.Bodies.rectangle(x, y, type.w, type.h, {
        chamfer: { radius: type.h * 0.46 },
        friction: 0.85, frictionStatic: 1.6, restitution: 0, frictionAir: 0.002,
        collisionFilter: { group: 0, category: CAT.vehicle, mask: CAT.road | CAT.terrain },
        label: 'vehicle',
      });
      M.Body.setMass(body, type.mass * 0.25); // Matter mass only; gameplay weight comes from def.mass
      M.Body.setInertia(body, body.inertia * 4);
      body.plugin = { type: typeKey, weight: type.weight };
      M.Composite.add(this.world, body);
      const v = {
        type: typeKey, def: type, tier: type.tier, body, crossed: false, dead: false,
        snapBase: this.snaps,
        stallMs: 0, assists: 0, lastAssist: -1e9, spin: 0, groundAngle: 0, grounded: false,
      };
      this.vehicles.push(v);
      if (this.hooks.onSpawn) this.hooks.onSpawn({ type: typeKey, x, y, weight: type.weight, tier: v.tier });
      return v;
    }

    updateVehicle(v, dt) {
      const b = v.body;
      const lv = this.level;
      const wheelR = Math.max(6, v.def.h * 0.30);
      v.spin += b.velocity.x / wheelR;

      v.grounded = false;
      let target = v.groundAngle;
      for (const pair of this.engine.pairs.list) {
        if (!pair.isActive) continue;
        let other = null;
        if (pair.bodyA === b) other = pair.bodyB;
        else if (pair.bodyB === b) other = pair.bodyA;
        if (!other) continue;
        if (other.label === 'road' || other.label === 'ramp') { target = other.angle; v.grounded = true; }
        else if (other.label === 'terrain') { target = 0; v.grounded = true; }
      }
      v.groundAngle = target;
      if (v.grounded && !v.dead) {
        let diff = target - b.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const av = b.angularVelocity * 0.70 + diff * 0.22;
        M.Body.setAngularVelocity(b, clamp(av, -0.25, 0.25));
      } else {
        M.Body.setAngularVelocity(b, b.angularVelocity * 0.985);
      }

      if (!v.crossed) {
        const dv = v.def.speed - b.velocity.x;
        const a = clamp(dv * 0.0065, -0.004, 0.016);
        M.Body.applyForce(b, b.position, { x: b.mass * a, y: 0 });
      }
      if (!v.crossed && b.position.x > lv.right.edge + 30) {
        v.crossed = true;
        if (this.hooks.onCross) this.hooks.onCross({ type: v.type, tier: v.tier });
      }
      if (!v.dead && (b.position.y > lv.world.waterY + 26 || b.position.x < -120 || b.position.y > lv.world.h + 240)) {
        v.dead = true;
        // If a beam broke while this vehicle was on the deck, the SNAP is the cause; the fall is
        // only the consequence. Do not overwrite the snap record.
        if (this.snaps > (v.snapBase || 0) && this.lastSnap) {
          this.lastFail = Object.assign({}, this.lastSnap, { reason: 'snap', sag: this.maxSag });
        } else {
          this.lastFail = { reason: 'fall', tier: v.tier, type: v.type, sag: this.maxSag, stress: this.lastMaxStress };
        }
        if (this.hooks.onFall) this.hooks.onFall({ type: v.type, tier: v.tier, x: b.position.x, y: b.position.y });
      }
      if (!v.dead && !v.crossed) {
        if (v.lastX === undefined) { v.lastX = b.position.x; v.noProgressMs = 0; }
        if (b.position.x - v.lastX > 8) { v.lastX = b.position.x; v.noProgressMs = 0; }
        else v.noProgressMs += dt;
        if (Math.abs(b.velocity.x) < 0.06) v.stallMs += dt; else v.stallMs = Math.max(0, v.stallMs - dt * 2);

        // v3: a deck joint lip can still stop a wheel. Give the vehicle a wheel-spin nudge up to
        // three times before calling it a stall, so a small step is not a failed run.
        if (v.grounded && v.stallMs > 520 && v.assists < 5 && this.time - v.lastAssist > 760) {
          v.assists += 1;
          v.lastAssist = this.time;
          M.Body.setVelocity(b, { x: Math.max(b.velocity.x, 1.2), y: Math.min(b.velocity.y, -0.5) });
          if (this.hooks.onNudge) this.hooks.onNudge({ type: v.type });
        }
        if (v.noProgressMs > 4400 || v.stallMs > 11000) {
          v.dead = true;
          v.stuck = true;
          this.lastFail = { reason: 'stall', tier: v.tier, type: v.type, sag: this.maxSag, stress: this.lastMaxStress };
          if (this.hooks.onStall) this.hooks.onStall({ type: v.type, tier: v.tier });
        }
      }
    }

    stabilizeBeams() {
      for (const bm of this.beams) {
        if (bm.broken) continue;
        const a = bm.a.body.position, b = bm.b.body.position;
        const lineAngle = Math.atan2(b.y - a.y, b.x - a.x);
        let diff = bm.body.angle - lineAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const av = bm.body.angularVelocity * 0.72 + diff * 0.18;
        M.Body.setAngularVelocity(bm.body, clamp(av, -0.26, 0.26));
      }
    }

    /* ---------- load model: real 2D frame analysis ---------- */

    gauss(K, f, n) {
      const a = K, b = Float64Array.from(f);
      for (let col = 0; col < n; col++) {
        let piv = col;
        let best = Math.abs(a[col * n + col]);
        for (let r = col + 1; r < n; r++) {
          const v = Math.abs(a[r * n + col]);
          if (v > best) { best = v; piv = r; }
        }
        if (best < 1e-12) continue;
        if (piv !== col) {
          for (let j = col; j < n; j++) { const t = a[col * n + j]; a[col * n + j] = a[piv * n + j]; a[piv * n + j] = t; }
          const t = b[col]; b[col] = b[piv]; b[piv] = t;
        }
        const d = a[col * n + col];
        for (let r = col + 1; r < n; r++) {
          const factor = a[r * n + col] / d;
          if (!factor) continue;
          a[r * n + col] = 0;
          for (let j = col + 1; j < n; j++) a[r * n + j] -= factor * a[col * n + j];
          b[r] -= factor * b[col];
        }
      }
      const x = new Float64Array(n);
      for (let r = n - 1; r >= 0; r--) {
        let sum = b[r];
        for (let j = r + 1; j < n; j++) sum -= a[r * n + j] * x[j];
        const d = a[r * n + r];
        x[r] = Math.abs(d) < 1e-12 ? 0 : sum / d;
      }
      return x;
    }

    // Assemble and solve K.u = f for the live graph. Fills bm.util (1.0 = at capacity), bm.axial and
    // bm.moment, and returns the worst utilisation plus the analytic deck drop.
    analyze() {
      this._analysisT = this.time;
      const beams = [];
      for (const bm of this.beams) if (!bm.broken) beams.push(bm);
      const used = new Set();
      for (const bm of beams) { used.add(bm.a); used.add(bm.b); }
      const nodes = [];
      for (const n of this.nodes) if (n.anchor || used.has(n)) nodes.push(n);
      const nd = nodes.length;
      if (!nd || !beams.length) { this._analysis = { max: 0, beam: null, sag: 0 }; return this._analysis; }
      const size = nd * 3;
      if (size > 360) return this._analysis || { max: 0, beam: null, sag: 0 };
      const idx = new Map();
      for (let i = 0; i < nd; i++) idx.set(nodes[i], i);
      const K = new Float64Array(size * size);
      const f = new Float64Array(size);
      const geo = [];

      for (const bm of beams) {
        const ia = idx.get(bm.a), ib = idx.get(bm.b);
        if (ia === undefined || ib === undefined) continue;
        const dx = bm.b.body.position.x - bm.a.body.position.x;
        const dy = bm.b.body.position.y - bm.a.body.position.y;
        const len = Math.max(8, Math.hypot(dx, dy));
        const c = dx / len, s = dy / len;
        const str = bm.matDef.strength;
        const ea = (str * E_A) / len;
        const ei = str * E_I;
        const t12 = (12 * ei) / (len * len * len);
        const t6 = (6 * ei) / (len * len);
        const t4 = (4 * ei) / len;
        const t2 = (2 * ei) / len;
        const kl = [
          [ea, 0, 0, -ea, 0, 0],
          [0, t12, t6, 0, -t12, t6],
          [0, t6, t4, 0, -t6, t2],
          [-ea, 0, 0, ea, 0, 0],
          [0, -t12, -t6, 0, t12, -t6],
          [0, t6, t2, 0, -t6, t4],
        ];
        const T = [
          [c, s, 0, 0, 0, 0],
          [-s, c, 0, 0, 0, 0],
          [0, 0, 1, 0, 0, 0],
          [0, 0, 0, c, s, 0],
          [0, 0, 0, -s, c, 0],
          [0, 0, 0, 0, 0, 1],
        ];
        const dofs = [ia * 3, ia * 3 + 1, ia * 3 + 2, ib * 3, ib * 3 + 1, ib * 3 + 2];
        // kg = T^T * kl * T, with T rows local and columns global.
        for (let p = 0; p < 6; p++) {
          for (let q = 0; q < 6; q++) {
            let sum = 0;
            for (let r = 0; r < 6; r++) {
              const trp = T[r][p];
              if (!trp) continue;
              for (let t = 0; t < 6; t++) {
                const krt = kl[r][t];
                if (!krt) continue;
                sum += trp * krt * T[t][q];
              }
            }
            K[dofs[p] * size + dofs[q]] += sum;
          }
        }
        geo.push({ bm, c, s, len, kl, dofs, str });
      }

      // Loads: each vehicle's weight is shared by the road joints under its footprint.
      for (const v of this.vehicles) {
        if (v.dead || v.crossed) continue;
        const vx = v.body.position.x, vy = v.body.position.y;
        const half = v.def.w / 2 + 10;
        const hits = [];
        let total = 0;
        for (const n of nodes) {
          if (!n.beams.some((b) => b.kind === 'road' && !b.broken)) continue;
          const ox = Math.abs(n.body.position.x - vx);
          const oy = Math.abs(n.body.position.y - vy);
          if (ox > half || oy > 64) continue;
          const w = 1 - ox / half;
          hits.push({ i: idx.get(n), w });
          total += w;
        }
        if (!total) continue;
        const W = v.def.mass * this.massScale;
        for (const h of hits) f[h.i * 3 + 1] += W * (h.w / total);
      }

      // Banks and piers are fixed: all three DOF.
      for (const n of nodes) {
        if (!n.anchor) continue;
        const base = idx.get(n) * 3;
        for (let d = 0; d < 3; d++) {
          const gi = base + d;
          for (let j = 0; j < size; j++) { K[gi * size + j] = 0; K[j * size + gi] = 0; }
          K[gi * size + gi] = 1;
          f[gi] = 0;
        }
      }
      let maxDiag = 1;
      for (let i = 0; i < size; i++) maxDiag = Math.max(maxDiag, Math.abs(K[i * size + i]));
      const eps = maxDiag * 1e-7;
      for (let i = 0; i < size; i++) K[i * size + i] += eps;

      const u = this.gauss(K, f, size);

      let max = 0, worst = null, sag = 0;
      for (const g of geo) {
        const ug = [u[g.dofs[0]], u[g.dofs[1]], u[g.dofs[2]], u[g.dofs[3]], u[g.dofs[4]], u[g.dofs[5]]];
        const c = g.c, s = g.s;
        const ul = [
          c * ug[0] + s * ug[1],
          -s * ug[0] + c * ug[1],
          ug[2],
          c * ug[3] + s * ug[4],
          -s * ug[3] + c * ug[4],
          ug[5],
        ];
        const fl = [0, 0, 0, 0, 0, 0];
        for (let p = 0; p < 6; p++) {
          let sum = 0;
          for (let q = 0; q < 6; q++) sum += g.kl[p][q] * ul[q];
          fl[p] = sum;
        }
        const N = fl[3];
        const M = Math.max(Math.abs(fl[2]), Math.abs(fl[5]));
        const capAx = (g.str * N_CAP) / (1 + BUCKLE * Math.pow(g.len / 160, 2));
        const cap = N < 0 ? capAx : g.str * N_CAP;
        const util = Math.abs(N) / Math.max(1, cap) + M / (g.str * M_CAP);
        g.bm.util = util;
        g.bm.axial = N;
        g.bm.moment = M;
        if (util > max) { max = util; worst = g.bm; }
        if (g.bm.kind === 'road') {
          sag = Math.max(sag, u[g.dofs[1]], u[g.dofs[4]]);
        }
      }
      this._analysis = { max, beam: worst, sag: Math.max(0, sag) };
      return this._analysis;
    }

    // The deck itself gave way: the analytic drop is past what any road beam can bend through.
    deckCollapse(drop) {
      const road = this.beams.filter((b) => b.kind === 'road' && !b.broken);
      if (!road.length) return;
      const worst = road.slice().sort((a, b) => (b.util || 0) - (a.util || 0))[0];
      this.breakBeam(worst, 1.6);
      this.lastFail = {
        reason: 'drop', tier: this.run ? this.run.tier : -1,
        type: this.run ? LADDER[Math.max(0, this.run.tier)] : null,
        sag: Math.round(drop), stress: this.lastMaxStress,
      };
    }

    updateStress() {
      if (this._analysisT === undefined || this._stressDirty || this.time - this._analysisT >= ANALYZE_MS) {
        this._stressDirty = false;
        this.analyze();
      }
      const an = this._analysis || { max: 0, sag: 0 };
      let max = 0, maxBeam = null;
      for (const bm of this.beams) {
        const raw = bm.broken ? 0 : (bm.util || 0);
        bm.raw = raw;
        bm.stress += (raw - bm.stress) * 0.35;
        if (raw > max) { max = raw; maxBeam = bm; }
        if (raw > 1) {
          bm.over += 1;
          if (bm.over > 2 || raw > 1.5) this.breakBeam(bm, raw);
        } else {
          bm.over = Math.max(0, bm.over - 1);
        }
        // A member past half its capacity goes soft in the Matter world, so the deck visibly droops
        // before it snaps instead of holding a perfect line at 99 % load.
        if (!bm.broken) {
          const base = bm.kind === 'road' ? Math.max(0.94, Math.min(0.998, bm.matDef.stiffness)) : 0.99;
          const over = clamp((bm.stress - 0.5) / 0.5, 0, 1);
          const target = base * (1 - 0.3 * over);
          const next = bm.c1.stiffness + (target - bm.c1.stiffness) * 0.2;
          bm.c1.stiffness = next;
          bm.c2.stiffness = next;
        }
      }
      this.lastMaxStress = an.max;
      this.maxStressBeam = an.beam || maxBeam;
      // Analytic collapse: the joints moved further than the deck can bend.
      if (this.run && this.snaps === 0 && an.sag > DEFL_MAX) this.deckCollapse(an.sag);
      // Measured sag: how far an interior road joint has fallen from its rest position.
      let sag = 0;
      for (const n of this.nodes) {
        if (n.anchor) continue;
        if (!n.beams.some((b) => b.kind === 'road' && !b.broken)) continue;
        sag = Math.max(sag, n.body.position.y - n.y0);
      }
      if (this.run && this.snaps === 0) this.maxSag = Math.max(this.maxSag, sag);
    }

    breakBeam(bm, raw) {
      if (bm.broken) return;
      bm.broken = true;
      this.snaps += 1;
      M.Composite.remove(this.world, bm.c1);
      M.Composite.remove(this.world, bm.c2);
      bm.body.collisionFilter.mask = CAT.terrain;
      bm.body.label = 'debris';
      bm.a.beams = bm.a.beams.filter((x) => x !== bm);
      bm.b.beams = bm.b.beams.filter((x) => x !== bm);
      this.debris.push(bm);
      this._reach = null;
      this._stressDirty = true;
      const snapRec = {
        reason: 'snap', tier: this.run ? this.run.tier : -1,
        type: this.run ? LADDER[Math.max(0, this.run.tier)] : null,
        mat: bm.mat, kind: bm.kind, load: Math.round((raw || bm.raw || 1) * 100), sag: this.maxSag,
      };
      this.lastSnap = snapRec;
      if (this.run && !this.run.done) this.lastFail = snapRec;
      if (this.hooks.onSnap) this.hooks.onSnap({ x: bm.body.position.x, y: bm.body.position.y, mat: bm.mat, kind: bm.kind, angle: bm.body.angle, len: bm.len });
    }

    step(dtMs) {
      this.acc += dtMs;
      let guard = 0;
      while (this.acc >= STEP && guard < 10) {
        this.acc -= STEP;
        guard += 1;
        this.time += STEP;
        if (this.run) {
          this.run.t += STEP;
          const r = this.run;
          if (!r.done && !r.active && r.tier < LADDER.length - 1 && r.t >= r.nextAt) {
            r.tier += 1;
            r.active = this.spawnVehicle(LADDER[r.tier]);
          }
          for (const v of this.vehicles) this.updateVehicle(v, STEP);
        }
        M.Engine.update(this.engine, STEP);
        this.stabilizeBeams();
        this.updateStress();
      }
      if (!this.run) return null;
      const r = this.run;

      if (r.active && (r.active.crossed || r.active.dead)) {
        const v = r.active;
        if (v.crossed) {
          r.heaviest = Math.max(r.heaviest, v.tier);
          r.crossed += 1;
          r.active = null;
          r.nextAt = r.t + 520;
          if (v.tier >= LADDER.length - 1) {
            r.done = true;
            if (this.hooks.onDone) this.hooks.onDone();
          }
        } else {
          r.dead += 1;
          r.failed = true;
          r.reason = this.lastFail ? this.lastFail.reason : 'fell';
          r.done = true;
          r.active = null;
          if (this.hooks.onFail) this.hooks.onFail({ reason: r.reason, tier: v.tier, type: v.type });
        }
      }
      if (!r.done && r.tier >= LADDER.length - 1 && !r.active && r.heaviest >= LADDER.length - 1) {
        r.done = true;
        if (this.hooks.onDone) this.hooks.onDone();
      }
      if (!r.done && r.t > 90000) {
        r.done = true;
        r.reason = 'timeout';
        if (this.hooks.onDone) this.hooks.onDone();
      }

      const lv = this.level;
      for (const v of this.vehicles) {
        if (v.body.position.y > lv.world.waterY + 120) M.Composite.remove(this.world, v.body);
      }
      for (const bm of this.debris) {
        if (bm.body.position.y > lv.world.waterY + 120) M.Composite.remove(this.world, bm.body);
      }
      return r;
    }

    spent() { return 0; }

    snapshot() { return this.segments.map((s) => ({ ...s })); }
  }

  const api = { BridgeWorld, CAT, MAX_BEAM, MIN_BEAM, GRID, STEP, LADDER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BW_PHYSICS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
