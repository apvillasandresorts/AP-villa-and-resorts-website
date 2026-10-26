#!/usr/bin/env node
// Market bots · orchestrator (GitHub Actions, twice a day; nothing runs on the owner's Mac).
//   node scripts/market-bots/run.mjs [--slot am|pm] [--only airbnb,booking] [--dry]
// 1. asks the Founder OS for the comp-set listings, every known competitor link and the high-demand nights (automation key, public data only)
// 2. runs one bot per platform (Airbnb, Booking.com, Agoda, OYO, Cleartrip, EaseMyTrip, Trip.com, StayVista) on robots.txt-allowed pages,
//    plus Google Hotels (SerpApi) for MakeMyTrip / Goibibo / Expedia and Apify for Airbnb discovery, when their keys exist
// 3. merges what it found into competitors (multi-platform links, distance, rating) and dated observations (price or sold out per platform)
// 4. writes research/bots-<date>-<slot>.json, then sends prices to f.m.market.import and the run report to f.m.bots.report
import { writeFileSync, mkdirSync } from 'node:fs';
import { session, closeBrowser, istDate, addDays } from './core.mjs';
import { bedroomsOf } from './extract.mjs';
import { serpApi } from './apis/serpapi.mjs';
import { apify } from './apis/apify.mjs';
import { affiliates } from './apis/affiliates.mjs';
import airbnb from './bots/airbnb.mjs';
import booking from './bots/booking.mjs';
import agoda from './bots/agoda.mjs';
import oyo from './bots/oyo.mjs';
import cleartrip from './bots/cleartrip.mjs';
import easemytrip from './bots/easemytrip.mjs';
import tripcom from './bots/tripcom.mjs';
import stayvista from './bots/stayvista.mjs';

const API = 'https://script.google.com/macros/s/AKfycbzmtIwOzGohnjEOfp7RZ1cU8JtwkCb6mEZiHEa8j_gknh-zkVbHz4oEV1Mu5xTaNpo7/exec';
const BOTS = [airbnb, booking, agoda, oyo, cleartrip, easemytrip, tripcom, stayvista];
const argv = process.argv.slice(2), arg = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const KEY = (process.env.FOUNDER_OS_KEY || '').trim(), DRY = argv.includes('--dry');
const ONLY = (arg('only') || '').split(',').filter(Boolean);
const PAGE_BOTS = ['airbnb', 'booking', 'agoda', 'oyo', 'cleartrip'], RETRY_MAX = 5;
/** Bots to re-run: failed, or no prices / sell-outs, or never reported today; blocked ones only after 3 hours; at most RETRY_MAX runs a day. */
export function retryList(runs, nowMs) {
  const by = {}; runs.forEach(r => { (by[r.bot] = by[r.bot] || []).push(r); });
  return PAGE_BOTS.concat(['serpapi']).filter(b => {
    const rs = (by[b] || []).sort((x, y) => String(x.at).localeCompare(String(y.at))), last = rs[rs.length - 1];
    if (!last) return true;
    if (rs.length >= RETRY_MAX) return false;
    if (rs.some(r => Number(r.prices) + Number(r.sold_out) > 0)) return false;
    if (last.status === 'blocked') return nowMs - Date.parse(last.at) >= 3 * 3600000 && !/not set|awaiting|nearly used/i.test(last.blocked || '');
    return true;
  });
}
const now = Date.now(), today = istDate(now), hourIst = new Date(now + 330 * 60000).getUTCHours();
const SLOT = arg('slot') || (hourIst < 14 ? 'am' : 'pm');
const SWEEP = Number(arg('sweep') || Math.max(0, Math.floor((new Date(now).getUTCHours() - 1) / 2)));   // 2-hourly runs at 01, 03 … 17 UTC → sweeps 0–8   // 'retry' = only the bots that failed or came back empty today

/** Founder OS call with retries: Google sometimes answers with an HTML error page, a lock timeout or a network error. 5 tries, 5 s → 2 min. */
async function call(action, body) {
  let last;
  for (const wait of [0, 5000, 15000, 45000, 120000]) {
    if (wait) { console.log(`  ${action}: retrying in ${wait / 1000}s (${last})`); await new Promise(r => setTimeout(r, wait)); }
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, key: KEY }, body)), redirect: 'follow', signal: AbortSignal.timeout(120000) });
      const text = await r.text(); let j;
      try { j = JSON.parse(text); } catch (e) { last = 'not JSON (HTTP ' + r.status + ')'; continue; }
      if (j.ok) return j;
      last = j.error || 'request failed';
      if (!/lock|timeout|too many|try again|service|internal|unavailable/i.test(last)) throw new Error(last);   // a real refusal: do not retry
    } catch (e) { if (e.message === last && !/lock|timeout|too many|try again|service|internal|unavailable/i.test(last)) throw e; last = String(e.message || e).slice(0, 120); }
  }
  throw new Error(action + ' failed after 5 tries: ' + last);
}
const nextDow = (d, dow) => { for (let i = 0; i < 8; i++) { const x = addDays(d, i); if (new Date(x + 'T00:00:00Z').getUTCDay() === dow && i > 0) return x; } return addDays(d, 7); };

/** Nights to check this run. AM: tonight, tomorrow, the coming Saturday, the next high-demand night. PM: the coming Friday, Saturday +7, +14, the next two high-demand nights. */
export function planDates(today, slot, hot, sweep) {
  const sat = nextDow(today, 6), fri = nextDow(today, 5), upcoming = (hot || []).filter(d => d > addDays(today, 1));
  const list = slot === 'pm' ? [fri, addDays(sat, 7), addDays(sat, 14), upcoming[1], upcoming[2]] : [today, addDays(today, 1), sat, upcoming[0]];
  const fixed = slot === 'sweep' ? [] : [...new Set(list.filter(Boolean))].slice(0, 4);
  // owner rule 26 Oct 2026: every night 2–45 days out gets a real market check 3 times a week. A night is due when its distance from
  // today is ≡ 0, 3 or 5 (mod 7), about 19 nights a day: the morning run takes 3, the evening run 3, and the 2-hourly sweeps 3 each.
  const due = [];
  for (let k = 2; k <= 45; k++) if ([0, 3, 5].indexOf(k % 7) >= 0) due.push(addDays(today, k));
  const part = slot === 'am' ? due.slice(0, 3) : slot === 'pm' ? due.slice(3, 6) : slot === 'sweep' ? due.slice(6 + 3 * (sweep || 0), 9 + 3 * (sweep || 0)) : [];
  return [...new Set(fixed.concat(part))];
}
const normName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|ujjain|near|mahakal|mahakaleshwar|temple|by|stay|stays|hotel)\b/g, ' ').replace(/\s+/g, ' ').trim();

async function main() {
  if (!KEY && !DRY) { console.log('::warning::FOUNDER_OS_KEY not set. Nothing to do.'); return; }
  const cs = KEY ? await call('f.m.compset', {}) : { listings: [], known: [], hot_dates: [] };   // --dry still reads the comp set; it only skips sending
  let dates = planDates(today, SLOT === 'retry' ? 'am' : SLOT, cs.hot_dates, SWEEP);
  if (SLOT === 'retry') {
    // 2-hourly run: first re-run any bot that failed or came back empty today; otherwise sweep this run's share of the due nights
    const st = await call('f.m.bots.status', {}), need = retryList(st.runs || [], Date.now());
    if (need.length) { console.log('Retry: ' + need.join(', ')); ONLY.splice(0, ONLY.length, ...need); }
    else {
      dates = planDates(today, 'sweep', cs.hot_dates, SWEEP);
      if (!dates.length) { console.log('Every bot has data today and no nights are due in this sweep. Nothing to do.'); return; }
      console.log('Sweep ' + SWEEP + ': nights due for their thrice-weekly check'); if (!ONLY.length) ONLY.push(...BOTS.map(b => b.id));   // page bots only: the free API quotas stay for the main runs
    }
  }
  console.log(`Run ${today} ${SLOT}: nights ${dates.join(', ')}; ${cs.listings.length} comp-set listings, ${cs.known.length} known competitors.`);
  const known = cs.known.map(k => Object.assign({}, k, { urls: new Set(k.listing_urls || []) })), byUrl = {}, byName = {};
  known.forEach(k => { k.urls.forEach(u => { byUrl[u.split('?')[0]] = k; }); byName[normName(k.name)] = k; });
  const rates = [], competitors = {}, runs = [], samples = {};
  const compOf = (name, url, extra) => {   // merge by link, then by name; new ones are created
    const u = (url || '').split('?')[0], k = byUrl[u] || byName[normName(name)];
    const key = k ? k.name : name; const c = competitors[key] = competitors[key] || { name: key, listing_urls: k ? [...k.urls] : [], source_url: u, last_checked: today };
    if (u && c.listing_urls.indexOf(u) < 0) c.listing_urls.push(u);
    // fill only what is unknown: a bot never overwrites the type, size or distance already on file
    Object.entries(extra || {}).forEach(([f, v]) => { if (v != null && v !== '' && !(v !== v) && (c[f] == null || c[f] === '') && !(k && k[f] != null && k[f] !== '')) c[f] = v; });
    if (!k) { const nk = { name: key, urls: new Set(c.listing_urls) }; byName[normName(key)] = nk; if (u) byUrl[u] = nk; }
    return c;
  };
  const obs = (c, platform, date, adults, url, q, target, how) => {
    if (!q || (q.price == null && !q.sold_out)) return false;
    if (q.price != null && !(q.price >= 300 && q.price <= 200000)) return false;   // implausible read: drop, never guess
    rates.push({ competitor: c.name, observed_at: today, stay_date: date, nights: 1, price_total: q.price || '', price_per_night: q.price || '', availability: q.sold_out ? 'sold out' : 'available',
      taxes_included: q.taxes_included || 'unknown', source_type: 'ota', source_url: url.split('?')[0], confidence: how === 'api' ? 'medium' : 'high', group_size: adults, target_property: target || '', platform, notes: how === 'api' ? 'Google Hotels (SerpApi)' : 'market bot' });
    return true;
  };

  // ---------------- page bots ----------------
  for (const bot of BOTS) {
    if (ONLY.length && ONLY.indexOf(bot.id) < 0) continue;
    const s = session(bot.platform, { budget: bot.id === 'airbnb' ? 80 : 56 }), st = { bot: bot.id, platform: bot.platform, mode: 'pages', prices: 0, sold_out: 0, discovered: 0 };
    try {
      if (bot.discover) {
        const found = await bot.discover(s, dates[0]);
        found.forEach(f => { const isNew = !(byUrl[f.href] || byName[normName(f.name)]); const c = compOf(f.name, f.href, { type: f.type || (bot.id === 'airbnb' ? 'homestay' : 'hotel'), bedrooms: bedroomsOf(f.name), review_themes: f.rating ? `${bot.platform} rating ${f.rating}${f.reviews ? ' from ' + f.reviews + ' reviews' : ''}` : '' });
          if (isNew) st.discovered++; if (f.date && f.price) { obs(c, bot.platform, f.date, f.adults || 2, f.href, { price: f.price, taxes_included: f.taxes_included }, '', 'page') && st.prices++; } });
      }
      if (bot.quote) {
        // comp-set listings first (each at its villa's group size), then other known links on this platform while budget lasts
        const mine = cs.listings.filter(l => bot.match(l.url));
        // other links on this platform: competitors already on file elsewhere first (same property, another platform), then new ones
        const others = known.concat(Object.values(byName).filter(k => known.indexOf(k) < 0)).filter(k => [...(k.urls || [])].some(u => bot.match(u)) && !mine.some(m => m.name === k.name))
          .sort((a, b) => (b.listing_urls ? 1 : 0) - (a.listing_urls ? 1 : 0)).slice(0, mine.length ? 10 : 16);
        const jobs = [];
        // a hotel is priced for one room of 2 adults (the dashboard compares a villa with 2 hotel rooms); whole homes at the villa's group size
        mine.forEach(l => dates.forEach(d => jobs.push({ name: l.name, url: l.url, date: d, adults: l.hotel ? 2 : l.adults, target: l.property })));
        others.forEach(k => jobs.push({ name: k.name, url: [...k.urls].find(u => bot.match(u)), date: dates[dates.length > 2 ? 2 : 0], adults: 2, target: '' }));
        const seen = new Set();
        for (const j of jobs) {
          const id = j.url + j.date + j.adults; if (seen.has(id)) continue; seen.add(id);
          s.last = null; const q = await bot.quote(s, j.url, j.date, j.adults); if (s.blocked) break;
          if (!q) continue;
          if (q.price == null && !q.sold_out && DRY) s.sample(j.url, s.last);
          const c = compOf(j.name, j.url, { distance_km: q.distance_km, bedrooms: bedroomsOf(q.title || j.name) });
          if (obs(c, bot.platform, j.date, j.adults, j.url, q, j.target, 'page')) { q.sold_out ? st.sold_out++ : st.prices++; }
        }
      }
    } catch (e) { st.error = String(e.message || e).slice(0, 200); }
    if (DRY && s.samples.length) samples[bot.id] = s.samples;
    runs.push(Object.assign(st, s.report()));
    console.log(`${bot.platform}: ${st.pages} pages, ${st.prices} prices, ${st.sold_out} sold out, ${st.discovered} new${st.blocked ? ', BLOCKED (' + st.blocked + ')' : ''}${st.error ? ', error: ' + st.error : ''}`);
  }
  await closeBrowser();

  // ---------------- Google Hotels (SerpApi): MakeMyTrip, Goibibo, Expedia and every OTA Google compares ----------------
  if (process.env.SERPAPI_KEY && (!ONLY.length || ONLY.indexOf('serpapi') >= 0)) {
    const sp = serpApi(process.env.SERPAPI_KEY), st = { bot: 'serpapi', platform: 'Google Hotels', mode: 'api', pages: 0, prices: 0, sold_out: 0, discovered: 0 };
    try {
      const left = await sp.left(), reserve = 20, perRun = SLOT === 'am' ? 5 : 2;   // ≈ 7 searches a day ≈ 210 a month (the news backup uses ≈ 30)
      if (left - perRun < reserve) st.blocked = `free searches nearly used up (${left} left this month)`;
      else {
        const d = dates[SLOT === 'am' ? 2 : 0] || dates[0], next = addDays(d, 1);
        const lists = [await sp.list(d, next, 2, false)]; if (SLOT === 'am') lists.push(await sp.list(d, next, 4, true));
        const props = lists.flat();
        props.forEach(p => {
          if (p.distance_km != null && p.distance_km > 6) return;
          const isNew = !byName[normName(p.name)];
          const c = compOf(p.name, p.link || '', { type: p.kind === 'vacation rental' ? 'homestay' : 'hotel', distance_km: p.distance_km, bedrooms: p.bedrooms, sleeps: p.sleeps, review_themes: p.rating ? `Google rating ${p.rating} from ${p.reviews || 0} reviews` : '' });
          if (isNew) st.discovered++;
          (p.prices.length ? p.prices : p.lowest ? [{ platform: 'Google Hotels (lowest)', price: p.lowest }] : []).forEach(x => { obs(c, x.platform, d, p.kind === 'vacation rental' ? 4 : 2, p.link || 'https://www.google.com/travel/hotels', { price: x.price, taxes_included: 'unknown' }, '', 'api') && st.prices++; });
        });
        // per-property OTA prices for comp-set hotels (rotating), the only source for MakeMyTrip and Goibibo
        const hotels = props.filter(p => p.token && cs.listings.some(l => l.hotel && normName(l.name) === normName(p.name)));
        for (const p of hotels.slice(0, perRun - lists.length)) {
          const prices = await sp.property(p.token, d, next, 2), c = compOf(p.name, '', {});
          prices.forEach(x => { obs(c, x.platform, d, 2, x.link || p.link || 'https://www.google.com/travel/hotels', { price: x.price }, '', 'api') && st.prices++; });
        }
      }
    } catch (e) { st.error = String(e.message || e).slice(0, 200); }
    st.pages = sp.used; runs.push(st);
    console.log(`Google Hotels: ${st.pages} searches, ${st.prices} prices, ${st.discovered} new${st.blocked ? ', paused: ' + st.blocked : ''}${st.error ? ', error: ' + st.error : ''}`);
  } else runs.push({ bot: 'serpapi', platform: 'Google Hotels', mode: 'api', blocked: 'SERPAPI_KEY not set yet', pages: 0 });

  // ---------------- Apify: Airbnb discovery (weekly on Mondays, AM) and Booking.com fallback when our Booking bot was blocked ----------------
  if (process.env.APIFY_TOKEN && (!ONLY.length || ONLY.indexOf('apify') >= 0)) {
    const ap = apify(process.env.APIFY_TOKEN), st = { bot: 'apify', platform: 'Apify', mode: 'api', pages: 0, prices: 0, sold_out: 0, discovered: 0 };
    try {
      // free plan guard: Airbnb listings cost ~$0.004 and Booking results ~$0.005 each; stop at $4 of the month's $5
      const u = await ap.usage(), room = Math.min(4, u.limit - 1) - u.used;
      const monday = new Date(today + 'T00:00:00Z').getUTCDay() === 1, dayNo = Math.floor(Date.parse(today) / 86400000);
      if (room < 0.4) st.blocked = `free credit nearly used ($${u.used.toFixed(2)} of $${u.limit} this month)`;
      else if ((monday && SLOT === 'am') || argv.includes('--apify-now')) {
        for (const adults of [4, 6]) {
          const d = dates[2] || dates[0], items = await ap.airbnb(d, addDays(d, 1), adults, 40); st.pages++;
          items.filter(i => i.type === 'homestay' && (i.distance_km == null || i.distance_km <= 6)).forEach(i => {
            const isNew = !(byUrl[i.url] || byName[normName(i.name)]);
            const c = compOf(i.name, i.url, { type: 'homestay', bedrooms: i.bedrooms, distance_km: i.distance_km, review_themes: i.rating ? `Airbnb rating ${i.rating} from ${i.reviews || 0} reviews` : '' });
            if (isNew) st.discovered++;
            if (i.price) obs(c, 'Airbnb', d, adults, i.url, { price: i.price, taxes_included: 'yes' }, '', 'api') && st.prices++;
          });
        }
      }
      const bk = runs.find(r => r.bot === 'booking');
      if (!st.blocked && bk && bk.blocked && SLOT === 'am' && dayNo % 2 === 0) {   // fallback every other morning, 20 results (≈ $1.5 a month)
        const d = dates[0], items = await ap.booking(d, addDays(d, 1), 2, 20); st.pages++;
        items.forEach(i => { const c = compOf(i.name, i.url, { distance_km: i.distance_km }); if (i.price) obs(c, 'Booking.com', d, 2, i.url, { price: i.price, taxes_included: 'unknown' }, '', 'api') && st.prices++; });
      }
    } catch (e) { st.error = String(e.message || e).slice(0, 200); }
    runs.push(st); console.log(`Apify: ${st.pages} runs, ${st.prices} prices, ${st.discovered} new${st.error ? ', error: ' + st.error : ''}`);
  } else runs.push({ bot: 'apify', platform: 'Apify', mode: 'api', blocked: 'APIFY_TOKEN not set yet', pages: 0 });

  const aff = affiliates(process.env);
  runs.push({ bot: 'booking-affiliate', platform: 'Booking.com API', mode: 'api', blocked: aff.booking === 'configured' ? '' : 'awaiting approval', pages: 0 });
  runs.push({ bot: 'agoda-affiliate', platform: 'Agoda API', mode: 'api', blocked: aff.agoda === 'configured' ? '' : 'awaiting approval', pages: 0 });

  const out = { collected_at: today, slot: SLOT, dates, competitors: Object.values(competitors).map(c => Object.assign({}, c, { listing_urls: c.listing_urls.join('\n') })), rates, runs };
  mkdirSync('research', { recursive: true }); const file = `research/bots-${today}-${SLOT}.json`; writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`Saved ${file}: ${out.competitors.length} competitors, ${rates.length} observations (${rates.filter(r => r.availability === 'sold out').length} sold out).`);
  if (DRY) { if (Object.keys(samples).length) { writeFileSync(`research/bots-samples-${today}-${SLOT}.json`, JSON.stringify(samples, null, 1)); console.log('Saved unreadable-page samples for: ' + Object.keys(samples).join(', ')); } return; }
  for (let i = 0; i < Math.max(out.competitors.length, rates.length); i += 75) {
    const r = (await call('f.m.market.import', { competitors: out.competitors.slice(i, i + 75), rates: rates.slice(i, i + 75) })).result;
    console.log(`Founder OS: ${r.competitors} competitors, ${r.rates} new observations, ${r.skipped} already there, ${r.rejected} rejected.`);
  }
  await call('f.m.bots.report', { run_id: `${today}-${SLOT}`, runs });
}
if (import.meta.url === 'file://' + process.argv[1]) main().catch(e => { console.error('Market bots: ' + (e.message || e)); process.exit(1); });
