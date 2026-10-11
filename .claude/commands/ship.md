---
description: Commit and deploy the current website changes to production, then verify on the live URL
argument-hint: [optional commit message]
---
Ship the current changes to https://www.apvillasandresorts.in following the deploy flow in CLAUDE.md.

1. `git status` and `git diff --stat`. If nothing changed, say so and stop. Never stage `.DS_Store`, `.vercel`, secrets or `.env*`.
2. Sanity checks on changed HTML: every page still has `rel="canonical"` (www URL), absolute `og:image`, no `apvillas.in`, no `{{PLACEHOLDER}}`, local links/images exist. If pages were added or removed, run `node scripts/build-sitemap.mjs`. If a blog post changed, run `node scripts/validate-post.mjs <slug>` (old hand-written posts may fail content rules; only block on broken links/JSON-LD).
3. If the change is visual, preview locally with `npx serve . -l 3000` in the background and check desktop + 390px mobile in the browser pane; stop the server after.
3b. Run `node scripts/asset-version.mjs` (cache-busting for CSS/JS).
4. Show me a 2–4 line summary of what will ship. Commit with a clear message ($ARGUMENTS if given), co-author trailer as usual.
5. `git pull --rebase origin main`, then `git push origin main` (never force).
6. Wait for the Vercel production deployment of this commit to be Ready (`vercel ls --prod` or the commit status via `gh api repos/apvillasandresorts/AP-villa-and-resorts-website/commits/<sha>/status`). If it fails, fetch the build logs and fix.
7. Verify live with curl on each changed URL (append `?v=<timestamp>`), grep for a string from the change, check HTTP 200.
8. Report: commit SHA, live URL(s), what was verified.
