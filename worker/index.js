// Stuck in Line on Cloudflare: static client from the assets binding, and one Durable Object that holds the line.
// Every WebSocket (any visitor, anywhere) is routed to the same object, so the line is global.
import { createGame } from '../src/core.js';
import { verifyStripeSignature } from './stripe.mjs';

export class LineRoom {
  constructor(state, env) {
    this.game = createGame(env); // env vars (TICK_MS and so on) are optional overrides
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/internal/skip' && request.method === 'POST') { // only the Worker below calls this, after verifying Stripe
      const { token, id } = await request.json();
      return new Response(this.game.skipToFront(token, id));
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    const c = this.game.connect(server);
    server.addEventListener('message', (e) => c.message(e.data));
    server.addEventListener('close', () => c.close());
    server.addEventListener('error', () => c.close());
    return new Response(null, { status: 101, webSocket: client });
  }
}

// Stripe webhook for the paid skip. One paid checkout session, tagged with the player's token as client_reference_id, moves that player to the front.
async function stripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response('webhook not configured', { status: 503 });
  const payload = await request.text();
  if (!(await verifyStripeSignature(payload, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return new Response('bad signature', { status: 400 });
  }
  let event;
  try { event = JSON.parse(payload); } catch { return new Response('bad json', { status: 400 }); }
  const okTypes = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
  const s = event && event.data && event.data.object;
  const minCents = Number(env.SKIP_MIN_CENTS || 500);
  if (okTypes.includes(event.type) && s && s.payment_status === 'paid' && String(s.currency).toLowerCase() === 'aud' && s.amount_total >= minCents && s.client_reference_id) {
    const res = await env.LINE.get(env.LINE.idFromName('global')).fetch('https://line/internal/skip', {
      method: 'POST', body: JSON.stringify({ token: s.client_reference_id, id: s.id }),
    });
    console.log('paid skip', s.id, await res.text());
  }
  return new Response('ok'); // always 200 once the signature is valid, so Stripe does not retry
}

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/healthz') return new Response('ok');
    if (pathname === '/stripe-webhook' && request.method === 'POST') return stripeWebhook(request, env);
    if (pathname === '/ws') return env.LINE.get(env.LINE.idFromName('global')).fetch(request);
    return env.ASSETS.fetch(request);
  },
};
