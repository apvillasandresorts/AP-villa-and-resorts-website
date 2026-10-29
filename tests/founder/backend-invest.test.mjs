// Investments (docs/founder-os/FoInvest.gs) on the Apps Script mock: founder-only routes, holdings validation, the markets key
// (pull never carries real quantities, report/snapshot only), paper orders + pre-trade risk rules, bracket OCO, autopilot, alerts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './gas-mock.mjs';

async function ready() {
  const env = makeEnv(); env.fo.foSetup(); const token = await env.login();
  const call = (action, body) => env.api(Object.assign({ action, token }, body || {}));
  const key = call('f.inv.key').key;
  const mk = (action, body) => env.api(Object.assign({ action, markets_key: key }, body || {}));
  return { env, token, call, key, mk };
}
const SNAP = (extra) => Object.assign({
  asof: '2026-10-28', generated_at: '2026-10-28T17:00:00+05:30', dq: { ok: true, issues: [] }, regime: { label: 'Neutral' },
  top: [{ symbol: 'TCS' }, { symbol: 'INFY' }], model: { light: 'green', champion: { version: 'v1-logit@2026-10-25' } },
  bullion: { today: { gold999: 14271 }, gold999: { history: [['2026-10-27', 140000], ['2026-10-28', 140500]] } },
  prices: { RELIANCE: { close: 1000, kind: 'stock', sector: 'Oil Gas' }, TCS: { close: 3000, kind: 'stock', sector: 'IT' }, GOLDBEES: { close: 117, kind: 'gold' } },
  paper: {},
}, extra || {});

test('investments are founder-only and never in the shared data bundle', async () => {
  const { env, call } = await ready();
  call('f.inv.holding.save', { holding: { kind: 'fd', name: 'SBI FD', invested: 500000, rate_pct: 7.1, start_date: '2026-01-01', compounding: 'quarterly' } });
  const data = call('f.data');
  assert.equal(JSON.stringify(data).includes('SBI FD'), false, 'holdings must not leak into f.data');
  env.setUserRole('manager');
  assert.match(call('f.inv.bundle').error, /role/);
});

test('holdings: validation by kind, update in place, transactions', async () => {
  const { call } = await ready();
  assert.match(call('f.inv.holding.save', { holding: { kind: 'stock', name: 'Reliance', units: 10 } }).error, /symbol/);
  assert.match(call('f.inv.holding.save', { holding: { kind: 'mf', name: 'Index fund', units: 10 } }).error, /scheme code/);
  assert.match(call('f.inv.holding.save', { holding: { kind: 'gold', name: 'Coins' } }).error, /grams/);
  assert.match(call('f.inv.holding.save', { holding: { kind: 'stock', name: 'X', symbol: 'X', units: -1 } }).error, /number/);
  const r = call('f.inv.holding.save', { holding: { kind: 'stock', name: 'Reliance', symbol: 'reliance', units: 10, avg_cost: 1200, start_date: '2025-04-01' } });
  assert.equal(r.ok, true, r.error);
  const h = call('f.inv.bundle').holdings[0]; assert.equal(h.symbol, 'RELIANCE');
  call('f.inv.holding.save', { holding: Object.assign({}, h, { units: 15 }) });
  const b = call('f.inv.bundle'); assert.equal(b.holdings.length, 1); assert.equal(Number(b.holdings[0].units), 15);
  assert.equal(call('f.inv.txn.save', { txn: { holding_id: h.holding_id, date: '2025-04-01', type: 'buy', units: 10, price: 1200, amount: 12000 } }).ok, true);
  assert.equal(call('f.inv.bundle').txns.length, 1);
});

test('markets key: pull gives symbols and paper data but never real quantities; bad keys are refused and counted separately', async () => {
  const { env, call, mk } = await ready();
  call('f.inv.holding.save', { holding: { kind: 'stock', name: 'Reliance', symbol: 'RELIANCE', units: 123, avg_cost: 999 } });
  call('f.inv.holding.save', { holding: { kind: 'mf', name: 'Fund', fund_code: '120503', units: 77 } });
  call('f.inv.watch.add', { symbol: 'goldbees' });
  const p = mk('f.mk.pull');
  assert.equal(p.ok, true, p.error);
  assert.deepEqual(p.symbols.sort(), ['GOLDBEES', 'RELIANCE']); assert.deepEqual(p.fund_codes, ['120503']);
  assert.ok(!/123|999|77/.test(JSON.stringify(p.symbols) + JSON.stringify(p.fund_codes)) && !('holdings' in p), 'no quantities or costs leave Google');
  assert.ok(p.accounts.some(a => a.strategy === 'autopilot'), 'autopilot account created');
  assert.match(env.api({ action: 'f.mk.pull', markets_key: 'x'.repeat(50) }).error, /not accepted/);
  assert.match(env.api({ action: 'f.inv.bundle', markets_key: env.props.get('FO_MARKETS_KEY') ? 'y'.repeat(50) : '' }).error || '', /not accepted|session/);
  assert.match(mk('f.inv.bundle').error, /Not allowed/);
  // the founder can still sign in after many bad markets keys
  for (let i = 0; i < 5; i++) env.api({ action: 'f.mk.pull', markets_key: 'z'.repeat(50) });
  assert.ok(await env.login());
});

test('paper orders: validation, pre-trade risk limits, cancel; autopilot is model-only', async () => {
  const { call, mk } = await ready();
  mk('f.mk.snapshot', { snapshot: SNAP({ paper: {} }) });
  const acc = call('f.inv.account.save', { account: { name: 'Swing', starting_cash: 1000000 } }).account_id;
  assert.match(call('f.inv.order.place', { order: { account_id: acc, symbol: 'NOPE', side: 'buy', type: 'market', qty: 1 } }).error, /not in the price data/);
  assert.match(call('f.inv.order.place', { order: { account_id: acc, symbol: 'TCS', side: 'buy', type: 'limit', qty: 1 } }).error, /limit price/);
  assert.match(call('f.inv.order.place', { order: { account_id: acc, symbol: 'TCS', side: 'buy', type: 'market', qty: 1, target: 2900 } }).error, /above/);
  // with a marked account: 10 % per-stock limit
  mk('f.mk.snapshot', { snapshot: SNAP({ paper: { [acc]: { equity: 1000000, peak: 1000000, positions: [{ symbol: 'TCS', value: 90000, kind: 'stock', sector: 'IT' }] } } }) });
  assert.match(call('f.inv.order.place', { order: { account_id: acc, symbol: 'TCS', side: 'buy', type: 'market', qty: 10 } }).error, /per-stock/);
  const ok = call('f.inv.order.place', { order: { account_id: acc, symbol: 'TCS', side: 'buy', type: 'market', qty: 2 } });
  assert.equal(ok.ok, true, ok.error); assert.match(ok.note, /next trading day/);
  // drawdown pause
  mk('f.mk.snapshot', { snapshot: SNAP({ asof: '2026-10-29', paper: { [acc]: { equity: 800000, peak: 1000000, positions: [] } } }) });
  assert.match(call('f.inv.order.place', { order: { account_id: acc, symbol: 'RELIANCE', side: 'buy', type: 'market', qty: 1 } }).error, /Paused/);
  assert.equal(call('f.inv.order.cancel', { order_id: ok.order_id }).ok, true);
  assert.match(call('f.inv.order.cancel', { order_id: ok.order_id }).error, /Only open/);
  const auto = call('f.inv.bundle').accounts.find(a => a.strategy === 'autopilot');
  assert.match(call('f.inv.order.place', { order: { account_id: auto.account_id, symbol: 'TCS', side: 'buy', type: 'market', qty: 1 } }).error, /trades on its own/);
});

test('engine report: fills are idempotent, brackets create OCO legs, only the autopilot account takes engine orders', async () => {
  const { call, mk } = await ready();
  mk('f.mk.snapshot', { snapshot: SNAP() });
  const acc = call('f.inv.account.save', { account: { name: 'Swing' } }).account_id;
  const o = call('f.inv.order.place', { order: { account_id: acc, symbol: 'RELIANCE', side: 'buy', type: 'market', qty: 5, target: 1100, stop: 950 } });
  assert.equal(o.ok, true, o.error);
  const fill = { fill_id: o.order_id + '-20261029', order_id: o.order_id, account_id: acc, symbol: 'RELIANCE', side: 'buy', qty: 5, price: 1000.3, date: '2026-10-29', charges: 6 };
  const kids = [{ order_id: o.order_id + '-T', account_id: acc, symbol: 'RELIANCE', side: 'sell', type: 'limit', qty: 5, limit_price: 1100, oco_with: o.order_id + '-S' },
    { order_id: o.order_id + '-S', account_id: acc, symbol: 'RELIANCE', side: 'sell', type: 'sl-m', qty: 5, trigger_price: 950, oco_with: o.order_id + '-T' }];
  const r = mk('f.mk.report', { fills: [fill, fill], updates: [{ order_id: o.order_id, status: 'filled', filled_qty: 5, children: kids }],
    new_orders: [{ account_id: acc, symbol: 'TCS', side: 'buy', qty: 1 }, { account_id: 'PA-AUTOPILOT', symbol: 'TCS', side: 'buy', qty: 3, note: 'model top 10' }] });
  assert.equal(r.ok, true, r.error); assert.deepEqual([r.fills, r.orders], [1, 3]);
  let b = call('f.inv.bundle');
  assert.equal(b.fills.length, 1);
  assert.equal(b.orders.filter(x => x.account_id === acc && x.symbol === 'TCS').length, 0, 'engine cannot trade a manual account');
  assert.equal(b.orders.find(x => x.order_id === o.order_id + '-T').status, 'open');
  mk('f.mk.report', { updates: [{ order_id: o.order_id + '-T', status: 'filled', filled_qty: 5, cancel: o.order_id + '-S' }] });
  b = call('f.inv.bundle');
  assert.equal(b.orders.find(x => x.order_id === o.order_id + '-S').status, 'cancelled');
  const p = mk('f.mk.pull'); assert.ok(p.fills.length === 1 && !p.orders.some(x => x.order_id === o.order_id));
});

test('snapshot: stored in Drive, headline row per day, alerts once (red light, bullion > 2 %)', async () => {
  const { env, call, mk } = await ready();
  const s1 = mk('f.mk.snapshot', { snapshot: SNAP() }); assert.equal(s1.ok, true, s1.error);
  const b = call('f.inv.bundle'); assert.equal(b.snapshot.asof, '2026-10-28'); assert.equal(b.daily.length, 1); assert.equal(b.daily[0].top5, 'TCS INFY');
  const before = env.mails.length;
  mk('f.mk.snapshot', { snapshot: SNAP({ asof: '2026-10-29', model: { light: 'red', note: 'IC below zero' }, bullion: { today: { gold999: 1 }, gold999: { history: [['2026-10-28', 100], ['2026-10-29', 103]] } } }) });
  mk('f.mk.snapshot', { snapshot: SNAP({ asof: '2026-10-29', model: { light: 'red', note: 'IC below zero' }, bullion: { today: { gold999: 1 }, gold999: { history: [['2026-10-28', 100], ['2026-10-29', 103]] } } }) });
  const sent = env.mails.slice(before).map(m => m.subject);
  assert.equal(sent.filter(s => /red/.test(s)).length, 1); assert.equal(sent.filter(s => /gold moved/.test(s)).length, 1);
  assert.equal(call('f.inv.bundle').daily.length, 2, 're-sending a day updates its row');
  assert.match(mk('f.mk.snapshot', { snapshot: {} }).error, /missing/);
});

test('IPO board and risk profile', async () => {
  const { call } = await ready();
  assert.match(call('f.inv.ipo.save', { ipo: { name: 'X', price_high: 'abc' } }).error, /number/);
  const r = call('f.inv.ipo.save', { ipo: { name: 'Acme Ltd', type: 'mainboard', status: 'open', price_low: 95, price_high: 100, lot: 150, sub_qib: 40, sub_retail: 8, gmp: [{ source: 'site A', gmp: 22 }, { source: 'site B', gmp: 18 }, { gmp: 5 }] } });
  assert.equal(r.ok, true, r.error);
  const ipo = call('f.inv.bundle').ipos[0]; assert.equal(JSON.parse(ipo.gmp_json).length, 2, 'GMP without a source is dropped');
  assert.equal(call('f.inv.profile.save', { profile: { answers: [3, 3, 2, 9], profile: 'Growth' }, goals: [{ name: 'House', target: 5000000, years: 8, sip: 30000 }] }).ok, true);
  const b = call('f.inv.bundle'); assert.equal(b.profile.profile, 'Growth'); assert.deepEqual(b.profile.answers, [3, 3, 2, 4]); assert.equal(b.goals[0].years, 8);
});

test('strategy lab: rules validated, engine-run paper account, engine orders allowed only there; rollback and daily email', async () => {
  const { env, call, mk } = await ready();
  assert.match(call('f.inv.strategy.save', { strategy: { name: 'x', entry: [{ field: 'nope', op: '>', value: 1 }] } }).error, /entry rule/);
  const s = call('f.inv.strategy.save', { strategy: { name: 'Trend', entry: [{ field: 'vs_ema50', op: '>', value: 0 }], exit: [{ field: 'vs_ema50', op: '<', value: 0 }], top_n: 5 } });
  assert.equal(s.ok, true, s.error);
  const pa = call('f.inv.strategy.paper', { id: s.id }); assert.equal(pa.ok, true, pa.error);
  assert.match(call('f.inv.strategy.paper', { id: s.id }).error, /already/);
  assert.match(call('f.inv.strategy.delete', { id: s.id }).error, /close that account/);
  const p = mk('f.mk.pull'); assert.equal(p.strategies.length, 1); assert.ok(p.accounts.some(a => a.rules_id === s.id));
  mk('f.mk.snapshot', { snapshot: SNAP() });
  assert.match(call('f.inv.order.place', { order: { account_id: pa.account_id, symbol: 'TCS', side: 'buy', type: 'market', qty: 1 } }).error, /its strategy/);
  assert.equal(mk('f.mk.report', { new_orders: [{ account_id: pa.account_id, symbol: 'TCS', side: 'buy', qty: 2 }] }).orders, 1);
  assert.equal(call('f.inv.bundle').orders.find(o => o.account_id === pa.account_id).origin, 'strategy');
  assert.match(call('f.inv.model.rollback', { version: 'bad' }).error, /retired/);
  assert.equal(call('f.inv.model.rollback', { version: 'v1-logit@2026-10-25' }).ok, true);
  assert.equal(mk('f.mk.pull').control.rollback_to, 'v1-logit@2026-10-25');
  mk('f.mk.report', { control_done: { rollback_to: 'v1-logit@2026-10-25' } });
  assert.equal(mk('f.mk.pull').control, null);
  const n = env.mails.filter(m => /^Markets /.test(m.subject || '')).length;
  mk('f.mk.snapshot', { snapshot: SNAP({ asof: '2026-10-30' }) }); mk('f.mk.snapshot', { snapshot: SNAP({ asof: '2026-10-30' }) });
  assert.equal(env.mails.filter(m => /^Markets /.test(m.subject || '')).length, n + 1, 'one daily email per day');
  call('f.inv.settings.set', { daily_email: false });
  mk('f.mk.snapshot', { snapshot: SNAP({ asof: '2026-10-31' }) });
  assert.equal(env.mails.filter(m => /^Markets /.test(m.subject || '')).length, n + 1);
});
