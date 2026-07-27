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
  function weekIndex() {
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
  function liveRevenue() {
    return S.revenue.filter(function (r) { return !r.del; });
  }

  /* ---------------- pace math ---------------- */

  /* Linear-interpolate the monthly cumulative ramp onto weeks 1..26. */
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
     Masthead
     ================================================================== */

  function renderMast() {
    var now = new Date(), w = weekIndex();
    var end = addDays(parseISO(S.start), WEEKS * 7 - 1);

    el('datum').textContent = DAY[now.getDay()] + ' · ' + pretty(now);
    el('mast-title').textContent = 'Week ' + Math.min(w + 1, WEEKS) + ' of ' + WEEKS;
    el('remaining').textContent = Math.max(0, daysBetween(now, end)) + ' days left';
    el('deadline').textContent = 'ends ' + pretty(end);
    el('week-window').textContent =
      pretty(addDays(parseISO(S.start), w * 7)) + '–' + pretty(addDays(parseISO(S.start), w * 7 + 6));
    el('review-when').textContent = 'week ' + (w + 1);

    var diff = revenueTotal() - targetAtWeek(w + 1);
    el('mast-pace').textContent =
      (diff >= 0 ? money(diff) + ' ahead of pace' : money(-diff) + ' behind pace');

    /* one segment per week — the deadline, always in view */
    var rail = el('rail');
    if (rail.childElementCount !== WEEKS) {
      rail.innerHTML = '';
      for (var i = 0; i < WEEKS; i++) {
        var s = document.createElement('i');
        s.style.animationDelay = (i * 18) + 'ms';
        rail.appendChild(s);
      }
    }
    Array.prototype.forEach.call(rail.children, function (node, i) {
      node.className = i < w ? 'done' : (i === w ? 'now' : '');
    });
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
        renderStreaks();
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

  /* ==================================================================
     Streaks
     ================================================================== */

  function renderStreaks() {
    /* consecutive days the keystone call task was done. Today not being
       done *yet* must not break it — otherwise the page tells you you've
       failed every morning before you've started. */
    var run = 0, d = parseISO(S.start), today = new Date(), todayKey = iso(today);
    while (d <= today) {
      var key = iso(d), rec = S.days[key];
      if (rec && rec.done && rec.done.fresh) run++;
      else if (key !== todayKey) run = 0;
      d = addDays(d, 1);
    }

    var total = 0;
    Object.keys(S.weeks).forEach(function (k) {
      total += (S.weeks[k].counts || {})['w-conv'] || 0;
    });

    countUp(el('streak-days'), run);
    countUp(el('streak-touch'), total, function (n) { return n.toLocaleString('en-US'); });
  }

  /* ==================================================================
     Weekly inputs
     ================================================================== */

  function bump(id, delta, step, silent) {
    var w = weekRec(weekIndex());
    w.counts[id] = Math.max(0, (w.counts[id] || 0) + delta * (step || 1));
    w.t[id] = Store.now();
    if (!silent) { save(); renderMetrics(); renderMinis(); renderStreaks(); }
  }

  function renderMetrics() {
    var wk = weekRec(weekIndex());
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
        '<div class="bar"><i style="width:' + Math.min(100, (v / m.target) * 100) + '%"></i></div>';
      row.querySelector('.metric-name').textContent = m.label;
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
    { id: 'w-cust', name: 'Customers signed', color: 'var(--s1)', hex: '#8a1fd0', tint: 'var(--s1-tint)', cumulative: true },
    { id: 'w-show', name: 'Local walk-ins',   color: 'var(--s2)', hex: '#0283ec', tint: 'var(--s2-tint)' },
    { id: 'w-gym',  name: 'Gym sessions',     color: 'var(--s3)', hex: '#0d9268', tint: 'var(--s3-tint)' },
    { id: 'w-str',  name: 'Stranger convos',  color: 'var(--s4)', hex: '#f2661a', tint: 'var(--s4-tint)' }
  ];

  function renderMinis() {
    var cur = weekIndex(), host = el('minis');
    host.innerHTML = '';
    Charts.resetMeters();

    MINIS.forEach(function (m) {
      var def = S.weekly.filter(function (x) { return x.id === m.id; })[0] || { target: 1 };

      /* per-week series, and the running total for the cumulative one */
      var vals = [], run = 0, i;
      for (i = 0; i <= cur; i++) {
        var v = ((S.weeks[weekKey(i)] || {}).counts || {})[m.id] || 0;
        run += v;
        vals.push(m.cumulative ? run : v);
      }
      var nowVal = vals[vals.length - 1] || 0;

      /* A cumulative jar fills toward the whole 26 weeks; a weekly one
         fills toward this week's target. "Hit" for the cumulative one
         means on pace, not finished — otherwise it never lights up. */
      var frac, hit, caption;
      if (m.cumulative) {
        var allTime = def.target * WEEKS;
        frac = allTime ? nowVal / allTime : 0;
        hit = nowVal >= def.target * (cur + 1);
        caption = 'of ' + allTime + ' by week ' + WEEKS;
      } else {
        frac = def.target ? nowVal / def.target : 0;
        hit = nowVal >= def.target;
        caption = 'of ' + def.target + ' this week';
      }

      var card = document.createElement('div');
      card.className = 'mini' + (hit ? ' hit' : '');
      card.style.setProperty('--c', m.color);
      card.style.setProperty('--tint', m.tint);
      card.innerHTML =
        '<span class="name"></span>' +
        '<span class="v num">' + nowVal + '</span>' +
        '<span class="of"></span>' +
        '<div class="jar"></div>' +
        '<div class="spark-row"></div>' +
        '<span class="flag"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="3" ' +
          'stroke-linecap="round" stroke-linejoin="round"><path d="' + CHECK + '"/></svg></span>';
      card.querySelector('.name').textContent = m.name;
      card.querySelector('.of').textContent = caption;

      /* No separate target line: the jar is scaled so that full *is* the
         target, which is a stronger signal than a hairline near the rim. */
      Charts.meter(card.querySelector('.jar'), { id: m.id, color: m.hex, frac: frac });

      /* weekly history under the jar */
      var sparks = card.querySelector('.spark-row');
      var peak = Math.max.apply(null, vals.concat([m.cumulative ? 1 : def.target, 1]));
      var series = vals.slice(-WEEKS);
      series.forEach(function (v, k) {
        var bar = document.createElement('i');
        bar.style.height = Math.max(2, (v / peak) * 18) + 'px';
        if (k === series.length - 1) bar.className = 'last';
        sparks.appendChild(bar);
      });

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
      currentWeek: weekIndex(),
      byWeek: revenueByWeek(),
      targetAt: targetAtWeek,
      tip: el('ramp-tip'),
      wrap: el('ramp-wrap')
    });
    el('ramp-pct').textContent =
      Math.round(revenueTotal() / S.target * 100) + '% of ' + money(S.target).replace(',000', 'k');
  }

  /* ==================================================================
     Revenue
     ================================================================== */

  function renderRevenue() {
    var total = revenueTotal(), w = weekIndex() + 1;
    var due = targetAtWeek(w), diff = total - due;

    el('rev-total').innerHTML = money(total) + '<small> / ' + money(S.target) + '</small>';
    el('rev-target').textContent = 'week ' + Math.min(w, WEEKS) + ' pace: ' + money(due);

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
          renderRevenue(); renderRamp(); renderMast();
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
    renderRevenue(); renderRamp(); renderMast();
    if (!reduced) celebrate(28);
  }

  /* ==================================================================
     Sunday review + agenda
     ================================================================== */

  function renderReview() {
    var wk = weekRec(weekIndex());
    ['won', 'missed', 'change'].forEach(function (k) {
      var t = document.querySelector('[data-k="' + k + '"]');
      if (document.activeElement === t) return;   /* don't fight the caret mid-sync */
      t.value = wk.review[k] || '';
      t.oninput = function () {
        var live = weekRec(weekIndex());
        live.review[k] = t.value;
        live.rt[k] = Store.now();
        save();
      };
    });
  }

  function buildAgenda() {
    var w = weekIndex(), wk = weekRec(w);
    var total = revenueTotal(), due = targetAtWeek(w + 1), ahead = total >= due;
    var h = '<div class="ag-head">Week ' + (w + 1) + ' of ' + WEEKS + ' &middot; ' + pretty(new Date()) + '</div>';

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
    h += row('Calling streak', el('streak-days').textContent + ' days');

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

  var COLORS = ['#8a1fd0', '#0283ec', '#0d9268', '#f2661a', '#ab2fed', '#ff60f0'];

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
        b.vy += 0.42;          /* gravity */
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
     Custom cursor — fine pointers only
     ================================================================== */

  function initCursor() {
    if (!window.matchMedia('(pointer: fine)').matches || reduced) return;

    var ring = document.querySelector('.cursor');
    var dot = document.querySelector('.cursor-dot');
    var rx = innerWidth / 2, ry = innerHeight / 2, mx = rx, my = ry;
    var HOT = 'a, button, input, textarea, summary, .task, .step, .del, .link-btn';

    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      document.documentElement.classList.add('has-cursor');
      dot.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
      ring.classList.toggle('is-hot', !!(e.target.closest && e.target.closest(HOT)));
    }, { passive: true });

    document.addEventListener('mousedown', function () { ring.classList.add('is-down'); });
    document.addEventListener('mouseup', function () { ring.classList.remove('is-down'); });
    document.addEventListener('mouseleave', function () {
      document.documentElement.classList.remove('has-cursor');
    });

    /* the ring trails the pointer — that lag is the whole effect */
    (function loop() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = 'translate(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px)';
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

  /* ---------------- export / import ---------------- */

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
    renderMast();
    renderToday();
    renderStreaks();
    renderMetrics();
    renderMinis();
    renderRamp();
    renderRevenue();
    renderReview();
    renderEditors();
  }

  function init() {
    S = Store.load();
    renderAll();

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

    /* Sync brings remote state in after first paint; re-render on arrival. */
    Store.start(function () {
      S = Store.state();
      renderAll();
    });

    /* Crossing midnight while the tab is open must roll the day over. */
    var today = iso(new Date());
    setInterval(function () {
      var d = iso(new Date());
      if (d !== today) { today = d; renderAll(); }
    }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
