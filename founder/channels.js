/**
 * AP Villas Founder OS · AP Channel Manager (back end: docs/founder-os/FoChannels.gs; the hands: private repo ap-channel-agent).
 * Today (agent and channel health, kill switch) · Rate desk (recommended vs live per channel, tap nights, apply to every channel) ·
 * Availability (open / close / minimum stay / stop-sell per channel) · Jobs (state, read-back, evidence, approve / retry / cancel) ·
 * Reservations (allowlisted: no guest names, phones or emails) · Parity · Listings (paste OTA links) · Settings (modes, dry-run, keys, iCal).
 * Nothing here talks to an OTA: every change becomes a job the agent runs, reads back and proves.
 */
(function () {
  'use strict';
  var U = window.FoUI, S = U.S, M = U.M;
  var esc = U.esc, $ = U.$, $$ = U.$$, inr = U.inr, dmy = U.dmy, dm = U.dm, when = U.when, toast = U.toast, sel = U.sel, num = M.num;
  var CH = ['mmt', 'booking', 'airbnb'], NAMES = { mmt: 'MakeMyTrip / Goibibo', booking: 'Booking.com', airbnb: 'Airbnb' }, SHORT = { mmt: 'MMT', booking: 'Booking', airbnb: 'Airbnb' };
  var MODES = [['0', 'Observe (read only)'], ['1', 'Propose (I approve)'], ['2', 'Auto-band (small moves automatic)']];
  var TYPES = { rate: 'Price', open: 'Open', close: 'Close', min_stay: 'Min stay', stop_sell: 'Stop-sell' };
  var STATE_CLS = { proposed: 'fo-badge--gold', approved: '', queued: '', running: '', verifying: '', done: 'fo-badge--ok', failed: 'fo-badge--warn', needs_human: 'fo-badge--bad', rejected: '', cancelled: '' };
  var desk = { villa: null, rows: null, parity: null, loading: false, picked: {} };
  function D() { return S.data || {}; }
  function C() { return D().channel_manager || { settings: {}, listings: [], jobs: [], state: [], reservations: [], ical: {} }; }
  function founder() { return S.user && S.user.role === 'founder'; }
  function card(title, sub, body, tools) { return '<div class="fo-card"><h3>' + esc(title) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + (tools ? '<span class="fo-card__tools">' + tools + '</span>' : '') + '</h3>' + body + '</div>'; }
  function kpi(label, value, note, cls) { return '<div class="fo-card"><div class="fo-kpi__label">' + esc(label) + '</div><div class="fo-kpi__value' + (cls ? ' ' + cls : '') + '">' + value + '</div>' + (note ? '<div class="fo-kpi__cmp"><span class="flat">' + note + '</span></div>' : '') + '</div>'; }
  function badge(t, cls) { return '<span class="fo-badge' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</span>'; }
  function table(head, rows, empty, numCols) {
    numCols = numCols || [];
    if (!rows.length) return '<div class="fo-empty">' + esc(empty || 'Nothing yet.') + '</div>';
    return '<div class="fo-tablewrap"><table class="fo-table"><thead><tr>' + head.map(function (h, i) { return '<th' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function head(title, sub) { return '<div class="fo-drawer__head"><div><h2 class="serif" style="font-size:24px">' + esc(title) + '</h2>' + (sub ? '<div class="fo-hint">' + sub + '</div>' : '') + '</div><button class="fo-iconbtn" data-close aria-label="Close">' + U.icon('x') + '</button></div>'; }
  function field(label, html, full) { return '<label class="fo-field' + (full ? ' full' : '') + '">' + esc(label) + html + '</label>'; }
  function input(id, v, type, extra) { return '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(v == null ? '' : v) + '"' + (extra || '') + '>'; }
  function val(p, id) { var e = $('#' + id, p); return e ? (e.type === 'checkbox' ? e.checked : e.value) : ''; }
  function save(action, body, msg) { return U.api(action, body).then(function (j) { if (!j.ok) { toast(j.error, true); return j; } if (msg) toast(msg); desk.rows = null; return U.load(true).then(function () { return j; }); }); }
  function villas() { return (D().properties || []).map(function (p) { return [p.property_id, p.name]; }); }
  function vname(id) { return U.propName ? U.propName(id) : id; }
  function range(j) { return dm(j.date_from) + (j.date_to !== j.date_from ? ' → ' + dm(j.date_to) : ''); }
  function jobValue(j) { return j.type === 'rate' ? inr(num(j.new_value)) : j.type === 'min_stay' ? j.new_value + ' nights' : TYPES[j.type] || j.type; }
  function ageMin(ts) { return ts ? Math.round((Date.now() - Date.parse(ts)) / 60000) : null; }
  function ownOn(villa, ch) { return C().listings.some(function (l) { return l.role === 'own' && l.villa === villa && (l.platform === ch || (ch === 'mmt' && l.platform === 'goibibo')); }); }
  function wd(d) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T00:00:00Z').getUTCDay()]; }

  function view(page) {
    var T = U.tabs('channels', [['today', 'Today'], ['rates', 'Rate desk'], ['avail', 'Availability'], ['jobs', 'Jobs'], ['res', 'Reservations'], ['parity', 'Parity'], ['listings', 'Listings'], ['settings', 'Settings']]);
    page.innerHTML = U.hello('Channel Manager', 'One place for MakeMyTrip / Goibibo, Booking.com and Airbnb: prices, open and closed nights, minimum stays and bookings. Every change is run by your channel agent, read back from the extranet and proven with a screenshot.') + T.html + '<div id="cm"></div>';
    U.wireTabs(page, 'channels');
    ({ today: today, rates: rates, avail: avail, jobs: jobs, res: reservations, parity: parity, listings: listings, settings: settings }[T.cur] || today)($('#cm'));
  }

  // ------------------------------------------------------------ Today ------------------------------------------------------------
  function today(body) {
    var c = C(), hb = c.heartbeat, age = hb ? ageMin(hb.at) : null, js = c.jobs || [];
    var count = function (st) { return js.filter(function (j) { return j.state === st; }).length; };
    var agentOk = age != null && age <= 15, closures = js.filter(function (j) { return j.reason === 'booking_elsewhere' && ['queued', 'running', 'verifying'].indexOf(j.state) >= 0; });
    var setupLeft = [];
    if (!c.listings.some(function (l) { return l.role === 'own'; })) setupLeft.push('Add your own listing links (Listings tab) so the agent knows each villa on each channel.');
    if (!c.agent_key) setupLeft.push('Create the agent key (Settings) and put it on the agent machine.');
    if (!hb) setupLeft.push('Start the channel agent and sign in to each extranet once (from your phone through the private remote screen).');
    body.innerHTML = (c.global_paused ? '<div class="fo-alert fo-alert--bad"><b>Everything is paused.</b> The agent reads nothing and writes nothing until you resume. ' + (founder() ? '<button class="btn btn--sm" id="cm-resume-all">Resume all channels</button>' : '') + '</div>' : '') +
      (setupLeft.length ? card('Finish setting up', '', '<ol class="fo-steps">' + setupLeft.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>') : '') +
      '<div class="fo-grid fo-grid--kpi">' +
      kpi('Channel agent', agentOk ? 'Online' : hb ? 'Offline' : 'Not connected', hb ? 'last seen ' + (age < 1 ? 'just now' : age + ' min ago') + (hb.version ? ' · v' + esc(hb.version) : '') : 'no heartbeat yet', agentOk ? 'up' : 'down') +
      kpi('Waiting for you', String(count('proposed')), count('proposed') ? 'price changes to approve' : 'nothing to approve') +
      kpi('Running now', String(count('queued') + count('running') + count('verifying')), closures.length ? closures.length + ' booking closures first' : 'queue') +
      kpi('Needs you', String(count('needs_human')), count('needs_human') ? 'sign-in, OTP or a failed write' : 'all clear', count('needs_human') ? 'down' : '') + '</div>' +
      card('Channels', 'session and switches', table(['Channel', 'Listings', 'Mode', 'Session', 'Status', ''], CH.map(function (ch) {
        var s = c.settings[ch] || {}, sess = hb && hb.sessions && hb.sessions[ch], own = c.listings.filter(function (l) { return l.role === 'own' && (l.platform === ch || (ch === 'mmt' && l.platform === 'goibibo')); }).length;
        var status = !s.enabled ? badge('off') : s.paused ? badge('paused: ' + (s.pause_reason || ''), 'fo-badge--bad') : s.dryRun ? badge('dry-run until ' + dm(s.dry_until), 'fo-badge--gold') : badge('live', 'fo-badge--ok');
        return ['<b>' + esc(NAMES[ch]) + '</b>', own + ' own', esc((MODES[s.mode] || MODES[0])[1]), sess ? badge(sess, sess === 'ok' ? 'fo-badge--ok' : 'fo-badge--bad') : '—', status,
          founder() ? (s.paused ? '<button class="btn btn--sm" data-resume="' + ch + '">Resume</button>' : '<button class="btn btn--sm" data-pause="' + ch + '">Pause</button>') : ''];
      }))) +
      card('Latest activity', '', table(['When', 'Villa', 'Channel', 'Change', 'Nights', 'State'], js.slice().sort(function (a, b) { return String(b.done_at || b.approved_at || b.created_at) < String(a.done_at || a.approved_at || a.created_at) ? -1 : 1; }).slice(0, 12).map(function (j) {
        return [when(j.done_at || j.approved_at || j.created_at), esc(vname(j.villa)), esc(SHORT[j.channel]), jobValue(j) + (j.reason === 'booking_elsewhere' ? ' <small class="fo-hint">booked elsewhere</small>' : ''), range(j), badge(j.state.replace('_', ' '), STATE_CLS[j.state])];
      }), 'No changes yet.')) +
      (founder() ? '<div class="fo-toolbar"><button class="btn btn--danger" id="cm-kill">' + (c.global_paused ? 'Resume everything' : 'Kill switch: pause every channel') + '</button><button class="btn" id="cm-sync">Re-check bookings and closures now</button></div>' : '');
    var k = $('#cm-kill'); if (k) k.onclick = function () { if (c.global_paused || confirm('Pause every channel now? The agent will stop reading and writing until you resume.')) save('f.cm.killswitch', { on: !c.global_paused }, c.global_paused ? 'Resumed' : 'Everything paused'); };
    var ra = $('#cm-resume-all'); if (ra) ra.onclick = function () { save('f.cm.killswitch', { on: false }, 'Resumed'); };
    var sy = $('#cm-sync'); if (sy) sy.onclick = function () { save('f.cm.sync', {}).then(function (j) { if (j.ok) toast(j.result.closed + ' closures queued · ' + j.result.reopen + ' re-openings proposed'); }); };
    $$('[data-pause]', body).forEach(function (b) { b.onclick = function () { save('f.cm.killswitch', { scope: b.dataset.pause, on: true }, 'Paused'); }; });
    $$('[data-resume]', body).forEach(function (b) { b.onclick = function () { save('f.cm.killswitch', { scope: b.dataset.resume, on: false }, 'Resumed'); }; });
  }

  // ------------------------------------------------------------ Rate desk ------------------------------------------------------------
  function loadDesk(body, fn) {
    if (!desk.villa) desk.villa = (villas().filter(function (v) { return CH.some(function (c) { return ownOn(v[0], c); }); })[0] || villas()[0] || [])[0];
    if (desk.rows && desk.rows.villa === desk.villa) return fn();
    body.innerHTML = '<div class="fo-empty">Loading the 30-night desk…</div>';
    U.api('f.cm.ratedesk', { villa: desk.villa, days: 30 }).then(function (j) {
      if (!j.ok) { body.innerHTML = '<div class="fo-empty">' + esc(j.error || 'Could not load the desk.') + '</div>'; return; }
      desk.rows = j.desk || []; desk.rows.villa = j.villa; desk.parity = j.parity || []; desk.settings = j.settings; fn();
    });
  }
  function villaBar(id) { return sel(id, villas(), desk.villa); }
  function rates(body) {
    loadDesk(body, function () {
      var picked = Object.keys(desk.picked).filter(function (d) { return desk.picked[d]; });
      body.innerHTML = '<div class="fo-toolbar">' + villaBar('rd-v') + (founder() ? '<button class="btn btn--primary" id="rd-propose">Propose prices from the desk</button><button class="btn" id="rd-set"' + (picked.length ? '' : ' disabled') + '>Set price for ' + picked.length + ' night' + (picked.length === 1 ? '' : 's') + '</button>' : '') +
        '<span class="fo-hint">Recommended = the Live Pricing Desk\'s price that sells, plus each channel\'s commission, rounded to ₹50 and kept inside your floor and ceiling. Live = what the agent last read on the extranet.</span></div>' +
        table(['', 'Night', 'You keep', 'Chance'].concat(CH.map(function (c) { return esc(SHORT[c]) + '<br><small>live · recommended</small>'; })), desk.rows.map(function (n) {
          var cells = CH.map(function (c) {
            var x = n.channels[c]; if (!x) return '—';
            var diff = x.live != null && x.live !== x.list, own = ownOn(desk.villa, c);
            return (x.live != null ? inr(x.live) : '<span class="fo-hint">—</span>') + ' · <b' + (diff ? ' class="fo-warn"' : '') + '>' + inr(x.list) + '</b>' + (x.available === 'no' ? ' ' + badge('closed') : '') + (!own ? '<br><small class="fo-hint">no listing</small>' : '');
          });
          var tag = n.booked ? badge('booked', 'fo-badge--ok') : n.blocked ? badge('blocked') : '';
          return ['<input type="checkbox" data-pick="' + n.date + '"' + (desk.picked[n.date] ? ' checked' : '') + (n.booked || n.blocked ? ' disabled' : '') + ' aria-label="Pick ' + n.date + '">', '<b>' + wd(n.date) + ' ' + dm(n.date) + '</b> ' + tag,
            inr(n.net) + '<br><small class="fo-hint">' + inr(n.floor) + '–' + inr(n.ceiling) + '</small>', n.chance != null ? n.chance + '%' : '—'].concat(cells);
        }), 'No nights to show.', [2, 3]);
      $('#rd-v').onchange = function () { desk.villa = this.value; desk.rows = null; desk.picked = {}; rates(body); };
      $$('[data-pick]', body).forEach(function (b) { b.onchange = function () { desk.picked[b.dataset.pick] = b.checked; rates(body); }; });
      var pr = $('#rd-propose'); if (pr) pr.onclick = function () { save('f.cm.jobs.propose', { villa: desk.villa, days: 30 }).then(function (j) { if (j.ok) toast(j.result.proposed + ' changes to approve · ' + j.result.auto + ' automatic (auto-band) · ' + j.result.duplicates + ' already queued'); }); };
      var st = $('#rd-set'); if (st) st.onclick = function () { changeDrawer('rate', picked); };
    });
  }
  /** One drawer for every manual change: price (net or channel), open, close, min stay, stop-sell, on any channels. */
  function changeDrawer(type, dates) {
    var p = U.drawer(head(TYPES[type] + ' · ' + vname(desk.villa), dates.length + ' night' + (dates.length === 1 ? '' : 's') + ': ' + dates.slice(0, 8).map(dm).join(', ') + (dates.length > 8 ? '…' : '')) +
      '<div class="fo-form">' + (type === 'rate' ? field('Price', input('ch-v', '', 'number', ' min="500" step="50" inputmode="numeric"')) + field('This price is', sel('ch-b', [['net', 'what I keep (commission added per channel)'], ['channel', 'the price guests see on the channel']], 'net')) :
        type === 'min_stay' ? field('Minimum nights', input('ch-v', '2', 'number', ' min="1" max="30"')) : '') +
      field('Channels', '<div class="fo-checks">' + CH.map(function (c) { return '<label><input type="checkbox" data-chk="' + c + '" checked> ' + esc(NAMES[c]) + '</label>'; }).join(' ') + '</div>', true) +
      field('Approve now', '<label><input type="checkbox" id="ch-ok" checked> send to the agent straight away (prices outside your floor/ceiling are refused)</label>', true) + '</div>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="ch-go">Apply</button></div><div id="ch-out"></div>');
    $('#ch-go', p).onclick = function () {
      var chans = $$('[data-chk]', p).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.chk; });
      if (!chans.length) return toast('Choose at least one channel.', true);
      var m = { villa: desk.villa, dates: dates, type: type, channels: chans };
      if (type === 'rate' || type === 'min_stay') { m.value = num(val(p, 'ch-v')); if (!m.value) return toast('Enter the value.', true); }
      if (type === 'rate') m.basis = val(p, 'ch-b');
      save('f.cm.jobs.propose', { manual: m, approve: val(p, 'ch-ok') }).then(function (j) {
        if (!j.ok) return;
        $('#ch-out', p).innerHTML = '<p>' + j.result.created.length + ' job' + (j.result.created.length === 1 ? '' : 's') + ' created.</p>' + (j.result.errors.length ? '<ul class="fo-hint">' + j.result.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' : '');
        desk.picked = {}; if (!j.result.errors.length) setTimeout(function () { if (p.parentNode) p.parentNode.remove(); }, 900);
      });
    };
  }

  // ------------------------------------------------------------ Availability ------------------------------------------------------------
  function avail(body) {
    loadDesk(body, function () {
      var c = C(), st = {}; (c.state || []).forEach(function (r) { if (r.villa === desk.villa) st[r.channel + '|' + String(r.date).slice(0, 10)] = r; });
      var picked = Object.keys(desk.picked).filter(function (d) { return desk.picked[d]; });
      body.innerHTML = '<div class="fo-toolbar">' + villaBar('av-v') + (founder() ? ['close', 'open', 'min_stay', 'stop_sell'].map(function (t) { return '<button class="btn' + (t === 'close' ? ' btn--primary' : '') + '" data-av="' + t + '"' + (picked.length ? '' : ' disabled') + '>' + TYPES[t] + '</button>'; }).join('') : '') +
        '<span class="fo-hint">Tick nights, then choose an action. Bookings on any channel, direct bookings and your blocks close the other channels automatically.</span></div>' +
        table(['', 'Night', 'Ledger'].concat(CH.map(function (x) { return esc(SHORT[x]); })), desk.rows.map(function (n) {
          return ['<input type="checkbox" data-pick="' + n.date + '"' + (desk.picked[n.date] ? ' checked' : '') + '>', '<b>' + wd(n.date) + ' ' + dm(n.date) + '</b>', n.booked ? badge('booked', 'fo-badge--ok') : n.blocked ? badge('blocked') : badge('free')].concat(CH.map(function (x) {
            var r = st[x + '|' + n.date]; if (!r) return '<span class="fo-hint">not read</span>';
            return (r.available === 'no' ? badge('closed', 'fo-badge--bad') : r.available === 'yes' ? badge('open', 'fo-badge--ok') : '') + (r.stop_sell === 'yes' ? ' ' + badge('stop-sell') : '') + (r.min_stay ? ' <small>min ' + r.min_stay + '</small>' : '');
          }));
        }), 'No nights.');
      $('#av-v').onchange = function () { desk.villa = this.value; desk.rows = null; desk.picked = {}; avail(body); };
      $$('[data-pick]', body).forEach(function (b) { b.onchange = function () { desk.picked[b.dataset.pick] = b.checked; avail(body); }; });
      $$('[data-av]', body).forEach(function (b) { b.onclick = function () { changeDrawer(b.dataset.av, picked); }; });
    });
  }

  // ------------------------------------------------------------ Jobs ------------------------------------------------------------
  var jobFilter = 'open';
  function jobs(body) {
    var all = (C().jobs || []).slice().sort(function (a, b) { return String(b.created_at) < String(a.created_at) ? -1 : 1; });
    var open = ['proposed', 'approved', 'queued', 'running', 'verifying', 'failed', 'needs_human'];
    var list = all.filter(function (j) { return jobFilter === 'all' || (jobFilter === 'open' ? open.indexOf(j.state) >= 0 : j.state === jobFilter); });
    var proposed = all.filter(function (j) { return j.state === 'proposed'; });
    body.innerHTML = '<div class="fo-toolbar">' + sel('jb-f', [['open', 'Open'], ['proposed', 'To approve'], ['needs_human', 'Needs you'], ['done', 'Done'], ['all', 'Last 14 days']], jobFilter) +
      (founder() && proposed.length ? '<button class="btn btn--primary" id="jb-all">Approve all within band (' + proposed.length + ')</button><button class="btn" id="jb-sel">Approve selected</button><button class="btn" id="jb-rej">Reject selected</button>' : '') + '</div>' +
      table(['', 'Villa', 'Channel', 'Change', 'Was', 'Nights', 'State', 'Read back', ''], list.slice(0, 300).map(function (j) {
        var ev = j.evidence_ref ? ' <a href="https://drive.google.com/file/d/' + encodeURIComponent(j.evidence_ref) + '/view" target="_blank" rel="noopener">screenshot</a>' : '';
        return [j.state === 'proposed' ? '<input type="checkbox" data-jsel="' + esc(j.job_id) + '">' : '', esc(vname(j.villa)), esc(SHORT[j.channel]),
          jobValue(j) + (j.reason === 'booking_elsewhere' ? '<br><small class="fo-hint">booked elsewhere</small>' : j.approved_by === 'auto-band' ? '<br><small class="fo-hint">auto-band</small>' : ''),
          j.old_value !== '' && j.type === 'rate' ? inr(num(j.old_value)) : '—', range(j), badge(j.state.replace('_', ' '), STATE_CLS[j.state]) + (j.error_code ? '<br><small class="fo-hint">' + esc(j.error_code) + '</small>' : ''),
          esc(j.read_back === 'dry_run' ? 'dry run' : j.read_back || '') + ev + (j.message ? '<br><small class="fo-hint">' + esc(j.message) + '</small>' : ''),
          founder() ? (['failed', 'needs_human'].indexOf(j.state) >= 0 ? '<button class="btn btn--sm" data-retry="' + esc(j.job_id) + '">Retry</button> ' : '') + (['proposed', 'approved', 'queued', 'failed', 'needs_human'].indexOf(j.state) >= 0 ? '<button class="btn btn--sm" data-cancel="' + esc(j.job_id) + '">Cancel</button>' : '') : ''];
      }), 'No jobs here.');
    $('#jb-f').onchange = function () { jobFilter = this.value; jobs(body); };
    var picked = function () { return $$('[data-jsel]', body).filter(function (x) { return x.checked; }).map(function (x) { return x.dataset.jsel; }); };
    var a = $('#jb-all'); if (a) a.onclick = function () { save('f.cm.jobs.approve', { all_within_band: true }).then(function (j) { if (j.ok) toast(j.result.approved + ' approved'); }); };
    var s = $('#jb-sel'); if (s) s.onclick = function () { var ids = picked(); if (!ids.length) return toast('Tick some jobs first.', true); save('f.cm.jobs.approve', { job_ids: ids }, 'Approved'); };
    var r = $('#jb-rej'); if (r) r.onclick = function () { var ids = picked(); if (!ids.length) return toast('Tick some jobs first.', true); save('f.cm.jobs.cancel', { job_ids: ids, reject: true }, 'Rejected'); };
    $$('[data-retry]', body).forEach(function (b) { b.onclick = function () { save('f.cm.jobs.retry', { job_id: b.dataset.retry }, 'Queued again'); }; });
    $$('[data-cancel]', body).forEach(function (b) { b.onclick = function () { save('f.cm.jobs.cancel', { job_id: b.dataset.cancel }, 'Cancelled'); }; });
  }

  // ------------------------------------------------------------ Reservations ------------------------------------------------------------
  function reservations(body) {
    var rs = (C().reservations || []).slice().sort(function (a, b) { return a.checkin < b.checkin ? -1 : 1; });
    var bk = D().bookings || [];
    body.innerHTML = '<p class="fo-hint">Read from each extranet by the agent. Only the reservation number, villa, dates, amount and status are kept (never guest names, phones or emails); each one is in your booking ledger and closes the other channels.</p>' +
      table(['Channel', 'Reservation', 'Villa', 'Stay', 'Amount', 'Status', 'Ledger'], rs.map(function (r) {
        var inLedger = bk.some(function (b) { return String(b.external_id) === String(r.reservation_id); });
        return [esc(SHORT[r.channel]), esc(r.reservation_id), esc(vname(r.villa)), dm(r.checkin) + ' → ' + dm(r.checkout), r.amount !== '' ? inr(num(r.amount)) : '—', badge(r.status, r.status === 'cancelled' ? 'fo-badge--bad' : 'fo-badge--ok'), inLedger ? '✓' : badge('check', 'fo-badge--warn')];
      }), 'No channel reservations read yet.', [4]);
  }

  // ------------------------------------------------------------ Parity ------------------------------------------------------------
  function parity(body) {
    loadDesk(body, function () {
      var p = desk.parity || [];
      body.innerHTML = '<div class="fo-toolbar">' + villaBar('pa-v') + '<span class="fo-hint">Same villa and night across channels: direct must stay the cheapest, and channels should not drift more than 15% apart.</span></div>' +
        table(['Night', 'Direct (you keep)', 'Cheapest channel', 'Dearest channel', 'Issue'], p.map(function (x) {
          return [wd(x.date) + ' ' + dm(x.date), inr(x.direct), inr(x.min) + ' ' + esc(SHORT[x.min_channel]), inr(x.max) + ' ' + esc(SHORT[x.max_channel]), badge(x.issue, 'fo-badge--warn')];
        }), 'No parity issues in the next 30 nights (or no live rates read yet).', [1, 2, 3]);
      $('#pa-v').onchange = function () { desk.villa = this.value; desk.rows = null; parity(body); };
    });
  }

  // ------------------------------------------------------------ Listings ------------------------------------------------------------
  function listings(body) {
    var ls = C().listings || [];
    body.innerHTML = (founder() ? card('Add listing links', 'paste one or many', '<div class="fo-form">' + field('Links (Airbnb, Booking.com, MakeMyTrip, Goibibo)', '<textarea id="ls-u" rows="4" placeholder="https://www.airbnb.co.in/rooms/…"></textarea>', true) +
      field('These are', sel('ls-r', [['competitor', 'Competitors (watched for prices)'], ['own', 'My own villa']], 'competitor')) + field('Villa (own listings)', sel('ls-v', [['', '—']].concat(villas()), '')) +
      field('Comp set', sel('ls-c', [['', '—'], ['2br', '2-bedroom'], ['3br', '3-bedroom'], ['hotel_2rooms', 'Hotel, 2 rooms']], '')) + field('Bedrooms', input('ls-b', '', 'number')) + field('Sleeps', input('ls-s', '', 'number')) + field('Check', sel('ls-sc', [['daily', 'Daily'], ['weekly', 'Weekly']], 'daily')) + '</div>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="ls-go">Add</button><span class="fo-hint">Tracking parts of links are removed. The same listing is never added twice.</span></div>') : '') +
      table(['Platform', 'Name / id', 'Role', 'Villa', 'Extranet ids', 'Size', 'Status', ''], ls.map(function (l) {
        return [esc(l.platform), '<a href="' + esc(l.url_clean) + '" target="_blank" rel="noopener">' + esc(l.name || l.platform_listing_id) + '</a>', l.role === 'own' ? badge('own', 'fo-badge--gold') : 'competitor', esc(l.villa ? vname(l.villa) : '—'),
          esc([l.extranet_property_id, l.extranet_room_id].filter(Boolean).join(' / ') || '—'), esc([l.bedrooms ? l.bedrooms + ' BR' : '', l.sleeps ? 'sleeps ' + l.sleeps : ''].filter(Boolean).join(' · ') || '—'), badge(l.status, l.status === 'active' ? 'fo-badge--ok' : ''),
          founder() ? '<button class="btn btn--sm" data-ls="' + esc(l.listing_id) + '">Edit</button>' : ''];
      }), 'No listings yet. Paste your own villa links first, then competitors.');
    var go = $('#ls-go'); if (go) go.onclick = function () {
      save('f.cm.listings.add', { urls: val(body, 'ls-u'), role: val(body, 'ls-r'), villa: val(body, 'ls-v'), comp_set: val(body, 'ls-c'), bedrooms: val(body, 'ls-b'), sleeps: val(body, 'ls-s'), schedule: val(body, 'ls-sc') }).then(function (j) {
        if (j.ok) toast(j.result.added + ' added · ' + j.result.skipped + ' already known' + (j.result.rejected.length ? ' · ' + j.result.rejected.length + ' links not recognised' : ''), !!j.result.rejected.length);
      });
    };
    $$('[data-ls]', body).forEach(function (b) { b.onclick = function () { listingDrawer(ls.filter(function (l) { return l.listing_id === b.dataset.ls; })[0]); }; });
  }
  function listingDrawer(l) {
    var p = U.drawer(head('Listing', esc(l.url_clean)) + '<div class="fo-form">' + field('Name', input('le-n', l.name)) + field('Role', sel('le-r', [['competitor', 'Competitor'], ['own', 'My own villa']], l.role)) + field('Villa', sel('le-v', [['', '—']].concat(villas()), l.villa)) +
      field('Extranet property id', input('le-p', l.extranet_property_id)) + field('Extranet room id', input('le-rm', l.extranet_room_id)) + field('Bedrooms', input('le-b', l.bedrooms, 'number')) + field('Sleeps', input('le-s', l.sleeps, 'number')) +
      field('Status', sel('le-st', [['active', 'Active'], ['paused', 'Paused'], ['broken', 'Link broken']], l.status)) + '</div>' +
      '<p class="fo-hint">Extranet ids: the agent\'s discovery run lists them for you to confirm. They are kept only in your private Sheet.</p>' +
      '<div class="fo-toolbar"><button class="btn btn--primary" id="le-go">Save</button><button class="btn btn--danger" id="le-del">Remove</button></div>');
    $('#le-go', p).onclick = function () { save('f.cm.listings.update', { listing: { listing_id: l.listing_id, name: val(p, 'le-n'), role: val(p, 'le-r'), villa: val(p, 'le-v'), extranet_property_id: val(p, 'le-p'), extranet_room_id: val(p, 'le-rm'), bedrooms: val(p, 'le-b'), sleeps: val(p, 'le-s'), status: val(p, 'le-st') } }, 'Saved').then(function (j) { if (j.ok) p.parentNode.remove(); }); };
    $('#le-del', p).onclick = function () { if (confirm('Remove this listing?')) save('f.cm.listings.delete', { listing_id: l.listing_id }, 'Removed').then(function (j) { if (j.ok) p.parentNode.remove(); }); };
  }

  // ------------------------------------------------------------ Settings ------------------------------------------------------------
  function settings(body) {
    var c = C(), f = founder();
    body.innerHTML = card('Channels', 'mode, dry-run, commission', table(['Channel', 'On', 'Mode', 'Dry-run', 'Commission %', 'Channel markup %', ''], CH.map(function (ch) {
      var s = c.settings[ch] || {};
      return ['<b>' + esc(NAMES[ch]) + '</b>', '<input type="checkbox" data-on="' + ch + '"' + (s.enabled ? ' checked' : '') + (f ? '' : ' disabled') + '>', sel('md-' + ch, MODES, String(s.mode || 0)),
        '<input type="checkbox" data-dry="' + ch + '"' + (s.dryRun ? ' checked' : '') + (f ? '' : ' disabled') + '>' + (s.dryRun && s.dry_until ? ' <small class="fo-hint">until ' + dm(s.dry_until) + '</small>' : ''),
        input('cp-' + ch, Math.round((s.commission || 0) * 100), 'number', ' min="0" max="50" style="width:70px"'), input('mk-' + ch, Math.round((s.markup || 0) * 100), 'number', ' min="-30" max="30" style="width:70px"'),
        f ? '<button class="btn btn--sm" data-save="' + ch + '">Save</button>' : ''];
    })) + '<p class="fo-hint"><b>Observe</b>: the agent only reads. <b>Propose</b>: price changes wait for your tap. <b>Auto-band</b>: changes inside your floor and ceiling, within 10% of the last price, at most once a day per night and never within a day of a booking go automatically. Dry-run: the agent fills the form and takes a screenshot but does not save (first 3 days of every channel).</p>') +
      card('Channel agent', c.heartbeat ? 'last seen ' + when(c.heartbeat.at) : 'not connected', '<p>' + (c.agent_key ? 'An agent key is active.' : 'No agent key yet.') + ' The key lets the agent pull jobs and report what it reads; it cannot see guests or bookings. It is shown once: put it in the agent machine\'s .env file, never in a repository.</p>' +
        (f ? '<div class="fo-toolbar"><button class="btn btn--primary" id="ag-new">' + (c.agent_key ? 'Replace the agent key' : 'Create the agent key') + '</button>' + (c.agent_key ? '<button class="btn btn--danger" id="ag-rev">Revoke</button>' : '') + '</div><div id="ag-out"></div>' : '')) +
      card('Calendar feeds (iCal)', 'safety net', '<p>Import these into Airbnb (Calendar → Availability → Connect calendars) and Booking.com (Rates & availability → Sync calendars). Even when the agent is offline, nights booked anywhere stay closed there. Busy dates only, no guest data.</p>' +
        (Object.keys(c.ical || {}).length ? table(['Villa', 'Feed link'], Object.keys(c.ical).map(function (v) { return [esc(vname(v)), '<input readonly value="' + esc(c.ical[v]) + '" class="cm-copy" style="width:100%">']; })) : '') +
        (f ? '<div class="fo-toolbar"><button class="btn" id="ic-new">' + (Object.keys(c.ical || {}).length ? 'New links (old ones stop working)' : 'Create feed links') + '</button></div>' : ''));
    $$('.cm-copy', body).forEach(function (x) { x.onfocus = function () { x.select(); }; });
    $$('[data-save]', body).forEach(function (b) {
      b.onclick = function () {
        var ch = b.dataset.save;
        save('f.cm.settings.set', { settings: { channel: ch, enabled: $('[data-on="' + ch + '"]', body).checked, mode: num(val(body, 'md-' + ch)), dry_run: $('[data-dry="' + ch + '"]', body).checked, commission_pct: num(val(body, 'cp-' + ch)), markup_pct: num(val(body, 'mk-' + ch)) } }, NAMES[ch] + ' saved');
      };
    });
    var an = $('#ag-new'); if (an) an.onclick = function () {
      if (c.agent_key && !confirm('Replace the agent key? The agent stops until you put the new key on it.')) return;
      U.api('f.cm.agent.key', {}).then(function (j) { if (!j.ok) return toast(j.error, true); $('#ag-out', body).innerHTML = '<div class="fo-alert"><b>Copy this now (shown once):</b><br><input readonly value="' + esc(j.key) + '" class="cm-copy" style="width:100%"><br><small>' + esc(j.note) + '</small></div>'; var k = $('#ag-out .cm-copy', body); k.focus(); k.select(); });
    };
    var ar = $('#ag-rev'); if (ar) ar.onclick = function () { if (confirm('Revoke the agent key? The agent stops at once.')) save('f.cm.agent.revoke', {}, 'Agent key revoked'); };
    var ic = $('#ic-new'); if (ic) ic.onclick = function () { save('f.cm.ical.token', {}, 'Feed links ready'); };
  }

  U.VIEWS.channels = view;
  window.FoChannels = { view: view };
})();
