// Public website regression checks (node --test tests/). Every public page keeps the shared essentials from CLAUDE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, root), 'utf8');
const pages = [
  ...readdirSync(root).filter(f => f.endsWith('.html') && !f.startsWith('_')),
  ...readdirSync(new URL('blog/', root)).filter(f => f.endsWith('.html')).map(f => 'blog/' + f),
  ...readdirSync(new URL('villas/', root)).filter(f => f.endsWith('.html')).map(f => 'villas/' + f),
];

test('every public page keeps canonical (www), shared script, footer and the Admin link', () => {
  for (const p of pages) {
    const s = read(p);
    if (p !== '404.html') assert.match(s, /<link rel="canonical" href="https:\/\/www\.apvillasandresorts\.in/, p + ' canonical');
    if (p === 'mahakal-game.html') continue;   // full-screen game: no site nav/footer by design
    assert.match(s, /assets\/js\/main\.js\?v=[0-9a-f]{8}"/, p + ' main.js');
    assert.match(s, /<footer/, p + ' footer');
    assert.match(s, /class="footer__admin" href="\/founder\/" rel="nofollow">Admin</, p + ' admin link');
    assert.match(s, /Admin<\/a> · <a class="footer__admin" href="https:\/\/ap-apeiron\.pages\.dev\/" rel="nofollow">AP Apeiron</, p + ' AP Apeiron beside Admin');
  }
});

test('founder portal: noindex, no analytics tag, not in sitemap, disallowed in robots, strict CSP on Vercel', () => {
  const html = read('founder/index.html');
  assert.match(html, /noindex/);
  assert.doesNotMatch(html, /googletagmanager|gtag\(/, 'admin activity is never sent to Google Analytics');
  assert.doesNotMatch(html, /<script>[^<]/, 'no inline scripts (CSP script-src self)');
  assert.doesNotMatch(read('sitemap.xml'), /founder/);
  assert.match(read('robots.txt'), /Disallow: \/founder\//);
  const v = JSON.parse(read('vercel.json')).headers.find(h => h.source.startsWith('/founder'));
  const csp = v.headers.find(h => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /script-src 'self'/); assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(read('founder/app.js'), /\bon(click|load|error)="/, 'no inline event handlers');
});

test('no secrets or real personal data in the founder backend source (the repo is public)', () => {
  for (const f of ['docs/founder-os/FoCore.gs', 'docs/founder-os/FoData.gs', 'founder/app.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /apoorv7519/i, f + ' founder email belongs in Script Properties');
    assert.doesNotMatch(s, /FO_PEPPER['"]?\s*[:=]\s*['"][A-Za-z0-9_-]{10,}/, f + ' pepper');
  }
});
