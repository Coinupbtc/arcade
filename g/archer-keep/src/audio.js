// Archer.Audio — WebAudio synth SFX (no asset fetches, iPhone-safe unlock on first touch)
Archer.Audio = (function(){
  let ac = null, unlocked = false;
  function ctx(){
    if(!ac){ try{ ac = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ ac = null; } }
    return ac;
  }
  function unlock(){
    const c = ctx(); if(!c) return null;
    if(c.state === 'suspended'){ try{ c.resume(); }catch(e){} }
    unlocked = true;
    return c;
  }
  // tiny synth helpers
  function tone(freq, dur, type, vol, slideTo, delay){
    const c = ctx(); if(!c) return;
    const t0 = c.currentTime + (delay||0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type||'square'; o.frequency.setValueAtTime(freq, t0);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30,slideTo), t0+dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol||0.12, t0+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0+dur+0.05);
  }
  function noise(dur, vol, delay, hp){
    const c = ctx(); if(!c) return;
    const t0 = c.currentTime + (delay||0);
    const len = Math.max(1, Math.floor(c.sampleRate*dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i] = (Math.random()*2-1)*(1-i/len);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.setValueAtTime(vol||0.14, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
    let node = src;
    if(hp){ const f = c.createBiquadFilter(); f.type='highpass'; f.frequency.value=hp; src.connect(f); node = f; }
    node.connect(g); g.connect(c.destination);
    src.start(t0);
  }
  const SFX = {
    draw:   () => tone(180, 0.16, 'triangle', 0.05, 240),
    shoot:  () => { tone(720, 0.09, 'triangle', 0.12, 320); noise(0.06, 0.06, 0, 1200); },
    hit:    () => { noise(0.07, 0.12); tone(190, 0.07, 'square', 0.07, 120); },
    crit:   () => { tone(880, 0.08, 'square', 0.1, 1320); noise(0.05, 0.08, 0.02, 2000); },
    coin:   () => { tone(1180, 0.06, 'square', 0.07); tone(1560, 0.09, 'square', 0.06, null, 0.055); },
    burn:   () => noise(0.14, 0.05, 0, 500),
    freeze: () => tone(1300, 0.12, 'sine', 0.08, 700),
    explode:() => { noise(0.3, 0.2); tone(90, 0.25, 'sine', 0.16, 40); },
    roar:   () => { tone(120, 0.5, 'sawtooth', 0.14, 70); noise(0.4, 0.08, 0.05, 200); },
    gateHit:() => { tone(70, 0.2, 'sine', 0.16, 45); noise(0.12, 0.1, 0, 150); },
    lose:   () => { tone(330, 0.25, 'triangle', 0.12, 165); tone(220, 0.4, 'triangle', 0.1, 110, 0.22); },
    win:    () => { [523,659,784,1047].forEach((f,i)=>tone(f, 0.14, 'square', 0.08, null, i*0.09)); },
    buy:    () => { tone(660, 0.07, 'square', 0.08); tone(990, 0.1, 'square', 0.07, null, 0.06); },
    deny:   () => tone(160, 0.12, 'square', 0.09, 110),
    wave:   () => { tone(392, 0.12, 'triangle', 0.09); tone(523, 0.16, 'triangle', 0.09, null, 0.1); },
    bossIn: () => { tone(98, 0.6, 'sawtooth', 0.15, 62); tone(147, 0.5, 'sawtooth', 0.1, 98, 0.15); noise(0.5, 0.06, 0.1, 120); },
  };
  function play(name){
    if(!unlocked) return;
    try{ const f = SFX[name]; if(f) f(); }catch(e){ /* never break the frame for audio */ }
  }
  return { play, unlock, ctx, SFX };
})();
