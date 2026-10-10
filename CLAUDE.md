# AP Villas website: project memory

AP Villas, Mahakal Collection: five owner-operated villas within 2 km of Mahakaleshwar Jyotirlinga, Ujjain. Owner: Apoorv.
This repo is the whole public website. Claude Code in this folder is the permanent deploy console: edit, preview, ship, verify live.

## Facts
- Repo: github.com/apvillasandresorts/AP-villa-and-resorts-website, branch `main` (production).
- Static HTML/CSS/JS. No framework, no build step. Hosting: Vercel (Git integration; every push to `main` deploys production, every other branch gets a preview URL).
- Live site (canonical): **https://www.apvillasandresorts.in** (bare `apvillasandresorts.in` should redirect to www). Never use `apvillas.in` (dead domain).
- Contact: WhatsApp +91 89990 61598 (`https://wa.me/918999061598?text=Hi%20Apoorv%2C%20I%27d%20like%20to%20enquire%20about%20AP%20Villas.`), email apvillasandresorts@gmail.com.
- Ignore the sibling folders `ap-villa-test-website`, "New project", "demo trial" (old experiments) and `.claude/worktrees/`.

## Folder map
| Path | What |
| --- | --- |
| `index.html`, `villas.html`, `gallery.html`, `menu.html`, `travel.html`, `blog.html`, `about.html`, `contact.html`, `mahakal-game.html` | Site pages |
| `blog/*.html` | Journal posts. `blog.html` lists them between `<!-- POSTS:START -->` / `<!-- POSTS:END -->` (newest first) |
| `assets/css/style.css`, `assets/js/main.js`, `assets/brand/` | Shared styles, script (nav, reveal, gallery modal, rule-based chatbot), logos/favicons |
| `villas/<villa>/` | Real villa photos (use these paths). `images/`, `img/`, `business/`, `assets/*.jpg` are duplicate copies |
| `content/` | Blog pipeline inputs: brand brief, business facts, photo library, topics, published log, writer instructions, README for the owner |
| `scripts/post-template.html` | Page shell for new posts |
| `scripts/build-sitemap.mjs` | Regenerates `sitemap.xml` (run after adding/removing pages) |
| `scripts/validate-post.mjs <slug>` | Checks a new post (word count, links, images, JSON-LD, logs) |
| `.github/workflows/blog.yml` | Daily/one-click AI blog pipeline (Claude subscription token) |
| `robots.txt`, `sitemap.xml` | SEO |

## Content rules (always)
- Property claims only from `content/business-facts.json`. Never state anything marked TODO.
- Only real photos; never AI images of the temple, Ujjain or the villas. Alt text must describe what the photo really shows (villa photos are not temple photos).
- Every page keeps: `<link rel="canonical">` with the www URL, absolute `og:image`, the shared nav/footer, the floating WhatsApp/email/concierge buttons, `assets/js/main.js`.
- New pages: add them to nav/footer if they should be visible, then `node scripts/build-sitemap.mjs`.
- Voice: warm, humble pilgrim-family host (see `content/brand-brief.md`).
- No paid services or plans without asking the owner. Never commit secrets. Never force-push.

## Deploy flow (use for every change; `/ship` does this)
1. Edit files.
2. Preview locally: `npx serve . -l 3000` and open http://localhost:3000 (check desktop + mobile width).
3. `node scripts/build-sitemap.mjs` if pages were added/removed.
4. `git status` / `git diff` → `git add <files>` → `git commit -m "<clear message>"` (no `.DS_Store`).
5. `git pull --rebase origin main` then `git push origin main`.
6. Wait for the production deployment: `vercel ls ap-villa-and-resorts-website --prod` (or `gh api repos/apvillasandresorts/AP-villa-and-resorts-website/commits/main/status`) until Ready.
7. Verify live: `curl -sL https://www.apvillasandresorts.in/<page> | grep "<changed text>"` (add `?v=$(date +%s)` to dodge cache).
8. Report the live URL(s) to the owner.

## Common tasks
- **Change a price / amenity / villa detail:** update `villas.html` (and `index.html` cards if shown) AND `content/business-facts.json` so the blog stays in sync. `/ship`.
- **New blog post now:** `/new-post [topic]` (runs the GitHub workflow). **Publish one:** `/publish <PR number or slug>`.
- **Health check:** `/site-check`.
- **Add photos:** put JPGs in `villas/<villa>/` (no HEIC; convert with `sips -s format jpeg in.heic --out out.jpg`), add to the gallery data in the pages, add entries to `content/photo-library.json` with honest tags/alt.
- **Blog token expired** (workflow fails on auth): owner runs `claude setup-token` in Terminal, then updates repo secret `CLAUDE_CODE_OAUTH_TOKEN`.
