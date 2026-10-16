#!/usr/bin/env node
// Analyse a booking export (CSV, the Founder OS Excel export, or .xlsx) with the SAME metric definitions as the
// Founder OS (founder/metrics.js + founder/insights.js), so figures here always match the portal.
//
//   node scripts/analyse-bookings.mjs <file.csv|.xls|.xlsx> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--channel Airbnb] [--out research/<name>.md]
//
// Privacy: works on aggregates only. Guest names, phones and emails are never printed or written.
// Honesty: every figure is labelled as read from the file or calculated; missing data is reported, never filled in.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, basename, extname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const M = require(ROOT + '/founder/metrics.js');
const I = require(ROOT + '/founder/insights.js');

const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const file = args.find(a => !a.startsWith('--') && !['--from', '--to', '--out', '--channel'].includes(args[args.indexOf(a) - 1]));
if (!file || !existsSync(file)) { console.error('Usage: node scripts/analyse-bookings.mjs <bookings.csv|.xls|.xlsx> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--out research/report.md]'); process.exit(1); }

// ---------------------------------------------------------------- read the file into rows ----------------
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  const first = text.split('\n')[0], delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}
function readSpreadsheetML(xml, sheetName) {   // the Founder OS "Excel" export (.xls SpreadsheetML 2003)
  const sheets = [...xml.matchAll(/<Worksheet ss:Name="([^"]*)">([\s\S]*?)<\/Worksheet>/g)];
  const ws = sheets.find(s => s[1] === sheetName) || sheets[0]; if (!ws) return [];
  const un = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  return [...ws[2].matchAll(/<Row>([\s\S]*?)<\/Row>/g)].map(r => [...r[1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)].map(c => un(c[1])));
}
function readXlsx(path) {   // .xlsx → CSV with openpyxl in a throwaway environment (nothing installed permanently)
  const py = 'import csv,sys,openpyxl\nwb=openpyxl.load_workbook(sys.argv[1],read_only=True,data_only=True)\nws=wb.worksheets[0]\nw=csv.writer(sys.stdout)\nfor r in ws.iter_rows(values_only=True): w.writerow(["" if v is None else (v.isoformat()[:10] if hasattr(v,"isoformat") else v) for v in r])';
  return parseCsv(execFileSync('uvx', ['--with', 'openpyxl', 'python', '-c', py, path], { encoding: 'utf8', maxBuffer: 64e6 }));
}
const ext = extname(file).toLowerCase();
const raw = readFileSync(file, 'utf8');
const rows = ext === '.xlsx' ? readXlsx(file) : /<Workbook[\s>]/.test(raw.slice(0, 2000)) ? readSpreadsheetML(raw, 'Bookings') : parseCsv(raw);
if (rows.length < 2) { console.error('No data rows found in ' + file); process.exit(1); }

// ---------------------------------------------------------------- map columns (same synonyms as the portal import) ----------------
const FIELDS = {
  booking_id: /^booking_id$/i, external_id: /^external_id$|book(ing)?\s*(number|no|id|ref)|confirmation|reservation\s*(id|number|code)|^id$|code/i,
  channel: /^channel$|booked\s*through|source|platform|channel/i, property: /villa|listing|property|unit|room|accommodation/i,
  checkin: /^checkin$|arrival|check.?in|start\s*date/i, checkout: /^checkout$|departure|check.?out|end\s*date/i,
  gross_amount: /^gross_amount$|price|total|amount|gross|revenue|payout|earnings/i, discount: /discount/i, taxes: /tax|gst/i, commission: /commission|service\s*fee|host\s*fee/i,
  status: /status/i, created_at: /^booked_on$|booked|booking\s*date|created|reservation\s*date/i, created_basis: /booked_on_basis|created_basis/i,
  adults: /adult|guests?\s*count|persons|people/i, children: /child|kid/i, collected: /^collected/i,
};
const head = rows[0].map(h => String(h).trim()), map = {};
Object.keys(FIELDS).forEach(k => { const i = head.findIndex((h, j) => FIELDS[k].test(h) && !Object.values(map).includes(j)); if (i >= 0) map[k] = i; });
if (map.checkin == null || map.checkout == null) { console.error('Could not find check-in/check-out columns. Headers: ' + head.join(' | ')); process.exit(1); }

const props = JSON.parse(readFileSync(ROOT + '/content/business-facts.json', 'utf8')).villas.map(v => ({ property_id: v.id, name: v.name, units: 1, active: 'yes' }));
const propId = name => { const n = String(name || '').toLowerCase().replace(/[^a-z]/g, ''); if (!n) return ''; const p = props.find(x => n.includes(x.name.toLowerCase().replace(/[^a-z]/g, '')) || x.name.toLowerCase().replace(/[^a-z]/g, '').includes(n)); return p ? p.property_id : ''; };
const date = v => { const s = String(v || '').trim(); let m; if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; const d = new Date(s); return s && !isNaN(d) ? d.toISOString().slice(0, 10) : ''; };
const money = v => { const s = String(v ?? '').replace(/[^\d.\-]/g, ''); return s === '' ? '' : Number(s); };
const status = v => { const s = String(v || '').toLowerCase(); return /void/.test(s) ? 'void' : /cancel/.test(s) ? 'cancelled' : /no.?show/.test(s) ? 'no_show' : /tentative/.test(s) ? 'tentative' : 'confirmed'; };
// An OTA export has no channel column: take it from --channel, or recognise the export by its headers.
const fileChannel = opt('channel') || (head.some(h => /^confirmation code$/i.test(h)) && head.some(h => /^listing$/i.test(h)) ? 'Airbnb' : head.some(h => /^book number$/i.test(h)) ? 'Booking.com' : head.some(h => /makemytrip|mmt/i.test(h)) ? 'MakeMyTrip' : null);
const channel = v => { const s = String(v || '').trim(); return s || fileChannel || 'Unknown'; };
const get = (r, k) => map[k] == null ? '' : r[map[k]];

const gaps = { no_villa: 0, no_amount: 0, bad_dates: 0, no_created: 0 };
const bookings = [], payments = [];
rows.slice(1).forEach((r, i) => {
  const ci = date(get(r, 'checkin')), co = date(get(r, 'checkout'));
  if (!ci || !co || co <= ci) { gaps.bad_dates++; return; }
  const b = { booking_id: get(r, 'booking_id') || get(r, 'external_id') || 'ROW' + (i + 2), channel: channel(get(r, 'channel')), property_id: propId(get(r, 'property')),
    checkin: ci, checkout: co, nights: M.days(ci, co) - 1, status: status(get(r, 'status')), gross_amount: money(get(r, 'gross_amount')), discount: money(get(r, 'discount')),
    taxes: money(get(r, 'taxes')), commission: money(get(r, 'commission')), created_at: date(get(r, 'created_at')), created_basis: String(get(r, 'created_basis') || (get(r, 'created_at') ? 'source' : 'unknown')),
    adults: get(r, 'adults'), children: get(r, 'children') };
  if (!b.property_id) gaps.no_villa++; if (b.gross_amount === '') gaps.no_amount++; if (!b.created_at) gaps.no_created++;
  bookings.push(b);
  const paid = money(get(r, 'collected')); if (paid > 0) payments.push({ booking_id: b.booking_id, type: 'payment', amount: paid, date: b.checkin });
});
if (!bookings.length) { console.error('No usable bookings (all rows had missing or impossible dates).'); process.exit(1); }

const channels = [...new Set(bookings.map(b => b.channel))].map(c => ({ channel: c, kind: /direct|whatsapp|phone|website|walk/i.test(c) ? 'direct' : /booking\.com|airbnb|makemytrip|goibibo|agoda/i.test(c) ? 'ota' : 'other' }));
const allDates = bookings.flatMap(b => [b.checkin, M.addDays(b.checkout, -1)]).sort();
const from = opt('from') || allDates[0], to = opt('to') || allDates[allDates.length - 1];
const data = { today: new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), properties: props, channels, bookings, payments, blocks: [], expenses: [] };

// ---------------------------------------------------------------- analysis ----------------
const inr = v => v == null || !isFinite(v) ? '—' : '₹' + Math.round(v).toLocaleString('en-IN');
const pct = v => v == null || !isFinite(v) ? '—' : (v * 100).toFixed(1) + '%';
const cur = M.compute(data, from, to), pr = M.previous(from, to), prev = M.compute(data, pr.from, pr.to);
const hadPrev = bookings.some(b => b.checkin <= pr.to);
const monthly = M.series(data, from, to, 'month');
const ch = I.channelProfit(data, from, to), made = M.breakdown(data, from, to, 'channel'), villas = M.byProperty(data, from, to);
const dec = hadPrev ? I.decompose(cur, prev) : { method: 'unavailable', note: 'No bookings before this period in the file.' };
const lines = [];
const L = s => lines.push(s);
L(`# Booking analysis: ${basename(file)}`);
L(`Period analysed: **${from} to ${to}** (stay dates; booking-date figures use the booking date where the file has one). Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC with the Founder OS metric dictionary.`);
L('');
L('## Data quality (read this first)');
L(`- Rows read: ${rows.length - 1}; usable bookings: ${bookings.length}; rows skipped for missing/impossible dates: ${gaps.bad_dates}.`);
L(`- Columns recognised: ${Object.keys(map).join(', ')}. Not found: ${Object.keys(FIELDS).filter(k => map[k] == null).join(', ') || 'none'}.`);
L(`- Bookings without a recognised villa: ${gaps.no_villa} (excluded from occupancy). Without an amount: ${gaps.no_amount}. Without a booking date: ${gaps.no_created} (excluded from lead time and booking-date figures).`);
L('- Inventory assumed: the 5 whole villas in content/business-facts.json, 1 rentable unit each (villa-nights). Maintenance blocks are not in a booking export, so occupancy may be slightly understated.');
L('');
L('## Headline figures (calculated from the file)');
L('| Metric | This period | Previous period' + (hadPrev ? ` (${pr.from} to ${pr.to})` : '') + ' |');
L('|---|---|---|');
[['Bookings made', cur.bookings_made, prev.bookings_made, String], ['Gross booking value', cur.gross_booking_value, prev.gross_booking_value, inr], ['Net accommodation revenue (stay basis)', cur.net_accommodation_revenue, prev.net_accommodation_revenue, inr],
  ['Occupancy (villa-nights)', cur.occupancy, prev.occupancy, pct], ['ADR', cur.adr, prev.adr, inr], ['RevPAR', cur.revpar, prev.revpar, inr], ['Average length of stay (nights)', cur.alos, prev.alos, v => v == null ? '—' : v.toFixed(1)],
  ['Cancellation rate', cur.cancellation_rate, prev.cancellation_rate, pct], ['Median lead time (days, real booking dates only)', cur.lead_time_median, prev.lead_time_median, v => v == null ? '—' : String(v)], ['Direct share (count)', cur.direct_share_count, prev.direct_share_count, pct]]
  .forEach(([k, a, b, f]) => L(`| ${k} | ${f(a)} | ${hadPrev ? f(b) : 'no data in file'} |`));
L('');
L('## Why revenue changed');
L(dec.method === 'unavailable' ? '- ' + dec.note : `- Change ${inr(dec.change)} = availability ${inr(dec.availability)} + occupancy ${inr(dec.occupancy)} + ADR ${inr(dec.adr)} (${dec.method}). This explains what moved, not why.`);
L('');
L('## By month (stay basis)');
L('| Month | Occupancy | ADR | Revenue | Bookings made | Cancelled |'); L('|---|---|---|---|---|---|');
monthly.forEach(m => L(`| ${m.key} | ${pct(m.occupancy)} | ${inr(m.adr)} | ${inr(m.revenue)} | ${m.bookings} | ${m.cancelled} |`));
L('');
L('## Channels');
L('| Channel | Bookings made | Booking value | Cancel rate | Stay nights | Revenue | Commission (in file) |'); L('|---|---|---|---|---|---|---|');
[...new Set(made.map(m => m.key).concat(ch.map(c => c.channel)))].forEach(k => {   // channels with bookings made OR nights stayed in the period
  const m = made.find(x => x.key === k) || { bookings: 0, value: 0, cancelled: 0, commission: 0, commission_unknown: 0 }, c = ch.find(x => x.channel === k) || {};
  L(`| ${k} | ${m.bookings} | ${inr(m.value)} | ${pct(m.bookings ? m.cancelled / m.bookings : null)} | ${c.nights || 0} | ${inr(c.revenue || 0)} | ${m.bookings ? (m.commission_unknown ? 'unknown for ' + m.commission_unknown : inr(m.commission)) : '—'} |`);
});
L('');
L('## Villas');
L('| Villa | Occupancy | ADR | RevPAR | Revenue | Arrivals |'); L('|---|---|---|---|---|---|');
villas.forEach(v => L(`| ${v.name} | ${pct(v.occupancy)} | ${inr(v.adr)} | ${inr(v.revpar)} | ${inr(v.revenue)} | ${v.arrivals} |`));
L('');
L('## Limitations');
L('- Figures cover only what is in this file; OTA, WhatsApp and walk-in bookings missing from it are not counted.');
L('- Commission is used only where the file states it; nothing is estimated here.');
L('- Revenue is spread evenly over each stay\'s nights; taxes are removed only where the file has a tax column.');
const md = lines.join('\n') + '\n';
const out = opt('out');
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, md); console.log('Written ' + out); }
else process.stdout.write(md);
