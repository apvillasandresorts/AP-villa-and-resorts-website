// Turns the single Rudrangan Suites photo in a post's "Where to stay" section into a three-photo collage
// (the original photo large, two more real Rudrangan photos beside it). Photos already used in the post are skipped.
// Usage: node scripts/photo-trio.mjs [blog/<slug>.html …]   (no arguments = every post)
import fs from 'fs';

const lib = JSON.parse(fs.readFileSync('content/photo-library.json', 'utf8'));
const photos = Array.isArray(lib) ? lib : (lib.photos || Object.values(lib).find(Array.isArray));
const altOf = p => (photos.find(x => x.path === p) || {}).alt || 'A room at Rudrangan Suites, AP Villas Ujjain';
const PREFER = ['IMG_4013', 'IMG_3997', 'IMG_4015', 'IMG_4027', 'IMG_4011', 'IMG_4024', 'IMG_4016', 'IMG_4021', 'IMG_4022'];

const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('blog').filter(f => f.endsWith('.html')).map(f => 'blog/' + f);
for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  const re = /<figure class="post-figure">\s*(<img[^>]*src="\.\.\/villas\/rudrangan\/(IMG_\d+)-960\.webp"[^>]*>)\s*(<figcaption>[\s\S]*?<\/figcaption>)\s*<\/figure>/;
  const m = html.match(re);
  if (!m) continue;
  const used = new Set([...html.matchAll(/<img[^>]*src="[^"]*villas\/rudrangan\/(IMG_\d+)/g)].map(x => x[1]));   // photos shown in the post (not the gallery data)
  const extra = PREFER.filter(n => !used.has(n)).slice(0, 2);
  if (extra.length < 2) continue;
  const img = n => `<img width="960" height="1707" sizes="(max-width: 900px) 40vw, 300px" srcset="../villas/rudrangan/${n}-480.webp 480w, ../villas/rudrangan/${n}-960.webp 960w" src="../villas/rudrangan/${n}-960.webp" alt="${altOf('villas/rudrangan/' + n + '.jpg')}" loading="lazy">`;
  const trio = `<figure class="post-figure post-figure--trio"><div class="trio">${m[1]}${extra.map(img).join('')}</div>${m[3]}</figure>`;
  html = html.replace(m[0], trio);
  fs.writeFileSync(file, html);
  console.log(file, '→', m[2], '+', extra.join(', '));
}
