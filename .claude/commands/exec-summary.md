---
description: Evidence-based executive summary for AP Villas — combines market research, booking analysis and GA4 into one management report
argument-hint: [period, e.g. "Q3 2026" or "last 90 days"] [booking export path]
---
Produce the AP Villas executive summary for **$ARGUMENTS** following `content/research-rules.md`.

1. Gather, reusing reports already in `research/` from the last 14 days where they exist (say which):
   - Market: run /research ujjain and /research india if no recent report (cap: 12 searches, 5 Trends requests).
   - Bookings: `node scripts/push-market.mjs --summary research/summary.json` (aggregates from the Founder OS: occupancy, ADR, RevPAR, revenue, channels, villas, reference rates). For deeper analysis, a booking export with /analyse-bookings. Never guess figures.
   - Market: the latest market data and report are in the portal (Pricing & market, Reports); run /market-scan if older than 14 days.
   - Website: run /analyse-ga4 for the same period.
2. Write `research/<today>-executive-summary.md` (max ~2 pages):
   - **Headline** (3–5 bullets, each labelled [FACT]/[ESTIMATE]/[HYPOTHESIS]/[RECOMMENDATION]).
   - **Performance**: bookings, revenue, occupancy, ADR, RevPAR, channel mix vs previous period / last year, from the booking analysis only.
   - **Demand & market**: Ujjain footfall, events ahead (dates with sources), India hospitality signals, competitor developments (public facts only).
   - **Website**: acquisition and booking-intent trend; what GA4 cannot see.
   - **What we don't know**: data gaps, unverifiable claims, quota/coverage limits.
   - **Recommended actions**: 3–6, each with owner, the evidence it rests on, the metric to watch and a review date.
   - **Sources**: every source with publication and retrieval dates.
3. Never include guest personal data. Never send AP Villas figures to search or trend services.
4. Give me the headline bullets and the file path.
