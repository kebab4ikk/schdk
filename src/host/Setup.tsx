import { useRef, useState } from 'react';
import type { Action, GameState } from '../game/state';
import type { PackIssue } from '../pack/load';
import type { LoadedPackState } from '../App';
import { useI18n } from '../i18n';
import { signals } from '../audio/signals';

interface Props {
  state: GameState;
  dispatch: (a: Action) => void;
  pack: LoadedPackState | null;
  packIssues: PackIssue[];
  packLoading: boolean;
  onPackFile: (f: File) => void;
  canPlay: boolean;
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function Setup({ state, dispatch, pack, packIssues, packLoading, onPackFile, canPlay }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const addTeams = (names: string[]) => dispatch({ type: 'addTeams', names, ids: names.map(newId) });
  const started = Object.keys(state.results).length > 0 || state.current > 0;
  const s = state.settings;

  return (
    <main className="page setup">
      <section className="card">
        <h2>{t('setup.pack')}</h2>
        <div className="row">
          <button className="primary" onClick={() => fileRef.current?.click()} disabled={packLoading}>
            📂 {t('setup.loadPack')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            hidden
            data-testid="pack-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPackFile(f);
              e.target.value = '';
            }}
          />
          {packLoading && <span className="muted">{t('setup.loading')}</span>}
        </div>
        {pack ? (
          <div className="pack-summary">
            <div className="pack-title">{pack.pack.title || pack.fileName}</div>
            <div className="muted">
              {t('setup.packInfo', { tours: pack.pack.tours.length, questions: pack.questions.length })}
              {pack.pack.author && <> · {t('setup.packBy', { author: pack.pack.author })}</>}
              {pack.pack.date && <> · {pack.pack.date}</>}
            </div>
          </div>
        ) : (
          !packLoading && (
            <p className="muted">
              {state.packTitle ? t('setup.packReloadNeeded', { title: state.packTitle }) : t('setup.noPack')}
            </p>
          )
        )}
        {packIssues.length > 0 && (
          <div className="issues" role="alert">
            <b>{t('setup.packErrors')}</b>
            <ul>
              {packIssues.slice(0, 30).map((i, k) => (
                <li key={k}>{t(i.key, i.params)}</li>
              ))}
              {packIssues.length > 30 && <li>… +{packIssues.length - 30}</li>}
            </ul>
          </div>
        )}
        <p className="hint">{t('setup.formatHelp')}</p>
      </section>

      <section className="card">
        <h2>
          {t('setup.teams')} <span className="count">{state.teams.length}</span>
        </h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            addTeams([name]);
            setName('');
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('setup.teamName')} aria-label={t('setup.teamName')} />
          <button type="submit" disabled={!name.trim()}>
            {t('setup.addTeam')}
          </button>
        </form>
        {state.teams.length === 0 ? (
          <p className="muted">{t('setup.noTeams')}</p>
        ) : (
          <ol className="team-list">
            {state.teams.map((team, i) => (
              <li key={team.id}>
                <span className="team-num">{i + 1}</span>
                <input
                  defaultValue={team.name}
                  key={team.name}
                  aria-label={t('setup.teamName')}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== team.name) dispatch({ type: 'renameTeam', id: team.id, name: e.target.value });
                    else e.target.value = team.name;
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                <button className="icon" title="↑" disabled={i === 0} onClick={() => dispatch({ type: 'moveTeam', id: team.id, delta: -1 })}>
                  ↑
                </button>
                <button
                  className="icon"
                  title="↓"
                  disabled={i === state.teams.length - 1}
                  onClick={() => dispatch({ type: 'moveTeam', id: team.id, delta: 1 })}
                >
                  ↓
                </button>
                <button
                  className="icon danger"
                  title={t('setup.remove')}
                  onClick={() => confirm(t('setup.removeConfirm', { name: team.name })) && dispatch({ type: 'removeTeam', id: team.id })}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
        )}
        <details>
          <summary>{t('setup.bulkAdd')}</summary>
          <textarea rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label={t('setup.bulkAdd')} />
          <button
            disabled={!bulk.trim()}
            onClick={() => {
              addTeams(bulk.split(/\r?\n/));
              setBulk('');
            }}
          >
            {t('setup.bulkAddBtn')}
          </button>
        </details>
      </section>

      <section className="card">
        <h2>{t('setup.settings')}</h2>
        <label className="field">
          <span>{t('setup.seconds')}</span>
          <input
            type="number"
            min={1}
            max={3600}
            value={s.seconds}
            onChange={(e) => dispatch({ type: 'settings', patch: { seconds: Number(e.target.value) } })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.writingEnabled}
            onChange={(e) => dispatch({ type: 'settings', patch: { writingEnabled: e.target.checked } })}
          />
          <span>{t('setup.writing')}</span>
        </label>
        {s.writingEnabled && (
          <label className="field">
            <span>{t('setup.writingSeconds')}</span>
            <input
              type="number"
              min={1}
              max={600}
              value={s.writingSeconds}
              onChange={(e) => dispatch({ type: 'settings', patch: { writingSeconds: Number(e.target.value) } })}
            />
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={s.sound} onChange={(e) => dispatch({ type: 'settings', patch: { sound: e.target.checked } })} />
          <span>{t('setup.sound')}</span>
        </label>
        <button className="ghost" onClick={() => signals.start()}>
          🔔 {t('setup.testSound')}
        </button>
      </section>

      <section className="card start-card">
        {!pack && <p className="muted">{t('setup.needPack')}</p>}
        {pack && state.teams.length === 0 && <p className="muted">{t('setup.needTeams')}</p>}
        <div className="row">
          <button
            className="primary big"
            disabled={!canPlay}
            onClick={() => {
              signals.unlock();
              dispatch({ type: 'screen', screen: 'game' });
            }}
          >
            ▶ {started ? t('setup.continue') : t('setup.start')}
          </button>
          {started && (
            <button className="danger" onClick={() => confirm(t('setup.newGameConfirm')) && dispatch({ type: 'newGame' })}>
              {t('setup.newGame')}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
