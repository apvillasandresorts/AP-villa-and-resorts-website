/**
 * AP Villas & Resorts — E-Check-in receiver (Google Apps Script, free).
 * Paste this into Extensions → Apps Script of the Google Sheet "AP Villas E-Check-in", then deploy as a web app.
 * Every submission from www.apvillasandresorts.in/checkin.html becomes one row in the "E-Check-in" tab,
 * and the ID photos are saved in a private Google Drive folder (one sub-folder per check-in).
 * You also get an email for each new check-in. Setup steps: docs/echeckin-setup.md
 */
const SHEET_NAME = 'E-Check-in';
const FOLDER_NAME = 'AP Villas E-Check-in IDs';
const NOTIFY_EMAIL = '';   // leave empty to email the Google account that owns this script

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
  ['advance_paid', 'Advance paid'], ['advance_amount', 'Advance ₹'], ['payment_mode', 'Paid by'], ['payment_ref', 'Payment ref'], ['payment_date', 'Paid on'],
  ['total_amount', 'Total agreed ₹'], ['ota_payment', 'OTA payment'],
  ['purpose', 'Purpose'], ['heard_from', 'Found us via'], ['first_visit', 'First visit to Ujjain'], ['requests', 'Special requests'],
  ['consent_data', 'Data consent'], ['consent_offers', 'Offers on WhatsApp'], ['signature', 'Signature (typed)'],
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
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
      const row = COLUMNS.map(([k]) => k === 'submitted_at' ? new Date() : k === 'ref' ? ref : k === 'id_files' ? (links.length ? sub.getUrl() : '') : clean_(f[k]));
      sheet.appendRow(row);
    } finally { lock.releaseLock(); }

    // email the owner
    try {
      const to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
      MailApp.sendEmail(to, `New e-check-in: ${f.guest_name} · ${f.villa} · ${f.checkin_date}`,
        `${f.guest_name} (${f.phone})\n${f.villa}: ${f.checkin_date} → ${f.checkout_date}, ${f.adults} adults, ${f.children || 0} children\n` +
        `Booked through: ${f.booking_source} ${f.booking_id || ''}\nID: ${f.id_type} ending ${f.id_last4}, ${links.length} file(s): ${sub.getUrl()}\nReference: ${ref}`);
    } catch (mailErr) { /* email is optional */ }

    return json_({ ok: true, ref });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() { return json_({ ok: true, service: 'AP Villas e-check-in' }); }

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLUMNS.map(c => c[1]));
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold').setBackground('#F3EEE3');
  }
  return sh;
}
function folder_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function clean_(v) { const s = v == null ? '' : String(v).slice(0, 1000); return /^[=+\-@]/.test(s) ? "'" + s : s; }   // stop formula injection
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Run once from the editor to grant permissions and create the sheet header + Drive folder. */
function setup() { sheet_(); folder_(DriveApp.getRootFolder(), FOLDER_NAME); }
