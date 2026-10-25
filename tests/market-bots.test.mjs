// Market bots: page-reading rules on text captured from the real pages (25 Oct 2026), robots.txt evaluation, night planning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { read, cards, coords, km, challenged, bedroomsOf, MAHAKAL } from '../scripts/market-bots/extract.mjs';
import { robotsAllows } from '../scripts/market-bots/core.mjs';
import { planDates } from '../scripts/market-bots/run.mjs';

test('Airbnb: price for the night, sold out, nothing invented', () => {
  assert.deepEqual(read.airbnb('Unavailable: Smoke alarm\n₹3,800\nfor 1 night\n₹3,800 for 1 night\nReserve'), { price: 3800, sold_out: false, taxes_included: 'yes' });
  const so = read.airbnb('Unavailable: Carbon monoxide alarm\n1 night in Ujjain\nAdd dates for prices\nThose dates are not available');
  assert.equal(so.sold_out, true); assert.equal(so.price, null);
  assert.equal(read.airbnb('Add dates for prices').price, null, 'no dates, no price');
});

test('Booking.com: cheapest room before taxes from the price cells; challenge pages detected', () => {
  const html = '<span class="bui-price-display__value prco-text-nowrap-helper">₹ 2,883</span><span class="bui-price-display__value x">₹ 2,997</span><span class="bui-price-display__value">₹ 2,739</span>';
  assert.deepEqual(read.booking('Original price ₹ 5,040 Current price ₹ 2,883\n+₹ 164 taxes and charges', html), { price: 2739, sold_out: false, taxes_included: 'no' });
  assert.equal(read.booking('Original price ₹ 5,040 Current price ₹ 2,883', '').price, 2883);
  assert.ok(challenged('Pardon Our Interruption... please verify you are a human'));
  assert.ok(!challenged('Hotel Shreegopal, Ujjain\n₹ 2,883'));
});

test('Agoda: "from Rs. X" headline, not the add-on prices; room-type sell-outs are not a full sell-out', () => {
  const t = 'from Rs. 9,752\nHurry up! 4 room types have already sold out for your dates!\nOriginal price: Rs.118. Current price: Rs.101\nRs. 118';
  assert.deepEqual(read.agoda(t), { price: 9752, sold_out: false, taxes_included: 'unknown' });
});

test('OYO and Cleartrip: the price on the line before "+ ₹X taxes", after the requested date', () => {
  const oyo = 'Sat, 31 Oct–Sun, 1 Nov\n₹1475\n₹8951\n+ ₹236 taxes & fee\n₹1475';
  assert.deepEqual(read.taxLine(oyo, 'Sat, 31 Oct'), { price: 1475, sold_out: false, taxes_included: 'no' }, 'the real price, not the struck-through original');
  const ct = "31 Oct'26\n₹5,475\n+ ₹1,125 taxes & fees\n₹7,500";
  assert.deepEqual(read.taxLine(ct, "31 Oct'26"), { price: 5475, sold_out: false, taxes_included: 'no' });
  assert.equal(read.taxLine('No rooms available for the selected dates').sold_out, true);
});

test('cards: names, prices, ratings from list-page cards; duplicates and query strings removed', () => {
  const c = cards([
    { href: 'https://www.oyorooms.com/360904/?x=1', name: 'Super Townhouse Iskcon Temple', text: 'Super Townhouse Iskcon Temple\n4.3 rating\n(1,204 ratings)\n₹1475\n+ ₹150 taxes & fees' },
    { href: 'https://www.oyorooms.com/360904/', name: 'dup', text: '' },
    { href: 'https://www.easemytrip.com/hotels/hotel-shree-ram-nivas-4406158/', name: '', text: 'Hotel Shree Ram Nivas\nBook this Hotel at ₹3,285 Scan QR Code' },
  ]);
  assert.equal(c.length, 2);
  assert.deepEqual([c[0].href, c[0].price, c[0].rating, c[0].reviews], ['https://www.oyorooms.com/360904/', 1475, 4.3, 1204]);
  assert.deepEqual([c[1].name, c[1].price], ['Hotel Shree Ram Nivas', 3285]);
});

test('coordinates near Ujjain only, distance to Mahakal', () => {
  const g = coords('..."lat":23.1801,"lng":75.7712,...');
  assert.deepEqual(g, { lat: 23.1801, lng: 75.7712 });
  assert.ok(km(g, MAHAKAL) < 1);
  assert.equal(coords('"lat":40.71,"lng":-74.0'), null, 'not Ujjain');
  assert.deepEqual(coords('<div data-atlas-latlng="23.1790,75.7690">'), { lat: 23.179, lng: 75.769 });
});

test('robots.txt: Airbnb listing pages allowed, search and listing sub-pages disallowed (real file)', () => {
  const t = readFileSync(new URL('./fixtures/robots-airbnb.txt', import.meta.url), 'utf8');
  assert.equal(robotsAllows(t, '/rooms/1138158546480238220?check_in=2026-10-31&check_out=2026-11-01&adults=4'), true);
  assert.equal(robotsAllows(t, '/s/Ujjain--India/homes?checkin=2026-10-31'), false);
  assert.equal(robotsAllows(t, '/rooms/1138158546480238220/reviews'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /search*\nAllow: /', '/search?q=1'), false);
  assert.equal(robotsAllows('User-agent: APVillasPriceBot\nDisallow: /\n\nUser-agent: *\nAllow: /', '/x'), false, 'our own group wins');
});

test('night planning: tonight/tomorrow/Saturday in the morning, later weekends and high-demand nights in the evening', () => {
  const am = planDates('2026-10-25', 'am', ['2026-11-08', '2026-11-23']);
  assert.deepEqual(am, ['2026-10-25', '2026-10-26', '2026-10-31', '2026-11-08']);
  const pm = planDates('2026-10-25', 'pm', ['2026-11-08', '2026-11-23']);
  assert.deepEqual(pm, ['2026-10-30', '2026-11-07', '2026-11-14', '2026-11-23']);
});

test('bedrooms from listing titles', () => {
  assert.equal(bedroomsOf('Mahadev Mansion- 2 bhk Pvt home & No sharing'), 2);
  assert.equal(bedroomsOf('Alphonso by Mango Tree -3bhk Luxury Homestay'), 3);
  assert.equal(bedroomsOf('Nivasa | Peaceful 3BHK Villa with Terrace'), 3);
  assert.equal(bedroomsOf('Hotel Shreegopal'), null);
});

test('Booking.com price formats in the cloud page and a room-type sell-out is not a hotel sell-out', () => {
  assert.equal(read.booking('', '<div data-testid="price-and-discounted-price" class="x"><span>₹ 4,120</span></div>').price, 4120);
  assert.equal(read.booking('Price ₹ 3,950\n+ ₹ 220 taxes and charges', '').price, 3950);
  assert.equal(read.booking('Sorry, we have no availability on our site for your dates', '').sold_out, true);
  assert.equal(read.taxLine('Sat, 31 Oct\nDeluxe Room\nSold out\nFamily Room\n₹1711\n+ ₹236 taxes & fee', 'Sat, 31 Oct').price, 1711, 'one room type sold out ≠ hotel sold out');
  assert.equal(read.taxLine('This OYO is sold out for your dates').sold_out, true);
});

test('OYO room cards: cheapest real room price, not the struck-through original', () => {
  const t = 'About Property\nChoose your room\nSELECTED CATEGORY\nClassic\nRoom size: 11 sqm approx\nAC\n₹2199\n₹11502\nSELECTED\nDeluxe\nRoom size: 13 sqm approx\n₹2417\n₹12641\nSELECT\nRatings and reviews';
  assert.deepEqual(read.oyo(t), { price: 2199, sold_out: false, taxes_included: 'no' });
});

test('retry planner: re-runs failed, empty or missing bots; blocked ones only after 3 hours; at most 5 a day', async () => {
  const { retryList } = await import('../scripts/market-bots/run.mjs');
  const now = Date.parse('2026-10-26T12:00:00Z'), at = h => new Date(now - h * 3600000).toISOString();
  const runs = [
    { bot: 'airbnb', at: at(4), status: 'ok', prices: 30, sold_out: 5 },
    { bot: 'booking', at: at(4), status: 'ok', prices: 0, sold_out: 0 },
    { bot: 'agoda', at: at(1), status: 'blocked', prices: 0, sold_out: 0, blocked: 'challenge page' },
    { bot: 'oyo', at: at(5), status: 'blocked', prices: 0, sold_out: 0, blocked: 'challenge page' },
    ...[1, 2, 3, 4, 5].map(i => ({ bot: 'cleartrip', at: at(i), status: 'error', prices: 0, sold_out: 0 })),
    { bot: 'serpapi', at: at(2), status: 'blocked', prices: 0, blocked: 'SERPAPI_KEY not set yet' },
  ];
  assert.deepEqual(retryList(runs, now), ['booking', 'oyo']);
  assert.deepEqual(retryList([], now), ['airbnb', 'booking', 'agoda', 'oyo', 'cleartrip', 'serpapi'], 'a run that never reported: retry everything');
});
