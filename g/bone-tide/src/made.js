// "How it was made": the toolchain this game shows off, with the real assets it made. Numbers from logs/*.log.
BT.MADE = [
  { pic: "assets/sprites/cast-card.png", wide: true, tool: "sprite-bake.py", title: "Characters from 3D models",
    text: "KayKit's rigged Barbarian and three skeletons, rendered in Blender on Start9's CPU into 8-direction sprite sheets: __FRAMES__ frames in __SHEETS__ sheets. One fixed camera, so nobody changes size or jitters." },
  { pic: "assets/sprites/p_crypt.png", tool: "sprite-bake.py --static", title: "Graveyard props",
    text: "20 KayKit Halloween models (crypt, graves, dead trees, lanterns, fences) baked with the same camera and light as the cast, so they match." },
  { pics: ["assets/sprites/potion.png", "assets/sprites/soul.png", "assets/sprites/rune.png"], tool: "game-sprite.py", title: "Items painted from words",
    text: "Potion, soul crystal and whirlwind rune: Z-Image Turbo on the TrapTop's RTX 3080 Ti, cut out by BiRefNet. About 12 seconds each." },
  { pic: "assets/sprites/ground-thumb.jpg", tool: "game-sprite.py --kind tile", title: "Seamless ground",
    text: "The mossy graveyard flagstones are one 512 px tile drawn on the TrapTop in 18 seconds, blended so it repeats without seams." },
  { icon: "♫", tool: "game-music.py", title: "Music from words",
    text: "ACE-Step 1.5 on the TrapTop: a 64 s battle loop (120 bpm, E minor), a 48 s boss loop (140 bpm) and win/lose stingers. Loops are cut to whole bars and crossfaded, so they never click." },
  { icon: "🔊", tool: "game-sfx.py", title: "Sound effects from words",
    text: "12 sounds from Stable Audio on Start9's CPU: axe swing, bone crunch, skeletons rising from the dirt, the church bell between waves, the Bone King's roar." },
  { pic: "assets/ui/floor.jpg", tool: "game-assets.py", title: "CC0 library",
    text: "Poly Haven flagstone for the crypt plaza, Kenney mobile-control art and fonts, all from the local 19,400-entry CC0 catalog." },
  { icon: "⚙", tool: "Phaser 4.2 + web-game-proof.py", title: "Engine and proof",
    text: "Phaser 4 from the house web-libs (no CDN). Tested in a phone-shaped Chromium with real touch, in portrait and landscape, for frame rate and errors. Served over Tailscale HTTPS by game-serve.sh." }
];
BT.MADE_STATS = { frames: "1,561", sheets: 9 };

BT.Made = {
  render() {
    const g = document.getElementById("toolgrid");
    g.innerHTML = BT.MADE.map((m) => {
      const pic = m.pics ? `<div class="pics">${m.pics.map((p) => `<img src="${p}" alt="">`).join("")}</div>`
        : m.pic ? `<img src="${m.pic}" alt="" loading="lazy">` : `<div style="font-size:40px;text-align:center">${m.icon}</div>`;
      const text = m.text.replace("__FRAMES__", BT.MADE_STATS.frames).replace("__SHEETS__", BT.MADE_STATS.sheets);
      return `<div class="tool${m.wide ? " wide" : ""}">${pic}<div><h3>${m.title}</h3><p>${text}</p><code>${m.tool}</code></div></div>`;
    }).join("");
  }
};
