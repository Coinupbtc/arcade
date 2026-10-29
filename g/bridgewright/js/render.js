/* BRIDGEWRIGHT — Canvas 2D renderer: full-screen diorama, no letterbox. */
(function (root) {
  'use strict';

  const L = root.BW_LEVELS;
  const { THEMES, MATS, VEHICLES } = L;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function hash(n) {
    let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Low stress keeps the material's own colour (wood looks like wood); load pushes it yellow,
  // orange, then red. The colour change is the gauge, the base colour is the material.
  // A gentle curve makes the gauge respond before a beam is at its limit, so red is a warning,
  // not only a post-mortem. The snap test itself still uses the raw solver value.
  function stressLevel(s) { return Math.pow(Math.max(0, Math.min(1, s)), 0.6); }
  function stressColor(s) {
    const v = stressLevel(s);
    if (v < 0.45) return '#3DDC84';
    if (v < 0.66) return '#FFD166';
    if (v < 0.84) return '#FF9F43';
    return '#FF4D4D';
  }

  const R = {
    canvas: null, ctx: null, dpr: 1, W: 0, H: 0,
    view: { scale: 1, ox: 0, oy: 0, zoom: 1, panX: 0, panY: 0, shakeX: 0, shakeY: 0 },

    init(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.resize();
    },

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth, h = window.innerHeight;
      this.dpr = dpr; this.W = w; this.H = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
    },

    /* ---------- camera ---------- */

    computeView(G, layout) {
      const lv = G.level;
      const play = layout.play;
      // Fit every BOLT, not just the road line. The v4 camera framed the span and let the lower
      // bank bolts sit under the bottom bar (landscape) or off the side (portrait), so a phone
      // player could not start a beam from them. The fit here is the extents of the banks, the
      // deck and the piers, plus a touch pad on each side and headroom above the deck for a truss.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const see = (x, y) => {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      };
      see(lv.left.edge, lv.left.top);
      see(lv.right.edge, lv.right.top);
      for (const arr of [lv.anchors.left, lv.anchors.right, lv.anchors.piers || []]) {
        for (const [x, y] of arr) see(x, y);
      }
      for (const p of lv.piers || []) see(p.x, p.top);
      minY -= lv.noUnderDeck ? 96 : 56;   // room for a top truss / a bank tie above the deck
      minY = Math.max(minY, 40);
      // Under-deck room, measured on the real bar: in landscape the bottom bar sits close to the
      // play rect, and 34 px of pad left the lowest bolts ~36 px above it, so a deep truss under
      // the deck was fiddly to place (playtest round 5, item 9). Landscape now reserves 64 px.
      const padX = 30, padBottom = layout.portrait ? 46 : 64;
      const spanW = (maxX - minX) + padX * 2;
      const spanH = (maxY - minY) + padBottom;
      let scale = Math.min(play.w / spanW, play.h / spanH);
      scale = clamp(scale, 0.3, 2.8) * (G.view ? G.view.zoom : 1);
      const cx = (minX + maxX) / 2 + (G.view ? G.view.panX : 0);
      const cy = (minY + maxY) / 2 + (G.view ? G.view.panY : 0);
      const v = this.view;
      v.scale = scale;
      v.ox = play.x + play.w / 2 - cx * scale;
      v.oy = play.y + play.h / 2 - cy * scale;
      v.zoom = G.view ? G.view.zoom : 1;
      v.shakeX = 0; v.shakeY = 0;
      if (G.shake > 0) {
        v.shakeX = (Math.random() * 2 - 1) * G.shake;
        v.shakeY = (Math.random() * 2 - 1) * G.shake;
      }
      return v;
    },

    w2s(x, y) {
      return { x: this.view.ox + x * this.view.scale + this.view.shakeX, y: this.view.oy + y * this.view.scale + this.view.shakeY };
    },
    s2w(x, y) {
      return { x: (x - this.view.ox) / this.view.scale, y: (y - this.view.oy) / this.view.scale };
    },
    len(w) { return w * this.view.scale; },

    /* ---------- frame ---------- */

    draw(G, dt) {
      const ctx = this.ctx;
      const lv = G.level;
      const theme = THEMES[lv.theme];
      this.computeView(G, G.ui);
      ctx.save();
      ctx.clearRect(0, 0, this.W, this.H);
      this.drawSky(theme, G);
      this.drawRidges(theme, G);
      this.drawWater(theme, lv, G);
      this.drawTerrain(lv, theme, G);
      this.drawBridgeShadow(G);
      this.drawBridge(G);
      this.drawVehicles(G);
      this.drawCulprit(G);
      this.drawParticles(G);
      this.drawWeather(theme, G, dt);
      this.drawVignette(theme);
      ctx.restore();
    },

    drawSky(theme, G) {
      const ctx = this.ctx, W = this.W, H = this.H;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.sky[0]);
      g.addColorStop(0.45, theme.sky[1]);
      g.addColorStop(1, theme.sky[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // sun / moon
      const sx = W * theme.sunX, sy = H * theme.sunY;
      const rg = ctx.createRadialGradient(sx, sy, 4, sx, sy, Math.min(W, H) * 0.42);
      rg.addColorStop(0, theme.sun + 'cc');
      rg.addColorStop(0.25, theme.sun + '55');
      rg.addColorStop(1, theme.sun + '00');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = theme.sun;
      ctx.beginPath(); ctx.arc(sx, sy, Math.min(W, H) * 0.055, 0, Math.PI * 2); ctx.fill();

      // clouds drift
      const t = G.t || 0;
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      for (let i = 0; i < 5; i++) {
        const base = hash(i + 3);
        const cx = ((base * W + t * (6 + i * 3)) % (W + 260)) - 130;
        const cy = H * (0.08 + base * 0.28);
        const s = 0.5 + hash(i + 9) * 0.8;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 46 * s, 14 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 28 * s, cy - 8 * s, 30 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - 30 * s, cy + 2 * s, 26 * s, 9 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    drawRidges(theme, G) {
      const ctx = this.ctx, W = this.W, H = this.H;
      const horizon = this.w2s(0, G.level.world.waterY).y;
      const layers = [
        { color: theme.far, amp: 42, base: 0.30, speed: 0.18, alpha: 0.55 },
        { color: theme.mid, amp: 64, base: 0.22, speed: 0.34, alpha: 0.7 },
        { color: theme.near, amp: 86, base: 0.14, speed: 0.55, alpha: 0.85 },
      ];
      for (let li = 0; li < layers.length; li++) {
        const L2 = layers[li];
        const par = (this.view.ox * L2.speed) % (W + 200);
        ctx.globalAlpha = L2.alpha;
        ctx.fillStyle = L2.color;
        ctx.beginPath();
        ctx.moveTo(-200, H);
        for (let x = -200; x <= W + 200; x += 12) {
          const u = (x + par) / (W + 200);
          const y = horizon - H * (L2.base + 0.02 * li)
            + Math.sin(u * 7.1 + li * 2.3) * L2.amp
            + Math.sin(u * 13.7 + li) * L2.amp * 0.35;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W + 200, H);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // haze band at the horizon
      const hz = ctx.createLinearGradient(0, horizon - 90, 0, horizon + 30);
      hz.addColorStop(0, theme.fog.replace(/[\d.]+\)$/, '0)'));
      hz.addColorStop(0.7, theme.fog);
      hz.addColorStop(1, theme.fog.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = hz;
      ctx.fillRect(0, horizon - 90, W, 120);
    },

    drawWater(theme, lv, G) {
      const ctx = this.ctx, W = this.W, H = this.H;
      const horizon = this.w2s(0, lv.world.waterY).y;
      if (horizon > H + 40) return;
      const g = ctx.createLinearGradient(0, horizon, 0, H);
      g.addColorStop(0, theme.water);
      g.addColorStop(1, theme.waterDeep);
      ctx.fillStyle = g;
      ctx.fillRect(0, horizon, W, H - horizon + 2);

      const t = G.t || 0;
      ctx.strokeStyle = theme.waterLine;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const y = horizon + 14 + i * 26 + Math.sin(t * 1.1 + i) * 3;
        ctx.beginPath();
        for (let x = -20; x <= W + 20; x += 16) {
          const yy = y + Math.sin((x + t * 40 + i * 30) * 0.018) * 3.2;
          if (x === -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 0.25;
      for (let i = 0; i < 18; i++) {
        const x = hash(i * 7 + 1) * W;
        const y = horizon + 20 + hash(i * 3 + 2) * (H - horizon);
        const w = 10 + hash(i) * 24;
        ctx.fillStyle = theme.waterLine;
        ctx.fillRect(x, y, w, 1.5);
      }
      ctx.globalAlpha = 1;
    },

    /* ---------- terrain ---------- */

    drawTerrain(lv, theme, G) {
      const ctx = this.ctx;
      const left = lv.left, right = lv.right;
      this.drawBank(-420, left.edge, left.top, theme, 11, true);
      this.drawBank(right.edge, 1420, right.top, theme, 29, false);
      for (const p of lv.piers || []) this.drawPier(p, theme);

      // bank-edge ramps (physics has them; draw the lip so it reads)
      this.drawRamp(left.edge, left.top, true, theme);
      this.drawRamp(right.edge, right.top, false, theme);

      // props on the banks
      this.drawProps(lv, theme, G);
    },

    drawBank(x1, x2, top, theme, seed, isLeft) {
      const ctx = this.ctx;
      const p1 = this.w2s(x1, top), p2 = this.w2s(x2, top);
      const bottom = this.w2s(0, 760).y;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y + 10);
      ctx.lineTo(p2.x, p2.y + 10);
      ctx.lineTo(p2.x, bottom);
      ctx.lineTo(p1.x, bottom);
      ctx.closePath();
      ctx.fill();

      // body: jagged cliff face
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      const steps = 9;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const wx = x1 + (x2 - x1) * t;
        const jag = (hash(seed + i) - 0.5) * 16;
        const s = this.w2s(wx, top + jag);
        ctx.lineTo(s.x, s.y);
      }
      ctx.lineTo(p2.x, bottom);
      ctx.lineTo(p1.x, bottom);
      ctx.closePath();
      ctx.fillStyle = theme.terrain;
      ctx.fill();
      ctx.strokeStyle = theme.terrainDark;
      ctx.lineWidth = 3;
      ctx.stroke();

      // top strip
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const wx = x1 + (x2 - x1) * t;
        const jag = (hash(seed + i) - 0.5) * 16;
        const s = this.w2s(wx, top + jag);
        ctx.lineTo(s.x, s.y);
      }
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = theme.top;
      ctx.lineWidth = Math.max(4, this.len(12));
      ctx.stroke();
      ctx.strokeStyle = theme.topLight;
      ctx.lineWidth = Math.max(2, this.len(4));
      ctx.stroke();

      // strata lines
      ctx.strokeStyle = theme.terrainDark;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.5;
      for (let i = 1; i < 4; i++) {
        const y = top + 34 * i;
        const a = this.w2s(x1 + 12, y), b = this.w2s(x2 - 12, y + 8);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },

    drawPier(p, theme) {
      const ctx = this.ctx;
      const s = this.w2s(p.x, p.top);
      const w = this.len(p.w || 56);
      const bottom = this.w2s(0, 760).y;
      ctx.fillStyle = theme.terrain;
      ctx.fillRect(s.x - w / 2, s.y, w, bottom - s.y);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(s.x - w / 2 + 2, s.y, Math.max(2, w * 0.18), bottom - s.y);
      ctx.strokeStyle = theme.terrainDark;
      ctx.lineWidth = 3;
      ctx.strokeRect(s.x - w / 2, s.y, w, bottom - s.y);
      ctx.fillStyle = theme.top;
      ctx.fillRect(s.x - w / 2 - 3, s.y - 2, w + 6, Math.max(4, this.len(7)));
      // stone lines
      ctx.strokeStyle = theme.terrainDark;
      ctx.globalAlpha = 0.4;
      for (let i = 1; i < 6; i++) {
        const y = s.y + i * 22 * this.view.scale;
        ctx.beginPath(); ctx.moveTo(s.x - w / 2 + 3, y); ctx.lineTo(s.x + w / 2 - 3, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },

    drawRamp(edge, top, isLeft, theme) {
      const ctx = this.ctx;
      const a = this.w2s(isLeft ? edge - 56 : edge + 2, top - 6);
      const b = this.w2s(isLeft ? edge - 2 : edge + 56, top);
      ctx.fillStyle = theme.top;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y + this.len(12));
      ctx.lineTo(a.x, a.y + this.len(12));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = theme.terrainDark;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },

    drawProps(lv, theme, G) {
      const ctx = this.ctx;
      const t = G.t || 0;
      const spots = [
        [lv.left.edge - 120, lv.left.top, 'tree'],
        [lv.left.edge - 240, lv.left.top, 'tree'],
        [lv.left.edge - 300, lv.left.top, 'rock'],
        [lv.right.edge + 110, lv.right.top, 'tree'],
        [lv.right.edge + 210, lv.right.top, 'tree'],
        [lv.right.edge + 300, lv.right.top, 'rock'],
      ];
      for (const [x, y, kind] of spots) {
        this.drawProp(x, y, kind, theme, t, hash(x));
      }
      // a few small rocks on the cliff face
      for (let i = 0; i < 4; i++) {
        const side = i % 2 === 0 ? lv.left : lv.right;
        const x = side.edge + (i % 2 === 0 ? -1 : 1) * (30 + i * 16);
        const y = side.top + 26 + i * 22;
        const s = this.w2s(x, y);
        ctx.fillStyle = theme.terrainDark;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, this.len(7), this.len(4), 0.4, 0, Math.PI * 2); ctx.fill();
      }
    },

    drawProp(x, y, kind, theme, t, seed) {
      const ctx = this.ctx;
      const s = this.w2s(x, y);
      const k = this.view.scale;
      const sway = Math.sin(t * 0.8 + seed * 8) * 0.04;
      if (kind === 'tree') {
        ctx.fillStyle = '#5A3A24';
        ctx.fillRect(s.x - 3 * k, s.y - 34 * k, 6 * k, 34 * k);
        ctx.fillStyle = theme.prop === 'lantern' ? '#2E4A3A' : '#3E7A46';
        for (let i = 0; i < 3; i++) {
          const yy = s.y - (34 + i * 22) * k;
          const ww = (34 - i * 7) * k;
          ctx.beginPath();
          ctx.moveTo(s.x, yy - 30 * k);
          ctx.lineTo(s.x - ww / 2, yy);
          ctx.lineTo(s.x + ww / 2, yy);
          ctx.closePath();
          ctx.save(); ctx.translate(s.x, yy); ctx.rotate(sway); ctx.fill(); ctx.restore();
        }
      } else if (kind === 'pine') {
        ctx.fillStyle = '#2E4A3A';
        for (let i = 0; i < 4; i++) {
          const yy = s.y - (12 + i * 18) * k;
          const ww = (30 - i * 6) * k;
          ctx.beginPath();
          ctx.moveTo(s.x, yy - 26 * k);
          ctx.lineTo(s.x - ww / 2, yy);
          ctx.lineTo(s.x + ww / 2, yy);
          ctx.closePath(); ctx.fill();
        }
      } else if (kind === 'cactus') {
        ctx.fillStyle = '#4E7A4A';
        ctx.fillRect(s.x - 5 * k, s.y - 40 * k, 10 * k, 40 * k);
        ctx.fillRect(s.x - 20 * k, s.y - 30 * k, 8 * k, 18 * k);
        ctx.fillRect(s.x + 12 * k, s.y - 24 * k, 8 * k, 14 * k);
      } else if (kind === 'tower') {
        ctx.fillStyle = '#4A4A52';
        ctx.fillRect(s.x - 10 * k, s.y - 54 * k, 20 * k, 54 * k);
        ctx.fillRect(s.x - 16 * k, s.y - 60 * k, 32 * k, 8 * k);
        ctx.fillStyle = '#FFD166';
        ctx.fillRect(s.x - 3 * k, s.y - 46 * k, 6 * k, 6 * k);
      } else if (kind === 'lantern') {
        ctx.fillStyle = '#2A3040';
        ctx.fillRect(s.x - 2 * k, s.y - 46 * k, 4 * k, 46 * k);
        const glow = ctx.createRadialGradient(s.x, s.y - 48 * k, 1, s.x, s.y - 48 * k, 20 * k);
        glow.addColorStop(0, 'rgba(255,196,107,0.85)');
        glow.addColorStop(1, 'rgba(255,196,107,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(s.x, s.y - 48 * k, 20 * k, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFC46B';
        ctx.beginPath(); ctx.arc(s.x, s.y - 48 * k, 4 * k, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = theme.terrainDark;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y - 5 * k, 14 * k, 8 * k, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    /* ---------- bridge ---------- */

    // A break leaves a ring where it happened, so the player can see the member to reinforce.
    drawCulprit(G) {
      if (!G.culprit || G.culpritAge > 3.2 || !G.world) return;
      const ctx = this.ctx;
      const p = this.w2s(G.culprit.x, G.culprit.y);
      const k = Math.max(0.65, Math.min(1.7, this.view.scale));
      const pulse = 0.55 + 0.45 * Math.sin((G.t || 0) * 6.5);
      const fade = G.culpritAge > 2.2 ? Math.max(0, 1 - (G.culpritAge - 2.2)) : 1;
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (20 + 7 * pulse) * k, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,77,77,' + (0.45 + 0.4 * pulse).toFixed(2) + ')';
      ctx.lineWidth = Math.max(2, 3 * k);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7 * k, 0, Math.PI * 2);
      ctx.fillStyle = '#FF4D4D';
      ctx.fill();
      ctx.globalAlpha = 1;
    },

    drawBridgeShadow(G) {
      const ctx = this.ctx;
      const w = G.world;
      if (!w) return;
      const theme = THEMES[G.level.theme];
      ctx.save();
      ctx.translate(this.len(3), this.len(5));
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = Math.max(3, this.len(16));
      for (const bm of w.beams) {
        if (bm.broken) continue;
        const a = this.w2s(bm.a.body.position.x, bm.a.body.position.y);
        const b = this.w2s(bm.b.body.position.x, bm.b.body.position.y);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    },

    drawBridge(G) {
      const ctx = this.ctx;
      const w = G.world;
      if (!w) return;
      const k = this.view.scale;
      const outline = (THEMES[G.level.theme].outline) || '#1E1E1E';
      for (const bm of w.beams) {
        if (bm.broken) continue;
        // Draw between the live joint positions: the deck must sag with the solver, not stay rigid.
        const a = this.w2s(bm.a.body.position.x, bm.a.body.position.y);
        const b = this.w2s(bm.b.body.position.x, bm.b.body.position.y);
        // v3: at low load a beam keeps its material colour (wood brown, steel blue-grey, carbon
        // near-black). Load then pushes it yellow/orange/red, so material AND stress both read.
        const isRoad = bm.kind === 'road';
        // A support that does not reach a bank/pier is drawn RED: it looks like structure but
        // carries nothing. A grounded support keeps its material colour.
        const col = isRoad
          ? (bm.stress < 0.3 ? bm.matDef.base : stressColor(bm.stress))
          : (bm.grounded === false ? '#FF4D4D' : bm.matDef.base);
        const thick = Math.max(3, this.len(bm.matDef.thick) * (isRoad ? 1 : 0.62));
        // outline
        ctx.strokeStyle = outline;
        ctx.lineWidth = thick + Math.max(2, this.len(4));
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        // fill
        ctx.strokeStyle = col;
        ctx.lineWidth = thick;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        // highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(1, thick * 0.22);
        ctx.beginPath(); ctx.moveTo(a.x, a.y - thick * 0.22); ctx.lineTo(b.x, b.y - thick * 0.22); ctx.stroke();

        // material texture
        if (bm.mat === 'wood') {
          ctx.strokeStyle = 'rgba(90,50,20,0.45)';
          ctx.lineWidth = Math.max(1, k * 1.4);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          ctx.beginPath(); ctx.moveTo(mx - 3, my - thick * 0.2); ctx.lineTo(mx + 3, my + thick * 0.2); ctx.stroke();
        } else if (bm.mat === 'steel') {
          ctx.fillStyle = 'rgba(40,60,80,0.55)';
          const steps = Math.max(2, Math.floor(bm.len / 40));
          for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
            ctx.beginPath(); ctx.arc(x, y, Math.max(1, k * 1.6), 0, Math.PI * 2); ctx.fill();
          }
        }

        // road deck: light top strip + centre dashes so the deck reads as a surface
        if (isRoad) {
          // asphalt deck: a dark strip with a pale edge and a yellow centre line. Distinct from
          // the structural beams so the road reads at a glance.
          const roadW = Math.max(5, thick * 0.52);
          const yy = -thick * 0.26;
          ctx.strokeStyle = '#F2F5FA';
          ctx.lineWidth = roadW + Math.max(3, k * 3);
          ctx.beginPath(); ctx.moveTo(a.x, a.y + yy); ctx.lineTo(b.x, b.y + yy); ctx.stroke();
          ctx.strokeStyle = '#33363C';
          ctx.lineWidth = roadW + Math.max(1, k * 1.5);
          ctx.beginPath(); ctx.moveTo(a.x, a.y + yy); ctx.lineTo(b.x, b.y + yy); ctx.stroke();
          ctx.setLineDash([this.len(11), this.len(9)]);
          ctx.strokeStyle = '#FFD166';
          ctx.lineWidth = Math.max(1.5, k * 2);
          ctx.beginPath(); ctx.moveTo(a.x, a.y + yy); ctx.lineTo(b.x, b.y + yy); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // joints
      for (const n of w.nodes) {
        const s = this.w2s(n.body.position.x, n.body.position.y);
        const rad = this.len(n.anchor ? 9 : 7);
        if (n.anchor) {
          // bolted bracket: the plate reaches into the bank so it never reads as a floating dot
          const plateH = Math.max(14, this.len(20));
          ctx.fillStyle = '#3A4656';
          roundRect(ctx, s.x - rad * 0.9, s.y - rad * 0.4, rad * 1.8, plateH, 3);
          ctx.fill();
          ctx.strokeStyle = '#5E7488'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.fillStyle = outline;
        ctx.beginPath(); ctx.arc(s.x, s.y, rad + Math.max(1, k * 1.5), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = n.anchor ? '#D8DEE8' : '#FFE08A';
        ctx.beginPath(); ctx.arc(s.x, s.y, rad * 0.62, 0, Math.PI * 2); ctx.fill();
        if (n.anchor) {
          ctx.fillStyle = '#5E7488';
          ctx.beginPath(); ctx.arc(s.x, s.y, rad * 0.3, 0, Math.PI * 2); ctx.fill();
        }
      }

      // tied / untied deck joints: green ring = load path to a bank, red ring = no ground path
      for (const n of w.nodes) {
        if (n.anchor) continue;
        if (!n.beams.some((b) => b.kind === 'road' && !b.broken)) continue;
        const s = this.w2s(n.body.position.x, n.body.position.y);
        const rad = this.len(7);
        const c = w.nodeCredit(n);
        ctx.strokeStyle = c >= 0.15 ? '#3DDC84' : '#FF4D4D';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, rad * 1.15, 0, Math.PI * 2); ctx.stroke();
      }

      // drag preview: free joint at the grid-snapped, clamped endpoint.
      // G.kbDrag is the same preview driven by the keyboard/pad cursor.
      const drag = G.drag || G.kbDrag;
      if (drag) {
        const pv = drag.preview || { x: drag.x, y: drag.y, ok: false, reason: 'DRAG', cost: 0, clamped: false };
        const a = this.w2s(drag.ax, drag.ay);
        const b = this.w2s(pv.x, pv.y);
        ctx.setLineDash([this.len(10), this.len(8)]);
        ctx.strokeStyle = pv.ok ? (pv.clamped ? '#FF9F43' : '#FFD166') : '#FF6B6B';
        ctx.lineWidth = Math.max(3, this.len(8));
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        // ghost joint
        ctx.fillStyle = pv.ok ? '#FFE08A' : '#FF8F8F';
        ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(4, this.len(7)), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke();
        if (pv.clamped) {
          ctx.strokeStyle = '#FF9F43'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(12, this.len(20)), 0, Math.PI * 2); ctx.stroke();
        }
        const label = pv.ok ? (pv.clamped ? 'CLAMPED $' + pv.cost : Math.round(pv.len) + 'px') : (pv.reason || 'NO');
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const wpx = ctx.measureText(label).width + 14;
        ctx.fillStyle = 'rgba(20,24,32,0.82)';
        roundRect(ctx, b.x - wpx / 2, b.y - 36, wpx, 22, 8); ctx.fill();
        ctx.fillStyle = pv.ok ? (pv.clamped ? '#FF9F43' : '#FFD166') : '#FF8F8F';
        ctx.fillText(label, b.x, b.y - 20);
        ctx.textAlign = 'left';
      }

      // keyboard / pad cursor: a crosshair on the grid point that will become a joint
      if (G.cursor && G.showCursor) {
        const c = this.w2s(G.cursor.x, G.cursor.y);
        const r = Math.max(10, this.len(16));
        ctx.strokeStyle = 'rgba(255,209,102,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x - r, c.y); ctx.lineTo(c.x + r, c.y);
        ctx.moveTo(c.x, c.y - r); ctx.lineTo(c.x, c.y + r);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.5, 0, Math.PI * 2); ctx.stroke();
      }

      // hover node ring
      if (G.hoverNode) {
        const s = this.w2s(G.hoverNode.body.position.x, G.hoverNode.body.position.y);
        ctx.strokeStyle = 'rgba(255,209,102,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(13, this.len(20)), 0, Math.PI * 2); ctx.stroke();
      }
    },

    /* ---------- vehicles ---------- */

    drawVehicles(G) {
      const ctx = this.ctx;
      if (!G.world) return;
      for (const v of G.world.vehicles) {
        if (v.dead && v.body.position.y > G.level.world.waterY + 40) continue;
        this.drawVehicle(v, G);
      }
    },

    drawVehicle(v, G) {
      const ctx = this.ctx;
      const b = v.body;
      const p = this.w2s(b.position.x, b.position.y);
      const k = this.view.scale;
      const type = v.def;
      const ang = b.angle;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      const W = type.w * k, H = type.h * k;
      const wheelR = Math.max(4, type.h * 0.30 * k);

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(0, H * 0.45, W * 0.55, 4 * k, 0, 0, Math.PI * 2); ctx.fill();

      if (v.type === 'walker') {
        const step = Math.sin(v.spin * 2.2) * 5 * k;
        ctx.strokeStyle = '#2E2A28';
        ctx.lineWidth = 3 * k;
        ctx.beginPath();
        ctx.moveTo(-3 * k, H * 0.1); ctx.lineTo(-3 * k - step, H * 0.48);
        ctx.moveTo(3 * k, H * 0.1); ctx.lineTo(3 * k + step, H * 0.48);
        ctx.stroke();
        ctx.fillStyle = type.color;
        roundRect(ctx, -6 * k, -H * 0.3, 12 * k, H * 0.45, 4 * k); ctx.fill();
        ctx.fillStyle = '#F2C9A0';
        ctx.beginPath(); ctx.arc(0, -H * 0.38, 5 * k, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = type.accent;
        ctx.fillRect(-6 * k, -H * 0.26, 12 * k, 3 * k);
      } else if (v.type === 'bike') {
        ctx.strokeStyle = '#2E2A28';
        ctx.lineWidth = 2 * k;
        for (const wx of [-W * 0.28, W * 0.28]) {
          ctx.beginPath(); ctx.arc(wx, H * 0.26, wheelR, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = v.spin + i * Math.PI / 4;
            ctx.moveTo(wx, H * 0.26);
            ctx.lineTo(wx + Math.cos(a) * wheelR, H * 0.26 + Math.sin(a) * wheelR);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = type.color;
        ctx.lineWidth = 3 * k;
        ctx.beginPath();
        ctx.moveTo(-W * 0.28, H * 0.26); ctx.lineTo(0, -H * 0.05); ctx.lineTo(W * 0.28, H * 0.26);
        ctx.moveTo(0, -H * 0.05); ctx.lineTo(-W * 0.12, H * 0.26);
        ctx.stroke();
        // rider
        ctx.fillStyle = '#E86A5A';
        ctx.beginPath(); ctx.arc(0, -H * 0.28, 4 * k, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#E86A5A'; ctx.lineWidth = 3 * k;
        ctx.beginPath(); ctx.moveTo(0, -H * 0.24); ctx.lineTo(2 * k, H * 0.02); ctx.stroke();
      } else {
        // car / truck / tank: wheels first
        const wr = Math.max(3, type.h * 0.3 * k);
        for (const wx of [-W * 0.30, W * 0.30]) {
          ctx.fillStyle = '#1E1E1E';
          ctx.beginPath(); ctx.arc(wx, H * 0.30, wr, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#8A8F98';
          ctx.beginPath(); ctx.arc(wx, H * 0.30, wr * 0.55, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#D8DEE8'; ctx.lineWidth = Math.max(1, k);
          ctx.beginPath();
          for (let i = 0; i < 3; i++) {
            const a = v.spin + i * Math.PI / 3;
            ctx.moveTo(wx + Math.cos(a) * wr * 0.5, H * 0.30 + Math.sin(a) * wr * 0.5);
            ctx.lineTo(wx + Math.cos(a) * wr * 0.9, H * 0.30 + Math.sin(a) * wr * 0.9);
          }
          ctx.stroke();
        }

        if (v.type === 'semi' || v.type === 'lowboy' || v.type === 'mega') {
          // cab + long trailer + load
          ctx.fillStyle = type.color;
          roundRect(ctx, -W * 0.5, -H * 0.20, W * 0.78, H * 0.42, 4 * k); ctx.fill();
          ctx.fillStyle = '#D8E8F4';
          roundRect(ctx, W * 0.22, -H * 0.28, W * 0.26, H * 0.36, 4 * k); ctx.fill();
          ctx.fillStyle = '#2E4258';
          roundRect(ctx, W * 0.25, -H * 0.22, W * 0.18, H * 0.16, 2 * k); ctx.fill();
          ctx.fillStyle = type.accent;
          const loadW = v.type === 'mega' ? W * 0.52 : v.type === 'lowboy' ? W * 0.46 : W * 0.40;
          roundRect(ctx, -W * 0.46, -H * 0.44, loadW, H * 0.26, 4 * k); ctx.fill();
          ctx.fillStyle = 'rgba(30,30,36,0.55)';
          for (let i = 0; i < 4; i++) ctx.fillRect(-W * 0.44 + i * loadW / 4, -H * 0.42, 2 * k, H * 0.22);
          ctx.fillStyle = '#2E2E36';
          for (const wx of [-W * 0.34, -W * 0.06, W * 0.30]) {
            ctx.beginPath(); ctx.arc(wx, H * 0.30, wr, 0, Math.PI * 2); ctx.fill();
          }
        } else if (v.type === 'tanker') {
          ctx.fillStyle = '#3E4A32';
          roundRect(ctx, -W * 0.5, H * 0.02, W, H * 0.46, 6 * k); ctx.fill();
          ctx.strokeStyle = '#C8D8A0'; ctx.lineWidth = 1.5 * k;
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath(); ctx.arc(i * W * 0.18, H * 0.28, wr * 0.7, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.fillStyle = type.color;
          roundRect(ctx, -W * 0.26, -H * 0.30, W * 0.52, H * 0.34, 5 * k); ctx.fill();
          ctx.fillRect(W * 0.24, -H * 0.22, W * 0.30, 4 * k);
          ctx.fillStyle = type.accent;
          ctx.fillRect(-W * 0.26, -H * 0.30, W * 0.52, 2.5 * k);
        } else if (v.type === 'truck') {
          ctx.fillStyle = type.color;
          roundRect(ctx, -W * 0.5, -H * 0.22, W * 0.72, H * 0.46, 4 * k); ctx.fill();
          ctx.fillStyle = '#D8E8F4';
          roundRect(ctx, W * 0.16, -H * 0.26, W * 0.30, H * 0.34, 4 * k); ctx.fill();
          ctx.fillStyle = '#2E4258';
          roundRect(ctx, W * 0.20, -H * 0.20, W * 0.20, H * 0.16, 2 * k); ctx.fill();
          ctx.fillStyle = type.accent;
          ctx.fillRect(-W * 0.48, -H * 0.22, W * 0.66, 2.5 * k);
        } else {
          ctx.fillStyle = type.color;
          roundRect(ctx, -W * 0.46, -H * 0.18, W * 0.92, H * 0.42, 7 * k); ctx.fill();
          ctx.fillStyle = '#2E4258';
          roundRect(ctx, -W * 0.22, -H * 0.40, W * 0.44, H * 0.30, 5 * k); ctx.fill();
          ctx.fillStyle = '#BFE4F2';
          roundRect(ctx, -W * 0.17, -H * 0.35, W * 0.15, H * 0.18, 2 * k); ctx.fill();
          roundRect(ctx, W * 0.02, -H * 0.35, W * 0.15, H * 0.18, 2 * k); ctx.fill();
          ctx.fillStyle = type.accent;
          ctx.beginPath(); ctx.arc(-W * 0.42, -H * 0.02, 2.5 * k, 0, Math.PI * 2); ctx.fill();
        }
      }

      // weight tag
      if (!v.crossed && !v.dead && G.mode === 'run') {
        ctx.fillStyle = 'rgba(20,24,32,0.72)';
        const label = type.weight;
        ctx.font = 'bold ' + Math.max(10, 13 * k) + 'px system-ui, sans-serif';
        const tw = ctx.measureText(label).width + 8 * k;
        roundRect(ctx, -tw / 2, -H * 1.02, tw, 17 * k, 5 * k); ctx.fill();
        ctx.fillStyle = '#FFE08A';
        ctx.textAlign = 'center';
        ctx.fillText(label, 0, -H * 1.02 + 12 * k);
        ctx.textAlign = 'left';
      }
      ctx.restore();
    },

    /* ---------- particles ---------- */

    drawParticles(G) {
      const ctx = this.ctx;
      for (const p of G.particles) {
        const s = this.w2s(p.x, p.y);
        const a = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(p.rot || 0);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(1, p.size * this.view.scale), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },

    /* ---------- weather ---------- */

    drawWeather(theme, G, dt) {
      const ctx = this.ctx, W = this.W, H = this.H;
      const kind = theme.weather;
      const t = G.t || 0;
      if (kind === 'rain') {
        ctx.strokeStyle = 'rgba(200,220,240,0.55)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 60; i++) {
          const x = (hash(i) * W + t * 40) % W;
          const y = (hash(i + 99) * H + t * 620) % H;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 14); ctx.stroke();
        }
      } else if (kind === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let i = 0; i < 50; i++) {
          const x = (hash(i) * W + Math.sin(t * 0.7 + i) * 20) % W;
          const y = (hash(i + 77) * H + t * 26) % H;
          ctx.beginPath(); ctx.arc(x, y, 1.5 + hash(i + 5) * 1.6, 0, Math.PI * 2); ctx.fill();
        }
      } else if (kind === 'fireflies') {
        for (let i = 0; i < 16; i++) {
          const x = (hash(i) * W + Math.sin(t * 0.5 + i) * 40) % W;
          const y = (hash(i + 4) * H * 0.7 + Math.cos(t * 0.4 + i) * 24) % (H * 0.8);
          const a = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2 + i));
          ctx.fillStyle = 'rgba(255,196,107,' + a.toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
        }
      } else if (kind === 'dust') {
        ctx.fillStyle = 'rgba(255,220,170,0.35)';
        for (let i = 0; i < 24; i++) {
          const x = (hash(i) * W + t * 14) % W;
          const y = H * 0.4 + hash(i + 8) * H * 0.4;
          ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
        }
      } else if (kind === 'birds' || kind === 'gulls') {
        ctx.strokeStyle = kind === 'gulls' ? 'rgba(255,255,255,0.8)' : 'rgba(40,40,50,0.55)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const x = ((hash(i) * W + t * 18) % (W + 120)) - 60;
          const y = H * 0.14 + hash(i + 2) * H * 0.18 + Math.sin(t + i) * 6;
          const flap = Math.sin(t * 6 + i) * 4;
          ctx.beginPath();
          ctx.moveTo(x - 8, y + flap); ctx.lineTo(x, y); ctx.lineTo(x + 8, y + flap);
          ctx.stroke();
        }
      } else if (kind === 'smoke') {
        for (let i = 0; i < 5; i++) {
          const x = W * (0.1 + hash(i) * 0.8);
          const y = H * 0.55 - ((t * 18 + i * 40) % 160);
          ctx.fillStyle = 'rgba(160,180,180,0.16)';
          ctx.beginPath(); ctx.arc(x, y, 18 + i * 4, 0, Math.PI * 2); ctx.fill();
        }
      }
    },

    drawVignette(theme) {
      const ctx = this.ctx, W = this.W, H = this.H;
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(10,12,18,0.28)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    },
  };

  root.BW_RENDER = R;
})(typeof globalThis !== 'undefined' ? globalThis : this);
