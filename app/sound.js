/* ==========================================================================
   Xylophone Basics Explorer — app/sound.js
   --------------------------------------------------------------------------
   XBSound — the app's one audio context: the lesson's music, and its own
   xylophone for the bars the player strikes (or the mallet's notes, when
   the recording has no xylophone).

   The xylophone is the Rainbow Xylophone's sound as Melody Reader plays it
   (Melody Reader/js/sound.js, 2026-10-18 copy — keep the two alike):
     marimba     a sine with a ~0.5 s wooden envelope, a ×4 overtone of
                 75 ms, and a 25 ms pitch-swept thud
     vibraphone  a sine with a ~2.8 s bell envelope, and a 45 ms triangle
                 tap an octave up (the mallet)
   through a compressor (−12 dB, 12:1). Striking a bar that is still ringing
   stops its last voice first, with a short fade (fast repeats never pile up).

     init()              the context (made on the first click or key — browsers want one)
     strike(id)          a bar struck now ('C4' … 'A5')
     playAt(id, t)       a bar at audio time t (the app's mallet)  ·  stopPlayed()
     music(buffers)      → { play(from), stop(), solo(on), now() } the lesson's music
                           buffers = { music, solo } AudioBuffers (either may be null), and
                           lag: { music, solo } s of encoder padding at each one's start, skipped
     heardNow()          the audio time being heard right now (what the lights follow)
     voice, volume       the xylophone's sound and the whole app's loudness (0–1)
   ========================================================================== */
(function () {
  'use strict';
  let ctx = null, comp = null, master = null, bus = null;
  let voiceName = 'marimba', volume = 0.9;
  const XYLO = 0.3;               // the xylophone's level against the music (Melody Reader: 0.28 on its own)
  const live = new Map(), played = new Set();

  const freqOf = id => {
    const m = /^([A-G])([0-9])$/.exec(id || '');
    if (!m) return 0;
    const midi = 12 * (+m[2] + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    return 440 * Math.pow(2, (midi - 69) / 12);
  };

  function init() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: 'interactive' });
      bus = ctx.createGain(); bus.gain.value = volume;          // everything
      bus.connect(ctx.destination);
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 12;
      comp.connect(bus);
      master = ctx.createGain(); master.gain.value = XYLO;       // the xylophone
      master.connect(comp);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function osc(v, type, f, t, stop) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.start(t); o.stop(stop); v.oscs.push(o); return o;
  }
  function env(v, t, pts) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    pts.forEach(p => g.gain.exponentialRampToValueAtTime(Math.max(0.0001, p[0]), t + p[1]));
    g.connect(master); v.gains.push(g); return g;
  }
  function make(f, t, l) {
    const v = { oscs: [], gains: [], end: 0 };
    if (voiceName === 'marimba') {
      osc(v, 'sine', f, t, t + 0.52).connect(env(v, t, [[l, 0.003], [0.28 * l, 0.06], [0.08 * l, 0.16], [0.015 * l, 0.32], [0.0001, 0.48]]));
      osc(v, 'triangle', f * 4, t, t + 0.08).connect(env(v, t, [[0.18 * l, 0.003], [0.0001, 0.075]]));
      const th = osc(v, 'triangle', f * 3.2, t, t + 0.03);
      th.frequency.exponentialRampToValueAtTime(Math.max(f * 0.8, 80), t + 0.022);
      th.connect(env(v, t, [[0.3 * l, 0.002], [0.0001, 0.025]]));
      v.end = t + 0.55;
    } else {
      osc(v, 'sine', f, t, t + 2.9).connect(env(v, t, [[l, 0.006], [0.5 * l, 0.35], [0.18 * l, 0.95], [0.04 * l, 1.8], [0.0001, 2.8]]));
      osc(v, 'triangle', f * 2, t, t + 0.05).connect(env(v, t, [[0.05 * l, 0.006], [0.0001, 0.045]]));
      v.end = t + 2.95;
    }
    setTimeout(() => { v.gains.forEach(g => { try { g.disconnect(); } catch (_) { /* gone */ } }); played.delete(v); }, (v.end - ctx.currentTime) * 1000 + 100);
    return v;
  }
  function silence(v) {
    const t = ctx.currentTime;
    v.gains.forEach(g => {
      try {
        if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(t);
        else { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); }
        g.gain.setTargetAtTime(0, t, 0.004);
      } catch (_) { /* already finished */ }
    });
    v.oscs.forEach(o => { try { o.stop(t + 0.02); } catch (_) { /* already stopped */ } });
  }

  /* the audio time heard now: the output timestamp when it's trustworthy, else the clock less the output latency */
  function heardNow() {
    if (!ctx) return 0;
    const fallback = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    const ts = ctx.getOutputTimestamp && ctx.getOutputTimestamp();
    if (!ts || !(ts.performanceTime > 0)) return fallback;
    const v = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    return Math.abs(v - fallback) < 0.5 ? v : fallback;
  }

  window.XBSound = {
    init,
    freqOf,
    get ctx() { return ctx; },
    heardNow,
    strike(id) {
      if (!init()) return;
      const f = freqOf(id); if (!f) return;
      const old = live.get(id); if (old) silence(old);
      live.set(id, make(f, ctx.currentTime + 0.003, 1));
    },
    playAt(id, t) {
      if (!init()) return;
      const f = freqOf(id); if (!f) return;
      const old = live.get(id); if (old && old.end > t) silence(old);
      const v = make(f, Math.max(ctx.currentTime + 0.003, t), 0.9);
      live.set(id, v); played.add(v);
    },
    stopPlayed() { if (ctx) { played.forEach(silence); played.clear(); } },

    /* the lesson's music: a source per buffer, started together on the audio clock */
    music(buffers) {
      let sources = [], soloGain = null, soloOn = true;
      const m = {
        t0: 0, from: 0, playing: false,
        play(from) {
          m.stop();
          if (!init()) return;
          m.from = from; m.t0 = ctx.currentTime + 0.08;              // a moment to get going
          soloGain = null;
          [['music', buffers.music], ['solo', buffers.solo]].forEach(([k, b]) => {
            const at = Math.max(0, from + (buffers.lag && buffers.lag[k] || 0));     // past the encoder's padding
            if (!b || at >= b.duration) return;
            const s = ctx.createBufferSource(), g = ctx.createGain();
            s.buffer = b; g.gain.value = k === 'solo' && !soloOn ? 0 : 1;
            s.connect(g).connect(bus);
            s.start(m.t0, at);
            sources.push(s);
            if (k === 'solo') soloGain = g;
          });
          m.playing = true;
        },
        stop() { sources.forEach(s => { try { s.stop(); } catch (_) { /* not started */ } }); sources = []; m.playing = false; },
        /* the instrument's own part heard or not (the player plays it instead) */
        solo(on) {
          soloOn = !!on;
          if (soloGain && ctx) soloGain.gain.setTargetAtTime(soloOn ? 1 : 0, ctx.currentTime, 0.03);
        },
        /* where in the music the heard sound is now (s) */
        now() { return m.from + Math.max(0, heardNow() - m.t0); }
      };
      return m;
    },

    get voice() { return voiceName; },
    set voice(v) { voiceName = v === 'vibraphone' ? 'vibraphone' : 'marimba'; },
    get volume() { return volume; },
    set volume(v) { volume = Math.max(0, Math.min(1, +v || 0)); if (bus) bus.gain.value = volume; }
  };
})();
