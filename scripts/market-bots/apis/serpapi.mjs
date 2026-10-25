// Google Hotels through SerpApi (free plan: 250 searches/month, key in GitHub secret SERPAPI_KEY).
// Gives, per property, the price on each OTA Google compares (MakeMyTrip, Goibibo, Agoda, Booking.com, Cleartrip, Trip.com, Expedia, the hotel itself),
// plus hotels and vacation rentals near the temple with coordinates, rating and reviews. Budget-aware: checks searches left first.
import { km, MAHAKAL } from '../extract.mjs';
const API = 'https://serpapi.com/search.json';
const PLATFORM = s => /makemytrip/i.test(s) ? 'MakeMyTrip' : /goibibo/i.test(s) ? 'Goibibo' : /agoda/i.test(s) ? 'Agoda' : /booking\.com/i.test(s) ? 'Booking.com' : /cleartrip/i.test(s) ? 'Cleartrip'
  : /trip\.com/i.test(s) ? 'Trip.com' : /expedia|hotels\.com/i.test(s) ? 'Expedia' : /airbnb/i.test(s) ? 'Airbnb' : /yatra/i.test(s) ? 'Yatra' : /easemytrip/i.test(s) ? 'EaseMyTrip' : /oyo/i.test(s) ? 'OYO' : String(s || 'Other').slice(0, 30);
export function serpApi(key, log) {
  let used = 0;
  async function get(params) {
    const u = new URL(API); Object.entries(Object.assign({ api_key: key }, params)).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u, { signal: AbortSignal.timeout(60000) }); used++;
    const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error('SerpApi: ' + (j.error || r.status));
    return j;
  }
  return {
    get used() { return used; },
    async left() { const r = await fetch('https://serpapi.com/account.json?api_key=' + encodeURIComponent(key), { signal: AbortSignal.timeout(20000) }); const j = await r.json().catch(() => ({})); return Number(j.plan_searches_left ?? j.total_searches_left ?? 0); },
    /** Properties near the temple for a night: name, kind, coordinates, distance, rating, lowest price, Google's per-OTA prices when listed. */
    async list(date, next, adults, rentals) {
      const j = await get({ engine: 'google_hotels', q: rentals ? 'Ujjain' : 'hotels near Mahakaleshwar Jyotirlinga Ujjain', check_in_date: date, check_out_date: next, adults, currency: 'INR', gl: 'in', hl: 'en', vacation_rentals: rentals ? 'true' : 'false' });
      return (j.properties || []).map(p => {
        const g = p.gps_coordinates ? { lat: p.gps_coordinates.latitude, lng: p.gps_coordinates.longitude } : null;
        return { name: p.name, kind: rentals ? 'vacation rental' : (p.type || 'hotel'), token: p.property_token, link: p.link || '', distance_km: km(g, MAHAKAL), rating: p.overall_rating || null, reviews: p.reviews || null,
          bedrooms: p.essential_info ? Number((p.essential_info.join(' ').match(/(\d+)\s*bedroom/i) || [])[1]) || null : null, sleeps: p.essential_info ? Number((p.essential_info.join(' ').match(/sleeps\s*(\d+)/i) || [])[1]) || null : null,
          lowest: p.rate_per_night ? p.rate_per_night.extracted_lowest || null : null,
          prices: (p.prices || []).map(x => ({ platform: PLATFORM(x.source), price: x.rate_per_night ? x.rate_per_night.extracted_lowest : null })).filter(x => x.price > 0) };
      });
    },
    /** One property's prices on every OTA Google shows, for a night. */
    async property(token, date, next, adults) {
      const j = await get({ engine: 'google_hotels', q: 'Ujjain', property_token: token, check_in_date: date, check_out_date: next, adults, currency: 'INR', gl: 'in', hl: 'en' });
      const all = [].concat(j.featured_prices || [], j.prices || []);
      const seen = {}; return all.map(x => ({ platform: PLATFORM(x.source), price: x.rate_per_night ? x.rate_per_night.extracted_lowest : null, link: x.link || '' }))
        .filter(x => x.price > 0 && !seen[x.platform] && (seen[x.platform] = 1));
    },
  };
}
