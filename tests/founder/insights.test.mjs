// Insights library (founder/insights.js): finance, decomposition, forecasting, events, recommendations, reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../../founder/metrics.js');
const I = require('../../founder/insights.js');

const props = [1, 2, 3, 4, 5].map(i => ({ property_id: 'v' + i, name: 'Villa ' + i, units: 1, active: 'yes' }));
const channels = [{ channel: 'Direct · WhatsApp', kind: 'direct' }, { channel: 'Booking.com', kind: 'ota', commission_pct: 15, payment_fee_pct: 0 }, { channel: 'Airbnb', kind: 'ota', commission_pct: '' }];
function addD(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }

/** Deterministic history: one 2-night stay every 3 days per villa, Fri/Sat busier, for ~200 days before 2026-10-16. */
function history() {
  const bookings = []; let n = 0;
  for (let d = '2026-03-01'; d < '2026-10-30'; d = addD(d, 3)) {
    props.forEach((p, i) => {
      const w = new Date(d + 'T00:00:00Z').getUTCDay();
      if ((n + i) % (w === 5 || w === 6 ? 1 : 2) !== 0) return;
      const ch = i % 2 ? 'Booking.com' : 'Direct · WhatsApp';
      bookings.push({ booking_id: 'B' + (n++) + i, property_id: p.property_id, channel: ch, checkin: d, checkout: addD(d, 2), nights: 2, gross_amount: 10000, discount: '', taxes: '', commission: '', status: 'confirmed', created_at: addD(d, -10) + 'T10:00:00+05:30', created_basis: 'entered', guest_id: 'G' + (n % 40) });
    });
  }
  return { today: '2026-10-16', properties: props, channels, bookings, payments: [], blocks: [], expenses: [], budgets: [], exceptions: [] };
}

test('revenue decomposition: availability + occupancy + ADR effects add up exactly to the change', () => {
  const D = history();
  const cur = M.compute(D, '2026-09-01', '2026-09-30'), prev = M.compute(D, '2026-08-01', '2026-08-30');
  const d = I.decompose(cur, prev);
  assert.equal(d.method, 'LMDI (log-mean) attribution');
  assert.ok(Math.abs(d.availability + d.occupancy + d.adr - d.change) < 1e-6);
  assert.equal(I.decompose(cur, Object.assign({}, prev, { occupancy: 0 })).method, 'unavailable');
});

test('channel profitability: commission from the channel rate, contribution only when commission is known', () => {
  const D = history();
  const cp = I.channelProfit(D, '2026-09-01', '2026-09-30');
  const bc = cp.find(r => r.channel === 'Booking.com'), dw = cp.find(r => r.channel === 'Direct · WhatsApp');
  assert.ok(Math.abs(bc.commission - bc.revenue * 0.15) < 1e-6);
  assert.ok(Math.abs(bc.contribution - bc.revenue * 0.85) < 1e-6);
  assert.equal(dw.commission, 0); assert.equal(dw.contribution, dw.revenue);
  const D2 = Object.assign({}, D, { bookings: D.bookings.concat([{ booking_id: 'AB', property_id: 'v1', channel: 'Airbnb', checkin: '2026-09-20', checkout: '2026-09-21', nights: 1, gross_amount: 5000, status: 'confirmed', created_at: '2026-09-01' }]) });
  const ab = I.channelProfit(D2, '2026-09-01', '2026-09-30').find(r => r.channel === 'Airbnb');
  assert.equal(ab.commission_unknown, 1); assert.equal(ab.contribution, null, 'never guessed');
});

test('finance: profit is unavailable without costs, partial with estimates, and break-even follows the formula', () => {
  const D = history();
  const none = I.finance(D, '2026-09-01', '2026-09-30');
  assert.equal(none.status, 'unavailable'); assert.equal(none.operating_profit, null);
  D.expenses = [{ date: '2026-09-05', property_id: 'all', category: 'staff', amount: 30000, basis: 'actual' }, { date: '2026-09-10', property_id: 'v1', category: 'laundry', amount: 3000, basis: 'estimate' }];
  const f = I.finance(D, '2026-09-01', '2026-09-30');
  assert.equal(f.status, 'partial'); assert.equal(f.fixed_costs, 30000); assert.equal(f.variable_costs, 3000);
  assert.equal(f.operating_profit, f.contribution - 30000);
  const varPerNight = (3000 + f.payment_fees + f.commission) / f.occupied_nights;
  assert.ok(Math.abs(f.break_even_occupancy - (30000 / (f.adr - varPerNight)) / f.available_nights) < 1e-9);
  const v1 = I.finance(D, '2026-09-01', '2026-09-30', { property: 'v1' });
  assert.equal(v1.expenses_total, 30000 / 5 + 3000, 'shared costs allocated equally to each villa');
});

test('receivables aging and cash-flow outlook are labelled as estimates', () => {
  const D = history();
  D.bookings[D.bookings.length - 1].checkin = '2026-10-20';
  const ag = I.receivablesAging(D);
  assert.ok(ag.buckets['60+ days'] > 0 && ag.buckets['not yet arrived'] > 0);
  const cf = I.cashflow(D, 4);
  assert.equal(cf.weeks.length, 4); assert.match(cf.basis, /Management estimate/); assert.equal(cf.weeks[0].outflow, null, 'no costs recorded → outflow unknown, not zero');
});

test('budget vs actual per category', () => {
  const D = history();
  D.expenses = [{ date: '2026-09-05', property_id: 'all', category: 'staff', amount: 30000 }];
  D.budgets = [{ month: '2026-09', category: 'staff', amount: 25000 }, { month: '2026-09', category: 'revenue', amount: 400000 }];
  const r = I.budgetVsActual(D, '2026-09');
  const staff = r.find(x => x.category === 'staff'), rev = r.find(x => x.category === 'revenue');
  assert.equal(staff.variance, 5000); assert.equal(rev.actual, M.compute(D, '2026-09-01', '2026-09-30').net_accommodation_revenue);
});

test('forecast: refuses with too little history; with history it backtests 4 methods and keeps nights already booked as a floor', () => {
  const short = { today: '2026-10-16', properties: props, channels, bookings: history().bookings.filter(b => b.checkin > '2026-10-01'), payments: [], blocks: [] };
  const s = I.forecast(short, 'occupied', 30);
  assert.equal(s.sufficient, false); assert.match(s.reason, /history/);
  const D = history(), f = I.forecast(D, 'occupied', 14);
  assert.equal(f.sufficient, true);
  assert.equal(f.accuracy.length, 4);
  f.accuracy.forEach(a => { assert.ok(a.mae >= 0 && a.rmse >= a.mae - 1e-9); });
  assert.equal(f.points.length, 14);
  f.points.forEach(p => { assert.ok(p.forecast >= p.on_books && p.forecast <= 5 && p.lower <= p.forecast + 1e-9 && p.upper >= p.forecast - 1e-9); });
  assert.equal(I.forecast(D, 'occupied', 365).sufficient, false, '12 months needs two years of history');
});

test('backtest metrics on a known series', () => {
  const y = []; for (let i = 0; i < 70; i++) y.push(i % 7 === 5 ? 10 : 2);
  const b = I.backtest(y, 7, 'seasonal_naive', 3);
  assert.equal(b.mae, 0); assert.equal(b.wape, 0); assert.equal(b.bias, 0);
  const ma = I.backtest(y, 7, 'moving_average', 3);
  assert.ok(ma.mae > 0);
});

test('scenario lab: transparent arithmetic', () => {
  const r = I.scenario({ available_per_month: 150, occupancy: 0.5, adr: 5000, ota_share: 0.4, commission_pct: 0.15, payment_fee_pct: 0.02, variable_cost_per_night: 500, fixed_costs_per_month: 100000, cancellation_rate: 0 });
  assert.equal(r.occupied_nights, 75); assert.equal(r.revenue, 375000);
  assert.equal(r.commission, 375000 * 0.4 * 0.15); assert.equal(r.payment_fees, 7500); assert.equal(r.variable_costs, 37500);
  assert.equal(r.operating_profit, 375000 - 22500 - 7500 - 37500 - 100000);
  const base = I.scenarioBase(history());
  assert.ok(base.occupancy > 0 && base.adr > 0); assert.equal(base.fixed_costs_per_month, null, 'no costs recorded → must be set by the founder');
});

test('events: verified calendar, long weekends computed from the weekday, founder events merged', () => {
  const ev = I.allEvents([{ event_id: 'x', name: 'Custom', start: '2027-01-10', end: '2027-01-11' }]);
  assert.ok(ev.some(e => e.id === 'simhastha-2028' && e.confidence === 'tentative'));
  assert.ok(ev.some(e => e.name === 'Custom' && e.confidence === 'founder'));
  const lw = I.longWeekends(2027, 2027).find(e => e.id === 'lw-2027-01-26');   // 26 Jan 2027 is a Tuesday → 4-day bridge
  assert.equal(lw.start, '2027-01-23'); assert.match(lw.name, /bridge/);
  assert.ok(ev.every((e, i) => i === 0 || ev[i - 1].start <= e.start));
});

test('event impact compares the event window with the weeks around it', () => {
  const D = history(), imp = I.eventImpact(D, I.EVENTS.find(e => e.id === 'shravan-2026'));
  assert.ok(imp.occupancy != null && imp.baseline_occupancy != null);
  assert.ok(Math.abs(imp.occupancy_lift - (imp.occupancy - imp.baseline_occupancy)) < 1e-12);
});

test('anomalies: rule-based, with the rule stated; quiet data gives notes, not alarms', () => {
  const D = history();
  const quiet = I.anomalies(D, null);
  quiet.items.forEach(a => assert.ok(a.method && a.fact));
  const drop = Object.assign({}, D, { bookings: D.bookings.filter(b => b.created_at.slice(0, 10) < '2026-10-02') });
  assert.ok(I.anomalies(drop, null).items.some(a => a.key === 'booking_drop'));
  assert.ok(quiet.notes.some(n => /GA4/.test(n)));
});

test('recommendations: facts, hypothesis, impact × feasibility priority and a follow-up metric', () => {
  const D = history();
  D.bookings.push({ booking_id: 'X', property_id: 'v2', channel: 'Airbnb', checkin: '2026-09-01', checkout: '2026-09-02', nights: 1, gross_amount: 5000, status: 'confirmed', created_at: '2026-08-01' });
  const recs = I.recommendations(D, { exceptions: [{ status: 'open', severity: 'high', type: 'unknown_property' }] });
  const keys = recs.map(r => r.key);
  assert.ok(keys.includes('set_commission')); assert.ok(keys.includes('collect')); assert.ok(keys.includes('data_quality'));
  recs.forEach(r => {
    assert.ok(r.facts.length && r.hypothesis && r.action && r.follow_up.metric, r.key);
    assert.equal(r.priority, r.impact.score * r.feasibility);
    assert.ok(['high', 'medium', 'low'].includes(r.confidence));
  });
  for (let i = 1; i < recs.length; i++) assert.ok(recs[i - 1].priority >= recs[i].priority);
});

test('report periods and schedule (IST calendar dates)', () => {
  assert.deepEqual(I.reportPeriod('weekly', '2026-10-19'), { from: '2026-10-12', to: '2026-10-18', key: '2026-10-12' });
  assert.deepEqual(I.reportPeriod('monthly', '2026-01-01'), { from: '2025-12-01', to: '2025-12-31', key: '2025-12' });
  assert.deepEqual(I.reportPeriod('quarterly', '2026-10-01'), { from: '2026-07-01', to: '2026-09-30', key: '2026-Q3' });
  assert.deepEqual(I.reportPeriod('quarterly', '2027-01-01'), { from: '2026-10-01', to: '2026-12-31', key: '2026-Q4' });
  assert.equal(I.reportDue('weekly', '2026-10-19'), true); assert.equal(I.reportDue('weekly', '2026-10-20'), false);
  assert.equal(I.reportDue('annual', '2027-01-01'), true); assert.equal(I.reportDue('monthly', '2026-10-16'), false);
});

test('reports: every type builds, includes definitions and freshness, HTML escapes data', () => {
  const D = history();
  D.bookings[0].channel = '<script>x</script>';
  Object.keys(I.REPORT_TYPES).forEach(type => {
    const r = I.buildReport(type, D, I.reportPeriod(type, '2026-10-16'), { lastSync: '2026-10-16T06:00:00+05:30', generated_at: '2026-10-16T07:00:00+05:30' });
    assert.equal(r.title, I.REPORT_TYPES[type]); assert.ok(r.definitions.length >= 5); assert.equal(r.data_freshness, '2026-10-16T06:00:00+05:30');
    const html = I.reportHtml(r);
    assert.doesNotMatch(html, /<script>x/); assert.match(html, /Metric definitions/);
  });
});

test('reports never compare against periods with no data (no fake "+40 pts vs last year")', () => {
  const D = { today: '2026-10-16', properties: props, channels, payments: [], blocks: [], bookings: [{ booking_id: 'A', property_id: 'v1', channel: 'Direct · WhatsApp', checkin: '2026-10-15', checkout: '2026-10-16', nights: 1, gross_amount: 4000, status: 'confirmed', created_at: '2026-10-10T10:00:00+05:30' }] };
  const r = I.buildReport('daily', D, I.reportPeriod('daily', '2026-10-16'));
  const occ = r.sections[0].table.rows.find(x => x[0] === 'Occupancy');
  assert.equal(occ[1], '20.0%'); assert.equal(occ[3], '', 'no last-year data → blank');
});

// ---------------------------------------------------------------- pricing engine ----------------
function pricingData(extra) {
  return Object.assign({ today: '2026-10-16', properties: [{ property_id: 'v1', name: 'Villa 1', units: 1, active: 'yes', bedrooms: 3, sleeps: 8, from_rate: 5000 }, { property_id: 'v2', name: 'Villa 2', units: 1, active: 'yes', bedrooms: 2, from_rate: 4000 }],
    channels, bookings: [], payments: [], blocks: [], events: [], market_rates: [], demand_signals: [], settings: {} }, extra || {});
}
test('pricing: a quiet weekday with no data is the base rate, low confidence, every factor explained', () => {
  const r = I.pricing(pricingData(), 'v1', '2026-12-01', 1).rows[0];   // Tuesday, no events
  assert.equal(r.recommended, 5000); assert.equal(r.confidence, 'low');
  assert.deepEqual(r.factors.map(f => f.key), ['base']); assert.match(r.factors[0].basis, /published/);
  assert.ok(r.low < r.recommended && r.high > r.recommended);
});
test('pricing: weekend and event uplifts use the defaults and say so; peak day beats the window', () => {
  const D = pricingData();
  const fri = I.pricing(D, 'v1', '2026-12-04', 1).rows[0];
  assert.equal(fri.recommended, 5500); assert.ok(fri.factors.some(f => f.key === 'weekend'));
  const dw = I.pricing(D, 'v1', '2026-11-06', 3).rows;   // Diwali window 6-10 Nov, peak 8 Nov (a Sunday)
  const peak = dw.find(r => r.date === '2026-11-08'), win = dw.find(r => r.date === '2026-11-07');
  assert.equal(peak.recommended, Math.round(5000 * 1.35 / 100) * 100);
  assert.equal(win.recommended, Math.round(5000 * 1.10 * 1.25 / 100) * 100, 'Saturday in the window: weekend x festival');
  assert.match(peak.factors.find(f => f.key === 'event').basis, /default for festival peak day/);
});
test('pricing: mega events get the higher ceiling; guardrails from settings are respected', () => {
  const D = pricingData({ settings: { pricing: JSON.stringify({ villas: { v1: { base: 6000, floor: 5000, ceiling: 7000 } } }) } });
  const r = I.pricing(D, 'v1', '2028-04-11', 1).rows[0];   // Simhastha
  assert.equal(r.recommended, 7000, 'ceiling'); assert.ok(r.factors.some(f => f.key === 'guardrails'));
  assert.equal(r.factors[0].basis, 'your setting');
  const free = I.pricing(pricingData(), 'v1', '2028-04-11', 1).rows[0];
  assert.equal(free.recommended, Math.round(5000 * 1.6 / 100) * 100);
});
test('pricing: market median of comparable, recent, dated observations is blended only with 3+; bedrooms scaled', () => {
  const obs = (p, b, o = '2026-10-10', s = '2026-12-01') => ({ competitor: 'C' + p, observed_at: o, stay_date: s, bedrooms: b, price_per_night: p, nights: 1, source_url: 'https://x' });
  const two = I.pricing(pricingData({ market_rates: [obs(8000, 3), obs(9000, 3)] }), 'v1', '2026-12-01', 1).rows[0];
  assert.equal(two.recommended, 5000); assert.equal(two.market.n, 2, 'shown but not blended');
  const D = pricingData({ market_rates: [obs(8000, 3), obs(9000, 3), obs(4000, 2), obs(20000, 6), obs(7000, 3, '2026-07-01'), obs(7000, 3, '2026-10-10', '2027-02-01')] });
  const r = I.pricing(D, 'v1', '2026-12-01', 1).rows[0];
  assert.equal(r.market.n, 3, '6-bedroom (not comparable), stale and far-date observations excluded');
  assert.equal(r.market.median, 8000, '2-bedroom 4000 scaled to 3 bedrooms = 6000');
  assert.equal(r.recommended, Math.round((0.7 * 5000 + 0.3 * 8000) / 100) * 100);
  assert.equal(r.confidence, 'medium');
});
test('pricing: pace raises busy nights and trims empty last-minute nights; booked nights are flagged', () => {
  const bk = (id, p, ci, co) => ({ booking_id: id, property_id: p, channel: 'Direct · WhatsApp', checkin: ci, checkout: co, nights: 1, gross_amount: 5000, status: 'confirmed', created_at: '2026-10-01' });
  const D = pricingData({ properties: [1, 2, 3, 4, 5].map(i => ({ property_id: 'v' + i, name: 'V' + i, units: 1, active: 'yes', bedrooms: 3, from_rate: 5000 })),
    bookings: ['v2', 'v3', 'v4', 'v5'].map((p, i) => bk('B' + i, p, '2026-12-01', '2026-12-02')) });
  const busy = I.pricing(D, 'v1', '2026-12-01', 1).rows[0];
  assert.equal(busy.recommended, 6000, '80% booked: +20%'); assert.equal(busy.booked, false);
  const D2 = Object.assign({}, D, { today: '2026-12-08' });
  const soon = I.pricing(D2, 'v1', '2026-12-10', 1).rows[0];   // Thursday, 2 days away, empty, no event
  assert.equal(soon.recommended, Math.round(5000 * 0.85 / 100) * 100);
  assert.equal(I.pricing(D2, 'v1', '2026-12-15', 1).rows[0].recommended, Math.round(5000 * 0.9 / 100) * 100, '7 days away');
  assert.equal(I.pricing(D, 'v2', '2026-12-01', 1).rows[0].booked, true);
});
test('pricing: demand trend signals move the rate only beyond ±25%', () => {
  const sig = g => ({ date: '2026-10-10', source: 'trends', metric: 'growth', keyword: 'ujjain', growth_pct: g });
  assert.equal(I.pricing(pricingData({ demand_signals: [sig(10)] }), 'v1', '2026-12-01', 1).rows[0].recommended, 5000);
  assert.equal(I.pricing(pricingData({ demand_signals: [sig(40)] }), 'v1', '2026-12-01', 1).rows[0].recommended, 5300);
});
test('pricing: summary covers open nights only; unknown villa returns null', () => {
  const p = I.pricing(pricingData(), 'v1', '2026-12-01', 30);
  assert.equal(p.rows.length, 30); assert.equal(p.summary.open_nights, 30); assert.ok(p.summary.min <= p.summary.avg && p.summary.avg <= p.summary.max);
  assert.equal(I.pricing(pricingData(), 'nope', '2026-12-01', 3), null);
  assert.equal(I.PRICING_VARIABLES.length, 9);
});
