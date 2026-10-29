// Investments maths (founder/invest-calc.js): XIRR, deposits, holdings valuation from the snapshot, allocation gaps, risk profile, goal Monte Carlo, IPO verdicts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../../founder/invest-calc.js');

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, a + ' ≠ ' + b);

test('xirr and deposits', () => {
  close(C.xirr([['2021-01-01', -1000], ['2022-01-01', 1100]]), 0.10, 1e-6);
  assert.equal(C.xirr([['2021-01-01', -1000]]), null);
  close(C.deposit(100000, 8, '2025-01-01', '2026-01-01', 'yearly'), 108000, 1);
  close(C.deposit(100000, 8, '2025-01-01', '2026-01-01', 'quarterly'), 100000 * Math.pow(1.02, 4), 1);
  close(C.deposit(100000, 8, '2025-01-01', '2030-01-01', 'yearly', '2026-01-01'), 108000, 1);   // stops at maturity
  const rd = C.recurring(1000, 7, '2026-01-01', '2026-03-15');
  assert.equal(rd.paid, 3000); assert.ok(rd.value > 3000 && rd.value < 3050);
});

const SNAP = {
  prices: { RELIANCE: { close: 1300, date: '2026-10-28', kind: 'stock' }, GOLDBEES: { close: 117, date: '2026-10-28', kind: 'gold' } },
  nav: { '120503': { nav: 105.46, date: '2026-10-28', name: 'Axis ELSS Tax Saver Fund Direct Growth' }, '119551': { nav: 30, date: '2026-10-28', name: 'Some Liquid Fund' } },
  bullion: { today: { gold999: 14271, gold916: 13072 }, silver999: { last: 193442 } },
};

test('holdings are valued from NSE closes, AMFI NAVs and IBJA rates; classes and XIRR', () => {
  const asof = '2026-10-29';
  const v1 = C.value({ holding_id: 'a', kind: 'stock', symbol: 'RELIANCE', units: 10, avg_cost: 1000, start_date: '2025-10-29' }, SNAP, [], asof);
  assert.equal(v1.value, 13000); assert.equal(v1.invested, 10000); assert.equal(v1.cls, 'equity'); close(v1.xirr, 0.3, 0.002);
  const v2 = C.value({ kind: 'etf', symbol: 'GOLDBEES', units: 100, avg_cost: 100 }, SNAP, [], asof);
  assert.equal(v2.cls, 'gold');
  assert.equal(C.value({ kind: 'mf', fund_code: '119551', units: 10, avg_cost: 25, name: 'x' }, SNAP, [], asof).cls, 'debt');
  assert.equal(C.value({ kind: 'gold', units: 10, purity: '916' }, SNAP, [], asof).value, 130720);
  assert.equal(C.value({ kind: 'silver', units: 1000 }, SNAP, [], asof).value, 193442);
  assert.match(C.value({ kind: 'stock', symbol: 'NEW', units: 1, avg_cost: 50 }, SNAP, [], asof).basis, /not priced/);
  const ppf = C.value({ kind: 'ppf', current_value: 100000, value_date: '2025-10-29', rate_pct: 7.1 }, SNAP, [], asof);
  close(ppf.value, 107100, 20);
  const tx = [{ holding_id: 'b', date: '2025-10-29', type: 'buy', amount: 5000 }, { holding_id: 'b', date: '2026-04-29', type: 'buy', amount: 5000 }];
  const v3 = C.value({ holding_id: 'b', kind: 'mf', fund_code: '120503', units: 100 }, SNAP, tx, asof);
  assert.equal(v3.flows.length, 3);
});

test('portfolio: allocation, NPS split, rebalancing gaps above 5 points', () => {
  const H = [{ kind: 'stock', symbol: 'RELIANCE', units: 10, avg_cost: 1000 }, { kind: 'fd', invested: 7000, rate_pct: 0, start_date: '2026-01-01' }, { kind: 'nps', current_value: 2000 }, { kind: 'cash', current_value: 1000, status: 'closed' }];
  const p = C.portfolio(H, SNAP, [], '2026-10-29', C.ALLOC.Balanced);
  assert.equal(p.total, 22000);
  const eq = p.alloc.find(a => a.cls === 'equity'); assert.equal(eq.value, 14000);
  assert.ok(p.gaps.some(g => g.cls === 'gold' && g.amount > 0), 'no gold vs a 12% target');
});

test('risk profile: score bands, short horizon caps the profile', () => {
  assert.equal(C.profileOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).profile, 'Conservative');
  assert.equal(C.profileOf([4, 4, 4, 4, 4, 4, 4, 4, 4, 4]).profile, 'Aggressive');
  const r = C.profileOf([0, 4, 4, 4, 4, 4, 4, 4, 4, 4]); assert.equal(r.profile, 'Moderate'); assert.equal(r.capped, true);
});

test('goal Monte Carlo is deterministic and sensible', () => {
  const a = C.goal({ start: 0, sip: 10000, years: 10, target: 2000000, mu: 0.10, sigma: 0.15, paths: 4000 });
  const b = C.goal({ start: 0, sip: 10000, years: 10, target: 2000000, mu: 0.10, sigma: 0.15, paths: 4000 });
  assert.deepEqual(a, b); assert.equal(a.paid, 1200000);
  assert.ok(a.p10 < a.p50 && a.p50 < a.p90); assert.ok(a.p50 > 1800000 && a.p50 < 2200000, String(a.p50));
  assert.ok(C.goal({ sip: 20000, years: 10, target: 2000000, paths: 2000 }).prob > a.prob);
  const need = C.sipFor({ start: 0, years: 10, target: 2000000, mu: 0.10, sigma: 0.15 }, 0.8);
  assert.ok(need > 10000 && need < 20000, String(need));
});

test('IPO verdicts follow the spec rules; GMP is a multi-source range', () => {
  const base = { type: 'mainboard', price_high: 100, sub_qib: 80, sub_nii: 40, sub_retail: 10, rev_cagr: 25, pat_cagr: 30, roe: 20, roce: 22, de: 0.3, pe_post: 30, peer_pe: 32,
    gmp_json: JSON.stringify([{ source: 'A', gmp: 30, at: '2026-10-27' }, { source: 'B', gmp: 26, at: '2026-10-28' }, { source: 'A', gmp: 34, at: '2026-10-28' }]) };
  const g = C.gmpRange(base); assert.deepEqual([g.sources, g.median, g.min, g.max], [2, 30, 26, 34]);
  const v = C.ipoVerdict(base); assert.equal(v.verdict, 'Apply — listing and long term'); assert.equal(v.allot_retail, 0.1);
  assert.equal(C.ipoVerdict(Object.assign({}, base, { pe_post: 60 })).verdict, 'Apply — listing only');
  assert.equal(C.ipoVerdict(Object.assign({}, base, { red_flags: 'promoter pledge' })).verdict, 'Avoid');
  assert.equal(C.ipoVerdict(Object.assign({}, base, { sub_qib: 0.2, sub_nii: 0.1, sub_retail: 0.3, gmp_json: '[{"source":"A","gmp":-10}]' })).verdict, 'Avoid');
  const sme = C.ipoVerdict(Object.assign({}, base, { type: 'sme', sub_qib: 1, gmp_json: '[{"source":"A","gmp":80}]' }));
  assert.equal(sme.verdict, 'Avoid'); assert.ok(sme.sme_warning);
  assert.equal(C.ipoVerdict({ name: 'x' }).verdict, 'Waiting for data');
});
