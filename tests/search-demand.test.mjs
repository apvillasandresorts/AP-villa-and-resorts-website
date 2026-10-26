// Search demand (scripts/search-demand/trends.mjs): Trends parsing, keyword and basket indices, dated desk signals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMultiline, parseSerpApi, keywordIndex, demandIndex, searchSignals, BASKETS } from '../scripts/search-demand/trends.mjs';

const days = (n, f) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse('2026-07-29T00:00:00Z') + i * 864e5).toISOString().slice(0, 10), value: f(i) }));

test('Trends answers (with the )]}\' prefix) and SerpApi answers parse to the same shape; partial today is dropped', () => {
  const t = ")]}',\n" + JSON.stringify({ default: { timelineData: [{ time: '1792866600', value: [40, 12] }, { time: '1792953000', value: [5, 1], isPartial: true }] } });
  const a = parseMultiline(t, ['hotels in ujjain', 'ujjain hotel']);
  assert.deepEqual(a['hotels in ujjain'], [{ date: '2026-10-25', value: 40 }]); assert.equal(a['ujjain hotel'].length, 1);
  const b = parseSerpApi({ interest_over_time: { timeline_data: [{ timestamp: '1792866600', values: [{ query: 'Hotels in Ujjain', extracted_value: 40 }] }, { timestamp: '1792953000', partial_data: true, values: [] }] } }, ['hotels in ujjain']);
  assert.deepEqual(b['hotels in ujjain'], a['hotels in ujjain']);
});

test('keyword index: last 7 days vs the 8 weeks before; too little volume or history gives nothing', () => {
  const k = keywordIndex(days(90, i => (i >= 83 ? 30 : 20)));
  assert.equal(Math.round(k.index * 100) / 100, 1.5); assert.equal(Math.round(k.rising * 100) / 100, 1.17);
  assert.equal(keywordIndex(days(90, () => 1)), null, 'baseline below 3 on the 0–100 scale');
  assert.equal(keywordIndex(days(20, () => 50)), null, 'under 35 days');
});

test('basket: stay intent 70%, pilgrimage 30%, bounded; a sharp rise in the last 3 days adds to the next week only', () => {
  const s = {}; BASKETS.stay.forEach(k => { s[k] = days(90, i => (i >= 83 ? 40 : 20)); }); BASKETS.pilgrim.forEach(k => { s[k] = days(90, () => 20); });
  const d = demandIndex(s); assert.equal(Math.round(d.index * 100) / 100, 1.7 * 0 + 1.7 > 1.6 ? 1.6 : 1.7);
  const flat = {}; BASKETS.stay.concat(BASKETS.pilgrim).forEach(k => { flat[k] = days(90, () => 20); }); assert.equal(demandIndex(flat).index, 1);
  assert.equal(demandIndex({}), null);
  const sig = searchSignals({ index: 1.2, rising: 1.3, parts: { stay: { keywords: { 'hotels in ujjain': 1.2 } } } }, '2026-10-26', '2026-10-26T01:00:00Z', 'https://trends.google.com/x');
  assert.equal(sig.length, 46); assert.equal(sig[0].for_date, '2026-10-26'); assert.equal(sig[45].for_date, '2026-12-10');
  assert.equal(sig[0].index, 1.26, 'week 1: 1.2 + rising boost 0.06'); assert.equal(sig[45].index, 1.04, '45 days out: 20% of the effect');
  assert.ok(sig.every(x => x.signal_id === 'search_market' && /^https:/.test(x.source_url) && x.index >= 0.6 && x.index <= 1.6));
});
