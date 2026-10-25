#!/usr/bin/env node
// Runs the code-only signal adapters (no Claude): weather, holidays, Hindu calendar → research/signals-auto.json.
// Then: node scripts/push-market.mjs --signals research/signals-auto.json
import { writeFileSync, mkdirSync } from 'node:fs';
import * as weather from './weather.mjs';
import * as holidays from './holidays.mjs';
import * as calendar from './calendar.mjs';
const now = new Date().toISOString(), today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), out = [], report = [];
async function run(name, fn) { try { const rows = await fn(); out.push(...rows); report.push(name + ': ' + rows.length); } catch (e) { report.push(name + ': FAILED ' + e.message); } }
const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
if (!only.length || only.includes('weather')) await run('weather', async () => weather.normalise(await weather.fetchRaw(), now));
if (!only.length || only.includes('holidays')) await run('holidays', async () => holidays.normalise(await holidays.fetchRaw(), now, today));
if (!only.length || only.includes('calendar')) await run('calendar', async () => calendar.normalise(today, 120, now));
mkdirSync('research', { recursive: true });
writeFileSync('research/signals-auto.json', JSON.stringify({ collected_at: now, desk_signals: out }, null, 1));
console.log('signals: ' + report.join(' · ') + ' → research/signals-auto.json (' + out.length + ' rows)');
if (report.some(r => /FAILED/.test(r))) process.exitCode = 0;   // a failing adapter is retried next run; the others still go through
