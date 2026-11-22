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
    reveal?: {
      answer: string;
      comment?: string;
      source?: string;
      author?: string;
      media?: { type: MediaType; src: string };
    };
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

/**
 * Removes reader's notes in square brackets ("IT-фахівець [айті-фахівець]", "[Ведучим: …]"):
 * in ЧГК packs they are for whoever reads aloud, never for the players' screen.
 */
export function forPlayers(text: string): string;
export function forPlayers(text: string | undefined): string | undefined;
export function forPlayers(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  return text
    .replace(/\s*\[[^\]\n]*\]/g, '')
    .replace(/[ \t]+([,.;:!?…»)])/g, '$1')
    .trim();
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
      text: forPlayers(q.text),
      handout: state.showHandout ? q.handout : undefined,
      media: q.media && { type: q.media.type, src: q.media.src },
      reveal: revealed
        ? {
            // "Залік" (other accepted answers) is for the host's checking only, never for players.
            answer: forPlayers(q.answer),
            comment: forPlayers(q.comment),
            source: q.source,
            author: q.author,
            media: q.answerMedia && { type: q.answerMedia.type, src: q.answerMedia.src },
          }
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
