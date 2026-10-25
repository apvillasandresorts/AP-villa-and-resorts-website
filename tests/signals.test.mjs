// Signal adapters (scripts/signals/*.mjs) on recorded fixtures: weather (MET Norway), holidays (Google public iCal), Hindu calendar (astronomy-engine).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as weather from '../scripts/signals/weather.mjs';
import * as holidays from '../scripts/signals/holidays.mjs';
import * as calendar from '../scripts/signals/calendar.mjs';

const NOW = '2026-10-25T10:00:00.000Z';
const fx = f => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');

test('weather: per IST day, heat dampens, every row sourced and dated; blocked responses reported, not guessed', async () => {
  const rows = weather.normalise(JSON.parse(fx('metno-ujjain.json')), NOW);
  assert.ok(rows.length >= 1);
  assert.ok(rows.every(r => r.signal_id === 'weather' && /^https:\/\/api\.met\.no/.test(r.source_url) && r.fetched_at === NOW && /^\d{4}-\d{2}-\d{2}$/.test(r.for_date)));
  assert.ok(rows.every(r => r.index <= 1), 'weather only ever dampens');
  assert.ok(rows.some(r => r.index < 1 && /heat/.test(r.notes)), 'the 43°C day is dampened');
  assert.equal(weather.normalise({ blocked: 429 }, NOW)[0].status, 'blocked');
  const fake = async () => ({ status: 429, ok: false });
  assert.deepEqual(await weather.fetchRaw(fake), { blocked: 429 }, 'backs off on 429');
});

test('holidays: public holidays lift the eve and the night; long weekends; observances ignored', () => {
  const rows = holidays.normalise(fx('india-holidays.ics'), NOW, '2026-10-25', 90);
  const at = d => rows.find(r => r.for_date === d);
  assert.equal(at('2026-11-08').index, 1.15); assert.match(at('2026-11-08').notes, /Diwali/);
  assert.equal(at('2026-11-07').index, 1.15, 'Diwali eve');
  assert.ok(rows.every(r => r.source_url === holidays.URL && r.index >= 1 && r.index <= 1.2));
  assert.ok(holidays.parse(fx('india-holidays.ics')).some(e => e.kind === 'observance'), 'fixture has observances');
});

test('calendar: festival dates in Ujjain match published panchang dates', () => {
  const pick = (from, n) => calendar.normalise(from, n, NOW);
  const find = (rows, re) => rows.filter(r => re.test(r.notes)).map(r => r.for_date);
  const kartik = pick('2026-11-01', 30);
  assert.deepEqual(find(kartik, /Vaikunth/), ['2026-11-23'], 'Hari Har Milan 23 Nov 2026');
  assert.deepEqual(find(kartik, /Kartik Purnima/), ['2026-11-24']);
  assert.deepEqual(find(kartik, /Diwali/), ['2026-11-08'], 'Diwali 8 Nov 2026');
  assert.equal(kartik.find(r => /Diwali/.test(r.notes)).index, 1, 'no fixed Diwali uplift: data decides');
  assert.deepEqual(find(pick('2026-07-25', 40), /Shravan Monday/), ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24']);
  assert.deepEqual(find(pick('2027-02-20', 20), /Mahashivratri/), ['2027-03-06'], 'Mahashivratri 6 Mar 2027');
  assert.deepEqual(find(pick('2026-02-01', 28), /Mahashivratri/), ['2026-02-15'], 'Mahashivratri 15 Feb 2026');
  assert.ok(kartik.every(r => r.source_url && r.fetched_at === NOW && r.index >= 1 && r.index <= 1.6));
});
