/**
 * AP Villas Founder OS · backend part 5: SEO & marketing.
 * - Google Search Console (read-only): how the site appears in Google search (clicks, impressions, CTR, position, queries, pages)
 *   and the opportunities that follow from it (queries on page 1–2 that could rank higher, pages that show up but are not clicked).
 * - Keyword watchlist with a daily position snapshot.
 * - Blog topic requests: the founder queues topics here; the blog pipeline pulls the next one with the automation key.
 * - Campaign links (UTM) with their GA4 results (visits and booking-intent actions). Paid ads are never created from here.
 * - SEO audit of the live site, page by page (title, description, headings, canonical, images, structured data).
 * Search Console needs the scope https://www.googleapis.com/auth/webmasters.readonly in appsscript.json (the owner approves once).
 * Until then every Search Console figure reports connected:false with the reason (never fake numbers).
 */
const FO_GSC_API = 'https://searchconsole.googleapis.com/webmasters/v3/sites/';
// typical organic CTR by position (rounded industry averages): used only to flag pages that are clicked far less than expected
const FO_CTR_CURVE = [0, 0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
const foExpectedCtr_ = pos => pos < 1 ? FO_CTR_CURVE[1] : pos <= 10 ? FO_CTR_CURVE[Math.round(pos)] : 0.01;
function foGscSite_() { return foSettings_().gsc_site || 'https://www.apvillasandresorts.in/'; }

/** Several Search Analytics queries in one round trip (UrlFetchApp.fetchAll). Each body may carry its own startDate/endDate. */
function foGscBatch_(from, to, bodies) {
  const url = FO_GSC_API + encodeURIComponent(foGscSite_()) + '/searchAnalytics/query', token = ScriptApp.getOAuthToken();
  const reqs = bodies.map(b => ({ url, method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(Object.assign({ startDate: from, endDate: to, dataState: 'all' }, b)) }));
  return UrlFetchApp.fetchAll(reqs).map(r => {
    const code = r.getResponseCode(); let j = {};
    try { j = JSON.parse(r.getContentText() || '{}'); } catch (e) {}
    if (code !== 200) throw new Error((j.error && j.error.message) || 'HTTP ' + code);
    return (j.rows || []).map(x => ({ keys: x.keys || [], clicks: x.clicks || 0, impressions: x.impressions || 0, ctr: x.ctr || 0, position: x.position || 0 }));
  });
}
function foGscReason_(msg) {
  if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(msg)) return 'Search Console permission not approved yet: the project needs the "View Search Console data" permission (see Integrations).';
  if (/has not been used in project|is disabled|SERVICE_DISABLED/i.test(msg)) return 'The Search Console API is switched off for this Apps Script project. ' + ((msg.match(/https:\/\/console\.developers\.google\.com\S+/) || [''])[0] || '');
  if (/sufficient permission|not.*verified|403/i.test(msg)) return 'Google refused access: ' + foGscSite_() + ' must be a verified Search Console property of the account that owns this script.';
  return 'Search Console request failed: ' + msg.slice(0, 160);
}
const foRound_ = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
const foGscRow_ = (r, name) => { const o = { clicks: r.clicks, impressions: r.impressions, ctr: foRound_(r.ctr, 4), position: foRound_(r.position, 1) }; if (name) o[name] = r.keys[0]; return o; };

/** Pure: opportunities from query, page and query+page rows (also used by tests). */
function foGscOpportunities_(queries, pages, queryPages) {
  const bestPage = {};
  (queryPages || []).forEach(r => { const q = r.keys[0]; if (!bestPage[q] || r.impressions > bestPage[q].impressions) bestPage[q] = { page: r.keys[1], impressions: r.impressions }; });
  const striking = queries.filter(r => r.position >= 4 && r.position <= 20 && r.impressions >= 10)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 20)
    .map(r => Object.assign(foGscRow_(r, 'query'), { page: (bestPage[r.keys[0]] || {}).page || '', action: r.position <= 10 ? 'On page 1: strengthen the page (answer the query in the first paragraph, add an FAQ, link to it from related posts)' : 'On page 2: a focused post or section for this query could reach page 1' }));
  const lowCtr = pages.filter(r => r.impressions >= 30 && r.position <= 10 && r.ctr < foExpectedCtr_(r.position) * 0.5)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 15)
    .map(r => Object.assign(foGscRow_(r, 'page'), { expected_ctr: foExpectedCtr_(r.position), action: 'Shown often but rarely clicked: rewrite the title and meta description to match what people search' }));
  const questions = queries.filter(r => /^(how|what|when|where|which|why|kya|kab|kaise|kitne|kahan)\b|\?|time|timing|date|kab hai|kitne baje/i.test(r.keys[0]) && r.impressions >= 5)
    .sort((a, b) => b.impressions - a.impressions).slice(0, 15).map(r => foGscRow_(r, 'query'));
  return { striking, low_ctr: lowCtr, questions };
}

/** Search Console report for a date range, cached 6 hours (Google's data itself lags 2–3 days). */
function foGsc_(from, to) {
  const site = foGscSite_(), cacheKey = 'FO_GSC_' + site.replace(/\W/g, '') + '_' + from + '_' + to, hit = foCacheGet_(cacheKey); if (hit) return hit;
  const n = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1, pFrom = FoMetrics.addDays(from, -n), pTo = FoMetrics.addDays(from, -1);
  try {
    const R = foGscBatch_(from, to, [{}, { dimensions: ['date'], rowLimit: 500 }, { dimensions: ['query'], rowLimit: 1000 }, { dimensions: ['page'], rowLimit: 300 },
      { dimensions: ['device'] }, { dimensions: ['country'], rowLimit: 10 }, { dimensions: ['query', 'page'], rowLimit: 2000 }, { startDate: pFrom, endDate: pTo }]);
    const [tot, daily, queries, pages, devices, countries, qp, prev] = R, zero = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const path = u => String(u).replace(/^https?:\/\/[^/]+/, '') || '/';
    const out = { connected: true, site, from, to, fetched_at: foNow_(), previous_from: pFrom, previous_to: pTo,
      totals: tot[0] ? foGscRow_(tot[0]) : zero, previous: prev[0] ? foGscRow_(prev[0]) : zero,
      daily: daily.map(r => foGscRow_(r, 'date')).sort((a, b) => a.date < b.date ? -1 : 1),
      queries: queries.slice(0, 200).map(r => foGscRow_(r, 'query')), query_count: queries.length,
      pages: pages.slice(0, 100).map(r => Object.assign(foGscRow_(r, 'page'), { path: path(r.keys[0]) })),
      devices: devices.map(r => foGscRow_(r, 'device')), countries: countries.map(r => foGscRow_(r, 'country')),
      opportunities: foGscOpportunities_(queries, pages, qp) };
    out.opportunities.striking.forEach(o => { o.page = o.page ? path(o.page) : ''; });
    out.opportunities.low_ctr.forEach(o => { o.path = path(o.page); });
    foCachePut_(cacheKey, out, 21600);
    return out;
  } catch (e) {
    const msg = String(e && e.message || e);
    foAudit_('system', 'gsc_error', msg.slice(0, 300), 'error');
    return { connected: false, site, reason: foGscReason_(msg) };
  }
}
function foGscApi_(b) {
  const from = foDate_(b.from), to = foDate_(b.to);
  if (!from || !to || to < from) return { ok: false, error: 'Check the dates.' };
  return { gsc: foGsc_(from, to) };
}

// ---------------------------------------------------------------- keyword watchlist ----------------
function foSeoKeywordSave_(b, user) {
  const r = b.record || {}, rec = { keyword_id: r.keyword_id || '', keyword: foClean_(r.keyword, 120).trim().toLowerCase(), target_page: foClean_(r.target_page, 300).trim(),
    notes: foClean_(r.notes, 500), status: r.status === 'paused' ? 'paused' : 'active' };
  return foUpsert_('SeoKeywords', 'keyword_id', 'KW', rec, user, x => !x.keyword ? 'Type the keyword.' : (!x.keyword_id && foRows_('SeoKeywords').some(k => k.keyword === x.keyword)) ? 'That keyword is already on the list.' : null);
}
/** Daily: position of each watched keyword over the last 7 days of Search Console data (it lags ~2 days). */
function foSeoRanks_(today) {
  const kws = foRows_('SeoKeywords').filter(k => k.status !== 'paused'); if (!kws.length) return 'no keywords';
  if (foRows_('SeoRanks').some(r => r.date === today)) return 'exists';
  const to = FoMetrics.addDays(today, -2), from = FoMetrics.addDays(to, -6);
  let rows; try { rows = foGscBatch_(from, to, [{ dimensions: ['query'], rowLimit: 5000 }])[0]; } catch (e) { return foGscReason_(String(e.message || e)); }
  const by = {}; rows.forEach(r => { by[String(r.keys[0]).toLowerCase()] = r; });
  kws.forEach(k => { const r = by[k.keyword]; foAppend_('SeoRanks', { date: today, keyword: k.keyword, clicks: r ? r.clicks : 0, impressions: r ? r.impressions : 0, ctr: r ? foRound_(r.ctr, 4) : '', position: r ? foRound_(r.position, 1) : '', period: from + '..' + to, created_at: foNow_() }); });
  return kws.length + ' keywords';
}

// ---------------------------------------------------------------- blog topic requests ----------------
function foSeoTopicSave_(b, user) {
  const r = b.record || {}, pick = (v, list, d) => list.indexOf(v) >= 0 ? v : d;
  const rec = { topic_id: r.topic_id || '', title: foClean_(r.title, 200).trim(), keyword: foClean_(r.keyword, 120).trim().toLowerCase(), intent: pick(r.intent, ['informational', 'commercial', 'local', 'festival'], 'informational'),
    priority: pick(r.priority, ['high', 'normal', 'low'], 'normal'), notes: foClean_(r.notes, 1000), status: pick(r.status, ['suggested', 'approved', 'queued', 'in_progress', 'written', 'review', 'failed', 'published', 'skipped'], 'queued'),
    source: pick(r.source, ['manual', 'search console', 'advisor', 'research', 'engine'], 'manual') };
  if (!rec.topic_id) rec.requested_by = user.email;
  return foUpsert_('SeoTopics', 'topic_id', 'TOP', rec, user, x => !x.title && !x.keyword ? 'Give a topic or a keyword.' : null);
}
/** Automation: the next queued topic (high priority first, then oldest), marked in progress so two runs never take the same one. */
function foSeoNextTopic_() {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const rank = { high: 0, normal: 1, low: 2 };
    // a topic stuck "in progress" for more than a day (failed run) goes back to the queue
    foRows_('SeoTopics').filter(t => t.status === 'in_progress' && t.started_at && Date.now() - Date.parse(t.started_at) > 864e5).forEach(t => { t.status = t.auto === 'yes' ? 'approved' : 'queued'; foUpdate_('SeoTopics', t._row, t); });
    // topics accepted in the portal go first: the owner is waiting for them
    const open = foRows_('SeoTopics'), pool = open.filter(x => x.status === 'approved').length ? open.filter(x => x.status === 'approved') : open.filter(x => x.status === 'queued');
    const t = pool.sort((a, b) => (rank[a.priority] - rank[b.priority]) || (a.created_at < b.created_at ? -1 : 1))[0];
    if (!t) return { topic: null };
    t.status = 'in_progress'; t.started_at = foNow_(); t.updated_at = foNow_(); t.updated_by = 'automation'; foUpdate_('SeoTopics', t._row, t);
    return { topic: { topic_id: t.topic_id, title: t.title, keyword: t.keyword, intent: t.intent, notes: t.notes, approved: t.auto === 'yes' } };
  } finally { lock.releaseLock(); }
}
function foSeoTopicDone_(b) {
  const t = foRows_('SeoTopics').find(x => x.topic_id === b.topic_id); if (!t) return { ok: false, error: 'Topic not found.' };
  // accepted topics are only live once the publish agent has merged them: done = written, then live or review
  const auto = t.auto === 'yes';
  t.status = b.status === 'live' ? 'published' : b.status === 'review' ? 'review' : b.status === 'failed' ? (auto ? 'failed' : 'queued') : auto ? 'written' : 'published'; t.slug = foClean_(b.slug, 120) || t.slug; t.updated_at = foNow_(); t.updated_by = 'automation';
  foUpdate_('SeoTopics', t._row, t); return { status: t.status };
}

// ---------------------------------------------------------------- blog engine: ideas from real demand ----------------
/**
 * Daily, or "Find new ideas" in CRM → Blog engine. Scores what people are searching around Ujjain, what Google already shows the site for and
 * the events ahead, boosts what Google Analytics shows already pulls readers, leaves out what the blog has covered, and keeps the best 8. The score ranks ideas against each other
 * from these signals; it is not a promise of traffic. A free model polishes titles; without one a plain title is used. No guest data is involved.
 */
const FO_BLOG = { KEEP: 8, PLACE: /ujjain|mahakal|omkareshwar|simhastha|kumbh|harsiddhi|kaal ?bhairav|ram ghat|bhasma|shipra|mangalnath|sandipani|chintaman/i,
  FIT: /\b(stay|hotel|villa|room|resort|dharamshala|darshan|aarti|bhasma|temple|yatra|trip|tour|itinerary|reach|distance|train|bus|flight|parking|timing|booking)\b/i, STOP: ['the', 'and', 'for', 'with', 'from', 'guide', 'best', 'complete', 'how', 'what', 'when', 'your', 'near', '2025', '2026', '2027'] };
function foBlogWords_(s) { return foActTokens_(s).filter(w => w.length > 2 && FO_BLOG.STOP.indexOf(w) < 0); }
function foBlogSame_(a, b) { const x = foBlogWords_(a), y = foBlogWords_(b); if (!x.length || !y.length) return false; const n = x.filter(w => y.indexOf(w) >= 0).length; return n / Math.min(x.length, y.length) >= 0.75; }
function foBlogCandidates_(today, health) {
  health = health || {};
  const out = [], add = FoMetrics.addDays, days = d => Math.round((Date.parse(d) - Date.parse(today)) / 864e5), fit = k => FO_BLOG.FIT.test(k) ? 10 : 4;
  // 1) events ahead: a post needs 2–5 weeks to be found before the date
  health.events = { ok: true, ahead: 0 };
  foRows_('Events').forEach(e => {
    const d = foDate_(e.start); if (!d || d < add(today, 5) || d > add(today, 75)) return; const n = days(d); health.events.ahead++;
    const keyword = String(e.name).toLowerCase() + (FO_BLOG.PLACE.test(e.name) ? '' : ' ujjain') + ' ' + d.slice(0, 4);
    out.push({ keyword, kind: 'festival', target_date: d, demand: e.kind === 'mega' ? 35 : e.kind === 'festival' ? 30 : 22, timing: n >= 14 && n <= 35 ? 30 : n > 35 ? 20 : 14, rank: 10, fit: 10, why: e.name + ' is in ' + n + ' days (' + d + '): publishing now gives Google time to find it.' });
  });
  // festivals from the Hindu calendar signal (computed daily for Ujjain), so planning works even with an empty Events list
  const fest = {}; foRows_('Signals').filter(x => x.signal_id === 'calendar' && x.notes && foNum_(x.index) >= 1.1 && foDate_(x.for_date) >= add(today, 5) && foDate_(x.for_date) <= add(today, 75)).forEach(x => String(x.notes).split(' · ').forEach(n => { const k = n.trim(), d = foDate_(x.for_date); if (k && !/^monday\b|\bmonth\b|^ekadashi$|^amavasya$|^purnima$/i.test(k) && (!fest[k] || d < fest[k].d)) fest[k] = { d, i: foNum_(x.index) }; }));
  health.calendar = { ok: true, festivals: Object.keys(fest).length };
  Object.keys(fest).forEach(k => { if (out.some(c => foBlogSame_(k, c.keyword))) return; const d = fest[k].d, n = days(d);
    out.push({ keyword: k.toLowerCase() + ' ujjain ' + d.slice(0, 4), kind: 'festival', target_date: d, demand: Math.min(36, Math.round(16 + fest[k].i * 8)), timing: n >= 14 && n <= 35 ? 30 : n > 35 ? 20 : 14, rank: 12, fit: 10, why: k + ' is in ' + n + ' days (' + d + '), from the Ujjain Hindu calendar: publishing now gives Google time to find it.' }); });
  // 2) what people search around Ujjain right now (Google Trends)
  const rivals = foRows_('Competitors').map(c => c.name).concat(foRows_('CompSet').map(c => c.name)).filter(Boolean);
  const isBrand = k => /^(?!best|cheap|budget|luxury|family|top|good|ujjain|mahakal|near|private|pure)\S+( \S+)? (villa|villas|hotel|resort|lodge|inn|palace|dham|residency|homestay)\b/.test(k) || rivals.some(r => foBlogSame_(k, r));
  const kw = foRows_('SearchKeywords'), last = kw.map(x => String(x.date)).sort().pop();
  health.trends = { ok: !!last, as_of: last || '', age_days: last ? days(last) * -1 : null, keywords: kw.filter(x => String(x.date) === last).length };
  kw.filter(x => String(x.date) === last && FO_BLOG.PLACE.test(x.keyword)).forEach(x => {
    const avg = foNum_(x.avg7), change = foHasNum_(x.change) ? foNum_(x.change) : 0, rising = String(x.rising || ''); if (!rising && change < 10 && avg < 40) return; if (isBrand(String(x.keyword).toLowerCase())) return;
    const head = foBlogWords_(x.keyword).length <= 2;   // a one- or two-word phrase is too broad for a small site to win
    out.push({ keyword: String(x.keyword).toLowerCase(), kind: /darshan|aarti|temple|timing|bhasma/.test(x.keyword) ? 'informational' : 'local', target_date: '', demand: Math.min(head ? 18 : 40, Math.round(avg / 4) + (rising ? 14 : 0)), timing: rising ? 24 : change >= 10 ? 16 : change < 0 ? 3 : 8, rank: head ? 3 : 10, fit: fit(x.keyword),
      why: rising ? 'Rising on Google now (' + rising + ').' : 'Steady Google interest' + (change ? ', ' + (change > 0 ? '+' : '') + Math.round(change) + '% against last month' : '') + '.' });
  });
  // 3) searches where Google already shows the site just off the top: the cheapest wins
  try {
    const g = foGsc_(add(today, -30), add(today, -3)), o = g && g.opportunities;
    health.gsc = g && g.connected ? { ok: true, from: g.from, to: g.to, queries: g.query_count, clicks: g.totals.clicks, impressions: g.totals.impressions, fetched_at: g.fetched_at } : { ok: false, reason: (g && g.reason) || 'No Search Console data.' };
    ((o && o.striking) || []).concat((o && o.questions) || []).forEach(r => {
      const k = String(r.query || r.key || '').toLowerCase(), pos = foNum_(r.position), imp = foNum_(r.impressions); if (!k || (pos && pos < 4) || isBrand(k)) return;
      if (/^\/?blog\//.test(String(r.page || '').replace(/^\//, '')) && pos <= 10) return;   // your own post already ranks: a new one would compete with it
      out.push({ keyword: k, kind: 'informational', target_date: '', demand: Math.min(40, Math.round(imp / 5) + 8), timing: 14, rank: pos <= 12 ? 20 : 14, fit: fit(k), pos, why: 'Google already shows your site for this ' + imp + ' times a month at position ' + Math.round(pos) + '; a dedicated post can lift it.' });
    });
  } catch (e) { health.gsc = { ok: false, reason: String(e.message || e).slice(0, 160) }; }
  // 4) Google Analytics: what already brings readers. A topic close to a page people land on gets a lift, and the reason says so
  try {
    const ga = foGa4_(add(today, -28), add(today, -1));
    if (ga && ga.connected) {
      const pages = (ga.landing || []).filter(r => /^\/blog\//.test(r.landingPage || '')); health.ga4 = { ok: true, from: ga.from, to: ga.to, sessions: ga.totals.sessions || 0, blog_pages: pages.length, fetched_at: ga.fetched_at };
      for (let i = out.length - 1; i >= 0; i--) { const c = out[i], hit = pages.find(r => foBlogWords_(r.landingPage.replace(/[\/.-]/g, ' ').replace(/\bblog\b|\bhtml\b/g, '')).filter(w => ['ujjain', 'mahakal', 'mahakaleshwar', 'temple'].indexOf(w) < 0 && foBlogWords_(c.keyword).indexOf(w) >= 0).length >= 2); if (hit && c.pos && c.pos <= 10) { out.splice(i, 1); continue; }   // that post already ranks for this: improve it, do not compete with it
        if (hit && hit.sessions) { c.demand = Math.min(50, c.demand + Math.min(12, 3 + Math.round(hit.sessions / 5))); c.why += ' Your post ' + hit.landingPage + ' already brought ' + hit.sessions + ' sessions in 28 days, so readers want this.'; } }
    } else health.ga4 = { ok: false, reason: (ga && ga.reason) || 'No Analytics data.' };
  } catch (e) { health.ga4 = { ok: false, reason: String(e.message || e).slice(0, 160) }; }
  return out;
}
/** People on the website this minute (GA4 realtime, last 30 minutes). */
function foBlogLive_() {
  const hit = foCacheGet_('FO_BLOG_LIVE'); if (hit) return hit;
  if (typeof AnalyticsData === 'undefined') return { ok: false, reason: 'The Google Analytics service is not enabled.' };
  try {
    const r = AnalyticsData.Properties.runRealtimeReport({ dimensions: [{ name: 'unifiedScreenName' }], metrics: [{ name: 'activeUsers' }], limit: 8 }, 'properties/' + foSettings_().ga4_property);
    const pages = (r.rows || []).map(x => ({ page: x.dimensionValues[0].value, users: Number(x.metricValues[0].value) })), t = (r.totals || [])[0];
    const out = { ok: true, active_users: t ? Number(t.metricValues[0].value) : pages.reduce((a, x) => a + x.users, 0), pages, at: foNow_() };
    foCachePut_('FO_BLOG_LIVE', out, 60); return out;
  } catch (e) { return { ok: false, reason: String(e.message || e).slice(0, 160) }; }
}
function foBlogPublished_() {
  try { const r = UrlFetchApp.fetch('https://raw.githubusercontent.com/apvillasandresorts/AP-villa-and-resorts-website/main/content/published.json', { muteHttpExceptions: true }); if (r.getResponseCode() === 200) return JSON.parse(r.getContentText()).posts.map(p => [p.title, p.keyword].join(' ')); } catch (e) {}
  return [];
}
function foBlogPolish_(list) {
  const titled = list.map(x => Object.assign({}, x, { title: x.keyword.charAt(0).toUpperCase() + x.keyword.slice(1) + ': A Practical Guide for Pilgrims' }));
  try {
    const r = foBrainCall_('You are an SEO editor for a pilgrim-family villa stay near Mahakaleshwar temple, Ujjain. For each keyword write a click-worthy, honest title of at most 60 characters that contains the keyword naturally. No invented facts, prices or dates. Reply with ONLY a JSON array of {"i": index, "title": "...", "keyword": "cleaned primary keyword"}.', [], JSON.stringify(list.map((x, i) => ({ i, keyword: x.keyword, why: x.why }))));
    if (r.ok) { const m = String(r.text).match(/\[[\s\S]*\]/); JSON.parse(m ? m[0] : '[]').forEach(a => { if (titled[a.i] && a.title) { titled[a.i].title = foClean_(a.title, 90); if (a.keyword) titled[a.i].keyword = foClean_(a.keyword, 120).toLowerCase(); } }); }
  } catch (e) {}
  return titled;
}
function foBlogSuggest_(today) {
  const published = foBlogPublished_(), health = {}, cands = foBlogCandidates_(today, health).map(c => Object.assign(c, { score: Math.min(99, Math.round((c.demand + c.timing + c.rank + c.fit) * (c.fit < 10 ? 0.75 : 1))) })).sort((a, b) => b.score - a.score);
  const topics = foRows_('SeoTopics'), open = topics.filter(t => t.status !== 'suggested'), taken = published.concat(open.map(t => [t.title, t.keyword].join(' '))), best = [];
  cands.forEach(c => { if (best.length < FO_BLOG.KEEP && !taken.some(t => foBlogSame_(c.keyword, t)) && !best.some(b => foBlogSame_(c.keyword, b.keyword))) best.push(c); });
  if (!best.length) { foSettingSet_('blog_health', JSON.stringify(Object.assign(health, { at: foNow_() }))); return { added: 0, waiting: topics.length - open.length, health }; }   // no data today: keep yesterday's ideas
  topics.filter(t => t.status === 'suggested').sort((a, b) => b._row - a._row).forEach(t => foDeleteRow_('SeoTopics', t._row));   // ideas follow the data: rebuilt on every run
  const now = foNow_();
  foBlogPolish_(best).forEach(c => foAppend_('SeoTopics', { topic_id: foId_('TOP'), title: c.title, keyword: c.keyword, intent: ['informational', 'commercial', 'local', 'festival'].indexOf(c.kind) >= 0 ? c.kind : 'informational', priority: c.score >= 60 ? 'high' : 'normal', notes: '', status: 'suggested', source: 'engine', requested_by: 'blog engine', created_at: now, updated_at: now, updated_by: 'blog engine', score: c.score, why: foClean_(c.why, 300), target_date: c.target_date, auto: '' }));
  foSettingSet_('blog_health', JSON.stringify(Object.assign(health, { at: foNow_() })));
  return { added: best.length, waiting: best.length, health };
}
/** For the portal strip and the automated check: live visitors, and when each source last delivered. */
function foBlogStatus_() { let health = {}; try { health = JSON.parse(foSettings_().blog_health || '{}'); } catch (e) {} return { live: foBlogLive_(), health }; }
/** The owner's click is the approval to write and publish this one post. blog-queue.yml picks it up within about 15 minutes. */
function foBlogAccept_(b, user) {
  const t = foRows_('SeoTopics').find(x => x.topic_id === b.topic_id); if (!t) return { ok: false, error: 'Topic not found.' };
  if (['suggested', 'queued', 'failed', 'review'].indexOf(t.status) < 0) return { ok: false, error: 'This topic is already ' + t.status.replace('_', ' ') + '.' };
  t.status = 'approved'; t.auto = 'yes'; t.priority = 'high'; t.updated_at = foNow_(); t.updated_by = user.email; foUpdate_('SeoTopics', t._row, t);
  foAudit_(user.email, 'blog_accept', t.topic_id + ' ' + t.title, 'ok'); delete t._row; return { record: t };
}
function foBlogSkip_(b, user) {
  const t = foRows_('SeoTopics').find(x => x.topic_id === b.topic_id); if (!t) return { ok: false, error: 'Topic not found.' };
  t.status = 'skipped'; t.updated_at = foNow_(); t.updated_by = user.email; foUpdate_('SeoTopics', t._row, t); delete t._row; return { record: t };
}

// ---------------------------------------------------------------- campaigns (UTM links) ----------------
const FO_CAMPAIGN_CHANNELS = { whatsapp: ['whatsapp', 'social'], instagram: ['instagram', 'social'], facebook: ['facebook', 'social'], google_business: ['google', 'organic_local'], google_ads: ['google', 'cpc'], email: ['newsletter', 'email'], print: ['qr', 'print'], partner: ['partner', 'referral'], other: ['other', 'referral'] };
function foCampaignSave_(b, user) {
  const r = b.record || {}, ch = FO_CAMPAIGN_CHANNELS[r.channel] ? r.channel : 'other', slug = v => foClean_(v, 60).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const rec = { campaign_id: r.campaign_id || '', name: foClean_(r.name, 120).trim(), channel: ch, utm_campaign: slug(r.utm_campaign || r.name), utm_source: slug(r.utm_source || FO_CAMPAIGN_CHANNELS[ch][0]),
    utm_medium: slug(r.utm_medium || FO_CAMPAIGN_CHANNELS[ch][1]), landing_url: /^https:\/\/www\.apvillasandresorts\.in\//.test(String(r.landing_url || '')) ? String(r.landing_url).slice(0, 300) : 'https://www.apvillasandresorts.in/',
    start: foDate_(r.start), end: foDate_(r.end), budget: foHasNum_(r.budget) ? foNum_(r.budget) : '', spent: foHasNum_(r.spent) ? foNum_(r.spent) : '', notes: foClean_(r.notes, 1000), status: ['planned', 'live', 'ended'].indexOf(r.status) >= 0 ? r.status : 'planned' };
  return foUpsert_('Campaigns', 'campaign_id', 'CMPN', rec, user, x => !x.name ? 'Name the campaign.' : !x.utm_campaign ? 'Give the campaign a short code.' : null);
}
/** GA4 visits and booking-intent actions by campaign (sessionCampaignName), for the live site only. */
function foCampaignReport_(b) {
  const from = foDate_(b.from), to = foDate_(b.to); if (!from || !to || to < from) return { ok: false, error: 'Check the dates.' };
  if (typeof AnalyticsData === 'undefined') return { report: { connected: false, reason: 'Google Analytics is not connected yet.' } };
  const s = foSettings_(), prop = 'properties/' + s.ga4_property, cacheKey = 'FO_CMP_' + from + '_' + to, hit = foCacheGet_(cacheKey); if (hit) return { report: hit };
  const host = { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: s.ga4_host } } };
  const intent = { filter: { fieldName: 'eventName', inListFilter: { values: ['enquiry_form_submit', 'whatsapp_click', 'phone_click', 'enquiry_sheet_open'] } } };
  try {
    const out = AnalyticsData.Properties.batchRunReports({ requests: [
      { dateRanges: [{ startDate: from, endDate: to }], dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionSourceMedium' }], metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }], dimensionFilter: host, limit: 200 },
      { dateRanges: [{ startDate: from, endDate: to }], dimensions: [{ name: 'sessionCampaignName' }, { name: 'eventName' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { andGroup: { expressions: [host, intent] } }, limit: 400 },
    ] }, prop);
    const rows = {}, rep = (out.reports || []);
    (rep[0] && rep[0].rows || []).forEach(r => { const k = r.dimensionValues[0].value; const o = rows[k] = rows[k] || { campaign: k, source_medium: [], sessions: 0, engaged: 0, intent: 0, enquiries: 0, whatsapp: 0 }; o.source_medium.push(r.dimensionValues[1].value); o.sessions += Number(r.metricValues[0].value); o.engaged += Number(r.metricValues[1].value); });
    (rep[1] && rep[1].rows || []).forEach(r => { const k = r.dimensionValues[0].value, ev = r.dimensionValues[1].value, n = Number(r.metricValues[0].value); const o = rows[k] = rows[k] || { campaign: k, source_medium: [], sessions: 0, engaged: 0, intent: 0, enquiries: 0, whatsapp: 0 };
      if (ev !== 'enquiry_sheet_open') o.intent += n; if (ev === 'enquiry_form_submit') o.enquiries += n; if (ev === 'whatsapp_click') o.whatsapp += n; });
    const res = { connected: true, from, to, fetched_at: foNow_(), rows: Object.keys(rows).map(k => rows[k]).sort((a, b) => b.sessions - a.sessions) };
    foCachePut_(cacheKey, res, 1800);
    return { report: res };
  } catch (e) { return { report: { connected: false, reason: 'GA4 request failed: ' + String(e && e.message || e).slice(0, 160) } }; }
}

// ---------------------------------------------------------------- SEO audit of the live site ----------------
/** Pure: checks one page's HTML (also used by tests). */
function foSeoCheckPage_(url, code, html) {
  const m = (re, i) => { const x = html.match(re); return x ? x[i || 1] : ''; }, issues = [];
  const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
  const title = strip(m(/<title[^>]*>([\s\S]*?)<\/title>/i)), desc = m(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  const h1 = (html.match(/<h1[\s>]/gi) || []).length, canon = m(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i), og = m(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  const noindex = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html), ld = (html.match(/application\/ld\+json/gi) || []).length;
  const imgs = html.match(/<img\b[^>]*>/gi) || [], noAlt = imgs.filter(t => !/\balt=["'][^"']+["']/i.test(t)).length;
  const words = strip(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')).split(' ').length;
  if (code !== 200) issues.push(['high', 'Page returns HTTP ' + code]);
  if (!title) issues.push(['high', 'No <title>']); else if (title.length > 65) issues.push(['low', 'Title is ' + title.length + ' characters (Google shows about 60)']); else if (title.length < 25) issues.push(['medium', 'Title is short (' + title.length + ' characters)']);
  if (!desc) issues.push(['medium', 'No meta description']); else if (desc.length > 165) issues.push(['low', 'Meta description is ' + desc.length + ' characters (about 155 are shown)']); else if (desc.length < 70) issues.push(['low', 'Meta description is short (' + desc.length + ' characters)']);
  if (h1 === 0) issues.push(['medium', 'No H1 heading']); else if (h1 > 1) issues.push(['low', h1 + ' H1 headings (one is clearer)']);
  if (!canon) issues.push(['medium', 'No canonical link']); else if (!/^https:\/\/www\.apvillasandresorts\.in\//.test(canon)) issues.push(['high', 'Canonical points elsewhere: ' + canon]);
  if (!og) issues.push(['low', 'No og:image (link previews on WhatsApp/Facebook)']);
  if (noindex) issues.push(['high', 'Page is set to noindex but is in the sitemap']);
  if (noAlt) issues.push(['low', noAlt + ' image(s) without alt text']);
  if (!ld) issues.push(['low', 'No structured data (JSON-LD)']);
  return { url, path: url.replace(/^https?:\/\/[^/]+/, '') || '/', code, title, title_len: title.length, desc_len: desc.length, h1, canonical: canon, og_image: !!og, noindex, images: imgs.length, images_no_alt: noAlt, jsonld: ld, words, kb: Math.round(html.length / 1024), issues };
}
function foSeoAudit_(b) {
  const cacheKey = 'FO_SEO_AUDIT'; if (!b.refresh) { const hit = foCacheGet_(cacheKey); if (hit) return { audit: hit }; }
  const base = 'https://www.apvillasandresorts.in/', opt = { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'APVillas-FounderOS-SEO-audit' } };
  const sm = UrlFetchApp.fetch(base + 'sitemap.xml', opt), robots = UrlFetchApp.fetch(base + 'robots.txt', opt);
  const urls = (sm.getContentText().match(/<loc>([^<]+)<\/loc>/g) || []).map(x => x.replace(/<\/?loc>/g, '').trim()).slice(0, 80);
  const res = UrlFetchApp.fetchAll(urls.map(u => Object.assign({ url: u }, opt)));
  const pages = urls.map((u, i) => foSeoCheckPage_(u, res[i].getResponseCode(), res[i].getContentText()));
  const titles = {}; pages.forEach(p => { if (p.title) (titles[p.title] = titles[p.title] || []).push(p.path); });
  Object.keys(titles).filter(t => titles[t].length > 1).forEach(t => titles[t].forEach(path => pages.find(p => p.path === path).issues.push(['medium', 'Same title as ' + titles[t].filter(x => x !== path).join(', ')])));
  const count = s => pages.reduce((n, p) => n + p.issues.filter(i => i[0] === s).length, 0);
  const out = { at: foNow_(), sitemap_ok: sm.getResponseCode() === 200, robots_ok: robots.getResponseCode() === 200 && /sitemap:/i.test(robots.getContentText()), pages,
    summary: { pages: pages.length, high: count('high'), medium: count('medium'), low: count('low'), clean: pages.filter(p => !p.issues.length).length } };
  foCachePut_(cacheKey, out, 86400);
  return { audit: out };
}

// ---------------------------------------------------------------- for the business advisor (automation summary) ----------------
function foSearchSummary_(today) {
  const to = FoMetrics.addDays(today, -2), from = FoMetrics.addDays(to, -27), g = foGsc_(from, to);
  if (!g.connected) return { connected: false, reason: g.reason };
  return { connected: true, from, to, totals: g.totals, previous: g.previous, top_queries: g.queries.slice(0, 25), top_pages: g.pages.slice(0, 15).map(p => ({ path: p.path, clicks: p.clicks, impressions: p.impressions, ctr: p.ctr, position: p.position })),
    striking: g.opportunities.striking.slice(0, 12), low_ctr: g.opportunities.low_ctr.slice(0, 8), devices: g.devices };
}

// ---------------------------------------------------------------- system health (one click: is everything connected and running?) ----------------
/**
 * Checks every moving part and says, in plain words, what is fine, what needs a look and what is broken:
 * data sheet, e-check-in sync, hourly trigger, daily job, recent job failures, Google Analytics (and whether booking-intent
 * events are marked as key events), Search Console, automation key, email quota and recent server errors. Cached 10 minutes.
 */
function foHealth_(b) {
  const cacheKey = 'FO_HEALTH'; if (!(b && b.refresh)) { const hit = foCacheGet_(cacheKey); if (hit) return { health: hit }; }
  const t0 = Date.now(), checks = [], today = foToday_(), now = Date.now();
  const add = (area, name, status, detail, fix) => checks.push({ area, name, status, detail, fix: fix || '' });
  const hoursSince = iso => iso ? (now - Date.parse(iso)) / 36e5 : Infinity;
  const safe = (area, name, fn) => { try { fn(); } catch (e) { add(area, name, 'fail', String(e && e.message || e).slice(0, 200)); } };
  safe('Data', 'Founder OS data sheet', () => { const n = foRows_('Bookings').length, g = foRows_('Guests').length; add('Data', 'Founder OS data sheet', 'ok', n + ' bookings and ' + g + ' guests readable'); });
  safe('Data', 'E-check-in sync', () => {
    const h = hoursSince(PropertiesService.getScriptProperties().getProperty('FO_LAST_SYNC'));
    add('Data', 'E-check-in sync', h <= 2 ? 'ok' : h <= 26 ? 'warn' : 'fail', h === Infinity ? 'Never ran' : 'Last ran ' + Math.round(h * 10) / 10 + ' hours ago (runs every hour)', h > 2 ? 'Check that the hourly trigger exists (below) and that the last runs in Apps Script → Executions succeeded.' : '');
  });
  safe('Automation', 'Hourly trigger', () => {
    const fns = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
    add('Automation', 'Hourly trigger', fns.indexOf('foHourly') >= 0 ? 'ok' : 'fail', fns.length ? 'Triggers: ' + fns.join(', ') : 'No triggers found', fns.indexOf('foHourly') >= 0 ? '' : 'Run foSetup once in Apps Script to recreate it.');
  });
  safe('Automation', 'Daily job', () => {
    const s = foSettings_(), hour = Number(Utilities.formatDate(new Date(), FO.TZ, 'H'));
    add('Automation', 'Daily job (reports, snapshot, signals)', s.last_daily === today || hour < 8 ? 'ok' : s.last_daily === FoMetrics.addDays(today, -1) ? 'warn' : 'fail', 'Last completed: ' + (s.last_daily || 'never'));
  });
  safe('Automation', 'Recent job failures', () => {
    const bad = foRows_('Jobs').filter(j => j.status === 'failed' && hoursSince(j.finished || j.started) <= 48);
    const by = {}; bad.forEach(j => { by[j.job] = (by[j.job] || 0) + 1; });
    add('Automation', 'Job failures (last 48 h)', bad.length ? 'warn' : 'ok', bad.length ? Object.keys(by).map(k => k + ' × ' + by[k]).join(', ') + ' · latest: ' + String(bad[bad.length - 1].detail || '').slice(0, 140) : 'None');
  });
  safe('Google', 'Google Analytics 4', () => {
    const to = FoMetrics.addDays(today, -1), g = foGa4_(FoMetrics.addDays(to, -6), to);
    if (!g.connected) { add('Google', 'Google Analytics 4', 'fail', g.reason); return; }
    add('Google', 'Google Analytics 4', 'ok', (g.totals.sessions || 0) + ' sessions and ' + (g.totals.activeUsers || 0) + ' users in the last 7 days');
    const intent = g.intent || 0, key = g.totals.keyEvents || 0;
    add('Google', 'GA4 key events', key > 0 ? 'ok' : intent > 0 ? 'warn' : 'ok', key > 0 ? key + ' key events in 7 days' : intent > 0 ? intent + ' WhatsApp/call/enquiry actions happened but none is marked as a key event' : 'No booking-intent actions in the last 7 days',
      key > 0 || !intent ? '' : 'GA4 → Admin → Events: mark whatsapp_click, phone_click, enquiry_form_submit, echeckin_submit and journal_subscribe as key events.');
  });
  safe('Google', 'Search Console', () => {
    const to = FoMetrics.addDays(today, -2), g = foGsc_(FoMetrics.addDays(to, -6), to);
    add('Google', 'Search Console', g.connected ? 'ok' : 'fail', g.connected ? g.totals.clicks + ' clicks from ' + g.totals.impressions + ' Google impressions (7 days)' : g.reason);
  });
  safe('Automation', 'Automation key', () => { const a = foAutomationStatus_(); add('Automation', 'Automation key (research job, blog topics, advisor figures)', a.active ? 'ok' : 'warn', a.active ? 'Active · last used ' + (a.last_used || 'never') : 'Not created yet', a.active ? '' : 'Settings → Automation → Create key, then save it as the GitHub secret FOUNDER_OS_KEY.'); });
  safe('Email', 'Email quota', () => { const q = MailApp.getRemainingDailyQuota(); add('Email', 'Email quota left today', q > 20 ? 'ok' : q > 0 ? 'warn' : 'fail', q + ' emails (Google free limit: 100 a day)'); });
  safe('Server', 'Server errors', () => {
    // an error from a service that passes its own check now is resolved (e.g. Search Console errors from before it was connected)
    const okNow = n => checks.some(c => c.name === n && c.status === 'ok'), resolved = a => (/^gsc/.test(a.action) && okNow('Search Console')) || (/^(ga4|ga_)/.test(a.action) && okNow('Google Analytics 4'));
    const errs = foRows_('Audit').filter(a => a.result === 'error' && hoursSince(a.ts) <= 24 && !resolved(a)), by = {};
    errs.forEach(a => { by[a.action] = (by[a.action] || 0) + 1; });
    add('Server', 'Errors logged (last 24 h)', !errs.length ? 'ok' : errs.length < 5 ? 'warn' : 'fail', errs.length ? Object.keys(by).map(k => k + ' × ' + by[k]).join(', ') + ' · latest: ' + String(errs[errs.length - 1].detail || '').slice(0, 140) : 'None');
  });
  const count = s => checks.filter(c => c.status === s).length;
  const out = { at: foNow_(), ms: Date.now() - t0, checks, summary: { ok: count('ok'), warn: count('warn'), fail: count('fail') } };
  foCachePut_(cacheKey, out, 600);
  return { health: out };
}
/** Run from the Apps Script editor (▶ Run) to print the system health check to the execution log. */
function foHealthCheck() {
  const h = foHealth_({ refresh: true }).health;
  h.checks.forEach(c => console.log((c.status === 'ok' ? 'OK      ' : c.status === 'warn' ? 'CHECK   ' : 'PROBLEM ') + c.name + ': ' + c.detail + (c.fix ? ' → ' + c.fix : '')));
  console.log(h.summary.ok + ' OK, ' + h.summary.warn + ' to check, ' + h.summary.fail + ' problems');
  return h.summary;
}
