import type { GameState, Team } from './state';

export interface Standing {
  team: Team;
  /** Correct answers. */
  total: number;
  /** Sum of the ratings of the questions the team answered (tie-break). */
  rating: number;
  /** Shared place, e.g. "1" or "2–3". */
  place: string;
  /** Numeric place (first of a shared range), for sorting and styling. */
  placeNumber: number;
  /** Per-question result for every question index: true/false, or null if not scored / removed. */
  marks: (boolean | null)[];
}

/** Questions that count: scored (answer revealed or marked) and not removed. */
export function scoredQuestions(s: Pick<GameState, 'results' | 'removed' | 'questionCount'>): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.questionCount; i++) if (i in s.results && !s.removed.includes(i)) out.push(i);
  return out;
}

/**
 * Rating of a question: the number of teams that did NOT answer it, plus one.
 * Harder questions are worth more in the tie-break.
 */
export function questionRating(teamCount: number, correctCount: number): number {
  return teamCount - correctCount + 1;
}

export function standings(s: Pick<GameState, 'teams' | 'results' | 'removed' | 'questionCount'>): Standing[] {
  const counted = new Set(scoredQuestions(s));
  const teamCount = s.teams.length;
  const rows = s.teams.map((team) => {
    let total = 0;
    let rating = 0;
    const marks: (boolean | null)[] = [];
    for (let i = 0; i < s.questionCount; i++) {
      if (!counted.has(i)) {
        marks.push(null);
        continue;
      }
      const correct = s.results[i] ?? [];
      const ok = correct.includes(team.id);
      marks.push(ok);
      if (ok) {
        total++;
        rating += questionRating(teamCount, correct.length);
      }
    }
    return { team, total, rating, marks };
  });

  // Stable sort keeps the registration order for exact ties.
  const sorted = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.total - a.r.total || b.r.rating - a.r.rating || a.i - b.i)
    .map(({ r }) => r);

  const out: Standing[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].total === sorted[i].total && sorted[j + 1].rating === sorted[i].rating) j++;
    const place = i === j ? String(i + 1) : `${i + 1}–${j + 1}`;
    for (let k = i; k <= j; k++) out.push({ ...sorted[k], place, placeNumber: i + 1 });
    i = j + 1;
  }
  return out;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvLabels {
  place: string;
  team: string;
  total: string;
  rating: string;
}

/**
 * Results as CSV (semicolon-separated, with a BOM) so Excel opens Cyrillic text correctly
 * in Ukrainian/European locales. 1 = correct, 0 = wrong, empty = not played / removed.
 */
export function toCsv(s: Pick<GameState, 'teams' | 'results' | 'removed' | 'questionCount'>, labels: CsvLabels): string {
  const rows = standings(s);
  const header = [labels.place, labels.team, ...Array.from({ length: s.questionCount }, (_, i) => String(i + 1)), labels.total, labels.rating];
  const lines = [header.map(csvCell).join(';')];
  for (const r of rows) {
    lines.push(
      [r.place, r.team.name, ...r.marks.map((m) => (m === null ? '' : m ? '1' : '0')), r.total, r.rating].map(csvCell).join(';'),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
