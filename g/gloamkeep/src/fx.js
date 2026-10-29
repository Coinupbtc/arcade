/* GLOAMKEEP — particles, floating text, beams, rings, screen shake. */
window.GK = window.GK || {};

(function () {
  let parts = [], texts = [], beams = [], rings = [];
  let shake = 0;

  GK.FX = {
    reset() { parts = []; texts = []; beams = []; rings = []; shake = 0; },
    burst(x, y, n, colors, opt) {
      const o = opt || {};
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (o.speed || 28) * (0.3 + Math.random() * 0.9);
        parts.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (o.up || 0),
          life: (o.life || 0.5) * (0.6 + Math.random() * 0.7),
          max: 0.6,
          col: colors[(Math.random() * colors.length) | 0],
          size: o.size || 1,
          grav: o.grav == null ? 60 : o.grav
        });
      }
    },
    text(x, y, str, col) {
      texts.push({ x, y, str, col, life: 0.9, vy: -16 });
    },
    beam(points, col) {
      beams.push({ pts: points, col, life: 0.18, max: 0.18 });
    },
    ring(x, y, r, col) {
      rings.push({ x, y, r0: 2, r1: r, col, life: 0.32, max: 0.32 });
    },
    shakeAdd(v) { shake = Math.min(3, shake + v); },
    getShake() { return shake; },
    update(dt) {
      shake = Math.max(0, shake - dt * 6);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.grav * dt;
      }
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        t.life -= dt;
        if (t.life <= 0) { texts.splice(i, 1); continue; }
        t.y += t.vy * dt;
      }
      for (let i = beams.length - 1; i >= 0; i--) {
        beams[i].life -= dt;
        if (beams[i].life <= 0) beams.splice(i, 1);
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].life -= dt;
        if (rings[i].life <= 0) rings.splice(i, 1);
      }
    },
    draw(ctx) {
      // beams
      for (const b of beams) {
        const a = b.life / b.max;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.strokeStyle = b.col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < b.pts.length; i++) {
          const p = b.pts[i];
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.restore();
      }
      // rings
      for (const r of rings) {
        const a = r.life / r.max;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = r.col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - a), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // particles
      for (const p of parts) {
        const a = Math.min(1, p.life * 3);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.col;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
      // floating text
      ctx.font = '600 7px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      for (const t of texts) {
        ctx.globalAlpha = Math.min(1, t.life * 2);
        ctx.fillStyle = '#0a0a10';
        ctx.fillText(t.str, Math.round(t.x) + 1, Math.round(t.y) + 1);
        ctx.fillStyle = t.col;
        ctx.fillText(t.str, Math.round(t.x), Math.round(t.y));
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
  };
})();
