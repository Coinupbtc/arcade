/* BRIDGEWRIGHT — screen-space UI: layout, HUD, buttons, overlays. */
(function (root) {
  'use strict';

  const L = root.BW_LEVELS;
  const { THEMES, MATS, VEHICLES, LEVELS, LADDER } = L;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function rr(ctx, x, y, w, h, r) {
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

  const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  // Card badge: a saved best only needs three bands here, not the full par rule.
  function medalForCard(lv, heaviest) {
    const goal = lv.goal === undefined ? LADDER.length - 1 : lv.goal;
    if (heaviest >= LADDER.length - 1) return 'gold';
    return heaviest >= goal ? 'silver' : 'bronze';
  }

  const UI = {
    layout(W, H, safe) {
      const portrait = H > W * 1.05;
      const out = { portrait, buttons: [], play: null, top: null, bottom: null };
      const SL = safe.left || 0, SR = safe.right || 0;
      const tools = ['undo', 'redo', 'erase', 'deck', 'brace'];
      const labels = { undo: 'UNDO', redo: 'REDO', erase: 'ERASE', deck: 'DECK', brace: 'BRACE' };
      // The arcade's ◀ ARCADE pill owns the top-left 140×56 px corner. Portrait: the HUD bar starts
      // below it. Landscape: it starts to the right of it. The pause button is ArcadeInput's 48 px DOM
      // button (top-right); the game draws no second pause control.
      if (portrait) {
        const topH = 58, bottomH = 118;
        out.top = { x: SL + 10, y: safe.top + 58, w: W - SL - SR - 20, h: topH };
        out.bottom = { x: SL, y: H - safe.bottom - bottomH, w: W - SL - SR, h: bottomH };
        out.play = { x: 0, y: out.top.y + out.top.h + 4, w: W, h: out.bottom.y - (out.top.y + out.top.h + 4) };
        const pad = SL + 10;
        const chipW = (out.bottom.w - 20 - 16) / 3;
        for (let i = 0; i < 3; i++) {
          const key = ['wood', 'steel', 'carbon'][i];
          out.buttons.push({ id: 'mat:' + key, x: pad + i * (chipW + 8), y: out.bottom.y + 8, w: chipW, h: 50, label: MATS[key].label, sub: '', kind: 'chip' });
        }
        const rowY = out.bottom.y + 64, small = 44, gap = 4;
        for (let i = 0; i < tools.length; i++) out.buttons.push({ id: tools[i], x: pad + i * (small + gap), y: rowY, w: small, h: 52, label: labels[tools[i]], kind: 'small' });
        const runX = pad + tools.length * (small + gap);
        out.buttons.push({ id: 'run', x: runX, y: rowY, w: SL + out.bottom.w - runX - pad, h: 52, label: 'RUN', kind: 'run' });
        out.buttons.push({ id: 'speed', x: W - SR - 158, y: out.top.y + 7, w: 44, h: 44, label: '2×', kind: 'icon' });
        out.buttons.push({ id: 'mute', x: W - SR - 106, y: out.top.y + 7, w: 44, h: 44, label: 'SND', kind: 'icon' });
      } else {
        const topH = 54, bottomH = 56;
        out.top = { x: SL + 148, y: safe.top + 4, w: W - SL - SR - 156, h: topH };
        out.bottom = { x: SL, y: H - safe.bottom - bottomH, w: W - SL - SR, h: bottomH };
        out.play = { x: 0, y: out.top.y + out.top.h + 2, w: W, h: out.bottom.y - (out.top.y + out.top.h + 2) };
        const y = out.top.y + 5;
        let x = out.top.x + 150;
        for (let i = 0; i < 3; i++) {
          const key = ['wood', 'steel', 'carbon'][i];
          out.buttons.push({ id: 'mat:' + key, x, y, w: 76, h: 44, label: MATS[key].label, sub: '', kind: 'chip', compact: true });
          x += 80;
        }
        out.buttons.push({ id: 'speed', x: W - SR - 158, y, w: 44, h: 44, label: '2×', kind: 'icon' });
        out.buttons.push({ id: 'mute', x: W - SR - 106, y, w: 44, h: 44, label: 'SND', kind: 'icon' });
        const rowY = out.bottom.y + 6, pad = SL + 10, small = 44, gap = 4;
        for (let i = 0; i < tools.length; i++) out.buttons.push({ id: tools[i], x: pad + i * (small + gap), y: rowY, w: small, h: 44, label: labels[tools[i]], kind: 'small' });
        const runX = pad + tools.length * (small + gap) + 6;
        out.buttons.push({ id: 'run', x: runX, y: rowY, w: SL + out.bottom.w - runX - pad, h: 44, label: 'RUN', kind: 'run' });
      }
      return out;
    },


    hit(G, x, y) {
      for (const b of G.ui.buttons) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
      }
      return null;
    },

    text(ctx, str, x, y, size, color, align, weight) {
      ctx.font = (weight || 'bold') + ' ' + size + 'px ' + FONT;
      ctx.textAlign = align || 'left';
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
      ctx.textAlign = 'left';
    },

    wrapLines(ctx, str, maxW, size) {
      ctx.font = '700 ' + size + 'px ' + FONT;
      const words = String(str).split(' ');
      const out = [];
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; }
        else line = test;
      }
      if (line) out.push(line);
      return out;
    },

    drawWrapped(ctx, str, x, y, maxW, size, color) {
      ctx.font = '700 ' + size + 'px ' + FONT;
      ctx.fillStyle = color;
      const words = String(str).split(' ');
      let line = '', yy = y;
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line, x, yy);
          line = w; yy += size + 5;
        } else line = test;
      }
      if (line) ctx.fillText(line, x, yy);
    },

    pill(ctx, x, y, w, h, fill, stroke) {
      rr(ctx, x, y, w, h, h / 2);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    },

    drawButton(ctx, b, active, enabled, accent) {
      const on = active;
      ctx.globalAlpha = enabled === false ? 0.38 : 1;
      rr(ctx, b.x, b.y, b.w, b.h, 12);
      ctx.fillStyle = on ? 'rgba(255,209,102,0.92)' : 'rgba(16,20,28,0.62)';
      ctx.fill();
      ctx.strokeStyle = on ? '#FFE08A' : 'rgba(255,255,255,0.16)';
      ctx.lineWidth = on ? 2 : 1;
      ctx.stroke();

      if (b.kind === 'chip') {
        const m = MATS[b.id.split(':')[1]];
        ctx.fillStyle = m.base;
        rr(ctx, b.x + 6, b.y + 8, 10, b.h - 16, 4); ctx.fill();
        if (b.compact) {
          this.text(ctx, m.label, b.x + 20, b.y + 24, 9, on ? '#20160A' : '#F2F5FA', 'left', '800');
        } else {
          this.text(ctx, b.label, b.x + 22, b.y + 29, 12, on ? '#20160A' : '#F2F5FA', 'left', 'bold');
        }
      } else if (b.kind === 'run') {
        const stop = b.label === 'STOP';
        ctx.fillStyle = on ? '#20160A' : stop ? '#2A2418' : '#0E2418';
        rr(ctx, b.x + 4, b.y + 4, b.w - 8, b.h - 8, 9); ctx.fill();
        this.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 5, b.w > 70 ? 15 : 13, on ? '#FFD166' : stop ? '#FFC46B' : '#7CF0A8', 'center', '800');
      } else if (b.kind === 'icon') {
        this.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 4, 11, on ? '#20160A' : '#E8EEF8', 'center', 'bold');
      } else {
        this.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 4, b.w >= 46 ? 11 : 10, on ? '#20160A' : '#E8EEF8', 'center', 'bold');
      }
      ctx.globalAlpha = 1;
    },

    // The nine-rung load ladder as dots: filled = crossed, gold = the rig on the deck now, a gold
    // ring = the goal tier. Drawn in the load pill so progress reads at a glance, build or run.
    ladder(ctx, x, y, target, G) {
      const run = G.world && G.world.run;
      const live = G.mode === 'run' && run ? run : null;
      let heaviest = -1;
      if (live) heaviest = run.heaviest;
      else if (G.result) heaviest = G.result.heaviest;
      else if (G.best && G.level && G.best[G.level.id] !== undefined) heaviest = G.best[G.level.id];
      const tier = live ? run.tier : -1;
      for (let i = 0; i < LADDER.length; i++) {
        const cx = x + i * 13;
        ctx.beginPath(); ctx.arc(cx, y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = i <= heaviest ? '#3DDC84' : i === tier ? '#FFD166' : 'rgba(255,255,255,0.20)';
        ctx.fill();
        if (i === target) { ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 1.4; ctx.stroke(); }
      }
    },

    /* ---------- build HUD ---------- */

    drawHUD(G) {
      const ctx = root.BW_RENDER.ctx;
      const W = root.BW_RENDER.W;
      const lv = G.level;
      const top = G.ui.top;
      const portrait = G.ui.portrait;
      const span = Math.round(lv.right.edge - lv.left.edge);

      rr(ctx, top.x, top.y, top.w, top.h, 14);
      ctx.fillStyle = 'rgba(14,18,26,0.66)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (portrait) {
        this.text(ctx, 'L' + (G.levelIndex + 1) + ' · ' + lv.name.toUpperCase(), top.x + 14, top.y + 22, 12, '#E8EEF8', 'left', '800');
        this.text(ctx, 'SPAN ' + span + 'px', top.x + 14, top.y + 40, 13, '#FFD166', 'left', '800');
        const goal = lv.goal === undefined ? LADDER.length - 1 : lv.goal;
        this.text(ctx, 'GOAL ' + VEHICLES[LADDER[goal]].weight + ' · FREE BUILD', top.x + 14, top.y + 54, 9, 'rgba(232,238,248,0.6)', 'left', '700');
      } else {
        this.text(ctx, 'L' + (G.levelIndex + 1) + ' · ' + lv.name.toUpperCase(), top.x + 10, top.y + 20, 11, '#E8EEF8', 'left', '800');
        this.text(ctx, 'SPAN ' + span + 'px', top.x + 10, top.y + 38, 12, '#FFD166', 'left', '800');
        // No GOAL line here: the material chips start 150 px in, and the goal weight is already
        // printed on the LOAD pill's ladder (and on the result card). A second copy collided with
        // the SPAN text on desktop, which is the same landscape layout.
      }

      if (G.world) {
        const maxStress = G.world.lastMaxStress || 0;
        const load = clamp(maxStress, 0, 1);
        const sag = Math.max(0, G.world.maxSag || 0);
        const pillW = 170, pillH = 62;
        const px = W - pillW - 12, py = G.ui.play.y + 8;
        ctx.fillStyle = 'rgba(14,18,26,0.62)';
        rr(ctx, px, py, pillW, pillH, 10); ctx.fill();
        const col = load > 0.9 ? '#FF4D4D' : load > 0.75 ? '#FF9F43' : load > 0.5 ? '#FFD166' : '#3DDC84';
        this.text(ctx, 'LOAD ' + Math.round(load * 100) + '%', px + 12, py + 16, 11, '#E8EEF8', 'left', '800');
        this.text(ctx, 'SAG ' + Math.round(sag) + 'px', px + pillW - 12, py + 16, 10, sag > 40 ? '#FF9F43' : 'rgba(232,238,248,0.65)', 'right', '700');
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        rr(ctx, px + 12, py + 22, pillW - 24, 7, 4); ctx.fill();
        ctx.fillStyle = col;
        rr(ctx, px + 12, py + 22, (pillW - 24) * load, 7, 4); ctx.fill();
        const why = G.world.lastFail && G.world.lastFail.reason;
        if (why && G.mode === 'run') {
          const label = why === 'stall' ? 'VEHICLE STALLED' : why === 'snap' ? 'BEAM SNAPPED' : 'VEHICLE FELL';
          this.text(ctx, label, px + 12, py + 40, 8, '#FF9F43', 'left', '800');
        } else {
          const joints = G.world.nodes.filter((n) => !n.anchor && n.beams.some((b) => b.kind === 'road' && !b.broken));
          const tied = joints.filter((n) => G.world.nodeCredit(n) >= 0.15).length;
          this.text(ctx, 'TIED ' + tied + '/' + joints.length + (G.level.par ? ' · PAR ' + G.level.par : ''), px + 12, py + 40, 8,
            tied === joints.length ? '#3DDC84' : '#FF9F43', 'left', '800');
        }
        // Where this span sits on the nine-rung ladder, and which rung the goal asks for.
        const goal = lv.goal === undefined ? LADDER.length - 1 : lv.goal;
        this.ladder(ctx, px + 14, py + 53, goal, G);
        this.text(ctx, VEHICLES[LADDER[goal]].weight.replace(' ', ''), px + pillW - 10, py + 56, 8,
          'rgba(232,238,248,0.55)', 'right', '800');
      }

      if (G.mode === 'run' && G.world && G.world.run) {
        const r = G.world.run;
        const tier = r.tier >= 0 ? r.tier : 0;
        const cur = L.LADDER[Math.min(tier, L.LADDER.length - 1)];
        // Keep a real gap to the LOAD pill: on a 390 px portrait the old 208 px banner met the
        // pill edge-to-edge and read as an overlap (playtest, round 4).
        const wpx = Math.min(208, Math.max(120, W - 202));
        const label = (wpx < 180 ? 'TIER ' + (tier + 1) + '/' + L.LADDER.length + ' · ' : 'TIER ' + (tier + 1) + ' OF ' + L.LADDER.length + ' · ') + VEHICLES[cur].label.toUpperCase();
        const px = 12, py = G.ui.play.y + 10;
        ctx.fillStyle = 'rgba(14,18,26,0.6)';
        rr(ctx, px, py, wpx, 36, 10); ctx.fill();
        this.text(ctx, label, px + wpx / 2, py + 22, 10, '#E8EEF8', 'center', '800');
      }

      // Coach: one short word on the control the next move lives on, under the LOAD pill (out of
      // the playfield, so it never covers a bolt), plus a pulsing ring on that button. Retired the
      // moment the player does it, so it coaches a first run and then gets out of the way.
      if (G.coach) {
        const dev = (G.uiHint && G.uiHint.shown) || 'keyboard';
        const word = G.coach === 'deck'
          ? (dev === 'touch' ? 'NEXT: TAP DECK' : dev === 'pad' ? 'NEXT: Y = DECK' : 'NEXT: F = DECK')
          : (dev === 'touch' ? 'NEXT: TAP RUN' : dev === 'pad' ? 'NEXT: RT = RUN' : 'NEXT: ENTER = RUN');
        const pw = 170, pyy = G.ui.play.y + 74;
        const pulse = 0.5 + 0.5 * Math.sin((G.t || 0) * 5.2);
        ctx.globalAlpha = 0.72 + 0.28 * pulse;
        this.pill(ctx, W - pw - 12, pyy, pw, 24, 'rgba(14,18,26,0.82)', 'rgba(255,209,102,0.5)');
        this.text(ctx, word, W - pw / 2 - 12, pyy + 16, 9.5, '#FFD166', 'center', '900');
        ctx.globalAlpha = 1;
      }

      // Buttons: the coach ring marks the named next move (see G.coach above).
      for (const b of G.ui.buttons) {
        if (b.id === 'run') b.label = G.mode === 'run' ? 'STOP' : 'RUN';
        if (b.id === 'speed') b.label = G.runSpeed + '×';
        const active = b.id === 'mat:' + G.mat || (b.id === 'erase' && G.erase);
        this.drawButton(ctx, b, active, this.enabled(G, b.id));
        if (G.coach && b.id === (G.coach === 'deck' ? 'deck' : 'run')) {
          const pulse2 = 0.40 + 0.45 * Math.sin((G.t || 0) * 5.2);
          rr(ctx, b.x - 3, b.y - 3, b.w + 6, b.h + 6, 15);
          ctx.strokeStyle = 'rgba(255,209,102,' + pulse2.toFixed(2) + ')';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }

      // A crossing gets a short confirmation on the playfield, so progress reads without the HUD.
      if (G.crossing && G.mode === 'run') {
        const alpha = Math.min(1, G.crossing.life / 260);
        ctx.globalAlpha = alpha;
        ctx.font = '900 11px ' + FONT;
        const tw = ctx.measureText(G.crossing.label + ' CROSSED').width + 26;
        const bx = W / 2 - tw / 2, by = G.ui.play.y + 76;   // below the TIER/LOAD band, never on it
        this.pill(ctx, bx, by, tw, 28, 'rgba(16,40,30,0.86)', 'rgba(61,220,132,0.55)');
        this.text(ctx, G.crossing.label + ' CROSSED', W / 2, by + 18, 11, '#7CF0A8', 'center', '900');
        ctx.globalAlpha = 1;
      }
      // Snap flash: a single bright frame at the moment a member lets go.
      if (G.flash > 0) {
        ctx.globalAlpha = Math.min(0.5, G.flash);
        ctx.fillStyle = '#FFE9C4';
        ctx.fillRect(0, 0, W, root.BW_RENDER.H);
        ctx.globalAlpha = 1;
      }
    },


    enabled(G, id) {
      if (!G.world) return true;
      if (G.mode === 'run' && id !== 'run' && id !== 'mute' && id !== 'pause' && id !== 'speed') return false;
      if (id === 'undo') return G.undo.length > 0;
      if (id === 'redo') return G.redo.length > 0;
      if (id === 'run') return true;   // RUN always runs: a build with no deck fails fast, on purpose
      return true;
    },


    // Menu focus ring: pad and keyboard navigation over the canvas buttons.
    drawFocus(G) {
      if (!G.focusId) return;
      const ctx = root.BW_RENDER.ctx;
      const all = (G.ui.buttons || []).concat(G.ui.cards || []);
      const b = all.find((q) => q.id === G.focusId);
      if (!b) return;
      // Two passes: a dark halo first, so the gold ring reads on the sandy title as well as on
      // the dark cards and panels.
      rr(ctx, b.x - 4, b.y - 4, b.w + 8, b.h + 8, 16);
      ctx.strokeStyle = 'rgba(18,20,26,0.85)';
      ctx.lineWidth = 5;
      ctx.stroke();
      rr(ctx, b.x - 4, b.y - 4, b.w + 8, b.h + 8, 16);
      ctx.strokeStyle = '#FFD166';
      ctx.lineWidth = 2;
      ctx.stroke();
    },

    /* ---------- title ---------- */

    drawTitle(G) {
      const ctx = root.BW_RENDER.ctx;
      const W = root.BW_RENDER.W, H = root.BW_RENDER.H;
      const safe = G.safe;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#7EC8F0');
      g.addColorStop(0.5, '#FFD9A0');
      g.addColorStop(1, '#FFE9C4');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      const sx = W * 0.72, sy = H * 0.2;
      const rg = ctx.createRadialGradient(sx, sy, 4, sx, sy, Math.min(W, H) * 0.5);
      rg.addColorStop(0, 'rgba(255,240,192,0.9)');
      rg.addColorStop(1, 'rgba(255,240,192,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

      const horizon = H * 0.54;
      for (let li = 0; li < 3; li++) {
        ctx.fillStyle = ['#B98A7A', '#9A6A62', '#7A4E48'][li];
        ctx.globalAlpha = 0.55 + li * 0.15;
        ctx.beginPath();
        ctx.moveTo(-40, H);
        for (let x = -40; x <= W + 40; x += 14) {
          const y = horizon - 40 + li * 10 + Math.sin((x / W) * 7 + li * 2) * (30 - li * 8);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W + 40, H); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;

      const wg = ctx.createLinearGradient(0, horizon + 30, 0, H);
      wg.addColorStop(0, '#4E7E9A'); wg.addColorStop(1, '#2E556E');
      ctx.fillStyle = wg; ctx.fillRect(0, horizon + 24, W, H - horizon - 24);

      const by = H * 0.585;
      ctx.strokeStyle = '#1E1E1E'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(W * 0.08, by); ctx.lineTo(W * 0.92, by); ctx.stroke();
      ctx.strokeStyle = '#3DDC84'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(W * 0.08, by); ctx.lineTo(W * 0.92, by); ctx.stroke();
      ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 4;
      const bays = 6;
      for (let i = 0; i < bays; i++) {
        const x0 = W * (0.08 + 0.84 * (i / bays));
        const x1 = W * (0.08 + 0.84 * ((i + 1) / bays));
        ctx.beginPath();
        ctx.moveTo(x0, by); ctx.lineTo(x1, by + 52);
        ctx.moveTo(x0, by + 52); ctx.lineTo(x1, by);
        ctx.stroke();
      }
      ctx.strokeStyle = '#1E1E1E'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(W * 0.08, by + 52); ctx.lineTo(W * 0.92, by + 52); ctx.stroke();
      ctx.strokeStyle = '#C98A4B'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(W * 0.08, by + 52); ctx.lineTo(W * 0.92, by + 52); ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = '900 64px ' + FONT;
      const measured = ctx.measureText('BRIDGEWRIGHT').width;
      const titleSize = Math.min(64, (W - 28) * 64 / measured);
      ctx.font = '900 ' + titleSize + 'px ' + FONT;
      ctx.lineWidth = titleSize * 0.14;
      ctx.strokeStyle = '#1E1E1E';
      ctx.strokeText('BRIDGEWRIGHT', W / 2, H * 0.30);
      const tg = ctx.createLinearGradient(0, H * 0.24, 0, H * 0.34);
      tg.addColorStop(0, '#FFF6DE'); tg.addColorStop(1, '#FFD166');
      ctx.fillStyle = tg;
      ctx.fillText('BRIDGEWRIGHT', W / 2, H * 0.30);
      ctx.textAlign = 'left';
      this.text(ctx, 'A BRIDGE SIMULATOR', W / 2, H * 0.36, Math.min(16, W * 0.035), '#3A2A20', 'center', '800');

      // One press is one buildable span: PLAY goes straight into L1. SCENARIOS is the second,
      // named route for a player who wants another span, so a choice screen never gates the
      // first tap. Landscape puts the two side by side, above the safe-area footer.
      const portraitTitle = H > W * 1.05;
      let bw, bh, bx, byy, sbw, sbh, sx2, sy2;
      if (portraitTitle) {
        bw = Math.min(W * 0.62, 300); bh = 62;
        bx = (W - bw) / 2; byy = H * 0.70;
        sbw = bw; sbh = 44;
        sx2 = bx; sy2 = byy + bh + 14;
        this.text(ctx, 'DRAG BOLTS · DECK · RUN', W / 2, byy - 16, 11, 'rgba(30,30,30,0.72)', 'center', '800');
      } else {
        bw = Math.min(W * 0.30, 220); bh = 54;
        sbw = Math.min(W * 0.22, 150); sbh = 54;
        byy = H * 0.72;
        bx = W / 2 - bw - 6; sx2 = W / 2 + 6; sy2 = byy;
      }
      G.ui.buttons = [
        { id: 'play', x: bx, y: byy, w: bw, h: bh, label: 'PLAY', kind: 'run' },
        { id: 'scenarios', x: sx2, y: sy2, w: sbw, h: sbh, label: 'SCENARIOS', kind: 'small' },
      ];
      rr(ctx, bx, byy, bw, bh, 18);
      ctx.fillStyle = '#1E1E1E'; ctx.fill();
      rr(ctx, bx + 3, byy + 3, bw - 6, bh - 6, 16);
      ctx.fillStyle = '#FFD166'; ctx.fill();
      this.text(ctx, 'PLAY', bx + bw / 2, byy + bh / 2 + 8, Math.min(24, bh * 0.42), '#20160A', 'center', '900');
      this.drawButton(ctx, G.ui.buttons[1], false, true);
      if (portraitTitle) {
        this.text(ctx, '8 spans · no budget · build and test', W / 2, sy2 + sbh + 20, 11, 'rgba(30,30,30,0.7)', 'center', '600');
      }

      const ctrl = root.BW_CONTROLS;
      let device = 'keyboard';
      if (ctrl && ctrl.input) device = ctrl.hintDevice ? ctrl.hintDevice() : ctrl.input.device;
      const footer = device === 'touch' ? 'TAP TO PLAY · DRAG BOLTS TO BUILD'
        : device === 'pad' ? 'A TO PLAY · STICK MOVES THE CURSOR · X BRACES'
        : 'ENTER TO PLAY · DRAG BOLTS · SPACE BUILDS WITH THE CURSOR';
      ctx.font = '700 10px ' + FONT;
      const fw = ctx.measureText(footer).width;
      const fs = Math.min(10, (W - 24) * 10 / Math.max(1, fw));
      this.text(ctx, footer, W / 2, H - safe.bottom - 22, fs, 'rgba(30,30,30,0.6)', 'center', '700');
    },


    /* ---------- level select ---------- */

    drawLevels(G) {
      const ctx = root.BW_RENDER.ctx;
      const W = root.BW_RENDER.W, H = root.BW_RENDER.H;
      const safe = G.safe;
      const portrait = G.ui.portrait;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#22303E'); g.addColorStop(1, '#101820');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      const SL = safe.left || 0, SR = safe.right || 0;
      this.text(ctx, 'SCENARIOS', SL + 18, safe.top + 42, 22, '#FFD166', 'left', '900');
      this.text(ctx, 'Every span is open. No budget, no targets.', SL + 18, safe.top + 64, 11, 'rgba(232,238,248,0.65)', 'left', '600');
      if (G.campaignDone) {
        this.text(ctx, 'ALL ' + LEVELS.length + ' SPANS BUILT — NOW CHASE GOLD', SL + 18, safe.top + 80, 10, '#FFD166', 'left', '900');
      }

      const cols = portrait ? 2 : 3;
      const pad = portrait ? 12 : 10;
      const gridY = safe.top + (portrait ? 84 : 72);
      const startX = SL + pad;
      const availW = W - SL - SR - pad * 2;
      const cardW = (availW - pad * (cols - 1)) / cols;
      const cardH = portrait ? 106 : 56;
      const maxRows = Math.floor((H - gridY - safe.bottom - 20) / (cardH + pad));
      G.ui.cards = [];
      for (let i = 0; i < LEVELS.length; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        if (row >= maxRows) break;
        const x = startX + col * (cardW + pad);
        const y = gridY + row * (cardH + pad);
        const lv = LEVELS[i];
        const span = Math.round(lv.right.edge - lv.left.edge);
        G.ui.cards.push({ id: 'level:' + i, x, y, w: cardW, h: cardH, unlocked: true });

        rr(ctx, x, y, cardW, cardH, 14);
        ctx.fillStyle = 'rgba(30,38,50,0.92)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,209,102,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // The first span a new player should open: a pulsing ring and a tag, retired once they
        // have a saved best on it. A menu with no obvious first click is a judgeability problem.
        const hasBest = G.best && G.best[lv.id] !== undefined;
        if (i === 0 && !hasBest) {
          const pulse = 0.5 + 0.5 * Math.sin((G.t || 0) * 4.2);
          ctx.globalAlpha = 0.45 + 0.45 * pulse;
          rr(ctx, x - 2, y - 2, cardW + 4, cardH + 4, 16);
          ctx.strokeStyle = '#FFD166';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.globalAlpha = 1;
          this.text(ctx, 'START HERE', x + cardW - 10, y + (portrait ? 20 : 14), 8, '#FFD166', 'right', '900');
        }

        this.text(ctx, 'L' + (i + 1), x + 12, y + (portrait ? 26 : 18), 16, '#FFD166', 'left', '900');
        this.text(ctx, lv.name, x + 12, y + (portrait ? 46 : 32), 12, '#E8EEF8', 'left', '800');
        const feats = [];
        if (lv.left.top !== lv.right.top) feats.push('DROP');
        if ((lv.piers || []).length) feats.push(lv.piers.length + ' PIER' + (lv.piers.length > 1 ? 'S' : ''));
        if (lv.noUnderDeck) feats.push('NO UNDER');
        if (lv.maxBeam) feats.push('SHORT BEAMS');
        const line2 = span + 'px · ' + (feats.join(' · ') || 'FLAT') + (lv.par ? ' · PAR ' + lv.par : '');
        // Fit the facts line to the card: L4's "400px · DROP · NO UNDER · PAR 16" ran off the edge
        // on a 390 px phone.
        let l2 = 9;
        ctx.font = '700 ' + l2 + 'px ' + FONT;
        while (l2 > 6.5 && ctx.measureText(line2).width > cardW - 24) {
          l2 -= 0.5;
          ctx.font = '700 ' + l2 + 'px ' + FONT;
        }
        this.text(ctx, line2, x + 12, y + (portrait ? 64 : 44), l2, 'rgba(232,238,248,0.6)', 'left', '700');
        // Progress: the saved best for this scenario, plus the goal in tons.
        const best = G.best && G.best[lv.id] !== undefined ? G.best[lv.id] : -1;
        const medal = best >= 0 ? medalForCard(lv, best) : null;
        const goal = lv.goal === undefined ? LADDER.length - 1 : lv.goal;
        this.text(ctx, 'GOAL ' + VEHICLES[LADDER[goal]].weight, x + 12, y + (portrait ? 84 : 56), 8,
          best >= goal ? '#3DDC84' : 'rgba(232,238,248,0.45)', 'left', '800');
        if (best >= 0) {
          const bx2 = x + cardW - 20, by2 = y + 18;
          const col = medal === 'gold' ? '#FFD166' : medal === 'silver' ? '#C8D4E4' : '#C98A4B';
          ctx.beginPath(); ctx.arc(bx2, by2, 7, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
          this.text(ctx, String(best + 1), bx2, by2 + 3, 8, '#20160A', 'center', '900');
        }
      }

      const bx = portrait ? SL + 12 : W - SR - 104, by = portrait ? H - safe.bottom - 52 : safe.top + 8;
      G.ui.buttons = [{ id: 'back', x: bx, y: by, w: 92, h: 44, label: 'BACK', kind: 'small' }];
      this.drawButton(ctx, G.ui.buttons[0], false, true);
    },


    /* ---------- result / pause ---------- */

    medalCircle(ctx, x, y, r, medal, scale) {
      const col = medal === 'gold' ? '#FFD166' : medal === 'silver' ? '#C8D4E4' : '#C98A4B';
      const ink = medal === 'silver' ? '#20242A' : '#20160A';
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(20,18,14,0.65)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r - 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      this.text(ctx, medal === 'gold' ? 'G' : medal === 'silver' ? 'S' : 'B', 0, 6, Math.round(r * 1.1), ink, 'center', '900');
      ctx.restore();
    },

    drawResult(G) {
      const ctx = root.BW_RENDER.ctx;
      const W = root.BW_RENDER.W, H = root.BW_RENDER.H;
      const safe = G.safe;
      ctx.fillStyle = 'rgba(8,10,16,0.66)';
      ctx.fillRect(0, 0, W, H);
      const r0 = G.result;
      const cardW = Math.min(W - 28, 344);
      const cardH = Math.min(384, H - safe.top - safe.bottom - 16);
      const x = (W - cardW) / 2, y = Math.max(safe.top + 8, (H - cardH) / 2);
      rr(ctx, x, y, cardW, cardH, 22);
      ctx.fillStyle = 'rgba(24,30,40,0.98)'; ctx.fill();
      ctx.strokeStyle = r0.medal === 'gold' ? 'rgba(255,209,102,0.75)' : r0.cleared ? 'rgba(61,220,132,0.6)' : 'rgba(255,159,67,0.55)';
      ctx.lineWidth = 2; ctx.stroke();

      const failType = G.world && G.world.lastFail && G.world.lastFail.type;
      const failLabel = failType && VEHICLES[failType] ? VEHICLES[failType].label.toUpperCase() : null;
      const head = r0.allCrossed ? 'ALL 9 CROSSED'
        : r0.cleared ? 'GOAL MET'
        : (failLabel ? 'STOPPED AT ' + failLabel
          : (r0.heaviest < 0 ? 'NOTHING CROSSED' : 'STOPPED AT ' + r0.bestLabel.toUpperCase()));
      const headCol = r0.medal === 'gold' ? '#FFD166' : r0.cleared ? '#3DDC84' : '#FF9F43';
      // Measure the headline instead of estimating it: a long name like STOPPED AT COLOSSUS must
      // not run under the medal mark on the right.
      let headSize = 22;
      ctx.font = '900 ' + headSize + 'px ' + FONT;
      while (headSize > 12 && ctx.measureText(head).width > cardW - 124) {
        headSize -= 1;
        ctx.font = '900 ' + headSize + 'px ' + FONT;
      }
      this.text(ctx, head, x + 24, y + 46, headSize, headCol, 'left', '900');

      // The medal pops in: a result should feel like a stamp, not a paragraph.
      if (r0.medal) {
        const age = G.resultAge || 0;
        const k = age < 0.34 ? 0.35 + (age / 0.34) * 0.85 : 1 - Math.min(0.2, (age - 0.34) * 0.4);
        this.medalCircle(ctx, x + cardW - 42, y + 42, 22, r0.medal, k);
      } else {
        this.text(ctx, 'NO MEDAL', x + cardW - 24, y + 40, 9, 'rgba(232,238,248,0.4)', 'right', '800');
      }

      this.text(ctx, (r0.bestLabel === '—' ? 'NO BEST YET' : 'BEST ' + r0.bestLabel + (r0.bestWeight ? ' ' + r0.bestWeight : ''))
        + ' · SPAN ' + r0.span + 'px',
        x + 24, y + 68, 11, 'rgba(232,238,248,0.75)', 'left', '700');
      // Clamp the rung indexes: L7 once carried gold 9, one past the end of a nine-rung ladder, and
      // this line threw inside the draw, leaving the verdict card with no buttons at all.
      const gi = (i2) => VEHICLES[LADDER[Math.max(0, Math.min(LADDER.length - 1, i2))]].weight;
      const goalTxt = 'GOAL ' + gi(r0.goal)
        + (r0.gold > r0.goal ? ' · TOP ' + gi(r0.gold) : '')
        + (r0.par ? ' · PAR ' + r0.par + ' BEAMS' : '');
      this.text(ctx, goalTxt, x + 24, y + 86, 9, 'rgba(232,238,248,0.5)', 'left', '700');
      if (r0.newBest) {
        this.text(ctx, 'NEW BEST', x + cardW - 24, y + 86, 9, '#3DDC84', 'right', '900');
      }

      const rows = [
        ['TIERS CROSSED', r0.crossed + ' / ' + r0.total],
        ['BEAMS ON THE BRIDGE', String(r0.beams) + (r0.par ? ' / ' + r0.par : '')],
        ['SNAPPED BEAMS', String(r0.snapped)],
        ['MAX DECK SAG', Math.round(r0.sag) + ' px'],
      ];
      rows.forEach((row, i) => {
        const ry = y + 114 + i * 21;
        this.text(ctx, row[0], x + 24, ry, 9.5, 'rgba(232,238,248,0.55)', 'left', '700');
        this.text(ctx, row[1], x + cardW - 24, ry, 10.5, '#E8EEF8', 'right', '800');
      });

      const whyY = y + 200;
      this.text(ctx, r0.allCrossed ? 'WHAT HELD' : 'WHY IT STOPPED', x + 24, whyY, 9,
        r0.allCrossed ? 'rgba(61,220,132,0.85)' : 'rgba(255,159,67,0.9)', 'left', '800');
      this.drawWrapped(ctx, r0.why || 'The ladder ended.', x + 24, whyY + 16, cardW - 48, 10.5, '#E8EEF8');

      // The rung the run reached, drawn on the ladder: the verdict reads as a picture too.
      const by = y + cardH - 54;
      const ladY = Math.min(y + 286, by - 26);
      this.text(ctx, 'LADDER', x + 24, ladY + 3, 8.5, 'rgba(232,238,248,0.5)', 'left', '800');
      this.ladder(ctx, x + 96, ladY, r0.goal, G);
      this.text(ctx, r0.heaviest >= 0 ? 'TIER ' + (r0.heaviest + 1) + '/' + r0.total : 'NONE CROSSED',
        x + cardW - 24, ladY + 3, 8.5, 'rgba(232,238,248,0.7)', 'right', '800');

      const lastSpan = G.levelIndex >= LEVELS.length - 1;
      const bw = (cardW - 48 - 20) / 3;
      G.ui.buttons = [
        { id: 'retry', x: x + 24, y: by, w: bw, h: 44, label: 'RETEST', kind: 'run' },
        { id: 'next', x: x + 24 + bw + 10, y: by, w: bw, h: 44, label: lastSpan ? 'FINISH' : 'NEXT', kind: 'small' },
        { id: 'levels', x: x + 24 + (bw + 10) * 2, y: by, w: bw, h: 44, label: 'SCENARIOS', kind: 'small' },
      ];
      for (const b of G.ui.buttons) this.drawButton(ctx, b, b.id === 'retry', true);
    },

    drawPause(G) {
      const ctx = root.BW_RENDER.ctx;
      const W = root.BW_RENDER.W, H = root.BW_RENDER.H;
      ctx.fillStyle = 'rgba(8,10,16,0.72)';
      ctx.fillRect(0, 0, W, H);
      const cw = Math.min(W - 48, 320), ch = 330;
      const cx = (W - cw) / 2, cy = Math.max(G.safe.top + 12, (H - ch) / 2);
      rr(ctx, cx, cy, cw, ch, 22);
      ctx.fillStyle = 'rgba(24,30,40,0.98)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
      this.text(ctx, 'PAUSED', cx + cw / 2, cy + 38, 24, '#FFD166', 'center', '900');

      const bw = cw - 40, bh = 46, gap = 10;
      const bx = cx + 20;
      let by = cy + 60;
      G.ui.buttons = [
        { id: 'resume', x: bx, y: by, w: bw, h: bh, label: 'RESUME', kind: 'run' },
      ];
      by += bh + gap;
      const half = (bw - 10) / 2;
      G.ui.buttons.push({ id: 'restart', x: bx, y: by, w: half, h: bh, label: 'REBUILD', kind: 'small' });
      G.ui.buttons.push({ id: 'levels', x: bx + half + 10, y: by, w: half, h: bh, label: 'SCENARIOS', kind: 'small' });
      by += bh + gap;
      G.ui.buttons.push({ id: 'sound', x: bx, y: by, w: half, h: bh, label: G.muted ? 'SOUND OFF' : 'SOUND ON', kind: 'small' });
      G.ui.buttons.push({ id: 'haptics', x: bx + half + 10, y: by, w: half, h: bh, label: G.haptics ? 'HAPTICS ON' : 'HAPTICS OFF', kind: 'small' });
      // The how-to card only opens by itself once. A player who joined through SCENARIOS, or who
      // wants the four lines again, can reach it here (playtest round 5, item 5).
      by += bh + gap;
      G.ui.buttons.push({ id: 'howto', x: bx, y: by, w: bw, h: bh, label: 'HOW TO BUILD', kind: 'small' });
      for (const b of G.ui.buttons) this.drawButton(ctx, b, b.id === 'resume', true);
    },

    drawTutorial(G) {
      const ctx = root.BW_RENDER.ctx;
      const W = root.BW_RENDER.W, H = root.BW_RENDER.H;
      ctx.fillStyle = 'rgba(8,10,16,0.62)';
      ctx.fillRect(0, 0, W, H);
      const cw = Math.min(W - 32, 356);
      const cx = (W - cw) / 2;
      const inner = cw - 44;
      const steps = [
        '1. Drag from a bolt. Empty space makes a new joint.',
        '2. ROAD is the deck. Beams above or below it are SUPPORT.',
        '3. DECK lays the road. BRACE adds a starter king post.',
        '4. RUN sends nine rigs. Heavy ones need more depth.',
      ];
      // Measured layout: every step wraps to however many lines it needs, so nothing is clipped on
      // a 390 px phone, and the GOT IT button always sits below the last line.
      let bodyH = 0;
      const measured = steps.map((st) => {
        const lines = this.wrapLines(ctx, st, inner, 12);
        bodyH += lines.length * 17 + 8;
        return lines;
      });
      const ch = Math.min(H - 20, 64 + bodyH + 52 + 50 + 20);
      const cy = Math.max(G.safe.top + 10, (H - ch) / 2);
      rr(ctx, cx, cy, cw, ch, 22);
      ctx.fillStyle = 'rgba(24,30,40,0.98)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,209,102,0.4)'; ctx.lineWidth = 2; ctx.stroke();
      this.text(ctx, 'HOW TO BUILD', cx + cw / 2, cy + 38, 20, '#FFD166', 'center', '900');
      let y = cy + 66;
      for (const lines of measured) {
        for (const ln of lines) { this.text(ctx, ln, cx + 22, y, 12, '#E8EEF8', 'left', '700'); y += 17; }
        y += 8;
      }
      this.text(ctx, 'No budget. Build anything you want.', cx + cw / 2, y + 8, 10, 'rgba(232,238,248,0.6)', 'center', '600');
      // The dismiss line follows the device in use: a phone must not be told to press Space.
      const dev = (G.uiHint && G.uiHint.shown) || 'touch';
      const goWord = dev === 'touch' ? 'TAP ANYWHERE TO START BUILDING'
        : dev === 'pad' ? 'PRESS A TO START BUILDING' : 'PRESS SPACE OR ENTER TO START BUILDING';
      this.text(ctx, goWord, cx + cw / 2, y + 26, 9.5, '#FFD166', 'center', '800');
      const bw = inner, bh = 46;
      G.ui.buttons = [{ id: 'tutorial:ok', x: cx + 22, y: cy + ch - 58, w: bw, h: bh, label: 'GOT IT', kind: 'run' }];
      this.drawButton(ctx, G.ui.buttons[0], true, true);
    },

  };

  root.BW_UI = UI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
