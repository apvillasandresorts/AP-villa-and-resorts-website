#!/usr/bin/env node
// Builds the knowledge pack for the "AP Villas — Business Advisor" Claude Project (claude.ai → Projects).
// Output: research/advisor-pack/ (git-ignored: it can hold private figures; this repo is public). Upload every file in it to the
// Project's knowledge and paste 00-project-instructions.md into the Project instructions. Re-run monthly or after big changes.
// Usage: node scripts/build-advisor-pack.mjs            (uses research/summary.json if present for performance figures)
//        node scripts/build-advisor-pack.mjs --summary  (first refreshes research/summary.json from the Founder OS; needs the automation key)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = 'research/advisor-pack', today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const read = f => existsSync(f) ? readFileSync(f, 'utf8') : '';
const json = f => { try { return JSON.parse(read(f)); } catch { return null; } };
const sh = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const html2md = h => h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '')
  .replace(/<h1[^>]*>/g, '\n# ').replace(/<h2[^>]*>/g, '\n## ').replace(/<h3[^>]*>/g, '\n### ').replace(/<li[^>]*>/g, '\n- ')
  .replace(/<\/(td|th)>/g, ' | ').replace(/<tr[^>]*>/g, '\n| ').replace(/<(p|div|table|ul)[^>]*>/g, '\n').replace(/<br\s*\/?>/g, '\n')
  .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, '$2 ($1)').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();

if (process.argv.includes('--summary')) {
  try { execFileSync('node', ['scripts/push-market.mjs', '--summary', 'research/summary.json'], { stdio: 'inherit' }); } catch { console.log('Could not refresh the summary (automation key missing?). Continuing with what exists.'); }
}
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });
const files = {};

// 00 — Project instructions (pasted into the Project's "instructions" box, also uploaded for reference)
files['00-project-instructions.md'] = `# AP Villas — Business Advisor (Claude Project instructions)

You are the business advisor and strategy partner for Apoorv, founder of AP Villas & Resorts: five owner-operated whole villas within
2 km of Mahakaleshwar Jyotirlinga, Ujjain ("Where devotion feels at home"). The project knowledge holds the business facts, the
website and systems map, the content plan, the latest market research and (when available) performance figures, built on ${today}.

How to work:
- Ground every answer in the knowledge files. Facts about the villas come only from 01-business-and-villas.md; never state anything
  marked TODO as fact. Say which file a figure came from. If something is not in the files, say "not in my files" and suggest how to get it.
- Label claims: [FACT] (from a file or a cited source), [ESTIMATE] (show the calculation), [HYPOTHESIS] (say what would confirm it),
  [RECOMMENDATION]. Never invent competitor prices, occupancy, revenue, reviews or footfall. Public prices are dated asking prices.
- Think like an owner of a small, high-trust pilgrim-family business: cash, occupancy, ADR, direct bookings vs OTA commission,
  reviews, festival peaks (Shravan, Mahashivratri, Navratri, Kartik, Simhastha 2028), guest experience, and the founder's time.
- Hard constraints: zero paid services or tools unless Apoorv explicitly approves a cost; no AI images of the temple, Ujjain or the
  villas; never change the published reviews, distances or guest counts; no guest personal data anywhere.
- Be direct: give a recommendation, the 2–3 options you rejected and why, the risk, and the metric that will show if it worked.
- Answer in the language Apoorv writes in (English or Hindi/Hinglish).

When a decision is made, end with a **Decision brief** in exactly this format, so Apoorv can paste it into Claude Code (the website
and Founder OS console) with \`/decision\`:

\`\`\`
DECISION BRIEF
Title: <short name>
Date: <YYYY-MM-DD>
Decision: <one or two sentences>
Why: <evidence, with file names / sources>
Changes to make:
- [website|facts|pricing|blog|founder-os|ota|offline] <exact change, e.g. "business-facts.json: AP Suite from_price_inr_per_night 4200 → 4500">
Owner-only steps: <things only Apoorv can do: OTA extranet edits, payments, approvals>
Success metric: <metric, target, review date>
\`\`\`
Only list changes Apoorv agreed to. Website/system changes go in "Changes to make"; anything needing logins, money or other people
goes in "Owner-only steps".
`;

// 01 — Business and villas
const facts = json('content/business-facts.json') || {};
const villas = (facts.villas || facts.properties || []).map(v => {
  const known = Object.entries(v).filter(([k, val]) => !/^_|photo|hero|page/.test(k) && !(typeof val === 'string' && val.startsWith('TODO')));
  return `### ${v.name}\n` + known.map(([k, val]) => `- ${k}: ${Array.isArray(val) ? val.join('; ') : typeof val === 'object' ? JSON.stringify(val) : val}`).join('\n');
}).join('\n\n');
const flat = (o, pre = '') => Object.entries(o || {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) =>
  `- ${pre}${k}: ${Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');
files['01-business-and-villas.md'] = `# AP Villas & Resorts — business facts (source: content/business-facts.json, ${today})
Anything not listed here, or marked TODO in the source, is unknown and must not be stated as fact.

## Business
${flat(facts.business)}

## Shared facts (all villas)
${flat(facts.shared_facts)}

## Villas
${villas}

---
# Brand brief (content/brand-brief.md)
${read('content/brand-brief.md')}
`;

// 02 — Website and systems map
const site = 'https://www.apvillasandresorts.in';
const pages = readdirSync('.').filter(f => f.endsWith('.html') && !f.startsWith('_')).map(f => `- ${site}/${f === 'index.html' ? '' : f}`).join('\n');
const villaPages = existsSync('villas') ? readdirSync('villas').filter(f => f.endsWith('.html')).map(f => `- ${site}/villas/${f}`).join('\n') : '';
const commits = sh('git', ['log', '-25', '--date=short', '--format=- %ad %s']).split('\n').map(l => l.length > 240 ? l.slice(0, 240) + '…' : l).join('\n');
files['02-website-and-systems.md'] = `# Website, Founder OS and automation (${today})

## Live pages
${pages}
${villaPages}

## What exists (from the repo's CLAUDE.md)
${read('CLAUDE.md').replace(/^# .*\n/, '')}

## Founder OS (private portal ${site}/founder/)
${read('docs/founder-os/README.md')}

## Research and market-intelligence stack
${read('docs/research-stack.md')}

## Recent changes (git log, newest first)
${commits}
`;

// 03 — Content and SEO
const pub = (json('content/published.json') || {}).posts || [], topics = (json('content/topics.json') || {}).topics || [];
files['03-content-and-seo.md'] = `# Journal (blog) content plan (${today})
Daily AI pipeline writes one post at a time (pauses while a post awaits approval); every post features Rudrangan Suites and has Hindi narration.

## Published (${pub.length})
${pub.map(p => `- ${p.date} · ${p.title} · keyword "${p.keyword}" · cluster ${p.cluster} · ${site}/${p.url}`).join('\n')}

## Topic queue
${topics.filter(t => t.status !== 'published').map(t => `- [${t.status}] ${t.title} · keyword "${t.keyword}" · ${t.intent} · cluster ${t.cluster}`).join('\n')}
`;

// 04 — Market (latest report + data)
const mk = json('research/market.json');
const rep = read('research/market-report.html');
files['04-market-latest.md'] = `# Latest market intelligence (${mk ? 'data collected ' + mk.collected_at : 'no market data yet'})
${rep ? html2md(rep) : 'No market report yet. Run /market-scan report in Claude Code.'}
${mk ? `\n## Raw observations (${mk.rates.length} dated public prices)\n| Competitor | Stay date | Nights | ₹/night | Unit | Taxes incl. | Source |\n|---|---|---|---|---|---|---|\n` +
  mk.rates.map(r => `| ${r.competitor} | ${r.stay_date || '—'} | ${r.nights} | ${r.price_per_night} | ${r.unit_type} | ${r.taxes_included} | ${r.source_url} |`).join('\n') +
  `\n\n## Demand signals\n` + mk.signals.map(s => `- ${s.keyword}: ${s.value} (${s.period}; ${s.notes}) ${s.source_url}`).join('\n') : ''}
`;

// 05 — Performance (private aggregates from the Founder OS; never guest data)
const sum = json('research/summary.json');
files['05-performance.md'] = sum ? `# Performance aggregates from the Founder OS (research/summary.json)
No guest personal data. Metric definitions: founder/metrics.js (occupancy = occupied nights / available nights; ADR = room revenue / occupied nights; RevPAR = room revenue / available nights).

\`\`\`json
${JSON.stringify(sum, null, 1).slice(0, 60000)}
\`\`\`
` : `# Performance
Not included yet: the Founder OS summary needs the automation key (portal → Settings → Automation, then save it locally as described in
docs/research-stack.md) and \`node scripts/build-advisor-pack.mjs --summary\`. Until then, ask Apoorv for figures or a booking export.
`;

// 06 — Decision log (kept by /decision in Claude Code)
files['06-decision-log.md'] = read('research/decisions.md') || '# Decision log\nNo decisions recorded yet. Claude Code appends each implemented Decision brief here.\n';

for (const [f, c] of Object.entries(files)) writeFileSync(`${OUT}/${f}`, c);
const size = Object.values(files).reduce((n, c) => n + c.length, 0);
console.log(`Advisor pack written to ${OUT}/ (${Object.keys(files).length} files, ${Math.round(size / 1024)} KB):`);
Object.keys(files).forEach(f => console.log('  ' + f));
if (/\b[6-9]\d{9}\b/.test(Object.values(files).slice(1).join('').replace(/918999061598|8999061598|89990 61598/g, ''))) console.log('WARNING: a phone-number-like string was found; check the pack before uploading.');
