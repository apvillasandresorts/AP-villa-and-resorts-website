---
description: Implement a Decision brief from the "AP Villas — Business Advisor" Claude Project (website, facts, pricing, blog, Founder OS), then ship and log it
argument-hint: <paste the DECISION BRIEF block>
---
Implement this decision brief from the business advisor chat:

$ARGUMENTS

1. Parse it (Title, Decision, Why, Changes to make, Owner-only steps, Success metric). If no brief is pasted, ask for it.
2. Check every change against the repo rules in CLAUDE.md before touching anything:
   - Villa/business claims only via content/business-facts.json (then `node scripts/build-villa-pages.mjs` and update villas.html/index.html cards and the compare table).
   - Never change the published reviews, distances or guest counts unless the brief says the owner confirmed new facts; never add paid services; no AI images of real places; no guest data.
   - Pricing changes: website "from" prices live in business-facts.json; reference-rate behaviour lives in the Founder OS pricing settings (portal → Pricing & market → Engine settings), which only the owner can save; OTA rates are owner-only.
   - Blog topics go into content/topics.json (queued) or run /new-post.
   Show me a short plan: each change → files touched, and anything you will NOT do and why (conflicts with facts or rules). Proceed unless something conflicts; if it does, ask.
3. Make the changes, preview anything visible (dev server / mobile width), run `node --test tests/`, asset-version, and commit "Decision: <Title>" locally. Then STOP and ask me to approve publishing; only after a yes: push, wait for Vercel, verify live with curl.
4. Append to research/decisions.md (create with a "# Decision log" heading if missing): date, title, decision, why, what was changed (commit hash + live URLs), owner-only steps still open, success metric + review date.
5. If the brief has a review date, offer to schedule a reminder.
6. Report: what is live (URLs), what is pending for the owner, and remind me to run /advisor-pack so the advisor chat sees the new state.
