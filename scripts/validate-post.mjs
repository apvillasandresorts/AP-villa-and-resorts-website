#!/usr/bin/env node
// Deterministic checks for a new blog post. No AI, no dependencies.
// Usage: node scripts/validate-post.mjs <slug> [--summary out.json]
// Exits 1 if any check fails.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const slug = process.argv[2];
const summaryPath = process.argv.includes('--summary') ? process.argv[process.argv.indexOf('--summary') + 1] : null;
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('Usage: node scripts/validate-post.mjs <slug>  (lowercase, hyphenated)');
  process.exit(2);
}

const SITE = 'https://www.apvillasandresorts.in';
const WHATSAPP = 'https://wa.me/918999061598?text=Hi%20Apoorv%2C%20I%27d%20like%20to%20enquire%20about%20AP%20Villas.';
const BANNED = ['nestled', 'hidden gem', 'look no further', "in today's world", 'in today’s world', "in today's fast-paced", 'unforgettable experience', 'a must-visit', 'embark on', 'boasts', 'plethora', 'delve', 'rest assured', 'world-class'];
const MIN_WORDS = 1400, MAX_WORDS = 2200;

const errors = [], warnings = [];
const fail = m => errors.push(m);
const file = `blog/${slug}.html`;
if (!existsSync(file)) { console.error(`✗ ${file} does not exist`); process.exit(1); }
const html = readFileSync(file, 'utf8');
const readJSON = p => JSON.parse(readFileSync(p, 'utf8'));

// --- placeholders left over from the template
const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
if (leftover) fail(`Unfilled template placeholders: ${[...new Set(leftover)].join(', ')}`);

// --- article body + word count
const art = html.match(/<article class="article">([\s\S]*?)<\/article>/);
if (!art) fail('No <article class="article"> block');
const body = art ? art[1] : '';
const text = body.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
const words = text.split(/\s+/).filter(w => /[A-Za-z0-9ऀ-ॿ]/.test(w)).length;
if (words < MIN_WORDS || words > MAX_WORDS) fail(`Word count ${words} outside ${MIN_WORDS}–${MAX_WORDS}`);

// --- banned phrases (whole page text, case-insensitive)
const lowerAll = html.replace(/<[^>]+>/g, ' ').toLowerCase();
for (const b of BANNED) if (lowerAll.includes(b)) fail(`Banned phrase: "${b}"`);

// --- structure
const h1 = (html.match(/<h1[\s>]/g) || []).length;
if (h1 !== 1) fail(`Expected exactly 1 <h1>, found ${h1}`);
const h2s = [...body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
if (h2s.length < 4) fail(`Only ${h2s.length} <h2> sections (need ≥4)`);
if (!h2s.some(h => /where to stay/i.test(h))) fail('Missing "Where to stay" H2 section');
if (!h2s.some(h => /^(faq|frequently asked)/i.test(h) || /questions/i.test(h))) fail('Missing FAQ H2 section');
if (!h2s.some(h => /^sources/i.test(h))) fail('Missing "Sources" H2 section');
if (!/verify before (you )?travel/i.test(text)) fail('Missing "verify before you travel" note');

// --- links
const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
const bodyHrefs = [...body.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
for (const req of ['../villas.html', '../contact.html', '../travel.html'])
  if (!bodyHrefs.includes(req)) fail(`Article body must link to ${req}`);
const waCount = bodyHrefs.filter(h => h.replace(/&amp;/g, '&') === WHATSAPP).length;
if (waCount < 2) fail(`Need 2 WhatsApp CTAs with the exact link in the article body, found ${waCount}`);
const related = [...new Set(bodyHrefs.filter(h => /^[a-z0-9-]+\.html$/.test(h) && h !== `${slug}.html`))];
if (related.length < 2) fail(`Need links to ≥2 related posts (e.g. href="mahakaleshwar.html"), found ${related.length}`);
for (const h of hrefs) {
  if (/^(https?:|mailto:|tel:|#|data:)/.test(h)) continue;
  const p = normalize(join(dirname(file), h.split('#')[0].split('?')[0]));
  if (p && !existsSync(p)) fail(`Broken local link: ${h}`);
}
const externalSources = bodyHrefs.filter(h => /^https?:/.test(h) && !h.includes('wa.me') && !h.includes('apvillasandresorts.in'));
if (externalSources.length < 2) fail(`Need ≥2 external source links, found ${externalSources.length}`);

// --- images: must exist and come from the photo library
const library = readJSON('content/photo-library.json').photos;
const libPaths = new Set(library.map(p => p.path));
const imgs = [...html.matchAll(/<img[^>]*src="([^"]+)"[^>]*>/g)];
for (const [tag, src] of imgs) {
  if (src.includes('assets/brand/')) continue;
  const p = normalize(join(dirname(file), src));
  if (!existsSync(p)) fail(`Image missing on disk: ${src}`);
  if (!libPaths.has(p)) fail(`Image not in content/photo-library.json: ${p}`);
  const alt = tag.match(/alt="([^"]*)"/)?.[1] ?? '';
  if (!alt.trim()) fail(`Image without alt text: ${src}`);
  const entry = library.find(x => x.path === p);
  if (entry && !entry.shows_temple && /\b(temple|mandir|jyotirlinga|mahakal lok|ghat)\b/i.test(alt))
    fail(`Alt text "${alt}" describes a temple/ghat, but ${p} is a villa photo`);
}
const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? '';
if (!ogImage.startsWith(`${SITE}/`)) fail('og:image must be an absolute URL on the site');
else if (!existsSync(ogImage.slice(SITE.length + 1))) fail(`og:image file missing: ${ogImage}`);

// --- head meta
const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
if (canonical !== `${SITE}/blog/${slug}.html`) fail(`Canonical should be ${SITE}/blog/${slug}.html, got ${canonical}`);
if (!/<meta property="og:type" content="article">/.test(html)) fail('og:type must be article');
const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
if (desc.length < 110 || desc.length > 170) warnings.push(`Meta description is ${desc.length} chars (aim 120–160)`);

// --- JSON-LD
const types = new Set();
let faqCount = 0;
for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  try {
    const data = JSON.parse(m[1]);
    const nodes = data['@graph'] ?? [data];
    for (const n of nodes) {
      types.add(n['@type']);
      if (n['@type'] === 'FAQPage') faqCount = (n.mainEntity || []).length;
    }
  } catch (e) { fail(`JSON-LD does not parse: ${e.message}`); }
}
for (const t of ['Article', 'BreadcrumbList', 'FAQPage']) if (!types.has(t)) fail(`JSON-LD missing ${t}`);
if (types.has('FAQPage') && faqCount !== 5) fail(`FAQPage should have 5 questions, has ${faqCount}`);

// --- HTML well-formedness (tag balance for common container tags)
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr', 'path', 'rect', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'stop']);
const stack = [];
const stripped = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
for (const m of stripped.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g)) {
  const [, close, rawName, selfClose] = m;
  const name = rawName.toLowerCase();
  if (VOID.has(name) || selfClose || name === '!doctype') continue;
  if (!close) { stack.push(name); continue; }
  if (stack[stack.length - 1] === name) { stack.pop(); continue; }
  fail(`HTML: unexpected </${name}> (open: <${stack[stack.length - 1] ?? 'none'}>)`);
  break;
}
if (stack.length && !errors.some(e => e.startsWith('HTML'))) fail(`HTML: unclosed tags: ${stack.slice(-5).join(', ')}`);

// --- logs: published.json, topics.json, blog.html, sitemap.xml
const published = readJSON('content/published.json').posts;
const same = published.filter(p => p.slug === slug);
if (same.length !== 1) fail(`content/published.json must contain slug "${slug}" exactly once (found ${same.length})`);
const dupSlugs = published.map(p => p.slug).filter((s, i, a) => a.indexOf(s) !== i);
if (dupSlugs.length) fail(`Duplicate slugs in published.json: ${dupSlugs.join(', ')}`);
readJSON('content/topics.json');
const blogIndex = readFileSync('blog.html', 'utf8');
const listBlock = blogIndex.match(/<!-- POSTS:START -->([\s\S]*?)<!-- POSTS:END -->/)?.[1] ?? '';
const firstCard = listBlock.match(/href="(blog\/[^"]+\.html)"/)?.[1];
if (firstCard !== `blog/${slug}.html`) fail(`blog.html: the first card between POSTS markers should link to blog/${slug}.html (found ${firstCard})`);
if ((listBlock.match(new RegExp(`href="blog/${slug}\\.html"`, 'g')) || []).length !== 1) fail('blog.html should link to the new post exactly once');
const sitemap = existsSync('sitemap.xml') ? readFileSync('sitemap.xml', 'utf8') : '';
if (!sitemap.includes(`<loc>${SITE}/blog/${slug}.html</loc>`)) fail('sitemap.xml does not list the new post (run node scripts/build-sitemap.mjs)');

// --- report
const summary = { slug, title: title.replace(/ — AP Villas Journal$/, ''), keyword: same[0]?.keyword ?? '', words, h2: h2s, sources: externalSources, related, errors, warnings };
if (summaryPath) writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
for (const w of warnings) console.log(`⚠ ${w}`);
if (errors.length) {
  for (const e of errors) console.log(`✗ ${e}`);
  console.log(`\n${errors.length} check(s) failed for ${file}`);
  process.exit(1);
}
console.log(`✓ ${file} passed all checks (${words} words, ${externalSources.length} sources, ${related.length} related links)`);
