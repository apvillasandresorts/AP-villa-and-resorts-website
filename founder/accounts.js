/**
 * AP Villas Founder OS · Accounts: monthly ledger, profit & loss, month-end balance sheet and a GST summary for the CA.
 * Pure functions over the data bundle (browser + Node tests). Management accounts from the Founder OS records, not audited books:
 * every figure says where it comes from, estimates are labelled, and GST rates are settings to verify with a chartered accountant.
 */
var FoAccounts = (function () {
  'use strict';
  function M() { return typeof FoMetrics !== 'undefined' ? FoMetrics : (typeof require !== 'undefined' ? require('./metrics.js') : null); }
  function I() { return typeof FoInsights !== 'undefined' ? FoInsights : (typeof require !== 'undefined' ? require('./insights.js') : null); }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(/[₹,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function has(v) { var s = String(v == null ? '' : v).replace(/[₹,\s%]/g, ''); return s !== '' && isFinite(Number(s)); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function monthRange(month) { var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)), last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return { from: month + '-01', to: month + '-' + (last < 10 ? '0' : '') + last }; }

  /** Accounting settings (Settings → Accounts). GST defaults follow the accommodation slabs; confirm with your CA. */
  var DEFAULTS = {
    gst_registered: false,            // registered businesses charge GST on direct bookings
    gstin: '',
    prices_include_gst: true,         // the amounts in the ledger already include GST (typical for OTA and WhatsApp prices)
    slab_limit: 7500,                 // per room / unit per night
    rate_low: 0.05,                   // tariff up to slab_limit
    rate_high: 0.18,                  // tariff above slab_limit
    eco_channels: ['Airbnb', 'Booking.com', 'MakeMyTrip', 'Goibibo', 'Agoda'],   // bookings through these platforms: the CA decides who pays (Section 9(5))
    sac: '996311', state: 'Madhya Pradesh',
  };
  function settings(data) {
    var raw = {}; try { var s = data && data.settings && data.settings.accounts; raw = typeof s === 'string' ? JSON.parse(s || '{}') : (s || {}); } catch (e) { raw = {}; }
    var o = JSON.parse(JSON.stringify(DEFAULTS)); Object.keys(raw).forEach(function (k) { if (raw[k] !== '' && raw[k] != null) o[k] = raw[k]; }); return o;
  }
  function propName(data, id) { var p = (data.properties || []).filter(function (x) { return x.property_id === id; })[0]; return p ? p.name : (id === 'all' ? 'All villas' : id || ''); }
  function feePct(data, channel) { var c = (data.channels || []).filter(function (x) { return x.channel === channel; })[0]; return c && has(c.payment_fee_pct) ? num(c.payment_fee_pct) / 100 : 0; }

  /**
   * Monthly ledger: what happened in the month, line by line.
   * Revenue and commission on the stay basis (the nights that fall in the month); cash on payment dates; expenses on their dates.
   */
  function ledger(data, month) {
    var Mx = M(), r = monthRange(month), lines = [], nightsBy = {};
    Mx.nights(data, r.from, r.to, {}).forEach(function (n) { var b = n.booking, k = b.booking_id; (nightsBy[k] = nightsBy[k] || { b: b, nights: 0, first: n.date, revenue: 0, commission: 0 }); nightsBy[k].nights++; nightsBy[k].revenue += n.revenue || 0; nightsBy[k].commission += n.commission || 0; if (n.date < nightsBy[k].first) nightsBy[k].first = n.date; });
    Object.keys(nightsBy).forEach(function (k) {
      var x = nightsBy[k], b = x.b, rev = x.revenue;
      lines.push({ date: x.first, type: 'revenue', account: 'Accommodation revenue', ref: b.booking_id, villa: propName(data, b.property_id), channel: b.channel, description: (b.guest_name || 'Guest') + ' · ' + x.nights + ' night' + (x.nights === 1 ? '' : 's') + ' in ' + month, credit: r2(rev), debit: 0, basis: has(b.gross_amount) ? 'recorded' : 'amount not set' });
      var cp = x.commission;
      if (cp) lines.push({ date: x.first, type: 'commission', account: 'OTA commission', ref: b.booking_id, villa: propName(data, b.property_id), channel: b.channel, description: b.channel + ' commission', debit: r2(cp), credit: 0, basis: has(b.commission) ? 'recorded' : 'estimated from channel rate' });
    });
    (data.payments || []).forEach(function (p) {
      var d = String(p.date || '').slice(0, 10); if (d < r.from || d > r.to) return;
      var b = (data.bookings || []).filter(function (x) { return x.booking_id === p.booking_id; })[0] || {}, refund = /refund/i.test(p.type || ''), amt = num(p.amount);
      lines.push({ date: d, type: refund ? 'refund' : 'receipt', account: refund ? 'Refunds paid' : 'Cash received', ref: p.booking_id, villa: propName(data, b.property_id), channel: b.channel || '', description: (refund ? 'Refund to ' : 'Payment from ') + (b.guest_name || 'guest') + (p.method ? ' · ' + p.method : ''), debit: refund ? amt : 0, credit: refund ? 0 : amt, basis: 'recorded', cash: true });
      var fp = refund ? 0 : feePct(data, b.channel);
      if (fp) lines.push({ date: d, type: 'fee', account: 'Payment fees', ref: p.booking_id, villa: propName(data, b.property_id), channel: b.channel || '', description: 'Payment fee ' + Math.round(fp * 1000) / 10 + '%', debit: r2(amt * fp), credit: 0, basis: 'estimated from channel rate' });
    });
    (data.expenses || []).forEach(function (e) {
      var d = String(e.date || '').slice(0, 10); if (d < r.from || d > r.to) return;
      var cat = (I().EXPENSE_CATEGORIES.filter(function (c) { return c[0] === e.category; })[0] || [e.category, e.category])[1];
      lines.push({ date: d, type: 'expense', account: 'Expense · ' + cat, ref: e.expense_id, villa: propName(data, e.property_id), channel: '', description: (e.vendor ? e.vendor + ' · ' : '') + (e.note || cat), debit: num(e.amount), credit: 0, basis: e.basis === 'estimate' ? 'estimate' : 'recorded', cash: true });
    });
    lines.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.type < b.type ? -1 : 1; });
    var bal = 0; lines.forEach(function (l) { bal += l.credit - l.debit; l.balance = r2(bal); });
    var tot = function (t) { return r2(lines.filter(function (l) { return l.type === t; }).reduce(function (s, l) { return s + l.credit + l.debit; }, 0)); };
    return { month: month, from: r.from, to: r.to, lines: lines, totals: { revenue: tot('revenue'), commission: tot('commission'), fees: tot('fee'), expenses: tot('expense'), receipts: tot('receipt'), refunds: tot('refund') } };
  }

  /** Profit & loss for the month (stay basis), from the ledger. */
  function pnl(data, month) {
    var L = ledger(data, month), byCat = {};
    L.lines.filter(function (l) { return l.type === 'expense'; }).forEach(function (l) { byCat[l.account] = r2((byCat[l.account] || 0) + l.debit); });
    var gross = L.totals.revenue, direct = L.totals.commission + L.totals.fees, opex = L.totals.expenses, gst = gstSummary(data, month);
    var netRevenue = gst.prices_include_gst && gst.liable_tax ? gross - gst.liable_tax : gross;
    return { month: month, revenue: gross, gst_in_revenue: gst.prices_include_gst ? gst.liable_tax : 0, net_revenue: r2(netRevenue), commission: L.totals.commission, fees: L.totals.fees,
      gross_profit: r2(netRevenue - direct), expenses: byCat, expenses_total: opex, net_profit: r2(netRevenue - direct - opex), margin: netRevenue ? (netRevenue - direct - opex) / netRevenue : null,
      estimates: L.lines.filter(function (l) { return /estimate/.test(l.basis); }).length };
  }

  /**
   * Month-end balance sheet (management estimate, cash basis for cash):
   * Cash & bank = receipts − refunds − recorded expenses (since the first record). Receivables = amounts due for stays that have started.
   * Advances = money received for stays after the month. GST payable = GST in recognised revenue (when registered) not yet filed.
   */
  function balanceSheet(data, month) {
    var Mx = M(), end = monthRange(month).to, pay = {}, cash = 0, expenses = 0;
    (data.payments || []).forEach(function (p) { var d = String(p.date || '').slice(0, 10); if (!d || d > end) return; var amt = num(p.amount), refund = /refund/i.test(p.type || ''); cash += refund ? -amt : amt; var x = pay[p.booking_id] = pay[p.booking_id] || 0; pay[p.booking_id] = x + (refund ? -amt : amt); });
    (data.expenses || []).forEach(function (e) { var d = String(e.date || '').slice(0, 10); if (d && d <= end && e.basis !== 'estimate') expenses += num(e.amount); });
    var receivables = 0, advances = 0;
    (data.bookings || []).forEach(function (b) {
      if (['confirmed', 'no_show', 'tentative'].indexOf(b.status) < 0) return;
      var paid = pay[b.booking_id] || 0, value = num(b.gross_amount) - num(b.discount);
      if (b.checkin > end) { if (paid > 0) advances += paid; return; }
      if (has(b.gross_amount) && value - paid > 0.5) receivables += value - paid;
    });
    var gstPayable = 0; var cfg = settings(data);
    if (cfg.gst_registered) { var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)); for (var i = 0; i < 3; i++) { var mm = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7); gstPayable += gstSummary(data, mm).liable_tax; } }
    var assets = r2(cash - expenses) + r2(receivables), liabilities = r2(advances) + r2(gstPayable);
    return { month: month, as_of: end, assets: { cash: r2(cash - expenses), receivables: r2(receivables), total: r2(assets) }, liabilities: { advances: r2(advances), gst_payable: r2(gstPayable), total: r2(liabilities) },
      equity: r2(assets - liabilities), notes: ['Cash = money received − refunds − recorded expenses since the first record (no opening balance or owner drawings are recorded yet).', 'GST payable = GST in the last 3 months of revenue when registered (filings are not tracked).', 'Fixed assets (property, furniture) are not in the Founder OS.'] };
  }

  /**
   * GST summary for the month: each booking-night's tariff decides the slab; taxable value and tax per rate and channel type.
   * When prices include GST, tax = amount × rate ÷ (1 + rate). Bookings via platforms listed in eco_channels are shown separately:
   * whether the platform or you pay that GST (Section 9(5)) is for your CA to confirm. Not registered → nothing is payable on direct stays.
   */
  function gstSummary(data, month) {
    var Mx = M(), cfg = settings(data), r = monthRange(month), rows = {}, nights = Mx.nights(data, r.from, r.to, {});
    nights.forEach(function (n) {
      var b = n.booking, perNight = has(b.gross_amount) ? (num(b.gross_amount) - num(b.discount)) / Math.max(1, num(b.nights) || 1) : null; if (perNight == null) return;
      var pre = cfg.prices_include_gst ? null : perNight, rate = (pre != null ? pre : perNight / 1.05) <= cfg.slab_limit ? cfg.rate_low : cfg.rate_high;
      var taxable = cfg.prices_include_gst ? perNight / (1 + rate) : perNight, tax = taxable * rate, eco = (cfg.eco_channels || []).indexOf(b.channel) >= 0;
      var k = (eco ? 'platform' : 'direct') + '|' + rate, x = rows[k] = rows[k] || { via: eco ? 'Through platforms (Section 9(5): confirm with CA)' : 'Direct (WhatsApp, phone, website)', rate: rate, nights: 0, taxable: 0, tax: 0, bookings: {} };
      x.nights++; x.taxable += taxable; x.tax += tax; x.bookings[b.booking_id] = 1;
    });
    var list = Object.keys(rows).map(function (k) { var x = rows[k]; return { via: x.via, rate: x.rate, nights: x.nights, bookings: Object.keys(x.bookings).length, taxable: r2(x.taxable), cgst: r2(x.tax / 2), sgst: r2(x.tax / 2), tax: r2(x.tax), platform: /platforms/.test(x.via) }; })
      .sort(function (a, b) { return a.platform - b.platform || a.rate - b.rate; });
    var direct = list.filter(function (x) { return !x.platform; }).reduce(function (s, x) { return s + x.tax; }, 0);
    return { month: month, registered: !!cfg.gst_registered, gstin: cfg.gstin, sac: cfg.sac, place_of_supply: cfg.state, prices_include_gst: !!cfg.prices_include_gst, rows: list,
      liable_tax: cfg.gst_registered ? r2(direct) : 0, platform_tax: r2(list.filter(function (x) { return x.platform; }).reduce(function (s, x) { return s + x.tax; }, 0)),
      note: (cfg.gst_registered ? 'Registered: GST on direct bookings is yours to pay (CGST + SGST, intra-state). ' : 'Not registered: no GST is charged on direct bookings (check the turnover threshold with your CA). ') + 'Platform bookings are listed separately because the platform may pay GST for them under Section 9(5). Rates: ' + Math.round(cfg.rate_low * 100) + '% up to ₹' + cfg.slab_limit + ' a night, ' + Math.round(cfg.rate_high * 100) + '% above. Verify everything with your chartered accountant before filing.' };
  }

  /** Twelve months of revenue, expenses and net profit (stay basis) ending with `month`. */
  function trend(data, month, n) {
    var out = [], y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
    for (var i = (n || 12) - 1; i >= 0; i--) { var mm = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7), p = pnl(data, mm); out.push({ month: mm, revenue: p.net_revenue, costs: r2(p.commission + p.fees + p.expenses_total), profit: p.net_profit }); }
    return out;
  }

  return { DEFAULTS: DEFAULTS, settings: settings, monthRange: monthRange, ledger: ledger, pnl: pnl, balanceSheet: balanceSheet, gstSummary: gstSummary, trend: trend };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FoAccounts;
