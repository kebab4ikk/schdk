// Converts a pack in the ЧГК text layout (a .txt, or an .odt document) to the app's format, checked
// with the same validation the app uses. In a .txt, media lines ([[image: media/x.jpg]]) are
// resolved next to the input file; an .odt brings its own pictures. With a .zip output, pack.json
// and the media go into one archive for the app.
// Usage: npx vite-node scripts/text-to-pack.ts -- input.(txt|odt) output.(json|zip) ["Pack title"] [date]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';
import { parseChgkText } from '../src/pack/chgkText';
import { odtContentToLines } from '../src/pack/odt';
import { validatePack } from '../src/pack/load';
import { flattenPack } from '../src/pack/types';

const args = process.argv.slice(2).filter((a) => a !== '--');
const [input, output, title, date] = args;
if (!input || !output) {
  console.error('usage: text-to-pack.ts input.txt output.(json|zip) "Title" [date]');
  process.exit(1);
}
const base = dirname(input);
// Media files by their path in the pack: from the .odt itself, or from disk next to a .txt.
const files = new Map<string, Buffer>();
let parsed: ReturnType<typeof parseChgkText>;
let docTitle: string | undefined;
if (input.endsWith('.odt')) {
  const odt = await JSZip.loadAsync(readFileSync(input));
  const content = await odt.file('content.xml')!.async('string');
  parsed = parseChgkText(odtContentToLines(content).join('\n'));
  docTitle = (await odt.file('meta.xml')?.async('string'))?.match(/<dc:title>([^<]*)<\/dc:title>/)?.[1]?.trim() || undefined;
  for (const f of Object.values(odt.files)) if (!f.dir && f.name.startsWith('Pictures/')) files.set(f.name, await f.async('nodebuffer'));
} else {
  parsed = parseChgkText(readFileSync(input, 'utf-8'));
}
const raw = { ...parsed, title: title || docTitle || parsed.title || '', date };
const used = new Set<string>();
// Throws with every problem listed, including media files that aren't there.
const pack = validatePack(raw, (src) => {
  if (/^(https?:|data:)/.test(src)) return src;
  if (!files.has(src)) {
    if (!existsSync(join(base, src))) return null;
    files.set(src, readFileSync(join(base, src)));
  }
  used.add(src);
  return src;
});

const json = JSON.stringify(raw, null, 2) + '\n';
if (output.endsWith('.zip')) {
  const zip = new JSZip();
  zip.file('pack.json', json);
  for (const src of used) zip.file(src, files.get(src)!);
  writeFileSync(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
} else {
  if (used.size) console.warn(`warning: ${used.size} media file(s) are referenced; use a .zip output to include them`);
  writeFileSync(output, json);
}
const flat = flattenPack(pack);
console.log(`${pack.tours.length} tours, ${flat.length} questions, ${used.size} media file(s) → ${output}`);
for (const t of pack.tours) console.log(`  ${t.title}: ${t.questions.length}`);
