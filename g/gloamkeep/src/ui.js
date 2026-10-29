/* GLOAMKEEP — HUD, shop, dual-mode tower sheet, banners, menus. */
window.GK = window.GK || {};

(function () {
  const C = GK.CFG, P = C.PAL;

  const UI = { safeTop: 0, safeBottom: 0, titleCv: null, title2Cv: null, dev: 'keyboard' };
  const PILL_W = 58;   // the arcade-input ⏸ button owns the top-right 48 px + margins
  // The arcade's ◀ ARCADE tab is an <a> at the top-left. It folds to 44 px of padding + 28 px of
  // chevron, and it EXPANDS to 140 px on :hover — which a finger triggers on touchstart. A HUD
  // drawn under it both looks covered and steals taps (measured: a tap at x=88 navigated away).
  // So the whole game HUD starts at x=150 and the top-left 150x52 stays the pill's.
  const PILL_L = 150;

  const TXT = '#e8e4d6';
  const DIM = '#8d93a8';
  const GOLD = '#ffd166';
  const BAD = '#ff6b6b';
  const GOOD = '#7ee06b';
  const BORDER = '#2c3147';

  function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  function panel(ctx, x, y, w, h, alpha, border) {
    ctx.fillStyle = 'rgba(9,11,18,' + (alpha == null ? 0.86 : alpha) + ')';
    rr(ctx, x, y, w, h, 6);
    ctx.fill();
    if (border !== false) {
      ctx.strokeStyle = border || BORDER;
      ctx.lineWidth = 1;
      rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
      ctx.stroke();
    }
  }

  function txt(ctx, s, x, y, size, col, align, weight) {
    ctx.font = (weight || 600) + ' ' + size + 'px ui-monospace, Menlo, "Courier New", monospace';
    ctx.fillStyle = col;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }

  function inRect(x, y, r) {
    return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function measure(ctx, s, size, weight) {
    ctx.font = (weight || 600) + ' ' + size + 'px ui-monospace, Menlo, "Courier New", monospace';
    return ctx.measureText(s).width;
  }

  function pixelText(text, px, col) {
    const m = document.createElement('canvas').getContext('2d');
    m.font = 'bold ' + px + 'px ui-monospace, Menlo, monospace';
    const w = Math.ceil(m.measureText(text).width) + 4;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = px + 6;
    const c = cv.getContext('2d');
    c.font = 'bold ' + px + 'px ui-monospace, Menlo, monospace';
    c.fillStyle = col;
    c.textBaseline = 'top';
    c.fillText(text, 2, 2);
    return cv;
  }

  UI.measureSafe = function () {
    const el = document.getElementById('safe-probe');
    if (!el) return;
    const cs = getComputedStyle(el);
    UI.safeTop = parseFloat(cs.paddingTop) || 0;
    UI.safeBottom = parseFloat(cs.paddingBottom) || 0;
  };

  UI.init = function () {
    UI.titleCv = pixelText('GLOAMKEEP', 10, '#ffe9a8');
    UI.title2Cv = pixelText('GLOAMKEEP', 10, '#ffb347');
  };

  // ---- layout -------------------------------------------------------------
  UI.layout = function () {
    const W = GK.W, H = GK.H;
    const st = UI.safeTop, sb = UI.safeBottom;
    const land = W / H >= 1.15;
    const L = { W, H, land, st, sb };
    const S = GK.Game.S();
    const selected = !!(S && S.selected);

    if (land) {
      L.topH = 52;
      L.shopW = Math.min(168, Math.max(132, Math.round(W * 0.18)));
      L.area = { x: 0, y: L.topH + st, w: W - L.shopW, h: H - L.topH - st - sb };
      L.bar = { x: PILL_L, y: st + 4, w: W - L.shopW - PILL_L - 12 - PILL_W, h: 44 };
      L.shop = { x: W - L.shopW + 5, y: st + L.topH + 12, w: L.shopW - 10, h: H - st - L.topH - sb - 16 };
      L.strip = null;
    } else {
      L.topH = 68;
      L.bottomH = 76 + sb;
      L.area = { x: 0, y: L.topH + st, w: W, h: H - L.topH - st - L.bottomH };
      L.bar = { x: PILL_L, y: st + 4, w: W - PILL_L - 12 - PILL_W, h: 44 };
      L.strip = { x: PILL_L, y: L.bar.y + L.bar.h + 2, w: W - PILL_L - 12 - PILL_W, h: 16 };
      L.shop = { x: 5, y: H - sb - 76, w: W - 10, h: 72 };
    }

    L.scale = Math.min(L.area.w / C.W, L.area.h / C.H);
    L.wx = L.area.x + (L.area.w - C.W * L.scale) / 2;
    L.wy = L.area.y;
    L.worldRect = { x: L.wx, y: L.wy, w: C.W * L.scale, h: C.H * L.scale };

    // Landscape: the moor is 12x20, so its height sets the scale and leaves a wide band of empty
    // screen either side (the round-4 tester measured a 203 px field in 844 px). Those bands now
    // carry live panels instead of void: THE KEEP on the left, NEXT WAVE on the right. Nothing is
    // drawn in the 150x52 arcade-pill corner or under the ⏸ button.
    if (land) {
      const gapL = L.worldRect.x - L.area.x - 12;
      const gapR = L.area.x + L.area.w - (L.worldRect.x + L.worldRect.w) - 12;
      L.leftPanel = gapL >= 120 ? { x: L.area.x + 12, y: L.area.y + 4, w: Math.min(330, gapL - 2), h: L.area.h - 10 } : null;
      L.rightPanel = gapR >= 120 ? { x: L.worldRect.x + L.worldRect.w + 8, y: L.area.y + 4, w: Math.min(330, gapR - 12), h: L.area.h - 10 } : null;
    }

    const bw = 44, bh = 44;
    const by = L.bar.y + (L.bar.h - bh) / 2;
    const bx = L.bar.x + L.bar.w - bw - 5;
    L.hit = {
      speed: { x: bx, y: by, w: bw, h: bh },
      pause: null,          // the arcade-input ⏸ button is a real 48 px DOM control, top-right
      flare: null,          // set below: the 5th shop slot is SEND in prep and FLARE in a wave
      shop: [],
      send: null,
      panel: {}
    };

    // shop
    const n = 5, pad = 2;
    if (land) {
      const gap = 5;
      const bh2 = (L.shop.h - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const r = { x: L.shop.x + 2, y: L.shop.y + i * (bh2 + gap), w: L.shop.w - 4, h: bh2 };
        if (i < 4) L.hit.shop.push(Object.assign({ type: Object.keys(C.TOWERS)[i] }, r));
        else L.hit.send = r;
      }
    } else {
      const bw2 = (L.shop.w - pad * (n + 1)) / n;
      for (let i = 0; i < n; i++) {
        const r = { x: L.shop.x + pad + i * (bw2 + pad), y: L.shop.y + 2, w: bw2, h: L.shop.h - 4 };
        if (i < 4) L.hit.shop.push(Object.assign({ type: Object.keys(C.TOWERS)[i] }, r));
        else L.hit.send = r;
      }
    }

    // the 5th shop slot is the one contextual action button: SEND in prep, FLARE in a wave
    L.hit.flare = L.hit.send;

    // tower sheet (replaces the shop while a tower is selected). In landscape the sheet lives in
    // the right column where the shop sits, so it no longer covers the bottom of the map.
    if (selected) {
      if (land) {
        const pr = { x: L.shop.x, y: L.shop.y, w: L.shop.w, h: L.shop.h };
        L.panelRect = pr;
        const rowH = 44, gap = 2, y0 = pr.y + 22;
        const col = (i) => ({ x: pr.x, y: y0 + i * (rowH + gap), w: pr.w, h: rowH });
        L.hit.panel = {
          a: col(0), b: col(1), tgt: col(2), upg: col(3), sell: col(4), close: col(5)
        };
      } else {
        L.panelRect = { x: 5, y: H - sb - 124, w: W - 10, h: 118 };
        const pr = L.panelRect;
        const rowY = pr.y + 22;
        const rowH = 44;
        const bw = (pr.w - 16 - 18) / 4;
        const actY = pr.y + 70;
        L.hit.panel = {
          a: { x: pr.x + 8, y: rowY, w: bw, h: rowH },
          b: { x: pr.x + 8 + bw + 6, y: rowY, w: bw, h: rowH },
          tgt: { x: pr.x + 8 + (bw + 6) * 2, y: rowY, w: bw, h: rowH },
          close: { x: pr.x + 8 + (bw + 6) * 3, y: rowY, w: bw, h: rowH },
          upg: { x: pr.x + 8, y: actY, w: (pr.w - 16) * 0.6 - 3, h: rowH },
          sell: { x: pr.x + 8 + (pr.w - 16) * 0.6 + 3, y: actY, w: (pr.w - 16) * 0.4 - 3, h: rowH }
        };
      }
    }

    L.hit.start = { x: W / 2 - 110, y: H * 0.56, w: 220, h: 60 };
    L.hit.retry = { x: W / 2 - 100, y: H * 0.64, w: 200, h: 58 };
    L.hit.resume = { x: W / 2 - 100, y: H * 0.5, w: 200, h: 56 };
    L.hit.mute = { x: W / 2 - 100, y: H * 0.5 + 70, w: 200, h: 48 };

    UI.hit = L.hit;
    return L;
  };

  // ---- pieces -------------------------------------------------------------
  function lanternIcon(ctx, x, y, s) {
    const u = s / 8;
    ctx.fillStyle = P.iron;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#141422';
    ctx.fillRect(x + u, y + u, s - 2 * u, s - 2 * u);
    ctx.fillStyle = P.fire;
    ctx.fillRect(x + 3 * u, y + 2 * u, 2 * u, 4 * u);
    ctx.fillStyle = P.flame;
    ctx.fillRect(x + 3.5 * u, y + 3 * u, u, 2 * u);
    ctx.fillStyle = P.ironLit;
    ctx.fillRect(x, y, s, u);
  }

  function drawTopBar(ctx, L) {
    const S = GK.Game.S();
    const b = L.bar;
    panel(ctx, b.x, b.y, b.w, b.h, 0.82);
    const cy = b.y + b.h / 2;
    const inWave = S.status === 'wave';
    const ready = inWave && S.flareCd <= 0;
    const sp = L.hit.speed;

    // the lantern glows when FLARE is ready; the icon owns the left edge of the bar in both layouts
    const lanternX = b.x + 6;
    if (ready) {
      const glow = 0.35 + 0.3 * Math.sin(S.time * 5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = glow;
      ctx.fillStyle = 'rgba(255,209,102,0.6)';
      ctx.beginPath(); ctx.arc(lanternX + 7, cy, 12, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    if (b.w >= 300) {
      // roomy (landscape / desktop): labelled two-line readouts
      let x = lanternX;
      lanternIcon(ctx, x, cy - 7, 14);
      txt(ctx, 'LIGHT', x + 19, cy - 7, 8, ready ? GOLD : DIM, 'left', 600);
      txt(ctx, String(S.lives), x + 19, cy + 8, 14, S.lives <= 5 ? BAD : TXT, 'left', 700);
      x += 64;

      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(x + 6, cy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c98a1a';
      ctx.beginPath(); ctx.arc(x + 6, cy, 2.2, 0, Math.PI * 2); ctx.fill();
      txt(ctx, 'GOLD', x + 16, cy - 7, 8, DIM, 'left', 600);
      txt(ctx, String(S.gold), x + 16, cy + 8, 14, GOLD, 'left', 700);
      x += 62;

      txt(ctx, 'WAVE', x, cy - 7, 8, DIM, 'left', 600);
      txt(ctx, S.wave + '/' + C.WAVES.length, x, cy + 8, 14, TXT, 'left', 700);
    } else {
      // 390 px portrait: five readouts in 170 px. WAVE is anchored to the speed button and the
      // left group shrinks to fit, so the wave counter can never run into "1x" (measured "1/121x"
      // by the round-4 tester).
      const waveStr = S.wave + '/' + C.WAVES.length;
      const lv = String(S.lives), gv = String(S.gold);
      let sz = 12, coin = 12;
      const room = sp.x - 7 - (b.x + 6);
      const need = () => 15 + measure(ctx, lv, sz, 700) + 8 + coin + measure(ctx, gv, sz, 700) + 6 +
                         measure(ctx, waveStr, sz, 700);
      if (need() > room) coin = 0;
      if (need() > room) sz = 11;
      if (need() > room) sz = 10;

      lanternIcon(ctx, lanternX, cy - 6, 12);
      let x = lanternX + 15;
      txt(ctx, lv, x, cy, sz, S.lives <= 5 ? BAD : TXT, 'left', 700);
      x += measure(ctx, lv, sz, 700) + 8;
      if (coin) {
        ctx.fillStyle = GOLD;
        ctx.beginPath(); ctx.arc(x + 5, cy, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c98a1a';
        ctx.beginPath(); ctx.arc(x + 5, cy, 1.8, 0, Math.PI * 2); ctx.fill();
        x += coin;
      }
      txt(ctx, gv, x, cy, sz, GOLD, 'left', 700);

      const ww = measure(ctx, waveStr, sz, 700);
      txt(ctx, waveStr, sp.x - 7 - ww, cy, sz, TXT, 'left', 700);
    }

    // KEEP HEAT gauge: one pip per step, at the bottom edge of the bar. It fills with kills in a
    // chain and cools when the chain drops; each pip is -4% on the FLARE recharge (C.HEAT.flareCut).
    const pw = 4, pg = 2, py = b.y + b.h - 6;
    for (let i = 0; i < C.HEAT.max; i++) {
      ctx.fillStyle = i < S.heat ? (S.heat >= C.HEAT.max ? GOLD : P.ember) : 'rgba(40,46,66,0.9)';
      ctx.fillRect(b.x + 6 + i * (pw + pg), py, pw, 3);
    }
    if (S.heat > 0) {
      ctx.font = '700 7px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = S.heat >= C.HEAT.max ? GOLD : DIM;
      ctx.fillText('HEAT', b.x + 6 + C.HEAT.max * (pw + pg) + 3, py + 1);
    }

    panel(ctx, sp.x, sp.y, sp.w, sp.h, S.speed === 2 ? 0.95 : 0.5, S.speed === 2 ? GOLD : BORDER);
    txt(ctx, S.speed + '\u00d7', sp.x + sp.w / 2, sp.y + sp.h / 2, 14, S.speed === 2 ? GOLD : TXT, 'center', 700);
  }

  function drawShop(ctx, L) {
    const S = GK.Game.S();
    panel(ctx, L.shop.x, L.shop.y, L.shop.w, L.shop.h, 0.9);
    for (const r of L.hit.shop) {
      const d = C.TOWERS[r.type];
      const afford = S.gold >= d.cost;
      const active = S.buildMode === r.type;
      panel(ctx, r.x, r.y, r.w, r.h, active ? 0.98 : 0.45,
            active ? GOLD : (afford ? (d.accent || '#3a4160') : '#242838'));
      const spr = GK.Spr.get(r.type);
      const iconSize = L.land ? 30 : 26;
      const iconX = L.land ? r.x + 9 : r.x + r.w / 2 - iconSize / 2;
      const iconY = L.land ? r.y + r.h / 2 - iconSize / 2 : r.y + 3;
      ctx.globalAlpha = afford ? 1 : 0.42;
      ctx.drawImage(spr.cv, iconX, iconY, iconSize, iconSize * 1.35);
      ctx.globalAlpha = 1;

      if (L.land) {
        txt(ctx, d.short, r.x + 46, r.y + r.h / 2 - 9, 11, afford ? TXT : DIM, 'left', 700);
        txt(ctx, String(d.cost), r.x + 46, r.y + r.h / 2 + 9, 12, afford ? GOLD : DIM, 'left', 700);
      } else {
        txt(ctx, d.short, r.x + r.w / 2, r.y + 43, 10, afford ? TXT : DIM, 'center', 700);
        txt(ctx, String(d.cost), r.x + r.w / 2, r.y + 59, 13, afford ? GOLD : DIM, 'center', 700);
      }
    }

    const sr = L.hit.send;
    const prep = S.status === 'prep';
    const ready = S.flareCd <= 0;
    if (prep) {
      panel(ctx, sr.x, sr.y, sr.w, sr.h, 0.95, GOLD);
      if (L.land) {
        txt(ctx, 'SEND', sr.x + sr.w / 2, sr.y + sr.h / 2 - 9, 12, GOLD, 'center', 700);
        txt(ctx, '+' + Math.ceil(S.prepT) * 2, sr.x + sr.w / 2, sr.y + sr.h / 2 + 9, 11, TXT, 'center', 600);
      } else {
        txt(ctx, 'SEND', sr.x + sr.w / 2, sr.y + 24, 10, GOLD, 'center', 700);
        txt(ctx, '+' + Math.ceil(S.prepT) * 2, sr.x + sr.w / 2, sr.y + 44, 12, TXT, 'center', 600);
      }
    } else {
      // the same slot carries the keep lantern while a wave runs: FLARE marks every foe
      const col = ready ? GOLD : '#3a4160';
      panel(ctx, sr.x, sr.y, sr.w, sr.h, ready ? 0.95 : 0.6, col);
      const label = ready ? 'FLARE' : Math.ceil(S.flareCd) + 's';
      const sub = ready ? 'MARK ALL' : 'RECHARGE';
      if (L.land) {
        txt(ctx, label, sr.x + sr.w / 2, sr.y + sr.h / 2 - 9, 12, ready ? GOLD : DIM, 'center', 700);
        txt(ctx, sub, sr.x + sr.w / 2, sr.y + sr.h / 2 + 9, 10, ready ? TXT : DIM, 'center', 600);
      } else {
        txt(ctx, label, sr.x + sr.w / 2, sr.y + 24, 11, ready ? GOLD : DIM, 'center', 700);
        txt(ctx, sub, sr.x + sr.w / 2, sr.y + 44, 10, ready ? TXT : DIM, 'center', 600);
      }
      if (!ready) {
        const p = 1 - S.flareCd / C.FLARE.cd;
        ctx.fillStyle = '#1a1e2c';
        ctx.fillRect(sr.x + 4, sr.y + sr.h - 6, sr.w - 8, 3);
        ctx.fillStyle = P.ember;
        ctx.fillRect(sr.x + 4, sr.y + sr.h - 6, Math.max(1, Math.round((sr.w - 8) * p)), 3);
      }
    }
  }

  /** Landscape tower sheet: six 44 px rows in the right column where the shop sits, so the sheet
   *  never covers the map. Portrait keeps the compact bottom sheet. */
  function drawPanelColumn(ctx, L) {
    const S = GK.Game.S();
    const t = S.selected;
    if (!t) return;
    const pr = L.panelRect;
    const d = C.TOWERS[t.type];
    const st = GK.Towers.stats(t);
    const btns = L.hit.panel;
    const up = GK.Towers.upCost(t);
    const sv = GK.Towers.sellValue(t);
    const accent = GK.Towers.MODE_COL[st.kind] || GOLD;
    const lv = t.level - 1;

    panel(ctx, pr.x, pr.y, pr.w, pr.h, 0.96);
    txt(ctx, d.name, pr.x + 8, pr.y + 12, 11, TXT, 'left', 700);
    txt(ctx, 'LVL ' + t.level + '/' + C.MAX_LEVEL, pr.x + pr.w - 8, pr.y + 12, 9, GOLD, 'right', 700);

    for (const m of ['a', 'b']) {
      const r = btns[m];
      const md = d.modes[m];
      const on = t.fireMode === m;
      panel(ctx, r.x, r.y, r.w, r.h, on ? 0.98 : 0.45, on ? accent : '#3a4160');
      txt(ctx, m.toUpperCase() + ' \u00b7 ' + md.name, r.x + r.w / 2, r.y + 15, 11,
          on ? accent : TXT, 'center', 700);
      const mdmg = (md.dmg * C.LVL_DMG[lv]).toFixed(md.dmg < 10 ? 1 : 0);
      const mrate = (md.rate * C.LVL_RATE[lv]).toFixed(2);
      txt(ctx, mdmg + ' dmg ' + mrate + 's', r.x + r.w / 2, r.y + 31, 8,
          on ? TXT : DIM, 'center', 600);
    }

    const rt = btns.tgt;
    panel(ctx, rt.x, rt.y, rt.w, rt.h, 0.5, '#3a4160');
    txt(ctx, 'TARGET \u00b7 ' + t.target.toUpperCase(), rt.x + rt.w / 2, rt.y + rt.h / 2, 10,
        TXT, 'center', 700);

    const rc = btns.close;
    panel(ctx, rc.x, rc.y, rc.w, rc.h, 0.4, '#3a4160');
    txt(ctx, '\u00d7 CLOSE', rc.x + rc.w / 2, rc.y + rc.h / 2, 11, DIM, 'center', 700);

    const canUp = t.level < C.MAX_LEVEL && S.gold >= up;
    panel(ctx, btns.upg.x, btns.upg.y, btns.upg.w, btns.upg.h, canUp ? 0.95 : 0.35,
          canUp ? GOOD : '#242838');
    txt(ctx, t.level >= C.MAX_LEVEL ? 'MAX LEVEL' : 'UPGRADE \u00b7 ' + up,
        btns.upg.x + btns.upg.w / 2, btns.upg.y + btns.upg.h / 2, 11,
        canUp ? TXT : DIM, 'center', 700);

    panel(ctx, btns.sell.x, btns.sell.y, btns.sell.w, btns.sell.h, 0.55, '#5a3340');
    txt(ctx, 'SELL +' + sv, btns.sell.x + btns.sell.w / 2, btns.sell.y + btns.sell.h / 2, 10,
        TXT, 'center', 700);

    // a tall desktop column has room below the buttons: show the honest numbers there
    const below = btns.close.y + btns.close.h + 14;
    if (pr.y + pr.h - below > 60) {
      const rowW = pr.w;
      panel(ctx, pr.x, below, rowW, 54, 0.55, '#2c3147');
      txt(ctx, 'DMG ' + st.dmg.toFixed(1) + '   RATE ' + st.rate.toFixed(2) + 's',
          pr.x + 8, below + 14, 9, TXT, 'left', 600);
      txt(ctx, 'RNG ' + Math.round(st.range) + '   ' + (st.kind || '').toUpperCase(),
          pr.x + 8, below + 30, 9, DIM, 'left', 600);
      txt(ctx, 'X SWAPS MODE \u00b7 E UPGRADES', pr.x + 8, below + 46, 8, DIM, 'left', 600);
    }
  }

  function drawPanel(ctx, L) {
    if (L.land) { drawPanelColumn(ctx, L); return; }
    const S = GK.Game.S();
    const t = S.selected;
    if (!t) return;
    const pr = L.panelRect;
    const d = C.TOWERS[t.type];
    const st = GK.Towers.stats(t);
    const btns = L.hit.panel;
    const up = GK.Towers.upCost(t);
    const sv = GK.Towers.sellValue(t);
    const accent = GK.Towers.MODE_COL[st.kind] || GOLD;
    const lv = t.level - 1;

    panel(ctx, pr.x, pr.y, pr.w, pr.h, 0.96);

    // title row
    txt(ctx, d.name, pr.x + 10, pr.y + 12, 12, TXT, 'left', 700);
    txt(ctx, 'LVL ' + t.level + '/' + C.MAX_LEVEL, pr.x + pr.w - 10, pr.y + 12, 10, GOLD, 'right', 700);

    // dual modes + target + close
    for (const m of ['a', 'b']) {
      const r = btns[m];
      const md = d.modes[m];
      const on = t.fireMode === m;
      panel(ctx, r.x, r.y, r.w, r.h, on ? 0.98 : 0.45, on ? accent : '#3a4160');
      txt(ctx, m.toUpperCase() + ' \u00b7 ' + md.name, r.x + r.w / 2, r.y + 15, 10,
          on ? accent : TXT, 'center', 700);
      const mdmg = (md.dmg * C.LVL_DMG[lv]).toFixed(md.dmg < 10 ? 1 : 0);
      const mrate = (md.rate * C.LVL_RATE[lv]).toFixed(2);
      txt(ctx, mdmg + ' dmg ' + mrate + 's', r.x + r.w / 2, r.y + 31, 8,
          on ? TXT : DIM, 'center', 600);
    }

    const rt = btns.tgt;
    panel(ctx, rt.x, rt.y, rt.w, rt.h, 0.5, '#3a4160');
    txt(ctx, 'TARGET', rt.x + rt.w / 2, rt.y + 14, 8, DIM, 'center', 600);
    txt(ctx, t.target.toUpperCase(), rt.x + rt.w / 2, rt.y + 30, 11, TXT, 'center', 700);

    const rc = btns.close;
    panel(ctx, rc.x, rc.y, rc.w, rc.h, 0.4, '#3a4160');
    txt(ctx, '\u00d7', rc.x + rc.w / 2, rc.y + rc.h / 2, 18, DIM, 'center', 700);

    // upgrade
    const canUp = t.level < C.MAX_LEVEL && S.gold >= up;
    panel(ctx, btns.upg.x, btns.upg.y, btns.upg.w, btns.upg.h, canUp ? 0.95 : 0.35,
          canUp ? GOOD : '#242838');
    if (t.level >= C.MAX_LEVEL) {
      txt(ctx, 'MAX LEVEL', btns.upg.x + btns.upg.w / 2, btns.upg.y + btns.upg.h / 2, 12, DIM, 'center', 700);
    } else {
      txt(ctx, 'UPGRADE \u00b7 ' + up, btns.upg.x + btns.upg.w / 2, btns.upg.y + btns.upg.h / 2, 12,
          canUp ? TXT : DIM, 'center', 700);
    }

    // sell
    panel(ctx, btns.sell.x, btns.sell.y, btns.sell.w, btns.sell.h, 0.55, '#5a3340');
    txt(ctx, 'SELL +' + sv, btns.sell.x + btns.sell.w / 2, btns.sell.y + btns.sell.h / 2, 11,
        TXT, 'center', 700);
  }

  function drawInfoStrip(ctx, L) {
    const S = GK.Game.S();
    const boss = GK.Enemies.boss();

    if (L.strip) {
      const s = L.strip;
      if (boss) {
        const marked = boss.markT > 0;
        panel(ctx, s.x, s.y, s.w, s.h, 0.8, marked ? '#c9a227' : '#6a3a7a');
        txt(ctx, marked ? 'MARKED' : 'SOVEREIGN', s.x + 8, s.y + s.h / 2, 9,
            marked ? GOLD : '#d9b6ff', 'left', 700);
        const bx = s.x + 74, bwid = s.w - 118;
        ctx.fillStyle = '#1a1020';
        ctx.fillRect(bx, s.y + 5, bwid, 6);
        ctx.fillStyle = marked ? '#ffd166' : '#c86bd6';
        ctx.fillRect(bx, s.y + 5, Math.max(1, Math.round(bwid * (boss.hp / boss.maxHp))), 6);
        txt(ctx, marked ? 'NO ARMOUR' : 'FLARE IT', s.x + s.w - 8, s.y + s.h / 2, 8,
            marked ? GOLD : DIM, 'right', 700);
      } else {
        panel(ctx, s.x, s.y, s.w, s.h, 0.7, '#232838');
        if (S.status === 'prep') {
          txt(ctx, 'NEXT ' + Math.ceil(Math.max(0, S.prepT)) + 's', s.x + 6, s.y + s.h / 2, 9, GOLD, 'left', 700);
          const def = C.WAVES[S.wave - 1] || [];
          let ix = s.x + s.w - 6;
          for (let i = def.length - 1; i >= 0; i--) {
            const g = def[i];
            const ed = C.ENEMIES[g.t];
            const label = '\u00d7' + g.n;
            ctx.font = '600 8px ui-monospace, Menlo, monospace';
            const tw = ctx.measureText(label).width;
            ix -= tw;
            txt(ctx, label, ix, s.y + s.h / 2, 8, DIM, 'left', 600);
            ix -= 2;
            const spr = GK.Spr.get(ed.spr);
            ix -= 11;
            ctx.drawImage(spr.cv, ix, s.y + 2, 11, 11);
            ix -= 3;
            if (ix < s.x + Math.round(s.w * 0.5)) break;
          }
        } else {
          const ready = S.flareCd <= 0;
          txt(ctx, ready ? 'FLARE READY' : 'FLARE ' + Math.ceil(S.flareCd) + 's',
              s.x + 6, s.y + s.h / 2, 9, ready ? GOLD : DIM, 'left', 700);
          // the right side carries the two honest numbers of a wave: the chain and KEEP HEAT
          const right = S.streak >= 3 ? '\u00d7' + S.streak : 'KILLED ' + S.waveKilled + '/' + S.waveTotal;
          txt(ctx, right, s.x + s.w - 6, s.y + s.h / 2, 9, S.streak >= 3 ? GOLD : DIM, 'right', 600);
        }
      }
    } else {
      const cy = L.bar.y + L.bar.h / 2;
      if (boss) {
        const marked = boss.markT > 0;
        txt(ctx, marked ? 'MARKED ' + Math.ceil(boss.hp) : 'SOVEREIGN ' + Math.ceil(boss.hp),
            L.hit.speed.x - 10, cy, 10, marked ? GOLD : '#d9b6ff', 'right', 700);
      } else if (S.status === 'prep') {
        txt(ctx, 'NEXT ' + Math.ceil(Math.max(0, S.prepT)) + 's', L.hit.speed.x - 10, cy, 10, GOLD, 'right', 700);
      } else if (S.streak >= 3) {
        txt(ctx, 'STREAK \u00d7' + S.streak, L.hit.speed.x - 10, cy, 10, GOLD, 'right', 700);
      } else {
        txt(ctx, 'KILLED ' + S.waveKilled + '/' + S.waveTotal, L.hit.speed.x - 10, cy, 10, DIM, 'right', 600);
      }
    }
  }

  /** Landscape left column: the keep's numbers, drawn live. Display only, no hit rects. */
  function drawLeftPanel(ctx, L) {
    const p = L.leftPanel;
    if (!p) return;
    const S = GK.Game.S();
    panel(ctx, p.x, p.y, p.w, p.h, 0.82);
    let y = p.y + 16;
    txt(ctx, 'THE KEEP', p.x + 12, y, 10, GOLD, 'left', 700);
    txt(ctx, 'BEST WAVE ' + S.best, p.x + p.w - 12, y, 8, DIM, 'right', 600);
    y += 24;

    // LIGHT: 20 pips in two rows of ten, so a glance reads the whole health of the run
    txt(ctx, 'LIGHT', p.x + 12, y, 8, DIM, 'left', 600);
    txt(ctx, S.lives + '/' + C.START_LIVES, p.x + p.w - 12, y, 11,
        S.lives <= 5 ? BAD : TXT, 'right', 700);
    y += 13;
    const pipW = Math.max(5, Math.min(14, (p.w - 24 - 27) / 10));
    for (let i = 0; i < C.START_LIVES; i++) {
      const px = p.x + 12 + (i % 10) * (pipW + 3);
      const py = y + Math.floor(i / 10) * 7;
      ctx.fillStyle = i < S.lives ? (S.lives <= 5 ? BAD : P.ember) : '#232838';
      ctx.fillRect(px, py, pipW, 5);
    }
    y += 30;   // two pip rows end at +12; the GOLD/WAVE labels sit 6 above y (10-26 tester: overlap)

    // GOLD + WAVE
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(p.x + 17, y, 5, 0, Math.PI * 2); ctx.fill();
    txt(ctx, 'GOLD', p.x + 26, y - 6, 8, DIM, 'left', 600);
    txt(ctx, String(S.gold), p.x + 26, y + 7, 12, GOLD, 'left', 700);
    txt(ctx, 'WAVE', p.x + p.w - 46, y - 6, 8, DIM, 'left', 600);
    txt(ctx, S.wave + '/' + C.WAVES.length, p.x + p.w - 46, y + 7, 12, TXT, 'left', 700);
    y += 26;

    // KEEP HEAT: ten pips, and the honest number they buy
    txt(ctx, 'HEAT', p.x + 12, y, 8, DIM, 'left', 600);
    const hpw = Math.max(4, Math.min(10, (p.w - 90) / 10 - 2));
    for (let i = 0; i < C.HEAT.max; i++) {
      ctx.fillStyle = i < S.heat ? (S.heat >= C.HEAT.max ? GOLD : P.ember) : '#232838';
      ctx.fillRect(p.x + 46 + i * (hpw + 2), y - 3, hpw, 5);
    }
    txt(ctx, '\u2212' + Math.round(S.heat * C.HEAT.flareCut * 100) + '% FLARE',
        p.x + p.w - 12, y, 8, S.heat > 0 ? GOLD : DIM, 'right', 600);
    y += 20;

    // the wave verb, with its real cooldown
    if (S.status === 'wave') {
      const ready = S.flareCd <= 0;
      panel(ctx, p.x + 10, y, p.w - 20, 34, ready ? 0.9 : 0.5, ready ? GOLD : '#2c3147');
      txt(ctx, ready ? 'FLARE READY' : 'FLARE ' + Math.ceil(S.flareCd) + 's',
          p.x + p.w / 2, y + 12, 10, ready ? GOLD : DIM, 'center', 700);
      txt(ctx, ready ? (UI.dev === 'touch' ? 'TAP THE 5TH SLOT' : UI.dev === 'pad' ? 'PRESS RB' : 'PRESS SPACE')
                     : 'MARKS EVERY FOE',
          p.x + p.w / 2, y + 25, 8, ready ? TXT : DIM, 'center', 600);
      if (!ready) {
        ctx.fillStyle = '#1a1e2c';
        ctx.fillRect(p.x + 14, y + 31, p.w - 28, 3);
        ctx.fillStyle = P.ember;
        ctx.fillRect(p.x + 14, y + 31, Math.max(1, (p.w - 28) * (1 - S.flareCd / C.FLARE.cd)), 3);
      }
      y += 42;
    } else {
      panel(ctx, p.x + 10, y, p.w - 20, 34, 0.7, '#2c3147');
      txt(ctx, 'SEND EARLY +' + Math.ceil(Math.max(0, S.prepT)) * 2,
          p.x + p.w / 2, y + 12, 9, GOLD, 'center', 700);
      txt(ctx, 'WAVE ' + S.wave + ' IN ' + Math.ceil(Math.max(0, S.prepT)) + 's',
          p.x + p.w / 2, y + 25, 8, DIM, 'center', 600);
      y += 42;
    }

    // control rows for the device in hand
    const rows = UI.hintRows();
    const perLine = p.w > 200 ? 2 : 1;
    let hy = Math.min(p.y + p.h - 12, Math.max(y + 6, p.y + p.h - 12 - Math.ceil(rows.length / perLine) * 17));
    for (let i = 0; i < rows.length; i += perLine) {
      const line = rows.slice(i, i + perLine);
      hintRow(ctx, line, p.x + 12, hy, 16);
      hy += 17;
    }
  }

  /** Landscape right column: the next wave, named, so the player can plan the build. */
  function drawRightPanel(ctx, L) {
    const p = L.rightPanel;
    if (!p) return;
    const S = GK.Game.S();
    panel(ctx, p.x, p.y, p.w, p.h, 0.82);
    const prep = S.status === 'prep';
    const def = C.WAVES[Math.min(S.wave, C.WAVES.length) - 1] || [];
    let y = p.y + 16;
    txt(ctx, prep ? 'NEXT WAVE ' + S.wave : 'WAVE ' + S.wave, p.x + 12, y, 10, GOLD, 'left', 700);
    txt(ctx, prep ? 'IN ' + Math.ceil(Math.max(0, S.prepT)) + 's'
                  : 'ON FIELD ' + GK.Enemies.count(), p.x + p.w - 12, y, 8, DIM, 'right', 600);
    y += 22;

    const hasBoss = def.some(g => g.t === 'boss');
    let total = 0;
    for (const g of def) {
      const ed = C.ENEMIES[g.t];
      total += g.n;
      const spr = GK.Spr.get(ed.spr);
      ctx.drawImage(spr.cv, p.x + 12, y - 9, 16, 16);
      txt(ctx, ed.name, p.x + 32, y, 9, g.t === 'boss' ? '#d9b6ff' : TXT, 'left', 600);
      txt(ctx, '\u00d7' + g.n, p.x + p.w - 12, y, 9, DIM, 'right', 700);
      y += 18;
    }
    y += 4;
    txt(ctx, total + ' FOES IN THIS WAVE', p.x + 12, y, 8, DIM, 'left', 600);
    y += 16;
    if (hasBoss) {
      txt(ctx, 'SOVEREIGN INBOUND \u00b7 SAVE FLARE', p.x + 12, y, 8, '#ff9a9a', 'left', 700);
      y += 16;
    }

    if (!prep) {
      txt(ctx, 'KILLED ' + S.waveKilled + '/' + S.waveTotal + (S.streak >= 3 ? '   STREAK \u00d7' + S.streak : ''),
          p.x + 12, y, 8, S.streak >= 3 ? GOLD : DIM, 'left', 600);
      y += 16;
    } else {
      txt(ctx, 'SEND EARLY FOR +' + Math.ceil(Math.max(0, S.prepT)) * 2 + ' EMBERS', p.x + 12, y, 8, GOLD, 'left', 600);
      y += 16;
    }

    // a short tip that fits the run state
    const tip = hasBoss ? 'FLARE strips the Sovereign\'s armour.'
              : S.wave === 3 ? 'Husks have armour: FLARE or a LANCE.'
              : S.wave === 4 ? 'Shades fly straight to the gate.'
              : 'Two modes per tower: X swaps them.';
    txt(ctx, tip, p.x + 12, y, 8, '#b9c0d4', 'left', 600);
  }

  function drawBanner(ctx, L) {
    const S = GK.Game.S();
    if (S.bannerT <= 0 || !S.banner) return;
    const a = Math.min(1, S.bannerT * 1.6);
    ctx.globalAlpha = a;
    const y = L.worldRect.y + L.worldRect.h * 0.44;
    ctx.font = '800 17px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(S.banner).width + 24;
    ctx.fillStyle = 'rgba(5,6,11,0.6)';
    rr(ctx, GK.W / 2 - w / 2, y - 14, w, 28, 5);
    ctx.fill();
    txt(ctx, S.banner, GK.W / 2, y, 17, '#ffe9a8', 'center', 800);
    ctx.globalAlpha = 1;
  }

  function drawToast(ctx, L) {
    const S = GK.Game.S();
    if (S.toastT <= 0 || !S.toast) return;
    const col = S.toastCol || BAD;
    // 10-26 tester: in landscape the centred toast covered the wave panel. Keep it inside the moor band.
    const band = L.land && L.worldRect ? L.worldRect : null;
    const w = band ? Math.min(268, band.w - 8) : 268;
    const x = band ? band.x + band.w / 2 - w / 2 : GK.W / 2 - w / 2;
    const y = band ? band.y + 6 : Math.max(L.st + L.topH + 8, (L.panelRect ? L.panelRect.y : L.shop.y) - 46);
    panel(ctx, x, y, w, 32, 0.92, col);
    txt(ctx, S.toast, x + w / 2, y + 16, 10, col, 'center', 700);
  }

  // ---- device-aware control hints (Kenney CC0 prompt icons, copied into prompts/) ----
  const HINT_ICON = {
    keyboard: { move: 'prompts/keyboard_arrows.png', build: 'prompts/keyboard_enter.png',
                flare: 'prompts/keyboard_space.png', send: 'prompts/keyboard_space.png',
                pause: 'prompts/keyboard_escape.png', aim: 'prompts/mouse_left.png',
                pick: 'prompts/keyboard_enter.png' },
    pad: { move: 'prompts/xbox_stick_l.png', build: 'prompts/xbox_button_a.png',
           flare: 'prompts/xbox_rb.png', send: 'prompts/xbox_rb.png',
           pause: 'prompts/xbox_button_start.png', mode: 'prompts/xbox_button_x.png',
           pick: 'prompts/xbox_lt.png',
           aim: 'prompts/xbox_stick_l.png' },
    touch: { move: 'prompts/touch_tap.png', build: 'prompts/touch_tap.png',
             flare: 'prompts/touch_tap.png', send: 'prompts/touch_tap.png',
             pause: 'prompts/touch_tap.png', mode: 'prompts/touch_tap.png',
             aim: 'prompts/touch_hand_open.png' }
  };
  const imgCache = {};
  function icon(src) {
    if (!imgCache[src]) {
      const im = new Image();
      im.src = src;
      imgCache[src] = im;
    }
    return imgCache[src];
  }

  UI.setDevice = function (d) { UI.dev = (d === 'pad' || d === 'touch') ? d : 'keyboard'; };

  /** the hint rows for the device in use. One row per binding that a player actually needs.
   *  The 5th slot swaps SEND <-> FLARE, so its hint must swap with it: the row said "Space flare"
   *  during prep, where Space sends the wave early. */
  UI.hintRows = function () {
    const d = UI.dev;
    const S = GK.Game.S();
    // SEND only exists during prep. On the title and end screens the slot has no verb yet, so the
    // row must keep the FLARE wording: it read "send early" on the menu (a control that is not there).
    const prep = !!S && S.status === 'prep';
    const slot = prep ? 'send' : 'flare';
    const slotLabel = prep ? 'send early' : 'FLARE in a wave';
    if (d === 'touch') return [['move', 'Tap a tower'], ['build', 'Tap a tile'],
                               [slot, slotLabel], ['pause', 'Pause button']];
    if (d === 'pad') return [['pick', 'LT / RT pick'], ['build', 'A build'],
                             [slot, prep ? 'RB send' : 'RB flare'], ['move', 'Stick / D-pad'],
                             ['pause', 'Start pause']];
    return [['move', 'WASD / Arrows'], ['pick', '1-4 tower'],
            ['build', 'Enter build'], [slot, prep ? 'Space send' : 'Space flare'], ['pause', 'Esc pause']];
  };

  /** draw one hint row; returns the width used */
  function hintRow(ctx, rows, x, y, size) {
    let cx = x;
    const h = size || 18;
    ctx.textBaseline = 'middle';
    for (const [act, label] of rows) {
      const src = (HINT_ICON[UI.dev] || HINT_ICON.keyboard)[act];
      const im = icon(src);
      if (im.complete && im.naturalWidth) ctx.drawImage(im, cx, y - h / 2, h, h);
      cx += h + 4;
      ctx.font = '600 9px ui-monospace, Menlo, monospace';
      ctx.fillStyle = '#b9c0d4';
      ctx.textAlign = 'left';
      ctx.fillText(label, cx, y);
      cx += ctx.measureText(label).width + 14;
    }
    return cx - x;
  }

  function hintWidth(ctx, rows) {
    let w = 0;
    for (const [, label] of rows) {
      ctx.font = '600 9px ui-monospace, Menlo, monospace';
      w += 18 + 4 + ctx.measureText(label).width + 14;
    }
    return w;
  }

  function drawMenu(ctx, L) {
    const S = GK.Game.S();
    ctx.fillStyle = 'rgba(5,6,11,0.72)';
    ctx.fillRect(0, 0, GK.W, GK.H);

    const sc = 4;
    const tw = UI.titleCv.width * sc, th = UI.titleCv.height * sc;
    const tx = GK.W / 2 - tw / 2;
    const ty = GK.H * 0.17;
    ctx.fillStyle = 'rgba(5,6,11,0.66)';
    rr(ctx, tx - 12, ty - 6, tw + 24, th + 74, 8);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.4;
    ctx.drawImage(UI.title2Cv, tx + 4, ty + 4, tw, th);
    ctx.globalAlpha = 1;
    ctx.drawImage(UI.titleCv, tx, ty, tw, th);

    txt(ctx, 'HOLD THE CAUSEWAY', GK.W / 2, ty + th + 20, 12, GOLD, 'center', 700);

    // three short lines, written for the device in hand: what to do, not lore
    const dev = UI.dev;
    const lines = dev === 'touch' ? ['TAP EMBER, THEN TAP A MOOR TILE',
                                     'TAP A TOWER FOR MODES AND UPGRADES',
                                     'IN A WAVE TAP FLARE: IT MARKS EVERY FOE']
                : dev === 'pad'   ? ['LT / RT PICK, AIM, A BUILDS',
                                     'X SWAPS THE MODE, RB FLARES',
                                     'IN A WAVE RB STRIPS ARMOUR']
                :                   ['PRESS 1-4, AIM WITH WASD, ENTER BUILDS',
                                     'X SWAPS THE MODE, E UPGRADES',
                                     'IN A WAVE SPACE FLARES THE LANTERN'];
    let ly = ty + th + 38;
    for (const line of lines) {
      txt(ctx, line, GK.W / 2, ly, 9, '#b9c0d4', 'center', 600);
      ly += 15;
    }

    const b = L.hit.start;
    panel(ctx, b.x, b.y, b.w, b.h, 0.95, GOLD);
    txt(ctx, 'LIGHT THE KEEP', b.x + b.w / 2, b.y + b.h / 2, 16, GOLD, 'center', 800);

    const bw = 200, bh = 44, bx = GK.W / 2 - bw / 2, by = b.y + b.h + 16;
    panel(ctx, bx, by, bw, bh, 0.7);
    txt(ctx, 'BEST WAVE ' + S.best + (S.bestLight ? '  \u00b7  BEST LIGHT ' + S.bestLight : ''),
        GK.W / 2, by + 14, 10, TXT, 'center', 700);
    txt(ctx, C.WAVES.length + ' WAVES · ONE RUN ABOUT 6 MIN', GK.W / 2, by + 31, 8, DIM, 'center', 600);

    // controls for the device in use, wrapped to the screen
    const rows = UI.hintRows();
    const maxW = GK.W - 36;
    const hintLines = [];
    let cur = [];
    for (const pair of rows) {
      if (cur.length && hintWidth(ctx, cur.concat([pair])) > maxW) { hintLines.push(cur); cur = []; }
      cur.push(pair);
    }
    if (cur.length) hintLines.push(cur);
    let hy = GK.H - 24 - UI.safeBottom - (hintLines.length - 1) * 17;
    for (const line of hintLines) {
      const w = hintWidth(ctx, line);
      hintRow(ctx, line, GK.W / 2 - w / 2 - 7, hy);
      hy += 17;
    }
  }

  /** first-run coach: one pulsing pill and a ring on the control it names. Stops when the player
   *  has built a tower and opened its sheet, so a stranger knows the first move inside 3 seconds. */
  function drawCoach(ctx, L) {
    const S = GK.Game.S();
    if (S.paused || (S.status !== 'prep' && S.status !== 'wave')) return;
    const dev = UI.dev;
    let text = null, ring = null;
    if (S.coach === 0) {
      text = dev === 'touch' ? 'TAP EMBER, THEN A MOOR TILE'
           : dev === 'pad' ? 'LT / RT PICK EMBER \u00b7 AIM \u00b7 A'
           : 'PRESS 1 TO ARM EMBER, THEN ENTER';
      ring = L.hit.shop[0];
    } else if (S.coach === 1) {
      text = dev === 'touch' ? 'NOW TAP A MOOR TILE BESIDE THE ROAD'
           : dev === 'pad' ? 'AIM AT A MOOR TILE, PRESS A'
           : 'AIM AT A MOOR TILE, PRESS ENTER';
    } else if (S.coach === 2) {
      text = dev === 'touch' ? 'TAP THE TOWER TO UPGRADE OR SWAP MODE'
           : dev === 'pad' ? 'AIM AT THE TOWER, PRESS A'
           : 'AIM AT THE TOWER, PRESS ENTER';
    } else if (S.coach === 3 && S.status === 'wave' && !S.flareUsed && S.flareCd <= 0) {
      text = dev === 'touch' ? 'FLARE READY \u2014 TAP THE 5TH SLOT'
           : dev === 'pad' ? 'FLARE READY \u2014 PRESS RB'
           : 'FLARE READY \u2014 PRESS SPACE';
      ring = L.hit.send;
    }
    if (!text) return;

    // pulse: the same beat on the pill and on the control it points at
    const pulse = 0.5 + 0.5 * Math.sin(S.time * 4.2);
    if (ring && ring.w) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.55 * pulse;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      rr(ctx, ring.x - 2, ring.y - 2, ring.w + 4, ring.h + 4, 6);
      ctx.stroke();
      ctx.restore();
    }

    ctx.font = '700 9px ui-monospace, Menlo, monospace';
    const tw = ctx.measureText(text).width;
    const w = Math.min(GK.W - 16, tw + 22), h = 24;
    // keep the pill over the moor rather than over a side panel
    const bandL = L.land ? L.worldRect.x + 4 : 0;
    const bandR = L.land ? L.worldRect.x + L.worldRect.w - 4 : GK.W;
    const x = L.land
      ? Math.max(bandL, Math.min(GK.W / 2 - w / 2, bandR - w))
      : GK.W / 2 - w / 2;
    const y = L.land ? L.area.y + L.area.h - h - 12 : L.shop.y - h - 48;
    panel(ctx, x, y, w, h, 0.9, GOLD);
    txt(ctx, text, x + w / 2, y + h / 2, 9, GOLD, 'center', 700);
  }

  function drawEnd(ctx, L) {
    const S = GK.Game.S();
    const win = S.status === 'win';
    ctx.fillStyle = 'rgba(5,6,11,0.84)';
    ctx.fillRect(0, 0, GK.W, GK.H);

    // Lines stack at fixed gaps under the title. 10-26 tester: fractions of GK.H put the subtitle on the
    // KILLS row in landscape (GK.H is short there), so only the title follows the screen height.
    const b = L.hit.retry;
    const y0 = Math.min(GK.H * 0.27, b.y - 108);
    txt(ctx, win ? 'THE LIGHT HOLDS' : 'THE GLOAM TOOK THE KEEP', GK.W / 2, y0, 18,
        win ? GOLD : BAD, 'center', 800);
    txt(ctx, win ? 'All ' + C.WAVES.length + ' waves broken.' : 'You held ' + Math.max(0, S.wave - 1) + ' of ' + C.WAVES.length + '.',
        GK.W / 2, y0 + 24, 12, TXT, 'center', 600);
    txt(ctx, 'KILLS ' + S.kills + '   LEAKS ' + S.leaks + '   BEST WAVE ' + S.best,
        GK.W / 2, y0 + 46, 10, DIM, 'center', 600);
    // the grade is the light you kept; BEST LIGHT is the number the next run is trying to beat
    txt(ctx, win ? 'LIGHT KEPT ' + S.lives + '/' + C.START_LIVES + '   GRADE ' + GK.Game.grade()
                 : 'BEST LIGHT ' + S.bestLight + '   BEST STREAK ' + S.bestStreak,
        GK.W / 2, y0 + 62, 10, win ? GOLD : DIM, 'center', 700);

    // one plain tip: the thing that makes the next run different. Short lines: this card is drawn
    // on a 390 px phone with no wrapping.
    const tip = win ? 'FEWER TOWERS, HEAVIER UPGRADES SCORES HIGHER.'
              : S.wave >= 9 ? 'SAVE FLARE FOR THE SOVEREIGN: IT STRIPS ITS WARD.'
              : 'TAP FLARE IN A WAVE: IT STRIPS ARMOUR.';
    txt(ctx, tip, GK.W / 2, Math.min(y0 + 84, b.y - 14), 10, '#b9c0d4', 'center', 600);

    panel(ctx, b.x, b.y, b.w, b.h, 0.95, GOLD);
    txt(ctx, 'PLAY AGAIN', b.x + b.w / 2, b.y + b.h / 2, 15, GOLD, 'center', 800);

    // the restart is one press on every device: say which one, and match the button's words
    // (the round-2 tester read "TAP TRY AGAIN" over a button that said "PLAY AGAIN")
    const again = UI.dev === 'touch' ? 'TAP PLAY AGAIN FOR A FRESH RUN'
                : UI.dev === 'pad' ? 'PRESS A FOR A FRESH RUN'
                : 'PRESS ENTER FOR A FRESH RUN';
    txt(ctx, again, GK.W / 2, b.y + b.h + 20, 9, '#b9c0d4', 'center', 600);
  }

  function drawPause(ctx, L) {
    const S = GK.Game.S();
    // the pause card is the only thing on screen: the shop and the tower sheet are gone, so nothing
    // behind it looks tappable while the world is frozen.
    ctx.fillStyle = 'rgba(4,5,9,0.93)';
    ctx.fillRect(0, 0, GK.W, GK.H);

    const r = L.hit.resume;
    const m = L.hit.mute;
    const cw = Math.min(320, GK.W - 28);
    const cx = GK.W / 2 - cw / 2;
    const cy = Math.max(L.st + 8, r.y - 84);
    const ch = Math.min(GK.H - cy - 8, m.y + m.h + 14 - cy);
    panel(ctx, cx, cy, cw, ch, 0.92, BORDER);

    txt(ctx, 'PAUSED', GK.W / 2, cy + 24, 20, GOLD, 'center', 800);
    txt(ctx, 'The moor holds its breath.', GK.W / 2, cy + 46, 10, '#b9c0d4', 'center', 600);
    txt(ctx, 'WAVE ' + S.wave + '/' + C.WAVES.length + '   LIGHT ' + S.lives + '   GOLD ' + S.gold,
        GK.W / 2, cy + 66, 10, TXT, 'center', 700);

    panel(ctx, r.x, r.y, r.w, r.h, 0.95, GOLD);
    txt(ctx, 'RESUME', r.x + r.w / 2, r.y + r.h / 2, 15, GOLD, 'center', 800);

    panel(ctx, m.x, m.y, m.w, m.h, 0.7);
    txt(ctx, GK.Audio.isMuted() ? 'SOUND OFF' : 'SOUND ON', m.x + m.w / 2, m.y + m.h / 2, 12, TXT, 'center', 700);

    // how to get back in, for the device in use
    const rows = UI.hintRows();
    const line = [rows[rows.length - 1]].filter(Boolean);
    if (line.length) {
      const w = hintWidth(ctx, line) + 14;
      hintRow(ctx, line, GK.W / 2 - w / 2, Math.min(GK.H - 24 - UI.safeBottom, m.y + m.h + 26));
    }
  }

  let vigKey = '', vigCv = null;
  let dangerKey = '', dangerCv = null;
  UI.vignette = function (ctx, L) {
    const r = L.worldRect;
    const key = Math.round(r.x) + '|' + Math.round(r.y) + '|' + Math.round(r.w) + '|' + Math.round(r.h);
    // The vignette is a smooth radial falloff over the whole moor: rasterising that gradient every
    // frame was the phone's top fill cost. Bake it once per layout at CSS resolution and blit it.
    if (key !== vigKey || !vigCv) {
      vigKey = key;
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(r.w));
      cv.height = Math.max(1, Math.round(r.h));
      const c = cv.getContext('2d');
      const g = c.createRadialGradient(
        r.w / 2, r.h / 2, Math.min(r.w, r.h) * 0.38,
        r.w / 2, r.h / 2, Math.max(r.w, r.h) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.6)');
      c.fillStyle = g;
      c.fillRect(0, 0, r.w, r.h);
      vigCv = cv;
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;      // a soft gradient blit, not pixel art
    ctx.drawImage(vigCv, r.x, r.y, r.w, r.h);
    ctx.restore();

    // danger + leak: the edge of the moor goes red while a foe is nearly at the gate, and a solid
    // pulse lands the moment light is lost. Also baked once; the frame only changes its alpha.
    const S = GK.Game.S();
    if (!S || S.paused || (S.status !== 'prep' && S.status !== 'wave')) return;
    const pulse = 0.5 + 0.5 * Math.sin(S.time * 7);
    const danger = S.danger > 0.82 ? Math.min(1, (S.danger - 0.82) / 0.18) : 0;
    const k = Math.min(1, Math.max(danger * (0.35 + 0.55 * pulse), (S.leakFlash || 0) / 0.55));
    if (k < 0.02) return;
    if (dangerKey !== key || !dangerCv) {
      dangerKey = key;
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(r.w));
      cv.height = Math.max(1, Math.round(r.h));
      const c = cv.getContext('2d');
      const g = c.createRadialGradient(
        r.w / 2, r.h / 2, Math.min(r.w, r.h) * 0.40,
        r.w / 2, r.h / 2, Math.max(r.w, r.h) * 0.74);
      g.addColorStop(0, 'rgba(255,40,30,0)');
      g.addColorStop(1, 'rgba(255,40,30,1)');
      c.fillStyle = g;
      c.fillRect(0, 0, r.w, r.h);
      dangerCv = cv;
    }
    ctx.save();
    ctx.globalAlpha = 0.5 * k;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(dangerCv, r.x, r.y, r.w, r.h);
    ctx.restore();
  };

  UI.draw = function (ctx, L) {
    const S = GK.Game.S();
    if (S.status === 'menu') { drawMenu(ctx, L); return; }
    const ended = S.status === 'over' || S.status === 'win';
    const paused = !!S.paused && !ended;

    // while paused the pause card is the only layer: no shop, no sheet, no hints behind it
    if (!paused && !ended) {
      if (L.land) {
        // the moor cannot fill a wide screen (12x20 tiles, height sets the scale), so the bands
        // either side carry live information instead of void
        drawLeftPanel(ctx, L);
        drawRightPanel(ctx, L);
      }
      if (!L.land && !S.selected && S.status === 'prep') {
        // build phase: one compact row over the bottom of the map, gone once the wave starts
        const rows = UI.hintRows().slice(0, 2);
        const w = hintWidth(ctx, rows) + 14;
        const x = GK.W / 2 - w / 2;
        const y = L.area.y + L.area.h - 13;
        panel(ctx, x, y - 9, w, 18, 0.72, '#232838');
        hintRow(ctx, rows, x + 7, y);
      }
    }

    drawTopBar(ctx, L);

    if (!paused && !ended) {
      if (!S.selected) drawShop(ctx, L);
      drawPanel(ctx, L);
      drawInfoStrip(ctx, L);
      drawBanner(ctx, L);
      drawToast(ctx, L);
      if (!S.selected) drawCoach(ctx, L);
    }

    if (ended) {
      drawEnd(ctx, L);
    }

    if (paused) drawPause(ctx, L);
  };

  UI.inRect = inRect;
  UI.txt = txt;
  UI.panel = panel;
  GK.UI = UI;
})();
