# AP Villas research rules (used by /research, /analyse-bookings, /analyse-ga4, /exec-summary)

## Evidence labels (every finding carries exactly one)
- **[FACT]** Verified: from a cited source (link + publisher + publication date + date retrieved) or from AP Villas' own data (file name / GA4 property + date range).
- **[ESTIMATE]** A number derived by calculation or approximation. Show the inputs and the method.
- **[HYPOTHESIS]** A possible explanation that the data does not prove. Say what would confirm or refute it.
- **[RECOMMENDATION]** An action, tied to the facts it rests on, with the metric to watch and when to review it.

## Never
- Invent competitor prices, booking figures, occupancy, market share, ratings or footfall. If a number is not in a source, write "not found".
- Present one article as consensus. Where sources disagree, show both with dates.
- Treat search snippets as verified: open the page (fetch) before citing a figure.
- Put guest names, phones, emails, ID numbers or booking references in a report, prompt or search query.
- Send AP Villas figures to any outside service (search engines, Trends MCP). Searches are about the market, never about our guests.
- Assume GA4 contains OTA, WhatsApp, phone or walk-in bookings; it only observes website behaviour.
- Make paid requests. Trends MCP: 100 free requests a month, stop at 80 used and say so.

## Sources, in order of trust
1. Official: Shri Mahakaleshwar Temple Management Committee, MP Tourism / MP government, Ministry of Tourism (India Tourism Statistics), Ujjain Smart City, Indian Railways / AAI for transport.
2. Established news: The Hindu, Indian Express, Free Press Journal (Indore), Dainik Bhaskar, Times of India, PTI.
3. Industry: HVS, JLL Hotels, FHRAI, Hotelivate, STR/CoStar summaries, OTA press releases.
4. Everything else only as a lead to an official or established source.

## Tools
- Free Search MCP (`search`, `fetch`, `research`, `compare`): keyless, local; engines can be blocked or incomplete, so retry with another engine or phrasing and say when coverage was thin.
- Google Analytics MCP (`run_report`, `run_funnel_report`, ...): read-only, property 558430227, live hostname www.apvillasandresorts.in only.
- Trends MCP (`get_growth`, `get_time_series`, `get_top_trends`): relative interest (0–100), not visitor counts. Search interest is not booking demand.
- Booking data: `node scripts/analyse-bookings.mjs <export>` (same metric definitions as the Founder OS). Facts about the villas come only from content/business-facts.json.

## Output
Save to `research/YYYY-MM-DD-<topic>.md` (git-ignored and never deployed: this repo is public). Structure:
1. Executive summary (5 bullets max, each labelled)
2. Findings with sources (table: finding · label · source · date)
3. What this means for AP Villas (labelled)
4. Limitations and gaps (what could not be verified, coverage, quota used)
5. Recommended actions (owner, metric to watch, review date)
6. Sources (full list with publication and retrieval dates)
