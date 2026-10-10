---
description: List open blog PRs and publish (squash-merge) the one I name, then verify it live
argument-hint: [PR number or slug]
---
1. `gh pr list --repo apvillasandresorts/AP-villa-and-resorts-website --label blog-post --state open --json number,title,headRefName,url,labels,statusCheckRollup`.
2. If $ARGUMENTS is empty, show the list (number, title, ✅/❌ checks, preview link) and ask which one to publish. Otherwise match $ARGUMENTS to a PR number or `blog/<slug>` branch.
3. If the PR has the `needs-fixes` label or failing checks, tell me what failed and ask before merging (offer to fix it on the branch first: check out the branch, fix, re-run `node scripts/validate-post.mjs <slug>`, push).
4. Squash-merge: `gh pr merge <n> --squash --delete-branch`.
5. If other blog PRs are open, they may now conflict on blog.html/sitemap.xml/published.json: for each, check `gh pr view <n> --json mergeable`; if conflicting, check out the branch, merge `origin/main`, resolve (keep both cards newest-first, rerun `node scripts/build-sitemap.mjs`, keep both published.json entries), push.
6. Wait for the production deployment, then verify live: `curl -sL "https://www.apvillasandresorts.in/blog/<slug>.html?v=$(date +%s)"` returns 200 and contains the title; the card appears on https://www.apvillasandresorts.in/blog.html; sitemap.xml lists it.
7. Report the live URL.
