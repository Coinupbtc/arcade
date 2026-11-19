// The hull: one body, two swept fins, one glowing rear vent. No tethered engine pods.
import * as THREE from 'three';
import { CFG } from './constants.js';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.16)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let GLOW_TEX = null;

export function buildCraft(bodyCol, accentCol) {
  if (!GLOW_TEX) GLOW_TEX = glowTexture();
  const g = new THREE.Group();

  // ---- hull: top-view outline, extruded with a bevel -> a rounded one-piece body
  const s = new THREE.Shape();
  s.moveTo(0, 1.95);
  s.bezierCurveTo(0.5, 1.35, 0.9, 0.35, 0.96, -0.45);
  s.bezierCurveTo(1.0, -1.0, 0.78, -1.36, 0.46, -1.44);
  s.lineTo(-0.46, -1.44);
  s.bezierCurveTo(-0.78, -1.36, -1.0, -1.0, -0.96, -0.45);
  s.bezierCurveTo(-0.9, 0.35, -0.5, 1.35, 0, 1.95);
  const hullGeo = new THREE.ExtrudeGeometry(s, {
    depth: 0.46, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2,
    bevelSegments: 3, curveSegments: 14, steps: 1
  });
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.computeBoundingBox();
  hullGeo.translate(0, -hullGeo.boundingBox.min.y, 0);
  const hullMat = new THREE.MeshStandardMaterial({
    color: bodyCol, roughness: 0.34, metalness: 0.55, flatShading: false
  });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.castShadow = true; hull.receiveShadow = true;
  g.add(hull);

  // ---- canopy: dark glass, sits proud of the deck
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 18, 12),
    new THREE.MeshStandardMaterial({ color: 0x140e1c, roughness: 0.08, metalness: 0.85 })
  );
  canopy.scale.set(0.78, 0.62, 1.35);
  canopy.position.set(0, 0.72, 0.12);
  canopy.castShadow = true;
  g.add(canopy);

  // ---- accent stripe down the spine
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.06, 2.4),
    new THREE.MeshStandardMaterial({ color: accentCol, emissive: accentCol, emissiveIntensity: 0.9, roughness: 0.4 })
  );
  stripe.position.set(0, 0.86, 0.05);
  g.add(stripe);

  // ---- two swept fins
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0.02);
  finShape.lineTo(1.95, 0.0);
  finShape.lineTo(1.55, 0.28);
  finShape.lineTo(0.42, 0.86);
  finShape.lineTo(0.06, 0.62);
  finShape.lineTo(0, 0.02);
  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 6
  });
  finGeo.rotateY(-Math.PI / 2);
  const finMat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.3, metalness: 0.6 });
  const fins = [];
  for (const side of [1, -1]) {
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.position.set(side * 0.82, 0.2, -1.45);
    fin.rotation.z = -side * 0.16;
    fin.rotation.x = side * 0.03;
    fin.castShadow = true;
    g.add(fin);
    fins.push(fin);
  }

  // ---- rear vent: glowing ring + disc + additive glow sprite
  const ventMat = new THREE.MeshStandardMaterial({
    color: accentCol, emissive: accentCol, emissiveIntensity: 1.8, roughness: 0.35, metalness: 0.2
  });
  const ventRing = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.34, 20, 1, true), ventMat);
  ventRing.rotation.x = Math.PI / 2;
  ventRing.position.set(0, 0.5, -1.42);
  g.add(ventRing);
  const ventDisc = new THREE.Mesh(new THREE.CircleGeometry(0.44, 20), ventMat);
  ventDisc.position.set(0, 0.5, -1.58);
  ventDisc.rotation.y = Math.PI;
  g.add(ventDisc);

  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: GLOW_TEX, color: accentCol, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: 0.9
  }));
  glowSprite.scale.set(2.4, 2.4, 1);
  glowSprite.position.set(0, 0.5, -1.66);
  g.add(glowSprite);

  // ---- engine flame cone (boost only)
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 2.6, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: accentCol, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  flame.rotation.x = Math.PI / 2;          // cone points along -Z
  flame.position.set(0, 0.5, -2.9);
  g.add(flame);

  // ---- hover cushion: soft additive disc under the hull
  const cushion = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 4.2),
    new THREE.MeshBasicMaterial({
      map: GLOW_TEX, color: accentCol, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  cushion.rotation.x = -Math.PI / 2;
  cushion.position.y = 0.05;
  g.add(cushion);

  g.userData = { hull, canopy, fins, ventMat, glowSprite, flame, cushion, accent: accentCol, glowTex: GLOW_TEX };
  return g;
}

export { GLOW_TEX };
