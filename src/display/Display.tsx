import { useEffect, useRef, useState } from 'react';
import type { FlatQuestion, Media } from '../pack/types';
import { remainingAt, type GameState } from '../game/state';
import { standings } from '../game/scoring';
import { useI18n } from '../i18n';

interface Props {
  state: GameState;
  questions: FlatQuestion[];
  packTitle: string;
  packDate?: string;
  now: number;
  /** Whether this copy plays audio/video (only one copy should, to avoid double sound). */
  playsMedia: boolean;
}

export function formatTime(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : String(s);
}

/** Bigger letters for shorter questions, so text fills the screen but always fits. */
function textSizeClass(text: string): string {
  const n = text.length;
  if (n < 120) return 'size-xl';
  if (n < 260) return 'size-l';
  if (n < 450) return 'size-m';
  return 'size-s';
}

export function Display({ state, questions, packTitle, packDate, now, playsMedia }: Props) {
  const { t } = useI18n();
  const q = questions[state.current];

  if (state.displayView === 'logo' || !q) {
    return (
      <div className="display">
        <div className="display-logo">
          <div className="logo-mark">?</div>
          <h1>Що? Де? Коли?</h1>
          {packTitle && <p className="logo-pack">{packTitle}</p>}
          {packDate && <p className="logo-date">{packDate}</p>}
        </div>
      </div>
    );
  }

  if (state.displayView === 'results') return <DisplayResults state={state} />;

  const revealed = state.phase === 'answer';
  const remaining = remainingAt(state.timer, now);
  const showTimer = state.phase === 'timer' || state.phase === 'writing' || state.phase === 'timeup';

  return (
    <div className={`display phase-${state.phase}`}>
      <header className="display-head">
        <span className="display-number">{t('game.question', { n: q.number })}</span>
        {q.tourTitle && <span className="display-tour">{q.tourTitle}</span>}
      </header>

      <main className={`display-main ${revealed ? 'with-answer' : ''}`}>
        {q.media && <MediaView media={q.media} playing={state.mediaPlaying} active={playsMedia} />}
        {state.showHandout && q.handout && <div className="display-handout">{q.handout}</div>}
        {q.text && <div className={`display-text ${revealed ? 'size-s' : textSizeClass(q.text)}`}>{q.text}</div>}

        {revealed && (
          <section className="display-answer">
            <div className="answer-label">{t('game.answer')}</div>
            <div className="answer-text">{q.answer}</div>
            {q.accepted && (
              <div className="answer-extra">
                <b>{t('game.accepted')}:</b> {q.accepted.join('; ')}
              </div>
            )}
            {q.comment && <div className="answer-extra">{q.comment}</div>}
            {(q.source || q.author) && (
              <div className="answer-meta">
                {q.source && (
                  <span>
                    {t('game.source')}: {q.source}
                  </span>
                )}
                {q.author && (
                  <span>
                    {t('game.author')}: {q.author}
                  </span>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {showTimer && (
        <footer className="display-timer">
          {state.phase === 'timeup' ? (
            <span className="timer-big timeup">{t('display.timeup')}</span>
          ) : (
            <>
              <span className={`timer-big ${state.phase === 'writing' ? 'writing' : remaining <= 10_000 ? 'warn' : ''}`}>
                {formatTime(remaining)}
              </span>
              {state.phase === 'writing' && <span className="timer-label">{t('display.writing')}</span>}
            </>
          )}
        </footer>
      )}
    </div>
  );
}

function MediaView({ media, playing, active }: { media: Media; playing: boolean; active: boolean }) {
  const ref = useRef<HTMLMediaElement>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (playing && active) {
      el.muted = false;
      el.play().catch(() => {
        // Autoplay with sound blocked in this window: play muted rather than not at all.
        el.muted = true;
        setMuted(true);
        void el.play().catch(() => undefined);
      });
    } else {
      el.pause();
    }
  }, [playing, active, media.src]);

  if (media.type === 'image') return <img className="display-media" src={media.src} alt="" />;
  if (media.type === 'video') {
    return (
      <div className="display-media-wrap">
        <video ref={ref as React.RefObject<HTMLVideoElement>} className="display-media" src={media.src} playsInline muted={!active} />
        {muted && <span className="media-muted">🔇</span>}
      </div>
    );
  }
  return (
    <div className={`display-audio ${playing ? 'playing' : ''}`}>
      <span aria-hidden>{playing ? '🔊' : '🎵'}</span>
      <audio ref={ref as React.RefObject<HTMLAudioElement>} src={media.src} />
    </div>
  );
}

function DisplayResults({ state }: { state: GameState }) {
  const { t } = useI18n();
  const rows = standings(state);
  // Split long tables into two columns so up to ~40 teams fit on one screen.
  const split = rows.length > 16 ? Math.ceil(rows.length / 2) : rows.length;
  const cols = split < rows.length ? [rows.slice(0, split), rows.slice(split)] : [rows];
  return (
    <div className="display display-results-view">
      <h1>{t('results.title')}</h1>
      <div className={`display-results cols-${cols.length} ${rows.length > 10 ? 'dense' : ''}`}>
        {cols.map((col, ci) => (
          <table key={ci}>
            <thead>
              <tr>
                <th>{t('results.place')}</th>
                <th className="team">{t('results.team')}</th>
                <th>{t('results.total')}</th>
                <th>{t('results.rating')}</th>
              </tr>
            </thead>
            <tbody>
              {col.map((r) => (
                <tr key={r.team.id} className={r.placeNumber <= 3 ? `top top-${r.placeNumber}` : ''}>
                  <td>{r.place}</td>
                  <td className="team">{r.team.name}</td>
                  <td className="total">{r.total}</td>
                  <td>{r.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}
