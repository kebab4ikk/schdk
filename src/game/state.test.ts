import { describe, expect, it } from 'vitest';
import { initialState, parseSavedState, reducer, remainingAt, type Action, type GameState } from './state';

function play(actions: Action[], from: GameState = initialState()): GameState {
  return actions.reduce(reducer, from);
}

const withPack = (): GameState =>
  play([
    { type: 'loadPack', title: 'P', questionCount: 3, questionTimes: [undefined, 30, undefined] },
    { type: 'addTeams', names: ['Alpha', 'Beta', ' alpha ', '', 'Gamma'], ids: ['a', 'b', 'x', 'y', 'g'] },
    { type: 'screen', screen: 'game' },
  ]);

describe('teams', () => {
  it('adds trimmed, unique, non-empty names', () => {
    expect(withPack().teams.map((t) => t.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('removes a team and its marks', () => {
    const s = play([{ type: 'reveal' }, { type: 'setCorrect', index: 0, teamIds: ['a', 'b'] }, { type: 'removeTeam', id: 'a' }], withPack());
    expect(s.teams.map((t) => t.id)).toEqual(['b', 'g']);
    expect(s.results[0]).toEqual(['b']);
  });

  it('reorders and renames', () => {
    const s = play([{ type: 'moveTeam', id: 'g', delta: -1 }, { type: 'renameTeam', id: 'b', name: '  Бета ' }, { type: 'renameTeam', id: 'a', name: ' ' }], withPack());
    expect(s.teams.map((t) => t.name)).toEqual(['Alpha', 'Gamma', 'Бета']);
  });
});

describe('timer flow', () => {
  it('runs reading → timer → writing → timeup → answer', () => {
    let s = withPack();
    expect(s.phase).toBe('reading');
    expect(s.timer.remainingMs).toBe(60_000);

    s = reducer(s, { type: 'startPause', now: 1_000 });
    expect(s.phase).toBe('timer');
    expect(remainingAt(s.timer, 31_000)).toBe(30_000);

    // Pause for 5 s, then resume: remaining time is kept.
    s = reducer(s, { type: 'startPause', now: 31_000 });
    expect(s.timer.running).toBe(false);
    s = reducer(s, { type: 'tick', now: 99_000 });
    expect(s.phase).toBe('timer');
    s = reducer(s, { type: 'startPause', now: 36_000 });
    expect(s.timer.endsAt).toBe(66_000);

    s = reducer(s, { type: 'tick', now: 65_999 });
    expect(s.phase).toBe('timer');
    s = reducer(s, { type: 'tick', now: 66_200 });
    expect(s.phase).toBe('writing');
    // Writing time is measured from the real end, not from the late tick.
    expect(s.timer.endsAt).toBe(76_000);

    s = reducer(s, { type: 'tick', now: 76_000 });
    expect(s.phase).toBe('timeup');
    s = reducer(s, { type: 'reveal' });
    expect(s.phase).toBe('answer');
    expect(s.results[0]).toEqual([]);
  });

  it('skips writing when disabled, and a very late tick skips it too', () => {
    let s = play([{ type: 'settings', patch: { writingEnabled: false } }, { type: 'startPause', now: 0 }], withPack());
    s = reducer(s, { type: 'tick', now: 60_000 });
    expect(s.phase).toBe('timeup');

    s = play([{ type: 'goto', index: 0 }, { type: 'settings', patch: { writingEnabled: true } }, { type: 'startPause', now: 0 }], s);
    s = reducer(s, { type: 'tick', now: 80_000 });
    expect(s.phase).toBe('timeup');
  });

  it("uses the question's own time on goto", () => {
    const s = reducer(withPack(), { type: 'goto', index: 1, questionTime: 30 });
    expect(s.timer.remainingMs).toBe(30_000);
    expect(s.phase).toBe('reading');
  });

  it('ignores goto out of range', () => {
    const s = withPack();
    expect(reducer(s, { type: 'goto', index: 3 })).toBe(s);
    expect(reducer(s, { type: 'goto', index: -1 })).toBe(s);
  });

  it('applies new settings to a timer that has not started', () => {
    const s = reducer(withPack(), { type: 'settings', patch: { seconds: 45 } });
    expect(s.timer.remainingMs).toBe(45_000);
    const bad = reducer(withPack(), { type: 'settings', patch: { seconds: Number.NaN } });
    expect(bad.settings.seconds).toBe(60);
  });
});

describe('marks and packs', () => {
  it('toggles correct teams and ignores unknown teams', () => {
    let s = play([{ type: 'reveal' }, { type: 'toggleCorrect', index: 0, teamId: 'a' }, { type: 'toggleCorrect', index: 0, teamId: 'zzz' }], withPack());
    expect(s.results[0]).toEqual(['a']);
    s = reducer(s, { type: 'toggleCorrect', index: 0, teamId: 'a' });
    expect(s.results[0]).toEqual([]);
  });

  it('keeps results when the same pack is loaded again, resets on a different one', () => {
    const s = play([{ type: 'reveal' }, { type: 'setCorrect', index: 0, teamIds: ['a'] }], withPack());
    expect(reducer(s, { type: 'loadPack', title: 'P', questionCount: 3, questionTimes: [] })).toBe(s);
    const other = reducer(s, { type: 'loadPack', title: 'Other', questionCount: 5, questionTimes: [] });
    expect(other.results).toEqual({});
    expect(other.teams).toHaveLength(3);
  });

  it('new game clears marks but keeps teams and settings', () => {
    const s = play(
      [{ type: 'settings', patch: { seconds: 50 } }, { type: 'reveal' }, { type: 'setCorrect', index: 0, teamIds: ['a'] }, { type: 'goto', index: 2 }, { type: 'newGame' }],
      withPack(),
    );
    expect(s.results).toEqual({});
    expect(s.current).toBe(0);
    expect(s.teams).toHaveLength(3);
    expect(s.settings.seconds).toBe(50);
    expect(s.screen).toBe('setup');
  });
});

describe('board mode', () => {
  it('shows the question on the display when entering board mode and on goto', () => {
    let s = play([
      { type: 'loadPack', title: 'P', questionCount: 3, questionTimes: [] },
      { type: 'addTeams', names: ['A'], ids: ['a'] },
    ]);
    expect(s.displayView).toBe('logo');
    s = reducer(s, { type: 'screen', screen: 'board' });
    expect(s.displayView).toBe('question');
    s = play([{ type: 'displayView', view: 'results' }, { type: 'goto', index: 1 }], s);
    expect(s.displayView).toBe('question');
  });
});

describe('parseSavedState', () => {
  it('round-trips and pauses a running timer', () => {
    const s = reducer(withPack(), { type: 'startPause', now: Date.now() });
    const back = parseSavedState(JSON.stringify(s))!;
    expect(back.teams).toEqual(s.teams);
    expect(back.timer.running).toBe(false);
    expect(back.timer.remainingMs).toBeGreaterThan(55_000);
  });

  it('rejects garbage', () => {
    expect(parseSavedState(null)).toBeNull();
    expect(parseSavedState('{')).toBeNull();
    expect(parseSavedState('{"version":2}')).toBeNull();
  });
});
