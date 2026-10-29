// Actors: the barbarian and three kinds of risen dead. Positions are feet on the ground; depth = y.
BT.Actors = {
  // play verb (chop, walk, …) facing dir; one-direction sheets (rise, death) always face S
  anim(a, verb, dir, cfg) {
    const [sheet, clip, loop] = BT.CLIPS[a.kind === "hero" ? "hero" : a.kind][verb];
    const meta = (this.scene.textures.get(sheet).customData || {}).meta;
    const key = `${sheet}:${clip}_${meta && meta.dirs.length > 1 ? dir : "S"}`;
    if (!this.scene.anims.exists(key)) return;   // sheet missing: keep the last pose rather than crash
    if (a.spr.anims.currentAnim && a.spr.anims.currentAnim.key === key && a.spr.anims.isPlaying && loop) return;
    const sc = BT.scale[sheet];   // split sheets share one camera but not always one cell size
    a.spr.setScale(sc.s * (a.mult || 1)).setOrigin(sc.px, sc.py);
    a.spr.play(Object.assign({ key, repeat: loop ? -1 : 0 }, cfg || {}));
    a.verb = verb;
  },

  hero(scene, x, y) {
    this.scene = scene;
    const h = { kind: "hero", x, y, r: 24, dir: "S", state: "idle", t: 0, dashCd: 0, inv: 0, mvx: 0, mvy: 0, queued: false };
    h.shadow = scene.add.image(x, y, "shadow").setScale(1.4, 1.1).setDepth(2);
    h.light = scene.add.image(x, y, "glow").setTint(0xffc890).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2).setScale(3.4, 2.4).setDepth(3);
    h.spr = BT.World.sprite(scene, "barb_move", x, y);
    this.anim(h, "idle", "S");
    return h;
  },

  enemy(scene, kind, x, y) {
    const C = BT.CFG[kind], mult = C.scale || 1;
    const sheet = BT.CLIPS[kind].walk[0];
    const e = { kind, mult, x, y, r: C.r, hp: C.hp, max: C.hp, dir: "S", state: "rise", t: 0, cd: 1 + Math.random(),
                speed: C.speed[0] + Math.random() * (C.speed[1] - C.speed[0]), kx: 0, ky: 0, flash: 0 };
    e.shadow = scene.add.image(x, y, "shadow").setScale(1.2 * mult, 0.9 * mult).setDepth(2).setAlpha(0);
    e.spr = BT.World.sprite(scene, sheet, x, y, mult);
    if (kind === "minion") {
      this.anim(e, "rise", "S", { frameRate: 26 });
      e.spr.once("animationcomplete", () => { e.state = "walk"; });
      scene.time.delayedCall(3000, () => { if (e.state === "rise") e.state = "walk"; });
      BT.Audio.sfx("rise", 0.5);
    } else {   // mages blink in, the warrior steps out of the crypt
      e.spr.setAlpha(0);
      scene.tweens.add({ targets: e.spr, alpha: 1, duration: 600, onComplete: () => { e.state = "walk"; } });
      this.anim(e, kind === "warrior" ? "taunt" : "walk", "S");
      const g = scene.add.image(x, y - 40, "glow").setTint(kind === "warrior" ? 0xff3030 : 0x9b5bff)
        .setBlendMode(Phaser.BlendModes.ADD).setScale(kind === "warrior" ? 4 : 2).setDepth(5001);
      scene.tweens.add({ targets: g, alpha: 0, scale: 0.5, duration: 700, onComplete: () => g.destroy() });
    }
    return e;
  },

  updateHero(scene, h, inp, dt) {
    const H = BT.CFG.hero, D = BT.D();
    h.dashCd -= dt; h.inv -= dt;
    if (h.state === "dead") return;
    const p = h.spr.anims.getProgress ? h.spr.anims.getProgress() : 1;
    let mv = Math.hypot(inp.mx, inp.my) > 0.18 ? 1 : 0;
    if (mv) { h.mvx = inp.mx; h.mvy = inp.my; }

    if (inp.dash && h.dashCd <= 0 && h.state !== "dodge") {
      const dx = mv ? inp.mx : inp.aim ? inp.aim.x : Math.cos(this.dirAngle(h.dir));
      const dy = mv ? inp.my : inp.aim ? inp.aim.y : Math.sin(this.dirAngle(h.dir));
      const l = Math.hypot(dx, dy) || 1;
      h.dashX = dx / l; h.dashY = dy / l; h.dir = BT.dirOf(dx, dy);
      h.state = "dodge"; h.t = H.dashTime; h.inv = D.iframes; h.dashCd = D.dashCd;
      BT.State.dashes++;
      this.anim(h, "dodge", h.dir, { frameRate: 30 }); BT.Audio.sfx("dodge", 0.6); scene.fx.dust(h.x, h.y);
    } else if (inp.spin && BT.State.rage >= 100 && h.state !== "spin") {
      h.state = "spin"; h.tick = 0; BT.State.rage = 0;
      BT.State.spins++;
      this.anim(h, "spin", h.dir, { frameRate: H.spinFps }); BT.Audio.sfx("spin", 0.9); BT.Input.rumble(240, 0.7, 0.6);
    } else if (inp.attack) {
      if (h.state === "chop" && p > 0.4) h.queued = true;
      else if (h.state === "idle" || h.state === "run") this.startChop(scene, h, mv, inp);
    }

    if (h.state === "dodge") {
      h.t -= dt; this.move(h, h.dashX * H.dashSpeed * dt, h.dashY * H.dashSpeed * dt);
      if (h.t <= 0) h.state = "idle";
    } else if (h.state === "chop") {
      if (!h.hitDone && p >= 0.42) { h.hitDone = true; scene.combat.chop(h); }
      if (mv) this.move(h, inp.mx * H.speed * 0.2 * dt, inp.my * H.speed * 0.2 * dt);
      if (!h.spr.anims.isPlaying) { h.state = "idle"; if (h.queued) { h.queued = false; this.startChop(scene, h, mv, inp); } }
    } else if (h.state === "spin") {
      h.tick -= dt;
      if (h.tick <= 0) { h.tick = H.spinTick; scene.combat.spin(h); }
      if (mv) this.move(h, inp.mx * H.speed * H.spinSpeed * dt, inp.my * H.speed * H.spinSpeed * dt);
      if (!h.spr.anims.isPlaying) h.state = "idle";
    } else if (mv) {
      h.state = "run"; h.dir = BT.dirOf(inp.mx, inp.my);
      const l = Math.min(1, Math.hypot(inp.mx, inp.my));
      this.move(h, inp.mx / Math.hypot(inp.mx, inp.my) * H.speed * l * dt, inp.my / Math.hypot(inp.mx, inp.my) * H.speed * l * dt);
      this.anim(h, "run", h.dir);
    } else {
      h.state = "idle"; this.anim(h, "idle", h.dir);
    }
    h.spr.setAlpha(h.inv > 0 && h.state !== "dodge" ? (Math.floor(h.inv * 20) % 2 ? 0.45 : 1) : 1);
  },

  startChop(scene, h, moving, inp) {
    // Pointer aim wins whether the hero walks or stands: the ring shows where the axe lands, so it must.
    const aim = inp && inp.aim;
    if (aim && aim.dir) h.dir = aim.dir;
    else if (!moving) {   // touch / pad: nearest skeleton in reach
      const t = scene.nearestEnemy(h.x, h.y, 280);
      if (t) h.dir = BT.dirOf(t.x - h.x, t.y - h.y);
    }
    h.state = "chop"; h.hitDone = false;
    BT.State.chops++;
    const a = this.dirAngle(h.dir);
    BT.State.chopDirX = Math.cos(a); BT.State.chopDirY = Math.sin(a);
    this.anim(h, "chop", h.dir, { frameRate: BT.CFG.hero.chopFps });
    BT.Audio.sfx("swing", 0.7);
  },

  dirAngle(d) { return BT.DIRS.indexOf(d) * Math.PI / 4; },

  move(a, dx, dy) { a.x += dx; a.y += dy; },

  updateEnemy(scene, e, h, dt) {
    const C = BT.CFG[e.kind];
    e.cd -= dt; e.flash -= dt;
    if (e.flash <= 0 && e.spr.isTinted) e.spr.clearTint();
    if (e.state === "dead" || e.state === "rise") return;
    e.x += e.kx * dt; e.y += e.ky * dt; e.kx *= Math.pow(0.002, dt); e.ky *= Math.pow(0.002, dt);
    const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) || 1;
    const p = e.spr.anims.getProgress ? e.spr.anims.getProgress() : 1;
    if (e.state === "attack") {
      if (!e.hitDone && p >= (e.kind === "mage" ? 0.6 : 0.5)) {
        e.hitDone = true;
        if (e.kind === "mage") scene.combat.bolt(e, h);
        else if (e.kind === "minion" && d < C.reach + 26) scene.combat.hurtHero(C.dmg, e);
      }
      if (!e.spr.anims.isPlaying) { e.state = "walk"; e.cd = C.cd || C.castCd; }
      return;
    }
    if (e.state === "slam") { e.t -= dt; if (e.t <= 0) scene.combat.slam(e); return; }
    if (h.state === "dead") { this.anim(e, "walk", e.dir); return; }
    e.dir = BT.dirOf(dx, dy);
    let want = 1;
    if (e.kind === "mage") want = d > C.keep + 60 ? 1 : d < C.keep - 60 ? -0.7 : 0;
    if (e.kind === "minion" && d < C.reach && e.cd <= 0) {
      e.state = "attack"; e.hitDone = false; this.anim(e, "attack", e.dir, { frameRate: 16 }); return;
    }
    if (e.kind === "mage" && e.cd <= 0 && d < 560) {
      e.state = "attack"; e.hitDone = false; this.anim(e, "attack", e.dir, { frameRate: 16 }); return;
    }
    if (e.kind === "warrior" && d < C.reach + 30 && e.cd <= 0) { scene.combat.telegraph(e, h); return; }
    if (e.kind === "minion" && d < C.reach * 0.8) want = 0;
    e.x += dx / d * e.speed * want * dt; e.y += dy / d * e.speed * want * dt;
    this.anim(e, "walk", e.dir, { frameRate: e.kind === "warrior" ? 9 : 12 });
  }
};
