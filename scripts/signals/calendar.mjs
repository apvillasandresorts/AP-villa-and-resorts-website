// Signal adapter: Hindu calendar for Ujjain computed with astronomy-engine (MIT). Tithi at sunrise in Ujjain; lunar months
// (amanta) from the sidereal sign of the sun at the new moon (Lahiri ayanamsa); purnimanta month names for North India.
// Festival rules: Diwali = amavasya at sunset (Ashwin amanta); Mahashivratri = Krishna chaturdashi of Magha (amanta) at night;
// Shravan Mondays and Mahakal Sawari = Mondays of purnimanta Shravan (and Bhadrapada for Sawari). Weekly cross-checked by the news job.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('../node_modules/astronomy-engine');
export const id = 'calendar', sla_h = 24 * 35, weight = 1.0, source = 'astronomy-engine (MIT), sunrise in Ujjain', terms = 'open licence, computed locally';
export const SOURCE_URL = 'https://github.com/cosinekitty/astronomy';
const OBS = new A.Observer(23.1793, 75.7849, 494);
const MONTHS = ['Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada', 'Ashwin', 'Kartika', 'Margashirsha', 'Pausha', 'Magha', 'Phalguna'];
const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const elong = t => { const tt = A.MakeTime(t); return ((A.EclipticGeoMoon(tt).lon - A.SunPosition(tt).elon) % 360 + 360) % 360; };
export const tithiAt = date => Math.floor(elong(date) / 12) + 1;   // 1–15 Shukla, 16–30 Krishna (30 = Amavasya)
const ayanamsa = y => 23.85 + (y - 2000) * 0.01397;
/** Amanta month index (0 = Chaitra) for a moment: sidereal sun sign at the preceding new moon. */
function amantaMonth(date) {
  const nm = A.SearchMoonPhase(0, A.MakeTime(new Date(+date - 31 * 864e5)), 32);
  let prev = nm, s = nm; while (s && s.date <= date) { prev = s; s = A.SearchMoonPhase(0, A.MakeTime(new Date(+s.date + 864e5)), 32); }
  const sid = ((A.SunPosition(prev).elon - ayanamsa(prev.date.getUTCFullYear())) % 360 + 360) % 360, sign = Math.floor(sid / 30);   // 0 Mesha … 11 Meena
  return (sign + 1) % 12;   // new moon with the sun in Meena → Chaitra
}
export function day(dateStr) {
  const midnightIst = new Date(dateStr + 'T00:00:00+05:30');
  const rise = A.SearchRiseSet(A.Body.Sun, OBS, +1, midnightIst, 1).date, set = A.SearchRiseSet(A.Body.Sun, OBS, -1, midnightIst, 1).date, night = new Date(dateStr + 'T23:59:00+05:30');
  const ti = tithiAt(rise), am = amantaMonth(rise), krishna = ti > 15, pm = krishna ? (am + 1) % 12 : am;   // purnimanta name in Krishna paksha is the next month
  return { date: dateStr, weekday: new Date(dateStr + 'T00:00:00Z').getUTCDay(), tithi: ti, tithi_set: tithiAt(set), tithi_night: tithiAt(night), amanta: MONTHS[am], purnimanta: MONTHS[pm], paksha: krishna ? 'Krishna' : 'Shukla' };
}
const RULES = [   // [test, index, label]
  [x => x.amanta === 'Magha' && x.tithi_night === 29, 1.6, 'Mahashivratri'],
  [x => x.amanta === 'Ashwin' && x.tithi_set === 30 && x.tithi !== 30, 1.0, 'Diwali (Lakshmi Puja)'],   // effect left to data: Oct 2026 asking prices were not above a normal weekend
  [x => x.amanta === 'Kartika' && x.tithi === 14, 1.25, 'Vaikunth Chaturdashi (Hari Har Milan)'],
  [x => x.amanta === 'Kartika' && x.tithi === 15, 1.15, 'Kartik Purnima'],
  [x => x.amanta === 'Shravana' && x.tithi === 5, 1.25, 'Nag Panchami'],
  [x => x.amanta === 'Ashwin' && x.tithi >= 1 && x.tithi <= 9, 1.12, 'Navratri'],
  [x => x.weekday === 1 && x.purnimanta === 'Shravana', 1.35, 'Shravan Monday (Mahakal Sawari)'],
  [x => x.weekday === 1 && x.purnimanta === 'Bhadrapada' && x.paksha === 'Krishna', 1.25, 'Mahakal Sawari (Bhadrapada Monday)'],
  [x => x.purnimanta === 'Shravana', 1.12, 'Shravan month'],
  [x => x.amanta === 'Kartika', 1.05, 'Kartik month'],
  [x => x.tithi === 15 || x.tithi === 30, 1.05, x => x.tithi === 15 ? 'Purnima' : 'Amavasya'],
  [x => x.tithi === 13 || x.tithi === 28, 1.03, 'Pradosh'],
  [x => x.tithi === 11 || x.tithi === 26, 1.02, 'Ekadashi'],
  [x => x.weekday === 1, 1.03, 'Monday (Mahakal)'],
];
/** One signal row per night that is not ordinary (index ≠ 1 or a named festival), for the next `days` nights. */
export function normalise(today, days = 120, fetchedAt = new Date().toISOString()) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = add(today, i), x = day(d), hits = RULES.filter(r => r[0](x));
    if (!hits.length) continue;
    const best = hits.reduce((a, b) => (b[1] > a[1] ? b : a)), label = h => typeof h[2] === 'function' ? h[2](x) : h[2];
    out.push({ signal_id: id, for_date: d, index: best[1], raw_value: x.purnimanta + ' (purnimanta) ' + x.paksha + ' tithi ' + (x.tithi > 15 ? x.tithi - 15 : x.tithi), source_url: SOURCE_URL, fetched_at: fetchedAt, status: 'live',
      notes: hits.map(label).filter((v, j, a) => a.indexOf(v) === j).join(' · ') });
  }
  return out;
}
