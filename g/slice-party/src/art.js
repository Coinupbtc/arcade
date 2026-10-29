// Slice Party — all drawing. Own vector art; the reference frames only guide the look
// (warm wood dojo, saturated fruit, white blade, juice stains), never copy a pixel.

const TAU = Math.PI * 2;

function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function shine(ctx, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha == null ? 0.20 : alpha;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.33, -r * 0.42, r * 0.27, r * 0.18, -0.6, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------------- background */

export function buildBackground(W, H, DPR) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(W * DPR));
  c.height = Math.max(1, Math.round(H * DPR));
  const g = c.getContext('2d');
  g.scale(DPR, DPR);

  g.fillStyle = '#331a07';
  g.fillRect(0, 0, W, H);

  const cols = ['#764015', '#643411', '#562d0f', '#49260c', '#6b3a12', '#5d300d'];
  const planks = Math.max(5, Math.round(W / 120));

  // uneven plank widths read as sawn timber instead of a tiled wallpaper
  const widths = [];
  let sum = 0;
  for (let i = 0; i < planks; i++) {
    const wgt = 0.72 + hash(i * 13.7) * 0.62;
    widths.push(wgt);
    sum += wgt;
  }
  let cursor = 0;

  for (let i = 0; i < planks; i++) {
    const pw = (widths[i] / sum) * W;
    const x0 = cursor;
    cursor += pw;
    const base = cols[i % cols.length];
    const grad = g.createLinearGradient(x0, 0, x0 + pw, 0);
    grad.addColorStop(0, shade(base, 1.14));
    grad.addColorStop(0.55, base);
    grad.addColorStop(1, shade(base, 0.7));
    g.fillStyle = grad;
    g.fillRect(x0, 0, pw + 1, H);

    // grain
    for (let k = 0; k < 10; k++) {
      const gy = hash(i * 31 + k) * H * 1.1 - H * 0.05;
      g.strokeStyle = 'rgba(20,8,2,' + (0.08 + hash(i * 7 + k) * 0.16).toFixed(3) + ')';
      g.lineWidth = 1 + hash(i + k * 3) * 1.5;
      const xa = x0 + pw * (0.14 + hash(i * 13 + k) * 0.72);
      g.beginPath();
      g.moveTo(xa, gy);
      g.bezierCurveTo(xa + pw * 0.05, gy + H * 0.04, xa - pw * 0.04, gy + H * 0.07, xa + pw * 0.02, gy + H * 0.12);
      g.stroke();
    }

    // knots
    if (hash(i * 5 + 1) > 0.42) {
      const kx = x0 + pw * (0.25 + hash(i) * 0.5);
      const ky = H * (0.12 + hash(i * 3) * 0.76);
      g.fillStyle = 'rgba(24,10,3,0.5)';
      g.beginPath();
      g.ellipse(kx, ky, pw * 0.07, pw * 0.12, hash(i) * 3, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(120,70,30,0.30)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(kx, ky, pw * 0.12, pw * 0.19, hash(i) * 3, 0, TAU);
      g.stroke();
    }

    // plank seams
    g.strokeStyle = 'rgba(15,6,1,0.78)';
    g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(x0 + pw, 0); g.lineTo(x0 + pw, H); g.stroke();
    g.strokeStyle = 'rgba(150,92,44,0.18)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0 + pw - 2.5, 0); g.lineTo(x0 + pw - 2.5, H); g.stroke();

    // horizontal grain: short broken fibres across the plank
    for (let k = 0; k < 14; k++) {
      const gy = H * hash(i * 41 + k * 3.3);
      const gx = x0 + pw * hash(i * 17 + k * 5.1);
      const wlen = pw * (0.12 + hash(i * 23 + k) * 0.5);
      g.strokeStyle = 'rgba(28,12,4,' + (0.06 + hash(i * 29 + k) * 0.14).toFixed(3) + ')';
      g.lineWidth = 0.8 + hash(k + i) * 1.4;
      g.beginPath();
      g.moveTo(gx, gy);
      g.quadraticCurveTo(gx + wlen * 0.5, gy + (hash(k * 3.1) - 0.5) * 3, gx + wlen, gy);
      g.stroke();
    }

    // cracks
    if (hash(i * 11 + 2) > 0.58) {
      g.strokeStyle = 'rgba(12,5,1,0.65)';
      g.lineWidth = 1.5;
      let cx = x0 + pw * (0.2 + hash(i * 17) * 0.6);
      let cy = H * hash(i * 19);
      g.beginPath(); g.moveTo(cx, cy);
      for (let s = 0; s < 4; s++) {
        cx += (hash(i * 23 + s) - 0.5) * pw * 0.35;
        cy += H * (0.04 + hash(i * 29 + s) * 0.05);
        g.lineTo(cx, cy);
      }
      g.stroke();
    }
  }

  // horizontal binding beams break the vertical repetition
  for (const fy of [0.155, 0.625, 0.875]) {
    const y = H * fy;
    const bh = Math.max(9, H * 0.014);
    const bg2 = g.createLinearGradient(0, y, 0, y + bh);
    bg2.addColorStop(0, '#8a5a2a');
    bg2.addColorStop(0.45, '#5a3410');
    bg2.addColorStop(1, '#2a1404');
    g.fillStyle = bg2;
    g.fillRect(0, y, W, bh);
    g.fillStyle = 'rgba(0,0,0,0.38)';
    g.fillRect(0, y + bh, W, 3);
    g.fillStyle = 'rgba(255,214,160,0.07)';
    g.fillRect(0, y - 1, W, 1);
    for (let bx = W * 0.07; bx < W; bx += W * 0.185) {
      g.fillStyle = 'rgba(18,9,3,0.55)';
      g.beginPath();
      g.arc(bx, y + bh * 0.5, Math.max(1.6, bh * 0.17), 0, TAU);
      g.fill();
    }
  }

  // deep shade at the top and bottom edges, so the middle reads as lit
  const topShade = g.createLinearGradient(0, 0, 0, H * 0.30);
  topShade.addColorStop(0, 'rgba(4,1,0,0.55)');
  topShade.addColorStop(1, 'rgba(4,1,0,0)');
  g.fillStyle = topShade;
  g.fillRect(0, 0, W, H * 0.30);

  // warm key light from above centre
  const key = g.createRadialGradient(W * 0.5, H * 0.28, 0, W * 0.5, H * 0.28, Math.max(W, H) * 0.72);
  key.addColorStop(0, 'rgba(255,196,120,0.10)');
  key.addColorStop(1, 'rgba(255,196,120,0)');
  g.fillStyle = key;
  g.fillRect(0, 0, W, H);

  // vignette keeps the fruit the brightest thing on screen
  const vg = g.createRadialGradient(W * 0.5, H * 0.44, Math.min(W, H) * 0.24, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.7, 'rgba(10,4,0,0.18)');
  vg.addColorStop(1, 'rgba(6,2,0,0.62)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  return c;
}

/* ---------------------------------------------------------------- whole fruit */

export function drawWhole(ctx, type, r, t) {
  // soft contact shadow: gives the fruit weight against the wood
  const shg = ctx.createRadialGradient(r * 0.12, r * 0.2, r * 0.25, r * 0.12, r * 0.2, r * 1.3);
  shg.addColorStop(0, 'rgba(0,0,0,0.40)');
  shg.addColorStop(0.72, 'rgba(0,0,0,0.13)');
  shg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shg;
  ctx.beginPath();
  ctx.arc(r * 0.12, r * 0.2, r * 1.3, 0, TAU);
  ctx.fill();

  drawWholeBody(ctx, type, r, t);
  drawVolume(ctx, type, r);
}

function drawVolume(ctx, type, r) {
  if (!CIRCLES.includes(type)) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.02, 0, TAU);
  ctx.clip();

  // rim light, upper left
  ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createLinearGradient(-r * 0.8, -r * 0.8, r * 0.3, r * 0.4);
  lg.addColorStop(0, 'rgba(255,255,255,0.30)');
  lg.addColorStop(0.55, 'rgba(255,255,255,0)');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.04, 0, TAU);
  ctx.fill();

  // rim shade, lower right
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth = r * 0.13;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.96, 0.42, 2.30);
  ctx.stroke();

  // dark edge keeps the fruit separate from the wood
  ctx.strokeStyle = 'rgba(18,8,2,0.42)';
  ctx.lineWidth = r * 0.035;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.0, 0, TAU);
  ctx.stroke();
  ctx.restore();

  shine(ctx, r, 0.32);
}

const CIRCLES = ['watermelon', 'orange', 'lime', 'kiwi'];

function drawWholeBody(ctx, type, r, t) {
  switch (type) {
    case 'watermelon': {
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.05, 0, 0, r * 1.2);
      g.addColorStop(0, '#5cb85f');
      g.addColorStop(0.45, '#2f8f45');
      g.addColorStop(1, '#14512a');
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.05, r * 0.98, 0, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = 'rgba(10,55,25,0.82)';
      ctx.lineWidth = r * 0.1;
      ctx.lineCap = 'round';
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(k * r * 0.33, -r * 0.88);
        ctx.quadraticCurveTo(k * r * 0.66, 0, k * r * 0.33, r * 0.88);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#4a3a1e';
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.99, r * 0.075, r * 0.05, 0, 0, TAU);
      ctx.fill();
      shine(ctx, r, 0.14);
      break;
    }
    case 'orange': {
      const g = ctx.createRadialGradient(-r * 0.32, -r * 0.4, r * 0.06, 0, 0, r * 1.15);
      g.addColorStop(0, '#ffd58a');
      g.addColorStop(0.5, '#f7922a');
      g.addColorStop(1, '#c85b0c');
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.fillStyle = 'rgba(150,66,8,0.30)';
      for (let i = 0; i < 26; i++) {
        const a = hash(i * 3.1) * TAU;
        const d = Math.sqrt(hash(i * 7.7)) * r * 0.88;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.025, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      // stem + leaf
      ctx.fillStyle = '#6b4a20';
      ctx.beginPath();
      ctx.ellipse(r * 0.04, -r * 0.94, r * 0.05, r * 0.08, 0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3f8a33';
      ctx.beginPath();
      ctx.ellipse(r * 0.3, -r * 1.0, r * 0.22, r * 0.10, -0.5, 0, TAU);
      ctx.fill();
      shine(ctx, r, 0.24);
      break;
    }
    case 'lemon': {
      const rx = r * 1.14, ry = r * 0.8;
      const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.4, r * 0.05, 0, 0, rx * 1.05);
      g.addColorStop(0, '#fff3a8');
      g.addColorStop(0.55, '#f5d43f');
      g.addColorStop(1, '#cfa31a');
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, -0.18, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = '#e6c93c';
      ctx.beginPath(); ctx.arc(rx * 0.94, -ry * 0.3, r * 0.07, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(-rx * 0.94, ry * 0.3, r * 0.06, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(190,150,20,0.28)';
      for (let i = 0; i < 14; i++) {
        ctx.beginPath();
        ctx.arc((hash(i * 2.3) - 0.5) * rx * 1.4, (hash(i * 5.9) - 0.5) * ry * 1.4, r * 0.022, 0, TAU);
        ctx.fill();
      }
      shine(ctx, r, 0.22);
      break;
    }
    case 'lime': {
      const rr = r * 0.92;
      const g = ctx.createRadialGradient(-rr * 0.3, -rr * 0.4, rr * 0.05, 0, 0, rr * 1.2);
      g.addColorStop(0, '#d2f58a');
      g.addColorStop(0.5, '#7ec33a');
      g.addColorStop(1, '#3f7a1b');
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = 'rgba(60,110,20,0.30)';
      for (let i = 0; i < 20; i++) {
        const a = hash(i * 4.7) * TAU;
        const d = Math.sqrt(hash(i * 9.1)) * rr * 0.85;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, rr * 0.026, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#5d7a2a';
      ctx.beginPath();
      ctx.ellipse(-rr * 0.05, -rr * 0.98, rr * 0.05, rr * 0.07, 0, 0, TAU);
      ctx.fill();
      shine(ctx, rr, 0.24);
      break;
    }
    case 'kiwi': {
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.06, 0, 0, r * 1.15);
      g.addColorStop(0, '#b08355');
      g.addColorStop(0.5, '#7a5230');
      g.addColorStop(1, '#4a2f18');
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(210,180,140,0.35)';
      ctx.lineWidth = r * 0.02;
      for (let i = 0; i < 34; i++) {
        const a = hash(i * 6.1) * TAU;
        const d = r * (0.72 + hash(i * 2.7) * 0.26);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
        ctx.lineTo(Math.cos(a) * d * 1.08, Math.sin(a) * d * 1.08);
        ctx.stroke();
      }
      shine(ctx, r, 0.10);
      break;
    }
    case 'banana': {
      const g = ctx.createLinearGradient(0, -r, 0, r * 0.6);
      g.addColorStop(0, '#ffe97a');
      g.addColorStop(0.6, '#f3c62c');
      g.addColorStop(1, '#d69d16');
      ctx.beginPath();
      ctx.moveTo(-r * 0.95, r * 0.36);
      ctx.bezierCurveTo(-r * 0.5, -r * 1.02, r * 0.5, -r * 1.02, r * 0.95, r * 0.26);
      ctx.bezierCurveTo(r * 0.45, -r * 0.12, -r * 0.45, -r * 0.12, -r * 0.95, r * 0.36);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,110,10,0.5)';
      ctx.lineWidth = r * 0.04;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,220,0.35)';
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, r * 0.16);
      ctx.quadraticCurveTo(0, -r * 0.72, r * 0.7, r * 0.06);
      ctx.stroke();
      ctx.fillStyle = '#7a5a22';
      ctx.beginPath(); ctx.arc(-r * 0.95, r * 0.34, r * 0.07, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.95, r * 0.24, r * 0.07, 0, TAU); ctx.fill();
      break;
    }
    case 'strawberry': {
      const g = ctx.createRadialGradient(-r * 0.25, -r * 0.4, r * 0.05, 0, 0, r * 1.2);
      g.addColorStop(0, '#ff7a86');
      g.addColorStop(0.5, '#e8324b');
      g.addColorStop(1, '#b01530');
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 1.0, -r * 0.72, r * 0.92, r * 0.62, 0, r * 1.05);
      ctx.bezierCurveTo(-r * 0.92, r * 0.62, -r * 1.0, -r * 0.72, 0, -r);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = '#ffe9a6';
      for (let i = 0; i < 13; i++) {
        const x = (hash(i * 3.7) - 0.5) * r * 1.4;
        const y = (hash(i * 8.3) - 0.4) * r * 1.5;
        if (Math.hypot(x / (r * 0.9), y / (r * 1.0)) < 0.9) {
          ctx.beginPath();
          ctx.ellipse(x, y, r * 0.035, r * 0.055, 0.3, 0, TAU);
          ctx.fill();
        }
      }
      // calyx
      ctx.fillStyle = '#3d8a2c';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(i * r * 0.24, -r * 0.92 - Math.abs(i) * r * 0.05, r * 0.15, r * 0.07, i * 0.4, 0, TAU);
        ctx.fill();
      }
      shine(ctx, r, 0.20);
      break;
    }
    case 'pineapple': {
      const rx = r * 0.78, ry = r * 1.0;
      const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.4, r * 0.05, 0, 0, ry * 1.1);
      g.addColorStop(0, '#f0bd4e');
      g.addColorStop(0.55, '#c78f28');
      g.addColorStop(1, '#8a5614');
      ctx.beginPath();
      ctx.ellipse(0, r * 0.06, rx, ry * 0.94, 0, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, r * 0.06, rx, ry * 0.94, 0, 0, TAU);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,226,150,0.30)';
      ctx.lineWidth = r * 0.045;
      for (let k = -6; k <= 6; k++) {
        ctx.beginPath();
        ctx.moveTo(-rx, k * r * 0.26);
        ctx.lineTo(rx, k * r * 0.26 + r * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-rx, k * r * 0.26 + r * 0.5);
        ctx.lineTo(rx, k * r * 0.26);
        ctx.stroke();
      }
      ctx.restore();
      // crown
      for (let i = -3; i <= 3; i++) {
        ctx.fillStyle = i % 2 ? '#4f9a34' : '#3f822a';
        ctx.beginPath();
        ctx.moveTo(i * r * 0.12, -ry * 0.9);
        ctx.lineTo(i * r * 0.26, -ry * 1.28 - Math.abs(i) * r * 0.03);
        ctx.lineTo(i * r * 0.12 + r * 0.14, -ry * 0.92);
        ctx.closePath();
        ctx.fill();
      }
      shine(ctx, r, 0.12);
      break;
    }
  }
}

/* ---------------------------------------------------------------- halves */

const FLESH = {
  watermelon: { flesh: '#ef3b52', light: '#ff7d8c', dark: '#b81f3a', rind: '#2f7d32', inner: '#e9f4d8' },
  orange: { flesh: '#ffb445', light: '#ffd98a', dark: '#e07d10', rind: '#f7922a', inner: '#ffe9c0' },
  lemon: { flesh: '#ffec90', light: '#fffbd0', dark: '#e2bc30', rind: '#f5d43f', inner: '#fffbe0' },
  lime: { flesh: '#d8f58e', light: '#edffc0', dark: '#a4cf3f', rind: '#6fae2e', inner: '#f4ffd8' },
  kiwi: { flesh: '#b6dc5c', light: '#d7ee94', dark: '#7fae2c', rind: '#7a5230', inner: '#f1f8cf' },
  banana: { flesh: '#fff3c4', light: '#fffbe2', dark: '#e9d089', rind: '#f3c62c', inner: '#fff8d8' },
  strawberry: { flesh: '#ff5a6e', light: '#ff96a2', dark: '#c92a45', rind: '#d92b3f', inner: '#ffd2d8' },
  pineapple: { flesh: '#ffe27a', light: '#fff3bd', dark: '#e2b03a', rind: '#b9862a', inner: '#fff0c0' },
};

export function drawHalf(ctx, type, r, side) {
  const pal = FLESH[type] || FLESH.orange;
  const a0 = side > 0 ? Math.PI : 0;
  const a1 = side > 0 ? TAU : Math.PI;

  ctx.beginPath();
  ctx.arc(0, 0, r, a0, a1);
  ctx.closePath();
  const g = ctx.createRadialGradient(0, side * -r * 0.35, r * 0.05, 0, 0, r * 1.12);
  g.addColorStop(0, pal.light);
  g.addColorStop(0.55, pal.flesh);
  g.addColorStop(1, pal.dark);
  ctx.fillStyle = g;
  ctx.fill();

  // rind along the curved edge only
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, a0, a1);
  ctx.lineWidth = r * 0.15;
  ctx.strokeStyle = pal.rind;
  ctx.stroke();

  if (pal.inner) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.83, a0, a1);
    ctx.lineWidth = r * 0.05;
    ctx.strokeStyle = pal.inner;
    ctx.stroke();
    ctx.restore();
  }

  const cy = side > 0 ? -1 : 1;

  if (type === 'watermelon') {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = r * 0.018;
    for (let i = 0; i < 7; i++) {
      const x = (-0.55 + i * 0.18) * r;
      ctx.beginPath();
      ctx.moveTo(x * 0.6, cy * r * 0.12);
      ctx.lineTo(x * 1.15, cy * r * 0.72);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#1c1c1c';
    for (let i = 0; i < 7; i++) {
      const x = (hash(i * 3.3) - 0.5) * r * 1.15;
      const y = cy * r * (0.24 + hash(i * 6.7) * 0.42);
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.045, r * 0.065, i * 0.5, 0, TAU);
      ctx.fill();
    }
  } else if (type === 'orange' || type === 'lemon' || type === 'lime') {
    const base = side > 0 ? Math.PI : 0;
    // pulp sacs: little bright beads inside each segment
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    for (let i = 1; i < 7; i++) {
      const a = base + (Math.PI * i) / 7;
      for (let k = 1; k <= 3; k++) {
        const d = r * (0.28 + k * 0.16);
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * 0.045, r * 0.075, a, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    // segment walls
    ctx.save();
    ctx.strokeStyle = 'rgba(255,252,240,0.55)';
    ctx.lineWidth = r * 0.035;
    for (let i = 1; i < 7; i++) {
      const a = base + (Math.PI * i) / 7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(210,150,40,0.20)';
    ctx.lineWidth = r * 0.018;
    for (let i = 1; i < 7; i++) {
      const a = base + (Math.PI * i) / 7 + 0.05;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
      ctx.stroke();
    }
    ctx.restore();
    // core
    ctx.fillStyle = pal.inner;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.13, r * 0.1, 0, 0, TAU);
    ctx.fill();
    // one or two pips
    ctx.fillStyle = '#f4ecc4';
    for (let i = 0; i < 2; i++) {
      const a = base + Math.PI * (0.35 + i * 0.3);
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.035, r * 0.055, a, 0, TAU);
      ctx.fill();
    }
  } else if (type === 'kiwi') {
    ctx.fillStyle = '#f4f9d6';
    ctx.beginPath();
    ctx.ellipse(0, cy * r * 0.1, r * 0.22, r * 0.19, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1c1c1c';
    for (let i = 0; i < 12; i++) {
      const a = (side > 0 ? Math.PI : 0) + (Math.PI * (i + 0.5)) / 12;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.026, r * 0.04, a, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = r * 0.025;
    for (let i = 0; i < 10; i++) {
      const a = (side > 0 ? Math.PI : 0) + (Math.PI * (i + 0.5)) / 10;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.24, Math.sin(a) * r * 0.24);
      ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
      ctx.stroke();
    }
  } else if (type === 'strawberry') {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = r * 0.035;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.18, cy * r * 0.15);
      ctx.lineTo(i * r * 0.4, cy * r * 0.72);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#ffe9a6';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse((hash(i * 4.9) - 0.5) * r * 1.0, cy * r * (0.3 + hash(i * 7.1) * 0.4), r * 0.03, r * 0.045, 0, 0, TAU);
      ctx.fill();
    }
  } else if (type === 'banana') {
    ctx.strokeStyle = 'rgba(210,180,90,0.55)';
    ctx.lineWidth = r * 0.04;
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, cy * r * 0.2);
    ctx.quadraticCurveTo(0, cy * r * 0.62, r * 0.75, cy * r * 0.15);
    ctx.stroke();
  } else if (type === 'pineapple') {
    ctx.strokeStyle = 'rgba(220,170,60,0.45)';
    ctx.lineWidth = r * 0.035;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * i * 0.24, a0, a1);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff2b0';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.13, r * 0.1, 0, 0, TAU);
    ctx.fill();
  }

  // soft shade along the cut line so the face reads flat, not domed
  ctx.save();
  const sh = ctx.createLinearGradient(0, 0, 0, cy * r * 0.6);
  sh.addColorStop(0, 'rgba(0,0,0,0.22)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(0, 0, r, a0, a1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------------- bomb */

export function drawBomb(ctx, r, t) {
  const g = ctx.createRadialGradient(-r * 0.32, -r * 0.4, r * 0.04, 0, 0, r * 1.15);
  g.addColorStop(0, '#565662');
  g.addColorStop(0.45, '#22222a');
  g.addColorStop(1, '#08080c');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, Math.PI * 1.05, Math.PI * 1.62);
  ctx.stroke();

  // cap + fuse
  ctx.fillStyle = '#3b3b45';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.98, r * 0.20, r * 0.12, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#c9a06a';
  ctx.lineWidth = r * 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.0);
  ctx.bezierCurveTo(r * 0.28, -r * 1.35, r * 0.62, -r * 1.18, r * 0.58, -r * 1.42);
  ctx.stroke();

  // spark
  const wob = 0.75 + 0.25 * Math.sin((t || 0) * 24);
  const sx = r * 0.58, sy = -r * 1.42;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.46 * wob);
  sg.addColorStop(0, 'rgba(255,255,230,1)');
  sg.addColorStop(0.35, 'rgba(255,190,80,0.9)');
  sg.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.46 * wob, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fffbe8';
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.09, 0, TAU);
  ctx.fill();
}

/* ---------------------------------------------------------------- blade + stains */

export function drawBlade(ctx, trail) {
  if (!trail || trail.length < 2) return;
  const n = trail.length;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';

  const head = trail[n - 1];
  const tail = trail[0];
  const core = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
  core.addColorStop(0, 'rgba(200,235,255,0)');
  core.addColorStop(0.45, 'rgba(225,245,255,0.55)');
  core.addColorStop(1, 'rgba(255,255,255,1)');

  // soft outer bloom, tapering to the tail
  ctx.strokeStyle = 'rgba(170,220,255,0.06)';
  for (let i = 1; i < n; i++) {
    const f = i / (n - 1);
    ctx.lineWidth = 26 * (0.12 + 0.88 * f);
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }

  // mid streak
  ctx.strokeStyle = 'rgba(200,232,255,0.16)';
  for (let i = 1; i < n; i++) {
    const f = i / (n - 1);
    ctx.lineWidth = 11 * (0.1 + 0.9 * f);
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }

  // hot core, narrow and sharp
  ctx.strokeStyle = core;
  for (let i = 1; i < n; i++) {
    const f = i / (n - 1);
    ctx.lineWidth = 4.6 * (0.18 + 0.82 * f);
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }

  // flecks caught along the cut
  for (let i = 0; i < 7; i++) {
    const idx = Math.floor(hash(i * 4.7 + n) * n);
    const q = trail[idx];
    if (!q) continue;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + hash(i * 2.1) * 0.5).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(q.x + (hash(i * 8.3) - 0.5) * 11, q.y + (hash(i * 5.9) - 0.5) * 11,
            0.8 + hash(i * 3.3) * 1.7, 0, TAU);
    ctx.fill();
  }

  const hg = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 20);
  hg.addColorStop(0, 'rgba(255,255,255,0.95)');
  hg.addColorStop(1, 'rgba(200,235,255,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 20, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------------- sprite cache
   Gradients per fruit per frame are the main render cost on a phone. Baking each
   fruit type/radius once and drawing the bitmap keeps the frame cheap. */

const sprites = new Map();

export function clearSpriteCache() { sprites.clear(); }

export function fruitSprite(type, r, dpr, value) {
  const key = 'f|' + type + '|' + Math.round(r) + '|' + dpr.toFixed(2) + '|' + (value || 0);
  let c = sprites.get(key);
  if (c) return c;
  const box = r * 3;
  c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(box * dpr));
  c.height = Math.max(2, Math.round(box * dpr));
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.translate(box / 2, box / 2);

  // high-value fruit glow gold, so "which one do I chase" is visible at a glance
  if (value >= 3) {
    const aura = g.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.42);
    aura.addColorStop(0, 'rgba(255,214,110,0.30)');
    aura.addColorStop(0.7, 'rgba(255,190,70,0.14)');
    aura.addColorStop(1, 'rgba(255,180,60,0)');
    g.fillStyle = aura;
    g.beginPath();
    g.arc(0, 0, r * 1.42, 0, TAU);
    g.fill();
  }

  drawWhole(g, type, r, 0);

  // every fruit prints its point value, so the trade-off is not invisible
  if (value) {
    g.font = '900 ' + Math.max(9, Math.round(r * 0.44)) + 'px ui-sans-serif,Arial,sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(2, r * 0.09);
    g.strokeStyle = 'rgba(24,10,2,0.85)';
    g.strokeText(String(value), 0, r * 0.52);
    g.fillStyle = value >= 3 ? '#fff2c0' : 'rgba(255,255,255,0.92)';
    g.fillText(String(value), 0, r * 0.52);
  }

  sprites.set(key, c);
  return c;
}

export function halfSprite(type, r, side, dpr) {
  const key = 'h|' + type + '|' + side + '|' + Math.round(r) + '|' + dpr.toFixed(2);
  let c = sprites.get(key);
  if (c) return c;
  const box = r * 2.4;
  c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(box * dpr));
  c.height = Math.max(2, Math.round(box * dpr));
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.translate(box / 2, box / 2);
  drawHalf(g, type, r, side);
  sprites.set(key, c);
  return c;
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function wetBlob(ctx, x, y, rx, ry, rot, color, alpha) {
  const g = ctx.createRadialGradient(x, y, Math.min(rx, ry) * 0.15, x, y, Math.max(rx, ry));
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.62, rgba(color, alpha * 0.9));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
}

export function splat(ctx, x, y, r, color) {
  ctx.save();

  // core splash: a few overlapping soft blobs make an organic edge
  wetBlob(ctx, x, y, r * 0.72, r * 0.62, 0, color, 0.46);
  for (let i = 0; i < 5; i++) {
    const a = hash(i * 3.1 + x * 0.21) * TAU;
    const d = r * (0.18 + hash(i * 6.7 + y * 0.13) * 0.42);
    wetBlob(ctx,
      x + Math.cos(a) * d, y + Math.sin(a) * d,
      r * (0.22 + hash(i * 3.9) * 0.34), r * (0.18 + hash(i * 5.3) * 0.30),
      a, color, 0.34);
  }

  // flung droplets
  for (let i = 0; i < 10; i++) {
    const a = hash(i * 2.3 + x * 0.17) * TAU;
    const d = r * (0.9 + hash(i * 5.1 + y * 0.19) * 1.8);
    wetBlob(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d,
            r * (0.05 + hash(i * 7.7) * 0.13), r * (0.06 + hash(i * 3.1) * 0.18),
            a, color, 0.55);
  }

  // wet highlight so the stain reads as liquid, not paint
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#fff8ea';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.18, y - r * 0.16, r * 0.22, r * 0.10, -0.4, 0, TAU);
  ctx.fill();

  // drips running down the planks
  ctx.globalAlpha = 1;
  for (let i = 0; i < 3; i++) {
    const dx = (hash(i * 4.9 + x) - 0.5) * r * 1.7;
    wetBlob(ctx, x + dx, y + r * (0.65 + hash(i * 2.7 + y) * 0.9),
            r * 0.075, r * (0.24 + hash(i * 8.3) * 0.5), 0, color, 0.42);
  }
  ctx.restore();
}
