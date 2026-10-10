#!/usr/bin/env node
// Real, freely licensed photos from Wikimedia Commons for blog posts. No API key, free.
//
//   node scripts/commons-photo.mjs search "navratri harsiddhi ujjain"
//       → lists candidates (only licences that allow commercial use) with title, size, licence, author, description
//   node scripts/commons-photo.mjs get "File:Example.jpg" <slug> "<honest alt text>" [tag1,tag2]
//       → downloads a 1600px copy to images/blog/<slug>/, adds it to content/photo-library.json with
//         author/licence/source, and prints the path + the credit line to show under the image.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'APVillasBlogBot/1.0 (https://www.apvillasandresorts.in; apvillasandresorts@gmail.com)';
const ALLOWED = /^(cc0|public domain|pd|cc by(-sa)? ?\d(\.\d)?( [a-z]+)?|cc-by(-sa)?-\d(\.\d)?)/i;

const strip = s => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Commons API ${res.status}`);
  return res.json();
}
function info(page) {
  const ii = page.imageinfo?.[0]; if (!ii) return null;
  const m = ii.extmetadata || {};
  return {
    title: page.title,
    width: ii.width, height: ii.height, mime: ii.mime,
    license: strip(m.LicenseShortName?.value),
    licenseUrl: strip(m.LicenseUrl?.value),
    author: strip(m.Artist?.value) || 'Unknown',
    description: strip(m.ImageDescription?.value).slice(0, 220),
    date: strip(m.DateTimeOriginal?.value).slice(0, 20),
    page: ii.descriptionurl,
    thumb: ii.thumburl || ii.url,
  };
}
const usable = x => x && ALLOWED.test(x.license) && /jpeg|png|webp/.test(x.mime) && x.width >= 1000;

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'search') {
  const q = args.join(' ');
  const data = await api({ action: 'query', generator: 'search', gsrnamespace: '6', gsrsearch: q, gsrlimit: '40', prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1600' });
  const list = Object.values(data.query?.pages || {}).map(info).filter(usable);
  if (!list.length) { console.log(`No commercially usable photos for "${q}". Try broader words (e.g. "Ujjain temple", "Shipra ghat", "Harsiddhi").`); process.exit(0); }
  for (const x of list.slice(0, 15)) console.log(`- ${x.title}\n    ${x.width}x${x.height} · ${x.license} · by ${x.author}${x.date ? ' · ' + x.date : ''}\n    ${x.description}`);
} else if (cmd === 'get') {
  const [title, slug, alt, tags = ''] = args;
  if (!title?.startsWith('File:') || !/^[a-z0-9-]+$/.test(slug || '') || !alt) {
    console.error('Usage: node scripts/commons-photo.mjs get "File:Name.jpg" <slug> "<honest alt text>" [tags]'); process.exit(2);
  }
  const data = await api({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1600' });
  const x = info(Object.values(data.query.pages)[0]);
  if (!usable(x)) { console.error(`Not usable: ${x ? x.license + ' ' + x.mime + ' ' + x.width + 'px' : 'not found'}`); process.exit(1); }
  const name = title.slice(5).toLowerCase().replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) + '.jpg';
  const dir = `images/blog/${slug}`; mkdirSync(dir, { recursive: true });
  const path = `${dir}/${name}`;
  const img = await fetch(x.thumb, { headers: { 'User-Agent': UA } });
  if (!img.ok) throw new Error(`Download failed ${img.status}`);
  writeFileSync(path, Buffer.from(await img.arrayBuffer()));
  const credit = `Photo: ${x.author} / Wikimedia Commons, ${x.license}`;
  const lib = JSON.parse(readFileSync('content/photo-library.json', 'utf8'));
  lib.photos = lib.photos.filter(p => p.path !== path);
  lib.photos.push({
    path, villa: 'none', villa_name: 'Not an AP Villas property',
    tags: tags ? tags.split(',') : [], alt, shows_temple: /temple|mandir|jyotirlinga|ghat|aarti|mahakal|harsiddhi|kumbh|simhastha/i.test(alt + ' ' + tags),
    source: 'wikimedia-commons', source_page: x.page, author: x.author, license: x.license, license_url: x.licenseUrl, credit,
  });
  writeFileSync('content/photo-library.json', JSON.stringify(lib, null, 2) + '\n');
  console.log(`Saved ${path}\nCredit (show under the image): ${credit}\nLicence: ${x.licenseUrl || x.page}\nSource: ${x.page}`);
} else {
  console.log('Usage:\n  node scripts/commons-photo.mjs search "<words>"\n  node scripts/commons-photo.mjs get "File:Name.jpg" <slug> "<honest alt text>" [tags]');
}
