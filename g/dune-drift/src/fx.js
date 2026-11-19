// Particles: dust, sparks, smoke, speed motes. One additive Points pool.
import * as THREE from 'three';

const MAX = 900;

export class FX {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.parts = [];
    for (let i = 0; i < MAX; i++) this.parts.push({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 1, g: 1, b: 1, grav: 0, drag: 0.9, grow: 0 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const tex = glowTex();
    this.mat = new THREE.PointsMaterial({
      size: 0.62, map: tex, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.95
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
    this._c = new THREE.Color();
  }

  _spawn(x, y, z, vx, vy, vz, life, colour, grav, drag) {
    let p = null;
    for (let i = 0; i < MAX; i++) {
      const j = (this.cursor + i) % MAX;
      if (!this.parts[j].live) { p = this.parts[j]; this.cursor = (j + 1) % MAX; break; }
    }
    if (!p) return;
    p.live = true; p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = p.max = life;
    this._c.set(colour);
    p.r = this._c.r; p.g = this._c.g; p.b = this._c.b;
    p.grav = grav; p.drag = drag;
  }

  dust(x, y, z, n, colour, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * power;
      this._spawn(x + (Math.random() - 0.5) * 1.6, y + Math.random() * 0.5, z + (Math.random() - 0.5) * 1.6,
        Math.cos(a) * s, 1.2 + Math.random() * power * 0.6, Math.sin(a) * s,
        0.5 + Math.random() * 0.55, colour, -1.6, 0.86);
    }
  }

  sparks(x, y, z, n, colour, dirx, dirz) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 9;
      this._spawn(x, y, z,
        Math.cos(a) * s + (dirx || 0) * 4, 1 + Math.random() * 5, Math.sin(a) * s + (dirz || 0) * 4,
        0.25 + Math.random() * 0.4, colour, -14, 0.94);
    }
  }

  smoke(x, y, z, n, colour) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this._spawn(x + (Math.random() - 0.5), y + Math.random() * 0.6, z + (Math.random() - 0.5),
        Math.cos(a) * 1.5, 2 + Math.random() * 2, Math.sin(a) * 1.5,
        0.7 + Math.random() * 0.6, colour, 1.2, 0.9);
    }
  }

  speedMotes(camPos, fwd, speed, dt, colour) {
    if (speed < 24) return;
    const n = Math.min(4, Math.floor((speed - 20) / 8));
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const r = 5 + Math.random() * 12;
      const f = 18 + Math.random() * 26;
      const x = camPos.x + fwd.x * f + side * (Math.random() * 10 + 4);
      const y = camPos.y + (Math.random() - 0.5) * 9;
      const z = camPos.z + fwd.z * f + side * (Math.random() * 10 + 4);
      this._spawn(x, y, z, -fwd.x * speed * 1.4, 0, -fwd.z * speed * 1.4, 0.35, colour, 0, 1);
    }
  }

  update(dt) {
    const pos = this.pos, col = this.col;
    for (let i = 0; i < MAX; i++) {
      const p = this.parts[i];
      const i3 = i * 3;
      if (!p.live) { col[i3] = col[i3 + 1] = col[i3 + 2] = 0; pos[i3 + 1] = -999; continue; }
      p.life -= dt;
      if (p.life <= 0) { p.live = false; col[i3] = col[i3 + 1] = col[i3 + 2] = 0; pos[i3 + 1] = -999; continue; }
      p.vy += p.grav * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vz *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = Math.max(0, p.life / p.max);
      pos[i3] = p.x; pos[i3 + 1] = p.y; pos[i3 + 2] = p.z;
      col[i3] = p.r * k; col[i3 + 1] = p.g * k; col[i3 + 2] = p.b * k;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  clear() {
    this.parts.forEach((p) => { p.live = false; });
  }
}

function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
