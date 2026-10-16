---
description: Run the market research now on this Mac (competitors, dated public prices, demand signals; optional full report) and send it to the Founder OS
argument-hint: [report]
---
Run the market research job locally. Follow `content/market-research-instructions.md` and `content/research-rules.md` exactly.

1. Use the Free Search MCP (`search`, `fetch`, `fetch_batch`, `extract_structured`) for every lookup; read prices and figures from fetched pages only. Public engines can be blocked or incomplete: rephrase or try other engines, and note thin coverage.
2. Write `research/market.json`; if `$ARGUMENTS` contains "report", also write `research/market-report.html` (the full Market Intelligence Report).
3. Run `node scripts/market-validate.mjs research/market.json` and fix every error.
4. Send it: `node scripts/push-market.mjs research/market.json` (add `--report research/market-report.html --period <YYYY-MM>` for the report). If it says there is no automation key, tell me to create one in the portal (Settings → Automation) and store it with:
   `mkdir -p ~/.config/ap-villas && read -s "K?Key: " && printf %s "$K" > ~/.config/ap-villas/founder-os-key && chmod 600 ~/.config/ap-villas/founder-os-key && unset K`
5. Tell me how many competitors, prices and signals were sent, and where to see them (portal → Pricing & market).
