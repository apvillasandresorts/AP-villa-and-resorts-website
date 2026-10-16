/**
 * AP Villas Founder OS · metric dictionary (one definition, used everywhere).
 * Runs in the browser (/founder/), in Node tests (tests/founder/) and is pasted into Apps Script as FoMetrics.gs
 * for scheduled reports, so the portal, the reports and the tests always agree.
 *
 * Inventory unit: the villa-night (each villa is rented whole, 1 unit per villa). Rooms are never mixed in.
 * Stay-date metrics (occupancy, ADR, RevPAR, revenue) spread each booking's accommodation revenue evenly over its nights.
 * Booking-date metrics (booking value, cancellations, lead time, channel mix) use the date the booking was made.
 * Dates are calendar dates in Asia/Kolkata written as YYYY-MM-DD, so there is no time-zone drift.
 */
var FoMetrics = (function () {
  var DAY = 86400000;
  var OCCUPYING = ['confirmed'];                 // statuses that use a villa-night
  var COUNTED = ['tentative', 'confirmed', 'cancelled', 'no_show'];   // real booking attempts ('void' = test/duplicate, excluded everywhere)

  var DEFINITIONS = {
    gross_booking_value: { label: 'Gross booking value', basis: 'booking date', formula: 'Sum of booking amounts (before discounts) for bookings made in the period, including ones later cancelled. Void records excluded.' },
    confirmed_booking_value: { label: 'Confirmed booking value', basis: 'booking date', formula: 'Booking amount − discount for bookings made in the period that are still confirmed.' },
    net_accommodation_revenue: { label: 'Net accommodation revenue', basis: 'stay date', formula: '(Booking amount − discount − taxes) of confirmed stays, spread evenly over their nights; only nights inside the period count. Cancellation fees kept are reported separately.' },
    revenue_after_commission: { label: 'Revenue after OTA commission', basis: 'stay date', formula: 'Net accommodation revenue − channel commission (recorded, or estimated from the channel rate you set) on the same nights.' },
    cash_collected: { label: 'Cash collected', basis: 'payment date', formula: 'Payments received in the period (not booking value, not revenue).' },
    refunds: { label: 'Refunds', basis: 'payment date', formula: 'Refunds paid out in the period.' },
    outstanding_receivables: { label: 'Outstanding receivables', basis: 'as of today', formula: 'For confirmed and no-show bookings: (amount − discount + kept fees) − payments + refunds, where positive.' },
    occupancy: { label: 'Occupancy', basis: 'stay date', formula: 'Occupied villa-nights ÷ available villa-nights (villas × days, minus maintenance/owner blocks).' },
    adr: { label: 'ADR', basis: 'stay date', formula: 'Net accommodation revenue ÷ occupied villa-nights.' },
    revpar: { label: 'RevPAR', basis: 'stay date', formula: 'Net accommodation revenue ÷ available villa-nights (= occupancy × ADR).' },
    alos: { label: 'Average length of stay', basis: 'arrival date', formula: 'Nights ÷ confirmed arrivals in the period.' },
    lead_time: { label: 'Booking lead time', basis: 'booking date', formula: 'Days from booking to check-in. Only bookings with a real booking date; e-check-in dates are a proxy and shown separately.' },
    avg_booking_value: { label: 'Average booking value', basis: 'booking date', formula: 'Gross booking value ÷ bookings made.' },
    confirmed_bookings: { label: 'Confirmed bookings', basis: 'booking date', formula: 'Bookings made in the period whose status is confirmed (not tentative, cancelled, no-show or void).' },
    cancellation_rate: { label: 'Cancellation rate', basis: 'booking date', formula: 'Cancelled ÷ bookings made in the period (void excluded).' },
    no_show_rate: { label: 'No-show rate', basis: 'booking date', formula: 'No-shows ÷ bookings made in the period.' },
    commission_cost: { label: 'Channel commission', basis: 'booking date', formula: 'Commission recorded on bookings made in the period; where blank, channel rate × amount (marked estimated); unknown if neither exists.' },
    direct_share: { label: 'Direct booking share', basis: 'booking date', formula: 'Direct (WhatsApp, phone, website, walk-in) bookings ÷ all bookings made, by count and by value.' },
    contribution_margin: { label: 'Contribution margin', basis: 'stay date', formula: 'Revenue after commission − payment fees − variable costs. Unavailable until costs are recorded.' },
    website_conversion: { label: 'Website conversion rate', basis: 'GA4', formula: 'Booking-intent events ÷ sessions, from Google Analytics. Unavailable until GA4 reporting is connected.' },
  };

  function t(d) { return Date.parse(d + 'T00:00:00Z'); }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(d, n) { return iso(t(d) + n * DAY); }
  function days(from, to) { return Math.round((t(to) - t(from)) / DAY) + 1; }   // inclusive
  function num(v) { var n = Number(String(v == null ? '' : v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : 0; }
  function has(v) { var s = String(v == null ? '' : v).replace(/[₹,\s]/g, ''); return s !== '' && isFinite(Number(s)); }
  function dateOf(ts) { return String(ts || '').slice(0, 10); }   // timestamps are stored in IST, so the first 10 chars are the IST date
  function weekday(d) { return new Date(t(d)).getUTCDay(); }      // 0 Sun … 6 Sat
  function isDirect(ch, channels) {
    var c = (channels || []).filter(function (x) { return x.channel === ch; })[0];
    if (c) return c.kind === 'direct';
    return /^direct|walk-in/i.test(ch || '');
  }
  function netAmount(b) { return Math.max(0, num(b.gross_amount) - num(b.discount) - num(b.taxes)); }

  /** Commission for one booking: {amount, basis: 'recorded'|'estimated'|'direct'|'unknown'} */
  function commissionOf(b, channels) {
    if (has(b.commission)) return { amount: num(b.commission), basis: 'recorded' };
    if (isDirect(b.channel, channels)) return { amount: 0, basis: 'direct' };
    var c = (channels || []).filter(function (x) { return x.channel === b.channel; })[0];
    if (c && has(c.commission_pct) && has(b.gross_amount)) return { amount: Math.round(num(b.gross_amount) * num(c.commission_pct)) / 100, basis: 'estimated' };
    return { amount: 0, basis: 'unknown' };
  }

  function paymentsBy(payments) {
    var o = {};
    (payments || []).forEach(function (p) {
      var x = o[p.booking_id] || (o[p.booking_id] = { paid: 0, refunded: 0 });
      if (p.type === 'refund') x.refunded += num(p.amount); else x.paid += num(p.amount);
    });
    return o;
  }

  /** Bookings after filters (property, channel). Void records never count. */
  function scope(data, f) {
    f = f || {};
    return (data.bookings || []).filter(function (b) {
      if (b.status === 'void') return false;
      if (f.property && f.property !== 'all' && b.property_id !== f.property) return false;
      if (f.channel && f.channel !== 'all' && b.channel !== f.channel) return false;
      return true;
    });
  }
  function activeProps(data, f) {
    return (data.properties || []).filter(function (p) { return String(p.active) !== 'no' && (!f || !f.property || f.property === 'all' || p.property_id === f.property); });
  }

  /** Villa-nights available in [from, to]: villas × days − blocked nights. */
  function available(data, from, to, f) {
    var props = activeProps(data, f), total = 0;
    props.forEach(function (p) {
      var units = num(p.units) || 1, n = days(from, to) * units;
      (data.blocks || []).forEach(function (bl) {
        if (bl.property_id !== p.property_id) return;
        var s = bl.start > from ? bl.start : from, e = addDays(bl.end, -1) < to ? addDays(bl.end, -1) : to;   // a block's end date is the first free night
        if (e >= s) n -= days(s, e);
      });
      total += Math.max(0, n);
    });
    return total;
  }

  /** Night-by-night stay ledger inside [from, to]: [{date, booking, revenue, commission}] */
  function nights(data, from, to, f) {
    var out = [];
    scope(data, f).forEach(function (b) {
      if (OCCUPYING.indexOf(b.status) < 0 || !b.property_id || !b.checkin || !b.checkout) return;
      var n = Math.round((t(b.checkout) - t(b.checkin)) / DAY); if (n <= 0) return;
      var per = netAmount(b) / n, com = commissionOf(b, data.channels), perC = com.amount / n;
      for (var i = 0; i < n; i++) {
        var d = addDays(b.checkin, i);
        if (d >= from && d <= to) out.push({ date: d, booking: b, revenue: per, commission: perC, hasAmount: has(b.gross_amount) });
      }
    });
    return out;
  }

  function compute(data, from, to, f) {
    f = f || {};
    var today = data.today || iso(Date.now());
    var all = scope(data, f), pay = paymentsBy(data.payments);
    var avail = available(data, from, to, f);
    var ns = nights(data, from, to, f);
    var occ = ns.length, rev = 0, com = 0, missingAmtNights = 0;
    ns.forEach(function (x) { rev += x.revenue; com += x.commission; if (!x.hasAmount) missingAmtNights++; });

    var made = all.filter(function (b) { var d = dateOf(b.created_at); return d && d >= from && d <= to; });
    var counted = made.filter(function (b) { return COUNTED.indexOf(b.status) >= 0; });
    var gbv = 0, cbv = 0, cancelled = 0, noshow = 0, directN = 0, directV = 0, comm = 0, commBasis = { recorded: 0, estimated: 0, direct: 0, unknown: 0 };
    var leads = [], proxyLeads = [];
    counted.forEach(function (b) {
      gbv += num(b.gross_amount);
      if (b.status === 'confirmed') cbv += num(b.gross_amount) - num(b.discount);
      if (b.status === 'cancelled') cancelled++;
      if (b.status === 'no_show') noshow++;
      if (isDirect(b.channel, data.channels)) { directN++; directV += num(b.gross_amount); }
      var c = commissionOf(b, data.channels); comm += c.amount; commBasis[c.basis]++;
      var lt = Math.round((t(b.checkin) - t(dateOf(b.created_at))) / DAY);
      if (isFinite(lt) && lt >= 0) (/proxy/.test(b.created_basis || '') ? proxyLeads : leads).push(lt);
    });

    var arrivals = all.filter(function (b) { return OCCUPYING.indexOf(b.status) >= 0 && b.checkin >= from && b.checkin <= to; });
    var arrNights = arrivals.reduce(function (s, b) { return s + num(b.nights || Math.round((t(b.checkout) - t(b.checkin)) / DAY)); }, 0);

    var cash = 0, refunds = 0;
    var inScope = {}; all.forEach(function (b) { inScope[b.booking_id] = true; });
    (data.payments || []).forEach(function (p) {
      if (!inScope[p.booking_id] || !p.date || p.date < from || p.date > to) return;
      if (p.type === 'refund') refunds += num(p.amount); else cash += num(p.amount);
    });

    var receivable = 0, receivableN = 0;
    all.forEach(function (b) {
      if (['confirmed', 'no_show'].indexOf(b.status) < 0 || !has(b.gross_amount)) return;
      var x = pay[b.booking_id] || { paid: 0, refunded: 0 };
      var due = num(b.gross_amount) - num(b.discount) + num(b.retained_amount) - x.paid + x.refunded;
      if (due > 0.5) { receivable += due; receivableN++; }
    });

    var retained = all.filter(function (b) { return ['cancelled', 'no_show'].indexOf(b.status) >= 0 && b.checkin >= from && b.checkin <= to; })
      .reduce(function (s, b) { return s + num(b.retained_amount); }, 0);

    function avg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
    function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

    return {
      from: from, to: to, days: days(from, to),
      available_nights: avail, occupied_nights: occ,
      occupancy: avail ? occ / avail : null,
      net_accommodation_revenue: rev,
      revenue_after_commission: rev - com,
      adr: occ ? rev / occ : null,
      revpar: avail ? rev / avail : null,
      arrivals: arrivals.length, alos: arrivals.length ? arrNights / arrivals.length : null,
      bookings_made: counted.length,
      confirmed_bookings: counted.filter(function (b) { return b.status === 'confirmed'; }).length,
      gross_booking_value: gbv, confirmed_booking_value: cbv,
      avg_booking_value: counted.length ? gbv / counted.length : null,
      cancellation_rate: counted.length ? cancelled / counted.length : null, cancelled: cancelled,
      no_show_rate: counted.length ? noshow / counted.length : null,
      lead_time_avg: avg(leads), lead_time_median: median(leads), lead_time_n: leads.length,
      lead_time_proxy_avg: avg(proxyLeads), lead_time_proxy_n: proxyLeads.length,
      direct_share_count: counted.length ? directN / counted.length : null,
      direct_share_value: gbv ? directV / gbv : null,
      commission_cost: comm, commission_basis: commBasis,
      cash_collected: cash, refunds: refunds,
      outstanding_receivables: receivable, outstanding_bookings: receivableN,
      retained_fees: retained,
      contribution_margin: null, contribution_margin_note: 'Needs operating costs (Financial Intelligence, phase 8).',
      website_conversion: null, website_conversion_note: 'Needs GA4 reporting connection (phase 6).',
      quality: { nights_without_amount: missingAmtNights, unknown_property: all.filter(function (b) { return !b.property_id; }).length },
    };
  }

  /** Previous period of the same length, and the same dates one year earlier. */
  function previous(from, to) { var n = days(from, to); return { from: addDays(from, -n), to: addDays(from, -1) }; }
  function lastYear(from, to) {
    function y(d) { var p = d.split('-'); var s = (Number(p[0]) - 1) + '-' + p[1] + '-' + p[2]; return p[1] === '02' && p[2] === '29' ? (Number(p[0]) - 1) + '-02-28' : s; }
    return { from: y(from), to: y(to) };
  }

  /** Named date ranges (IST calendar). */
  function range(name, today) {
    var d = today, p = d.split('-'), y = Number(p[0]), m = Number(p[1]);
    function pad(n) { return ('0' + n).slice(-2); }
    function monthEnd(yy, mm) { return iso(Date.UTC(yy, mm, 0)); }
    switch (name) {
      case 'today': return { from: d, to: d };
      case 'yesterday': return { from: addDays(d, -1), to: addDays(d, -1) };
      case 'last7': return { from: addDays(d, -6), to: d };
      case 'last30': return { from: addDays(d, -29), to: d };
      case 'this_month': return { from: y + '-' + pad(m) + '-01', to: d };
      case 'prev_month': { var pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y; return { from: py + '-' + pad(pm) + '-01', to: monthEnd(py, pm) }; }
      case 'qtd': { var qm = Math.floor((m - 1) / 3) * 3 + 1; return { from: y + '-' + pad(qm) + '-01', to: d }; }
      case 'ytd': return { from: y + '-01-01', to: d };
      case 'last12m': return { from: addDays(lastYear(d, d).from, 1), to: d };
      case 'next30': return { from: d, to: addDays(d, 29) };
      case 'next90': return { from: d, to: addDays(d, 89) };
      default: return { from: addDays(d, -29), to: d };
    }
  }

  /** Bucket key for a date: 'day' | 'week' (Monday start) | 'month' | 'quarter' | 'year' */
  function bucket(d, g) {
    if (g === 'day') return d;
    if (g === 'week') { var w = (weekday(d) + 6) % 7; return addDays(d, -w); }
    if (g === 'month') return d.slice(0, 7);
    if (g === 'quarter') return d.slice(0, 4) + '-Q' + (Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1);
    return d.slice(0, 4);
  }
  function bucketList(from, to, g) {
    var out = [], seen = {};
    for (var d = from; d <= to; d = addDays(d, 1)) { var k = bucket(d, g); if (!seen[k]) { seen[k] = 1; out.push(k); } }
    return out;
  }

  /** Time series for charts. kind: 'stay' (revenue, occupied/available nights, adr, occupancy) or 'made' (bookings, value, cancelled). */
  function series(data, from, to, g, f) {
    var keys = bucketList(from, to, g), o = {};
    keys.forEach(function (k) { o[k] = { key: k, revenue: 0, occupied: 0, available: 0, bookings: 0, value: 0, cancelled: 0, direct: 0, ota: 0, other: 0 }; });
    for (var d = from; d <= to; d = addDays(d, 1)) o[bucket(d, g)].available += available(data, d, d, f);
    nights(data, from, to, f).forEach(function (x) { var r = o[bucket(x.date, g)]; r.revenue += x.revenue; r.occupied++; });
    scope(data, f).forEach(function (b) {
      var d = dateOf(b.created_at); if (!d || d < from || d > to || COUNTED.indexOf(b.status) < 0) return;
      var r = o[bucket(d, g)]; r.bookings++; r.value += num(b.gross_amount); if (b.status === 'cancelled') r.cancelled++;
      var kind = isDirect(b.channel, data.channels) ? 'direct' : /^(Booking\.com|Airbnb|MakeMyTrip|Goibibo|Agoda)$/.test(b.channel) ? 'ota' : 'other';
      r[kind]++;
    });
    return keys.map(function (k) { var r = o[k]; r.occupancy = r.available ? r.occupied / r.available : null; r.adr = r.occupied ? r.revenue / r.occupied : null; return r; });
  }

  /** Breakdown of bookings made in the period by a field (channel, property_id, acquisition_source…). */
  function breakdown(data, from, to, field, f) {
    var o = {};
    scope(data, f).forEach(function (b) {
      var d = dateOf(b.created_at); if (!d || d < from || d > to || COUNTED.indexOf(b.status) < 0) return;
      var k = b[field] || '(not recorded)', r = o[k] || (o[k] = { key: k, bookings: 0, value: 0, cancelled: 0, nights: 0, commission: 0, commission_unknown: 0 });
      r.bookings++; r.value += num(b.gross_amount); r.nights += num(b.nights); if (b.status === 'cancelled') r.cancelled++;
      var c = commissionOf(b, data.channels); r.commission += c.amount; if (c.basis === 'unknown') r.commission_unknown++;
    });
    return Object.keys(o).map(function (k) { return o[k]; }).sort(function (a, b) { return b.value - a.value || b.bookings - a.bookings; });
  }

  /** Stay-basis performance per villa. */
  function byProperty(data, from, to) {
    return activeProps(data, {}).map(function (p) {
      var m = compute(data, from, to, { property: p.property_id });
      return { property_id: p.property_id, name: p.name, available: m.available_nights, occupied: m.occupied_nights, occupancy: m.occupancy, revenue: m.net_accommodation_revenue, adr: m.adr, revpar: m.revpar, arrivals: m.arrivals };
    });
  }

  /** Histogram helper: values into labelled bins [[label, min, max], …]. */
  function histogram(values, bins) {
    return bins.map(function (b) { return { label: b[0], count: values.filter(function (v) { return v >= b[1] && v <= b[2]; }).length }; });
  }
  function leadTimes(data, from, to, f) {
    var out = { real: [], proxy: [] };
    scope(data, f).forEach(function (b) {
      var d = dateOf(b.created_at); if (!d || d < from || d > to || COUNTED.indexOf(b.status) < 0) return;
      var lt = Math.round((t(b.checkin) - t(d)) / DAY); if (!(lt >= 0)) return;
      (/proxy/.test(b.created_basis || '') ? out.proxy : out.real).push(lt);
    });
    return out;
  }
  function stayLengths(data, from, to, f) {
    return scope(data, f).filter(function (b) { return OCCUPYING.indexOf(b.status) >= 0 && b.checkin >= from && b.checkin <= to; }).map(function (b) { return num(b.nights); });
  }
  /** Weekend = Friday and Saturday nights. */
  function weekendSplit(data, from, to, f) {
    var r = { weekend: { occupied: 0, available: 0, revenue: 0 }, weekday: { occupied: 0, available: 0, revenue: 0 } };
    for (var d = from; d <= to; d = addDays(d, 1)) { var k = [5, 6].indexOf(weekday(d)) >= 0 ? 'weekend' : 'weekday'; r[k].available += available(data, d, d, f); }
    nights(data, from, to, f).forEach(function (x) { var k = [5, 6].indexOf(weekday(x.date)) >= 0 ? 'weekend' : 'weekday'; r[k].occupied++; r[k].revenue += x.revenue; });
    ['weekend', 'weekday'].forEach(function (k) { var x = r[k]; x.occupancy = x.available ? x.occupied / x.available : null; x.adr = x.occupied ? x.revenue / x.occupied : null; });
    return r;
  }
  function change(cur, prev) {
    if (cur == null || prev == null) return null;
    return { abs: cur - prev, pct: prev ? (cur - prev) / Math.abs(prev) : null };
  }

  return {
    DEFINITIONS: DEFINITIONS, OCCUPYING: OCCUPYING, COUNTED: COUNTED,
    compute: compute, previous: previous, lastYear: lastYear, range: range, series: series, breakdown: breakdown, byProperty: byProperty,
    nights: nights, available: available, commissionOf: commissionOf, paymentsBy: paymentsBy, isDirect: isDirect, netAmount: netAmount,
    histogram: histogram, leadTimes: leadTimes, stayLengths: stayLengths, weekendSplit: weekendSplit, change: change,
    addDays: addDays, days: days, bucket: bucket, bucketList: bucketList, num: num, has: has, dateOf: dateOf,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FoMetrics;
