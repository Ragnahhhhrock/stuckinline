// Stuck in Line: sound. Everything is synthesised here with the Web Audio API, so there are no audio files to load.
// A voice is a buzzing source pushed through two band-pass "formant" filters (that is what makes "ah" and "oo");
// breath, clicks and puffs are filtered noise; thumps are a falling sine.
const VOWEL = { a: [800, 1250], e: [530, 1900], i: [300, 2250], o: [500, 900], u: [330, 800], uh: [600, 1000], ow: [650, 1100] };

export function createSound(opts = {}) {
  const Ctx = opts.AudioContext || (typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null);
  let ctx = null, master = null, noise = null, voices = 0, muted = false;
  try { muted = localStorage.getItem('line-muted') === '1'; } catch {}
  const LEVEL = 0.9;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const pf = (p, pts) => pts.map(([a, b]) => [a, b * p]); // scale a pitch curve

  function ensure() {
    if (ctx || !Ctx) return ctx;
    try { ctx = new Ctx(); } catch { return null; }
    const comp = ctx.createDynamicsCompressor(); // so a loud shout never clips
    comp.threshold.value = -16; comp.ratio.value = 6;
    master = ctx.createGain(); master.gain.value = muted ? 0 : LEVEL;
    master.connect(comp); comp.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 2), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noise = buf;
    return ctx;
  }

  // ---------- building blocks ----------
  const ramp = (param, t0, dur, pts) => { // pts: [[fraction of dur, value], ...] in order
    param.setValueAtTime(pts[0][1], t0);
    for (let i = 1; i < pts.length; i++) param.linearRampToValueAtTime(pts[i][1], t0 + dur * pts[i][0]);
  };
  function env(t0, dur, peak, a, r) {
    const g = ctx.createGain(), t1 = t0 + dur;
    a = Math.min(a ?? 0.02, dur * 0.4); r = Math.min(r ?? 0.08, dur * 0.5);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.setValueAtTime(peak, t1 - r);
    g.gain.linearRampToValueAtTime(0, t1);
    return g;
  }
  function lfo(target, hz, depth, type, t0, t1) {
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = hz;
    const g = ctx.createGain(); g.gain.value = depth;
    o.connect(g); g.connect(target); o.start(t0); o.stop(t1 + 0.05);
  }
  function noiseSrc(t0, t1) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    s.start(t0, rnd(0, 1.5)); s.stop(t1 + 0.05);
    voices++; s.onended = () => { voices--; };
    return s;
  }
  function out(o) { // where the sound sits: how loud and how far left or right
    const g = ctx.createGain(); g.gain.value = o.g ?? 1;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.p || 0; g.connect(p); p.connect(master); } else g.connect(master);
    return g;
  }
  // a voiced sound: o = { t, dur, f: pitch curve, v: vowels spread across the sound, breath, am: [hz, depth], vib: [hz, Hz], g, a, r, wave }
  function vox(d, o) {
    const t0 = ctx.currentTime + (o.t || 0), t1 = t0 + o.dur;
    const osc = ctx.createOscillator(); osc.type = o.wave || 'sawtooth';
    ramp(osc.frequency, t0, o.dur, o.f);
    if (o.vib) lfo(osc.frequency, o.vib[0], o.vib[1], 'sine', t0, t1);
    const inp = ctx.createGain(); osc.connect(inp);
    if (o.breath) { const n = noiseSrc(t0, t1), b = ctx.createGain(); b.gain.value = o.breath; n.connect(b); b.connect(inp); }
    const e = env(t0, o.dur, o.g ?? 1, o.a, o.r), am = ctx.createGain();
    am.gain.value = 1;
    if (o.am) { am.gain.value = 1 - o.am[1] / 2; lfo(am.gain, o.am[0], o.am[1] / 2, 'sine', t0, t1); }
    const vs = o.v.map((k) => VOWEL[k]);
    [[0, 1, 7], [1, 0.6, 9]].forEach(([i, gain, q]) => {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
      const pts = vs.length === 1 ? [[0, vs[0][i]], [1, vs[0][i]]] : vs.map((v, j) => [j / (vs.length - 1), v[i]]);
      ramp(f.frequency, t0, o.dur, pts);
      const gg = ctx.createGain(); gg.gain.value = gain;
      inp.connect(f); f.connect(gg); gg.connect(e);
    });
    e.connect(am); am.connect(d);
    osc.start(t0); osc.stop(t1 + 0.05); voices++; osc.onended = () => { voices--; };
  }
  // a puff of filtered noise: o = { t, dur, f: filter curve, q, type, g, a, r, am }
  function puff(d, o) {
    const t0 = ctx.currentTime + (o.t || 0), t1 = t0 + o.dur;
    const s = noiseSrc(t0, t1), f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass'; f.Q.value = o.q ?? 1;
    ramp(f.frequency, t0, o.dur, o.f);
    const e = env(t0, o.dur, o.g ?? 1, o.a ?? 0.01, o.r ?? 0.05);
    s.connect(f); f.connect(e);
    if (o.am) { const am = ctx.createGain(); am.gain.value = 1 - o.am[1] / 2; lfo(am.gain, o.am[0], o.am[1] / 2, 'sine', t0, t1); e.connect(am); am.connect(d); } else e.connect(d);
  }
  function thump(d, o) { // a low knock: a sine that falls away
    const t0 = ctx.currentTime + (o.t || 0), t1 = t0 + o.dur, s = ctx.createOscillator();
    s.type = 'sine'; ramp(s.frequency, t0, o.dur, o.f);
    const e = env(t0, o.dur, o.g ?? 1, 0.004, o.dur * 0.7);
    s.connect(e); e.connect(d); s.start(t0); s.stop(t1 + 0.05); voices++; s.onended = () => { voices--; };
  }

  // ---------- the sounds. each takes ({ g: loudness, p: pan, pitch, ... }, destination) and returns its length in seconds ----------
  const lib = {
    meow(o, d) {
      const p = o.pitch || 1, dur = rnd(0.6, 0.85);
      vox(d, { dur, f: pf(p, [[0, 430], [0.3, 820], [0.65, 680], [1, 380]]), v: ['u', 'e', 'ow'], breath: 0.1, vib: [6, 14], g: 1.4, a: 0.05, r: 0.2 });
      return dur;
    },
    mrrp(o, d) {
      const p = o.pitch || 1;
      vox(d, { dur: 0.13, f: pf(p, [[0, 380], [1, 650]]), v: ['o', 'e'], am: [30, 0.7], g: 1.2, a: 0.01 });
      vox(d, { t: 0.16, dur: 0.15, f: pf(p, [[0, 500], [1, 840]]), v: ['o', 'e'], am: [30, 0.7], g: 1.2, a: 0.01 });
      return 0.35;
    },
    purr(o, d) { puff(d, { dur: 1.8, f: [[0, 420], [1, 380]], type: 'lowpass', q: 0.7, am: [24, 0.9], g: 0.7, a: 0.3, r: 0.6 }); return 1.8; },
    huff(o, d) { puff(d, { dur: 0.24, f: [[0, 1200], [1, 700]], q: 0.7, g: 0.9, a: 0.02, r: 0.1 }); return 0.25; },
    bark(o, d) {
      const p = o.pitch || 1, n = o.n || 1;
      for (let k = 0; k < n; k++) {
        const t = k * 0.3;
        vox(d, { t, dur: 0.15, f: pf(p * 1.4, [[0, 260], [0.2, 300], [1, 170]]), v: ['a', 'o'], breath: 0.5, g: 1, a: 0.008, r: 0.06 });
        puff(d, { t, dur: 0.1, f: [[0, 1600], [1, 900]], q: 1, g: 0.5, a: 0.004, r: 0.05 });
      }
      return n * 0.3;
    },
    sniff(o, d) { [0, 0.15, 0.33].forEach((t) => puff(d, { t, dur: 0.09, f: [[0, 2000], [1, 3000]], q: 2, g: 0.9, a: 0.01 })); return 0.45; },
    sigh(o, d) { // a long breath out, a little voice at the end of it
      const p = o.pitch || 1;
      puff(d, { dur: 1.2, f: [[0, 1400], [1, 550]], q: 1.1, g: 1.1, a: 0.3, r: 0.6 });
      vox(d, { dur: 1.1, f: pf(p, [[0, 170], [1, 105]]), v: ['a', 'u'], breath: 0.9, g: 0.3, a: 0.3, r: 0.6 });
      return 1.2;
    },
    laugh(o, d) {
      const p = o.pitch || 1, n = o.n || Math.round(rnd(4, 6));
      for (let k = 0; k < n; k++) {
        vox(d, { t: k * 0.17, dur: 0.11, f: pf(p, [[0, 270 * (1 - k * 0.05)], [1, 230 * (1 - k * 0.05)]]), v: ['a', 'a'], breath: 0.45, g: 1.5 - k * 0.12, a: 0.008, r: 0.05 });
      }
      puff(d, { t: n * 0.17, dur: 0.3, f: [[0, 1700], [1, 1100]], q: 1, g: 0.25, a: 0.05, r: 0.15 });
      return n * 0.17 + 0.3;
    },
    // ----- fed up -----
    tsk(o, d) { [0, 0.13].forEach((t) => puff(d, { t, dur: 0.045, f: [[0, 3200], [1, 2600]], q: 3, g: 1.2, a: 0.002, r: 0.02 })); return 0.2; },
    groan(o, d) {
      const p = o.pitch || 1;
      vox(d, { dur: 0.8, f: pf(p, [[0, 170], [0.4, 150], [1, 85]]), v: ['uh', 'o', 'u'], breath: 0.25, vib: [5, 4], g: 1.5, a: 0.08, r: 0.25 });
      return 0.8;
    },
    argh(o, d) {
      const p = o.pitch || 1;
      vox(d, { dur: 0.85, f: pf(p, [[0, 320], [0.2, 360], [1, 170]]), v: ['a', 'a', 'o'], breath: 0.35, am: [40, 0.4], g: 1.3, a: 0.03, r: 0.3 });
      return 0.85;
    },
    shout(o, d) { // "oi"
      const p = o.pitch || 1;
      vox(d, { dur: 0.4, f: pf(p, [[0, 230], [0.5, 330], [1, 260]]), v: ['o', 'i'], breath: 0.15, g: 1.3, a: 0.02, r: 0.12 });
      return 0.4;
    },
    stomp(o, d) {
      thump(d, { dur: 0.18, f: [[0, 120], [1, 45]], g: 1.4 });
      puff(d, { dur: 0.09, f: [[0, 500], [1, 300]], type: 'lowpass', g: 0.8, a: 0.003 });
      return 0.2;
    },
    // ----- bodies -----
    burp(o, d) {
      const p = o.pitch || 1, dur = rnd(0.55, 0.9);
      puff(d, { dur: 0.12, f: [[0, 400], [1, 250]], type: 'lowpass', g: 0.5, a: 0.01 });
      vox(d, { t: 0.04, dur, f: pf(p, [[0, 95], [0.3, 82], [1, 58]]), v: ['uh', 'o', 'u'], breath: 0.3, am: [rnd(24, 34), 0.9], g: 1.7, a: 0.05, r: 0.2 });
      return dur + 0.05;
    },
    sneeze(o, d) { // "ah... ah... choo"
      const p = o.pitch || 1, ups = Math.random() < 0.5 ? 2 : 1;
      let t = 0;
      for (let k = 0; k < ups; k++) {
        puff(d, { t, dur: 0.42, f: [[0, 500], [1, 1900]], q: 1.5, g: 0.9, a: 0.3, r: 0.06 });
        vox(d, { t, dur: 0.42, f: pf(p, [[0, 200], [1, 270]]), v: ['a', 'a'], breath: 0.8, g: 0.22, a: 0.3, r: 0.06 });
        t += 0.62;
      }
      puff(d, { t, dur: 0.14, f: [[0, 4200], [1, 2400]], q: 0.9, g: 0.8, a: 0.004, r: 0.07 });
      vox(d, { t: t + 0.02, dur: 0.3, f: pf(p, [[0, 320], [1, 170]]), v: ['u', 'o'], breath: 0.6, g: 0.8, a: 0.01, r: 0.12 });
      return t + 0.35;
    },
    fart(o, d) {
      const p = o.pitch || 1, squeak = Math.random() < 0.25, dur = squeak ? rnd(0.2, 0.4) : rnd(0.35, 0.95);
      const t0 = ctx.currentTime, t1 = t0 + dur, base = (squeak ? rnd(190, 260) : rnd(75, 125)) * p;
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      ramp(osc.frequency, t0, dur, [[0, base], [0.4, base * rnd(0.8, 1.05)], [1, base * rnd(0.45, 0.8)]]);
      lfo(osc.frequency, rnd(26, 52), base * 0.18, 'sine', t0, t1); // the wobble
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = squeak ? 1800 : 650; lp.Q.value = 3;
      const e = env(t0, dur, 0.55, 0.015, 0.1), am = ctx.createGain();
      am.gain.value = 0.5; lfo(am.gain, rnd(20, 46), 0.5, 'square', t0, t1); // the flutter
      osc.connect(lp); lp.connect(e); e.connect(am); am.connect(d);
      osc.start(t0); osc.stop(t1 + 0.05); voices++; osc.onended = () => { voices--; };
      puff(d, { dur, f: [[0, 900], [1, 500]], type: 'lowpass', g: 0.2, a: 0.02, r: 0.1, am: [rnd(20, 40), 0.8] });
      return dur;
    },
  };

  // ---------- speech: the browser's own text-to-speech, for the odd line ----------
  const synth = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined' ? speechSynthesis : null;
  let voiceList = [];
  function loadVoices() { voiceList = synth.getVoices().filter((v) => /^en/i.test(v.lang)); }
  if (synth) { loadVoices(); if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices); }
  // o: { g: volume 0..1, pitch, rate, voice: any integer (picks a voice, so each person keeps theirs) }
  function speak(text, o = {}) {
    if (!synth || muted || !text || !ctx || ctx.state !== 'running') return false; // not unlocked yet, or muted
    if (synth.speaking || synth.pending) return false; // one voice at a time, so lines never queue up late
    const u = new SpeechSynthesisUtterance(text), v = voiceList.length ? voiceList[Math.abs(o.voice || 0) % voiceList.length] : null;
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-AU';
    u.pitch = Math.min(2, Math.max(0.1, o.pitch ?? 1)); u.rate = Math.min(2, Math.max(0.5, o.rate ?? 1)); u.volume = Math.min(1, Math.max(0, o.g ?? 1));
    synth.speak(u);
    return true;
  }

  function play(name, o = {}) {
    if (!ensure() || muted || voices > 16 || !lib[name]) return 0;
    if (ctx.state !== 'running' && !opts.force) return 0; // not unlocked yet
    return lib[name](o, out(o)) || 0;
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('line-muted', muted ? '1' : '0'); } catch {}
    if (master) master.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime, 0.05);
    if (muted && synth) synth.cancel();
  }
  function unlock() { const c = ensure(); if (c && c.state !== 'running' && !opts.force) c.resume(); }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) { ctx.suspend(); if (synth) synth.cancel(); } else ctx.resume();
    });
  }

  return {
    play, speak, unlock, setMuted,
    get muted() { return muted; },
    get active() { return !!ctx && !muted && ctx.state === 'running'; },
    names: Object.keys(lib),
  };
}
