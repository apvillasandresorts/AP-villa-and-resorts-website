// AP Channel Manager (docs/founder-os/FoChannels.gs) on the Apps Script mock: registry, pricing link, job state machine, agent key,
// read-back rule, blocks pause a channel, booking-driven closures, reservation allowlist, iCal feed, kill switch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv } from './gas-mock.mjs';

async function ready() {
  const env = makeEnv(); env.fo.foSetup(); const token = await env.login();
  const add = (urls, extra) => env.api(Object.assign({ action: 'f.cm.listings.add', token, urls }, extra || {}));
  add(['https://www.airbnb.co.in/rooms/123456789?adults=4'], { role: 'own', villa: 'ap-suite', extranet_property_id: 'P1' });
  add(['https://www.booking.com/hotel/in/ap-suite-ujjain.en-gb.html?aid=1'], { role: 'own', villa: 'ap-suite', extranet_property_id: 'B1', extranet_room_id: 'R1' });
  add(['https://www.makemytrip.com/hotels/hotel-details/?hotelId=201811221234567&city=CTUJN'], { role: 'own', villa: 'ap-suite', extranet_property_id: 'M1' });
  const key = env.api({ action: 'f.cm.agent.key', token }).key;
  const agent = (action, body) => env.api(Object.assign({ action, agent_key: key, agent_id: 'vm1' }, body || {}));
  return { env, token, add, key, agent };
}
const job = (env, id) => env.tab('ChannelJobs').find(j => j.job_id === id);

test('registry: paste many links, platform + id parsed, duplicates skipped, junk reported; own listings need a villa', async () => {
  const { env, token, add } = await ready();
  const r = add('https://www.airbnb.com/rooms/987654321 https://www.goibibo.com/hotels/shree-residency-hotel-in-ujjain-4567891234/ https://example.com/x https://www.airbnb.co.in/rooms/987654321?x=1');
  assert.equal(r.ok, true, r.error); assert.deepEqual([r.result.added, r.result.skipped, r.result.rejected.length], [2, 1, 1]);
  const l = env.tab('Listings'); assert.equal(l.length, 5);
  assert.ok(l.some(x => x.platform === 'goibibo' && x.platform_listing_id === '4567891234' && x.role === 'competitor'));
  assert.ok(l.every(x => !/aid=|adults=|city=|x=1/.test(x.url_clean)), 'tracking parameters removed');
  assert.match(add('https://www.airbnb.co.in/rooms/111', { role: 'own', villa: 'nowhere' }).error, /villa/);
  env.setUserRole('manager');
  assert.match(env.api({ action: 'f.cm.listings.add', token, urls: 'https://www.airbnb.co.in/rooms/222' }).error, /role/);
});

test('pricing link: list = net ÷ (1 − commission), nearest ₹50, inside the floor/ceiling band; proposals merge equal nights', async () => {
  const { env, token } = await ready();
  const cal = env.api({ action: 'f.cm.ratedesk', token, villa: 'ap-suite', days: 14 });
  assert.equal(cal.ok, true, cal.error); assert.equal(cal.desk.length, 14);
  cal.desk.forEach(n => ['mmt', 'booking', 'airbnb'].forEach(c => {
    const x = n.channels[c]; assert.equal(x.list % 50, 0); assert.ok(x.list >= x.lo && x.list <= x.hi, c + ' ' + n.date + ' ' + x.list + ' not in ' + x.lo + '–' + x.hi);
    assert.ok(x.list > n.net, 'channel price carries the commission');
  }));
  const p = env.api({ action: 'f.cm.jobs.propose', token, villa: 'ap-suite', days: 14 });
  assert.equal(p.ok, true, p.error); assert.ok(p.result.proposed >= 3);
  const jobs = env.tab('ChannelJobs'); assert.ok(jobs.every(j => j.state === 'proposed' && j.reason === 'pricing'));
  assert.ok(jobs.length < 3 * 14, 'consecutive nights with the same price became one range');
  // proposing again creates nothing new (idempotent while open)
  assert.equal(env.api({ action: 'f.cm.jobs.propose', token, villa: 'ap-suite', days: 14 }).result.proposed, 0);
});

test('manual change: net price for chosen nights and weekdays on all channels; out-of-band values refused', async () => {
  const { env, token } = await ready();
  const r = env.api({ action: 'f.cm.jobs.propose', token, manual: { villa: 'ap-suite', from: '2026-10-20', to: '2026-10-26', weekdays: [5, 6], type: 'rate', value: 4000 } });
  assert.equal(r.ok, true, r.error); assert.equal(r.result.created.length, 3, JSON.stringify(r.result));
  assert.ok(env.tab('ChannelJobs').every(j => j.date_from === '2026-10-23' && j.date_to === '2026-10-24'));
  const bad = env.api({ action: 'f.cm.jobs.propose', token, manual: { villa: 'ap-suite', from: '2026-10-21', to: '2026-10-21', type: 'rate', value: 999999, basis: 'channel' } });
  assert.equal(bad.result.created.length, 0); assert.match(bad.result.errors[0], /outside the floor\/ceiling/);
  const tap = env.api({ action: 'f.cm.jobs.propose', token, manual: { villa: 'ap-suite', dates: ['2026-11-05', '2026-11-03', '2026-11-04', '2026-11-09'], type: 'close', channels: ['booking'] } });
  assert.deepEqual(tap.result.created.map(id => { const j = env.tab('ChannelJobs').find(x => x.job_id === id); return j.date_from + '→' + j.date_to; }), ['2026-11-03→2026-11-05', '2026-11-09→2026-11-09']);
  const ms = env.api({ action: 'f.cm.jobs.propose', token, manual: { villa: 'ap-suite', from: '2026-12-30', to: '2027-01-01', type: 'min_stay', value: 2, channels: ['airbnb'] } });
  assert.equal(ms.result.created.length, 1);
});

test('state machine: approve → agent pull (lease) → report with read-back → done; mismatch is never done; retry once then needs_human', async () => {
  const { env, token, agent } = await ready();
  env.api({ action: 'f.cm.jobs.propose', token, manual: { villa: 'ap-suite', from: '2026-10-21', to: '2026-10-21', type: 'rate', value: 4000, channels: ['airbnb', 'booking'] } });
  assert.equal(agent('agent.pull').jobs.length, 0, 'proposed jobs are not handed out');
  assert.equal(env.api({ action: 'f.cm.jobs.approve', token, all_within_band: true }).result.approved, 2);
  // switch dry-run off for these two channels
  ['airbnb', 'booking'].forEach(c => env.api({ action: 'f.cm.settings.set', token, settings: { channel: c, dry_run: false } }));
  const pull = agent('agent.pull'); assert.equal(pull.ok, true, pull.error); assert.equal(pull.jobs.length, 2);
  const a = pull.jobs.find(j => j.channel === 'airbnb'), b = pull.jobs.find(j => j.channel === 'booking');
  assert.equal(a.dry_run, false); assert.equal(a.listing.extranet_property_id, 'P1'); assert.ok(a.band.lo <= a.new_value && a.new_value <= a.band.hi);
  assert.equal(job(env, a.job_id).state, 'running'); assert.equal(agent('agent.pull').jobs.length, 0, 'leased jobs are not handed out twice');
  assert.equal(agent('agent.report', { job_id: a.job_id, result: 'done', read_back: String(a.new_value) }).job.state, 'done');
  assert.equal(env.tab('ChannelState').find(s => s.channel === 'airbnb' && s.date === '2026-10-21').rate, a.new_value);
  const m = agent('agent.report', { job_id: b.job_id, result: 'done', read_back: String(b.new_value + 100) });
  assert.equal(m.job.state, 'failed'); assert.equal(m.job.error_code, 'readback_mismatch');
  env.clock.advance(11 * 60000); assert.equal(agent('agent.pull').jobs.length, 1, 'one automatic retry after 10 minutes');
  agent('agent.report', { job_id: b.job_id, result: 'failed', error_code: 'timeout' });
  env.clock.advance(11 * 60000); assert.equal(agent('agent.pull').jobs.length, 0);
  assert.equal(job(env, b.job_id).state, 'needs_human'); assert.ok(env.mails.some(x => /needs human|AP Channel Manager/i.test(x.subject)));
  assert.equal(env.api({ action: 'f.cm.jobs.retry', token, job_id: b.job_id }).result.changed, 1);
  assert.equal(job(env, b.job_id).state, 'queued');
});

test('lease expiry: a job the agent never reports fails, then retries', async () => {
  const { env, token, agent } = await ready();
  env.api({ action: 'f.cm.jobs.propose', token, approve: true, manual: { villa: 'ap-suite', from: '2026-10-22', type: 'close', channels: ['airbnb'] } });
  const id = agent('agent.pull').jobs[0].job_id;
  env.clock.advance(11 * 60000); agent('agent.pull');
  assert.equal(job(env, id).error_code, 'lease_expired');
  env.clock.advance(11 * 60000); assert.equal(agent('agent.pull').jobs[0].job_id, id);
});

test('blocked (login / OTP / CAPTCHA / unknown screen): needs_human, channel paused, email; nothing more is handed out for it', async () => {
  const { env, token, agent } = await ready();
  env.api({ action: 'f.cm.jobs.propose', token, approve: true, manual: { villa: 'ap-suite', from: '2026-10-22', to: '2026-10-23', type: 'close', channels: ['mmt'] } });
  env.api({ action: 'f.cm.jobs.propose', token, approve: true, manual: { villa: 'ap-suite', from: '2026-10-25', type: 'close', channels: ['mmt'] } });
  const p = agent('agent.pull'); assert.equal(p.jobs.length, 2);
  const r = agent('agent.report', { job_id: p.jobs[0].job_id, result: 'blocked', error_code: 'captcha' });
  assert.equal(r.job.state, 'needs_human');
  const st = env.tab('ChannelSettings').find(s => s.channel === 'mmt'); assert.equal(st.paused, 'yes'); assert.match(st.pause_reason, /captcha/);
  assert.ok(env.mails.some(m => /action needed on MakeMyTrip/.test(m.subject)));
  env.clock.advance(30 * 60000); const again = agent('agent.pull');
  assert.equal(again.switches.channels.mmt.paused, true); assert.equal(again.jobs.filter(j => j.channel === 'mmt').length, 0);
  assert.equal(again.reads.filter(x => x.channel === 'mmt').length, 0);
  env.api({ action: 'f.cm.settings.set', token, settings: { channel: 'mmt', paused: false } });
  assert.ok(agent('agent.pull').jobs.length >= 1, 'resumed by the owner');
});

test('booking anywhere closes the other channels at once (no approval, handed out first); cancellation proposes re-opening', async () => {
  const { env, token, agent } = await ready();
  env.api({ action: 'f.cm.jobs.propose', token, approve: true, manual: { villa: 'ap-suite', from: '2026-11-20', type: 'rate', value: 4000, channels: ['booking'] } });
  const res = agent('agent.reservations', { channel: 'airbnb', rows: [{ reservation_id: 'HM123', villa: 'ap-suite', checkin: '2026-11-01', checkout: '2026-11-03', amount: 9000, currency: 'INR', status: 'confirmed',
    guest_name: 'Asha Rao', phone: '+91 98000 00000', email: 'asha@example.com' }] });
  assert.equal(res.ok, true, res.error); assert.equal(res.result.saved, 1); assert.equal(res.result.dropped_fields, 3);
  const cr = env.tab('ChannelReservations'); assert.equal(cr.length, 1); assert.ok(!JSON.stringify(cr).match(/Asha|98000|example\.com/), 'no guest data stored');
  const bk = env.tab('Bookings').find(b => b.external_id === 'HM123'); assert.ok(bk, 'ledger booking created'); assert.equal(bk.channel, 'Airbnb'); assert.equal(bk.guest_name, '');
  const closes = env.tab('ChannelJobs').filter(j => j.type === 'close');
  assert.deepEqual(closes.map(j => j.channel).sort(), ['booking', 'mmt']); assert.ok(closes.every(j => j.state === 'queued' && j.date_from === '2026-11-01' && j.date_to === '2026-11-02'));
  const p = agent('agent.pull'); assert.equal(p.jobs[0].reason, 'booking_elsewhere', 'closures go first');
  // idempotent: the hourly run and a repeat report add nothing
  env.fo.foCmSyncAvailability_('test'); agent('agent.reservations', { channel: 'airbnb', rows: [{ reservation_id: 'HM123', villa: 'ap-suite', checkin: '2026-11-01', checkout: '2026-11-03', amount: 9000, status: 'confirmed' }] });
  assert.equal(env.tab('ChannelJobs').filter(j => j.type === 'close').length, 2);
  // a direct booking / owner block closes all three channels via the hourly run
  assert.equal(env.api({ action: 'f.block.save', token, property_id: 'ap-suite', start: '2026-11-10', end: '2026-11-11', reason: 'family' }).ok, true);
  env.fo.foCmSyncAvailability_('test');
  assert.equal(env.tab('ChannelJobs').filter(j => j.type === 'close' && j.date_from === '2026-11-10').length, 3);
  // the block is removed → re-opening is proposed (owner approves), once
  const blk = env.tab('Blocks')[0]; assert.equal(env.api({ action: 'f.block.delete', token, block_id: blk.block_id }).ok, true);
  env.clock.advance(1000); env.fo.foCmSyncAvailability_('test'); env.fo.foCmSyncAvailability_('test');
  const opens = env.tab('ChannelJobs').filter(j => j.type === 'open' && j.date_from === '2026-11-10');
  assert.equal(opens.length, 3); assert.ok(opens.every(j => j.state === 'proposed'));
});

test('agent key: separate scope, cannot read the bundle or guests; portal token cannot call agent routes; wrong key refused', async () => {
  const { env, token, key, agent } = await ready();
  assert.match(env.api({ action: 'f.data', agent_key: key }).error, /Not allowed/);
  assert.match(env.api({ action: 'f.cm.jobs.approve', agent_key: key, all_within_band: true }).error, /Not allowed/);
  assert.match(env.api({ action: 'agent.pull', token }).error, /Unknown action/);
  assert.equal(env.api({ action: 'agent.pull', agent_key: 'apa_' + 'x'.repeat(60) }).auth, false);
  assert.ok(!JSON.stringify(env.props.get('FO_AGENT_KEY') || '').includes(key), 'only a digest is stored');
  env.api({ action: 'f.cm.agent.revoke', token }); assert.equal(agent('agent.pull').auth, false);
});

test('kill switch stops everything; mode 0 proposes nothing; mode 2 auto-approves only small in-band moves', async () => {
  const { env, token, agent } = await ready();
  env.api({ action: 'f.cm.jobs.propose', token, approve: true, manual: { villa: 'ap-suite', from: '2026-10-22', type: 'close', channels: ['airbnb'] } });
  env.api({ action: 'f.cm.killswitch', token, on: true });
  const p = agent('agent.pull'); assert.equal(p.switches.global, true); assert.equal(p.jobs.length, 0);
  env.api({ action: 'f.cm.killswitch', token, on: false });
  ['mmt', 'booking', 'airbnb'].forEach(c => env.api({ action: 'f.cm.settings.set', token, settings: { channel: c, mode: 0 } }));
  assert.equal(env.api({ action: 'f.cm.jobs.propose', token, villa: 'ap-suite', days: 10 }).result.proposed, 0);
  // mode 2: the channel shows a price within 10 % of the target on some nights, far away on others
  env.api({ action: 'f.cm.settings.set', token, settings: { channel: 'airbnb', mode: 2 } });
  const desk = env.api({ action: 'f.cm.ratedesk', token, villa: 'ap-suite', days: 10 }).desk;
  const rows = desk.map((n, i) => ({ date: n.date, rate: i < 5 ? Math.round(n.channels.airbnb.list * 1.05) : n.channels.airbnb.list * 2, available: true }));
  assert.equal(agent('agent.state', { channel: 'airbnb', villa: 'ap-suite', rows }).result.saved, 10);
  const out = env.api({ action: 'f.cm.jobs.propose', token, villa: 'ap-suite', days: 10 }).result;
  assert.ok(out.auto >= 1, JSON.stringify(out)); assert.ok(out.proposed >= 1, 'big moves still wait for the owner');
  assert.ok(env.tab('ChannelJobs').filter(j => j.approved_by === 'auto-band').every(j => j.date_from >= desk[0].date && j.date_to <= desk[4].date));
});

test('dry run: reported dry_run counts as done-without-write and never updates channel state; iCal feed shows busy nights only', async () => {
  const { env, token, agent } = await ready();
  env.api({ action: 'f.cm.jobs.propose', token, approve: true, manual: { villa: 'ap-suite', from: '2026-10-22', type: 'close', channels: ['airbnb'] } });
  const j = agent('agent.pull').jobs[0]; assert.equal(j.dry_run, true, 'first 3 days are dry-run');
  assert.equal(agent('agent.report', { job_id: j.job_id, result: 'dry_run' }).job.state, 'done');
  assert.equal(env.tab('ChannelState').length, 0);
  const ev = agent('agent.evidence', { job_id: j.job_id, kind: 'before', png_base64: Buffer.from('png').toString('base64') });
  assert.equal(ev.ok, true, ev.error); assert.ok(job(env, j.job_id).evidence_ref);
  env.api({ action: 'f.booking.save', token, booking: { property_id: 'ap-suite', guest_name: 'Private Name', checkin: '2026-12-01', checkout: '2026-12-03', status: 'confirmed', gross_amount: 9000 } });
  const urls = env.api({ action: 'f.cm.ical.token', token }).ical; const t = new URL(urls['ap-suite'].replace('…', 'x')).searchParams.get('t');
  const feed = env.fo.foCmIcal_({ parameter: { ical: 'ap-suite', t } }).getContent();
  assert.match(feed, /BEGIN:VCALENDAR/); assert.match(feed, /DTSTART;VALUE=DATE:20261201/); assert.match(feed, /DTEND;VALUE=DATE:20261203/);
  assert.ok(!/Private Name/.test(feed), 'no guest names in the feed');
  assert.equal(env.fo.foCmIcal_({ parameter: { ical: 'ap-suite', t: 'wrong' } }).getContent(), 'Not found');
  assert.equal(env.fo.foCmIcal_({ parameter: {} }), null);
});

test('observations from registered listings feed MarketRates (deduped per listing·night·day); bundle carries the channel manager without guests', async () => {
  const { env, token, add, agent } = await ready();
  add('https://www.airbnb.co.in/rooms/555666777', { comp_set: '2br', bedrooms: 2, sleeps: 6, name: 'Shiv Kripa Homestay' });
  const lst = env.tab('Listings').find(l => l.platform_listing_id === '555666777');
  const pull = agent('agent.pull'); assert.ok(pull.watch.some(w => w.listing_id === lst.listing_id));
  const rows = [{ listing_id: lst.listing_id, stay_date: '2026-10-24', price_per_night_inr: 3800, available: true }, { listing_id: lst.listing_id, stay_date: '2026-10-24', price_per_night_inr: 3800 }, { listing_id: lst.listing_id, stay_date: '2026-10-25', available: false }, { listing_id: 'LST-nope', stay_date: '2026-10-24', price_per_night_inr: 1 }];
  assert.equal(agent('agent.observations', { rows }).result.added, 2);
  const mr = env.tab('MarketRates'); assert.ok(mr.some(r => r.listing_id === lst.listing_id && r.competitor === 'Shiv Kripa Homestay' && Number(r.price_per_night) === 3800));
  assert.ok(mr.some(r => r.availability === 'sold out'));
  agent('agent.heartbeat', { version: '0.1.0', sessions: { mmt: 'ok', airbnb: 'login' } });
  const d = env.api({ action: 'f.data', token: await env.login() });
  assert.ok(d.channel_manager); assert.equal(d.channel_manager.listings.length, 4); assert.equal(d.channel_manager.heartbeat.sessions.airbnb, 'login'); assert.equal(d.channel_manager.agent_key, true);
});

test('phone assist (no agent machine): a booking saved in the portal closes the channels at once, emails the owner once, "Done" from the phone finishes it', async () => {
  const { env, token } = await ready();
  const bk = env.api({ action: 'f.booking.save', token, booking: { property_id: 'ap-suite', guest_name: 'Walk In', checkin: '2026-11-20', checkout: '2026-11-22', status: 'confirmed', gross_amount: 9000, channel: 'Direct' } });
  assert.equal(bk.ok, true, bk.error);
  const closes = env.tab('ChannelJobs').filter(j => j.type === 'close' && j.date_from === '2026-11-20');
  assert.equal(closes.length, 3, 'all three channels closed without waiting for the hourly run'); assert.ok(closes.every(j => j.date_to === '2026-11-21' && j.state === 'queued'));
  const mails = env.mails.filter(m => /close .* now/.test(m.subject || '')); assert.equal(mails.length, 1);
  assert.match(mails[0].body, /admin\.booking\.com\/hotel\/hoteladmin\/extranet_ng\/manage\/calendar\/index\.html\?hotel_id=B1/); assert.match(mails[0].body, /airbnb\.co\.in\/multicalendar\/P1/);
  assert.ok(!/Walk In/.test(mails[0].body), 'no guest name in the email');
  env.fo.foCmHourly_(); assert.equal(env.mails.filter(m => /close .* now/.test(m.subject || '')).length, 1, 'each closure is emailed once');
  const d = env.api({ action: 'f.data', token: await env.login() });
  assert.equal(d.channel_manager.agent_online, false); assert.match(d.channel_manager.links['ap-suite|booking'], /hotel_id=B1/);
  const r = env.api({ action: 'f.cm.jobs.done', token, job_ids: closes.map(j => j.job_id) });
  assert.equal(r.result.done, 3);
  const after = env.tab('ChannelJobs').filter(j => j.type === 'close' && j.date_from === '2026-11-20');
  assert.ok(after.every(j => j.state === 'done' && j.read_back === 'owner confirmed'));
  assert.equal(env.tab('ChannelState').filter(s => s.date === '2026-11-20' && s.available === 'no').length, 3);
  env.setUserRole('viewer'); assert.match(env.api({ action: 'f.cm.jobs.done', token, job_id: 'x' }).error, /role/);
});

test('bulk edit: preview counts without saving; apply saves nightly settings and merged channel jobs for every villa · channel', async () => {
  const { env, token } = await ready();
  const bulk = { villas: ['ap-suite'], from: '2026-11-02', to: '2026-11-08', weekdays: [5, 6], channels: ['airbnb', 'booking'], set: { min_stay: 2, cta: true, stop_sell: false } };
  const pv = env.api({ action: 'f.cm.bulk', token, bulk: Object.assign({ preview: true }, bulk) });
  assert.equal(pv.ok, true, pv.error); assert.equal(pv.result.preview, true); assert.equal(pv.result.jobs, 6, JSON.stringify(pv.result));
  assert.equal(env.tab('ChannelJobs').length, 0); assert.equal(env.tab('InventoryCalendar').length, 0, 'preview saves nothing');
  const r = env.api({ action: 'f.cm.bulk', token, bulk: Object.assign({ approve: true }, bulk) });
  assert.equal(r.result.jobs, 6); assert.equal(r.result.saved, 2);
  const jobs = env.tab('ChannelJobs'); assert.deepEqual([...new Set(jobs.map(j => j.type))].sort(), ['cta', 'min_stay', 'stop_sell']);
  assert.ok(jobs.every(j => j.state === 'queued' && j.date_from === '2026-11-06' && j.date_to === '2026-11-07'));
  assert.ok(jobs.filter(j => j.type === 'cta').every(j => j.new_value === 'on')); assert.ok(jobs.filter(j => j.type === 'stop_sell').every(j => j.new_value === 'off'));
  const ari = env.tab('InventoryCalendar'); assert.equal(ari.length, 2); assert.ok(ari.every(a => Number(a.min_stay) === 2 && a.cta === 'yes' && a.stop_sell === ''));
  assert.match(env.api({ action: 'f.cm.bulk', token, bulk: { villas: ['ap-suite'], from: '2026-11-02', set: {} } }).error, /at least one/);
  assert.match(env.api({ action: 'f.cm.bulk', token, bulk: { villas: [], from: '2026-11-02', set: { min_stay: 2 } } }).error, /villa/);
});

test('bulk price: net override is saved and drives the rate desk; % of recommended; back to recommended clears it; prices stay in the band', async () => {
  const { env, token } = await ready();
  const r = env.api({ action: 'f.cm.bulk', token, bulk: { villas: ['ap-suite'], from: '2026-11-10', to: '2026-11-11', channels: ['booking'], set: { price: { mode: 'net', value: 6000 } } } });
  assert.equal(r.ok, true, r.error); assert.equal(r.result.jobs, 1);
  const desk = env.api({ action: 'f.cm.ratedesk', token, villa: 'ap-suite', days: 30 }).desk, n = desk.find(x => x.date === '2026-11-10');
  assert.equal(n.override, true); assert.equal(n.net, 6000); assert.equal(n.channels.booking.list % 50, 0);
  const j = env.tab('ChannelJobs')[0]; assert.equal(Number(j.new_value), n.channels.booking.list); assert.ok(Number(j.new_value) <= Number(j.band_hi));
  const big = env.api({ action: 'f.cm.bulk', token, bulk: { villas: ['ap-suite'], from: '2026-11-12', channels: ['booking'], set: { price: { mode: 'net', value: 999999 } } } });
  assert.ok(big.result.warnings.some(w => /floor\/ceiling/.test(w)));
  const job = env.tab('ChannelJobs').find(x => x.date_from === '2026-11-12'); assert.equal(Number(job.new_value), Number(job.band_hi), 'clamped to the ceiling');
  env.api({ action: 'f.cm.bulk', token, bulk: { villas: ['ap-suite'], from: '2026-11-10', to: '2026-11-11', channels: ['booking'], set: { price: { mode: 'recommended' } } } });
  const desk2 = env.api({ action: 'f.cm.ratedesk', token, villa: 'ap-suite', days: 30 }).desk;
  assert.equal(desk2.find(x => x.date === '2026-11-10').override, false);
  const pct = env.api({ action: 'f.cm.bulk', token, bulk: { villas: ['ap-suite'], from: '2026-11-15', channels: ['booking'], set: { price: { mode: 'pct', value: 10 } } } });
  assert.equal(pct.ok, true); const a = env.tab('InventoryCalendar').find(x => x.date === '2026-11-15'); assert.ok(Number(a.price_net) > 0);
});

test('rate plans: derived prices follow every standard price change, stay in the band, and carry the plan id to the agent', async () => {
  const { env, token, agent } = await ready();
  const p = env.api({ action: 'f.cm.plan.save', token, plan: { name: 'Non-refundable', villa: 'all', channels: ['booking'], adjust_pct: -10, refund: 'non_refundable', ext_ids: { booking: 'RATE-NR-1' } } });
  assert.equal(p.ok, true, p.error);
  assert.match(env.api({ action: 'f.cm.plan.save', token, plan: { name: 'x', adjust_pct: 500 } }).error, /Adjustment/);
  env.api({ action: 'f.cm.bulk', token, bulk: { villas: ['ap-suite'], from: '2026-11-20', channels: ['booking'], approve: true, set: { price: { mode: 'net', value: 5000 } } } });
  const jobs = env.tab('ChannelJobs'); assert.equal(jobs.length, 2);
  const std = jobs.find(j => !j.rate_plan), nr = jobs.find(j => j.rate_plan === p.plan.plan_id);
  assert.equal(Number(nr.new_value), Math.max(Number(nr.band_lo), Math.round(Number(std.new_value) * 0.9 / 50) * 50));
  env.api({ action: 'f.cm.settings.set', token, settings: { channel: 'booking', dry_run: false } });
  const pulled = agent('agent.pull').jobs.find(j => j.rate_plan); assert.equal(pulled.rate_plan_ext, 'RATE-NR-1');
  agent('agent.report', { job_id: pulled.job_id, result: 'done', read_back: String(pulled.new_value) });
  assert.ok(!env.tab('ChannelState').some(s => Number(s.rate) === Number(pulled.new_value) && Number(pulled.new_value) !== Number(std.new_value)), 'plan prices do not overwrite the main live price');
});

test('inventory: units per villa; a 3-unit villa sends units left (not closures) as bookings come in; 0 units closes everything', async () => {
  const { env, token } = await ready();
  assert.equal(env.api({ action: 'f.cm.units', token, villa: 'ap-suite', units: 3 }).ok, true);
  assert.match(env.api({ action: 'f.cm.units', token, villa: 'ap-suite', units: 0 }).error, /1–50/);
  env.api({ action: 'f.booking.save', token, booking: { property_id: 'ap-suite', guest_name: 'A', checkin: '2026-11-25', checkout: '2026-11-26', status: 'confirmed', gross_amount: 4000, channel: 'Direct' } });
  const inv = env.tab('ChannelJobs').filter(j => j.type === 'inventory' && j.date_from <= '2026-11-25' && j.date_to >= '2026-11-25');
  assert.ok(inv.length >= 3, 'every channel told'); const latest = {}; inv.forEach(j => { latest[j.channel] = Number(j.new_value); });
  assert.deepEqual(Object.values(latest), [2, 2, 2]);
  assert.equal(env.tab('ChannelJobs').filter(j => j.type === 'close' && j.date_from === '2026-11-25').length, 0, 'no closure while units are left');
  env.api({ action: 'f.cm.bulk', token, bulk: { villas: ['ap-suite'], from: '2026-12-01', set: { units: 0 } } });
  assert.ok(env.tab('ChannelJobs').filter(j => j.type === 'inventory' && j.date_from === '2026-12-01' && Number(j.new_value) === 0).length >= 3);
  const d = env.api({ action: 'f.data', token: await env.login() });
  assert.ok(d.channel_manager.ari.some(a => a.date === '2026-12-01' && Number(a.units) === 0)); assert.ok(Array.isArray(d.channel_manager.rate_plans));
});

test('wrong machine keys never pause the founder\'s sign-in (own counter), and a flood is refused before any work', async () => {
  const { env } = await ready();
  for (let i = 0; i < 12; i++) assert.equal(env.api({ action: 'agent.pull', agent_key: 'apa_' + 'x'.repeat(60) }).auth, false);
  for (let i = 0; i < 12; i++) assert.equal(env.api({ action: 'f.m.ping', key: 'k'.repeat(60) }).auth, false);
  assert.ok(await env.login(), 'founder can still sign in');
  assert.ok(!env.mails.some(m => /sign-in paused/.test(m.subject || '')), 'no "sign-in paused" email');
  assert.ok(env.tab('Audit').filter(a => a.action === 'key_refused').length <= 40);
});
