// Renderer: everything is drawn from the state the game already uses. No renderer state of its own.
CK.Draw = {
  stars: [], neb: [], cracks: [], built: 0,

  build: function (w, h) {
    var s = Math.min(w, h), i;
    this.stars = [];
    for (i = 0; i < 130; i++) {
      var layer = i < 70 ? 0 : 1;
      this.stars.push({
        x: Math.random() * w, y: Math.random() * h,
        r: (layer ? 1.5 : 0.8) * (0.6 + Math.random() * 0.9) * (s / 390),
        a: 0.25 + Math.random() * 0.6, ph: Math.random() * 6.28, layer: layer
      });
    }
    this.neb = [
      { x: 0.22, y: 0.24, r: 0.52, c: "58,42,110", a: 0.30, ph: 0 },
      { x: 0.78, y: 0.34, r: 0.44, c: "18,84,102", a: 0.26, ph: 2.1 },
      { x: 0.58, y: 0.80, r: 0.58, c: "74,26,74", a: 0.22, ph: 4.2 },
      { x: 0.14, y: 0.74, r: 0.36, c: "20,70,90", a: 0.20, ph: 5.3 }
    ];
    // three jagged cracks, in planet-local units (-1..1), fixed for the whole run
    this.cracks = [];
    for (var c = 0; c < 3; c++) {
      var base = -2.2 + c * 2.1, pts = [], n = 6, x = 0, y = 0;
      for (var k = 0; k <= n; k++) {
        var t = k / n;
        var ang = base + Math.sin(k * 2.3 + c) * 0.42;
        var rad = 0.18 + t * 0.78;
        pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
      }
      this.cracks.push(pts);
    }
    this.built = s;
  },

  frame: function (ctx, w, h, dt) {
    var G = CK.G, P = CK.PAL, T = CK.TUNE;
    var s = Math.min(w, h);
    if (this.built !== s || this.stars.length === 0) this.build(w, h);

    var dpr = CK.DPR || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var sh = G.shake;
    if (sh > 0.05) ctx.translate((Math.random() - 0.5) * sh * 2, (Math.random() - 0.5) * sh * 2);

    // ---- sky
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#05040f");
    sky.addColorStop(0.45, "#0b0a22");
    sky.addColorStop(1, "#0a0f1e");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    // ---- nebula drift (slow, additive, behind everything)
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < this.neb.length; i++) {
      var nb = this.neb[i];
      var nx = (nb.x + Math.sin(G.time * 0.035 + nb.ph) * 0.03) * w;
      var ny = (nb.y + Math.cos(G.time * 0.028 + nb.ph) * 0.025) * h;
      var nr = nb.r * s * (1 + Math.sin(G.time * 0.02 + nb.ph) * 0.05);
      var ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      ng.addColorStop(0, "rgba(" + nb.c + "," + (nb.a * 0.55) + ")");
      ng.addColorStop(0.55, "rgba(" + nb.c + "," + (nb.a * 0.18) + ")");
      ng.addColorStop(1, "rgba(" + nb.c + ",0)");
      ctx.fillStyle = ng;
      ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
    }
    ctx.globalCompositeOperation = "source-over";

    // ---- stars
    for (i = 0; i < this.stars.length; i++) {
      var st = this.stars[i];
      var tw = 0.55 + 0.45 * Math.sin(G.time * 1.6 + st.ph);
      ctx.globalAlpha = st.a * tw;
      ctx.fillStyle = st.layer ? "#cfe6ff" : "#ffffff";
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    var cx = G.planet.x, cy = G.planet.y, pr = G.planet.r;

    // ---- orbit ring
    ctx.strokeStyle = "rgba(223,232,245,0.16)";
    ctx.lineWidth = Math.max(1, s * 0.0022);
    ctx.setLineDash([s * 0.012, s * 0.02]);
    ctx.beginPath(); ctx.arc(cx, cy, G.orbitR, 0, 6.283); ctx.stroke();
    ctx.setLineDash([]);

    // ---- world glow
    var halo = ctx.createRadialGradient(cx, cy, pr * 0.7, cx, cy, pr * 3.4);
    halo.addColorStop(0, "rgba(70,224,180,0.22)");
    halo.addColorStop(0.45, "rgba(70,224,180,0.07)");
    halo.addColorStop(1, "rgba(70,224,180,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, pr * 3.4, 0, 6.283); ctx.fill();

    // ---- the world
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, pr, 0, 6.283); ctx.clip();
    var pg = ctx.createRadialGradient(cx - pr * 0.38, cy - pr * 0.42, pr * 0.08, cx, cy, pr * 1.05);
    pg.addColorStop(0, "#b6ffe6");
    pg.addColorStop(0.30, "#5ee9c0");
    pg.addColorStop(0.62, "#1d7d8a");
    pg.addColorStop(1, "#0a2f44");
    ctx.fillStyle = pg;
    ctx.fillRect(cx - pr, cy - pr, pr * 2, pr * 2);

    // soft cloud bands so the surface is not a flat disc
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#eafff7";
    for (i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + Math.sin(G.time * 0.12 + i) * pr * 0.1, cy - pr * 0.34 + i * pr * 0.32,
        pr * (0.72 - i * 0.12), pr * 0.10, 0.12, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // face: it winces when the world cracks
    var wince = G.planet.wince;
    var eyeY = cy - pr * 0.10, eyeDX = pr * 0.33, eyeR = pr * 0.115;
    ctx.fillStyle = "#062b33";
    for (i = -1; i <= 1; i += 2) {
      var ex = cx + i * eyeDX;
      if (wince > 0.35) {
        ctx.strokeStyle = "#062b33";
        ctx.lineWidth = pr * 0.075; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(ex - eyeR, eyeY + eyeR * 0.5); ctx.lineTo(ex, eyeY - eyeR * 0.55); ctx.lineTo(ex + eyeR, eyeY + eyeR * 0.5); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.ellipse(ex, eyeY, eyeR, eyeR * (1 - wince * 0.8), 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath(); ctx.arc(ex - eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.28, 0, 6.283); ctx.fill();
        ctx.fillStyle = "#062b33";
      }
    }
    ctx.strokeStyle = "#062b33"; ctx.lineWidth = pr * 0.055; ctx.lineCap = "round";
    ctx.beginPath();
    if (wince > 0.35) ctx.arc(cx, cy + pr * 0.58, pr * 0.24, 1.18 * Math.PI, 1.82 * Math.PI);
    else ctx.arc(cx, cy + pr * 0.28, pr * 0.24, 0.16 * Math.PI, 0.84 * Math.PI);
    ctx.stroke();

    // cracks already taken
    for (i = 0; i < G.cracks && i < this.cracks.length; i++) {
      var pts = this.cracks[i];
      ctx.beginPath();
      for (var k = 0; k < pts.length; k++) {
        var px = cx + pts[k][0] * pr, py = cy + pts[k][1] * pr;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = "rgba(10,10,26,0.85)";
      ctx.lineWidth = pr * 0.075; ctx.stroke();
      ctx.strokeStyle = "rgba(255,140,140,0.85)";
      ctx.lineWidth = pr * 0.022; ctx.stroke();
    }
    // impact flash
    if (G.planet.hitFlash > 0) {
      ctx.globalAlpha = G.planet.hitFlash * 0.5;
      ctx.fillStyle = "#ff9a9a";
      ctx.fillRect(cx - pr, cy - pr, pr * 2, pr * 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // limb light
    ctx.strokeStyle = "rgba(180,255,235,0.45)";
    ctx.lineWidth = Math.max(1.5, pr * 0.035);
    ctx.beginPath(); ctx.arc(cx, cy, pr * 0.99, Math.PI * 1.05, Math.PI * 1.72); ctx.stroke();

    // ---- pulse ring
    if (G.pulse.ring > 0) {
      ctx.globalCompositeOperation = "lighter";
      var prg = ctx.createRadialGradient(cx, cy, Math.max(0, G.pulse.ring - s * 0.03), cx, cy, G.pulse.ring + s * 0.03);
      prg.addColorStop(0, "rgba(255,255,255,0)");
      prg.addColorStop(0.5, "rgba(210,255,248,0.55)");
      prg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = prg;
      ctx.beginPath(); ctx.arc(cx, cy, G.pulse.ring + s * 0.03, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    // ---- comets: additive tails, bright heads
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < G.comets.length; i++) {
      var c = G.comets[i];
      if (c.dead) continue;
      var col = CK.COL[c.type];
      var sp = Math.hypot(c.vx, c.vy) || 1;
      var ux = c.vx / sp, uy = c.vy / sp;
      var len = c.r * (c.type === "fast" ? 11 : 7);
      var tg = ctx.createLinearGradient(c.x, c.y, c.x - ux * len, c.y - uy * len);
      tg.addColorStop(0, this.rgba(col, 0.85));
      tg.addColorStop(0.4, this.rgba(col, 0.35));
      tg.addColorStop(1, this.rgba(col, 0));
      ctx.strokeStyle = tg;
      ctx.lineWidth = c.r * (c.type === "fast" ? 1.1 : 1.8);
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - ux * len, c.y - uy * len); ctx.stroke();

      var hg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r * 2.6);
      hg.addColorStop(0, "rgba(255,255,255,0.95)");
      hg.addColorStop(0.35, this.rgba(col, 0.75));
      hg.addColorStop(1, this.rgba(col, 0));
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 2.6, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.62, 0, 6.283); ctx.fill();
      if (c.type === "split") {
        ctx.strokeStyle = this.rgba(col, 0.8);
        ctx.lineWidth = Math.max(1.5, c.r * 0.22);
        ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 1.35, c.spin, c.spin + 2.2); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";

    // ---- moons
    for (i = 0; i < G.moons.length; i++) {
      var mp = CK.moonPos(i), mr = CK.moonR(i), m = G.moons[i];
      var glow = ctx.createRadialGradient(mp.x, mp.y, mr * 0.4, mp.x, mp.y, mr * 3.2);
      glow.addColorStop(0, "rgba(223,232,245,0.35)");
      glow.addColorStop(1, "rgba(223,232,245,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(mp.x, mp.y, mr * 3.2, 0, 6.283); ctx.fill();

      ctx.save();
      ctx.translate(mp.x, mp.y);
      var sq = m.squash * (m.hit > 0 ? 1 : 0);
      ctx.rotate(m.a + Math.PI / 2);
      ctx.scale(1 + sq, 1 - sq);
      var mg = ctx.createRadialGradient(-mr * 0.35, -mr * 0.35, mr * 0.1, 0, 0, mr);
      mg.addColorStop(0, "#ffffff");
      mg.addColorStop(0.5, "#e6eefb");
      mg.addColorStop(1, "#8e9db6");
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(0, 0, mr, 0, 6.283); ctx.fill();
      ctx.fillStyle = "rgba(96,112,140,0.30)";
      ctx.beginPath(); ctx.arc(-mr * 0.28, mr * 0.22, mr * 0.26, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(mr * 0.34, -mr * 0.12, mr * 0.16, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(mr * 0.05, -mr * 0.5, mr * 0.12, 0, 6.283); ctx.fill();
      ctx.restore();
    }

    // ---- particles
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < G.parts.length; i++) {
      var q = G.parts[i];
      var al = 1 - q.t / q.life;
      ctx.globalAlpha = Math.max(0, al) * 0.9;
      ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.6 + al * 0.8), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // ---- score pops
    for (i = 0; i < G.pops.length; i++) {
      var p = G.pops[i], a2 = 1 - p.t / p.life;
      ctx.globalAlpha = Math.max(0, a2);
      ctx.fillStyle = p.color;
      ctx.font = "800 " + Math.round(s * 0.045 * p.size) + "px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "#000"; ctx.shadowBlur = 8;
      ctx.fillText(p.text, p.x, p.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    // ---- telegraph arrows at the edge
    for (i = 0; i < G.tele.length; i++) {
      var tt = G.tele[i];
      var ea = tt.a, er = Math.min(w, h) * 0.46;
      var ex2 = cx + Math.cos(ea) * er, ey2 = cy + Math.sin(ea) * er;
      var pulse = 0.35 + 0.4 * Math.sin(G.time * 14);
      ctx.save();
      ctx.translate(ex2, ey2);
      ctx.rotate(ea);
      ctx.globalAlpha = 0.5 + pulse * 0.45;
      ctx.fillStyle = CK.COL[tt.type];
      ctx.beginPath();
      ctx.moveTo(s * 0.030, 0);
      ctx.lineTo(-s * 0.012, -s * 0.022);
      ctx.lineTo(-s * 0.012, s * 0.022);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // ---- PULSE bar, under the world
    var bw = pr * 2.2, bh = Math.max(5, s * 0.013), bx = cx - bw / 2, by = cy + pr + s * 0.055;
    var frac = 1 - G.pulse.cd / G.up.pulseCd;
    ctx.fillStyle = "rgba(6,10,22,0.65)";
    this.roundRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, bh);
    ctx.fill();
    ctx.fillStyle = "rgba(223,232,245,0.16)";
    this.roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
    var ready = G.pulse.cd <= 0;
    ctx.fillStyle = ready ? "#d8fff3" : "rgba(70,224,180,0.62)";
    if (ready) { ctx.shadowColor = CK.PAL.teal; ctx.shadowBlur = 14; }
    this.roundRect(ctx, bx, by, Math.max(2, bw * frac), bh, bh / 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = ready ? CK.PAL.teal : "rgba(223,232,245,0.55)";
    ctx.font = "700 " + Math.round(s * 0.022) + "px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(ready ? "PULSE READY" : "PULSE", cx, by + bh + s * 0.032);

    // ---- hit flash
    if (G.flash > 0) {
      ctx.fillStyle = "rgba(255,120,120," + (G.flash * 0.28) + ")";
      ctx.fillRect(-20, -20, w + 40, h + 40);
    }
    if (G.pulse.flash > 0) {
      ctx.fillStyle = "rgba(220,255,248," + (G.pulse.flash * 0.18) + ")";
      ctx.fillRect(-20, -20, w + 40, h + 40);
    }
  },

  rgba: function (hex, a) {
    var h = hex.replace("#", "");
    var r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  },

  roundRect: function (ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
};
