import { describe, expect, it } from 'vitest';
import { joinLines, looksLikeChgkText, parseChgkText } from './chgkText';
import { loadPackBytes, validatePack } from './load';
import { flattenPack } from './types';

// Made-up questions in the usual editor layout, with the quirks real packs have:
// a URL broken across lines, "Автор." with a full stop, a host note, numbered sources,
// a pronunciation hint in brackets, an image after the answer.
const SAMPLE = `Інструкція для ведучих
1. Читайте чітко.

Преамбула
Вітаємо на турнірі!

ТУР 1

Запитання 1.
[Ведучим: наголос у слові «до́ба»]
Скільки годин у ДОБІ [до́бі]? Назвіть число.

Відповідь: 24.
Залік: двадцять чотири
Незалік: 12
Коментар: доба триває
двадцять чотири години.
Джерело: https://example.org/some/long-
path/to-page.html
Автор. Іван Приклад

Запитання 2. Яка тварина намальована?
Відповідь: кіт
[[image: media/cat.png]]
Джерела:
1. https://example.org/a
2. Книга «Тварини», с. 5
Авторка: Марія Приклад

Тур 2
Запитання 3.
[Роздатковий матеріал: КІТ]
Що написано на роздатці?
Відповідь: кіт
Автори: А. Б., В. Г.
`;

describe('ЧГК text packs', () => {
  const parsed = parseChgkText(SAMPLE);
  const pack = validatePack(parsed, (src) => `resolved:${src}`);
  const qs = flattenPack(pack);

  it('splits tours and questions, keeps the preamble as host notes', () => {
    expect(pack.tours.map((t) => [t.title, t.questions.length])).toEqual([
      ['ТУР 1', 2],
      ['Тур 2', 1],
    ]);
    expect(pack.notes).toContain('Інструкція для ведучих');
    expect(pack.notes).toContain('Вітаємо на турнірі!');
  });

  it('reads every field', () => {
    expect(qs[0]).toMatchObject({
      text: 'Скільки годин у ДОБІ [до́бі]? Назвіть число.',
      hostNote: 'Ведучим: наголос у слові «до́ба»',
      answer: '24',
      accepted: ['двадцять чотири'],
      comment: 'доба триває двадцять чотири години.\nНезалік: 12',
      source: 'https://example.org/some/long-path/to-page.html',
      author: 'Іван Приклад',
    });
  });

  it('takes question text from the heading line and keeps numbered sources apart', () => {
    expect(qs[1].text).toBe('Яка тварина намальована?');
    expect(qs[1].source).toBe('1. https://example.org/a\n2. Книга «Тварини», с. 5');
    expect(qs[1].author).toBe('Марія Приклад');
  });

  it('puts an image after "Відповідь" with the answer, not the question', () => {
    expect(qs[1].media).toBeUndefined();
    expect(qs[1].answerMedia).toEqual({ type: 'image', src: 'resolved:media/cat.png' });
  });

  it('reads a bracketed handout', () => {
    expect(qs[2]).toMatchObject({ handout: 'КІТ', text: 'Що написано на роздатці?', author: 'А. Б., В. Г.' });
  });

  it('is loaded straight from a .txt file', async () => {
    expect(looksLikeChgkText(SAMPLE)).toBe(true);
    const textOnly = SAMPLE.replace('[[image: media/cat.png]]\n', '');
    const { pack: p } = await loadPackBytes(new TextEncoder().encode(textOnly).buffer as ArrayBuffer);
    expect(flattenPack(p)).toHaveLength(3);
  });

  it('glues URLs split at line ends but not ordinary text', () => {
    expect(joinLines(['see https://x.org/a-', 'b/c', 'and more'])).toBe('see https://x.org/a-b/c and more');
    expect(joinLines(['word', 'next'])).toBe('word next');
  });
});
