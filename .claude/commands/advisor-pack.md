---
description: Rebuild the knowledge pack for the "AP Villas — Business Advisor" Claude Project (claude.ai) so its context is current
argument-hint: [--summary to include Founder OS performance aggregates]
---
1. Run `node scripts/build-advisor-pack.mjs $ARGUMENTS` (with `--summary` it first refreshes research/summary.json from the Founder OS; skip quietly if the automation key is missing).
2. If research/market.json is older than 30 days, say so and offer /market-scan first.
3. Read each file in research/advisor-pack/ quickly and check: no guest names, phone numbers (other than the business WhatsApp), emails (other than the business email), ID or booking numbers. Fix the generator if anything leaks.
4. Tell me what changed since the last pack (git log since the date in 02-website-and-systems.md if I mention it), and give these steps:
   claude.ai → Projects → "AP Villas — Business Advisor" → Project knowledge: delete the old 01–06 files and upload the new ones from research/advisor-pack/ (Finder: open with `open research/advisor-pack`). Update the Project instructions only if 00-project-instructions.md changed.
5. Run `open research/advisor-pack`.
