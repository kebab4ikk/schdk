import type { FlatQuestion, MediaType } from '../pack/types';
import { remainingAt, type DisplayView, type GameState, type Phase } from '../game/state';
import { standings } from '../game/scoring';

/**
 * Exactly what the players' screen may show, and nothing more. The remote screen (smartboard)
 * receives only this, so answers and upcoming questions never leave the host device early.
 */
export interface DisplayModel {
  view: DisplayView;
  packTitle: string;
  packDate?: string;
  question?: {
    number: number;
    tourTitle: string;
    text: string;
    handout?: string;
    media?: { type: MediaType; src: string };
    /** Present only once the answer is revealed. */
    reveal?: { answer: string; accepted?: string[]; comment?: string; source?: string; author?: string };
  };
  phase: Phase;
  timer: { running: boolean; remainingMs: number };
  mediaPlaying: boolean;
  results: { id: string; name: string; place: string; placeNumber: number; total: number; rating: number }[];
  sound: boolean;
  /** Seconds of the main countdown, so the screen knows when the 10-second warning applies. */
  mainSeconds: number;
  /** Changes with every question, to reset per-question effects (sound warning) on the screen. */
  questionKey: string;
}

export function buildDisplayModel(
  state: GameState,
  questions: FlatQuestion[],
  packTitle: string,
  packDate: string | undefined,
  now: number,
): DisplayModel {
  const q = questions[state.current];
  const revealed = state.phase === 'answer';
  return {
    view: q ? state.displayView : 'logo',
    packTitle,
    packDate,
    question: q && {
      number: q.number,
      tourTitle: q.tourTitle,
      text: q.text,
      handout: state.showHandout ? q.handout : undefined,
      media: q.media && { type: q.media.type, src: q.media.src },
      reveal: revealed
        ? { answer: q.answer, accepted: q.accepted, comment: q.comment, source: q.source, author: q.author }
        : undefined,
    },
    phase: state.phase,
    timer: { running: state.timer.running, remainingMs: remainingAt(state.timer, now) },
    mediaPlaying: state.mediaPlaying,
    results: standings(state).map((r) => ({
      id: r.team.id,
      name: r.team.name,
      place: r.place,
      placeNumber: r.placeNumber,
      total: r.total,
      rating: r.rating,
    })),
    sound: state.settings.sound,
    mainSeconds: q?.time ?? state.settings.seconds,
    questionKey: `${state.packTitle}#${state.current}`,
  };
}
