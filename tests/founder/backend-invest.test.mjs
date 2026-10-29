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

// ------------------------------------------------------------ automation: GitHub OIDC sign-in, IPO board, monthly plans ------------------------------------------------------------
import crypto from 'node:crypto';
function ghKit(env) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256', use: 'sig' });
  env.net.handler = r => /token\.actions\.githubusercontent\.com\/\.well-known\/jwks/.test(r.url) ? { code: 200, body: JSON.stringify({ keys: [jwk] }) } : { code: 404, body: '' };
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return (claims, key) => {
    const now = Math.floor(env.clock.now() / 1000);
    const c = Object.assign({ iss: 'https://token.actions.githubusercontent.com', aud: 'ap-founder-os-markets', repository: 'apvillasandresorts/ap-markets', ref: 'refs/heads/main', iat: now, nbf: now, exp: now + 300 }, claims);
    const h = b64({ alg: 'RS256', typ: 'JWT', kid: 'k1' }) + '.' + b64(c);
    return h + '.' + crypto.sign('sha256', Buffer.from(h), key || privateKey).toString('base64url');
  };
}

test('the engine signs in with a GitHub OIDC token from ap-markets main only (no key to copy)', async () => {
  const { env } = await ready();
  const jwt = ghKit(env), gh = (tok, action) => env.api({ action: action || 'f.mk.ping', gh_oidc: tok });
  assert.equal(gh(jwt({})).pong, true);
  assert.match(gh(jwt({ repository: 'someone/ap-markets' })).error, /not accepted/, 'other repos are refused');
  assert.match(gh(jwt({ ref: 'refs/heads/feature' })).error, /not accepted/, 'other branches are refused');
  assert.match(gh(jwt({ aud: 'sts.amazonaws.com' })).error, /not accepted/, 'other audiences are refused');
  assert.match(gh(jwt({ exp: Math.floor(env.clock.now() / 1000) - 10 })).error, /not accepted/, 'expired tokens are refused');
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.match(gh(jwt({}, other)).error, /not accepted/, 'a token not signed by GitHub is refused');
  const t = jwt({}).split('.'); t[1] = Buffer.from(JSON.stringify({ iss: 'https://token.actions.githubusercontent.com', aud: 'ap-founder-os-markets', repository: 'apvillasandresorts/ap-markets', ref: 'refs/heads/main', exp: 9e9 })).toString('base64url');
  assert.match(gh(t.join('.')).error, /not accepted/, 'tampered claims are refused');
  assert.match(gh(jwt({}), 'f.inv.bundle').error, /not allowed|not accepted/i, 'the engine still reaches only f.mk.*');
});

test('IPO board fills itself from SEBI filings and NSE listings, never overwriting what you typed', async () => {
  const { env, call, mk } = await ready();
  const today = new Date(env.clock.now() + 330 * 60000).toISOString().slice(0, 10), ago = n => new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10);
  call('f.inv.ipo.save', { ipo: { name: 'BLS Polymers Ltd', status: 'upcoming', price_high: 120, notes: 'mine' } });
  const feed = { filings: [
    { name: 'BLS Polymers Limited', stage: 'rhp', kind: 'filing', date: ago(10), url: 'https://www.sebi.gov.in/a.html' },
    { name: 'SFC Environmental Technologies Ltd.', stage: 'rhp', kind: 'filing', date: ago(7), url: 'https://www.sebi.gov.in/b.html' },
    { name: 'Paras Healthcare Limited', stage: 'prospectus', kind: 'filing', date: ago(3), url: 'https://www.sebi.gov.in/c.html' },
    { name: 'Oravel Stays Limited', stage: 'drhp', kind: 'filing', date: ago(2), url: 'https://www.sebi.gov.in/d.html' },
    { name: 'Old Co Limited', stage: 'rhp', kind: 'filing', date: ago(200), url: 'https://www.sebi.gov.in/e.html' }],
    listings: [{ symbol: 'BLSP', name: 'BLS Polymers Limited', board: 'mainboard', listed: ago(1), list_open: 130, list_close: 128 }, { symbol: 'INDTONER', name: 'Indian Toners & Developers Limited', board: 'mainboard', listed: ago(1), list_open: 300 }] };
  assert.equal(mk('f.mk.snapshot', { snapshot: SNAP({ ipo_feed: feed }) }).ok, true);
  const L = call('f.inv.bundle').ipos, by = n => L.find(i => i.name.startsWith(n));
  assert.deepEqual([by('BLS').status, Number(by('BLS').listing_open), by('BLS').notes, Number(by('BLS').price_high)], ['listed', 130, 'mine', 120]);
  assert.equal(by('SFC').status, 'upcoming'); assert.equal(by('SFC').source_url, 'https://www.sebi.gov.in/b.html'); assert.equal(by('SFC').auto, 'yes');
  assert.equal(by('Paras').status, 'closed');
  assert.equal(L.some(i => /Oravel|Old Co|Indian Toners/.test(i.name)), false, 'drafts, stale filings and transfers stay off the board');
  call('f.inv.ipo.save', { ipo: Object.assign({}, by('SFC'), { status: 'open' }) });
  mk('f.mk.snapshot', { snapshot: SNAP({ ipo_feed: feed }) });
  assert.equal(call('f.inv.bundle').ipos.find(i => i.name.startsWith('SFC')).status, 'open', 'never moves a status backwards');
});

test('monthly plans post themselves: SIP units from the NAV, contributions grow PPF, XIRR keeps the opening money', async () => {
  const { env, call, mk } = await ready();
  const today = new Date(env.clock.now() + 330 * 60000).toISOString().slice(0, 10);
  const mf = call('f.inv.holding.save', { holding: { kind: 'mf', name: 'Index fund', fund_code: '120503', units: 100, avg_cost: 50, start_date: '2025-01-01', sip_amount: 5000, sip_day: 5 } }).holding_id;
  const ppf = call('f.inv.holding.save', { holding: { kind: 'ppf', name: 'PPF', current_value: 200000, value_date: '2025-04-01', invested: 150000, sip_amount: 10000, sip_day: 10 } }).holding_id;
  assert.match(call('f.inv.holding.save', { holding: { kind: 'fd', name: 'FD', invested: 1000, rate_pct: 7, start_date: '2026-01-01', sip_amount: 100, sip_day: 3 } }).error, /monthly investing/);
  // the plan starts from the next due date: pretend it was set up 40 days ago
  const back = new Date(Date.parse(today) - 40 * 86400000).toISOString().slice(0, 10), sh = env.dataSheet().getSheetByName('InvHoldings'), col = sh.cells[0].indexOf('sip_last') + 1;
  for (let r = 2; r <= sh.getLastRow(); r++) sh.set(r, col, back);
  env.cache.clear();
  mk('f.mk.snapshot', { snapshot: SNAP({ nav: { 120503: { nav: 62.5, date: today, name: 'Index fund' } } }) });
  const b = call('f.inv.bundle'), h = id => b.holdings.find(x => x.holding_id === id), tx = id => b.txns.filter(t => t.holding_id === id);
  const due = tx(mf).filter(t => /Monthly plan/.test(t.note));
  assert.ok(due.length >= 1 && due.length <= 2, 'one or two due dates in 40 days');
  assert.equal(Number(h(mf).units), 100 + due.length * 80, '₹5,000 at NAV 62.5 = 80 units each');
  assert.equal(tx(mf)[0].note.startsWith('Opening balance'), true); assert.equal(Number(tx(mf)[0].amount), 5000);
  assert.equal(tx(ppf).filter(t => t.type === 'deposit' && /Monthly plan/.test(t.note)).length >= 1, true);
  assert.ok(Number(h(ppf).current_value) > 200000 + 10000, 'PPF value grows by the contribution');
  const n = b.txns.length; mk('f.mk.snapshot', { snapshot: SNAP({ nav: { 120503: { nav: 62.5, date: today } } }) });
  assert.equal(call('f.inv.bundle').txns.length, n, 'a second run the same day posts nothing');
});
