// Metric dictionary (founder/metrics.js): the same file the portal and the Apps Script reports use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../../founder/metrics.js');

const props = [
  { property_id: 'a', name: 'A', units: 1, active: 'yes' },
  { property_id: 'b', name: 'B', units: 1, active: 'yes' },
];
const channels = [{ channel: 'Direct · WhatsApp', kind: 'direct' }, { channel: 'Booking.com', kind: 'ota', commission_pct: 15 }, { channel: 'Airbnb', kind: 'ota', commission_pct: '' }];
const bk = (o) => Object.assign({ status: 'confirmed', discount: '', taxes: '', commission: '', created_basis: 'entered' }, o);
const data = {
  today: '2026-10-16', properties: props, channels, blocks: [], payments: [],
  bookings: [
    // 3 nights across the month end: 30 Oct, 31 Oct, 1 Nov · ₹9,000 → ₹3,000 per night
    bk({ booking_id: 'X1', property_id: 'a', channel: 'Booking.com', checkin: '2026-10-30', checkout: '2026-11-02', nights: 3, gross_amount: 9000, created_at: '2026-10-01T23:50:00+05:30' }),
    // 2 nights in October, ₹1,000 discount, ₹400 tax recorded → net ₹4,600
    bk({ booking_id: 'X2', property_id: 'b', channel: 'Direct · WhatsApp', checkin: '2026-10-10', checkout: '2026-10-12', nights: 2, gross_amount: 6000, discount: 1000, taxes: 400, created_at: '2026-10-05T09:00:00+05:30' }),
    bk({ booking_id: 'X3', property_id: 'b', channel: 'Airbnb', checkin: '2026-10-20', checkout: '2026-10-21', nights: 1, gross_amount: 5000, created_at: '2026-10-06T09:00:00+05:30', status: 'cancelled', retained_amount: 1000 }),
    bk({ booking_id: 'V', property_id: 'a', channel: 'Direct · WhatsApp', checkin: '2026-10-03', checkout: '2026-10-05', nights: 2, gross_amount: 99999, created_at: '2026-10-02T09:00:00+05:30', status: 'void' }),
  ],
};

test('cross-month stays: revenue and nights land on the right stay dates', () => {
  const oct = M.compute(data, '2026-10-01', '2026-10-31'), nov = M.compute(data, '2026-11-01', '2026-11-30');
  assert.equal(oct.occupied_nights, 2 + 2);          // X1 30–31 Oct + X2
  assert.equal(nov.occupied_nights, 1);              // X1 1 Nov
  assert.equal(oct.net_accommodation_revenue, 6000 + 4600);
  assert.equal(nov.net_accommodation_revenue, 3000);
});

test('occupancy, ADR and RevPAR follow the documented formulas (villa-nights)', () => {
  const m = M.compute(data, '2026-10-01', '2026-10-31');
  assert.equal(m.available_nights, 2 * 31);
  assert.equal(m.occupancy, 4 / 62);
  assert.equal(m.adr, 10600 / 4);
  assert.equal(m.revpar, 10600 / 62);
  assert.ok(Math.abs(m.revpar - m.occupancy * m.adr) < 1e-9, 'RevPAR = occupancy × ADR');
});

test('void records never count; cancelled bookings count as booking attempts but never as occupied nights', () => {
  const m = M.compute(data, '2026-10-01', '2026-10-31');
  assert.equal(m.bookings_made, 3);
  assert.equal(m.gross_booking_value, 9000 + 6000 + 5000);
  assert.equal(m.confirmed_booking_value, 9000 + 5000);
  assert.equal(m.cancellation_rate, 1 / 3);
  assert.equal(m.retained_fees, 1000);
  assert.ok(M.nights(data, '2026-10-20', '2026-10-20').length === 0);
});

test('booking value, revenue and cash are different numbers', () => {
  const d = Object.assign({}, data, { payments: [
    { booking_id: 'X1', type: 'payment', amount: 4000, date: '2026-10-02' },
    { booking_id: 'X2', type: 'payment', amount: 5000, date: '2026-10-05' },
    { booking_id: 'X2', type: 'refund', amount: 500, date: '2026-10-13' },
  ] });
  const m = M.compute(d, '2026-10-01', '2026-10-31');
  assert.equal(m.cash_collected, 9000); assert.equal(m.refunds, 500);
  // receivables: X1 9000 − 4000 = 5000; X2 (6000 − 1000) − 5000 + 500 = 500
  assert.equal(m.outstanding_receivables, 5500); assert.equal(m.outstanding_bookings, 2);
});

test('commission: recorded > estimated from channel rate > unknown (never guessed)', () => {
  assert.deepEqual(M.commissionOf(data.bookings[0], channels), { amount: 1350, basis: 'estimated' });
  assert.deepEqual(M.commissionOf(Object.assign({}, data.bookings[0], { commission: 1500 }), channels), { amount: 1500, basis: 'recorded' });
  assert.deepEqual(M.commissionOf(data.bookings[1], channels), { amount: 0, basis: 'direct' });
  assert.deepEqual(M.commissionOf(data.bookings[2], channels), { amount: 0, basis: 'unknown' });
  const m = M.compute(data, '2026-10-01', '2026-10-31');
  assert.deepEqual(m.commission_basis, { recorded: 0, estimated: 1, direct: 1, unknown: 1 });
  assert.equal(m.contribution_margin, null, 'never fabricated without costs');
});

test('maintenance blocks reduce available nights (end date is the first free night)', () => {
  const d = Object.assign({}, data, { blocks: [{ property_id: 'a', start: '2026-10-05', end: '2026-10-08' }] });
  assert.equal(M.available(d, '2026-10-01', '2026-10-31'), 62 - 3);
  assert.equal(M.available(d, '2026-10-07', '2026-10-07'), 1);
});

test('time zone: a booking made at 23:50 IST counts on that IST date', () => {
  const m = M.compute(data, '2026-10-01', '2026-10-01');
  assert.equal(m.bookings_made, 1);
  assert.equal(M.compute(data, '2026-10-02', '2026-10-02').bookings_made, 0, 'void excluded, X1 not shifted to UTC date');
});

test('lead time: proxy dates (e-check-in) are kept apart from real booking dates', () => {
  const d = Object.assign({}, data, { bookings: data.bookings.concat([bk({ booking_id: 'P', property_id: 'a', channel: 'Booking.com', checkin: '2026-10-25', checkout: '2026-10-26', gross_amount: 5000, created_at: '2026-10-24T10:00:00+05:30', created_basis: 'proxy: e-check-in submitted' })]) });
  const m = M.compute(d, '2026-10-01', '2026-10-31');
  assert.equal(m.lead_time_n, 3); assert.equal(m.lead_time_proxy_n, 1); assert.equal(m.lead_time_proxy_avg, 1);
  assert.equal(m.lead_time_median, 14);
});

test('direct share by count and value; filters by villa and channel', () => {
  const m = M.compute(data, '2026-10-01', '2026-10-31');
  assert.equal(m.direct_share_count, 1 / 3); assert.equal(m.direct_share_value, 6000 / 20000);
  assert.equal(M.compute(data, '2026-10-01', '2026-10-31', { property: 'a' }).available_nights, 31);
  assert.equal(M.compute(data, '2026-10-01', '2026-10-31', { channel: 'Airbnb' }).bookings_made, 1);
});

test('date ranges and comparisons', () => {
  assert.deepEqual(M.range('prev_month', '2026-03-15'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(M.range('prev_month', '2026-01-10'), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(M.range('qtd', '2026-11-20'), { from: '2026-10-01', to: '2026-11-20' });
  assert.deepEqual(M.previous('2026-10-01', '2026-10-31'), { from: '2026-08-31', to: '2026-09-30' });
  assert.deepEqual(M.lastYear('2028-02-29', '2028-03-01'), { from: '2027-02-28', to: '2027-03-01' });
  assert.deepEqual(M.change(120, 100), { abs: 20, pct: 0.2 });
  assert.equal(M.change(5, null), null);
});

test('series: weekly buckets start on Monday and sum to the period totals', () => {
  const s = M.series(data, '2026-10-01', '2026-11-30', 'week');
  assert.equal(M.bucket('2026-10-18', 'week'), '2026-10-12');
  const m = M.compute(data, '2026-10-01', '2026-11-30');
  assert.equal(s.reduce((a, r) => a + r.revenue, 0), m.net_accommodation_revenue);
  assert.equal(s.reduce((a, r) => a + r.occupied, 0), m.occupied_nights);
  assert.equal(s.reduce((a, r) => a + r.available, 0), m.available_nights);
  assert.equal(s.reduce((a, r) => a + r.bookings, 0), m.bookings_made);
});

test('weekend (Fri/Sat nights) vs weekday split adds up', () => {
  const w = M.weekendSplit(data, '2026-10-01', '2026-10-31');
  assert.equal(w.weekend.occupied + w.weekday.occupied, 4);
  assert.equal(w.weekend.available + w.weekday.available, 62);
  assert.equal(w.weekend.occupied, 3, 'Fri 30 Oct, Sat 31 Oct and Sat 10 Oct');
});
