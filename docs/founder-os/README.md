# AP Villas Founder OS

Private command center for the founder at **www.apvillasandresorts.in/founder/** (small "Admin" link in every footer).
Not in the site navigation, not in the sitemap, `noindex`, blocked in robots.txt, strict Content-Security-Policy (vercel.json).

## Architecture (what really exists)
| Layer | What | Where |
|---|---|---|
| Portal (front end) | Static HTML/CSS/JS, no third-party scripts, own SVG charts | `founder/` (`app.js`, `charts.js`, `metrics.js`, `founder.css`) |
| API + jobs (back end) | Extra files in the existing e-check-in Apps Script project, routed from `doPost` for actions starting `f.` | `docs/founder-os/FoCore.gs`, `FoData.gs`, plus `founder/metrics.js` pasted as `FoMetrics.gs` |
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
2. Add script files `FoCore`, `FoData`, `FoMetrics` with the contents of `docs/founder-os/FoCore.gs`, `docs/founder-os/FoData.gs`, `founder/metrics.js`.
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

## Phases
Done: 1 security, 2 canonical ledger + ingestion, 3 booking management + inventory + reconciliation, 4 metrics + overview + booking analytics (plus property, guest and operations views).
Next: 5 saved charts + scheduled reports, 6 GA4 Data API (needs one Google permission), 7 website funnel reconciliation, 8 revenue/finance (expenses), 9 trends/events/forecasts, 10 recommendations + final security review.
