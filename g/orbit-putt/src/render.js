/* Orbit Putt — renderer. Canvas 2D, one palette, additive glow, parallax starfield. */
(function (root) {
  "use strict";
  var C = root.OP_C, P = root.OP_P, PAL = C.PAL, KINDS = C.KINDS, FIELD = C.FIELD;

  var R = {};
  R.view = { s: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1, landscape: false };

  function fit(canvas) {
    var w = canvas.clientWidth || root.innerWidth, h = canvas.clientHeight || root.innerHeight;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var landscape = w > h;
    var padT = landscape ? 8 : 62, padB = landscape ? 8 : 76;
    var availW = w - 16, availH = h - padT - padB;
    var s = Math.min(availW / FIELD.w, availH / FIELD.h);
    var ox = (w - FIELD.w * s) / 2;
    var oy = padT + (availH - FIELD.h * s) / 2;
    R.view = { s: s, ox: ox, oy: oy, w: w, h: h, dpr: dpr, landscape: landscape };
    return R.view;
  }
  R.fit = fit;

  function toWorld(px, py) {
    var v = R.view;
    return { x: (px - v.ox) / v.s, y: (py - v.oy) / v.s };
  }
  R.toWorld = toWorld;
  function toScreen(x, y) {
    var v = R.view;
    return { x: x * v.s + v.ox, y: y * v.s + v.oy };
  }
  R.toScreen = toScreen;

  // ---------------------------------------------------------------- stars
  var stars = null;
  function mulberry(a) {
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function buildStars() {
    var rnd = mulberry(20261119), out = [];
    for (var i = 0; i < 220; i++) {
      out.push({ x: rnd(), y: rnd(), r: 0.5 + rnd() * 1.7, a: 0.25 + rnd() * 0.75,
        layer: (i % 3), tw: rnd() * 6.28 });
    }
    stars = out;
  }

  function drawSky(ctx, g) {
    var v = R.view, w = v.w, h = v.h;
    if (!stars) buildStars();
    var sky = ctx.createLinearGradient(0, 0, w * 0.4, h);
    sky.addColorStop(0, "#050a18");
    sky.addColorStop(0.55, PAL.ink);
    sky.addColorStop(1, "#070312");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    // two soft nebulae, drifting very slowly
    var t = g.time;
    neb(ctx, w * (0.18 + 0.03 * Math.sin(t * 0.05)), h * 0.28, Math.max(w, h) * 0.55, "rgba(155,107,255,0.13)");
    neb(ctx, w * (0.86 + 0.03 * Math.cos(t * 0.043)), h * 0.72, Math.max(w, h) * 0.5, "rgba(95,227,208,0.09)");

    var b = g.world ? g.world.ball : { x: 500, y: 700 };
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i], d = 0.004 + s.layer * 0.006;
      var x = ((s.x * w + (b.x - 500) * d * 60 + t * (2 + s.layer * 3)) % (w + 8)) - 4;
      var y = ((s.y * h + (b.y - 700) * d * 60) % (h + 8)) - 4;
      var tw = 0.65 + 0.35 * Math.sin(t * 1.7 + s.tw);
      ctx.globalAlpha = s.a * tw * (0.55 + s.layer * 0.2);
      ctx.fillStyle = s.layer === 2 ? "#ffffff" : (s.layer === 1 ? PAL.ice : "#cfd8ff");
      ctx.fillRect(x, y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  function neb(ctx, x, y, r, col) {
    var gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // ---------------------------------------------------------------- world pieces
  function glowCircle(ctx, x, y, r, col, alpha) {
    var gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawFieldEdge(ctx) {
    ctx.save();
    ctx.strokeStyle = "rgba(234,242,255,0.10)";
    ctx.lineWidth = 2; ctx.setLineDash([2, 14]);
    ctx.strokeRect(0, 0, FIELD.w, FIELD.h);
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(155,107,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-3, -3, FIELD.w + 6, FIELD.h + 6);
    ctx.restore();
  }

  function drawPlanet(ctx, p, pos, t, near) {
    var k = KINDS[p.kind] || KINDS.ice;
    var wob = near ? Math.sin(t * 22) * 1.8 : 0;
    var r = p.r + wob;

    // influence ring
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = k.b; ctx.lineWidth = 2; ctx.setLineDash([6, 12]);
    ctx.lineDashOffset = -t * 12;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, p.ring, 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = k.b;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, p.ring, 0, 6.2832); ctx.fill();
    ctx.restore();

    // atmosphere
    glowCircle(ctx, pos.x, pos.y, r * 1.5, k.b, 0.20);

    // body
    var g = ctx.createRadialGradient(pos.x - r * 0.38, pos.y - r * 0.42, r * 0.06, pos.x, pos.y, r);
    g.addColorStop(0, k.a); g.addColorStop(0.45, k.b); g.addColorStop(1, k.c);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, r, 0, 6.2832); ctx.fill();

    // surface detail, clipped
    ctx.save();
    ctx.beginPath(); ctx.arc(pos.x, pos.y, r - 1, 0, 6.2832); ctx.clip();
    if (p.kind === "gas") {
      for (var i = -2; i <= 2; i++) {
        ctx.globalAlpha = 0.10 + (i % 2 ? 0.05 : 0);
        ctx.fillStyle = i % 2 ? k.a : k.c;
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y + i * r * 0.3, r * 1.1, r * (0.10 + 0.02 * (i & 1)), 0, 0, 6.2832);
        ctx.fill();
      }
    } else if (p.kind === "rock") {
      ctx.globalAlpha = 0.20; ctx.fillStyle = k.c;
      var cr = [[-0.3, -0.2, 0.22], [0.35, 0.15, 0.16], [0.05, 0.5, 0.13], [-0.45, 0.42, 0.1]];
      for (var c = 0; c < cr.length; c++) {
        ctx.beginPath(); ctx.arc(pos.x + cr[c][0] * r, pos.y + cr[c][1] * r, cr[c][2] * r, 0, 6.2832); ctx.fill();
      }
    } else {
      ctx.globalAlpha = 0.22; ctx.strokeStyle = k.a; ctx.lineWidth = 2;
      for (var j = 0; j < 5; j++) {
        ctx.beginPath();
        ctx.moveTo(pos.x + (j - 2) * r * 0.36, pos.y - r);
        ctx.quadraticCurveTo(pos.x + (j - 2) * r * 0.5 + 8, pos.y, pos.x + (j - 1.6) * r * 0.3, pos.y + r);
        ctx.stroke();
      }
    }
    // terminator
    var sh = ctx.createLinearGradient(pos.x - r, pos.y - r, pos.x + r, pos.y + r);
    sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(0.62, "rgba(0,0,0,0.10)"); sh.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.globalAlpha = 1; ctx.fillStyle = sh; ctx.fillRect(pos.x - r, pos.y - r, r * 2, r * 2);
    ctx.restore();

    // rim light
    ctx.save();
    ctx.beginPath(); ctx.arc(pos.x, pos.y, r - 1.2, Math.PI * 0.85, Math.PI * 1.85);
    ctx.strokeStyle = k.rim; ctx.globalAlpha = 0.55; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
  }

  function drawAsteroid(ctx, a, t) {
    var n = 9, r = a.r;
    ctx.save();
    ctx.translate(a.x, a.y); ctx.rotate((a.spin || 0) * t);
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, "#c9d2e6"); g.addColorStop(0.6, "#6b7794"); g.addColorStop(1, "#2a3048");
    ctx.fillStyle = g;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var ang = (i / n) * 6.2832, rr = r * (0.82 + 0.18 * Math.sin(i * 2.7 + 1));
      var x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(234,242,255,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.globalAlpha = 0.35; ctx.fillStyle = "#1b2136";
    ctx.beginPath(); ctx.arc(-r * 0.2, r * 0.15, r * 0.22, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.32, -r * 0.28, r * 0.13, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function drawBlackHole(ctx, bh, t) {
    var x = bh.x, y = bh.y;
    ctx.save();
    // pull ring
    ctx.globalAlpha = 0.16; ctx.strokeStyle = PAL.violet; ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 10]); ctx.lineDashOffset = t * 20;
    ctx.beginPath(); ctx.arc(x, y, bh.ring, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
    // accretion
    for (var i = 0; i < 3; i++) {
      var rr = bh.core * (1.25 + i * 0.28);
      ctx.globalAlpha = 0.55 - i * 0.13;
      ctx.strokeStyle = i === 0 ? "#e9d4ff" : PAL.violet;
      ctx.lineWidth = 3 - i * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, rr, t * (2.4 - i * 0.5), t * (2.4 - i * 0.5) + 4.4);
      ctx.stroke();
    }
    // event horizon
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000000";
    ctx.beginPath(); ctx.arc(x, y, bh.core, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = "rgba(155,107,255,0.85)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, bh.core, 0, 6.2832); ctx.stroke();
    glowCircle(ctx, x, y, bh.core * 3.2, "rgba(155,107,255,0.55)", 0.5);
    ctx.restore();
  }

  function drawComet(ctx, cm, pos, t) {
    var back = cm.a[0] < cm.b[0] ? 1 : -1;
    var dir = Math.sin((t / cm.period) * 6.2832) > 0 ? 1 : -1;
    ctx.save();
    var tx = pos.x - dir * 92 * back, ty = pos.y + 4;
    var g = ctx.createLinearGradient(pos.x, pos.y, tx, ty);
    g.addColorStop(0, "rgba(255,198,92,0.85)"); g.addColorStop(0.4, "rgba(255,107,107,0.35)"); g.addColorStop(1, "rgba(255,107,107,0)");
    ctx.strokeStyle = g; ctx.lineWidth = cm.r * 1.1; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(tx, ty); ctx.stroke();
    glowCircle(ctx, pos.x, pos.y, cm.r * 2.6, "rgba(255,198,92,0.55)", 0.9);
    ctx.fillStyle = "#fff6df";
    ctx.beginPath(); ctx.arc(pos.x, pos.y, cm.r * 0.72, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function drawCup(ctx, cup, t, pulse) {
    var x = cup[0], y = cup[1];
    ctx.save();
    glowCircle(ctx, x, y, 74 + pulse * 16, "rgba(155,107,255,0.55)", 0.55);
    // swirl rings
    for (var i = 0; i < 4; i++) {
      var rr = 10 + i * 6.4;
      ctx.globalAlpha = 0.75 - i * 0.14;
      ctx.strokeStyle = i % 2 ? PAL.ice : PAL.violet;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(x, y, rr, t * (1.4 + i * 0.4), t * (1.4 + i * 0.4) + 4.9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    var g = ctx.createRadialGradient(x, y, 1, x, y, 12);
    g.addColorStop(0, "#000000"); g.addColorStop(0.6, "#12062a"); g.addColorStop(1, "rgba(155,107,255,0.55)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function drawTrail(ctx, trail) {
    if (!trail || trail.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (var i = 1; i < trail.length; i++) {
      var a = trail[i - 1], b = trail[i];
      var k = i / trail.length;
      var sp = Math.min(1, (b.s || 0) / 1100);
      ctx.globalAlpha = 0.06 + k * 0.30;
      ctx.strokeStyle = sp > 0.55 ? PAL.gold : PAL.ice;
      ctx.lineWidth = 1.5 + k * 5.5 * (0.4 + sp);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBall(ctx, x, y, t, hot, r, squash, ang) {
    r = r || 10;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glowCircle(ctx, x, y, r * (3.2 + hot * 1.6), hot > 0.5 ? "rgba(255,198,92,0.75)" : "rgba(95,227,208,0.7)", 0.85);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    if (squash) { ctx.rotate(ang || 0); ctx.scale(1 + squash * 0.55, 1 - squash * 0.45); ctx.rotate(-(ang || 0)); }
    var g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.55, "#e9fffb"); g.addColorStop(1, hot > 0.5 ? "#ffc65c" : "#5fe3d0");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.34, r * 0.3, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function drawAim(ctx, g) {
    var a = g.aim;
    if (!a || !a.active) return;
    var w = g.world, b = w.ball, ox = w.lastRest.x, oy = w.lastRest.y;
    var vx = a.dx, vy = a.dy, m = Math.hypot(vx, vy) || 1;
    vx /= m; vy /= m;
    var pw = a.power;

    // pull band (where the finger dragged the ball)
    if (a.mode === "pull" && a.mag > 2) {
      ctx.save();
      ctx.strokeStyle = "rgba(234,242,255,0.35)";
      ctx.lineWidth = 2; ctx.setLineDash([5, 7]);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(234,242,255,0.55)";
      ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    // launch arrow
    var len = 46 + pw * 66;
    ctx.save();
    ctx.strokeStyle = pw > 0.85 ? PAL.coral : pw > 0.5 ? PAL.gold : PAL.ice;
    ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox + vx * 16, oy + vy * 16); ctx.lineTo(ox + vx * len, oy + vy * len); ctx.stroke();
    var ang = Math.atan2(vy, vx);
    ctx.beginPath();
    ctx.moveTo(ox + vx * len, oy + vy * len);
    ctx.lineTo(ox + Math.cos(ang - 0.42) * (len - 13), oy + Math.sin(ang - 0.42) * (len - 13));
    ctx.moveTo(ox + vx * len, oy + vy * len);
    ctx.lineTo(ox + Math.cos(ang + 0.42) * (len - 13), oy + Math.sin(ang + 0.42) * (len - 13));
    ctx.stroke();
    ctx.restore();

    // power arc around the ball
    ctx.save();
    ctx.strokeStyle = "rgba(234,242,255,0.16)"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(ox, oy, 26, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = pw > 0.85 ? PAL.coral : pw > 0.5 ? PAL.gold : PAL.ice;
    ctx.beginPath(); ctx.arc(ox, oy, 26, -1.5708, -1.5708 + 6.2832 * pw); ctx.stroke();
    ctx.restore();

    // preview dots: the first 0.6 s only
    if (a.dots) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (var i = 0; i < a.dots.length; i++) {
        var d = a.dots[i];
        ctx.globalAlpha = 0.75 * (1 - d.i * 0.85);
        ctx.fillStyle = PAL.bone;
        ctx.beginPath(); ctx.arc(d.x, d.y, 2.6 - d.i * 1.4, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawParticles(ctx, list) {
    if (!list || !list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < list.length; i++) {
      var p = list[i], k = p.life / p.max;
      ctx.globalAlpha = Math.max(0, k) * (p.a == null ? 1 : p.a);
      ctx.fillStyle = p.col;
      if (p.kind === "spark") {
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size * (0.4 + k), p.size * (0.4 + k));
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.35 + k * 0.9), 0, 6.2832); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- one frame
  R.draw = function (ctx, g) {
    var v = R.view;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    drawSky(ctx, g);

    var sh = g.shake || 0;
    var sx = sh ? (Math.random() - 0.5) * sh * 2 : 0;
    var sy = sh ? (Math.random() - 0.5) * sh * 2 : 0;

    ctx.save();
    ctx.setTransform(v.dpr * v.s, 0, 0, v.dpr * v.s, (v.ox + sx) * v.dpr, (v.oy + sy) * v.dpr);

    var w = g.world;
    if (!w) { ctx.restore(); return; }
    var t = g.time;
    drawFieldEdge(ctx);

    // black holes behind
    for (var i = 0; i < w.hole.blackholes.length; i++) drawBlackHole(ctx, w.hole.blackholes[i], t);

    // planets
    for (var j = 0; j < w.hole.planets.length; j++) {
      var p = w.hole.planets[j];
      drawPlanet(ctx, p, P.planetPos(p, w.t), t, w.near[j] && w.ball && Math.hypot(w.ball.x - P.planetPos(p, w.t).x, w.ball.y - P.planetPos(p, w.t).y) < p.r * 2.2);
    }
    for (var a = 0; a < w.hole.asteroids.length; a++) drawAsteroid(ctx, w.hole.asteroids[a], t);
    for (var c = 0; c < w.hole.comets.length; c++) drawComet(ctx, w.hole.comets[c], P.cometPos(w.hole.comets[c], w.t), w.t);

    drawCup(ctx, w.hole.cup, t, g.cupPulse || 0);

    // ball trail + ball (the dragged ball sits at its pull position)
    var bx = w.ball.x, by = w.ball.y;
    if (g.aim && g.aim.active && g.aim.mode === "pull") { bx = w.lastRest.x + g.aim.pull.x; by = w.lastRest.y + g.aim.pull.y; }
    var sp = Math.hypot(w.ball.vx, w.ball.vy);
    if (w.phase === "moving") drawTrail(ctx, w.trail);
    drawBall(ctx, bx, by, t, Math.min(1, sp / 900), 10, g.squash || 0, g.squashAng || 0);
    if (g.aim && g.aim.active) drawAim(ctx, g);

    drawParticles(ctx, g.particles);
    ctx.restore();

    // vignette
    var vg = ctx.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.35, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, v.w, v.h);
  };

  root.OP_R = R;
})(window);
