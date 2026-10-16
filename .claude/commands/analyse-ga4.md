---
description: Analyse GA4 acquisition, engagement and booking-intent funnel for the live site (read through the Founder OS, read-only)
argument-hint: [last7 | last28 | last90 | YYYY-MM-DD YYYY-MM-DD]
---
Analyse Google Analytics 4 for www.apvillasandresorts.in for **$ARGUMENTS** (default: last 28 days vs the 28 days before). Follow `content/research-rules.md`.

1. GA4 is read on the server by the Founder OS (property 558430227, live hostname only). Fetch both periods:
   `node scripts/push-market.mjs --ga4 <from> <to> research/ga4-<from>-<to>.json` (needs the local automation key; if missing, say how to add it, see /market-scan step 4).
   The portal's Website analytics page shows the same data with charts.
2. From the files: totals (users, sessions, engagement rate, key events), daily trend, channels, source/medium, landing pages, devices,
   booking-intent events (enquiry_sheet_open, enquiry_form_submit, whatsapp_click, phone_click), villa page views, funnel.
3. Compare the periods; label every figure [FACT] with metric and date range.
4. Booking reality check: GA4 does not see OTA, WhatsApp, phone or walk-in bookings and the site has no online checkout. If
   `node scripts/push-market.mjs --summary research/summary.json` works, compare booking-intent actions with direct bookings as an [ESTIMATE].
5. Recommendations only where the data supports them, each with the metric to watch. Save to `research/<today>-ga4.md`.
