'use strict';
// Stuck in Line: the game itself. One global line, held in memory, with no knowledge of HTTP or hosting.
// Used by server.js (Node, local dev and tests) and worker/index.js (Cloudflare Durable Object).
// A host hands each new socket to connect(ws) and feeds back its events:
//   const c = game.connect(ws); on message -> c.message(text); on close -> c.close()
// A socket only needs send(string), close(code, reason) and readyState (1 = open), which both `ws` and Workers sockets have.

const RUMOURS = [
  "someone said it's a door",
  'my cousin got to the front in March',
  "they say it's warm in there",
  "I heard it's only open to people who waited",
  'the person ahead of me has been here since before I was born',
  "don't look at the light for too long",
  "somebody told me there's nothing at all",
  "it's a ticket. it has to be a ticket",
  'I saw someone come back. they would not speak',
  'the line has moved faster since the rain',
  "my grandmother says it's a boat",
  'nobody who reached the front has written to me',
  "it's a trick of the light, that's all",
  "I think it's a kindness",
  'they closed the door on the last one a bit softly',
  'if you stop wondering, it moves faster',
  'there was a sound last night, like a kettle',
  'ask the one in the green coat. no, never mind',
  "I don't care what it is any more. I'm staying",
  'somebody swears they smelled bread',
];

function createGame(opts = {}) {
  const num = (k, d) => (opts[k] !== undefined && opts[k] !== '' && !Number.isNaN(Number(opts[k])) ? Number(opts[k]) : d);
  const TICK_MS = num('TICK_MS', 60000); // one person passes through the curtains each minute
  const GRACE_MS = num('GRACE_MS', 30000); // reload/blip grace before a free player loses their place
  const HB_TIMEOUT_MS = num('HB_TIMEOUT_MS', 45000);
  const INITIAL_NPCS = num('INITIAL_NPCS', 800);
  const NPC_FADE_PLAYERS = num('NPC_FADE_PLAYERS', 50); // NPC joins fade out as real players approach this
  const MAX_PLAYERS = num('MAX_PLAYERS', 5000);
  // Player whispers are collected but only shown to others when explicitly enabled (needs moderation first).
  const SHOW_PLAYER_WHISPERS = opts.SHOW_PLAYER_WHISPERS === '1' || opts.SHOW_PLAYER_WHISPERS === 1 || opts.SHOW_PLAYER_WHISPERS === true;
  const CURTAIN_LEAD_MS = Math.min(5000, TICK_MS * 0.3); // curtains start opening this long before the tick
  const CURTAIN_HOLD_MS = Math.min(4500, TICK_MS * 0.3); // and stay open this long after it
  const HEAD = 14; // people at the front, always sent so the curtains can be watched
  const AHEAD = 60; // people sent ahead of you
  const BEHIND = 30; // and behind
  let curtainOpen = false;

  let nextId = 1;
  const line = []; // entries, index 0 = front
  const players = new Map(); // token -> player
  const playerWhispers = [];
  let finishedTotal = 0;

  const rnd = Math.random;
  const newEntry = (kind) => ({ id: nextId++, kind, seed: Math.floor(rnd() * 1e6), inLine: false, token: null });
  const pushEntry = (e) => { e.inLine = true; line.push(e); };
  function removeEntry(e) {
    if (!e || !e.inLine) return;
    const i = line.indexOf(e);
    if (i >= 0) line.splice(i, 1);
    e.inLine = false;
  }
  for (let i = 0; i < INITIAL_NPCS; i++) pushEntry(newEntry('npc'));

  function send(p, obj) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(obj));
  }

  function placeAtBack(p) {
    removeEntry(p.entry);
    const e = newEntry('player');
    e.token = p.token;
    pushEntry(e);
    p.entry = e;
    p.canWhisper = false;
  }

  function realInLine() {
    let n = 0;
    for (const p of players.values()) if (p.entry && p.entry.inLine) n++;
    return n;
  }

  function dropRandomNpc() {
    for (let tries = 0; tries < 8 && line.length > 1; tries++) {
      const i = 1 + Math.floor(rnd() * (line.length - 1));
      if (line[i].kind === 'npc') {
        line[i].inLine = false;
        line.splice(i, 1);
        return;
      }
    }
  }

  function tick() {
    const front = line.shift();
    if (front) {
      front.inLine = false;
      finishedTotal++;
      broadcastAll({ t: 'served', id: front.id }); // they walk through the open curtains
      if (front.kind === 'player') {
        const p = players.get(front.token);
        if (p) {
          p.entry = null;
          p.canWhisper = true;
          send(p, { t: 'front', finished: finishedTotal, variant: Math.floor(rnd() * 3) });
        }
      }
    }
    // NPC churn: some wander off, new ones arrive; arrivals fade out as real players grow.
    if (rnd() < 0.3) dropRandomNpc();
    const fade = Math.max(0, 1 - realInLine() / NPC_FADE_PLAYERS);
    if (rnd() < 0.9 * fade + 0.1) pushEntry(newEntry('npc'));
  }

  function broadcastAll(obj) {
    for (const p of players.values()) send(p, obj);
  }
  function setCurtain(open) {
    curtainOpen = open;
    broadcastAll({ t: 'curtain', open });
  }
  // Every TICK_MS: curtains open, the person at the head walks through, curtains close.
  function cycle() {
    setTimeout(() => setCurtain(true), Math.max(0, TICK_MS - CURTAIN_LEAD_MS));
    setTimeout(() => {
      tick();
      setTimeout(() => setCurtain(false), CURTAIN_HOLD_MS);
      cycle();
    }, TICK_MS);
  }
  cycle();

  function broadcast() {
    const now = Date.now();
    const total = line.length;
    const idxOf = new Map();
    for (let i = 0; i < line.length; i++) if (line[i].kind === 'player') idxOf.set(line[i].id, i);
    const pool = SHOW_PLAYER_WHISPERS ? RUMOURS.concat(playerWhispers) : RUMOURS;
    for (const p of players.values()) {
      if (!p.ws || p.ws.readyState !== 1) continue;
      const i = p.entry ? idxOf.get(p.entry.id) : undefined;
      let lo, hi;
      if (i === undefined) { lo = 0; hi = Math.min(total, AHEAD); } // waiting screen: show the front
      else { lo = Math.max(0, i - AHEAD); hi = Math.min(total, i + BEHIND + 1); }
      const items = [];
      for (let k = lo; k < hi; k++) items.push([line[k].id, line[k].seed]);
      const head = []; // when the front is outside your window, still send it so the curtains can be watched
      for (let k = 0; k < Math.min(HEAD, lo); k++) head.push([line[k].id, line[k].seed]);
      send(p, {
        t: 'state', total, finished: finishedTotal, players: idxOf.size, curtain: curtainOpen, head,
        pos: i === undefined ? null : i + 1, you: i === undefined ? null : p.entry.id,
        start: lo + 1, items,
      });
      if (now >= p.nextWhisper) {
        p.nextWhisper = now + 7000 + rnd() * 8000;
        send(p, { t: 'whisper', text: pool[Math.floor(rnd() * pool.length)] });
      }
    }
  }
  setInterval(broadcast, 1000);

  function sweep() {
    const now = Date.now();
    for (const [token, p] of players) {
      const gone = p.disconnectedAt && now - p.disconnectedAt > GRACE_MS;
      const away = p.awaySince && now - p.awaySince > GRACE_MS;
      const silent = p.ws && now - p.lastSeen > HB_TIMEOUT_MS;
      if (gone || away || silent) {
        removeEntry(p.entry);
        if (p.ws) p.ws.close(4001, 'timeout');
        players.delete(token);
      }
    }
  }
  setInterval(sweep, 500);

  const connect = (ws) => {
    let player = null;
    return {
      message(raw) {
        if (typeof raw !== 'string') { try { raw = raw.toString(); } catch { return; } }
        if (raw.length > 1024) return ws.close(1009, 'too big');
        let m;
        try { m = JSON.parse(raw); } catch { return; }
        if (!m || typeof m.t !== 'string') return;
        const now = Date.now();
        if (m.t === 'join') {
          let token = String(m.token || '').replace(/[^\w-]/g, '').slice(0, 64);
          if (token.length < 8) token = Math.random().toString(36).slice(2) + Date.now().toString(36);
          let p = players.get(token);
          if (!p) {
            if (players.size >= MAX_PLAYERS) return ws.close(1013, 'full');
            p = { token, entry: null, ws: null, lastSeen: now, awaySince: null, disconnectedAt: null, canWhisper: false, nextWhisper: now + 3000 };
            players.set(token, p);
          }
          if (p.ws && p.ws !== ws) p.ws.close(4000, 'replaced'); // second tab takes over
          p.ws = ws; p.lastSeen = now; p.awaySince = null; p.disconnectedAt = null;
          if (!p.entry || !p.entry.inLine) placeAtBack(p); // free players who lost their place start at the back
          player = p;
          send(p, { t: 'joined', token, graceMs: GRACE_MS });
          return;
        }
        if (!player || player.ws !== ws) return;
        player.lastSeen = now;
        if (m.t === 'away') player.awaySince = player.awaySince || now;
        else if (m.t === 'back') player.awaySince = null;
        else if (m.t === 'rejoin') { if (!player.entry || !player.entry.inLine) placeAtBack(player); }
        else if (m.t === 'whisper' && player.canWhisper) {
          const text = String(m.text || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
          player.canWhisper = false;
          if (text.length >= 2) {
            playerWhispers.push(text);
            if (playerWhispers.length > 200) playerWhispers.shift();
          }
        }
        // 'ping' needs no handling beyond lastSeen
      },
      close() {
        if (player && player.ws === ws) { player.ws = null; player.disconnectedAt = Date.now(); }
      },
    };
  };

  return { connect, size: () => line.length };
}

module.exports = { createGame, RUMOURS };
