// Canvas renderer. Everything reads from game state; nothing here changes it.
export const LANE_COLOURS = ['#3ff0ff', '#ff4fd8', '#ffc24d', '#57ffa8'];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.W = 0; this.H = 0;
    this.hitY = 0;
    this.laneW = 0;
    this.approach = 1.55;
    this.sprites = [];
    this.palette = LANE_COLOURS;
    this.aura = ['70,170,255', '190,80,240'];
    this.kickTimes = [];
    this.particles = [];
    this.missLane = [0, 0, 0, 0];
    this.staticBg = null;
    this.auroraCv = null;
    this.auroraCtx = null;
    this.aw = 0; this.ah = 0;
    this.laneGrad = [];
    this.missGrad = [];
    this.scrimGrad = null;
    this.hitGrad = null;
    this.resize();
  }

  resize() {
    const w = Math.max(240, window.innerWidth);
    const h = Math.max(320, window.innerHeight);
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);   // a phone at dpr 2 costs 44% more pixels than the eye can use
    this.W = w; this.H = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.laneW = w / 4;
    this.hitY = h - Math.max(92, Math.min(h * 0.24, 170));
    this.noteH = Math.max(20, Math.min(34, this.laneW * 0.28));
    // deterministic dust, so the field has depth without noise between frames
    this.dust = Array.from({ length: 46 }, (_, i) => {
      const r = Math.sin(i * 12.9898) * 43758.5453;
      const f = r - Math.floor(r);
      return { x: ((i * 0.618) % 1) * w, y: f * h, r: 0.6 + f * 1.6, a: 0.05 + f * 0.10, s: 3 + f * 7 };
    });
    this.buildSprites();
    this.buildCaches();
  }

  /** Gradients and the static backdrop depend only on the viewport and the palette.
   *  Building them once per resize keeps the per-frame work to blits and sprites. */
  buildCaches() {
    const g = this.ctx;
    const W = this.W, H = this.H, dpr = this.dpr;
    const BW = W + 48, BH = H + 48;

    const cv = document.createElement('canvas');
    cv.width = Math.round(BW * dpr);
    cv.height = Math.round(BH * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    const bg = c.createLinearGradient(0, 0, 0, BH);
    bg.addColorStop(0, '#05070d');
    bg.addColorStop(0.55, '#070b14');
    bg.addColorStop(1, '#04060a');
    c.fillStyle = bg;
    c.fillRect(0, 0, BW, BH);
    const vg = c.createRadialGradient(BW / 2, BH / 2, Math.min(W, H) * 0.35, BW / 2, BH / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, BW, BH);
    // the base of the old beat glow, baked in; the live part rides on the aurora
    const gx = BW / 2, gy = BH * 0.72;
    const rg = c.createRadialGradient(gx, gy, 10, gx, gy, Math.max(W, H) * 0.72);
    rg.addColorStop(0, 'rgba(70,120,255,0.016)');
    rg.addColorStop(0.5, 'rgba(120,60,220,0.010)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg;
    c.fillRect(0, 0, BW, BH);
    this.staticBg = cv;

    this.aw = Math.max(48, Math.round(BW / 6));
    this.ah = Math.max(48, Math.round(BH / 6));
    if (!this.auroraCv) {
      this.auroraCv = document.createElement('canvas');
      this.auroraCtx = this.auroraCv.getContext('2d');
    }
    this.auroraCv.width = this.aw;
    this.auroraCv.height = this.ah;

    this.laneGrad = [0, 1, 2, 3].map((i) => {
      const x = i * this.laneW;
      const lg = g.createLinearGradient(x, 0, x, this.hitY);
      lg.addColorStop(0, this.hexA(this.palette[i], 0));
      lg.addColorStop(1, this.hexA(this.palette[i], 1));
      return lg;
    });
    this.missGrad = [0, 1, 2, 3].map((i) => {
      const x = i * this.laneW;
      const mg = g.createLinearGradient(x, this.hitY - 170, x, this.hitY);
      mg.addColorStop(0, 'rgba(255,40,70,0)');
      mg.addColorStop(1, 'rgba(255,40,70,1)');
      return mg;
    });

    const scrimH = Math.min(126, H * 0.17);
    const scrim = g.createLinearGradient(0, 0, 0, scrimH);
    scrim.addColorStop(0, 'rgba(4,6,10,.9)');
    scrim.addColorStop(1, 'rgba(4,6,10,0)');
    this.scrimGrad = scrim;

    const hl = g.createLinearGradient(0, 0, W, 0);
    hl.addColorStop(0, 'rgba(120,240,255,.85)');
    hl.addColorStop(0.5, 'rgba(255,255,255,.95)');
    hl.addColorStop(1, 'rgba(120,240,255,.85)');
    this.hitGrad = hl;
  }

  buildSprites() {
    this.sprites = LANE_COLOURS.map((colour) => {
      const w = Math.round(this.laneW * 0.70);
      const h = Math.round(this.noteH);
      const pad = 14;
      const c = document.createElement('canvas');
      c.width = (w + pad * 2) * this.dpr;
      c.height = (h + pad * 2) * this.dpr;
      const g = c.getContext('2d');
      g.scale(this.dpr, this.dpr);
      g.shadowColor = colour;
      g.shadowBlur = 16;
      g.fillStyle = colour;
      this.roundRect(g, pad, pad, w, h, h / 2);
      g.fill();
      g.shadowBlur = 0;
      const grad = g.createLinearGradient(0, pad, 0, pad + h);
      grad.addColorStop(0, 'rgba(255,255,255,.75)');
      grad.addColorStop(0.45, 'rgba(255,255,255,.12)');
      grad.addColorStop(1, 'rgba(0,0,0,.25)');
      g.fillStyle = grad;
      this.roundRect(g, pad, pad, w, h, h / 2);
      g.fill();
      // a hard rim keeps the note readable against a bright pad or the aurora
      g.strokeStyle = 'rgba(255,255,255,.8)';
      g.lineWidth = 1.5;
      this.roundRect(g, pad, pad, w, h, h / 2);
      g.stroke();
      return { canvas: c, w, h, pad };
    });
  }

  roundRect(g, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  pxPerSecond() {
    return (this.hitY + 40) / this.approach;
  }

  setSong(song) {
    const pal = song.track.palette;
    if (pal && pal.lanes) {
      this.palette = pal.lanes;
      this.aura = pal.aura || this.aura;
      this.buildSprites();
      this.buildCaches();
    }
    this.kickTimes = song.events.filter((e) => e.type === 'kick').map((e) => e.t);
    this.particles = [];
  }

  burst(lane, grade) {
    const x = lane * this.laneW + this.laneW / 2;
    const colour = this.palette[lane];
    const n = grade === 'perfect' ? 14 : grade === 'good' ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = 60 + Math.random() * 150;
      this.particles.push({
        x, y: this.hitY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: 0.45 + Math.random() * 0.3, age: 0, colour, r: 1.5 + Math.random() * 2.2,
      });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
      p.vx *= 0.985;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
  }

  draw({ song, judge, time, held, level, flashes, wave, shake = 0, device = 'keyboard' }) {
    const g = this.ctx;
    const W = this.W, H = this.H;

    // screen shake lives here: one transform, and the background is drawn with
    // a 24 px bleed so a shake never shows a bare edge.
    g.save();
    if (shake > 0.01) {
      const a = Math.min(1, shake) * 7;
      g.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    }

    // --- background -------------------------------------------------------- //
    // baked once per resize (gradient + vignette), so this frame only blits it
    if (this.staticBg) g.drawImage(this.staticBg, -24, -24, W + 48, H + 48);

    // beat pulse
    let pulse = 0;
    if (this.kickTimes.length) {
      let lo = 0, hi = this.kickTimes.length - 1, last = -9;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (this.kickTimes[mid] <= time) { last = this.kickTimes[mid]; lo = mid + 1; } else hi = mid - 1;
      }
      if (last > -9) pulse = Math.exp(-(time - last) * 5.5);
    }

    // slow drifting aurora: drawn at 1/6 scale, which costs a fraction of two
    // full-screen radial gradients and looks identical under the blur
    if (this.auroraCtx) {
      const ac = this.auroraCtx, aw = this.aw, ah = this.ah;
      const sx = aw / (W + 48), sy = ah / (H + 48);
      ac.clearRect(0, 0, aw, ah);
      const sources = [
        { x: W * (0.5 + 0.30 * Math.sin(time * 0.11)), y: H * (0.62 + 0.08 * Math.cos(time * 0.07)), r: Math.max(W, H) * 0.55, c: this.aura[0] },
        { x: W * (0.5 + 0.36 * Math.cos(time * 0.083)), y: H * (0.38 + 0.10 * Math.sin(time * 0.05)), r: Math.max(W, H) * 0.50, c: this.aura[1] },
      ];
      for (const a of sources) {
        const ax = (a.x + 24) * sx, ay = (a.y + 24) * sy, r = Math.max(6, a.r * Math.min(sx, sy));
        const ag = ac.createRadialGradient(ax, ay, 1, ax, ay, r);
        ag.addColorStop(0, `rgba(${a.c},1)`);
        ag.addColorStop(1, 'rgba(0,0,0,0)');
        ac.fillStyle = ag;
        ac.fillRect(0, 0, aw, ah);
      }
      g.globalAlpha = Math.min(1, 0.028 + level * 0.09 + pulse * 0.05);
      g.drawImage(this.auroraCv, -24, -24, W + 48, H + 48);
      g.globalAlpha = 1;
    }

    // slow dust for depth
    for (const p of this.dust) {
      const y = (p.y + time * p.s) % H;
      g.fillStyle = `rgba(190,215,255,${p.a})`;
      g.beginPath(); g.arc(p.x, y, p.r, 0, Math.PI * 2); g.fill();
    }

    // --- lanes ------------------------------------------------------------- //
    for (let i = 0; i < 4; i++) {
      const x = i * this.laneW;
      const press = held.has(i) ? 1 : 0;
      const fl = flashes[i] || 0;
      const tint = 0.035 + press * 0.07 + fl * 0.10;
      g.globalAlpha = Math.min(1, tint);
      g.fillStyle = this.laneGrad[i];
      g.fillRect(x + 2, 0, this.laneW - 4, this.hitY);
      g.globalAlpha = 1;
      const miss = this.missLane[i] || 0;
      if (miss > 0.01) {
        g.globalAlpha = Math.min(1, 0.34 * miss);
        g.fillStyle = this.missGrad[i];
        g.fillRect(x + 2, this.hitY - 170, this.laneW - 4, 170);
        g.globalAlpha = 1;
      }
    }

    // separators
    g.strokeStyle = 'rgba(150,190,255,.22)';
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = Math.round(i * this.laneW) + 0.5;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, this.hitY); g.stroke();
    }

    // --- beat grid (4 beats) ----------------------------------------------- //
    const pps = this.pxPerSecond();
    const beat = song.beat;
    const first = Math.floor((time - this.approach) / (beat * 4)) * 4;
    g.strokeStyle = 'rgba(160,200,255,.055)';
    for (let b = first; b * beat < time + this.approach; b += 4) {
      const bt = b * beat;
      const y = this.hitY - (bt - time) * pps;
      if (y < -20 || y > this.hitY) continue;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }

    // --- top scrim: notes fade under the HUD instead of fighting it --------- //
    const scrimH = Math.min(126, H * 0.17);
    g.fillStyle = this.scrimGrad;
    g.fillRect(0, 0, W, scrimH);

    // --- hit line ---------------------------------------------------------- //
    g.save();
    g.shadowColor = 'rgba(150,220,255,.9)';
    g.shadowBlur = 18;
    g.strokeStyle = this.hitGrad;
    g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, this.hitY); g.lineTo(W, this.hitY); g.stroke();
    g.restore();

    // lane pads at the line
    for (let i = 0; i < 4; i++) {
      const x = i * this.laneW + this.laneW / 2;
      const r = 4 + (flashes[i] || 0) * 9;
      g.fillStyle = this.hexA(this.palette[i], 0.5 + (flashes[i] || 0) * 0.5);
      g.beginPath(); g.arc(x, this.hitY, r, 0, Math.PI * 2); g.fill();
    }

    // The lane labels answer "which key?" without leaving the playfield.
    const labels = device === 'pad' ? ['A', 'B', 'X', 'Y'] : device === 'touch' ? null : ['D', 'F', 'J', 'K'];
    if (labels) {
      g.font = '700 13px system-ui, -apple-system, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillStyle = 'rgba(200,222,255,.50)';
      for (let i = 0; i < 4; i++) g.fillText(labels[i], i * this.laneW + this.laneW / 2, this.hitY + 13);
      g.textAlign = 'start';
      g.textBaseline = 'alphabetic';
    }

    // --- notes ------------------------------------------------------------- //
    const from = time - 0.28;
    const to = time + this.approach;
    for (const n of judge.notes) {
      if (n.judged && n.dur === 0) continue;
      if (n.tailDone) continue;
      // A hold stays on screen until its tail has passed, not just its head.
      const end = n.dur > 0 ? n.t + n.dur : n.t;
      if (end < from || n.t > to) continue;
      const y = this.hitY - (n.t - time) * pps;
      const x = n.lane * this.laneW + this.laneW / 2;
      const sp = this.sprites[n.lane];

      if (n.dur > 0 && !n.tailDone) {
        // The tail is still owed, judged head or not: draw the part of the bar that
        // has not reached the hit line yet, so the player can see what to hold.
        const len = n.dur * pps;
        const top = y - len;
        const bottom = Math.min(y, this.hitY);
        if (bottom > top) {
          const holding = n.holdActive;
          g.fillStyle = this.hexA(this.palette[n.lane], holding ? 0.46 : 0.26);
          this.roundRect(g, x - sp.w * 0.34, top, sp.w * 0.68, bottom - top, sp.w * 0.32);
          g.fill();
          g.strokeStyle = this.hexA(this.palette[n.lane], holding ? 1 : 0.7);
          g.lineWidth = holding ? 2 : 1.4;
          g.stroke();
        }
      }

      const alpha = n.judged ? 0.22 : 1;

      // motion trail, brightest at the head
      if (!n.judged) {
        const trail = Math.min(52, Math.max(0, this.hitY - y));
        if (trail > 2) {
          const w = sp.w * 0.32;
          const bands = 4, bh = trail / bands;
          for (let b = 0; b < bands; b++) {
            g.fillStyle = this.hexA(this.palette[n.lane], 0.03 + 0.055 * b);
            g.fillRect(x - w / 2, y - trail + b * bh, w, bh + 0.6);
          }
        }
      }

      g.globalAlpha = alpha;
      g.drawImage(sp.canvas, x - sp.w / 2 - sp.pad, y - sp.h / 2 - sp.pad, sp.w + sp.pad * 2, sp.h + sp.pad * 2);
      g.globalAlpha = 1;
    }

    // --- particles --------------------------------------------------------- //
    for (const p of this.particles) {
      const a = 1 - p.age / p.life;
      g.globalAlpha = Math.max(0, a);
      g.fillStyle = p.colour;
      g.beginPath(); g.arc(p.x, p.y, p.r * (0.5 + a), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;

    // --- resonance strip: the real audio waveform below the hit line ------- //
    const bins = 64;
    const wv = wave || new Float32Array(bins);
    const baseY = Math.min(H - 14, this.hitY + Math.max(30, (H - this.hitY) * 0.5));
    const amp = Math.max(12, Math.min(34, (H - this.hitY) * 0.26));
    const bw = W / bins;
    for (let i = 0; i < bins; i++) {
      const v = Math.abs(wv[i] || 0);
      const hh = Math.max(1.2, v * amp);
      const colour = this.palette[Math.min(3, Math.floor((i / bins) * 4))];
      g.fillStyle = this.hexA(colour, 0.16 + v * 0.6);
      g.fillRect(i * bw + 1.5, baseY - hh, Math.max(1, bw - 3), hh * 2);
    }
    g.strokeStyle = 'rgba(150,200,255,.12)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, baseY); g.lineTo(W, baseY); g.stroke();

    // vignette is baked into the static backdrop
    if (shake > 0.01) {
      g.fillStyle = `rgba(255,45,80,${0.10 * Math.min(1, shake)})`;
      g.fillRect(-24, -24, W + 48, H + 48);
    }
    g.restore();
  }

  hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${gg},${b},${Math.min(1, Math.max(0, a))})`;
  }
}
