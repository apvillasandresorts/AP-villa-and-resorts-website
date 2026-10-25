// Signal adapter: public holidays and long weekends from Google's public "Holidays in India" calendar (public iCal feed).
// Index applies to the nights guests stay: the night before a holiday and the holiday night; long weekends add the bridge nights.
export const id = 'holiday', sla_h = 240, weight = 0.8, source = 'Google Calendar: Holidays in India (public iCal)', terms = 'public feed, read weekly';
export const URL = 'https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics';
export async function fetchRaw(fetchFn = fetch) { const r = await fetchFn(URL); if (r.status === 403 || r.status === 429) return { blocked: r.status }; if (!r.ok) throw new Error('holidays HTTP ' + r.status); return r.text(); }
export function parse(ics) {
  return ics.replace(/\r\n[ \t]/g, '').split('BEGIN:VEVENT').slice(1).map(b => {
    const g = k => (b.match(new RegExp('^' + k + '[^:]*:(.*)$', 'm')) || [])[1] || '';
    const ds = g('DTSTART').trim(); return { date: ds.slice(0, 4) + '-' + ds.slice(4, 6) + '-' + ds.slice(6, 8), name: g('SUMMARY').trim(), kind: /Public holiday/i.test(g('DESCRIPTION')) ? 'public' : /Restricted/i.test(g('DESCRIPTION')) ? 'restricted' : 'observance' };
  }).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
}
const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10), wd = d => new Date(d + 'T00:00:00Z').getUTCDay();
export function normalise(raw, fetchedAt = new Date().toISOString(), today = fetchedAt.slice(0, 10), days = 180) {
  if (raw && raw.blocked) return [{ signal_id: id, for_date: '', status: 'blocked', source_url: URL, fetched_at: fetchedAt, notes: 'HTTP ' + raw.blocked }];
  const end = add(today, days), nights = {};
  const put = (d, idx, note) => { if (d < today || d > end) return; if (!nights[d] || nights[d].index < idx) nights[d] = { index: idx, note }; };
  parse(raw).filter(e => e.kind !== 'observance' && e.date >= add(today, -3) && e.date <= end).forEach(e => {
    const base = e.kind === 'public' ? 1.15 : 1.05, w = wd(e.date);
    put(add(e.date, -1), base, e.name + ' (eve)'); put(e.date, base, e.name);
    if (e.kind === 'public' && (w === 1 || w === 5)) { const fri = w === 1 ? add(e.date, -3) : e.date; [0, 1, 2].forEach(i => put(add(fri, i - (w === 5 ? 1 : 0)), 1.12, 'Long weekend: ' + e.name)); }
    if (e.kind === 'public' && (w === 2 || w === 4)) put(w === 2 ? add(e.date, -2) : add(e.date, 1), 1.08, 'Bridge to ' + e.name);
  });
  return Object.entries(nights).sort().map(([d, o]) => ({ signal_id: id, for_date: d, index: o.index, raw_value: o.note, source_url: URL, fetched_at: fetchedAt, status: 'live', notes: o.note }));
}
