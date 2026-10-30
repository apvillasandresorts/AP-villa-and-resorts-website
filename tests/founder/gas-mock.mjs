// In-memory stand-ins for the Google Apps Script services the Founder OS uses, so the real .gs files run under Node.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const signed = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
const toBuf = v => Buffer.from(Array.isArray(v) ? v.map(b => b & 255) : String(v), Array.isArray(v) ? undefined : 'utf8');

function pad(n, w = 2) { return String(n).padStart(w, '0'); }
function formatDate(date, tz, fmt) {
  const d = new Date(date.getTime() + 330 * 60000);   // Asia/Kolkata = UTC+5:30, no daylight saving
  const Y = d.getUTCFullYear(), M = d.getUTCMonth() + 1, D = d.getUTCDate(), h = d.getUTCHours(), m = d.getUTCMinutes(), s = d.getUTCSeconds();
  if (fmt === 'H') return String(h);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][M - 1];
  return fmt.replace("yyyy-MM-dd'T'HH:mm:ssXXX", `${Y}-${pad(M)}-${pad(D)}T${pad(h)}:${pad(m)}:${pad(s)}+05:30`)
    .replace("yyyy-MM-dd'T'HH:mm:ss", `${Y}-${pad(M)}-${pad(D)}T${pad(h)}:${pad(m)}:${pad(s)}`)
    .replace('yyyy-MM-dd', `${Y}-${pad(M)}-${pad(D)}`).replace('yyMMdd', `${String(Y).slice(2)}${pad(M)}${pad(D)}`)
    .replace('d MMM yyyy, h:mm a', `${D} ${MON} ${Y}, ${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`);
}

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { if (this.sh.onRead) this.sh.onRead(); const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.get(this.r + i, this.c + j)); out.push(row); } return out; }
  setValues(v) {
    if (v.length !== this.nr || v.some(r => r.length !== this.nc)) throw new Error(`setValues size mismatch ${v.length}x${v[0] && v[0].length} vs ${this.nr}x${this.nc}`);
    v.forEach((row, i) => row.forEach((x, j) => this.sh.set(this.r + i, this.c + j, x))); return this;
  }
  setValue(x) { this.sh.set(this.r, this.c, x); return this; }
  getValue() { return this.sh.get(this.r, this.c); }
  setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.cells = []; this.maxRows = 1000; }
  get(r, c) { const row = this.cells[r - 1]; const v = row ? row[c - 1] : undefined; return v === undefined ? '' : v; }
  set(r, c, v) {
    if (typeof v === 'string' && /^=/.test(v)) throw new Error('formula written to sheet: ' + v);
    if (typeof v === 'string' && v.startsWith("'")) v = v.slice(1);   // Sheets stores a leading apostrophe as "plain text" marker
    while (this.cells.length < r) this.cells.push([]);
    this.cells[r - 1][c - 1] = v; if (r > this.maxRows) this.maxRows = r;
  }
  getName() { return this.name; }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  getLastRow() { for (let i = this.cells.length; i > 0; i--) if ((this.cells[i - 1] || []).some(v => v !== '' && v !== undefined)) return i; return 0; }
  getLastColumn() { return this.cells.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(_, n) { this.maxRows += n; }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  setFrozenRows() {} setColumnWidth() {}
  deleteRow(r) { this.cells.splice(r - 1, 1); }
  appendRow(row) { const r = this.getLastRow() + 1; row.forEach((v, j) => this.set(r, j + 1, v)); }
  rows() { const head = this.cells[0] || []; return this.cells.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] === undefined ? '' : r[i]]))); }
}
class Spreadsheet {
  constructor(id, name) { this.id = id; this.name = name; this.sheets = [new Sheet('Sheet1')]; }
  getId() { return this.id; } getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  getSheets() { return this.sheets; }
}

export function makeEnv({ checkins = [], analytics = null, http = null } = {}) {
  let now = Date.parse('2026-10-16T06:30:00Z');   // 12:00 IST
  const clock = { now: () => now, advance: ms => { now += ms; } };
  const stats = { openById: 0, reads: 0 };
  const props = new Map(), cache = new Map(), mails = [], books = new Map(), files = new Map(), lock = { held: false };
  function blob(data, type, name) {
    const b = { data, type, name, getBytes: () => signed(Buffer.from(data, 'utf8')), getDataAsString: () => data, setName: n => { b.name = n; return b; },
      getAs: t => { if (t !== 'application/pdf') throw new Error('bad type'); return blob('%PDF ' + data.length, t, name); } };
    return b;
  }
  const folder = { getId: () => 'FOLDER1', createFile: b => { const id = 'F' + (files.size + 1); files.set(id, b); return { getId: () => id }; },
    getFoldersByName: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return folder; } }; }, createFolder: () => folder,
    getFiles: () => { const all = [...files.entries()]; let i = 0; return { hasNext: () => i < all.length, next: () => { const [id, b] = all[i++]; return { getDateCreated: () => new Date(b.created || now), setTrashed: () => { files.delete(id); } }; } }; } };
  const checkinSheet = new Sheet('E-Check-in');
  // UrlFetchApp: a handler(request) → { code, body } set per test (Search Console, the live site); default = permission not granted yet
  const net = { handler: http, calls: [] };
  const respond = r => { net.calls.push(r); const o = net.handler ? net.handler(r) : { code: 403, body: JSON.stringify({ error: { message: 'Request had insufficient authentication scopes.' } }) }; return { getResponseCode: () => o.code, getContentText: () => o.body }; };
  const ctx = {
    console, JSON, Math, Number, String, Array, Object, Boolean, RegExp, isFinite, isNaN, parseInt, parseFloat, Error, Set, Map, encodeURIComponent,
    Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => { props.set(k, String(v)); }, deleteProperty: k => { props.delete(k); },
      getProperties: () => Object.fromEntries(props),
    }) },
    CacheService: { getScriptCache: () => ({
      get: k => { const e = cache.get(k); if (!e || e.exp <= now) { cache.delete(k); return null; } return e.v; },
      put: (k, v, ttl = 600) => { cache.set(k, { v: String(v), exp: now + ttl * 1000 }); }, remove: k => { cache.delete(k); },
      putAll: (o, ttl = 600) => { Object.keys(o).forEach(k => cache.set(k, { v: String(o[k]), exp: now + ttl * 1000 })); },
      getAll: keys => { const r = {}; keys.forEach(k => { const e = cache.get(k); if (e && e.exp > now) r[k] = e.v; }); return r; },
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => !lock.held, waitLock: () => { if (lock.held) throw new Error('Lock timeout'); }, releaseLock: () => {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), sleep: () => {},
      DigestAlgorithm: { SHA_256: 'sha256' }, MacAlgorithm: { HMAC_SHA_256: 'sha256' },
      computeDigest: (alg, s) => signed(crypto.createHash(alg).update(toBuf(s)).digest()),
      computeHmacSha256Signature: (m, k) => signed(crypto.createHmac('sha256', toBuf(k)).update(toBuf(m)).digest()),
      computeHmacSignature: (alg, m, k) => signed(crypto.createHmac(alg, toBuf(k)).update(toBuf(m)).digest()),
      newBlob: (s, type, name) => blob(Array.isArray(s) ? Buffer.from(s).toString('latin1') : String(s), type, name), base64Decode: s => [...Buffer.from(String(s), 'base64')], base64DecodeWebSafe: s => signed(Buffer.from(String(s), 'base64url')),
      Charset: { UTF_8: 'utf8' },
      base64EncodeWebSafe: b => toBuf(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      formatDate,
    },
    SpreadsheetApp: {
      create: name => { const id = 'SS' + (books.size + 1); const s = new Spreadsheet(id, name); books.set(id, s); return s; },
      openById: id => { stats.openById++; const s = books.get(id); if (!s) throw new Error('no spreadsheet ' + id); return s; },
    },
    MailApp: { sendEmail: (a, subj, body) => { mails.push(typeof a === 'object' ? a : { to: a, subject: subj, body }); }, getRemainingDailyQuota: () => 100 },
    UrlFetchApp: { fetchAll: reqs => reqs.map(respond), fetch: (url, o) => respond(Object.assign({ url }, o || {})) },
    ScriptApp: { getOAuthToken: () => 'test-token', getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => { const t = { timeBased: () => t, everyHours: () => t, everyMinutes: () => t, create: () => t }; return t; } },
    sheet_: () => checkinSheet,
    ContentService: { MimeType: { TEXT: 'text/plain', ICAL: 'text/calendar', JSON: 'application/json' }, createTextOutput: t => { const o = { text: t, mime: '', setMimeType: m => { o.mime = m; return o; }, getContent: () => t }; return o; } },
    DriveApp: { createFolder: () => folder, getFolderById: () => folder, getFileById: id => ({ getBlob: () => files.get(id) }) },
    ...(analytics ? { AnalyticsData: analytics } : {}),
  };
  vm.createContext(ctx);
  vm.runInContext('Date.now = () => __now(); const __RealDate = Date; Date = class extends __RealDate { constructor(...a) { if (a.length) super(...a); else super(__now()); } static now() { return __now(); } };', Object.assign(ctx, { __now: () => now }));
  const root = new URL('../../', import.meta.url);
  const src = ['founder/metrics.js', 'founder/insights.js', 'founder/desk.js', 'docs/founder-os/FoCore.gs', 'docs/founder-os/FoData.gs', 'docs/founder-os/FoInsights.gs', 'docs/founder-os/FoMarket.gs', 'docs/founder-os/FoSearch.gs', 'docs/founder-os/FoSignals.gs', 'docs/founder-os/FoBrain.gs', 'docs/founder-os/FoPeople.gs', 'docs/founder-os/FoChannels.gs', 'docs/founder-os/FoInvest.gs'].map(f => readFileSync(new URL(f, root), 'utf8')).join('\n;\n');
  vm.runInContext(src + '\n;globalThis.__fo = { foApi_, foSetup, foHourly, foSyncCheckins_, foRows_, FO, foAuth_, foDailyIfDue_, foGa4_, foSettingSet_, foGsc_, foGscOpportunities_, foSeoCheckPage_, foSeoRanks_, foHealth_, foDeskHourly_, foCompRerank_, foSignalsImport_, foBrainContext_, foBrainScrub_, foBrainDailyBrief_, foBrainRankModels_, foBrainUnverified_, foBrainTidy_, foBrainProposals_, foCmSyncAvailability_, foCmIcal_, foCmHourly_, foCmEvidencePurge_ };', ctx);

  // the e-check-in tab, with the real column titles from docs/echeckin-apps-script.gs
  const head = ['Submitted at', 'Reference', 'Booked through', 'Booking ID', 'Villa', 'Check-in', 'Check-out', 'Nights', 'Adults', 'Children', 'Main guest', 'Mobile', 'Email', 'City', 'State',
    'Payment status', 'Total ₹', 'Amount paid ₹', 'Balance due ₹', 'Paid through', 'Payment ref', 'Paid on', 'Found us via'];
  checkinSheet.appendRow(head);
  const addCheckin = c => checkinSheet.appendRow(head.map(h => (c[h] === undefined ? '' : c[h])));
  checkins.forEach(addCheckin);

  props.set('FO_FOUNDER_EMAIL', 'founder@example.com');
  // every Apps Script request/trigger is a fresh execution: reset the per-execution memo before each call, like production
  const fresh = fn => (...args) => { vm.runInContext('FO_MEMO = { ss: null, tabs: {}, rows: {}, last: {}, dirty: false };', ctx); return fn(...args); };
  const raw = ctx.__fo, fo = {};
  Object.keys(raw).forEach(k => { fo[k] = typeof raw[k] === 'function' ? fresh(raw[k]) : raw[k]; });
  const api = body => JSON.parse(JSON.stringify(fo.foApi_(body)));
  const lastOtp = () => { const m = mails.filter(x => /sign-in code/.test(x.subject)).pop(); return m && (m.body.match(/code is (\d{6})/) || [])[1]; };
  const dataSheet = () => books.get(props.get('FO_DATA_ID'));
  const tab = name => dataSheet().getSheetByName(name).rows();

  async function login(pass = 'correct horse battery') {
    let r = api({ action: 'f.login.start', email: 'founder@example.com', passphrase: pass });
    if (!r.ok) throw new Error('start failed: ' + r.error);
    const v = api({ action: 'f.login.verify', challenge: r.challenge, otp: lastOtp(), newPassphrase: r.purpose === 'setup' ? pass : undefined });
    if (!v.ok) throw new Error('verify failed: ' + v.error);
    return v.token;
  }
  books.forEach = books.forEach;
  const countReads = () => { books.forEach(b => b.sheets.forEach(sh => { sh.onRead = () => { stats.reads++; }; })); };
  return { fo, api, net, clock, files, lock, stats, countReads, props, cache, mails, lastOtp, tab, dataSheet, checkinSheet, addCheckin, login, setUserRole(role) { const s = dataSheet().getSheetByName('Users'); s.set(2, 3, role); cache.clear(); } };
}
