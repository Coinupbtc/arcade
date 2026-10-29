import { buildSong, TRACKS } from './pattern.js';
import { Judge, CLEAR_ACC } from './judge.js';
import { Renderer } from './render.js';
import { AudioEngine } from './audio.js';
import { SPEEDS, OFFSETS, approachFor, load as loadSettings, save as saveSettings } from './settings.js';
import { createInput } from './input.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const renderer = new Renderer(canvas);
const audio = new AudioEngine();

const BEST_KEY = 'pulse.best.v1';
const GRADES = { perfect: '#9ff6ff', good: '#c9ffb0', ok: '#ffd98a', miss: '#ff6b8a', combo: '#ffffff', flowlow: '#ff3355', clearlow: '#ff3355' };
const PUBLIC = { menu: 'menu', countdown: 'play', play: 'play', paused: 'paused', results: 'over' };

// How fast the FLOW meter drains per missed note. Harder tracks forgive less:
// the same miss costs more on pressure than on drift, so the pressure tiers
// feel harder even before their density does.
const DRAIN = { drift: 2.0, gentle: 2.3, steady: 2.6, moving: 2.8, pressure: 3.0 };
// Harder tiers also refill less per hit, so the same accuracy holds a drift song
// comfortably and does not hold a pressure song. This is the difficulty curve.
const GAIN_SCALE = { drift: 1.0, gentle: 0.95, steady: 0.85, moving: 0.75, pressure: 0.65 };
const GAIN = { perfect: 5.5, good: 4.0, ok: 1.5 };
const TAIL_GAIN = 12;
const FLOW_START = 100;
// A press that lands on no note costs a little FLOW. That is the rule that makes
// mashing a losing strategy instead of a lucky one: four lanes hammered blindly
// drain faster than the notes refill.
const WASTE_DRAIN = 0.9;
const LEAD_IN = 1.2;      // seconds of countdown before the first beat
const HINT_MS = 4200;     // how long the in-play control hint stays up
// The second way to lose. FLOW is the moment-to-moment stake; ACCURACY is the
// grade's stake. A player who taps plenty and misses most of them used to reach
// the end of every song ("survived but did not clear"), which made a masher look
// brave. Now the run ends once the played accuracy has sat under the clear line
// for FAIL_GRACE seconds — the same line the results card judges, so the screen
// never says one thing and the results another.
const FAIL_GRACE = 2.4;   // seconds under the clear line before the run ends
const FAIL_MIN_NOTES = 24; // judged notes before the line can bite (early noise)

const state = {
  mode: 'menu',           // menu | countdown | play | paused | results
  track: null,
  song: null,
  judge: null,
  heldSrc: [new Set(), new Set(), new Set(), new Set()],
  flashes: [0, 0, 0, 0],
  last: performance.now(),
  lastCount: null,
  flow: FLOW_START,
  shake: 0,
  reason: '',
  outcome: '',
  taps: 0,
  wasted: 0,             // presses that hit no note (they cost FLOW)
  laneTaps: [0, 0, 0, 0],
  lastLane: -1,
  hits: 0,
  menuIndex: 0,
  menuFocus: 0,           // 0..TRACKS-1 = a track row; TRACKS = SPEED; TRACKS+1 = OFFSET
  clearWarned: false,
  underSince: null,       // when played accuracy first dropped under the clear line
  modeBeforePause: null,
  pausedTime: 0,
  hintAt: 0,
  lastGrade: null,
  overlayFocus: 0,        // which button the pad/keyboard has highlighted on pause/results
};

const settings = loadSettings();

// ------------------------------------------------------------------ storage
function bestScores() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch (_) { return {}; }
}

function saveBest(trackId, score, acc, grade, cleared) {
  const all = bestScores();
  const prev = all[trackId];
  const isBest = !prev || score > prev.score;
  const entry = prev ? { ...prev } : { score: 0 };
  if (isBest) { entry.score = score; entry.acc = acc; entry.grade = grade; }
  entry.cleared = !!(cleared || (prev && prev.cleared));
  if (isBest || !prev || cleared) {
    try { all[trackId] = entry; localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (_) { /* private mode */ }
  }
  return { isBest, prev };
}

function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

function selectedTrack() {
  const t = TRACKS[state.menuIndex] || TRACKS[0];
  return t;
}

// ------------------------------------------------------------------ menu
function buildMenu() {
  const wrap = $('tracks');
  wrap.innerHTML = '';
  const best = bestScores();
  const doneLetters = { S: 1, A: 1, B: 1, C: 1 };
  TRACKS.forEach((t, i) => {
    const b = best[t.id];
    const done = !!(b && (b.cleared || doneLetters[b.grade]));
    const btn = document.createElement('button');
    btn.className = 'track' + (i === state.menuIndex ? ' focus' : '');
    btn.dataset.track = t.id;
    btn.dataset.idx = String(i);
    btn.innerHTML = `
      <span class="dot" style="background:${t.colour};color:${t.colour}"></span>
      <span class="name"><b>${t.name}</b><span>${t.blurb}</span></span>
      <span class="tier tier-${t.tier}">${t.tier}</span>
      <span class="best">${b ? 'BEST<b>' + fmt(b.score) + '</b>' + (b.grade ? `<i class="medal-chip g-${b.grade}">${b.grade}</i>` : '') + (done ? '<i class="clear-mark">✓</i>' : '') : 'BEST<b>—</b>'}</span>`;
    // A tap chooses the track. PLAY starts it, so a finger that scrolls the
    // list or catches a row by accident no longer throws the player into a run.
    btn.addEventListener('click', () => { state.menuIndex = i; state.menuFocus = i; paintFocus(); });
    wrap.appendChild(btn);
  });
  $('menu-count').textContent = `${TRACKS.length} tracks · ${TRACKS[0].tier} to ${TRACKS[TRACKS.length - 1].tier}`;
  paintFocus();
  window.__pulseDirty && window.__pulseDirty();
}

const settingEls = () => [$('btn-speed'), $('btn-offset')];

/** Move the highlight without rebuilding the list (a rebuild would eat the scroll). */
function paintFocus() {
  const rows = document.querySelectorAll('#tracks .track');
  rows.forEach((row, i) => row.classList.toggle('focus', i === state.menuIndex));
  const chips = settingEls();
  chips.forEach((el, i) => el && el.classList.toggle('focus', state.menuFocus === TRACKS.length + i));
  const on = state.menuFocus < TRACKS.length ? rows[state.menuIndex] : chips[state.menuFocus - TRACKS.length];
  if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  paintPlayButton();
}

function paintPlayButton() {
  const t = selectedTrack();
  const btn = $('btn-play');
  if (!btn) return;
  btn.innerHTML = `▶ PLAY <small>${t.name.toUpperCase()}</small>`;
  btn.dataset.track = t.id;
}

const MENU_ROWS = () => TRACKS.length + 2;   // 8 tracks + SPEED + OFFSET

/**
 * Walk the menu: the track rows, then SPEED, then OFFSET, then round again.
 * That is what makes both settings reachable with the keyboard and the pad,
 * not only with a pointer.
 */
function focusMenu(delta) {
  const n = MENU_ROWS();
  state.menuFocus = (state.menuFocus + delta + n) % n;
  if (state.menuFocus < TRACKS.length) state.menuIndex = state.menuFocus;
  paintFocus();
}

function onSettingRow() {
  return state.menuFocus >= TRACKS.length;
}

function bumpSetting(el) {
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

/** Change SPEED or OFFSET by one step. dir=-1 goes backwards. */
function changeSetting(which, dir) {
  if (which === 'speed') {
    const ids = SPEEDS.map((s) => s.id);
    const i = Math.max(0, ids.indexOf(settings.speed));
    settings.speed = ids[(i + dir + ids.length) % ids.length];
    renderer.approach = approachFor(settings.speed);
  } else {
    const i = Math.max(0, OFFSETS.indexOf(settings.offset));
    settings.offset = OFFSETS[(i + dir + OFFSETS.length) % OFFSETS.length];
  }
  saveSettings(settings);
  updateSettingsUI();
  bumpSetting(which === 'speed' ? $('btn-speed') : $('btn-offset'));
}

// ------------------------------------------------------------------ hints
const HINTS = {
  touch: () => `<span class="t-only"><img src="assets/prompts/touch_tap.png" alt="">Tap a lane column</span>
    <span class="t-only"><img src="assets/prompts/touch_tap_hold.png" alt="">Hold the long bars</span>
    <span class="t-only"><b>⏸</b> Pause</span>`,
  keyboard: () => `<span class="k-only"><img src="assets/prompts/keyboard_d.png" alt="D"><img src="assets/prompts/keyboard_f.png" alt="F"><img src="assets/prompts/keyboard_j.png" alt="J"><img src="assets/prompts/keyboard_k.png" alt="K">Lanes (or <b>Arrows</b>)</span>
    <span class="k-only"><img src="assets/prompts/mouse_left.png" alt="">Click a lane</span>
    <span class="k-only"><img src="assets/prompts/keyboard_escape.png" alt="">Pause</span>
    <span class="k-only"><img src="assets/prompts/keyboard_enter.png" alt="">Start</span>
    <span class="k-only"><b>↑↓</b> tracks · <b>◀▶</b> speed / offset</span>`,
  pad: () => `<span><img src="assets/prompts/xbox_button_a.png" alt="A"><img src="assets/prompts/xbox_button_b.png" alt="B"><img src="assets/prompts/xbox_button_x.png" alt="X"><img src="assets/prompts/xbox_button_y.png" alt="Y">Lanes</span>
    <span><img src="assets/prompts/xbox_dpad_all.png" alt="">or D-pad</span>
    <span><img src="assets/prompts/xbox_button_start.png" alt="Start">Pause · A or Start starts · <b>D-pad ◀▶</b> speed</span>`,
};

let lastDevice = null;

function updateHints(device) {
  const el = $('hints');
  if (!el) return;
  const key = device || 'keyboard';
  el.innerHTML = HINTS[key] ? HINTS[key]() : HINTS.keyboard();
  lastDevice = key;
}

function playHint() {
  const el = $('hud-hint');
  if (!el) return;
  const d = input.device;
  if (d === 'touch') el.innerHTML = 'TAP A LANE · HOLD THE LONG BARS';
  else if (d === 'pad') el.innerHTML = '<img src="assets/prompts/xbox_button_a.png" alt=""> A B X Y / D-PAD · HOLD THE LONG BARS';
  else el.innerHTML = '<img src="assets/prompts/keyboard_d.png" alt=""><img src="assets/prompts/keyboard_f.png" alt=""><img src="assets/prompts/keyboard_j.png" alt=""><img src="assets/prompts/keyboard_k.png" alt=""> · HOLD THE LONG BARS';
  el.classList.add('on');
  state.hintAt = performance.now();
}

function tickHint(now) {
  const el = $('hud-hint');
  if (el && el.classList.contains('on') && now - state.hintAt > HINT_MS) el.classList.remove('on');
}

// ------------------------------------------------------------------ start
function startTrack(trackId) {
  const track = TRACKS.find((t) => t.id === trackId) || selectedTrack();
  const song = buildSong(track);
  const idx = TRACKS.findIndex((t) => t.id === track.id);
  if (idx >= 0) { state.menuIndex = idx; state.menuFocus = idx; }

  state.track = track;
  state.song = song;
  state.judge = new Judge(song.notes);
  state.heldSrc = [new Set(), new Set(), new Set(), new Set()];
  state.flashes = [0, 0, 0, 0];
  state.mode = 'countdown';
  state.lastCount = null;
  state.flow = FLOW_START;
  state.shake = 0;
  state.clearWarned = false;
  state.underSince = null;
  state.reason = '';
  state.outcome = '';
  state.taps = 0;
  state.wasted = 0;
  state.laneTaps = [0, 0, 0, 0];
  state.lastLane = -1;
  state.hits = 0;
  state.modeBeforePause = null;
  state.lastGrade = null;

  renderer.setSong(song);
  renderer.approach = approachFor(settings.speed);
  renderer.missLane = [0, 0, 0, 0];
  renderer.particles = [];
  if (track.palette) {
    const root = document.documentElement.style;
    root.setProperty('--l0', track.palette.lanes[0]);
    root.setProperty('--l1', track.palette.lanes[1]);
    root.setProperty('--l2', track.palette.lanes[2]);
    root.setProperty('--l3', track.palette.lanes[3]);
  }
  $('menu').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('results').classList.add('hidden');
  $('hud').classList.remove('hidden');
  const b = bestScores()[track.id];
  $('hud-track').textContent = `${track.name} · ${track.bpm} bpm${b ? ' · best ' + fmt(b.score) : ''}`;
  $('countdown').style.opacity = '1';
  $('judge-text').classList.remove('pop');
  $('flow').classList.remove('low');
  updateHUD();

  // Start on this frame. Audio init must never gate the run: a suspended or
  // starved AudioContext used to leave the countdown frozen at −1.8 s forever.
  // audio.start() runs the chart on the wall clock until the synth is ready,
  // then rebases the synth onto the same position.
  audio.ensure();
  audio.start(song, LEAD_IN);
  state.last = performance.now();
  scheduleFrame();
  playHint();
}

// ------------------------------------------------------------------ loop
let rafActive = false;
function scheduleFrame() {
  if (rafActive) return;
  rafActive = true;
  requestAnimationFrame(frame);
}

function heldLanes() {
  const out = new Set();
  for (let i = 0; i < 4; i++) if (state.heldSrc[i].size) out.add(i);
  return out;
}

function frame(now) {
  rafActive = false;
  const dt = Math.min(0.05, (now - state.last) / 1000);
  state.last = now;
  const time = audio.songTime();
  tickHint(now);

  if (state.mode === 'paused' && state.song) {
    renderer.draw({
      song: state.song, judge: state.judge, time: state.pausedTime, held: new Set(),
      level: 0, flashes: state.flashes, wave: null, shake: 0,
    });
    return; // frozen on purpose; resumeGame() re-arms the loop
  }

  if (state.mode === 'countdown') {
    const n = Math.ceil(-time);
    if (n > 0 && n !== state.lastCount) {
      state.lastCount = n;
      $('countdown').textContent = String(n);
      $('countdown').style.opacity = '0.92';
      audio.click(0.7);
    }
    if (time >= 0) {
      state.mode = 'play';
      $('countdown').textContent = 'GO';
      setTimeout(() => { if (state.mode === 'play') $('countdown').style.opacity = '0'; }, 320);
    }
  }

  if (state.mode === 'play' || state.mode === 'countdown') {
    const held = heldLanes();
    const tick = state.judge.tick(time, held);
    for (const m of tick.misses) onMiss(m.lane);
    for (const tl of tick.tails) {
      if (tl.ok) {
        changeFlow(TAIL_GAIN * scaleFor());
        showJudge('hold');
        renderer.burst(tl.lane, 'perfect');
      } else {
        onMiss(tl.lane);
      }
    }
    for (let i = 0; i < 4; i++) {
      state.flashes[i] = Math.max(0, state.flashes[i] - dt * 4);
      renderer.missLane[i] = Math.max(0, renderer.missLane[i] - dt * 3.4);
    }
    state.shake = Math.max(0, state.shake - dt * 4.2);

    renderer.updateParticles(dt);
    renderer.draw({
      song: state.song,
      judge: state.judge,
      time,
      held,
      level: audio.level(),
      flashes: state.flashes,
      wave: audio.waveform(64),
      shake: state.shake,
      device: input.device,
    });
    updateHUD();
    checkClearLine(now);
    if (state.mode === 'results') return;

    if (state.flow <= 0) { endRun('flow'); return; }
    if (time > state.song.duration + 1.4) endRun('song');
    else scheduleFrame();
    return;
  }

  renderer.updateParticles(dt);
  if (state.song) {
    renderer.draw({
      song: state.song, judge: state.judge, time: state.song.duration + 2,
      held: new Set(), level: 0, flashes: [0, 0, 0, 0], wave: null, shake: 0, device: input.device,
    });
  }
}

// ------------------------------------------------------------------ feedback + flow
function changeFlow(delta) {
  const before = state.flow;
  state.flow = Math.max(0, Math.min(FLOW_START, state.flow + delta));
  if (before > 30 && state.flow <= 30 && state.flow > 0) showJudge('flowlow');
}

function gainFor(grade) {
  return (GAIN[grade] || 0) * scaleFor();
}

function scaleFor() {
  return GAIN_SCALE[state.track && state.track.tier] || 1;
}

function drainFor() {
  return DRAIN[state.track && state.track.tier] || 2.4;
}

function onMiss(lane) {
  changeFlow(-drainFor());
  state.shake = Math.min(1, state.shake + 0.45);
  if (lane >= 0 && lane < 4) {
    state.flashes[lane] = 1;
    renderer.missLane[lane] = 1;
  }
  audio.click(0.35);
  showJudge('miss');
}

const JUDGE_LABEL = { hold: 'HOLD', combo: 'COMBO', flowlow: 'FLOW LOW', clearlow: 'BELOW CLEAR' };

function showJudge(grade, points) {
  const el = $('judge-text');
  const base = JUDGE_LABEL[grade] || String(grade).toUpperCase();
  el.textContent = points ? `${base} +${points}` : base;
  el.style.color = GRADES[grade] || '#fff';
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

/**
 * The clear line is the stake: crossing below it mid-song tells the player at
 * once, in the same text slot as the hit grades, and — after FAIL_GRACE seconds
 * still under it — ends the run. Before this, only FLOW could end a run, so a
 * player who survived the chart at 55% saw "not cleared" on the result card and
 * nothing on the way there: the grade felt like a label, not a loss.
 */
function checkClearLine(now) {
  const j = state.judge;
  if (!j || j.judgedCount < FAIL_MIN_NOTES) return;
  const acc = j.liveAccuracy;
  if (acc < CLEAR_ACC) {
    if (state.underSince === null) {
      state.underSince = now;
      if (!state.clearWarned) {
        state.clearWarned = true;
        showJudge('clearlow');
      }
    } else if (now - state.underSince > FAIL_GRACE * 1000) {
      endRun('accuracy');
    }
  } else {
    state.underSince = null;
    state.clearWarned = false;   // re-arm, so a second dip warns again
  }
}

// ------------------------------------------------------------------ HUD
function updateHUD() {
  const j = state.judge;
  if (!j) return;
  $('hud-score').textContent = fmt(j.score);
  const acc = j.liveAccuracy;
  const accEl = $('hud-acc');
  accEl.textContent = acc.toFixed(1) + '%';
  accEl.style.color = acc >= 92 ? '#57ffa8' : acc >= 75 ? '#c9ffb0' : acc >= 60 ? '#ffd98a' : '#ff6b8a';
  const comboEl = $('hud-combo');
  comboEl.textContent = j.combo >= 10 ? j.combo + '×' : String(j.combo);
  comboEl.style.color = j.combo >= 100 ? '#ffffff' : j.combo >= 50 ? '#ffe98a' : j.combo >= 25 ? '#c9ffb0' : 'var(--ink)';
  comboEl.style.fontSize = j.combo >= 50 ? '24px' : '20px';

  const flowPct = Math.max(0, Math.min(100, state.flow));
  $('flow-fill').style.width = flowPct.toFixed(1) + '%';
  const flowEl = $('flow');
  flowEl.classList.toggle('low', flowPct <= 30);
  flowEl.classList.toggle('hit', j.combo >= 25);

  const t = Math.max(0, audio.songTime());
  const span = Math.max(0.001, state.song.duration - state.song.lead);
  const pct = Math.min(100, ((t - state.song.lead) / span) * 100);
  $('progress-fill').style.width = Math.max(0, pct).toFixed(1) + '%';
}

// ------------------------------------------------------------------ end of a run
function endRun(kind) {
  const j = state.judge;
  if (!j || state.mode === 'results') return;
  const sum = j.summary();
  const played = Math.max(0, Math.min(1, audio.songTime() / Math.max(1, state.song.duration)));
  state.mode = 'results';
  state.outcome = kind;
  audio.stop();
  state.heldSrc = [new Set(), new Set(), new Set(), new Set()];
  state.shake = 0;

  const { isBest, prev } = saveBest(state.track.id, sum.score, sum.accuracy, sum.grade, sum.cleared);
  // The best to beat is the stored one — which, on a first run, is this run.
  const stored = bestScores()[state.track.id];
  const bestNow = Math.max(sum.score, stored ? stored.score : 0);
  const lost = kind === 'flow' || kind === 'accuracy';
  const cleared = !lost && sum.cleared;
  const reachedPct = Math.round(played * 100);

  $('hud').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('countdown').style.opacity = '0';
  $('judge-text').classList.remove('pop');
  $('hud-hint').classList.remove('on');
  $('results').classList.remove('hidden');

  $('res-title').textContent = lost ? 'signal lost' : cleared ? 'cleared' : 'not cleared';
  $('res-title').style.color = lost ? '#ff6b8a' : cleared ? '#9ff6ff' : '#ffd98a';
  $('res-reason').textContent = lost
    ? (kind === 'flow'
      ? `flow hit zero at ${reachedPct}% of ${state.track.name}. Hit notes to keep it up.`
      : `accuracy stayed under the ${CLEAR_ACC}% clear line at ${reachedPct}% of ${state.track.name} — ${sum.accuracy.toFixed(1)}% on the notes played. Press on the beat, not just to press.`)
    : cleared
      ? `${state.track.name} · ${sum.total} notes · grade ${sum.grade} (clear line ${CLEAR_ACC}%)`
      : `accuracy ${sum.accuracy.toFixed(1)}% — under the ${CLEAR_ACC}% clear line. The chart is the same every run, so it is rhythm, not luck.`;

  const medal = $('res-medal');
  medal.textContent = sum.grade;
  medal.className = 'medal g-' + sum.grade;
  $('res-score').textContent = fmt(sum.score);
  $('res-acc').textContent = sum.accuracy.toFixed(1) + '%';
  $('res-combo').textContent = String(sum.bestCombo);
  $('res-best').textContent = fmt(bestNow);

  const parts = [];
  const tailTotal = sum.tails.hit + sum.tails.missed;
  parts.push(`${sum.counts.perfect} perfect · ${sum.counts.good} good · ${sum.counts.ok} ok · ${sum.counts.miss} miss`);
  if (tailTotal) parts.push(`${sum.tails.hit}/${tailTotal} tails held`);
  if (state.wasted) parts.push(`${state.wasted} taps hit no note · they drained FLOW`);
  if (isBest) {
    parts.push(prev ? `new best · +${fmt(sum.score - prev.score)}` : 'first score on this device · now the best to beat');
  } else if (prev) {
    parts.push(`${fmt(prev.score - sum.score)} off the best`);
  }
  $('res-note').textContent = parts.join(' · ');

  // A medal to chase: the next letter up is the reason to press PLAY AGAIN.
  const NEXT_LETTER = { D: 'C at 60%', C: 'B at 75%', B: 'A at 88%', A: 'S at 95%', S: 'a clean run: 100%' };
  $('res-goal').textContent = cleared
    ? `NEXT MEDAL · ${NEXT_LETTER[sum.grade] || 'S at 95%'}`
    : `CLEAR AT ${CLEAR_ACC}% · you were ${(CLEAR_ACC - sum.accuracy).toFixed(1)} points short`;

  const idx = TRACKS.findIndex((t) => t.id === state.track.id);
  const next = TRACKS[(idx + 1) % TRACKS.length];
  $('btn-next').textContent = `NEXT · ${next.name.toUpperCase()}`;
  $('btn-next').dataset.track = next.id;
  state.reason = $('res-reason').textContent;
  state.overlayFocus = 0;
  paintOverlayFocus();
  buildMenu();
}

function toMenu() {
  state.mode = 'menu';
  audio.stop();
  audio.resume();
  state.song = null;
  state.judge = null;
  state.flow = FLOW_START;
  state.heldSrc = [new Set(), new Set(), new Set(), new Set()];
  $('pause').classList.add('hidden');
  $('results').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('hud-hint').classList.remove('on');
  $('menu').classList.remove('hidden');
  $('countdown').style.opacity = '0';
  paintOverlayFocus();
  buildMenu();
}

// ------------------------------------------------------------------ pause
function pauseGame() {
  if (state.mode !== 'play' && state.mode !== 'countdown') return;
  state.modeBeforePause = state.mode;
  state.pausedTime = audio.songTime();
  state.mode = 'paused';
  state.heldSrc = [new Set(), new Set(), new Set(), new Set()];
  state.overlayFocus = 0;
  paintOverlayFocus();
  audio.pause();
  const span = Math.max(0.001, state.song.duration - state.song.lead);
  const pct = Math.max(0, Math.min(100, ((state.pausedTime - state.song.lead) / span) * 100));
  $('pause-note').textContent =
    `${state.track.name} · ${Math.round(pct)}% · ${fmt(state.judge.score)} pts · flow ${Math.round(state.flow)}%`;
  $('pause').classList.remove('hidden');
  renderer.draw({
    song: state.song, judge: state.judge, time: state.pausedTime, held: new Set(),
    level: 0, flashes: state.flashes, wave: null, shake: 0, device: input.device,
  });
}

function resumeGame() {
  if (state.mode !== 'paused') return;
  $('pause').classList.add('hidden');
  state.mode = state.modeBeforePause || 'play';
  state.modeBeforePause = null;
  // A pause is not a failure: the accuracy grace starts again on resume.
  state.underSince = null;
  paintOverlayFocus();
  state.last = performance.now();
  audio.resume();
  scheduleFrame();
}

// ------------------------------------------------------------------ overlay focus
// Pause and results are menus too: the pad and the keyboard must be able to reach
// every button on them, not just resume and play-again.
const PAUSE_BUTTONS = ['btn-resume', 'btn-restart', 'btn-quit2'];
const RESULT_BUTTONS = ['btn-again', 'btn-next', 'btn-menu'];

function overlayButtons() {
  if (state.mode === 'paused') return PAUSE_BUTTONS;
  if (state.mode === 'results') return RESULT_BUTTONS;
  return [];
}

function paintOverlayFocus() {
  const ids = overlayButtons();
  // Clear every overlay button first: a hidden pause screen must not keep the
  // focus ring that the next screen would inherit.
  PAUSE_BUTTONS.concat(RESULT_BUTTONS).forEach((id) => {
    const el = $(id);
    if (el) el.classList.remove('focus');
  });
  ids.forEach((id, i) => {
    const el = $(id);
    if (el) el.classList.toggle('focus', i === state.overlayFocus);
  });
}

function focusOverlay(delta) {
  const ids = overlayButtons();
  if (!ids.length) return;
  state.overlayFocus = (state.overlayFocus + delta + ids.length) % ids.length;
  paintOverlayFocus();
}

function confirmOverlay() {
  const ids = overlayButtons();
  const el = ids.length ? $(ids[Math.min(state.overlayFocus, ids.length - 1)]) : null;
  if (el) el.click();
  else if (state.mode === 'paused') resumeGame();
  else if (state.mode === 'results' && state.track) startTrack(state.track.id);
}

// ------------------------------------------------------------------ lane input

function tapTime() {
  return audio.songTime() - settings.offset / 1000;
}

function laneDown(lane, src) {
  if (state.mode !== 'play' && state.mode !== 'countdown') return;
  state.taps += 1;
  state.laneTaps[lane] += 1;
  state.lastLane = lane;
  state.flashes[lane] = 1;
  audio.unlock();
  if (state.heldSrc[lane].has(src)) return;
  state.heldSrc[lane].add(src);

  const res = state.judge.tap(lane, tapTime());
  audio.click(res ? 1 : 0.4);
  if (!res) {
    // Not every press is a note. Before the song starts the countdown taps are
    // free; once it is running, a blind press is a small drain (see WASTE_DRAIN).
    if (audio.songTime() > 0) {
      state.wasted += 1;
      changeFlow(-WASTE_DRAIN);
      renderer.missLane[lane] = Math.max(renderer.missLane[lane], 0.28);
    }
    return;
  }
  state.hits += 1;
  state.lastGrade = res.grade;
  changeFlow(gainFor(res.grade));
  showJudge(res.grade, res.gained);
  renderer.burst(lane, res.grade);
  const combo = state.judge.combo;
  if (combo === 25 || combo === 50 || combo === 100) showJudge('combo');
}

function laneUp(lane, src) {
  if (!state.heldSrc[lane].delete(src)) return;
  if (state.heldSrc[lane].size) return;
  if (state.mode !== 'play') return;
  const r = state.judge.release(lane, tapTime());
  if (r) onMiss(lane);
}

// ------------------------------------------------------------------ input layer
const input = createInput({
  surface: canvas,
  getMode: () => (state.mode === 'countdown' ? 'play' : state.mode),
  laneDown,
  laneUp,
  menuMove: (d) => {
    if (state.mode === 'menu') focusMenu(d);
    else if (state.mode === 'paused' || state.mode === 'results') focusOverlay(d);
  },
  menuLeft: () => {
    if (state.mode === 'menu') {
      if (onSettingRow()) changeSetting(state.menuFocus === TRACKS.length ? 'speed' : 'offset', -1);
      else focusMenu(-1);
    } else if (state.mode === 'paused' || state.mode === 'results') focusOverlay(-1);
  },
  menuRight: () => {
    if (state.mode === 'menu') {
      if (onSettingRow()) changeSetting(state.menuFocus === TRACKS.length ? 'speed' : 'offset', 1);
      else focusMenu(1);
    } else if (state.mode === 'paused' || state.mode === 'results') focusOverlay(1);
  },
  menuConfirm: () => {
    if (state.mode === 'menu') {
      // Enter / A / Start always means "PLAY the chosen track". Before this, a
      // confirm while the SPEED or OFFSET chip had focus changed the setting and
      // left the player on the menu — Start looked like it did nothing.
      startTrack(selectedTrack().id);
    } else if (state.mode === 'paused' || state.mode === 'results') confirmOverlay();
  },
  menuBack: () => {
    if (state.mode === 'paused' || state.mode === 'results') toMenu();
    else if (state.mode === 'play' || state.mode === 'countdown') pauseGame();
  },
  pauseToggle: () => {
    if (state.mode === 'play' || state.mode === 'countdown') pauseGame();
    else if (state.mode === 'paused') resumeGame();
    else if (state.mode === 'results') toMenu();
  },
  autoPause: () => {
    if (state.mode === 'play' || state.mode === 'countdown') pauseGame();
  },
  refit: () => {
    renderer.resize();
    if (state.mode === 'play' || state.mode === 'countdown') scheduleFrame();
  },
  audioUnlock: () => { audio.ensure(); audio.unlock(); },
  deviceChanged: (dev) => updateHints(dev),
});

// ------------------------------------------------------------------ settings + buttons
function updateSettingsUI() {
  $('btn-speed').innerHTML = `SPEED <b>${settings.speed}</b>`;
  $('btn-offset').innerHTML = `OFFSET <b>${settings.offset > 0 ? '+' : ''}${settings.offset} ms</b>`;
}

$('btn-play').addEventListener('click', () => startTrack($('btn-play').dataset.track || selectedTrack().id));
$('btn-pause').addEventListener('click', () => pauseGame());
$('btn-resume').addEventListener('click', () => resumeGame());
$('btn-restart').addEventListener('click', () => { if (state.track) startTrack(state.track.id); });
$('btn-quit2').addEventListener('click', () => toMenu());
$('btn-again').addEventListener('click', () => { if (state.track) startTrack(state.track.id); });
$('btn-next').addEventListener('click', () => { const id = $('btn-next').dataset.track; if (id) startTrack(id); });
$('btn-menu').addEventListener('click', () => toMenu());

$('btn-speed').addEventListener('click', () => {
  state.menuFocus = TRACKS.length;
  paintFocus();
  changeSetting('speed', 1);
});
$('btn-offset').addEventListener('click', () => {
  state.menuFocus = TRACKS.length + 1;
  paintFocus();
  changeSetting('offset', 1);
});

// ------------------------------------------------------------------ hook
// window.__game is the shelf contract: state maps every screen onto
// menu | play | paused | over, score is a number at all times, and start() is
// exactly the function the PLAY button calls.
function uiRects() {
  const out = [];
  const add = (el, name) => {
    if (!el || el.offsetParent === null) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    out.push({ name, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  };
  add($('btn-play'), 'play');
  add($('btn-pause'), 'pause');
  add($('btn-resume'), 'resume');
  add($('btn-restart'), 'restart');
  add($('btn-quit2'), 'quit');
  add($('btn-again'), 'again');
  add($('btn-next'), 'next');
  add($('btn-menu'), 'menu');
  add($('btn-speed'), 'speed');
  add($('btn-offset'), 'offset');
  document.querySelectorAll('#tracks .track').forEach((b, i) => add(b, 'track' + i));
  return out;
}

function nextNote() {
  if (!state.judge) return null;
  const t = audio.songTime();
  const n = state.judge.notes.find((x) => !x.judged && !x.tailDone && x.t > t - 0.14);
  return n ? { t: n.t, lane: n.lane, dur: n.dur } : null;
}

window.__game = {
  get state() { return PUBLIC[state.mode] || 'menu'; },
  get score() { return state.judge ? state.judge.score : 0; },
  get combo() { return state.judge ? state.judge.combo : 0; },
  get accuracy() { return state.judge ? state.judge.liveAccuracy : 100; },
  get grade() { return state.judge ? state.judge.summary().grade : null; },
  get flow() { return Math.round(state.flow); },
  get taps() { return state.taps; },
  get wasted() { return state.wasted; },
  get laneTaps() { return state.laneTaps.slice(); },
  get lastLane() { return state.lastLane; },
  get lastGrade() { return state.lastGrade; },
  get hits() { return state.hits; },
  get misses() { return state.judge ? state.judge.counts.miss : 0; },
  get track() { return state.track ? state.track.id : null; },
  get notes() { return state.song ? state.song.meta.notes : 0; },
  get judged() { return state.judge ? state.judge.judgedCount : 0; },
  get remaining() { return state.judge ? state.judge.notes.length - state.judge.judgedCount : 0; },
  get index() { return state.menuIndex; },
  get focus() { return state.menuFocus; },
  get settings() { return { speed: settings.speed, offset: settings.offset }; },
  get time() { return audio.songTime(); },
  get duration() { return state.song ? state.song.duration : 0; },
  get reason() { return state.reason; },
  get outcome() { return state.outcome; },
  get cleared() {
    if (!state.judge || state.mode !== 'results') return null;
    // Only a run that reached the end of the chart can be cleared, and only
    // above the clear line. A FLOW or ACCURACY loss is never "cleared".
    return state.outcome === 'song' && state.judge.summary().cleared;
  },
  get underLine() { return state.judge ? state.judge.liveAccuracy < CLEAR_ACC : false; },
  get clearLine() { return CLEAR_ACC; },
  get next() { return nextNote(); },
  get device() { return input.device; },
  get ui() { return uiRects(); },
  start: (id) => { startTrack(id); return true; },
  pause: () => pauseGame(),
  resume: () => resumeGame(),
  menu: () => toMenu(),
};

// Kept for the earlier in-browser proof (test/browse.py reads these).
window.__pulse = {
  mode: () => state.mode,
  songTime: () => audio.songTime(),
  level: () => audio.level(),
  stats: () => (state.judge ? state.judge.summary() : null),
  counts: () => (state.judge ? { ...state.judge.counts } : null),
  lastResult: () => {
    if (!state.judge || !state.judge.results.length) return null;
    const r = state.judge.results[state.judge.results.length - 1];
    return { grade: r.grade, dt: r.dt, lane: r.lane, score: state.judge.score };
  },
  laneX: (lane) => {
    const r = canvas.getBoundingClientRect();
    return r.left + (lane + 0.5) * (r.width / 4);
  },
  hitY: () => canvas.getBoundingClientRect().top + renderer.hitY,
  next: nextNote,
  chart: () => state.song ? {
    track: state.song.track.id,
    notes: state.song.meta.notes,
    holds: state.song.meta.holds,
    duration: state.song.duration,
  } : null,
  chartNotes: () => (state.judge ? state.judge.notes.map((n) => ({ t: n.t, lane: n.lane, dur: n.dur, judged: n.judged })) : []),
  nextAndTime: () => ({ song: audio.songTime(), note: nextNote() }),
  clock: () => ({ song: audio.songTime(), now: performance.now(), wall: Date.now() / 1000 }),
  view: () => {
    const r = canvas.getBoundingClientRect();
    return { w: r.width, hitY: r.top + renderer.hitY };
  },
  settings: () => ({ ...settings }),
  approach: () => renderer.approach,
  palette: () => renderer.palette.slice(),
  paused: () => state.mode === 'paused',
  start: (id) => startTrack(id),
  tracks: () => TRACKS.map((t) => t.id),
  flow: () => state.flow,
};

// ------------------------------------------------------------------ boot
updateSettingsUI();
$('hud-acc-line').textContent = `clear ${CLEAR_ACC}%`;
renderer.approach = approachFor(settings.speed);
updateHints(input.device);
buildMenu();
requestAnimationFrame(frame);


