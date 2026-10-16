// Runs the real Founder OS Apps Script code (docs/founder-os/*.gs) against in-memory Google services.
// node --test tests/founder/
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './gas-mock.mjs';

const MIN = 60000;
const CHECKINS = [
  { 'Submitted at': '2026-10-01T10:00:00', Reference: 'ECI-1', 'Booked through': 'Booking.com', 'Booking ID': '4523119876', Villa: 'Divinestay', 'Check-in': '2026-10-30', 'Check-out': '2026-11-02',
    Adults: 4, Children: 1, 'Main guest': 'Priya Sharma', Mobile: '9876543210', Email: 'priya@example.com', 'Payment status': 'Partly paid (advance)', 'Total ₹': 16500, 'Amount paid ₹': 5000, 'Balance due ₹': 11500, 'Paid through': 'UPI', 'Found us via': 'Google search' },
  { 'Submitted at': '2026-10-02T10:00:00', Reference: 'ECI-2', 'Booked through': 'Direct (WhatsApp / phone / website)', Villa: 'AP Suite', 'Check-in': '2026-10-20', 'Check-out': '2026-10-22',
    Adults: 2, 'Main guest': 'Test apoorv', Mobile: '9999999999', 'Payment status': 'Fully paid', 'Total ₹': 8400, 'Amount paid ₹': 8400, 'Balance due ₹': 0 },
  // second guest of the same Booking.com booking checked in separately → must NOT become a second booking
  { 'Submitted at': '2026-10-01T11:00:00', Reference: 'ECI-3', 'Booked through': 'Booking.com', 'Booking ID': '4523119876', Villa: 'Divinestay', 'Check-in': '2026-10-30', 'Check-out': '2026-11-02',
    Adults: 4, 'Main guest': 'Rahul Sharma', Mobile: '9876500000', 'Total ₹': 16000 },
  { 'Submitted at': '2026-10-03T10:00:00', Reference: 'ECI-4', 'Booked through': 'Airbnb', Villa: 'Not sure', 'Check-in': '2026-11-05', 'Check-out': '2026-11-07', 'Main guest': 'Asha Rao',
    'Payment status': 'Fully paid', 'Total ₹': 9000, 'Amount paid ₹': 4000, 'Balance due ₹': 2000 },
];
function ready(checkins = CHECKINS) { const env = makeEnv({ checkins }); env.fo.foSetup(); return env; }

// ---------------------------------------------------------------- security ----------------
test('setup: creates the private ledger, the founder user, villas and channels, without leaking secrets to the repo', () => {
  const env = ready();
  assert.equal(env.tab('Users').length, 1);
  assert.equal(env.tab('Users')[0].role, 'founder');
  assert.equal(env.tab('Properties').length, 5);
  assert.ok(env.props.get('FO_PEPPER').length > 40);
  assert.ok(env.tab('Channels').every(c => c.commission_pct === ''), 'commission rates are never guessed');
});

test('first sign-in: email code proves ownership, then a passphrase of 12+ characters is required', () => {
  const env = ready();
  const s = env.api({ action: 'f.login.start', email: 'founder@example.com' });
  assert.equal(s.ok, true); assert.equal(s.purpose, 'setup'); assert.match(s.to, /^fo•••@/);
  const otp = env.lastOtp(); assert.match(otp, /^\d{6}$/);
  let v = env.api({ action: 'f.login.verify', challenge: s.challenge, otp, newPassphrase: 'short' });
  assert.equal(v.ok, false); assert.equal(v.needPassphrase, true);
  v = env.api({ action: 'f.login.verify', challenge: s.challenge, otp, newPassphrase: 'correct horse battery' });
  assert.equal(v.ok, true); assert.ok(v.token.length > 60);
  const u = env.tab('Users')[0];
  assert.ok(u.pass_hash && !u.pass_hash.includes('correct'), 'only a salted, peppered hash is stored');
});

test('OTP is never stored in plain text, in the audit log, or anywhere but the email', async () => {
  const env = ready();
  await env.login();
  const s = env.api({ action: 'f.login.start', email: 'founder@example.com', passphrase: 'correct horse battery' });
  const otp = env.lastOtp();
  const cached = [...env.cache.entries()].map(([, e]) => e.v).join('|');
  assert.ok(!cached.includes(otp), 'cache holds only a keyed digest');
  assert.ok(!JSON.stringify(env.tab('Audit')).includes(otp));
  assert.ok(!JSON.stringify(s).includes(otp), 'the API never returns the code');
});

test('sign-in needs the passphrase AND a fresh email code; wrong passphrase reveals nothing', async () => {
  const env = ready(); await env.login();
  const bad = env.api({ action: 'f.login.start', email: 'founder@example.com', passphrase: 'wrong wrong wrong' });
  const unknown = env.api({ action: 'f.login.start', email: 'someone@example.com', passphrase: 'correct horse battery' });
  assert.equal(bad.ok, false); assert.equal(bad.error, unknown.error, 'same message for unknown email and wrong passphrase');
  const sent = env.mails.length;
  const ok = env.api({ action: 'f.login.start', email: 'founder@example.com', passphrase: 'correct horse battery' });
  assert.equal(ok.purpose, 'login'); assert.equal(env.mails.length, sent + 1);
});

test('OTP: expires after 5 minutes', async () => {
  const env = ready(); await env.login();
  const s = env.api({ action: 'f.login.start', email: 'founder@example.com', passphrase: 'correct horse battery' });
  const otp = env.lastOtp();
  env.clock.advance(5 * MIN + 1000);
  const v = env.api({ action: 'f.login.verify', challenge: s.challenge, otp });
  assert.equal(v.ok, false); assert.equal(v.restart, true);
});

test('OTP: one-time use (replay fails) and max 5 wrong tries', async () => {
  const env = ready(); await env.login();
  let s = env.api({ action: 'f.login.start', email: 'founder@example.com', passphrase: 'correct horse battery' });
  const otp = env.lastOtp();
  assert.equal(env.api({ action: 'f.login.verify', challenge: s.challenge, otp }).ok, true);
  const replay = env.api({ action: 'f.login.verify', challenge: s.challenge, otp });
  assert.equal(replay.ok, false, 'a used code cannot be replayed');

  s = env.api({ action: 'f.login.start', email: 'founder@example.com', passphrase: 'correct horse battery' });
  const good = env.lastOtp(), wrong = good === '000000' ? '111111' : '000000';
  for (let i = 1; i <= 4; i++) assert.match(env.api({ action: 'f.login.verify', challenge: s.challenge, otp: wrong }).error, new RegExp(`${5 - i} tries left`));
  assert.equal(env.api({ action: 'f.login.verify', challenge: s.challenge, otp: wrong }).restart, true);
  assert.equal(env.api({ action: 'f.login.verify', challenge: s.challenge, otp: good }).ok, false, 'challenge destroyed after 5 wrong tries');
});

test('OTP: resend has a cooldown and invalidates the old code', async () => {
  const env = ready(); await env.login();
  const s = env.api({ action: 'f.login.start', email: 'founder@example.com', passphrase: 'correct horse battery' });
  const first = env.lastOtp();
  assert.equal(env.api({ action: 'f.login.resend', challenge: s.challenge }).ok, false);
  env.clock.advance(61000);
  const r = env.api({ action: 'f.login.resend', challenge: s.challenge });
  assert.equal(r.ok, true);
  assert.equal(env.api({ action: 'f.login.verify', challenge: s.challenge, otp: first }).ok, false, 'old challenge is gone');
  assert.equal(env.api({ action: 'f.login.verify', challenge: r.challenge, otp: env.lastOtp() }).ok, true);
});

test('rate limits: repeated wrong passphrases pause sign-in and alert the founder; OTP emails are capped per hour', async () => {
  const env = ready(); await env.login();
  for (let i = 0; i < 8; i++) env.api({ action: 'f.login.start', email: 'founder@example.com', passphrase: 'nope nope nope' });
  const r = env.api({ action: 'f.login.start', email: 'founder@example.com', passphrase: 'correct horse battery' });
  assert.equal(r.ok, false); assert.match(r.error, /paused/);
  assert.ok(env.mails.some(m => /sign-in paused/.test(m.subject || '')));
  env.clock.advance(61 * MIN);
  let sends = 0;
  for (let i = 0; i < 10; i++) { if (env.api({ action: 'f.login.start', email: 'founder@example.com', passphrase: 'correct horse battery' }).ok) sends++; }
  assert.ok(sends <= 6, 'at most 6 codes per hour, got ' + sends);
});

test('sessions: protected APIs need a token; idle timeout; logout revokes server-side', async () => {
  const env = ready();
  assert.equal(env.api({ action: 'f.data' }).auth, false);
  assert.equal(env.api({ action: 'f.data', token: 'x'.repeat(80) }).auth, false);
  const token = await env.login();
  assert.equal(env.api({ action: 'f.data', token }).ok, true);
  env.clock.advance(31 * MIN);
  assert.equal(env.api({ action: 'f.data', token }).auth, false, 'idle for 30+ minutes signs out');
  const t2 = await env.login();
  assert.equal(env.api({ action: 'f.logout', token: t2 }).ok, true);
  assert.equal(env.api({ action: 'f.data', token: t2 }).auth, false, 'logged-out token is dead');
});

test('sessions: token rotates every 15 minutes; old token has a short grace then dies', async () => {
  const env = ready();
  const t1 = await env.login();
  env.clock.advance(16 * MIN);
  const r = env.api({ action: 'f.data', token: t1 });
  assert.ok(r.rotate && r.rotate !== t1);
  assert.equal(env.api({ action: 'f.data', token: t1 }).ok, true, 'grace for requests already in flight');
  env.clock.advance(3 * MIN);
  assert.equal(env.api({ action: 'f.data', token: t1 }).auth, false);
  assert.equal(env.api({ action: 'f.data', token: r.rotate }).ok, true);
});

test('sessions: "sign out everywhere" ends every session; 12-hour absolute limit', async () => {
  const env = ready();
  const a = await env.login(), b = await env.login();
  assert.equal(env.api({ action: 'f.logout.all', token: a }).ended, 2);
  assert.equal(env.api({ action: 'f.data', token: b }).auth, false);
  let t = await env.login();
  let alive = 0;
  for (let i = 0; i < 60; i++) { env.clock.advance(14 * MIN); const r = env.api({ action: 'f.sessions', token: t }); if (r.auth === false) break; alive += 14; if (r.rotate) t = r.rotate; }
  assert.ok(alive >= 11 * 60 && alive <= 12 * 60, 'an active session lasts up to 12 hours, lasted ' + alive + ' min');
  assert.equal(env.api({ action: 'f.data', token: t }).auth, false, 'no session lives past 12 hours');
});

test('roles: a viewer can read but cannot change bookings; unknown actions are refused', async () => {
  const env = ready(); const token = await env.login();
  env.setUserRole('viewer');
  assert.equal(env.api({ action: 'f.data', token }).ok, true);
  const w = env.api({ action: 'f.booking.save', token, booking: {} });
  assert.equal(w.ok, false); assert.match(w.error, /role/);
  assert.match(env.api({ action: 'f.delete.everything', token }).error, /Unknown/);
});

// ---------------------------------------------------------------- ingestion & reconciliation ----------------
test('e-check-in import: one booking per real stay, flags instead of guessing', () => {
  const env = ready();
  const b = env.tab('Bookings'), ex = env.tab('Exceptions');
  assert.equal(b.length, 3, 'ECI-3 is the same Booking.com booking as ECI-1');
  const types = ex.map(e => e.type).sort();
  assert.ok(types.includes('duplicate_attempt'));
  assert.ok(types.includes('possible_test_record'));
  assert.ok(types.includes('unknown_property'));
  assert.ok(types.includes('missing_source_id'), 'Airbnb booking without its code');
  assert.ok(types.includes('amount_discrepancy'), 'Total − paid ≠ balance, and ₹16,500 vs ₹16,000 between records');
  assert.ok(types.includes('payment_discrepancy'), '"Fully paid" but money missing');
  const bc = b.find(x => x.external_id === '4523119876');
  assert.equal(bc.channel, 'Booking.com'); assert.equal(bc.property_id, 'divinestay'); assert.equal(bc.nights, '3');
  assert.equal(bc.created_basis, 'proxy: e-check-in submitted');
  assert.equal(bc.acquisition_source, 'Google search', 'marketing source kept separate from booking channel');
  assert.equal(bc.payment_channel, 'UPI', 'payment channel kept separate too');
  assert.equal(env.tab('Payments').length, 3);
});

test('e-check-in import is idempotent: running it again changes nothing', () => {
  const env = ready();
  const before = { b: env.tab('Bookings').length, p: env.tab('Payments').length, e: env.tab('Exceptions').length };
  const r = env.fo.foSyncCheckins_('test');
  assert.equal(r.created, 0); assert.equal(r.unchanged, 3);
  assert.deepEqual({ b: env.tab('Bookings').length, p: env.tab('Payments').length, e: env.tab('Exceptions').length }, before);
});

test('a source record edited after import is never silently applied', async () => {
  const env = ready(); const token = await env.login();
  env.checkinSheet.set(2, 17, 18000);   // ECI-1 total changes 16500 → 18000
  env.fo.foSyncCheckins_('test');
  const bk = env.tab('Bookings').find(x => x.origin_ref === 'ECI-1');
  assert.equal(bk.gross_amount, '16500', 'ledger untouched');
  const e = env.tab('Exceptions').find(x => x.type === 'source_changed');
  assert.ok(e);
  env.fo.foSyncCheckins_('test');
  assert.equal(env.tab('Exceptions').filter(x => x.type === 'source_changed').length, 1, 're-runs do not pile up');
  assert.equal(env.api({ action: 'f.exception.resolve', token, exception_id: e.exception_id, apply: 'source', note: 'guest added a night' }).ok, true);
  assert.equal(env.tab('Bookings').find(x => x.origin_ref === 'ECI-1').gross_amount, '18000');
  assert.ok(env.tab('History').some(h => h.action === 'applied_source_change'));
  assert.equal(env.fo.foSyncCheckins_('test').created, 0);
  assert.equal(env.tab('Exceptions').filter(x => x.type === 'source_changed' && x.status === 'open').length, 0);
});

test('OTA CSV import: repeated file is matched, cancellations kept, rows without IDs flagged', async () => {
  const env = ready(); const token = await env.login();
  const rows = [
    { external_id: 'HMABC123', guest_name: 'Karan Mehta', property: 'Villa Aranya', checkin: '2026-12-24', checkout: '2026-12-27', gross_amount: '17400', commission: '2610', created_at: '2026-09-15', status: 'Confirmed' },
    { external_id: 'HMXYZ999', guest_name: 'Neha Gupta', property: 'Om Shanti Stay', checkin: '2026-11-10', checkout: '2026-11-12', gross_amount: '9000', created_at: '2026-10-01', status: 'Cancelled by guest' },
    { external_id: '', guest_name: 'No Id', property: 'AP Suite', checkin: '2027-01-02', checkout: '2027-01-03', gross_amount: '4200' },
  ];
  const a = env.api({ action: 'f.import.rows', token, channel: 'Airbnb', file: 'airbnb.csv', rows }).result;
  assert.equal(a.created, 3);
  const b = env.api({ action: 'f.import.rows', token, channel: 'Airbnb', file: 'airbnb.csv', rows: rows.slice(0, 2) }).result;
  assert.equal(b.created, 0); assert.equal(b.unchanged, 2);
  assert.equal(env.tab('Bookings').find(x => x.external_id === 'HMXYZ999').status, 'cancelled');
  assert.equal(env.tab('Bookings').find(x => x.external_id === 'HMABC123').commission_basis, 'source');
  assert.ok(env.tab('Exceptions').some(e => e.type === 'missing_source_id' && /Row 3/.test(e.detail)));
  assert.equal(env.tab('Imports').filter(i => /Airbnb/.test(i.source)).length, 2);
});

test('imported bookings that overlap are flagged as inventory conflicts (they already happened, so never rejected)', async () => {
  const env = ready(); const token = await env.login();
  env.api({ action: 'f.import.rows', token, channel: 'Booking.com', file: 'b.csv', rows: [{ external_id: 'BC1', guest_name: 'X', property: 'Divinestay', checkin: '2026-11-01', checkout: '2026-11-03', gross_amount: '11000' }] });
  assert.ok(env.tab('Exceptions').some(e => e.type === 'inventory_conflict'));
});

// ---------------------------------------------------------------- manual bookings, inventory, payments ----------------
test('manual/WhatsApp booking: created with history; overlapping dates refused; cancellation frees the villa', async () => {
  const env = ready(); const token = await env.login();
  const base = { channel: 'Direct · WhatsApp', property_id: 'villa-aranya', guest_name: 'Meera Joshi', guest_phone: '9811122233', checkin: '2026-11-14', checkout: '2026-11-16', status: 'confirmed', gross_amount: '11600' };
  const c = env.api({ action: 'f.booking.save', token, booking: base });
  assert.equal(c.ok, true); assert.equal(c.booking.nights, 2);
  const clash = env.api({ action: 'f.booking.save', token, booking: Object.assign({}, base, { checkin: '2026-11-15', checkout: '2026-11-17', guest_name: 'Other' }) });
  assert.equal(clash.ok, false); assert.equal(clash.conflicts[0].id, c.booking.booking_id);
  const edge = env.api({ action: 'f.booking.save', token, booking: Object.assign({}, base, { checkin: '2026-11-16', checkout: '2026-11-18', guest_name: 'Back to back' }) });
  assert.equal(edge.ok, true, 'check-out day is free for the next check-in');
  const cancel = env.api({ action: 'f.booking.save', token, booking: Object.assign({}, c.booking, { status: 'cancelled' }) });
  assert.equal(cancel.ok, true);
  assert.equal(env.api({ action: 'f.booking.save', token, booking: Object.assign({}, base, { checkin: '2026-11-15', checkout: '2026-11-16', guest_name: 'Now free' }) }).ok, true);
  const h = env.api({ action: 'f.booking.history', token, booking_id: c.booking.booking_id }).history;
  assert.deepEqual(h.map(x => x.action), ['created', 'edited']);
  assert.match(h[1].detail, /cancelled/);
});

test('manual booking: stale edits are refused (no lost updates); validation of dates, villa, amounts', async () => {
  const env = ready(); const token = await env.login();
  const c = env.api({ action: 'f.booking.save', token, booking: { property_id: 'ap-suite', guest_name: 'A', checkin: '2026-12-01', checkout: '2026-12-02', status: 'confirmed', gross_amount: '4200' } }).booking;
  env.api({ action: 'f.booking.save', token, booking: Object.assign({}, c, { notes: 'first edit' }) });
  assert.equal(env.api({ action: 'f.booking.save', token, booking: Object.assign({}, c, { notes: 'stale edit' }) }).stale, true);
  assert.match(env.api({ action: 'f.booking.save', token, booking: { property_id: 'ap-suite', checkin: '2026-12-05', checkout: '2026-12-05', status: 'confirmed' } }).error, /after check-in/);
  assert.match(env.api({ action: 'f.booking.save', token, booking: { property_id: 'nowhere', checkin: '2026-12-05', checkout: '2026-12-06', status: 'confirmed' } }).error, /villa/);
  assert.match(env.api({ action: 'f.booking.save', token, booking: { property_id: 'ap-suite', checkin: '2026-12-08', checkout: '2026-12-09', status: 'confirmed', gross_amount: '-5' } }).error, /positive/);
});

test('maintenance blocks: stop new bookings, and cannot be placed over guests', async () => {
  const env = ready(); const token = await env.login();
  assert.equal(env.api({ action: 'f.block.save', token, property_id: 'om-shanti-stay', start: '2026-12-10', end: '2026-12-12', reason: 'Painting' }).ok, true);
  const b = env.api({ action: 'f.booking.save', token, booking: { property_id: 'om-shanti-stay', guest_name: 'Z', checkin: '2026-12-11', checkout: '2026-12-13', status: 'confirmed' } });
  assert.equal(b.ok, false); assert.equal(b.conflicts[0].kind, 'block');
  assert.equal(env.api({ action: 'f.block.save', token, property_id: 'divinestay', start: '2026-10-31', end: '2026-11-01' }).ok, false, 'guests booked then');
});

test('payments and partial refunds: refunds can never exceed what was collected; overpayment is flagged', async () => {
  const env = ready(); const token = await env.login();
  const bk = env.tab('Bookings').find(x => x.origin_ref === 'ECI-1');   // ₹16,500, ₹5,000 paid
  assert.equal(env.api({ action: 'f.payment.add', token, booking_id: bk.booking_id, type: 'refund', amount: 6000 }).ok, false);
  assert.equal(env.api({ action: 'f.payment.add', token, booking_id: bk.booking_id, type: 'refund', amount: 2000, date: '2026-10-10' }).ok, true);
  assert.equal(env.api({ action: 'f.payment.add', token, booking_id: bk.booking_id, type: 'payment', amount: 14000, date: '2026-10-30', method: 'UPI' }).ok, true);
  assert.ok(env.tab('Exceptions').some(e => e.type === 'payment_discrepancy' && e.booking_id === bk.booking_id && /more than/.test(e.detail)));
  assert.equal(env.api({ action: 'f.payment.add', token, booking_id: bk.booking_id, amount: 0 }).ok, false);
});

test('exceptions can be resolved or ignored once, with an audit trail', async () => {
  const env = ready(); const token = await env.login();
  const e = env.tab('Exceptions').find(x => x.type === 'possible_test_record');
  assert.equal(env.api({ action: 'f.exception.resolve', token, exception_id: e.exception_id, resolution: 'ignored', note: 'real guest named Test' }).ok, true);
  assert.equal(env.api({ action: 'f.exception.resolve', token, exception_id: e.exception_id }).ok, false);
  assert.ok(env.tab('Audit').some(a => a.action === 'exception_ignored'));
});

test('no spreadsheet formula can be injected through guest-entered text', async () => {
  const env = ready(); const token = await env.login();
  const r = env.api({ action: 'f.booking.save', token, booking: { property_id: 'ap-suite', guest_name: '=IMPORTXML("http://evil")', notes: '+cmd', checkin: '2027-02-01', checkout: '2027-02-02', status: 'confirmed' } });
  assert.equal(r.ok, true);   // the mock throws if a cell starting with "=" is ever written
});

test('server errors are caught, logged and never leak internals', async () => {
  const env = ready(); const token = await env.login();
  const r = env.api({ action: 'f.payment.add', token, booking_id: { toString() { throw new Error('boom'); } }, amount: 5 });
  assert.equal(r.ok, false);
  assert.ok(!/boom/.test(r.error));
});
