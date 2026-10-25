/**
 * AP Villas Founder OS · Live Pricing Desk (v2 of the pricing engine; extends FoInsights.pricing, never replaces it).
 * Runs in the browser (/founder/), in Node tests and in Apps Script (pasted as FoDesk.gs), so the portal, the hourly job,
 * the alerts and the tests compute the same numbers.
 *
 * Rules: recommendations only (nothing changes OTA prices); aggregates only (no guest data); every input is a stored signal
 * with source and fetched_at; a missing or expired signal gets weight 0 and is shown as missing, never guessed.
 * Prices: the engine targets a NET price per night (what AP Villas keeps). Direct WhatsApp = the guest's best deal;
 * each OTA price is grossed up for its commission so the net stays consistent.
 */
var FoDesk = (function () {
  'use strict';
  var DAY = 86400000;
  function M() { return typeof FoMetrics !== 'undefined' ? FoMetrics : (typeof require !== 'undefined' ? require('./metrics.js') : null); }
  function I() { return typeof FoInsights !== 'undefined' ? FoInsights : (typeof require !== 'undefined' ? require('./insights.js') : null); }
  function t(d) { return Date.parse(String(d).slice(0, 10) + 'T00:00:00Z'); }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function add(d, n) { return iso(t(d) + n * DAY); }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(/[₹,\s%]/g, '')); return isFinite(n) ? n : 0; }
  function has(v) { var s = String(v == null ? '' : v).replace(/[₹,\s%]/g, ''); return s !== '' && isFinite(Number(s)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function median(a) { var s = a.filter(function (x) { return isFinite(x); }).sort(function (x, y) { return x - y; }); if (!s.length) return null; var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function pct(a, b) { return b ? (a - b) / b : null; }
  function deepMerge(a, b) { Object.keys(b || {}).forEach(function (k) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], b[k]); else if (b[k] !== undefined && b[k] !== '') a[k] = b[k]; }); return a; }

  // ------------------------------------------------------------ settings (all overridable in the portal) ------------------------------------------------------------
  var DEFAULTS = {
    properties: ['rudrangan-suites', 'ap-suite'],
    group: { 'rudrangan-suites': { adults: 6, bedrooms: 3 }, 'ap-suite': { adults: 4, bedrooms: 2 } },
    floor_pct: 0.75, ceiling_pct: 3.0, mega_ceiling_pct: 4.0, round: 100,
    adr_cap: 2.0,                        // a realised rate above this × the published price is treated as a data error, not a new base
    max_daily_change: 0.12,              // vs yesterday's recommendation for the same night, unless a hard event
    positioning: { 'rudrangan-suites': 0, 'ap-suite': 0 },   // target vs comp-set median (0.05 = 5% above)
    use_own_history: false,              // owner rule 25 Oct 2026: price from the market, demand and calendar only (ledger may hold test/typo entries)
    market_weight: 0.6, market_commission: 0.15,             // competitor asking prices are guest prices: net-equivalent = price × (1 − this)
    commission: { airbnb: 0.15, booking: 0.15, makemytrip: 0.18 }, direct_discount: 0.05,
    lead: { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 },
    slots: { tonight: { S1: 0, S2: 0, S3: -0.05, S4: -0.10 }, tomorrow: { S1: 0, S2: 0, S3: -0.02, S4: -0.04 }, high: { S1: 0, S2: 0, S3: 0.03, S4: 0.05 } },
    compression: { high_sellout: 0.6, mid_sellout: 0.4, low_own: 0.6 },
    caps: { demand: 0.10, calendar: 0.15, weather: 0.10, compression: 0.12 },
    weights: {},                         // per-signal weight overrides (0 switches a signal off)
    comp: { weights: { size: 30, whole: 15, distance: 20, price: 15, rating: 10, amenities: 10 }, size: 10, min_hotels: 3, swap_margin: 10, swap_weeks: 2, max_km: 5, pinned: [], excluded: [] },
    alerts: { brief: true, rec_move: 0.10, market_move: 0.10, sellout: 0.6, stale: true, jobs: true, events: true },
  };
  function settings(data) {
    var raw = {}; try { var s = data && data.settings && data.settings.desk; raw = typeof s === 'string' ? JSON.parse(s || '{}') : (s || {}); } catch (e) { raw = {}; }
    return deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), raw);
  }

  // ------------------------------------------------------------ signals: registry, freshness, lookup ------------------------------------------------------------
  // [id, label, kind, freshness SLA in hours, default weight, source, terms]
  var SIGNALS = [
    ['pace', 'Our pace (on the books vs expected)', 'own', 1, 1.0, 'Founder OS ledger', 'own data'],
    ['compression_own', 'Our compression (of 5 villas, sold or blocked)', 'own', 1, 1.0, 'Founder OS ledger + blocks', 'own data'],
    ['seasonality', 'Season and day of week (own history)', 'own', 24, 1.0, 'Founder OS ledger', 'own data'],
    ['comp_price', 'Competitor asking prices (comp set)', 'market', 96, 1.0, 'Rate check / extranet CSV / owner-run scan', 'owner-entered, read-only'],
    ['comp_avail', 'Competitor sell-out share', 'market', 96, 0.8, 'Rate check / extranet / owner-run scan', 'owner-entered, read-only'],
    ['hotel_index', 'Hotel rate index ≤1 km (2 rooms)', 'market', 168, 0.4, 'Rate check / extranet', 'owner-entered'],
    ['calendar', 'Hindu calendar (tithis, festivals)', 'calendar', 24 * 35, 1.0, 'astronomy-engine (MIT), sunrise in Ujjain', 'open licence'],
    ['holiday', 'Public holidays and long weekends', 'calendar', 24 * 10, 0.8, 'Google public India holidays calendar', 'public feed'],
    ['school', 'School and college vacations (source states)', 'calendar', 24 * 10, 0.5, 'News scan (Claude, public news)', 'public news'],
    ['events', 'Local events (Ujjain, Indore)', 'calendar', 24 * 10, 0.7, 'News and public event listings', 'public news'],
    ['search', 'Search demand (Search Console, Trends)', 'demand', 72, 0.6, 'Google Search Console; Trends MCP free tier', 'own data / free tier'],
    ['web', 'Website demand (GA4 sessions, WhatsApp clicks)', 'demand', 36, 0.6, 'Google Analytics 4', 'own data'],
    ['temple', 'Temple notices and crowd control', 'demand', 24 * 8, 0.5, 'News (official site only where permitted)', 'public news'],
    ['travel', 'Travel demand (special trains, flights)', 'demand', 24 * 10, 0.3, 'News', 'public news'],
    ['footfall', 'Devotee footfall reports', 'demand', 24 * 10, 0.4, 'News', 'public news'],
    ['weather', 'Weather (heat, heavy rain)', 'weather', 12, 0.5, 'MET Norway Locationforecast (CC-BY 4.0)', 'commercial use allowed with credit'],
    ['reputation', 'Reputation vs comp set', 'market', 24 * 10, 0.3, 'Listing ratings (owner-entered / scan)', 'owner-entered'],
  ].map(function (s) { return { id: s[0], label: s[1], kind: s[2], sla: s[3], weight: s[4], source: s[5], terms: s[6] }; });
  var BY_ID = {}; SIGNALS.forEach(function (s) { BY_ID[s.id] = s; });
  function weightOf(cfg, id) { return has(cfg.weights[id]) ? num(cfg.weights[id]) : (BY_ID[id] ? BY_ID[id].weight : 0); }
  /** 1 within the SLA, fading linearly to 0 at 2× SLA. */
  function freshness(fetchedAt, slaHours, nowMs) {
    if (!fetchedAt) return { f: 0, status: 'missing', age_h: null };
    var age = (nowMs - Date.parse(fetchedAt)) / 3600000;
    if (!isFinite(age)) return { f: 0, status: 'missing', age_h: null };
    if (age <= slaHours) return { f: 1, status: 'live', age_h: age };
    if (age >= 2 * slaHours) return { f: 0, status: 'expired', age_h: age };
    return { f: 1 - (age - slaHours) / slaHours, status: 'stale', age_h: age };
  }
  function nowMs(data) { return data && data.serverTime ? Date.parse(data.serverTime) : Date.now(); }
  /** Index for one signal on one night: a row for that date beats a horizon-wide row (for_date empty). Property rows beat all-villa rows. */
  function signalAt(data, id, property, date, now) {
    var feed = (data.signals || []).filter(function (r) { return r.signal_id === id && (!r.property || r.property === property || r.property === 'all') && r.status !== 'blocked'; });
    var rows = feed.filter(function (r) { return !r.for_date || String(r.for_date).slice(0, 10) === date; });
    if (!rows.length) {
      // a live dated feed with no row for this night (e.g. no festival, no holiday) means a normal night, not a missing signal
      var latest = feed.slice().sort(function (a, b) { return a.fetched_at < b.fetched_at ? 1 : -1; })[0];
      if (!latest) return null;
      var run = feed.filter(function (r) { return r.fetched_at === latest.fetched_at && r.for_date; }).map(function (r) { return String(r.for_date).slice(0, 10); }).sort();
      var from = new Date(Date.parse(latest.fetched_at) + 330 * 60000).toISOString().slice(0, 10);   // the feed covers from the day it was fetched (IST)
      if (!run.length || date < (from < run[0] ? from : run[0]) || date > run[run.length - 1]) return null;
      var f0 = freshness(latest.fetched_at, BY_ID[id] ? BY_ID[id].sla : 24, now);
      return { id: id, index: 1, raw: '', note: 'normal night (nothing in this feed for ' + date + ')', source_url: latest.source_url || '', fetched_at: latest.fetched_at, fresh: f0.f, status: f0.status, age_h: f0.age_h };
    }
    rows.sort(function (a, b) { var sa = (a.for_date ? 2 : 0) + (a.property && a.property !== 'all' ? 1 : 0), sb = (b.for_date ? 2 : 0) + (b.property && b.property !== 'all' ? 1 : 0); return sb - sa || (a.fetched_at < b.fetched_at ? 1 : -1); });
    var r = rows[0], fr = freshness(r.fetched_at, BY_ID[id] ? BY_ID[id].sla : 24, now);
    return { id: id, index: has(r.index) ? num(r.index) : 1, raw: r.raw_value, note: r.notes || '', source_url: r.source_url || '', fetched_at: r.fetched_at, fresh: fr.f, status: fr.status, age_h: fr.age_h };
  }
  /** Health of every signal (latest row of each, own-data signals are live by construction). */
  function health(data) {
    var cfg = settings(data), now = nowMs(data), out = SIGNALS.map(function (s) {
      if (s.kind === 'own' && !cfg.use_own_history) return { id: s.id, label: s.label, kind: s.kind, source: s.source, terms: s.terms, sla_h: s.sla, status: 'off', fetched_at: null, rows: 0, source_url: 'own_ledger', note: 'switched off: prices use the market, demand and calendar only (Settings → Use my booking history)' };
      if (s.kind === 'own') return { id: s.id, label: s.label, kind: s.kind, source: s.source, terms: s.terms, sla_h: s.sla, status: 'live', fetched_at: data.serverTime || null, rows: (data.bookings || []).length, source_url: 'own_ledger', note: 'computed from your bookings each time' };
      var rows = (data.signals || []).filter(function (r) { return r.signal_id === s.id; });
      if (s.id === 'comp_price' || s.id === 'comp_avail' || s.id === 'hotel_index' || s.id === 'reputation') rows = rows.concat((data.market_rates || []).map(function (r) { return { fetched_at: r.observed_at ? String(r.observed_at).slice(0, 10) + 'T12:00:00+05:30' : '', source_url: r.source_url, status: 'live' }; }));
      var latest = rows.slice().sort(function (a, b) { return a.fetched_at < b.fetched_at ? 1 : -1; })[0], blocked = rows.some(function (r) { return r.status === 'blocked' && r === latest; });
      var fr = latest ? freshness(latest.fetched_at, s.sla, now) : { status: 'missing' };
      return { id: s.id, label: s.label, kind: s.kind, source: s.source, terms: s.terms, sla_h: s.sla, status: blocked ? 'blocked' : fr.status, fetched_at: latest ? latest.fetched_at : null, rows: rows.length, source_url: latest ? latest.source_url : '', note: latest && latest.notes || '' };
    });
    return out;
  }

  // ------------------------------------------------------------ competitor set: similarity, selection, stability ------------------------------------------------------------
  function normName(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|ujjain|near|mahakal|mahakaleshwar|temple|by|stay|stays)\b/g, ' ').replace(/\s+/g, ' ').trim(); }
  function isHotel(c) { return /hotel|guest house|guesthouse|inn|residency|palace|dharamshala/i.test((c.type || '') + ' ' + (c.name || '')) && !/villa|homestay|home stay|apartment|bhk|flat/i.test(c.type || ''); }
  function ratingOf(c) {
    if (has(c.rating)) { var r = num(c.rating); return { rating: r > 5 ? r / 2 : r, reviews: num(c.reviews) }; }
    var m = String(c.review_themes || '').match(/(?:rating|score)\s*([\d.]+)\s*(?:\/\s*\d+)?\s*from\s*([\d,]+)/i);
    if (!m) return { rating: null, reviews: null };
    var v = Number(m[1]); return { rating: v > 5 ? v / 2 : v, reviews: num(m[2]) };
  }
  function compPrices(data, c) { return (data.market_rates || []).filter(function (r) { return normName(r.competitor) === normName(c.name); }); }
  /** Similarity 0–100 to one of our properties, with the reasons. Excluded candidates get score null and a reason. */
  function similarity(data, c, propertyId, cfg) {
    var g = cfg.group[propertyId] || { adults: 4, bedrooms: 2 }, w = cfg.comp.weights, why = [], s = 0;
    var prop = (data.properties || []).filter(function (p) { return p.property_id === propertyId; })[0] || {}, base = num(prop.from_rate) || 5000;
    if (/dorm|single room|bed in/i.test((c.type || '') + ' ' + (c.notes || ''))) return { score: null, excluded: 'dorm or single room' };
    if (has(c.distance_km) && num(c.distance_km) > cfg.comp.max_km) return { score: null, excluded: 'over ' + cfg.comp.max_km + ' km' };
    var obs = compPrices(data, c); if (!obs.length) return { score: null, excluded: 'no dated price yet' };
    var hotel = isHotel(c), bd = has(c.bedrooms) ? num(c.bedrooms) : null, sl = has(c.sleeps) ? num(c.sleeps) : null;
    var size = hotel ? (obs.some(function (o) { return num(o.sleeps) >= g.adults || num(o.group_size) >= g.adults; }) ? 0.7 : 0.4) : bd == null ? 0.33 : bd === g.bedrooms ? 1 : Math.abs(bd - g.bedrooms) === 1 ? 0.5 : 0;
    if (sl != null && sl < g.adults) size *= 0.5;
    s += size * w.size; why.push('size ' + Math.round(size * w.size));
    var whole = hotel ? 0 : 1; s += whole * w.whole; why.push(hotel ? 'rooms, not a whole home' : 'whole home');
    var km = has(c.distance_km) ? num(c.distance_km) : null, dist = km == null ? 0.4 : km <= 1 ? 1 : km <= 2 ? 0.75 : km <= 3 ? 0.5 : 0.25;
    s += dist * w.distance; why.push(km == null ? 'distance unknown' : km + ' km');
    var med = median(obs.map(function (o) { return num(o.price_per_night) || num(o.price_total) / Math.max(1, num(o.nights) || 1); }).filter(function (v) { return v > 0; }));
    var band = med == null ? 0 : Math.abs(med / base - 1) <= 0.35 ? 1 : Math.abs(med / base - 1) <= 0.6 ? 0.5 : 0;
    s += band * w.price; why.push(med == null ? 'no price' : 'median ₹' + Math.round(med));
    var rt = ratingOf(c), rs = rt.rating == null ? 0 : rt.rating >= 4.7 && rt.reviews >= 20 ? 1 : rt.rating >= 4.5 ? 0.6 : 0.3;
    s += rs * w.rating; if (rt.rating != null) why.push('rating ' + rt.rating.toFixed(1) + ' (' + (rt.reviews || 0) + ')');
    var am = String(c.amenities || '') + ' ' + String(c.positioning || ''), hits = ['kitchen', 'parking', 'breakfast', 'lift', 'shuttle'].filter(function (k) { return new RegExp(k, 'i').test(am); }).length;
    s += hits / 5 * w.amenities;
    return { score: Math.round(s), hotel: hotel, median: med, rating: rt.rating, reviews: rt.reviews, why: why.join(' · ') };
  }
  /** Candidates merged across platforms (same normalised name = same property). */
  function candidates(data) {
    var by = {};
    (data.competitors || []).forEach(function (c) { var k = normName(c.name); if (!k) return; if (!by[k]) by[k] = Object.assign({ key: k, platforms: [] }, c); else Object.keys(c).forEach(function (f) { if (!has(by[k][f]) && c[f]) by[k][f] = c[f]; }); by[k].platforms.push(/airbnb/.test(c.source_url || c.listing_urls || '') ? 'Airbnb' : /booking\.com/.test(c.source_url || c.listing_urls || '') ? 'Booking.com' : /makemytrip/.test(c.source_url || c.listing_urls || '') ? 'MakeMyTrip' : /stayvista/.test(c.source_url || c.listing_urls || '') ? 'StayVista' : 'Other'); });
    return Object.keys(by).map(function (k) { return by[k]; });
  }
  /**
   * Weekly re-rank with stability. prev = current CompSet rows for the property ({key, in_set, challenger_weeks, pinned, excluded, since}).
   * A member leaves only when a challenger outscores it by swap_margin+ for swap_weeks consecutive re-ranks. Keeps min_hotels hotels.
   */
  function rerank(data, propertyId, prev, today) {
    var cfg = settings(data), C = cfg.comp, pinned = C.pinned.map(normName), excluded = C.excluded.map(normName), prevBy = {};
    (prev || []).forEach(function (r) { prevBy[r.key] = r; });
    var scored = candidates(data).map(function (c) { var sim = similarity(data, c, propertyId, cfg); return { key: c.key, name: c.name, competitor_id: c.competitor_id || '', platforms: c.platforms, sim: sim, pinned: pinned.indexOf(c.key) >= 0, excluded: excluded.indexOf(c.key) >= 0 }; })
      .filter(function (c) { return c.sim.score != null && !c.excluded; }).sort(function (a, b) { return b.sim.score - a.sim.score; });
    var current = scored.filter(function (c) { return prevBy[c.key] && prevBy[c.key].in_set === 'yes'; }), changes = [], set;
    if (!current.length) {   // first run: straight top N with the hotel quota
      set = pickTop(scored, C.size, C.min_hotels, pinned);
      set.forEach(function (c) { changes.push({ date: today, property: propertyId, action: 'added', key: c.key, name: c.name, score: c.sim.score, reason: 'initial comp set' }); });
    } else {
      set = current.slice(); var outside = scored.filter(function (c) { return set.indexOf(c) < 0; });
      scored.filter(function (c) { return c.pinned && set.indexOf(c) < 0; }).forEach(function (c) { set.push(c); changes.push({ date: today, property: propertyId, action: 'added', key: c.key, name: c.name, score: c.sim.score, reason: 'pinned by you' }); });
      outside.filter(function (c) { return !c.pinned; }).forEach(function (ch) {
        var hotelsIn = set.filter(function (m) { return m.sim.hotel; }).length, quota = Math.min(C.min_hotels, scored.filter(function (x) { return x.sim.hotel; }).length);
        var weakest = set.filter(function (m) { return !m.pinned && (ch.sim.hotel || !m.sim.hotel || hotelsIn > quota); }).sort(function (a, b) { return a.sim.score - b.sim.score; })[0];
        if (set.length < C.size) { set.push(ch); changes.push({ date: today, property: propertyId, action: 'added', key: ch.key, name: ch.name, score: ch.sim.score, reason: 'open place in the set' }); return; }
        if (!weakest || ch.sim.score - weakest.sim.score < C.swap_margin) { ch.challenger_weeks = 0; return; }
        var weeks = num(prevBy[ch.key] && prevBy[ch.key].challenger_weeks) + 1; ch.challenger_weeks = weeks;
        if (weeks >= C.swap_weeks) {
          set.splice(set.indexOf(weakest), 1); set.push(ch); ch.challenger_weeks = 0;
          changes.push({ date: today, property: propertyId, action: 'replaced', key: ch.key, name: ch.name, score: ch.sim.score, reason: 'outscored ' + weakest.name + ' by ' + (ch.sim.score - weakest.sim.score) + ' points for ' + weeks + ' weeks' });
          changes.push({ date: today, property: propertyId, action: 'removed', key: weakest.key, name: weakest.name, score: weakest.sim.score, reason: 'replaced by ' + ch.name });
        }
      });
      (prev || []).filter(function (r) { return r.in_set === 'yes' && !scored.some(function (c) { return c.key === r.key; }); }).forEach(function (r) { changes.push({ date: today, property: propertyId, action: 'removed', key: r.key, name: r.name, score: '', reason: 'no longer eligible (excluded, too far or no price)' }); });
    }
    var rows = scored.map(function (c) { var p = prevBy[c.key] || {}, inSet = set.indexOf(c) >= 0; return { property: propertyId, key: c.key, name: c.name, competitor_id: c.competitor_id, platforms: c.platforms.join(', '), score: c.sim.score, hotel: c.sim.hotel ? 'yes' : 'no', why: c.sim.why, in_set: inSet ? 'yes' : 'no', since: inSet ? (p.in_set === 'yes' ? p.since : today) : '', challenger_weeks: c.challenger_weeks || 0, pinned: c.pinned ? 'yes' : 'no', updated_at: today }; });
    return { rows: rows, changes: changes };
  }
  function pickTop(scored, n, minHotels, pinned) {
    var set = scored.filter(function (c) { return pinned.indexOf(c.key) >= 0; });
    var hotels = scored.filter(function (c) { return c.sim.hotel && set.indexOf(c) < 0; }).slice(0, Math.max(0, minHotels - set.filter(function (c) { return c.sim.hotel; }).length));
    set = set.concat(hotels);
    scored.forEach(function (c) { if (set.length < n && set.indexOf(c) < 0) set.push(c); });
    return set.slice(0, Math.max(n, set.length));
  }
  /** The comp set for a property: stored rows if present (stability), otherwise computed now. */
  function memo(data) { if (!data.__desk) { try { Object.defineProperty(data, '__desk', { value: {}, enumerable: false, writable: true }); } catch (e) { data.__desk = {}; } } return data.__desk; }
  function compSet(data, propertyId) {
    var mm = memo(data); if (mm['cs:' + propertyId]) return mm['cs:' + propertyId];
    var stored = (data.comp_set || []).filter(function (r) { return r.property === propertyId; });
    var rows = stored.length ? stored : rerank(data, propertyId, [], data.today || iso(Date.now())).rows;
    return (mm['cs:' + propertyId] = rows.filter(function (r) { return r.in_set === 'yes'; }).sort(function (a, b) { return num(b.score) - num(a.score); }));
  }
  /**
   * The comp set's observations for one stay date, every platform merged. For each competitor and platform the latest observation counts
   * (optionally only those seen on or before asOf, for momentum). A competitor's price is the guest's cheapest available price across
   * platforms; it is sold out only when every platform's latest check says sold out. parity = how far its platforms disagree.
   */
  function marketAt(data, propertyId, date, cfg, now, asOf) {
    var set = compSet(data, propertyId), keys = set.map(function (r) { return r.key; }), hotels = {};
    set.forEach(function (r) { hotels[r.key] = r.hotel === 'yes'; });
    var mm = memo(data), ck = 'mk:' + propertyId + ':' + date + ':' + (asOf || '');
    if (mm[ck]) return mm[ck];
    var latest = {};   // key|platform → row
    (data.market_rates || []).forEach(function (r) {
      if (String(r.stay_date || '').slice(0, 10) !== date) return;
      var k = normName(r.competitor); if (keys.indexOf(k) < 0) return;
      var at = String(r.observed_at).slice(0, 10); if (asOf && at > asOf) return;
      var id = k + '|' + (r.platform || platformOf(r.source_url));
      if (!latest[id] || at > String(latest[id].observed_at).slice(0, 10)) latest[id] = r;
    });
    var by = {};
    Object.keys(latest).forEach(function (id) {
      var r = latest[id], k = id.split('|')[0], pn = num(r.price_per_night) || num(r.price_total) / Math.max(1, num(r.nights) || 1), so = /sold|unavailable|not available/i.test(r.availability || '');
      var c = by[k] = by[k] || { key: k, name: r.competitor, hotel: hotels[k], platforms: [], observed_at: '', source_url: '' };
      c.platforms.push({ platform: r.platform || platformOf(r.source_url), price: so ? null : pn, sold_out: so, observed_at: String(r.observed_at).slice(0, 10), source_url: r.source_url || '', tax: r.taxes_included || '' });
      if (String(r.observed_at).slice(0, 10) > c.observed_at) c.observed_at = String(r.observed_at).slice(0, 10);
    });
    var rows = Object.keys(by).map(function (k) {
      var c = by[k], avail = c.platforms.filter(function (x) { return !x.sold_out && x.price > 0; }), best = avail.slice().sort(function (a, b) { return a.price - b.price; })[0];
      var ps = avail.map(function (x) { return x.price; });
      return { key: k, name: c.name, hotel: c.hotel, price: best ? best.price : 0, sold_out: !avail.length && c.platforms.some(function (x) { return x.sold_out; }), platform: best ? best.platform : '',
        platforms: c.platforms, parity: ps.length > 1 ? Math.max.apply(null, ps) / Math.min.apply(null, ps) - 1 : null, observed_at: c.observed_at, source_url: best ? best.source_url : (c.platforms[0] || {}).source_url, tax: best ? best.tax : '' };
    });
    var priced = rows.filter(function (r) { return !r.sold_out && r.price > 0 && !r.hotel; }), last = rows.map(function (r) { return r.observed_at; }).sort().pop() || null;
    var fr = last ? freshness(last + 'T12:00:00+05:30', BY_ID.comp_price.sla, now) : { f: 0, status: 'missing' };
    var p = priced.map(function (r) { return r.price; }).sort(function (a, b) { return a - b; }), hotelP = rows.filter(function (r) { return r.hotel && !r.sold_out && r.price > 0; }).map(function (r) { return r.price; });
    return (mm[ck] = { n: priced.length, seen: rows.length, sold_out: rows.filter(function (r) { return r.sold_out; }).length, sellout: rows.length ? rows.filter(function (r) { return r.sold_out; }).length / rows.length : null,
      min: p.length ? p[0] : null, p25: quant(p, 0.25), median: median(p), p75: quant(p, 0.75), max: p.length ? p[p.length - 1] : null, hotel_median: median(hotelP), latest: last, fresh: fr.f, status: fr.status, rows: rows, estimated: false });
  }
  /** Where a price sits among the comp set's available prices for the night: 0 = cheapest, 100 = dearest (guest prices vs our direct price). */
  function position(mk, net) { var ps = mk.rows.filter(function (r) { return !r.sold_out && r.price > 0 && !r.hotel; }).map(function (r) { return r.price; }); if (ps.length < 3) return null; return Math.round(ps.filter(function (p) { return p < net; }).length / ps.length * 100); }
  function forecastSafe(data, id, date) { try { return forecast(data, id, date); } catch (e) { return null; } }
  function quant(sorted, q) { if (!sorted.length) return null; var i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
  function platformOf(u) { u = String(u || ''); return /airbnb/.test(u) ? 'Airbnb' : /booking\.com/.test(u) ? 'Booking.com' : /agoda/.test(u) ? 'Agoda' : /makemytrip/.test(u) ? 'MakeMyTrip' : /goibibo/.test(u) ? 'Goibibo' : /oyorooms/.test(u) ? 'OYO' : /cleartrip/.test(u) ? 'Cleartrip' : /trip\.com/.test(u) ? 'Trip.com' : /easemytrip/.test(u) ? 'EaseMyTrip' : /owner_check/.test(u) ? 'Rate check' : 'Other'; }
  /**
   * For a night nobody has checked: the median of the comp-set medians on nearby checked nights of the same kind (Fri/Sat vs other days),
   * within ±21 days and at least 3 such nights. Marked estimated; the engine gives it half weight.
   */
  function marketEstimate(data, propertyId, date, cfg, now) {
    var wk = function (d) { var w = new Date(t(d)).getUTCDay(); return w === 5 || w === 6; }, same = wk(date), meds = [], lastSeen = null, fresh = 0;
    for (var i = -21; i <= 21; i++) {
      if (!i) continue; var d = add(date, i); if (wk(d) !== same) continue;
      var m = marketAt(data, propertyId, d, cfg, now); if (m.n >= 2 && m.median) { meds.push(m.median); fresh = Math.max(fresh, m.fresh); if (!lastSeen || m.latest > lastSeen) lastSeen = m.latest; }
    }
    if (meds.length < 3) return null;
    return { median: median(meds), nights: meds.length, fresh: fresh, latest: lastSeen };
  }
  /**
   * Like-for-like demand index for a night: each priced competitor's price vs its own median on nearby nights of the same kind (±21 days),
   * then the median of those ratios. Immune to which competitors happened to be checked. Needs 3+ competitors with history.
   */
  function relativeIndex(data, propertyId, date, cfg, now) {
    var cur = marketAt(data, propertyId, date, cfg, now), wk = function (d) { var w = new Date(t(d)).getUTCDay(); return w === 5 || w === 6; }, same = wk(date), ratios = [];
    cur.rows.filter(function (r) { return !r.sold_out && r.price > 0; }).forEach(function (r) {
      var own = [];
      for (var i = -21; i <= 21; i++) { if (!i) continue; var d = add(date, i); if (wk(d) !== same) continue; var m = marketAt(data, propertyId, d, cfg, now), x = m.rows.filter(function (y) { return y.key === r.key && !y.sold_out && y.price > 0; })[0]; if (x) own.push(x.price); }
      if (own.length >= 2) ratios.push(r.price / median(own));
    });
    return ratios.length >= 3 ? { index: median(ratios), n: ratios.length } : null;
  }
  /** Change in the comp-set median for this night between now and what was seen 3–10 days ago (needs repeat scans of the same night). */
  function momentum(data, propertyId, date, cfg, now, today) {
    var cur = marketAt(data, propertyId, date, cfg, now); if (cur.n < 3 || !cur.median) return null;
    for (var back = 3; back <= 10; back++) {
      var asOf = add(today, -back), old = marketAt(data, propertyId, date, cfg, now, asOf);
      if (old.n >= 3 && old.median && old.latest && old.latest <= asOf) return { change: cur.median / old.median - 1, from: old.median, to: cur.median, since: old.latest };
    }
    return null;
  }

  // ------------------------------------------------------------ competitor forecast ------------------------------------------------------------
  function isWkend(d) { var w = new Date(t(d)).getUTCDay(); return w === 5 || w === 6; }
  /** Calendar strength of a night from public signals only (Hindu calendar, holidays, events, school breaks): product of fresh indices. */
  function calIndex(data, propertyId, date, now) {
    var x = 1; ['calendar', 'holiday', 'events', 'school'].forEach(function (id) { var s = signalAt(data, id, propertyId, date, now); if (s && s.fresh > 0) x *= 1 + (s.index - 1) * s.fresh; }); return x;
  }
  /** What the bots have seen for this comp set: every checked night with its rows (memoised per data load). */
  function scanned(data, propertyId, cfg, now) {
    var mm = memo(data), ck = 'sc:' + propertyId; if (mm[ck]) return mm[ck];
    var keys = compSet(data, propertyId).map(function (r) { return r.key; }), dates = {};
    (data.market_rates || []).forEach(function (r) { var d = String(r.stay_date || '').slice(0, 10); if (d && keys.indexOf(normName(r.competitor)) >= 0) dates[d] = 1; });
    return (mm[ck] = Object.keys(dates).sort().map(function (d) { return { date: d, m: marketAt(data, propertyId, d, cfg, now) }; }).filter(function (x) { return x.m.seen > 0; }));
  }
  /**
   * Learned model of the comp set (optionally leaving one night out, for honest accuracy checks):
   * norms = each competitor's median price on weekday / Fri-Sat nights; k = how much prices rise per unit of calendar strength;
   * drift = average price change per day as a night gets closer (repeat scans); sellout rates by night type and lead time.
   */
  function marketModel(data, propertyId, cfg, now, exclude) {
    var mm = memo(data), ck = 'mdl:' + propertyId + ':' + (exclude || ''); if (mm[ck]) return mm[ck];
    var nights = scanned(data, propertyId, cfg, now).filter(function (x) { return x.date !== exclude; }), norms = {};
    nights.forEach(function (x) { x.m.rows.forEach(function (r) { if (r.sold_out || !(r.price > 0)) return; var k = r.key + '|' + (isWkend(x.date) ? 'we' : 'wd'); (norms[k] = norms[k] || []).push(r.price); }); });
    Object.keys(norms).forEach(function (k) { norms[k] = median(norms[k]); });
    var base = { wd: [], we: [] }; Object.keys(norms).forEach(function (k) { base[k.split('|')[1]].push(norms[k]); });
    base.wd.sort(function (a, b) { return a - b; }); base.we.sort(function (a, b) { return a - b; });
    // calendar elasticity from nights stronger than normal
    var pairs = [];
    nights.forEach(function (x) {
      var ci = calIndex(data, propertyId, x.date, now); if (ci < 1.02) return;
      var rel = x.m.rows.filter(function (r) { return !r.sold_out && r.price > 0 && norms[r.key + '|' + (isWkend(x.date) ? 'we' : 'wd')]; }).map(function (r) { return r.price / norms[r.key + '|' + (isWkend(x.date) ? 'we' : 'wd')]; });
      if (rel.length >= 3) pairs.push((median(rel) - 1) / (ci - 1));
    });
    var k = pairs.length >= 3 ? clamp(median(pairs), 0, 1.5) : 0.6;
    // drift: the same competitor + night + platform seen on two different days
    var hist = {}, slopes = [];
    (data.market_rates || []).forEach(function (r) { var pn = num(r.price_per_night); if (!(pn > 0) || /sold/i.test(r.availability || '') || String(r.stay_date || '').slice(0, 10) === exclude) return; var id = normName(r.competitor) + '|' + String(r.stay_date).slice(0, 10) + '|' + (r.platform || platformOf(r.source_url)); (hist[id] = hist[id] || []).push({ at: String(r.observed_at).slice(0, 10), p: pn }); });
    Object.keys(hist).forEach(function (id) { var a = hist[id].sort(function (x, y) { return x.at < y.at ? -1 : 1; }); for (var i = 1; i < a.length; i++) { var days = (t(a[i].at) - t(a[i - 1].at)) / DAY; if (days >= 1) slopes.push((a[i].p / a[i - 1].p - 1) / days); } });
    var drift = slopes.length >= 5 ? clamp(median(slopes), -0.01, 0.01) : 0;
    // sell-out rates by night type and lead time (lead = stay date − day it was seen)
    var so = { wd: [], we: [], near: [], mid: [], far: [] };
    nights.forEach(function (x) { if (x.m.seen < 3) return; var lead = Math.round((t(x.date) - t(x.m.latest || x.date)) / DAY), sh = x.m.sellout; so[isWkend(x.date) ? 'we' : 'wd'].push(sh); so[lead <= 3 ? 'near' : lead <= 14 ? 'mid' : 'far'].push(sh); });
    var avg = function (a) { return a.length ? a.reduce(function (s2, v) { return s2 + v; }, 0) / a.length : null; };
    var all = avg(so.wd.concat(so.we));
    var leadF = function (b) { var v = avg(so[b]); return all && v != null && so[b].length >= 3 ? v / all : { near: 1, mid: 0.8, far: 0.5 }[b]; };
    return (mm[ck] = { norms: norms, base: base, k: k, pairs: pairs.length, drift: drift, slopes: slopes.length, sell: { wd: avg(so.wd), we: avg(so.we), all: all, near: leadF('near'), mid: leadF('mid'), far: leadF('far') }, nights: nights.length, competitors: Object.keys(norms).map(function (x) { return x.split('|')[0]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).length });
  }
  /** Forecast of the comp set for one night: median and range of competitor prices, the expected price nearer the date, and sell-out chance. */
  function forecast(data, propertyId, date, opts) {
    opts = opts || {};
    var cfg = settings(data), now = nowMs(data), today = data.today || iso(now), mdl = marketModel(data, propertyId, cfg, now, opts.exclude), b = isWkend(date) ? 'we' : 'wd';
    var pool = mdl.base[b].length >= 3 ? mdl.base[b] : mdl.base.wd.concat(mdl.base.we).sort(function (a, c) { return a - c; });
    if (pool.length < 3) return null;
    var ci = calIndex(data, propertyId, date, now), lift = 1 + mdl.k * (ci - 1), lead = Math.max(0, Math.round((t(date) - t(today)) / DAY));
    var med = median(pool) * lift, toStay = clamp(mdl.drift * lead, -0.25, 0.25);
    var sBase = mdl.sell[b] != null ? mdl.sell[b] : mdl.sell.all, sp = sBase == null ? null : clamp(sBase * (1 + 2 * (ci - 1)) * (lead <= 3 ? mdl.sell.near : lead <= 14 ? mdl.sell.mid : mdl.sell.far), 0, 0.95);
    return { date: date, median: Math.round(med), p25: Math.round(quant(pool, 0.25) * lift), p75: Math.round(quant(pool, 0.75) * lift), at_stay: Math.round(med * (1 + toStay)), sellout_p: sp == null ? null : Math.round(sp * 100) / 100,
      calendar: Math.round(ci * 100) / 100, k: Math.round(mdl.k * 100) / 100, drift_per_day: mdl.drift, competitors: pool.length, nights_seen: mdl.nights,
      quality: pool.length >= 6 && mdl.nights >= 8 ? 'good' : pool.length >= 3 && mdl.nights >= 3 ? 'fair' : 'thin' };
  }
  /** Honest accuracy: forecast each checked night without its own prices and compare with what the bots saw (median absolute % error). */
  function forecastAccuracy(data, propertyId) {
    var cfg = settings(data), now = nowMs(data), errs = [], rows = [];
    scanned(data, propertyId, cfg, now).forEach(function (x) { if (x.m.n < 3 || !x.m.median) return; var f = forecast(data, propertyId, x.date, { exclude: x.date }); if (!f) return; var e = Math.abs(f.median / x.m.median - 1); errs.push(e); rows.push({ date: x.date, forecast: f.median, actual: Math.round(x.m.median), error: e }); });
    return { nights: errs.length, mape: errs.length ? median(errs) : null, rows: rows };
  }

  // ------------------------------------------------------------ market analytics ------------------------------------------------------------
  function segOf(c, r) { var bd = num((c || {}).bedrooms), hotel = /hotel|guest ?house|inn|residency|palace|dharamshala/i.test(((c || {}).type || '') + ' ' + ((c || {}).name || r.name || '')) && !/villa|homestay|apartment|bhk/i.test((c || {}).type || ''); return hotel ? 'Hotels' : bd >= 3 ? '3+ BR homes' : bd === 2 ? '2 BR homes' : bd ? '1 BR homes' : 'Other homes'; }
  /** Market analytics across every competitor the bots know (not only the comp set), for the next `days` nights. */
  function marketAnalytics(data, days) {
    days = days || 30;
    var now = nowMs(data), today = data.today || iso(now), end = add(today, days), comps = {}, byNight = {};
    (data.competitors || []).forEach(function (c) { comps[normName(c.name)] = c; });
    (data.market_rates || []).forEach(function (r) {
      var d = String(r.stay_date || '').slice(0, 10); if (!d || d < today || d > end) return;
      var k = normName(r.competitor), pl = r.platform || platformOf(r.source_url), id = k + '|' + d + '|' + pl, at = String(r.observed_at).slice(0, 10);
      if (!byNight[id] || at > byNight[id].at) byNight[id] = { key: k, name: r.competitor, date: d, platform: pl, at: at, price: num(r.price_per_night), sold: /sold/i.test(r.availability || '') };
    });
    var obs = Object.keys(byNight).map(function (id) { return byNight[id]; });
    // per competitor per night: cheapest platform
    var cn = {}; obs.forEach(function (o) { var id = o.key + '|' + o.date; (cn[id] = cn[id] || []).push(o); });
    var nightsRows = Object.keys(cn).map(function (id) { var a = cn[id], av = a.filter(function (o) { return !o.sold && o.price > 0; }).sort(function (x, y) { return x.price - y.price; }); return { key: a[0].key, name: a[0].name, date: a[0].date, price: av.length ? av[0].price : null, cheapest: av.length ? av[0].platform : '', sold: !av.length && a.some(function (o) { return o.sold; }), platforms: a, spread: av.length > 1 ? av[av.length - 1].price / av[0].price - 1 : null }; });
    // segments
    var segs = {}; nightsRows.forEach(function (n) { var sg = segOf(comps[n.key], n), x = segs[sg] = segs[sg] || { segment: sg, prices: [], sold: 0, seen: 0, comps: {} }; x.seen++; x.comps[n.key] = 1; if (n.sold) x.sold++; else if (n.price) x.prices.push(n.price); });
    var segments = Object.keys(segs).map(function (k) { var x = segs[k], p = x.prices.sort(function (a, b) { return a - b; }); return { segment: k, competitors: Object.keys(x.comps).length, observations: x.seen, median: median(p), p25: quant(p, 0.25), p75: quant(p, 0.75), sellout: x.seen ? x.sold / x.seen : null }; }).sort(function (a, b) { return b.observations - a.observations; });
    // platforms: how often each is the guest's cheapest, its typical premium over the cheapest
    var pls = {}; nightsRows.forEach(function (n) { var av = n.platforms.filter(function (o) { return !o.sold && o.price > 0; }); av.forEach(function (o) { var x = pls[o.platform] = pls[o.platform] || { platform: o.platform, observations: 0, cheapest: 0, premiums: [], prices: [] }; x.observations++; x.prices.push(o.price); if (o.platform === n.cheapest) x.cheapest++; if (av.length > 1) x.premiums.push(o.price / n.price - 1); }); });
    var platforms = Object.keys(pls).map(function (k) { var x = pls[k]; return { platform: k, observations: x.observations, median: median(x.prices), cheapest_share: x.observations ? x.cheapest / x.observations : null, premium: x.premiums.length ? median(x.premiums) : null }; }).sort(function (a, b) { return b.observations - a.observations; });
    // weekday profile (price relative to each competitor's own median) and sell-outs
    var own = {}; nightsRows.forEach(function (n) { if (n.price) (own[n.key] = own[n.key] || []).push(n.price); }); Object.keys(own).forEach(function (k) { own[k] = median(own[k]); });
    var wk = [0, 1, 2, 3, 4, 5, 6].map(function (w) { return { weekday: w, rel: [], sold: 0, seen: 0 }; });
    nightsRows.forEach(function (n) { var x = wk[new Date(t(n.date)).getUTCDay()]; x.seen++; if (n.sold) x.sold++; else if (n.price && own[n.key]) x.rel.push(n.price / own[n.key]); });
    var weekdays = wk.map(function (x) { return { weekday: x.weekday, index: x.rel.length ? median(x.rel) : null, sellout: x.seen ? x.sold / x.seen : null, observations: x.seen }; });
    // lead-time curve: price relative to the competitor's own median by how far ahead it was seen
    var buckets = [['0–3 days', 0, 3], ['4–14 days', 4, 14], ['15–45 days', 15, 45], ['46+ days', 46, 999]].map(function (b) { return { label: b[0], from: b[1], to: b[2], rel: [] }; });
    (data.market_rates || []).forEach(function (r) { var k = normName(r.competitor), p = num(r.price_per_night); if (!(p > 0) || !own[k] || !r.stay_date) return; var lead = Math.round((t(String(r.stay_date).slice(0, 10)) - t(String(r.observed_at).slice(0, 10))) / DAY); var b = buckets.filter(function (x) { return lead >= x.from && lead <= x.to; })[0]; if (b) b.rel.push(p / own[k]); });
    var lead = buckets.map(function (b) { return { label: b.label, index: b.rel.length ? median(b.rel) : null, observations: b.rel.length }; });
    // price index over time: each observation day's prices relative to each competitor's own median
    var days2 = {}; (data.market_rates || []).forEach(function (r) { var k = normName(r.competitor), p = num(r.price_per_night); if (!(p > 0) || !own[k]) return; var a = String(r.observed_at).slice(0, 10); (days2[a] = days2[a] || []).push(p / own[k]); });
    var index = Object.keys(days2).sort().map(function (d) { return { date: d, index: median(days2[d]), observations: days2[d].length }; });
    // leaderboard
    var lb = {}; nightsRows.forEach(function (n) { var x = lb[n.key] = lb[n.key] || { key: n.key, name: n.name, nights: 0, sold: 0, prices: [], spreads: [], platforms: {} }; x.nights++; if (n.sold) x.sold++; else if (n.price) x.prices.push(n.price); if (n.spread != null) x.spreads.push(n.spread); n.platforms.forEach(function (o) { x.platforms[o.platform] = 1; }); });
    var changes = {}; (data.market_rates || []).forEach(function (r) { var id = normName(r.competitor) + '|' + String(r.stay_date).slice(0, 10) + '|' + (r.platform || ''), p = num(r.price_per_night); if (!(p > 0)) return; (changes[id] = changes[id] || []).push({ at: String(r.observed_at), p: p }); });
    var moves = {}; Object.keys(changes).forEach(function (id) { var a = changes[id].sort(function (x, y) { return x.at < y.at ? -1 : 1; }), k = id.split('|')[0]; for (var i = 1; i < a.length; i++) if (Math.abs(a[i].p / a[i - 1].p - 1) >= 0.03) moves[k] = (moves[k] || 0) + 1; });
    var leaderboard = Object.keys(lb).map(function (k) { var x = lb[k], c = comps[k] || {}; return { key: k, name: x.name, segment: segOf(c, x), distance_km: c.distance_km, nights: x.nights, median: median(x.prices), sellout: x.nights ? x.sold / x.nights : null, spread: x.spreads.length ? median(x.spreads) : null, platforms: Object.keys(x.platforms), price_moves: moves[k] || 0 }; }).sort(function (a, b) { return b.nights - a.nights; });
    return { days: days, observations: obs.length, competitors: Object.keys(own).length, segments: segments, platforms: platforms, weekdays: weekdays, lead: lead, index: index, leaderboard: leaderboard };
  }

  // ------------------------------------------------------------ engine v2 ------------------------------------------------------------
  function ctxFor(data, propertyId) {
    var Ins = I(), ctx = Ins.pricingContext(data, propertyId); if (!ctx) return null;
    var cfg = settings(data), Mx = M();
    // base = max(published from price, realised ADR over the last 60 days for the same day type)
    if (!cfg.use_own_history) ctx = Object.assign({}, ctx, { measured: {}, season: {}, weekend: ctx.cfg.weekend_uplift, weekendBasis: 'your weekend setting', realised: null, realisedNights: 0 });
    var today = data.today || iso(Date.now()), f = { property: propertyId }, wk = cfg.use_own_history ? Mx.weekendSplit(data, add(today, -60), add(today, -1), f) : {};
    return { v1: ctx, cfg: cfg, today: today, now: nowMs(data), prop: ctx.villa, base: ctx.base, adr60: { weekend: wk.weekend && wk.weekend.occupied >= 3 ? wk.weekend.adr : null, weekday: wk.weekday && wk.weekday.occupied >= 3 ? wk.weekday.adr : null } };
  }
  /** Our compression for a night: villas sold (confirmed/tentative) or blocked, out of all active villas. */
  function ownCompression(data, date) {
    var ps = (data.properties || []).filter(function (p) { return p.active !== 'no'; }), taken = ps.filter(function (p) {
      return (data.bookings || []).some(function (b) { return b.property_id === p.property_id && ['confirmed', 'tentative'].indexOf(b.status) >= 0 && b.checkin <= date && b.checkout > date; }) ||
        (data.blocks || []).some(function (b) { return b.property_id === p.property_id && b.start <= date && b.end > date; });
    }).length;
    return { taken: taken, total: ps.length, share: ps.length ? taken / ps.length : 0 };
  }
  function prevRec(data, propertyId, date, today) {
    var rows = (data.recommendations || []).filter(function (r) { return r.property === propertyId && String(r.for_date).slice(0, 10) === date && String(r.computed_at).slice(0, 10) < today; });
    rows.sort(function (a, b) { return a.computed_at < b.computed_at ? 1 : -1; }); return rows[0] || null;
  }
  /**
   * Net price for one property and one night, with a ₹ waterfall, confidence and every input's freshness.
   * opts.slot (S1–S4) applies the booking-time ladder for tonight/tomorrow; opts.noPrev skips the daily-change limit (backtests).
   */
  function quote(data, cx, date, opts) {
    opts = opts || {};
    var cfg = cx.cfg, Mx = M(), Ins = I(), id = cx.prop.property_id, steps = [], inputs = [], reasons = [];
    var v1 = Ins.priceFor(data, cx.v1, date), lead = Math.round((t(date) - t(cx.today)) / DAY), wd = new Date(t(date)).getUTCDay(), wkend = wd === 5 || wd === 6;
    // 1. base
    var base = cx.base, adr = wkend ? cx.adr60.weekend : cx.adr60.weekday, baseBasis = cx.v1.baseSrc;
    if (adr && adr > base * cfg.adr_cap) { reasons.push('Ignored your realised ' + (wkend ? 'weekend' : 'weekday') + ' rate ₹' + Math.round(adr) + ' (over ' + cfg.adr_cap + '× the published price: check the booking amounts)'); adr = null; }
    if (adr && adr > base) { base = adr; baseBasis = 'your realised ' + (wkend ? 'weekend' : 'weekday') + ' rate, last 60 days'; }
    var vs = (cx.v1.cfg.villas || {})[id] || {}; if (has(vs.base)) { base = num(vs.base); baseBasis = 'your base setting'; }
    var price = base; steps.push({ key: 'base', label: 'Base', delta: base, total: true, basis: baseBasis });
    function apply(key, label, mult, basis, meta) {
      if (!isFinite(mult) || Math.abs(mult - 1) < 0.0005) return;
      var before = price; price = price * mult; steps.push(Object.assign({ key: key, label: label, delta: price - before, mult: mult, basis: basis }, meta || {}));
    }
    // 2. own-data factors from v1 (season, weekend, event, pace); v1's trend and market are replaced by the v2 signals below
    var hardEvent = false, eventPresent = false;
    v1.factors.forEach(function (fct) {
      if ((cfg.use_own_history ? ['season', 'weekend', 'pace'] : ['weekend']).indexOf(fct.key) >= 0) apply(fct.key, fct.label, fct.mult, fct.basis, { source: 'own_ledger' });
      if (fct.key === 'event') { eventPresent = true; if (/mega|peak/i.test(fct.basis + fct.label) || fct.mult >= 1.35) hardEvent = true; apply('event', fct.label, fct.mult, fct.basis, { source: 'events calendar' }); }
    });
    var ownC = ownCompression(data, date);
    if (cfg.use_own_history) {
      inputs.push({ id: 'pace', status: 'live', fresh: 1, note: Math.round((v1.portfolio_occupancy || 0) * 100) + '% of available villas booked' });
      inputs.push({ id: 'compression_own', status: 'live', fresh: 1, note: ownC.taken + ' of ' + ownC.total + ' villas sold or blocked' });
      inputs.push({ id: 'seasonality', status: 'live', fresh: 1, note: wkend ? 'weekend night' : 'weekday night' });
    } else ['pace', 'compression_own', 'seasonality'].forEach(function (k) { inputs.push({ id: k, status: 'off', fresh: 0, note: 'not used: your booking history is switched off' }); });
    // 3. calendar signals (skip festival uplift when the events calendar already applied one)
    var activeStale = [], active = 0;
    function sig(idS) { var s = signalAt(data, idS, id, date, cx.now), w = weightOf(cfg, idS); inputs.push({ id: idS, status: s ? s.status : 'missing', fresh: s ? s.fresh : 0, index: s ? s.index : null, note: s ? s.note : '', source_url: s ? s.source_url : '', fetched_at: s ? s.fetched_at : null, weight: w }); return s && s.fresh > 0 && w > 0 ? { s: s, w: w * s.fresh } : null; }
    var calLift = 0, calBasis = [];
    ['calendar', 'holiday', 'school', 'events'].forEach(function (idS) {
      var x = sig(idS); if (!x) return;
      if (eventPresent && (idS === 'calendar' || idS === 'holiday')) return;
      var lift = (x.s.index - 1) * x.w; if (Math.abs(lift) < 0.001) return;
      calLift += lift; calBasis.push(x.s.note || idS); active++; if (x.s.fresh < 1) activeStale.push(idS);
    });
    calLift = clamp(calLift, -cfg.caps.calendar, cfg.caps.calendar);
    // 4. demand index: search, web, temple, travel, footfall blended into one capped index
    var dSum = 0, dW = 0, dBasis = [];
    ['search', 'web', 'temple', 'travel', 'footfall'].forEach(function (idS) { var x = sig(idS); if (!x) return; dSum += (x.s.index - 1) * x.w; dW += x.w; dBasis.push(idS + ' ' + x.s.index.toFixed(2)); if (x.s.fresh < 1) activeStale.push(idS); });
    var demand = dW ? clamp(dSum / dW * Math.min(1, dW), -cfg.caps.demand, cfg.caps.demand) : 0; if (dW && Math.abs(demand) > 0.001) active++;
    // 5. weather dampener (only ever downwards)
    var wx = sig('weather'), wxLift = wx ? clamp((Math.min(1, wx.s.index) - 1) * wx.w, -cfg.caps.weather, 0) : 0; if (wxLift < 0) { active++; if (wx.s.fresh < 1) activeStale.push('weather'); }
    sig('reputation');
    // never move on a single stale signal
    if (active === 1 && activeStale.length === 1) { calLift = 0; demand = 0; wxLift = 0; reasons.push('Ignored a single stale signal (' + activeStale[0] + ')'); }
    apply('calendar', 'Calendar & holidays', 1 + calLift, calBasis.join('; ') || 'calendar signals', { source: 'signals' });
    apply('demand', 'Demand index', 1 + demand, dBasis.join(', '), { source: 'signals' });
    apply('weather', 'Weather', 1 + wxLift, wx ? wx.s.note || 'forecast' : '', { source: 'MET Norway' });
    // 6. market anchor (comp-set median for the night, net-equivalent, positioning target) and compression
    var mk = marketAt(data, id, date, cfg, cx.now), mkW = 0;
    inputs.push({ id: 'comp_price', status: mk.status, fresh: mk.fresh, note: mk.n + ' comp-set prices for this night' + (mk.latest ? ' (seen ' + mk.latest + ')' : ''), weight: weightOf(cfg, 'comp_price') });
    inputs.push({ id: 'comp_avail', status: mk.seen ? mk.status : 'missing', fresh: mk.seen ? mk.fresh : 0, note: mk.seen ? mk.sold_out + ' of ' + mk.seen + ' sold out' : 'no availability seen', weight: weightOf(cfg, 'comp_avail') });
    inputs.push({ id: 'hotel_index', status: mk.hotel_median ? mk.status : 'missing', fresh: mk.hotel_median ? mk.fresh : 0, note: mk.hotel_median ? 'hotel median ₹' + Math.round(mk.hotel_median) : 'no hotel prices for this night', weight: weightOf(cfg, 'hotel_index') });
    var est = null;
    if (mk.n >= 3 && mk.median && mk.fresh > 0) {
      var target = mk.median * (1 - cfg.market_commission) * (1 + num(cfg.positioning[id])); mkW = cfg.market_weight * weightOf(cfg, 'comp_price') * mk.fresh;
      apply('market', 'Market (comp set)', ((1 - mkW) * price + mkW * target) / price, 'median ₹' + Math.round(mk.median) + ' of ' + mk.n + ' across platforms (net ≈ ₹' + Math.round(mk.median * (1 - cfg.market_commission)) + ')' + (num(cfg.positioning[id]) ? ', positioning ' + Math.round(num(cfg.positioning[id]) * 100) + '%' : '') + ', weight ' + Math.round(mkW * 100) + '%', { source: 'comp set' });
    } else if ((est = forecast(data, id, date)) && est.quality !== 'thin') {
      // nobody has checked this night yet: anchor to the comp-set forecast (normal prices × calendar strength), at half weight, clearly labelled
      var tF = est.median * (1 - cfg.market_commission) * (1 + num(cfg.positioning[id])); mkW = cfg.market_weight * 0.5 * weightOf(cfg, 'comp_price') * (est.quality === 'good' ? 1 : 0.7);
      apply('market', 'Market (forecast)', ((1 - mkW) * price + mkW * tF) / price, 'no prices for this night yet: forecast median ₹' + est.median + ' (₹' + est.p25 + '–₹' + est.p75 + ') from ' + est.competitors + ' competitors\' normal ' + (isWkend(date) ? 'Fri/Sat' : 'weekday') + ' prices' + (est.calendar > 1.01 ? ' × calendar ' + est.calendar : '') + ', weight ' + Math.round(mkW * 100) + '%', { source: 'comp set (forecast)' });
      inputs[inputs.length - 3] = Object.assign({}, inputs[inputs.length - 3], { status: 'estimated', fresh: 0.5, note: 'forecast from ' + est.competitors + ' competitors over ' + est.nights_seen + ' checked nights (' + est.quality + ')' });
    } else if ((est = marketEstimate(data, id, date, cfg, cx.now)) && est.fresh > 0) {
      // nobody has checked this night yet: anchor to nearby checked nights of the same kind, at half weight, clearly labelled
      var tEst = est.median * (1 - cfg.market_commission) * (1 + num(cfg.positioning[id])); mkW = cfg.market_weight * 0.5 * weightOf(cfg, 'comp_price') * est.fresh;
      apply('market', 'Market (estimated)', ((1 - mkW) * price + mkW * tEst) / price, 'no prices for this night yet: median ₹' + Math.round(est.median) + ' of ' + est.nights + ' nearby ' + (new Date(t(date)).getUTCDay() >= 5 ? 'Fri/Sat' : 'weekday') + ' nights, weight ' + Math.round(mkW * 100) + '%', { source: 'comp set (estimate)' });
      inputs[inputs.length - 3] = Object.assign({}, inputs[inputs.length - 3], { status: 'estimated', fresh: est.fresh * 0.5, note: 'estimated from ' + est.nights + ' nearby nights (seen ' + est.latest + ')' });
    }
    // market momentum: competitors raising or cutting prices for this same night since the last scans (capped ±5%)
    var mo = momentum(data, id, date, cfg, cx.now, cx.today);
    if (mo && Math.abs(mo.change) >= 0.05) apply('momentum', 'Market momentum', 1 + clamp(mo.change * 0.5, -0.05, 0.05), 'comp-set median ₹' + Math.round(mo.from) + ' → ₹' + Math.round(mo.to) + ' since ' + mo.since, { source: 'comp set' });
    // demand spike seen in the market itself: this night well above nearby nights, or half the comp set sold out
    var rel = relativeIndex(data, id, date, cfg, cx.now), spike = (rel && rel.index >= 1.2) || (mk.sellout != null && mk.seen >= 4 && mk.sellout >= 0.5);
    var comp = 0, own = cfg.use_own_history ? ownC.share : 0;
    if (mk.sellout != null && mk.seen >= 3 && mk.fresh > 0) {
      var w = weightOf(cfg, 'comp_avail') * mk.fresh;
      comp = mk.sellout >= cfg.compression.high_sellout ? 0.10 * w : mk.sellout >= cfg.compression.mid_sellout ? 0.05 * w : (mk.sellout <= 0.1 && lead <= 3 && own < 0.3 ? -0.03 * w : 0);
      apply('compression', 'Market compression', 1 + clamp(comp, -cfg.caps.compression, cfg.caps.compression), Math.round(mk.sellout * 100) + '% of the comp set sold out', { source: 'comp set' });
    }
    // 7. lead-time band
    var band = Mx.leadBand(lead, cfg.lead_bands); apply('lead', 'Lead time ' + band.label, 1 + num(cfg.lead[band.id]), 'setting for ' + band.label, { source: 'settings' });
    // 8. guardrails: floor/ceiling, max change vs yesterday's recommendation (except hard events)
    var floor = has(vs.floor) ? num(vs.floor) : cx.base * cfg.floor_pct, mega = v1.factors.some(function (fct) { return fct.key === 'event' && /mega/i.test(fct.basis); });
    var ceiling = has(vs.ceiling) ? num(vs.ceiling) : cx.base * (mega ? cfg.mega_ceiling_pct : cfg.ceiling_pct);
    var prev = opts.noPrev ? null : prevRec(data, id, date, cx.today), guarded = price;
    if (prev && num(prev.price) > 0 && !hardEvent) {
      var lim = num(prev.price) * cfg.max_daily_change, lo = num(prev.price) - lim, hi = num(prev.price) + lim;
      if (guarded < lo || guarded > hi) { guarded = clamp(guarded, lo, hi); reasons.push('Limited to ±' + Math.round(cfg.max_daily_change * 100) + '% vs yesterday (₹' + num(prev.price) + ')'); }
    }
    guarded = clamp(guarded, floor, ceiling);
    if (Math.abs(guarded - price) > 0.5) { steps.push({ key: 'guardrails', label: guarded > price ? 'Floor / limit' : 'Ceiling / limit', delta: guarded - price, basis: 'floor ₹' + Math.round(floor) + ', ceiling ₹' + Math.round(ceiling) }); price = guarded; }
    var night = Math.round(price / cfg.round) * cfg.round;
    // 9. confidence 0–100: coverage and freshness of weighted signals, comp sample, own history
    var ext = inputs.filter(function (x) { return BY_ID[x.id] && BY_ID[x.id].kind !== 'own'; }), wAll = 0, wLive = 0;
    ext.forEach(function (x) { var w = has(x.weight) ? x.weight : weightOf(cfg, x.id); wAll += w; wLive += w * (x.fresh || 0); });
    var confidence = Math.round(clamp(30 + 35 * (wAll ? wLive / wAll : 0) + 20 * Math.min(1, mk.n / 6) + 15 * (cfg.use_own_history ? Math.min(1, (cx.v1.realisedNights || 0) / 30) : Math.min(1, mk.seen / 6)), 0, 100));
    var missing = ext.filter(function (x) { return !x.fresh; }).map(function (x) { return BY_ID[x.id].label; });
    if (confidence < 50) reasons.push('Low confidence: ' + (missing.length ? 'missing ' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? ' and ' + (missing.length - 3) + ' more' : '') : 'little own history'));
    var spread = confidence >= 75 ? 0.06 : confidence >= 50 ? 0.10 : 0.16;
    // 10. booking-time slot ladder (tonight and tomorrow, unsold)
    var high = (mk.sellout != null && mk.sellout >= cfg.compression.mid_sellout) || own >= cfg.compression.low_own, slotTable = null, slotNow = null;
    if (lead <= 1 && !v1.booked && !v1.blocked) {
      var tbl = high ? cfg.slots.high : lead === 0 ? cfg.slots.tonight : cfg.slots.tomorrow;
      slotTable = Mx.SLOTS.map(function (s) { var p = Math.round(clamp(night * (1 + num(tbl[s[0]])), floor, ceiling) / cfg.round) * cfg.round; return { id: s[0], from: s[1], to: s[2], label: s[3], price: p, step: num(tbl[s[0]]) }; });
      if (opts.slot) slotNow = slotTable.filter(function (s) { return s.id === opts.slot; })[0];
    }
    var net = slotNow ? slotNow.price : night;
    return { date: date, property: id, lead: lead, lead_band: band.id, price: net, night_price: night, low: Math.round(net * (1 - spread) / cfg.round) * cfg.round, high: Math.round(net * (1 + spread) / cfg.round) * cfg.round,
      confidence: confidence, steps: steps, inputs: inputs, reasons: reasons, market: { forecast: forecastSafe(data, id, date), n: mk.n, seen: mk.seen, min: mk.min, p25: mk.p25, median: mk.median, p75: mk.p75, max: mk.max, sellout: mk.sellout, hotel_median: mk.hotel_median, latest: mk.latest, rows: mk.rows, estimate: est, momentum: mo, spike: !!spike, relative: rel, position: position(mk, channels(net, cfg).direct.price) },
      channels: channels(net, cfg), slots: slotTable, slot: slotNow ? slotNow.id : null, compression: high ? 'high' : 'low', booked: v1.booked, blocked: v1.blocked, event: eventPresent, hard_event: hardEvent, floor: Math.round(floor), ceiling: Math.round(ceiling),
      demand_index: Math.round((1 + demand + calLift) * 100) / 100, prev: prev ? num(prev.price) : null };
  }
  /** Prices to enter per channel for a net target, plus what AP Villas keeps on each. Direct is the guest's best deal. */
  function channels(net, cfg) {
    var r = cfg.round, out = {}, lowest = Infinity;
    Object.keys(cfg.commission).forEach(function (k) { var c = clamp(num(cfg.commission[k]), 0, 0.5), p = Math.ceil(net / (1 - c) / r) * r; out[k] = { price: p, commission: c, net: Math.round(p * (1 - c)) }; lowest = Math.min(lowest, p); });
    var d = Math.max(net, Math.round(lowest * (1 - num(cfg.direct_discount)) / r) * r);   // never below the net target
    out.direct = { price: d, commission: 0, net: d };
    return out;
  }
  function slotNowId(data) { var M_ = M(), ts = data.serverTime || new Date().toISOString(), hm = new Date(Date.parse(ts) + 330 * 60000).toISOString().slice(11, 16); return M_.slotAt(hm).id; }
  /** Today card for a property: tonight and tomorrow at the current slot, next step time, top reasons. */
  function today(data, propertyId) {
    var cx = ctxFor(data, propertyId); if (!cx) return null;
    var slot = slotNowId(data), M_ = M(), nights = [0, 1].map(function (i) { return quote(data, cx, add(cx.today, i), { slot: slot }); });
    var cur = M_.SLOTS.filter(function (s) { return s[0] === slot; })[0], idx = M_.SLOTS.indexOf(cur), next = M_.SLOTS[idx + 1];
    nights.forEach(function (q) {
      q.top = q.steps.filter(function (s) { return !s.total && s.key !== 'guardrails'; }).sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); }).slice(0, 3).map(function (s) { return s.label + ' ' + (s.delta >= 0 ? '+' : '−') + '₹' + Math.abs(Math.round(s.delta)); });
      if (q.slots && next) { var ns = q.slots.filter(function (s) { return s.id === next[0]; })[0]; q.next_step = ns && ns.price !== q.price ? { at: next[1], price: ns.price } : null; }
    });
    return { property: propertyId, name: cx.prop.name, slot: slot, slot_label: cur ? cur[3] : '', computed_at: data.serverTime || new Date().toISOString(), tonight: nights[0], tomorrow: nights[1] };
  }
  /** 90-night calendar (or n nights) for a property. */
  function calendar(data, propertyId, n) {
    var cx = ctxFor(data, propertyId); if (!cx) return null;
    var out = []; for (var i = 0; i < (n || 90); i++) out.push(quote(data, cx, add(cx.today, i)));
    return { property: propertyId, name: cx.prop.name, base: cx.base, rows: out };
  }
  /** Recommendation rows to store (only nights whose price or confidence band changed since the last stored one). */
  function toStore(data, cal, runId) {
    var latest = {}; (data.recommendations || []).forEach(function (r) { var k = r.property + '|' + String(r.for_date).slice(0, 10); if (!latest[k] || r.computed_at > latest[k].computed_at) latest[k] = r; });
    return cal.rows.filter(function (q) { var p = latest[q.property + '|' + q.date]; return !p || num(p.price) !== q.price || Math.abs(num(p.confidence) - q.confidence) >= 10; })
      .map(function (q) { return { rec_id: runId + '-' + q.property + '-' + q.date, computed_at: data.serverTime || new Date().toISOString(), property: q.property, for_date: q.date, price: q.price, low: q.low, high: q.high, confidence: q.confidence,
        channels: JSON.stringify(Object.keys(q.channels).reduce(function (o, k) { o[k] = q.channels[k].price; return o; }, {})),
        factors: JSON.stringify(q.steps.map(function (s) { return [s.key, Math.round(s.delta), s.basis]; })), inputs: JSON.stringify(q.inputs.map(function (x) { return [x.id, x.status, x.index == null ? '' : x.index]; })), run_id: runId }; });
  }

  // ------------------------------------------------------------ alerts ------------------------------------------------------------
  /** Alert candidates from two calendars (now vs the last stored recommendations) and signal health. Each has a stable key for de-duplication. */
  function alerts(data, cals, healthRows) {
    var cfg = settings(data), out = [], latest = {};
    (data.recommendations || []).forEach(function (r) { var k = r.property + '|' + String(r.for_date).slice(0, 10); if (!latest[k] || r.computed_at > latest[k].computed_at) latest[k] = r; });
    cals.forEach(function (cal) {
      cal.rows.slice(0, 14).forEach(function (q) {
        var p = latest[q.property + '|' + q.date], ch = p ? pct(q.price, num(p.price)) : null;
        if (ch != null && Math.abs(ch) > cfg.alerts.rec_move) out.push({ key: 'rec|' + q.property + '|' + q.date + '|' + q.price, type: 'price', text: cal.name + ' ' + q.date + ': recommended ₹' + q.price + ' (' + (ch > 0 ? '+' : '') + Math.round(ch * 100) + '% vs ₹' + num(p.price) + ')' });
        if (q.market.spike && !q.booked && !q.blocked) out.push({ key: 'spike|' + q.property + '|' + q.date, type: 'spike', text: cal.name + ' ' + q.date + ': competitors price this night well above nearby nights or half are sold out (market-detected demand)' });
        if (q.market.sellout != null && q.market.seen >= 3 && q.market.sellout > cfg.alerts.sellout && !q.booked) out.push({ key: 'sell|' + q.property + '|' + q.date, type: 'sellout', text: cal.name + ' ' + q.date + ': ' + Math.round(q.market.sellout * 100) + '% of competitors sold out and you are unsold' });
      });
    });
    if (cfg.alerts.stale) (healthRows || []).filter(function (h) { return h.status === 'expired'; }).forEach(function (h) { out.push({ key: 'stale|' + h.id + '|' + String(h.fetched_at).slice(0, 10), type: 'stale', text: 'Signal "' + h.label + '" is past 2× its freshness limit (last ' + (h.fetched_at || 'never') + ')' }); });
    return out;
  }

  // ------------------------------------------------------------ learning loop and backtest ------------------------------------------------------------
  /** Past nights: the last recommendation made before the night vs what happened (booked or not, realised net). */
  function backtest(data, propertyId, from, to) {
    var Mx = M(), rows = [], f = { property: propertyId };
    for (var d = from; d <= to; d = add(d, 1)) {
      var recs = (data.recommendations || []).filter(function (r) { return r.property === propertyId && String(r.for_date).slice(0, 10) === d && String(r.computed_at).slice(0, 10) <= d; }).sort(function (a, b) { return a.computed_at < b.computed_at ? 1 : -1; });
      var m = Mx.compute(data, d, d, f), dec = (data.price_decisions || []).filter(function (x) { return x.property === propertyId && String(x.for_date).slice(0, 10) === d; }).pop();
      rows.push({ date: d, recommended: recs[0] ? num(recs[0].price) : null, set: dec ? num(dec.set_price) : null, booked: m.occupied_nights > 0, realised: m.adr || null, error: recs[0] && m.adr ? pct(m.adr, num(recs[0].price)) : null });
    }
    var withRec = rows.filter(function (r) { return r.recommended != null; }), sold = withRec.filter(function (r) { return r.booked; });
    return { rows: rows, nights: rows.length, with_rec: withRec.length, booked: sold.length, mape: sold.length ? sold.reduce(function (s, r) { return s + Math.abs(r.error || 0); }, 0) / sold.length : null };
  }
  /** Which factors moved with bookings: average ₹ push of each factor on nights that sold vs nights that did not (needs 10+ of each). */
  function learning(data, propertyId, from, to) {
    var bt = backtest(data, propertyId, from, to), recBy = {};
    (data.recommendations || []).forEach(function (r) { if (r.property !== propertyId) return; var d = String(r.for_date).slice(0, 10); if (String(r.computed_at).slice(0, 10) <= d && (!recBy[d] || r.computed_at > recBy[d].computed_at)) recBy[d] = r; });
    var agg = {};
    bt.rows.forEach(function (r) { var rec = recBy[r.date]; if (!rec) return; var fs = []; try { fs = JSON.parse(rec.factors || '[]'); } catch (e) {} fs.forEach(function (f) { if (f[0] === 'base') return; var a = agg[f[0]] = agg[f[0]] || { factor: f[0], sold: [], unsold: [] }; (r.booked ? a.sold : a.unsold).push(num(f[1])); }); });
    var avg = function (a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; };
    var out = Object.keys(agg).map(function (k) { var a = agg[k]; return { factor: k, sold_n: a.sold.length, unsold_n: a.unsold.length, push_sold: avg(a.sold), push_unsold: avg(a.unsold), enough: a.sold.length >= 10 && a.unsold.length >= 10 }; });
    out.forEach(function (o) { o.suggestion = !o.enough ? 'not enough nights yet (need 10 sold and 10 unsold)' : o.push_unsold > o.push_sold + 150 ? 'pushes prices up on nights that do not sell: consider lowering its weight' : o.push_sold > o.push_unsold + 150 ? 'pushes up on nights that sell: weight looks right or could rise' : 'no clear effect'; });
    return { backtest: bt, factors: out };
  }

  return { DEFAULTS: DEFAULTS, SIGNALS: SIGNALS, settings: settings, freshness: freshness, signalAt: signalAt, health: health,
    normName: normName, platformOf: platformOf, marketEstimate: marketEstimate, momentum: momentum, relativeIndex: relativeIndex, forecast: forecast, forecastAccuracy: forecastAccuracy, marketModel: marketModel, marketAnalytics: marketAnalytics, calIndex: calIndex, similarity: similarity, candidates: candidates, rerank: rerank, compSet: compSet, marketAt: marketAt,
    ctxFor: ctxFor, ownCompression: ownCompression, quote: quote, channels: channels, today: today, calendar: calendar, toStore: toStore, alerts: alerts, backtest: backtest, learning: learning, slotNowId: slotNowId };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FoDesk;
