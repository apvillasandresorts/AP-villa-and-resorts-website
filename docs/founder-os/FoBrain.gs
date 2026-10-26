/**
 * AP Villas Founder OS · AP Brain (the AI assistant inside the portal), added to the e-check-in Apps Script project.
 *
 * Free models only (owner rule: zero paid services): Groq first (open Llama models, free tier), Google Gemini (free tier) when Groq
 * is busy, over its limit or not set up. Keys live ONLY in Script Properties: GROQ_API_KEY, GEMINI_API_KEY (optional GROQ_MODEL,
 * GEMINI_MODEL). No key = the brain says so; nothing else breaks.
 *
 * Privacy: the model only ever receives a business summary built here (totals, occupancy, prices, competitor medians, public news
 * headlines, system status). Never guest names, phones, emails, ID numbers or booking references. Questions and history are scrubbed
 * of emails/phone/ID-like numbers before they leave Google. Answers are advice only: the brain cannot change data.
 */
const FO_BRAIN = { PER_DAY: 150, MAX_Q: 1200, MAX_HISTORY: 6, GROQ_MODEL: 'llama-3.3-70b-versatile', GEMINI_MODEL: 'gemini-2.5-flash' };

const FO_BRAIN_SYSTEM = [
  'You are "AP Brain", the business analyst for AP Villas & Resorts: five owner-operated holiday villas within 2 km of Mahakaleshwar Jyotirlinga, Ujjain (India).',
  'The owner, Apoorv, runs it himself. You get a JSON summary of the business (ledger totals, occupancy, pricing desk, competitors, news, website, system health).',
  'Rules: use only figures in the summary; if something is missing say what data is needed instead of guessing. Never invent revenue, occupancy, competitor or market numbers.',
  'Label statements FACT (from the data), ESTIMATE (calculated), or RECOMMENDATION. Money in Indian rupees (₹, Indian digit grouping).',
  'Be short and practical: lead with the answer, then up to 5 bullets, then one next step. Reply in Hindi if the question is in Hindi.',
  'You only advise; you cannot change prices, bookings or settings. For pricing, the Pricing Desk figure is the starting point: explain it, do not override it without a reason from the data.',
].join('\n');

/** Route: f.brain.ask { question, history: [{role, text}], page } → { answer, provider, model, context_at }. */
function foBrainAsk_(b, user) {
  const q = foBrainScrub_(String(b.question || '').trim()).slice(0, FO_BRAIN.MAX_Q);
  if (!q) return { ok: false, error: 'Type a question first.' };
  if (foCounter_('FO_BRAIN_' + foHmac_(user.email).slice(0, 12), 86400) > FO_BRAIN.PER_DAY) return { ok: false, error: 'AP Brain has answered ' + FO_BRAIN.PER_DAY + ' questions in the last 24 hours. Please try again tomorrow.' };
  const ctx = foBrainContext_(), hist = (Array.isArray(b.history) ? b.history : []).slice(-FO_BRAIN.MAX_HISTORY)
    .map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', text: foBrainScrub_(String(h.text || '')).slice(0, 2000) })).filter(h => h.text);
  const page = String(b.page || '').replace(/[^\w\/ -]/g, '').slice(0, 40);
  const prompt = 'BUSINESS SUMMARY (' + ctx.as_of + '):\n' + JSON.stringify(ctx) + (page ? '\n\nThe owner is looking at: ' + page : '') + '\n\nQUESTION: ' + q;
  const t0 = Date.now(), r = foBrainCall_(FO_BRAIN_SYSTEM, hist, prompt);
  foBrainLog_(user.email, q, r, Date.now() - t0);
  if (!r.ok) return { ok: false, error: r.error, setup: r.setup || false };
  return { answer: r.text, provider: r.provider, model: r.model, context_at: ctx.as_of };
}

/** Route: f.brain.status → which providers are set up (never the keys). */
function foBrainStatus_() {
  const p = PropertiesService.getScriptProperties();
  return { groq: !!p.getProperty('GROQ_API_KEY'), gemini: !!p.getProperty('GEMINI_API_KEY'), daily_brief: foSettings_().brain_daily !== 'off',
    asked_today: foRows_('BrainLog').filter(r => String(r.asked_at).slice(0, 10) === foToday_()).length };
}

/** Groq, then Gemini. Each provider: one retry on 429/5xx. Returns { ok, text, provider, model } or { ok:false, error }. */
function foBrainCall_(system, history, prompt) {
  const p = PropertiesService.getScriptProperties(), groq = p.getProperty('GROQ_API_KEY'), gem = p.getProperty('GEMINI_API_KEY'), errs = [];
  if (!groq && !gem) return { ok: false, setup: true, error: 'AP Brain is not switched on yet: add a free Groq or Gemini key in Script Properties (see docs/founder-os/README.md → AP Brain).' };
  const tryTwice = fn => { let r = fn(); if (!r.ok && r.retry) { Utilities.sleep(1500); r = fn(); } return r; };
  if (groq) {
    const model = p.getProperty('GROQ_MODEL') || FO_BRAIN.GROQ_MODEL;
    const r = tryTwice(() => foBrainHttp_('https://api.groq.com/openai/v1/chat/completions', { Authorization: 'Bearer ' + groq },
      { model, temperature: 0.3, max_tokens: 1200, messages: [{ role: 'system', content: system }].concat(history.map(h => ({ role: h.role, content: h.text })), [{ role: 'user', content: prompt }]) },
      j => j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content));
    if (r.ok) return Object.assign(r, { provider: 'Groq', model });
    errs.push('Groq: ' + r.error);
  }
  if (gem) {
    const model = p.getProperty('GEMINI_MODEL') || FO_BRAIN.GEMINI_MODEL;
    const r = tryTwice(() => foBrainHttp_('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', { 'x-goog-api-key': gem },
      { systemInstruction: { parts: [{ text: system }] }, generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
        contents: history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })).concat([{ role: 'user', parts: [{ text: prompt }] }]) },
      j => j.candidates && j.candidates[0] && j.candidates[0].content && (j.candidates[0].content.parts || []).map(x => x.text || '').join('')));
    if (r.ok) return Object.assign(r, { provider: 'Gemini', model });
    errs.push('Gemini: ' + r.error);
  }
  foLogError_('brain', errs.join(' | '));
  return { ok: false, error: 'AP Brain could not get an answer right now (' + errs.join('; ') + '). Please try again in a minute.' };
}
function foBrainHttp_(url, headers, body, pick) {
  let res;
  try { res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers, payload: JSON.stringify(body), muteHttpExceptions: true }); }
  catch (e) { return { ok: false, retry: true, error: 'network' }; }
  const code = res.getResponseCode(); let j = null; try { j = JSON.parse(res.getContentText()); } catch (e) {}
  if (code !== 200) return { ok: false, retry: code === 429 || code >= 500, error: 'HTTP ' + code + (code === 401 || code === 403 ? ' (key not accepted)' : code === 429 ? ' (free limit reached)' : '') };
  const text = j && pick(j);
  return text ? { ok: true, text: String(text).trim().slice(0, 8000) } : { ok: false, error: 'empty answer' };
}
function foLogError_(where, msg) { try { foAudit_('system', where, String(msg).slice(0, 300), 'error'); } catch (e) {} }

/** Emails, phone numbers and ID-like digit runs never leave Google. */
function foBrainScrub_(s) {
  return String(s || '').replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '[phone]').replace(/\b\d(?:[\s-]?\d){9,15}\b/g, '[number]');
}

/** The business summary the model sees. Aggregates only; built fresh (cached 10 minutes). */
function foBrainContext_() {
  const hit = foCacheGet_('FO_BRAIN_CTX'); if (hit) return hit;
  const D = foDataLoad_(), today = foToday_(), add = FoMetrics.addDays, r0 = n => Math.round(Number(n) || 0), pc = v => v == null ? null : Math.round(v * 1000) / 10;
  const per = (from, to) => { const m = FoMetrics.compute(D, from, to); return { from, to, occupancy_pct: pc(m.occupancy), occupied_nights: m.occupied_nights, available_nights: m.available_nights, revenue_inr: r0(m.net_accommodation_revenue), adr_inr: r0(m.adr), bookings_made: m.bookings_made, cash_collected_inr: r0(m.cash_collected) }; };
  const ctx = { as_of: foNow_(), today, villas: (D.properties || []).filter(p => String(p.active) !== 'no').map(p => ({ id: p.property_id, name: p.name, bedrooms: p.bedrooms, sleeps: p.sleeps, from_rate_inr: r0(p.from_rate) })) };
  ctx.performance = { last_30_days: per(add(today, -30), add(today, -1)), next_30_days_on_books: per(today, add(today, 29)), next_31_90_days_on_books: per(add(today, 30), add(today, 89)) };
  try { const ytd = FoMetrics.range('ytd', today), y = FoMetrics.compute(D, ytd.from, ytd.to); ctx.performance.year_to_date = { revenue_inr: r0(y.net_accommodation_revenue), receivables_inr: r0(y.outstanding_receivables) }; } catch (e) {}
  ctx.channels_last_90_days = (D.bookings || []).filter(x => ['cancelled', 'void', 'no_show'].indexOf(x.status) < 0 && String(x.checkin) >= add(today, -90) && String(x.checkin) <= today).reduce((o, x) => { const c = x.channel || 'unknown'; o[c] = (o[c] || 0) + 1; return o; }, {});
  try {
    const cfg = FoDesk.settings(D);
    ctx.pricing_desk = cfg.properties.map(pid => { const c = FoDesk.today(D, pid); if (!c) return null; const q = x => x && { date: x.date, recommended_inr: x.price, range_inr: [x.low, x.high], confidence_pct: x.confidence, main_reasons: x.top, direct_inr: x.channels && x.channels.direct && x.channels.direct.price };
      return { villa: c.name, tonight: q(c.tonight), tomorrow: q(c.tomorrow) }; }).filter(Boolean);
    const cal = cfg.properties.map(pid => FoDesk.calendar(D, pid, 30)).filter(Boolean);
    ctx.next_30_nights_recommended = cal.map(c => ({ villa: c.name, nights: c.rows.filter((x, i) => i % 3 === 0 || x.confidence < 50).slice(0, 14).map(x => [x.date, x.price, x.confidence]) }));
    try { ctx.market = FoDesk.marketAnalytics(D, cfg.properties[0]); ctx.market = JSON.parse(JSON.stringify(ctx.market, (k, v) => Array.isArray(v) && v.length > 20 ? v.slice(0, 20) : v)); } catch (e) {}
    ctx.alerts = FoDesk.alerts(D, cal, []).map(a => a.text).slice(0, 10);
  } catch (e) { ctx.pricing_desk_error = String(e.message || e).slice(0, 120); }
  ctx.competitors = { tracked: (D.competitors || []).length, comp_set: (D.comp_set || []).filter(c => c.in_set === 'yes').map(c => ({ for: c.property, name: c.name || c.key, platforms: c.platforms, score: c.score })).slice(0, 20) };
  ctx.bots_last_runs = (D.bot_runs || []).slice(-12).map(r => [String(r.at).slice(0, 16), r.platform || r.bot, r.status, r.prices, r.sold_out]);
  ctx.news_last_7_days = (D.news || []).filter(n => String(n.published_at || n.fetched_at) >= add(today, -7)).sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 8)
    .map(n => ({ date: String(n.published_at).slice(0, 10), headline: String(n.title).slice(0, 160), category: n.category, impact: n.impact, demand: n.direction }));
  ctx.expenses_this_month = (D.expenses || []).filter(x => String(x.date).slice(0, 7) === today.slice(0, 7)).reduce((o, x) => { o[x.category] = (o[x.category] || 0) + r0(x.amount); return o; }, {});
  ctx.website = (D.demand_signals || D.demandSignals || []).filter(s => s.source === 'ga4' || s.source === 'gsc').slice(-6).map(s => ({ date: s.date, source: s.source, metric: s.metric, value: s.value, growth_pct: s.growth_pct }));
  ctx.open_data_issues = (D.exceptions || []).filter(e => e.status === 'open').length;
  foCachePut_('FO_BRAIN_CTX', ctx, 600);
  return ctx;
}

function foBrainLog_(email, q, r, ms) {
  try { foAppend_('BrainLog', { asked_at: foNow_(), user: email, question: q.slice(0, 500), provider: r.ok ? r.provider : '', model: r.ok ? r.model : '', ms, ok: r.ok ? 'yes' : 'no', error: r.ok ? '' : String(r.error).slice(0, 200) }); } catch (e) {}
}

/** Daily job (after 07:00 IST): a short AI morning brief by email. Off with Settings → brain_daily = off, or when no key is set. */
function foBrainDailyBrief_(today) {
  if (foSettings_().brain_daily === 'off') return 'off';
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('GROQ_API_KEY') && !p.getProperty('GEMINI_API_KEY')) return 'no key';
  if (p.getProperty('FO_BRAIN_BRIEF') === today) return 'sent';
  const ctx = foBrainContext_();
  const r = foBrainCall_(FO_BRAIN_SYSTEM, [], 'BUSINESS SUMMARY (' + ctx.as_of + '):\n' + JSON.stringify(ctx) +
    '\n\nWrite this morning\'s brief for the owner: 1) the one thing to do today, 2) tonight and tomorrow prices worth checking and why, 3) demand/news/competitor changes that matter, 4) any risk (data gaps, bots failing, unpaid balances). Max 180 words, plain text, no tables.');
  if (!r.ok) return 'failed: ' + r.error;
  MailApp.sendEmail({ to: foDeskRecipient_(), subject: 'AP Brain · morning brief ' + today, body: r.text + '\n\n— AP Brain (' + r.provider + ', free tier). Advice only; open the Founder OS to act: https://www.apvillasandresorts.in/founder/' });
  p.setProperty('FO_BRAIN_BRIEF', today);
  return 'sent via ' + r.provider;
}
