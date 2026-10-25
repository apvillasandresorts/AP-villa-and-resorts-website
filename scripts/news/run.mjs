#!/usr/bin/env node
// News for the Founder OS (GitHub Actions every 2 hours; no Claude, no paid services).
//   node scripts/news/run.mjs [--dry]
// Sources (free, robots.txt checked at run time): GDELT DOC 2.0 API (open news database; English + Hindi Indian outlets) and publishers'
// own RSS feeds (Free Press Journal, Times of India Indore, Dainik Bhaskar). Google News RSS is NOT used: its robots.txt disallows /rss.
// Each story: relevance (scripts/news/classify.mjs), category, impact, demand direction. Only headline, source, link, date and a
// short feed summary are stored (no article text). Sent to f.m.news.import with the automation key.
import { writeFileSync, mkdirSync } from 'node:fs';
import { classify, parseFeed, newsId } from './classify.mjs';
import { mayFetch, UA } from '../market-bots/core.mjs';

const API = 'https://script.google.com/macros/s/AKfycbzmtIwOzGohnjEOfp7RZ1cU8JtwkCb6mEZiHEa8j_gknh-zkVbHz4oEV1Mu5xTaNpo7/exec';
const KEY = (process.env.FOUNDER_OS_KEY || '').trim(), DRY = process.argv.includes('--dry');
const NEWS_UA = UA.replace('APVillasPriceBot', 'APVillasNewsBot');
// one combined query per run (GDELT allows about one request every 5 seconds per address; 429 = back off until next run)
const GDELT = ['(Ujjain OR Mahakal OR Mahakaleshwar OR Simhastha OR Kshipra OR Omkareshwar OR "Indore airport" OR "Ujjain railway" OR "MP tourism" OR उज्जैन OR महाकाल OR सिंहस्थ)'];
const FEEDS = [
  ['Free Press Journal', 'https://www.freepressjournal.in/stories.rss'],
  ['Times of India (Indore)', 'https://timesofindia.indiatimes.com/rssfeeds/7503091.cms'],
  ['Dainik Bhaskar', 'https://www.bhaskar.com/rss-v1--category-1061.xml'],
];
const isoOf = s => { const d = new Date(s); return isNaN(d) ? '' : d.toISOString(); };
const gdeltDate = s => { const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/); return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : isoOf(s); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, json) {
  if (!(await mayFetch(url))) return { skipped: 'robots.txt' };
  let r;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { r = await fetch(url, { headers: { 'User-Agent': NEWS_UA, Accept: json ? 'application/json' : 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(40000), redirect: 'follow' }); break; }
    catch (e) { if (attempt) return { error: String(e.cause && e.cause.code || e.message).slice(0, 60) }; await sleep(5000); }
  }
  if (r.status === 429 || r.status === 403) return { blocked: 'HTTP ' + r.status };
  if (!r.ok) return { error: 'HTTP ' + r.status };
  return { body: json ? await r.json().catch(() => null) : await r.text() };
}

async function main() {
  const fetchedAt = new Date().toISOString(), found = [], status = [];
  for (const q of GDELT) {
    const u = 'https://api.gdeltproject.org/api/v2/doc/doc?' + new URLSearchParams({ query: q, mode: 'artlist', format: 'json', maxrecords: '150', timespan: '3d', sort: 'datedesc' });
    const r = await get(u, true); await sleep(6000);   // GDELT asks for one request every few seconds
    const arts = (r.body && r.body.articles) || [];
    status.push(`GDELT "${q.slice(0, 40)}": ${r.body ? arts.length : r.skipped || r.blocked || r.error}`);
    arts.forEach(a => found.push({ title: a.title, url: a.url, source: a.domain || '', published_at: gdeltDate(a.seendate), lang: a.language === 'Hindi' ? 'hi' : 'en', summary: '', query: 'gdelt' }));
  }
  for (const [name, url] of FEEDS) {
    const r = await get(url, false), items = r.body ? parseFeed(r.body) : [];
    status.push(`${name}: ${r.body ? items.length + ' items' : r.skipped || r.blocked || r.error}`);
    items.forEach(i => found.push({ title: i.title, url: i.url, source: i.source || name, published_at: isoOf(i.published), lang: /[ऀ-ॿ]/.test(i.title) ? 'hi' : 'en', summary: i.summary, query: 'rss' }));
  }
  const since = Date.now() - 7 * 86400000, seen = new Set(), news = [];
  for (const n of found) {
    if (n.published_at && Date.parse(n.published_at) < since) continue;
    const c = classify(n.title, n.summary); if (!c) continue;
    const id = newsId(n.title); if (seen.has(id)) continue; seen.add(id);
    news.push(Object.assign({ news_id: id, fetched_at: fetchedAt }, n, { category: c.category, categories: c.categories.join(','), impact: c.impact, direction: c.direction, score: c.score }));
  }
  news.sort((a, b) => b.score - a.score || String(b.published_at).localeCompare(String(a.published_at)));
  status.forEach(s => console.log(s));
  console.log(`Relevant: ${news.length} of ${found.length} (${news.filter(n => n.impact === 'high').length} high impact).`);
  mkdirSync('research', { recursive: true }); writeFileSync('research/news.json', JSON.stringify({ fetched_at: fetchedAt, news }, null, 1));
  if (DRY || !KEY) { if (!KEY) console.log('::warning::FOUNDER_OS_KEY not set; news not sent.'); return; }
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'f.m.news.import', key: KEY, news: news.slice(0, 150) }), redirect: 'follow' });
  const j = await r.json(); if (!j.ok) throw new Error(j.error || 'request failed');
  console.log(`Founder OS: ${j.result.added} new stories, ${j.result.skipped} already there, ${j.result.alerted} high-impact alerts emailed.`);
}
main().catch(e => { console.error('News: ' + (e.message || e)); process.exit(1); });
