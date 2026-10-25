// Market bots · shared runtime: robots.txt (RFC 9309), polite paging with a headless browser, budgets, stop-on-challenge, run log.
// Rules (owner, 25 Oct 2026): public pages only, robots.txt honoured, no login, no CAPTCHA solving, no bot-detection bypass,
// a few seconds between pages, stop a platform at the first challenge / 403 / 429 and report it as "blocked".
import { challenged } from './extract.mjs';

export const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 APVillasPriceBot/1.0 (+https://www.apvillasandresorts.in)';
export const BOT = 'APVillasPriceBot';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const istDate = (ms = Date.now()) => new Date(ms + 330 * 60000).toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- robots.txt ----------------------------------------------------------------
function groupsOf(txt) {
  const groups = []; let cur = null, lastUA = false;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastUA) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastUA = true; }
    else { lastUA = false; if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v }); }
  }
  return groups;
}
function len(pattern, path) {
  if (!pattern) return -1;
  const re = new RegExp('^' + pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  return re.test(path) ? pattern.length : -1;
}
/** Longest match wins, Allow wins ties; our own user-agent group if one exists, otherwise '*'. */
export function robotsAllows(txt, path, ua = BOT) {
  const gs = groupsOf(txt), mine = gs.filter(g => g.agents.some(a => a !== '*' && ua.toLowerCase().includes(a)));
  let best = { l: -1, allow: true };
  for (const r of (mine.length ? mine : gs.filter(g => g.agents.includes('*'))).flatMap(g => g.rules)) { const l = len(r.path, path); if (l > best.l || (l === best.l && r.allow)) best = { l, allow: r.allow }; }
  return best.l < 0 ? true : best.allow;
}
const robotsCache = {};
export async function robotsFor(origin) {
  if (robotsCache[origin] !== undefined) return robotsCache[origin];
  for (let attempt = 0; attempt < 3 && robotsCache[origin] === undefined; attempt++) {   // network hiccups are retried; a missing robots.txt (4xx) means no rules
    try { const r = await fetch(origin + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) }); robotsCache[origin] = r.ok ? await r.text() : (r.status >= 400 && r.status < 500 && r.status !== 403 && r.status !== 429 ? '' : null); }
    catch (e) { if (attempt === 2) robotsCache[origin] = null; else await sleep(3000); }
  }
  return robotsCache[origin];   // null = could not read robots.txt: treat the whole site as off-limits
}
export async function mayFetch(url) {
  const u = new URL(url), txt = await robotsFor(u.origin);
  if (txt === null) return false;
  return robotsAllows(txt, u.pathname + u.search);
}

// ---------------------------------------------------------------- browser session per platform ----------------------------------------------------------------
let browserP = null;
async function browser() {
  if (!browserP) { const { chromium } = await import('playwright'); browserP = chromium.launch({ headless: true }); browserP.catch(() => { browserP = null; }); }
  return browserP;
}
export async function closeBrowser() { if (browserP) { try { const b = await browserP; await b.close(); } catch (e) { /* never started */ } browserP = null; } }

/**
 * A platform session: budget of page loads, polite delay, robots check per URL, and a hard stop on the first challenge.
 * open(url, waitMs, inPage) → { text, html, title, status, extra } or null (skipped: robots, budget, or the platform is blocked).
 * inPage(page) runs while the page is open (e.g. collecting cards on a list page).
 */
export function session(platform, opts = {}) {
  const s = { platform, budget: opts.budget || 40, pages: 0, blocked: null, skipped: 0, errors: 0, log: [], samples: [] };
  let ctxP = null;
  async function ctx() { if (!ctxP) ctxP = (await browser()).newContext({ userAgent: UA, locale: 'en-IN', timezoneId: 'Asia/Kolkata', viewport: { width: 1280, height: 900 } }); return ctxP; }
  s.open = async function (url, waitMs = 6000, inPage, retry) {
    if (s.blocked) return null;
    if (s.pages >= s.budget && !retry) { s.skipped++; return null; }
    if (!(await mayFetch(url))) { s.skipped++; s.log.push('robots.txt disallows ' + new URL(url).pathname); return null; }
    if (s.pages > 0) await sleep((opts.delayMs || 5000) + Math.round(Math.random() * 3000));
    s.pages++;
    let page; try { page = await (await ctx()).newPage(); } catch (e) { s.blocked = 'browser could not start: ' + String(e.message || e).split('\n')[0].slice(0, 80); return null; }
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const status = resp ? resp.status() : 0;
      if (status === 403 || status === 429) { s.blocked = 'HTTP ' + status; return null; }
      await page.waitForTimeout(waitMs);
      // prices on hotel pages load lazily below the fold: scroll through the page once, then read
      await page.evaluate(async () => { for (const f of [0.35, 0.7, 1]) { window.scrollTo(0, document.body.scrollHeight * f); await new Promise(r => setTimeout(r, 900)); } window.scrollTo(0, 0); }).catch(() => {});
      await page.waitForTimeout(1200);
      const [text, html, title] = await Promise.all([page.evaluate(() => document.body ? document.body.innerText : ''), page.content(), page.title()]);
      if (challenged(text, title)) { s.blocked = 'challenge page'; s.samples.push({ url, title, text: text.slice(0, 800) }); return null; }
      return { text, html, title, status, extra: inPage ? await inPage(page) : null };
    } catch (e) {
      s.errors++; s.log.push(String(e.message || e).slice(0, 160));
      if (!retry && /timeout|net::|ERR_|closed/i.test(String(e.message || e))) { await sleep(10000); return s.open(url, waitMs, inPage, true); }   // one more try for a load failure
      return null;
    }
    finally { await page.close().catch(() => {}); }
  };
  /** Dry-run debugging: keep what an unreadable page showed (public page text only, first 1500 characters). */
  s.sample = (url, p) => {
    if (!p || s.samples.length >= 6) return;
    const t = String(p.text || ''), wins = [];
    for (const m of t.matchAll(/₹|Rs\.?\s?\d|INR\s?\d|US\$|sold out|no availability/gi)) { if (wins.length >= 8) break; if (!wins.length || m.index > wins[wins.length - 1] + 250) wins.push(m.index); }
    const html = String(p.html || ''), hp = [...html.matchAll(/(?:price|prco|bui-price)[^>]{0,80}>[^<]{0,40}₹/gi)].slice(0, 4).map(m => html.slice(Math.max(0, m.index - 80), m.index + 200));
    s.samples.push({ url, title: p.title, head: t.slice(0, 400), windows: wins.map(i => t.slice(Math.max(0, i - 150), i + 250)), html: hp, length: t.length });
  };
  s.report = () => ({ platform, pages: s.pages, skipped: s.skipped, errors: s.errors, blocked: s.blocked || '', note: s.log.slice(0, 5).join(' | ') });
  return s;
}

/** Collect card candidates (link + surrounding card text) from a list page, inside the browser. */
export async function harvestCards(page, linkSelector) {
  return page.evaluate(sel => [...document.querySelectorAll(sel)].map(a => {
    let el = a, text = '';
    for (let i = 0; i < 8 && el; i++) { el = el.parentElement; if (el && /₹|Rs\.?\s?\d/.test(el.innerText) && el.innerText.length < 1800) { text = el.innerText; break; } }
    return { href: a.href, name: (a.getAttribute('title') || a.innerText || '').trim().split('\n')[0], text };
  }), linkSelector);
}
