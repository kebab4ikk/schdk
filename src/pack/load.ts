import JSZip from 'jszip';
import type { Media, MediaType, Pack, Question, Tour } from './types';

/** A validation problem, as an i18n key plus parameters, so the UI can show it in either language. */
export interface PackIssue {
  key: string;
  params?: Record<string, string | number>;
}

export class PackError extends Error {
  constructor(public issues: PackIssue[]) {
    super(issues.map((i) => i.key + (i.params ? ' ' + JSON.stringify(i.params) : '')).join('; '));
    this.name = 'PackError';
  }
}

export interface LoadedPack {
  pack: Pack;
  /** blob: URLs created for ZIP media; revoke them when the pack is replaced. */
  objectUrls: string[];
}

const MEDIA_TYPES: MediaType[] = ['image', 'audio', 'video'];

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp', avif: 'image/avif',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/mp4',
};

function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);

/**
 * Checks the raw JSON and turns it into a Pack. Media sources are left as written in the file;
 * `resolveMedia` maps them to playable URLs. Accepts either `tours: [...]` or a bare
 * `questions: [...]` (treated as one tour).
 */
export function validatePack(raw: unknown, resolveMedia: (src: string) => string | null = (s) => s): Pack {
  const issues: PackIssue[] = [];
  if (!isObj(raw)) throw new PackError([{ key: 'err.notObject' }]);

  let toursRaw: unknown[];
  if (Array.isArray(raw.tours)) toursRaw = raw.tours;
  else if (Array.isArray(raw.questions)) toursRaw = [{ title: '', questions: raw.questions }];
  else throw new PackError([{ key: 'err.noTours' }]);

  let number = 0;
  const tours: Tour[] = [];
  toursRaw.forEach((t, ti) => {
    if (!isObj(t) || !Array.isArray(t.questions)) {
      issues.push({ key: 'err.badTour', params: { tour: ti + 1 } });
      return;
    }
    const questions: Question[] = [];
    t.questions.forEach((q) => {
      number++;
      if (!isObj(q)) {
        issues.push({ key: 'err.badQuestion', params: { n: number } });
        return;
      }
      const text = optStr(q.text) ?? '';
      const answer = optStr(q.answer);
      if (!answer) issues.push({ key: 'err.noAnswer', params: { n: number } });

      let media: Media | undefined;
      if (q.media !== undefined && q.media !== null) {
        if (!isObj(q.media) || !MEDIA_TYPES.includes(q.media.type as MediaType) || !optStr(q.media.src)) {
          issues.push({ key: 'err.badMedia', params: { n: number } });
        } else {
          const resolved = resolveMedia(q.media.src as string);
          if (resolved === null) issues.push({ key: 'err.missingMedia', params: { n: number, src: q.media.src as string } });
          else media = { type: q.media.type as MediaType, src: resolved };
        }
      }
      if (!text && !media) issues.push({ key: 'err.emptyQuestion', params: { n: number } });

      let time: number | undefined;
      if (q.time !== undefined) {
        if (typeof q.time === 'number' && q.time > 0 && q.time <= 3600) time = q.time;
        else issues.push({ key: 'err.badTime', params: { n: number } });
      }

      let accepted: string[] | undefined;
      if (q.accepted !== undefined) {
        if (Array.isArray(q.accepted) && q.accepted.every((a) => typeof a === 'string')) {
          accepted = (q.accepted as string[]).filter((a) => a.trim() !== '');
        } else if (typeof q.accepted === 'string') {
          accepted = [q.accepted];
        } else issues.push({ key: 'err.badAccepted', params: { n: number } });
      }

      questions.push({
        text,
        media,
        handout: optStr(q.handout),
        answer: answer ?? '',
        accepted: accepted?.length ? accepted : undefined,
        comment: optStr(q.comment),
        source: optStr(q.source),
        author: optStr(q.author),
        time,
      });
    });
    tours.push({ title: optStr(t.title) ?? '', questions });
  });

  if (number === 0) issues.push({ key: 'err.noQuestions' });
  if (issues.length) throw new PackError(issues);

  return {
    title: optStr(raw.title) ?? '',
    author: optStr(raw.author),
    date: optStr(raw.date),
    tours,
  };
}

function parseJsonText(text: string): unknown {
  try {
    // Strip a UTF-8 BOM, which some editors on Windows add.
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new PackError([{ key: 'err.badJson', params: { msg: (e as Error).message } }]);
  }
}

/** Normalises "./a/../b.png" style paths so they match ZIP entry names. */
export function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

async function loadZip(data: ArrayBuffer | Uint8Array, createUrl: (blob: Blob) => string): Promise<LoadedPack> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new PackError([{ key: 'err.badZip' }]);
  }
  const files = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith('__MACOSX/'));
  const jsons = files.filter((f) => f.name.toLowerCase().endsWith('.json'));
  // Prefer pack.json; otherwise the shallowest JSON file.
  const packFile =
    jsons.find((f) => f.name.split('/').pop()?.toLowerCase() === 'pack.json') ??
    jsons.sort((a, b) => a.name.split('/').length - b.name.split('/').length)[0];
  if (!packFile) throw new PackError([{ key: 'err.zipNoJson' }]);

  const baseDir = packFile.name.includes('/') ? packFile.name.slice(0, packFile.name.lastIndexOf('/') + 1) : '';
  const raw = parseJsonText(await packFile.async('string'));

  // Collect referenced media first, then extract only those.
  const wanted = new Set<string>();
  const byPath = new Map(files.map((f) => [normalizePath(f.name), f]));
  validatePackShapeForMedia(raw).forEach((src) => wanted.add(src));

  const urls = new Map<string, string>();
  const objectUrls: string[] = [];
  for (const src of wanted) {
    if (/^(https?:|data:|blob:)/i.test(src)) continue;
    const entry = byPath.get(normalizePath(baseDir + src)) ?? byPath.get(normalizePath(src));
    if (!entry) continue;
    const bytes = await entry.async('arraybuffer');
    const url = createUrl(new Blob([bytes], { type: mimeFor(entry.name) }));
    urls.set(src, url);
    objectUrls.push(url);
  }

  try {
    const pack = validatePack(raw, (src) => (/^(https?:|data:|blob:)/i.test(src) ? src : urls.get(src) ?? null));
    return { pack, objectUrls };
  } catch (e) {
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    throw e;
  }
}

/** Lists media `src` values in a raw pack, without validating anything else. */
function validatePackShapeForMedia(raw: unknown): string[] {
  const out: string[] = [];
  if (!isObj(raw)) return out;
  const tours = Array.isArray(raw.tours) ? raw.tours : Array.isArray(raw.questions) ? [{ questions: raw.questions }] : [];
  for (const t of tours) {
    if (!isObj(t) || !Array.isArray(t.questions)) continue;
    for (const q of t.questions) {
      if (isObj(q) && isObj(q.media) && typeof q.media.src === 'string') out.push(q.media.src);
    }
  }
  return out;
}

const isZipBytes = (b: Uint8Array) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/**
 * Loads a pack from file bytes: a ZIP (pack.json + media) or a plain JSON file.
 * In a plain JSON file, media must be http(s): or data: URLs.
 */
export async function loadPackBytes(
  data: ArrayBuffer,
  createUrl: (blob: Blob) => string = (b) => URL.createObjectURL(b),
): Promise<LoadedPack> {
  const bytes = new Uint8Array(data);
  if (isZipBytes(bytes)) return loadZip(bytes, createUrl);
  const raw = parseJsonText(new TextDecoder('utf-8').decode(bytes));
  const pack = validatePack(raw, (src) => (/^(https?:|data:|blob:)/i.test(src) ? src : null));
  return { pack, objectUrls: [] };
}
