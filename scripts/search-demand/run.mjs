#!/usr/bin/env node
// Search demand for the Live Pricing Desk (GitHub Actions, daily; no Claude, no paid services).
//   node scripts/search-demand/run.mjs [--dry]
// Google Trends daily interest in India for stay-intent searches ("hotels in ujjain", "hotel near mahakal", "उज्जैन होटल"…) and
// pilgrimage searches ("mahakal darshan", "bhasma aarti booking"…). robots.txt of trends.google.com allows the data endpoints used here
// (only /explore? pages are disallowed). If Trends refuses the cloud address, SerpApi's google_trends engine (owner-approved free plan)
// is the backup, at most 2 searches a day. Sends dated 'search_market' signals to the Founder OS (f.m.signals.import).
import { writeFileSync, mkdirSync } from 'node:fs';
import { BASKETS, parseMultiline, parseSerpApi, demandIndex, searchSignals } from './trends.mjs';
import { mayFetch, UA } from '../market-bots/core.mjs';

const API = 'https://script.google.com/macros/s/AKfycbzmtIwOzGohnjEOfp7RZ1cU8JtwkCb6mEZiHEa8j_gknh-zkVbHz4oEV1Mu5xTaNpo7/exec';
const KEY = (process.env.FOUNDER_OS_KEY || '').trim(), DRY = process.argv.includes('--dry');
const BOT_UA = UA.replace('APVillasPriceBot', 'APVillasSearchBot');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), fetchedAt = new Date().toISOString();

async function trends(keywords, cookie) {
  const req = { comparisonItem: keywords.map(k => ({ keyword: k, geo: 'IN', time: 'today 3-m' })), category: 0, property: '' };
  const u1 = 'https://trends.google.com/trends/api/explore?hl=en-IN&tz=-330&req=' + encodeURIComponent(JSON.stringify(req));
  if (!(await mayFetch(u1))) throw new Error('robots.txt');
  for (let a = 0; a < 3; a++) {
    const r = await fetch(u1, { headers: { 'User-Agent': BOT_UA, Cookie: cookie }, signal: AbortSignal.timeout(30000) });
    if (r.status === 429) { await sleep(20000 * (a + 1)); continue; }
    if (!r.ok) throw new Error('explore HTTP ' + r.status);
    const t = await r.text(), w = JSON.parse(t.slice(t.indexOf('{'))).widgets.find(x => x.id === 'TIMESERIES');
    await sleep(4000);
    const r2 = await fetch('https://trends.google.com/trends/api/widgetdata/multiline?hl=en-IN&tz=-330&req=' + encodeURIComponent(JSON.stringify(w.request)) + '&token=' + w.token, { headers: { 'User-Agent': BOT_UA, Cookie: cookie }, signal: AbortSignal.timeout(30000) });
    if (!r2.ok) throw new Error('series HTTP ' + r2.status);
    return parseMultiline(await r2.text(), keywords);
  }
  throw new Error('rate-limited (429)');
}
async function serpTrends(keywords) {
  const u = 'https://serpapi.com/search.json?' + new URLSearchParams({ engine: 'google_trends', q: keywords.join(','), geo: 'IN', date: 'today 3-m', data_type: 'TIMESERIES', api_key: process.env.SERPAPI_KEY });
  return parseSerpApi(await (await fetch(u, { signal: AbortSignal.timeout(60000) })).json(), keywords);
}

async function main() {
  const byKeyword = {}, status = [];
  let cookie = '';
  try { const h = await fetch('https://trends.google.com/trends/?geo=IN', { headers: { 'User-Agent': BOT_UA }, signal: AbortSignal.timeout(30000) }); cookie = (h.headers.getSetCookie ? h.headers.getSetCookie() : []).map(c => c.split(';')[0]).join('; '); } catch (e) {}
  for (const [name, kws] of Object.entries(BASKETS)) {
    try { Object.assign(byKeyword, await trends(kws, cookie)); status.push(`Trends ${name}: ok`); }
    catch (e) {
      status.push(`Trends ${name}: ${e.message}`);
      if (process.env.SERPAPI_KEY) { try { Object.assign(byKeyword, await serpTrends(kws)); status.push(`SerpApi backup ${name}: ok`); } catch (e2) { status.push(`SerpApi backup ${name}: ${e2.message}`); } }
    }
    await sleep(6000);
  }
  const d = demandIndex(byKeyword);
  status.forEach(s => console.log(s));
  if (!d) { console.log('::warning::No usable search series today; the desk keeps the last values until they expire.'); process.exitCode = 1; return; }
  console.log(`Search demand ×${d.index.toFixed(2)} vs usual (stay ${d.parts.stay ? d.parts.stay.index.toFixed(2) : '—'}, pilgrimage ${d.parts.pilgrim ? d.parts.pilgrim.index.toFixed(2) : '—'}), last 3 days ×${d.rising ?? '—'}`);
  const sigs = searchSignals(d, today, fetchedAt, 'https://trends.google.com/trends/explore?geo=IN&q=' + encodeURIComponent(BASKETS.stay[0]));
  mkdirSync('research', { recursive: true }); writeFileSync('research/search-demand.json', JSON.stringify({ today, demand: d, series: byKeyword }, null, 1));
  if (DRY || !KEY) { if (!KEY) console.log('::warning::FOUNDER_OS_KEY not set; signals not sent.'); return; }
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'f.m.signals.import', key: KEY, signals: sigs }), redirect: 'follow' });
      const j = await r.json(); if (!j.ok) throw new Error(j.error || 'failed');
      console.log(`Founder OS: ${j.result.added} search signals added, ${j.result.skipped} already there, ${j.result.rejected} rejected.`); return;
    } catch (e) { console.log('Founder OS attempt ' + (a + 1) + ': ' + e.message); await sleep(5000 * 2 ** a); }
  }
  throw new Error('could not reach the Founder OS');
}
main().catch(e => { console.error('Search demand: ' + (e.message || e)); process.exit(1); });
