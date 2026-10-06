# The Line (MVP)

A browser game about waiting. One global queue, slowly moving; nobody knows what is at the front.

## Run

```
npm install
npm start          # http://localhost:3000
npm test           # server behaviour tests
```

Open it on a phone (same network) or use a portrait viewport in desktop devtools.

## What's in the MVP

- One authoritative server holds the line; browsers only display it (Three.js, instanced avatars, portrait first).
- ~800 NPCs seed the line; they thin out as real players arrive (fully gone around 50 concurrent players).
- Joining always puts you at the back. Close the tab and you lose your place after a short grace period (reloads and brief drops are forgiven). Hiding the tab starts the same timer.
- Live position and tally, a slow tick that serves the front, drifting rumours.
- Reaching the front: an ambiguous scene (3 variants), an all-time count, one whisper to leave, then rejoin at the back.
- Controls: drag to pan, pinch / wheel to zoom, double-tap or "Find me" to recentre.

## Not in the MVP (see the project plan)

Payments (paid jumps, paid place holding), comfort items and vendors, accounts. Payments stay out until legal sign-off.

## Config (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 3000 | HTTP + WebSocket port |
| `TICK_MS` | 15000 | Average time between people reaching the front |
| `GRACE_MS` | 30000 | Grace before a free player loses their place |
| `INITIAL_NPCS` | 800 | NPCs at start |
| `NPC_FADE_PLAYERS` | 50 | NPC arrivals fade out as real players approach this |
| `SHOW_PLAYER_WHISPERS` | off | Set to `1` to show finishers' whispers to others. Off by default: they are unmoderated. |

## Known limits

- One process, state in memory: a restart empties the line. Fine for a prototype; use Redis / a Durable Object before real traffic.
- Anonymous sessions only (a token in localStorage; a second tab takes over the first).
- No bot defences beyond heartbeat timeouts.
- Needs a host that supports WebSockets and a long-running Node process.
