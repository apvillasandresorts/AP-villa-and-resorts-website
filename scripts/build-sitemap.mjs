#!/usr/bin/env node
// Regenerates sitemap.xml from every public .html page in the repo root and /blog.
// lastmod = date of the file's last git commit (today if uncommitted or modified).
// Usage: node scripts/build-sitemap.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SITE = 'https://www.apvillasandresorts.in';
const today = new Date().toISOString().slice(0, 10);

const pages = [
  ...readdirSync('.').filter(f => f.endsWith('.html')),
  ...readdirSync('blog').filter(f => f.endsWith('.html')).map(f => `blog/${f}`),
].filter(f => !/noindex/i.test(readFileSync(f, 'utf8').match(/<meta name="robots"[^>]*>/)?.[0] ?? ''));

function lastmod(file) {
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', file], { encoding: 'utf8' }).trim();
    if (dirty) return today;
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { encoding: 'utf8' }).trim();
    return d || today;
  } catch {
    return today;
  }
}

function priority(f) {
  if (f === 'index.html') return '1.0';
  if (['villas.html', 'contact.html'].includes(f)) return '0.9';
  if (f.startsWith('blog/')) return '0.7';
  return '0.8';
}

const order = f => (f === 'index.html' ? 0 : f.startsWith('blog/') ? 2 : 1);
pages.sort((a, b) => order(a) - order(b) || a.localeCompare(b));

const urls = pages.map(f => {
  const loc = f === 'index.html' ? `${SITE}/` : `${SITE}/${f}`;
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod(f)}</lastmod>\n    <priority>${priority(f)}</priority>\n  </url>`;
});

writeFileSync('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
console.log(`sitemap.xml: ${urls.length} URLs`);
