/* ZOMBIE BREACH — the screen layer: HUD, banners, and three focus menus on the shared input layer. */
import { CFG } from './config.js';

const ICONS = {
  arrows: 'keyboard_arrows', mouse: 'mouse_move', lmb: 'mouse_left', shift: 'keyboard_shift',
  esc: 'keyboard_escape', space: 'keyboard_space', ls: 'xbox_stick_l', a: 'xbox_button_a',
  x: 'xbox_button_x', start: 'xbox_button_start', hand: 'touch_hand_open', tap: 'touch_tap'
};

function hint(icon, label) {
  return '<span><img src="prompts/' + (ICONS[icon] || icon) + '.png" alt=""><i>' + label + '</i></span>';
}

export class UI {
  constructor(input, game) {
    this.input = input;
    this.game = game;
    this.menu = null;
    this.el = {};
    this._last = {};
    this._bannerT = 0;
    this._hitT = 0;
    this._hintsDevice = null;
  }

  init() {
    const id = (x) => document.getElementById(x);
    this.el = {
      hud: id('hud'), hpFill: id('hp-fill'), hpNum: id('hp-num'), wave: id('hud-wave'),
      score: id('hud-score'), ammo: id('hud-ammo'), banner: id('banner'), vignette: id('vignette'),
      crosshair: id('crosshair'), menu: id('menu-overlay'), pause: id('pause-overlay'),
      verdict: id('verdict-overlay'), start: id('btn-start'), resume: id('btn-resume'),
      quit: id('btn-quit'), again: id('btn-again'), toMenu: id('btn-menu'),
      hints: id('menu-hints'), best: id('menu-best'), vWave: id('v-wave'), vKills: id('v-kills'),
      vScore: id('v-score'), vBest: id('v-best'), fatal: id('fatal'),
      scorePop: id('score-pop'), moveHint: id('move-hint'),
      chain: id('chain-pill'), chainLabel: id('chain-label'), chainFill: id('chain-fill'), threat: id('threat-strip'),
      warden: id('warden-pill'), wardenLabel: id('warden-label'), wardenFill: id('warden-fill'),
      dmg: id('dmg-pill'), supply: id('supply-pill'),
      lockBtn: id('btn-lock'), goal: id('menu-goal'), vTip: id('v-tip')
    };
    this.input.on('device', (d) => this.hints(d));
    this.input.on('refit', () => this.hints(this.input.device));
    this.hints(this.input.device);
  }

  fatal(msg) {
    if (this.el.fatal) {
      this.el.fatal.style.display = 'block';
      this.el.fatal.textContent = 'ZOMBIE BREACH failed to start: ' + msg;
    }
  }

  /* ---------------- device-aware control hints ---------------- */
  hints(device) {
    if (!this.el.hints || device === this._hintsDevice) return;
    this._hintsDevice = device;
    let html;
    if (device === 'touch') {
      html = hint('hand', 'DRAG LEFT: MOVE') + hint('tap', 'DRAG RIGHT: LOOK') +
        '<span><i>FIRE · JUMP · RELOAD buttons</i></span>';
    } else if (device === 'pad') {
      html = hint('ls', 'MOVE') + '<span><i>RS LOOK</i></span>' + hint('a', 'FIRE') +
        hint('x', 'JUMP') + '<span><i>Y RELOAD</i></span>' + hint('start', 'PAUSE');
    } else {
      html = hint('arrows', 'MOVE') + hint('mouse', 'LOOK') + hint('lmb', 'FIRE') +
        hint('shift', 'JUMP') + '<span><i>R RELOAD</i></span>' +
        '<span><i>Q / E TURN</i></span>' + '<span><i>L LOCK MOUSE</i></span>' + hint('esc', 'PAUSE');
    }
    this.el.hints.innerHTML = html;
    const touch = device === 'touch';
    this.el.moveHint.style.display = touch ? 'block' : 'none';
    this.el.moveHint.classList.toggle('on', touch && document.body.dataset.screen === 'play');
  }

  /* ---------------- screens ---------------- */
  setScreen(s) {
    document.body.dataset.screen = s;
    ['menu', 'pause', 'verdict'].forEach((k) => this.el[k].classList.remove('on'));
    if (s === 'menu') this.el.menu.classList.add('on');
    else if (s === 'paused') this.el.pause.classList.add('on');
    else if (s === 'over') this.el.verdict.classList.add('on');
    if (s !== 'play') this._clearBanner();
    if (this.el.moveHint) this.el.moveHint.classList.toggle('on', s === 'play' && this.input.device === 'touch');
  }

  closeMenus() {
    if (this.menu) { this.menu.close(); this.menu = null; }
  }

  _openMenu(cfg) {
    this.closeMenus();
    this.menu = this.input.menu(cfg);
    this.menu.open(0);
  }

  showMenu(game) {
    this.setScreen('menu');
    this.el.best.textContent = 'BEST ' + game.best + (game.bestWave ? '  ·  WAVE ' + game.bestWave : '');
    if (this.el.goal) {
      this.el.goal.textContent = game.bestWave >= 5
        ? 'THE WARDEN HAS FALLEN. GO DEEPER — HOLLOW POINTS HIT HARDER.'
        : 'SPITTERS FROM WAVE 3 — MOVE WHEN THE GREEN RING SHOWS. THE WARDEN WALKS AT WAVE 5.';
    }
    this._openMenu({
      dom: '#menu-overlay',
      items: [{ id: 'start', el: this.el.start }],
      onPress: () => game.startRun()
    });
  }

  showPause(game) {
    this.setScreen('paused');
    this._openMenu({
      dom: '#pause-overlay',
      items: [{ id: 'resume', el: this.el.resume }, { id: 'quit', el: this.el.quit }],
      onPress: (i) => {
        if (i === 0) game.resumeRun();
        else game.quitToMenu();
      },
      onBack: () => game.resumeRun()
    });
  }

  showVerdict(game) {
    this._clearBanner();
    this._clearHit();
    this.el.vWave.textContent = String(Math.max(1, game.wave));
    this.el.vKills.textContent = String(game.kills);
    this.el.vScore.textContent = String(game.score);
    this.el.vBest.textContent = 'BEST ' + game.best + (game.bestWave ? '  ·  WAVE ' + game.bestWave : '');
    // A reason to press PLAY AGAIN, picked from what the run actually did.
    let tip;
    if (game.kills < 5) tip = 'FIRE ONLY WHILE THE RING IS AMBER — THAT IS A LOCK. TURN, THEN SHOOT.';
    else if (game.chainBest < 2) tip = 'CHAIN KILLS: TWO INSIDE THREE SECONDS PAY MORE, ×3 MAKES THE ROUNDS PIERCE.';
    else if (game.supplyTaken === 0) tip = 'TAKE ONE SUPPLY AFTER EVERY WAVE: MEDKIT, AMMO OR HOLLOW POINTS FOR MORE DAMAGE.';
    else if (game.wave < 5) tip = 'THE WARDEN WALKS AT WAVE 5. RELOAD BEFORE IT ARRIVES.';
    else tip = 'JUMP BEFORE THE SWING LANDS — THE LANDING SHOVES THE PACK OFF YOU.';
    if (this.el.vTip) this.el.vTip.textContent = tip;
    this.setScreen('over');
    this._openMenu({
      dom: '#verdict-overlay',
      items: [{ id: 'again', el: this.el.again }, { id: 'menu', el: this.el.toMenu }],
      onPress: (i) => { if (i === 0) game.startRun(); else game.toMenu(); }
    });
  }

  /* ---------------- HUD ---------------- */
  sync(game) {
    const st = game.state;
    if (st !== 'play') {
      this.el.vignette.style.opacity = '0';
      this.el.crosshair.classList.remove('locked', 'hit', 'head', 'kill');
      return;
    }
    const hp = Math.max(0, Math.round(game.hp));
    const mag = game.mag;
    const ammo = mag + ' / ' + game.reserve;
    const wave = 'WAVE ' + (game.wave || 1) + (game.remaining() ? ' · ' + game.remaining() + ' LEFT' : '');
    const score = 'SCORE ' + game.score;
    const L = this._last;
    if (L.hp !== hp) { L.hp = hp; this.el.hpNum.textContent = String(hp); this.el.hpFill.style.width = (hp / 100 * 100) + '%'; }
    if (L.wave !== wave) { L.wave = wave; this.el.wave.textContent = wave; }
    if (L.score !== score) { L.score = score; this.el.score.textContent = score; }
    if (L.ammo !== ammo) {
      L.ammo = ammo;
      this.el.ammo.textContent = game.reloading ? 'RELOADING' : 'AMMO ' + ammo;
      this.el.ammo.classList.toggle('low', mag <= 3 && !game.reloading);
    }
    this.el.vignette.style.opacity = Math.min(1, game.damageFlash).toFixed(2);

    // kill chain: a visible, draining reason to keep aiming
    const chain = game.chain > 1
      ? '×' + game.chain.toFixed(1) + ' CHAIN' + (game.chain >= CFG.pierceAt ? ' · PIERCE' : '')
      : '';
    if (L.chain !== chain) {
      L.chain = chain;
      this.el.chainLabel.textContent = chain;
      this.el.chain.classList.toggle('on', !!chain);
    }
    if (this.el.chainFill) {
      this.el.chainFill.style.width = Math.max(0, Math.min(100, (game.chainT / CFG.chainWindow) * 100)) + '%';
    }

    // threats off the crosshair: the camera cannot show what is behind you
    const th = game.threatInfo();
    const sig = th.left + '/' + th.right + '/' + th.behind;
    if (L.threat !== sig) {
      L.threat = sig;
      const el = this.el.threat;
      const bits = [];
      if (th.left) bits.push('◀ ' + th.left);
      if (th.behind) bits.push(th.behind + ' BEHIND');
      if (th.right) bits.push(th.right + ' ▶');
      el.textContent = bits.join('  ·  ');
      el.classList.toggle('on', bits.length > 0);
      el.classList.toggle('behind', th.behind > 0);
    }

    // the Warden's health, only while it walks
    const w = game.zombies.find ? game.zombies.find(function (z) { return z.type === 'warden' && z.state !== 'dying'; }) : null;
    const wsig = w ? w.hp + '/' + w.maxHp : '';
    if (L.warden !== wsig) {
      L.warden = wsig;
      this.el.warden.classList.toggle('on', !!w);
      if (w) {
        this.el.wardenLabel.textContent = 'WARDEN ' + Math.max(0, Math.round(w.hp));
        this.el.wardenFill.style.width = Math.max(0, Math.min(100, (w.hp / w.maxHp) * 100)) + '%';
      }
    }

    // HOLLOW POINTS: a permanent damage choice the HUD has to own
    const dmgTxt = game.dmg > 1 ? 'HOLLOW ×' + game.dmg.toFixed(1) : '';
    if (L.dmg !== dmgTxt) {
      L.dmg = dmgTxt;
      if (this.el.dmg) {
        this.el.dmg.textContent = dmgTxt;
        this.el.dmg.classList.toggle('on', !!dmgTxt);
      }
    }

    // the wave-clear choice: three crates wait, you can carry one
    const sup = game.supplies.length;
    const supTxt = sup ? 'TAKE ONE SUPPLY · ' + sup : '';
    if (L.supply !== supTxt) {
      L.supply = supTxt;
      if (this.el.supply) {
        this.el.supply.textContent = supTxt;
        this.el.supply.classList.toggle('on', sup > 0);
      }
    }

    // the auto-aim crosshair turns amber only while it really has a target
    this.el.crosshair.classList.toggle('locked', !!game.aimTarget);

    // JUMP is on a cooldown: dim the thumb button instead of letting a dead press look live
    if (this._jumpBtn === undefined) {
      this._jumpBtn = document.querySelector('#arcade-ui .ai-act[data-act="secondary"]');
    }
    if (this._jumpBtn) this._jumpBtn.classList.toggle('cool', game.jumpCd > 0);
  }

  /* ---------------- transient feedback ---------------- */
  banner(text, sub) {
    this._bannerT = 1500;
    this.el.banner.innerHTML = text + (sub ? '<em>' + sub + '</em>' : '');
    this.el.banner.classList.add('show');
    clearTimeout(this._bannerHide);
    this._bannerHide = setTimeout(() => this.el.banner.classList.remove('show'), this._bannerT);
  }
  _clearBanner() {
    clearTimeout(this._bannerHide);
    this.el.banner.classList.remove('show');
  }
  hit(kind) {
    const c = this.el.crosshair;
    const big = kind === 'kill';
    c.classList.toggle('kill', big);
    c.classList.add('hit');
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => this._clearHit(), big ? 140 : 80);
  }
  scorePop(n) {
    const el = this.el.scorePop;
    if (!el) return;
    el.textContent = '+' + n;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
  _clearHit() {
    clearTimeout(this._hitT);
    this.el.crosshair.classList.remove('hit', 'kill');
  }
}
