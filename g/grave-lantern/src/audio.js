/* Grave Lantern — audio: ACE-Step music loops + game-sfx voices through Howler. */
(function (root) {
  'use strict';

  var A = { ready: false, muted: false };
  var music = {}, sfx = {};
  var last = {};

  // Ship .ogg for Chrome/Firefox and .m4a beside it: iOS Safari cannot decode Ogg Vorbis.
  function mk(base, opts) {
    try { return new Howl(Object.assign({ src: [base + '.ogg', base + '.m4a'], preload: true }, opts || {})); }
    catch (e) { return null; }
  }

  A.init = function () {
    if (A.ready) return;
    if (!root.Howl) return;
    music.crypt = mk('assets/audio/crypt', { loop: true, volume: 0.0, html5: false });
    music.boss = mk('assets/audio/boss', { loop: true, volume: 0.0 });
    music.win = mk('assets/audio/win', { loop: false, volume: 0.55 });
    music.lose = mk('assets/audio/lose', { loop: false, volume: 0.55 });

    sfx.swing = mk('assets/audio/swing', { volume: 0.30, rate: 1.05 });
    sfx.bonehit = mk('assets/audio/bonehit', { volume: 0.35 });
    sfx.bonedeath = mk('assets/audio/bonedeath', { volume: 0.32 });
    sfx.hurt = mk('assets/audio/hurt', { volume: 0.55 });
    sfx.coin = mk('assets/audio/coin', { volume: 0.30 });
    sfx.potion = mk('assets/audio/potion', { volume: 0.45 });
    sfx.dodge = mk('assets/audio/dodge', { volume: 0.40 });
    sfx.spawn = mk('assets/audio/spawn', { volume: 0.16 });
    sfx.bolt = mk('assets/audio/bolt', { volume: 0.25 });
    A.ready = true;
  };

  A.unlock = function () {
    A.init();
    if (root.Howler && root.Howler.ctx && root.Howler.ctx.state === 'suspended') root.Howler.ctx.resume();
    if (!A.muted) {
      if (music.crypt && !music.crypt.playing()) music.crypt.play();
      if (music.crypt) music.crypt.fade(music.crypt.volume(), 0.34, 900);
    }
  };

  A.play = function (name, maxEvery) {
    if (A.muted) return;
    var h = sfx[name];
    if (!h) return;
    var now = performance.now();
    if (maxEvery && last[name] && now - last[name] < maxEvery) return;
    last[name] = now;
    h.play();
  };

  A.startCrypt = function () {
    if (!A.ready) return;
    A.stopAllMusic();
    if (music.crypt) { music.crypt.volume(0); music.crypt.play(); music.crypt.fade(0, 0.34, 700); }
  };

  A.startBoss = function () {
    if (!A.ready) return;
    if (music.crypt) music.crypt.fade(music.crypt.volume(), 0, 600);
    if (music.boss) { music.boss.volume(0); music.boss.play(); music.boss.fade(0, 0.46, 500); }
  };

  A.end = function (win) {
    if (!A.ready) return;
    A.stopAllMusic();
    var h = win ? music.win : music.lose;
    if (h) { h.volume(win ? 0.55 : 0.5); h.play(); }
  };

  A.stopAllMusic = function () {
    ['crypt', 'boss'].forEach(function (k) {
      if (music[k] && music[k].playing()) music[k].stop();
    });
  };

  A.setMuted = function (m) {
    A.muted = !!m;
    if (root.Howler) root.Howler.mute(A.muted);
  };

  root.GraveAudio = A;
})(typeof window !== 'undefined' ? window : globalThis);
