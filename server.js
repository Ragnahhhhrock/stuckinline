'use strict';
// Stuck in Line: Node host for local development and tests. Production runs on Cloudflare (worker/index.js).
// One process serves the static client and the WebSocket; the game itself lives in src/core.js.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createGame } = require('./src/core.js');

const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 3000;
const game = createGame(process.env);

// ---- HTTP (static) ----
const PUBLIC = path.join(__dirname, 'public');
const THREE_DIR = path.join(__dirname, 'node_modules', 'three', 'build');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};
// Cloudflare rewrites Cache-Control on .js/.css to hours, so a new deploy can sit behind stale copies.
// Each file URL therefore carries the build id (the git commit on Railway, else the start time): a new deploy means new URLs.
const BUILD = String(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT || Date.now()).slice(0, 12);
function versioned(rel, text) {
  if (rel === 'index.html') return text.replace(/(src|href)="(main\.js|style\.css)"/g, `$1="$2?v=${BUILD}"`);
  if (rel === 'main.js') return text.replace(/from '(\.\/[\w-]+\.js)'/g, `from '$1?v=${BUILD}'`);
  return text;
}
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  let base, rel;
  if (pathname.startsWith('/vendor/three/')) { base = THREE_DIR; rel = pathname.slice('/vendor/three/'.length); }
  else { base = PUBLIC; rel = pathname === '/' ? 'index.html' : pathname.slice(1); }
  const file = path.join(base, rel);
  const ext = path.extname(file);
  if (!file.startsWith(base + path.sep) || !MIME[ext]) { res.writeHead(404); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    if (base === PUBLIC && (rel === 'index.html' || rel === 'main.js')) data = Buffer.from(versioned(rel, data.toString('utf8')));
    res.writeHead(200, { 'Content-Type': MIME[ext], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

// ---- WebSocket ----
const wss = new WebSocketServer({ server, maxPayload: 1024 });
wss.on('connection', (ws) => {
  const c = game.connect(ws);
  ws.on('message', (raw) => c.message(raw.toString()));
  ws.on('close', () => c.close());
  ws.on('error', () => {});
});

server.listen(PORT, () => console.log(`Stuck in Line listening on http://localhost:${PORT} (tick ${process.env.TICK_MS || 60000}ms, ${game.size()} in line)`));
