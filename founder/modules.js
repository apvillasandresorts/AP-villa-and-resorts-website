/**
 * AP Villas Founder OS · modules for phases 5–10 (registered into app.js, then the app starts).
 * Revenue Intelligence, Analytics Studio, Trends & Ujjain events, Website Analytics (GA4), Financial Intelligence,
 * Forecasting & Scenario Lab, Strategic Recommendations, Reports & Exports, plus Settings tabs.
 * Every figure comes from founder/metrics.js + founder/insights.js on the real ledger; nothing is mocked.
 */
(function () {
  'use strict';
  var U = window.FoUI, I = window.FoInsights, M = U.M, C = U.C, S = U.S;
  var esc = U.esc, $ = U.$, $$ = U.$$, inr = U.inr, pct = U.pct, n1 = U.n1, dmy = U.dmy, dm = U.dm, when = U.when, toast = U.toast, sel = U.sel;
  var num = M.num, has = M.has;
  function D() { return Object.assign({}, S.data, { exceptions: S.data.exceptions }); }
  function today() { return U.today(); }
  function range() { return U.currentRange(); }
  function f() { return U.filt(); }
  function events() { return I.allEvents(S.data.events); }
  function card(title, sub, body, tools) { return '<div class="fo-card"><h3>' + esc(title) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + (tools ? '<span class="fo-card__tools">' + tools + '</span>' : '') + '</h3>' + body + '</div>'; }
  function kpi(label, value, note, cls) { return '<div class="fo-card' + (cls ? ' ' + cls : '') + '"><div class="fo-kpi__label">' + esc(label) + '</div><div class="fo-kpi__value">' + value + '</div>' + (note ? '<div class="fo-kpi__cmp"><span class="flat">' + note + '</span></div>' : '') + '</div>'; }
  function table(head, rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<div class="fo-empty">' + esc(opts.empty || 'Nothing to show for this period.') + '</div>';
    return '<div class="fo-tablewrap"><table class="fo-table"><thead><tr>' + head.map(function (h, i) { return '<th' + ((opts.num || []).indexOf(i) >= 0 ? ' class="num"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + ((opts.num || []).indexOf(i) >= 0 ? ' class="num"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  function wireExports(page, name) {
    $$('[data-svg]', page).forEach(function (b) { b.onclick = function () { C.exportSvg($('#' + b.dataset.svg), name + '-' + b.dataset.svg); }; });
    $$('[data-png]', page).forEach(function (b) { b.onclick = function () { C.exportPng($('#' + b.dataset.png), name + '-' + b.dataset.png); }; });
  }
  function tools(id) { return '<button class="btn btn--sm" data-svg="' + id + '">SVG</button><button class="btn btn--sm" data-png="' + id + '">PNG</button>'; }
  function chart(id, title, sub) { return card(title, sub, '<div class="fo-chartbox" id="' + id + '"></div>', tools(id)); }
  function pp(v) { return v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + ' pts'; }
  function sign(v) { return v == null ? '—' : (v >= 0 ? '+' : '−') + inr(Math.abs(v)).replace('₹', '₹'); }
  function label(g, k) { return g === 'day' ? dm(k) : g === 'week' ? 'w/c ' + dm(k) : k; }
  function propOptions(cur, withAll) { return (withAll ? [['all', 'All villas (shared)']] : []).concat(S.data.properties.map(function (p) { return [p.property_id, p.name]; })); }
  function catName(c) { var x = I.EXPENSE_CATEGORIES.filter(function (k) { return k[0] === c; })[0]; return x ? x[1] : c === 'revenue' ? 'Revenue (target)' : c; }
  function busy(btn, on, text) { btn.disabled = on; if (text) btn.textContent = text; }

  // ============================================================ Revenue Intelligence (phase 8) ============================================================
  function viewRevenue(page) {
    var T = U.tabs('revenue', [['why', 'Why revenue changed'], ['channels', 'Channel profitability'], ['pricing', 'Pricing & seasonality'], ['forward', 'Forward occupancy']]);
    var r = range();
    page.innerHTML = U.hello('Revenue intelligence', esc(dmy(r.from)) + ' – ' + esc(dmy(r.to)) + ' · stay-date basis, villa-nights') + T.html + '<div id="rv"></div>';
    U.wireTabs(page, 'revenue');
    var body = $('#rv'), Dt = D(), F = f();
    if (T.cur === 'why') {
      var cur = M.compute(Dt, r.from, r.to, F), pr = M.previous(r.from, r.to), prev = M.compute(Dt, pr.from, pr.to, F), d = I.decompose(cur, prev);
      body.innerHTML = '<div class="fo-grid fo-grid--kpi">' + kpi('Revenue now', inr(cur.net_accommodation_revenue), dmy(r.from) + ' – ' + dmy(r.to)) + kpi('Revenue before', inr(prev.net_accommodation_revenue), dmy(pr.from) + ' – ' + dmy(pr.to)) +
        kpi('Available villa-nights', cur.available_nights + ' vs ' + prev.available_nights) + kpi('Occupancy', pct(cur.occupancy) + ' vs ' + pct(prev.occupancy)) + kpi('ADR', inr(cur.adr) + ' vs ' + inr(prev.adr)) + '</div>' +
        '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + chart('rv-wf', 'Revenue bridge', 'Revenue = available nights × occupancy × ADR') +
        card('What drove the change', d.method, d.method === 'unavailable' ? '<p class="fo-hint">' + esc(d.note) + '</p>' :
          U.kv('Total change', '<b>' + sign(d.change) + '</b>') + U.kv('From availability (villas/blocks)', sign(d.availability)) + U.kv('From occupancy (more or fewer nights sold)', sign(d.occupancy)) + U.kv('From ADR (price realised per night)', sign(d.adr)) +
          '<p class="fo-hint" style="margin-top:10px">The three effects add up exactly to the change (log-mean attribution). This explains <b>what</b> moved; the reasons behind it (demand, events, pricing decisions) are hypotheses to check.</p>') + '</div>';
      if (d.method !== 'unavailable') C.waterfall($('#rv-wf'), [{ label: 'Before', value: d.from, total: true }, { label: 'Availability', value: d.availability }, { label: 'Occupancy', value: d.occupancy }, { label: 'ADR', value: d.adr }, { label: 'Now', value: d.to, total: true }], { kind: 'inr' });
      else C.empty($('#rv-wf'), d.note);
    } else if (T.cur === 'channels') {
      var cp = I.channelProfit(Dt, r.from, r.to, F);
      body.innerHTML = '<div class="fo-grid fo-grid--2">' + chart('rv-cp', 'Revenue and contribution by channel', 'stay date') +
        card('How to read this', '', '<p class="fo-hint">Contribution = revenue − OTA commission − payment fees. It shows as “partial” where a channel\'s commission is unknown: set real rates in Settings → Channel rates. Variable operating costs are in Financial intelligence.</p>' + U.kv('Direct revenue', inr(cp.filter(function (x) { return x.direct; }).reduce(function (s, x) { return s + x.revenue; }, 0))) + U.kv('OTA revenue', inr(cp.filter(function (x) { return !x.direct; }).reduce(function (s, x) { return s + x.revenue; }, 0))) + U.kv('Commission (recorded + estimated)', inr(cp.reduce(function (s, x) { return s + x.commission; }, 0)))) + '</div>' +
        '<div class="fo-card" style="margin-top:14px"><h3>Channel profitability <span class="fo-card__tools"><button class="btn btn--sm" id="rv-cpx">Excel</button></span></h3>' +
        table(['Channel', 'Stays', 'Nights', 'Revenue', 'ADR', 'Commission', 'Payment fees', 'Contribution', 'Margin', 'Bookings made', 'Avg booking value', 'Cancel rate'], cp.map(function (x) {
          return ['<b>' + esc(x.channel) + '</b>' + (x.direct ? ' <span class="fo-badge">direct</span>' : ''), x.stays, x.nights, inr(x.revenue), inr(x.adr), x.commission_unknown ? (x.commission ? inr(x.commission) + ' + ' : '') + '<span class="fo-hint">' + x.commission_unknown + ' unknown</span>' : inr(x.commission),
            x.payment_fee_known ? inr(x.payment_fees) : '<span class="fo-hint">rate not set</span>', x.contribution == null ? '<span class="fo-badge fo-badge--warn">partial</span>' : inr(x.contribution), pct(x.margin, 0), x.bookings_made, inr(x.avg_booking_value), pct(x.cancellation_rate, 0)];
        }), { num: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }) + '</div>';
      C.combo($('#rv-cp'), { labels: cp.map(function (x) { return x.channel; }), kind: 'inr', series: [{ name: 'Revenue', values: cp.map(function (x) { return x.revenue; }) }, { name: 'Contribution (known)', values: cp.map(function (x) { return x.contribution || 0; }), color: '#C9A24F' }], onClick: function (i) { U.drill('stay', r.from, r.to, { channel: cp[i].channel }); } });
      $('#rv-cpx').onclick = function () { C.exportExcel('channel-profitability-' + r.from + '-' + r.to, [{ name: 'Channels', head: ['Channel', 'Direct', 'Stays', 'Nights', 'Revenue', 'ADR', 'Commission', 'Commission unknown (bookings)', 'Payment fees', 'Contribution', 'Margin', 'Bookings made', 'Avg booking value', 'Cancellation rate'], rows: cp.map(function (x) { return [x.channel, x.direct ? 'yes' : 'no', x.stays, x.nights, Math.round(x.revenue), x.adr == null ? '' : Math.round(x.adr), Math.round(x.commission), x.commission_unknown, Math.round(x.payment_fees), x.contribution == null ? 'partial' : Math.round(x.contribution), x.margin == null ? '' : x.margin, x.bookings_made, x.avg_booking_value == null ? '' : Math.round(x.avg_booking_value), x.cancellation_rate == null ? '' : x.cancellation_rate]; }) }]); };
    } else if (T.cur === 'pricing') {
      var se = I.seasonality(Dt, F), wk = I.weekendByVilla(Dt, r.from, r.to), de = I.discountEffect(Dt, r.from, r.to, F), cl = I.cancellationLeakage(Dt, r.from, r.to, F);
      body.innerHTML = chart('rv-se', 'Seasonality: occupancy and ADR by month', 'all history') +
        '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + card('Weekend vs weekday by villa', 'Fri & Sat nights', table(['Villa', 'Weekend occ.', 'Weekday occ.', 'Weekend ADR', 'Weekday ADR', 'Weekend premium'], wk.map(function (x) { return ['<b>' + esc(x.name) + '</b>', pct(x.weekend.occupancy, 0), pct(x.weekday.occupancy, 0), inr(x.weekend.adr), inr(x.weekday.adr), x.premium == null ? '—' : pct(x.premium, 0)]; }), { num: [1, 2, 3, 4, 5] })) +
        card('Discount effectiveness', 'bookings made in period', table(['', 'Bookings', 'ADR', 'Avg stay', 'Cancel rate', 'Discount given'], [['With discount', de.with_discount], ['No discount', de.without_discount]].map(function (x) { var s = x[1]; return ['<b>' + x[0] + '</b>', s.bookings, inr(s.adr), s.alos == null ? '—' : n1(s.alos) + ' n', pct(s.cancellation_rate, 0), inr(s.discount_total)]; }), { num: [1, 2, 3, 4, 5] }) + (de.note ? '<p class="fo-hint">' + esc(de.note) + '</p>' : '')) + '</div>' +
        '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + card('Cancellation leakage', 'value lost to cancellations and no-shows, by booking date', table(['Channel', 'Cancelled', 'Value lost', 'Fees kept'], cl.map(function (x) { return ['<b>' + esc(x.channel) + '</b>', x.cancelled, inr(x.lost_value), inr(x.kept)]; }), { num: [1, 2, 3], empty: 'No cancellations in this period.' })) +
        card('Pricing suggestions', 'evidence only', pricingRecs() + '<p class="fo-hint">The portal never changes your live prices. Suggestions appear only when the data supports them.</p>') + '</div>';
      C.combo($('#rv-se'), { labels: se.map(function (x) { return x.month; }), kind: 'pct', rightKind: 'inr', series: [{ name: 'Occupancy', values: se.map(function (x) { return x.occupancy; }) }, { name: 'ADR', values: se.map(function (x) { return x.adr; }), type: 'line', axis: 'right', color: '#C9A24F' }], empty: 'No stays recorded yet.' });
    } else {
      var fw = I.forwardOccupancy(Dt, 13, F);
      body.innerHTML = chart('rv-fw', 'On the books: next 13 weeks', 'confirmed bookings only') + '<div class="fo-card" style="margin-top:14px">' +
        table(['Week', 'Occupancy', 'Nights', 'Revenue on the books', 'Events'], fw.map(function (w) { var ev = events().filter(function (e) { return e.start <= w.to && e.end >= w.from; }).map(function (e) { return esc(e.name); }).join(', '); return [dm(w.from) + ' – ' + dm(w.to), pct(w.occupancy, 0), w.nights + '/' + w.available, inr(w.revenue), ev || '<span class="fo-hint">—</span>']; }), { num: [1, 2, 3] }) +
        '<p class="fo-hint">Same-time-last-year pickup comparisons become available as daily snapshots accumulate (one is saved every morning).</p></div>';
      C.combo($('#rv-fw'), { labels: fw.map(function (w) { return dm(w.from); }), kind: 'pct', series: [{ name: 'Occupancy on the books', values: fw.map(function (w) { return w.occupancy; }) }], onClick: function (i) { U.drill('stay', fw[i].from, fw[i].to); } });
    }
    wireExports(page, 'revenue');
  }
  function pricingRecs() {
    var recs = I.recommendations(D(), { events: S.data.events, exceptions: S.data.exceptions }).filter(function (x) { return /^weekend_rate|^event_|^villa_/.test(x.key); });
    return recs.length ? recs.map(function (x) { return '<div class="fo-action"><div><b>' + esc(x.issue) + '</b><span class="fo-hint">' + esc(x.facts.join(' ')) + ' ' + esc(x.action) + '</span></div></div>'; }).join('') : '<p class="fo-hint">No pricing change is supported by the data right now.</p>';
  }

  // ============================================================ Analytics Studio (phase 5) ============================================================
  var METRICS = {
    revenue: ['Net accommodation revenue', 'series', 'stay', 'inr'], occupancy: ['Occupancy', 'series', 'stay', 'pct'], adr: ['ADR', 'series', 'stay', 'inr'], revpar: ['RevPAR', 'series', 'stay', 'inr'],
    bookings: ['Bookings made', 'series', 'booking', 'n'], booking_value: ['Booking value', 'series', 'booking', 'inr'], cancellations: ['Cancellations', 'series', 'booking', 'n'], cancellation_rate: ['Cancellation rate', 'series', 'booking', 'pct'],
    cash: ['Cash collected (net of refunds)', 'series', 'payment', 'inr'], channel_mix: ['Channel mix (booking value)', 'category', 'booking', 'inr'], villa_revenue: ['Revenue by villa', 'category', 'stay', 'inr'], villa_occupancy: ['Occupancy by villa', 'category', 'stay', 'pct'],
    lead_time: ['Lead time distribution', 'category', 'booking', 'n'], length_of_stay: ['Length of stay distribution', 'category', 'stay', 'n'], forward_occupancy: ['Forward occupancy (13 weeks)', 'series', 'stay', 'pct'], expenses: ['Expenses by category', 'category', 'expense', 'inr'],
  };
  /** Data for a saved chart definition: {labels, series:[{name, values}], kind, categories:[{label, value}]} */
  function chartData(cfg) {
    var Dt = D(), F = JSON.parse(cfg.filters || '{}'), meta = METRICS[cfg.metric], rr = M.range(cfg.range || 'last12m', today()), g = cfg.grain || 'month';
    if (!meta) return null;
    function seriesFor(from, to) {
      var s = M.series(Dt, from, to, g, F);
      if (cfg.metric === 'cash') { var dd = I.daily(Dt, from, to, 'cash', F), o = {}; dd.forEach(function (p) { var k = M.bucket(p.date, g); o[k] = (o[k] || 0) + p.value; }); return s.map(function (x) { return o[x.key] || 0; }); }
      return s.map(function (x) { return { revenue: x.revenue, occupancy: x.occupancy, adr: x.adr, revpar: x.available ? x.revenue / x.available : null, bookings: x.bookings, booking_value: x.value, cancellations: x.cancelled, cancellation_rate: x.bookings ? x.cancelled / x.bookings : null }[cfg.metric]; });
    }
    if (cfg.metric === 'forward_occupancy') { var fw = I.forwardOccupancy(Dt, 13, F); return { kind: 'pct', labels: fw.map(function (w) { return dm(w.from); }), series: [{ name: 'On the books', values: fw.map(function (w) { return w.occupancy; }) }] }; }
    if (meta[1] === 'series') {
      var base = M.series(Dt, rr.from, rr.to, g, F), out = { kind: meta[3], labels: base.map(function (x) { return label(g, x.key); }), series: [{ name: meta[0], values: seriesFor(rr.from, rr.to) }] };
      if (cfg.comparison === 'previous') { var p = M.previous(rr.from, rr.to); out.series.push({ name: 'Previous period', values: seriesFor(p.from, p.to).slice(0, base.length), color: '#9BB8A8' }); }
      if (cfg.comparison === 'last_year') { var l = M.lastYear(rr.from, rr.to); out.series.push({ name: 'Last year', values: seriesFor(l.from, l.to).slice(0, base.length), color: '#9BB8A8' }); }
      return out;
    }
    var cats;
    if (cfg.metric === 'channel_mix') cats = M.breakdown(Dt, rr.from, rr.to, 'channel', F).map(function (x) { return { label: x.key, value: x.value }; });
    else if (cfg.metric === 'villa_revenue') cats = M.byProperty(Dt, rr.from, rr.to).map(function (x) { return { label: x.name, value: x.revenue }; });
    else if (cfg.metric === 'villa_occupancy') cats = M.byProperty(Dt, rr.from, rr.to).map(function (x) { return { label: x.name, value: x.occupancy || 0 }; });
    else if (cfg.metric === 'lead_time') cats = M.histogram(M.leadTimes(Dt, rr.from, rr.to, F).real, [['0–2 d', 0, 2], ['3–7 d', 3, 7], ['8–14 d', 8, 14], ['15–30 d', 15, 30], ['31–60 d', 31, 60], ['61–90 d', 61, 90], ['90+ d', 91, 1e9]]).map(function (x) { return { label: x.label, value: x.count }; });
    else if (cfg.metric === 'length_of_stay') cats = M.histogram(M.stayLengths(Dt, rr.from, rr.to, F), [['1 night', 1, 1], ['2', 2, 2], ['3', 3, 3], ['4–6', 4, 6], ['7+', 7, 1e9]]).map(function (x) { return { label: x.label, value: x.count }; });
    else { var by = {}; I.expensesIn(Dt, rr.from, rr.to, F).forEach(function (x) { by[x.e.category] = (by[x.e.category] || 0) + x.amount; }); cats = Object.keys(by).map(function (k) { return { label: catName(k), value: by[k] }; }); }
    return { kind: meta[3], categories: cats };
  }
  function drawChart(host, cfg) {
    var d = chartData(cfg); if (!d) return C.empty(host, 'Unknown metric.');
    var type = cfg.chart_type;
    if (type === 'table') {
      var rows = d.categories ? d.categories.map(function (c) { return [esc(c.label), C.fmt(c.value, d.kind)]; }) : d.labels.map(function (l, i) { return [esc(l)].concat(d.series.map(function (s) { return C.fmt(s.values[i], d.kind); })); });
      host.innerHTML = table(d.categories ? ['Item', 'Value'] : ['Period'].concat(d.series.map(function (s) { return s.name; })), rows, { num: [1, 2] }); return d;
    }
    if (d.categories) { if (type === 'donut') C.donut(host, d.categories, { kind: d.kind }); else C.hbars(host, d.categories, { kind: d.kind }); return d; }
    C.combo(host, { labels: d.labels, kind: d.kind, stacked: type === 'stacked', series: d.series.map(function (s, i) { return Object.assign({}, s, { type: type === 'line' || (i > 0 && type !== 'stacked') ? 'line' : 'bar' }); }) });
    return d;
  }
  function chartRows(cfg) {
    var d = chartData(cfg); if (!d) return { head: [], rows: [] };
    if (d.categories) return { head: ['Item', 'Value'], rows: d.categories.map(function (c) { return [c.label, Math.round(c.value * 1000) / 1000]; }) };
    return { head: ['Period'].concat(d.series.map(function (s) { return s.name; })), rows: d.labels.map(function (l, i) { return [l].concat(d.series.map(function (s) { return s.values[i] == null ? '' : Math.round(s.values[i] * 1000) / 1000; })); }) };
  }
  function viewStudio(page) {
    var T = U.tabs('studio', [['library', 'Chart library'], ['dashboards', 'Dashboards'], ['new', 'Build a chart']]);
    page.innerHTML = U.hello('Analytics studio', 'Saved charts redraw from the live ledger every time; definitions and dashboards are stored in your data sheet.') + T.html + '<div id="st"></div>';
    U.wireTabs(page, 'studio');
    var body = $('#st');
    if (T.cur === 'new' || S.editChart) return builder(body, S.editChart);
    if (T.cur === 'dashboards') return dashboards(body);
    var charts = (S.data.charts || []).slice().sort(function (a, b) { return (b.pinned === 'yes') - (a.pinned === 'yes') || (a.title < b.title ? -1 : 1); });
    body.innerHTML = charts.length ? '<div class="fo-grid fo-grid--2">' + charts.map(function (c) {
      return '<div class="fo-card"><h3>' + (c.pinned === 'yes' ? '★ ' : '') + esc(c.title) + ' <small>' + esc((METRICS[c.metric] || [''])[0]) + ' · ' + esc(c.range) + ' · ' + esc(c.grain) + '</small><span class="fo-card__tools">' +
        '<button class="btn btn--sm" data-ex="' + esc(c.chart_id) + '">Export ▾</button><button class="btn btn--sm" data-edit="' + esc(c.chart_id) + '">Edit</button></span></h3><div class="fo-chartbox" id="ch-' + esc(c.chart_id) + '"></div>' +
        '<div class="fo-hint" style="margin-top:6px">Refresh: ' + esc(c.refresh_policy) + ' · last refresh ' + when(c.last_refresh) + ' · ' + esc(c.refresh_status || 'not refreshed yet') + ' · created ' + when(c.created_at) + '</div>' +
        '<div class="fo-toolbar" style="margin:8px 0 0"><button class="btn btn--sm" data-pin="' + esc(c.chart_id) + '">' + (c.pinned === 'yes' ? 'Unpin' : 'Pin') + '</button><button class="btn btn--sm" data-dup="' + esc(c.chart_id) + '">Duplicate</button>' +
        sel('ty-' + c.chart_id, [['line', 'Line'], ['bar', 'Bar'], ['stacked', 'Stacked'], ['donut', 'Donut'], ['hbar', 'Horizontal bars'], ['table', 'Table']], c.chart_type) + '<button class="btn btn--sm btn--danger" data-del="' + esc(c.chart_id) + '">Delete</button></div></div>';
    }).join('') + '</div>' : '<div class="fo-empty">No saved charts yet. <a href="#/studio/new">Build your first chart →</a></div>';
    charts.forEach(function (c) { drawChart($('#ch-' + c.chart_id), c); });
    function save(c, patch, msg) { api('f.chart.save', { chart: Object.assign({}, c, { filters: JSON.parse(c.filters || '{}'), pinned: c.pinned === 'yes' }, patch) }, msg); }
    $$('[data-edit]', body).forEach(function (b) { b.onclick = function () { S.editChart = byId(b.dataset.edit); location.hash = '#/studio/new'; U.renderPage(); }; });
    $$('[data-pin]', body).forEach(function (b) { b.onclick = function () { var c = byId(b.dataset.pin); save(c, { pinned: c.pinned !== 'yes' }, 'Saved'); }; });
    $$('[data-dup]', body).forEach(function (b) { b.onclick = function () { var c = byId(b.dataset.dup); save(c, { chart_id: '', title: c.title + ' (copy)', pinned: false }, 'Duplicated'); }; });
    $$('select[id^=ty-]', body).forEach(function (s) { s.onchange = function () { save(byId(s.id.slice(3)), { chart_type: s.value }, 'Chart type changed'); }; });
    $$('[data-del]', body).forEach(function (b) { b.onclick = function () { if (confirm('Delete this chart? Dashboards that use it will skip it.')) api('f.chart.delete', { chart_id: b.dataset.del }, 'Deleted'); }; });
    $$('[data-ex]', body).forEach(function (b) { b.onclick = function () { exportMenu(b, byId(b.dataset.ex)); }; });
  }
  function byId(id) { return (S.data.charts || []).filter(function (c) { return c.chart_id === id; })[0]; }
  function api(action, body, okMsg, after) {
    return U.api(action, body).then(function (j) { if (!j.ok) { toast(j.error, true); return j; } if (okMsg) toast(okMsg); return U.load(true).then(function () { if (after) after(j); return j; }); });
  }
  function exportMenu(btn, c) {
    var old = $('.fo-menu'); if (old) old.remove();
    var m = document.createElement('div'); m.className = 'fo-menu'; var r = btn.getBoundingClientRect();
    m.style.top = (r.bottom + window.scrollY + 4) + 'px'; m.style.left = Math.max(8, r.right - 220) + 'px'; m.style.right = 'auto'; m.style.position = 'absolute';
    m.innerHTML = '<button data-f="csv">CSV</button><button data-f="xls">Excel</button><button data-f="png">PNG image</button><button data-f="svg">SVG image</button><button data-f="pdf">PDF (print)</button>';
    document.body.appendChild(m);
    m.onclick = function (e) {
      var b = e.target.closest('[data-f]'); if (!b) return; m.remove();
      var host = $('#ch-' + c.chart_id), name = c.title.replace(/[^\w-]+/g, '-').toLowerCase(), rows = chartRows(c);
      if (b.dataset.f === 'csv') U.csvDownload(name, rows.head, rows.rows);
      if (b.dataset.f === 'xls') C.exportExcel(name, [{ name: c.title, head: rows.head, rows: rows.rows }]);
      if (b.dataset.f === 'png') C.exportPng(host, name);
      if (b.dataset.f === 'svg') C.exportSvg(host, name);
      if (b.dataset.f === 'pdf') {   // a clean print view of this chart; choose "Save as PDF" in the print dialog
        var w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to save as PDF.', true);
        var svg = host.querySelector('svg'), tbl = host.querySelector('table');
        w.document.write('<!doctype html><title>' + esc(c.title) + '</title><body style="font-family:Arial,sans-serif;padding:24px;color:#1C2421"><h2 style="color:#0F3D2E">' + esc(c.title) + '</h2><p style="color:#6B756F;font-size:12px">AP Villas Founder OS · ' + esc((METRICS[c.metric] || [''])[0]) + ' · ' + esc(c.range) + ' · printed ' + new Date().toLocaleString('en-IN') + '</p>' +
          (svg ? new XMLSerializer().serializeToString(svg).replace(/class="fo-grid"/g, 'stroke="#E3E9E5"').replace(/class="fo-axis"/g, 'fill="#6B756F"') : '') + (tbl ? tbl.outerHTML : '') + '</body>');
        w.document.close(); w.focus(); w.print();
      }
    };
    setTimeout(function () { document.addEventListener('click', function close(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', close); } }); }, 0);
  }
  function builder(body, c) {
    c = c || { title: '', metric: 'revenue', chart_type: 'bar', grain: 'month', range: 'last12m', filters: '{}', comparison: 'none', refresh_policy: 'daily' };
    var flt = JSON.parse(c.filters || '{}');
    body.innerHTML = '<div class="fo-grid fo-grid--2"><div class="fo-card"><h3>' + (c.chart_id ? 'Edit chart' : 'New chart') + '</h3><div class="fo-form">' +
      '<label class="fo-field full">Title<input id="b-title" maxlength="120" value="' + esc(c.title) + '" placeholder="e.g. Monthly revenue vs last year"></label>' +
      '<label class="fo-field">Metric' + sel('b-metric', Object.keys(METRICS).map(function (k) { return [k, METRICS[k][0]]; }), c.metric) + '</label>' +
      '<label class="fo-field">Chart type' + sel('b-type', [['bar', 'Bar'], ['line', 'Line'], ['stacked', 'Stacked bars'], ['donut', 'Donut'], ['hbar', 'Horizontal bars'], ['table', 'Table']], c.chart_type) + '</label>' +
      '<label class="fo-field">Date range' + sel('b-range', [['last30', 'Last 30 days'], ['this_month', 'This month'], ['prev_month', 'Previous month'], ['qtd', 'Quarter to date'], ['ytd', 'Year to date'], ['last12m', 'Last 12 months'], ['next90', 'Next 90 days']], c.range) + '</label>' +
      '<label class="fo-field">Group by' + sel('b-grain', [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']], c.grain) + '</label>' +
      '<label class="fo-field">Villa' + sel('b-prop', [['all', 'All villas']].concat(S.data.properties.map(function (p) { return [p.property_id, p.name]; })), flt.property || 'all') + '</label>' +
      '<label class="fo-field">Channel' + sel('b-ch', [['all', 'All channels']].concat(U.uniq(S.data.bookings.map(function (b) { return b.channel; })).map(function (x) { return [x, x]; })), flt.channel || 'all') + '</label>' +
      '<label class="fo-field">Compare with' + sel('b-cmp', [['none', 'Nothing'], ['previous', 'Previous period'], ['last_year', 'Same dates last year']], c.comparison) + '</label>' +
      '<label class="fo-field">Refresh policy' + sel('b-ref', [['live', 'Live (every view)'], ['daily', 'Daily'], ['weekly', 'Weekly (Mondays)'], ['monthly', 'Monthly (1st)']], c.refresh_policy) + '</label>' +
      '</div><p class="fo-hint">Date basis is fixed by the metric (stay date for revenue/occupancy, booking date for bookings/value, payment date for cash) so charts never mix bases.</p><div class="fo-msg" id="b-msg"></div>' +
      '<button class="btn btn--primary" id="b-save">' + (c.chart_id ? 'Save changes' : 'Save chart') + '</button> ' + (c.chart_id ? '<button class="btn" id="b-copy">Save as copy</button> ' : '') + '<button class="btn" id="b-cancel">Cancel</button></div>' +
      '<div class="fo-card"><h3>Preview <small id="b-basis"></small></h3><div class="fo-chartbox" id="b-prev"></div></div></div>';
    function cfg() { var fl = {}; if ($('#b-prop').value !== 'all') fl.property = $('#b-prop').value; if ($('#b-ch').value !== 'all') fl.channel = $('#b-ch').value; return { chart_id: c.chart_id || '', title: $('#b-title').value.trim() || METRICS[$('#b-metric').value][0], metric: $('#b-metric').value, chart_type: $('#b-type').value, grain: $('#b-grain').value, range: $('#b-range').value, filters: JSON.stringify(fl), comparison: $('#b-cmp').value, refresh_policy: $('#b-ref').value, date_dimension: METRICS[$('#b-metric').value][2] === 'booking' ? 'booking' : 'stay' }; }
    function preview() { var x = cfg(); $('#b-basis').textContent = METRICS[x.metric][2] + ' date basis'; drawChart($('#b-prev'), x); }
    preview(); $$('input,select', body).forEach(function (el) { el.oninput = preview; el.onchange = preview; });
    function send(copy) { var x = cfg(); if (copy) { x.chart_id = ''; x.title += ' (copy)'; } x.filters = JSON.parse(x.filters); var btn = $('#b-save'); busy(btn, true); api('f.chart.save', { chart: x }, 'Chart saved', function () { S.editChart = null; location.hash = '#/studio/library'; }).then(function () { busy(btn, false); }); }
    $('#b-save').onclick = function () { send(false); }; if ($('#b-copy')) $('#b-copy').onclick = function () { send(true); };
    $('#b-cancel').onclick = function () { S.editChart = null; location.hash = '#/studio/library'; U.renderPage(); };
  }
  function dashboards(body) {
    var ds = S.data.dashboards || [], charts = S.data.charts || [], cur = ds.filter(function (d) { return d.dashboard_id === S.dash; })[0] || ds[0];
    body.innerHTML = '<div class="fo-toolbar">' + (ds.length ? sel('d-pick', ds.map(function (d) { return [d.dashboard_id, d.name]; }), cur && cur.dashboard_id) : '') + '<button class="btn btn--primary" id="d-new">+ New dashboard</button>' + (cur ? '<button class="btn" id="d-edit">Edit</button><button class="btn btn--danger" id="d-del">Delete</button><button class="btn" id="d-print">Print / PDF</button>' : '') + '</div><div id="d-body"></div>';
    var b = $('#d-body');
    if (!cur) b.innerHTML = '<div class="fo-empty">No dashboards yet. Save a few charts, then create a dashboard and pick them.</div>';
    else {
      var ids = JSON.parse(cur.charts || '[]'), list = ids.map(byId).filter(Boolean);
      b.innerHTML = list.length ? '<div class="fo-grid fo-grid--2">' + list.map(function (c) { return chart('ch-' + c.chart_id, c.title, (METRICS[c.metric] || [''])[0] + ' · ' + c.range); }).join('') + '</div>' : '<div class="fo-empty">This dashboard has no charts. Click Edit to add some.</div>';
      list.forEach(function (c) { drawChart($('#ch-' + c.chart_id), c); });
      wireExports(b, 'dashboard');
    }
    if ($('#d-pick')) $('#d-pick').onchange = function () { S.dash = this.value; dashboards(body); };
    $('#d-new').onclick = function () { dashForm(null); };
    if (cur) { $('#d-edit').onclick = function () { dashForm(cur); }; $('#d-del').onclick = function () { if (confirm('Delete this dashboard? Charts are kept.')) api('f.dashboard.delete', { dashboard_id: cur.dashboard_id }, 'Deleted'); }; $('#d-print').onclick = function () { window.print(); }; }
    function dashForm(d) {
      var chosen = d ? JSON.parse(d.charts || '[]') : [];
      var p = U.drawer('<div class="fo-drawer__head"><h2 class="serif" style="font-size:24px">' + (d ? 'Edit dashboard' : 'New dashboard') + '</h2><button class="fo-iconbtn" data-close>' + U.icon('x') + '</button></div>' +
        '<label class="fo-field">Name<input id="df-name" maxlength="80" value="' + esc(d ? d.name : '') + '"></label><p class="fo-hint">Pick charts (in order):</p>' +
        (charts.length ? charts.map(function (c) { return '<label style="display:block;padding:6px 0"><input type="checkbox" value="' + esc(c.chart_id) + '"' + (chosen.indexOf(c.chart_id) >= 0 ? ' checked' : '') + '> ' + esc(c.title) + '</label>'; }).join('') : '<p class="fo-hint">No saved charts yet.</p>') +
        '<button class="btn btn--primary" id="df-save" style="margin-top:12px">Save dashboard</button>');
      $('#df-save', p).onclick = function () {
        var ids = $$('input[type=checkbox]', p).filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
        api('f.dashboard.save', { dashboard: { dashboard_id: d ? d.dashboard_id : '', name: $('#df-name', p).value, charts: ids } }, 'Dashboard saved', function (j) { S.dash = j.record.dashboard_id; p.parentNode.remove(); });
      };
    }
  }

  // ============================================================ Trends & Ujjain event intelligence (phase 9) ============================================================
  function viewTrends(page) {
    var T = U.tabs('trends', [['growth', 'Growth trends'], ['events', 'Ujjain events calendar'], ['alerts', 'Anomaly alerts']]);
    page.innerHTML = U.hello('Trends & market intelligence', 'Booking demand from your ledger. Search interest (Google Search Console) is kept separate and is not connected.') + T.html + '<div id="tr"></div>';
    U.wireTabs(page, 'trends');
    var body = $('#tr'), Dt = D(), t = today();
    if (T.cur === 'growth') {
      var from = M.addDays(t.slice(0, 7) + '-01', -365).slice(0, 7) + '-01', s = M.series(Dt, from, t, 'month', f()), lyFrom = M.lastYear(from, t), sl = M.series(Dt, lyFrom.from, lyFrom.to, 'month', f());
      var cur = M.compute(Dt, M.addDays(t, -89), t, f()), prv = M.compute(Dt, M.addDays(t, -179), M.addDays(t, -90), f());
      function g(a, b) { return a == null || b == null || !b ? '—' : ((a / b - 1) * 100).toFixed(0) + '%'; }
      body.innerHTML = '<div class="fo-grid fo-grid--kpi">' + kpi('Bookings (90 d vs prior 90 d)', String(cur.bookings_made), g(cur.bookings_made, prv.bookings_made) + ' growth') + kpi('Revenue growth', inr(cur.net_accommodation_revenue), g(cur.net_accommodation_revenue, prv.net_accommodation_revenue)) +
        kpi('Occupancy', pct(cur.occupancy), pp(cur.occupancy != null && prv.occupancy != null ? cur.occupancy - prv.occupancy : null)) + kpi('ADR', inr(cur.adr), g(cur.adr, prv.adr)) + kpi('Cancellation rate', pct(cur.cancellation_rate), pp(cur.cancellation_rate != null && prv.cancellation_rate != null ? cur.cancellation_rate - prv.cancellation_rate : null)) +
        kpi('Median lead time', cur.lead_time_median == null ? '—' : n1(cur.lead_time_median) + ' days', cur.lead_time_proxy_n ? cur.lead_time_proxy_n + ' proxy dates excluded' : '') + kpi('Direct share', pct(cur.direct_share_count), pp(cur.direct_share_count != null && prv.direct_share_count != null ? cur.direct_share_count - prv.direct_share_count : null)) + '</div>' +
        '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + chart('tr-1', 'Revenue: last 12 months vs the year before', 'stay date') + chart('tr-2', 'Bookings made and cancellations', 'booking date') + chart('tr-3', 'Occupancy and ADR', 'stay date') + chart('tr-4', 'Channel mix over time', 'booking date') + '</div>' +
        '<div class="fo-card" style="margin-top:14px"><h3>Website traffic &amp; conversion trend</h3><p class="fo-hint">Shown in Website analytics once GA4 reporting is connected (Settings → Google Analytics).</p></div>';
      var lab = s.map(function (x) { return x.key; });
      C.combo($('#tr-1'), { labels: lab, kind: 'inr', series: [{ name: 'This year', values: s.map(function (x) { return x.revenue; }) }, { name: 'Year before', values: sl.map(function (x) { return x.revenue; }).slice(0, s.length), type: 'line', color: '#9BB8A8' }] });
      C.combo($('#tr-2'), { labels: lab, kind: 'n', series: [{ name: 'Bookings', values: s.map(function (x) { return x.bookings; }) }, { name: 'Cancelled', values: s.map(function (x) { return x.cancelled; }), color: '#B4402A' }] });
      C.combo($('#tr-3'), { labels: lab, kind: 'pct', rightKind: 'inr', series: [{ name: 'Occupancy', values: s.map(function (x) { return x.occupancy; }) }, { name: 'ADR', values: s.map(function (x) { return x.adr; }), type: 'line', axis: 'right', color: '#C9A24F' }] });
      C.combo($('#tr-4'), { labels: lab, kind: 'n', stacked: true, series: [{ name: 'Direct', values: s.map(function (x) { return x.direct; }) }, { name: 'OTA', values: s.map(function (x) { return x.ota; }), color: '#5B7F95' }, { name: 'Other', values: s.map(function (x) { return x.other; }), color: '#C9A24F' }] });
    } else if (T.cur === 'events') {
      var ev = events(), up = ev.filter(function (e) { return e.end >= t; }), past = ev.filter(function (e) { return e.end < t; });
      body.innerHTML = '<div class="fo-card"><h3>Upcoming demand periods <span class="fo-card__tools"><button class="btn btn--sm btn--primary" id="ev-add">+ Add event</button></span></h3>' +
        table(['Event', 'Dates', 'Type', 'Confidence', 'On the books', 'Source'], up.map(function (e) { var m = M.compute(Dt, e.start, e.end, f()); return ['<b>' + esc(e.name) + '</b>', dm(e.start) + ' – ' + dmy(e.end), esc(e.kind), '<span class="fo-badge ' + (e.confidence === 'tentative' ? 'fo-badge--warn' : '') + '">' + esc(e.confidence) + '</span>', pct(m.occupancy, 0) + ' · ' + m.occupied_nights + '/' + m.available_nights, '<small class="fo-hint">' + esc(e.source) + '</small>' + (e.confidence === 'founder' ? ' <button class="fo-linkbtn" data-evdel="' + esc(e.id) + '">remove</button>' : '')]; }), { num: [4] }) + '</div>' +
        '<div class="fo-card" style="margin-top:14px"><h3>How past events performed <small>event window vs the 4 weeks before and after</small></h3>' +
        table(['Event', 'Dates', 'Occupancy', 'Baseline', 'Lift', 'ADR', 'ADR vs baseline', 'Median lead time'], past.map(function (e) { var x = I.eventImpact(Dt, e, f()); return ['<b>' + esc(e.name) + '</b>', dm(e.start) + ' – ' + dmy(e.end), pct(x.occupancy, 0), pct(x.baseline_occupancy, 0), pp(x.occupancy_lift), inr(x.adr), x.adr_lift == null ? '—' : pct(x.adr_lift, 0), x.lead_time_median == null ? '<span class="fo-hint">no real booking dates</span>' : n1(x.lead_time_median) + ' d']; }), { num: [2, 3, 4, 5, 6, 7], empty: 'No past events within your ledger yet.' }) +
        '<p class="fo-hint">Dates come from the sources shown; Shravan and Navratri 2027 are not yet confirmed and are left out until you add them. Long weekends are computed from fixed national holidays.</p></div>';
      $('#ev-add').onclick = function () {
        var p = U.drawer('<div class="fo-drawer__head"><h2 class="serif" style="font-size:24px">Add an event</h2><button class="fo-iconbtn" data-close>' + U.icon('x') + '</button></div><div class="fo-form">' +
          '<label class="fo-field full">Name<input id="e-n" maxlength="100"></label><label class="fo-field">Start<input type="date" id="e-s"></label><label class="fo-field">End<input type="date" id="e-e"></label>' +
          '<label class="fo-field">Type' + sel('e-k', [['festival', 'Festival'], ['holiday', 'Holiday'], ['mega', 'Mega event'], ['custom', 'Other']], 'festival') + '</label><label class="fo-field">Source (where the date comes from)<input id="e-src" maxlength="200"></label></div><div class="fo-msg" id="e-msg"></div><button class="btn btn--primary" id="e-go">Save event</button>');
        $('#e-go', p).onclick = function () { U.api('f.event.save', { event: { name: $('#e-n', p).value, start: $('#e-s', p).value, end: $('#e-e', p).value, kind: $('#e-k', p).value, source: $('#e-src', p).value } }).then(function (j) { if (!j.ok) { $('#e-msg', p).textContent = j.error; return; } p.parentNode.remove(); toast('Event added'); U.load(true); }); };
      };
      $$('[data-evdel]', body).forEach(function (b) { b.onclick = function () { if (confirm('Remove this event?')) api('f.event.delete', { event_id: b.dataset.evdel }, 'Removed'); }; });
    } else {
      var an = I.anomalies(Dt, S.ga, f());
      body.innerHTML = '<div class="fo-card"><h3>Anomaly alerts <small>transparent rules; statistical models need more history</small></h3>' +
        (an.items.length ? an.items.map(function (a) { return '<div class="fo-action"><div><span class="fo-badge ' + (a.severity === 'high' ? 'fo-badge--bad' : 'fo-badge--warn') + '">' + esc(a.severity) + '</span> <b>' + esc(a.title) + '</b><span class="fo-hint">' + esc(a.fact) + ' · ' + esc(a.method) + '</span></div></div>'; }).join('') : '<p>No anomalies right now.</p>') +
        (an.notes.length ? '<p class="fo-hint">Checks not possible yet: ' + esc(an.notes.join(' ')) + '</p>' : '') + '</div>';
    }
    wireExports(page, 'trends');
  }

  // ============================================================ Website analytics + GA4 reconciliation (phases 6–7) ============================================================
  function viewWebsite(page) {
    var r = range(), T = U.tabs('website', [['overview', 'Traffic'], ['funnel', 'Booking funnel'], ['recon', 'GA4 vs bookings']]);
    page.innerHTML = U.hello('Website analytics', 'Google Analytics 4, read on the server for ' + esc(dmy(r.from)) + ' – ' + esc(dmy(r.to)) + '. Only www.apvillasandresorts.in traffic is counted (no local tests).') + T.html + '<div id="wb"><div class="fo-loading"><div class="fo-spin"></div><div>Asking Google Analytics…</div></div></div>';
    U.wireTabs(page, 'website');
    var key = r.from + r.to;
    var go = S.gaKey === key && S.ga ? Promise.resolve({ ok: true, ga: S.ga }) : U.api('f.ga4', { from: r.from, to: M.addDays(today(), -0) < r.to ? today() : r.to });
    go.then(function (j) {
      var body = $('#wb'); if (!body) return;
      if (!j.ok) { body.innerHTML = '<div class="fo-empty">' + esc(j.error) + '</div>'; return; }
      S.ga = j.ga; S.gaKey = key; var g = j.ga;
      if (!g.connected) { body.innerHTML = gaNotConnected(g.reason); return; }
      if (T.cur === 'overview') {
        var t = g.totals;
        body.innerHTML = '<div class="fo-grid fo-grid--kpi">' + kpi('Active users', String(t.activeUsers || 0)) + kpi('Users', String(t.totalUsers || 0)) + kpi('Sessions', String(t.sessions || 0)) + kpi('Engaged sessions', String(t.engagedSessions || 0)) + kpi('Engagement rate', pct(t.engagementRate)) + kpi('Key events', String(t.keyEvents || 0), 'as marked in GA4') + kpi('Booking-intent actions', String(g.intent), 'enquiry forms + WhatsApp + calls') + '</div>' +
          '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + chart('wb-d', 'Sessions per day', 'GA4') + chart('wb-ch', 'Acquisition channels', 'sessions') + chart('wb-dev', 'Devices', 'sessions') +
          card('Top events', '', table(['Event', 'Count', 'Users'], g.events.slice(0, 15).map(function (e) { return [esc(e.eventName), e.eventCount, e.totalUsers]; }), { num: [1, 2] })) + '</div>' +
          '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + card('Landing pages', '', table(['Page', 'Sessions', 'Engaged', 'Key events'], g.landing.map(function (x) { return [esc(x.landingPage), x.sessions, x.engagedSessions, x.keyEvents]; }), { num: [1, 2, 3] })) +
          card('Source / medium', '', table(['Source / medium', 'Sessions', 'Engaged', 'Key events'], g.sources.map(function (x) { return [esc(x.sessionSourceMedium), x.sessions, x.engagedSessions, x.keyEvents]; }), { num: [1, 2, 3] })) + '</div>' +
          '<p class="fo-hint">Fetched ' + when(g.fetched_at) + ' (cached 30 minutes). Property ' + esc(g.property) + '.</p>';
        C.combo($('#wb-d'), { labels: g.daily.map(function (d) { return dm(d.date); }), kind: 'n', series: [{ name: 'Sessions', values: g.daily.map(function (d) { return d.sessions; }) }, { name: 'Engaged', values: g.daily.map(function (d) { return d.engagedSessions; }), type: 'line', color: '#C9A24F' }] });
        C.donut($('#wb-ch'), g.channels.map(function (x) { return { label: x.sessionDefaultChannelGroup, value: x.sessions }; }), { kind: 'n', centerLabel: 'sessions' });
        C.donut($('#wb-dev'), g.devices.map(function (x) { return { label: x.deviceCategory, value: x.sessions }; }), { kind: 'n', centerLabel: 'sessions' });
      } else if (T.cur === 'funnel') {
        var conf = websiteBookings(r), steps = g.funnel.concat([['Confirmed website-attributed bookings (ledger)', conf.length]]);
        body.innerHTML = chart('wb-f', 'Booking funnel', 'GA4 events, then your ledger') + '<div class="fo-card" style="margin-top:14px">' +
          table(['Step', 'Count', 'From previous step'], steps.map(function (s, i) { var p = i ? steps[i - 1][1] : null; return [esc(s[0]), s[1], p ? pct(s[1] / p, 0) : '—']; }), { num: [1, 2] }) +
          '<p class="fo-hint">Your website has no online checkout: guests enquire and confirm on WhatsApp or phone, so there is no payment step and no GA4 “purchase” event. The last step comes from your booking ledger (bookings marked Direct · Website, or found via Website/Google), not from GA4. Steps are counts of events, not unique visitors, so they are a guide, not an exact conversion path.</p></div>';
        C.hbars($('#wb-f'), steps.map(function (s) { return { label: s[0], value: s[1] }; }), { kind: 'n' });
      } else {
        var wb = websiteBookings(r), rev = wb.reduce(function (s, b) { return s + M.netAmount(b); }, 0), pur = g.purchases || [], dup = pur.filter(function (p) { return p.eventCount > 1; });
        body.innerHTML = '<div class="fo-grid fo-grid--kpi">' + kpi('Website-attributed bookings (ledger)', String(wb.length), 'source of truth') + kpi('Their booking value', inr(rev)) + kpi('GA4 purchase events', String(pur.reduce(function (s, p) { return s + p.eventCount; }, 0))) + kpi('GA4 purchase revenue', inr(pur.reduce(function (s, p) { return s + p.purchaseRevenue; }, 0))) + kpi('Duplicate transaction IDs', String(dup.length)) + kpi('Booking-intent actions', String(g.intent), 'enquiries + WhatsApp + calls') + '</div>' +
          '<div class="fo-card" style="margin-top:14px"><h3>Reading the difference</h3><ul class="fo-hint" style="line-height:1.7"><li><b>The booking ledger is the truth</b> for reservations and revenue; GA4 only observes website behaviour. Nothing here changes a booking.</li>' +
          '<li>No purchase events are expected: the site has no online checkout, so a website booking is confirmed on WhatsApp. To measure it end-to-end, the enquiry ↔ booking link would need a reference the guest carries into WhatsApp (possible future work).</li>' +
          '<li>OTA and WhatsApp-only bookings never appear in GA4. Consent choices, ad blockers, cross-device journeys and GA4\'s attribution windows also make GA4 counts lower or shifted in time.</li>' +
          '<li>Coverage: ' + (wb.length ? Math.round(g.intent / wb.length * 10) / 10 + ' booking-intent actions per website-attributed booking in this period.' : 'no website-attributed bookings in this period.') + '</li></ul>' +
          table(['Website-attributed booking', 'Booked on', 'Stay', 'Channel', 'Found us via', 'Value'], wb.map(function (b) { return ['<button class="fo-linkbtn" data-open="' + esc(b.booking_id) + '">' + esc(b.guest_name || b.booking_id) + '</button>', dmy(M.dateOf(b.created_at)), dm(b.checkin) + ' → ' + dm(b.checkout), esc(b.channel), esc(b.acquisition_source || ''), inr(M.netAmount(b))]; }), { num: [5], empty: 'No website-attributed bookings in this period.' }) + '</div>';
        $$('[data-open]', body).forEach(function (b) { b.onclick = function () { U.openBooking(b.dataset.open); }; });
      }
      wireExports(body, 'website');
    }).catch(function (e) { var b = $('#wb'); if (b && e.message !== 'signed out') b.innerHTML = '<div class="fo-empty">Could not reach the server: ' + esc(e.message) + '</div>'; });
  }
  function websiteBookings(r) {
    return S.data.bookings.filter(function (b) {
      if (b.status === 'void' || b.status === 'cancelled') return false;
      var d = M.dateOf(b.created_at); if (!d || d < r.from || d > r.to) return false;
      return b.channel === 'Direct · Website' || /website|google/i.test(b.acquisition_source || '');
    });
  }
  function gaNotConnected(reason) {
    return '<div class="fo-card fo-soon"><span class="fo-badge fo-badge--warn">Not connected</span><h2>Connect Google Analytics reporting</h2><p class="fo-hint">' + esc(reason) + '</p>' +
      '<ol style="text-align:left;max-width:600px;margin:14px auto;line-height:1.7"><li>In the Apps Script project (AP Villas E-Check-in) click <b>Services ＋</b>, choose <b>Google Analytics Data API</b>, keep the identifier <code>AnalyticsData</code>, click Add.</li>' +
      '<li>Save, select any function (e.g. <code>foSetup</code>) and click Run once, then approve the new read-only Analytics permission.</li>' +
      '<li>Make sure apvillasandresorts@gmail.com has at least Viewer access to the GA4 property (Admin → Property access management).</li>' +
      '<li>Deploy → Manage deployments → New version, then reopen this page.</li></ol><p class="fo-hint">The tag on your website is already working; this only lets the portal read the reports. No credentials ever reach the browser.</p></div>';
  }

  // ============================================================ Financial intelligence (phase 8) ============================================================
  function viewFinance(page) {
    var T = U.tabs('finance', [['overview', 'Overview'], ['expenses', 'Expenses'], ['budget', 'Budget vs actual'], ['receivables', 'Receivables'], ['cashflow', 'Cash-flow outlook']]);
    var r = range();
    page.innerHTML = U.hello('Financial intelligence', esc(dmy(r.from)) + ' – ' + esc(dmy(r.to)) + ' · accounting figures from your records; estimates are labelled') + T.html + '<div id="fi"></div>';
    U.wireTabs(page, 'finance');
    var body = $('#fi'), Dt = D(), F = f();
    if (T.cur === 'overview') {
      var x = I.finance(Dt, r.from, r.to, F), status = '<span class="fo-badge ' + (x.status === 'complete' ? '' : x.status === 'partial' ? 'fo-badge--warn' : 'fo-badge--muted') + '">' + esc(x.status) + '</span>';
      body.innerHTML = (x.status_note ? '<div class="fo-note" style="margin-bottom:14px">' + status + ' ' + esc(x.status_note) + (x.status === 'unavailable' ? ' <a href="#/finance/expenses">Record expenses →</a>' : '') + '</div>' : '') +
        '<div class="fo-grid fo-grid--kpi">' + kpi('Net accommodation revenue', inr(x.revenue), 'stay basis') + kpi('Collections (cash in)', inr(x.cash_collected), 'payment dates') + kpi('Refunds', inr(x.refunds)) + kpi('Outstanding receivables', inr(x.receivables), 'today') +
        kpi('OTA commissions', inr(x.commission), x.commission_unknown_bookings ? x.commission_unknown_bookings + ' bookings unknown' : '') + kpi('Payment fees', inr(x.payment_fees), x.payment_fees_known ? '' : 'some rates not set') + kpi('Discounts given', inr(x.discounts)) +
        kpi('Operating expenses', inr(x.expenses_total), x.expenses_estimate ? inr(x.expenses_estimate) + ' are estimates' : '') + kpi('Contribution margin', x.contribution == null ? '—' : inr(x.contribution), 'revenue − commission − fees − variable costs') + kpi('Operating profit', x.operating_profit == null ? '—' : inr(x.operating_profit), x.status) +
        kpi('Cost per occupied night', x.cost_per_occupied_night == null ? '—' : inr(x.cost_per_occupied_night)) + kpi('Break-even occupancy', x.break_even_occupancy == null ? '—' : pct(x.break_even_occupancy), 'fixed costs ÷ (ADR − variable cost per night)') + '</div>' +
        '<div class="fo-grid fo-grid--2" style="margin-top:14px">' + chart('fi-cat', 'Expenses by category', 'period') + card('Fixed vs variable', '', U.kv('Variable costs', inr(x.variable_costs)) + U.kv('Fixed costs', inr(x.fixed_costs)) + U.kv('Actual (recorded)', inr(x.expenses_actual)) + U.kv('Management estimates', inr(x.expenses_estimate)) + '<p class="fo-hint">Taxes are never assumed: record tax payments as expenses (Licences, taxes &amp; fees) and taxes on bookings in the booking itself.</p>') + '</div>';
      C.hbars($('#fi-cat'), Object.keys(x.by_category).map(function (k) { return { label: catName(k), value: x.by_category[k] }; }).sort(function (a, b) { return b.value - a.value; }), { kind: 'inr', empty: 'No expenses recorded for this period.' });
    } else if (T.cur === 'expenses') {
      var ex = (S.data.expenses || []).filter(function (e) { return e.date >= r.from && e.date <= r.to; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      body.innerHTML = '<div class="fo-toolbar"><button class="btn btn--primary" id="ex-new">+ Add expense</button><button class="btn" id="ex-csv">Export CSV</button><span class="fo-hint">' + ex.length + ' expenses in the selected dates · ' + inr(ex.reduce(function (s, e) { return s + num(e.amount); }, 0)) + '</span></div>' +
        table(['Date', 'Villa', 'Category', 'Amount', 'Vendor', 'Basis', 'Note', ''], ex.map(function (e) { return [dmy(e.date), esc(e.property_id === 'all' ? 'All villas (shared)' : U.propName(e.property_id)), esc(catName(e.category)), inr(num(e.amount)), esc(e.vendor), e.basis === 'estimate' ? '<span class="fo-badge fo-badge--warn">estimate</span>' : 'actual', esc(e.note), '<button class="btn btn--sm" data-ed="' + esc(e.expense_id) + '">Edit</button>']; }), { num: [3], empty: 'No expenses recorded in these dates.' });
      $('#ex-new').onclick = function () { expenseForm(null); };
      $$('[data-ed]', body).forEach(function (b) { b.onclick = function () { expenseForm(ex.filter(function (e) { return e.expense_id === b.dataset.ed; })[0]); }; });
      $('#ex-csv').onclick = function () { U.csvDownload('ap-villas-expenses-' + r.from + '-' + r.to, ['expense_id', 'date', 'villa', 'category', 'amount', 'vendor', 'basis', 'note'], ex.map(function (e) { return [e.expense_id, e.date, e.property_id, e.category, e.amount, e.vendor, e.basis, e.note]; })); };
    } else if (T.cur === 'budget') {
      var month = S.budgetMonth || today().slice(0, 7), rows = I.budgetVsActual(Dt, month, F);
      body.innerHTML = '<div class="fo-toolbar">Month <input type="month" id="bu-m" class="fo-input" style="width:auto" value="' + esc(month) + '"><button class="btn btn--primary" id="bu-add">+ Budget line</button></div>' +
        table(['Category', 'Budget', 'Actual', 'Variance', 'Variance %'], rows.map(function (x) { var bad = x.category === 'revenue' ? x.variance < 0 : x.variance > 0; return ['<b>' + esc(catName(x.category)) + '</b>', inr(x.budget), inr(x.actual), '<span class="' + (bad ? 'down' : 'up') + '">' + sign(x.variance) + '</span>', x.variance_pct == null ? '—' : pct(x.variance_pct, 0)]; }), { num: [1, 2, 3, 4], empty: 'No budget or spending for this month yet.' }) +
        '<p class="fo-hint">Add a "Revenue (target)" line to compare revenue against target; actual revenue comes from the ledger.</p>';
      $('#bu-m').onchange = function () { S.budgetMonth = this.value; U.renderPage(); };
      $('#bu-add').onclick = function () {
        var p = U.drawer('<div class="fo-drawer__head"><h2 class="serif" style="font-size:24px">Budget line · ' + esc(month) + '</h2><button class="fo-iconbtn" data-close>' + U.icon('x') + '</button></div><div class="fo-form">' +
          '<label class="fo-field">Category' + sel('bf-c', [['revenue', 'Revenue (target)']].concat(I.EXPENSE_CATEGORIES.map(function (c) { return [c[0], c[1]]; })), 'revenue') + '</label><label class="fo-field">Villa' + sel('bf-p', propOptions(null, true), 'all') + '</label>' +
          '<label class="fo-field">Amount (₹)<input id="bf-a" type="number" min="0" step="1"></label><label class="fo-field">Note<input id="bf-n" maxlength="200"></label></div><div class="fo-msg" id="bf-msg"></div><button class="btn btn--primary" id="bf-go">Save</button>');
        $('#bf-go', p).onclick = function () { U.api('f.budget.save', { budget: { month: month, category: $('#bf-c', p).value, property_id: $('#bf-p', p).value, amount: $('#bf-a', p).value, note: $('#bf-n', p).value } }).then(function (j) { if (!j.ok) { $('#bf-msg', p).textContent = j.error; return; } p.parentNode.remove(); toast('Saved'); U.load(true); }); };
      };
    } else if (T.cur === 'receivables') {
      var ag = I.receivablesAging(Dt);
      body.innerHTML = '<div class="fo-grid fo-grid--kpi">' + Object.keys(ag.buckets).map(function (k) { return kpi(k, inr(ag.buckets[k])); }).join('') + '</div><div class="fo-card" style="margin-top:14px">' +
        table(['Guest', 'Villa', 'Check-in', 'Days since arrival', 'Due', 'Channel'], ag.list.map(function (x) { return ['<button class="fo-linkbtn" data-open="' + esc(x.booking.booking_id) + '">' + esc(x.booking.guest_name || x.booking.booking_id) + '</button>', esc(U.propName(x.booking.property_id)), dmy(x.booking.checkin), x.age < 0 ? '<span class="fo-hint">arrives in ' + (-x.age) + ' d</span>' : x.age, '<b>' + inr(x.due) + '</b>', esc(x.booking.channel)]; }), { num: [3, 4], empty: 'Nothing outstanding.' }) + '</div>';
      $$('[data-open]', body).forEach(function (b) { b.onclick = function () { U.openBooking(b.dataset.open); }; });
    } else {
      var cf = I.cashflow(Dt, 12);
      body.innerHTML = chart('fi-cf', 'Weekly cash-flow outlook', 'management estimate') + '<div class="fo-card" style="margin-top:14px">' +
        table(['Week', 'Expected in', 'Expected out', 'Net', 'Cumulative'], cf.weeks.map(function (w) { return [dm(w.from) + ' – ' + dm(w.to), inr(w.inflow), w.outflow == null ? '<span class="fo-hint">unknown</span>' : inr(w.outflow), sign(w.net), sign(w.cumulative)]; }), { num: [1, 2, 3, 4] }) + '<p class="fo-hint">' + esc(cf.basis) + '</p></div>';
      C.combo($('#fi-cf'), { labels: cf.weeks.map(function (w) { return dm(w.from); }), kind: 'inr', series: [{ name: 'Expected in', values: cf.weeks.map(function (w) { return w.inflow; }) }, { name: 'Expected out', values: cf.weeks.map(function (w) { return w.outflow || 0; }), color: '#B4402A' }] });
    }
    wireExports(page, 'finance');
  }
  function expenseForm(e) {
    e = e || { date: today(), property_id: 'all', category: 'housekeeping', basis: 'actual' };
    var p = U.drawer('<div class="fo-drawer__head"><h2 class="serif" style="font-size:24px">' + (e.expense_id ? 'Edit expense' : 'Add expense') + '</h2><button class="fo-iconbtn" data-close>' + U.icon('x') + '</button></div><div class="fo-form">' +
      '<label class="fo-field">Date<input type="date" id="xf-d" value="' + esc(e.date) + '"></label><label class="fo-field">Amount (₹)<input id="xf-a" type="number" min="1" step="1" value="' + esc(e.amount || '') + '"></label>' +
      '<label class="fo-field">Category' + sel('xf-c', I.EXPENSE_CATEGORIES.map(function (c) { return [c[0], c[1] + ' (' + c[2] + ')']; }), e.category) + '</label><label class="fo-field">Villa' + sel('xf-p', propOptions(null, true), e.property_id) + '</label>' +
      '<label class="fo-field">Basis' + sel('xf-b', [['actual', 'Actual (paid / billed)'], ['estimate', 'Management estimate']], e.basis) + '</label><label class="fo-field">Vendor<input id="xf-v" maxlength="80" value="' + esc(e.vendor || '') + '"></label>' +
      '<label class="fo-field full">Note<input id="xf-n" maxlength="300" value="' + esc(e.note || '') + '"></label></div><div class="fo-msg" id="xf-msg"></div><button class="btn btn--primary" id="xf-go">Save</button>' + (e.expense_id ? ' <button class="btn btn--danger" id="xf-del">Delete</button>' : '') +
      '<p class="fo-hint">Shared costs ("All villas") are split equally when you look at one villa.</p>');
    $('#xf-go', p).onclick = function () {
      var b = this; busy(b, true);
      U.api('f.expense.save', { expense: { expense_id: e.expense_id || '', date: $('#xf-d', p).value, amount: $('#xf-a', p).value, category: $('#xf-c', p).value, property_id: $('#xf-p', p).value, basis: $('#xf-b', p).value, vendor: $('#xf-v', p).value, note: $('#xf-n', p).value } })
        .then(function (j) { busy(b, false); if (!j.ok) { $('#xf-msg', p).textContent = j.error; return; } p.parentNode.remove(); toast('Expense saved'); U.load(true); });
    };
    if ($('#xf-del', p)) $('#xf-del', p).onclick = function () { if (confirm('Delete this expense?')) U.api('f.expense.delete', { expense_id: e.expense_id }).then(function (j) { if (!j.ok) return toast(j.error, true); p.parentNode.remove(); toast('Deleted'); U.load(true); }); };
  }

  // ============================================================ Forecasting & scenario lab (phase 9) ============================================================
  function viewForecast(page) {
    var T = U.tabs('forecast', [['forecast', 'Forecasts'], ['scenario', 'Scenario lab']]);
    page.innerHTML = U.hello('Forecasting & scenario lab', 'Forecasts are tested against your own history before they are shown; scenarios are what-ifs, not predictions.') + T.html + '<div id="fc"></div>';
    U.wireTabs(page, 'forecast');
    var body = $('#fc'), Dt = D();
    if (T.cur === 'forecast') {
      var kind = S.fcKind || 'occupied', h = S.fcH || 30;
      body.innerHTML = '<div class="fo-toolbar">Forecast ' + sel('fc-k', [['occupied', 'Occupied villa-nights'], ['revenue', 'Accommodation revenue'], ['bookings', 'Bookings made'], ['cancellations', 'Cancellations'], ['cash', 'Cash collected']], kind) + ' for the next ' + sel('fc-h', [['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['90', '90 days'], ['365', '12 months']], String(h)) + '</div><div id="fc-out"></div>';
      $('#fc-k').onchange = function () { S.fcKind = this.value; U.renderPage(); }; $('#fc-h').onchange = function () { S.fcH = Number(this.value); U.renderPage(); };
      var r = I.forecast(Dt, kind, h, f()), out = $('#fc-out'), money = kind === 'revenue' || kind === 'cash';
      if (!r.sufficient) { out.innerHTML = '<div class="fo-card fo-soon"><span class="fo-badge fo-badge--muted">Not enough data</span><h2>No forecast yet</h2><p>' + esc(r.reason) + '</p><p class="fo-hint">History available: ' + (r.history_days || 0) + ' days. Showing a number now would be a guess, so the portal waits. ' + (kind === 'occupied' ? 'Meanwhile, “Forward occupancy” in Revenue intelligence shows what is already booked.' : '') + '</p></div>'; return; }
      var hist = I.daily(Dt, M.addDays(today(), -Math.min(60, r.history_days)), M.addDays(today(), -1), kind, f());
      out.innerHTML = '<div class="fo-grid fo-grid--kpi">' + kpi('Expected total', money ? inr(r.total) : n1(r.total), '80% range ' + (money ? inr(r.total_lower) + ' – ' + inr(r.total_upper) : n1(r.total_lower) + ' – ' + n1(r.total_upper))) + kpi('Method chosen', esc(r.method_label), 'lowest backtest error') + kpi('History used', r.history_days + ' days', r.nonzero_days + ' active days') + '</div>' +
        '<div style="margin-top:14px">' + chart('fc-c', 'History and forecast', r.interval) + '</div>' +
        '<div class="fo-card" style="margin-top:14px"><h3>Backtest accuracy <small>rolling-origin: forecast from past cut-offs, compared with what happened</small></h3>' +
        table(['Method', 'MAE', 'RMSE', 'WAPE', 'Bias', 'Points tested'], r.accuracy.map(function (a) { return [(a.method === r.method ? '<b>★ ' : '') + esc(a.label) + (a.method === r.method ? '</b>' : ''), n1(a.mae), n1(a.rmse), a.wape == null ? '—' : pct(a.wape, 0), (Math.abs(a.bias) < 0.005 ? '0.00' : (a.bias > 0 ? '+' : '') + a.bias.toFixed(2)), a.n]; }), { num: [1, 2, 3, 4, 5] }) +
        '<p class="fo-hint">MAE/RMSE are in the forecast\'s units per day; WAPE is total error ÷ total actual; bias above zero means the method tends to over-forecast. ' + (kind === 'occupied' || kind === 'revenue' ? 'Nights already booked are a floor: the forecast is never below what is on the books.' : '') + ' Limitations: short history, no external demand data (events are not modelled yet), and results change as the ledger grows.</p></div>';
      var labels = hist.map(function (p) { return dm(p.date); }).concat(r.points.map(function (p) { return dm(p.date); })), nH = hist.length;
      C.combo($('#fc-c'), { labels: labels, kind: money ? 'inr' : 'n', series: [
        { name: 'Actual', values: hist.map(function (p) { return p.value; }).concat(r.points.map(function () { return null; })) },
        { name: 'Forecast', type: 'line', color: '#C9A24F', values: hist.map(function () { return null; }).concat(r.points.map(function (p) { return p.forecast; })) },
        { name: 'Upper (80%)', type: 'line', color: '#9BB8A8', values: hist.map(function () { return null; }).concat(r.points.map(function (p) { return p.upper; })) },
        { name: 'Lower (80%)', type: 'line', color: '#9BB8A8', values: hist.map(function () { return null; }).concat(r.points.map(function (p) { return p.lower; })) }] });
      void nH;
    } else scenarioLab(body, Dt);
    wireExports(page, 'forecast');
  }
  var LEVERS = [['occupancy', 'Occupancy', 'pct'], ['adr', 'ADR (₹ per night)', 'inr'], ['ota_share', 'Share of revenue via OTAs', 'pct'], ['commission_pct', 'OTA commission', 'pct'], ['cancellation_rate', 'Cancellation rate', 'pct'], ['cancel_loss_share', 'Share of cancelled value not re-sold', 'pct'],
    ['payment_fee_pct', 'Payment fees (% of revenue)', 'pct'], ['variable_cost_per_night', 'Variable cost per occupied night (₹)', 'inr'], ['fixed_costs_per_month', 'Fixed costs per month (₹)', 'inr'], ['available_per_month', 'Available villa-nights per month', 'n']];
  function scenarioLab(body, Dt) {
    var base = I.scenarioBase(Dt, f()), presets = I.scenarioPresets(base), cur = S.scen || Object.assign({}, base);
    if (cur.cancel_loss_share == null) cur.cancel_loss_share = 0;
    function val(k) { return cur[k]; }
    body.innerHTML = '<div class="fo-grid fo-grid--2"><div class="fo-card"><h3>Levers <small>base = your last 90 days (' + dmy(base.period.from) + ' – ' + dmy(base.period.to) + ')</small></h3>' +
      '<div class="fo-toolbar"><button class="btn btn--sm" data-pre="base">Base</button><button class="btn btn--sm" data-pre="optimistic">Optimistic</button><button class="btn btn--sm" data-pre="pessimistic">Pessimistic</button></div>' +
      LEVERS.map(function (l) { var v = val(l[0]), shown = v == null ? '' : l[2] === 'pct' ? Math.round(v * 1000) / 10 : Math.round(v); return '<label class="fo-field">' + esc(l[1]) + (l[2] === 'pct' ? ' (%)' : '') + (base[l[0]] == null && l[0] !== 'cancel_loss_share' ? ' <span class="fo-badge fo-badge--warn">no data: set it</span>' : '') + '<input type="number" step="any" data-lever="' + l[0] + '" data-kind="' + l[2] + '" value="' + shown + '"></label>'; }).join('') +
      '<p class="fo-hint">' + esc(presets.note) + '</p></div><div class="fo-card"><h3>Monthly result</h3><div id="sc-out"></div></div></div>';
    function readAll() { $$('[data-lever]', body).forEach(function (i) { var v = i.value === '' ? null : Number(i.value); cur[i.dataset.lever] = v == null ? null : i.dataset.kind === 'pct' ? v / 100 : v; }); S.scen = cur; }
    function show() {
      readAll();
      var miss = ['occupancy', 'adr', 'available_per_month'].filter(function (k) { return cur[k] == null; });
      if (miss.length) { $('#sc-out').innerHTML = '<p class="fo-hint">Set ' + miss.join(', ') + ' to see results.</p>'; return; }
      var a = I.scenario(cur), b = base.occupancy != null && base.adr != null ? I.scenario(Object.assign({ cancel_loss_share: 0 }, base)) : null;
      var rows = [['Occupied villa-nights', 'occupied_nights', 'n'], ['Revenue', 'revenue', 'inr'], ['OTA commission', 'commission', 'inr'], ['Payment fees', 'payment_fees', 'inr'], ['Variable costs', 'variable_costs', 'inr'], ['Contribution', 'contribution', 'inr'], ['Operating profit', 'operating_profit', 'inr'], ['Margin', 'margin', 'pct']];
      $('#sc-out').innerHTML = table(['', 'Scenario', 'Base', 'Difference'], rows.map(function (r) { var fm = r[2] === 'inr' ? inr : r[2] === 'pct' ? function (v) { return pct(v); } : n1; return ['<b>' + r[0] + '</b>', fm(a[r[1]]), b ? fm(b[r[1]]) : '—', b ? (r[2] === 'pct' ? pp(a[r[1]] - b[r[1]]) : sign(a[r[1]] - b[r[1]])) : '—']; }), { num: [1, 2, 3] }) +
        '<p class="fo-hint">Formula: revenue = available nights × occupancy × ADR − cancelled value not re-sold; commission = revenue × OTA share × commission; contribution = revenue − commission − fees − variable costs; profit = contribution − fixed costs. ' + (cur.fixed_costs_per_month == null ? 'Fixed costs are not set, so profit equals contribution.' : '') + '</p>';
    }
    $$('[data-lever]', body).forEach(function (i) { i.oninput = show; });
    $$('[data-pre]', body).forEach(function (b) { b.onclick = function () { S.scen = Object.assign({ cancel_loss_share: 0 }, presets[b.dataset.pre]); scenarioLab(body, Dt); }; });
    show();
  }

  // ============================================================ Strategic recommendations + decision log (phase 10) ============================================================
  function viewStrategy(page) {
    var T = U.tabs('strategy', [['recs', 'Recommendations'], ['matrix', 'Impact × feasibility'], ['log', 'Decision log']]);
    page.innerHTML = U.hello('Strategic recommendations', 'Evidence first: facts from your ledger, then the hypothesis, the action and how to measure it.') + T.html + '<div id="sg"></div>';
    U.wireTabs(page, 'strategy');
    var body = $('#sg'), recs = I.recommendations(D(), { events: S.data.events, exceptions: S.data.exceptions }), log = S.data.decisions || [];
    function latest(key) { return log.filter(function (d) { return d.rec_key === key; }).sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; })[0]; }
    if (T.cur === 'recs') {
      body.innerHTML = recs.length ? recs.map(function (r) {
        var d = latest(r.key);
        return '<div class="fo-card" style="margin-bottom:12px"><h3><span>' + esc(r.issue) + '</span><span class="fo-card__tools"><span class="fo-badge fo-badge--gold">priority ' + r.priority + '</span><span class="fo-badge">' + esc(r.quadrant) + '</span>' + (d ? '<span class="fo-badge fo-badge--muted">' + esc(d.status) + '</span>' : '') + '</span></h3>' +
          '<div class="fo-grid fo-grid--2" style="gap:12px"><div><b>Observed facts</b><ul style="margin:4px 0 8px;padding-left:18px">' + r.facts.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><b>Hypothesis (not proven)</b><p style="margin:4px 0 8px">' + esc(r.hypothesis) + '</p><b>Recommended action</b><p style="margin:4px 0">' + esc(r.action) + '</p></div>' +
          '<div>' + U.kv('Estimated impact', (r.impact.value != null ? inr(r.impact.value) + ' · ' : '') + esc(r.impact.basis)) + U.kv('Impact / feasibility', r.impact.score + ' / ' + r.feasibility + ' (of 5)') + U.kv('Confidence', esc(r.confidence)) + U.kv('KPIs', esc(r.kpis.join(', '))) + U.kv('Owner', esc(r.owner)) + U.kv('Follow-up', esc(r.follow_up.metric) + ' (now ' + esc(r.follow_up.baseline) + '), review in ' + r.follow_up.review_days + ' days') + '</div></div>' +
          '<div class="fo-toolbar" style="margin:10px 0 0">' + [['accepted', 'Accept'], ['deferred', 'Defer'], ['rejected', 'Reject']].map(function (x) { return '<button class="btn btn--sm' + (x[0] === 'accepted' ? ' btn--primary' : '') + '" data-dec="' + x[0] + '" data-key="' + esc(r.key) + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
      }).join('') : '<div class="fo-empty">No recommendations: the data does not point to any action right now.</div>';
      $$('[data-dec]', body).forEach(function (b) { b.onclick = function () {
        var r = recs.filter(function (x) { return x.key === b.dataset.key; })[0], note = prompt('Note for the decision log (optional):', ''); if (note === null) return;
        U.api('f.decision.save', { decision: { rec_key: r.key, title: r.issue, status: b.dataset.dec, note: note, follow_up_metric: r.follow_up.metric, baseline: r.follow_up.baseline, review_date: M.addDays(today(), r.follow_up.review_days) } }).then(function (j) { if (!j.ok) return toast(j.error, true); toast('Logged as ' + b.dataset.dec); U.load(true); });
      }; });
    } else if (T.cur === 'matrix') {
      var q = { 'Do now': [], 'Quick win': [], 'Plan': [], 'Later': [] }; recs.forEach(function (r) { q[r.quadrant].push(r); });
      body.innerHTML = '<div class="fo-grid fo-grid--2">' + [['Do now', 'high impact, feasible'], ['Plan', 'high impact, harder'], ['Quick win', 'smaller impact, easy'], ['Later', 'smaller impact, harder']].map(function (x) { return card(x[0], x[1], q[x[0]].length ? '<ul style="margin:0;padding-left:18px">' + q[x[0]].map(function (r) { return '<li><b>' + esc(r.issue) + '</b> <span class="fo-hint">(impact ' + r.impact.score + ', feasibility ' + r.feasibility + ')</span></li>'; }).join('') + '</ul>' : '<p class="fo-hint">None.</p>'); }).join('') + '</div>';
    } else {
      body.innerHTML = table(['Decided', 'Recommendation', 'Status', 'Follow-up', 'Review', 'Outcome', ''], log.slice().sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; }).map(function (d) { return [dmy(d.decided_at), '<b>' + esc(d.title) + '</b>' + (d.note ? '<br><small class="fo-hint">' + esc(d.note) + '</small>' : ''), '<span class="fo-badge">' + esc(d.status) + '</span>', esc(d.follow_up_metric) + (d.baseline ? ' (was ' + esc(d.baseline) + ')' : ''), dmy(d.review_date), esc(d.outcome || ''), '<button class="btn btn--sm" data-upd="' + esc(d.decision_id) + '">Update</button>']; }), { empty: 'No decisions logged yet. Accept, defer or reject a recommendation to start the log.' });
      $$('[data-upd]', body).forEach(function (b) { b.onclick = function () {
        var d = log.filter(function (x) { return x.decision_id === b.dataset.upd; })[0];
        var p = U.drawer('<div class="fo-drawer__head"><h2 class="serif" style="font-size:22px">' + esc(d.title) + '</h2><button class="fo-iconbtn" data-close>' + U.icon('x') + '</button></div>' +
          '<label class="fo-field">Status' + sel('dl-s', [['accepted', 'Accepted'], ['deferred', 'Deferred'], ['rejected', 'Rejected'], ['implemented', 'Implemented']], d.status) + '</label><label class="fo-field">Outcome (what happened to ' + esc(d.follow_up_metric || 'the metric') + ')<textarea id="dl-o" rows="3" maxlength="1000">' + esc(d.outcome || '') + '</textarea></label><button class="btn btn--primary" id="dl-go">Save</button>');
        $('#dl-go', p).onclick = function () { U.api('f.decision.save', { decision: Object.assign({}, d, { status: $('#dl-s', p).value, outcome: $('#dl-o', p).value }) }).then(function (j) { if (!j.ok) return toast(j.error, true); p.parentNode.remove(); toast('Saved'); U.load(true); }); };
      }; });
    }
  }

  // ============================================================ Reports & exports (phase 5, replaces the basic view) ============================================================
  var baseReports = U.VIEWS.reports;
  function viewReports(page) {
    var reps = (S.data.reports || []).slice().sort(function (a, b) { return a.generated_at < b.generated_at ? 1 : -1; }), r = range();
    var emailOn = String(S.data.settings && S.data.settings.report_email || '').split(',').filter(Boolean);
    page.innerHTML = U.hello('Reports & exports', 'Scheduled reports run on Google\'s servers every morning after 07:00 IST, even when nobody is signed in. ' + (emailOn.length ? 'Emailed to you: ' + esc(emailOn.join(', ')) + '.' : 'Email delivery is off (Settings → Report delivery).')) +
      '<div class="fo-card"><h3>Generate now</h3><div class="fo-toolbar">' + Object.keys(I.REPORT_TYPES).map(function (k) { return '<button class="btn" data-gen="' + k + '">' + esc(I.REPORT_TYPES[k]) + '</button>'; }).join('') +
      '<button class="btn btn--primary" id="rp-custom">Custom period (' + dm(r.from) + ' – ' + dm(r.to) + ')</button></div><p class="fo-hint">Each covers the last complete period (yesterday, last week, last month…). Re-running the same period is skipped unless you choose to regenerate.</p></div>' +
      '<div class="fo-card" style="margin-top:14px"><h3>Archive <small>' + reps.length + ' reports</small></h3>' +
      table(['Report', 'Period', 'Generated', 'Data as of', 'By', 'Emailed', ''], reps.map(function (x) { return ['<b>' + esc(I.REPORT_TYPES[x.type] || x.type) + '</b>', esc(x.from === x.to ? x.from : x.from + ' → ' + x.to), when(x.generated_at), when(x.data_freshness), esc(x.actor), x.emailed ? when(x.emailed) : '—', '<button class="btn btn--sm" data-view="' + esc(x.report_id) + '">View</button>']; }), { empty: 'No reports yet. The first daily brief is generated tomorrow morning, or click one above.' }) + '</div>' +
      '<div class="fo-card" style="margin-top:14px"><h3>Data exports</h3><div class="fo-toolbar"><button class="btn" id="x-xls">Excel workbook (bookings, payments, expenses, channels)</button><button class="btn" id="x-b">Bookings CSV</button><button class="btn" id="x-p">Payments CSV</button><button class="btn" id="x-def">Metric definitions</button></div></div>';
    function gen(type, body) { U.api('f.report.run', Object.assign({ type: type }, body || {})).then(function (j) { if (!j.ok) return toast(j.error, true); if (j.status === 'exists') { if (confirm('This period was already generated. Regenerate it?')) gen(type, Object.assign({ force: true }, body || {})); return; } toast('Report generated'); U.load(true); }); }
    $$('[data-gen]', page).forEach(function (b) { b.onclick = function () { b.disabled = true; gen(b.dataset.gen); setTimeout(function () { b.disabled = false; }, 4000); }; });
    $('#rp-custom').onclick = function () { gen(M.days(r.from, r.to) > 120 ? 'quarterly' : 'monthly', { from: r.from, to: r.to }); };
    $$('[data-view]', page).forEach(function (b) { b.onclick = function () {
      b.disabled = true; U.api('f.report.get', { report_id: b.dataset.view }).then(function (j) { b.disabled = false; if (!j.ok) return toast(j.error, true);
        var p = U.drawer('<div class="fo-drawer__head"><h2 class="serif" style="font-size:22px">Report</h2><span class="fo-card__tools">' + (j.pdf_url ? '<a class="btn btn--sm" href="' + esc(j.pdf_url) + '" target="_blank" rel="noopener">PDF in Drive</a>' : '') + '<button class="btn btn--sm" id="rv-print">Print</button><button class="fo-iconbtn" data-close>' + U.icon('x') + '</button></span></div><iframe id="rv-frame" title="Report" sandbox="allow-same-origin allow-modals" style="width:100%;height:calc(100vh - 120px);border:1px solid var(--line);border-radius:12px;background:#fff"></iframe>');
        $('#rv-frame', p).srcdoc = j.html;
        $('#rv-print', p).onclick = function () { $('#rv-frame', p).contentWindow.print(); };
      });
    }; });
    $('#x-xls').onclick = function () {
      var Dt = S.data, cp = I.channelProfit(D(), r.from, r.to, f()), pi = M.paymentsBy(Dt.payments);
      C.exportExcel('ap-villas-founder-export-' + today(), [
        { name: 'Bookings', head: ['booking_id', 'external_id', 'channel', 'villa', 'guest', 'checkin', 'checkout', 'nights', 'status', 'gross_amount', 'discount', 'taxes', 'commission', 'collected', 'refunded', 'booked_on', 'booked_on_basis', 'found_us_via', 'paid_through'], rows: Dt.bookings.map(function (b) { var x = pi[b.booking_id] || { paid: 0, refunded: 0 }; return [b.booking_id, b.external_id, b.channel, U.propName(b.property_id), b.guest_name, b.checkin, b.checkout, num(b.nights), b.status, has(b.gross_amount) ? num(b.gross_amount) : '', num(b.discount), num(b.taxes), has(b.commission) ? num(b.commission) : '', x.paid, x.refunded, M.dateOf(b.created_at), b.created_basis, b.acquisition_source, b.payment_channel]; }) },
        { name: 'Payments', head: ['payment_id', 'booking_id', 'date', 'type', 'amount', 'method', 'reference'], rows: Dt.payments.map(function (p) { return [p.payment_id, p.booking_id, p.date, p.type, num(p.amount), p.method, p.reference]; }) },
        { name: 'Expenses', head: ['expense_id', 'date', 'villa', 'category', 'amount', 'basis', 'vendor', 'note'], rows: (Dt.expenses || []).map(function (e) { return [e.expense_id, e.date, e.property_id, e.category, num(e.amount), e.basis, e.vendor, e.note]; }) },
        { name: 'Channels ' + r.from.slice(2), head: ['channel', 'nights', 'revenue', 'commission', 'payment_fees', 'contribution'], rows: cp.map(function (x) { return [x.channel, x.nights, Math.round(x.revenue), Math.round(x.commission), Math.round(x.payment_fees), x.contribution == null ? 'partial' : Math.round(x.contribution)]; }) }]);
    };
    $('#x-b').onclick = function () { location.hash = '#/bookings/list'; setTimeout(function () { var b = $('#bl-csv'); if (b) b.click(); }, 80); };
    $('#x-p').onclick = function () { U.csvDownload('ap-villas-payments-' + today(), ['payment_id', 'booking_id', 'date', 'type', 'amount', 'method', 'reference'], S.data.payments.map(function (p) { return [p.payment_id, p.booking_id, p.date, p.type, p.amount, p.method, p.reference]; })); };
    $('#x-def').onclick = function () { location.hash = '#/settings/metrics'; };
    void baseReports;
  }

  // ============================================================ Settings tabs ============================================================
  U.settingsExtra.reports = function (body) {
    var on = String(S.data.settings && S.data.settings.report_email || '').split(',');
    body.innerHTML = '<div class="fo-card"><h3>Email me these reports</h3><p class="fo-hint">Sent from apvillasandresorts@gmail.com to your founder email, with the PDF attached. Off until you tick a box. Reports are always archived in the portal and in the private Drive folder "AP Villas Founder OS Reports" either way.</p>' +
      Object.keys(I.REPORT_TYPES).map(function (k) { return '<label style="display:block;padding:6px 0"><input type="checkbox" value="' + k + '"' + (on.indexOf(k) >= 0 ? ' checked' : '') + '> ' + esc(I.REPORT_TYPES[k]) + '</label>'; }).join('') +
      '<button class="btn btn--primary" id="re-save" style="margin-top:8px">Save</button></div>';
    $('#re-save').onclick = function () { var v = $$('input[type=checkbox]', body).filter(function (x) { return x.checked; }).map(function (x) { return x.value; }).join(','); api('f.settings.save', { settings: { report_email: v } }, v ? 'Email delivery on: ' + v : 'Email delivery off'); };
  };
  U.settingsExtra.ga4 = function (body) {
    var s = S.data.settings || {};
    body.innerHTML = '<div class="fo-grid fo-grid--2"><div class="fo-card"><h3>Google Analytics 4</h3><label class="fo-field">GA4 property ID<input id="ga-p" value="' + esc(s.ga4_property || '') + '" inputmode="numeric"></label><label class="fo-field">Count traffic only on this hostname<input id="ga-h" value="' + esc(s.ga4_host || '') + '"></label>' +
      '<button class="btn btn--primary" id="ga-save">Save</button> <button class="btn" id="ga-test">Test connection</button><div class="fo-msg" id="ga-msg"></div></div>' +
      '<div class="fo-card"><h3>Measurement audit</h3><ul class="fo-hint" style="line-height:1.7"><li>Tag: G-BEZ8KC5XGV on every public page (loaded 1.5 s after page load); not on this portal.</li><li>Events: whatsapp_click, phone_click, enquiry_sheet_open, enquiry_form_submit, echeckin_submit, journal_subscribe, post_listen, game events.</li><li>No names, phones or emails are sent to GA4 (only villa, nights, guest counts and booking source).</li><li>No online checkout, so no purchase events: website bookings are reconciled from the ledger.</li><li>No consent banner is configured on the site; consider one if you add advertising features.</li></ul></div></div>';
    $('#ga-save').onclick = function () { api('f.settings.save', { settings: { ga4_property: $('#ga-p').value, ga4_host: $('#ga-h').value } }, 'Saved'); };
    $('#ga-test').onclick = function () { var m = $('#ga-msg'); m.className = 'fo-msg'; m.textContent = 'Testing…'; U.api('f.ga4', { from: M.addDays(today(), -7), to: today() }).then(function (j) { S.ga = null; if (!j.ok) { m.textContent = j.error; return; } if (j.ga.connected) { m.className = 'fo-msg ok'; m.textContent = 'Connected: ' + j.ga.totals.sessions + ' sessions in the last 7 days.'; } else m.textContent = j.ga.reason; }); };
  };

  // ============================================================ register & start ============================================================
  var V = U.VIEWS;
  V.revenue = viewRevenue; V.studio = viewStudio; V.trends = viewTrends; V.website = viewWebsite; V.finance = viewFinance; V.forecast = viewForecast; V.strategy = viewStrategy; V.reports = viewReports;
  U.MODULES.forEach(function (m) { delete m.phase; });
  U.start();
})();
