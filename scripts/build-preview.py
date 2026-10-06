#!/usr/bin/env python3
"""Builds a single-file preview of the client with a simulated server inside the page (no network).
Outputs preview/index.html (standalone, deployable to any static host) and
preview/artifact.html (page body only, for the Claude artifact wrapper)."""
import json, os, re

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(root, p), encoding="utf-8").read()
three_ver = json.load(open(os.path.join(root, "node_modules/three/package.json")))["version"]

html, css, js = rd("public/index.html"), rd("public/style.css"), rd("public/main.js")

# the real server's rumours, reused by the simulator
server_src = rd("server.js")
rumours = re.search(r"const RUMOURS = (\[.*?\n\]);", server_src, re.S).group(1)

sim = """
// ---------- simulated server (preview only: no network; same messages as the real server) ----------
const RUMOURS = %s;
const sim = { line: [], nextId: 1, finished: 1847, fast: false, timers: [] };
const mkEntry = (kind) => ({ id: sim.nextId++, seed: Math.floor(Math.random() * 1e6), kind });
for (let i = 0; i < 38; i++) sim.line.push(mkEntry('npc'));
const simYou = { entry: mkEntry('you') };
sim.line.push(simYou.entry);
for (let i = 0; i < 26; i++) sim.line.push(mkEntry('npc'));
let nextWhisper = Date.now() + 2500;
let curtainOpen = false;
const deliver = handleServer; // defined in the client above

function simCurtain(open) { curtainOpen = open; deliver({ t: 'curtain', open }); }
function simTick() {
  const front = sim.line.shift();
  if (front) {
    sim.finished++;
    deliver({ t: 'served', id: front.id });
    if (front === simYou.entry) { simYou.entry = null; deliver({ t: 'front', finished: sim.finished, variant: Math.floor(Math.random() * 3) }); }
  }
  if (Math.random() < 0.3 && sim.line.length > 8) {
    const i = 1 + Math.floor(Math.random() * (sim.line.length - 1));
    if (sim.line[i].kind === 'npc') sim.line.splice(i, 1);
  }
  sim.line.push(mkEntry('npc')); // arrivals keep the line populated
}
// every minute (4s when sped up): curtains open, the head of the line walks through, curtains close
function simCycle(first) {
  const T = first ?? (sim.fast ? 4000 : 60000), lead = sim.fast ? 2500 : 5000, hold = sim.fast ? 3500 : 4500;
  sim.timers.push(setTimeout(() => simCurtain(true), Math.max(0, T - lead)));
  sim.timers.push(setTimeout(() => { simTick(); sim.timers.push(setTimeout(() => simCurtain(false), hold)); simCycle(); }, T));
}
function simBroadcast() {
  const L = sim.line, total = L.length;
  const i = simYou.entry ? L.indexOf(simYou.entry) : -1;
  let lo, hi;
  if (i < 0) { lo = 0; hi = Math.min(total, 60); } else { lo = Math.max(0, i - 60); hi = Math.min(total, i + 31); }
  deliver({ t: 'state', total, finished: sim.finished, players: 1, curtain: curtainOpen, head: [], pos: i < 0 ? null : i + 1, you: i < 0 ? null : simYou.entry.id,
    start: lo + 1, items: L.slice(lo, hi).map((e) => [e.id, e.seed]) });
  if (Date.now() >= nextWhisper) {
    nextWhisper = Date.now() + 7000 + Math.random() * 8000;
    deliver({ t: 'whisper', text: RUMOURS[Math.floor(Math.random() * RUMOURS.length)] });
  }
}
(function loop() { simBroadcast(); setTimeout(loop, 1000); })();
simCycle(15000); // first curtain call after 15s so the preview shows it quickly

const send = (o) => {
  if (o.t === 'rejoin' && !simYou.entry) { simYou.entry = mkEntry('you'); sim.line.push(simYou.entry); simBroadcast(); }
  // whisper, ping, away, back: nothing to do in the preview
};
$('speed').addEventListener('click', () => {
  sim.fast = !sim.fast;
  $('speed').textContent = sim.fast ? 'Normal speed' : 'Speed up';
  sim.timers.forEach(clearTimeout); sim.timers = [];
  if (curtainOpen) simCurtain(false);
  simCycle();
});
""" % rumours

# swap the networking section for the simulator
a = js.index("// ---------- networking ----------")
b = js.index("// ---------- the front of the line ----------")
js = js[:a] + sim + "\n" + js[b:]
js = js.replace("import { createSound } from './audio.js';", rd("public/audio.js").replace("export function", "function"))
js = js.replace("from 'three';", "from 'https://cdn.jsdelivr.net/npm/three@%s/build/three.module.js';" % three_ver)

# body markup: drop importmap/css link/module script, add preview controls
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = re.sub(r'<script type="module" src="main.js"></script>', "", body)
body = body.replace('<div id="status">connecting&hellip;</div>', '<div id="status">Simulated line</div>')
body = body.replace('<footer id="bar">', '<button id="speed" type="button" class="quiet">Speed up</button>\n\n<footer id="bar">')

preview_css = """
:root { color-scheme: dark; }
#bar { flex-wrap: wrap; justify-content: flex-end; }
#status { flex: 1 1 auto; font-size: 13px; }
#speed { position: fixed; top: calc(12px + env(safe-area-inset-top, 0px)); right: 12px; z-index: 5; min-height: 36px; padding: 6px 14px; font-size: 13px; background: #0b0d14aa; }
"""
head_bits = "<title>The Line</title>\n<style>\n%s\n%s</style>" % (css, preview_css)
script = '<script type="module">\n%s\n</script>' % js

os.makedirs(os.path.join(root, "preview"), exist_ok=True)
open(os.path.join(root, "preview/artifact.html"), "w", encoding="utf-8").write("%s\n%s\n%s\n" % (head_bits, body, script))
standalone = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n'
  '<meta name="theme-color" content="#0b0d14">\n%s\n</head>\n<body>\n%s\n%s\n</body>\n</html>\n') % (head_bits, body, script)
open(os.path.join(root, "preview/index.html"), "w", encoding="utf-8").write(standalone)
print("three", three_ver, "| artifact", os.path.getsize(os.path.join(root, "preview/artifact.html")) // 1024, "KB")
