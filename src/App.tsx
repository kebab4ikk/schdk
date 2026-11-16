import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { initialState, isPlayScreen, parseSavedState, reducer, remainingAt, type Action, type GameState } from './game/state';
import { flattenPack, type FlatQuestion, type Pack } from './pack/types';
import { loadPackBytes, PackError, type PackIssue } from './pack/load';
import { loadPackFile, savePackFile } from './pack/cache';
import { signals } from './audio/signals';
import { useSignals } from './audio/useSignals';
import { buildDisplayModel } from './display/model';
import { useRemoteScreen } from './remote/useRemoteScreen';
import { RemoteLink } from './remote/RemoteLink';
import { useI18n } from './i18n';
import { DisplayPortal, useDisplayWindow } from './display/DisplayWindow';
import { Display } from './display/Display';
import { Setup } from './host/Setup';
import { Game } from './host/Game';
import { Results } from './host/Results';
import { Board } from './host/Board';

const STATE_KEY = 'schdk.state.v1';

function loadInitial(): GameState {
  try {
    return parseSavedState(localStorage.getItem(STATE_KEY)) ?? initialState();
  } catch {
    return initialState();
  }
}

export interface LoadedPackState {
  pack: Pack;
  questions: FlatQuestion[];
  fileName: string;
}

export function App() {
  const { t, lang, setLang } = useI18n();
  const [state, rawDispatch] = useReducer(reducer, undefined, loadInitial);
  const [pack, setPack] = useState<LoadedPackState | null>(null);
  const [packIssues, setPackIssues] = useState<PackIssue[]>([]);
  const [packLoading, setPackLoading] = useState(true);
  const objectUrls = useRef<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const questions = pack?.questions ?? [];
  const current = questions[state.current];
  const qTime = current?.time;

  /** Every action that resets a timer needs the target question's own time limit. */
  const dispatch = useCallback(
    (a: Action) => {
      if (a.type === 'goto') a = { ...a, questionTime: questions[a.index]?.time };
      if (a.type === 'resetTimer' || a.type === 'settings') a = { ...a, questionTime: qTime };
      if (a.type === 'newGame') a = { ...a, questionTime: questions[0]?.time };
      rawDispatch(a);
    },
    [questions, qTime],
  );

  // Save the game on every change, so a reload or crash loses nothing.
  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: the game still runs */
    }
  }, [state]);

  const applyPackBytes = useCallback(async (data: ArrayBuffer, fileName: string, persist: boolean) => {
    setPackLoading(true);
    try {
      const loaded = await loadPackBytes(data);
      objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrls.current = loaded.objectUrls;
      const flat = flattenPack(loaded.pack);
      setPack({ pack: loaded.pack, questions: flat, fileName });
      setPackIssues([]);
      rawDispatch({
        type: 'loadPack',
        title: loaded.pack.title || fileName,
        questionCount: flat.length,
        questionTimes: flat.map((q) => q.time),
      });
      if (persist) await savePackFile({ name: fileName, data });
    } catch (e) {
      setPackIssues(e instanceof PackError ? e.issues : [{ key: 'err.unknown', params: { msg: String((e as Error)?.message ?? e) } }]);
    } finally {
      setPackLoading(false);
    }
  }, []);

  // Restore the last pack after a reload.
  useEffect(() => {
    let cancelled = false;
    void loadPackFile().then((cached) => {
      if (cancelled) return;
      if (cached) void applyPackBytes(cached.data, cached.name, false);
      else setPackLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [applyPackBytes]);

  const onPackFile = useCallback(
    async (file: File) => {
      signals.unlock();
      await applyPackBytes(await file.arrayBuffer(), file.name, true);
    },
    [applyPackBytes],
  );

  // Clock: fast while counting down, slow otherwise.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), state.timer.running ? 100 : 1000);
    return () => window.clearInterval(id);
  }, [state.timer.running]);

  useEffect(() => {
    if (state.timer.running) rawDispatch({ type: 'tick', now });
  }, [now, state.timer.running]);

  // Keyboard shortcuts, shared by the host and display windows.
  const stateRef = useRef(state);
  stateRef.current = state;
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!isPlayScreen(s.screen) || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      const key = e.key;
      let handled = true;
      if (key === ' ') {
        signals.unlock();
        if (s.phase === 'timeup') dispatch({ type: 'reveal' });
        else dispatch({ type: 'startPause', now: Date.now() });
      } else if (key === 'Enter') dispatch({ type: 'reveal' });
      else if (key === 'ArrowRight' || key === 'PageDown') dispatch({ type: 'goto', index: s.current + 1 });
      else if (key === 'ArrowLeft' || key === 'PageUp') dispatch({ type: 'goto', index: s.current - 1 });
      else if (/^[0-9]$/.test(key)) {
        const idx = key === '0' ? 9 : Number(key) - 1;
        const team = s.teams[idx];
        if (team && s.phase === 'answer') dispatch({ type: 'toggleCorrect', index: s.current, teamId: team.id });
        else handled = false;
      } else if (key.toLowerCase() === 'h' || key.toLowerCase() === 'р') dispatch({ type: 'toggleHandout' });
      else if (key.toLowerCase() === 'm' || key.toLowerCase() === 'ь') dispatch({ type: 'toggleMedia' });
      else if (key.toLowerCase() === 't' || key.toLowerCase() === 'е')
        dispatch({ type: 'displayView', view: s.displayView === 'results' ? 'question' : 'results' });
      else handled = false;
      if (handled) e.preventDefault();
    },
    [dispatch],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  const packTitle = pack?.pack.title || pack?.fileName || state.packTitle || '';
  const display = useDisplayWindow(onKeyDown, `${t('app.title')} — ${packTitle}`);

  const packDate = pack?.pack.date;
  const getModel = useCallback(
    () => buildDisplayModel(state, questions, packTitle, packDate, Date.now()),
    [state, questions, packTitle, packDate],
  );
  const model = useMemo(() => getModel(), [getModel]);
  const remaining = remainingAt(state.timer, now);

  // The smartboard, when this page runs inside the Android app.
  const remote = useRemoteScreen(getModel, lang, getModel);
  const [showLink, setShowLink] = useState(false);

  // Beeps come from the board when one is connected (it has the room's speakers).
  useSignals({
    enabled: state.settings.sound && remote.displays === 0,
    phase: state.phase,
    running: state.timer.running,
    remainingMs: remaining,
    mainSeconds: qTime ?? state.settings.seconds,
    questionKey: model.questionKey,
  });

  const displayEl = useMemo(
    () => (playsMedia: boolean) => <Display model={model} remainingMs={remaining} playsMedia={playsMedia} />,
    [model, remaining],
  );
  const linkModal = showLink && <RemoteLink remote={remote} onClose={() => setShowLink(false)} />;

  const canPlay = !!pack && state.teams.length > 0;

  if (state.screen === 'board' && current) {
    return (
      <>
        <Board
          state={state}
          dispatch={dispatch}
          questions={questions}
          display={displayEl(!display.isOpen && remote.displays === 0)}
          onShowLink={remote.available ? () => setShowLink(true) : undefined}
        />
        {linkModal}
        <DisplayPortal container={display.container}>{displayEl(true)}</DisplayPortal>
      </>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">?</span>
          <div>
            <div className="brand-title">{t('app.title')}</div>
            <div className="brand-sub">{packTitle || t('app.subtitle')}</div>
          </div>
        </div>
        <nav className="tabs">
          {(['setup', 'game', 'results'] as const).map((s) => (
            <button
              key={s}
              className={state.screen === s ? 'active' : ''}
              disabled={s === 'game' && !canPlay}
              onClick={() => dispatch({ type: 'screen', screen: s })}
            >
              {t(`nav.${s}`)}
            </button>
          ))}
        </nav>
        <div className="topbar-actions">
          {remote.available && (
            <button className={remote.displays > 0 ? 'ok' : 'primary'} onClick={() => setShowLink(true)} data-testid="remote-button">
              📺 {remote.displays > 0 ? t('remote.connected', { n: remote.displays }) : t('remote.connect')}
            </button>
          )}
          {remote.available ? null : display.isOpen ? (
            <button onClick={display.close}>{t('display.close')}</button>
          ) : (
            <button className="primary" onClick={display.open}>
              🖥 {t('display.open')}
            </button>
          )}
          <button className="ghost" onClick={() => setLang(lang === 'uk' ? 'en' : 'uk')}>
            {t('lang.switch')}
          </button>
        </div>
      </header>
      {display.blocked && <div className="banner warn">{t('display.blocked')}</div>}
      {linkModal}

      {state.screen === 'setup' && (
        <Setup
          state={state}
          dispatch={dispatch}
          pack={pack}
          packIssues={packIssues}
          packLoading={packLoading}
          onPackFile={onPackFile}
          canPlay={canPlay}
        />
      )}
      {state.screen === 'game' && current && (
        <Game state={state} dispatch={dispatch} questions={questions} now={now} preview={displayEl(!display.isOpen && remote.displays === 0)} />
      )}
      {isPlayScreen(state.screen) && !current &&<div className="banner warn">{t('setup.needPack')}</div>}
      {state.screen === 'results' && <Results state={state} dispatch={dispatch} packTitle={packTitle} />}

      <DisplayPortal container={display.container}>{displayEl(true)}</DisplayPortal>
    </div>
  );
}
