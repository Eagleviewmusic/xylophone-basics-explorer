/* ==========================================================================
   VMM Creation Studio — core/show.js
   --------------------------------------------------------------------------
   Studio.Show — the running order as a timeline, and what is on screen at
   any moment. This is the "frame(t)" brain: preview and (Phase 4) export ask
   it the same question. Phase 3 will move its times onto the MIDI's notes;
   until then everything sits on the project's beat (tempo.bpm).

   Sections (project.order):
     (any of the four card kinds may add  transition: { style: 'outin'|'glide'|'cut', beats } —
      its last beats move into whatever comes next; layout: { part: { x, y, s } } — arranged by hand)
     logo   { bars }                        the logo, full screen — whole bars, so a MIDI made for Ableton
                                            (core/guide.js) keeps its bar 1 at 0:00 and everything after on the grid
     title  { beats, line, demo }           the title card; demo = a slide played on it (-1 none)
     card   { style: 'over'|'full', beats, lines }   words over the stage / on their own
     part   { name, slides: 'all'|[i…], repeats, countdown: 'each'|'first'|'none', bars, firstBars }
              each slide: a countdown (bars × 4 beats) then the bar played `repeats` times;
              the tracker counts the part's slides (any number: the series fits them in)
     end    { seconds, lines, mallet: 'tap'|'still'|'none' }
     any of them may have  at: seconds — put on the timeline by hand: it starts there (a 'wait' fills the gap
     before it, showing what comes next), or straight after the one before if that runs past it (show.late)

   build(project, slides) → { segs, total, beat, chapters, hits }
     slides = the parsed slides (Studio.Music.parse results)
     seg: { kind: 'logo'|'title'|'card'|'countdown'|'play'|'end'|'wait', t0, t1, section, placed?, … }
     a part's slides number on across parts in a row (one tracker for the run); late = blocks pushed past their place
     hits: every note as it is played, in order — [{ t, pitch }] (the parts' slides and a title's demo)
   stills(show, slides, project) → [{ name: 'Title' | 'Example k', slide?, state }] — "Take screen shots"
   at(show, t, slides, project) → the state a series' scene() draws:
     { slide, lit, countdown, tracker: { count, lit }, card, live }
     live = { t, beat, prev, next }: the moment, and the hits either side of it (prev ≤ t < next, null at
     the ends) — for something that moves every frame, such as a series' mallet. It is the one part of a
     state that changes every frame, so a picture cache can leave it out (core/render.js, core/export.js)
   ========================================================================== */
(function () {
  'use strict';
  const Studio = window.Studio;
  const BAR = 16;                               // ticks in a 4/4 bar

  const Show = Studio.Show = {};

  const playable = (sl) => sl && !sl.error && sl.events.length;

  Show.partSlides = function (sec, slides) {
    const all = slides.map((s, i) => i).filter(i => playable(slides[i]));
    const list = sec.slides === 'all' || !Array.isArray(sec.slides) ? all : sec.slides.filter(i => all.includes(i));
    return list;
  };

  Show.build = function (project, slides) {
    const beat = 60 / (project.tempo && project.tempo.bpm || 53);
    const segs = [], chapters = [];
    let t = 0, afterCard = false;                // a part right after a full card shares its chapter
    let run = null;                              // slides in a row (parts one after another) share one tracker
    const late = [];
    const add = (kind, dur, extra) => {
      const seg = Object.assign({ kind, t0: t, t1: t + Math.max(0, dur) }, extra);
      if (seg.t1 > seg.t0) segs.push(seg);
      t = seg.t1;
      return seg;
    };
    (project.order || []).forEach((sec, si) => {
      const base = { section: si };
      if (sec.at != null) base.placed = true;
      const followsCard = afterCard;
      afterCard = sec.type === 'card' && sec.style === 'full' && !!(sec.lines || [])[0];
      if (sec.type !== 'part') run = null;
      // a block put on the timeline by hand starts where it was put; until then the next block waits on screen
      let wait = null;
      if (sec.at != null) {                     // (within 2 ms counts as touching)
        if (+sec.at > t + 0.002) wait = add('wait', +sec.at - t, { section: si, placed: true });
        else if (+sec.at < t - 0.002) late.push({ section: si, at: +sec.at, t });
      }
      const from = segs.length;
      if (sec.type === 'logo') {
        if (!chapters.length) chapters.push({ t, name: 'Intro' });
        const bars = sec.bars != null ? +sec.bars || 0 : +sec.seconds > 0 ? Math.max(1, Math.round(+sec.seconds / (4 * beat))) : 0;
        add('logo', bars * 4 * beat, Object.assign({ trans: sec.transition }, base));
      } else if (sec.type === 'title') {
        if (!chapters.length) chapters.push({ t, name: 'Intro' });
        add('title', (+sec.beats || 0) * beat, Object.assign({ demo: sec.demo, line: sec.line, beatsLong: +sec.beats || 0, trans: sec.transition }, base));
      } else if (sec.type === 'card') {
        if (sec.style === 'full' && (sec.lines || [])[0]) chapters.push({ t, name: titleCase(sec.lines[0]) });
        add('card', (+sec.beats || 0) * beat, Object.assign({ style: sec.style, lines: sec.lines || [], trans: sec.transition }, base));
      } else if (sec.type === 'part') {
        const list = Show.partSlides(sec, slides);
        const reps = Math.max(1, +sec.repeats || 1);
        let named = false;
        run = run || { count: 0 };
        list.forEach((slide, k) => {
          const counting = sec.countdown === 'each' || (sec.countdown === 'first' && k === 0);
          const bars = k === 0 ? (+sec.firstBars || +sec.bars || 2) : (+sec.bars || 2);
          const ex = { slide, example: ++run.count, run };
          if (sec.countdown === 'each') chapters.push({ t, name: (sec.name ? sec.name + ' · ' : '') + 'Example ' + ex.example });
          else if (!named) { if (!followsCard) chapters.push({ t, name: sec.name || 'Part' }); named = true; }
          if (counting) add('countdown', bars * 4 * beat, Object.assign({ bars }, ex, base));
          add('play', reps * 4 * beat, Object.assign({ reps }, ex, base));
        });
      } else if (sec.type === 'end') {
        chapters.push({ t, name: 'The end' });
        add('end', +sec.seconds || 0, Object.assign({ lines: sec.lines || [], mallet: sec.mallet || 'tap', trans: sec.transition }, base));
      }
      if (wait) wait.next = segs.length > from ? segs[from] : null;
    });
    // the tracker: as many circles as slides in the run
    segs.forEach(g => { if (g.run) { g.count = g.run.count; delete g.run; } });
    return { segs, total: t, beat, chapters, late, hits: Show.hits(segs, slides, beat) };
  };

  /* every note as it's played: a part's slide `reps` times; a title's demo over and over while the title lasts */
  Show.hits = function (segs, slides, beat) {
    const tick = beat / 4, out = [];
    const bar = (sl, t0, t1) => sl.events.forEach(e => {
      const t = t0 + e.start * tick;
      if (e.pitch && t < t1 - 1e-9) out.push({ t, pitch: e.pitch });
    });
    segs.forEach(g => {
      if (g.kind === 'play' && playable(slides[g.slide])) {
        for (let r = 0; r < g.reps; r++) bar(slides[g.slide], g.t0 + r * BAR * tick, g.t1);
      } else if (g.kind === 'title' && g.demo != null && g.demo >= 0 && playable(slides[g.demo])) {
        for (let t0 = g.t0; t0 < g.t1 - 1e-9; t0 += BAR * tick) bar(slides[g.demo], t0, g.t1);
      }
    });
    return out;
  };

  /* the hits either side of t: { t, beat, prev, next, near(keep) } — near(keep) = the nearest either side that
     keep(hit) passes (a series skipping notes it can't show); a function, so it stays out of JSON and cache keys */
  Show.live = function (hits, t, beat) {
    let lo = 0, hi = hits.length;                 // the first hit after t
    while (lo < hi) { const mid = (lo + hi) >> 1; if (hits[mid].t <= t) lo = mid + 1; else hi = mid; }
    const near = keep => {
      let i = lo - 1, j = lo;
      while (i >= 0 && !keep(hits[i])) i--;
      while (j < hits.length && !keep(hits[j])) j++;
      return { prev: i >= 0 ? hits[i] : null, next: j < hits.length ? hits[j] : null };
    };
    return { t, beat, prev: lo > 0 ? hits[lo - 1] : null, next: lo < hits.length ? hits[lo] : null, near };
  };

  function titleCase(s) {
    s = String(s).trim();
    return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;
  }

  /* which event is lit `tick` ticks into a bar (rests light too); a light goes out
     `gapTicks` before the next event starts */
  Show.litAt = function (events, tick, gapTicks) {
    for (let i = 0; i < events.length; i++) {
      const e = events[i], end = (i + 1 < events.length ? events[i + 1].start : BAR) - gapTicks;
      if (tick >= e.start && tick < end) return i;
    }
    return -1;
  };

  Show.segAt = function (show, t) {
    const s = show.segs;
    if (!s.length) return -1;
    if (t >= show.total) return s.length - 1;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].t0 <= t) lo = mid; else hi = mid - 1; }
    return lo;
  };

  Show.at = function (show, t, slides, project, inner) {
    const i = Show.segAt(show, t);
    if (i < 0) return { slide: null, lit: -1 };
    const seg = show.segs[i];
    const st = Show.stateIn(show, seg, i, t, slides, project);
    if (show.hits) st.live = Show.live(show.hits, t, show.beat);
    // the end of a card can move into whatever comes next
    const tr = seg.trans;
    if (!inner && tr && tr.style && tr.style !== 'cut' && tr.beats > 0 && i + 1 < show.segs.length) {
      const dur = seg.t1 - seg.t0, tb = Math.min(dur, tr.beats * show.beat), local = t - seg.t0;
      if (local >= dur - tb) st.trans = { u: (local - (dur - tb)) / tb, style: tr.style, to: Show.at(show, seg.t1 + 1e-4, slides, project, true) };
    }
    return st;
  };

  Show.stateIn = function (show, seg, i, t, slides, project) {
    const local = Math.max(0, t - seg.t0);
    const tickSec = show.beat / 4;
    const gap = ((project.light && project.light.gap) != null ? project.light.gap : 0.2) / tickSec;
    const playing = (slide) => {
      const sl = slides[slide];
      if (!playable(sl)) return -1;
      return Show.litAt(sl.events, (local / tickSec) % BAR, gap);
    };
    switch (seg.kind) {
      case 'logo': return { card: { type: 'logo', section: seg.section }, slide: null };
      case 'title': {
        const demo = seg.demo != null && seg.demo >= 0 && playable(slides[seg.demo]) ? seg.demo : null;
        return { card: { type: 'title', section: seg.section, line: seg.line, demo, lit: demo == null ? -1 : playing(demo) }, slide: null };
      }
      case 'card': {
        // words over the stage show the slide that comes next
        const next = show.segs.slice(i + 1).find(s => s.slide != null);
        return { card: { type: 'card', section: seg.section, style: seg.style, lines: seg.lines }, slide: seg.style === 'over' && next ? next.slide : null, lit: -1 };
      }
      case 'countdown': {
        const b = Math.floor(local / show.beat);           // 0 …
        return { slide: seg.slide, lit: -1, countdown: (seg.bars === 1 ? 5 : 1) + b, tracker: { count: seg.count, lit: seg.example } };
      }
      case 'play': return { slide: seg.slide, lit: playing(seg.slide), tracker: { count: seg.count, lit: seg.example } };
      case 'end': return { card: { type: 'end', section: seg.section, lines: seg.lines, mallet: seg.mallet, beat: Math.floor(local / show.beat) }, slide: null };
      case 'wait': {
        // a gap before a block put on the timeline: the next one waits — a slide unlit, its countdown circles empty
        const nx = seg.next;
        if (!nx) return { slide: null, lit: -1 };
        if (nx.kind === 'countdown' || nx.kind === 'play') return { slide: nx.slide, lit: -1, countdown: nx.kind === 'countdown' ? 0 : null, tracker: { count: nx.count, lit: nx.example } };
        const st = Show.stateIn(show, nx, i + 1, nx.t0, slides, project);
        if (st.card && st.card.lit != null) st.card.lit = -1;
        return st;
      }
    }
    return { slide: null, lit: -1 };
  };

  /* the pictures "Take screen shots" makes (the user, 2026-10-17): the title, then each exercise — each slide the video
     plays, the first time it plays it. Nothing lit and no countdown: each is the moment a 16th before it starts (the
     title: before its demo's first note), with the countdown taken off — so anything moving waits there, ready. */
  Show.stills = function (show, slides, project) {
    const out = [], q = show.beat / 4, seen = new Set();
    const quiet = (st, t) => {
      st.lit = -1; st.countdown = null; delete st.trans;
      if (st.card && st.card.lit != null) st.card.lit = -1;
      if (show.hits) st.live = Show.live(show.hits, t, show.beat);
      return st;
    };
    show.segs.forEach((g, i) => {
      if (g.kind === 'title' && !out.some(s => s.name === 'Title')) {
        const first = (show.hits || []).find(h => h.t >= g.t0 - 1e-9 && h.t < g.t1);
        out.push({ name: 'Title', state: quiet(Show.stateIn(show, g, i, g.t0, slides, project), (first ? first.t : g.t0) - q) });
      } else if (g.kind === 'play' && !seen.has(g.slide)) {
        seen.add(g.slide);
        out.push({ name: 'Example ' + seen.size, slide: g.slide, state: quiet(Show.stateIn(show, g, i, g.t0, slides, project), g.t0 - q) });
      }
    });
    return out;
  };

  /* 83.4 → "1:23" */
  Show.clock = function (t) {
    const s = Math.max(0, Math.floor(t + 1e-6));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  /* YouTube chapter lines; toVideo maps the beat grid onto the music when the timing follows it */
  Show.chapterText = (show, toVideo) => show.chapters.map(c => Show.clock(toVideo ? toVideo(c.t) : c.t) + ' ' + c.name).join('\n');
})();
