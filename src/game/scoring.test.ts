import { describe, expect, it } from 'vitest';
import { questionRating, standings, toCsv } from './scoring';

const teams = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma; "C"' },
  { id: 'd', name: 'Delta' },
];

describe('scoring', () => {
  it('rates a question by how many teams missed it', () => {
    expect(questionRating(4, 0)).toBe(5);
    expect(questionRating(4, 4)).toBe(1);
  });

  it('ranks by total, then rating, and shares places on exact ties', () => {
    // q0: a,b,c answered (rating 2); q1: only d (rating 4); q2: a,b (rating 3); q3 not played.
    const rows = standings({ teams, questionCount: 4, removed: [], results: { 0: ['a', 'b', 'c'], 1: ['d'], 2: ['a', 'b'] } });
    expect(rows.map((r) => [r.team.id, r.total, r.rating, r.place])).toEqual([
      ['a', 2, 5, '1–2'],
      ['b', 2, 5, '1–2'],
      ['d', 1, 4, '3'],
      ['c', 1, 2, '4'],
    ]);
    expect(rows[0].marks).toEqual([true, false, true, null]);
  });

  it('ignores removed questions', () => {
    const rows = standings({ teams, questionCount: 2, removed: [1], results: { 0: ['c'], 1: ['a', 'b'] } });
    expect(rows[0].team.id).toBe('c');
    expect(rows.find((r) => r.team.id === 'a')!.marks).toEqual([false, null]);
  });

  it('exports CSV with a BOM, semicolons and quoting', () => {
    const csv = toCsv({ teams, questionCount: 2, removed: [], results: { 0: ['c'] } }, { place: 'Місце', team: 'Команда', total: 'Сума', rating: 'Рейтинг' });
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe('Місце;Команда;1;2;Сума;Рейтинг');
    expect(lines[1]).toBe('1;"Gamma; ""C""";1;;1;4');
    expect(lines[2]).toBe('2–4;Alpha;0;;0;0');
  });
});
