// Boot: load every generated asset, build animations from the sprite-bake.py JSON, make the small FX textures.
BT.BootScene = class extends Phaser.Scene {
  constructor() { super("boot"); }

  preload() {
    const L = this.load;
    L.on("progress", (p) => BT.UI && BT.UI.loading(p));
    BT.SHEETS.forEach((n) => L.atlas(n, `assets/sprites/${n}.png`, `assets/sprites/${n}.json`));
    Object.keys(BT.PROPS).forEach((n) => L.atlas("p_" + n, `assets/sprites/p_${n}.png`, `assets/sprites/p_${n}.json`));
    BT.ITEMS.forEach((n) => L.image(n, `assets/sprites/${n}.png`));
    L.image("ground", "assets/sprites/ground.png");
    L.image("flagstone", "assets/ui/floor.jpg");
    BT.SFX.forEach((n) => L.audio(n, [`assets/sfx/${n}.ogg`, `assets/sfx/${n}.m4a`]));   // m4a: Safari without Ogg
    BT.MUSIC.forEach((n) => L.audio(n, [`assets/music/${n}.ogg`, `assets/music/${n}.m4a`]));
  }

  create() {
    BT.scale = {};
    const wpp = (key) => {
      const meta = (this.textures.get(key).customData || {}).meta || {};
      return meta.world_per_px || 0.02;
    };
    const refW = wpp(BT.REF_SHEET);
    const keys = BT.SHEETS.concat(Object.keys(BT.PROPS).map((n) => "p_" + n));
    keys.forEach((k) => {
      const tex = this.textures.get(k), data = tex.customData || {};
      const meta = data.meta || {};
      BT.scale[k] = { s: wpp(k) / refW, px: (meta.pivot ? meta.pivot.x : 64) / (meta.cell || 128),
                      py: (meta.pivot ? meta.pivot.y : 100) / (meta.cell || 128) };
      const anims = data.animations || {};
      Object.keys(anims).forEach((a) => {
        const frames = anims[a].frames.map((f) => ({ key: k, frame: f }));
        this.anims.create({ key: `${k}:${a}`, frames, frameRate: anims[a].fps || 12, repeat: 0 });
      });
    });
    this.makeTextures();
    BT.ready = true;
    this.scene.start("play");
  }

  // soft radial glow, bone chip, shadow, ring — drawn once into textures
  makeTextures() {
    const tex = (key, w, h, draw) => {
      const c = this.textures.createCanvas(key, w, h); draw(c.getContext(), w, h); c.refresh();
    };
    tex("glow", 128, 128, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,0.45)");
      r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
    tex("shadow", 64, 32, (g, w, h) => {
      const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      r.addColorStop(0, "rgba(0,0,0,0.55)"); r.addColorStop(1, "rgba(0,0,0,0)");
      g.setTransform(1, 0, 0, h / w, 0, 0); g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
    tex("chip", 8, 8, (g) => { g.fillStyle = "#f2ead8"; g.fillRect(1, 2, 6, 3); });
    tex("ember", 8, 8, (g) => { g.fillStyle = "#fff"; g.beginPath(); g.arc(4, 4, 3, 0, 7); g.fill(); });
    tex("ring", 256, 256, (g, w) => {
      g.strokeStyle = "rgba(255,255,255,1)"; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 8, 0, 7); g.stroke();
      g.fillStyle = "rgba(255,255,255,0.22)"; g.fill();
    });
    tex("arc", 256, 256, (g, w) => {   // chop slash: a crescent pointing +x
      g.translate(w / 2, w / 2); g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath(); g.arc(0, 0, 120, -0.75, 0.75); g.arc(18, 0, 92, 0.72, -0.72, true); g.closePath(); g.fill();
    });
  }
};
