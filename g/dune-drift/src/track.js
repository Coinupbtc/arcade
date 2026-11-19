// Track: one closed canyon circuit. Control points -> arc-length samples -> meshes.
import * as THREE from 'three';
import { CFG } from './constants.js';

// Hand-placed centreline (x, z). Perimeter 1612 m, corner radii 44..120 m (measured in tools/measure-track.py).
export const CONTROL = [
  [-195, 105], [-45, 112], [105, 112], [248, 98], [300, 30],
  [300, -68], [248, -128], [143, -150], [70, -125], [-15, -158],
  [-115, -222], [-225, -210], [-285, -135], [-292, -15], [-262, 68]
];

// The one jump: road rises to 2.6 m and drops away at the lip.
export const RAMP = { u0: 0.150, u1: 0.176, lip: 0.184, h: 2.6 };

export const PADS = [
  { u: 0.335, lat: -3.0 },
  { u: 0.640, lat: 3.4 }
];

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function heightAt(u) {
  u = ((u % 1) + 1) % 1;
  if (u < RAMP.u0 || u >= RAMP.lip) return 0;
  if (u < RAMP.u1) return RAMP.h * smoothstep(RAMP.u0, RAMP.u1, u);
  return RAMP.h;
}

export function buildTrack(scene, tex) {
  const pts = CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  const N = 1600;
  const P = curve.getSpacedPoints(N);           // N+1 points, equal arc length, last == first
  const total = curve.getLength();
  const seg = total / N;

  const S = [];
  for (let i = 0; i < N; i++) {
    const p = P[i];
    const nxt = P[(i + 1) % N];
    const prev = P[(i - 1 + N) % N];
    const t = new THREE.Vector3().subVectors(nxt, prev).normalize();
    const right = new THREE.Vector3(t.z, 0, -t.x);
    const u = i / N;
    S.push({ u, p: new THREE.Vector3(p.x, heightAt(u), p.z), t, right, y: heightAt(u), k: 0 });
  }
  // curvature per sample
  for (let i = 0; i < N; i++) {
    const a = S[(i - 2 + N) % N].t, b = S[(i + 2) % N].t;
    const ang = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
    S[i].k = ang / (seg * 4);
  }

  const group = new THREE.Group();
  group.name = 'track';
  scene.add(group);

  // ---------------------------------------------------------------- road ribbon
  const rv = [], ruv = [];
  for (let i = 0; i <= N; i++) {
    const s = S[i % N];
    const cum = i * seg;
    const hw = CFG.roadHalf;
    const l = new THREE.Vector3().copy(s.p).addScaledVector(s.right, hw);
    const r = new THREE.Vector3().copy(s.p).addScaledVector(s.right, -hw);
    rv.push(l.x, l.y + 0.02, l.z, r.x, r.y + 0.02, r.z);
    ruv.push(cum / 12, 1.5, cum / 12, 0);
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3));
  rgeo.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  const idx = [];
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, c, b, b, c, d);
  }
  rgeo.setIndex(idx);
  rgeo.computeVertexNormals();

  const sandMap = tex.sand;
  const roadMat = new THREE.MeshStandardMaterial({
    map: sandMap, normalMap: tex.sandN, roughnessMap: tex.sandR, metalnessMap: tex.sandR,
    color: 0xd8b07f, roughness: 0.96, metalness: 0.0, normalScale: new THREE.Vector2(0.7, 0.7)
  });
  const road = new THREE.Mesh(rgeo, roadMat);
  road.receiveShadow = true;
  road.name = 'road';
  group.add(road);

  // ---------------------------------------------------------------- edge lines
  function edgeRibbon(offA, offB, y, colour, opacity) {
    const v = [], ix = [];
    for (let i = 0; i <= N; i++) {
      const s = S[i % N];
      const a = new THREE.Vector3().copy(s.p).addScaledVector(s.right, offA);
      const b = new THREE.Vector3().copy(s.p).addScaledVector(s.right, offB);
      v.push(a.x, a.y + y, a.z, b.x, b.y + y, b.z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      ix.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(ix);
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({
      color: colour, roughness: 0.8, metalness: 0.0, transparent: opacity < 1, opacity,
      emissive: colour, emissiveIntensity: 0.12
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    return mesh;
  }
  const hw = CFG.roadHalf;
  group.add(edgeRibbon(hw, hw - 0.45, 0.045, CFG.col.violet, 1));
  group.add(edgeRibbon(-hw + 0.45, -hw, 0.045, CFG.col.violet, 1));

  // ---------------------------------------------------------------- walls
  const walls = [];
  function buildWall(side) {
    const ix = [];
    const v = [], uv = [];
    const base = side * CFG.wallHalf;
    const topH = 7.2;
    for (let i = 0; i <= N; i++) {
      const s = S[i % N];
      const wob = Math.sin(i * 0.19) * 0.55 + Math.sin(i * 0.047 + 1.3) * 0.9;
      const b = new THREE.Vector3().copy(s.p).addScaledVector(s.right, base);
      v.push(b.x, b.y - 0.3, b.z);
      v.push(b.x, b.y + topH + wob, b.z);
      const cum = i * seg;
      uv.push(cum / 9, 0, cum / 9, (topH + wob) / 9);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, bb = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      if (side > 0) idxWall(ix, a, c, bb, bb, c, d); else idxWall(ix, a, bb, c, bb, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(ix);
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({
      map: tex.rock, normalMap: tex.rockN, roughnessMap: tex.rockR, metalnessMap: tex.rockR,
      color: 0xb8683a, roughness: 0.98, metalness: 0.0, side: THREE.DoubleSide,
      normalScale: new THREE.Vector2(1.1, 1.1)
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'wall' + (side > 0 ? 'R' : 'L');
    group.add(mesh);
    walls.push(mesh);
    return mesh;
  }
  // index buffer per wall: same quad pattern, DoubleSide material
  const idxWall = (arr, a, b, c, d, e, f) => arr.push(a, b, c, d, e, f);
  buildWall(1);
  buildWall(-1);

  // amber marker lamps along the inner lip of both walls: a speed cue
  const lampGeo = new THREE.BoxGeometry(0.5, 0.22, 1.1);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffd79a, emissive: CFG.col.amber, emissiveIntensity: 1.6, roughness: 0.4
  });
  const lampCount = Math.floor(N / 14) * 2;
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampCount);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  let li = 0;
  for (let i = 0; i < N; i += 14) {
    const s = S[i];
    for (const side of [1, -1]) {
      const p = new THREE.Vector3().copy(s.p).addScaledVector(s.right, side * (CFG.wallHalf - 0.35));
      p.y += 1.1;
      const yaw = Math.atan2(s.t.x, s.t.z);
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      m4.compose(p, q, sc);
      lamps.setMatrixAt(li++, m4);
    }
  }
  lamps.count = li;
  group.add(lamps);

  // ---------------------------------------------------------------- rocks outside the walls
  const rockMat = new THREE.MeshStandardMaterial({
    map: tex.rock, normalMap: tex.rockN, roughnessMap: tex.rockR,
    color: 0xb05a2e, roughness: 1.0, metalness: 0.0, flatShading: true,
    normalScale: new THREE.Vector2(1.4, 1.4)
  });
  const rockGeos = [];
  for (let v = 0; v < 3; v++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.72 + Math.abs(Math.sin(i * 12.9898 + v * 78.233)) * 0.55;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 1.25, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    rockGeos.push(g);
  }
  const ROCK_PER = 90;
  let seed = 1337;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let v = 0; v < 3; v++) {
    const inst = new THREE.InstancedMesh(rockGeos[v], rockMat, ROCK_PER);
    inst.castShadow = true; inst.receiveShadow = true;
    let n = 0;
    for (let i = 0; i < N && n < ROCK_PER; i += Math.max(4, Math.floor(N / (ROCK_PER / 2)))) {
      const s = S[i];
      const side = n % 2 === 0 ? 1 : -1;
      const off = 22 + rnd() * 30;
      const scale = 5 + rnd() * 11;
      const p = new THREE.Vector3().copy(s.p).addScaledVector(s.right, side * off);
      p.y = -1.5 + rnd() * 2.5;
      q.setFromEuler(new THREE.Euler(rnd() * 0.4, rnd() * Math.PI * 2, rnd() * 0.4));
      m4.compose(p, q, sc.set(scale, scale * (0.9 + rnd() * 0.9), scale));
      inst.setMatrixAt(n++, m4);
    }
    inst.count = n;
    group.add(inst);
  }

  // ---------------------------------------------------------------- ground
  const groundMap = tex.sand.clone();
  groundMap.needsUpdate = true;
  groundMap.wrapS = groundMap.wrapT = THREE.RepeatWrapping;
  groundMap.repeat.set(220, 220);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3600, 3600, 1, 1),
    new THREE.MeshStandardMaterial({
      map: groundMap, normalMap: tex.sandN, roughnessMap: tex.sandR,
      color: 0xcaa273, roughness: 1.0, metalness: 0.0
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.08;
  ground.receiveShadow = true;
  group.add(ground);

  // ---------------------------------------------------------------- start gate + line
  const gateS = S[0];
  const gateYaw = Math.atan2(gateS.t.x, gateS.t.z);
  const gate = new THREE.Group();
  gate.position.copy(gateS.p);
  gate.rotation.y = gateYaw;
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3a2a44, roughness: 0.7, metalness: 0.3 });
  const glowMat = new THREE.MeshStandardMaterial({ color: CFG.col.cyan, emissive: CFG.col.cyan, emissiveIntensity: 1.4, roughness: 0.5 });
  for (const side of [1, -1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 9, 10), postMat);
    post.position.set(side * (hw + 1.4), 4.5, 0);
    post.castShadow = true;
    gate.add(post);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.5), glowMat);
    cap.position.set(side * (hw + 1.4), 9.1, 0);
    gate.add(cap);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry((hw + 1.4) * 2, 1.5, 0.4), postMat);
  banner.position.set(0, 8.4, 0);
  gate.add(banner);
  const bannerGlow = new THREE.Mesh(new THREE.BoxGeometry((hw + 1.4) * 2 - 0.6, 0.28, 0.5), glowMat);
  bannerGlow.position.set(0, 8.4, 0);
  gate.add(bannerGlow);
  group.add(gate);

  // finish line: checker strip across the road
  const cvs = document.createElement('canvas');
  cvs.width = 128; cvs.height = 32;
  const cx2 = cvs.getContext('2d');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
    cx2.fillStyle = (x + y) % 2 ? '#f5efe6' : '#1b1226';
    cx2.fillRect(x * 8, y * 8, 8, 8);
  }
  const checker = new THREE.CanvasTexture(cvs);
  checker.colorSpace = THREE.SRGBColorSpace;
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2, 3),
    new THREE.MeshStandardMaterial({ map: checker, roughness: 0.85 })
  );
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = -gateYaw;
  line.position.set(gateS.p.x, gateS.p.y + 0.06, gateS.p.z);
  group.add(line);

  // ---------------------------------------------------------------- boost pads
  const padMeshes = [];
  const padTex = makePadTexture();
  PADS.forEach((pd) => {
    const s = sampleAtU(pd.u);
    const p = new THREE.Vector3().copy(s.p).addScaledVector(s.right, pd.lat);
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(6.5, 9),
      new THREE.MeshBasicMaterial({
        map: padTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        color: CFG.col.cyan, opacity: 0.95
      })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = -Math.atan2(s.t.x, s.t.z);
    pad.position.set(p.x, s.p.y + 0.09, p.z);
    pad.userData.baseY = s.p.y + 0.09;
    group.add(pad);
    padMeshes.push(pad);
    // side pylons
    for (const side of [1, -1]) {
      const py = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 6),
        new THREE.MeshStandardMaterial({ color: CFG.col.cyan, emissive: CFG.col.cyan, emissiveIntensity: 1.2 }));
      const pp = new THREE.Vector3().copy(p).addScaledVector(s.right, side * 4.2);
      py.position.set(pp.x, s.p.y + 0.9, pp.z);
      group.add(py);
    }
  });

  // ---------------------------------------------------------------- sample helpers
  function sampleAtU(u) {
    u = ((u % 1) + 1) % 1;
    const f = u * N;
    const i0 = Math.floor(f) % N, i1 = (i0 + 1) % N;
    const f0 = f - Math.floor(f);
    const a = S[i0], b = S[i1];
    const p = new THREE.Vector3().lerpVectors(a.p, b.p, f0);
    const t = new THREE.Vector3().lerpVectors(a.t, b.t, f0).normalize();
    const right = new THREE.Vector3(t.z, 0, -t.x);
    return { p, t, right, y: heightAt(u), k: a.k + (b.k - a.k) * f0 };
  }

  // nearest sample index to (x,z), searched near a hint index (robust, cheap)
  function nearest(x, z, hint) {
    let best = -1, bestD = Infinity;
    const win = 90;
    if (hint == null) {
      for (let i = 0; i < N; i += 4) {
        const d = (S[i].p.x - x) ** 2 + (S[i].p.z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      for (let i = best - 4; i <= best + 4; i++) {
        const j = (i + N) % N;
        const d = (S[j].p.x - x) ** 2 + (S[j].p.z - z) ** 2;
        if (d < bestD) { bestD = d; best = j; }
      }
      return { i: best, d: Math.sqrt(bestD) };
    }
    for (let o = -win; o <= win; o++) {
      const j = ((hint + o) % N + N) % N;
      const d = (S[j].p.x - x) ** 2 + (S[j].p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = j; }
    }
    return { i: best, d: Math.sqrt(bestD) };
  }

  return {
    curve, samples: S, N, seg, length: total, group, walls, road, gate,
    pads: PADS, padMeshes, sampleAtU, nearest, heightAt,
    update(dt, t) {
      padMeshes.forEach((p, i) => {
        p.material.opacity = 0.55 + 0.45 * Math.abs(Math.sin(t * 2.2 + i));
        p.position.y = p.userData.baseY + Math.sin(t * 3 + i) * 0.04;
      });
      lamps.material.emissiveIntensity = 1.3 + Math.sin(t * 3) * 0.25;
    }
  };
}

function makePadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 7;
  for (let y = -20; y < 128; y += 26) {
    g.beginPath();
    g.moveTo(6, y);
    g.lineTo(32, y + 18);
    g.lineTo(58, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
