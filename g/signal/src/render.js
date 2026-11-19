// SIGNAL — Three.js vector tunnel. Thin neon lines on void; depth does the work.
import * as THREE from 'three';
import { CONFIG, targetY } from './rules.js';

const NEON = 0x4de2ff;
const HOT = 0xff2d78;
const GOLD = 0xffd166;

export function createRenderer(container) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060c, 0.0125);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
  camera.position.set(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x05060c, 1);
  container.appendChild(renderer.domElement);

  // ── tunnel: rings of lines that recycle toward the camera ────────────────
  const RING_COUNT = 34;
  const RING_SPACING = 9;
  const TUNNEL_R = 9.5;
  const SIDES = 8;
  // Per-ring materials so depth reads: near rings bright, far rings fade.
  const rings = [];
  const ringGroup = new THREE.Group();
  scene.add(ringGroup);

  for (let i = 0; i < RING_COUNT; i++) {
    const pts = [];
    for (let s = 0; s <= SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * TUNNEL_R, Math.sin(a) * TUNNEL_R, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const near = i / RING_COUNT;                 // 0 = nearest
    const op = 0.03 + 0.17 * Math.pow(1 - near, 1.8);
    const ring = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: i % 4 === 0 ? 0x2f9fc4 : NEON, transparent: true, opacity: op,
    }));
    ring.position.z = -i * RING_SPACING;
    ringGroup.add(ring);
    rings.push(ring);
  }

  // rails: the four long lines you ride between
  const railPts = [];
  for (let s = 0; s < SIDES; s += 2) {
    const a = (s / SIDES) * Math.PI * 2;
    railPts.push(new THREE.Vector3(Math.cos(a) * TUNNEL_R, Math.sin(a) * TUNNEL_R, 0));
    railPts.push(new THREE.Vector3(Math.cos(a) * TUNNEL_R, Math.sin(a) * TUNNEL_R, -RING_COUNT * RING_SPACING));
  }
  const railGeo = new THREE.BufferGeometry().setFromPoints(railPts);
  scene.add(new THREE.LineSegments(railGeo, new THREE.LineBasicMaterial({ color: NEON, transparent: true, opacity: 0.055 })));

  // ── star/dust points for speed cues ─────────────────────────────────────
  const DUST = 420;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 7;
    dustPos[i * 3] = Math.cos(a) * r;
    dustPos[i * 3 + 1] = Math.sin(a) * r;
    dustPos[i * 3 + 2] = -Math.random() * 260;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x9fe9ff, size: 0.05, transparent: true, opacity: 0.22 }));
  scene.add(dust);


  // ── floor grid: the strongest speed cue. Long lines that stream under the
  //    camera, fading with distance. Cheap (one LineSegments) and reads instantly.
  const GRID_Z = 220, GRID_STEP = 8, GRID_X = 9.0, GRID_Y = -6.5;
  const gpts = [];
  for (let z = 0; z <= GRID_Z; z += GRID_STEP) {
    gpts.push(new THREE.Vector3(-GRID_X, GRID_Y, -z), new THREE.Vector3(GRID_X, GRID_Y, -z));
  }
  for (let x = -GRID_X; x <= GRID_X; x += 1.5) {
    gpts.push(new THREE.Vector3(x, GRID_Y, 0), new THREE.Vector3(x, GRID_Y, -GRID_Z));
  }
  const gridGeo = new THREE.BufferGeometry().setFromPoints(gpts);
  const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({
    color: 0x1d6f8f, transparent: true, opacity: 0.30,
  }));
  scene.add(grid);

  // ── player ship: a small vector dart at the bottom centre ───────────────
  const shipPts = [
    [0, 0.42, 0], [-0.34, -0.30, 0], [0.34, -0.30, 0], [0, 0.42, 0],
    [-0.34, -0.30, 0], [0, -0.10, 0], [0.34, -0.30, 0],
    [-0.34, -0.30, 0], [0, 0.42, 0], [0.34, -0.30, 0],
  ].map(p => new THREE.Vector3(...p));
  const ship = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(shipPts),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 })
  );
  ship.position.set(0, -2.15, -5.2);
  ship.scale.setScalar(1.85);
  scene.add(ship);

  // a faint glow disc under the ship so it reads as lit, not just outlined
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 24),
    new THREE.MeshBasicMaterial({ color: 0x000308, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.position.set(0, -2.15, -5.35);
  scene.add(glow);

  // engine trail: two streaks that stretch with speed
  const trailPts = [new THREE.Vector3(-0.16, -0.30, 0), new THREE.Vector3(0.16, -0.30, 0)];
  const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPts);
  const trail = new THREE.LineSegments(trailGeo,
    new THREE.LineBasicMaterial({ color: 0x4de2ff, transparent: true, opacity: 0.75 }));
  trail.position.set(0, -2.15, -5.2);
  scene.add(trail);
  const trailStreaks = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1),
    ]);
    const m = new THREE.Line(g, new THREE.LineBasicMaterial({
      color: i % 3 === 0 ? 0x9fe9ff : 0x4de2ff, transparent: true, opacity: 0.0,
    }));
    scene.add(m);
    trailStreaks.push({ mesh: m, t: i / 14 });
  }

  // ── pools for targets / particles ──────────────────────────────────────
  const targetGeo = {
    drone: new THREE.BufferGeometry().setFromPoints(octaPts(1.55)),
    orb:   new THREE.BufferGeometry().setFromPoints(octaPts(1.15)),
    shard: new THREE.BufferGeometry().setFromPoints(shardPts(1.8)),
  };
  const targetMat = new THREE.LineBasicMaterial({ color: 0xff5c8a, transparent: true, opacity: 1.0 });
  const targetMatLocked = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 1.0 });
  const haloMat = new THREE.LineBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending });
  const haloLockedMat = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.42 });

  const targetMeshes = new Map();   // id -> LineSegments

  const PARTICLE_MAX = 260;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PARTICLE_MAX * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    color: 0xffe3ec, size: 0.42, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  particles.frustumCulled = false;
  scene.add(particles);
  const pState = [];   // {x,y,z,vx,vy,vz,life,max}

  // ── boss ───────────────────────────────────────────────────────────────
  const bossGroup = new THREE.Group();
  const bossCore = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(octaPts(3.4)),
    new THREE.LineBasicMaterial({ color: HOT, transparent: true, opacity: 0.95 })
  );
  bossGroup.add(bossCore);
  const shieldRings = [];
  const bossChargeRing = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 33 }, (_, i) => {
        const a = (i / 32) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0);
      })
    ),
    new THREE.LineBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0 })
  );
  bossChargeRing.visible = false;
  for (let i = 0; i < 3; i++) {
    const pts = [];
    for (let s = 0; s <= 16; s++) {
      const a = (s / 16) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 5.2, Math.sin(a) * 5.2, 0));
    }
    const r = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: NEON, transparent: true, opacity: 0.5 }));
    r.rotation.z = (i / 3) * Math.PI;
    r.position.z = -0.4 - i * 0.5;
    bossGroup.add(r);
    shieldRings.push(r);
  }
  bossGroup.add(bossChargeRing);
  bossGroup.visible = false;
  scene.add(bossGroup);

  // ── resize: real canvas size, any aspect, incl. landscape ──────────────
  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the play field readable on a wide screen: widen the vertical FOV as the
    // viewport gets wider, so targets stay the same apparent size instead of
    // shrinking into the middle of a 16:9 letterbox.
    const wide = Math.max(0, (w / h) - 1.2);
    camera.fov = Math.min(82, 62 + wide * 16);
    camera.updateProjectionMatrix();
    return { w, h };
  }

  function syncTargets(state, aimNdc) {
    const seen = new Set();
    for (const t of state.targets) {
      if (t.dead) continue;
      seen.add(t.id);
      let mesh = targetMeshes.get(t.id);
      if (!mesh) {
        const geo = targetGeo[t.kind] || targetGeo.drone;
        const group = new THREE.Group();
        const core = new THREE.LineSegments(geo, targetMat);
        const halo = new THREE.LineSegments(targetGeo.drone, haloMat);
        halo.scale.setScalar(1.5);
        group.add(core, halo);
        group.userData = { core, halo };
        scene.add(group);
        mesh = group;
        targetMeshes.set(t.id, mesh);
      }
      const { core, halo } = mesh.userData;
      core.material = t.locked ? targetMatLocked : targetMat;
      halo.material = t.locked ? haloLockedMat : haloMat;
      // same function the picker uses, so what you see is what you can hit
      mesh.position.set(t.lane, targetY(t), -t.depth);
      core.rotation.z += 0.02;
      core.rotation.x += 0.013;
      halo.rotation.z -= 0.011;
      // depth cue: distant targets read smaller and dimmer, so approach is felt
      const nearness = 1 - Math.min(1, t.depth / 190);
      const scale = 0.70 + nearness * 1.35;
      const pulse = t.locked ? 1 + Math.sin(state.time * 22) * 0.12 : 1;
      core.scale.setScalar(scale * pulse);
      halo.scale.setScalar(scale * 1.5 * (1 + Math.sin(state.time * 3 + t.id) * 0.08));
    }
    for (const [id, mesh] of targetMeshes) {
      if (!seen.has(id)) {
        scene.remove(mesh);
        targetMeshes.delete(id);
      }
    }
  }

  function burst(x, y, z, n = 14, colorHot = true) {
    for (let i = 0; i < n * 2 && pState.length < PARTICLE_MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2.4 + Math.random() * 6.0;
      pState.push({
        x, y, z,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: (Math.random() - 0.5) * 2,
        life: 0, max: 0.42 + Math.random() * 0.34,
      });
    }
  }

  function tickParticles(dt) {
    const pos = pGeo.attributes.position.array;
    const keep = [];
    for (const p of pState) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 0.94; p.vy *= 0.94;
      keep.push(p);
    }
    pState.length = 0;
    for (let i = 0; i < keep.length && i < PARTICLE_MAX; i++) {
      const p = keep[i];
      pState.push(p);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.setDrawRange(0, pState.length);
  }

  function frame(state, dt, aimNdc) {
    // tunnel rings physically rush the camera and recycle at the far end
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      r.position.z += state.railSpeed * dt * 1.35;
      if (r.position.z > 4) r.position.z -= RING_COUNT * RING_SPACING;
      // brightness follows actual depth, so approach is felt
      const z = -r.position.z;
      const f = Math.max(0, Math.min(1, 1 - z / (RING_COUNT * RING_SPACING)));
      const zc = -r.position.z;
      const shipClear = zc < 12 ? 0.25 : 1.0;   // keep the ship's space clean
      r.material.opacity = (0.03 + 0.30 * Math.pow(f, 1.5)) * shipClear;
    }
    // floor grid streams toward the camera
    grid.position.z += state.railSpeed * dt * 1.35;
    if (grid.position.z > GRID_STEP) grid.position.z -= GRID_STEP;

    // dust streams past
    const dpos = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST; i++) {
      dpos[i * 3 + 2] += state.railSpeed * dt * 1.6;
      if (dpos[i * 3 + 2] > 2) dpos[i * 3 + 2] -= 262;
    }
    dustGeo.attributes.position.needsUpdate = true;

    // ship follows the aim, gently
    if (aimNdc) {
      ship.position.x += (aimNdc.x * 1.9 - ship.position.x) * Math.min(1, dt * 7);
      ship.position.y += (-2.15 + aimNdc.y * 0.40 - ship.position.y) * Math.min(1, dt * 7);
    }
    glow.position.x = ship.position.x;
    glow.position.y = ship.position.y;
    trail.position.x = ship.position.x;
    trail.position.y = ship.position.y;
    const tp = trailGeo.attributes.position.array;
    const stretch = 0.6 + Math.min(1.4, state.railSpeed / 12);
    tp[2] = 0; tp[5] = stretch;              // trail length follows speed
    trailGeo.attributes.position.needsUpdate = true;

    // speed streaks: lines that rush past the ship and fade
    for (const s of trailStreaks) {
      s.t += dt * (0.9 + state.railSpeed * 0.06);
      if (s.t > 1) s.t -= 1;
      const z = -2 - s.t * 26;
      const spread = 0.5 + s.t * 2.6;
      const x = ship.position.x + Math.sin(s.t * 17 + s.mesh.id) * spread;
      const y = ship.position.y + Math.cos(s.t * 13 + s.mesh.id) * spread * 0.7;
      s.mesh.position.set(x, y, z);
      s.mesh.scale.z = 0.6 + s.t * 2.2;
      s.mesh.material.opacity = 0.42 * (1 - s.t) * (1 - s.t);
    }

    syncTargets(state, aimNdc);
    tickParticles(dt);

    // boss
    if (state.boss && (state.phase === 'boss')) {
      bossGroup.visible = true;
      bossGroup.position.set(0, Math.sin(state.time * 0.7) * 0.5, -state.boss.depth);
      bossCore.rotation.z += dt * 0.5;
      bossCore.rotation.x += dt * 0.3;
      // charge telegraph: the core flares hot and a ring closes in
      const ch = state.bossCharge || 0;
      if (ch > 0) {
        const k = Math.max(0, Math.min(1, ch));
        bossCore.material.color.setHex(0xff2d55);
        bossGroup.scale.setScalar(1 + (1 - k) * 0.06);
        bossChargeRing.visible = true;
        bossChargeRing.scale.setScalar(0.4 + (1 - k) * 1.5);
        bossChargeRing.material.opacity = 0.9 * k;
      } else {
        bossCore.material.color.setHex(0xffd166);
        bossGroup.scale.setScalar(1);
        bossChargeRing.visible = false;
      }
      // Each remaining shield is a distinct colour and gets brighter as fewer
      // remain, so the player can read progress at a glance.
      const SHIELD_COL = [0xffd166, 0xff9f43, 0xff6b6b];
      const total = shieldRings.length;
      for (let i = 0; i < total; i++) {
        const alive = i < state.boss.shields;
        shieldRings[i].visible = alive;
        if (alive) {
          shieldRings[i].material.color.setHex(SHIELD_COL[i % SHIELD_COL.length]);
          shieldRings[i].material.opacity = 0.55 + 0.35 * (1 - i / Math.max(1, total));
          shieldRings[i].rotation.z += dt * (0.8 + i * 0.3);
        }
      }
    } else {
      bossGroup.visible = false;
    }

    // shake
    const sh = state.shake;
    camera.position.x = sh ? (Math.random() - 0.5) * sh * 0.5 : 0;
    camera.position.y = sh ? (Math.random() - 0.5) * sh * 0.5 : 0;

    renderer.render(scene, camera);
  }

  return {
    renderer, scene, camera, resize, frame, burst, bossGroup,
    worldToNdc(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return { x: v.x, y: v.y };
    },
  };
}

function octaPts(r) {
  const v = [
    [r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r],
  ].map(p => new THREE.Vector3(...p));
  const edges = [[0,2],[2,1],[1,3],[3,0],[0,4],[2,4],[1,4],[3,4],[0,5],[2,5],[1,5],[3,5]];
  const out = [];
  for (const [a, b] of edges) { out.push(v[a], v[b]); }
  return out;
}

function shardPts(r) {
  // a flat angular plate, reads differently from the octahedron at speed
  const v = [
    [0, r, 0], [r * 0.7, 0, 0], [0, -r, 0], [-r * 0.7, 0, 0], [0, 0, r * 0.22],
  ].map(p => new THREE.Vector3(...p));
  // outer diamond + one centre vertex only: still distinct, but not busy
  const edges = [[0,1],[1,2],[2,3],[3,0],[0,4],[2,4]];
  const out = [];
  for (const [a, b] of edges) { out.push(v[a], v[b]); }
  return out;
}
