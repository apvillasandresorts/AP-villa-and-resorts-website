#!/usr/bin/env node
// Checks research/market.json before it is sent to the Founder OS: schema, sources, dates, plausible prices, no personal data.
import { readFileSync } from 'node:fs';
const file = process.argv[2] || 'research/market.json';
const errs = [], warn = [];
let d; try { d = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error('Not valid JSON: ' + e.message); process.exit(1); }
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || ''), isUrl = v => /^https:\/\/[^\s]+$/.test(v || '');
const PII = /(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|[\w.+-]+@[\w-]+\.[\w.]+/;
const deskOnly = Array.isArray(d.desk_signals) && !d.competitors && !d.rates && !d.signals;
if (!deskOnly) for (const k of ['competitors', 'rates', 'signals']) if (!Array.isArray(d[k])) errs.push(`"${k}" must be a list`);
// pricing-desk signals: { signal_id, property?, for_date ('' = horizon-wide), index (1.00 = normal, 0.5–2.0), raw_value, source_url, fetched_at, status?, notes }
const DESK_IDS = ['comp_price', 'comp_avail', 'hotel_index', 'calendar', 'holiday', 'school', 'events', 'search', 'web', 'temple', 'travel', 'footfall', 'weather', 'reputation'];
(d.desk_signals || []).forEach((s, i) => {
  if (!DESK_IDS.includes(s.signal_id)) errs.push(`desk_signals[${i}]: unknown signal_id "${s.signal_id}"`);
  if (s.for_date && !isDate(s.for_date)) errs.push(`desk_signals[${i}]: for_date must be YYYY-MM-DD or empty`);
  if (s.status !== 'blocked' && !(Number(s.index) >= 0.5 && Number(s.index) <= 2)) errs.push(`desk_signals[${i}] ${s.signal_id}: index ${s.index} outside 0.5–2.0`);
  if (!(isUrl(s.source_url) || s.source_url === 'own_ledger')) errs.push(`desk_signals[${i}] ${s.signal_id}: source_url (https) required`);
  if (!s.fetched_at || isNaN(Date.parse(s.fetched_at))) errs.push(`desk_signals[${i}]: fetched_at required`);
});
(d.competitors || []).forEach((c, i) => {
  if (!c.name) errs.push(`competitors[${i}]: name missing`);
  if (!isUrl(c.source_url) && !isUrl(c.website)) errs.push(`competitors[${i}] ${c.name}: needs a source_url or website (https)`);
  if (c.distance_km != null && c.distance_km !== '' && !(c.distance_km >= 0 && c.distance_km < 50)) warn.push(`competitors[${i}] ${c.name}: distance ${c.distance_km} km looks wrong`);
});
const names = new Set((d.competitors || []).map(c => String(c.name || '').toLowerCase()));
(d.rates || []).forEach((r, i) => {
  const p = Number(r.price_per_night) || (Number(r.price_total) / Math.max(1, Number(r.nights) || 1));
  if (!r.competitor) errs.push(`rates[${i}]: competitor missing`);
  else if (!names.has(String(r.competitor).toLowerCase())) warn.push(`rates[${i}]: "${r.competitor}" is not in competitors`);
  if (!isUrl(r.source_url)) errs.push(`rates[${i}] ${r.competitor}: source_url (https) required`);
  if (!isDate(r.observed_at) || r.observed_at > today) errs.push(`rates[${i}] ${r.competitor}: observed_at must be a past/today date`);
  if (r.stay_date && !isDate(r.stay_date)) errs.push(`rates[${i}] ${r.competitor}: stay_date must be YYYY-MM-DD or empty`);
  if (/sold/i.test(r.availability || '') && !p) { if (!isDate(r.stay_date)) errs.push(`rates[${i}] ${r.competitor}: a sold-out needs a stay_date`); }
  else if (!(p >= 300 && p <= 200000)) errs.push(`rates[${i}] ${r.competitor}: price per night ${p} is not plausible (₹300–₹2,00,000)`);
});
(d.signals || []).forEach((s, i) => {
  if (!s.source || !s.metric) errs.push(`signals[${i}]: source and metric required`);
  if (!isUrl(s.source_url)) errs.push(`signals[${i}] ${s.metric}: source_url (https) required`);
  if (!isDate(s.date)) errs.push(`signals[${i}]: date must be YYYY-MM-DD`);
});
const flat = JSON.stringify(d); if (PII.test(flat.replace(/https:\/\/[^"\s]+/g, ''))) errs.push('Personal data found (a phone number or email). Remove it.');
warn.forEach(w => console.log('warning: ' + w));
if (errs.length) { errs.forEach(e => console.log('ERROR: ' + e)); console.log(`${errs.length} error(s).`); process.exit(1); }
console.log(deskOnly ? `OK: ${d.desk_signals.length} desk signals.` : `OK: ${d.competitors.length} competitors, ${d.rates.length} prices, ${d.signals.length} signals${d.desk_signals ? ', ' + d.desk_signals.length + ' desk signals' : ''}.`);
