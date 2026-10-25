// Airbnb bot: whole homes. Reads each known listing (/rooms/<id>, allowed by robots.txt) for a night and group size.
// Search pages (/s/...) are disallowed by robots.txt, so new Airbnb listings come from the Apify discovery feed, never from search.
import { read, coords, km, MAHAKAL } from '../extract.mjs';
import { addDays } from '../core.mjs';
export default {
  id: 'airbnb', platform: 'Airbnb', match: u => /airbnb\.[a-z.]+\/rooms\/\d+/.test(u),
  async quote(s, url, date, adults) {
    const id = url.match(/rooms\/(\d+)/)[1];
    const p = await s.open(`https://www.airbnb.co.in/rooms/${id}?check_in=${date}&check_out=${addDays(date, 1)}&adults=${adults}&currency=INR`, 6500);
    if (!p) return null;
    const q = read.airbnb(p.text), c = coords(p.html);
    return Object.assign(q, { distance_km: km(c, MAHAKAL), title: p.title.replace(/ - [^-]*Airbnb$/, '').trim() });
  },
};
