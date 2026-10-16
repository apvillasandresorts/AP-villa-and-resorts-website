---
description: Sourced market research for AP Villas (india | ujjain | competitors | any topic) using Free Search + Trends MCP
argument-hint: india | ujjain | competitors | <topic>
---
Research **$ARGUMENTS** for AP Villas & Resorts (5 whole villas within 2 km of Mahakaleshwar, Ujjain). Follow `content/research-rules.md` exactly (evidence labels, no invented numbers, no guest data in queries, official sources first).

Scope by argument:
- `india`: Indian hospitality and religious-tourism trends in the last 12 months: domestic travel demand, pilgrimage circuits (Jyotirlinga, Kashi, Ayodhya, Ujjain), alternative accommodation / villas / homestays, OTA and direct-booking trends, family and group travel, government schemes.
- `ujjain`: Ujjain tourism demand: Mahakaleshwar footfall (official temple committee figures by month/festival), Mahakal Lok, Bhasma Aarti booking changes, Simhastha 2028 preparations and timelines, new road/rail/air connectivity (Indore airport, Vande Bharat), hotel supply news, events in the next 6 months.
- `competitors`: public developments of accommodation near Mahakaleshwar: new hotels/dharamshalas/homestays opening, chain entries (OYO, Treebo, FabHotels, Taj/IHCL, Marriott etc. in Ujjain), MP Tourism properties, their public positioning and amenities. Only what sources state; never guess prices, occupancy or ratings.
- anything else: research that topic in the same way.

Steps:
1. Plan 4–8 queries (English and Hindi where useful). Run them with the Free Search `search` tool (`freshness` = "year" or "month" for news; `category="news"` for current events). If an engine is blocked or results are thin, rephrase or name other engines, and note it.
2. Open every page you will cite with `fetch` (or `fetch_batch`) and take figures only from the page text. Record publisher, publication date and retrieval date.
3. If the Trends MCP is connected and the topic benefits, use at most 5 requests (`get_growth` for "Mahakal", "Ujjain hotel", "Simhastha 2028", "Ujjain darshan" on Google Search / YouTube / news). It is relative interest, not demand. Skip if not connected or near the free quota.
4. Write the report in the structure from the rules and save it to `research/<today>-research-<topic>.md`. Tell me the top 3 findings and the file path.
