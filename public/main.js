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

// the door at the front
const door = new THREE.Group();
door.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.2).translate(0, 1.7, 0), new THREE.MeshLambertMaterial({ color: 0x2a2c3a })));
door.add(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.8).translate(0, 1.5, 0.11), new THREE.MeshBasicMaterial({ color: 0xfff1c4 })));
const doorGlow = new THREE.PointLight(0xffe7a8, 2.2, 14);
doorGlow.position.set(0, 2, 1.5);
door.add(doorGlow);
door.visible = false;
scene.add(door);

// ---------- world model ----------
const curveX = (pos) => Math.sin(pos * 0.05) * 1.1 + Math.sin(pos * 0.017) * 1.6;
const hash01 = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

const entities = new Map(); // id -> {x,z,tx,tz,seed}
let state = { pos: null, total: 0, start: 1, items: [], you: null };
let focusPos = 1, panOffset = 0, zoom = 1;

function applyState(s) {
  state = s;
  const seen = new Set();
  s.items.forEach(([id, seed], i) => {
    const pos = s.start + i;
    const tx = curveX(pos) + (hash01(seed) - 0.5) * 0.7;
    const tz = pos * SP; // front of the line (pos 0) is far away at z=0; the back is nearest the camera
    let e = entities.get(id);
    if (!e) { e = { x: tx, z: tz + 0.0, tx, tz, seed }; entities.set(id, e); }
    e.tx = tx; e.tz = tz;
    seen.add(id);
  });
  for (const id of entities.keys()) if (!seen.has(id)) entities.delete(id);
  $('pos').textContent = s.pos ? `#${s.pos.toLocaleString()}` : '#–';
  const others = Math.max(0, s.total - (s.pos ? 1 : 0));
  $('tally').textContent = `${s.total.toLocaleString()} in line`;
  $('tally').title = `${others.toLocaleString()} others`;
  if (s.start <= 6) { door.position.set(curveX(0), 0, 0); door.visible = true; } else door.visible = false;
}

// ---------- camera rig + gestures ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function panBounds() {
  const base = state.pos ?? state.start;
  return [state.start - base, state.start + Math.max(0, state.items.length - 1) - base];
}
const ptrs = new Map();
let pinch0 = 0, zoom0 = 1, tapStart = null, lastTap = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom; tapStart = null; }
  else tapStart = { t: performance.now(), x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  if (ptrs.size === 1) {
    const [lo, hi] = panBounds();
    panOffset = clamp(panOffset - (e.clientY - p.y) * 0.035 * zoom, lo, hi);
  }
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0 > 0) zoom = clamp(zoom0 * (pinch0 / d), 0.55, 2.4);
  }
});
const endPtr = (e) => {
  ptrs.delete(e.pointerId);
  if (tapStart && performance.now() - tapStart.t < 250 && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 10) {
    if (performance.now() - lastTap < 320) { panOffset = 0; zoom = 1; lastTap = 0; } else lastTap = performance.now();
  }
  tapStart = null;
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = clamp(zoom * (1 + Math.sign(e.deltaY) * 0.1), 0.55, 2.4); }, { passive: false });
$('find').addEventListener('click', () => { panOffset = 0; zoom = 1; });

// ---------- render loop ----------
const dummy = new THREE.Object3D();
const color = new THREE.Color();
let lastT = 0, elapsed = 0;

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

  // people ease towards their target spots, so the line visibly shuffles forward
  let n = 0;
  let you = null;
  for (const [id, e] of entities) {
    if (n >= MAX_INST) break;
    e.x += (e.tx - e.x) * k; e.z += (e.tz - e.z) * k;
    const bob = Math.sin(t * 1.6 + e.seed) * 0.02;
    dummy.position.set(e.x, bob, e.z);
    dummy.rotation.y = Math.sin(e.seed) * 0.3;
    dummy.updateMatrix();
    bodies.setMatrixAt(n, dummy.matrix); heads.setMatrixAt(n, dummy.matrix);
    const isYou = id === state.you;
    if (isYou) { you = e; color.setHex(0xffcf5c); bodies.setColorAt(n, color); }
    else { color.setHSL(hash01(e.seed + 1), 0.35 + hash01(e.seed + 2) * 0.25, 0.42 + hash01(e.seed + 3) * 0.18); bodies.setColorAt(n, color); }
    color.setHSL(0.07 + hash01(e.seed + 4) * 0.05, 0.4, 0.55 + hash01(e.seed + 5) * 0.25);
    heads.setColorAt(n, color);
    n++;
  }
  bodies.count = heads.count = n;
  bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = heads.instanceColor.needsUpdate = true;
  marker.visible = ring.visible = !!you;
  if (you) { marker.position.set(you.x, 1.75 + Math.sin(t * 3) * 0.06, you.z); ring.position.set(you.x, 0.02, you.z); }

  // camera: behind and above the focus, so you sit in the lower third and the line recedes upward
  const [lo, hi] = panBounds();
  panOffset = clamp(panOffset, lo, hi);
  const target = (state.pos ?? state.start) + panOffset;
  focusPos += (target - focusPos) * (1 - Math.exp(-dt * 4));
  const fz = focusPos * SP, fx = curveX(focusPos);
  camera.position.set(fx, 3.4 + 3.4 * zoom, fz + 8.5 * zoom + 2);
  camera.lookAt(curveX(focusPos - 12), 0.6, fz - 14);
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
    else if (m.t === 'state') applyState(m);
    else if (m.t === 'whisper') showWhisper(m.text);
    else if (m.t === 'front') showFront(m);
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
  panOffset = 0; zoom = 1;
});
