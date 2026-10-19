/* ==========================================================================
   VMM Creation Studio — core/sync.js
   --------------------------------------------------------------------------
   Studio.Sync — timing from the music (D2). The running order (core/show.js)
   puts every note on a beat grid; Sync pairs each of those notes with a hit
   in the drum cue, or a note in the MIDI of the solo line, and bends the
   grid onto the real times. Every light then comes on at its hit.

     expected(show, slides)   → every note the video lights, in order (grid
                                time), and every countdown beat
     match(expected, hits, o) → which hit belongs to which note
                                hits: [{ t, id? }] (id = a MIDI note's pitch)
     warp(anchors)            → { fwd(gridT) → videoT, inv(videoT) → gridT }
     run(project, show, slides, hits, source) → { warp, report, marks }

   How the pairing works, a block at a time (a block = one slide's plays, or
   the title's demo):
     1. find where the block starts: try each nearby hit as its first note and
        keep the one that makes the most of the block's first notes line up
        (pitch counts too, for MIDI) — so a card that runs longer or shorter
        than planned doesn't matter;
     2. walk its notes in order, each to the nearest hit, following the music
        as it drifts;
     3. the block's countdown beats take the hits just before it (DEGA's cue
        clicks them); without clicks they're set back from the first note at
        the block's own tempo.
   Hits nobody claims are "extra"; notes without a hit keep the grid's time
   and are reported. project.sync.nudge = { key: seconds } moves a note by
   hand (the Audio tab's marks).
   ========================================================================== */
(function () {
  'use strict';
  const Studio = window.Studio;
  const Sy = Studio.Sync = {};
  const BAR = 16;

  Sy.expected = function (show, slides) {
    const tick = show.beat / 4;
    const out = [];
    show.segs.forEach((seg, si) => {
      if (seg.kind === 'countdown') {
        for (let b = 0; b < seg.bars * 4; b++) out.push({ kind: 'count', g: seg.t0 + b * show.beat, seg: si, block: null, key: 'c' + si + ':' + b, beat: b });
        return;
      }
      const slide = seg.kind === 'play' ? seg.slide : seg.kind === 'title' ? seg.demo : null;
      const sl = slide != null ? slides[slide] : null;
      if (!sl || sl.error || !sl.events.length) return;
      const ticks = seg.kind === 'play' ? seg.reps * BAR : Math.floor((seg.beatsLong || 0) * 4);
      for (let r = 0; r * BAR < ticks; r++) {
        sl.events.forEach((e, ei) => {
          const at = r * BAR + e.start;
          if (at >= ticks) return;
          // a rest lights too (dark red), and DEGA's cue clicks it — but a cue may not, so it's optional
          out.push({ kind: e.pitch ? 'note' : 'rest', g: seg.t0 + at * tick, seg: si, rep: r, ev: ei, slide, id: e.pitch || null, key: si + ':' + r + ':' + ei,
            win: seg.placed ? 4 * show.beat : null, local: seg.kind === 'title' ? 4 * show.beat : null });
        });
      }
    });
    out.sort((a, b) => a.g - b.g);
    // how close a hit must be: under a third of the gap to the nearest neighbour, 0.15 s at most
    out.forEach((e, i) => {
      const gp = i ? e.g - out[i - 1].g : Infinity, gn = i + 1 < out.length ? out[i + 1].g - e.g : Infinity;
      e.tol = Math.min(0.15, 0.34 * Math.min(gp, gn));
    });
    return out;
  };

  const letter = id => id ? id[0] : null;

  Sy.match = function (expected, hits, opt) {
    const o = Object.assign({ search: [3, 12], probe: 24, firsts: 4 }, opt || {});
    const used = new Array(hits.length).fill(false);
    const pair = new Map();                       // key → hit index
    // blocks: one segment's notes and rests (rests are optional; only notes decide where a block starts)
    const blocks = [];
    expected.filter(e => e.kind !== 'count').forEach(e => {
      const b = blocks[blocks.length - 1];
      if (b && b.seg === e.seg) b.all.push(e); else blocks.push({ seg: e.seg, all: [e] });
    });
    blocks.forEach(b => { b.notes = b.all.filter(e => e.kind === 'note'); });
    const counts = expected.filter(e => e.kind === 'count');
    let off = null, j = 0;                         // the music's lead over the grid; first unclaimed hit

    const firstAt = t => { let lo = 0, hi = hits.length; while (lo < hi) { const m = (lo + hi) >> 1; if (hits[m].t < t) lo = m + 1; else hi = m; } return lo; };
    let lim = hits.length;                         // hits from here on belong to a block put on the timeline by hand
    const nearest = (t, tol, from, want) => {
      let best = -1, bd = Infinity;
      for (let k = Math.max(from, firstAt(t - tol)); k < lim && hits[k].t <= t + tol; k++) {
        if (used[k]) continue;
        let d = Math.abs(hits[k].t - t);
        if (want && hits[k].id && letter(hits[k].id) !== want) d += tol;   // the right pitch wins a tie
        if (d < bd) { bd = d; best = k; }
      }
      return best;
    };
    /* how well a start fits: walk the block's first notes as the real walk will, each one
       re-centred on the hit before it (so a tempo that's a little off doesn't add up) */
    const score = (block, offset, from) => {
      let s = 0, off2 = offset, k0 = from;
      const n = Math.min(o.probe, block.notes.length);
      for (let i = 0; i < n; i++) {
        const e = block.notes[i], k = nearest(e.g + off2, e.tol, k0);
        if (k < 0) continue;
        s += 1 + (hits[k].id && letter(hits[k].id) === letter(e.id) ? 0.5 : 0);
        off2 = hits[k].t - e.g; k0 = k + 1;
      }
      return s;
    };

    const doBlock = block => {
      if (!block.notes.length) return;
      const first = block.notes[0];
      const blockStartHit = j;
      // a block put on the timeline by hand is where it was put: look within a bar of there, not where the last one ran to;
      // the title's demo looks within a bar of where it is too (so it can't take a slide's notes further on)
      if (first.win || (first.local && off == null)) off = 0;
      const back = first.win || first.local || o.search[0], ahead = first.win || first.local || o.search[1];
      // 1. where does this block start? Each nearby hit is tried as each of the block's first
      //    few notes (so a missing first hit doesn't matter); the most notes lining up wins
      const pred = first.g + (off == null ? 0 : off);
      const lo = off == null ? 0 : firstAt(pred - back);
      let bestOff = off == null ? null : off, bestScore = off == null ? -1 : score(block, off, j) - 0.25;
      const firsts = block.notes.slice(0, o.firsts);
      for (let k = Math.max(lo, j); k < lim && (off == null || hits[k].t <= pred + ahead + (firsts[firsts.length - 1].g - first.g)); k++) {
        if (used[k]) continue;
        firsts.forEach(q => {
          const cand = hits[k].t - q.g, sc = score(block, cand, j);
          const near = off == null ? 0 : Math.abs(cand - off) * (first.win ? 0.2 : 1e-3);   // a preference for staying put (strong where placed)
          if (sc - near > bestScore) { bestScore = sc - near; bestOff = cand; }
        });
        if (off == null && k > 120) break;
      }
      if (bestOff == null) return;
      off = bestOff;
      // 2. walk the notes (and rests) in order
      block.all.forEach(e => {                    // a rest before the first note too (DEGA ex 4 opens with one)
        const k = nearest(e.g + off, e.tol, j, e.id ? letter(e.id) : null);
        if (k >= 0) { used[k] = true; pair.set(e.key, k); off = hits[k].t - e.g; j = k + 1; }
      });
      block.last = j;
      // 3. its countdown: the beats just before it
      const firstHit = pair.get(first.key);
      if (firstHit == null) return;
      block.firstHit = firstHit;
      const prevSeg = first.seg - 1;
      counts.filter(c => c.seg === prevSeg).forEach(c => {
        const t = hits[firstHit].t - (first.g - c.g);
        const k = nearest(t, Math.min(0.15, c.tol), blockStartHit);
        if (k >= 0 && k < firstHit) { used[k] = true; pair.set(c.key, k); }
      });
    };

    // first the blocks put on the timeline by hand, each where it was put; then the rest in order, each
    // only among the hits between the placed blocks either side of it (so a title's demo can't take a slide's notes)
    const placed = blocks.filter(b => b.notes.length && b.notes[0].win);
    placed.forEach(b => { j = firstAt(b.notes[0].g - b.notes[0].win); lim = hits.length; doBlock(b); });
    off = null; j = 0;
    blocks.forEach((b, bi) => {
      if (b.notes.length && b.notes[0].win) {         // after a placed block: carry on from its last hit, at its offset
        if (b.last != null) j = Math.max(j, b.last);
        const e = b.notes[b.notes.length - 1], k = pair.get(e.key);
        if (k != null) off = hits[k].t - e.g;
        return;
      }
      const next = blocks.slice(bi + 1).find(q => q.notes.length && q.notes[0].win && q.firstHit != null);
      lim = hits.length;
      if (next) {                                     // stop short of the next placed block (and its countdown's clicks)
        lim = next.firstHit;
        counts.forEach(c => { if (c.seg === next.notes[0].seg - 1 && pair.has(c.key)) lim = Math.min(lim, pair.get(c.key)); });
      }
      doBlock(b);
    });
    lim = hits.length;
    return { pair, used };
  };

  /* piecewise-straight, both ways; outside the anchors it runs at 1:1 */
  Sy.warp = function (anchors) {
    const a = anchors.slice().sort((x, y) => x.g - y.g);
    const clean = [];
    a.forEach(p => { const last = clean[clean.length - 1]; if (!last || (p.g > last.g + 1e-6 && p.t > last.t + 1e-6)) clean.push(p); });
    const lerp = (arr, x, from, to) => {
      if (!arr.length) return x;
      if (x <= arr[0][from]) return arr[0][to] + (x - arr[0][from]);
      const L = arr[arr.length - 1];
      if (x >= L[from]) return L[to] + (x - L[from]);
      let lo = 0, hi = arr.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m][from] <= x) lo = m; else hi = m; }
      const p = arr[lo], q = arr[hi];
      return p[to] + (x - p[from]) * (q[to] - p[to]) / (q[from] - p[from]);
    };
    return { anchors: clean, fwd: g => lerp(clean, g, 'g', 't'), inv: t => lerp(clean, t, 't', 'g') };
  };

  Sy.run = function (project, show, slides, hits, source) {
    const exp = Sy.expected(show, slides);
    const { pair, used } = Sy.match(exp, hits);
    const nudge = (project.sync && project.sync.nudge) || {};
    const anchors = [{ g: 0, t: 0 }];
    // a title's demo the music doesn't play (none of its notes found) isn't missing anything: it lights on the beat
    const silent = new Set(show.segs.map((g, si) => g.kind === 'title' && !exp.some(e => e.seg === si && e.kind === 'note' && pair.has(e.key)) ? si : null).filter(si => si != null));
    const notes = exp.filter(e => e.kind === 'note' && !silent.has(e.seg));
    exp.forEach(e => {
      const k = pair.get(e.key);
      if (nudge[e.key] != null) anchors.push({ g: e.g, t: +nudge[e.key], hand: true });
      else if (k != null) anchors.push({ g: e.g, t: hits[k].t });
    });
    // countdowns with no clicks: set back from the block's first note at the block's own tempo
    show.segs.forEach((seg, si) => {
      if (seg.kind !== 'countdown') return;
      if (exp.some(e => e.seg === si && pair.has(e.key))) return;
      const blk = notes.filter(e => e.seg === si + 1 && (pair.has(e.key) || nudge[e.key] != null));
      if (blk.length < 2) return;
      const tOf = e => nudge[e.key] != null ? +nudge[e.key] : hits[pair.get(e.key)].t;
      const a = blk[0], z = blk[blk.length - 1];
      const slope = (tOf(z) - tOf(a)) / (z.g - a.g) || 1;
      anchors.push({ g: seg.t0, t: tOf(a) - (a.g - seg.t0) * slope, set: true });
    });
    const warp = Sy.warp(anchors);

    // the report
    const missing = [], mismatched = [], ratios = [];
    let prev = null;
    notes.forEach(e => {
      const k = pair.get(e.key);
      if (k == null && nudge[e.key] == null) missing.push({ key: e.key, id: e.id, t: warp.fwd(e.g), slide: e.slide });
      if (k != null && hits[k].id && letter(hits[k].id) !== letter(e.id)) mismatched.push({ key: e.key, want: e.id, got: hits[k].id, t: hits[k].t, slide: e.slide });
      if (k != null && prev && prev.e.seg === e.seg && e.g > prev.e.g) ratios.push((hits[k].t - hits[prev.k].t) / (e.g - prev.e.g));
      prev = k != null ? { e, k } : prev;
    });
    ratios.sort((x, y) => x - y);
    const ratio = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
    const extra = hits.map((h, k) => used[k] ? null : h.t).filter(t => t != null);
    const octave = (() => {
      const d = {};
      exp.forEach(e => { const k = pair.get(e.key); if (k != null && hits[k].id && e.id) { const v = (+hits[k].id.slice(-1)) - (+e.id.slice(-1)); d[v] = (d[v] || 0) + 1; } });
      const best = Object.keys(d).sort((x, y) => d[y] - d[x])[0];
      return best != null ? +best : 0;
    })();
    const marks = exp.map(e => ({
      key: e.key, kind: e.kind, id: e.id || null, g: e.g, t: warp.fwd(e.g),
      hit: pair.has(e.key) ? hits[pair.get(e.key)].t : null, hand: nudge[e.key] != null
    }));
    return {
      warp, marks,
      report: {
        source, hits: hits.length, notes: notes.length,
        matched: notes.filter(e => pair.has(e.key)).length,
        counts: exp.filter(e => e.kind === 'count').length, countsMatched: exp.filter(e => e.kind === 'count' && pair.has(e.key)).length,
        rests: exp.filter(e => e.kind === 'rest').length, restsMatched: exp.filter(e => e.kind === 'rest' && pair.has(e.key)).length,
        missing, mismatched, extra, octave,
        bpm: (project.tempo && project.tempo.bpm || 53) / ratio, nudged: Object.keys(nudge).length
      }
    };
  };
})();
