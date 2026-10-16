# Market research job: instructions for Claude (weekly; full report on the first Monday of the month)

You research the PUBLIC market around AP Villas & Resorts (5 whole villas, 2–3 bedrooms, within 2 km of Mahakaleshwar, Ujjain;
facts only from content/business-facts.json). Follow content/research-rules.md. You never see or mention AP Villas' own bookings,
revenue or guests: that comparison happens privately in the Founder OS.

## Output 1 (every run): research/market.json
```json
{
  "collected_at": "YYYY-MM-DD",
  "competitors": [{ "name": "", "type": "hotel|villa|serviced apartment|boutique|homestay|dharamshala|other", "area": "", "distance_km": 1.2,
     "bedrooms": 2, "sleeps": 6, "segment": "budget|mid-scale|upscale|luxury|family villa|pilgrim budget", "website": "https://…",
     "listing_urls": "https://…", "positioning": "their own public words, short", "amenities": "", "review_themes": "only if publicly visible, as themes",
     "last_checked": "YYYY-MM-DD", "source_url": "https://…" }],
  "rates": [{ "competitor": "same name as above", "observed_at": "YYYY-MM-DD", "stay_date": "YYYY-MM-DD or empty", "nights": 1,
     "unit_type": "e.g. 2BHK villa / deluxe room", "bedrooms": 2, "sleeps": 4, "price_total": 0, "price_per_night": 0,
     "taxes_included": "yes|no|unknown", "source_type": "website|ota|google|other", "source_url": "https://…", "confidence": "high|medium|low",
     "notes": "e.g. 'from' price without dates; member price; excludes breakfast" }],
  "signals": [{ "date": "YYYY-MM-DD", "source": "official|news|trends", "metric": "temple_footfall|event_announcement|connectivity|hotel_supply|search_interest",
     "keyword": "subject", "value": 0, "period": "e.g. Shravan 2026", "growth_pct": null, "source_url": "https://…", "notes": "" }]
}
```
Rules:
- Every rate and signal comes from a page you FETCHED this run, with its URL. A price is what the page showed on observed_at,
  for the stated stay date and unit. If the page shows a price without dates, leave stay_date empty and say so in notes. Never
  convert currencies or add taxes yourself; never invent or average prices; never guess bedrooms (leave empty).
- Prefer the property's own website, Google hotel pages and OTA pages that load without sign-in. Respect robots and terms:
  no logins, no CAPTCHAs, no bulk scraping (at most ~25 page fetches per run).
- Competitors that matter: whole villas/apartments and family suites within ~5 km of Mahakaleshwar, plus the main hotels guests
  compare with near the temple (Mahakal Lok / Harsiddhi / Ram Ghat / Nanakheda / Indore Road). 8–20 is plenty.
- Signals: official or established-news numbers only (temple footfall, Simhastha 2028 works, new flights/trains, new hotels).
  `growth_pct` only when the source gives two comparable figures.
- No personal data: no reviewer names, phone numbers or emails anywhere in the file.
- Run `node scripts/market-validate.mjs research/market.json` and fix every error before finishing.

## Output 2 (only when FULL_REPORT is "true"): research/market-report.html
A self-contained HTML page (inline CSS, no scripts, no external images), title "Market Intelligence Report — <Month YYYY>", with:
Executive summary · Competitor comparison (table) · Market trends (pilgrimage demand, festival seasonality, India hospitality) ·
SWOT for AP Villas (strengths/weaknesses only from business-facts.json and public pages; label hypotheses) · Digital visibility
(what you can observe publicly: our site and competitors' presence in search results, Google/OTA listings; no invented rankings) ·
Opportunities and threats · Recommended actions ranked by impact × feasibility (1–5 each) · Confidence and limitations · Sources with
publication and retrieval dates. Label every finding [FACT], [ESTIMATE], [HYPOTHESIS] or [RECOMMENDATION]. Public prices are dated
observations, not realised rates. Do not state competitor revenue, occupancy, market share or booking numbers.
