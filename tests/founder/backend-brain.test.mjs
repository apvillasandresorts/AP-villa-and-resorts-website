// AP Brain (docs/founder-os/FoBrain.gs): free Groq first, Gemini fallback, aggregates only (no guest data), limits, daily brief.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './gas-mock.mjs';

const CHECKINS = [
  { 'Submitted at': '2026-10-01T10:00:00', Reference: 'ECI-1', 'Booked through': 'Booking.com', 'Booking ID': '4523119876', Villa: 'Divinestay', 'Check-in': '2026-10-17', 'Check-out': '2026-10-20',
    Adults: 4, 'Main guest': 'Priya Sharma', Mobile: '9876543210', Email: 'priya@example.com', 'Payment status': 'Partly paid (advance)', 'Total ₹': 16500, 'Amount paid ₹': 5000, 'Balance due ₹': 11500 },
];
async function ready(http) { const env = makeEnv({ checkins: CHECKINS, http }); env.fo.foSetup(); const token = await env.login(); env.api({ action: 'f.sync', token }); return { env, token }; }
const groqOk = text => ({ code: 200, body: JSON.stringify({ choices: [{ message: { content: text } }] }) });
const geminiOk = text => ({ code: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }) });

test('no key: a clear setup message, nothing sent anywhere', async () => {
  const { env, token } = await ready(() => groqOk('x'));
  const r = env.api({ action: 'f.brain.ask', token, question: 'How is occupancy?' });
  assert.equal(r.ok, false); assert.equal(r.setup, true); assert.match(r.error, /Groq or Gemini key/);
  assert.equal(env.net.calls.filter(c => /groq|generativelanguage/.test(c.url)).length, 0);
  assert.deepEqual(env.api({ action: 'f.brain.status', token }).result.groq, false);
});

test('Groq answers; the request carries a business summary but never guest names, phones, emails or booking ids', async () => {
  const { env, token } = await ready(r => /groq/.test(r.url) ? groqOk('FACT: occupancy is low. RECOMMENDATION: hold ₹4,500.') : { code: 500, body: '' });
  env.props.set('GROQ_API_KEY', 'gsk_test');
  const r = env.api({ action: 'f.brain.ask', token, question: 'Should I call Priya on 98765 43210 or priya@example.com about pricing?', history: [{ role: 'assistant', text: 'Earlier answer' }], page: 'pricing/today' });
  assert.equal(r.ok, true, r.error); assert.equal(r.provider, 'Groq'); assert.match(r.answer, /RECOMMENDATION/);
  const call = env.net.calls.find(c => /api\.groq\.com/.test(c.url) && /BUSINESS SUMMARY/.test(c.payload || '')), sent = call.payload;
  const everything = env.net.calls.map(c => c.payload || '').join('\n');   // planner and research requests too
  for (const pii of ['9876543210', '98765 43210', 'priya@example.com', '4523119876', 'Sharma']) assert.ok(!everything.includes(pii), 'leaked anywhere: ' + pii);
  assert.match(call.headers.Authorization, /^Bearer gsk_test$/);
  const body = JSON.parse(sent);
  assert.equal(body.messages[0].role, 'system'); assert.equal(body.messages[1].content, 'Earlier answer');
  assert.match(sent, /next_30_days_on_books/); assert.match(sent, /pricing_desk/);
  for (const pii of ['9876543210', '98765 43210', 'priya@example.com', '4523119876', 'Sharma']) assert.ok(!sent.includes(pii), 'leaked ' + pii);
  assert.match(sent, /\[phone\]/); assert.match(sent, /\[email\]/);
  const log = env.tab('BrainLog');
  assert.equal(log.length, 1); assert.equal(log[0].provider, 'Groq'); assert.ok(!String(log[0].question).includes('priya@example.com'));
});

test('Groq over its free limit → Gemini answers (after one retry); both failing → friendly error, logged once', async () => {
  let mode = 'fallback';
  const { env, token } = await ready(r => /groq/.test(r.url) ? { code: 429, body: '{}' } : mode === 'fallback' ? geminiOk('Gemini says hold prices.') : { code: 503, body: '' });
  env.props.set('GROQ_API_KEY', 'gsk_test'); env.props.set('GEMINI_API_KEY', 'AIza_test');
  const r = env.api({ action: 'f.brain.ask', token, question: 'Price for Saturday?', web: false });
  assert.equal(r.provider, 'Gemini'); assert.equal(r.answer, 'Gemini says hold prices.');
  assert.equal(env.net.calls.filter(c => /groq/.test(c.url)).length, 2, 'Groq retried once on 429');
  const g = env.net.calls.find(c => /generativelanguage/.test(c.url));
  assert.equal(g.headers['x-goog-api-key'], 'AIza_test'); assert.ok(!/key=/.test(g.url), 'key in a header, never in the URL');
  mode = 'down';
  const bad = env.api({ action: 'f.brain.ask', token, question: 'Again?', web: false });
  assert.equal(bad.ok, false); assert.match(bad.error, /try again/);
  assert.equal(env.tab('Audit').filter(a => a.action === 'brain' && a.result === 'error').length, 1);
});

test('viewers cannot ask (manager+), empty questions refused, daily limit enforced', async () => {
  const { env, token } = await ready(() => groqOk('ok'));
  env.props.set('GROQ_API_KEY', 'gsk_test');
  assert.match(env.api({ action: 'f.brain.ask', token, question: '  ' }).error, /Type a question/);
  for (let i = 0; i < 150; i++) env.cache.set('FO_BRAIN_x', { v: '0', exp: 0 });
  const k = [...env.cache.keys()].find(x => /^FO_BRAIN_[0-9a-f]{12}$/.test(x)) || (env.api({ action: 'f.brain.ask', token, question: 'hi' }), [...env.cache.keys()].find(x => /^FO_BRAIN_[0-9a-f]{12}$/.test(x)));
  env.cache.set(k, { v: '150|' + (env.clock.now() + 3600000), exp: env.clock.now() + 3600000 });
  assert.match(env.api({ action: 'f.brain.ask', token, question: 'one more' }).error, /150 questions/);
  env.setUserRole('viewer');
  assert.match(env.api({ action: 'f.brain.ask', token, question: 'hi' }).error, /role/);
});

test('scrubber: emails, Indian mobiles and long ID numbers are masked; prices and dates are kept', async () => {
  const { env } = await ready();
  const s = env.fo.foBrainScrub_('Guest a.b@gmail.com +91 98765-43210, Aadhaar 1234 5678 9012, price ₹4,500 on 2026-11-08 for 3 nights');
  assert.equal(s, 'Guest [email] [phone], Aadhaar [number], price ₹4,500 on 2026-11-08 for 3 nights');
});

test('morning brief: emailed once a day when a key exists; off switch respected', async () => {
  const { env, token } = await ready(() => groqOk('Do one thing today: check Saturday.'));
  assert.equal(env.fo.foBrainDailyBrief_('2026-10-16'), 'no key');
  env.props.set('GROQ_API_KEY', 'gsk_test');
  assert.equal(env.fo.foBrainDailyBrief_('2026-10-16'), 'sent via Groq');
  assert.equal(env.fo.foBrainDailyBrief_('2026-10-16'), 'sent');
  assert.equal(env.mails.filter(m => /AP Brain · morning brief/.test(m.subject)).length, 1);
  env.api({ action: 'f.settings.save', token, settings: { brain_daily: 'off' } });
  assert.equal(env.fo.foBrainDailyBrief_('2026-10-17'), 'off');
});

test('retired model (404): the brain asks the provider for its models, picks the best chat model and remembers it', async () => {
  const { env, token } = await ready(r => {
    if (/openai\/v1\/models$/.test(r.url)) return { code: 200, body: JSON.stringify({ data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }, { id: 'openai/gpt-oss-240b' }, { id: 'openai/gpt-oss-20b' }, { id: 'meta-llama/llama-guard-4-12b' }] }) };
    const body = JSON.parse(r.payload || '{}');
    return body.model === 'openai/gpt-oss-240b' ? groqOk('Answer from the new model.') : { code: 404, body: '{"error":{"message":"model decommissioned"}}' };
  });
  env.props.set('GROQ_API_KEY', 'gsk_test');
  const r = env.api({ action: 'f.brain.ask', token, question: 'Tonight?', web: false });
  assert.equal(r.ok, true, r.error); assert.equal(r.model, 'openai/gpt-oss-240b');
  assert.equal(env.props.get('GROQ_MODEL_AUTO'), 'openai/gpt-oss-240b');
  const n = env.net.calls.length; env.api({ action: 'f.brain.ask', token, question: 'Again?', web: false });
  assert.equal(env.net.calls.slice(n).filter(c => /models$/.test(c.url)).length, 0, 'remembered: no second model lookup');
});

test('Gemini busy (503) on one model: the next model answers; the one that worked is remembered', async () => {
  const { env, token } = await ready(r => {
    if (/v1beta\/models\?/.test(r.url)) return { code: 200, body: JSON.stringify({ models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.8-pro'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) }) };
    if (/gemini-3\.7-flash:generateContent/.test(r.url)) return geminiOk('From 3.7.');
    return { code: 503, body: '{"error":{"message":"high demand"}}' };
  });
  env.props.set('GEMINI_API_KEY', 'AIza_test');
  const r = env.api({ action: 'f.brain.ask', token, question: 'Tonight?', web: false });
  assert.equal(r.ok, true, r.error); assert.equal(r.model, 'gemini-3.7-flash');
  assert.equal(env.props.get('GEMINI_MODEL_AUTO'), 'gemini-3.7-flash');
  const ranked = env.fo.foBrainRankModels_('gemini', { models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.8-pro'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
  assert.deepEqual(ranked.slice(0, 3), ['gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-3.8-flash'], 'newest (busiest) after the stable ones; lite last');
  assert.equal(ranked[ranked.length - 1], 'gemini-2.5-flash-lite');
});

test('market research: the planner picks searches, Groq web search answers them in parallel, the answer cites numbered sources', async () => {
  const sent = [];
  const { env, token } = await ready(r => {
    const body = JSON.parse(r.payload || '{}'); sent.push({ url: r.url, body });
    if (/groq/.test(r.url)) {
      if (body.tools) return { code: 200, body: JSON.stringify({ choices: [{ message: { content: '- A 120-room hotel opened near Mahakal Lok in Sept 2026.【5†L13-L18】', executed_tools: [{ type: 'browser.search', search_results: { results: [{ title: 'freepressjournal.in', url: 'https://example.com/hotel' }, { title: 'freepressjournal.in', url: 'https://example.com/hotel#x' }] } }] } }] }) };
      if (/decide whether a question/.test(body.messages[0].content)) return groqOk('{"search": ["new hotels near Mahakal Lok Ujjain 2026", "Simhastha 2028 preparations Ujjain"]}');
      return groqOk('**Hold prices** [1]\n- New hotel opened [1]');
    }
    return { code: 500, body: '' };
  });
  env.props.set('GROQ_API_KEY', 'gsk_test'); env.props.set('GEMINI_API_KEY', 'AIza_test');
  const r = env.api({ action: 'f.brain.ask', token, question: 'Is there new competition near the temple?' });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.searched, ['new hotels near Mahakal Lok Ujjain 2026', 'Simhastha 2028 preparations Ujjain']);
  assert.deepEqual(r.sources, [{ title: 'freepressjournal.in', url: 'https://example.com/hotel' }], 'sources de-duplicated');
  assert.deepEqual(r.research_via, ['Groq web search']);
  assert.equal(sent.filter(x => /generateContent/.test(x.url)).length, 0, 'Gemini not needed when Groq answered');
  assert.deepEqual(sent.find(x => x.body.tools).body.tools, [{ type: 'browser_search' }]);
  const final = sent.filter(x => /groq/.test(x.url) && !x.body.tools).pop().body.messages.pop().content;
  assert.ok(!/【/.test(final), 'gpt-oss citation marks removed');
  assert.match(final, /WEB RESEARCH/); assert.match(final, /\[1\] freepressjournal\.in/); assert.match(final, /next_14_nights/);
  assert.match(r.answer, /Hold prices/);
});

test('market research falls back: Groq web search down, Gemini over its free quota (429) → GDELT news headlines with links', async () => {
  const { env, token } = await ready(r => {
    const body = JSON.parse(r.payload || '{}');
    if (/groq/.test(r.url)) {
      if (body.tools) return { code: 503, body: '{}' };
      return /decide whether a question/.test(body.messages[0].content) ? groqOk('{"search": ["Simhastha 2028 preparations"]}') : groqOk('Answer.');
    }
    if (/generateContent/.test(r.url)) return { code: 429, body: '{"error":{"status":"RESOURCE_EXHAUSTED"}}' };
    if (/gdeltproject/.test(r.url)) return { code: 200, body: JSON.stringify({ articles: [{ title: 'Simhastha 2028: ghats work speeds up', url: 'https://news.example/1', domain: 'news.example', seendate: '20261024T101500Z' }] }) };
    return { code: 500, body: '' };
  });
  env.props.set('GROQ_API_KEY', 'gsk_test'); env.props.set('GEMINI_API_KEY', 'AIza_test');
  const r = env.api({ action: 'f.brain.ask', token, question: 'Any news on Simhastha?' });
  assert.equal(r.ok, true, r.error); assert.deepEqual(r.research_via, ['news (GDELT)']);
  assert.deepEqual(r.sources, [{ title: 'Simhastha 2028: ghats work speeds up', url: 'https://news.example/1' }]);
});

test('market research: no search when the planner says the business data is enough, or when the owner switches it off', async () => {
  let grounded = 0;
  const { env, token } = await ready(r => {
    const body = JSON.parse(r.payload || '{}');
    if (/groq/.test(r.url)) return /decide whether a question/.test(body.messages[0].content) ? groqOk('{"search": []}') : groqOk('Fine.');
    if (/generateContent/.test(r.url) && body.tools) { grounded++; return geminiOk('x'); }
    return { code: 200, body: JSON.stringify({ models: [] }) };
  });
  env.props.set('GROQ_API_KEY', 'gsk_test'); env.props.set('GEMINI_API_KEY', 'AIza_test');
  const a = env.api({ action: 'f.brain.ask', token, question: 'How many nights are open next week?' });
  assert.equal(a.ok, true); assert.deepEqual(a.searched, []); assert.equal(grounded, 0);
  const b = env.api({ action: 'f.brain.ask', token, question: 'Any news on Simhastha?', web: false });
  assert.equal(b.ok, true); assert.equal(grounded, 0);
});

test('free allowance used up (429 tokens per day) on the big model → the smaller model answers; Groq down entirely → Cerebras answers', async () => {
  let groqDown = false;
  const { env, token } = await ready(r => {
    const body = JSON.parse(r.payload || '{}');
    if (/groq/.test(r.url)) return groqDown ? { code: 503, body: '{}' } : body.model === 'openai/gpt-oss-120b' ? { code: 429, body: '{"error":{"message":"Rate limit reached ... tokens per day (TPD)"}}' } : groqOk('From the small model.');
    if (/cerebras/.test(r.url)) return groqOk('From Cerebras.');
    return { code: 500, body: '' };
  });
  env.props.set('GROQ_API_KEY', 'gsk_test'); env.props.set('CEREBRAS_API_KEY', 'csk_test');
  const a = env.api({ action: 'f.brain.ask', token, question: 'Tonight?', web: false });
  assert.equal(a.ok, true, a.error); assert.equal(a.model, 'openai/gpt-oss-20b'); assert.equal(a.provider, 'Groq');
  assert.equal(env.props.get('GROQ_MODEL_AUTO') ?? null, null, 'not remembered: the big model is back once its daily allowance resets');
  groqDown = true;
  const b = env.api({ action: 'f.brain.ask', token, question: 'Again?', web: false });
  assert.equal(b.ok, true, b.error); assert.equal(b.provider, 'Cerebras');
  const c = env.net.calls.filter(x => /cerebras/.test(x.url)).pop(); assert.equal(c.headers.Authorization, 'Bearer csk_test');
});

test('actions: a pasted voucher becomes a booking draft, AP Brain asks for what is missing, then the draft saves through the normal booking route', async () => {
  const sent = [];
  const { env, token } = await ready(r => {
    const body = JSON.parse(r.payload || '{}'); sent.push({ url: r.url, body });
    const msg = body.messages ? body.messages[body.messages.length - 1].content : '';
    if (/groq/.test(r.url)) {
      if (/MESSAGE:\n.*7,800/s.test(msg)) return groqOk('{"intent":"add_booking","fields":{"gross_amount":7800},"note":"Amount added."}');
      return groqOk('```json\n{"intent":"add_booking","fields":{"property_id":"Rudrangan Suites","guest_name":"Rahul Verma","guest_phone":"+91 98100 00000","checkin":"2026-11-14","checkout":"2026-11-16","adults":4,"channel":"Booking.com","external_id":"5123456789"},"note":"Booking.com voucher read."}\n```');
    }
    if (/generativelanguage/.test(r.url)) return geminiOk('{"intent":"none"}');
    return { code: 500, body: '' };
  });
  env.props.set('GROQ_API_KEY', 'gsk_test'); env.props.set('GEMINI_API_KEY', 'AIza_test');
  const voucher = 'Booking.com confirmation 5123456789\nGuest: Rahul Verma +91 98100 00000, Aadhaar 1234 5678 9012\nRudrangan Suites · 14 Nov – 16 Nov 2026 · 4 adults';
  const a = env.api({ action: 'f.brain.act', token, text: voucher });
  assert.equal(a.ok, true, a.error); assert.equal(a.result.intent, 'add_booking'); assert.equal(a.result.ready, false);
  assert.deepEqual(a.result.missing.map(m => m.key), ['gross_amount']); assert.match(a.result.question, /total amount/);
  assert.equal(a.result.fields.property_id, 'rudrangan-suites', 'villa name matched to its id');
  assert.ok(!sent.some(x => /generativelanguage/.test(x.url)), 'guest details never go to Gemini');
  assert.ok(sent.every(x => !JSON.stringify(x.body).includes('1234 5678 9012')), 'ID numbers masked');
  const b2 = env.api({ action: 'f.brain.act', token, text: 'total was 7,800', draft: { intent: a.result.intent, fields: a.result.fields } });
  assert.equal(b2.result.ready, true, JSON.stringify(b2.result.missing)); assert.equal(b2.result.route, 'f.booking.save');
  const saved = env.api(Object.assign({ action: b2.result.route, token }, b2.result.payload));
  assert.equal(saved.ok, true, saved.error); assert.equal(saved.booking.guest_name, 'Rahul Verma'); assert.equal(Number(saved.booking.gross_amount), 7800); assert.equal(saved.booking.external_id, '5123456789');
  assert.ok(env.tab('BrainLog').every(l => !/Rahul|98100/.test(l.question)), 'the log keeps only the action type');
});

test('actions: expense and salary in plain words; the salary defaults to the person\'s pay; questions fall through as "none"', async () => {
  const { env, token } = await ready(r => {
    const body = JSON.parse(r.payload || '{}'), msg = body.messages[body.messages.length - 1].content;
    if (/electricity/.test(msg)) return groqOk('{"intent":"add_expense","fields":{"amount":2450,"category":"utilities","property_id":"ap-suite","vendor":"MPEB","date":"2026-10-15"}}');
    if (/Mahesh/.test(msg)) return groqOk('{"intent":"record_salary","fields":{"emp_id":"Mahesh","mode":"upi"}}');
    return groqOk('{"intent":"none"}');
  });
  env.props.set('GROQ_API_KEY', 'gsk_test');
  env.api({ action: 'f.hr.emp.save', token, employee: { name: 'Mahesh Kumar', role: 'caretaker', salary_amount: 12000 } });
  const e = env.api({ action: 'f.brain.act', token, text: 'paid electricity bill 2450 for AP Suite to MPEB on 15 Oct' });
  assert.equal(e.result.intent, 'add_expense'); assert.equal(e.result.ready, true); assert.equal(e.result.route, 'f.expense.save');
  assert.equal(env.api(Object.assign({ action: e.result.route, token }, e.result.payload)).ok, true);
  const s = env.api({ action: 'f.brain.act', token, text: 'paid Mahesh salary today by UPI' });
  assert.equal(s.result.intent, 'record_salary'); assert.equal(s.result.ready, true); assert.equal(Number(s.result.fields.amount), 12000);
  assert.equal(env.api(Object.assign({ action: s.result.route, token }, s.result.payload)).ok, true);
  assert.equal(env.tab('Expenses').length, 2, 'electricity + the salary expense');
  assert.equal(env.api({ action: 'f.brain.act', token, text: 'how is occupancy?' }).result.intent, 'none');
});

test('actions: "set AP Suite ₹4,000 on Airbnb and Booking this weekend" becomes channel jobs after the owner confirms', async () => {
  const { env, token } = await ready(() => groqOk('{"intent":"channel_change","fields":{"property_id":"AP Suite","type":"rate","value":4000,"from":"2026-10-23","to":"2026-10-25","weekdays":"5,6","channels":"airbnb, booking.com"}}'));
  env.props.set('GROQ_API_KEY', 'gsk_test');
  const a = env.api({ action: 'f.brain.act', token, text: 'set AP Suite 4000 on Airbnb and Booking this weekend' });
  assert.equal(a.result.intent, 'channel_change'); assert.equal(a.result.ready, true, JSON.stringify(a.result.missing)); assert.equal(a.result.route, 'f.cm.bulk');
  assert.deepEqual(a.result.payload.bulk.channels, ['airbnb', 'booking']); assert.deepEqual(a.result.payload.bulk.weekdays, [5, 6]); assert.deepEqual(a.result.payload.bulk.villas, ['ap-suite']);
  const r = env.api(Object.assign({ action: a.result.route, token }, a.result.payload));
  assert.equal(r.ok, true, r.error); assert.equal(r.result.jobs, 2, JSON.stringify(r.result));
  assert.ok(env.tab('ChannelJobs').every(j => j.state === 'queued' && j.date_from === '2026-10-23' && j.date_to === '2026-10-24'));
});

test('actions: restrictions in plain words — "no check-ins on 14 Nov for all villas", "min stay 2 on weekends" — go through bulk edit', async () => {
  let reply = '';
  const { env, token } = await ready(() => groqOk(reply));
  env.props.set('GROQ_API_KEY', 'gsk_test');
  reply = '{"intent":"channel_change","fields":{"property_id":"all","type":"cta","value":"on","from":"2026-11-14"}}';
  const a = env.api({ action: 'f.brain.act', token, text: 'no check-ins on 14 Nov for all villas on every channel' });
  assert.equal(a.result.ready, true, JSON.stringify(a.result.missing)); assert.equal(a.result.payload.bulk.villas.length, 5); assert.deepEqual(a.result.payload.bulk.set, { cta: true });
  assert.equal(env.api(Object.assign({ action: a.result.route, token }, a.result.payload)).ok, true);
  assert.equal(env.tab('InventoryCalendar').filter(x => x.date === '2026-11-14' && x.cta === 'yes').length, 5);
  reply = '{"intent":"channel_change","fields":{"property_id":"Villa Aranya","type":"min_stay","from":"2026-12-01","to":"2026-12-31","weekdays":"5,6"}}';
  const b = env.api({ action: 'f.brain.act', token, text: 'min stay on weekends in December for Villa Aranya' });
  assert.equal(b.result.ready, false); assert.match(b.result.question, /minimum nights/);
});

function actEnv(reply, more = []) {
  const rows = CHECKINS.concat(more);
  return (async () => { const env = makeEnv({ checkins: rows, http: r => /groq/.test(r.url) ? groqOk(JSON.stringify(reply())) : { code: 500, body: '' } }); env.fo.foSetup(); const token = await env.login(); env.api({ action: 'f.sync', token }); env.props.set('GROQ_API_KEY', 'gsk_test'); return { env, token }; })();
}
const save = (env, token, r) => env.api(Object.assign({ action: r.route, token }, r.payload));

test('actions: "completed all pending payments" finds the guest by a fuller name, settles the balance, and a second tap saves nothing', async () => {
  const { env, token } = await actEnv(() => ({ intent: 'record_payment', fields: { guest_name: 'Priya Devi Sharma' } }));
  const a = env.api({ action: 'f.brain.act', token, text: 'Priya Devi Sharma completed all pending payments update it' });
  assert.equal(a.result.ready, true, a.result.question); assert.equal(a.result.route, 'f.payment.settle');
  assert.equal(a.result.payload.payment.items[0].amount, 11500); assert.match(a.result.lines.flat().join(' '), /11,500/);
  const sent = env.net.calls.filter(c => /groq/.test(c.url)).map(c => c.payload).join('\n');
  assert.ok(!sent.includes('9876543210') && !sent.includes('4523119876'), 'no ledger details go to the model');
  assert.equal(save(env, token, a.result).ok, true);
  const pay = env.tab('Payments').filter(p => p.origin === 'manual');
  assert.equal(pay.length, 1); assert.equal(Number(pay[0].amount), 11500);
  assert.match(save(env, token, a.result).error, /has changed/);
  assert.equal(env.tab('Payments').filter(p => p.origin === 'manual').length, 1);
  const again = env.api({ action: 'f.brain.act', token, text: 'Priya paid everything' }).result;
  assert.equal(again.closed, true); assert.equal(again.ready, false); assert.match(again.question, /Nothing is pending/);
});

test('actions: part payments, too much, an unknown guest and two different guests never save the wrong thing', async () => {
  let reply = { intent: 'record_payment', fields: { guest_name: 'Priya Sharma', amount: 4000 } };
  const other = Object.assign({}, CHECKINS[0], { Reference: 'ECI-2', 'Booking ID': '77', 'Main guest': 'Priya Verma', Mobile: '9000000000', Email: 'v@example.com', 'Check-in': '2026-11-17', 'Check-out': '2026-11-18' });
  const { env, token } = await actEnv(() => reply, [other]);
  assert.equal(env.api({ action: 'f.brain.act', token, text: 'x' }).result.payload.payment.items[0].amount, 4000);
  reply.fields.amount = 50000;
  assert.match(env.api({ action: 'f.brain.act', token, text: 'x' }).result.question, /only ₹11,500 is pending/);
  reply = { intent: 'record_payment', fields: { guest_name: 'Nobody Known' } };
  assert.match(env.api({ action: 'f.brain.act', token, text: 'x' }).result.question, /no booking/);
  reply = { intent: 'record_payment', fields: { guest_name: 'Priya' } };
  const two = env.api({ action: 'f.brain.act', token, text: 'x' }).result;
  assert.equal(two.ready, false); assert.match(two.question, /which of these guests/);
});

test('actions: cancelling a booking keeps everything else; tasks are added and ticked off', async () => {
  let reply = { intent: 'update_booking', fields: { guest_name: 'Priya Sharma', status: 'cancel' } };
  const { env, token } = await actEnv(() => reply);
  const a = env.api({ action: 'f.brain.act', token, text: 'Priya Sharma cancelled' }).result;
  assert.equal(a.ready, true, a.question); assert.equal(save(env, token, a).ok, true);
  const bk = env.tab('Bookings')[0]; assert.equal(bk.status, 'cancelled'); assert.equal(bk.checkin, '2026-10-17'); assert.equal(Number(bk.gross_amount), 16500);
  reply = { intent: 'add_task', fields: { title: 'Call the plumber', due: '2026-10-20' } };
  assert.equal(save(env, token, env.api({ action: 'f.brain.act', token, text: 'x' }).result).ok, true);
  env.cache.clear && env.cache.clear();
  reply = { intent: 'complete_task', fields: { title: 'plumber' } };
  const d = env.api({ action: 'f.brain.act', token, text: 'done with plumber' }).result;
  assert.equal(d.ready, true, d.question); assert.equal(save(env, token, d).ok, true);
  assert.equal(env.tab('CrmTasks')[0].done, 'yes');
});

test('language: English unless the question is in Devanagari; the model stray citation marks are removed', async () => {
  const { env, token } = await ready(() => groqOk('Hold prices.【5†L1】'));
  env.props.set('GROQ_API_KEY', 'gsk_test');
  const r = env.api({ action: 'f.brain.ask', token, question: 'Damodar Dholkar pending?', web: false });
  assert.equal(r.answer, 'Hold prices.');
  assert.match(env.net.calls.at(-1).payload, /Reply in English only/);
  env.api({ action: 'f.brain.ask', token, question: 'आज का भाव क्या है?', web: false });
  assert.match(env.net.calls.at(-1).payload, /Reply in Hindi\./);
});

test('answer check: an invented ₹ figure triggers one correction; if it stays, the owner is told', async () => {
  let n = 0, mode = 'fixes';
  const { env, token } = await ready(() => { n++; return groqOk(mode === 'fixes' && n > 1 ? 'Hold prices. ESTIMATE ₹5,000 = 2 nights × ₹2,500.' : 'Add ₹98,765 to the cash.'); });
  env.props.set('GROQ_API_KEY', 'gsk_test');
  const a = env.api({ action: 'f.brain.ask', token, question: 'Cash?', web: false });
  assert.equal(n, 2); assert.deepEqual(a.unverified, []); assert.match(a.answer, /ESTIMATE/);
  mode = 'stuck'; n = 0;
  const b = env.api({ action: 'f.brain.ask', token, question: 'Cash?', web: false });
  assert.equal(n, 2); assert.deepEqual(b.unverified, ['₹98,765']);
  assert.equal(env.fo.foBrainUnverified_('Set ₹4,500 and ₹4,500.00 or Rs 1,200', 'price 4500 total 1200.5').join(), 'Rs 1,200');
});
