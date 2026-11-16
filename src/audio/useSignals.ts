import { useEffect, useRef } from 'react';
import type { Phase } from '../game/state';
import { signals } from './signals';

/**
 * Plays the timer signals: on start, at 10 s left (once per question, only for countdowns
 * longer than 15 s), at the end of discussion and at the end of writing time.
 * Used by whichever device has the room's speakers.
 */
export function useSignals(opts: {
  enabled: boolean;
  phase: Phase;
  running: boolean;
  remainingMs: number;
  mainSeconds: number;
  /** Identifies the current question; the 10-second warning resets when it changes. */
  questionKey: string;
}) {
  const { enabled, phase, running, remainingMs, mainSeconds, questionKey } = opts;
  const prevPhase = useRef(phase);
  const warned = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = phase;
    if (!enabled || prev === phase) return;
    if (prev === 'reading' && phase === 'timer') signals.start();
    else if (prev === 'timer' && (phase === 'writing' || phase === 'timeup')) signals.end();
    else if (prev === 'writing' && phase === 'timeup') signals.writingEnd();
  }, [phase, enabled]);

  useEffect(() => {
    if (phase === 'reading') warned.current = null;
  }, [phase, questionKey]);

  useEffect(() => {
    if (phase !== 'timer' || !running) return;
    if (remainingMs <= 10_000 && remainingMs > 0 && mainSeconds > 15 && warned.current !== questionKey) {
      warned.current = questionKey;
      if (enabled) signals.warning();
    }
  }, [remainingMs, phase, running, mainSeconds, questionKey, enabled]);
}
