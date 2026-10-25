// Market bots · pure page-reading rules (no network). Each takes the visible page text (and sometimes HTML) and returns what the page
// really shows: a price for the requested night, sold out, or nothing. Never estimates. Tested in tests/market-bots.test.mjs.

export const MAHAKAL = { lat: 23.1828, lng: 75.7682 };   // Shri Mahakaleshwar Jyotirlinga

export function money(s) { const m = String(s || '').replace(/[,\s]/g, '').match(/(\d{3,7})/); return m ? Number(m[1]) : null; }
export function km(a, b) {
  if (!a || !b || !isFinite(a.lat) || !isFinite(a.lng)) return null;
  const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100;
}
/** Coordinates embedded in a page (JSON data, schema.org geo, Booking's data-atlas-latlng). Only accepted near Ujjain. */
export function coords(html) {
  const s = String(html || ''), tries = [
    /"lat(?:itude)?"\s*:\s*"?(2[2-4]\.\d+)"?\s*,\s*"(?:lng|lon|longitude)"\s*:\s*"?(7[4-7]\.\d+)/,
    /data-atlas-latlng="(2[2-4]\.\d+),(7[4-7]\.\d+)"/,
    /"latitude"\s*:\s*"?(2[2-4]\.\d+)"?[^}]{0,120}"longitude"\s*:\s*"?(7[4-7]\.\d+)/,
  ];
  for (const re of tries) { const m = s.match(re); if (m) return { lat: Number(m[1]), lng: Number(m[2]) }; }
  return null;
}
/** A challenge, block or error page: the bot must stop for that platform (never solve or bypass). */
export function challenged(text, title = '') {
  return /captcha|verify you are (a )?human|are you a robot|unusual traffic|access denied|request blocked|pardon our interruption|press (and|&) hold/i.test(String(text).slice(0, 4000) + ' ' + title);
}
const r = (price, extra) => Object.assign({ price: price && price > 0 ? price : null, sold_out: false, taxes_included: 'unknown' }, extra || {});

export const read = {
  /** Airbnb listing with dates: "₹3,800 for 1 night" / "Those dates are not available". */
  airbnb(text) {
    const t = String(text);
    if (/Those dates are not available/i.test(t)) return r(null, { sold_out: true });
    const m = t.match(/₹\s?([\d,]+)\s+for\s+1\s+night/i) || t.match(/₹\s?([\d,]+)\s*(?:\n|\s)*night/i);
    return r(m ? money(m[1]) : null, { taxes_included: 'yes' });   // Airbnb India shows the total incl. fees and taxes for the stay
  },
  /** Booking.com hotel page with dates: cheapest room "₹ 2,883" (+ taxes line) / "no availability" messages. */
  booking(text, html) {
    const t = String(text);
    if (/no availability|don't have any availability|sold out on our site|We have no availability/i.test(t) && !/₹\s?[\d,]{3,}\s*\n?\s*\+₹/.test(t)) return r(null, { sold_out: true });
    const prices = [...String(html || '').matchAll(/bui-price-display__value[^>]*>\s*₹\s?([\d,]+)/g)].map(m => money(m[1])).filter(Boolean);
    if (prices.length) return r(Math.min(...prices), { taxes_included: 'no' });
    const m = t.match(/Current price ₹\s?([\d,]+)/) || t.match(/₹\s?([\d,]+)\s*\n\s*\+₹\s?[\d,]+ taxes/);
    return r(m ? money(m[1]) : null, { taxes_included: 'no' });
  },
  /** Agoda hotel page with dates: "from Rs. 9,752" / sold-out banner. */
  agoda(text) {
    const t = String(text), m = t.match(/from\s+(?:Rs\.?|₹)\s?([\d,]+)/i);
    if (!m && /(sold out|no rooms available)[^\n]{0,60}(your dates|on these dates)/i.test(t) && !/room types have already sold out/i.test(t)) return r(null, { sold_out: true });
    return r(m ? money(m[1]) : null, { taxes_included: 'unknown' });
  },
  /** OYO / Cleartrip / EaseMyTrip style: the first price followed by a "+ ₹X taxes & fees" line, after the requested date label. */
  taxLine(text, dateLabel) {
    let t = String(text); if (dateLabel) { const i = t.indexOf(dateLabel); if (i >= 0) t = t.slice(i); }
    if (/sold out|no rooms? (are )?available|not available for (the )?selected dates/i.test(t.slice(0, 2500)) && !/\+\s?₹\s?[\d,]+\s*taxes/i.test(t.slice(0, 2500))) return r(null, { sold_out: true });
    const lines = t.split('\n').map(x => x.trim()).filter(Boolean);
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^₹\s?[\d,]{3,}$/.test(lines[i]) && /^\+\s?(?:₹\s?[\d,]+\s*taxes|taxes)/i.test(lines[i + 1])) {
        // sites put the struck-through "original" price next to the real one (OYO: ₹1475 / ₹8951 / + taxes): take the lowest of the run
        const run = []; for (let j = i; j >= 0 && /^₹\s?[\d,]{3,}$/.test(lines[j]); j--) run.push(money(lines[j]));
        return r(Math.min(...run), { taxes_included: 'no' });
      }
    }
    return r(null);
  },
};

/** City / listing pages: one card per property = a link to a detail page plus the first price inside the card. For discovery. */
export function cards(list) {
  // list: [{ href, name, text }] collected in the browser (text = the card's visible text)
  const seen = new Set(), out = [];
  for (const c of list || []) {
    const href = String(c.href || '').split('?')[0].split('#')[0]; if (!href || seen.has(href)) continue; seen.add(href);
    const lines = String(c.text || '').split('\n').map(x => x.trim()).filter(Boolean);
    const name = String(c.name || '').trim() || lines.find(l => l.length > 3 && !/₹|rating|review|km|off\b|deal/i.test(l)) || '';
    const priceLine = lines.find(l => /^(?:Book this Hotel at )?₹\s?[\d,]{3,}/i.test(l) && !/off|save|cashback/i.test(l));
    const rating = (String(c.text).match(/\b([3-5](?:\.\d)?)\s*(?:\/\s*5|★|rating|Excellent|Very good|Good)/i) || [])[1];
    const reviews = (String(c.text).match(/([\d,]+)\s+(?:reviews|ratings)/i) || [])[1];
    out.push({ href, name: name.slice(0, 120), price: priceLine ? money(priceLine.replace(/^Book this Hotel at /i, '')) : null, rating: rating ? Number(rating) : null, reviews: reviews ? Number(reviews.replace(/,/g, '')) : null });
  }
  return out.filter(c => c.name);
}

/** Bedrooms stated in a listing title or card ("2 BHK", "3BHK villa", "2 bedrooms"), or null. */
export function bedroomsOf(text) { const m = String(text || '').match(/\b([1-6])\s*-?\s*(?:bhk|bed\s?rooms?|bedrooms?|br)\b/i); return m ? Number(m[1]) : null; }
