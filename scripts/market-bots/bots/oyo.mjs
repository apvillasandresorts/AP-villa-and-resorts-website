// OYO bot: city page (/hotels-in-ujjain/, allowed) for discovery; property pages /<id>/ with dates for the night's price (before taxes).
// OYO's /search pages are disallowed by robots.txt and never used.
import { read, cards } from '../extract.mjs';
import { harvestCards } from '../core.mjs';
const dmy = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
const label = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/^(\w+) /, '$1, ');
export default {
  id: 'oyo', platform: 'OYO', match: u => /oyorooms\.com\/\d+\/?$/.test(u.split('?')[0]),
  async discover(s) {
    const p = await s.open('https://www.oyorooms.com/hotels-in-ujjain/', 7000, page => harvestCards(page, 'a[href]'));
    if (!p) return [];
    return cards(p.extra).filter(c => /oyorooms\.com\/\d+\/?$/.test(c.href) && c.price).map(c => Object.assign(c, { price: null }));   // city-page prices are for default dates: discovery only
  },
  async quote(s, url, date, adults) {
    const next = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    const p = await s.open(url.split('?')[0] + `?checkin=${dmy(date)}&checkout=${dmy(next)}&rooms=1&guests=${Math.min(adults, 3)}`, 7000);
    if (!p) return null;
    s.last = p;
    void label;
    return Object.assign(read.oyo(p.text), { title: (p.title || '').split(',')[0].trim() });
  },
};
