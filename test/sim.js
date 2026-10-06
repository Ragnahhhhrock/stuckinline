'use strict';
// Server behaviour tests: ordering, grace/reload restore, back-of-line on return, away timeout, front-of-line flow.
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');
const WebSocket = require('ws');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(port, env) {
  const child = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve) => child.stdout.once('data', () => resolve(child)));
}

function client(port, token) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, token, last: null, msgs: [], closed: null };
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    c.msgs.push(m);
    if (m.t === 'state') c.last = m;
  });
  ws.on('close', (code) => { c.closed = code; });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.ready = new Promise((r) => ws.on('open', () => { c.send({ t: 'join', token }); r(); }));
  c.waitFor = async (pred, ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hit = c.msgs.find(pred);
      if (hit) return hit;
      await sleep(25);
    }
    throw new Error('timeout waiting for message');
  };
  c.fresh = async () => { // wait for a state received after now
    const n = c.msgs.length;
    await c.waitFor((m) => c.msgs.indexOf(m) >= n && m.t === 'state', 3000);
    return c.last;
  };
  return c;
}

async function phase1() {
  console.log('phase 1: ordering, grace restore, back of line, away timeout');
  const port = 3991;
  const srv = await startServer(port, { TICK_MS: '1000000000', GRACE_MS: '1200', INITIAL_NPCS: '20' });
  try {
    const A = client(port, 'token-aaaaaaaa'); await A.ready;
    let s = await A.fresh();
    assert.strictEqual(s.pos, 21, 'first player joins at the back (after 20 NPCs)');
    const B = client(port, 'token-bbbbbbbb'); await B.ready;
    s = await B.fresh();
    assert.strictEqual(s.pos, 22, 'second player is behind the first');
    assert.strictEqual(s.total, 22, 'tally counts everyone');

    A.ws.close(); await sleep(400);
    const A2 = client(port, 'token-aaaaaaaa'); await A2.ready;
    s = await A2.fresh();
    assert.strictEqual(s.pos, 21, 'reconnect within grace restores place');

    A2.ws.close(); await sleep(2500);
    const A3 = client(port, 'token-aaaaaaaa'); await A3.ready;
    s = await A3.fresh();
    assert.strictEqual(s.pos, 22, 'return after grace goes to the back');
    s = await B.fresh();
    assert.strictEqual(s.pos, 21, 'player behind moved up when the other left');

    B.send({ t: 'away' }); await sleep(2200);
    assert.strictEqual(B.closed, 4001, 'free player away past grace is removed');
    s = await A3.fresh();
    assert.strictEqual(s.pos, 21, 'removal moves everyone behind up');
    console.log('  ok');
  } finally { srv.kill(); }
}

async function phase2() {
  console.log('phase 2: reaching the front, whisper, rejoin at back');
  const port = 3992;
  const srv = await startServer(port, { TICK_MS: '80', GRACE_MS: '1000', INITIAL_NPCS: '40', SHOW_PLAYER_WHISPERS: '1' });
  try {
    const A = client(port, 'token-cccccccc'); await A.ready;
    const front = await A.waitFor((m) => m.t === 'front', 15000);
    assert.ok(front.finished >= 1, 'front message carries the all-time count');
    A.send({ t: 'whisper', text: 'it smelled of rain' });
    await sleep(150);
    A.send({ t: 'rejoin' });
    const fi = A.msgs.findIndex((x) => x.t === 'front');
    const s = await A.waitFor((m) => m.t === 'state' && m.pos !== null && A.msgs.indexOf(m) > fi, 4000);
    assert.ok(s.pos >= 1, 'rejoined line');
    assert.ok(s.pos <= s.total, 'position within tally');

    // curtains: open before the person is served, close after; the player's own walk-through is announced
    const youId = A.msgs.find((m) => m.t === 'state' && m.you).you;
    const servedIdx = A.msgs.findIndex((m) => m.t === 'served' && m.id === youId);
    assert.ok(servedIdx >= 0, 'served event names the person who reached the front');
    assert.ok(A.msgs.findIndex((m) => m.t === 'front') > servedIdx, 'front message follows the served event');
    const openedBefore = A.msgs.slice(0, servedIdx).some((m) => m.t === 'curtain' && m.open === true);
    assert.ok(openedBefore, 'curtains open before they are served');
    await A.waitFor((m) => m.t === 'curtain' && m.open === false && A.msgs.indexOf(m) > servedIdx, 3000);
    assert.ok(A.msgs.some((m) => m.t === 'state' && typeof m.curtain === 'boolean'), 'state carries the curtain flag');
    console.log('  ok');
  } finally { srv.kill(); }
}

async function phase3() {
  console.log('phase 3: a short line is sent whole; a very long one is windowed with the head always sent');
  let port = 3993;
  let srv = await startServer(port, { TICK_MS: '1000000000', INITIAL_NPCS: '100' });
  try {
    const A = client(port, 'token-dddddddd'); await A.ready;
    const s = await A.fresh();
    assert.strictEqual(s.pos, 101, 'joined at the back');
    assert.strictEqual(s.start, 1, 'the whole line is sent');
    assert.strictEqual(s.items.length, 101, 'every person is in the window');
    assert.strictEqual(s.head.length, 0, 'no separate head slice needed');
    assert.strictEqual(s.curtain, false, 'curtains start closed');
  } finally { srv.kill(); }
  port = 3994;
  srv = await startServer(port, { TICK_MS: '1000000000', INITIAL_NPCS: '1500' });
  try {
    const A = client(port, 'token-eeeeeeee'); await A.ready;
    const s = await A.fresh();
    assert.strictEqual(s.pos, 1501, 'joined at the back');
    assert.strictEqual(s.start, 1001, 'window starts 500 places ahead of you');
    assert.strictEqual(s.head.length, 14, 'the 14 people at the head are always sent');
    console.log('  ok');
  } finally { srv.kill(); }
}

(async () => {
  await phase1();
  await phase2();
  await phase3();
  console.log('all tests passed');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
