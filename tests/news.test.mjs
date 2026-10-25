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
