#!/usr/bin/env node
// Adds ?v=<content hash> to the shared CSS/JS links in every page so browsers
// always load the current file after a deploy. Run before every /ship.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const assets = ['assets/css/style.css', 'assets/js/main.js', 'assets/js/journal.js'];
const hash = f => createHash('sha1').update(readFileSync(f)).digest('hex').slice(0, 8);
const ver = Object.fromEntries(assets.map(a => [a, hash(a)]));
const pages = [
  ...readdirSync('.').filter(f => f.endsWith('.html')),
  ...['blog', 'villas'].flatMap(d => existsSync(d) ? readdirSync(d).filter(f => f.endsWith('.html')).map(f => `${d}/${f}`) : []),
  'scripts/post-template.html',
];
let changed = 0;
for (const p of pages) {
  let s = readFileSync(p, 'utf8'); const o = s;
  for (const a of assets) {
    const re = new RegExp(`((?:\\.\\./|/)?${a.replace(/[./]/g, m => '\\' + m)})(\\?v=[0-9a-f]+)?"`, 'g');
    s = s.replace(re, `$1?v=${ver[a]}"`);
  }
  if (s !== o) { writeFileSync(p, s); changed++; }
}
// Founder portal (/founder/): its own files, linked relatively from founder/index.html
if (existsSync('founder/index.html')) {
  let f = readFileSync('founder/index.html', 'utf8'); const o = f;
  for (const a of ['founder.css', 'metrics.js', 'charts.js', 'app.js']) {
    f = f.replace(new RegExp(`(${a.replace('.', '\\.')})(\\?v=[0-9a-f]+)?"`, 'g'), `$1?v=${hash('founder/' + a)}"`);
  }
  if (f !== o) { writeFileSync('founder/index.html', f); changed++; }
}
console.log('asset versions', ver, 'pages updated', changed);
