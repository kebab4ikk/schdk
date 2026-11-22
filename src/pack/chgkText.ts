/**
 * Parser for packs in the usual ЧГК text layout, as editors publish them (Ukrainian or Russian):
 *
 *   ТУР 1
 *   Запитання 1.
 *   [Ведучим: …]            ← note for the host, never shown to players
 *   Текст запитання… [вимова] ЦЕ…
 *   Відповідь: …
 *   Залік: …                Незалік: …
 *   Коментар: …
 *   Джерело: …   / Джерела: 1. … 2. …
 *   Автор: …     / Авторка / Автори
 *
 * A line `[[image: media/q7.jpg]]` (also audio:, video:) attaches a file from the same ZIP:
 * before "Відповідь" it is shown with the question, after it only once the answer is revealed.
 *
 * Everything before the first question (instructions, preamble) becomes the pack's host notes.
 * The result is the raw JSON shape that `validatePack` accepts.
 */

type Field = 'answer' | 'accepted' | 'rejected' | 'comment' | 'source' | 'author' | 'handout';

const LABELS: [RegExp, Field][] = [
  [/^(Відповідь|Ответ)/i, 'answer'],
  [/^(Незалік|Не залік|Незач[её]т)/i, 'rejected'],
  [/^(Залік|Зач[её]т)/i, 'accepted'],
  [/^(Коментар|Комментарий)/i, 'comment'],
  [/^(Джерела|Джерело|Источники|Источник)/i, 'source'],
  [/^(Авторки|Авторка|Автори|Автор|Авторы)/i, 'author'],
  [/^(Роздатковий матеріал|Роздатка|Раздаточный материал|Раздатка)/i, 'handout'],
];

const TOUR_RE = /^\s*(?:ТУР|Тур|тур|Блок|БЛОК)\s+([0-9IVXІ]+)\b[.:]?\s*(.*)$/;
const QUESTION_RE = /^\s*(?:Запитання|Питання|Вопрос)\s+(\d+)\s*[.:]?\s*(.*)$/i;
/** "Label:" or "Label." at the start of a line (some editors type a full stop by mistake). */
const LABEL_RE = /^\s*([А-ЯІЇЄҐа-яіїєґ’' ]{4,28}?)\s*[:.]\s*(.*)$/;
const HOST_NOTE_RE = /^\s*\[\s*(?:Ведучим|Ведучому|Ведучій|Ведучого|Для ведучого|Ведущему|Ведущим|Примітка для ведучого)[^\]]*\]\s*/i;

interface Draft {
  number: number;
  lines: string[];
  fields: Partial<Record<Field, string[]>>;
  media?: { type: string; src: string };
  answerMedia?: { type: string; src: string };
}

const MEDIA_LINE_RE = /^\s*\[\[\s*(image|audio|video)\s*:\s*([^\]]+?)\s*\]\]\s*$/i;

function labelOf(line: string): { field: Field; rest: string } | null {
  const m = LABEL_RE.exec(line);
  if (!m) return null;
  const word = m[1].trim();
  for (const [re, field] of LABELS) {
    // The whole label must match (so "Автор" doesn't catch "Авторитет: …").
    const hit = re.exec(word);
    if (hit && hit[0].length === word.length) return { field, rest: m[2] };
  }
  return null;
}

/**
 * Joins wrapped lines back into text. A web address split at a line break ("…materials-in-" /
 * "your-garden/") is glued back without a space; other lines get one space.
 */
export function joinLines(lines: string[]): string {
  let out = '';
  for (const raw of lines) {
    const line = raw.trim().replace(/[ \t]{2,}/g, ' ');
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    const lastToken = out.split(/\s/).pop() ?? '';
    const inUrl = /^(https?:\/\/|www\.)\S*$/.test(lastToken) && !/[.,;)]$/.test(lastToken);
    // A wrapped address continues on a line that is one unbroken token ("your-garden/").
    const continuesUrl = inUrl && /^[\w\-./?=&%#~+:'’]+$/u.test(line);
    out += continuesUrl ? line : ' ' + line;
  }
  return out;
}

/** Multi-line fields keep numbered entries ("1. …", "2. …") on their own lines. */
function joinListField(lines: string[]): string {
  const items: string[][] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\d+[.)]\s/.test(line) || items.length === 0) items.push([line]);
    else items[items.length - 1].push(line);
  }
  return items.map(joinLines).join('\n');
}

export interface ParsedTextPack {
  title?: string;
  notes?: string;
  tours: { title: string; questions: Record<string, unknown>[] }[];
}

export function looksLikeChgkText(text: string): boolean {
  return QUESTION_RE.test(text.split(/\r?\n/).find((l) => QUESTION_RE.test(l)) ?? '') && /(Відповідь|Ответ)\s*[:.]/i.test(text);
}

export function parseChgkText(text: string): ParsedTextPack {
  const lines = text.replace(/^﻿/, '').replace(/ /g, ' ').split(/\r?\n/);
  const preamble: string[] = [];
  const tours: { title: string; drafts: Draft[] }[] = [];
  let cur: Draft | null = null;
  let field: Field | null = null;

  const tour = () => {
    if (!tours.length) tours.push({ title: '', drafts: [] });
    return tours[tours.length - 1];
  };

  for (const line of lines) {
    // A tour heading is a short line of its own ("ТУР 2", "Тур 2. Фінал").
    if (TOUR_RE.test(line) && line.trim().length <= 40) {
      tours.push({ title: line.trim().replace(/\s+/g, ' '), drafts: [] });
      cur = null;
      field = null;
      continue;
    }
    const q = QUESTION_RE.exec(line);
    if (q) {
      cur = { number: Number(q[1]), lines: q[2] ? [q[2]] : [], fields: {} };
      tour().drafts.push(cur);
      field = null;
      continue;
    }
    if (!cur) {
      preamble.push(line);
      continue;
    }
    const media = MEDIA_LINE_RE.exec(line);
    if (media) {
      const m = { type: media[1].toLowerCase(), src: media[2] };
      if (cur.fields.answer) cur.answerMedia ??= m;
      else cur.media ??= m;
      continue;
    }
    const l = labelOf(line);
    if (l) {
      field = l.field;
      (cur.fields[field] ??= []).push(l.rest);
      continue;
    }
    if (field) cur.fields[field]!.push(line);
    else cur.lines.push(line);
  }

  const notes = preamble
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    notes: notes || undefined,
    tours: tours
      .filter((t) => t.drafts.length)
      .map((t) => ({ title: t.title, questions: t.drafts.map(toQuestion) })),
  };
}

function toQuestion(d: Draft): Record<string, unknown> {
  let text = joinLines(d.lines);
  // Notes for the host at the start ("[Ведучим: …]") come out of the question text.
  const notes: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = HOST_NOTE_RE.exec(text))) {
    notes.push(m[0].trim().replace(/^\[|\]$/g, '').trim());
    text = text.slice(m[0].length);
  }
  // A handout given in brackets: "[Роздатковий матеріал: …]".
  let handout = d.fields.handout ? joinLines(d.fields.handout) : undefined;
  const h = /^\s*\[\s*(?:Роздатковий матеріал|Роздатка|Раздаточный материал|Раздатка)\s*:\s*([^\]]*)\]\s*/i.exec(text);
  if (h) {
    handout = h[1].trim();
    text = text.slice(h[0].length);
  }
  const f = (k: Field) => (d.fields[k] ? joinLines(d.fields[k]!) : undefined);
  const comment = [f('comment'), f('rejected') && `Незалік: ${f('rejected')}`].filter(Boolean).join('\n') || undefined;
  return {
    text: text.trim(),
    answer: f('answer')?.replace(/\.$/, '') ?? '',
    accepted: f('accepted') ? [f('accepted')!.replace(/\.$/, '')] : undefined,
    comment,
    source: d.fields.source ? joinListField(d.fields.source) : undefined,
    author: f('author'),
    handout,
    hostNote: notes.length ? notes.join('\n') : undefined,
    media: d.media,
    answerMedia: d.answerMedia,
  };
}
