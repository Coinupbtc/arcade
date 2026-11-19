// ROCKET SOCCER — Three.js renderer: real car model, lit pitch, goals, ball.
// Every visual follows the physics state; nothing here invents gameplay.

import * as THREE from 'three';
import { GLTFLoader } from '../lib/three-examples/loaders/GLTFLoader.js';
import { CONFIG } from './rules.js';

const COL = {
  turfA: 0x1f7a3d,
  turfB: 0x1b6b35,
  line: 0xeaf4ff,
  wall: 0x121a2c,
  wallTop: 0x2f7dff,
  goalYou: 0x2f7dff,      // your net (defend) — blue, per the reference
  goalAI: 0xff8a1f,       // their net (attack) — orange, per the reference
  ball: 0xf2f6ff,
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft was removed in three 0.186
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060a18);
  scene.fog = new THREE.Fog(0x0a1226, 70, 165);

  // gradient sky dome so the world has a horizon instead of a black void
  const skyGeo = new THREE.SphereGeometry(190, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x14306b) },
      mid: { value: new THREE.Color(0x2a5f9e) },
      bot: { value: new THREE.Color(0x0a1226) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(h,0.65)) : mix(mid, bot, pow(-h,0.5));
        // custom ShaderMaterial skips three's output encoding, so encode here or the
        // whole sky renders ~4x too dark.
        gl_FragColor = vec4(pow(c, vec3(1.0/2.2)), 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);
  camera.position.set(0, 8, 22);

  // ── lights ───────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xa8ddff, 0x12202e, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(18, 34, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  const rim = new THREE.DirectionalLight(0x4de2ff, 0.55);
  rim.position.set(-20, 12, -18);
  scene.add(rim);

  // ── pitch ────────────────────────────────────────────────────────────────
  const W = CONFIG.pitchHalfW, L = CONFIG.pitchHalfL;

  const fieldTex = makeFieldTexture(W, L);
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 2, L * 2),
    new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.92, metalness: 0.02 })
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  // outer apron so the world does not end at the touchline
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 2 + 40, L * 2 + 40),
    new THREE.MeshStandardMaterial({ color: 0x0a1020, roughness: 1 })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  scene.add(apron);

  // ── walls ────────────────────────────────────────────────────────────────
  const wallTex = makeWallTexture();
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex, color: 0xffffff, roughness: 0.42, metalness: 0.45,
    emissive: 0x0a2038, emissiveIntensity: 0.55,
  });
  const H = CONFIG.wallHeight;
  function addWall(w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    // glowing top edge
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.06, 0.10, d + 0.06),
      new THREE.MeshBasicMaterial({ color: COL.wallTop })
    );
    edge.position.set(x, y + h / 2, z);
    scene.add(edge);
    return m;
  }
  for (const sx of [-1, 1]) addWall(0.5, H, L * 2 + 1, sx * (W + 0.25), H / 2, 0);

  const GW = CONFIG.goalHalfW, GH = CONFIG.goalHeight;
  for (const sz of [-1, 1]) {
    const postW = W - GW;
    for (const sx of [-1, 1]) {
      addWall(postW, H, 0.5, sx * (GW + postW / 2), H / 2, sz * (L + 0.25));
    }
    const lintelH = H - GH;
    if (lintelH > 0.1) addWall(GW * 2, lintelH, 0.5, 0, GH + lintelH / 2, sz * (L + 0.25));
  }

  // ── stadium: tiered stands, crowd, floodlights ───────────────────────────
  buildStadium(scene, W, L);

  // ── goals ────────────────────────────────────────────────────────────────
  const goals = [];
  for (const [sz, color] of [[-1, COL.goalAI], [1, COL.goalYou]]) {
    const g = new THREE.Group();
    // frame
    const frameMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4,
    });
    const bar = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
      m.position.set(x, y, z); g.add(m); return m;
    };
    bar(GW * 2 + 0.3, 0.18, 0.18, 0, GH, sz * (L + 0.05));       // crossbar
    bar(0.18, GH, 0.18, -GW, GH / 2, sz * (L + 0.05));           // posts
    bar(0.18, GH, 0.18, GW, GH / 2, sz * (L + 0.05));
    // net: a translucent grid
    const netMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false,
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2, GH), netMat);
    back.position.set(0, GH / 2, sz * (L + CONFIG.goalDepth));
    g.add(back);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.goalDepth, GH), netMat);
      side.rotation.y = Math.PI / 2;
      side.position.set(sx * GW, GH / 2, sz * (L + CONFIG.goalDepth / 2));
      g.add(side);
    }
    // goal light
    const light = new THREE.PointLight(color, 14, 26, 2);
    light.position.set(0, GH * 0.8, sz * (L + 0.6));
    g.add(light);
    scene.add(g);
    goals.push({ group: g, side: sz, light });
  }

  // ── ball ─────────────────────────────────────────────────────────────────
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(CONFIG.ballRadius, 3),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.30, metalness: 0.35,
      emissive: 0x3f8cff, emissiveIntensity: 0.30, flatShading: true,
    })
  );
  ball.castShadow = true;
  scene.add(ball);
  // panel seams: a wireframe overlay gives the ball its hex-panel read
  const ballPanels = new THREE.Mesh(
    new THREE.IcosahedronGeometry(CONFIG.ballRadius * 1.005, 1),
    new THREE.MeshBasicMaterial({ color: 0x0a1830, wireframe: true, transparent: true, opacity: 0.55 })
  );
  ball.add(ballPanels);

  const ballGlow = new THREE.Mesh(
    new THREE.SphereGeometry(CONFIG.ballRadius * 1.5, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0x9fe9ff, transparent: true, opacity: 0.16, depthWrite: false })
  );
  scene.add(ballGlow);

  // ball trail
  const TRAIL = 26;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
    color: 0x4de2ff, transparent: true, opacity: 0.45,
  }));
  scene.add(trail);
  const trailPts = [];

  // ── car ──────────────────────────────────────────────────────────────────
  const carGroup = new THREE.Group();
  scene.add(carGroup);
  const aiGroup = new THREE.Group();
  scene.add(aiGroup);

  const loader = new GLTFLoader();
  const carReady = new Promise((resolve) => {
    loader.load('assets/race.glb', (gltf) => {
      const model = gltf.scene;
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material) {
            o.material = new THREE.MeshStandardMaterial({
              map: o.material.map || null,
              color: new THREE.Color(0x3f8cff),      // blue team
              emissive: new THREE.Color(0x0b2a66),
              emissiveIntensity: 0.5,
              roughness: 0.34, metalness: 0.45,
            });
          }
        }
      });
      // Kenney car kit models face +z; our forward is -z.
      model.rotation.y = Math.PI;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      // scale so the body is 1.15 m long (matches the collider and the teardown's 1.18 m)
      const s = 1.18 / Math.max(size.z, 0.001);
      model.scale.setScalar(s);
      model.position.y = -box.min.y * s;
      carGroup.add(model);
      // clone for the opponent, tinted so the two cars never get confused
      const foe = model.clone(true);
      foe.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material = o.material.clone();
          o.material.color = new THREE.Color(0xff8a1f);   // orange team
          o.material.emissive = new THREE.Color(0x3a1a00);
          o.material.emissiveIntensity = 0.55;
        }
      });
      aiGroup.add(foe);
      resolve(model);
    }, undefined, (e) => { console.warn('car model failed', e); resolve(null); });
  });

  // wheels (separate so they can spin and steer)
  const wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 18);   // sized for the 1.18 m car
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.75, metalness: 0.1 });
  const wheels = [], aiWheels = [];
  for (const [x, z] of [[-0.40, -0.36], [0.40, -0.36], [-0.40, 0.36], [0.40, 0.36]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.16, z);
    w.castShadow = true;
    carGroup.add(w);
    wheels.push(w);
    const aw = new THREE.Mesh(wheelGeo, wheelMat);
    aw.position.set(x, 0.16, z);
    aw.castShadow = true;
    aiGroup.add(aw);
    aiWheels.push(aw);
  }

  // boost flames
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 1.5, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffa53d, transparent: true, opacity: 0.9, depthWrite: false })
  );
  flame.rotation.x = Math.PI / 2;
  flame.position.set(0, 0.42, 1.35);
  flame.visible = false;
  carGroup.add(flame);

  // ── contact shadows: a soft blob under each car and the ball ─────────────
  const blobTex = makeBlobTexture();
  function makeBlob() {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 4.6),
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.55,
        depthWrite: false, color: 0x000000 })
    );
    m.rotation.x = -Math.PI / 2;
    scene.add(m);
    return m;
  }
  const carBlob = makeBlob();
  const aiBlob = makeBlob();
  const ballBlob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.5,
      depthWrite: false, color: 0x000000 })
  );
  ballBlob.rotation.x = -Math.PI / 2;
  scene.add(ballBlob);

  // ── boost pads ───────────────────────────────────────────────────────────
  const padMeshes = [];
  function buildPads(pads) {
    for (const m of padMeshes) scene.remove(m.mesh, m.glow);
    padMeshes.length = 0;
    for (const p of pads) {
      const col = p.big ? 0xffc94d : 0xff8a1f;
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(p.big ? 1.5 : 1.0, 24),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, 0.03, p.z);
      scene.add(mesh);
      const glow = new THREE.Mesh(
        new THREE.RingGeometry((p.big ? 1.5 : 1.0) * 0.75, (p.big ? 1.5 : 1.0), 24),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9,
          depthWrite: false, blending: THREE.AdditiveBlending })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(p.x, 0.035, p.z);
      scene.add(glow);
      padMeshes.push({ mesh, glow, pad: p });
    }
  }
  function syncPads(t) {
    for (const { mesh, glow, pad } of padMeshes) {
      const ready = pad.timer <= 0;
      mesh.material.opacity = ready ? 0.55 + Math.sin(t * 3) * 0.12 : 0.06;
      glow.material.opacity = ready ? 0.9 : 0.10;
      const pulse = ready ? 1 + Math.sin(t * 3) * 0.06 : 0.75;
      mesh.scale.setScalar(pulse);
      glow.scale.setScalar(pulse);
    }
  }

  // ── ball ground indicator: the glowing ring on the turf under the ball ───
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
  });
  const ballRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.80, 40), ringMat);
  ballRing.rotation.x = -Math.PI / 2;
  ballRing.position.y = 0.02;
  scene.add(ballRing);
  const ballRingInner = new THREE.Mesh(
    new THREE.CircleGeometry(0.60, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false })
  );
  ballRingInner.rotation.x = -Math.PI / 2;
  ballRingInner.position.y = 0.018;
  scene.add(ballRingInner);

  // ── impact sparks ────────────────────────────────────────────────────────
  const MAXP = 260;
  const pPos = new Float32Array(MAXP * 3);
  const pVel = new Float32Array(MAXP * 3);
  const pLife = new Float32Array(MAXP);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const sparks = new THREE.Points(pGeo, new THREE.PointsMaterial({
    color: 0xfff0b0, size: 0.30, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let pNext = 0;

  function impact(x, y, z, strength) {
    const n = Math.min(46, 12 + Math.round(strength * 34));
    for (let i = 0; i < n; i++) {
      const k = pNext % MAXP; pNext++;
      pPos[k * 3] = x; pPos[k * 3 + 1] = y; pPos[k * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.4;
      const sp = (2 + Math.random() * 7) * (0.4 + strength);
      pVel[k * 3] = Math.cos(a) * Math.cos(e) * sp;
      pVel[k * 3 + 1] = Math.sin(e) * sp + 2;
      pVel[k * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
      pLife[k] = 0.35 + Math.random() * 0.45;
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  function tickSparks(dt) {
    let any = false;
    for (let k = 0; k < MAXP; k++) {
      if (pLife[k] <= 0) continue;
      any = true;
      pLife[k] -= dt;
      pVel[k * 3 + 1] -= 16 * dt;
      pPos[k * 3] += pVel[k * 3] * dt;
      pPos[k * 3 + 1] += pVel[k * 3 + 1] * dt;
      pPos[k * 3 + 2] += pVel[k * 3 + 2] * dt;
      if (pLife[k] <= 0) pPos[k * 3 + 1] = -999;
    }
    if (any) pGeo.attributes.position.needsUpdate = true;
  }

  // camera shake
  let shakeAmt = 0;
  function shake(a) { shakeAmt = Math.min(1.1, shakeAmt + a); }

  // goal flash
  const flashMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false })
  );
  flashMesh.position.set(0, 0, -1);
  flashMesh.renderOrder = 999;
  camera.add(flashMesh);
  scene.add(camera);
  function flash(color, amount = 0.55) {
    flashMesh.material.color.set(color);
    flashMesh.material.opacity = amount;
  }

  // ── resize ───────────────────────────────────────────────────────────────
  function resize() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ── per-frame sync ───────────────────────────────────────────────────────
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3(0, 8, 22);

  function sync(ph, ctl, dt, camMode, aiCtl) {
    // ball
    const bp = ph.ballBody.translation();
    ph_ballPos = { x: bp.x, y: bp.y, z: bp.z };
    ball.position.set(bp.x, bp.y, bp.z);
    const bv = ph.ballBody.linvel();
    const bSpeed = Math.hypot(bv.x, bv.y, bv.z);
    ballGlow.position.copy(ball.position);
    ballGlow.material.opacity = 0.06 + Math.min(0.22, bSpeed * 0.006);

    // trail
    trailPts.push(new THREE.Vector3(bp.x, bp.y, bp.z));
    while (trailPts.length > TRAIL) trailPts.shift();
    const arr = trailGeo.attributes.position.array;
    for (let i = 0; i < TRAIL; i++) {
      const p = trailPts[i] || trailPts[0] || new THREE.Vector3();
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
    }
    trailGeo.attributes.position.needsUpdate = true;
    trail.material.opacity = Math.min(0.5, trailPts.length / TRAIL * 0.5);

    // car
    const cp = ph.carBody.translation();
    carGroup.position.set(cp.x, cp.y - 0.47, cp.z);
    carGroup.rotation.y = ctl.car.yaw;
    const spin = ctl.car.speed * dt / 0.34;
    for (const w of wheels) w.rotation.x -= spin;
    // steer the front pair visually
    const frontZ = -0.36;
    for (const w of wheels) if (Math.abs(w.position.z - frontZ) < 0.01) w.rotation.y = -ctl.car.steerVis * 0.5;

    flame.visible = ctl.car.boosting;
    if (ctl.car.boosting) {
      flame.scale.setScalar(0.85 + Math.random() * 0.5);
      flame.material.opacity = 0.7 + Math.random() * 0.3;
    }

    // contact shadows follow the bodies, fading as they rise
    carBlob.position.set(cp.x, 0.012, cp.z);
    carBlob.material.opacity = 0.55 * Math.max(0, 1 - (cp.y - 0.45) * 0.55);
    // ring tracks the ball on the ground and shrinks as the ball rises
    const hFactor = Math.max(0.35, 1 - (bp.y - CONFIG.ballRadius) * 0.16);
    ballRing.position.set(bp.x, 0.02, bp.z);
    ballRing.scale.setScalar(hFactor);
    ballRing.material.opacity = 0.85 * hFactor;
    ballRingInner.position.set(bp.x, 0.018, bp.z);
    ballRingInner.scale.setScalar(hFactor);
    ballRingInner.material.opacity = 0.16 * hFactor;

    ballBlob.position.set(bp.x, 0.014, bp.z);
    ballBlob.material.opacity = 0.5 * Math.max(0, 1 - (bp.y - CONFIG.ballRadius) * 0.30);

    // opponent car
    if (ph.aiBody) {
      const ap = ph.aiBody.translation();
      aiGroup.position.set(ap.x, ap.y - 0.47, ap.z);
      aiGroup.rotation.y = aiCtl ? aiCtl.car.yaw : 0;
      aiBlob.position.set(ap.x, 0.012, ap.z);
      aiBlob.material.opacity = 0.55 * Math.max(0, 1 - (ap.y - 0.45) * 0.55);
      const aspin = (aiCtl ? aiCtl.car.speed : 0) * dt / 0.34;
      for (const w of aiWheels) w.rotation.x -= aspin;
    }

    // camera
    const fx = Math.sin(ctl.car.yaw), fz = -Math.cos(ctl.car.yaw);
    const speedPull = Math.min(3.2, ctl.car.speed * 0.09);

    if (camMode === 'ball') {
      // Sit on the far side of the CAR from the BALL: the car lands at the bottom of
      // the frame with the ball beyond it, so both are always readable.
      let dx = bp.x - cp.x, dz = bp.z - cp.z;
      let dl = Math.hypot(dx, dz);
      if (dl < 0.001) { dx = fx; dz = fz; dl = 1; }
      dx /= dl; dz /= dl;
      // Reference framing: low and close behind the car so the pitch fills the frame
      // instead of being squeezed into the bottom third.
      // Portrait is a narrow horizontal field, so the car would fill the screen.
      // Pull the camera back as the aspect narrows.
      const aspect = camera.aspect || 1;
      const aspectPull = aspect < 1 ? (1 - aspect) * 7.0 : 0;
      const dist = 6.6 + speedPull + aspectPull;
      camPos.lerp(new THREE.Vector3(
        cp.x - dx * dist, cp.y + 2.55 + aspectPull * 1.15, cp.z - dz * dist),
        1 - Math.exp(-9 * dt));
      // Never let the camera leave the arena — near a wall the ball-cam used to end up
      // outside it, filling the screen with the back of a wall.
      const bx = CONFIG.pitchHalfW - 1.2, bz = CONFIG.pitchHalfL - 1.2;
      camPos.x = Math.max(-bx, Math.min(bx, camPos.x));
      camPos.z = Math.max(-bz, Math.min(bz, camPos.z));
      camPos.y = Math.max(1.4, camPos.y);
      // Portrait has vertical room to spare, so aim lower — it tilts the view down into
      // the pitch instead of filling the top half with sky and crowd.
      camTarget.set(bp.x, bp.y + (aspect < 1 ? 0.45 : 1.35), bp.z);
    } else {
      camPos.lerp(new THREE.Vector3(
        cp.x - fx * (8.6 + speedPull), cp.y + 4.6, cp.z - fz * (8.6 + speedPull)),
        1 - Math.exp(-7 * dt));
      camTarget.set(cp.x + fx * 7.5, cp.y + 1.1, cp.z + fz * 7.5);
    }
    tickSparks(dt);
    if (padMeshes.length) syncPads(performance.now() / 1000);
    shakeAmt = Math.max(0, shakeAmt - dt * 2.4);
    camera.position.copy(camPos);
    if (shakeAmt > 0.001) {
      const s2 = shakeAmt * 0.55;
      camera.position.x += (Math.random() - 0.5) * s2;
      camera.position.y += (Math.random() - 0.5) * s2;
      camera.position.z += (Math.random() - 0.5) * s2;
    }
    camera.lookAt(camTarget);
    if (flashMesh.material.opacity > 0) {
      flashMesh.material.opacity = Math.max(0, flashMesh.material.opacity - dt * 1.5);
    }
  }

  // Where is the ball on screen? Used for the off-screen marker.
  const _v = new THREE.Vector3();
  function ballScreen() {
    const bp = ph_ballPos;
    if (!bp) return { onScreen: false, x: 0.5, y: 0.5 };
    _v.set(bp.x, bp.y, bp.z).project(camera);
    const behind = _v.z > 1;
    const onScreen = !behind && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1;
    return {
      onScreen,
      x: (_v.x * 0.5 + 0.5),
      y: (-_v.y * 0.5 + 0.5),
      behind,
    };
  }
  let ph_ballPos = null;

  function render() { renderer.render(scene, camera); }

  return { renderer, scene, camera, ball, carGroup, wheels, goals, carReady, sync, render, resize,
           impact, shake, flash, ballScreen, buildPads };
}

// ── field texture, drawn in canvas so the markings stay crisp ─────────────
function makeFieldTexture(W, L) {
  const px = 1024;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.round(px * (L / W));
  const g = c.getContext('2d');
  const H = c.height;

  // mown stripes
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#1b6b35' : '#1f7a3d';
    g.fillRect(0, (H / stripes) * i, px, H / stripes + 1);
  }

  g.strokeStyle = 'rgba(234,244,255,0.85)';
  g.lineWidth = 5;
  // touchlines
  g.strokeRect(10, 10, px - 20, H - 20);
  // halfway line
  g.beginPath(); g.moveTo(10, H / 2); g.lineTo(px - 10, H / 2); g.stroke();
  // centre circle
  g.beginPath(); g.arc(px / 2, H / 2, px * 0.13, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(px / 2, H / 2, 7, 0, Math.PI * 2); g.fillStyle = 'rgba(234,244,255,0.9)'; g.fill();

  // goal boxes
  const boxW = px * 0.30, boxD = H * 0.09;
  g.strokeRect(px / 2 - boxW / 2, 10, boxW, boxD);
  g.strokeRect(px / 2 - boxW / 2, H - 10 - boxD, boxW, boxD);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}


// ── stadium builder ────────────────────────────────────────────────────────
function buildStadium(scene, W, L) {
  // crowd texture: noise dots that read as a packed stand from a distance
  const cw = 256, ch = 128;
  const cc = document.createElement('canvas');
  cc.width = cw; cc.height = ch;
  const g = cc.getContext('2d');
  g.fillStyle = '#101a2e'; g.fillRect(0, 0, cw, ch);
  const palette = ['#4de2ff', '#ff2d78', '#ffd166', '#9fb6d4', '#ffffff', '#2f9fd0'];
  for (let i = 0; i < 4200; i++) {
    g.fillStyle = palette[(Math.random() * palette.length) | 0];
    g.globalAlpha = 0.55 + Math.random() * 0.45;
    g.fillRect(Math.random() * cw, Math.random() * ch, 2, 2);
  }
  g.globalAlpha = 1;
  const crowdTex = new THREE.CanvasTexture(cc);
  crowdTex.wrapS = crowdTex.wrapT = THREE.RepeatWrapping;
  crowdTex.repeat.set(14, 2);
  crowdTex.colorSpace = THREE.SRGBColorSpace;

  const crowdMat = new THREE.MeshStandardMaterial({
    map: crowdTex, roughness: 0.95, emissive: 0x2a4a7a, emissiveIntensity: 0.85,
  });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x1a2740, roughness: 0.85 });

  // three tiers on each long side and each end
  // Stands must clear the 6 m arena wall or they are invisible from inside.
  const WALL = 6;
  const tiers = [
    { inset: 1.2, h: 2.4, d: 3.0, y: WALL },
    { inset: 4.4, h: 3.0, d: 3.0, y: WALL + 2.4 },
    { inset: 7.8, h: 3.6, d: 3.2, y: WALL + 5.4 },
  ];

  for (const sx of [-1, 1]) {
    tiers.forEach((t, i) => {
      const w = 2.6;
      const len = L * 2 + 10 + i * 4;
      const x = sx * (W + t.inset + i * 1.1);
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, t.h, len), concreteMat);
      base.position.set(x, t.y + t.h / 2, 0);
      base.receiveShadow = true;
      scene.add(base);

      // crowd as dense glowing points: reads as a packed stand at any distance
      const n = Math.round(len * 5);
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const pal = [0x4de2ff, 0xff2d78, 0xffd166, 0xdce9ff, 0x8fb8e8];
      for (let k = 0; k < n; k++) {
        pos[k * 3] = x - sx * (w / 2 + 0.05);
        pos[k * 3 + 1] = t.y + 0.25 + Math.random() * (t.h - 0.4);
        pos[k * 3 + 2] = (Math.random() - 0.5) * len;
        const c = new THREE.Color(pal[(Math.random() * pal.length) | 0]);
        const dim = 0.25 + Math.random() * 0.45;
        col[k * 3] = c.r * dim; col[k * 3 + 1] = c.g * dim; col[k * 3 + 2] = c.b * dim;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({
        size: 0.17, vertexColors: true, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      }));
      scene.add(pts);
    });
  }

  for (const sz of [-1, 1]) {
    tiers.forEach((t, i) => {
      const d = 2.6;
      const len = W * 2 + 10 + i * 4;
      const z = sz * (L + t.inset + i * 1.1);
      const base = new THREE.Mesh(new THREE.BoxGeometry(len, t.h, d), concreteMat);
      base.position.set(0, t.y + t.h / 2, z);
      base.receiveShadow = true;
      scene.add(base);

      const n = Math.round(len * 5);
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const pal = [0x4de2ff, 0xff2d78, 0xffd166, 0xdce9ff, 0x8fb8e8];
      for (let k = 0; k < n; k++) {
        pos[k * 3] = (Math.random() - 0.5) * len;
        pos[k * 3 + 1] = t.y + 0.25 + Math.random() * (t.h - 0.4);
        pos[k * 3 + 2] = z - sz * (d / 2 + 0.05);
        const c = new THREE.Color(pal[(Math.random() * pal.length) | 0]);
        const dim = 0.25 + Math.random() * 0.45;
        col[k * 3] = c.r * dim; col[k * 3 + 1] = c.g * dim; col[k * 3 + 2] = c.b * dim;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({
        size: 0.17, vertexColors: true, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      }));
      scene.add(pts);
    });
  }

  // LED ribbon boards along the inside of the wall — the signature arena look
  const ledTex = makeLedTexture();
  const ledMat = new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false });
  const ribH = 0.85, ribY = 0.55;
  for (const sx of [-1, 1]) {
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, ribH), ledMat);
    rib.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
    rib.position.set(sx * (W - 0.05), ribY, 0);
    scene.add(rib);
  }
  for (const sz of [-1, 1]) {
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - 8, ribH), ledMat);
    rib.rotation.y = sz > 0 ? Math.PI : 0;
    rib.position.set(0, ribY, sz * (L - 0.05));
    scene.add(rib);
  }

  // floodlight towers in the four corners
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x131c2e, roughness: 0.7, metalness: 0.5 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = sx * (W + 11), pz = sz * (L + 11);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 15, 10), poleMat);
      pole.position.set(px, 7.5, pz);
      pole.castShadow = false;
      scene.add(pole);

      const rig = new THREE.Group();
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 5; c++) {
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.25), lampMat);
          lamp.position.set((c - 2) * 1.05, r * 0.85, 0);
          rig.add(lamp);
        }
      }
      rig.position.set(px, 15.2, pz);
      rig.lookAt(0, 0, 0);
      scene.add(rig);

      const glow = new THREE.PointLight(0xfff0cc, 40, 46, 2);
      glow.position.set(px * 0.92, 13.5, pz * 0.92);
      scene.add(glow);
    }
  }
}


// LED ribbon texture: scrolling chevrons in team colours.
function makeLedTexture() {
  const w = 512, h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#06101f'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    const x = i * (w / 8);
    g.fillStyle = i % 2 ? '#4de2ff' : '#ff2d78';
    g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(x, h); g.lineTo(x + w / 16, 0); g.lineTo(x + w / 8, 0); g.lineTo(x + w / 16, h);
    g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(10, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


// Wall panel texture: vertical ribs and lit seams so a wall never reads as a void.
function makeWallTexture() {
  const w = 512, h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1b2c48');
  grad.addColorStop(0.55, '#121d33');
  grad.addColorStop(1, '#0b1424');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);

  // vertical ribs
  for (let x = 0; x < w; x += 32) {
    g.fillStyle = 'rgba(90,140,200,0.10)';
    g.fillRect(x, 0, 3, h);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(x + 3, 0, 2, h);
  }
  // lit seams near the top
  for (let x = 16; x < w; x += 64) {
    g.fillStyle = 'rgba(77,226,255,0.35)';
    g.fillRect(x, 0, 2, h * 0.7);
  }
  // faint horizontal banding
  for (let y = 0; y < h; y += 24) {
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(0, y, w, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


function makeBlobTexture() {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(n / 2, n / 2, 2, n / 2, n / 2, n / 2);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  const t = new THREE.CanvasTexture(c);
  return t;
}
