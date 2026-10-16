---
description: Analyse GA4 acquisition, engagement and booking-intent funnel (read-only Google Analytics MCP), compared with the booking ledger
argument-hint: [last7 | last28 | last90 | YYYY-MM-DD YYYY-MM-DD]
---
Analyse Google Analytics 4 for www.apvillasandresorts.in for **$ARGUMENTS** (default: last 28 days vs the 28 days before). Follow `content/research-rules.md`.

1. Use the Google Analytics MCP (`analytics-mcp`). First call `get_account_summaries` / `get_property_details` for property **558430227** to confirm access. If it is not connected or credentials fail, stop and say exactly which setup step is missing (see docs/research-stack.md).
2. Always filter `hostName` = `www.apvillasandresorts.in` (excludes localhost and preview traffic). Run `run_report` for:
   - totals and by date: activeUsers, totalUsers, sessions, engagedSessions, engagementRate, keyEvents;
   - acquisition: sessionDefaultChannelGroup, sessionSourceMedium (sessions, engagedSessions, keyEvents);
   - landing pages: landingPage (sessions, engagementRate, keyEvents);
   - devices and cities: deviceCategory, city;
   - booking-intent events: eventName in (enquiry_sheet_open, enquiry_form_submit, whatsapp_click, phone_click, echeckin_submit, journal_subscribe) with eventCount;
   - villa interest: pagePath beginning `/villas/` (screenPageViews).
   Optionally `run_funnel_report`: page_view → villa page → enquiry_sheet_open → enquiry_form_submit → whatsapp_click.
3. Compare with the previous period. Label every figure [FACT] with property, metric and date range.
4. Booking reality check: GA4 does not see OTA, WhatsApp, phone or walk-in bookings, and the site has no online checkout (no purchase events). If a booking export or Founder OS data is available, compare website-attributed bookings (Direct · Website, or found via Website/Google) with booking-intent events as a ratio, labelled [ESTIMATE], and explain consent, ad-blocker and cross-device gaps.
5. Recommendations only where the data supports them (e.g. a landing page with high traffic and low engagement), each with the metric to watch.
6. Save to `research/<today>-ga4.md`; give me the key points.
