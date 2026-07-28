/* ==========================================================================
   State, persistence and cross-device sync.

   Local-first: every change writes to localStorage immediately and renders
   instantly, then pushes to Supabase in the background. The app is fully
   usable with no network and no account.

   Merging is per-leaf, not per-document. A whole-document last-write-wins
   would silently destroy data the moment you tick something on your phone
   and something else on your laptop — the later save would carry a stale
   copy of the other device's field and overwrite it. So every leaf that can
   be edited independently carries its own timestamp, and merge() takes the
   newer side field by field.
   ========================================================================== */

window.Store = (function () {
  'use strict';

  var KEY = 'kemalsgoals-v5';
  var CFG_KEY = 'kemalsgoals-sync-config';
  var WEEKS = 26;

  /* Monthly cumulative revenue ramp -> 100k. Ramps because month 1 is
     pipeline, not cash. Dividing by six would call week 3 a failure for
     doing exactly the right groundwork. */
  var MONTH_CUM = [6000, 16000, 31000, 51000, 75000, 100000];

  /* daily task -> [weekly counter it feeds, what one tick is worth] */
  var LINK = {
    fresh: ['w-new', 15],
    back:  ['w-back', 6],
    show:  ['w-show', 1],
    train: ['w-gym', 1]
  };

  function now() { return Date.now(); }

  function defaults() {
    return {
      v: 5,
      start: null,
      target: 100000,
      cfgT: now(),
      daily: [
        { id: 'fresh', label: 'Call 15 new shops — out of area only',      key: true  },
        { id: 'back',  label: 'Call back everyone you spoke to yesterday', key: true  },
        { id: 'log',   label: 'Write down every no, in their words',       key: true  },
        { id: 'show',  label: 'Walk in to local shops (Tue + Thu)',        key: false },
        { id: 'train', label: 'Gym (or a deliberate rest day)',            key: false }
      ],
      weekly: [
        { id: 'w-show', label: 'Local walk-ins',            target: 5  },
        { id: 'w-new',  label: 'New shops called',          target: 75 },
        { id: 'w-back', label: 'Call-backs made',           target: 30 },
        { id: 'w-conv', label: 'Real conversations',        target: 20 },
        { id: 'w-call', label: 'Meetings or quotes booked', target: 2  },
        { id: 'w-str',  label: 'Stranger conversations',    target: 3  },
        { id: 'w-gym',  label: 'Gym sessions',              target: 4  },
        { id: 'w-cust', label: 'Customers signed',          target: 1  }
      ],
      days: {},
      weeks: {},
      revenue: []
    };
  }

  /* ---------------- local persistence ---------------- */

  var mem = null;
  var local = (function () {
    try {
      window.localStorage.setItem('__probe', '1');
      window.localStorage.removeItem('__probe');
      return {
        ok: true,
        get: function () {
          var raw = window.localStorage.getItem(KEY);
          return raw ? JSON.parse(raw) : null;
        },
        set: function (v) { window.localStorage.setItem(KEY, JSON.stringify(v)); }
      };
    } catch (e) {
      /* private mode / file:// — still runs, just forgets on close */
      return {
        ok: false,
        get: function () { return mem; },
        set: function (v) { mem = v; }
      };
    }
  })();

  /* Baked-in config (js/config.js) is the default; anything pasted into the
     panel is kept per browser and overrides it. So a fresh device is already
     pointed at the right project and only needs the email sign-in. */
  function readConfig() {
    var baked = window.KEMAL_SYNC || {};
    var ls = {};
    try { ls = JSON.parse(window.localStorage.getItem(CFG_KEY)) || {}; } catch (e) {}
    return { url: ls.url || baked.url || '', key: ls.key || baked.key || '' };
  }
  function writeConfig(c) {
    try { window.localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {}
  }

  /* ---------------- merge ---------------- */

  /* Pick the side with the newer timestamp for each independently editable
     leaf. Ties go to `a` (the local copy) so a no-op sync never churns. */
  function mergeStamped(a, b, valueKey, stampKey) {
    var out = {}, keys = {};
    Object.keys(a || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(b || {}).forEach(function (k) { keys[k] = 1; });

    Object.keys(keys).forEach(function (k) {
      var ea = (a || {})[k], eb = (b || {})[k];
      if (!ea) { out[k] = eb; return; }
      if (!eb) { out[k] = ea; return; }

      var va = ea[valueKey] || {}, vb = eb[valueKey] || {};
      var ta = ea[stampKey] || {}, tb = eb[stampKey] || {};
      var v = {}, t = {}, f = {};

      Object.keys(va).forEach(function (n) { f[n] = 1; });
      Object.keys(vb).forEach(function (n) { f[n] = 1; });
      Object.keys(f).forEach(function (n) {
        var sa = ta[n] || 0, sb = tb[n] || 0;
        if (sb > sa) { v[n] = vb[n]; t[n] = sb; }
        else         { v[n] = va[n]; t[n] = sa; }
      });

      out[k] = {};
      out[k][valueKey] = v;
      out[k][stampKey] = t;

      /* weeks also carry review prose, stamped separately */
      if (ea.review || eb.review) {
        var ra = ea.review || {}, rb = eb.review || {};
        var qa = ea.rt || {}, qb = eb.rt || {};
        var rv = {}, rt = {}, rf = {};
        Object.keys(ra).forEach(function (n) { rf[n] = 1; });
        Object.keys(rb).forEach(function (n) { rf[n] = 1; });
        Object.keys(rf).forEach(function (n) {
          var sa2 = qa[n] || 0, sb2 = qb[n] || 0;
          if (sb2 > sa2) { rv[n] = rb[n]; rt[n] = sb2; }
          else           { rv[n] = ra[n]; rt[n] = sa2; }
        });
        out[k].review = rv;
        out[k].rt = rt;
      }
    });
    return out;
  }

  /* Revenue is a log, so union by id. Deletes leave a tombstone — dropping
     the row outright would let the other device's copy resurrect it. */
  function mergeRevenue(a, b) {
    var byId = {};
    (a || []).concat(b || []).forEach(function (r) {
      if (!r || !r.id) return;
      var prev = byId[r.id];
      if (!prev || (r.t || 0) > (prev.t || 0)) byId[r.id] = r;
    });
    return Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (x, y) { return (x.date < y.date) ? 1 : -1; });
  }

  function merge(a, b) {
    if (!b) return a;
    if (!a) return b;
    /* config is one block — it changes deliberately, on Sundays */
    var cfgFromB = (b.cfgT || 0) > (a.cfgT || 0);
    var base = cfgFromB ? b : a;
    return {
      v: 5,
      start:  base.start  || a.start || b.start,
      target: base.target || a.target,
      cfgT:   Math.max(a.cfgT || 0, b.cfgT || 0),
      daily:  base.daily  || a.daily  || b.daily,
      weekly: base.weekly || a.weekly || b.weekly,
      days:   mergeStamped(a.days,  b.days,  'done',   't'),
      weeks:  mergeStamped(a.weeks, b.weeks, 'counts', 't'),
      revenue: mergeRevenue(a.revenue, b.revenue)
    };
  }

  /* ---------------- supabase ---------------- */

  var sb = null, session = null, listeners = [];
  var statusText = 'Local only';
  var statusState = 'local';

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(statusState, statusText); } catch (e) {}
    });
  }
  function setStatus(s, t) { statusState = s; statusText = t; emit(); }

  function configured() {
    var c = readConfig();
    return !!(c.url && c.key);
  }

  /* The SDK is loaded on demand and never blocks first paint. If the CDN is
     unreachable the app carries on as a local-only tracker. */
  function client() {
    if (sb) return Promise.resolve(sb);
    var c = readConfig();
    if (!c.url || !c.key) return Promise.resolve(null);
    return import('https://esm.sh/@supabase/supabase-js@2')
      .then(function (m) {
        sb = m.createClient(c.url, c.key, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        return sb;
      })
      .catch(function () {
        setStatus('error', 'Sync library unavailable — saving locally');
        return null;
      });
  }

  function getSession() {
    return client().then(function (c) {
      if (!c) return null;
      return c.auth.getSession().then(function (r) {
        session = (r && r.data && r.data.session) || null;
        return session;
      });
    });
  }

  function signIn(email) {
    return client().then(function (c) {
      if (!c) throw new Error('Sync is not configured yet.');
      return c.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: location.origin + location.pathname }
      }).then(function (r) {
        if (r.error) throw r.error;
        return true;
      });
    });
  }

  function signOut() {
    return client().then(function (c) {
      if (!c) return;
      return c.auth.signOut().then(function () {
        session = null;
        setStatus('local', 'Signed out — saving locally');
      });
    });
  }

  function pull() {
    if (!session) return Promise.resolve(null);
    return client().then(function (c) {
      if (!c) return null;
      return c.from('dashboard').select('doc').eq('user_id', session.user.id).maybeSingle()
        .then(function (r) {
          if (r.error) throw r.error;
          return r.data ? r.data.doc : null;
        });
    });
  }

  function push(state) {
    if (!session) return Promise.resolve(false);
    return client().then(function (c) {
      if (!c) return false;
      return c.from('dashboard').upsert({
        user_id: session.user.id,
        doc: state,
        updated_at: new Date().toISOString()
      }).then(function (r) {
        if (r.error) throw r.error;
        return true;
      });
    });
  }

  /* ---------------- public surface ---------------- */

  var S = null;
  var pushTimer = null;
  var onChange = function () {};

  function load() {
    S = local.get();
    if (!S) S = defaults();
    migrate();
    if (!S.start) {
      /* week 1 begins on the Sunday of the week you first opened it */
      var d = new Date();
      d.setDate(d.getDate() - d.getDay());
      S.start = d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    }
    return S;
  }

  /* Non-destructive: never bump the key and wipe history. Add what's missing,
     rewrite stale labels in place. */
  function migrate() {
    var d = defaults();
    S.v = 5;
    if (!S.cfgT) S.cfgT = now();
    if (!S.target) S.target = d.target;
    if (!Array.isArray(S.daily)  || !S.daily.length)  S.daily = d.daily;
    if (!Array.isArray(S.weekly) || !S.weekly.length) S.weekly = d.weekly;
    if (!S.days)  S.days = {};
    if (!S.weeks) S.weeks = {};
    if (!Array.isArray(S.revenue)) S.revenue = [];

    /* every weekly counter the minis chart against must exist */
    d.weekly.forEach(function (m) {
      if (!S.weekly.some(function (x) { return x.id === m.id; })) S.weekly.push(m);
    });

    /* v4 shape: days[date] = {taskId: bool}; weeks[k] = {counts, review} */
    Object.keys(S.days).forEach(function (k) {
      var rec = S.days[k];
      if (!rec.done) {
        var done = {}, t = {};
        Object.keys(rec).forEach(function (n) {
          if (n === 'done' || n === 't') return;
          done[n] = rec[n]; t[n] = 1;
        });
        S.days[k] = { done: done, t: t };
      }
      if (!S.days[k].t) S.days[k].t = {};
    });
    Object.keys(S.weeks).forEach(function (k) {
      var wk = S.weeks[k];
      if (!wk.counts) wk.counts = {};
      if (!wk.t) {
        wk.t = {};
        Object.keys(wk.counts).forEach(function (n) { wk.t[n] = 1; });
      }
      if (!wk.review) wk.review = {};
      if (!wk.rt) wk.rt = {};
    });
    S.revenue.forEach(function (r, i) {
      if (!r.id) r.id = 'r' + i + '-' + (r.date || '') + '-' + Math.random().toString(36).slice(2, 7);
      if (!r.t) r.t = 1;
    });
  }

  /* Deliberately does NOT fire onChange: a local edit has already updated
     the DOM that produced it. Re-rendering here would fight the caret in a
     textarea and restart every meter animation on each keystroke. onChange
     is for state arriving from elsewhere. */
  function save() {
    local.set(S);
    if (!session) return;
    setStatus('syncing', 'Saving…');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      push(S)
        .then(function (ok) {
          if (ok) setStatus('synced', 'Synced · ' + new Date().toLocaleTimeString());
        })
        .catch(function () { setStatus('error', 'Sync failed — saved on this device'); });
    }, 700);
  }

  /* Pull remote, merge into local, persist the union. */
  function sync() {
    if (!session) return Promise.resolve(false);
    setStatus('syncing', 'Syncing…');
    return pull()
      .then(function (remote) {
        if (remote) {
          S = merge(S, remote);
          local.set(S);
          onChange();
        }
        return push(S);
      })
      .then(function () {
        setStatus('synced', 'Synced · ' + new Date().toLocaleTimeString());
        return true;
      })
      .catch(function () {
        setStatus('error', 'Sync failed — saved on this device');
        return false;
      });
  }

  /* Bring sync up after first paint, then keep it warm. */
  function start(cb) {
    onChange = cb || function () {};
    if (!configured()) {
      setStatus('local', local.ok ? 'This device only' : 'Memory only — storage blocked');
      return;
    }
    getSession().then(function (s) {
      if (!s) {
        setStatus('local', 'Not signed in — this device only');
        return;
      }
      setStatus('syncing', 'Syncing…');
      sync();

      client().then(function (c) {
        if (c) c.auth.onAuthStateChange(function (_e, ns) {
          session = ns;
          if (ns) sync();
        });
      });

      /* Coming back to the tab is the moment another device's edits matter. */
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) sync();
      });
      window.addEventListener('online', sync);
      setInterval(function () { if (!document.hidden) sync(); }, 60000);
    });
  }

  return {
    WEEKS: WEEKS,
    MONTH_CUM: MONTH_CUM,
    LINK: LINK,
    load: load,
    save: save,
    sync: sync,
    start: start,
    state: function () { return S; },
    replace: function (next) { S = merge(S, next); local.set(S); onChange(); },
    now: now,
    defaults: defaults,
    config: { read: readConfig, write: writeConfig, ok: configured },
    auth: { signIn: signIn, signOut: signOut, session: function () { return session; } },
    onStatus: function (fn) { listeners.push(fn); fn(statusState, statusText); }
  };
})();
