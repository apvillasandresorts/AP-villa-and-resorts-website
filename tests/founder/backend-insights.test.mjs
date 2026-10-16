// Phases 5–10 backend (docs/founder-os/FoInsights.gs) against in-memory Google services.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './gas-mock.mjs';

const CHECKINS = [
  { 'Submitted at': '2026-09-01T10:00:00', Reference: 'ECI-1', 'Booked through': 'Booking.com', 'Booking ID': 'BC1', Villa: 'Divinestay', 'Check-in': '2026-09-10', 'Check-out': '2026-09-13', 'Main guest': 'Asha Rao', Mobile: '9876543210', 'Total ₹': 16500, 'Amount paid ₹': 16500, 'Balance due ₹': 0 },
  { 'Submitted at': '2026-10-01T10:00:00', Reference: 'ECI-2', 'Booked through': 'Direct (WhatsApp / phone / website)', Villa: 'AP Suite', 'Check-in': '2026-10-20', 'Check-out': '2026-10-22', 'Main guest': 'Ravi Kumar', Mobile: '9876500000', 'Total ₹': 8400, 'Amount paid ₹': 2000, 'Balance due ₹': 6400 },
];
async function ready(opts) { const env = makeEnv(Object.assign({ checkins: CHECKINS }, opts)); env.fo.foSetup(); const token = await env.login(); return { env, token }; }

test('analytics studio: charts and dashboards persist with full definitions; unknown metrics refused; role-checked', async () => {
  const { env, token } = await ready();
  const c = env.api({ action: 'f.chart.save', token, chart: { title: 'Occupancy trend', metric: 'occupancy', chart_type: 'line', grain: 'week', range: 'last12m', filters: { property: 'divinestay' }, comparison: 'last_year', refresh_policy: 'daily' } });
  assert.equal(c.ok, true);
  const row = env.tab('Charts')[0];
  assert.equal(row.metric, 'occupancy'); assert.equal(row.grain, 'week'); assert.equal(row.comparison, 'last_year'); assert.equal(JSON.parse(row.filters).property, 'divinestay'); assert.ok(row.created_at);
  assert.match(env.api({ action: 'f.chart.save', token, chart: { metric: 'nonsense' } }).error, /metric/);
  const dup = env.api({ action: 'f.chart.save', token, chart: Object.assign({}, c.record, { chart_id: '', title: 'Copy' }) });
  assert.equal(dup.ok, true); assert.notEqual(dup.record.chart_id, c.record.chart_id);
  const d = env.api({ action: 'f.dashboard.save', token, dashboard: { name: 'Monday', charts: [c.record.chart_id, dup.record.chart_id] } });
  assert.deepEqual(JSON.parse(env.tab('Dashboards')[0].charts), [c.record.chart_id, dup.record.chart_id]);
  const data = env.api({ action: 'f.data', token });
  assert.equal(data.charts.length, 2); assert.equal(data.dashboards.length, 1);
  assert.equal(env.api({ action: 'f.chart.delete', token, chart_id: dup.record.chart_id }).ok, true);
  env.setUserRole('viewer');
  assert.match(env.api({ action: 'f.chart.save', token, chart: { metric: 'adr' } }).error, /role/);
  assert.equal(d.ok, true);
});

test('expenses and budgets: validated, audited, deletable only by the founder', async () => {
  const { env, token } = await ready();
  assert.match(env.api({ action: 'f.expense.save', token, expense: { date: '2026-10-01', category: 'staff', amount: 0 } }).error, /amount/);
  assert.match(env.api({ action: 'f.expense.save', token, expense: { date: '2026-10-01', category: 'yachts', amount: 5 } }).error, /category/);
  const e = env.api({ action: 'f.expense.save', token, expense: { date: '2026-10-01', category: 'staff', amount: '25,000', basis: 'actual', property_id: 'all', vendor: '=HYPERLINK("x")' } });
  assert.equal(e.ok, true); assert.equal(env.tab('Expenses')[0].amount, '25000');
  const edit = env.api({ action: 'f.expense.save', token, expense: Object.assign({}, e.record, { amount: 26000 }) });
  assert.equal(edit.ok, true); assert.equal(env.tab('Expenses').length, 1); assert.equal(env.tab('Expenses')[0].amount, '26000');
  assert.equal(env.api({ action: 'f.budget.save', token, budget: { month: '2026-10', category: 'staff', amount: 24000 } }).ok, true);
  assert.ok(env.tab('Audit').some(a => a.action === 'expenses_edit'));
  env.setUserRole('manager');
  assert.match(env.api({ action: 'f.expense.delete', token, expense_id: e.record.expense_id }).error, /role/);
});

test('events and decision log', async () => {
  const { env, token } = await ready();
  assert.equal(env.api({ action: 'f.event.save', token, event: { name: 'Shravan 2027', start: '2027-07-20', end: '2027-08-18', kind: 'festival', source: 'Mahakal temple notice' } }).ok, true);
  assert.match(env.api({ action: 'f.event.save', token, event: { name: 'Bad', start: '2027-07-20', end: '2027-07-01' } }).error, /dates/);
  const d = env.api({ action: 'f.decision.save', token, decision: { rec_key: 'grow_direct', title: 'Grow direct bookings', status: 'accepted', follow_up_metric: 'Direct share', baseline: '40%', review_date: '2026-12-15' } });
  assert.equal(d.ok, true);
  env.api({ action: 'f.decision.save', token, decision: Object.assign({}, d.record, { status: 'implemented', outcome: 'Direct share rose to 48%' }) });
  const row = env.tab('Decisions')[0];
  assert.equal(row.status, 'implemented'); assert.equal(row.outcome, 'Direct share rose to 48%'); assert.equal(row.decided_by, 'founder@example.com');
});

test('scheduled jobs: run once a day after 07:00 IST, idempotent, without anyone signed in', async () => {
  const { env } = await ready();
  env.clock.advance(-6 * 3600000);   // 06:00 IST
  env.fo.foHourly();
  assert.equal(env.tab('Snapshots').length, 0, 'not before 07:00');
  env.clock.advance(2 * 3600000);    // 08:00 IST, Friday 16 Oct 2026
  env.fo.foHourly();
  assert.equal(env.tab('Snapshots').length, 1);
  const reps = env.tab('Reports');
  assert.deepEqual(reps.map(r => r.type), ['daily'], 'Friday: only the daily brief is due');
  assert.equal(reps[0].period_key, '2026-10-15'); assert.ok(reps[0].pdf_id && reps[0].html_id);
  assert.equal(reps[0].emailed, '', 'no email until the founder opts in');
  env.fo.foHourly(); env.fo.foHourly();
  assert.equal(env.tab('Reports').length, 1); assert.equal(env.tab('Snapshots').length, 1);
  assert.ok(env.tab('Jobs').every(j => j.status === 'ok'));
});

test('scheduled reports: Monday adds the weekly review; the 1st adds monthly/quarterly; email only when opted in', async () => {
  const { env, token } = await ready();
  env.api({ action: 'f.settings.save', token, settings: { report_email: 'weekly,monthly,bogus' } });
  assert.equal(env.tab('Settings').find(s => s.key === 'report_email').value, 'weekly,monthly');
  env.clock.advance(3 * 86400000);   // Monday 19 Oct 2026, 12:00 IST
  const before = env.mails.length;
  env.fo.foHourly();
  const types = env.tab('Reports').map(r => r.type).sort();
  assert.deepEqual(types, ['daily', 'weekly']);
  const weekly = env.tab('Reports').find(r => r.type === 'weekly');
  assert.equal(weekly.period_key, '2026-10-12'); assert.ok(weekly.emailed);
  assert.equal(env.mails.length, before + 1, 'only the opted-in weekly report was emailed');
  env.clock.advance(13 * 86400000);  // Sunday 1 Nov 2026
  env.fo.foHourly();
  assert.ok(env.tab('Reports').some(r => r.type === 'monthly' && r.period_key === '2026-10'));
});

test('on-demand report: idempotent unless forced; HTML retrievable; data freshness stored', async () => {
  const { env, token } = await ready();
  const a = env.api({ action: 'f.report.run', token, type: 'monthly' });
  assert.equal(a.status, 'ok'); assert.ok(a.report.data_freshness);
  assert.equal(env.api({ action: 'f.report.run', token, type: 'monthly' }).status, 'exists');
  assert.equal(env.api({ action: 'f.report.run', token, type: 'monthly', force: true }).status, 'ok');
  const g = env.api({ action: 'f.report.get', token, report_id: a.report.report_id });
  assert.match(g.html, /Monthly MIS/); assert.match(g.html, /Metric definitions/);
  assert.match(env.api({ action: 'f.report.run', token, type: 'hourly' }).error, /Unknown/);
});

test('GA4: honest "not connected" when the Data API service is off; never fakes numbers', async () => {
  const { env, token } = await ready();
  const r = env.api({ action: 'f.ga4', token, from: '2026-10-01', to: '2026-10-15' });
  assert.equal(r.ga.connected, false); assert.match(r.ga.reason, /not enabled/);
});

test('GA4: server-side report with the live hostname filter; funnel and purchase dedupe data; cached; errors reported', async () => {
  const calls = [];
  const rows = (dims, mets, vals) => ({ rows: vals.map(v => ({ dimensionValues: dims.map((_, i) => ({ value: String(v[i]) })), metricValues: mets.map((_, i) => ({ value: String(v[dims.length + i]) })) })) });
  const analytics = { Properties: { batchRunReports(b, prop) { return { reports: b.requests.map(r => this.runReport(r, prop)) }; }, runReport(req, prop) {
    calls.push({ req, prop });
    const d = req.dimensions.map(x => x.name), m = req.metrics.map(x => x.name);
    if (!d.length) return rows([], m, [[40, 52, 70, 45, 0.64, 12, 300]]);
    if (d[0] === 'date') return rows(d, m, [['20261002', 5, 7, 4], ['20261001', 4, 6, 3]]);
    if (d[0] === 'eventName') return rows(d, m, [['whatsapp_click', 9, 8], ['enquiry_sheet_open', 6, 5], ['enquiry_form_submit', 3, 3], ['phone_click', 1, 1], ['purchase', 2, 1]]);
    if (d[0] === 'pagePath') return rows(d, m, [['/villas/divinestay.html', 20, 15], ['/villas/ap-suite.html', 10, 8]]);
    if (d[0] === 'transactionId') return rows(d, m, [['T1', 2, 5000]]);
    return rows(d, m, [['x', 10, 5, 1]].map(r => r.slice(0, d.length + m.length)));
  } } };
  const { env, token } = await ready({ analytics });
  const g = env.api({ action: 'f.ga4', token, from: '2026-10-01', to: '2026-10-15' }).ga;
  assert.equal(g.connected, true); assert.equal(g.totals.sessions, 70);
  assert.deepEqual(g.daily.map(x => x.date), ['2026-10-01', '2026-10-02']);
  assert.deepEqual(g.funnel.map(f => f[1]), [70, 30, 6, 3, 10, 2]);
  assert.equal(g.purchases[0].eventCount, 2, 'duplicate purchase for one transaction is visible');
  assert.equal(g.intent, 13);
  assert.equal(calls[0].prop, 'properties/558430227');
  assert.ok(calls.every(c => JSON.stringify(c.req.dimensionFilter).includes('www.apvillasandresorts.in')), 'localhost/test traffic excluded');
  const n = calls.length; env.api({ action: 'f.ga4', token, from: '2026-10-01', to: '2026-10-15' });
  assert.equal(calls.length, n, 'cached for 30 minutes');
  const { env: env2, token: t2 } = await ready({ analytics: { Properties: { batchRunReports() { throw new Error('User does not have sufficient permissions (403)'); } } } });
  const bad = env2.api({ action: 'f.ga4', token: t2, from: '2026-10-01', to: '2026-10-15' }).ga;
  assert.equal(bad.connected, false); assert.match(bad.reason, /refused access/);
  assert.ok(env2.tab('Audit').some(a => a.action === 'ga4_error'));
});

test('a failed scheduled step is logged and retried on the next hourly run', async () => {
  const { env } = await ready();
  env.clock.advance(-2 * 3600000);   // 10:00 IST
  const real = env.files.set.bind(env.files); let fail = true;
  env.files.set = (k, v) => { if (fail) throw new Error('Drive unavailable'); return real(k, v); };
  env.fo.foHourly();
  assert.ok(env.tab('Jobs').some(j => j.job === 'reports' && j.status === 'failed'));
  assert.equal(env.tab('Settings').find(s => s.key === 'last_daily'), undefined, 'day not marked done');
  fail = false; env.fo.foHourly();
  assert.equal(env.tab('Reports').filter(r => r.type === 'daily').length, 1);
  assert.ok(env.tab('Settings').find(s => s.key === 'last_daily'));
});

test('daily work never runs twice at once (another execution holding the lock makes it skip, then it runs once)', async () => {
  const { env } = await ready();
  env.lock.held = true;
  assert.equal(env.fo.foDailyIfDue_(), 'busy');
  assert.equal(env.tab('Reports').length, 0);
  env.lock.held = false;
  assert.equal(env.fo.foDailyIfDue_(), 'done');
  assert.equal(env.fo.foDailyIfDue_(), 'not due');
  assert.equal(env.tab('Reports').filter(r => r.type === 'daily').length, 1);
});

test('a daily run already in progress (another execution) makes a second one skip, without holding the lock', async () => {
  const { env } = await ready();
  env.props.set('FO_DAILY_RUN', String(env.clock.now()));
  assert.equal(env.fo.foDailyIfDue_(), 'busy');
  env.clock.advance(16 * 60000);   // a crashed run's flag expires after 15 minutes
  assert.equal(env.fo.foDailyIfDue_(), 'done');
  assert.equal(env.props.has('FO_DAILY_RUN'), false);
});
