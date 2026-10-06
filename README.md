# Stuck in Line (MVP)

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
- Who you are is drawn at random each visit (each new place at the back): a grown-up, a child, a senior citizen (some with a walking stick), a person in a wheelchair, a person with a walking frame, a person on crutches, a dog or a cat. NPCs use the same mix. Shown under the tally; pets wear a gold collar when they're you.
- Live position and tally, drifting rumours, and a stage at the front: once a minute the velvet curtains part, the person at the head walks into the dark, and the curtains close. Nobody sees what is inside.
- Reaching the front: an ambiguous scene (3 variants), an all-time count, one whisper to leave, then rejoin at the back.
- Controls: drag to orbit and look from any angle; two fingers pinch to zoom and slide along the line (desktop: wheel zooms, right-drag or shift-drag slides). "Front" flies the camera to the stage from anywhere in the line; double-tap or "Find me" recentres.
- Sound, synthesised in the page (`public/audio.js`, no audio files): a soft murmur of chatter, cats and dogs that meow and bark when their bubble opens, and the odd sigh, laugh, burp, sneeze and fart nearby. Some people, more of them the longer they have stood, get fed up and grumble. Sound is positional (louder and panned by distance from the camera). It starts on the first tap; the Sound button mutes it and remembers the choice.

## Not in the MVP (see the project plan)

Payments (paid jumps, paid place holding), comfort items and vendors, accounts. Payments stay out until legal sign-off.

## Config (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 3000 | HTTP + WebSocket port |
| `TICK_MS` | 60000 | Time between people passing through the curtains (one per minute) |
| `GRACE_MS` | 30000 | Grace before a free player loses their place |
| `INITIAL_NPCS` | 800 | NPCs at start |
| `NPC_FADE_PLAYERS` | 50 | NPC arrivals fade out as real players approach this |
| `SHOW_PLAYER_WHISPERS` | off | Set to `1` to show finishers' whispers to others. Off by default: they are unmoderated. |

## Known limits

- One process, state in memory: a restart empties the line. Fine for a prototype; use Redis / a Durable Object before real traffic.
- Anonymous sessions only (a token in localStorage; a second tab takes over the first).
- No bot defences beyond heartbeat timeouts.
- Needs a host that supports WebSockets and a long-running Node process.
