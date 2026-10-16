# AP Villas research stack (development-time MCP servers)

Local tools for Claude Code on this Mac. None of this is part of the website or the Founder OS; the site keeps working if any of them is off.
Workflows: `/research`, `/analyse-bookings`, `/analyse-ga4`, `/exec-summary` (rules: `content/research-rules.md`; output: `research/`, git-ignored and never deployed).

| | Free Search MCP | Google Analytics MCP (official) | Trends MCP |
|---|---|---|---|
| Cost | Free, no key | Free (Google Cloud project, no billing needed for these APIs) | Free tier: 100 requests/month, no card, calls pause at the limit (no overage) |
| Licence | MIT | Apache-2.0 (Google, `googleanalytics/google-analytics-mcp`, PyPI `analytics-mcp`) | MIT (adapter); the data service is hosted by trendsmcp.ai |
| Runs | Locally (stdio) via `uvx` | Locally (stdio) via `uvx` | Hosted HTTP endpoint `https://api.trendsmcp.ai/mcp` |
| Installed as | Claude Code plugin `free-search@free-search-mcp` (user scope) | `claude mcp add analytics-mcp --scope user` | not yet (needs your key) |
| Tools | search, fetch, fetch_batch, read_doc, research, paper_graph, cache_search, engines, compare, extract_structured, download (downloads disabled) | get_account_summaries, get_property_details, list_property_annotations, get_custom_dimensions_and_metrics, run_report, run_realtime_report, run_funnel_report, run_conversions_report, list_google_ads_links | get_time_series, get_growth, get_top_trends |
| Auth | none | Google read-only scope `analytics.readonly` via Application Default Credentials | API key (Bearer) |
| Status (2026-10-16) | **Working**: starts, search returned dated sources (Bing + DuckDuckGo), fetch read a live page, news search works | **Installed, server starts, tools listed; not yet authorised** (needs steps below) | **Not installed** (needs your free account) |

## Free Search MCP: what was changed and why
- `uv` installed with Homebrew (the plugin runs through `uvx`).
- PyPI release 0.13.1 omits the `selectolax<1` cap that its own repository declares, so it crashed at start. The installed plugin's
  `~/.claude/plugins/cache/free-search-mcp/free-search/0.13.1/.mcp.json` runs `uvx --with "selectolax<1" free-search-mcp==0.13.1`
  (original kept as `.mcp.json.orig`). A plugin update replaces this file; if the server then fails with a selectolax ImportError, re-add the pin.
- `~/.config/search-mcp/.env` (mode 600): ChatGPT/Codex auto sign-in off, file downloads off, region India.
- Not enabled, deliberately: the `antigravity` engine (uses a Google sign-in against Google's terms) and `codex` (ChatGPT sign-in).
- Limits: public search engines rate-limit and captcha; any engine may return nothing. Results are leads until the page is fetched.

## Google Analytics MCP: remaining steps (about 10 minutes, once)
The Founder OS portal already reads GA4 on the server; this MCP is for ad-hoc AI analysis in Claude Code.
1. https://console.cloud.google.com → create a project (e.g. `ap-villas-analytics`). No billing account needed.
2. APIs & Services → Library → enable **Google Analytics Admin API** and **Google Analytics Data API**.
3. APIs & Services → OAuth consent screen → External, Testing; add the Google account that can see the GA4 property (apvillasandresorts@gmail.com) as a test user.
4. Credentials → Create credentials → OAuth client ID → **Desktop app** → download the JSON to `~/.config/ap-villas/ga-oauth-client.json` (outside the repo).
5. In Terminal (opens the Google consent page; approve the read-only Analytics access):
   ```
   gcloud auth application-default login --scopes=https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/cloud-platform --client-id-file=$HOME/.config/ap-villas/ga-oauth-client.json
   ```
6. Tell Claude the project ID (not a secret); it updates the server's `GOOGLE_PROJECT_ID` and verifies `get_property_details` for property 558430227 and a basic `run_report`.
Credentials live in `~/.config/gcloud/application_default_credentials.json` (outside the repo). Revoke any time at https://myaccount.google.com/permissions.

## Trends MCP: remaining steps
1. Create a free account at https://www.trendsmcp.ai/account (no card) and copy the API key.
2. In Terminal (the key is typed hidden, never shown or kept in shell history; it is stored only in your user config `~/.claude.json`):
   ```
   read -s "TRENDS_KEY?Trends MCP key: "; claude mcp add --scope user --transport http trends-mcp https://api.trendsmcp.ai/mcp --header "Authorization: Bearer $TRENDS_KEY"; unset TRENDS_KEY
   ```
3. Tell Claude it is added; it verifies one `get_growth` call (1 of your 100 monthly requests).
Queries go to trendsmcp.ai's servers: only public keywords are sent, never AP Villas data. Workflows use at most 5 requests per run and stop at 80/month.

## Security notes
- All servers are user-scope Claude Code config on this Mac; nothing is exposed on a network port; nothing is added to the website.
- No keys or credentials are in this repository. `research/` is git-ignored and not deployed.
- To remove: `claude plugin uninstall free-search@free-search-mcp`, `claude mcp remove analytics-mcp -s user`, `claude mcp remove trends-mcp -s user`.
