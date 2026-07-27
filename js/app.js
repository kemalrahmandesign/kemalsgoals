/* ==========================================================================
   26-week accountability dashboard — rendering and interaction.
   ========================================================================== */

(function () {
  'use strict';

  var WEEKS = Store.WEEKS;
  var MONTH_CUM = Store.MONTH_CUM;
  var LINK = Store.LINK;
  var money = Charts.money;
  var reduced = Charts.reduced;
  var S;

  /* Which week the page is showing. Defaults to the live one; the rail can
     put it anywhere from week 1 to now. */
  var view = 0;

  function el(id) { return document.getElementById(id); }

  /* ---------------- dates ---------------- */

  function iso(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function parseISO(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function lastSunday(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - x.getDay());
    return x;
  }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  function currentWeek() {
    return Math.max(0, Math.floor(daysBetween(parseISO(S.start), lastSunday(new Date())) / 7));
  }
  function weekKey(i) { return 'w' + i; }

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function pretty(d) { return MON[d.getMonth()] + ' ' + d.getDate(); }

  /* ---------------- records ---------------- */

  function dayRec(k) {
    var d = S.days[k] || (S.days[k] = { done: {}, t: {} });
    if (!d.done) d.done = {};
    if (!d.t) d.t = {};
    return d;
  }
  function weekRec(i) {
    var k = weekKey(i);
    var w = S.weeks[k] || (S.weeks[k] = { counts: {}, t: {}, review: {}, rt: {} });
    if (!w.counts) w.counts = {};
    if (!w.t) w.t = {};
    if (!w.review) w.review = {};
    if (!w.rt) w.rt = {};
    return w;
  }
  function liveRevenue() { return S.revenue.filter(function (r) { return !r.del; }); }

  /* ---------------- pace math ---------------- */

  function targetAtWeek(w) {
    var pos = w / (WEEKS / 6);
    if (pos <= 0) return 0;
    if (pos >= 6) return S.target;
    var lo = Math.floor(pos), frac = pos - lo;
    var a = lo === 0 ? 0 : MONTH_CUM[lo - 1];
    var b = MONTH_CUM[lo];
    return (a + (b - a) * frac) * (S.target / 100000);
  }
  function revenueTotal() {
    return liveRevenue().reduce(function (t, r) { return t + r.amount; }, 0);
  }
  function revenueByWeek() {
    var arr = new Array(WEEKS).fill(0);
    liveRevenue().forEach(function (r) {
      var wi = Math.floor(daysBetween(parseISO(S.start), lastSunday(parseISO(r.date))) / 7);
      if (wi >= 0 && wi < WEEKS) arr[wi] += r.amount;
    });
    return arr;
  }

  function save() { Store.save(); }

  /* ---------------- reveals ---------------- */

  /* Split into per-word containers holding per-character spans, so words never
     break across lines and the stagger still runs character by character. */
  function splitText(node) {
    if (node.dataset.split) return;
    node.dataset.split = '1';
    var text = node.textContent;
    node.textContent = '';
    var i = 0;
    text.split(/(\s+)/).forEach(function (token) {
      if (!token) return;
      if (/^\s+$/.test(token)) { node.appendChild(document.createTextNode(' ')); return; }
      var word = document.createElement('span');
      word.className = 'rt';
      token.split('').forEach(function (ch) {
        var c = document.createElement('i');
        c.textContent = ch;
        c.style.transitionDelay = (i * 26) + 'ms';
        i++;
        word.appendChild(c);
      });
      node.appendChild(word);
    });
  }

  function revealText(node) {
    if (!node) return;
    splitText(node);
    requestAnimationFrame(function () { node.classList.add('rt-in'); });
  }

  function initReveals() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

    if (reduced || !('IntersectionObserver' in window)) {
      cards.forEach(function (c) { c.classList.add('in'); });
      document.querySelectorAll('[data-reveal-text]').forEach(revealText);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        var h = e.target.querySelector('[data-reveal-text]');
        if (h) setTimeout(function () { revealText(h); }, 140);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    cards.forEach(function (c, i) {
      /* above-the-fold cards come in on a stagger rather than on scroll */
      if (i < 2) {
        setTimeout(function () {
          c.classList.add('in');
          var h = c.querySelector('[data-reveal-text]');
          if (h) setTimeout(function () { revealText(h); }, 140);
        }, 220 + i * 130);
      } else {
        io.observe(c);
      }
    });

    /* the hero line runs first, before anything else moves */
    revealText(el('wk-title'));
  }

  /* ---------------- number count-up ---------------- */

  function countUp(node, to, fmt) {
    var from = parseFloat(String(node.dataset.v || 0)) || 0;
    node.dataset.v = to;
    if (reduced || from === to) { node.textContent = (fmt || String)(to); return; }
    var start = null, dur = 700;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      node.textContent = (fmt || String)(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ==================================================================
     Top nav
     ================================================================== */

  function renderTop() {
    var now = new Date(), cur = currentWeek();
    var end = addDays(parseISO(S.start), WEEKS * 7 - 1);

    var title = el('wk-title');
    var want = 'Week ' + (view + 1);
    /* only re-split when the text actually changes, or the reveal restarts */
    if (title.dataset.text !== want) {
      title.dataset.text = want;
      if (title.dataset.split) {
        title.textContent = want;
        title.dataset.split = '';
        splitText(title);
        title.classList.add('rt-in');
      } else {
        title.textContent = want;
      }
    }
    el('wk-of').textContent = 'of ' + WEEKS;

    el('datum').textContent = DAY[now.getDay()] + ' · ' + pretty(now);
    el('remaining').textContent = Math.max(0, daysBetween(now, end)) + ' days left';
    el('deadline').textContent = 'ends ' + pretty(end);
    el('week-window').textContent =
      pretty(addDays(parseISO(S.start), view * 7)) + '–' + pretty(addDays(parseISO(S.start), view * 7 + 6));
    el('review-when').textContent = 'week ' + (view + 1);
    el('inputs-eyebrow').textContent = view === cur ? 'This week' : 'Week ' + (view + 1);

    var diff = revenueTotal() - targetAtWeek(cur + 1);
    var chip = el('mast-pace');
    chip.dataset.s = diff >= 0 ? 'ahead' : 'behind';
    chip.textContent = diff >= 0 ? money(diff) + ' ahead' : money(-diff) + ' behind';

    /* rail: gradient fill to the live week, one clickable notch per week */
    el('rail-fill').style.width = ((cur + 1) / WEEKS * 100) + '%';

    var hits = el('rail-hits');
    if (hits.childElementCount !== WEEKS) {
      hits.innerHTML = '';
      for (var i = 0; i < WEEKS; i++) {
        (function (n) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('role', 'tab');
          b.title = 'Week ' + (n + 1);
          b.setAttribute('aria-label', 'Week ' + (n + 1));
          b.addEventListener('click', function () { go(n); });
          hits.appendChild(b);
        })(i);
      }
    }
    Array.prototype.forEach.call(hits.children, function (b, i) {
      b.disabled = i > cur;
      b.setAttribute('aria-selected', i === view ? 'true' : 'false');
    });

    el('wk-prev').disabled = view <= 0;
    el('wk-next').disabled = view >= cur;
    el('back-now').hidden = view === cur;

    /* the daily list only makes sense for today */
    el('today-card').style.display = view === cur ? '' : 'none';
  }

  function go(n) {
    var cur = currentWeek();
    view = Math.max(0, Math.min(cur, n));
    renderTop();
    renderMetrics();
    renderMinis();
    renderReview();
    el('agenda').hidden = true;
  }

  /* ==================================================================
     Today
     ================================================================== */

  var CHECK = 'M2.5 8.5l3.5 3.5L13.5 4';

  function renderToday() {
    var k = iso(new Date()), day = dayRec(k);
    var host = el('today');
    host.innerHTML = '';
    var done = 0;

    S.daily.forEach(function (item) {
      var on = !!day.done[item.id];
      if (on) done++;

      var b = document.createElement('button');
      b.className = 'task';
      b.type = 'button';
      b.dataset.done = on ? '1' : '0';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.innerHTML =
        '<span class="box"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + CHECK + '"/></svg></span>' +
        '<span class="task-label"></span>' +
        (item.key ? '<span class="keystone">KEYSTONE</span>' : '');
      b.querySelector('.task-label').textContent = item.label;

      b.addEventListener('click', function () {
        var next = !day.done[item.id];
        day.done[item.id] = next;
        day.t[item.id] = Store.now();

        /* ticking a daily also nudges its matching weekly counter */
        var link = LINK[item.id];
        if (link) bump(link[0], next ? 1 : -1, link[1], true);

        save();
        renderToday();
        renderMetrics();
        renderMinis();

        if (next && allDone()) celebrate();
      });
      host.appendChild(b);
    });

    el('today-count').textContent = done + '/' + S.daily.length;

    var C = 2 * Math.PI * 18;
    el('ring').style.strokeDashoffset = C * (1 - (S.daily.length ? done / S.daily.length : 0));
    el('today-card').classList.toggle('all-done', done === S.daily.length && done > 0);
  }

  function allDone() {
    var day = dayRec(iso(new Date()));
    return S.daily.length > 0 && S.daily.every(function (i) { return !!day.done[i.id]; });
  }

  /* Consecutive days the keystone call task was done. Today not being done
     *yet* must not break it — otherwise the page tells you you've failed
     every morning before you've started. Still reported in the agenda even
     though the streak block is gone from the page. */
  function callingStreak() {
    var run = 0, d = parseISO(S.start), today = new Date(), todayKey = iso(today);
    while (d <= today) {
      var key = iso(d), rec = S.days[key];
      if (rec && rec.done && rec.done.fresh) run++;
      else if (key !== todayKey) run = 0;
      d = addDays(d, 1);
    }
    return run;
  }

  /* ==================================================================
     Weekly inputs
     ================================================================== */

  function bump(id, delta, step, silent) {
    var w = weekRec(view);
    w.counts[id] = Math.max(0, (w.counts[id] || 0) + delta * (step || 1));
    w.t[id] = Store.now();
    if (!silent) { save(); renderMetrics(); renderMinis(); }
  }

  function renderMetrics() {
    var wk = weekRec(view);
    var host = el('metrics');
    host.innerHTML = '';

    S.weekly.forEach(function (m) {
      var v = wk.counts[m.id] || 0, hit = v >= m.target;
      var row = document.createElement('div');
      row.className = 'metric';
      row.dataset.hit = hit ? '1' : '0';
      row.innerHTML =
        '<div class="metric-top">' +
          '<span class="metric-name"></span>' +
          '<span class="metric-val">' + v + ' / ' + m.target + '</span>' +
          '<button class="step" type="button" data-d="-1" aria-label="Decrease">–</button>' +
          '<button class="step" type="button" data-d="1" aria-label="Increase">+</button>' +
        '</div>' +
        '<div class="bar"><i></i></div>';
      row.querySelector('.metric-name').textContent = m.label;

      /* start at 0 and let the fill animate to width on the next frame */
      var bar = row.querySelector('.bar i');
      var pct = Math.min(100, (v / m.target) * 100);
      if (reduced) bar.style.width = pct + '%';
      else requestAnimationFrame(function () { bar.style.width = pct + '%'; });

      row.querySelectorAll('.step').forEach(function (btn) {
        btn.addEventListener('click', function () { bump(m.id, +btn.dataset.d); });
      });
      host.appendChild(row);
    });
  }

  /* ==================================================================
     The other four
     ================================================================== */

  var MINIS = [
    { id: 'w-cust', name: 'Customers signed', hex: '#8a1fd0', cumulative: true },
    { id: 'w-show', name: 'Local walk-ins',   hex: '#0283ec' },
    { id: 'w-gym',  name: 'Gym sessions',     hex: '#d61f6d' },
    { id: 'w-str',  name: 'Stranger convos',  hex: '#e07a00' }
  ];

  function renderMinis() {
    var host = el('minis');
    host.innerHTML = '';
    Charts.resetMeters();

    MINIS.forEach(function (m) {
      var def = S.weekly.filter(function (x) { return x.id === m.id; })[0] || { target: 1 };

      var nowVal = 0;
      if (m.cumulative) {
        for (var i = 0; i <= view; i++) {
          nowVal += ((S.weeks[weekKey(i)] || {}).counts || {})[m.id] || 0;
        }
      } else {
        nowVal = (weekRec(view).counts || {})[m.id] || 0;
      }

      /* A cumulative jar fills toward the whole 26 weeks; a weekly one fills
         toward that week's target. "Hit" for the cumulative one means on
         pace, not finished — otherwise it would never light up. */
      var frac, hit, caption;
      if (m.cumulative) {
        var allTime = def.target * WEEKS;
        frac = allTime ? nowVal / allTime : 0;
        hit = nowVal >= def.target * (view + 1);
        caption = 'of ' + allTime + ' by week ' + WEEKS;
      } else {
        frac = def.target ? nowVal / def.target : 0;
        hit = nowVal >= def.target;
        caption = 'of ' + def.target + (view === currentWeek() ? ' this week' : ' that week');
      }

      var card = document.createElement('div');
      card.className = 'mini' + (hit ? ' hit' : '');
      card.style.setProperty('--c', m.hex);
      card.innerHTML =
        '<span class="name"></span>' +
        '<span class="v">' + nowVal + '</span>' +
        '<span class="of"></span>' +
        '<div class="jar"></div>' +
        '<span class="flag"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" ' +
          'stroke-linecap="round" stroke-linejoin="round"><path d="' + CHECK + '"/></svg></span>';
      card.querySelector('.name').textContent = m.name;
      card.querySelector('.of').textContent = caption;

      /* The jar is scaled so that full *is* the target — a stronger signal
         than a hairline near the rim. */
      Charts.meter(card.querySelector('.jar'), { id: m.id, color: m.hex, frac: frac });

      host.appendChild(card);
    });
  }

  /* ==================================================================
     Pace chart
     ================================================================== */

  function renderRamp() {
    Charts.ramp(el('ramp'), {
      weeks: WEEKS,
      target: S.target,
      currentWeek: currentWeek(),
      byWeek: revenueByWeek(),
      targetAt: targetAtWeek,
      tip: el('ramp-tip'),
      wrap: el('ramp-wrap')
    });
    el('ramp-pct').textContent =
      Math.round(revenueTotal() / S.target * 100) + '% of ' + money(S.target).replace(',000', 'k');
    el('rev-target').textContent =
      'week ' + Math.min(currentWeek() + 1, WEEKS) + ' pace: ' + money(targetAtWeek(currentWeek() + 1));
  }

  /* ==================================================================
     Revenue
     ================================================================== */

  function renderRevenue() {
    var total = revenueTotal(), w = currentWeek() + 1;
    var due = targetAtWeek(w), diff = total - due;

    el('rev-total').innerHTML = money(total) + '<small> / ' + money(S.target) + '</small>';

    var p = el('pace');
    p.dataset.s = diff >= 0 ? 'ahead' : 'behind';
    p.textContent = diff >= 0 ? money(diff) + ' ahead of pace' : money(-diff) + ' behind pace';

    var host = el('ledger');
    host.innerHTML = '';
    liveRevenue().slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .forEach(function (r, i) {
        var row = document.createElement('div');
        row.style.animationDelay = (i * 30) + 'ms';
        row.innerHTML = '<span class="who"></span><span><span class="amt"></span> ' +
          '<button class="del" type="button" aria-label="Delete entry">×</button></span>';
        row.querySelector('.who').textContent = (r.note || 'Unlabelled') + ' · ' + r.date.slice(5);
        row.querySelector('.amt').textContent = money(r.amount);
        row.querySelector('.del').addEventListener('click', function () {
          /* tombstone, not splice — a hard delete lets the other device's
             copy resurrect the row on the next merge */
          r.del = 1;
          r.t = Store.now();
          save();
          renderRevenue(); renderRamp(); renderTop();
        });
        host.appendChild(row);
      });
  }

  function logRevenue() {
    var amt = parseFloat(el('amt').value);
    if (!amt || amt <= 0) { el('amt').focus(); return; }
    S.revenue.push({
      id: 'r' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      date: iso(new Date()),
      amount: amt,
      note: el('who').value.trim(),
      t: Store.now()
    });
    el('amt').value = '';
    el('who').value = '';
    save();
    renderRevenue(); renderRamp(); renderTop();
    celebrate(28);
  }

  /* ==================================================================
     Sunday review + agenda
     ================================================================== */

  function renderReview() {
    var wk = weekRec(view);
    ['won', 'missed', 'change'].forEach(function (k) {
      var t = document.querySelector('[data-k="' + k + '"]');
      if (document.activeElement === t) return;   /* don't fight the caret mid-sync */
      t.value = wk.review[k] || '';
      t.oninput = function () {
        var live = weekRec(view);
        live.review[k] = t.value;
        live.rt[k] = Store.now();
        save();
      };
    });
  }

  function buildAgenda() {
    var wk = weekRec(view);
    var total = revenueTotal(), due = targetAtWeek(view + 1), ahead = total >= due;
    var h = '<div class="ag-head">Week ' + (view + 1) + ' of ' + WEEKS + ' &middot; ' + pretty(new Date()) + '</div>';

    function row(label, val, hit) {
      var d = document.createElement('div');
      d.className = 'ag-row';
      if (hit !== undefined) d.dataset.hit = hit ? '1' : '0';
      d.innerHTML = '<span></span><b></b>';
      d.children[0].textContent = label;
      d.children[1].textContent = val;
      return d.outerHTML;
    }

    h += '<div class="ag-sec">Where the money is</div>';
    h += row('Booked', money(total) + ' of ' + money(S.target));
    h += row('Pace', (ahead ? '+' : '−') + money(Math.abs(total - due)) + ' vs ' + money(due), ahead);
    h += row('Calling streak', callingStreak() + ' days');

    h += '<div class="ag-sec">The inputs</div>';
    S.weekly.forEach(function (m) {
      var v = wk.counts[m.id] || 0;
      h += row(m.label, v + ' / ' + m.target, v >= m.target);
    });

    var R = wk.review || {};
    var labels = { won: 'What got done', missed: 'What I dodged', change: 'Changing next week' };
    ['won', 'missed', 'change'].forEach(function (k) {
      if (!R[k]) return;
      var d = document.createElement('div');
      d.className = 'ag-note';
      d.innerHTML = '<div class="ag-sec"></div><p></p>';
      d.children[0].textContent = labels[k];
      d.children[1].textContent = R[k];
      h += d.outerHTML;
    });

    h += '<div class="ag-ask">Ask him: which of these did I fake?</div>';

    var box = el('agenda');
    box.innerHTML = h;
    box.hidden = false;
    box.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }

  /* ==================================================================
     Plan editor
     ================================================================== */

  function touchConfig() { S.cfgT = Store.now(); }

  function renderEditors() {
    var d = el('edit-daily');
    d.innerHTML = '';
    S.daily.forEach(function (item, i) {
      var r = document.createElement('div');
      r.className = 'edit-row';
      r.innerHTML = '<input type="text" aria-label="Daily task"><button class="del" type="button" aria-label="Remove">×</button>';
      var inp = r.querySelector('input');
      inp.value = item.label;
      inp.oninput = function () { item.label = inp.value; touchConfig(); save(); renderToday(); };
      r.querySelector('.del').onclick = function () {
        S.daily.splice(i, 1); touchConfig(); save(); renderToday(); renderEditors();
      };
      d.appendChild(r);
    });

    var wv = el('edit-weekly');
    wv.innerHTML = '';
    S.weekly.forEach(function (m, i) {
      var r = document.createElement('div');
      r.className = 'edit-row';
      r.innerHTML = '<input type="text" aria-label="Counter name">' +
        '<input type="number" min="1" aria-label="Weekly target">' +
        '<button class="del" type="button" aria-label="Remove">×</button>';
      var ins = r.querySelectorAll('input'), name = ins[0], tgt = ins[1];
      name.value = m.label;
      tgt.value = m.target;
      name.oninput = function () { m.label = name.value; touchConfig(); save(); renderMetrics(); renderMinis(); };
      tgt.oninput = function () {
        m.target = Math.max(1, +tgt.value || 1);
        touchConfig(); save(); renderMetrics(); renderMinis();
      };
      r.querySelector('.del').onclick = function () {
        S.weekly.splice(i, 1); touchConfig(); save(); renderMetrics(); renderMinis(); renderEditors();
      };
      wv.appendChild(r);
    });
  }

  /* ==================================================================
     Celebration
     ================================================================== */

  var COLORS = ['#8a1fd0', '#0283ec', '#d61f6d', '#e07a00', '#ab2fed', '#ff60f0'];

  function celebrate(count) {
    if (reduced) return;
    var canvas = document.createElement('canvas');
    canvas.className = 'confetti';
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    document.body.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var n = count || 90, bits = [];
    for (var i = 0; i < n; i++) {
      bits.push({
        x: innerWidth / 2 + (Math.random() - .5) * 120,
        y: innerHeight * 0.42,
        vx: (Math.random() - .5) * 13,
        vy: Math.random() * -13 - 5,
        r: Math.random() * 5 + 3,
        c: COLORS[(Math.random() * COLORS.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - .5) * .3,
        life: 1
      });
    }

    var t0 = null;
    function frame(ts) {
      if (!t0) t0 = ts;
      var elapsed = (ts - t0) / 1000;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      var alive = false;

      bits.forEach(function (b) {
        b.vy += 0.42;
        b.vx *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.vr;
        b.life = Math.max(0, 1 - elapsed / 2.4);
        if (b.life > 0 && b.y < innerHeight + 40) alive = true;

        ctx.save();
        ctx.globalAlpha = b.life;
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.r, -b.r * .6, b.r * 2, b.r * 1.2);
        ctx.restore();
      });

      if (alive) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  /* ==================================================================
     Cursor — one circle. Position and scale both run in the same rAF, so
     nothing is waiting on a CSS transition to catch up.
     ================================================================== */

  function initCursor() {
    if (!window.matchMedia('(pointer: fine)').matches || reduced) return;

    var dot = document.querySelector('.cursor');
    var x = innerWidth / 2, y = innerHeight / 2;
    var tx = x, ty = y, s = 1, ts = 1;
    /* The chart is deliberately not "hot": a swollen cursor sits right on top
       of the readout it is scrubbing. */
    var HOT = 'a, button, input, textarea, summary, .task, .step, .del, .link-btn';

    document.addEventListener('mousemove', function (e) {
      tx = e.clientX; ty = e.clientY;
      document.documentElement.classList.add('has-cursor');
      var hot = !!(e.target.closest && e.target.closest(HOT));
      ts = hot ? 2.5 : 1;
      dot.classList.toggle('hot', hot);
    }, { passive: true });

    document.addEventListener('mousedown', function () { ts *= 0.7; });
    document.addEventListener('mouseup', function () { ts /= 0.7; });
    document.addEventListener('mouseleave', function () {
      document.documentElement.classList.remove('has-cursor');
    });

    (function loop() {
      x += (tx - x) * 0.38;
      y += (ty - y) * 0.38;
      s += (ts - s) * 0.22;
      dot.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + s.toFixed(3) + ')';
      requestAnimationFrame(loop);
    })();
  }

  /* ==================================================================
     Sync panel
     ================================================================== */

  function msg(t) { el('sb-msg').textContent = t || ''; }

  function initSync() {
    var cfg = Store.config.read();
    el('sb-url').value = cfg.url || '';
    el('sb-key').value = cfg.key || '';

    el('sb-save').addEventListener('click', function () {
      var url = el('sb-url').value.trim().replace(/\/+$/, '');
      var key = el('sb-key').value.trim();
      if (!url || !key) { msg('Both the project URL and the anon key are needed.'); return; }
      Store.config.write({ url: url, key: key });
      msg('Saved. Reloading so sync can start…');
      setTimeout(function () { location.reload(); }, 700);
    });

    el('sb-signin').addEventListener('click', function () {
      var email = el('sb-email').value.trim();
      if (!email) { el('sb-email').focus(); return; }
      msg('Sending…');
      Store.auth.signIn(email)
        .then(function () { msg('Check ' + email + ' for the sign-in link. Open it on this device.'); })
        .catch(function (e) { msg('Could not send it: ' + (e.message || e)); });
    });

    el('sb-signout').addEventListener('click', function () {
      Store.auth.signOut().then(function () { location.reload(); });
    });

    Store.onStatus(function (state, text) {
      var chip = el('status');
      chip.dataset.s = state;
      el('status-text').textContent = text;
      var signedIn = !!Store.auth.session();
      el('sb-signout').hidden = !signedIn;
      el('sb-signin').hidden = signedIn;
      if (signedIn) el('sb-email').closest('.field').hidden = true;
    });
  }

  function initBackup() {
    el('export').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kemalsgoals-' + iso(new Date()) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });

    el('import-btn').addEventListener('click', function () { el('import').click(); });

    el('import').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      file.text().then(function (txt) {
        try {
          /* merged, never replaced — an import must not wipe what's here */
          Store.replace(JSON.parse(txt));
          S = Store.state();
          renderAll();
          msg('Imported and merged.');
        } catch (err) {
          msg('That file could not be read as JSON.');
        }
      });
      e.target.value = '';
    });
  }

  /* ==================================================================
     Boot
     ================================================================== */

  function renderAll() {
    S = Store.state();
    if (view > currentWeek()) view = currentWeek();
    renderTop();
    renderToday();
    renderMetrics();
    renderMinis();
    renderRamp();
    renderRevenue();
    renderReview();
    renderEditors();
  }

  function init() {
    S = Store.load();
    view = currentWeek();
    renderAll();
    initReveals();

    el('wk-prev').addEventListener('click', function () { go(view - 1); });
    el('wk-next').addEventListener('click', function () { go(view + 1); });
    el('back-now').addEventListener('click', function () { go(currentWeek()); });

    el('log-rev').addEventListener('click', logRevenue);
    el('who').addEventListener('keydown', function (e) { if (e.key === 'Enter') logRevenue(); });
    el('amt').addEventListener('keydown', function (e) { if (e.key === 'Enter') logRevenue(); });
    el('make-agenda').addEventListener('click', buildAgenda);

    el('add-daily').addEventListener('click', function () {
      S.daily.push({ id: 'd' + Date.now(), label: 'New daily task', key: false });
      touchConfig(); save(); renderToday(); renderEditors();
    });
    el('add-weekly').addEventListener('click', function () {
      S.weekly.push({ id: 'm' + Date.now(), label: 'New weekly counter', target: 1 });
      touchConfig(); save(); renderMetrics(); renderMinis(); renderEditors();
    });

    initCursor();
    initSync();
    initBackup();

    Store.start(function () {
      S = Store.state();
      renderAll();
    });

    /* Crossing midnight while the tab is open must roll the day over. */
    var today = iso(new Date());
    setInterval(function () {
      var d = iso(new Date());
      if (d !== today) { today = d; view = currentWeek(); renderAll(); }
    }, 60000);

    /* the chart's viewBox depends on width, so re-lay it out on resize */
    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(renderRamp, 200);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
