/**
 * Reads the text of an OpenDocument text file (.odt, as saved by LibreOffice or Google Docs) in
 * reading order, one line per paragraph, so the ЧГК text parser can take it from there.
 * Pictures become "[[image: Pictures/…]]" lines where they sit; numbered list items get "1. ",
 * "2. " … (the numbers live in list styles, not in the text).
 *
 * A small tokenizer instead of DOMParser, so this runs the same in the browser and in tests.
 */

const SKIP = new Set([
  'office:annotation', // comments
  'text:tracked-changes', // deleted text kept for change tracking
  'text:note', // footnotes and endnotes
  'svg:title',
  'svg:desc',
  'text:sequence-decls',
]);

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`).exec(tag);
  return m ? decode(m[1]) : undefined;
}

export function odtContentToLines(xml: string): string[] {
  const body = xml.indexOf('<office:text');
  const src = body >= 0 ? xml.slice(body) : xml;
  const lines: string[] = [];
  let line = '';
  let skipDepth = 0; // > 0 while inside an element we ignore
  const skipStack: string[] = [];
  const listCounters: number[] = [];
  let pendingNumber: string | null = null;
  let paraDepth = 0;

  const flush = () => {
    lines.push(line);
    line = '';
  };

  const re = /<!--[\s\S]*?-->|<\/?[^>]+>|[^<]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (tok.startsWith('<!--')) continue;
    if (!tok.startsWith('<')) {
      if (!skipDepth && paraDepth > 0) line += decode(tok);
      continue;
    }
    const closing = tok.startsWith('</');
    const selfClosing = tok.endsWith('/>');
    const name = /^<\/?([\w:.-]+)/.exec(tok)?.[1] ?? '';

    if (skipDepth) {
      if (name === skipStack[skipStack.length - 1]) {
        if (closing) {
          skipStack.pop();
          skipDepth--;
        } else if (!selfClosing) {
          skipStack.push(name);
          skipDepth++;
        }
      }
      continue;
    }
    if (!closing && SKIP.has(name)) {
      if (!selfClosing) {
        skipStack.push(name);
        skipDepth++;
      }
      continue;
    }

    switch (name) {
      case 'text:p':
      case 'text:h':
        if (closing) {
          paraDepth--;
          if (paraDepth === 0) flush();
        } else if (selfClosing) {
          if (paraDepth === 0) flush(); // empty paragraph: keeps blank lines between blocks
        } else {
          if (paraDepth === 0 && pendingNumber) {
            line = pendingNumber;
            pendingNumber = null;
          }
          paraDepth++;
        }
        break;
      case 'text:line-break':
        if (paraDepth > 0) {
          flush();
        }
        break;
      case 'text:tab':
        if (paraDepth > 0) line += '\t';
        break;
      case 'text:s':
        if (paraDepth > 0) line += ' '.repeat(Number(attr(tok, 'text:c') ?? '1') || 1);
        break;
      case 'text:list':
        if (closing) listCounters.pop();
        else if (!selfClosing) listCounters.push(0);
        break;
      case 'text:list-item':
        if (!closing && listCounters.length) {
          listCounters[listCounters.length - 1]++;
          pendingNumber = `${listCounters[listCounters.length - 1]}. `;
        } else if (closing) pendingNumber = null;
        break;
      case 'draw:image': {
        if (closing) break;
        const href = attr(tok, 'xlink:href');
        if (href && IMAGE_EXT.test(href) && !/^[a-z]+:/i.test(href)) {
          // The picture goes on its own line, at the point where it is anchored.
          const before = line;
          if (before.trim()) {
            lines.push(before);
          }
          lines.push(`[[image: ${href.replace(/^\.\//, '')}]]`);
          line = '';
        }
        break;
      }
    }
  }
  if (line) flush();
  return lines;
}
