import { describe, expect, it } from 'vitest';
import { buildDisplayModel } from './model';
import { initialState, reducer, type Action, type GameState } from '../game/state';
import { flattenPack } from '../pack/types';
import { validatePack } from '../pack/load';

const questions = flattenPack(
  validatePack({
    tours: [
      {
        title: 'T1',
        questions: [
          { text: 'Q1', answer: 'SECRET-1', comment: 'C1', handout: 'H1' },
          { text: 'Q2', answer: 'SECRET-2', accepted: ['ALT-2'] },
        ],
      },
    ],
  }),
);

function at(actions: Action[]): GameState {
  return actions.reduce(reducer, {
    ...initialState(),
    screen: 'game',
    packTitle: 'P',
    questionCount: 2,
    teams: [{ id: 'a', name: 'A' }],
    displayView: 'question',
  });
}

const json = (s: GameState) => JSON.stringify(buildDisplayModel(s, questions, 'P', undefined, 0));

describe('display model (what reaches the smartboard)', () => {
  it('never contains an answer, comment or another question before the reveal', () => {
    for (const s of [at([]), at([{ type: 'startPause', now: 0 }]), at([{ type: 'skipTimer' }])]) {
      const m = json(s);
      expect(m).toContain('Q1');
      for (const secret of ['SECRET-1', 'C1', 'Q2', 'SECRET-2', 'ALT-2']) expect(m).not.toContain(secret);
    }
  });

  it('contains the answer after the reveal, still nothing from the next question', () => {
    const m = json(at([{ type: 'reveal' }]));
    expect(m).toContain('SECRET-1');
    expect(m).toContain('C1');
    expect(m).not.toContain('SECRET-2');
  });

  it('includes the handout only while it is shown', () => {
    expect(json(at([]))).not.toContain('H1');
    expect(json(at([{ type: 'toggleHandout' }]))).toContain('H1');
  });

  it('carries a timer snapshot', () => {
    const s = at([{ type: 'startPause', now: 1000 }]);
    const m = buildDisplayModel(s, questions, 'P', undefined, 21_000);
    expect(m.timer).toEqual({ running: true, remainingMs: 40_000 });
  });
});
