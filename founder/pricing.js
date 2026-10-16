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
    var T = U.tabs('pricing', [['rates', 'Rate guide'], ['competitors', 'Competitors'], ['observations', 'Market prices'], ['signals', 'Demand signals'], ['engine', 'How prices are set']]);
    var D = data(), obs = D.market_rates || [], latest = obs.map(function (r) { return r.observed_at; }).sort().pop();
    page.innerHTML = U.hello('Pricing & market', 'Reference rates for each villa and night, from your bookings, events, demand and dated competitor prices. ' +
      (latest ? 'Market prices last observed ' + esc(dmy(latest)) + ' (' + obs.length + ' observations).' : 'No market prices yet: they arrive with the weekly research job or can be added by hand.')) + T.html + '<div id="pr"></div>';
    U.wireTabs(page, 'pricing');
    var body = $('#pr');
    ({ rates: rates, competitors: competitors, observations: observations, signals: signals, engine: engine }[T.cur] || rates)(body);
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
      (a.active ? '<p>Created ' + when(a.created_at) + ' by ' + esc(a.created_by || '') + '. Last used ' + (a.last_used ? when(a.last_used) : 'never') + '.</p>' : '<p>Lets the weekly market research job send competitor prices, demand signals and the monthly market report into this portal.</p>') +
      '<p class="fo-hint">The key can only: import market data, upload market reports, read website analytics and read aggregate figures. It can never read guest names, phones or emails, change bookings or sign in. It is stored only as a fingerprint; creating a new one cancels the old one.</p>' +
      (founder ? '<button class="btn btn--primary" id="ak-new">' + (a.active ? 'Replace key' : 'Create key') + '</button>' + (a.active ? ' <button class="btn btn--danger" id="ak-revoke">Revoke</button>' : '') : '<p class="fo-hint">Only the founder can manage the key.</p>') + '<div id="ak-out"></div></div>' +
      '<div class="fo-card"><h3>Connect the weekly research job</h3><ol style="line-height:1.7;margin:0;padding-left:18px"><li>Create the key here and copy it (shown once).</li><li>On your Mac, in Terminal, run (it asks for the key without showing it):<pre class="fo-note" style="white-space:pre-wrap;user-select:all">gh secret set FOUNDER_OS_KEY --repo apvillasandresorts/AP-villa-and-resorts-website</pre></li><li>That is all: the job runs every Monday at 07:30 IST (GitHub → Actions → "Market intelligence" → Run workflow to try it now). Results appear in Pricing & market and Reports.</li></ol>' +
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
