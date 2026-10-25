// Apify (free plan: $5 credit/month, key in GitHub secret APIFY_TOKEN). Runs ready-made public scrapers in Apify's cloud:
// Airbnb discovery + dated prices for Ujjain homes (Airbnb's own search pages are off-limits to our bots by robots.txt),
// and Booking.com prices as a fallback when our Booking bot is blocked. Actor ids can be changed with env vars.
import { km, MAHAKAL } from '../extract.mjs';
const ACT = { airbnb: process.env.APIFY_AIRBNB_ACTOR || 'tri_angle~airbnb-scraper', booking: process.env.APIFY_BOOKING_ACTOR || 'voyager~booking-scraper' };
async function run(token, actor, input, maxItems) {
  const u = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=240&maxItems=${maxItems}`;
  const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error('Apify ' + actor + ': HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160));
  return r.json();
}
const num = v => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return isFinite(n) && n > 0 ? n : null; };
export function apify(token) {
  return {
    /** Airbnb homes in Ujjain for one night and group size: url, name, coordinates, bedrooms, rating, price for the stay (or sold out = absent). */
    async airbnb(date, next, adults, maxItems = 60) {
      const items = await run(token, ACT.airbnb, { locationQueries: ['Ujjain, Madhya Pradesh, India'], checkIn: date, checkOut: next, adults, currency: 'INR', locale: 'en-IN', maxItems }, maxItems);
      return (items || []).map(x => {
        const c = x.coordinates || x.location || {}, g = (c.latitude || c.lat) ? { lat: Number(c.latitude || c.lat), lng: Number(c.longitude || c.lng) } : null;
        const id = String(x.id || x.roomId || (String(x.url || '').match(/rooms\/(\d+)/) || [])[1] || '');
        const price = num(x.price && (x.price.price || x.price.amount || x.price.total || x.price.label)) || num(x.pricing && x.pricing.rate && x.pricing.rate.amount) || num(x.price);
        return id ? { url: 'https://www.airbnb.co.in/rooms/' + id, name: String(x.name || x.title || 'Airbnb ' + id).slice(0, 120), distance_km: km(g, MAHAKAL),
          bedrooms: num(x.bedrooms) || num((String(x.subDescription && x.subDescription.items || x.roomType || '').match(/(\d+)\s*bedroom/i) || [])[1]), rating: num(x.rating && (x.rating.guestSatisfaction || x.rating.value) || x.stars), reviews: num(x.rating && x.rating.reviewsCount || x.numberOfReviews),
          price, type: /entire|home|villa|apartment|house|flat/i.test(String(x.roomType || x.propertyType || '')) ? 'homestay' : 'room' } : null;
      }).filter(Boolean);
    },
    async booking(date, next, adults, maxItems = 40) {
      const items = await run(token, ACT.booking, { search: 'Ujjain', checkIn: date, checkOut: next, adults, rooms: 1, currency: 'INR', language: 'en-gb', maxItems, sortBy: 'distance_from_search' }, maxItems);
      return (items || []).map(x => ({ url: String(x.url || '').split('?')[0], name: String(x.name || '').slice(0, 120), price: num(x.price), rating: num(x.rating), reviews: num(x.reviews),
        distance_km: x.location && x.location.lat ? km({ lat: Number(x.location.lat), lng: Number(x.location.lng) }, MAHAKAL) : null, type: x.type || 'hotel' })).filter(x => x.url && x.name);
    },
  };
}
