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

## Google Cloud project (since 25 Oct 2026)
The Apps Script uses its own standard Cloud project **"AP Villas Founder OS"** (ID `ap-villas-founder-os`, number 38817203894, no billing),
because the hidden default project cannot switch on the Search Console API. Enabled APIs: Google Search Console API, Google Analytics Data API.
Sign-in screen (Google Auth Platform): External, **In production**, owner account only, home page + policies.html, domain apvillasandresorts.in, no logo
(a logo would require Google verification). If the project is ever changed again, enable those two APIs there and run `foHealthCheck` → Allow.

## GA4 reporting
Server-side only (Apps Script advanced service **Google Analytics Data API**, identifier `AnalyticsData`), property in Settings
(default 558430227), counting only the live hostname. Until the service is enabled and the read-only Analytics permission approved,
the portal says "not connected" and shows the steps. The site has no online checkout, so there are no purchase events; website
bookings are reconciled from the ledger (Direct · Website, or found via Website/Google).

## Phases
All 10 phases are built. GA4 reporting needs the Analytics Data API service enabled once (see above); everything else runs on the ledger.
