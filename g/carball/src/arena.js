// CARBALL — the pitch: floor, walls, goals, ceiling, boost pads and their colliders.
// Every size comes from src/config.js, which comes from the genre teardown.

import * as THREE from '../lib/three.module.js';
import {
  PITCH_HALF_W, PITCH_HALF_L, WALL_H, GOAL_HALF_W, GOAL_H, GOAL_DEPTH, WALL_T,
  BIG_PADS, SMALL_PADS, COLORS, BALL_RADIUS,
} from './config.js';

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#0a1422';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#17314d';
  g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  g.strokeStyle = '#2b5d8f';
  g.lineWidth = 4;
  for (let i = 0; i <= 512; i += 128) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 10);
  t.anisotropy = 4;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,230,150,0.55)');
  grd.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

function staticBox(world, RAPIER, x, y, z, hx, hy, hz, opts = {}) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setRestitution(opts.restitution ?? 0.45)
      .setFriction(opts.friction ?? 0.35),
    body,
  );
  return body;
}

export function buildArena(scene, world, RAPIER) {
  const group = new THREE.Group();
  scene.add(group);
  const W = PITCH_HALF_W, L = PITCH_HALF_L;
  const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.75, metalness: 0.35 });
  const trimBlue = new THREE.MeshStandardMaterial({ color: 0x0a1c33, emissive: COLORS.blueGlow, emissiveIntensity: 1.6 });
  const trimOrange = new THREE.MeshStandardMaterial({ color: 0x2a1406, emissive: COLORS.orangeGlow, emissiveIntensity: 1.6 });
  const whiteGlow = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfefff, emissiveIntensity: 2.2 });

  // ── floor ────────────────────────────────────────────────────────────────
  const floorMat = new THREE.MeshStandardMaterial({
    map: gridTexture(), color: 0xc2dcff, roughness: 0.45, metalness: 0.28,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, L * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  group.add(floor);
  staticBox(world, RAPIER, 0, -0.5, 0, W + 1, 0.5, L + 1, { friction: 0.9, restitution: 0.05 });

  // team halves: a faint wash of blue and orange
  for (const [sz, col] of [[-1, COLORS.blue], [1, COLORS.orange]]) {
    const half = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 2, L),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.055, depthWrite: false }),
    );
    half.rotation.x = -Math.PI / 2;
    half.position.set(0, 0.012, sz * L / 2);
    group.add(half);
  }

  // halfway line + centre circle
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55 });
  const mid = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.02, 0.16), lineMat);
  mid.position.y = 0.02;
  group.add(mid);
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.9, 7.15, 72), lineMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: 0x2b5d8f, transparent: true, opacity: 0.35 }));
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.021;
  group.add(spot);

  // mown stripes: ten bands along the pitch, alternating a touch lighter. A flat grid
  // read as a prototype; stripes read as a pitch.
  for (let i = 0; i < 10; i++) {
    if (i % 2) continue;
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 2, (L * 2) / 10),
      new THREE.MeshBasicMaterial({ color: 0x8fb8e6, transparent: true, opacity: 0.045, depthWrite: false }),
    );
    band.rotation.x = -Math.PI / 2;
    band.position.set(0, 0.008, -L + (i + 0.5) * (L * 2) / 10);
    group.add(band);
  }

  // goal boxes painted in front of each goal: a U of lines, the way the real pitch marks it
  for (const sz of [-1, 1]) {
    const boxW = GOAL_HALF_W + 6.5, boxD = 8.5;
    const zLine = sz * (L - boxD);
    const front = new THREE.Mesh(new THREE.BoxGeometry(boxW * 2, 0.02, 0.14), lineMat);
    front.position.set(0, 0.022, zLine);
    group.add(front);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, boxD), lineMat);
      side.position.set(sx * boxW, 0.022, sz * (L - boxD / 2));
      group.add(side);
    }
    // penalty spot
    const pen = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), lineMat);
    pen.rotation.x = -Math.PI / 2;
    pen.position.set(0, 0.023, sz * (L - boxD - 3.2));
    group.add(pen);
  }

  // crowd stand: a dotted band texture along both side walls. A ring of Points read as
  // blocky squares; a dense texture reads as a stand full of people from the chase camera.
  {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#060b14';
    g.fillRect(0, 0, 1024, 64);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 1024;
      const y = 8 + Math.random() * 50;
      const t = x / 1024;
      const r = 1.1 + Math.random() * 1.5;
      const blue = t < 0.5;
      const a = 0.35 + Math.random() * 0.55;
      g.fillStyle = blue
        ? `rgba(${90 + Math.random() * 80},${170 + Math.random() * 60},255,${a})`
        : `rgba(255,${140 + Math.random() * 70},${60 + Math.random() * 50},${a})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(6, 1);
    const bandMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9 });
    for (const sx of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, 4.6), bandMat);
      band.position.set(sx * (W - 0.03), WALL_H * 0.36, 0);
      band.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(band);
      // LED board under the stand
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.5, L * 2),
        new THREE.MeshBasicMaterial({ color: sx > 0 ? COLORS.orangeGlow : COLORS.blueGlow }),
      );
      led.position.set(sx * (W - 0.04), WALL_H * 0.36 - 2.6, 0);
      group.add(led);
    }
  }

  // ── side walls (x = ±W) ─────────────────────────────────────────────────
  for (const sx of [-1, 1]) {
    const wall = box(WALL_T, WALL_H, L * 2 + WALL_T * 2, wallMat);
    wall.position.set(sx * (W + WALL_T / 2), WALL_H / 2, 0);
    group.add(wall);
    staticBox(world, RAPIER, sx * (W + WALL_T / 2), WALL_H / 2, 0, WALL_T / 2, WALL_H / 2, L + WALL_T);

    // glowing trim near the top, team colour on each half
    for (const [sz, mat] of [[-1, trimBlue], [1, trimOrange]]) {
      const trim = box(0.08, 0.16, L, mat);
      trim.position.set(sx * (W - 0.06), WALL_H - 1.1, sz * L / 2);
      group.add(trim);
      const band = box(0.06, 0.10, L, mat);
      band.position.set(sx * (W - 0.05), WALL_H * 0.46, sz * L / 2);
      group.add(band);
      for (let i = 0; i < 4; i++) {
        const post = box(0.07, WALL_H * 0.8, 0.12, mat);
        post.position.set(sx * (W - 0.05), WALL_H * 0.45, sz * (L * (0.14 + i * 0.24)));
        group.add(post);
      }
    }
  }

  // ── back walls (z = ±L) with a goal mouth cut out ───────────────────────
  const postW = W - GOAL_HALF_W;
  for (const sz of [-1, 1]) {
    const zc = sz * (L + WALL_T / 2);
    const mat = sz < 0 ? trimBlue : trimOrange;
    for (const sx of [-1, 1]) {
      const wall = box(postW, WALL_H, WALL_T, wallMat);
      wall.position.set(sx * (GOAL_HALF_W + postW / 2), WALL_H / 2, zc);
      group.add(wall);
      staticBox(world, RAPIER, sx * (GOAL_HALF_W + postW / 2), WALL_H / 2, zc, postW / 2, WALL_H / 2, WALL_T / 2);
      const trim = box(0.16, WALL_H - 1.0, 0.10, mat);
      trim.position.set(sx * (GOAL_HALF_W + 0.55), WALL_H / 2, zc - sz * 0.32);
      group.add(trim);
    }
    const lintelH = WALL_H - GOAL_H;
    const lintel = box(GOAL_HALF_W * 2, lintelH, WALL_T, wallMat);
    lintel.position.set(0, GOAL_H + lintelH / 2, zc);
    group.add(lintel);
    staticBox(world, RAPIER, 0, GOAL_H + lintelH / 2, zc, GOAL_HALF_W, lintelH / 2, WALL_T / 2);
    const lintelTrim = box(GOAL_HALF_W * 2 + 0.2, 0.14, 0.10, mat);
    lintelTrim.position.set(0, GOAL_H + 0.15, zc - sz * 0.32);
    group.add(lintelTrim);

    // goal box: back wall, side walls, roof, and a floor (the pitch ends at the line)
    const backZ = sz * (L + GOAL_DEPTH);
    staticBox(world, RAPIER, 0, GOAL_H / 2, backZ, GOAL_HALF_W, GOAL_H / 2, 0.35, { restitution: 0.25 });
    staticBox(world, RAPIER, 0, -0.5, sz * (L + GOAL_DEPTH / 2), GOAL_HALF_W, 0.5, GOAL_DEPTH / 2, { friction: 0.9, restitution: 0.05 });
    const gfloor = new THREE.Mesh(
      new THREE.PlaneGeometry(GOAL_HALF_W * 2, GOAL_DEPTH),
      new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.9, metalness: 0.2 }),
    );
    gfloor.rotation.x = -Math.PI / 2;
    gfloor.position.set(0, 0.004, sz * (L + GOAL_DEPTH / 2));
    group.add(gfloor);
    staticBox(world, RAPIER, 0, GOAL_H + 0.25, sz * (L + GOAL_DEPTH / 2), GOAL_HALF_W, 0.25, GOAL_DEPTH / 2, { restitution: 0.25 });
    for (const sx of [-1, 1]) {
      staticBox(world, RAPIER, sx * (GOAL_HALF_W + 0.3), GOAL_H / 2, sz * (L + GOAL_DEPTH / 2), 0.3, GOAL_H / 2, GOAL_DEPTH / 2, { restitution: 0.25 });
      const side = box(0.1, GOAL_H, GOAL_DEPTH, mat);
      side.position.set(sx * (GOAL_HALF_W + 0.05), GOAL_H / 2, sz * (L + GOAL_DEPTH / 2));
      group.add(side);
    }

    // goal frame: posts + crossbar, white-hot
    for (const sx of [-1, 1]) {
      const post = box(0.26, GOAL_H, 0.26, whiteGlow);
      post.position.set(sx * GOAL_HALF_W, GOAL_H / 2, sz * L);
      group.add(post);
    }
    const bar = box(GOAL_HALF_W * 2 + 0.26, 0.26, 0.26, whiteGlow);
    bar.position.set(0, GOAL_H, sz * L);
    group.add(bar);

    // net: a grid of lines inside the goal box
    const pts = [];
    const nz = sz * (L + GOAL_DEPTH);
    for (let i = 0; i <= 8; i++) {
      const x = -GOAL_HALF_W + (i / 8) * GOAL_HALF_W * 2;
      pts.push(x, 0.05, nz, x, GOAL_H, nz);
      pts.push(x, 0.05, sz * L, x, 0.05, nz);
      pts.push(x, GOAL_H, sz * L, x, GOAL_H, nz);
    }
    for (let i = 0; i <= 6; i++) {
      const y = (i / 6) * GOAL_H;
      pts.push(-GOAL_HALF_W, y, nz, GOAL_HALF_W, y, nz);
      pts.push(-GOAL_HALF_W, y, sz * L, -GOAL_HALF_W, y, nz);
      pts.push(GOAL_HALF_W, y, sz * L, GOAL_HALF_W, y, nz);
    }
    const netGeo = new THREE.BufferGeometry();
    netGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: sz < 0 ? COLORS.blueGlow : COLORS.orangeGlow, transparent: true, opacity: 0.62 })));

    // goal mouth glow
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(GOAL_HALF_W * 2, GOAL_H),
      new THREE.MeshBasicMaterial({ color: sz < 0 ? COLORS.blue : COLORS.orange, transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.position.set(0, GOAL_H / 2, sz * (L - 0.02));
    group.add(glow);
  }

  // ── ceiling ──────────────────────────────────────────────────────────────
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 2, L * 2),
    new THREE.MeshStandardMaterial({ color: 0x060b14, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = WALL_H;
  group.add(ceil);
  staticBox(world, RAPIER, 0, WALL_H + 0.5, 0, W + 1, 0.5, L + 1, { restitution: 0.45 });
  for (const sz of [-1, 1]) {
    const strip = box(3.2, 0.06, L * 1.7, new THREE.MeshBasicMaterial({ color: sz < 0 ? 0x2c74c8 : 0xc86a2c }));
    strip.position.set(sz * 18, WALL_H - 0.08, 0);
    group.add(strip);
  }

  // ── boost pads ───────────────────────────────────────────────────────────
  const glowTex = glowTexture();
  const pads = [];
  const smallGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.06, 16);
  const bigGeo = new THREE.CylinderGeometry(1.12, 1.12, 0.08, 24);
  const smallMat = new THREE.MeshStandardMaterial({ color: 0x4a3606, emissive: 0xffd166, emissiveIntensity: 1.5, roughness: 0.4 });
  const bigMat = new THREE.MeshStandardMaterial({ color: 0x4a3606, emissive: 0xffb020, emissiveIntensity: 2.0, roughness: 0.35 });

  function addPad(x, z, big) {
    const mesh = new THREE.Mesh(big ? bigGeo : smallGeo, big ? bigMat : smallMat);
    mesh.position.set(x, 0.06, z);
    group.add(mesh);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffcc66, transparent: true, opacity: big ? 0.9 : 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.scale.setScalar(big ? 4.2 : 2.2);
    sprite.position.set(x, 0.5, z);
    group.add(sprite);
    if (big) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.07, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffc247, transparent: true, opacity: 0.7 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.05, z);
      group.add(ring);
      mesh.userData.ring = ring;
    }
    pads.push({ x, z, big, active: true, timer: 0, mesh, sprite, phase: Math.random() * Math.PI * 2 });
  }
  for (const [x, z] of BIG_PADS) addPad(x, z, true);
  for (const [x, z] of SMALL_PADS) addPad(x, z, false);

  return { group, pads, floorY: 0, ballRadius: BALL_RADIUS };
}

export function animatePads(pads, dt, t) {
  for (const p of pads) {
    if (p.active) {
      const bob = Math.sin(t * 2.2 + p.phase) * 0.04;
      p.mesh.position.y = 0.06 + bob;
      p.sprite.position.y = 0.55 + bob;
      p.mesh.rotation.y += dt * (p.big ? 0.8 : 1.6);
      p.sprite.material.opacity = (p.big ? 0.9 : 0.55) * (0.82 + 0.18 * Math.sin(t * 4 + p.phase));
    }
  }
}

export function setPadActive(pad, on) {
  pad.active = on;
  pad.mesh.visible = on;
  pad.sprite.visible = on;
  if (pad.mesh.userData.ring) pad.mesh.userData.ring.visible = on;
}
