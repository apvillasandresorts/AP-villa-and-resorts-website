# AP Villas & Resorts — website upgrade plan

Source: the growth audit of 11 Oct 2026 (https://claude.ai/artifact/UBYNj8cwmHMw86xq5CVbkb).
Owner decision (11 Oct 2026): **do not change** review scores/counts, testimonials, distance claims, or the "whom we have hosted" guest counts. Everything else is in scope.

Each phase ships on its own (preview → commit → push → verify live). Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[?]` waiting on owner.

## Phase 1 — Quick wins: mobile, clarity, enquiry flow (no owner data needed)
- [x] 1.1 Phones: replace the 3 floating circles with one bottom bar: **WhatsApp · Call · Quick answers** (owner choice). Desktop unchanged.
- [x] 1.2 Villa cards: fix "Book on WhatsApp" text overflowing its button on phones; card CTA becomes "Check dates for <villa>".
- [x] 1.3 Smart WhatsApp messages: every button pre-fills villa, check-in, nights, guests and a page reference (e.g. `Ref: WEB-DIV`), so chats start with the facts and you can see which page produced them.
- [x] 1.4 "Check dates" mini form (villa, check-in, nights, adults, children/elders) that opens WhatsApp with the details filled in. No backend, no cost.
- [x] 1.5 Homepage hero: one primary (Check dates on WhatsApp) + one secondary (See the villas); Mahakal game stays in the hero as a smaller link (owner choice).
- [x] 1.6 Decoration: owner keeps the animated frame and custom cursor/spotlight (decided 11 Oct 2026). No change.
- [x] 1.7 Concierge chatbot: relabel "AI-Powered · Replies Instantly" → "Quick answers"; refresh answers from business-facts.json (check-in/out, pets, lift, kitchen) without touching distance or review wording.
- [x] 1.8 Accessibility: footer contrast, heading order, visible keyboard focus, game page H1 + alt. Also fixed the game's broken "Play again" and replaced its fake "limited offers" line.
- [x] 1.9 Stop publishing internal files (content/, scripts/, docs/, CLAUDE.md) via `.vercelignore`.

## Phase 2 — Speed (mobile LCP 4.2–7.7 s → target < 2.5 s lab)
- [x] 2.1 Self-host the two Google Fonts (WOFF2, `font-display: swap`, preload) — removes ~2.2 s render-blocking.
- [x] 2.2 Image pipeline (incl. img/Founder.jpg, currently 3.8 MB): 480/960/1600 px WebP for villa and blog photos, `srcset` + `sizes`, width/height; the pipeline does the same for new blog photos.
- [x] 2.3 Preload the hero/LCP image on each page; never lazy-load it.
- [x] 2.4 Cache headers in `vercel.json` for images, CSS, JS, fonts.
- [x] 2.5 Branded 404 page (noindex). The http→https→www double hop is Vercel's built-in HTTPS redirect and can't be shortened on the free plan; harmless.

## Phase 3 — Measurement
- [x] 3.1 Google Search Console verified (URL prefix https://www.apvillasandresorts.in/, via GA4, account apvillasandresorts@gmail.com); sitemap.xml submitted 11 Oct 2026 (first fetch pending).
- [x] 3.2 Google Analytics 4 (G-BEZ8KC5XGV) installed site-wide and in the blog template.
- [x] 3.3 Events (code ready; sends once GA4 is installed): `whatsapp_click` (page, villa, button position), `phone_click`, `enquiry_form_submit`, `gallery_open`, `view_villa`.
- [ ] 3.4 Booking sheet template (date, source, villa, quoted, booked, value, cancelled) + WhatsApp Business labels guide.

## Phase 4 — Villa pages, comparison and policies
- [?] 4.1 Owner data per villa: bathrooms, floor/lift, bed types, area, house rules, ID policy.
- [?] 4.2 Owner policies: cancellation, advance/payment, festival dates, couples/ID, quiet hours.
- [ ] 4.3 Five villa pages `/villas/<name>.html` (gallery, specs, price, amenities, darshan logistics, rules, FAQ, enquiry form, related villas). Only verified facts; missing fields are left out, never guessed.
- [ ] 4.4 Compare table on villas.html + "For elders / For 8+ / With rooftop" filter chips.
- [ ] 4.5 Policies page (`/policies.html`) + privacy notice (needed for Analytics/Ads).
- [ ] 4.6 Villa structured data (LodgingBusiness per villa), sitemap, internal links from guides.

## Phase 5 — Homepage restructure (audit §14)
- [ ] 5.1 Hero copy (owner approves wording).
- [ ] 5.2 "Why a whole home" section (one home vs three rooms, own kitchen, host for 4 AM darshan, per-person price maths).
- [ ] 5.3 Compare-your-villa section linking to villa pages.
- [ ] 5.4 "Darshan made easy" timeline (evening briefing → 3:30 AM shuttle → aarti → breakfast).
- [?] 5.5 "Book directly with us" benefits strip (owner chooses benefits they can always honour).
- [ ] 5.6 Travel & packages strip; founder note; homepage FAQ + mini form.

## Phase 6 — Brand system "Emerald Haveli"
- [?] 6.1 Owner approves direction (emerald + antique gold to match the logo, replacing navy/saffron).
- [ ] 6.2 Colour tokens, button/card styles, contrast AA.
- [ ] 6.3 Line icons replace emoji amenity icons.
- [ ] 6.4 Typography: no small italic Cormorant; type scale.

## Phase 7 — SEO & growth
- [ ] 7.1 Titles/meta descriptions per audit §9 sheet (≤60 / ≤158 chars).
- [ ] 7.2 Gallery → "Explore Ujjain" (keep URL working).
- [ ] 7.3 Groups page (2–5 villas, up to 32 guests) and darshan packages page (*owner sets prices*).
- [ ] 7.4 Hindi/Hinglish guide "Ujjain mein rukne ki jagah"; Gujarati Omkareshwar guide.
- [?] 7.5 Google Business Profile per villa; review-request message after checkout (owner actions, Claude drafts).
- [ ] 7.6 Blog pipeline cadence: 3–4 posts/week.

## Deferred / not doing
- Booking engine, paid SEO tools, discount banners, fake urgency, competitor-brand bidding.
- Google Ads: only after Phase 3 shows enquiry → booking rates.
- Logo vector redraw: optional, paid designer, before signage.
