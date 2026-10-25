/**
 * AP Villas Founder OS · backend part 4: market intelligence, pricing settings and the automation key.
 * Market data = dated public observations (competitor prices, positioning, demand signals). A public price is an observation
 * on a date, never proof of what anyone actually sold at. Pricing itself is computed by FoInsights.pricing (shared with the portal).
 *
 * Automation key: lets the scheduled research job (GitHub Actions, using the Claude subscription) and local Claude workflows
 * push market data and reports. Created/rotated/revoked only by the founder in the portal; stored only as a keyed digest;
 * allows a fixed short list of actions that never return guest names, phones or emails.
 */
const FO_MACHINE_ROUTES = {
  'f.m.ping': b => ({ pong: true, today: foToday_() }),
  'f.m.market.import': b => foMarketImport_(b, 'automation'),
  'f.m.report.upload': b => foReportUpload_(b),
  'f.m.ga4': b => foGa4Api_(b),
  'f.m.summary': b => foMachineSummary_(b),
  'f.m.seo.next': b => foSeoNextTopic_(b),   // blog pipeline: next requested topic
  'f.m.seo.done': b => foSeoTopicDone_(b),
  'f.m.signals.import': b => foSignalsImport_(b, 'automation'),   // public-data signals only (news, calendar, holidays, weather)
  'f.m.compset': b => foCompSetPublic_(b),
  'f.m.bots.report': b => foBotsReport_(b),
  'f.m.bots.status': b => ({ today: foToday_(), runs: foRows_('BotRuns').filter(r => String(r.at).slice(0, 10) === foToday_()).map(r => ({ bot: r.bot, at: r.at, status: r.status, pages: r.pages, prices: r.prices, sold_out: r.sold_out, blocked: r.blocked })) }),   // retry planner
  'f.m.news.import': b => foNewsImport_(b),   // news job: relevant headlines (no article text), high-impact ones emailed once   // competitor bots: one row per bot run (pages, prices, blocked) for Signal health   // competitor bot: comp-set listings (public names + public listing links only)
};

// ---------------------------------------------------------------- automation key ----------------
function foAutomationCreate_(b, user) {
  const key = 'apv_' + foRandom_() + foRandom_(), p = PropertiesService.getScriptProperties();
  p.setProperty('FO_AUTOMATION_KEY', foHmac_('automation:' + key));
  p.setProperty('FO_AUTOMATION_META', JSON.stringify({ created_at: foNow_(), created_by: user.email, last_used: '' }));
  foAudit_(user.email, 'automation_key_created', 'previous key (if any) revoked', 'ok');
  return { key, note: 'Shown once. Store it where the automation runs (GitHub secret FOUNDER_OS_KEY); it cannot be shown again.' };
}
function foAutomationRevoke_(b, user) {
  const p = PropertiesService.getScriptProperties(); p.deleteProperty('FO_AUTOMATION_KEY'); p.deleteProperty('FO_AUTOMATION_META');
  foAudit_(user.email, 'automation_key_revoked', '', 'ok'); return {};
}
function foAutomationStatus_() {
  const p = PropertiesService.getScriptProperties(), on = !!p.getProperty('FO_AUTOMATION_KEY');
  return on ? Object.assign({ active: true }, JSON.parse(p.getProperty('FO_AUTOMATION_META') || '{}')) : { active: false };
}
function foMachineApi_(b) {
  const p = PropertiesService.getScriptProperties(), stored = p.getProperty('FO_AUTOMATION_KEY'), a = String(b.action || '');
  if (!stored || String(b.key).length < 40 || !foSafeEqual_(foHmac_('automation:' + b.key), stored)) { foFail_('automation', 'bad automation key'); return { ok: false, auth: false, error: 'Automation key not accepted.' }; }
  if (foCounter_('FO_MACHINE_CALLS', 3600) > 300) return { ok: false, error: 'Too many automation calls this hour.' };
  const fn = FO_MACHINE_ROUTES[a]; if (!fn) return { ok: false, error: 'Action not allowed for the automation key.' };
  const meta = JSON.parse(p.getProperty('FO_AUTOMATION_META') || '{}'); meta.last_used = foNow_(); p.setProperty('FO_AUTOMATION_META', JSON.stringify(meta));
  const out = fn(b) || {}; foFlush_();
  if (a !== 'f.m.ping' && a !== 'f.m.summary' && a !== 'f.m.ga4') foAudit_('automation', a, JSON.stringify(out.result || out.status || '').slice(0, 300), out.ok === false ? 'error' : 'ok');
  if (out.ok === undefined) out.ok = true;
  return out;
}

// ---------------------------------------------------------------- market data ----------------
const FO_MARKET_TABS = { competitor: ['Competitors', 'competitor_id', 'CMP'], rate: ['MarketRates', 'obs_id', 'OBS'], signal: ['DemandSignals', 'signal_id', 'SIG'] };
function foMarketClean_(kind, r) {
  const c = v => foClean_(v, 500), url = v => /^https?:\/\//i.test(String(v || '')) || /^owner_check(:[\w.-]+)?$/.test(String(v || '')) ? String(v).slice(0, 500) : '';
  if (kind === 'competitor') return { competitor_id: r.competitor_id || '', name: c(r.name).slice(0, 120), type: c(r.type).slice(0, 40), area: c(r.area).slice(0, 80), distance_km: foHasNum_(r.distance_km) ? foNum_(r.distance_km) : '',
    bedrooms: foHasNum_(r.bedrooms) ? foNum_(r.bedrooms) : '', sleeps: foHasNum_(r.sleeps) ? foNum_(r.sleeps) : '', segment: c(r.segment).slice(0, 60), website: url(r.website), listing_urls: foClean_(r.listing_urls, 1000),
    positioning: foClean_(r.positioning, 1000), amenities: foClean_(r.amenities, 1000), review_themes: foClean_(r.review_themes, 1000), notes: foClean_(r.notes, 1000), last_checked: foDate_(r.last_checked) || foToday_(), source_url: url(r.source_url) };
  if (kind === 'rate') {
    const nights = Math.max(1, foNum_(r.nights) || 1), total = foHasNum_(r.price_total) ? foNum_(r.price_total) : '', per = foHasNum_(r.price_per_night) ? foNum_(r.price_per_night) : (total !== '' ? Math.round(total / nights) : '');
    return { obs_id: r.obs_id || '', competitor: c(r.competitor).slice(0, 120), observed_at: foDate_(r.observed_at) || foToday_(), stay_date: foDate_(r.stay_date), nights, unit_type: c(r.unit_type).slice(0, 60),
      bedrooms: foHasNum_(r.bedrooms) ? foNum_(r.bedrooms) : '', sleeps: foHasNum_(r.sleeps) ? foNum_(r.sleeps) : '', price_total: total, price_per_night: per, taxes_included: ['yes', 'no'].indexOf(r.taxes_included) >= 0 ? r.taxes_included : 'unknown',
      source_type: ['website', 'ota', 'google', 'phone', 'manual', 'other'].indexOf(r.source_type) >= 0 ? r.source_type : 'other', source_url: url(r.source_url), confidence: ['high', 'medium', 'low'].indexOf(r.confidence) >= 0 ? r.confidence : 'medium', notes: foClean_(r.notes, 500),
      availability: /sold|unavail/i.test(r.availability || '') ? 'sold out' : r.availability ? 'available' : '', group_size: foHasNum_(r.group_size) ? foNum_(r.group_size) : '', target_property: c(r.target_property).slice(0, 40), platform: c(r.platform).slice(0, 30) };
  }
  return { signal_id: r.signal_id || '', date: foDate_(r.date) || foToday_(), source: c(r.source).slice(0, 40), metric: c(r.metric).slice(0, 60), keyword: c(r.keyword).slice(0, 120), value: foHasNum_(r.value) ? foNum_(r.value) : '',
    period: c(r.period).slice(0, 20), growth_pct: foHasNum_(r.growth_pct) ? foNum_(r.growth_pct) : '', source_url: url(r.source_url), notes: foClean_(r.notes, 500) };
}
function foMarketValid_(kind, r) {
  if (kind === 'competitor') return r.name ? null : 'Name the competitor.';
  if (kind === 'rate') return !r.competitor ? 'Name the competitor.' : !(r.price_per_night > 0) && !(r.availability === 'sold out' && r.stay_date) ? 'Enter a price.' : r.price_per_night > 500000 ? 'Price looks wrong.' : null;
  return !r.source || !r.metric ? 'Signal needs a source and a metric.' : null;
}
function foMarketSave_(b, user) {
  const kind = FO_MARKET_TABS[b.kind] ? b.kind : null; if (!kind) return { ok: false, error: 'Unknown market record.' };
  const t = FO_MARKET_TABS[kind], rec = foMarketClean_(kind, b.record || {}); rec.collected_by = user.email;
  return foUpsert_(t[0], t[1], t[2], rec, user, r => foMarketValid_(kind, r));
}
function foMarketDelete_(b, user) {
  const kind = FO_MARKET_TABS[b.kind] ? b.kind : null; if (!kind) return { ok: false, error: 'Unknown market record.' };
  return foDelete_(FO_MARKET_TABS[kind][0], FO_MARKET_TABS[kind][1], b.id, user);
}
/** Bulk import (portal CSV or automation). Idempotent: the same observation twice is skipped. */
function foMarketImport_(b, actor) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const out = { competitors: 0, rates: 0, signals: 0, skipped: 0, rejected: 0 };
    const cmp = foRows_('Competitors'), byName = {}; cmp.forEach(c => { byName[c.name.toLowerCase()] = c; });
    (Array.isArray(b.competitors) ? b.competitors.slice(0, 200) : []).forEach(x => {
      const r = foMarketClean_('competitor', x); if (foMarketValid_('competitor', r)) { out.rejected++; return; }
      const ex = byName[r.name.toLowerCase()];
      if (ex) { Object.keys(r).forEach(k => { if (r[k] !== '' && k !== 'competitor_id') ex[k] = k === 'listing_urls' ? foMergeUrls_(ex[k], r[k]) : r[k]; }); ex.updated_at = foNow_(); ex.updated_by = actor; foUpdate_('Competitors', ex._row, ex); }
      else { r.competitor_id = foId_('CMP'); r.created_at = foNow_(); r.updated_by = actor; foAppend_('Competitors', r); byName[r.name.toLowerCase()] = r; }
      out.competitors++;
    });
    const seenR = {}; foRows_('MarketRates').forEach(r => { seenR[[r.competitor.toLowerCase(), r.observed_at, r.stay_date, r.price_per_night, r.unit_type, r.platform || ''].join('|')] = 1; });
    (Array.isArray(b.rates) ? b.rates.slice(0, 1500) : []).forEach(x => {
      const r = foMarketClean_('rate', x); if (foMarketValid_('rate', r)) { out.rejected++; return; }
      const k = [r.competitor.toLowerCase(), r.observed_at, r.stay_date, String(r.price_per_night), r.unit_type, r.platform || ''].join('|'); if (seenR[k]) { out.skipped++; return; }
      seenR[k] = 1; r.obs_id = foId_('OBS'); r.collected_by = actor; r.created_at = foNow_(); foAppend_('MarketRates', r); out.rates++;
    });
    const seenS = {}; foRows_('DemandSignals').forEach(r => { seenS[[r.date, r.source, r.metric, r.keyword].join('|')] = 1; });
    (Array.isArray(b.signals) ? b.signals.slice(0, 500) : []).forEach(x => {
      const r = foMarketClean_('signal', x); if (foMarketValid_('signal', r)) { out.rejected++; return; }
      const k = [r.date, r.source, r.metric, r.keyword].join('|'); if (seenS[k]) { out.skipped++; return; }
      seenS[k] = 1; r.signal_id = foId_('SIG'); r.collected_by = actor; r.created_at = foNow_(); foAppend_('DemandSignals', r); out.signals++;
    });
    return { result: out };
  } finally { lock.releaseLock(); }
}
function foPricingSettingsSave_(b, user) {
  const s = b.pricing || {}, out = { villas: {} }, props = foRows_('Properties').map(p => p.property_id);
  ['weekend_uplift', 'market_weight', 'floor_pct', 'ceiling_pct', 'mega_ceiling_pct'].forEach(k => { if (foHasNum_(s[k])) out[k] = Math.max(0, Math.min(k.indexOf('ceiling') >= 0 ? 10 : 1, foNum_(s[k]))); });
  if (s.event) { out.event = {}; ['mega', 'festival', 'festival_peak', 'holiday', 'custom'].forEach(k => { if (foHasNum_(s.event[k])) out.event[k] = Math.max(0, Math.min(3, foNum_(s.event[k]))); }); }
  Object.keys(s.villas || {}).forEach(id => { if (props.indexOf(id) < 0) return; const v = s.villas[id], o = {}; ['base', 'floor', 'ceiling'].forEach(k => { if (foHasNum_(v[k]) && foNum_(v[k]) > 0) o[k] = foNum_(v[k]); }); if (o.floor && o.ceiling && o.floor > o.ceiling) return; out.villas[id] = o; });
  foSettingSet_('pricing', JSON.stringify(out));
  foAudit_(user.email, 'pricing_settings', JSON.stringify(out).slice(0, 600), 'ok');
  return { pricing: out };
}

// ---------------------------------------------------------------- reports from the market research job ----------------
function foReportUpload_(b) {
  const type = b.type === 'market' || b.type === 'outlook' ? b.type : null; if (!type) return { ok: false, error: 'Only market reports and outlooks can be uploaded.' };
  const key = String(b.period_key || (type === 'outlook' ? foToday_() : foToday_().slice(0, 7))).replace(/[^\w-]/g, '').slice(0, 20);
  const html = String(b.html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').slice(0, 900000);
  if (html.length < 200) return { ok: false, error: 'Report is empty.' };
  const existing = foRows_('Reports').find(r => r.type === type && r.period_key === key && r.status === 'ok');
  if (existing && !b.force) return { status: 'exists', report_id: existing.report_id };
  const name = (type === 'outlook' ? 'AP Villas 30-day Market Outlook ' : 'AP Villas Market Intelligence ') + key, folder = foReportsFolder_(), file = folder.createFile(Utilities.newBlob(html, 'text/html', name + '.html'));
  let pdf = ''; try { pdf = folder.createFile(Utilities.newBlob(html, 'text/html', name + '.html').getAs('application/pdf').setName(name + '.pdf')).getId(); } catch (e) {}
  const rec = { report_id: foId_('REP'), type, period_key: key, from: foDate_(b.from) || '', to: foDate_(b.to) || foToday_(), generated_at: foNow_(), data_freshness: foToday_(), status: 'ok', html_id: file.getId(), pdf_id: pdf, emailed: '', actor: 'automation' };
  foAppend_('Reports', rec);
  return { status: 'ok', report_id: rec.report_id };
}
/** Aggregates only (no guest names, phones, emails, booking references): for the research job to compare market vs own performance. */
function foMachineSummary_() {
  const D = foDataLoad_(), today = D.today, M = FoMetrics, out = { today, villas: D.properties.map(p => ({ id: p.property_id, name: p.name, bedrooms: p.bedrooms, sleeps: p.sleeps, from_rate: p.from_rate })) };
  [['last_30', 29], ['last_90', 89], ['last_365', 364]].forEach(([k, n]) => { const m = M.compute(D, M.addDays(today, -n), today); out[k] = { occupancy: m.occupancy, adr: m.adr, revpar: m.revpar, revenue: Math.round(m.net_accommodation_revenue), bookings: m.bookings_made, cancellation_rate: m.cancellation_rate, direct_share: m.direct_share_count, alos: m.alos }; });
  out.channels_90 = M.breakdown(D, M.addDays(today, -89), today, 'channel').map(c => ({ channel: c.key, bookings: c.bookings, value: Math.round(c.value), cancelled: c.cancelled }));
  out.villas_90 = M.byProperty(D, M.addDays(today, -89), today).map(v => ({ name: v.name, occupancy: v.occupancy, adr: v.adr, revpar: v.revpar }));
  const fwd = M.compute(D, today, M.addDays(today, 29)); out.next_30_on_books = { occupancy: fwd.occupancy, nights: fwd.occupied_nights, available: fwd.available_nights };
  out.pricing_next_30 = D.properties.map(p => { const r = FoInsights.pricing(D, p.property_id, today, 30); return r ? { villa: p.name, avg: r.summary.avg && Math.round(r.summary.avg), min: r.summary.min, max: r.summary.max, open_nights: r.summary.open_nights } : null; }).filter(Boolean);
  out.competitors = D.competitors.length; out.market_rates = D.market_rates.length; out.latest_market_rate = D.market_rates.map(r => r.observed_at).sort().pop() || null;
  try { out.search = foSearchSummary_(today); } catch (e) { out.search = { connected: false, reason: String(e.message || e).slice(0, 160) }; }
  out.seo = { keywords: D.seo_keywords.length, topics_queued: D.seo_topics.filter(t => t.status === 'queued').length, campaigns: D.campaigns.map(c => ({ name: c.name, channel: c.channel, status: c.status, budget: c.budget, spent: c.spent })) };
  return { summary: out };
}

/** For the competitor price bot: each property's comp set with public listing links and the group size to search for. No own data. */
function foCompSetPublic_(b) {
  const D = foDataLoad_(), cfg = FoDesk.settings(D), comps = D.competitors || [], out = [];
  cfg.properties.forEach(pid => {
    const g = cfg.group[pid] || {};
    FoDesk.compSet(D, pid).forEach(r => {
      const c = comps.find(x => FoDesk.normName(x.name) === r.key) || {};
      const urls = String(c.listing_urls || '').split(/\s+/).concat([c.source_url || '']).filter(u => /^https:\/\/(www\.)?(airbnb\.[a-z.]+\/rooms\/\d+|booking\.com\/hotel\/)/.test(u));
      if (urls.length) out.push({ property: pid, name: r.name, hotel: r.hotel === 'yes', adults: g.adults || 4, url: urls[0].split('?')[0], distance_km: c.distance_km });
    });
  });
  // every known competitor (public names, links, distance) so bots can merge platforms and skip what is already known
  const known = comps.map(c => ({ name: c.name, type: c.type, bedrooms: c.bedrooms, distance_km: c.distance_km, listing_urls: String(c.listing_urls || '').split(/\s+/).concat([c.source_url || '']).filter(u => /^https:\/\//.test(u)) }));
  // nights worth checking: the next 60 days where the calendar, holidays or events lift demand (public signals only)
  const hot = {}; (D.signals || []).forEach(s => { const d = String(s.for_date || '').slice(0, 10); if (d && d >= foToday_() && foNum_(s.index) >= 1.1 && ['calendar', 'holiday', 'events', 'school'].indexOf(s.signal_id) >= 0) hot[d] = Math.max(hot[d] || 0, foNum_(s.index)); });
  return { listings: out, known: known, hot_dates: Object.keys(hot).sort().slice(0, 30), today: foToday_() };
}
function foMergeUrls_(a, b) { const s = {}; String(a || '').split(/\s+/).concat(String(b || '').split(/\s+/)).forEach(u => { if (u) s[u] = 1; }); return Object.keys(s).slice(0, 12).join('\n'); }
/** Bot run report (no prices here: prices arrive through f.m.market.import). */
function foBotsReport_(b) {
  const runs = (Array.isArray(b.runs) ? b.runs : []).slice(0, 40), id = foClean_(b.run_id, 40) || foId_('RUN');
  runs.forEach(x => foAppend_('BotRuns', { run_id: id, at: foNow_(), bot: foClean_(x.bot, 40), platform: foClean_(x.platform, 40), mode: foClean_(x.mode, 20), pages: foNum_(x.pages) || 0, prices: foNum_(x.prices) || 0,
    sold_out: foNum_(x.sold_out) || 0, discovered: foNum_(x.discovered) || 0, blocked: foClean_(x.blocked, 120), status: x.blocked ? 'blocked' : x.error ? 'error' : 'ok', note: foClean_(x.note, 400) }));
  foTouch_();
  return { result: { runs: runs.length } };
}

/** News from the news job: headline, source, link, date, short feed summary and labels. New high-impact stories are emailed once. */
function foNewsImport_(b) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const seen = {}; foRows_('News').forEach(r => { seen[r.news_id] = 1; });
    const out = { added: 0, skipped: 0, rejected: 0, alerted: 0 }, fresh = [];
    (Array.isArray(b.news) ? b.news.slice(0, 200) : []).forEach(n => {
      const id = foClean_(n.news_id, 40), url = /^https?:\/\//.test(String(n.url || '')) ? String(n.url).slice(0, 600) : '';
      if (!id || !url || !n.title) { out.rejected++; return; }
      if (seen[id]) { out.skipped++; return; }
      seen[id] = 1;
      const row = { news_id: id, published_at: foClean_(n.published_at, 30), fetched_at: foClean_(n.fetched_at, 30) || foNow_(), title: foClean_(n.title, 300), source: foClean_(n.source, 80), url: url,
        lang: n.lang === 'hi' ? 'hi' : 'en', category: foClean_(n.category, 20), categories: foClean_(n.categories, 120), impact: ['high', 'medium', 'low'].indexOf(n.impact) >= 0 ? n.impact : 'low',
        direction: ['up', 'down', 'neutral'].indexOf(n.direction) >= 0 ? n.direction : 'neutral', score: foNum_(n.score) || 0, summary: foClean_(n.summary, 300), query: foClean_(n.query, 20), alerted: '' };
      foAppend_('News', row); out.added++; if (row.impact === 'high') fresh.push(row);
    });
    if (fresh.length) {
      try {
        MailApp.sendEmail({ to: foDeskRecipient_(), subject: 'AP Villas news: ' + fresh.length + ' high-impact ' + (fresh.length === 1 ? 'story' : 'stories'),
          body: fresh.slice(0, 8).map(n => '• ' + n.title + ' (' + n.source + ', ' + String(n.published_at).slice(0, 10) + ')\n  ' + n.url).join('\n\n') + '\n\nAll news: Founder OS → Pricing & market → News' });
        out.alerted = fresh.length;
      } catch (e) { foAppend_('Jobs', { job: 'news_alert', started: foNow_(), finished: foNow_(), status: 'failed', detail: String(e).slice(0, 300) }); }
    }
    foTouch_();
    return { result: out };
  } finally { lock.releaseLock(); }
}
