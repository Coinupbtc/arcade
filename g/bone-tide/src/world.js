// World: moonlit graveyard built from baked props, lantern light, fog, vignette, and the FX helpers combat uses.
BT.LANTERNS = [[-390, 300], [390, 300], [-390, 640], [390, 640]];

BT.World = {
  // sprite from a baked sheet with its feet on (x, y) and y-sorted depth
  sprite(scene, sheet, x, y, mult) {
    const sc = BT.scale[sheet];
    const s = scene.add.sprite(x, y, sheet).setOrigin(sc.px, sc.py).setScale(sc.s * (mult || 1));
    s.setDepth(y);
    return s;
  },

  prop(scene, name, x, y, mult) {
    const s = this.sprite(scene, "p_" + name, x, y, mult);
    s.setFrame("static_S_000");
    if (BT.PROPS[name]) scene.solids.push({ x, y: y - 4, r: BT.PROPS[name] * (mult || 1) });
    if (!BT.PROPS[name] && /floor_|bone|ribcage/.test(name)) s.setDepth(1);   // flat ground decals
    return s;
  },

  build(scene) {
    const W = BT.CFG.world.w, H = BT.CFG.world.h;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    scene.solids = [];
    scene.spawns = [];

    scene.add.tileSprite(0, 0, W, H, "ground").setOrigin(0).setTileScale(0.6).setTint(0xa3a9b9).setDepth(-10);
    // crypt plaza: Poly Haven flagstone
    scene.add.tileSprite(W / 2, 450, 760, 400, "flagstone").setTileScale(0.4).setTint(0x8a8e9c).setAlpha(0.75).setDepth(-9);

    this.prop(scene, "crypt", W / 2, 420, 1.0);   // pivot = front step; the building sits behind it
    scene.solids.push({ x: W / 2, y: 300, r: 140 }, { x: W / 2 - 150, y: 330, r: 95 }, { x: W / 2 + 150, y: 330, r: 95 });
    this.prop(scene, "shrine_candles", W / 2 - 300, 520); this.prop(scene, "shrine_candles", W / 2 + 300, 520);
    BT.LANTERNS.forEach(([dx, dy]) => this.prop(scene, "post_lantern", W / 2 + dx, dy));

    // rows of graves either side of the centre aisle
    const graves = ["grave_A", "grave_B", "gravestone", "grave_A_destroyed", "gravemarker_A"];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) for (const side of [-1, 1]) {
      if (rnd() < 0.22) continue;
      const x = W / 2 + side * (260 + col * 150) + (rnd() - 0.5) * 30, y = 830 + row * 230 + (rnd() - 0.5) * 30;
      this.prop(scene, graves[Math.floor(rnd() * graves.length)], x, y);
      if (rnd() < 0.35) this.prop(scene, rnd() < 0.5 ? "skull_candle" : "candle_triple", x + 40, y + 24);
    }
    // grave dirt = spawn points
    [[360, 520], [W - 360, 520], [240, 1000], [W - 240, 1000], [520, 1450], [W - 520, 1450], [W / 2 - 190, 700], [W / 2 + 190, 700]]
      .forEach(([x, y]) => { this.prop(scene, "floor_dirt_grave", x, y); scene.spawns.push({ x, y: y - 8 }); });

    // trees, coffins, pumpkins, bones round the edges
    const edge = [[120, 220], [W - 140, 260], [90, 760], [W - 90, 700], [140, 1320], [W - 120, 1360], [W / 2 - 700, 1600], [W / 2 + 720, 1620], [700, 160], [W - 700, 140]];
    edge.forEach(([x, y], i) => this.prop(scene, i % 3 ? "tree_dead_medium" : "tree_dead_large", x, y));
    this.prop(scene, "coffin", 760, 1180); this.prop(scene, "coffin", W - 780, 1230);
    for (let i = 0; i < 26; i++) {
      const x = 120 + rnd() * (W - 240), y = 520 + rnd() * (H - 600);
      const n = ["pumpkin_orange_jackolantern", "bone_A", "ribcage", "skull_candle", "bone_A"][i % 5];
      if (Math.abs(x - W / 2) < 120 && y > 800) continue;   // keep the aisle clear
      this.prop(scene, n, x, y);
    }
    // fence along the top and bottom edges
    for (let x = 90; x < W; x += 175) {
      this.prop(scene, x % 3 ? "fence" : "fence_broken", x, 60);
      this.prop(scene, x % 4 ? "fence" : "fence_broken", x, H - 20);
    }

    this.lights(scene);
    this.fog(scene);
  },

  lights(scene) {
    const glow = (x, y, color, size, a) => {
      const g = scene.add.image(x, y, "glow").setTint(color).setBlendMode(Phaser.BlendModes.ADD)
        .setScale(size / 128).setAlpha(a).setDepth(5000);
      scene.tweens.add({ targets: g, alpha: a * 0.7, scale: (size / 128) * 0.93, duration: 140 + Math.random() * 160,
                         yoyo: true, repeat: -1, ease: "Sine.inOut" });
      return g;
    };
    const W = BT.CFG.world.w;
    BT.LANTERNS.forEach(([dx, dy]) => glow(W / 2 + dx, dy - 170, 0xffa040, 260, 0.55));
    glow(W / 2 - 300, 490, 0xffb060, 200, 0.45); glow(W / 2 + 300, 490, 0xffb060, 200, 0.45);
    glow(W / 2, 330, 0x9b7bff, 560, 0.2);   // crypt's cold glow
  },

  fog(scene) {
    scene.fogs = [];
    for (let i = 0; i < 9; i++) {
      const f = scene.add.image(Math.random() * BT.CFG.world.w, 300 + Math.random() * 1300, "glow")
        .setTint(0x8fa4c8).setAlpha(0.10).setScale(6 + Math.random() * 4, 2.2).setDepth(6000);
      f.vx = 8 + Math.random() * 14;
      scene.fogs.push(f);
    }
  },

  // camera-fixed vignette, rebuilt for the real viewport on every resize
  vignette(scene) {
    const w = scene.scale.width, h = scene.scale.height;
    if (scene.textures.exists("vig")) scene.textures.remove("vig");
    const c = scene.textures.createCanvas("vig", w, h), g = c.getContext();
    const r = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    r.addColorStop(0, "rgba(4,6,18,0)"); r.addColorStop(1, "rgba(4,6,18,0.88)");
    g.fillStyle = r; g.fillRect(0, 0, w, h); c.refresh();
    if (scene.vig) scene.vig.destroy();
    scene.vig = scene.add.image(0, 0, "vig").setOrigin(0).setScrollFactor(0).setDepth(9000);
  }
};
