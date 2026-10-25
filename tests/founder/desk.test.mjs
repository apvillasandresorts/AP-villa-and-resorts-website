// Live Pricing Desk (founder/desk.js): signals, freshness, comp set, engine v2 guardrails, channels, slots, confidence, backtest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../../founder/desk.js');
const M = require('../../founder/metrics.js');

const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const TODAY = '2026-11-02';   // a Monday
const props = [['rudrangan-suites', 'Rudrangan Suites', 3, 6, 5200], ['ap-suite', 'AP Suite', 2, 4, 4200], ['divinestay', 'Divinestay', 3, 8, 5500], ['om-shanti-stay', 'Om Shanti Stay', 2, 6, 4500], ['villa-aranya', 'Villa Aranya', 3, 8, 5800]]
  .map(([property_id, name, bedrooms, sleeps, from_rate]) => ({ property_id, name, bedrooms, sleeps, from_rate, units: 1, active: 'yes' }));
const comps = [
  ['Mahadev Mansion 2 BHK', 'homestay', 2, '', 'Airbnb rating 4.97 from 233 reviews', 'https://www.airbnb.co.in/rooms/1', 2600],
  ['Kanha Kasturi 2BHK', 'serviced apartment', 2, '', 'Airbnb rating 4.83 from 358 reviews', 'https://www.airbnb.co.in/rooms/2', 3600],
  ['RamRaj Family Stay', 'homestay', 2, '', 'Airbnb rating 4.8 from 123 reviews', 'https://www.airbnb.co.in/rooms/3', 4200],
  ['Nivasa 3BHK Villa', 'villa', 3, '', 'Airbnb rating 5.0 from 3 reviews', 'https://www.airbnb.co.in/rooms/4', 7100],
  ['AvantiVilla Parshvanath', 'villa', 3, '', 'Airbnb rating 5.0 from 5 reviews', 'https://www.airbnb.co.in/rooms/5', 8800],
  ['Spacious 3BHK 10 min', 'homestay', 3, '', 'Airbnb rating 5.0 from 38 reviews', 'https://www.airbnb.co.in/rooms/6', 4600],
  ['Johari Heritage Home', 'homestay', '', 0.5, 'Booking.com score 8.9 from 43 reviews', 'https://www.booking.com/hotel/in/johari.html', 4350],
  ['Hotel Shreegopal', 'hotel', '', 0.9, 'Booking.com score 7.4 from 175 reviews', 'https://www.booking.com/hotel/in/shreegopal.html', 4800],
  ['Om Paradise Hotel', 'hotel', '', 0.9, 'Booking.com score 8.4 from 97 reviews', 'https://www.booking.com/hotel/in/om-paradise.html', 6930],
  ['Hotel Malwa Residency', 'hotel', '', 0.8, 'Booking.com score 6.4 from 58 reviews', 'https://www.booking.com/hotel/in/malwa.html', 4700],
  ['Far Away Resort', 'villa', 3, 12, 'rating 4.9 from 50 reviews', 'https://example.com/far', 6000],
  ['Shared Dorm Ujjain', 'hostel', '', 0.4, '', 'https://example.com/dorm', 500],
];
function data(extra = {}) {
  const competitors = comps.map(([name, type, bedrooms, distance_km, review_themes, source_url], i) => ({ competitor_id: 'C' + i, name, type, bedrooms, distance_km, review_themes, source_url, sleeps: type === 'hotel' ? '' : bedrooms * 2, amenities: i % 2 ? 'kitchen, parking' : '', notes: name.includes('Dorm') ? 'dorm beds' : '' }));
  const market_rates = [];
  comps.forEach(([name, type, bedrooms, , , source_url, price]) => { for (let i = 0; i < 20; i++) market_rates.push({ competitor: name, observed_at: addD(TODAY, -1), stay_date: addD(TODAY, i), nights: 1, bedrooms: type === 'hotel' ? 2 : bedrooms, price_per_night: price, source_url, availability: '' }); });
  return Object.assign({ today: TODAY, serverTime: TODAY + 'T09:00:00+05:30', properties: props, channels: [], bookings: [], payments: [], blocks: [], events: [], settings: {}, competitors, market_rates, signals: [], recommendations: [], price_decisions: [], comp_set: [] }, extra);
}

test('freshness: live within the SLA, fading to zero at 2× SLA, missing without a timestamp', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  assert.equal(D.freshness('2026-11-02T06:00:00Z', 12, now).status, 'live');
  const s = D.freshness('2026-11-01T18:00:00Z', 12, now); assert.equal(s.status, 'stale'); assert.ok(Math.abs(s.f - 0.5) < 1e-9);
  assert.equal(D.freshness('2026-11-01T00:00:00Z', 12, now).f, 0);
  assert.equal(D.freshness('', 12, now).status, 'missing');
});

test('slots and lead bands come from metrics.js', () => {
  assert.equal(M.slotAt('10:29').id, 'S1'); assert.equal(M.slotAt('16:00').id, 'S3');
  assert.equal(M.leadBand(14).id, 'L2'); assert.equal(M.leadBand(46).id, 'L4');
});

test('comp set: excludes dorms, far and unpriced listings, keeps ≥3 hotels, sizes matter per property', () => {
  const X = data();
  const r = D.rerank(X, 'rudrangan-suites', [], TODAY), set = r.rows.filter(x => x.in_set === 'yes');
  assert.equal(set.length, 10);
  assert.ok(!r.rows.some(x => /far away|dorm/i.test(x.name)), 'dorm and >5 km excluded');
  assert.ok(set.filter(x => x.hotel === 'yes').length >= 3, 'hotel quota');
  const top3r = set.slice().sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.name).join();
  assert.match(top3r, /3BHK|Villa/, 'Rudrangan (3 bedrooms) favours 3-bedroom homes');
  const ap = D.rerank(X, 'ap-suite', [], TODAY).rows.filter(x => x.in_set === 'yes').sort((a, b) => b.score - a.score);
  assert.match(ap.slice(0, 3).map(x => x.name).join(), /2 ?BHK|RamRaj|Mahadev/, 'AP Suite (2 bedrooms) favours 2-bedroom homes');
  assert.ok(r.changes.every(c => c.action === 'added'));
});

test('comp set stability: a challenger needs +10 points for 2 consecutive weeks; every change is logged', () => {
  const X = data();
  const first = D.rerank(X, 'ap-suite', [], TODAY).rows;
  const member = first.filter(x => x.in_set === 'yes' && x.hotel === 'no').sort((a, b) => a.score - b.score)[0];
  // a new, clearly better 2-bedroom competitor appears
  X.competitors.push({ competitor_id: 'NEW', name: 'Perfect Twin Villa', type: 'villa', bedrooms: 2, sleeps: 4, distance_km: 0.5, review_themes: 'rating 4.95 from 120 reviews', amenities: 'kitchen parking breakfast lift shuttle', source_url: 'https://www.airbnb.co.in/rooms/99' });
  for (let i = 0; i < 5; i++) X.market_rates.push({ competitor: 'Perfect Twin Villa', observed_at: TODAY, stay_date: addD(TODAY, i), nights: 1, bedrooms: 2, price_per_night: 4300, source_url: 'https://www.airbnb.co.in/rooms/99' });
  const wk1 = D.rerank(X, 'ap-suite', first, addD(TODAY, 7));
  assert.equal(wk1.rows.find(x => x.name === 'Perfect Twin Villa').in_set, 'no', 'not in after one week');
  assert.equal(wk1.rows.find(x => x.name === 'Perfect Twin Villa').challenger_weeks, 1);
  const wk2 = D.rerank(X, 'ap-suite', wk1.rows, addD(TODAY, 14));
  assert.equal(wk2.rows.find(x => x.name === 'Perfect Twin Villa').in_set, 'yes', 'in after two weeks');
  assert.ok(wk2.changes.some(c => c.action === 'replaced') && wk2.changes.some(c => c.action === 'removed'));
  assert.equal(wk2.rows.filter(x => x.in_set === 'yes').length, 10);
  assert.ok(member);
});

test('engine: waterfall adds up, rounding, floor/ceiling, confidence, channels with direct as the best guest price', () => {
  const X = data(), cx = D.ctxFor(X, 'rudrangan-suites'), q = D.quote(X, cx, addD(TODAY, 10));
  const sum = q.steps.reduce((s, x) => s + x.delta, 0);
  assert.equal(q.night_price, Math.round(sum / 100) * 100, 'waterfall sums to the price');
  assert.equal(q.price % 100, 0);
  assert.ok(q.price >= 5200 * 0.75 && q.price <= 5200 * 3);
  assert.ok(q.confidence >= 0 && q.confidence <= 100);
  const c = q.channels;
  assert.ok(c.direct.price < Math.min(c.airbnb.price, c.booking.price, c.makemytrip.price), 'direct is the cheapest for the guest');
  assert.ok(c.direct.net >= q.price && c.booking.net >= q.price - 100, 'net to us is kept on every channel');
  assert.ok(c.makemytrip.price >= c.booking.price, 'higher commission → higher list price');
  assert.ok(q.inputs.length >= 15, 'every signal reported, missing ones included');
  assert.ok(q.inputs.filter(x => x.status === 'missing').length >= 5);
});

test('engine: signals move the price within caps; switching a signal off lowers confidence instead of breaking', () => {
  const now = TODAY + 'T08:00:00+05:30', d = addD(TODAY, 12);
  const X = data({ signals: [
    { signal_id: 'holiday', property: '', for_date: d, index: 1.2, source_url: 'https://calendar.google.com', fetched_at: now, status: 'live', notes: 'Long weekend' },
    { signal_id: 'search', property: '', for_date: '', index: 1.3, source_url: 'https://search.google.com/search-console', fetched_at: now, status: 'live', notes: 'impressions +30%' },
    { signal_id: 'web', property: '', for_date: '', index: 1.2, source_url: 'own_ledger', fetched_at: now, status: 'live' },
    { signal_id: 'weather', property: '', for_date: d, index: 0.8, source_url: 'https://api.met.no', fetched_at: now, status: 'live', notes: 'heavy rain 40 mm' } ] });
  const q = D.quote(X, D.ctxFor(X, 'ap-suite'), d);
  const by = k => q.steps.find(s => s.key === k);
  assert.ok(by('calendar').delta > 0 && by('demand').delta > 0 && by('weather').delta < 0);
  assert.ok(by('demand').mult <= 1.10 + 1e-9, 'demand capped at 10%');
  const off = data(Object.assign({}, X, { settings: { desk: JSON.stringify({ weights: { search: 0, web: 0, holiday: 0, weather: 0 } }) } }));
  const q2 = D.quote(off, D.ctxFor(off, 'ap-suite'), d);
  assert.ok(q2.confidence < q.confidence, 'fewer live inputs → lower confidence');
  assert.ok(!q2.steps.find(s => s.key === 'demand'));
});

test('engine: never moves on a single stale signal; expired signals have no effect', () => {
  const d = addD(TODAY, 20);
  const stale = data({ market_rates: [], signals: [{ signal_id: 'search', property: '', for_date: '', index: 1.5, source_url: 'x', fetched_at: addD(TODAY, -4) + 'T09:00:00+05:30', status: 'live' }] });
  const q = D.quote(stale, D.ctxFor(stale, 'ap-suite'), d);
  assert.ok(!q.steps.find(s => s.key === 'demand'), 'single stale signal ignored');
  assert.ok(q.reasons.some(r => /single stale/.test(r)));
  const expired = data({ market_rates: [], signals: [{ signal_id: 'search', property: '', for_date: '', index: 1.5, source_url: 'x', fetched_at: addD(TODAY, -10) + 'T09:00:00+05:30', status: 'live' }] });
  const q2 = D.quote(expired, D.ctxFor(expired, 'ap-suite'), d);
  assert.equal(q2.inputs.find(x => x.id === 'search').status, 'expired');
  assert.ok(!q2.steps.find(s => s.key === 'demand'));
});

test('engine: ±12% limit vs yesterday, lifted on hard events', () => {
  const d = addD(TODAY, 5);
  const X = data({ recommendations: [{ property: 'ap-suite', for_date: d, price: 3000, computed_at: addD(TODAY, -1) + 'T09:00:00+05:30' }] });
  const q = D.quote(X, D.ctxFor(X, 'ap-suite'), d);
  assert.ok(q.night_price <= Math.round(3000 * 1.12 / 100) * 100 + 100, 'limited to +12%');
  assert.ok(q.reasons.some(r => /±12%/.test(r)));
  assert.ok(D.quote(X, D.ctxFor(X, 'ap-suite'), d, { noPrev: true }).night_price > q.night_price);
});

test('slot ladder: tonight steps down in S3/S4 on low compression, holds or rises on high compression', () => {
  const X = data({ market_rates: [] }), cx = D.ctxFor(X, 'ap-suite');
  const low = D.quote(X, cx, TODAY);
  assert.ok(low.slots && low.slots.length === 4);
  assert.ok(low.slots[3].price < low.slots[0].price, 'S4 cheaper than S1 when unsold and slack');
  assert.ok(low.slots[3].price >= low.floor, 'never below the floor');
  const busy = data({ market_rates: data().market_rates.map(r => Object.assign({}, r, { availability: r.stay_date === TODAY ? 'sold out' : '' })) });
  const hi = D.quote(busy, D.ctxFor(busy, 'ap-suite'), TODAY);
  assert.equal(hi.compression, 'high', 'competitors sold out'); assert.ok(hi.slots[3].price >= hi.slots[0].price, 'holds or steps up');
  const blocks = ['rudrangan-suites', 'divinestay', 'om-shanti-stay', 'villa-aranya'].map(p => ({ property_id: p, start: TODAY, end: addD(TODAY, 1) }));
  const ownOff = data({ market_rates: [], blocks });
  assert.equal(D.quote(ownOff, D.ctxFor(ownOff, 'ap-suite'), TODAY).compression, 'low', 'our own sales do not move the price by default');
  const ownOn = data({ market_rates: [], blocks, settings: { desk: JSON.stringify({ use_own_history: true }) } });
  assert.equal(D.quote(ownOn, D.ctxFor(ownOn, 'ap-suite'), TODAY).compression, 'high', 'only when booking history is switched on');
  assert.ok(!D.quote(X, cx, addD(TODAY, 3)).slots, 'no ladder beyond tomorrow');
});

test('today card, calendar, stored rows only on change, alerts de-duplicated by key', () => {
  const X = data(), card = D.today(X, 'rudrangan-suites');
  assert.equal(card.slot, 'S1'); assert.ok(card.tonight.top.length >= 1);
  const cal = D.calendar(X, 'rudrangan-suites', 90);
  assert.equal(cal.rows.length, 90);
  const rows = D.toStore(X, cal, 'RUN1'); assert.equal(rows.length, 90);
  const X2 = data({ recommendations: rows });
  assert.equal(D.toStore(X2, D.calendar(X2, 'rudrangan-suites', 90), 'RUN2').length, 0, 'nothing stored when nothing changed');
  const sold = data({ market_rates: data().market_rates.map(r => Object.assign({}, r, { availability: r.stay_date === addD(TODAY, 3) ? 'sold out' : '' })) });
  const al = D.alerts(sold, [D.calendar(sold, 'rudrangan-suites', 14)], []);
  assert.ok(al.some(a => a.type === 'sellout' && /sold out/.test(a.text)));
  assert.equal(new Set(al.map(a => a.key)).size, al.length);
});

test('health lists every signal with status; own data off by default, missing sources missing', () => {
  const h = D.health(data());
  assert.equal(h.find(x => x.id === 'pace').status, 'off');
  assert.equal(D.health(data({ settings: { desk: JSON.stringify({ use_own_history: true }) } })).find(x => x.id === 'pace').status, 'live');
  assert.equal(h.length, D.SIGNALS.length);
  assert.ok(D.SIGNALS.length >= 16);
  assert.equal(h.find(x => x.id === 'weather').status, 'missing');
  assert.equal(h.find(x => x.id === 'comp_price').status, 'live');
});

test('backtest and learning: recommendations vs realised; no suggestions without enough nights', () => {
  const X = data({ recommendations: [{ property: 'ap-suite', for_date: '2026-10-20', price: 4000, computed_at: '2026-10-18T09:00:00+05:30', factors: JSON.stringify([['base', 4200, ''], ['weekend', 300, '']]) }],
    bookings: [{ booking_id: 'B1', property_id: 'ap-suite', status: 'confirmed', checkin: '2026-10-20', checkout: '2026-10-21', nights: 1, gross_amount: 4400, created_at: '2026-10-10' }] });
  const L = D.learning(X, 'ap-suite', '2026-10-15', '2026-10-25');
  assert.equal(L.backtest.with_rec, 1); assert.equal(L.backtest.booked, 1);
  assert.ok(L.factors.every(f => /not enough/.test(f.suggestion)));
});

test('a live dated feed with no row for a night counts as a normal night; outside its range it stays missing', () => {
  const at = TODAY + 'T08:00:00+05:30';
  const d = data({ signals: [{ signal_id: 'calendar', for_date: addD(TODAY, 3), index: 1.2, source_url: 'https://example.com/cal', fetched_at: at, status: 'live', notes: 'Purnima' },
    { signal_id: 'calendar', for_date: addD(TODAY, 30), index: 1.1, source_url: 'https://example.com/cal', fetched_at: at, status: 'live', notes: 'Ekadashi' }] });
  const now = Date.parse(d.serverTime);
  assert.equal(D.signalAt(d, 'calendar', 'ap-suite', addD(TODAY, 3), now).index, 1.2);
  const normal = D.signalAt(d, 'calendar', 'ap-suite', addD(TODAY, 5), now);
  assert.equal(normal.index, 1); assert.equal(normal.status, 'live'); assert.match(normal.note, /normal night/);
  assert.equal(D.signalAt(d, 'calendar', 'ap-suite', addD(TODAY, 60), now), null, 'beyond the feed horizon: missing');
  assert.equal(D.signalAt(d, 'calendar', 'ap-suite', TODAY, now).index, 1, 'from the fetch day, before the first event: normal');
  const q = D.quote(d, D.ctxFor(d, 'ap-suite'), addD(TODAY, 5));
  assert.equal(q.inputs.find(x => x.id === 'calendar').status, 'live');
});

test('a realised rate far above the published price (a typo booking) is ignored, not used as the base', () => {
  const b = { booking_id: 'B1', property_id: 'ap-suite', channel: 'Direct', status: 'confirmed', checkin: addD(TODAY, -20), checkout: addD(TODAY, -17), nights: 3, gross_amount: '10000000', created_at: addD(TODAY, -30) };
  const off = data({ bookings: [b] }), qOff = D.quote(off, D.ctxFor(off, 'ap-suite'), addD(TODAY, 2));
  assert.equal(qOff.steps[0].delta, 4200, 'default: base is the published price, bookings are not used');
  assert.ok(!qOff.steps.some(s => s.key === 'pace' || s.key === 'season'));
  const d = data({ bookings: [b], settings: { desk: JSON.stringify({ use_own_history: true }) } });
  const q = D.quote(d, D.ctxFor(d, 'ap-suite'), addD(TODAY, 2));
  assert.ok(q.steps[0].delta <= 4200 * 2, 'base stays near the published price');
  assert.ok(q.reasons.some(r => /Ignored your realised/.test(r)));
  assert.ok(q.price <= 4200 * 3, 'within the ceiling');
});

test('market across platforms: cheapest available platform counts; sold out only when every platform is full; parity measured', () => {
  const d = data(), night = addD(TODAY, 2);
  d.market_rates = d.market_rates.filter(r => r.stay_date !== night);
  const add = (competitor, platform, price, availability = '') => d.market_rates.push({ competitor, observed_at: TODAY, stay_date: night, nights: 1, price_per_night: price, platform, availability, source_url: 'https://x/' + platform });
  add('Mahadev Mansion 2 BHK', 'Airbnb', 3800); add('Mahadev Mansion 2 BHK', 'Booking.com', 3400);
  add('Kanha Kasturi 2BHK', 'Airbnb', '', 'sold out'); add('Kanha Kasturi 2BHK', 'Booking.com', 4100);
  add('RamRaj Family Stay', 'Airbnb', '', 'sold out');
  const m = D.marketAt(d, 'ap-suite', night, D.settings(d), Date.parse(d.serverTime));
  const row = n => m.rows.find(r => r.name === n);
  assert.equal(row('Mahadev Mansion 2 BHK').price, 3400); assert.equal(row('Mahadev Mansion 2 BHK').platform, 'Booking.com');
  assert.ok(Math.abs(row('Mahadev Mansion 2 BHK').parity - (3800 / 3400 - 1)) < 1e-9);
  assert.equal(row('Kanha Kasturi 2BHK').sold_out, false, 'still bookable on Booking.com');
  assert.equal(row('RamRaj Family Stay').sold_out, true);
});

test('unchecked nights use the labelled comp-set forecast at half weight', () => {
  const d = data(), far = addD(TODAY, 19);   // market_rates in data() cover TODAY..TODAY+19 only for some; drop this night
  d.market_rates = d.market_rates.filter(r => r.stay_date !== far);
  const q = D.quote(d, D.ctxFor(d, 'ap-suite'), far);
  const st = q.steps.find(s => s.key === 'market');
  assert.ok(st, 'market step present'); assert.equal(st.label, 'Market (forecast)'); assert.match(st.basis, /forecast median/);
  assert.equal(q.inputs.find(x => x.id === 'comp_price').status, 'estimated');
});

test('momentum: the same night scanned again 5 days later at +20% nudges the price up (capped at 5%), and a 25% jump is flagged', () => {
  const d = data(), night = addD(TODAY, 4);
  const later = d.market_rates.filter(r => r.stay_date === night).map(r => Object.assign({}, r, { observed_at: TODAY, price_per_night: Math.round(r.price_per_night * 1.25) }));
  d.market_rates = d.market_rates.map(r => r.stay_date === night ? Object.assign({}, r, { observed_at: addD(TODAY, -6) }) : r).concat(later);
  const q = D.quote(d, D.ctxFor(d, 'ap-suite'), night, { noPrev: true });
  const mo = q.steps.find(s => s.key === 'momentum'); assert.ok(mo, 'momentum step'); assert.ok(mo.mult <= 1.05 + 1e-9 && mo.mult > 1);
  assert.equal(q.market.spike, true);
  assert.ok(q.market.position != null && q.market.position >= 0 && q.market.position <= 100);
  const al = D.alerts(d, [D.calendar(d, 'ap-suite', 14)], []);
  assert.ok(al.some(a => a.type === 'spike' && a.text.includes(night)));
});

test('competitor forecast: normal prices by night type, calendar lift learned or defaulted, sell-out chance, honest accuracy', () => {
  const d = data();
  const plain = D.forecast(d, 'ap-suite', addD(TODAY, 40));
  assert.ok(plain && plain.median > 0 && plain.p25 <= plain.median && plain.median <= plain.p75);
  assert.ok(['good', 'fair', 'thin'].includes(plain.quality));
  // a strong calendar night 40 days out lifts the forecast by k × (index − 1)
  d.signals = [{ signal_id: 'calendar', for_date: addD(TODAY, 40), index: 1.3, source_url: 'https://x', fetched_at: d.serverTime, status: 'live' }];
  const fest = D.forecast(d, 'ap-suite', addD(TODAY, 40));
  assert.ok(fest.median > plain.median, 'festival night forecast higher'); assert.equal(fest.calendar, 1.3);
  const acc = D.forecastAccuracy(data(), 'ap-suite');
  assert.ok(acc.nights >= 5 && acc.mape != null && acc.mape < 0.5, JSON.stringify(acc).slice(0, 200));
});

test('market analytics: segments, platforms, weekday and lead profiles, leaderboard', () => {
  const d = data(); d.market_rates.forEach((r, i) => { r.platform = i % 3 ? 'Airbnb' : 'Booking.com'; });
  const a = D.marketAnalytics(d, 30);
  assert.ok(a.observations > 0 && a.competitors > 0);
  assert.ok(a.segments.some(s => s.segment === 'Hotels') && a.segments.some(s => /BR homes/.test(s.segment)));
  assert.ok(a.platforms.length >= 2 && a.platforms.every(p => p.cheapest_share >= 0 && p.cheapest_share <= 1));
  assert.equal(a.weekdays.length, 7); assert.equal(a.lead.length, 4);
  assert.ok(a.leaderboard[0].nights >= 1 && Array.isArray(a.leaderboard[0].platforms));
});
