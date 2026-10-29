// DOM UI: HUD, title, "how it was made", pause, verdict. Keys, pad and pointer all drive the menus.
BT.UI = {
  $: (id) => document.getElementById(id),
  last: {}, navT: 0, hintT: 0,

  loading(p) { const b = this.$("loadbar"); if (b) b.style.width = Math.round(p * 100) + "%"; },

  show(id) {
    ["title", "made", "pause", "over"].forEach((x) => this.$(x).classList.toggle("on", x === id));
    document.body.classList.toggle("inmenu", !!id);
    if (id !== "pause") this.focusFirst();
    this.sync();
  },

  // body classes from the one source of truth, so a paused run never leaves live touch buttons on screen
  sync() {
    const S = BT.State;
    document.body.classList.toggle("playing", S.status === "playing");
    document.body.classList.toggle("paused", S.status === "paused");
    document.body.classList.toggle("onhud", S.status === "playing" || S.status === "paused");
  },

  showMenu() {
    BT.State.status = "menu"; BT.State.practice = false;
    this.$("loading").classList.add("gone");
    this.$("best").textContent = BT.State.best ? "BEST " + BT.State.best.toLocaleString() : "";
    this.hideHint();
    this.updateDiff();
    this.show("title");
  },

  hideHint() { document.body.classList.remove("hintshow"); clearTimeout(this.hintT); },

  start(wave) {
    const S = BT.State, g = BT.game;
    if (S.status === "playing") return;
    if (!g || !BT.ready) { this.pending = wave || 1; return; }   // pressed during the load: run starts as soon as it is up
    if (g.sound.context && g.sound.context.state === "suspended") g.sound.context.resume();
    this.show(null);
    g.scene.getScene("play").begin(wave || 1);
    this.sync();
    document.body.classList.add("hintshow");
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => document.body.classList.remove("hintshow"), 9000);
  },

  togglePause() {
    const S = BT.State;
    if (S.status === "playing") {
      S.status = "paused"; this.hideHint();
      if (BT.Audio.music) BT.Audio.music.pause();
    } else if (S.status === "paused") {
      S.status = "playing";
      if (BT.Audio.music) BT.Audio.music.resume();
    }
    this.show(S.status === "paused" ? "pause" : null);
  },

  // the tab lost focus or went hidden mid-run: freeze the fight, never let it play on
  autoPause() { if (BT.State.status === "playing") this.togglePause(); },

  quit() {
    BT.State.status = "menu"; BT.State.practice = false;
    if (BT.Audio.music) BT.Audio.music.stop();
    this.hideHint();
    this.showMenu();
  },

  setDiff(k) {
    if (!BT.DIFF[k]) return;
    BT.State.diff = k; BT.store.set("diff", k);
    this.updateDiff();
  },

  updateDiff() {
    const D = BT.D(), wrap = this.$("diff");
    if (wrap) wrap.querySelectorAll("[data-diff]").forEach((b) => b.classList.toggle("sel", b.dataset.diff === BT.State.diff));
    const note = this.$("diffnote");
    if (note) note.textContent = D.name + " · " + D.note;
  },

  showOver(won) {
    const S = BT.State, m = Math.floor(S.time / 60), s = Math.floor(S.time % 60);
    this.$("overtitle").textContent = won ? "VICTORY" : "FALLEN";
    this.$("overtitle").className = won ? "won" : "lost";
    this.$("oversub").textContent = won ? "The Bone King is dust. The graveyard sleeps." : `The tide took you on wave ${S.wave}.`;
    const best = S.practice
      ? `<br><span class="againhint">practice run — the best stays ${S.best.toLocaleString()}</span>`
      : S.score >= S.best && S.score > 0 ? `<br><span class="newbest">NEW BEST</span>` : `<br>best ${S.best.toLocaleString()}`;
    this.$("overstats").innerHTML = `<b>${S.score.toLocaleString()}</b> score · ${S.kills} bones broken · ${m}:${String(s).padStart(2, "0")}` +
      best + `<br><span class="againhint">ENTER or PLAY AGAIN to run it back</span>`;
    const rb = this.$("retry");
    if (rb) {   // a checkpoint for the wave you died on — practice, no best score
      const can = !won && S.wave > 1;
      rb.style.display = can ? "" : "none";
      rb.textContent = "RETRY WAVE " + S.wave;
    }
    this.hideHint();
    this.show("over");
  },

  banner(big, small) {
    const b = this.$("banner");
    b.innerHTML = `<div>${big}</div>${small ? `<small>${small}</small>` : ""}`;
    b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
  },

  flashHurt() { const f = this.$("hurt"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); },

  hud() {
    const S = BT.State, L = this.last;
    const set = (k, v, fn) => { if (L[k] !== v) { L[k] = v; fn(v); } };
    set("hp", Math.round(S.hp), (v) => { this.$("hpfill").style.width = v + "%"; this.$("hptext").textContent = v; });
    set("rage", Math.round(S.rage), (v) => {
      this.$("ragefill").style.width = v + "%";
      document.body.classList.toggle("spinready", v >= 100);
    });
    set("score", S.score, (v) => { this.$("score").textContent = v.toLocaleString(); });
    set("wave", S.wave, (v) => { this.$("wave").textContent = v ? `WAVE ${v}/${BT.WAVES.length}` : ""; });
    const mult = Math.min(4, 1 + Math.floor(S.combo / 5) * 0.5);
    set("combo", S.combo >= 3 ? `${S.combo} CHAIN${mult > 1 ? " · x" + mult : ""}` : "", (v) => { this.$("combo").textContent = v; });
    const bossOn = S.bossHp > 0 && S.status === "playing";
    set("boss", bossOn ? Math.round(S.bossHp / S.bossMax * 100) : -1, (v) => {
      this.$("boss").classList.toggle("on", v >= 0); if (v >= 0) this.$("bossfill").style.width = v + "%";
    });
    set("inplay", S.status === "playing", (v) => document.body.classList.toggle("playing", v));
    const sc = BT.game && BT.game.scene && BT.game.scene.getScene("play");
    const hero = sc && sc.hero;
    set("dashcd", !!(hero && hero.dashCd > 0.05), (v) => document.body.classList.toggle("dashcool", v));
    set("onhud", S.status === "playing" || S.status === "paused", (v) => document.body.classList.toggle("onhud", v));
    set("paused", S.status === "paused", (v) => document.body.classList.toggle("paused", v));
  },

  // --- keyboard menus: arrows move focus, Enter / Space presses the focused button, Esc backs out ----
  keyMenu(ev) {
    const S = BT.State, code = ev.code;
    const shown = (id) => this.$(id).classList.contains("on");
    const wantStart = code === "Enter" || code === "NumpadEnter" || code === "Space";
    // the title is not painted yet (still loading, or the scene is one frame behind): hold the start, do not swallow it
    if (wantStart && (!BT.ready || S.status === "boot" || (S.status === "menu" && !shown("title") && !shown("made")))) {
      ev.preventDefault(); this.pending = this.pending || 1; return;
    }
    if (!shown("title") && !shown("made") && !shown("pause") && !shown("over")) return;   // in play: no menu keys
    const list = this.buttons();
    const nav = { ArrowDown: 1, KeyS: 1, ArrowUp: -1, KeyW: -1, ArrowRight: 1, KeyD: 1, ArrowLeft: -1, KeyA: -1 };
    if (nav[code] !== undefined && list.length) {
      ev.preventDefault();
      let i = list.indexOf(document.activeElement); if (i < 0) i = 0;
      i = (i + nav[code] + list.length) % list.length;
      list[i].focus({ preventScroll: true }); return;
    }
    if (code === "Enter" || code === "NumpadEnter" || code === "Space") {
      ev.preventDefault();
      const f = document.activeElement;
      if (f && f.tagName === "BUTTON" && list.indexOf(f) >= 0) { f.click(); return; }   // PLAY, RESUME, PLAY AGAIN…
      if (S.status === "menu" && shown("title")) { this.start(); return; }
      if (S.status === "paused") { this.togglePause(); return; }
      if (S.status === "menu" && shown("made")) { this.show("title"); return; }
      if (S.status === "won" || S.status === "lost") { this.start(); return; }
    }
    if (code === "Escape" || code === "KeyP") {
      if (S.status === "menu" && shown("made")) { ev.preventDefault(); this.show("title"); return; }
    }
    if (code === "KeyR" && (S.status === "won" || S.status === "lost")) this.start();
  },

  // --- controller menus: D-pad / stick moves focus, A presses, B backs out --------------
  buttons() { return Array.from(document.querySelectorAll(".panel.on button")).filter((b) => b.offsetParent !== null); },
  focusFirst() { const b = this.buttons()[0]; if (b) b.focus({ preventScroll: true }); },
  padMenu(pr, p) {
    const list = this.buttons(); if (!list.length || !pr) return;
    let i = list.indexOf(document.activeElement); if (i < 0) i = 0;
    const now = performance.now(), ax = (p && p.x) || 0, ay = (p && p.y) || 0;
    const cool = now - this.navT > 280;
    let move = 0;
    if (pr[12] || (ay < -0.6 && cool)) move = -1;
    else if (pr[13] || (ay > 0.6 && cool)) move = 1;
    else if (pr[14] || (ax < -0.6 && cool)) move = -1;
    else if (pr[15] || (ax > 0.6 && cool)) move = 1;
    if (move) {
      i = (i + move + list.length) % list.length;
      this.navT = now;
      if (list[i]) list[i].focus({ preventScroll: true });
    }
    const S = BT.State;
    // B = back / secondary: leave the made panel, leave pause
    if (pr[1]) {
      if (S.status === "menu" && this.$("made").classList.contains("on")) { this.show("title"); return; }
      if (S.status === "paused") { this.togglePause(); return; }
    }
    // Start = confirm in menus too (the loop owns Start while playing/paused)
    if (pr[9] && S.status === "menu" && this.$("title").classList.contains("on")) { this.start(); return; }
    if (pr[9] && (S.status === "won" || S.status === "lost")) { this.start(); return; }
    if (pr[0]) (list[i] || list[0]).click();
  },

  init() {
    this.$("play").onclick = () => this.start(1);
    this.$("howbtn").onclick = () => this.show("made");
    this.$("madeback").onclick = () => this.show("title");
    this.$("resume").onclick = () => this.togglePause();
    this.$("quit").onclick = () => this.quit();
    this.$("again").onclick = () => this.start(1);
    this.$("retry").onclick = () => this.start(BT.State.wave);
    this.$("menu").onclick = () => this.showMenu();
    document.querySelectorAll("[data-diff]").forEach((b) => { b.onclick = () => this.setDiff(b.dataset.diff); });
    this.$("pausebtn").addEventListener("pointerdown", (e) => { e.preventDefault(); this.togglePause(); });
    if (matchMedia("(pointer: coarse)").matches) document.body.classList.add("touch");
    // realtime game: a hidden tab or a lost window never keeps playing
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.autoPause(); });
    addEventListener("blur", () => this.autoPause());
    // iOS: unlock audio inside the first real gesture
    const unlock = () => {
      const g = BT.game;
      if (g && g.sound && g.sound.context && g.sound.context.state === "suspended") g.sound.context.resume();
      BT.Audio && BT.Audio.unlock && BT.Audio.unlock();
    };
    ["pointerdown", "touchend"].forEach((n) => addEventListener(n, unlock, { passive: true }));

    // The title is painted from the first frame; the graveyard loads behind it. PLAY pressed during the
    // load is queued (BT.UI.pending) and starts the run the moment the scene is up — no dead screen.
    const d = BT.store.get("diff", "tide");
    BT.State.diff = BT.DIFF[d] ? d : "tide";
    const b = BT.store.get("best", 0);
    this.$("best").textContent = b ? "BEST " + b.toLocaleString() : "";
    this.updateDiff();
    this.$("loading").classList.add("gone");
    BT.State.status = "menu";
    this.show("title");
    // a pad pressed while the graveyard loads still starts the run (the scene loop is not running yet)
    const padWait = () => {
      if (BT.ready) return;
      if (BT.Input && BT.Input.pad) {
        const p = BT.Input.pad();
        if (p.press[0] || p.press[9]) this.pending = this.pending || 1;
      }
      requestAnimationFrame(padWait);
    };
    requestAnimationFrame(padWait);
  }
};
