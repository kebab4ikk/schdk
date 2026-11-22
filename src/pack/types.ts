export type MediaType = 'image' | 'audio' | 'video';

export interface Media {
  type: MediaType;
  /** Resolved URL: blob: for ZIP media, otherwise whatever the pack gave (http(s): or data:). */
  src: string;
}

export interface Question {
  text: string;
  media?: Media;
  /** Shown only after the answer is revealed (an illustration for the comment). */
  answerMedia?: Media;
  handout?: string;
  answer: string;
  accepted?: string[];
  comment?: string;
  source?: string;
  author?: string;
  /** Seconds for discussion; overrides the game setting. */
  time?: number;
  /** Instructions for the host only (pronunciation, how to read); never shown to players. */
  hostNote?: string;
}

export interface Tour {
  title: string;
  questions: Question[];
}

export interface Pack {
  title: string;
  author?: string;
  date?: string;
  /** Instructions and preamble for the host; shown on the setup screen only. */
  notes?: string;
  tours: Tour[];
}

/** A question with its place in the pack, for flat navigation. */
export interface FlatQuestion extends Question {
  /** 0-based index across the whole pack. */
  index: number;
  /** 1-based number shown to players. */
  number: number;
  tourIndex: number;
  tourTitle: string;
}

export function flattenPack(pack: Pack): FlatQuestion[] {
  const out: FlatQuestion[] = [];
  pack.tours.forEach((tour, tourIndex) => {
    tour.questions.forEach((q) => {
      out.push({ ...q, index: out.length, number: out.length + 1, tourIndex, tourTitle: tour.title });
    });
  });
  return out;
}
