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
