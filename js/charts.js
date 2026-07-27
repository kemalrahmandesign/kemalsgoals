/* ==========================================================================
   Hand-rolled SVG charts. No chart library.

   Two pieces:
     ramp()   — revenue against the target pace across 26 weeks
     meters() — "the other four", as liquid jars that fill toward the target
   ========================================================================== */

window.Charts = (function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';

  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  /* ------------------------------------------------------------------
     Monotone cubic interpolation.

     A plain Catmull-Rom through cumulative revenue would overshoot: after
     a big week the curve dips below the previous total on its way up,
     drawing money you never un-earned. Monotone tangents can't overshoot,
     so a cumulative series only ever rises.
     ------------------------------------------------------------------ */
  function monotonePath(pts) {
    var n = pts.length;
    if (n === 0) return '';
    if (n === 1) return 'M' + pts[0][0] + ',' + pts[0][1];
    if (n === 2) return 'M' + pts[0][0] + ',' + pts[0][1] + 'L' + pts[1][0] + ',' + pts[1][1];

    var dx = [], dy = [], m = [], i;
    for (i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1][0] - pts[i][0];
      dy[i] = pts[i + 1][1] - pts[i][1];
      m[i] = dy[i] / (dx[i] || 1);
    }

    var tan = [m[0]];
    for (i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) tan[i] = 0;
      else {
        var w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
        tan[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
      }
    }
    tan[n - 1] = m[n - 2];

    var d = 'M' + pts[0][0].toFixed(2) + ',' + pts[0][1].toFixed(2);
    for (i = 0; i < n - 1; i++) {
      var x1 = pts[i][0] + dx[i] / 3,
          y1 = pts[i][1] + tan[i] * dx[i] / 3,
          x2 = pts[i + 1][0] - dx[i] / 3,
          y2 = pts[i + 1][1] - tan[i + 1] * dx[i] / 3;
      d += 'C' + x1.toFixed(2) + ',' + y1.toFixed(2) +
           ' ' + x2.toFixed(2) + ',' + y2.toFixed(2) +
           ' ' + pts[i + 1][0].toFixed(2) + ',' + pts[i + 1][1].toFixed(2);
    }
    return d;
  }

  function tag(name, attrs) {
    var e = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  /* ==================================================================
     Pace chart
     ================================================================== */

  var rampDrawn = false;

  function ramp(svg, opts) {
    /* Axis text is sized in viewBox units, so a 520-wide box squeezed into a
       350px phone renders 9px type at ~6px. Narrow screens get a squarer box
       instead, which scales the same type back up to legible. */
    var narrow = (svg.getBoundingClientRect().width || 520) < 430;
    var W = narrow ? 380 : 520;
    var H = narrow ? 250 : 200;
    var L = narrow ? 42 : 48, R = 10, T = 12, B = 30;
    var WEEKS = opts.weeks, max = opts.target, cur = opts.currentWeek;

    var x = function (w) { return L + (w / WEEKS) * (W - L - R); };
    var y = function (v) { return T + (1 - Math.min(v, max) / max) * (H - T - B); };

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = '';

    var defs = tag('defs');
    defs.innerHTML =
      '<linearGradient id="actualWash" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#8a1fd0" stop-opacity=".30"/>' +
        '<stop offset="100%" stop-color="#8a1fd0" stop-opacity="0"/>' +
      '</linearGradient>' +
      '<linearGradient id="targetWash" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#decaff" stop-opacity=".55"/>' +
        '<stop offset="100%" stop-color="#decaff" stop-opacity="0"/>' +
      '</linearGradient>';
    svg.appendChild(defs);

    /* horizontal guides at 0/25/50/75/100% */
    [0, .25, .5, .75, 1].forEach(function (f) {
      var yy = y(max * f);
      svg.appendChild(tag('line', {
        x1: L, y1: yy.toFixed(1), x2: W - R, y2: yy.toFixed(1), class: 'grid-line'
      }));
      var t = tag('text', { x: L - 9, y: (yy + 3.5).toFixed(1), 'text-anchor': 'end', class: 'axis-text' });
      t.textContent = f === 0 ? '0' : '$' + Math.round(max * f / 1000) + 'k';
      svg.appendChild(t);
    });

    /* month boundaries */
    for (var i = 1; i < 6; i++) {
      var mx = x(i * WEEKS / 6);
      svg.appendChild(tag('line', {
        x1: mx.toFixed(1), y1: T, x2: mx.toFixed(1), y2: H - B, class: 'month-line'
      }));
    }

    /* --- target ramp: dashed, across all 26 weeks --- */
    var tgt = [];
    for (i = 0; i <= WEEKS; i++) tgt.push([x(i), y(opts.targetAt(i))]);
    var tgtD = monotonePath(tgt);

    svg.appendChild(tag('path', {
      d: tgtD + 'L' + x(WEEKS).toFixed(2) + ',' + y(0).toFixed(2) +
         'L' + x(0).toFixed(2) + ',' + y(0).toFixed(2) + 'Z',
      fill: 'url(#targetWash)'
    }));
    svg.appendChild(tag('path', {
      d: tgtD, fill: 'none', stroke: '#b9a3d6', 'stroke-width': 2.5,
      'stroke-dasharray': '7 5', 'stroke-linecap': 'round'
    }));

    /* --- actual: solid, stops at NOW, never extrapolates --- */
    var act = [[x(0), y(0)]], run = 0;
    for (i = 0; i <= cur && i < WEEKS; i++) {
      run += opts.byWeek[i] || 0;
      act.push([x(i + 1), y(run)]);
    }
    var actD = monotonePath(act);
    var last = act[act.length - 1];

    var fill = tag('path', {
      d: actD + 'L' + last[0].toFixed(2) + ',' + y(0).toFixed(2) +
         'L' + x(0).toFixed(2) + ',' + y(0).toFixed(2) + 'Z',
      fill: 'url(#actualWash)'
    });
    svg.appendChild(fill);

    var line = tag('path', {
      d: actD, fill: 'none', stroke: '#8a1fd0', 'stroke-width': 3.5,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    });
    svg.appendChild(line);

    /* NOW marker */
    var nx = x(Math.min(cur + 1, WEEKS));
    svg.appendChild(tag('line', { x1: nx.toFixed(1), y1: T, x2: nx.toFixed(1), y2: H - B, class: 'now-line' }));
    var nowT = tag('text', { x: nx.toFixed(1), y: H - B + 16, 'text-anchor': 'middle', class: 'now-text' });
    nowT.textContent = 'NOW';
    svg.appendChild(nowT);

    /* head of the actual line */
    var head = tag('circle', {
      cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 6,
      fill: '#8a1fd0', stroke: '#ffffff', 'stroke-width': 2.5
    });
    svg.appendChild(head);
    if (!reduced) {
      var halo = tag('circle', { cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 6, fill: '#8a1fd0', opacity: '.35' });
      halo.innerHTML = '<animate attributeName="r" values="6;15;6" dur="2.6s" repeatCount="indefinite"/>' +
                       '<animate attributeName="opacity" values=".35;0;.35" dur="2.6s" repeatCount="indefinite"/>';
      svg.insertBefore(halo, head);
    }

    /* x labels — skipped where NOW would sit on top of them */
    [[0, 'wk 1', 'start'], [WEEKS / 2, 'wk 13', 'middle'], [WEEKS, 'wk 26', 'end']].forEach(function (p) {
      var px = x(p[0]);
      if (Math.abs(px - nx) < 34) return;
      var t = tag('text', { x: px.toFixed(1), y: H - B + 16, 'text-anchor': p[2], class: 'axis-text' });
      t.textContent = p[1];
      svg.appendChild(t);
    });

    /* --- draw-on animation, once per session --- */
    if (!reduced && !rampDrawn) {
      rampDrawn = true;
      var len = line.getTotalLength();
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      fill.style.opacity = 0;
      head.style.opacity = 0;
      requestAnimationFrame(function () {
        line.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(.22,1,.36,1)';
        line.style.strokeDashoffset = 0;
        fill.style.transition = 'opacity .9s ease .45s';
        fill.style.opacity = 1;
        head.style.transition = 'opacity .4s ease 1.25s';
        head.style.opacity = 1;
      });
    }

    /* --- hover scrubber --- */
    var hoverLine = tag('line', { class: 'hover-line', y1: T, y2: H - B, opacity: 0 });
    var hoverDot = tag('circle', { r: 5, fill: '#250835', stroke: '#fff', 'stroke-width': 2, opacity: 0 });
    svg.appendChild(hoverLine);
    svg.appendChild(hoverDot);

    var tip = opts.tip;
    function at(clientX) {
      var box = svg.getBoundingClientRect();
      var vx = ((clientX - box.left) / box.width) * W;
      var w = Math.round(((vx - L) / (W - L - R)) * WEEKS);
      w = Math.max(0, Math.min(WEEKS, w));

      var actual = 0;
      for (var k = 0; k < w && k < WEEKS; k++) actual += opts.byWeek[k] || 0;
      var want = opts.targetAt(w);
      var known = w <= cur + 1;
      var px = x(w), py = y(known ? actual : want);

      hoverLine.setAttribute('x1', px); hoverLine.setAttribute('x2', px);
      hoverLine.setAttribute('opacity', 1);
      hoverDot.setAttribute('cx', px); hoverDot.setAttribute('cy', py);
      hoverDot.setAttribute('opacity', known ? 1 : 0);

      var gap = actual - want;
      tip.innerHTML =
        '<div style="opacity:.7;font-size:10px;letter-spacing:.12em;text-transform:uppercase">Week ' + (w || 1) + '</div>' +
        (known
          ? '<div>Booked <b>' + money(actual) + '</b></div>' +
            '<div style="opacity:.75">Pace <b>' + money(want) + '</b></div>' +
            '<div class="' + (gap >= 0 ? 't-ahead' : 't-behind') + '"><b>' +
              money(Math.abs(gap)) + '</b> ' + (gap >= 0 ? 'ahead' : 'behind') + '</div>'
          : '<div style="opacity:.75">Pace <b>' + money(want) + '</b></div>');

      tip.style.left = (box.left + (px / W) * box.width - opts.wrap.getBoundingClientRect().left) + 'px';
      tip.style.top = ((py / H) * box.height) + 'px';
      tip.classList.add('on');
    }
    function off() {
      hoverLine.setAttribute('opacity', 0);
      hoverDot.setAttribute('opacity', 0);
      tip.classList.remove('on');
    }
    svg.addEventListener('mousemove', function (e) { at(e.clientX); });
    svg.addEventListener('mouseleave', off);
    svg.addEventListener('touchstart', function (e) { at(e.touches[0].clientX); }, { passive: true });
    svg.addEventListener('touchmove', function (e) { at(e.touches[0].clientX); }, { passive: true });
    svg.addEventListener('touchend', off);
  }

  /* ==================================================================
     Liquid meters — "the other four"

     One rAF loop drives every jar. Each jar is two offset sine waves so
     the surface reads as liquid rather than a single rolling curve; the
     amplitude falls away as the jar approaches full, so a finished target
     settles instead of sloshing forever.
     ================================================================== */

  var jars = [];
  var rafId = null;
  /* Levels survive a re-render. renderMinis() rebuilds these cards on every
     tick of a counter; without this the liquid would drop to empty and
     re-pour each time, which reads as a glitch rather than a fill. */
  var levels = {};

  function jarPath(w, h, level, amp, phase, freq) {
    var d = 'M0,' + h.toFixed(1);
    var step = 4;
    for (var px = 0; px <= w; px += step) {
      var yy = level + Math.sin((px / w) * freq * Math.PI * 2 + phase) * amp;
      d += (px === 0 ? 'L0,' + yy.toFixed(2) : 'L' + px + ',' + yy.toFixed(2));
    }
    d += 'L' + w + ',' + h.toFixed(1) + 'Z';
    return d;
  }

  function tick(ts) {
    jars.forEach(function (j) {
      /* ease the level toward its target so a tick visibly pours in */
      j.level += (j.want - j.level) * 0.08;
      var h = j.h, w = j.w;
      var y = h - j.level * h;
      /* calm down near full, and never let the wave clip out of the jar */
      var amp = Math.min(j.amp * (1 - Math.min(j.level, 1) * 0.55), Math.max(0, Math.min(y, h - y)));
      var p = ts / 1000;
      j.back.setAttribute('d', jarPath(w, h, y, amp * 0.7, p * 1.1 + 2.1, 1.6));
      j.front.setAttribute('d', jarPath(w, h, y, amp, p * 1.7, 1.25));
      levels[j.id] = j.level;
    });
    rafId = jars.length ? requestAnimationFrame(tick) : null;
  }

  function meter(host, o) {
    var w = 100, h = 62;
    var svg = tag('svg', { viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none' });

    var trough = tag('rect', { x: 0, y: 0, width: w, height: h, fill: o.color, opacity: '.10', rx: 3 });
    svg.appendChild(trough);

    var clipId = 'jar-' + o.id.replace(/[^a-z0-9]/gi, '');
    var defs = tag('defs');
    defs.innerHTML = '<clipPath id="' + clipId + '"><rect x="0" y="0" width="' + w + '" height="' + h + '" rx="3"/></clipPath>';
    svg.appendChild(defs);

    var g = tag('g', { 'clip-path': 'url(#' + clipId + ')' });
    var back = tag('path', { fill: o.color, opacity: '.34' });
    var front = tag('path', { fill: o.color, opacity: '.85' });
    g.appendChild(back);
    g.appendChild(front);
    svg.appendChild(g);

    host.appendChild(svg);

    var want = Math.max(0, Math.min(1.06, o.frac));
    if (reduced) {
      var yy = h - want * h;
      back.setAttribute('d', jarPath(w, h, yy, 0, 0, 1));
      front.setAttribute('d', jarPath(w, h, yy, 0, 0, 1));
      return;
    }

    var j = {
      id: o.id, w: w, h: h,
      level: levels[o.id] !== undefined ? levels[o.id] : 0,
      want: want, amp: 2.6, back: back, front: front
    };
    jars.push(j);
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  /* Cancel the in-flight frame too — otherwise the old loop and the one
     started by the next meter() both run, doubling the wave speed. */
  function resetMeters() {
    jars.length = 0;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  return { ramp: ramp, meter: meter, resetMeters: resetMeters, money: money, reduced: reduced };
})();
