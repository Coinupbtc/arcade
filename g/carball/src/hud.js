// CARBALL — HUD: scoreboard, clock, boost gauge, speed, banners, menus.

const $ = (id) => document.getElementById(id);

let bannerTimer = null;
let hintTimer = null;

export const hud = {
  setScore(blue, orange) {
    const b = $('score-blue'), o = $('score-orange');
    if (b) b.textContent = String(blue);
    if (o) o.textContent = String(orange);
  },

  setClock(seconds, overtime) {
    const el = $('clock');
    if (!el) return;
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    el.textContent = `${overtime ? '+' : ''}${m}:${String(r).padStart(2, '0')}`;
    el.classList.toggle('ot', !!overtime);
  },

  setBoost(v) {
    const num = $('boost-num');
    const fill = $('boost-fill');
    if (num) num.textContent = String(Math.round(v));
    if (fill) fill.style.setProperty('--p', `${Math.max(0, Math.min(100, v))}%`);
  },

  setSpeed(mps) {
    const el = $('speed');
    if (el) el.textContent = `${Math.round(mps * 3.6)} KM/H`;
  },

  setCamLabel(ballCam) {
    const el = $('cam-label');
    if (el) el.textContent = ballCam ? 'BALL CAM' : 'CAR CAM';
  },

  // cup progress under the clock: "CUP 2/5" or "QUICK MATCH"
  setCup(text) {
    const el = $('cup-label');
    if (el) { el.textContent = text || ''; el.classList.toggle('hidden', !text); }
  },

  flash(text, kind = 'goal', ms = 1300) {
    const el = $('banner');
    if (!el) return;
    el.textContent = text;
    el.className = `banner show ${kind}`;
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.className = 'banner'; }, ms);
  },

  hint(text, ms = 4200) {
    const el = $('hint');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => el.classList.remove('show'), ms);
  },

  menu(show) { toggle('menu', show); },
  over(show, title, score) {
    toggle('over', show);
    if (title) $('over-title').textContent = title;
    if (score) $('over-score').textContent = score;
  },
  pause(show) { toggle('pause', show); },
  hud(show) { toggle('hud', show); },
};

function toggle(id, show) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle('hidden', !show);
}
