import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { loadPackBytes } from './load';
import { odtContentToLines } from './odt';
import { flattenPack } from './types';

// Markup the way LibreOffice Writer saves it: spans, collapsed spaces (<text:s/>), line breaks,
// a numbered list, a picture anchored in a paragraph, a comment and a tracked deletion to ignore.
const CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="o" xmlns:text="t" xmlns:draw="d" xmlns:xlink="x" xmlns:svg="s">
<office:body><office:text>
<text:sequence-decls><text:sequence-decl text:name="Figure"/></text:sequence-decls>
<text:tracked-changes><text:changed-region><text:deletion><text:p>DELETED TEXT</text:p></text:deletion></text:changed-region></text:tracked-changes>
<text:p text:style-name="P1">Преамбула: <text:span text:style-name="T1">прочитати</text:span> учасникам</text:p>
<text:p/>
<text:h text:outline-level="2">ТУР 1</text:h>
<text:p><text:span text:style-name="Bold">Запитання 1.</text:span></text:p>
<text:p><text:span text:style-name="Italic">[Ведучим: читати повільно]</text:span></text:p>
<text:p>Скільки&#160;годин у ДОБІ?<office:annotation><text:p>COMMENT</text:p></office:annotation> Назвіть&lt;число&gt;<text:s text:c="2"/>&amp; все.</text:p>
<text:p>Відповідь: 24</text:p>
<text:p>Коментар: перший рядок<text:line-break/>другий рядок</text:p>
<text:p><draw:frame draw:name="Image1"><draw:image xlink:href="Pictures/clock.png" xlink:type="simple"/><svg:title>alt text</svg:title></draw:frame></text:p>
<text:p>Джерела:</text:p>
<text:list text:style-name="L1">
<text:list-item><text:p>https://example.org/a</text:p></text:list-item>
<text:list-item><text:p>Книга, с. 5</text:p></text:list-item>
</text:list>
<text:p>Автор: Іван Приклад<text:note><text:note-body><text:p>FOOTNOTE</text:p></text:note-body></text:note></text:p>
</office:text></office:body></office:document-content>`;

const META = `<?xml version="1.0"?><office:document-meta xmlns:office="o" xmlns:dc="dc"><office:meta><dc:title>Кубок &amp; Ліга</dc:title></office:meta></office:document-meta>`;

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8AARAwMDAwAAP8E/4vEVbcAAAAASUVORK5CYII='), (c) => c.charCodeAt(0));

async function odt(content = CONTENT, meta: string | null = META) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text');
  zip.file('content.xml', content);
  if (meta) zip.file('meta.xml', meta);
  zip.file('Pictures/clock.png', PNG);
  return (await zip.generateAsync({ type: 'uint8array' })).buffer as ArrayBuffer;
}

describe('.odt packs', () => {
  it('turns the document into lines in reading order', () => {
    const lines = odtContentToLines(CONTENT).filter((l) => l.trim());
    expect(lines).toEqual([
      'Преамбула: прочитати учасникам',
      'ТУР 1',
      'Запитання 1.',
      '[Ведучим: читати повільно]',
      'Скільки годин у ДОБІ? Назвіть<число>  & все.',
      'Відповідь: 24',
      'Коментар: перший рядок',
      'другий рядок',
      '[[image: Pictures/clock.png]]',
      'Джерела:',
      '1. https://example.org/a',
      '2. Книга, с. 5',
      'Автор: Іван Приклад',
    ]);
  });

  it('loads as a pack with the picture shown after the answer', async () => {
    const { pack, objectUrls } = await loadPackBytes(await odt(), () => 'blob:clock');
    const [q] = flattenPack(pack);
    expect(pack.title).toBe('Кубок & Ліга');
    expect(pack.notes).toBe('Преамбула: прочитати учасникам');
    expect(q).toMatchObject({
      text: 'Скільки годин у ДОБІ? Назвіть<число> & все.',
      hostNote: 'Ведучим: читати повільно',
      answer: '24',
      comment: 'перший рядок другий рядок',
      source: '1. https://example.org/a\n2. Книга, с. 5',
      author: 'Іван Приклад',
      answerMedia: { type: 'image', src: 'blob:clock' },
    });
    expect(q.media).toBeUndefined();
    expect(objectUrls).toEqual(['blob:clock']);
  });

  it('explains when the document is not a question pack', async () => {
    const plain = CONTENT.replace(/Запитання 1\./, 'Вступ').replace('Відповідь: 24', 'Текст');
    await expect(loadPackBytes(await odt(plain, null), () => 'blob:x')).rejects.toMatchObject({ issues: [{ key: 'err.notChgkText' }] });
  });
});
