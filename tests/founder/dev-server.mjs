// Local preview of the Founder OS: serves the site on http://localhost:3100 and answers /api with the REAL backend code
// (docs/founder-os/*.gs) running on in-memory Google services and SAMPLE data. Sign-in codes are printed here.
// node tests/founder/dev-server.mjs
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { makeEnv } from './gas-mock.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const SAMPLE = [   // fictional guests, for the local preview only
  ['2026-07-02', 'ECI-S1', 'Booking.com', 'BC-11001', 'Divinestay', '2026-07-18', '2026-07-21', 6, 2, 'Sample Guest A', '9000000001', 'Delhi', 'Delhi', 'Fully paid', 16500, 16500, 0, 'On the booking site', 'Booking.com'],
  ['2026-07-25', 'ECI-S2', 'Direct (WhatsApp / phone / website)', '', 'AP Suite', '2026-08-01', '2026-08-03', 2, 0, 'Sample Guest B', '9000000002', 'Indore', 'Madhya Pradesh', 'Partly paid (advance)', 8400, 3000, 5400, 'UPI', 'Google search'],
  ['2026-08-10', 'ECI-S3', 'Airbnb', 'HMSAMPLE1', 'Villa Aranya', '2026-08-15', '2026-08-18', 7, 1, 'Sample Guest C', '9000000003', 'Mumbai', 'Maharashtra', 'Fully paid', 17400, 17400, 0, 'On the booking site', 'Airbnb'],
  ['2026-09-01', 'ECI-S4', 'MakeMyTrip', 'NH7SAMPLE', 'Om Shanti Stay', '2026-09-05', '2026-09-07', 5, 0, 'Sample Guest D', '9000000004', 'Ahmedabad', 'Gujarat', 'Fully paid', 9000, 9000, 0, 'On the booking site', 'MakeMyTrip / Goibibo'],
  ['2026-09-20', 'ECI-S5', 'Direct (WhatsApp / phone / website)', '', 'Rudrangan Suites', '2026-10-02', '2026-10-05', 5, 1, 'Sample Guest B', '9000000002', 'Indore', 'Madhya Pradesh', 'Fully paid', 15600, 15600, 0, 'UPI', 'Stayed before'],
  ['2026-10-10', 'ECI-S6', 'Booking.com', 'BC-11002', 'Divinestay', '2026-10-15', '2026-10-18', 8, 0, 'Sample Guest E', '9000000005', 'Jaipur', 'Rajasthan', 'Partly paid (advance)', 16500, 5000, 11500, 'UPI', 'Google Maps'],
  ['2026-10-12', 'ECI-S7', 'Direct (WhatsApp / phone / website)', '', 'Not sure', '2026-10-24', '2026-10-26', 4, 2, 'Sample Guest F', '9000000006', 'Pune', 'Maharashtra', 'Pay on arrival (nothing paid yet)', 10400, 0, 10400, '', 'Instagram / Facebook'],
  ['2026-10-13', 'ECI-S8', 'Direct (WhatsApp / phone / website)', '', 'AP Suite', '2026-10-20', '2026-10-22', 2, 0, 'Test entry', '9999999999', '', '', 'Fully paid', 8400, 8400, 0, 'UPI', ''],
].map(r => ({ 'Submitted at': r[0] + 'T10:00:00', Reference: r[1], 'Booked through': r[2], 'Booking ID': r[3], Villa: r[4], 'Check-in': r[5], 'Check-out': r[6], Adults: r[7], Children: r[8], 'Main guest': r[9], Mobile: r[10], City: r[11], State: r[12], 'Payment status': r[13], 'Total ₹': r[14], 'Amount paid ₹': r[15], 'Balance due ₹': r[16], 'Paid through': r[17], 'Found us via': r[18], 'Paid on': r[0] }));

const env = makeEnv({ checkins: SAMPLE });
env.fo.foSetup();
// ~7 months of generated SAMPLE OTA history (local preview only) so trends, forecasts and finance views have data
{
  const tok = await env.login('local preview only phrase');
  const villas = ['Divinestay', 'AP Suite', 'Om Shanti Stay', 'Villa Aranya', 'Rudrangan Suites'], rows = [];
  const addD = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  let k = 0;
  for (let d = '2026-03-02'; d < '2026-12-20'; d = addD(d, 2)) {
    villas.forEach((v, i) => {
      const wd = new Date(d + 'T00:00:00Z').getUTCDay(), busy = wd === 5 || wd === 6 || (d >= '2026-07-30' && d <= '2026-08-28');
      if ((k++ * 7 + i * 3) % (busy ? 3 : 7) !== 0) return;
      if (d > '2026-11-15' && k % 3) return;
      rows.push({ external_id: 'SAMPLE-' + k, guest_name: 'Sample OTA guest ' + k, property: v, checkin: d, checkout: addD(d, 1 + (k % 3)), gross_amount: String((4500 + i * 400 + (busy ? 900 : 0)) * (1 + (k % 3))), created_at: addD(d, -(3 + (k % 25))), status: k % 11 === 0 ? 'Cancelled' : 'Confirmed' });
    });
  }
  env.api({ action: 'f.import.rows', token: tok, channel: 'Booking.com', file: 'sample-history.csv', rows });
  env.api({ action: 'f.expense.save', token: tok, expense: { date: '2026-09-30', category: 'staff', amount: 45000, property_id: 'all' } });
  env.api({ action: 'f.expense.save', token: tok, expense: { date: '2026-09-15', category: 'laundry', amount: 6000, property_id: 'all', basis: 'estimate' } });
  env.api({ action: 'f.logout', token: tok });
}
let shown = 0;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };

http.createServer((req, res) => {
  env.clock.advance(Math.max(0, Date.now() - env.clock.now()));   // follow real time (idle timeouts work as in production)
  if (req.method === 'POST' && req.url === '/api') {
    let body = ''; req.on('data', c => { body += c; if (body.length > 4e6) req.destroy(); });
    req.on('end', () => {
      let out; try { out = env.api(JSON.parse(body)); } catch (e) { out = { ok: false, error: 'bad request' }; }
      const mails = env.mails.slice(shown); shown = env.mails.length;
      mails.forEach(m => console.log('[mail to ' + m.to + '] ' + (m.subject || '') + ' :: ' + String(m.body || '').split('\n')[0]));
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
    });
    return;
  }
  let p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
}).listen(3100, () => console.log('Founder OS preview: http://localhost:3100/founder/  (login: founder@example.com + the local preview passphrase set in this file; codes print here)'));
