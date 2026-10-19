/* ==========================================================================
   VMM Creation Studio — series/xylophone-basics/series.js
   --------------------------------------------------------------------------
   The Xylophone Basics series pack: everything that looks like the
   *Xylophone Basics* videos. The core hands it a project and a moment's
   state; it hands back the 1920×1080 picture as SVG.

     X.load(root)                 fetch the asset kit (assets/, from the .fla)
     X.layout(project)            one layout for the whole video: the notation's
                                  size and lines, the xylophone's bars and rails
     X.scene(project, L, state)   one frame → '<svg …>'
       state: { slide, lit, countdown, tracker: { count, lit }, wordmark, live }
         slide      index into project.slides (null = no notation)
         lit        index of the lit event in that slide (-1 = none); a lit
                    note lights its bar too, a lit rest goes dark red
         countdown  0–8 = the two-bar countdown's beat (null = hidden)
         bar        (optional) the bars lit on the xylophone, an id or a list — in place of the lit
                    note's bar (the play-along app: what the player taps, Make an app)
     X.drawXylophone / drawNotation / drawCountdown / drawTracker / drawWordmark
     X.ICONS, X.iconsOf(section), X.showOf(section)   the language-free icons on the cards
     X.MALLET, X.malletPose(L, live), X.sprites(...)   the mallet that plays the bars (state.live, core/show.js)
     X.where(project, L, state, id), X.barAt(project, L, state, x, y)   where a part is on the stage, and the
                                  bar under a point (the play-along app's taps)
     X.FILES                      the asset files X.load reads (the play-along app copies them)

   All sizes come from DEGA (assets/kit.json, measured 2026-10-16), so a
   project like DEGA's draws at DEGA's size. Units: stage px, and "sp" = one
   staff space (DEGA: 98.7 px).

   Choices made here (flagged to the user, easy to change):
     - Stems: A4 and up point down while only some lines show (DEGA did this,
       so stems stay on screen); with all five lines it is the usual B4.
       A beamed pair goes the way of its note farthest from that line
       (a tie goes up). 'v' / '^' in the text overrides.
     - Lines "used" = every line from the lowest note to the highest, across
       the whole video (DEGA's D–A: E and G; an A needs the G line, a high C
       the G and B lines — the user, 2026-10-17). Notes all in one space get
       the line under them; no notes → all five.
     - The xylophone always sits on DEGA's centre (x 1010), however wide; the
       countdown circles go over its end bars (the user, 2026-10-17).
     - One notation size for the whole video, fitted to its highest and
       lowest notes, never bigger than DEGA's.
     - Bar lengths follow a real xylophone (2^(-semitones/24)); the longest
       bar in the video is DEGA's D (565 px).
     - A skipped letter leaves 0.7 of a slot (DEGA's F gap). The base (4/6/8)
       is the rails' smallest size; more bars than that make them longer.
     - Half and whole notes: a white middle in a coloured ring, the letter
       centred inside. A played note grows a little and takes its strong
       colour; a half or whole one stays hollow (X.LIT, 2026-10-17).
   ========================================================================== */
(function () {
  'use strict';
  const S = window.Studio, M = S.Music, n = S.n, esc = S.esc;
  const X = S.register('xylophone-basics', {});
  X.name = 'Xylophone Basics';
  X.range = ['C4', 'A5'];

  /* ---- DEGA's measurements ---- */
  const SP = 98.7;                       // staff space, px (83.25 Notes units × 1.1858)
  const STAFF = { left: 401.3, right: 1538.5, top: 2, bottom: 470 };   // DEGA's ex 7 beam touches the top edge
  const NOTE = {                          // the note symbol, in its own units
    head: { cx: 48.6, cy: 260.47, rx: 42.78, ry: 56.88, angle: 37.39 },
    sx: 0.901 / 83.25, sy: 0.727 / 83.25 // note units → staff spaces
  };
  const STEM_OFF = (97.05 - 48.6) * NOTE.sx;   // head centre → stem's outer edge, sp
  const STEM_W = 15.05 * NOTE.sx;               // sp
  const STEM_LEN = (260.47 + 5.1) * NOTE.sy;    // head centre → stem tip, sp (2.32)
  const HEAD_H = 0.455, HEAD_W = 0.524;         // half height / half width, sp
  const LINE_W = 8 / 83.25;                     // staff line + bar line, sp
  const BEAM = 0.72;                            // beam thickness, sp (measured: 60 Notes units)
  const BEAM_STEM = 2.4, BEAM_SLOPE = 0.78;     // a mixed pair: the nearer note's stem, and how much of
                                                // the notes' slope the beam follows (DEGA's pairs)
  const BEAM_RISE = 1.5;                        // …but a beam never rises more than this (DEGA's steepest, A–D)
  const LETTER = 0.865;                         // note letter size, sp

  /* a played note (the user, 2026-10-17: a lit half note looked like a quarter): it grows a little and
     takes its strong colour. A half or whole note stays hollow so it still reads as long:
       hollow 'ring' = white middle, ring/stem/letter in the strong colour, the ring `ring`× thicker;
       'tint' = the same with the middle tinted (`tint` of the light colour); 'fill' = filled (before)
     `all`: false = only half and whole notes grow */
  X.LIT = { grow: 1.06, all: true, hollow: 'ring', ring: 1.5, tint: 0.3 };
  const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t)
    .toString(16).padStart(2, '0')).join('').toUpperCase();
  const REST = { w: 106.25 * NOTE.sx, h: 303.6 * NOTE.sy };   // the quarter rest, sp
  const LINES = [2, 4, 6, 8, 10];               // E4 G4 B4 D5 F5 as steps from C4
  const LEDGERS = [0, 12];                      // C4, A5

  const XY = {                                  // the xylophone, stage px
    plankW: 106, pitch: 108, gap: 0.7, lMax: 565, centreY: 774, centreX: 1010, margin: 40,
    rail: 45, railIn: 0.23, overhang: 38, letter: 90
  };
  const COUNT = { x: [299.3, 538.1], y: [628.6, 869.9], r: 113.1, stroke: 12.5, digit: 138 };   // digit: its height, px
  const TRACK = { x: 12.3, bottom: 992, pitch: 150.3, r: 70.4, stroke: 11.3 };
  const WORD = { cx: 1615, cy: 1025.6, cap: 57, w: 570 };   // the corner name: where the logo cut-out sat; the .fla's Astounder 85, 573 px wide

  /* ---- loading ---- */
  const SVGS = ['plank-1', 'plank-2', 'plank-3', 'plank-4', 'rail', 'rest-quarter', 'mallet-0', 'mallet-2', 'no-sign',
    'mallet-stick', 'mallet-flash', 'mallet-arcs'];
  /* every file X.load reads, from the studio's folder (and the logo, drawn by its address) */
  X.FILES = ['colours.json', 'kit.json', 'logo.jpg'].concat(SVGS.map(f => f + '.svg')).map(f => 'series/xylophone-basics/assets/' + f);
  X.load = async function (root) {
    const base = (root || '') + 'series/xylophone-basics/assets/';
    X.base = base;
    const [colours, kit, ...parts] = await Promise.all([
      S.fetchJSON(base + 'colours.json'), S.fetchJSON(base + 'kit.json'), ...SVGS.map(f => S.fetchText(base + f + '.svg'))
    ]);
    X.colours = colours;
    X.kit = kit;
    X.planks = parts.slice(0, 4).map(S.svgParts);
    X.rail = S.svgParts(parts[4]);
    X.rest = S.svgParts(parts[5]);
    X.mallet = S.svgParts(parts[6]);          // a strike, with its flash
    X.malletRest = S.svgParts(parts[7]);
    X.noSign = S.svgParts(parts[8]);           // DEGA's "No sign" (tools/no_sign.py)
    // the mallet that plays: three drawings in one frame (tools/mallet_parts.py) — whole files too, for the MP4's sprites
    X.stick = { file: parts[9], ...S.svgParts(parts[9]) };
    X.flash = { file: parts[10], ...S.svgParts(parts[10]) };
    X.arcs = { file: parts[11], ...S.svgParts(parts[11]) };
    X.logoUrl = base + 'logo.jpg';
    await S.fontsReady(X.fonts('').map(f => f.weight + " 40px '" + f.family + "'"));
    return X;
  };

  /* the fonts a frame uses (lib/fonts/), for Studio.Render.prepare — root is the path to the studio's folder */
  X.fonts = root => [
    ['Baloo Thambi 2', 600, 'BalooThambi2-SemiBold'], ['Source Sans 3', 700, 'SourceSans3-Bold'],
    ['Amatic SC', 700, 'AmaticSC-Bold'], ['Boogaloo', 400, 'Boogaloo-Regular'], ['Luckiest Guy', 400, 'LuckiestGuy-Regular']
  ].map(([family, weight, file]) => ({ family, weight, url: (root || '') + 'lib/fonts/' + file + '-latin.woff2' }));

  const C = letter => X.colours.letters[letter];
  const semis = id => { const s = M.step(id); return [0, 2, 4, 5, 7, 9, 11][s % 7] + 12 * Math.floor(s / 7); };

  /* ======================================================================
     Layout — once per video
     ====================================================================== */
  X.layout = function (project) {
    const slides = (project.slides || []).map(s => M.parse(s.music, { range: X.range }));
    const staff = project.staff || {};
    const lines = linesFor(slides, staff.lines || 'used');
    const all = lines.length === 5;
    const downFrom = all ? 6 : 5;               // B4 with five lines, else A4 (DEGA)
    const mid = (lines[0] + lines[lines.length - 1]) / 2;
    const restY = -(mid - 2) / 2 - (all ? 0 : 0.15);    // sp, from the E line (y down)

    // the vertical reach of everything, in sp from the E line (y grows downward)
    let top = Infinity, bot = -Infinity;
    const reach = (a, b) => { top = Math.min(top, a); bot = Math.max(bot, b); };
    const yOf = s => -(s - 2) / 2;
    lines.forEach(s => reach(yOf(s) - LINE_W, yOf(s) + LINE_W));
    if (!all) reach(yOf(lines[lines.length - 1]) - 0.63, yOf(lines[0]) + 0.51);
    slides.forEach(sl => {
      if (!sl.events.length) return;              // a bar still being written counts too
      const tips = tipsOf(sl.events, stems(sl.events, downFrom));
      sl.events.forEach((e, i) => {
        if (!e.pitch) { reach(restY - REST.h / 2, restY + REST.h / 2); return; }
        const y = yOf(e.step);
        reach(y - HEAD_H, y + HEAD_H);
        if (e.ticks < 16) reach(Math.min(y, y + tips[i]), Math.max(y, y + tips[i]));
      });
    });
    const span = bot - top;
    const sp = Math.min(SP, (STAFF.bottom - STAFF.top) / span);
    const yE = STAFF.top + ((STAFF.bottom - STAFF.top) - span * sp) / 2 - top * sp;

    return {
      slides, lines, all, downFrom, sp, yE, restY,
      colourMode: staff.colour || 'notes',
      // where the notation reaches (for moving and resizing it as one part)
      box: { x0: STAFF.left - 0.6 * sp, x1: STAFF.right, y0: yE + top * sp, y1: yE + bot * sp },
      xylo: xyloLayout(project.xylophone || {}, slides)
    };
  };

  /* 'used': every line from the lowest note to the highest, across the whole video (the user, 2026-10-17 —
     an A needs the G line under it, a high C the G and B lines down to the E). DEGA's D–A → E and G.
     Notes that all sit between two lines (or all below or above the staff) get the nearest line under them. */
  function linesFor(slides, mode) {
    if (Array.isArray(mode)) return mode.map(M.step).filter(s => LINES.includes(s)).sort((a, b) => a - b);
    if (mode === 'all') return LINES.slice();
    const steps = [];
    slides.forEach(sl => sl.events.forEach(e => { if (e.pitch) steps.push(e.step); }));
    if (!steps.length) return LINES.slice();
    const lo = Math.min(...steps), hi = Math.max(...steps);
    const inside = LINES.filter(s => s >= lo && s <= hi);
    if (inside.length) return inside;
    const under = LINES.filter(s => s <= hi);
    return [under.length ? under[under.length - 1] : LINES[0]];
  }

  /* each event's stem direction ('up' | 'down'; rests get null) */
  function stems(events, downFrom) {
    const t = downFrom - 0.5;
    const out = events.map(() => null);
    const done = new Set();
    events.forEach((e, i) => {
      if (!e.pitch || done.has(i)) return;
      const group = e.beam == null ? [i] : events.map((f, j) => f.beam === e.beam ? j : -1).filter(j => j >= 0);
      group.forEach(j => done.add(j));
      const forced = group.map(j => events[j].stem).find(Boolean);
      let dir = forced;
      if (!dir) {
        const ds = group.map(j => events[j].step - t);
        const far = Math.max(...ds.map(Math.abs));
        const signs = new Set(ds.filter(d => Math.abs(d) === far).map(Math.sign));
        dir = signs.size === 1 && signs.has(1) ? 'down' : 'up';
      }
      group.forEach(j => { out[j] = dir; });
    });
    return out;
  }
  X.stems = stems;

  /* each note's stem tip, in sp from its head (y grows downward): a single
     note's stem is STEM_LEN; in a beamed pair the note nearer the beam gets
     BEAM_STEM and the beam follows BEAM_SLOPE of the notes' slope */
  function tipsOf(events, dirs) {
    const yOf = s => -(s - 2) / 2;
    const out = events.map((e, i) => !e.pitch ? 0 : (dirs[i] === 'down' ? 1 : -1) * STEM_LEN);
    events.forEach((e, i) => {
      const j = i + 1;
      if (e.beam == null || !events[j] || events[j].beam !== e.beam) return;
      const down = dirs[i] === 'down', yi = yOf(e.step), yj = yOf(events[j].step);
      if (yi === yj) return;                    // a same-note pair keeps the plain length
      const a = down ? (yi > yj ? i : j) : (yi < yj ? i : j), b = a === i ? j : i;
      const ya = a === i ? yi : yj, yb = b === i ? yi : yj;
      const tipA = ya + (down ? 1 : -1) * BEAM_STEM;
      const rise = Math.max(-BEAM_RISE, Math.min(BEAM_RISE, BEAM_SLOPE * (yb - ya)));
      const tipB = tipA + rise;
      out[a] = tipA - ya; out[b] = tipB - yb;
    });
    return out;
  }

  function xyloLayout(xy, slides) {
    let ids = (xy.bars && xy.bars.length ? xy.bars.slice() : []);
    if (!ids.length) {                          // no bars chosen: the notes the slides use
      const set = new Set();
      slides.forEach(sl => sl.events.forEach(e => e.pitch && set.add(e.pitch)));
      ids = [...set];
    }
    ids = ids.filter(id => M.step(id) != null).sort((a, b) => M.step(a) - M.step(b));
    if (!ids.length) return { bars: [], rails: [] };
    const gaps = xy.gaps !== false;
    const base = xy.base || 4;
    // centre-to-centre offsets of each bar, in slots
    let at = 0;
    const slot = ids.map((id, i) => {
      if (i && gaps) at += Math.max(0, M.step(id) - M.step(ids[i - 1]) - 1) * XY.gap;
      const v = at; at += 1; return v;
    });
    const spanSlots = slot[slot.length - 1];                    // first to last bar centre
    const full = Math.max((base - 1) * XY.pitch, spanSlots * XY.pitch) + XY.plankW + 2 * XY.overhang;
    // always on DEGA's centre, however wide (the user, 2026-10-17): the countdown circles go over the end bars.
    // It only shrinks if it wouldn't fit on the stage at all (C4–A5, all 13 bars, still fits)
    const cx = XY.centreX;
    const k = Math.min(1, 2 * Math.min(cx - XY.margin, S.W - XY.margin - cx) / full);
    const pitch = XY.pitch * k;
    const railLen = full * k;
    const lowest = semis(ids[0]);
    const nudge = xy.nudge || {};                 // a bar moved by hand, in slots (D3)
    const bars = ids.map((id, i) => ({
      id, letter: id[0], plank: i % 4,
      x: cx - spanSlots * pitch / 2 + (slot[i] + (+nudge[id] || 0)) * pitch,
      len: XY.lMax * k * Math.pow(2, -(semis(id) - lowest) / 24)
    }));
    // rails: straight, through each end bar 27% in from its ends, carried past the ends
    const a = bars[0], b = bars[bars.length - 1];
    const slope = bars.length > 1 ? (b.len - a.len) / (b.x - a.x) : 0;
    const L = x => a.len + slope * (x - a.x);
    const x0 = Math.min(cx - railLen / 2, a.x - (XY.plankW / 2 + XY.overhang) * k);
    const x1 = Math.max(cx + railLen / 2, b.x + (XY.plankW / 2 + XY.overhang) * k);
    const rails = [-1, 1].map(side => ({
      x0, y0: XY.centreY + side * XY.railIn * L(x0),
      x1, y1: XY.centreY + side * XY.railIn * L(x1)
    }));
    const tall = Math.max(...bars.map(b => b.len));
    return { bars, rails, base, railLen, cx, k, pitch,
      box: { x0: Math.min(x0, a.x - XY.plankW * k / 2), x1: Math.max(x1, b.x + XY.plankW * k / 2), y0: XY.centreY - tall / 2, y1: XY.centreY + tall / 2 } };
  }

  /* ======================================================================
     Drawing
     ====================================================================== */
  /* litId: the bar lit, or a list of them (the play-along app: the mallet's and the player's) */
  X.drawXylophone = function (L, litId) {
    const xy = L.xylo;
    if (!xy.bars.length) return '';
    const isLit = Array.isArray(litId) ? id => litId.includes(id) : id => id === litId;
    let out = '<g class="xylophone">';
    xy.rails.forEach(r => {
      const len = Math.hypot(r.x1 - r.x0, r.y1 - r.y0), ang = Math.atan2(r.y1 - r.y0, r.x1 - r.x0) * 180 / Math.PI;
      out += '<g transform="translate(' + n(r.x0) + ' ' + n(r.y0) + ') rotate(' + n(ang) + ')">' +
        S.place(X.rail, 0, -XY.rail * xy.k / 2, len, XY.rail * xy.k, { stretch: true }) + '</g>';
    });
    xy.bars.forEach(bar => {
      const c = C(bar.letter), lit = isLit(bar.id);
      const alpha = lit ? 1 : (c.barAlpha != null ? c.barAlpha : X.colours.barAlpha);
      const style = '--bar:' + (lit ? c.barLit : c.barUnlit || c.bar) + ';--bar-a:' + alpha;
      out += S.place(X.planks[bar.plank], bar.x - XY.plankW * xy.k / 2, XY.centreY - bar.len / 2, XY.plankW * xy.k, bar.len,
        { stretch: true, style, attrs: 'data-bar="' + bar.id + '"' });
      out += '<text x="' + n(bar.x) + '" y="' + n(XY.centreY) + '" text-anchor="middle" dominant-baseline="central"' +
        ' font-family="\'Source Sans 3\', sans-serif" font-weight="700" font-size="' + n(XY.letter * xy.k) + '" fill="' +
        (lit ? '#FFFFFF' : c.barLetter) + '" pointer-events="none">' + bar.letter + '</text>';
    });
    return out + '</g>';
  };

  /* opt.select = an event to ring (the editor's selection; never in the video) */
  X.drawNotation = function (L, slideIndex, lit, opt) {
    const sl = L.slides[slideIndex];
    if (!sl) return '';
    const o = opt || {};
    const sp = L.sp, ev = sl.events;
    const y = s => L.yE - (s - 2) * sp / 2;
    const W = STAFF.right - STAFF.left;
    const lineCol = s => L.colourMode === 'plain' ? X.colours.ink.plainLine : C(M.id(s)[0]).line;
    let out = '<g class="notation">';

    // the lines and the bar line
    L.lines.forEach(s => {
      out += '<line x1="' + n(STAFF.left) + '" x2="' + n(STAFF.right) + '" y1="' + n(y(s)) + '" y2="' + n(y(s)) +
        '" stroke="' + lineCol(s) + '" stroke-width="' + n(LINE_W * sp) + '" stroke-linecap="round"/>';
    });
    const hi = L.lines[L.lines.length - 1], lo = L.lines[0];
    const bx = STAFF.right - LINE_W * sp / 2;
    out += '<line x1="' + n(bx) + '" x2="' + n(bx) + '" y1="' + n(y(hi) - (L.all ? 0 : 0.63 * sp)) + '" y2="' +
      n(y(lo) + (L.all ? 0 : 0.51 * sp)) + '" stroke="' + X.colours.ink.barline + '" stroke-width="' + n(LINE_W * sp) + '" stroke-linecap="round"/>';

    // where each event sits: by time, a beat at most 22% of the staff
    const xa = STAFF.left + 0.155 * W, xb = STAFF.right - 0.145 * W;
    // a bar still being written is spaced as if its last beat were coming, so notes don't jump
    const last = ev.length ? (sl.error ? Math.max(ev[ev.length - 1].start, 12) : ev[ev.length - 1].start) : 0;
    const u = last ? Math.min((xb - xa) / last, 0.055 * W) : 0;
    const x0 = xa + ((xb - xa) - last * u) / 2;
    const xs = ev.map(e => x0 + e.start * u);
    const dirs = stems(ev, L.downFrom);
    const tips = tipsOf(ev, dirs);
    const col = i => {
      const e = ev[i], c = C(e.pitch[0]);
      return i === lit ? c.noteLit : c.note;
    };

    // ledger lines (middle C, high A)
    ev.forEach((e, i) => {
      if (e.pitch && LEDGERS.includes(e.step)) {
        const w = (e.ticks === 16 ? 1.25 : 1.05) * sp;
        out += '<line x1="' + n(xs[i] - w) + '" x2="' + n(xs[i] + w) + '" y1="' + n(y(e.step)) + '" y2="' + n(y(e.step)) +
          '" stroke="' + lineCol(e.step) + '" stroke-width="' + n(LINE_W * sp) + '" stroke-linecap="round"/>';
      }
    });

    // stems
    const tip = i => y(ev[i].step) + tips[i] * sp;
    const stemX = i => dirs[i] === 'down' ? xs[i] - STEM_OFF * sp : xs[i] + STEM_OFF * sp - STEM_W * sp;
    ev.forEach((e, i) => {
      if (!e.pitch || e.ticks === 16) return;
      const y0 = y(e.step), y1 = tip(i);
      out += '<rect x="' + n(stemX(i)) + '" y="' + n(Math.min(y0, y1)) + '" width="' + n(STEM_W * sp) + '" height="' +
        n(Math.abs(y1 - y0)) + '" fill="' + col(i) + '"/>';
    });

    // beams: from the first stem's outer edge to the second's, following the notes
    ev.forEach((e, i) => {
      const j = i + 1;
      if (e.beam == null || !ev[j] || ev[j].beam !== e.beam) return;
      const down = dirs[i] === 'down';
      const xl = stemX(i), xr = stemX(j) + STEM_W * sp;
      const yl = tip(i), yr = tip(j), t = (down ? -1 : 1) * BEAM * sp;
      const same = ev[i].pitch[0] === ev[j].pitch[0];
      let fill = col(i);
      if (!same || col(i) !== col(j)) {
        const id = 'beam' + slideIndex + '_' + i + '_' + (lit == null ? 'x' : lit);
        out += '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + n(xl) + '" y1="0" x2="' + n(xr) +
          '" y2="0"><stop offset="0" stop-color="' + col(i) + '"/><stop offset="1" stop-color="' + col(j) + '"/></linearGradient></defs>';
        fill = 'url(#' + id + ')';
      }
      out += '<path d="M' + n(xl) + ' ' + n(yl) + 'L' + n(xr) + ' ' + n(yr) + 'L' + n(xr) + ' ' + n(yr + t) + 'L' + n(xl) + ' ' +
        n(yl + t) + 'Z" fill="' + fill + '"/>';
    });

    // the editor's selection: a soft ring behind the note or rest
    if (o.select != null && ev[o.select]) {
      const e = ev[o.select];
      const yy = e.pitch ? y(e.step) : L.yE + L.restY * sp;
      out += '<ellipse cx="' + n(xs[o.select]) + '" cy="' + n(yy) + '" rx="' + n(0.95 * sp) + '" ry="' + n((e.pitch ? 0.85 : 1.6) * sp) +
        '" fill="#2b6cb0" fill-opacity="0.16" stroke="#2b6cb0" stroke-width="' + n(0.07 * sp) + '" stroke-dasharray="' + n(0.25 * sp) + ' ' + n(0.15 * sp) + '"/>';
    }

    // heads, letters, rests (each in a group the editor can click)
    const h = NOTE.head;
    ev.forEach((e, i) => {
      out += '<g data-ev="' + i + '">';
      if (!e.pitch) {
        out += rest(e, xs[i], L, i === lit) + '<rect x="' + n(xs[i] - 0.7 * sp) + '" y="' + n(L.yE + (L.restY - 1.4) * sp) +
          '" width="' + n(1.4 * sp) + '" height="' + n(2.8 * sp) + '" fill="transparent"/></g>';
        return;
      }
      const c = C(e.pitch[0]), on = i === lit, yy = y(e.step);
      const hollow = e.ticks >= 8, filled = !hollow || (on && X.LIT.hollow === 'fill');
      const wide = e.ticks === 16 ? 1.15 : 1;
      const g = on && (hollow || X.LIT.all) ? X.LIT.grow : 1;             // a played note grows a little
      const tf = 'translate(' + n(xs[i]) + ' ' + n(yy) + ') scale(' + n(sp * NOTE.sx * wide * g * 1000) / 1000 + ' ' +
        n(sp * NOTE.sy * g * 1000) / 1000 + ') rotate(' + h.angle + ')';
      if (filled) {
        out += '<ellipse rx="' + h.rx + '" ry="' + h.ry + '" transform="' + tf + '" fill="' + col(i) + '"/>';
      } else {
        const mid = on && X.LIT.hollow === 'tint' ? mix('#FFFFFF', c.note, X.LIT.tint) : '#FFFFFF';
        out += '<ellipse rx="' + h.rx + '" ry="' + h.ry + '" transform="' + tf + '" fill="' + mid +
          '" stroke="' + col(i) + '" stroke-width="' + n(13 * (on ? X.LIT.ring : 1)) + '"/>';
      }
      if (e.ticks === 12) {                       // the dot of a dotted half, in a space
        const dy = (e.step % 2 === 0) ? -sp / 2 : 0;
        out += '<circle cx="' + n(xs[i] + 0.95 * sp) + '" cy="' + n(yy + dy) + '" r="' + n(0.17 * sp) + '" fill="' + col(i) + '"/>';
      }
      // the letter: DEGA's filled heads have it a touch right and low; in a ring it is centred (measured on the ink)
      out += '<text x="' + n(xs[i] + (hollow ? 0 : 0.03) * sp) + '" y="' + n(yy + (hollow ? 0 : 0.05) * sp) + '" text-anchor="middle" dominant-baseline="central"' +
        ' font-family="\'Baloo Thambi 2\', sans-serif" font-weight="600" font-size="' + n(LETTER * sp * (hollow ? 0.8 : 1) * g) + '" fill="' +
        (filled ? (on ? '#FFFFFF' : c.noteLetter) : c.noteLit) + '">' + e.pitch[0] + '</text></g>';
    });
    return out + '</g>';
  };

  function rest(e, x, L, on) {
    const sp = L.sp, ink = on ? X.colours.ink.restLit : X.colours.ink.rest;
    const ry = L.yE + L.restY * sp;
    if (e.ticks === 4) {
      return S.place(X.rest, x - REST.w * sp / 2, ry - REST.h * sp / 2, REST.w * sp, REST.h * sp, { stretch: true, style: '--ink:' + ink });
    }
    // a half rest sits on the line nearest the middle, a whole rest hangs from the line above it;
    // where that line isn't shown, the rest brings a short one of its own
    const w = 1.1 * sp, hgt = 0.5 * sp, lw = LINE_W * sp;
    const half = e.ticks === 8;
    const ys = L.lines.map(s => -(s - 2) / 2);
    const near = ys.reduce((a, b) => Math.abs(b - L.restY) < Math.abs(a - L.restY) - 1e-6 ? b : a);
    const at = half ? near : near - 1;                       // sp from the E line
    const ly = L.yE + at * sp;
    const top = half ? ly - hgt : ly;
    const own = ys.some(v => Math.abs(v - at) < 1e-6) ? '' :
      '<line x1="' + n(x - 0.85 * sp) + '" x2="' + n(x + 0.85 * sp) + '" y1="' + n(ly) + '" y2="' + n(ly) + '" stroke="' + ink +
      '" stroke-width="' + n(lw) + '" stroke-linecap="round"/>';
    return own + '<rect x="' + n(x - w / 2) + '" y="' + n(top) + '" width="' + n(w) + '" height="' + n(hgt) + '" fill="' + ink + '"/>';
  }

  /* the two-bar countdown: 1–4 fill yellow, 5–8 go green with 1 2 3 4; gone when the first note plays
     (DEGA hid it on 8; the user, 2026-10-17: the last circle goes green with a 4) */
  X.drawCountdown = function (beat) {
    if (beat == null || beat > 8 || beat < 0) return '';
    const k = X.colours.countdown;
    let out = '<g class="countdown">';
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([cx, cy], i) => {
      const green = beat >= 5 && i < beat - 4;
      const fill = green ? k.count : (i < Math.min(beat, 4) || beat >= 5 ? k.ready : k.off);
      out += '<circle cx="' + COUNT.x[cx] + '" cy="' + COUNT.y[cy] + '" r="' + COUNT.r + '" fill="' + fill + '" stroke="' + k.stroke +
        '" stroke-width="' + COUNT.stroke + '"/>';
      if (green) out += X.text(String(i + 1), COUNT.x[cx], COUNT.y[cy], COUNT.digit, { type: 'comic', fill: k.number }).svg;
    });
    return out + '</g>';
  };

  /* the side tracker: `count` circles from the bottom, the first `lit` in rainbow order */
  X.drawTracker = function (count, lit) {
    if (!count) return '';
    const t = X.colours.tracker;
    let out = '<g class="tracker">';
    for (let i = 0; i < Math.min(count, 7); i++) {
      out += '<circle cx="' + TRACK.x + '" cy="' + n(TRACK.bottom - i * TRACK.pitch) + '" r="' + TRACK.r + '" fill="' +
        (i < lit ? t.on[i] : t.off) + '" stroke="' + t.stroke + '" stroke-width="' + TRACK.stroke + '"/>';
    }
    return out + '</g>';
  };

  /* "Visual Musical Minds" written out, as DEGA's .fla does (Astounder → Luckiest Guy, a colour a word,
     colours.json wordmark): nothing of the logo picture comes with it, so the background stays clean */
  X.nameText = (x, y, cap, maxW) => X.text('Visual Musical Minds', x, y, cap,
    { type: 'comic', words: ['Visual', 'Musical', 'Minds'].map(w => X.colours.wordmark[w]), maxW });

  /* the corner "Visual Musical Minds", written out (2026-10-16; it was cut from the logo, D9, which carried faint bits of the logo) */
  X.drawWordmark = () => X.nameText(WORD.cx, WORD.cy, WORD.cap, WORD.w).svg;

  /* ======================================================================
     The mallet that plays (2026-10-17, the user, after their "Notes E & G"
     video) — it strikes each note as it lights up. The user's rules:
       - the strike starts a 16th before the note and it's back up within
         the 16th after; then it goes to the next note's bar and waits there
       - a strike nudges UP first, then comes down, as a hand would
       - a move between bars is an arch, as an arm makes, not a straight line
       - the star and "((" (the .fla's strike look, in the struck bar's
         colour: teal G, yellow E, blue A) show only in that instant
       - on or off: project.xylophone.mallet (the Xylophone tab)
     The picture is a 3/4 view: lifting shows as the head going UP the
     screen and growing a little (nearer you), drawn back a touch toward the
     hand (the .fla showed lifting that way). The hand stays put while the
     head lifts, so the handle stands a little straighter when it's up.
     It is worked out from state.live (core/show.js: the moment, and the
     notes either side of it), in the xylophone's own px, and placed with the
     xylophone, so moving it (✥ Arrange) or a transition carries it along.
     Every number below is a knob; px are at DEGA's size and shrink with a
     wide xylophone.
     ====================================================================== */
  X.MALLET = {
    strike: 150,        // px below the bars' middle it hits, on every bar (the .fla: DEGA's lower rail) — low enough that
    endGap: 30,         // the waiting head clears the letter; but on a short bar no nearer its end than this
    hover: 44,          // px the head waits above the bar it will hit next
    windup: 26,         // …and rises this much more just before it strikes ("nudge up, then down")
    downstroke: 0.45,   // of the last 16th: the fall onto the bar (getting faster); the rest is the nudge up
    pull: 0.3,          // a lift also draws the head this much of it toward the hand
    grow: 0.0012,       // it grows this much per px of lift — nearer you (44 px → 5%)
    hold: 0.05,         // s it rests on the bar after the hit, so the hit is seen (then it's back up within the 16th)
    flash: 0.075,       // s the star and "((" show after the hit: about two frames
    travel: 0.55,       // s a move to another bar takes at most (or two 16ths, if that's longer); then it waits there
    arc: 0.16, arcMax: 70,   // a move rises in an arch: this much of the distance across, at most this
    shoulder: [380, 800],    // the arm comes from this far right of the xylophone's middle, and below the bars → the handle's lean
    lean: 45,           // …softly kept within this many degrees of straight down
    idle: 3, breath: 1.8,    // waiting a while, it breathes: px, seconds a breath
    reach: 246.5        // px from the head's middle to the handle's end (mallet-stick.svg)
  };
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const inOut = u => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(u));
  const outCubic = u => 1 - Math.pow(1 - clamp01(u), 3);

  /* where the mallet is at live.t: { x, y (the head's middle, in the xylophone's px), rot (deg), s, lift, flash: { colour, u } | null }
     — null if there's nothing to play (no bars, or the notes either side aren't on the xylophone) */
  X.malletPose = function (L, live) {
    const xy = L.xylo, M = X.MALLET;
    if (!live || !xy.bars.length) return null;
    const k = xy.k, q = live.beat / 4, t = live.t;
    const bar = h => h && xy.bars.find(b => b.id === h.pitch);
    const spot = h => { const b = bar(h); return b ? { x: b.x, y: XY.centreY + Math.min(M.strike * k, b.len / 2 - M.endGap * k) } : null; };
    const near = live.near ? live.near(bar) : live;          // a note that isn't on the xylophone is passed over
    const a = spot(near.prev), b = spot(near.next);
    const from = a || b, to = b || a;
    if (!from) return null;
    const tp = a ? near.prev.t : -Infinity, tn = b ? near.next.t : Infinity;
    const r = Math.min(q, (tn - tp) / 2), p = r;            // back up within a 16th; the strike starts a 16th before
    const hold = Math.min(M.hold, r / 3);
    const since = t - tp, until = tn - t;
    const hover = M.hover * k, top = (M.hover + M.windup) * k;

    // up and down: the rebound, the nudge up and the fall
    let lift = hover;
    if (since < r) lift = since < hold ? 0 : hover * outCubic((since - hold) / (r - hold));
    else if (until < p) {
      const u = 1 - until / p, w = 1 - M.downstroke;
      lift = u < w ? hover + (top - hover) * inOut(u / w) : top * (1 - Math.pow((u - w) / M.downstroke, 2));
    }
    // across, in an arch: straight after it's back up — or, when the notes come fast, while it goes up and comes down
    let e = 1, waitFrom = tp + r;
    const dx = to.x - from.x, dy = to.y - from.y;
    if (dx || dy) {
      let s0 = tp + r, s1 = tn - p;
      if (s1 - s0 < 0.6 * q) { s0 = tp + hold; s1 = tn - 0.4 * p; }
      s1 = Math.min(s1, s0 + Math.max(M.travel, 2 * q));
      e = inOut(s1 > s0 ? (t - s0) / (s1 - s0) : t >= s1 ? 1 : 0);
      lift += Math.min(M.arcMax * k, M.arc * Math.abs(dx)) * Math.sin(Math.PI * e);
      waitFrom = Math.max(waitFrom, s1);
    }
    // a long wait breathes, easing in and out of it (never near a hit)
    const ramp = clamp01(Math.min(t - waitFrom, tn - p - t) / 0.4);
    if (ramp > 0) lift += M.idle * k * ramp * Math.sin(2 * Math.PI * (t - (isFinite(waitFrom) ? waitFrom : 0)) / M.breath);

    // the arm: the handle leans toward the shoulder; the hand stays while the head lifts
    const gx = from.x + dx * e, gy = from.y + dy * e;
    const raw = Math.atan2(xy.cx + M.shoulder[0] * k - gx, M.shoulder[1] * k) * 180 / Math.PI;
    const lean = M.lean * Math.tanh(raw / M.lean) * Math.PI / 180;
    const hx = gx + M.reach * k * Math.sin(lean), hy = gy + M.reach * k * Math.cos(lean);
    const x = gx + M.pull * Math.sin(lean) * lift, y = gy - lift;
    const flash = a && since >= 0 && since < M.flash ? { colour: C(near.prev.pitch[0]).barLit, u: since / M.flash } : null;
    return { x, y, rot: -Math.atan2(hx - x, hy - y) * 180 / Math.PI, s: k * (1 + M.grow * lift / k), lift, flash };
  };

  /* the star in the struck bar's colour (the .fla's gradient: full at the middle, gone at the edge) */
  const flashOf = colour => {
    const id = 'mallet-flash-' + colour.replace('#', '');
    const svg = X.flash.file.replace(/id="mallet-flash"/, 'id="' + id + '"').replace(/url\(#mallet-flash\)/g, 'url(#' + id + ')')
      .replace(/stop-color="#[0-9A-Fa-f]{6}"/g, 'stop-color="' + colour + '"');
    return { file: svg, ...S.svgParts(svg) };
  };
  const burst = f => ({ s: 1 + 0.2 * f.u, a: 1 - 0.5 * f.u });   // its second frame: a little bigger, fading

  /* the mallet as SVG, in the xylophone's px (the preview, a still) */
  X.drawMallet = function (pose) {
    const tf = 'translate(' + n(pose.x) + ' ' + n(pose.y) + ') rotate(' + n(pose.rot) + ') scale(' + Math.round(pose.s * 10000) / 10000 + ')';
    let out = '<g class="mallet" pointer-events="none" transform="' + tf + '">';
    if (pose.flash) {
      const f = burst(pose.flash);
      out += '<g opacity="' + n(f.a) + '" transform="scale(' + n(f.s) + ')">' + flashOf(pose.flash.colour).inner + X.arcs.inner + '</g>';
    }
    return out + X.stick.inner + '</g>';
  };

  /* the same as sprites for the MP4 (core/render.js): m = the xylophone's px → stage px, alpha = its part's */
  const mul = (m, o) => [m[0] * o[0] + m[2] * o[1], m[1] * o[0] + m[3] * o[1], m[0] * o[2] + m[2] * o[3], m[1] * o[2] + m[3] * o[3],
    m[0] * o[4] + m[2] * o[5] + m[4], m[1] * o[4] + m[3] * o[5] + m[5]];
  function malletSprites(pose, m, alpha) {
    const r = pose.rot * Math.PI / 180, c = Math.cos(r) * pose.s, s = Math.sin(r) * pose.s;
    const at = mul(m, [c, s, -s, c, pose.x, pose.y]);
    const out = [];
    if (pose.flash) {
      const f = burst(pose.flash), fl = flashOf(pose.flash.colour), sc = mul(at, [f.s, 0, 0, f.s, 0, 0]);
      out.push({ key: 'mallet-flash-' + pose.flash.colour, svg: fl.file, m: sc, alpha: alpha * f.a },
        { key: 'mallet-arcs', svg: X.arcs.file, m: sc, alpha: alpha * f.a });
    }
    out.push({ key: 'mallet-stick', svg: X.stick.file, m: at, alpha });
    return out;
  }

  /* ======================================================================
     Screens as parts (Phase 5)
     --------------------------------------------------------------------
     Every screen is a few named parts, each drawn where it naturally sits
     with a box around it. A layout { x, y, s } puts a part's centre at
     (x, y) at s times its size. The defaults are DEGA's (measured from the
     .fla); what the person arranges on the stage is kept in the project:
       project.stageLayout[part]        the playing screen — every slide,
                                        countdown and play, and under words
       project.order[i].layout[part]    a card: the logo, title, words, end
     A card can end in a transition into whatever comes next (core/show.js
     sets state.trans): 'outin' (DEGA: the parts leave, then the next
     screen's arrive — the xylophone drops away and rises back, the staff
     goes up and comes down), 'glide' (each part glides to its new place),
     or 'cut'.
     ====================================================================== */
  const RAINBOW = ['#CC0000', '#FF6600', '#C9C900', '#339900', '#009999', '#0000CC', '#CC00FF'];
  const textLines = l => (l || []).flatMap(s => String(s).split('\n'));
  const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 });
  const fit = b => Object.assign(box(b.x0, b.y0, b.x1, b.y1));

  /* ---- the card fonts: free look-alikes for the .fla's (lib/fonts/fonts.css) ----
     Sizes are given as the capitals' height in px, matched to the .fla's text; `cap` is
     each font's capital height per em (measured). Text is placed by the middle of its capitals.
       brush  Liebe Doris → Amatic SC Bold, all in capitals as Liebe Doris draws them
       big    Catseye Bold → Boogaloo
       comic  Astounder Squared BB → Luckiest Guy; small letters become smaller capitals, as Astounder's do */
  const TYPE = {
    brush: { family: 'Amatic SC', weight: 700, cap: 0.757, caps: 'all' },
    big: { family: 'Boogaloo', weight: 400, cap: 0.726 },
    comic: { family: 'Luckiest Guy', weight: 400, cap: 0.702, caps: 'small' }
  };
  const SMALL = 0.8;                       // a small capital, of a capital's size
  const widths = new Map();
  let pen = null;
  /* a run of text's width at 100 px (the fonts are loaded by X.load before anything is drawn) */
  function width100(t, s) {
    const key = t.family + '|' + s;
    if (!widths.has(key)) {
      if (!pen && typeof document !== 'undefined') pen = document.createElement('canvas').getContext('2d');
      let w = s.length * 60;
      if (pen) { pen.font = t.weight + " 100px '" + t.family + "'"; w = pen.measureText(s).width; }
      widths.set(key, w);
    }
    return widths.get(key);
  }
  /* split text into runs of one size and colour: [{ s, k, fill }] — words: a colour a word */
  function runs(txt, t, fill, rainbow, words) {
    const out = [];
    let c = 0, w = 0, prev = '';
    for (const ch of String(txt)) {
      const small = t.caps === 'small' && ch !== ch.toUpperCase();
      const s = t.caps ? ch.toUpperCase() : ch;
      if (ch === ' ' && prev && prev !== ' ') w++;
      prev = ch;
      const f = words ? (ch === ' ' ? null : words[w % words.length]) :
        !rainbow ? fill : /[\p{L}\p{N}]/u.test(ch) ? RAINBOW[(c++) % RAINBOW.length] : ch === ' ' ? null : '#333333';
      const last = out[out.length - 1];
      const k = small ? SMALL : 1;
      if (last && last.k === k && (last.fill === f || f == null || (ch === ' ' && last.fill != null))) last.s += s;
      else out.push({ s, k, fill: f });
    }
    return out;
  }
  /* one line of text, its capitals' middle at (x, y), `cap` px tall, shrunk to `maxW` if wider:
     → { svg, box }.  o: { type, fill, rainbow, words: [a colour a word] } */
  X.text = function (txt, x, y, cap, o) {
    const t = TYPE[o.type];
    const rs = runs(txt, t, o.fill || '#000000', o.rainbow, o.words);
    let size = cap / t.cap;
    let w = rs.reduce((a, r) => a + width100(t, r.s) * r.k, 0) * size / 100;
    if (o.maxW && w > o.maxW) { size *= o.maxW / w; w = o.maxW; }
    const h = t.cap * size;
    const body = rs.map(r => {
      const a = (r.k !== 1 ? ' font-size="' + n(size * r.k) + '"' : '') + (r.fill && r.fill !== o.fill ? ' fill="' + r.fill + '"' : '');
      return a ? '<tspan' + a + '>' + esc(r.s) + '</tspan>' : esc(r.s);
    }).join('');
    const svg = '<text x="' + n(x) + '" y="' + n(y + h / 2) + '" text-anchor="middle" font-family="\'' + t.family + '\', sans-serif" font-weight="' + t.weight +
      '" font-size="' + n(size) + '"' + (o.fill ? ' fill="' + o.fill + '"' : '') + ' xml:space="preserve">' + body + '</text>';
    return { svg, box: box(x - w / 2, y - h * 0.62, x + w / 2, y + h * 0.62), size };
  };
  /* a text part: the same, with its id and owner */
  const textPart = (id, txt, x, y, cap, o) => { const r = X.text(txt, x, y, cap, o); return { id, owner: 'section', svg: r.svg, box: r.box }; };

  /* the bars' letters with a space where a letter is skipped: D E G A → "DE GA" */
  X.bigLetters = function (L) {
    let out = '';
    L.xylo.bars.forEach((b, i) => {
      if (i && M.step(b.id) - M.step(L.xylo.bars[i - 1].id) > 1) out += ' ';
      out += b.letter;
    });
    return out;
  };

  /* ======================================================================
     Language-free icons (2026-10-16) — the user's picks from research/icons/icon-options.png
     and finished-options.png, so a video can run without English words.
       section.show   'words' (the default, and every older file) | 'icons' | 'both'
       section.icons  the card's icons in order, e.g. ['repeat', 'play']; '' = none in that place.
                      Not set → the card's usual ones (X.iconsOf).
     Each icon draws into a 400×400 box; box(ctx) = its drawing's bounds there. ctx = { L, count }:
     count = how many times the next part plays each slide (the number on the round arrow).
     ====================================================================== */
  const INK = '#333333';
  const pt = (cx, cy, r, deg) => [cx + r * Math.cos(deg * Math.PI / 180), cy + r * Math.sin(deg * Math.PI / 180)];
  const P = p => n(p[0]) + ' ' + n(p[1]);

  /* a thick round arrow from a0 to a1 degrees (clockwise, 0 = right), w wide, its head past a1 */
  function loopArrow(cx, cy, R, w, a0, a1, fill) {
    const ro = R + w / 2, ri = R - w / 2, big = a1 - a0 > 180 ? 1 : 0, head = 1.05, hl = 30;
    return '<path d="M' + P(pt(cx, cy, ro, a0)) + 'A' + n(ro) + ' ' + n(ro) + ' 0 ' + big + ' 1 ' + P(pt(cx, cy, ro, a1)) +
      'L' + P(pt(cx, cy, R + w * head, a1)) + 'L' + P(pt(cx, cy, R, a1 + hl)) + 'L' + P(pt(cx, cy, R - w * head, a1)) +
      'L' + P(pt(cx, cy, ri, a1)) + 'A' + n(ri) + ' ' + n(ri) + ' 0 ' + big + ' 0 ' + P(pt(cx, cy, ri, a0)) +
      'Z" fill="' + fill + '" stroke="' + INK + '" stroke-width="10" stroke-linejoin="round"/>';
  }
  function star(cx, cy, R) {
    let d = '';
    for (let i = 0; i < 10; i++) d += (i ? 'L' : 'M') + P(pt(cx, cy, i % 2 ? R * 0.47 : R, -90 + i * 36));
    return '<path d="' + d + 'Z" fill="#FFFF00" stroke="' + INK + '" stroke-width="9" stroke-linejoin="round"/>';
  }
  /* the xylophone (all bars unlit) fitted 360 wide around (200, 205) of the box: { svg, box } */
  /* 360 wide — or 350 tall at most: a 1–3-bar xylophone is narrow, and at full width ran off the end card's
     bottom (the user's C D E, 2026-10-17); DEGA's 4 bars come out 349.7 tall, so it and wider ones don't change */
  function smallXylo(L) {
    const b = L.xylo.box, k = Math.min(360 / (b.x1 - b.x0), 350 / (b.y1 - b.y0)), w = (b.x1 - b.x0) * k, h = (b.y1 - b.y0) * k;
    return { box: [200 - w / 2, 205 - h / 2, 200 + w / 2, 205 + h / 2],
      svg: '<g transform="translate(' + n(200 - (b.x0 + b.x1) / 2 * k) + ' ' + n(205 - (b.y0 + b.y1) / 2 * k) + ') scale(' + Math.round(k * 10000) / 10000 + ')">' +
        X.drawXylophone(L, null).replace(/ data-bar="[^"]*"/g, '') + '</g>' };    // not a bar the editor can click
  }
  /* the No sign's bounds in the box: its ring (Ø 354.75 round 177.375) drawn at 0.9, centred */
  const NS_K = 0.9;
  const nsAt = () => { const v = X.noSign.box, cx = v[0] + v[2] / 2, cy = v[1] + v[3] / 2; return { tx: 200 - cx * NS_K, ty: 200 - cy * NS_K, v }; };

  const ICONS = X.ICONS = {
    repeat: { name: 'Round arrow + number', note: 'the number is how many times the next part plays each slide',
      box: () => [34, 46, 366, 366],
      draw: c => loopArrow(200, 200, 138, 46, -62, 232, '#FF6600') + X.text(String(c.count), 200, 204, 150, { type: 'comic', fill: '#1f1f1f', maxW: 210 }).svg },
    play: { name: 'Mallet', note: 'the video’s mallet, mid-strike',
      box: () => { const w = 360 * X.mallet.box[2] / X.mallet.box[3]; return [200 - w / 2, 20, 200 + w / 2, 380]; },
      draw: () => { const w = 360 * X.mallet.box[2] / X.mallet.box[3]; return S.place(X.mallet, 200 - w / 2, 20, w, 360); } },
    advanced: { name: 'Rainbow steps', note: 'the tracker’s seven colours as stairs, a star on top',
      box: () => [30, 17, 392, 374],
      draw: () => {
        let s = '';
        X.colours.tracker.on.forEach((c, i) => { const h = 48 + i * 34; s += '<rect x="' + (34 + i * 47) + '" y="' + (370 - h) + '" width="47" height="' + h + '" fill="' + c + '" stroke="' + INK + '" stroke-width="8" stroke-linejoin="round"/>'; });
        return s + star(339, 72, 50);
      } },
    nobreaks: { name: 'No-sign (DEGA’s)', note: 'DEGA’s red no-sign over the countdown’s four circles',
      box: () => { const a = nsAt(), v = a.v; return [a.tx + v[0] * NS_K, a.ty + v[1] * NS_K, a.tx + (v[0] + v[2]) * NS_K, a.ty + (v[1] + v[3]) * NS_K]; },
      draw: () => {
        const a = nsAt(), v = a.v, k = X.colours.countdown, c = 177.375, sc = 0.5494;     // the .fla: the Count Down symbol at 0.549, under the sign
        let s = '<g transform="translate(' + n(a.tx) + ' ' + n(a.ty) + ') scale(' + NS_K + ')">';
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => {
          s += '<circle cx="' + n(c + i * (COUNT.x[1] - COUNT.x[0]) / 2 * sc) + '" cy="' + n(c + j * (COUNT.y[1] - COUNT.y[0]) / 2 * sc) + '" r="' + n(COUNT.r * sc) +
            '" fill="' + k.ready + '" stroke="' + k.stroke + '" stroke-width="' + n(COUNT.stroke * sc) + '"/>';
        });
        return s + S.place(X.noSign, v[0], v[1], v[2], v[3]) + '</g>';
      } },
    finished: { name: 'Mallet put down', note: 'the mallet lying across this video’s bars; on the end card it takes the place of the xylophone and mallet',
      box: c => smallXylo(c.L).box,
      draw: c => {
        const m = X.malletRest, h = 236, w = h * m.box[2] / m.box[3];
        const g = S.place(m, -w / 2, -h / 2, w, h), t = 'translate(204 300) rotate(-95)';    // the mallet art points 101°: now 6°, nearly level
        return '<defs><filter id="vmm-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter></defs>' + smallXylo(c.L).svg +
          '<g transform="translate(6 9)" opacity="0.22" filter="url(#vmm-soft)"><g transform="' + t + '">' + g.replace(/fill="(?!none)[^"]*"/g, 'fill="#000"') + '</g></g>' +
          '<g transform="' + t + '">' + g + '</g>';
      } }
  };
  /* a card's icons, in order ('' = none there), and what it shows */
  X.iconsOf = sec => !sec ? [] : Array.isArray(sec.icons) ? sec.icons.map(id => ICONS[id] ? id : '') :
    sec.type === 'end' ? ['finished'] : sec.type !== 'card' ? [] : sec.style === 'over' ? ['repeat', 'play'] : ['advanced', 'nobreaks'];
  X.showOf = sec => sec && (sec.type === 'card' || sec.type === 'end') && (sec.show === 'icons' || sec.show === 'both') ? sec.show : 'words';

  /* an icon on its own, fitted to its drawing (the editor's choices) — sec: the card's place in the running order */
  X.iconPicture = (id, project, L, sec) => {
    const ctx = { L, count: countAfter(project, sec) }, b = ICONS[id].box(ctx);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [b[0], b[1], b[2] - b[0], b[3] - b[1]].map(n).join(' ') + '">' + ICONS[id].draw(ctx) + '</svg>';
  };

  /* an icon as a part: drawn `size` px for its 400 box, its drawing's middle at (cx, cy) */
  function iconPart(k, id, cx, cy, size, ctx) {
    const ic = ICONS[id], b = ic.box(ctx), s = Math.round(size / 400 * 10000) / 10000;
    const tx = cx - (b[0] + b[2]) / 2 * s, ty = cy - (b[1] + b[3]) / 2 * s;
    return { id: 'i' + k, owner: 'section', name: 'Icon: ' + ic.name, icon: id,
      svg: '<g transform="translate(' + n(tx) + ' ' + n(ty) + ') scale(' + s + ')">' + ic.draw(ctx) + '</g>',
      box: box(tx + b[0] * s, ty + b[1] * s, tx + b[2] * s, ty + b[3] * s) };
  }
  /* how many times the part after this section plays each slide (the round arrow's number) */
  const countAfter = (project, sec) => {
    const nx = (project.order || []).slice(sec + 1).find(s => s.type === 'part');
    return nx && nx.repeats > 0 ? nx.repeats : 4;
  };
  const NAMES = { xylophone: 'Xylophone', notation: 'Notation', tracker: 'Tracker', countdown: 'Countdown', wordmark: 'Visual Musical Minds',
    title: 'Title', letters: 'Big letters', logo: 'Logo', mallet: 'Mallet' };
  X.partName = id => NAMES[id] || (/^w\d+$/.test(id) ? 'Words, line ' + (+id.slice(1) + 1) : /^i\d+$/.test(id) ? 'Icon ' + (+id.slice(1) + 1) : id);

  /* ---- the parts ---- */
  const xyloPart = (L, litId) => L.xylo.bars.length ? { id: 'xylophone', owner: 'stage', svg: X.drawXylophone(L, litId), box: fit(L.xylo.box) } : null;
  const notePart = (L, slide, lit, opt) => ({ id: 'notation', owner: 'stage', svg: X.drawNotation(L, slide, lit, opt), box: fit(L.box) });
  const markPart = () => { const r = X.nameText(WORD.cx, WORD.cy, WORD.cap, WORD.w); return { id: 'wordmark', owner: 'stage', svg: r.svg, box: r.box }; };
  const trackPart = (count, lit) => count ? { id: 'tracker', owner: 'stage', svg: X.drawTracker(count, lit),
    box: box(TRACK.x - TRACK.r, TRACK.bottom - (Math.min(count, 7) - 1) * TRACK.pitch - TRACK.r, TRACK.x + TRACK.r, TRACK.bottom + TRACK.r) } : null;
  const countPart = beat => beat != null && beat >= 0 && beat <= 8 ? { id: 'countdown', owner: 'stage', svg: X.drawCountdown(beat),
    box: box(COUNT.x[0] - COUNT.r, COUNT.y[0] - COUNT.r, COUNT.x[1] + COUNT.r, COUNT.y[1] + COUNT.r) } : null;
  const own = (p, owner) => p && Object.assign(p, { owner });
  /* the bars lit: the state's own list when it has one (the play-along app), else the lit note's */
  const barOf = (st, id) => st.bar !== undefined ? st.bar : id;
  /* the mallet that plays: straight after its xylophone xp, placed with it — so the countdown, the notation, the name
     and any words go over it (the MP4 lays it between those, core/export.js) */
  X.malletOn = project => !(project && project.xylophone && project.xylophone.mallet === false);
  const playerPart = (project, L, st, xp) => {
    const pose = xp && X.malletOn(project) && st.live ? X.malletPose(L, st.live) : null;
    return pose ? { id: 'player', owner: xp.owner, follows: 'xylophone', pose, svg: X.drawMallet(pose), box: xp.box } : null;
  };

  /* what a screen is made of: { kind, section, parts: [{ id, owner, svg, box }] } */
  X.screen = function (project, L, st) {
    const card = st.card, sec = card && card.section != null ? card.section : null;
    const out = (kind, parts) => ({ kind, section: sec, parts: parts.filter(Boolean) });
    if (card && card.type === 'logo') {
      return out('logo', [{ id: 'logo', owner: 'section', svg: '<image href="' + esc(X.logoUrl) + '" width="1920" height="1080"/>', box: box(0, 0, 1920, 1080) }]);
    }
    if (card && card.type === 'title') {
      const demo = card.demo != null && L.slides[card.demo] ? card.demo : null;
      const ev = demo != null && card.lit >= 0 ? L.slides[demo].events[card.lit] : null;
      const big = X.bigLetters(L);
      // the .fla: Catseye Bold 300, a letter every 190 px, capitals 203 px tall
      const CAP = 203, adv = ch => ch === ' ' ? 95 : 190;
      const chars = [...big], width = chars.reduce((a, ch) => a + adv(ch), 0) - (chars.length ? adv(chars[chars.length - 1]) : 0);
      let x = 1155 - width / 2, letters = '', half = 0;
      chars.forEach(ch => {
        if (ch !== ' ') { const c = C(ch), r = X.text(ch, x, 455, CAP, { type: 'big', fill: ch === 'E' ? c.barLit : c.bar }); letters += r.svg; half = Math.max(half, (r.box.x1 - r.box.x0) / 2); }
        x += adv(ch);
      });
      const xp = own(xyloPart(L, barOf(st, ev && ev.pitch)), 'section');
      return out('title', [
        textPart('title', card.line || '', 1150, 140, 120, { type: 'brush', rainbow: true, maxW: 1490 }),
        big ? { id: 'letters', owner: 'section', svg: letters, box: box(1155 - width / 2 - half, 455 - CAP * 0.62, 1155 + width / 2 + half, 455 + CAP * 0.62) } : null,
        xp, demo != null ? playerPart(project, L, st, xp) : null,     // it plays the demo too
        demo != null ? own(notePart(L, demo, card.lit), 'section') : null, own(markPart(), 'section')
      ]);
    }
    // the card's icons (section.show / section.icons): [[icon id, its place k]…], the empty places left out
    const so = sec != null && project.order ? project.order[sec] : null;
    const mode = X.showOf(so), ctx = { L, count: sec != null ? countAfter(project, sec) : 4 };
    const icons = mode === 'words' ? [] : X.iconsOf(so).map((id, k) => [id, k]).filter(([id]) => id);
    const icon = (id, k, x, y, size) => iconPart(k, id, x, y, size, ctx);
    if (card && card.type === 'card' && card.style !== 'over') {
      const ls = textLines(card.lines);
      // the .fla: "ADVANCED MODE" Liebe Doris 200 at 134% (capitals 160 px), "No breaks" 200 (120 px)
      const look = i => i === 0 ? [160, { type: 'brush', rainbow: true }] : [120, { type: 'brush', fill: '#444444' }];
      const words = (t, i, x, y, maxW) => { const [cap, o] = look(i); return textPart('w' + i, t, x, y, cap, Object.assign({ maxW }, o)); };
      if (mode === 'words') return out('full', ls.map((t, i) => words(t, i, 960, i === 0 ? 400 : 470 + i * 150, 1800)).concat([own(markPart(), 'section')]));
      if (mode === 'icons') {
        // in a row across the middle, filling the screen the words did
        const m = icons.length, size = m === 1 ? 680 : m === 2 ? 600 : Math.min(460, 1640 / m);
        return out('full', icons.map(([id, k], j) => icon(id, k, 960 + (j - (m - 1) / 2) * (m === 2 ? 700 : size * 1.1), 520, size)).concat([own(markPart(), 'section')]));
      }
      // both, DEGA's way ("No breaks" with the no-sign beside it): each line with its icon after it, the pair centred
      const ys = ls.map((t, i) => ls.length === 1 ? 520 : 540 + (i - (ls.length - 1) / 2) * (ls.length === 2 ? 400 : 290));
      const parts = [];
      ls.forEach((t, i) => {
        const hit = icons.find(([id, k]) => k === i);
        if (!hit) { parts.push(words(t, i, 960, ys[i], 1800)); return; }
        const size = i === 0 ? 420 : 440, b = ICONS[hit[0]].box(ctx), iw = (b[2] - b[0]) * size / 400, gap = 60;
        const wb = words(t, i, 0, 0, 1800 - gap - iw).box, tw = wb.x1 - wb.x0, all = tw + gap + iw;   // the line's width, measured
        parts.push(words(t, i, 960 - all / 2 + tw / 2, ys[i], 1800 - gap - iw), icon(hit[0], hit[1], 960 + all / 2 - iw / 2, ys[i], size));
      });
      // icons past the last line: a row along the bottom
      const extra = icons.filter(([id, k]) => k >= ls.length);
      extra.forEach(([id, k], j) => parts.push(icon(id, k, 960 + (j - (extra.length - 1) / 2) * 360, 900, 300)));
      return out('full', parts.concat([own(markPart(), 'section')]));
    }
    if (card && card.type === 'end') {
      const ls = mode === 'icons' ? [] : textLines(card.lines);
      const m = card.mallet === 'still' || card.beat == null || card.beat % 2 === 0 ? X.malletRest : X.mallet;
      const mh = 300, mw = mh * m.box[2] / m.box[3];
      // the icons: "Mallet put down" takes the place of the xylophone and its mallet; any other goes where the words were
      const fin = icons.find(([id]) => id === 'finished'), others = icons.filter(([id]) => id !== 'finished');
      const alone = mode === 'icons' && !others.length;
      const ly = alone ? 330 : fin ? 430 : 450;            // no words above: the name moves up; over the picture, a little up
      const parts = [];
      if (mode === 'icons') others.forEach(([id, k], j) => parts.push(icon(id, k, 960 + (j - (others.length - 1) / 2) * 340, 190, 300)));
      else others.forEach(([id, k], j) => parts.push(icon(id, k, j % 2 ? 1740 : 180, 190 + Math.floor(j / 2) * 300, 260)));
      // the .fla: Astounder 200 (capitals 135 px); Luckiest Guy runs wider, so a long line shrinks to fit
      return out('end', ls.map((t, i) => textPart('w' + i, t, 960, 190 + i * 170, 135, { type: 'comic', fill: '#660099', maxW: 1800 }))
        .concat(parts, [
          // the name written out (the .fla: Astounder 160, capitals 108 px), not cut from the logo: the logo's drips showed above "Musical"
          (r => ({ id: 'logo', owner: 'section', name: 'Visual Musical Minds', svg: r.svg, box: r.box }))(X.nameText(960, ly, 108, 1500)),
          fin ? icon(fin[0], fin[1], 960, alone ? 735 : 805, alone ? 700 : 600) : own(xyloPart(L, barOf(st, null)), 'section'),
          fin || card.mallet === 'none' ? null : { id: 'mallet', owner: 'section', svg: S.place(m, 1110, 660, mw, mh), box: box(1110, 660, 1110 + mw, 660 + mh) }
        ]));
    }
    // the playing screen (and words over it)
    const sl = st.slide != null ? L.slides[st.slide] : null;
    const ev = sl && st.lit != null && st.lit >= 0 ? sl.events[st.lit] : null;
    const xp = xyloPart(L, barOf(st, ev && ev.pitch));
    const parts = [
      st.tracker ? trackPart(st.tracker.count, st.tracker.lit) : null,
      xp, playerPart(project, L, st, xp),
      countPart(st.countdown),                     // over the xylophone: a wide one reaches under the circles
      sl ? notePart(L, st.slide, st.lit, { select: st.select }) : null,
      st.wordmark === false ? null : markPart()
    ];
    if (card && card.type === 'card') {
      // the .fla: "Repeat x4" top left, "Play Along" right, Astounder 180 (capitals 112 px, a line every 217)
      if (mode !== 'icons') textLines(card.lines).forEach((t, i) => parts.push(i === 0
        ? textPart('w0', t, 320, 115, 112, { type: 'comic', fill: '#1f1f1f', maxW: 590 })
        : textPart('w' + i, t, 1650, 446 + i * 210, 112, { type: 'comic', fill: '#1f1f1f', maxW: 490 })));
      // icons: the first in the top left corner (in place of the words, or under them), the rest on the right
      // (in place of the words, or above them, clear of the notation)
      const first = icons.find(([id, k]) => k === 0), rest = icons.filter(([id, k]) => k > 0);
      if (first) parts.push(mode === 'icons' ? icon(first[0], 0, 240, 220, 400) : icon(first[0], 0, 250, 345, 300));
      rest.forEach(([id, k], j) => {
        const m = rest.length;
        if (mode === 'icons') parts.push(icon(id, k, 1690, 700 + (j - (m - 1) / 2) * 470 / m, m === 1 ? 520 : 520 / m * 1.1));
        else parts.push(icon(id, k, 1720, 300 + (j - (m - 1) / 2) * 380 / m, m === 1 ? 400 : 400 / m * 1.1));
      });
      return out('over', parts);
    }
    return out('play', parts);
  };

  /* DEGA's places for the shared parts on its cards (the rest sit where they're drawn) */
  const DEFAULTS = {
    title: {
      xylophone: p => ({ x: 405, y: 575, s: Math.min(1, 720 / (p.box.x1 - p.box.x0), 640 / (p.box.y1 - p.box.y0)) }),
      notation: p => ({ x: 1265, y: 828, s: Math.min(0.95, 470 / (p.box.y1 - p.box.y0)) }),
      wordmark: () => ({ x: 360, y: 1005, s: 1.1 })      // written out it has no margin, so a little in from the edge
    },
    end: {
      xylophone: p => ({ x: 800, y: 810, s: Math.min(0.62, 520 / (p.box.x1 - p.box.x0)) })
    }
  };

  /* where a part goes on this screen: the person's arrangement, else DEGA's, else where it's drawn.
     A part that follows another (the mallet: the xylophone) goes where that one goes — it has the same box */
  X.layoutOf = function (project, scr, part) {
    const lead = part.follows && scr.parts.find(p => p.id === part.follows);
    if (lead) return X.layoutOf(project, scr, lead);
    const book = part.owner === 'stage' ? project.stageLayout : (scr.section != null && project.order && project.order[scr.section] ? project.order[scr.section].layout : null);
    const mine = book && book[part.id];
    if (mine && isFinite(mine.x) && isFinite(mine.y) && mine.s > 0) return mine;
    const d = DEFAULTS[scr.kind] && DEFAULTS[scr.kind][part.id];
    return d ? d(part) : { x: part.box.cx, y: part.box.cy, s: 1 };
  };

  function placed(part, l, opacity) {
    const b = part.box, k = l.s;
    return '<g data-el="' + part.id + '" transform="translate(' + n(l.x - b.cx * k) + ' ' + n(l.y - b.cy * k) + ') scale(' + Math.round(k * 10000) / 10000 + ')"' +
      (opacity != null && opacity < 1 ? ' opacity="' + n(Math.max(0, opacity)) + '"' : '') + '>' + part.svg + '</g>';
  }
  /* the matrix placed() puts a part's px into (stage px) */
  const placeMatrix = (part, l) => { const b = part.box, k = Math.round(l.s * 10000) / 10000; return [k, 0, 0, k, n(l.x - b.cx * l.s), n(l.y - b.cy * l.s)]; };

  /* which way a part leaves (and arrives): DEGA drops the xylophone (and its mallet) and lifts the staff */
  const away = (id, l) => id === 'xylophone' || id === 'player' || id === 'mallet' || id === 'logo' ? [0, 1] : id === 'notation' ? [0, -1] :
    id === 'tracker' || id === 'countdown' ? [-1, 0] : (l.y < 540 ? [0, -1] : [0, 1]);
  const off = (l, dir, k) => ({ x: l.x + dir[0] * 1300 * k, y: l.y + dir[1] * 1200 * k, s: l.s });
  const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, s: a.s + (b.s - a.s) * k });
  const smooth = k => k * k * (3 - 2 * k);

  /* a moment as a plan: each part, where it goes ({ x, y, s }) and how see-through (o) — in drawing order */
  function blend(project, A, B, trans) {
    const u = Math.max(0, Math.min(1, trans.u));
    const la = p => X.layoutOf(project, A, p), lb = p => X.layoutOf(project, B, p);
    const inB = id => B.parts.find(p => p.id === id), inA = id => A.parts.find(p => p.id === id);
    const out = [], put = (p, l, o) => out.push({ p, l, o });
    if (trans.style === 'glide') {
      const e = smooth(u);
      A.parts.forEach(p => { if (!inB(p.id)) put(p, off(la(p), away(p.id, la(p)), e * e), 1 - e); });
      B.parts.forEach(p => { const a = inA(p.id); if (a) put(p, lerp(la(a), lb(p), e)); else put(p, lb(p), e); });
      return out;
    }
    // 'outin' — DEGA: everything leaves (0–45%), then the next screen arrives; the wordmark glides the whole way
    const split = 0.45;
    const wm = inA('wordmark') && inB('wordmark');
    if (wm) put(inB('wordmark'), lerp(la(inA('wordmark')), lb(inB('wordmark')), smooth(u)));
    if (u < split) {
      const k = u / split, e = k * k;
      A.parts.forEach(p => { if (!(wm && p.id === 'wordmark')) put(p, off(la(p), away(p.id, la(p)), e)); });
    } else {
      const k = (u - split) / (1 - split), e = 1 - (1 - k) * (1 - k) * (1 - k);
      B.parts.forEach(p => { if (!(wm && p.id === 'wordmark')) put(p, off(lb(p), away(p.id, lb(p)), 1 - e)); });
    }
    return out;
  }
  function plan(project, L, st) {
    const A = X.screen(project, L, st);
    if (st.trans && st.trans.u > 0 && st.trans.style !== 'cut' && st.trans.to) return blend(project, A, X.screen(project, L, st.trans.to), st.trans);
    return A.parts.map(p => ({ p, l: X.layoutOf(project, A, p) }));
  }

  /* where a part of this moment's screen is on the stage (no transition): { l: { x, y, s }, box (its own px),
     x0, y0, x1, y1 (stage px) } — null when the screen hasn't that part */
  X.where = function (project, L, st, id) {
    const scr = X.screen(project, L, st || {}), part = scr.parts.find(p => p.id === id);
    if (!part) return null;
    const l = X.layoutOf(project, scr, part), b = part.box, at = (v, c, o) => o + (v - c) * l.s;
    return { l, box: b, x0: at(b.x0, b.cx, l.x), x1: at(b.x1, b.cx, l.x), y0: at(b.y0, b.cy, l.y), y1: at(b.y1, b.cy, l.y) };
  };
  /* the bar under a stage point (x, y), or null — a little generous, for fingers: the nearest bar across
     (within half the bars' spacing), and up or down to its ends and a bit past them */
  X.barAt = function (project, L, st, x, y) {
    const w = X.where(project, L, st, 'xylophone'), xy = L.xylo;
    if (!w || !xy.bars.length) return null;
    const px = w.box.cx + (x - w.l.x) / w.l.s, py = w.box.cy + (y - w.l.y) / w.l.s;
    let best = null;
    xy.bars.forEach(b => { if (!best || Math.abs(px - b.x) < Math.abs(px - best.x)) best = b; });
    if (Math.abs(px - best.x) > Math.max(xy.pitch / 2, XY.plankW * xy.k * 0.6)) return null;
    return Math.abs(py - XY.centreY) <= best.len / 2 + 40 * xy.k ? best.id : null;
  };

  /* one frame → SVG. For the MP4, what moves every frame (the mallet) is drawn as sprites (X.sprites) between two
     pictures that can be kept and reused (core/export.js): opt.layer
       'below'  the white page and every part under the mallet (all of them when there's no mallet)
       'above'  the parts over it, on nothing (see-through) — null when there's no mallet */
  X.scene = function (project, L, state, opt) {
    const st = state || {}, layer = opt && opt.layer, list = plan(project, L, st);
    const at = list.findIndex(x => x.p.pose);
    const parts = !layer ? list : layer === 'below' ? (at < 0 ? list : list.slice(0, at)) : at < 0 ? null : list.slice(at + 1).filter(x => !x.p.pose);
    if (!parts || (layer === 'above' && !parts.length)) return null;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">' +
      (layer === 'above' ? '' : '<rect width="1920" height="1080" fill="#FFFFFF"/>') + parts.map(x => placed(x.p, x.l, x.o)).join('') + '</svg>';
  };
  /* …and the mallet, as sprites (Studio.Render.Sprites) */
  X.sprites = function (project, L, state) {
    return plan(project, L, state || {}).filter(x => x.p.pose)
      .flatMap(x => malletSprites(x.p.pose, placeMatrix(x.p, x.l), x.o == null ? 1 : Math.max(0, x.o)));
  };
})();
