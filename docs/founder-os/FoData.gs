/**
 * AP Villas Founder OS · backend part 2: the canonical booking ledger.
 * One Bookings tab for every channel (e-check-in, Booking.com / Airbnb / MakeMyTrip CSV exports, WhatsApp / phone / manual entry).
 * Rules: idempotent upserts keyed on (channel, account, external booking ID) or the source record reference;
 * uncertain matches are flagged in Exceptions, never merged; amounts from a source are never overwritten silently;
 * every change is written to History. Payments and refunds are separate rows (cash ≠ booking value).
 */
const FO_ACTIVE = ['tentative', 'confirmed'];               // statuses that hold inventory
const FO_STATUSES = ['tentative', 'confirmed', 'cancelled', 'no_show', 'void'];
const FO_EDITABLE = ['external_id', 'channel', 'source_account', 'property_id', 'guest_name', 'created_at', 'checkin', 'checkout', 'adults', 'children', 'status',
  'gross_amount', 'discount', 'taxes', 'commission', 'retained_amount', 'acquisition_source', 'payment_channel', 'comms_channel', 'notes'];
const FO_MONEY = ['gross_amount', 'discount', 'taxes', 'commission', 'retained_amount'];

// ---------------------------------------------------------------- small helpers ----------------
function foNum_(v) { const n = Number(String(v == null ? '' : v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : 0; }
function foHasNum_(v) { return String(v == null ? '' : v).replace(/[₹,\s]/g, '') !== '' && isFinite(Number(String(v).replace(/[₹,\s]/g, ''))); }
function foDate_(v) {   // → YYYY-MM-DD or ''
  if (v instanceof Date) return Utilities.formatDate(v, FO.TZ, 'yyyy-MM-dd');
  const s = String(v || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);   // DD/MM/YYYY (India)
  const d = new Date(s); return s && !isNaN(d) ? Utilities.formatDate(d, FO.TZ, 'yyyy-MM-dd') : '';
}
function foNights_(a, b) { return a && b ? Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) : 0; }
function foChannel_(s) {
  s = String(s || '').toLowerCase();
  if (!s) return 'Unknown';
  if (/booking\.?com/.test(s)) return 'Booking.com';
  if (/airbnb/.test(s)) return 'Airbnb';
  if (/makemytrip|mmt/.test(s)) return 'MakeMyTrip';
  if (/goibibo/.test(s)) return 'Goibibo';
  if (/agoda/.test(s)) return 'Agoda';
  if (/walk/.test(s)) return 'Walk-in';
  if (/direct.*whatsapp|^whatsapp/.test(s) && !/phone|website/.test(s)) return 'Direct · WhatsApp';
  if (/^phone|direct.*phone/.test(s) && !/whatsapp|website/.test(s)) return 'Direct · Phone';
  if (/^website|direct.*website/.test(s) && !/whatsapp|phone/.test(s)) return 'Direct · Website';
  if (/direct|whatsapp|phone|website/.test(s)) return 'Direct';
  return 'Other';
}
function foPropertyId_(name, props) {
  const n = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!n) return '';
  const p = props.find(x => x.property_id.replace(/-/g, '') === n || x.name.toLowerCase().replace(/[^a-z]/g, '') === n)
    || props.find(x => n.indexOf(x.name.toLowerCase().replace(/[^a-z]/g, '')) >= 0 || x.name.toLowerCase().replace(/[^a-z]/g, '').indexOf(n) >= 0 && n.length >= 5);
  return p ? p.property_id : '';
}
function foDigits_(s) { return String(s || '').replace(/\D/g, '').slice(-10); }
function foHash_(o) { return foBytesHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(o))).slice(0, 16); }
function foLooksTest_(name) { return /\btest\b|dummy|sample|asdf|qwerty/i.test(String(name || '')); }
function foHistory_(booking_id, actor, action, detail) { foAppend_('History', { ts: foNow_(), booking_id, actor, action, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); }
function foException_(type, severity, booking_id, origin_ref, detail, data, existing) {
  // one open exception per (type, booking, source record): re-runs never pile up duplicates
  const key = type + '|' + (booking_id || '') + '|' + (origin_ref || '');
  if (existing && existing[key]) return false;
  foAppend_('Exceptions', { exception_id: foId_('EX'), type, severity, booking_id, origin_ref, detail, data: data ? JSON.stringify(data) : '', status: 'open', created_at: foNow_() });
  if (existing) existing[key] = true;
  return true;
}
function foOpenExceptionKeys_() {
  const o = {}; foRows_('Exceptions').forEach(e => { if (e.status === 'open') o[e.type + '|' + (e.booking_id || '') + '|' + (e.origin_ref || '')] = true; }); return o;
}

// ---------------------------------------------------------------- guests ----------------
function foGuestFor_(g, guests) {
  const ph = foDigits_(g.phone), em = String(g.email || '').trim().toLowerCase();
  let row = guests.find(x => (ph.length === 10 && foDigits_(x.phone) === ph) || (em && String(x.email).toLowerCase() === em));
  if (row) return row.guest_id;
  if (!g.name && !ph && !em) return '';
  const guest_id = foId_('G');
  const rec = { guest_id, name: g.name || '', phone: g.phone || '', email: em, city: g.city || '', state: g.state || '', first_seen: foToday_() };
  foAppend_('Guests', rec); guests.push(rec);
  return guest_id;
}

// ---------------------------------------------------------------- inventory ----------------
/** Bookings/blocks on the same villa that overlap [checkin, checkout). */
function foConflicts_(b, bookings, blocks) {
  if (!b.property_id || !b.checkin || !b.checkout || FO_ACTIVE.indexOf(b.status) < 0) return [];
  const out = [];
  bookings.forEach(x => { if (x.booking_id !== b.booking_id && x.property_id === b.property_id && FO_ACTIVE.indexOf(x.status) >= 0 && x.checkin < b.checkout && b.checkin < x.checkout) out.push({ kind: 'booking', id: x.booking_id, from: x.checkin, to: x.checkout, guest: x.guest_name, channel: x.channel }); });
  (blocks || []).forEach(x => { if (x.property_id === b.property_id && x.start < b.checkout && b.checkin < x.end) out.push({ kind: 'block', id: x.block_id, from: x.start, to: x.end, reason: x.reason }); });
  return out;
}

// ---------------------------------------------------------------- the one ingestion path (every source goes through here) ----------------
/**
 * rec: canonical fields + origin/origin_ref + optional payment {amount, date, method, reference} + guest {name, phone, email, city, state}
 * Returns 'created' | 'matched' | 'unchanged' | 'failed'.
 */
function foIngest_(rec, ctx) {
  const props = ctx.props, bookings = ctx.bookings;
  rec.channel = rec.channel || 'Unknown';
  rec.source_account = rec.source_account || '';
  rec.checkin = foDate_(rec.checkin); rec.checkout = foDate_(rec.checkout);
  if (!rec.checkin || !rec.checkout || rec.checkout <= rec.checkin) {
    foException_('failed_import', 'high', '', rec.origin_ref, 'Missing or impossible stay dates (' + (rec.checkin || '?') + ' → ' + (rec.checkout || '?') + ').', rec, ctx.ex);
    return 'failed';
  }
  const snapshot = { channel: rec.channel, external_id: rec.external_id || '', property: rec.property_name || '', checkin: rec.checkin, checkout: rec.checkout,
    adults: rec.adults || '', children: rec.children || '', status: rec.status || '', gross: rec.gross_amount === '' ? '' : String(rec.gross_amount),
    commission: rec.commission === undefined ? '' : String(rec.commission), paid: rec.payment ? String(rec.payment.amount) : '' };
  const hash = foHash_(snapshot);

  // 1) exact match: same source record, or same (channel, account, external ID)
  let match = bookings.find(x => rec.origin_ref && x.origin === rec.origin && x.origin_ref === rec.origin_ref);
  if (!match && rec.external_id) match = bookings.find(x => x.channel === rec.channel && x.source_account === rec.source_account && String(x.external_id).toLowerCase() === String(rec.external_id).toLowerCase());
  if (match) {
    if (match.origin === rec.origin && match.origin_ref === rec.origin_ref && match.source_hash === hash) return 'unchanged';
    if (match.origin_ref !== rec.origin_ref || match.origin !== rec.origin) {
      // a second record for a booking we already have (e.g. two guests checked in for one booking, or a repeated CSV)
      foException_('duplicate_attempt', 'low', match.booking_id, rec.origin_ref, 'Another ' + rec.origin + ' record carries the same booking ID ' + (rec.external_id || '') + '. It was not added again.', snapshot, ctx.ex);
      const amt = foHasNum_(rec.gross_amount) && foNum_(rec.gross_amount) !== foNum_(match.gross_amount);
      if (amt) foException_('amount_discrepancy', 'medium', match.booking_id, rec.origin_ref, 'Amount differs between records: ledger ₹' + foNum_(match.gross_amount) + ' vs ₹' + foNum_(rec.gross_amount) + '.', snapshot, ctx.ex);
      return 'matched';
    }
    // same source record changed since last import: never overwrite money or dates silently, ask the founder
    const old = match.source_hash ? JSON.parse(foSourceSnapshots_()[match.booking_id] || 'null') : null;
    foException_('source_changed', 'medium', match.booking_id, rec.origin_ref + '#' + hash, 'The source record changed after it was imported. Review and apply or keep the ledger values.', { before: old, after: snapshot, rec }, ctx.ex);
    return 'matched';
  }

  // 2) new booking
  const property_id = foPropertyId_(rec.property_name, props);
  const status = FO_STATUSES.indexOf(rec.status) >= 0 ? rec.status : 'confirmed';
  const b = {
    booking_id: foId_('APV'), external_id: rec.external_id || '', channel: rec.channel, source_account: rec.source_account, property_id,
    guest_id: foGuestFor_(rec.guest || {}, ctx.guests), guest_name: (rec.guest && rec.guest.name) || '',
    created_at: rec.created_at || '', created_basis: rec.created_basis || (rec.created_at ? 'source' : 'unknown'),
    checkin: rec.checkin, checkout: rec.checkout, nights: foNights_(rec.checkin, rec.checkout), adults: rec.adults || '', children: rec.children || '', status,
    gross_amount: foHasNum_(rec.gross_amount) ? foNum_(rec.gross_amount) : '', discount: foHasNum_(rec.discount) ? foNum_(rec.discount) : '',
    taxes: foHasNum_(rec.taxes) ? foNum_(rec.taxes) : '', commission: foHasNum_(rec.commission) ? foNum_(rec.commission) : '',
    commission_basis: foHasNum_(rec.commission) ? 'source' : '', retained_amount: '',
    acquisition_source: rec.acquisition_source || '', payment_channel: rec.payment_channel || '', comms_channel: rec.comms_channel || '',
    origin: rec.origin, origin_ref: rec.origin_ref || '', source_hash: hash, synced_at: foNow_(), updated_at: foNow_(), updated_by: ctx.actor, version: 1, notes: rec.notes || '',
  };
  foAppend_('Bookings', b); bookings.push(b);
  foAppend_('History', { ts: foNow_(), booking_id: b.booking_id, actor: ctx.actor, action: 'imported', detail: JSON.stringify({ origin: rec.origin, ref: rec.origin_ref, source: snapshot }) });
  if (rec.payment && foNum_(rec.payment.amount) > 0) {
    foAppend_('Payments', { payment_id: foId_('PAY'), booking_id: b.booking_id, date: foDate_(rec.payment.date) || '', type: 'payment', amount: foNum_(rec.payment.amount),
      method: rec.payment.method || '', reference: rec.payment.reference || '', origin: rec.origin, origin_ref: (rec.origin_ref || '') + ':paid', created_at: foNow_(), created_by: ctx.actor });
  }

  // 3) checks that need a human (flag, never auto-fix)
  if (!property_id) foException_('unknown_property', 'high', b.booking_id, rec.origin_ref, 'Villa "' + (rec.property_name || 'blank') + '" could not be matched. The booking is excluded from occupancy until a villa is set.', null, ctx.ex);
  if (!b.external_id && ['Booking.com', 'Airbnb', 'MakeMyTrip', 'Goibibo', 'Agoda'].indexOf(b.channel) >= 0) foException_('missing_source_id', 'medium', b.booking_id, rec.origin_ref, b.channel + ' booking without the platform booking ID, so a later import cannot be matched to it.', null, ctx.ex);
  if (b.gross_amount === '') foException_('missing_amount', 'medium', b.booking_id, rec.origin_ref, 'No booking amount recorded; revenue metrics will miss this stay.', null, ctx.ex);
  if (foLooksTest_(b.guest_name)) foException_('possible_test_record', 'low', b.booking_id, rec.origin_ref, 'Guest name "' + b.guest_name + '" looks like a test. Set the status to "void" if it is not a real stay.', null, ctx.ex);
  if (rec.check) rec.check(b, ctx);
  const c = foConflicts_(b, bookings, ctx.blocks);
  if (c.length) foException_('inventory_conflict', 'high', b.booking_id, rec.origin_ref, 'Overlaps ' + c.map(x => x.kind + ' ' + x.id + ' (' + x.from + ' → ' + x.to + ')').join(', ') + '.', c, ctx.ex);
  const dup = bookings.find(x => x.booking_id !== b.booking_id && x.status !== 'void' && x.property_id && x.property_id === b.property_id && x.checkin === b.checkin && x.checkout === b.checkout
    && (x.guest_id && x.guest_id === b.guest_id || String(x.guest_name).trim().toLowerCase() === String(b.guest_name).trim().toLowerCase()));
  if (dup) foException_('suspected_duplicate', 'high', b.booking_id, dup.booking_id, 'Same villa, dates and guest as ' + dup.booking_id + ' (' + dup.channel + '). Not merged: void one if they are the same stay.', null, ctx.ex);
  return 'created';
}
function foSourceSnapshots_() {   // booking_id → the snapshot JSON recorded when it was imported
  const o = {}; foRows_('History').forEach(h => { if (h.action === 'imported') { try { o[h.booking_id] = JSON.stringify(JSON.parse(h.detail).source); } catch (e) {} } }); return o;
}
function foCtx_(actor) {
  return { actor, props: foRows_('Properties'), bookings: foRows_('Bookings'), guests: foRows_('Guests'), blocks: foRows_('Blocks'), ex: foOpenExceptionKeys_() };
}

// ---------------------------------------------------------------- source 1: the e-check-in sheet (real guest data) ----------------
function foSyncCheckins_(actor) {
  const sh = sheet_(), data = sh.getDataRange().getValues(), head = data[0] || [];
  const col = t => head.indexOf(t), v = (r, t) => { const i = col(t); return i < 0 ? '' : r[i]; };
  const ctx = foCtx_(actor || 'system');
  const tally = { rows: 0, created: 0, matched: 0, unchanged: 0, failed: 0 };
  const exBefore = Object.keys(ctx.ex).length;
  for (let i = 1; i < data.length; i++) {
    const r = data[i], ref = String(v(r, 'Reference') || '').trim();
    if (!ref) continue;
    if (/^\s*TEST\s*[–—-]/.test(String(v(r, 'Main guest') || ''))) continue;   // test submissions (e.g. "TEST – please delete") never enter the ledger
    tally.rows++;
    const paid = foNum_(v(r, 'Amount paid ₹')), total = v(r, 'Total ₹'), bal = v(r, 'Balance due ₹'), pstatus = String(v(r, 'Payment status'));
    const submitted = v(r, 'Submitted at');
    const res = foIngest_({
      origin: 'echeckin', origin_ref: ref, channel: foChannel_(v(r, 'Booked through')), source_account: '',
      external_id: String(v(r, 'Booking ID') || '').replace(/^'/, '').trim(), property_name: String(v(r, 'Villa') || ''),
      checkin: v(r, 'Check-in'), checkout: v(r, 'Check-out'), adults: String(v(r, 'Adults') || ''), children: String(v(r, 'Children') || ''),
      status: 'confirmed', gross_amount: total === '' ? '' : String(total),
      created_at: submitted instanceof Date ? Utilities.formatDate(submitted, FO.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX") : String(submitted || ''),
      created_basis: 'proxy: e-check-in submitted',   // the real booking date is not on the check-in form
      acquisition_source: String(v(r, 'Found us via') || ''), payment_channel: String(v(r, 'Paid through') || ''), comms_channel: '',
      guest: { name: String(v(r, 'Main guest') || ''), phone: String(v(r, 'Mobile') || '').replace(/^'/, ''), email: String(v(r, 'Email') || ''), city: String(v(r, 'City') || ''), state: String(v(r, 'State') || '') },
      payment: paid > 0 ? { amount: paid, date: v(r, 'Paid on') || v(r, 'Check-in'), method: String(v(r, 'Paid through') || ''), reference: String(v(r, 'Payment ref') || '').replace(/^'/, '') } : null,
      check: (b, c) => {
        if (foHasNum_(total) && foHasNum_(bal) && Math.abs(foNum_(total) - paid - foNum_(bal)) > 1) foException_('amount_discrepancy', 'medium', b.booking_id, ref, 'Check-in form says total ₹' + foNum_(total) + ', paid ₹' + paid + ', balance ₹' + foNum_(bal) + ' (does not add up).', null, c.ex);
        if (/fully paid/i.test(pstatus) && foHasNum_(total) && paid + 1 < foNum_(total)) foException_('payment_discrepancy', 'medium', b.booking_id, ref, 'Marked "Fully paid" but only ₹' + paid + ' of ₹' + foNum_(total) + ' is recorded.', null, c.ex);
      },
    }, ctx);
    tally[res]++;
  }
  tally.exceptions = Object.keys(ctx.ex).length - exBefore;
  foAppend_('Imports', { import_id: foId_('IMP'), ts: foNow_(), source: 'E-Check-in sheet', file: 'E-Check-in tab', rows: tally.rows, created: tally.created, matched: tally.matched, unchanged: tally.unchanged, exceptions: tally.exceptions, failed: tally.failed, actor: actor || 'system', status: 'ok' });
  PropertiesService.getScriptProperties().setProperty('FO_LAST_SYNC', foNow_());
  try { foPruneSessions_(); } catch (e) {}
  return tally;
}
function foSyncNow_(b, user) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { const r = foSyncCheckins_(user.email); foAudit_(user.email, 'sync', JSON.stringify(r), 'ok'); return { result: r }; } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- source 2: CSV exports (Booking.com, Airbnb, MakeMyTrip…) mapped in the browser ----------------
function foImportRows_(b, user) {
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 2000) : [];
  const channel = foChannel_(b.channel) === 'Unknown' ? 'Other' : foChannel_(b.channel);
  const file = String(b.file || 'upload.csv').slice(0, 120), account = String(b.account || '').slice(0, 80);
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const ctx = foCtx_(user.email), exBefore = Object.keys(ctx.ex).length, tally = { rows: rows.length, created: 0, matched: 0, unchanged: 0, failed: 0 };
    rows.forEach((r, i) => {
      const ext = String(r.external_id || '').trim();
      const st = String(r.status || '').toLowerCase();
      const status = /cancel/.test(st) ? 'cancelled' : /no.?show/.test(st) ? 'no_show' : 'confirmed';
      tally[foIngest_({
        origin: 'csv:' + channel, origin_ref: ext ? channel + ':' + (account || '-') + ':' + ext : 'csv:' + file + ':' + (i + 1),
        channel, source_account: account, external_id: ext, property_name: r.property || '',
        checkin: r.checkin, checkout: r.checkout, adults: r.adults || '', children: r.children || '', status,
        gross_amount: r.gross_amount, commission: r.commission, taxes: r.taxes, discount: r.discount,
        created_at: foDate_(r.created_at) || '', created_basis: r.created_at ? 'source' : 'unknown',
        payment_channel: r.payment_channel || channel, guest: { name: r.guest_name || '', phone: r.phone || '', email: r.email || '' },
        payment: foNum_(r.paid) > 0 ? { amount: foNum_(r.paid), date: r.paid_on || r.checkin, method: channel + ' payout' } : null,
      }, ctx)]++;
      if (!ext) foException_('missing_source_id', 'medium', '', 'csv:' + file + ':' + (i + 1), 'Row ' + (i + 1) + ' has no booking ID, so re-importing this file will not recognise it.', null, ctx.ex);
    });
    tally.exceptions = Object.keys(ctx.ex).length - exBefore;
    foAppend_('Imports', { import_id: foId_('IMP'), ts: foNow_(), source: channel + ' CSV', file, rows: tally.rows, created: tally.created, matched: tally.matched, unchanged: tally.unchanged, exceptions: tally.exceptions, failed: tally.failed, actor: user.email, status: tally.failed ? 'partial' : 'ok' });
    foAudit_(user.email, 'import', channel + ' ' + file + ' ' + JSON.stringify(tally), 'ok');
    return { result: tally };
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- source 3: manual / WhatsApp / phone entry and edits ----------------
function foBookingSave_(req, user) {
  const inB = req.booking || {};
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ctx = foCtx_(user.email);
    const existing = inB.booking_id ? ctx.bookings.find(x => x.booking_id === inB.booking_id) : null;
    if (inB.booking_id && !existing) return { ok: false, error: 'Booking not found.' };
    if (existing && String(existing.version) !== String(inB.version)) return { ok: false, error: 'This booking was changed elsewhere. Reload and try again.', stale: true };
    const b = existing ? Object.assign({}, existing) : { booking_id: foId_('APV'), origin: 'manual', origin_ref: '', created_basis: 'entered', version: 0, commission_basis: '' };
    FO_EDITABLE.forEach(k => { if (inB[k] !== undefined) b[k] = typeof inB[k] === 'string' ? inB[k].trim().slice(0, 1000) : inB[k]; });
    b.checkin = foDate_(b.checkin); b.checkout = foDate_(b.checkout);
    if (!b.checkin || !b.checkout || b.checkout <= b.checkin) return { ok: false, error: 'Check-out must be after check-in.' };
    if (!ctx.props.some(p => p.property_id === b.property_id)) return { ok: false, error: 'Choose a villa.' };
    if (FO_STATUSES.indexOf(b.status) < 0) return { ok: false, error: 'Unknown status.' };
    for (const k of FO_MONEY) { if (b[k] !== '' && b[k] != null) { if (!foHasNum_(b[k]) || foNum_(b[k]) < 0) return { ok: false, error: k.replace('_', ' ') + ' must be a positive amount.' }; b[k] = foNum_(b[k]); } }
    if (!existing || String(existing.commission) !== String(b.commission)) b.commission_basis = foHasNum_(b.commission) ? 'entered' : '';
    b.nights = foNights_(b.checkin, b.checkout);
    b.created_at = b.created_at || foNow_();
    if (!existing) { b.channel = b.channel || 'Direct · WhatsApp'; b.guest_id = foGuestFor_({ name: inB.guest_name, phone: inB.guest_phone, email: inB.guest_email }, ctx.guests); }
    // inventory: hard stop for manual bookings (never double-book a villa)
    const c = foConflicts_(b, ctx.bookings, ctx.blocks);
    if (c.length) return { ok: false, error: 'This villa is already taken for those dates.', conflicts: c };
    b.updated_at = foNow_(); b.updated_by = user.email; b.version = Number(b.version || 0) + 1;
    const diff = {}; if (existing) FO_EDITABLE.concat(['nights']).forEach(k => { if (String(existing[k]) !== String(b[k])) diff[k] = [existing[k], b[k]]; });
    if (existing) { if (!Object.keys(diff).length) return { booking: b, unchanged: true }; foUpdate_('Bookings', existing._row, b); foHistory_(b.booking_id, user.email, 'edited', diff); }
    else { foAppend_('Bookings', b); foHistory_(b.booking_id, user.email, 'created', { channel: b.channel, property: b.property_id, checkin: b.checkin, checkout: b.checkout, gross: b.gross_amount }); }
    // manual entry can still be a duplicate of an imported booking: flag it
    const dup = ctx.bookings.find(x => x.booking_id !== b.booking_id && x.status !== 'void' && x.property_id === b.property_id && x.checkin === b.checkin && x.checkout === b.checkout);
    if (!existing && dup) foException_('suspected_duplicate', 'high', b.booking_id, dup.booking_id, 'Same villa and dates as ' + dup.booking_id + ' (' + dup.channel + ', ' + dup.guest_name + ').', null, ctx.ex);
    foAudit_(user.email, existing ? 'booking_edit' : 'booking_create', b.booking_id, 'ok');
    delete b._row; return { booking: b };
  } finally { lock.releaseLock(); }
}
function foBookingNote_(b, user) {
  const t = String(b.text || '').trim().slice(0, 1000); if (!t) return { ok: false, error: 'Write a note first.' };
  if (!foRows_('Bookings').some(x => x.booking_id === b.booking_id)) return { ok: false, error: 'Booking not found.' };
  foHistory_(b.booking_id, user.email, 'note', t); return {};
}
function foBookingHistory_(b) {
  return { history: foRows_('History').filter(h => h.booking_id === b.booking_id).map(h => { delete h._row; return h; }),
    payments: foRows_('Payments').filter(p => p.booking_id === b.booking_id).map(p => { delete p._row; return p; }) };
}

// ---------------------------------------------------------------- payments & refunds ----------------
function foPaymentAdd_(b, user) {
  const type = b.type === 'refund' ? 'refund' : 'payment', amount = foNum_(b.amount), date = foDate_(b.date) || foToday_();
  if (!(amount > 0)) return { ok: false, error: 'Enter an amount above zero.' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const bk = foRows_('Bookings').find(x => x.booking_id === b.booking_id); if (!bk) return { ok: false, error: 'Booking not found.' };
    const pays = foRows_('Payments').filter(p => p.booking_id === bk.booking_id);
    const paid = pays.filter(p => p.type === 'payment').reduce((s, p) => s + foNum_(p.amount), 0), refunded = pays.filter(p => p.type === 'refund').reduce((s, p) => s + foNum_(p.amount), 0);
    if (type === 'refund' && amount > paid - refunded + 0.5) return { ok: false, error: 'A refund cannot be more than what was collected (₹' + (paid - refunded) + ').' };
    const rec = { payment_id: foId_(type === 'refund' ? 'RF' : 'PAY'), booking_id: bk.booking_id, date, type, amount, method: String(b.method || '').slice(0, 60), reference: String(b.reference || '').slice(0, 80), origin: 'manual', origin_ref: '', created_at: foNow_(), created_by: user.email };
    foAppend_('Payments', rec);
    foHistory_(bk.booking_id, user.email, type, { amount, date, method: rec.method });
    const due = foNum_(bk.gross_amount) - foNum_(bk.discount);
    if (type === 'payment' && foHasNum_(bk.gross_amount) && paid + amount - refunded > due + 1) foException_('payment_discrepancy', 'medium', bk.booking_id, rec.payment_id, 'Collected ₹' + (paid + amount - refunded) + ' is more than the booking amount ₹' + due + '.', null, foOpenExceptionKeys_());
    foAudit_(user.email, type, bk.booking_id + ' ₹' + amount, 'ok');
    return { payment: rec };
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- maintenance / owner blocks ----------------
function foBlockSave_(b, user) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const blk = { block_id: foId_('BLK'), property_id: String(b.property_id || ''), start: foDate_(b.start), end: foDate_(b.end), reason: String(b.reason || 'Maintenance').slice(0, 120), created_at: foNow_(), created_by: user.email };
    if (!foRows_('Properties').some(p => p.property_id === blk.property_id)) return { ok: false, error: 'Choose a villa.' };
    if (!blk.start || !blk.end || blk.end <= blk.start) return { ok: false, error: 'The end date must be after the start date.' };
    const c = foConflicts_({ booking_id: '', property_id: blk.property_id, checkin: blk.start, checkout: blk.end, status: 'confirmed' }, foRows_('Bookings'), []);
    if (c.length) return { ok: false, error: 'Guests are booked in those dates.', conflicts: c };
    foAppend_('Blocks', blk); foAudit_(user.email, 'block_add', JSON.stringify(blk), 'ok'); return { block: blk };
  } finally { lock.releaseLock(); }
}
function foBlockDelete_(b, user) {
  const row = foRows_('Blocks').find(x => x.block_id === b.block_id); if (!row) return { ok: false, error: 'Not found.' };
  foDeleteRow_('Blocks', row._row); foAudit_(user.email, 'block_delete', b.block_id, 'ok'); return {};
}

// ---------------------------------------------------------------- reconciliation center ----------------
function foExceptionResolve_(b, user) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const e = foRows_('Exceptions').find(x => x.exception_id === b.exception_id); if (!e) return { ok: false, error: 'Not found.' };
    if (e.status !== 'open') return { ok: false, error: 'Already ' + e.status + '.' };
    const action = b.resolution === 'ignored' ? 'ignored' : 'resolved', note = String(b.note || '').slice(0, 500);
    if (b.apply === 'source' && e.type === 'source_changed') {   // founder chose the new source values
      const data = JSON.parse(e.data || '{}'), rec = data.rec || {}, bk = foRows_('Bookings').find(x => x.booking_id === e.booking_id);
      if (bk) {
        const before = {}; const after = { checkin: foDate_(rec.checkin), checkout: foDate_(rec.checkout), adults: rec.adults || bk.adults, children: rec.children || bk.children };
        if (foHasNum_(rec.gross_amount)) after.gross_amount = foNum_(rec.gross_amount);
        if (rec.external_id) after.external_id = rec.external_id;
        Object.keys(after).forEach(k => { before[k] = bk[k]; bk[k] = after[k]; });
        bk.nights = foNights_(bk.checkin, bk.checkout); bk.source_hash = String(e.origin_ref).split('#')[1] || bk.source_hash;
        bk.updated_at = foNow_(); bk.updated_by = user.email; bk.version = Number(bk.version || 0) + 1;
        foUpdate_('Bookings', bk._row, bk); foHistory_(bk.booking_id, user.email, 'applied_source_change', { before, after });
      }
    } else if (b.apply === 'keep' && e.type === 'source_changed') {
      const bk = foRows_('Bookings').find(x => x.booking_id === e.booking_id);
      if (bk) { bk.source_hash = String(e.origin_ref).split('#')[1] || bk.source_hash; foUpdate_('Bookings', bk._row, bk); foHistory_(bk.booking_id, user.email, 'kept_ledger_values', note); }
    }
    e.status = action; e.resolved_at = foNow_(); e.resolved_by = user.email; e.resolution = note || (b.apply ? 'apply ' + b.apply : action);
    foUpdate_('Exceptions', e._row, e);
    if (e.booking_id) foHistory_(e.booking_id, user.email, 'exception_' + action, e.type + (note ? ': ' + note : ''));
    foAudit_(user.email, 'exception_' + action, e.exception_id + ' ' + e.type, 'ok');
    return {};
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- settings ----------------
function foChannelSave_(b, user) {
  const ch = foRows_('Channels').find(x => x.channel === b.channel); if (!ch) return { ok: false, error: 'Unknown channel.' };
  for (const k of ['commission_pct', 'payment_fee_pct']) {
    if (b[k] === undefined) continue;
    const v = String(b[k]).trim();
    if (v !== '' && (!foHasNum_(v) || foNum_(v) < 0 || foNum_(v) > 60)) return { ok: false, error: 'Rates must be between 0 and 60%.' };
    ch[k] = v === '' ? '' : foNum_(v);
  }
  ch.notes = String(b.notes || ch.notes || '').slice(0, 200);
  foUpdate_('Channels', ch._row, ch); foAudit_(user.email, 'channel_rates', JSON.stringify(ch), 'ok'); return {};
}

// ---------------------------------------------------------------- everything the portal needs in one call ----------------
/**
 * The portal's data bundle. Cached on the server (CacheService, 1 hour) under the current data version: any write anywhere
 * changes the version (foTouch_/foFlush_), so a cached bundle is never stale; a cache hit avoids ~20 sheet reads.
 */
function foDataLoad_() {
  const p = PropertiesService.getScriptProperties(), key = 'FO_D_' + (p.getProperty('FO_DATA_VER') || '0');
  let d = FO_MEMO.dirty ? null : foCacheGet_(key), cached = !!d;
  if (!d) { d = foDataBuild_(); if (!FO_MEMO.dirty) foCachePut_(key, d); }
  d.serverTime = foNow_(); d.today = foToday_(); d.lastSync = p.getProperty('FO_LAST_SYNC') || ''; d.cached = cached;
  d.automation = typeof foAutomationStatus_ === 'function' ? foAutomationStatus_() : { active: false };
  return d;
}
function foCachePut_(key, obj, ttl) {
  try {
    const s = JSON.stringify(obj), size = 90000, n = Math.ceil(s.length / size), o = {};
    if (n > 40) return;   // > 3.6 MB: just rebuild each time
    for (let i = 0; i < n; i++) o[key + '_' + i] = s.slice(i * size, (i + 1) * size);
    o[key + '_n'] = String(n);
    CacheService.getScriptCache().putAll(o, ttl || 3600);
  } catch (e) {}
}
function foCacheGet_(key) {
  try {
    const c = CacheService.getScriptCache(), n = Number(c.get(key + '_n') || 0); if (!n) return null;
    const keys = []; for (let i = 0; i < n; i++) keys.push(key + '_' + i);
    const got = c.getAll(keys); let s = '';
    for (const k of keys) { if (got[k] == null) return null; s += got[k]; }
    return JSON.parse(s);
  } catch (e) { return null; }
}
/** Recommendations for the bundle: per property and night, the latest row and the latest made before today (for the daily-change limit and backtests). */
function foDeskRecsForBundle_() {
  const today = foToday_(), lo = FoMetrics.addDays(today, -180), hi = FoMetrics.addDays(today, 120), latest = {}, before = {};
  foRows_('Recommendations').forEach(r => {
    const d = String(r.for_date).slice(0, 10); if (d < lo || d > hi) return;
    const k = r.property + '|' + d; delete r._row;
    if (!latest[k] || r.computed_at > latest[k].computed_at) latest[k] = r;
    if (String(r.computed_at).slice(0, 10) < today && (!before[k] || r.computed_at > before[k].computed_at)) before[k] = r;
  });
  const out = Object.keys(latest).map(k => latest[k]);
  Object.keys(before).forEach(k => { if (before[k] !== latest[k]) out.push(before[k]); });
  return out;
}
function foDataBuild_() {
  const strip = r => { delete r._row; return r; };
  const ex = foRows_('Exceptions');
  return Object.assign({
    serverTime: foNow_(), today: foToday_(), lastSync: PropertiesService.getScriptProperties().getProperty('FO_LAST_SYNC') || '',
    properties: foRows_('Properties').map(strip), channels: foRows_('Channels').map(strip),
    bookings: foRows_('Bookings').map(strip), payments: foRows_('Payments').map(strip), blocks: foRows_('Blocks').map(strip),
    guests: foRows_('Guests').map(g => ({ guest_id: g.guest_id, name: g.name, city: g.city, state: g.state, first_seen: g.first_seen, phone: g.phone, email: g.email })),
    exceptions: ex.filter(e => e.status === 'open').concat(ex.filter(e => e.status !== 'open').slice(-100)).map(strip),
    imports: foRows_('Imports').slice(-50).map(strip),
    competitors: foRows_('Competitors').map(strip), market_rates: foRows_('MarketRates').slice(-1500).map(strip), demand_signals: foRows_('DemandSignals').slice(-600).map(strip),
    seo_keywords: foRows_('SeoKeywords').map(strip), seo_ranks: foRows_('SeoRanks').slice(-3000).map(strip), seo_topics: foRows_('SeoTopics').map(strip), campaigns: foRows_('Campaigns').map(strip),
    signals: foRows_('Signals').slice(-3000).map(strip), comp_set: foRows_('CompSet').map(strip), comp_changes: foRows_('CompChanges').slice(-200).map(strip),
    recommendations: foDeskRecsForBundle_(), price_decisions: foRows_('PriceDecisions').slice(-1500).map(strip),
  }, typeof foInsightsData_ === 'function' ? foInsightsData_() : {});
}
