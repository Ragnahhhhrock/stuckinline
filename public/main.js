import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const SP = 1.15; // spacing between people along the line
const MAX_INST = 160;

// ---------- scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const HORIZON = 0x141623;
{
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#34305a'); grad.addColorStop(0.26, '#141623'); grad.addColorStop(1, '#141623');
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}
scene.fog = new THREE.Fog(HORIZON, 22, 95);
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);

scene.add(new THREE.AmbientLight(0xb8bfd8, 0.9));
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

const shirtGeo = mergeParts([
  bp(Box(0.46, 0.56, 0.25), { p: [0, 0.90, 0] }),
  bp(Box(0.12, 0.50, 0.13), { p: [-0.30, 0.89, 0] }), bp(Box(0.12, 0.50, 0.13), { p: [0.30, 0.89, 0] }), // arms
]);
const skinGeo = mergeParts([
  bp(Sph(0.2, 14, 10), { s: [1, 1.08, 1], p: [0, HY, 0] }), // head
  bp(new THREE.CylinderGeometry(0.065, 0.07, 0.1, 8), { p: [0, 1.2, 0] }), // neck
  bp(Sph(0.045, 8, 6), { s: [0.5, 1, 0.8], p: [-0.2, 1.39, 0.01] }), bp(Sph(0.045, 8, 6), { s: [0.5, 1, 0.8], p: [0.2, 1.39, 0.01] }), // ears
  bp(Sph(0.062, 8, 6), { p: [-0.30, 0.60, 0] }), bp(Sph(0.062, 8, 6), { p: [0.30, 0.60, 0] }), // hands
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
const shirtM = mk(shirtGeo), skinM = mk(skinGeo), legLM = mk(legGeo(-0.105), true), legRM = mk(legGeo(0.105), true);
const faceM = mk(faceGeo, true), noseM = mk(noseGeo), glassM = mk(glassesGeo, true), beardM = mk(beardGeo, false, true), stacheM = mk(stacheGeo);
const hairMs = hairGeos.map((g) => mk(g, false, true));
const allMeshes = [shirtM, skinM, legLM, legRM, faceM, noseM, glassM, beardM, stacheM, ...hairMs];
const hiN = [0, 0, 0, 0, 0];
const M = new THREE.Matrix4(), T = new THREE.Matrix4(), T2 = new THREE.Matrix4(), S = new THREE.Matrix4(), Q = new THREE.Matrix4(), F = new THREE.Matrix4();
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
const limb = (a, b, t, c) => { // a box of thickness t from point a to point b
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = Box(t, d.length(), t).toNonIndexed();
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  g.userData.c = c; return g;
};
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

const SKIN = ['#f3d2b3', '#e8bb94', '#d19a6e', '#b57a52', '#8a5636', '#5b3a26'].map((c) => new THREE.Color(c));
const HAIR = ['#16110d', '#16110d', '#2e1d12', '#2e1d12', '#4a2f1a', '#4a2f1a', '#6e3a1c', '#b9904e', '#a9481f', '#8f8f8f', '#d9d5cd'].map((c) => new THREE.Color(c));
const PANTS = ['#26324a', '#2b2b33', '#6b5b43', '#3e5a7a', '#4a5240', '#5a3d2e', '#1f1f24', '#7a7466'].map((c) => new THREE.Color(c));
function makeTraits(seed) { // everything about a person's look comes from their seed
  const r = (k) => hash01(seed + k * 7.31);
  const hairStyle = Math.floor(r(1) * 6); // short, long, bun, spiky, afro, bald
  const dyed = r(2) < 0.06;
  const hair = dyed ? new THREE.Color(['#2f5fc4', '#c43d86', '#2f9e6a'][Math.floor(r(3) * 3)]) : HAIR[Math.floor(r(4) * HAIR.length)];
  const skin = SKIN[Math.floor(r(5) * SKIN.length)];
  const f = r(6);
  return {
    hairStyle, hair, skin, noseC: skin.clone().multiplyScalar(0.93),
    shirt: new THREE.Color().setHSL(r(8), 0.3 + r(9) * 0.3, 0.38 + r(10) * 0.2), pants: PANTS[Math.floor(r(11) * PANTS.length)],
    glasses: r(12) < 0.22, facial: hairStyle === 1 || hairStyle === 2 ? 0 : f < 0.14 ? 1 : f < 0.28 ? 2 : 0, // beard / moustache
    fcol: hairStyle === 5 ? new THREE.Color('#3a2616') : hair,
    w: 0.94 + 0.14 * r(13), h: 0.92 + 0.16 * r(14), fx: 0.9 + 0.22 * r(15), fy: 0.96 + 0.1 * r(16), ns: 0.8 + 0.6 * r(17),
  };
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
  stage.visible = s.start <= 12 || !!(s.head && s.head.length);
}

function startWalk(id) { const e = entities.get(id); if (e) e.walk = { t: 0 }; }

// ---------- camera rig + gestures ----------
// One finger (or left drag) orbits. Two fingers pinch to zoom and slide along the line. On a desktop:
// wheel zooms, right drag or shift+drag slides.
const DEFAULT_PITCH = 0.5;
let yaw = 0, pitch = DEFAULT_PITCH, zoom = 1;
let panOffset = 0, panFront = 0, atFront = false, focusPos = 1;

function panBounds() {
  const base = state.pos ?? state.start;
  return [state.start - base, state.start + Math.max(0, state.items.length - 1) - base];
}
function slide(delta) {
  if (atFront) panFront = clamp(panFront + delta, -2, 11); // focus stays among the 14 people at the head
  else { const [lo, hi] = panBounds(); panOffset = clamp(panOffset + delta, lo, hi); }
}
function resetView() {
  yaw = 0; pitch = DEFAULT_PITCH; zoom = 1; panOffset = 0; panFront = 0; atFront = false;
  $('tofront').textContent = 'Front';
}
function hideHint() { $('hint').classList.remove('on'); }

const ptrs = new Map();
let pinch0 = 0, zoom0 = 1, lastCy = 0, tapStart = null, lastTap = 0;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  hideHint();
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom; lastCy = (a.y + b.y) / 2; tapStart = null;
  } else tapStart = { t: performance.now(), x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 1) {
    if ((e.buttons & 2) || e.shiftKey) slide(-dy * 0.035 * zoom);
    else { yaw -= dx * 0.0065; pitch = clamp(pitch + dy * 0.005, 0.1, 1.45); }
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), cy = (a.y + b.y) / 2;
    if (pinch0 > 0 && d > 0) zoom = clamp(zoom0 * (pinch0 / d), 0.35, 2.6);
    slide(-(cy - lastCy) * 0.035 * zoom); lastCy = cy;
  }
});
const endPtr = (e) => {
  ptrs.delete(e.pointerId);
  if (tapStart && performance.now() - tapStart.t < 250 && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 10) {
    if (performance.now() - lastTap < 320) { resetView(); lastTap = 0; } else lastTap = performance.now();
  }
  tapStart = null;
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault(); hideHint();
  if (e.shiftKey) slide(Math.sign(e.deltaY) * 0.6);
  else zoom = clamp(zoom * (1 + Math.sign(e.deltaY) * 0.1), 0.35, 2.6);
}, { passive: false });
$('find').addEventListener('click', resetView);
$('tofront').addEventListener('click', () => {
  if (atFront) { resetView(); return; }
  atFront = true; panFront = 0; yaw = 0; pitch = 0.34; zoom = 0.9;
  $('tofront').textContent = 'Back to me';
});
setTimeout(() => $('hint').classList.add('on'), 1200);
setTimeout(hideHint, 10000);

// ---------- render loop ----------
const dummy = new THREE.Object3D();
// place-in-line labels: DOM elements pinned above each head (projected from 3D, so they follow orbit and zoom)
const labelsEl = $('labels'), labelEls = [], lbE = [], lbY = [];
const v3 = new THREE.Vector3(), fwd = new THREE.Vector3();
function labelEl(i) {
  if (!labelEls[i]) { const d = document.createElement('div'); d.className = 'lbl'; labelsEl.appendChild(d); labelEls[i] = d; }
  return labelEls[i];
}
let lastT = 0, elapsed = 0;
if (location.hash === '#debug') window.__line = { get open() { return curtainAmt; }, get yaw() { return yaw; }, get atFront() { return atFront; }, get walkers() { return [...entities.values()].filter((e) => e.walk).length; } };

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
  let n = 0, gi = 0, bi = 0, si = 0;
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
    dummy.position.set(e.x, y, e.z);
    dummy.rotation.set(0, e.walk ? 0 : Math.sin(e.seed) * 0.3, 0);
    dummy.scale.set(tr.w, tr.h, tr.w);
    dummy.updateMatrix(); M.copy(dummy.matrix);
    const isYou = id === state.you;
    shirtM.setMatrixAt(n, M); shirtM.setColorAt(n, isYou ? YOU_COLOR : tr.shirt);
    skinM.setMatrixAt(n, M); skinM.setColorAt(n, tr.skin);
    T.makeTranslation(0, 0.62, 0); T2.makeTranslation(0, -0.62, 0); // legs swing from the hip
    Q.makeRotationX(sw); F.multiplyMatrices(M, T).multiply(Q).multiply(T2); legLM.setMatrixAt(n, F); legLM.setColorAt(n, tr.pants);
    Q.makeRotationX(-sw); F.multiplyMatrices(M, T).multiply(Q).multiply(T2); legRM.setMatrixAt(n, F); legRM.setColorAt(n, tr.pants);
    T.makeTranslation(0, HY, 0); T2.makeTranslation(0, -HY, 0); S.makeScale(tr.fx, tr.fy, 1); // face proportions: scaled about the head
    F.multiplyMatrices(M, T).multiply(S).multiply(T2);
    faceM.setMatrixAt(n, F);
    if (tr.glasses) glassM.setMatrixAt(gi++, F);
    T.makeTranslation(0, 1.375, -0.19); S.makeScale(tr.ns, tr.ns, tr.ns * 1.1);
    F.multiplyMatrices(M, T).multiply(S); noseM.setMatrixAt(n, F); noseM.setColorAt(n, tr.noseC);
    if (tr.facial === 1) { beardM.setMatrixAt(bi, M); beardM.setColorAt(bi, tr.fcol); bi++; }
    else if (tr.facial === 2) { T.makeTranslation(0, 1.345, -0.2); S.makeScale(tr.fx, 1, 1); F.multiplyMatrices(M, T).multiply(S); stacheM.setMatrixAt(si, F); stacheM.setColorAt(si, tr.fcol); si++; }
    if (tr.hairStyle < 5) { const hm = hairMs[tr.hairStyle], hi = hiN[tr.hairStyle]++; hm.setMatrixAt(hi, M); hm.setColorAt(hi, tr.hair); }
    if (isYou) you = e;
    lbE[n] = e; lbY[n] = y;
    n++;
  }
  shirtM.count = skinM.count = legLM.count = legRM.count = faceM.count = noseM.count = n;
  glassM.count = gi; beardM.count = bi; stacheM.count = si;
  hairMs.forEach((hm, i) => { hm.count = hiN[i]; });
  for (const m of allMeshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  marker.visible = ring.visible = !!you;
  if (you) { marker.position.set(you.x, (you.z < 0.6 ? FLOOR : 0) + 2.05 * you.tr.h + Math.sin(t * 3) * 0.05, you.z); ring.position.set(you.x, 0.02, you.z); }

  // camera orbits the focus point (you, or whoever you slid to); "Front" flies it to the stage from anywhere in the line
  if (!atFront) { const [lo, hi] = panBounds(); panOffset = clamp(panOffset, lo, hi); }
  const target = atFront ? 3 + panFront : (state.pos ?? state.start) + panOffset;
  const diff = target - focusPos;
  focusPos += diff * (1 - Math.exp(-dt * (3 + Math.min(10, Math.abs(diff) * 0.01))));
  const fz = focusPos * SP, fx = curveX(focusPos);
  const d = 12.5 * zoom, cp = Math.cos(pitch), sp = Math.sin(pitch);
  camera.position.set(fx + Math.sin(yaw) * cp * d, 0.9 + sp * d, fz + Math.cos(yaw) * cp * d);
  const ahead = atFront ? 0 : 14 * cp; // look past the focus so it sits in the lower third (at the front: look straight at it)
  camera.lookAt(fx - Math.sin(yaw) * ahead, atFront ? 1.8 : 0.6, fz - Math.cos(yaw) * ahead);
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
    v3.set(e.x, lbY[i] + (isYou ? 2.5 : 1.95) * e.tr.h, e.z);
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

  renderer.render(scene, camera);
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
  resetView();
});
