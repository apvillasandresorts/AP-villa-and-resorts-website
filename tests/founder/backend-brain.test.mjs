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
  const call = env.net.calls.find(c => /api\.groq\.com/.test(c.url)), sent = call.payload;
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
  const r = env.api({ action: 'f.brain.ask', token, question: 'Price for Saturday?' });
  assert.equal(r.provider, 'Gemini'); assert.equal(r.answer, 'Gemini says hold prices.');
  assert.equal(env.net.calls.filter(c => /groq/.test(c.url)).length, 2, 'Groq retried once on 429');
  const g = env.net.calls.find(c => /generativelanguage/.test(c.url));
  assert.equal(g.headers['x-goog-api-key'], 'AIza_test'); assert.ok(!/key=/.test(g.url), 'key in a header, never in the URL');
  mode = 'down';
  const bad = env.api({ action: 'f.brain.ask', token, question: 'Again?' });
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
    if (/openai\/v1\/models$/.test(r.url)) return { code: 200, body: JSON.stringify({ data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }, { id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }, { id: 'meta-llama/llama-guard-4-12b' }] }) };
    const body = JSON.parse(r.payload || '{}');
    return body.model === 'openai/gpt-oss-120b' ? groqOk('Answer from the new model.') : { code: 404, body: '{"error":{"message":"model decommissioned"}}' };
  });
  env.props.set('GROQ_API_KEY', 'gsk_test');
  const r = env.api({ action: 'f.brain.ask', token, question: 'Tonight?' });
  assert.equal(r.ok, true, r.error); assert.equal(r.model, 'openai/gpt-oss-120b');
  assert.equal(env.props.get('GROQ_MODEL_AUTO'), 'openai/gpt-oss-120b');
  const n = env.net.calls.length; env.api({ action: 'f.brain.ask', token, question: 'Again?' });
  assert.equal(env.net.calls.slice(n).filter(c => /models$/.test(c.url)).length, 0, 'remembered: no second model lookup');
});

test('Gemini busy (503) on one model: the next model answers; the one that worked is remembered', async () => {
  const { env, token } = await ready(r => {
    if (/v1beta\/models\?/.test(r.url)) return { code: 200, body: JSON.stringify({ models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.8-pro'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) }) };
    if (/gemini-3\.7-flash:generateContent/.test(r.url)) return geminiOk('From 3.7.');
    return { code: 503, body: '{"error":{"message":"high demand"}}' };
  });
  env.props.set('GEMINI_API_KEY', 'AIza_test');
  const r = env.api({ action: 'f.brain.ask', token, question: 'Tonight?' });
  assert.equal(r.ok, true, r.error); assert.equal(r.model, 'gemini-3.7-flash');
  assert.equal(env.props.get('GEMINI_MODEL_AUTO'), 'gemini-3.7-flash');
  const ranked = env.fo.foBrainRankModels_('gemini', { models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.8-pro'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
  assert.deepEqual(ranked.slice(0, 3), ['gemini-3.7-flash', 'gemini-2.5-flash', 'gemini-3.8-flash'], 'newest (busiest) after the stable ones; lite last');
  assert.equal(ranked[ranked.length - 1], 'gemini-2.5-flash-lite');
});
