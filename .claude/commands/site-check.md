---
description: Health check of the website (links, meta/canonical, sitemap, images, mobile layout)
---
Run a full site check and report a short table of problems (file, issue, fix). Fix obvious, safe issues only after asking; then /ship.

1. **Links:** for every root and blog HTML file, every local `href`/`src` must exist (strip `#`/`?`). Check external links with `curl -sI -L -m 10` (report 4xx/5xx only).
2. **Meta:** each page has one `<title>`, a meta description (120–170 chars), `rel="canonical"` = `https://www.apvillasandresorts.in/<path>` (index → `/`), `og:url` equal to canonical, absolute `og:image` that exists, `og:type=article` on posts, valid JSON-LD (parse it). No `apvillas.in`, no `hello@apvillas.in`, no `noindex`.
3. **Sitemap:** run `node scripts/build-sitemap.mjs` in a temp copy or compare: every page is listed, nothing missing/extra; `robots.txt` points to it. Live: `curl -s https://www.apvillasandresorts.in/sitemap.xml`, `/robots.txt`, and headers of `/` with `-A Googlebot` (must be 200, no `X-Robots-Tag: noindex`). Also check `https://apvillasandresorts.in/` redirects to www with a valid certificate.
4. **Images:** every `<img>` has non-empty, honest alt (villa photos never labelled as temples); flag files > 800 KB used on pages; no HEIC referenced.
5. **Blog:** `blog.html` cards match `content/published.json`; posts link to villas/contact/travel.
6. **Mobile:** `npx serve . -l 3000` in background; in the browser pane at 390×844 check index, villas, blog, one post, contact for horizontal scroll (`document.documentElement.scrollWidth > innerWidth`), overlapping floating buttons, unreadable text. Stop the server after.
