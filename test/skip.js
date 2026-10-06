'use strict';
// The paid skip: moves a player to the front once, handles duplicates, unknown tokens and bad Stripe signatures.
const assert = require('assert');
const crypto = require('crypto');
const { createGame } = require('../src/core.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function player(game, token) {
  const msgs = [];
  const ws = { readyState: 1, send: (d) => msgs.push(JSON.parse(d)), close() {} };
  const c = game.connect(ws);
  c.message(JSON.stringify({ t: 'join', token }));
  return { msgs, pos: async () => { const n = msgs.length; await sleep(1100); const st = msgs.slice(n).reverse().find((m) => m.t === 'state'); return st && st.pos; } };
}

(async () => {
  const game = createGame({ TICK_MS: 600000, INITIAL_NPCS: 20 });
  const a = player(game, 'aaaaaaaa-1111');
  assert.strictEqual(await a.pos(), 21, 'joins at the back');
  assert.strictEqual(game.skipToFront('aaaaaaaa-1111', 'cs_1'), 'moved');
  assert.strictEqual(await a.pos(), 1, 'paid player is at the front');
  assert.strictEqual(game.skipToFront('aaaaaaaa-1111', 'cs_1'), 'duplicate', 'a retried webhook does nothing');
  const b = player(game, 'bbbbbbbb-2222');
  assert.strictEqual(await b.pos(), 22, 'a free player still joins at the back');
  assert.strictEqual(game.skipToFront('bbbbbbbb-2222', 'cs_2'), 'moved');
  assert.strictEqual(await b.pos(), 1, 'second payer takes the front');
  assert.strictEqual(game.skipToFront('cccccccc-3333', 'cs_3'), 'pending', 'paid before connecting');
  const c = player(game, 'cccccccc-3333');
  assert.strictEqual(await c.pos(), 1, 'pending skip applies on join');
  assert.strictEqual(game.skipToFront('x', 'cs_4'), 'invalid');

  const { verifyStripeSignature } = await import('../worker/stripe.mjs');
  const secret = 'whsec_test';
  const body = JSON.stringify({ hello: 'world' });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.ok(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret), 'valid signature');
  assert.ok(!(await verifyStripeSignature(body + ' ', `t=${t},v1=${sig}`, secret)), 'tampered body');
  assert.ok(!(await verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_other')), 'wrong secret');
  assert.ok(!(await verifyStripeSignature(body, `t=${t - 1000},v1=${crypto.createHmac('sha256', secret).update(`${t - 1000}.${body}`).digest('hex')}`, secret)), 'old timestamp');
  console.log('skip tests passed');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
