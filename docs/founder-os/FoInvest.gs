/**
 * AP Villas Founder OS · Investments (Founder OS Markets, free build). Founder-only: nothing here is in the shared data bundle.
 * The analytics run in the founder's PRIVATE repo ap-markets (GitHub Actions, free data: NSE archives, IBJA, AMFI, FRED, SEBI filings,
 * market RSS). It signs in with a GitHub OIDC token (GitHub's signature, that repo, main branch: nothing to copy by hand) or a markets key,
 * and either can reach only FO_MK_ROUTES: pull open paper orders + the list of symbols to price
 * (never the quantities or values of real holdings), push fills and the daily snapshot. Real holdings are valued here, inside Google.
 * Paper only: there is no code path that places a real order. Labels are "model score" / "paper verdict", never "buy" or "tip".
 */
const FO_INV = {
  KINDS: ['stock', 'etf', 'mf', 'gold', 'silver', 'sgb', 'fd', 'rd', 'ppf', 'epf', 'nps', 'bond', 'cash', 'property', 'other'],
  ORDER_TYPES: ['market', 'limit', 'sl', 'sl-m', 'gtt', 'sip'],
  RISK: { max_stock_pct: 10, max_sector_pct: 25, max_bullion_pct: 30, max_sme_pct: 20, riskoff_gross_pct: 60, dd_pause_pct: 15 },
  DISCLAIMER: 'Educational model output for paper trading. Not investment advice.',
  SNAP_KEEP_DAYS: 30,
  SIP_KINDS: ['mf', 'stock', 'etf', 'ppf', 'epf', 'nps', 'bond', 'cash', 'other'],
  IPO_RANK: { filed: 0, upcoming: 1, open: 2, closed: 3, allotted: 4, listed: 5 },
};

// ---------------------------------------------------------------- key ----------------
function foInvKeyCreate_(b, user) {
  const key = 'apm_' + foRandom_() + foRandom_(), p = PropertiesService.getScriptProperties();
  p.setProperty('FO_MARKETS_KEY', foHmac_('markets:' + key)); p.setProperty('FO_MARKETS_META', JSON.stringify({ created_at: foNow_(), created_by: user.email }));
  foAudit_(user.email, 'markets_key_created', 'previous markets key (if any) revoked', 'ok');
  return { key, note: 'Shown once. Add it as the GitHub secret FO_MARKETS_KEY in the private repo ap-markets; nowhere else.' };
}
function foInvKeyRevoke_(b, user) { const p = PropertiesService.getScriptProperties(); p.deleteProperty('FO_MARKETS_KEY'); p.deleteProperty('FO_MARKETS_META'); foAudit_(user.email, 'markets_key_revoked', '', 'ok'); return {}; }
const FO_MK_ROUTES = {
  'f.mk.ping': b => ({ pong: true, today: foToday_() }),
  'f.mk.pull': b => foMkPull_(b), 'f.mk.report': b => foMkReport_(b), 'f.mk.snapshot': b => foMkSnapshot_(b), 'f.mk.bullion': b => foMkBullion_(b),
};
// GitHub Actions OIDC: GitHub signs a short-lived token that names the repo and branch; we check the RS256 signature against GitHub's
// published keys, then the issuer, audience, repo, branch and expiry. Apps Script has no RSA verify, so it is done with BigInt.
const FO_GH_OIDC = { iss: 'https://token.actions.githubusercontent.com', aud: 'ap-founder-os-markets', repo: 'apvillasandresorts/ap-markets', ref: 'refs/heads/main' };
function foB64uBytes_(s) { s = String(s || ''); return Utilities.base64DecodeWebSafe(s + '='.repeat((4 - s.length % 4) % 4)); }
function foBytesHex_(bytes) { return bytes.map(b => ((b & 255) + 256).toString(16).slice(1)).join(''); }
function foModPow_(b, e, m) { const ZERO = BigInt(0), ONE = BigInt(1); let r = ONE; b %= m; while (e > ZERO) { if (e & ONE) r = r * b % m; e >>= ONE; b = b * b % m; } return r; }   // BigInt() calls, not 1n literals: the Apps Script editor's parser rejects those
function foGhJwks_(fresh) {
  const c = CacheService.getScriptCache(), hit = !fresh && c.get('FO_GH_JWKS'); if (hit) return JSON.parse(hit);
  const r = UrlFetchApp.fetch(FO_GH_OIDC.iss + '/.well-known/jwks', { muteHttpExceptions: true }); if (r.getResponseCode() !== 200) return [];
  const keys = (JSON.parse(r.getContentText()).keys || []).filter(k => k.kty === 'RSA').map(k => ({ kid: k.kid, n: k.n, e: k.e }));
  c.put('FO_GH_JWKS', JSON.stringify(keys), 6 * 3600); return keys;
}
/** Verified claims of a GitHub Actions OIDC token from our repo's main branch, or null. */
function foGhOidc_(tok) {
  const p = String(tok || '').split('.'); if (p.length !== 3 || tok.length > 6000) return null;
  try {
    const head = JSON.parse(Utilities.newBlob(foB64uBytes_(p[0])).getDataAsString()); if (head.alg !== 'RS256') return null;
    let k = foGhJwks_(false).find(x => x.kid === head.kid); if (!k) k = foGhJwks_(true).find(x => x.kid === head.kid); if (!k) return null;
    const nHex = foBytesHex_(foB64uBytes_(k.n)).replace(/^(00)+/, ''), len = Math.ceil(nHex.length / 2), sHex = foBytesHex_(foB64uBytes_(p[2]));
    if (len < 256 || sHex.length !== len * 2) return null;
    const n = BigInt('0x' + nHex), sig = BigInt('0x' + sHex); if (sig >= n) return null;
    const em = foModPow_(sig, BigInt('0x' + foBytesHex_(foB64uBytes_(k.e))), n).toString(16).padStart(len * 2, '0');
    const t = '3031300d060960864801650304020105000420' + foBytesHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, p[0] + '.' + p[1], Utilities.Charset.UTF_8));
    if (em !== '0001' + 'ff'.repeat(len - 3 - t.length / 2) + '00' + t) return null;
    const c = JSON.parse(Utilities.newBlob(foB64uBytes_(p[1])).getDataAsString()), now = Date.now() / 1000;
    if (c.iss !== FO_GH_OIDC.iss || c.aud !== FO_GH_OIDC.aud || c.repository !== FO_GH_OIDC.repo || c.ref !== FO_GH_OIDC.ref) return null;
    if (!(c.exp > now) || (c.nbf && c.nbf > now + 60) || (c.iat && c.iat > now + 60)) return null;
    return c;
  } catch (e) { return null; }
}
function foMarketsAuthed_(b) {
  if (b.gh_oidc) return !!foGhOidc_(b.gh_oidc);
  const stored = PropertiesService.getScriptProperties().getProperty('FO_MARKETS_KEY');
  return !!stored && String(b.markets_key).length >= 40 && foSafeEqual_(foHmac_('markets:' + b.markets_key), stored);
}
/** Entry point for requests carrying markets_key or gh_oidc (FoCore.gs foApi_). */
function foMarketsApi_(b) {
  if (foKeyLocked_('markets')) return { ok: false, auth: false, error: 'Markets key not accepted.' };
  if (!foMarketsAuthed_(b)) { foKeyFail_('markets', b.gh_oidc ? 'bad github token' : 'bad markets key'); return { ok: false, auth: false, error: 'Markets key not accepted.' }; }
  if (b.gh_oidc) foInvSettingSet_('engine_seen', JSON.stringify({ via: 'github', at: foNow_() }));
  if (foCounter_('FO_MK_CALLS', 3600) > 120) return { ok: false, error: 'Too many markets calls this hour.' };
  const fn = FO_MK_ROUTES[String(b.action || '')]; if (!fn) return { ok: false, error: 'Not allowed for the markets key.' };
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { const out = fn(b) || {}; foFlush_(); if (out.ok === undefined) out.ok = true; if (b.action !== 'f.mk.ping') foAudit_('markets', b.action, JSON.stringify(out.summary || '').slice(0, 300), 'ok'); delete out.summary; return out; }
  finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- helpers ----------------
const foInvNum_ = v => { const n = Number(String(v == null ? '' : v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : NaN; };
const foInvSym_ = v => String(v || '').toUpperCase().replace(/[^A-Z0-9&_-]/g, '').slice(0, 20);
function foInvClean_(r) { const o = Object.assign({}, r); delete o._row; return o; }
function foInvSettings_() { const o = {}; foRows_('InvSettings').forEach(r => { o[r.key] = r.value; }); return o; }
function foInvSettingSet_(key, value) {
  const row = foRows_('InvSettings').find(r => r.key === key), rec = { key, value: String(value == null ? '' : value).slice(0, 40000), updated_at: foNow_() };
  if (row) foUpdate_('InvSettings', row._row, rec); else foAppend_('InvSettings', rec);
}
function foInvFolder_() {
  const parent = foReportsFolder_(), it = parent.getFoldersByName('Markets');
  return it.hasNext() ? it.next() : parent.createFolder('Markets');
}
/** Latest snapshot from the markets engine (parsed), or null. */
function foInvSnapshot_() {
  const id = PropertiesService.getScriptProperties().getProperty('FO_MK_SNAP'); if (!id) return null;
  try { return JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString()); } catch (e) { return null; }
}
function foInvAlert_(key, subject, text) {
  try {
    const c = CacheService.getScriptCache(), k = 'FO_INV_AL_' + key; if (c.get(k)) return; c.put(k, '1', 20 * 3600);
    MailApp.sendEmail({ to: PropertiesService.getScriptProperties().getProperty('FO_FOUNDER_EMAIL'), subject: 'Founder OS Markets · ' + subject, body: text + '\n\n' + FO_INV.DISCLAIMER + '\nhttps://www.apvillasandresorts.in/founder/#/investments' });
  } catch (e) {}
}
function foInvEnsureAutopilot_() {
  if (foRows_('InvAccounts').some(a => a.strategy === 'autopilot')) return;
  foAppend_('InvAccounts', { account_id: 'PA-AUTOPILOT', name: 'Model Autopilot', strategy: 'autopilot', starting_cash: 1000000, benchmark: 'Nifty 500', risk_json: '{}', created_at: foToday_(), status: 'active', notes: 'Trades the model top 10 every week, mechanically: the honest scorecard of the model.' });
}

// ---------------------------------------------------------------- engine side (markets key) ----------------
/** What the engine needs: paper accounts/orders/fills, symbols to price and fund codes. Never real quantities or values. */
function foMkPull_(b) {
  foInvEnsureAutopilot_();
  const H = foRows_('InvHoldings').filter(h => h.status !== 'closed'), W = foRows_('InvWatch'), O = foRows_('InvOrders'), F = foRows_('InvFills');
  const syms = new Set(), funds = new Set();
  H.forEach(h => { if ((h.kind === 'stock' || h.kind === 'etf' || h.kind === 'sgb') && h.symbol) syms.add(h.symbol); if (h.kind === 'mf' && h.fund_code) funds.add(String(h.fund_code)); });
  W.forEach(w => { if (w.kind === 'mf') funds.add(String(w.symbol)); else syms.add(w.symbol); });
  O.forEach(o => syms.add(o.symbol)); F.forEach(f => syms.add(f.symbol));
  return {
    accounts: foRows_('InvAccounts').filter(a => a.status !== 'closed').map(a => ({ account_id: a.account_id, name: a.name, strategy: a.strategy, rules_id: a.rules_id || '', starting_cash: Number(a.starting_cash) || 1000000, benchmark: a.benchmark, risk_json: a.risk_json || '{}', created_at: a.created_at })),
    orders: O.filter(o => o.status === 'open' || o.status === 'partial').map(o => { const x = foInvClean_(o); ['qty', 'limit_price', 'trigger_price', 'target', 'stop', 'amount', 'sip_day', 'filled_qty'].forEach(k => { x[k] = x[k] === '' ? null : Number(x[k]); }); return x; }),
    fills: F.map(f => ({ fill_id: f.fill_id, order_id: f.order_id, account_id: f.account_id, symbol: f.symbol, side: f.side, qty: Number(f.qty), price: Number(f.price), date: f.date, charges: Number(f.charges) || 0 })),
    symbols: Array.from(syms).filter(Boolean), fund_codes: Array.from(funds).filter(Boolean),
    strategies: foInvStrategies_(), control: foInvJson_(foInvSettings_().model_control, null),
  };
}
function foMkReport_(b) {
  foInvEnsureAutopilot_();
  const have = new Set(foRows_('InvFills').map(f => f.fill_id)); let nf = 0, nu = 0, no = 0;
  (b.fills || []).slice(0, 500).forEach(f => {
    if (!f.fill_id || have.has(f.fill_id)) return; have.add(f.fill_id);
    foAppend_('InvFills', { fill_id: f.fill_id, order_id: f.order_id, account_id: f.account_id, symbol: foInvSym_(f.symbol), side: f.side === 'sell' ? 'sell' : 'buy', qty: Number(f.qty), price: Number(f.price), date: f.date, charges: Number(f.charges) || 0, charges_json: String(f.charges_json || '').slice(0, 900), slippage_bps: f.slippage_bps, origin: f.origin || 'paper', created_at: foNow_() }); nf++;
  });
  const byId = {}; foRows_('InvOrders').forEach(o => { byId[o.order_id] = o; });
  const touch = (o, patch) => { const n = Object.assign({}, o, patch, { updated_at: foNow_() }); foUpdate_('InvOrders', o._row, n); byId[o.order_id] = Object.assign(n, { _row: o._row }); nu++; };
  (b.updates || []).slice(0, 500).forEach(u => {
    const o = byId[u.order_id]; if (!o || o.status === 'cancelled') return;
    const patch = { status: ['open', 'partial', 'filled', 'rejected', 'expired'].indexOf(u.status) >= 0 ? u.status : o.status, note: String(u.note || o.note || '').slice(0, 300) };
    if (u.filled_qty != null) patch.filled_qty = u.filled_qty;
    if (u.convert_to) patch.type = u.convert_to;
    if (u.placed_at) patch.placed_at = u.placed_at;
    if (u.last_sip) patch.last_sip = u.last_sip;
    touch(o, patch);
    (u.children || []).forEach(k => { if (byId[k.order_id]) return; foAppend_('InvOrders', Object.assign({ status: 'open', filled_qty: 0, origin: 'bracket', note: '', updated_at: foNow_(), placed_by: 'engine' }, k)); byId[k.order_id] = k; no++; });
    if (u.cancel && byId[u.cancel] && byId[u.cancel]._row && (byId[u.cancel].status === 'open' || byId[u.cancel].status === 'partial')) touch(byId[u.cancel], { status: 'cancelled', note: 'Other leg of the bracket filled.' });
  });
  (b.new_orders || []).slice(0, 60).forEach(o => {
    const acc = foRows_('InvAccounts').find(a => a.account_id === o.account_id && (a.strategy === 'autopilot' || a.strategy === 'rules') && a.status !== 'closed'); if (!acc) return;   // the engine may only trade model-run accounts
    foAppend_('InvOrders', { order_id: foId_('PO'), account_id: o.account_id, symbol: foInvSym_(o.symbol), side: o.side === 'sell' ? 'sell' : 'buy', type: 'market', qty: Math.max(1, Math.floor(Number(o.qty) || 0)), validity: 'day', status: 'open', filled_qty: 0, note: String(o.note || '').slice(0, 200), origin: acc.strategy === 'rules' ? 'strategy' : 'autopilot', placed_at: foNow_(), updated_at: foNow_(), placed_by: 'engine' }); no++;
  });
  if (b.control_done && b.control_done.rollback_to) { const c = foInvJson_(foInvSettings_().model_control, null); if (c && c.rollback_to === b.control_done.rollback_to) foInvSettingSet_('model_control', ''); }
  return { fills: nf, updates: nu, orders: no, summary: { fills: nf, updates: nu, orders: no } };
}
function foMkSnapshot_(b) {
  const s = b.snapshot; if (!s || typeof s !== 'object' || !s.asof) return { ok: false, error: 'snapshot missing' };
  foInvEnsureAutopilot_();
  const json = JSON.stringify(s); if (json.length > 8e6) return { ok: false, error: 'snapshot too large' };
  const p = PropertiesService.getScriptProperties(), prev = foInvSnapshot_();
  const file = foInvFolder_().createFile(Utilities.newBlob(json, 'application/json', 'markets-' + s.asof + '.json'));
  p.setProperty('FO_MK_SNAP', file.getId());
  // keep 30 days of snapshots (the archive of past calls)
  try { const it = foInvFolder_().getFiles(), cut = Date.now() - FO_INV.SNAP_KEEP_DAYS * 86400000; while (it.hasNext()) { const f = it.next(); if (f.getDateCreated().getTime() < cut) f.setTrashed(true); } } catch (e) {}
  // the five headline numbers, one row per day (morning view + alerts)
  const top5 = (s.top || []).slice(0, 5).map(t => t.symbol).join(' '), g = s.bullion && s.bullion.today && s.bullion.today.gold999, sv = s.bullion && s.bullion.silver999 && s.bullion.silver999.last;
  const auto = s.paper && s.paper['PA-AUTOPILOT'], eq = auto && auto.equity;
  const ipos = foRows_('InvIpos').filter(i => i.status === 'open' || i.status === 'upcoming').length;
  const row = foRows_('InvDaily').find(r => r.date === s.asof), rec = { date: s.asof, light: s.model && s.model.light, regime: s.regime && s.regime.label, top5, gold: g || '', silver: sv || '', paper_equity: eq || '', open_ipos: ipos, created_at: foNow_() };
  if (row) foUpdate_('InvDaily', row._row, rec); else foAppend_('InvDaily', rec);
  // alerts (spec 16): model health red, data-quality block, drift, champion change, paper drawdown stop, bullion move > 2 %
  if (s.dq && !s.dq.ok) foInvAlert_('dq_' + s.asof, 'data-quality block', 'Scores were not published for ' + s.asof + ': ' + (s.dq.issues || []).join(' '));
  if (s.model && s.model.light === 'red' && (!prev || !prev.model || prev.model.light !== 'red')) foInvAlert_('red_' + s.asof, 'model health is red', s.model.note || '');
  if (s.model && s.model.drift_alarm && !(prev && prev.model && prev.model.drift_alarm)) foInvAlert_('drift_' + s.asof, 'drift alarm', 'Feature or concept drift detected; a retrain is scheduled.');
  const pc = prev && prev.model && prev.model.champion && prev.model.champion.version, nc = s.model && s.model.champion && s.model.champion.version;
  if (pc && nc && pc.split('@')[0] !== nc.split('@')[0]) foInvAlert_('champ_' + nc, 'new champion model', 'The challenger ' + nc + ' passed every promotion rule and replaced ' + pc + '. One click in Model health rolls it back.');
  Object.keys(s.paper || {}).forEach(id => { const a = s.paper[id]; if (a && a.peak && a.equity && a.equity < a.peak * (1 - FO_INV.RISK.dd_pause_pct / 100)) foInvAlert_('dd_' + id + '_' + s.asof, 'paper account paused', id + ' is more than ' + FO_INV.RISK.dd_pause_pct + '% below its peak: new entries pause until you review it.'); });
  ['gold999', 'silver999'].forEach(m => { const x = s.bullion && s.bullion[m], h = x && x.history; if (h && h.length > 1) { const ch = h[h.length - 1][1] / h[h.length - 2][1] - 1; if (Math.abs(ch) > 0.02) foInvAlert_(m + s.asof, (m === 'gold999' ? 'gold' : 'silver') + ' moved ' + (ch * 100).toFixed(1) + '%', 'IBJA ' + (m === 'gold999' ? '999 gold' : 'silver') + ' moved ' + (ch * 100).toFixed(1) + '% on ' + h[h.length - 1][0] + '.'); } });
  const done = { ipos: 0, sips: 0 };
  try { done.ipos = foInvAutoIpo_(s); } catch (e) { foAudit_('markets', 'auto_ipo_failed', String(e).slice(0, 200), 'error'); }
  try { done.sips = foInvAutoSip_(s); } catch (e) { foAudit_('markets', 'auto_sip_failed', String(e).slice(0, 200), 'error'); }
  if (foInvSettings_().daily_email !== 'off' && s.dq && s.dq.ok) foInvDailyEmail_(s, done);
  return { stored: true, summary: { asof: s.asof, kb: Math.round(json.length / 1024), ipos: done.ipos, sips: done.sips } };
}
function foMkBullion_(b) {
  const r = b.rates || {}; if (!r.gold999) return { ok: false, error: 'rates missing' };
  foInvSettingSet_('bullion_live', JSON.stringify({ date: b.date, session: b.session, rates: r, at: foNow_() }));
  return { summary: { session: b.session } };
}

// ---------------------------------------------------------------- automatic updates (no typing) ----------------
const foInvIpoKey_ = name => String(name || '').toLowerCase().replace(/&/g, 'and').replace(/\b(limited|ltd|pvt|private|india|the)\b\.?/g, ' ').replace(/[^a-z0-9]/g, '');
/** IPO board from the engine's feeds: SEBI RHP → upcoming, prospectus → closed, NSE listing → listed with listing-day prices.
 *  Only moves a status forward and only fills empty fields: what you typed is never overwritten. Returns rows touched. */
function foInvAutoIpo_(s) {
  const f = s.ipo_feed; if (!f) return 0;
  const today = foToday_(), ago = d => Math.round((Date.parse(today) - Date.parse(d)) / 86400000), byKey = {}; let n = 0;
  foRows_('InvIpos').forEach(r => { byKey[foInvIpoKey_(r.name)] = r; });
  const put = (key, name, patch, create) => {
    const r = byKey[key];
    if (!r) { if (!create) return; const rec = Object.assign({ ipo_id: foId_('IPO'), name: String(name).slice(0, 120), type: 'mainboard', auto: 'yes', updated_at: foNow_(), updated_by: 'engine' }, patch); foAppend_('InvIpos', rec); byKey[key] = rec; n++; return; }
    const upd = {};
    if ((FO_INV.IPO_RANK[patch.status] || 0) > (FO_INV.IPO_RANK[r.status] || 0)) upd.status = patch.status;
    Object.keys(patch).forEach(k => { if (k !== 'status' && patch[k] != null && patch[k] !== '' && (r[k] === '' || r[k] == null)) upd[k] = patch[k]; });
    if (Object.keys(upd).length && r._row) { foUpdate_('InvIpos', r._row, Object.assign({}, r, upd, { updated_at: foNow_(), updated_by: r.updated_by === 'engine' ? 'engine' : r.updated_by })); Object.assign(r, upd); n++; }
  };
  const filed = {};
  (f.filings || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(x => {
    if (x.stage === 'drhp' || x.kind === 'notice' || !x.date) return;
    const key = foInvIpoKey_(x.name); filed[key] = true;
    if (x.stage === 'rhp' && ago(x.date) <= 45) put(key, x.name, { status: 'upcoming', source_url: x.url }, true);
    if (x.stage === 'prospectus' && ago(x.date) <= 30) put(key, x.name, { status: 'closed', source_url: x.url }, true);
  });
  (f.listings || []).forEach(l => {
    const key = foInvIpoKey_(l.name); if (!byKey[key] && !filed[key]) return;   // a listing without an IPO on the board (transfers, SME) stays in "New on NSE"
    const patch = { listing: l.listed, type: l.board === 'sme' ? 'sme' : '' };
    if (l.listed <= today && l.list_open) Object.assign(patch, { status: 'listed', listing_open: l.list_open, listing_close: l.list_close });
    put(key, l.name, patch, !!filed[key]);
  });
  return n;
}
/** Monthly plans (SIP / contributions) post themselves on the due date: units from that evening's NAV or close, the value for
 *  PPF / EPF / NPS / bonds / cash grows by the amount. Up to 3 missed months are caught up. Returns transactions added. */
function foInvAutoSip_(s) {
  const today = foToday_(); let n = 0;
  const txns = foRows_('InvTxns');
  foRows_('InvHoldings').forEach(h => {
    const amt = foInvNum_(h.sip_amount), day = Math.round(foInvNum_(h.sip_day));
    if (h.status === 'closed' || !(amt > 0) || !(day >= 1 && day <= 28) || FO_INV.SIP_KINDS.indexOf(h.kind) < 0) return;
    const last = String(h.sip_last || ''), t0 = new Date(today + 'T00:00:00Z'), dues = [];
    if (!last) { foUpdate_('InvHoldings', h._row, Object.assign({}, h, { sip_last: today })); return; }
    for (let i = 2; i >= 0; i--) { const d = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth() - i, day)).toISOString().slice(0, 10); if (d > last && d <= today) dues.push(d); }
    if (!dues.length) return;
    let px = null, basis = '';
    if (h.kind === 'mf') { const v = s.nav && s.nav[h.fund_code]; if (v && v.nav) { px = Number(v.nav); basis = 'AMFI NAV ' + v.date; } }
    else if (h.kind === 'stock' || h.kind === 'etf') { const v = s.prices && s.prices[h.symbol]; if (v && v.close) { px = Number(v.close); basis = 'NSE close ' + v.date; } }
    const priced = h.kind === 'mf' || h.kind === 'stock' || h.kind === 'etf'; if (priced && !(px > 0)) return;   // no price yet: try the next run
    const rec = Object.assign({}, h); delete rec._row;
    let units = foInvNum_(h.units) || 0, avg = foInvNum_(h.avg_cost) || 0, inv = h.invested === '' ? null : foInvNum_(h.invested), cv = h.current_value === '' ? null : foInvNum_(h.current_value);
    if (!txns.some(t => t.holding_id === h.holding_id)) {   // keep XIRR right: the money already in becomes an opening transaction
      const open = inv != null ? inv : units * avg;
      if (open > 0) foAppend_('InvTxns', { txn_id: foId_('IT'), holding_id: h.holding_id, date: h.start_date || h.value_date || today, type: priced ? 'buy' : 'deposit', units: priced ? units : '', price: priced ? avg : '', amount: Math.round(open * 100) / 100, note: 'Opening balance (added automatically with the monthly plan)', created_at: foNow_(), created_by: 'engine' });
    }
    dues.forEach(d => {
      let u = '', a = amt;
      if (priced) { u = h.kind === 'mf' ? Math.floor(amt / px * 1000) / 1000 : Math.floor(amt / px); if (!(u > 0)) return; a = Math.round(u * px * 100) / 100; avg = (units * avg + a) / (units + u); units += u; }
      else { const r = foInvNum_(h.rate_pct); if (cv != null && r > 0 && rec.value_date && rec.value_date < d) cv = cv * Math.pow(1 + r / 100, (Date.parse(d) - Date.parse(rec.value_date)) / 86400000 / 365); cv = (cv || 0) + a; rec.value_date = d; }
      if (inv != null) inv += a;
      foAppend_('InvTxns', { txn_id: foId_('IT'), holding_id: h.holding_id, date: d, type: priced ? 'buy' : 'deposit', units: u, price: priced ? px : '', amount: a, note: 'Monthly plan, posted automatically' + (basis ? ' (' + basis + ')' : ''), created_at: foNow_(), created_by: 'engine' }); n++;
    });
    if (priced) { rec.units = Math.round(units * 10000) / 10000; rec.avg_cost = Math.round(avg * 10000) / 10000; } else rec.current_value = Math.round(cv * 100) / 100;
    if (inv != null) rec.invested = Math.round(inv * 100) / 100;
    rec.sip_last = dues[dues.length - 1]; rec.updated_at = foNow_(); rec.updated_by = 'engine';
    foUpdate_('InvHoldings', h._row, rec);
  });
  return n;
}

// ---------------------------------------------------------------- portal (founder) ----------------
function foInvBundle_() {
  const S = foInvSettings_(), snap = foInvSnapshot_(), meta = PropertiesService.getScriptProperties().getProperty('FO_MARKETS_META');
  return {
    holdings: foRows_('InvHoldings').map(foInvClean_), txns: foRows_('InvTxns').map(foInvClean_), accounts: foRows_('InvAccounts').map(foInvClean_),
    orders: foRows_('InvOrders').slice(-400).map(foInvClean_), fills: foRows_('InvFills').slice(-800).map(foInvClean_), watch: foRows_('InvWatch').map(foInvClean_),
    ipos: foRows_('InvIpos').map(foInvClean_), daily: foRows_('InvDaily').slice(-90).map(foInvClean_),
    profile: S.profile ? JSON.parse(S.profile) : null, goals: S.goals ? JSON.parse(S.goals) : [], bullion_live: S.bullion_live ? JSON.parse(S.bullion_live) : null,
    key: meta ? JSON.parse(meta) : null, snapshot: snap, risk_defaults: FO_INV.RISK, disclaimer: FO_INV.DISCLAIMER,
    strategies: foInvStrategies_(), control: foInvJson_(S.model_control, null), daily_email: S.daily_email !== 'off', engine_seen: foInvJson_(S.engine_seen, null),
  };
}
function foInvHoldingSave_(b, user) {
  const h = b.holding || {}, kind = String(h.kind || '');
  if (FO_INV.KINDS.indexOf(kind) < 0) return { ok: false, error: 'Pick what kind of investment this is.' };
  const name = String(h.name || '').trim().slice(0, 120); if (!name) return { ok: false, error: 'Give it a name.' };
  const rec = {
    kind, name, symbol: foInvSym_(h.symbol), fund_code: String(h.fund_code || '').replace(/\D/g, '').slice(0, 10), units: h.units === '' || h.units == null ? '' : foInvNum_(h.units),
    avg_cost: h.avg_cost === '' || h.avg_cost == null ? '' : foInvNum_(h.avg_cost), invested: h.invested === '' || h.invested == null ? '' : foInvNum_(h.invested),
    start_date: /^\d{4}-\d{2}-\d{2}$/.test(h.start_date || '') ? h.start_date : '', rate_pct: h.rate_pct === '' || h.rate_pct == null ? '' : foInvNum_(h.rate_pct),
    compounding: ['yearly', 'half-yearly', 'quarterly', 'monthly', 'simple'].indexOf(h.compounding) >= 0 ? h.compounding : '',
    maturity_date: /^\d{4}-\d{2}-\d{2}$/.test(h.maturity_date || '') ? h.maturity_date : '', monthly_amount: h.monthly_amount === '' || h.monthly_amount == null ? '' : foInvNum_(h.monthly_amount),
    current_value: h.current_value === '' || h.current_value == null ? '' : foInvNum_(h.current_value), value_date: /^\d{4}-\d{2}-\d{2}$/.test(h.value_date || '') ? h.value_date : '',
    purity: String(h.purity || '').slice(0, 6), account: String(h.account || '').slice(0, 60), goal: String(h.goal || '').slice(0, 60), notes: String(h.notes || '').slice(0, 500),
    status: h.status === 'closed' ? 'closed' : 'active',
    sip_amount: h.sip_amount === '' || h.sip_amount == null ? '' : foInvNum_(h.sip_amount), sip_day: h.sip_day === '' || h.sip_day == null ? '' : Math.round(foInvNum_(h.sip_day)),
  };
  if (rec.sip_amount !== '' && FO_INV.SIP_KINDS.indexOf(kind) < 0) return { ok: false, error: 'Automatic monthly investing works for funds, stocks, ETFs, PPF, EPF, NPS, bonds and cash.' };
  if (rec.sip_amount !== '' && !(rec.sip_day >= 1 && rec.sip_day <= 28)) return { ok: false, error: 'Pick the SIP day of the month (1 to 28).' };
  for (const k of ['units', 'avg_cost', 'invested', 'rate_pct', 'current_value', 'monthly_amount', 'sip_amount']) if (rec[k] !== '' && (!isFinite(rec[k]) || rec[k] < 0)) return { ok: false, error: 'Check the number in "' + k.replace('_', ' ') + '".' };
  if ((kind === 'stock' || kind === 'etf') && !rec.symbol) return { ok: false, error: 'Add the NSE symbol (for example RELIANCE or GOLDBEES).' };
  if (kind === 'mf' && !rec.fund_code) return { ok: false, error: 'Add the AMFI scheme code (6 digits, shown on your statement or on amfiindia.com).' };
  if (['stock', 'etf', 'mf', 'gold', 'silver', 'sgb'].indexOf(kind) >= 0 && !(rec.units > 0)) return { ok: false, error: kind === 'gold' || kind === 'silver' ? 'Add the weight in grams.' : 'Add how many units you hold.' };
  if (['fd', 'rd', 'ppf', 'epf', 'nps', 'bond', 'cash', 'property', 'other'].indexOf(kind) >= 0 && !(rec.invested > 0) && !(rec.current_value > 0)) return { ok: false, error: 'Add the amount invested or its current value.' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const row = h.holding_id && foRows_('InvHoldings').find(x => x.holding_id === h.holding_id);
    // a new or changed monthly plan starts from the next due date (earlier ones are already in your numbers)
    rec.sip_last = rec.sip_amount === '' ? '' : row && String(row.sip_amount) === String(rec.sip_amount) && String(row.sip_day) === String(rec.sip_day) && row.sip_last ? row.sip_last : foToday_();
    if (row) { foUpdate_('InvHoldings', row._row, Object.assign({}, row, rec, { updated_at: foNow_(), updated_by: user.email })); foAudit_(user.email, 'inv_holding_update', row.holding_id, 'ok'); return { holding_id: row.holding_id }; }
    const id = foId_('IH'); foAppend_('InvHoldings', Object.assign(rec, { holding_id: id, created_at: foNow_(), updated_at: foNow_(), updated_by: user.email }));
    foAudit_(user.email, 'inv_holding_add', id + ' ' + kind, 'ok'); return { holding_id: id };
  } finally { lock.releaseLock(); }
}
function foInvTxnSave_(b, user) {
  const t = b.txn || {}, h = foRows_('InvHoldings').find(x => x.holding_id === t.holding_id); if (!h) return { ok: false, error: 'Holding not found.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) return { ok: false, error: 'Pick the date.' };
  const type = ['buy', 'sell', 'deposit', 'withdrawal', 'dividend', 'interest'].indexOf(t.type) >= 0 ? t.type : null; if (!type) return { ok: false, error: 'Pick the type.' };
  const amount = foInvNum_(t.amount); if (!(amount > 0)) return { ok: false, error: 'Add the amount in ₹.' };
  const id = foId_('IT');
  foAppend_('InvTxns', { txn_id: id, holding_id: h.holding_id, date: t.date, type, units: t.units === '' || t.units == null ? '' : foInvNum_(t.units), price: t.price === '' || t.price == null ? '' : foInvNum_(t.price), amount, note: String(t.note || '').slice(0, 200), created_at: foNow_(), created_by: user.email });
  return { txn_id: id };
}
function foInvAccountSave_(b, user) {
  const a = b.account || {}, name = String(a.name || '').trim().slice(0, 60); if (!name) return { ok: false, error: 'Name the paper account.' };
  const cash = foInvNum_(a.starting_cash || 1000000); if (!(cash >= 10000 && cash <= 1e9)) return { ok: false, error: 'Starting cash must be between ₹10,000 and ₹100 crore.' };
  const risk = {}; Object.keys(FO_INV.RISK).forEach(k => { const v = foInvNum_(a.risk && a.risk[k]); if (isFinite(v) && v > 0 && v <= 100) risk[k] = v; });
  const strategy = ['manual', 'model_top10', 'ipo', 'bullion', 'custom'].indexOf(a.strategy) >= 0 ? a.strategy : 'manual';
  const row = a.account_id && foRows_('InvAccounts').find(x => x.account_id === a.account_id);
  if (row) { if (row.strategy === 'autopilot' || row.strategy === 'rules') return { ok: false, error: 'The Model Autopilot account is run by the model.' }; foUpdate_('InvAccounts', row._row, Object.assign({}, row, { name, risk_json: JSON.stringify(risk), notes: String(a.notes || '').slice(0, 300), status: a.status === 'closed' ? 'closed' : 'active' })); return { account_id: row.account_id }; }
  const id = foId_('PA'); foAppend_('InvAccounts', { account_id: id, name, strategy, starting_cash: cash, benchmark: 'Nifty 500', risk_json: JSON.stringify(risk), created_at: foToday_(), status: 'active', notes: String(a.notes || '').slice(0, 300) });
  foAudit_(user.email, 'inv_paper_account', id, 'ok'); return { account_id: id };
}
/** Pre-trade risk check with the last marked state of the account (the engine re-checks at the fill). */
function foInvRiskCheck_(acc, o, snap) {
  const st = snap && snap.paper && snap.paper[acc.account_id]; if (!st || !st.equity || o.side !== 'buy') return null;
  let risk = {}; try { risk = JSON.parse(acc.risk_json || '{}'); } catch (e) {}
  const R = Object.assign({}, FO_INV.RISK, risk), eq = st.equity, px = (snap.prices[o.symbol] || {}).close || o.limit_price || 0, val = (o.type === 'sip' ? o.amount : o.qty * px) || 0;
  if (st.peak && eq < st.peak * (1 - R.dd_pause_pct / 100)) return 'Paused: this account is more than ' + R.dd_pause_pct + '% below its peak. Review it before new entries.';
  const pos = st.positions || [], cur = pos.filter(p => p.symbol === o.symbol).reduce((a, p) => a + (p.value || 0), 0);
  if ((cur + val) / eq > R.max_stock_pct / 100 + 1e-9) return 'Over the ' + R.max_stock_pct + '% per-stock limit (this order makes it ' + Math.round((cur + val) / eq * 100) + '%).';
  const m = snap.prices[o.symbol] || {};
  if (m.kind === 'stock' && m.sector) { const sv = pos.filter(p => p.sector === m.sector && p.kind === 'stock').reduce((a, p) => a + (p.value || 0), 0); if ((sv + val) / eq > R.max_sector_pct / 100 + 1e-9) return 'Over the ' + R.max_sector_pct + '% per-sector limit (' + m.sector + ').'; }
  if (m.kind === 'gold' || m.kind === 'silver') { const bv = pos.filter(p => p.kind === 'gold' || p.kind === 'silver').reduce((a, p) => a + (p.value || 0), 0); if ((bv + val) / eq > R.max_bullion_pct / 100 + 1e-9) return 'Over the ' + R.max_bullion_pct + '% gold + silver limit.'; }
  if (snap.regime && snap.regime.label === 'Risk-off') { const gross = pos.reduce((a, p) => a + (p.value || 0), 0); if ((gross + val) / eq > R.riskoff_gross_pct / 100 + 1e-9) return 'Risk-off market: gross exposure is capped at ' + R.riskoff_gross_pct + '%.'; }
  return null;
}
function foInvOrderPlace_(b, user) {
  const o = b.order || {}, acc = foRows_('InvAccounts').find(a => a.account_id === o.account_id && a.status !== 'closed');
  if (!acc) return { ok: false, error: 'Pick a paper account.' };
  if (acc.strategy === 'autopilot' || acc.strategy === 'rules') return { ok: false, error: 'This account is run by ' + (acc.strategy === 'rules' ? 'its strategy' : 'the model') + ' and trades on its own. Use another paper account.' };
  const sym = foInvSym_(o.symbol), type = FO_INV.ORDER_TYPES.indexOf(o.type) >= 0 ? o.type : null, side = o.side === 'sell' ? 'sell' : o.side === 'buy' ? 'buy' : null;
  if (!sym || !type || !side) return { ok: false, error: 'Symbol, side and order type are needed.' };
  const snap = foInvSnapshot_(); if (snap && snap.prices && !snap.prices[sym]) return { ok: false, error: sym + ' is not in the price data. Add it to your watchlist first; it is priced from the next daily run.' };
  const rec = { order_id: foId_('PO'), account_id: acc.account_id, symbol: sym, side, type, qty: type === 'sip' ? '' : Math.floor(foInvNum_(o.qty)), limit_price: '', trigger_price: '', trigger_dir: '', target: '', stop: '', amount: '', sip_day: '', validity: o.validity === 'gtc' ? 'gtc' : 'day', status: 'open', filled_qty: 0, note: '', origin: 'paper', parent: '', oco_with: '', last_sip: '', placed_at: foNow_(), updated_at: foNow_(), placed_by: user.email };
  if (type !== 'sip' && !(rec.qty >= 1)) return { ok: false, error: 'Quantity must be at least 1.' };
  if (type === 'limit' || type === 'sl') { rec.limit_price = foInvNum_(o.limit_price); if (!(rec.limit_price > 0)) return { ok: false, error: 'Add the limit price.' }; }
  if (type === 'sl' || type === 'sl-m' || type === 'gtt') { rec.trigger_price = foInvNum_(o.trigger_price); if (!(rec.trigger_price > 0)) return { ok: false, error: 'Add the trigger price.' }; }
  if (type === 'gtt') { rec.validity = 'gtc'; rec.trigger_dir = o.trigger_dir === 'above' ? 'above' : o.trigger_dir === 'below' ? 'below' : ''; if (o.limit_price) rec.limit_price = foInvNum_(o.limit_price); }
  if (type === 'sip') { rec.amount = foInvNum_(o.amount); rec.sip_day = Math.min(28, Math.max(1, Math.floor(foInvNum_(o.sip_day) || 1))); rec.validity = 'gtc'; if (!(rec.amount >= 100) || side !== 'buy') return { ok: false, error: 'A SIP buys a fixed amount (₹100 or more) every month.' }; }
  if (o.target || o.stop) { if (side !== 'buy') return { ok: false, error: 'Bracket targets and stops are for buy orders.' }; rec.target = o.target ? foInvNum_(o.target) : ''; rec.stop = o.stop ? foInvNum_(o.stop) : ''; const px = ((snap && snap.prices[sym]) || {}).close; if (px && ((rec.target && rec.target <= px) || (rec.stop && rec.stop >= px))) return { ok: false, error: 'The target must be above and the stop below the last close (' + px + ').' }; }
  const why = foInvRiskCheck_(acc, rec, snap); if (why) return { ok: false, error: why };
  foAppend_('InvOrders', rec); foAudit_(user.email, 'inv_paper_order', rec.order_id + ' ' + side + ' ' + sym, 'ok');
  return { order_id: rec.order_id, note: 'Paper order queued: it fills at the next trading day\'s open, from real NSE prices, after the evening run.' };
}
function foInvOrderCancel_(b, user) {
  const o = foRows_('InvOrders').find(x => x.order_id === b.order_id); if (!o) return { ok: false, error: 'Order not found.' };
  if (o.status !== 'open' && o.status !== 'partial') return { ok: false, error: 'Only open orders can be cancelled.' };
  foUpdate_('InvOrders', o._row, Object.assign({}, o, { status: 'cancelled', note: 'Cancelled by you.', updated_at: foNow_() })); return {};
}
function foInvWatchAdd_(b, user) {
  const kind = b.kind === 'mf' ? 'mf' : 'symbol', sym = kind === 'mf' ? String(b.symbol || '').replace(/\D/g, '').slice(0, 10) : foInvSym_(b.symbol);
  if (!sym) return { ok: false, error: kind === 'mf' ? 'Add the AMFI scheme code.' : 'Add the NSE symbol.' };
  if (foRows_('InvWatch').some(w => w.symbol === sym)) return { added: false };
  foAppend_('InvWatch', { symbol: sym, kind, note: String(b.note || '').slice(0, 120), added_at: foNow_() }); return { added: true };
}
function foInvWatchRemove_(b) { const w = foRows_('InvWatch').find(x => x.symbol === b.symbol); if (w) foDeleteRow_('InvWatch', w._row); return {}; }
/** IPO board entries (typed in from the RHP, exchange and GMP pages: the free plan has no licensed IPO feed). GMP is kept per source with a timestamp. */
function foInvIpoSave_(b, user) {
  const i = b.ipo || {}, name = String(i.name || '').trim().slice(0, 100); if (!name) return { ok: false, error: 'Name the IPO.' };
  const nums = ['price_low', 'price_high', 'lot', 'issue_size_cr', 'fresh_cr', 'ofs_cr', 'sub_qib', 'sub_bnii', 'sub_snii', 'sub_nii', 'sub_retail', 'sub_emp', 'sub_total', 'pe_post', 'peer_pe', 'rev_cagr', 'pat_cagr', 'roe', 'roce', 'de', 'anchor_cr', 'listing_open', 'listing_close'];
  const rec = { name, type: i.type === 'sme' ? 'sme' : 'mainboard', status: ['upcoming', 'open', 'closed', 'allotted', 'listed'].indexOf(i.status) >= 0 ? i.status : 'upcoming' };
  ['open', 'close', 'allotment', 'listing'].forEach(k => { rec[k] = /^\d{4}-\d{2}-\d{2}$/.test(i[k] || '') ? i[k] : ''; });
  for (const k of nums) { const v = i[k] === '' || i[k] == null ? '' : foInvNum_(i[k]); if (v !== '' && !isFinite(v)) return { ok: false, error: 'Check the number in ' + k.replace(/_/g, ' ') + '.' }; rec[k] = v; }
  let gmp = []; try { gmp = (Array.isArray(i.gmp) ? i.gmp : JSON.parse(i.gmp_json || '[]')).filter(g => g && isFinite(Number(g.gmp)) && g.source).slice(-200).map(g => ({ at: String(g.at || foNow_()).slice(0, 25), source: String(g.source).slice(0, 60), gmp: Number(g.gmp), kostak: g.kostak === '' || g.kostak == null ? null : Number(g.kostak) })); } catch (e) {}
  rec.gmp_json = JSON.stringify(gmp); rec.red_flags = String(i.red_flags || '').slice(0, 400); rec.anchor_names = String(i.anchor_names || '').slice(0, 300); rec.lead_managers = String(i.lead_managers || '').slice(0, 200); rec.notes = String(i.notes || '').slice(0, 800);
  rec.sub_history = String(i.sub_history || '').slice(0, 4000);
  const row = i.ipo_id && foRows_('InvIpos').find(x => x.ipo_id === i.ipo_id);
  if (row) { foUpdate_('InvIpos', row._row, Object.assign({}, row, rec, { updated_at: foNow_(), updated_by: user.email })); return { ipo_id: row.ipo_id }; }
  const id = foId_('IPO'); foAppend_('InvIpos', Object.assign(rec, { ipo_id: id, updated_at: foNow_(), updated_by: user.email })); return { ipo_id: id };
}
function foInvProfileSave_(b, user) {
  const p = b.profile || {}, answers = Array.isArray(p.answers) ? p.answers.slice(0, 10).map(x => Math.max(0, Math.min(4, Math.floor(Number(x) || 0)))) : [];
  const allowed = ['Conservative', 'Moderate', 'Balanced', 'Growth', 'Aggressive'];
  const rec = { answers, profile: allowed.indexOf(p.profile) >= 0 ? p.profile : 'Balanced', allocation: p.allocation && typeof p.allocation === 'object' ? p.allocation : null, at: foNow_() };
  foInvSettingSet_('profile', JSON.stringify(rec));
  if (Array.isArray(b.goals)) foInvSettingSet_('goals', JSON.stringify(b.goals.slice(0, 12).map(g => ({ name: String(g.name || '').slice(0, 60), target: foInvNum_(g.target) || 0, years: Math.max(1, Math.min(50, foInvNum_(g.years) || 10)), sip: foInvNum_(g.sip) || 0, start: foInvNum_(g.start) || 0, method: String(g.method || 'strategic_tilt').slice(0, 30) }))));
  foAudit_(user.email, 'inv_profile', rec.profile, 'ok'); return {};
}

// ---------------------------------------------------------------- strategy lab, rollback, settings, daily report ----------------
function foInvJson_(v, d) { try { return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function foInvStrategies_() { return foInvJson_(foInvSettings_().strategies, []); }
const FO_INV_FIELDS = ['technical', 'trend', 'momentum', 'volume', 'rsi14', 'adx14', 'vs_ema200', 'vs_ema50', 'ret_3m', 'ret_6m', 'supertrend', 'high52', 'deliv_pct', 'vol_ratio', 'ev_golden_cross', 'ev_high52_breakout', 'ev_donchian55', 'ev_supertrend_flip'];
function foInvRules_(list) {
  return (Array.isArray(list) ? list : []).slice(0, 8).map(c => ({ field: String(c.field), op: String(c.op), value: Number(c.value) }))
    .filter(c => FO_INV_FIELDS.indexOf(c.field) >= 0 && ['>', '<', '>=', '<=', '=='].indexOf(c.op) >= 0 && isFinite(c.value));
}
function foInvStrategySave_(b, user) {
  const x = b.strategy || {}, name = String(x.name || '').trim().slice(0, 60); if (!name) return { ok: false, error: 'Name the strategy.' };
  const entry = foInvRules_(x.entry), exit = foInvRules_(x.exit); if (!entry.length) return { ok: false, error: 'Add at least one entry rule.' };
  const list = foInvStrategies_(); if (!x.id && list.length >= 12) return { ok: false, error: 'Up to 12 strategies: delete one first.' };
  const rec = { id: x.id || foId_('ST'), name, entry, exit, top_n: Math.min(30, Math.max(1, Math.floor(Number(x.top_n) || 10))), max_hold: Math.min(250, Math.max(0, Math.floor(Number(x.max_hold) || 0))), updated_at: foNow_() };
  const i = list.findIndex(s => s.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec);
  foInvSettingSet_('strategies', JSON.stringify(list)); foAudit_(user.email, 'inv_strategy', rec.id, 'ok');
  return { id: rec.id, note: 'Saved: it is backtested in the next evening run.' };
}
function foInvStrategyDelete_(b, user) {
  if (foRows_('InvAccounts').some(a => a.rules_id === b.id && a.status !== 'closed')) return { ok: false, error: 'A paper account follows this strategy: close that account first.' };
  foInvSettingSet_('strategies', JSON.stringify(foInvStrategies_().filter(s => s.id !== b.id))); return {};
}
function foInvStrategyPaper_(b, user) {
  const st = foInvStrategies_().find(s => s.id === b.id); if (!st) return { ok: false, error: 'Strategy not found.' };
  if (foRows_('InvAccounts').some(a => a.rules_id === st.id && a.status !== 'closed')) return { ok: false, error: 'A paper account already follows this strategy.' };
  const id = foId_('PA'); foAppend_('InvAccounts', { account_id: id, name: st.name + ' (strategy)', strategy: 'rules', rules_id: st.id, starting_cash: 1000000, benchmark: 'Nifty 500', risk_json: '{}', created_at: foToday_(), status: 'active', notes: 'Trades the strategy rules every evening, next-day open fills.' });
  foAudit_(user.email, 'inv_strategy_paper', st.id + ' → ' + id, 'ok'); return { account_id: id, note: 'Paper account created: it starts trading the rules from the next evening run.' };
}
function foInvRollback_(b, user) {
  const v = String(b.version || '').slice(0, 60); if (!/^v\d[\w.-]*@\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: 'Pick a retired model version.' };
  foInvSettingSet_('model_control', JSON.stringify({ rollback_to: v, at: foNow_(), by: user.email })); foAudit_(user.email, 'inv_model_rollback', v, 'ok');
  return { note: 'Rollback queued: the engine switches the champion to ' + v + ' in its next run.' };
}
function foInvSettingsSave_(b, user) {
  if (b.daily_email != null) foInvSettingSet_('daily_email', b.daily_email ? 'on' : 'off');
  return {};
}
/** 18:00 one-page summary (spec 6 daily report), once per trading day. */
function foInvDailyEmail_(s, done) {
  if (foInvSettings_().daily_mail_last === s.asof) return;
  const P = (x, d) => x == null ? '–' : (x * 100).toFixed(d == null ? 1 : d) + '%', R = x => x == null ? '–' : '₹' + Math.round(x).toLocaleString('en-IN');
  const esc = t => String(t == null ? '' : t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const top = (s.top || []).slice(0, 10).map(t => '<tr><td>' + t.rank + '</td><td><b>' + esc(t.symbol) + '</b></td><td>' + Math.round(t.composite) + '</td><td>' + P(t.ml_prob, 0) + '</td><td>' + esc((t.reasons || []).map(r => r.text).join('; ')) + '</td></tr>').join('');
  const b = s.bullion || {}, g = b.today && b.today.gold999, auto = (s.paper || {})['PA-AUTOPILOT'], m = s.model || {}, r = s.regime || {};
  const ipos = foRows_('InvIpos').filter(i => i.status === 'open' || i.status === 'upcoming').map(i => esc(i.name) + ' (' + esc(i.status) + ')').join(', ') || 'none on your board';
  const html = '<div style="font-family:Arial,sans-serif;max-width:640px"><h2 style="color:#0F4D3A">Markets · ' + esc(s.asof) + '</h2>' +
    '<p><b>' + esc(r.label || 'Neutral') + '</b> market · Nifty 50 ' + esc(r.nifty) + ' · breadth ' + esc(r.breadth) + '% · India VIX ' + esc(r.vix) + '</p>' +
    '<table cellpadding="4" style="border-collapse:collapse;font-size:13px"><tr style="background:#E7EFEA"><th>#</th><th>Stock</th><th>Score</th><th>P(top 20%)</th><th>Why</th></tr>' + top + '</table>' +
    '<p>Gold 24K: ' + (g ? R(g * 10) + ' per 10 g' : '–') + ' · Silver: ' + (b.silver999 ? R(b.silver999.last) + ' per kg' : '–') + ' (IBJA, excl. GST)</p>' +
    '<p>Model Autopilot (paper): ' + (auto && auto.equity ? R(auto.equity) + ', return ' + P(auto.stats && auto.stats.total_return) : 'not started') + '</p>' +
    '<p>IPOs: ' + ipos + '</p>' + (done && (done.ipos || done.sips) ? '<p>Updated for you today: ' + [done.ipos ? done.ipos + ' IPO board change' + (done.ipos > 1 ? 's' : '') : '', done.sips ? done.sips + ' SIP / contribution' + (done.sips > 1 ? 's' : '') + ' posted' : ''].filter(String).join(' · ') + '</p>' : '') +
    ((s.news || []).length ? '<p><b>In the news (your companies)</b></p><ul>' + s.news.slice(0, 8).map(x => '<li><b>' + esc(x.symbol) + '</b>: <a href="' + esc(x.url) + '">' + esc(x.title) + '</a> <small>(' + esc(x.source) + ')</small></li>').join('') + '</ul>' : '') + '<p>Model health: <b>' + esc(m.light || '–') + '</b> · ' + esc(m.note || '') + '</p>' +
    '<p style="color:#777;font-size:12px">' + FO_INV.DISCLAIMER + ' <a href="https://www.apvillasandresorts.in/founder/#/investments">Open Investments</a> · turn this email off in Investments → Settings.</p></div>';
  try { MailApp.sendEmail({ to: PropertiesService.getScriptProperties().getProperty('FO_FOUNDER_EMAIL'), subject: 'Markets ' + s.asof + ' · ' + (r.label || 'Neutral') + ' · top: ' + (s.top || []).slice(0, 3).map(t => t.symbol).join(', '), htmlBody: html, body: 'Markets summary for ' + s.asof + '. ' + FO_INV.DISCLAIMER }); foInvSettingSet_('daily_mail_last', s.asof); } catch (e) {}
}
