// Bubble Bay — drawing. Own art: dark stone hall, metal frame, glossy outlined bubbles,
// a launcher with a small green mascot. The reference frames set the palette and layering only.

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

/* ---------------------------------------------------------------- background */

export function buildHall(W, H, DPR, geo) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(W * DPR));
  c.height = Math.max(2, Math.round(H * DPR));
  const g = c.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);

  // deep base
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#080707');
  bg.addColorStop(0.42, '#1d1a17');
  bg.addColorStop(1, '#0c0b0a');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // masonry
  const bh = Math.max(18, H * 0.032);
  const bw = Math.max(46, W * 0.15);
  for (let row = 0; row * bh < H; row++) {
    const off = (row % 2) * bw * 0.5;
    for (let col = -1; col * bw < W + bw; col++) {
      const x = col * bw + off + 2;
      const y = row * bh + 2;
      const tone = 0.55 + hash(row * 7.3 + col * 3.1) * 0.5;
      g.fillStyle = `rgba(${Math.round(58 * tone)},${Math.round(51 * tone)},${Math.round(43 * tone)},1)`;
      g.fillRect(x, y, bw - 4, bh - 4);
      g.strokeStyle = 'rgba(8,7,6,0.65)';
      g.lineWidth = 1.5;
      g.strokeRect(x, y, bw - 4, bh - 4);
      // pitting
      if (hash(row * 11 + col * 5.7) > 0.62) {
        g.fillStyle = 'rgba(10,9,8,0.5)';
        g.beginPath();
        g.ellipse(x + bw * 0.3, y + bh * 0.5, bw * 0.08, bh * 0.14, hash(col) * 3, 0, TAU);
        g.fill();
      }
    }
  }

  // arched windows with dim blue light
  const archCount = W > H ? 2 : 1;
  for (let i = 0; i < archCount; i++) {
    const ax = W * (0.22 + i * 0.56);
    const aw = Math.min(W * 0.16, H * 0.10);
    const ah = aw * 2.1;
    const ay = H * 0.20;
    const lg = g.createLinearGradient(0, ay, 0, ay + ah);
    lg.addColorStop(0, 'rgba(60,110,180,0.35)');
    lg.addColorStop(0.6, 'rgba(30,60,110,0.20)');
    lg.addColorStop(1, 'rgba(10,20,40,0.05)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(ax - aw / 2, ay + ah);
    g.lineTo(ax - aw / 2, ay + aw * 0.55);
    g.arc(ax, ay + aw * 0.55, aw / 2, Math.PI, 0);
    g.lineTo(ax + aw / 2, ay + ah);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(120,110,95,0.35)';
    g.lineWidth = Math.max(3, W * 0.008);
    g.stroke();
    // mullions
    g.strokeStyle = 'rgba(30,28,24,0.7)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(ax, ay + aw * 0.55);
    g.lineTo(ax, ay + ah);
    g.stroke();
  }

  // hanging banners give the hall some colour
  for (let i = 0; i < (W > H ? 3 : 2); i++) {
    const bx = W * (0.18 + i * (W > H ? 0.32 : 0.44));
    const bwid = Math.max(26, W * 0.09);
    const btop = H * 0.02;
    const bbot = H * (0.20 + hash(i * 4.4) * 0.08);
    const col = i % 2 ? '#2f6d6b' : '#8f2f3a';
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(bx - bwid / 2, btop);
    g.lineTo(bx + bwid / 2, btop);
    g.lineTo(bx + bwid / 2, bbot);
    g.lineTo(bx + bwid * 0.16, bbot - H * 0.02);
    g.lineTo(bx, bbot);
    g.lineTo(bx - bwid * 0.16, bbot - H * 0.02);
    g.lineTo(bx - bwid / 2, bbot);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,220,150,0.18)';
    g.fillRect(bx - bwid / 2, btop, bwid, Math.max(2, H * 0.004));
    g.strokeStyle = 'rgba(10,8,6,0.5)';
    g.lineWidth = 1;
    g.stroke();
  }

  // torches
  for (let i = 0; i < (W > H ? 3 : 2); i++) {
    const tx = W * (0.12 + i * (W > H ? 0.38 : 0.62));
    const ty = H * 0.46;
    const tg = g.createRadialGradient(tx, ty, 0, tx, ty, H * 0.09);
    tg.addColorStop(0, 'rgba(255,190,90,0.55)');
    tg.addColorStop(0.35, 'rgba(255,140,40,0.22)');
    tg.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = tg;
    g.beginPath();
    g.arc(tx, ty, H * 0.09, 0, TAU);
    g.fill();
    g.fillStyle = `rgba(255,${180 + Math.floor(hash(i) * 50)},80,0.9)`;
    g.beginPath();
    g.ellipse(tx, ty, Math.max(2, W * 0.006), Math.max(5, H * 0.012), 0, 0, TAU);
    g.fill();
  }

  // playfield frame: thick metal edge with rivets
  const frameW = Math.max(12, W * 0.030);
  const left = geo.left != null ? geo.left : 0;
  const right = geo.right != null ? geo.right : W;
  const top = geo.topY - frameW;
  const bottom = geo.floorY + frameW;
  // outer gold band
  const fg = g.createLinearGradient(0, top, 0, bottom);
  fg.addColorStop(0, '#e2c874');
  fg.addColorStop(0.5, '#8d762f');
  fg.addColorStop(1, '#2f260f');
  g.strokeStyle = fg;
  g.lineWidth = frameW;
  g.strokeRect(left + frameW / 2, top, right - left - frameW, bottom - top);
  // inner teal band
  g.strokeStyle = '#2f6d6b';
  g.lineWidth = Math.max(4, frameW * 0.34);
  g.strokeRect(left + frameW * 0.92, top + frameW * 0.34, right - left - frameW * 1.84, bottom - top - frameW * 0.68);
  g.strokeStyle = 'rgba(160,220,215,0.45)';
  g.lineWidth = 1;
  g.strokeRect(left + frameW * 0.92, top + frameW * 0.34, right - left - frameW * 1.84, bottom - top - frameW * 0.68);

  // corner plates
  const cp = frameW * 1.9;
  for (const [cx, cy] of [[left + frameW * 0.5, top + frameW * 0.5], [right - frameW * 0.5, top + frameW * 0.5],
                          [left + frameW * 0.5, bottom - frameW * 0.5], [right - frameW * 0.5, bottom - frameW * 0.5]]) {
    g.fillStyle = '#6b5a22';
    g.fillRect(cx - cp / 2, cy - cp / 2, cp, cp);
    g.strokeStyle = 'rgba(240,220,150,0.55)';
    g.lineWidth = 1.5;
    g.strokeRect(cx - cp / 2, cy - cp / 2, cp, cp);
    g.fillStyle = '#e2c874';
    g.beginPath();
    g.arc(cx, cy, cp * 0.16, 0, TAU);
    g.fill();
  }

  // rivets
  g.fillStyle = 'rgba(230,215,150,0.55)';
  for (let x = left + frameW; x < right - frameW; x += Math.max(26, (right - left) * 0.06)) {
    g.beginPath();
    g.arc(x, top + frameW * 0.5, Math.max(1.4, frameW * 0.16), 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(x, bottom - frameW * 0.5, Math.max(1.4, frameW * 0.16), 0, TAU);
    g.fill();
  }

  // ledge under the launcher
  g.fillStyle = '#23201c';
  g.fillRect(0, geo.floorY, W, H - geo.floorY);
  g.fillStyle = '#3b352c';
  g.fillRect(0, geo.floorY, W, Math.max(3, H * 0.006));
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, geo.floorY + Math.max(3, H * 0.006), W, 2);

  // vignette
  const vg = g.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.25, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.62)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  return c;
}

/* ---------------------------------------------------------------- bubbles */

const bubbleCache = new Map();

export function clearBubbleCache() { bubbleCache.clear(); }

export function bubbleSprite(color, r, dpr) {
  const k = color + '|' + Math.round(r) + '|' + dpr.toFixed(2);
  let c = bubbleCache.get(k);
  if (c) return c;
  const pad = r * 1.35;
  c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(pad * 2 * dpr));
  c.height = Math.max(2, Math.round(pad * 2 * dpr));
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.translate(pad, pad);

  const grad = g.createRadialGradient(-r * 0.34, -r * 0.38, r * 0.08, 0, 0, r * 1.05);
  grad.addColorStop(0, shade(color, 1.45));
  grad.addColorStop(0.45, shade(color, 1.05));
  grad.addColorStop(1, shade(color, 0.55));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.fill();

  // thick dark outline, like the arcade sprites
  g.strokeStyle = 'rgba(8,6,4,0.95)';
  g.lineWidth = Math.max(2, r * 0.20);
  g.beginPath();
  g.arc(0, 0, r * 0.88, 0, TAU);
  g.stroke();
  // inner rim catches light
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = Math.max(1, r * 0.05);
  g.beginPath();
  g.arc(0, 0, r * 0.76, Math.PI * 1.02, Math.PI * 1.62);
  g.stroke();

  // specular
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.ellipse(-r * 0.32, -r * 0.36, r * 0.26, r * 0.16, -0.6, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.beginPath();
  g.ellipse(r * 0.30, r * 0.34, r * 0.16, r * 0.08, -0.5, 0, TAU);
  g.fill();

  bubbleCache.set(k, c);
  return c;
}

export function drawBubble(ctx, x, y, r, color, dpr, alpha) {
  if (!color) return;
  const sp = bubbleSprite(color, r, dpr || 1.3);
  const size = r * 2.7;
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.drawImage(sp, x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = 1;
}

/* ---------------------------------------------------------------- guide + launcher */

export function drawGuide(ctx, pts, R, t) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  const dash = Math.max(3, R * 0.22);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, ay = pts[i - 1].y;
    const bx = pts[i].x, by = pts[i].y;
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.floor(len / (dash * 2.6)));
    for (let s = 0; s < steps; s++) {
      const k = s / steps;
      const x = ax + (bx - ax) * k;
      const y = ay + (by - ay) * k;
      const fade = 1 - i / pts.length * 0.55;
      ctx.globalAlpha = 0.82 * fade * (0.8 + 0.2 * Math.sin(t * 6 + s));
      ctx.fillStyle = '#f2fbff';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, R * 0.15), 0, TAU);
      ctx.fill();
    }
  }
  const end = pts[pts.length - 1];
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = '#eaf6ff';
  ctx.lineWidth = Math.max(1.4, R * 0.10);
  ctx.beginPath();
  ctx.arc(end.x, end.y, R * 0.55, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function drawLauncher(ctx, x, y, R, angle, color, t, dpr) {
  ctx.save();
  ctx.translate(x, y);

  // pedestal
  ctx.fillStyle = '#2a2621';
  ctx.beginPath();
  ctx.ellipse(0, R * 1.05, R * 2.4, R * 0.55, 0, 0, TAU);
  ctx.fill();

  // mascot: small green creature on the ledge, left of the cannon
  const mx = -R * 2.6, my = -R * 0.2;
  const u = R / 18;
  // feet
  ctx.fillStyle = '#2f6b2c';
  ctx.beginPath(); ctx.ellipse(mx - u * 7, my + u * 15, u * 6, u * 3.2, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(mx + u * 7, my + u * 15, u * 6, u * 3.2, 0, 0, TAU); ctx.fill();
  // body
  const bg = ctx.createRadialGradient(mx - u * 6, my - u * 8, u * 4, mx, my, u * 22);
  bg.addColorStop(0, '#7fe06a');
  bg.addColorStop(0.6, '#4cae42');
  bg.addColorStop(1, '#2c6d28');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(mx, my + u * 4, u * 17, u * 20, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,20,10,0.55)';
  ctx.lineWidth = Math.max(1, u * 1.5);
  ctx.stroke();
  // belly
  ctx.fillStyle = '#d6f0a8';
  ctx.beginPath();
  ctx.ellipse(mx, my + u * 9, u * 9, u * 11, 0, 0, TAU);
  ctx.fill();
  // eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(mx - u * 6, my - u * 6, u * 5.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + u * 6, my - u * 6, u * 5.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#12160c';
  ctx.beginPath(); ctx.arc(mx - u * 6 + u * 1.2, my - u * 6, u * 2.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + u * 6 + u * 1.2, my - u * 6, u * 2.6, 0, TAU); ctx.fill();
  // horns
  ctx.fillStyle = '#e8d7a8';
  ctx.beginPath();
  ctx.moveTo(mx - u * 9, my - u * 15);
  ctx.lineTo(mx - u * 13, my - u * 24);
  ctx.lineTo(mx - u * 4, my - u * 17);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(mx + u * 9, my - u * 15);
  ctx.lineTo(mx + u * 13, my - u * 24);
  ctx.lineTo(mx + u * 4, my - u * 17);
  ctx.closePath(); ctx.fill();
  // arm holding the cannon
  ctx.strokeStyle = '#4cae42';
  ctx.lineWidth = u * 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(mx + u * 12, my + u * 2);
  ctx.lineTo(-R * 0.8, my - u * 2);
  ctx.stroke();

  // cannon base
  ctx.fillStyle = '#2f6d6b';
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.05, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(8,14,14,0.7)';
  ctx.lineWidth = Math.max(1.2, R * 0.10);
  ctx.stroke();
  ctx.fillStyle = '#a8d6d0';
  ctx.beginPath();
  ctx.arc(-R * 0.2, -R * 0.3, R * 0.22, 0, TAU);
  ctx.fill();

  // barrel
  ctx.save();
  ctx.rotate(angle + Math.PI / 2);
  const bw = R * 0.9, bl = R * 2.4;
  const bg2 = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  bg2.addColorStop(0, '#8fd0c8');
  bg2.addColorStop(0.5, '#4f9e97');
  bg2.addColorStop(1, '#2a5f5a');
  ctx.fillStyle = bg2;
  ctx.beginPath();
  ctx.roundRect(-bw / 2, -bl * 0.55, bw, bl, bw * 0.4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,20,20,0.6)';
  ctx.lineWidth = Math.max(1, R * 0.08);
  ctx.stroke();
  ctx.restore();

  // loaded bubble at the muzzle
  if (color) {
    const mx2 = Math.cos(angle) * R * 2.0;
    const my2 = Math.sin(angle) * R * 2.0;
    drawBubble(ctx, mx2, my2, R * 0.94, color, dpr, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(mx2, my2, R * 0.98, 0, TAU);
    ctx.strokeStyle = 'rgba(230,255,250,0.35)';
    ctx.lineWidth = Math.max(1, R * 0.07);
    ctx.stroke();
  }

  ctx.restore();
}

/* ---------------------------------------------------------------- next preview */

export function drawPreview(ctx, x, y, r, color, dpr, label) {
  drawBubble(ctx, x, y, r, color, dpr, 1);
  if (label) {
    ctx.save();
    ctx.fillStyle = 'rgba(220,235,230,0.75)';
    ctx.font = `600 ${Math.max(9, r * 0.55)}px ui-sans-serif,Arial,sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + r * 2.2);
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- danger line */

export function drawDanger(ctx, W, dangerY, t, close) {
  ctx.save();
  const pulse = 0.55 + 0.45 * Math.sin(t * 4);
  ctx.setLineDash([Math.max(6, W * 0.02), Math.max(4, W * 0.012)]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = close ? `rgba(255,90,60,${0.75 + 0.25 * pulse})` : 'rgba(255,120,80,0.35)';
  ctx.beginPath();
  ctx.moveTo(0, dangerY);
  ctx.lineTo(W, dangerY);
  ctx.stroke();
  ctx.setLineDash([]);

  // chevrons pointing down at the line
  const cw = Math.max(10, W * 0.030);
  ctx.globalAlpha = close ? 0.55 : 0.25;
  ctx.fillStyle = close ? '#ff6a48' : '#c06a50';
  for (let x = cw; x < W - cw; x += cw * 2.4) {
    ctx.beginPath();
    ctx.moveTo(x - cw * 0.5, dangerY + 2);
    ctx.lineTo(x, dangerY + cw * 0.7);
    ctx.lineTo(x + cw * 0.5, dangerY + 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (close) {
    const g = ctx.createLinearGradient(0, dangerY - 12, 0, dangerY + 12);
    g.addColorStop(0, 'rgba(255,70,40,0)');
    g.addColorStop(0.5, `rgba(255,80,50,${0.22 * pulse})`);
    g.addColorStop(1, 'rgba(255,70,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, dangerY - 12, W, 24);
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- fx */

export function drawParticles(ctx, particles) {
  for (const q of particles) {
    const k = q.age / q.life;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.r * (1 - 0.35 * k), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawPops(ctx, pops) {
  for (const p of pops) {
    const k = p.age / p.life;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.translate(p.x, p.y - k * 34);
    ctx.font = '900 22px ui-sans-serif,-apple-system,Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(20,10,6,0.85)';
    ctx.strokeText(p.text, 0, 0);
    const g = ctx.createLinearGradient(0, -14, 0, 14);
    g.addColorStop(0, '#fff7d6');
    g.addColorStop(1, '#ffc94f');
    ctx.fillStyle = g;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}
