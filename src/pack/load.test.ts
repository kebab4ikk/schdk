import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { loadPackBytes, normalizePath, PackError, validatePack } from './load';
import { flattenPack } from './types';

const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).buffer as ArrayBuffer;
let urlN = 0;
const fakeUrl = () => `blob:test/${++urlN}`;

async function issuesOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(PackError);
    return (e as PackError).issues.map((i) => i.key);
  }
  throw new Error('expected PackError');
}

describe('validatePack', () => {
  it('accepts the sample pack', async () => {
    const data = readFileSync(new URL('../../examples/sample-pack.json', import.meta.url));
    const { pack } = await loadPackBytes(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    const flat = flattenPack(pack);
    expect(pack.tours).toHaveLength(2);
    expect(flat).toHaveLength(6);
    expect(flat[3]).toMatchObject({ number: 4, tourIndex: 1, time: 30 });
    expect(flat[3].media?.src.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('accepts a bare questions array as one tour', () => {
    const pack = validatePack({ questions: [{ text: 'Q', answer: 'A', accepted: 'B' }] });
    expect(pack.tours).toHaveLength(1);
    expect(pack.tours[0].questions[0].accepted).toEqual(['B']);
  });

  it('reports every problem with its question number', () => {
    try {
      validatePack({
        tours: [
          { questions: [{ text: 'ok', answer: 'a' }, { text: 'no answer' }] },
          { questions: [{ answer: 'x' }, { text: 't', answer: 'a', time: -5 }, { text: 't', answer: 'a', media: { type: 'gif', src: 'x' } }] },
        ],
      });
      throw new Error('should fail');
    } catch (e) {
      const issues = (e as PackError).issues;
      expect(issues).toEqual([
        { key: 'err.noAnswer', params: { n: 2 } },
        { key: 'err.emptyQuestion', params: { n: 3 } },
        { key: 'err.badTime', params: { n: 4 } },
        { key: 'err.badMedia', params: { n: 5 } },
      ]);
    }
  });

  it('rejects non-packs', async () => {
    expect(await issuesOf(loadPackBytes(enc([1, 2])))).toEqual(['err.notObject']);
    expect(await issuesOf(loadPackBytes(enc({ title: 'x' })))).toEqual(['err.noTours']);
    expect(await issuesOf(loadPackBytes(enc({ tours: [] })))).toEqual(['err.noQuestions']);
    expect(await issuesOf(loadPackBytes(new TextEncoder().encode('{ broken').buffer as ArrayBuffer))).toEqual(['err.badJson']);
  });

  it('rejects relative media in a plain JSON file', async () => {
    const keys = await issuesOf(loadPackBytes(enc({ questions: [{ text: 't', answer: 'a', media: { type: 'image', src: 'q.png' } }] })));
    expect(keys).toEqual(['err.missingMedia']);
  });

  it('strips a UTF-8 BOM', async () => {
    const bytes = new TextEncoder().encode('﻿' + JSON.stringify({ questions: [{ text: 'Q', answer: 'A' }] }));
    const { pack } = await loadPackBytes(bytes.buffer as ArrayBuffer);
    expect(pack.tours[0].questions[0].answer).toBe('A');
  });
});

describe('ZIP packs', () => {
  async function zipOf(files: Record<string, string | Uint8Array>) {
    const zip = new JSZip();
    for (const [name, content] of Object.entries(files)) zip.file(name, content);
    return (await zip.generateAsync({ type: 'uint8array' })).buffer as ArrayBuffer;
  }

  it('resolves media relative to pack.json, even in a subfolder', async () => {
    const pack = {
      title: 'Z',
      questions: [
        { text: 'img', answer: 'a', media: { type: 'image', src: 'media/q1.png' } },
        { text: 'snd', answer: 'b', media: { type: 'audio', src: './media/../media/s.mp3' } },
        { text: 'web', answer: 'c', media: { type: 'video', src: 'https://example.com/v.mp4' } },
      ],
    };
    const data = await zipOf({
      'my pack/pack.json': JSON.stringify(pack),
      'my pack/media/q1.png': new Uint8Array([1, 2, 3]),
      'my pack/media/s.mp3': new Uint8Array([4]),
      '__MACOSX/my pack/._pack.json': 'junk',
    });
    const blobs: Blob[] = [];
    const res = await loadPackBytes(data, (b) => {
      blobs.push(b);
      return fakeUrl();
    });
    const qs = flattenPack(res.pack);
    expect(qs[0].media?.src).toMatch(/^blob:test\//);
    expect(qs[1].media?.src).toMatch(/^blob:test\//);
    expect(qs[2].media?.src).toBe('https://example.com/v.mp4');
    expect(res.objectUrls).toHaveLength(2);
    expect(blobs.map((b) => b.type).sort()).toEqual(['audio/mpeg', 'image/png']);
  });

  it('reports missing media and a missing pack.json', async () => {
    const missing = await zipOf({ 'pack.json': JSON.stringify({ questions: [{ text: 't', answer: 'a', media: { type: 'image', src: 'nope.png' } }] }) });
    expect(await issuesOf(loadPackBytes(missing, fakeUrl))).toEqual(['err.missingMedia']);
    const notPack = await zipOf({ 'readme.txt': 'hi' });
    expect(await issuesOf(loadPackBytes(notPack, fakeUrl))).toEqual(['err.notChgkText']);
    const empty = await zipOf({ 'photo.png': new Uint8Array([1]) });
    expect(await issuesOf(loadPackBytes(empty, fakeUrl))).toEqual(['err.zipNoJson']);
  });

  it('reports a corrupt zip', async () => {
    const bad = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]).buffer as ArrayBuffer;
    expect(await issuesOf(loadPackBytes(bad, fakeUrl))).toEqual(['err.badZip']);
  });
});

describe('normalizePath', () => {
  it('handles ./, .., backslashes and duplicate slashes', () => {
    expect(normalizePath('./a//b/../c\\d.png')).toBe('a/c/d.png');
  });
});
