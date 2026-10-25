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

// sample Search Console answers (shape of the real API) and a tiny sitemap, so the SEO pages can be previewed locally
const GSC_Q = [['hari har milan ujjain 2026 date', 2, 71, 8.2], ['ap villas', 3, 7, 1.2], ['hari har milan 2026 date', 0, 37, 9.1], ['kartik mela ujjain 2026 date', 0, 9, 11], ['mahakal evening aarti time', 0, 40, 14], ['महाकाल दर्शन टाइमिंग', 0, 7, 12], ['villa near mahakal', 1, 25, 6.5], ['ujjain family stay', 0, 12, 18]];
function devHttp(r) {
  if (/searchconsole/.test(r.url)) {
    const q = JSON.parse(r.payload), d = (q.dimensions || []).join(','), prev = q.endDate < '2026-10-01';
    const day = i => { const t = new Date(Date.parse(q.endDate) - i * 864e5).toISOString().slice(0, 10); return t; };
    const rows = d === '' ? [{ keys: [], clicks: prev ? 40 : 71, impressions: prev ? 800 : 1270, ctr: prev ? 0.05 : 0.056, position: prev ? 9.4 : 7.5 }]
      : d === 'date' ? Array.from({ length: 20 }, (_, i) => ({ keys: [day(i)], clicks: 1 + (i * 7) % 9, impressions: 30 + (i * 13) % 70, ctr: 0.05, position: 7 + (i % 4) }))
      : d === 'query' ? GSC_Q.map(x => ({ keys: [x[0]], clicks: x[1], impressions: x[2], ctr: x[1] / x[2], position: x[3] }))
      : d === 'page' ? [['/blog/ujjain-in-november-kartik.html', 3, 310, 6.1], ['/', 30, 220, 3.2], ['/villas.html', 12, 160, 5.4], ['/blog/mahakaleshwar-darshan-timings.html', 4, 140, 8.8]].map(x => ({ keys: ['https://www.apvillasandresorts.in' + x[0]], clicks: x[1], impressions: x[2], ctr: x[1] / x[2], position: x[3] }))
      : d === 'device' ? [{ keys: ['MOBILE'], clicks: 58, impressions: 1000, ctr: 0.058, position: 7 }, { keys: ['DESKTOP'], clicks: 13, impressions: 270, ctr: 0.048, position: 8.5 }]
      : d === 'country' ? [{ keys: ['ind'], clicks: 70, impressions: 1240, ctr: 0.056, position: 7.4 }]
      : d === 'query,page' ? [{ keys: ['hari har milan ujjain 2026 date', 'https://www.apvillasandresorts.in/blog/ujjain-in-november-kartik.html'], clicks: 2, impressions: 71, ctr: 0.028, position: 8.2 }] : [];
    return { code: 200, body: JSON.stringify({ rows }) };
  }
  if (/sitemap\.xml/.test(r.url)) return { code: 200, body: '<urlset>' + ['', 'villas.html', 'blog.html', 'contact.html'].map(p => '<url><loc>https://www.apvillasandresorts.in/' + p + '</loc></url>').join('') + '</urlset>' };
  if (/robots\.txt/.test(r.url)) return { code: 200, body: 'Sitemap: https://www.apvillasandresorts.in/sitemap.xml' };
  if (/apvillasandresorts\.in/.test(r.url)) { const p = r.url.replace(/^https:\/\/www\.apvillasandresorts\.in\//, ''); try { return { code: 200, body: readFileSync(new URL('../../' + (p || 'index.html'), import.meta.url), 'utf8') }; } catch (e) { return { code: 404, body: '' }; } }
  return { code: 404, body: '' };
}
const env = makeEnv({ checkins: SAMPLE, http: devHttp });
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
  // fictional SAMPLE market data (local preview only)
  const comp = ['Sample Hotel Near Temple', 'Sample Family Villa', 'Sample Serviced Apartment', 'Sample Boutique Stay'];
  const rates = [];
  for (let i = 0; i < 40; i++) rates.push({ competitor: comp[i % 4], observed_at: addD('2026-10-16', -(i % 20)), stay_date: addD('2026-10-20', i * 2), nights: 1, unit_type: i % 2 ? '3BHK villa' : '2BHK apartment', bedrooms: i % 2 ? 3 : 2, price_per_night: 4800 + (i % 7) * 450, source_type: i % 3 ? 'ota' : 'website', source_url: 'https://example.com/sample-' + i, confidence: 'medium' });
  env.api({ action: 'f.market.import', token: tok, competitors: comp.map((n, i) => ({ name: n, type: ['hotel', 'villa', 'serviced apartment', 'boutique'][i], area: 'Sample area', distance_km: 0.5 + i, bedrooms: i === 1 ? 3 : 2, website: 'https://example.com/' + i, positioning: 'Sample positioning text', source_url: 'https://example.com/' + i })), rates,
    signals: [{ date: '2026-10-10', source: 'trends', metric: 'search_interest', keyword: 'ujjain', growth_pct: 30, source_url: 'https://example.com/trend' }] });
  // fictional SAMPLE comp sets + prices/sold-outs for the next 30 nights, and live signals, for the Live Pricing Desk (local preview only)
  env.clock.advance(Math.max(0, Date.now() - env.clock.now()));
  const t0 = new Date(env.clock.now() + 330 * 6e4).toISOString().slice(0, 10);
  const desk = [['Sample 2BHK Temple View', 'villa', 2, 0.6, 3900], ['Sample 2BHK Family Flat', 'serviced apartment', 2, 1.2, 3400], ['Sample 3BHK Garden Villa', 'villa', 3, 1.5, 6200], ['Sample 3BHK Haveli Stay', 'villa', 3, 0.9, 6900],
    ['Sample 2BHK Homestay', 'homestay', 2, 2.1, 3100], ['Sample 3BHK Corner Villa', 'villa', 3, 2.6, 5600], ['Sample Hotel Shiv Darshan', 'hotel', '', 0.4, 2600], ['Sample Hotel Mahakal Residency', 'hotel', '', 0.7, 3100], ['Sample Hotel Kshipra Inn', 'hotel', '', 1.1, 2300]];
  const drates = [];
  desk.forEach(([n, , , , p], i) => { for (let k = 0; k < 30; k += 1 + (i % 3)) { const wk = [5, 6].includes(new Date(addD(t0, k) + 'T00:00:00Z').getUTCDay()); drates.push({ competitor: n, observed_at: addD(t0, -(k % 4)), stay_date: addD(t0, k), nights: 1, price_per_night: Math.round(p * (wk ? 1.25 : 1) * (1 + ((k * 7 + i) % 5 - 2) / 20)), source_type: 'ota', source_url: 'https://example.com/desk-' + i, confidence: 'high' }); } });
  env.api({ action: 'f.market.import', token: (await env.login('local preview only phrase')), competitors: desk.map(([n, type, bd, km], i) => ({ name: n, type, bedrooms: bd, distance_km: km, sleeps: bd ? bd * 2 + 1 : 3, amenities: i % 2 ? 'kitchen, parking' : 'parking, breakfast', review_themes: 'rating ' + (4.4 + (i % 5) / 10).toFixed(1) + ' from ' + (12 + i * 9) + ' reviews', source_url: 'https://example.com/desk-' + i })), rates: drates });
  const tok2 = await env.login('local preview only phrase');
  [0, 1, 6].forEach(k => env.api({ action: 'f.ratecheck.save', token: tok2, property: 'rudrangan-suites', stay_date: addD(t0, k), entries: desk.slice(0, 5).map(([n], i) => (i + k) % 3 === 0 ? { competitor: n, sold_out: true, platform: 'Airbnb' } : null).filter(Boolean) }));
  const { key } = env.api({ action: 'f.automation.create', token: tok2 });
  let sig = [];
  try { sig = JSON.parse(readFileSync(new URL('../../research/signals-auto.json', import.meta.url), 'utf8')).desk_signals || []; } catch (e) { /* run node scripts/signals/run.mjs for real calendar/holiday/weather rows */ }
  const now = new Date(env.clock.now()).toISOString();
  sig = sig.map(s => Object.assign({}, s, { fetched_at: now })).concat([{ signal_id: 'school', for_date: addD(t0, 12), index: 1.08, raw_value: 'SAMPLE school break', source_url: 'https://example.com/school', fetched_at: now, notes: 'SAMPLE' },
    { signal_id: 'temple', index: 1.05, raw_value: 'SAMPLE crowd notice', source_url: 'https://example.com/temple', fetched_at: addD(t0, -9) + 'T06:00:00Z', notes: 'SAMPLE (stale)' }]);
  env.api({ action: 'f.m.signals.import', key, signals: sig });
  env.api({ action: 'f.m.bots.report', key, run_id: 'SAMPLE', runs: [{ bot: 'airbnb', platform: 'Airbnb', mode: 'pages', pages: 36, prices: 27, sold_out: 6, discovered: 0 }, { bot: 'booking', platform: 'Booking.com', mode: 'pages', pages: 30, prices: 41, sold_out: 2, discovered: 4 },
    { bot: 'agoda', platform: 'Agoda', mode: 'pages', pages: 12, prices: 0, blocked: 'challenge page' }, { bot: 'serpapi', platform: 'Google Hotels', mode: 'api', pages: 5, prices: 64, discovered: 3 }, { bot: 'apify', platform: 'Apify', mode: 'api', blocked: 'APIFY_TOKEN not set yet' }] });
  // the same nights scanned again later at higher prices (momentum + spike in the preview)
  env.api({ action: 'f.m.market.import', key, rates: drates.filter(r => r.stay_date === addD(t0, 5)).map(r => Object.assign({}, r, { observed_at: t0, price_per_night: Math.round(r.price_per_night * 1.3), price_total: '', platform: 'Booking.com', source_url: r.source_url + '?bk' })) });
  env.fo.foHourly();
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
