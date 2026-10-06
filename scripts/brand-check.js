#!/usr/bin/env node
// Enforces brand/BRAND-RULE.md. Exit code 1 on any violation.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'brand', 'tokens.json'), 'utf8'));
const errors = [];
const fail = (m) => errors.push(m);

// 1. the guides exist
for (const f of ['BRAND-RULE.md', 'DESIGN-GUIDE.md', 'STYLE-GUIDE.md', 'tokens.json']) {
  if (!fs.existsSync(path.join(ROOT, 'brand', f))) fail(`missing brand/${f}`);
}
const claude = fs.existsSync(path.join(ROOT, 'CLAUDE.md')) ? fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8') : '';
if (!/Brand Rule/.test(claude)) fail('CLAUDE.md must carry the Brand Rule');

// 2. colours in UI files are brand tokens
const allowed = new Set([...Object.values(T.color), ...T.legacyUi].map((c) => c.toLowerCase()));
const norm = (h) => {
  h = h.toLowerCase();
  if (h.length === 9) return h.slice(0, 7); // #rrggbbaa
  if (h.length === 5) return '#' + h.slice(1, 4); // #rgba
  return h;
};
for (const f of fs.readdirSync(path.join(ROOT, 'public'))) {
  if (!/\.(css|html)$/.test(f)) continue;
  const src = fs.readFileSync(path.join(ROOT, 'public', f), 'utf8');
  for (const m of src.matchAll(/(?<![&\w])#[0-9a-fA-F]{3,8}\b/g)) {
    const h = norm(m[0]);
    if (![4, 7].includes(h.length) && h.length !== 5) continue;
    if (!allowed.has(h)) fail(`public/${f}: colour ${m[0]} is not a brand token`);
  }
}

// 3. required metadata in the page
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const need = [
  ['<title>Stuck in Line', 'title uses the product name'],
  ['name="description"', 'meta description'],
  ['rel="canonical" href="https://stuckinline.com/"', 'canonical URL'],
  ['property="og:title"', 'og:title'], ['property="og:description"', 'og:description'],
  ['property="og:image" content="https://stuckinline.com/brand/og-image.png"', 'og:image'],
  ['property="og:image:alt"', 'og:image:alt'],
  ['name="twitter:card" content="summary_large_image"', 'twitter:card'],
  ['name="twitter:image" content="https://stuckinline.com/brand/twitter-card.png"', 'twitter:image'],
  ['rel="apple-touch-icon"', 'apple-touch-icon'], ['rel="icon"', 'favicon'],
  ['name="theme-color" content="#0b0d14"', 'theme-color is night'],
];
for (const [needle, label] of need) if (!html.includes(needle)) fail(`index.html missing ${label}`);
if (/The Line</.test(html.match(/<title>.*<\/title>/)?.[0] || '')) fail('title must not be "The Line"');

// 4. brand images exist at the exact sizes
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 1, 4) !== 'PNG') return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
for (const [name, [w, h]] of Object.entries(T.assets)) {
  const file = path.join(ROOT, 'public', 'brand', name);
  if (!fs.existsSync(file)) { fail(`public/brand/${name} missing (run python3 scripts/build-brand-assets.py)`); continue; }
  const s = pngSize(file);
  if (!s || s[0] !== w || s[1] !== h) fail(`public/brand/${name} must be ${w}x${h}, got ${s}`);
}
if (!fs.existsSync(path.join(ROOT, 'public', 'favicon.svg'))) fail('public/favicon.svg missing');

// 5. banned words in public copy
const banned = /\b(amazing|epic|addictive|revolutionary|win prizes?)\b/i;
if (banned.test(html)) fail('index.html uses banned hype copy (see STYLE-GUIDE.md)');

if (errors.length) {
  console.error('BRAND RULE VIOLATED:\n - ' + errors.join('\n - '));
  process.exit(1);
}
console.log('brand check passed');
