/* Orbit Putt — physics. One ball, planets with a capped inverse-square pull inside their ring,
 * solid bodies, a wormhole cup that only holds below capture speed, a black hole, a comet.
 *
 * Deterministic: fixed 1/120 s substeps, no randomness. The game and the node solver run this
 * exact file, so a par shot proved in node is the same shot the player can play.
 * A golf ball is a point mass — the "solver" rule is about rigid bodies (stacks, bridges,
 * ragdolls); here collision response is a circle reflection, 12 lines, and owning it buys
 * determinism and a headless par proof.
 */
(function (root, factory) {
  var C = (typeof module === "object" && module.exports) ? require("./constants.js") : root.OP_C;
  var api = factory(C);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OP_P = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";
  var P = C.PHYS, H = C.HOLES;

  function planetPos(p, t) {
    if (!p.orbit) return { x: p.x, y: p.y };
    var a = p.orbit.phase + p.orbit.omega * t;
    return { x: p.orbit.cx + Math.cos(a) * p.orbit.rad, y: p.orbit.cy + Math.sin(a) * p.orbit.rad };
  }

  function cometPos(c, t) {
    var u = ((t / c.period) % 1 + 1) % 1;
    var k = u < 0.5 ? u * 2 : 2 - u * 2;
    return { x: c.a[0] + (c.b[0] - c.a[0]) * k, y: c.a[1] + (c.b[1] - c.a[1]) * k };
  }

  function createWorld(idx) {
    var h = H[idx];
    return {
      idx: idx,
      hole: h,
      t: 0,
      ball: { x: h.ball[0], y: h.ball[1], vx: 0, vy: 0 },
      lastRest: { x: h.ball[0], y: h.ball[1] },
      start: { x: h.ball[0], y: h.ball[1] },
      resting: true,
      restT: 0,
      strokes: 0,
      phase: "aim",          // aim | moving | sunk
      cupCd: 0,
      events: [],
      near: {},              // planet index -> proximity for the wobble
      trail: [],
      tSink: 0
    };
  }

  function ballSpeed(b) { return Math.sqrt(b.vx * b.vx + b.vy * b.vy); }

  function putt(w, dirX, dirY, power) {
    if (w.phase !== "aim" || !w.resting) return false;
    var m = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    power = Math.max(0.02, Math.min(1, power));
    var sp = P.MIN_SPEED + (P.MAX_SPEED - P.MIN_SPEED) * power * power;
    w.ball.vx = (dirX / m) * sp;
    w.ball.vy = (dirY / m) * sp;
    w.ball.x = w.lastRest.x; w.ball.y = w.lastRest.y;
    w.resting = false; w.restT = 0; w.phase = "moving";
    w.strokes++;
    w.trail.length = 0;
    w.events.push({ type: "putt", power: power, speed: sp });
    return true;
  }

  // Slingshot: the pull vector (ball rest -> finger) is inverted into a launch.
  function pullToShot(px, py) {
    var m = Math.sqrt(px * px + py * py);
    var power = Math.min(1, m / P.MAX_PULL);
    return { dx: -px, dy: -py, power: power, mag: m };
  }

  function reflect(b, nx, ny, rest, push) {
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + rest) * vn * nx;
      b.vy -= (1 + rest) * vn * ny;
    }
    if (push) { b.x += nx * push; b.y += ny * push; }
  }

  function stepOnce(w, dt) {
    var b = w.ball, h = w.hole, i;
    w.t += dt;
    if (w.cupCd > 0) w.cupCd -= dt;

    // ---- gravity fields (only inside the influence ring, capped)
    var ax = 0, ay = 0;
    for (i = 0; i < h.planets.length; i++) {
      var p = h.planets[i], pp = planetPos(p, w.t);
      var dx = b.x - pp.x, dy = b.y - pp.y, d2 = dx * dx + dy * dy;
      var ring = p.ring;
      if (d2 < ring * ring) {
        var d = Math.sqrt(d2) || 1;
        var soft = Math.max(d2, (p.r * 0.55) * (p.r * 0.55));
        var a = Math.min(p.mu / soft, P.GRAV_CAP);
        ax -= (dx / d) * a; ay -= (dy / d) * a;
        if (d < p.r * 2.2) w.near[i] = 1;
      }
    }
    for (i = 0; i < h.blackholes.length; i++) {
      var bh = h.blackholes[i];
      var bx = b.x - bh.x, by = b.y - bh.y, bd = Math.sqrt(bx * bx + by * by) || 1;
      if (bd < bh.ring) {
        var ba = P.BH_PULL * (1 - bd / bh.ring);
        ax -= (bx / bd) * ba; ay -= (by / bd) * ba;
      }
    }

    b.vx += ax * dt; b.vy += ay * dt;
    var damp = Math.exp(-P.DRAG * dt);
    b.vx *= damp; b.vy *= damp;
    b.x += b.vx * dt; b.y += b.vy * dt;

    // ---- solid bodies: planets, asteroids, the comet
    for (i = 0; i < h.planets.length; i++) {
      var pl = h.planets[i], q = planetPos(pl, w.t);
      var ddx = b.x - q.x, ddy = b.y - q.y, dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      if (dd < pl.r + P.BALL_R) {
        var nx = ddx / dd, ny = ddy / dd;
        reflect(b, nx, ny, P.PLANET_REST, pl.r + P.BALL_R - dd + 0.5);
        w.events.push({ type: "bounce", body: "planet", x: q.x + nx * pl.r, y: q.y + ny * pl.r, power: ballSpeed(b) });
      }
    }
    for (i = 0; i < h.asteroids.length; i++) {
      var as = h.asteroids[i];
      var adx = b.x - as.x, ady = b.y - as.y, ad = Math.sqrt(adx * adx + ady * ady) || 1;
      if (ad < as.r + P.BALL_R) {
        var anx = adx / ad, any = ady / ad;
        reflect(b, anx, any, P.ASTEROID_REST, as.r + P.BALL_R - ad + 0.5);
        w.events.push({ type: "bounce", body: "asteroid", x: as.x + anx * as.r, y: as.y + any * as.r, power: ballSpeed(b) });
      }
    }
    for (i = 0; i < h.comets.length; i++) {
      var cm = h.comets[i], cp = cometPos(cm, w.t);
      var cdx = b.x - cp.x, cdy = b.y - cp.y, cd = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
      if (cd < cm.r + P.BALL_R) {
        var cnx = cdx / cd, cny = cdy / cd;
        reflect(b, cnx, cny, P.COMET_REST, cm.r + P.BALL_R - cd + 0.5);
        w.events.push({ type: "bounce", body: "comet", x: cp.x, y: cp.y, power: ballSpeed(b) });
      }
    }

    // ---- black hole core: the ball is lost
    for (i = 0; i < h.blackholes.length; i++) {
      var hole = h.blackholes[i];
      var hx = b.x - hole.x, hy = b.y - hole.y;
      if (Math.sqrt(hx * hx + hy * hy) < hole.core) {
        w.events.push({ type: "lost", x: hole.x, y: hole.y });
        w.phase = "lost";
        w.resting = true; b.vx = b.vy = 0;
        return;
      }
    }

    // ---- the wormhole cup: holds below capture speed, lips out above it
    var cx = b.x - h.cup[0], cy = b.y - h.cup[1], cdist = Math.sqrt(cx * cx + cy * cy);
    var sp = ballSpeed(b);
    if (cdist < P.CUP_R) {
      if (sp < P.CAPTURE_SPEED) {
        w.events.push({ type: "sink", x: h.cup[0], y: h.cup[1], speed: sp });
        w.phase = "sunk";
        w.tSink = w.t;
        w.resting = true; b.vx = b.vy = 0;
        b.x = h.cup[0]; b.y = h.cup[1];
        return;
      }
      if (w.cupCd <= 0) {
        var ln = cdist || 1;
        reflect(b, cx / ln, cy / ln, 0.35, P.CUP_R - cdist + 2);
        b.vx *= P.LIP_BOOST; b.vy *= P.LIP_BOOST;
        w.cupCd = 0.6;
        w.events.push({ type: "lip", x: h.cup[0], y: h.cup[1], speed: sp });
      }
    }

    // ---- out of the field
    if (b.x < -70 || b.x > C.FIELD.w + 70 || b.y < -70 || b.y > C.FIELD.h + 70) {
      w.events.push({ type: "out", x: b.x, y: b.y });
      w.phase = "out";
      w.resting = true; b.vx = b.vy = 0;
      return;
    }

    // ---- rest
    sp = ballSpeed(b);
    if (sp < P.STOP_SPEED) {
      w.restT += dt;
      if (w.restT >= P.STOP_TIME) {
        b.vx = b.vy = 0;
        w.resting = true;
        w.lastRest.x = b.x; w.lastRest.y = b.y;
        w.phase = "aim";
        w.events.push({ type: "rest", x: b.x, y: b.y });
      }
    } else {
      w.restT = 0;
      if (w.trail.length === 0 || Math.abs(w.trail[w.trail.length - 1].x - b.x) + Math.abs(w.trail[w.trail.length - 1].y - b.y) > 7) {
        w.trail.push({ x: b.x, y: b.y, s: sp });
        if (w.trail.length > 90) w.trail.shift();
      }
    }
  }

  // Advance by a real frame. Fixed substeps keep it deterministic at any frame rate.
  function step(w, dt) {
    if (w.phase === "sunk" || w.phase === "lost" || w.phase === "out") return;
    if (w.resting && w.phase !== "moving") return;
    var n = Math.max(1, Math.min(24, Math.round(dt / P.SUB)));
    for (var i = 0; i < n; i++) {
      stepOnce(w, P.SUB);
      if (w.phase !== "moving") break;
    }
  }

  function respawn(w) {
    w.ball.x = w.lastRest.x; w.ball.y = w.lastRest.y;
    w.ball.vx = w.ball.vy = 0;
    w.resting = true; w.restT = 0; w.phase = "aim";
    w.trail.length = 0;
  }

  /* Predict the first `sec` seconds of a shot from the current rest spot.
   * Returns dots; the game draws them. Never mutates the real world. */
  function previewPath(w, dirX, dirY, power, sec) {
    var b = w.ball;
    var m = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    power = Math.max(0.02, Math.min(1, power));
    var sp = P.MIN_SPEED + (P.MAX_SPEED - P.MIN_SPEED) * power * power;
    var ghost = {
      hole: w.hole, t: w.t, phase: "moving", cupCd: 0, events: [],
      ball: { x: w.lastRest.x, y: w.lastRest.y, vx: (dirX / m) * sp, vy: (dirY / m) * sp },
      lastRest: w.lastRest, resting: false, restT: 0, trail: [], near: {}
    };
    var dots = [], stepN = Math.round((sec || 0.6) / P.SUB);
    for (var i = 0; i < stepN; i++) {
      stepOnce(ghost, P.SUB);
      if (i % 6 === 0) dots.push({ x: ghost.ball.x, y: ghost.ball.y, i: i / stepN });
      if (ghost.phase !== "moving") break;
    }
    return dots;
  }

  /* One full shot, headless — the solver and the acceptance test use this. */
  function simulate(idx, state, dirX, dirY, power, maxT) {
    var w = {
      hole: H[idx], t: state.t || 0, phase: "aim", cupCd: 0, events: [], near: {},
      ball: { x: state.x, y: state.y, vx: 0, vy: 0 },
      lastRest: { x: state.x, y: state.y }, resting: true, restT: 0, trail: []
    };
    putt(w, dirX, dirY, power);
    var t = 0, limit = maxT || P.FLIGHT_MAX;
    var ev = [];
    while (t < limit) {
      stepOnce(w, P.SUB);
      t += P.SUB;
      for (var i = 0; i < w.events.length; i++) ev.push(w.events[i]);
      w.events.length = 0;
      if (w.phase !== "moving") break;
    }
    var out = { result: w.phase === "sunk" ? "sunk" : w.phase === "lost" ? "lost" : w.phase === "out" ? "out" : "rest",
      x: w.ball.x, y: w.ball.y, t: w.t, time: t, events: ev };
    if (out.result === "rest") { out.restX = w.ball.x; out.restY = w.ball.y; }
    return out;
  }

  return {
    createWorld: createWorld, putt: putt, step: step, stepOnce: stepOnce, respawn: respawn,
    pullToShot: pullToShot, previewPath: previewPath, simulate: simulate,
    planetPos: planetPos, cometPos: cometPos, ballSpeed: ballSpeed
  };
});
