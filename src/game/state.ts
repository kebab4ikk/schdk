/**
 * Game state for a tournament ЩДК game. The reducer is pure: every action that depends on the
 * clock carries `now` (ms), so the whole flow can be tested without timers.
 */

export interface Team {
  id: string;
  name: string;
}

export type Phase =
  /** Question shown, timer not started. */
  | 'reading'
  /** Main discussion countdown. */
  | 'timer'
  /** Extra seconds to write the answer down. */
  | 'writing'
  /** Time is over; answers are being collected. */
  | 'timeup'
  /** Answer revealed; the host marks correct teams. */
  | 'answer';

export type Screen = 'setup' | 'game' | 'results';
export type DisplayView = 'question' | 'results' | 'logo';

export interface Settings {
  /** Discussion time in seconds (a question's own `time` overrides it). */
  seconds: number;
  writingEnabled: boolean;
  writingSeconds: number;
  sound: boolean;
}

export interface TimerState {
  running: boolean;
  /** Epoch ms when the current countdown ends; set only while running. */
  endsAt: number | null;
  /** Remaining ms while paused (or the full length before start). */
  remainingMs: number;
}

export interface GameState {
  version: 1;
  screen: Screen;
  teams: Team[];
  settings: Settings;
  /** Title and question count of the loaded pack, to notice a pack change after reload. */
  packTitle: string | null;
  questionCount: number;
  current: number;
  phase: Phase;
  timer: TimerState;
  /** question index → ids of teams that answered correctly. Absent = not scored yet. */
  results: Record<number, string[]>;
  displayView: DisplayView;
  showHandout: boolean;
  mediaPlaying: boolean;
  /** Questions the host removed from play (e.g. a flawed question); they score nothing. */
  removed: number[];
}

export const defaultSettings: Settings = { seconds: 60, writingEnabled: true, writingSeconds: 10, sound: true };

export function initialState(): GameState {
  return {
    version: 1,
    screen: 'setup',
    teams: [],
    settings: { ...defaultSettings },
    packTitle: null,
    questionCount: 0,
    current: 0,
    phase: 'reading',
    timer: { running: false, endsAt: null, remainingMs: defaultSettings.seconds * 1000 },
    results: {},
    displayView: 'logo',
    showHandout: false,
    mediaPlaying: false,
    removed: [],
  };
}

export type Action =
  | { type: 'loadPack'; title: string; questionCount: number; questionTimes: (number | undefined)[] }
  | { type: 'addTeams'; names: string[]; ids: string[] }
  | { type: 'renameTeam'; id: string; name: string }
  | { type: 'removeTeam'; id: string }
  | { type: 'moveTeam'; id: string; delta: -1 | 1 }
  | { type: 'settings'; patch: Partial<Settings>; questionTime?: number }
  | { type: 'screen'; screen: Screen }
  | { type: 'goto'; index: number; questionTime?: number }
  | { type: 'startPause'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'skipTimer' }
  | { type: 'resetTimer'; questionTime?: number }
  | { type: 'reveal' }
  | { type: 'toggleCorrect'; index: number; teamId: string }
  | { type: 'setCorrect'; index: number; teamIds: string[] }
  | { type: 'toggleRemoved'; index: number }
  | { type: 'displayView'; view: DisplayView }
  | { type: 'toggleHandout' }
  | { type: 'toggleMedia' }
  | { type: 'newGame'; questionTime?: number }
  | { type: 'restore'; state: GameState };

/** Length of the main countdown for a question, in ms. */
export function mainMs(settings: Settings, questionTime?: number): number {
  return (questionTime ?? settings.seconds) * 1000;
}

function freshTimer(settings: Settings, questionTime?: number): TimerState {
  return { running: false, endsAt: null, remainingMs: mainMs(settings, questionTime) };
}

/** Remaining ms of the active countdown at `now`. */
export function remainingAt(timer: TimerState, now: number): number {
  if (timer.running && timer.endsAt !== null) return Math.max(0, timer.endsAt - now);
  return timer.remainingMs;
}

function atQuestion(s: GameState, index: number, questionTime?: number): GameState {
  return {
    ...s,
    current: index,
    phase: 'reading',
    timer: freshTimer(s.settings, questionTime),
    showHandout: false,
    mediaPlaying: false,
    displayView: s.screen === 'game' ? 'question' : s.displayView,
  };
}

export function reducer(s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'loadPack': {
      const samePack = s.packTitle === a.title && s.questionCount === a.questionCount;
      if (samePack) return s;
      // A different pack invalidates scores and position.
      return {
        ...s,
        packTitle: a.title,
        questionCount: a.questionCount,
        results: {},
        removed: [],
        current: 0,
        phase: 'reading',
        timer: freshTimer(s.settings, a.questionTimes[0]),
        showHandout: false,
        mediaPlaying: false,
        displayView: 'logo',
      };
    }
    case 'addTeams': {
      const existing = new Set(s.teams.map((t) => t.name.trim().toLowerCase()));
      const add: Team[] = [];
      a.names.forEach((raw, i) => {
        const name = raw.trim();
        if (!name || existing.has(name.toLowerCase())) return;
        existing.add(name.toLowerCase());
        add.push({ id: a.ids[i], name });
      });
      return add.length ? { ...s, teams: [...s.teams, ...add] } : s;
    }
    case 'renameTeam': {
      const name = a.name.trim();
      if (!name) return s;
      return { ...s, teams: s.teams.map((t) => (t.id === a.id ? { ...t, name } : t)) };
    }
    case 'removeTeam': {
      const results: Record<number, string[]> = {};
      for (const [k, ids] of Object.entries(s.results)) results[+k] = ids.filter((id) => id !== a.id);
      return { ...s, teams: s.teams.filter((t) => t.id !== a.id), results };
    }
    case 'moveTeam': {
      const i = s.teams.findIndex((t) => t.id === a.id);
      const j = i + a.delta;
      if (i < 0 || j < 0 || j >= s.teams.length) return s;
      const teams = [...s.teams];
      [teams[i], teams[j]] = [teams[j], teams[i]];
      return { ...s, teams };
    }
    case 'settings': {
      const settings = { ...s.settings, ...a.patch };
      settings.seconds = clampInt(settings.seconds, 1, 3600, defaultSettings.seconds);
      settings.writingSeconds = clampInt(settings.writingSeconds, 1, 600, defaultSettings.writingSeconds);
      const next = { ...s, settings };
      // Apply a new length straight away if the countdown has not started.
      if (s.phase === 'reading' && !s.timer.running) next.timer = freshTimer(settings, a.questionTime);
      return next;
    }
    case 'screen': {
      const next = { ...s, screen: a.screen };
      if (a.screen === 'game' && s.displayView === 'logo') next.displayView = 'question';
      return next;
    }
    case 'goto': {
      if (a.index < 0 || a.index >= s.questionCount) return s;
      return atQuestion(s, a.index, a.questionTime);
    }
    case 'startPause': {
      if (s.phase === 'reading') {
        return { ...s, phase: 'timer', timer: { running: true, endsAt: a.now + s.timer.remainingMs, remainingMs: s.timer.remainingMs } };
      }
      if (s.phase === 'timer' || s.phase === 'writing') {
        if (s.timer.running) {
          return { ...s, timer: { running: false, endsAt: null, remainingMs: remainingAt(s.timer, a.now) } };
        }
        return { ...s, timer: { ...s.timer, running: true, endsAt: a.now + s.timer.remainingMs } };
      }
      return s;
    }
    case 'tick': {
      if (!s.timer.running || s.timer.endsAt === null || a.now < s.timer.endsAt) return s;
      if (s.phase === 'timer' && s.settings.writingEnabled) {
        // Carry over any overshoot so a late tick doesn't lengthen the writing phase.
        const len = s.settings.writingSeconds * 1000;
        const endsAt = s.timer.endsAt + len;
        if (a.now < endsAt) return { ...s, phase: 'writing', timer: { running: true, endsAt, remainingMs: len } };
      }
      return { ...s, phase: 'timeup', timer: { running: false, endsAt: null, remainingMs: 0 } };
    }
    case 'skipTimer': {
      if (s.phase === 'answer' || s.phase === 'timeup') return s;
      return { ...s, phase: 'timeup', timer: { running: false, endsAt: null, remainingMs: 0 } };
    }
    case 'resetTimer':
      return { ...s, phase: 'reading', timer: freshTimer(s.settings, a.questionTime) };
    case 'reveal': {
      const results = s.current in s.results ? s.results : { ...s.results, [s.current]: [] };
      return { ...s, phase: 'answer', timer: { running: false, endsAt: null, remainingMs: 0 }, results };
    }
    case 'toggleCorrect': {
      if (!s.teams.some((t) => t.id === a.teamId)) return s;
      const cur = s.results[a.index] ?? [];
      const next = cur.includes(a.teamId) ? cur.filter((id) => id !== a.teamId) : [...cur, a.teamId];
      return { ...s, results: { ...s.results, [a.index]: next } };
    }
    case 'setCorrect':
      return { ...s, results: { ...s.results, [a.index]: a.teamIds.filter((id) => s.teams.some((t) => t.id === id)) } };
    case 'toggleRemoved': {
      const removed = s.removed.includes(a.index) ? s.removed.filter((i) => i !== a.index) : [...s.removed, a.index];
      return { ...s, removed };
    }
    case 'displayView':
      return { ...s, displayView: a.view };
    case 'toggleHandout':
      return { ...s, showHandout: !s.showHandout };
    case 'toggleMedia':
      return { ...s, mediaPlaying: !s.mediaPlaying };
    case 'newGame':
      return atQuestion({ ...s, results: {}, removed: [], screen: 'setup', displayView: 'logo' }, 0, a.questionTime);
    case 'restore':
      return a.state;
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Validates a state read back from storage; returns null if it doesn't look like ours. */
export function parseSavedState(json: string | null): GameState | null {
  if (!json) return null;
  try {
    const s = JSON.parse(json) as GameState;
    if (s?.version !== 1 || !Array.isArray(s.teams) || typeof s.results !== 'object' || !s.settings) return null;
    const base = initialState();
    const merged: GameState = { ...base, ...s, settings: { ...base.settings, ...s.settings }, removed: s.removed ?? [] };
    // A running timer can't be resumed meaningfully after a reload: pause it where it was.
    if (merged.timer.running && merged.timer.endsAt !== null) {
      merged.timer = { running: false, endsAt: null, remainingMs: Math.max(0, merged.timer.endsAt - Date.now()) };
      if (merged.timer.remainingMs === 0) merged.phase = 'timeup';
    }
    merged.mediaPlaying = false;
    return merged;
  } catch {
    return null;
  }
}
