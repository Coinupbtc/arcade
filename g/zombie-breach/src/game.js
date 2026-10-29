/* ZOMBIE BREACH — rules. One weapon, endless waves, a fenced yard. */
import * as THREE from 'three';
import { CFG, SAVE_KEY, SAVE_KEY_V1 } from './config.js';
import { makeSurvivor, makeZombie, makePickup, makeTracer, makeSupply, makeSpit, makeSpitMark } from './world.js';

const V_FWD = new THREE.Vector3();
const V_RIGHT = new THREE.Vector3();
const V_DIR = new THREE.Vector3();
const V_MID = new THREE.Vector3();
const V_TMP = new THREE.Vector3();
const V_TAIL = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const DUST_MAT = new THREE.MeshBasicMaterial({ color: 0xa39a86, transparent: true, opacity: 0.45, depthWrite: false });

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

export class Game {
  constructor(scene, camera, input, ui, sfx) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.ui = ui;
    this.sfx = sfx;

    this.state = 'menu';          // menu | play | paused | over
    this.score = 0;
    this.wave = 0;
    this.kills = 0;
    this.hp = CFG.hpMax;
    this.mag = CFG.magSize;
    this.reserve = CFG.reserveStart;
    this.dmg = CFG.damage;         // HOLLOW POINTS supply raises this for the rest of the run
    this.reloading = false;
    this.reloadT = 0;
    this.fireT = 0;
    this.scavengeT = 0;
    this.best = this._loadBest();
    this.player = { x: 0, z: -4, y: 0, vy: 0, yaw: 0, pitch: 0, grounded: true, vx: 0, vz: 0, walk: 0, bob: 0 };
    this.zombies = [];
    this.pickups = [];
    this.tracers = [];
    this.particles = [];
    this.spits = [];
    this.supplies = [];
    this.supplyTaken = 0;
    this.fireLights = [];
    this.hitStop = 0;
    this.shake = 0;
    this.recoil = 0;
    this.damageFlash = 0;
    this.waveTotal = 0;
    this.waveSpawned = 0;
    this.spawnQueue = [];
    this.spawnT = 0;
    this.breakT = 0;
    this.sinceShot = 9;
    this.stepT = 0;
    this.chain = 1;
    this.chainT = 0;
    this.jumpArmed = false;
    this.airT = 0;
    this.lastShove = 0;

    const s = makeSurvivor();
    this.avatar = s.group;
    this.rig = s.refs;
    scene.add(this.avatar);
    this.muzzleLight = new THREE.PointLight(0xffd39a, 0, 9, 2);
    scene.add(this.muzzleLight);
  }

  /* ---------------- persistence ---------------- */
  _loadBest() {
    try {
      const v = parseInt(localStorage.getItem(SAVE_KEY) || localStorage.getItem(SAVE_KEY_V1) || '0', 10);
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) { return 0; }
  }
  _saveBest() {
    try { localStorage.setItem(SAVE_KEY + '_wave', String(Math.max(this.wave, this.bestWave || 0))); } catch (e) {}
    if (this.score <= this.best) return;
    this.best = this.score;
    try { localStorage.setItem(SAVE_KEY, String(this.score)); } catch (e) {}
  }
  _loadBestWave() {
    try {
      const v = parseInt(localStorage.getItem(SAVE_KEY + '_wave') || '0', 10);
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) { return 0; }
  }

  /* ---------------- lifecycle ---------------- */
  reset() {
    this.zombies.forEach(z => {
      this.scene.remove(z.group);
      if (z.marker) this.scene.remove(z.marker);
    });
    this.pickups.forEach(p => this.scene.remove(p.group));
    this.tracers.forEach(t => this.scene.remove(t.mesh));
    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.spits.forEach(s => this.scene.remove(s.mesh));
    this.supplies.forEach(s => this.scene.remove(s.group));
    this.zombies = []; this.pickups = []; this.tracers = []; this.particles = [];
    this.spits = []; this.supplies = []; this.supplyTaken = 0;
    this.score = 0; this.wave = 0; this.kills = 0;
    this.hp = CFG.hpMax;
    this.mag = CFG.magSize; this.reserve = CFG.reserveStart;
    this.dmg = CFG.damage;
    this.reloading = false; this.reloadT = 0; this.fireT = 0; this.scavengeT = 0;
    this.hitStop = 0; this.shake = 0; this.recoil = 0; this.damageFlash = 0; this.fireLock = 0;
    this.aimTarget = null;
    this.waveTotal = 0; this.waveSpawned = 0; this.spawnQueue = []; this.spawnT = 0; this.breakT = 0;
    this.sinceShot = 9;
    this.chain = 1; this.chainT = 0;
    this.chainBest = 1;
    this.jumpArmed = false; this.airT = 0; this.stepT = 0; this.lastShove = 0;
    this.jumpCd = 0;
    this.heartT = 0;
    this.bestWave = this._loadBestWave();
    const p = this.player;
    p.x = 0; p.z = -4; p.y = 0; p.vy = 0; p.yaw = 0; p.pitch = 0; p.grounded = true;
    p.vx = 0; p.vz = 0; p.walk = 0; p.bob = 0;
    this.avatar.position.set(p.x, 0, p.z);
    this.avatar.rotation.y = 0;
    this.ui.setScreen('menu');
  }

  startRun() {
    this.reset();
    this.state = 'play';
    this.input.pause.reset();
    this.ui.setScreen('play');
    this.ui.closeMenus();
    this.startWave(1);
    this.fireLock = 0.2;          // the key/button that started the run must not also fire a shot
    this.sfx.play('wave');
  }

  toMenu() {
    this.reset();
    this.state = 'menu';
    this.ui.setScreen('menu');
    this.ui.showMenu(this);
  }

  endRun() {
    if (this.state !== 'play') return;
    this.state = 'over';
    this._saveBest();
    this.input.pause.reset();
    this.ui.closeMenus();
    this.ui.setScreen('over');
    this.ui.showVerdict(this);
    this.sfx.play('death');
  }

  /* ---------------- pause: one owner (the input layer) ---------------- */
  pauseGame() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.ui.showPause(this);
  }

  onResumed() {
    if (this.state !== 'paused') return;
    this.state = 'play';
    this.fireLock = 0.2;
    this.ui.closeMenus();
    this.ui.setScreen('play');
  }

  resumeRun() {
    if (this.state !== 'paused') return;
    if (this.input.pause.paused) this.input.pause.resume();   // fires onResume → onResumed
    else this.onResumed();
  }

  quitToMenu() {
    this.input.pause.reset();
    this.toMenu();
  }

  /* ---------------- waves ---------------- */
  startWave(n) {
    const p = this.player;
    this.wave = n;
    const boss = n % CFG.bossEvery === 0;
    const raw = Math.min(Math.floor(CFG.waveBase + (n - 1) * CFG.waveStep), 26);
    // a boss wave trades three walkers for the Warden: a beat, not a spike on top of a full wave
    const total = boss ? Math.max(3, raw - 3) : raw;
    this.waveTotal = total + (boss ? 1 : 0);
    this.waveSpawned = 0;
    this.spawnQueue = [];
    const runners = n >= 2 ? Math.min(1 + Math.floor((n - 2) * 0.8), Math.floor(total * 0.4)) : 0;
    const brutes = n >= 4 ? Math.min(1 + Math.floor((n - 4) / 3), Math.floor(total * 0.25)) : 0;
    const spitters = n >= 3 ? Math.min(1 + Math.floor((n - 3) / 2), Math.floor(total * 0.3)) : 0;
    const walkers = Math.max(1, total - runners - brutes - spitters);
    if (boss) this.spawnQueue.push('warden');
    for (let i = 0; i < walkers; i++) this.spawnQueue.push('walker');
    for (let i = 0; i < runners; i++) this.spawnQueue.push('runner');
    for (let i = 0; i < brutes; i++) this.spawnQueue.push('brute');
    for (let i = 0; i < spitters; i++) this.spawnQueue.push('spitter');
    // shuffle, but keep the opening three so wave 1 opens calm
    for (let i = this.spawnQueue.length - 1; i > 2; i--) {
      const j = 3 + Math.floor(Math.random() * (i - 2));
      const t = this.spawnQueue[i]; this.spawnQueue[i] = this.spawnQueue[j]; this.spawnQueue[j] = t;
    }
    this.spawnT = 0;
    this.breakT = 0;
    for (let i = 0; i < 3; i++) this._spawnFromQueue();
    this.spawnT = 0.9;
    if (boss) {
      this.ui.banner('WAVE ' + n + ' · THE WARDEN', 'BRING IT DOWN — CHAIN ×3 PIERCES');
      this.sfx.play('warden');
    } else {
      this.ui.banner('WAVE ' + n, n === 1 ? 'HOLD THE YARD' : 'THEY ARE FASTER NOW');
    }
  }

  _spawnFromQueue() {
    if (!this.spawnQueue.length) return;
    const alive = this.zombies.filter(z => z.state !== 'dying').length;
    if (alive >= CFG.aliveCap) return;
    const type = this.spawnQueue.shift();
    this.waveSpawned++;
    const p = this.player;
    const fwd = -p.yaw - Math.PI * 0.5;   // world bearing of the player's forward (-z at yaw 0)
    const boss = type === 'warden';
    // Wave 1 opens with three walkers already in front of you: a first-timer gets a target
    // and a kill inside the first seconds instead of staring at an empty yard.
    const opener = !boss && this.wave === 1 && this.waveSpawned <= 3;
    let a, r;
    if (boss) {
      a = fwd + (Math.random() - 0.5) * 0.5;
      r = 16 + Math.random() * 2;
    } else if (opener) {
      a = fwd + (Math.random() - 0.5) * 0.8;
      r = 14 + Math.random() * 2.5;
    } else {
      // pressure rises with the wave: fewer spawns come straight at you and more flank
      const front = 0.72 - Math.min(0.3, (this.wave - 1) * 0.04);
      a = fwd + (Math.random() < front
        ? (Math.random() - 0.5) * 1.2
        : Math.PI + (Math.random() - 0.5) * 1.6);
      r = CFG.spawnR + Math.random() * 3;
    }
    let x = p.x + Math.cos(a) * r;
    let z = p.z + Math.sin(a) * r;
    x = clamp(x, -CFG.worldR + 1, CFG.worldR - 1);
    z = clamp(z, -CFG.worldR + 1, CFG.worldR - 1);
    const m = makeZombie(type);
    m.group.position.set(x, 0, z);
    this.scene.add(m.group);
    const cfg = CFG[type];
    const bonusHp = Math.floor(Math.max(0, this.wave - 1) / CFG.hpEvery);
    let marker = null;
    if (cfg.ranged) {
      marker = makeSpitMark();
      this.scene.add(marker);
    }
    this.zombies.push({
      type: type, cfg: cfg, group: m.group, refs: m.refs, marker: marker,
      x: x, z: z, hp: cfg.hp + bonusHp,
      maxHp: cfg.hp + bonusHp,
      speed: cfg.speed + Math.min(1.5, (this.wave - 1) * 0.1),
      dmg: cfg.dmg, state: 'chase', windupT: 0, cooldown: 1.2 + Math.random() * 1.2,
      flash: 0, stagger: 0, phase: Math.random() * 6.28, dyingT: 0, pushX: 0, pushZ: 0
    });
  }

  aliveCount() { return this.zombies.filter(z => z.state !== 'dying').length; }

  /* ---------------- look ---------------- */
  lookBy(dx, dy, sens) {
    const p = this.player;
    p.yaw -= dx * sens;
    p.pitch = clamp(p.pitch - dy * sens, -CFG.pitchMax, CFG.pitchMax);
  }
  turnBy(rad) { this.player.yaw += rad; }          // + turns left

  _look(frame, dt) {
    const p = this.player;
    // Q / E turn the survivor when the mouse cannot: a mouse cursor that hits the screen edge
    // stops delivering horizontal motion, so the keyboard must be able to turn you around.
    const k = this.input.keys || {};
    const turn = (k.KeyQ ? 1 : 0) - (k.KeyE ? 1 : 0);
    if (turn) p.yaw += turn * CFG.keyTurnRate * dt;
    if (frame.device === 'pad') {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && pads[0];
      if (gp) {
        let lx = gp.axes[2] || 0, ly = gp.axes[3] || 0;
        if (Math.abs(lx) < 0.16) lx = 0;
        if (Math.abs(ly) < 0.16) ly = 0;
        p.yaw -= lx * CFG.padLookSens * dt;
        p.pitch = clamp(p.pitch - ly * CFG.padLookSens * 0.75 * dt, -CFG.pitchMax, CFG.pitchMax);
      }
    }
    if ((frame.device === 'touch' || frame.device === 'pad') && (frame.held.primary || frame.held.secondary)) {
      this._assist(dt);
    } else {
      this.aimTarget = null;      // the crosshair lock only shows while you are actually aiming
    }
  }

  /* Touch and pad fire toward the nearest threat in a cone; the camera turns, so the
     crosshair stays honest about where the bullet goes. The target is sticky for a moment
     so two zombies at similar bearings cannot make the aim oscillate between them. */
  _assist(dt) {
    const p = this.player;
    let t = this.aimTarget;
    if (t && (t.state === 'dying' || Math.hypot(t.x - p.x, t.z - p.z) > CFG.bulletRange * 0.6)) t = null;
    if (t) {
      const want0 = Math.atan2(-(t.x - p.x), -(t.z - p.z));
      if (Math.abs(angleDiff(p.yaw, want0)) > CFG.aimSticky) t = null;   // spun away on purpose
    }
    if (!t) {
      let bestD = CFG.bulletRange * 0.6;
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (z.state === 'dying') continue;
        const dx = z.x - p.x, dz = z.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4 || d > bestD) continue;
        const want = Math.atan2(-dx, -dz);
        if (Math.abs(angleDiff(p.yaw, want)) < CFG.aimAssist && d < bestD) { bestD = d; t = z; }
      }
    }
    this.aimTarget = t;
    if (!t) return;
    const dx = t.x - p.x, dz = t.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(-dx, -dz);
    const step = CFG.aimAssistRate * dt;
    p.yaw += clamp(angleDiff(p.yaw, want), -step, step);
    const wantPitch = Math.atan2(1.05 * t.cfg.scale - CFG.camUp, d);
    const dp = wantPitch - p.pitch;
    p.pitch = clamp(p.pitch + clamp(dp, -step * 0.6, step * 0.6), -CFG.pitchMax, CFG.pitchMax);
  }

  /* ---------------- move ---------------- */
  _move(frame, dt) {
    const p = this.player;
    let mx = frame.move.x, my = frame.move.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    const tx = (cy * mx + sy * my) * CFG.speed;
    const tz = (-sy * mx + cy * my) * CFG.speed;
    const k = Math.min(1, dt * CFG.accel);
    p.vx = lerp(p.vx, tx, k);
    p.vz = lerp(p.vz, tz, k);
    p.x += p.vx * dt;
    p.z += p.vz * dt;

    // crates are solid cover
    const r = CFG.radius, h = CFG.crateHalf;
    for (let i = 0; i < CFG.crates.length; i++) {
      const cx = CFG.crates[i][0], cz = CFG.crates[i][1];
      const nx = clamp(p.x, cx - h, cx + h), nz = clamp(p.z, cz - h, cz + h);
      const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 0.0001) {
          const ox = p.x - cx, oz = p.z - cz;
          if (Math.abs(ox) > Math.abs(oz)) p.x = cx + (ox < 0 ? -1 : 1) * (h + r);
          else p.z = cz + (oz < 0 ? -1 : 1) * (h + r);
        } else {
          const d = Math.sqrt(d2);
          p.x = nx + (dx / d) * r; p.z = nz + (dz / d) * r;
        }
      }
    }
    p.x = clamp(p.x, -CFG.worldR + 1.1, CFG.worldR - 1.1);
    p.z = clamp(p.z, -CFG.worldR + 1.1, CFG.worldR - 1.1);

    if (frame.pressed.secondary && p.grounded && this.jumpCd <= 0) {
      p.vy = CFG.jumpV; p.grounded = false; p.y = 0.02;
      this.jumpArmed = true; this.airT = 0;
      this.jumpCd = CFG.jumpCd;
      this.sfx.play('jump');
    }
    if (!p.grounded) {
      this.airT += dt;
      p.vy -= CFG.gravity * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0; p.vy = 0; p.grounded = true;
        if (this.jumpArmed) this._landShock();
        this.jumpArmed = false;
      }
    }

    const moving = Math.hypot(p.vx, p.vz) / CFG.speed;
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    p.walk = moving > 0.12 ? p.walk + dt * (7 + moving * 4) : lerp(p.walk, 0, Math.min(1, dt * 6));
    p.bob = lerp(p.bob, moving > 0.12 && p.grounded ? 1 : 0, Math.min(1, dt * 5));
    this.stepT -= dt;
    if (moving > 0.12 && p.grounded && this.stepT <= 0) { this.stepT = 0.3; this.sfx.play('step'); }
  }

  /* Land from a jump: shove the dead off you. JUMP is the answer to being surrounded,
     so it has to change the fight, not just the camera height. */
  _landShock() {
    const p = this.player;
    let n = 0;
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.state === 'dying') continue;
      if (z.stagger > 0) continue;              // already reeling: a second shove cannot re-lock it
      if (z.cfg.immune) continue;               // the Warden shrugs the shockwave off — shoot it
      const dx = z.x - p.x, dz = z.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > CFG.jumpShockR) continue;
      const k = 1 - d / CFG.jumpShockR;
      const ux = d > 0.01 ? dx / d : 0, uz = d > 0.01 ? dz / d : 1;
      z.x += ux * CFG.jumpShockPush * k;
      z.z += uz * CFG.jumpShockPush * k;
      z.stagger = Math.max(z.stagger, 0.25 + CFG.jumpStagger * k);
      z.state = 'chase'; z.windupT = 0; z.cooldown = Math.max(z.cooldown, 0.6);
      n++;
    }
    this._dust(p.x, p.z, 12);
    this.shake = Math.max(this.shake, CFG.shakeLand);
    this.sfx.play('land');
    this.lastShove = n;
    if (n) { this.score += n * 2; this.ui.scorePop(n * 2); }
  }

  /* ---------------- weapon ---------------- */
  _weapon(frame, dt) {
    this.fireT -= dt;
    this.sinceShot += dt;
    if (this.fireLock > 0) this.fireLock -= dt;
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this._finishReload();
      return;
    }
    if (frame.pressed.reload) this.reload();
    if (this.fireLock <= 0 && frame.held.primary) {
      if (this.mag > 0 && this.fireT <= 0) this.shoot();
      else if (this.mag === 0 && this.reserve <= 0) {
        if (frame.pressed.primary) this.sfx.play('empty');
      }
    }
    if (this.mag === 0 && !this.reloading) {
      if (this.reserve > 0 && this.sinceShot > CFG.autoReloadDelay) this.reload();
      else if (this.reserve <= 0) this._scavenge(dt);
    }
  }

  reload() {
    if (this.reloading || this.mag >= CFG.magSize || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadT = CFG.reloadTime;
    this.sfx.play('reload');
  }
  _finishReload() {
    const need = CFG.magSize - this.mag;
    const take = Math.min(need, this.reserve);
    this.mag += take; this.reserve -= take;
    this.reloading = false; this.reloadT = 0; this.scavengeT = 0;
  }
  _scavenge(dt) {
    this.scavengeT += dt;
    if (this.scavengeT >= CFG.scavengeTime) {
      this.scavengeT = 0;
      this.reserve = Math.min(CFG.reserveMax, this.reserve + CFG.scavengeRounds);
      this.ui.banner('SCAVENGED ' + CFG.scavengeRounds + ' ROUNDS', 'STAY IN THE FIGHT');
      this.sfx.play('pickup');
    }
  }

  shoot() {
    const p = this.player;
    this.mag--; this.fireT = CFG.fireRate; this.sinceShot = 0;

    /* The crosshair is the camera's centre: aim the ray from the camera through it,
       then draw the tracer from the gun to what it hit. What you see is what you hit. */
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    const fwdX = -sy, fwdZ = -cy, rightX = cy, rightZ = -sy;
    const camX = p.x - fwdX * CFG.camBack + rightX * CFG.camRight;
    const camY = CFG.camUp + p.y * 0.55;
    const camZ = p.z - fwdZ * CFG.camBack + rightZ * CFG.camRight;
    const tx = p.x + fwdX * CFG.camPush + rightX * (CFG.camRight * 0.55);
    const tz = p.z + fwdZ * CFG.camPush + rightZ * (CFG.camRight * 0.55);
    const ty = camY + Math.sin(p.pitch) * CFG.camPush;
    V_DIR.set(tx - camX, ty - camY, tz - camZ).normalize();

    /* Chain ×3 turns the rifle into piercing rounds: one shot passes through up to three
       bodies, so keeping a chain alive is power, not just points. */
    const pierce = this.chain >= CFG.pierceAt ? CFG.pierceTargets : 1;
    const hits = [];
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.state === 'dying') continue;
      const dx = z.x - camX, dz = z.z - camZ;
      const t = dx * V_DIR.x + dz * V_DIR.z;
      if (t <= 0.8 || t >= CFG.bulletRange) continue;
      const perp2 = dx * dx + dz * dz - t * t;
      const rad = 0.64 * z.cfg.scale + 0.16;
      const yAt = camY + V_DIR.y * t;
      if (perp2 < rad * rad && yAt > 0.25 && yAt < 1.05 * z.cfg.scale + 1.05) hits.push({ z: z, t: t });
    }
    hits.sort(function (a, b) { return a.t - b.t; });
    const list = hits.slice(0, pierce);
    const endT = list.length ? list[list.length - 1].t : CFG.bulletRange;
    V_TMP.set(camX, camY, camZ).addScaledVector(V_DIR, endT);
    const start = new THREE.Vector3(this.rig.muzzle.getWorldPosition(new THREE.Vector3()));
    const tracer = makeTracer(pierce > 1 ? 0xfff0a0 : 0xffe6a0);
    tracer.position.copy(start).add(V_TMP).multiplyScalar(0.5);
    V_TAIL.set(V_TMP.x - start.x, V_TMP.y - start.y, V_TMP.z - start.z).normalize();
    tracer.quaternion.setFromUnitVectors(Z_AXIS, V_TAIL);
    tracer.scale.z = Math.max(0.4, start.distanceTo(V_TMP));
    this.scene.add(tracer);
    this.tracers.push({ mesh: tracer, life: 0.11 });

    for (let i = 0; i < list.length; i++) this._hit(list[i].z, V_DIR, list[i].t);
    this.muzzleLight.position.copy(start);
    this.muzzleLight.intensity = 4.2;
    this.recoil = 1;
    this.shake = Math.max(this.shake, CFG.shakeShot);
    this.input.rumble(28, 0, 0.28);
    this.sfx.play(pierce > 1 ? 'shotPierce' : 'shot');
  }

  _hit(z, dir, t) {
    z.hp -= this.dmg;
    z.flash = 0.2;
    z.refs.bodyMat.emissive.setHex(0xff4422);
    z.refs.bodyMat.emissiveIntensity = 2.6;
    this._blood(z.x, 1.1 * z.cfg.scale, z.z, 6);
    if (z.hp <= 0) {
      this._kill(z);
    } else {
      z.x += dir.x * CFG.hitPush; z.z += dir.z * CFG.hitPush;
      this.sfx.play('hit');
      this.ui.hit('body');
      this.shake = Math.max(this.shake, CFG.shakeHit);
    }
  }

  _kill(z) {
    z.state = 'dying'; z.dyingT = 0;
    if (z.marker) z.marker.visible = false;
    z.refs.bodyMat.transparent = true; z.refs.headMat.transparent = true;
    // chain: keep killing inside the window and every kill pays more
    this.chain = Math.min(CFG.chainMax, this.chain + CFG.chainStep);
    this.chainT = CFG.chainWindow;
    this.chainBest = Math.max(this.chainBest, this.chain);
    const gain = Math.round((z.cfg.score + Math.floor(this.wave * 1.5)) * this.chain);
    this.score += gain;
    this.kills++;
    this._blood(z.x, 1.0, z.z, 14);
    this.sfx.play('kill');
    this.ui.hit('kill');
    this.shake = Math.max(this.shake, 0.2);
    this.hitStop = CFG.hitStop;
    this.ui.scorePop(gain);
    if (z.type === 'warden') {
      // the Warden pays out in the two things a long run needs, and drops them where it fell
      this.reserve = Math.min(CFG.reserveMax, this.reserve + 40);
      this.hp = Math.min(CFG.hpMax, this.hp + 30);
      this._blood(z.x, 1.6, z.z, 26);
      this.shake = Math.max(this.shake, 0.45);
      this.ui.banner('WARDEN DOWN', '+40 ROUNDS   +30 HP');
      this.sfx.play('clear');
      this.input.rumble(220, 1, 0.6);
      this._drop('health', z.x + 1.2, z.z);
      this._drop('ammo', z.x - 1.2, z.z);
    } else if (Math.random() < 0.5) {
      this._drop(Math.random() < 0.32 ? 'health' : 'ammo', z.x, z.z);
    }
  }

  _drop(kind, x, z) {
    const g = makePickup(kind);
    g.position.set(x, 0.55, z);
    this.scene.add(g);
    this.pickups.push({ kind: kind, group: g, x: x, z: z, t: Math.random() * 3, ttl: 22 });
  }

  _blood(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07 + Math.random() * 0.05, 5, 4),
        new THREE.MeshBasicMaterial({ color: 0x9d1d1d }));
      m.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4);
      this.scene.add(m);
      this.particles.push({ mesh: m, t: 0, life: 0.5 + Math.random() * 0.2,
        vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2.4, vz: (Math.random() - 0.5) * 3 });
    }
  }

  _dust(x, z, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.8;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09 + Math.random() * 0.06, 4, 3), DUST_MAT);
      m.position.set(x + Math.cos(a) * r, 0.1 + Math.random() * 0.14, z + Math.sin(a) * r);
      this.scene.add(m);
      this.particles.push({ mesh: m, t: 0, life: 0.45 + Math.random() * 0.25,
        vx: Math.cos(a) * 1.9, vy: 0.5 + Math.random() * 0.7, vz: Math.sin(a) * 1.9 });
    }
  }

  /* ---------------- zombies ---------------- */
  remaining() { return this.aliveCount() + this.spawnQueue.length; }

  /* How many live zombies sit off the crosshair: to the left, to the right, behind.
     The camera cannot show what is behind you, so the screen has to say it in words. */
  threatInfo() {
    const p = this.player;
    let left = 0, right = 0, behind = 0, near = Infinity;
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.state === 'dying') continue;
      const dx = z.x - p.x, dz = z.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < near) near = d;
      const rel = angleDiff(p.yaw, Math.atan2(-dx, -dz));
      if (Math.abs(rel) > CFG.threatBehind) behind++;
      else if (rel > CFG.threatSide) left++;
      else if (rel < -CFG.threatSide) right++;
    }
    return { left: left, right: right, behind: behind, near: near === Infinity ? 0 : Math.round(near) };
  }

  /* ---------------- spitters: the dead that shoot back ---------------- */
  /* It holds range instead of walking into the gun, telegraphs with a green ring on the ground,
     then lobs acid at where you stood. Moving (or jumping) beats it; killing it beats it faster. */
  _spitter(z, dt, lunge) {
    const p = this.player;
    const dx = p.x - z.x, dz = p.z - z.z;
    const d = Math.hypot(dx, dz) || 0.001;
    z.phase += dt * 6;
    z.cooldown = Math.max(0, z.cooldown - dt);
    // the last dead thing in the yard walks in: a spitter that holds range forever would stall a wave
    const keepMax = lunge ? 3.0 : z.cfg.keepMax;
    const keepMin = lunge ? 0 : z.cfg.keepMin;
    const speed = lunge ? z.speed * 1.3 : z.speed;

    if (z.state === 'windup') {
      z.windupT -= dt;
      const w = 1 - Math.max(0, z.windupT) / z.cfg.windup;
      z.windupW = w;
      if (z.flash <= 0) {
        z.refs.bodyMat.emissive.setHex(0x6a4a10);
        z.refs.bodyMat.emissiveIntensity = 0.7 + w * 1.6;
      }
      z.refs.armL.rotation.x = -2.5 - w * 0.3;
      z.refs.armR.rotation.x = -2.5 - w * 0.3;
      if (z.refs.sac) z.refs.sac.scale.set(1 + w * 0.22, 1.18 + w * 0.3, 0.94 + w * 0.2);
      if (z.marker) {
        z.marker.visible = true;
        z.marker.position.set(p.x, 0.04, p.z);
        z.marker.scale.setScalar(1 + Math.sin(this.t * 14) * 0.06 + w * 0.25);
        z.marker.userData.ring.material.opacity = 0.45 + w * 0.5;
      }
      if (z.windupT <= 0) {
        this._spitFrom(z);
        z.state = 'chase'; z.cooldown = z.cfg.cooldown; z.windupW = 0;
        z.refs.bodyMat.emissive.setHex(0x101a08);
        z.refs.bodyMat.emissiveIntensity = 0.4;
        if (z.refs.sac) z.refs.sac.scale.set(1, 1.18, 0.94);
        if (z.marker) z.marker.visible = false;
      }
    } else {
      let mx = 0, mz = 0;
      if (d > keepMax) { mx = dx / d; mz = dz / d; }
      else if (d < keepMin) { mx = -dx / d; mz = -dz / d; }
      else {
        const side = Math.sin(z.phase * 0.5) >= 0 ? 1 : -1;
        mx = (-dz / d) * side * 0.6; mz = (dx / d) * side * 0.6;
      }
      z.x = clamp(z.x + mx * speed * dt, -CFG.worldR + 1, CFG.worldR - 1);
      z.z = clamp(z.z + mz * speed * dt, -CFG.worldR + 1, CFG.worldR - 1);
      if (d <= keepMax + 1.5 && z.cooldown <= 0) {
        z.state = 'windup'; z.windupT = z.cfg.windup; z.windupW = 0;
        this.sfx.play('spitWarn');
      }
      z.refs.armL.rotation.x = -1.2 + Math.sin(z.phase) * 0.25;
      z.refs.armR.rotation.x = -1.2 - Math.sin(z.phase) * 0.25;
    }

    z.group.position.x = z.x;
    z.group.position.z = z.z;
    z.group.position.y = 0;
    z.group.rotation.y = Math.atan2(-dx, -dz);
    const swing = z.state === 'windup' ? 0 : Math.sin(z.phase) * 0.45;
    z.refs.legL.rotation.x = swing;
    z.refs.legR.rotation.x = -swing;
  }

  _spitFrom(z) {
    const p = this.player, T = CFG.spitFlight;
    const sx = z.x, sz = z.z, sy = 1.45;
    const tx = p.x, tz = p.z, ty = 1.02;
    const vx = (tx - sx) / T, vz = (tz - sz) / T;
    const vy = (ty - sy + 0.5 * CFG.spitGravity * T * T) / T;
    const mesh = makeSpit();
    mesh.position.set(sx, sy, sz);
    this.scene.add(mesh);
    this.spits.push({ mesh: mesh, sx: sx, sy: sy, sz: sz, vx: vx, vy: vy, vz: vz, t: 0, T: T, dmg: z.dmg });
    this.sfx.play('spit');
  }

  _spits(dt) {
    const p = this.player;
    for (let i = this.spits.length - 1; i >= 0; i--) {
      const s = this.spits[i];
      s.t += dt;
      const x = s.sx + s.vx * s.t;
      const z = s.sz + s.vz * s.t;
      const y = s.sy + s.vy * s.t - 0.5 * CFG.spitGravity * s.t * s.t;
      s.mesh.position.set(x, Math.max(0.08, y), z);
      s.mesh.rotation.y += dt * 7;
      if (s.t >= s.T || y <= 0.12) {
        if (Math.hypot(p.x - x, p.z - z) < CFG.spitRadius && p.y < 1.25) this._hurt(s.dmg, null);
        this._acid(x, z, 12);
        this.shake = Math.max(this.shake, 0.22);
        this.sfx.play('splat');
        this.scene.remove(s.mesh);
        this.spits.splice(i, 1);
      }
    }
  }

  _acid(x, z, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.9;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.05, 4, 3),
        new THREE.MeshBasicMaterial({ color: 0x9dff3a }));
      m.position.set(x + Math.cos(a) * r, 0.15 + Math.random() * 0.5, z + Math.sin(a) * r);
      this.scene.add(m);
      this.particles.push({ mesh: m, t: 0, life: 0.4 + Math.random() * 0.25,
        vx: Math.cos(a) * 2.2, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 2.2 });
    }
  }

  /* ---------------- supply choice: three crates, carry one ---------------- */
  _spawnSupplies() {
    this._clearSupplies();      // a new wave's choice replaces the old one: three crates, never six
    const p = this.player;
    const kinds = ['ammo', 'health', 'power'];
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t;
    }
    const fwd = -p.yaw - Math.PI * 0.5;
    for (let i = 0; i < 3; i++) {
      const a = fwd + (i - 1) * 0.8;
      let r = CFG.supplyRadius, x = 0, z = 0;
      for (let tries = 0; tries < 6; tries++) {
        x = p.x + Math.cos(a) * r;
        z = p.z + Math.sin(a) * r;
        let blocked = false;
        for (let c = 0; c < CFG.crates.length; c++) {
          const cr = CFG.crates[c];
          if (Math.abs(x - cr[0]) < CFG.crateHalf + 1.0 && Math.abs(z - cr[1]) < CFG.crateHalf + 1.0) { blocked = true; break; }
        }
        if (!blocked) break;
        r += 0.9;
      }
      x = clamp(x, -CFG.worldR + 1.5, CFG.worldR - 1.5);
      z = clamp(z, -CFG.worldR + 1.5, CFG.worldR - 1.5);
      const m = makeSupply(kinds[i]);
      m.group.position.set(x, 0, z);
      this.scene.add(m.group);
      this.supplies.push({ kind: kinds[i], group: m.group, pillar: m.pillar, ring: m.ring,
        x: x, z: z, t: Math.random() * 3, ttl: CFG.supplyTTL });
    }
  }

  _supplies(dt) {
    const p = this.player;
    for (let i = this.supplies.length - 1; i >= 0; i--) {
      const s = this.supplies[i];
      s.t += dt; s.ttl -= dt;
      s.group.position.y = Math.sin(s.t * 2.1) * 0.07;
      s.pillar.rotation.y += dt * 1.1;
      s.ring.scale.setScalar(1 + Math.sin(s.t * 4) * 0.06);
      if (Math.hypot(s.x - p.x, s.z - p.z) < CFG.supplyTake) { this._takeSupply(s.kind); return; }
      if (s.ttl <= 0) {
        const o = Math.max(0, 1 + s.ttl / 0.6);
        s.group.scale.setScalar(o);
        if (s.ttl < -0.6) { this.scene.remove(s.group); this.supplies.splice(i, 1); }
      }
    }
  }

  _takeSupply(kind) {
    if (kind === 'ammo') {
      this.reserve = Math.min(CFG.reserveMax, this.reserve + CFG.supplyAmmo);
      if (this.mag === 0) this.reload();
      this.ui.banner('TOOK AMMO', '+' + CFG.supplyAmmo + ' ROUNDS');
    } else if (kind === 'health') {
      this.hp = Math.min(CFG.hpMax, this.hp + CFG.supplyHeal);
      this.ui.banner('TOOK MEDKIT', '+' + CFG.supplyHeal + ' HP');
    } else {
      this.dmg = Math.round((this.dmg + CFG.supplyDmg) * 100) / 100;
      this.ui.banner('HOLLOW POINTS', 'DAMAGE ' + this.dmg.toFixed(1) + ' FOR THE REST OF THE RUN');
    }
    this.supplyTaken++;
    this.score += CFG.supplyScore;
    this.ui.scorePop(CFG.supplyScore);
    this.sfx.play('supply');
    this.input.rumble(60, 0.2, 0.3);
    this._clearSupplies();
  }

  _clearSupplies() {
    for (let i = 0; i < this.supplies.length; i++) this.scene.remove(this.supplies[i].group);
    this.supplies = [];
  }

  nearestSupply() {
    const p = this.player;
    let best = null, bd = Infinity;
    for (let i = 0; i < this.supplies.length; i++) {
      const d = Math.hypot(this.supplies[i].x - p.x, this.supplies[i].z - p.z);
      if (d < bd) { bd = d; best = this.supplies[i]; }
    }
    return best ? { kind: best.kind, d: bd, s: best } : null;
  }

  /* signed bearing to the nearest crate: + means turn left (Q), - means turn right (E) */
  supplyBearing() {
    const p = this.player, n = this.nearestSupply();
    if (!n) return 0;
    const want = Math.atan2(-(n.s.x - p.x), -(n.s.z - p.z));
    return angleDiff(p.yaw, want);
  }

  supplyOf(kind) {
    const p = this.player;
    let best = null, bd = Infinity;
    for (let i = 0; i < this.supplies.length; i++) {
      const s = this.supplies[i];
      if (s.kind !== kind) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best ? { kind: kind, d: bd, s: best } : null;
  }

  /* bearing to a named crate, for a test that chooses rather than takes what is nearest */
  supplyBearingOf(kind) {
    const p = this.player, n = this.supplyOf(kind);
    if (!n) return 0;
    const want = Math.atan2(-(n.s.x - p.x), -(n.s.z - p.z));
    return angleDiff(p.yaw, want);
  }

  _zombies(dt) {
    const p = this.player;
    let onlySpitters = this.spawnQueue.length === 0 && this.waveSpawned >= this.waveTotal;
    if (onlySpitters) {
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (z.state !== 'dying' && z.type !== 'spitter') { onlySpitters = false; break; }
      }
    }
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.state === 'dying') {
        z.dyingT += dt;
        z.group.rotation.x = -Math.min(1.5, z.dyingT * 4.2);
        z.group.position.y = Math.max(0, 0.6 - z.dyingT * 1.4);
        const o = Math.max(0, 1 - z.dyingT / 0.85);
        z.refs.bodyMat.opacity = o; z.refs.headMat.opacity = o;
        z.refs.eyeMat.opacity = o;
        if (z.dyingT >= 0.85) {
          this.scene.remove(z.group);
          if (z.marker) this.scene.remove(z.marker);
          this.zombies.splice(i, 1); i--;
        }
        continue;
      }
      if (z.flash > 0) {
        z.flash -= dt;
        z.refs.bodyMat.emissiveIntensity = Math.max(0.4, z.flash * 12);
        if (z.flash <= 0) { z.refs.bodyMat.emissive.setHex(0x101a08); z.refs.bodyMat.emissiveIntensity = 0.4; }
      }
      // staggered by a landing: no chase, no swing, arms slack
      if (z.stagger > 0) {
        z.stagger -= dt;
        if (z.marker) z.marker.visible = false;    // a staggered thrower cannot land its spit
        const sx = p.x - z.x, sz = p.z - z.z;
        z.group.position.x = z.x; z.group.position.z = z.z;
        z.group.rotation.y = Math.atan2(-sx, -sz);
        z.refs.armL.rotation.x = -0.55;
        z.refs.armR.rotation.x = -0.55;
        if (z.state !== 'dying') { z.state = 'chase'; z.windupT = 0; }
        continue;
      }
      z.cooldown = Math.max(0, z.cooldown - dt);
      const dx = p.x - z.x, dz = p.z - z.z;
      const d = Math.hypot(dx, dz) || 0.001;
      z.phase += dt * (z.type === 'runner' ? 12 : 7.5);

      if (z.cfg.ranged) { this._spitter(z, dt, onlySpitters); continue; }

      if (z.state === 'windup') {
        z.windupT -= dt;
        const w = 1 - Math.max(0, z.windupT) / z.cfg.windup;   // 0 → 1 over the windup
        z.windupW = w;
        z.group.position.y = Math.sin(w * 22) * 0.09;
        if (z.flash <= 0) {
          z.refs.bodyMat.emissive.setHex(0x8a1408);
          z.refs.bodyMat.emissiveIntensity = 0.6 + w * 1.8;    // telegraph: it is about to swing
        }
        z.refs.armL.rotation.x = -1.45 - w * 0.65;
        z.refs.armR.rotation.x = -1.45 - w * 0.65;
        if (z.windupT <= 0) {
          // a hop clears the grab: JUMP has a job
          if (d < CFG.contact + 0.6 && p.y < 0.75) this._hurt(z.dmg, z);
          z.state = 'chase'; z.cooldown = z.cfg.cooldown; z.group.position.y = 0;
          z.refs.bodyMat.emissive.setHex(0x101a08);
          z.refs.bodyMat.emissiveIntensity = 0.4;
        }
      } else if (d < CFG.contact && z.cooldown <= 0) {
        z.state = 'windup'; z.windupT = z.cfg.windup;
      } else if (z.cooldown <= 0 || d > CFG.contact) {
        const step = z.speed * dt;
        z.x += (dx / d) * step;
        z.z += (dz / d) * step;
      }
      z.group.position.x = z.x;
      z.group.position.z = z.z;
      z.group.rotation.y = Math.atan2(-dx, -dz);
      const swing = Math.sin(z.phase) * 0.55;
      z.refs.legL.rotation.x = swing;
      z.refs.legR.rotation.x = -swing;
      if (z.state === 'windup') {
        z.refs.armL.rotation.x = -1.45 - (z.windupW || 0) * 0.65;
        z.refs.armR.rotation.x = -1.45 - (z.windupW || 0) * 0.65;
      } else {
        z.refs.armL.rotation.x = -1.45 + swing * 0.16;
        z.refs.armR.rotation.x = -1.45 - swing * 0.16;
      }
    }

    // soft separation so a crowd reads as a crowd, not one zombie
    for (let i = 0; i < this.zombies.length; i++) {
      const a = this.zombies[i];
      if (a.state === 'dying') continue;
      for (let j = i + 1; j < this.zombies.length; j++) {
        const b = this.zombies[j];
        if (b.state === 'dying') continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        const min = CFG.separation * (a.cfg.scale + b.cfg.scale) * 0.5;
        if (d2 > 0.0001 && d2 < min * min) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          a.x -= (dx / d) * push; a.z -= (dz / d) * push;
          b.x += (dx / d) * push; b.z += (dz / d) * push;
        }
      }
      a.x = clamp(a.x, -CFG.worldR + 0.6, CFG.worldR - 0.6);
      a.z = clamp(a.z, -CFG.worldR + 0.6, CFG.worldR - 0.6);
    }
  }

  _hurt(n, z) {
    this.hp = Math.max(0, this.hp - n);
    this.damageFlash = 1;
    this.shake = Math.max(this.shake, CFG.shakeHurt);
    this.sfx.play('hurt');
    this.input.rumble(120, 0.7, 0.4);
    if (this.hp <= 0) this.endRun();
  }

  /* ---------------- per-frame ---------------- */
  update(dt, frame) {
    this.t = (this.t || 0) + dt;
    this._fires();
    if (this.state !== 'play') { return; }
    if (this.chainT > 0) {
      this.chainT = Math.max(0, this.chainT - dt);
      if (this.chainT === 0 && this.chain > 1) this.chain = 1;
    }
    let d = dt;
    if (this.hitStop > 0) { this.hitStop = Math.max(0, this.hitStop - dt); d = dt * 0.2; }
    this._look(frame, d);
    this._move(frame, d);
    this._weapon(frame, d);
    this._zombies(d);
    if (this.state !== 'play') { this._pose(d); return; }
    this._pickups(d);
    this._spits(d);
    if (this.state !== 'play') { this._pose(d); return; }
    this._supplies(d);
    this._waves(d);
    this._fx(d);
    this._pose(d);
    // low health is audible: a slow thump under the bed, never a flashing red screen
    if (this.hp <= 35) {
      this.heartT -= dt;
      if (this.heartT <= 0) { this.heartT = 0.72 + (this.hp / 100) * 0.6; this.sfx.play('heart'); }
    } else {
      this.heartT = 0;
    }
    this.ui.sync(this);
  }

  _fires() {
    const list = this.scene.userData.fires || [];
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      l.intensity = 6.2 + Math.sin(this.t * 7 + i * 2.1) * 1.5;
      if (l.userData.flame) l.userData.flame.scale.y = 0.85 + Math.sin(this.t * 9 + i) * 0.22;
    }
  }

  _pickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt; k.ttl -= dt;
      k.group.position.y = 0.55 + Math.sin(k.t * 3) * 0.13;
      k.group.rotation.y += dt * 2.2;
      const dx = p.x - k.x, dz = p.z - k.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.2) { k.x += (dx / d) * dt * 3.4; k.z += (dz / d) * dt * 3.4; k.group.position.x = k.x; k.group.position.z = k.z; }
      if (d < 1.0) {
        if (k.kind === 'health') this.hp = Math.min(CFG.hpMax, this.hp + 22);
        else this.reserve = Math.min(CFG.reserveMax, this.reserve + 16);
        this.scene.remove(k.group);
        this.pickups.splice(i, 1);
        this.sfx.play('pickup');
        continue;
      }
      if (k.ttl <= 0) { this.scene.remove(k.group); this.pickups.splice(i, 1); }
    }
  }

  _waves(dt) {
    const p = this.player;
    if (this.breakT > 0) {
      this.breakT -= dt;
      if (this.breakT <= 0) this.startWave(this.wave + 1);
      return;
    }
    this.spawnT -= dt;
    if (this.spawnQueue.length && this.spawnT <= 0) {
      this._spawnFromQueue();
      this.spawnT = 0.9;
    }
    if (!this.spawnQueue.length && this.waveSpawned >= this.waveTotal && this.aliveCount() === 0 && this.wave > 0) {
      this.score += CFG.waveBonus * this.wave;
      this.hp = Math.min(CFG.hpMax, this.hp + CFG.waveHeal);
      this.reserve = Math.min(CFG.reserveMax, this.reserve + CFG.waveAmmo);
      this._spawnSupplies();
      this.ui.banner('WAVE ' + this.wave + ' CLEAR',
        '+' + CFG.waveHeal + ' HP   +' + CFG.waveAmmo + ' ROUNDS · TAKE ONE SUPPLY');
      this.sfx.play('clear');
      this._drop('ammo', p.x - Math.sin(p.yaw) * 2.4, p.z - Math.cos(p.yaw) * 2.4);
      this.breakT = CFG.waveBreak;
    }
  }

  _fx(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.11) * 0.85;
      if (t.life <= 0) { this.scene.remove(t.mesh); this.tracers.splice(i, 1); }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const b = this.particles[i];
      b.t += dt;
      b.vy -= 12 * dt;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
      if (b.mesh.position.y < 0.03) { b.mesh.position.y = 0.03; b.vy = 0; b.vx *= 0.6; b.vz *= 0.6; }
      b.mesh.scale.setScalar(Math.max(0.15, 1 - b.t / b.life));
      if (b.t >= b.life) { this.scene.remove(b.mesh); this.particles.splice(i, 1); }
    }
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 40);
    this.recoil = Math.max(0, this.recoil - dt * 15);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.6);
  }

  _pose() {
    const p = this.player;
    this.avatar.position.set(p.x, p.y, p.z);
    this.avatar.rotation.y = p.yaw;
    const swing = Math.sin(p.walk) * 0.62 * p.bob;
    this.rig.legL.rotation.x = swing;
    this.rig.legR.rotation.x = -swing;
    this.rig.armL.rotation.x = -1.15 + swing * 0.1;
    this.rig.armR.rotation.x = -1.15 - swing * 0.1;
    this.rig.gun.position.z = -0.42 + this.recoil * 0.07;
    this.rig.gun.rotation.x = this.recoil * 0.12;
    this.rig.shadow.position.y = 0.02 - p.y;

    const cam = this.camera;
    const fwdX = -Math.sin(p.yaw), fwdZ = -Math.cos(p.yaw);
    const rightX = Math.cos(p.yaw), rightZ = -Math.sin(p.yaw);
    const shx = (Math.random() - 0.5) * this.shake * 2.6;
    const shy = (Math.random() - 0.5) * this.shake * 2.6;
    cam.position.set(
      p.x - fwdX * CFG.camBack + rightX * CFG.camRight + shx,
      CFG.camUp + p.y * 0.55 + shy,
      p.z - fwdZ * CFG.camBack + rightZ * CFG.camRight
    );
    const tx = p.x + fwdX * CFG.camPush + rightX * (CFG.camRight * 0.55);
    const tz = p.z + fwdZ * CFG.camPush + rightZ * (CFG.camRight * 0.55);
    const ty = CFG.camUp + p.y * 0.55 + Math.sin(p.pitch) * CFG.camPush;
    cam.lookAt(tx, ty, tz);
  }

  snapshot() {
    return {
      wave: this.wave, hp: Math.round(this.hp), mag: this.mag, reserve: this.reserve,
      ammo: this.mag + this.reserve, kills: this.kills, alive: this.aliveCount(),
      waveTotal: this.waveTotal, reloading: this.reloading, best: this.best,
      bestWave: this.bestWave, chain: Math.round(this.chain * 10) / 10,
      chainBest: Math.round(this.chainBest * 10) / 10,
      pierce: this.chain >= CFG.pierceAt,
      wardens: this.zombies.filter(function (z) { return z.type === 'warden' && z.state !== 'dying'; }).length,
      yaw: Math.round(this.player.yaw * 1000) / 1000,
      pitch: Math.round(this.player.pitch * 1000) / 1000,
      device: this.input.device
    };
  }


}
