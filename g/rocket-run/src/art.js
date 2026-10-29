// Rocket Run — drawing. Own art; the reference frames only set the palette and the layering
// (navy industrial lab, green neon line, grey floor with hazard stripes, chunky pixel runner).

const TAU = Math.PI * 2;

function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ---------------------------------------------------------------- lab backdrop */

export function buildLab(W, H, DPR) {
  const TW = Math.max(300, Math.round(W * 0.75));
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(TW * DPR));
  c.height = Math.max(2, Math.round(H * DPR));
  const g = c.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);

  g.fillStyle = '#192f4e';
  g.fillRect(0, 0, TW, H);

  // wall panels
  const panelW = TW / 4;
  for (let i = 0; i < 4; i++) {
    const x0 = i * panelW;
    const grad = g.createLinearGradient(x0, 0, x0 + panelW, 0);
    grad.addColorStop(0, '#3f5f7e');
    grad.addColorStop(0.5, '#34506c');
    grad.addColorStop(1, '#29445f');
    g.fillStyle = grad;
    g.fillRect(x0 + 4, H * 0.06, panelW - 8, H * 0.84);
    g.strokeStyle = 'rgba(8,18,30,0.65)';
    g.lineWidth = 2;
    g.strokeRect(x0 + 4, H * 0.06, panelW - 8, H * 0.84);

    // rivets
    for (let k = 0; k < 8; k++) {
      const rx = x0 + 14 + (k % 4) * (panelW - 28) / 3;
      const ry = H * (0.10 + Math.floor(k / 4) * 0.72);
      g.fillStyle = 'rgba(185,194,193,0.35)';
      g.beginPath();
      g.arc(rx, ry, 2.2, 0, TAU);
      g.fill();
    }

    // vent slats
    if (i % 2 === 0) {
      const vy = H * (0.62 + hash(i) * 0.12);
      g.fillStyle = 'rgba(12,24,38,0.55)';
      g.fillRect(x0 + panelW * 0.18, vy, panelW * 0.5, H * 0.055);
      g.strokeStyle = 'rgba(120,140,160,0.18)';
      g.lineWidth = 1;
      for (let k = 1; k < 5; k++) {
        g.beginPath();
        g.moveTo(x0 + panelW * 0.18, vy + k * H * 0.011);
        g.lineTo(x0 + panelW * 0.68, vy + k * H * 0.011);
        g.stroke();
      }
    }

    // pipes
    g.strokeStyle = 'rgba(92,111,127,0.55)';
    g.lineWidth = Math.max(3, H * 0.008);
    g.beginPath();
    g.moveTo(x0 + panelW - 18, H * 0.10);
    g.lineTo(x0 + panelW - 18, H * 0.38);
    g.quadraticCurveTo(x0 + panelW - 18, H * 0.44, x0 + panelW - 40, H * 0.44);
    g.stroke();
    g.fillStyle = 'rgba(70,86,102,0.9)';
    g.fillRect(x0 + panelW - 24, H * 0.28, 12, H * 0.02);

    // orange wall light
    const lx = x0 + panelW * (0.25 + hash(i * 3.1) * 0.35);
    const ly = H * (0.16 + hash(i * 5.3) * 0.18);
    const lg = g.createRadialGradient(lx, ly, 0, lx, ly, H * 0.045);
    lg.addColorStop(0, 'rgba(255,200,130,0.95)');
    lg.addColorStop(0.4, 'rgba(255,150,60,0.35)');
    lg.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.arc(lx, ly, H * 0.045, 0, TAU);
    g.fill();
  }

  return { canvas: c, width: TW };
}

export function drawLab(ctx, lab, W, H, offset) {
  const tw = lab.width;
  let x = -(offset % tw);
  while (x < W) {
    ctx.drawImage(lab.canvas, x, 0, tw, H);
    x += tw;
  }
}

/* ---------------------------------------------------------------- floor + ceiling */

export function drawFloor(ctx, W, H, floorY, offset) {
  const h = H - floorY;
  const g = ctx.createLinearGradient(0, floorY, 0, floorY + h);
  g.addColorStop(0, '#859198');
  g.addColorStop(0.25, '#6f7d86');
  g.addColorStop(1, '#4b565f');
  ctx.fillStyle = g;
  ctx.fillRect(0, floorY, W, h);

  // top lip
  ctx.fillStyle = '#b9c2c1';
  ctx.fillRect(0, floorY, W, Math.max(2, H * 0.004));
  ctx.fillStyle = 'rgba(10,20,28,0.45)';
  ctx.fillRect(0, floorY + Math.max(2, H * 0.004), W, 2);

  // hazard stripes at the edge, scrolling with the world
  const stripeW = Math.max(16, W * 0.045);
  const sy = floorY + h * 0.26;
  const sh = Math.max(5, h * 0.22);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, sy, W, sh);
  ctx.clip();
  const shift = offset % (stripeW * 2);
  for (let x = -stripeW * 2 - shift; x < W + stripeW * 2; x += stripeW) {
    ctx.fillStyle = '#e0b52e';
    ctx.beginPath();
    ctx.moveTo(x, sy + sh);
    ctx.lineTo(x + stripeW * 0.55, sy);
    ctx.lineTo(x + stripeW * 1.05, sy);
    ctx.lineTo(x + stripeW * 0.5, sy + sh);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // floor seams
  ctx.strokeStyle = 'rgba(20,30,38,0.35)';
  ctx.lineWidth = 1;
  const seam = Math.max(60, W * 0.16);
  for (let x = -(offset % seam); x < W; x += seam) {
    ctx.beginPath();
    ctx.moveTo(x, floorY + h * 0.55);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
}

export function drawCeiling(ctx, W, H, ceilY, offset) {
  const g = ctx.createLinearGradient(0, 0, 0, ceilY);
  g.addColorStop(0, '#0d1826');
  g.addColorStop(1, '#233a52');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, ceilY);

  ctx.fillStyle = '#5c6f7f';
  ctx.fillRect(0, ceilY - Math.max(2, H * 0.004), W, Math.max(2, H * 0.004));
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, ceilY, W, 2);

  // strip lights
  const lamp = Math.max(90, W * 0.22);
  const shift = offset % lamp;
  for (let x = -lamp - shift; x < W + lamp; x += lamp) {
    const lg = ctx.createLinearGradient(x, ceilY - H * 0.012, x, ceilY);
    lg.addColorStop(0, 'rgba(150,200,255,0)');
    lg.addColorStop(1, 'rgba(180,220,255,0.30)');
    ctx.fillStyle = lg;
    ctx.fillRect(x + lamp * 0.2, ceilY - H * 0.012, lamp * 0.5, H * 0.012);
  }
}

/* ---------------------------------------------------------------- runner */

export function drawRunner(ctx, x, y, r, thrust, t) {
  const u = Math.max(1.5, r * 0.085);      // pixel unit
  const OL = '#08111c';

  function block(px, py, pw, ph, color) {
    ctx.fillStyle = OL;
    ctx.fillRect(px - u * 0.7, py - u * 0.7, pw + u * 1.4, ph + u * 1.4);
    ctx.fillStyle = color;
    ctx.fillRect(px, py, pw, ph);
  }

  ctx.save();
  ctx.translate(x, y);

  // warm halo lifts the runner off the blue wall
  const hg = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 3.1);
  hg.addColorStop(0, 'rgba(255,214,160,0.20)');
  hg.addColorStop(0.6, 'rgba(255,190,120,0.08)');
  hg.addColorStop(1, 'rgba(255,180,100,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, 0, r * 3.1, 0, TAU);
  ctx.fill();

  // exhaust
  if (thrust) {
    const flick = 0.75 + 0.25 * Math.sin(t * 30);
    const len = u * (11 + flick * 5);
    const fg = ctx.createLinearGradient(-u * 7, 0, -u * 7 - len, 0);
    fg.addColorStop(0, 'rgba(255,248,210,0.95)');
    fg.addColorStop(0.3, 'rgba(255,170,60,0.92)');
    fg.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-u * 7, -u * 2.6);
    ctx.lineTo(-u * 7 - len, -u * 0.4);
    ctx.lineTo(-u * 7, u * 2.6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,190,90,' + (0.55 * flick).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(-u * 7.4, 0, u * 4.2, 0, TAU);
    ctx.fill();
  }

  // jetpack
  block(-u * 8.6, -u * 8.4, u * 4.4, u * 11.6, '#6f7d86');
  ctx.fillStyle = '#94a3ad';
  ctx.fillRect(-u * 8.0, -u * 7.6, u * 1.2, u * 10);
  block(-u * 7.6, -u * 6.6, u * 2.6, u * 5.6, '#a65612');
  ctx.fillStyle = '#de7a2a';
  ctx.fillRect(-u * 7.2, -u * 6.0, u * 1.0, u * 4.4);
  block(-u * 6.6, -u * 9.0, u * 2.0, u * 1.6, '#3c4854');

  // legs
  block(-u * 2.8, u * 3.0, u * 3.2, u * 5.4, '#2b3440');
  block(u * 0.8, u * 3.2, u * 3.2, u * 5.4, '#2b3440');
  // boots
  block(-u * 3.2, u * 7.8, u * 4.2, u * 2.0, '#161d26');
  block(u * 0.6, u * 8.0, u * 4.2, u * 2.0, '#161d26');
  ctx.fillStyle = '#4a5664';
  ctx.fillRect(-u * 3.0, u * 7.0, u * 3.6, u * 0.9);
  ctx.fillRect(u * 0.8, u * 7.2, u * 3.6, u * 0.9);

  // torso
  block(-u * 3.2, -u * 6.4, u * 8.4, u * 9.4, '#2f7fd0');
  ctx.fillStyle = '#1f5ea6';               // shaded right side
  ctx.fillRect(u * 2.6, -u * 6.4, u * 2.6, u * 9.4);
  ctx.fillStyle = '#3a7fd0';               // lit left edge
  ctx.fillRect(-u * 3.2, -u * 6.4, u * 1.4, u * 9.4);
  // belt + strap
  ctx.fillStyle = '#1a2b3d';
  ctx.fillRect(-u * 3.2, u * 0.6, u * 8.4, u * 1.8);
  ctx.strokeStyle = '#2f4256';
  ctx.lineWidth = u * 1.0;
  ctx.beginPath();
  ctx.moveTo(-u * 2.6, -u * 6.2);
  ctx.lineTo(u * 3.6, u * 1.6);
  ctx.stroke();
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(-u * 2.4, u * 0.8, u * 1.4, u * 1.4);

  // arm
  block(u * 4.2, -u * 4.8, u * 2.8, u * 5.6, '#e0a878');
  block(u * 4.4, u * 0.2, u * 2.6, u * 2.0, '#c98f62');

  // head
  block(-u * 2.2, -u * 14.0, u * 7.8, u * 7.4, '#f0c09a');
  ctx.fillStyle = '#d8a075';               // jaw shade
  ctx.fillRect(-u * 0.4, -u * 8.2, u * 6.0, u * 1.8);

  // hair with a lit edge
  ctx.fillStyle = '#6b3f22';
  ctx.fillRect(-u * 2.4, -u * 15.2, u * 8.2, u * 3.4);
  ctx.fillRect(-u * 3.4, -u * 13.8, u * 1.6, u * 3.6);
  ctx.fillStyle = '#8d5a34';
  ctx.fillRect(-u * 2.2, -u * 15.0, u * 3.0, u * 1.2);

  // goggles
  ctx.fillStyle = OL;
  ctx.fillRect(-u * 1.4, -u * 12.2, u * 7.0, u * 3.0);
  ctx.fillStyle = '#7fd8ff';
  ctx.fillRect(-u * 0.8, -u * 11.7, u * 2.3, u * 1.8);
  ctx.fillRect(u * 2.5, -u * 11.7, u * 2.3, u * 1.8);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-u * 0.6, -u * 11.5, u * 0.9, u * 0.8);
  ctx.fillRect(u * 2.7, -u * 11.5, u * 0.9, u * 0.8);
  // strap
  ctx.fillStyle = '#1a2432';
  ctx.fillRect(-u * 3.4, -u * 11.4, u * 2.0, u * 0.9);

  // mouth
  ctx.fillStyle = '#9a5a42';
  ctx.fillRect(u * 1.4, -u * 8.8, u * 2.2, u * 1.0);

  ctx.restore();
}

/* ---------------------------------------------------------------- hazards */

export function drawLaser(ctx, sx, h, H, floorY, ceilY, t) {
  const w = h.w;
  const flick = 0.82 + 0.18 * Math.sin(t * 14 + h.phase);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const beam = (y0, y1) => {
    if (y1 <= y0) return;
    ctx.fillStyle = 'rgba(255,140,40,' + (0.16 * flick).toFixed(3) + ')';
    ctx.fillRect(sx - w * 3.2, y0, w * 6.4, y1 - y0);
    ctx.fillStyle = 'rgba(255,170,60,' + (0.55 * flick).toFixed(3) + ')';
    ctx.fillRect(sx - w * 1.2, y0, w * 2.4, y1 - y0);
    ctx.fillStyle = 'rgba(255,245,220,' + (0.92 * flick).toFixed(3) + ')';
    ctx.fillRect(sx - w * 0.36, y0, w * 0.72, y1 - y0);
  };
  beam(ceilY, h.gapTop);
  beam(h.gapBottom, floorY);

  // emitter posts at the gap lips
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#5c6f7f';
  ctx.fillRect(sx - w * 1.5, h.gapTop - H * 0.014, w * 3, H * 0.014);
  ctx.fillRect(sx - w * 1.5, h.gapBottom, w * 3, H * 0.014);
  ctx.fillStyle = '#ffb347';
  ctx.fillRect(sx - w * 0.7, h.gapTop - H * 0.006, w * 1.4, H * 0.006);
  ctx.fillRect(sx - w * 0.7, h.gapBottom, w * 1.4, H * 0.006);
  ctx.restore();
}

export function drawSaw(ctx, sx, h, t) {
  ctx.save();
  ctx.translate(sx, h.y);
  ctx.rotate(h.rot);

  const r = h.r;
  ctx.fillStyle = '#859198';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const a2 = a + TAU / 24;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a2) * r * 1.18, Math.sin(a2) * r * 1.18);
  }
  ctx.closePath();
  ctx.fill();

  const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#d6dde2');
  g.addColorStop(0.6, '#9aa6b0');
  g.addColorStop(1, '#5c6f7f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.98, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = 'rgba(30,42,54,0.55)';
  ctx.lineWidth = r * 0.06;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(i * TAU / 6) * r * 0.8, Math.sin(i * TAU / 6) * r * 0.8);
    ctx.stroke();
  }

  ctx.fillStyle = '#2b3440';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#b9c2c1';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.10, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawBot(ctx, sx, h, t) {
  const bob = Math.sin(t * 6 + h.step) * h.h * 0.02;
  ctx.save();
  ctx.translate(sx, h.y + bob);

  // legs
  ctx.fillStyle = '#859198';
  ctx.fillRect(-h.w * 0.34, h.h * 0.72, h.w * 0.16, h.h * 0.28);
  ctx.fillRect(h.w * 0.18, h.h * 0.72, h.w * 0.16, h.h * 0.28);

  // body
  ctx.fillStyle = '#e9eef2';
  ctx.beginPath();
  ctx.roundRect(-h.w * 0.5, 0, h.w, h.h * 0.78, h.w * 0.16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,140,160,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // chest light
  ctx.fillStyle = '#2b3440';
  ctx.fillRect(-h.w * 0.2, h.h * 0.22, h.w * 0.4, h.h * 0.18);

  // eye
  const ey = h.h * 0.16;
  const eg = ctx.createRadialGradient(0, ey, 0, 0, ey, h.w * 0.28);
  eg.addColorStop(0, 'rgba(255,90,70,0.95)');
  eg.addColorStop(1, 'rgba(255,60,40,0)');
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.arc(0, ey, h.w * 0.28, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ff4b3a';
  ctx.beginPath();
  ctx.arc(0, ey, h.w * 0.12, 0, TAU);
  ctx.fill();

  // antenna
  ctx.strokeStyle = '#859198';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h.h * 0.02);
  ctx.lineTo(0, -h.h * 0.14);
  ctx.stroke();
  ctx.fillStyle = Math.sin(t * 8 + h.step) > 0 ? '#ff6a52' : '#7a2e26';
  ctx.beginPath();
  ctx.arc(0, -h.h * 0.15, h.w * 0.07, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawMissile(ctx, sx, h, H, t, W) {
  if (h.warn > 0) {
    // warning marker is pinned to the right edge while the warning runs, so it is
    // always visible on a short landscape screen (playtest: it used to be off-screen)
    const mx = Math.min(sx, (W || 390) - h.r * 3.2);
    const pulse = 0.55 + 0.45 * Math.sin(t * 22);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = '#ff5a3c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mx, h.y, h.r * 2.2, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.moveTo(mx - h.r * 1.4, h.y);
    ctx.lineTo(mx + h.r * 0.4, h.y - h.r);
    ctx.lineTo(mx + h.r * 0.4, h.y + h.r);
    ctx.closePath();
    ctx.fill();
    // arrow at the edge points at the incoming missile
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(W - 4, h.y - h.r * 0.8);
    ctx.lineTo(W - h.r * 1.6, h.y);
    ctx.lineTo(W - 4, h.y + h.r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(sx, h.y);
  const ang = Math.atan2(stateTilt(h), h.vx);
  ctx.rotate(ang);

  // flame
  const fg = ctx.createLinearGradient(h.r * 1.1, 0, h.r * 3.2, 0);
  fg.addColorStop(0, 'rgba(255,190,90,0.9)');
  fg.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(h.r * 1.0, -h.r * 0.5);
  ctx.lineTo(h.r * 3.2, 0);
  ctx.lineTo(h.r * 1.0, h.r * 0.5);
  ctx.closePath();
  ctx.fill();

  // body
  ctx.fillStyle = '#b9c2c1';
  ctx.beginPath();
  ctx.roundRect(-h.r * 1.6, -h.r * 0.62, h.r * 2.6, h.r * 1.24, h.r * 0.3);
  ctx.fill();
  ctx.fillStyle = '#ff4b3a';
  ctx.beginPath();
  ctx.moveTo(-h.r * 1.6, -h.r * 0.62);
  ctx.lineTo(-h.r * 2.5, 0);
  ctx.lineTo(-h.r * 1.6, h.r * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(40,60,80,0.45)';
  ctx.fillRect(-h.r * 0.9, -h.r * 0.28, h.r * 1.4, h.r * 0.56);
  ctx.restore();
}

function stateTilt(h) {
  return h.vy || 0;
}

/* ---------------------------------------------------------------- pickups + fx */

const coinCache = new Map();

function coinSprite(r, dpr) {
  const key = Math.round(r) + '|' + dpr.toFixed(2);
  let c = coinCache.get(key);
  if (c) return c;
  const pad = r * 1.35;
  c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(pad * 2 * dpr));
  c.height = Math.max(2, Math.round(pad * 2 * dpr));
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.translate(pad, pad);
  const grad = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  grad.addColorStop(0, '#fff0b0');
  grad.addColorStop(0.5, '#f2c14e');
  grad.addColorStop(1, '#b8862a');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(255,246,200,0.8)';
  g.lineWidth = Math.max(1, r * 0.12);
  g.beginPath();
  g.arc(0, 0, r * 0.66, 0, TAU);
  g.stroke();
  g.fillStyle = 'rgba(255,255,240,0.85)';
  g.beginPath();
  g.ellipse(-r * 0.28, -r * 0.3, r * 0.22, r * 0.12, -0.5, 0, TAU);
  g.fill();
  coinCache.set(key, c);
  return c;
}

export function drawCoin(ctx, sx, c, t, dpr) {
  const bob = Math.sin(t * 4 + c.phase) * 2;
  const sp = coinSprite(c.r, dpr || 1.3);
  const size = c.r * 2.7;
  ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 3 + c.phase);
  ctx.drawImage(sp, sx - size / 2, c.y + bob - size / 2, size, size);
  ctx.globalAlpha = 1;
}

export function drawParticles(ctx, particles) {
  for (const q of particles) {
    const k = q.age / q.life;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.r * (1 - 0.4 * k), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawSpeedLines(ctx, W, H, speedRatio, t, offset) {
  if (speedRatio < 0.25) return;
  ctx.save();
  ctx.globalAlpha = 0.05 + 0.10 * speedRatio;
  ctx.strokeStyle = '#dff2ff';
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const y = ((hash(i * 7.3) * H) + offset * (0.2 + hash(i) * 0.5)) % H;
    const len = W * (0.06 + hash(i * 3.1) * 0.16);
    const x = W - ((offset * (1 + hash(i) * 2) + hash(i * 11) * W) % (W + len));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawVignette(ctx, W, H) {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.30, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(3,8,14,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/* ---------------------------------------------------------------- cached layers
   The floor, the ceiling and the vignette never change shape, only their scroll offset.
   Baking them once cuts the per-frame gradient work from about eight fills to one blit each. */

export function buildFloorTile(H, floorY, DPR, W) {
  const stripeW = Math.max(16, W * 0.045);
  const TW = stripeW * 2;
  const h = H - floorY;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(TW * DPR));
  c.height = Math.max(2, Math.round(h * DPR));
  const g = c.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);

  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#859198');
  grad.addColorStop(0.25, '#6f7d86');
  grad.addColorStop(1, '#4b565f');
  g.fillStyle = grad;
  g.fillRect(0, 0, TW, h);

  g.fillStyle = '#b9c2c1';
  g.fillRect(0, 0, TW, Math.max(2, H * 0.004));
  g.fillStyle = 'rgba(10,20,28,0.45)';
  g.fillRect(0, Math.max(2, H * 0.004), TW, 2);

  const sy = h * 0.26;
  const sh = Math.max(5, h * 0.22);
  g.save();
  g.beginPath();
  g.rect(0, sy, TW, sh);
  g.clip();
  for (let x = -stripeW * 2; x < TW + stripeW * 2; x += stripeW) {
    g.fillStyle = '#e0b52e';
    g.beginPath();
    g.moveTo(x, sy + sh);
    g.lineTo(x + stripeW * 0.55, sy);
    g.lineTo(x + stripeW * 1.05, sy);
    g.lineTo(x + stripeW * 0.5, sy + sh);
    g.closePath();
    g.fill();
  }
  g.restore();

  return { canvas: c, width: TW, height: h };
}

export function drawFloorTile(ctx, tile, W, H, floorY, offset) {
  const tw = tile.width;
  let x = -(offset % tw);
  while (x < W) {
    ctx.drawImage(tile.canvas, x, floorY, tw, tile.height);
    x += tw;
  }
  // seams are one stroke each, cheaper than baking them into every tile
  ctx.strokeStyle = 'rgba(20,30,38,0.35)';
  ctx.lineWidth = 1;
  const seam = Math.max(60, W * 0.16);
  for (let sx = -(offset % seam); sx < W; sx += seam) {
    ctx.beginPath();
    ctx.moveTo(sx, floorY + (H - floorY) * 0.55);
    ctx.lineTo(sx, H);
    ctx.stroke();
  }
}

export function buildCeilingTile(H, ceilY, DPR, W) {
  const lamp = Math.max(90, W * 0.22);
  const TW = lamp;
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(TW * DPR));
  c.height = Math.max(2, Math.round(ceilY * DPR));
  const g = c.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);

  const grad = g.createLinearGradient(0, 0, 0, ceilY);
  grad.addColorStop(0, '#0d1826');
  grad.addColorStop(1, '#233a52');
  g.fillStyle = grad;
  g.fillRect(0, 0, TW, ceilY);

  const lg = g.createLinearGradient(0, ceilY - H * 0.012, 0, ceilY);
  lg.addColorStop(0, 'rgba(150,200,255,0)');
  lg.addColorStop(1, 'rgba(180,220,255,0.30)');
  g.fillStyle = lg;
  g.fillRect(TW * 0.2, ceilY - H * 0.012, TW * 0.5, H * 0.012);

  g.fillStyle = '#5c6f7f';
  g.fillRect(0, ceilY - Math.max(2, H * 0.004), TW, Math.max(2, H * 0.004));
  return { canvas: c, width: TW, height: ceilY };
}

export function drawCeilingTile(ctx, tile, W, offset) {
  const tw = tile.width;
  let x = -(offset % tw);
  while (x < W) {
    ctx.drawImage(tile.canvas, x, 0, tw, tile.height);
    x += tw;
  }
}

export function buildVignette(W, H, DPR) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(W * DPR));
  c.height = Math.max(2, Math.round(H * DPR));
  const g = c.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const vg = g.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.30, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(3,8,14,0.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  return c;
}

/* ---------------------------------------------------------------- far parallax */

export function buildFar(W, H, DPR) {
  const TW = Math.max(280, Math.round(W * 0.8));
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(TW * DPR));
  c.height = Math.max(2, Math.round(H * DPR));
  const g = c.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);

  // structural girders
  for (let i = 0; i < 3; i++) {
    const x = TW * (0.12 + i * 0.34);
    g.fillStyle = 'rgba(7,15,26,0.85)';
    g.fillRect(x, H * 0.06, TW * 0.035, H * 0.84);
    g.fillStyle = 'rgba(40,58,78,0.35)';
    g.fillRect(x + TW * 0.035, H * 0.06, 2, H * 0.84);
  }

  // diagonal braces
  g.strokeStyle = 'rgba(6,13,22,0.75)';
  g.lineWidth = Math.max(5, H * 0.010);
  for (let i = 0; i < 2; i++) {
    const x0 = TW * (0.2 + i * 0.42);
    g.beginPath();
    g.moveTo(x0, H * 0.16);
    g.lineTo(x0 + TW * 0.22, H * 0.46);
    g.moveTo(x0 + TW * 0.22, H * 0.46);
    g.lineTo(x0, H * 0.76);
    g.stroke();
  }

  // catwalk
  g.fillStyle = 'rgba(9,20,34,0.9)';
  g.fillRect(0, H * 0.50, TW, Math.max(5, H * 0.008));
  g.strokeStyle = 'rgba(30,48,68,0.5)';
  g.lineWidth = 1.5;
  for (let x = 0; x < TW; x += TW * 0.08) {
    g.beginPath();
    g.moveTo(x, H * 0.50);
    g.lineTo(x, H * 0.455);
    g.stroke();
  }
  g.fillStyle = 'rgba(9,20,34,0.8)';
  g.fillRect(0, H * 0.452, TW, 2);

  // lit windows deep in the lab
  for (let i = 0; i < 4; i++) {
    const wx = TW * (0.06 + i * 0.24);
    const wy = H * (0.20 + hash(i * 3.7) * 0.22);
    const ww = TW * 0.05, wh = H * 0.035;
    g.fillStyle = 'rgba(255,180,90,0.18)';
    g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    g.fillStyle = 'rgba(255,210,140,0.55)';
    g.fillRect(wx, wy, ww, wh);
  }

  // hanging cables
  g.strokeStyle = 'rgba(5,12,20,0.7)';
  g.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const cx = TW * (0.1 + i * 0.3);
    g.beginPath();
    g.moveTo(cx, H * 0.06);
    g.quadraticCurveTo(cx + TW * 0.05, H * 0.22, cx + TW * 0.02, H * 0.34);
    g.stroke();
  }

  return { canvas: c, width: TW };
}

export function drawFar(ctx, far, W, H, offset) {
  const tw = far.width;
  let x = -(offset % tw);
  while (x < W) {
    ctx.drawImage(far.canvas, x, 0, tw, H);
    x += tw;
  }
}

// drawn AFTER the ceiling tile, just above the play band, so it is actually visible
export function drawNeon(ctx, W, H, y) {
  const ng = ctx.createLinearGradient(0, y - 5, 0, y + 5);
  ng.addColorStop(0, 'rgba(80,240,150,0)');
  ng.addColorStop(0.5, 'rgba(90,255,160,0.75)');
  ng.addColorStop(1, 'rgba(80,240,150,0)');
  ctx.fillStyle = ng;
  ctx.fillRect(0, y - 5, W, 10);
  ctx.fillStyle = 'rgba(190,255,220,0.85)';
  ctx.fillRect(0, y - 1, W, 2);
}
