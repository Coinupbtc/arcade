/* Grave Lantern — Canvas 2D renderer: pre-rendered sprites, lantern light, HUD, overlays. */
(function (root) {
  'use strict';

  var R = {};
  var canvas = null, ctx = null, W = 0, H = 0, DPR = 1;
  var safe = { top: 0, right: 0, bottom: 0, left: 0 };
  var sheets = {}, imgs = {}, floorPattern = null, glows = {};
  var cam = { x: 900, y: 700, zoom: 1 };
  var camLead = { x: 0, y: 0 };   // smoothed look-ahead, so aim whips between skeletons never shake the frame
  var shakeT = 0, shakeX = 0, shakeY = 0, shakeAmp = 0;   // smooth rumble phase + current offset (frame-constant, not random)
  var decor = [];
  var COL = {
    ink: '#070b10', stone: '#2b3540', stoneDark: '#161d24', bone: '#e8e2cf',
    gold: '#ffc857', teal: '#39d6c4', blood: '#e05664', purple: '#9a7bff', dim: '#8ba0ad'
  };
  var FX = { particles: [], numbers: [], corpses: [], slashes: [], rings: [], banners: [], trail: [], shake: 0, flash: 0, hurt: 0, winGlow: 0 };
  var uiRects = {};
  var flicker = 0;
  var rayT = 0;

  /* ---------- loading ---------- */
  function loadImg(src) {
    return new Promise(function (res) {
      var i = new Image();
      i.onload = function () { res(i); };
      i.onerror = function () { res(null); };
      i.src = src;
    });
  }
  function loadJSON(src) {
    return fetch(src).then(function (r) { return r.json(); }).catch(function () { return null; });
  }
  function makeSheet(img, json) {
    if (!img || !json) return null;
    var frames = json.frames || {};
    var anims = json.animations || {};
    var meta = json.meta || {};
    return { img: img, frames: frames, anims: anims, meta: meta,
             pivot: normalizePivot(meta.pivot), cell: meta.size ? meta.size.w : 144 };
  }
  function normalizePivot(p) {
    if (!p) return [72, 132];
    if (Array.isArray(p)) return p;
    if (typeof p === 'object') return [p.x != null ? p.x : 72, p.y != null ? p.y : 132];
    return [72, 132];
  }

  R.load = function () {
    return Promise.all([
      loadImg('assets/sprites/knight_move.png'), loadJSON('assets/sprites/knight_move.json'),
      loadImg('assets/sprites/skeleton.png'), loadJSON('assets/sprites/skeleton.json'),
      loadImg('assets/sprites/mage.png'), loadJSON('assets/sprites/mage.json'),
      loadImg('assets/ui/floor.jpg'), loadImg('assets/sprites/item_gem.png'),
      loadImg('assets/sprites/item_gold.png'), loadImg('assets/sprites/item_potion.png'),
      loadImg('assets/ui/icon_sword.png'), loadImg('assets/ui/icon_arrow_curved.png'),
      loadImg('assets/ui/pause.png'), loadImg('assets/ui/star.png'),
      loadImg('assets/ui/prompts/keyboard_w.png'), loadImg('assets/ui/prompts/keyboard_a.png'),
      loadImg('assets/ui/prompts/keyboard_s.png'), loadImg('assets/ui/prompts/keyboard_d.png'),
      loadImg('assets/ui/prompts/keyboard_space.png'), loadImg('assets/ui/prompts/keyboard_escape.png'),
      loadImg('assets/ui/prompts/keyboard_enter.png'),
      loadImg('assets/ui/prompts/xbox_button_a.png'), loadImg('assets/ui/prompts/xbox_button_start.png'),
      loadImg('assets/ui/prompts/controller_xboxseries.png'),
      loadImg('assets/ui/prompts/touch_swipe_move.png'), loadImg('assets/ui/prompts/touch_tap.png')
    ]).then(function (a) {
      sheets.knight = makeSheet(a[0], a[1]);
      sheets.skeleton = makeSheet(a[2], a[3]);
      sheets.mage = makeSheet(a[4], a[5]);
      imgs.floor = a[6]; imgs.gem = a[7]; imgs.gold = a[8]; imgs.potion = a[9];
      imgs.sword = a[10]; imgs.arrow = a[11]; imgs.pause = a[12]; imgs.star = a[13];
      imgs.p = { w: a[14], a: a[15], s: a[16], d: a[17], space: a[18], esc: a[19], enter: a[20],
                 padA: a[21], padStart: a[22], pad: a[23], swipe: a[24], tap: a[25] };
      buildFloor();
      buildGlows();
      buildDecor();
      bakeDecor();
      return true;
    });
  };

  function buildGlows() {
    ['#ffc857', '#39d6c4', '#9a7bff', '#e05664', '#e8e2cf', '#7ef0a8', '#ff9c4a'].forEach(function (c) {
      var s = 64, cv = document.createElement('canvas');
      cv.width = s; cv.height = s;
      var g = cv.getContext('2d');
      var rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      rg.addColorStop(0, c);
      rg.addColorStop(0.35, hexA(c, 0.55));
      rg.addColorStop(1, hexA(c, 0));
      g.fillStyle = rg; g.fillRect(0, 0, s, s);
      glows[c] = cv;
    });
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  var floorCanvas = null;
  function buildFloor() {
    var tile = document.createElement('canvas');
    tile.width = 160; tile.height = 160;
    var g = tile.getContext('2d');
    if (imgs.floor) {
      g.drawImage(imgs.floor, 0, 0, 160, 160);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = '#cddde7'; g.fillRect(0, 0, 160, 160);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(18,30,38,0.05)'; g.fillRect(0, 0, 160, 160);
    } else {
      g.fillStyle = '#2f3b46'; g.fillRect(0, 0, 160, 160);
    }
    g.strokeStyle = 'rgba(6,10,14,0.9)'; g.lineWidth = 3;
    g.strokeRect(0, 0, 160, 160);
    g.strokeStyle = 'rgba(150,175,190,0.10)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 80); g.lineTo(160, 80); g.stroke();
    var rng = mulberry32Static(99);
    for (var i = 0; i < 110; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (0.04 + rng() * 0.14).toFixed(3) + ')';
      g.fillRect(rng() * 160, rng() * 160, 1 + rng() * 3, 1 + rng() * 3);
    }
    // one big world floor, baked once (no per-frame pattern cost)
    var fc = document.createElement('canvas');
    fc.width = 1800; fc.height = 1400;
    var f = fc.getContext('2d');
    f.fillStyle = '#111a22'; f.fillRect(0, 0, 1800, 1400);
    var tv = mulberry32Static(303);
    for (var y = 0; y < 1400; y += 160) {
      for (var x = 0; x < 1800; x += 160) {
        f.globalAlpha = 0.82 + tv() * 0.18;
        f.drawImage(tile, x, y);
      }
    }
    f.globalAlpha = 1;
    // cracks and rubble scuffs
    for (var c = 0; c < 34; c++) {
      var cx = 40 + tv() * 1720, cy = 40 + tv() * 1320;
      f.strokeStyle = 'rgba(6,10,14,0.55)'; f.lineWidth = 1 + tv() * 2;
      f.beginPath(); f.moveTo(cx, cy);
      var px2 = cx, py2 = cy;
      for (var seg = 0; seg < 4; seg++) {
        px2 += (tv() - 0.5) * 70; py2 += (tv() - 0.5) * 70;
        f.lineTo(px2, py2);
      }
      f.stroke();
    }
    // ambient cool wash + moss at the edges
    var wash = f.createRadialGradient(900, 700, 200, 900, 700, 1150);
    wash.addColorStop(0, 'rgba(20,34,44,0.0)');
    wash.addColorStop(1, 'rgba(8,16,22,0.28)');
    f.fillStyle = wash; f.fillRect(0, 0, 1800, 1400);
    var rng2 = mulberry32Static(777);
    for (var m = 0; m < 26; m++) {
      var mx = 40 + rng2() * 1720, my = 40 + rng2() * 1320;
      f.fillStyle = 'rgba(38,74,58,' + (0.08 + rng2() * 0.12).toFixed(2) + ')';
      f.beginPath(); f.ellipse(mx, my, 20 + rng2() * 50, 10 + rng2() * 26, rng2() * 3, 0, 6.28); f.fill();
    }
    // arena wall band
    f.strokeStyle = '#0a1117'; f.lineWidth = 48; f.strokeRect(0, 0, 1800, 1400);
    f.strokeStyle = '#3d4c5a'; f.lineWidth = 6; f.strokeRect(24, 24, 1752, 1352);
    floorCanvas = fc;
  }
  function mulberry32Static(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function buildDecor() {
    var rng = mulberry32Static(424242);
    decor = [];
    var W2 = 1800, H2 = 1400;
    for (var i = 0; i < 84; i++) {
      var kind = rng();
      var x = 60 + rng() * (W2 - 120), y = 60 + rng() * (H2 - 120);
      if (Math.abs(x - 900) < 160 && Math.abs(y - 700) < 160) continue;
      decor.push({ x: x, y: y, kind: kind < 0.24 ? 'tomb' : kind < 0.42 ? 'slab' :
                  kind < 0.58 ? 'bones' : kind < 0.72 ? 'crack' : kind < 0.86 ? 'candle' : 'pillar',
                  s: 0.7 + rng() * 0.7, r: rng() * Math.PI * 2 });
    }
    // four purple sarcophagi (reference's coffin structures)
    decor.push({ x: 380, y: 330, kind: 'coffin', s: 1, r: 0 });
    decor.push({ x: 1420, y: 1060, kind: 'coffin', s: 1, r: 0 });
    decor.push({ x: 1460, y: 320, kind: 'coffin', s: 1, r: 0.35 });
    decor.push({ x: 330, y: 1080, kind: 'coffin', s: 1, r: -0.3 });
    // wall sconces: light anchors around the arena
    for (var sx2 = 180; sx2 < 1800; sx2 += 320) {
      decor.push({ x: sx2, y: 34, kind: 'sconce', s: 1, r: 0 });
      decor.push({ x: sx2 + 60, y: 1366, kind: 'sconce', s: 1, r: 0 });
    }
    for (var sy2 = 260; sy2 < 1400; sy2 += 360) {
      decor.push({ x: 34, y: sy2, kind: 'sconce', s: 1, r: 0 });
      decor.push({ x: 1766, y: sy2, kind: 'sconce', s: 1, r: 0 });
    }
  }

  /* ---------- resize ---------- */
  R.resize = function (w, h) {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = w; H = h; DPR = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    // 'high' resamples a 1800x1400 floor every frame; 'low' is a full-screen win at 1:1 zoom.
    ctx.imageSmoothingQuality = 'low';
    var probe = document.getElementById('safe');
    if (probe) {
      var cs = getComputedStyle(probe);
      safe = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0,
               bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    }
    cam.zoom = (w > h) ? clamp(min(w, h) / 330, 1.0, 1.55) : clamp(min(w, h) / 470, 0.86, 1.3);
    buildFloor();
    bakeDecor();
    makeDimBuffer();
  };

  /* The lantern darkness and the warm pool are two full-screen gradient fills per frame.
     Fill them into a half-resolution buffer and stretch it: a soft light gradient loses nothing,
     and it costs a quarter of the pixels. */
  var dimCv = null, dimCtx = null;
  function makeDimBuffer() {
    dimCv = document.createElement('canvas');
    dimCv.width = Math.max(2, Math.round(W / 2));
    dimCv.height = Math.max(2, Math.round(H / 2));
    dimCtx = dimCv.getContext('2d');
    gradCache = {};
  }
  function min(a, b) { return a < b ? a : b; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- state reset ---------- */
  R.reset = function (s) {
    FX = { particles: [], numbers: [], corpses: [], slashes: [], rings: [], banners: [], trail: [], shake: 0, flash: 0, hurt: 0, winGlow: 0 };
    cam.x = s.player.x; cam.y = s.player.y;
    camLead.x = 0; camLead.y = 0;
    shakeX = 0; shakeY = 0; shakeAmp = 0;
  };

  /* ---------- events → fx ---------- */
  R.handleEvent = function (e, s) {
    var i;
    if (e.type === 'swing') {
      var ang = dirAngle(e.dir);
      FX.slashes.push({ x: e.x, y: e.y, a: ang, arc: e.arc, range: e.range, t: 0 });
      for (i = 0; i < 5; i++) FX.particles.push(spark(e.x + Math.cos(ang) * 30, e.y + Math.sin(ang) * 30, ang));
    } else if (e.type === 'hit') {
      FX.numbers.push({ x: e.x, y: e.y, vy: -28, t: 0, life: 0.7, text: e.dmg.toFixed(0), color: COL.bone });
      for (i = 0; i < 3; i++) FX.particles.push(spark(e.x, e.y, Math.random() * 6.28));
    } else if (e.type === 'death') {
      FX.corpses.push({ x: e.x, y: e.y, dir: e.dir || 'S', t: 0, kind: e.kind });
      var n = e.kind === 'boss' ? 26 : 9;
      for (i = 0; i < n; i++) FX.particles.push(bone(e.x, e.y, e.kind === 'boss'));
      FX.shake = Math.min(12, FX.shake + (e.kind === 'boss' ? 10 : 1.6));
      if (e.kind === 'boss') FX.flash = 0.5;
    } else if (e.type === 'spawn') {
      FX.rings.push({ x: e.x, y: e.y, r: 6, maxR: 54, t: 0, color: COL.purple, w: 2 });
    } else if (e.type === 'bolt') {
      for (i = 0; i < 4; i++) FX.particles.push(spark(e.x, e.y, Math.random() * 6.28, COL.purple));
    } else if (e.type === 'crumble') {
      FX.corpses.push({ x: e.x, y: e.y, dir: e.dir || 'S', t: 0.35, kind: e.kind });
      for (i = 0; i < 6; i++) FX.particles.push(bone(e.x, e.y, false));
    } else if (e.type === 'charge') {
      FX.rings.push({ x: e.x, y: e.y - 20, r: 4, maxR: 26, t: 0, color: COL.purple, w: 1.5 });
    } else if (e.type === 'windup') {
      FX.rings.push({ x: e.x, y: e.y, r: 52, maxR: 30, t: 0, color: COL.blood, w: 2.5 });
    } else if (e.type === 'lunge') {
      for (i = 0; i < 3; i++) FX.particles.push(spark(e.x, e.y, Math.random() * 6.28, COL.bone));
    } else if (e.type === 'dashhit') {
      for (i = 0; i < 5; i++) FX.particles.push(spark(e.x, e.y, Math.random() * 6.28, COL.teal));
      FX.numbers.push({ x: e.x, y: e.y - 8, vy: -26, t: 0, life: 0.5, text: 'CUT', color: COL.teal });
    } else if (e.type === 'bosswind') {
      FX.rings.push({ x: e.x, y: e.y, r: 120, maxR: 40, t: 0, color: COL.blood, w: 4 });
    } else if (e.type === 'bosscharge') {
      FX.rings.push({ x: e.x, y: e.y, r: 20, maxR: 140, t: 0, color: COL.blood, w: 3 });
      FX.shake = Math.min(20, FX.shake + 6);
    } else if (e.type === 'slamcharge') {
      FX.rings.push({ x: e.x, y: e.y, r: 160, maxR: 30, t: 0, color: COL.blood, w: 2 });
    } else if (e.type === 'hurt') {
      FX.hurt = 0.5; FX.shake = Math.min(18, FX.shake + 8);
      FX.numbers.push({ x: s.player.x, y: s.player.y - 20, vy: -34, t: 0, life: 0.8, text: '-' + Math.round(e.amount), color: COL.blood });
      for (i = 0; i < 8; i++) FX.particles.push(spark(s.player.x, s.player.y, Math.random() * 6.28, COL.blood));
    } else if (e.type === 'dash') {
      FX.trail.push({ x: s.player.x, y: s.player.y, t: 0, dir: s.player.moveDir });
      FX.rings.push({ x: s.player.x, y: s.player.y, r: 8, maxR: 40, t: 0, color: COL.teal, w: 2 });
    } else if (e.type === 'gem') {
      for (i = 0; i < 4; i++) FX.particles.push(spark(e.x, e.y, Math.random() * 6.28, COL.teal));
    } else if (e.type === 'coin') {
      FX.numbers.push({ x: e.x, y: e.y, vy: -26, t: 0, life: 0.6, text: '+25', color: COL.gold });
    } else if (e.type === 'potion') {
      FX.numbers.push({ x: e.x, y: e.y, vy: -26, t: 0, life: 0.8, text: '+20 HP', color: '#7ef0a8' });
    } else if (e.type === 'wave') {
      FX.banners.push({ text: 'WAVE ' + e.wave, sub: e.wave === 10 ? 'THE WARDEN STIRS' : '', t: 0, life: 2.0, color: COL.bone });
    } else if (e.type === 'boss') {
      FX.banners.push({ text: 'THE BONE WARDEN', sub: 'HOLD THE LINE', t: 0, life: 3.0, color: COL.blood });
      FX.shake = 22; FX.flash = 0.4;
      FX.rings.push({ x: s.player.x, y: s.player.y, r: 20, maxR: 320, t: 0, color: COL.blood, w: 4 });
    } else if (e.type === 'bossphase') {
      FX.banners.push({ text: 'THE WARDEN CALLS THE HORDE', sub: 'SECOND PHASE', t: 0, life: 2.4, color: COL.gold });
      FX.shake = 18;
      FX.rings.push({ x: e.x, y: e.y, r: 20, maxR: 220, t: 0, color: COL.gold, w: 3 });
    } else if (e.type === 'enrage') {
      FX.banners.push({ text: 'THE WARDEN ENRAGES', sub: 'NO MORE RUNNING', t: 0, life: 2.6, color: COL.blood });
    } else if (e.type === 'slam') {
      FX.rings.push({ x: e.x, y: e.y, r: 10, maxR: 190, t: 0, color: COL.blood, w: 5 });
      FX.shake = Math.min(24, FX.shake + 14);
    } else if (e.type === 'levelup') {
      rayT = 0;
    } else if (e.type === 'upgrade') {
      FX.rings.push({ x: s.player.x, y: s.player.y, r: 10, maxR: 120, t: 0, color: COL.gold, w: 3 });
    } else if (e.type === 'win') {
      FX.winGlow = 1;
    } else if (e.type === 'lose') {
      FX.flash = 0.6;
    }
  };
  function dirNameOf(s) { return s.player.moveDir || 'S'; }
  function dirAngle(d) {
    var m = { E: 0, SE: Math.PI / 4, S: Math.PI / 2, SW: 3 * Math.PI / 4, W: Math.PI, NW: -3 * Math.PI / 4, N: -Math.PI / 2, NE: -Math.PI / 4 };
    return m[d] == null ? Math.PI / 2 : m[d];
  }
  function bone(x, y, big) {
    return { x: x, y: y, vx: (Math.random() - 0.5) * 220, vy: -60 - Math.random() * 180,
             g: 620, life: 0.9 + Math.random() * 0.5, maxLife: 1.4, size: (big ? 7 : 3) + Math.random() * 3,
             rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 10, type: 'bone', color: COL.bone };
  }
  function spark(x, y, a, color) {
    var sp = 90 + Math.random() * 160;
    return { x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, g: 240,
             life: 0.3 + Math.random() * 0.35, maxLife: 0.65, size: 2 + Math.random() * 2,
             rot: 0, vr: 0, type: 'spark', color: color || COL.gold };
  }
  function dust(x, y) {
    return { x: x, y: y, vx: 8 + Math.random() * 14, vy: -4 - Math.random() * 10, g: 0,
             life: 4 + Math.random() * 4, maxLife: 8, size: 1 + Math.random() * 1.7,
             rot: 0, vr: 0, type: 'dust', color: '#9fb6c4' };
  }

  /* ---------- drawing helpers ---------- */
  function drawGlow(x, y, r, color, alpha) {
    var g = glows[color];
    if (!g) return;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.drawImage(g, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
  function txt(text, x, y, size, color, align, font, outline) {
    var fam = font === 'Title' ? '"KenneyTitle"' : '"KenneyBody"';
    ctx.font = size + 'px ' + fam + ', monospace';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if (outline !== false) {
      ctx.lineWidth = Math.max(3, size * 0.16);
      ctx.strokeStyle = 'rgba(4,7,10,0.9)';
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  function panel(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  function drawFrame(sheet, animName, clock, x, y, scale, opts) {
    if (!sheet) return false;
    var a = sheet.anims[animName];
    if (!a || !a.frames || !a.frames.length) return false;
    var n = a.frames.length;
    var i = Math.floor((clock * (a.fps || 10))) % n;
    if (i < 0) i = 0;
    var fr = sheet.frames[a.frames[i]];
    if (!fr) return false;
    var f = fr.frame;
    var pv = sheet.pivot || [f.w * 0.5, f.h * 0.9];
    var w = f.w * scale, h = f.h * scale;
    var dx = x - w * 0.5;
    var dy = y - pv[1] * scale;
    var opts = opts || {};
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    ctx.drawImage(sheet.img, f.x, f.y, f.w, f.h, dx, dy, w, h);
    ctx.restore();
    return true;
  }

  /* ---------- main draw ---------- */
  R.draw = function (s, ui, dt) {
    var t = performance.now() / 1000;
    flicker += dt;

    // camera — the frame follows the KNIGHT, never the aim vector.
    // facing is unit-length now, but normalise defensively; a raw offset here used to throw
    // the camera hundreds of pixels off the character and read as "glitchy".
    var fx = s.player.facing.x || 0, fy = s.player.facing.y || 0;
    var fl = Math.sqrt(fx * fx + fy * fy) || 1;
    fx /= fl; fy /= fl;
    var LEAD = 26;
    var leadK = 1 - Math.pow(0.02, dt);   // ~0.25 s. Auto-attack flips facing ~4x/s; the frame must not chase it.
    camLead.x += (fx * LEAD - camLead.x) * leadK;
    camLead.y += (fy * LEAD - camLead.y) * leadK;
    var targetX = s.player.x + camLead.x;
    var targetY = s.player.y + camLead.y;
    if (s.mode === 'menu') { targetX = 900; targetY = 700; }
    // The room limit goes on the TARGET, not on the camera. Clamping the camera after smoothing
    // stopped it dead in one frame at the wall — that was the jerk at the edges.
    var halfW = W / 2 / cam.zoom;
    // The knight is drawn at 0.54 H, not dead centre, so the camera's travel range is asymmetric.
    var anchorY = H * 0.54;
    var topSpan = anchorY / cam.zoom;
    var botSpan = (H - anchorY) / cam.zoom;
    targetX = clamp(targetX, Math.min(halfW, 900), Math.max(1800 - halfW, 900));
    targetY = clamp(targetY, Math.min(topSpan, 700), Math.max(1400 - botSpan, 700));
    var lerp = s.mode === 'menu' ? 1 : 1 - Math.pow(3.7e-6, dt);   // tau 80 ms: no trailing lag, no wall snap
    cam.x += (targetX - cam.x) * lerp;
    cam.y += (targetY - cam.y) * lerp;

    // shake — smooth decaying oscillation, NOT fresh random noise every frame.
    // Random offsets at 60 Hz jittered the whole world by ±3 px on every hit; that read as
    // the screen jerking. Same peak amplitude, but it now moves like a rumble.
    FX.shake *= Math.pow(0.0025, dt);
    shakeT += dt;
    // ramp the amplitude too: a hit used to set FX.shake from 0 to 8 in ONE frame, and the
    // world jumped 4 px sideways on that frame. 60 ms ramp removes the snap, keeps the rumble.
    shakeAmp += (FX.shake - shakeAmp) * (1 - Math.pow(0.02, dt));
    var amp = shakeAmp;
    shakeX = amp * 0.5 * (Math.sin(shakeT * 61.0) * 0.6 + Math.sin(shakeT * 23.7 + 2.1) * 0.4);
    shakeY = amp * 0.5 * (Math.sin(shakeT * 47.3 + 1.7) * 0.6 + Math.sin(shakeT * 29.9) * 0.4);
    var sx = shakeX;
    var sy = shakeY;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = COL.ink;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2 + sx, H * 0.54 + sy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    drawFloor();
    computeView();
    drawDecor(t);
    ctx.restore();

    // lantern darkness + warm light (screen space)
    drawLantern(s, t);

    ctx.save();
    ctx.translate(W / 2 + sx, H * 0.54 + sy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    drawCorpses(t, dt);

    // entity depth sort
    var ents = [];
    for (var i = 0; i < s.enemies.length; i++) ents.push(s.enemies[i]);
    ents.push({ x: s.player.x, y: s.player.y, kind: 'player' });
    ents.sort(function (a, b) { return a.y - b.y; });

    for (var k = 0; k < ents.length; k++) {
      var e = ents[k];
      if (e.kind === 'player') drawPlayer(s, t, dt);
      else if (onScreen(e.x, e.y)) drawEnemy(e, t);
    }

    drawPickups(s, t);
    drawBolts(s);
    drawFX(t, dt);
    drawStick(ui);
    ctx.restore();

    // dust motes in screen space
    drawMotes(t, dt);

    // vignette (cached per viewport)
    var vkey = 'v' + W + 'x' + H;
    if (!gradCache[vkey]) {
      var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.34)');
      gradCache[vkey] = { g: vg, r0: 0, r1: 0 };
    }
    ctx.fillStyle = gradCache[vkey].g; ctx.fillRect(0, 0, W, H);

    if (FX.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (FX.flash * 0.55) + ')';
      ctx.fillRect(0, 0, W, H);
      FX.flash *= Math.pow(0.02, dt);
    }

    if (s.mode === 'run' || s.mode === 'levelup') drawHUD(s, t, ui);

    if (s.mode === 'menu') drawMenu(s, t, ui);
    else if (s.mode === 'levelup') drawLevelUp(s, t, ui);
    else if (s.mode === 'paused') { drawPause(s, t, ui); drawHUD(s, t, ui); }
    else if (s.mode === 'win') drawEnd(s, true);
    else if (s.mode === 'lose') drawEnd(s, false);
  };

  function drawFloor() {
    if (!floorCanvas) { ctx.fillStyle = '#26313b'; ctx.fillRect(0, 0, 1800, 1400); return; }
    var hw = W / 2 / cam.zoom + 60, hh = H / 2 / cam.zoom + 60;
    var sx = Math.max(0, cam.x - hw), sy = Math.max(0, cam.y - hh);
    var sw = Math.min(1800 - sx, hw * 2), sh = Math.min(1400 - sy, hh * 2);
    if (sw > 0 && sh > 0) ctx.drawImage(floorCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
  }

  var viewBox = { x0: 0, y0: 0, x1: 1800, y1: 1400 };
  function computeView() {
    var hw = W / 2 / cam.zoom + 140;
    var topSpan = H * 0.54 / cam.zoom + 180;
    var botSpan = (H - H * 0.54) / cam.zoom + 180;
    viewBox.x0 = cam.x - hw; viewBox.x1 = cam.x + hw;
    viewBox.y0 = cam.y - topSpan; viewBox.y1 = cam.y + botSpan;
  }
  function onScreen(x, y) {
    return x > viewBox.x0 && x < viewBox.x1 && y > viewBox.y0 && y < viewBox.y1;
  }

  // Tombstones, slabs, coffins, bones and pillars never move, so they are baked into the floor
  // canvas once. Measured: drawing them live cost ~12 ms/frame (49 -> 61 fps when removed).
  // Only the candle and sconce flames stay live, because they flicker.
  var baking = false;
  function isAnimatedDecor(d) { return d.kind === 'candle' || d.kind === 'sconce'; }

  function bakeDecor() {
    if (!floorCanvas || !decor.length) return;
    var main = ctx;
    ctx = floorCanvas.getContext('2d');
    baking = true;
    drawDecor(0);
    baking = false;
    ctx = main;
  }

  function drawDecor(t) {
    for (var i = 0; i < decor.length; i++) {
      var d = decor[i], x = d.x, y = d.y, s = d.s;
      if (baking ? isAnimatedDecor(d) : !isAnimatedDecor(d)) continue;
      if (!baking && !onScreen(x, y)) continue;
      ctx.save();
      ctx.translate(x, y);
      if (d.kind === 'coffin') {
        ctx.rotate(d.r);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(-46, -16, 100, 46);
        ctx.fillStyle = '#2c2238';
        panel(-52, -26, 104, 52, 6, '#2c2238', '#4d3b64');
        ctx.fillStyle = '#3a2c4d';
        panel(-44, -18, 88, 36, 4, '#3a2c4d', null);
        ctx.fillStyle = '#b99a4a';
        ctx.fillRect(-30, -4, 60, 3);
        ctx.fillStyle = '#9a7bff';
        ctx.globalAlpha = 0.35; drawGlow(0, -2, 54, '#9a7bff', 0.35); ctx.globalAlpha = 1;
      } else if (d.kind === 'tomb') {
        ctx.rotate((d.r - 0.5) * 0.08);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(-16 * s, -2, 34 * s, 10);
        ctx.fillStyle = '#39434f';
        ctx.beginPath();
        ctx.moveTo(-15 * s, 4); ctx.lineTo(-15 * s, -22 * s);
        ctx.quadraticCurveTo(0, -38 * s, 15 * s, -22 * s); ctx.lineTo(15 * s, 4);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#5a6a78'; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = '#202a33'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(0, -26 * s); ctx.lineTo(0, -10 * s);
        ctx.moveTo(-6 * s, -20 * s); ctx.lineTo(6 * s, -20 * s); ctx.stroke();
      } else if (d.kind === 'slab') {
        ctx.rotate(d.r * 0.2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        panel(-24 * s, -12 * s, 48 * s, 30 * s, 4, 'rgba(0,0,0,0.4)');
        panel(-24 * s, -14 * s, 48 * s, 28 * s, 4, '#333e4a', '#4e5d6b');
        ctx.strokeStyle = 'rgba(20,28,34,0.8)'; ctx.lineWidth = 1;
        for (var j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(-18 * s, -8 * s + j * 8); ctx.lineTo(18 * s, -9 * s + j * 8); ctx.stroke(); }
      } else if (d.kind === 'bones') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(4, 4, 22 * s, 8 * s, 0, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#c9c2ad'; ctx.lineWidth = 3 * s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-14 * s, 0); ctx.lineTo(12 * s, 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-4 * s, -6 * s); ctx.lineTo(10 * s, -7 * s); ctx.stroke();
        ctx.fillStyle = '#d8d1bc';
        ctx.beginPath(); ctx.arc(-16 * s, 0, 4 * s, 0, 6.28); ctx.fill();
      } else if (d.kind === 'crack') {
        ctx.strokeStyle = 'rgba(6,10,14,0.75)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-30 * s, 0);
        ctx.lineTo(-10 * s, -6 * s); ctx.lineTo(6 * s, 4 * s); ctx.lineTo(26 * s, -2 * s);
        ctx.stroke();
      } else if (d.kind === 'candle') {
        ctx.fillStyle = '#c8bfa7'; ctx.fillRect(-2, -12, 4, 12);
        ctx.fillStyle = '#ffd27a';
        ctx.beginPath(); ctx.ellipse(0, -15 - Math.sin(t * 6 + d.x) * 1.5, 2.6, 5, 0, 0, 6.28); ctx.fill();
        drawGlow(0, -16, 44 + Math.sin(t * 5 + d.x) * 6, '#ff9c4a', 0.5);
      } else if (d.kind === 'sconce') {
        ctx.fillStyle = '#2b3540';
        ctx.fillRect(-3, -2, 6, 10);
        ctx.fillStyle = '#ffcf6e';
        ctx.beginPath(); ctx.ellipse(0, -8 - Math.sin(t * 7 + d.x) * 1.8, 3, 6.5, 0, 0, 6.28); ctx.fill();
        drawGlow(0, -9, 90 + Math.sin(t * 5 + d.y) * 10, '#ff9c4a', 0.34);
      } else if (d.kind === 'pillar') {
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-14, -8, 34, 14);
        panel(-16, -60 * s, 32, 60 * s, 3, '#3b4653', '#556473');
        panel(-20, -66 * s, 40, 8, 2, '#48545f', '#5e6d7b');
        panel(-20, -2, 40, 8, 2, '#3a4550', '#526170');
      }
      ctx.restore();
    }
  }

  function drawCorpses(t, dt) {
    for (var i = FX.corpses.length - 1; i >= 0; i--) {
      var c = FX.corpses[i];
      c.t += dt;
      if (c.t > 1.4) { FX.corpses.splice(i, 1); continue; }
      var sheet = c.kind === 'mage' ? sheets.mage : sheets.skeleton;
      var nm = 'death_' + c.dir;
      if (!sheet || !sheet.anims[nm]) { FX.corpses.splice(i, 1); continue; }
      var a = sheet.anims[nm];
      var idx = Math.min(a.frames.length - 1, Math.floor(c.t / 1.4 * a.frames.length));
      var fr = sheet.frames[a.frames[idx]];
      if (!fr) continue;
      var f = fr.frame, pv = sheet.pivot || [72, 132];
      var scale = c.kind === 'boss' ? 1.15 : 0.44;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - c.t / 1.4);
      ctx.drawImage(sheet.img, f.x, f.y, f.w, f.h,
        c.x - f.w * scale / 2, c.y - pv[1] * scale, f.w * scale, f.h * scale);
      ctx.restore();
    }
  }

  function drawPlayer(s, t, dt) {
    var p = s.player;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 22, 8, 0, 0, 6.28); ctx.fill();

    // ghost trail
    for (var i = FX.trail.length - 1; i >= 0; i--) {
      var tr = FX.trail[i]; tr.t += dt;
      if (tr.t > 0.3) { FX.trail.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = 0.16 * (1 - tr.t / 0.3);
      drawFrame(sheets.knight, 'walk_' + tr.dir, tr.t, tr.x, tr.y, 0.48);
      ctx.restore();
    }

    var anim = p.moving ? 'walk_' + p.moveDir : 'idle_' + p.moveDir;
    if (!sheets.knight || !sheets.knight.anims[anim]) anim = p.moving ? 'walk_S' : 'idle_S';
    var alpha = p.invuln > 0 ? (Math.sin(t * 40) > 0 ? 0.55 : 1) : 1;
    var bob = p.moving ? 0 : Math.sin(t * 2.2) * 0.6;
    ctx.save();
    ctx.globalAlpha = alpha;
    drawFrame(sheets.knight, anim, p.animT + t * 0.5, p.x, p.y + bob, 0.48);
    ctx.restore();

    // lantern held in hand
    var lx = p.x + 16, ly = p.y - 46;
    var flick = 1 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 13.1) * 0.03;
    ctx.fillStyle = '#3a2f22';
    ctx.fillRect(lx - 1.5, ly, 3, 12);
    ctx.fillStyle = '#ffcf6e';
    ctx.beginPath(); ctx.arc(lx, ly, 4.6 * flick, 0, 6.28); ctx.fill();
    drawGlow(lx, ly, 26 * flick, '#ff9c4a', 0.75);

    // swing arc
    if (p.swing > 0) {
      var sl = FX.slashes.length ? FX.slashes[FX.slashes.length - 1] : null;
      if (sl) {
        var prog = 1 - p.swing / 0.22; // 0..1
        var a0 = sl.a - sl.arc / 2;
        var sweep = sl.arc * Math.min(1, prog * 1.4);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var grd = ctx.createRadialGradient(sl.x, sl.y, sl.range * 0.35, sl.x, sl.y, sl.range);
        grd.addColorStop(0, 'rgba(255,230,170,0)');
        grd.addColorStop(0.7, 'rgba(255,214,130,' + (0.42 * Math.max(0, p.swing / 0.22)) + ')');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(sl.x, sl.y);
        ctx.arc(sl.x, sl.y, sl.range, a0, a0 + sweep);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,246,214,' + (0.75 * Math.max(0, p.swing / 0.22)) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sl.x, sl.y, sl.range * 0.92, a0 + sweep - 0.12, a0 + sweep); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawEnemy(e, t) {
    var isBoss = e.kind === 'boss';
    var isBrute = e.kind === 'brute';
    var sheet = e.kind === 'mage' ? sheets.mage : sheets.skeleton;
    var scale = isBoss ? 1.15 : isBrute ? 0.62 : 0.46;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,' + (isBoss ? 0.5 : 0.4) + ')';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + 2, isBoss ? 46 : isBrute ? 24 : 18, isBoss ? 16 : isBrute ? 9 : 7, 0, 0, 6.28);
    ctx.fill();

    // Telegraph: a wind-up is drawn on the floor, big enough to read at a glance on a phone.
    // Without it a lunge is unfair chip damage; with it, the red ring is the whole skill beat.
    if (e.wind > 0) {
      var pw = e.wind / 0.5;                        // 1 → 0 as the strike approaches
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(e.x, e.y, 58, '#e05664', 0.22 + (1 - pw) * 0.3);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(224,86,100,' + (0.35 + (1 - pw) * 0.45) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 34 * (1.25 - pw * 0.25), 0, 6.28);
      ctx.stroke();
      ctx.restore();
    }
    if (e.kind === 'boss' && e.chargeWind > 0) {
      var bw2 = e.chargeWind / 0.7;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(e.x, e.y, 150, '#e05664', 0.22 + (1 - bw2) * 0.35);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(224,86,100,' + (0.4 + (1 - bw2) * 0.5) + ')';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 76 * (1.2 - bw2 * 0.2), 0, 6.28);
      ctx.stroke();
      ctx.restore();
    }
    if (e.lunge > 0) {
      // a short streak at the feet so the strike direction reads while it is moving
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#e05664';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(e.x - 16, e.y + 6);
      ctx.lineTo(e.x + 16, e.y + 6);
      ctx.stroke();
      ctx.restore();
    }

    if (isBoss || isBrute) {
      // red aura: a brute must read as a bigger, slower, heavier threat
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(e.x, e.y - (isBoss ? 40 : 24), isBoss ? 110 : 46, '#e05664', isBoss ? 0.35 : 0.24);
      ctx.restore();
    }

    var anim = 'walk_' + e.dir;
    if (!sheet || !sheet.anims[anim]) anim = 'walk_S';
    if (sheet && sheet.anims[anim]) {
      drawFrame(sheet, anim, e.animT, e.x, e.y, scale);
    } else {
      // fallback: skeleton silhouette
      ctx.fillStyle = '#cfc7b2';
      ctx.beginPath(); ctx.arc(e.x, e.y - 30, 12, 0, 6.28); ctx.fill();
      ctx.fillRect(e.x - 8, e.y - 22, 16, 22);
    }

    // threat read: red eye glint so a skeleton is never mistaken for the knight, and it is
    // bright enough to find a skeleton standing in the unlit part of the floor
    if (!isBoss) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(e.x, e.y - 95 * scale, isBrute ? 18 : 15, '#e05664', 0.55 + Math.sin(t * 3 + e.x) * 0.1);
      ctx.restore();
    }

    if (e.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(e.x, e.y - 30 * scale * 2, isBoss ? 90 : 40, '#fff3d0', e.flash * 3);
      ctx.restore();
    }

    if (isBoss) {
      // crown
      ctx.fillStyle = COL.gold;
      ctx.beginPath();
      var cy = e.y - 111.8 * scale + 6;
      ctx.moveTo(e.x - 26, cy); ctx.lineTo(e.x - 26, cy - 16);
      ctx.lineTo(e.x - 12, cy - 6); ctx.lineTo(e.x, cy - 22);
      ctx.lineTo(e.x + 12, cy - 6); ctx.lineTo(e.x + 26, cy - 16);
      ctx.lineTo(e.x + 26, cy); ctx.closePath(); ctx.fill();
      // hp bar
      var bw = 120, bh = 8;
      var bx = e.x - bw / 2, by = e.y - 111.8 * scale - 16;
      panel(bx - 2, by - 2, bw + 4, bh + 4, 3, 'rgba(4,7,10,0.85)', 'rgba(255,200,90,0.5)');
      ctx.fillStyle = COL.blood;
      ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), bh);
      txt('BONE WARDEN', e.x, by - 14, 10, COL.gold, 'center');
    } else if (e.hp < e.maxHp) {
      var w2 = 34, h2 = 3.5;
      ctx.fillStyle = 'rgba(4,7,10,0.75)';
      ctx.fillRect(e.x - w2 / 2, e.y - 56, w2, h2);
      ctx.fillStyle = e.kind === 'mage' ? COL.purple : COL.blood;
      ctx.fillRect(e.x - w2 / 2, e.y - 56, w2 * Math.max(0, e.hp / e.maxHp), h2);
    }
    if (e.kind === 'mage') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(e.x - 10, e.y - 34, 26, '#9a7bff', 0.35 + Math.sin(t * 4 + e.x) * 0.1);
      ctx.restore();
    }
  }

  function drawPickups(s, t) {
    for (var i = 0; i < s.pickups.length; i++) {
      var p = s.pickups[i];
      var bob = Math.sin(t * 4 + p.x * 0.1) * 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(p.x, p.y + bob - 6, p.kind === 'gem' ? 26 : 22,
               p.kind === 'gem' ? '#39d6c4' : p.kind === 'gold' ? '#ffc857' : '#7ef0a8', 0.55);
      ctx.restore();
      if (p.kind === 'gem' && imgs.gem) {
        var sz = 18 + Math.sin(t * 3 + p.x) * 1.5;
        ctx.drawImage(imgs.gem, p.x - sz / 2, p.y + bob - sz / 2, sz, sz);
      } else if (p.kind === 'gold' && imgs.gold) {
        ctx.drawImage(imgs.gold, p.x - 9, p.y + bob - 9, 18, 18);
      } else if (p.kind === 'potion' && imgs.potion) {
        ctx.drawImage(imgs.potion, p.x - 10, p.y + bob - 10, 20, 20);
      } else {
        ctx.fillStyle = COL.teal;
        ctx.beginPath(); ctx.arc(p.x, p.y + bob, 5, 0, 6.28); ctx.fill();
      }
    }
  }

  function drawBolts(s) {
    for (var i = 0; i < s.bolts.length; i++) {
      var b = s.bolts[i];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(154,123,255,0.45)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.05, b.y - b.vy * 0.05); ctx.lineTo(b.x, b.y); ctx.stroke();
      drawGlow(b.x, b.y, 24, '#9a7bff', 0.9);
      ctx.fillStyle = '#d9ccff';
      ctx.beginPath(); ctx.arc(b.x, b.y, 4.5, 0, 6.28); ctx.fill();
      ctx.restore();
    }
  }

  function drawFX(t, dt) {
    // rings
    for (var i = FX.rings.length - 1; i >= 0; i--) {
      var r = FX.rings[i]; r.t += dt;
      if (r.t > 0.7) { FX.rings.splice(i, 1); continue; }
      var k = r.t / 0.7;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color; ctx.lineWidth = r.w * (1 - k);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.maxR - r.r) * k, 0, 6.28); ctx.stroke();
      ctx.restore();
    }
    // particles
    for (var j = FX.particles.length - 1; j >= 0; j--) {
      var p = FX.particles[j];
      p.life -= dt;
      if (p.life <= 0) { FX.particles.splice(j, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      var a = Math.min(1, p.life / (p.maxLife * 0.6));
      ctx.save();
      ctx.globalAlpha = a;
      if (p.type === 'bone') {
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.type === 'dust') {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size * 0.8;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.024, p.y - p.vy * 0.024); ctx.stroke();
      }
      ctx.restore();
    }
    if (FX.particles.length > 220) FX.particles.splice(0, FX.particles.length - 220);

    // damage numbers
    for (var n = FX.numbers.length - 1; n >= 0; n--) {
      var q = FX.numbers[n]; q.t += dt;
      if (q.t > q.life) { FX.numbers.splice(n, 1); continue; }
      q.y += q.vy * dt; q.vy *= Math.pow(0.2, dt);
      ctx.save(); ctx.globalAlpha = 1 - q.t / q.life;
      txt(q.text, q.x, q.y, 13, q.color, 'center', 'Title');
      ctx.restore();
    }

    // banners (world space, above player)
    for (var b = FX.banners.length - 1; b >= 0; b--) {
      var bn = FX.banners[b]; bn.t += dt;
      if (bn.t > bn.life) { FX.banners.splice(b, 1); continue; }
    }
  }

  function drawStick(ui) {
    if (!ui || !ui.stick || !ui.stick.active) return;
    var st = ui.stick;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#39d6c4'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(st.x, st.y, 60, 0, 6.28); ctx.stroke();
    ctx.fillStyle = 'rgba(10,20,26,0.35)';
    ctx.beginPath(); ctx.arc(st.x, st.y, 60, 0, 6.28); ctx.fill();
    var dx = st.dx, dy = st.dy, dl = Math.sqrt(dx * dx + dy * dy);
    if (dl > 1) { dx = dx / dl * Math.min(dl, 52); dy = dy / dl * Math.min(dl, 52); }
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(57,214,196,0.75)';
    ctx.beginPath(); ctx.arc(st.x + dx, st.y + dy, 22, 0, 6.28); ctx.fill();
    ctx.fillStyle = 'rgba(232,226,207,0.75)';
    ctx.beginPath(); ctx.arc(st.x + dx, st.y + dy, 7, 0, 6.28); ctx.fill();
    ctx.restore();
  }

  var gradCache = {};
  function cachedRadial(key, r0, r1, stops) {
    var c = gradCache[key];
    if (c && c.r0 === r0 && c.r1 === r1) return c.g;
    var g = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    gradCache[key] = { g: g, r0: r0, r1: r1 };
    return g;
  }
  var dimGrads = {};
  function radialOn(c, key, r0, r1, stops) {
    var k = key + ':' + r0 + ':' + r1;
    var g = dimGrads[k];
    if (g) return g;
    g = c.createRadialGradient(0, 0, r0, 0, 0, r1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    dimGrads[k] = g;
    return g;
  }

  function drawLantern(s, t) {
    // the lantern rides with the knight, so the rumble must move it too — otherwise the light
    // pool stays still while the world shakes and the frame looks torn
    var px = (s.player.x - cam.x) * cam.zoom + W / 2 + shakeX;
    var py = (s.player.y - cam.y) * cam.zoom + H * 0.54 + shakeY;
    if (s.mode === 'menu' || s.mode === 'win' || s.mode === 'lose' || s.mode === 'levelup') {
      px = W / 2; py = H * 0.5;
    }
    if (!dimCtx) { return; }
    var hs = 0.5;                                  // half-res buffer: soft gradients, quarter of the pixels
    var bw = dimCv.width, bh = dimCv.height;
    var dark = radialOn(dimCtx, 'dark', 20, Math.round(Math.max(bw, bh) * 0.62), [
      [0, 'rgba(4,7,10,0.00)'],
      [0.22, 'rgba(4,7,10,0.04)'],
      [0.55, 'rgba(4,7,10,0.22)'],
      [1, 'rgba(4,7,10,0.44)']
    ]);
    var warm = radialOn(dimCtx, 'warm', 0, Math.round(250 * cam.zoom * hs), [
      [0, 'rgba(255,176,92,0.22)'],
      [0.5, 'rgba(255,150,70,0.06)'],
      [1, 'rgba(255,150,70,0)']
    ]);
    var hx = px * hs, hy = py * hs;
    dimCtx.setTransform(1, 0, 0, 1, 0, 0);
    dimCtx.clearRect(0, 0, bw, bh);
    dimCtx.save();
    dimCtx.translate(hx, hy);
    dimCtx.fillStyle = dark; dimCtx.fillRect(-hx, -hy, bw, bh);
    dimCtx.restore();
    dimCtx.save();
    dimCtx.globalCompositeOperation = 'lighter';
    dimCtx.translate(hx, hy);
    dimCtx.fillStyle = warm; dimCtx.fillRect(-hx, -hy, bw, bh);
    dimCtx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(dimCv, 0, 0, W, H);
    ctx.restore();
  }

  function drawMotes(t, dt) {
    if (!FX.motes) {
      FX.motes = [];
      for (var i = 0; i < 18; i++) FX.motes.push({ x: Math.random() * W, y: Math.random() * H,
        vx: 6 + Math.random() * 12, vy: -2 - Math.random() * 8, s: 0.7 + Math.random() * 1.6,
        ph: Math.random() * 6.28 });
    }
    for (var j = 0; j < FX.motes.length; j++) {
      var m = FX.motes[j];
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.x > W + 10) m.x = -10;
      if (m.y < -10) m.y = H + 10;
      ctx.save();
      ctx.globalAlpha = 0.18 + Math.sin(t * 1.3 + m.ph) * 0.1;
      ctx.fillStyle = '#cfe3ec';
      ctx.beginPath(); ctx.arc(m.x, m.y, m.s, 0, 6.28); ctx.fill();
      ctx.restore();
    }
  }

  /* ---------- HUD ---------- */
  function drawSpeaker(x, y, u, muted) {
    ctx.save();
    ctx.fillStyle = muted ? 'rgba(160,175,185,0.75)' : COL.bone;
    ctx.beginPath();
    ctx.moveTo(x - 7 * u, y - 4 * u); ctx.lineTo(x - 2 * u, y - 4 * u); ctx.lineTo(x + 3 * u, y - 8 * u);
    ctx.lineTo(x + 3 * u, y + 8 * u); ctx.lineTo(x - 2 * u, y + 4 * u); ctx.lineTo(x - 7 * u, y + 4 * u);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = muted ? 'rgba(160,175,185,0.75)' : COL.bone;
    ctx.lineWidth = 1.8 * u;
    if (muted) {
      ctx.beginPath(); ctx.moveTo(x + 6 * u, y - 4 * u); ctx.lineTo(x + 12 * u, y + 4 * u);
      ctx.moveTo(x + 12 * u, y - 4 * u); ctx.lineTo(x + 6 * u, y + 4 * u); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x + 5 * u, y, 5 * u, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 5 * u, y, 9 * u, -0.8, 0.8); ctx.stroke();
    }
    ctx.restore();
  }

  function drawHUD(s, t, ui) {
    var u = clamp(min(W, H) / 420, 0.82, 1.25);
    var pad = 14;
    var top = safe.top + pad;
    var PB = 48;                                   // fixed CSS px, thumb-sized on every screen

    // pause top-right. When paused the same spot becomes the resume control, so one thumb
    // can pause and resume without hunting for a button.
    var pr = { x: W - safe.right - pad - PB, y: top, w: PB, h: PB };
    panel(pr.x, pr.y, pr.w, pr.h, 10, 'rgba(12,20,26,0.65)', 'rgba(120,150,165,0.4)');
    ctx.fillStyle = COL.bone;
    if (s.mode === 'paused') {                 // ▶ resume in the same thumb spot
      ctx.beginPath();
      ctx.moveTo(pr.x + pr.w * 0.36, pr.y + pr.h * 0.28);
      ctx.lineTo(pr.x + pr.w * 0.74, pr.y + pr.h * 0.5);
      ctx.lineTo(pr.x + pr.w * 0.36, pr.y + pr.h * 0.72);
      ctx.closePath(); ctx.fill();
    } else {                                    // ❚❚ pause
      ctx.fillRect(pr.x + pr.w * 0.32, pr.y + pr.h * 0.26, pr.w * 0.12, pr.h * 0.48);
      ctx.fillRect(pr.x + pr.w * 0.56, pr.y + pr.h * 0.26, pr.w * 0.12, pr.h * 0.48);
    }
    uiRects.pause = pr;

    // mute beside pause
    var mr = { x: pr.x - PB - 8, y: top, w: PB, h: PB };
    panel(mr.x, mr.y, mr.w, mr.h, 10, 'rgba(12,20,26,0.65)', 'rgba(120,150,165,0.4)');
    drawSpeaker(mr.x + mr.w / 2, mr.y + mr.h / 2, u, ui && ui.muted);
    uiRects.mute = mr;

    // timer sits BELOW the arcade pill: the top-left 120x52 corner is the ◀ ARCADE button.
    var hx = safe.left + pad + 6, hy = safe.top + 66;
    ctx.save();
    ctx.strokeStyle = COL.bone; ctx.lineWidth = 2 * u;
    ctx.beginPath(); ctx.arc(hx + 8 * u, hy, 8 * u, 0, 6.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx + 8 * u, hy);
    ctx.lineTo(hx + 8 * u, hy - 5 * u); ctx.stroke();
    ctx.restore();
    var mm = Math.floor(s.timer / 60), ss = Math.floor(s.timer % 60);
    txt(mm + ':' + (ss < 10 ? '0' : '') + ss, hx + 22 * u, hy, 20 * u, COL.bone, 'left', 'Title');
    txt('WAVE ' + s.wave + '/10', hx, hy + 20 * u, 11 * u, COL.dim, 'left');

    // score top-center (clear of the pill: the pill is only 120 px wide on the left)
    var sy = Math.max(safe.top + 20, 20);
    txt('SCORE ' + s.score, W / 2, sy, 15 * u, COL.bone, 'center', 'Title');
    if (s.best > 0) txt('BEST ' + s.best, W / 2, sy + 17 * u, 10 * u, COL.dim, 'center');

    // banners
    for (var bb = 0; bb < FX.banners.length; bb++) {
      var bn = FX.banners[bb];
      var kk = bn.t / bn.life;
      var aa = kk < 0.12 ? kk / 0.12 : (kk > 0.78 ? (1 - kk) / 0.22 : 1);
      ctx.save(); ctx.globalAlpha = Math.max(0, aa);
      txt(bn.text, W / 2, H * 0.22, Math.min(32 * u, W * 0.075), bn.color, 'center', 'Title');
      if (bn.sub) txt(bn.sub, W / 2, H * 0.22 + 30 * u, 11 * u, COL.dim, 'center');
      ctx.restore();
    }

    // HP + XP bottom-left
    var bx = safe.left + pad, by = H - safe.bottom - pad - 46 * u;
    var bw = Math.min(190 * u, W * 0.42), bh = 14 * u;
    txt('HP', bx, by - 10 * u, 10 * u, COL.dim, 'left');
    panel(bx, by, bw, bh, 4, 'rgba(8,12,16,0.8)', 'rgba(120,150,165,0.35)');
    var hpw = bw * clamp(s.hp / s.maxHp, 0, 1);
    var hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hg.addColorStop(0, s.hp / s.maxHp < 0.3 ? '#ff5a5a' : '#c8425a');
    hg.addColorStop(1, s.hp / s.maxHp < 0.3 ? '#ff8a7a' : '#e05664');
    ctx.fillStyle = hg; ctx.fillRect(bx + 1, by + 1, Math.max(0, hpw - 2), bh - 2);
    txt(Math.ceil(s.hp) + '/' + s.maxHp, bx + bw - 6, by + bh / 2, 9 * u, COL.bone, 'right');

    var xy = by + bh + 7 * u;
    panel(bx, xy, bw, 6 * u, 3, 'rgba(8,12,16,0.8)', null);
    ctx.fillStyle = COL.teal;
    ctx.fillRect(bx + 1, xy + 1, Math.max(0, (bw - 2) * clamp(s.xp / s.xpToNext, 0, 1)), 6 * u - 2);
    txt('LV ' + s.level, bx + bw + 8 * u, by + bh / 2, 14 * u, COL.gold, 'left', 'Title');

    // weapon / upgrade chips bottom-center
    var chips = [];
    if (s.upgrades.blade) chips.push('BLADE ' + s.upgrades.blade);
    if (s.upgrades.swift) chips.push('SWIFT ' + s.upgrades.swift);
    if (s.upgrades.reach) chips.push('REACH ' + s.upgrades.reach);
    if (s.upgrades.magnet) chips.push('MAGNET ' + s.upgrades.magnet);
    if (chips.length) {
      var cw = 10 * u, total = 0;
      for (var i = 0; i < chips.length; i++) total += ctx.measureText(chips[i]).width + 16 * u;
      var cx = W / 2 - total / 2;
      var cy = H - safe.bottom - pad - 18 * u;
      for (var j = 0; j < chips.length; j++) {
        ctx.font = 'KenneyBody ' + 10 * u + 'px "KenneyBody", monospace';
        var wj = ctx.measureText(chips[j]).width + 14 * u;
        panel(cx, cy - 9 * u, wj, 18 * u, 5, 'rgba(12,20,26,0.7)', 'rgba(120,150,165,0.3)');
        txt(chips[j], cx + wj / 2, cy, 10 * u, COL.dim, 'center');
        cx += wj + 5 * u;
      }
    }

    // dash button bottom-right (92 px target, thumb reach)
    var dr = 46;
    var dcx = W - safe.right - pad - dr - 6, dcy = H - safe.bottom - pad - dr - 6;
    uiRects.dash = { x: dcx - dr, y: dcy - dr, w: dr * 2, h: dr * 2, cx: dcx, cy: dcy, r: dr };
    var ready = s.player.dashCd <= 0;
    ctx.save();
    ctx.globalAlpha = ready ? 0.95 : 0.55;
    ctx.fillStyle = 'rgba(12,28,32,0.75)';
    ctx.beginPath(); ctx.arc(dcx, dcy, dr, 0, 6.28); ctx.fill();
    ctx.strokeStyle = ready ? COL.teal : 'rgba(120,150,165,0.5)';
    ctx.lineWidth = 3; ctx.stroke();
    if (!ready) {
      var frac = 1 - s.player.dashCd / Math.max(0.001, GraveSimStats(s).dashCd);
      ctx.strokeStyle = COL.teal; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(dcx, dcy, dr - 3, -Math.PI / 2, -Math.PI / 2 + 6.28 * clamp(frac, 0, 1)); ctx.stroke();
    }
    ctx.restore();
    if (imgs.arrow) {
      ctx.save(); ctx.globalAlpha = ready ? 1 : 0.5;
      ctx.drawImage(imgs.arrow, dcx - dr * 0.5, dcy - dr * 0.5, dr, dr);
      ctx.restore();
    } else {
      txt('DASH', dcx, dcy, 11 * u, ready ? COL.teal : COL.dim, 'center');
    }

    // first seconds of a run: show the controls for the device actually in use, then fade out
    if (s.time < 10 && s.mode === 'run') {
      var dev = (ui && ui.hint && ui.hint.device) || 'touch';
      var a = s.time < 7 ? 1 : Math.max(0, 1 - (s.time - 7) / 3);
      drawHints(dev, W / 2, H - safe.bottom - 96 * u, u, 0.9 * a);
    }
  }
  function GraveSimStats(s) { return root.GraveSim.stats(s); }

  /* ---------- device-aware control hints (Kenney CC0 input prompts) ---------- */
  function hintItems(device) {
    if (device === 'pad') return [
      { icons: ['pad'], label: 'LS / DPAD  MOVE' },
      { icons: ['padA'], label: 'DASH · CUT · CONFIRM' },
      { icons: ['padStart'], label: 'PAUSE' }
    ];
    if (device === 'touch') return [
      { icons: ['swipe'], label: 'DRAG  MOVE' },
      { icons: ['tap'], label: 'TAP  DASH · CUT' },
      { icons: [], label: '⏸  PAUSE' }
    ];
    return [
      { icons: ['w', 'a', 's', 'd'], label: 'MOVE' },
      { icons: ['space'], label: 'DASH · CUT' },
      { icons: ['esc'], label: 'PAUSE' }
    ];
  }

  function drawHints(device, cx, cy, u, alpha) {
    var items = hintItems(device);
    var sz = Math.round(18 * u), gap = 2, lg = 5, sep = 12, fs = 10 * u;
    ctx.save();
    ctx.font = fs + 'px "KenneyBody", monospace';
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      it.tw = it.label ? ctx.measureText(it.label).width : 0;
      total += it.icons.length * (sz + gap) + (it.label ? lg + it.tw : 0) - gap;
    }
    total += sep * (items.length - 1);
    var x0 = cx - total / 2;
    panel(x0 - 10, cy - sz / 2 - 5, total + 20, sz + 10, 6, 'rgba(8,12,16,0.6)', null);
    ctx.globalAlpha = alpha;
    var x = x0;
    for (var j = 0; j < items.length; j++) {
      var it2 = items[j];
      for (var k = 0; k < it2.icons.length; k++) {
        var im = imgs.p && imgs.p[it2.icons[k]];
        if (im) ctx.drawImage(im, x, cy - sz / 2, sz, sz);
        x += sz + gap;
      }
      if (it2.label) {
        txt(it2.label, x + lg, cy, fs, COL.dim, 'left', 'Body', false);
        x += lg + it2.tw;
      }
      x += sep;
    }
    ctx.restore();
  }

  function drawMenu(s, t, ui) {
    ctx.fillStyle = 'rgba(4,7,10,0.55)'; ctx.fillRect(0, 0, W, H);
    var u = clamp(min(W, H) / 420, 0.82, 1.3);
    var landscape = W > H;
    var dev = (ui && ui.hint && ui.hint.device) || 'touch';
    var btnLabel = dev === 'pad' ? 'PRESS A' : dev === 'keyboard' ? 'PRESS ENTER' : 'TAP TO DESCEND';

    // landscape is a two-column layout: knight left, title + button right. Stacking them
    // (the old layout) put the button on top of the knight at 844x390.
    var cxT = landscape ? W * 0.62 : W / 2;
    var cy = landscape ? H * 0.26 : H * 0.40;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * 6.28 + t * 0.1;
      drawGlow(cxT + Math.cos(a) * 120 * u, cy - 20 * u + Math.sin(a) * 60 * u, 40, i % 2 ? '#39d6c4' : '#ffc857', 0.18);
    }
    ctx.restore();

    var titleSize = landscape ? Math.min(W * 0.062, 54 * u) : Math.min(W * 0.115, 78 * u);
    txt('GRAVE', cxT, cy - 30 * u, titleSize, COL.bone, 'center', 'Title');
    txt('LANTERN', cxT, cy + 30 * u, titleSize, COL.gold, 'center', 'Title');
    txt('HOLD THE CRYPT UNTIL THE WARDEN FALLS', cxT, cy + 74 * u, (landscape ? 10 : 12) * u, COL.dim, 'center');

    // knight display
    var kx = landscape ? W * 0.24 : W / 2;
    var ky = landscape ? H * 0.66 : cy + 170 * u;
    var ks = landscape ? 0.66 : 0.88;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(kx, ky + 4, 44 * ks, 15 * ks, 0, 0, 6.28); ctx.fill();
    drawFrame(sheets.knight, 'idle_S', t, kx, ky, ks);
    drawGlow(kx + 30 * u, ky - 80 * ks, 70 * ks + 14, '#ff9c4a', 0.55 + Math.sin(t * 5) * 0.08);

    var btnW = Math.min(landscape ? W * 0.30 : W - safe.left - safe.right - 48, 300 * u);
    var btnH = Math.max(56, 52 * u);
    var btnX = cxT - btnW / 2, btnY = landscape ? H * 0.52 : H - safe.bottom - 150 * u;
    uiRects.primary = { x: btnX, y: btnY, w: btnW, h: btnH };
    var pulse = 0.5 + Math.sin(t * 3) * 0.5;
    panel(btnX, btnY, btnW, btnH, 10, 'rgba(20,40,38,0.85)', 'rgba(57,214,196,' + (0.5 + pulse * 0.5) + ')');
    txt(btnLabel, cxT, btnY + btnH / 2, (landscape ? 16 : 20) * u, COL.teal, 'center', 'Title');

    // only the controls this device can actually use
    drawHints(dev, cxT, btnY + btnH + (landscape ? 30 : 40) * u, u, 0.95);

    if (s.best > 0) txt('BEST ' + s.best, cxT, btnY - 22 * u, 12 * u, COL.gold, 'center');
    txt('MADE WITH LOCAL TOOLING', W / 2, H - safe.bottom - 12 * u, 8.5 * u, 'rgba(139,160,173,0.5)', 'center');

    var mmb = 48;
    var mmr = { x: W - safe.right - 14 - mmb, y: safe.top + 14, w: mmb, h: mmb };
    panel(mmr.x, mmr.y, mmr.w, mmr.h, 10, 'rgba(12,20,26,0.65)', 'rgba(120,150,165,0.4)');
    drawSpeaker(mmr.x + mmr.w / 2, mmr.y + mmr.h / 2, u, ui && ui.muted);
    uiRects.mute = mmr;
  }

  function drawLevelUp(s, t, ui) {
    ctx.fillStyle = 'rgba(4,7,10,0.78)'; ctx.fillRect(0, 0, W, H);
    var u = clamp(min(W, H) / 420, 0.82, 1.25);
    rayT += 1 / 60;
    // radiating yellow rays (reference signature)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(W / 2, H * 0.32);
    for (var i = 0; i < 26; i++) {
      var a = (i / 26) * 6.28 + rayT * 0.15;
      var r0 = 30, r1 = Math.max(W, H) * (0.28 + (i % 3) * 0.12);
      ctx.strokeStyle = 'rgba(255,200,60,' + (0.035 + (i % 4) * 0.012) + ')';
      ctx.lineWidth = 10 + (i % 3) * 8;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
    }
    ctx.restore();

    txt('LEVEL ' + s.level, W / 2, H * 0.14, 34 * u, COL.gold, 'center', 'Title');
    txt('CHOOSE ONE', W / 2, H * 0.14 + 30 * u, 12 * u, COL.bone, 'center');

    var landscape = W > H;
    var n = s.choices.length;
    var cards = [];
    var gap = 10 * u;
    var maxW = Math.min(W - safe.left - safe.right - 32, 520 * u);
    var cardH = Math.min(landscape ? H * 0.44 : 104 * u, 150 * u);
    if (landscape) {
      var cw = (maxW - gap * (n - 1)) / n;
      var startX = W / 2 - (cw * n + gap * (n - 1)) / 2;
      var y0 = H * 0.40;
      for (var i = 0; i < n; i++) cards.push({ x: startX + i * (cw + gap), y: y0, w: cw, h: cardH, id: s.choices[i].id });
    } else {
      var cw2 = maxW;
      var startY = H * 0.32;
      for (var j = 0; j < n; j++) cards.push({ x: W / 2 - cw2 / 2, y: startY + j * (cardH + gap), w: cw2, h: cardH, id: s.choices[j].id });
    }
    uiRects.cards = cards;
    for (var k = 0; k < n; k++) {
      var c = cards[k], up = s.choices[k];
      var hover = ui && ui.hoverCard === k;
      panel(c.x, c.y, c.w, c.h, 10, hover ? 'rgba(44,58,50,0.95)' : 'rgba(18,26,32,0.92)',
            hover ? COL.gold : 'rgba(255,200,87,0.45)');
      var iconX = c.x + 38 * u, iconY = c.y + c.h / 2;
      drawUpgradeIcon(up.id, iconX, iconY, u);
      txt(up.name, c.x + 70 * u, c.y + (landscape ? 28 * u : c.h * 0.36), 18 * u, COL.gold, 'left', 'Title');
      txt(up.desc, c.x + 70 * u, c.y + (landscape ? 52 * u : c.h * 0.66), 11.5 * u, COL.bone, 'left');
      // level pips
      var lvl = s.upgrades[up.id];
      for (var p2 = 0; p2 < 4; p2++) {
        ctx.fillStyle = p2 < lvl ? COL.gold : 'rgba(255,200,87,0.22)';
        ctx.beginPath(); ctx.arc(c.x + 70 * u + p2 * 12 * u, c.y + c.h - 16 * u, 3.5 * u, 0, 6.28); ctx.fill();
      }
      if (landscape) {
        txt('TAP', c.x + c.w - 16 * u, c.y + c.h - 16 * u, 10 * u, COL.dim, 'right');
      } else {
        // portrait used to say only CHOOSE ONE; every card now carries its own tap cue
        txt('TAP', c.x + c.w - 16 * u, c.y + c.h - 14 * u, 10 * u, COL.dim, 'right');
      }
    }
    if (ui && ui.levelupT != null) {
      var left = Math.max(0, Math.ceil(4.5 - ui.levelupT));
      var frac = clamp(ui.levelupT / 4.5, 0, 1);
      var bwid = Math.min(W * 0.5, 220 * u), bx = W / 2 - bwid / 2, by = H - safe.bottom - 22 * u;
      ctx.fillStyle = 'rgba(255,200,87,0.18)';
      ctx.fillRect(bx, by, bwid, 3);
      ctx.fillStyle = COL.gold;
      ctx.fillRect(bx, by, bwid * (1 - frac), 3);
      txt('AUTO-PICK IN ' + left + 's', W / 2, by - 10 * u, 9 * u, 'rgba(139,160,173,0.75)', 'center', 'Body', false);
    }
  }

  function drawUpgradeIcon(id, x, y, u) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = COL.gold; ctx.fillStyle = COL.gold; ctx.lineWidth = 2.5 * u;
    if (id === 'blade') {
      ctx.rotate(-0.6);
      ctx.fillRect(-2 * u, -14 * u, 4 * u, 24 * u);
      ctx.fillRect(-7 * u, 8 * u, 14 * u, 3 * u);
    } else if (id === 'swift') {
      ctx.beginPath();
      ctx.moveTo(-9 * u, -12 * u); ctx.lineTo(2 * u, -2 * u); ctx.lineTo(-4 * u, 0);
      ctx.lineTo(9 * u, 12 * u); ctx.stroke();
    } else if (id === 'reach') {
      ctx.beginPath(); ctx.arc(0, 0, 12 * u, -2.2, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(12 * u, 0); ctx.lineTo(16 * u, 4 * u); ctx.lineTo(12 * u, 8 * u); ctx.fill();
    } else if (id === 'boots') {
      ctx.beginPath(); ctx.moveTo(-8 * u, -10 * u); ctx.lineTo(-8 * u, 6 * u); ctx.lineTo(10 * u, 6 * u);
      ctx.lineTo(10 * u, 11 * u); ctx.lineTo(-12 * u, 11 * u); ctx.lineTo(-12 * u, -10 * u); ctx.closePath(); ctx.fill();
    } else if (id === 'vigor') {
      ctx.beginPath();
      ctx.moveTo(0, 8 * u);
      ctx.bezierCurveTo(-16 * u, -2 * u, -10 * u, -14 * u, 0, -6 * u);
      ctx.bezierCurveTo(10 * u, -14 * u, 16 * u, -2 * u, 0, 8 * u);
      ctx.fill();
    } else if (id === 'magnet') {
      ctx.lineWidth = 5 * u;
      ctx.beginPath(); ctx.arc(0, 0, 9 * u, Math.PI, 0); ctx.stroke();
      ctx.fillRect(-11 * u, 0, 6 * u, 8 * u);
      ctx.fillRect(5 * u, 0, 6 * u, 8 * u);
    } else if (id === 'dash') {
      ctx.beginPath(); ctx.moveTo(-12 * u, -6 * u); ctx.lineTo(0, 0); ctx.lineTo(-12 * u, 6 * u); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2 * u, -6 * u); ctx.lineTo(10 * u, 0); ctx.lineTo(-2 * u, 6 * u); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPause(s, t, ui) {
    ctx.fillStyle = 'rgba(4,7,10,0.78)'; ctx.fillRect(0, 0, W, H);
    var u = clamp(min(W, H) / 420, 0.82, 1.25);
    txt('PAUSED', W / 2, H * 0.26, 40 * u, COL.bone, 'center', 'Title');
    txt('WAVE ' + s.wave + ' · ' + Math.ceil(s.timer) + 's LEFT', W / 2, H * 0.26 + 34 * u, 12 * u, COL.dim, 'center');

    var bw = Math.min(W - safe.left - safe.right - 64, 280 * u), bh = 56;
    var bx = W / 2 - bw / 2;
    var r1 = { x: bx, y: H * 0.44, w: bw, h: bh, act: 'resume' };
    var r2 = { x: bx, y: H * 0.44 + bh + 14, w: bw, h: bh, act: 'abandon' };
    panel(r1.x, r1.y, r1.w, r1.h, 10, 'rgba(20,40,38,0.85)', COL.teal);
    txt('RESUME', W / 2, r1.y + bh / 2, 20 * u, COL.teal, 'center', 'Title');
    panel(r2.x, r2.y, r2.w, r2.h, 10, 'rgba(26,20,24,0.85)', 'rgba(224,86,100,0.7)');
    txt('QUIT TO MENU', W / 2, r2.y + bh / 2, 15 * u, COL.blood, 'center', 'Title');
    uiRects.buttons = [r1, r2];

    var dev = (ui && ui.hint && ui.hint.device) || 'touch';
    var resumeHint = dev === 'pad' ? 'A / START  RESUME' : dev === 'keyboard' ? 'ESC / ENTER  RESUME' : 'TAP THE PILL  RESUME';
    drawHints(dev, W / 2, r2.y + bh + 26 * u, u, 0.9);
    txt(resumeHint, W / 2, r2.y + bh + 52 * u, 10 * u, COL.dim, 'center');
  }

  function drawEnd(s, win) {
    ctx.fillStyle = win ? 'rgba(6,10,8,0.74)' : 'rgba(12,6,8,0.8)'; ctx.fillRect(0, 0, W, H);
    var u = clamp(min(W, H) / 420, 0.82, 1.25);
    var cy = H * 0.28;
    if (win) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 12; i++) {
        var a = (i / 12) * 6.28 + performance.now() / 900;
        drawGlow(W / 2 + Math.cos(a) * 140 * u, cy + Math.sin(a) * 90 * u, 50, '#ffc857', 0.22);
      }
      ctx.restore();
    }
    txt(win ? 'THE WARDEN FALLS' : 'YOU FELL', W / 2, cy, 34 * u, win ? COL.gold : COL.blood, 'center', 'Title');
    txt(win ? 'THE CRYPT IS QUIET AGAIN' : 'THE DARK TAKES ITS DUE', W / 2, cy + 34 * u, 11.5 * u, COL.dim, 'center');

    var mm = Math.floor(s.survived / 60), ss = Math.floor(s.survived % 60);
    var lines = [
      ['TIME', mm + ':' + (ss < 10 ? '0' : '') + ss],
      ['WAVE', String(s.wave) + ' / 10'],
      ['KILLS', String(s.kills)],
      ['GOLD', String(s.gold)],
      ['SCORE', String(s.score)]
    ];
    var ly = cy + 90 * u;
    for (var j = 0; j < lines.length; j++) {
      txt(lines[j][0], W / 2 - 70 * u, ly + j * 26 * u, 11 * u, COL.dim, 'right');
      txt(lines[j][1], W / 2 + 70 * u, ly + j * 26 * u, 15 * u, COL.bone, 'left', 'Title');
    }

    var bw = Math.min(W - safe.left - safe.right - 48, 300 * u), bh = Math.max(52 * u, 48);
    var bx = W / 2 - bw / 2, by = H - safe.bottom - 84 * u;
    uiRects.primary = { x: bx, y: by, w: bw, h: bh };
    panel(bx, by, bw, bh, 10, 'rgba(20,34,32,0.9)', win ? COL.gold : COL.teal);
    txt(win ? 'DESCEND AGAIN' : 'TRY AGAIN', W / 2, by + bh / 2, 20 * u, win ? COL.gold : COL.teal, 'center', 'Title');
    if (s.score > s.best) txt('NEW BEST', W / 2, by - 26 * u, 12 * u, COL.gold, 'center');
  }

  R.init = function (cv) {
    canvas = cv;
    ctx = cv.getContext('2d');
  };
  R.uiRects = uiRects;
  R.cam = cam;
  // Test hook: the camera probe reads these to catch drift, wall snaps and shake shimmer.
  R.debug = function () {
    return { cam: { x: cam.x, y: cam.y, zoom: cam.zoom }, lead: { x: camLead.x, y: camLead.y },
             shakeAmp: shakeAmp, shakeX: shakeX, shakeY: shakeY };
  };
  R.safe = function () { return safe; };
  R.fx = FX;
  R.hitTest = function (x, y, s) {
    var mu = uiRects.mute;
    if (mu && x >= mu.x && x <= mu.x + mu.w && y >= mu.y && y <= mu.y + mu.h) return 'mute';
    if (s.mode === 'menu') {
      var p = uiRects.primary;
      return p && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h ? 'start' : null;
    }
    if (s.mode === 'run') {
      if (uiRects.pause && x >= uiRects.pause.x && x <= uiRects.pause.x + uiRects.pause.w &&
          y >= uiRects.pause.y && y <= uiRects.pause.y + uiRects.pause.h) return 'pause';
      var d = uiRects.dash;
      if (d && (x - d.cx) * (x - d.cx) + (y - d.cy) * (y - d.cy) <= d.r * d.r) return 'dash';
      return null;
    }
    if (s.mode === 'levelup') {
      // the pause pill still works while a card is up (a phone can be interrupted mid-choice)
      if (uiRects.pause && x >= uiRects.pause.x && x <= uiRects.pause.x + uiRects.pause.w &&
          y >= uiRects.pause.y && y <= uiRects.pause.y + uiRects.pause.h) return 'pause';
      var cards = uiRects.cards || [];
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return 'card:' + c.id;
      }
      return null;
    }
    if (s.mode === 'paused') {
      // the pause pill turns into ▶ resume: same spot, same thumb
      var pp = uiRects.pause;
      if (pp && x >= pp.x && x <= pp.x + pp.w && y >= pp.y && y <= pp.y + pp.h) return 'resume';
      var bs = uiRects.buttons || [];
      for (var j = 0; j < bs.length; j++) {
        var b = bs[j];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.act;
      }
      return null;
    }
    if (s.mode === 'win' || s.mode === 'lose') {
      var pr = uiRects.primary;
      return pr && x >= pr.x && x <= pr.x + pr.w && y >= pr.y && y <= pr.y + pr.h ? 'restart' : null;
    }
    return null;
  };

  root.GraveRender = R;
})(typeof window !== 'undefined' ? window : globalThis);
