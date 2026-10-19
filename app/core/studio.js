/* ==========================================================================
   VMM Creation Studio — core/studio.js
   --------------------------------------------------------------------------
   The studio core's namespace and the small helpers every part leans on.

   THE RULE: the core never mentions a xylophone. A series pack (series/<id>/)
   draws its own pictures and registers itself with Studio.register(); the
   core only knows about the stage (1920×1080), music (core/music.js), time,
   audio and export.
   ========================================================================== */
(function () {
  'use strict';
  const Studio = window.Studio = window.Studio || {};

  Studio.W = 1920;
  Studio.H = 1080;
  Studio.series = {};
  Studio.register = (id, pack) => { Studio.series[id] = pack; pack.id = id; return pack; };

  Studio.$ = sel => document.querySelector(sel);
  Studio.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /* short numbers for SVG text */
  Studio.n = v => Math.round(v * 100) / 100;

  Studio.fetchText = async url => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ': ' + r.status);
    return r.text();
  };
  Studio.fetchJSON = async url => JSON.parse(await Studio.fetchText(url));

  /* An SVG file → { box: [x, y, w, h], inner } so it can be drawn inline
     (inline, CSS variables such as a plank's --bar reach it) */
  Studio.svgParts = text => {
    const vb = /viewBox="([^"]+)"/.exec(text);
    const start = text.indexOf('>', text.indexOf('<svg')) + 1;
    return { box: vb ? vb[1].trim().split(/[\s,]+/).map(Number) : [0, 0, 0, 0], inner: text.slice(start, text.lastIndexOf('</svg>')) };
  };

  /* Draw an SVG part into a box (x, y, w, h); stretch = ignore its shape */
  Studio.place = (part, x, y, w, h, opt) => {
    const o = opt || {};
    const b = part.box, n = Studio.n;
    return '<svg x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" viewBox="' + b.join(' ') +
      '"' + (o.stretch ? ' preserveAspectRatio="none"' : '') + ' overflow="visible"' + (o.style ? ' style="' + o.style + '"' : '') +
      (o.cls ? ' class="' + o.cls + '"' : '') + (o.attrs ? ' ' + o.attrs : '') + '>' + part.inner + '</svg>';
  };

  /* An SVG string with its ids renamed "<prefix>-<id>" (and every url(#…) / href="#…" pointing at them), for a
     second copy of a drawing on the page — a slide's thumbnail, an icon on a chip. With two elements of one id the
     browser uses the FIRST; if that copy is hidden (a closed tab), what points at it isn't painted. (2026-10-17: the
     stage's two-colour beams flashed off whenever no note was lit — their gradients were also in the Slides tab's
     thumbnails, hidden on the Running order tab.) */
  Studio.scopeIds = (svg, prefix) => {
    const ids = new Set();
    svg.replace(/\sid="([^"]+)"/g, (m, id) => ids.add(id));
    return ids.size ? svg.replace(/(\sid="|url\(#|href="#)([^")]+)/g, (m, a, id) => ids.has(id) ? a + prefix + '-' + id : m) : svg;
  };

  /* wait for web fonts ("600 10px 'Baloo Thambi 2'") so SVG text measures right */
  Studio.fontsReady = list => Promise.all(list.map(f => document.fonts.load(f))).then(() => document.fonts.ready);

  /* Fit the 1920×1080 stage element inside its frame (keeps 16:9) */
  Studio.fitStage = (stage, frame) => {
    const k = Math.min(frame.clientWidth / Studio.W, frame.clientHeight / Studio.H);
    stage.style.transform = 'scale(' + k + ')';
    stage.style.width = Studio.W + 'px';
    stage.style.height = Studio.H + 'px';
    return k;
  };
})();
