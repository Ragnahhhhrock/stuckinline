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
console.log('dist ready');
