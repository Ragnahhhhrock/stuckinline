// Stuck in Line on Cloudflare: static client from the assets binding, and one Durable Object that holds the line.
// Every WebSocket (any visitor, anywhere) is routed to the same object, so the line is global.
import { createGame } from '../src/core.js';

export class LineRoom {
  constructor(state, env) {
    this.game = createGame(env); // env vars (TICK_MS and so on) are optional overrides
  }

  fetch(request) {
    console.log('ws request', request.method, [...request.headers.keys()].join(','));
    // Browsers can reach us over HTTP/2 or HTTP/3, where the upgrade shows up as Sec-WebSocket-* headers rather than Upgrade.
    const h = request.headers;
    const isSocket = (h.get('Upgrade') || '').toLowerCase() === 'websocket' || h.has('Sec-WebSocket-Version') || h.has('Sec-WebSocket-Key');
    if (!isSocket) return new Response(`Expected a WebSocket (saw: ${[...h.keys()].join(', ')})`, { status: 426 });
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    console.log('ws accepted', request.headers.get('user-agent'));
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
    if (pathname === '/ws') {
      // Browsers on HTTP/2 or HTTP/3 open a WebSocket with an extended CONNECT and no Upgrade header, which a Durable Object will not accept.
      // Hand it over as the plain GET + Upgrade it would have been on HTTP/1.1.
      const headers = new Headers(request.headers);
      headers.set('Upgrade', 'websocket');
      headers.set('Connection', 'Upgrade');
      return env.LINE.get(env.LINE.idFromName('global')).fetch(request.url, { method: 'GET', headers }).catch((e) => new Response(`socket: ${e && e.message}`, { status: 500 }));
    }
    return env.ASSETS.fetch(request);
  },
};
