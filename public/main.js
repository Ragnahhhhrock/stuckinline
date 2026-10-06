import * as THREE from 'three';
import { createSound } from './audio.js';

const $ = (id) => document.getElementById(id);
const SP = 1.15; // spacing between people along the line
const MAX_INST = 160;

// ---------- scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const HORIZON = 0x141623;
const skyC = document.createElement('canvas'); skyC.width = 2; skyC.height = 256;
const skyTex = new THREE.CanvasTexture(skyC);
skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;
scene.fog = new THREE.Fog(HORIZON, 22, 95);
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);

const ambient = new THREE.AmbientLight(0xb8bfd8, 0.9);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1);
sun.position.set(-4, 10, 6);
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ color: 0x1a1d2b }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------- people: torso, arms, legs, head, face and hair, drawn from shared instanced parts ----------
// Every figure is the same set of parts; each person varies by skin tone, hair style and colour, glasses, facial hair,
// clothes, build, face proportions and nose. Faces point towards the stage (-z).
function bp(geo, o = {}) { // a placed part: scale, then rotate, then translate (colour is baked in as a vertex colour when given)
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (o.s) g.scale(o.s[0], o.s[1], o.s[2]);
  if (o.r) { g.rotateX(o.r[0]); g.rotateY(o.r[1]); g.rotateZ(o.r[2]); }
  if (o.p) g.translate(o.p[0], o.p[1], o.p[2]);
  g.userData.c = o.c ?? null;
  return g;
}
function mergeParts(list, withColor) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = withColor ? new Float32Array(n * 3) : null;
  const col = new THREE.Color();
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    if (C) { col.set(g.userData.c ?? 0xffffff); for (let i = 0; i < c; i++) { C[(o + i) * 3] = col.r; C[(o + i) * 3 + 1] = col.g; C[(o + i) * 3 + 2] = col.b; } }
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (C) out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return out;
}
const Box = (w, h, d) => new THREE.BoxGeometry(w, h, d), Sph = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const HY = 1.40; // head centre height
const limb = (a, b, t, c) => { // a box of thickness t from point a to point b
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = Box(t, d.length(), t).toNonIndexed();
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  g.userData.c = c; return g;
};

const shirtGeo = mergeParts([
  bp(Box(0.46, 0.56, 0.25), { p: [0, 0.90, 0] }),
  bp(Box(0.12, 0.50, 0.13), { p: [-0.30, 0.89, 0] }), bp(Box(0.12, 0.50, 0.13), { p: [0.30, 0.89, 0] }), // arms
]);
const skinGeo = mergeParts([
  bp(new THREE.CylinderGeometry(0.065, 0.07, 0.1, 8), { p: [0, 1.2, 0] }), // neck
  bp(Sph(0.062, 8, 6), { p: [-0.30, 0.60, 0] }), bp(Sph(0.062, 8, 6), { p: [0.30, 0.60, 0] }), // hands
]);
const headGeo = mergeParts([ // separate from the body so children can have bigger heads
  bp(Sph(0.2, 14, 10), { s: [1, 1.08, 1], p: [0, HY, 0] }), // head
  bp(Sph(0.045, 8, 6), { s: [0.5, 1, 0.8], p: [-0.2, 1.39, 0.01] }), bp(Sph(0.045, 8, 6), { s: [0.5, 1, 0.8], p: [0.2, 1.39, 0.01] }), // ears
]);
const legGeo = (x) => mergeParts([
  bp(Box(0.17, 0.62, 0.18), { p: [x, 0.31, 0], c: 0xffffff }), // trousers (tinted per person)
  bp(Box(0.18, 0.08, 0.26), { p: [x, 0.04, -0.04], c: 0x16161c }), // shoes
], true);
const faceGeo = mergeParts([
  bp(Sph(0.036, 8, 6), { s: [1, 1.1, 0.55], p: [-0.078, 1.425, -0.178], c: 0xf4f1ea }), bp(Sph(0.036, 8, 6), { s: [1, 1.1, 0.55], p: [0.078, 1.425, -0.178], c: 0xf4f1ea }), // eyes
  bp(Sph(0.02, 6, 5), { s: [1, 1, 0.5], p: [-0.078, 1.425, -0.196], c: 0x16110e }), bp(Sph(0.02, 6, 5), { s: [1, 1, 0.5], p: [0.078, 1.425, -0.196], c: 0x16110e }), // pupils
  bp(Box(0.07, 0.014, 0.014), { r: [0, 0, 0.12], p: [-0.078, 1.478, -0.185], c: 0x2a1d12 }), bp(Box(0.07, 0.014, 0.014), { r: [0, 0, -0.12], p: [0.078, 1.478, -0.185], c: 0x2a1d12 }), // brows
  bp(Box(0.075, 0.014, 0.012), { p: [0, 1.32, -0.19], c: 0x7a2a2a }), // mouth
], true);
const noseGeo = bp(Sph(0.032, 8, 6), { s: [0.8, 1.1, 1.3] });
const glassesGeo = mergeParts([
  bp(new THREE.TorusGeometry(0.046, 0.008, 6, 14), { p: [-0.078, 1.427, -0.205], c: 0x1a1a22 }), bp(new THREE.TorusGeometry(0.046, 0.008, 6, 14), { p: [0.078, 1.427, -0.205], c: 0x1a1a22 }),
  bp(Box(0.04, 0.008, 0.008), { p: [0, 1.435, -0.205], c: 0x1a1a22 }),
  bp(Box(0.008, 0.008, 0.2), { p: [-0.14, 1.43, -0.1], c: 0x1a1a22 }), bp(Box(0.008, 0.008, 0.2), { p: [0.14, 1.43, -0.1], c: 0x1a1a22 }),
], true);
const beardGeo = bp(new THREE.SphereGeometry(0.208, 14, 8, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.26), { s: [1, 1.08, 1.02], p: [0, HY, 0] });
const stacheGeo = bp(Box(0.09, 0.02, 0.02));
// hair: a cap sets the hairline; extra parts make each style's silhouette
const cap = (th) => bp(new THREE.SphereGeometry(0.212, 14, 8, 0, Math.PI * 2, 0, Math.PI * th), { s: [1, 1.1, 1.02], p: [0, HY, 0.012] });
const rear = (t0, t1) => bp(new THREE.SphereGeometry(0.214, 14, 8, 0, Math.PI, Math.PI * t0, Math.PI * (t1 - t0)), { s: [1, 1.1, 1.02], p: [0, HY, 0.012] });
const spikes = [bp(new THREE.ConeGeometry(0.05, 0.17, 5), { p: [0, 1.70, 0] })];
for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; spikes.push(bp(new THREE.ConeGeometry(0.045, 0.15, 5), { r: [Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55], p: [Math.sin(a) * 0.1, 1.66, Math.cos(a) * 0.1 + 0.01] })); }
const hairGeos = [
  mergeParts([cap(0.38), rear(0.36, 0.60)]), // 0 short
  mergeParts([cap(0.38), rear(0.36, 0.70), bp(Box(0.40, 0.46, 0.09), { p: [0, 1.22, 0.15] })]), // 1 long
  mergeParts([cap(0.38), rear(0.36, 0.60), bp(Sph(0.09, 10, 8), { p: [0, 1.66, 0.07] })]), // 2 bun
  mergeParts([cap(0.34), ...spikes]), // 3 spiky
  mergeParts([bp(Sph(0.27, 14, 10), { s: [1, 0.95, 1], p: [0, 1.50, 0.10] })]), // 4 afro
]; // style 5 is bald

const mk = (geo, vc, dbl) => {
  const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: !!vc, side: dbl ? THREE.DoubleSide : THREE.FrontSide }), MAX_INST);
  m.frustumCulled = false; scene.add(m); return m;
};
const shirtM = mk(shirtGeo), skinM = mk(skinGeo), headM = mk(headGeo), legLM = mk(legGeo(-0.105), true), legRM = mk(legGeo(0.105), true);
const faceM = mk(faceGeo, true), noseM = mk(noseGeo), glassM = mk(glassesGeo, true), beardM = mk(beardGeo, false, true), stacheM = mk(stacheGeo);
const hairMs = hairGeos.map((g) => mk(g, false, true));
// walking stick for some senior citizens, hooked in the right hand
const caneGeo = mergeParts([limb([0.31, 0.64, -0.05], [0.36, 0.0, -0.17], 0.03), limb([0.31, 0.64, -0.05], [0.31, 0.67, 0.04], 0.03)]);
const caneM = mk(caneGeo);

// ---------- mobility aids: plain boxy frames in kerb and quiet, dark wheels and tips (never gold) ----------
const AID = 0x4a4e63, AID_LIGHT = 0x8c93a6, AID_DARK = 0x0b0d14;
const SEAT_DROP = 0.14; // seated people sit lower than standing ones
// wheelchair: the chair, a pair of big wheels and a pair of casters (the wheels are separate so they can roll), and seated legs
const chairGeo = mergeParts([
  bp(Box(0.46, 0.04, 0.44), { p: [0, 0.40, 0], c: AID }), // seat
  bp(Box(0.46, 0.40, 0.04), { p: [0, 0.62, 0.22], c: AID }), // back
  bp(Box(0.04, 0.04, 0.30), { p: [-0.25, 0.56, 0.05], c: AID_LIGHT }), bp(Box(0.04, 0.04, 0.30), { p: [0.25, 0.56, 0.05], c: AID_LIGHT }), // armrests
  bp(Box(0.03, 0.16, 0.03), { p: [-0.25, 0.48, -0.08], c: AID_LIGHT }), bp(Box(0.03, 0.16, 0.03), { p: [0.25, 0.48, -0.08], c: AID_LIGHT }),
  bp(Box(0.56, 0.03, 0.03), { p: [0, 0.28, 0.12], c: AID_LIGHT }), // axle
  limb([-0.24, 0.30, 0.05], [-0.20, 0.15, -0.34], 0.03, AID_LIGHT), limb([0.24, 0.30, 0.05], [0.20, 0.15, -0.34], 0.03, AID_LIGHT), // side frames to the casters
  limb([-0.20, 0.32, -0.22], [-0.20, 0.15, -0.46], 0.03, AID_LIGHT), limb([0.20, 0.32, -0.22], [0.20, 0.15, -0.46], 0.03, AID_LIGHT), // footrest struts
  bp(Box(0.40, 0.02, 0.15), { p: [0, 0.14, -0.46], c: AID }), // footplate
  limb([-0.22, 0.78, 0.24], [-0.22, 0.82, 0.38], 0.03, AID_LIGHT), limb([0.22, 0.78, 0.24], [0.22, 0.82, 0.38], 0.03, AID_LIGHT), // push handles
], true);
const wheelPart = (x, y, z, r, th) => [
  bp(new THREE.CylinderGeometry(r, r, th, 12), { r: [0, 0, Math.PI / 2], p: [x, y, z], c: AID_DARK }), // tyre
  bp(Box(th * 1.3, r * 1.5, r * 0.12), { p: [x, y, z], c: AID_LIGHT }), bp(Box(th * 1.3, r * 0.12, r * 1.5), { p: [x, y, z], c: AID_LIGHT }), // spokes
];
const bigWheelGeo = mergeParts([...wheelPart(-0.28, 0, 0, 0.28, 0.04), ...wheelPart(0.28, 0, 0, 0.28, 0.04)], true); // rolls about its own centre
const casterGeo = mergeParts([...wheelPart(-0.20, 0, 0, 0.07, 0.035), ...wheelPart(0.20, 0, 0, 0.07, 0.035)], true);
const sitLegGeo = mergeParts([-0.105, 0.105].flatMap((x) => [
  bp(Box(0.17, 0.15, 0.40), { p: [x, 0.60, -0.20], c: 0xffffff }), // thighs
  bp(Box(0.15, 0.24, 0.15), { p: [x, 0.49, -0.41], c: 0xffffff }), // shins
  bp(Box(0.18, 0.08, 0.26), { p: [x, 0.34, -0.46], c: 0x16161c }), // shoes
]), true);
// walking frame: four legs, side rails, front rails and grips
const frameGeo = mergeParts([-0.30, 0.30].flatMap((x) => [
  limb([x, 0.62, 0.04], [x, 0.62, -0.40], 0.035, AID_LIGHT), // side rail
  limb([x, 0.62, -0.40], [x, 0.0, -0.40], 0.035, AID_LIGHT), limb([x, 0.62, 0.04], [x, 0.0, 0.04], 0.035, AID_LIGHT), // legs
  bp(Box(0.04, 0.04, 0.12), { p: [x, 0.64, 0.0], c: AID }), // grip
  bp(Box(0.05, 0.03, 0.05), { p: [x, 0.015, -0.40], c: AID_DARK }), bp(Box(0.05, 0.03, 0.05), { p: [x, 0.015, 0.04], c: AID_DARK }), // tips
]).concat([
  limb([-0.30, 0.62, -0.40], [0.30, 0.62, -0.40], 0.03, AID_LIGHT), limb([-0.30, 0.40, -0.40], [0.30, 0.40, -0.40], 0.03, AID_LIGHT),
]), true);
// underarm crutches: pad, shaft, hand grip and rubber tip, one each side
const crutchGeo = mergeParts([-1, 1].flatMap((s) => [
  limb([0.26 * s, 1.08, -0.02], [0.36 * s, 0.0, -0.20], 0.03, AID_LIGHT), // shaft
  bp(Box(0.11, 0.03, 0.07), { p: [0.26 * s, 1.09, -0.02], c: AID }), // pad
  bp(Box(0.04, 0.04, 0.12), { p: [0.31 * s, 0.60, -0.08], c: AID }), // grip
  bp(Box(0.045, 0.03, 0.045), { p: [0.36 * s, 0.015, -0.20], c: AID_DARK }), // tip
]), true);
const chairM = mk(chairGeo, true), bigWheelM = mk(bigWheelGeo, true), casterM = mk(casterGeo, true), sitLegM = mk(sitLegGeo, true);
const frameM = mk(frameGeo, true), crutchM = mk(crutchGeo, true);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0); // hides a part (a seated person's standing legs)
const AM = new THREE.Matrix4();

// ---------- dogs and cats: one body mesh each (white parts take the coat colour), legs swing in diagonal pairs ----------
const pawLeg = (x, z, hip, t) => bp(Box(t, hip, t), { p: [x, hip / 2, z], c: 0xffffff });
const DOG_HIP = 0.40, CAT_HIP = 0.21;
const dogGeo = mergeParts([
  bp(Box(0.28, 0.28, 0.66), { p: [0, 0.46, 0], c: 0xffffff }),
  bp(Sph(0.16, 10, 8), { s: [1, 1, 1.1], p: [0, 0.47, -0.27], c: 0xffffff }), // chest
  limb([0, 0.48, -0.3], [0, 0.69, -0.43], 0.17, 0xffffff), // neck
  bp(Sph(0.15, 12, 10), { s: [1, 0.95, 1.05], p: [0, 0.75, -0.46], c: 0xffffff }), // head
  bp(Box(0.12, 0.1, 0.17), { p: [0, 0.70, -0.62], c: 0xf2ebe0 }), // snout
  bp(Sph(0.032, 8, 6), { p: [0, 0.73, -0.71], c: 0x101010 }), // nose
  bp(Sph(0.022, 6, 5), { p: [-0.06, 0.80, -0.585], c: 0x101010 }), bp(Sph(0.022, 6, 5), { p: [0.06, 0.80, -0.585], c: 0x101010 }), // eyes
  bp(Box(0.05, 0.17, 0.1), { r: [0, 0, 0.28], p: [-0.14, 0.71, -0.45], c: 0xb8ae9e }), bp(Box(0.05, 0.17, 0.1), { r: [0, 0, -0.28], p: [0.14, 0.71, -0.45], c: 0xb8ae9e }), // floppy ears
  limb([0, 0.55, 0.31], [0, 0.80, 0.47], 0.05, 0xffffff), // tail
  bp(Box(0.05, 0.012, 0.012), { p: [0, 0.665, -0.705], c: 0x5a2a26 }), // mouth
], true);
const dogLegA = mergeParts([pawLeg(-0.09, -0.24, DOG_HIP, 0.085), pawLeg(0.09, 0.24, DOG_HIP, 0.085)], true);
const dogLegB = mergeParts([pawLeg(0.09, -0.24, DOG_HIP, 0.085), pawLeg(-0.09, 0.24, DOG_HIP, 0.085)], true);
const catGeo = mergeParts([
  bp(Box(0.18, 0.18, 0.42), { p: [0, 0.28, 0], c: 0xffffff }),
  bp(Sph(0.11, 12, 10), { s: [1.05, 0.95, 1], p: [0, 0.43, -0.26], c: 0xffffff }), // head
  bp(new THREE.ConeGeometry(0.045, 0.09, 4), { p: [-0.06, 0.54, -0.25], c: 0xffffff }), bp(new THREE.ConeGeometry(0.045, 0.09, 4), { p: [0.06, 0.54, -0.25], c: 0xffffff }), // ears
  bp(Sph(0.022, 6, 5), { s: [1, 1, 0.6], p: [-0.045, 0.45, -0.355], c: 0x9ccc4a }), bp(Sph(0.022, 6, 5), { s: [1, 1, 0.6], p: [0.045, 0.45, -0.355], c: 0x9ccc4a }), // eyes
  bp(Box(0.008, 0.026, 0.008), { p: [-0.045, 0.45, -0.37], c: 0x101010 }), bp(Box(0.008, 0.026, 0.008), { p: [0.045, 0.45, -0.37], c: 0x101010 }), // slit pupils
  bp(Sph(0.013, 6, 5), { p: [0, 0.415, -0.365], c: 0xd08888 }), // nose
  bp(Box(0.11, 0.004, 0.004), { r: [0, 0, 0.12], p: [-0.07, 0.405, -0.35], c: 0xeeeeee }), bp(Box(0.11, 0.004, 0.004), { r: [0, 0, -0.12], p: [0.07, 0.405, -0.35], c: 0xeeeeee }), // whiskers
  limb([0, 0.31, 0.2], [0, 0.42, 0.33], 0.04, 0xffffff), limb([0, 0.42, 0.33], [0, 0.6, 0.31], 0.04, 0xffffff), // tail held high
], true);
const catLegA = mergeParts([pawLeg(-0.06, -0.15, CAT_HIP, 0.055), pawLeg(0.06, 0.15, CAT_HIP, 0.055)], true);
const catLegB = mergeParts([pawLeg(0.06, -0.15, CAT_HIP, 0.055), pawLeg(-0.06, 0.15, CAT_HIP, 0.055)], true);
const collar = (r, t, y, z, tilt) => bp(new THREE.TorusGeometry(r, t, 6, 14), { r: [tilt, 0, 0], p: [0, y, z] });
const dogM = mk(dogGeo, true), dogLAM = mk(dogLegA, true), dogLBM = mk(dogLegB, true), dogCollarM = mk(collar(0.095, 0.022, 0.59, -0.365, 0.98));
const catM = mk(catGeo, true), catLAM = mk(catLegA, true), catLBM = mk(catLegB, true), catCollarM = mk(collar(0.07, 0.016, 0.35, -0.22, 1.25));
const allMeshes = [shirtM, skinM, headM, legLM, legRM, faceM, noseM, glassM, beardM, stacheM, caneM, chairM, bigWheelM, casterM, sitLegM, frameM, crutchM, ...hairMs,dogM, dogLAM, dogLBM, dogCollarM, catM, catLAM, catLBM, catCollarM];
const hiN = [0, 0, 0, 0, 0];
const H = new THREE.Matrix4(), M = new THREE.Matrix4(), T = new THREE.Matrix4(), T2 = new THREE.Matrix4(), S = new THREE.Matrix4(), Q = new THREE.Matrix4(), F = new THREE.Matrix4();
const YOU_COLOR = new THREE.Color(0xffcf5c);

// marker for you
const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 8).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffcf5c }));
const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffcf5c, transparent: true, opacity: 0.8 }));
marker.visible = ring.visible = false;
scene.add(marker, ring);

// ---------- the stage: velvet curtains over the way through ----------
// Once a minute the curtains part, the person at the head walks into the dark, and the curtains close.
const PW = 2.6, CH = 4.4, FLOOR = 0.22; // curtain panel width, curtain height, stage floor height
const stage = new THREE.Group();
function makeCurtain(side) { // side -1 = left panel, +1 = right panel; each scales towards its outer edge
  const g = new THREE.PlaneGeometry(PW, CH, 30, 1);
  g.translate(side < 0 ? PW / 2 : -PW / 2, CH / 2, 0);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = Math.sin(pos.getX(i) * 11); // vertical folds
    pos.setZ(i, f * 0.13);
    const shade = 0.9 * (0.6 + 0.4 * (f * 0.5 + 0.5));
    col.set([0.63 * shade, 0.1 * shade, 0.22 * shade], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.position.set(side * PW, FLOOR, 0);
  return m;
}
const curtainL = makeCurtain(-1), curtainR = makeCurtain(1);
const wood = new THREE.MeshLambertMaterial({ color: 0x1b1a22 });
stage.add(curtainL, curtainR);
stage.add(new THREE.Mesh(new THREE.BoxGeometry(2 * PW + 1.2, FLOOR, 3.4).translate(0, FLOOR / 2, -1.0), new THREE.MeshLambertMaterial({ color: 0x2a2230 })));
stage.add(new THREE.Mesh(new THREE.BoxGeometry(2 * PW + 0.4, 0.8, 0.4).translate(0, FLOOR + CH + 0.1, 0), new THREE.MeshLambertMaterial({ color: 0x6a1428 })));
stage.add(new THREE.Mesh(new THREE.BoxGeometry(2 * PW + 0.5, 0.08, 0.46).translate(0, FLOOR + CH - 0.32, 0), new THREE.MeshLambertMaterial({ color: 0xc9a24a, emissive: 0x3a2a08 })));
for (const sx of [-1, 1]) stage.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, CH + 1.3, 0.5).translate(sx * (PW + 0.25), (CH + 1.3) / 2, 0), wood));
// whatever is past the curtains is dark; anyone who walks beyond this panel is simply gone
stage.add(new THREE.Mesh(new THREE.PlaneGeometry(2 * PW + 0.2, CH + 0.4).translate(0, FLOOR + CH / 2, -0.9), new THREE.MeshBasicMaterial({ color: 0x000000 })));
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,196,110,0.9)'); gr.addColorStop(1, 'rgba(255,196,110,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6).translate(0, FLOOR + 1.2, -0.85),
  new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
stage.add(glow);
const spill = new THREE.PointLight(0xffb866, 0, 9, 2); // a little warm light across the first few people when open
spill.position.set(0, 1.4, 0.9);
stage.add(spill);
// ---------- bouncers: two burly doormen in tuxedos flank the curtains, facing the line ----------
// Each is one vertex-coloured mesh built facing -z (like the crowd), then turned round to face the queue.
function makeBouncer(skinHex, hairHex, beard) {
  const JK = 0x101015, LAP = 0x24242e, WH = 0xf2f0ea, SK = skinHex, BH = 1.47; // jacket, satin lapel, shirt, skin, head height
  const parts = [
    // trousers and polished shoes
    bp(Box(0.26, 0.64, 0.27), { p: [-0.15, 0.32, 0], c: JK }), bp(Box(0.26, 0.64, 0.27), { p: [0.15, 0.32, 0], c: JK }),
    bp(Box(0.27, 0.09, 0.36), { p: [-0.15, 0.045, -0.05], c: 0x060608 }), bp(Box(0.27, 0.09, 0.36), { p: [0.15, 0.045, -0.05], c: 0x060608 }),
    // jacket: deep chest, broad shoulders
    bp(Box(0.80, 0.64, 0.44), { p: [0, 0.94, 0], c: JK }),
    bp(Box(0.96, 0.18, 0.42), { p: [0, 1.18, 0], c: JK }),
    bp(Sph(0.14, 8, 6), { s: [1, 0.85, 1.4], p: [-0.46, 1.2, 0], c: JK }), bp(Sph(0.14, 8, 6), { s: [1, 0.85, 1.4], p: [0.46, 1.2, 0], c: JK }),
    // shirt front, studs, collar, bow tie, satin lapels
    bp(Box(0.17, 0.36, 0.01), { p: [0, 1.06, -0.222], c: WH }),
    bp(Sph(0.012, 6, 4), { p: [0, 1.12, -0.23], c: 0x0a0a0a }), bp(Sph(0.012, 6, 4), { p: [0, 1.03, -0.23], c: 0x0a0a0a }),
    bp(Box(0.2, 0.06, 0.04), { p: [0, 1.255, -0.17], c: WH }),
    bp(new THREE.ConeGeometry(0.04, 0.08, 4), { r: [0, 0, Math.PI / 2], p: [-0.04, 1.22, -0.215], c: 0x050505 }),
    bp(new THREE.ConeGeometry(0.04, 0.08, 4), { r: [0, 0, -Math.PI / 2], p: [0.04, 1.22, -0.215], c: 0x050505 }),
    bp(Box(0.09, 0.42, 0.012), { r: [0, 0, -0.32], p: [-0.13, 1.04, -0.224], c: LAP }), bp(Box(0.09, 0.42, 0.012), { r: [0, 0, 0.32], p: [0.13, 1.04, -0.224], c: LAP }),
    bp(Box(0.11, 0.07, 0.01), { p: [-0.26, 1.1, -0.223], c: WH }), // pocket square
    // thick neck and head
    bp(new THREE.CylinderGeometry(0.13, 0.16, 0.16, 10), { p: [0, 1.31, 0], c: SK }),
    bp(Sph(0.21, 14, 10), { s: [1.04, 1.05, 1], p: [0, BH, 0], c: SK }),
    bp(Sph(0.048, 8, 6), { s: [0.5, 1, 0.8], p: [-0.215, BH - 0.01, 0.01], c: SK }), bp(Sph(0.048, 8, 6), { s: [0.5, 1, 0.8], p: [0.215, BH - 0.01, 0.01], c: SK }),
    // stern face: eyes, heavy brows angled down to the middle, flat mouth, nose
    bp(Sph(0.034, 8, 6), { s: [1, 0.8, 0.55], p: [-0.08, BH + 0.02, -0.186], c: 0xf4f1ea }), bp(Sph(0.034, 8, 6), { s: [1, 0.8, 0.55], p: [0.08, BH + 0.02, -0.186], c: 0xf4f1ea }),
    bp(Sph(0.019, 6, 5), { s: [1, 1, 0.5], p: [-0.08, BH + 0.02, -0.203], c: 0x16110e }), bp(Sph(0.019, 6, 5), { s: [1, 1, 0.5], p: [0.08, BH + 0.02, -0.203], c: 0x16110e }),
    bp(Box(0.09, 0.024, 0.02), { r: [0, 0, -0.22], p: [-0.08, BH + 0.065, -0.19], c: 0x1c140e }), bp(Box(0.09, 0.024, 0.02), { r: [0, 0, 0.22], p: [0.08, BH + 0.065, -0.19], c: 0x1c140e }),
    bp(Box(0.09, 0.014, 0.012), { p: [0, BH - 0.105, -0.198], c: 0x5a2a26 }),
    bp(Sph(0.036, 8, 6), { s: [0.9, 1.1, 1.3], p: [0, BH - 0.035, -0.2], c: new THREE.Color(SK).multiplyScalar(0.92).getHex() }),
    // earpiece in the left ear, with its coiled clear wire running down into the collar
    bp(Sph(0.022, 6, 5), { p: [-0.225, BH - 0.015, -0.005], c: 0x0c0c0c }),
    limb([-0.225, BH - 0.03, 0.02], [-0.19, 1.24, 0.15], 0.01, 0xcfd6e0),
  ];
  for (let i = 0; i < 5; i++) { const f = (i + 0.5) / 5; parts.push(bp(new THREE.TorusGeometry(0.016, 0.005, 4, 8), { r: [Math.PI / 2, 0, 0], p: [-0.225 + 0.055 * f, BH - 0.03 - (BH - 1.27) * f, 0.02 + 0.11 * f], c: 0xcfd6e0 })); }
  // arms: upper arms hang from the shoulders, forearms come in to hands clasped in front (right over left)
  for (const sx of [-1, 1]) {
    const sh = [sx * 0.47, 1.16, 0], el = [sx * 0.50, 0.86, -0.06], wr = [sx * 0.10, 0.72, -0.32];
    parts.push(limb(sh, el, 0.24, JK), limb(el, wr, 0.20, JK));
    parts.push(limb([sx * 0.125, 0.73, -0.30], [sx * 0.095, 0.72, -0.325], 0.14, WH)); // shirt cuff
  }
  parts.push(bp(Sph(0.085, 8, 6), { s: [1.2, 0.85, 1], p: [-0.03, 0.70, -0.35], c: SK }), bp(Sph(0.085, 8, 6), { s: [1.2, 0.85, 1], p: [0.035, 0.715, -0.37], c: SK }));
  // hair: a close buzz cut, or a clean-shaven head with a short beard
  if (hairHex != null) parts.push(bp(new THREE.SphereGeometry(0.216, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), { s: [1.04, 1.05, 1.01], p: [0, BH, 0.01], c: hairHex }));
  if (beard) parts.push(bp(new THREE.SphereGeometry(0.214, 14, 8, 0, Math.PI * 2, Math.PI * 0.66, Math.PI * 0.26), { s: [1.04, 1.05, 1.02], p: [0, BH, 0], c: beard }));
  const m = new THREE.Mesh(mergeParts(parts, true), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.scale.set(1.25, 1.3, 1.25); // big lads
  return m;
}
const bouncers = [makeBouncer(0xe6bf9c, 0x3a2a1e, null), makeBouncer(0x4a2f20, null, 0x120c08)];
bouncers.forEach((b, i) => {
  const sx = i === 0 ? -1 : 1;
  b.position.set(sx * 2.1, FLOOR, 0.42);
  b.rotation.y = Math.PI - sx * 0.22; // turned round to face the queue, angled a touch towards it
  stage.add(b);
});

stage.visible = false;
scene.add(stage);

// ---------- world model ----------
const curveX = (pos) => Math.sin(pos * 0.05) * 1.1 + Math.sin(pos * 0.017) * 1.6;
const hash01 = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- the street: pavement, road, buildings, shopfronts, lamps, trees, rope barriers, slow traffic ----------
// Everything is generated from the camera's position along the line, so the street never ends; it is kept dim and low in
// contrast so the line stays the focus. The stage is at the end of the street, in front of a blank dark wall.
const street = new THREE.Group();
scene.add(street);
const cvs = (w, h, draw) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4;
  return tx;
};
const SLAB = 2, ROAD_T = 8, LEN = 240, PAVE_L = -8, PAVE_R = 9.6;
const inst = (geo, mat, max) => { const m = new THREE.InstancedMesh(geo, mat, max); m.frustumCulled = false; street.add(m); return m; };
const lam = (o) => new THREE.MeshLambertMaterial(o);

const paveTex = cvs(128, 128, (g, w, h) => {
  g.fillStyle = '#34384c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 18, 6 + Math.random() * 18); }
  g.strokeStyle = '#252839'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
});
paveTex.repeat.set((PAVE_R - PAVE_L) / SLAB, LEN / SLAB);
const roadTex = cvs(64, 128, (g, w, h) => {
  g.fillStyle = '#1b1d28'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2 + Math.random() * 5); }
  g.fillStyle = '#7b7860'; g.fillRect(w / 2 - 1.5, 10, 3, 56);
});
roadTex.repeat.set(1, LEN / ROAD_T);
const flat = (w, tx, x0, y) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, LEN).rotateX(-Math.PI / 2).translate(x0, y, 0),
    lam({ map: tx, color: 0xcfd2e0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  street.add(m); return m;
};
const pave = flat(PAVE_R - PAVE_L, paveTex, (PAVE_L + PAVE_R) / 2, 0.01);
const road = flat(8, roadTex, -12, 0.01);
const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, LEN).translate(-8.14, 0.08, 0), lam({ color: 0x4a4e63 }));
street.add(kerb);
// the street ends at the stage, in front of a blank wall
street.add(new THREE.Mesh(new THREE.BoxGeometry(150, 26, 6).translate(0, 13, -10), lam({ color: 0x161926 })));

// buildings: six height classes, each with its own window pattern; a few windows are lit
const winOn = (() => { let sd = 11; const out = []; for (let i = 0; i < 9; i++) { sd = (sd * 16807) % 2147483647; out.push(sd / 2147483647 < 0.3); } return out; })();
const drawWindows = (lit) => (g, w, h) => {
  g.fillStyle = lit ? '#000' : '#3b3f52'; g.fillRect(0, 0, w, h);
  const bw = w / 3, fh = h / 3;
  for (let ix = 0; ix < 3; ix++) for (let iy = 0; iy < 3; iy++) {
    const x = ix * bw + bw * 0.2, y = iy * fh + fh * 0.2, ww = bw * 0.6, hh = fh * 0.52, on = winOn[ix * 3 + iy];
    if (lit) { if (on) { g.fillStyle = '#d9a559'; g.fillRect(x, y, ww, hh); } }
    else { g.fillStyle = '#181b2b'; g.fillRect(x, y, ww, hh); g.fillStyle = '#00000055'; g.fillRect(x, y + hh, ww, 4); }
  }
};
const facadeTex = cvs(256, 256, drawWindows(false)), facadeLit = cvs(256, 256, drawWindows(true));
const FLOORS = [3, 4, 5, 6, 7, 8], BD = 9, BW = 8.2, FH = 3.2, BSTEP = 9, RX = 9.6, LX = -17.6;
const bMat = new THREE.MeshLambertMaterial({ map: facadeTex, emissive: 0xffffff, emissiveMap: facadeLit, emissiveIntensity: 0.9 });
const bCls = FLOORS.map((fl, ci) => {
  const H = fl * FH, geo = new THREE.BoxGeometry(BD, H, BW), uv = geo.attributes.uv, nrm = geo.attributes.normal;
  const ou = hash01(ci * 3.7), ov = hash01(ci * 5.9);
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)) > 0.5, ny = Math.abs(nrm.getY(i)) > 0.5;
    if (ny) { uv.setXY(i, 0.02, 0.02); continue; }
    uv.setXY(i, uv.getX(i) * ((nx ? BW : BD) / 10.5) + ou, uv.getY(i) * (H / 9.6) + ov);
  }
  return inst(geo, bMat, 40);
});
const shopTex = cvs(256, 96, (g, w, h) => {
  g.fillStyle = '#1b1e2c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d8d2c6' : '#8d4a3a'; g.fillRect(i * 32, 0, 32, 22); }
  g.fillStyle = '#00000066'; g.fillRect(0, 22, w, 4);
  const gr = g.createLinearGradient(0, 30, 0, 90); gr.addColorStop(0, '#ffe2b0'); gr.addColorStop(1, '#a9702f');
  g.fillStyle = gr; g.fillRect(14, 32, 150, 58); g.fillRect(180, 32, 62, 58);
  g.fillStyle = '#24182299'; for (let i = 0; i < 6; i++) g.fillRect(24 + i * 24, 40 + (i % 3) * 8, 14, 38 - (i % 3) * 8);
  g.fillStyle = '#1b1e2c'; g.fillRect(166, 32, 12, 58);
});
const shopM = inst(new THREE.PlaneGeometry(BW - 0.4, 3.0).rotateY(-Math.PI / 2).translate(RX - 0.03, 1.5, 0), new THREE.MeshBasicMaterial({ map: shopTex }), 40);
const BTINT = [[1, 1, 1], [1.12, 0.96, 0.9], [0.9, 1, 1.14], [1.04, 1.1, 0.94], [0.82, 0.86, 0.92]].map((a) => new THREE.Color(a[0], a[1], a[2]));
const STINT = [[0.85, 0.7, 0.55], [0.6, 0.78, 0.9], [0.9, 0.55, 0.65], [0.7, 0.9, 0.62], [0.9, 0.85, 0.7]].map((a) => new THREE.Color(a[0], a[1], a[2]));

// lamp posts with a soft pool of light on the pavement
const lampGeo = mergeParts([
  bp(new THREE.CylinderGeometry(0.06, 0.08, 4.6, 8), { p: [0, 2.3, 0], c: 0x262a37 }), bp(Box(1.1, 0.07, 0.07), { p: [-0.5, 4.58, 0], c: 0x262a37 }),
  bp(Box(0.5, 0.1, 0.24), { p: [-1.0, 4.54, 0], c: 0x262a37 }),
], true);
const lampM = inst(lampGeo, lam({ vertexColors: true }), 48);
const bulbM = inst(new THREE.SphereGeometry(0.13, 8, 6).translate(-1.0, 4.45, 0), new THREE.MeshBasicMaterial({ color: 0xffdca0 }), 48);
const poolM = inst(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2).translate(-1.0, 0.03, 0),
  new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }), 48);

// trees, benches, bins
const trunkM = inst(new THREE.CylinderGeometry(0.1, 0.14, 2.6, 6).translate(0, 1.3, 0), lam({ color: 0x2b211c }), 48);
const leafM = inst(new THREE.IcosahedronGeometry(1.5, 1).scale(1, 0.85, 1).translate(0, 3.5, 0), lam({ color: 0xffffff, flatShading: true }), 48);
const benchM = inst(mergeParts([
  bp(Box(1.6, 0.07, 0.45), { p: [0, 0.46, 0], c: 0x5a4636 }), bp(Box(1.6, 0.38, 0.05), { p: [0, 0.74, 0.2], c: 0x5a4636 }),
  bp(Box(0.06, 0.46, 0.4), { p: [-0.7, 0.23, 0], c: 0x22252f }), bp(Box(0.06, 0.46, 0.4), { p: [0.7, 0.23, 0], c: 0x22252f }),
], true), lam({ vertexColors: true }), 16);
const binM = inst(new THREE.CylinderGeometry(0.23, 0.2, 0.8, 10).translate(0, 0.4, 0), lam({ color: 0x2c4a3d }), 16);
const LEAF = [0x24402f, 0x2b4a36, 0x1f3a33, 0x31503a].map((c) => new THREE.Color(c));

// rope-and-stanchion barrier along both sides of the line
const postM = inst(mergeParts([
  bp(new THREE.CylinderGeometry(0.11, 0.12, 0.03, 10), { p: [0, 0.015, 0], c: 0x2a2d38 }), bp(new THREE.CylinderGeometry(0.03, 0.035, 0.9, 8), { p: [0, 0.47, 0], c: 0x30333f }),
  bp(Sph(0.06, 8, 6), { p: [0, 0.95, 0], c: 0xb08d4a }),
], true), lam({ vertexColors: true }), 200);
const ropeM = inst(new THREE.BoxGeometry(0.035, 0.035, 1), lam({ color: 0x8a1f36 }), 200);

// slow traffic on the road: dim, quiet, never close to the line
const carGeo = mergeParts([
  bp(Box(1.8, 0.55, 4.1), { p: [0, 0.52, 0], c: 0xffffff }), bp(Box(1.5, 0.45, 2.2), { p: [0, 1.0, 0.15], c: 0x30343f }),
  ...[[-0.9, -1.3], [0.9, -1.3], [-0.9, 1.3], [0.9, 1.3]].map(([x, z]) => bp(Box(0.2, 0.5, 0.6), { p: [x, 0.25, z], c: 0x101116 })),
], true);
const carM = inst(carGeo, lam({ vertexColors: true }), 16);
const carLightM = inst(mergeParts([
  bp(Box(0.3, 0.12, 0.05), { p: [-0.6, 0.55, -2.07], c: 0xfff1c9 }), bp(Box(0.3, 0.12, 0.05), { p: [0.6, 0.55, -2.07], c: 0xfff1c9 }),
  bp(Box(0.3, 0.12, 0.05), { p: [-0.6, 0.6, 2.07], c: 0xc4202c }), bp(Box(0.3, 0.12, 0.05), { p: [0.6, 0.6, 2.07], c: 0xc4202c }),
], true), new THREE.MeshBasicMaterial({ vertexColors: true }), 16);
const CAR_COL = [0x8b8f9c, 0x5b6a8a, 0x8a4a4a, 0x4f6d5a, 0xb9b3a0, 0x3c3f4a].map((c) => new THREE.Color(c));
const CARS = Array.from({ length: 12 }, (_, i) => ({ lane: i % 2, base: hash01(i * 4.1) * 220, v: 3 + hash01(i * 7.7) * 3, col: CAR_COL[i % CAR_COL.length] }));

// a scatter of stars
const stars = (() => {
  const n = 180, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = hash01(i * 3.1) * Math.PI * 2, e = 0.18 + hash01(i * 5.3) * 0.9, r = 150; p.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts); return pts;
})();

// ---------- day and night: one world day is 20 real minutes, the same for everyone (it follows the wall clock) ----------
const DAY_MS = 20 * 60 * 1000;
const hourParam = (location.hash.match(/hour=([\d.]+)/) || [])[1];
const worldHour = () => hourParam != null ? +hourParam : ((Date.now() % DAY_MS) / DAY_MS) * 24;
const KEYS = [ // hour, sky top, horizon/fog, ambient colour+intensity, sun/moon colour+intensity, night amount
  [0, '#0a0c1e', '#10122a', '#9aa6d6', 0.75, '#8fa0ff', 0.35, 1], [5, '#12163a', '#262040', '#9aa6d6', 0.8, '#8fa0ff', 0.35, 1],
  [6.5, '#3b4a7a', '#d98a6a', '#d8c0c0', 0.95, '#ffb27a', 0.8, 0.45], [8.5, '#5a86c8', '#b9cfe6', '#dfe8ff', 1.1, '#fff0d8', 1.15, 0.05],
  [12, '#4f86d6', '#bcd6ee', '#eaf0ff', 1.2, '#fff6e6', 1.3, 0], [16.5, '#5a86c8', '#c4cfe0', '#dfe8ff', 1.1, '#fff0d8', 1.15, 0.05],
  [18.5, '#4a3f7a', '#e0785a', '#d8c0c0', 0.95, '#ff9a62', 0.8, 0.5], [20, '#1c1c44', '#2a2240', '#a8b0dc', 0.8, '#8fa0ff', 0.4, 0.9],
  [22, '#0e1024', '#131526', '#9aa6d6', 0.75, '#8fa0ff', 0.35, 1], [24, '#0a0c1e', '#10122a', '#9aa6d6', 0.75, '#8fa0ff', 0.35, 1],
].map((k) => ({ h: k[0], top: new THREE.Color(k[1]), hor: new THREE.Color(k[2]), ambC: new THREE.Color(k[3]), amb: k[4], sunC: new THREE.Color(k[5]), sun: k[6], night: k[7] }));
const dk = { top: new THREE.Color(), hor: new THREE.Color(), ambC: new THREE.Color(), sunC: new THREE.Color() };
// everything built dark for the night view is brightened by day
const dayMats = [pave.material, road.material, kerb.material, ground.material, bMat, trunkM.material, leafM.material, benchM.material, binM.material, carM.material]
  .map((m) => ({ m, base: m.color.clone() }));
const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1c0, fog: false }));
const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8edff, fog: false }));
const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe0a0, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
sunGlow.scale.set(80, 80, 1);
scene.add(sunDisc, moonDisc, sunGlow);
const dirV = new THREE.Vector3(), BULB_DIM = new THREE.Color(0x4a4a56), BULB_ON = new THREE.Color(0xffdca0);
let lastSky = -1, lastClock = '';
function applyTime(h) {
  let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
  const a = KEYS[i], b = KEYS[i + 1], f0 = clamp((h - a.h) / (b.h - a.h), 0, 1), f = f0 * f0 * (3 - 2 * f0);
  dk.top.lerpColors(a.top, b.top, f); dk.hor.lerpColors(a.hor, b.hor, f); dk.ambC.lerpColors(a.ambC, b.ambC, f); dk.sunC.lerpColors(a.sunC, b.sunC, f);
  const amb = a.amb + (b.amb - a.amb) * f, sunI = a.sun + (b.sun - a.sun) * f, night = a.night + (b.night - a.night) * f, day = 1 - night;
  ambient.color.copy(dk.ambC); ambient.intensity = amb;
  sun.color.copy(dk.sunC); sun.intensity = sunI;
  scene.fog.color.copy(dk.hor);
  if (Math.abs(h - lastSky) > 0.008 || lastSky < 0) { // repaint the sky gradient
    lastSky = h;
    const g = skyC.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#' + dk.top.getHexString()); gr.addColorStop(0.26, '#' + dk.hor.getHexString()); gr.addColorStop(1, '#' + dk.hor.getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, 2, 256); skyTex.needsUpdate = true;
  }
  const k = 1 + 2.4 * day;
  for (const d of dayMats) d.m.color.copy(d.base).multiplyScalar(k);
  bMat.emissiveIntensity = 0.95 * night;
  shopM.material.color.setScalar(0.72 + 0.28 * night);
  const lampOn = clamp((night - 0.25) / 0.45, 0, 1);
  bulbM.material.color.lerpColors(BULB_DIM, BULB_ON, lampOn); poolM.material.opacity = 0.42 * lampOn;
  stars.material.opacity = 0.6 * night * night; stars.visible = night > 0.05;
  // sun by day, moon by night: each crosses the sky from east to west over 12 world hours
  const up = h >= 6 && h < 18, ang = (((h - 6) % 12) + 12) % 12 / 12 * Math.PI;
  dirV.set(-Math.cos(ang) * 0.9, Math.sin(ang), -0.5).normalize();
  sun.position.set(dirV.x * 20, Math.max(dirV.y, 0.15) * 20, dirV.z * 20 + 6);
  const cp = camera.position;
  sunDisc.visible = sunGlow.visible = up && dirV.y > 0.02; moonDisc.visible = !up && dirV.y > 0.02;
  (up ? sunDisc : moonDisc).position.set(cp.x + dirV.x * 150, dirV.y * 150, cp.z + dirV.z * 150);
  sunGlow.position.copy(sunDisc.position);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60), txt = `${up ? '☀' : '☾'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  if (txt !== lastClock) { lastClock = txt; const el = $('clock'); if (el) el.textContent = txt; }
}

const sm = new THREE.Matrix4(), sr = new THREE.Matrix4(), sq = new THREE.Matrix4(), sv = new THREE.Vector3(), sK = new THREE.Color();
const wrap = (a, L) => ((a % L) + L) % L;
function streetUpdate(cx, cz, t) {
  const snap = (v, s) => Math.round(v / s) * s;
  pave.position.z = snap(cz, SLAB); road.position.z = snap(cz, ROAD_T); kerb.position.z = snap(cz, 4);
  stars.position.set(cx, 0, cz);

  // buildings and shopfronts
  const bn = FLOORS.map(() => 0); let shn = 0;
  for (let i = Math.floor((cz - 110) / BSTEP); i <= Math.floor((cz + 110) / BSTEP); i++) {
    const zc = i * BSTEP + BSTEP / 2;
    if (zc < 4) continue;
    for (const side of [1, -1]) {
      const h = hash01(i * 2 + (side > 0 ? 1 : 0) + 100), ci = Math.floor(h * FLOORS.length) % FLOORS.length, m = bCls[ci];
      sr.makeRotationY(side > 0 ? 0 : Math.PI); sm.makeTranslation(side > 0 ? RX + BD / 2 : LX - BD / 2, FLOORS[ci] * FH / 2, zc).multiply(sr);
      m.setMatrixAt(bn[ci], sm); m.setColorAt(bn[ci], BTINT[Math.floor(hash01(i * 3 + side) * BTINT.length)]); bn[ci]++;
      if (side > 0 && hash01(i + 40) > 0.15) { sm.makeTranslation(0, 0, zc); shopM.setMatrixAt(shn, sm); shopM.setColorAt(shn, STINT[Math.floor(hash01(i * 7 + 3) * STINT.length)]); shn++; }
    }
  }
  bCls.forEach((m, i) => { m.count = bn[i]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  shopM.count = shn; shopM.instanceMatrix.needsUpdate = true; if (shopM.instanceColor) shopM.instanceColor.needsUpdate = true;

  // lamps (every 14 m, both sides)
  let n = 0;
  for (let i = Math.ceil((cz - 110) / 14); i <= Math.floor((cz + 110) / 14); i++) {
    const z = i * 14 + 3;
    if (z < 3) continue;
    for (const side of [1, -1]) {
      sr.makeRotationY(side > 0 ? 0 : Math.PI); sm.makeTranslation(side * 7.5, 0, z).multiply(sr);
      lampM.setMatrixAt(n, sm); bulbM.setMatrixAt(n, sm); poolM.setMatrixAt(n, sm); n++;
    }
  }
  lampM.count = bulbM.count = poolM.count = n;
  [lampM, bulbM, poolM].forEach((m) => { m.instanceMatrix.needsUpdate = true; });

  // trees (every 18 m, alternating sides)
  n = 0;
  for (let i = Math.ceil((cz - 110) / 18); i <= Math.floor((cz + 110) / 18); i++) for (const side of [1, -1]) {
    const z = i * 18 + (side > 0 ? 0 : 9) + 3;
    if (z < 5) continue;
    sm.makeTranslation(side * 6.4, 0, z); trunkM.setMatrixAt(n, sm);
    sm.makeRotationY(hash01(i + side) * 6).setPosition(side * 6.4, 0, z); leafM.setMatrixAt(n, sm); leafM.setColorAt(n, LEAF[Math.floor(hash01(i * 2 + side) * LEAF.length)]); n++;
  }
  trunkM.count = leafM.count = n; trunkM.instanceMatrix.needsUpdate = leafM.instanceMatrix.needsUpdate = true; if (leafM.instanceColor) leafM.instanceColor.needsUpdate = true;

  // benches (left) and bins (right)
  let b = 0, c = 0;
  for (let i = Math.ceil((cz - 110) / 37); i <= Math.floor((cz + 110) / 37); i++) { const z = i * 37 + 16; if (z > 6) { sr.makeRotationY(Math.PI / 2).setPosition(-6.8, 0, z); benchM.setMatrixAt(b++, sr); } }
  for (let i = Math.ceil((cz - 110) / 29); i <= Math.floor((cz + 110) / 29); i++) { const z = i * 29 + 7; if (z > 6) { sm.makeTranslation(7.1, 0, z); binM.setMatrixAt(c++, sm); } }
  benchM.count = b; binM.count = c; benchM.instanceMatrix.needsUpdate = binM.instanceMatrix.needsUpdate = true;

  // rope barrier: a post every 3 places on both sides of the line, with rope between
  let pn = 0, rn = 0;
  const last = (state.total || 0) + 3, k0 = Math.max(0, Math.floor((cz / SP - 70) / 3)), k1 = Math.floor(Math.min(cz / SP + 70, last) / 3);
  for (let k = k0; k <= k1; k++) for (const side of [-1, 1]) {
    const x = curveX(k * 3) + side * 1.75, z = k * 3 * SP;
    sm.makeTranslation(x, 0, z); postM.setMatrixAt(pn++, sm);
    if (k < k1) {
      const x2 = curveX(k * 3 + 3) + side * 1.75, z2 = (k * 3 + 3) * SP, dx = x2 - x, dz = z2 - z, len = Math.hypot(dx, dz);
      sq.makeRotationY(Math.atan2(dx, dz)); sr.makeScale(1, 1, len); sm.makeTranslation((x + x2) / 2, 0.8, (z + z2) / 2).multiply(sq).multiply(sr);
      ropeM.setMatrixAt(rn++, sm);
    }
  }
  postM.count = pn; ropeM.count = rn; postM.instanceMatrix.needsUpdate = ropeM.instanceMatrix.needsUpdate = true;

  // traffic
  CARS.forEach((car, i) => {
    const dir = car.lane ? 1 : -1, z = cz - 110 + wrap(car.base + dir * car.v * t - (cz - 110), 220);
    sr.makeRotationY(dir > 0 ? Math.PI : 0);
    if (z < -3) sm.makeScale(0, 0, 0); else sm.makeTranslation(car.lane ? -14.2 : -9.8, 0, z).multiply(sr);
    carM.setMatrixAt(i, sm); carLightM.setMatrixAt(i, sm); carM.setColorAt(i, car.col);
  });
  carM.count = carLightM.count = CARS.length; carM.instanceMatrix.needsUpdate = carLightM.instanceMatrix.needsUpdate = true; if (carM.instanceColor) carM.instanceColor.needsUpdate = true;
}

const SKIN = ['#f3d2b3', '#e8bb94', '#d19a6e', '#b57a52', '#8a5636', '#5b3a26'].map((c) => new THREE.Color(c));
const HAIR = ['#16110d', '#16110d', '#2e1d12', '#2e1d12', '#4a2f1a', '#4a2f1a', '#6e3a1c', '#b9904e', '#a9481f', '#8f8f8f', '#d9d5cd'].map((c) => new THREE.Color(c));
const PANTS = ['#26324a', '#2b2b33', '#6b5b43', '#3e5a7a', '#4a5240', '#5a3d2e', '#1f1f24', '#7a7466'].map((c) => new THREE.Color(c));
const GREY = ['#8f8f8f', '#b5b2ab', '#d9d5cd', '#ecebe6'].map((c) => new THREE.Color(c));
const DOG_COATS = ['#c9a06a', '#2a2420', '#f2ead8', '#8a5a32', '#d8b07a', '#6b6b6b', '#a0522d', '#e6d2a8'].map((c) => new THREE.Color(c));
const CAT_COATS = ['#2a2624', '#e8892e', '#9a9a9a', '#f0ece4', '#6e5a46', '#c8a878', '#4a4440'].map((c) => new THREE.Color(c));
const COLLARS = ['#c0392b', '#2e6fd8', '#2f9e6a', '#7a3fb0', '#d8a020'].map((c) => new THREE.Color(c));
const CANE = new THREE.Color('#5a3b22');
// Everyone's kind comes from their seed, so each visit (a new place at the back) draws a new one at random.
const KINDS = [['adult', 0.46], ['child', 0.15], ['senior', 0.12], ['wheelchair', 0.05], ['frame', 0.04], ['crutches', 0.04], ['dog', 0.08], ['cat', 0.06]];
const KIND_NAME = { adult: 'a grown-up', child: 'a child', senior: 'a senior citizen', wheelchair: 'a wheelchair user', frame: 'a person with a walking frame', crutches: 'a person on crutches', dog: 'a dog', cat: 'a cat' };
function kindOf(seed) {
  let x = hash01(seed + 991.7);
  for (const [k, p] of KINDS) { if (x < p) return k; x -= p; }
  return 'adult';
}
function makeTraits(seed) { // everything about a person's (or pet's) look comes from their seed
  const r = (k) => hash01(seed + k * 7.31);
  const kind = kindOf(seed);
  if (kind === 'dog' || kind === 'cat') {
    const dog = kind === 'dog', sz = dog ? 0.8 + 0.5 * r(1) : 0.9 + 0.2 * r(1), coats = dog ? DOG_COATS : CAT_COATS;
    return { kind, animal: true, sz, coat: coats[Math.floor(r(2) * coats.length)], collar: COLLARS[Math.floor(r(3) * COLLARS.length)], h: sz, lh: (dog ? 1.0 : 0.72) * sz };
  }
  // people with an aid are any age; walking frames and wheelchairs lean older
  const child = kind === 'child', senior = kind === 'senior' || (kind === 'frame' && r(30) < 0.7) || (kind === 'wheelchair' && r(31) < 0.3);
  let hairStyle = Math.floor(r(1) * 6); // short, long, bun, spiky, afro, bald
  if (child && hairStyle === 5) hairStyle = 0;
  if (senior && r(21) < 0.3) hairStyle = 5;
  const dyed = !senior && r(2) < 0.06;
  const hair = dyed ? new THREE.Color(['#2f5fc4', '#c43d86', '#2f9e6a'][Math.floor(r(3) * 3)])
    : senior ? GREY[Math.floor(r(4) * GREY.length)] : HAIR[Math.floor(r(4) * HAIR.length)];
  const skin = SKIN[Math.floor(r(5) * SKIN.length)];
  const f = r(6);
  const t = {
    kind, hairStyle, hair, skin, noseC: skin.clone().multiplyScalar(0.93),
    shirt: new THREE.Color().setHSL(r(8), child ? 0.55 + r(9) * 0.3 : senior ? 0.12 + r(9) * 0.2 : 0.3 + r(9) * 0.3, 0.38 + r(10) * 0.2),
    pants: PANTS[Math.floor(r(11) * PANTS.length)],
    glasses: r(12) < (child ? 0.1 : senior ? 0.6 : 0.22),
    facial: child || hairStyle === 1 || hairStyle === 2 ? 0 : f < 0.14 ? 1 : f < 0.28 ? 2 : 0, // beard / moustache
    fcol: hairStyle === 5 ? (senior ? GREY[1] : new THREE.Color('#3a2616')) : hair,
    w: child ? 0.64 + 0.07 * r(13) : 0.94 + 0.14 * r(13),
    h: child ? 0.58 + 0.12 * r(14) : senior ? 0.9 + 0.1 * r(14) : 0.92 + 0.16 * r(14),
    fx: 0.9 + 0.22 * r(15), fy: 0.96 + 0.1 * r(16), ns: child ? 0.7 : 0.8 + 0.6 * r(17),
    hd: child ? 1.32 : 1, phone: !child && r(18) < 0.2, chatty: r(19) < 0.16, // head scale: children have big heads for their size
    stoop: kind === 'frame' ? 0.10 + 0.05 * r(22) : kind === 'senior' ? 0.06 + 0.07 * r(22) : 0, // seniors lean forward a little; so do walking frame users
    cane: kind === 'senior' && r(23) < 0.45, // some seniors have a stick
    hurt: kind === 'crutches' ? (r(24) < 0.5 ? -1 : 1) : 0, // crutches: which leg is held up (-1 left, 1 right)
  };
  t.lh = 1.95 * t.h + (child ? 0.1 : 0) - (kind === 'wheelchair' ? SEAT_DROP : 0); // label height above the ground
  return t;
}

const entities = new Map(); // id -> {x,z,tx,tz,seed,pos,tr,walk?}
let state = { pos: null, total: 0, start: 1, items: [], you: null };
let curtainTarget = 0, curtainAmt = 0;

function addEntity(id, seed, pos) {
  const tx = curveX(pos) + (hash01(seed) - 0.5) * 0.7;
  const tz = pos * SP; // the front of the line (pos 0) is at z=0, the stage; the back of the line is nearest the camera
  let e = entities.get(id);
  if (!e) { e = { x: tx, z: tz, tx, tz, seed, pos, tr: makeTraits(seed) }; entities.set(id, e); }
  e.pos = pos;
  if (!e.walk) { e.tx = tx; e.tz = tz; }
}

function applyState(s) {
  state = s;
  const seen = new Set();
  (s.head || []).forEach(([id, seed], i) => { addEntity(id, seed, 1 + i); seen.add(id); });
  s.items.forEach(([id, seed], i) => { addEntity(id, seed, s.start + i); seen.add(id); });
  for (const [id, e] of entities) if (!seen.has(id) && !e.walk) entities.delete(id);
  curtainTarget = s.curtain ? 1 : 0;
  $('pos').textContent = s.pos ? `#${s.pos.toLocaleString()}` : '#–';
  $('tally').textContent = `${s.total.toLocaleString()} in line`;
  $('tally').title = `${Math.max(0, s.total - (s.pos ? 1 : 0)).toLocaleString()} others`;
  const me = s.you != null ? entities.get(s.you) : null;
  const who = me ? `You are ${KIND_NAME[me.tr.kind]}` : '';
  if ($('who').textContent !== who) $('who').textContent = who;
  stage.visible = s.start <= 12 || !!(s.head && s.head.length);
  syncShareBtn();
}

function startWalk(id) { const e = entities.get(id); if (e) e.walk = { t: 0 }; }

// ---------- camera rig + gestures ----------
// Touch: one finger orbits (sideways) and tilts (up/down); two fingers pinch to zoom, twist to turn and slide along the line.
//   Tap a person to focus on them; double-tap to come back to you. Flicks keep their momentum and the view settles on a person.
// Mouse: drag orbits and tilts; the wheel (or arrow keys) walks the line; ctrl+wheel zooms; right/middle drag or shift+drag slides.
// On screen: the rail on the right scrubs along the line (the arrows step one person, hold to run); the left cluster zooms and tilts.
const TAU = Math.PI * 2, DEFAULT_PITCH = 0.5, PITCH_MIN = 0.06, PITCH_MAX = 1.5, ZOOM_MIN = 0.25, ZOOM_MAX = 2.6;
let yaw = 0, pitch = DEFAULT_PITCH, zoom = 1;              // where the gestures are steering the camera
let viewYaw = 0, viewPitch = DEFAULT_PITCH, viewZoom = 1;  // what is drawn: eased towards the above
let vYaw = 0, vPitch = 0, vSlide = 0;                      // momentum left over from a flick
let panOffset = 0, panFront = 0, atFront = false, focusPos = 1, lastSlideT = 0, lastMove = 0;

const setZoom = (z) => { zoom = clamp(z, ZOOM_MIN, ZOOM_MAX); };
const setPitch = (p) => { pitch = clamp(p, PITCH_MIN, PITCH_MAX); };
function panBounds() {
  const base = state.pos ?? state.start;
  return [state.start - base, state.start + Math.max(0, state.items.length - 1) - base];
}
function slide(delta) {
  lastSlideT = performance.now();
  if (atFront) panFront = clamp(panFront + delta, -2, 11); // focus stays among the 14 people at the head
  else { const [lo, hi] = panBounds(); panOffset = clamp(panOffset + delta, lo, hi); }
}
function exitFront() { // leave the stage view, carrying on from wherever the camera is
  if (!atFront) return;
  const [lo, hi] = panBounds(), base = state.pos ?? state.start;
  panOffset = clamp(Math.round(focusPos) - base, lo, hi); atFront = false;
  $('tofront').textContent = 'Front';
}
function resetView() {
  yaw = Math.round(yaw / TAU) * TAU; pitch = DEFAULT_PITCH; zoom = 1; panOffset = 0; panFront = 0; atFront = false; vYaw = vPitch = vSlide = 0;
  $('tofront').textContent = 'Front';
}
function hideHint() { $('hint').classList.remove('on'); }

// tap a person to focus on them: slide to their place and move in a little
const pv = new THREE.Vector3();
function focusAt(cx, cy) {
  const r = canvas.getBoundingClientRect();
  let best = null, bs = 1e9;
  for (const e of entities.values()) {
    if (e.walk || !e.pos) continue;
    pv.set(e.x, e.tr.lh * 0.55, e.z);
    const dist = camera.position.distanceTo(pv);
    pv.project(camera);
    if (pv.z > 1 || pv.z < -1) continue;
    const d = Math.hypot((pv.x * 0.5 + 0.5) * r.width - (cx - r.left), (-pv.y * 0.5 + 0.5) * r.height - (cy - r.top));
    if (d > 46) continue;
    const score = d + dist * 0.5; // among people under the finger, the nearer one wins
    if (score < bs) { bs = score; best = e; }
  }
  if (!best) return false;
  exitFront();
  const base = state.pos ?? state.start, [lo, hi] = panBounds();
  panOffset = clamp(best.pos - base, lo, hi); lastSlideT = performance.now(); vSlide = 0;
  if (zoom > 0.6) setZoom(0.6);
  return true;
}

const ptrs = new Map();
let pinch0 = 0, zoom0 = 1, lastCy = 0, ang0 = 0, tapStart = null, lastTap = 0;
const angleOf = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
  hideHint(); vYaw = vPitch = vSlide = 0; // grabbing the view stops any drifting
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom; lastCy = (a.y + b.y) / 2; ang0 = angleOf(a, b); tapStart = null;
  } else tapStart = { t: performance.now(), x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const now = performance.now(), dt = Math.max(0.008, (now - p.t) / 1000);
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY; p.t = now; lastMove = now;
  if (ptrs.size === 1) {
    if (e.buttons & 6 || e.shiftKey) { // right/middle drag or shift+drag slides along the line
      const d = -dy * 0.035 * zoom; slide(d); vSlide += (d / dt - vSlide) * 0.4;
    } else {
      const dyaw = -dx * 0.0065, dpit = dy * 0.005;
      yaw += dyaw; setPitch(pitch + dpit);
      vYaw += (dyaw / dt - vYaw) * 0.4; vPitch += (dpit / dt - vPitch) * 0.4;
    }
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cy = (a.y + b.y) / 2, ang = angleOf(a, b);
    if (pinch0 > 0 && d > 0) setZoom(zoom0 * (pinch0 / d));
    let da = ang - ang0; if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU;
    yaw += da; ang0 = ang; // twist: the scene turns with your fingers
    slide(-(cy - lastCy) * 0.035 * zoom); lastCy = cy;
  }
});
const endPtr = (e) => {
  const now = performance.now();
  const tap = e.type === 'pointerup' && tapStart && now - tapStart.t < 250 && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 10;
  ptrs.delete(e.pointerId);
  if (ptrs.size || now - lastMove > 90) vYaw = vPitch = vSlide = 0; // only a flick that is still moving at release carries on
  vYaw = clamp(vYaw, -7, 7); vPitch = clamp(vPitch, -4, 4); vSlide = clamp(vSlide, -45, 45);
  if (tap) {
    if (now - lastTap < 320) { resetView(); lastTap = 0; } else { lastTap = now; focusAt(e.clientX, e.clientY); }
  }
  tapStart = null;
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault(); hideHint();
  if (e.ctrlKey || e.metaKey) setZoom(zoom * Math.exp(e.deltaY * 0.01)); // pinch on a trackpad, or ctrl+wheel
  else slide(clamp(e.deltaY, -120, 120) * 0.012 * Math.max(0.6, zoom)); // scroll down = towards the back of the line, up = towards the front
}, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  let used = true;
  switch (e.key) {
    case 'ArrowUp': case 'ArrowDown': {
      const up = e.key === 'ArrowUp';
      if (e.shiftKey) setPitch(pitch + (up ? 0.12 : -0.12)); else slide(up ? -1 : 1); // up = towards the front
      break;
    }
    case 'PageUp': slide(-8); break;
    case 'PageDown': slide(8); break;
    case 'ArrowLeft': yaw += 0.2; break;
    case 'ArrowRight': yaw -= 0.2; break;
    case '+': case '=': setZoom(zoom * 0.85); break;
    case '-': case '_': setZoom(zoom / 0.85); break;
    case 'Home': resetView(); break;
    case 'End': if (!atFront) $('tofront').click(); break;
    default: used = false;
  }
  if (used) { e.preventDefault(); hideHint(); }
});

// press-and-hold buttons: act once straight away, then keep going while held
function holdButton(el, step, first, rep) {
  let to = 0, iv = 0;
  const stop = () => { clearTimeout(to); clearInterval(iv); to = iv = 0; };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); hideHint(); vSlide = 0; stop(); step(first);
    to = setTimeout(() => { iv = setInterval(() => step(rep), 50); }, 330);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, stop);
}
holdButton($('up'), (a) => slide(-a), 1, 0.4);   // towards the front, one person per tap
holdButton($('down'), (a) => slide(a), 1, 0.4);  // towards the back
holdButton($('zin'), (a) => setZoom(zoom * a), 0.8, 0.96);
holdButton($('zout'), (a) => setZoom(zoom / a), 0.8, 0.96);

// vertical rails: press or drag anywhere on one to set its value (0 at the top, 1 at the bottom)
const RAIL_PAD = 14;
function bindRail(el, onFrac) {
  const rail = { dragging: false };
  const frac = (e) => { const r = el.getBoundingClientRect(); return clamp((e.clientY - r.top - RAIL_PAD) / Math.max(1, r.height - RAIL_PAD * 2), 0, 1); };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); el.setPointerCapture(e.pointerId); rail.dragging = true; el.classList.add('drag'); hideHint(); onFrac(frac(e));
  });
  el.addEventListener('pointermove', (e) => { if (rail.dragging) onFrac(frac(e)); });
  const end = () => { rail.dragging = false; el.classList.remove('drag'); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, end);
  return rail;
}
const railEl = $('rail'), scrub = bindRail(railEl, (f) => { // scrub along the line (the loaded stretch around you)
  exitFront();
  const lo = state.start, hi = state.start + Math.max(0, state.items.length - 1), base = state.pos ?? state.start, [a, b] = panBounds();
  panOffset = clamp(lo + f * (hi - lo) - base, a, b); vSlide = 0; lastSlideT = performance.now();
});
bindRail($('tilt'), (f) => { setPitch(PITCH_MAX - f * (PITCH_MAX - PITCH_MIN)); vPitch = 0; }); // top = bird's-eye, bottom = eye level

const railPos = (f) => `calc(${RAIL_PAD}px + (100% - ${RAIL_PAD * 2}px) * ${f.toFixed(4)})`;
let railKey = '';
function updateRails() {
  const lo = state.start, hi = lo + Math.max(0, state.items.length - 1), span = hi - lo, rp = Math.round(focusPos);
  const f = atFront || span < 1 ? 0 : clamp((focusPos - lo) / span, 0, 1);
  const yf = state.pos != null && span >= 1 ? (state.pos - lo) / span : -1;
  const pf = (PITCH_MAX - viewPitch) / (PITCH_MAX - PITCH_MIN);
  const key = `${f.toFixed(3)}|${yf.toFixed(3)}|${pf.toFixed(3)}|${lo}|${hi}|${rp}`;
  if (key === railKey) return;
  railKey = key;
  $('scroll').classList.toggle('flat', span < 1);
  $('thumb').style.top = railPos(f);
  $('railYou').style.top = railPos(clamp(yf, 0, 1)); $('railYou').style.display = yf >= 0 && yf <= 1 ? '' : 'none';
  $('railTip').textContent = `#${rp.toLocaleString()}`;
  $('railLo').textContent = `#${lo.toLocaleString()}`; $('railHi').textContent = `#${hi.toLocaleString()}`;
  $('tiltThumb').style.top = railPos(pf);
}

// the chip under the HUD says who the camera is on, and how far they are from you
const focusEl = $('focus'); let focusTxt = '', focusYou = false;
function updateFocusChip(list, count) {
  const rp = Math.round(focusPos);
  let e = null;
  for (let i = 0; i < count; i++) if (list[i].pos === rp && !list[i].walk) { e = list[i]; break; }
  let txt = '', you = false;
  if (e) {
    const rel = state.pos != null ? rp - state.pos : null;
    you = rel === 0;
    txt = `#${rp.toLocaleString()} · ${KIND_NAME[e.tr.kind]}`;
    if (you) txt += ' · you'; else if (rel != null) txt += ` · ${Math.abs(rel)} ${rel < 0 ? 'ahead of' : 'behind'} you`;
  }
  if (txt !== focusTxt) { focusTxt = txt; focusEl.textContent = txt; focusEl.classList.toggle('on', !!txt); }
  if (you !== focusYou) { focusYou = you; focusEl.classList.toggle('you', you); }
}

$('find').addEventListener('click', resetView);
$('tofront').addEventListener('click', () => {
  if (atFront) { resetView(); return; }
  atFront = true; panFront = 0; vSlide = 0; yaw = Math.round(yaw / TAU) * TAU; setPitch(0.34); setZoom(0.9);
  $('tofront').textContent = 'Back to me';
});
setTimeout(() => $('hint').classList.add('on'), 1200);
setTimeout(hideHint, 10000);

// ---------- render loop ----------
const dummy = new THREE.Object3D(); dummy.rotation.order = 'YXZ';
// place-in-line labels: DOM elements pinned above each head (projected from 3D, so they follow orbit and zoom)
const labelsEl = $('labels'), labelEls = [], lbE = [], lbY = [];
const v3 = new THREE.Vector3(), fwd = new THREE.Vector3();
function labelEl(i) {
  if (!labelEls[i]) { const d = document.createElement('div'); d.className = 'lbl'; labelsEl.appendChild(d); labelEls[i] = d; }
  return labelEls[i];
}
// what people say while they wait; each person speaks for a few seconds every 15-30s, on a rhythm and with lines drawn from their seed
const SAY = {
  adult: ['Is this the line?', 'How long now?', 'Has it moved?', 'My feet are killing me.', 'Anyone know what’s in there?', 'Worth it, surely.', 'Just one more minute…', 'I’ve been here ages.', 'Typical.', 'Don’t push!', 'I hope it’s good.', 'Is anyone even at the front?'],
  child: ['Are we there yet?', 'I’m bored!', 'Can I have a snack?', 'How much longer?', 'Why is it so slow?', 'I need the toilet.', 'Look, a doggy!', 'Carry me!'],
  senior: ['In my day this took a minute.', 'Is it moving?', 'What’s at the front?', 'Hmm? Speak up.', 'I’ve queued for less.', 'Mind my stick.', 'Wake me when it’s my turn.', 'Back in ’62 we knew what we were queueing for.'],
  wheelchair: ['Is it moving?', 'Mind the wheels.', 'I have all day.', 'Slowly, but surely.', 'Please don’t push.', 'Plenty of room here.', 'I can see everyone’s knees.'],
  frame: ['One step at a time.', 'Mind the frame.', 'No rush.', 'Slow and steady.', 'I’ll get there.', 'Is it moving?'],
  crutches: ['Hop, hop.', 'Mind the crutches.', 'Nearly there. Probably.', 'Is it moving?', 'I’ve been standing a while.', 'Mind my foot.'],
  dog: ['Woof!','Arf arf!', 'Sniff sniff…', 'Woof woof!', 'Walkies?', 'Bork!'],
  cat: ['Meow.', 'Mrrp?', 'Purr…', 'Hmph.', 'Mew!', 'Mrow.'],
  bouncer: ['Wait your turn.', 'Nobody skips.', 'Move along, please.', 'Keep it moving.', 'Behind the rope, sir.', 'Not yet.'],
  next: ['Next!', 'In you go.', 'Mind the step.'],
};
function speech(seed, kind, t) {
  const pool = SAY[kind], P = 15 + 15 * hash01(seed + 3.3), u = t + hash01(seed + 4.4) * P * 3, c = u % P, DUR = 4.4;
  if (!pool || c > DUR) return null;
  return { txt: pool[Math.floor(hash01(seed + Math.floor(u / P) * 1.7) * pool.length)], a: Math.min(1, c / 0.3, (DUR - c) / 0.6) };
}
const bubblesEl = $('bubbles'), bubEls = [], cands = [];
function bubEl(i) {
  if (!bubEls[i]) { const d = document.createElement('div'); d.className = 'bub'; bubblesEl.appendChild(d); bubEls[i] = d; }
  return bubEls[i];
}
// ---------- sound: positional, and tied to who is near the camera ----------
const snd = createSound();
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(ev, () => snd.unlock(), { passive: true }); // browsers need a first touch
const soundBtn = $('sound');
function soundLabel() { soundBtn.textContent = snd.muted ? 'Muted' : 'Sound'; soundBtn.setAttribute('aria-pressed', String(!snd.muted)); }
soundBtn.addEventListener('click', () => { snd.unlock(); snd.setMuted(!snd.muted); soundLabel(); });
soundLabel();
const hearRel = new THREE.Vector3();
function hear(e, y) { // how loud and where, for someone at (e, y) as heard from the camera
  hearRel.set(e.x - camera.position.x, y - camera.position.y, e.z - camera.position.z);
  const d = hearRel.length();
  if (d > 36) return null;
  const m = camera.matrixWorld.elements, side = (hearRel.x * m[0] + hearRel.y * m[1] + hearRel.z * m[2]) / Math.max(d, 1);
  return { g: Math.pow(clamp(7 / (d + 4), 0, 1), 1.5) * (1 - d / 36), p: clamp(side * 1.3, -1, 1), d };
}
function say(e, txt, dur, delay = 0) { e.say = { txt, from: elapsed + delay, until: elapsed + delay + dur }; } // a bubble outside the usual rhythm
const voiceOf = (e) => (e.tr.kind === 'child' ? 300 + 60 * hash01(e.seed + 2.2) : (100 + 120 * hash01(e.seed + 2.2)) * (e.tr.kind === 'senior' ? 0.92 : 1));
const pitchOf = (e) => voiceOf(e) / 150;
const waited = (e) => clamp(1 - e.pos / Math.max(state.total, 1), 0, 1); // the nearer the front, the longer they have stood here
function onSpeech(e, txt, y) { // a speech bubble has just opened: make the matching noise
  const h = hear(e, y);
  if (!h || h.g < 0.02) return;
  const k = e.tr.kind, o = { g: h.g, p: h.p };
  if (k === 'dog') snd.play(/sniff/i.test(txt) ? 'sniff' : 'bark', { ...o, pitch: 1 / e.tr.sz, n: /woof woof|arf arf/i.test(txt) ? 2 : 1 });
  else if (k === 'cat') snd.play(/purr/i.test(txt) ? 'purr' : /hmph/i.test(txt) ? 'huff' : /mrrp/i.test(txt) ? 'mrrp' : 'meow', { ...o, pitch: 0.9 + 0.25 * hash01(e.seed + 5.1) });
  else snd.play('murmur', { ...o, g: o.g * 0.8, f: voiceOf(e), n: clamp(Math.ceil(txt.length / 4), 2, 7) });
}
const FUMES = ['Ugh.', 'Seriously?', 'Come on.', 'This is ridiculous.', 'Oh, for goodness’ sake.', 'Hurry up.', 'I’ve had enough.'];
let sndPool = [], sndPeople = [], sndPoolT = 0;
function soundTick(dt, n, t) {
  if (!snd.active) return;
  if (!$('front').hidden) { snd.setCrowd(0); return; }
  sndPoolT -= dt;
  if (sndPoolT <= 0) { // who can be heard, refreshed a few times a second
    sndPoolT = 0.3; sndPool.length = 0; sndPeople.length = 0;
    let near = 0;
    for (let i = 0; i < n; i++) {
      const e = lbE[i];
      if (e.walk || !e.pos) continue;
      const y = lbY[i] + e.tr.lh * 0.85, h = hear(e, y);
      if (!h || h.g < 0.03) continue;
      const s = { e, y }; sndPool.push(s);
      if (!e.tr.animal) sndPeople.push(s);
      if (h.d < 16) near++;
    }
    snd.setCrowd(near);
  }
  if (!sndPeople.length) return;
  const crowd = clamp(sndPeople.length / 8, 0.2, 1), roll = (rate) => Math.random() < rate * crowd * dt;
  const someone = (ok) => { // a random person nearby, favouring the nearer of two picks
    const l = ok ? sndPeople.filter((s) => ok(s.e)) : sndPeople;
    if (!l.length) return null;
    const a = l[Math.floor(Math.random() * l.length)], b = l[Math.floor(Math.random() * l.length)];
    const ha = hear(a.e, a.y), hb = hear(b.e, b.y);
    return ha && hb ? (ha.g >= hb.g ? { ...a, h: ha } : { ...b, h: hb }) : null;
  };
  const free = (e) => !(e.say && elapsed < e.say.until);
  if (roll(0.7)) { const s = someone(free); if (s) snd.play('murmur', { g: s.h.g * 0.6, p: s.h.p, f: voiceOf(s.e), n: 2 + Math.floor(Math.random() * 3) }); } // quiet chatter
  if (roll(0.1)) { // a tired sigh, more often from those who have stood a long time
    const s = someone((e) => e.tr.kind === 'senior' || hash01(e.seed + 40) < 0.3 + 0.5 * waited(e));
    if (s) { snd.play('sigh', { g: s.h.g, p: s.h.p, pitch: pitchOf(s.e) }); say(s.e, 'Hhhh.', 1.6); }
  }
  if (roll(0.05)) { const s = someone(); if (s) { snd.play('laugh', { g: s.h.g, p: s.h.p, pitch: pitchOf(s.e) }); say(s.e, 'Ha ha.', 1.5); } }
  if (roll(0.022)) {
    const s = someone();
    if (s) { const L = snd.play('burp', { g: s.h.g, p: s.h.p, pitch: pitchOf(s.e) }); if (Math.random() < 0.5) say(s.e, 'Pardon me.', 1.8, L + 0.2); }
  }
  if (roll(0.028)) {
    const s = someone();
    if (s) {
      const L = snd.play('sneeze', { g: s.h.g, p: s.h.p, pitch: pitchOf(s.e) });
      say(s.e, 'Achoo.', 1.4, Math.max(0, L - 0.4));
      const nb = sndPeople.find((q) => q.e !== s.e && Math.abs(q.e.pos - s.e.pos) === 1 && free(q.e));
      if (nb && Math.random() < 0.55) say(nb.e, 'Bless you.', 1.6, L + 0.5);
    }
  }
  if (roll(0.028)) {
    const s = someone();
    if (s) {
      snd.play('fart', { g: s.h.g, p: s.h.p, pitch: pitchOf(s.e) });
      if (Math.random() < 0.5) say(s.e, 'Sorry.', 1.6, 1.0);
      const nb = sndPeople.find((q) => q.e !== s.e && Math.abs(q.e.pos - s.e.pos) === 1 && free(q.e));
      if (nb && Math.random() < 0.35) say(nb.e, 'Seriously?', 1.6, 1.8);
    }
  }
  // fed up: some people, more of them the longer they have waited, get through a bout of grumbling every minute or so
  for (const s of sndPeople) {
    const e = s.e;
    if (hash01(e.seed + 88) >= 0.06 + 0.3 * waited(e)) continue;
    const P = 45 + 60 * hash01(e.seed + 89), u = t + hash01(e.seed + 90) * P * 3, c = u % P, cyc = Math.floor(u / P);
    if (c > 7) continue;
    const r = hash01(e.seed + cyc * 3.1), steps = [[0.2, 'tsk'], [1.7, 'huff'], [3.3, r < 0.5 ? 'groan' : 'argh'], [5.4, r < 0.5 ? 'shout' : 'stomp']];
    for (let k = 0; k < steps.length; k++) {
      const key = cyc * 10 + k;
      if (c < steps[k][0] || (e._fu ?? -1) >= key) continue;
      e._fu = key;
      const h = hear(e, s.y);
      if (!h) break;
      snd.play(steps[k][1], { g: h.g * 1.6, p: h.p, pitch: pitchOf(e) });
      if (steps[k][1] !== 'huff' && steps[k][1] !== 'stomp') say(e, FUMES[Math.floor(hash01(e.seed + key * 1.9) * FUMES.length)], 2.2);
      break;
    }
  }
}

let lastT = 0, elapsed = 0;
let shareJob = null; // a picture of you in the line, waiting for the camera to settle (see the share section)
if (location.hash.startsWith('#debug')) window.__line = { get open() { return curtainAmt; }, get yaw() { return yaw; }, get pitch() { return pitch; }, get zoom() { return zoom; }, get focus() { return focusPos; }, get atFront() { return atFront; }, get walkers() { return [...entities.values()].filter((e) => e.walk).length; } };

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

function frame(now) {
  const dt = Math.min((now - (lastT || now)) / 1000, 0.1);
  lastT = now; elapsed += dt;
  const t = elapsed;
  resize();
  const k = 1 - Math.exp(-dt * 3);

  // curtains: ease open over 2s, closed over 1.6s; the scale gathers the velvet into deeper folds at the sides
  curtainAmt += clamp(curtainTarget - curtainAmt, -dt / 1.6, dt / 2.0);
  const ease = curtainAmt * curtainAmt * (3 - 2 * curtainAmt);
  curtainL.scale.x = curtainR.scale.x = 1 - 0.84 * ease;
  glow.material.opacity = 0.3 * ease;
  spill.intensity = 3 * ease;
  bouncers.forEach((b, i) => { b.scale.y = 1.3 * (1 + Math.sin(t * 1.1 + i * 2.3) * 0.006); }); // slow, steady breathing

  // people ease towards their target spots, so the line visibly shuffles forward; legs swing while they move
  let n = 0, hu = 0, gi = 0, bi = 0, si = 0, ki = 0, di = 0, ci = 0, wi = 0, fi = 0, ri = 0;
  hiN.fill(0);
  let you = null;
  for (const [id, e] of entities) {
    if (n >= MAX_INST) break;
    const tr = e.tr, px = e.x, pz = e.z;
    let y = Math.sin(t * 1.6 + e.seed) * 0.015, speed = 0;
    if (e.walk) { // the one at the head: waits a beat, then walks up onto the stage and into the dark
      e.walk.t += dt;
      if (e.walk.t > 0.4) { e.z -= 0.95 * dt; e.x += (0 - e.x) * (1 - Math.exp(-dt * 3)); speed = 0.95; }
      y += clamp((0.6 - e.z) / 0.6, 0, 1) * FLOOR;
      if (e.z < -1.35 || e.walk.t > 8) { entities.delete(id); continue; }
    } else {
      e.x += (e.tx - e.x) * k; e.z += (e.tz - e.z) * k;
      speed = dt > 0 ? Math.hypot(e.x - px, e.z - pz) / dt : 0;
    }
    e.amp = (e.amp || 0) + (clamp(speed * 0.9, 0, 0.65) - (e.amp || 0)) * Math.min(1, dt * 8);
    e.ph = (e.ph || 0) + speed * dt * 5;
    const sw = Math.sin(e.ph) * e.amp;
    if (speed > 0.4) y += Math.abs(Math.sin(e.ph)) * 0.03;
    const chair = tr.kind === 'wheelchair';
    dummy.position.set(e.x, y - (chair ? SEAT_DROP : 0), e.z);
    let yawA = 0, lean = 0, roll = 0;
    if (!e.walk) { // idle life: weight shifts, glances around, some check a phone, a few turn to look back along the line
      const idle = clamp(1 - speed * 2, 0, 1), sd = e.seed;
      yawA = Math.sin(sd) * 0.3 + Math.sin(t * 0.33 + sd * 3.1) * 0.2 * idle;
      roll = Math.sin(t * 0.7 + sd * 1.7) * 0.035 * idle;
      if (tr.phone) { const c = (t + hash01(sd + 2) * 16) % 16; lean = -0.3 * clamp(Math.min(c, 5 - c) * 1.5, 0, 1) * idle; }
      else if (tr.chatty) { const c = (t + hash01(sd + 3) * 23) % 23; yawA += (hash01(sd + 4) < 0.5 ? 1 : -1) * 1.5 * clamp(Math.min(c, 4 - c) * 1.2, 0, 1) * idle; }
    }
    dummy.rotation.set(lean - (tr.stoop || 0), yawA, roll); // seniors lean forward a little
    const isYou = id === state.you;
    if (tr.animal) {
      dummy.scale.setScalar(tr.sz);
      dummy.updateMatrix(); M.copy(dummy.matrix);
      const dog = tr.kind === 'dog', i = dog ? di++ : ci++, hip = dog ? DOG_HIP : CAT_HIP, sw2 = sw * 1.3;
      const [bm, la, lb, cm] = dog ? [dogM, dogLAM, dogLBM, dogCollarM] : [catM, catLAM, catLBM, catCollarM];
      bm.setMatrixAt(i, M); bm.setColorAt(i, tr.coat);
      cm.setMatrixAt(i, M); cm.setColorAt(i, isYou ? YOU_COLOR : tr.collar); // your collar is gold
      T.makeTranslation(0, hip, 0); T2.makeTranslation(0, -hip, 0);
      Q.makeRotationX(sw2); F.multiplyMatrices(M, T).multiply(Q).multiply(T2); la.setMatrixAt(i, F); la.setColorAt(i, tr.coat);
      Q.makeRotationX(-sw2); F.multiplyMatrices(M, T).multiply(Q).multiply(T2); lb.setMatrixAt(i, F); lb.setColorAt(i, tr.coat);
    } else {
      dummy.scale.set(tr.w, tr.h, tr.w);
      dummy.updateMatrix(); M.copy(dummy.matrix);
      const hn = hu++;
      shirtM.setMatrixAt(hn, M); shirtM.setColorAt(hn, isYou ? YOU_COLOR : tr.shirt);
      skinM.setMatrixAt(hn, M); skinM.setColorAt(hn, tr.skin);
      T.makeTranslation(0, 0.62, 0); T2.makeTranslation(0, -0.62, 0); // legs swing from the hip
      const swL = tr.hurt === -1 ? 0.7 : sw, swR = tr.hurt === 1 ? 0.7 : -sw; // on crutches one foot is held off the ground
      if (chair) { legLM.setMatrixAt(hn, ZERO); legRM.setMatrixAt(hn, ZERO); } // seated: the standing legs are hidden
      else {
        Q.makeRotationX(swL); F.multiplyMatrices(M, T).multiply(Q).multiply(T2); legLM.setMatrixAt(hn, F); legLM.setColorAt(hn, tr.pants);
        Q.makeRotationX(swR); F.multiplyMatrices(M, T).multiply(Q).multiply(T2); legRM.setMatrixAt(hn, F); legRM.setColorAt(hn, tr.pants);
      }
      // the head and everything on it scales about the head centre (children's heads are bigger for their size)
      T.makeTranslation(0, HY, 0); T2.makeTranslation(0, -HY, 0); S.makeScale(tr.hd, tr.hd, tr.hd);
      H.multiplyMatrices(M, T).multiply(S).multiply(T2);
      headM.setMatrixAt(hn, H); headM.setColorAt(hn, tr.skin);
      S.makeScale(tr.fx, tr.fy, 1); // face proportions
      F.multiplyMatrices(H, T).multiply(S).multiply(T2);
      faceM.setMatrixAt(hn, F);
      if (tr.glasses) glassM.setMatrixAt(gi++, F);
      T.makeTranslation(0, 1.375, -0.19); S.makeScale(tr.ns, tr.ns, tr.ns * 1.1);
      F.multiplyMatrices(H, T).multiply(S); noseM.setMatrixAt(hn, F); noseM.setColorAt(hn, tr.noseC);
      if (tr.facial === 1) { beardM.setMatrixAt(bi, H); beardM.setColorAt(bi, tr.fcol); bi++; }
      else if (tr.facial === 2) { T.makeTranslation(0, 1.345, -0.2); S.makeScale(tr.fx, 1, 1); F.multiplyMatrices(H, T).multiply(S); stacheM.setMatrixAt(si, F); stacheM.setColorAt(si, tr.fcol); si++; }
      if (tr.hairStyle < 5) { const hm = hairMs[tr.hairStyle], hi = hiN[tr.hairStyle]++; hm.setMatrixAt(hi, H); hm.setColorAt(hi, tr.hair); }
      if (tr.cane) { caneM.setMatrixAt(ki, M); caneM.setColorAt(ki, CANE); ki++; }
      if (tr.hurt) { crutchM.setMatrixAt(ri++, M); } // crutches move with the body
      if (chair || tr.kind === 'frame') { // the chair and the frame stay upright and only turn with the person
        AM.makeRotationY(yawA); AM.setPosition(e.x, y + (!chair && speed > 0.4 ? Math.abs(Math.sin(e.ph)) * 0.05 : 0), e.z); // a frame is lifted with each step
        if (chair) {
          chairM.setMatrixAt(wi, AM);
          e.rl = (e.rl || 0) + speed * dt; // distance rolled: the wheels turn as the line moves
          T.makeTranslation(0, 0.28, 0.12); Q.makeRotationX(-e.rl / 0.28); F.multiplyMatrices(AM, T).multiply(Q); bigWheelM.setMatrixAt(wi, F);
          T.makeTranslation(0, 0.07, -0.34); Q.makeRotationX(-e.rl / 0.07); F.multiplyMatrices(AM, T).multiply(Q); casterM.setMatrixAt(wi, F);
          sitLegM.setMatrixAt(wi, M); sitLegM.setColorAt(wi, tr.pants);
          wi++;
        } else frameM.setMatrixAt(fi++, AM);
      }
    }
    if (isYou) you = e;
    lbE[n] = e; lbY[n] = y;
    n++;
  }
  shirtM.count = skinM.count = headM.count = legLM.count = legRM.count = faceM.count = noseM.count = hu;
  glassM.count = gi; beardM.count = bi; stacheM.count = si; caneM.count = ki;
  chairM.count = bigWheelM.count = casterM.count = sitLegM.count = wi; frameM.count = fi; crutchM.count = ri;
  dogM.count = dogLAM.count = dogLBM.count = dogCollarM.count = di;
  catM.count = catLAM.count = catLBM.count = catCollarM.count = ci;
  hairMs.forEach((hm, i) => { hm.count = hiN[i]; });
  for (const m of allMeshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  marker.visible = ring.visible = !!you;
  if (you) { marker.position.set(you.x, (you.z < 0.6 ? FLOOR : 0) + you.tr.lh + 0.1 + Math.sin(t * 3) * 0.05, you.z); ring.position.set(you.x, 0.02, you.z); }

  // momentum: after a flick the view keeps turning / sliding and slows to a stop; with nothing touching it, it settles on a person
  const touching = ptrs.size > 0 || scrub.dragging;
  if (!touching) {
    if (Math.abs(vYaw) > 0.02 || Math.abs(vPitch) > 0.02) {
      const dec = Math.exp(-dt * 3.2);
      yaw += vYaw * dt; setPitch(pitch + vPitch * dt); vYaw *= dec; vPitch *= dec;
      if (pitch <= PITCH_MIN || pitch >= PITCH_MAX) vPitch = 0;
    } else vYaw = vPitch = 0;
    if (Math.abs(vSlide) > 0.3) { slide(vSlide * dt); vSlide *= Math.exp(-dt * 4); } else vSlide = 0;
    if (!vSlide && performance.now() - lastSlideT > 450) {
      const ks = 1 - Math.exp(-dt * 7);
      if (atFront) panFront += (Math.round(panFront) - panFront) * ks; else panOffset += (Math.round(panOffset) - panOffset) * ks;
    }
  }
  viewYaw += (yaw - viewYaw) * (1 - Math.exp(-dt * 18));
  viewPitch += (pitch - viewPitch) * (1 - Math.exp(-dt * 14));
  viewZoom += (zoom - viewZoom) * (1 - Math.exp(-dt * 9));

  // camera orbits the focus point (you, or whoever you slid to); "Front" flies it to the stage from anywhere in the line
  if (!atFront) { const [lo, hi] = panBounds(); panOffset = clamp(panOffset, lo, hi); }
  const target = atFront ? 3 + panFront : (state.pos ?? state.start) + panOffset;
  const diff = target - focusPos;
  focusPos += diff * (1 - Math.exp(-dt * (3 + Math.min(10, Math.abs(diff) * 0.01))));
  const fz = focusPos * SP, fx = curveX(focusPos);
  const d = 12.5 * viewZoom, cp = Math.cos(viewPitch), sp = Math.sin(viewPitch);
  camera.position.set(fx + Math.sin(viewYaw) * cp * d, 0.9 + sp * d, fz + Math.cos(viewYaw) * cp * d);
  // look past the focus so it sits in the lower third; zoomed in on someone, centre them at chest height instead (at the front: look straight at it)
  const close = clamp((1 - viewZoom) / 0.6, 0, 1);
  const ahead = atFront ? 0 : 14 * cp * (1 - 0.75 * close);
  camera.lookAt(fx - Math.sin(viewYaw) * ahead, atFront ? 1.8 : 0.6 + 0.45 * close, fz - Math.cos(viewYaw) * ahead);
  ground.position.set(camera.position.x, 0, camera.position.z);

  // labels: nearer ones are larger and stand on top; far ones fade out so the distant line stays readable
  camera.updateMatrixWorld();
  camera.getWorldDirection(fwd);
  const W = canvas.clientWidth, Hh = canvas.clientHeight;
  let li = 0;
  for (let i = 0; i < n; i++) {
    const e = lbE[i];
    if (e.walk || !e.pos) continue;
    const isYou = e === you;
    v3.set(e.x, lbY[i] + e.tr.lh + (isYou ? 0.55 : 0), e.z);
    const dist = camera.position.distanceTo(v3);
    const op = isYou ? 1 : clamp(1.15 - (dist - 12) / 20, 0, 1);
    if (op < 0.05 || (v3.x - camera.position.x) * fwd.x + (v3.y - camera.position.y) * fwd.y + (v3.z - camera.position.z) * fwd.z < 0.3) continue;
    v3.project(camera);
    if (v3.x < -1.1 || v3.x > 1.1 || v3.y < -1.1 || v3.y > 1.1) continue;
    const el = labelEl(li++);
    const txt = e.pos.toLocaleString();
    if (el._t !== txt) { el.textContent = txt; el._t = txt; }
    if (el._y !== isYou) { el.classList.toggle('you', isYou); el._y = isYou; }
    el.style.display = 'block';
    el.style.opacity = op.toFixed(2);
    el.style.zIndex = String(2000 - Math.round(dist * 10));
    const sc = isYou ? 1.15 : clamp(17 / dist, 0.62, 1.05);
    el.style.transform = `translate(${((v3.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-v3.y * 0.5 + 0.5) * Hh).toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(2)})`;
  }
  for (let j = li; j < labelEls.length; j++) labelEls[j].style.display = 'none';

  // speech bubbles: everyone chats now and then; only the few nearest speakers on screen are drawn
  cands.length = 0;
  const consider = (wx, wy, wz, sp, cls) => {
    if (!sp) return;
    v3.set(wx, wy, wz);
    const dist = camera.position.distanceTo(v3);
    if (dist > 26 || (v3.x - camera.position.x) * fwd.x + (v3.y - camera.position.y) * fwd.y + (v3.z - camera.position.z) * fwd.z < 0.3) return;
    v3.project(camera);
    if (v3.x < -1 || v3.x > 1 || v3.y < -1 || v3.y > 1) return;
    cands.push({ sx: (v3.x * 0.5 + 0.5) * W, sy: (-v3.y * 0.5 + 0.5) * Hh, dist: cls === 'you' ? dist - 6 : dist, d0: dist, txt: sp.txt, a: sp.a, cls });
  };
  for (let i = 0; i < n; i++) {
    const e = lbE[i];
    if (e.walk || !e.pos) continue;
    const base = speech(e.seed, e.tr.kind, t);
    if (base && !e._sp) onSpeech(e, base.txt, lbY[i] + e.tr.lh * 0.85);
    e._sp = !!base;
    const sy = e.say && elapsed >= e.say.from && elapsed < e.say.until ? { txt: e.say.txt, a: Math.min(1, (elapsed - e.say.from) / 0.3, (e.say.until - elapsed) / 0.5) } : null;
    consider(e.x, lbY[i] + e.tr.lh + 0.05, e.z, sy || base, e === you ? 'you' : '');
  }
  if (stage.visible) bouncers.forEach((b, i) => {
    const sp = curtainAmt > 0.6 && i === 0 ? { txt: SAY.next[Math.floor(t / 4) % SAY.next.length], a: 1 } : speech(9000 + i * 17, 'bouncer', t);
    consider(b.position.x, FLOOR + 2.55, b.position.z, sp, 'staff');
  });
  cands.sort((a, b) => a.dist - b.dist);
  const nb = Math.min(cands.length, 5);
  for (let j = 0; j < nb; j++) {
    const c = cands[j], el = bubEl(j), sc = c.cls === 'you' ? 1.1 : clamp(17 / c.d0, 0.7, 1.1);
    if (el._t !== c.txt) { el.textContent = c.txt; el._t = c.txt; }
    if (el._c !== c.cls) { el.className = `bub ${c.cls}`; el._c = c.cls; }
    el.style.display = 'block';
    el.style.opacity = c.a.toFixed(2);
    el.style.zIndex = String(3000 - Math.round(c.d0 * 10));
    el.style.transform = `translate(${c.sx.toFixed(1)}px, ${(c.sy - 26 * sc).toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(2)})`;
  }
  for (let j = nb; j < bubEls.length; j++) bubEls[j].style.display = 'none';
  updateFocusChip(lbE, n); updateRails();
  soundTick(dt, n, t);

  applyTime(worldHour());
  streetUpdate(camera.position.x, camera.position.z, t);
  renderer.render(scene, camera);
  if (shareJob) tickShare(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- whispers (rumours) ----------
let whisperTimer = 0;
function showWhisper(text) {
  const el = $('whisper');
  el.textContent = `“${text}”`;
  el.classList.add('on');
  clearTimeout(whisperTimer);
  whisperTimer = setTimeout(() => el.classList.remove('on'), 6500);
}

// everything the server can say; the preview build feeds this same function from an in-page simulator
function handleServer(m) {
  if (m.t === 'state') applyState(m);
  else if (m.t === 'whisper') showWhisper(m.text);
  else if (m.t === 'curtain') curtainTarget = m.open ? 1 : 0;
  else if (m.t === 'served') startWalk(m.id);
  else if (m.t === 'front') setTimeout(() => showFront(m), 4200); // watch yourself walk through first
}

// ---------- networking ----------
let token = null;
try { token = localStorage.getItem('line-token'); } catch {}
if (!token) {
  token = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^\w-]/g, '');
  try { localStorage.setItem('line-token', token); } catch {}
}

let ws = null, retry = 0, hb = 0, replaced = false;
function setStatus(s) { $('status').textContent = s; }

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ t: 'join', token })); };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'joined') { setStatus('waiting'); clearInterval(hb); hb = setInterval(() => send({ t: 'ping' }), 15000); if (document.hidden) send({ t: 'away' }); }
    else handleServer(m);
  };
  ws.onclose = (ev) => {
    clearInterval(hb);
    if (ev.code === 4000) { replaced = true; $('elsewhere').hidden = false; return; }
    setStatus('reconnecting…');
    // free players lose their place if away too long; the server decides on return
    setTimeout(connect, Math.min(5000, 400 * 2 ** retry++));
  };
}
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
connect();

document.addEventListener('visibilitychange', () => send({ t: document.hidden ? 'away' : 'back' }));

// ---------- the front of the line ----------
function showFront(m) {
  const sec = $('front');
  sec.className = `v${m.variant ?? 0}`;
  sec.hidden = false;
  syncShareBtn();
  $('after').hidden = true;
  $('finished').textContent = `${m.finished.toLocaleString()} have reached the front.`;
  $('wtext').value = '';
  $('wtext').disabled = false; $('wsend').disabled = false;
  setTimeout(() => { $('after').hidden = false; }, 4500);
}
$('wsend').addEventListener('click', () => {
  const text = $('wtext').value.trim();
  if (text.length >= 2) send({ t: 'whisper', text });
  $('wtext').disabled = true; $('wsend').disabled = true;
  $('wtext').value = '';
  $('wtext').placeholder = 'It drifts back down the line.';
});
$('rejoin').addEventListener('click', () => {
  send({ t: 'rejoin' });
  $('front').hidden = true;
  syncShareBtn();
  resetView();
});

// rules panel
const rulesEl = $('rules');
function setRules(on) { rulesEl.hidden = !on; (on ? $('rulesclose') : $('rulesbtn')).focus(); }
$('rulesbtn').addEventListener('click', () => setRules(true));
$('rulesclose').addEventListener('click', () => setRules(false));
rulesEl.addEventListener('click', (e) => { if (e.target === rulesEl) setRules(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !rulesEl.hidden) setRules(false); });

// ---------- share: a picture of you in the line, and the post that goes with it ----------
// The picture is made on the spot: the live scene drawn once from a fixed angle behind you, with the brand frame around it
// (question on top, your place in gold above your head, stuckinline.com below). Nothing is sent anywhere until you pick a button.
const SHARE_URL = 'https://stuckinline.com';
const SHARE_W = 1080, SHARE_H = 1350, SHARE_TOP = 280, SHARE_BOT = 160, SHARE_SCENE = SHARE_H - SHARE_TOP - SHARE_BOT;
const SHARE_FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const shareEl = $('share'), shareBtn = $('sharebtn');
const capCam = new THREE.PerspectiveCamera(52, SHARE_W / SHARE_SCENE, 0.1, 200), capV = new THREE.Vector3();
let shareBlob = null, shareObjUrl = '';

const shareText = (pos) => `I'm #${pos.toLocaleString()} in the line. What place are you? ${SHARE_URL}`;
function syncShareBtn() { $('sharebtn').hidden = !(state.pos && $('front').hidden); }

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function goldPill(g, cx, cy, text, size, padX, h) { // centred on (cx, cy); returns the box it took
  g.font = `800 ${size}px ${SHARE_FONT}`;
  const w = Math.ceil(g.measureText(text).width) + padX * 2;
  roundRect(g, cx - w / 2, cy - h / 2, w, h, h / 2); g.fillStyle = '#ffcf5c'; g.fill();
  g.fillStyle = '#14110a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cx, cy + size * 0.04);
  return { w, h };
}

function buildShareImage() {
  const me = state.you != null ? entities.get(state.you) : null;
  if (!me || !state.pos) throw new Error('not in the line');
  const out = document.createElement('canvas'); out.width = SHARE_W; out.height = SHARE_H;
  const g = out.getContext('2d');
  g.fillStyle = '#0b0d14'; g.fillRect(0, 0, SHARE_W, SHARE_H);

  // the scene: one frame from behind you, drawn at full size, then the live view is put back
  const ya = 0.2, pa = 0.42, d = 8.4, cp = Math.cos(pa);
  capCam.position.set(me.x + Math.sin(ya) * cp * d, 0.9 + Math.sin(pa) * d, me.z + Math.cos(ya) * cp * d);
  capCam.lookAt(me.x - Math.sin(ya) * 4.5, 1.0, me.z - Math.cos(ya) * 4.5);
  capCam.updateMatrixWorld();
  const pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1); renderer.setSize(SHARE_W, SHARE_SCENE, false);
  renderer.render(scene, capCam);
  g.drawImage(canvas, 0, SHARE_TOP);
  renderer.setPixelRatio(pr); renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.render(scene, camera);

  // your place, in gold, above your head
  capV.set(me.x, (me.z < 0.6 ? FLOOR : 0) + me.tr.lh + 1.05, me.z).project(capCam);
  const px = (capV.x * 0.5 + 0.5) * SHARE_W, py = SHARE_TOP + (-capV.y * 0.5 + 0.5) * SHARE_SCENE;
  g.font = `800 56px ${SHARE_FONT}`;
  const half = (g.measureText(`#${state.pos.toLocaleString()}`).width + 52) / 2;
  goldPill(g, clamp(px, half + 24, SHARE_W - half - 24), clamp(py, SHARE_TOP + 60, SHARE_TOP + SHARE_SCENE - 60), `#${state.pos.toLocaleString()}`, 56, 26, 84);

  // the frame: the question on top, the address and the wordmark below
  g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#e9e6dc'; g.font = `800 76px ${SHARE_FONT}`;
  g.fillText("What's your place", 64, 140); g.fillText('in the line?', 64, 222);
  const by = SHARE_H - SHARE_BOT / 2;
  goldPill(g, 64 + 150 + 30, by, 'stuckinline.com', 34, 30, 76);
  g.fillStyle = '#8c93a6'; g.font = `700 22px ${SHARE_FONT}`; g.textAlign = 'right'; g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = '4px';
  g.fillText('STUCK IN LINE', SHARE_W - 64, by);
  return out;
}

// the picture waits a moment for the camera to settle back on you (and the street around you to exist), then is taken inside the frame loop
function tickShare(now) {
  const j = shareJob;
  if (now < j.ready) return;
  const settled = !atFront && Math.abs(focusPos - (state.pos ?? state.start)) < 0.5;
  if (!settled && now < j.ready + 3000) return;
  shareJob = null;
  try { j.done(buildShareImage()); } catch (err) { j.fail(err); }
}

function clearShot() {
  if (shareObjUrl) URL.revokeObjectURL(shareObjUrl);
  shareObjUrl = ''; shareBlob = null;
  $('shotimg').hidden = true; $('shotimg').removeAttribute('src'); $('shotwait').hidden = false; $('shotwait').textContent = 'Finding you\u2026';
  $('shSave').classList.add('off'); $('shSave').setAttribute('aria-disabled', 'true'); $('shSave').removeAttribute('href');
}

function openShare() {
  if (!state.pos) return;
  const pos = state.pos, text = shareText(pos), t = encodeURIComponent(text), u = encodeURIComponent(SHARE_URL);
  clearShot();
  $('sharetext').textContent = text;
  $('shX').href = `https://x.com/intent/post?text=${t}`;
  $('shFb').href = `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`;
  $('shWa').href = `https://wa.me/?text=${t}`;
  $('shTg').href = `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text.replace(` ${SHARE_URL}`, ''))}`;
  $('shCopy').textContent = 'Copy text';
  const native = !!navigator.share;
  $('shNative').hidden = !native;
  $('shNative').classList.toggle('primary', native); $('shX').classList.toggle('primary', !native);
  shareEl.hidden = false; $('shareclose').focus();

  resetView(); // back to you; the picture is taken once the camera has settled
  let mine = null;
  const job = new Promise((done, fail) => { mine = shareJob = { ready: performance.now() + 250, done, fail }; });
  const timer = setTimeout(() => { if (shareJob === mine) { shareJob = null; mine.fail(new Error('timed out')); } }, 8000);
  job.then((c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no image'))), 'image/png')))
    .then((blob) => {
      if (shareEl.hidden) return; // closed while it was being made
      shareBlob = blob; shareObjUrl = URL.createObjectURL(blob);
      $('shotimg').src = shareObjUrl; $('shotimg').alt = `You in the line, marked #${pos.toLocaleString()}.`; $('shotimg').hidden = false; $('shotwait').hidden = true;
      $('shSave').href = shareObjUrl; $('shSave').classList.remove('off'); $('shSave').removeAttribute('aria-disabled');
    })
    .catch(() => { if (!shareEl.hidden) $('shotwait').textContent = 'No picture this time. The text still works.'; })
    .finally(() => clearTimeout(timer));
}
function closeShare() {
  shareEl.hidden = true; shareJob = null; clearShot(); shareBtn.focus();
}

shareBtn.addEventListener('click', openShare);
$('shareclose').addEventListener('click', closeShare);
shareEl.addEventListener('click', (e) => { if (e.target === shareEl) closeShare(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !shareEl.hidden) closeShare(); });

$('shNative').addEventListener('click', async () => {
  const data = { text: $('sharetext').textContent };
  if (shareBlob) {
    const file = new File([shareBlob], 'stuck-in-line.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
  }
  try { await navigator.share(data); } catch { /* closed without sharing */ }
});
$('shCopy').addEventListener('click', async () => {
  const text = $('sharetext').textContent;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove();
  }
  $('shCopy').textContent = 'Copied.';
});
