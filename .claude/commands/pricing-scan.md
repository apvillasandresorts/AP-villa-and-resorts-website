---
description: On-demand competitor price scan on this Mac (owner-initiated, low volume) for the Live Pricing Desk comp sets
argument-hint: [rudrangan|ap-suite|both] [days ahead, default 14]
---
Run a small, owner-initiated competitor price check for the Founder OS Live Pricing Desk. Arguments: $ARGUMENTS

The owner accepted that this reads public listing pages of Airbnb/Booking.com (their terms restrict automated access; this is the
owner's decision, made on 2026-10-25). Keep it to what a person checking prices would do:
- At most 30 page loads per run, one at a time, a few seconds apart. Stop on any CAPTCHA, login wall, 403 or 429, and report it.
- Read only: never click "Reserve", never fill forms other than the search box and dates, never log in.
- Use the built-in browser (mcp__Claude_Browser__*), because these pages need JavaScript.

Steps
1. Get the comp sets: `node -e` is not enough (data is private). Ask the owner to open Founder OS → Pricing & market → Competitors,
   or use the list in research/market.json if the owner says so. Use each property's group size: Rudrangan Suites 6 adults (3 bedrooms),
   AP Suite 4 adults (2 bedrooms).
2. For each competitor with a listing URL, read the price shown for 1 night on the requested dates (default: tonight, tomorrow,
   next Saturday, and the next event date), and whether it is available. Record what the page shows; never compute or guess.
3. Write research/ratecheck-YYYY-MM-DD.json in the market.json schema (rates with observed_at today, stay_date, nights 1,
   price_total, availability "available"/"sold out", group_size, target_property, platform, source_url, taxes_included as shown).
4. Validate: `node scripts/market-validate.mjs research/ratecheck-YYYY-MM-DD.json`.
5. Send: `node scripts/push-market.mjs research/ratecheck-YYYY-MM-DD.json` (needs the automation key file), then tell the owner how
   many prices and sold-outs were added and which pages were skipped or blocked.
