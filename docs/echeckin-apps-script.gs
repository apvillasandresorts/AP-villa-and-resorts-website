/**
 * AP Villas & Resorts — E-Check-in receiver (Google Apps Script, free).
 * Paste this into Extensions → Apps Script of the Google Sheet "AP Villas E-Check-in", then deploy as a web app.
 * Every submission from www.apvillasandresorts.in/checkin.html becomes one row in the "E-Check-in" tab,
 * and the ID photos are saved in a private Google Drive folder (one sub-folder per check-in).
 * You also get an email for each new check-in. Setup steps: docs/echeckin-setup.md
 */
const SHEET_ID = '15Q47OsFicp6svW2OtIzLDV15mKYiEO2ppuZUkiCmfwg';   // the "AP Villas E-Check-in" Google Sheet
const SHEET_NAME = 'E-Check-in';
const FOLDER_NAME = 'AP Villas E-Check-in IDs';
const NOTIFY_EMAIL = '';
// ---- Welcome email to the guest (sent from this Google account after every successful check-in) ----
const SITE = 'https://www.apvillasandresorts.in';
const CARETAKER = { name: 'Mahesh Kumar', phone: 'CARETAKER_PHONE', wa: 'CARETAKER_WA' };   // real number is set only in the Google script (this repo is public)   // help at the villa
const OWNER = { name: 'Apoorv Singh', phone: '+91 89990 61598', wa: '918999061598' };               // bookings, payments, decisions
// Wi-Fi per villa: fill in { name: 'NETWORK', password: 'PASSWORD' }. Empty = "your caretaker will share it on arrival".
const WIFI = {
  'Divinestay': null, 'AP Suite': null, 'Om Shanti Stay': null, 'Villa Aranya': null, 'Rudrangan Suites': null,
};
const ADDRESS = { 'Rudrangan Suites': 'Kesar Parisar, 53, Indore Rd, near Anjushree, Pawapuri Colony, Ujjain, Madhya Pradesh 456010' };
const MENU = [
  ['Breakfast', [['Tea', 25], ['Coffee', 30], ['Bread Toast', 40], ['Poha', 50], ['Samosa', 25], ['Kachori', 25]]],
  ['Main Course', [['Dal Fry', 160], ['Dal Makhni', 200], ['Jeera Aloo', 180], ['Mix Veg', 220], ['Chole Masala', 220], ['Bhindi Masala', 200], ['Paneer Butter Masala', 250], ['Matar Paneer', 250]]],
  ['Breads', [['Tawa Roti', 20], ['Butter Roti', 25], ['Naan', 70], ['Garlic Naan', 90], ['Aloo Paratha', 90], ['Paneer Paratha', 120]]],
  ['Rice', [['Plain Rice', 100], ['Jeera Rice', 120], ['Shahi Pulao', 160], ['Veg Biryani', 280]]],
  ['Salad & Chaat', [['Onion Salad', 40], ['Green Salad', 60], ['Aloo Chaat', 100], ['Peanut Chaat', 120]]],
  ['Indian Favourites', [['Pav Bhaji', 150], ['Dosa', 180], ['Idli Sambhar', 180], ['Chole Bhature', 150], ['Gobi Manchurian', 180], ['Hakka Noodles', 180], ['Veg Crispy Burger', 160]]],
];
const MENU_IMAGE = SITE + '/images/menu/ap-residency-menu.jpg';

// stored as text so leading zeros survive (ID 0482, PIN, booking IDs, phone numbers)
const TEXT_KEYS = ['id_last4', 'phone', 'pincode', 'booking_id', 'payment_ref', 'vehicle_number', 'passport_no', 'visa_no'];   // leave empty to email the Google account that owns this script

// [key sent by the website, column title in the sheet]
const COLUMNS = [
  ['submitted_at', 'Submitted at'], ['ref', 'Reference'],
  ['booking_source', 'Booked through'], ['booking_id', 'Booking ID'], ['villa', 'Villa'],
  ['checkin_date', 'Check-in'], ['arrival_time', 'Arrival time'], ['checkout_date', 'Check-out'], ['nights', 'Nights'],
  ['adults', 'Adults'], ['children', 'Children'], ['arrival_mode', 'Coming by'], ['vehicle_number', 'Vehicle'],
  ['guest_name', 'Main guest'], ['phone', 'Mobile'], ['email', 'Email'], ['age', 'Age'], ['gender', 'Gender'],
  ['address', 'Address'], ['city', 'City'], ['state', 'State'], ['pincode', 'PIN'], ['nationality', 'Nationality'],
  ['country', 'Passport country'], ['passport_no', 'Passport no.'], ['visa_no', 'Visa no.'], ['visa_expiry', 'Visa valid until'],
  ['india_arrival', 'Arrived in India'], ['coming_from', 'Coming from'], ['next_destination', 'Next destination'],
  ['members', 'Other guests (name, age, gender, relation)'],
  ['id_type', 'ID type'], ['id_last4', 'ID last 4'], ['id_files', 'ID files (Drive)'],
  ['payment_status', 'Payment status'], ['total_amount', 'Total ₹'], ['amount_paid', 'Amount paid ₹'], ['balance_due', 'Balance due ₹'],
  ['payment_timing', 'When paid'], ['payment_mode', 'Paid through'], ['payment_ref', 'Payment ref'], ['payment_date', 'Paid on'],
  ['purpose', 'Purpose'], ['heard_from', 'Found us via'], ['first_visit', 'First visit to Ujjain'], ['requests', 'Special requests'],
  ['consent_data', 'Data consent'], ['consent_offers', 'Offers on WhatsApp'], ['signature', 'Signature (typed)'],
  ['payment_proof', 'Payment screenshot'], ['booking_voucher', 'Booking voucher'],   // files are in the guest's Drive folder
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'score' || body.action === 'coupon') return json_(gamePost_(body));   // Mahakal game (see the end of this file)
    if (body.website) return json_({ ok: true });                  // spam trap
    const f = body.fields || {};
    if (!f.guest_name || !f.phone || !f.checkin_date) return json_({ ok: false, error: 'Missing required details' });
    const ref = String(body.ref || ('ECI-' + Date.now())).replace(/[^A-Z0-9-]/gi, '').slice(0, 30);

    // ID files → private Drive folder
    const parent = folder_(DriveApp.getRootFolder(), FOLDER_NAME);
    const sub = folder_(parent, ref + ' ' + String(f.guest_name).slice(0, 40));
    const links = (body.files || []).slice(0, 20).map((file, i) => {
      const blob = Utilities.newBlob(Utilities.base64Decode(file.data), file.type || 'image/jpeg', `${ref}_${file.label || 'file'}_${i + 1}_${file.name || ''}`.slice(0, 120));
      return sub.createFile(blob).getUrl();
    });

    // one row in the sheet
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      const sheet = sheet_();
      const row = COLUMNS.map(([k]) => k === 'submitted_at' ? new Date() : k === 'ref' ? ref : k === 'id_files' ? (links.length ? sub.getUrl() : '') : TEXT_KEYS.includes(k) && f[k] ? "'" + String(f[k]).slice(0, 100) : clean_(f[k]));
      sheet.appendRow(row);
    } finally { lock.releaseLock(); }

    // email the owner
    try {
      const to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
      MailApp.sendEmail(to, `New e-check-in: ${f.guest_name} · ${f.villa} · ${f.checkin_date}`,
        `${f.guest_name} (${f.phone})\n${f.villa}: ${f.checkin_date} → ${f.checkout_date}, ${f.adults} adults, ${f.children || 0} children\n` +
        `Booked through: ${f.booking_source} ${f.booking_id || ''}\nPayment: ${f.payment_status || ''} ${f.amount_paid ? '₹' + f.amount_paid + ' paid' : ''} ${f.balance_due ? '· balance ₹' + f.balance_due : ''}\nID: ${f.id_type} ending ${f.id_last4}, ${links.length} file(s): ${sub.getUrl()}\nReference: ${ref}`);
    } catch (mailErr) { /* email is optional */ }

    // welcome email to the guest, only once the check-in is safely saved
    try { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.email || '').trim())) guestEmail_(f, ref); } catch (guestErr) { /* never block the check-in */ }

    return json_({ ok: true, ref });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function guestEmail_(f, ref) {
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = d => { if (!d) return ''; const t = new Date(d + 'T00:00:00'); return Utilities.formatDate(t, 'Asia/Kolkata', 'EEE, d MMM yyyy'); };
  const inr = n => n ? '₹' + Number(n).toLocaleString('en-IN') : '';
  const first = String(f.guest_name || '').trim().split(/\s+/)[0] || 'ji';
  const wifi = WIFI[f.villa];
  const gold = '#B88A2C', green = '#1F4D3A', muted = '#6B6458';
  const h = t => `<h2 style="font:600 20px Georgia,serif;color:${green};margin:28px 0 10px">${t}</h2>`;
  const row = (k, v) => v ? `<tr><td style="padding:6px 12px 6px 0;color:${muted};font-size:14px;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 0;font-size:15px;color:#1E1B16"><b>${v}</b></td></tr>` : '';
  const menu = MENU.map(([cat, items]) => `<tr><td colspan="2" style="padding:14px 0 4px;font:600 15px Georgia,serif;color:${gold}">${cat}</td></tr>` +
    items.map(([n, p]) => `<tr><td style="padding:3px 0;font-size:14px;color:#1E1B16;border-bottom:1px dotted #E6DCC6">${n}</td><td style="padding:3px 0;font-size:14px;text-align:right;color:#1E1B16;border-bottom:1px dotted #E6DCC6">₹${p}</td></tr>`).join('')).join('');
  const pay = [f.payment_status, f.amount_paid ? inr(f.amount_paid) + ' paid' : '', f.balance_due ? 'balance ' + inr(f.balance_due) : ''].filter(Boolean).join(' · ');
  const html = `<div style="background:#F6F1E7;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E6DCC6">
    <div style="background:${green};padding:22px 26px;text-align:center">
      <img src="${SITE}/assets/brand/logo-full-1200.png" alt="AP Villas &amp; Resorts" width="220" style="max-width:220px;background:#fff;border-radius:10px;padding:6px 10px">
      <div style="color:#E8C77A;font:italic 15px Georgia,serif;margin-top:10px">Where devotion feels at home</div>
    </div>
    <div style="padding:24px 26px 30px;color:#1E1B16;line-height:1.55">
      <p style="font-size:17px;margin:0 0 6px">Namaste ${esc(first)} 🙏</p>
      <p style="margin:0 0 4px">Your e-check-in is complete. Thank you! Everything you need for your stay is below.</p>
      <p style="margin:0;color:${muted};font-size:13px">Reference: <b style="color:#1E1B16">${esc(ref)}</b></p>

      ${h('Your stay')}
      <table style="border-collapse:collapse">${row('Villa', esc(f.villa))}${row('Address', esc(ADDRESS[f.villa] || ''))}
        ${row('Check-in', esc(day(f.checkin_date)) + ' · from 10:30 AM')}${row('Check-out', esc(day(f.checkout_date)) + ' · by 9:30 AM')}
        ${row('Nights', esc(f.nights))}${row('Guests', esc(f.adults) + ' adult(s)' + (Number(f.children) ? ', ' + esc(f.children) + ' child(ren)' : ''))}
        ${row('Booked through', esc(f.booking_source) + (f.booking_id ? ' · ' + esc(f.booking_id) : ''))}${row('Payment', esc(pay))}</table>
      <p style="font-size:13px;color:${muted};margin:8px 0 0">We keep one hour between guests for cleaning. A later check-out can be arranged on request, when the villa is free.</p>

      ${h('Wi-Fi')}
      <p style="margin:0">${wifi && wifi.name ? `Network: <b>${esc(wifi.name)}</b><br>Password: <b>${esc(wifi.password)}</b>` : 'High-speed Wi-Fi is available in your villa. Your caretaker will share the network name and password when you arrive.'}</p>

      ${h('Who to call')}
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:10px;background:#FBF6EA;border-radius:10px;vertical-align:top">
          <b style="color:${green}">${CARETAKER.name} · Caretaker</b><br><a href="tel:${CARETAKER.phone.replace(/\s/g, '')}" style="color:#B5532A;font-size:16px;font-weight:bold">${CARETAKER.phone}</a> · <a href="https://wa.me/${CARETAKER.wa}" style="color:#177A40">WhatsApp</a><br>
          <span style="font-size:13px;color:${muted}">For anything at the villa: arrival and keys, Wi-Fi, housekeeping, maintenance and Bhasma Aarti help.</span></td></tr>
        <tr><td style="height:8px"></td></tr>
        <tr><td style="padding:10px;background:#F3F6F4;border-radius:10px;vertical-align:top">
          <b style="color:${green}">${OWNER.name} · Owner</b><br><a href="tel:${OWNER.phone.replace(/\s/g, '')}" style="color:#B5532A;font-size:16px;font-weight:bold">${OWNER.phone}</a> · <a href="https://wa.me/${OWNER.wa}" style="color:#177A40">WhatsApp</a><br>
          <span style="font-size:13px;color:${muted}">For food orders, bookings, payments, changes to your stay and any decision you need from us.</span></td></tr>
      </table>

      ${h('Included &amp; on request')}
      <ul style="padding-left:18px;margin:0">
        <li><b>Bhasma Aarti guidance:</b> your caretaker explains the booking process (online or at the counter) on your arrival evening. The temple permit itself is booked by you.</li>
        <li><b>Food in your villa:</b> order from the menu below by calling or WhatsApp-ing ${OWNER.name} (${OWNER.phone}), or cook in your villa's kitchen.</li>
        <li><b>Travel:</b> Indore airport pickup (sedan from ₹2,500), Omkareshwar day trip (SUV from ₹5,500) and local temple tours. These are indicative prices; WhatsApp ${OWNER.name} for a confirmed quote. <a href="${SITE}/travel.html" style="color:#B5532A">See all trips</a></li>
      </ul>

      ${h('In-villa dining menu')}
      <table style="border-collapse:collapse;width:100%">${menu}</table>
      <p style="margin:14px 0 0"><a href="${MENU_IMAGE}"><img src="${MENU_IMAGE}" alt="AP Villas dining menu" width="560" style="width:100%;max-width:560px;border-radius:10px;border:1px solid #E6DCC6"></a></p>
      <p style="font-size:13px;color:${muted};margin:6px 0 0">To order food, call or WhatsApp ${OWNER.name} (${OWNER.phone}).</p>

      ${h('Good to know')}
      <ul style="padding-left:18px;margin:0;font-size:14px">
        <li>Check-in 10:30 AM · check-out 9:30 AM.</li>
        <li>Cancellation: on standard dates free up to 7 days before arrival. Festival dates (Mahashivratri, Shravan Mondays, Kumbh/Simhastha) are non-refundable.</li>
        <li>Pets are welcome. The villas are wheelchair friendly, with a lift and power backup.</li>
        <li>Full policies: <a href="${SITE}/policies.html" style="color:#B5532A">${SITE.replace('https://', '')}/policies.html</a></li>
      </ul>

      <p style="margin:28px 0 0">We look forward to hosting you near Mahakal. Har Har Mahadev! 🙏</p>
      <p style="margin:6px 0 0"><b>${OWNER.name}</b><br>AP Villas &amp; Resorts, Ujjain<br><a href="${SITE}" style="color:#B5532A">${SITE.replace('https://', '')}</a></p>
    </div>
  </div>
</div>`;
  const text = `Namaste ${first},\n\nYour e-check-in is complete (ref ${ref}).\n${f.villa}: ${day(f.checkin_date)} 10:30 AM to ${day(f.checkout_date)} 9:30 AM.\n` +
    `Caretaker ${CARETAKER.name}: ${CARETAKER.phone} (anything at the villa). Owner ${OWNER.name}: ${OWNER.phone} (food orders, bookings, payments).\n` +
    `Wi-Fi: ${wifi && wifi.name ? wifi.name + ' / ' + wifi.password : 'your caretaker will share it on arrival'}.\nMenu: ${MENU_IMAGE}\nPolicies: ${SITE}/policies.html\n\nHar Har Mahadev!\nAP Villas & Resorts`;
  MailApp.sendEmail({ to: String(f.email).trim(), subject: `Your stay at ${f.villa}, ${day(f.checkin_date)} · AP Villas & Resorts`, htmlBody: html, body: text, name: 'AP Villas & Resorts', replyTo: 'apvillasandresorts@gmail.com' });
}

/** Run from the editor to send yourself a sample welcome email. */
function testGuestEmail() {
  guestEmail_({ guest_name: 'Test Guest', email: Session.getEffectiveUser().getEmail(), villa: 'Rudrangan Suites', checkin_date: '2026-11-14', checkout_date: '2026-11-16', nights: '2', adults: '4', children: '1', booking_source: 'Booking.com', booking_id: '4523119876', payment_status: 'Partly paid (advance)', amount_paid: '3000', balance_due: '7400' }, 'ECI-SAMPLE');
}

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'leaderboard') return json_({ ok: true, top: gameTop_() });
  return json_({ ok: true, service: 'AP Villas e-check-in' });
}

function sheet_() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(COLUMNS.map(c => c[1]));
  if (sh.getLastColumn() < COLUMNS.length) sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS.map(c => c[1])]);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold').setBackground('#F3EEE3');
  return sh;
}
function folder_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function clean_(v) { const s = v == null ? '' : String(v).slice(0, 1000); return /^[=+\-@]/.test(s) ? "'" + s : s; }   // stop formula injection
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Run once from the editor to grant permissions and create the sheet header + Drive folder. */
function setup() { sheet_(); folder_(DriveApp.getRootFolder(), FOLDER_NAME); }

// ---- Mahakal game (www.apvillasandresorts.in/mahakal-game.html): public top-10 leaderboard + coupon log ----
// Everything goes to the "Game" tab of this Sheet. Only the top-10 names and scores are ever sent back to the website.
// To check a guest's coupon: search the code in the Game tab (Type = Coupon). Delete a row to remove it from the board.
const GAME_SHEET = 'Game';
const GAME_COLS = ['Time', 'Type', 'Name', 'Player ID', 'Score', 'Discount %', 'Coupon', 'Waves cleared', 'Bosses beaten', 'Seconds played', 'Result'];
const BAD_NAMES = /fuck|shit|bitch|cunt|dick|porn|nigg|chut|lund|lavde|madarc|bhosd|gaand|randi|behenc/i;
function gameSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(GAME_SHEET) || ss.insertSheet(GAME_SHEET);
  if (sh.getLastRow() === 0) { sh.appendRow(GAME_COLS); sh.setFrozenRows(1); sh.getRange(1, 1, 1, GAME_COLS.length).setFontWeight('bold').setBackground('#F3EEE3'); }
  return sh;
}
function gamePost_(b) {
  const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  const score = num(b.score, 60000), secs = num(b.secs, 36000), waves = num(b.waves, 9), bosses = num(b.bosses, 3), pct = num(b.pct, 30);
  const pid = String(b.pid || '').replace(/[^a-z0-9]/gi, '').slice(0, 16);
  const result = clean_(String(b.result || '').slice(0, 60));
  if (secs < 20 || score > secs * 160 + 3000) return { ok: false, error: 'Score not accepted' };   // a simple sanity check against made-up scores
  const sh = gameSheet_();
  if (b.action === 'coupon') {
    const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
    if (!/^MAHAKAL([5-9]|[12][0-9]|30)-[A-Z0-9]{5}$/.test(code)) return { ok: false };
    sh.appendRow([new Date(), 'Coupon', '', pid, score, pct, code, waves, bosses, secs, result]);
    return { ok: true };
  }
  const name = String(b.name || '').replace(/[^\p{L}\p{M}\p{N} .'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (name.length < 2) return { ok: false, error: 'Please enter your name (2–16 letters).' };
  if (BAD_NAMES.test(name.replace(/[^a-z]/gi, ''))) return { ok: false, error: 'Please choose another name.' };
  if (score < 100) return { ok: false, error: 'Score 100 or more to join the leaderboard.' };
  sh.appendRow([new Date(), 'Leaderboard', clean_(name), pid, score, pct, '', waves, bosses, secs, result]);
  return { ok: true, top: gameTop_() };
}
function gameTop_() {
  const sh = gameSheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const rows = sh.getRange(2, 1, n, GAME_COLS.length).getValues(), best = {};
  rows.forEach(r => {
    if (r[1] !== 'Leaderboard') return;
    const key = String(r[3] || r[2]), sc = Number(r[4]) || 0;   // one place per player (their best score)
    if (!best[key] || sc > best[key].s) best[key] = { n: String(r[2]), s: sc, w: Number(r[7]) || 0, b: Number(r[8]) || 0, t: r[0] instanceof Date ? r[0].getTime() : 0 };
  });
  return Object.values(best).sort((a, c) => c.s - a.s || a.t - c.t).slice(0, 10).map(x => ({ n: x.n, s: x.s, w: x.w, b: x.b }));
}
