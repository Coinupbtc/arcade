// Combat: hits, deaths, drops, bolts, the warrior's slam, and the juice (chips, flashes, shake, popups).
BT.Combat = class {
  constructor(scene) {
    this.s = scene;
    this.chips = scene.add.particles(0, 0, "chip", { speed: { min: 90, max: 260 }, angle: { min: 200, max: 340 },
      gravityY: 520, lifespan: 650, scale: { start: 1.6, end: 0.6 }, rotate: { min: 0, max: 360 }, emitting: false }).setDepth(5500);
    this.embers = scene.add.particles(0, 0, "ember", { speed: { min: 20, max: 90 }, lifespan: 420, scale: { start: 1.2, end: 0 },
      tint: [0xff8a2a, 0xffd060], blendMode: "ADD", emitting: false }).setDepth(5501);
    this.dustP = scene.add.particles(0, 0, "glow", { speed: { min: 20, max: 70 }, lifespan: 500, scale: { start: 0.14, end: 0.38 },
      alpha: { start: 0.3, end: 0 }, tint: 0x6b5a48, emitting: false }).setDepth(3);
    scene.fx = { dust: (x, y) => this.dustP.explode(8, x, y) };
  }

  chop(h) {
    const H = BT.CFG.hero, a = BT.Actors.dirAngle(h.dir);
    const fx = this.s.add.image(h.x + Math.cos(a) * 40, h.y - 34 + Math.sin(a) * 30, "arc").setRotation(a)
      .setScale(0.75, 0.6).setTint(0xffe2b0).setBlendMode(Phaser.BlendModes.ADD).setDepth(5400).setAlpha(0.85);
    this.s.tweens.add({ targets: fx, alpha: 0, scaleX: 0.95, duration: 160, onComplete: () => fx.destroy() });
    let hits = 0;
    this.s.enemies.forEach((e) => {
      if (e.state === "dead" || e.state === "rise") return;
      const dx = e.x - h.x, dy = e.y - h.y, d = Math.hypot(dx, dy);
      if (d > H.chopRange + e.r) return;
      let da = Math.abs(Math.atan2(dy, dx) - a); if (da > Math.PI) da = 2 * Math.PI - da;
      if (d > 40 && da > H.chopArc) return;
      this.damage(e, H.chopDmg, dx / (d || 1), dy / (d || 1)); hits++;
    });
    if (hits) { this.s.hitstop = 0.05; this.s.cameras.main.shake(90, 0.004 + hits * 0.001); BT.Input.rumble(70, 0.25, 0.4); }
  }

  spin(h) {
    const R = BT.CFG.hero.spinRadius;
    const ring = this.s.add.image(h.x, h.y - 20, "ring").setScale(R * 2 / 256, R * 1.3 / 256).setTint(0xffa040)
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35).setDepth(4);
    this.s.tweens.add({ targets: ring, alpha: 0, duration: 140, onComplete: () => ring.destroy() });
    this.s.enemies.forEach((e) => {
      if (e.state === "dead" || e.state === "rise") return;
      const dx = e.x - h.x, dy = e.y - h.y, d = Math.hypot(dx, dy);
      if (d < R + e.r) this.damage(e, 1, dx / (d || 1), dy / (d || 1));
    });
  }

  damage(e, n, nx, ny) {
    e.hp -= n; e.flash = 0.09; e.spr.setTint(0xff7060);
    const push = e.kind === "warrior" ? 0 : 420;
    e.kx = nx * push; e.ky = ny * push;
    this.chips.explode(6, e.x, e.y - 40);
    BT.Audio.sfx("bonehit", 0.55);
    BT.State.rage = Math.min(100, BT.State.rage + BT.CFG.hero.rageHit);
    if (e.kind === "warrior") BT.State.bossHp = Math.max(0, e.hp);
    if (e.hp <= 0) this.kill(e);
    else if (e.kind === "warrior") this.s.waves.bossPhase(e);
  }

  kill(e, quiet) {   // quiet: the graveyard falls asleep after the boss (no score, no drops)
    const S = BT.State;
    e.state = "dead"; e.spr.clearTint(); e.kx = e.ky = 0;
    if (e.ring) { e.ring.destroy(); e.ring = null; }
    if (!quiet && S.status === "playing") {
      S.kills++; S.combo++; S.comboT = BT.CFG.comboWindow;
      const mult = Math.min(4, 1 + Math.floor(S.combo / 5) * 0.5);
      const pts = Math.round(BT.CFG[e.kind].score * mult);
      S.score += pts;
      this.popup(e.x, e.y - 90, "+" + pts + (mult > 1 ? "  x" + mult : ""), mult > 1 ? "#ffcf5a" : "#f4ead6");
    }
    BT.Audio.sfx(e.kind === "warrior" ? "roar" : "bonedeath", quiet ? 0.25 : 0.7);
    this.chips.explode(e.kind === "warrior" ? 40 : 14, e.x, e.y - 30);
    BT.Actors.anim(e, "death", "S", { frameRate: 22 });
    const fade = () => {
      if (e.fading) return; e.fading = true;
      this.s.tweens.add({ targets: [e.spr, e.shadow], alpha: 0, delay: 500, duration: 700,
        onComplete: () => { e.spr.destroy(); e.shadow.destroy(); e.gone = true; } });
    };
    e.spr.once("animationcomplete", fade);
    this.s.time.delayedCall(2500, fade);   // no death clip on this sheet: still clear the body
    if (quiet) return;
    const D = BT.CFG.drop[e.kind];
    if (D) for (const k of ["rune", "potion", "soul"]) if (Math.random() < D[k]) { this.s.drop(k, e.x, e.y); break; }
    if (e.kind === "warrior") { S.bossHp = 0; this.s.cameras.main.shake(600, 0.02); this.s.waves.bossDown(); }
  }

  hurtHero(n, src) {
    const h = this.s.hero, S = BT.State;
    if (h.inv > 0 || h.state === "dead" || S.status !== "playing") return;
    n = Math.max(1, Math.round(n * BT.D().dmg));   // DEEP TIDE hits harder
    S.hp = Math.max(0, S.hp - n); h.inv = 0.6;
    h.spr.setTint(0xff4040); this.s.time.delayedCall(110, () => h.spr.clearTint());
    this.s.cameras.main.shake(140, 0.009);
    BT.Audio.sfx("hurt", 0.8);
    BT.Input.rumble(180, 0.8, 0.5);
    BT.UI.flashHurt();
    S.combo = 0;
    if (S.hp <= 0) this.s.heroDown();
  }

  bolt(e, h) {
    const a = Math.atan2(h.y - 30 - (e.y - 60), h.x - e.x);
    const b = this.s.add.image(e.x, e.y - 60, "glow").setTint(0xff6a1a).setBlendMode(Phaser.BlendModes.ADD).setScale(0.55).setDepth(5450);
    b.vx = Math.cos(a) * BT.CFG.mage.boltSpeed; b.vy = Math.sin(a) * BT.CFG.mage.boltSpeed; b.life = 3;
    this.s.bolts.push(b);
    BT.Audio.sfx("bolt", 0.5);
  }

  updateBolts(dt) {
    const h = this.s.hero;
    this.s.bolts = this.s.bolts.filter((b) => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      this.embers.emitParticleAt(b.x, b.y, 1);
      if (Math.hypot(b.x - h.x, b.y - (h.y - 30)) < 30 && h.inv <= 0 && h.state !== "dead") {
        this.hurtHero(BT.CFG.mage.boltDmg); b.life = 0; this.embers.explode(14, b.x, b.y);
      }
      if (b.life <= 0) { b.destroy(); return false; }
      return true;
    });
  }

  telegraph(e, h) {
    const C = BT.CFG.warrior, a = Math.atan2(h.y - e.y, h.x - e.x);
    e.state = "slam"; e.t = C.telegraph; e.dir = BT.dirOf(h.x - e.x, h.y - e.y);
    e.slamX = e.x + Math.cos(a) * 70; e.slamY = e.y + Math.sin(a) * 50;
    e.ring = this.s.add.image(e.slamX, e.slamY, "ring").setTint(0xff2a2a).setScale(0.2, 0.13).setAlpha(0.8).setDepth(3);
    this.s.tweens.add({ targets: e.ring, scaleX: C.slamR * 2 / 256, scaleY: C.slamR * 1.3 / 256, duration: C.telegraph * 1000 });
    BT.Actors.anim(e, "attack", e.dir, { frameRate: 13 });
  }

  slam(e) {
    const C = BT.CFG.warrior, h = this.s.hero;
    e.state = "walk"; e.cd = C.cd;
    if (e.ring) { e.ring.destroy(); e.ring = null; }
    this.s.cameras.main.shake(260, 0.016);
    this.dustP.explode(26, e.slamX, e.slamY); this.chips.explode(12, e.slamX, e.slamY);
    BT.Audio.sfx("bonehit", 1);
    if (Math.hypot((h.x - e.slamX) / 1, (h.y - e.slamY) / 0.65) < C.slamR) this.hurtHero(C.dmg, e);
  }

  popup(x, y, text, color) {
    const t = this.s.add.text(x, y, text, { fontFamily: "BTTitle, sans-serif", fontSize: "26px", color,
      stroke: "#140c06", strokeThickness: 5 }).setOrigin(0.5).setDepth(7000);
    this.s.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 900, ease: "Cubic.out", onComplete: () => t.destroy() });
  }
};
