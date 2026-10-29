// Play scene: owns the loop. Menu = the same graveyard behind the title; PLAY starts the waves.
BT.Audio = {
  music: null,
  unlock() { const g = BT.game; if (g && g.sound && g.sound.context && g.sound.context.state === "suspended") g.sound.context.resume(); },
  sfx(k, v) { const g = BT.game; if (g && g.sound && !g.sound.locked) g.sound.play(k, { volume: (v || 1) * 0.8 }); },
  song(k, loop) {
    const g = BT.game; if (!g) return;
    if (this.music) this.music.stop();
    this.music = g.sound.add(k, { loop: !!loop, volume: loop ? 0.5 : 0.75 });
    this.music.play();
  }
};

BT.Waves = class {
  constructor(s) { this.s = s; this.queue = []; this.t = 0; this.boss = null; this.phase = 0; }
  start(n) {
    const W = BT.WAVES[n - 1], S = BT.State, D = BT.D();
    S.wave = n; this.queue = []; this.gap = W.gap * D.gap; this.t = 2.2;
    if (n > 1 && S.hp < BT.CFG.hero.hp) {   // catch your breath between waves
      S.hp = Math.min(BT.CFG.hero.hp, S.hp + D.regen);
      this.s.combat.popup(this.s.hero.x, this.s.hero.y - 110, "+" + D.regen + " HP", "#ff7a7a");
    }
    const nm = Math.max(1, Math.round(W.minion * D.count)), ng = Math.round(W.mage * D.count);
    for (let i = 0; i < nm; i++) this.queue.push("minion");
    for (let i = 0; i < ng; i++) this.queue.splice(Math.floor(this.queue.length * (0.3 + 0.7 * Math.random())), 0, "mage");
    if (W.boss) { this.queue.unshift("warrior"); BT.Audio.song("boss", true); }
    BT.Audio.sfx("bell", 0.9);
    BT.UI.banner(W.boss ? "THE BONE KING" : "WAVE " + n, W.boss ? "Wave 5 · he rises from the crypt" : n === 1 ? "Survive the tide" : "");
  }
  update(dt) {
    const S = BT.State;
    if (this.queue.length) {
      this.t -= dt;
      if (this.t <= 0) { this.t = this.gap; this.s.spawn(this.queue.shift()); }
    } else if (!this.s.enemies.some((e) => e.state !== "dead") && !this.waiting) {
      if (S.wave >= BT.WAVES.length) return;
      this.waiting = true;
      this.s.time.delayedCall(1600, () => { this.waiting = false; if (S.status === "playing") this.start(S.wave + 1); });
    }
  }
  bossPhase(e) {   // at 75 / 50 / 25 % the Bone King calls for help
    const step = Math.floor((1 - e.hp / e.max) * 4);
    if (step > this.phase && step < 4) {
      this.phase = step; BT.Audio.sfx("roar", 0.9); this.s.cameras.main.shake(300, 0.01);
      for (let i = 0; i < 3 + step; i++) this.queue.push(i === 0 && step > 1 ? "mage" : "minion");
      this.t = 0.4; this.gap = 0.45;
    }
  }
  bossDown() {   // the King falls: every risen skeleton collapses with him
    this.queue = [];
    this.s.enemies.forEach((x, i) => { if (x.state !== "dead") this.s.time.delayedCall(250 + i * 90, () => { if (x.state !== "dead") this.s.combat.kill(x, true); }); });
    this.s.time.delayedCall(2200, () => this.s.finish(true));
  }
};

BT.PlayScene = class extends Phaser.Scene {
  constructor() { super("play"); }

  create() {
    BT.game = this.game;
    this.enemies = []; this.bolts = []; this.items = []; this.hitstop = 0;
    BT.World.build(this);
    this.combat = new BT.Combat(this);
    this.waves = new BT.Waves(this);
    this.hero = BT.Actors.hero(this, BT.CFG.world.w / 2, 1150);
    // mouse aim reticle (desktop / pen): where the next chop lands
    this.reticle = this.add.image(0, 0, "ring").setScale(0.09, 0.09).setTint(0xffd9a0)
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4).setDepth(8000).setVisible(false);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, BT.CFG.world.w, BT.CFG.world.h).setBackgroundColor("#07080f");
    cam.startFollow(this.hero.spr, true, 0.12, 0.12, 0, 40);
    this.scale.on("resize", () => this.fit());
    this.fit();
    BT.State.best = BT.store.get("best", 0);
    const d = BT.store.get("diff", "tide");
    BT.State.diff = BT.DIFF[d] ? d : "tide";
    BT.State.status = "menu";
    BT.UI.showMenu();
    if (BT.UI.pending) { const w = BT.UI.pending; BT.UI.pending = 0; BT.UI.start(w); }   // an early Enter is not lost
    // a few sleepers in the menu so the title has life
    this.time.addEvent({ delay: 1400, repeat: 3, callback: () => { if (BT.State.status === "menu") this.spawn("minion"); } });
  }

  fit() {
    const w = this.scale.width, h = this.scale.height;
    const z = Phaser.Math.Clamp(Math.min(w, h) / BT.CFG.view, 0.5, 1.6);
    this.cameras.main.setZoom(z);
    BT.World.vignette(this);
    this.vig.setOrigin(0.5).setPosition(w / 2, h / 2).setScale(1 / z);
  }

  begin(startWave) {
    const S = BT.State, n = Math.max(1, Math.min(BT.WAVES.length, Math.round(startWave) || 1));
    this.enemies.forEach((e) => { e.spr.destroy(); e.shadow.destroy(); if (e.ring) e.ring.destroy(); });
    this.bolts.forEach((b) => b.destroy()); this.items.forEach((i) => { i.img.destroy(); i.glow.destroy(); });
    this.enemies = []; this.bolts = []; this.items = [];
    Object.assign(S, { status: "playing", wave: 0, score: 0, kills: 0, combo: 0, comboT: 0, hp: BT.CFG.hero.hp,
                       rage: 0, bossHp: 0, bossMax: 0, time: 0, chops: 0, dashes: 0, spins: 0,
                       practice: n > 1, startWave: n });
    const h = this.hero;
    h.x = BT.CFG.world.w / 2; h.y = 1150; h.state = "idle"; h.inv = 0; h.dashCd = 0; h.spr.setAlpha(1).clearTint();
    this.waves = new BT.Waves(this);
    BT.Audio.song("tide", true);
    this.waves.start(n);
  }

  spawn(kind) {
    let p;
    if (kind === "warrior") p = { x: BT.CFG.world.w / 2, y: 540 };
    else {   // the grave nearest the hero but not on top of him
      const h = this.hero, far = this.spawns.filter((s) => Math.hypot(s.x - h.x, s.y - h.y) > 330);
      far.sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y));
      const pick = far[Math.floor(Math.random() * Math.min(4, far.length))] || this.spawns[0];
      p = { x: pick.x + (Math.random() - 0.5) * 60, y: pick.y + (Math.random() - 0.5) * 30 };
    }
    const e = BT.Actors.enemy(this, kind, p.x, p.y);
    this.enemies.push(e);
    if (kind === "warrior") { BT.State.bossHp = e.hp; BT.State.bossMax = e.max; BT.Audio.sfx("roar", 1); this.cameras.main.shake(500, 0.012); }
    return e;
  }

  nearestEnemy(x, y, r) {
    let best = null, bd = r;
    this.enemies.forEach((e) => { if (e.state === "dead" || e.state === "rise") return;
      const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } });
    return best;
  }

  drop(kind, x, y) {
    const img = this.add.image(x, y - 20, kind).setScale(kind === "soul" ? 0.42 : 0.5).setDepth(y);
    const glow = this.add.image(x, y - 20, "glow").setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.5)
      .setTint({ soul: 0x40e0ff, potion: 0xff3040, rune: 0xff9a30 }[kind]).setDepth(y - 1);
    this.tweens.add({ targets: [img, glow], y: y - 34, duration: 600, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.items.push({ kind, x, y, img, glow, life: 14 });
  }

  pickups(dt) {
    const h = this.hero, S = BT.State, H = BT.CFG.hero;
    if (S.status !== "playing") return;
    this.items = this.items.filter((it) => {
      it.life -= dt;
      const d = Math.hypot(h.x - it.x, h.y - it.y);
      if (it.kind === "soul" && d < 170) { it.x += (h.x - it.x) * 6 * dt; it.y += (h.y - it.y) * 6 * dt; it.img.x = it.glow.x = it.x; }
      if (d < 46 && h.state !== "dead") {
        if (it.kind === "potion") { S.hp = Math.min(H.hp, S.hp + 30); BT.Audio.sfx("potion", 0.8); this.combat.popup(h.x, h.y - 110, "+30 HP", "#ff7a7a"); }
        if (it.kind === "soul") { S.score += 50; S.rage = Math.min(100, S.rage + H.rageSoul); BT.Audio.sfx("soul", 0.6); }
        if (it.kind === "rune") { S.rage = 100; BT.Audio.sfx("soul", 0.9); this.combat.popup(h.x, h.y - 110, "WHIRLWIND READY", "#ffb050"); }
        it.life = 0;
      }
      if (it.life <= 0) { it.img.destroy(); it.glow.destroy(); return false; }
      if (it.life < 3) it.img.setAlpha(Math.floor(it.life * 8) % 2 ? 0.4 : 1);
      return true;
    });
  }

  heroDown() {
    const h = this.hero;
    h.state = "dead"; h.spr.setAlpha(1);
    BT.Actors.anim(h, "death", "S", { frameRate: 16 });
    this.time.delayedCall(1700, () => this.finish(false));
  }

  finish(won) {
    const S = BT.State;
    if (S.status !== "playing") return;
    S.status = won ? "won" : "lost";
    if (won) S.score += Math.max(0, Math.round(S.hp * 20));
    if (!S.practice) { S.best = Math.max(S.best, S.score); BT.store.set("best", S.best); }   // practice runs never touch the best
    BT.Audio.song(won ? "win" : "lose", false);
    BT.UI.showOver(won);
  }
};
