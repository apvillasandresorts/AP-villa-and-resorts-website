#!/usr/bin/env node
// Search demand for the Live Pricing Desk (GitHub Actions, daily; no Claude, no paid services).
//   node scripts/search-demand/run.mjs [--dry]
// Google Trends daily interest in India for stay-intent searches ("hotels in ujjain", "hotel near mahakal", "उज्जैन होटल"…) and
// pilgrimage searches ("mahakal darshan", "bhasma aarti booking"…). robots.txt of trends.google.com allows the data endpoints used here
// (only /explore? pages are disallowed). If Trends refuses the cloud address, SerpApi's google_trends engine (owner-approved free plan)
// is the backup, at most 2 searches a day. Sends dated 'search_market' signals to the Founder OS (f.m.signals.import).
import { writeFileSync, mkdirSync } from 'node:fs';
import { BASKETS, parseMultiline, parseSerpApi, demandIndex, searchSignals, parseRelated, onAnchorScale, keywordRows, parseWiki } from './trends.mjs';
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
const ANCHOR = 'ujjain hotel', SEEDS = ['ujjain', 'ujjain hotel', 'mahakal'];
const SUGGEST = ['ujjain hotel', 'hotel near mahakal', 'ujjain stay', 'ujjain dharamshala', 'mahakal darshan', 'bhasma aarti', 'ujjain homestay', 'ujjain villa'];
const WIKI = [['en', 'Ujjain'], ['en', 'Mahakaleshwar_Jyotirlinga'], ['en', 'Simhastha'], ['hi', 'उज्जैन'], ['hi', 'महाकालेश्वर_ज्योतिर्लिंग']];
async function related(keyword, time, cookie) {
  const req = { comparisonItem: [{ keyword, geo: 'IN', time }], category: 0, property: '' };
  const r = await fetch('https://trends.google.com/trends/api/explore?hl=en-IN&tz=-330&req=' + encodeURIComponent(JSON.stringify(req)), { headers: { 'User-Agent': BOT_UA, Cookie: cookie }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('explore HTTP ' + r.status);
  const t = await r.text(), w = JSON.parse(t.slice(t.indexOf('{'))).widgets.find(x => x.id === 'RELATED_QUERIES'); await sleep(3000);
  const r2 = await fetch('https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=en-IN&tz=-330&req=' + encodeURIComponent(JSON.stringify(w.request)) + '&token=' + w.token, { headers: { 'User-Agent': BOT_UA, Cookie: cookie }, signal: AbortSignal.timeout(30000) });
  if (!r2.ok) throw new Error('related HTTP ' + r2.status);
  return parseRelated(await r2.text());
}
/** Ujjain-wide keyword report: Trends top + rising searches (last day and last 7 days), each keyword's daily curve on one scale,
 *  Google Autocomplete phrases, and exact Wikipedia readers per day. */
async function keywordReport(cookie, status) {
  const meta = {}, note = (q, f) => { meta[q] = meta[q] || { kinds: [], seeds: [] }; f(meta[q]); };
  for (const seed of SEEDS) for (const time of ['now 1-d', 'now 7-d']) {
    try {
      const rq = await related(seed, time, cookie), tag = time === 'now 1-d' ? '24h' : '7d';
      rq.top.forEach(x => note(x.query, m => { m.kinds.push('top ' + tag); m.seeds.push(seed); m['top_' + tag] = Math.max(m['top_' + tag] || 0, x.value); }));
      rq.rising.forEach(x => note(x.query, m => { m.kinds.push('rising ' + tag); m.seeds.push(seed); m.rising = m.rising || x.label; }));
    } catch (e) { status.push(`Related ${seed} ${time}: ${e.message}`); }
    await sleep(5000);
  }
  // daily curves for the most searched (24h first), 4 per request + the anchor
  const cand = Object.keys(meta).filter(k => k !== ANCHOR).sort((a, b) => ((meta[b].top_24h || 0) * 2 + (meta[b].top_7d || 0)) - ((meta[a].top_24h || 0) * 2 + (meta[a].top_7d || 0))).slice(0, 20), groups = [];
  for (let i = 0; i < cand.length; i += 4) {
    try { groups.push(await trends([ANCHOR].concat(cand.slice(i, i + 4)), cookie)); } catch (e) { status.push(`Series group ${i / 4 + 1}: ${e.message}`); }
    await sleep(5000);
  }
  if (!meta[ANCHOR]) meta[ANCHOR] = { kinds: ['anchor'], seeds: [] };
  Object.values(meta).forEach(m => { m.kinds = [...new Set(m.kinds)].join(', '); m.seeds = [...new Set(m.seeds)].join(', '); });
  const rows = keywordRows(onAnchorScale(groups, ANCHOR), meta, null);
  // rising-only keywords without a curve are kept (Trends shows them, volume too small for a daily line)
  Object.keys(meta).forEach(k => { if (!rows.some(r => r.keyword === k)) rows.push(Object.assign({ keyword: k, series: [] }, meta[k])); });
  const suggestions = [];
  for (const q of SUGGEST) {
    try { const j = await (await fetch('https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=in&q=' + encodeURIComponent(q), { headers: { 'User-Agent': BOT_UA }, signal: AbortSignal.timeout(20000) })).json(); (j[1] || []).forEach(s2 => suggestions.push({ seed: q, phrase: String(s2).toLowerCase() })); }
    catch (e) { status.push(`Autocomplete ${q}: ${e.message}`); }
    await sleep(1500);
  }
  const wiki = [], end = today.replace(/-/g, ''), start = new Date(Date.now() - 95 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  for (const [lang, art] of WIKI) {
    try {
      const u = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${encodeURIComponent(art)}/daily/${start}/${end}`;
      const s2 = parseWiki(await (await fetch(u, { headers: { 'User-Agent': BOT_UA + ' apvillasandresorts@gmail.com' }, signal: AbortSignal.timeout(20000) })).json());
      if (s2.length) wiki.push({ lang, article: art, series: s2 });
    } catch (e) { status.push(`Wikipedia ${lang}:${art}: ${e.message}`); }
  }
  status.push(`Keywords: ${rows.length} (${rows.filter(r => r.series.length).length} with daily curves), ${suggestions.length} autocomplete phrases, ${wiki.length} Wikipedia articles`);
  return { anchor: ANCHOR, keywords: rows.slice(0, 60), suggestions: suggestions.slice(0, 120), wiki };
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
  let report = null;
  try { report = await keywordReport(cookie, status); report.wiki.forEach(w => { byKeyword['wiki:' + w.lang + ':' + w.article] = w.series; }); } catch (e) { status.push('Keyword report: ' + e.message); }
  const d = demandIndex(byKeyword);
  status.forEach(s => console.log(s));
  if (!d) { console.log('::warning::No usable search series today; the desk keeps the last values until they expire.'); process.exitCode = 1; return; }
  console.log(`Search demand ×${d.index.toFixed(2)} vs usual (stay ${d.parts.stay ? d.parts.stay.index.toFixed(2) : '—'}, pilgrimage ${d.parts.pilgrim ? d.parts.pilgrim.index.toFixed(2) : '—'}), last 3 days ×${d.rising ?? '—'}`);
  const sigs = searchSignals(d, today, fetchedAt, 'https://trends.google.com/trends/explore?geo=IN&q=' + encodeURIComponent(BASKETS.stay[0]));
  mkdirSync('research', { recursive: true }); writeFileSync('research/search-demand.json', JSON.stringify({ today, demand: d, series: byKeyword }, null, 1));
  if (report) writeFileSync('research/search-keywords.json', JSON.stringify(report, null, 1));
  if (DRY || !KEY) { if (!KEY) console.log('::warning::FOUNDER_OS_KEY not set; signals not sent.'); return; }
  if (report) await send('f.m.searchkw.import', Object.assign({ date: today, fetched_at: fetchedAt }, report), j => `Founder OS: keyword report saved (${j.result.keywords} keywords, ${j.result.extra} extra rows).`);
  await send('f.m.signals.import', { signals: sigs }, j => `Founder OS: ${j.result.added} search signals added, ${j.result.skipped} already there, ${j.result.rejected} rejected.`);
}
async function send(action, body, msg) {
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, key: KEY }, body)), redirect: 'follow' });
      const j = await r.json(); if (!j.ok) throw new Error(j.error || 'failed');
      console.log(msg(j)); return;
    } catch (e) { console.log(action + ' attempt ' + (a + 1) + ': ' + e.message); await sleep(5000 * 2 ** a); }
  }
  throw new Error('could not reach the Founder OS (' + action + ')');
}
main().catch(e => { console.error('Search demand: ' + (e.message || e)); process.exit(1); });
