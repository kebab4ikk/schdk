// Converts a pack in the ЧГК text layout (see src/pack/chgkText.ts) to the app's format, checked
// with the same validation the app uses. Media lines ([[image: media/x.jpg]]) are resolved next to
// the input file; with a .zip output, pack.json and the media go into one archive for the app.
// Usage: npx vite-node scripts/text-to-pack.ts -- input.txt output.(json|zip) "Pack title" [date]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';
import { parseChgkText } from '../src/pack/chgkText';
import { validatePack } from '../src/pack/load';
import { flattenPack } from '../src/pack/types';

const args = process.argv.slice(2).filter((a) => a !== '--');
const [input, output, title, date] = args;
if (!input || !output) {
  console.error('usage: text-to-pack.ts input.txt output.(json|zip) "Title" [date]');
  process.exit(1);
}
const base = dirname(input);
const parsed = parseChgkText(readFileSync(input, 'utf-8'));
const raw = { ...parsed, title: title ?? parsed.title ?? '', date };
const used = new Set<string>();
// Throws with every problem listed, including media files that aren't there.
const pack = validatePack(raw, (src) => {
  if (/^(https?:|data:)/.test(src)) return src;
  if (!existsSync(join(base, src))) return null;
  used.add(src);
  return src;
});

const json = JSON.stringify(raw, null, 2) + '\n';
if (output.endsWith('.zip')) {
  const zip = new JSZip();
  zip.file('pack.json', json);
  for (const src of used) zip.file(src, readFileSync(join(base, src)));
  writeFileSync(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
} else {
  if (used.size) console.warn(`warning: ${used.size} media file(s) are referenced; use a .zip output to include them`);
  writeFileSync(output, json);
}
const flat = flattenPack(pack);
console.log(`${pack.tours.length} tours, ${flat.length} questions, ${used.size} media file(s) → ${output}`);
for (const t of pack.tours) console.log(`  ${t.title}: ${t.questions.length}`);
