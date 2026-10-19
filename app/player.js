/* ==========================================================================
   Xylophone Basics Explorer — app/player.js (the play-along app)
   --------------------------------------------------------------------------
   One lesson (lessons/<id>/lesson.json, made by the Studio's "Make an app…")
   as an app: the video's screen, drawn live by the Studio's own code
   (core/ + series/), the music on the audio clock, and a xylophone the
   player can play. MAKE-AN-APP.md (in the Studio) is the design.

   The page says where things are:  <div id="xb" data-root="../../app/" data-lesson="./">
   Links: ?ex=3 opens on exercise 3 (0 = the start), ?mallet=off starts with the mallet off.

     ▶ / ■         plays from the playhead; ■ puts it back at the start of the exercise it stopped in
     the chips     the video's chapters: the start, each exercise (its number, in the tracker's colour),
                   a named part (★), the end (✓); ⏮ ⏭ the one before / after; the line seeks
     the mallet    the round button beside the bars: bright = the mallet plays with the music (as in
                   the video); dim = no mallet and the bars don't light with the music — the player
                   plays them (and the lesson's own xylophone part goes quiet, if it has one)
     the bars      tap or click them (several fingers at once), or C D E F G A B (Shift = the higher)
     keys          Space ▶/■ · ← → exercises · M the mallet

   Drawing: three layers on the 1920×1080 stage — the parts under the mallet (redrawn only when the
   picture changes), the mallet (every frame, it's small), the parts over it (the series' layers, as
   the MP4 makes them: X.scene(…, { layer })).
   ========================================================================== */
(function () {
  'use strict';
  const S = window.Studio, X = S.series['xylophone-basics'], SND = window.XBSound;
  const W = 1920, H = 1080;
  const box = document.getElementById('xb');
  const ROOT = box.dataset.root || '', HERE = box.dataset.lesson || './';
  const q = new URLSearchParams(location.search);
  const still = (k, v) => k === 'live' ? undefined : v;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* none */ } } };

  const P = window.XBPlayer = {
    lesson: null, project: null, L: null, show: null, warp: null, total: 0, chapters: [],
    t: 0, playing: false, poster: true, mallet: q.get('mallet') !== 'off',
    pressed: new Map(),       // a finger, the mouse or a key → { id, down, until }
    buffers: { music: null, solo: null }, ready: null, music: null, hits: [], sched: 0
  };

  /* ---- the page ---- */
  const ICON = {
    play: '<path d="M8 5v14l11-7z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    prev: '<path d="M6 6h2v12H6zM20 6v12l-10-6z"/>', next: '<path d="M16 6h2v12h-2zM4 6v12l10-6z"/>',
    vol: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    out: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    end: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    start: '<rect x="3" y="8" width="4" height="11" rx="1" fill="#CC0000"/><rect x="10" y="6" width="4" height="13" rx="1" fill="#FF6600"/><rect x="17" y="4" width="4" height="15" rx="1" fill="#E5C800"/>'
  };
  const svgIcon = (name, cls) => '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">' + ICON[name] + '</svg>';

  box.innerHTML =
    '<div class="xb-frame" id="xb-frame">' +
      '<div class="xb-stage" id="xb-stage">' +
        '<div class="xb-layer" id="xb-below"></div>' +
        '<svg class="xb-layer" id="xb-mid" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg"></svg>' +
        '<div class="xb-layer" id="xb-above"></div>' +
        '<button class="xb-mallet" id="xb-mallet" type="button" hidden></button>' +
        '<button class="xb-big" id="xb-big" type="button" aria-label="Play" hidden><span>' + svgIcon('play') + '</span></button>' +
      '</div>' +
      '<div class="xb-msg" id="xb-msg" hidden></div>' +
    '</div>' +
    '<div class="xb-bar" id="xb-bar">' +
      '<div class="xb-seek" id="xb-seek" role="slider" aria-label="Where in the lesson" tabindex="0"><div class="xb-track"><div class="xb-fill" id="xb-fill"></div></div><div class="xb-ticks" id="xb-ticks"></div></div>' +
      '<div class="xb-row">' +
      '<button class="xb-btn xb-play" id="xb-play" type="button" aria-label="Play" title="Play (Space)">' + svgIcon('play') + '</button>' +
      '<button class="xb-btn" id="xb-prev" type="button" aria-label="The exercise before" title="The exercise before (←)">' + svgIcon('prev') + '</button>' +
      '<button class="xb-btn" id="xb-next" type="button" aria-label="The next exercise" title="The next exercise (→)">' + svgIcon('next') + '</button>' +
      '<div class="xb-chips" id="xb-chips" role="group" aria-label="Exercises"></div>' +
      '<span class="xb-grow"></span>' +
      '<span class="xb-time" id="xb-time">0:00 / 0:00</span>' +
      '<label class="xb-vol" title="Loudness">' + svgIcon('vol') + '<input type="range" id="xb-vol" min="0" max="1" step="0.05" aria-label="Loudness"></label>' +
      '<button class="xb-btn" id="xb-full" type="button" aria-label="Full screen" title="Full screen" hidden>' + svgIcon('full') + '</button>' +
      '<a class="xb-btn" id="xb-out" target="_blank" rel="noopener" aria-label="Open in its own tab" title="Open in its own tab" hidden>' + svgIcon('out') + '</a>' +
    '</div></div>';
  const $ = id => document.getElementById(id);
  const stage = $('xb-stage'), frameEl = $('xb-frame');

  /* ---- loading ---- */
  async function start() {
    try {
      await X.load(ROOT);
      const lesson = P.lesson = await S.fetchJSON(HERE + 'lesson.json');
      P.project = S.Project.normalise(lesson.project);
      P.project.xylophone.mallet = P.mallet;
      P.L = X.layout(P.project);
      P.show = S.Show.build(P.project, P.L.slides);
      P.warp = lesson.timing && lesson.timing.anchors && lesson.timing.anchors.length ? S.Sync.warp(lesson.timing.anchors) : null;
      P.total = Math.max(+lesson.total || 0, toVideo(P.show.total));
      P.chapters = (lesson.chapters || []).slice().sort((a, b) => a.t - b.t);
      P.hits = P.show.hits.map(h => ({ t: toVideo(h.t), pitch: h.pitch }));
      SND.voice = lesson.sound && lesson.sound.voice;
      document.title = (lesson.title || 'Xylophone Basics') + ' · Xylophone Basics Explorer';
      P.ready = loadMusic(lesson.sound || {});
      P.music = SND.music(P.buffers);
      chips(); wire();
      const ex = q.get('ex');
      if (ex != null) {
        const n = +ex, c = n > 0 ? P.chapters.find(c => c.kind === 'example' && c.n === n) : P.chapters[0];
        if (c) { P.t = c.t; P.poster = false; }
      }
      P.posterState = poster();
      fit(); draw(); ui();
      $('xb-big').hidden = false;
    } catch (e) {
      say('This lesson didn’t load (' + (e && e.message || e) + ').');
      throw e;
    }
  }
  const toVideo = g => P.warp ? P.warp.fwd(g) : g;
  const toGrid = t => P.warp ? P.warp.inv(t) : t;

  /* the music: fetched and decoded straight away (an offline context needs no click) */
  async function loadMusic(sound) {
    const get = async name => {
      if (!name) return null;
      const r = await fetch(HERE + name);
      if (!r.ok) throw new Error(name + ': ' + r.status);
      return new OfflineAudioContext(2, 1, 48000).decodeAudioData(await r.arrayBuffer());
    };
    try {
      const [m, s] = await Promise.all([get(sound.music), get(sound.solo)]);
      P.buffers.music = m; P.buffers.solo = s;
      // the encoder's padding at the start: a decoder that keeps it gives a file that much longer than the mix
      // (Chrome, 44 ms); one that drops it (an edit list) doesn't — skip it only then
      const lag = +sound.lag || 0, len = +sound.length || 0, keeps = b => b && len && lag && b.duration - len >= 0.75 * lag;
      P.buffers.lag = { music: keeps(m) ? lag : 0, solo: keeps(s) ? lag : 0 };
    } catch (e) { say('The music didn’t load — the lesson plays without it.', 6000); }
  }

  /* before ▶: the title (or the first exercise), waiting — nothing lit, no countdown */
  function poster() {
    const list = S.Show.stills(P.show, P.L.slides, P.project);
    return list.length ? list[0].state : null;
  }

  function say(text, ms) {
    const m = $('xb-msg');
    m.textContent = text; m.hidden = false;
    clearTimeout(say.timer);
    if (ms) say.timer = setTimeout(() => { m.hidden = true; }, ms);
  }

  /* ---- what's on the stage ---- */
  const chapterAt = t => { let c = null; P.chapters.forEach(x => { if (x.t <= t + 0.02) c = x; }); return c || P.chapters[0] || null; };
  /* the bar the music has lit (a lit note's) */
  function musicBar(st) {
    const card = st.card;
    if (card && card.type === 'title') {
      const sl = card.demo != null ? P.L.slides[card.demo] : null, e = sl && card.lit >= 0 ? sl.events[card.lit] : null;
      return e && e.pitch || null;
    }
    const sl = st.slide != null ? P.L.slides[st.slide] : null, e = sl && st.lit >= 0 ? sl.events[st.lit] : null;
    return e && e.pitch || null;
  }
  /* the bars lit: the mallet's (when it plays) and the player's */
  function decorate(st, now) {
    const lit = new Set();
    if (P.mallet) { const id = musicBar(st); if (id) lit.add(id); }
    P.pressed.forEach(p => { if (p.down || p.until > now) lit.add(p.id); });
    st.bar = [...lit];
    if (st.trans && st.trans.to) decorate(st.trans.to, now);
    return st;
  }
  function stateNow() {
    let st;
    if (P.poster && P.posterState) st = JSON.parse(JSON.stringify(P.posterState, still)), st.live = P.posterState.live;
    else {
      st = S.Show.at(P.show, toGrid(P.t), P.L.slides, P.project);
      // stopped at an exercise's start: its countdown waits, all four circles empty (as the video's waits do)
      const c = chapterAt(P.t);
      if (!P.playing && c && Math.abs(c.t - P.t) < 0.002 && st.countdown != null) st.countdown = 0;
    }
    return decorate(st, performance.now());
  }

  let lastKey = null, spriteSvg = new Map();
  function draw() {
    if (!P.L) return;
    const st = P.state = stateNow();
    const key = (P.mallet ? 'm' : '-') + JSON.stringify(st, still);
    if (key !== lastKey) {
      lastKey = key;
      $('xb-below').innerHTML = X.scene(P.project, P.L, st, { layer: 'below' });
      $('xb-above').innerHTML = X.scene(P.project, P.L, st, { layer: 'above' }) || '';
      placeMallet(st);
    }
    // the mallet, as the MP4 draws it: each sprite's own drawing, put where it goes
    $('xb-mid').innerHTML = P.mallet ? X.sprites(P.project, P.L, st).map(sp => {
      if (!spriteSvg.has(sp.key)) spriteSvg.set(sp.key, S.svgParts(sp.svg).inner);
      return '<g transform="matrix(' + sp.m.map(v => Math.round(v * 10000) / 10000).join(' ') + ')"' +
        (sp.alpha < 1 ? ' opacity="' + Math.max(0, sp.alpha).toFixed(3) + '"' : '') + '>' + spriteSvg.get(sp.key) + '</g>';
    }).join('') : '';
  }

  /* the mallet button: just right of the xylophone's last bar (left of the first if there's no room), the
     middle of the bars; hidden while a screen has no xylophone, or moves to the next */
  const MB = { size: 118, gap: 28 };
  function placeMallet(st) {
    const b = $('xb-mallet'), w = st.trans && st.trans.u > 0 ? null : X.where(P.project, P.L, st, 'xylophone');
    if (!w) { b.hidden = true; return; }
    const s = Math.max(0.6, Math.min(1, w.l.s)), size = MB.size * s, gap = MB.gap * s;
    let x = w.x1 + gap;
    if (x + size > W - 10) x = w.x0 - gap - size;
    const y = (w.y0 + w.y1) / 2 - size / 2;
    b.style.cssText = 'left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;width:' + size.toFixed(1) + 'px;height:' + size.toFixed(1) + 'px';
    b.hidden = false;
  }
  function malletButton() {
    const b = $('xb-mallet');
    const m = X.malletRest, w = 100 * m.box[2] / m.box[3];
    b.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true">' + S.place(m, 60 - w / 2 + 6, 10, w, 100) + '</svg>';
    b.classList.toggle('off', !P.mallet);
    b.setAttribute('aria-pressed', String(P.mallet));
    b.setAttribute('aria-label', P.mallet ? 'The mallet plays along — press to play the xylophone yourself' : 'You play the xylophone — press to let the mallet play');
    b.title = P.mallet ? 'The mallet plays along (M) — press to play it yourself' : 'You play the bars (M) — press to let the mallet play';
  }
  P.setMallet = function (on) {
    P.mallet = !!on;
    P.project.xylophone.mallet = P.mallet;
    P.music.solo(P.mallet);
    if (!P.mallet) SND.stopPlayed();
    P.sched = P.t;
    malletButton();
    lastKey = null; draw();
  };

  function fit() {
    const fw = frameEl.clientWidth, fh = frameEl.clientHeight;
    const k = Math.min(fw / W, fh / H) || 0.1;
    P.k = k;
    stage.style.transform = 'translate(' + ((fw - W * k) / 2).toFixed(1) + 'px,' + ((fh - H * k) / 2).toFixed(1) + 'px) scale(' + k.toFixed(5) + ')';
  }
  const stagePoint = e => { const r = stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / P.k, y: (e.clientY - r.top) / P.k }; };

  /* ---- playing ---- */
  P.play = async function () {
    if (!SND.init()) { say('This browser can’t play sound.', 6000); }
    if (P.poster) { P.poster = false; P.t = 0; }
    if (P.t >= P.total - 0.05) P.t = 0;
    P.playing = true; ui();
    const waited = await Promise.race([P.ready, new Promise(r => setTimeout(() => r('slow'), 150))]);
    if (waited === 'slow') { say('Getting the music…'); await P.ready; $('xb-msg').hidden = true; }
    if (!P.playing) return;                                   // stopped while it loaded
    P.music.solo(P.mallet);
    P.music.play(P.t);
    P.sched = P.t;
    $('xb-big').hidden = true;
    kick();
  };
  P.stop = function (keep) {
    P.music && P.music.stop();
    SND.stopPlayed();
    P.playing = false;
    if (!keep) { const c = chapterAt(P.t); if (c) P.t = c.t; }
    ui(); draw();
  };
  P.toggle = () => P.playing ? P.stop() : P.play();
  /* go to a moment (a chapter, the seek line); playing carries on from there */
  P.go = function (t) {
    P.poster = false;
    P.t = Math.max(0, Math.min(t, P.total));
    if (P.playing) { SND.stopPlayed(); P.music.play(P.t); P.sched = P.t; }
    ui(); draw();
  };
  P.goChapter = function (d) {
    const i = P.chapters.indexOf(chapterAt(P.t));
    const c = P.chapters[Math.max(0, Math.min(P.chapters.length - 1, i + d))];
    if (c) P.go(c.t);
  };

  /* the app's own xylophone plays the mallet's notes when the recording has none (sound.mode 'app') */
  function schedule() {
    if (!P.mallet || !P.lesson.sound || P.lesson.sound.mode !== 'app') return;
    const until = P.t + 0.3;
    for (const h of P.hits) {
      if (h.t < P.sched) continue;
      if (h.t >= until) break;
      SND.playAt(h.pitch, P.music.t0 + (h.t - P.music.from));
    }
    P.sched = until;
  }

  /* frames: an animation frame when the page is shown, a timer when it isn't (frames stop in hidden tabs) */
  let raf = 0, tmo = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(frame); if (!tmo) tmo = setTimeout(frame, 50); }
  function frame() {
    cancelAnimationFrame(raf); clearTimeout(tmo); raf = tmo = 0;
    const now = performance.now();
    if (P.playing && P.music.playing) {
      P.t = Math.min(P.total, P.music.now());
      schedule();
      if (P.t >= P.total - 1e-3) { P.t = P.total; P.stop(true); }
    }
    draw(); ui(true);
    let busy = P.playing;
    P.pressed.forEach((p, k) => { if (p.down || p.until > now) busy = true; else P.pressed.delete(k); });
    if (busy) kick();
  }

  /* ---- the bar: chips, seek line, time ---- */
  function chips() {
    const box = $('xb-chips'), ticks = $('xb-ticks'), colours = X.colours.tracker.on;
    box.innerHTML = ''; ticks.innerHTML = '';
    P.chapters.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'xb-chip k-' + c.kind; b.title = c.name; b.setAttribute('aria-label', c.name);
      if (c.kind === 'example') {
        const col = colours[(c.n - 1) % colours.length];
        b.style.setProperty('--c', col);
        if (col === '#FFFF00') b.classList.add('light');
        b.textContent = c.n;
      } else b.innerHTML = svgIcon(c.kind === 'end' ? 'end' : c.kind === 'part' ? 'star' : 'start');
      b.onclick = () => P.go(c.t);
      box.append(b);
      if (i) { const t = document.createElement('i'); t.style.left = (c.t / P.total * 100).toFixed(3) + '%'; ticks.append(t); }
      c.el = b;
    });
  }
  let lastUi = '';
  function ui(fast) {
    const shown = P.poster ? 0 : P.t;
    const sig = P.playing + '|' + Math.floor(shown * 4) + '|' + P.poster;
    if (fast && sig === lastUi) return;
    lastUi = sig;
    const pb = $('xb-play');
    pb.innerHTML = svgIcon(P.playing ? 'stop' : 'play');
    pb.setAttribute('aria-label', P.playing ? 'Stop' : 'Play');
    pb.title = P.playing ? 'Stop (Space) — back to the start of this exercise' : 'Play (Space)';
    $('xb-fill').style.width = (P.total ? shown / P.total * 100 : 0).toFixed(2) + '%';
    $('xb-seek').setAttribute('aria-valuenow', Math.round(shown));
    $('xb-seek').setAttribute('aria-valuemax', Math.round(P.total));
    $('xb-time').textContent = S.Show.clock(shown) + ' / ' + S.Show.clock(P.total);
    const cur = P.poster ? null : chapterAt(P.t);
    P.chapters.forEach(c => c.el && c.el.classList.toggle('on', c === cur));
  }

  /* ---- wiring ---- */
  function wire() {
    $('xb-play').onclick = () => P.toggle();
    $('xb-big').onclick = () => P.play();
    $('xb-prev').onclick = () => P.goChapter(-1);
    $('xb-next').onclick = () => P.goChapter(1);
    $('xb-mallet').onclick = () => P.setMallet(!P.mallet);
    malletButton();

    const vol = $('xb-vol'), saved = parseFloat(store.get('xb_volume'));
    SND.volume = isFinite(saved) ? saved : 0.9;
    vol.value = SND.volume;
    vol.oninput = () => { SND.volume = +vol.value; store.set('xb_volume', String(SND.volume)); };

    // seeking: press and drag on the line
    const seek = $('xb-seek');
    const at = e => { const r = seek.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * P.total; };
    let dragging = false, was = false;
    seek.addEventListener('pointerdown', e => {
      dragging = true; was = P.playing;
      if (was) { P.music.stop(); SND.stopPlayed(); }
      try { seek.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
      P.poster = false; P.t = at(e); ui(); draw();
    });
    seek.addEventListener('pointermove', e => { if (dragging) { P.t = at(e); ui(); draw(); } });
    const up = () => { if (!dragging) return; dragging = false; if (was && P.playing) { P.music.play(P.t); P.sched = P.t; kick(); } };
    seek.addEventListener('pointerup', up); seek.addEventListener('pointercancel', up);
    seek.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); P.go(P.t + (e.key === 'ArrowLeft' ? -5 : 5)); }
    });

    // the bars: fingers, the mouse
    stage.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const p = stagePoint(e), id = P.state && X.barAt(P.project, P.L, P.state, p.x, p.y);
      if (!id) return;
      e.preventDefault();
      SND.strike(id);
      P.pressed.set('p' + e.pointerId, { id, down: true, until: performance.now() + 160 });
      try { stage.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
      draw(); kick();
    });
    // a release anywhere ends the press (and leaving the page ends them all), so a bar never stays lit
    const lift = e => { const p = P.pressed.get('p' + e.pointerId); if (p) { p.down = false; kick(); } };
    window.addEventListener('pointerup', lift, true);
    window.addEventListener('pointercancel', lift, true);
    window.addEventListener('blur', () => { P.pressed.forEach(p => { p.down = false; }); kick(); });

    // the bar's buttons don't keep the focus after a click, so Space stays ▶/■ (a key still reaches them with Tab)
    box.querySelectorAll('.xb-bar button, .xb-mallet, .xb-big').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));

    // keys
    document.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target.tagName;
      if ((e.key === ' ' || e.key === 'Enter') && tag === 'BUTTON') return;      // a button chosen with Tab: its own click
      if (tag === 'INPUT' && e.target.type !== 'range') return;
      const k = e.key.toUpperCase();
      if (e.key === ' ') { e.preventDefault(); if (!e.repeat) P.toggle(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { if (tag === 'INPUT') return; e.preventDefault(); P.goChapter(e.key === 'ArrowLeft' ? -1 : 1); return; }
      if (k === 'M') { if (!e.repeat) P.setMallet(!P.mallet); return; }
      if (/^[A-G]$/.test(k)) {
        const bars = P.L.xylo.bars.filter(b => b.letter === k);
        if (!bars.length || e.repeat) return;
        const id = (e.shiftKey ? bars[bars.length - 1] : bars[0]).id;
        e.preventDefault();
        SND.strike(id);
        P.pressed.set('k' + k, { id, down: true, until: performance.now() + 160 });
        draw(); kick();
      }
    });
    document.addEventListener('keyup', e => { const p = P.pressed.get('k' + e.key.toUpperCase()); if (p) { p.down = false; kick(); } });

    // full screen (only where the page may), and "open in its own tab" when it's inside another page (Google Sites)
    const full = $('xb-full');
    if (document.fullscreenEnabled) {
      full.hidden = false;
      full.onclick = () => document.fullscreenElement ? document.exitFullscreen() : box.requestFullscreen().catch(() => {});
    }
    let framed = true;
    try { framed = window.self !== window.top; } catch (_) { /* a frame of another site */ }
    if (framed) { const o = $('xb-out'); o.href = location.href; o.hidden = false; }

    new ResizeObserver(() => fit()).observe(frameEl);
    window.addEventListener('resize', fit);
  }

  start();
})();
