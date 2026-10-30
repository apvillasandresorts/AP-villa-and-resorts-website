// Market intelligence, pricing settings and the automation key (docs/founder-os/FoMarket.gs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './gas-mock.mjs';

async function ready() { const env = makeEnv({ checkins: [{ 'Submitted at': '2026-10-01T10:00:00', Reference: 'ECI-1', 'Booked through': 'Booking.com', 'Booking ID': 'BC1', Villa: 'Divinestay', 'Check-in': '2026-10-20', 'Check-out': '2026-10-22', 'Main guest': 'Asha Rao', Mobile: '9876543210', Email: 'asha@example.com', 'Total ₹': 11000 }] }); env.fo.foSetup(); return { env, token: await env.login() }; }

test('automation key: founder-only, shown once, stored only as a digest, rotatable and revocable', async () => {
  const { env, token } = await ready();
  const k = env.api({ action: 'f.automation.create', token });
  assert.match(k.key, /^apv_/);
  assert.ok(![...env.props.values()].some(v => v.includes(k.key)), 'raw key never stored');
  assert.equal(env.api({ action: 'f.m.ping', key: k.key }).pong, true);
  assert.equal(env.api({ action: 'f.data', token }).automation.active, true);
  const k2 = env.api({ action: 'f.automation.create', token });
  assert.equal(env.api({ action: 'f.m.ping', key: k.key }).auth, false, 'rotation kills the old key');
  assert.equal(env.api({ action: 'f.m.ping', key: k2.key }).ok, true);
  env.api({ action: 'f.automation.revoke', token });
  assert.equal(env.api({ action: 'f.m.ping', key: k2.key }).auth, false);
  env.setUserRole('manager');
  assert.match(env.api({ action: 'f.automation.create', token }).error, /role/);
});

test('automation key: only machine actions; never founder actions; summary has no guest data', async () => {
  const { env, token } = await ready();
  const { key } = env.api({ action: 'f.automation.create', token });
  assert.match(env.api({ action: 'f.data', key }).error, /not allowed/);
  assert.match(env.api({ action: 'f.booking.save', key, booking: {} }).error, /not allowed/);
  assert.match(env.api({ action: 'f.automation.create', key }).error, /not allowed/);
  const s = JSON.stringify(env.api({ action: 'f.m.summary', key }));
  assert.ok(!/Asha|9876543210|asha@example|BC1|ECI-1/.test(s), 'aggregates only');
  assert.match(s, /last_90/); assert.match(s, /pricing_next_30/);
  assert.equal(env.api({ action: 'f.m.ping', key: 'apv_' + 'x'.repeat(60) }).auth, false);
});

test('market import: idempotent, validated, competitors merged by name, dated observations kept', async () => {
  const { env, token } = await ready();
  const { key } = env.api({ action: 'f.automation.create', token });
  const payload = { competitors: [{ name: 'Hotel Example Ujjain', type: 'hotel', website: 'https://example.com', positioning: 'Near Mahakal' }, { name: '' }],
    rates: [{ competitor: 'Hotel Example Ujjain', observed_at: '2026-10-15', stay_date: '2026-11-08', nights: 2, price_total: 9000, bedrooms: 1, source_type: 'website', source_url: 'https://example.com/rates' }, { competitor: 'Bad', price_per_night: 0 }],
    signals: [{ date: '2026-10-15', source: 'trends', metric: 'search_growth', keyword: 'mahakal', growth_pct: 30 }] };
  const a = env.api({ action: 'f.m.market.import', key, ...payload }).result;
  assert.deepEqual([a.competitors, a.rates, a.signals, a.rejected], [1, 1, 1, 2]);
  assert.equal(env.tab('MarketRates')[0].price_per_night, '4500', 'per night from total ÷ nights');
  const b = env.api({ action: 'f.m.market.import', key, ...payload }).result;
  assert.deepEqual([b.rates, b.signals, b.skipped], [0, 0, 2], 'same observations skipped');
  assert.equal(env.tab('Competitors').length, 1, 'merged by name');
  assert.ok(env.tab('Audit').some(x => x.actor === 'automation' && x.action === 'f.m.market.import'));
  const d = env.api({ action: 'f.data', token });
  assert.equal(d.market_rates.length, 1); assert.equal(d.demand_signals.length, 1);
});

test('market records from the portal; javascript: links refused', async () => {
  const { env, token } = await ready();
  const r = env.api({ action: 'f.market.save', token, kind: 'competitor', record: { name: 'Villa X', website: 'javascript:alert(1)' } });
  assert.equal(r.ok, true); assert.equal(env.tab('Competitors')[0].website, '');
  assert.match(env.api({ action: 'f.market.save', token, kind: 'rate', record: { competitor: 'Villa X' } }).error, /price/);
  const o = env.api({ action: 'f.market.save', token, kind: 'rate', record: { competitor: 'Villa X', price_per_night: 7000, bedrooms: 3, source_type: 'ota' } });
  assert.equal(env.api({ action: 'f.market.delete', token, kind: 'rate', id: o.record.obs_id }).ok, true);
});

test('pricing settings: validated and stored; the engine reads them', async () => {
  const { env, token } = await ready();
  const r = env.api({ action: 'f.pricing.settings', token, pricing: { market_weight: 0.5, weekend_uplift: 5, villas: { divinestay: { base: 6000, floor: 5000, ceiling: 9000 }, nowhere: { base: 1 }, 'ap-suite': { floor: 9000, ceiling: 5000 } } } });
  assert.equal(r.pricing.market_weight, 0.5); assert.equal(r.pricing.weekend_uplift, 1, 'capped');
  assert.deepEqual(Object.keys(r.pricing.villas), ['divinestay'], 'unknown villa and floor>ceiling dropped');
  assert.equal(env.api({ action: 'f.data', token }).settings.pricing, JSON.stringify(r.pricing));
});

test('market report upload: sanitised, archived, idempotent per month', async () => {
  const { env, token } = await ready();
  const { key } = env.api({ action: 'f.automation.create', token });
  const html = '<html><body><h1>Market</h1><script>alert(1)</script><img src=x onerror="alert(1)">' + 'x'.repeat(300) + '</body></html>';
  const a = env.api({ action: 'f.m.report.upload', key, type: 'market', period_key: '2026-10', html });
  assert.equal(a.status, 'ok');
  const g = env.api({ action: 'f.report.get', token, report_id: a.report_id });
  assert.doesNotMatch(g.html, /<script|onerror/);
  assert.equal(env.api({ action: 'f.m.report.upload', key, type: 'market', period_key: '2026-10', html }).status, 'exists');
  assert.match(env.api({ action: 'f.m.report.upload', key, type: 'daily', html }).error, /market/);
});

test('Ujjain keyword report: automation key only, one day replaces itself, bundled for the SEO tab, setting for Keyword Planner volume', async () => {
  const { makeEnv } = await import('./gas-mock.mjs');
  const env = makeEnv(); env.fo.foSetup(); const token = await env.login();
  const { key } = env.api({ action: 'f.automation.create', token });
  const body = { action: 'f.m.searchkw.import', key, date: '2026-10-16', fetched_at: '2026-10-16T01:00:00Z', anchor: 'ujjain hotel',
    keywords: [{ keyword: 'Ujjain Hotel', kinds: 'top 24h, top 7d', latest: 92, latest_date: '2026-10-15', avg7: 88, avg30: 100, change: -12, series: [100, 95, 88] }, { keyword: 'nivasam villa ujjain', kinds: 'rising 7d', rising: 'Breakout', series: [] }],
    suggestions: [{ seed: 'ujjain hotel', phrase: 'ujjain hotel near mahakal temple for family' }], wiki: [{ lang: 'en', article: 'Ujjain', series: [{ date: '2026-10-15', value: 394 }] }] };
  const r = env.api(body); assert.equal(r.ok, true, r.error); assert.deepEqual(r.result, { keywords: 2, extra: 2 });
  env.api(body); assert.equal(env.tab('SearchKeywords').length, 2, 'same day replaced, not doubled');
  assert.equal(env.tab('SearchKeywords')[0].keyword, 'ujjain hotel');
  assert.match(env.api(Object.assign({}, body, { key: undefined, token })).error || '', /Unknown action|role/);
  const d = env.api({ action: 'f.data', token: await env.login() });
  assert.equal(d.search_keywords.length, 2); assert.equal(d.search_extra.length, 2);
  env.api({ action: 'f.settings.save', token, settings: { seo_anchor_volume: '2400' } });
  assert.equal(env.api({ action: 'f.data', token: await env.login() }).settings.seo_anchor_volume, '2400');
});

test('nightly copy to AP Apeiron: off without a key; only allowlisted fields leave; once a day; a mismatch or failure emails and never breaks the hour', async () => {
  const calls = []; let reply = { code: 200, body: JSON.stringify({ matched: true, mismatches: 0, db: { bookings: 1 } }) };
  const env = makeEnv({ http: r => { calls.push(r); return reply; } }); env.fo.foSetup(); const token = await env.login();
  env.api({ action: 'f.booking.save', token, booking: { property_id: 'ap-suite', guest_name: 'Asha Secret', guest_phone: '9876543210', guest_email: 'asha@example.com', channel: 'Direct', checkin: '2026-11-10', checkout: '2026-11-12', gross_amount: 10000, status: 'confirmed', notes: 'allergic to nuts' } });
  assert.equal(env.fo.foCloudSyncIfDue_(), 'off'); assert.equal(calls.length, 0);
  env.props.set('FO_CLOUD_URL', 'https://x.supabase.co'); env.props.set('FO_CLOUD_KEY', 'test-key'); env.props.set('FO_CLOUD_ORG', 'ap-villasandresorts'); env.props.set('FO_CLOUD_CITY', 'Ujjain');
  const hour = () => new Date(env.clock.now() + 330 * 60000).getUTCHours(); while (hour() !== 2) env.clock.advance(3600000);
  assert.equal(env.fo.foCloudSyncIfDue_(), 'not due');
  env.clock.advance(3600000); assert.match(env.fo.foCloudSyncIfDue_(), /^matched/);
  const body = calls[0].payload; assert.doesNotMatch(body, /Asha|9876543210|example\.com|allergic|guest_name|guest_id/);
  const sent = JSON.parse(body).payload; assert.equal(sent.bookings.length, env.tab('Bookings').length); assert.equal(sent.totals.gross, 10000);
  assert.ok(sent.bookings.every(b => Object.keys(b).length === 17)); assert.match(calls[1].url, /check_months/); assert.deepEqual(Object.values(JSON.parse(calls[1].payload).source)[0], { bookings: 1, nights: 2, gross: 10000, retained: Object.values(JSON.parse(calls[1].payload).source)[0].retained }); assert.doesNotMatch(calls[1].payload, /Asha|9876543210/); assert.match(calls[2].url, /refresh_learning/);
  assert.equal(env.fo.foCloudSyncIfDue_(), 'not due', 'once a day'); assert.equal(calls[0].headers.apikey, 'test-key');
  env.clock.advance(864e5); reply = { code: 200, body: JSON.stringify({ matched: false, db: {} }) }; assert.match(env.fo.foCloudSyncIfDue_(), /MISMATCH/); assert.ok(env.mails.some(m => /nightly copy/.test(m.subject)));
  env.clock.advance(864e5); reply = { code: 500, body: 'boom' }; assert.match(env.fo.foCloudSyncIfDue_(), /500/);
});
