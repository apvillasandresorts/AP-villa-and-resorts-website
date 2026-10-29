/**
 * AP Villas Founder OS · Investments maths (runs in the browser and in Node tests). No network, no storage.
 * Real holdings are valued here in the browser from the markets snapshot (prices, NAVs, IBJA rates) so they never leave Google.
 * Everything is "model output for your own paper trading and record keeping", never advice.
 */
var FoInvCalc = (function () {
  var DAY = 86400000;
  function num(v) { if (v == null || String(v).trim() === '') return null; var n = Number(String(v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : null; }
  function days(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY); }
  function addMonths(d, n) { var x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); }

  // ---------------------------------------------------------------- returns ----------------
  /** flows: [[date, amount]] (money in negative, value / money out positive). Annual rate or null. */
  function xirr(flows) {
    flows = (flows || []).filter(function (f) { return f && f[1]; });
    if (flows.length < 2 || !flows.some(function (f) { return f[1] > 0; }) || !flows.some(function (f) { return f[1] < 0; })) return null;
    var d0 = flows.reduce(function (m, f) { return f[0] < m ? f[0] : m; }, flows[0][0]);
    var t = flows.map(function (f) { return days(d0, f[0]) / 365; }), a = flows.map(function (f) { return f[1]; });
    function f(r) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] / Math.pow(1 + r, t[i]); return s; }
    var lo = -0.9999, hi = 10, flo = f(lo), fhi = f(hi);
    if (flo * fhi > 0) return null;
    for (var k = 0; k < 200; k++) { var m = (lo + hi) / 2, fm = f(m); if (flo * fm <= 0) { hi = m; } else { lo = m; flo = fm; } }
    return (lo + hi) / 2;
  }
  var PER = { yearly: 1, 'half-yearly': 2, quarterly: 4, monthly: 12 };
  /** Deposit value at `asof` (not past maturity). */
  function deposit(principal, ratePct, start, asof, comp, maturity) {
    var end = maturity && maturity < asof ? maturity : asof;
    var y = Math.max(days(start, end), 0) / 365, r = ratePct / 100;
    if (comp === 'simple') return principal * (1 + r * y);
    var n = PER[comp] || 4;
    return principal * Math.pow(1 + r / n, n * y);
  }
  /** Recurring deposit: one instalment a month from start, each compounding quarterly (Indian bank convention). */
  function recurring(monthly, ratePct, start, asof, maturity) {
    var end = maturity && maturity < asof ? maturity : asof, v = 0, paid = 0;
    for (var d = start; d <= end && paid < 600; d = addMonths(d, 1)) { v += deposit(monthly, ratePct, d, end, 'quarterly'); paid++; }
    return { value: v, paid: paid * monthly };
  }

  // ---------------------------------------------------------------- holdings ----------------
  var CLASS = { stock: 'equity', etf: 'equity', mf: 'equity', gold: 'gold', sgb: 'gold', silver: 'silver', fd: 'debt', rd: 'debt', ppf: 'debt', epf: 'debt', bond: 'debt', nps: 'mixed', cash: 'cash', property: 'property', other: 'other' };
  function gramRate(snap, live, purity) {
    var t = (live && live.rates) || (snap && snap.bullion && snap.bullion.today) || {};
    var p = String(purity || '999');
    var key = { '999': 'gold999', '995': 'gold995', '916': 'gold916', '22': 'gold916', '22k': 'gold916', '750': 'gold750', '18': 'gold750', '18k': 'gold750', '585': 'gold585' }[p.toLowerCase()] || 'gold999';
    return num(t[key]) || (num(t.gold999) ? num(t.gold999) * ({ gold916: 22 / 24, gold750: 18 / 24, gold585: 14 / 24 }[key] || 1) : null);
  }
  function silverGram(snap) { var s = snap && snap.bullion && snap.bullion.silver999; return s && s.last ? s.last / 1000 : null; }
  /** One holding → { value, invested, cls, basis, price, flows, gain } at `asof`. */
  function value(h, snap, txns, asof, live) {
    var units = num(h.units), avg = num(h.avg_cost), invested = num(h.invested), cur = num(h.current_value), rate = num(h.rate_pct), out = { cls: CLASS[h.kind] || 'other', basis: '', price: null };
    var px = snap && snap.prices && h.symbol ? snap.prices[h.symbol] : null;
    if (invested == null && units != null && avg != null) invested = units * avg;
    if (h.kind === 'stock' || h.kind === 'etf') {
      if (px && px.close) { out.value = units * px.close; out.price = px.close; out.basis = 'NSE close ' + px.date; if (h.kind === 'etf' && px.kind && px.kind !== 'etf') out.cls = px.kind === 'debt' ? 'debt' : px.kind; }
      else { out.value = cur != null ? cur : invested; out.basis = 'not priced yet (next daily run)'; }
    } else if (h.kind === 'mf') {
      var nv = snap && snap.nav && snap.nav[h.fund_code];
      if (nv && nv.nav) { out.value = units * nv.nav; out.price = nv.nav; out.basis = 'AMFI NAV ' + nv.date; if (/liquid|debt|gilt|bond|money market|overnight|duration|credit/i.test(nv.name || h.name)) out.cls = 'debt'; if (/gold/i.test(nv.name || '')) out.cls = 'gold'; }
      else { out.value = cur != null ? cur : invested; out.basis = 'NAV not loaded yet'; if (/liquid|debt|gilt|bond/i.test(h.name)) out.cls = 'debt'; }
    } else if (h.kind === 'gold' || h.kind === 'sgb') {
      var g = gramRate(snap, live, h.kind === 'sgb' ? '999' : h.purity);
      out.value = g ? units * g : (cur != null ? cur : invested); out.price = g; out.basis = g ? 'IBJA ' + (h.kind === 'sgb' ? '999' : (h.purity || '999')) + ' per gram, excl. GST' : 'IBJA rate not loaded yet';
    } else if (h.kind === 'silver') {
      var s = silverGram(snap); out.value = s ? units * s : (cur != null ? cur : invested); out.price = s; out.basis = s ? 'IBJA silver per gram' : 'IBJA rate not loaded yet';
    } else if (h.kind === 'fd' && invested != null && rate != null && h.start_date) {
      out.value = deposit(invested, rate, h.start_date, asof, h.compounding || 'quarterly', h.maturity_date); out.basis = rate + '% ' + (h.compounding || 'quarterly') + (h.maturity_date && h.maturity_date < asof ? ' (matured ' + h.maturity_date + ')' : '');
    } else if (h.kind === 'rd' && num(h.monthly_amount) && rate != null && h.start_date) {
      var r = recurring(num(h.monthly_amount), rate, h.start_date, asof, h.maturity_date); out.value = r.value; invested = r.paid; out.basis = rate + '% RD, ' + Math.round(r.paid / num(h.monthly_amount)) + ' instalments';
    } else if (cur != null) {
      out.value = cur; out.basis = 'your value' + (h.value_date ? ' on ' + h.value_date : '');
      if (rate != null && h.value_date && h.value_date < asof && (h.kind === 'ppf' || h.kind === 'epf' || h.kind === 'bond')) { out.value = deposit(cur, rate, h.value_date, asof, 'yearly'); out.basis += ' + ' + rate + '% since'; }
    } else if (invested != null && rate != null && h.start_date) {
      out.value = deposit(invested, rate, h.start_date, asof, h.compounding || 'yearly', h.maturity_date); out.basis = rate + '% from ' + h.start_date;
    } else { out.value = invested || 0; out.basis = 'amount invested'; }
    out.invested = invested;
    var fl = (txns || []).filter(function (t) { return t.holding_id === h.holding_id; }).map(function (t) { var a = num(t.amount) || 0; return [t.date, /buy|deposit/.test(t.type) ? -a : a]; });
    if (!fl.length && invested && h.start_date) fl = [[h.start_date, -invested]];
    if (fl.length && out.value) fl.push([asof, out.value]);
    out.flows = fl; out.xirr = fl.length >= 2 ? xirr(fl) : null;
    out.gain = out.value != null && invested != null ? out.value - invested : null;
    return out;
  }
  /** Portfolio summary: totals, by class, XIRR on all flows, allocation vs target and the rebalancing gaps. */
  function portfolio(holdings, snap, txns, asof, target, live) {
    var rows = [], by = {}, flows = [], tot = 0, inv = 0;
    (holdings || []).filter(function (h) { return h.status !== 'closed'; }).forEach(function (h) {
      var v = value(h, snap, txns, asof, live); rows.push({ h: h, v: v });
      var parts = v.cls === 'mixed' ? [['equity', 0.5], ['debt', 0.5]] : [[v.cls, 1]];
      parts.forEach(function (p) { by[p[0]] = (by[p[0]] || 0) + (v.value || 0) * p[1]; });
      tot += v.value || 0; inv += v.invested || 0;
      v.flows.forEach(function (f) { if (f[0] !== asof) flows.push(f); });
    });
    if (tot) flows.push([asof, tot]);
    var alloc = Object.keys(by).map(function (k) { return { cls: k, value: by[k], pct: tot ? by[k] / tot : 0 }; }).sort(function (a, b) { return b.value - a.value; });
    var gaps = [];
    if (target && tot) Object.keys(target).forEach(function (k) {
      var have = (by[k] || 0) / tot, want = target[k] || 0, diff = want - have;
      if (Math.abs(diff) >= 0.05) gaps.push({ cls: k, have: have, want: want, amount: diff * tot });   // threshold rebalancing: 5-point drift
    });
    return { rows: rows, total: tot, invested: inv, gain: tot - inv, xirr: xirr(flows), alloc: alloc, gaps: gaps };
  }

  // ---------------------------------------------------------------- risk profile ----------------
  var QUESTIONS = [
    ['How long until you need most of this money?', ['Under 1 year', '1–3 years', '3–5 years', '5–10 years', 'More than 10 years']],
    ['How steady is your income?', ['Very uncertain', 'Seasonal / variable', 'Mostly steady', 'Steady', 'Very secure, several sources']],
    ['Your portfolio falls 20% in a month. You…', ['Sell everything', 'Sell some', 'Wait and worry', 'Hold calmly', 'Buy more']],
    ['How much investing experience do you have?', ['None', 'Deposits only', 'Mutual funds', 'Stocks and funds', 'Many years across assets']],
    ['Main goal for this money?', ['Keep it safe', 'Regular income', 'Balanced growth', 'Long-term growth', 'Maximum growth']],
    ['Emergency fund (6 months of expenses) in place?', ['No', 'Less than 3 months', '3–6 months', '6 months', 'More than a year']],
    ['Loans or EMIs as a share of income?', ['Over 50%', '30–50%', '15–30%', 'Under 15%', 'None']],
    ['Largest one-year loss you could live with?', ['None', '5%', '10%', '20%', '30% or more']],
    ['How often will you check and act?', ['Daily, anxiously', 'Weekly', 'Monthly', 'Quarterly', 'Yearly']],
    ['People depending on this money?', ['Many, fully', 'Several', 'One or two', 'Partly', 'Nobody']],
  ];
  var PROFILES = ['Conservative', 'Moderate', 'Balanced', 'Growth', 'Aggressive'];
  var ALLOC = {
    Conservative: { equity: 0.20, debt: 0.50, gold: 0.10, silver: 0.00, cash: 0.20 },
    Moderate: { equity: 0.40, debt: 0.35, gold: 0.12, silver: 0.03, cash: 0.10 },
    Balanced: { equity: 0.55, debt: 0.25, gold: 0.12, silver: 0.03, cash: 0.05 },
    Growth: { equity: 0.70, debt: 0.15, gold: 0.10, silver: 0.03, cash: 0.02 },
    Aggressive: { equity: 0.85, debt: 0.05, gold: 0.07, silver: 0.03, cash: 0.00 },
  };
  function profileOf(answers) {
    var s = (answers || []).reduce(function (a, x) { return a + (Number(x) || 0); }, 0);
    // the time horizon and loss tolerance cap the profile: short money is never "Aggressive"
    var cap = Math.min(4, Number(answers && answers[0]) + 1 || 4, Number(answers && answers[7]) + 1 || 4);
    var p = s <= 8 ? 0 : s <= 16 ? 1 : s <= 24 ? 2 : s <= 32 ? 3 : 4;
    return { score: s, profile: PROFILES[Math.min(p, cap)], capped: cap < p };
  }

  // ---------------------------------------------------------------- goal planner ----------------
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function normal(r) { var u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  /** Monte Carlo (monthly steps, lognormal returns): P(reach target), median and 10th/90th percentile corpus. */
  function goal(o) {
    var paths = o.paths || 10000, months = Math.round((o.years || 10) * 12), mu = o.mu == null ? 0.10 : o.mu, sigma = o.sigma == null ? 0.15 : o.sigma;
    var m = Math.log(1 + mu) / 12 - sigma * sigma / 24, s = sigma / Math.sqrt(12), r = rng(o.seed || 42), end = new Float64Array(paths), hit = 0;
    var step = o.stepUp || 0;
    for (var p = 0; p < paths; p++) {
      var v = o.start || 0, sip = o.sip || 0;
      for (var k = 0; k < months; k++) { if (k && k % 12 === 0) sip *= 1 + step; v = (v + sip) * Math.exp(m + s * normal(r)); }
      end[p] = v; if (v >= o.target) hit++;
    }
    var sorted = Array.prototype.slice.call(end).sort(function (a, b) { return a - b; });
    var q = function (x) { return sorted[Math.min(sorted.length - 1, Math.floor(x * sorted.length))]; };
    var paid = (o.start || 0); for (var k2 = 0, sp = o.sip || 0; k2 < months; k2++) { if (k2 && k2 % 12 === 0) sp *= 1 + step; paid += sp; }
    return { prob: hit / paths, p10: q(0.10), p50: q(0.5), p90: q(0.9), paid: paid };
  }
  /** Monthly SIP needed for a target with probability `want` (bisection on the simulation). */
  function sipFor(o, want) {
    var lo = 0, hi = Math.max(o.target / Math.max(o.years * 12, 1) * 2, 1000);
    for (var i = 0; i < 22; i++) { var mid = (lo + hi) / 2; if (goal(Object.assign({}, o, { sip: mid, paths: 2000 })).prob >= want) hi = mid; else lo = mid; }
    return Math.ceil(hi / 100) * 100;
  }

  // ---------------------------------------------------------------- IPOs ----------------
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }
  /** GMP as a range across sources (newest reading per source), as % of the upper price band. */
  function gmpRange(ipo) {
    var g = []; try { g = JSON.parse(ipo.gmp_json || '[]'); } catch (e) {}
    var last = {}; g.forEach(function (x) { if (!last[x.source] || x.at > last[x.source].at) last[x.source] = x; });
    var vals = Object.keys(last).map(function (k) { return last[k].gmp; }), hi = num(ipo.price_high);
    if (!vals.length) return null;
    var med = median(vals);
    return { sources: vals.length, median: med, min: Math.min.apply(null, vals), max: Math.max.apply(null, vals), pct: hi ? med / hi : null, history: g };
  }
  /**
   * Paper verdict (spec 10). With no free IPO history feed there is no trained listing model yet, so P(positive listing) is a transparent
   * rule-of-thumb from subscription and the GMP range; the long-term view weighs fundamentals and valuation. Thresholds are the spec's.
   */
  function ipoVerdict(ipo) {
    var g = gmpRange(ipo), qib = num(ipo.sub_qib) || 0, retail = num(ipo.sub_retail) || 0, nii = num(ipo.sub_nii) || num(ipo.sub_bnii) || 0, sme = ipo.type === 'sme';
    var z = -0.4 + 0.55 * Math.log(1 + qib) + 0.2 * Math.log(1 + nii) + 0.15 * Math.log(1 + retail) + (g && g.pct != null ? 6 * g.pct : 0);
    if (!g && !qib && !retail) z = null;
    var p = z == null ? null : 1 / (1 + Math.exp(-z));
    var growth = ((num(ipo.rev_cagr) || 0) >= 15) + ((num(ipo.pat_cagr) || 0) >= 15) + ((num(ipo.roe) || 0) >= 15) + ((num(ipo.roce) || 0) >= 15) + ((num(ipo.de) != null && num(ipo.de) <= 1) ? 1 : 0);
    var pe = num(ipo.pe_post), peer = num(ipo.peer_pe), stretched = pe && peer ? pe > peer * 1.2 : false;
    var ofsHeavy = num(ipo.ofs_cr) && num(ipo.issue_size_cr) ? num(ipo.ofs_cr) / num(ipo.issue_size_cr) > 0.7 : false;
    var flags = [];
    if (ipo.red_flags) flags.push(ipo.red_flags);
    if (ofsHeavy && (num(ipo.pat_cagr) || 0) < 10) flags.push('mostly offer-for-sale with weak profit growth');
    if (sme && g && g.pct > 0.5 && qib < 2) flags.push('SME grey-market spike without institutional demand');
    var long = growth >= 4 && !stretched ? 'strong' : growth >= 2 ? 'neutral' : 'weak';
    var verdict;
    if (p == null) verdict = 'Waiting for data';
    else if (p < 0.5 || flags.length) verdict = 'Avoid';
    else if (p > 0.7 && long === 'strong') verdict = 'Apply — listing and long term';
    else if (p > 0.7) verdict = 'Apply — listing only';
    else if (growth >= 4 && stretched) verdict = 'Watch post-listing';
    else verdict = 'Neutral';
    return { p: p, verdict: verdict, long: long, stretched: stretched, flags: flags, gmp: g, allot_retail: retail ? Math.min(1, 1 / retail) : null,
      sme_warning: sme ? 'SME grey market is thin and easy to manipulate: treat GMP as noise.' : null,
      basis: 'Rule-of-thumb estimate, not a trained model (no free IPO history feed). GMP is unofficial and never used alone.' };
  }

  // ---------------------------------------------------------------- formatting ----------------
  function pct(x, d) { return x == null || !isFinite(x) ? '–' : (x * 100).toFixed(d == null ? 1 : d) + '%'; }
  function signed(x, d) { return x == null || !isFinite(x) ? '–' : (x > 0 ? '+' : '') + (x * 100).toFixed(d == null ? 1 : d) + '%'; }

  // ---------------------------------------------------------------- broker import ----------------
  function csvRows(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.map(function (r) { return r.map(function (c) { return c.trim(); }); });
  }
  /** Holdings export from any Indian broker (Zerodha Console / Kite, Groww, Upstox, Angel, ICICI, HDFC…): finds the header row,
   *  then symbol (or ISIN, mapped with `isinMap`), quantity and average price. Returns [{symbol, units, avg_cost}] merged by symbol. */
  function parseHoldingsCsv(text, isinMap) {
    var rows = csvRows(String(text || '').replace(/^\uFEFF/, '')), find = function (h, re) { for (var i = 0; i < h.length; i++) if (re.test(h[i])) return i; return -1; };
    var SYM = /^(symbol|instrument|trading ?symbol|tradingsymbol|scrip( name| code)?|stock symbol|nse symbol|security( name)?)$/i, ISIN = /isin/i, QTY = /^(qty|quantity)\b|^qty\.?$|^(total|net|available) (qty|quantity)/i, AVG = /^(avg|average)\.? ?(buy )?(price|cost|rate)|^buy avg|^avg\.? cost|^average buy price/i;
    for (var r = 0; r < Math.min(rows.length, 40); r++) {
      var h = rows[r], cs = find(h, SYM), ci = find(h, ISIN), cq = find(h, QTY), ca = find(h, AVG);
      if ((cs < 0 && ci < 0) || cq < 0 || ca < 0) continue;
      var out = {}, order = [];
      rows.slice(r + 1).forEach(function (x) {
        var sym = cs >= 0 ? String(x[cs] || '').toUpperCase().replace(/\.(NS|BO)$/, '').replace(/-(EQ|BE|BZ|SM|ST)$/, '').replace(/[^A-Z0-9&_-]/g, '') : '';
        if (!sym && ci >= 0 && isinMap) sym = isinMap[String(x[ci] || '').toUpperCase()] || '';
        var u = num(x[cq]), a = num(x[ca]);
        if (!sym || !(u > 0) || a == null) return;
        if (!out[sym]) { out[sym] = { symbol: sym, units: 0, cost: 0 }; order.push(sym); }
        out[sym].units += u; out[sym].cost += u * a;
      });
      return order.map(function (k) { var o = out[k]; return { symbol: k, units: o.units, avg_cost: Math.round(o.cost / o.units * 10000) / 10000 }; });
    }
    return [];
  }

  return { parseHoldingsCsv: parseHoldingsCsv, num: num, days: days, xirr: xirr, deposit: deposit, recurring: recurring, value: value, portfolio: portfolio, CLASS: CLASS,
    QUESTIONS: QUESTIONS, PROFILES: PROFILES, ALLOC: ALLOC, profileOf: profileOf, goal: goal, sipFor: sipFor, gmpRange: gmpRange, ipoVerdict: ipoVerdict, median: median, pct: pct, signed: signed };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FoInvCalc;
