---
description: Generate a new blog post now with the GitHub Actions pipeline (runs on the Claude subscription)
argument-hint: [optional topic]
---
Start the blog pipeline and bring back the PR + preview link.

1. Run: `gh workflow run blog.yml --repo apvillasandresorts/AP-villa-and-resorts-website -f topic="$ARGUMENTS" -f auto_publish=false` (omit `-f topic` if no topic was given).
2. Wait a few seconds, find the run: `gh run list --workflow blog.yml --limit 1 --json databaseId,url,status`, then `gh run watch <id> --exit-status` (runs take ~10–20 min; use run_in_background and report progress).
3. When done: `gh pr list --label blog-post --state open --json number,title,url,headRefName --limit 5`. For the new PR, get the Vercel preview URL from the PR comments / deployment status (`gh pr view <n> --comments`, or `gh api repos/apvillasandresorts/AP-villa-and-resorts-website/deployments?ref=<branch>` → statuses → environment_url).
4. Report: title, keyword, word count, checks status (✅ or the failing items), PR link, preview link to `/blog/<slug>.html`. Remind me: "/publish <number>" to put it live.
5. If the run failed, read `gh run view <id> --log-failed`, explain in plain words and propose the fix (e.g. expired token → run `claude setup-token` and update the secret).
