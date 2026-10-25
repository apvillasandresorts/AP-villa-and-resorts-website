// Trip.com bot: hotel detail pages (/hotels/<city>-hotel-detail-<id>/..., allowed) for the night's price when a link is known
// (links arrive from Google Hotels). Trip.com list/search pages are disallowed by robots.txt and never used.
import { read } from '../extract.mjs';
import { addDays } from '../core.mjs';
export default {
  id: 'tripcom', platform: 'Trip.com', match: u => /trip\.com\/hotels\/[a-z-]+-hotel-detail-\d+/.test(u),
  async quote(s, url, date, adults) {
    const p = await s.open(url.split('?')[0] + `?checkin=${date}&checkout=${addDays(date, 1)}&adult=${adults}&children=0&crn=1&curr=INR`, 8000);
    if (!p) return null;
    s.last = p;
    const r = read.taxLine(p.text);
    if (r.price == null && !r.sold_out) { const m = p.text.match(/₹\s?([\d,]{3,})\s*(?:\n|\s)*(?:per night|\/night|avg\/night)/i); if (m) r.price = Number(m[1].replace(/,/g, '')); }
    return Object.assign(r, { title: (p.title || '').split(/[|,-]/)[0].trim() });
  },
};
