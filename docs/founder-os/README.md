# AP Villas Founder OS

Private command center for the founder at **www.apvillasandresorts.in/founder/** (small "Admin" link in every footer).
Not in the site navigation, not in the sitemap, `noindex`, blocked in robots.txt, strict Content-Security-Policy (vercel.json).

## Architecture (what really exists)
| Layer | What | Where |
|---|---|---|
| Portal (front end) | Static HTML/CSS/JS, no third-party scripts, own SVG charts | `founder/` (`app.js`, `charts.js`, `metrics.js`, `founder.css`) |
| API + jobs (back end) | Extra files in the existing e-check-in Apps Script project, routed from `doPost` for actions starting `f.` | `docs/founder-os/FoCore.gs`, `FoData.gs`, `FoInsights.gs`, plus `founder/metrics.js` pasted as `FoMetrics.gs` and `founder/insights.js` as `FoInsightsLib.gs` |
| Database | Private Google Sheet **"AP Villas Founder OS — Data"** (owned by apvillasandresorts@gmail.com) | tabs: Users, Audit, Properties, Channels, Guests, Bookings, Payments, History, Exceptions, Imports, Blocks, Expenses |
| Source data | The real e-check-in sheet (read only) | synced hourly by `foHourly` |
| Email | Gmail via Apps Script `MailApp` (sign-in codes, alerts) | ~100 emails/day |

The website has no booking engine or payment gateway code; bookings arrive by WhatsApp/phone, OTAs and e-check-in.
OTA live APIs are not connected (partner-only). OTA data comes in through **CSV import** (idempotent).
GA4 tag is installed on the site; GA4 *reporting* is not connected yet (phase 6).

## Security
- Factor 1: passphrase (PBKDF2-HMAC-SHA256, per-user salt, server-side pepper in Script Properties). First sign-in: email code, then choose a passphrase.
- Factor 2: 6-digit email code every sign-in, secure random, stored only as an HMAC digest in the server cache; 5-minute expiry, one-time, 5 tries, 60 s resend cooldown, max 6 codes/hour, never in logs or URLs.
- Wrong passphrases: sign-in pauses after 8 in an hour and the founder is emailed.
- Sessions: random 256-bit token, stored server-side as a keyed digest; 30 min idle / 12 h absolute; rotated every 15 min; revocable ("sign out everywhere"). Browser keeps it in `sessionStorage` only (closing the tab ends it).
  Apps Script cannot set cookies for the website domain, so HTTP-only cookies are not possible; the token is sent in the request body (no CSRF exposure because no cookies are used), and XSS is limited by the strict CSP and escaping of all data.
- Every API action checks the session and the role (founder / manager / viewer). Audit log in the Audit tab and in Settings.
- Script Properties (never in the repo): `FO_FOUNDER_EMAIL`, `FO_PEPPER`, `FO_DATA_ID`, `FO_LAST_SYNC`, sessions `FO_S_*`.

## Install / update (Apps Script editor, project "AP Villas E-Check-in")
1. Project Settings → Script properties → add `FO_FOUNDER_EMAIL` = the founder's login email.
2. Add script files `FoCore`, `FoData`, `FoMetrics`, `FoInsightsLib`, `FoDesk`, `FoInsights`, `FoMarket`, `FoSearch`, `FoSignals` with the contents of `docs/founder-os/FoCore.gs`, `docs/founder-os/FoData.gs`, `founder/metrics.js`, `founder/insights.js`, `founder/desk.js`, and `docs/founder-os/FoInsights.gs`, `FoMarket.gs`, `FoSearch.gs`, `FoSignals.gs` (keep this order: libraries before the files that use them).
3. In `Code.gs` `doPost`, right after `const body = JSON.parse(e.postData.contents);` add
   `if (String(body.action || '').indexOf('f.') === 0) return json_(foApi_(body));`
4. Save, run `foSetup` once (creates the data sheet, founder user, villas, channels, hourly trigger, first sync).
5. Deploy → Manage deployments → edit → New version → Deploy (same URL).
6. Open /founder/, sign in with the founder email and an empty passphrase, enter the emailed code, choose a passphrase.

## Metric rules (one dictionary: `founder/metrics.js`)
Inventory unit = villa-night (5 whole villas). Stay-date metrics spread each booking's net accommodation revenue evenly over its nights.
Booking value ≠ revenue ≠ cash. Taxes excluded only when recorded. Cancelled: counted in booking value and cancellation rate, never in occupancy/ADR. Kept fees reported separately. Blocks reduce available nights. Void = excluded everywhere.
Commission: recorded → estimated from the channel rate set in Settings → "unknown" (never guessed). Contribution margin is unavailable until costs are recorded.
E-check-in rows have no real booking date: the submission time is stored as a proxy (`created_basis`) and left out of lead time.

## Tests
`node --test tests/` runs the real backend code against in-memory Google services (`tests/founder/gas-mock.mjs`), the metric dictionary and public-site checks.
Local preview with sample data: `node tests/founder/dev-server.mjs` → http://localhost:3100/founder/ (sign-in codes print in the terminal).

## Scheduled work (no extra trigger)
`foHourly` (hourly trigger created by `foSetup`) syncs e-check-ins and, once a day after 07:00 IST, runs `foDailyIfDue_`:
daily snapshot (on-the-books 7/30/60/90 days, YTD, receivables), due reports (daily brief; weekly on Mondays; monthly on the 1st;
quarterly on 1 Jan/Apr/Jul/Oct; annual on 1 Jan) saved as HTML + PDF in the private Drive folder "AP Villas Founder OS Reports",
and chart refresh marks. Idempotent per report type + period; failed steps are logged in the Jobs tab and retried next hour.
Reports are emailed only for the types the founder ticks in Settings → Report delivery (default: none).

## Live Pricing Desk (Pricing & market)
Engine `founder/desk.js` (= `FoDesk.gs`), back end `docs/founder-os/FoSignals.gs`. For Rudrangan Suites (6 adults, 3 BR) and AP Suite (4 adults, 2 BR).
- **What it gives:** a NET price per night (what AP Villas keeps) for tonight and the next 90 nights, the price to enter on each channel
  (OTA prices grossed up for commission: Airbnb 15%, Booking.com 15%, MakeMyTrip 18%; direct 5% below the lowest OTA price, never below net),
  a ₹ waterfall of every step, confidence 0–100, and a time-of-day ladder for unsold nights tonight/tomorrow (S1 00:00–10:30 … S4 20:00–24:00).
- **Market-only by default (owner rule, 25 Oct 2026):** prices start from the published "from" price (or your base setting) and move only with
  competitor prices/sell-outs, search and website demand, the calendar, holidays, events and weather. Your booking history (realised rates, season,
  pace, own compression) is NOT used, because the ledger can hold test or typo entries. Settings → Market → "Use my booking history" turns it back on;
  even then a realised rate above 2× the published price is ignored as a data error.
- **Guardrails:** floor 75% and ceiling 3× of the published "from" price (4× in mega events), ±12% per day vs the previous recommendation
  except hard events, never moves on a single stale signal. Recommendations only: nothing changes OTA prices.
- **Signals (17):** own data (pace, compression, seasonality), competitor prices/sell-outs/hotel index/reputation (Rate check, extranet CSV,
  owner-run `/pricing-scan`), Hindu calendar (astronomy-engine, sunrise in Ujjain), Google public holidays, weather (MET Norway, CC BY 4.0),
  search (Search Console, Trends free tier), website (GA4), and public news (school breaks, events, temple notices, travel, footfall).
  Each row has source_url, fetched_at and for_date; past its freshness limit a signal fades, at 2× it counts for nothing and shows as expired.
- **Comp set:** top 10 by similarity (size 30, whole home 15, distance 20, price band 15, rating 10, amenities 10), at least 3 hotels,
  re-ranked weekly; a member is replaced only after a challenger leads by 10+ points for 2 weeks. Pin/exclude in the portal. Changes logged (CompChanges).
- **Hourly (`foDeskHourly_` in `foHourly`):** recompute 2 villas × 90 nights, store only changed nights (Recommendations), alerts by email
  (price move >10%, competitors >60% sold out while unsold, expired signal; de-duplicated), and the 07:00 "Price to set today" brief.
- **Learning:** Accept/Override in the portal (PriceDecisions, override needs a reason); Performance tab compares past recommendations with what sold.
- **Feeds:** `.github/workflows/signals-auto.yml` (every 6 h, no AI: weather, holidays, calendar → `f.m.signals.import`),
  `.github/workflows/pricing-intel.yml` (daily 06:30 IST with Claude: public news signals + 30-day Outlook, see `content/pricing-intel-instructions.md`).
  Both need the `FOUNDER_OS_KEY` secret and skip without it.

### Fill mode (default since 26 Oct 2026): the price that sells
Owner goal: 100% occupancy, so the price is no longer "base × factors". For each night the engine builds the **market ladder** (every comparable
stay still open, guest prices, cheapest platform, size-adjusted by bedrooms^0.6; or the forecast ladder when fewer than 3 were checked) and reads
off the price where the **chance to sell** reaches a target: 90% tonight, 82% within 3 days, 72% within 2 weeks, 62% within 45 days, 55% beyond;
tonight climbs 90 → 98% through the day (S1–S4) so the price steps down in the evening. **Demand pressure** (× each): market sell-out vs normal,
calendar & festivals, search/web/news demand, Google searches for Ujjain stays (Trends), weather, competitors raising/cutting, a night priced above
nearby nights, our other villas booked. The waterfall shows Market median → Sell target → each pressure factor. Floor = Settings `fill.min_net`
per villa (0 = 35% of the published price), so ₹2,000 is possible; cuts apply at once, rises are limited to +12%/day. The card shows ≈% chance
to sell and a price ladder (50/70/80/90/95%). **Confidence** = comparable prices for the night 32%, freshness 16%, measured forecast accuracy 16%,
market agreement 12%, availability seen 12%, live demand signals 12%. 100% is not possible for a prediction; it rises as the bots check each
night (now 3× a week) and the accuracy history grows. `mode: 'classic'` in desk settings restores the old method.

## Search demand (Google Trends, Wikipedia, Autocomplete)
`.github/workflows/search-demand.yml` (06:15 and 18:15 IST, 3 attempts) runs `scripts/search-demand/run.mjs`:
- **Signal `search_market`** for the next 45 nights: stay-intent searches ("hotels in ujjain", "ujjain hotel"…) 60%, pilgrimage searches
  ("mahakal darshan", "mahakaleshwar", "ujjain"…) 25%, Wikipedia readers of the Ujjain/Mahakaleshwar articles 15%, last 7 days vs the 8 weeks
  before; full weight for nights within 7 days, fading to 20% at 45 days; a 3-day rise adds up to 8% for the next week.
- **SEO & marketing → Ujjain searches:** Trends top and rising searches around Ujjain (24 h and 7 days), each keyword's daily curve on one
  scale ("ujjain hotel" average = 100), Google Autocomplete phrases, exact Wikipedia readers per day, and estimated searches/day once the
  Keyword Planner monthly figure for "ujjain hotel" is entered (ESTIMATE). Google publishes no exact daily search counts for any keyword.
- Sources: trends.google.com data endpoints (robots.txt allows them), suggestqueries.google.com (no robots.txt), Wikimedia REST pageviews
  API (official); SerpApi google_trends only as a backup. Stored in SearchKeywords / SearchExtra (60 days) via `f.m.searchkw.import`.

## Market bots (competitor prices, every platform, fully automatic)
`.github/workflows/market-bots.yml` runs `scripts/market-bots/run.mjs` on GitHub at 08:10 and 18:10 IST (nothing on the owner's Mac).
- **Page bots** (`scripts/market-bots/bots/`): Airbnb (listing pages), Booking.com (dated search + hotel pages), Agoda, OYO, Cleartrip
  (city page + dated property pages), EaseMyTrip and Trip.com (discovery / known links), StayVista (sitemap watch). Every URL is checked
  against the site's robots.txt (RFC 9309) first; honest user agent `APVillasPriceBot`; no login; no CAPTCHA solving; 5–8 s between pages;
  ~40 pages per platform per run; a challenge, 403 or 429 stops that platform and shows "blocked" in Signal health.
- **APIs** (`scripts/market-bots/apis/`): Google Hotels via SerpApi (free 250 searches/month, secret `SERPAPI_KEY`) for MakeMyTrip,
  Goibibo, Expedia and every OTA Google compares; Apify (free $5/month, secret `APIFY_TOKEN`) for Airbnb discovery (Mondays) and as the
  Booking.com fallback; Booking.com Demand API and Agoda affiliate API switch on when approved (secrets `BOOKING_AFFILIATE_ID`,
  `BOOKING_API_TOKEN`, `AGODA_SITE_ID`, `AGODA_API_KEY`).
- **Nights checked:** AM = tonight, tomorrow, the coming Saturday, the next high-demand night; PM = the coming Friday, the next two
  Saturdays, further high-demand nights (from the calendar/holiday/event signals, `f.m.compset`). Owner rule 26 Oct 2026: every night 2–45 days
  out gets a real check 3× a week: a night is due when its distance from today ≡ 0, 3 or 5 (mod 7), ~19 a day: 3 in the AM run, 3 in the PM
  run, the rest in the 2-hourly runs (which first retry any bot that failed today, then "sweep" their share of due nights).
- **Into the Founder OS:** competitors (links on every platform merged, distance from map coordinates, ratings) and dated observations
  (price or sold out, per platform) via `f.m.market.import`; one row per bot per run in the BotRuns tab via `f.m.bots.report`.
- **Engine use (desk.js):** a competitor's price = the guest's cheapest available platform; sold out only when every platform is full;
  parity spread; percentiles; unchecked nights get a labelled half-weight estimate from nearby nights of the same kind; momentum from
  repeat scans of the same night (±5%); like-for-like demand-spike detection (3+ competitors ≥20% above their own norm, or half sold out)
  with alerts; our direct price's position in the market.
- Tests: `tests/market-bots.test.mjs` (page-reading rules on real page text, robots.txt, night planning). Dry run: GitHub → Actions →
  "Market bots" → Run workflow → tick "Dry run".

## Competitor forecast and market analytics (desk.js)
- **Forecast** (`FoDesk.forecast`): for every night of the next 90, the comp set's likely median price and middle range, the expected price
  nearer the date, and the chance competitors sell out. Model (`marketModel`): each competitor's normal weekday and Fri/Sat price; reaction to
  calendar strength (Hindu calendar, holidays, events, school breaks) learned from nights seen (default 60% until 3 strong nights are seen);
  price drift per day as nights get closer (repeat scans); sell-out rates by night type and lead time. Accuracy (`forecastAccuracy`):
  each checked night is forecast without its own prices and compared (median absolute error). Unchecked nights are priced against the
  forecast at half weight, labelled "Market (forecast)". Portal: Pricing & market → Forecast.
- **Analytics** (`marketAnalytics`, all competitors, next 14–90 nights): segments (2 BR / 3+ BR homes, hotels), platforms (how often each is
  the guest's cheapest, premium vs cheapest), price index over time, weekday and lead-time profiles, leaderboard (price moves, sell-outs,
  platform spread). Portal: Pricing & market → Analytics.

## News (live, relevant only)
`.github/workflows/news.yml` every 2 hours runs `scripts/news/run.mjs`: GDELT DOC 2.0 API (open news database, English + Hindi Indian
outlets; retried with backoff when rate-limited) and publishers' own RSS feeds (Free Press Journal, Times of India Indore, Dainik Bhaskar),
robots.txt checked; Google News RSS is not used (its robots.txt disallows /rss). Backup once a day: Google News via SerpApi when GDELT
refused. `scripts/news/classify.mjs` keeps stories about Ujjain / Mahakal / Simhastha (and Indore/MP travel, weather, festivals, safety),
drops other Kumbh cities, labels category, impact (temple schedule changes, closures, record crowds = high) and demand direction.
Only headline, source, link, date and a short feed summary are stored (News tab). New high-impact stories are emailed once.
Portal: Pricing & market → News, and "News that matters" on Today.

## Google Cloud project (since 25 Oct 2026)
The Apps Script uses its own standard Cloud project **"AP Villas Founder OS"** (ID `ap-villas-founder-os`, number 38817203894, no billing),
because the hidden default project cannot switch on the Search Console API. Enabled APIs: Google Search Console API, Google Analytics Data API, **Google Drive API** (needed by the e-check-in ID uploads; missing from
25 to 26 Oct 2026, which made check-ins with ID photos fail).
Sign-in screen (Google Auth Platform): External, **In production**, owner account only, home page + policies.html, domain apvillasandresorts.in, no logo
(a logo would require Google verification). If the project is ever changed again, enable those three APIs there and run `foHealthCheck` → Allow.

## E-check-in reliability (26 Oct 2026)
The guest form (`assets/js/checkin.js`) sends through our own domain (`/api/fo` relay) with script.google.com as fallback, 3 automatic retries,
the same reference each time (the server answers "duplicate" instead of storing twice). The server waits up to 30 s for the script lock shared
with Founder OS jobs, then saves anyway. A photo the phone cannot read or a PDF over 2.5 MB is skipped and the guest is asked to send that file
on WhatsApp; if nothing can be sent, a one-tap WhatsApp message with all details is offered. Test rows: run `ciDeleteTestEntries` in the editor
(rows whose main guest starts with "TEST"; ID folders to Drive Trash).

## AP Brain (live)
`docs/founder-os/FoBrain.gs`. Top-bar button "Ask AP Brain" (manager+).
- **Providers (all free, each optional, keys only in Script Properties):** Groq `GROQ_API_KEY` → Cerebras `CEREBRAS_API_KEY` → OpenRouter
  `OPENROUTER_API_KEY` (":free" models only) → Mistral `MISTRAL_API_KEY` → Gemini `GEMINI_API_KEY`. Inside each provider the models are tried in
  turn: a retired model (404) is replaced by the provider's current list and remembered (`<NAME>_MODEL_AUTO`); a used-up daily allowance (429)
  moves to the next model for this answer only. 35 s budget per answer.
- **Questions:** business summary (ledger, next 14 nights with price, chance to sell, market median and sell-outs, weeks 3–8, competitors, search
  demand and top/rising searches, Wikipedia, news, forecast accuracy). Never guest names, phones, emails or booking IDs; questions are scrubbed.
- **Web research:** a planner picks up to 2 searches; Groq gpt-oss with its `browser_search` tool runs them (small model first: each search costs
  ~40k tokens of the 200k/day free allowance), then Gemini Google Search grounding (free allowance often used up), then GDELT news. Sources are
  numbered and shown under the answer. Switch: "Search Google…" in the panel.
- **Actions (`f.brain.act`):** paste a booking voucher or type "paid Mahesh ₹12,000 salary today" / "electricity bill ₹2,450 AP Suite": the model
  extracts fields, the server validates them and asks for anything missing, the panel shows a confirmation card, and "Confirm & save" calls the
  normal route (`f.booking.save`, `f.expense.save`, `f.hr.pay.save`, `f.hr.emp.save`, `f.crm.lead.save`) with all their checks. Guest details go only
  to Groq, Cerebras or Mistral (never the Gemini free tier or OpenRouter); Aadhaar-style 12-digit numbers are masked; the log keeps only the action type.
- Editor checks: `foBrainTest` (each provider), `foBrainTestResearch`. Daily AI brief email (Settings `brain_daily`). Log: BrainLog tab.

## People & HR and CRM
`docs/founder-os/FoPeople.gs`, portal `founder/people.js` (menu: People & guests).
- **People & HR:** employees of any role (caretaker, sweeper, intern on-site or remote, manager, cook, driver, security, other), salary terms
  (monthly / weekly / daily / stipend / per task, pay day), pay status this month (paid / due / part paid), salary payments (each one also books an
  expense "Staff & caretakers" for the person's villa; deleting the payment removes it), reviews and feedback with ratings, messages to staff.
  Delete is founder-only and keeps a copy in DeletedRecords; payments and reviews stay.
- **CRM:** one log of every email (sent from the owner's Google account, ~100/day, logged automatically) and WhatsApp message (opened on the phone
  with wa.me and logged when opened; nothing is sent automatically), calls and notes; guest profiles from bookings with segments (arriving soon,
  repeat, recent, lapsed, no email) and history; leads board (new → contacted → quoted → booked / lost) with values and follow-up dates; follow-up
  tasks; templates with {name}, {checkin}, {villa} (6 starter templates).
- Sheets: Employees, SalaryPayments, EmployeeReviews, CrmMessages, CrmLeads, CrmTasks, CrmTemplates.

## AP Channel Manager (FoChannels.gs + founder/channels.js; milestone 1 of 6)
Founder OS is the brain, the channel agent (private repo `ap-channel-agent`, a real signed-in Chromium on an always-on free machine) is the hands. Portal → **Channel Manager**.
- **Listings**: paste Airbnb / Booking.com / MakeMyTrip / Goibibo links (many at once). Own links need the villa; competitor links feed the market engines through `agent.observations` → MarketRates (with `listing_id`).
- **Rate desk**: 30 nights per villa: what you keep (the Live Pricing Desk's fill price), chance to sell, and per channel the live extranet price vs the recommended one (net ÷ (1 − commission) × (1 + channel markup), nearest ₹50, always inside the floor/ceiling). "Propose prices from the desk" or tick nights → "Set price" (net or guest price, any channels).
- **Availability**: open, close, minimum stay, stop-sell per channel. Any booking (any channel, direct, e-check-in) or owner block closes the villa's other channels at once (no approval, handed to the agent first). Removing it proposes re-opening.
- **Jobs**: proposed → approved → queued → running → verifying → done | failed → one automatic retry after 10 min → needs_human. Done only when the agent reads the new value back; a mismatch is a failure. A login, OTP, CAPTCHA, "unusual activity" or unknown screen pauses that channel and emails you; nothing retries around it.
- **Modes** per channel: Observe, Propose (you approve), Auto-band (inside the band, ≤ 10 % from the last price, once a day per night, never within a day of a booking). Every channel starts in Propose with 3 days of dry-run (form filled and photographed, not saved).
- **Reservations**: the agent sends only reservation id, villa, dates, amount, currency, channel and status (the server drops anything else). Each becomes a ledger booking (origin `channel_agent`, no guest fields).
- **Parity**: direct must stay cheapest; channels more than 15 % apart are flagged.
- **Safety net**: Settings → Calendar feeds gives one secret iCal link per villa (busy dates only) to import in Airbnb and Booking.com, so booked nights stay closed even when the agent is offline. Served by `doGet ?ical=` in Code.gs.
- **Agent key**: Settings → Create the agent key (shown once, stored as a digest, scope `agent`: pull jobs, report reads, never guests or bookings). Put it in the agent machine's `.env`, never in a repo or GitHub secret.
- AP Brain understands "set AP Suite ₹4,500 on all channels this weekend" / "close Villa Aranya on Airbnb 5–7 Nov" and shows a confirm card.
- **Phone assist (backup, no agent machine needed)**: while no agent is online, Today lists every approved change as a phone task (Open the extranet page → change it → Done; read_back "owner confirmed"). A booking saved anywhere closes the other channels at once and the closures are emailed immediately (each once); other waiting changes are emailed daily at 08:00. Agent machine (Oracle Always Free + Tailscale) can be set up later from Settings.
- Kill switch: Today → pause every channel (or one). Hourly: `foCmHourly_` (availability sync each hour, desk proposals once a day after 07:00). Evidence screenshots: Drive "AP Villas Founder OS Reports/Channel evidence" (30 days).

## GA4 reporting
Server-side only (Apps Script advanced service **Google Analytics Data API**, identifier `AnalyticsData`), property in Settings
(default 558430227), counting only the live hostname. Until the service is enabled and the read-only Analytics permission approved,
the portal says "not connected" and shows the steps. The site has no online checkout, so there are no purchase events; website
bookings are reconciled from the ledger (Direct · Website, or found via Website/Google).

## Phases
All 10 phases are built. GA4 reporting needs the Analytics Data API service enabled once (see above); everything else runs on the ledger.
