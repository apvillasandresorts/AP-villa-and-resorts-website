#!/usr/bin/env node
// Builds one page per villa at villas/<page_slug>.html from content/business-facts.json
// and content/photo-library.json, using villas.html's head/nav/footer as the shell.
// Only verified facts are printed: any field still marked "TODO" is left out.
// Re-run after editing the facts file:  node scripts/build-villa-pages.mjs && node scripts/responsive-images.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SITE = 'https://www.apvillasandresorts.in';
const facts = JSON.parse(readFileSync('content/business-facts.json', 'utf8'));
const library = JSON.parse(readFileSync('content/photo-library.json', 'utf8')).photos;
const shell = readFileSync('villas.html', 'utf8');
const sf = facts.shared_facts;
const known = v => v && !/^TODO/i.test(String(v));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const WA = 'https://wa.me/918999061598?text=Hi%20Apoorv%2C%20I%27d%20like%20to%20enquire%20about%20';

// ---- shell: head + nav, footer + scripts; links made relative to /villas/
const navEnd = shell.indexOf('</nav>') + '</nav>'.length;
const footStart = shell.indexOf('<footer');
const up = html => html
  .replace(/\b(href|src)="(?!https?:|mailto:|tel:|#|\/|data:|\.\.\/|\$\{)([^"]+)"/g, '$1="../$2"')
  .replace(/\bsrcset="([^"]+)"/g, (m, v) => 'srcset="' + v.split(',').map(p => { p = p.trim(); return /^(https?:|\/|\.\.\/)/.test(p) ? p : '../' + p; }).join(', ') + '"')
  .replace(/url\('(?!https?:|\/|\.\.\/)([^']+)'\)/g, "url('../$1')");
let head = up(shell.slice(0, navEnd)).replace(/<a href="\.\.\/villas\.html" class="active">/, '<a href="../villas.html" class="active">');
let tail = up(shell.slice(footStart)).replace(/"villas\//g, '"../villas/');
head = head.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');

const ORDER = ['exterior', 'rooftop', 'pool', 'lounge', 'living-room', 'sitting-area', 'bedroom', 'kitchen', 'kitchenette', 'dining', 'bathroom'];
const rank = p => { const i = ORDER.findIndex(t => p.tags.includes(t)); return i === -1 ? ORDER.length : i; };
const webp = (path, w) => path.replace(/\.(jpe?g|png)$/i, `-${w}.webp`);
const img = (p, cls = '', sizes = '(max-width: 900px) 100vw, 50vw', lazy = true) =>
  `<img class="${cls}" src="../${webp(p.path, 960)}" srcset="../${webp(p.path, 480)} 480w, ../${webp(p.path, 960)} 960w, ../${webp(p.path, 1200)} 1200w, ../${webp(p.path, 1600)} 1600w" sizes="${sizes}" alt="${esc(p.alt)}"${lazy ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async">`;

const GUIDES = [
  ['../blog/mahakaleshwar.html', 'Mahakaleshwar Jyotirlinga: a complete guide'],
  ['../blog/ujjain-in-november-kartik.html', 'Ujjain in November 2026: Kartik, Diwali and Hari-Har Milan'],
  ['../blog/simhastha-2028-ujjain-guide.html', 'Simhastha 2028 Ujjain: a first planning guide'],
  ['../blog/omkareshwar.html', 'Omkareshwar day trip from Ujjain'],
].filter(([h]) => existsSync(h.replace('../', '')));

const amenities = [
  ...sf.included_in_every_villa,
  ...(known(sf.lift_elevator) ? ['Lift'] : []),
  ...(known(sf.wheelchair_access) ? ['Wheelchair friendly'] : []),
  ...(known(sf.pets_policy) ? ['Pets welcome'] : []),
  ...(known(sf.power_backup) ? ['Power backup'] : []),
  ...(known(sf.ac_in_all_rooms) ? ['Air-conditioned'] : []),
  ...(known(sf.hot_water_geyser) ? ['Geysers / hot water'] : []),
  ...(known(sf.kitchen_detail) ? ['Induction cooktop'] : []),
].filter((a, i, all) => all.indexOf(a) === i);

for (const v of facts.villas) {
  const url = `${SITE}/villas/${v.page_slug}.html`;
  const photos = library.filter(p => p.villa === v.id).sort((a, b) => rank(a) - rank(b));
  const hero = photos.find(p => p.path === v.hero_photo) || photos[0];
  const gallery = [hero, ...photos.filter(p => p !== hero)].slice(0, 9);
  const others = facts.villas.filter(o => o.id !== v.id);
  const specs = [
    ['Bedrooms', v.bedrooms], ['Sleeps', `Up to ${v.sleeps} guests`], ['From', `${inr(v.from_price_inr_per_night)} per night`],
    ['Bathrooms', v.bathrooms], ['Beds', v.beds], ['Floor &amp; lift', v.floor_and_lift], ['Size', known(v.area_sqft) ? `${v.area_sqft} sq ft` : 'TODO'],
    ['Check-in', sf.check_in_time], ['Check-out', '9:30 AM (later on request)'],
  ].filter(([, val]) => known(val));
  const faqs = [
    [`How many people can stay at ${v.name}?`, `${v.name} has ${v.bedrooms} bedrooms and sleeps up to ${v.sleeps} guests. It is a whole private villa for your group, never shared.`],
    [`What are the check-in and check-out times?`, `Check-in is ${sf.check_in_time} and check-out is 9:30 AM, with one hour in between for cleaning. A later check-out can be arranged on request whenever the villa is free.`],
    [`How far is ${v.name} from Mahakaleshwar Temple?`, `${sf.distance_to_mahakaleshwar}. In-house guests get a complimentary Mahakal shuttle.`],
    [`Can we cook our own food?`, `Yes. ${sf.kitchen_detail}. A local cook can also be arranged for simple home-style thalis on request.`],
    [`Is ${v.name} suitable for elderly parents?`, `${known(sf.lift_elevator) ? 'There is a lift and the villas are wheelchair friendly' : 'Tell us who is travelling'}, with power backup, AC and geysers. Tick "travelling with elders" in the form and we will make sure the stay suits your family.`],
  ];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LodgingBusiness', '@id': url + '#villa', name: `${v.name} by AP Villas & Resorts`, url,
        description: `${v.tagline} ${v.bedrooms} bedrooms, sleeps ${v.sleeps}, near Mahakaleshwar in Ujjain.`,
        image: gallery.slice(0, 6).map(p => `${SITE}/${webp(p.path, 1600)}`),
        telephone: '+91-8999061598', priceRange: `From ${inr(v.from_price_inr_per_night)} per night`,
        address: { '@type': 'PostalAddress', ...(known(v.address) ? { streetAddress: v.address } : {}), addressLocality: 'Ujjain', addressRegion: 'Madhya Pradesh', addressCountry: 'IN' },
        numberOfRooms: v.bedrooms, checkinTime: '10:30', checkoutTime: '09:30', petsAllowed: known(sf.pets_policy),
        amenityFeature: amenities.map(a => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })),
        brand: { '@type': 'Brand', name: 'AP Villas & Resorts' },
      },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Villas', item: `${SITE}/villas.html` },
        { '@type': 'ListItem', position: 3, name: v.name, item: url } ] },
      { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  };
  const title = `${v.name}: ${v.bedrooms}-Bedroom Villa in Ujjain | AP Villas`;
  const desc = `Whole ${v.bedrooms}-bedroom villa for up to ${v.sleeps} guests near Mahakaleshwar, Ujjain. ${v.highlights.slice(0, 2).join(', ')}. From ${inr(v.from_price_inr_per_night)}/night. Check dates on WhatsApp.`;

  let h = head
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${SITE}/${webp(hero.path, 1600)}">`)
    .replace('</head>', `<link rel="preload" as="image" href="../${webp(hero.path, 960)}" imagesrcset="../${webp(hero.path, 480)} 480w, ../${webp(hero.path, 960)} 960w, ../${webp(hero.path, 1200)} 1200w, ../${webp(hero.path, 1600)} 1600w" imagesizes="(max-width: 900px) 100vw, 58vw" fetchpriority="high">\n<script type="application/ld+json">\n${JSON.stringify(ld, null, 1)}\n</script>\n</head>`);

  const body = `

<main class="vp">
  <nav class="vp-crumbs container" aria-label="Breadcrumb"><a href="../index.html">Home</a> › <a href="../villas.html">Villas</a> › <span>${esc(v.name)}</span></nav>

  <section class="vp-hero container">
    <div class="vp-hero__media">${img(hero, 'vp-hero__img', '(max-width: 900px) 100vw, 58vw', false)}
      ${v.highlights.some(x => /newly opened/i.test(x)) ? '<span class="vp-badge">Newly opened</span>' : ''}</div>
    <div class="vp-hero__text">
      <span class="eyebrow">AP Villas &amp; Resorts · Ujjain</span>
      <h1>${esc(v.name)}</h1>
      <p class="vp-tagline">${esc(v.tagline)}</p>
      <ul class="vp-keyfacts">
        <li><b>${v.bedrooms}</b><span>Bedrooms</span></li>
        <li><b>${v.sleeps}</b><span>Guests max</span></li>
        <li><b>${inr(v.from_price_inr_per_night)}</b><span>From / night</span></li>
      </ul>
      <p class="vp-best"><b>Best for:</b> ${esc(v.best_for)}</p>
      <div class="vp-cta">
        <a class="btn btn--primary" href="${WA}${encodeURIComponent(v.name)}" target="_blank" rel="noopener">Check dates for ${esc(v.name)}</a>
        <button class="btn btn--ghost" type="button" onclick="openGallery('${v.id}')">All ${photos.length} photos</button>
      </div>
      <p class="vp-note">Whole private villa · price for your dates confirmed on WhatsApp</p>
    </div>
  </section>

  <section class="vp-gallery container" aria-label="${esc(v.name)} photos">
    ${gallery.slice(1, 9).map(p => `<button type="button" class="vp-thumb" onclick="openGallery('${v.id}')" aria-label="Open photo gallery">${img(p, '', '(max-width: 900px) 50vw, 25vw')}</button>`).join('\n    ')}
  </section>

  <div class="vp-grid container">
    <div class="vp-main">
      <section class="vp-block">
        <h2>The villa at a glance</h2>
        <dl class="vp-specs">${specs.map(([k, val]) => `<div><dt>${k}</dt><dd>${esc(String(val)).replace(/&amp;amp;/g, '&amp;')}</dd></div>`).join('')}</dl>
        <h3>Highlights</h3>
        <ul class="vp-ticks">${v.highlights.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </section>

      <section class="vp-block">
        <h2>Everything included</h2>
        <ul class="vp-amenities">${amenities.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
        <p class="vp-small">${esc(sf.kitchen_detail)}.</p>
      </section>

      <section class="vp-block">
        <h2>Darshan made easy</h2>
        <ol class="vp-steps">
          <li><b>Arrival evening</b><span>Your caretaker explains Bhasma Aarti booking (online or at the counter) and the dress code. The temple permit itself is booked by you.</span></li>
          <li><b>3:30 AM</b><span>Complimentary Mahakal shuttle drops you at the temple gate for the 4 AM aarti.</span></li>
          <li><b>After darshan</b><span>Back to a quiet home, a kitchen and breakfast. Rest before the day's temple circuit.</span></li>
        </ol>
        <p class="vp-small">Airport and day-trip cars at fixed prices: Indore airport ${inr(facts.transport_indicative_prices_2026.indore_airport_sedan_one_way)} (sedan, one way), Omkareshwar day trip ${inr(facts.transport_indicative_prices_2026.omkareshwar_day_trip_suv_round_trip)}. <a href="../travel.html">All travel prices</a>.</p>
      </section>

      <section class="vp-block">
        <h2>Location</h2>
        <p>${known(v.address) ? `<b>${esc(v.address)}</b><br>` : ''}${esc(sf.distance_to_mahakaleshwar)}. ${esc(sf.distance_to_ujjain_station)}.</p>
      </section>

      <section class="vp-block">
        <h2>Good to know</h2>
        <ul class="vp-ticks">
          <li>Check-in ${esc(sf.check_in_time)} · check-out 9:30 AM (later on request, when the villa is free)</li>
          ${known(sf.pets_policy) ? `<li>${esc(sf.pets_policy)}</li>` : ''}
          ${known(v.house_rules) ? `<li>${esc(v.house_rules)}</li>` : ''}
          <li>Cancellation: ${esc(sf.cancellation_policy)}</li>
        </ul>
        <p class="vp-small"><a href="../policies.html">Booking policies</a> · <a href="../contact.html">Contact &amp; FAQ</a></p>
      </section>

      <section class="vp-block">
        <h2>Questions families ask about ${esc(v.name)}</h2>
        ${faqs.map(([q, a]) => `<h3>${esc(q)}</h3>\n        <p>${esc(a)}</p>`).join('\n        ')}
      </section>
    </div>

    <aside class="vp-side">
      <div id="check-dates" data-enquiry data-villa="${esc(v.name)}"></div>
    </aside>
  </div>

  <section class="vp-others container">
    <h2>Other villas in the collection</h2>
    <div class="vp-others__grid">
      ${others.map(o => { const op = library.find(p => p.path === o.hero_photo); return `<a class="vp-other" href="${o.page_slug}.html">${op ? img(op, '', '(max-width: 900px) 50vw, 22vw') : ''}<span><b>${esc(o.name)}</b>${o.bedrooms} bedrooms · sleeps ${o.sleeps} · from ${inr(o.from_price_inr_per_night)}</span></a>`; }).join('\n      ')}
    </div>
    ${GUIDES.length ? `<h2 class="vp-guides-h">Plan your darshan</h2><ul class="vp-guides">${GUIDES.map(([hrf, t]) => `<li><a href="${hrf}">${esc(t)}</a></li>`).join('')}</ul>` : ''}
  </section>
</main>

`;
  writeFileSync(`villas/${v.page_slug}.html`, h + body + tail);
  console.log(`villas/${v.page_slug}.html · ${photos.length} photos · ${specs.length} specs`);
}
