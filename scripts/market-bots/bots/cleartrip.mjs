// Cleartrip bot: city page (/hotels/hotels-in-ujjain) for discovery; /hotels/details/<slug> with ?c=DDMMYY|DDMMYY for the night's price.
// Cleartrip's /hotels/results search pages are disallowed by robots.txt and never used.
import { read, cards } from '../extract.mjs';
import { harvestCards } from '../core.mjs';
const c6 = d => d.slice(8, 10) + d.slice(5, 7) + d.slice(2, 4);
const label = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) + "'" + d.slice(2, 4);
export default {
  id: 'cleartrip', platform: 'Cleartrip', match: u => /cleartrip\.com\/hotels\/details\//.test(u),
  async discover(s) {
    const p = await s.open('https://www.cleartrip.com/hotels/hotels-in-ujjain', 7000, page => harvestCards(page, 'a[href*="/hotels/details/"]'));
    if (!p) return [];
    return cards(p.extra).map(c => Object.assign(c, { price: null }));
  },
  async quote(s, url, date, adults) {
    const next = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    const p = await s.open(url.split('?')[0] + `?c=${c6(date)}|${c6(next)}&r=${Math.min(adults, 3)},0`, 8000);
    if (!p) return null;
    s.last = p;
    return Object.assign(read.taxLine(p.text, label(date)), { title: (p.title || '').split('|')[0].trim() });
  },
};
