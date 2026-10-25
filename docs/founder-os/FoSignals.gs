/**
 * AP Villas Founder OS · backend part 6: Live Pricing Desk.
 * Signals store, competitor-set re-rank, hourly recompute of recommendations (both properties × 90 nights), owner price
 * decisions, the owner "Rate check" (competitor prices typed from the OTA extranets), alerts and the 07:00 brief.
 * The engine itself is FoDesk (founder/desk.js pasted as FoDesk.gs), shared with the portal and the tests.
 * Recommendations only: nothing here ever changes a price on Airbnb, Booking.com or MakeMyTrip.
 */
const FO_DESK_OWN = ['pace', 'compression_own', 'seasonality'];

// ---------------------------------------------------------------- signals import (automation key, or a manager in the portal) ----------------
function foSignalClean_(r) {
  const ids = FoDesk.SIGNALS.map(s => s.id), props = foRows_('Properties').map(p => p.property_id);
  const id = String(r.signal_id || '').trim(), fd = r.for_date ? foDate_(r.for_date) : '', src = String(r.source_url || '').trim();
  if (ids.indexOf(id) < 0 || FO_DESK_OWN.indexOf(id) >= 0) return { error: 'unknown or own-data signal: ' + id };
  if (r.for_date && !fd) return { error: 'bad for_date' };
  if (!(src === 'own_ledger' || /^https:\/\/\S+$/.test(src) || /^owner_check(:\S+)?$/.test(src))) return { error: 'source_url must be https, own_ledger or owner_check' };
  const status = r.status === 'blocked' ? 'blocked' : 'live';
  if (status !== 'blocked' && !(foHasNum_(r.index) && foNum_(r.index) >= 0.5 && foNum_(r.index) <= 2)) return { error: 'index must be between 0.5 and 2.0 (1.00 = normal)' };
  const prop = r.property && r.property !== 'all' ? (props.indexOf(r.property) >= 0 ? r.property : null) : '';
  if (prop === null) return { error: 'unknown property' };
  return { rec: { signal_id: id, property: prop, for_date: fd, raw_value: foClean_(r.raw_value, 300), index: status === 'blocked' ? '' : Math.round(foNum_(r.index) * 1000) / 1000, source_url: src.slice(0, 500),
    fetched_at: r.fetched_at && !isNaN(Date.parse(r.fetched_at)) ? new Date(Date.parse(r.fetched_at)).toISOString() : foNow_(), status, run_id: foClean_(r.run_id, 60), notes: foClean_(r.notes, 300) } };
}
function foSignalsImport_(b, actor) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const out = { added: 0, skipped: 0, rejected: 0, errors: [] }, seen = {};
    foRows_('Signals').forEach(s => { seen[[s.signal_id, s.property, s.for_date, String(s.fetched_at).slice(0, 13)].join('|')] = 1; });
    (Array.isArray(b.signals) ? b.signals.slice(0, 2000) : []).forEach(x => {
      const c = foSignalClean_(x); if (c.error) { out.rejected++; if (out.errors.length < 10) out.errors.push(c.error); return; }
      const k = [c.rec.signal_id, c.rec.property, c.rec.for_date, String(c.rec.fetched_at).slice(0, 13)].join('|'); if (seen[k]) { out.skipped++; return; }
      seen[k] = 1; c.rec.signal_row = foId_('SGN'); c.rec.imported_by = actor; foAppend_('Signals', c.rec); out.added++;
    });
    foTouch_(); return { result: out };
  } finally { lock.releaseLock(); }
}
/** Keep the Signals tab small: drop rows for nights more than 14 days past and horizon rows older than 60 days. */
function foSignalsPrune_(today) {
  const cutNight = FoMetrics.addDays(today, -14), cutAge = Date.parse(FoMetrics.addDays(today, -60) + 'T00:00:00Z');
  const rows = foRows_('Signals'), drop = rows.filter(r => (r.for_date && r.for_date < cutNight) || (!r.for_date && Date.parse(r.fetched_at) < cutAge));
  drop.sort((a, b) => b._row - a._row).forEach(r => foDeleteRow_('Signals', r._row));
  return drop.length + ' pruned';
}

// ---------------------------------------------------------------- own demand signals from GA4 and Search Console (daily) ----------------
function foDeskOwnSignals_(today) {
  const out = [], now = foNow_(), to = FoMetrics.addDays(today, -1), from = FoMetrics.addDays(to, -27), pFrom = FoMetrics.addDays(from, -28), pTo = FoMetrics.addDays(from, -1);
  const idx = (a, b) => b >= 20 ? Math.max(0.7, Math.min(1.3, a / b)) : null;
  try {
    const g = foGa4_(from, to), gp = foGa4_(pFrom, pTo);
    if (g.connected && gp.connected) { const i = idx((g.totals.sessions || 0) + 5 * (g.intent || 0), (gp.totals.sessions || 0) + 5 * (gp.intent || 0)); if (i != null) out.push({ signal_id: 'web', for_date: '', index: i, raw_value: g.totals.sessions + ' sessions, ' + g.intent + ' booking-intent actions (28 days)', source_url: 'own_ledger', fetched_at: now, notes: 'GA4 28 days vs previous 28' }); }
  } catch (e) {}
  try {
    const s = foGsc_(FoMetrics.addDays(to, -28), FoMetrics.addDays(to, -1)), sp = foGsc_(FoMetrics.addDays(to, -56), FoMetrics.addDays(to, -29));
    if (s.connected && sp.connected) { const i = idx(s.totals.impressions, sp.totals.impressions); if (i != null) out.push({ signal_id: 'search', for_date: '', index: i, raw_value: s.totals.impressions + ' Google impressions (28 days)', source_url: 'https://search.google.com/search-console', fetched_at: now, notes: 'Search Console impressions 28 days vs previous 28' }); }
  } catch (e) {}
  if (!out.length) return 'GA4/Search Console not available';
  return foSignalsImport_({ signals: out }, 'system').result.added + ' own demand signals';
}

// ---------------------------------------------------------------- comp set (weekly re-rank with stability) ----------------
function foCompRerank_(today) {
  const D = foDataLoad_(), cfg = FoDesk.settings(D), all = foRows_('CompSet'), changesOut = [];
  cfg.properties.forEach(pid => {
    const prev = all.filter(r => r.property === pid), res = FoDesk.rerank(D, pid, prev, today);
    prev.sort((a, b) => b._row - a._row).forEach(r => foDeleteRow_('CompSet', r._row));
    res.rows.forEach(r => foAppend_('CompSet', r));
    res.changes.forEach(c => { foAppend_('CompChanges', Object.assign({ change_id: foId_('CCH') }, c)); changesOut.push(c); });
  });
  foSettingSet_('desk_last_rerank', today);
  return changesOut.length + ' comp-set changes';
}

// ---------------------------------------------------------------- hourly recompute, alerts and the 07:00 brief ----------------
function foDeskHourly_() {
  const t0 = Date.now(), today = foToday_(), s = foSettings_();
  const D = foDataLoad_(); if (!D.properties.length) return 'no properties';
  const cfg = FoDesk.settings(D), runId = 'R' + Utilities.formatDate(new Date(), FO.TZ, 'yyMMddHH');
  // own demand signals (Search Console, GA4) refreshed whenever the latest is over 20 hours old
  const lastOwn = foRows_('Signals').filter(r => r.signal_id === 'search' || r.signal_id === 'web').map(r => String(r.fetched_at)).sort().pop() || '';
  if (!lastOwn || Date.now() - Date.parse(lastOwn) > 20 * 3600000) { try { foDeskOwnSignals_(today); } catch (e) { /* reported by the health check */ } }
  // comp sets re-ranked once a day (new competitors found by the bots can join; the stability rule still needs repeated wins)
  if (!foRows_('CompSet').length || s.desk_last_rerank !== today) foCompRerank_(today);
  const D2 = foDataLoad_(), cals = cfg.properties.map(pid => FoDesk.calendar(D2, pid, 90)).filter(Boolean), healthRows = FoDesk.health(D2);
  // alerts are computed BEFORE storing, against the last stored recommendations
  const alerts = FoDesk.alerts(D2, cals, healthRows);
  let stored = 0; cals.forEach(cal => { FoDesk.toStore(D2, cal, runId).forEach(r => { foAppend_('Recommendations', r); stored++; }); });
  const sent = foDeskSendAlerts_(alerts, cfg);
  const hour = Number(Utilities.formatDate(new Date(), FO.TZ, 'H'));
  let brief = 'not due';
  if (cfg.alerts.brief && hour >= 7 && s.desk_last_brief !== today) { brief = foDeskBrief_(D2, cfg, today); foSettingSet_('desk_last_brief', today); }
  return stored + ' recommendations stored, ' + sent + ' alerts, brief ' + brief + ', ' + Math.round((Date.now() - t0) / 100) / 10 + ' s';
}
function foDeskRecipient_() { return PropertiesService.getScriptProperties().getProperty('FO_FOUNDER_EMAIL') || Session.getEffectiveUser().getEmail(); }
function foDeskSendAlerts_(alerts, cfg) {
  if (!alerts.length) return 0;
  const p = PropertiesService.getScriptProperties(), sent = JSON.parse(p.getProperty('FO_DESK_ALERTS') || '{}'), now = Date.now(), fresh = alerts.filter(a => !sent[a.key]);
  Object.keys(sent).forEach(k => { if (now - sent[k] > 3 * 864e5) delete sent[k]; });
  if (!fresh.length) { p.setProperty('FO_DESK_ALERTS', JSON.stringify(sent)); return 0; }
  const allowed = fresh.filter(a => (a.type !== 'stale' || cfg.alerts.stale));
  if (allowed.length && MailApp.getRemainingDailyQuota() > 10) {
    MailApp.sendEmail({ to: foDeskRecipient_(), subject: 'AP Villas pricing alert: ' + allowed.length + ' change' + (allowed.length > 1 ? 's' : ''), name: 'AP Villas Founder OS',
      body: allowed.map(a => '• ' + a.text).join('\n') + '\n\nOpen Pricing & market: https://www.apvillasandresorts.in/founder/#/pricing/today\nRecommendations only: nothing changes on the OTAs until you set it.' });
  }
  fresh.forEach(a => { sent[a.key] = now; }); p.setProperty('FO_DESK_ALERTS', JSON.stringify(sent));
  return allowed.length;
}
function foDeskBrief_(D, cfg, today) {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const cards = cfg.properties.map(pid => FoDesk.today(D, pid)).filter(Boolean);
  const night = (label, q) => q.booked ? '<p style="margin:4px 0"><b>' + label + ':</b> booked</p>' : '<p style="margin:4px 0"><b>' + label + ': ' + inr(q.price) + ' net</b> · confidence ' + q.confidence + '/100</p>' +
    '<p style="margin:2px 0;font-size:13px">Airbnb ' + inr(q.channels.airbnb.price) + ' · Booking.com ' + inr(q.channels.booking.price) + ' · MakeMyTrip ' + inr(q.channels.makemytrip.price) + ' · Direct ' + inr(q.channels.direct.price) + '</p>' +
    '<p style="margin:2px 0;font-size:12px;color:#55605B">' + esc((q.top || []).join(' · ')) + (q.next_step ? ' · steps to ' + inr(q.next_step.price) + ' at ' + q.next_step.at : '') + '</p>';
  const html = '<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto"><h2 style="color:#0F3D2E">Price to set today · ' + esc(today) + '</h2>' +
    cards.map(c => '<div style="border:1px solid #E3E9E5;border-radius:12px;padding:12px 16px;margin:10px 0"><h3 style="margin:0 0 6px;color:#0F3D2E">' + esc(c.name) + '</h3>' + night('Tonight', c.tonight) + night('Tomorrow', c.tomorrow) + '</div>').join('') +
    '<p style="font-size:12px;color:#6B756F">Net = what AP Villas keeps after commission. Direct is the guest\'s best price. Recommendations only: nothing is changed on the OTAs. Open the desk: https://www.apvillasandresorts.in/founder/#/pricing/today</p></div>';
  if (MailApp.getRemainingDailyQuota() < 5) return 'skipped (email quota)';
  MailApp.sendEmail({ to: foDeskRecipient_(), subject: 'Price to set today · ' + today, htmlBody: html, body: cards.map(c => c.name + ': tonight ' + (c.tonight.booked ? 'booked' : inr(c.tonight.price)) + ', tomorrow ' + (c.tomorrow.booked ? 'booked' : inr(c.tomorrow.price))).join('\n'), name: 'AP Villas Founder OS' });
  return 'sent';
}

// ---------------------------------------------------------------- portal actions ----------------
function foDeskDecide_(b, user) {
  const pid = String(b.property || ''), d = foDate_(b.for_date), ch = ['airbnb', 'booking', 'makemytrip', 'direct', 'all'].indexOf(b.channel) >= 0 ? b.channel : 'all';
  if (!foRows_('Properties').some(p => p.property_id === pid)) return { ok: false, error: 'Choose a property.' };
  if (!d) return { ok: false, error: 'Choose a night.' };
  const set = foNum_(b.set_price), rec = foNum_(b.recommended), accepted = b.accepted === true || b.accepted === 'yes';
  if (!(set > 0)) return { ok: false, error: 'Enter the price you set.' };
  if (!accepted && !String(b.reason || '').trim()) return { ok: false, error: 'Add a short reason for the override (it trains the weekly report).' };
  const row = { decision_id: foId_('DEC'), decided_at: foNow_(), decided_by: user.email, property: pid, for_date: d, channel: ch, recommended: rec || '', set_price: set, accepted: accepted ? 'yes' : 'no', reason: foClean_(b.reason, 300), slot: foClean_(b.slot, 4) };
  foAppend_('PriceDecisions', row); foAudit_(user.email, 'price_decision', pid + ' ' + d + ' ' + set, 'ok');
  return { decision: row };
}
/** Owner "Rate check": competitor prices read from the OTA extranets (or a listing page) for one night. */
function foRateCheckSave_(b, user) {
  const pid = String(b.property || ''), d = foDate_(b.stay_date);
  if (!foRows_('Properties').some(p => p.property_id === pid)) return { ok: false, error: 'Choose a property.' };
  if (!d) return { ok: false, error: 'Choose the night.' };
  const g = (FoDesk.settings(foDataLoad_()).group || {})[pid] || {}, rates = (Array.isArray(b.entries) ? b.entries : []).slice(0, 40).filter(e => e && e.competitor && (foNum_(e.price) > 0 || e.sold_out)).map(e => ({
    competitor: e.competitor, observed_at: foToday_(), stay_date: d, nights: 1, price_per_night: e.sold_out ? '' : foNum_(e.price), price_total: e.sold_out ? '' : foNum_(e.price),
    availability: e.sold_out ? 'sold out' : 'available', taxes_included: e.tax || 'unknown', source_type: /^https:/.test(e.url || '') ? 'website' : 'manual',
    source_url: /^https:\/\//.test(e.url || '') ? e.url : 'owner_check:' + String(e.platform || 'extranet').toLowerCase().replace(/[^a-z.]/g, ''), confidence: 'high', group_size: g.adults || '', target_property: pid, platform: foClean_(e.platform, 30), notes: 'Rate check by ' + user.email }));
  if (!rates.length) return { ok: false, error: 'Enter at least one price or mark a competitor sold out.' };
  // sold-out rows have no price: store them directly (the market importer requires a price)
  const priced = rates.filter(r => foNum_(r.price_per_night) > 0), sold = rates.filter(r => !(foNum_(r.price_per_night) > 0));
  const res = priced.length ? foMarketImport_({ rates: priced }, user.email).result : { rates: 0, skipped: 0, rejected: 0 };
  sold.forEach(r => { foAppend_('MarketRates', Object.assign({ obs_id: foId_('OBS'), collected_by: user.email, created_at: foNow_() }, r)); });
  foTouch_();
  return { result: { prices: res.rates, sold_out: sold.length, skipped: res.skipped, rejected: res.rejected } };
}
function foDeskSettingsSave_(b, user) {
  const s = b.desk || {}, out = {}, num = (v, lo, hi) => foHasNum_(v) ? Math.max(lo, Math.min(hi, foNum_(v))) : undefined;
  ['floor_pct', 'ceiling_pct', 'mega_ceiling_pct', 'max_daily_change', 'market_weight', 'market_commission', 'direct_discount'].forEach(k => { const v = num(s[k], 0, k.indexOf('ceiling') >= 0 ? 10 : 1); if (v !== undefined) out[k] = v; });
  if ('use_own_history' in s) out.use_own_history = s.use_own_history === true || s.use_own_history === 'yes';
  if (foHasNum_(s.round)) out.round = [10, 50, 100, 500].indexOf(foNum_(s.round)) >= 0 ? foNum_(s.round) : 100;
  ['commission', 'positioning', 'weights', 'lead'].forEach(k => { if (s[k] && typeof s[k] === 'object') { out[k] = {}; Object.keys(s[k]).slice(0, 40).forEach(x => { const v = num(s[k][x], k === 'positioning' || k === 'lead' ? -0.5 : 0, k === 'weights' ? 3 : 0.5); if (v !== undefined) out[k][String(x).slice(0, 30)] = v; }); } });
  if (s.slots && typeof s.slots === 'object') { out.slots = {}; ['tonight', 'tomorrow', 'high'].forEach(k => { if (s.slots[k]) { out.slots[k] = {}; ['S1', 'S2', 'S3', 'S4'].forEach(x => { const v = num(s.slots[k][x], -0.4, 0.4); if (v !== undefined) out.slots[k][x] = v; }); } }); }
  if (s.alerts && typeof s.alerts === 'object') { out.alerts = {}; ['brief', 'stale', 'jobs', 'events'].forEach(k => { if (k in s.alerts) out.alerts[k] = !!s.alerts[k]; }); ['rec_move', 'market_move', 'sellout'].forEach(k => { const v = num(s.alerts[k], 0.01, 1); if (v !== undefined) out.alerts[k] = v; }); }
  if (s.comp && typeof s.comp === 'object') { out.comp = {}; ['pinned', 'excluded'].forEach(k => { if (Array.isArray(s.comp[k])) out.comp[k] = s.comp[k].slice(0, 30).map(x => foClean_(x, 120)); }); if (s.comp.weights) { out.comp.weights = {}; ['size', 'whole', 'distance', 'price', 'rating', 'amenities'].forEach(k => { const v = num(s.comp.weights[k], 0, 60); if (v !== undefined) out.comp.weights[k] = v; }); } }
  foSettingSet_('desk', JSON.stringify(out));
  foAudit_(user.email, 'desk_settings', JSON.stringify(out).slice(0, 600), 'ok');
  return { desk: out };
}
/** Server-side views (the portal computes the same with FoDesk in the browser). */
function foDeskView_(b, user, kind) {
  const D = foDataLoad_(), cfg = FoDesk.settings(D), pid = cfg.properties.indexOf(b.property) >= 0 ? b.property : cfg.properties[0];
  if (kind === 'today') return { cards: cfg.properties.map(p => FoDesk.today(D, p)) };
  if (kind === 'calendar') return { calendar: FoDesk.calendar(D, pid, Math.min(120, foNum_(b.nights) || 90)) };
  if (kind === 'date') { const d = foDate_(b.date); if (!d) return { ok: false, error: 'Choose a night.' }; return { quote: FoDesk.quote(D, FoDesk.ctxFor(D, pid), d) }; }
  if (kind === 'comp') return { comp_set: FoDesk.compSet(D, pid) };
  if (kind === 'changes') return { changes: (D.comp_changes || []).slice(-200) };
  if (kind === 'health') return { health: FoDesk.health(D) };
  return { ok: false, error: 'Unknown view.' };
}
