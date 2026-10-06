// Stuck in Line on Cloudflare: static client from the assets binding, and one Durable Object that holds the line.
// Every WebSocket (any visitor, anywhere) is routed to the same object, so the line is global.
import { createGame } from '../src/core.js';

export class LineRoom {
  constructor(state, env) {
    this.game = createGame(env); // env vars (TICK_MS and so on) are optional overrides
  }

  fetch(request) {
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

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/healthz') return new Response('ok');
    if (pathname === '/ws') return env.LINE.get(env.LINE.idFromName('global')).fetch(request);
    return env.ASSETS.fetch(request);
  },
};
