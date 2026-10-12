// Read-only check of docs/game-assets/asset-manifest.json against the files on disk.
// Reports: missing files, size/dimension mismatches, files in the source folder that the manifest does not list.
// Usage: node scripts/verify-game-assets.mjs        (needs ffprobe for videos and macOS sips for images)
import fs from 'fs';
import { execFileSync } from 'child_process';

const m = JSON.parse(fs.readFileSync('docs/game-assets/asset-manifest.json', 'utf8'));
const dims = p => {
  if (p.endsWith('.mp4')) {
    const o = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p]).toString().trim().split(',');
    return { width: +o[0], height: +o[1] };
  }
  const o = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', p]).toString();
  return { width: +o.match(/pixelWidth: (\d+)/)[1], height: +o.match(/pixelHeight: (\d+)/)[1] };
};
let problems = 0;
const check = a => {
  if (!fs.existsSync(a.path)) { console.log('MISSING FILE  ', a.id, a.path); problems++; return; }
  const size = fs.statSync(a.path).size, d = dims(a.path);
  if (size !== a.sizeBytes) { console.log('SIZE CHANGED  ', a.id, a.sizeBytes, '→', size); problems++; }
  if (d.width !== a.width || d.height !== a.height) { console.log('DIMS CHANGED  ', a.id, `${a.width}x${a.height} → ${d.width}x${d.height}`); problems++; }
};
m.newAssets.forEach(check);
m.existingLiveAssets.forEach(check);
const listed = new Set(m.newAssets.map(a => a.path));
for (const f of fs.readdirSync(m.sourceFolder)) {
  if (f.startsWith('.')) continue;
  if (!listed.has(m.sourceFolder + f)) { console.log('NOT IN MANIFEST', m.sourceFolder + f); problems++; }
}
const by = {};
for (const a of m.newAssets) by[a.category] = (by[a.category] || 0) + 1;
console.log('\nnew assets:', m.newAssets.length, JSON.stringify(by));
console.log('existing live assets:', m.existingLiveAssets.length, '· marked MISSING:', m.missing.length);
console.log(problems ? `\n${problems} problem(s) found` : '\nAll manifest entries verified against disk.');
process.exit(problems ? 1 : 0);
