#!/usr/bin/env node
// Builds dist/ for the Cloudflare Worker: the client from public/ plus the Three.js build at /vendor/three/.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
const three = path.join(ROOT, 'node_modules', 'three', 'build');
const vend = path.join(OUT, 'vendor', 'three');
fs.mkdirSync(vend, { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(three, f), path.join(vend, f));

// Same cache-busting as server.js: every file URL carries the build id, so a new deploy always means new URLs.
let build = process.env.GITHUB_SHA || '';
if (!build) { try { build = require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch { build = String(Date.now()); } }
build = build.slice(0, 12);
const edit = (rel, fn) => { const f = path.join(OUT, rel); fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8'))); };
edit('index.html', (t) => t.replace(/(src|href)="(main\.js|style\.css)"/g, `$1="$2?v=${build}"`));
edit('main.js', (t) => t.replace(/from '(\.\/[\w-]+\.js)'/g, `from '$1?v=${build}'`));
console.log(`dist ready (build ${build})`);
