/**
 * AP Villas Founder OS · AP Brain (the AI assistant inside the portal), added to the e-check-in Apps Script project.
 *
 * Free models only (owner rule: zero paid services): Groq first (open Llama models, free tier), Google Gemini (free tier) when Groq
 * is busy, over its limit or not set up. Keys live ONLY in Script Properties: GROQ_API_KEY, GEMINI_API_KEY (optional GROQ_MODEL,
 * GEMINI_MODEL). No key = the brain says so; nothing else breaks.
 *
 * Privacy: the model only ever receives a business summary built here (totals, occupancy, prices, competitor medians, public news
 * headlines, system status). Never guest names, phones, emails, ID numbers or booking references. Every ₹ figure in an answer is checked against that summary (foBrainUnverified_). Questions and history are scrubbed
 * of emails/phone/ID-like numbers before they leave Google. Answers are advice only: changes go through foBrainAct_ and need the owner's confirmation.
 */
const FO_BRAIN = { BUDGET_MS: 35000, PER_DAY: 150, MAX_Q: 1200, MAX_HISTORY: 6, GROQ_MODEL: 'openai/gpt-oss-120b', GEMINI_MODEL: 'gemini-3.6-flash' };

const FO_BRAIN_SYSTEM = [
  'You are "AP Brain", the sharp, practical business analyst for AP Villas & Resorts: five owner-operated holiday villas within 2 km of Mahakaleshwar Jyotirlinga, Ujjain (India). The owner, Apoorv, runs it himself; his goal is full occupancy at the best price the market will pay.',
  'You get: a JSON BUSINESS SUMMARY (ledger totals, occupancy, every one of the next 14 nights with the recommended price, chance to sell, market median and sell-outs, competitors, Google search demand and top/rising Ujjain searches, news, website, forecast accuracy) and sometimes WEB RESEARCH from live Google searches with numbered sources.',
  'Think like a revenue manager: look for what is NOT obvious: nights where competitors are selling out but we are priced low, weak nights to fill now, rising searches that signal demand before bookings arrive, gaps between weekday and weekend, a competitor or event that changes the picture, channel mix, money left on the table. Quantify the effect in ₹ or nights where the data allows.',
  'Answer format (Markdown): one bold headline with the answer; then **Why** (2–4 bullets, each with a number from the data or a cited source); then **Do this** (1–3 concrete actions with dates and ₹ figures); then **Watch** (what would change the advice). Keep it under 220 words unless asked for detail.',
  'Rules: figures only from the summary or the web research; cite web facts as [1], [2] matching the sources; if something is missing say which data would answer it. Never invent revenue, occupancy, competitor prices or market numbers. Label estimates as ESTIMATE. Money in Indian rupees (₹, Indian digit grouping). Reply in English. Use Hindi only when the question itself is written in Hindi (Devanagari script); an Indian name or a Hindi word is not a reason to switch.',
  'Quality bar: lead with the answer, no filler, no restating the question, no generic advice that would fit any hotel. Tie every point to a date, villa or figure from the data. If the data cannot answer, say so in one line and name what is missing. Answer only what was asked; for a simple question skip the Why/Do this/Watch sections.',
  'When you recommend a change to prices or availability, or a follow-up, put a last line starting exactly with ACTIONS: followed by a JSON array of at most 3 items, each {"intent":"channel_change" or "add_task","fields":{...}}. channel_change fields: property_id (villa id from the summary, or "all"), type (rate|pct|recommended|close|open|min_stay), value, from, to (YYYY-MM-DD), weekdays (optional comma list 0-6, Sunday=0). add_task fields: title, due. The owner gets a confirm button for each, so use only figures your answer already justifies. Leave the line out when you recommend no change.',
  'This chat only advises; saving is done by a separate step. If the owner asks to record or change something, say in one line that it has not been saved and ask for the guest, booking or amount that is missing. Never give example amounts or made-up steps. The Pricing Desk price is the starting point: explain it, and only suggest a different price with a reason from the data.',
].join('\n');
const FO_BRAIN_PLANNER = 'You decide whether a question about a holiday-villa business in Ujjain (India) needs fresh information from Google that is not in its own data: competitor launches or prices, new hotels, Simhastha 2028 or temple updates, events, travel (trains, flights, roads), traveller trends, regulations, or anything about the wider market. Reply with ONLY JSON: {"search": ["query 1", "query 2"]} with 0 to 2 short Google queries (English or Hindi), or {"search": []} when the business data is enough. Never include personal data in queries.';

/** The language is decided here, not by the model, which otherwise switches to Hindi on an Indian name. */
function foBrainLang_(q) { return /[\u0900-\u097F]/.test(q) ? 'Reply in Hindi.' : 'Reply in English only.'; }

/** Route: f.brain.ask { question, history: [{role, text}], page } → { answer, provider, model, context_at }. */
function foBrainAsk_(b, user) {
  const q = foBrainScrub_(String(b.question || '').trim()).slice(0, FO_BRAIN.MAX_Q);
  if (!q) return { ok: false, error: 'Type a question first.' };
  if (foCounter_('FO_BRAIN_' + foHmac_(user.email).slice(0, 12), 86400) > FO_BRAIN.PER_DAY) return { ok: false, error: 'AP Brain has answered ' + FO_BRAIN.PER_DAY + ' questions in the last 24 hours. Please try again tomorrow.' };
  const ctx = foBrainContext_(), hist = (Array.isArray(b.history) ? b.history : []).slice(-FO_BRAIN.MAX_HISTORY)
    .map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', text: foBrainScrub_(String(h.text || '')).slice(0, 2000) })).filter(h => h.text);
  const page = String(b.page || '').replace(/[^\w\/ -]/g, '').slice(0, 40);
  const t0 = Date.now();
  // market research of its own: plan up to 3 Google searches, run them in parallel through Gemini with Google Search grounding
  const research = b.web === false ? null : foBrainResearch_(q, hist);
  const web = research && research.findings.length ? '\n\nWEB RESEARCH (live Google search, ' + foNow_().slice(0, 16) + '):\n' + research.findings.map(f => 'Q: ' + f.query + '\n' + f.text).join('\n\n') +
    '\nSOURCES:\n' + research.sources.map((x, i) => '[' + (i + 1) + '] ' + x.title).join('\n') : '';
  const prompt = 'BUSINESS SUMMARY (' + ctx.as_of + '):\n' + JSON.stringify(ctx) + web + (page ? '\n\nThe owner is looking at: ' + page : '') + '\n\nQUESTION: ' + q + '\n\n' + foBrainLang_(q);
  let r = foBrainCall_(FO_BRAIN_SYSTEM, hist, prompt), unverified = [];
  if (r.ok) {
    // every ₹ figure must come from the data: one correction round, then whatever is left is flagged to the owner
    const source = prompt + ' ' + hist.map(h => h.text).join(' ');
    unverified = foBrainUnverified_(r.text, source);
    if (unverified.length && Date.now() - t0 < FO_BRAIN.BUDGET_MS) {
      const fix = foBrainCall_(FO_BRAIN_SYSTEM, hist, prompt + '\n\nYour draft answer:\n' + r.text + '\n\nThese figures are not in the data: ' + unverified.join(', ') + '. Rewrite the answer without them, or mark a figure you calculated from the data as ESTIMATE and show the sum. Reply with the final answer only.');
      if (fix.ok) { const left = foBrainUnverified_(fix.text, source); if (left.length <= unverified.length) { r = fix; unverified = left; } }
    }
  }
  foBrainLog_(user.email, q, r, Date.now() - t0);
  if (!r.ok) return { ok: false, error: r.error, setup: r.setup || false };
  const split = foBrainProposals_(r.text, user);
  return { answer: foBrainCleanCites_(split.text), proposals: split.proposals, unverified, provider: r.provider, model: r.model, context_at: ctx.as_of, searched: research ? research.queries : [], sources: research ? research.sources : [], research_via: research ? research.via : [] };
}

/** Takes the ACTIONS: line off an answer and turns it into confirm cards, through the same checks as a typed request. Nothing is saved here. */
function foBrainProposals_(text, user) {
  const m = String(text).match(/\n?\s*ACTIONS:\s*(\[[\s\S]*\])\s*$/); if (!m) return { text: String(text).replace(/\n?\s*ACTIONS:\s*$/, ''), proposals: [] };
  let list = []; try { list = JSON.parse(m[1]); } catch (e) {}
  const D = foDataLoad_(), today = foToday_(), proposals = (Array.isArray(list) ? list : []).slice(0, 3).filter(a => a && ['channel_change', 'add_task'].indexOf(a.intent) >= 0).map(a => foActDraft_(a.intent, foActClean_(a.fields || {}), D, today, user)).filter(a => a.ready);
  return { text: String(text).slice(0, m.index).trim(), proposals };
}

/** ₹ figures in an answer that appear nowhere in its sources. Lines marked ESTIMATE show their working, so they pass. */
function foBrainUnverified_(text, source) {
  const digits = v => String(v).replace(/[,\s]/g, '').replace(/\.0+$/, ''), known = {}, out = [];
  (String(source).match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(n => { known[digits(n)] = 1; });
  String(text).split('\n').filter(l => !/ESTIMATE/i.test(l)).forEach(l => {
    (l.match(/(?:₹|Rs\.?\s*|INR\s*)\s*\d[\d,]*(?:\.\d+)?\s*(?:k\b|lakh|cr\b|crore)?/gi) || []).forEach(m => {
      if (/k\b|lakh|cr/i.test(m)) return;   // rounded forms cannot be compared exactly
      const n = digits(m.replace(/[^\d.,]/g, '').replace(/^\./, '')), round = String(Math.round(Number(n)));
      if (!known[n] && !known[round] && out.indexOf(m.trim()) < 0) out.push(m.trim());
    });
  });
  return out;
}

/**
 * Web research (all free): a quick planner call decides which searches (0–3) would help, then they run in parallel, in this order:
 *   1. Groq "compound" models, which search the web themselves and return their sources (same free GROQ_API_KEY);
 *   2. Gemini with Google Search grounding (free allowance; often used up: then 429);
 *   3. GDELT news search (open news database, no key): headlines and links only.
 * Stays within a ~25 s budget so the whole answer fits the portal's 60 s. Returns findings plus de-duplicated sources (title, link).
 */
function foBrainResearch_(q, hist) {
  const p = PropertiesService.getScriptProperties(), groq = p.getProperty('GROQ_API_KEY'), gem = p.getProperty('GEMINI_API_KEY');
  if (!groq && !gem) return null;
  const plan = foBrainCall_(FO_BRAIN_PLANNER, hist.slice(-2), 'QUESTION: ' + q + '\nToday: ' + foToday_());
  let queries = [];
  if (plan.ok) { try { const m = String(plan.text).match(/\{[\s\S]*\}/); queries = (JSON.parse(m ? m[0] : '{}').search || []).map(x => foBrainScrub_(String(x)).slice(0, 140)).filter(Boolean).slice(0, 2); } catch (e) {} }
  const out = { queries, findings: [], sources: [], via: [] }, seen = {}, t0 = Date.now();
  if (!queries.length) return out;
  const brief = query => 'Search the web and report the facts that matter for a holiday-villa business near Mahakaleshwar temple, Ujjain, India. Question: ' + query + '\nGive 3–6 short factual bullet points with dates and numbers where available. No advice.';
  const cite = list => list.filter(w => w && /^https?:\/\//.test(w.url || '')).map(w => {
    const key = String(w.url).split('#')[0]; if (!seen[key]) { seen[key] = out.sources.length + 1; out.sources.push({ title: String(w.title || w.url).slice(0, 120), url: String(w.url).slice(0, 600) }); } return seen[key];
  });
  const add = (query, text, refs, via) => { out.findings.push({ query, text: String(text).slice(0, 1800) + (refs.length ? ' (sources ' + refs.slice(0, 6).map(n => '[' + n + ']').join('') + ')' : '') }); if (out.via.indexOf(via) < 0) out.via.push(via); };
  const run = (reqs, read, via) => {
    if (!pending.length || Date.now() - t0 > 20000) return;
    let res; try { res = UrlFetchApp.fetchAll(pending.map(reqs)); } catch (e) { return; }
    const left = [];
    res.forEach((r, i) => { let ok = false; if (r.getResponseCode() === 200) { try { ok = read(pending[i], JSON.parse(r.getContentText())); } catch (e) {} } if (!ok) left.push(pending[i]); });
    pending = left;
  };
  let pending = queries.slice();
  // 1. Groq: the gpt-oss model with its built-in browser_search tool (free key; ~14 s, the searches run in parallel)
  // web pages are long: a search costs ~40k tokens of the free daily allowance, so the small model searches first (its own allowance),
  // the large one only for what is left; at most 2 searches per question
  if (groq) ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'].forEach(model => run(query => ({ url: 'https://api.groq.com/openai/v1/chat/completions', method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + groq }, muteHttpExceptions: true,
    payload: JSON.stringify({ model, temperature: 0.2, max_tokens: 900, tools: [{ type: 'browser_search' }], tool_choice: 'auto', messages: [{ role: 'user', content: brief(query) }] }) }), (query, j) => {
    const m = ((j.choices || [])[0] || {}).message || {}, text = foBrainCleanCites_(String(m.content || '')); if (!text) return false;
    add(query, text, cite(foBrainToolHits_(m.executed_tools)), 'Groq web search'); return true;
  }, 'groq'));
  // 2. Gemini with Google Search grounding
  if (gem && pending.length) {
    const model = [p.getProperty('GEMINI_MODEL_AUTO'), FO_BRAIN.GEMINI_MODEL].filter(Boolean)[0];
    run(query => ({ url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': gem }, muteHttpExceptions: true,
      payload: JSON.stringify({ tools: [{ google_search: {} }], generationConfig: { temperature: 0.2, maxOutputTokens: 700 }, contents: [{ role: 'user', parts: [{ text: brief(query) }] }] }) }), (query, j) => {
      const c = (j.candidates || [])[0] || {}, text = ((c.content || {}).parts || []).map(x => x.text || '').join('').trim(); if (!text) return false;
      add(query, text, cite(((c.groundingMetadata || {}).groundingChunks || []).map(g => g.web && { title: g.web.title, url: g.web.uri })), 'Google Search (Gemini)'); return true;
    }, 'gemini');
  }
  // 3. GDELT news: one combined request (it allows about one every 5 seconds), headlines and links only
  if (pending.length && Date.now() - t0 < 22000) {
    try {
      const terms = pending.map(x => '(' + x.replace(/[^\w\sऀ-ॿ]/g, ' ').trim().split(/\s+/).filter(w => w.length > 3 && !/^(\d{4}|ujjain)$/i.test(w)).slice(0, 4).join(' AND ') + ')').filter(x => x !== '()');
      const u = 'https://api.gdeltproject.org/api/v2/doc/doc?' + ['query=' + encodeURIComponent('Ujjain' + (terms.length ? ' (' + terms.join(' OR ') + ')' : '')), 'mode=artlist', 'format=json', 'maxrecords=12', 'timespan=1m', 'sort=datedesc'].join('&');
      const r = UrlFetchApp.fetch(u, { muteHttpExceptions: true });
      const arts = r.getResponseCode() === 200 ? (JSON.parse(r.getContentText() || '{}').articles || []) : [];
      if (arts.length) add(pending.join('; '), 'Recent news headlines (GDELT, last 30 days):\n' + arts.map(a => '- ' + String(a.seendate || '').slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') + ': ' + a.title + ' (' + a.domain + ')').join('\n'), cite(arts.map(a => ({ title: a.title, url: a.url }))), 'news (GDELT)');
    } catch (e) {}
  }
  out.sources = out.sources.slice(0, 10);
  return out;
}

/** Search results from Groq's executed_tools (structured results, or links found in the tool output). */
function foBrainToolHits_(tools) {
  const hits = [];
  (tools || []).forEach(t => {
    const sr = t.search_results; (Array.isArray(sr) ? sr : (sr && sr.results) || []).forEach(x => hits.push({ title: x.title, url: x.url }));
    if (!hits.length && t.output) String(t.output).replace(/\[([^\]]{3,140})\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s"'<>)\]]+)/g, (m0, ti, u1, u2) => { hits.push({ title: ti || (u1 || u2).replace(/^https?:\/\/(www\.)?/, '').split('/')[0], url: u1 || u2 }); return m0; });
  });
  return hits.slice(0, 12);
}
/** gpt-oss marks citations like 【5†L13-L18】: drop them (the brain cites the numbered source list instead). */
function foBrainCleanCites_(t) { return String(t).replace(/【[^】]*】/g, '').replace(/[ \t]+\n/g, '\n').trim(); }

/** Route: f.brain.status → which providers are set up (never the keys). */
function foBrainStatus_() {
  const p = PropertiesService.getScriptProperties();
  return { groq: !!p.getProperty('GROQ_API_KEY'), gemini: !!p.getProperty('GEMINI_API_KEY'), daily_brief: foSettings_().brain_daily !== 'off',
    asked_today: foRows_('BrainLog').filter(r => String(r.asked_at).slice(0, 10) === foToday_()).length };
}

/** Groq, then Gemini. Each provider: one retry on 429/5xx. Returns { ok, text, provider, model } or { ok:false, error }. */
/**
 * Free chat providers, tried in this order (each only when its key is in Script Properties). All speak the OpenAI chat format except
 * Gemini. Within a provider the models are tried in turn: a retired model (404) or a used-up free allowance (429) moves to the next one.
 * Whatever works is remembered (Script Property <NAME>_MODEL_AUTO). An owner-set <NAME>_MODEL always comes first.
 */
const FO_BRAIN_PROVIDERS = [
  { id: 'groq', name: 'Groq', key: 'GROQ_API_KEY', prop: 'GROQ_MODEL', url: 'https://api.groq.com/openai/v1/chat/completions', models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], list: 'https://api.groq.com/openai/v1/models' },
  { id: 'cerebras', name: 'Cerebras', key: 'CEREBRAS_API_KEY', prop: 'CEREBRAS_MODEL', url: 'https://api.cerebras.ai/v1/chat/completions', models: ['gpt-oss-120b', 'llama-3.3-70b'], list: 'https://api.cerebras.ai/v1/models' },
  { id: 'openrouter', name: 'OpenRouter', key: 'OPENROUTER_API_KEY', prop: 'OPENROUTER_MODEL', url: 'https://openrouter.ai/api/v1/chat/completions', models: ['openai/gpt-oss-120b:free', 'meta-llama/llama-3.3-70b-instruct:free'], list: 'https://openrouter.ai/api/v1/models', freeOnly: true },
  { id: 'mistral', name: 'Mistral', key: 'MISTRAL_API_KEY', prop: 'MISTRAL_MODEL', url: 'https://api.mistral.ai/v1/chat/completions', models: ['mistral-small-latest', 'mistral-medium-latest'], list: 'https://api.mistral.ai/v1/models' },
];
function foBrainCall_(system, history, prompt, only) {
  const p = PropertiesService.getScriptProperties(), errs = [], t0 = Date.now();
  const chats = FO_BRAIN_PROVIDERS.filter(x => (!only || only === x.id) && p.getProperty(x.key)), gem = (!only || only === 'gemini') ? p.getProperty('GEMINI_API_KEY') : null;
  if (!chats.length && !gem) return { ok: false, setup: true, error: 'AP Brain is not switched on yet: add a free Groq or Gemini key in Script Properties (see docs/founder-os/README.md → AP Brain).' };
  const messages = [{ role: 'system', content: system }].concat(history.map(h => ({ role: h.role, content: h.text })), [{ role: 'user', content: prompt }]);
  for (const pv of chats) {
    const key = p.getProperty(pv.key), tried = [];
    let list = [p.getProperty(pv.prop), p.getProperty(pv.prop + '_AUTO')].concat(pv.models).filter((m, i, a) => m && a.indexOf(m) === i), looked = false;
    for (let k = 0; k < list.length && k < 5; k++) {
      if (Date.now() - t0 > FO_BRAIN.BUDGET_MS) { tried.push('no time left'); break; }
      const model = list[k];
      let r = foBrainHttp_(pv.url, { Authorization: 'Bearer ' + key }, { model, temperature: 0.3, max_tokens: 1200, messages }, j => j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
      if (!r.ok && r.retry && !/^HTTP 429/.test(r.error)) { Utilities.sleep(1200); r = foBrainHttp_(pv.url, { Authorization: 'Bearer ' + key }, { model, temperature: 0.3, max_tokens: 1200, messages }, j => j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content); }
      tried.push(model + ' ' + (r.ok ? 'ok' : r.error));
      // remember a replacement only for a retired model (404); a used-up daily allowance (429) comes back tomorrow
      if (r.ok) { if (looked && model !== p.getProperty(pv.prop + '_AUTO') && model !== p.getProperty(pv.prop)) p.setProperty(pv.prop + '_AUTO', model); return Object.assign(r, { provider: pv.name, model }); }
      if (/key not accepted/.test(r.error)) break;
      // retired model: ask the provider what it offers today and try the best of those next
      if (/^HTTP 404/.test(r.error) && !looked) { looked = true; foBrainModelList_(pv, key).forEach((m, n) => { if (list.indexOf(m) < 0) list.splice(k + 1 + n, 0, m); }); }
    }
    errs.push(pv.name + ': ' + tried.join(', '));
  }
  if (gem) {
    // Gemini's newest models are often "high demand" (503 after up to a minute): try the remembered/stable model first, then the next
    // candidates, one attempt each, and stop when the time budget for this answer is used (the portal waits at most 60 s).
    const call = model => foBrainHttp_('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', { 'x-goog-api-key': gem },
      { systemInstruction: { parts: [{ text: system }] }, generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
        contents: history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })).concat([{ role: 'user', parts: [{ text: prompt }] }]) },
      j => j.candidates && j.candidates[0] && j.candidates[0].content && (j.candidates[0].content.parts || []).map(x => x.text || '').join(''));
    const tried = [], list = [p.getProperty('GEMINI_MODEL'), p.getProperty('GEMINI_MODEL_AUTO'), FO_BRAIN.GEMINI_MODEL].concat(foBrainGeminiList_(gem)).filter((m, i, a) => m && a.indexOf(m) === i);
    for (const model of list.slice(0, 4)) {
      if (Date.now() - t0 > FO_BRAIN.BUDGET_MS) break;
      const r = Object.assign(call(model), { model }); tried.push(model + ' ' + (r.ok ? 'ok' : r.error));
      if (r.ok) { if (model !== p.getProperty('GEMINI_MODEL_AUTO')) p.setProperty('GEMINI_MODEL_AUTO', model); return Object.assign(r, { provider: 'Gemini' }); }
      if (/key not accepted/.test(r.error)) break;
    }
    errs.push('Gemini: ' + (tried.join(', ') || 'no time left'));
  }
  foLogError_('brain', errs.join(' | '));
  return { ok: false, error: 'AP Brain could not get an answer right now (' + errs.join('; ') + '). Please try again in a minute.' };
}
/** A provider's chat models today, best first (cached 6 hours). */
function foBrainModelList_(pv, key) {
  const c = CacheService.getScriptCache(), ck = 'FO_BRAIN_ML_' + pv.id, hit = c.get(ck); if (hit) return JSON.parse(hit);
  let list = [];
  try { const res = UrlFetchApp.fetch(pv.list, { headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true }); if (res.getResponseCode() === 200) list = foBrainRankModels_(pv.id, JSON.parse(res.getContentText())); } catch (e) {}
  if (list.length) c.put(ck, JSON.stringify(list.slice(0, 8)), 21600);
  return list.slice(0, 8);
}
/** Gemini chat models to try, stable first (cached 6 hours). */
function foBrainGeminiList_(key) {
  const c = CacheService.getScriptCache(), hit = c.get('FO_BRAIN_GEMLIST'); if (hit) return JSON.parse(hit);
  let list = [];
  try { const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true }); if (res.getResponseCode() === 200) list = foBrainRankModels_('gemini', JSON.parse(res.getContentText())); } catch (e) {}
  if (list.length) c.put('FO_BRAIN_GEMLIST', JSON.stringify(list), 21600);
  return list;
}
function foBrainRankModels_(provider, j) {
  if (provider !== 'gemini') {
    const ids = (j.data || []).filter(m => m.active !== false).map(m => String(m.id)).filter(id => !/whisper|tts|guard|embed|vision|audio|playai|compound|orpheus|safeguard|allam|ocr|moderation|codestral|pixtral|devstral/i.test(id)).filter(id => provider !== 'openrouter' || /:free$/.test(id));
    const size = id => { const m = id.match(/(\d+)b\b/i); return m ? Number(m[1]) : 0; };
    const fam = id => /gpt-oss/i.test(id) ? 3 : /llama|mistral-(medium|large)/i.test(id) ? 2 : /qwen|kimi|deepseek|mistral/i.test(id) ? 1 : 0;
    return ids.sort((a, b) => fam(b) - fam(a) || size(b) - size(a) || b.localeCompare(a));
  }
  const ms = (j.models || []).filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0).map(m => String(m.name).replace(/^models\//, ''))
    .filter(n => /^gemini-/.test(n) && !/embedding|image|tts|audio|live|exp|preview|thinking|vision/i.test(n));
  const ver = n => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : 0; };
  // the newest model is usually the busiest on the free tier: flash first, then the second-newest and older versions before the newest, lite last
  const vs = [...new Set(ms.map(ver))].sort((a, b) => b - a), rank = v => v === vs[0] && vs.length > 1 ? vs.length : vs.indexOf(v);
  return ms.sort((a, b) => (/lite/.test(a) ? 1 : 0) - (/lite/.test(b) ? 1 : 0) || (/flash/.test(b) ? 1 : 0) - (/flash/.test(a) ? 1 : 0) || rank(ver(a)) - rank(ver(b)) || a.length - b.length);
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
    const cal = cfg.properties.map(pid => FoDesk.calendar(D, pid, 60)).filter(Boolean);
    // every night of the next 14: [date, weekday, status, our net price, chance to sell %, market median (guest price), market sold-out %, comparable stays open, confidence]
    ctx.next_14_nights = cal.map(c => ({ villa: c.name, columns: 'date, day, status, price_net_inr, chance_to_sell_pct, market_median_inr, market_sold_out_pct, comparable_open, confidence', nights: c.rows.slice(0, 14).map(x => [x.date,
      new Date(x.date + 'T00:00:00Z').toUTCString().slice(0, 3), x.booked ? 'booked' : x.blocked ? 'blocked' : 'open', x.price, x.fill ? x.fill.chance : null, x.market.median ? Math.round(x.market.median) : (x.fill ? x.fill.median : null),
      x.market.sellout == null ? null : Math.round(x.market.sellout * 100), x.fill ? x.fill.ladder.length : x.market.n, x.confidence]) }));
    ctx.nights_15_to_60 = cal.map(c => ({ villa: c.name, weekly: [0, 1, 2, 3, 4, 5].map(w => { const rows = c.rows.slice(14 + w * 7, 21 + w * 7); return rows.length ? { from: rows[0].date, open: rows.filter(x => !x.booked && !x.blocked).length, avg_price: Math.round(rows.reduce((a, x) => a + x.price, 0) / rows.length), festival_or_event_nights: rows.filter(x => x.event).map(x => x.date) } : null; }).filter(Boolean) }));
    try { const acc = FoDesk.forecastAccuracy(D, cfg.properties[0]); ctx.forecast_accuracy = { nights_checked: acc.nights, typical_error_pct: acc.mape == null ? null : Math.round(acc.mape * 1000) / 10 }; } catch (e) {}
    try { ctx.market = FoDesk.marketAnalytics(D, cfg.properties[0]); ctx.market = JSON.parse(JSON.stringify(ctx.market, (k, v) => Array.isArray(v) && v.length > 20 ? v.slice(0, 20) : v)); } catch (e) {}
    ctx.alerts = FoDesk.alerts(D, cal, []).map(a => a.text).slice(0, 10);
  } catch (e) { ctx.pricing_desk_error = String(e.message || e).slice(0, 120); }
  ctx.competitors = { tracked: (D.competitors || []).length, comp_set: (D.comp_set || []).filter(c => c.in_set === 'yes').map(c => ({ for: c.property, name: c.name || c.key, platforms: c.platforms, score: c.score })).slice(0, 20) };
  ctx.bots_last_runs = (D.bot_runs || []).slice(-12).map(r => [String(r.at).slice(0, 16), r.platform || r.bot, r.status, r.prices, r.sold_out]);
  ctx.news_last_7_days = (D.news || []).filter(n => String(n.published_at || n.fetched_at) >= add(today, -7)).sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 8)
    .map(n => ({ date: String(n.published_at).slice(0, 10), headline: String(n.title).slice(0, 160), category: n.category, impact: n.impact, demand: n.direction }));
  ctx.expenses_this_month = (D.expenses || []).filter(x => String(x.date).slice(0, 7) === today.slice(0, 7)).reduce((o, x) => { o[x.category] = (o[x.category] || 0) + r0(x.amount); return o; }, {});
  ctx.website = (D.demand_signals || D.demandSignals || []).filter(s => s.source === 'ga4' || s.source === 'gsc').slice(-6).map(s => ({ date: s.date, source: s.source, metric: s.metric, value: s.value, growth_pct: s.growth_pct }));
  // Google search demand around Ujjain (whole market): the pricing signal, today's top and rising searches, Wikipedia readers
  try {
    const sm = (D.signals || []).filter(x => x.signal_id === 'search_market').sort((a, b) => a.fetched_at < b.fetched_at ? 1 : -1)[0];
    const kw = D.search_keywords || [], last = kw.map(x => String(x.date)).sort().pop(), day = kw.filter(x => String(x.date) === last);
    const wiki = (D.search_extra || []).filter(x => x.kind === 'wiki').map(x => { let s2 = []; try { s2 = JSON.parse(x.data); } catch (e) {} const v = s2.map(z => Number(z[1])), a7 = v.slice(-7), a30 = v.slice(-37, -7), m = a => a.length ? a.reduce((q, w) => q + w, 0) / a.length : 0; return { article: x.key, avg_7d: Math.round(m(a7)), vs_30d_pct: m(a30) ? Math.round((m(a7) / m(a30) - 1) * 100) : null }; });
    ctx.search_demand = { signal: sm ? { index: Number(sm.index), detail: sm.raw_value, as_of: String(sm.fetched_at).slice(0, 10) } : null, report_date: last || null,
      top_searches: day.filter(x => x.avg7 !== '').sort((a, b) => Number(b.avg7) - Number(a.avg7)).slice(0, 12).map(x => ({ q: x.keyword, interest_7d: Number(x.avg7), change_vs_30d_pct: x.change === '' ? null : Number(x.change) })),
      rising_searches: day.filter(x => x.rising).slice(0, 10).map(x => ({ q: x.keyword, growth: x.rising })), interest_scale: 'Google Trends, "ujjain hotel" average = 100', wikipedia_readers: wiki };
  } catch (e) {}
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

/** Run from the editor after adding a key: one tiny question with no business data; logs which provider answered. */
function foBrainTest() {
  // each provider on its own, so a broken backup is found before it is needed
  return ['groq', 'gemini'].map(only => {
    const r = foBrainCall_('You are a test. Reply in five words or fewer.', [], 'Say: AP Brain is working.', only);
    console.log(only + ': ' + (r.ok ? 'OK · ' + r.provider + ' (' + r.model + '): ' + r.text : 'FAILED: ' + r.error));
    return r.ok;
  }).every(Boolean);
}
/** Gemini only, step by step (each request timed): which model, HTTP status and the start of Google's answer. No business data. */
function foBrainTestGemini() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY'); if (!key) return console.log('GEMINI_API_KEY is not set');
  let t = Date.now(), r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
  console.log('list models: HTTP ' + r.getResponseCode() + ' in ' + (Date.now() - t) + ' ms');
  if (r.getResponseCode() !== 200) return console.log(r.getContentText().slice(0, 300));
  const ranked = foBrainRankModels_('gemini', JSON.parse(r.getContentText())); console.log('best models: ' + ranked.slice(0, 5).join(', '));
  t = Date.now(); const real = foBrainCall_('You are a test. Reply in five words or fewer.', [], 'Say: AP Brain is working.', 'gemini');
  console.log('real answer path: ' + (real.ok ? 'OK · ' + real.model + ' in ' + (Date.now() - t) + ' ms: ' + real.text : 'FAILED in ' + (Date.now() - t) + ' ms: ' + real.error));
  const model = ranked[0] || FO_BRAIN.GEMINI_MODEL; t = Date.now();
  r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true,
    payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Say: AP Brain is working.' }] }], generationConfig: { maxOutputTokens: 50 } }) });
  console.log(model + ': HTTP ' + r.getResponseCode() + ' in ' + (Date.now() - t) + ' ms · ' + r.getContentText().replace(/\s+/g, ' ').slice(0, 300));
}
/** Editor check of the research step: what the planner wanted to search and what came back (no business data is sent). */
function foBrainTestResearch() {
  const q = 'Any new competition or events in Ujjain I should know about?', t = Date.now();
  const plan = foBrainCall_(FO_BRAIN_PLANNER, [], 'QUESTION: ' + q + '\nToday: ' + foToday_());
  console.log('planner: ' + (plan.ok ? plan.provider + ' → ' + String(plan.text).slice(0, 400) : 'FAILED ' + plan.error));
  const r = foBrainResearch_(q, []);
  console.log('research in ' + (Date.now() - t) + ' ms: ' + JSON.stringify(r).slice(0, 1500));
  const groq = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  const t1 = Date.now(), x = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + groq }, muteHttpExceptions: true,
    payload: JSON.stringify({ model: 'openai/gpt-oss-120b', max_tokens: 600, tools: [{ type: 'browser_search' }], tool_choice: 'auto', messages: [{ role: 'user', content: 'Search the web: upcoming events in Ujjain, India this month. 3 bullet points with sources.' }] }) });
  console.log('gpt-oss-120b + browser_search: HTTP ' + x.getResponseCode() + ' in ' + (Date.now() - t1) + ' ms · ' + x.getContentText().replace(/\s+/g, ' ').slice(0, 900));
  const ml = UrlFetchApp.fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + groq }, muteHttpExceptions: true });
  console.log('Groq models: ' + (JSON.parse(ml.getContentText()).data || []).map(m => m.id).join(', '));
  const g = UrlFetchApp.fetch('https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent('Ujjain (Simhastha OR events)') + '&mode=artlist&format=json&maxrecords=5&timespan=1m', { muteHttpExceptions: true });
  console.log('GDELT: HTTP ' + g.getResponseCode() + ' · ' + g.getContentText().replace(/\s+/g, ' ').slice(0, 400));
}

// ---------------------------------------------------------------- AP Brain actions (fill in, ask, confirm, save) ----------------
/**
 * Route f.brain.act { text, draft }: turns a message or a pasted booking voucher into a draft action for the owner to confirm:
 * add_booking, add_expense, record_salary, add_employee, add_lead, and changes to records that exist: record_payment, update_booking,
 * add_task, complete_task, update_lead. Existing records are matched here, so the guest list is never sent to a model. The model only extracts fields; this code validates them, works out
 * what is still missing and returns the question to ask plus the exact save request. Nothing is saved here: the portal shows a
 * confirmation card and saves through the normal routes (same checks, double-booking guard and audit log as the forms).
 * Privacy: vouchers contain guest details, so they go only to providers that do not train on API data (Groq, Cerebras, Mistral),
 * never to the Gemini free tier or OpenRouter; ID numbers (Aadhaar-style 12 digits) are masked; the log keeps only the action type.
 */
const FO_ACT_INTENTS = ['add_booking', 'add_expense', 'record_salary', 'add_employee', 'add_lead', 'channel_change', 'record_payment', 'update_booking', 'add_task', 'complete_task', 'update_lead', 'lookup', 'none'];
function foBrainAct_(b, user) {
  const text = String(b.text || '').replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[id-number]').trim().slice(0, 6000);
  if (!text) return { ok: false, error: 'Type or paste the details first.' };
  if (foCounter_('FO_BRAIN_' + foHmac_(user.email).slice(0, 12), 86400) > FO_BRAIN.PER_DAY) return { ok: false, error: 'AP Brain has answered ' + FO_BRAIN.PER_DAY + ' requests in the last 24 hours. Please try again tomorrow.' };
  const D = foDataLoad_(), today = foToday_(), draft = b.draft && FO_ACT_INTENTS.indexOf(b.draft.intent) >= 0 ? b.draft : null;
  const villas = (D.properties || []).map(p => p.property_id + ' = ' + p.name).join('; ');
  const staff = (D.employees || []).filter(e => e.status === 'active').map(e => e.emp_id + ' = ' + e.name + ' (' + e.role + ', ' + (e.salary_amount || '?') + ')').join('; ') || 'none yet';
  const cats = FoInsights.EXPENSE_CATEGORIES.map(c => c[0]).join(', '), chans = foRows_('Channels').map(c => c.channel).join(', ');
  const sys = [
    'You turn the owner\'s message (or a pasted OTA booking voucher / confirmation) into ONE action for AP Villas & Resorts, Ujjain. Reply with ONLY JSON, no prose:',
    '{"intent": one of ' + JSON.stringify(FO_ACT_INTENTS) + ', "fields": {...}, "note": "one short sentence for the owner"}',
    'If the message asks for several separate changes, reply {"actions": [{"intent":...,"fields":{...}}, ...]} with at most 5 items.',
    'Today is ' + today + ', a ' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(today + 'T00:00:00Z').getUTCDay()] + ' (Asia/Kolkata). The weekend means Friday and Saturday nights. Dates as YYYY-MM-DD. Money as plain numbers in rupees (no symbols or commas). Only fill what the text says; never guess names, phones, amounts or dates.',
    'add_booking fields: property_id (one of: ' + villas + '), guest_name, guest_phone, guest_email, checkin, checkout, adults, children, channel (one of: ' + chans + '), external_id (OTA booking number), gross_amount (total the guest pays), commission, taxes, status (confirmed|tentative), notes.',
    'add_expense fields: date, category (one of: ' + cats + '), amount, property_id (a villa id or "all"), vendor, note.',
    'record_salary fields: emp_id (one of: ' + staff + '), amount, paid_on, period (YYYY-MM), mode (upi|cash|bank|other), kind (salary|advance|bonus|stipend|deduction), ref.',
    'add_employee fields: name, role (caretaker|sweeper|intern|manager|cook|driver|security|other), work_mode (on-site|remote), phone, email, property_ids, salary_amount, salary_cycle (monthly|weekly|daily|stipend|per-task), pay_day, joined.',
    'add_lead fields: name, phone, email, source, villa, checkin, nights, guests, value_inr, next_followup, notes.',
    'channel_change fields (prices, availability and restrictions on MakeMyTrip/Goibibo, Booking.com, Airbnb): property_id (a villa id, a comma list of villa ids, or "all" for every villa), type (rate|pct|recommended|close|open|min_stay|max_stay|cta|ctd|stop_sell|units), value (rupees for rate, percent for pct e.g. 10 or -15, nights for min_stay/max_stay (0 = no limit), number for units, on|off for cta/ctd/stop_sell; cta = no check-ins, ctd = no check-outs), basis (net = what the owner keeps | channel = price guests see; default net), from, to, weekdays (comma list of 0-6, Sunday=0, e.g. "5,6" for Fri+Sat nights), channels (comma list of mmt,booking,airbnb; empty = all).',
    'record_payment (the guest paid, cleared dues, completed or settled payments, or money was refunded) fields: guest_name, booking_ref (booking or OTA number), guest_phone, property_id, checkin, amount (leave out when the guest paid everything pending), date, method (upi|cash|bank|card|other), reference, type (payment|refund).',
    'update_booking (cancel, no-show, new dates, new amount or a note on an existing booking) fields: guest_name, booking_ref, guest_phone, property_id, checkin (only to identify the stay), status (confirmed|tentative|cancelled|no_show), new_checkin, new_checkout, new_property_id, gross_amount, discount, adults, children, note.',
    'add_task (a reminder or to-do) fields: title, due, notes. complete_task (a to-do is done) fields: title.',
    'update_lead (an existing enquiry moved on) fields: name, phone, stage (new|contacted|quoted|won|lost), next_followup, lost_reason, value_inr, notes.',
    'Statements such as "Ravi Kumar completed all pending payments, update it" or "mark Ravi fully paid" are record_payment, not questions. Questions about payments ("how much is pending?") are "none".',
    'lookup (show records: who owes money, a guest\'s bookings, arrivals, departures, who is staying, open tasks, open enquiries, the price set for a date) fields: what (pending_payments|guest|arrivals|departures|in_house|tasks|leads|price), guest_name, booking_ref, guest_phone, property_id, from, to.',
    'Advice such as "should I raise prices?" or "what price should I set?" is "none". A direct order such as "raise AP Suite 10% this weekend" is channel_change.',
    'Write the note in English unless the message is in Devanagari script.',
    'If the message is a question or chat, not something to record, use intent "none".',
    draft ? 'The owner is completing this draft; keep its intent and fields unless the new message changes them: ' + JSON.stringify({ intent: draft.intent, fields: draft.fields }) : '',
  ].filter(Boolean).join('\n');
  const r = foBrainCallSafe_(sys, [], 'MESSAGE:\n' + text);
  foBrainLog_(user.email, '[action] ' + (r.ok ? 'reply' : 'failed'), r, 0);
  if (!r.ok) return { ok: false, error: r.error, setup: r.setup || false };
  let j = {}; try { const m = String(r.text).match(/\{[\s\S]*\}/); j = JSON.parse(m ? m[0] : '{}'); } catch (e) {}
  if (Array.isArray(j.actions) && j.actions.length > 1) {
    const items = j.actions.slice(0, 5).filter(a => a && FO_ACT_INTENTS.indexOf(a.intent) >= 0 && ['none', 'lookup'].indexOf(a.intent) < 0).map(a => foActDraft_(a.intent, foActClean_(a.fields || {}), D, today, user));
    return { result: { intent: 'multi', items, provider: r.provider } };
  }
  if (Array.isArray(j.actions) && j.actions[0]) j = j.actions[0];
  let intent = FO_ACT_INTENTS.indexOf(j.intent) >= 0 ? j.intent : 'none';
  if (intent === 'none' && draft) intent = draft.intent;
  if (intent === 'none') return { result: { intent: 'none' } };
  const fields = Object.assign({}, draft && draft.intent === intent ? draft.fields : {}, foActClean_(j.fields || {}));
  if (intent === 'lookup') return { result: Object.assign(foActLookup_(fields, D, today), { intent, provider: r.provider }) };
  return { result: Object.assign(foActDraft_(intent, fields, D, today, user), { intent, note: foClean_(j.note, 200), provider: r.provider }) };
}
/** A draft, and for channel changes the bulk-edit preview (nights, jobs, floor and ceiling warnings) so the card shows what would really happen. */
function foActDraft_(intent, fields, D, today, user) {
  const out = Object.assign(foActPlan_(intent, fields, D, today), { intent });
  if (out.ready && out.route === 'f.cm.bulk') {
    const pv = foCmBulk_({ bulk: Object.assign({}, out.payload.bulk, { preview: true }) }, user);
    if (pv.ok === false) { out.ready = false; out.closed = true; out.question = 'This cannot be saved: ' + pv.error; return out; }
    const x = pv.result; out.lines.push(['Effect', x.nights + ' villa-night' + (x.nights === 1 ? '' : 's') + ' · ' + x.jobs + ' channel update' + (x.jobs === 1 ? '' : 's')]);
    x.warnings.concat(x.errors).slice(0, 4).forEach(w => out.lines.push(['Note', w]));
  }
  return out;
}
/** Reads records for the owner. Built here and shown only in the portal: guest details from a lookup never go to a model. */
function foActLookup_(f, D, today) {
  const props = D.properties || [], name = id => (props.find(p => p.property_id === id) || {}).name || id, inr = v => '₹' + Math.round(foNum_(v)).toLocaleString('en-IN'), live = x => ['confirmed', 'no_show'].indexOf(x.status) >= 0;
  const pid = f.property_id && f.property_id !== 'all' ? (props.find(p => p.property_id === f.property_id || foActNameMatch_(f.property_id, p.name)) || {}).property_id : '', from = foDate_(f.from) || today, to = foDate_(f.to) || from;
  const rows = foRows_('Bookings').filter(x => !pid || x.property_id === pid), pays = foRows_('Payments'), stay = x => name(x.property_id) + ' · ' + foDate_(x.checkin) + ' → ' + foDate_(x.checkout), lines = [];
  const done = (title, list) => { const more = list.length - 15; list.slice(0, 15).forEach(l => lines.push(l)); if (more > 0) lines.push(['…', more + ' more']); return { lines, question: list.length ? title : 'Nothing found for that.', fields: f, missing: [], route: '', payload: {}, ready: false, closed: true }; };
  if (f.what === 'pending_payments') {
    const list = rows.filter(x => live(x) && foBookingDue_(x, pays) > 0.5).sort((a, b) => foBookingDue_(b, pays) - foBookingDue_(a, pays)), total = list.reduce((t, x) => t + foBookingDue_(x, pays), 0);
    return done(list.length + ' booking' + (list.length === 1 ? '' : 's') + ' with money pending, ' + inr(total) + ' in all:', list.map(x => [x.guest_name + ' · ' + stay(x), inr(foBookingDue_(x, pays))]));
  }
  if (f.what === 'guest') {
    const list = foActBookings_(f);
    return done(list.length + ' booking' + (list.length === 1 ? '' : 's') + ' found:', list.map(x => [x.guest_name + ' · ' + stay(x) + ' · ' + x.status + (x.channel ? ' · ' + x.channel : ''), foHasNum_(x.gross_amount) ? inr(x.gross_amount) + ' · pending ' + inr(Math.max(0, foBookingDue_(x, pays))) : 'no amount']));
  }
  if (['arrivals', 'departures', 'in_house'].indexOf(f.what) >= 0) {
    const on = x => { const i = foDate_(x.checkin), o = foDate_(x.checkout); return f.what === 'arrivals' ? i >= from && i <= to : f.what === 'departures' ? o >= from && o <= to : i <= to && o > from; };
    const list = rows.filter(x => ['confirmed', 'tentative'].indexOf(x.status) >= 0 && on(x)).sort((a, b) => foDate_(a.checkin) < foDate_(b.checkin) ? -1 : 1);
    return done({ arrivals: 'Arrivals', departures: 'Departures', in_house: 'Staying' }[f.what] + ' ' + from + (to !== from ? ' → ' + to : '') + ':', list.map(x => [x.guest_name, stay(x)]));
  }
  if (f.what === 'tasks') return done('Open tasks:', (D.crm_tasks || []).filter(t => !t.done).sort((a, b) => String(a.due || '9') < String(b.due || '9') ? -1 : 1).map(t => [t.title, t.due || 'no date']));
  if (f.what === 'leads') return done('Open enquiries:', (D.crm_leads || []).filter(l => ['won', 'lost'].indexOf(l.stage) < 0).map(l => [l.name || l.phone || l.email, l.stage + (l.next_followup ? ' · follow up ' + l.next_followup : '')]));
  if (f.what === 'price') {
    const list = []; (pid ? [pid] : props.map(p => p.property_id)).forEach(v => { const night = (foCmDesk_(D, v, 90) || []).filter(n => n.date >= from && n.date <= to), ari = foCmAri_(v); night.slice(0, 7).forEach(n => { const set = foNum_((ari[n.date] || {}).price_net); list.push([name(v) + ' · ' + n.date, inr(set || n.rec_net) + (set ? ' (set by you)' : ' (recommended)') + ' · you keep']); }); });
    return done('Prices:', list);
  }
  return Object.assign(done('', []), { question: 'Tell me what to look up: pending payments, a guest, arrivals, departures, tasks, enquiries or a price.' });
}
/** Same chain as the brain, minus the providers whose free tiers may use the data (Gemini free, OpenRouter). */
function foBrainCallSafe_(system, history, prompt) {
  const p = PropertiesService.getScriptProperties();
  for (const id of ['groq', 'cerebras', 'mistral']) { if (!p.getProperty(FO_BRAIN_PROVIDERS.find(x => x.id === id).key)) continue; const r = foBrainCall_(system, history, prompt, id); if (r.ok) return r; }
  return { ok: false, setup: !FO_BRAIN_PROVIDERS.some(x => ['groq', 'cerebras', 'mistral'].indexOf(x.id) >= 0 && p.getProperty(x.key)), error: 'AP Brain could not read that right now (it only uses Groq, Cerebras or Mistral for guest details). Please try again in a minute.' };
}
function foActClean_(f) { const o = {}; Object.keys(f || {}).forEach(k => { const v = f[k]; if (v !== null && v !== undefined && v !== '' && !(typeof v === 'object')) o[String(k).slice(0, 40)] = typeof v === 'string' ? v.trim().slice(0, 300) : v; }); return o; }
/** Validate and complete the draft: defaults, what is still missing, the confirmation lines and the exact save request. */
function foActPlan_(intent, f, D, today) {
  const props = D.properties || [], prop = id => props.find(p => p.property_id === id), propByName = s => props.find(p => String(s || '').toLowerCase().indexOf(String(p.name).toLowerCase()) >= 0 || String(p.name).toLowerCase().indexOf(String(s || '').toLowerCase()) >= 0);
  if (intent === 'channel_change' && /,/.test(String(f.property_id || ''))) f.property_id = String(f.property_id).split(',').map(x => { const t = x.trim(), q = prop(t) || propByName(t); return q ? q.property_id : ''; }).filter(Boolean).join(',');
  else if (f.property_id && !prop(f.property_id) && f.property_id !== 'all') { const p2 = propByName(f.property_id); f.property_id = p2 ? p2.property_id : ''; }
  const inr = v => '₹' + Math.round(foNum_(v)).toLocaleString('en-IN'), missing = [], lines = [];
  const need = (k, label) => { if (f[k] === undefined || f[k] === '' || f[k] === null) missing.push({ key: k, label }); };
  let route = '', payload = {}, closed = false;
  if (intent === 'add_booking') {
    f.status = f.status === 'tentative' ? 'tentative' : 'confirmed';
    need('property_id', 'which villa'); need('guest_name', 'guest name'); need('checkin', 'check-in date'); need('checkout', 'check-out date'); need('channel', 'booked through (Airbnb, Booking.com, direct…)'); need('gross_amount', 'total amount the guest pays');
    if (f.checkin && f.checkout && String(f.checkout) <= String(f.checkin)) missing.push({ key: 'checkout', label: 'a check-out date after check-in' });
    lines.push(['Villa', f.property_id ? (prop(f.property_id) || {}).name : '—'], ['Guest', [f.guest_name, f.guest_phone, f.guest_email].filter(Boolean).join(' · ') || '—'], ['Stay', (f.checkin || '?') + ' → ' + (f.checkout || '?') + (f.adults ? ' · ' + f.adults + ' adults' : '') + (f.children ? ', ' + f.children + ' children' : '')],
      ['Booked through', (f.channel || '—') + (f.external_id ? ' #' + f.external_id : '')], ['Amount', f.gross_amount ? inr(f.gross_amount) + (f.commission ? ' (commission ' + inr(f.commission) + ')' : '') : '—'], ['Status', f.status]);
    route = 'f.booking.save'; payload = { booking: { property_id: f.property_id, guest_name: f.guest_name, guest_phone: f.guest_phone || '', guest_email: f.guest_email || '', checkin: f.checkin, checkout: f.checkout, adults: f.adults || '', children: f.children || '', channel: f.channel, external_id: f.external_id || '', gross_amount: f.gross_amount, commission: f.commission || '', taxes: f.taxes || '', status: f.status, notes: (f.notes ? f.notes + ' · ' : '') + 'added by AP Brain' } };
  } else if (intent === 'add_expense') {
    f.date = foDate_(f.date) || today; f.property_id = f.property_id || 'all';
    if (FoInsights.EXPENSE_CATEGORIES.map(c => c[0]).indexOf(f.category) < 0) f.category = '';
    need('amount', 'amount'); need('category', 'category (utilities, maintenance, repairs, housekeeping…)');
    lines.push(['Date', f.date], ['Amount', f.amount ? inr(f.amount) : '—'], ['Category', f.category || '—'], ['Villa', f.property_id === 'all' ? 'All / shared' : (prop(f.property_id) || {}).name || '—'], ['Paid to', f.vendor || '—'], ['Note', f.note || '—']);
    route = 'f.expense.save'; payload = { expense: { date: f.date, category: f.category, amount: f.amount, property_id: f.property_id, vendor: f.vendor || '', basis: 'actual', note: (f.note || '') + ' · added by AP Brain' } };
  } else if (intent === 'record_salary') {
    const staff = (D.employees || []).filter(e => e.status === 'active'); let e = staff.find(x => x.emp_id === f.emp_id) || staff.find(x => f.emp_id && String(x.name).toLowerCase().indexOf(String(f.emp_id).toLowerCase()) >= 0);
    f.emp_id = e ? e.emp_id : ''; f.paid_on = foDate_(f.paid_on) || today; f.period = /^\d{4}-\d{2}$/.test(String(f.period || '')) ? f.period : f.paid_on.slice(0, 7); f.kind = f.kind || 'salary'; f.mode = f.mode || 'upi';
    if (!f.amount && e && e.salary_amount !== '') f.amount = e.salary_amount;
    need('emp_id', 'which team member (add them in People & HR first if new)'); need('amount', 'amount paid');
    lines.push(['Person', e ? e.name + ' (' + e.role + ')' : '—'], ['Amount', f.amount ? inr(f.amount) : '—'], ['For', f.period + ' · ' + f.kind], ['Paid on', f.paid_on + ' by ' + f.mode + (f.ref ? ' · ' + f.ref : '')], ['Finance', 'also booked as an expense (Staff & caretakers)']);
    route = 'f.hr.pay.save'; payload = { payment: { emp_id: f.emp_id, amount: f.amount, paid_on: f.paid_on, period: f.period, kind: f.kind, mode: f.mode, ref: f.ref || '', note: 'added by AP Brain' } };
  } else if (intent === 'add_employee') {
    f.role = FO_HR_ROLES.indexOf(f.role) >= 0 ? f.role : (f.role ? 'other' : ''); f.work_mode = f.work_mode === 'remote' ? 'remote' : 'on-site'; f.salary_cycle = f.salary_cycle || 'monthly';
    need('name', 'name'); need('role', 'role (caretaker, sweeper, intern…)');
    lines.push(['Name', f.name || '—'], ['Role', (f.role || '—') + ' · ' + f.work_mode], ['Contact', [f.phone, f.email].filter(Boolean).join(' · ') || '—'], ['Pay', f.salary_amount ? inr(f.salary_amount) + ' ' + f.salary_cycle + (f.pay_day ? ', day ' + f.pay_day : '') : 'not set']);
    route = 'f.hr.emp.save'; payload = { employee: { name: f.name, role: f.role, work_mode: f.work_mode, phone: f.phone || '', email: f.email || '', property_ids: f.property_ids || 'all', salary_amount: f.salary_amount || '', salary_cycle: f.salary_cycle, pay_day: f.pay_day || '', joined: foDate_(f.joined) || today, notes: 'added by AP Brain' } };
  } else if (intent === 'add_lead') {
    if (!f.name && !f.phone && !f.email) missing.push({ key: 'name', label: 'name or phone' });
    f.stage = 'new'; f.next_followup = foDate_(f.next_followup) || FoMetrics.addDays(today, 1);
    lines.push(['Enquiry', [f.name, f.phone, f.email].filter(Boolean).join(' · ') || '—'], ['Wants', [f.villa, f.checkin, f.nights ? f.nights + ' nights' : '', f.guests ? f.guests + ' guests' : ''].filter(Boolean).join(' · ') || '—'], ['From', f.source || '—'], ['Follow up', f.next_followup]);
    route = 'f.crm.lead.save'; payload = { lead: { name: f.name || '', phone: f.phone || '', email: f.email || '', source: f.source || '', villa: f.villa || '', checkin: f.checkin || '', nights: f.nights || '', guests: f.guests || '', value_inr: f.value_inr || '', stage: 'new', next_followup: f.next_followup, notes: (f.notes || '') + ' · added by AP Brain' } };
  } else if (intent === 'channel_change') {
    const types = { rate: 'Price', pct: 'Price change vs recommended', recommended: 'Back to the recommended price', close: 'Close', open: 'Open', min_stay: 'Minimum stay', max_stay: 'Maximum stay', cta: 'No check-ins (closed to arrival)', ctd: 'No check-outs (closed to departure)', stop_sell: 'Stop-sell', units: 'Units to sell' };
    const names = { mmt: 'MakeMyTrip / Goibibo', booking: 'Booking.com', airbnb: 'Airbnb' };
    f.type = types[f.type] ? f.type : 'rate'; f.from = foDate_(f.from) || ''; f.to = foDate_(f.to) || f.from; f.basis = f.basis === 'channel' ? 'channel' : 'net';
    if (String(f.property_id || '').toLowerCase() === 'all') f.property_id = 'all';
    const chans = String(f.channels || '').toLowerCase().split(/[\s,]+/).map(c => /goibibo|make/.test(c) ? 'mmt' : /booking/.test(c) ? 'booking' : c).filter(c => names[c]);
    const wds = String(f.weekdays == null ? '' : f.weekdays).split(/[\s,]+/).filter(x => /^[0-6]$/.test(x)).map(Number);   // nothing said = every day
    const on = !/^(off|no|false|0|remove|clear)$/i.test(String(f.value == null ? 'on' : f.value).trim());
    need('property_id', 'which villa (or all villas)'); need('from', 'which nights');
    if (['rate', 'pct', 'min_stay'].indexOf(f.type) >= 0 && !foNum_(f.value)) missing.push({ key: 'value', label: f.type === 'rate' ? 'the price' : f.type === 'pct' ? 'the % change' : 'the minimum nights' });
    if (['max_stay', 'units'].indexOf(f.type) >= 0 && !foHasNum_(f.value)) missing.push({ key: 'value', label: f.type === 'units' ? 'how many units' : 'the maximum nights (0 = no limit)' });
    const set = {};
    if (f.type === 'rate') set.price = { mode: f.basis, value: foNum_(f.value) };
    else if (f.type === 'pct') set.price = { mode: 'pct', value: foNum_(f.value) };
    else if (f.type === 'recommended') set.price = { mode: 'recommended' };
    else if (f.type === 'close' || f.type === 'open') set.closed = f.type === 'close';
    else if (f.type === 'units') set.units = foNum_(f.value);
    else if (f.type === 'min_stay' || f.type === 'max_stay') set[f.type] = foNum_(f.value);
    else set[f.type] = on;
    const what = f.type === 'rate' && f.value ? ' ' + inr(f.value) + (f.basis === 'net' ? ' (you keep; commission added per channel)' : ' (guest price)') : f.type === 'pct' && f.value ? ' ' + (foNum_(f.value) > 0 ? '+' : '') + foNum_(f.value) + '%' :
      ['min_stay', 'max_stay'].indexOf(f.type) >= 0 && foHasNum_(f.value) ? ' ' + (foNum_(f.value) || 'no limit') + (foNum_(f.value) ? ' nights' : '') : f.type === 'units' && foHasNum_(f.value) ? ' ' + foNum_(f.value) : ['cta', 'ctd', 'stop_sell'].indexOf(f.type) >= 0 ? (on ? ' ON' : ' OFF') : '';
    const vs = f.property_id === 'all' ? props.map(p => p.property_id) : String(f.property_id || '').split(',').filter(Boolean);
    lines.push(['Villa', f.property_id === 'all' ? 'All villas' : vs.map(v => (prop(v) || {}).name || '—').join(', ') || '—'], ['Change', types[f.type] + what],
      ['Nights', (f.from || '?') + (f.to && f.to !== f.from ? ' → ' + f.to : '') + (wds.length ? ' · only ' + wds.map(n => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n]).join(', ') : '')], ['Channels', chans.length ? chans.map(c => names[c]).join(', ') : 'all three'],
      ['Safety', 'saved to your calendar now; prices stay inside your floor/ceiling; each channel updates when its bot or Phone assist runs']);
    route = 'f.cm.bulk'; payload = { bulk: { villas: vs, from: f.from, to: f.to, weekdays: wds, channels: chans, set, approve: true } };
  } else if (intent === 'record_payment') {
    const pays = foRows_('Payments'), refund = f.type === 'refund', found = foActBookings_(f).filter(x => refund || x.status !== 'cancelled'), due = x => foBookingDue_(x, pays);
    const stay = x => (prop(x.property_id) || {}).name + ' · ' + x.checkin + ' → ' + x.checkout, people = found.map(x => foActTokens_(x.guest_name).join(' ')).filter((n, i, a) => a.indexOf(n) === i);
    f.type = refund ? 'refund' : 'payment'; f.date = foDate_(f.date) || today;
    let items = [];
    if (!found.length) missing.push({ key: 'guest_name', label: 'the guest (I found no booking for "' + (f.guest_name || f.booking_ref || f.guest_phone || '?') + '"; send the booking number, phone or exact name)' });
    else if (people.length > 1) { found.forEach(x => lines.push([x.guest_name, stay(x)])); missing.push({ key: 'guest_name', label: 'which of these guests' }); }
    else {
      const open = found.filter(x => due(x) > 0.5).sort((x, y) => String(x.checkin) < String(y.checkin) ? -1 : 1), total = open.reduce((t, x) => t + due(x), 0), amount = foNum_(f.amount);
      if (refund || !open.length && found.length === 1 && !foHasNum_(found[0].gross_amount) && amount > 0) {
        if (found.length > 1) missing.push({ key: 'checkin', label: 'which stay (its check-in date)' }); else if (!(amount > 0)) missing.push({ key: 'amount', label: 'the amount' });
        else items = [{ booking_id: found[0].booking_id, amount, expect_due: '' }];
      } else if (!open.length) {
        closed = true; f.settled = true; found.forEach(x => lines.push([stay(x), foHasNum_(x.gross_amount) ? 'nothing pending' : 'no amount on this booking']));
      } else if (amount > total + 1) missing.push({ key: 'amount', label: 'a smaller amount (only ' + inr(total) + ' is pending)' });
      else { let left = amount > 0 ? amount : total; open.forEach(x => { const pay = Math.min(left, due(x)); if (pay > 0.5) { items.push({ booking_id: x.booking_id, amount: pay, expect_due: due(x) }); left -= pay; } }); }
    }
    items.forEach(it => { const x = found.find(y => y.booking_id === it.booking_id); lines.push([stay(x), inr(it.amount) + (it.expect_due === '' ? '' : ' of ' + inr(it.expect_due) + ' pending')]); });
    if (items.length) { lines.unshift(['Guest', found[0].guest_name]); lines.push(['Type', f.type + ' · ' + f.date + (f.method ? ' · ' + f.method : '') + (f.reference ? ' · ' + f.reference : '')]); }
    route = 'f.payment.settle'; payload = { payment: { type: f.type, date: f.date, method: f.method || '', reference: f.reference || '', items } };
    if (closed) return { fields: f, missing, question: 'Nothing is pending for ' + found[0].guest_name + ', so I changed nothing.', lines, route: '', payload: {}, ready: false, closed: true };
  } else if (intent === 'update_booking') {
    let found = foActBookings_(f); const upcoming = found.filter(x => String(x.checkout) >= today);
    if (found.length > 1 && upcoming.length === 1) found = upcoming;
    const status = /cancel/i.test(f.status || '') ? 'cancelled' : /no.?show/i.test(f.status || '') ? 'no_show' : ['confirmed', 'tentative'].indexOf(f.status) >= 0 ? f.status : '';
    const x = found.length === 1 ? found[0] : null, set = {}, np = f.new_property_id ? prop(f.new_property_id) || propByName(f.new_property_id) : null;
    if (status) set.status = status; if (foDate_(f.new_checkin)) set.checkin = foDate_(f.new_checkin); if (foDate_(f.new_checkout)) set.checkout = foDate_(f.new_checkout); if (np) set.property_id = np.property_id;
    ['gross_amount', 'discount', 'adults', 'children'].forEach(k => { if (foHasNum_(f[k])) set[k] = foNum_(f[k]); });
    if (f.note && x) set.notes = (x.notes ? x.notes + ' · ' : '') + f.note;
    if (!found.length) missing.push({ key: 'guest_name', label: 'the booking (I found none for "' + (f.guest_name || f.booking_ref || f.guest_phone || '?') + '")' });
    else if (!x) { found.forEach(y => lines.push([y.guest_name, (prop(y.property_id) || {}).name + ' · ' + y.checkin + ' → ' + y.checkout + ' · ' + y.status])); missing.push({ key: 'checkin', label: 'which of these stays (its check-in date)' }); }
    if (!Object.keys(set).length) missing.push({ key: 'status', label: 'what to change' });
    if (x) { lines.push(['Booking', x.guest_name + ' · ' + (prop(x.property_id) || {}).name + ' · ' + x.checkin + ' → ' + x.checkout]); Object.keys(set).forEach(k => lines.push([k.replace('_', ' '), (k === 'property_id' ? (prop(x[k]) || {}).name + ' → ' + np.name : k === 'notes' ? f.note : String(x[k] === '' ? '—' : x[k]) + ' → ' + set[k])]));
      if (set.status === 'cancelled') lines.push(['Money', 'anything collected stays recorded; add a refund if you return it']); }
    route = 'f.booking.save'; payload = { booking: Object.assign({ booking_id: x ? x.booking_id : '', version: x ? x.version : '' }, set) };
  } else if (intent === 'add_task') {
    f.due = foDate_(f.due) || ''; need('title', 'what the task is');
    lines.push(['Task', f.title || '—'], ['Due', f.due || 'no date'], ['Notes', f.notes || '—']);
    route = 'f.crm.task.save'; payload = { task: { title: f.title, due: f.due, notes: f.notes || '' } };
  } else if (intent === 'complete_task') {
    const hits = (D.crm_tasks || []).filter(t => !t.done && foActNameMatch_(f.title, t.title));
    if (!hits.length) missing.push({ key: 'title', label: 'which task (no open task matches "' + (f.title || '?') + '")' });
    else if (hits.length > 1) { hits.forEach(t => lines.push([t.title, t.due || 'no date'])); missing.push({ key: 'title', label: 'which of these tasks' }); }
    const t = hits.length === 1 ? hits[0] : null; if (t) lines.push(['Task', t.title], ['Mark as', 'done']);
    route = 'f.crm.task.save'; payload = { task: t ? { task_id: t.task_id, title: t.title, due: t.due, contact_type: t.contact_type, contact_id: t.contact_id, notes: t.notes, done: true } : {} };
  } else if (intent === 'update_lead') {
    const digits = String(f.phone || '').replace(/\D/g, '').slice(-10), hits = (D.crm_leads || []).filter(l => digits ? String(l.phone).replace(/\D/g, '').slice(-10) === digits : foActNameMatch_(f.name, l.name));
    if (!hits.length) missing.push({ key: 'name', label: 'the enquiry (none matches "' + (f.name || f.phone || '?') + '")' });
    else if (hits.length > 1) { hits.forEach(l => lines.push([l.name, l.stage + (l.checkin ? ' · ' + l.checkin : '')])); missing.push({ key: 'phone', label: 'which enquiry (send the phone number)' }); }
    const l = hits.length === 1 ? hits[0] : null, set = {};
    if (FO_CRM_STAGES.indexOf(f.stage) >= 0) set.stage = f.stage; if (foDate_(f.next_followup)) set.next_followup = foDate_(f.next_followup); if (f.lost_reason) set.lost_reason = f.lost_reason; if (foHasNum_(f.value_inr)) set.value_inr = foNum_(f.value_inr);
    if (f.notes && l) set.notes = (l.notes ? l.notes + ' · ' : '') + f.notes;
    if (!Object.keys(set).length) missing.push({ key: 'stage', label: 'what changed (stage, follow-up date or a note)' });
    if (l) { lines.push(['Enquiry', l.name]); Object.keys(set).forEach(k => lines.push([k.replace('_', ' '), k === 'notes' ? f.notes : String(l[k] === '' ? '—' : l[k]) + ' → ' + set[k]])); }
    route = 'f.crm.lead.save'; payload = { lead: l ? Object.assign({}, l, set) : {} }; delete payload.lead._row;
  }
  const question = missing.length ? 'To finish this I still need: ' + missing.map(m => m.label).join(', ') + '.' : '';
  return { fields: f, missing, question, lines, route, payload, ready: !missing.length };
}
function foActTokens_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').split(/\s+/).filter(Boolean); }
function foActOneEdit_(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++edits > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
/** Names match when every word of the shorter name is in the longer one (one typo allowed in long words, initials count): "Damodar Dholkar" = "Damodar Shashikant Dholkar". */
function foActNameMatch_(q, name) {
  const a = foActTokens_(q), b = foActTokens_(name), s = a.length <= b.length ? a : b, l = a.length <= b.length ? b : a;
  if (!s.length || !s.some(t => t.length > 1)) return false;
  return s.every(t => l.some(u => u === t || t.length === 1 && u[0] === t || u.length === 1 && t[0] === u || t.length >= 5 && foActOneEdit_(t, u)));
}
/** Live bookings for a guest, by booking or OTA number, then phone, then name; villa and check-in narrow it down. Read fresh so a balance is never stale. */
function foActBookings_(f) {
  const rows = foRows_('Bookings').filter(x => x.status !== 'void'), ref = String(f.booking_ref || '').trim().toLowerCase(), phone = String(f.guest_phone || '').replace(/\D/g, '').slice(-10);
  let hits = [];
  if (ref) hits = rows.filter(x => String(x.booking_id).toLowerCase() === ref || String(x.external_id).toLowerCase() === ref);
  if (!hits.length && phone.length === 10) { const ids = foRows_('Guests').filter(g => String(g.phone).replace(/\D/g, '').slice(-10) === phone).map(g => g.guest_id); hits = rows.filter(x => ids.indexOf(x.guest_id) >= 0); }
  if (!hits.length && f.guest_name) hits = rows.filter(x => foActNameMatch_(f.guest_name, x.guest_name));
  if (f.property_id && f.property_id !== 'all') hits = hits.filter(x => x.property_id === f.property_id);
  const on = foDate_(f.checkin); if (on) hits = hits.filter(x => foDate_(x.checkin) === on);
  return hits;
}
