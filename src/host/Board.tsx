import { useEffect, useState, type ReactNode } from 'react';
import type { Action, GameState } from '../game/state';
import type { FlatQuestion } from '../pack/types';
import { useI18n } from '../i18n';
import { signals } from '../audio/signals';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
  questions: FlatQuestion[];
  /** The players' view, rendered by the caller. */
  display: ReactNode;
  /** Shows how to connect a smartboard; only inside the Android app. */
  onShowLink?: () => void;
}

/**
 * Full-screen touch mode for a single interactive screen (smartboard). Players see everything on
 * this screen, so nothing here may show an answer before it is revealed: the host keeps the
 * answers on paper or a phone, and marks teams only after the reveal.
 */
export function Board({ state, dispatch, questions, display, onShowLink }: Props) {
  const { t } = useI18n();
  const [sheet, setSheet] = useState<'none' | 'menu' | 'teams'>('none');
  const [armed, setArmed] = useState<string | null>(null);
  const [isFull, setIsFull] = useState(() => !!document.fullscreenElement);
  const q = questions[state.current];
  const correct = state.results[state.current] ?? [];
  const counting = state.phase === 'timer' || state.phase === 'writing';
  const last = state.current >= questions.length - 1;

  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // A disarmed "are you sure" button resets after a few seconds.
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(null), 3000);
    return () => window.clearTimeout(id);
  }, [armed]);
  // Close sheets and confirmations whenever the question changes.
  useEffect(() => {
    setSheet('none');
    setArmed(null);
  }, [state.current]);

  /** Runs `fn` on the second tap, so a stray touch can't reveal an answer or skip a question. */
  const confirmTap = (id: string, fn: () => void) => () => {
    if (armed === id) {
      setArmed(null);
      fn();
    } else setArmed(id);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const reveal = () => dispatch({ type: 'reveal' });
  const goto = (index: number) => dispatch({ type: 'goto', index });

  return (
    <div className="board">
      <div className="board-stage">{display}</div>

      <div className="board-bar" role="toolbar" aria-label={t('board.controls')}>
        <button className="b-menu" onClick={() => setSheet(sheet === 'menu' ? 'none' : 'menu')} aria-label={t('board.menu')}>
          ☰
        </button>
        <span className="b-num">
          {q ? t('game.question', { n: q.number }) : ''}
          <small>{t(`phase.${state.phase}`)}</small>
        </span>
        <span className="b-spacer" />

        {q?.media && q.media.type !== 'image' && (
          <button onClick={() => dispatch({ type: 'toggleMedia' })}>{state.mediaPlaying ? t('game.stopMedia') : t('game.playMedia')}</button>
        )}
        {q?.handout && (
          <button className={state.showHandout ? 'on' : ''} onClick={() => dispatch({ type: 'toggleHandout' })}>
            {t('game.handout')}
          </button>
        )}

        {state.phase === 'reading' && (
          <>
            <button disabled={state.current === 0} onClick={() => goto(state.current - 1)} aria-label={t('game.prev')}>
              ◀
            </button>
            <button className={armed === 'reveal' ? 'armed' : ''} onClick={confirmTap('reveal', reveal)}>
              {armed === 'reveal' ? t('board.sure') : t('board.answer')}
            </button>
            <button
              className="b-main"
              onClick={() => {
                signals.unlock();
                dispatch({ type: 'startPause', now: Date.now() });
              }}
            >
              ▶ {t('game.start')}
            </button>
          </>
        )}

        {counting && (
          <>
            <button className={armed === 'skip' ? 'armed' : ''} onClick={confirmTap('skip', () => dispatch({ type: 'skipTimer' }))}>
              {armed === 'skip' ? t('board.sure') : t('game.skip')}
            </button>
            <button className="b-main" onClick={() => dispatch({ type: 'startPause', now: Date.now() })}>
              {state.timer.running ? `⏸ ${t('game.pause')}` : `▶ ${t('game.resume')}`}
            </button>
          </>
        )}

        {state.phase === 'timeup' && (
          <button className="b-main" onClick={reveal}>
            {t('board.answer')}
          </button>
        )}

        {state.phase === 'answer' && (
          <>
            <button className={sheet === 'teams' ? 'on' : ''} onClick={() => setSheet(sheet === 'teams' ? 'none' : 'teams')}>
              ✓ {t('board.mark')} · {correct.length}/{state.teams.length}
            </button>
            <button
              className={state.displayView === 'results' ? 'on' : ''}
              onClick={() => dispatch({ type: 'displayView', view: state.displayView === 'results' ? 'question' : 'results' })}
            >
              {t('display.results')}
            </button>
            <button className="b-main" disabled={last} onClick={() => goto(state.current + 1)}>
              {t('board.next')} ▶
            </button>
          </>
        )}
      </div>

      {sheet === 'teams' && state.phase === 'answer' && (
        <div className="board-sheet" role="dialog" aria-label={t('game.correctTeams')}>
          <div className="sheet-head">
            <h2>{t('game.correctTeams')}</h2>
            <span>{t('game.correctCount', { n: correct.length, total: state.teams.length })}</span>
          </div>
          <div className="sheet-teams">
            {state.teams.map((team, i) => {
              const ok = correct.includes(team.id);
              return (
                <button
                  key={team.id}
                  className={ok ? 'ok' : ''}
                  aria-pressed={ok}
                  onClick={() => dispatch({ type: 'toggleCorrect', index: state.current, teamId: team.id })}
                >
                  <span className="n">{i + 1}</span>
                  <span className="name">{team.name}</span>
                  <span className="tick">{ok ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>
          <div className="sheet-foot">
            <button onClick={() => dispatch({ type: 'setCorrect', index: state.current, teamIds: [] })}>{t('game.none')}</button>
            <button className="b-main" onClick={() => setSheet('none')}>
              {t('board.done')}
            </button>
          </div>
        </div>
      )}

      {sheet === 'menu' && (
        <div className="board-sheet" role="dialog" aria-label={t('board.menu')}>
          <div className="sheet-head">
            <h2>{t('board.menu')}</h2>
          </div>
          <div className="sheet-menu">
            <button onClick={toggleFullscreen}>{isFull ? t('board.exitFullscreen') : t('board.fullscreen')}</button>
            {onShowLink && (
              <button
                onClick={() => {
                  setSheet('none');
                  onShowLink();
                }}
              >
                📺 {t('remote.connect')}
              </button>
            )}
            {(['question', 'results', 'logo'] as const).map((v) => (
              <button
                key={v}
                className={state.displayView === v ? 'on' : ''}
                onClick={() => {
                  dispatch({ type: 'displayView', view: v });
                  setSheet('none');
                }}
              >
                {t('display.show')} {t(`display.${v}`)}
              </button>
            ))}
            {state.phase !== 'reading' && (
              <button
                onClick={() => {
                  dispatch({ type: 'resetTimer' });
                  setSheet('none');
                }}
              >
                ↺ {t('game.resetTimer')}
              </button>
            )}
            <button className={armed === 'exit' ? 'armed' : ''} onClick={confirmTap('exit', () => dispatch({ type: 'screen', screen: 'setup' }))}>
              {armed === 'exit' ? t('board.sure') : t('board.exit')}
            </button>
          </div>
          <h3>{t('board.goto')}</h3>
          <div className="sheet-questions">
            {questions.map((qq) => (
              <button
                key={qq.index}
                className={`${qq.index === state.current ? 'on' : ''} ${qq.index in state.results ? 'played' : ''}`}
                onClick={() => goto(qq.index)}
              >
                {qq.number}
              </button>
            ))}
          </div>
          <div className="sheet-foot">
            <button className="b-main" onClick={() => setSheet('none')}>
              {t('board.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
