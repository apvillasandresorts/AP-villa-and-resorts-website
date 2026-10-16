# AP Villas research & market-intelligence stack

Everything is free (no paid APIs or plans) and kept off the public website. The portal (www.apvillasandresorts.in/founder/) is where
results are used: **Pricing & market** (reference rates, competitors, dated prices, demand signals), **Reports** (monthly Market
Intelligence Report), **Website analytics** (GA4), **Integrations & automation** (what is connected).

## How data flows
1. **Weekly research job** (`.github/workflows/market-intel.yml`, Mondays 07:30 IST; first Monday of the month also writes the
   Market Intelligence Report). Claude on GitHub Actions with the Claude subscription token (`CLAUDE_CODE_OAUTH_TOKEN`, same as the
   blog) researches public data with web search/fetch, `scripts/market-validate.mjs` checks it (sources, dates, plausible prices,
   no personal data), and `scripts/push-market.mjs` sends it to the Founder OS with the automation key (secret `FOUNDER_OS_KEY`).
   The repo is public, so the job only ever sees public market data; comparison with our own figures happens in the portal.
2. **Founder OS** stores it (Competitors, MarketRates, DemandSignals tabs), adds a daily GA4 traffic-growth signal, and the pricing
   engine (`founder/insights.js` → `pricing`) turns bookings + pace + season + events + signals + market into reference rates.
3. **Local Claude Code** (this Mac): `/market-scan [report]` runs the same research with the Free Search MCP; `/research`,
   `/analyse-bookings`, `/analyse-ga4`, `/exec-summary` for ad-hoc work. Output in `research/` (git-ignored, never deployed).

## Components
| | Status | Cost / licence | Notes |
|---|---|---|---|
| Founder OS GA4 (Apps Script, Analytics Data API) | Connected | Free | Property 558430227, live hostname only |
| Automation key | Created by the founder in the portal | — | Only market import, market report upload, GA4 read, aggregates. Never guest data. Stored as a digest. |
| Weekly research job | Runs once `FOUNDER_OS_KEY` is set | Free (subscription token, public-repo Actions minutes) | Skips with a warning without the key |
| Free Search MCP (local) | Working | MIT, keyless | Plugin `free-search@free-search-mcp`; installed copy runs `uvx --with "selectolax<1" free-search-mcp==0.13.1` (PyPI 0.13.1 lacks that pin; re-add after plugin updates). `~/.config/search-mcp/.env`: Codex auto sign-in off, downloads off, region India. Antigravity engine never enabled. |
| Trends MCP (optional) | Not installed | Free tier 100 requests/month, no card, pauses at the limit | Needs your account: `read -s "TRENDS_KEY?Key: "; claude mcp add --scope user --transport http trends-mcp https://api.trendsmcp.ai/mcp --header "Authorization: Bearer $TRENDS_KEY"; unset TRENDS_KEY` |
| Exa / Tavily MCP (optional) | Not installed | Free tiers need an account + API key | Not needed: Free Search covers keyless search and extraction. Add only if Free Search coverage proves too thin. |
| Google Analytics MCP (local) | Removed | — | Redundant: the Founder OS already reads GA4 on the server (use /analyse-ga4). |
| Google Search Console | Not connected | Free | Needs adding the Search Console API to the Apps Script project and approving `webmasters.readonly`; ask Claude to add it. |

## One-time steps for the founder
1. Portal → Settings → Automation → **Create key**, copy it.
2. Terminal: `gh secret set FOUNDER_OS_KEY --repo apvillasandresorts/AP-villa-and-resorts-website` (paste when asked; hidden).
3. Optional, for /market-scan on this Mac: `mkdir -p ~/.config/ap-villas && read -s "K?Key: " && printf %s "$K" > ~/.config/ap-villas/founder-os-key && chmod 600 ~/.config/ap-villas/founder-os-key && unset K`
4. GitHub → Actions → "Market intelligence" → Run workflow (tick "full report") to try it at once.

## Monthly market-intelligence routine (automatic)
First Monday 07:30 IST: report generated and archived (Reports → Market Intelligence Report). Then, in the portal:
1. Pricing & market → Rate guide: compare reference rates with what you have live on each OTA; adjust where the gap is over ~10%.
2. Revenue intelligence and Recommendations: check our ADR/occupancy/channel mix against the market report's findings.
3. Accept/defer/reject recommendations in the decision log; the next month's report and figures show the outcome.
4. Every quarter: review pricing settings (weights, event uplifts, floors/ceilings) against how events actually performed (Trends & events).
