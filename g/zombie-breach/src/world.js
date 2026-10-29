/* ZOMBIE BREACH — the compound: lights, ground, fence, cover, and the two humanoid builders. */
import * as THREE from 'three';
import { CFG } from './config.js';

/* Shared geometry so a wave of 14 zombies is cheap. */
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CIRCLE = new THREE.CircleGeometry(1, 18);

function mat(color, opts) {
  const o = { color: color };
  if (opts) {
    if (opts.map !== undefined) o.map = opts.map;
    if (opts.emissive !== undefined) o.emissive = opts.emissive;
    if (opts.emissiveIntensity !== undefined) o.emissiveIntensity = opts.emissiveIntensity;
    if (opts.transparent !== undefined) o.transparent = opts.transparent;
    if (opts.opacity !== undefined) o.opacity = opts.opacity;
  }
  return new THREE.MeshLambertMaterial(o);
}
function box(m, sx, sy, sz, x, y, z, parent) {
  const mesh = new THREE.Mesh(BOX, m);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2f343c';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 22 + Math.random() * 26;
    g.fillStyle = 'rgba(' + v + ',' + (v + 2) + ',' + (v + 5) + ',' + (0.25 + Math.random() * 0.5) + ')';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.strokeStyle = 'rgba(12,14,18,.55)';
  for (let i = 0; i < 16; i++) {
    g.beginPath();
    const x = Math.random() * 256, y = Math.random() * 256;
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x070b14);
  scene.fog = new THREE.Fog(0x070b14, 30, 92);

  scene.add(new THREE.HemisphereLight(0x9db4e6, 0x1e2018, 2.05));
  const moonLight = new THREE.DirectionalLight(0xc3d2ff, 2.9);
  moonLight.position.set(-38, 52, -26);
  scene.add(moonLight);

  // sky dome: a vertical gradient instead of a flat black void
  const skyC = document.createElement('canvas');
  skyC.width = 8; skyC.height = 256;
  const sg = skyC.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#05070e');
  grad.addColorStop(0.55, '#0d1626');
  grad.addColorStop(0.82, '#233350');
  grad.addColorStop(1, '#2c3d5a');
  sg.fillStyle = grad; sg.fillRect(0, 0, 8, 256);
  const skyTex = new THREE.CanvasTexture(skyC);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 20, 14),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);

  // moon + stars: depth, no cost
  const moon = new THREE.Mesh(new THREE.SphereGeometry(5.5, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xdfe6ff }));
  moon.position.set(-62, 62, -94);
  scene.add(moon);
  const starPos = [];
  for (let i = 0; i < 380; i++) {
    const a = Math.random() * Math.PI * 2, r = 110 + Math.random() * 20;
    starPos.push(Math.cos(a) * r, 18 + Math.random() * 70, Math.sin(a) * r);
  }
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x9fb6e6, size: 0.5, sizeAttenuation: true })));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(CFG.worldR * 2, CFG.worldR * 2),
    mat(0xffffff, { map: groundTexture(), roughness: 0.96, metalness: 0.02 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // chain-link fence: instanced posts + two rails per side
  const postGeo = new THREE.BoxGeometry(0.18, 2.7, 0.18);
  const postMat = mat(0x39414e, { metalness: 0.55, roughness: 0.5 });
  const perSide = 15;
  const posts = new THREE.InstancedMesh(postGeo, postMat, perSide * 4);
  const m4 = new THREE.Matrix4();
  let n = 0;
  const step = (CFG.worldR * 2) / perSide;
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < perSide; i++) {
      const p = -CFG.worldR + i * step + step / 2;
      if (s === 0) m4.makeTranslation(p, 1.35, CFG.worldR);
      else if (s === 1) m4.makeTranslation(p, 1.35, -CFG.worldR);
      else if (s === 2) m4.makeTranslation(CFG.worldR, 1.35, p);
      else m4.makeTranslation(-CFG.worldR, 1.35, p);
      posts.setMatrixAt(n++, m4);
    }
  }
  scene.add(posts);
  const railMat = mat(0x2e3742, { metalness: 0.6, roughness: 0.45, transparent: true, opacity: 0.72 });
  for (let s = 0; s < 4; s++) {
    for (let h = 0; h < 2; h++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(CFG.worldR * 2, 0.07, 0.07), railMat);
      rail.position.y = 0.9 + h * 1.1;
      if (s === 0) rail.position.z = CFG.worldR;
      else if (s === 1) rail.position.z = -CFG.worldR;
      else if (s === 2) { rail.position.x = CFG.worldR; rail.rotation.y = Math.PI / 2; }
      else { rail.position.x = -CFG.worldR; rail.rotation.y = Math.PI / 2; }
      scene.add(rail);
    }
  }

  // cover crates
  const crateMat = mat(0x6d4a2c, { roughness: 0.9 });
  const crateTop = mat(0x8a5f37, { roughness: 0.9 });
  CFG.crates.forEach(function (c) {
    const g = new THREE.Group();
    box(crateMat, 2.5, 2.5, 2.5, 0, 1.25, 0, g);
    box(crateTop, 2.56, 0.14, 2.56, 0, 2.55, 0, g);
    g.position.set(c[0], 0, c[1]);
    g.rotation.y = c[2] || 0;
    scene.add(g);
  });

  // burning barrels: the only warm light in the yard
  const barrels = [[-16, 6], [13, 9], [3, -17], [-9, -9]];
  const barrelMat = mat(0x5b2c22, { metalness: 0.4, roughness: 0.6 });
  barrels.forEach(function (b, bi) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 1.15, 12), barrelMat);
    drum.position.set(b[0], 0.58, b[1]);
    scene.add(drum);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 8),
      new THREE.MeshBasicMaterial({ color: 0xffa53d, transparent: true, opacity: 0.9 }));
    flame.position.set(b[0], 1.32, b[1]);
    scene.add(flame);
    if (bi < 2) {
      const light = new THREE.PointLight(0xff9a3c, 7, 17, 2);
      light.position.set(b[0], 1.6, b[1]);
      scene.add(light);
      light.userData.flame = flame;
      (scene.userData.fires = scene.userData.fires || []).push(light);
    }
  });

  return { ground: ground };
}

/* ---------------- survivor ---------------- */
export function makeSurvivor() {
  const g = new THREE.Group();
  const jacket = mat(0x2f6bd8, { roughness: 0.62 });
  const pants = mat(0x232c42, { roughness: 0.8 });
  const skin = mat(0xd7a071, { roughness: 0.7 });
  const gear = mat(0x1b2a44, { roughness: 0.55, metalness: 0.25 });

  box(jacket, 0.64, 0.8, 0.36, 0, 1.2, 0, g);
  box(pants, 0.58, 0.26, 0.34, 0, 0.8, 0, g);
  box(gear, 0.4, 0.44, 0.2, 0, 1.24, 0.26, g);         // back pack
  const head = box(skin, 0.3, 0.3, 0.3, 0, 1.74, 0, g);
  box(gear, 0.34, 0.16, 0.36, 0, 1.88, 0, g);          // helmet

  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.16, 0.7, 0); legR.position.set(0.16, 0.7, 0);
  box(pants, 0.2, 0.64, 0.22, 0, -0.32, 0, legL);
  box(pants, 0.2, 0.64, 0.22, 0, -0.32, 0, legR);
  g.add(legL, legR);

  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.4, 1.5, 0); armR.position.set(0.4, 1.5, 0);
  box(jacket, 0.15, 0.6, 0.18, 0, -0.28, 0, armL);
  box(jacket, 0.15, 0.6, 0.18, 0, -0.28, 0, armR);
  box(skin, 0.13, 0.13, 0.13, 0, -0.62, 0, armL);
  box(skin, 0.13, 0.13, 0.13, 0, -0.62, 0, armR);
  armL.rotation.x = -1.15; armR.rotation.x = -1.15;
  g.add(armL, armR);

  const gun = new THREE.Group();
  box(mat(0x1d1f24, { metalness: 0.7, roughness: 0.35 }), 0.11, 0.13, 0.86, 0, 0, 0, gun);
  box(mat(0x30343c, { metalness: 0.5 }), 0.08, 0.2, 0.12, 0, -0.12, 0.16, gun);
  gun.position.set(0.24, 1.28, -0.42);
  g.add(gun);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.52);
  gun.add(muzzle);

  const shadow = new THREE.Mesh(CIRCLE, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.scale.setScalar(0.7); shadow.position.y = 0.02;
  g.add(shadow);

  return { group: g, refs: { legL, legR, armL, armR, gun, muzzle, head, shadow } };
}

/* ---------------- zombies: walker / runner / brute / spitter / warden ---------------- */
export function makeZombie(type) {
  const g = new THREE.Group();
  const cfg = CFG[type] || CFG.walker;
  const skinBase = type === 'runner' ? 0x7fa64c
    : (type === 'brute' ? 0x4f7c46
    : (type === 'warden' ? 0x4c6048
    : (type === 'spitter' ? 0x93a83c : 0x66924f)));
  const bodyMat = mat(skinBase, { roughness: 0.92, emissive: 0x101a08, emissiveIntensity: 0.4 });
  const headMat = bodyMat.clone();
  const ragMat = mat(type === 'brute' ? 0x2c2420 : (type === 'warden' ? 0x211d1a : (type === 'spitter' ? 0x3b3a20 : 0x39432e)), { roughness: 1 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: type === 'runner' ? 0xd8ff5e : (type === 'warden' ? 0xff5c3d : (type === 'spitter' ? 0xffb347 : 0x9dff4a)) });

  const torso = box(bodyMat, 0.64, 0.82, 0.38, 0, 1.18, 0, g);
  torso.rotation.x = type === 'spitter' ? 0.55 : 0.28;   // hunched over the sac
  box(ragMat, 0.7, 0.4, 0.4, 0, 0.92, 0.02, g);
  const head = box(headMat, 0.32, 0.32, 0.32, 0, 1.68, 0.06, g);
  head.rotation.x = 0.2;
  box(eyeMat, 0.07, 0.05, 0.02, -0.08, 1.72, -0.19, g);
  box(eyeMat, 0.07, 0.05, 0.02, 0.08, 1.72, -0.19, g);
  let sac = null;
  if (type === 'brute') {
    box(bodyMat, 0.34, 0.3, 0.34, -0.34, 1.5, 0, g);
    box(bodyMat, 0.34, 0.3, 0.34, 0.34, 1.5, 0, g);
  }
  if (type === 'spitter') {
    // a swollen acid sac on the back: the thing the player learns to spot first
    const sacMat = mat(0xa9c94a, { emissive: 0x365c10, emissiveIntensity: 0.7 });
    sac = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), sacMat);
    sac.position.set(0, 1.52, 0.23);
    sac.scale.set(1, 1.18, 0.94);
    g.add(sac);
  }
  if (type === 'warden') {
    // a plate you can see from across the yard: this one is the wave's named threat
    const plateMat = mat(0x8a2f24, { emissive: 0x3a0f08, emissiveIntensity: 0.8, roughness: 0.55 });
    box(plateMat, 0.78, 0.66, 0.1, 0, 1.2, -0.2, g);
    box(plateMat, 0.5, 0.2, 0.24, -0.44, 1.56, 0, g);
    box(plateMat, 0.5, 0.2, 0.24, 0.44, 1.56, 0, g);
    box(plateMat, 0.36, 0.12, 0.36, 0, 1.84, 0.04, g);
  }

  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.17, 0.72, 0); legR.position.set(0.17, 0.72, 0);
  box(ragMat, 0.2, 0.72, 0.22, 0, -0.36, 0, legL);
  box(ragMat, 0.2, 0.72, 0.22, 0, -0.36, 0, legR);
  g.add(legL, legR);

  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.42, 1.5, 0.05); armR.position.set(0.42, 1.5, 0.05);
  const armLen = type === 'spitter' ? 0.82 : 0.68;   // it throws, it does not grab
  box(bodyMat, 0.16, armLen, 0.18, 0, -0.3, 0, armL);
  box(bodyMat, 0.16, armLen, 0.18, 0, -0.3, 0, armR);
  armL.rotation.x = -1.45; armR.rotation.x = -1.45;
  g.add(armL, armR);

  const shadow = new THREE.Mesh(CIRCLE, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.scale.setScalar(0.72); shadow.position.y = 0.02;
  g.add(shadow);

  g.scale.setScalar(cfg.scale);
  return { group: g, refs: { legL, legR, armL, armR, torso, head, sac, bodyMat, headMat, eyeMat, shadow } };
}

export function makePickup(kind) {
  const g = new THREE.Group();
  if (kind === 'health') {
    const m = mat(0x1fbf5a, { emissive: 0x0d6b33, emissiveIntensity: 0.9, roughness: 0.4 });
    box(m, 0.5, 0.16, 0.16, 0, 0, 0, g);
    box(m, 0.16, 0.5, 0.16, 0, 0, 0, g);
    box(m, 0.16, 0.16, 0.5, 0, 0, 0, g);
  } else {
    const m = mat(0xd79b2a, { emissive: 0x8a5a10, emissiveIntensity: 0.8, roughness: 0.5 });
    box(m, 0.52, 0.34, 0.36, 0, 0, 0, g);
    box(mat(0xffe6a0, { emissive: 0xffc860, emissiveIntensity: 1.1 }), 0.54, 0.07, 0.38, 0, 0.12, 0, g);
  }
  return g;
}

export function makeTracer(color) {
  return new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1),
    new THREE.MeshBasicMaterial({ color: color || 0xffe6a0, transparent: true, opacity: 0.85, depthWrite: false }));
}

/* ---------------- supply crates: the choice a cleared wave hands you ---------------- */
const SUPPLY_COLOR = { ammo: 0xffc84a, health: 0x4dff9a, power: 0xff7a45 };

function labelSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 128);
  g.font = '700 62px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(3,8,10,.62)';
  g.fillRect(8, 22, 496, 84);
  g.fillStyle = color;
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(2.4, 0.6, 1);
  return spr;
}

export function makeSupply(kind) {
  const g = new THREE.Group();
  const color = SUPPLY_COLOR[kind] || 0xffc84a;
  const crateMat = mat(0x2a2f26, { emissive: color, emissiveIntensity: 0.12 });
  const glowMat = mat(color, { emissive: color, emissiveIntensity: 1.2 });
  box(crateMat, 0.86, 0.7, 0.86, 0, 0.35, 0, g);
  if (kind === 'health') {
    box(glowMat, 0.5, 0.16, 0.16, 0, 0.78, 0, g);
    box(glowMat, 0.16, 0.5, 0.16, 0, 0.78, 0, g);
  } else if (kind === 'ammo') {
    for (let i = -1; i <= 1; i++) box(glowMat, 0.11, 0.4, 0.11, i * 0.18, 0.8, 0, g);
    box(glowMat, 0.6, 0.07, 0.3, 0, 0.58, 0, g);
  } else {
    // a lightning bolt: two offset slabs
    const a = box(glowMat, 0.16, 0.44, 0.14, -0.06, 0.85, 0, g); a.rotation.z = 0.42;
    const b = box(glowMat, 0.16, 0.32, 0.14, 0.1, 0.62, 0, g); b.rotation.z = 0.42;
  }
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 3.4, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
  pillar.position.y = 1.7;
  g.add(pillar);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.84, 22),
    new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.035;
  g.add(ring);
  const label = labelSprite(kind === 'health' ? 'MEDKIT' : kind.toUpperCase(), '#' + color.toString(16).padStart(6, '0'));
  label.position.y = 2.55;    // above the survivor's head so the third-person camera cannot hide it
  g.add(label);
  return { group: g, pillar: pillar, ring: ring, label: label };
}

export function makeSpit() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xc8ff5a }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x8dff3a, transparent: true, opacity: 0.24, depthWrite: false }));
  m.add(halo);
  return m;
}

/* The landing mark is the honest preview: the acid lands where the ring is. */
export function makeSpitMark() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24),
    new THREE.MeshBasicMaterial({ color: 0x9dff4a, transparent: true, opacity: 0.2, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  g.add(disc);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 1.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xd8ff3d, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  g.add(ring);
  g.position.y = 0.04;
  g.visible = false;
  g.userData.ring = ring;
  g.userData.disc = disc;
  return g;
}
