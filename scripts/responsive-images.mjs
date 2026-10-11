#!/usr/bin/env node
// Responsive images for the static site.
// 1) Makes 480 / 960 / 1600 px WebP copies of every villa photo, blog photo and any
//    photo used in a page (never upscales; skips copies that are already up to date).
// 2) Rewrites <img> tags in root and blog pages to use the WebP copies with srcset/sizes
//    and width/height (prevents layout shift), preloads blog hero images, and swaps
//    inline background images to WebP. Safe to run repeatedly.
// Usage: npm --prefix scripts install && node scripts/responsive-images.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, normalize, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
process.chdir(ROOT);
const WIDTHS = [480, 960, 1200, 1600];
const RASTER = /\.(jpe?g|png)$/i;
const VARIANT = /-(480|960|1200|1600)\.webp$/;

const walk = d => existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = join(d, e.name);
  return e.isDirectory() ? walk(p) : [p];
}) : [];

const meta = new Map(); // base path -> { w, h, variants: [{w, h, path}] }
async function ensureVariants(base) {
  if (meta.has(base)) return meta.get(base);
  if (!existsSync(base)) return null;
  const src = sharp(base).rotate();
  const { width, height } = await src.metadata().then(m => (m.orientation >= 5 ? { width: m.height, height: m.width } : m));
  const variants = [];
  const stem = base.replace(RASTER, '');
  for (const target of WIDTHS) {
    const w = Math.min(target, width);
    const h = Math.round((height * w) / width);
    const out = `${stem}-${target}.webp`;
    if (!existsSync(out) || statSync(out).mtimeMs < statSync(base).mtimeMs) {
      await sharp(base).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: target >= 1600 ? 72 : 78, effort: 5 }).toFile(out);
    }
    variants.push({ w, h, path: out });
  }
  const info = { w: width, h: height, variants };
  meta.set(base, info);
  return info;
}

// 1) All photo folders
const photos = [...walk('villas'), ...walk('images/blog')].filter(p => RASTER.test(p) && !p.includes('Rudrangan Suites'));
for (const p of photos) await ensureVariants(p);

// 2) Pages
const pages = [...readdirSync('.').filter(f => f.endsWith('.html')), ...readdirSync('blog').filter(f => f.endsWith('.html')).map(f => `blog/${f}`)];
const sizesFor = (tag, file) => {
  if (/article__hero/.test(tag) || (file.startsWith('blog/') && !/blog-card/.test(tag))) return '(max-width: 900px) 100vw, 820px';
  if (/Founder/i.test(tag)) return '(max-width: 900px) 100vw, 45vw';
  return '(max-width: 900px) 100vw, 50vw';
};
let changedPages = 0, rewritten = 0;
for (const file of pages) {
  let html = readFileSync(file, 'utf8');
  const before = html;
  const dir = dirname(file);
  const toRoot = p => normalize(join(dir, p));
  const fromRoot = p => { const r = relative(dir, p); return r.startsWith('.') || dir === '.' ? r : r; };

  // <img> tags
  const tags = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  for (const tag of tags) {
    const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
    if (!src || /^(https?:|data:)/.test(src) || src.includes('assets/brand/') || src.includes('${')) continue;
    let base = toRoot(src);
    if (VARIANT.test(base)) {
      const stem = base.replace(VARIANT, '');
      base = ['.jpg', '.JPG', '.jpeg', '.png'].map(e => stem + e).find(existsSync);
      if (!base) continue;
    }
    if (!RASTER.test(base)) continue;
    const info = await ensureVariants(base);
    if (!info) continue;
    const uniq = info.variants.filter((v, i, a) => a.findIndex(x => x.w === v.w) === i);
    const mid = info.variants.find(v => v.path.endsWith('-960.webp'));
    const srcset = uniq.map(v => `${fromRoot(v.path)} ${v.w}w`).join(', ');
    let t = tag.replace(/\bsrc="[^"]+"/, `src="${fromRoot(mid.path)}"`);
    t = /\bsrcset="/.test(t) ? t.replace(/\bsrcset="[^"]*"/, `srcset="${srcset}"`) : t.replace(/<img\b/, `<img srcset="${srcset}"`);
    if (!/\bsizes="/.test(t)) t = t.replace(/<img\b/, `<img sizes="${sizesFor(tag, file)}"`);
    if (!/\bwidth="/.test(t)) t = t.replace(/<img\b/, `<img width="${mid.w}" height="${mid.h}"`);
    if (/article__hero/.test(t)) t = t.replace(/\s+loading="lazy"/, '');
    if (t !== tag) { html = html.replace(tag, t); rewritten++; }

    // Preload the blog hero (LCP image)
    if (/article__hero/.test(t)) {
      const pre = `<link rel="preload" as="image" href="${fromRoot(mid.path)}" imagesrcset="${srcset}" imagesizes="(max-width: 900px) 100vw, 820px" fetchpriority="high">`;
      // keep the preload identical to the <img> srcset so the browser never downloads twice
      html = /<link rel="preload" as="image" href="[^"]*" imagesrcset="[^"]*"[^>]*>/.test(html)
        ? html.replace(/<link rel="preload" as="image" href="[^"]*" imagesrcset="[^"]*"[^>]*>/, pre)
        : html.replace('</head>', `${pre}\n</head>`);
    }
  }

  // inline background images (e.g. homepage hero)
  html = await (async () => {
    let out = html;
    for (const m of html.matchAll(/url\('([^')]+\.(?:jpe?g|png))'\)/gi)) {
      const base = toRoot(m[1]);
      const info = await ensureVariants(base);
      if (!info) continue;
      const big = info.variants[info.variants.length - 1];
      out = out.replace(m[0], `url('${fromRoot(big.path)}')`);
      // preload only the first background image on the page (the hero)
      if (!/rel="preload" as="image" href="[^"]+-1600\.webp"/.test(out)) {
        out = out.replace('</head>', `<link rel="preload" as="image" href="${fromRoot(big.path)}" fetchpriority="high">\n</head>`);
      }
    }
    return out;
  })();

  if (html !== before) { writeFileSync(file, html); changedPages++; }
}
console.log(`photos: ${meta.size} with WebP variants · pages updated: ${changedPages} · img tags rewritten: ${rewritten}`);
