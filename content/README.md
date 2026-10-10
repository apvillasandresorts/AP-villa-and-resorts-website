# Your blog autopilot: how to use it

Everything here is free. The AI writing runs on your Claude subscription (not a paid API key). The robot that runs it is GitHub Actions (free minutes), and the website is hosted on Vercel.

## 1. Get a new post (the button)
**On your phone:** open the GitHub app → the `AP-villa-and-resorts-website` repository → **Actions** → **Blog post** → **Run workflow**.
- *topic* (optional): type a topic, e.g. "Diwali in Ujjain 2026". Leave it empty and the AI picks something timely or the next topic in the queue.
- *auto_publish*: leave unticked if you want to read the post first.

**From Claude Code on the laptop:** type `/new-post` (or `/new-post Diwali in Ujjain`).

A post also gets written **every morning at 6:00 AM IST**. If a post is already waiting for your approval, the daily run skips, so drafts don't pile up.

## 2. Read and approve (from your phone)
About 10–20 minutes after a run starts you get a **Pull Request** called "New post: …" (GitHub sends you a notification).
1. Open it. The description shows the keyword, word count, sources, and whether the checks passed ✅ or failed ❌.
2. Vercel adds a comment with a **Preview** link. Open it, then go to `/blog/<post-name>.html` to read the post as it will appear.
3. Happy? Press **Merge pull request → Squash and merge → Confirm**. The site updates within about a minute.
   Not happy? Press **Close pull request**. Nothing goes live.

Or in Claude Code: `/publish` shows the waiting posts; `/publish 12` publishes PR #12 and checks it is live.

## 3. Let it publish by itself
Once you trust it: GitHub → repository **Settings → Secrets and variables → Actions → Variables** → set `AUTO_PUBLISH` to `true`. Posts that pass every check then go live automatically. Posts that fail any check always wait for you. Set it back to `false` to review again.

Other variables there:
- `MAX_POSTS_PER_MONTH`: safety cap (default 30).
- `BLOG_MODEL`: which Claude model writes (default `sonnet`, which uses less of your subscription; `opus` writes richer posts but uses more).

## 4. Keep the facts right
The AI may only say about your villas what is written in **`content/business-facts.json`**. Anything marked `TODO` is never mentioned. To change a fact (a price, check-in time, a new amenity):
- Ask Claude Code here, e.g. "check-in is 12 noon, update the facts", or
- Edit the file on github.com (pencil icon) and commit.

Please fill in the TODOs when you can (check-in/out times, exact street address, lift, power backup, AC, geysers, pets, wheelchair access, exact distance per villa).

**Photos:** `content/photo-library.json` lists every real photo the AI may use. Nine photos in `images/` don't say which villa they belong to (marked "unassigned"). Tell Claude which villa each one shows.

**Topics:** `content/topics.json` holds 40 queued topics. Add, remove or reorder freely. `"status": "skip"` hides a topic.

## 5. If runs start failing
Open the failed run in GitHub Actions. The most common cause is an **expired Claude token**. To fix it:
1. On the Mac, open Terminal and run `claude setup-token`. Log in when the browser opens and copy the token it prints.
2. Go to GitHub → repository **Settings → Secrets and variables → Actions** → `CLAUDE_CODE_OAUTH_TOKEN` → **Update**. Paste the token and save.
3. Run the workflow again.

Never paste the token into a chat, an email or a file.

If you see "usage limit" errors, your Claude plan's limit was reached that day. The next run will work. Lower `MAX_POSTS_PER_MONTH` if it keeps happening.

## 6. Any other website change
Open Claude Code in this folder and say what you want ("change Divinestay's price to ₹6,000", "add a Diwali banner"). Then type `/ship`. Claude makes the change, publishes it, checks the live site and gives you the link. `/site-check` runs a health check.
