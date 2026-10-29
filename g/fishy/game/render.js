/* FISHY — render: backdrop, pond, HUD, menus, pause overlay.
   Layout rules: the top-left 120x52 belongs to the arcade pill; the top-right 48x48 is
   the input layer's pause button. Everything else is laid out from the real viewport,
   so portrait and landscape both read the same and nothing is clipped. */

"use strict";

var SAFE = { t: 0, r: 0, b: 0, l: 0 };
var MENU_ROWS = [];
var ICONS = {};
var ICON_NAMES = ["keyboard_enter", "xbox_button_a", "touch_tap", "mouse_left",
                  "keyboard_escape", "xbox_button_start", "keyboard_space", "xbox_stick_l",
                  "keyboard_arrows", "touch_hand_open"];

function readSafeArea() {
  var el = document.getElementById("safeprobe");
  if (!el) return;
  var cs = getComputedStyle(el);
  SAFE.t = parseFloat(cs.paddingTop) || 0;
  SAFE.r = parseFloat(cs.paddingRight) || 0;
  SAFE.b = parseFloat(cs.paddingBottom) || 0;
  SAFE.l = parseFloat(cs.paddingLeft) || 0;
}

function loadIcons() {
  ICON_NAMES.forEach(function (n) {
    var im = new Image();
    im.src = "prompts/" + n + ".png";
    ICONS[n] = im;
  });
}

function icon(name, x, y, h) {
  var im = ICONS[name];
  if (!im || !im.complete || !im.naturalWidth) return 0;
  var w = im.naturalWidth * (h / im.naturalHeight);
  ctx.drawImage(im, x, y, w, h);
  return w;
}

function fitFont(text, maxW, startSize, weight, family) {
  var size = startSize;
  do {
    ctx.font = (weight || "700") + " " + size + "px " + (family || '"Courier New", monospace');
    if (ctx.measureText(text).width <= maxW) break;
    size -= 1;
  } while (size > 9);
  return size;
}

function wrapLines(text, maxW, size, weight, family) {
  ctx.font = (weight || "600") + " " + size + "px " + (family || "-apple-system, system-ui, sans-serif");
  var words = String(text).split(" "), lines = [], cur = "";
  for (var i = 0; i < words.length; i++) {
    var t = cur ? cur + " " + words[i] : words[i];
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = words[i]; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ---------- backdrop (built once per resize, matches the target frames) ---------- */
var bgCanvas = null;
function buildBackdrop() {
  if (!W || !H) return;
  bgCanvas = document.createElement("canvas");
  bgCanvas.width = Math.round(W * DPR);
  bgCanvas.height = Math.round(H * DPR);
  var g = bgCanvas.getContext("2d");
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  var wg = g.createLinearGradient(0, 0, 0, H);
  wg.addColorStop(0, "#9ed4f2");
  wg.addColorStop(0.5, "#63b2e4");
  wg.addColorStop(1, "#2a7fc0");
  g.fillStyle = wg; g.fillRect(0, 0, W, H);

  var sbY = H * 0.90;
  var sg = g.createLinearGradient(0, sbY - 30, 0, H);
  sg.addColorStop(0, "#c49a62");
  sg.addColorStop(1, "#8a6234");
  g.beginPath();
  g.moveTo(0, H);
  for (var x = 0; x <= W + 16; x += 24) {
    var y = sbY + Math.sin(x * 0.012 + W * 0.7) * 8 + Math.sin(x * 0.031) * 4;
    g.lineTo(x, y);
  }
  g.lineTo(W + 16, H); g.closePath();
  g.fillStyle = sg; g.fill();

  var nWeed = Math.max(4, Math.round(W / 180));
  for (var i = 0; i < nWeed; i++) {
    var wx = (i + 0.5) * W / nWeed + Math.sin(i * 7) * 30;
    var hgt = H * (0.16 + 0.14 * Math.abs(Math.sin(i * 3.1)));
    var lean = Math.sin(i * 5) * 14;
    var gd = g.createLinearGradient(wx, sbY, wx + lean, sbY - hgt);
    gd.addColorStop(0, "#1a8431"); gd.addColorStop(1, "#3fae4e");
    g.beginPath();
    g.moveTo(wx - 7, sbY + 6);
    g.quadraticCurveTo(wx - 10 + lean, sbY - hgt * 0.6, wx + lean, sbY - hgt);
    g.quadraticCurveTo(wx + 4 + lean * 0.4, sbY - hgt * 0.55, wx + 7, sbY + 6);
    g.closePath();
    g.fillStyle = gd; g.fill();
  }

  g.fillStyle = "#f4cf7b";
  for (var m = 0; m < 5; m++) {
    var mx = (m * 137) % W, my = sbY - 8 - (m * 53 % 30);
    g.beginPath(); g.ellipse(mx, my, 4, 2, 0, 0, Math.PI * 2); g.fill();
  }
  for (var p = 0; p < Math.max(10, W / 60); p++) {
    var px = (p * 97 + 31) % W, py = sbY + 6 + (p * 37 % 26);
    var pr = 1.5 + (p % 3);
    g.fillStyle = p % 2 ? "rgba(120,90,50,0.55)" : "rgba(220,190,150,0.5)";
    g.beginPath(); g.ellipse(px, py, pr + 1, pr, 0, 0, Math.PI * 2); g.fill();
  }
  for (var c = 0; c < Math.max(3, W / 400); c++) {
    var cx2 = (c * 311 + 90) % W, cy2 = sbY + 4;
    g.fillStyle = "rgba(226,110,160,0.75)";
    for (var a = 0; a < 3; a++) {
      g.beginPath();
      g.ellipse(cx2 + a * 5 - 5, cy2 - 4 - a * 2, 2.2, 5, (a - 1) * 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  g.save();
  g.globalCompositeOperation = "lighter";
  for (var r = 0; r < 6; r++) {
    var rx = ((r * 0.163 + 0.05 + Math.sin(r * 13.7) * 0.03) % 1) * W;
    var w0 = 14 + (r % 3) * 11;
    var sway = Math.sin(r * 2.4) * (18 + (r % 3) * 22);
    var len = H * (0.55 + (r % 4) * 0.09);
    var alpha = 0.13 + (r % 3) * 0.05;
    var grd = g.createLinearGradient(rx, 0, rx + 40 + sway, len);
    grd.addColorStop(0, "rgba(255,255,255," + alpha + ")");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(rx, 0); g.lineTo(rx + w0, 0);
    g.lineTo(rx + w0 + 46 + sway * 2, len);
    g.lineTo(rx + 8 + sway * 2, len);
    g.closePath(); g.fill();
  }
  g.restore();

  var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
  vg.addColorStop(0, "rgba(0,20,60,0)");
  vg.addColorStop(1, "rgba(0,20,60,0.34)");
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
}

/* ---------- pond ---------- */
function drawPond() {
  var shx = (Math.random() * 2 - 1) * shakeT * 0.6;
  var shy = (Math.random() * 2 - 1) * shakeT * 0.6;
  ctx.save();
  ctx.translate(shx, shy);
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);

  for (var i = 0; i < bits.length; i++) {
    var b = bits[i];
    if (!b.cloud) continue;
    ctx.globalAlpha = Math.min(0.5, b.life / 90);
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.2;
  for (var bi = 0; bi < bubbles.length; bi++) {
    var bu = bubbles[bi];
    ctx.beginPath(); ctx.arc(bu.x, bu.y, bu.r, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (var c = 0; c < 2; c++) {
    var ph = T * 0.004 + c * 2.1;
    var yBase = H * (0.18 + c * 0.30);
    ctx.strokeStyle = "rgba(200,235,255," + (0.028 + 0.012 * Math.sin(ph * 1.7)) + ")";
    ctx.lineWidth = 10 + c * 6;
    ctx.beginPath();
    for (var x = -20; x <= W + 20; x += 22) {
      var y = yBase + Math.sin(x * 0.008 + ph * (1.3 + c * 0.2)) * 14 + Math.sin(x * 0.021 - ph) * 7;
      if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  for (var mi = 0; mi < motes.length; mi++) {
    var m = motes[mi];
    ctx.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(T * 0.03 + m.ph));
    ctx.fillStyle = "#e8f6ff";
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  var sbYf = H * 0.90;
  for (var k = 0; k < 2; k++) {
    var wx = ((k + 0.5) * W / 2 + 40) % W;
    var sway = Math.sin(T * 0.012 + k * 2.2) * 10;
    var hgt = H * (0.18 + k * 0.05);
    ctx.beginPath();
    ctx.moveTo(wx - 5, sbYf + 6);
    ctx.quadraticCurveTo(wx - 8 + sway, sbYf - hgt * 0.6, wx + sway, sbYf - hgt);
    ctx.quadraticCurveTo(wx + 3 + sway * 0.4, sbYf - hgt * 0.55, wx + 5, sbYf + 6);
    ctx.closePath();
    ctx.fillStyle = "rgba(26,110,45,0.55)";
    ctx.fill();
  }

  // danger / food markers, so a player reads the pond without guessing
  for (var fi = 0; fi < fishes.length; fi++) {
    var f = fishes[fi];
    var fl = fishLen(f.tier);
    var dx = wrapDX(player.x - f.x), dy = player.y - f.y;
    var dist = Math.hypot(dx, dy);
    if (isDanger(f)) {
      var near = clamp(1 - (dist - (fl * 0.3 + plen() * 0.3)) / 240, 0, 1);
      if (near > 0.05 || f.windup > 0) {
        var a = 0.10 + 0.42 * near + (f.windup > 0 ? 0.35 + 0.2 * Math.sin(T * 0.5) : 0);
        ctx.strokeStyle = "rgba(228,40,40," + Math.min(0.85, a) + ")";
        ctx.lineWidth = 2 + 2.4 * near + (f.windup > 0 ? 2 : 0);
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, fl * 0.46, fl * 0.34, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (dist < 220) {
      var eA = 0.12 + 0.16 * clamp(1 - dist / 220, 0, 1);
      ctx.strokeStyle = "rgba(190,255,170," + eA + ")";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, fl * 0.44, fl * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (var fj = 0; fj < fishes.length; fj++) {
    var fj2 = fishes[fj];
    var len = fishLen(fj2.tier);
    ctx.save();
    ctx.translate(fj2.x, fj2.y);
    if (fj2.dir < 0) ctx.scale(-1, 1);
    ctx.rotate(Math.sin(fj2.wob) * (0.05 + Math.abs(fj2.vx) * 0.012));
    ctx.scale(len / 100, len / 100);
    drawFishUnit(ctx, fj2.k, Math.floor((fj2.wob * 3) / (Math.PI / 2)) % 5,
                 { mouth: true, bite: false, wagAmp: 1 });
    ctx.restore();
  }

  {
    var pl = plen();
    var blink = blinkT > 0 && Math.floor(T / 6) % 2 === 0;
    if (!blink) {
      var glowR = pl * 1.1;
      var gg = ctx.createRadialGradient(player.x, player.y, pl * 0.2, player.x, player.y, glowR);
      gg.addColorStop(0, "rgba(255,230,150,0.20)");
      gg.addColorStop(1, "rgba(255,230,150,0)");
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(player.x, player.y, glowR, 0, Math.PI * 2); ctx.fill();

      if (player.burstT > 0) {
        // speed streaks: the dash must read as a dash, not a lag spike
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (var ti = 1; ti <= 4; ti++) {
          ctx.globalAlpha = 0.14 * (1 - ti / 5);
          ctx.fillStyle = "#e6f7ff";
          ctx.beginPath();
          ctx.ellipse(player.x - Math.cos(player.ang) * pl * 0.30 * ti,
                      player.y - Math.sin(player.ang) * pl * 0.30 * ti,
                      pl * 0.17, pl * 0.11, player.ang, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.ang);
      if (Math.abs(player.ang) > Math.PI / 2) ctx.scale(1, -1);
      var wag = Math.floor(T / 5) % 5;
      ctx.scale(pl / 100, pl / 100);
      drawFishUnit(ctx, { back: playerHue.back, belly: playerHue.belly, fin: playerHue.fin }, wag,
                   { mouth: true, bite: hitStop > 0, wagAmp: 1.1 });
      ctx.restore();

      // growth ring: the run's goal, drawn around the fish itself
      var prog = clamp((player.tier - 1) / (targetTier - 1), 0, 1);
      if (prog > 0.02 && state === "play") {
        ctx.strokeStyle = "rgba(255,214,90,0.75)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(player.x, player.y, pl * 0.62 + 9, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        ctx.stroke();
      }

      var chY = player.y - pl * 0.75 - 12 + Math.sin(T * 0.05) * 2;
      ctx.fillStyle = "rgba(255,250,220,0.95)";
      ctx.strokeStyle = "rgba(60,40,10,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(player.x - 8, chY - 6);
      ctx.lineTo(player.x + 8, chY - 6);
      ctx.lineTo(player.x, chY + 1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  for (var ci = 0; ci < chunks.length; ci++) {
    var ch = chunks[ci];
    ctx.globalAlpha = Math.min(1, ch.life / 25);
    ctx.save();
    ctx.translate(ch.x, ch.y); ctx.rotate(ch.rot);
    ctx.fillStyle = ch.color;
    ctx.beginPath(); ctx.ellipse(0, 0, ch.w / 2, ch.h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (var di = 0; di < bits.length; di++) {
    var db = bits[di];
    if (db.cloud) continue;
    ctx.globalAlpha = Math.min(1, db.life / 18);
    ctx.fillStyle = db.color;
    ctx.beginPath(); ctx.arc(db.x, db.y, db.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (var ri = 0; ri < rings.length; ri++) {
    var rg = rings[ri];
    ctx.globalAlpha = Math.min(0.7, rg.life / 22);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (var pi = 0; pi < popups.length; pi++) {
    var po = popups[pi];
    ctx.globalAlpha = Math.min(1, po.life / 24);
    ctx.fillStyle = po.color;
    ctx.font = "700 15px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(po.text, po.x, po.y);
  }
  ctx.globalAlpha = 1;

  if (flashT > 0) {
    var fa = Math.min(0.45, flashT * 0.045);
    ctx.fillStyle = "rgba(255,235,205," + fa + ")";
    ctx.fillRect(-40, -40, W + 80, H + 80);
  }
  ctx.restore();
}

/* ---------- HUD ---------- */
function drawHud() {
  var top = SAFE.t;
  var cx = W / 2;

  // score, top centre (dark blue numerals like the target frames)
  ctx.textAlign = "center";
  ctx.fillStyle = "#0e3e72";
  ctx.font = "700 30px \"Courier New\", monospace";
  ctx.fillText(String(Math.round(score)), cx, top + 36);
  ctx.font = "700 11px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "rgba(14,62,114,0.75)";
  ctx.fillText("BEST " + bestScore, cx, top + 52);

  // growth bar, centre, under BEST — the goal in one glance
  var barW = Math.min(196, W * 0.44), barH = 7;
  var bx = cx - barW / 2, by = top + 60;
  ctx.fillStyle = "rgba(8,40,72,0.35)";
  roundRect(bx, by, barW, barH, 3.5); ctx.fill();
  var prog = clamp((player.tier - 1) / (targetTier - 1), 0, 1);
  ctx.fillStyle = "#ffd45e";
  roundRect(bx, by, Math.max(2, barW * prog), barH, 3.5); ctx.fill();
  ctx.font = "700 10px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "rgba(10,52,94,0.9)";
  var label = mode === "deep" ? "DEEP " : "APEX ";
  ctx.fillText(label + Math.round(prog * 100) + "%", cx, by + barH + 12);

  // hunger: the pond's patience. Red bar, pulses when it is nearly full.
  var hbW = Math.min(112, W * 0.30), hbX = cx - hbW / 2, hbY = by + 17, hbH = 4;
  ctx.fillStyle = "rgba(8,40,72,0.3)";
  roundRect(hbX, hbY, hbW, hbH, 2); ctx.fill();
  var hcol = hunger > 0.72 ? "rgba(230,70,60,0.95)" : "rgba(200,120,70,0.8)";
  ctx.fillStyle = hcol;
  roundRect(hbX, hbY, Math.max(1, hbW * clamp(hunger, 0, 1)), hbH, 2); ctx.fill();
  ctx.textAlign = "right";
  ctx.font = "700 9px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = hunger > 0.72 ? "rgba(250,120,110,0.95)" : "rgba(10,52,94,0.7)";
  ctx.fillText(hunger > 0.72 ? "STARVING" : "HUNGRY", hbX - 6, hbY + 4);
  ctx.textAlign = "center";

  // lives, left, clear of the 120x52 arcade pill
  var ly = top + 64;
  for (var i = 0; i < lives; i++) {
    ctx.save();
    ctx.translate(SAFE.l + 18 + i * 21, ly);
    ctx.scale(0.20, 0.20);
    drawFishUnit(ctx, { back: "#e8a8c4", belly: "#f7d8e4", fin: "#d488ac" }, 0, {});
    ctx.restore();
  }
  ctx.textAlign = "left";
  ctx.font = "700 10px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "rgba(10,52,94,0.8)";
  ctx.fillText("LIVES", SAFE.l + 10, ly - 20);

  // burst meter, bottom-left
  var bw = 86, bh = 6, bx2 = SAFE.l + 14, by2 = H - SAFE.b - 22;
  ctx.fillStyle = "rgba(8,40,72,0.4)";
  roundRect(bx2, by2, bw, bh, 3); ctx.fill();
  var ready = 1 - clamp(player.burstCD / 120, 0, 1);
  ctx.fillStyle = ready >= 1 ? "#9ff2c0" : "rgba(160,220,255,0.7)";
  roundRect(bx2, by2, Math.max(2, bw * ready), bh, 3); ctx.fill();
  ctx.font = "700 9px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "rgba(8,40,72,0.85)";
  ctx.textAlign = "left";
  ctx.fillText("BURST", bx2, by2 - 5);
  if (ready >= 1) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText("READY", bx2 + bw - 30, by2 - 5);
  }

  // wave banner
  if (banner.t > 0 && state === "play") {
    ctx.globalAlpha = Math.min(1, banner.t / 30);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "700 20px \"Courier New\", monospace";
    ctx.fillText(banner.text, cx, H * 0.26);
    ctx.globalAlpha = 1;
  }

  // red edge when starving: a warning the player can feel without reading
  if (state === "play" && hunger > 0.72) {
    var pulse = 0.10 + 0.10 * Math.sin(T * 0.22);
    var vg = ctx.createRadialGradient(cx, H / 2, Math.min(W, H) * 0.30, cx, H / 2, Math.max(W, H) * 0.68);
    vg.addColorStop(0, "rgba(200,30,30,0)");
    vg.addColorStop(1, "rgba(200,30,30," + pulse + ")");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  // first-seconds hint, wrapped so it never clips on a narrow phone
  if (state === "play" && runFrames < 60 * 6) {
    var hint = deviceHint();
    var maxW = W - 32;
    var size = fitFont(hint, maxW, Math.min(15, Math.max(11, W / 26)), "600", "-apple-system, system-ui, sans-serif");
    ctx.font = "600 " + size + "px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255," + (0.9 - 0.6 * clamp((runFrames - 60 * 4) / 120, 0, 1)) + ")";
    ctx.textAlign = "center";
    ctx.fillText(hint, cx, H - SAFE.b - 40);
  }
}

function deviceHint() {
  var d = input ? input.device : "keyboard";
  if (d === "touch") return "DRAG TO SWIM · EAT SMALLER FISH · BURST TO ESCAPE";
  if (d === "pad") return "STICK SWIM · A BURST · KEEP EATING";
  return "WASD SWIM · SPACE BURST · KEEP EATING";
}

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- menus ---------- */
function menuLayout() {
  var cx = W / 2;
  var deepOpen = clearedPond;
  var rows = [];
  var w = Math.min(280, W * 0.72), h = H < 500 ? 46 : 54;
  var y1 = H * 0.54;
  rows.push({ id: "pond", label: "DIVE IN", x: cx - w / 2, y: y1, w: w, h: h });
  if (deepOpen) rows.push({ id: "deep", label: "DEEPER POND", x: cx - w / 2, y: y1 + h + 12, w: w, h: h });
  return rows;
}

function drawMenu() {
  var cx = W / 2, top = SAFE.t;
  ctx.fillStyle = "rgba(6,30,58,0.42)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  var titleSize = Math.min(56, Math.max(34, W / 6.6));
  ctx.font = "700 " + titleSize + "px \"Courier New\", monospace";
  ctx.fillText("FISHY", cx, top + Math.max(90, H * 0.30));

  var sub = wrapLines("Eat smaller fish. Grow to APEX. Anything bigger eats you.",
                      W - 40, Math.min(15, Math.max(12, W / 30)), "600", "-apple-system, system-ui, sans-serif");
  ctx.font = "600 " + Math.min(15, Math.max(12, W / 30)) + "px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#eaf6ff";
  var sy = top + Math.max(90, H * 0.30) + 26;
  for (var i = 0; i < sub.length; i++) ctx.fillText(sub[i], cx, sy + i * 20);

  MENU_ROWS = menuLayout();
  for (var r = 0; r < MENU_ROWS.length; r++) {
    var row = MENU_ROWS[r];
    var focused = r === menuFocus;
    ctx.fillStyle = focused ? "rgba(255,212,94,0.92)" : "rgba(10,50,90,0.55)";
    roundRect(row.x, row.y, row.w, row.h, 12); ctx.fill();
    ctx.strokeStyle = focused ? "#fff2c0" : "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    roundRect(row.x, row.y, row.w, row.h, 12); ctx.stroke();
    ctx.fillStyle = focused ? "#1b2a44" : "#ffffff";
    ctx.font = "700 " + Math.min(22, row.h * 0.42) + "px \"Courier New\", monospace";
    ctx.textAlign = "center";
    ctx.fillText(row.label, row.x + row.w / 2, row.y + row.h * 0.62);
    // confirm icon on the left edge of the focused row
    if (focused) {
      var ic = input && input.device === "pad" ? "xbox_button_a" :
               input && input.device === "touch" ? "touch_tap" :
               input && input.device === "keyboard" ? "keyboard_enter" : "mouse_left";
      icon(ic, row.x + 12, row.y + row.h / 2 - 11, 22);
    }
  }

  if (!clearedPond) {
    ctx.textAlign = "center";
    ctx.font = "600 11px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "rgba(234,246,255,0.75)";
    ctx.fillText("Clear the pond to unlock DEEPER POND", cx, H * 0.54 + Math.min(56, H * 0.09) + 26);
  }

  // device prompt row under the buttons
  var hy = Math.min(H - SAFE.b - 40, MENU_ROWS[MENU_ROWS.length - 1].y + MENU_ROWS[MENU_ROWS.length - 1].h + 40);
  var dev = input ? input.device : "keyboard";
  var keys = dev === "touch" ? ["touch_hand_open", "touch_tap"] :
             dev === "pad" ? ["xbox_stick_l", "xbox_button_a", "xbox_button_start"] :
             ["keyboard_arrows", "keyboard_space", "keyboard_escape"];
  var labels = dev === "touch" ? ["DRAG", "START"] :
               dev === "pad" ? ["SWIM", "START", "PAUSE"] :
               ["SWIM", "BURST", "PAUSE"];
  ctx.font = "600 10px -apple-system, system-ui, sans-serif";
  var totalW = 0, iw = [];
  for (var q = 0; q < keys.length; q++) {
    var im = ICONS[keys[q]];
    var wq = im && im.complete && im.naturalWidth ? im.naturalWidth * (18 / im.naturalHeight) : 18;
    iw.push(wq);
    totalW += wq + 6 + ctx.measureText(labels[q]).width + 16;
  }
  var hx = cx - totalW / 2;
  for (var z = 0; z < keys.length; z++) {
    var drewW = icon(keys[z], hx, hy - 9, 18);
    hx += (drewW || iw[z]) + 6;
    ctx.fillStyle = "rgba(234,246,255,0.85)";
    ctx.textAlign = "left";
    ctx.fillText(labels[z], hx, hy - 1);
    hx += ctx.measureText(labels[z]).width + 16;
  }
}

function drawOver() {
  ctx.fillStyle = won ? "rgba(10,40,70,0.62)" : "rgba(120,10,10,0.5)";
  ctx.fillRect(0, 0, W, H);
  var cx = W / 2, cy = H * (H > W ? 0.32 : 0.30);
  ctx.textAlign = "center";
  ctx.fillStyle = won ? "#ffd45e" : "#ffffff";
  var size = Math.min(44, Math.max(30, W / 8));
  ctx.font = "700 " + size + "px \"Courier New\", monospace";
  ctx.fillText(won ? "POND CLEARED" : "EATEN", cx, cy);

  ctx.font = "600 16px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = newBest ? "#ffd45e" : "#f2f8ff";
  ctx.fillText(newBest ? ("Score " + Math.round(score) + "  ·  NEW BEST")
                       : ("Score " + Math.round(score) + "  ·  Best " + bestScore), cx, cy + 34);
  ctx.font = "600 13px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "rgba(242,248,255,0.85)";
  var line2 = "Size " + (Math.floor(player.tier * 10) / 10).toFixed(1) + "  ·  " +
              fmtTime(runFrames / 60) + "  ·  " + (mode === "deep" ? "Deeper pond" : "Pond");
  ctx.fillText(line2, cx, cy + 56);

  if (won && mode === "pond") {
    ctx.fillStyle = "#ffe9a8";
    ctx.font = "700 13px -apple-system, system-ui, sans-serif";
    ctx.fillText("DEEPER POND unlocked — a bigger, meaner pond", cx, cy + 80);
  }
  if (won && mode === "deep") {
    ctx.fillStyle = "#ffe9a8";
    ctx.font = "700 13px -apple-system, system-ui, sans-serif";
    ctx.fillText("You beat the deep. Try to clear it faster.", cx, cy + 80);
  }

  var dev = input ? input.device : "keyboard";
  var hint = dev === "touch" ? "Tap to dive again" : dev === "pad" ? "Press A to dive again" : "Click or press Enter to dive again";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 15px -apple-system, system-ui, sans-serif";
  var hs = fitFont(hint, W - 40, 15, "700", "-apple-system, system-ui, sans-serif");
  ctx.font = "700 " + hs + "px -apple-system, system-ui, sans-serif";
  ctx.fillText(hint, cx, cy + 112);
}

function drawPause() {
  ctx.fillStyle = "rgba(6,20,40,0.58)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 " + Math.min(40, W / 9) + "px \"Courier New\", monospace";
  ctx.fillText("PAUSED", W / 2, H * 0.42);
  ctx.font = "600 13px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "rgba(234,246,255,0.9)";
  ctx.fillText("Tap ▶ or press Esc to swim again", W / 2, H * 0.42 + 30);
}

/* ---------- frame ---------- */
function draw() {
  drawPond();
  if (state === "play") drawHud();
  if (state === "menu") drawMenu();
  if (state === "over") { drawHud(); drawOver(); }
  if (input && input.pause && input.pause.paused && state === "play") drawPause();
}

/* menu row rects, also used by taps and by __game.ui */
function layoutUiRects() {
  readSafeArea();
  MENU_ROWS = menuLayout();
}
