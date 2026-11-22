import type { ReactNode } from 'react';
import { remainingAt, type Action, type GameState } from '../game/state';
import { questionRating } from '../game/scoring';
import type { FlatQuestion } from '../pack/types';
import { useI18n } from '../i18n';
import { formatTime } from '../display/Display';
import { signals } from '../audio/signals';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
  questions: FlatQuestion[];
  now: number;
  preview: ReactNode;
}

export function Game({ state, dispatch, questions, now, preview }: Props) {
  const { t } = useI18n();
  const q = questions[state.current];
  const correct = state.results[state.current] ?? [];
  const removed = state.removed.includes(state.current);
  const remaining = remainingAt(state.timer, now);
  const revealed = state.phase === 'answer';
  const counting = state.phase === 'timer' || state.phase === 'writing';

  return (
    <main className="page game">
      <section className="card question-card">
        <div className="q-head">
          <h2>
            {t('game.question', { n: q.number })} <span className="muted">{t('game.of', { total: questions.length })}</span>
          </h2>
          {q.tourTitle && <span className="pill">{q.tourTitle}</span>}
        </div>

        {q.media && (
          <div className="q-media">
            {q.media.type === 'image' ? (
              <img src={q.media.src} alt="" />
            ) : (
              <button onClick={() => dispatch({ type: 'toggleMedia' })}>{state.mediaPlaying ? t('game.stopMedia') : t('game.playMedia')}</button>
            )}
            {q.media.type === 'video' && <span className="muted"> 🎬</span>}
          </div>
        )}
        {q.handout && (
          <div className="q-handout">
            <div className="label">{t('game.handout')}</div>
            <div>{q.handout}</div>
            <button className="small" onClick={() => dispatch({ type: 'toggleHandout' })}>
              {state.showHandout ? t('game.hideHandout') : t('game.showHandout')}
            </button>
          </div>
        )}
        {q.hostNote && (
          <div className="q-hostnote">
            <div className="label">{t('game.hostNote')}</div>
            <div>{q.hostNote}</div>
          </div>
        )}
        <p className="q-text">{q.text}</p>

        <div className="q-answer">
          <div className="label">{t('game.answer')}</div>
          <div className="answer">{q.answer}</div>
          {q.accepted && (
            <div>
              <b>{t('game.accepted')}:</b> {q.accepted.join('; ')}
            </div>
          )}
          {q.comment && (
            <div>
              <b>{t('game.comment')}:</b> {q.comment}
            </div>
          )}
          {q.answerMedia?.type === 'image' && <img className="q-answer-media" src={q.answerMedia.src} alt="" />}
          {q.answerMedia && q.answerMedia.type !== 'image' && <div className="muted">🎬 {t('game.answerMediaNote')}</div>}
          {q.source && (
            <div className="muted pre-line">
              {t('game.source')}: {q.source}
            </div>
          )}
          {q.author && (
            <div className="muted">
              {t('game.author')}: {q.author}
            </div>
          )}
        </div>

        <div className="row nav-row">
          <button disabled={state.current === 0} onClick={() => dispatch({ type: 'goto', index: state.current - 1 })}>
            {t('game.prev')}
          </button>
          <button
            className={revealed ? 'primary' : ''}
            disabled={state.current >= questions.length - 1}
            onClick={() => dispatch({ type: 'goto', index: state.current + 1 })}
          >
            {t('game.next')}
          </button>
          <span className="spacer" />
          <button className="ghost small" onClick={() => dispatch({ type: 'toggleRemoved', index: state.current })}>
            {removed ? t('game.restoreQuestion') : t('game.removeQuestion')}
          </button>
        </div>
        {removed && <div className="banner warn">{t('game.removedNote')}</div>}
      </section>

      <aside className="side">
        <section className={`card timer-card phase-${state.phase}`}>
          <div className="phase-label">{t(`phase.${state.phase}`)}</div>
          <div className={`timer ${state.phase === 'writing' ? 'writing' : counting && remaining <= 10_000 ? 'warn' : ''}`} data-testid="timer">
            {state.phase === 'timeup' || state.phase === 'answer' ? '0' : formatTime(remaining)}
          </div>
          <div className="row">
            {state.phase === 'reading' && (
              <button
                className="primary big"
                onClick={() => {
                  signals.unlock();
                  dispatch({ type: 'startPause', now: Date.now() });
                }}
              >
                ▶ {t('game.start')}
              </button>
            )}
            {counting && (
              <button className="big" onClick={() => dispatch({ type: 'startPause', now: Date.now() })}>
                {state.timer.running ? `⏸ ${t('game.pause')}` : `▶ ${t('game.resume')}`}
              </button>
            )}
            {counting && <button onClick={() => dispatch({ type: 'skipTimer' })}>{t('game.skip')}</button>}
            {state.phase !== 'answer' && (
              <button className={state.phase === 'timeup' ? 'primary big' : ''} onClick={() => dispatch({ type: 'reveal' })}>
                {t('game.reveal')}
              </button>
            )}
            {state.phase !== 'reading' && (
              <button className="ghost small" onClick={() => dispatch({ type: 'resetTimer' })}>
                ↺ {t('game.resetTimer')}
              </button>
            )}
          </div>
        </section>

        <section className="card teams-card">
          <div className="row between">
            <h3>{t('game.correctTeams')}</h3>
            <span className="muted">
              {t('game.correctCount', { n: correct.length, total: state.teams.length })}
              {revealed && state.teams.length > 0 && <> · {t('game.rating', { r: questionRating(state.teams.length, correct.length) })}</>}
            </span>
          </div>
          {state.teams.length === 0 && <p className="muted">{t('game.noTeams')}</p>}
          {!revealed && state.teams.length > 0 && <p className="hint">{t('game.markAfterReveal')}</p>}
          <div className="team-grid">
            {state.teams.map((team, i) => {
              const ok = correct.includes(team.id);
              return (
                <button
                  key={team.id}
                  className={`team-toggle ${ok ? 'ok' : ''}`}
                  disabled={!revealed}
                  aria-pressed={ok}
                  onClick={() => dispatch({ type: 'toggleCorrect', index: state.current, teamId: team.id })}
                >
                  <span className="team-num">{i < 10 ? (i + 1) % 10 : i + 1}</span>
                  <span className="team-name">{team.name}</span>
                  <span className="tick">{ok ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>
          {revealed && state.teams.length > 0 && (
            <div className="row">
              <button className="small" onClick={() => dispatch({ type: 'setCorrect', index: state.current, teamIds: state.teams.map((x) => x.id) })}>
                {t('game.all')}
              </button>
              <button className="small" onClick={() => dispatch({ type: 'setCorrect', index: state.current, teamIds: [] })}>
                {t('game.none')}
              </button>
            </div>
          )}
        </section>

        <section className="card preview-card">
          <div className="row between">
            <h3>{t('display.preview')}</h3>
            <div className="seg" role="group" aria-label={t('display.show')}>
              {(['question', 'results', 'logo'] as const).map((v) => (
                <button key={v} className={state.displayView === v ? 'active' : ''} onClick={() => dispatch({ type: 'displayView', view: v })}>
                  {t(`display.${v}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="preview-frame">
            <div className="preview-scale">{preview}</div>
          </div>
        </section>

        <details className="card shortcuts">
          <summary>{t('shortcuts.title')}</summary>
          <ul>
            {(['space', 'enter', 'arrows', 'digits', 'h', 'm', 't'] as const).map((k) => (
              <li key={k}>{t(`shortcuts.${k}`)}</li>
            ))}
          </ul>
        </details>
      </aside>

      <nav className="card q-strip" aria-label="questions">
        {questions.map((qq) => {
          const played = qq.index in state.results;
          const isRemoved = state.removed.includes(qq.index);
          return (
            <button
              key={qq.index}
              className={`q-dot ${qq.index === state.current ? 'current' : ''} ${played ? 'played' : ''} ${isRemoved ? 'removed' : ''}`}
              title={qq.tourTitle}
              onClick={() => dispatch({ type: 'goto', index: qq.index })}
            >
              {qq.number}
            </button>
          );
        })}
      </nav>
    </main>
  );
}
