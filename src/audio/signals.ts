/**
 * Timer signals made with WebAudio, so the app ships no sound files and works offline.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function beep(freq: number, durationMs: number, delayMs = 0, volume = 0.3) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delayMs / 1000;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  // Short attack/release so the beep doesn't click.
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.setValueAtTime(volume, t0 + durationMs / 1000 - 0.03);
  gain.gain.linearRampToValueAtTime(0, t0 + durationMs / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

export const signals = {
  /** Discussion starts. */
  start: () => beep(880, 350),
  /** 10 seconds left. */
  warning: () => {
    beep(660, 150);
    beep(660, 150, 220);
  },
  /** Discussion over (and writing time starts, if enabled). */
  end: () => beep(440, 900),
  /** Writing time over. */
  writingEnd: () => {
    beep(523, 200);
    beep(392, 500, 250);
  },
  /** Unlock audio on a user gesture (browsers block audio until then). */
  unlock: () => {
    audio();
  },
};
