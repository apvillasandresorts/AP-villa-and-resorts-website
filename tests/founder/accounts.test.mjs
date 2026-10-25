// Accounts: monthly ledger, P&L, month-end balance sheet, GST summary (management accounts from Founder OS records).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('../../founder/accounts.js');

const data = (extra = {}) => Object.assign({ today: '2026-11-10', properties: [{ property_id: 'ap-suite', name: 'AP Suite', active: 'yes', units: 1 }, { property_id: 'rudrangan-suites', name: 'Rudrangan Suites', active: 'yes', units: 1 }],
  channels: [{ channel: 'Airbnb', commission_pct: 15, payment_fee_pct: 0 }, { channel: 'Direct', commission_pct: 0, payment_fee_pct: 2 }],
  bookings: [
    { booking_id: 'B1', channel: 'Direct', property_id: 'ap-suite', guest_name: 'A', status: 'confirmed', checkin: '2026-10-30', checkout: '2026-11-02', nights: 3, gross_amount: 12000, discount: 0 },
    { booking_id: 'B2', channel: 'Airbnb', property_id: 'rudrangan-suites', guest_name: 'B', status: 'confirmed', checkin: '2026-11-05', checkout: '2026-11-07', nights: 2, gross_amount: 18000, discount: 0 },
    { booking_id: 'B3', channel: 'Direct', property_id: 'ap-suite', guest_name: 'C', status: 'confirmed', checkin: '2026-12-10', checkout: '2026-12-11', nights: 1, gross_amount: 5000, discount: 0 },
    { booking_id: 'B4', channel: 'Direct', property_id: 'ap-suite', guest_name: 'D', status: 'void', checkin: '2026-11-15', checkout: '2026-11-16', nights: 1, gross_amount: 10000000 }],
  payments: [{ payment_id: 'P1', booking_id: 'B1', date: '2026-10-25', type: 'payment', amount: 12000 }, { payment_id: 'P2', booking_id: 'B3', date: '2026-11-08', type: 'payment', amount: 2000 }, { payment_id: 'P3', booking_id: 'B1', date: '2026-11-03', type: 'refund', amount: 1000 }],
  expenses: [{ expense_id: 'E1', date: '2026-11-04', property_id: 'all', category: 'housekeeping', amount: 3000, basis: 'actual' }],
  settings: {} }, extra);

test('ledger: revenue and commission on the nights in the month; cash on payment dates; void bookings excluded; running balance', () => {
  const L = A.ledger(data(), '2026-11');
  assert.equal(L.totals.revenue, 4000 + 18000, 'B1 has 1 of 3 nights in November (1 Nov); B2 both nights');
  assert.equal(L.totals.commission, 2700, '15% of B2');
  assert.equal(L.totals.receipts, 2000); assert.equal(L.totals.refunds, 1000); assert.equal(L.totals.expenses, 3000);
  assert.ok(!L.lines.some(l => l.ref === 'B4'), 'void booking left out');
  assert.equal(L.lines[L.lines.length - 1].balance, Math.round((L.lines.reduce((s, l) => s + l.credit - l.debit, 0)) * 100) / 100);
});

test('P&L and balance sheet add up; GST by slab, platform bookings separate, nothing payable when not registered', () => {
  const p = A.pnl(data(), '2026-11');
  assert.equal(p.net_profit, Math.round((p.net_revenue - p.commission - p.fees - p.expenses_total) * 100) / 100);
  const bs = A.balanceSheet(data(), '2026-11');
  assert.equal(bs.assets.cash, 12000 - 1000 + 2000 - 3000);
  assert.equal(bs.liabilities.advances, 2000, 'B3 paid for a December stay');
  assert.equal(bs.equity, Math.round((bs.assets.total - bs.liabilities.total) * 100) / 100);
  const g = A.gstSummary(data(), '2026-11');
  assert.equal(g.liable_tax, 0, 'not registered');
  const plat = g.rows.find(r => r.platform), dir = g.rows.find(r => !r.platform);
  assert.equal(plat.rate, 0.18, 'B2 is ₹9,000 a night: above the slab'); assert.equal(dir.rate, 0.05);
  const reg = A.gstSummary(data({ settings: { accounts: JSON.stringify({ gst_registered: true }) } }), '2026-11');
  assert.ok(reg.liable_tax > 0 && Math.abs(reg.liable_tax - dir.tax) < 0.01, 'registered: direct GST payable');
  assert.equal(dir.cgst + dir.sgst, dir.tax);
  assert.equal(A.trend(data(), '2026-11', 3).length, 3);
});
