/**
 * AP Villas Founder OS · backend part 1: configuration, data store, security (passphrase + email OTP), sessions, audit, API router.
 * Lives as extra files in the same Apps Script project as the e-check-in (it reuses that project's permissions,
 * web app URL and the Sheet). Website front end: /founder/ (www.apvillasandresorts.in/founder/).
 * Every function and constant here starts with "fo" / "FO" so nothing clashes with Code.gs or BlogMailer.gs.
 * Setup + operations guide: docs/founder-os/README.md (this folder is not deployed to the website).
 *
 * Secrets never live in this file (the repo is public). Script Properties hold them:
 *   FO_FOUNDER_EMAIL  the founder's login email (set once in Project Settings → Script properties)
 *   FO_PEPPER         random key for OTP / passphrase / session digests (created by foSetup)
 *   FO_DATA_ID        the private "AP Villas Founder OS — Data" spreadsheet (created by foSetup)
 */
const FO = {
  DATA_NAME: 'AP Villas Founder OS — Data',
  TZ: 'Asia/Kolkata',
  OTP_TTL_S: 300,            // code valid for 5 minutes
  OTP_MAX_TRIES: 5,          // wrong codes before the challenge is destroyed
  OTP_RESEND_GAP_S: 60,      // resend cooldown
  OTP_SENDS_PER_HOUR: 6,     // emails per hour, all challenges together
  PASS_FAILS_PER_HOUR: 8,    // wrong passphrases per hour before sign-in pauses (and the founder is told)
  PASS_MIN: 12,
  PASS_ROUNDS: 1500,         // PBKDF2-HMAC-SHA256 iterations (plus a server-side pepper)
  SESSION_IDLE_MIN: 30,      // sign out after 30 minutes without activity
  SESSION_MAX_H: 12,         // and always after 12 hours
  SESSION_ROTATE_MIN: 15,    // a fresh token is issued every 15 minutes of use
  ROLES: { founder: 3, manager: 2, viewer: 1 },
};

// Tab name → columns. Every tab is plain text (dates as YYYY-MM-DD, times as ISO strings) so Sheets never reformats values.
const FO_TABS = {
  Users: ['email', 'name', 'role', 'status', 'pass_salt', 'pass_hash', 'pass_set_at', 'created_at'],
  Audit: ['ts', 'actor', 'action', 'detail', 'result'],
  Properties: ['property_id', 'name', 'unit_type', 'units', 'bedrooms', 'sleeps', 'from_rate', 'active', 'notes'],
  Channels: ['channel', 'kind', 'commission_pct', 'payment_fee_pct', 'notes'],
  Guests: ['guest_id', 'name', 'phone', 'email', 'city', 'state', 'first_seen', 'notes'],
  Bookings: ['booking_id', 'external_id', 'channel', 'source_account', 'property_id', 'guest_id', 'guest_name',
    'created_at', 'created_basis', 'checkin', 'checkout', 'nights', 'adults', 'children', 'status',
    'gross_amount', 'discount', 'taxes', 'commission', 'commission_basis', 'retained_amount',
    'acquisition_source', 'payment_channel', 'comms_channel', 'origin', 'origin_ref', 'source_hash',
    'synced_at', 'updated_at', 'updated_by', 'version', 'notes'],
  Payments: ['payment_id', 'booking_id', 'date', 'type', 'amount', 'method', 'reference', 'origin', 'origin_ref', 'created_at', 'created_by'],
  History: ['ts', 'booking_id', 'actor', 'action', 'detail'],
  Exceptions: ['exception_id', 'type', 'severity', 'booking_id', 'origin_ref', 'detail', 'data', 'status', 'created_at', 'resolved_at', 'resolved_by', 'resolution'],
  Imports: ['import_id', 'ts', 'source', 'file', 'rows', 'created', 'matched', 'unchanged', 'exceptions', 'failed', 'actor', 'status', 'note'],
  Blocks: ['block_id', 'property_id', 'start', 'end', 'reason', 'created_at', 'created_by'],
  Expenses: ['expense_id', 'date', 'property_id', 'category', 'amount', 'vendor', 'basis', 'note', 'created_at', 'updated_at', 'updated_by'],
  // phases 5–10 (FoInsights.gs)
  Budgets: ['budget_id', 'month', 'property_id', 'category', 'amount', 'note', 'created_at', 'updated_at', 'updated_by'],
  Charts: ['chart_id', 'title', 'metric', 'chart_type', 'date_dimension', 'grain', 'range', 'filters', 'comparison', 'dataset', 'refresh_policy', 'pinned', 'created_at', 'updated_at', 'updated_by', 'last_refresh', 'refresh_status'],
  Dashboards: ['dashboard_id', 'name', 'charts', 'filters', 'created_at', 'updated_at', 'updated_by'],
  Reports: ['report_id', 'type', 'period_key', 'from', 'to', 'generated_at', 'data_freshness', 'status', 'html_id', 'pdf_id', 'emailed', 'actor'],
  Snapshots: ['date', 'created_at', 'metrics'],
  Events: ['event_id', 'name', 'start', 'end', 'kind', 'confidence', 'source', 'created_at', 'updated_at', 'updated_by'],
  Decisions: ['decision_id', 'rec_key', 'title', 'status', 'note', 'follow_up_metric', 'baseline', 'review_date', 'outcome', 'decided_at', 'decided_by', 'created_at', 'updated_at', 'updated_by'],
  Settings: ['key', 'value', 'updated_at'],
  // market intelligence + pricing (FoMarket.gs)
  Competitors: ['competitor_id', 'name', 'type', 'area', 'distance_km', 'bedrooms', 'sleeps', 'segment', 'website', 'listing_urls', 'positioning', 'amenities', 'review_themes', 'notes', 'last_checked', 'source_url', 'created_at', 'updated_at', 'updated_by'],
  MarketRates: ['obs_id', 'competitor', 'observed_at', 'stay_date', 'nights', 'unit_type', 'bedrooms', 'sleeps', 'price_total', 'price_per_night', 'taxes_included', 'source_type', 'source_url', 'confidence', 'notes', 'collected_by', 'created_at', 'availability', 'group_size', 'target_property', 'platform'],
  DemandSignals: ['signal_id', 'date', 'source', 'metric', 'keyword', 'value', 'period', 'growth_pct', 'source_url', 'notes', 'collected_by', 'created_at'],
  // SEO & marketing (FoSearch.gs)
  SeoKeywords: ['keyword_id', 'keyword', 'target_page', 'notes', 'status', 'created_at', 'updated_at', 'updated_by'],
  SeoRanks: ['date', 'keyword', 'clicks', 'impressions', 'ctr', 'position', 'period', 'created_at'],
  SeoTopics: ['topic_id', 'title', 'keyword', 'intent', 'priority', 'notes', 'status', 'source', 'requested_by', 'slug', 'started_at', 'created_at', 'updated_at', 'updated_by'],
  // Live Pricing Desk (FoSignals.gs + FoDesk.gs)
  Signals: ['signal_row', 'signal_id', 'property', 'for_date', 'raw_value', 'index', 'source_url', 'fetched_at', 'status', 'run_id', 'notes', 'imported_by'],
  CompSet: ['property', 'key', 'name', 'competitor_id', 'platforms', 'score', 'hotel', 'why', 'in_set', 'since', 'challenger_weeks', 'pinned', 'updated_at'],
  CompChanges: ['change_id', 'date', 'property', 'action', 'key', 'name', 'score', 'reason'],
  Recommendations: ['rec_id', 'computed_at', 'property', 'for_date', 'price', 'low', 'high', 'confidence', 'channels', 'factors', 'inputs', 'run_id'],
  PriceDecisions: ['decision_id', 'decided_at', 'decided_by', 'property', 'for_date', 'channel', 'recommended', 'set_price', 'accepted', 'reason', 'slot'],
  BotRuns: ['run_id', 'at', 'bot', 'platform', 'mode', 'pages', 'prices', 'sold_out', 'discovered', 'blocked', 'status', 'note'],
  Campaigns: ['campaign_id', 'name', 'channel', 'utm_campaign', 'utm_source', 'utm_medium', 'landing_url', 'start', 'end', 'budget', 'spent', 'notes', 'status', 'created_at', 'updated_at', 'updated_by'],
  Jobs: ['job', 'started', 'finished', 'status', 'detail'],
};

// ---------------------------------------------------------------- setup (run once from the editor) ----------------
/** Creates the private data spreadsheet, the founder user and the hourly sync. Safe to re-run. */
function foSetup() {
  const p = PropertiesService.getScriptProperties();
  const email = String(p.getProperty('FO_FOUNDER_EMAIL') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set the script property FO_FOUNDER_EMAIL first (Project Settings → Script properties).');
  if (!p.getProperty('FO_PEPPER')) p.setProperty('FO_PEPPER', foRandom_() + foRandom_());
  let id = p.getProperty('FO_DATA_ID');
  if (!id) { id = SpreadsheetApp.create(FO.DATA_NAME).getId(); p.setProperty('FO_DATA_ID', id); }
  Object.keys(FO_TABS).forEach(foTab_);
  const ss = foSS_(), first = ss.getSheetByName('Sheet1'); if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
  if (!foRows_('Users').some(u => u.email === email)) foAppend_('Users', { email, name: 'Apoorv Singh', role: 'founder', status: 'active', created_at: foNow_() });
  foSeedReference_();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'foHourly').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('foHourly').timeBased().everyHours(1).create();
  const r = foSyncCheckins_('setup'); foFlush_();
  foAudit_('system', 'setup', 'Founder OS ready; e-check-in sync: ' + JSON.stringify(r), 'ok');
  Logger.log('Founder OS ready. Data sheet: ' + ss.getUrl() + ' · sync: ' + JSON.stringify(r));
}
/** Hourly: pull new e-check-ins into the booking ledger and re-check reconciliation. Runs without anyone signed in. */
function foHourly() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return;
  try { foSyncCheckins_('schedule'); foFlush_(); } finally { lock.releaseLock(); }
  if (typeof foDailyIfDue_ === 'function') { foDailyIfDue_(); foFlush_(); }   // snapshot, scheduled reports, chart refresh: once a day after 07:00 IST
  if (typeof foDeskHourly_ === 'function') {   // Live Pricing Desk: recompute, alerts, 07:00 brief (failures are logged, never block the sync)
    try { const r = foDeskHourly_(); if (/brief sent/.test(r)) foAppend_('Jobs', { job: 'desk', started: foNow_(), finished: foNow_(), status: 'ok', detail: r }); }
    catch (e) { foAppend_('Jobs', { job: 'desk', started: foNow_(), finished: foNow_(), status: 'failed', detail: String(e && e.message || e).slice(0, 900) }); }
    foFlush_();
  }
}

function foSeedReference_() {
  if (!foRows_('Properties').length) {
    // from content/business-facts.json (whole-villa rentals: 1 rentable unit each, so the inventory unit is the villa-night)
    [['divinestay', 'Divinestay', 3, 8, 5500], ['ap-suite', 'AP Suite', 2, 4, 4200], ['om-shanti-stay', 'Om Shanti Stay', 2, 6, 4500],
      ['villa-aranya', 'Villa Aranya', 3, 8, 5800], ['rudrangan-suites', 'Rudrangan Suites', 3, 6, 5200]]
      .forEach(([property_id, name, bedrooms, sleeps, from_rate]) => foAppend_('Properties', { property_id, name, unit_type: 'villa', units: 1, bedrooms, sleeps, from_rate, active: 'yes' }));
  }
  if (!foRows_('Channels').length) {
    // commission_pct left blank = unknown (never guessed). The founder fills real rates in Settings.
    [['Direct', 'direct'], ['Direct · WhatsApp', 'direct'], ['Direct · Phone', 'direct'], ['Direct · Website', 'direct'], ['Walk-in', 'direct'],
      ['Booking.com', 'ota'], ['Airbnb', 'ota'], ['MakeMyTrip', 'ota'], ['Goibibo', 'ota'], ['Agoda', 'ota'], ['Other', 'other'], ['Unknown', 'other']]
      .forEach(([channel, kind]) => foAppend_('Channels', { channel, kind }));
  }
}

// ---------------------------------------------------------------- data store helpers ----------------
// Speed: everything a request touches is opened once and read once per execution (Sheets calls cost ~100-300 ms each).
// Rows are handed out as copies, so callers can never corrupt the in-memory copy; every write updates/invalidates it.
var FO_MEMO = { ss: null, tabs: {}, rows: {}, last: {}, dirty: false };
function foSS_() {
  if (FO_MEMO.ss) return FO_MEMO.ss;
  const id = PropertiesService.getScriptProperties().getProperty('FO_DATA_ID');
  if (!id) throw new Error('Founder OS is not set up yet (run foSetup).');
  return (FO_MEMO.ss = SpreadsheetApp.openById(id));
}
function foTab_(name) {
  if (FO_MEMO.tabs[name]) return FO_MEMO.tabs[name];
  const ss = foSS_(), cols = FO_TABS[name];
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(cols.length, 1)).setNumberFormat('@');
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#E7EFEA');
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < cols.length) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
  }
  return (FO_MEMO.tabs[name] = sh);
}
function foLastRow_(name) { if (FO_MEMO.last[name] == null) FO_MEMO.last[name] = foTab_(name).getLastRow(); return FO_MEMO.last[name]; }
function foRows_(name) {
  if (!FO_MEMO.rows[name]) {
    const sh = foTab_(name), n = foLastRow_(name) - 1, cols = FO_TABS[name];
    FO_MEMO.rows[name] = n < 1 ? [] : sh.getRange(2, 1, n, cols.length).getValues().map((r, i) => {
      const o = { _row: i + 2 };
      cols.forEach((c, j) => { const v = r[j]; o[c] = v instanceof Date ? Utilities.formatDate(v, FO.TZ, "yyyy-MM-dd'T'HH:mm:ss") : (v == null ? '' : String(v)); });
      return o;
    });
  }
  return FO_MEMO.rows[name].map(o => Object.assign({}, o));
}
function foCell_(v) { const s = v == null ? '' : String(v).slice(0, 5000); return /^[=+@]/.test(s) || /^-[^\d]/.test(s) ? "'" + s : s; }   // no formula injection
/** Marks the founder data as changed: the cached data bundle is dropped now and again when the request ends. */
function foTouch_() { if (!FO_MEMO.dirty) { FO_MEMO.dirty = true; foBumpVersion_(); } }
function foBumpVersion_() { PropertiesService.getScriptProperties().setProperty('FO_DATA_VER', String(Date.now()) + Math.floor(Math.random() * 1000)); }
function foFlush_() { if (FO_MEMO.dirty) { foBumpVersion_(); FO_MEMO.dirty = false; } }
function foAppend_(name, obj) {
  const sh = foTab_(name), cols = FO_TABS[name], last = foLastRow_(name), vals = cols.map(c => foCell_(obj[c]));
  if (sh.getMaxRows() <= last + 1) { sh.insertRowsAfter(sh.getMaxRows(), 200); sh.getRange(last + 1, 1, 200, cols.length).setNumberFormat('@'); }
  sh.getRange(last + 1, 1, 1, cols.length).setValues([vals]);
  FO_MEMO.last[name] = last + 1;
  if (FO_MEMO.rows[name]) { const o = { _row: last + 1 }; cols.forEach((c, j) => { o[c] = String(vals[j]).replace(/^'/, ''); }); FO_MEMO.rows[name].push(o); }
  if (name !== 'Audit' && name !== 'Jobs') foTouch_();
}
function foUpdate_(name, row, obj) {
  const sh = foTab_(name), cols = FO_TABS[name], vals = cols.map(c => foCell_(obj[c]));
  sh.getRange(row, 1, 1, cols.length).setValues([vals]);
  const r = FO_MEMO.rows[name] && FO_MEMO.rows[name].find(x => x._row === row);
  if (r) cols.forEach((c, j) => { r[c] = String(vals[j]).replace(/^'/, ''); });
  foTouch_();
}
function foDeleteRow_(name, row) {
  foTab_(name).deleteRow(row);
  delete FO_MEMO.rows[name]; delete FO_MEMO.last[name];
  foTouch_();
}
function foNow_() { return Utilities.formatDate(new Date(), FO.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function foToday_() { return Utilities.formatDate(new Date(), FO.TZ, 'yyyy-MM-dd'); }
function foRandom_() { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid())).replace(/=+$/, ''); }
function foId_(prefix) { return prefix + '-' + Utilities.formatDate(new Date(), FO.TZ, 'yyMMdd') + '-' + foRandom_().replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase(); }
function foAudit_(actor, action, detail, result) {
  try { foAppend_('Audit', { ts: foNow_(), actor: actor || '', action, detail: String(detail || '').slice(0, 900), result: result || '' }); } catch (e) {}
}

// ---------------------------------------------------------------- cryptography ----------------
function foPepper_() { const s = PropertiesService.getScriptProperties().getProperty('FO_PEPPER'); if (!s) throw new Error('Founder OS is not set up yet.'); return s; }
function foBytesHex_(b) { return b.map(x => ('0' + (x & 255).toString(16)).slice(-2)).join(''); }
function foHmac_(msg) { return foBytesHex_(Utilities.computeHmacSha256Signature(String(msg), foPepper_())); }
function foSafeEqual_(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
/** PBKDF2-HMAC-SHA256 (one 32-byte block). Key = pepper + passphrase, so a leaked sheet alone cannot be brute-forced. */
function foPbkdf2_(pass, salt, rounds) {
  const key = Utilities.newBlob(foPepper_() + '|' + pass).getBytes();
  const hmac = (m) => Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, m, key);
  let u = hmac(Utilities.newBlob(salt).getBytes().concat([0, 0, 0, 1])), t = u.slice();
  for (let i = 1; i < rounds; i++) { u = hmac(u); for (let j = 0; j < t.length; j++) t[j] ^= u[j]; }
  return foBytesHex_(t);
}
/** Six digits from a secure random source (java SecureRandom behind getUuid), with rejection sampling so every code is equally likely. */
function foOtp_() {
  for (;;) {
    const h = foBytesHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid()));
    const n = parseInt(h.slice(0, 8), 16);
    if (n < 4294000000) return ('00000' + (n % 1000000)).slice(-6);
  }
}

// ---------------------------------------------------------------- sign-in: factor 1 (passphrase) + factor 2 (email OTP) ----------------
function foUser_(email) { return foRows_('Users').find(u => u.email === String(email || '').trim().toLowerCase() && u.status === 'active'); }
/** Name/role/status only (no passphrase hash), cached per data version so ordinary requests skip the Users sheet read. */
function foUserLite_(email) {
  const c = CacheService.getScriptCache(), key = 'FO_U_' + (PropertiesService.getScriptProperties().getProperty('FO_DATA_VER') || '0') + '_' + foHmac_(email).slice(0, 16);
  const hit = c.get(key); if (hit) return hit === '-' ? null : JSON.parse(hit);
  const u = foUser_(email), lite = u ? { email: u.email, name: u.name, role: u.role, status: u.status } : null;
  c.put(key, lite ? JSON.stringify(lite) : '-', 120);   // direct edits in the Users sheet take effect within 2 minutes
  return lite;
}
function foMask_(email) { const [a, d] = String(email).split('@'); return a.slice(0, 2) + '•••@' + d; }
function foCounter_(key, ttl) { const c = CacheService.getScriptCache(), n = Number(c.get(key) || 0) + 1; c.put(key, String(n), ttl); return n; }

function foLoginStart_(b) {
  const generic = { ok: false, error: 'That email and passphrase do not match.' };
  const cache = CacheService.getScriptCache();
  if (Number(cache.get('FO_PASSFAIL') || 0) >= FO.PASS_FAILS_PER_HOUR) return { ok: false, error: 'Sign-in is paused for up to an hour after repeated wrong attempts.' };
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120), u = foUser_(email);
  const pass = String(b.passphrase || '');
  let purpose = 'login';
  if (!u) { foPbkdf2_(pass || 'x', 'decoy', FO.PASS_ROUNDS); foFail_(email, 'unknown email'); return generic; }   // same work either way
  if (!u.pass_hash) purpose = 'setup';   // first sign-in: the email code proves ownership, then a passphrase is chosen
  else if (!foSafeEqual_(foPbkdf2_(pass, u.pass_salt, FO.PASS_ROUNDS), u.pass_hash)) { foFail_(email, 'wrong passphrase'); return generic; }
  return foSendChallenge_(u, purpose);
}
function foFail_(email, why) {
  const n = foCounter_('FO_PASSFAIL', 3600);
  foAudit_(email || '(blank)', 'login_failed', why, 'denied');
  if (n === FO.PASS_FAILS_PER_HOUR) {
    const to = PropertiesService.getScriptProperties().getProperty('FO_FOUNDER_EMAIL');
    if (to) MailApp.sendEmail(to, 'AP Villas Founder OS: sign-in paused', 'There were ' + n + ' wrong sign-in attempts in the last hour, so sign-in is paused for up to an hour. If this was not you, nothing else is needed: your passphrase and email code are still required.\n\nTime: ' + foNow_());
  }
}
function foSendChallenge_(u, purpose) {
  if (foCounter_('FO_OTPSENDS', 3600) > FO.OTP_SENDS_PER_HOUR) return { ok: false, error: 'Too many codes sent. Please wait an hour.' };
  const id = foRandom_(), otp = foOtp_(), now = Date.now();
  const ch = { email: u.email, purpose, digest: foHmac_(id + ':' + otp), tries: 0, created: now, sent: now };
  CacheService.getScriptCache().put('FO_C_' + id, JSON.stringify(ch), FO.OTP_TTL_S + 30);
  foMailOtp_(u.email, otp, purpose);
  foAudit_(u.email, 'otp_sent', purpose, 'ok');
  return { ok: true, challenge: id, purpose, to: foMask_(u.email), expiresIn: FO.OTP_TTL_S };
}
function foMailOtp_(to, otp, purpose) {
  const when = Utilities.formatDate(new Date(), FO.TZ, 'd MMM yyyy, h:mm a') + ' IST';
  MailApp.sendEmail({
    to, name: 'AP Villas Founder OS', subject: 'Your AP Villas sign-in code',
    body: 'Your one-time sign-in code is ' + otp + '\n\nIt expires in 5 minutes and works once. Requested ' + when + (purpose === 'setup' ? ' (first sign-in: you will choose a passphrase next).' : '.') + '\nIf you did not try to sign in, ignore this email and nobody can get in without the code.',
    htmlBody: '<div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;padding:24px;border:1px solid #DDE6E0;border-radius:14px">' +
      '<div style="font:700 12px Arial;letter-spacing:2px;color:#9A7A2E">AP VILLAS FOUNDER OS</div>' +
      '<p style="color:#1C2421;font-size:15px">Your one-time sign-in code:</p>' +
      '<div style="font:700 34px/1 monospace;letter-spacing:8px;color:#0F3D2E;background:#F3F7F4;border-radius:10px;padding:16px;text-align:center">' + otp + '</div>' +
      '<p style="color:#55605B;font-size:13px">Expires in 5 minutes and works once. Requested ' + when + '.' + (purpose === 'setup' ? ' First sign-in: you will choose a passphrase next.' : '') + '</p>' +
      '<p style="color:#55605B;font-size:12px">Did not try to sign in? Ignore this email; nobody can get in without this code.</p></div>',
  });
}
function foLoginResend_(b) {
  const key = 'FO_C_' + String(b.challenge || ''), cache = CacheService.getScriptCache(), raw = cache.get(key);
  if (!raw) return { ok: false, error: 'This code request has expired. Please start again.' };
  const ch = JSON.parse(raw);
  if (Date.now() - ch.sent < FO.OTP_RESEND_GAP_S * 1000) return { ok: false, error: 'Please wait a minute before asking for another code.', wait: Math.ceil((FO.OTP_RESEND_GAP_S * 1000 - (Date.now() - ch.sent)) / 1000) };
  cache.remove(key);   // the old code stops working
  return foSendChallenge_({ email: ch.email }, ch.purpose);
}
function foLoginVerify_(b) {
  const key = 'FO_C_' + String(b.challenge || ''), cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const raw = cache.get(key);
    if (!raw) return { ok: false, error: 'This code has expired or was already used. Please start again.', restart: true };
    const ch = JSON.parse(raw);
    if (Date.now() - ch.created > FO.OTP_TTL_S * 1000) { cache.remove(key); return { ok: false, error: 'This code has expired. Please start again.', restart: true }; }
    const otp = String(b.otp || '').replace(/\D/g, '');
    if (otp.length !== 6 || !foSafeEqual_(foHmac_(String(b.challenge) + ':' + otp), ch.digest)) {
      ch.tries++;
      foAudit_(ch.email, 'otp_failed', 'try ' + ch.tries, 'denied');
      if (ch.tries >= FO.OTP_MAX_TRIES) { cache.remove(key); return { ok: false, error: 'Too many wrong codes. Please start again.', restart: true }; }
      cache.put(key, JSON.stringify(ch), Math.max(30, FO.OTP_TTL_S - Math.floor((Date.now() - ch.created) / 1000)));
      return { ok: false, error: 'That code is not right. ' + (FO.OTP_MAX_TRIES - ch.tries) + ' tries left.' };
    }
    const u = foUser_(ch.email); if (!u) { cache.remove(key); return { ok: false, error: 'Account is not active.', restart: true }; }
    if (ch.purpose === 'setup') {
      const np = String(b.newPassphrase || '');
      if (np.length < FO.PASS_MIN) return { ok: false, error: 'Choose a passphrase of at least ' + FO.PASS_MIN + ' characters.', needPassphrase: true };
      foSetPass_(u, np);
    }
    cache.remove(key);   // one-time use: the same code can never be replayed
    const s = foNewSession_(u);
    foAudit_(u.email, 'login', ch.purpose === 'setup' ? 'first sign-in, passphrase set' : 'passphrase + email code', 'ok');
    return { ok: true, token: s.token, user: { email: u.email, name: u.name, role: u.role }, idleMin: FO.SESSION_IDLE_MIN };
  } finally { lock.releaseLock(); }
}
function foSetPass_(u, pass) {
  const salt = foRandom_();
  u.pass_salt = salt; u.pass_hash = foPbkdf2_(pass, salt, FO.PASS_ROUNDS); u.pass_set_at = foNow_();
  foUpdate_('Users', u._row, u);
}

// ---------------------------------------------------------------- sessions (server-side, revocable) ----------------
function foNewSession_(u) {
  const token = foRandom_() + foRandom_(), now = Date.now();
  PropertiesService.getScriptProperties().setProperty('FO_S_' + foHmac_(token).slice(0, 40), JSON.stringify({ email: u.email, role: u.role, created: now, last: now, rotated: now }));
  return { token };
}
function foSessionKeys_() { return Object.keys(PropertiesService.getScriptProperties().getProperties()).filter(k => k.indexOf('FO_S_') === 0); }
/** Checks a token; expires idle/old sessions; issues a rotated token every SESSION_ROTATE_MIN minutes (old one stays valid 2 minutes). */
function foAuth_(token) {
  if (!token || String(token).length < 40) return { ok: false };
  const p = PropertiesService.getScriptProperties(), key = 'FO_S_' + foHmac_(String(token)).slice(0, 40), raw = p.getProperty(key);
  if (!raw) return { ok: false };
  const s = JSON.parse(raw), now = Date.now();
  if (s.graceUntil && now > s.graceUntil) { p.deleteProperty(key); return { ok: false }; }
  if (now - s.last > FO.SESSION_IDLE_MIN * 60000 || now - s.created > FO.SESSION_MAX_H * 3600000) { p.deleteProperty(key); return { ok: false, expired: true }; }
  const u = foUserLite_(s.email); if (!u) { p.deleteProperty(key); return { ok: false }; }
  let rotate = null;
  if (!s.graceUntil && now - s.rotated > FO.SESSION_ROTATE_MIN * 60000) {
    rotate = foRandom_() + foRandom_();
    p.setProperty('FO_S_' + foHmac_(rotate).slice(0, 40), JSON.stringify({ email: s.email, role: u.role, created: s.created, last: now, rotated: now }));
    s.graceUntil = now + 120000;
  }
  s.last = now; p.setProperty(key, JSON.stringify(s));
  return { ok: true, user: { email: u.email, name: u.name, role: u.role }, rotate, key };
}
function foLogout_(b, user, sess) { PropertiesService.getScriptProperties().deleteProperty(sess.key); foAudit_(user.email, 'logout', '', 'ok'); return { ok: true }; }
function foLogoutAll_(b, user) {
  const p = PropertiesService.getScriptProperties(); let n = 0;
  foSessionKeys_().forEach(k => { const s = JSON.parse(p.getProperty(k) || '{}'); if (s.email === user.email) { p.deleteProperty(k); n++; } });
  foAudit_(user.email, 'logout_all', n + ' sessions', 'ok'); return { ok: true, ended: n };
}
function foSessionsList_(b, user, sess) {
  const p = PropertiesService.getScriptProperties();
  return { sessions: foSessionKeys_().map(k => ({ k, s: JSON.parse(p.getProperty(k) || '{}') })).filter(x => x.s.email === user.email && !x.s.graceUntil)
    .map(x => ({ current: x.k === sess.key, started: new Date(x.s.created).toISOString(), lastActive: new Date(x.s.last).toISOString() })) };
}
function foChangePass_(b, user) {
  const u = foUser_(user.email);
  if (!foSafeEqual_(foPbkdf2_(String(b.current || ''), u.pass_salt, FO.PASS_ROUNDS), u.pass_hash)) { foAudit_(user.email, 'passphrase_change', 'wrong current', 'denied'); return { ok: false, error: 'Current passphrase is not right.' }; }
  if (String(b.next || '').length < FO.PASS_MIN) return { ok: false, error: 'Choose at least ' + FO.PASS_MIN + ' characters.' };
  foSetPass_(u, String(b.next));
  foAudit_(user.email, 'passphrase_change', '', 'ok');
  return { ok: true };
}
/** Hourly tidy-up of expired sessions (called from foHourly via the sync). */
function foPruneSessions_() {
  const p = PropertiesService.getScriptProperties(), now = Date.now();
  foSessionKeys_().forEach(k => { const s = JSON.parse(p.getProperty(k) || '{}'); if ((s.graceUntil && now > s.graceUntil) || now - s.last > FO.SESSION_IDLE_MIN * 60000 || now - s.created > FO.SESSION_MAX_H * 3600000) p.deleteProperty(k); });
}

// ---------------------------------------------------------------- API router (called from doPost in Code.gs for actions starting "f.") ----------------
function foRoutes_() {
  // [handler, minimum role]
  return {
    'f.logout': [foLogout_, 'viewer'], 'f.logout.all': [foLogoutAll_, 'viewer'], 'f.sessions': [foSessionsList_, 'viewer'], 'f.passphrase': [foChangePass_, 'viewer'],
    'f.data': [foDataLoad_, 'viewer'], 'f.audit': [foAuditList_, 'founder'],
    'f.sync': [foSyncNow_, 'manager'], 'f.booking.save': [foBookingSave_, 'manager'], 'f.booking.note': [foBookingNote_, 'manager'],
    'f.booking.history': [foBookingHistory_, 'viewer'], 'f.payment.add': [foPaymentAdd_, 'manager'],
    'f.block.save': [foBlockSave_, 'manager'], 'f.block.delete': [foBlockDelete_, 'manager'],
    'f.exception.resolve': [foExceptionResolve_, 'manager'], 'f.import.rows': [foImportRows_, 'manager'],
    'f.channel.save': [foChannelSave_, 'founder'],
    // phases 5–10
    'f.chart.save': [foChartSave_, 'manager'], 'f.chart.delete': [(b, u) => foDelete_('Charts', 'chart_id', b.chart_id, u), 'manager'],
    'f.dashboard.save': [foDashboardSave_, 'manager'], 'f.dashboard.delete': [(b, u) => foDelete_('Dashboards', 'dashboard_id', b.dashboard_id, u), 'manager'],
    'f.expense.save': [foExpenseSave_, 'manager'], 'f.expense.delete': [(b, u) => foDelete_('Expenses', 'expense_id', b.expense_id, u), 'founder'],
    'f.budget.save': [foBudgetSave_, 'founder'], 'f.budget.delete': [(b, u) => foDelete_('Budgets', 'budget_id', b.budget_id, u), 'founder'],
    'f.event.save': [foEventSave_, 'manager'], 'f.event.delete': [(b, u) => foDelete_('Events', 'event_id', b.event_id, u), 'manager'],
    'f.decision.save': [foDecisionSave_, 'founder'], 'f.settings.save': [foSettingsSave_, 'founder'],
    'f.report.run': [foReportRun_, 'manager'], 'f.report.get': [foReportGet_, 'viewer'], 'f.ga4': [foGa4Api_, 'viewer'],
    // market intelligence + pricing
    'f.market.save': [foMarketSave_, 'manager'], 'f.market.delete': [foMarketDelete_, 'manager'], 'f.market.import': [(b, u) => foMarketImport_(b, u.email), 'manager'],
    'f.pricing.settings': [foPricingSettingsSave_, 'founder'],
    'f.automation.create': [foAutomationCreate_, 'founder'], 'f.automation.revoke': [foAutomationRevoke_, 'founder'],
    // SEO & marketing (FoSearch.gs)
    'f.health': [foHealth_, 'viewer'],
    // Live Pricing Desk (FoSignals.gs)
    'f.pricing.today': [(b, u) => foDeskView_(b, u, 'today'), 'viewer'], 'f.pricing.calendar': [(b, u) => foDeskView_(b, u, 'calendar'), 'viewer'], 'f.pricing.date': [(b, u) => foDeskView_(b, u, 'date'), 'viewer'],
    'f.comp.list': [(b, u) => foDeskView_(b, u, 'comp'), 'viewer'], 'f.comp.changes': [(b, u) => foDeskView_(b, u, 'changes'), 'viewer'], 'f.signals.health': [(b, u) => foDeskView_(b, u, 'health'), 'viewer'],
    'f.pricing.decide': [foDeskDecide_, 'manager'], 'f.ratecheck.save': [foRateCheckSave_, 'manager'], 'f.signals.import': [(b, u) => foSignalsImport_(b, u.email), 'manager'],
    'f.comp.rerank': [(b, u) => ({ result: foCompRerank_(foToday_()) }), 'manager'], 'f.desk.settings': [foDeskSettingsSave_, 'founder'],
    'f.gsc': [foGscApi_, 'viewer'], 'f.seo.audit': [foSeoAudit_, 'manager'], 'f.campaign.report': [foCampaignReport_, 'viewer'],
    'f.seo.keyword.save': [foSeoKeywordSave_, 'manager'], 'f.seo.keyword.delete': [(b, u) => foDelete_('SeoKeywords', 'keyword_id', b.id, u), 'manager'],
    'f.seo.topic.save': [foSeoTopicSave_, 'manager'], 'f.seo.topic.delete': [(b, u) => foDelete_('SeoTopics', 'topic_id', b.id, u), 'manager'],
    'f.campaign.save': [foCampaignSave_, 'manager'], 'f.campaign.delete': [(b, u) => foDelete_('Campaigns', 'campaign_id', b.id, u), 'manager'],
  };
}
function foApi_(b) {
  const a = String(b.action || '');
  try {
    if (a === 'f.login.start') return foLoginStart_(b);
    if (a === 'f.login.verify') return foLoginVerify_(b);
    if (a === 'f.login.resend') return foLoginResend_(b);
    if (b.key && !b.token) return foMachineApi_(b);   // automation key (FoMarket.gs): a few machine-only actions, no guest data
    const sess = foAuth_(b.token);
    if (!sess.ok) return { ok: false, auth: false, error: 'Your session has ended. Please sign in again.' };
    const r = foRoutes_()[a]; if (!r) return { ok: false, error: 'Unknown action.' };
    if ((FO.ROLES[sess.user.role] || 0) < FO.ROLES[r[1]]) { foAudit_(sess.user.email, 'forbidden', a, 'denied'); return { ok: false, error: 'Your role cannot do this.' }; }
    const out = r[0](b, sess.user, sess) || {};
    foFlush_();
    if (out.ok === undefined) out.ok = true;
    if (sess.rotate) out.rotate = sess.rotate;
    return out;
  } catch (e) {
    foAudit_('system', 'error', a + ': ' + String(e && e.message || e).slice(0, 300), 'error');
    return { ok: false, error: 'Something went wrong on the server. It has been logged.' };
  }
}
function foAuditList_() { return { audit: foRows_('Audit').slice(-300).reverse().map(r => { delete r._row; return r; }) }; }
