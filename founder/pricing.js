/**
 * AP Villas Founder OS · Pricing & Market module (+ the Automation tab in Settings).
 * Reference rates from FoInsights.pricing (shared engine). The portal never changes live prices: you set prices on the OTAs/WhatsApp.
 * Competitor prices are dated public observations, not proof of what anyone sold at.
 */
(function () {
  'use strict';
  var U = window.FoUI, I = window.FoInsights, M = U.M, C = U.C, S = U.S;
  var esc = U.esc, $ = U.$, $$ = U.$$, inr = U.inr, pct = U.pct, dmy = U.dmy, dm = U.dm, when = U.when, toast = U.toast, sel = U.sel;
  var num = M.num;
  function today() { return U.today(); }
  function table(head, rows, empty, numCols) {
    if (!rows.length) return '<div class="fo-empty">' + esc(empty || 'Nothing yet.') + '</div>';
    numCols = numCols || [];
    return '<div class="fo-tablewrap"><table class="fo-table"><thead><tr>' + head.map(function (h, i) { return '<th' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr' + (r.attrs || '') + '>' + (r.cells || r).map(function (c, i) { return '<td' + (numCols.indexOf(i) >= 0 ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function card(title, sub, body, tools) { return '<div class="fo-card"><h3>' + esc(title) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + (tools ? '<span class="fo-card__tools">' + tools + '</span>' : '') + '</h3>' + body + '</div>'; }
  function save(action, body, msg, after) { return U.api(action, body).then(function (j) { if (!j.ok) { toast(j.error, true); return j; } if (msg) toast(msg); return U.load(true).then(function () { if (after) after(j); return j; }); }); }
  function link(u) { return /^https?:\/\//.test(u || '') ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">source ↗</a>' : '<span class="fo-hint">—</span>'; }
  function confBadge(c) { return '<span class="fo-badge ' + (c === 'high' ? '' : c === 'medium' ? 'fo-badge--gold' : 'fo-badge--muted') + '">' + esc(c) + '</span>'; }
  function data() { return S.data; }

  // ============================================================ view ============================================================
  function viewPricing(page) {
    var T = U.tabs('pricing', [['today', 'Today'], ['calendar', '90 nights'], ['comp', 'Competitors'], ['forecast', 'Forecast'], ['analytics', 'Analytics'], ['news', 'News'], ['ratecheck', 'Rate check'], ['observations', 'Market prices'], ['health', 'Signal health'], ['outlook', 'Outlook'], ['perf', 'Performance'], ['rates', 'Rate guide (v1)'], ['desk', 'Settings']]);
    var D = data(), obs = D.market_rates || [], latest = obs.map(function (r) { return r.observed_at; }).sort().pop();
    page.innerHTML = U.hello('Pricing desk', 'The price to set on each channel, tonight and for the next 90 nights, from your bookings, the Hindu calendar, holidays, weather, demand and your competitors. Recommendations only: nothing changes your OTA prices. ' +
      (latest ? 'Competitor prices last seen ' + esc(dmy(latest)) + '.' : 'No competitor prices yet: use Rate check.')) + T.html + '<div id="pr"></div>';
    U.wireTabs(page, 'pricing');
    var body = $('#pr');
    if (!K) { body.innerHTML = '<div class="fo-empty">The pricing desk script did not load. Reload the page.</div>'; return; }
    ({ today: deskToday, calendar: deskCalendar, comp: deskComp, forecast: deskForecast, analytics: deskAnalytics, news: deskNews, ratecheck: rateCheck, observations: observations, health: deskHealth, outlook: deskOutlook, perf: deskPerf, rates: rates, desk: deskSettings, competitors: deskComp, signals: deskHealth, engine: deskSettings }[T.cur] || deskToday)(body);
  }

  // ============================================================ Live Pricing Desk (v2, FoDesk) ============================================================
  var K = window.FoDesk, CH = [['direct', 'Direct / WhatsApp'], ['airbnb', 'Airbnb'], ['booking', 'Booking.com'], ['makemytrip', 'MakeMyTrip']];
  function cfgDesk() { return K.settings(data()); }
  function deskProps() { var ids = cfgDesk().properties; return (data().properties || []).filter(function (p) { return ids.indexOf(p.property_id) >= 0; }); }
  function deskPid() { var ps = deskProps(); return ps.some(function (p) { return p.property_id === S.dkP; }) ? S.dkP : (ps[0] || {}).property_id; }
  function propSel(id) { return sel(id, deskProps().map(function (p) { return [p.property_id, p.name]; }), deskPid()); }
  /** Calendars are cached per data load (they are pure functions of the bundle). */
  function deskCal(pid) { var D = data(), k = 'cal:' + pid + ':' + D.serverTime; S.dkCache = S.dkCache && S.dkCache.at === D.serverTime ? S.dkCache : { at: D.serverTime }; return S.dkCache[k] || (S.dkCache[k] = K.calendar(D, pid, 90)); }
  function confMeter(c) { var cls = c >= 75 ? '' : c >= 50 ? 'fo-badge--gold' : 'fo-badge--warn'; return '<span class="fo-badge ' + cls + '" title="Confidence 0–100: how many inputs are live and how many competitor prices back this night">' + c + '/100</span>'; }
  function signed(v) { return (v >= 0 ? '+' : '−') + inr(Math.abs(Math.round(v))); }
  function wday(d) { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function copyBtn(v) { return '<button class="btn btn--sm dk-copy" data-copy="' + v + '" title="Copy ' + v + '">Copy</button>'; }
  function wireCopy(root) { $$('.dk-copy', root).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); var v = b.dataset.copy; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('Copied ' + v); }, function () { window.prompt('Copy the price', v); }); }; }); }
  function statusOf(q) { return q.booked ? '<span class="fo-badge fo-badge--muted">booked</span>' : q.blocked ? '<span class="fo-badge fo-badge--muted">blocked</span>' : ''; }

  // ---------- Today ----------
  function deskToday(body) {
    var D = data(), cards = deskProps().map(function (p) { return K.today(D, p.property_id); }).filter(Boolean);
    var h = K.health(D), down = h.filter(function (x) { return x.kind !== 'own' && x.status !== 'live'; });
    body.innerHTML = '<div class="fo-note" style="margin-bottom:14px"><b>Set these prices on each channel.</b> Direct is the guest’s best deal; each OTA price is grossed up for its commission so you keep the same. ' +
      'Now: <b>' + esc(cards[0] ? cards[0].slot_label : '') + '</b>. ' + (down.length ? '<a href="#" id="dk-h">' + down.length + ' of ' + h.filter(function (x) { return x.kind !== 'own'; }).length + ' outside signals are not live</a>: confidence is lower until they are.' : 'All signals live.') + '</div>' +
      newsStrip(D) +
      '<div class="dk-today">' + cards.map(function (c) { return '<section class="fo-card dk-prop"><h3>' + esc(c.name) + '</h3>' + night(c, c.tonight, 'Tonight') + night(c, c.tomorrow, 'Tomorrow') + '</section>'; }).join('') + '</div>';
    var hl = $('#dk-h'); if (hl) hl.onclick = function (e) { e.preventDefault(); location.hash = '#/pricing/health'; };
    wireCopy(body);
    $$('[data-acc]', body).forEach(function (b) { b.onclick = function () { decide(b.dataset.p, b.dataset.d, Number(b.dataset.acc), true); }; });
    $$('[data-ovr]', body).forEach(function (b) { b.onclick = function () { decide(b.dataset.p, b.dataset.d, Number(b.dataset.ovr), false); }; });
    $$('[data-why]', body).forEach(function (b) { b.onclick = function () { waterfall(b.dataset.p, b.dataset.d); }; });
  }
  function night(c, q, label) {
    var st = statusOf(q), last = (data().price_decisions || []).filter(function (x) { return x.property === c.property && String(x.for_date).slice(0, 10) === q.date; }).pop();
    return '<div class="dk-night"><div class="dk-night__head"><div><b>' + label + '</b> <span class="fo-hint">' + esc(wday(q.date)) + '</span> ' + st + (q.event ? ' <span class="fo-badge fo-badge--gold">event</span>' : '') + '</div>' + confMeter(q.confidence) + '</div>' +
      (q.booked || q.blocked ? '<p class="fo-hint">Nothing to set: this villa is ' + (q.booked ? 'booked' : 'blocked') + ' for the night.</p>' :
      '<div class="dk-chan">' + CH.map(function (k) { var x = q.channels[k[0]]; return '<div class="dk-chan__row"><span>' + esc(k[1]) + '</span><b>' + inr(x.price) + '</b>' + copyBtn(x.price) + '<small class="fo-hint">' + (x.commission ? 'you keep ' + inr(x.net) : 'no commission') + '</small></div>'; }).join('') + '</div>' +
      '<div class="fo-hint" style="margin:6px 0">Range ' + inr(q.low) + '–' + inr(q.high) + ' net' + (q.next_step ? ' · <b>from ' + esc(q.next_step.at) + ' drop to ' + inr(q.next_step.price) + '</b> net if still unsold' : '') + '</div>' +
      marketLine(q) +
      (q.top && q.top.length ? '<ul class="dk-why">' + q.top.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      (q.reasons.length ? '<p class="fo-hint">' + q.reasons.map(esc).join(' · ') + '</p>' : '') +
      '<div class="fo-toolbar" style="margin-top:8px"><button class="btn btn--primary btn--sm" data-acc="' + q.price + '" data-p="' + esc(c.property) + '" data-d="' + q.date + '">Accept ' + inr(q.price) + '</button><button class="btn btn--sm" data-ovr="' + q.price + '" data-p="' + esc(c.property) + '" data-d="' + q.date + '">Override…</button><button class="btn btn--sm" data-why data-p="' + esc(c.property) + '" data-d="' + q.date + '">Why?</button></div>' +
      (last ? '<p class="fo-hint">Last decision: ' + (last.accepted === 'yes' ? 'accepted ' : 'set ') + inr(num(last.set_price)) + ' (' + esc(last.channel) + ') ' + when(last.decided_at) + '</p>' : '')) + '</div>';
  }
  function marketLine(q) {
    var m = q.market, bits = [];
    if (m.n >= 3) bits.push('Competitors ' + inr(m.p25) + '–' + inr(m.p75) + ' (median ' + inr(m.median) + ', ' + m.n + ' homes)');
    else if (m.estimate) bits.push('Competitors ≈ ' + inr(m.estimate.median) + ' (estimated from nearby nights)');
    if (m.position != null) bits.push('your direct price is above ' + m.position + '% of them');
    if (m.sellout != null && m.seen >= 3) bits.push(Math.round(m.sellout * 100) + '% sold out');
    if (m.momentum && Math.abs(m.momentum.change) >= 0.05) bits.push('market ' + (m.momentum.change > 0 ? 'rising' : 'falling') + ' ' + Math.round(Math.abs(m.momentum.change) * 100) + '% since ' + dm(m.momentum.since));
    if (m.spike) bits.push('<b>market-detected demand</b>');
    return bits.length ? '<p class="fo-hint" style="margin:4px 0">' + bits.join(' · ') + '</p>' : '<p class="fo-hint" style="margin:4px 0">No competitor prices for this night yet.</p>';
  }
  function decide(pid, date, rec, accepted) {
    if (accepted) return save('f.pricing.decide', { property: pid, for_date: date, channel: 'all', recommended: rec, set_price: rec, accepted: true, slot: K.slotNowId(data()) }, 'Logged: ' + inr(rec) + ' accepted');
    var p = U.drawer('<div class="fo-drawer__head"><h2 class="serif" style="font-size:24px">Override · ' + esc(dmy(date)) + '</h2><button class="fo-iconbtn" data-close aria-label="Close">' + U.icon('x') + '</button></div>' +
      '<form class="fo-form" novalidate><label class="fo-field">Channel<select name="channel">' + [['all', 'All channels (net)']].concat(CH).map(function (c) { return '<option value="' + c[0] + '">' + esc(c[1]) + '</option>'; }).join('') + '</select></label>' +
      '<label class="fo-field">Price you set ₹<input name="set_price" type="number" inputmode="numeric" min="1" step="100" value="' + rec + '"></label>' +
      '<label class="fo-field full">Why (short; it trains the weekly review)<textarea name="reason" rows="2" placeholder="e.g. matched Mahadev Mansion; group asked for a discount"></textarea></label>' +
      '<div class="full"><div class="fo-msg" id="dk-msg"></div><button class="btn btn--primary" type="submit">Save decision</button> <span class="fo-hint">Recommended ' + inr(rec) + ' net</span></div></form>');
    var fm = $('form', p);
    fm.onsubmit = function (e) { e.preventDefault(); var o = { property: pid, for_date: date, recommended: rec, accepted: false, slot: K.slotNowId(data()) }; $$('input,select,textarea', fm).forEach(function (el) { o[el.name] = el.value; });
      U.api('f.pricing.decide', o).then(function (j) { if (!j.ok) { $('#dk-msg', p).textContent = j.error; return; } p.parentNode.remove(); toast('Decision saved'); U.load(true); }); };
  }
  /** Drawer: ₹ waterfall from base to the recommended net price, every input with its freshness, the comp-set prices and the channel prices. */
  function waterfall(pid, date) {
    var D = data(), q = K.quote(D, K.ctxFor(D, pid), date), name = (deskProps().filter(function (p) { return p.property_id === pid; })[0] || {}).name || pid;
    var max = Math.max.apply(null, q.steps.map(function (s) { return Math.abs(s.delta); }).concat([1]));
    var lab = {}; K.SIGNALS.forEach(function (s) { lab[s.id] = s; });
    U.drawer('<div class="fo-drawer__head"><div><h2 class="serif" style="font-size:24px">' + esc(name) + ' · ' + esc(wday(date)) + '</h2><div class="fo-hint">Net ' + inr(q.price) + ' (range ' + inr(q.low) + '–' + inr(q.high) + ') · confidence ' + q.confidence + '/100 · ' + q.lead + ' days ahead · floor ' + inr(q.floor) + ', ceiling ' + inr(q.ceiling) + '</div></div><button class="fo-iconbtn" data-close aria-label="Close">' + U.icon('x') + '</button></div>' +
      '<h3 style="margin:6px 0 8px">How the price was built</h3><div class="dk-wf">' + q.steps.map(function (s) {
        var w = Math.max(2, Math.round(Math.abs(s.delta) / max * 100));
        return '<div class="dk-wf__row"><span class="dk-wf__l">' + esc(s.label) + '</span><span class="dk-wf__bar"><i class="' + (s.total ? 'is-base' : s.delta >= 0 ? 'is-up' : 'is-down') + '" style="width:' + w + '%"></i></span><b>' + (s.total ? inr(s.delta) : signed(s.delta)) + '</b><small class="fo-hint">' + esc(s.basis || '') + '</small></div>';
      }).join('') + '<div class="dk-wf__row dk-wf__total"><span class="dk-wf__l">Recommended (net)</span><span></span><b>' + inr(q.night_price) + '</b><small class="fo-hint">rounded to ₹' + cfgDesk().round + '</small></div></div>' +
      (q.reasons.length ? '<p class="fo-note">' + q.reasons.map(esc).join('<br>') + '</p>' : '') +
      '<h3 style="margin:16px 0 8px">Channel prices</h3>' + table(['Channel', 'Price to set', 'Commission', 'You keep'], CH.map(function (k) { var x = q.channels[k[0]]; return [esc(k[1]), '<b>' + inr(x.price) + '</b> ' + copyBtn(x.price), Math.round(x.commission * 100) + '%', inr(x.net)]; }), '', [1, 2, 3]) +
      (q.slots ? '<h3 style="margin:16px 0 8px">Through the day (if unsold)</h3>' + table(['From', 'Until', 'Net price', 'Step'], q.slots.map(function (s) { return [esc(s.from), esc(s.to), '<b>' + inr(s.price) + '</b>', (s.step >= 0 ? '+' : '') + Math.round(s.step * 100) + '%']; }), '', [2, 3]) : '') +
      '<h3 style="margin:16px 0 8px">Inputs <small class="fo-hint">missing or expired inputs count for nothing</small></h3>' + table(['Signal', 'Status', 'Index', 'Detail'], q.inputs.map(function (x) { return ['<b>' + esc(lab[x.id] ? lab[x.id].label : x.id) + '</b>', healthBadge(x.status), x.index == null ? '—' : Number(x.index).toFixed(2), esc(x.note || '') + (x.source_url && /^https/.test(x.source_url) ? ' ' + link(x.source_url) : '')]; }), '') +
      '<h3 style="margin:16px 0 8px">Competitor prices for this night <small class="fo-hint">latest per competitor in the comp set</small></h3>' + table(['Competitor', 'Seen on', 'Price / night', 'Status', 'Source'], q.market.rows.map(function (o) { return [esc(o.name) + (o.hotel ? ' <small class="fo-hint">hotel</small>' : ''), dmy(o.observed_at), o.sold_out ? '—' : inr(o.price), o.sold_out ? '<span class="fo-badge fo-badge--bad">sold out</span>' : 'available', /^https/.test(o.source_url) ? link(o.source_url) : '<small class="fo-hint">' + esc(o.source_url) + '</small>']; }), 'No comp-set prices for this night yet. Add some in Rate check.'));
    wireCopy(document.querySelector('.fo-drawer') || document);
  }
  function healthBadge(s) { return '<span class="fo-badge ' + (s === 'live' ? '' : s === 'stale' ? 'fo-badge--gold' : s === 'blocked' || s === 'expired' ? 'fo-badge--bad' : 'fo-badge--muted') + '">' + esc(s) + '</span>'; }

  // ---------- 90-night calendar ----------
  function deskCalendar(body) {
    var pid = deskPid(), cal = deskCal(pid); if (!cal) { body.innerHTML = '<div class="fo-empty">No villa data.</div>'; return; }
    var open = cal.rows.filter(function (q) { return !q.booked && !q.blocked; }), lo = Math.min.apply(null, cal.rows.map(function (q) { return q.price; })), hi = Math.max.apply(null, cal.rows.map(function (q) { return q.price; }));
    var months = {}; cal.rows.forEach(function (q) { (months[q.date.slice(0, 7)] = months[q.date.slice(0, 7)] || []).push(q); });
    body.innerHTML = '<div class="fo-toolbar">Villa ' + propSel('dk-p') + '<button class="btn" id="dk-csv">Export CSV</button><span class="fo-hint">Base ' + inr(cal.base) + ' · ' + open.length + ' open nights · darker = higher price · tap a night for the reasons</span></div>' +
      Object.keys(months).map(function (m) {
        var rows = months[m], first = new Date(rows[0].date + 'T00:00:00Z').getUTCDay(), lead = (first + 6) % 7;
        return '<div class="fo-card dk-month"><h3>' + new Date(m + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) + '</h3><div class="dk-heat"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>' +
          new Array(lead + 1).join('<i></i>') + rows.map(function (q) {
            var lvl = hi > lo ? Math.round((q.price - lo) / (hi - lo) * 4) : 2;
            return '<button class="dk-cell lv' + lvl + (q.booked || q.blocked ? ' is-taken' : '') + (q.confidence < 50 ? ' is-low' : '') + '" data-d="' + q.date + '" title="' + esc(wday(q.date)) + ': ' + inr(q.price) + ', confidence ' + q.confidence + '"><span>' + Number(q.date.slice(8)) + '</span><b>' + (q.booked ? 'booked' : q.blocked ? 'blocked' : (q.price / 1000).toFixed(1) + 'k') + '</b>' + (q.market.spike ? '<em title="market-detected demand">▲</em>' : q.event ? '<em>●</em>' : '') + (q.market.estimate && !q.market.n ? '<i class="dk-est" title="no competitor prices for this night yet: estimated from nearby nights">~</i>' : '') + '</button>';
          }).join('') + '</div></div>';
      }).join('') + '<p class="fo-hint">● event or festival · ▲ market-detected demand (competitors well above nearby nights or half sold out) · ~ competitor prices estimated from nearby nights · dotted border = confidence below 50.</p>';
    $('#dk-p').onchange = function () { S.dkP = this.value; deskCalendar(body); };
    $$('[data-d]', body).forEach(function (b) { b.onclick = function () { waterfall(pid, b.dataset.d); }; });
    $('#dk-csv').onclick = function () { U.csvDownload('ap-villas-pricing-desk-' + pid + '-' + today(), ['date', 'status', 'net_price', 'low', 'high', 'confidence', 'direct', 'airbnb', 'booking', 'makemytrip', 'comp_median', 'comp_sold_out', 'factors'], cal.rows.map(function (q) { return [q.date, q.booked ? 'booked' : q.blocked ? 'blocked' : 'open', q.price, q.low, q.high, q.confidence, q.channels.direct.price, q.channels.airbnb.price, q.channels.booking.price, q.channels.makemytrip.price, q.market.median == null ? '' : Math.round(q.market.median), q.market.sellout == null ? '' : Math.round(q.market.sellout * 100) + '%', q.steps.map(function (s) { return s.label + ' ' + Math.round(s.delta); }).join(' | ')]; })); };
  }

  // ---------- competitors: comp set, price position, sell-outs, movers, changes, directory ----------
  function deskComp(body) {
    var D = data(), pid = deskPid(), set = K.compSet(D, pid), cal = deskCal(pid), next = cal ? cal.rows.slice(0, 30) : [], cfg = cfgDesk();
    var cands = K.candidates(D).map(function (c) { var s = K.similarity(D, c, pid, cfg); return { c: c, s: s }; }).filter(function (x) { return x.s.score != null && !set.some(function (r) { return r.key === x.c.key; }); }).sort(function (a, b) { return b.s.score - a.s.score; }).slice(0, 5);
    var movers = moversOf(D, set);
    var g = cfg.group[pid] || {}, pins = cfg.comp.pinned.map(K.normName), exc = cfg.comp.excluded.map(K.normName), founder = S.user && S.user.role === 'founder';
    body.innerHTML = '<div class="fo-toolbar">Villa ' + propSel('dk-p') + '<span class="fo-hint">Comp set for a group of ' + (g.adults || '?') + ' adults (' + (g.bedrooms || '?') + ' bedrooms). Chosen weekly by similarity; a member is replaced only after being outscored by ' + cfg.comp.swap_margin + '+ points for ' + cfg.comp.swap_weeks + ' weeks.</span></div>' +
      card('Comp set', set.length + ' of ' + cfg.comp.size, table(['#', 'Competitor', 'Score', 'Why similar', 'Platforms', 'In set since', ''], set.map(function (r, i) {
        return [String(i + 1), '<a href="#" data-cmp="' + esc(r.name) + '"><b>' + esc(r.name) + '</b></a>' + (r.hotel === 'yes' ? ' <span class="fo-badge fo-badge--muted">hotel</span>' : '') + (r.pinned === 'yes' ? ' <span class="fo-badge fo-badge--gold">pinned</span>' : ''), '<b>' + esc(r.score) + '</b>', '<small>' + esc(r.why) + '</small>', esc(r.platforms), r.since ? dmy(r.since) : '—',
          founder ? '<button class="btn btn--sm" data-pin="' + esc(r.name) + '">' + (pins.indexOf(r.key) >= 0 ? 'Unpin' : 'Pin') + '</button> <button class="btn btn--sm btn--danger" data-exc="' + esc(r.name) + '">Exclude</button>' : ''];
      }), 'No comp set yet: add competitors and at least one dated price each (Rate check or Market prices).', [2])) +
      (cands.length ? '<div class="fo-card" style="margin-top:14px"><h3>Next in line <small>challengers</small></h3>' + table(['Competitor', 'Score', 'Why'], cands.map(function (x) { return [esc(x.c.name) + (founder ? ' <button class="btn btn--sm" data-pin="' + esc(x.c.name) + '">Pin</button>' : ''), esc(x.s.score), '<small>' + esc(x.s.why) + '</small>']; }), '', [1]) + '</div>' : '') +
      '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + card('Price position, next 30 nights', 'your net vs comp-set asking prices', '<div class="fo-chartbox" id="dk-pos"></div>') + card('Competitor sell-outs', '% of the comp set sold out per night', '<div class="fo-chartbox" id="dk-sell"></div>') + '</div>' +
      '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + card('Movers', 'biggest price changes, same stay night, last 14 days', table(['Competitor', 'Night', 'Was', 'Now', 'Change'], movers.map(function (m) { return [esc(m.name), dm(m.stay), inr(m.was), inr(m.now), '<b>' + (m.ch > 0 ? '+' : '') + Math.round(m.ch * 100) + '%</b>']; }), 'No repeat prices for the same night yet.', [2, 3, 4])) +
      card('Villa vs 2 hotel rooms', 'what a family pays at a hotel ≤1 km instead', table(['Night', 'Your direct price', '2 hotel rooms', 'Difference'], next.filter(function (q) { return q.market.hotel_median; }).slice(0, 10).map(function (q) { var h2 = q.market.hotel_median * 2; return [esc(wday(q.date)), inr(q.channels.direct.price), inr(h2), '<b>' + signed(q.channels.direct.price - h2) + '</b>']; }), 'No hotel prices for the coming nights yet. Add 2–3 nearby hotels in Rate check.', [1, 2, 3])) + '</div>' +
      '<div class="fo-card" style="margin-top:14px"><h3>Comp-set changes <small>log</small></h3>' + table(['Date', 'Villa', 'Change', 'Competitor', 'Score', 'Reason'], (D.comp_changes || []).slice().reverse().slice(0, 60).map(function (x) { return [dmy(x.date), esc(U.propName(x.property)), esc(x.action), esc(x.name), esc(x.score), '<small>' + esc(x.reason) + '</small>']; }), 'No changes logged yet: the hourly job records the first comp set.') + '</div>' +
      '<h3 style="margin:22px 0 10px">All competitors <small class="fo-hint">directory</small></h3>' + (exc.length ? '<p class="fo-hint">Excluded: ' + cfg.comp.excluded.map(esc).join(', ') + (founder ? ' <button class="btn btn--sm" id="dk-unexc">Clear exclusions</button>' : '') + '</p>' : '') + '<div id="dk-dir"></div>';
    $('#dk-p').onchange = function () { S.dkP = this.value; deskComp(body); };
    C.combo($('#dk-pos'), { labels: next.map(function (q) { return dm(q.date); }), kind: 'inr', empty: 'No comp-set prices for the next 30 nights yet.', series: [
      { name: 'Your net price', values: next.map(function (q) { return q.price; }), type: 'line' },
      { name: 'Comp median', values: next.map(function (q) { return q.market.median; }), type: 'line', color: '#C9A24F' },
      { name: 'Comp lowest', values: next.map(function (q) { return q.market.min; }), type: 'line', color: '#9BB8A8' },
      { name: 'Comp highest', values: next.map(function (q) { return q.market.max; }), type: 'line', color: '#B9A58A' }], onClick: function (i) { waterfall(pid, next[i].date); } });
    C.combo($('#dk-sell'), { labels: next.map(function (q) { return dm(q.date); }), kind: 'n', empty: 'No availability checks yet (mark sold-outs in Rate check).', series: [{ name: '% sold out', values: next.map(function (q) { return q.market.sellout == null ? null : Math.round(q.market.sellout * 100); }) }], onClick: function (i) { waterfall(pid, next[i].date); } });
    competitors($('#dk-dir'));
    $$('[data-cmp]', body).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); compDrawer(pid, a.dataset.cmp); }; });
    function patch(kind, name) { var cmp = JSON.parse(JSON.stringify(cfgDesk().comp)), k = K.normName(name), list = cmp[kind].filter(function (x) { return K.normName(x) !== k; }); if (list.length === cmp[kind].length) list.push(name); cmp[kind] = list; return saveDesk({ comp: { pinned: kind === 'pinned' ? list : cmp.pinned, excluded: kind === 'excluded' ? list : cmp.excluded } }, kind === 'pinned' ? 'Pins updated: applied at the next hourly run' : 'Excluded: applied at the next hourly run'); }
    $$('[data-pin]', body).forEach(function (b) { b.onclick = function () { patch('pinned', b.dataset.pin); }; });
    $$('[data-exc]', body).forEach(function (b) { b.onclick = function () { if (confirm('Exclude ' + b.dataset.exc + ' from every comp set?')) patch('excluded', b.dataset.exc); }; });
    var ue = $('#dk-unexc'); if (ue) ue.onclick = function () { saveDesk({ comp: { pinned: cfgDesk().comp.pinned, excluded: [] } }, 'Exclusions cleared'); };
  }
  /** One competitor in depth: links on every platform, distance, rating, its prices per night and platform for the next 30 nights. */
  function compDrawer(pid, name) {
    var D = data(), key = K.normName(name), c = (D.competitors || []).filter(function (x) { return K.normName(x.name) === key; })[0] || { name: name }, cfg = cfgDesk();
    var links = String(c.listing_urls || '').split(/\s+/).concat([c.source_url || '']).filter(function (u, i, a) { return /^https:/.test(u) && a.indexOf(u) === i; });
    var nights = []; for (var i = 0; i < 30; i++) nights.push(M.addDays(today(), i));
    var rows = nights.map(function (d) { var m = K.marketAt(D, pid, d, cfg, Date.parse(D.serverTime)), r = m.rows.filter(function (x) { return x.key === key; })[0]; return { d: d, r: r, med: m.median }; }).filter(function (x) { return x.r; });
    var plats = []; rows.forEach(function (x) { x.r.platforms.forEach(function (p) { if (plats.indexOf(p.platform) < 0) plats.push(p.platform); }); });
    U.drawer('<div class="fo-drawer__head"><div><h2 class="serif" style="font-size:24px">' + esc(c.name) + '</h2><div class="fo-hint">' + esc([c.type, c.bedrooms ? c.bedrooms + ' bedrooms' : '', c.distance_km !== '' && c.distance_km != null ? c.distance_km + ' km to Mahakal' : 'distance unknown', c.review_themes].filter(Boolean).join(' · ')) + '</div></div><button class="fo-iconbtn" data-close aria-label="Close">' + U.icon('x') + '</button></div>' +
      '<h3 style="margin:6px 0 8px">Listed on</h3><div class="fo-toolbar">' + (links.length ? links.map(function (u) { return '<a class="btn btn--sm" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(K.platformOf ? K.platformOf(u) : u) + ' ↗</a>'; }).join('') : '<span class="fo-hint">No links yet.</span>') + '</div>' +
      '<h3 style="margin:16px 0 8px">Next 30 nights <small class="fo-hint">price per night as each platform showed it · bold = cheapest for the guest</small></h3>' +
      table(['Night', 'Comp median'].concat(plats).concat(['Spread']), rows.map(function (x) {
        return [esc(wday(x.d)), x.med ? inr(x.med) : '—'].concat(plats.map(function (pl) { var p = x.r.platforms.filter(function (y) { return y.platform === pl; })[0]; if (!p) return '<span class="fo-hint">—</span>'; return p.sold_out ? '<span class="fo-badge fo-badge--bad">sold out</span>' : (x.r.platform === pl ? '<b>' + inr(p.price) + '</b>' : inr(p.price)) + ' <small class="fo-hint">' + esc(dm(p.observed_at)) + '</small>'; }))
          .concat([x.r.parity != null ? Math.round(x.r.parity * 100) + '%' : '—']);
      }), 'No prices for this competitor in the next 30 nights yet.') +
      '<div class="fo-chartbox" id="cd-chart" style="margin-top:14px"></div>');
    C.combo($('#cd-chart'), { labels: rows.map(function (x) { return dm(x.d); }), kind: 'inr', empty: '', series: [{ name: name, values: rows.map(function (x) { return x.r.price || null; }), type: 'line' }, { name: 'Comp median', values: rows.map(function (x) { return x.med; }), type: 'line', color: '#C9A24F' }] });
  }
  function moversOf(D, set) {
    var keys = set.map(function (r) { return r.key; }), by = {}, since = M.addDays(today(), -14);
    (D.market_rates || []).forEach(function (r) { var k = K.normName(r.competitor), p = num(r.price_per_night) || num(r.price_total) / Math.max(1, num(r.nights) || 1); if (keys.indexOf(k) < 0 || !r.stay_date || !(p > 0)) return; (by[k + '|' + String(r.stay_date).slice(0, 10)] = by[k + '|' + String(r.stay_date).slice(0, 10)] || []).push({ at: String(r.observed_at).slice(0, 10), p: p, name: r.competitor }); });
    return Object.keys(by).map(function (k) { var a = by[k].sort(function (x, y) { return x.at < y.at ? -1 : 1; }); if (a.length < 2 || a[a.length - 1].at < since) return null; var was = a[a.length - 2].p, now = a[a.length - 1].p; return { name: a[0].name, stay: k.split('|')[1], was: was, now: now, ch: (now - was) / was }; })
      .filter(function (m) { return m && Math.abs(m.ch) >= 0.03; }).sort(function (a, b) { return Math.abs(b.ch) - Math.abs(a.ch); }).slice(0, 10);
  }
  function saveDesk(patchObj, msg) {
    var cur = {}; try { cur = JSON.parse(data().settings.desk || '{}'); } catch (e) { cur = {}; }
    Object.keys(patchObj).forEach(function (k) { cur[k] = patchObj[k]; });
    S.dkCache = null; return save('f.desk.settings', { desk: cur }, msg);
  }

  // ---------- Rate check: owner reads prices from the OTA extranets / listing pages ----------
  function rateCheck(body) {
    var D = data(), pid = deskPid(), set = K.compSet(D, pid), d = S.dkRcDate || today(), g = cfgDesk().group[pid] || {};
    var names = set.map(function (r) { return { name: r.name, platform: (r.platforms || '').split(',')[0].trim() }; });
    body.innerHTML = '<div class="fo-note" style="margin-bottom:14px"><b>Two minutes, once or twice a week.</b> In the Booking.com / Airbnb / MakeMyTrip extranet (or the public listing), search ' + esc(dmy(d)) + ' for ' + (g.adults || '?') + ' adults and type what each competitor shows for one night. Mark sold-out ones. Only what you see: no guesses.</div>' +
      '<div class="fo-toolbar">Villa ' + propSel('dk-p') + ' Night <input class="fo-input" type="date" id="rc-d" value="' + esc(d) + '" style="width:auto">' +
      [0, 1, 6, 13].map(function (n) { var x = M.addDays(today(), n); return '<button class="btn btn--sm" data-rcd="' + x + '">' + (n === 0 ? 'Tonight' : n === 1 ? 'Tomorrow' : '+' + n + ' days') + '</button>'; }).join('') + '</div>' +
      '<form id="rc-f" class="dk-rc">' + names.concat([{ name: '', platform: '' }, { name: '', platform: '' }]).map(function (c, i) {
        return '<div class="dk-rc__row"><input class="fo-input" name="c' + i + '" value="' + esc(c.name) + '" placeholder="Other competitor" ' + (c.name ? 'readonly' : '') + '>' +
          '<input class="fo-input" name="p' + i + '" type="number" inputmode="numeric" min="0" step="1" placeholder="₹ / night">' +
          '<label class="dk-rc__so"><input type="checkbox" name="s' + i + '"> sold out</label>' +
          '<select class="fo-input" name="pl' + i + '">' + ['Airbnb', 'Booking.com', 'MakeMyTrip', 'StayVista', 'Google', 'Phone', 'Other'].map(function (o) { return '<option' + (c.platform === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>' +
          '<select class="fo-input" name="t' + i + '"><option value="unknown">taxes?</option><option value="yes">incl. taxes</option><option value="no">+ taxes</option></select></div>';
      }).join('') + '<div><div class="fo-msg" id="rc-msg"></div><button class="btn btn--primary" type="submit">Save prices for ' + esc(dmy(d)) + '</button> <span class="fo-hint">Saved as dated observations with “owner check” as the source. CSV from an extranet export: Market prices → Import CSV.</span></div></form>';
    $('#dk-p').onchange = function () { S.dkP = this.value; rateCheck(body); };
    $('#rc-d').onchange = function () { S.dkRcDate = this.value; rateCheck(body); };
    $$('[data-rcd]', body).forEach(function (b) { b.onclick = function () { S.dkRcDate = b.dataset.rcd; rateCheck(body); }; });
    $('#rc-f').onsubmit = function (e) {
      e.preventDefault(); var f = e.target, entries = [];
      for (var i = 0; f['c' + i]; i++) { var n = f['c' + i].value.trim(), p = f['p' + i].value, so = f['s' + i].checked; if (n && (Number(p) > 0 || so)) entries.push({ competitor: n, price: so ? '' : Number(p), sold_out: so, platform: f['pl' + i].value, tax: f['t' + i].value }); }
      if (!entries.length) { $('#rc-msg').textContent = 'Type at least one price or tick sold out.'; return; }
      var b = $('button[type=submit]', f); b.disabled = true;
      U.api('f.ratecheck.save', { property: pid, stay_date: d, entries: entries }).then(function (j) { b.disabled = false; if (!j.ok) { $('#rc-msg').textContent = j.error; return; } S.dkCache = null; toast(j.result.prices + ' prices and ' + j.result.sold_out + ' sold-outs saved', false, 6000); U.load(true); });
    };
  }

  // ---------- signal health ----------
  function deskHealth(body) {
    var D = data(), h = K.health(D), jobs = (D.jobs || []).filter(function (j) { return /desk|signal|market/i.test(j.job || j.name || ''); }).slice(-8).reverse();
    var live = h.filter(function (x) { return x.status === 'live'; }).length;
    body.innerHTML = '<div class="fo-grid fo-grid--kpi" style="margin-bottom:14px">' + [['Live', live], ['Stale', h.filter(function (x) { return x.status === 'stale'; }).length], ['Expired / missing', h.filter(function (x) { return x.status === 'expired' || x.status === 'missing'; }).length], ['Blocked', h.filter(function (x) { return x.status === 'blocked'; }).length]].map(function (k) { return '<div class="fo-card fo-kpi"><div class="fo-kpi__label">' + k[0] + '</div><div class="fo-kpi__value">' + k[1] + ' <small class="fo-hint">of ' + h.length + '</small></div></div>'; }).join('') + '</div>' +
      botsCard(D) +
      card('Signals', 'stale = past its freshness limit (weight fades); expired = 2× the limit (weight 0)', table(['Signal', 'Status', 'Last update', 'Fresh for', 'Rows', 'Source', 'Terms'], h.map(function (x) {
        return ['<b>' + esc(x.label) + '</b><br><small class="fo-hint">' + esc(x.kind) + '</small>', healthBadge(x.status), x.fetched_at ? when(x.fetched_at) : '—', x.sla_h >= 48 ? Math.round(x.sla_h / 24) + ' days' : x.sla_h + ' h', esc(x.rows), esc(x.source) + (/^https/.test(x.source_url || '') ? ' ' + link(x.source_url) : ''), '<small class="fo-hint">' + esc(x.terms) + '</small>'];
      }), '')) +
      (jobs.length ? '<div class="fo-card" style="margin-top:14px"><h3>Recent runs</h3>' + table(['When', 'Job', 'Result'], jobs.map(function (j) { return [when(j.at || j.started_at || j.date), esc(j.job || j.name), '<small>' + esc(String(j.status || '') + ' ' + String(j.detail || j.message || '').slice(0, 160)) + '</small>']; }), '') + '</div>' : '') +
      '<h3 style="margin:22px 0 10px">Manual demand signals <small class="fo-hint">v1 notes (search, news, footfall you add by hand)</small></h3><div id="dk-sg"></div>';
    signals($('#dk-sg'));
  }

  /** Latest run of each competitor bot / API (GitHub Actions, twice a day). */
  function botsCard(D) {
    var last = {}; (D.bot_runs || []).forEach(function (r) { if (!last[r.bot] || r.at > last[r.bot].at) last[r.bot] = r; });
    var rows = Object.keys(last).map(function (k) { return last[k]; }).sort(function (a, b) { return a.mode === b.mode ? (a.platform < b.platform ? -1 : 1) : a.mode < b.mode ? 1 : -1; });
    var badge = function (r) { var w = /awaiting|not set/i.test(r.blocked) ? ['fo-badge--muted', 'not connected'] : r.status === 'blocked' ? ['fo-badge--bad', 'blocked'] : r.status === 'error' ? ['fo-badge--warn', 'error'] : ['', 'ok']; return '<span class="fo-badge ' + w[0] + '">' + w[1] + '</span>'; };
    return '<div class="fo-card" style="margin-bottom:14px"><h3>Market bots <small>competitor prices from every platform, twice a day (08:10 and 18:10)</small></h3>' +
      table(['Bot', 'How', 'Last run', 'Pages / searches', 'Prices', 'Sold out', 'New competitors', 'Status', 'Note'], rows.map(function (r) {
        return ['<b>' + esc(r.platform) + '</b>', esc(r.mode === 'api' ? 'API' : 'public pages'), r.at ? when(r.at) : '—', esc(r.pages), esc(r.prices), esc(r.sold_out), esc(r.discovered), badge(r), '<small class="fo-hint">' + esc(r.blocked || r.note || '') + '</small>'];
      }), 'No bot runs yet: the first run is at 08:10 or 18:10 IST (GitHub → Actions → "Market bots" → Run workflow to start one now).', [3, 4, 5, 6]) +
      '<p class="fo-hint">Bots read public pages that each site\'s robots.txt allows, identify themselves, never log in or solve CAPTCHAs, and stop at the first challenge ("blocked"). MakeMyTrip, Goibibo and Expedia come through Google Hotels (SerpApi); new Airbnb homes through Apify.</p></div>';
  }

  // ---------- news (GDELT + publishers' RSS every 2 hours) ----------
  var IMPACT = { high: ['fo-badge--bad', 'High impact'], medium: ['fo-badge--gold', 'Medium'], low: ['fo-badge--muted', 'Low'] };
  var DIR = { up: '▲ demand up', down: '▼ demand down', neutral: '' };
  function newsItem(n) {
    var im = IMPACT[n.impact] || IMPACT.low;
    return '<article class="dk-news"><div class="dk-news__meta"><span class="fo-badge ' + im[0] + '">' + im[1] + '</span> <span class="fo-badge fo-badge--muted">' + esc(n.category) + '</span>' + (DIR[n.direction] ? ' <small class="dk-news__dir dk-news__dir--' + esc(n.direction) + '">' + DIR[n.direction] + '</small>' : '') +
      ' <small class="fo-hint">' + esc(n.source) + ' · ' + (n.published_at ? when(n.published_at) : 'date unknown') + (n.lang === 'hi' ? ' · हिंदी' : '') + '</small></div>' +
      '<a class="dk-news__title" href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer">' + esc(n.title) + ' ↗</a>' + (n.summary ? '<p class="fo-hint" style="margin:4px 0 0">' + esc(n.summary) + '</p>' : '') + '</article>';
  }
  function newsSorted(D) { return (D.news || []).slice().sort(function (a, b) { return String(b.published_at || b.fetched_at) < String(a.published_at || a.fetched_at) ? -1 : 1; }); }
  function newsStrip(D) {
    var since = new Date(Date.parse(D.serverTime || new Date().toISOString()) - 72 * 3600000).toISOString();
    var top = newsSorted(D).filter(function (n) { return n.impact !== 'low' && String(n.published_at || n.fetched_at) >= since; }).sort(function (a, b) { return (b.impact === 'high') - (a.impact === 'high') || num(b.score) - num(a.score); }).slice(0, 3);
    return top.length ? '<div class="fo-card" style="margin-bottom:14px"><h3>News that matters <small>last 72 hours · <a href="#/pricing/news">all news</a></small></h3>' + top.map(newsItem).join('') + '</div>' : '';
  }
  function deskNews(body) {
    var D = data(), f = S.dkNewsF || { impact: '', cat: '', lang: '' }, all = newsSorted(D);
    var cats = []; all.forEach(function (n) { if (cats.indexOf(n.category) < 0) cats.push(n.category); });
    var list = all.filter(function (n) { return (!f.impact || n.impact === f.impact) && (!f.cat || n.category === f.cat) && (!f.lang || n.lang === f.lang); });
    body.innerHTML = '<div class="fo-toolbar">' + sel('nw-i', [['', 'All impact'], ['high', 'High impact'], ['medium', 'Medium'], ['low', 'Low']], f.impact) + sel('nw-c', [['', 'All topics']].concat(cats.map(function (c) { return [c, c]; })), f.cat) + sel('nw-l', [['', 'English + हिंदी'], ['en', 'English'], ['hi', 'हिंदी']], f.lang) +
      '<span class="fo-hint">' + list.length + ' stories · updated every 2 hours from GDELT (open news database) and publishers\' RSS feeds · headlines and links only</span></div>' +
      (list.length ? '<div class="fo-card">' + list.slice(0, 120).map(newsItem).join('') + '</div>' : '<div class="fo-empty">No stories yet: the news job runs every 2 hours (GitHub → Actions → "News" → Run workflow to fetch now).</div>') +
      '<p class="fo-hint">Labels are automatic keyword rules (temple, festival, travel, hospitality, weather, safety, development): read the story before acting. High-impact stories are also emailed to you once.</p>';
    ['nw-i', 'nw-c', 'nw-l'].forEach(function (id, i) { $('#' + id).onchange = function () { f[['impact', 'cat', 'lang'][i]] = this.value; S.dkNewsF = f; deskNews(body); }; });
  }

  // ---------- competitor forecast ----------
  function deskForecast(body) {
    var D = data(), pid = deskPid(), cal = deskCal(pid), cfg = cfgDesk(), mdl = K.marketModel(D, pid, cfg, Date.parse(D.serverTime)), acc = K.forecastAccuracy(D, pid);
    var rows = cal ? cal.rows : [], fc = rows.map(function (q) { return q.market.forecast; });
    var hot = rows.filter(function (q) { return q.market.forecast; }).slice().sort(function (a, b) { return (b.market.forecast.sellout_p || 0) - (a.market.forecast.sellout_p || 0) || b.market.forecast.median - a.market.forecast.median; }).slice(0, 12);
    body.innerHTML = '<div class="fo-toolbar">Villa ' + propSel('dk-p') + '<span class="fo-hint">What competitors are likely to charge, and the chance they sell out, for each of the next 90 nights. Learned from every price the bots have seen.</span></div>' +
      '<div class="fo-grid fo-grid--kpi" style="margin-bottom:14px">' + [['Competitors modelled', String(mdl.competitors)], ['Nights seen', mdl.nights], ['Festival reaction', mdl.pairs >= 3 ? Math.round(mdl.k * 100) + '% of calendar strength' : 'default 60% (learning)'], ['Price drift as dates near', mdl.slopes >= 5 ? (mdl.drift >= 0 ? '+' : '') + (mdl.drift * 100).toFixed(2) + '% a day' : 'learning'], ['Forecast accuracy', acc.mape != null ? Math.round((1 - acc.mape) * 100) + '% (' + acc.nights + ' nights tested)' : 'needs more nights']].map(function (k) { return '<div class="fo-card fo-kpi"><div class="fo-kpi__label">' + esc(k[0]) + '</div><div class="fo-kpi__value" style="font-size:18px">' + esc(k[1]) + '</div></div>'; }).join('') + '</div>' +
      card('Competitor prices, next 90 nights', 'forecast median and range · bars = prices actually seen · blue line = your recommended net price', '<div class="fo-chartbox" id="fc-c"></div>') +
      '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + card('Chance competitors sell out', 'by night', '<div class="fo-chartbox" id="fc-s"></div>') +
      card('Nights to watch', 'highest sell-out chance first', table(['Night', 'Forecast', 'Range', 'Sell-out', 'Nearer the date', 'Calendar'], hot.map(function (q) { var f = q.market.forecast; return ['<a href="#" data-d="' + q.date + '">' + esc(wday(q.date)) + '</a>', inr(f.median), inr(f.p25) + '–' + inr(f.p75), f.sellout_p != null ? Math.round(f.sellout_p * 100) + '%' : '—', inr(f.at_stay), f.calendar > 1.01 ? '×' + f.calendar : '—']; }), 'No forecast yet: it needs prices for at least 3 competitors.', [1, 2, 3, 4])) + '</div>' +
      '<div class="fo-card" style="margin-top:14px"><h3>How good is the forecast? <small>each checked night forecast without its own prices, then compared</small></h3>' + table(['Night', 'Forecast', 'Seen', 'Error'], acc.rows.slice(-20).reverse().map(function (r) { return [dmy(r.date), inr(r.forecast), inr(r.actual), Math.round(r.error * 100) + '%']; }), 'Needs nights with 3+ competitor prices.', [1, 2, 3]) +
      '<p class="fo-hint">Method: each competitor\'s normal price for weekday and Fri/Sat nights → comp-set median × (1 + reaction × calendar strength from the Hindu calendar, holidays, events and school breaks). Sell-out chance from what the bots saw by night type and lead time. Labelled ESTIMATE; real prices replace it as soon as the bots see a night.</p></div>';
    $('#dk-p').onchange = function () { S.dkP = this.value; deskForecast(body); };
    $$('[data-d]', body).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); waterfall(pid, a.dataset.d); }; });
    C.combo($('#fc-c'), { labels: rows.map(function (q) { return dm(q.date); }), kind: 'inr', height: 280, empty: 'No forecast yet: it needs prices for at least 3 competitors.', series: [
      { name: 'Forecast median', values: fc.map(function (f) { return f ? f.median : null; }), type: 'line', color: '#C9A24F' },
      { name: 'Forecast low (25%)', values: fc.map(function (f) { return f ? f.p25 : null; }), type: 'line', color: '#E2D3A6' },
      { name: 'Forecast high (75%)', values: fc.map(function (f) { return f ? f.p75 : null; }), type: 'line', color: '#B39550' },
      { name: 'Seen (median)', values: rows.map(function (q) { return q.market.n >= 2 ? q.market.median : null; }), color: '#9BB8A8' },
      { name: 'Your net price', values: rows.map(function (q) { return q.price; }), type: 'line' }], onClick: function (i) { waterfall(pid, rows[i].date); } });
    C.combo($('#fc-s'), { labels: rows.map(function (q) { return dm(q.date); }), kind: 'n', empty: 'Needs availability checks.', series: [{ name: 'Sell-out chance %', values: fc.map(function (f) { return f && f.sellout_p != null ? Math.round(f.sellout_p * 100) : null; }) }] });
  }

  // ---------- market analytics ----------
  function deskAnalytics(body) {
    var D = data(), n = S.dkAnDays || 30, a = K.marketAnalytics(D, n), pct0 = function (v) { return v == null ? '—' : Math.round(v * 100) + '%'; }, idx = function (v) { return v == null ? '—' : (v >= 1 ? '+' : '−') + Math.abs(Math.round((v - 1) * 100)) + '%'; };
    var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    body.innerHTML = '<div class="fo-toolbar">Next ' + sel('an-n', [['14', '14 nights'], ['30', '30 nights'], ['60', '60 nights'], ['90', '90 nights']], String(n)) + '<span class="fo-hint">' + a.observations + ' prices from ' + a.competitors + ' competitors on every platform the bots read · all competitors, not only your comp sets</span></div>' +
      '<div class="fo-grid fo-grid--2">' + card('Market by segment', 'what each kind of stay charges', table(['Segment', 'Competitors', 'Median', 'Middle half', 'Sold out'], a.segments.map(function (x) { return ['<b>' + esc(x.segment) + '</b>', esc(x.competitors), inr(x.median), x.p25 ? inr(x.p25) + '–' + inr(x.p75) : '—', pct0(x.sellout)]; }), 'No prices yet.', [1, 2, 3, 4])) +
      card('Platforms', 'where guests find the lowest price', table(['Platform', 'Prices', 'Median', 'Cheapest', 'Premium vs cheapest'], a.platforms.map(function (x) { return ['<b>' + esc(x.platform) + '</b>', esc(x.observations), inr(x.median), pct0(x.cheapest_share), x.premium == null ? '—' : '+' + Math.round(x.premium * 100) + '%']; }), 'No prices yet.', [1, 2, 3, 4])) + '</div>' +
      '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + card('Price index over time', 'competitor prices vs their own normal, by day seen (1.00 = normal)', '<div class="fo-chartbox" id="an-i"></div>') +
      card('Day of the week', 'price vs normal and sell-outs by night', '<div class="fo-chartbox" id="an-w"></div>') + '</div>' +
      '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + card('Booking lead time', 'competitor prices vs normal by how far ahead', table(['Seen', 'Price vs normal', 'Prices'], a.lead.map(function (x) { return [esc(x.label), idx(x.index), esc(x.observations)]; }), '', [1, 2])) +
      card('Leaderboard', 'competitors with the most data', table(['Competitor', 'Segment', 'Median', 'Sold out', 'Price moves', 'Platforms', 'Spread'], a.leaderboard.slice(0, 15).map(function (x) { return ['<a href="#" data-cmp="' + esc(x.name) + '">' + esc(x.name) + '</a>' + (x.distance_km !== '' && x.distance_km != null ? ' <small class="fo-hint">' + esc(x.distance_km) + ' km</small>' : ''), esc(x.segment), inr(x.median), pct0(x.sellout), esc(x.price_moves), esc(x.platforms.join(', ')), x.spread == null ? '—' : Math.round(x.spread * 100) + '%']; }), 'No competitor data yet.', [2, 3, 4])) + '</div>';
    $('#an-n').onchange = function () { S.dkAnDays = Number(this.value); deskAnalytics(body); };
    $$('[data-cmp]', body).forEach(function (el) { el.onclick = function (e) { e.preventDefault(); compDrawer(deskPid(), el.dataset.cmp); }; });
    C.combo($('#an-i'), { labels: a.index.map(function (x) { return dm(x.date); }), kind: 'n', empty: 'Builds up as the bots check prices twice a day.', series: [{ name: 'Index ×100', values: a.index.map(function (x) { return Math.round(x.index * 100); }), type: 'line' }] });
    C.combo($('#an-w'), { labels: a.weekdays.map(function (x) { return WD[x.weekday]; }), kind: 'n', empty: 'No prices yet.', series: [{ name: 'Price vs normal ×100', values: a.weekdays.map(function (x) { return x.index == null ? null : Math.round(x.index * 100); }), type: 'line' }, { name: 'Sold out %', values: a.weekdays.map(function (x) { return x.sellout == null ? null : Math.round(x.sellout * 100); }), color: '#9BB8A8' }] });
  }

  // ---------- outlook (30-day, from the daily intelligence job) ----------
  function deskOutlook(body) {
    var reps = (data().reports || []).filter(function (r) { return r.type === 'outlook'; }).sort(function (a, b) { return a.generated_at < b.generated_at ? 1 : -1; });
    if (!reps.length) { body.innerHTML = '<div class="fo-empty">No outlook yet. The daily pricing-intelligence job writes one each morning once the automation key is connected (Settings → Automation).</div>'; return; }
    body.innerHTML = '<div class="fo-toolbar">' + sel('ol-r', reps.slice(0, 30).map(function (r) { return [r.report_id, (r.from || r.period_key || '') + ' · ' + when(r.generated_at)]; }), S.dkOl || reps[0].report_id) + '<span class="fo-hint">Public news and calendars only, labelled FACT / ESTIMATE / HYPOTHESIS / RECOMMENDATION.</span></div><iframe id="ol-f" title="Outlook" sandbox="allow-same-origin" style="width:100%;height:calc(100vh - 260px);min-height:420px;border:1px solid var(--line);border-radius:12px;background:#fff"></iframe>';
    function show(id) { S.dkOl = id; U.api('f.report.get', { report_id: id }).then(function (j) { if (!j.ok) return toast(j.error, true); var f = $('#ol-f'); if (f) f.srcdoc = j.html; }); }
    $('#ol-r').onchange = function () { show(this.value); };
    show(S.dkOl || reps[0].report_id);
  }

  // ---------- performance: backtest, decisions, learning ----------
  function deskPerf(body) {
    var D = data(), pid = deskPid(), to = M.addDays(today(), -1), from = M.addDays(today(), -60), L = K.learning(D, pid, from, to), bt = L.backtest;
    var dec = (D.price_decisions || []).filter(function (x) { return x.property === pid; }), acc = dec.filter(function (x) { return x.accepted === 'yes'; }).length;
    var rows = bt.rows.filter(function (r) { return r.recommended != null; });
    body.innerHTML = '<div class="fo-toolbar">Villa ' + propSel('dk-p') + '<span class="fo-hint">Last 60 nights: the last recommendation made before each night vs what happened.</span></div>' +
      '<div class="fo-grid fo-grid--kpi" style="margin-bottom:14px">' + [['Nights with a recommendation', bt.with_rec + ' / ' + bt.nights], ['Of those booked', bt.booked], ['Avg. gap, realised vs recommended', bt.mape == null ? '—' : Math.round(bt.mape * 100) + '%'], ['Decisions logged', dec.length + (dec.length ? ' · ' + Math.round(acc / dec.length * 100) + '% accepted' : '')]].map(function (k) { return '<div class="fo-card fo-kpi"><div class="fo-kpi__label">' + esc(k[0]) + '</div><div class="fo-kpi__value">' + esc(k[1]) + '</div></div>'; }).join('') + '</div>' +
      card('Recommended vs realised', 'booked nights show the realised net rate', '<div class="fo-chartbox" id="pf-c"></div>') +
      '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + card('What moved with bookings', 'needs 10 sold and 10 unsold nights per factor', table(['Factor', 'Avg push, sold', 'Avg push, unsold', 'Suggestion'], L.factors.map(function (f) { return [esc(f.factor), f.push_sold == null ? '—' : signed(f.push_sold) + ' <small class="fo-hint">(' + f.sold_n + ')</small>', f.push_unsold == null ? '—' : signed(f.push_unsold) + ' <small class="fo-hint">(' + f.unsold_n + ')</small>', '<small>' + esc(f.suggestion) + '</small>']; }), 'No stored recommendations for past nights yet: they build up from the hourly job.')) +
      card('Overrides', 'your reasons train the weekly review', table(['Night', 'Channel', 'Recommended', 'Set', 'Reason'], dec.filter(function (x) { return x.accepted !== 'yes'; }).slice(-15).reverse().map(function (x) { return [dmy(x.for_date), esc(x.channel), x.recommended ? inr(num(x.recommended)) : '—', inr(num(x.set_price)), '<small>' + esc(x.reason) + '</small>']; }), 'No overrides yet.', [2, 3])) + '</div>';
    $('#dk-p').onchange = function () { S.dkP = this.value; deskPerf(body); };
    C.combo($('#pf-c'), { labels: rows.map(function (r) { return dm(r.date); }), kind: 'inr', empty: 'No past recommendations yet.', series: [{ name: 'Recommended', values: rows.map(function (r) { return r.recommended; }), type: 'line' }, { name: 'Realised (booked)', values: rows.map(function (r) { return r.realised; }), color: '#9BB8A8' }, { name: 'You set', values: rows.map(function (r) { return r.set; }), type: 'line', color: '#C9A24F' }] });
  }

  // ---------- desk settings (+ the v1 per-villa base/floor/ceiling below) ----------
  function deskSettings(body) {
    var cfg = cfgDesk(), founder = S.user && S.user.role === 'founder', dis = founder ? '' : ' disabled';
    function f(path, label, val, unit, step) { return '<label class="fo-field">' + esc(label) + '<input data-path="' + path + '" data-unit="' + (unit || '') + '" type="number" step="' + (step || 'any') + '" value="' + (unit === '%' ? Math.round(val * 1000) / 10 : val) + '"' + dis + '></label>'; }
    var props = deskProps();
    body.innerHTML = '<div class="fo-grid fo-grid--2">' +
      card('Guardrails', founder ? 'founder only' : 'view only', '<div class="fo-form">' + f('floor_pct', 'Floor (× “from” price)', cfg.floor_pct) + f('ceiling_pct', 'Ceiling (× “from” price)', cfg.ceiling_pct) + f('mega_ceiling_pct', 'Ceiling in mega events (×)', cfg.mega_ceiling_pct) + f('max_daily_change', 'Max change per day (%)', cfg.max_daily_change, '%') + f('round', 'Round to ₹', cfg.round, '', 10) + '</div>') +
      card('Channels', 'commission and direct discount', '<div class="fo-form">' + Object.keys(cfg.commission).map(function (k) { return f('commission.' + k, (k === 'booking' ? 'Booking.com' : k === 'makemytrip' ? 'MakeMyTrip' : 'Airbnb') + ' commission (%)', cfg.commission[k], '%'); }).join('') + f('direct_discount', 'Direct: below the lowest OTA price by (%)', cfg.direct_discount, '%') + '</div>') +
      card('Market', 'how much competitors pull the price', '<div class="fo-form">' + '<label class="fo-field full"><span><input type="checkbox" data-bool="use_own_history"' + (cfg.use_own_history ? ' checked' : '') + dis + '> Use my booking history (realised rates, season, pace). Off = prices from competitors, search demand and the calendar only.</span></label>' + f('market_weight', 'Market weight (%)', cfg.market_weight, '%') + f('market_commission', 'Competitor prices: commission assumed (%)', cfg.market_commission, '%') + props.map(function (p) { return f('positioning.' + p.property_id, p.name + ': target vs comp median (%)', cfg.positioning[p.property_id] || 0, '%'); }).join('') + '</div>') +
      card('Time', 'lead time and the time of day (unsold nights)', '<div class="fo-form">' + Object.keys(cfg.lead).map(function (k) { var b = (M.LEAD_BANDS || []).filter(function (x) { return x[0] === k; })[0]; return f('lead.' + k, 'Lead ' + (b ? b[3] : k) + ' (%)', cfg.lead[k], '%'); }).join('') +
        ['tonight', 'tomorrow', 'high'].map(function (k) { return ['S3', 'S4'].map(function (s) { var sl = (M.SLOTS || []).filter(function (x) { return x[0] === s; })[0]; return f('slots.' + k + '.' + s, (k === 'high' ? 'High demand' : k[0].toUpperCase() + k.slice(1)) + ' from ' + (sl ? sl[1] : s) + ' (%)', cfg.slots[k][s], '%'); }).join(''); }).join('') + '</div>') +
      card('Signal weights', '0 switches a signal off', '<div class="fo-form">' + K.SIGNALS.map(function (s) { return f('weights.' + s.id, s.label, cfg.weights[s.id] != null ? cfg.weights[s.id] : s.weight, '', 0.1); }).join('') + '</div>') +
      card('Alerts', 'email to the founder', '<div class="fo-form">' + '<label class="fo-field"><span><input type="checkbox" data-bool="alerts.brief"' + (cfg.alerts.brief ? ' checked' : '') + dis + '> 07:00 “Price to set today” brief</span></label><label class="fo-field"><span><input type="checkbox" data-bool="alerts.stale"' + (cfg.alerts.stale ? ' checked' : '') + dis + '> Signal expired</span></label>' +
        f('alerts.rec_move', 'Alert when a price moves more than (%)', cfg.alerts.rec_move, '%') + f('alerts.sellout', 'Alert when competitors sold out above (%)', cfg.alerts.sellout, '%') + '</div>') + '</div>' +
      (founder ? '<div class="fo-toolbar" style="margin-top:12px"><button class="btn btn--primary" id="ds-save">Save desk settings</button><button class="btn" id="ds-reset">Back to defaults</button><span class="fo-hint">Applied at once here and at the next hourly run for alerts.</span></div>' : '') +
      '<h3 style="margin:22px 0 10px">Base price per villa <small class="fo-hint">shared with the v1 rate guide</small></h3><div id="ds-v1"></div>';
    engine($('#ds-v1'));
    if (!founder) return;
    $('#ds-save').onclick = function () {
      var cur = {}; try { cur = JSON.parse(data().settings.desk || '{}'); } catch (e) { cur = {}; }
      $$('[data-path]', body).forEach(function (i) { if (i.value === '') return; var v = Number(i.value) / (i.dataset.unit === '%' ? 100 : 1), ks = i.dataset.path.split('.'), o = cur; ks.slice(0, -1).forEach(function (k) { o = o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}; }); o[ks[ks.length - 1]] = v; });
      $$('[data-bool]', body).forEach(function (i) { var ks = i.dataset.bool.split('.'); if (ks.length === 1) cur[ks[0]] = i.checked; else (cur[ks[0]] = cur[ks[0]] || {})[ks[1]] = i.checked; });
      S.dkCache = null; save('f.desk.settings', { desk: cur }, 'Desk settings saved');
    };
    $('#ds-reset').onclick = function () { if (confirm('Reset the desk settings to the defaults? (Pins and exclusions are cleared too.)')) { S.dkCache = null; save('f.desk.settings', { desk: {} }, 'Defaults restored'); } };
  }

  // ---------- rate guide ----------
  function rates(body) {
    var D = data(), t = today(), n = S.prDays || 30, vid = S.prVilla || (D.properties[0] || {}).property_id;
    var all = D.properties.map(function (p) { return { p: p, r: I.pricing(D, p.property_id, t, n) }; });
    body.innerHTML = '<div class="fo-note" style="margin-bottom:14px"><b>Reference only.</b> The portal never changes your prices on Booking.com, Airbnb, MakeMyTrip or WhatsApp. Use the rate as a guide, and the range when you are unsure. Competitor figures are public prices seen on a date, not what they actually sold at.</div>' +
      card('All villas · next ' + n + ' nights', 'open nights only', table(['Villa', 'Base', 'Average reference', 'Lowest', 'Highest', 'Open nights', 'Market median (next ' + n + ' nights)'], all.map(function (x) {
        var med = x.r.rows.map(function (r) { return r.market.median; }).filter(function (v) { return v != null; });
        return { attrs: ' class="fo-row" data-v="' + esc(x.p.property_id) + '"', cells: ['<b>' + esc(x.p.name) + '</b><br><small class="fo-hint">' + esc(x.p.bedrooms) + ' bedrooms · sleeps ' + esc(x.p.sleeps) + '</small>', inr(x.r.base) + '<br><small class="fo-hint">' + esc(x.r.base_source) + '</small>', '<b>' + inr(x.r.summary.avg) + '</b>', inr(x.r.summary.min), inr(x.r.summary.max), x.r.summary.open_nights + ' / ' + n, med.length ? inr(med.sort(function (a, b) { return a - b; })[med.length >> 1]) : '<span class="fo-hint">no data</span>'] };
      }), '', [1, 2, 3, 4, 5, 6])) +
      '<div class="fo-toolbar" style="margin-top:14px">Villa ' + sel('pr-v', D.properties.map(function (p) { return [p.property_id, p.name]; }), vid) + ' for ' + sel('pr-n', [['14', '14 nights'], ['30', '30 nights'], ['60', '60 nights'], ['90', '90 nights'], ['180', '180 nights']], String(n)) + '<button class="btn" id="pr-csv">Export CSV</button></div><div id="pr-v-body"></div>';
    $$('[data-v]', body).forEach(function (tr) { tr.onclick = function () { S.prVilla = tr.dataset.v; rates(body); }; });
    $('#pr-v').onchange = function () { S.prVilla = this.value; rates(body); };
    $('#pr-n').onchange = function () { S.prDays = Number(this.value); rates(body); };
    var cur = all.filter(function (x) { return x.p.property_id === vid; })[0]; if (!cur) return;
    var rr = cur.r.rows;
    $('#pr-v-body').innerHTML = card(cur.p.name + ': night by night', 'click a night for the reasons', '<div class="fo-chartbox" id="pr-chart"></div>') +
      '<div class="fo-card" style="margin-top:14px">' + table(['Night', 'Status', 'Reference rate', 'Range', 'Confidence', 'Why', 'Market (scaled to ' + cur.p.bedrooms + ' bedrooms)'], rr.map(function (r) {
        var w = new Date(r.date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
        var why = r.factors.filter(function (f) { return f.key !== 'base' && Math.abs(f.mult - 1) > 0.001; }).map(function (f) { return '<span class="fo-badge ' + (f.mult >= 1 ? '' : 'fo-badge--warn') + '" title="' + esc(f.basis) + '">' + esc(f.label) + ' ' + (f.mult >= 1 ? '+' : '') + Math.round((f.mult - 1) * 100) + '%</span>'; }).join(' ') || '<span class="fo-hint">base</span>';
        return { attrs: ' class="fo-row" data-d="' + r.date + '"', cells: [w, r.booked ? '<span class="fo-badge fo-badge--muted">booked</span>' : r.blocked ? '<span class="fo-badge fo-badge--muted">blocked</span>' : 'open', '<b>' + inr(r.recommended) + '</b>', inr(r.low) + ' – ' + inr(r.high), confBadge(r.confidence), why, r.market.n ? inr(r.market.median) + ' <small class="fo-hint">(' + r.market.n + ', ' + dm(r.market.latest) + ')</small>' : '<span class="fo-hint">no observations</span>'] };
      }), '', [2, 3]) + '</div>';
    C.combo($('#pr-chart'), { labels: rr.map(function (r) { return dm(r.date); }), kind: 'inr', series: [
      { name: 'Reference rate', values: rr.map(function (r) { return r.recommended; }), type: 'line' },
      { name: 'Market median', values: rr.map(function (r) { return r.market.median; }), type: 'line', color: '#C9A24F' },
      { name: 'Booked / blocked', values: rr.map(function (r) { return r.booked || r.blocked ? r.recommended : null; }), color: '#9BB8A8' }],
      onClick: function (i) { explain(cur.p, rr[i]); } });
    $$('[data-d]', body).forEach(function (tr) { tr.onclick = function () { explain(cur.p, rr.filter(function (r) { return r.date === tr.dataset.d; })[0]); }; });
    $('#pr-csv').onclick = function () { U.csvDownload('ap-villas-reference-rates-' + cur.p.property_id + '-' + t, ['date', 'villa', 'status', 'reference_rate', 'low', 'high', 'confidence', 'factors', 'market_median', 'market_observations', 'market_latest'], rr.map(function (r) { return [r.date, cur.p.name, r.booked ? 'booked' : r.blocked ? 'blocked' : 'open', r.recommended, r.low, r.high, r.confidence, r.factors.map(function (f) { return f.label + ' ' + Math.round((f.mult - 1) * 100) + '%: ' + f.basis; }).join(' | '), r.market.median == null ? '' : Math.round(r.market.median), r.market.n, r.market.latest || '']; })); };
  }
  function explain(villa, r) {
    if (!r) return;
    var p = U.drawer('<div class="fo-drawer__head"><div><h2 class="serif" style="font-size:24px">' + esc(villa.name) + ' · ' + esc(dmy(r.date)) + '</h2><div class="fo-hint">Reference ' + inr(r.recommended) + ' (range ' + inr(r.low) + '–' + inr(r.high) + ') · ' + esc(r.confidence) + ' confidence · ' + Math.round(r.portfolio_occupancy * 100) + '% of villas booked that night</div></div><button class="fo-iconbtn" data-close aria-label="Close">' + U.icon('x') + '</button></div>' +
      '<h3 style="margin:6px 0 8px">How the rate was built</h3>' + table(['Step', 'Effect', 'Why'], r.factors.map(function (f) { return ['<b>' + esc(f.label) + '</b>', f.key === 'base' ? inr(f.value) : (f.mult >= 1 ? '+' : '') + Math.round((f.mult - 1) * 100) + '%', esc(f.basis) + (f.value && f.key !== 'base' ? ' (' + inr(f.value) + ')' : '')]; }), '') +
      '<h3 style="margin:16px 0 8px">Competitor prices used <small class="fo-hint">dated observations, ±10 days, last 45 days, similar size</small></h3>' +
      table(['Competitor', 'Seen on', 'For stay', 'Per night', 'Scaled', 'Source'], r.market.rows.map(function (o) { return [esc(o.name), dmy(o.observed_at), o.stay_date ? dmy(o.stay_date) : '—', inr(o.price), inr(o.scaled), link(o.source_url) + ' <small class="fo-hint">' + esc(o.source_type) + '</small>']; }), 'No comparable observations for this night yet.') +
      '<p class="fo-hint" style="margin-top:12px">' + (r.market.n >= 3 ? 'The market median is blended into the rate.' : r.market.n ? 'Fewer than 3 observations: shown for reference, not blended.' : '') + ' Change weights, events and guardrails under “How prices are set”.</p>');
    void p;
  }

  // ---------- competitors ----------
  var CMP_FIELDS = [['name', 'Name', 'text'], ['type', 'Type', ['hotel', 'villa', 'serviced apartment', 'boutique', 'homestay', 'dharamshala', 'other']], ['area', 'Area / locality', 'text'], ['distance_km', 'Distance to Mahakal (km)', 'number'], ['bedrooms', 'Bedrooms (comparable unit)', 'number'], ['sleeps', 'Sleeps', 'number'],
    ['segment', 'Segment', ['budget', 'mid-scale', 'upscale', 'luxury', 'family villa', 'pilgrim budget']], ['website', 'Website', 'url'], ['listing_urls', 'OTA listing links (one per line)', 'area'], ['positioning', 'Public positioning / message', 'area'], ['amenities', 'Amenities', 'area'], ['review_themes', 'Review themes (public)', 'area'], ['source_url', 'Source', 'url'], ['notes', 'Notes', 'area']];
  function competitors(body) {
    var list = (data().competitors || []).slice().sort(function (a, b) { return (num(a.distance_km) || 99) - (num(b.distance_km) || 99); });
    body.innerHTML = '<div class="fo-toolbar"><button class="btn btn--primary" id="cm-add">+ Add competitor</button><span class="fo-hint">Public information only, with the date it was checked. Never estimates of their revenue, occupancy or bookings.</span></div>' +
      table(['Name', 'Type', 'Where', 'Size', 'Positioning', 'Amenities', 'Review themes', 'Checked', ''], list.map(function (c) {
        return [('<b>' + esc(c.name) + '</b>') + (c.website ? '<br><a href="' + esc(c.website) + '" target="_blank" rel="noopener noreferrer">website ↗</a>' : ''), esc(c.type) + '<br><small class="fo-hint">' + esc(c.segment) + '</small>', esc(c.area) + (c.distance_km ? '<br><small class="fo-hint">' + esc(c.distance_km) + ' km to Mahakal</small>' : ''),
          (c.bedrooms ? esc(c.bedrooms) + ' BR' : '') + (c.sleeps ? ' · ' + esc(c.sleeps) + ' guests' : ''), esc(c.positioning).slice(0, 160), esc(c.amenities).slice(0, 120), esc(c.review_themes).slice(0, 120), dmy(c.last_checked) + '<br>' + link(c.source_url), '<button class="btn btn--sm" data-ed="' + esc(c.competitor_id) + '">Edit</button>'];
      }), 'No competitors yet. The weekly research job adds them with sources, or add one here.');
    $('#cm-add').onclick = function () { form('competitor', {}, CMP_FIELDS); };
    $$('[data-ed]', body).forEach(function (b) { b.onclick = function () { form('competitor', list.filter(function (c) { return c.competitor_id === b.dataset.ed; })[0], CMP_FIELDS); }; });
  }
  // ---------- observations ----------
  var OBS_FIELDS = [['competitor', 'Competitor', 'text'], ['observed_at', 'Seen on', 'date'], ['stay_date', 'For stay date', 'date'], ['nights', 'Nights', 'number'], ['unit_type', 'Room / unit', 'text'], ['bedrooms', 'Bedrooms', 'number'], ['sleeps', 'Sleeps', 'number'],
    ['price_total', 'Total price ₹', 'number'], ['price_per_night', 'Or price per night ₹', 'number'], ['taxes_included', 'Taxes included', ['unknown', 'yes', 'no']], ['source_type', 'Where seen', ['website', 'ota', 'google', 'phone', 'manual', 'other']], ['source_url', 'Source link', 'url'], ['confidence', 'Confidence', ['medium', 'high', 'low']], ['notes', 'Notes', 'area']];
  function observations(body) {
    var D = data(), list = (D.market_rates || []).slice().sort(function (a, b) { return a.observed_at < b.observed_at ? 1 : -1; }), q = S.obsQ || '';
    var shown = list.filter(function (o) { return !q || (o.competitor + ' ' + o.unit_type).toLowerCase().indexOf(q.toLowerCase()) >= 0; }).slice(0, 300);
    body.innerHTML = '<div class="fo-toolbar"><input class="fo-input" id="ob-q" placeholder="Filter by competitor…" value="' + esc(q) + '"><button class="btn btn--primary" id="ob-add">+ Add a price</button><label class="btn" for="ob-file">Import CSV</label><input type="file" id="ob-file" accept=".csv" hidden><button class="btn" id="ob-csv">Export CSV</button></div>' +
      '<p class="fo-hint">Each row is a price seen publicly on a date (OTA page, website, Google, a phone quote). It is not proof of what was actually paid. CSV columns: competitor, observed_at, stay_date, nights, unit_type, bedrooms, price_total or price_per_night, source_type, source_url, confidence.</p>' +
      table(['Competitor', 'Seen on', 'For stay', 'Unit', 'Per night', 'Total', 'Taxes', 'Where', 'Confidence', 'By', ''], shown.map(function (o) {
        return [esc(o.competitor), dmy(o.observed_at), o.stay_date ? dmy(o.stay_date) + (o.nights > 1 ? ' · ' + esc(o.nights) + 'n' : '') : '—', esc(o.unit_type) + (o.bedrooms ? ' · ' + esc(o.bedrooms) + ' BR' : ''), '<b>' + inr(num(o.price_per_night)) + '</b>', o.price_total ? inr(num(o.price_total)) : '—', esc(o.taxes_included), link(o.source_url) + ' <small class="fo-hint">' + esc(o.source_type) + '</small>', confBadge(o.confidence), '<small class="fo-hint">' + esc(o.collected_by === 'automation' ? 'research job' : o.collected_by) + '</small>', '<button class="btn btn--sm btn--danger" data-del="' + esc(o.obs_id) + '">✕</button>'];
      }), 'No market prices yet.', [4, 5]);
    $('#ob-q').oninput = function () { S.obsQ = this.value; observations(body); var i = $('#ob-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
    $('#ob-add').onclick = function () { form('rate', { observed_at: today() }, OBS_FIELDS); };
    $$('[data-del]', body).forEach(function (b) { b.onclick = function () { if (confirm('Delete this observation?')) save('f.market.delete', { kind: 'rate', id: b.dataset.del }, 'Deleted'); }; });
    $('#ob-csv').onclick = function () { U.csvDownload('ap-villas-market-prices-' + today(), ['competitor', 'observed_at', 'stay_date', 'nights', 'unit_type', 'bedrooms', 'sleeps', 'price_total', 'price_per_night', 'taxes_included', 'source_type', 'source_url', 'confidence', 'notes'], list.map(function (o) { return [o.competitor, o.observed_at, o.stay_date, o.nights, o.unit_type, o.bedrooms, o.sleeps, o.price_total, o.price_per_night, o.taxes_included, o.source_type, o.source_url, o.confidence, o.notes]; })); };
    $('#ob-file').onchange = function () {
      var f = this.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () {
        var rows = parseCsv(String(rd.result)); if (rows.length < 2) return toast('No rows in that file.', true);
        var h = rows[0].map(function (x) { return String(x).trim().toLowerCase(); }), recs = rows.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
        save('f.market.import', { rates: recs }, null, function (j) { var x = j.result; toast(x.rates + ' prices added, ' + x.skipped + ' already there, ' + x.rejected + ' rejected', false, 8000); });
      };
      rd.readAsText(f);
    };
  }
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false; text = text.replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) { var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
  }
  // ---------- demand signals ----------
  var SIG_FIELDS = [['date', 'Date', 'date'], ['source', 'Source', ['trends', 'ga4', 'news', 'official', 'manual']], ['metric', 'What was measured', 'text'], ['keyword', 'Keyword / subject', 'text'], ['value', 'Value', 'number'], ['period', 'Period', 'text'], ['growth_pct', 'Growth %', 'number'], ['source_url', 'Source link', 'url'], ['notes', 'Notes', 'area']];
  function signals(body) {
    var list = (data().demand_signals || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    body.innerHTML = '<div class="fo-toolbar"><button class="btn btn--primary" id="sg-add">+ Add a signal</button><span class="fo-hint">Search interest, website traffic, official footfall and news. Interest is not bookings: signals only nudge rates ±5%.</span></div>' +
      '<div class="fo-card" style="margin-bottom:14px"><h3>Growth signals over time</h3><div class="fo-chartbox" id="sg-chart"></div></div>' +
      table(['Date', 'Source', 'Metric', 'Subject', 'Value', 'Growth', 'Source', 'By', ''], list.slice(0, 300).map(function (x) {
        return [dmy(x.date), esc(x.source), esc(x.metric), esc(x.keyword), x.value === '' ? '—' : esc(x.value), x.growth_pct === '' ? '—' : (num(x.growth_pct) > 0 ? '+' : '') + esc(x.growth_pct) + '%', link(x.source_url), '<small class="fo-hint">' + esc(x.collected_by === 'automation' ? 'research job' : x.collected_by) + '</small>', '<button class="btn btn--sm btn--danger" data-del="' + esc(x.signal_id) + '">✕</button>'];
      }), 'No signals yet. Website traffic growth is added every morning once GA4 is connected; the research job adds search and news signals.', [4, 5]);
    var g = list.filter(function (x) { return x.growth_pct !== ''; }).slice(0, 60).reverse();
    C.combo($('#sg-chart'), { labels: g.map(function (x) { return dm(x.date) + ' ' + x.source; }), kind: 'n', series: [{ name: 'Growth %', values: g.map(function (x) { return num(x.growth_pct); }) }], empty: 'No growth figures yet.' });
    $('#sg-add').onclick = function () { form('signal', { date: today(), source: 'manual' }, SIG_FIELDS); };
    $$('[data-del]', body).forEach(function (b) { b.onclick = function () { if (confirm('Delete this signal?')) save('f.market.delete', { kind: 'signal', id: b.dataset.del }, 'Deleted'); }; });
  }
  // ---------- engine settings ----------
  function engine(body) {
    var D = data(), cfg = I.pricingSettings(D), founder = S.user && S.user.role === 'founder';
    body.innerHTML = '<div class="fo-grid fo-grid--2">' + card('The variables', 'in the order they are applied', table(['Variable', 'How it works'], I.PRICING_VARIABLES.map(function (v) { return ['<b>' + esc(v[1]) + '</b>', esc(v[2])]; }), '') +
      '<p class="fo-hint" style="margin-top:10px">Confidence: high with 3+ measured inputs (your history, pace, market, measured events), medium with 1–2, low when only defaults apply. The range is ±6%, ±10% or ±15% accordingly.</p>') +
      card('Settings', founder ? 'founder only' : 'view only',
        '<div class="fo-form">' + [['weekend_uplift', 'Weekend uplift (Fri & Sat)', cfg.weekend_uplift], ['market_weight', 'Market weight', cfg.market_weight], ['floor_pct', 'Default floor (× base)', cfg.floor_pct, 1], ['ceiling_pct', 'Default ceiling (× base)', cfg.ceiling_pct, 1], ['mega_ceiling_pct', 'Ceiling in mega events (× base)', cfg.mega_ceiling_pct, 1]].map(function (x) { return '<label class="fo-field">' + esc(x[1]) + (x[3] ? '' : ' (%)') + '<input data-k="' + x[0] + '" type="number" step="any" value="' + (x[3] ? x[2] : Math.round(x[2] * 100)) + '"' + (founder ? '' : ' disabled') + '></label>'; }).join('') +
        Object.keys(cfg.event).map(function (k) { return '<label class="fo-field">Event uplift: ' + esc(k.replace('_', ' ')) + ' (%)<input data-ev="' + k + '" type="number" step="any" value="' + Math.round(cfg.event[k] * 100) + '"' + (founder ? '' : ' disabled') + '></label>'; }).join('') + '</div>' +
        '<h3 style="margin:14px 0 8px">Per villa</h3>' + table(['Villa', 'Base ₹', 'Floor ₹', 'Ceiling ₹'], D.properties.map(function (p) { var v = cfg.villas[p.property_id] || {}; return ['<b>' + esc(p.name) + '</b><br><small class="fo-hint">published from ' + inr(num(p.from_rate)) + '</small>'].concat(['base', 'floor', 'ceiling'].map(function (k) { return '<input class="fo-input" style="width:110px" data-v="' + esc(p.property_id) + '" data-f="' + k + '" type="number" min="0" step="100" placeholder="auto" value="' + esc(v[k] || '') + '"' + (founder ? '' : ' disabled') + '>'; })); }), '') +
        (founder ? '<button class="btn btn--primary" id="pe-save" style="margin-top:12px">Save settings</button> <button class="btn" id="pe-reset" style="margin-top:12px">Back to defaults</button>' : '')) + '</div>';
    if (!founder) return;
    $('#pe-save').onclick = function () {
      var o = { villas: {}, event: {} };
      $$('[data-k]', body).forEach(function (i) { if (i.value !== '') o[i.dataset.k] = /pct$/.test(i.dataset.k) ? Number(i.value) : Number(i.value) / 100; });
      $$('[data-ev]', body).forEach(function (i) { if (i.value !== '') o.event[i.dataset.ev] = Number(i.value) / 100; });
      $$('[data-v]', body).forEach(function (i) { if (i.value !== '') { (o.villas[i.dataset.v] = o.villas[i.dataset.v] || {})[i.dataset.f] = Number(i.value); } });
      save('f.pricing.settings', { pricing: o }, 'Pricing settings saved');
    };
    $('#pe-reset').onclick = function () { if (confirm('Reset all pricing settings to the defaults?')) save('f.pricing.settings', { pricing: {} }, 'Defaults restored'); };
  }

  // ---------- shared record form ----------
  function form(kind, rec, fields) {
    var p = U.drawer('<div class="fo-drawer__head"><h2 class="serif" style="font-size:24px">' + ({ competitor: 'Competitor', rate: 'Market price', signal: 'Demand signal' }[kind]) + '</h2><button class="fo-iconbtn" data-close aria-label="Close">' + U.icon('x') + '</button></div><form class="fo-form" novalidate>' +
      fields.map(function (f) {
        var v = rec[f[0]] == null ? '' : rec[f[0]], full = f[2] === 'area' ? ' full' : '';
        if (Array.isArray(f[2])) return '<label class="fo-field">' + esc(f[1]) + '<select name="' + f[0] + '">' + f[2].map(function (o) { return '<option' + (String(v) === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
        if (f[2] === 'area') return '<label class="fo-field' + full + '">' + esc(f[1]) + '<textarea name="' + f[0] + '" rows="2">' + esc(v) + '</textarea></label>';
        return '<label class="fo-field">' + esc(f[1]) + '<input name="' + f[0] + '" type="' + (f[2] === 'url' ? 'url' : f[2]) + '" value="' + esc(v) + '"></label>';
      }).join('') + '<div class="full"><div class="fo-msg" id="mf-msg"></div><button class="btn btn--primary" type="submit">Save</button>' + (rec.competitor_id ? ' <button class="btn btn--danger" type="button" id="mf-del">Delete</button>' : '') + '</div></form>');
    var fm = $('form', p);
    fm.onsubmit = function (e) {
      e.preventDefault(); var o = {}; $$('input,select,textarea', fm).forEach(function (el) { o[el.name] = el.value; });
      if (rec.competitor_id) o.competitor_id = rec.competitor_id;
      var b = $('button[type=submit]', fm); b.disabled = true;
      U.api('f.market.save', { kind: kind, record: o }).then(function (j) { b.disabled = false; if (!j.ok) { $('#mf-msg', p).textContent = j.error; return; } p.parentNode.remove(); toast('Saved'); U.load(true); });
    };
    var d = $('#mf-del', p); if (d) d.onclick = function () { if (confirm('Delete ' + rec.name + '?')) U.api('f.market.delete', { kind: 'competitor', id: rec.competitor_id }).then(function (j) { if (!j.ok) return toast(j.error, true); p.parentNode.remove(); toast('Deleted'); U.load(true); }); };
  }

  // ============================================================ Settings → Automation ============================================================
  U.settingsExtra.automation = function (body) {
    var a = data().automation || { active: false }, founder = S.user && S.user.role === 'founder';
    body.innerHTML = '<div class="fo-grid fo-grid--2"><div class="fo-card"><h3>Automation key <span class="fo-status ' + (a.active ? 'on' : 'off') + '">' + (a.active ? 'Active' : 'Not set') + '</span></h3>' +
      (a.active ? '<p>Created ' + when(a.created_at) + ' by ' + esc(a.created_by || '') + '. Last used ' + (a.last_used ? when(a.last_used) : 'never') + '.</p>' : '<p>Lets the automatic jobs send public data into this portal: weekly market research, pricing signals every 6 hours (weather, holidays, Hindu calendar) and the daily pricing intelligence (news signals and the 30-day outlook).</p>') +
      '<p class="fo-hint">The key can only: import market data, upload market reports, read website analytics and read aggregate figures. It can never read guest names, phones or emails, change bookings or sign in. It is stored only as a fingerprint; creating a new one cancels the old one.</p>' +
      (founder ? '<button class="btn btn--primary" id="ak-new">' + (a.active ? 'Replace key' : 'Create key') + '</button>' + (a.active ? ' <button class="btn btn--danger" id="ak-revoke">Revoke</button>' : '') : '<p class="fo-hint">Only the founder can manage the key.</p>') + '<div id="ak-out"></div></div>' +
      '<div class="fo-card"><h3>Connect the weekly research job</h3><ol style="line-height:1.7;margin:0;padding-left:18px"><li>Create the key here and copy it (shown once).</li><li>On your Mac, in Terminal, run (it asks for the key without showing it):<pre class="fo-note" style="white-space:pre-wrap;user-select:all">gh secret set FOUNDER_OS_KEY --repo apvillasandresorts/AP-villa-and-resorts-website</pre></li><li>That is all: pricing signals run every 6 hours, pricing intelligence daily at 06:30 IST and market research on Mondays at 07:30 IST (GitHub → Actions → Run workflow to try one now). Results appear in Pricing & market and Reports.</li></ol>' +
      '<p class="fo-hint">Uses your Claude subscription (the same token as the blog), no paid APIs. Logs on GitHub show only public market research, never your figures.</p></div></div>';
    if (!founder) return;
    $('#ak-new').onclick = function () {
      if (a.active && !confirm('Replace the key? The current one stops working immediately.')) return;
      U.api('f.automation.create', {}).then(function (j) {
        if (!j.ok) return toast(j.error, true);
        $('#ak-out').innerHTML = '<div class="fo-note" style="margin-top:12px;border-color:#E2C27A"><b>Copy this key now: it will not be shown again.</b><input class="fo-input" id="ak-key" readonly value="' + esc(j.key) + '" style="margin:8px 0;font-family:monospace"><button class="btn btn--sm" id="ak-copy">Copy</button></div>';
        $('#ak-copy').onclick = function () { var i = $('#ak-key'); i.select(); try { navigator.clipboard.writeText(i.value).then(function () { toast('Copied'); }); } catch (e) { document.execCommand('copy'); toast('Copied'); } };
        S.data.automation = { active: true, created_at: new Date().toISOString(), created_by: S.user.email, last_used: '' };
      });
    };
    var rv = $('#ak-revoke'); if (rv) rv.onclick = function () { if (confirm('Revoke the key? The research job will stop sending data until you create a new one.')) save('f.automation.revoke', {}, 'Key revoked'); };
  };

  U.VIEWS.pricing = viewPricing;
})();
