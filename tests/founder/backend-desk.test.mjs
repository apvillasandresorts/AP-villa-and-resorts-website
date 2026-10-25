// Live Pricing Desk back end (docs/founder-os/FoSignals.gs + founder/desk.js as FoDesk.gs), end to end on the Apps Script mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './gas-mock.mjs';

async function ready() { const env = makeEnv(); env.fo.foSetup(); return { env, token: await env.login() }; }
const NOW = '2026-10-16T06:30:00.000Z';
const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

test('signals import: validated (known id, index range, https/own_ledger source), idempotent, own-data ids refused', async () => {
  const { env, token } = await ready();
  const { key } = env.api({ action: 'f.automation.create', token });
  const r = env.api({ action: 'f.m.signals.import', key, signals: [
    { signal_id: 'holiday', for_date: '2026-11-08', index: 1.15, source_url: 'https://calendar.google.com/x', fetched_at: NOW, notes: 'Diwali' },
    { signal_id: 'weather', for_date: '2026-10-20', index: 0.9, source_url: 'https://api.met.no/x', fetched_at: NOW },
    { signal_id: 'pace', index: 1.2, source_url: 'own_ledger' }, { signal_id: 'search', index: 5, source_url: 'https://x' }, { signal_id: 'nope', index: 1, source_url: 'https://x' },
    { signal_id: 'temple', for_date: '2026-11-01', index: 1.1, source_url: 'http://insecure' } ] }).result;
  assert.equal(r.added, 2); assert.equal(r.rejected, 4);
  assert.equal(env.api({ action: 'f.m.signals.import', key, signals: [{ signal_id: 'holiday', for_date: '2026-11-08', index: 1.15, source_url: 'https://calendar.google.com/x', fetched_at: NOW }] }).result.skipped, 1, 'same signal twice is skipped');
  assert.match(env.api({ action: 'f.data', key }).error, /not allowed/, 'automation key still cannot read our data');
  assert.equal(env.api({ action: 'f.data', token }).signals.length, 2);
});

test('rate check: owner-entered prices and sold-outs stored with source, group size and target property', async () => {
  const { env, token } = await ready();
  const r = env.api({ action: 'f.ratecheck.save', token, property: 'ap-suite', stay_date: '2026-10-24', entries: [
    { competitor: 'Mahadev Mansion 2 BHK', price: 2700, platform: 'Airbnb', url: 'https://www.airbnb.co.in/rooms/1138158546480238220' },
    { competitor: 'Kanha Kasturi 2BHK', sold_out: true, platform: 'Airbnb' }, { competitor: 'Hotel Shreegopal', price: 4800, platform: 'Booking.com', tax: 'no' }, { competitor: '', price: 100 } ] });
  assert.equal(r.ok, true); assert.equal(r.result.prices, 2); assert.equal(r.result.sold_out, 1);
  const rows = env.tab('MarketRates');
  assert.ok(rows.every(x => x.target_property === 'ap-suite' && Number(x.group_size) === 4));
  assert.equal(rows.find(x => /Kanha/.test(x.competitor)).availability, 'sold out');
  assert.equal(rows.find(x => /Shreegopal/.test(x.competitor)).source_url, 'owner_check:booking.com');
  env.setUserRole('viewer');
  assert.match(env.api({ action: 'f.ratecheck.save', token, property: 'ap-suite', stay_date: '2026-10-24', entries: [{ competitor: 'X', price: 3000 }] }).error, /role/);
});

test('hourly: comp set chosen and logged, 2 properties × 90 nights stored once, unchanged nights not re-stored, brief once a day', async () => {
  const { env, token } = await ready();
  const comps = ['Mahadev Mansion 2 BHK', 'Kanha Kasturi 2BHK', 'RamRaj Family Stay', 'Nivasa 3BHK Villa', 'AvantiVilla 3BHK', 'Hotel Shreegopal', 'Om Paradise Hotel', 'Hotel Malwa Residency'];
  env.api({ action: 'f.market.import', token, competitors: comps.map((n, i) => ({ name: n, type: /Hotel/.test(n) ? 'hotel' : 'villa', bedrooms: /Hotel/.test(n) ? '' : /3BHK/.test(n) ? 3 : 2, distance_km: 1, source_url: 'https://example.com/' + i })),
    rates: comps.flatMap((n, i) => [0, 1, 2, 3].map(k => ({ competitor: n, observed_at: '2026-10-15', stay_date: addD('2026-10-16', k), nights: 1, price_per_night: 3000 + i * 400, source_url: 'https://example.com/' + i }))) });
  env.fo.foHourly();
  const recs = env.tab('Recommendations');
  assert.equal(recs.length, 180, 'both properties × 90 nights');
  assert.ok(recs.every(r => Number(r.price) % 100 === 0 && JSON.parse(r.channels).direct > 0));
  assert.ok(env.tab('CompSet').some(r => r.in_set === 'yes' && r.property === 'ap-suite'));
  assert.ok(env.tab('CompChanges').length >= 2, 'initial comp sets logged');
  const briefs = () => env.mails.filter(m => /^Price to set today/.test(m.subject || '')).length;
  assert.equal(briefs(), 1);
  env.clock.advance(3600000); env.fo.foHourly();
  assert.equal(env.tab('Recommendations').length, 180, 'nothing re-stored when nothing changed');
  assert.equal(briefs(), 1, 'brief once a day');
  const token3 = await env.login();
  const d = env.api({ action: 'f.data', token: token3 });
  assert.ok(d.recommendations, JSON.stringify(d).slice(0, 200));
  assert.ok(d.recommendations.length >= 180); assert.ok(d.comp_set.length);
  const today = env.api({ action: 'f.pricing.today', token: token3 });
  assert.ok(today.cards, JSON.stringify(today).slice(0, 300));
  assert.equal(today.cards.length, 2); assert.ok(today.cards[0].tonight.channels.booking.price > 0);
  const dt = env.api({ action: 'f.pricing.date', token: token3, property: 'rudrangan-suites', date: '2026-10-20' });
  assert.ok(dt.quote.steps.length >= 1 && dt.quote.inputs.length >= 15);
  assert.equal(env.api({ action: 'f.signals.health', token: token3 }).health.length >= 16, true);
});

test('decisions: accept or override with a reason; manager allowed, viewer not', async () => {
  const { env, token } = await ready();
  assert.match(env.api({ action: 'f.pricing.decide', token, property: 'ap-suite', for_date: '2026-10-20', recommended: 4200, set_price: 3900, accepted: false }).error, /reason/);
  const ok = env.api({ action: 'f.pricing.decide', token, property: 'ap-suite', for_date: '2026-10-20', channel: 'booking', recommended: 4200, set_price: 3900, accepted: false, reason: 'match Mahadev Mansion' });
  assert.equal(ok.decision.accepted, 'no');
  env.api({ action: 'f.pricing.decide', token, property: 'ap-suite', for_date: '2026-10-21', recommended: 4200, set_price: 4200, accepted: true });
  assert.equal(env.tab('PriceDecisions').length, 2);
  env.setUserRole('viewer');
  assert.match(env.api({ action: 'f.pricing.decide', token, property: 'ap-suite', for_date: '2026-10-22', set_price: 4000, accepted: true }).error, /role/);
});

test('desk settings: founder only, bounded, used by the engine', async () => {
  const { env, token } = await ready();
  const s = env.api({ action: 'f.desk.settings', token, desk: { floor_pct: 0.75, ceiling_pct: 3, commission: { airbnb: 0.15, booking: 0.15, makemytrip: 0.18 }, direct_discount: 0.05, positioning: { 'ap-suite': 9 }, comp: { pinned: ['Mahadev Mansion 2 BHK'] }, alerts: { brief: false } } });
  assert.equal(s.desk.positioning['ap-suite'], 0.5, 'positioning capped at +50%');
  assert.equal(s.desk.comp.pinned[0], 'Mahadev Mansion 2 BHK');
  env.fo.foHourly();
  assert.equal(env.mails.filter(m => /^Price to set today/.test(m.subject || '')).length, 0, 'brief switched off');
  env.setUserRole('manager');
  assert.match(env.api({ action: 'f.desk.settings', token, desk: {} }).error, /role/);
});

test('e-check-in test rows (guest named TEST…) never enter the booking ledger', async () => {
  const env = makeEnv({ checkins: [{ 'Submitted at': '2026-10-15T10:00:00', Reference: 'ECI-T1', 'Booked through': 'Direct (WhatsApp / phone / website)', Villa: 'AP Suite', 'Check-in': '2026-12-30', 'Check-out': '2026-12-31', 'Main guest': 'TEST – please delete', Mobile: '9000000000' },
    { 'Submitted at': '2026-10-15T11:00:00', Reference: 'ECI-R1', 'Booked through': 'Airbnb', Villa: 'AP Suite', 'Check-in': '2026-11-02', 'Check-out': '2026-11-04', 'Main guest': 'Real Guest', Mobile: '9876500000' }] });
  env.fo.foSetup(); env.fo.foSyncCheckins_('test');
  const b = env.tab('Bookings');
  assert.ok(b.some(x => x.guest_name === 'Real Guest'));
  assert.ok(!b.some(x => /^TEST/.test(x.guest_name)), 'test submission skipped');
});
