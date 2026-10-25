// Agoda bot: the city page lists Ujjain properties (discovery, no prices); each property page with dates shows "from Rs. X".
import { read, cards, coords, km, MAHAKAL } from '../extract.mjs';
import { harvestCards } from '../core.mjs';
export default {
  id: 'agoda', platform: 'Agoda', match: u => /agoda\.com\/.*\/hotel\/ujjain-in\.html/.test(u),
  async discover(s) {
    const p = await s.open('https://www.agoda.com/en-gb/city/ujjain-in.html', 7000, page => harvestCards(page, 'a[href*="/hotel/ujjain-in.html"]'));
    if (!p) return [];
    return cards(p.extra.map(c => Object.assign(c, { text: c.text || c.name }))).filter(c => /\/hotel\/ujjain-in\.html/.test(c.href)).map(c => Object.assign(c, { price: null }));
  },
  async quote(s, url, date, adults) {
    const p = await s.open(url.split('?')[0] + `?checkIn=${date}&los=1&rooms=1&adults=${adults}&children=0&currency=INR`, 8000);
    if (!p) return null;
    const r = read.agoda(p.text), c = coords(p.html);
    return Object.assign(r, { distance_km: km(c, MAHAKAL), title: (p.title || '').split(/[|,(]/)[0].trim() });
  },
};
