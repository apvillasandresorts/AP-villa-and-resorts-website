// Signal adapter: weather for Ujjain from MET Norway Locationforecast 2.0 (free, CC BY 4.0, commercial use allowed with credit,
// requires an identifying User-Agent). Only ever dampens demand: extreme heat or heavy rain on a night lowers its index.
export const id = 'weather', sla_h = 12, weight = 0.5, source = 'MET Norway Locationforecast 2.0', terms = 'CC BY 4.0; identifying User-Agent; ≤20 req/s';
export const URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=23.18&lon=75.77';
export async function fetchRaw(fetchFn = fetch) {
  const r = await fetchFn(URL, { headers: { 'User-Agent': 'APVillasFounderOS/1.0 (https://www.apvillasandresorts.in; apvillasandresorts@gmail.com)' } });
  if (r.status === 403 || r.status === 429) return { blocked: r.status };
  if (!r.ok) throw new Error('MET Norway HTTP ' + r.status);
  return r.json();
}
/** Per IST date: max temperature and total precipitation, turned into an index (1.00 = normal). */
export function normalise(raw, fetchedAt = new Date().toISOString()) {
  if (raw.blocked) return [{ signal_id: id, for_date: '', status: 'blocked', source_url: URL, fetched_at: fetchedAt, notes: 'HTTP ' + raw.blocked }];
  const days = {};
  for (const s of raw.properties.timeseries) {
    const d = new Date(Date.parse(s.time) + 330 * 60000).toISOString().slice(0, 10), o = (days[d] = days[d] || { tmax: -99, rain: 0, hours: 0 });
    o.tmax = Math.max(o.tmax, s.data.instant.details.air_temperature);
    const p = s.data.next_1_hours?.details?.precipitation_amount ?? (s.data.next_6_hours ? s.data.next_6_hours.details.precipitation_amount / 6 : 0);
    o.rain += p; o.hours++;
  }
  return Object.entries(days).filter(([, o]) => o.hours >= 4).map(([d, o]) => {
    const heat = o.tmax >= 42 ? 0.85 : o.tmax >= 40 ? 0.92 : 1, wet = o.rain >= 50 ? 0.85 : o.rain >= 20 ? 0.93 : 1;
    return { signal_id: id, for_date: d, index: Math.round(Math.min(heat, wet) * 100) / 100, raw_value: Math.round(o.tmax) + '°C max, ' + Math.round(o.rain) + ' mm rain', source_url: URL, fetched_at: fetchedAt, status: 'live',
      notes: heat < 1 ? 'extreme heat' : wet < 1 ? 'heavy rain' : 'normal weather · MET Norway, CC BY 4.0' };
  });
}
