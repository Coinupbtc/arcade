// SIGNAL — audio. Stems layer in as the combo climbs; every kill is a scale note.
// Uses Howler from ./lib (no CDN). All buffers are local WAVs.

export function createAudio() {
  let ready = false;
  let muted = false;
  const loops = {};
  let layersOn = { pad: false, bass: false, perc: false };
  const notes = [];
  let sfx = {};

  function load() {
    if (ready) return;
    const mk = (src, vol, loop = false) => new Howl({ src: [src], volume: vol, loop, html5: false, preload: true });
    loops.pad  = mk('audio/pad.wav', 0.0, true);
    loops.bass = mk('audio/bass.wav', 0.0, true);
    loops.perc = mk('audio/perc.wav', 0.0, true);
    for (let i = 0; i < 7; i++) notes.push(mk(`audio/note${i}.wav`, 0.5));
    sfx = {
      lock:      mk('audio/lock.wav', 0.16),
      fire:      mk('audio/fire.wav', 0.28),
      hurt:      mk('audio/hurt.wav', 0.42),
      overdrive: mk('audio/overdrive.wav', 0.5),
      boss:      mk('audio/boss.wav', 0.5),
      win:       mk('audio/win.wav', 0.6),
    };
    ready = true;
  }

  function startMusic() {
    load();
    if (muted) return;
    for (const k of ['pad', 'bass', 'perc']) {
      if (!loops[k].playing()) loops[k].play();
    }
    layersOn = { pad: true, bass: true, perc: true };
    loops.pad.fade(0, 0.34, 900);
    loops.bass.fade(0, 0.0, 10);
    loops.perc.fade(0, 0.0, 10);
  }

  // Layer rule: the music literally builds from the player's combo.
  // 0-3 combo = pad only, 4-7 adds bass, 8+ adds percussion.
  function setLayers(combo) {
    if (!ready || muted) return;
    const wantBass = combo >= 4;
    const wantPerc = combo >= 8;
    if (wantBass && !layersOn.bass) { loops.bass.fade(0, 0.30, 700); layersOn.bass = true; }
    if (!wantBass && layersOn.bass) { loops.bass.fade(0.30, 0.0, 900); layersOn.bass = false; }
    if (wantPerc && !layersOn.perc) { loops.perc.fade(0, 0.22, 500); layersOn.perc = true; }
    if (!wantPerc && layersOn.perc) { loops.perc.fade(0.22, 0.0, 700); layersOn.perc = false; }
  }

  function note(degree, volume = 0.5) {
    if (!ready || muted) return;
    const n = notes[((degree % 7) + 7) % 7];
    const id = n.play();
    n.volume(volume, id);
    n.rate(1.0, id);
  }

  function play(name, rate = 1) {
    if (!ready || muted || !sfx[name]) return;
    const id = sfx[name].play();
    if (rate !== 1) sfx[name].rate(rate, id);
  }

  function stopMusic(fadeMs = 700) {
    if (!ready) return;
    for (const k of ['pad', 'bass', 'perc']) {
      if (loops[k].playing()) loops[k].fade(loops[k].volume(), 0, fadeMs);
    }
    setTimeout(() => { for (const k of ['pad', 'bass', 'perc']) if (loops[k].playing()) loops[k].stop(); }, fadeMs + 60);
  }

  function toggleMute() {
    muted = !muted;
    if (muted) { for (const k of ['pad', 'bass', 'perc']) if (loops[k].playing()) loops[k].volume(0); }
    else if (loops.pad.playing()) { loops.pad.volume(0.34); }
    return muted;
  }

  return { load, startMusic, stopMusic, setLayers, note, play, toggleMute, isMuted: () => muted };
}
