// SEO & marketing: Search Console, keyword watchlist, topic requests, campaigns, site audit (docs/founder-os/FoSearch.gs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './gas-mock.mjs';

// a fake Search Console: answers by the requested dimensions
function gscHandler(r) {
  if (!/searchconsole\.googleapis\.com/.test(r.url)) return { code: 404, body: '' };
  const q = JSON.parse(r.payload), d = (q.dimensions || []).join(',');
  const rows = {
    '': [{ keys: [], clicks: 71, impressions: 1270, ctr: 0.0559, position: 7.5 }],
    date: [{ keys: ['2026-10-12'], clicks: 5, impressions: 90, ctr: 0.055, position: 8 }, { keys: ['2026-10-11'], clicks: 3, impressions: 60, ctr: 0.05, position: 9 }],
    query: [{ keys: ['hari har milan ujjain 2026 date'], clicks: 2, impressions: 71, ctr: 0.028, position: 8.2 }, { keys: ['ap villas'], clicks: 3, impressions: 7, ctr: 0.43, position: 1.2 },
      { keys: ['mahakal evening aarti time'], clicks: 0, impressions: 40, ctr: 0, position: 14 }, { keys: ['villa near mahakal'], clicks: 0, impressions: 3, ctr: 0, position: 30 }],
    page: [{ keys: ['https://www.apvillasandresorts.in/blog/ujjain-in-november-kartik.html'], clicks: 1, impressions: 300, ctr: 0.003, position: 6 }, { keys: ['https://www.apvillasandresorts.in/'], clicks: 20, impressions: 100, ctr: 0.2, position: 2 }],
    device: [{ keys: ['MOBILE'], clicks: 60, impressions: 1000, ctr: 0.06, position: 7 }],
    country: [{ keys: ['ind'], clicks: 70, impressions: 1200, ctr: 0.058, position: 7.4 }],
    'query,page': [{ keys: ['hari har milan ujjain 2026 date', 'https://www.apvillasandresorts.in/blog/ujjain-in-november-kartik.html'], clicks: 2, impressions: 71, ctr: 0.028, position: 8.2 }],
  }[d] || [];
  return { code: 200, body: JSON.stringify({ rows: q.endDate <= '2026-09-30' && !d ? [{ keys: [], clicks: 30, impressions: 600, ctr: 0.05, position: 9 }] : rows }) };
}
async function ready(http) { const env = makeEnv({ http }); env.fo.foSetup(); return { env, token: await env.login() }; }

test('search console: honest "not connected" until the permission is approved', async () => {
  const { env, token } = await ready();
  const r = env.api({ action: 'f.gsc', token, from: '2026-09-25', to: '2026-10-14' });
  assert.equal(r.ok, true); assert.equal(r.gsc.connected, false);
  assert.match(r.gsc.reason, /permission not approved/);
});

test('search console: totals, comparison, queries, pages and opportunities; cached', async () => {
  const { env, token } = await ready(gscHandler);
  const g = env.api({ action: 'f.gsc', token, from: '2026-10-01', to: '2026-10-14' }).gsc;
  assert.equal(g.connected, true);
  assert.equal(g.totals.clicks, 71); assert.equal(g.previous.clicks, 30, 'previous period of the same length');
  assert.equal(g.daily[0].date, '2026-10-11', 'sorted by date');
  assert.equal(g.pages[0].path, '/blog/ujjain-in-november-kartik.html');
  const st = g.opportunities.striking.map(o => o.query);
  assert.deepEqual(st, ['hari har milan ujjain 2026 date', 'mahakal evening aarti time'], 'positions 4–20 with real impressions, biggest first');
  assert.equal(g.opportunities.striking[0].page, '/blog/ujjain-in-november-kartik.html');
  assert.equal(g.opportunities.low_ctr[0].path, '/blog/ujjain-in-november-kartik.html', 'shown 300 times at #6 but 0.3% CTR');
  assert.ok(g.opportunities.questions.some(q => /aarti time/.test(q.query)));
  const n = env.net.calls.length;
  env.api({ action: 'f.gsc', token, from: '2026-10-01', to: '2026-10-14' });
  assert.equal(env.net.calls.length, n, 'second call served from cache');
  assert.match(env.net.calls[0].headers.Authorization, /^Bearer /);
  assert.match(env.net.calls[0].url, /sites\/https%3A%2F%2Fwww\.apvillasandresorts\.in%2F\/searchAnalytics/);
});

test('keyword watchlist: no duplicates; daily positions from Search Console', async () => {
  const { env, token } = await ready(gscHandler);
  assert.equal(env.api({ action: 'f.seo.keyword.save', token, record: { keyword: 'Hari Har Milan Ujjain 2026 Date' } }).ok, true);
  assert.match(env.api({ action: 'f.seo.keyword.save', token, record: { keyword: 'hari har milan ujjain 2026 date' } }).error, /already/);
  env.api({ action: 'f.seo.keyword.save', token, record: { keyword: 'villa near mahakaleshwar' } });
  assert.equal(env.fo.foSeoRanks_('2026-10-16'), '2 keywords');
  assert.equal(env.fo.foSeoRanks_('2026-10-16'), 'exists', 'once a day');
  const ranks = env.tab('SeoRanks');
  assert.equal(Number(ranks.find(r => r.keyword === 'hari har milan ujjain 2026 date').position), 8.2);
  assert.equal(ranks.find(r => r.keyword === 'villa near mahakaleshwar').position, '', 'not ranking = blank, not zero');
});

test('topic requests: the blog pipeline takes the next one (high priority first) with the automation key', async () => {
  const { env, token } = await ready(gscHandler);
  env.api({ action: 'f.seo.topic.save', token, record: { title: 'Ujjain winter trip', keyword: 'ujjain in december', priority: 'normal' } });
  env.clock.advance(60000);
  env.api({ action: 'f.seo.topic.save', token, record: { title: 'Mahakal evening aarti time', keyword: 'mahakal evening aarti time', priority: 'high', source: 'search console' } });
  const { key } = env.api({ action: 'f.automation.create', token });
  const a = env.api({ action: 'f.m.seo.next', key });
  assert.equal(a.topic.keyword, 'mahakal evening aarti time');
  const b = env.api({ action: 'f.m.seo.next', key });
  assert.equal(b.topic.keyword, 'ujjain in december', 'in-progress topics are not handed out twice');
  assert.equal(env.api({ action: 'f.m.seo.next', key }).topic, null);
  env.api({ action: 'f.m.seo.done', key, topic_id: a.topic.topic_id, slug: 'mahakal-evening-aarti-time' });
  env.api({ action: 'f.m.seo.done', key, topic_id: b.topic.topic_id, status: 'failed' });
  const t = env.tab('SeoTopics');
  assert.equal(t.find(x => x.topic_id === a.topic.topic_id).status, 'published');
  assert.equal(t.find(x => x.topic_id === b.topic.topic_id).status, 'queued', 'a failed run returns the topic to the queue');
  assert.match(env.api({ action: 'f.seo.topic.save', key, record: { title: 'x' } }).error, /not allowed/);
});

test('campaigns: UTM codes from the channel, landing page limited to the site', async () => {
  const { env, token } = await ready();
  const r = env.api({ action: 'f.campaign.save', token, record: { name: 'Diwali WhatsApp offer', channel: 'whatsapp', landing_url: 'https://evil.example.com/x', budget: '0' } }).record;
  assert.equal(r.utm_campaign, 'diwali_whatsapp_offer'); assert.equal(r.utm_source, 'whatsapp'); assert.equal(r.utm_medium, 'social');
  assert.equal(r.landing_url, 'https://www.apvillasandresorts.in/');
  assert.equal(env.api({ action: 'f.data', token }).campaigns.length, 1);
});

test('SEO audit: flags missing title, description, H1, canonical, alt text and duplicate titles', async () => {
  const good = '<html><head><title>Villas near Mahakaleshwar for families | AP Villas</title><meta name="description" content="' + 'x'.repeat(120) + '"><link rel="canonical" href="https://www.apvillasandresorts.in/"><meta property="og:image" content="https://www.apvillasandresorts.in/a.jpg"><script type="application/ld+json">{}</script></head><body><h1>Hi</h1><img src="a.jpg" alt="Villa"></body></html>';
  const bad = '<html><head></head><body><img src="b.jpg"><p>text</p></body></html>';
  const { env, token } = await ready(r => /sitemap\.xml/.test(r.url) ? { code: 200, body: '<urlset><url><loc>https://www.apvillasandresorts.in/</loc></url><url><loc>https://www.apvillasandresorts.in/a.html</loc></url><url><loc>https://www.apvillasandresorts.in/b.html</loc></url></urlset>' }
    : /robots\.txt/.test(r.url) ? { code: 200, body: 'Sitemap: https://www.apvillasandresorts.in/sitemap.xml' } : /b\.html/.test(r.url) ? { code: 200, body: bad } : { code: 200, body: good });
  const a = env.api({ action: 'f.seo.audit', token, refresh: true }).audit;
  assert.equal(a.summary.pages, 3); assert.equal(a.sitemap_ok, true); assert.equal(a.robots_ok, true);
  const b = a.pages.find(p => p.path === '/b.html').issues.map(i => i[1]).join(' | ');
  assert.match(b, /No <title>/); assert.match(b, /No meta description/); assert.match(b, /No H1/); assert.match(b, /No canonical/); assert.match(b, /without alt/);
  assert.match(a.pages.find(p => p.path === '/').issues.map(i => i[1]).join(), /Same title/, 'duplicate titles across pages');
  env.setUserRole('viewer');
  assert.match(env.api({ action: 'f.seo.audit', token, refresh: true }).error, /role/);
});

test('advisor summary carries search figures and SEO counts, still no guest data', async () => {
  const { env, token } = await ready(gscHandler);
  const { key } = env.api({ action: 'f.automation.create', token });
  const s = env.api({ action: 'f.m.summary', key }).summary;
  assert.equal(s.search.connected, true); assert.equal(s.search.totals.clicks, 71);
  assert.ok(s.search.striking.length >= 1);
  assert.equal(s.seo.topics_queued, 0);
});

test('system health: every check reported in plain words, problems first-class, cached, viewers allowed', async () => {
  const { env, token } = await ready(gscHandler);
  const h = env.api({ action: 'f.health', token, refresh: true }).health;
  const by = n => h.checks.find(c => c.name.startsWith(n));
  assert.equal(by('Founder OS data sheet').status, 'ok');
  assert.equal(by('Search Console').status, 'ok'); assert.match(by('Search Console').detail, /clicks from/);
  assert.equal(by('Google Analytics 4').status, 'fail', 'GA4 not connected in the test environment: reported, not hidden');
  assert.equal(by('Hourly trigger').status, 'fail'); assert.match(by('Hourly trigger').fix, /foSetup/);
  assert.equal(by('Automation key').status, 'warn');
  assert.equal(h.summary.ok + h.summary.warn + h.summary.fail, h.checks.length);
  const n = env.net.calls.length;
  env.api({ action: 'f.health', token });
  assert.equal(env.net.calls.length, n, 'cached for 10 minutes');
  env.setUserRole('viewer');
  assert.equal(env.api({ action: 'f.health', token }).ok, true);
});

test('blog engine: ideas come from events and searches, covered topics are left out, and an accepted topic is only "published" after the publish agent', async () => {
  const { env, token } = await ready(r => /published\.json/.test(r.url) ? { code: 200, body: JSON.stringify({ posts: [{ title: 'Bhasma Aarti Guide', keyword: 'bhasma aarti booking' }] }) } : { code: 500, body: '' });
  const t0 = env.fo.foRows_ ? env.api({ action: 'f.data', token }).data : null;
  const today = (t0 && t0.today) || '2026-10-16', add = n => new Date(Date.parse(today) + n * 864e5).toISOString().slice(0, 10);
  assert.equal(env.api({ action: 'f.event.save', token, event: { name: 'Kartik Mela', start: add(20), end: add(22), kind: 'festival' } }).ok, true);
  const bad = env.api({ action: 'f.blog.suggest', key: 'x' }); assert.equal(bad.ok, false);
  const r = env.api({ action: 'f.blog.suggest', token }); assert.equal(r.ok, true, r.error); assert.ok(r.result.added >= 1);
  const ideas = env.tab('SeoTopics').filter(x => x.status === 'suggested');
  assert.match(ideas[0].keyword, /kartik mela ujjain/); assert.ok(Number(ideas[0].score) >= 50); assert.match(ideas[0].why, /20 days/);
  assert.equal(env.tab('SeoTopics').filter(x => x.status === 'suggested').length, ideas.length, 'a rerun replaces ideas, never stacks them');
  ideas.splice(0, ideas.length, ...env.tab('SeoTopics').filter(x => x.status === 'suggested'));
  assert.equal(env.fo.foBlogSame_('bhasma aarti booking online', 'Bhasma Aarti Guide bhasma aarti booking'), true);
  const { key } = env.api({ action: 'f.automation.create', token }), id = ideas[0].topic_id;
  assert.equal(env.api({ action: 'f.m.seo.peek', key }).waiting, 0);
  assert.equal(env.api({ action: 'f.blog.accept', token, topic_id: id }).ok, true);
  assert.equal(env.api({ action: 'f.m.seo.peek', key }).waiting, 1);
  const n = env.api({ action: 'f.m.seo.next', key }); assert.equal(n.topic.topic_id, id); assert.equal(n.topic.approved, true);
  const st = () => env.tab('SeoTopics').find(x => x.topic_id === id).status;
  env.api({ action: 'f.m.seo.done', key, topic_id: id, slug: 'kartik-mela' }); assert.equal(st(), 'written');
  env.api({ action: 'f.m.seo.done', key, topic_id: id, status: 'review' }); assert.equal(st(), 'review');
  env.api({ action: 'f.blog.accept', token, topic_id: id }); env.api({ action: 'f.m.seo.next', key });
  env.api({ action: 'f.m.seo.done', key, topic_id: id, slug: 'kartik-mela', status: 'live' }); assert.equal(st(), 'published');
  assert.match(env.api({ action: 'f.blog.accept', token, topic_id: id }).error, /already published/);
  env.setUserRole('manager'); assert.match(env.api({ action: 'f.blog.accept', token, topic_id: id }).error, /role/);
});

test('blog engine: source health is reported, Analytics lifts related topics, live visitors come from GA4 realtime, and the automation key can run it', async () => {
  const analytics = { Properties: {
    batchRunReports: b => ({ reports: b.requests.map(r => ({ rows: r.dimensions[0] && r.dimensions[0].name === 'landingPage' ? [{ dimensionValues: [{ value: '/blog/kartik-mela-darshan.html' }], metricValues: [{ value: '40' }, { value: '20' }, { value: '1' }] }] : [] })) }),
    runRealtimeReport: () => ({ rows: [{ dimensionValues: [{ value: 'Home' }], metricValues: [{ value: '3' }] }] }) } };
  const env = makeEnv({ analytics, http: () => ({ code: 500, body: '' }) }); env.fo.foSetup(); const token = await env.login();
  const today = '2026-10-16', add = n => new Date(Date.parse(today) + n * 864e5).toISOString().slice(0, 10);
  env.api({ action: 'f.event.save', token, event: { name: 'Kartik Mela', start: add(20), end: add(20), kind: 'festival' } });
  const { key } = env.api({ action: 'f.automation.create', token });
  const r = env.api({ action: 'f.m.blog.check', key }); assert.equal(r.ok, true, r.error);
  assert.equal(r.result.health.events.ahead, 1); assert.equal(r.result.health.ga4.ok, true); assert.equal(r.result.health.gsc.ok, false, 'a dead source is shown, not hidden');
  assert.match(r.result.ideas[0].why, /40 sessions/); assert.equal(r.result.live.active_users, 3);
  assert.equal(env.api({ action: 'f.blog.status', token }).result.health.ga4.sessions, 0);
});

test('blog engine: a festival covered under another name is not suggested again', async () => {
  const { env } = await ready();
  assert.equal(env.fo.foBlogSame_('vaikunth chaturdashi hari har milan ujjain 2026', 'hari har milan ujjain 2026'), true);
  assert.equal(env.fo.foBlogSame_('kartik purnima ujjain 2026', 'ujjain in november'), false);
});
test('blog engine: festivals come from the calendar signal', async () => {
  const { env, token } = await ready(() => ({ code: 500, body: '' }));
  const { key } = env.api({ action: 'f.automation.create', token });
  const imp = env.fo.foSignalsImport_({ signals: [{ signal_id: 'calendar', for_date: '2026-11-05', index: 1.4, raw_value: 'Kartik', source_url: 'https://example.com/c', fetched_at: '2026-10-16T06:00:00+05:30', status: 'live', notes: 'Kartik Purnima' }] }, 'automation');
  assert.equal(imp.result.added, 1, JSON.stringify(imp.result));
  const list = env.fo.foBlogCandidates_('2026-10-16', {});
  assert.ok(list.some(c => /kartik purnima ujjain 2026/.test(c.keyword) && c.target_date === '2026-11-05'), JSON.stringify(list));
});

test('blog engine: topics in open drafts are left out, a stale idea is removed, and an unreadable GitHub shows in source health', async () => {
  let gh = { code: 200, body: JSON.stringify([{ number: 9, title: 'New post: Kartik Mela Ujjain Guide', labels: [{ name: 'blog-post' }], head: { ref: 'blog/kartik-mela-ujjain-guide' } }, { number: 10, title: 'Fix a typo', labels: [], head: { ref: 'fix/typo' } }]) };
  const { env, token } = await ready(r => /api\.github\.com/.test(r.url) ? gh : /published\.json/.test(r.url) ? { code: 200, body: '{"posts":[]}' } : { code: 500, body: '' });
  const today = new Date(env.clock.now() + 330 * 60000).toISOString().slice(0, 10), add = n => new Date(Date.parse(today) + n * 864e5).toISOString().slice(0, 10);
  env.api({ action: 'f.event.save', token, event: { name: 'Kartik Mela', start: add(20), end: add(22), kind: 'festival' } });
  env.api({ action: 'f.event.save', token, event: { name: 'Mahashivratri Darshan', start: add(30), end: add(30), kind: 'festival' } });
  const titles = () => env.tab('SeoTopics').filter(x => x.status === 'suggested').map(x => x.keyword).join(' | ');
  const r = env.api({ action: 'f.blog.suggest', token }); assert.equal(r.result.health.drafts.open, 1);
  assert.doesNotMatch(titles(), /kartik/); assert.match(titles(), /mahashivratri/);
  gh = { code: 403, body: '' };
  const r2 = env.api({ action: 'f.blog.suggest', token }); assert.equal(r2.result.health.drafts.ok, false); assert.match(titles(), /kartik/);
  gh = { code: 200, body: JSON.stringify([{ number: 11, title: 'New post: Mahashivratri Darshan Ujjain', labels: [{ name: 'blog-post' }], head: { ref: 'blog/mahashivratri-darshan' } }]) };
  env.api({ action: 'f.blog.suggest', token }); assert.doesNotMatch(titles(), /mahashivratri/, 'an idea that became a draft is removed');
});
