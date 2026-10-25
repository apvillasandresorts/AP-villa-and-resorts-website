// Booking.com bot: hotels and homestays. One dated search page around the temple gives prices for ~25 properties (discovery + hotel index);
// each comp-set property is then read on its own page for the night. Both page types are allowed by robots.txt.
import { read, cards, coords, km, MAHAKAL } from '../extract.mjs';
import { addDays, harvestCards } from '../core.mjs';
const q = (date, adults) => `checkin=${date}&checkout=${addDays(date, 1)}&group_adults=${adults}&no_rooms=1&group_children=0&selected_currency=INR&lang=en-gb`;
export default {
  id: 'booking', platform: 'Booking.com', match: u => /booking\.com\/hotel\/in\//.test(u),
  async discover(s, date) {
    const p = await s.open(`https://www.booking.com/searchresults.en-gb.html?ss=Mahakaleshwar%20Jyotirlinga%2C%20Ujjain&${q(date, 2)}&order=distance_from_search`, 7000, page => harvestCards(page, 'a[data-testid="title-link"], a[href*="/hotel/in/"]'));
    if (!p) return [];
    return cards(p.extra).filter(c => /booking\.com\/hotel\/in\//.test(c.href)).map(c => Object.assign(c, { date, adults: 2, taxes_included: 'no' }));
  },
  async quote(s, url, date, adults) {
    const p = await s.open(url.split('?')[0] + '?' + q(date, adults), 7000);
    if (!p) return null;
    const r = read.booking(p.text, p.html), c = coords(p.html);
    return Object.assign(r, { distance_km: km(c, MAHAKAL), title: p.title.split(',')[0].trim() });
  },
};
