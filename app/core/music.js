/* ==========================================================================
   VMM Creation Studio — core/music.js
   --------------------------------------------------------------------------
   Studio.Music — one bar of music: the slides every studio is made of.

   Ticks: a sixteenth = 1 (Melody Reader's unit), so a 4/4 bar = 16, a
   quarter = 4, an eighth = 2. Pitches are ids like 'D4'; a step is the
   diatonic step from C4 (C4 = 0, D4 = 1 … A5 = 12). A rest has pitch null.

   The quick text form (what the preview and DEGA's slides are typed in):
     D        a quarter note (octave 4)        D'   the octave above (D5)
     D-       a half note (each - adds a beat) D--  dotted half   D---  whole
     GE       two pitches together = a beamed pair of eighths
     r        a quarter rest                   r-   half rest     r---  whole rest
     v ^      at the end of a note or pair: stem down / up (else the series' rule)
   e.g. DEGA's examples: "D E G A", "A GG EE D", "r GE r AD", "GA DE GE G"

   parse(text, opt) → { events, ticks, error }
     events: [{ pitch, step, ticks, start, beam, stem, token }]
       beam: an index shared by the notes of one beamed group, else null
       stem: 'up' | 'down' | null (null = let the series decide)
     opt: { barTicks (16), range: ['C4', 'A5'] }
   text(events) → the quick text form again
   ========================================================================== */
(function () {
  'use strict';
  const Studio = window.Studio;
  const LETTERS = 'CDEFGAB';

  const M = Studio.Music = {
    LETTERS,
    step(id) {
      const m = /^([A-G])(\d)$/.exec(id || '');
      return m ? LETTERS.indexOf(m[1]) + 7 * (+m[2] - 4) : null;
    },
    id(step) {
      return LETTERS[((step % 7) + 7) % 7] + (4 + Math.floor(step / 7));
    },
    letter: id => id ? id[0] : null,
    /* every pitch from lo to hi, e.g. range('C4', 'A5') → 13 ids */
    range(lo, hi) {
      const out = [];
      for (let s = M.step(lo); s <= M.step(hi); s++) out.push(M.id(s));
      return out;
    }
  };

  /* 'D' → D4, "D'" → D5, 'd' → D4 */
  function pitchOf(tok) {
    return tok[0].toUpperCase() + (tok.length > 1 && tok[1] === "'" ? '5' : '4');
  }

  M.parse = function (text, opt) {
    const o = Object.assign({ barTicks: 16, range: ['C4', 'A5'] }, opt || {});
    const lo = M.step(o.range[0]), hi = M.step(o.range[1]);
    const events = [];
    let t = 0, beam = 0, error = null;
    const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
    tokens.forEach((tok, ti) => {
      if (error) return;
      const m = /^(r|R|(?:[A-Ga-g]'?)+)(-*)([v^]?)$/.exec(tok);
      if (!m) { error = 'I can’t read “' + tok + '”'; return; }
      const dashes = m[2].length, stem = m[3] === 'v' ? 'down' : m[3] === '^' ? 'up' : null;
      if (/^[rR]$/.test(m[1])) {
        if (dashes === 2) { error = '“' + tok + '”: no dotted-half rest — use r- r'; return; }
        const ticks = 4 * (1 + dashes);
        events.push({ pitch: null, step: null, ticks, start: t, beam: null, stem: null, token: ti });
        t += ticks;
        return;
      }
      const pitches = m[1].match(/[A-Ga-g]'?/g).map(pitchOf);
      for (const p of pitches) {
        const s = M.step(p);
        if (s < lo || s > hi) { error = p + ' is outside ' + o.range[0] + '–' + o.range[1]; return; }
      }
      if (pitches.length === 1) {
        const ticks = 4 * (1 + dashes);
        events.push({ pitch: pitches[0], step: M.step(pitches[0]), ticks, start: t, beam: null, stem, token: ti });
        t += ticks;
      } else if (pitches.length === 2 && !dashes) {
        if (t % 4) { error = '“' + tok + '” has to start on a beat'; return; }
        pitches.forEach(p => {
          events.push({ pitch: p, step: M.step(p), ticks: 2, start: t, beam, stem, token: ti });
          t += 2;
        });
        beam++;
      } else {
        error = '“' + tok + '”: two notes together make a pair of eighths (more is not ready yet)';
      }
    });
    if (!error && t !== o.barTicks) {
      error = t < o.barTicks ? 'The bar is short by ' + beatsText(o.barTicks - t) : 'The bar is too long by ' + beatsText(t - o.barTicks);
    }
    return { events, ticks: t, error };
  };

  function beatsText(ticks) {
    const b = ticks / 4;
    return (b === 0.5 ? 'half a beat' : b + (b === 1 ? ' beat' : ' beats'));
  }

  M.text = function (events) {
    const out = [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const p = id => id[0] + (id[1] === '5' ? "'" : '');
      const st = e.stem === 'down' ? 'v' : e.stem === 'up' ? '^' : '';
      if (e.beam != null && events[i + 1] && events[i + 1].beam === e.beam) {
        out.push(p(e.pitch) + p(events[i + 1].pitch) + st);
        i++;
      } else {
        out.push((e.pitch ? p(e.pitch) : 'r') + '-'.repeat(e.ticks / 4 - 1) + st);
      }
    }
    return out.join(' ');
  };
})();
