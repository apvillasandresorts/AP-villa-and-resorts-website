#!/usr/bin/env node
// Checks research/market.json before it is sent to the Founder OS: schema, sources, dates, plausible prices, no personal data.
import { readFileSync } from 'node:fs';
const file = process.argv[2] || 'research/market.json';
const errs = [], warn = [];
let d; try { d = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error('Not valid JSON: ' + e.message); process.exit(1); }
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || ''), isUrl = v => /^https:\/\/[^\s]+$/.test(v || '');
const PII = /(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|[\w.+-]+@[\w-]+\.[\w.]+/;
for (const k of ['competitors', 'rates', 'signals']) if (!Array.isArray(d[k])) errs.push(`"${k}" must be a list`);
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
  if (!(p >= 300 && p <= 200000)) errs.push(`rates[${i}] ${r.competitor}: price per night ${p} is not plausible (₹300–₹2,00,000)`);
});
(d.signals || []).forEach((s, i) => {
  if (!s.source || !s.metric) errs.push(`signals[${i}]: source and metric required`);
  if (!isUrl(s.source_url)) errs.push(`signals[${i}] ${s.metric}: source_url (https) required`);
  if (!isDate(s.date)) errs.push(`signals[${i}]: date must be YYYY-MM-DD`);
});
const flat = JSON.stringify(d); if (PII.test(flat.replace(/https:\/\/[^"\s]+/g, ''))) errs.push('Personal data found (a phone number or email). Remove it.');
warn.forEach(w => console.log('warning: ' + w));
if (errs.length) { errs.forEach(e => console.log('ERROR: ' + e)); console.log(`${errs.length} error(s).`); process.exit(1); }
console.log(`OK: ${d.competitors.length} competitors, ${d.rates.length} prices, ${d.signals.length} signals.`);
