/**
 * AP Villas Founder OS · backend part 3 (phases 5–10): saved charts & dashboards, expenses & budgets, events, decision log,
 * settings, scheduled reports + snapshots, and Google Analytics 4 reporting (server-side, Data API).
 * Uses FoInsights (founder/insights.js pasted as FoInsightsLib.gs) and FoMetrics for every figure, so reports match the portal.
 * Scheduled work runs inside foHourly (already an hourly trigger), once a day after 07:00 IST: no extra trigger or permission.
 */
const FO_SETTINGS_DEFAULTS = { report_email: '', ga4_property: '558430227', ga4_host: 'www.apvillasandresorts.in' };
const FO_LIMITS = { charts: 200, dashboards: 50, text: 2000 };

// ---------------------------------------------------------------- settings ----------------
function foSettings_() {
  const o = Object.assign({}, FO_SETTINGS_DEFAULTS);
  foRows_('Settings').forEach(r => { o[r.key] = r.value; });
  return o;
}
function foSettingSet_(key, value) {
  const row = foRows_('Settings').find(r => r.key === key), rec = { key, value: String(value == null ? '' : value).slice(0, 500), updated_at: foNow_() };
  if (row) foUpdate_('Settings', row._row, rec); else foAppend_('Settings', rec);
}
function foSettingsSave_(b, user) {
  const allowed = { report_email: v => String(v).split(',').map(s => s.trim()).filter(s => FoInsights.REPORT_TYPES[s]).join(','), ga4_property: v => String(v).replace(/\D/g, '').slice(0, 15), ga4_host: v => String(v).replace(/[^a-z0-9.-]/gi, '').slice(0, 80) };
  const changed = {};
  Object.keys(b.settings || {}).forEach(k => { if (allowed[k]) { const v = allowed[k](b.settings[k]); foSettingSet_(k, v); changed[k] = v; } });
  foAudit_(user.email, 'settings', JSON.stringify(changed), 'ok');
  return { settings: foSettings_() };
}

// ---------------------------------------------------------------- generic small-record CRUD ----------------
function foClean_(v, max) { return String(v == null ? '' : v).slice(0, max || FO_LIMITS.text); }
function foUpsert_(tab, idKey, prefix, rec, user, validate) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const err = validate ? validate(rec) : null; if (err) return { ok: false, error: err };
    const rows = foRows_(tab), existing = rec[idKey] ? rows.find(r => r[idKey] === rec[idKey]) : null;
    if (rec[idKey] && !existing) return { ok: false, error: 'Not found.' };
    const out = Object.assign({}, existing || {}, rec, { updated_at: foNow_(), updated_by: user.email });
    if (!existing) { out[idKey] = foId_(prefix); out.created_at = foNow_(); foAppend_(tab, out); } else foUpdate_(tab, existing._row, out);
    foAudit_(user.email, tab.toLowerCase() + (existing ? '_edit' : '_add'), out[idKey], 'ok');
    delete out._row; return { record: out };
  } finally { lock.releaseLock(); }
}
function foDelete_(tab, idKey, id, user) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const row = foRows_(tab).find(r => r[idKey] === id); if (!row) return { ok: false, error: 'Not found.' };
    foDeleteRow_(tab, row._row); foAudit_(user.email, tab.toLowerCase() + '_delete', id, 'ok'); return {};
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- analytics studio ----------------
const FO_CHART_TYPES = ['line', 'bar', 'stacked', 'donut', 'hbar', 'table'];
const FO_CHART_METRICS = ['revenue', 'occupancy', 'adr', 'revpar', 'bookings', 'booking_value', 'cancellations', 'cancellation_rate', 'cash', 'channel_mix', 'villa_revenue', 'villa_occupancy', 'lead_time', 'length_of_stay', 'forward_occupancy', 'expenses'];
function foChartSave_(b, user) {
  const c = b.chart || {};
  if (!c.chart_id && foRows_('Charts').length >= FO_LIMITS.charts) return { ok: false, error: 'Chart library is full (200).' };
  const rec = {
    chart_id: c.chart_id || '', title: foClean_(c.title, 120) || 'Untitled chart', metric: String(c.metric || ''), chart_type: String(c.chart_type || 'line'),
    date_dimension: c.date_dimension === 'booking' ? 'booking' : 'stay', grain: ['day', 'week', 'month', 'quarter', 'year'].indexOf(c.grain) >= 0 ? c.grain : 'month',
    range: foClean_(c.range, 20) || 'last12m', filters: JSON.stringify(c.filters || {}).slice(0, 1000), comparison: ['none', 'previous', 'last_year'].indexOf(c.comparison) >= 0 ? c.comparison : 'none',
    dataset: 'ledger', refresh_policy: ['live', 'daily', 'weekly', 'monthly'].indexOf(c.refresh_policy) >= 0 ? c.refresh_policy : 'daily', pinned: c.pinned ? 'yes' : '',
  };
  return foUpsert_('Charts', 'chart_id', 'CH', rec, user, r => FO_CHART_METRICS.indexOf(r.metric) < 0 ? 'Unknown metric.' : FO_CHART_TYPES.indexOf(r.chart_type) < 0 ? 'Unknown chart type.' : null);
}
function foDashboardSave_(b, user) {
  const d = b.dashboard || {}, ids = (Array.isArray(d.charts) ? d.charts : []).map(String).slice(0, 24);
  if (!d.dashboard_id && foRows_('Dashboards').length >= FO_LIMITS.dashboards) return { ok: false, error: 'Too many dashboards.' };
  return foUpsert_('Dashboards', 'dashboard_id', 'DB', { dashboard_id: d.dashboard_id || '', name: foClean_(d.name, 80) || 'My dashboard', charts: JSON.stringify(ids), filters: JSON.stringify(d.filters || {}).slice(0, 1000) }, user);
}

// ---------------------------------------------------------------- financial data ----------------
function foExpenseSave_(b, user) {
  const e = b.expense || {}, cats = FoInsights.EXPENSE_CATEGORIES.map(c => c[0]);
  const rec = { expense_id: e.expense_id || '', date: foDate_(e.date), property_id: String(e.property_id || 'all'), category: String(e.category || ''), amount: foNum_(e.amount), vendor: foClean_(e.vendor, 80), basis: e.basis === 'estimate' ? 'estimate' : 'actual', note: foClean_(e.note, 300) };
  return foUpsert_('Expenses', 'expense_id', 'EXP', rec, user, r => !r.date ? 'Choose a date.' : cats.indexOf(r.category) < 0 ? 'Choose a category.' : !(r.amount > 0) ? 'Enter an amount above zero.' :
    (r.property_id !== 'all' && !foRows_('Properties').some(p => p.property_id === r.property_id)) ? 'Unknown villa.' : null);
}
function foBudgetSave_(b, user) {
  const x = b.budget || {}, cats = FoInsights.EXPENSE_CATEGORIES.map(c => c[0]).concat(['revenue']);
  const rec = { budget_id: x.budget_id || '', month: String(x.month || '').slice(0, 7), property_id: String(x.property_id || 'all'), category: String(x.category || ''), amount: foNum_(x.amount), note: foClean_(x.note, 200) };
  return foUpsert_('Budgets', 'budget_id', 'BUD', rec, user, r => !/^\d{4}-\d{2}$/.test(r.month) ? 'Choose a month.' : cats.indexOf(r.category) < 0 ? 'Choose a category.' : !(r.amount >= 0) ? 'Enter an amount.' : null);
}

// ---------------------------------------------------------------- events & decisions ----------------
function foEventSave_(b, user) {
  const e = b.event || {};
  const rec = { event_id: e.event_id || '', name: foClean_(e.name, 100), start: foDate_(e.start), end: foDate_(e.end), kind: ['festival', 'holiday', 'mega', 'custom'].indexOf(e.kind) >= 0 ? e.kind : 'custom', confidence: 'founder', source: foClean_(e.source, 200) };
  return foUpsert_('Events', 'event_id', 'EV', rec, user, r => !r.name ? 'Name the event.' : !r.start || !r.end || r.end < r.start ? 'Check the dates.' : null);
}
function foDecisionSave_(b, user) {
  const d = b.decision || {}, st = ['accepted', 'rejected', 'deferred', 'implemented'];
  const rec = { decision_id: d.decision_id || '', rec_key: foClean_(d.rec_key, 80), title: foClean_(d.title, 200), status: st.indexOf(d.status) >= 0 ? d.status : 'deferred', note: foClean_(d.note, 1000),
    follow_up_metric: foClean_(d.follow_up_metric, 120), baseline: foClean_(d.baseline, 80), review_date: foDate_(d.review_date), outcome: foClean_(d.outcome, 1000), decided_at: d.decided_at || foToday_(), decided_by: user.email };
  return foUpsert_('Decisions', 'decision_id', 'DEC', rec, user, r => !r.title ? 'Missing title.' : null);
}

// ---------------------------------------------------------------- data for the portal ----------------
function foInsightsData_() {
  const strip = r => { delete r._row; return r; };
  return {
    charts: foRows_('Charts').map(strip), dashboards: foRows_('Dashboards').map(strip), expenses: foRows_('Expenses').map(strip), budgets: foRows_('Budgets').map(strip),
    events: foRows_('Events').map(strip), decisions: foRows_('Decisions').map(strip), settings: foSettings_(),
    reports: foRows_('Reports').slice(-200).map(strip), snapshots: foRows_('Snapshots').slice(-400).map(strip), jobs: foRows_('Jobs').slice(-30).map(strip),
  };
}
/** Same shape as the portal's data, for scheduled jobs. */
function foLedger_() {
  const d = foDataLoad_();
  d.exceptions = foRows_('Exceptions').map(r => { delete r._row; return r; });
  return d;
}

// ---------------------------------------------------------------- scheduled jobs (inside foHourly) ----------------
function foJob_(job, fn) {
  const started = foNow_();
  try { const detail = fn(); foAppend_('Jobs', { job, started, finished: foNow_(), status: 'ok', detail: String(detail || '').slice(0, 900) }); return true; }
  catch (e) { foAppend_('Jobs', { job, started, finished: foNow_(), status: 'failed', detail: String(e && e.message || e).slice(0, 900) }); foAudit_('system', 'job_failed', job + ': ' + String(e && e.message || e).slice(0, 200), 'error'); return false; }
}
/** Runs the daily work once per IST day after 07:00. Failed steps are retried on the next hourly run. */
function foDailyIfDue_() {
  const hour = Number(Utilities.formatDate(new Date(), FO.TZ, 'H')), today = foToday_();
  if (hour < 7 || foSettings_().last_daily === today) return 'not due';
  // One run at a time (an hourly trigger and a manual run must never both generate today's reports), but the script lock is
  // held only for a moment: the slow part (reports, PDFs) runs under a "running" flag so the founder's saves are never blocked.
  const p = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return 'busy';
  try {
    FO_MEMO.rows = {}; FO_MEMO.last = {};   // re-read inside the lock
    if (foSettings_().last_daily === today) return 'not due';
    const running = Number(p.getProperty('FO_DAILY_RUN') || 0);
    if (running && Date.now() - running < 15 * 60000) return 'busy';
    p.setProperty('FO_DAILY_RUN', String(Date.now()));
  } finally { lock.releaseLock(); }
  try {
    let ok = foJob_('snapshot', () => foSnapshot_(today));
    ok = foJob_('reports', () => foRunDueReports_(today)) && ok;
    ok = foJob_('chart_refresh', () => foRefreshCharts_(today)) && ok;
    if (ok) foSettingSet_('last_daily', today);
    return ok ? 'done' : 'retry later';
  } finally { p.deleteProperty('FO_DAILY_RUN'); }
}
function foSnapshot_(today) {
  if (foRows_('Snapshots').some(s => s.date === today)) return 'exists';
  const D = foLedger_(), out = {};
  [7, 30, 60, 90].forEach(n => { const m = FoMetrics.compute(D, today, FoMetrics.addDays(today, n - 1)); out['otb_' + n] = { nights: m.occupied_nights, available: m.available_nights, revenue: Math.round(m.net_accommodation_revenue) }; });
  const ytd = FoMetrics.range('ytd', today), y = FoMetrics.compute(D, ytd.from, ytd.to);
  out.ytd = { gbv: y.gross_booking_value, revenue: Math.round(y.net_accommodation_revenue), bookings: y.bookings_made, cash: y.cash_collected };
  out.receivables = Math.round(y.outstanding_receivables);
  foAppend_('Snapshots', { date: today, created_at: foNow_(), metrics: JSON.stringify(out) });
  return 'saved';
}
function foRefreshCharts_(today) {
  const dow = new Date(today + 'T00:00:00Z').getUTCDay(), dom = Number(today.slice(8, 10)); let n = 0;
  foRows_('Charts').forEach(c => {
    if (c.refresh_policy === 'daily' || c.refresh_policy === 'live' || (c.refresh_policy === 'weekly' && dow === 1) || (c.refresh_policy === 'monthly' && dom === 1)) {
      c.last_refresh = foNow_(); c.refresh_status = 'ok · data as of ' + (PropertiesService.getScriptProperties().getProperty('FO_LAST_SYNC') || 'unknown'); foUpdate_('Charts', c._row, c); n++;
    }
  });
  return n + ' charts marked fresh';
}
function foReportsFolder_() {
  const p = PropertiesService.getScriptProperties(); let id = p.getProperty('FO_REPORTS_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder('AP Villas Founder OS Reports'); p.setProperty('FO_REPORTS_FOLDER', f.getId()); return f;
}
/** Generates every report that is due today and not already generated (idempotent per type + period). */
function foRunDueReports_(today) {
  const done = [];
  Object.keys(FoInsights.REPORT_TYPES).forEach(type => { if (FoInsights.reportDue(type, today)) done.push(type + ':' + foGenerateReport_(type, FoInsights.reportPeriod(type, today), 'schedule').status); });
  return done.join(', ') || 'none due';
}
function foGenerateReport_(type, period, actor, force) {
  const existing = foRows_('Reports').find(r => r.type === type && r.period_key === period.key && r.status === 'ok');
  if (existing && !force) return { status: 'exists', report: existing };
  const D = foLedger_(), extra = { events: D.events, lastSync: PropertiesService.getScriptProperties().getProperty('FO_LAST_SYNC') || '', generated_at: foNow_() };
  try { const ga = foGa4_(period.from, period.to); if (ga.connected) extra.ga = ga; } catch (e) {}
  const rep = FoInsights.buildReport(type, D, period, extra), html = FoInsights.reportHtml(rep);
  const name = 'AP Villas ' + rep.title + ' ' + period.key;
  const folder = foReportsFolder_();
  const htmlFile = folder.createFile(Utilities.newBlob(html, 'text/html', name + '.html'));
  let pdfId = '';
  try { pdfId = folder.createFile(Utilities.newBlob(html, 'text/html', name + '.html').getAs('application/pdf').setName(name + '.pdf')).getId(); } catch (e) {}
  const rec = { report_id: foId_('REP'), type, period_key: period.key, from: period.from, to: period.to, generated_at: extra.generated_at, data_freshness: extra.lastSync, status: 'ok', html_id: htmlFile.getId(), pdf_id: pdfId, emailed: '', actor };
  const wanted = String(foSettings_().report_email || '').split(',').indexOf(type) >= 0;
  if (wanted && actor === 'schedule') {
    const to = PropertiesService.getScriptProperties().getProperty('FO_FOUNDER_EMAIL');
    if (to && MailApp.getRemainingDailyQuota() > 15) {
      MailApp.sendEmail({ to, subject: rep.title + ' · ' + period.key, htmlBody: html, name: 'AP Villas Founder OS', attachments: pdfId ? [DriveApp.getFileById(pdfId).getBlob()] : [] });
      rec.emailed = foNow_();
    }
  }
  foAppend_('Reports', rec);
  return { status: 'ok', report: rec };
}
function foReportRun_(b, user) {
  const type = FoInsights.REPORT_TYPES[b.type] ? b.type : null; if (!type) return { ok: false, error: 'Unknown report type.' };
  const period = b.from && b.to ? { from: foDate_(b.from), to: foDate_(b.to), key: foDate_(b.from) + '_' + foDate_(b.to) } : FoInsights.reportPeriod(type, foToday_());
  if (!period.from || !period.to || period.to < period.from) return { ok: false, error: 'Check the dates.' };
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try { const r = foGenerateReport_(type, period, user.email, !!b.force); foAudit_(user.email, 'report', type + ' ' + period.key + ' ' + r.status, 'ok'); const rec = Object.assign({}, r.report); delete rec._row; return { status: r.status, report: rec }; }
  finally { lock.releaseLock(); }
}
function foReportGet_(b) {
  const r = foRows_('Reports').find(x => x.report_id === b.report_id); if (!r) return { ok: false, error: 'Not found.' };
  return { html: DriveApp.getFileById(r.html_id).getBlob().getDataAsString(), pdf_url: r.pdf_id ? 'https://drive.google.com/file/d/' + r.pdf_id + '/view' : '' };
}

// ---------------------------------------------------------------- Google Analytics 4 (Data API, server side; no credentials in the browser) ----------------
/**
 * Needs the "Google Analytics Data API" advanced service enabled in this Apps Script project and the owner's one-time
 * read-only Analytics permission. Until then it reports connected:false with the reason (never fake numbers).
 * Only traffic on the live hostname is counted, so local tests and previews never pollute the figures.
 */
function foGa4_(from, to) {
  if (typeof AnalyticsData === 'undefined') return { connected: false, reason: 'The Google Analytics Data API service is not enabled in the Apps Script project yet.' };
  const s = foSettings_(), prop = 'properties/' + s.ga4_property, cacheKey = 'FO_GA_' + s.ga4_property + '_' + from + '_' + to;
  const hit = foCacheGet_(cacheKey); if (hit) return hit;
  const host = { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: s.ga4_host } } };
  const req = (dims, mets, filter, limit) => {
    const r = { dateRanges: [{ startDate: from, endDate: to }], dimensions: dims.map(n => ({ name: n })), metrics: mets.map(n => ({ name: n })), dimensionFilter: filter || host, limit: limit || 100 };
    if (mets.indexOf('sessions') >= 0) r.orderBys = [{ metric: { metricName: 'sessions' }, desc: true }];
    return r;
  };
  const parse = (q, rep) => (rep && rep.rows || []).map(row => { const o = {}; q.dimensions.forEach((d, i) => { o[d.name] = row.dimensionValues[i].value; }); q.metrics.forEach((m, i) => { o[m.name] = Number(row.metricValues[i].value); }); return o; });
  /** Up to 5 reports per call (GA4 batch limit) instead of one round trip each. */
  const batch = qs => { const out = AnalyticsData.Properties.batchRunReports({ requests: qs }, prop); return qs.map((q, i) => parse(q, (out.reports || [])[i])); };
  const and = f2 => ({ andGroup: { expressions: [host, f2] } });
  try {
    const A = [req([], ['activeUsers', 'totalUsers', 'sessions', 'engagedSessions', 'engagementRate', 'keyEvents', 'screenPageViews']), req(['date'], ['activeUsers', 'sessions', 'engagedSessions'], null, 400),
      req(['landingPage'], ['sessions', 'engagedSessions', 'keyEvents'], null, 25), req(['sessionSourceMedium'], ['sessions', 'engagedSessions', 'keyEvents'], null, 25), req(['sessionDefaultChannelGroup'], ['sessions', 'engagedSessions', 'keyEvents'], null, 20)];
    const B = [req(['deviceCategory'], ['sessions', 'engagedSessions'], null, 10), req(['eventName'], ['eventCount', 'totalUsers'], null, 100),
      req(['pagePath'], ['screenPageViews', 'totalUsers'], and({ filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/villas' } } }), 30)];
    const ra = batch(A), rb = batch(B);
    const totals = ra[0][0] || {};
    const daily = ra[1].map(r => ({ date: r.date.slice(0, 4) + '-' + r.date.slice(4, 6) + '-' + r.date.slice(6), activeUsers: r.activeUsers, sessions: r.sessions, engagedSessions: r.engagedSessions })).sort((a, b) => a.date < b.date ? -1 : 1);
    const landing = ra[2], sources = ra[3], channels = ra[4], devices = rb[0], events = rb[1], villaViews = rb[2];
    let purchases = [];
    if ((events.find(e => e.eventName === 'purchase') || {}).eventCount) {   // only ask when purchases exist (saves a round trip)
      try { purchases = batch([req(['transactionId'], ['eventCount', 'purchaseRevenue'], and({ filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'purchase' } } }), 100)])[0]; } catch (e) {}
    }
    const ev = n => (events.find(e => e.eventName === n) || {}).eventCount || 0;
    const out = { connected: true, property: s.ga4_property, host: s.ga4_host, from, to, fetched_at: foNow_(), totals, daily, landing, sources, channels, devices, events, villa_views: villaViews, purchases,
      funnel: [['Sessions (landing)', totals.sessions || 0], ['Villa page views', villaViews.reduce((a, r) => a + r.screenPageViews, 0)], ['Enquiry form opened', ev('enquiry_sheet_open')], ['Enquiry submitted', ev('enquiry_form_submit')], ['WhatsApp / call clicks', ev('whatsapp_click') + ev('phone_click')], ['Purchase events', ev('purchase')]],
      intent: ev('enquiry_form_submit') + ev('whatsapp_click') + ev('phone_click') };
    foCachePut_(cacheKey, out, 1800);   // chunked, so long reports are never cut off; 30 minutes
    return out;
  } catch (e) {
    const msg = String(e && e.message || e);
    foAudit_('system', 'ga4_error', msg.slice(0, 300), 'error');
    return { connected: false, reason: /permission|PERMISSION|403/.test(msg) ? 'Google refused access: the Apps Script account needs read access to the GA4 property, and the Analytics permission must be approved.' : 'GA4 request failed: ' + msg.slice(0, 160) };
  }
}
function foGa4Api_(b) {
  const from = foDate_(b.from), to = foDate_(b.to);
  if (!from || !to || to < from) return { ok: false, error: 'Check the dates.' };
  return { ga: foGa4_(from, to) };
}
