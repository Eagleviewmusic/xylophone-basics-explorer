/* ==========================================================================
   VMM Creation Studio — core/project.js
   --------------------------------------------------------------------------
   Studio.Project — the project file (project.json in the video's folder).

     {
       format: 1, series: 'xylophone-basics', title,
       tempo:  { bpm },            the slide's beat (DEGA: 52.94 = Ableton's 106 in half time)
       light:  { gap },            seconds a light goes out before the next note (D8: 0.2)
       xylophone: { base, bars, gaps, nudge, mallet },   (series settings — the core just keeps them;
                                   mallet: false = no mallet playing the bars; on unless set)
       staff:  { lines, colour },
       slides: [{ music }],        one bar each, the quick text form (core/music.js); 7 at most
       order:  [section…],         the running order (core/show.js)
                                   a card or the end may add  show: 'words'|'icons'|'both'  and
                                   icons: [id…] (the series draws them; '' = none in that place)
       audio:  [{ id, file, role: 'music'|'cue'|'midi', volume, offset, muted }]
                                   files in the video's folder; offset = where the file's 0 sits
                                   on the video (s); a cue and a MIDI are never heard
       sync:   { source: 'auto'|'beat'|<audio id>, nudge: { key: seconds } }
                                   what the lights follow (auto: the MIDI, else a cue, else the beat)
     }

   blank(seriesId)      a new project: DEGA's cards, no slides on the timeline yet (they're dropped there)
   slideBlock(i, at)    one slide's block for the timeline: 8-beat countdown, the bar 4 times
   normalise(p)         fill in anything missing (old files keep working), keep the rest
   retempo(p, bpm, slides)  a new tempo; blocks put by hand keep their place against the music
   check(p, pack)       { slides: [{ error, events }], missing: [ids], unused: [ids] }
   ========================================================================== */
(function () {
  'use strict';
  const Studio = window.Studio, M = Studio.Music;
  const MAX_SLIDES = 7;                        // the tracker never has more than 7 (the user's rule)

  /* DEGA's running order — the template every new video starts from. The cards as the user set them
     (2026-10-16): "Repeat x4 / Play Along" as icons; ADVANCED MODE in words with the no-sign beside
     "No breaks" (DEGA's way); the end with its words and the mallet put down (the series draws the icons) */
  const ORDER = () => [
    { type: 'logo', bars: 1 },
    { type: 'title', beats: 8, line: 'Xylophone Basics:', demo: 0, transition: { style: 'outin', beats: 2 } },
    { type: 'card', style: 'over', beats: 4, lines: ['Repeat x4', 'Play Along'], show: 'icons' },
    { type: 'part', name: 'Part 1', slides: 'all', repeats: 4, countdown: 'each', bars: 2, firstBars: 1 },
    { type: 'card', style: 'full', beats: 11.5, lines: ['ADVANCED MODE', 'No breaks'], show: 'both', icons: ['', 'nobreaks'] },
    { type: 'part', name: 'Advanced', slides: 'all', repeats: 4, countdown: 'first', bars: 2, firstBars: 2 },
    { type: 'end', seconds: 16, lines: ['Thanks for playing along'], show: 'both' }
  ];

  const P = Studio.Project = { FORMAT: 1, MAX_SLIDES, ORDER };

  /* a new video (the user, 2026-10-17): the cards, and the slides dropped onto the timeline one by one —
     each a block of its own (an 8-beat countdown, then the bar 4 times). No Advanced part yet. */
  const NEW_ORDER = () => ORDER().filter(s => !(s.type === 'part' || (s.type === 'card' && s.style === 'full')));
  P.NEW_ORDER = NEW_ORDER;
  /* one slide's block on the timeline: an 8-beat countdown, then the bar played 4 times */
  P.slideBlock = (slide, at) => section(Object.assign({ type: 'part', name: '', slides: [slide], repeats: 4, countdown: 'each', bars: 2, firstBars: 2 },
    at != null ? { at: Math.round(at * 1000) / 1000 } : {}));

  P.blank = function (series) {
    return P.normalise({
      series: series || 'xylophone-basics',
      title: 'Xylophone Basics: ',
      slides: [{ music: '' }],
      order: NEW_ORDER()
    });
  };

  P.normalise = function (raw) {
    const p = JSON.parse(JSON.stringify(raw || {}));
    p.format = P.FORMAT;
    p.series = p.series || 'xylophone-basics';
    p.title = typeof p.title === 'string' ? p.title : 'Untitled';
    p.tempo = Object.assign({ bpm: 53 }, p.tempo);
    p.light = Object.assign({ gap: 0.2 }, p.light);
    p.xylophone = Object.assign({ base: 4, bars: [], gaps: true, nudge: {}, mallet: true }, p.xylophone);
    p.xylophone.mallet = p.xylophone.mallet !== false;
    if (!p.xylophone.nudge || typeof p.xylophone.nudge !== 'object') p.xylophone.nudge = {};
    p.staff = Object.assign({ lines: 'used', colour: 'notes' }, p.staff);
    p.slides = (Array.isArray(p.slides) ? p.slides : []).slice(0, MAX_SLIDES)
      .map(s => typeof s === 'string' ? { music: s } : Object.assign({ music: '' }, s));
    if (!p.slides.length) p.slides.push({ music: '' });
    p.order = Array.isArray(p.order) && p.order.length ? p.order.map(s => section(s, p.tempo.bpm)) : ORDER();
    p.stageLayout = p.stageLayout && typeof p.stageLayout === 'object' ? p.stageLayout : {};
    p.audio = (Array.isArray(p.audio) ? p.audio : []).filter(a => a && a.file).map((a, i) => Object.assign({
      id: 'a' + (i + 1), role: /\.midi?$/i.test(a.file) ? 'midi' : /drum|cue|click/i.test(a.file) ? 'cue' : 'music',
      volume: 1, offset: 0, muted: false }, a));
    p.sync = Object.assign({ source: 'auto', nudge: {} }, p.sync);
    if (!p.sync.nudge || typeof p.sync.nudge !== 'object') p.sync.nudge = {};
    delete p.about;
    return p;
  };

  /* fill a running-order section's defaults by its type. The logo lasts whole bars (the user, 2026-10-16),
     so Ableton's bar 1 is the video's 0:00 and the music after it sits on Ableton's grid; an older file's
     seconds become the nearest whole bars at its tempo (DEGA's 4 s → 1 bar) */
  function section(s, bpm) {
    const d = {
      logo: { bars: 1 },
      title: { beats: 8, line: 'Xylophone Basics:', demo: 0 },
      card: { style: 'full', beats: 4, lines: [''] },
      part: { name: 'Part', slides: 'all', repeats: 4, countdown: 'each', bars: 2, firstBars: 2 },
      end: { seconds: 16, lines: ['Thanks for playing along'] }
    }[s && s.type] || {};
    const out = Object.assign({ type: (s && s.type) || 'card' }, d, s);
    if (out.type === 'logo') {
      if (s && s.bars == null && s.seconds != null) out.bars = +s.seconds > 0 ? Math.max(1, Math.round(+s.seconds / (240 / (bpm || 53)))) : 0;
      out.bars = Math.max(0, Math.round(+out.bars || 0));
      delete out.seconds;
    }
    if (out.type !== 'part') {
      out.transition = Object.assign({ style: out.type === 'title' ? 'outin' : 'cut', beats: out.type === 'title' ? 2 : 0 }, out.transition);
      out.layout = out.layout && typeof out.layout === 'object' ? out.layout : {};
    }
    if (out.type === 'end' && !out.mallet) out.mallet = 'tap';
    // where the block starts on the timeline, if it was put there by hand (seconds); otherwise it follows the one before
    if (out.at != null && !(isFinite(+out.at) && +out.at >= 0)) delete out.at;
    else if (out.at != null) out.at = +out.at;
    if (out.type === 'card' || out.type === 'end') {          // words, icons or both (older files: words)
      out.show = ['words', 'icons', 'both'].includes(out.show) ? out.show : 'words';
      if (Array.isArray(out.icons)) out.icons = out.icons.map(id => typeof id === 'string' ? id : '');
      else delete out.icons;                                     // not set: the series' usual icons for the card
    }
    return out;
  }
  P.section = section;

  /* the slides were moved, copied or deleted: every block (and the title's slide) follows its slide —
     f(old index) → new index, or null when the slide is gone (a block of only that slide goes too) */
  P.remapSlides = function (p, f) {
    p.order = p.order.filter(sec => {
      if (sec.type === 'title' && sec.demo != null && sec.demo >= 0) { const d = f(sec.demo); sec.demo = d == null ? -1 : d; }
      if (sec.type !== 'part' || !Array.isArray(sec.slides)) return true;
      sec.slides = sec.slides.map(f).filter(i => i != null);
      return sec.slides.length > 0;
    });
  };

  /* a part's beats from its start to its first note: its countdown, and any rest its first bar opens with */
  P.leadBeats = function (sec, slides) {
    const list = Studio.Show.partSlides(sec, slides), sl = list.length ? slides[list[0]] : null;
    const count = sec.countdown === 'none' ? 0 : (+sec.firstBars || +sec.bars || 2) * 4;
    const first = sl ? sl.events.find(e => e.pitch) : null;
    return count + (first ? first.start / 4 : 0);
  };

  /* a new tempo (the user, 2026-10-17: "I know the BPM"). Everything not put by hand follows it, on the beat.
     The music doesn't move, so what was put by hand keeps its place against it: a slide block its first note
     (its countdown grows or shrinks before it), a card its start. → false when the tempo isn't 20–240 */
  P.retempo = function (p, bpm, slides) {
    bpm = +bpm;
    if (!(bpm >= 20 && bpm <= 240)) return false;
    const was = 60 / p.tempo.bpm, now = 60 / bpm;
    p.order.forEach(sec => {
      if (sec.at == null || sec.type !== 'part') return;
      sec.at = Math.round(Math.max(0, +sec.at + P.leadBeats(sec, slides) * (was - now)) * 1000) / 1000;
    });
    p.tempo.bpm = bpm;
    return true;
  };

  P.check = function (p, pack) {
    const range = (pack && pack.range) || ['C4', 'A5'];
    const slides = p.slides.map(s => M.parse(s.music, { range }));
    const used = new Set();
    slides.forEach(sl => sl.events.forEach(e => e.pitch && used.add(e.pitch)));
    const bars = new Set(p.xylophone.bars || []);
    const order = id => M.step(id);
    return {
      slides,
      missing: [...used].filter(id => bars.size && !bars.has(id)).sort((a, b) => order(a) - order(b)),
      unused: [...bars].filter(id => !used.has(id)).sort((a, b) => order(a) - order(b)),
      used: [...used].sort((a, b) => order(a) - order(b))
    };
  };

  /* a file name for the folder / download, from the title */
  /* a new audio entry's role, from its name */
  P.roleOf = name => /\.midi?$/i.test(name) ? 'midi' : /drum|cue|click/i.test(name) ? 'cue' : 'music';

  P.fileName = p => (p.title || 'project').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'project';
})();
