#!/usr/bin/env node
// Sends research to the Founder OS with the automation key (never printed).
//   node scripts/push-market.mjs research/market.json [--report research/market-report.html --period 2026-10]
//   node scripts/push-market.mjs --summary research/summary.json     (aggregates only; local use, never in CI logs)
//   node scripts/push-market.mjs --ga4 2026-09-01 2026-09-30 research/ga4.json
//   node scripts/push-market.mjs --signals research/signals-auto.json  (pricing-desk signals: weather, holidays, calendar, news)
//   node scripts/push-market.mjs --outlook research/outlook.html       (morning 30-day market outlook)
//   node scripts/push-market.mjs --seo-next topic.json            (blog pipeline: next requested blog topic from SEO & marketing)
//   node scripts/push-market.mjs --seo-peek                       (blog-queue.yml: how many topics were accepted in the portal)
//   node scripts/push-market.mjs --seo-done <topic_id> <slug|-> [failed|live|review]
// Key: env FOUNDER_OS_KEY (GitHub secret) or ~/.config/ap-villas/founder-os-key (local, chmod 600).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
const API = 'https://script.google.com/macros/s/AKfycbzmtIwOzGohnjEOfp7RZ1cU8JtwkCb6mEZiHEa8j_gknh-zkVbHz4oEV1Mu5xTaNpo7/exec';
const keyFile = homedir() + '/.config/ap-villas/founder-os-key';
const key = (process.env.FOUNDER_OS_KEY || (existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : '')).trim();
if (!key) { console.log('No automation key (FOUNDER_OS_KEY or ' + keyFile + '). Create one in the portal: Settings → Automation. Nothing sent.'); process.exit(0); }
const a = process.argv.slice(2), opt = k => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : null; };
async function call(action, body) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, key }, body)), redirect: 'follow' });
  const j = await r.json(); if (!j.ok) throw new Error(j.error || 'request failed'); return j;
}
const write = (f, o) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(o, null, 2)); console.log('Saved ' + f); };
try {
  if (a.includes('--signals')) {
    const d = JSON.parse(readFileSync(opt('signals'), 'utf8')), rows = d.desk_signals || d.signals || [];
    let added = 0, skipped = 0, rejected = 0;
    for (let i = 0; i < rows.length; i += 400) { const r = (await call('f.m.signals.import', { signals: rows.slice(i, i + 400) })).result; added += r.added; skipped += r.skipped; rejected += r.rejected; if (r.errors && r.errors.length) console.log('rejected examples: ' + r.errors.slice(0, 3).join('; ')); }
    console.log(`Signals: ${added} added, ${skipped} already there, ${rejected} rejected.`);
  }
  else if (a.includes('--outlook')) { const u = await call('f.m.report.upload', { type: 'outlook', period_key: new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), html: readFileSync(opt('outlook'), 'utf8') }); console.log('Outlook: ' + u.status); }
  else if (a.includes('--summary')) { write(opt('summary'), (await call('f.m.summary', {})).summary); }
  else if (a.includes('--seo-next')) { const t = (await call('f.m.seo.next', {})).topic; write(opt('seo-next'), t || {}); console.log(t ? 'Requested topic: ' + (t.title || t.keyword) : 'No requested topics queued.'); }
  else if (a.includes('--seo-peek')) { const r = await call('f.m.seo.peek', {}); console.log('waiting=' + r.waiting); }
  else if (a.includes('--seo-done')) { const i = a.indexOf('--seo-done'); const r = await call('f.m.seo.done', { topic_id: a[i + 1], slug: a[i + 2] === '-' ? '' : a[i + 2], status: ['failed', 'live', 'review'].indexOf(a[i + 3]) >= 0 ? a[i + 3] : 'done' }); console.log('Topic marked ' + r.status); }
  else if (a.includes('--ga4')) { const i = a.indexOf('--ga4'); write(a[i + 3], (await call('f.m.ga4', { from: a[i + 1], to: a[i + 2] })).ga); }
  else {
    const file = a.find(x => x.endsWith('.json')) || 'research/market.json', d = JSON.parse(readFileSync(file, 'utf8'));
    const r = (await call('f.m.market.import', { competitors: d.competitors || [], rates: d.rates || [], signals: d.signals || [] })).result;
    console.log(`Market data: ${r.competitors} competitors updated, ${r.rates} new prices, ${r.signals} new signals, ${r.skipped} already there, ${r.rejected} rejected.`);
    const rep = opt('report');
    if (rep && existsSync(rep)) {
      const u = await call('f.m.report.upload', { type: 'market', period_key: opt('period') || new Date().toISOString().slice(0, 7), html: readFileSync(rep, 'utf8'), to: d.collected_at });
      console.log('Market report: ' + u.status);
    }
  }
} catch (e) { console.error('Founder OS: ' + e.message); process.exit(1); }
