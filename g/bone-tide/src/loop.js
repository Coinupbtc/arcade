// Frame loop for the play scene: input (keys, mouse aim, touch, pad) → hero → dead → push-apart → depth → HUD.
BT.PlayScene.prototype.update = function (time, delta) {
  const S = BT.State, dtRaw = Math.min(delta / 1000, 0.05);
  const inp = BT.Input.read();
  if (inp.pause && (S.status === "playing" || S.status === "paused")) BT.UI.togglePause();
  if (S.status === "paused") { BT.UI.hud(); return; }   // keep the HUD classes honest (body.paused hides touch buttons)
  if (this.hitstop > 0) { this.hitstop -= dtRaw; return; }
  const dt = dtRaw, h = this.hero, W = BT.CFG.world;

  // desktop: the hero faces the cursor; the reticle shows where the axe will land
  const aim = S.status === "playing" ? BT.Input.aimDir(this, h) : null;
  inp.aim = aim;
  if (aim && !Math.hypot(inp.mx, inp.my)) h.dir = aim.dir;
  if (this.reticle) {
    if (aim) {
      const near = this.nearestEnemy(aim.wx, aim.wy, 70);
      this.reticle.setTint(near ? 0xff7a55 : 0xffd9a0).setScale(near ? 0.12 : 0.09)
        .setAlpha(near ? 0.7 : 0.4).setVisible(true).setPosition(aim.wx, aim.wy);
    } else this.reticle.setVisible(false);
  }

  if (S.status === "playing") {
    S.time += dt;
    S.comboT -= dt; if (S.comboT <= 0) S.combo = 0;
    BT.Actors.updateHero(this, h, inp, dt);
    this.waves.update(dt);
  } else if (h.state !== "dead") {
    BT.Actors.updateHero(this, h, { mx: 0, my: 0 }, dt);
  }
  this.enemies.forEach((e) => BT.Actors.updateEnemy(this, e, h, dt));
  this.combat.updateBolts(dt);
  this.pickups(dt);

  // push-apart: skeletons from each other and the hero, everyone out of graves/trees/crypt
  const live = this.enemies.filter((e) => e.state !== "dead");
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d > 0 && d < m) { const k = (m - d) / d / 2; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
    }
    if (h.state !== "dead" && a.state !== "rise") {
      const dx = a.x - h.x, dy = a.y - h.y, d = Math.hypot(dx, dy), m = a.r + h.r;
      if (d > 0 && d < m) { const k = (m - d) / d; if (h.state === "dodge") { a.x += dx * k; a.y += dy * k; } else { a.x += dx * k * 0.7; a.y += dy * k * 0.7; h.x -= dx * k * 0.3; h.y -= dy * k * 0.3; } }
    }
  }
  const solid = (a) => {
    this.solids.forEach((o) => {
      const dx = a.x - o.x, dy = (a.y - o.y) * 1.6, d = Math.hypot(dx, dy), m = o.r + a.r * 0.7;
      if (d > 0 && d < m) { a.x += dx / d * (m - d); a.y += dy / d * (m - d) / 1.6; }
    });
    a.x = Phaser.Math.Clamp(a.x, 60, W.w - 60); a.y = Phaser.Math.Clamp(a.y, 120, W.h - 50);
  };
  solid(h); live.forEach(solid);

  // draw: feet → sprite, depth by y
  const place = (a) => { a.spr.setPosition(a.x, a.y).setDepth(a.y); a.shadow.setPosition(a.x, a.y - 2); };
  place(h); h.light.setPosition(h.x, h.y - 30);
  this.enemies.forEach((e) => { if (!e.gone) { place(e); if (e.state !== "rise") e.shadow.setAlpha(1); } });
  this.enemies = this.enemies.filter((e) => !e.gone);

  this.fogs.forEach((f) => { f.x += f.vx * dt; if (f.x > W.w + 500) f.x = -500; });
  BT.UI.hud();
};
