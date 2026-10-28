/**
 * AP Villas Founder OS · AP Channel Manager (added to the e-check-in Apps Script project; routes in FoCore.gs).
 *
 * Founder OS is the brain; the agent (private repo ap-channel-agent, a real signed-in Chromium on an always-on machine) is the hands.
 * - Rates, open/close, minimum stay and stop-sell per villa · channel · night, as JOBS with a state machine:
 *   proposed → approved → queued → running → verifying → done | failed → (one automatic retry after 10 min) → needs_human
 *   needs_human → queued (Retry) | cancelled; rejected / cancelled are final. A job is done only when the agent read the value back.
 * - Pricing link: target net from the Live Pricing Desk (founder/desk.js), list price per channel = net ÷ (1 − commission), nearest ₹50,
 *   never outside the desk's floor/ceiling (checked here when proposing and approving, and again by the agent before it types).
 * - Modes per channel: 0 Observe (read only), 1 Propose (owner approves), 2 Auto-band (auto-approve small moves inside the band).
 * - A booking anywhere (any channel, direct, e-check-in, an owner block) closes that villa's nights on every other channel at once:
 *   those closures skip approval and are handed to the agent first. Per-villa iCal feeds are the official safety net.
 * - The agent has its own key (scope "agent", stored as a digest): it can pull jobs and report reads, never read guests or bookings.
 *   Reservations it reports are cut to an allowlist (no names, phones or emails) here as well as in the agent.
 * No passwords, sessions, selectors or extranet secrets live here. Evidence screenshots go to a private Drive folder (kept 30 days).
 */
const FO_CM = {
  CHANNELS: ['mmt', 'booking', 'airbnb'], PLATFORMS: ['mmt', 'goibibo', 'booking', 'airbnb'],
  NAMES: { mmt: 'MakeMyTrip / Goibibo', booking: 'Booking.com', airbnb: 'Airbnb' },
  LEDGER: { mmt: 'MakeMyTrip', booking: 'Booking.com', airbnb: 'Airbnb' },
  TYPES: ['rate', 'open', 'close', 'min_stay', 'stop_sell'], REASONS: ['pricing', 'booking_elsewhere', 'manual'],
  OPEN: ['proposed', 'approved', 'queued', 'running', 'verifying', 'failed', 'needs_human'], FINAL: ['done', 'rejected', 'cancelled'],
  LEASE_MIN: 10, RETRY_MIN: 10, HORIZON: 90, PULL_MAX: 12, BAND: 0.10, DRY_DAYS: 3, READ_EVERY_H: 3,
  RES_FIELDS: ['reservation_id', 'villa', 'checkin', 'checkout', 'amount', 'currency', 'channel', 'status'],
  STOPS: ['login', 'otp', 'captcha', 'unusual_activity', 'unknown_screen'],
};

// ---------------------------------------------------------------- settings ----------------
function foCmSettings_(readOnly) {
  let rows = foRows_('ChannelSettings');
  if (!rows.length) {   // first use: every channel switched on in Propose mode, dry-run for the first 3 days (the bundle only shows these defaults)
    const deskCom = (() => { try { return FoDesk.DEFAULTS.commission; } catch (e) { return {}; } })(), today = foToday_();
    rows = FO_CM.CHANNELS.map(ch => ({ channel: ch, enabled: 'yes', mode: 1, dry_run: 'yes', dry_until: FoMetrics.addDays(today, FO_CM.DRY_DAYS), paused: '', pause_reason: '',
      commission_pct: Math.round(((ch === 'mmt' ? deskCom.makemytrip : deskCom[ch]) || 0.15) * 100), markup_pct: 0, permission_note: 'Owner approval 28 Oct 2026: bots may write rates and availability (owner accepts OTA terms risk).', enabled_by: 'system', enabled_at: foNow_() }));
    if (!readOnly) { rows.forEach(r => foAppend_('ChannelSettings', r)); rows = foRows_('ChannelSettings'); }
  }
  const out = {}, today = foToday_();
  rows.forEach(r => { out[r.channel] = { channel: r.channel, enabled: r.enabled === 'yes', mode: Math.max(0, Math.min(2, Number(r.mode) || 0)), dryRun: r.dry_run === 'yes' && (!r.dry_until || today < String(r.dry_until)),
    dry_until: r.dry_until, paused: r.paused === 'yes', pause_reason: r.pause_reason, commission: Math.max(0, Math.min(50, foNum_(r.commission_pct))) / 100, markup: Math.max(-30, Math.min(30, foNum_(r.markup_pct))) / 100, _row: r._row }; });
  return out;
}
function foCmGlobalPaused_() { return PropertiesService.getScriptProperties().getProperty('FO_CM_KILL') === 'yes'; }
function foCmSettingsSet_(b, user) {
  const s = foCmSettings_(), x = b.settings || {}, ch = String(x.channel || ''); if (!s[ch]) return { ok: false, error: 'Unknown channel.' };
  const row = foRows_('ChannelSettings').find(r => r.channel === ch), rec = Object.assign({}, row);
  if (x.enabled !== undefined) rec.enabled = x.enabled ? 'yes' : '';
  if (x.mode !== undefined) rec.mode = Math.max(0, Math.min(2, Math.round(foNum_(x.mode))));
  if (x.dry_run !== undefined) { rec.dry_run = x.dry_run ? 'yes' : ''; if (x.dry_run) rec.dry_until = FoMetrics.addDays(foToday_(), FO_CM.DRY_DAYS); }
  if (x.commission_pct !== undefined) { const c = foNum_(x.commission_pct); if (!(c >= 0 && c <= 50)) return { ok: false, error: 'Commission must be 0–50 %.' }; rec.commission_pct = c; }
  if (x.markup_pct !== undefined) { const m = foNum_(x.markup_pct); if (!(m >= -30 && m <= 30)) return { ok: false, error: 'Channel markup must be between −30 % and +30 %.' }; rec.markup_pct = m; }
  if (x.permission_note !== undefined) rec.permission_note = foClean_(x.permission_note, 300);
  if (x.paused !== undefined) { rec.paused = x.paused ? 'yes' : ''; rec.pause_reason = x.paused ? (foClean_(x.pause_reason, 120) || 'paused by owner') : ''; }
  rec.enabled_by = user.email; rec.enabled_at = foNow_(); delete rec._row;
  foUpdate_('ChannelSettings', row._row, rec); foAudit_(user.email, 'cm_settings', ch + ' ' + JSON.stringify(x).slice(0, 200), 'ok'); foTouch_();
  return { settings: foCmSettings_()[ch] };
}
function foCmKillswitch_(b, user) {
  const on = !!b.on, scope = String(b.scope || 'global');
  if (scope === 'global') { PropertiesService.getScriptProperties().setProperty('FO_CM_KILL', on ? 'yes' : ''); foAudit_(user.email, 'cm_killswitch', 'global ' + (on ? 'ON' : 'off'), 'ok'); foTouch_(); return { global: on }; }
  return foCmSettingsSet_({ settings: { channel: scope, paused: on, pause_reason: on ? 'kill switch' : '' } }, user);
}

// ---------------------------------------------------------------- listings registry ----------------
/** Paste any OTA links (one or many): platform and listing id are read from the URL; the same listing is never added twice. */
function foCmParseUrl_(u) {
  u = String(u || '').trim(); if (!/^https?:\/\//i.test(u)) return null;
  let m;
  if ((m = u.match(/airbnb\.[a-z.]+\/rooms\/(?:plus\/)?(\d+)/i))) return { platform: 'airbnb', id: m[1], url: 'https://www.airbnb.co.in/rooms/' + m[1] };
  if ((m = u.match(/booking\.com\/hotel\/([a-z]{2})\/([a-z0-9-]+)/i))) return { platform: 'booking', id: m[2].toLowerCase(), url: 'https://www.booking.com/hotel/' + m[1].toLowerCase() + '/' + m[2].toLowerCase() + '.html' };
  if ((m = u.match(/makemytrip\.com\/.*?[?&]hotelId=(\d+)/i)) || (m = u.match(/makemytrip\.com\/hotels\/[^?#]*?-(\d{6,})/i))) return { platform: 'mmt', id: m[1], url: 'https://www.makemytrip.com/hotels/hotel-details/?hotelId=' + m[1] };
  if ((m = u.match(/goibibo\.com\/hotels\/([a-z0-9-]+?)-(\d{6,})\/?/i))) return { platform: 'goibibo', id: m[2], url: 'https://www.goibibo.com/hotels/' + m[1].toLowerCase() + '-' + m[2] + '/' };
  return null;
}
function foCmListingsAdd_(b, user) {
  const urls = (Array.isArray(b.urls) ? b.urls : String(b.urls || '').split(/[\s,]+/)).map(x => String(x).trim()).filter(Boolean).slice(0, 60);
  const role = b.role === 'own' ? 'own' : 'competitor', villa = role === 'own' ? String(b.villa || '') : '';
  if (role === 'own' && !foRows_('Properties').some(p => p.property_id === villa)) return { ok: false, error: 'Choose which of your villas these links are.' };
  const have = foRows_('Listings'), out = { added: 0, skipped: 0, rejected: [] };
  urls.forEach(u => {
    const p = foCmParseUrl_(u); if (!p) { out.rejected.push(u.slice(0, 120)); return; }
    if (have.some(x => x.platform === p.platform && String(x.platform_listing_id) === p.id)) { out.skipped++; return; }
    const rec = { listing_id: foId_('LST'), platform: p.platform, platform_listing_id: p.id, url_clean: p.url, role, villa, extranet_property_id: foClean_(b.extranet_property_id, 40), extranet_room_id: foClean_(b.extranet_room_id, 40),
      bedrooms: foHasNum_(b.bedrooms) ? foNum_(b.bedrooms) : '', sleeps: foHasNum_(b.sleeps) ? foNum_(b.sleeps) : '', distance_band: foClean_(b.distance_band, 20), comp_set: ['2br', '3br', 'hotel_2rooms'].indexOf(b.comp_set) >= 0 ? b.comp_set : '',
      schedule: b.schedule === 'weekly' ? 'weekly' : 'daily', status: 'active', name: foClean_(b.name, 120), rating: '', reviews: '', added_at: foNow_() };
    foAppend_('Listings', rec); have.push(rec); out.added++;
  });
  foAudit_(user.email, 'cm_listings_add', out.added + ' added, ' + out.skipped + ' known, ' + out.rejected.length + ' not recognised', 'ok'); foTouch_();
  return { result: out };
}
function foCmListingsUpdate_(b, user) {
  const x = b.listing || {}, row = foRows_('Listings').find(r => r.listing_id === x.listing_id); if (!row) return { ok: false, error: 'Not found.' };
  const rec = Object.assign({}, row);
  ['extranet_property_id', 'extranet_room_id', 'distance_band', 'name'].forEach(k => { if (x[k] !== undefined) rec[k] = foClean_(x[k], 120); });
  ['bedrooms', 'sleeps'].forEach(k => { if (x[k] !== undefined) rec[k] = foHasNum_(x[k]) ? foNum_(x[k]) : ''; });
  if (x.role !== undefined) rec.role = x.role === 'own' ? 'own' : 'competitor';
  if (x.villa !== undefined) rec.villa = rec.role === 'own' ? String(x.villa) : '';
  if (x.comp_set !== undefined) rec.comp_set = ['2br', '3br', 'hotel_2rooms'].indexOf(x.comp_set) >= 0 ? x.comp_set : '';
  if (x.schedule !== undefined) rec.schedule = x.schedule === 'weekly' ? 'weekly' : 'daily';
  if (x.status !== undefined) rec.status = ['active', 'paused', 'broken'].indexOf(x.status) >= 0 ? x.status : rec.status;
  if (rec.role === 'own' && !foRows_('Properties').some(p => p.property_id === rec.villa)) return { ok: false, error: 'Choose the villa for your own listing.' };
  delete rec._row; foUpdate_('Listings', row._row, rec); foAudit_(user.email, 'cm_listings_update', rec.listing_id, 'ok'); foTouch_();
  return { listing: rec };
}
/** Own listing (villa on a channel) for the agent: extranet ids come only from here. */
function foCmOwn_(villa, ch) { return foRows_('Listings').find(r => r.role === 'own' && r.villa === villa && r.status !== 'paused' && (r.platform === ch || (ch === 'mmt' && r.platform === 'goibibo'))); }

// ---------------------------------------------------------------- pricing link ----------------
const foCm50_ = v => Math.round(v / 50) * 50;
/** Channel list price for a net target, and the band (floor/ceiling converted the same way). */
function foCmList_(net, floor, ceiling, st) {
  const k = 1 / (1 - st.commission) * (1 + st.markup), lo = Math.ceil(floor * k / 50) * 50, hi = Math.floor(ceiling * k / 50) * 50;
  return { price: Math.max(lo, Math.min(hi, foCm50_(net * k))), lo, hi };
}
/** Last value written (done) or approved for one villa·channel·night and type. */
function foCmLastValue_(jobs, villa, ch, d, type) {
  const hit = jobs.filter(j => j.villa === villa && j.channel === ch && j.type === type && ['done', 'approved', 'queued', 'running', 'verifying'].indexOf(j.state) >= 0 && j.date_from <= d && j.date_to >= d && j.read_back !== 'dry_run')
    .sort((a, b) => String(b.approved_at || b.created_at) < String(a.approved_at || a.created_at) ? -1 : 1);
  return hit.length ? foNum_(hit[0].new_value) : null;
}
/** 90-night desk for one villa: target net, band, and per channel the list price, live OTA rate and status. */
function foCmDesk_(D, villa, days) {
  const s = foCmSettings_(), cal = FoDesk.calendar(D, villa, days || FO_CM.HORIZON); if (!cal) return null;
  const state = {}; foRows_('ChannelState').forEach(r => { if (r.villa === villa) state[r.channel + '|' + String(r.date).slice(0, 10)] = r; });
  const jobs = foRows_('ChannelJobs');
  return cal.rows.map(q => {
    const ch = {};
    FO_CM.CHANNELS.forEach(c => {
      const st = s[c]; if (!st) return;
      const L = foCmList_(q.price, q.floor, q.ceiling, st), live = state[c + '|' + q.date], last = foCmLastValue_(jobs, villa, c, q.date, 'rate');
      ch[c] = { list: L.price, lo: L.lo, hi: L.hi, live: live && live.rate !== '' ? foNum_(live.rate) : null, available: live ? live.available : '', read_at: live ? live.read_at : '', last };
    });
    return { date: q.date, net: q.price, floor: q.floor, ceiling: q.ceiling, booked: q.booked, blocked: q.blocked, chance: q.fill ? q.fill.chance : null, confidence: q.confidence, channels: ch };
  });
}

// ---------------------------------------------------------------- jobs ----------------
function foCmIdem_(j) { return [j.villa, j.channel, j.date_from, j.date_to, j.type, String(j.new_value)].join('|'); }
/**
 * Create one job unless the same change is already in flight. state: proposed | approved | queued (closures skip approval).
 * Returns the job or null (duplicate, out of band, unknown villa/channel).
 */
function foCmCreate_(j, user, jobs) {
  if (FO_CM.CHANNELS.indexOf(j.channel) < 0 || FO_CM.TYPES.indexOf(j.type) < 0) return { error: 'unknown channel or type' };
  if (!foDate_(j.date_from) || !foDate_(j.date_to) || j.date_to < j.date_from) return { error: 'bad dates' };
  const idem = foCmIdem_(j);
  if (jobs.some(x => x.idem_key === idem && FO_CM.OPEN.indexOf(x.state) >= 0)) return { duplicate: true };
  if (j.type === 'rate' && (j.lo != null && (foNum_(j.new_value) < j.lo || foNum_(j.new_value) > j.hi))) return { error: 'outside the floor/ceiling band ₹' + j.lo + '–₹' + j.hi };
  if (j.type === 'min_stay' && !(foNum_(j.new_value) >= 1 && foNum_(j.new_value) <= 30)) return { error: 'minimum stay must be 1–30 nights' };
  const now = foNow_(), rec = { job_id: foId_('CMJ'), idem_key: idem, type: j.type, villa: j.villa, channel: j.channel, date_from: j.date_from, date_to: j.date_to,
    old_value: j.old_value == null ? '' : j.old_value, new_value: j.new_value, band_lo: j.lo == null ? '' : j.lo, band_hi: j.hi == null ? '' : j.hi, reason: FO_CM.REASONS.indexOf(j.reason) >= 0 ? j.reason : 'manual', mode: j.mode == null ? '' : j.mode,
    state: j.state, attempts: 0, claimed_by: '', lease_until: '', failed_at: '', read_back: '', evidence_ref: '', error_code: '', message: '',
    created_by: user, created_at: now, approved_by: j.state === 'proposed' ? '' : (j.approved_by || user), approved_at: j.state === 'proposed' ? '' : now, done_at: '' };
  foAppend_('ChannelJobs', rec); jobs.push(rec);
  return { job: rec };
}
/** Merge consecutive nights with the same value into one job range. */
function foCmRanges_(nights) {
  const out = []; nights.sort((a, b) => a.date < b.date ? -1 : 1).forEach(n => {
    const last = out[out.length - 1];
    if (last && last.value === n.value && FoMetrics.addDays(last.to, 1) === n.date && last.lo === n.lo && last.hi === n.hi) { last.to = n.date; last.old = last.old === n.old ? last.old : null; }
    else out.push({ from: n.date, to: n.date, value: n.value, old: n.old, lo: n.lo, hi: n.hi });
  });
  return out;
}
/**
 * From the pricing desk: for every enabled channel and the next `days` nights, propose the list price wherever it differs from what the
 * channel shows (or last approved). Mode 0 proposes nothing; mode 2 auto-approves moves that pass every band rule.
 */
function foCmProposeFromDesk_(user, opts) {
  opts = opts || {};
  const D = foDataLoad_(), s = foCmSettings_(), cfg = FoDesk.settings(D), villas = opts.villa ? [opts.villa] : cfg.properties.filter(v => FO_CM.CHANNELS.some(c => foCmOwn_(v, c)) || opts.allVillas);
  const jobs = foRows_('ChannelJobs'), out = { proposed: 0, auto: 0, duplicates: 0, skipped: 0 }, today = foToday_();
  const autoToday = {}; jobs.filter(j => j.approved_by === 'auto-band' && String(j.approved_at).slice(0, 10) === today).forEach(j => { for (let d = j.date_from; d <= j.date_to; d = FoMetrics.addDays(d, 1)) autoToday[j.villa + '|' + j.channel + '|' + d] = 1; });
  const recentBooking = {}; (D.bookings || []).filter(x => x.status !== 'cancelled' && x.status !== 'void' && Date.now() - Date.parse(x.created_at || x.synced_at || 0) < 864e5).forEach(x => { for (let d = x.checkin; d < x.checkout; d = FoMetrics.addDays(d, 1)) recentBooking[x.property_id + '|' + d] = 1; });
  villas.forEach(villa => {
    const desk = foCmDesk_(D, villa, opts.days || 30); if (!desk) return;
    FO_CM.CHANNELS.forEach(ch => {
      const st = s[ch]; if (!st || !st.enabled || st.mode === 0) return;
      const nights = desk.filter(n => !n.booked && !n.blocked && n.channels[ch]).map(n => { const c = n.channels[ch], ref = c.live != null ? c.live : c.last; return ref === c.list ? null : { date: n.date, value: c.list, old: ref, lo: c.lo, hi: c.hi }; }).filter(Boolean);
      foCmRanges_(nights).forEach(r => {
        let auto = st.mode === 2 && r.old != null && Math.abs(r.value - r.old) / r.old <= FO_CM.BAND;
        for (let d = r.from; auto && d <= r.to; d = FoMetrics.addDays(d, 1)) if (autoToday[villa + '|' + ch + '|' + d] || recentBooking[villa + '|' + d]) auto = false;
        const res = foCmCreate_({ type: 'rate', villa, channel: ch, date_from: r.from, date_to: r.to, old_value: r.old, new_value: r.value, lo: r.lo, hi: r.hi, reason: 'pricing', mode: st.mode,
          state: auto ? 'queued' : 'proposed', approved_by: auto ? 'auto-band' : '' }, user, jobs);
        if (res.duplicate) out.duplicates++; else if (res.error) out.skipped++; else if (auto) { out.auto++; for (let d = r.from; d <= r.to; d = FoMetrics.addDays(d, 1)) autoToday[villa + '|' + ch + '|' + d] = 1; } else out.proposed++;
      });
    });
  });
  foTouch_(); return out;
}
/** Portal: propose from the desk, or a manual change ("₹4,500 on all channels for these nights"). */
function foCmJobsPropose_(b, user) {
  if (!b.manual) return { result: foCmProposeFromDesk_(user.email, { villa: b.villa || '', days: Math.min(FO_CM.HORIZON, foNum_(b.days) || 30) }) };
  const m = b.manual, picked = Array.isArray(m.dates) ? m.dates.map(foDate_).filter(Boolean).sort().slice(0, FO_CM.HORIZON) : null;   // tapped nights (any order, gaps allowed)
  if (picked && picked.length) { m.from = picked[0]; m.to = picked[picked.length - 1]; }
  const from = foDate_(m.from), to = foDate_(m.to || m.from), type = String(m.type || 'rate'), chans = (Array.isArray(m.channels) && m.channels.length ? m.channels : FO_CM.CHANNELS).filter(c => FO_CM.CHANNELS.indexOf(c) >= 0);
  if (!foRows_('Properties').some(p => p.property_id === m.villa)) return { ok: false, error: 'Choose a villa.' };
  if (!from || !to || to < from) return { ok: false, error: 'Choose the nights.' };
  const days = []; for (let d = from; d <= to; d = FoMetrics.addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if ((!picked || picked.indexOf(d) >= 0) && (!Array.isArray(m.weekdays) || !m.weekdays.length || m.weekdays.indexOf(wd) >= 0)) days.push(d); }
  if (!days.length) return { ok: false, error: 'No nights match those weekdays.' };
  const D = foDataLoad_(), s = foCmSettings_(), jobs = foRows_('ChannelJobs'), out = { created: [], errors: [] };
  const desk = type === 'rate' ? foCmDesk_(D, m.villa, Math.max(1, Math.round((Date.parse(to) - Date.parse(foToday_())) / 864e5) + 1)) : null;
  chans.forEach(ch => {
    const st = s[ch]; if (!st) return;
    const nights = days.map(d => {
      if (type !== 'rate') return { date: d, value: type === 'min_stay' ? Math.round(foNum_(m.value)) : type, old: null, lo: null, hi: null };
      const n = desk && desk.find(x => x.date === d), c = n && n.channels[ch];
      // the owner types the NET price (what AP Villas keeps) or a channel price; both are bounded by the desk band
      const value = m.basis === 'channel' ? foCm50_(foNum_(m.value)) : c ? foCmList_(foNum_(m.value), n.floor, n.ceiling, st).price : foCm50_(foNum_(m.value) / (1 - st.commission));
      return { date: d, value, old: c ? (c.live != null ? c.live : c.last) : null, lo: c ? c.lo : null, hi: c ? c.hi : null };
    });
    foCmRanges_(nights).forEach(r => {
      const res = foCmCreate_({ type, villa: m.villa, channel: ch, date_from: r.from, date_to: r.to, old_value: r.old, new_value: r.value, lo: r.lo, hi: r.hi, reason: 'manual', mode: st.mode, state: b.approve ? 'queued' : 'proposed', approved_by: b.approve ? user.email : '' }, user.email, jobs);
      if (res.job) out.created.push(res.job.job_id); else out.errors.push(FO_CM.NAMES[ch] + ' ' + r.from + (r.to !== r.from ? '→' + r.to : '') + ': ' + (res.duplicate ? 'already queued' : res.error));
    });
  });
  foAudit_(user.email, 'cm_jobs_manual', m.villa + ' ' + type + ' ' + from + '→' + to + ' ' + out.created.length + ' jobs', 'ok'); foTouch_();
  return { result: out };
}
/** Approve one or many proposed jobs, or "all within band" (every proposed rate inside its floor/ceiling). */
function foCmJobsApprove_(b, user) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const rows = foRows_('ChannelJobs').filter(j => j.state === 'proposed'), ids = Array.isArray(b.job_ids) ? b.job_ids : (b.job_id ? [b.job_id] : []);
    const pick = b.all_within_band ? rows.filter(j => j.type !== 'rate' || (j.band_lo === '' || (foNum_(j.new_value) >= foNum_(j.band_lo) && foNum_(j.new_value) <= foNum_(j.band_hi)))) : rows.filter(j => ids.indexOf(j.job_id) >= 0);
    let n = 0; const now = foNow_();
    pick.forEach(j => {
      if (j.type === 'rate' && j.band_lo !== '' && (foNum_(j.new_value) < foNum_(j.band_lo) || foNum_(j.new_value) > foNum_(j.band_hi))) return;   // never outside the band, even if asked
      j.state = 'queued'; j.approved_by = user.email; j.approved_at = now; const r = j._row; delete j._row; foUpdate_('ChannelJobs', r, j); n++;
    });
    foAudit_(user.email, 'cm_jobs_approve', n + ' jobs', 'ok'); foTouch_();
    return { result: { approved: n } };
  } finally { lock.releaseLock(); }
}
function foCmJobsSet_(b, user, allowed, next) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ids = Array.isArray(b.job_ids) ? b.job_ids : [b.job_id], rows = foRows_('ChannelJobs').filter(j => ids.indexOf(j.job_id) >= 0); let n = 0;
    rows.forEach(j => { if (allowed.indexOf(j.state) < 0) return; j.state = next; if (next === 'queued') { j.attempts = 0; j.error_code = ''; j.message = ''; j.claimed_by = ''; j.lease_until = ''; } const r = j._row; delete j._row; foUpdate_('ChannelJobs', r, j); n++; });
    foAudit_(user.email, 'cm_jobs_' + next, n + ' jobs', 'ok'); foTouch_();
    return { result: { changed: n } };
  } finally { lock.releaseLock(); }
}
const foCmJobsCancel_ = (b, u) => foCmJobsSet_(b, u, ['proposed', 'approved', 'queued', 'failed', 'needs_human'], b.reject ? 'rejected' : 'cancelled');
const foCmJobsRetry_ = (b, u) => foCmJobsSet_(b, u, ['failed', 'needs_human'], 'queued');

// ---------------------------------------------------------------- phone assist (backup while no agent machine is online) ----------------
/** The agent is online when its last heartbeat is under 15 minutes old. */
function foCmAgentOnline_() { const hb = foCmHeartbeatGet_(); return !!(hb && Date.now() - Date.parse(hb.at) < 15 * 60000); }
/**
 * The owner made the change by hand in the extranet (phone assist): the job is done on the owner's word (read_back "owner confirmed").
 * Jobs an online agent is running right now are left alone.
 */
function foCmJobsManualDone_(b, user) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ids = Array.isArray(b.job_ids) ? b.job_ids : [b.job_id], now = foNow_(); let n = 0;
    foRows_('ChannelJobs').filter(j => ids.indexOf(j.job_id) >= 0).forEach(j => {
      const leased = (j.state === 'running' || j.state === 'verifying') && j.lease_until && Date.parse(j.lease_until) > Date.now();
      if (leased || ['proposed', 'approved', 'queued', 'failed', 'needs_human', 'running', 'verifying'].indexOf(j.state) < 0) return;
      j.state = 'done'; j.read_back = 'owner confirmed'; j.claimed_by = 'owner'; j.lease_until = ''; j.error_code = ''; j.done_at = now; if (!j.approved_at) { j.approved_by = user.email; j.approved_at = now; }
      j.message = ('Set by hand in the extranet by ' + user.email + (b.note ? ': ' + foClean_(b.note, 120) : '')).slice(0, 300);
      const r = j._row; delete j._row; foUpdate_('ChannelJobs', r, j); foCmStateFromJob_(j); n++;
    });
    foAudit_(user.email, 'cm_jobs_manual_done', n + ' jobs', 'ok'); foTouch_();
    return { result: { done: n } };
  } finally { lock.releaseLock(); }
}
/** Phone deep link to the right extranet page for a villa on a channel (Airbnb opens its app on a phone). */
function foCmExtranetLink_(villa, ch) {
  const l = foCmOwn_(villa, ch); if (!l) return '';
  if (ch === 'airbnb') return 'https://www.airbnb.co.in/multicalendar/' + (l.extranet_property_id || l.platform_listing_id);
  if (ch === 'booking') return l.extranet_property_id ? 'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/calendar/index.html?hotel_id=' + encodeURIComponent(l.extranet_property_id) : 'https://admin.booking.com/';
  return 'https://in.goibibo.com/extranet/';
}
/**
 * While no agent is online: email the owner every NEW booking-driven closure at once (double-booking risk), and once a day a list of the
 * other changes waiting. Each job is emailed once.
 */
function foCmAssistAlert_() {
  if (foCmAgentOnline_()) return 'agent online';
  const p = PropertiesService.getScriptProperties(), sent = JSON.parse(p.getProperty('FO_CM_ASSIST_SENT') || '[]'), props = {}; foRows_('Properties').forEach(x => { props[x.property_id] = x.name; });
  const waiting = foRows_('ChannelJobs').filter(j => ['approved', 'queued', 'failed', 'needs_human'].indexOf(j.state) >= 0);
  const urgent = waiting.filter(j => j.reason === 'booking_elsewhere' && sent.indexOf(j.job_id) < 0);
  const today = foToday_(), daily = p.getProperty('FO_CM_ASSIST_DAY') !== today && Number(Utilities.formatDate(new Date(), FO.TZ, 'H')) >= 8 && waiting.length;
  if (!urgent.length && !daily) return 'nothing new';
  const line = j => '• ' + (props[j.villa] || j.villa) + ' on ' + FO_CM.NAMES[j.channel] + ': ' + (j.type === 'rate' ? 'set ₹' + foNum_(j.new_value).toLocaleString('en-IN') : j.type === 'min_stay' ? 'minimum stay ' + j.new_value + ' nights' : j.type.replace('_', '-').toUpperCase()) +
    ' for ' + j.date_from + (j.date_to !== j.date_from ? ' → ' + j.date_to : '') + '\n  ' + foCmExtranetLink_(j.villa, j.channel);
  const body = (urgent.length ? 'A booking came in. Close these nights now to avoid a double booking:\n\n' + urgent.map(line).join('\n') + '\n\n' : '') +
    (daily ? 'Changes waiting for you (no channel agent is running yet, so these are done by hand):\n\n' + waiting.filter(j => urgent.indexOf(j) < 0).slice(0, 40).map(line).join('\n') + '\n\n' : '') +
    'After changing it in the extranet, tap "Done" in Channel Manager → Today: https://www.apvillasandresorts.in/founder/#/channels';
  try { MailApp.sendEmail({ to: foDeskRecipient_(), subject: urgent.length ? 'AP Channel Manager · close ' + urgent.length + ' night range' + (urgent.length > 1 ? 's' : '') + ' now (booking elsewhere)' : 'AP Channel Manager · ' + waiting.length + ' changes to make today', body }); } catch (e) { return 'mail failed'; }
  p.setProperty('FO_CM_ASSIST_SENT', JSON.stringify(sent.concat(urgent.map(j => j.job_id)).slice(-400)));
  if (daily) p.setProperty('FO_CM_ASSIST_DAY', today);
  return urgent.length + ' urgent, daily ' + (daily ? 'sent' : 'no');
}

// ---------------------------------------------------------------- availability sync (bookings anywhere → close everywhere) ----------------
/**
 * Every confirmed/tentative booking or owner block in the ledger closes those nights on the villa's other channels, at once,
 * without approval (reason booking_elsewhere). A cancellation proposes re-opening (owner approves). Idempotent: run hourly and on every
 * reservation report.
 */
function foCmSyncAvailability_(actor) {
  const D = foDataLoad_(), jobs = foRows_('ChannelJobs'), today = foToday_(), end = FoMetrics.addDays(today, FO_CM.HORIZON), out = { closed: 0, reopen: 0 };
  const taken = {};   // villa|night → source channel ('' for direct/blocks)
  (D.bookings || []).forEach(b => { if (['confirmed', 'tentative'].indexOf(b.status) < 0 || !b.property_id) return; for (let d = b.checkin; d < b.checkout; d = FoMetrics.addDays(d, 1)) if (d >= today && d < end) taken[b.property_id + '|' + d] = FoCmChannelOf_(b.channel); });
  (D.blocks || []).forEach(b => { for (let d = b.start; d < b.end; d = FoMetrics.addDays(d, 1)) if (d >= today && d < end) taken[b.property_id + '|' + d] = ''; });
  const closedBy = {}; jobs.filter(j => j.type === 'close' && j.state !== 'rejected' && j.state !== 'cancelled').forEach(j => { for (let d = j.date_from; d <= j.date_to; d = FoMetrics.addDays(d, 1)) closedBy[j.villa + '|' + j.channel + '|' + d] = j; });
  const opened = {}; jobs.filter(j => j.type === 'open' && j.state !== 'rejected' && j.state !== 'cancelled').forEach(j => { for (let d = j.date_from; d <= j.date_to; d = FoMetrics.addDays(d, 1)) opened[j.villa + '|' + j.channel + '|' + d] = j.created_at; });
  const villas = (D.properties || []).map(p => p.property_id);
  villas.forEach(villa => FO_CM.CHANNELS.forEach(ch => {
    if (!foCmOwn_(villa, ch)) return;
    const need = [], reopen = [];
    for (let d = today; d < end; d = FoMetrics.addDays(d, 1)) {
      const k = villa + '|' + d, ck = villa + '|' + ch + '|' + d, src = taken[k];
      if (src !== undefined && src !== ch && !closedBy[ck]) need.push({ date: d, value: 'close', old: null, lo: null, hi: null });
      // a closure we made earlier whose booking is gone (cancelled/void) → propose re-opening, unless already re-opened after it
      if (src === undefined && closedBy[ck] && closedBy[ck].reason === 'booking_elsewhere' && !(opened[ck] && opened[ck] > closedBy[ck].created_at)) reopen.push({ date: d, value: 'open', old: null, lo: null, hi: null });
    }
    foCmRanges_(need).forEach(r => { const res = foCmCreate_({ type: 'close', villa, channel: ch, date_from: r.from, date_to: r.to, new_value: 'close', reason: 'booking_elsewhere', state: 'queued', approved_by: 'availability-sync' }, actor, jobs); if (res.job) out.closed++; });
    foCmRanges_(reopen).forEach(r => { const res = foCmCreate_({ type: 'open', villa, channel: ch, date_from: r.from, date_to: r.to, new_value: 'open', reason: 'manual', state: 'proposed' }, actor, jobs); if (res.job) out.reopen++; });
  }));
  if (out.closed || out.reopen) { foTouch_(); if (out.closed) out.assist = foCmAssistAlert_(); }
  return out;
}
function FoCmChannelOf_(ledgerChannel) { const c = String(ledgerChannel || '').toLowerCase(); return /airbnb/.test(c) ? 'airbnb' : /booking\.com/.test(c) ? 'booking' : /makemytrip|goibibo|mmt/.test(c) ? 'mmt' : ''; }

// ---------------------------------------------------------------- agent key & API ----------------
function foCmAgentKeyCreate_(b, user) {
  const key = 'apa_' + foRandom_() + foRandom_(), p = PropertiesService.getScriptProperties();
  p.setProperty('FO_AGENT_KEY', foHmac_('agent:' + key)); p.setProperty('FO_AGENT_META', JSON.stringify({ created_at: foNow_(), created_by: user.email }));
  foAudit_(user.email, 'agent_key_created', 'previous agent key (if any) revoked', 'ok');
  return { key, note: 'Shown once. Put it in the agent machine\'s .env (FOUNDER_OS_AGENT_KEY); never in a repo or a GitHub secret.' };
}
function foCmAgentKeyRevoke_(b, user) { const p = PropertiesService.getScriptProperties(); p.deleteProperty('FO_AGENT_KEY'); p.deleteProperty('FO_AGENT_META'); foAudit_(user.email, 'agent_key_revoked', '', 'ok'); return {}; }
const FO_AGENT_ROUTES = {
  'agent.pull': b => foCmPull_(b), 'agent.report': b => foCmReport_(b), 'agent.state': b => foCmState_(b), 'agent.reservations': b => foCmReservations_(b),
  'agent.observations': b => foCmObservations_(b), 'agent.evidence': b => foCmEvidence_(b), 'agent.heartbeat': b => foCmHeartbeat_(b),
};
/** Entry point for requests carrying agent_key (FoCore.gs foApi_). The agent can reach only FO_AGENT_ROUTES. */
function foAgentApi_(b) {
  const p = PropertiesService.getScriptProperties(), stored = p.getProperty('FO_AGENT_KEY');
  if (!stored || String(b.agent_key).length < 40 || !foSafeEqual_(foHmac_('agent:' + b.agent_key), stored)) { foFail_('agent', 'bad agent key'); return { ok: false, auth: false, error: 'Agent key not accepted.' }; }
  if (foCounter_('FO_AGENT_CALLS', 3600) > 900) return { ok: false, error: 'Too many agent calls this hour.' };
  const fn = FO_AGENT_ROUTES[String(b.action || '')]; if (!fn) return { ok: false, error: 'Not allowed for the agent.' };
  const out = fn(b) || {}; foFlush_(); if (out.ok === undefined) out.ok = true; return out;
}
function foCmSwitches_() {
  const s = foCmSettings_(), ch = {}; Object.keys(s).forEach(k => { ch[k] = { enabled: s[k].enabled, mode: s[k].mode, dryRun: s[k].dryRun, paused: s[k].paused }; });
  return { global: foCmGlobalPaused_(), channels: ch };
}
/**
 * agent.pull: switches, jobs to run (claimed with a 10-minute lease; booking closures first), reads due, public listings to watch.
 * Housekeeping happens here too: expired leases fail, failed jobs retry once after 10 minutes, then need a human.
 */
function foCmPull_(b) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const sw = foCmSwitches_(), s = foCmSettings_(), now = Date.now(), nowIso = foNow_(), agent = foClean_(b.agent_id, 40) || 'agent';
    const all = foRows_('ChannelJobs'), save = j => { const r = j._row; delete j._row; foUpdate_('ChannelJobs', r, j); j._row = r; };
    all.forEach(j => {
      if ((j.state === 'running' || j.state === 'verifying') && j.lease_until && Date.parse(j.lease_until) < now) { j.state = 'failed'; j.error_code = 'lease_expired'; j.failed_at = nowIso; save(j); }
      if (j.state === 'failed' && j.failed_at && now - Date.parse(j.failed_at) >= FO_CM.RETRY_MIN * 60000) { if (foNum_(j.attempts) < 2) { j.state = 'queued'; j.claimed_by = ''; } else { j.state = 'needs_human'; foCmAlert_('needs_human', j); } save(j); }
    });
    const out = { switches: sw, jobs: [], reads: [], watch: [], server_time: nowIso };
    if (sw.global) return out;
    const live = ch => s[ch] && s[ch].enabled && !s[ch].paused;
    const ready = all.filter(j => j.state === 'queued' && live(j.channel))
      .sort((a, c) => (a.reason === 'booking_elsewhere' ? 0 : 1) - (c.reason === 'booking_elsewhere' ? 0 : 1) || (a.date_from < c.date_from ? -1 : 1)).slice(0, FO_CM.PULL_MAX);
    const lease = new Date(now + FO_CM.LEASE_MIN * 60000).toISOString();
    ready.forEach(j => {
      const own = foCmOwn_(j.villa, j.channel);
      if (!own) { j.state = 'needs_human'; j.error_code = 'no_listing'; j.message = 'No own listing registered for this villa on ' + FO_CM.NAMES[j.channel]; save(j); return; }
      j.state = 'running'; j.claimed_by = agent; j.lease_until = lease; j.attempts = foNum_(j.attempts) + 1; save(j);
      out.jobs.push({ job_id: j.job_id, type: j.type, villa: j.villa, channel: j.channel, date_from: j.date_from, date_to: j.date_to, new_value: j.new_value, old_value: j.old_value,
        band: j.type === 'rate' && j.band_lo !== '' ? { lo: foNum_(j.band_lo), hi: foNum_(j.band_hi) } : null, dry_run: s[j.channel].dryRun, reason: j.reason,
        listing: { platform: own.platform, extranet_property_id: own.extranet_property_id, extranet_room_id: own.extranet_room_id, url: own.url_clean } });
    });
    // reads: each enabled channel's own listings every 3 hours (or when the agent asks)
    const lastRead = {}; foRows_('ChannelState').forEach(r => { const k = r.channel + '|' + r.villa; if (!lastRead[k] || r.read_at > lastRead[k]) lastRead[k] = r.read_at; });
    foRows_('Listings').filter(r => r.role === 'own' && r.status === 'active').forEach(r => {
      const ch = r.platform === 'goibibo' ? 'mmt' : r.platform; if (!s[ch] || !s[ch].enabled || s[ch].paused) return;
      const k = ch + '|' + r.villa; if (!b.force_reads && lastRead[k] && now - Date.parse(lastRead[k]) < FO_CM.READ_EVERY_H * 3600000) return;
      if (out.reads.some(x => x.channel === ch && x.villa === r.villa)) return;
      out.reads.push({ channel: ch, villa: r.villa, from: foToday_(), to: FoMetrics.addDays(foToday_(), FO_CM.HORIZON - 1), listing: { platform: r.platform, extranet_property_id: r.extranet_property_id, extranet_room_id: r.extranet_room_id, url: r.url_clean } });
    });
    // public listing watch (own + competitors) on schedule: what guests see, for parity and the market engines
    const lastObs = {}; foRows_('MarketRates').forEach(r => { if (r.listing_id && (!lastObs[r.listing_id] || r.observed_at > lastObs[r.listing_id])) lastObs[r.listing_id] = r.observed_at; });
    foRows_('Listings').filter(r => r.status === 'active').forEach(r => {
      const due = !lastObs[r.listing_id] || now - Date.parse(String(lastObs[r.listing_id]).slice(0, 10) + 'T00:00:00Z') >= (r.schedule === 'weekly' ? 7 : 1) * 864e5;
      if (due && out.watch.length < 40) out.watch.push({ listing_id: r.listing_id, url: r.url_clean, platform: r.platform, role: r.role, grid: { nights: [0, 1, 6, 13, 27].map(n => FoMetrics.addDays(foToday_(), n)), adults: foNum_(r.sleeps) >= 6 ? 6 : 4 } });
    });
    foTouch_();
    return out;
  } finally { lock.releaseLock(); }
}
/**
 * agent.report { job_id, result: done|failed|blocked|dry_run, read_back, error_code, message }.
 * done needs the read-back to equal the new value; anything else is a failure. blocked (login, OTP, CAPTCHA, unusual activity,
 * unknown screen) pauses the channel and asks the owner; nothing is retried around a block.
 */
function foCmReport_(b) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const j = foRows_('ChannelJobs').find(x => x.job_id === b.job_id); if (!j) return { ok: false, error: 'Unknown job.' };
    if (['running', 'verifying'].indexOf(j.state) < 0) return { ok: false, error: 'Job is ' + j.state + ', not running.' };
    if (b.agent_id && j.claimed_by && foClean_(b.agent_id, 40) !== j.claimed_by) return { ok: false, error: 'Job is leased to another agent.' };
    const now = foNow_(), result = String(b.result || ''); j.error_code = ''; j.message = foClean_(b.message, 300); j.evidence_ref = foClean_(b.evidence_ref, 80) || j.evidence_ref;
    if (result === 'done' || result === 'dry_run') {
      const rb = String(b.read_back == null ? '' : b.read_back).trim(), want = String(j.new_value), match = j.type === 'rate' || j.type === 'min_stay' ? foHasNum_(rb) && Math.abs(foNum_(rb) - foNum_(want)) < 1 : rb.toLowerCase() === want.toLowerCase();
      if (result === 'dry_run') { j.state = 'done'; j.read_back = 'dry_run'; j.done_at = now; j.message = 'Dry run: form filled and photographed, not submitted. ' + j.message; }
      else if (match) { j.state = 'done'; j.read_back = rb; j.done_at = now; foCmStateFromJob_(j); }
      else { j.state = 'failed'; j.read_back = rb; j.error_code = 'readback_mismatch'; j.failed_at = now; j.message = 'Wrote ' + want + ', channel shows ' + (rb || 'nothing'); }
    } else if (result === 'blocked') {
      const code = FO_CM.STOPS.indexOf(b.error_code) >= 0 ? b.error_code : 'unknown_screen';
      j.state = 'needs_human'; j.error_code = code; j.claimed_by = ''; j.lease_until = '';
      foCmPauseChannel_(j.channel, code); foCmAlert_('blocked', j);
      // other jobs this agent holds for the paused channel were never attempted past the block: back to the queue, attempt not counted
      foRows_('ChannelJobs').filter(x => x.job_id !== j.job_id && x.channel === j.channel && (x.state === 'running' || x.state === 'verifying')).forEach(x => {
        x.state = 'queued'; x.claimed_by = ''; x.lease_until = ''; x.attempts = Math.max(0, foNum_(x.attempts) - 1); const xr = x._row; delete x._row; foUpdate_('ChannelJobs', xr, x); });
    } else if (result === 'verifying') { j.state = 'verifying'; j.lease_until = new Date(Date.now() + FO_CM.LEASE_MIN * 60000).toISOString(); }
    else { j.state = 'failed'; j.error_code = foClean_(b.error_code, 40) || 'failed'; j.failed_at = now; }
    const r = j._row; delete j._row; foUpdate_('ChannelJobs', r, j); foTouch_();
    return { job: { job_id: j.job_id, state: j.state, error_code: j.error_code } };
  } finally { lock.releaseLock(); }
}
function foCmPauseChannel_(ch, why) {
  const row = foRows_('ChannelSettings').find(r => r.channel === ch); if (!row || row.paused === 'yes') return;
  const rec = Object.assign({}, row, { paused: 'yes', pause_reason: 'agent stopped: ' + why }); delete rec._row; foUpdate_('ChannelSettings', row._row, rec);
}
/** Successful writes update what we believe the channel shows. */
function foCmStateFromJob_(j) {
  const rows = []; for (let d = j.date_from; d <= j.date_to; d = FoMetrics.addDays(d, 1)) {
    const r = { villa: j.villa, channel: j.channel, date: d, read_at: foNow_() };
    if (j.type === 'rate') r.rate = foNum_(j.new_value); else if (j.type === 'open' || j.type === 'close') r.available = j.type === 'open' ? 'yes' : 'no'; else if (j.type === 'min_stay') r.min_stay = foNum_(j.new_value); else if (j.type === 'stop_sell') r.stop_sell = 'yes';
    rows.push(r);
  }
  foCmUpsertState_(rows, true);
}
/** ChannelState upsert by villa|channel|date; partial rows keep the other fields. */
function foCmUpsertState_(rows, partial) {
  const have = {}; foRows_('ChannelState').forEach(r => { have[r.villa + '|' + r.channel + '|' + String(r.date).slice(0, 10)] = r; });
  let n = 0;
  rows.forEach(x => {
    const k = x.villa + '|' + x.channel + '|' + x.date, old = have[k];
    const rec = { villa: x.villa, channel: x.channel, date: x.date, rate: x.rate !== undefined ? x.rate : old ? old.rate : '', available: x.available !== undefined ? x.available : old ? old.available : '',
      min_stay: x.min_stay !== undefined ? x.min_stay : old ? old.min_stay : '', stop_sell: x.stop_sell !== undefined ? x.stop_sell : old ? old.stop_sell : '', read_at: x.read_at || foNow_() };
    if (old) foUpdate_('ChannelState', old._row, rec); else { foAppend_('ChannelState', rec); have[k] = rec; }
    n++;
  });
  return n;
}
/** agent.state { channel, villa, rows: [{date, rate, available, min_stay, stop_sell}] }: what the extranet shows. Drift vs our last write → alert. */
function foCmState_(b) {
  const ch = String(b.channel || ''), villa = String(b.villa || ''); if (FO_CM.CHANNELS.indexOf(ch) < 0 || !foRows_('Properties').some(p => p.property_id === villa)) return { ok: false, error: 'Unknown channel or villa.' };
  const jobs = foRows_('ChannelJobs'), now = foNow_(), drift = [];
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 400).map(r => ({ villa, channel: ch, date: foDate_(r.date), rate: foHasNum_(r.rate) ? foNum_(r.rate) : '', available: r.available === true || r.available === 'yes' ? 'yes' : r.available === false || r.available === 'no' ? 'no' : '',
    min_stay: foHasNum_(r.min_stay) ? foNum_(r.min_stay) : '', stop_sell: r.stop_sell ? 'yes' : '', read_at: now })).filter(r => r.date);
  rows.forEach(r => { const last = foCmLastValue_(jobs.filter(j => j.state === 'done'), villa, ch, r.date, 'rate'); if (last != null && r.rate !== '' && Math.abs(r.rate - last) >= 1) drift.push(r.date + ' ₹' + r.rate + ' (we set ₹' + last + ')'); });
  const n = foCmUpsertState_(rows);
  if (drift.length) foCmAlert_('drift', { channel: ch, villa, message: drift.slice(0, 10).join(', ') });
  foTouch_(); return { result: { saved: n, drift: drift.length } };
}
/**
 * agent.reservations { channel, rows } → allowlisted fields only (anything else is dropped here as well), ChannelReservations upsert,
 * ledger booking (origin channel_agent, no guest fields), then closures on the other channels.
 */
function foCmReservations_(b) {
  const ch = String(b.channel || ''); if (FO_CM.CHANNELS.indexOf(ch) < 0) return { ok: false, error: 'Unknown channel.' };
  const props = foRows_('Properties'), have = {}; foRows_('ChannelReservations').forEach(r => { have[r.channel + '|' + r.reservation_id] = r; });
  const ctx = foCtx_('channel-agent'), out = { saved: 0, ledger: 0, dropped_fields: 0 };
  (Array.isArray(b.rows) ? b.rows : []).slice(0, 200).forEach(raw => {
    Object.keys(raw || {}).forEach(k => { if (FO_CM.RES_FIELDS.indexOf(k) < 0) out.dropped_fields++; });
    const r = { reservation_id: foClean_(raw.reservation_id, 40), villa: String(raw.villa || ''), checkin: foDate_(raw.checkin), checkout: foDate_(raw.checkout), amount: foHasNum_(raw.amount) ? foNum_(raw.amount) : '',
      currency: foClean_(raw.currency || 'INR', 3).toUpperCase(), channel: ch, status: ['confirmed', 'cancelled', 'modified', 'no_show'].indexOf(raw.status) >= 0 ? raw.status : 'confirmed', read_at: foNow_() };
    if (!r.reservation_id || !r.checkin || !r.checkout || !props.some(p => p.property_id === r.villa)) return;
    const k = ch + '|' + r.reservation_id, old = have[k];
    if (old) foUpdate_('ChannelReservations', old._row, r); else foAppend_('ChannelReservations', r);
    out.saved++;
    const villaName = (props.find(p => p.property_id === r.villa) || {}).name;
    const res = foIngest_({ origin: 'channel_agent', origin_ref: k, channel: FO_CM.LEDGER[ch], external_id: r.reservation_id, property_name: villaName, checkin: r.checkin, checkout: r.checkout,
      status: r.status === 'cancelled' ? 'cancelled' : r.status === 'no_show' ? 'no_show' : 'confirmed', gross_amount: r.amount, guest: {}, created_basis: 'channel' }, ctx);
    if (res !== 'unchanged' && res !== 'failed') out.ledger++;
  });
  if (out.saved) { foTouch_(); FO_MEMO.dirty = true; out.availability = foCmSyncAvailability_('channel-agent'); }
  return { result: out };
}
/** agent.observations: public prices for registered listings → MarketRates (the market engines read them as before). */
function foCmObservations_(b) {
  const L = {}; foRows_('Listings').forEach(r => { L[r.listing_id] = r; });
  const seen = {}; foRows_('MarketRates').forEach(r => { if (r.listing_id) seen[r.listing_id + '|' + String(r.stay_date).slice(0, 10) + '|' + String(r.observed_at).slice(0, 10)] = 1; });
  let n = 0;
  (Array.isArray(b.rows) ? b.rows : []).slice(0, 500).forEach(x => {
    const l = L[x.listing_id], d = foDate_(x.stay_date), at = foDate_(x.observed_at) || foToday_(); if (!l || !d) return;
    const k = l.listing_id + '|' + d + '|' + at; if (seen[k]) return; seen[k] = 1;
    const avail = x.available === false || x.available === 'no' ? 'sold out' : 'available', p = foHasNum_(x.price_per_night_inr) ? foNum_(x.price_per_night_inr) : '';
    if (avail === 'available' && !(p >= 300 && p <= 200000)) return;
    foAppend_('MarketRates', { obs_id: foId_('OBS'), competitor: l.name || (FO_CM.NAMES[l.platform === 'goibibo' ? 'mmt' : l.platform] + ' ' + l.platform_listing_id), observed_at: at, stay_date: d, nights: foNum_(x.nights) || 1,
      bedrooms: l.bedrooms, sleeps: l.sleeps, price_total: p, price_per_night: p, taxes_included: ['yes', 'no'].indexOf(x.taxes_included) >= 0 ? x.taxes_included : 'unknown', source_type: l.role === 'own' ? 'own_listing' : 'listing_registry',
      source_url: l.url_clean, confidence: 'high', notes: 'channel agent', collected_by: 'channel-agent', created_at: foNow_(), availability: avail, group_size: foNum_(x.adults) || '', target_property: l.role === 'own' ? l.villa : '', platform: l.platform, listing_id: l.listing_id });
    n++;
  });
  if (n) foTouch_();
  return { result: { added: n } };
}
/** agent.evidence { job_id, png_base64 } → private Drive folder (kept 30 days). */
function foCmEvidence_(b) {
  const j = foRows_('ChannelJobs').find(x => x.job_id === b.job_id); if (!j) return { ok: false, error: 'Unknown job.' };
  const data = String(b.png_base64 || ''); if (!data || data.length > 2000000) return { ok: false, error: 'Screenshot missing or larger than 1.5 MB.' };
  const parent = foReportsFolder_(), it = parent.getFoldersByName('Channel evidence'), folder = it.hasNext() ? it.next() : parent.createFolder('Channel evidence');
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(data), 'image/png', j.job_id + '_' + foClean_(b.kind, 20) + '.png'));
  const rec = Object.assign({}, j, { evidence_ref: file.getId() }); delete rec._row; foUpdate_('ChannelJobs', j._row, rec); foTouch_();
  return { evidence_ref: file.getId() };
}
function foCmEvidencePurge_() {
  try {
    const it = foReportsFolder_().getFoldersByName('Channel evidence'); if (!it.hasNext()) return '0';
    const files = it.next().getFiles(), cutoff = Date.now() - 30 * 864e5; let n = 0;
    while (files.hasNext()) { const f = files.next(); if (f.getDateCreated().getTime() < cutoff) { f.setTrashed(true); n++; } }
    return n + ' evidence files removed';
  } catch (e) { return 'skipped: ' + e.message; }
}
/** agent.heartbeat { agent_id, version, sessions: {mmt:'ok'|'login'|…} } */
function foCmHeartbeat_(b) {
  const hb = { at: foNow_(), agent_id: foClean_(b.agent_id, 40), version: foClean_(b.version, 20), sessions: {} };
  FO_CM.CHANNELS.forEach(c => { const v = b.sessions && b.sessions[c]; if (v) hb.sessions[c] = foClean_(v, 20); });
  PropertiesService.getScriptProperties().setProperty('FO_CM_HEARTBEAT', JSON.stringify(hb));
  return { switches: foCmSwitches_() };
}
function foCmHeartbeatGet_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('FO_CM_HEARTBEAT') || 'null'); } catch (e) { return null; } }

// ---------------------------------------------------------------- alerts ----------------
/** One email per kind·channel·villa per 6 hours (blocked sessions, jobs needing a human, someone changing a rate by hand, parity). */
function foCmAlert_(kind, j) {
  try {
    const key = 'FO_CM_AL_' + kind + '_' + (j.channel || '') + '_' + (j.villa || ''), c = CacheService.getScriptCache(); if (c.get(key)) return; c.put(key, '1', 21600);
    const ch = FO_CM.NAMES[j.channel] || j.channel, v = j.villa || '';
    const text = {
      blocked: ch + ' needs you: the agent stopped at a ' + String(j.error_code).replace('_', ' ') + ' screen and paused this channel. Sign in on the agent machine (noVNC from your phone), then press Resume in Channel Manager.',
      needs_human: 'A ' + j.type + ' change for ' + v + ' on ' + ch + ' (' + j.date_from + (j.date_to !== j.date_from ? '→' + j.date_to : '') + ') failed twice: ' + (j.error_code || '') + '. Open Channel Manager → Jobs to retry or cancel.',
      drift: 'Rates on ' + ch + ' for ' + v + ' differ from what AP Villas set (changed by hand or by the channel?): ' + (j.message || ''),
      parity: 'Price parity: ' + (j.message || ''),
    }[kind] || kind;
    MailApp.sendEmail({ to: foDeskRecipient_(), subject: 'AP Channel Manager · ' + (kind === 'blocked' ? 'action needed on ' + ch : kind.replace('_', ' ') + ' · ' + ch), body: text + '\n\nhttps://www.apvillasandresorts.in/founder/#/channels' });
  } catch (e) {}
}

// ---------------------------------------------------------------- parity ----------------
/** Same villa·night: the lowest guest price across channels vs direct (direct must be the cheapest). */
function foCmParity_(D, villa, days) {
  const desk = foCmDesk_(D, villa, days || 30) || [], out = [];
  desk.forEach(n => {
    const lives = FO_CM.CHANNELS.map(c => n.channels[c] && n.channels[c].live != null ? { c, p: n.channels[c].live } : null).filter(Boolean); if (lives.length < 1) return;
    const min = lives.reduce((a, x) => x.p < a.p ? x : a), max = lives.reduce((a, x) => x.p > a.p ? x : a), direct = n.net;
    if (min.p < direct || (lives.length > 1 && max.p / min.p - 1 > 0.15)) out.push({ date: n.date, direct, min: min.p, min_channel: min.c, max: max.p, max_channel: max.c, issue: min.p < direct ? 'channel cheaper than direct' : 'channels differ by ' + Math.round((max.p / min.p - 1) * 100) + '%' });
  });
  return out;
}

// ---------------------------------------------------------------- portal reads ----------------
function foCmCalendar_(b) {
  const D = foDataLoad_(), villa = String(b.villa || ''), cfg = FoDesk.settings(D), v = villa || cfg.properties[0];
  return { villa: v, desk: foCmDesk_(D, v, Math.min(FO_CM.HORIZON, foNum_(b.days) || FO_CM.HORIZON)), settings: foCmSettings_(), parity: foCmParity_(D, v, 30) };
}
function foCmRatedesk_(b) { return foCmCalendar_(Object.assign({}, b, { days: b.days || 30 })); }
/** Bundle part (f.data): everything the Channel Manager screens need; no guest data (reservations are allowlisted). */
function foCmBundle_() {
  const today = foToday_(), s = foCmSettings_(true), settings = {}; Object.keys(s).forEach(k => { settings[k] = Object.assign({}, s[k]); delete settings[k]._row; });
  const strip = r => { delete r._row; return r; };
  return { settings, global_paused: foCmGlobalPaused_(), heartbeat: foCmHeartbeatGet_(), agent_key: !!PropertiesService.getScriptProperties().getProperty('FO_AGENT_KEY'),
    listings: foRows_('Listings').map(strip), jobs: foRows_('ChannelJobs').filter(j => FO_CM.OPEN.indexOf(j.state) >= 0 || String(j.created_at) >= FoMetrics.addDays(today, -14)).slice(-800).map(strip),
    state: foRows_('ChannelState').filter(r => String(r.date).slice(0, 10) >= today).map(strip), reservations: foRows_('ChannelReservations').filter(r => String(r.checkout) >= FoMetrics.addDays(today, -30)).map(strip),
    ical: foCmIcalUrls_(), agent_online: foCmAgentOnline_(),
    links: (() => { const o = {}; foRows_('Properties').forEach(p => FO_CM.CHANNELS.forEach(c => { const u = foCmExtranetLink_(p.property_id, c); if (u) o[p.property_id + '|' + c] = u; })); return o; })() };
}

// ---------------------------------------------------------------- iCal export (official calendar sync safety net) ----------------
function foCmIcalToken_(b, user) {
  const p = PropertiesService.getScriptProperties(); p.setProperty('FO_CM_ICAL', foRandom_() + foRandom_());
  foAudit_(user.email, 'cm_ical_token', 'new feed links (old links stop working)', 'ok'); foTouch_();
  return { ical: foCmIcalUrls_() };
}
function foCmIcalUrls_() {
  const t = PropertiesService.getScriptProperties().getProperty('FO_CM_ICAL'); if (!t) return {};
  let base = ''; try { base = ScriptApp.getService().getUrl(); } catch (e) {}
  const out = {}; foRows_('Properties').forEach(p => { out[p.property_id] = (base || 'https://script.google.com/macros/s/…/exec') + '?ical=' + encodeURIComponent(p.property_id) + '&t=' + t; });
  return out;
}
/** doGet hook (Code.gs): busy nights only, no guest data. Returns null when the request is not for a feed. */
function foCmIcal_(e) {
  const prm = (e && e.parameter) || {}; if (!prm.ical) return null;
  const t = PropertiesService.getScriptProperties().getProperty('FO_CM_ICAL');
  if (!t || !foSafeEqual_(String(prm.t || ''), t)) return ContentService.createTextOutput('Not found').setMimeType(ContentService.MimeType.TEXT);
  const villa = String(prm.ical), D = foDataLoad_(), ev = [], stamp = foNow_().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  (D.bookings || []).filter(b => b.property_id === villa && ['confirmed', 'tentative'].indexOf(b.status) >= 0 && b.checkout >= foToday_()).forEach(b => ev.push([b.checkin, b.checkout, 'Booked', b.booking_id]));
  (D.blocks || []).filter(b => b.property_id === villa && b.end >= foToday_()).forEach(b => ev.push([b.start, b.end, 'Not available', 'BLK-' + b.start]));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AP Villas//Channel Manager//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:AP Villas ' + villa];
  ev.forEach(x => lines.push('BEGIN:VEVENT', 'UID:' + foHmac_('ical:' + x[3]).slice(0, 24) + '@apvillasandresorts.in', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + x[0].replace(/-/g, ''), 'DTEND;VALUE=DATE:' + x[1].replace(/-/g, ''), 'SUMMARY:' + x[2], 'END:VEVENT'));
  lines.push('END:VCALENDAR');
  return ContentService.createTextOutput(lines.join('\r\n')).setMimeType(ContentService.MimeType.ICAL);
}

// ---------------------------------------------------------------- hourly ----------------
/** foHourly: availability sync every hour; pricing proposals once a day (after the 07:00 desk run) for the next 30 nights. */
function foCmHourly_() {
  if (!foRows_('Listings').some(r => r.role === 'own')) return 'no own listings yet';
  const out = { availability: foCmSyncAvailability_('system') }, p = PropertiesService.getScriptProperties(), today = foToday_();
  if (p.getProperty('FO_CM_PROPOSED') !== today && Number(Utilities.formatDate(new Date(), FO.TZ, 'H')) >= 7) { out.pricing = foCmProposeFromDesk_('system', { days: 30 }); p.setProperty('FO_CM_PROPOSED', today); }
  out.assist = foCmAssistAlert_();
  return JSON.stringify(out);
}
