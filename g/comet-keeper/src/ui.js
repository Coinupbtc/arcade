// DOM UI: HUD, title, upgrade pick, pause, verdict. Keys, pad and touch drive the same menus.
CK.UI = {
  $: function (id) { return document.getElementById(id); },
  menus: {}, lastScore: -1, lastWave: -1, lastBest: -1, bannerT: 0,

  init: function (input) {
    var self = this;
    this.input = input;
    this.menus = {};
    this.cardItems = [];

    this.$("mute").addEventListener("click", function (e) {
      e.preventDefault();
      var m = CK.Audio.toggleMute();
      self.$("mute").classList.toggle("off", m);
    });
    try { this.$("mute").classList.toggle("off", localStorage.getItem("cometkeeper.muted") === "1"); } catch (e) {}

    input.on("device", function (d) {
      document.body.classList.toggle("touch", d === "touch");
      document.body.classList.toggle("pad", d === "pad");
    });
    document.body.classList.add("touch");   // until the first key or pad press says otherwise
    this.drawCrest();
  },

  // One menu per showing, built at the moment the panel opens: arcade-input routes the NEWEST
  // menu, so a menu built once at boot and reopened later is silently unreachable by keys and pad.
  specs: function (id) {
    var input = this.input;
    if (id === "title") return [{ id: "play", el: this.$("play"), action: function () { CK.start(); } }];
    if (id === "pause") return [
      { id: "resume", el: this.$("resume"), action: function () { input.pause.resume(); } },
      { id: "quit", el: this.$("quit"), action: function () { CK.toTitle(); } }
    ];
    if (id === "over") return [
      { id: "again", el: this.$("again"), action: function () { CK.start(); } },
      { id: "menu", el: this.$("menu"), action: function () { CK.toTitle(); } }
    ];
    if (id === "upgrade") return this.cardItems;
    return [];
  },

  drawCrest: function () {
    var c = this.$("crest");
    if (!c) return;
    var ctx = c.getContext("2d"), w = c.width, h = c.height, cx = w / 2, cy = h / 2, r = w * 0.26;
    ctx.clearRect(0, 0, w, h);
    var g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, "#b6ffe6"); g.addColorStop(0.35, "#5ee9c0"); g.addColorStop(0.7, "#1d7d8a"); g.addColorStop(1, "#0a2f44");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#062b33";
    ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.08, r * 0.11, r * 0.13, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + r * 0.3, cy - r * 0.08, r * 0.11, r * 0.13, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = "#062b33"; ctx.lineWidth = r * 0.07; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.2, r * 0.22, 0.18 * Math.PI, 0.82 * Math.PI); ctx.stroke();
    // orbit + moon
    ctx.strokeStyle = "rgba(223,232,245,0.35)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.44, w * 0.30, -0.4, 0, 6.283); ctx.stroke();
    var mx = cx + Math.cos(-0.9) * w * 0.40, my = cy + Math.sin(-0.9) * w * 0.27;
    var mg = ctx.createRadialGradient(mx - 3, my - 3, 1, mx, my, w * 0.075);
    mg.addColorStop(0, "#ffffff"); mg.addColorStop(1, "#8e9db6");
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, w * 0.075, 0, 6.283); ctx.fill();
  },

  show: function (id) {
    var ids = ["title", "upgrade", "pause", "over"];
    for (var i = 0; i < ids.length; i++) this.$(ids[i]).classList.toggle("on", ids[i] === id);
    Object.keys(this.menus).forEach(function (k) { CK.UI.menus[k].close(); });
    if (id) {
      var items = this.specs(id);
      if (items.length) {
        this.menus[id] = this.input.menu({
          items: items,
          onBack: id === "pause" ? function () { CK.input.pause.resume(); } : null
        });
        this.menus[id].open(0);
      }
    }
    document.body.classList.toggle("inplay", CK.G.mode === "play");
    document.body.classList.toggle("paused", CK.G.mode === "paused");
  },

  hidePanels: function () { this.show(null); },

  showTitle: function () {
    var G = CK.G;
    this.$("bestline").textContent = G.best ? "BEST " + G.best.toLocaleString() : "";
    this.show("title");
  },

  showPause: function () { this.show("pause"); },
  hidePause: function () { this.show(null); },

  showUpgrade: function () {
    var G = CK.G, self = this;
    this.$("upwave").textContent = String(G.wave + 1);
    var wrap = this.$("cards");
    wrap.innerHTML = "";
    this.cardItems = [];
    G.offers.forEach(function (o, i) {
      var b = document.createElement("button");
      b.className = "card";
      b.setAttribute("data-menu", "card" + i);
      b.innerHTML = "<b>" + o.name + "</b><i>" + o.desc + "</i>";
      b.addEventListener("click", function (e) { e.preventDefault(); });
      wrap.appendChild(b);
      self.cardItems.push({ id: "card" + i, el: b, action: function () { CK.takeUpgrade(o.id); } });
    });
    this.show("upgrade");
  },

  showOver: function () {
    var G = CK.G;
    var isBest = G.score > 0 && G.score >= G.best;
    this.$("overtitle").textContent = isBest ? "A NEW BEST" : "THE WORLD CRACKED";
    this.$("oversub").textContent = isBest
      ? "The dark keeps coming. You kept it out longer than ever."
      : "Three cracks. The little world needs a new keeper.";
    this.$("oscore").textContent = G.score.toLocaleString();
    this.$("obest").textContent = G.best.toLocaleString();
    this.$("owave").textContent = String(G.wave);
    this.show("over");
  },

  banner: function (title, sub) {
    var b = this.$("banner");
    b.innerHTML = title + (sub ? "<small>" + sub + "</small>" : "");
    b.classList.remove("on");
    void b.offsetWidth;
    b.classList.add("on");
  },

  syncHUD: function () {
    var G = CK.G;
    if (G.score !== this.lastScore) { this.$("score").textContent = G.score.toLocaleString(); this.lastScore = G.score; }
    if (G.best !== this.lastBest) { this.$("best").textContent = "BEST " + G.best.toLocaleString(); this.lastBest = G.best; }
    if (G.wave !== this.lastWave) { this.$("wave").textContent = "WAVE " + G.wave; this.lastWave = G.wave; }
    var frac = G.calm > 0 ? 1 : Math.max(0, G.waveT / CK.TUNE.waveSeconds);
    this.$("tfill").style.width = (frac * 100).toFixed(2) + "%";
    document.body.classList.toggle("inplay", G.mode === "play");
    document.body.classList.toggle("paused", G.mode === "paused");
  }
};
