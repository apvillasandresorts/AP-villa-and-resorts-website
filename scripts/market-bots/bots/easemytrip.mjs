// EaseMyTrip bot: the city page lists Ujjain hotels with links (discovery). Its hotel pages take dates only through the search flow,
// so EaseMyTrip contributes new competitors and links, not nightly prices (MakeMyTrip-group and EaseMyTrip prices come via Google Hotels).
import { cards } from '../extract.mjs';
import { harvestCards } from '../core.mjs';
export default {
  id: 'easemytrip', platform: 'EaseMyTrip', match: u => /easemytrip\.com\/hotels\/[a-z0-9-]+-\d+\/?$/.test(u.split('?')[0]),
  async discover(s) {
    const p = await s.open('https://www.easemytrip.com/hotels/hotels-in-ujjain/', 7000, page => harvestCards(page, 'a[href*="/hotels/"]'));
    if (!p) return [];
    // only real hotel cards (they show a price); the page also links other cities' hotels and offers
    return cards(p.extra).filter(c => /\/hotels\/[a-z0-9-]+-\d+\/?$/.test(c.href) && c.price).map(c => Object.assign(c, { price: null }));
  },
};
