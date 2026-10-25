/**
 * AP Villas Founder OS · portal (www.apvillasandresorts.in/founder/)
 * Talks only to the AP Villas Apps Script web app. Every action is re-checked on the server with the session token,
 * so nothing in this file grants access by itself. The token lives in sessionStorage (closing the tab signs you out).
 */
(function () {
  'use strict';
  // Requests go through our own domain (/api/fo, a Vercel rewrite to the Apps Script web app) so a browser or network that cannot
  // reach script.google.com still works; the answer is then read from script.googleusercontent.com. Direct is the fallback.
  var DIRECT = 'https://script.google.com/macros/s/AKfycbzmtIwOzGohnjEOfp7RZ1cU8JtwkCb6mEZiHEa8j_gknh-zkVbHz4oEV1Mu5xTaNpo7/exec';
  var API = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? DIRECT : '/api/fo';
  if (location.hostname === 'localhost' && location.port === '3100') API = '/api';   // tests/founder/dev-server.mjs (runs the real backend code on test data)
  var M = window.FoMetrics, C = window.FoCharts;
  var root = document.getElementById('fo-root');
  var IDLE_MS = 30 * 60000;

  // ------------------------------------------------------------ state ------------------------------------------------------------
  var S = {
    token: ss('get', 'fo_t'), user: JSON.parse(ss('get', 'fo_u') || 'null'), data: null, loadedAt: null,
    view: 'overview', tab: {}, range: 'last30', from: '', to: '', property: 'all', grain: 'month',
    list: { q: '', status: 'active', channel: 'all', mode: 'all', from: '', to: '', sort: 'checkin', dir: -1, page: 0 },
    exFilter: 'open', calMonth: '', lastActive: Date.now(),
  };
  function ss(op, k, v) { try { if (op === 'get') return sessionStorage.getItem(k); if (op === 'set') sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) { return null; } }
  function ls(op, k, v) { try { if (op === 'get') return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  (function prefs() { var p = JSON.parse(ls('get', 'fo_prefs') || '{}'); if (p.range) S.range = p.range; if (p.grain) S.grain = p.grain; if (p.theme) document.documentElement.dataset.theme = p.theme; S.collapsed = !!p.collapsed; })();
  function savePrefs() { ls('set', 'fo_prefs', JSON.stringify({ range: S.range, grain: S.grain, theme: document.documentElement.dataset.theme || '', collapsed: S.collapsed })); }

  // ------------------------------------------------------------ helpers ------------------------------------------------------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  var num = M.num, has = M.has;
  function inr(v) { return v == null || !isFinite(v) ? '—' : '₹' + Math.round(v).toLocaleString('en-IN'); }
  function pct(v, d) { return v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d == null ? 1 : d) + '%'; }
  function n1(v) { return v == null || !isFinite(v) ? '—' : (Math.round(v * 10) / 10).toLocaleString('en-IN'); }
  function dmy(d) { if (!d) return '—'; var t = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); return isNaN(t) ? esc(d) : t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  function dm(d) { var t = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); return isNaN(t) ? d : t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function when(ts) { if (!ts) return '—'; var t = new Date(ts); return isNaN(t) ? esc(ts) : t.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }); }
  function ago(ts) { var t = Date.parse(ts); if (!t) return 'never'; var m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; }
  function toast(msg, bad, ms) { var t = document.createElement('div'); t.className = 'fo-toast' + (bad ? ' bad' : ''); t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, ms || (bad ? 6000 : 3200)); }
  function propName(id) { var p = (S.data.properties || []).filter(function (x) { return x.property_id === id; })[0]; return p ? p.name : (id ? id : 'No villa set'); }
  function today() { return S.data && S.data.today || new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10); }
  function icon(name) {
    var P = {
      overview: 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z', bookings: 'M7 3v2M17 3v2M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
      chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2', revenue: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', studio: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 17h7M17.5 14v7',
      trend: 'M3 17l6-6 4 4 8-8M15 7h6v6', web: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20', home: 'M3 11l9-8 9 8v10H3zM9 21v-6h6v6',
      money: 'M3 6h18v12H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', guest: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', forecast: 'M3 12h4l3 8 4-16 3 8h4',
      ops: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21h-4v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1-2.8-2.8.1-.1A1.7 1.7 0 0 0 3.2 14H3v-4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1 2.8-2.8.1.1A1.7 1.7 0 0 0 10 3.2V3h4v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1 2.8 2.8-.1.1A1.7 1.7 0 0 0 20.8 10H21v4h-.2a1.7 1.7 0 0 0-1.4 1z',
      idea: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z', tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01', report: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6', plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4',
      lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4', bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0', menu: 'M3 6h18M3 12h18M3 18h18',
      search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', x: 'M18 6 6 18M6 6l12 12',
    };
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (P[name] || P.overview) + '"/></svg>';
  }

  // ------------------------------------------------------------ API ------------------------------------------------------------
  // Every call: a time limit (so nothing can hang forever), one automatic retry for read-only calls, and a progress bar.
  var READS = { 'f.data': 1, 'f.health': 1, 'f.ga4': 1, 'f.gsc': 1, 'f.campaign.report': 1, 'f.report.get': 1, 'f.booking.history': 1, 'f.sessions': 1, 'f.audit': 1 }, inFlight = 0;
  function busyBar(d) {
    inFlight = Math.max(0, inFlight + d);
    var b = document.getElementById('fo-busy');
    if (!b) { b = document.createElement('div'); b.id = 'fo-busy'; b.className = 'fo-busy'; b.setAttribute('role', 'progressbar'); b.setAttribute('aria-label', 'Loading'); document.body.appendChild(b); }
    b.classList.toggle('is-on', inFlight > 0);
  }
  function api(action, body, attempt) {
    var payload = Object.assign({ action: action }, body || {});
    if (S.token && action.indexOf('f.login.') !== 0) payload.token = S.token;
    var ctl = window.AbortController ? new AbortController() : null, limit = action === 'f.sync' || action === 'f.report.run' || action === 'f.import.rows' ? 120000 : 60000;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, limit);
    busyBar(1);
    var opts = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined };
    return fetch(API, opts).catch(function (err) { if (API === DIRECT || (err && err.name === 'AbortError')) throw err; return fetch(DIRECT, opts); })   // proxy unreachable: try Google directly
      .then(function (r) { if (!r.ok) throw new Error('Network error ' + r.status); return r.json(); })
      .then(function (j) {
        if (j.rotate) { S.token = j.rotate; ss('set', 'fo_t', S.token); }
        if (j.auth === false) { signedOut('Your session has ended. Please sign in again.'); throw new Error('signed out'); }
        return j;
      }, function (err) {
        if (err && err.message === 'signed out') throw err;
        if (READS[action] && !attempt) return new Promise(function (res) { setTimeout(res, 800); }).then(function () { return api(action, body, 1); });
        throw new Error(err && err.name === 'AbortError' ? 'The server took too long to answer. Please try again in a moment.' : 'Could not reach the server. Check your connection and try again.');
      })
      .then(function (j) { clearTimeout(timer); busyBar(-1); return j; }, function (e) { clearTimeout(timer); busyBar(-1); throw e; });
  }
  function load(quiet) {
    if (!quiet) { root.innerHTML = '<div class="fo-loading"><div class="fo-spin"></div><div>Loading your business data…</div></div>'; }
    var keepY = quiet ? window.scrollY : 0, keepView = location.hash;
    return api('f.data').then(function (j) {
      if (!j.ok) throw new Error(j.error || 'Could not load data');
      S.data = j; S.loadedAt = Date.now(); render();
      if (quiet && location.hash === keepView && keepY) window.scrollTo(0, keepY);   // stay where you were after a save
    }).catch(function (e) { if (e.message !== 'signed out') { if (!S.data) root.innerHTML = '<div class="fo-loading"><b>Could not load data.</b><div>' + esc(e.message) + '</div><button class="btn btn--primary" id="fo-retry">Try again</button></div>'; var b = $('#fo-retry'); if (b) b.onclick = function () { load(); }; toast(e.message, true); } });
  }
  function signedOut(msg) { S.token = null; S.user = null; S.data = null; ss('del', 'fo_t'); ss('del', 'fo_u'); renderLogin(msg); }

  // idle sign-out (server also expires idle sessions)
  ['click', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { S.lastActive = Date.now(); }, { passive: true }); });
  setInterval(function () { if (S.token && Date.now() - S.lastActive > IDLE_MS) { api('f.logout').catch(function () {}); signedOut('You were signed out after 30 minutes without activity.'); } }, 30000);

  // ------------------------------------------------------------ sign-in ------------------------------------------------------------
  var L = { step: 'cred', email: '', challenge: '', purpose: '', to: '', resendAt: 0 };
  function renderLogin(msg) {
    document.title = 'Sign in · Founder OS';
    var otp = L.step === 'otp';
    root.innerHTML = '<div class="fo-login"><form class="fo-login__card" novalidate autocomplete="on">' +
      '<div class="fo-login__brand"><img src="/assets/brand/logo-emblem-512.webp" alt=""><div><b>AP Villas &amp; Resorts</b><span>FOUNDER OS</span></div></div>' +
      (otp
        ? '<h1>Check your email</h1><p class="sub">We sent a 6-digit code to <b>' + esc(L.to) + '</b>. It expires in 5 minutes.</p>' +
          '<label class="fo-field">One-time code<input class="fo-otp" name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required autofocus></label>' +
          (L.purpose === 'setup' ? '<p class="fo-hint">First sign-in: choose a passphrase you will use from now on (12+ characters; a short sentence is easiest to remember).</p>' +
            '<label class="fo-field">New passphrase<input type="password" name="np" autocomplete="new-password" minlength="12" required></label>' +
            '<label class="fo-field">Repeat passphrase<input type="password" name="np2" autocomplete="new-password" minlength="12" required></label>' : '') +
          '<div class="fo-msg" role="alert">' + esc(msg || '') + '</div>' +
          '<button class="btn btn--primary btn--block" type="submit">Verify and sign in</button>' +
          '<p class="fo-hint" style="display:flex;justify-content:space-between;margin-top:14px"><button type="button" class="fo-linkbtn" id="fo-back">← Start again</button><button type="button" class="fo-linkbtn" id="fo-resend">Send a new code</button></p>'
        : '<h1>Welcome back, Apoorv.</h1><p class="sub">Sign in to the AP Villas command center.</p>' +
          '<label class="fo-field">Email<input type="email" name="email" autocomplete="username" required value="' + esc(L.email) + '"></label>' +
          '<label class="fo-field">Passphrase<input type="password" name="pass" autocomplete="current-password"></label>' +
          '<p class="fo-hint">First time here? Leave the passphrase empty: we will email you a code and you will choose one.</p>' +
          '<div class="fo-msg" role="alert">' + esc(msg || '') + '</div>' +
          '<button class="btn btn--primary btn--block" type="submit">Continue</button>' +
          '<p class="fo-hint" style="margin-top:14px">Every sign-in needs your passphrase and a fresh code sent to your email. <a href="/">← Back to the website</a></p>') +
      '</form></div>';
    var f = $('form', root), m = $('.fo-msg', root);
    function busy(on) { var b = $('button[type=submit]', f); b.disabled = on; b.textContent = on ? 'Please wait…' : (otp ? 'Verify and sign in' : 'Continue'); }
    f.onsubmit = function (e) {
      e.preventDefault(); m.className = 'fo-msg'; m.textContent = '';
      if (!otp) {
        L.email = f.email.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(L.email)) { m.textContent = 'Enter your email address.'; return; }
        busy(true);
        api('f.login.start', { email: L.email, passphrase: f.pass.value }).then(function (j) {
          f.pass.value = '';
          if (!j.ok) { busy(false); m.textContent = j.error; return; }
          L.step = 'otp'; L.challenge = j.challenge; L.purpose = j.purpose; L.to = j.to; L.resendAt = Date.now() + 60000; renderLogin();
        }).catch(function (err) { busy(false); m.textContent = 'Could not reach the server. Check your connection. (' + err.message + ')'; });
      } else {
        var code = f.otp.value.replace(/\D/g, '');
        if (code.length !== 6) { m.textContent = 'Enter the 6-digit code.'; return; }
        var body = { challenge: L.challenge, otp: code };
        if (L.purpose === 'setup') {
          if (f.np.value.length < 12) { m.textContent = 'Choose a passphrase of at least 12 characters.'; return; }
          if (f.np.value !== f.np2.value) { m.textContent = 'The two passphrases do not match.'; return; }
          body.newPassphrase = f.np.value;
        }
        busy(true);
        api('f.login.verify', body).then(function (j) {
          if (!j.ok) { busy(false); if (j.restart) { L.step = 'cred'; renderLogin(j.error); return; } m.textContent = j.error; f.otp.value = ''; f.otp.focus(); return; }
          S.token = j.token; S.user = j.user; ss('set', 'fo_t', j.token); ss('set', 'fo_u', JSON.stringify(j.user)); S.lastActive = Date.now();
          L = { step: 'cred', email: L.email }; load();
        }).catch(function (err) { busy(false); m.textContent = 'Could not reach the server. (' + err.message + ')'; });
      }
    };
    if (otp) {
      var rs = $('#fo-resend'); var tick = function () { var s = Math.ceil((L.resendAt - Date.now()) / 1000); if (!document.body.contains(rs)) return; rs.disabled = s > 0; rs.textContent = s > 0 ? 'New code in ' + s + 's' : 'Send a new code'; if (s > 0) setTimeout(tick, 1000); }; tick();
      rs.onclick = function () { rs.disabled = true; api('f.login.resend', { challenge: L.challenge }).then(function (j) { if (!j.ok) { m.textContent = j.error; if (!j.wait) { L.step = 'cred'; renderLogin(j.error); } return; } L.challenge = j.challenge; L.resendAt = Date.now() + 60000; m.className = 'fo-msg ok'; m.textContent = 'A new code is on its way. The old one no longer works.'; tick(); }); };
      $('#fo-back').onclick = function () { L.step = 'cred'; renderLogin(); };
    }
  }

  // ------------------------------------------------------------ modules ------------------------------------------------------------
  var MODULES = [
    { g: 'Today' },
    { id: 'overview', label: 'Executive Overview', ic: 'overview' },
    { id: 'ops', label: 'Operations Center', ic: 'ops' },
    { g: 'Bookings' },
    { id: 'bookings', label: 'Booking Management', ic: 'bookings', count: function () { return openEx().length; } },
    { g: 'Revenue & pricing' },
    { id: 'pricing', label: 'Pricing & Market', ic: 'tag' },
    { id: 'revenue', label: 'Revenue Intelligence', ic: 'revenue' },
    { id: 'finance', label: 'Financial Intelligence', ic: 'money' },
    { g: 'Analytics' },
    { id: 'analytics', label: 'Booking Analytics', ic: 'chart' },
    { id: 'properties', label: 'Property Performance', ic: 'home' },
    { id: 'guests', label: 'Guest Intelligence', ic: 'guest' },
    { id: 'website', label: 'Website Analytics', ic: 'web' },
    { id: 'seo', label: 'SEO & Marketing', ic: 'search' },
    { id: 'trends', label: 'Trends & Events', ic: 'trend' },
    { id: 'forecast', label: 'Forecasting & Scenarios', ic: 'forecast' },
    { id: 'studio', label: 'Analytics Studio', ic: 'studio' },
    { g: 'Decisions & reports' },
    { id: 'strategy', label: 'Recommendations', ic: 'idea' },
    { id: 'reports', label: 'Reports & Exports', ic: 'report' },
    { g: 'Admin' },
    { id: 'integrations', label: 'Integrations & Automation', ic: 'plug' },
    { id: 'settings', label: 'Settings & Security', ic: 'lock' },
  ];
  function openEx() { return (S.data && S.data.exceptions || []).filter(function (e) { return e.status === 'open'; }); }

  function currentRange() {
    if (S.range === 'custom' && S.from && S.to) return { from: S.from <= S.to ? S.from : S.to, to: S.from <= S.to ? S.to : S.from };
    return M.range(S.range, today());
  }
  function filt() { return { property: S.property }; }

  // ------------------------------------------------------------ shell ------------------------------------------------------------
  function render() {
    if (!S.token) return renderLogin();
    if (!S.data) return load();
    var h = location.hash.replace(/^#\/?/, '').split('/');
    S.view = MODULES.some(function (m) { return m.id === h[0]; }) ? h[0] : 'overview';
    if (h[1]) S.tab[S.view] = h[1];
    var mod = MODULES.filter(function (m) { return m.id === S.view; })[0];
    document.title = mod.label + ' · Founder OS';
    var r = currentRange(), ex = openEx(), high = ex.filter(function (e) { return e.severity === 'high'; }).length;
    var initials = ((S.user && S.user.name) || 'AS').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    root.className = '';
    root.innerHTML = '<div class="fo-shell' + (S.collapsed ? ' is-collapsed' : '') + '">' +
      '<aside class="fo-side"><div class="fo-side__brand"><img src="/assets/brand/logo-emblem-512.webp" alt=""><div><b>AP Villas</b><span>FOUNDER OS</span></div></div><nav class="fo-nav">' +
      MODULES.map(function (m) {
        if (m.g) return '<div class="fo-nav__group">' + esc(m.g) + '</div>';
        var c = m.count ? m.count() : 0;
        return '<a href="#/' + m.id + '" class="' + (m.id === S.view ? 'is-on' : '') + '" title="' + esc(m.label) + '">' + icon(m.ic) + '<span>' + esc(m.label) + '</span>' + (c ? '<em class="count">' + c + '</em>' : m.phase ? '<em class="soon">phase ' + m.phase + '</em>' : '') + '</a>';
      }).join('') + '</nav><div class="fo-side__foot">Data: Google Sheets ledger · times in IST<br>Signed in as ' + esc(S.user && S.user.email) + '</div></aside>' +
      '<div class="fo-main"><header class="fo-top">' +
      '<button class="fo-iconbtn" id="fo-collapse" aria-label="Toggle menu">' + icon('menu') + '</button>' +
      '<div class="fo-search">' + icon('search') + '<input class="fo-input" id="fo-q" placeholder="Search guest, booking ID, phone…" autocomplete="off"><div class="fo-search__res" hidden></div></div>' +
      '<div class="fo-filters">' +
      '<select id="fo-range" aria-label="Date range">' + [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['this_month', 'This month'], ['prev_month', 'Previous month'], ['qtd', 'Quarter to date'], ['ytd', 'Year to date'], ['last12m', 'Last 12 months'], ['next30', 'Next 30 days (on the books)'], ['next90', 'Next 90 days (on the books)'], ['custom', 'Custom…']]
        .map(function (o) { return '<option value="' + o[0] + '"' + (S.range === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<span id="fo-custom"' + (S.range === 'custom' ? '' : ' hidden') + '><input type="date" id="fo-from" value="' + esc(r.from) + '"> – <input type="date" id="fo-to" value="' + esc(r.to) + '"></span>' +
      '<select id="fo-prop" aria-label="Villa"><option value="all">All villas</option>' + S.data.properties.map(function (p) { return '<option value="' + esc(p.property_id) + '"' + (S.property === p.property_id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' +
      '<button class="fo-iconbtn" id="fo-bell" aria-label="Notifications">' + icon('bell') + (ex.length ? '<span class="dot">' + (high || ex.length) + '</span>' : '') + '</button>' +
      '<button class="fo-iconbtn" id="fo-theme" aria-label="Light or dark">' + icon('moon') + '</button>' +
      '<div class="fo-profile" id="fo-prof" tabindex="0"><span class="fo-avatar">' + esc(initials) + '</span><span>' + esc((S.user && S.user.name || 'Founder').split(' ')[0]) + '</span></div>' +
      '</div></header><main class="fo-page" id="fo-page"></main></div></div>';

    $('#fo-collapse').onclick = function () { if (innerWidth <= 820) $('.fo-shell').classList.toggle('is-mobile-open'); else { S.collapsed = !S.collapsed; savePrefs(); $('.fo-shell').classList.toggle('is-collapsed', S.collapsed); } };
    $$('.fo-nav a').forEach(function (a) { a.addEventListener('click', function () { $('.fo-shell').classList.remove('is-mobile-open'); }); });
    $('#fo-range').onchange = function () { S.range = this.value; savePrefs(); if (S.range === 'custom') { $('#fo-custom').hidden = false; var x = currentRange(); S.from = x.from; S.to = x.to; } renderPage(); };
    $('#fo-from').onchange = function () { S.from = this.value; S.range = 'custom'; renderPage(); };
    $('#fo-to').onchange = function () { S.to = this.value; S.range = 'custom'; renderPage(); };
    $('#fo-prop').onchange = function () { S.property = this.value; renderPage(); };
    $('#fo-theme').onclick = function () { var d = document.documentElement, dark = d.dataset.theme === 'dark' || (!d.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches); d.dataset.theme = dark ? 'light' : 'dark'; savePrefs(); renderPage(); };
    $('#fo-bell').onclick = function (e) { e.stopPropagation(); menu('bell'); };
    $('#fo-prof').onclick = function (e) { e.stopPropagation(); menu('profile'); };
    wireSearch();
    renderPage();
  }
  function menu(kind) {
    var old = $('.fo-menu'); if (old) { var same = old.dataset.kind === kind; old.remove(); if (same) return; }
    var m = document.createElement('div'); m.className = 'fo-menu'; m.dataset.kind = kind;
    if (kind === 'profile') {
      m.innerHTML = '<div class="fo-menu__head"><b>' + esc(S.user.name || '') + '</b><br>' + esc(S.user.email) + ' · ' + esc(S.user.role) + '</div>' +
        '<a href="#/settings">Settings &amp; security</a><button data-a="reload">Refresh data</button><button data-a="out">Sign out</button><button data-a="all">Sign out on every device</button>';
    } else {
      var ex = openEx().sort(function (a, b) { return sevRank(b.severity) - sevRank(a.severity); }).slice(0, 8);
      var stale = staleNote();
      m.innerHTML = '<div class="fo-menu__head"><b>Notifications</b></div>' + (stale ? '<a href="#/integrations">⚠ ' + esc(stale) + '</a>' : '') +
        (ex.length ? ex.map(function (e) { return '<a href="#/bookings/reconcile"><span class="fo-badge ' + sevClass(e.severity) + '">' + esc(e.severity) + '</span> ' + esc(exLabel(e.type)) + '<br><small class="fo-hint">' + esc(e.detail.slice(0, 90)) + '</small></a>'; }).join('') + '<a href="#/bookings/reconcile"><b>Open the reconciliation center →</b></a>'
          : '<div style="padding:10px 12px" class="fo-hint">Nothing needs your attention.</div>');
    }
    document.body.appendChild(m);
    m.onclick = function (e) {
      var a = e.target.closest('[data-a]'); if (!a) { if (e.target.closest('a')) m.remove(); return; }
      m.remove();
      if (a.dataset.a === 'reload') load(true).then(function () { toast('Data refreshed'); });
      if (a.dataset.a === 'out') { api('f.logout').catch(function () {}).then(function () { signedOut('You are signed out.'); }); }
      if (a.dataset.a === 'all') { if (confirm('Sign out on every device, including this one?')) api('f.logout.all').then(function () { signedOut('Signed out on every device.'); }).catch(function () {}); }
    };
  }
  document.addEventListener('click', function (e) { var m = $('.fo-menu'); if (m && !m.contains(e.target)) m.remove(); var r = $('.fo-search__res'); if (r && !e.target.closest('.fo-search')) r.hidden = true; });
  window.addEventListener('hashchange', function () { if (S.data) render(); });

  function wireSearch() {
    var q = $('#fo-q'), res = $('.fo-search__res');
    q.oninput = function () {
      var s = q.value.trim().toLowerCase(); if (s.length < 2) { res.hidden = true; return; }
      var guests = {}; S.data.guests.forEach(function (g) { guests[g.guest_id] = g; });
      var hits = S.data.bookings.filter(function (b) {
        var g = guests[b.guest_id] || {};
        return [b.booking_id, b.external_id, b.guest_name, g.phone, g.email, propName(b.property_id), b.channel].join(' ').toLowerCase().indexOf(s) >= 0;
      }).slice(0, 12);
      res.innerHTML = hits.length ? hits.map(function (b) { return '<button data-id="' + esc(b.booking_id) + '"><b>' + esc(b.guest_name || 'Guest') + '</b> · ' + esc(propName(b.property_id)) + '<br><small class="fo-hint">' + esc(b.booking_id) + ' · ' + esc(b.channel) + ' · ' + dm(b.checkin) + ' → ' + dm(b.checkout) + '</small></button>'; }).join('') : '<div style="padding:12px" class="fo-hint">No bookings match.</div>';
      res.hidden = false;
      $$('button', res).forEach(function (b) { b.onclick = function () { res.hidden = true; q.value = ''; openBooking(b.dataset.id); }; });
    };
  }
  function staleNote() {
    var t = Date.parse(S.data.lastSync);
    if (!t) return 'E-check-in data has never been synced.';
    if (Date.now() - t > 3 * 3600000) return 'E-check-in sync last ran ' + ago(S.data.lastSync) + ' (expected hourly). Figures may be out of date.';
    return '';
  }
  function freshness() {
    var st = staleNote();
    return '<div class="fo-fresh">Data loaded ' + ago(new Date(S.loadedAt).toISOString()) + ' · e-check-in synced ' + ago(S.data.lastSync) + (st ? ' · <span class="stale">⚠ ' + esc(st) + '</span>' : '') + ' <button class="btn btn--sm" data-act="refresh">Refresh</button></div>';
  }
  function hello(title, sub) {
    return '<div class="fo-hello"><div><h1>' + esc(title) + '</h1><p>' + sub + '</p></div>' + freshness() + '</div>';
  }
  function renderPage() {
    var page = $('#fo-page'); if (!page) return;
    var fn = VIEWS[S.view] || viewSoon;
    try { fn(page); } catch (e) { page.innerHTML = '<div class="fo-card"><b>This view hit an error.</b><p class="fo-hint">' + esc(e.message) + '</p></div>'; console.error(e); }
    $$('[data-act=print]', page).forEach(function (b) { b.onclick = function () { window.print(); }; });
    $$('[data-act=refresh]', page).forEach(function (b) { b.onclick = function () { b.disabled = true; load(true).then(function () { toast('Data refreshed'); }); }; });
  }
  function tabs(view, list) {
    var cur = S.tab[view] || list[0][0];
    return { cur: cur, html: '<div class="fo-tabs" role="tablist">' + list.map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (t[0] === cur ? 'is-on' : '') + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>' };
  }
  function wireTabs(page, view) { $$('[data-tab]', page).forEach(function (b) { b.onclick = function () { location.hash = '#/' + view + '/' + b.dataset.tab; }; }); }

  // ------------------------------------------------------------ shared lookups ------------------------------------------------------------
  function payIndex() { return M.paymentsBy(S.data.payments); }
  function balanceOf(b, pi) {
    var x = (pi || payIndex())[b.booking_id] || { paid: 0, refunded: 0 };
    var due = has(b.gross_amount) ? num(b.gross_amount) - num(b.discount) + (b.status === 'cancelled' || b.status === 'no_show' ? num(b.retained_amount) - num(b.gross_amount) + num(b.discount) : 0) : null;
    return { paid: x.paid, refunded: x.refunded, net: x.paid - x.refunded, due: due, balance: due == null ? null : due - x.paid + x.refunded };
  }
  function stage(b) {
    if (b.status !== 'confirmed') return b.status;
    var t = today(); return b.checkout <= t ? 'completed' : b.checkin <= t ? 'in house' : 'upcoming';
  }
  function statusBadge(b) {
    var s = stage(b), cls = { upcoming: '', 'in house': 'fo-badge--gold', completed: 'fo-badge--muted', tentative: 'fo-badge--warn', cancelled: 'fo-badge--bad', no_show: 'fo-badge--bad', void: 'fo-badge--muted' }[s];
    return '<span class="fo-badge ' + (cls || '') + '">' + esc(s.replace('_', '-')) + '</span>';
  }
  function sevRank(s) { return { high: 3, medium: 2, low: 1 }[s] || 0; }
  function sevClass(s) { return s === 'high' ? 'fo-badge--bad' : s === 'medium' ? 'fo-badge--warn' : 'fo-badge--muted'; }
  var EX_LABELS = { duplicate_attempt: 'Duplicate attempt', suspected_duplicate: 'Suspected duplicate', amount_discrepancy: 'Amount discrepancy', payment_discrepancy: 'Payment discrepancy',
    refund_discrepancy: 'Refund discrepancy', missing_source_id: 'Missing source ID', failed_import: 'Failed import', inventory_conflict: 'Inventory conflict', unknown_property: 'Villa not matched',
    missing_amount: 'Missing amount', possible_test_record: 'Possible test record', source_changed: 'Source changed after import', status_mismatch: 'Status mismatch' };
  function exLabel(t) { return EX_LABELS[t] || t; }

  function kpiCard(key, label, value, kind, basis, cmp, opts) {
    opts = opts || {};
    if (value == null && opts.na) return '<div class="fo-card fo-kpi fo-kpi--na" title="' + esc(opts.na) + '"><div class="fo-kpi__label">' + esc(label) + '<span class="fo-badge fo-badge--muted">' + esc(basis) + '</span></div><div class="fo-kpi__value">Not available yet</div><div class="fo-kpi__cmp">' + esc(opts.na) + '</div></div>';
    var f = kind === 'inr' ? inr : kind === 'pct' ? function (v) { return pct(v); } : kind === 'days' ? function (v) { return v == null ? '—' : n1(v) + ' days'; } : function (v) { return v == null ? '—' : n1(v); };
    function line(lbl, c, prevVal) {
      if (prevVal == null || value == null) return '<span class="flat">' + lbl + ': no comparable data</span>';
      var d = value - prevVal, cls = Math.abs(d) < 1e-9 ? 'flat' : (d > 0) !== !!opts.lowerIsBetter ? 'up' : 'down', arrow = Math.abs(d) < 1e-9 ? '→' : d > 0 ? '▲' : '▼';
      var rel = kind === 'pct' ? (d * 100).toFixed(1) + ' pts' : prevVal ? ((d / Math.abs(prevVal)) * 100).toFixed(0) + '%' : 'new';
      return '<span class="' + cls + '">' + arrow + ' ' + rel + ' <span class="flat">(' + (kind === 'pct' ? f(prevVal) + ' before' : (d >= 0 ? '+' : '−') + f(Math.abs(d)).replace('-', '')) + ') ' + lbl + '</span></span>';
    }
    return '<div class="fo-card fo-kpi" data-drill="' + esc(opts.drill || '') + '" title="' + esc((M.DEFINITIONS[key] || {}).formula || '') + '"><div class="fo-kpi__label">' + esc(label) + '<span class="fo-badge">' + esc(basis) + '</span></div>' +
      '<div class="fo-kpi__value">' + f(value) + '</div><div class="fo-kpi__cmp">' + line('vs previous', null, cmp.prev) + line('vs last year', null, cmp.ly) + (opts.note ? '<span class="flat">' + esc(opts.note) + '</span>' : '') + '</div></div>';
  }
  function hasDataBefore(date) { return S.data.bookings.some(function (b) { return b.status !== 'void' && (b.checkin <= date || M.dateOf(b.created_at) <= date); }); }

  // ------------------------------------------------------------ 1. Executive overview ------------------------------------------------------------
  function viewOverview(page) {
    var r = currentRange(), f = filt(), D = S.data, t = today();
    var cur = M.compute(D, r.from, r.to, f), pr = M.previous(r.from, r.to), lyR = M.lastYear(r.from, r.to);
    var prev = hasDataBefore(pr.to) ? M.compute(D, pr.from, pr.to, f) : null, ly = hasDataBefore(lyR.to) ? M.compute(D, lyR.from, lyR.to, f) : null;
    function c(k) { return { prev: prev ? prev[k] : null, ly: ly ? ly[k] : null }; }
    var cards = [
      kpiCard('gross_booking_value', 'Gross booking value', cur.gross_booking_value, 'inr', 'booked', c('gross_booking_value'), { drill: 'made' }),
      kpiCard('net_accommodation_revenue', 'Net accommodation revenue', cur.net_accommodation_revenue, 'inr', 'stay', c('net_accommodation_revenue'), { drill: 'stay', note: cur.quality.nights_without_amount ? cur.quality.nights_without_amount + ' nights have no amount yet' : '' }),
      kpiCard('confirmed_bookings', 'Confirmed bookings', cur.confirmed_bookings, 'n', 'booked', c('confirmed_bookings'), { drill: 'made' }),
      kpiCard('occupancy', 'Occupancy', cur.occupancy, 'pct', 'stay', c('occupancy'), { drill: 'stay', note: cur.occupied_nights + ' of ' + cur.available_nights + ' villa-nights' }),
      kpiCard('adr', 'ADR', cur.adr, 'inr', 'stay', c('adr'), { drill: 'stay' }),
      kpiCard('revpar', 'RevPAR', cur.revpar, 'inr', 'stay', c('revpar'), { drill: 'stay' }),
      kpiCard('cancellation_rate', 'Cancellation rate', cur.cancellation_rate, 'pct', 'booked', c('cancellation_rate'), { drill: 'made', lowerIsBetter: true }),
      kpiCard('lead_time', 'Booking lead time (median)', cur.lead_time_median, 'days', 'booked', { prev: prev && prev.lead_time_median, ly: ly && ly.lead_time_median }, { drill: 'made', note: cur.lead_time_proxy_n ? cur.lead_time_proxy_n + ' bookings only have the e-check-in date (not counted)' : '' }),
      kpiCard('direct_share', 'Direct booking share', cur.direct_share_count, 'pct', 'booked', { prev: prev && prev.direct_share_count, ly: ly && ly.direct_share_count }, { drill: 'made', note: cur.direct_share_value != null ? pct(cur.direct_share_value) + ' of booking value' : '' }),
      '<div class="fo-card fo-kpi" id="ov-conv" data-goto="#/website"><div class="fo-kpi__label">Website enquiry rate<span class="fo-badge">GA4</span></div><div class="fo-kpi__value">…</div><div class="fo-kpi__cmp"><span class="flat">enquiries + WhatsApp + calls ÷ sessions</span></div></div>',
    ];
    if (window.FoInsights && (D.expenses || []).some(function (e) { return e.date >= r.from && e.date <= r.to; })) {   // profit only when costs are recorded
      var fin = window.FoInsights.finance(D, r.from, r.to, f);
      cards.push(kpiCard('contribution_margin', 'Contribution margin', fin.contribution, 'inr', 'stay', {}, { drill: '', note: fin.status === 'complete' ? '' : fin.status_note }));
    }
    page.innerHTML = hello('Welcome back, ' + ((S.user.name || 'Apoorv').split(' ')[0]) + '.', esc(dmy(r.from)) + ' – ' + esc(dmy(r.to)) + (S.property !== 'all' ? ' · ' + esc(propName(S.property)) : ' · all villas') + ' · compared with ' + esc(dmy(pr.from)) + ' – ' + esc(dmy(pr.to)) + ' and the same dates last year') +
      '<div class="fo-grid fo-grid--kpi">' + cards.join('') + '</div>' +
      '<p class="fo-hint" style="margin:8px 2px 18px">“booked” cards count bookings by the date they were made; “stay” cards count the nights guests stay. Booking value is not revenue, and neither is cash: see Financial figures below. Hover a card for its formula; click it for the bookings behind it.</p>' +
      '<div class="fo-grid fo-grid--2">' + briefing() + '<div class="fo-card"><h3>Money in this period <small>payment dates</small></h3>' +
      kv('Cash collected', inr(cur.cash_collected)) + kv('Refunds paid', inr(cur.refunds)) + kv('Outstanding receivables (today)', inr(cur.outstanding_receivables) + ' · ' + cur.outstanding_bookings + ' bookings') +
      kv('OTA commission on bookings made', inr(cur.commission_cost) + commissionNote(cur.commission_basis)) + kv('Revenue after commission (stay)', inr(cur.revenue_after_commission)) +
      kv('Cancellation fees kept', inr(cur.retained_fees)) + kv('Average length of stay', cur.alos == null ? '—' : n1(cur.alos) + ' nights · ' + cur.arrivals + ' arrivals') + '</div></div>' +
      '<div class="fo-card" style="margin-top:14px"><h3>Revenue and occupancy by stay date <small id="ov-grain"></small><span class="fo-card__tools"><button class="btn btn--sm" data-x="svg">SVG</button><button class="btn btn--sm" data-x="csv">CSV</button></span></h3><div class="fo-chartbox" id="ov-chart"></div></div>';
    var grain = M.days(r.from, r.to) <= 45 ? 'day' : M.days(r.from, r.to) <= 200 ? 'week' : 'month';
    var s = M.series(D, r.from, r.to, grain, f);
    $('#ov-grain').textContent = { day: 'daily', week: 'weekly', month: 'monthly' }[grain];
    C.combo($('#ov-chart'), { labels: s.map(function (x) { return grain === 'day' ? dm(x.key) : grain === 'week' ? 'w/c ' + dm(x.key) : x.key; }), kind: 'inr', rightKind: 'pct', empty: 'No stays in this period yet.',
      series: [{ name: 'Net accommodation revenue', values: s.map(function (x) { return x.revenue; }), type: 'bar' }, { name: 'Occupancy', values: s.map(function (x) { return x.occupancy; }), type: 'line', axis: 'right', color: '#C9A24F' }],
      onClick: function (i) { var b = bucketRange(s[i].key, grain, r); drill('stay', b.from, b.to); } });
    $('[data-x=svg]', page).onclick = function () { C.exportSvg($('#ov-chart'), 'revenue-occupancy-' + r.from + '-' + r.to); };
    $('[data-x=csv]', page).onclick = function () { csvDownload('revenue-occupancy-' + r.from + '-' + r.to, ['period', 'revenue', 'occupied_nights', 'available_nights', 'occupancy', 'adr'], s.map(function (x) { return [x.key, x.revenue.toFixed(2), x.occupied, x.available, x.occupancy == null ? '' : x.occupancy.toFixed(4), x.adr == null ? '' : x.adr.toFixed(2)]; })); };
    $$('[data-drill]', page).forEach(function (el) { if (el.dataset.drill) el.onclick = function () { drill(el.dataset.drill, r.from, r.to); }; });
    var gaTo = r.to > t ? t : r.to;   // GA4 has no future data
    if (r.from <= t) api('f.ga4', { from: r.from, to: gaTo }).then(function (j) {
      var box = $('#ov-conv'); if (!box || !j.ok) return;
      var g = j.ga; S.ga = g; S.gaKey = r.from + gaTo;
      $('.fo-kpi__value', box).textContent = g.connected && g.totals.sessions ? pct(g.intent / g.totals.sessions) : g.connected ? '—' : 'Not connected';
      if (g.connected) $('.fo-kpi__cmp', box).innerHTML = '<span class="flat">' + g.intent + ' actions from ' + g.totals.sessions + ' sessions (live site only)</span>';
    }).catch(function () {});
    else { var cb = $('#ov-conv .fo-kpi__value'); if (cb) cb.textContent = '—'; }
    $$('[data-goto]', page).forEach(function (el) { el.onclick = function () { location.hash = el.dataset.goto; }; });
  }
  function commissionNote(b) { var parts = []; if (b.estimated) parts.push(b.estimated + ' estimated from rate'); if (b.unknown) parts.push(b.unknown + ' unknown'); return parts.length ? ' <span class="fo-hint">(' + parts.join(', ') + ')</span>' : ''; }
  function kv(k, v) { return '<div class="fo-kv"><span>' + esc(k) + '</span><span>' + v + '</span></div>'; }

  function briefing() {
    var D = S.data, t = today(), y = M.addDays(t, -1), f = filt(), pi = payIndex();
    var yd = M.compute(D, y, y, f), inScope = M.compute(D, t, M.addDays(t, 6), f), n30 = M.compute(D, t, M.addDays(t, 29), f), n90 = M.compute(D, t, M.addDays(t, 89), f);
    var bk = D.bookings.filter(function (b) { return b.status !== 'void' && (S.property === 'all' || b.property_id === S.property); });
    var arr = bk.filter(function (b) { return b.status === 'confirmed' && b.checkin === t; }), dep = bk.filter(function (b) { return b.status === 'confirmed' && b.checkout === t; });
    var inHouse = bk.filter(function (b) { return b.status === 'confirmed' && b.checkin <= t && b.checkout > t; });
    var dues = bk.filter(function (b) { return ['confirmed', 'no_show'].indexOf(b.status) >= 0; }).map(function (b) { return { b: b, x: balanceOf(b, pi) }; }).filter(function (o) { return o.x.balance > 0.5; }).sort(function (a, c) { return a.b.checkin < c.b.checkin ? -1 : 1; });
    var soonDue = dues.filter(function (o) { return o.b.checkin >= t && o.b.checkin <= M.addDays(t, 7); }), overdue = dues.filter(function (o) { return o.b.checkin < t; });
    var cancels = bk.filter(function (b) { return b.status === 'cancelled' && M.dateOf(b.updated_at) >= M.addDays(t, -7); });
    var ex = openEx(), exHigh = ex.filter(function (e) { return e.severity === 'high'; });
    var unknownCom = S.data.channels.filter(function (c) { return c.kind === 'ota' && !has(c.commission_pct); }).filter(function (c) { return bk.some(function (b) { return b.channel === c.channel && !has(b.commission); }); });
    var actions = [];
    if (exHigh.length) actions.push(['Resolve ' + exHigh.length + ' high-priority data issue' + (exHigh.length > 1 ? 's' : ''), 'Unmatched villas, overlapping stays or possible duplicates make occupancy and revenue unreliable until fixed.', '#/bookings/reconcile']);
    if (overdue.length) actions.push(['Collect ' + inr(overdue.reduce(function (s, o) { return s + o.x.balance; }, 0)) + ' still due from ' + overdue.length + ' stay' + (overdue.length > 1 ? 's' : '') + ' that already started', overdue.slice(0, 3).map(function (o) { return o.b.guest_name + ' (' + dm(o.b.checkin) + ', ' + inr(o.x.balance) + ')'; }).join(' · ') + '. If it was paid, record the payment so the books match.', '#/bookings/list']);
    if (soonDue.length) actions.push(['Collect ' + inr(soonDue.reduce(function (s, o) { return s + o.x.balance; }, 0)) + ' from ' + soonDue.length + ' guest' + (soonDue.length > 1 ? 's' : '') + ' arriving within 7 days', soonDue.slice(0, 3).map(function (o) { return o.b.guest_name + ' (' + dm(o.b.checkin) + ', ' + inr(o.x.balance) + ')'; }).join(' · '), '#/ops']);
    if (unknownCom.length) actions.push(['Enter commission rates for ' + unknownCom.map(function (c) { return c.channel; }).join(', '), 'Without them, channel profitability shows commission as "unknown" instead of guessing.', '#/settings/channels']);
    if (n30.occupancy != null && n30.occupancy < 0.3 && n30.available_nights) actions.push(['Next 30 days are ' + pct(n30.occupancy, 0) + ' booked', 'Only ' + n30.occupied_nights + ' of ' + n30.available_nights + ' villa-nights are on the books. Worth checking OTA availability and WhatsApp follow-ups.', '#/bookings/calendar']);
    if (ex.length - exHigh.length) actions.push(['Review ' + (ex.length - exHigh.length) + ' other reconciliation item' + (ex.length - exHigh.length > 1 ? 's' : ''), 'Amount or payment differences, missing booking IDs, test records.', '#/bookings/reconcile']);
    var names = function (list) { return list.length ? list.map(function (b) { return esc(b.guest_name || 'Guest') + ' · ' + esc(propName(b.property_id)); }).join('<br>') : '<span class="fo-hint">None</span>'; };
    return '<div class="fo-card"><h3>Daily founder brief <small>' + esc(dmy(t)) + ' · IST</small><span class="fo-card__tools"><button class="btn btn--sm" data-act="print">Print / PDF</button></span></h3><div class="fo-brief">' +
      '<div><b>Yesterday</b> · ' + yd.bookings_made + ' booking' + (yd.bookings_made === 1 ? '' : 's') + ' made (' + inr(yd.gross_booking_value) + '), ' + yd.occupied_nights + ' villa-nights stayed, ' + inr(yd.cash_collected) + ' collected.</div>' +
      '<div class="fo-grid fo-grid--3" style="gap:10px"><div><b>Arriving today</b><br>' + names(arr) + '</div><div><b>Leaving today</b><br>' + names(dep) + '</div><div><b>In house</b><br>' + inHouse.length + ' villa' + (inHouse.length === 1 ? '' : 's') + '</div></div>' +
      '<div><b>On the books</b> · next 7 days ' + pct(inScope.occupancy, 0) + ' · next 30 days ' + pct(n30.occupancy, 0) + ' · next 90 days ' + pct(n90.occupancy, 0) + ' occupancy.</div>' +
      '<div><b>Pending payments</b> · ' + inr(dues.reduce(function (s, o) { return s + o.x.balance; }, 0)) + ' across ' + dues.length + ' booking' + (dues.length === 1 ? '' : 's') + '. <b>Cancellations</b> (7 days) · ' + cancels.length + '. <b>Data issues</b> · ' + ex.length + ' open (' + exHigh.length + ' high).</div>' +
      '<div><b>Recommended actions</b>' + (actions.length ? actions.map(function (a) { return '<div class="fo-action"><div><b>' + esc(a[0]) + '</b><span class="fo-hint">' + esc(a[1]) + '</span></div><button class="btn btn--sm" data-goto="' + a[2] + '">Open</button></div>'; }).join('') : '<p class="fo-hint">Nothing urgent. 🙏</p>') + '</div>' +
      '</div></div>';
  }

  // drill-down into the booking list
  function drill(mode, from, to, extra) {
    S.list = Object.assign({}, S.list, { mode: mode, from: from, to: to, page: 0, status: 'all', channel: 'all', q: '' }, extra || {});
    location.hash = '#/bookings/list'; if (S.view === 'bookings') renderPage();
  }
  function bucketRange(key, g, r) {
    var from, to;
    if (g === 'day') { from = to = key; }
    else if (g === 'week') { from = key; to = M.addDays(key, 6); }
    else if (g === 'month') { from = key + '-01'; to = M.addDays(M.addDays(from, 32).slice(0, 7) + '-01', -1); }
    else if (g === 'quarter') { var q = Number(key.slice(-1)), y = key.slice(0, 4); from = y + '-' + ('0' + (q * 3 - 2)).slice(-2) + '-01'; to = M.addDays(M.addDays(y + '-' + ('0' + (q * 3)).slice(-2) + '-01', 32).slice(0, 7) + '-01', -1); }
    else { from = key + '-01-01'; to = key + '-12-31'; }
    return { from: from < r.from ? r.from : from, to: to > r.to ? r.to : to };
  }

  // ------------------------------------------------------------ 2. Booking management ------------------------------------------------------------
  function viewBookings(page) {
    var T = tabs('bookings', [['list', 'All bookings'], ['calendar', 'Calendar'], ['reconcile', 'Reconciliation center (' + openEx().length + ')'], ['import', 'Import & sync'], ['blocks', 'Maintenance blocks']]);
    page.innerHTML = hello('Booking management', 'One ledger for every channel: e-check-in, OTA exports, WhatsApp and phone bookings.') + T.html + '<div id="bk-body"></div>';
    wireTabs(page, 'bookings');
    var body = $('#bk-body');
    ({ list: bookingList, calendar: bookingCalendar, reconcile: reconcileCenter, import: importView, blocks: blocksView }[T.cur] || bookingList)(body);
  }
  function bookingList(body) {
    var L2 = S.list, pi = payIndex(), D = S.data;
    var channels = uniq(D.bookings.map(function (b) { return b.channel; }));
    body.innerHTML = '<div class="fo-toolbar"><input class="fo-input" id="bl-q" placeholder="Filter by guest, ID, villa…" value="' + esc(L2.q) + '">' +
      sel('bl-status', [['active', 'Active (not cancelled/void)'], ['all', 'All statuses'], ['upcoming', 'Upcoming'], ['in house', 'In house'], ['completed', 'Completed'], ['tentative', 'Tentative'], ['cancelled', 'Cancelled'], ['no_show', 'No-show'], ['void', 'Void']], L2.status) +
      sel('bl-channel', [['all', 'All channels']].concat(channels.map(function (c) { return [c, c]; })), L2.channel) +
      sel('bl-mode', [['all', 'Any dates'], ['stay', 'Staying between'], ['made', 'Booked between']], L2.mode) +
      '<span id="bl-dates"' + (L2.mode === 'all' ? ' hidden' : '') + '><input type="date" id="bl-from" class="fo-input" style="width:auto" value="' + esc(L2.from) + '"> – <input type="date" id="bl-to" class="fo-input" style="width:auto" value="' + esc(L2.to) + '"></span>' +
      '<button class="btn" id="bl-csv">Export CSV</button><button class="btn btn--primary" id="bl-new">+ New booking</button></div><div id="bl-table"></div>';
    function rows() {
      var q = L2.q.toLowerCase();
      return D.bookings.filter(function (b) {
        if (S.property !== 'all' && b.property_id !== S.property) return false;
        var st = stage(b);
        if (L2.status === 'active' && ['cancelled', 'void', 'no_show'].indexOf(b.status) >= 0) return false;
        if (['all', 'active'].indexOf(L2.status) < 0 && st !== L2.status) return false;
        if (L2.channel !== 'all' && b.channel !== L2.channel) return false;
        if (L2.mode === 'stay' && L2.from && L2.to && !(b.checkin <= L2.to && b.checkout > L2.from)) return false;
        if (L2.mode === 'made' && L2.from && L2.to) { var d = M.dateOf(b.created_at); if (!(d >= L2.from && d <= L2.to)) return false; }
        if (q && [b.booking_id, b.external_id, b.guest_name, propName(b.property_id), b.channel, b.notes].join(' ').toLowerCase().indexOf(q) < 0) return false;
        return true;
      }).map(function (b) { var x = balanceOf(b, pi); return { b: b, paid: x.net, balance: x.balance }; });
    }
    var COLS = [['booking_id', 'Booking'], ['guest_name', 'Guest'], ['property', 'Villa'], ['channel', 'Channel'], ['checkin', 'Stay'], ['status', 'Status'], ['gross_amount', 'Amount', 1], ['paid', 'Collected', 1], ['balance', 'Balance', 1], ['created_at', 'Booked on']];
    function draw() {
      var r = rows(), key = L2.sort, dir = L2.dir;
      r.sort(function (a, c) {
        var va = key === 'property' ? propName(a.b.property_id) : key === 'paid' || key === 'balance' ? (a[key] || 0) : key === 'gross_amount' ? num(a.b.gross_amount) : a.b[key] || '';
        var vc = key === 'property' ? propName(c.b.property_id) : key === 'paid' || key === 'balance' ? (c[key] || 0) : key === 'gross_amount' ? num(c.b.gross_amount) : c.b[key] || '';
        return (va < vc ? -1 : va > vc ? 1 : 0) * dir;
      });
      var per = 25, pages = Math.max(1, Math.ceil(r.length / per)); if (L2.page >= pages) L2.page = 0;
      var slice = r.slice(L2.page * per, L2.page * per + per);
      $('#bl-table').innerHTML = r.length ? '<div class="fo-tablewrap"><table class="fo-table"><thead><tr>' + COLS.map(function (c) { return '<th data-sort="' + c[0] + '" class="' + (c[2] ? 'num' : '') + '">' + esc(c[1]) + (key === c[0] ? (dir > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
        slice.map(function (o) {
          var b = o.b, flags = openEx().filter(function (e) { return e.booking_id === b.booking_id; }).length;
          return '<tr class="fo-row" data-id="' + esc(b.booking_id) + '"><td><b>' + esc(b.booking_id) + '</b>' + (b.external_id ? '<br><small class="fo-hint">' + esc(b.external_id) + '</small>' : '') + (flags ? ' <span class="fo-badge fo-badge--warn" title="Open data issues">⚑ ' + flags + '</span>' : '') + '</td>' +
            '<td>' + esc(b.guest_name || '—') + '</td><td>' + esc(propName(b.property_id)) + '</td><td>' + esc(b.channel) + '</td><td class="nw">' + dm(b.checkin) + ' → ' + dm(b.checkout) + '<br><small class="fo-hint">' + esc(b.nights) + ' nights</small></td>' +
            '<td>' + statusBadge(b) + '</td><td class="num">' + (has(b.gross_amount) ? inr(num(b.gross_amount)) : '<span class="fo-hint">not set</span>') + '</td><td class="num">' + inr(o.paid) + '</td><td class="num">' + (o.balance == null ? '—' : o.balance > 0.5 ? '<b>' + inr(o.balance) + '</b>' : inr(o.balance)) + '</td>' +
            '<td>' + dmy(M.dateOf(b.created_at)) + (/proxy/.test(b.created_basis) ? '<br><small class="fo-hint" title="Real booking date not on the check-in form">≈ e-check-in</small>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div><div class="fo-pager">' + r.length + ' bookings · page ' + (L2.page + 1) + ' of ' + pages + ' <button class="btn btn--sm" id="bl-prev"' + (L2.page ? '' : ' disabled') + '>‹ Prev</button><button class="btn btn--sm" id="bl-next"' + (L2.page < pages - 1 ? '' : ' disabled') + '>Next ›</button></div>'
        : '<div class="fo-empty">No bookings match these filters. ' + (D.bookings.length ? '' : 'Import from e-check-in or an OTA export, or add a WhatsApp booking.') + '</div>';
      $$('#bl-table th[data-sort]').forEach(function (th) { th.onclick = function () { if (L2.sort === th.dataset.sort) L2.dir = -L2.dir; else { L2.sort = th.dataset.sort; L2.dir = 1; } draw(); }; });
      $$('#bl-table tr.fo-row').forEach(function (tr) { tr.onclick = function () { openBooking(tr.dataset.id); }; });
      var p = $('#bl-prev'), n = $('#bl-next'); if (p) p.onclick = function () { L2.page--; draw(); }; if (n) n.onclick = function () { L2.page++; draw(); };
    }
    draw();
    $('#bl-q').oninput = function () { L2.q = this.value; L2.page = 0; draw(); };
    $('#bl-status').onchange = function () { L2.status = this.value; L2.page = 0; draw(); };
    $('#bl-channel').onchange = function () { L2.channel = this.value; L2.page = 0; draw(); };
    $('#bl-mode').onchange = function () { L2.mode = this.value; $('#bl-dates').hidden = L2.mode === 'all'; if (L2.mode !== 'all' && !L2.from) { var r = currentRange(); L2.from = r.from; L2.to = r.to; $('#bl-from').value = r.from; $('#bl-to').value = r.to; } draw(); };
    $('#bl-from').onchange = function () { L2.from = this.value; draw(); }; $('#bl-to').onchange = function () { L2.to = this.value; draw(); };
    $('#bl-new').onclick = function () { bookingForm(null); };
    $('#bl-csv').onclick = function () {
      var r = rows(), guests = {}; D.guests.forEach(function (g) { guests[g.guest_id] = g; });
      csvDownload('ap-villas-bookings-' + today(), ['booking_id', 'external_id', 'channel', 'source_account', 'villa', 'guest', 'checkin', 'checkout', 'nights', 'adults', 'children', 'status', 'stage', 'gross_amount', 'discount', 'taxes', 'commission', 'collected_net', 'balance', 'booked_on', 'booked_on_basis', 'acquisition_source', 'payment_channel', 'comms_channel', 'origin', 'origin_ref'],
        r.map(function (o) { var b = o.b; return [b.booking_id, b.external_id, b.channel, b.source_account, propName(b.property_id), b.guest_name, b.checkin, b.checkout, b.nights, b.adults, b.children, b.status, stage(b), b.gross_amount, b.discount, b.taxes, b.commission, o.paid, o.balance == null ? '' : o.balance, M.dateOf(b.created_at), b.created_basis, b.acquisition_source, b.payment_channel, b.comms_channel, b.origin, b.origin_ref]; }));
    };
  }
  function sel(id, opts, cur) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(cur) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }).sort(); }

  // ---------- booking detail ----------
  function drawer(html) {
    var d = document.createElement('div'); d.className = 'fo-drawer'; d.innerHTML = '<div class="fo-drawer__panel" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-close]')) d.remove(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { d.remove(); document.removeEventListener('keydown', k); } });
    return d.firstChild;
  }
  function openBooking(id) {
    var b = S.data.bookings.filter(function (x) { return x.booking_id === id; })[0]; if (!b) return toast('Booking not found', true);
    var g = S.data.guests.filter(function (x) { return x.guest_id === b.guest_id; })[0] || {}, x = balanceOf(b), ex = S.data.exceptions.filter(function (e) { return e.booking_id === id && e.status === 'open'; });
    var com = M.commissionOf(b, S.data.channels);
    var p = drawer('<div class="fo-drawer__head"><div><h2 class="serif" style="font-size:24px">' + esc(b.guest_name || 'Guest') + '</h2><div class="fo-hint">' + esc(b.booking_id) + (b.external_id ? ' · ' + esc(b.channel) + ' #' + esc(b.external_id) : '') + ' · ' + statusBadge(b) + '</div></div><button class="fo-iconbtn" data-close aria-label="Close">' + icon('x') + '</button></div>' +
      (ex.length ? '<div class="fo-note" style="margin-bottom:14px;border-color:#E2C27A"><b>Open data issues</b><ul style="margin:6px 0 0;padding-left:18px">' + ex.map(function (e) { return '<li>' + esc(exLabel(e.type)) + ': ' + esc(e.detail) + '</li>'; }).join('') + '</ul><a href="#/bookings/reconcile" data-close>Resolve in the reconciliation center →</a></div>' : '') +
      '<dl class="fo-dl"><dt>Villa</dt><dd>' + esc(propName(b.property_id)) + '</dd><dt>Stay</dt><dd>' + dmy(b.checkin) + ' → ' + dmy(b.checkout) + ' · ' + esc(b.nights) + ' nights</dd><dt>Guests</dt><dd>' + esc(b.adults || '?') + ' adults' + (num(b.children) ? ', ' + esc(b.children) + ' children' : '') + '</dd>' +
      '<dt>Contact</dt><dd>' + esc(g.phone || '—') + (g.email ? ' · ' + esc(g.email) : '') + (g.city ? ' · ' + esc(g.city) : '') + '</dd>' +
      '<dt>Booking channel</dt><dd>' + esc(b.channel) + (b.source_account ? ' (' + esc(b.source_account) + ')' : '') + '</dd><dt>Found us via</dt><dd>' + esc(b.acquisition_source || 'not recorded') + '</dd>' +
      '<dt>Paid through</dt><dd>' + esc(b.payment_channel || 'not recorded') + '</dd><dt>Talked on</dt><dd>' + esc(b.comms_channel || 'not recorded') + '</dd>' +
      '<dt>Booked on</dt><dd>' + dmy(M.dateOf(b.created_at)) + ' <span class="fo-hint">(' + esc(b.created_basis || '') + ')</span></dd>' +
      '<dt>Amount</dt><dd>' + (has(b.gross_amount) ? inr(num(b.gross_amount)) : 'not set') + (num(b.discount) ? ' − discount ' + inr(num(b.discount)) : '') + (num(b.taxes) ? ' (taxes ' + inr(num(b.taxes)) + ')' : '') + '</dd>' +
      '<dt>Commission</dt><dd>' + (com.basis === 'unknown' ? 'unknown' : inr(com.amount) + ' <span class="fo-hint">(' + com.basis + ')</span>') + '</dd>' +
      '<dt>Collected</dt><dd>' + inr(x.paid) + (x.refunded ? ' − refunded ' + inr(x.refunded) : '') + '</dd><dt>Balance</dt><dd><b>' + (x.balance == null ? '—' : inr(x.balance)) + '</b></dd>' +
      '<dt>Source</dt><dd>' + esc(b.origin) + (b.origin_ref ? ' · ' + esc(b.origin_ref) : '') + ' · synced ' + when(b.synced_at) + '</dd><dt>Last change</dt><dd>' + when(b.updated_at) + ' by ' + esc(b.updated_by || '') + ' · v' + esc(b.version) + '</dd>' +
      (b.notes ? '<dt>Notes</dt><dd>' + esc(b.notes) + '</dd>' : '') + '</dl>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="bd-edit">Edit booking</button><button class="btn" id="bd-pay">+ Payment</button><button class="btn" id="bd-ref">+ Refund</button></div>' +
      '<div id="bd-payform"></div><h3 style="margin:16px 0 8px">Payments</h3><div id="bd-pays" class="fo-hint">Loading…</div>' +
      '<h3 style="margin:18px 0 8px">History &amp; notes</h3><div class="fo-toolbar"><input class="fo-input" id="bd-note" placeholder="Add an internal note…" maxlength="1000"><button class="btn" id="bd-addnote">Add note</button></div><ul class="fo-timeline" id="bd-hist"><li class="fo-hint">Loading…</li></ul>');
    $('#bd-edit', p).onclick = function () { p.parentNode.remove(); bookingForm(b); };
    $('#bd-pay', p).onclick = function () { payForm(p, b, 'payment'); };
    $('#bd-ref', p).onclick = function () { payForm(p, b, 'refund'); };
    $('#bd-addnote', p).onclick = function () {
      var t = $('#bd-note', p).value.trim(); if (!t) return;
      this.disabled = true; api('f.booking.note', { booking_id: b.booking_id, text: t }).then(function (j) { if (!j.ok) return toast(j.error, true); $('#bd-note', p).value = ''; history(); });
    };
    function history() {
      api('f.booking.history', { booking_id: b.booking_id }).then(function (j) {
        if (!j.ok) return;
        $('#bd-pays', p).innerHTML = j.payments.length ? '<div class="fo-tablewrap"><table class="fo-table"><tr><th>Date</th><th>Type</th><th class="num">Amount</th><th>Method</th><th>Ref</th></tr>' + j.payments.map(function (x) { return '<tr><td>' + dmy(x.date) + '</td><td>' + esc(x.type) + '</td><td class="num">' + (x.type === 'refund' ? '−' : '') + inr(num(x.amount)) + '</td><td>' + esc(x.method) + '</td><td>' + esc(x.reference) + '</td></tr>'; }).join('') + '</table></div>' : '<p class="fo-hint">No payments recorded.</p>';
        $('#bd-hist', p).innerHTML = j.history.slice().reverse().map(function (h) { return '<li><b>' + esc(h.action.replace(/_/g, ' ')) + '</b> ' + esc(prettyDetail(h.detail)) + '<small>' + when(h.ts) + ' · ' + esc(h.actor) + '</small></li>'; }).join('') || '<li class="fo-hint">No history.</li>';
        $('#bd-addnote', p).disabled = false;
      });
    }
    history();
  }
  function prettyDetail(d) {
    try { var o = JSON.parse(d); if (typeof o !== 'object') return String(o);
      return Object.keys(o).filter(function (k) { return k !== 'source'; }).map(function (k) { var v = o[k]; return k + ': ' + (Array.isArray(v) ? (v[0] === '' ? '∅' : v[0]) + ' → ' + (v[1] === '' ? '∅' : v[1]) : typeof v === 'object' ? JSON.stringify(v) : v); }).join(' · ');
    } catch (e) { return d; }
  }
  function payForm(p, b, type) {
    var box = $('#bd-payform', p);
    box.innerHTML = '<div class="fo-card" style="margin:8px 0"><h3>' + (type === 'refund' ? 'Record a refund' : 'Record a payment') + '</h3><div class="fo-form">' +
      '<label class="fo-field">Amount (₹)<input id="pf-amt" type="number" min="1" step="1" required></label><label class="fo-field">Date<input id="pf-date" type="date" value="' + today() + '"></label>' +
      '<label class="fo-field">Method<select id="pf-method"><option>UPI</option><option>Cash</option><option>Bank transfer</option><option>Card</option><option>Razorpay</option><option>OTA payout</option><option>Other</option></select></label><label class="fo-field">Reference<input id="pf-ref" maxlength="80"></label></div>' +
      '<div class="fo-msg"></div><button class="btn btn--primary" id="pf-save">Save</button> <button class="btn" id="pf-cancel">Cancel</button></div>';
    $('#pf-cancel', box).onclick = function () { box.innerHTML = ''; };
    $('#pf-save', box).onclick = function () {
      var btn = this; btn.disabled = true;
      api('f.payment.add', { booking_id: b.booking_id, type: type, amount: $('#pf-amt', box).value, date: $('#pf-date', box).value, method: $('#pf-method', box).value, reference: $('#pf-ref', box).value })
        .then(function (j) { if (!j.ok) { btn.disabled = false; $('.fo-msg', box).textContent = j.error; return; } toast(type === 'refund' ? 'Refund recorded' : 'Payment recorded'); p.parentNode.remove(); load(true).then(function () { openBooking(b.booking_id); }); });
    };
  }
  // ---------- create / edit ----------
  var CHANNEL_CHOICES = ['Direct · WhatsApp', 'Direct · Phone', 'Direct · Website', 'Walk-in', 'Direct', 'Booking.com', 'Airbnb', 'MakeMyTrip', 'Goibibo', 'Agoda', 'Other'];
  function bookingForm(b) {
    var isNew = !b; b = b || { status: 'confirmed', channel: 'Direct · WhatsApp', adults: 2, created_at: today() };
    var props = S.data.properties;
    function f(name, label, type, val, attrs) { return '<label class="fo-field' + (attrs && attrs.full ? ' full' : '') + '">' + esc(label) + '<input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '"' + (attrs && attrs.extra ? ' ' + attrs.extra : '') + '></label>'; }
    function s(name, label, opts, val) { return '<label class="fo-field">' + esc(label) + '<select name="' + name + '">' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select></label>'; }
    var p = drawer('<div class="fo-drawer__head"><h2 class="serif" style="font-size:24px">' + (isNew ? 'New booking' : 'Edit ' + esc(b.booking_id)) + '</h2><button class="fo-iconbtn" data-close aria-label="Close">' + icon('x') + '</button></div>' +
      '<form class="fo-form" novalidate>' +
      f('guest_name', 'Guest name', 'text', b.guest_name, { extra: 'maxlength="80" required' }) +
      (isNew ? f('guest_phone', 'Guest mobile', 'tel', '', { extra: 'maxlength="20"' }) + f('guest_email', 'Guest email', 'email', '', { extra: 'maxlength="120"' }) : '') +
      s('property_id', 'Villa', [['', 'Choose a villa']].concat(props.map(function (x) { return [x.property_id, x.name]; })), b.property_id) +
      f('checkin', 'Check-in', 'date', b.checkin) + f('checkout', 'Check-out', 'date', b.checkout) +
      f('adults', 'Adults', 'number', b.adults, { extra: 'min="0" max="40"' }) + f('children', 'Children', 'number', b.children, { extra: 'min="0" max="40"' }) +
      s('status', 'Status', [['tentative', 'Tentative (held, not confirmed)'], ['confirmed', 'Confirmed'], ['cancelled', 'Cancelled'], ['no_show', 'No-show'], ['void', 'Void (test or duplicate: excluded from all figures)']], b.status) +
      s('channel', 'Booking channel (where it was booked)', uniq(CHANNEL_CHOICES.concat([b.channel])), b.channel) +
      f('external_id', 'Platform booking ID', 'text', b.external_id, { extra: 'maxlength="60"' }) + f('source_account', 'Platform account (if several)', 'text', b.source_account, { extra: 'maxlength="60"' }) +
      f('gross_amount', 'Booking amount ₹ (what the guest pays)', 'number', b.gross_amount, { extra: 'min="0" step="1"' }) + f('discount', 'Discount ₹', 'number', b.discount, { extra: 'min="0" step="1"' }) +
      f('taxes', 'Taxes included ₹ (if known)', 'number', b.taxes, { extra: 'min="0" step="1"' }) + f('commission', 'OTA commission ₹ (if known)', 'number', b.commission, { extra: 'min="0" step="1"' }) +
      f('retained_amount', 'Cancellation fee kept ₹', 'number', b.retained_amount, { extra: 'min="0" step="1"' }) + f('created_at', 'Booked on', 'date', M.dateOf(b.created_at)) +
      s('acquisition_source', 'Found us via (marketing)', ['', 'Google search', 'Google Maps', 'Instagram / Facebook', 'MakeMyTrip / Goibibo', 'Booking.com', 'Airbnb', 'Friend or family', 'Stayed before', 'Website', 'Other'].concat(b.acquisition_source && CHANNEL_CHOICES.indexOf(b.acquisition_source) < 0 ? [b.acquisition_source] : []).filter(function (v, i, a) { return a.indexOf(v) === i; }), b.acquisition_source || '') +
      s('payment_channel', 'Paid through', ['', 'UPI', 'Cash', 'Bank transfer', 'Card', 'Razorpay', 'On the booking site', 'Other'].concat(b.payment_channel ? [b.payment_channel] : []).filter(function (v, i, a) { return a.indexOf(v) === i; }), b.payment_channel || '') +
      s('comms_channel', 'Talked on', ['', 'WhatsApp', 'Phone', 'Email', 'OTA messages', 'In person'], b.comms_channel || '') +
      '<label class="fo-field full">Notes<textarea name="notes" rows="3" maxlength="1000">' + esc(b.notes || '') + '</textarea></label>' +
      '<div class="full"><div class="fo-msg" id="bf-msg"></div><button class="btn btn--primary" type="submit">' + (isNew ? 'Create booking' : 'Save changes') + '</button> <button class="btn" type="button" data-close>Cancel</button>' +
      '<p class="fo-hint">The villa is checked for overlapping bookings and maintenance blocks before saving. Every change is kept in the booking history.</p></div></form>');
    var form = $('form', p);
    form.onsubmit = function (e) {
      e.preventDefault();
      var o = {}; $$('input,select,textarea', form).forEach(function (el) { o[el.name] = el.value; });
      if (!o.guest_name.trim()) return ($('#bf-msg').textContent = 'Enter the guest name.');
      if (!isNew) { o.booking_id = b.booking_id; o.version = b.version; delete o.guest_phone; delete o.guest_email; }
      var btn = $('button[type=submit]', form); btn.disabled = true;
      api('f.booking.save', { booking: o }).then(function (j) {
        btn.disabled = false;
        if (!j.ok) {
          $('#bf-msg').innerHTML = esc(j.error) + (j.conflicts ? '<br>' + j.conflicts.map(function (c) { return c.kind === 'block' ? 'Blocked ' + dm(c.from) + ' → ' + dm(c.to) + ' (' + esc(c.reason) + ')' : esc(c.guest || c.id) + ' · ' + esc(c.channel) + ' · ' + dm(c.from) + ' → ' + dm(c.to); }).join('<br>') : '');
          return;
        }
        toast(j.unchanged ? 'No changes' : isNew ? 'Booking created' : 'Booking saved'); p.parentNode.remove();
        load(true).then(function () { openBooking(j.booking.booking_id); });
      }).catch(function (err) { btn.disabled = false; $('#bf-msg').textContent = err.message; });
    };
  }

  // ---------- calendar ----------
  function bookingCalendar(body) {
    var t = today(); if (!S.calMonth) S.calMonth = t.slice(0, 7);
    var first = S.calMonth + '-01', last = M.addDays(M.addDays(first, 32).slice(0, 7) + '-01', -1), n = M.days(first, last);
    var props = S.data.properties.filter(function (p) { return S.property === 'all' || p.property_id === S.property; });
    var dates = []; for (var i = 0; i < n; i++) dates.push(M.addDays(first, i));
    var label = new Date(first + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    var occ = M.compute(S.data, first, last, filt());
    body.innerHTML = '<div class="fo-toolbar"><button class="btn" id="cal-prev">‹</button><b style="min-width:150px;text-align:center">' + esc(label) + '</b><button class="btn" id="cal-next">›</button><button class="btn btn--sm" id="cal-today">This month</button>' +
      '<span class="fo-hint">Occupancy ' + pct(occ.occupancy, 0) + ' · ' + occ.occupied_nights + '/' + occ.available_nights + ' villa-nights · <span class="fo-badge">direct</span> <span class="fo-badge" style="background:#5B7F95;color:#fff">OTA</span> <span class="fo-badge fo-badge--gold">tentative</span> ▨ blocked</span></div>' +
      '<div class="fo-cal"><table><thead><tr><th class="villa">Villa</th>' + dates.map(function (d) { var w = new Date(d + 'T00:00:00Z').getUTCDay(); return '<th class="' + (w === 5 || w === 6 ? 'we' : '') + '" title="' + dmy(d) + '">' + Number(d.slice(8)) + '<br><small>' + 'SMTWTFS'[w] + '</small></th>'; }).join('') + '</tr></thead><tbody>' +
      props.map(function (p) {
        return '<tr><th class="villa">' + esc(p.name) + '</th>' + dates.map(function (d) {
          var b = S.data.bookings.filter(function (x) { return x.property_id === p.property_id && ['confirmed', 'tentative'].indexOf(x.status) >= 0 && x.checkin <= d && x.checkout > d; })[0];
          var bl = S.data.blocks.filter(function (x) { return x.property_id === p.property_id && x.start <= d && x.end > d; })[0];
          var cls = (d === t ? 'today ' : '');
          if (b) return '<td class="' + cls + 'bk' + (M.isDirect(b.channel, S.data.channels) ? '' : ' ota') + (b.status === 'tentative' ? ' tent' : '') + '" data-id="' + esc(b.booking_id) + '" title="' + esc((b.guest_name || 'Guest') + ' · ' + b.channel + ' · ' + b.checkin + ' → ' + b.checkout) + '">' + (b.checkin === d ? esc((b.guest_name || '•').split(' ')[0].slice(0, 4)) : '') + '</td>';
          if (bl) return '<td class="' + cls + 'blk" title="' + esc(bl.reason) + '"></td>';
          return '<td class="' + cls + '"></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div><p class="fo-hint">Click a booking to open it. Cancelled and void bookings are not shown.</p>';
    function shift(m) { var d = new Date(S.calMonth + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + m); S.calMonth = d.toISOString().slice(0, 7); bookingCalendar(body); }
    $('#cal-prev').onclick = function () { shift(-1); }; $('#cal-next').onclick = function () { shift(1); }; $('#cal-today').onclick = function () { S.calMonth = t.slice(0, 7); bookingCalendar(body); };
    $$('td[data-id]', body).forEach(function (td) { td.onclick = function () { openBooking(td.dataset.id); }; });
  }

  // ---------- reconciliation ----------
  function reconcileCenter(body) {
    var ex = S.data.exceptions, imports = S.data.imports || [];
    var totals = imports.reduce(function (s, i) { ['rows', 'created', 'matched', 'unchanged', 'exceptions', 'failed'].forEach(function (k) { s[k] = (s[k] || 0) + num(i[k]); }); return s; }, {});
    var open = ex.filter(function (e) { return e.status === 'open'; }), byType = {};
    open.forEach(function (e) { byType[e.type] = (byType[e.type] || 0) + 1; });
    var tiles = [['Imported records', totals.rows || 0, 'Rows read across all imports'], ['New bookings', totals.created || 0, 'Created from imports'], ['Matched', (totals.matched || 0) + (totals.unchanged || 0), 'Already in the ledger'],
      ['Duplicate attempts', byType.duplicate_attempt || 0], ['Suspected duplicates', byType.suspected_duplicate || 0], ['Status mismatches', byType.status_mismatch || 0, 'Detected through source changes for now'],
      ['Amount discrepancies', byType.amount_discrepancy || 0], ['Payment / refund discrepancies', (byType.payment_discrepancy || 0) + (byType.refund_discrepancy || 0)], ['Missing source IDs', byType.missing_source_id || 0],
      ['Failed imports', byType.failed_import || 0], ['Inventory conflicts', byType.inventory_conflict || 0], ['Unresolved (all)', open.length]];
    var types = uniq(ex.map(function (e) { return e.type; }));
    body.innerHTML = '<div class="fo-grid fo-grid--kpi" style="margin-bottom:14px">' + tiles.map(function (t) { return '<div class="fo-card"><div class="fo-kpi__label">' + esc(t[0]) + '</div><div class="fo-kpi__value">' + t[1] + '</div>' + (t[2] ? '<div class="fo-hint">' + esc(t[2]) + '</div>' : '') + '</div>'; }).join('') + '</div>' +
      '<div class="fo-toolbar">' + sel('rc-status', [['open', 'Open'], ['resolved', 'Resolved'], ['ignored', 'Ignored'], ['all', 'All']], S.exFilter) + sel('rc-type', [['all', 'All types']].concat(types.map(function (t) { return [t, exLabel(t)]; })), S.exType || 'all') +
      '<button class="btn btn--primary" id="rc-sync">Sync e-check-ins &amp; re-check now</button><button class="btn" id="rc-csv">Export CSV</button></div><div id="rc-list"></div>' +
      '<h3 style="margin:22px 0 8px">Import history</h3>' + (imports.length ? '<div class="fo-tablewrap"><table class="fo-table"><tr><th>When</th><th>Source</th><th>File</th><th class="num">Rows</th><th class="num">New</th><th class="num">Matched</th><th class="num">Unchanged</th><th class="num">Flags</th><th class="num">Failed</th><th>By</th></tr>' +
        imports.slice().reverse().map(function (i) { return '<tr><td>' + when(i.ts) + '</td><td>' + esc(i.source) + '</td><td>' + esc(i.file) + '</td><td class="num">' + esc(i.rows) + '</td><td class="num">' + esc(i.created) + '</td><td class="num">' + esc(i.matched) + '</td><td class="num">' + esc(i.unchanged) + '</td><td class="num">' + esc(i.exceptions) + '</td><td class="num">' + esc(i.failed) + '</td><td>' + esc(i.actor) + '</td></tr>'; }).join('') + '</table></div>' : '<div class="fo-empty">No imports yet.</div>');
    function list() {
      var rows = ex.filter(function (e) { return (S.exFilter === 'all' || e.status === S.exFilter) && (!S.exType || S.exType === 'all' || e.type === S.exType); }).sort(function (a, b) { return sevRank(b.severity) - sevRank(a.severity) || (a.created_at < b.created_at ? 1 : -1); });
      $('#rc-list').innerHTML = rows.length ? '<div class="fo-tablewrap"><table class="fo-table"><tr><th>Issue</th><th>Booking</th><th>Details</th><th>Raised</th><th></th></tr>' + rows.map(function (e) {
        var bk = S.data.bookings.filter(function (b) { return b.booking_id === e.booking_id; })[0];
        return '<tr><td><span class="fo-badge ' + sevClass(e.severity) + '">' + esc(e.severity) + '</span><br><b>' + esc(exLabel(e.type)) + '</b></td><td>' + (bk ? '<button class="fo-linkbtn" data-open="' + esc(bk.booking_id) + '">' + esc(bk.guest_name || bk.booking_id) + '</button><br><small class="fo-hint">' + esc(bk.booking_id) + '</small>' : '<small class="fo-hint">' + esc(e.origin_ref || '—') + '</small>') + '</td>' +
          '<td>' + esc(e.detail) + (e.type === 'source_changed' ? sourceDiff(e) : '') + (e.status !== 'open' ? '<br><small class="fo-hint">' + esc(e.status) + ' ' + when(e.resolved_at) + ' by ' + esc(e.resolved_by) + (e.resolution ? ': ' + esc(e.resolution) : '') + '</small>' : '') + '</td><td>' + when(e.created_at) + '</td>' +
          '<td style="white-space:nowrap">' + (e.status === 'open' ? (e.type === 'source_changed' ? '<button class="btn btn--sm btn--primary" data-ex="' + esc(e.exception_id) + '" data-apply="source">Apply source</button> <button class="btn btn--sm" data-ex="' + esc(e.exception_id) + '" data-apply="keep">Keep ledger</button>' : '<button class="btn btn--sm btn--primary" data-ex="' + esc(e.exception_id) + '" data-res="resolved">Resolved</button> <button class="btn btn--sm" data-ex="' + esc(e.exception_id) + '" data-res="ignored">Ignore</button>') : '') + '</td></tr>';
      }).join('') + '</table></div>' : '<div class="fo-empty">Nothing here. ' + (S.exFilter === 'open' ? 'All imports reconcile cleanly. 🙏' : '') + '</div>';
      $$('[data-open]', body).forEach(function (b) { b.onclick = function () { openBooking(b.dataset.open); }; });
      $$('[data-ex]', body).forEach(function (b) {
        b.onclick = function () {
          var note = prompt(b.dataset.apply === 'source' ? 'Apply the new source values to the booking. Optional note:' : b.dataset.apply === 'keep' ? 'Keep the ledger values. Optional note:' : 'What did you do / why? (kept in the audit log)', '');
          if (note === null) return;
          b.disabled = true;
          api('f.exception.resolve', { exception_id: b.dataset.ex, resolution: b.dataset.res, apply: b.dataset.apply, note: note }).then(function (j) { if (!j.ok) { b.disabled = false; return toast(j.error, true); } toast('Updated'); load(true); });
        };
      });
    }
    list();
    $('#rc-status').onchange = function () { S.exFilter = this.value; list(); };
    $('#rc-type').onchange = function () { S.exType = this.value; list(); };
    $('#rc-sync').onclick = function () {
      var b = this; b.disabled = true; b.textContent = 'Syncing…';
      api('f.sync').then(function (j) { if (!j.ok) { b.disabled = false; return toast(j.error, true); } var r = j.result; toast('Synced: ' + r.created + ' new, ' + r.matched + ' matched, ' + r.unchanged + ' unchanged, ' + r.exceptions + ' new flags'); load(true); });
    };
    $('#rc-csv').onclick = function () { csvDownload('ap-villas-reconciliation-' + today(), ['exception_id', 'type', 'severity', 'booking_id', 'origin_ref', 'detail', 'status', 'created_at', 'resolved_at', 'resolved_by', 'resolution'], ex.map(function (e) { return [e.exception_id, e.type, e.severity, e.booking_id, e.origin_ref, e.detail, e.status, e.created_at, e.resolved_at, e.resolved_by, e.resolution]; })); };
  }
  function sourceDiff(e) {
    try { var d = JSON.parse(e.data || '{}'), a = d.before || {}, b = d.after || {};
      var keys = Object.keys(b).filter(function (k) { return String(a[k]) !== String(b[k]); });
      return keys.length ? '<br><small>' + keys.map(function (k) { return esc(k) + ': ' + esc(a[k] == null ? '∅' : a[k]) + ' → <b>' + esc(b[k]) + '</b>'; }).join(' · ') + '</small>' : '';
    } catch (x) { return ''; }
  }

  // ---------- import ----------
  var FIELDS = [['external_id', 'Platform booking ID', /book(ing)?\s*(number|no|id|ref)|confirmation|reservation\s*(id|number|code)|^id$|code/i],
    ['guest_name', 'Guest name', /guest|name|booker/i], ['property', 'Villa / listing', /listing|property|unit|room|villa|accommodation/i],
    ['checkin', 'Check-in', /arrival|check.?in|start\s*date|from/i], ['checkout', 'Check-out', /departure|check.?out|end\s*date|to$/i],
    ['gross_amount', 'Amount (guest paid)', /price|total|amount|gross|revenue|payout|earnings/i], ['commission', 'Commission', /commission|service\s*fee|host\s*fee/i],
    ['taxes', 'Taxes', /tax|gst/i], ['status', 'Status', /status/i], ['created_at', 'Booked on', /booked|booking\s*date|created|reservation\s*date/i],
    ['adults', 'Adults', /adult|guests?\s*count|persons|people/i], ['children', 'Children', /child|kid/i], ['phone', 'Phone', /phone|mobile/i], ['email', 'Email', /e-?mail/i]];
  function importView(body) {
    body.innerHTML = (S.importNote ? '<div class="fo-note" style="margin-bottom:14px"><b>Last import</b> · ' + esc(S.importNote) + ' <a href="#/bookings/reconcile">Review flags →</a></div>' : '') + '<div class="fo-grid fo-grid--2"><div class="fo-card"><h3>E-check-in sheet <small>automatic, hourly</small></h3><p>Every guest e-check-in becomes (or matches) a booking. Last sync: <b>' + ago(S.data.lastSync) + '</b>.</p><button class="btn btn--primary" id="im-sync">Sync now</button>' +
      '<p class="fo-hint" style="margin-top:10px">The check-in form does not ask when the booking was made, so those bookings use the check-in submission time as a stand-in (marked “≈ e-check-in”) and are left out of lead-time figures.</p></div>' +
      '<div class="fo-card"><h3>OTA export (CSV) <small>Booking.com, Airbnb, MakeMyTrip…</small></h3><p class="fo-hint">There is no live connection to the booking platforms (their APIs need partner approval). Download the reservations export from the extranet and import it here: re-importing the same file never creates duplicates.</p>' +
      '<div class="fo-form"><label class="fo-field">Platform<select id="im-ch">' + ['Booking.com', 'Airbnb', 'MakeMyTrip', 'Goibibo', 'Agoda', 'Other'].map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></label><label class="fo-field">Account label (optional)<input id="im-acc" placeholder="e.g. Divinestay listing" maxlength="60"></label>' +
      '<label class="fo-field full">CSV file<input type="file" id="im-file" accept=".csv,text/csv"></label></div></div></div><div id="im-map" style="margin-top:14px"></div>';
    $('#im-sync').onclick = function () { var b = this; b.disabled = true; b.textContent = 'Syncing…'; api('f.sync').then(function (j) { b.disabled = false; b.textContent = 'Sync now'; if (!j.ok) return toast(j.error, true); var r = j.result; toast(r.created + ' new, ' + r.matched + ' matched, ' + r.unchanged + ' unchanged'); load(true); }); };
    $('#im-file').onchange = function () {
      var file = this.files[0]; if (!file) return;
      if (file.size > 3e6) return toast('That file is over 3 MB.', true);
      var rd = new FileReader(); rd.onload = function () { mapping(parseCsv(String(rd.result)), file.name); }; rd.readAsText(file);
    };
    function mapping(rows, name) {
      if (rows.length < 2) return toast('No rows found in the file.', true);
      var head = rows[0], data = rows.slice(1).filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
      var guess = {}; FIELDS.forEach(function (fd) { var i = -1; head.forEach(function (h, j) { if (i < 0 && fd[2].test(h) && Object.keys(guess).every(function (k) { return guess[k] !== j; })) i = j; }); guess[fd[0]] = i; });
      var box = $('#im-map');
      box.innerHTML = '<div class="fo-card"><h3>Match the columns <small>' + esc(name) + ' · ' + data.length + ' rows</small></h3><div class="fo-map">' + FIELDS.map(function (fd) {
        return '<label>' + esc(fd[1]) + '</label><select data-f="' + fd[0] + '"><option value="-1">— not in file —</option>' + head.map(function (h, j) { return '<option value="' + j + '"' + (guess[fd[0]] === j ? ' selected' : '') + '>' + esc(h) + '</option>'; }).join('') + '</select>';
      }).join('') + '</div><h3 style="margin-top:14px">Preview</h3><div id="im-prev"></div><div class="fo-msg" id="im-msg"></div><button class="btn btn--primary" id="im-go">Import ' + data.length + ' rows</button></div>';
      function mapped() {
        var m = {}; $$('[data-f]', box).forEach(function (s) { m[s.dataset.f] = Number(s.value); });
        return data.map(function (r) { var o = {}; Object.keys(m).forEach(function (k) { if (m[k] >= 0) o[k] = String(r[m[k]] == null ? '' : r[m[k]]).trim(); }); ['gross_amount', 'commission', 'taxes'].forEach(function (k) { if (o[k]) o[k] = o[k].replace(/[^\d.\-]/g, ''); }); return o; });
      }
      function preview() { var m = mapped().slice(0, 5); $('#im-prev').innerHTML = '<div class="fo-tablewrap"><table class="fo-table"><tr>' + FIELDS.map(function (f) { return '<th>' + esc(f[1]) + '</th>'; }).join('') + '</tr>' + m.map(function (o) { return '<tr>' + FIELDS.map(function (f) { return '<td>' + esc(o[f[0]] || '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</table></div>'; }
      preview(); $$('[data-f]', box).forEach(function (s) { s.onchange = preview; });
      $('#im-go').onclick = function () {
        var rows2 = mapped(), msg = $('#im-msg');
        if (!rows2.every(function (o) { return o.checkin && o.checkout; })) { msg.textContent = 'Check-in and check-out columns are required.'; return; }
        var b = this; b.disabled = true; b.textContent = 'Importing…';
        api('f.import.rows', { channel: $('#im-ch').value, account: $('#im-acc').value, file: name, rows: rows2 }).then(function (j) {
          b.disabled = false; b.textContent = 'Import again';
          if (!j.ok) { msg.textContent = j.error; return; }
          var r = j.result, text = name + ': ' + r.created + ' new bookings, ' + (r.matched + r.unchanged) + ' already in the ledger, ' + r.failed + ' failed, ' + r.exceptions + ' items flagged for review.';
          S.importNote = text; load(true).then(function () { toast(text, false, 9000); });
        });
      };
    }
  }
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false, delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    text = text.replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true; else if (ch === delim) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // ---------- blocks ----------
  function blocksView(body) {
    var bl = S.data.blocks.slice().sort(function (a, b) { return a.start < b.start ? 1 : -1; });
    body.innerHTML = '<div class="fo-grid fo-grid--2"><div class="fo-card"><h3>Block a villa <small>maintenance or owner use</small></h3><div class="fo-form">' +
      '<label class="fo-field">Villa<select id="bk-p">' + S.data.properties.map(function (p) { return '<option value="' + esc(p.property_id) + '">' + esc(p.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="fo-field">Reason<input id="bk-r" value="Maintenance" maxlength="120"></label><label class="fo-field">From (first blocked night)<input type="date" id="bk-s"></label><label class="fo-field">Until (first free night)<input type="date" id="bk-e"></label></div>' +
      '<div class="fo-msg" id="bk-msg"></div><button class="btn btn--primary" id="bk-add">Add block</button><p class="fo-hint">Blocked nights are taken out of available villa-nights, so occupancy and RevPAR stay honest.</p></div>' +
      '<div class="fo-card"><h3>Blocks</h3>' + (bl.length ? '<div class="fo-tablewrap"><table class="fo-table"><tr><th>Villa</th><th>Dates</th><th>Reason</th><th></th></tr>' + bl.map(function (x) { return '<tr><td>' + esc(propName(x.property_id)) + '</td><td>' + dm(x.start) + ' → ' + dm(x.end) + '</td><td>' + esc(x.reason) + '</td><td><button class="btn btn--sm btn--danger" data-del="' + esc(x.block_id) + '">Remove</button></td></tr>'; }).join('') + '</table></div>' : '<div class="fo-empty">No blocks.</div>') + '</div></div>';
    $('#bk-add').onclick = function () {
      var b = this; b.disabled = true;
      api('f.block.save', { property_id: $('#bk-p').value, start: $('#bk-s').value, end: $('#bk-e').value, reason: $('#bk-r').value }).then(function (j) {
        b.disabled = false; if (!j.ok) { $('#bk-msg').innerHTML = esc(j.error) + (j.conflicts ? '<br>' + j.conflicts.map(function (c) { return esc(c.guest || c.id) + ' ' + dm(c.from) + ' → ' + dm(c.to); }).join('<br>') : ''); return; }
        toast('Block added'); load(true);
      });
    };
    $$('[data-del]', body).forEach(function (b) { b.onclick = function () { if (!confirm('Remove this block?')) return; api('f.block.delete', { block_id: b.dataset.del }).then(function (j) { if (!j.ok) return toast(j.error, true); load(true); }); }; });
  }

  // ------------------------------------------------------------ 3. Booking analytics ------------------------------------------------------------
  function viewAnalytics(page) {
    var r = currentRange(), D = S.data, f = filt(), g = S.grain;
    var s = M.series(D, r.from, r.to, g, f), labels = s.map(function (x) { return g === 'day' ? dm(x.key) : g === 'week' ? dm(x.key) : x.key; });
    var ch = M.breakdown(D, r.from, r.to, 'channel', f), lt = M.leadTimes(D, r.from, r.to, f), los = M.stayLengths(D, r.from, r.to, f), wk = M.weekendSplit(D, r.from, r.to, f), bp = M.byProperty(D, r.from, r.to);
    page.innerHTML = hello('Booking analytics', esc(dmy(r.from)) + ' – ' + esc(dmy(r.to)) + '. Click any bar to see the bookings behind it.') +
      '<div class="fo-toolbar">Group by ' + sel('an-g', [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']], g) + '<span class="fo-hint">Pick a longer date range at the top (e.g. last 12 months) for trends.</span></div>' +
      '<div class="fo-grid fo-grid--2">' +
      chartCard('an-1', 'Bookings made and booking value', 'by booking date') + chartCard('an-2', 'Revenue and ADR', 'by stay date') +
      chartCard('an-3', 'Occupancy', 'by stay date') + chartCard('an-4', 'Direct vs OTA bookings', 'by booking date') +
      chartCard('an-5', 'Channel mix', 'booking value, by booking date') + chartCard('an-6', 'Revenue by villa', 'by stay date') +
      chartCard('an-7', 'Lead time (days from booking to arrival)', 'real booking dates only') + chartCard('an-8', 'Length of stay', 'arrivals in period') +
      chartCard('an-9', 'Cancellations', 'by booking date') +
      '<div class="fo-card"><h3>Weekend vs weekday <small>Fri &amp; Sat nights = weekend</small></h3>' +
      '<div class="fo-tablewrap"><table class="fo-table"><tr><th></th><th class="num">Occupancy</th><th class="num">ADR</th><th class="num">Revenue</th><th class="num">Nights</th></tr>' + ['weekend', 'weekday'].map(function (k) { var x = wk[k]; return '<tr><td><b>' + k + '</b></td><td class="num">' + pct(x.occupancy) + '</td><td class="num">' + inr(x.adr) + '</td><td class="num">' + inr(x.revenue) + '</td><td class="num">' + x.occupied + '/' + x.available + '</td></tr>'; }).join('') + '</table></div></div>' +
      '</div><div class="fo-card" style="margin-top:14px"><h3>Channel contribution <small>bookings made in period</small><span class="fo-card__tools"><button class="btn btn--sm" id="an-chcsv">CSV</button></span></h3>' + channelTable(ch) + '</div>';
    $('#an-g').onchange = function () { S.grain = this.value; savePrefs(); renderPage(); };
    var clickMade = function (i) { var b = bucketRange(s[i].key, g, r); drill('made', b.from, b.to); }, clickStay = function (i) { var b = bucketRange(s[i].key, g, r); drill('stay', b.from, b.to); };
    C.combo($('#an-1'), { labels: labels, kind: 'n', rightKind: 'inr', onClick: clickMade, series: [{ name: 'Bookings', values: s.map(function (x) { return x.bookings; }) }, { name: 'Booking value', values: s.map(function (x) { return x.value; }), type: 'line', axis: 'right', color: '#C9A24F' }] });
    C.combo($('#an-2'), { labels: labels, kind: 'inr', rightKind: 'inr', onClick: clickStay, series: [{ name: 'Net accommodation revenue', values: s.map(function (x) { return x.revenue; }) }, { name: 'ADR', values: s.map(function (x) { return x.adr; }), type: 'line', axis: 'right', color: '#C9A24F' }] });
    C.combo($('#an-3'), { labels: labels, kind: 'pct', onClick: clickStay, series: [{ name: 'Occupancy', values: s.map(function (x) { return x.occupancy; }), type: 'line' }] });
    C.combo($('#an-4'), { labels: labels, kind: 'n', stacked: true, onClick: clickMade, series: [{ name: 'Direct', values: s.map(function (x) { return x.direct; }) }, { name: 'OTA', values: s.map(function (x) { return x.ota; }), color: '#5B7F95' }, { name: 'Other / unknown', values: s.map(function (x) { return x.other; }), color: '#C9A24F' }] });
    C.donut($('#an-5'), ch.map(function (x) { return { label: x.key, value: x.value }; }), { kind: 'inr', centerLabel: 'booking value', onClick: function (it) { drill('made', r.from, r.to, { channel: it.label }); } });
    C.hbars($('#an-6'), bp.map(function (p) { return { label: p.name, value: p.revenue, sub: pct(p.occupancy, 0) + ' occ.' }; }), { kind: 'inr' });
    C.combo($('#an-7'), { labels: ['0–2', '3–7', '8–14', '15–30', '31–60', '61–90', '90+'], kind: 'n', series: [{ name: 'Bookings', values: M.histogram(lt.real, [['', 0, 2], ['', 3, 7], ['', 8, 14], ['', 15, 30], ['', 31, 60], ['', 61, 90], ['', 91, 1e9]]).map(function (x) { return x.count; }) }], empty: lt.proxy.length ? 'Only e-check-in (proxy) dates so far: add the real booking date to see lead times.' : 'No bookings in this period.' });
    C.combo($('#an-8'), { labels: ['1 night', '2', '3', '4–6', '7+'], kind: 'n', series: [{ name: 'Stays', values: M.histogram(los, [['', 1, 1], ['', 2, 2], ['', 3, 3], ['', 4, 6], ['', 7, 1e9]]).map(function (x) { return x.count; }) }] });
    C.combo($('#an-9'), { labels: labels, kind: 'n', rightKind: 'pct', onClick: clickMade, series: [{ name: 'Cancelled', values: s.map(function (x) { return x.cancelled; }), color: '#B4402A' }, { name: 'Cancellation rate', values: s.map(function (x) { return x.bookings ? x.cancelled / x.bookings : null; }), type: 'line', axis: 'right', color: '#C9A24F' }] });
    $$('[data-svg]', page).forEach(function (b) { b.onclick = function () { C.exportSvg($('#' + b.dataset.svg), b.dataset.svg + '-' + r.from + '-' + r.to); }; });
    $('#an-chcsv').onclick = function () { csvDownload('channels-' + r.from + '-' + r.to, ['channel', 'bookings', 'booking_value', 'avg_value', 'cancelled', 'cancellation_rate', 'nights', 'commission', 'bookings_with_unknown_commission'], ch.map(function (x) { return [x.key, x.bookings, x.value, x.bookings ? (x.value / x.bookings).toFixed(0) : '', x.cancelled, x.bookings ? (x.cancelled / x.bookings).toFixed(3) : '', x.nights, x.commission, x.commission_unknown]; })); };
  }
  function chartCard(id, title, sub) { return '<div class="fo-card"><h3>' + esc(title) + ' <small>' + esc(sub) + '</small><span class="fo-card__tools"><button class="btn btn--sm" data-svg="' + id + '">SVG</button></span></h3><div class="fo-chartbox" id="' + id + '"></div></div>'; }
  function channelTable(ch) {
    if (!ch.length) return '<div class="fo-empty">No bookings made in this period.</div>';
    return '<div class="fo-tablewrap"><table class="fo-table"><tr><th>Channel</th><th class="num">Bookings</th><th class="num">Booking value</th><th class="num">Avg value</th><th class="num">Cancel rate</th><th class="num">Nights</th><th class="num">Commission</th></tr>' +
      ch.map(function (x) { return '<tr><td><b>' + esc(x.key) + '</b>' + (M.isDirect(x.key, S.data.channels) ? ' <span class="fo-badge">direct</span>' : '') + '</td><td class="num">' + x.bookings + '</td><td class="num">' + inr(x.value) + '</td><td class="num">' + inr(x.bookings ? x.value / x.bookings : null) + '</td><td class="num">' + pct(x.bookings ? x.cancelled / x.bookings : null, 0) + '</td><td class="num">' + x.nights + '</td><td class="num">' + (x.commission_unknown ? (x.commission ? inr(x.commission) + ' + ' : '') + '<span class="fo-hint">' + x.commission_unknown + ' unknown</span>' : inr(x.commission)) + '</td></tr>'; }).join('') + '</table></div>';
  }

  // ------------------------------------------------------------ Property performance ------------------------------------------------------------
  function viewProperties(page) {
    var r = currentRange(), bp = M.byProperty(S.data, r.from, r.to), pr = M.previous(r.from, r.to), bpp = M.byProperty(S.data, pr.from, pr.to);
    page.innerHTML = hello('Property performance', esc(dmy(r.from)) + ' – ' + esc(dmy(r.to)) + ' · stay-date basis, villa-nights') +
      '<div class="fo-grid fo-grid--2">' + chartCard('pp-1', 'Revenue by villa', 'stay date') + chartCard('pp-2', 'Occupancy by villa', 'stay date') + '</div>' +
      '<div class="fo-card" style="margin-top:14px"><h3>Villa scorecard</h3><div class="fo-tablewrap"><table class="fo-table"><tr><th>Villa</th><th class="num">Available</th><th class="num">Occupied</th><th class="num">Occupancy</th><th class="num">vs previous</th><th class="num">ADR</th><th class="num">RevPAR</th><th class="num">Revenue</th><th class="num">Arrivals</th></tr>' +
      bp.map(function (p, i) { var q = bpp[i] || {}; var d = p.occupancy != null && q.occupancy != null ? (p.occupancy - q.occupancy) * 100 : null; return '<tr class="fo-row" data-p="' + esc(p.property_id) + '"><td><b>' + esc(p.name) + '</b></td><td class="num">' + p.available + '</td><td class="num">' + p.occupied + '</td><td class="num">' + pct(p.occupancy) + '</td><td class="num ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat') + '">' + (d == null ? '—' : (d > 0 ? '+' : '') + d.toFixed(1) + ' pts') + '</td><td class="num">' + inr(p.adr) + '</td><td class="num">' + inr(p.revpar) + '</td><td class="num">' + inr(p.revenue) + '</td><td class="num">' + p.arrivals + '</td></tr>'; }).join('') + '</table></div>' +
      '<p class="fo-hint">Profit per villa needs costs per villa (Financial Intelligence, phase 8). Click a villa to filter the whole portal to it.</p></div>';
    C.hbars($('#pp-1'), bp.map(function (p) { return { label: p.name, value: p.revenue }; }), { kind: 'inr' });
    C.hbars($('#pp-2'), bp.map(function (p) { return { label: p.name, value: p.occupancy || 0 }; }), { kind: 'pct' });
    $$('[data-p]', page).forEach(function (tr) { tr.onclick = function () { S.property = tr.dataset.p; render(); }; });
    $$('[data-svg]', page).forEach(function (b) { b.onclick = function () { C.exportSvg($('#' + b.dataset.svg), b.dataset.svg); }; });
  }

  // ------------------------------------------------------------ Guest intelligence ------------------------------------------------------------
  function viewGuests(page) {
    var D = S.data, bk = D.bookings.filter(function (b) { return b.status !== 'void' && (S.property === 'all' || b.property_id === S.property); });
    var byGuest = {}; bk.forEach(function (b) { if (!b.guest_id) return; (byGuest[b.guest_id] = byGuest[b.guest_id] || []).push(b); });
    var gIndex = {}; D.guests.forEach(function (g) { gIndex[g.guest_id] = g; });
    var repeat = Object.keys(byGuest).filter(function (k) { return byGuest[k].filter(function (b) { return b.status === 'confirmed'; }).length > 1; });
    var src = {}; bk.forEach(function (b) { var k = b.acquisition_source || '(not recorded)'; src[k] = (src[k] || 0) + 1; });
    var states = {}; bk.forEach(function (b) { var g = gIndex[b.guest_id] || {}; var k = g.state || g.city || '(not recorded)'; states[k] = (states[k] || 0) + 1; });
    var size = bk.filter(function (b) { return b.status === 'confirmed'; }).map(function (b) { return num(b.adults) + num(b.children); }).filter(function (n) { return n > 0; });
    var known = Object.keys(byGuest).length;
    page.innerHTML = hello('Guest intelligence', 'All stays in the ledger (not limited to the date range). Guest details stay private to this portal.') +
      '<div class="fo-grid fo-grid--kpi">' + [['Guests on record', known], ['Repeat guests', repeat.length + (known ? ' · ' + pct(repeat.length / known, 0) : '')], ['Average group size', size.length ? n1(size.reduce(function (a, b) { return a + b; }, 0) / size.length) + ' people' : '—'], ['Families with children', bk.filter(function (b) { return num(b.children) > 0; }).length + ' stays']].map(function (k) { return '<div class="fo-card"><div class="fo-kpi__label">' + esc(k[0]) + '</div><div class="fo-kpi__value">' + esc(k[1]) + '</div></div>'; }).join('') + '</div>' +
      '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + chartCard('gi-1', 'How guests found us', 'marketing source, from e-check-in') + chartCard('gi-2', 'Where guests come from', 'state or city') + '</div>' +
      '<div class="fo-card" style="margin-top:14px"><h3>Repeat guests</h3>' + (repeat.length ? '<div class="fo-tablewrap"><table class="fo-table"><tr><th>Guest</th><th>Stays</th><th>Villas</th><th>Last stay</th></tr>' + repeat.map(function (k) { var list = byGuest[k], g = gIndex[k] || {}; return '<tr><td><b>' + esc(g.name || list[0].guest_name) + '</b><br><small class="fo-hint">' + esc(g.city || '') + '</small></td><td>' + list.length + '</td><td>' + esc(uniq(list.map(function (b) { return propName(b.property_id); })).join(', ')) + '</td><td>' + dmy(list.map(function (b) { return b.checkin; }).sort().pop()) + '</td></tr>'; }).join('') + '</table></div>' : '<div class="fo-empty">No repeat guests yet.</div>') + '</div>';
    C.hbars($('#gi-1'), Object.keys(src).map(function (k) { return { label: k, value: src[k] }; }).sort(function (a, b) { return b.value - a.value; }), { kind: 'n' });
    C.hbars($('#gi-2'), Object.keys(states).map(function (k) { return { label: k, value: states[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10), { kind: 'n' });
    $$('[data-svg]', page).forEach(function (b) { b.onclick = function () { C.exportSvg($('#' + b.dataset.svg), b.dataset.svg); }; });
  }

  // ------------------------------------------------------------ Operations center ------------------------------------------------------------
  function viewOps(page) {
    var t = today(), D = S.data, pi = payIndex();
    var bk = D.bookings.filter(function (b) { return b.status === 'confirmed' && (S.property === 'all' || b.property_id === S.property); });
    var days = []; for (var i = 0; i < 7; i++) days.push(M.addDays(t, i));
    var inHouse = bk.filter(function (b) { return b.checkin <= t && b.checkout > t; });
    page.innerHTML = hello('Operations center', 'Next 7 days · arrivals, departures, balances to collect and villa readiness') +
      '<div class="fo-grid fo-grid--kpi">' + [['In house now', inHouse.length + ' villas'], ['Arrivals next 7 days', bk.filter(function (b) { return b.checkin >= t && b.checkin <= days[6]; }).length], ['Departures next 7 days', bk.filter(function (b) { return b.checkout >= t && b.checkout <= days[6]; }).length], ['Open data issues', openEx().length]].map(function (k) { return '<div class="fo-card"><div class="fo-kpi__label">' + esc(k[0]) + '</div><div class="fo-kpi__value">' + esc(k[1]) + '</div></div>'; }).join('') + '</div>' +
      '<div class="fo-card" style="margin-top:14px"><h3>Day by day</h3><div class="fo-tablewrap"><table class="fo-table"><tr><th>Day</th><th>Arrivals</th><th>Departures</th><th>Occupied</th></tr>' + days.map(function (d) {
        var a = bk.filter(function (b) { return b.checkin === d; }), dep = bk.filter(function (b) { return b.checkout === d; }), occ = bk.filter(function (b) { return b.checkin <= d && b.checkout > d; }).length;
        var line = function (b) { var x = balanceOf(b, pi); return '<button class="fo-linkbtn" data-open="' + esc(b.booking_id) + '">' + esc(b.guest_name || 'Guest') + '</button> · ' + esc(propName(b.property_id)) + (x.balance > 0.5 ? ' <span class="fo-badge fo-badge--warn">collect ' + inr(x.balance) + '</span>' : ''); };
        return '<tr><td><b>' + (d === t ? 'Today' : new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })) + '</b></td><td>' + (a.map(line).join('<br>') || '<span class="fo-hint">—</span>') + '</td><td>' + (dep.map(function (b) { return esc(b.guest_name || 'Guest') + ' · ' + esc(propName(b.property_id)); }).join('<br>') || '<span class="fo-hint">—</span>') + '</td><td>' + occ + ' / ' + S.data.properties.length + '</td></tr>';
      }).join('') + '</table></div></div>' +
      '<div class="fo-card" style="margin-top:14px"><h3>Upcoming maintenance blocks</h3>' + (D.blocks.filter(function (b) { return b.end > t; }).map(function (b) { return '<div class="fo-kv"><span>' + esc(propName(b.property_id)) + '</span><span>' + dm(b.start) + ' → ' + dm(b.end) + ' · ' + esc(b.reason) + '</span></div>'; }).join('') || '<p class="fo-hint">None. <a href="#/bookings/blocks">Add a block</a></p>') + '</div>';
    $$('[data-open]', page).forEach(function (b) { b.onclick = function () { openBooking(b.dataset.open); }; });
  }

  // ------------------------------------------------------------ Reports & exports ------------------------------------------------------------
  function viewReports(page) {
    page.innerHTML = hello('Reports & exports', 'Download the ledger, print the brief. Scheduled reports arrive in phase 5.') +
      '<div class="fo-grid fo-grid--3">' +
      repCard('Bookings ledger', 'Every booking with channel, amounts, collected and balance.', 'x-b') + repCard('Payments & refunds', 'Every payment and refund with dates and methods.', 'x-p') +
      repCard('Reconciliation log', 'Every data issue raised and how it was resolved.', 'x-e') + repCard('Daily founder brief', 'Open the overview and print or save as PDF.', 'x-brief') +
      repCard('Metric definitions', 'The exact formula behind every figure in this portal.', 'x-def') +
      '<div class="fo-card"><h3>Scheduled reports <span class="fo-badge fo-badge--muted">phase 5</span></h3><p class="fo-hint">Daily brief, weekly review, monthly MIS, quarterly and annual reports, generated automatically and archived, with optional email after you approve it.</p></div></div>';
    $('[data-r=x-b]').onclick = function () { location.hash = '#/bookings/list'; setTimeout(function () { var b = $('#bl-csv'); if (b) { S.list.status = 'all'; b.click(); } }, 50); };
    $('[data-r=x-p]').onclick = function () { csvDownload('ap-villas-payments-' + today(), ['payment_id', 'booking_id', 'guest', 'date', 'type', 'amount', 'method', 'reference', 'origin', 'created_by'], S.data.payments.map(function (p) { var b = S.data.bookings.filter(function (x) { return x.booking_id === p.booking_id; })[0] || {}; return [p.payment_id, p.booking_id, b.guest_name, p.date, p.type, p.amount, p.method, p.reference, p.origin, p.created_by]; })); };
    $('[data-r=x-e]').onclick = function () { location.hash = '#/bookings/reconcile'; };
    $('[data-r=x-brief]').onclick = function () { location.hash = '#/overview'; setTimeout(function () { window.print(); }, 400); };
    $('[data-r=x-def]').onclick = function () { location.hash = '#/settings/metrics'; };
  }
  function repCard(t, d, id) { return '<div class="fo-card"><h3>' + esc(t) + '</h3><p class="fo-hint">' + esc(d) + '</p><button class="btn" data-r="' + id + '">Open</button></div>'; }

  // ------------------------------------------------------------ Integrations ------------------------------------------------------------
  function viewIntegrations(page) {
    var st = staleNote(), a = S.data.automation || {}, lastObs = (S.data.market_rates || []).map(function (r) { return r.observed_at; }).sort().pop(), ga = S.ga;
    var items = [
      ['Bookings', [
        ['E-check-in sheet → booking ledger', st ? 'part' : 'on', st ? st : 'Hourly sync · last ' + ago(S.data.lastSync), 'Real stays, amounts, payments and how guests found you.'],
        ['OTA exports (CSV)', 'on', 'Booking management → Import', 'Booking.com, Airbnb, MakeMyTrip, Goibibo, Agoda. Re-imports never duplicate. OTA live APIs are partner-only, so they are not connected.']]],
      ['Website & demand', [
        ['Google Analytics 4 (server-side)', ga && ga.connected ? 'on' : ga && !ga.connected ? 'off' : 'part', ga ? (ga.connected ? 'Connected · live site only' : ga.reason) : 'Open Website analytics to check', 'Traffic, sources, booking-intent funnel; daily traffic-growth signal for pricing.'],
        ['Google Search Console', S.gsc && S.gsc.connected ? 'on' : S.gsc ? 'off' : 'part', S.gsc ? (S.gsc.connected ? 'Connected · ' + S.gsc.site : S.gsc.reason) : 'Site verified on 23 Oct 2026. Open SEO & marketing to check the connection', 'Google searches, clicks and positions; opportunities; keyword positions every morning. Needs the one-time "View Search Console data" permission in Apps Script.'],
        ['Demand signals', (S.data.demand_signals || []).length ? 'on' : 'part', (S.data.demand_signals || []).length + ' signals', 'Website traffic growth (daily) and search/news signals from the research job.']]],
      ['Market intelligence', [
        ['Automation key', a.active ? 'on' : 'off', a.active ? 'Active · last used ' + (a.last_used ? ago(a.last_used) : 'never') : 'Not set: Settings → Automation', 'Lets the research job send market data and reports.'],
        ['Weekly research job (GitHub Actions + Claude subscription)', a.active && lastObs ? 'on' : 'part', lastObs ? 'Latest market price seen ' + dmy(lastObs) : 'No market data yet', 'Competitors, dated public prices, demand signals; monthly market intelligence report.'],
        ['Local research tools (Claude Code on the Mac)', 'on', '/research · /market-scan · /exec-summary', 'Free Search MCP (no key). Optional: Trends MCP (free 100 requests/month, needs your key).']]],
      ['Delivery & storage', [
        ['Reports', 'on', 'Archived as HTML + PDF in Drive', 'Daily/weekly/monthly/quarterly/annual and monthly market reports. Email only for types you choose.'],
        ['Data store', 'on', 'Private Google Sheet', 'All Founder OS data; never published.']]],
    ];
    page.innerHTML = hello('Integrations & automation', 'What is connected, what runs on its own, and what still needs you.') + '<div class="fo-card" id="health" style="margin-bottom:6px"><h3>System health <small>every connection and job, tested live</small><span class="fo-card__tools"><button class="btn btn--sm" id="health-run">Check again</button></span></h3><div id="health-b"><div class="fo-loading"><div class="fo-spin"></div><div>Testing every connection…</div></div></div></div>' + items.map(function (g) { return '<h3 style="margin:18px 2px 8px">' + esc(g[0]) + '</h3><div class="fo-grid fo-grid--2">' + g[1].map(function (i) { return '<div class="fo-card"><h3>' + esc(i[0]) + '<span class="fo-status ' + i[1] + '">' + (i[1] === 'on' ? 'On' : i[1] === 'part' ? 'Partial' : 'Off') + '</span></h3><p style="margin:0 0 6px"><b>' + esc(i[2]) + '</b></p><p class="fo-hint" style="margin:0">' + esc(i[3]) + '</p></div>'; }).join('') + '</div>'; }).join('');
    function health(refresh) {
      var hb = $('#health-b'); if (!hb) return;
      api('f.health', { refresh: !!refresh }).then(function (j) {
        hb = $('#health-b'); if (!hb) return;
        if (!j.ok) { hb.innerHTML = '<div class="fo-empty">' + esc(j.error) + '</div>'; return; }
        var h = j.health, pill = { ok: ['on', 'OK'], warn: ['part', 'Check'], fail: ['off', 'Problem'] };
        hb.innerHTML = '<p style="margin:0 0 10px"><b>' + h.summary.ok + ' OK</b> · ' + h.summary.warn + ' to check · ' + h.summary.fail + ' problem' + (h.summary.fail === 1 ? '' : 's') + ' <span class="fo-hint">· tested ' + esc(when(h.at)) + ' in ' + Math.round(h.ms / 100) / 10 + ' s</span></p>' +
          '<div class="fo-tablewrap"><table class="fo-table"><thead><tr><th>Area</th><th>Check</th><th>Status</th><th>Detail</th><th>What to do</th></tr></thead><tbody>' +
          h.checks.slice().sort(function (a, b) { var o = { fail: 0, warn: 1, ok: 2 }; return o[a.status] - o[b.status]; }).map(function (c) { return '<tr><td>' + esc(c.area) + '</td><td><b>' + esc(c.name) + '</b></td><td><span class="fo-status ' + pill[c.status][0] + '">' + pill[c.status][1] + '</span></td><td><small>' + esc(c.detail) + '</small></td><td><small>' + esc(c.fix || '') + '</small></td></tr>'; }).join('') + '</tbody></table></div>';
      });
    }
    health(false); $('#health-run').onclick = function () { $('#health-b').innerHTML = '<div class="fo-loading"><div class="fo-spin"></div><div>Testing every connection…</div></div>'; health(true); };
  }

  // ------------------------------------------------------------ Settings & security ------------------------------------------------------------
  function viewSettings(page) {
    var T = tabs('settings', [['security', 'Security'], ['channels', 'Channel rates'], ['reports', 'Report delivery'], ['ga4', 'Google Analytics'], ['automation', 'Automation'], ['villas', 'Villas'], ['metrics', 'Metric dictionary'], ['audit', 'Audit log']]);
    page.innerHTML = hello('Founder settings & security', 'Signed in as ' + esc(S.user.email) + ' (' + esc(S.user.role) + ')') + T.html + '<div id="st-body"></div>';
    wireTabs(page, 'settings');
    var body = $('#st-body');
    if (window.FoUI && window.FoUI.settingsExtra[T.cur]) { window.FoUI.settingsExtra[T.cur](body); }
    else if (T.cur === 'security') {
      body.innerHTML = '<div class="fo-grid fo-grid--2"><div class="fo-card"><h3>Change passphrase</h3><label class="fo-field">Current passphrase<input type="password" id="pw-c" autocomplete="current-password"></label><label class="fo-field">New passphrase (12+ characters)<input type="password" id="pw-n" autocomplete="new-password"></label><label class="fo-field">Repeat new passphrase<input type="password" id="pw-n2" autocomplete="new-password"></label><div class="fo-msg" id="pw-msg"></div><button class="btn btn--primary" id="pw-go">Change passphrase</button></div>' +
        '<div class="fo-card"><h3>Active sessions <button class="btn btn--sm btn--danger" id="ss-all">Sign out everywhere</button></h3><div id="ss-list" class="fo-hint">Loading…</div>' +
        '<div class="fo-note" style="margin-top:12px"><b>How sign-in is protected:</b> passphrase (salted PBKDF2 + server key) and a 6-digit email code every time; codes expire in 5 minutes, work once and lock after 5 wrong tries; sign-in pauses after repeated wrong passphrases and emails you; sessions end after 30 idle minutes or 12 hours, rotate every 15 minutes and can be revoked here. The browser keeps the session only for this tab.</div></div></div>';
      $('#pw-go').onclick = function () {
        var m = $('#pw-msg'); m.className = 'fo-msg';
        if ($('#pw-n').value !== $('#pw-n2').value) { m.textContent = 'The new passphrases do not match.'; return; }
        api('f.passphrase', { current: $('#pw-c').value, next: $('#pw-n').value }).then(function (j) { if (!j.ok) { m.textContent = j.error; return; } m.className = 'fo-msg ok'; m.textContent = 'Passphrase changed.'; $$('#st-body input[type=password]').forEach(function (i) { i.value = ''; }); });
      };
      $('#ss-all').onclick = function () { if (confirm('Sign out on every device, including this one?')) api('f.logout.all').then(function () { signedOut('Signed out on every device.'); }).catch(function () {}); };
      api('f.sessions').then(function (j) { if (!j.ok) return; $('#ss-list').innerHTML = j.sessions.map(function (s) { return '<div class="fo-kv"><span>Started ' + when(s.started) + (s.current ? ' <span class="fo-badge">this device</span>' : '') + '</span><span>active ' + ago(s.lastActive) + '</span></div>'; }).join('') || 'None'; });
    } else if (T.cur === 'channels') {
      body.innerHTML = '<div class="fo-card"><h3>Commission and payment fees per channel</h3><p class="fo-hint">Used only where a booking has no recorded commission (shown as “estimated”). Leave blank when you do not know the real rate: figures will say “unknown” instead of guessing.</p><div class="fo-tablewrap"><table class="fo-table"><tr><th>Channel</th><th>Kind</th><th>Commission %</th><th>Payment fee %</th><th></th></tr>' +
        S.data.channels.map(function (c, i) { return '<tr><td><b>' + esc(c.channel) + '</b></td><td>' + esc(c.kind) + '</td><td><input class="fo-input" style="width:90px" data-cp="' + i + '" value="' + esc(c.commission_pct) + '" inputmode="decimal"' + (c.kind === 'direct' ? ' disabled title="Direct bookings have no commission"' : '') + '></td><td><input class="fo-input" style="width:90px" data-fp="' + i + '" value="' + esc(c.payment_fee_pct) + '" inputmode="decimal"></td><td><button class="btn btn--sm" data-save="' + i + '">Save</button></td></tr>'; }).join('') + '</table></div></div>';
      $$('[data-save]', body).forEach(function (b) { b.onclick = function () { var i = b.dataset.save, c = S.data.channels[i]; b.disabled = true; api('f.channel.save', { channel: c.channel, commission_pct: $('[data-cp="' + i + '"]').value, payment_fee_pct: $('[data-fp="' + i + '"]').value }).then(function (j) { b.disabled = false; if (!j.ok) return toast(j.error, true); toast('Saved'); load(true); }); }; });
    } else if (T.cur === 'villas') {
      body.innerHTML = '<div class="fo-card"><h3>Villas (inventory)</h3><div class="fo-tablewrap"><table class="fo-table"><tr><th>Villa</th><th>Unit</th><th class="num">Units</th><th class="num">Bedrooms</th><th class="num">Sleeps</th><th class="num">From rate</th><th>Active</th></tr>' + S.data.properties.map(function (p) { return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.unit_type) + '</td><td class="num">' + esc(p.units) + '</td><td class="num">' + esc(p.bedrooms) + '</td><td class="num">' + esc(p.sleeps) + '</td><td class="num">' + inr(num(p.from_rate)) + '</td><td>' + esc(p.active) + '</td></tr>'; }).join('') + '</table></div><p class="fo-hint">From content/business-facts.json. Each villa is rented whole, so the inventory unit is the villa-night. Edit the Properties tab of the private data sheet to change these.</p></div>';
    } else if (T.cur === 'metrics') {
      body.innerHTML = '<div class="fo-card"><h3>Metric dictionary <small>the same definitions power every screen and report</small></h3>' + Object.keys(M.DEFINITIONS).map(function (k) { var d = M.DEFINITIONS[k]; return '<div class="fo-kv" style="display:block"><b>' + esc(d.label) + '</b> <span class="fo-badge">' + esc(d.basis) + '</span><div class="fo-hint">' + esc(d.formula) + '</div></div>'; }).join('') +
        '<div class="fo-note" style="margin-top:12px"><b>Treatment rules.</b> Taxes: excluded from revenue only when recorded on the booking. Deposits and payments: cash, never revenue. Cancelled bookings: in booking value and cancellation rate, never in occupancy or ADR; kept fees reported separately. Refunds: reduce cash, by refund date. Commissions: recorded → estimated from your rate → unknown. Maintenance/owner blocks: removed from available villa-nights. Void: excluded everywhere.</div></div>';
    } else if (T.cur === 'audit') {
      body.innerHTML = '<div class="fo-card"><h3>Audit log <small>last 300 events</small></h3><div id="au-list" class="fo-hint">Loading…</div></div>';
      api('f.audit').then(function (j) { if (!j.ok) { $('#au-list').textContent = j.error; return; } $('#au-list').innerHTML = '<div class="fo-tablewrap"><table class="fo-table"><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th><th>Result</th></tr>' + j.audit.map(function (a) { return '<tr><td>' + when(a.ts) + '</td><td>' + esc(a.actor) + '</td><td>' + esc(a.action) + '</td><td>' + esc(String(a.detail).slice(0, 160)) + '</td><td>' + esc(a.result) + '</td></tr>'; }).join('') + '</table></div>'; });
    }
  }

  // ------------------------------------------------------------ planned modules (honest placeholders) ------------------------------------------------------------
  var PLANNED = {
    revenue: ['Revenue Intelligence', 8, ['Channel profitability after commission and payment fees', 'Revenue decomposition: available nights × occupancy × ADR (what changed and why)', 'Weekend pricing, seasonality, discount effectiveness, cancellation leakage', 'Forward occupancy and evidence-based pricing suggestions (never changes live prices without your approval)'], 'Today: channel contribution is in Booking Analytics; set channel commission rates in Settings.'],
    studio: ['Analytics Studio', 5, ['Save any chart with its metric, filters, comparison and refresh policy', 'Build and pin dashboards; duplicate and change chart types', 'Export CSV, Excel, PNG, SVG, PDF', 'Scheduled refreshes and snapshots on the server'], 'Today: every chart exports SVG, tables export CSV.'],
    trends: ['Trends & Market Intelligence', 9, ['Growth trends for bookings, revenue, occupancy, ADR, lead time, channel mix', 'Verified Ujjain events calendar (Mahashivratri, Shravan, festivals, long weekends) with year-specific dates', 'Demand around events vs normal weeks', 'Transparent anomaly alerts (rule-based while history is short)'], 'Needs a few months of ledger history to be meaningful.'],
    website: ['Website Analytics', 6, ['Users, sessions, engagement, landing pages, sources, devices, key events from GA4', 'Booking-intent funnel: landing → villa view → enquiry → WhatsApp click → confirmed booking', 'Reconciliation of website bookings vs GA4 events (no guest personal data ever sent to GA4)'], 'Needs one Google permission (GA4 read-only) on the Apps Script project.'],
    finance: ['Financial Intelligence', 8, ['Expenses by category and villa (housekeeping, laundry, utilities, maintenance, staff, marketing…)', 'Contribution margin, operating profit where costs exist, cost per occupied night, break-even occupancy', 'Cash-flow forecast and budget vs actual', 'Accounting figures kept apart from management estimates'], 'Today: cash collected, refunds and receivables are on the overview.'],
    forecast: ['Forecasting & Scenario Lab', 9, ['7/14/30/90-day and 12-month forecasts where data allows', 'Seasonal-naive, moving average and exponential smoothing with rolling backtests (MAE, RMSE, WAPE, bias, intervals)', 'Base / optimistic / pessimistic scenarios with your own levers'], 'Needs enough history; the portal will show data sufficiency before any forecast.'],
    strategy: ['Strategic Recommendations', 10, ['Evidence-based recommendations with data, hypothesis, KPIs, impact, confidence, priority and owner', 'Impact × feasibility matrix', 'Decision log (accepted, rejected, deferred, implemented) with outcome tracking'], 'Today: the daily brief lists factual recommended actions.'],
  };
  function viewSoon(page) {
    var p = PLANNED[S.view] || ['Coming soon', '', [], ''];
    page.innerHTML = '<div class="fo-card fo-soon"><span class="fo-badge fo-badge--gold">Planned · phase ' + esc(p[1]) + '</span><h2>' + esc(p[0]) + '</h2><p class="fo-hint">Not built yet. Nothing on this page is mocked; it will appear here once it works with your real data.</p><ul>' + p[2].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p class="fo-note">' + esc(p[3]) + '</p></div>';
  }

  var VIEWS = { overview: viewOverview, bookings: viewBookings, analytics: viewAnalytics, properties: viewProperties, guests: viewGuests, ops: viewOps, reports: viewReports, integrations: viewIntegrations, settings: viewSettings };

  // ------------------------------------------------------------ CSV ------------------------------------------------------------
  function csvDownload(name, head, rows) {
    var cell = function (v) { var s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    C.download(name + '.csv', '﻿' + [head].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n'), 'text/csv;charset=utf-8');
  }

  // shared with founder/modules.js (phases 5–10), which registers its views and then starts the app
  window.FoUI = {
    S: S, M: M, C: C, api: api, load: load, render: render, renderPage: renderPage, hello: hello, tabs: tabs, wireTabs: wireTabs, chartCard: chartCard, kv: kv,
    esc: esc, $: $, $$: $$, inr: inr, pct: pct, n1: n1, dmy: dmy, dm: dm, when: when, ago: ago, toast: toast, sel: sel, uniq: uniq, drill: drill, bucketRange: bucketRange,
    currentRange: currentRange, filt: filt, propName: propName, today: today, csvDownload: csvDownload, drawer: drawer, icon: icon, openBooking: openBooking,
    channelTable: channelTable, openEx: openEx, MODULES: MODULES, VIEWS: VIEWS, PLANNED: PLANNED, settingsExtra: {}, savePrefs: savePrefs,
    start: function () { render(); },
  };
  if (!root.hasAttribute("data-wait-modules")) render();   // modules.js starts the app after registering its views
})();
