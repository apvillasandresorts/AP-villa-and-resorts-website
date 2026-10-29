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

test('broker holdings CSV: Zerodha Console (preamble), Kite, Groww by ISIN', () => {
  const zerodha = 'Client ID,AB1234\n\nSymbol,ISIN,Sector,Quantity Available,Quantity Discrepant,Average Price,Previous Closing Price\nRELIANCE,INE002A01018,Oil,10,0,1250.5,1300\nGOLDBEES-BE,INF204KB17I5,,100,0,60,117\nTCS,INE467B01029,IT,0,0,3000,3100\n';
  assert.deepEqual(C.parseHoldingsCsv(zerodha), [{ symbol: 'RELIANCE', units: 10, avg_cost: 1250.5 }, { symbol: 'GOLDBEES', units: 100, avg_cost: 60 }]);
  const kite = '"Instrument","Qty.","Avg. cost","LTP"\n"INFY","5","1,500.00","1600"\n"INFY","5","1,700.00","1600"\n';
  assert.deepEqual(C.parseHoldingsCsv(kite), [{ symbol: 'INFY', units: 10, avg_cost: 1600 }]);
  const groww = 'Stock Name,ISIN,Quantity,Average buy price,Closing price\nHDFC Bank Ltd,INE040A01034,4,1500,1600\nUnknown,INE000000000,1,10,10\n';
  assert.deepEqual(C.parseHoldingsCsv(groww, { INE040A01034: 'HDFCBANK' }), [{ symbol: 'HDFCBANK', units: 4, avg_cost: 1500 }]);
  assert.deepEqual(C.parseHoldingsCsv('a,b\n1,2'), []);
});

test('valuation lab: WACC, DCF, reverse DCF, sensitivity, banks, relative', () => {
  const w = C.wacc({ rf: 0.07, beta: 1.2, erp: 0.06, kd: 0.09, tax: 0.25, wd: 0.2 });
  close(w.ke, 0.142); close(w.wacc, 0.142 * 0.8 + 0.0675 * 0.2);
  // no growth, no reinvestment, flat margin: value = NOPAT / WACC (perpetuity) minus net debt
  const flat = { revenue: 1000, g1: 0, gT: 0, margin0: 0.2, margin: 0.2, tax: 0.25, s2c: 2, wacc: 0.1, netDebt: 100, shares: 10, roicT: 0.15 };
  close(C.dcf(flat).ev, 150 / 0.1, 1e-6); close(C.dcf(flat).per_share, (1500 - 100) / 10, 1e-6);
  const base = Object.assign({}, flat, { g1: 0.12, gT: 0.05, margin0: 0.15, margin: 0.2, fade: true });
  const v = C.dcf(base); assert.equal(v.rows.length, 10); close(v.rows[9].growth, 0.05); close(v.rows[4].margin, 0.2);
  assert.ok(v.tv_share > 0.4 && v.tv_share < 0.95);
  close(C.reverseDcf(v.per_share, base), 0.12, 1e-4);
  const g = C.sensitivity(base, [0.09, 0.1, 0.11], [0.04, 0.05]); assert.ok(g[0][0] > g[2][0] && g[1][1] > g[1][0]);
  const sc = C.scenarios(base); assert.ok(sc[0].per_share < sc[1].per_share && sc[1].per_share < sc[2].per_share);
  assert.match(C.dcf(Object.assign({}, base, { wacc: 0.04 })).error, /WACC/);
  close(C.residualIncome({ bvps: 500, roe: 0.16, g: 0.08, ke: 0.13 }).pb, 1.6);
  assert.deepEqual(C.relative({ eps: 50, pe: 20, bvps: 0, ebitda: 300, ev_ebitda: 10, netDebt: 500, shares: 10 }).map(r => Math.round(r.per_share)), [1000, 250]);
});
