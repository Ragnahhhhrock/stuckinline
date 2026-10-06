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

// avatars: one instanced body + head, low poly
const bodyGeo = new THREE.CylinderGeometry(0.27, 0.34, 0.9, 8).translate(0, 0.45, 0);
const headGeo = new THREE.SphereGeometry(0.22, 8, 6).translate(0, 1.12, 0);
const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_INST);
const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_INST);
bodies.frustumCulled = heads.frustumCulled = false;
scene.add(bodies, heads);

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
stage.visible = false;
scene.add(stage);

// ---------- world model ----------
const curveX = (pos) => Math.sin(pos * 0.05) * 1.1 + Math.sin(pos * 0.017) * 1.6;
const hash01 = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const entities = new Map(); // id -> {x,z,tx,tz,seed,walk?}
let state = { pos: null, total: 0, start: 1, items: [], you: null };
let curtainTarget = 0, curtainAmt = 0;

function addEntity(id, seed, pos) {
  const tx = curveX(pos) + (hash01(seed) - 0.5) * 0.7;
  const tz = pos * SP; // the front of the line (pos 0) is at z=0, the stage; the back of the line is nearest the camera
  let e = entities.get(id);
  if (!e) { e = { x: tx, z: tz, tx, tz, seed }; entities.set(id, e); }
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
const color = new THREE.Color();
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

  // people ease towards their target spots, so the line visibly shuffles forward
  let n = 0;
  let you = null;
  for (const [id, e] of entities) {
    if (n >= MAX_INST) break;
    let y = Math.sin(t * 1.6 + e.seed) * 0.02;
    if (e.walk) { // the one at the head: waits a beat, then walks up onto the stage and into the dark
      e.walk.t += dt;
      if (e.walk.t > 0.4) { e.z -= 0.95 * dt; e.x += (0 - e.x) * (1 - Math.exp(-dt * 3)); y = Math.abs(Math.sin(t * 5)) * 0.04; }
      y += clamp((0.6 - e.z) / 0.6, 0, 1) * FLOOR;
      if (e.z < -1.35 || e.walk.t > 8) { entities.delete(id); continue; }
    } else { e.x += (e.tx - e.x) * k; e.z += (e.tz - e.z) * k; }
    dummy.position.set(e.x, y, e.z);
    dummy.rotation.y = e.walk ? 0 : Math.sin(e.seed) * 0.3;
    dummy.updateMatrix();
    bodies.setMatrixAt(n, dummy.matrix); heads.setMatrixAt(n, dummy.matrix);
    if (id === state.you) { you = e; color.setHex(0xffcf5c); bodies.setColorAt(n, color); }
    else { color.setHSL(hash01(e.seed + 1), 0.35 + hash01(e.seed + 2) * 0.25, 0.42 + hash01(e.seed + 3) * 0.18); bodies.setColorAt(n, color); }
    color.setHSL(0.07 + hash01(e.seed + 4) * 0.05, 0.4, 0.55 + hash01(e.seed + 5) * 0.25);
    heads.setColorAt(n, color);
    n++;
  }
  bodies.count = heads.count = n;
  bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = heads.instanceColor.needsUpdate = true;
  marker.visible = ring.visible = !!you;
  if (you) { marker.position.set(you.x, you.z < 0.6 ? 1.75 + FLOOR : 1.75 + Math.sin(t * 3) * 0.06, you.z); ring.position.set(you.x, 0.02, you.z); }

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
