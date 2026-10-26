// Search demand from Google Trends (daily interest, India): are people searching for stays in Ujjain more or less than usual?
// Pure functions (tested in tests/search-demand.test.mjs); the fetching is in run.mjs.
export const BASKETS = {
  // stay intent: what a family types before booking a room near Mahakal
  stay: ['hotels in ujjain', 'ujjain hotel', 'hotel in ujjain', 'ujjain hotels', 'ujjain homestay'],
  // pilgrimage interest: an earlier, broader sign of trips being planned
  pilgrim: ['mahakal darshan', 'mahakaleshwar', 'bhasma aarti booking', 'ujjain', 'उज्जैन'],
};
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Parse a Trends multiline answer (")]}'," prefix) into { keyword: [{ date, value }] }, dropping today's partial point. */
export function parseMultiline(text, keywords) {
  const j = JSON.parse(String(text).slice(String(text).indexOf('{'))), out = {};
  keywords.forEach(k => { out[k] = []; });
  (j.default && j.default.timelineData || []).forEach(p => {
    if (p.isPartial) return;
    const date = new Date(Number(p.time) * 1000 + 330 * 60000).toISOString().slice(0, 10);
    keywords.forEach((k, i) => { const v = Number((p.value || [])[i]); if (Number.isFinite(v)) out[k].push({ date, value: v }); });
  });
  return out;
}
/** Same shape from SerpApi's google_trends engine (backup when Trends refuses a cloud address). */
export function parseSerpApi(j, keywords) {
  const out = {}; keywords.forEach(k => { out[k] = []; });
  (j.interest_over_time && j.interest_over_time.timeline_data || []).forEach(p => {
    if (p.partial_data) return;
    const date = new Date(Number(p.timestamp) * 1000 + 330 * 60000).toISOString().slice(0, 10);
    (p.values || []).forEach(v => { const k = keywords.find(x => x.toLowerCase() === String(v.query).toLowerCase()); if (k) out[k].push({ date, value: Number(v.extracted_value) }); });
  });
  return out;
}
/**
 * One keyword: last 7 complete days vs the 8 weeks before (same length windows averaged), plus the last 3 days vs the 7 before
 * (is it rising right now). Needs a usable baseline (average ≥ 3 on Trends' 0–100 scale), otherwise null.
 */
export function keywordIndex(series) {
  const s = (series || []).slice().sort((a, b) => a.date < b.date ? -1 : 1).map(x => x.value);
  if (s.length < 35) return null;
  const recent = mean(s.slice(-7)), base = mean(s.slice(-63, -7));
  if (!(base >= 3)) return null;
  const r3 = mean(s.slice(-3)), p7 = mean(s.slice(-10, -3));
  return { index: recent / base, rising: p7 >= 3 ? r3 / p7 : null, recent: Math.round(recent * 10) / 10, base: Math.round(base * 10) / 10 };
}
/** Basket index: median keyword index of each basket, stay intent weighted 0.7, pilgrimage 0.3; bounded 0.6–1.6. */
export function demandIndex(byKeyword) {
  const parts = {};
  Object.entries(BASKETS).forEach(([b, kws]) => {
    const ks = kws.map(k => [k, keywordIndex(byKeyword[k])]).filter(x => x[1]);
    parts[b] = ks.length ? { index: median(ks.map(x => x[1].index)), rising: median(ks.map(x => x[1].rising).filter(v => v != null)), keywords: Object.fromEntries(ks.map(([k, v]) => [k, Math.round(v.index * 100) / 100])) } : null;
  });
  // Wikipedia readers of the Ujjain / Mahakaleshwar articles: exact daily counts, an independent check on the Trends curve
  const wk = Object.keys(byKeyword).filter(k => /^wiki:/.test(k)).map(k => keywordIndex(byKeyword[k])).filter(Boolean);
  parts.wiki = wk.length ? { index: median(wk.map(x => x.index)), rising: median(wk.map(x => x.rising).filter(v => v != null)), keywords: {} } : null;
  const st = parts.stay, pg = parts.pilgrim, wi = parts.wiki;
  if (!st && !pg) return null;
  const ws = [[st, 0.6], [pg, 0.25], [wi, 0.15]].filter(x => x[0]), tw = ws.reduce((a, x) => a + x[1], 0);
  const index = ws.reduce((a, x) => a + x[0].index * x[1], 0) / tw;
  const rising = st && st.rising != null ? st.rising : pg && pg.rising;
  return { index: clamp(index, 0.6, 1.6), rising: rising == null ? null : Math.round(rising * 100) / 100, parts };
}
/**
 * Dated desk signals for the next 45 nights: today's search level matters most for nights 0–7 days away (people book a few days
 * before a temple trip), fading to 20% of its effect by 45 days. A rise in the last 3 days adds a little extra for the next week.
 */
export function searchSignals(d, today, fetchedAt, sourceUrl) {
  if (!d) return [];
  const out = [], add = n => new Date(Date.parse(today + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const boost = d.rising != null && d.rising > 1.1 ? Math.min(0.08, (d.rising - 1) * 0.2) : d.rising != null && d.rising < 0.9 ? Math.max(-0.08, (d.rising - 1) * 0.2) : 0;
  const kw = Object.entries((d.parts.stay || d.parts.pilgrim).keywords).map(([k, v]) => k + ' ' + v).join(', ');
  for (let n = 0; n <= 45; n++) {
    const w = n <= 7 ? 1 : n >= 45 ? 0.2 : 1 - 0.8 * (n - 7) / 38, idx = clamp(1 + (d.index - 1) * w + (n <= 7 ? boost : 0), 0.6, 1.6);
    out.push({ signal_id: 'search_market', for_date: add(n), index: Math.round(idx * 1000) / 1000, source_url: sourceUrl, fetched_at: fetchedAt,
      raw_value: 'searches ×' + d.index.toFixed(2) + ' vs usual' + (d.rising != null ? ', last 3 days ×' + d.rising.toFixed(2) : ''), notes: (kw + (n > 7 ? ' (weight ' + Math.round(w * 100) + '% this far ahead)' : '')).slice(0, 290) });
  }
  return out;
}

// ------------------------------------------------------------ keyword report (SEO & marketing → Ujjain searches) ------------------------------------------------------------
/** Trends related queries: top (0–100, relative to the most searched) and rising ("+250%" or "Breakout"). */
export function parseRelated(text) {
  const j = JSON.parse(String(text).slice(String(text).indexOf('{'))), L = (j.default && j.default.rankedList) || [];
  const pick = l => ((l && l.rankedKeyword) || []).map(k => ({ query: String(k.query).toLowerCase().trim(), value: Number(k.value), label: String(k.formattedValue || k.value) }));
  return { top: pick(L[0]), rising: pick(L[1]) };
}
/**
 * Daily series from several Trends requests on one scale: every request carries the same anchor keyword, each request is rescaled so
 * the anchor's average over its last 30 days = 100. A keyword at 50 is searched about half as often as the anchor.
 */
export function onAnchorScale(groups, anchor) {
  const out = {};
  groups.forEach(g => {
    const a = (g[anchor] || []).slice(-30).map(x => x.value), m = a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    if (!(m > 0)) return;
    Object.entries(g).forEach(([k, s]) => { if (!out[k] || k !== anchor) out[k] = s.map(x => ({ date: x.date, value: Math.round(x.value * 100 / m * 10) / 10 })); });
  });
  return out;
}
/** One row per keyword: latest full day, 7-day and 30-day averages, change, and the 30-day series (all on the anchor scale). */
export function keywordRows(scaled, meta, perDayAnchor) {
  return Object.entries(scaled).map(([k, s]) => {
    const v = s.map(x => x.value), last = v[v.length - 1], a7 = mean(v.slice(-7)), a30 = mean(v.slice(-30));
    const est = perDayAnchor ? x => Math.round(x / 100 * perDayAnchor) : () => null;
    return Object.assign({ keyword: k, latest_date: (s[s.length - 1] || {}).date || '', latest: last, avg7: a7 == null ? null : Math.round(a7 * 10) / 10, avg30: a30 == null ? null : Math.round(a30 * 10) / 10,
      change: a30 ? Math.round((a7 / a30 - 1) * 100) : null, est_daily: est(a7 || 0), series: s.slice(-30).map(x => x.value) }, meta[k] || {});
  }).sort((a, b) => (b.avg7 || 0) - (a.avg7 || 0));
}
/** Wikipedia pageviews (official Wikimedia REST API): exact daily readers of an article. */
export function parseWiki(j) { return ((j && j.items) || []).map(x => ({ date: `${x.timestamp.slice(0, 4)}-${x.timestamp.slice(4, 6)}-${x.timestamp.slice(6, 8)}`, value: Number(x.views) })); }
