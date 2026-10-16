/**
 * AP Villas Founder OS · insights library (phases 5–10), built on the metric dictionary (founder/metrics.js).
 * Pure functions only: the same file runs in the portal, in Node tests and in Apps Script (pasted as FoInsightsLib.gs)
 * for scheduled reports. Nothing here invents numbers: where data is missing the result says so.
 */
var FoInsights = (function () {
  function M() { return typeof FoMetrics !== 'undefined' ? FoMetrics : require('./metrics.js'); }
  var DAY = 86400000;
  function t(d) { return Date.parse(d + 'T00:00:00Z'); }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function add(d, n) { return iso(t(d) + n * DAY); }
  function num(v) { return M().num(v); }
  function has(v) { return M().has(v); }
  function sum(a, f) { return a.reduce(function (s, x) { return s + (f ? f(x) : x); }, 0); }
  function round(v, d) { var p = Math.pow(10, d || 0); return Math.round(v * p) / p; }

  // ------------------------------------------------------------ Ujjain demand calendar (verified, year-specific) ------------------------------------------------------------
  // confidence: 'confirmed' = several sources agree / official; 'tentative' = official plan subject to change. Founder-added events come from the Events tab.
  var EVENTS = [
    { id: 'mahashivratri-2026', name: 'Mahashivratri (Shiv Navratri festivities)', start: '2026-02-06', end: '2026-02-18', peak: '2026-02-15', kind: 'festival', confidence: 'confirmed', source: 'ujjaindarshan.com; hindutone.com' },
    { id: 'shravan-2026', name: 'Shravan month (Mahakal Sawari Mondays)', start: '2026-07-30', end: '2026-08-28', kind: 'festival', confidence: 'confirmed', source: 'Free Press Journal (Purnimanta Shravan 2026)' },
    { id: 'navratri-2026', name: 'Sharad Navratri', start: '2026-10-11', end: '2026-10-19', peak: '2026-10-20', kind: 'festival', confidence: 'confirmed', source: 'AP Villas Journal (Hindu Tone, Gulf News)' },
    { id: 'diwali-2026', name: 'Diwali', start: '2026-11-06', end: '2026-11-10', peak: '2026-11-08', kind: 'festival', confidence: 'confirmed', source: 'AP Villas Journal (SmartPuja and others)' },
    { id: 'kartik-2026', name: 'Hari-Har Milan and Kartik Purnima', start: '2026-11-23', end: '2026-11-24', kind: 'festival', confidence: 'confirmed', source: 'AP Villas Journal (Hindu Tone, Haindavam)' },
    { id: 'mahashivratri-2027', name: 'Mahashivratri', start: '2027-02-25', end: '2027-03-07', peak: '2027-03-06', kind: 'festival', confidence: 'confirmed', source: 'officeholidays.com; Shubh Panchang (peak 6 Mar; Ujjain festivities usually start ~9 days earlier)' },
    { id: 'holi-2027', name: 'Holika Dahan and Holi', start: '2027-03-21', end: '2027-03-22', kind: 'festival', confidence: 'confirmed', source: 'officeholidays.com; dekhopanchang.com' },
    { id: 'diwali-2027', name: 'Diwali', start: '2027-10-27', end: '2027-10-31', peak: '2027-10-29', kind: 'festival', confidence: 'confirmed', source: 'muhuratam.in; dekhopanchang.com' },
    { id: 'simhastha-2028', name: 'Simhastha Kumbh 2028', start: '2028-03-27', end: '2028-05-27', kind: 'mega', confidence: 'tentative', source: 'Madhya Pradesh government plan, via AP Villas Journal (main snan days proposed 9 Apr – 8 May)' },
  ];
  var FIXED_HOLIDAYS = [['01-26', 'Republic Day'], ['08-15', 'Independence Day'], ['10-02', 'Gandhi Jayanti'], ['12-25', 'Christmas']];
  /** Long weekends from fixed national holidays (Fri/Mon = 3 days; Thu/Tue = 4-day bridge). */
  function longWeekends(fromYear, toYear) {
    var out = [];
    for (var y = fromYear; y <= toYear; y++) FIXED_HOLIDAYS.forEach(function (h) {
      var d = y + '-' + h[0], w = new Date(t(d)).getUTCDay(), s = null, e = null;
      if (w === 5) { s = d; e = add(d, 2); } else if (w === 1) { s = add(d, -2); e = d; } else if (w === 4) { s = d; e = add(d, 3); } else if (w === 2) { s = add(d, -3); e = d; }
      else if (w === 6 || w === 0) { s = w === 6 ? d : add(d, -1); e = w === 6 ? add(d, 1) : d; }
      if (s) out.push({ id: 'lw-' + d, name: h[1] + (w === 4 || w === 2 ? ' (4-day bridge)' : ' long weekend'), start: s, end: e, kind: 'holiday', confidence: 'confirmed', source: 'Fixed national holiday' });
    });
    return out;
  }
  function allEvents(custom) {
    var years = [2026, 2027, 2028];
    return EVENTS.concat(longWeekends(years[0], years[years.length - 1])).concat((custom || []).map(function (e) { return { id: e.event_id, name: e.name, start: e.start, end: e.end, kind: e.kind || 'custom', confidence: e.confidence || 'founder', source: e.source || 'Added by founder' }; }))
      .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
  }
  /** Event vs baseline: same-length windows 4 weeks before and after (event days excluded). */
  function eventImpact(data, ev, f) {
    var Mx = M(), len = Mx.days(ev.start, ev.end);
    var during = Mx.compute(data, ev.start, ev.end, f);
    var before = Mx.compute(data, add(ev.start, -28 - len), add(ev.start, -29), f), after = Mx.compute(data, add(ev.end, 29), add(ev.end, 28 + len), f);
    var baseOcc = avgNonNull([before.occupancy, after.occupancy]), baseAdr = avgNonNull([before.adr, after.adr]);
    var stayers = Mx.nights(data, ev.start, ev.end, f).map(function (n) { return n.booking; }).filter(function (b, i, a) { return a.indexOf(b) === i; });
    var leads = stayers.filter(function (b) { return !/proxy/.test(b.created_basis || '') && b.created_at; }).map(function (b) { return Math.round((t(b.checkin) - t(Mx.dateOf(b.created_at))) / DAY); });
    return { event: ev, occupancy: during.occupancy, adr: during.adr, revenue: during.net_accommodation_revenue, nights: during.occupied_nights, available: during.available_nights,
      baseline_occupancy: baseOcc, baseline_adr: baseAdr, occupancy_lift: during.occupancy != null && baseOcc != null ? during.occupancy - baseOcc : null,
      adr_lift: during.adr != null && baseAdr ? during.adr / baseAdr - 1 : null, lead_time_median: median(leads), lead_n: leads.length, stays: stayers.length };
  }
  function avgNonNull(a) { var x = a.filter(function (v) { return v != null && isFinite(v); }); return x.length ? sum(x) / x.length : null; }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  // ------------------------------------------------------------ revenue decomposition ------------------------------------------------------------
  /** Accommodation revenue = available nights × occupancy × ADR. Log-mean (LMDI) attribution: the three effects add up exactly to the change. */
  function decompose(cur, prev) {
    var R1 = cur.net_accommodation_revenue, R0 = prev.net_accommodation_revenue;
    var f1 = [cur.available_nights, cur.occupancy, cur.adr], f0 = [prev.available_nights, prev.occupancy, prev.adr];
    var ok = f1.concat(f0).every(function (v) { return v > 0; });
    if (!ok) return { change: R1 - R0, method: 'unavailable', note: 'Needs revenue, occupancy and ADR in both periods.' };
    var L = Math.abs(R1 - R0) < 1e-9 ? R1 : (R1 - R0) / Math.log(R1 / R0);
    var eff = f1.map(function (v, i) { return L * Math.log(v / f0[i]); });
    return { change: R1 - R0, availability: eff[0], occupancy: eff[1], adr: eff[2], method: 'LMDI (log-mean) attribution', from: R0, to: R1 };
  }

  // ------------------------------------------------------------ channel profitability ------------------------------------------------------------
  function channelProfit(data, from, to, f) {
    var Mx = M(), rows = {}, ch = data.channels || [];
    Mx.nights(data, from, to, f).forEach(function (n) {
      var b = n.booking, k = b.channel || 'Unknown', r = rows[k] || (rows[k] = { channel: k, direct: Mx.isDirect(k, ch), stays: {}, nights: 0, revenue: 0, commission: 0, commission_unknown: {}, fees: 0, fee_unknown: false });
      var c = (ch.filter(function (x) { return x.channel === k; })[0]) || {};
      r.nights++; r.revenue += n.revenue; r.commission += n.commission; r.stays[b.booking_id] = 1;
      if (Mx.commissionOf(b, ch).basis === 'unknown') r.commission_unknown[b.booking_id] = 1;
      if (has(c.payment_fee_pct)) r.fees += n.revenue * num(c.payment_fee_pct) / 100; else if (!Mx.isDirect(k, ch)) r.fee_unknown = true;   // direct UPI/cash: no gateway fee unless a rate is set
    });
    var made = Mx.breakdown(data, from, to, 'channel', f), madeIdx = {}; made.forEach(function (m) { madeIdx[m.key] = m; });
    return Object.keys(rows).map(function (k) {
      var r = rows[k], m = madeIdx[k] || {}, unk = Object.keys(r.commission_unknown).length;
      var contribution = unk ? null : r.revenue - r.commission - r.fees;
      return { channel: k, direct: r.direct, stays: Object.keys(r.stays).length, nights: r.nights, revenue: r.revenue, adr: r.nights ? r.revenue / r.nights : null,
        commission: r.commission, commission_unknown: unk, payment_fees: r.fees, payment_fee_known: !r.fee_unknown,
        contribution: contribution, margin: contribution != null && r.revenue ? contribution / r.revenue : null,
        bookings_made: m.bookings || 0, avg_booking_value: m.bookings ? m.value / m.bookings : null, cancellation_rate: m.bookings ? m.cancelled / m.bookings : null };
    }).sort(function (a, b) { return b.revenue - a.revenue; });
  }

  // ------------------------------------------------------------ pricing & demand patterns ------------------------------------------------------------
  function seasonality(data, f) {
    var Mx = M(), bk = (data.bookings || []).filter(function (b) { return b.status === 'confirmed' && b.checkin; });
    if (!bk.length) return [];
    var first = bk.map(function (b) { return b.checkin; }).sort()[0].slice(0, 7) + '-01', last = (data.today || iso(Date.now()));
    return Mx.series(data, first, last, 'month', f).map(function (r) { return { month: r.key, occupancy: r.occupancy, adr: r.adr, revenue: r.revenue, nights: r.occupied }; });
  }
  function weekendByVilla(data, from, to) {
    var Mx = M();
    return (data.properties || []).map(function (p) { var w = Mx.weekendSplit(data, from, to, { property: p.property_id }); return { name: p.name, property_id: p.property_id, weekend: w.weekend, weekday: w.weekday, premium: w.weekend.adr && w.weekday.adr ? w.weekend.adr / w.weekday.adr - 1 : null }; });
  }
  function discountEffect(data, from, to, f) {
    var Mx = M(), g = { with: [], without: [] };
    (data.bookings || []).forEach(function (b) {
      if (b.status === 'void' || (f && f.property && f.property !== 'all' && b.property_id !== f.property)) return;
      var d = Mx.dateOf(b.created_at); if (!d || d < from || d > to) return;
      (num(b.discount) > 0 ? g.with : g.without).push(b);
    });
    function stat(a) { var conf = a.filter(function (b) { return b.status === 'confirmed'; }), n = sum(conf, function (b) { return num(b.nights); });
      return { bookings: a.length, cancellation_rate: a.length ? a.filter(function (b) { return b.status === 'cancelled'; }).length / a.length : null, adr: n ? sum(conf, function (b) { return Mx.netAmount(b); }) / n : null, alos: conf.length ? n / conf.length : null, discount_total: sum(a, function (b) { return num(b.discount); }) }; }
    return { with_discount: stat(g.with), without_discount: stat(g.without), note: g.with.length < 5 ? 'Fewer than 5 discounted bookings: not enough to judge effectiveness.' : '' };
  }
  function cancellationLeakage(data, from, to, f) {
    var Mx = M(), out = {};
    (data.bookings || []).forEach(function (b) {
      if (b.status !== 'cancelled' && b.status !== 'no_show') return;
      if (f && f.property && f.property !== 'all' && b.property_id !== f.property) return;
      var d = Mx.dateOf(b.created_at); if (!d || d < from || d > to) return;
      var r = out[b.channel] || (out[b.channel] = { channel: b.channel, cancelled: 0, lost_value: 0, kept: 0 });
      r.cancelled++; r.lost_value += Math.max(0, num(b.gross_amount) - num(b.discount) - num(b.retained_amount)); r.kept += num(b.retained_amount);
    });
    return Object.keys(out).map(function (k) { return out[k]; }).sort(function (a, b) { return b.lost_value - a.lost_value; });
  }
  /** On-the-books occupancy for each of the next n weeks. */
  function forwardOccupancy(data, weeks, f) {
    var Mx = M(), today = data.today || iso(Date.now()), out = [];
    for (var i = 0; i < weeks; i++) { var s = add(today, i * 7), e = add(s, 6), m = Mx.compute(data, s, e, f); out.push({ from: s, to: e, occupancy: m.occupancy, nights: m.occupied_nights, available: m.available_nights, revenue: m.net_accommodation_revenue }); }
    return out;
  }

  // ------------------------------------------------------------ financial intelligence ------------------------------------------------------------
  var EXPENSE_CATEGORIES = [
    ['housekeeping', 'Housekeeping', 'variable'], ['laundry', 'Laundry', 'variable'], ['guest_supplies', 'Guest supplies & toiletries', 'variable'], ['utilities', 'Utilities (power, water, gas, internet)', 'semi'],
    ['maintenance', 'Maintenance', 'fixed'], ['repairs', 'Repairs', 'fixed'], ['staff', 'Staff & caretakers', 'fixed'], ['marketing', 'Marketing', 'fixed'],
    ['commissions', 'Commissions paid outside bookings', 'variable'], ['payment_fees', 'Payment gateway fees', 'variable'], ['rent_lease', 'Rent / lease', 'fixed'], ['taxes_fees', 'Licences, taxes & fees', 'fixed'], ['other', 'Other operating costs', 'fixed'],
  ];
  function catKind(c) { var x = EXPENSE_CATEGORIES.filter(function (k) { return k[0] === c; })[0]; return x ? x[2] : 'fixed'; }
  /** Expenses in [from, to] for the villa filter. Shared costs (property 'all') are counted for 'all villas' only, or allocated by villa share when a villa is selected. */
  function expensesIn(data, from, to, f) {
    var props = (data.properties || []).filter(function (p) { return String(p.active) !== 'no'; }), share = props.length ? 1 / props.length : 1;
    return (data.expenses || []).filter(function (e) { return e.date >= from && e.date <= to; }).map(function (e) {
      if (!f || !f.property || f.property === 'all') return { e: e, amount: num(e.amount) };
      if (e.property_id === f.property) return { e: e, amount: num(e.amount) };
      if (!e.property_id || e.property_id === 'all') return { e: e, amount: num(e.amount) * share, allocated: true };
      return null;
    }).filter(Boolean);
  }
  function finance(data, from, to, f) {
    var Mx = M(), m = Mx.compute(data, from, to, f), ex = expensesIn(data, from, to, f);
    var byCat = {}, actual = 0, estimate = 0, variable = 0, fixed = 0;
    ex.forEach(function (x) { var c = x.e.category || 'other', k = catKind(c); byCat[c] = (byCat[c] || 0) + x.amount; if (x.e.basis === 'estimate') estimate += x.amount; else actual += x.amount; if (k === 'variable' || k === 'semi') variable += x.amount; else fixed += x.amount; });
    var cp = channelProfit(data, from, to, f), fees = sum(cp, function (r) { return r.payment_fees; }), feeKnown = cp.every(function (r) { return r.payment_fee_known || !r.revenue; });
    var commUnknown = sum(cp, function (r) { return r.commission_unknown; });
    var costs = ex.length > 0;
    var commissionStay = sum(cp, function (r) { return r.commission; });
    var contribution = m.net_accommodation_revenue - commissionStay - fees - variable;
    var opProfit = contribution - fixed;
    var varPerNight = m.occupied_nights ? (variable + fees + commissionStay) / m.occupied_nights : null;
    var breakEven = m.adr && varPerNight != null && m.adr > varPerNight && m.available_nights ? (fixed / (m.adr - varPerNight)) / m.available_nights : null;
    var status = !costs ? 'unavailable' : (commUnknown || !feeKnown || estimate > 0 ? 'partial' : 'complete');
    return {
      revenue: m.net_accommodation_revenue, cash_collected: m.cash_collected, refunds: m.refunds, receivables: m.outstanding_receivables,
      commission: commissionStay, commission_unknown_bookings: commUnknown, payment_fees: fees, payment_fees_known: feeKnown,
      discounts: sum(Mx.nights(data, from, to, f), function (n) { var b = n.booking; return num(b.discount) / Math.max(1, num(b.nights)); }),
      expenses_total: actual + estimate, expenses_actual: actual, expenses_estimate: estimate, by_category: byCat, variable_costs: variable, fixed_costs: fixed,
      contribution: costs ? contribution : null, operating_profit: costs ? opProfit : null, status: status,
      status_note: status === 'unavailable' ? 'No operating costs recorded for this period, so profit cannot be calculated.' : status === 'partial' ? 'Partial: ' + [commUnknown ? commUnknown + ' bookings with unknown commission' : '', !feeKnown ? 'payment fee rates not set for every channel' : '', estimate ? 'includes management estimates' : ''].filter(Boolean).join('; ') + '.' : '',
      cost_per_occupied_night: m.occupied_nights && costs ? (actual + estimate) / m.occupied_nights : null,
      break_even_occupancy: costs ? breakEven : null, occupancy: m.occupancy, adr: m.adr, occupied_nights: m.occupied_nights, available_nights: m.available_nights,
    };
  }
  /** Receivables by age (days since check-in). */
  function receivablesAging(data) {
    var Mx = M(), today = data.today || iso(Date.now()), pay = Mx.paymentsBy(data.payments), buckets = { 'not yet arrived': 0, '0–30 days': 0, '31–60 days': 0, '60+ days': 0 }, list = [];
    (data.bookings || []).forEach(function (b) {
      if (['confirmed', 'no_show'].indexOf(b.status) < 0 || !has(b.gross_amount)) return;
      var x = pay[b.booking_id] || { paid: 0, refunded: 0 }, due = num(b.gross_amount) - num(b.discount) + num(b.retained_amount) - x.paid + x.refunded;
      if (due <= 0.5) return;
      var age = Math.round((t(today) - t(b.checkin)) / DAY), k = age < 0 ? 'not yet arrived' : age <= 30 ? '0–30 days' : age <= 60 ? '31–60 days' : '60+ days';
      buckets[k] += due; list.push({ booking: b, due: due, age: age, bucket: k });
    });
    return { buckets: buckets, list: list.sort(function (a, b) { return b.age - a.age; }) };
  }
  /** Weekly cash-flow outlook: expected inflows = balances of guests arriving that week (management estimate); outflows = average weekly recorded costs of the last 90 days. */
  function cashflow(data, weeks) {
    var today = data.today || iso(Date.now()), aging = receivablesAging(data), ex = expensesIn(data, add(today, -90), add(today, -1));
    var weeklyOut = ex.length ? sum(ex, function (x) { return x.amount; }) / (90 / 7) : null, out = [], bal = 0;
    for (var i = 0; i < weeks; i++) {
      var s = add(today, i * 7), e = add(s, 6);
      var inflow = sum(aging.list.filter(function (x) { return x.booking.checkin >= s && x.booking.checkin <= e; }), function (x) { return x.due; });
      if (i === 0) inflow += sum(aging.list.filter(function (x) { return x.age >= 0; }), function (x) { return x.due; });   // overdue: assumed collected this week (optimistic, flagged)
      var outflow = weeklyOut == null ? null : weeklyOut; bal += inflow - (outflow || 0);
      out.push({ from: s, to: e, inflow: inflow, outflow: outflow, net: inflow - (outflow || 0), cumulative: bal });
    }
    return { weeks: out, basis: 'Management estimate: inflows are balances due from guests by arrival week (overdue balances counted in week 1); outflows are the average weekly costs recorded in the last 90 days' + (weeklyOut == null ? ' (none recorded, so outflows are unknown)' : '') + '.' };
  }
  function budgetVsActual(data, month, f) {
    var from = month + '-01', to = add(add(month + '-28', 4).slice(0, 7) + '-01', -1);
    var ex = expensesIn(data, from, to, f), actualBy = {}; ex.forEach(function (x) { actualBy[x.e.category] = (actualBy[x.e.category] || 0) + x.amount; });
    var bud = (data.budgets || []).filter(function (b) { return b.month === month && (!f || !f.property || f.property === 'all' || b.property_id === f.property || !b.property_id || b.property_id === 'all'); });
    var rows = {}; bud.forEach(function (b) { var r = rows[b.category] || (rows[b.category] = { category: b.category, budget: 0, actual: 0 }); r.budget += num(b.amount); });
    Object.keys(actualBy).forEach(function (c) { var r = rows[c] || (rows[c] = { category: c, budget: 0, actual: 0 }); r.actual = actualBy[c]; });
    var rev = M().compute(data, from, to, f).net_accommodation_revenue;
    if (rows.revenue) rows.revenue.actual = rev;
    return Object.keys(rows).map(function (k) { var r = rows[k]; r.variance = r.actual - r.budget; r.variance_pct = r.budget ? r.variance / r.budget : null; return r; });
  }

  // ------------------------------------------------------------ forecasting ------------------------------------------------------------
  /** Daily series of a quantity over [from, to]. kind: 'occupied' | 'revenue' | 'bookings' | 'cancellations' | 'cash' */
  function daily(data, from, to, kind, f) {
    var Mx = M(), idx = {}, out = [];
    for (var d = from; d <= to; d = add(d, 1)) { idx[d] = out.length; out.push({ date: d, value: 0 }); }
    if (kind === 'occupied' || kind === 'revenue') Mx.nights(data, from, to, f).forEach(function (n) { out[idx[n.date]].value += kind === 'occupied' ? 1 : n.revenue; });
    else if (kind === 'cash') (data.payments || []).forEach(function (p) { if (idx[p.date] != null) out[idx[p.date]].value += (p.type === 'refund' ? -1 : 1) * num(p.amount); });
    else (data.bookings || []).forEach(function (b) {
      if (b.status === 'void' || (f && f.property && f.property !== 'all' && b.property_id !== f.property)) return;
      var d = Mx.dateOf(b.created_at); if (idx[d] == null) return;
      if (kind === 'bookings' || (kind === 'cancellations' && b.status === 'cancelled')) out[idx[d]].value++;
    });
    return out;
  }
  var METHODS = {
    seasonal_naive: { label: 'Seasonal naive (same weekday last week)', fit: function (y) { return function (h) { var out = []; for (var i = 0; i < h; i++) out.push(y[y.length - 7 + (i % 7)]); return out; }; }, min: 7 },
    moving_average: { label: 'Moving average (last 28 days)', fit: function (y) { var w = y.slice(-28), a = sum(w) / w.length; return function (h) { var o = []; for (var i = 0; i < h; i++) o.push(a); return o; }; }, min: 14 },
    exp_smoothing: { label: 'Exponential smoothing (level)', fit: function (y) {
      var best = null; [0.1, 0.2, 0.3, 0.5].forEach(function (a) { var l = y[0], err = 0; for (var i = 1; i < y.length; i++) { err += Math.pow(y[i] - l, 2); l = a * y[i] + (1 - a) * l; } if (!best || err < best.err) best = { err: err, l: l }; });
      return function (h) { var o = []; for (var i = 0; i < h; i++) o.push(best.l); return o; }; }, min: 14 },
    seasonal_smoothing: { label: 'Exponential smoothing with weekday pattern', fit: function (y) {
      var n = y.length, mean = sum(y) / n || 0, idx = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
      for (var i = 0; i < n; i++) { idx[i % 7] += y[i]; cnt[i % 7]++; }
      var s = idx.map(function (v, k) { return cnt[k] ? v / cnt[k] - mean : 0; });
      var a = 0.2, l = y[0] - s[0]; for (var j = 1; j < n; j++) l = a * (y[j] - s[j % 7]) + (1 - a) * l;
      return function (h) { var o = []; for (var k = 0; k < h; k++) o.push(Math.max(0, l + s[(n + k) % 7])); return o; }; }, min: 28 },
  };
  /** Rolling-origin backtest: several cut-off points, forecast h days, compare with what happened. */
  function backtest(y, h, method, folds) {
    var M2 = METHODS[method], errs = [], abs = 0, sq = 0, act = 0, bias = 0, n = 0, perStep = [];
    for (var k = folds; k >= 1; k--) {
      var cut = y.length - k * h; if (cut < M2.min) continue;
      var fc = M2.fit(y.slice(0, cut))(h), real = y.slice(cut, cut + h);
      real.forEach(function (r, i) { var e = fc[i] - r; abs += Math.abs(e); sq += e * e; act += Math.abs(r); bias += e; n++; errs.push(e); (perStep[i] = perStep[i] || []).push(e); });
    }
    if (!n) return null;
    return { mae: abs / n, rmse: Math.sqrt(sq / n), wape: act ? abs / act : null, bias: bias / n, n: n, errors: errs };
  }
  function quantile(a, q) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }); var i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
  /**
   * Forecast a daily series h days ahead. History = [historyFrom, today-1]. Picks the method with the lowest backtest error (WAPE, else MAE).
   * Returns sufficiency info instead of a forecast when history is too short.
   */
  function forecast(data, kind, h, f, opts) {
    opts = opts || {};
    var today = data.today || iso(Date.now()), Mx = M();
    var firstDate = (data.bookings || []).filter(function (b) { return b.status !== 'void'; }).map(function (b) { return kind === 'bookings' || kind === 'cancellations' ? Mx.dateOf(b.created_at) : b.checkin; }).filter(Boolean).sort()[0];
    if (!firstDate) return { sufficient: false, reason: 'No history yet.', history_days: 0 };
    var hist = daily(data, firstDate, add(today, -1), kind, f), y = hist.map(function (p) { return p.value; });
    var need = Math.max(56, 3 * h), nonzero = y.filter(function (v) { return v; }).length;
    var info = { history_days: y.length, needed_days: need, nonzero_days: nonzero, horizon: h };
    if (h > 90 && y.length < 730) return Object.assign(info, { sufficient: false, reason: '12-month forecasts need at least two years of history (have ' + y.length + ' days).' });
    if (y.length < need || nonzero < 10) return Object.assign(info, { sufficient: false, reason: 'Needs at least ' + need + ' days of history with 10+ active days (have ' + y.length + ' days, ' + nonzero + ' active).' });
    var folds = Math.min(6, Math.floor((y.length - 28) / h)) || 1, results = [];
    Object.keys(METHODS).forEach(function (k) { var b = backtest(y, h, k, folds); if (b) results.push({ method: k, label: METHODS[k].label, mae: b.mae, rmse: b.rmse, wape: b.wape, bias: b.bias, n: b.n, errors: b.errors }); });
    if (!results.length) return Object.assign(info, { sufficient: false, reason: 'Not enough history to backtest.' });
    results.sort(function (a, b) { return (a.wape != null && b.wape != null ? a.wape - b.wape : a.mae - b.mae); });
    var best = results[0], fc = METHODS[best.method].fit(y)(h), lo = quantile(best.errors, 0.1), hi = quantile(best.errors, 0.9);
    var cap = kind === 'occupied' ? Mx.available : null;
    var points = fc.map(function (v, i) {
      var d = add(today, i), mean = Math.max(0, v), upper = Math.max(0, v - lo), lower = Math.max(0, v - hi);
      if (cap) { var a = cap(data, d, d, f); mean = Math.min(mean, a); upper = Math.min(upper, a); lower = Math.min(lower, a); }
      return { date: d, forecast: mean, lower: lower, upper: upper };
    });
    if (kind === 'occupied' || kind === 'revenue') {   // nights already booked are a floor
      var otb = daily(data, today, add(today, h - 1), kind, f);
      points.forEach(function (p, i) { p.on_books = otb[i].value; if (p.forecast < p.on_books) p.forecast = p.on_books; if (p.lower < p.on_books) p.lower = p.on_books; if (p.upper < p.forecast) p.upper = p.forecast; });
    }
    return Object.assign(info, { sufficient: true, method: best.method, method_label: best.label, accuracy: results.map(function (r) { return { method: r.method, label: r.label, mae: r.mae, rmse: r.rmse, wape: r.wape, bias: r.bias, n: r.n }; }),
      points: points, total: sum(points, function (p) { return p.forecast; }), total_lower: sum(points, function (p) { return p.lower; }), total_upper: sum(points, function (p) { return p.upper; }),
      interval: '80% range from backtest errors (10th–90th percentile), not a guarantee.' });
  }

  // ------------------------------------------------------------ scenario lab ------------------------------------------------------------
  /** Baseline levers from the last 90 days of real data (missing pieces are null and must be set by the founder). */
  function scenarioBase(data, f) {
    var Mx = M(), today = data.today || iso(Date.now()), from = add(today, -90), to = add(today, -1);
    var m = Mx.compute(data, from, to, f), cp = channelProfit(data, from, to, f), fin = finance(data, from, to, f);
    var rev = sum(cp, function (r) { return r.revenue; }), ota = sum(cp.filter(function (r) { return !r.direct; }), function (r) { return r.revenue; });
    var otaComm = sum(cp.filter(function (r) { return !r.direct; }), function (r) { return r.commission; });
    var months = 90 / 30.4;
    return { period: { from: from, to: to }, available_per_month: m.available_nights / months, occupancy: m.occupancy, adr: m.adr, ota_share: rev ? ota / rev : null,
      commission_pct: ota ? otaComm / ota : null, cancellation_rate: m.cancellation_rate, payment_fee_pct: rev ? fin.payment_fees / rev : null,
      variable_cost_per_night: m.occupied_nights && fin.expenses_total ? fin.variable_costs / m.occupied_nights : null, fixed_costs_per_month: fin.expenses_total ? fin.fixed_costs / months : null };
  }
  function scenario(l) {
    var nights = l.available_per_month * l.occupancy, gross = nights * l.adr, lost = gross * (l.cancellation_rate || 0) * (l.cancel_loss_share == null ? 0 : l.cancel_loss_share);
    var rev = gross - lost, commission = rev * (l.ota_share || 0) * (l.commission_pct || 0), fees = rev * (l.payment_fee_pct || 0), variable = nights * (l.variable_cost_per_night || 0);
    var contribution = rev - commission - fees - variable, profit = contribution - (l.fixed_costs_per_month || 0);
    return { occupied_nights: nights, revenue: rev, commission: commission, payment_fees: fees, variable_costs: variable, contribution: contribution, operating_profit: profit, margin: rev ? profit / rev : null };
  }
  function scenarioPresets(base) {
    function adj(o, x) { var r = Object.assign({}, base); Object.keys(x).forEach(function (k) { if (r[k] != null) r[k] = x[k](r[k]); }); return Object.assign(r, o || {}); }
    return {
      base: Object.assign({}, base),
      optimistic: adj(null, { occupancy: function (v) { return Math.min(1, v * 1.15); }, adr: function (v) { return v * 1.05; }, ota_share: function (v) { return Math.max(0, v - 0.1); }, cancellation_rate: function (v) { return v * 0.8; } }),
      pessimistic: adj(null, { occupancy: function (v) { return v * 0.85; }, adr: function (v) { return v * 0.95; }, ota_share: function (v) { return Math.min(1, v + 0.1); }, cancellation_rate: function (v) { return Math.min(1, v * 1.25); } }),
      note: 'Presets are simple what-ifs around your last 90 days (optimistic: +15% occupancy, +5% ADR, 10 pts more direct, 20% fewer cancellations; pessimistic: the reverse). They are assumptions, not forecasts.',
    };
  }

  // ------------------------------------------------------------ anomaly detection (transparent rules) ------------------------------------------------------------
  function anomalies(data, ga, f) {
    var Mx = M(), today = data.today || iso(Date.now()), out = [], notes = [];
    var b14 = daily(data, add(today, -14), add(today, -1), 'bookings', f), b56 = daily(data, add(today, -70), add(today, -15), 'bookings', f);
    var recent = sum(b14, function (p) { return p.value; }), base = sum(b56, function (p) { return p.value; }) / 4;   // per 14 days
    if (base >= 2 && recent < base * 0.5) out.push({ key: 'booking_drop', severity: 'high', title: 'Bookings dropped', fact: recent + ' bookings made in the last 14 days vs ' + round(base, 1) + ' per 14 days in the 8 weeks before.', method: 'Rule: last 14 days below half of the 8-week average (needs a baseline of 2+).' });
    else if (base < 2) notes.push('Booking-drop check needs at least 2 bookings per fortnight of history.');
    var c14 = daily(data, add(today, -14), add(today, -1), 'cancellations', f), cb = daily(data, add(today, -70), add(today, -15), 'cancellations', f);
    var cr = recent ? sum(c14, function (p) { return p.value; }) / recent : 0, crb = sum(b56, function (p) { return p.value; }) ? sum(cb, function (p) { return p.value; }) / sum(b56, function (p) { return p.value; }) : 0;
    if (recent >= 3 && cr >= 0.3 && cr > crb * 2) out.push({ key: 'cancel_spike', severity: 'high', title: 'Cancellations up', fact: 'Cancellation rate ' + round(cr * 100) + '% in the last 14 days vs ' + round(crb * 100) + '% before.', method: 'Rule: 30%+ and more than double the previous 8 weeks (needs 3+ recent bookings).' });
    var a30 = Mx.compute(data, add(today, -30), add(today, -1), f), a90 = Mx.compute(data, add(today, -120), add(today, -31), f);
    if (a30.occupied_nights >= 5 && a90.occupied_nights >= 5 && a90.adr && Math.abs(a30.adr / a90.adr - 1) > 0.25) out.push({ key: 'adr_shift', severity: 'medium', title: 'ADR moved sharply', fact: 'ADR ₹' + round(a30.adr) + ' in the last 30 days vs ₹' + round(a90.adr) + ' in the 90 days before (' + round((a30.adr / a90.adr - 1) * 100) + '%).', method: 'Rule: more than ±25% with 5+ nights in both windows.' });
    var fwd = Mx.compute(data, today, add(today, 29), f), lastYearFwd = Mx.compute(data, add(today, -365), add(today, -336), f);
    if (fwd.available_nights && fwd.occupancy < 0.15) out.push({ key: 'low_forward', severity: 'medium', title: 'Next 30 days look empty', fact: 'Only ' + fwd.occupied_nights + ' of ' + fwd.available_nights + ' villa-nights booked for the next 30 days' + (lastYearFwd.occupied_nights ? ' (same dates last year ended at ' + round(lastYearFwd.occupancy * 100) + '%).' : '.'), method: 'Rule: on-the-books occupancy under 15%.' });
    if (ga && ga.connected && ga.daily && ga.daily.length >= 35) {
      var s = ga.daily.map(function (r) { return r.sessions; }), last7 = sum(s.slice(-7)), prior = sum(s.slice(-35, -7)) / 4;
      if (prior >= 20 && last7 < prior * 0.6) out.push({ key: 'traffic_drop', severity: 'medium', title: 'Website traffic fell', fact: last7 + ' sessions in the last 7 days vs ' + round(prior) + ' per week in the 4 weeks before.', method: 'Rule: below 60% of the previous 4-week average (needs 20+ weekly sessions).' });
    } else notes.push('Traffic check needs GA4 reporting with 5 weeks of data.');
    return { items: out, notes: notes };
  }

  // ------------------------------------------------------------ strategic recommendations ------------------------------------------------------------
  function conf(n) { return n >= 30 ? 'high' : n >= 10 ? 'medium' : 'low'; }
  function score(impact, feas) { return impact * feas; }
  function inr(v) { return '₹' + Math.round(v || 0).toLocaleString('en-IN'); }
  /**
   * Evidence-based recommendations. Each one separates FACTS (from the ledger) from the HYPOTHESIS (why) and gives a measurable follow-up.
   * impact/feasibility are 1–5; priority = impact × feasibility.
   */
  function recommendations(data, ctx) {
    ctx = ctx || {};
    var Mx = M(), today = data.today || iso(Date.now()), from = add(today, -179), to = today, recs = [];
    var m = Mx.compute(data, from, to), cp = channelProfit(data, from, to), totalRev = sum(cp, function (r) { return r.revenue; });
    var otaRows = cp.filter(function (r) { return !r.direct; }), otaRev = sum(otaRows, function (r) { return r.revenue; }), otaComm = sum(otaRows, function (r) { return r.commission; });
    var stays = sum(cp, function (r) { return r.stays; });
    // 1. Commission data missing
    var unknownCh = (data.channels || []).filter(function (c) { return c.kind === 'ota' && !has(c.commission_pct) && (data.bookings || []).some(function (b) { return b.channel === c.channel && !has(b.commission) && b.status !== 'void'; }); });
    if (unknownCh.length) recs.push({ key: 'set_commission', issue: 'Channel profitability is unknown for ' + unknownCh.map(function (c) { return c.channel; }).join(', '), facts: ['Bookings from these channels have no recorded commission and no rate is set.'], hypothesis: 'Without commission, OTA bookings look as profitable as direct ones.', kpis: ['Commission coverage', 'Contribution margin by channel'], impact: { score: 3, value: null, basis: 'Enables every channel decision; no direct ₹ effect.' }, feasibility: 5, confidence: 'high', action: 'Enter your real commission % per OTA in Settings → Channel rates (from your extranet contracts).', owner: 'Apoorv', follow_up: { metric: 'Bookings with unknown commission', baseline: unknownCh.length + ' channels', review_days: 7 } });
    // 2. OTA dependence
    if (totalRev > 0 && otaRev / totalRev > 0.5 && otaComm > 0) {
      var shift = 0.1, saving = otaRev * shift * (otaComm / otaRev);
      recs.push({ key: 'grow_direct', issue: 'Most revenue comes through OTAs', facts: [Math.round(otaRev / totalRev * 100) + '% of the last 180 days\' accommodation revenue came via OTAs (' + inr(otaRev) + ').', 'Commission on it: ' + inr(otaComm) + ' (' + Math.round(otaComm / otaRev * 100) + '%).'], hypothesis: 'Repeat and referred guests may be rebooking through OTAs out of habit; a direct-booking benefit could move some of them.', kpis: ['Direct booking share', 'Commission cost'], impact: { score: saving > 20000 ? 4 : 3, value: saving, basis: 'If 10% of OTA revenue moved to direct at the same price: ' + inr(saving) + ' less commission per 180 days.' }, feasibility: 4, confidence: conf(stays), action: 'Offer returning guests a direct-booking perk (e.g. early check-in or the Mahakal game coupon), put the WhatsApp number on OTA confirmations where allowed, and follow up past guests via the Journal list.', owner: 'Apoorv', follow_up: { metric: 'Direct share of revenue', baseline: Math.round((1 - otaRev / totalRev) * 100) + '%', review_days: 60 } });
    }
    // 3. Receivables
    var ag = receivablesAging(data), overdue = ag.list.filter(function (x) { return x.age >= 0; });
    if (overdue.length) { var amt = sum(overdue, function (x) { return x.due; }); recs.push({ key: 'collect', issue: 'Money still due from stays that have started', facts: [overdue.length + ' booking(s) owe ' + inr(amt) + ' (oldest ' + overdue[0].age + ' days after check-in).'], hypothesis: 'Some may be paid but not recorded; others may be genuinely outstanding.', kpis: ['Outstanding receivables', 'Cash collected'], impact: { score: amt > 20000 ? 5 : 4, value: amt, basis: 'Cash, not profit: the amount outstanding.' }, feasibility: 5, confidence: 'high', action: 'Check each against UPI/bank statements; record payments that arrived, and send a polite WhatsApp reminder for the rest.', owner: 'Apoorv', follow_up: { metric: 'Overdue receivables', baseline: inr(amt), review_days: 7 } }); }
    // 4. Weekend pricing
    var w = Mx.weekendSplit(data, add(today, -179), add(today, -1));
    if (w.weekend.occupied >= 8 && w.weekday.occupied >= 8 && w.weekend.occupancy - w.weekday.occupancy > 0.15 && w.weekend.adr / w.weekday.adr - 1 < 0.1) {
      var gain = w.weekend.revenue * 0.05;
      recs.push({ key: 'weekend_rate', issue: 'Weekends fill up but are priced like weekdays', facts: ['Weekend occupancy ' + Math.round(w.weekend.occupancy * 100) + '% vs weekday ' + Math.round(w.weekday.occupancy * 100) + '%.', 'Weekend ADR only ' + Math.round((w.weekend.adr / w.weekday.adr - 1) * 100) + '% above weekday.'], hypothesis: 'Weekend demand (Fri/Sat) may support a higher rate without losing bookings.', kpis: ['Weekend ADR', 'Weekend occupancy'], impact: { score: 3, value: gain, basis: '+5% on weekend nights at the same occupancy: ' + inr(gain) + ' per 180 days.' }, feasibility: 4, confidence: conf(w.weekend.occupied), action: 'Test a 5% weekend premium on one villa for 6 weeks, then compare weekend occupancy and ADR. (The portal never changes prices itself.)', owner: 'Apoorv', follow_up: { metric: 'Weekend ADR and occupancy', baseline: inr(w.weekend.adr) + ' · ' + Math.round(w.weekend.occupancy * 100) + '%', review_days: 42 } });
    }
    // 5. Underperforming villa
    var bp = Mx.byProperty(data, add(today, -89), add(today, -1)), occs = bp.filter(function (p) { return p.available >= 30; });
    if (occs.length >= 3) { var avg = sum(occs, function (p) { return p.occupancy || 0; }) / occs.length; occs.forEach(function (p) {
      if (avg > 0.2 && (p.occupancy || 0) < avg - 0.15) recs.push({ key: 'villa_' + p.property_id, issue: p.name + ' is booked far less than the other villas', facts: [p.name + ' ' + Math.round((p.occupancy || 0) * 100) + '% occupancy in the last 90 days vs ' + Math.round(avg * 100) + '% portfolio average.'], hypothesis: 'Listing photos, price or visibility on OTAs may be weaker for this villa, or it suits fewer group sizes.', kpis: ['Villa occupancy', 'Villa RevPAR'], impact: { score: 3, value: (avg - (p.occupancy || 0)) * p.available * (p.adr || m.adr || 0), basis: 'Closing half the gap would add about ' + inr((avg - (p.occupancy || 0)) * p.available * (p.adr || m.adr || 0) / 2) + ' per 90 days.' }, feasibility: 3, confidence: conf(p.available), action: 'Review this villa\'s OTA listing (photos, title, price vs the others) and feature it in WhatsApp replies for matching group sizes.', owner: 'Apoorv', follow_up: { metric: p.name + ' occupancy', baseline: Math.round((p.occupancy || 0) * 100) + '%', review_days: 60 } });
    }); }
    // 6. Cancellations by channel
    cp.forEach(function (r) { if (r.bookings_made >= 4 && r.cancellation_rate > 0.25) recs.push({ key: 'cancel_' + r.channel, issue: 'High cancellations on ' + r.channel, facts: [Math.round(r.cancellation_rate * 100) + '% of ' + r.bookings_made + ' bookings made via ' + r.channel + ' were cancelled.'], hypothesis: 'Free-cancellation terms on this channel may attract speculative bookings.', kpis: ['Cancellation rate', 'Cancellation leakage'], impact: { score: 3, value: null, basis: 'See Revenue Intelligence → cancellation leakage for the value lost.' }, feasibility: 3, confidence: conf(r.bookings_made), action: 'Consider a partially non-refundable rate or a shorter free-cancellation window on ' + r.channel + ' for peak dates.', owner: 'Apoorv', follow_up: { metric: r.channel + ' cancellation rate', baseline: Math.round(r.cancellation_rate * 100) + '%', review_days: 90 } }); });
    // 7. Upcoming events with thin bookings
    allEvents(ctx.events).filter(function (e) { return e.start > today && e.start <= add(today, 120); }).forEach(function (e) {
      var ot = Mx.compute(data, e.start, e.end);
      if (ot.available_nights && ot.occupancy < 0.5) recs.push({ key: 'event_' + e.id, issue: e.name + ' (' + e.start + ') is ' + Math.round(ot.occupancy * 100) + '% booked', facts: [ot.occupied_nights + ' of ' + ot.available_nights + ' villa-nights booked for ' + e.start + ' → ' + e.end + '.', 'Source of the date: ' + e.source + '.'], hypothesis: 'Festival demand in Ujjain usually arrives; whether it arrives at your current rates is unknown until you have a past event to compare.', kpis: ['Event-window occupancy', 'Event-window ADR'], impact: { score: e.kind === 'mega' ? 5 : 3, value: null, basis: 'Depends on event demand; compare with the event table in Trends after the event.' }, feasibility: 4, confidence: 'low', action: 'Decide event pricing and minimum stay now, update OTA calendars, and publish a Journal guide for the event to capture search demand.', owner: 'Apoorv', follow_up: { metric: 'Event-window occupancy', baseline: Math.round(ot.occupancy * 100) + '%', review_days: Math.max(7, Math.round((t(e.start) - t(today)) / DAY)) } });
    });
    // 8. Data quality
    var high = (ctx.exceptions || []).filter(function (e) { return e.status === 'open' && e.severity === 'high'; });
    if (high.length) recs.push({ key: 'data_quality', issue: high.length + ' high-priority data issues', facts: ['Open: ' + high.map(function (e) { return e.type.replace(/_/g, ' '); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') + '.'], hypothesis: 'Every figure above is only as good as the ledger.', kpis: ['Open exceptions'], impact: { score: 4, value: null, basis: 'Accuracy of every metric.' }, feasibility: 5, confidence: 'high', action: 'Resolve them in Booking management → Reconciliation center.', owner: 'Apoorv', follow_up: { metric: 'Open high exceptions', baseline: String(high.length), review_days: 7 } });
    // 9. Repeat guests
    var guests = {}; (data.bookings || []).forEach(function (b) { if (b.status === 'confirmed' && b.guest_id) guests[b.guest_id] = (guests[b.guest_id] || 0) + 1; });
    var gN = Object.keys(guests).length, rep = Object.keys(guests).filter(function (k) { return guests[k] > 1; }).length;
    if (gN >= 10 && rep / gN < 0.15) recs.push({ key: 'repeat', issue: 'Few guests come back', facts: [rep + ' of ' + gN + ' guests (' + Math.round(rep / gN * 100) + '%) have stayed more than once.'], hypothesis: 'Pilgrim families often return for festivals; a timely reminder may bring them back directly.', kpis: ['Repeat guest share', 'Direct booking share'], impact: { score: 3, value: null, basis: 'Each returning direct booking saves the OTA commission.' }, feasibility: 4, confidence: conf(gN), action: 'Use the Journal email list and WhatsApp to invite past guests before Mahashivratri, Shravan and Simhastha 2028.', owner: 'Apoorv', follow_up: { metric: 'Repeat guest share', baseline: Math.round(rep / gN * 100) + '%', review_days: 120 } });
    recs.forEach(function (r) { r.priority = score(r.impact.score, r.feasibility); r.quadrant = r.impact.score >= 3 ? (r.feasibility >= 3 ? 'Do now' : 'Plan') : (r.feasibility >= 3 ? 'Quick win' : 'Later'); });
    return recs.sort(function (a, b) { return b.priority - a.priority; });
  }

  // ------------------------------------------------------------ reports ------------------------------------------------------------
  var REPORT_TYPES = { daily: 'Daily Founder Brief', weekly: 'Weekly Business Review', monthly: 'Monthly MIS', quarterly: 'Quarterly Strategy Review', annual: 'Annual Performance Report' };
  /** Which period a report of this type covers when generated on `today` (always a complete, past period). */
  function reportPeriod(type, today) {
    var y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7));
    function pad(n) { return ('0' + n).slice(-2); }
    function monthEnd(yy, mm) { return iso(Date.UTC(yy, mm, 0)); }
    if (type === 'daily') { var d = add(today, -1); return { from: d, to: d, key: d }; }
    if (type === 'weekly') { var w = (new Date(t(today)).getUTCDay() + 6) % 7, mon = add(today, -w - 7); return { from: mon, to: add(mon, 6), key: mon }; }
    if (type === 'monthly') { var pm = mo === 1 ? 12 : mo - 1, py = mo === 1 ? y - 1 : y; return { from: py + '-' + pad(pm) + '-01', to: monthEnd(py, pm), key: py + '-' + pad(pm) }; }
    if (type === 'quarterly') { var q = Math.floor((mo - 1) / 3), qy = q === 0 ? y - 1 : y, qq = q === 0 ? 4 : q; return { from: qy + '-' + pad(qq * 3 - 2) + '-01', to: monthEnd(qy, qq * 3), key: qy + '-Q' + qq }; }
    return { from: (y - 1) + '-01-01', to: (y - 1) + '-12-31', key: String(y - 1) };
  }
  /** Whether a scheduled report of this type is due on `today` (IST date). */
  function reportDue(type, today) {
    var d = Number(today.slice(8, 10)), mo = Number(today.slice(5, 7)), wd = new Date(t(today)).getUTCDay();
    return type === 'daily' || (type === 'weekly' && wd === 1) || (type === 'monthly' && d === 1) || (type === 'quarterly' && d === 1 && [1, 4, 7, 10].indexOf(mo) >= 0) || (type === 'annual' && d === 1 && mo === 1);
  }
  function buildReport(type, data, period, extra) {
    extra = extra || {};
    var Mx = M(), from = period.from, to = period.to, cur = Mx.compute(data, from, to), pr = Mx.previous(from, to), prev = Mx.compute(data, pr.from, pr.to);
    var ly = Mx.lastYear(from, to), lyM = Mx.compute(data, ly.from, ly.to);
    function pctv(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }
    function chg(a, b, kind) { if (a == null || b == null) return ''; var d = a - b; if (kind === 'pct') return (d >= 0 ? '+' : '') + (d * 100).toFixed(1) + ' pts'; return b ? (d >= 0 ? '+' : '') + Math.round(d / Math.abs(b) * 100) + '%' : ''; }
    var kpi = [['Gross booking value', inr(cur.gross_booking_value), chg(cur.gross_booking_value, prev.gross_booking_value), chg(cur.gross_booking_value, lyM.gross_booking_value)],
      ['Net accommodation revenue', inr(cur.net_accommodation_revenue), chg(cur.net_accommodation_revenue, prev.net_accommodation_revenue), chg(cur.net_accommodation_revenue, lyM.net_accommodation_revenue)],
      ['Confirmed bookings made', String(cur.confirmed_bookings), chg(cur.confirmed_bookings, prev.confirmed_bookings), chg(cur.confirmed_bookings, lyM.confirmed_bookings)],
      ['Occupancy', pctv(cur.occupancy), chg(cur.occupancy, prev.occupancy, 'pct'), chg(cur.occupancy, lyM.occupancy, 'pct')],
      ['ADR', cur.adr == null ? '—' : inr(cur.adr), chg(cur.adr, prev.adr), chg(cur.adr, lyM.adr)], ['RevPAR', cur.revpar == null ? '—' : inr(cur.revpar), chg(cur.revpar, prev.revpar), chg(cur.revpar, lyM.revpar)],
      ['Cancellation rate', pctv(cur.cancellation_rate), chg(cur.cancellation_rate, prev.cancellation_rate, 'pct'), ''], ['Cash collected', inr(cur.cash_collected), chg(cur.cash_collected, prev.cash_collected), ''],
      ['Refunds', inr(cur.refunds), '', ''], ['Outstanding receivables (now)', inr(cur.outstanding_receivables), '', '']];
    var sections = [{ heading: 'Headline figures', table: { head: ['Metric', 'This period', 'vs previous', 'vs last year'], rows: kpi } }];
    var ch = channelProfit(data, from, to);
    sections.push({ heading: 'Channels (stay basis)', table: { head: ['Channel', 'Nights', 'Revenue', 'Commission', 'Contribution'], rows: ch.map(function (r) { return [r.channel, String(r.nights), inr(r.revenue), r.commission_unknown ? 'unknown (' + r.commission_unknown + ')' : inr(r.commission), r.contribution == null ? 'partial' : inr(r.contribution)]; }) } });
    if (type !== 'daily') {
      var bp = Mx.byProperty(data, from, to);
      sections.push({ heading: 'Villas', table: { head: ['Villa', 'Occupancy', 'ADR', 'RevPAR', 'Revenue'], rows: bp.map(function (p) { return [p.name, pctv(p.occupancy), p.adr == null ? '—' : inr(p.adr), p.revpar == null ? '—' : inr(p.revpar), inr(p.revenue)]; }) } });
      var dec = decompose(cur, prev);
      sections.push({ heading: 'Why revenue changed', bullets: dec.method === 'unavailable' ? [dec.note] : ['Change vs previous period: ' + inr(dec.change), 'From availability: ' + inr(dec.availability), 'From occupancy: ' + inr(dec.occupancy), 'From ADR (price): ' + inr(dec.adr), 'Method: ' + dec.method] });
      var fin = finance(data, from, to);
      sections.push({ heading: 'Financials', bullets: ['Recorded operating costs: ' + inr(fin.expenses_total) + (fin.expenses_estimate ? ' (incl. ' + inr(fin.expenses_estimate) + ' estimates)' : ''), 'Contribution margin: ' + (fin.contribution == null ? 'unavailable' : inr(fin.contribution)), 'Operating profit: ' + (fin.operating_profit == null ? 'unavailable' : inr(fin.operating_profit)), fin.status_note].filter(Boolean) });
    }
    var today = data.today || iso(Date.now()), fwd = Mx.compute(data, today, add(today, 29));
    sections.push({ heading: 'Looking ahead', bullets: ['Next 30 days on the books: ' + pctv(fwd.occupancy) + ' (' + fwd.occupied_nights + ' of ' + fwd.available_nights + ' villa-nights).'].concat(allEvents(extra.events).filter(function (e) { return e.start >= today && e.start <= add(today, 120); }).map(function (e) { return 'Upcoming: ' + e.name + ' from ' + e.start + ' (' + e.confidence + ').'; })) });
    var ex = (data.exceptions || []).filter(function (e) { return e.status === 'open'; });
    sections.push({ heading: 'Reconciliation', bullets: [ex.length + ' open data issues (' + ex.filter(function (e) { return e.severity === 'high'; }).length + ' high).'] });
    if (extra.ga && extra.ga.connected) sections.push({ heading: 'Website (GA4)', bullets: ['Sessions: ' + extra.ga.totals.sessions + ', users: ' + extra.ga.totals.totalUsers + ', engagement rate ' + pctv(extra.ga.totals.engagementRate) + '.', 'Booking-intent actions (WhatsApp, calls, enquiry forms): ' + extra.ga.intent + '.'] });
    if (type !== 'daily') { var fc = forecast(data, 'occupied', 30); sections.push({ heading: 'Forecast: next 30 days', bullets: fc.sufficient ? ['Expected ' + Math.round(fc.total) + ' villa-nights (80% range ' + Math.round(fc.total_lower) + '–' + Math.round(fc.total_upper) + '), method: ' + fc.method_label + '.'] : ['Not enough history for a reliable forecast: ' + fc.reason] }); }
    var recs = recommendations(data, { events: extra.events, exceptions: data.exceptions }).slice(0, type === 'daily' ? 3 : 6);
    sections.push({ heading: 'Recommended actions', bullets: recs.length ? recs.map(function (r) { return r.issue + ': ' + r.action; }) : ['Nothing urgent.'] });
    return { type: type, title: REPORT_TYPES[type], period: period, generated_at: extra.generated_at || new Date().toISOString(), data_freshness: extra.lastSync || '', sections: sections,
      definitions: ['occupancy', 'adr', 'revpar', 'net_accommodation_revenue', 'gross_booking_value', 'cash_collected'].map(function (k) { return Mx.DEFINITIONS[k].label + ': ' + Mx.DEFINITIONS[k].formula; }) };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /** Self-contained HTML (inline styles) for email, PDF and preview. */
  function reportHtml(r) {
    var g = '#0F3D2E', gold = '#B88A2C';
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(r.title) + '</title></head><body style="margin:0;background:#F5F7F5;font-family:Arial,Helvetica,sans-serif;color:#1C2421">' +
      '<div style="max-width:760px;margin:0 auto;padding:24px"><div style="background:' + g + ';color:#fff;border-radius:14px 14px 0 0;padding:20px 24px"><div style="font-size:11px;letter-spacing:2px;color:#E2C27A;font-weight:bold">AP VILLAS &amp; RESORTS · FOUNDER OS</div>' +
      '<div style="font:bold 24px Georgia,serif;margin-top:6px">' + esc(r.title) + '</div><div style="font-size:13px;opacity:.85;margin-top:4px">' + esc(r.period.from) + (r.period.to !== r.period.from ? ' to ' + esc(r.period.to) : '') + ' · generated ' + esc(String(r.generated_at).slice(0, 16).replace('T', ' ')) + ' · data synced ' + esc(String(r.data_freshness).slice(0, 16).replace('T', ' ') || 'unknown') + '</div></div>' +
      '<div style="background:#fff;border:1px solid #E3E9E5;border-top:0;border-radius:0 0 14px 14px;padding:8px 24px 20px">' +
      r.sections.map(function (s) {
        return '<h2 style="font:bold 16px Arial;color:' + g + ';border-bottom:2px solid ' + gold + ';padding-bottom:4px;margin:20px 0 10px">' + esc(s.heading) + '</h2>' +
          (s.table ? '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr>' + s.table.head.map(function (h, i) { return '<th style="text-align:' + (i ? 'right' : 'left') + ';padding:6px 8px;background:#F3F7F4;color:#55605B;font-size:11.5px">' + esc(h) + '</th>'; }).join('') + '</tr>' +
            (s.table.rows.length ? s.table.rows.map(function (row) { return '<tr>' + row.map(function (c, i) { return '<td style="padding:6px 8px;border-bottom:1px solid #EEF2EF;text-align:' + (i ? 'right' : 'left') + '">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + s.table.head.length + '" style="padding:8px;color:#6B756F">No data for this period.</td></tr>') + '</table>' : '') +
          (s.bullets ? '<ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.6">' + s.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' : '');
      }).join('') +
      '<h2 style="font:bold 13px Arial;color:#55605B;margin:22px 0 6px">Metric definitions</h2><ul style="margin:0;padding-left:18px;font-size:11.5px;color:#6B756F;line-height:1.5">' + r.definitions.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>' +
      '<p style="font-size:11px;color:#8A948F;margin-top:16px">Booking value, revenue and cash are different figures. Management estimates are marked as such. Generated automatically by the AP Villas Founder OS.</p></div></div></body></html>';
  }

  return {
    EVENTS: EVENTS, allEvents: allEvents, longWeekends: longWeekends, eventImpact: eventImpact,
    decompose: decompose, channelProfit: channelProfit, seasonality: seasonality, weekendByVilla: weekendByVilla, discountEffect: discountEffect, cancellationLeakage: cancellationLeakage, forwardOccupancy: forwardOccupancy,
    EXPENSE_CATEGORIES: EXPENSE_CATEGORIES, finance: finance, receivablesAging: receivablesAging, cashflow: cashflow, budgetVsActual: budgetVsActual, expensesIn: expensesIn,
    METHODS: METHODS, daily: daily, backtest: backtest, forecast: forecast, scenarioBase: scenarioBase, scenario: scenario, scenarioPresets: scenarioPresets,
    anomalies: anomalies, recommendations: recommendations, REPORT_TYPES: REPORT_TYPES, reportPeriod: reportPeriod, reportDue: reportDue, buildReport: buildReport, reportHtml: reportHtml,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FoInsights;
