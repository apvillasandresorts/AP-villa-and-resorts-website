// Lists the narratable blocks of a journal post (title, headings, paragraphs, list items), in reading order.
// assets/js/journal.js picks the same blocks in the browser, so blog/narration/<slug>.<lang>.json translations line up
// with the page and the paragraph being read can be highlighted.
// Usage: node scripts/narration-blocks.mjs <slug>            → prints the blocks as JSON
//        node scripts/narration-blocks.mjs <slug> --check    → checks blog/narration/<slug>.*.json have the same count
import fs from 'fs';

export function blocks(html) {
  let a = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
  a = a.replace(/<figure[\s\S]*?<\/figure>/g, '').replace(/<div class="article__meta"[\s\S]*?<\/div>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const out = [];
  for (const m of a.matchAll(/<(h1|h2|h3|p|li)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    if (m[1] === 'p' && /text-align:\s*center/.test(m[2])) continue;   // call-to-action buttons
    const t = m[3].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rarr;/g, '→').replace(/&hellip;/g, '…').replace(/&#8377;|&#x20B9;/g, '₹').replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('narration-blocks.mjs')) {
  const slug = process.argv[2];
  const b = blocks(fs.readFileSync(`blog/${slug}.html`, 'utf8'));
  if (process.argv.includes('--check')) {
    let bad = 0;
    for (const lang of ['hi', 'en']) {
      const f = `blog/narration/${slug}.${lang}.json`;
      if (!fs.existsSync(f)) continue;
      const n = JSON.parse(fs.readFileSync(f, 'utf8')).blocks.length;
      console.log(`${f}: ${n} blocks, page has ${b.length}`); if (n !== b.length) bad++;
    }
    process.exit(bad ? 1 : 0);
  }
  console.log(JSON.stringify(b, null, 1));
}
