# Blog writer instructions (followed by the AI on every run)

You are writing ONE new post for the AP Villas Journal (https://www.apvillasandresorts.in/blog.html).
Read these files first, in full:

1. `content/brand-brief.md`: voice, audiences, banned phrases, CTA, internal links
2. `content/business-facts.json`: the ONLY allowed source for claims about our villas
3. `content/photo-library.json`: the ONLY images you may use
4. `content/topics.json` and `content/published.json`: the queue and what already exists
5. `scripts/post-template.html`: the exact page shell to fill
6. `blog/mahakaleshwar.html`: a finished example of our voice and markup

Today's date and any topic override are given in the run prompt.

## Step 1: Pick the topic
- If the run prompt gives a topic, use it (create a slug for it).
- Otherwise, use web search to find what is happening in Ujjain in the next 60 days: festivals, temple schedule changes, Mahakal Sawari dates, Simhastha 2028 announcements, new rules for darshan or Bhasma Aarti, transport changes. Prefer these sources: shrimahakaleshwar.com (and mahakaleshwar.nic.in), mptourism.com, ujjain.nic.in, and major Indian news (The Hindu, Indian Express, Times of India, Hindustan Times, Dainik Bhaskar, Free Press Journal, NDTV).
- If a timely event fits a queued topic in `content/topics.json`, use that topic. If an event is timely and no topic fits, write a new topic with the same fields. Otherwise take the first topic with `"status": "queued"`.
- Never write a slug or title that already exists in `content/published.json` or as a file in `blog/`. Never write a near-duplicate of a published post's main keyword.

## Step 2: Research
- Fetch 3–6 reliable pages. Note every timing, price, date, distance (other than ours), and rule you will state, with its source URL.
- If sources disagree, or you cannot find a source, either leave the detail out or say plainly that it changes and readers should check the official site.
- Do not invent statistics, quotes, crowd numbers or dates.

## Step 3: Write `blog/<slug>.html`
Start from `scripts/post-template.html` and replace every `{{PLACEHOLDER}}`:

| Placeholder | Value |
| --- | --- |
| `{{TITLE}}` | Post title (≤ 65 characters ideally, keyword near the front). Escape `&` as `&amp;`. |
| `{{META_DESCRIPTION}}` | 120–160 characters, includes the keyword, ends with a reason to click. |
| `{{KEYWORDS}}` | 6–10 comma-separated phrases, starting with the main keyword. |
| `{{SLUG}}` | lowercase-hyphenated slug, same as the filename. |
| `{{HERO_IMAGE_PATH}}` | A topic-relevant real photo (see **Photos** below), as its `path` in photo-library.json (no leading `../`). |
| `{{HERO_ALT}}` | The photo's `alt` from photo-library.json, unchanged. |
| `{{HERO_CAPTION}}` | One short line saying what/where the photo is, then the credit for Commons photos, with "Wikimedia Commons" linked to `source_page`: e.g. `Harsiddhi Mata Shaktipeeth lit at night, Ujjain. Photo: Rajveer Bairagi / <a href="…" target="_blank" rel="noopener">Wikimedia Commons</a>, CC BY 4.0`. For our own villa photos just describe the photo. |
| `{{EYEBROW}}` | Short category: Pilgrim Guide, Festival Guide, Itinerary, Day Trip, Where to Stay, Simhastha 2028, City Guide. |
| `{{DATE_ISO}}` / `{{DATE_HUMAN}}` | Today, e.g. `2026-10-10` / `October 2026`. |
| `{{READ_MINUTES}}` | words ÷ 200, rounded. |
| `{{JSON_LD}}` | See below. |
| `{{BODY_HTML}}` | The article body. See below. |

### Body rules
- **Length:** 1,400–2,200 words in the article body.
- **Short answer first:** the first paragraph answers the search question directly in 2–3 sentences (good for Google snippets). Then a warm second paragraph in our voice.
- **Headings:** `<h2>` for sections (at least 5), `<h3>` for sub-points. No `<h1>` in the body (the template has it).
- **Required sections, as `<h2>`:**
  1. Several topic sections (the substance).
  2. `Where to stay` (e.g. "Where to stay near Mahakaleshwar for this trip"): uses ONLY `content/business-facts.json`. 180–320 words of gentle, helpful marketing, not a hard sell:
     - one sentence with the shared facts (all five villas within 2 km, complimentary Mahakal shuttle);
     - a **Rudrangan Suites spotlight**: an `<h3>` naming it, a `<figure class="post-figure">` with a real photo from `villas/rudrangan/` (library alt text; caption "A bedroom at Rudrangan Suites…" or similar), and a paragraph tying its facts to this post's reader (newest villa opened 2026, designer finishes, garden seating, 3 bedrooms/sleeps 6, from-price, lift, wheelchair friendly, pets welcome, kitchen with induction, check-in/out times when useful);
     - a short list of 1–3 other villas for larger or different groups;
     - caretaker help with Bhasma Aarti, link `../villas.html`;
     - link every villa you name to its own page: `../villas/<page_slug>.html` (page_slug is in business-facts.json, e.g. `../villas/rudrangan-suites.html`).
     Never state anything marked TODO. Then the first CTA.
  3. `Frequently asked questions`: exactly 5 questions as `<h3>` with a `<p>` answer each (40–80 words). The same 5 Q&As go into FAQPage JSON-LD, word for word.
  4. `Sources`: a `<ul>` of every external page you used, as links with `target="_blank" rel="noopener"`, followed by: `<p><em>Timings, prices and dates change, especially on festival days. Please verify before you travel with the official temple or government site.</em></p>`
- **Inline sourcing:** next to any timing, price, date or rule, either link the source inline or make sure it is in Sources.
- **CTAs:** exactly two WhatsApp CTAs in the body, using the exact link from brand-brief.md:
  `<p style="text-align:center;"><a class="btn btn--primary" href="https://wa.me/918999061598?text=Hi%20Apoorv%2C%20I%27d%20like%20to%20enquire%20about%20AP%20Villas." target="_blank" rel="noopener">Message us on WhatsApp</a></p>`
  One after "Where to stay", one just before the sign-off.
- **Internal links (in body text):** `../villas.html`, `../contact.html`, `../travel.html`, and 2 related posts from published.json (same folder, so `href="mahakaleshwar.html"`). Use descriptive anchor text, not "click here".
- **Sign-off:** end with `<p style="font-style: italic; color: var(--muted);">— Apoorv, Founder, AP Villas & Resorts</p>` like the example post.
- **Images:** see **Photos** below. Never use AI-generated images, stock photos, or hotlinked images.
- **Style:** follow brand-brief.md. None of the banned phrases. Indian English. No emoji in headings.

## Photos (hero and in-body)
Readers should see the real place or event the post is about, e.g. a Navratri post shows the Harsiddhi lamp towers lit, a Simhastha post shows the Kumbh ghats. Priority:
1. **Owner photos** already in `content/photo-library.json` that match the topic (`source` "owner", or tags that fit).
2. **Wikimedia Commons** (free, real photos, licences that allow commercial use; the script rejects others):
   - `node scripts/commons-photo.mjs search "harsiddhi navratri ujjain"`: try 2–4 searches (event + temple + Ujjain; then broader, e.g. "Ujjain ghat", "Mahakaleshwar temple").
   - Pick the photo that most truly shows the topic, prefers festival/people/lamps over empty buildings, is sharp and ≥1000px. Read its description: it must really be in Ujjain (or the place the post covers).
   - `node scripts/commons-photo.mjs get "File:<exact title>" <slug> "<honest alt: what the photo shows and where>" "<tags>"`. This downloads to `images/blog/<slug>/` and adds the library entry with author/licence. Use the printed credit in the caption.
   - Never claim a photo shows something it doesn't (e.g. a Harsiddhi photo is not "Mahakaleshwar"; a 2010 photo is not "this year").
3. Only if nothing relevant exists: a villa photo, captioned honestly as our villa.
Use 1–2 Commons photos per post (hero + optionally one *different* photo in the body; never repeat the hero), plus the Rudrangan Suites photo in "Where to stay". Every Commons photo must be inside `<figure class="post-figure">` with a `<figcaption>` that contains the credit.

### JSON-LD
Put one object with an `@graph` array:
- `Article`: headline, description (= meta description), image `[absolute hero URL]`, datePublished, dateModified (today), author `{ "@type": "Person", "name": "Apoorv", "url": "https://www.apvillasandresorts.in/about.html" }`, publisher `{ "@type": "Organization", "name": "AP Villas & Resorts", "logo": { "@type": "ImageObject", "url": "https://www.apvillasandresorts.in/assets/brand/logo-full-1200.png" } }`, mainEntityOfPage (canonical URL), inLanguage `en-IN`.
- `BreadcrumbList`: Home (`https://www.apvillasandresorts.in/`) → Journal (`…/blog.html`) → this post.
- `FAQPage`: the 5 Q&As (`Question` with `name`, `acceptedAnswer` `Answer` with `text`), plain text.
It must be valid JSON (double quotes, no trailing commas).

## Step 4: Update the site files
1. **`blog.html`**: insert a new card as the FIRST item right after `<!-- POSTS:START -->`, same markup as the existing cards:
   (HERO_IMAGE_PATH is the post's hero; for the card use the same photo.)
   ```html
   <article class="blog-card reveal">
     <a href="blog/SLUG.html" style="display:contents;">
       <div class="blog-card__media">
         <img src="HERO_IMAGE_PATH" alt="HERO_ALT" loading="lazy">
         <span class="blog-card__tag">EYEBROW</span>
       </div>
       <div class="blog-card__body">
         <h3>TITLE</h3>
         <p>One or two sentences, ≤ 200 characters.</p>
         <span class="blog-card__link">Read article →</span>
       </div>
     </a>
   </article>
   ```
2. **`content/published.json`**: append `{ "slug", "title", "url": "blog/SLUG.html", "date", "cluster", "keyword", "source": "ai-pipeline", "hero": "HERO_IMAGE_PATH", "sources": [urls] }`.
3. **`content/topics.json`**: set the chosen topic's `status` to `"published"` (add it first if it was new).
4. **`sitemap.xml`**: run `node scripts/build-sitemap.mjs`.
5. Run `node scripts/validate-post.mjs SLUG` and fix every ✗ until it passes.

## Step 5: Finish
Do not run git. Do not edit any other file (new photos under `images/blog/<slug>/` and their `content/photo-library.json` entries are allowed). Reply with one line: `SLUG=<slug>`.
