/**
 * AP Villas Founder OS · Channel Manager calendar (part of channels.js; back end docs/founder-os/FoChannels.gs).
 * Calendar: month view (tap a start and an end date) and a 30-day grid (rates, units, restrictions per channel), one selection model.
 * Bulk edit: many villas · dates · weekdays · channels at once: price (you keep / channel price / % of recommended / back to
 * recommended), units to sell, open/close, stop-sell, min stay, max stay, closed to arrival / departure, note; preview before applying.
 * Day details: everything about one villa·night on every channel, and its change history.
 * Rate plans: derived plans (non-refundable, breakfast…) that follow the main price inside your floor/ceiling.
 * Performance: bookings, nights, revenue, commission, net, ADR, share, cancellations, lead time and length of stay per channel.
 */
(function () {
  'use strict';
  var U = window.FoUI, S = U.S, M = U.M;
  var esc = U.esc, $ = U.$, $$ = U.$$, inr = U.inr, dm = U.dm, when = U.when, toast = U.toast, sel = U.sel, num = M.num;
  var CH = ['mmt', 'booking', 'airbnb'], NAMES = { mmt: 'MakeMyTrip / Goibibo', booking: 'Booking.com', airbnb: 'Airbnb' }, SHORT = { mmt: 'MMT', booking: 'Booking', airbnb: 'Airbnb' };
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var LABEL = { rate: 'Price', open: 'Open', close: 'Close', min_stay: 'Min stay', max_stay: 'Max stay', cta: 'Closed to arrival', ctd: 'Closed to departure', stop_sell: 'Stop-sell', inventory: 'Units' };
  var cal = { villa: null, view: 'month', month: null, gridStart: null, rows: null, key: '', from: null, to: null, loading: false };

  function D() { return S.data || {}; }
  function C() { return D().channel_manager || {}; }
  function founder() { return S.user && S.user.role === 'founder'; }
  function today() { return U.today(); }
  function addDays(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function villas() { return (D().properties || []).map(function (p) { return [p.property_id, p.name]; }); }
  function vname(id) { return U.propName ? U.propName(id) : id; }
  function badge(t, cls) { return '<span class="fo-badge' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</span>'; }
  function card(title, sub, body, tools) { return '<div class="fo-card"><h3>' + esc(title) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + (tools ? '<span class="fo-card__tools">' + tools + '</span>' : '') + '</h3>' + body + '</div>'; }
  function head(title, sub) { return '<div class="fo-drawer__head"><div><h2 class="serif" style="font-size:24px">' + esc(title) + '</h2>' + (sub ? '<div class="fo-hint">' + sub + '</div>' : '') + '</div><button class="fo-iconbtn" data-close aria-label="Close">' + U.icon('x') + '</button></div>'; }
  function field(label, html, full) { return '<label class="fo-field' + (full ? ' full' : '') + '">' + esc(label) + html + '</label>'; }
  function input(id, v, type, extra) { return '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + '>'; }
  function val(p, id) { var e = $('#' + id, p); return e ? (e.type === 'checkbox' ? e.checked : e.value) : ''; }
  function k(n) { return n >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n); }
  function save(action, body, msg) { return U.api(action, body).then(function (j) { if (!j.ok) { toast(j.error, true); return j; } if (msg) toast(msg); cal.rows = null; return U.load(true).then(function () { return j; }); }); }

  // ------------------------------------------------------------ data ------------------------------------------------------------
  function defaultVilla() { var own = (C().listings || []).filter(function (l) { return l.role === 'own'; })[0]; return own ? own.villa : (villas()[0] || [])[0]; }
  function load(body, until, fn) {
    var need = Math.max(31, Math.round((Date.parse(until) - Date.parse(today())) / 864e5) + 1), key = cal.villa + '|' + need;
    if (cal.rows && cal.key === cal.villa && cal.rows.length >= Math.min(need, 366)) return fn();
    body.innerHTML = '<div class="fo-empty">Loading the calendar…</div>';
    U.api('f.cm.calendar', { villa: cal.villa, days: Math.min(366, need), long: true }).then(function (j) {
      if (!j.ok) { body.innerHTML = '<div class="fo-empty">' + esc(j.error || 'Could not load the calendar.') + '</div>'; return; }
      cal.rows = j.desk || []; cal.key = j.villa; fn();
    });
  }
  function byDate() { var o = {}; (cal.rows || []).forEach(function (n) { o[n.date] = n; }); return o; }
  function selDates() { if (!cal.from) return []; var out = [], to = cal.to || cal.from; for (var d = cal.from; d <= to; d = addDays(d, 1)) out.push(d); return out; }
  function pick(d) {
    if (d < today()) return toast('Past dates cannot be changed.', true);
    if (!cal.from || cal.to) { cal.from = d; cal.to = null; }
    else if (d < cal.from) { cal.to = cal.from; cal.from = d; }
    else cal.to = d;
  }
  function inSel(d) { return cal.from && d >= cal.from && d <= (cal.to || cal.from); }
  function statusOf(n) {
    if (!n) return { cls: 'na', t: '' };
    if (n.booked && n.left === 0) return { cls: 'booked', t: 'booked' };
    if (n.blocked) return { cls: 'blocked', t: 'blocked' };
    if (n.ari.closed) return { cls: 'closed', t: 'closed' };
    if (n.ari.stop_sell) return { cls: 'stop', t: 'stop-sell' };
    if (n.units > 1 && n.sold) return { cls: 'part', t: n.left + '/' + n.units + ' left' };
    return { cls: 'open', t: 'open' };
  }
  function tags(n) {
    var t = [];
    if (n.ari.min_stay > 1) t.push('Min ' + n.ari.min_stay); if (n.ari.max_stay) t.push('Max ' + n.ari.max_stay);
    if (n.ari.cta) t.push('CTA'); if (n.ari.ctd) t.push('CTD'); if (n.ari.note) t.push('✎');
    return t;
  }

  // ------------------------------------------------------------ view ------------------------------------------------------------
  function view(body) {
    if (!cal.villa) cal.villa = defaultVilla();
    if (!cal.month) cal.month = today().slice(0, 7);
    if (!cal.gridStart) cal.gridStart = today();
    var until = cal.view === 'month' ? addDays(cal.month + '-01', 41) : addDays(cal.gridStart, 29);
    load(body, until, function () { render(body); });
  }
  function toolbar() {
    var n = selDates().length;
    return '<div class="fo-toolbar cm-caltools">' + sel('cc-v', villas(), cal.villa) +
      '<div class="cm-seg">' + [['month', 'Month'], ['grid', '30-day grid']].map(function (x) { return '<button class="btn btn--sm' + (cal.view === x[0] ? ' btn--primary' : '') + '" data-view="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<button class="btn btn--sm" data-nav="-1" aria-label="Earlier">‹</button><button class="btn btn--sm" data-nav="0">Today</button><button class="btn btn--sm" data-nav="1" aria-label="Later">›</button>' +
      (founder() ? '<button class="btn btn--primary" id="cc-bulk">Bulk edit' + (n ? ' ' + n + ' night' + (n === 1 ? '' : 's') : '') + '</button>' : '') +
      (n === 1 ? '<button class="btn" id="cc-day">Day details</button>' : '') + (n ? '<button class="btn btn--sm" id="cc-clear">Clear</button>' : '') + '</div>' +
      '<p class="fo-hint">' + (n ? '<b>Selected:</b> ' + dm(cal.from) + (cal.to && cal.to !== cal.from ? ' → ' + dm(cal.to) : '') + ' (' + n + ' night' + (n === 1 ? '' : 's') + '). Tap another date to change the end.' : 'Tap a start date, then an end date. Then Bulk edit, or Day details for one night.') + '</p>';
  }
  function legend() {
    return '<div class="cm-legend">' + [['open', 'Open'], ['part', 'Some units sold'], ['booked', 'Booked'], ['blocked', 'Blocked'], ['closed', 'Closed'], ['stop', 'Stop-sell']].map(function (x) { return '<span><i class="cm-dot cm-dot--' + x[0] + '"></i>' + x[1] + '</span>'; }).join('') + '<span>• = your own price</span></div>';
  }
  function render(body) {
    body.innerHTML = toolbar() + (cal.view === 'month' ? month() : grid()) + legend();
    $('#cc-v', body).onchange = function () { cal.villa = this.value; cal.rows = null; view(body); };
    $$('[data-view]', body).forEach(function (b) { b.onclick = function () { cal.view = b.dataset.view; view(body); }; });
    $$('[data-nav]', body).forEach(function (b) {
      b.onclick = function () {
        var dir = Number(b.dataset.nav);
        if (cal.view === 'month') { if (!dir) cal.month = today().slice(0, 7); else { var y = Number(cal.month.slice(0, 4)), m = Number(cal.month.slice(5)) + dir; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } cal.month = y + '-' + String(m).padStart(2, '0'); } if (cal.month < today().slice(0, 7)) cal.month = today().slice(0, 7); }
        else { cal.gridStart = !dir ? today() : addDays(cal.gridStart, dir * 30); if (cal.gridStart < today()) cal.gridStart = today(); }
        if (cal.month > addDays(today(), 330).slice(0, 7)) cal.month = addDays(today(), 330).slice(0, 7);
        view(body);
      };
    });
    $$('[data-day]', body).forEach(function (c) { c.onclick = function () { pick(c.dataset.day); render(body); }; });
    var bk = $('#cc-bulk', body); if (bk) bk.onclick = function () { bulkDrawer(selDates(), body); };
    var dy = $('#cc-day', body); if (dy) dy.onclick = function () { dayDrawer(cal.from, body); };
    var cl = $('#cc-clear', body); if (cl) cl.onclick = function () { cal.from = cal.to = null; render(body); };
  }
  function month() {
    var first = cal.month + '-01', wd0 = new Date(first + 'T00:00:00Z').getUTCDay(), start = addDays(first, -wd0), map = byDate(), m = cal.month, t = today();
    var html = '<div class="cm-month"><div class="cm-month__title">' + MON[Number(m.slice(5)) - 1] + ' ' + m.slice(0, 4) + ' · ' + esc(vname(cal.villa)) + '</div><div class="cm-month__grid">' + WD.map(function (w) { return '<div class="cm-month__wd">' + w + '</div>'; }).join('');
    for (var i = 0; i < 42; i++) {
      var d = addDays(start, i), n = map[d], st = statusOf(n), out = d.slice(0, 7) !== m, past = d < t;
      if (i === 35 && d.slice(0, 7) !== m) break;
      html += '<button class="cm-day cm-day--' + st.cls + (out ? ' is-out' : '') + (past ? ' is-past' : '') + (inSel(d) ? ' is-sel' : '') + (d === t ? ' is-today' : '') + '"' + (past || !n ? ' disabled' : ' data-day="' + d + '"') + ' aria-label="' + d + ' ' + esc(st.t) + '">' +
        '<span class="cm-day__n">' + Number(d.slice(8)) + '</span>' +
        (n ? '<span class="cm-day__p">₹' + k(n.net) + (n.override ? '•' : '') + '</span>' + (n.units > 1 ? '<span class="cm-day__u">' + n.left + '/' + n.units + '</span>' : '') +
          (tags(n).length ? '<span class="cm-day__t">' + esc(tags(n).join(' ')) + '</span>' : '') + '<i class="cm-dot cm-dot--' + st.cls + '"></i>' : '') + '</button>';
    }
    return html + '</div></div>';
  }
  function grid() {
    var map = byDate(), days = []; for (var i = 0; i < 30; i++) days.push(addDays(cal.gridStart, i));
    var row = function (label, f, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th class="cm-grid__lab">' + label + '</th>' + days.map(function (d) { var n = map[d]; return '<td class="' + (inSel(d) ? 'is-sel' : '') + '">' + (n ? f(n, d) : '') + '</td>'; }).join('') + '</tr>'; };
    var yes = function (v) { return v ? '<b class="cm-on">✓</b>' : '<span class="fo-hint">·</span>'; };
    var html = '<div class="cm-grid"><table><thead><tr><th class="cm-grid__lab">' + esc(vname(cal.villa)) + '</th>' + days.map(function (d) {
      return '<th class="' + (inSel(d) ? 'is-sel' : '') + '"><button class="cm-colhead" data-day="' + d + '">' + WD[new Date(d + 'T00:00:00Z').getUTCDay()].slice(0, 2) + '<br><b>' + Number(d.slice(8)) + '</b><br><small>' + MON[Number(d.slice(5, 7)) - 1].slice(0, 3) + '</small></button></th>';
    }).join('') + '</tr></thead><tbody>' +
      row('Status', function (n) { var s = statusOf(n); return '<i class="cm-dot cm-dot--' + s.cls + '" title="' + esc(s.t) + '"></i>'; }) +
      row('Units left', function (n) { return n.left + '/' + n.units; }) +
      row('You keep', function (n) { return '₹' + k(n.net) + (n.override ? '•' : ''); }, 'cm-grid__strong') +
      row('Chance to sell', function (n) { return n.chance != null ? n.chance + '%' : ''; });
    CH.forEach(function (c) {
      html += row('<b>' + SHORT[c] + '</b> price', function (n) { var x = n.channels[c]; if (!x) return ''; return (x.live != null && x.live !== x.list ? '<span class="fo-hint">' + k(x.live) + '→</span>' : '') + k(x.list); }) +
        row(SHORT[c] + ' open', function (n) { var x = n.channels[c] || {}; return x.available === 'no' ? '<b class="cm-off">✕</b>' : x.available === 'yes' ? '<b class="cm-on">✓</b>' : '<span class="fo-hint">?</span>'; }, 'cm-grid__sub');
    });
    html += row('Min stay', function (n) { return n.ari.min_stay || ''; }) + row('Max stay', function (n) { return n.ari.max_stay || ''; }) +
      row('Closed to arrival', function (n) { return yes(n.ari.cta); }) + row('Closed to departure', function (n) { return yes(n.ari.ctd); }) +
      row('Stop-sell', function (n) { return yes(n.ari.stop_sell); }) + row('Closed', function (n) { return yes(n.ari.closed); });
    return html + '</tbody></table></div><p class="fo-hint">Channel price: recommended (or your own) price for that channel; a grey number before → is what the channel shows now. ✓ open · ✕ closed · ? not read yet.</p>';
  }

  // ------------------------------------------------------------ bulk edit ------------------------------------------------------------
  function bulkDrawer(dates, body) {
    var from = dates[0] || today(), to = dates[dates.length - 1] || from;
    var section = function (key, title, html) { return '<div class="cm-bsec"><label class="cm-bsec__on"><input type="checkbox" data-on="' + key + '"> <b>' + esc(title) + '</b></label><div class="cm-bsec__body" data-body="' + key + '">' + html + '</div></div>'; };
    var onoff = function (id) { return sel(id, [['on', 'On'], ['off', 'Off']], 'on'); };
    var p = U.drawer(head('Bulk edit', 'Change many nights, villas and channels at once. Tick what to change; everything else stays as it is.') +
      '<div class="fo-form">' + field('From', input('be-from', from, 'date', ' min="' + today() + '"')) + field('To', input('be-to', to, 'date', ' min="' + today() + '"')) +
      field('Weekdays', '<div class="fo-checks">' + WD.map(function (w, i) { return '<label><input type="checkbox" data-wd="' + i + '" checked> ' + w + '</label>'; }).join(' ') + '</div>', true) +
      field('Villas', '<div class="fo-checks">' + villas().map(function (v) { return '<label><input type="checkbox" data-villa="' + esc(v[0]) + '"' + (v[0] === cal.villa ? ' checked' : '') + '> ' + esc(v[1]) + '</label>'; }).join(' ') + '</div>', true) +
      field('Channels', '<div class="fo-checks">' + CH.map(function (c) { return '<label><input type="checkbox" data-chan="' + c + '" checked> ' + esc(NAMES[c]) + '</label>'; }).join(' ') + '</div>', true) + '</div>' +
      section('price', 'Price', '<div class="fo-form">' + field('How', sel('be-pm', [['net', 'What I keep (₹, commission added per channel)'], ['channel', 'Price guests see on the channel (₹)'], ['pct', '% up or down from the recommended price'], ['recommended', 'Back to the recommended price']], 'net')) + field('Value', input('be-pv', '', 'number', ' step="50" inputmode="numeric"')) + '</div>') +
      section('units', 'Units to sell', field('Units (a whole villa is 1; 0 = sell none)', input('be-units', '1', 'number', ' min="0" max="50"'))) +
      section('closed', 'Open / close', sel('be-closed', [['no', 'Open for sale'], ['yes', 'Close (not for sale)']], 'yes')) +
      section('stop_sell', 'Stop-sell', onoff('be-ss')) +
      section('min_stay', 'Minimum stay', field('Nights', input('be-min', '2', 'number', ' min="1" max="30"'))) +
      section('max_stay', 'Maximum stay', field('Nights (0 = no limit)', input('be-max', '0', 'number', ' min="0" max="90"'))) +
      section('cta', 'Closed to arrival (no check-ins)', onoff('be-cta')) +
      section('ctd', 'Closed to departure (no check-outs)', onoff('be-ctd')) +
      section('note', 'Note on these nights', input('be-note', '', 'text', ' maxlength="120" placeholder="e.g. Mahashivratri, family visiting"')) +
      '<label class="cm-approve"><input type="checkbox" id="be-ok" checked> Send to the channels straight away (unticked: the changes wait in Jobs for approval)</label>' +
      '<div class="fo-toolbar"><button class="btn" id="be-prev">Preview</button><button class="btn btn--primary" id="be-go">Apply</button></div><div id="be-out"></div>');
    $$('[data-on]', p).forEach(function (c) { var b = $('[data-body="' + c.dataset.on + '"]', p); b.classList.toggle('is-off', !c.checked); c.onchange = function () { b.classList.toggle('is-off', !c.checked); }; });
    $('#be-pm', p).onchange = function () { $('#be-pv', p).disabled = this.value === 'recommended'; $('#be-pv', p).step = this.value === 'pct' ? '1' : '50'; };
    function collect(preview) {
      var on = function (key) { var c = $('[data-on="' + key + '"]', p); return c && c.checked; }, set = {};
      if (on('price')) set.price = { mode: val(p, 'be-pm'), value: val(p, 'be-pv') };
      if (on('units')) set.units = val(p, 'be-units');
      if (on('closed')) set.closed = val(p, 'be-closed') === 'yes';
      if (on('stop_sell')) set.stop_sell = val(p, 'be-ss') === 'on';
      if (on('min_stay')) set.min_stay = val(p, 'be-min');
      if (on('max_stay')) set.max_stay = val(p, 'be-max');
      if (on('cta')) set.cta = val(p, 'be-cta') === 'on';
      if (on('ctd')) set.ctd = val(p, 'be-ctd') === 'on';
      if (on('note')) set.note = val(p, 'be-note');
      return { villas: $$('[data-villa]', p).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.villa; }), from: val(p, 'be-from'), to: val(p, 'be-to'),
        weekdays: $$('[data-wd]', p).filter(function (x) { return x.checked; }).map(function (x) { return Number(x.dataset.wd); }), channels: $$('[data-chan]', p).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.chan; }),
        set: set, approve: val(p, 'be-ok'), preview: preview };
    }
    function show(r, applied) {
      $('#be-out', p).innerHTML = '<div class="fo-alert' + (r.errors.length ? ' fo-alert--bad' : '') + '"><b>' + (applied ? 'Done: ' : 'Preview: ') + r.jobs + ' channel change' + (r.jobs === 1 ? '' : 's') + '</b> across ' + r.nights + ' villa-night' + (r.nights === 1 ? '' : 's') +
        (Object.keys(r.by_channel).length ? ' (' + Object.keys(r.by_channel).map(function (c) { return SHORT[c] + ' ' + r.by_channel[c]; }).join(', ') + ')' : '') + (applied ? '. Nightly settings saved.' : '. Nothing saved yet.') +
        (r.warnings.length ? '<ul>' + r.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') + (r.errors.length ? '<ul>' + r.errors.slice(0, 8).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
    }
    $('#be-prev', p).onclick = function () { U.api('f.cm.bulk', { bulk: collect(true) }).then(function (j) { if (!j.ok) return toast(j.error, true); show(j.result, false); }); };
    $('#be-go', p).onclick = function () {
      var b = collect(false); this.disabled = true; var btn = this;
      save('f.cm.bulk', { bulk: b }).then(function (j) { btn.disabled = false; if (!j.ok) return; show(j.result, true); cal.from = cal.to = null; if (body) view(body); });
    };
  }

  // ------------------------------------------------------------ day details ------------------------------------------------------------
  function dayDrawer(d, body) {
    var n = byDate()[d]; if (!n) return;
    var hist = (C().jobs || []).filter(function (j) { return j.villa === cal.villa && j.date_from <= d && j.date_to >= d; }).sort(function (a, b) { return String(b.created_at) < String(a.created_at) ? -1 : 1; });
    var res = (D().bookings || []).filter(function (b) { return b.property_id === cal.villa && b.checkin <= d && b.checkout > d && ['confirmed', 'tentative'].indexOf(b.status) >= 0; });
    var st = statusOf(n);
    var p = U.drawer(head(WD[new Date(d + 'T00:00:00Z').getUTCDay()] + ' ' + dm(d) + ' · ' + vname(cal.villa), badge(st.t, st.cls === 'open' ? 'fo-badge--ok' : st.cls === 'booked' ? 'fo-badge--gold' : 'fo-badge--bad')) +
      '<div class="fo-grid fo-grid--kpi">' + [['You keep', inr(n.net) + (n.override ? ' (your price)' : '')], ['Recommended', inr(n.rec_net)], ['Floor – ceiling', inr(n.floor) + ' – ' + inr(n.ceiling)], ['Units', n.left + ' of ' + n.units + ' left'], ['Chance to sell', n.chance != null ? n.chance + '%' : '—']].map(function (x) { return '<div class="fo-card"><div class="fo-kpi__label">' + esc(x[0]) + '</div><div class="fo-kpi__value" style="font-size:18px">' + x[1] + '</div></div>'; }).join('') + '</div>' +
      (res.length ? '<p><b>Booked:</b> ' + res.map(function (b) { return esc(b.channel || 'Direct') + (b.external_id ? ' #' + esc(b.external_id) : ''); }).join(', ') + '</p>' : '') +
      '<div class="fo-tablewrap"><table class="fo-table"><thead><tr><th>Channel</th><th class="num">Target</th><th class="num">Live</th><th>Open</th><th>Min</th><th>Max</th><th>CTA</th><th>CTD</th><th>Stop</th><th>Units</th></tr></thead><tbody>' +
      CH.map(function (c) { var x = n.channels[c] || {}; return '<tr><td><b>' + SHORT[c] + '</b></td><td class="num">' + (x.list ? inr(x.list) : '—') + '</td><td class="num">' + (x.live != null ? inr(x.live) : '—') + '</td><td>' + (x.available || '?') + '</td><td>' + (x.min_stay || '') + '</td><td>' + (x.max_stay || '') + '</td><td>' + (x.cta ? '✓' : '') + '</td><td>' + (x.ctd ? '✓' : '') + '</td><td>' + (x.stop_sell ? '✓' : '') + '</td><td>' + (x.inventory !== '' && x.inventory != null ? x.inventory : '') + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="fo-hint">Live values are what the channel agent last read on each extranet (empty until the agent runs).</p>' +
      '<h3 style="margin-top:14px">Your settings for this night</h3><p>' + (tags(n).length || n.ari.closed || n.ari.stop_sell ? esc([n.ari.closed ? 'Closed' : '', n.ari.stop_sell ? 'Stop-sell' : ''].concat(tags(n)).filter(Boolean).join(' · ')) : 'None (open, no restrictions).') + (n.ari.note ? '<br><i>' + esc(n.ari.note) + '</i>' : '') + '</p>' +
      '<h3>History</h3>' + (hist.length ? '<ul class="cm-hist">' + hist.slice(0, 25).map(function (j) { return '<li><b>' + SHORT[j.channel] + '</b> ' + esc(LABEL[j.type] || j.type) + ' ' + esc(j.type === 'rate' ? inr(num(j.new_value)) : String(j.new_value)) + (j.rate_plan ? ' (plan)' : '') + ' · ' + esc(j.state.replace('_', ' ')) + (j.read_back ? ' · read back ' + esc(j.read_back) : '') + ' · <small>' + when(j.done_at || j.approved_at || j.created_at) + '</small></li>'; }).join('') + '</ul>' : '<div class="fo-empty">No changes for this night yet.</div>') +
      (founder() ? '<div class="fo-toolbar"><button class="btn btn--primary" id="dd-edit">Edit this night</button></div>' : ''));
    var e = $('#dd-edit', p); if (e) e.onclick = function () { p.parentNode.remove(); bulkDrawer([d], body); };
  }

  // ------------------------------------------------------------ rate plans ------------------------------------------------------------
  var MEAL = [['none', 'Room only'], ['breakfast', 'Breakfast'], ['half_board', 'Breakfast + dinner'], ['full_board', 'All meals']];
  function plans(body) {
    var ps = C().rate_plans || [];
    body.innerHTML = '<p class="fo-hint">Your main price is the <b>Standard</b> plan. Extra plans follow it automatically: every time the Standard price changes on a channel, each plan gets its own price (for example −10% non-refundable, +₹600 with breakfast), always inside your floor and ceiling.</p>' +
      (founder() ? '<div class="fo-toolbar"><button class="btn btn--primary" id="rp-add">+ New rate plan</button>' + (!ps.length ? '<button class="btn" id="rp-starter">Add 2 common plans</button>' : '') + '</div>' : '') +
      (ps.length ? '<div class="fo-tablewrap"><table class="fo-table"><thead><tr><th>Plan</th><th>Villas</th><th>Channels</th><th>Price vs Standard</th><th>Meals</th><th>Cancellation</th><th>Status</th><th></th></tr></thead><tbody>' + ps.map(function (x) {
        var adj = [num(x.adjust_pct) ? (num(x.adjust_pct) > 0 ? '+' : '') + num(x.adjust_pct) + '%' : '', num(x.adjust_amt) ? (num(x.adjust_amt) > 0 ? '+' : '−') + inr(Math.abs(num(x.adjust_amt))) : ''].filter(Boolean).join(' ') || 'same';
        return '<tr><td><b>' + esc(x.name) + '</b></td><td>' + esc(x.villa === 'all' ? 'All' : vname(x.villa)) + '</td><td>' + esc(x.channels === 'all' ? 'All' : String(x.channels).split(',').map(function (c) { return SHORT[c]; }).join(', ')) + '</td><td>' + esc(adj) + '</td><td>' + esc((MEAL.filter(function (m) { return m[0] === x.meal; })[0] || ['', x.meal])[1]) + '</td><td>' + (x.refund === 'non_refundable' ? 'Non-refundable' : 'Flexible') + '</td><td>' + (x.active === 'yes' ? badge('active', 'fo-badge--ok') : badge('off')) + '</td><td>' + (founder() ? '<button class="btn btn--sm" data-rp="' + esc(x.plan_id) + '">Edit</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="fo-empty">Only the Standard plan so far.</div>');
    var a = $('#rp-add', body); if (a) a.onclick = function () { planDrawer({}); };
    var st = $('#rp-starter', body); if (st) st.onclick = function () {
      U.api('f.cm.plan.save', { plan: { name: 'Non-refundable', villa: 'all', channels: ['booking', 'mmt'], adjust_pct: -10, refund: 'non_refundable' } }).then(function () { return U.api('f.cm.plan.save', { plan: { name: 'With breakfast', villa: 'all', channels: ['booking', 'mmt'], adjust_amt: 600, meal: 'breakfast' } }); }).then(function () { toast('Plans added'); U.load(true); });
    };
    $$('[data-rp]', body).forEach(function (b) { b.onclick = function () { planDrawer(ps.filter(function (x) { return x.plan_id === b.dataset.rp; })[0]); }; });
  }
  function planDrawer(x) {
    var ext = {}; try { ext = JSON.parse(x.ext_ids || '{}'); } catch (e) {}
    var chans = !x.channels || x.channels === 'all' ? CH : String(x.channels).split(',');
    var p = U.drawer(head(x.plan_id ? 'Edit rate plan' : 'New rate plan') + '<div class="fo-form">' + field('Name', input('rp-n', x.name, 'text', ' placeholder="e.g. Non-refundable"')) + field('Villas', sel('rp-v', [['all', 'All villas']].concat(villas()), x.villa || 'all')) +
      field('Channels', '<div class="fo-checks">' + CH.map(function (c) { return '<label><input type="checkbox" data-rc="' + c + '"' + (chans.indexOf(c) >= 0 ? ' checked' : '') + '> ' + esc(NAMES[c]) + '</label>'; }).join(' ') + '</div>', true) +
      field('% vs Standard (−50 to +100)', input('rp-p', x.adjust_pct || 0, 'number', ' step="1"')) + field('₹ vs Standard', input('rp-a', x.adjust_amt || 0, 'number', ' step="50"')) +
      field('Meals', sel('rp-m', MEAL, x.meal || 'none')) + field('Cancellation', sel('rp-r', [['flexible', 'Flexible'], ['non_refundable', 'Non-refundable']], x.refund || 'flexible')) +
      CH.map(function (c) { return field(SHORT[c] + ' rate plan id (from the extranet)', input('rp-x-' + c, ext[c] || '', 'text', ' placeholder="the agent fills this at setup"')); }).join('') +
      field('Active', '<label><input type="checkbox" id="rp-on"' + (x.active === '' ? '' : ' checked') + '> send this plan to the channels</label>', true) + '</div>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="rp-go">Save</button>' + (x.plan_id ? '<button class="btn btn--danger" id="rp-del">Delete</button>' : '') + '</div>');
    $('#rp-go', p).onclick = function () {
      var e = {}; CH.forEach(function (c) { var v = val(p, 'rp-x-' + c); if (v) e[c] = v; });
      save('f.cm.plan.save', { plan: { plan_id: x.plan_id || '', name: val(p, 'rp-n'), villa: val(p, 'rp-v'), channels: $$('[data-rc]', p).filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.rc; }), adjust_pct: val(p, 'rp-p'), adjust_amt: val(p, 'rp-a'), meal: val(p, 'rp-m'), refund: val(p, 'rp-r'), ext_ids: e, active: val(p, 'rp-on') } }, 'Saved').then(function (j) { if (j.ok) p.parentNode.remove(); });
    };
    var d = $('#rp-del', p); if (d) d.onclick = function () { if (confirm('Delete this rate plan?')) save('f.cm.plan.delete', { plan_id: x.plan_id }, 'Deleted').then(function (j) { if (j.ok) p.parentNode.remove(); }); };
  }

  // ------------------------------------------------------------ performance ------------------------------------------------------------
  var perfRange = '90';
  function chanOf(c) { c = String(c || '').toLowerCase(); return /airbnb/.test(c) ? 'Airbnb' : /booking\.com|booking/.test(c) ? 'Booking.com' : /makemytrip|goibibo|mmt/.test(c) ? 'MakeMyTrip / Goibibo' : /direct|whatsapp|walk|phone|website/.test(c) || !c ? 'Direct' : c.replace(/^\w/, function (m) { return m.toUpperCase(); }); }
  function performance(body) {
    var t = today(), from, to, label;
    if (perfRange === 'next90') { from = t; to = addDays(t, 90); label = 'stays in the next 90 days (on the books)'; } else { from = addDays(t, -Number(perfRange)); to = t; label = 'stays checked in during the last ' + perfRange + ' days'; }
    var comm = {}, cs = C().settings || {}; comm['Airbnb'] = (cs.airbnb || {}).commission; comm['Booking.com'] = (cs.booking || {}).commission; comm['MakeMyTrip / Goibibo'] = (cs.mmt || {}).commission;
    (D().channels || []).forEach(function (c) { if (num(c.commission_pct) > 0) comm[chanOf(c.channel)] = num(c.commission_pct) / 100; });
    var rows = {}, total = { rev: 0, nights: 0 };
    (D().bookings || []).filter(function (b) { return b.checkin >= from && b.checkin <= to && b.status !== 'void'; }).forEach(function (b) {
      var c = chanOf(b.channel), r = rows[c] = rows[c] || { n: 0, cancel: 0, nights: 0, rev: 0, com: 0, lead: [], los: [] };
      if (b.status === 'cancelled') { r.cancel++; return; }
      var nights = num(b.nights) || Math.max(1, Math.round((Date.parse(b.checkout) - Date.parse(b.checkin)) / 864e5)), gross = num(b.gross_amount);
      r.n++; r.nights += nights; r.rev += gross; r.com += num(b.commission) > 0 ? num(b.commission) : gross * (comm[c] || 0); r.los.push(nights);
      if (b.created_at) r.lead.push(Math.max(0, Math.round((Date.parse(b.checkin) - Date.parse(String(b.created_at).slice(0, 10))) / 864e5)));
      total.rev += gross; total.nights += nights;
    });
    var avg = function (a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; };
    var list = Object.keys(rows).map(function (c) { return [c, rows[c]]; }).sort(function (a, b) { return b[1].rev - a[1].rev; });
    var max = Math.max.apply(null, list.map(function (x) { return x[1].rev; }).concat([1]));
    body.innerHTML = '<div class="fo-toolbar">' + sel('pf-r', [['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last 12 months'], ['next90', 'Next 90 days (on the books)']], perfRange) + '<span class="fo-hint">By check-in date: ' + label + '. Commission from the booking, or the channel\'s commission % in Settings.</span></div>' +
      '<div class="fo-grid fo-grid--kpi">' + [['Revenue', inr(total.rev)], ['Room nights', String(total.nights)], ['Average per night', total.nights ? inr(Math.round(total.rev / total.nights)) : '—'], ['Commission paid', inr(Math.round(list.reduce(function (a, x) { return a + x[1].com; }, 0)))]].map(function (x) { return '<div class="fo-card"><div class="fo-kpi__label">' + x[0] + '</div><div class="fo-kpi__value">' + x[1] + '</div></div>'; }).join('') + '</div>' +
      (list.length ? '<div class="fo-tablewrap"><table class="fo-table"><thead><tr><th>Channel</th><th>Share of revenue</th><th class="num">Bookings</th><th class="num">Nights</th><th class="num">Revenue</th><th class="num">Commission</th><th class="num">You keep</th><th class="num">Avg / night (kept)</th><th class="num">Cancelled</th><th class="num">Booked ahead</th><th class="num">Stay</th></tr></thead><tbody>' +
        list.map(function (x) { var r = x[1], share = total.rev ? r.rev / total.rev : 0, net = r.rev - r.com;
          return '<tr><td><b>' + esc(x[0]) + '</b></td><td><div class="cm-bar"><i style="width:' + Math.round(r.rev / max * 100) + '%"></i></div><small>' + Math.round(share * 100) + '%</small></td><td class="num">' + r.n + '</td><td class="num">' + r.nights + '</td><td class="num">' + inr(Math.round(r.rev)) + '</td><td class="num">' + inr(Math.round(r.com)) + '</td><td class="num"><b>' + inr(Math.round(net)) + '</b></td><td class="num">' + (r.nights ? inr(Math.round(net / r.nights)) : '—') + '</td><td class="num">' + (r.n + r.cancel ? Math.round(r.cancel / (r.n + r.cancel) * 100) + '%' : '—') + '</td><td class="num">' + (avg(r.lead) != null ? avg(r.lead) + ' d' : '—') + '</td><td class="num">' + (avg(r.los) != null ? avg(r.los) + ' n' : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="fo-empty">No bookings in this period.</div>');
    $('#pf-r', body).onchange = function () { perfRange = this.value; performance(body); };
  }

  // ------------------------------------------------------------ inventory settings ------------------------------------------------------------
  function inventoryCard() {
    return card('Inventory', 'units to sell per villa', '<p class="fo-hint">A whole villa sold to one group is 1 unit. If you sell rooms or suites of a villa separately, set how many. Per-night changes (for example 0 on a maintenance day) are made in Calendar → Bulk edit → Units.</p>' +
      '<div class="fo-tablewrap"><table class="fo-table"><thead><tr><th>Villa</th><th>Units</th><th></th></tr></thead><tbody>' + (D().properties || []).map(function (p) {
        return '<tr><td><b>' + esc(p.name) + '</b></td><td>' + input('un-' + p.property_id, Math.max(1, num(p.units) || 1), 'number', ' min="1" max="50" style="width:80px"' + (founder() ? '' : ' disabled')) + '</td><td>' + (founder() ? '<button class="btn btn--sm" data-units="' + esc(p.property_id) + '">Save</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>');
  }
  function wireInventory(body) { $$('[data-units]', body).forEach(function (b) { b.onclick = function () { save('f.cm.units', { villa: b.dataset.units, units: val(body, 'un-' + b.dataset.units) }, 'Units saved'); }; }); }

  window.FoChannelsCal = { view: view, plans: plans, performance: performance, inventoryCard: inventoryCard, wireInventory: wireInventory, bulkDrawer: function (d) { if (!cal.villa) cal.villa = defaultVilla(); bulkDrawer(d || [], null); } };
})();
