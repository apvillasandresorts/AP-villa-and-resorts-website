// News engine: relevance, category, impact and direction on real headlines (25 Oct 2026), feed parsing, stable ids.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, parseFeed, newsId } from '../scripts/news/classify.mjs';

test('relevant Ujjain stories are kept with sensible labels; temple schedule changes are high impact', () => {
  const aarti = classify('महाकाल मंदिर में 27 अक्टूबर से बदलेगा आरतियों का समय , बालभोग , भोग और संध्या आरती के समय में परिवर्तन');
  assert.equal(aarti.category, 'temple'); assert.equal(aarti.impact, 'high');
  const drill = classify("NSG commandos conduct anti-terror mock drill at Ujjain's Mahakal Temple ahead of 2028 Simhastha Kumbh");
  assert.ok(drill); assert.equal(drill.category, 'safety');
  const crowd = classify('Record 3 lakh devotees reach Mahakal temple on Shravan Monday');
  assert.equal(crowd.impact, 'high'); assert.equal(crowd.direction, 'up');
  const closed = classify('Ujjain: darshan closed at Mahakaleshwar garbhagriha for repairs till Friday');
  assert.equal(closed.impact, 'high'); assert.equal(closed.direction, 'down');
  const train = classify('Railways to run special trains to Ujjain for Mahashivratri');
  assert.ok(train && train.categories.includes('travel'));
});

test('irrelevant stories are dropped: other cities, other Kumbh cities, routine Indore police news', () => {
  assert.equal(classify('Nashik Kumbh Mela: Simhastha preparations at Ramkund with 11 new wells'), null);
  assert.equal(classify('343 Voter ID Cards With Indore Addresses Found On Narmada Bank'), null);
  assert.equal(classify('Mumbai local trains disrupted by heavy rain'), null);
  assert.equal(classify('Indore police arrest two in chain-snatching case'), null);
  assert.ok(classify('Indore airport adds new daily flights to Bengaluru and Hyderabad'), 'regional travel news is kept');
});

test('feed parsing (RSS with CDATA and entities) and stable ids that ignore the " - Publisher" suffix', () => {
  const xml = '<rss><channel><item><title><![CDATA[Ujjain: Mahakal Lok gets new parking]]></title><link>https://example.in/a</link><pubDate>Sat, 24 Oct 2026 10:00:00 +0530</pubDate><description>&lt;p&gt;New parking &amp; shuttle&lt;/p&gt;</description></item><item><title>No link</title></item></channel></rss>';
  const items = parseFeed(xml);
  assert.equal(items.length, 1); assert.equal(items[0].title, 'Ujjain: Mahakal Lok gets new parking'); assert.equal(items[0].summary, 'New parking & shuttle');
  assert.equal(newsId('Ujjain: Mahakal Lok gets new parking - Dainik Bhaskar'), newsId('Ujjain: Mahakal Lok gets new parking'));
});

test('news → pricing signals: effects when warranted, a live "nothing notable" heartbeat otherwise', async () => {
  const { newsSignals } = await import('../scripts/news/classify.mjs');
  const at = '2026-10-25T12:00:00Z';
  const quiet = newsSignals([], at);
  assert.deepEqual(quiet.map(s => [s.signal_id, s.index]), [['temple', 1], ['travel', 1], ['events', 1], ['footfall', 1]]);
  assert.ok(quiet.every(s => s.status === 'live' && /^https:/.test(s.source_url) && s.fetched_at === at));
  const sig = newsSignals([{ title: 'Darshan closed at Mahakal garbhagriha till Friday', url: 'https://x.in/a', source: 'x.in', published_at: '2026-10-25T08:00:00Z', categories: 'temple,safety', impact: 'high', direction: 'down', score: 90 },
    { title: 'Railways run special trains to Ujjain', url: 'https://x.in/b', source: 'x.in', published_at: '2026-10-24T20:00:00Z', categories: 'travel', impact: 'medium', direction: 'up', score: 60 }], at);
  assert.equal(sig.find(s => s.signal_id === 'temple').index, 0.93);
  assert.equal(sig.find(s => s.signal_id === 'travel').index, 1.02);
});
