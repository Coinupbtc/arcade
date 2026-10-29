/* GLOAMKEEP — the moor: peat, pools, 2-wide causeway, gate shrine, rift, mist. */
window.GK = window.GK || {};

(function () {
  const C = GK.CFG, P = C.PAL;
  const T = C.TILE, W = C.W, H = C.H;

  function hash(x, y) {
    let n = x * 374761393 + y * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967296;
  }

  // --- causeway geometry ---------------------------------------------------
  const segs = [];
  let total = 0;
  for (let i = 0; i < C.WAY.length - 1; i++) {
    const a = C.WAY[i], b = C.WAY[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  const spawn = { x: C.WAY[0].x, y: 6 };
  const gate = { x: C.WAY[C.WAY.length - 1].x, y: C.WAY[C.WAY.length - 1].y };

  function posAt(d) {
    if (d <= 0) return { x: spawn.x, y: spawn.y };
    if (d >= total) return { x: gate.x, y: gate.y };
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (d <= s.start + s.len) {
        const t = (d - s.start) / s.len;
        return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
      }
    }
    return { x: gate.x, y: gate.y };
  }

  // --- static bake ---------------------------------------------------------
  const staticCv = document.createElement('canvas');
  staticCv.width = W; staticCv.height = H;
  const sc = staticCv.getContext('2d');
  let baked = false;

  function drawGround() {
    for (let r = 0; r < C.ROWS; r++) {
      for (let c = 0; c < C.COLS; c++) {
        const x = c * T, y = r * T;
        const h = hash(c, r);
        const base = h < 0.22 ? P.water : (h < 0.62 ? P.peat : P.peatLit);
        sc.fillStyle = base;
        sc.fillRect(x, y, T, T);
        // moss tufts
        if (h > 0.55) {
          sc.fillStyle = P.moss;
          sc.fillRect(x + 2 + ((h * 11) | 0) % 10, y + 3 + ((h * 17) | 0) % 10, 1, 1);
          sc.fillRect(x + 5 + ((h * 23) | 0) % 8, y + 8 + ((h * 29) | 0) % 6, 1, 1);
          if (h > 0.8) {
            sc.fillStyle = P.mossLit;
            sc.fillRect(x + 7 + ((h * 31) | 0) % 7, y + 5 + ((h * 37) | 0) % 9, 1, 2);
          }
        }
        // wet sheen on low tiles
        if (h < 0.22) {
          sc.fillStyle = P.waterLit;
          sc.fillRect(x + 3 + ((h * 19) | 0) % 9, y + 4 + ((h * 13) | 0) % 9, 3, 1);
        }
      }
    }
  }

  function drawPools() {
    for (const d of C.DECOR) {
      if (d.t !== 'pool') continue;
      const cx = d.c * T + T / 2, cy = d.r * T + T / 2;
      sc.fillStyle = P.water;
      sc.beginPath();
      sc.ellipse(cx, cy, 13, 10, 0, 0, Math.PI * 2);
      sc.fill();
      sc.fillStyle = P.waterLit;
      sc.beginPath();
      sc.ellipse(cx, cy, 12, 9, 0, 0, Math.PI * 2);
      sc.fill();
      sc.fillStyle = 'rgba(120,200,220,0.20)';
      sc.fillRect(cx - 5, cy - 3, 5, 1);
      sc.fillRect(cx + 1, cy + 3, 4, 1);
      sc.fillStyle = 'rgba(10,20,26,0.9)';
      sc.beginPath();
      sc.ellipse(cx, cy, 9, 6, 0, 0, Math.PI * 2);
      sc.fill();
    }
  }

  function drawCauseway() {
    // surface
    for (const [c, r] of C.PATH) {
      const x = c * T, y = r * T;
      const h = hash(c + 40, r + 40);
      sc.fillStyle = h < 0.4 ? P.causeway : (h < 0.75 ? P.causewayLit : '#78738f');
      sc.fillRect(x, y, T, T);
      // flagstone joints
      sc.fillStyle = P.joint;
      sc.fillRect(x, y + ((h * 9) | 0) % 12, T, 1);
      sc.fillRect(x + ((h * 13) | 0) % 12, y, 1, T);
      // stone highlights
      sc.fillStyle = P.causewayHi;
      sc.fillRect(x + 2 + ((h * 17) | 0) % 9, y + 2 + ((h * 7) | 0) % 6, 2, 1);
      sc.fillRect(x + 5 + ((h * 23) | 0) % 8, y + 9 + ((h * 11) | 0) % 5, 1, 1);
      sc.fillStyle = 'rgba(30,26,44,0.5)';
      sc.fillRect(x + 4 + ((h * 29) | 0) % 7, y + 6 + ((h * 31) | 0) % 7, 1, 1);
    }
    // shadow on the peat outside the causeway
    for (const [c, r] of C.PATH) {
      const x = c * T, y = r * T;
      sc.fillStyle = 'rgba(4,7,10,0.45)';
      if (!C.isPath(c, r - 1) && r > 0) sc.fillRect(x, y - 2, T, 2);
      if (!C.isPath(c, r + 1) && r < C.ROWS - 1) sc.fillRect(x, y + T, T, 2);
      if (!C.isPath(c - 1, r) && c > 0) sc.fillRect(x - 2, y, 2, T);
      if (!C.isPath(c + 1, r) && c < C.COLS - 1) sc.fillRect(x + T, y, 2, T);
    }
    // raised curbs: dark face + lit top edge
    for (const [c, r] of C.PATH) {
      const x = c * T, y = r * T;
      if (!C.isPath(c, r - 1)) {
        sc.fillStyle = P.stoneDark; sc.fillRect(x, y, T, 2);
        sc.fillStyle = P.causewayHi; sc.fillRect(x, y, T, 1);
      }
      if (!C.isPath(c, r + 1)) {
        sc.fillStyle = P.stoneDark; sc.fillRect(x, y + T - 2, T, 2);
      }
      if (!C.isPath(c - 1, r)) {
        sc.fillStyle = P.stoneDark; sc.fillRect(x, y, 2, T);
        sc.fillStyle = P.causewayLit; sc.fillRect(x, y, 1, T);
      }
      if (!C.isPath(c + 1, r)) {
        sc.fillStyle = P.stoneDark; sc.fillRect(x + T - 2, y, 2, T);
      }
    }
    // moss creeping in from the peat edges
    for (const [c, r] of C.PATH) {
      const x = c * T, y = r * T;
      const h = hash(c + 77, r + 13);
      if (h > 0.55) {
        sc.fillStyle = 'rgba(47,92,85,0.45)';
        if (!C.isPath(c, r - 1)) sc.fillRect(x + 1 + ((h * 9) | 0) % 12, y + 2, 3, 1);
        if (!C.isPath(c - 1, r)) sc.fillRect(x + 2, y + 3 + ((h * 11) | 0) % 10, 1, 3);
      }
      if (h > 0.86) {
        sc.fillStyle = 'rgba(195,190,221,0.30)';
        sc.fillRect(x + 4 + ((h * 17) | 0) % 8, y + 8 + ((h * 5) | 0) % 6, 2, 1);
      }
    }
    // rune stones along the causeway
    const runes = [[48, 40], [88, 80], [128, 120], [88, 144], [48, 176], [88, 224], [128, 264]];
    for (const [rx, ry] of runes) {
      sc.fillStyle = 'rgba(255,209,102,0.16)';
      sc.fillRect(rx - 3, ry, 6, 1);
      sc.fillRect(rx, ry - 3, 1, 6);
      sc.fillStyle = 'rgba(255,209,102,0.34)';
      sc.fillRect(rx, ry, 1, 1);
    }
  }

  function drawDecor() {
    for (const d of C.DECOR) {
      if (d.t === 'pool') continue;
      const x = d.c * T + T / 2;
      const y = d.r * T + T;
      if (d.t === 'tree') GK.Spr.drawBottom(sc, 'tree', x, y + 1);
      else if (d.t === 'rock') GK.Spr.drawBottom(sc, 'rock', x, y);
      else if (d.t === 'reed') GK.Spr.drawBottom(sc, 'reed', x, y);
      else if (d.t === 'menhir') GK.Spr.drawBottom(sc, 'menhir', x, y);
    }
  }

  function drawGateStatic() {
    const cx = gate.x;
    const top = H - 42;
    // platform
    sc.fillStyle = P.stoneDark;
    sc.fillRect(cx - 22, H - 12, 44, 12);
    sc.fillStyle = P.stone;
    sc.fillRect(cx - 20, H - 11, 40, 10);
    // pillars
    sc.fillStyle = P.stoneDark;
    sc.fillRect(cx - 20, top + 6, 8, 32);
    sc.fillRect(cx + 12, top + 6, 8, 32);
    sc.fillStyle = P.stone;
    sc.fillRect(cx - 18, top + 8, 5, 30);
    sc.fillRect(cx + 14, top + 8, 5, 30);
    sc.fillStyle = P.stoneLit;
    sc.fillRect(cx - 18, top + 8, 5, 1);
    sc.fillRect(cx + 14, top + 8, 5, 1);
    // lintel
    sc.fillStyle = P.stoneDark;
    sc.fillRect(cx - 22, top, 44, 8);
    sc.fillStyle = P.stone;
    sc.fillRect(cx - 20, top + 1, 40, 5);
    sc.fillStyle = P.causewayHi;
    sc.fillRect(cx - 20, top + 1, 40, 1);
    // arch opening
    sc.fillStyle = '#06070b';
    sc.fillRect(cx - 12, top + 8, 24, 30);
    // warm light inside
    const g = sc.createRadialGradient(cx, H - 18, 1, cx, H - 18, 24);
    g.addColorStop(0, 'rgba(255,190,90,0.6)');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    sc.fillStyle = g;
    sc.fillRect(cx - 26, H - 42, 52, 42);
    // hanging lantern
    sc.fillStyle = P.iron;
    sc.fillRect(cx - 1, top + 8, 2, 6);
    sc.fillStyle = P.ember;
    sc.fillRect(cx - 4, top + 14, 8, 7);
    sc.fillStyle = P.flame;
    sc.fillRect(cx - 2, top + 15, 4, 4);
  }

  function drawSpawnStatic() {
    sc.fillStyle = '#06070b';
    sc.fillRect(spawn.x - 14, 0, 28, 12);
    sc.fillStyle = '#2a1c3f';
    sc.fillRect(spawn.x - 11, 0, 22, 9);
    sc.fillStyle = '#3d2a5c';
    sc.fillRect(spawn.x - 8, 0, 16, 6);
  }

  function bakeStatic() {
    sc.clearRect(0, 0, W, H);
    drawGround();
    drawPools();
    drawCauseway();
    drawDecor();
    drawGateStatic();
    drawSpawnStatic();
    baked = true;
  }

  // --- dynamic -------------------------------------------------------------
  const embers = [];
  for (let i = 0; i < 22; i++) {
    embers.push({
      x: 6 + hash(i, 3) * (W - 12),
      y: 20 + hash(i, 9) * (H - 30),
      ph: hash(i, 7) * 6.28,
      sp: 0.5 + hash(i, 11) * 0.9,
      rise: 3 + hash(i, 13) * 5
    });
  }

  function drawEmbers(ctx, t) {
    for (const e of embers) {
      const y = (e.y - (t * e.rise) % (H + 40) + H + 40) % (H + 40);
      const x = e.x + Math.sin(t * e.sp + e.ph) * 4;
      const a = 0.28 + 0.35 * Math.sin(t * 1.6 + e.ph);
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = P.gold;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      ctx.globalAlpha = Math.max(0, a * 0.3);
      ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
      ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 3);
    }
    ctx.globalAlpha = 1;
  }

  function drawRift(ctx, t) {
    const x = spawn.x, y = 8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 1, x, y, 22);
    g.addColorStop(0, 'rgba(160,100,255,0.55)');
    g.addColorStop(1, 'rgba(120,60,220,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 22, y - 22, 44, 44);
    ctx.strokeStyle = 'rgba(200,160,255,0.75)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const a0 = t * (1.1 + i * 0.4) + i * 2.1;
      ctx.beginPath();
      ctx.arc(x, y, 6 + i * 3, a0, a0 + 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGateGlow(ctx, t) {
    const cx = gate.x;
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, H - 16, 2, cx, H - 16, 34 * pulse);
    g.addColorStop(0, 'rgba(255,190,90,0.35)');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 38, H - 50, 76, 50);
    ctx.restore();
  }

  function drawMist(ctx, t) {
    ctx.save();
    for (let layer = 0; layer < 2; layer++) {
      ctx.globalAlpha = layer === 0 ? 0.045 : 0.03;
      ctx.fillStyle = layer === 0 ? '#8fa6d8' : '#7d92c8';
      for (let i = 0; i < 4; i++) {
        const y = 30 + i * 74 + layer * 22 + Math.sin(t * 0.22 + i + layer) * 7;
        const x = ((t * (4 + i * 1.6 + layer * 2) + i * 70) % (W + 110)) - 55;
        ctx.beginPath();
        ctx.ellipse(x, y, 40 + layer * 10, 7 + layer * 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  GK.World = {
    spawn, gate, total, posAt,
    reset() { if (!baked) bakeStatic(); },
    bake() { bakeStatic(); },
    draw(ctx, t) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(staticCv, 0, 0);
      drawMist(ctx, t);
      drawRift(ctx, t);
      drawGateGlow(ctx, t);
      drawEmbers(ctx, t);
    }
  };
})();
